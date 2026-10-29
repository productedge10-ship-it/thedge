// Сирі тексти правил FTMO (без Gemini) → Supabase, таблиця prop_rule_pages.
//   node scripts/ftmo-push.mjs          — сухий прогін: що буде записано
//   node scripts/ftmo-push.mjs --write  — записати
// Вхід: prop-scraper/out/ftmo/*.txt (python prop-scraper/crawl_ftmo.py).
// Ключі — з .env: PROD_SUPABASE_URL і PROD_SUPABASE_SERVICE_KEY (service_role
// прод-проєкту). Навмисно не SUPABASE_URL: там у .env інший, старий проєкт.
// Повторний запуск безпечний: upsert за url. extracted_at не ставимо —
// монітор сам витягне факти, а text_hash той самий, що рахує він (stableHash).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
process.env.SUPABASE_URL ||= 'http://x'; process.env.SUPABASE_SERVICE_KEY ||= 'x'; process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { stableHash } = await import('../netlify/functions/_propRules.mjs');

const WRITE = process.argv.includes('--write');
const dir = path.join(root, 'prop-scraper/out/ftmo');
const SECTION = { faq: 'FAQ', page: 'Правила', update: 'Оновлення' };
const now = new Date().toISOString();

const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).map((f) => {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const head = raw.slice(0, raw.indexOf('\n\n'));
  const text = raw.slice(raw.indexOf('\n\n') + 2).trim();
  const url = (head.match(/^URL: (.+)$/m) || [])[1];
  const title = ((head.match(/^TITLE: (.+)$/m) || [])[1] || '').replace(/\s*\|\s*FTMO\.com$/i, '').trim() || null;
  return { firm: 'FTMO', url, title, section: SECTION[f.split('__')[0]] || null, text, text_hash: stableHash(text), active: true, checked_at: now };
}).filter((r) => r.url && r.text.length > 100);

const by = rows.reduce((m, r) => ({ ...m, [r.section]: (m[r.section] || 0) + 1 }), {});
console.log(`сторінок: ${rows.length}`, by, `символів: ${rows.reduce((s, r) => s + r.text.length, 0)}`);

if (!WRITE) { console.log('сухий прогін. Записати: node scripts/ftmo-push.mjs --write'); process.exit(0); }

const URL_ = (env.PROD_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.PROD_SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) { console.error('Додай у .env PROD_SUPABASE_URL і PROD_SUPABASE_SERVICE_KEY (service_role прод-проєкту)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

/* source_id — джерело FTMO, яке вже є в prop_rule_sources (індекс сайту). */
const src = await fetch(`${URL_}/rest/v1/prop_rule_sources?select=id,kind,url&firm=eq.FTMO`, { headers: H }).then((r) => r.json());
if (!Array.isArray(src)) { console.error('prop_rule_sources:', JSON.stringify(src).slice(0, 200)); process.exit(1); }
const source = src.find((s) => s.kind === 'index') || src.find((s) => s.kind === 'rules');
console.log('джерела FTMO:', src.map((s) => `${s.kind}:${s.id}`).join(', ') || 'немає', '→ беру', source?.id ?? 'null');

let ok = 0;
for (let i = 0; i < rows.length; i += 50) {
  const chunk = rows.slice(i, i + 50).map((r) => ({ ...r, source_id: source?.id ?? null }));
  const r = await fetch(`${URL_}/rest/v1/prop_rule_pages?on_conflict=url`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(chunk),
  });
  if (!r.ok) { console.error('помилка', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  ok += chunk.length;
  console.log(`  записано ${ok}/${rows.length}`);
}
console.log('готово');
