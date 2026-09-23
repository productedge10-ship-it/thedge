/* ==================================================================
   Скасування підписки.

   Дві дії, і порядок між ними значущий.

   Перша — сказати WayForPay припинити регулярні списання. Друга —
   записати це в себе. Якщо переставити місцями, можна отримати
   найгірший з можливих станів: у нас «скасовано», а картка
   списується далі. Людина побачить у себе напис «підписку
   скасовано» і наступного місяця — знятi гроші. Після такого не
   пишуть у підтримку, після такого роблять чарджбек.

   --------------------------------------------------------------
   Доступ при цьому НЕ відбираємо.

   Скасування означає «не продовжувати», а не «забрати те, за що вже
   заплачено». Період, який людина оплатила, дограє до кінця —
   `valid_until` лишається на місці, `is_pro()` і далі віддає true.

   Так робить кожен сервіс, якому довіряють гроші. Зворотне —
   вимкнути доступ у мить скасування — технічно простіше й читається
   як помста за те, що пішов.
================================================================== */

import { createClient } from '@supabase/supabase-js';

const REGULAR_API = 'https://api.wayforpay.com/regularApi';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const MERCHANT = process.env.WFP_MERCHANT_ACCOUNT;
  const SECRET = process.env.WFP_SECRET_KEY;
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!MERCHANT || !SECRET || !SUPA_URL || !SUPA_KEY) {
    console.error('wfp cancel: не всі змінні задані');
    return json({ error: 'Сервер не налаштований' }, 500);
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  const admin = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

  const { data: { user } = {}, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Сесія застаріла' }, 401);

  const { data: sub } = await admin
    .from('subscriptions')
    .select('status,last_order,valid_until')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) {
    return json({ error: 'Активної підписки немає' }, 400);
  }

  /* `merchantPassword` у їхньому API — це той самий секретний ключ
     мерчанта. Назва поля інша, значення те саме. */
  if (sub.last_order) {
    try {
      const r = await fetch(REGULAR_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestType: 'REMOVE',
          merchantAccount: MERCHANT,
          merchantPassword: SECRET,
          orderReference: sub.last_order,
        }),
      });

      const out = await r.json().catch(() => ({}));

      /* 4100 — «Ok». Будь-що інше означає, що списання лишилось
         живим, і в такому разі краще чесно не скасовувати, ніж
         написати «скасовано» над карткою, з якої знімуть гроші. */
      if (Number(out.reasonCode) !== 4100) {
        console.error('wfp cancel: REMOVE не пройшов —', out.reasonCode, out.reason);
        return json({ error: 'Платіжна система не підтвердила скасування. Напиши нам, зробимо вручну.' }, 502);
      }
    } catch (e) {
      console.error('wfp cancel: regularApi недоступний —', e.message);
      return json({ error: 'Платіжна система не відповідає. Спробуй за хвилину.' }, 502);
    }
  }

  await admin.from('subscriptions').update({
    status: 'canceled',
    updated_at: new Date().toISOString(),
    /* valid_until не чіпаємо навмисно — див. шапку файлу. */
  }).eq('user_id', user.id);

  return json({ ok: true, validUntil: sub.valid_until });
};
