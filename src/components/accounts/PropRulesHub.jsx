import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Newspaper, BookOpen, History, Sparkles, Wallet, Scale, Bell } from 'lucide-react';
import { T } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { BROKERS, brokerById } from '../../lib/brokers';
import { fetchWeek } from '../../lib/newsStore';
import { loadPropContext, sameFirm, firmKey } from '../../lib/propRules';
import { POLICY, restrictedEvents, ymdLocal } from '../../lib/propNews';
import BrokerMark from '../ui/BrokerMark';
import PropRulesView from './PropRulesView';
import PropNewsCalendar, { PropNewsAlert } from './PropNewsCalendar';
import PropUpdates from './PropUpdates';
import PropNewsSide from './PropNewsSide';
import PropAccountPanel from './PropAccountPanel';
import PropCompare from './PropCompare';
import PropAsk from './PropAsk';
import { loadPropRules, programIndex } from '../../lib/propRulesData';
import { askNotifyPermission, notifyState } from '../../lib/newsAlerts';
import useCloudState from '../../hooks/useCloudState';
import { guessProfile, policyFor, profileLabel } from '../../lib/propPolicy';
import PropProfile from './PropProfile';

/* ==================================================================
   «Правила мого пропа»: новини → правила → оновлення.

   За замовчуванням відкриті новини того пропа, рахунок якого в людини
   підключений (prop_accounts), бо їх дивляться щодня. Правила й
   історія змін — поруч, на сусідніх вкладках.

   Дані правил: поточна версія з бази (prop_rule_versions), а поки
   її нема — src/dev/prop-rules/<id>.json. Стиль вкладок і плиток —
   як пункти бокового меню: «лампа» з плавним переїздом (layoutId).
================================================================== */

const PICK_KEY = 'edge_prop_rules_firm';
const TAB_KEY = 'edge_prop_rules_tab';
const ACC = T.accRgb;
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватне вікно */ } };

