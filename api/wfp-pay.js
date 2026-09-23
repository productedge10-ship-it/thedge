/* global process */
/* ==================================================================
   Створення рахунку WayForPay.

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

const MERCHANT = process.env.WFP_MERCHANT_ACCOUNT;
const SECRET = process.env.WFP_SECRET_KEY;
const DOMAIN = process.env.WFP_DOMAIN;          // напр. edgejournal.app — без https://
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '');

const PAY_URL = 'https://secure.wayforpay.com/pay';

/* Дзеркало src/lib/billing.js. Саме дзеркало, а не імпорт: serverless
   збирається окремо від застосунку, і тягнути в нього клієнтський
   модуль разом із supabase-клієнтом браузера ні до чого. Ціна
   змінилась — міняємо в обох місцях. */
const PLANS = {
  pro_monthly: { title: 'Edge Journal Pro — місяць', amount: 15, period: 'monthly' },
  pro_yearly: { title: 'Edge Journal Pro — рік', amount: 144, period: 'yearly' },
};

const sign = (parts) => crypto
  .createHmac('md5', SECRET)
  .update(parts.join(';'), 'utf8')
  .digest('hex');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!MERCHANT || !SECRET || !DOMAIN) {
    console.error('wfp: не задані WFP_MERCHANT_ACCOUNT / WFP_SECRET_KEY / WFP_DOMAIN');
    return res.status(500).json({ error: 'Оплата ще не налаштована' });
  }

  const plan = PLANS[req.body?.plan];
  if (!plan) return res.status(400).json({ error: 'Невідомий тариф' });

  /* Тріал.

     Списуємо гривню зараз, а повну суму ставимо на чотирнадцятий
     день через dateNext — далі WayForPay списує сам, свого
     планувальника не треба.

     Гривня, а не нуль, навмисно. Нуль виглядає добріше, але нічого
     не перевіряє: картка без грошей або з забороною інтернет-
     платежів пройде верифікацію і відвалиться рівно тоді, коли
     людина вже звикла до продукту. */
  const trial = req.body?.trial === true;
  const TRIAL_DAYS = 14;
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

  /* Хто платить — беремо з токена, а не з тіла запиту. Інакше можна
     оформити підписку на чужий акаунт (або, що гірше, на свій за
     чужою карткою й потім сперечатись). */
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Треба увійти' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Сесія застаріла' });

  /* Номер замовлення — власний, не uuid користувача. У WayForPay він
     видно платнику й лишається в їхній системі назавжди; ідентифікатор
     нашого користувача там ні до чого. */
  const reference = `EJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const orderDate = Math.floor(Date.now() / 1000);

  const { error: dbErr } = await admin.from('payment_orders').insert({
    user_id: user.id,
    reference,
    plan: req.body.plan,
    /* Записуємо те, що справді списується зараз. Інакше колбек, який
       звіряє суму, побачить гривню проти шестисот і відхилить
       власний же тріал. */
    amount: chargeNow,
    currency: 'USD',
    status: trial ? 'trial' : 'pending',
  });

  if (dbErr) {
    console.error('wfp: не записалось замовлення', dbErr);
    return res.status(500).json({ error: 'Не вдалось створити рахунок' });
  }

  /* Порядок полів у підписі фіксований документацією і значущий:
     merchantAccount; merchantDomainName; orderReference; orderDate;
     amount; currency; усі productName; усі productCount; усі
     productPrice. Переставиш два місцями — WayForPay поверне
     «невірний підпис» і не скаже, де саме. */
  const signature = sign([
    MERCHANT, DOMAIN, reference, orderDate, chargeNow, 'USD',
    productName, 1, chargeNow,
  ]);

  return res.status(200).json({
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
      currency: 'USD',

      'productName[]': productName,
      'productPrice[]': chargeNow,
      'productCount[]': 1,

      clientEmail: user.email || '',

      /* Куди повернути людину і куди повідомити нас — різні адреси й
         різні ролі. returnUrl бачить браузер, і довіряти йому не
         можна взагалі: людина може просто не доїхати до нього,
         закривши вкладку. Доступ відкриває виключно serviceUrl. */
      returnUrl: `${SITE}/app?paid=1`,
      serviceUrl: `${SITE}/api/wfp-callback`,

      /* Підписка налаштовується прямо тут — окремого API не треба.
         `preset` забирає в платника можливість переписати період і
         суму на платіжній сторінці: інакше можна оформити «раз на
         рік» за ціною місяця. */
      regularMode: plan.period,
      regularAmount: plan.amount,
      regularOn: 1,
      regularBehavior: 'preset',

      /* Перше повне списання — після тріалу. Без тріалу поля немає
         взагалі, і регулярка починає рахуватись від сьогодні. */
      ...(dateNext ? { dateNext } : {}),
    },
  });
}
