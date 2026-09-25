/* ==================================================================
   Створення рахунку в mono.

   Клієнт називає лише ТАРИФ і чи хоче пробний період. Суму, тріал і
   того, хто платить, вирішує сервер: сума — з PLANS, користувач — з
   токена сесії, право на тріал — з бази. Інакше будь-хто з консолі
   попросив би рахунок на гривню за річний тариф або тріал удруге.
================================================================== */

import {
  PLANS, TRIAL_DAYS, TRIAL_CHECK_UAH, json, site, admin, newReference, mono, priceFor,
} from './_mono.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.MONO_TOKEN) {
    console.error('mono pay: не задано MONO_TOKEN');
    return json({ error: 'Оплата ще не налаштована' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const planId = body?.plan;
  if (!PLANS[planId]) return json({ error: 'Невідомий тариф' }, 400);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  let db;
  try { db = admin(); } catch (e) {
    console.error('mono pay:', e.message);
    return json({ error: 'Сервер не налаштований' }, 500);
  }

  const { data: { user } = {}, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Сесія застаріла' }, 401);

  const { data: sub } = await db.from('subscriptions')
    .select('trial_used_at,status,valid_until,plan')
    .eq('user_id', user.id).maybeSingle();

  /* Уже є діючий Pro — другий рахунок не виставляємо: інакше подвійний
     клік чи друга вкладка дають дві підписки й два списання. */
  const live = sub?.plan === 'pro'
    && ['active', 'trialing', 'past_due'].includes(sub?.status)
    && (!sub.valid_until || Date.parse(sub.valid_until) > Date.now());
  if (live) return json({ error: 'Підписка вже активна' }, 409);

  const trial = body?.trial === true && !sub?.trial_used_at;
  const plan = PLANS[planId];
  const reference = newReference();

  let price;
  try {
    /* Тріал — перевірочна гривня, а не verification на 0 ₴. Сторінка
       verification приймає лише номер картки, а Apple Pay / Google Pay
       mono показує тільки там, де є списання (підтверджено підтримкою
       mono). Гривню повертаємо одразу після успіху — див. applyInvoice. */
    price = trial ? { amount: TRIAL_CHECK_UAH, minor: TRIAL_CHECK_UAH * 100, ccy: 980, currency: 'UAH' } : await priceFor(planId);
  } catch (e) {
    console.error('mono pay: курс —', e.message);
    return json({ error: 'Не вдалось порахувати суму, спробуй за хвилину' }, 502);
  }

  const { error: insErr } = await db.from('payment_orders').insert({
    user_id: user.id,
    reference,
    plan: planId,
    amount: price.amount,
    currency: price.currency,
    status: 'pending',
    provider: 'mono',
    kind: trial ? 'verify' : 'charge',
  });
  if (insErr) {
    console.error('mono pay: замовлення —', insErr.message);
    return json({ error: 'Не вдалось створити рахунок' }, 500);
  }

  const title = trial ? `${plan.title} — ${TRIAL_DAYS} днів безкоштовно` : plan.title;

  try {
    const out = await mono('/api/merchant/invoice/create', {
      method: 'POST',
      body: {
        amount: price.minor,
        ccy: price.ccy,
        paymentType: 'debit',
        /* Гаманець — id користувача: один гаманець на людину, і токен
           завжди можна знайти, навіть якщо вебхук із ним загубився. */
        saveCardData: { saveCard: true, walletId: user.id },
        merchantPaymInfo: {
          reference,
          destination: title,
          customerEmails: user.email ? [user.email] : [],
          basketOrder: [{
            name: trial ? 'Перевірка картки (буде повернено)' : title,
            qty: 1, sum: price.minor, total: price.minor, unit: 'шт.', code: trial ? 'card_check' : planId,
          }],
        },
        redirectUrl: `${site()}/app?paid=1`,
        webHookUrl: `${site()}/api/mono-callback`,
        validity: 3600,
      },
    });

    await db.from('payment_orders').update({ invoice_id: out.invoiceId }).eq('reference', reference);
    return json({ url: out.pageUrl });
  } catch (e) {
    console.error('mono pay: invoice/create —', e.message);
    await db.from('payment_orders').update({ status: 'declined' }).eq('reference', reference);
    return json({ error: 'Платіжна система не відповіла. Спробуй за хвилину' }, 502);
  }
};