/* Підсвітка активного пункту — та сама, що в меню. */
function Lamp({ id, r = 12 }) {
  return (
    <motion.span layoutId={id} className="pointer-events-none absolute inset-0"
      style={{ borderRadius: r, background: `linear-gradient(100deg, rgba(${ACC},0.18), rgba(${ACC},0.04) 70%)`, boxShadow: `inset 0 0 0 1px rgba(${ACC},0.22)` }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
  );
}

export default function PropRulesHub() {
  const { user } = useAuth();
  const [rules, setRules] = useState(null);       // { firm_id: data }
  const [versions, setVersions] = useState({});   // { firm_id: [{changes, created_at, is_current}] }
  const [ctx, setCtx] = useState(null);           // рахунки і схвалені зміни
  const [weeks, setWeeks] = useState(null);
  const [dbNews, setDbNews] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState(() => read(PICK_KEY, ''));
  const [tab, setTab] = useState(() => read(TAB_KEY, 'news'));
  const [perm, setPerm] = useState(() => notifyState());
  const [progFor, setProgFor] = useState(null); // з порівняння: відкрити конкретну програму
  const [profiles, setProfiles] = useCloudState('prop_profiles_v1', {}); // { firm_id: { program, stage, variant, swingAddon } }

  useEffect(() => {
    let off = false;
    loadPropRules().then((d) => { if (!off) { setRules(d.rules); setVersions(d.versions); } });
    Promise.all([fetchWeek(0), fetchWeek(1).catch(() => [])]).then((w) => !off && setWeeks(w)).catch(() => !off && setWeeks([[], []]));
    const dbFirms = [...new Set(Object.values(POLICY).map((p) => p.db).filter(Boolean))];
    supabase.from('prop_restricted_news').select('firm,day,currency,title').in('firm', dbFirms).gte('day', ymdLocal(new Date(Date.now() - 8 * 864e5)))
      .then(({ data }) => { if (!off && data) setDbNews(data.reduce((m, r) => ({ ...m, [r.firm]: [...(m[r.firm] || []), r] }), {})); });
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { off = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!user?.id) return undefined;
    let off = false;
    loadPropContext(user.id).then((c) => !off && setCtx(c)).catch(() => {});
    return () => { off = true; };
  }, [user?.id]);

  /* Пропи, де в людини є активний рахунок, — першими і з позначкою. */
  const mine = useMemo(() => new Set(BROKERS.filter((b) => ctx?.accounts?.some((a) => sameFirm(a.firm_name, b.name))).map((b) => b.id)), [ctx]);
  const firms = useMemo(() => BROKERS.filter((b) => rules?.[b.id]).sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id))), [rules, mine]);
  const cur = (pick && rules?.[pick] && pick) || firms.find((b) => mine.has(b.id))?.id || firms[0]?.id;
  const broker = cur ? brokerById(cur) : null;
  const data = cur ? rules[cur] : null;
  const dbList = dbNews[POLICY[cur]?.db] || [];

  /* Профіль рахунку: збережений або вгаданий з назви рахунку. */
  const profileOf = (id) => {
    if (profiles?.[id]?.program) return { profile: profiles[id], sure: true };
    const acc = (ctx?.accounts || []).find((a) => sameFirm(a.firm_name, brokerById(id)?.name));
    if (!acc || !rules?.[id]) return { profile: null, sure: false };
    const g = guessProfile(id, rules[id].structured?.programs, `${acc.firm_name || ''} ${acc.rules_program || ''}`);
    return g.profile.program ? g : { profile: null, sure: false };
  };
  /* Невпевнений здогад «можна» не вимикає попереджень — лише «невідомо». */
  const appliesOf = (id) => {
    const { profile, sure } = profileOf(id);
    const r = profile ? (policyFor(id, rules?.[id], profile)?.news.restricted ?? null) : null;
    return r === false && !sure ? null : r;
  };

  const today = useMemo(() => {
    if (!weeks || !rules) return {};
    const key = ymdLocal(new Date(now));
    const rows = weeks[0].filter((ev) => ev.day === key);
    return Object.fromEntries(Object.keys(rules).map((id) => [id, restrictedEvents(id, rules[id], rows, dbNews[POLICY[id]?.db] || [], now).filter((x) => !x.past)]));
  }, [weeks, rules, dbNews, now]);

  /* Схвалені адміном зміни цієї фірми з монітора + різниця версій + те, що проп сам писав. */
  const updates = useMemo(() => {
    if (!broker) return [];
    const out = [];
    for (const c of ctx?.changes || []) if (firmKey(c.firm) === firmKey(broker.name)) out.push({ kind: 'approved', at: c.decided_at || c.created_at, program: c.program, text: c.conclusion, diff: c.diff || [], change: c });
    for (const v of versions[cur] || []) if ((v.changes || []).length) out.push({ kind: 'version', at: v.created_at, diff: v.changes, text: v.summary });
    for (const r of data?.structured?.recent_changes || []) if (r?.change) out.push({ kind: 'firm', at: r.date ? `${r.date}T12:00:00` : null, text: r.change, details: r.details, affects: r.affects, source: r.source });
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [broker, ctx, versions, cur, data]);

  if (!rules) return <div className="py-16 text-center text-[14px]" style={{ color: T.text3 }}>Завантажую…</div>;
  if (!firms.length) return <div className="py-10 text-[13px]" style={{ color: T.text3 }}>Правил ще нема.</div>;

  const choose = (id) => { setPick(id); write(PICK_KEY, id); };
  const chooseTab = (id) => { setTab(id); write(TAB_KEY, id); };
  const { profile, sure } = profileOf(cur);
  const policy = profile ? policyFor(cur, data, profile) : null;
  const applies = appliesOf(cur);
  const saveProfile = async (p) => {
    setProfiles({ ...(profiles || {}), [cur]: p });
    const acc = (ctx?.accounts || []).find((a) => sameFirm(a.firm_name, broker.name));
    if (acc?.id) await supabase.from('prop_accounts').update({ rules_program: p.program || null }).eq('id', acc.id);
  };
  const TABS = [
    { id: 'news', label: 'Новини', icon: Newspaper, badge: applies === false ? 0 : (today[cur]?.length || 0) },
    { id: 'account', label: 'Мій рахунок', icon: Wallet },
    { id: 'rules', label: 'Правила', icon: BookOpen },
    { id: 'compare', label: 'Порівняти', icon: Scale },
    { id: 'updates', label: 'Оновлення', icon: History, badge: updates.length || 0, quiet: true },
  ];
  const programs = data?.structured?.programs || [];
  const myAcc = (ctx?.accounts || []).find((a) => sameFirm(a.firm_name, broker.name));
  const progIdx = progFor?.firm === cur ? Math.max(0, programs.findIndex((p) => p.program === progFor.program))
    : profile?.program ? Math.max(0, programs.findIndex((p) => p.program === profile.program)) : programIndex(programs, myAcc);
  const openFromCompare = (id, program) => { choose(id); setProgFor({ firm: id, program }); chooseTab('rules'); };

  return (
    <div className="grid gap-4">
      {/* Пропи */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label="Проп">
        {firms.map((b) => {
          const on = b.id === cur;
          const xs = appliesOf(b.id) === false ? [] : (today[b.id] || []);
          const live = xs.some((x) => x.live);
          return (
            <button key={b.id} type="button" role="tab" aria-selected={on} onClick={() => choose(b.id)}
              className="relative flex h-14 min-w-0 items-center gap-2.5 rounded-[14px] pl-2 pr-3 transition-colors hover:bg-[var(--edge-nav-hover)]"
              style={{ background: on ? 'transparent' : 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>
              {on && <Lamp id="prop-firm-lamp" r={14} />}
              <span className="relative"><BrokerMark broker={b} size={32} /></span>
              <span className="relative min-w-0 flex-1 text-left">
                <span className="block truncate text-[13.5px] font-semibold leading-tight" style={{ color: on ? T.text : T.text2, fontFamily: T.sans }}>{b.name}</span>
                {mine.has(b.id) && <span className="block text-[11px] leading-tight" style={{ color: T.acc, fontFamily: T.sans }}>твій рахунок</span>}
              </span>
              {xs.length > 0 && (
                <span className="relative rounded-full px-1.5 py-px text-[10.5px] font-bold tabular-nums" title="Заборонені новини сьогодні"
                  style={{ fontFamily: T.mono, color: live ? '#fff' : T.bad, background: live ? T.bad : `rgba(${T.badRgb},0.14)` }}>
                  {live ? 'зараз' : xs.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {applies !== false && <PropNewsAlert items={today[cur] || []} firm={broker.name} />}

      {/* Коротко: що можна на твоєму рахунку */}
      {(profile || mine.has(cur)) && (
        <button type="button" onClick={() => chooseTab('account')} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-[var(--edge-nav-hover)]"
          style={{ background: 'var(--edge-surface)', border: `1px solid ${profile && sure ? 'var(--edge-line)' : `rgba(${T.warnRgb},0.45)`}` }}>
          <span className="text-[13px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}>Твій рахунок:</span>
          <span className="text-[13.5px] font-bold" style={{ color: profile ? T.text : T.warn, fontFamily: T.sans }}>{profile ? profileLabel(cur, profile) : 'вкажи тип — і попередження будуть лише по ділу'}</span>
          {policy && [
            ['Новини', !policy.news.restricted], ['Вихідні', policy.weekend.allowed], ['Ніч', policy.overnight.allowed],
          ].map(([k, ok]) => (
            <span key={k} className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ fontFamily: T.sans, color: ok ? T.ok : T.bad, background: `rgba(${ok ? T.okRgb : T.badRgb},0.12)` }}>{k}: {ok ? 'можна' : 'ні'}</span>
          ))}
          {profile && !sure && <span className="text-[12px]" style={{ color: T.warn, fontFamily: T.sans }}>вгадали з назви — перевір</span>}
          <span className="ml-auto text-[12.5px] font-semibold" style={{ color: T.acc, fontFamily: T.sans }}>{profile ? 'Детальніше' : 'Вказати'} →</span>
        </button>
      )}
      {mine.size > 0 && perm === 'default' && (
        <button type="button" onClick={async () => setPerm(await askNotifyPermission())}
          className="flex items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-[13px]" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', color: T.text2, fontFamily: T.sans }}>
          <Bell size={16} style={{ color: T.acc }} />
          <span><b style={{ color: T.text }}>Увімкни сповіщення</b> — нагадаємо за 15 хв до забороненої новини твого пропа, навіть коли ти на іншій сторінці.</span>
        </button>
      )}

      {/* Вкладки */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-[14px] p-1" role="tablist" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', scrollbarWidth: 'none' }}>
        {TABS.map(({ id, label, icon: Icon, badge, quiet }) => {
          const on = tab === id;
          return (
            <button key={id} type="button" role="tab" aria-selected={on} onClick={() => chooseTab(id)}
              className="relative flex h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] px-3 text-[13.5px] font-semibold transition-colors hover:bg-[var(--edge-nav-hover)] sm:px-4"
              style={{ color: on ? T.text : T.text3, fontFamily: T.sans }}>
              {on && <Lamp id="prop-tab-lamp" />}
              <Icon size={16} className="relative" style={{ color: on ? T.acc : 'currentColor' }} />
              <span className="relative">{label}</span>
              {badge > 0 && (
                <span className="relative rounded-full px-1.5 text-[10.5px] font-bold tabular-nums"
                  style={{ fontFamily: T.mono, color: quiet ? T.text3 : T.bad, background: quiet ? 'var(--edge-sunken)' : `rgba(${T.badRgb},0.14)` }}>{badge}</span>
              )}
            </button>
          );
        })}
        {updates.some((u) => u.at && Date.now() - new Date(u.at).getTime() < 7 * 864e5) && (
          <span className="ml-auto hidden shrink-0 items-center gap-1.5 pr-3 text-[12px] lg:flex" style={{ color: T.acc, fontFamily: T.sans }}>
            <Sparkles size={13} />є свіжі зміни
          </span>
        )}
      </div>

      <motion.div key={`${cur}-${tab}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
        {tab === 'news' && (
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="order-2 min-w-0 xl:order-1"><PropNewsCalendar firmId={cur} firm={broker.name} data={data} weeks={weeks} dbList={dbList} now={now} forMe={applies} who={profile ? profileLabel(cur, profile) : ''} /></div>
            <div className="order-1 xl:order-2"><PropNewsSide firmId={cur} firm={broker.name} data={data} weeks={weeks} dbList={dbList} now={now} applies={applies} /></div>
          </div>
        )}
        {tab === 'account' && (
          <div className="grid gap-4">
            <PropProfile key={`p-${cur}`} firmId={cur} firm={broker.name} data={data} profile={profile} sure={sure} onSave={saveProfile} />
            <PropAccountPanel firmId={cur} data={data} ctx={ctx} dbList={dbList} weeks={weeks} uid={user?.id} policy={policy} />
          </div>
        )}
        {tab === 'rules' && (
          <div className="grid gap-4">
          <PropProfile key={`r-${cur}`} firmId={cur} firm={broker.name} data={data} profile={profile} sure={sure} onSave={saveProfile} />
          <PropRulesView key={`${cur}-${progIdx}`} broker={broker} firm={broker.name} data={data} source={data?.source} hideChanges program={progIdx}
            ask={<PropAsk firmId={cur} firm={broker.name} data={data} />} />
          </div>
        )}
        {tab === 'compare' && <PropCompare rules={rules} onOpen={openFromCompare} mine={mine} />}
        {tab === 'updates' && <div className="max-w-[980px]"><PropUpdates firm={broker.name} items={updates} checkedAt={data?.built_at} /></div>}
      </motion.div>
    </div>
  );
}
