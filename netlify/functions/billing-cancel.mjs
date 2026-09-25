/* ==================================================================
   Скасування підписки — для обох платіжних систем.

   Підписки mono списуємо ми самі, тож «скасувати» означає просто не
   планувати наступне списання: next_charge_at = null. Токен картки
   ще й видаляємо в банку — щоб у нас не лишалось способу списати
   гроші з людини, яка пішла.

   Старі підписки WayForPay списує сам WayForPay — для них віддаємо
   запит у wfp-cancel, де скасування йде через їхній API.

   Доступ в обох випадках дограє до valid_until: скасування — це «не
   продовжувати», а не «забрати оплачене».
================================================================== */

import { json, admin, mono } from './_mono.mjs';
import wfpCancel from './wfp-cancel.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  let db;
  try { db = admin(); } catch {
    return json({ error: 'Сервер не налаштований' }, 500);
  }
  const { data: { user } = {}, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Сесія застаріла' }, 401);

  const { data: sub } = await db.from('subscriptions')
    .select('provider,status,valid_until,card_token')
    .eq('user_id', user.id).maybeSingle();

  /* Крипта — передоплата: автосписань немає, скасовувати нічого.
     Доступ сам закінчиться в оплачену дату. */
  if (sub?.provider === 'crypto') {
    return json({ error: 'Оплата криптою не продовжується автоматично — скасовувати нічого' }, 400);
  }
  if (sub?.provider !== 'mono') return wfpCancel(req);

  if (!['active', 'trialing', 'past_due'].includes(sub?.status)) {
    return json({ error: 'Активної підписки немає' }, 400);
  }

  const { error } = await db.from('subscriptions').update({
    status: 'canceled',
    next_charge_at: null,
    charge_lock: null,
    card_token: null,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id);
  if (error) {
    console.error('billing cancel:', error.message);
    return json({ error: 'Не вдалось скасувати. Спробуй ще раз' }, 500);
  }

  /* Видалення токена в банку — після запису в себе і без права
     зірвати скасування: списань уже не буде в будь-якому разі, бо
     next_charge_at порожній. */
  if (sub.card_token) {
    await mono('/api/merchant/wallet/card', { method: 'DELETE', query: { cardToken: sub.card_token } })
      .catch((e) => console.error('billing cancel: токен не видалено —', e.message));
  }

  return json({ ok: true, validUntil: sub.valid_until });
};
