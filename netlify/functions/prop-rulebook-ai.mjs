/* global process */
/* ==================================================================
   Gemini-редагування зводу правил пропа — для локальної адмінки.

   Ключ Gemini живе лише на сервері, тож адмінка шле сюди звід і
   інструкцію («об'єднай повтори», «розпиши новини по програмах»), а
   отримує нову версію. Нічого не зберігає: зберігає адмін сам через
   admin_rulebook_save після перегляду.

   Доступ — як до адмінки: дійсна сесія + рядок у admin_users + 2FA
   (aal2 у токені). Відкритий CORS лише для локальної адмінки.
================================================================== */
import { admin } from './_mono.mjs';
import { aiEditRulebook } from './_propRules.mjs';

const ORIGINS = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const cors = (req) => {
  const o = req.headers.get('origin') || '';
  return ORIGINS.test(o) || o === process.env.ADMIN_ORIGIN
    ? { 'access-control-allow-origin': o, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' }
    : {};
};
const out = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(req) } });

const aal = (token) => {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).aal || 'aal1'; } catch { return 'aal1'; }
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== 'POST') return out(req, { error: 'POST only' }, 405);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return out(req, { error: 'auth' }, 401);
  const db = admin();
  const { data: { user } = {} } = await db.auth.getUser(token);
  if (!user || aal(token) !== 'aal2') return out(req, { error: 'auth' }, 401);
  const { data: adm } = await db.from('admin_users').select('active,can_write,expires_at').eq('user_id', user.id).maybeSingle();
  if (!adm?.active || !adm.can_write || (adm.expires_at && new Date(adm.expires_at) < new Date())) return out(req, { error: 'forbidden' }, 403);

  let body;
  try { body = await req.json(); } catch { return out(req, { error: 'bad json' }, 400); }
  if (!body?.firm || !body?.content) return out(req, { error: 'firm/content' }, 400);
  try {
    const content = await aiEditRulebook(body.firm, body.content, body.instruction);
    return out(req, { content });
  } catch (e) {
    return out(req, { error: e.message.slice(0, 300) }, 502);
  }
};
