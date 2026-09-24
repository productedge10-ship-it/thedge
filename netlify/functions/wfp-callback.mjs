/* ==================================================================
   Відповідь WayForPay про результат платежу (serviceUrl).

   Це єдине місце в усьому застосунку, яке відкриває Pro.

   Не returnUrl — туди браузер може й не доїхати: людина закриє
   вкладку одразу після оплати, і підписки не буде. І, головне, туди
   може доїхати будь-хто: відкрити /app?paid=1 руками вміє кожен.

   Тому доступ дає тільки цей обробник, і тільки після перевірки
   підпису. Без неї адреса колбека — публічна кнопка «видати собі
   підписку»: вона відома всім, хто хоч раз подивився в DevTools
   на сторінці оплати.

   --------------------------------------------------------------
   Чому обробник такий обережний зі статусами.

   WayForPay шле повідомлення не «про оплату», а про КОЖНУ зміну
   стану замовлення: InProcessing, Pending, Approved, Refunded,
   Voided, Expired, Declined… Перша версія ділила світ на «Approved»
   і «все інше = відмова». На практиці це виглядало так: людина
   оплатила ₴1 за перевірку картки, отримала тріал, через 18 хвилин
   гривню їй повернули (Refunded) — і обробник, побачивши «не
   Approved», записав оплачене замовлення як відхилене й відкотив
   доступ. Реальний випадок, 22.09.2026.

   Тому тут три правила:

   1. Кожен статус обробляється за своїм змістом. Проміжні стани
      (InProcessing, Pending, WaitingAuthComplete) не змінюють
      нічого — вони лише кажуть, що справа ще йде.
   2. Застарілі й повторні повідомлення ігноруються. WayForPay
      повторює той самий запит до чотирьох діб, поки не отримає
      «accept», а мережа може привезти старе повідомлення пізніше
      за нове. Порівнюємо processingDate з уже застосованим.
   3. Вид платежу визначається СУМОЮ, а не станом замовлення. Раніше
      тріал упізнавався за status === 'trial', а після першої оплати
      статус ставав 'approved' — і повтор того самого повідомлення
      про ₴1 видавав уже повний місяць Pro.

   --------------------------------------------------------------
   Відповідати теж треба підписано. Якщо WayForPay не отримає
   правильну відповідь, він шле цей самий запит чотири доби поспіль.
   Цим і користуємось навмисно: якщо запис у базу не вдався,
   відповідаємо 500 — і подія не губиться, WayForPay повторить її.
================================================================== */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/* Сума перевірки картки при тріалі. Дзеркало TRIAL_HOLD у billing.js
   і в wfp-pay.mjs — однакова в будь-якій валюті, бо це «одиниця»,
   а не ціна. */
const TRIAL_HOLD = 1;

/* Повна ціна періоду — щоб перевіряти, що регулярне списання
   справді на повну суму, а не на якусь іншу.

   Гривня лишається навмисно: замовлення, створені до переходу на
   долари, живуть далі, і їхні регулярні списання приходять у
   гривні. Викинути її звідси означало б тихо зламати підписку
   кожному, хто оформив її раніше. */
const PLAN_PRICE = {
  USD: { pro_monthly: 15, pro_yearly: 144 },
  UAH: { pro_monthly: 599, pro_yearly: 5990 },
};

const DAY = 86_400_000;

/* Порівняння в сталий час. Звичайне === на рядках виходить із циклу
   на першому розбіжному символі, і різниця в часі відповіді дає
   змогу підбирати підпис побайтово. Дорого й довго, але це відомий
   клас атак, і закривається він одним викликом. */
const sameSignature = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* До якої дати діє доступ після платежу.

   Відлік від пізнішого з двох: «зараз» або вже оплаченого кінця.
   Інакше списання, що прийшло за день до кінця тріалу, «з'їло» б
   цей день: новий місяць почався б від сьогодні, а не від дати, до
   якої людина вже мала доступ.

   Плюс доба запасу: якщо чергове списання застрягне на кілька
   годин, людина не має втратити доступ посеред торгового дня. Цю ж
   добу віднімаємо з бази, щоб запас не накопичувався з кожним
   місяцем. */
const extend = (currentUntil, period) => {
  const paidEnd = currentUntil ? new Date(currentUntil).getTime() - DAY : 0;
  const d = new Date(Math.max(Date.now(), paidEnd));

  if (period === 'trial') d.setDate(d.getDate() + 14);
  else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);

  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

