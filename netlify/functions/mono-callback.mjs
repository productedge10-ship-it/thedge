/* ==================================================================
   Вебхук mono про зміну стану рахунку.

   Разом із серверним списанням токеном — єдине місце, яке відкриває
   Pro. Адреса публічна, тому без перевірки підпису (x-sign, ECDSA)
   нічого не робимо: інакше це кнопка «видати собі підписку».

   Тіло читаємо сирим рядком і підпис рахуємо саме від нього: будь-яке
   JSON.parse → stringify змінює байти, і підпис перестає сходитись.

   Відповідь: 200 на все розібране (навіть на невідоме замовлення чи
   дубль), 500 — якщо не вдався запис у базу. mono повторює вебхук до
   трьох разів лише на не-200, і саме цим ми користуємось, щоб не
   загубити платіж.
================================================================== */

import { admin, applyInvoice, verifySignature } from './_mono.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  const raw = await req.text();
  const sign = req.headers.get('x-sign');

  let valid = false;
  try {
    valid = await verifySignature(raw, sign);
  } catch (e) {
    /* Не змогли дістати ключ — це наша проблема, не відправника.
       500, щоб mono повторив, коли ключ стане доступним. */
    console.error('mono callback: ключ недоступний —', e.message);
    return new Response(null, { status: 500 });
  }
  if (!valid) {
    console.error('mono callback: підпис не зійшовся');
    return new Response(null, { status: 400 });
  }

  let body;
  try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }

  try {
    await applyInvoice(admin(), body);
    return new Response(null, { status: 200 });
  } catch (e) {
    console.error('mono callback: запис не вдався, mono повторить —', body?.reference, e.message);
    return new Response(null, { status: 500 });
  }
};
