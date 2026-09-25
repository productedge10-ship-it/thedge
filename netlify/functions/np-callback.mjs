/* ==================================================================
   IPN від NOWPayments. Без підпису (x-nowpayments-sig) нічого не
   робимо: адреса публічна. 500 — лише коли не вдався запис у базу,
   щоб NOWPayments повторив; на все інше — 200.
================================================================== */

import { admin } from './_mono.mjs';
import { verifyIpn, applyIpn } from './_np.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  let body;
  try { body = JSON.parse(await req.text()); } catch { return new Response(null, { status: 400 }); }

  if (!verifyIpn(body, req.headers.get('x-nowpayments-sig'))) {
    console.error('np callback: підпис не зійшовся', body?.order_id);
    return new Response(null, { status: 400 });
  }

  try {
    await applyIpn(admin(), body);
    return new Response(null, { status: 200 });
  } catch (e) {
    console.error('np callback: запис не вдався —', body?.order_id, e.message);
    return new Response(null, { status: 500 });
  }
};
