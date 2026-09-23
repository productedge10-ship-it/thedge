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
   Відповідати теж треба підписано. Якщо WayForPay не отримає
   правильну відповідь, він шле цей самий запит чотири доби поспіль.
================================================================== */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/* Порівняння в сталий час. Звичайне === на рядках виходить із циклу
   на першому розбіжному символі, і різниця в часі відповіді дає
   змогу підбирати підпис побайтово. Дорого й довго, але це відомий
   клас атак, і закривається він одним викликом. */
const sameSignature = (a, b) => {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* Скільки триває доступ. Рахуємо від «зараз», а не від дати платежу:
   різниця в кілька хвилин на користь клієнта, зате не треба вгадувати
   часову зону в полі createdDate. */
const until = (period) => {
  const d = new Date();
  if (period === 'trial') d.setDate(d.getDate() + 14);
  else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  /* Доба запасу: якщо чергове списання застрягне на кілька годин,
     людина не має втратити доступ посеред торгового дня. */
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  const SECRET = process.env.WFP_SECRET_KEY;
  const hmac = (parts) => crypto
    .createHmac('md5', SECRET)
    .update(parts.join(';'), 'utf8')
    .digest('hex');

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

  if (!sameSignature(expected, body.merchantSignature)) {
    console.error('wfp callback: підпис не збігся', orderReference);
    /* Навмисно без пояснень у тілі: тому, хто підбирає підпис, не
       треба підказувати, наскільки він близько. */
    return new Response(null, { status: 400 });
  }

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: order } = await admin
    .from('payment_orders')
    .select('id,user_id,plan,amount,status')
    .eq('reference', orderReference)
    .maybeSingle();

  if (!order) {
    console.error('wfp callback: невідоме замовлення', orderReference);
    return new Response(null, { status: 404 });
  }

  const approved = transactionStatus === 'Approved';

  /* Сума теж перевіряється. Підпис доводить, що запит від WayForPay,
     але не доводить, що заплатили стільки, скільки ми просили. */
  const paidEnough = Number(amount) >= Number(order.amount);

  await admin.from('payment_orders').update({
    status: approved && paidEnough ? 'approved' : 'declined',
    payload: body,
    paid_at: approved ? new Date().toISOString() : null,
  }).eq('id', order.id);

  if (approved && paidEnough) {
    /* Тріал видно по самому замовленню, а не по сумі: на другому й
       подальших списаннях WayForPay шле той самий orderReference із
       повною сумою, і відрізняти їх за гривнею було б крихко. */
    const isTrial = order.status === 'trial' && Number(order.amount) <= 1;
    const period = isTrial
      ? 'trial'
      : (order.plan === 'pro_yearly' ? 'yearly' : 'monthly');

    await admin.from('subscriptions').upsert({
      user_id: order.user_id,
      plan: 'pro',
      /* `trialing`, а не `active`: доступ той самий, але в
         налаштуваннях має бути видно, що це пробний період і коли
         саме спишуться гроші. */
      status: isTrial ? 'trialing' : 'active',
      valid_until: until(period),
      rec_token: recToken || null,
      last_order: orderReference,
      updated_at: new Date().toISOString(),
      /* Відмітку ставимо тут, а не при створенні замовлення.

         Бо намір узяти тріал ще не є тріалом: людина могла дійти до
         сторінки оплати й закрити її. Спалити їй пробний період за
         те, що вона передумала, — найдешевший спосіб не отримати
         клієнта взагалі. Відмітка зʼявляється тоді, коли гривня
         справді списалась. */
      ...(isTrial ? { trial_used_at: new Date().toISOString() } : {}),
    }, { onConflict: 'user_id' });
  }

  /* Списання не пройшло.

     Доступ НЕ відбираємо: `valid_until` і так вичерпається сам, а
     до тієї дати людина заплатила. Але статус міняємо, щоб у
     налаштуваннях можна було чесно сказати «картка не спрацювала,
     онови її» — замість мовчазного зникнення Pro за тиждень.

     Тільки для тих, у кого підписка вже була: невдала перша оплата
     нічого не ламає, там і не було чого ламати. */
  if (!approved) {
    await admin.from('subscriptions')
      .update({ status: 'past_due', updated_at: new Date().toISOString() })
      .eq('user_id', order.user_id)
      .in('status', ['active', 'trialing']);
  }

  /* Відповідь у форматі, якого вони чекають: orderReference; status;
     time — і підпис по цих же трьох полях.

     `accept` кажемо навіть на невдалий платіж. Це підтвердження
     «повідомлення отримано й розібрано», а не «гроші зараховано».
     Інакше на кожну відхилену картку ми отримували б чотири доби
     повторів одного й того самого. */
  const time = Math.floor(Date.now() / 1000);

  return new Response(JSON.stringify({
    orderReference,
    status: 'accept',
    time,
    signature: hmac([orderReference, 'accept', time]),
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
