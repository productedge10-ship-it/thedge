/* ==================================================================
   Оплата криптою через NOWPayments — спільне для функцій.

   Крипта не вміє списувати сама, тому підписка тут — передоплата:
   людина купує місяць або рік, ми продовжуємо valid_until на цей
   період, а за 3 дні до кінця шлемо лист «продовж». Автосписань
   немає, тож і скасовувати нічого — доступ просто закінчується.

   Доступ відкриває лише IPN (вебхук) із підписом HMAC-SHA512 ключем
   NOWPAYMENTS_IPN_SECRET і лише в стані `finished` — коли гроші
   справді дійшли. `confirmed` ще не остаточний, `partially_paid` —
   людина недоплатила (частіше за все через комісію мережі).
================================================================== */

import crypto from 'node:crypto';
import {
  PLANS, admin, site, sendMail, letter, fmtDay,
} from './_mono.mjs';

export const NP_API = 'https://api.nowpayments.io/v1';

/* Скільки днів до кінця нагадуємо продовжити. */
const REMIND_DAYS = 3;

export async function np(path, body) {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error('не задано NOWPAYMENTS_API_KEY');
  const r = await fetch(NP_API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`nowpayments ${path} ${r.status}: ${data.message || data.code || ''}`);
  return data;
}

/* ---------- підпис IPN ----------
   Рецепт NOWPayments: ключі тіла відсортувати рекурсивно, перевести в
   JSON і порахувати HMAC-SHA512. Порівнюємо в сталий час. */
const sortObject = (obj) => Object.keys(obj).sort().reduce((acc, k) => {
  const v = obj[k];
  acc[k] = v && typeof v === 'object' && !Array.isArray(v) ? sortObject(v) : v;
  return acc;
}, {});

export function verifyIpn(body, sig) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !sig || !body || typeof body !== 'object') return false;
  const expected = crypto.createHmac('sha512', secret.trim())
    .update(JSON.stringify(sortObject(body))).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const addPeriod = (from, planId) => {
  const d = new Date(from);
  if (PLANS[planId]?.period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

/* ==================================================================
   Застосувати IPN. Ідемпотентно: той самий `finished` може прийти
   кілька разів, період додається рівно один.
================================================================== */
export async function applyIpn(db, body) {
  const ref = body?.order_id;
  const status = body?.payment_status;
  const must = ({ error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

  if (!ref) return { ok: false, reason: 'no order_id' };
  const { data: order } = await db.from('payment_orders').select('*').eq('reference', ref).maybeSingle();
  if (!order || order.provider !== 'nowpayments') {
    console.error('np: невідоме замовлення', ref, status);
    return { ok: false, reason: 'unknown' };
  }
  if (order.status === 'approved' && status !== 'refunded') return { ok: true, reason: 'done' };

  const patch = (fields) => db.from('payment_orders')
    .update({ payload: body, invoice_id: String(body.invoice_id || body.payment_id || order.invoice_id || ''), ...fields })
    .eq('id', order.id);

  if (status === 'finished') {
    /* Ціна в доларах мусить збігатись із тим, що ми виставляли.
       Підпис доводить, що лист від NOWPayments, але не що рахунок
       був саме наш і на ту саму суму. */
    if (String(body.price_currency).toLowerCase() !== 'usd' || Number(body.price_amount) < Number(order.amount)) {
      console.error('np: сума чи валюта не та', ref, body.price_amount, body.price_currency, 'очікували', order.amount);
      return { ok: false, reason: 'amount' };
    }

    const { data: sub } = await db.from('subscriptions')
      .select('provider,valid_until,status').eq('user_id', order.user_id).maybeSingle();

    /* Продовження до кінця — від дати, до якої вже оплачено, а не від
       «зараз»: заплатив за тиждень до кінця — тиждень не згорає. */
    const now = Date.now();
    const paidTill = sub?.valid_until ? Date.parse(sub.valid_until) : 0;
    const from = sub?.provider === 'crypto' && paidTill > now ? paidTill : now;
    const until = addPeriod(from, order.plan);

    must(await patch({ status: 'approved', paid_at: new Date().toISOString() }), 'payment_orders');
    must(await db.from('subscriptions').upsert({
      user_id: order.user_id,
      plan: 'pro',
      provider: 'crypto',
      plan_id: order.plan,
      status: 'active',
      valid_until: until.toISOString(),
      next_charge_at: null,
      remind_sent_at: null,
      last_order: order.reference,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }), 'subscriptions');

    const { data } = await db.auth.admin.getUserById(order.user_id).catch(() => ({ data: null }));
    await sendMail(data?.user?.email, 'Дякуємо за підписку на The Edge Pro', letter(
      'Дякуємо за підписку!',
      [
        `Оплату криптою отримано, Pro активовано до <b style="color:#fafafa">${fmtDay(until)}</b>.`,
        'Автосписань немає: за кілька днів до кінця ми нагадаємо, і продовжити можна в налаштуваннях.',
      ],
      { href: `${site()}/app`, text: 'Відкрити журнал' },
    ));
    return { ok: true, reason: 'applied' };
  }

  if (status === 'failed' || status === 'expired') {
    must(await patch({ status: 'declined' }), 'payment_orders');
    return { ok: true, reason: 'declined' };
  }
  if (status === 'refunded') {
    must(await patch({ status: 'refunded' }), 'payment_orders');
    return { ok: true, reason: 'refunded' };
  }
  if (status === 'partially_paid') {
    /* Доступ не даємо, але й не губимо: у логах видно, хто
       недоплатив, — доплату вирішуємо руками через підтримку. */
    console.warn('np: недоплата', ref, body.actually_paid, body.pay_currency);
    must(await patch({ status: 'pending' }), 'payment_orders');
    return { ok: true, reason: 'partial' };
  }
  return { ok: true, reason: 'pending' };
}

/* ==================================================================
   Нагадування продовжити. Раз на тік планувальника: знаходимо крипто-
   підписки, яким лишилось ≤ 3 днів, і шлемо один лист на період
   (remind_sent_at скидається при кожній оплаті).
================================================================== */
export async function runCryptoReminders() {
  if (!process.env.RESEND_API_KEY) return;
  const db = admin();
  const now = new Date();
  const soon = new Date(now.getTime() + REMIND_DAYS * 86_400_000);

  const { data: subs, error } = await db.from('subscriptions')
    .select('user_id,valid_until')
    .eq('provider', 'crypto')
    .eq('status', 'active')
    .is('remind_sent_at', null)
    .gt('valid_until', now.toISOString())
    .lte('valid_until', soon.toISOString())
    .limit(50);
  if (error) { console.error('np remind:', error.message); return; }

  for (const s of subs || []) {
    /* Спершу позначаємо, потім шлемо: краще раз не надіслати, ніж
       надіслати двічі, якщо тік запуститься паралельно. */
    const { data: claimed } = await db.from('subscriptions')
      .update({ remind_sent_at: now.toISOString() })
      .eq('user_id', s.user_id).is('remind_sent_at', null).select('user_id');
    if (!claimed?.length) continue;

    const { data } = await db.auth.admin.getUserById(s.user_id).catch(() => ({ data: null }));
    await sendMail(data?.user?.email, 'Pro закінчується — продовж підписку', letter(
      'Pro скоро закінчиться',
      [
        `Оплачений період триває до <b style="color:#fafafa">${fmtDay(s.valid_until)}</b>.`,
        'Щоб не втратити автоімпорт з MT5, бота й бектест, продовж підписку — криптою або карткою.',
      ],
      { href: `${site()}/app?settings=billing`, text: 'Продовжити' },
    ));
  }
}
