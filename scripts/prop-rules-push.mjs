// Правила пропів src/dev/prop-rules/*.json → Supabase (prop_rule_versions).
//   node scripts/prop-rules-push.mjs           — сухий прогін: що змінилось проти бази
//   node scripts/prop-rules-push.mjs --write   — записати (лише фірми зі змінами)
// Порівняння — з поточною версією в базі. Нова версія стає поточною, поточна —
// попередньою, а стара попередня видаляється (це робить prop_rules_publish).
// Перед першим запуском виконай supabase/2026-10-29_prop_rule_versions.sql.
// Ключі — з .env: PROD_SUPABASE_URL і PROD_SUPABASE_SERVICE_KEY (на екран не друкуються).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRules as hash, versionDiff as diff } from '../netlify/functions/_propVersion.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
const WRITE = process.argv.includes('--write');
const URL_ = (env.PROD_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = env.PROD_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY;
if (!URL_ || !KEY) { console.error('Додай у .env SUPABASE_URL і SUPABASE_KEY (service_role)'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

const dir = path.join(root, 'src/dev/prop-rules');
const cur = await fetch(`${URL_}/rest/v1/prop_rule_versions?select=firm_id,data,data_hash&is_current=eq.true`, { headers: H }).then((r) => r.json());
if (!Array.isArray(cur)) { console.error('prop_rule_versions:', JSON.stringify(cur).slice(0, 200), '\nТаблиці ще нема? Виконай supabase/2026-10-29_prop_rule_versions.sql'); process.exit(1); }
const have = Object.fromEntries(cur.map((r) => [r.firm_id, r]));

for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const id = d.id || f.replace(/\.json$/, '');
  const h = hash(d);
  const prev = have[id];
  if (prev && prev.data_hash === h) { console.log(`${id}: без змін`); if (WRITE) await publish(id, d, h, []); continue; }
  const changes = prev ? diff(prev.data, d) : [];
  console.log(`${id}: ${prev ? `є зміни (${changes.length} у числах${changes.length ? '' : ', решта — у текстах'})` : 'перша версія'}`);
  for (const c of changes) console.log(`   ${c.program} · ${c.field}: ${c.old ?? '—'} → ${c.new ?? '—'}`);
  if (WRITE) console.log('   →', await publish(id, d, h, changes));
}
if (!WRITE) console.log('\nсухий прогін. Записати: node scripts/prop-rules-push.mjs --write');

async function publish(id, d, h, changes) {
  const r = await fetch(`${URL_}/rest/v1/rpc/prop_rules_publish`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_firm_id: id, p_firm: d.firm || id, p_data: { structured: d.structured, rulebook: d.rulebook, source: d.source, built_at: d.built_at }, p_hash: h, p_built_at: d.built_at || null, p_changes: changes }),
  });
  if (!r.ok) { console.error('   помилка', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  return r.json();
}
