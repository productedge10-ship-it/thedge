/* ==================================================================
   Створення рахунку WayForPay — Netlify Functions.

   Формат тут інший, ніж у Vercel: не (req, res), а веб-стандартні
   Request і Response. Тому це окремий файл, а не той самий із
   /api — спільного коду в них лишилось би два рядки, а різниця в
   сигнатурі ховалась би за обгорткою й стріляла при кожній правці.

   --------------------------------------------------------------
   Підпис рахується тут і тільки тут. Секретний ключ мерчанта — це
   єдине, що відрізняє наш запит від чужого: маючи його, будь-хто
   виставить рахунок від нашого імені. У браузер він не потрапляє
   ніколи, навіть у збірку.

   Суму теж беремо звідси, а не з тіла запиту. Спокуса передати
   `amount` з фронта виглядає нешкідливо — ціна ж і так на сторінці.
   Але тіло запиту складає клієнт, і нічого не заважає попросити
   рахунок на одну гривню за річний тариф. Клієнт називає ТАРИФ,
   ціну знає сервер.
================================================================== */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PAY_URL = 'https://secure.wayforpay.com/pay';
const TRIAL_DAYS = 14;

/* Дзеркало src/lib/billing.js. Саме дзеркало, а не імпорт: функція
   збирається окремо від застосунку. Ціна змінилась — міняємо в обох.

   Валюта тут одна змінна навмисно: вона входить у підпис, у поля
   форми і в запис замовлення, і розбіжність у будь-якому з трьох
   місць дає «невірний підпис» без пояснення, де саме. */
const CURRENCY = 'USD';