/* Статуси за змістом, а не «Approved проти решти». */
const REFUND = new Set(['Refunded', 'Voided', 'RefundInProcessing']);
const FAILED = new Set(['Declined', 'Expired']);

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  const SECRET = process.env.WFP_SECRET_KEY;
  const hmac = (parts) => crypto
    .createHmac('md5', SECRET)
    .update(parts.join(';'), 'utf8')
    .digest('hex');

  /* Відповідь «прийнято». `accept` кажемо на будь-яке розібране
     повідомлення, навіть на відмову чи дубль: це підтвердження
     «отримано», а не «гроші зараховано». Інакше на кожне таке ми
     отримували б чотири доби повторів. */
  const accept = (orderReference) => {
    const time = Math.floor(Date.now() / 1000);
    return new Response(JSON.stringify({
      orderReference,
      status: 'accept',
      time,
      signature: hmac([orderReference, 'accept', time]),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  /* WayForPay шле JSON, але Content-Type у них буває
     form-urlencoded — тоді все тіло приїжджає єдиним рядком. */
  const raw = await req.text();
  let body = {};
  try {
    body = JSON.parse(raw);
  } catch {
    const params = new URLSearchParams(raw);
    const first = [...params.keys()][0];
    if (first && first.trim().startsWith('{')) {
      try { body = JSON.parse(first); } catch { body = {}; }
    } else {
      body = Object.fromEntries(params);
    }
  }

  const {
    merchantAccount, orderReference, amount, currency,
    authCode, cardPan, transactionStatus, reasonCode,
    recToken,
  } = body || {};

  if (!orderReference) return new Response(null, { status: 400 });

  const expected = hmac([
    merchantAccount, orderReference, amount, currency,
    authCode, cardPan, transactionStatus, reasonCode,
  ]);

  /* Без секрету підпис рахувався б від порожнього ключа — такий
     «підпис» може порахувати будь-хто. */
  if (!SECRET) {
    console.error('wfp callback: не задано WFP_SECRET_KEY');
    return new Response(null, { status: 500 });
  }

  /* Лист має бути про наш магазин. Підпис це вже гарантує, але
     зайва перевірка тут коштує один рядок. */
  const OUR = process.env.WFP_MERCHANT_ACCOUNT;
  if (OUR && merchantAccount !== OUR) {
    console.error('wfp callback: чужий merchantAccount', merchantAccount);
    return new Response(null, { status: 400 });
  }

  if (!sameSignature(expected, body.merchantSignature)) {
    console.error('wfp callback: підпис не збігся', orderReference);
    /* Навмисно без пояснень у тілі: тому, хто підбирає підпис, не
       треба підказувати, наскільки він близько. */
    return new Response(null, { status: 400 });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const findOrder = (ref) => admin
    .from('payment_orders')
    .select('id,user_id,plan,amount,currency,status,payload')
    .eq('reference', ref)
    .maybeSingle();

  /* Спершу точний номер. Якщо не знайшли — номер без суфікса.

     Про регулярні списання документація WayForPay мовчить, з яким
     номером вони приходять: з тим самим, що й перша оплата, чи з
     доданим хвостом. Наші номери підкреслень не містять
     (EJ-XXXX-XXXX), тож усе після першого «_» — точно не наше, і
     відрізавши його, ми знаходимо початкове замовлення в обох
     випадках. */
  let { data: order } = await findOrder(orderReference);
  if (!order && orderReference.includes('_')) {
    ({ data: order } = await findOrder(orderReference.split('_')[0]));
  }

  if (!order) {
    /* 404, а не accept: хай WayForPay повторює. Чотири доби повторів
       — це чотири доби, щоб помітити в логах незнайомий формат
       номера й виправити пошук, не втративши жодного платежу. */
    console.error('wfp callback: невідоме замовлення', orderReference, transactionStatus, amount, currency);
    return new Response(null, { status: 404 });
  }

  /* ---------- застарілі й повторні повідомлення ---------- */
  const prev = order.payload || {};
  const incomingAt = Number(body.processingDate) || 0;
  const appliedAt = Number(prev.processingDate) || 0;

  if (incomingAt && appliedAt) {
    if (incomingAt < appliedAt) {
      console.warn('wfp callback: застаріле повідомлення, пропускаю', orderReference, transactionStatus);
      return accept(orderReference);
    }
    if (incomingAt === appliedAt && prev.transactionStatus === transactionStatus) {
      /* Той самий лист удруге — вже застосований. */
      return accept(orderReference);
    }
  }

  /* Будь-який збій запису — 500, щоб WayForPay повторив. Мовчки
     відповісти accept після невдалого запису означало б загубити
     чийсь платіж без сліду. */
  const must = ({ error }, what) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };

  try {
    const charged = Number(amount);
    const trialOrder = Number(order.amount) <= TRIAL_HOLD;

    /* ================= Оплачено ================= */
    if (transactionStatus === 'Approved') {
      /* Валюта. Підпис доводить, що лист від WayForPay, але не
         доводить, що списали в тій валюті, у якій ми виставляли. 15
         гривень і 15 доларів — одна цифра. */
      if (String(currency).toUpperCase() !== String(order.currency).toUpperCase()) {
        console.error('wfp callback: валюта не та', orderReference, currency, 'очікували', order.currency);
        return accept(orderReference);
      }

      const isTrialCharge = charged <= TRIAL_HOLD;

      /* Скільки мало прийти. Для тріалу — одиниця. Для списання за
         період — повна ціна тарифу у валюті замовлення. Для
         звичайного (не тріального) замовлення — те, що виставляли. */
      const minimum = isTrialCharge
        ? TRIAL_HOLD
        : trialOrder
          ? (PLAN_PRICE[order.currency]?.[order.plan] ?? Infinity)
          : Number(order.amount);

      if (charged < minimum || (isTrialCharge && !trialOrder)) {
        console.error('wfp callback: сума не та', orderReference, charged, 'мінімум', minimum);
        return accept(orderReference);
      }

      const { data: sub } = await admin
        .from('subscriptions')
        .select('valid_until,trial_used_at,rec_token')
        .eq('user_id', order.user_id)
        .maybeSingle();

      const period = isTrialCharge
        ? 'trial'
        : (order.plan === 'pro_yearly' ? 'yearly' : 'monthly');

      must(await admin.from('payment_orders').update({
        status: 'approved',
        payload: body,
        paid_at: new Date().toISOString(),
      }).eq('id', order.id), 'payment_orders');

      must(await admin.from('subscriptions').upsert({
        user_id: order.user_id,
        plan: 'pro',
        /* `trialing`, а не `active`: доступ той самий, але в
           налаштуваннях має бути видно, що це пробний період і коли
           саме спишуться гроші. */
        status: isTrialCharge ? 'trialing' : 'active',
        valid_until: extend(sub?.valid_until, period),
        /* Токен не затираємо порожнім: не кожен лист його несе, а
           без нього не працюють наступні списання. */
        rec_token: recToken || sub?.rec_token || null,
        last_order: orderReference,
        updated_at: new Date().toISOString(),
        /* Відмітку ставимо тут, а не при створенні замовлення: намір
           узяти тріал ще не є тріалом. Людина могла дійти до
           сторінки оплати й закрити її — спалити їй пробний період
           за це означало б не отримати клієнта взагалі.

           І тільки якщо її ще немає: повторний лист не має зсувати
           дату, від якої рахується «тріал уже був». */
        ...(isTrialCharge && !sub?.trial_used_at
          ? { trial_used_at: new Date().toISOString() }
          : {}),
      }, { onConflict: 'user_id' }), 'subscriptions');

      return accept(orderReference);
    }

    /* ================= Повернення ================= */
    if (REFUND.has(transactionStatus)) {
      /* Замовлення позначаємо, доступ НЕ чіпаємо.

         Для тріалу це очевидно: повернули перевірочну одиницю, а
         картка прив'язана, і регулярне списання в WayForPay лишається
         запланованим. Відкотити тут доступ — рівно та помилка, з якої
         почалось переписування цього файлу.

         Для оплаченого періоду — рішення людини, а не автомата.
         Повернення робить власник магазину руками, у кабінеті; якщо
         він хоче ще й закрити доступ, він скасує підписку там же.
         Автоматичне відкликання тут перетворило б будь-яке часткове
         чи помилкове повернення на втрату доступу клієнтом. */
      must(await admin.from('payment_orders').update({
        status: 'refunded',
        payload: body,
      }).eq('id', order.id), 'payment_orders');

      if (!(trialOrder && charged <= TRIAL_HOLD)) {
        console.warn('wfp callback: повернення оплаченого періоду — доступ не змінено', orderReference, charged, currency);
      }
      return accept(orderReference);
    }

    /* ================= Відмова ================= */
    if (FAILED.has(transactionStatus)) {
      const everPaid = order.status === 'approved' || order.status === 'refunded';

      if (!everPaid) {
        /* Перша оплата не пройшла — нічого не було, нічого не
           ламаємо. Просто слід в історії. */
        must(await admin.from('payment_orders').update({
          status: 'declined',
          payload: body,
        }).eq('id', order.id), 'payment_orders');
        return accept(orderReference);
      }

      /* Не пройшло чергове списання по вже оплаченій підписці.

         Замовлення не переписуємо: в ньому лежить історія успішних
         оплат і маска картки, і «declined» поверх неї збрехав би, що
         людина ніколи не платила.

         Доступ теж не відбираємо: `valid_until` вичерпається сам, а
         WayForPay повторить списання наступного дня. Лише статус
         past_due — щоб у налаштуваннях чесно сказати «картка не
         спрацювала», а не дати Pro мовчки згаснути. */
      must(await admin.from('subscriptions')
        .update({ status: 'past_due', updated_at: new Date().toISOString() })
        .eq('user_id', order.user_id)
        .in('status', ['active', 'trialing']), 'subscriptions');

      return accept(orderReference);
    }

    /* ================= Проміжні стани ================= */
    /* InProcessing, Pending, WaitingAuthComplete — справа ще йде.
       Нічого не змінюємо і, головне, не перезаписуємо payload:
       інакше «в обробці» затерло б уже застосоване «оплачено» разом
       із processingDate, і перевірка застарілих перестала б
       працювати. */
    return accept(orderReference);
  } catch (e) {
    console.error('wfp callback: не вдалось записати, WayForPay повторить —', orderReference, e.message);
    return new Response(null, { status: 500 });
  }
};
