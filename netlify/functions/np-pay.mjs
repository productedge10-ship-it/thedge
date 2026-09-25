/* ==================================================================
   Рахунок на оплату криптою (NOWPayments).

   Тріалу тут немає: привʼязати гаманець для списання через 14 днів
   неможливо, тож крипта — лише повна оплата періоду наперед.
   Сума й тариф — з сервера, користувач — з токена сесії.
================================================================== */

import { PLANS, json, site, admin, newReference } from './_mono.mjs';
import { np } from './_np.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.NOWPAYMENTS_API_KEY) {
    console.error('np pay: не задано NOWPAYMENTS_API_KEY');
    return json({ error: 'Оплата криптою ще не налаштована' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const planId = body?.plan;
  const plan = PLANS[planId];
  if (!plan) return json({ error: 'Невідомий тариф' }, 400);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  let db;
  try { db = admin(); } catch { return json({ error: 'Сервер не налаштований' }, 500); }
  const { data: { user } = {}, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Сесія застаріла' }, 401);

  /* Діюча підписка карткою — криптою поверх неї не продаємо: людина
     платила б двічі за той самий час. Спершу скасувати картку.
     Крипто-підписку ж продовжувати наперед можна. */
  const { data: sub } = await db.from('subscriptions')
    .select('provider,status,valid_until,plan').eq('user_id', user.id).maybeSingle();
  const liveCard = sub?.plan === 'pro' && sub?.provider !== 'crypto'
    && ['active', 'trialing', 'past_due'].includes(sub?.status)
    && (!sub.valid_until || Date.parse(sub.valid_until) > Date.now());
  if (liveCard) return json({ error: 'У тебе вже діє підписка карткою' }, 409);

  const reference = newReference();
  const { error: insErr } = await db.from('payment_orders').insert({
    user_id: user.id, reference, plan: planId, amount: plan.usd, currency: 'USD',
    status: 'pending', provider: 'nowpayments', kind: 'crypto',
  });
  if (insErr) {
    console.error('np pay: замовлення —', insErr.message);
    return json({ error: 'Не вдалось створити рахунок' }, 500);
  }

  try {
    const inv = await np('/invoice', {
      price_amount: plan.usd,
      price_currency: 'usd',
      order_id: reference,
      order_description: plan.title,
      ipn_callback_url: `${site()}/api/np-callback`,
      success_url: `${site()}/app?paid=1`,
      cancel_url: `${site()}/app`,
    });
    await db.from('payment_orders').update({ invoice_id: String(inv.id) }).eq('reference', reference);
    return json({ url: inv.invoice_url });
  } catch (e) {
    console.error('np pay: invoice —', e.message);
    await db.from('payment_orders').update({ status: 'declined' }).eq('reference', reference);
    return json({ error: 'Платіжний сервіс не відповів. Спробуй за хвилину' }, 502);
  }
};
