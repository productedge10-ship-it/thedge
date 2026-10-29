import { useEffect, useMemo, useState } from 'react';
import { T } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { BROKERS, brokerById } from '../../lib/brokers';
import BrokerMark from '../ui/BrokerMark';
import PropRulesView from './PropRulesView';
import PropNewsCalendar, { PropNewsAlert } from './PropNewsCalendar';
import { fetchWeek } from '../../lib/newsStore';
import { POLICY, restrictedEvents, ymdLocal } from '../../lib/propNews';

/* DEV: правила всіх пропів з автоімпорту у тому вигляді, який побачить юзер.
   Дані — поточна версія з бази (prop_rule_versions), а якщо її ще нема —
   src/dev/prop-rules/<id>.json (scripts/prop-build.mjs). У проді — «Coming Soon». */
const LOCAL = import.meta.glob('../../dev/prop-rules/*.json');
const PICK_KEY = 'edge_prop_rules_firm';

export default function FtmoDevPreview() {
  const [rules, setRules] = useState(null); // { id: data }
  const [from, setFrom] = useState('');
  const [weeks, setWeeks] = useState(null); // [цей тиждень, наступний]
  const [dbNews, setDbNews] = useState({}); // firm → рядки prop_restricted_news
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState(() => { try { return localStorage.getItem(PICK_KEY) || 'ftmo'; } catch { return 'ftmo'; } });

  useEffect(() => {
    let off = false;
    (async () => {
      const { data } = await supabase.from('prop_rule_versions').select('firm_id,data,built_at').eq('is_current', true);
      if (data?.length) { if (!off) { setRules(Object.fromEntries(data.map((r) => [r.firm_id, { ...r.data, built_at: r.data.built_at || r.built_at }]))); setFrom('з бази'); } return; }
      const entries = await Promise.all(Object.entries(LOCAL).map(async ([p, load]) => [p.match(/([^/]+)\.json$/)[1], (await load()).default]));
      if (!off) { setRules(Object.fromEntries(entries)); setFrom('з src/dev/prop-rules'); }
    })().catch(() => !off && setRules({}));
    return () => { off = true; };
  }, []);

  useEffect(() => {
    let off = false;
    Promise.all([fetchWeek(0), fetchWeek(1).catch(() => [])]).then((w) => !off && setWeeks(w)).catch(() => !off && setWeeks([[], []]));
    const firms = [...new Set(Object.values(POLICY).map((p) => p.db).filter(Boolean))];
    const from = ymdLocal(new Date(Date.now() - 8 * 864e5));
    supabase.from('prop_restricted_news').select('firm,day,currency,title').in('firm', firms).gte('day', from)
      .then(({ data }) => { if (!off && data) setDbNews(data.reduce((m, r) => ({ ...m, [r.firm]: [...(m[r.firm] || []), r] }), {})); });
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { off = true; clearInterval(t); };
  }, []);

  /* Заборонені події кожного пропа на сьогодні — для бейджа на плитці і попередження. */
  const today = useMemo(() => {
    if (!weeks || !rules) return {};
    const key = ymdLocal(new Date(now));
    const rows = weeks[0].filter((ev) => ev.day === key);
    return Object.fromEntries(Object.keys(rules).map((id) => [id, restrictedEvents(id, rules[id], rows, dbNews[POLICY[id]?.db] || [], now)]));
  }, [weeks, rules, dbNews, now]);

  /* Порядок — як у списку автоімпорту; без правил фірму не показуємо. */
  const firms = useMemo(() => BROKERS.filter((b) => rules?.[b.id]), [rules]);
  const cur = rules?.[pick] ? pick : firms[0]?.id;
  const choose = (id) => { setPick(id); try { localStorage.setItem(PICK_KEY, id); } catch { /* приватне вікно */ } };

  if (!rules) return null;
  if (!firms.length) return <div className="mb-6 text-[13px]" style={{ color: T.text3 }}>Правил ще нема — запусти node scripts/prop-build.mjs all.</div>;

  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md px-2 py-1 text-[11px] font-bold uppercase" style={{ fontFamily: T.mono, letterSpacing: '0.08em', background: 'rgba(251,191,36,0.14)', color: '#FBBF24' }}>dev</span>
        <span className="text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>так побачить юзер · дані {from}</span>
      </div>

      {/* Вибір пропа: плитки з логотипами, на телефоні гортаються вбік. */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" style={{ scrollbarWidth: 'none' }}>
        {firms.map((b) => {
          const on = b.id === cur;
          const n = rules[b.id]?.structured?.programs?.length || 0;
          return (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => choose(b.id)}
              className="flex shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-2 pr-4 text-left transition-colors"
              style={{
                background: on ? `rgba(${T.accRgb},0.12)` : 'var(--edge-surface)',
                border: `1px solid ${on ? `rgba(${T.accRgb},0.45)` : 'var(--edge-line)'}`,
              }}
            >
              <BrokerMark broker={b} size={32} />
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold leading-tight" style={{ color: on ? T.text : T.text2, fontFamily: T.sans }}>{b.name}</span>
                <span className="block text-[11.5px] leading-tight" style={{ color: T.text3, fontFamily: T.sans }}>{n} {n === 1 ? 'програма' : n < 5 ? 'програми' : 'програм'}</span>
              </span>
              {(() => {
                const xs = (today[b.id] || []).filter((x) => !x.past);
                if (!xs.length) return null;
                const live = xs.some((x) => x.live);
                return (
                  <span className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums" title="Заборонені новини сьогодні"
                    style={{ fontFamily: T.mono, color: live ? '#fff' : T.bad, background: live ? T.bad : `rgba(${T.badRgb},0.14)` }}>
                    {live ? 'зараз' : xs.length}
                  </span>
                );
              })()}
            </button>
          );
        })}
      </div>

      <div className="mb-4 empty:hidden"><PropNewsAlert items={today[cur] || []} firm={brokerById(cur).name} /></div>

      <PropRulesView key={cur} broker={brokerById(cur)} firm={brokerById(cur).name} data={rules[cur]} source={rules[cur]?.source}>
        <PropNewsCalendar firmId={cur} firm={brokerById(cur).name} data={rules[cur]} weeks={weeks} dbList={dbNews[POLICY[cur]?.db] || []} now={now} />
      </PropRulesView>
    </div>
  );
}
