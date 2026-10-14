/* global process */
/* Відписка від нагадувань онбордингу — посилання з листа.
   Підпис HMAC замість входу: людина клікає з пошти, сесії може не
   бути. Транзакційні листи (оплата, тріал) це не вимикає. */
import { admin } from '../netlify/functions/_mono.mjs';
import { checkUnsub } from '../netlify/functions/_onboard.mjs';

const page = (title, text) => `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0c;font-family:Arial,Helvetica,sans-serif;padding:24px">
<div style="max-width:440px;background:#111116;border:1px solid #26262c;border-radius:18px;padding:32px;color:#b4b4bd;line-height:1.6">
<div style="color:#8b7bff;font-size:12px;font-weight:bold;letter-spacing:3px">THE EDGE</div>
<h1 style="color:#fafafa;font-size:22px;margin:10px 0 12px">${title}</h1><p style="margin:0 0 18px">${text}</p>
<a href="/app" style="display:inline-block;background:#8b7bff;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px">Відкрити журнал</a></div></body></html>`;

export default async function handler(req, res) {
  const uid = String(req.query?.u || '');
  const token = String(req.query?.t || '');
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');

  if (!/^[0-9a-f-]{36}$/i.test(uid) || !checkUnsub(uid, token)) {
    res.status(400).send(page('Посилання недійсне', 'Схоже, посилання пошкоджене. Напиши нам у Telegram @thedgesupport, і ми вимкнемо нагадування вручну.'));
    return;
  }
  try {
    const db = admin();
    await db.from('onboard_mail').upsert({ user_id: uid, unsubscribed: true }, { onConflict: 'user_id' });
    res.status(200).send(page('Нагадування вимкнено', 'Більше не надсилатимемо листів-нагадувань. Листи про оплату підписки, якщо вона є, приходитимуть як і раніше.'));
  } catch (e) {
    console.error('unsub:', e.message);
    res.status(500).send(page('Не вдалось', 'Спробуй ще раз трохи пізніше або напиши нам у Telegram @thedgesupport.'));
  }
}
