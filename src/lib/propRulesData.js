import { supabase } from './supabase';
import { BROKERS } from './brokers';
import { sameFirm } from './propRules';

/* ==================================================================
   Правила пропів, які бачить юзер, — одне місце завантаження.

   Поточна версія з бази (prop_rule_versions). Поки база порожня —
   локальні src/dev/prop-rules/<id>.json, які збирає scripts/prop-build.mjs.
   Кеш на 10 хв: цим користуються сторінка правил, нагадування про
   новини, ліміти й перевірка угод.
================================================================== */

const LOCAL = import.meta.glob('../dev/prop-rules/*.json');
let cache = { at: 0, data: null, wait: null };

export async function loadPropRules(force = false) {
  if (!force && cache.data && Date.now() - cache.at < 10 * 60_000) return cache.data;
  if (!force && cache.wait) return cache.wait;
  cache.wait = (async () => {
    const { data } = await supabase.from('prop_rule_versions')
      .select('firm_id,data,changes,summary,built_at,created_at,is_current').eq('pending', false).order('created_at', { ascending: false });
    const cur = (data || []).filter((r) => r.is_current);
    let rules; let versions = {};
    if (cur.length) {
      rules = Object.fromEntries(cur.map((r) => [r.firm_id, { ...r.data, built_at: r.data.built_at || r.built_at }]));
      versions = (data || []).reduce((m, r) => ({ ...m, [r.firm_id]: [...(m[r.firm_id] || []), r] }), {});
    } else {
      const entries = await Promise.all(Object.entries(LOCAL).map(async ([p, load]) => [p.match(/([^/]+)\.json$/)[1], (await load()).default]));
      rules = Object.fromEntries(entries);
    }
    cache = { at: Date.now(), data: { rules, versions }, wait: null };
    return cache.data;
  })().catch(() => { cache.wait = null; return { rules: {}, versions: {} }; });
  return cache.wait;
}

/* id фірм (як у brokers.js), де в людини є активний рахунок. */
export const myFirmIds = (accounts) => BROKERS.filter((b) => (accounts || []).some((a) => sameFirm(a.firm_name, b.name))).map((b) => b.id);

/* Програма з правил, що відповідає рахунку: rules_program, якщо обрана,
   інакше — вгадуємо з назви рахунку («FTMO Challenge Swing USD» → 2-Step…). */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function programIndex(programs, account) {
  if (!programs?.length) return 0;
  const want = norm(account?.rules_program);
  if (want) {
    const i = programs.findIndex((p) => norm(p.program) === want);
    if (i >= 0) return i;
    const j = programs.findIndex((p) => want.includes(norm(p.program)) || norm(p.program).includes(want));
    if (j >= 0) return j;
  }
  const title = norm(account?.firm_name);
  const k = programs.findIndex((p) => norm(p.program).split(' ').filter((w) => w.length > 2 || /\d/.test(w)).every((w) => title.includes(w)));
  return k >= 0 ? k : 0;
}
