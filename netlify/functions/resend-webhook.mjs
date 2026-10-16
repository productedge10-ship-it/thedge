/* global process */
/* ==================================================================
   Вебхук Resend: доставлено / відкрито / клік / відбій / скарга.

   Пишемо лише тип події й id листа — без адрес і вмісту: для
   статистики в адмінці більше не треба.

   Підпис — Svix (так підписує Resend): HMAC-SHA256 від
   "<svix-id>.<svix-timestamp>.<тіло>" ключем із RESEND_WEBHOOK_SECRET
   (whsec_…). Без правильного підпису — 401, щоб ніхто не накрутив
   «відкриття».
================================================================== */
import crypto from 'node:crypto';
import { admin, json } from './_mono.mjs';

function verify(req, body) {
  const secret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const id = req.headers.get('svix-id');
  const ts = req.headers.get('svix-timestamp');
  const sig = req.headers.get('svix-signature') || '';
  if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return sig.split(' ').some((part) => {
    const v = part.split(',')[1] || '';
    return v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected));
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const body = await req.text();
  if (!verify(req, body)) return json({ error: 'bad signature' }, 401);
  let ev;
  try { ev = JSON.parse(body); } catch { return json({ error: 'bad json' }, 400); }
  const rid = ev?.data?.email_id;
  if (rid && ev.type) {
    await admin().from('mail_events')
      .upsert({ resend_id: rid, type: ev.type, at: ev.created_at || new Date().toISOString() }, { onConflict: 'resend_id,type', ignoreDuplicates: true })
      .then(({ error }) => error && console.error('resend webhook:', error.message));
  }
  return json({ ok: true });
};
