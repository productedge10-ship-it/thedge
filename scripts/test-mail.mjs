/* global process */
/* Тестова відправка листів на свою пошту — тим самим кодом і ключем,
   що й сайт.
     node scripts/test-mail.mjs you@gmail.com            — усі листи
     node scripts/test-mail.mjs you@gmail.com winback14  — один
   Ключ береться з .env (RESEND_API_KEY) і ніде не друкується. */
import fs from 'node:fs';
import { sampleMails } from '../netlify/functions/_onboard.mjs';
import { sampleMails2 } from '../netlify/functions/_mails.mjs';

try {
  for (const l of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* .env немає — беремо змінні середовища */ }

const [to, only] = process.argv.slice(2);
if (!to) { console.error('Вкажи пошту: node scripts/test-mail.mjs you@gmail.com [welcome|onboard24|onboard3d|winback14|winback30|canceled|ended|digest|mt5|prop]'); process.exit(1); }
if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY не знайдено в .env'); process.exit(1); }

const all = { ...sampleMails(), ...sampleMails2() };
for (const [name, m] of Object.entries(all)) {
  if (only && only !== name) continue;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || 'The Edge <hello@theedgecat.com>', to: [to], subject: m.subject, html: m.html }),
  });
  console.log(name, r.status, r.ok ? 'надіслано' : (await r.text()).slice(0, 300));
}