const PLANS = {
  pro_monthly: { title: 'Edge Journal Pro — місяць', amount: 15, period: 'monthly' },
  pro_yearly: { title: 'Edge Journal Pro — рік', amount: 144, period: 'yearly' },
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const MERCHANT = process.env.WFP_MERCHANT_ACCOUNT;
  const SECRET = process.env.WFP_SECRET_KEY;
  const DOMAIN = process.env.WFP_DOMAIN;
  const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');

  if (!MERCHANT || !SECRET || !DOMAIN) {
    console.error('wfp: не задані WFP_MERCHANT_ACCOUNT / WFP_SECRET_KEY / WFP_DOMAIN');
    return json({ error: 'Оплата ще не налаштована' }, 500);
  }

  const sign = (parts) => crypto
    .createHmac('md5', SECRET)
    .update(parts.join(';'), 'utf8')
    .digest('hex');

  const body = await req.json().catch(() => ({}));

  const plan = PLANS[body?.plan];
  if (!plan) return json({ error: 'Невідомий тариф' }, 400);

  /* Клієнт лише ПРОСИТЬ пробний період — дає його сервер, нижче,
     звірившись із базою. */
  const wantsTrial = body?.trial === true;

  /* Хто платить — беремо з токена, а не з тіла запиту. Інакше можна
     оформити підписку на чужий акаунт. */
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  /* Перевіряємо конфіг ОКРЕМО від токена.

     Спершу обидва випадки віддавали «Сесія застаріла». Це виглядало
     розумно — 401 і 401, — але вело слідство не туди: людина
     перезаходить в акаунт, чистить кеш, лається на застосунок, а
     насправді на сервері просто не задана змінна. Помилка має
     називати свою причину, навіть коли причина соромна. */
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPA_URL || !SUPA_KEY) {
    console.error('wfp: немає SUPABASE_URL або SUPABASE_SERVICE_KEY у змінних функції');
    return json({ error: 'Сервер не налаштований: немає ключів Supabase' }, 500);
  }

  const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

  const { data: { user } = {}, error: authErr } = await admin.auth.getUser(token);

  if (authErr || !user) {
    /* У лог — справжню причину від Supabase. У відповідь браузеру її
       не віддаємо: деталі перевірки токена стороннім знати ні до чого. */
    console.error('wfp: getUser не пройшов —', authErr?.message || 'користувача не знайдено');
    return json({ error: 'Сесія застаріла' }, 401);
  }

  /* Тріал: долар зараз, повна сума на чотирнадцятий день через
     dateNext — далі WayForPay списує сам, свого планувальника не
     треба.

     Долар, а не нуль, навмисно. Нуль виглядає добріше, але нічого
     не перевіряє: картка без грошей або з забороною інтернет-
     платежів пройде верифікацію і відвалиться рівно тоді, коли
     людина вже звикла до продукту. */

  /* Тріал — один на акаунт, і рішення про це ухвалює сервер.

     Клієнт лише ПРОСИТЬ пробний період; дає його база, звіряючись із
     власною відміткою. Інакше достатньо скасувати підписку й
     натиснути кнопку знову — і так щомісяця за гривню. Причому це
     робитиме не зловмисник, а звичайна людина, якій продукт
     подобається: вона бачить доступну кнопку й тисне її.

     Відмовляти повністю не треба: людина хотіла заплатити. Просто
     виставляємо повний рахунок замість пробного. */
  const { data: sub } = await admin
    .from('subscriptions')
    .select('trial_used_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const trial = wantsTrial && !sub?.trial_used_at;
  const chargeNow = trial ? 1 : plan.amount;

  const dateNext = (() => {
    if (!trial) return null;
    const d = new Date();
    d.setDate(d.getDate() + TRIAL_DAYS);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  })();

  const productName = trial
    ? `${plan.title} — ${TRIAL_DAYS} днів безкоштовно`
    : plan.title;


  /* Номер замовлення — власний, не uuid користувача. У WayForPay він
     видно платнику й лишається в їхній системі назавжди. */
  const reference = `EJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const orderDate = Math.floor(Date.now() / 1000);

  const { error: dbErr } = await admin.from('payment_orders').insert({
    user_id: user.id,
    reference,
    plan: body.plan,
    /* Записуємо те, що справді списується зараз: інакше колбек, який
       звіряє суму, відхилить власний же тріал. */
    amount: chargeNow,
    currency: CURRENCY,
    status: trial ? 'trial' : 'pending',
  });

  if (dbErr) {
    console.error('wfp: не записалось замовлення', dbErr);
    return json({ error: 'Не вдалось створити рахунок' }, 500);
  }

  /* Порядок полів у підписі фіксований документацією і значущий:
     merchantAccount; merchantDomainName; orderReference; orderDate;
     amount; currency; усі productName; усі productCount; усі
     productPrice. Переставиш два місцями — WayForPay поверне
     «невірний підпис» і не скаже, де саме. */
  const signature = sign([
    MERCHANT, DOMAIN, reference, orderDate, chargeNow, CURRENCY,
    productName, 1, chargeNow,
  ]);

  return json({
    action: PAY_URL,
    fields: {
      merchantAccount: MERCHANT,
      merchantAuthType: 'SimpleSignature',
      merchantDomainName: DOMAIN,
      merchantTransactionSecureType: 'AUTO',
      merchantSignature: signature,
      apiVersion: 1,
      language: 'UA',

      orderReference: reference,
      orderDate,
      amount: chargeNow,
      currency: CURRENCY,

      'productName[]': productName,
      'productPrice[]': chargeNow,
      'productCount[]': 1,

      clientEmail: user.email || '',

      /* Куди повернути людину і куди повідомити нас — різні адреси й
         різні ролі. returnUrl бачить браузер, і довіряти йому не
         можна: людина може просто не доїхати до нього, закривши
         вкладку. Доступ відкриває виключно serviceUrl. */
      returnUrl: `${SITE}/api/wfp-return`,
      serviceUrl: `${SITE}/api/wfp-callback`,

      /* Підписка налаштовується прямо тут — окремого API не треба.
         `preset` забирає в платника можливість переписати період і
         суму на платіжній сторінці. */
      regularMode: plan.period,
      regularAmount: plan.amount,
      regularOn: 1,
      regularBehavior: 'preset',

      ...(dateNext ? { dateNext } : {}),
    },
  });
};
