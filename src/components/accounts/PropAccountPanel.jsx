import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Gauge, Info, PlugZap, ShieldAlert, Target, TrendingDown } from 'lucide-react';
import { T } from '../../lib/theme';
import Button from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { listMt5Accounts, listMt5Snapshots } from '../../lib/mt5Store';
import { fetchWeek } from '../../lib/newsStore';
import { sameFirm } from '../../lib/propRules';
import { programIndex } from '../../lib/propRulesData';
import { initialOf, limitsFor } from '../../lib/propChecks';
import { guard } from '../../lib/propGuard';
import { openSettings } from '../../lib/settings';

/* ==================================================================
   «Мій рахунок»: скільки ще можна втратити сьогодні, скільки до
   просадки й до цілі — з живих чисел MT5, і перевірка угод за 30 днів
   на можливі порушення правил пропа (новини, денний ліміт).
================================================================== */

const LEVEL = { ok: 'усе в нормі', warn: 'є на що глянути', bad: 'є порушення' };
const TONE = { ok: T.ok, info: T.text2, warn: T.warn, bad: T.bad };
const RGB = { ok: T.okRgb, info: T.accRgb, warn: T.warnRgb, bad: T.badRgb };
const CARD = { background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 };
const money = (v, cur = 'USD') => (v == null || Number.isNaN(v) ? '—' : new Intl.NumberFormat('uk-UA', { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(v));
const day30 = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };

function Meter({ icon: Icon, label, big, sub, part, tone }) {
  const p = Math.max(0, Math.min(1, part ?? 0));
  return (
    <div className="min-w-0 rounded-2xl p-4" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: T.text3, fontFamily: T.sans }}><Icon size={14} style={{ color: tone }} />{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none tabular-nums" style={{ color: T.text, fontFamily: T.display, letterSpacing: '-0.03em' }}>{big}</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--edge-line)' }}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${p * 100}%`, background: tone }} />
      </div>
      {sub && <div className="mt-2 text-[12px] leading-[1.45]" style={{ color: T.text3, fontFamily: T.sans }}>{sub}</div>}
    </div>
  );
}

function Account({ mt5, firmId, data, ctx, dbList, events, uid, policy }) {
  const programs = data?.structured?.programs || [];
  const propAcc = useMemo(() => (ctx?.accounts || []).find((a) => String(a.firm_name || '').includes(mt5.login)) || (ctx?.accounts || []).find((a) => sameFirm(a.firm_name, data?.firm || firmId)), [ctx, mt5, data, firmId]);
  const [pi, setPi] = useState(() => programIndex(programs, propAcc));
  const [snaps, setSnaps] = useState(null);
  const [trades, setTrades] = useState(null);

  useEffect(() => {
    let off = false;
    listMt5Snapshots(mt5.id, 500).then((s) => !off && setSnaps(s)).catch(() => !off && setSnaps([]));
    supabase.from('trades').select('id,plan_date,entry_time,exit_time,pair,profit_money,risk_money,swap,external_id')
      .eq('user_id', uid).like('external_id', `${mt5.login}:%`).gte('plan_date', day30()).order('plan_date', { ascending: false })
      .then(({ data: t }) => !off && setTrades(t || []));
    return () => { off = true; };
  }, [mt5.id, mt5.login, uid]);

  const program = policy?.program || programs[pi];
  const initial = initialOf(propAcc, mt5, snaps);
  const bal = Number(mt5.balance); const eq = Number(mt5.equity ?? mt5.balance);
  const lim = useMemo(() => limitsFor(policy?.stage === 'funded' && program ? { ...program, phases: [] } : program, { initial, balance: bal, equity: eq, snaps }), [policy?.stage, program, initial, bal, eq, snaps]);
  const cur = mt5.currency || 'USD';
  const g = useMemo(() => (trades ? guard({ firmId, policy, lim, trades, events, dbList, initial, money: (v) => money(v, cur) }) : null), [firmId, policy, lim, trades, events, dbList, initial, cur]);

  const pick = async (i) => {
    setPi(i);
    if (propAcc?.id) await supabase.from('prop_accounts').update({ rules_program: programs[i]?.program || null }).eq('id', propAcc.id);
  };
  return (
    <section style={CARD} className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold" style={{ color: T.text, fontFamily: T.display }}>{mt5.account_title || `MT5 ${mt5.login}`}</div>
          <div className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: T.text3, fontFamily: T.sans }}>
            #{mt5.login} · баланс {money(bal, cur)} · equity {money(eq, cur)}{initial ? ` · старт ${money(initial, cur)}` : ''}
          </div>
        </div>
        {!policy && programs.length > 1 && (
          <label className="flex items-center gap-2 text-[12.5px]" style={{ color: T.text3, fontFamily: T.sans }}>
            Моя програма
            <select value={pi} onChange={(e) => pick(Number(e.target.value))} className="h-9 rounded-xl px-2 text-[13px] font-semibold outline-none"
              style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)', color: T.text, fontFamily: T.sans }}>
              {programs.map((p, i) => <option key={p.program} value={i}>{p.program}</option>)}
            </select>
          </label>
        )}
      </div>

      {!lim && <p className="m-0 mt-4 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>{snaps ? 'Не знаю розміру рахунку — вкажи початковий баланс у «Рахунках».' : 'Рахую…'}</p>}
      {lim && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {lim.daily && (
            <Meter icon={TrendingDown} label="Можна втратити сьогодні" big={money(Math.max(lim.daily.left, 0), cur)} part={lim.daily.used / lim.daily.limit}
              tone={lim.daily.left <= lim.daily.limit * 0.25 ? T.bad : lim.daily.left <= lim.daily.limit * 0.5 ? T.warn : T.ok}
              sub={`Ліміт ${program.daily_loss_pct}% = ${money(lim.daily.limit, cur)} · не опускайся нижче ${money(lim.daily.floor, cur)}`} />
          )}
          {lim.max && (
            <Meter icon={ShieldAlert} label="До макс. просадки" big={money(Math.max(lim.max.left, 0), cur)} part={lim.max.used / lim.max.limit}
              tone={lim.max.left <= lim.max.limit * 0.25 ? T.bad : lim.max.left <= lim.max.limit * 0.5 ? T.warn : T.ok}
              sub={`Межа рахунку ${money(lim.max.floor, cur)}${lim.max.trailing ? ' · трейлінг від найвищого балансу' : ''}`} />
          )}
          {lim.target && (
            <Meter icon={Target} label="До цілі" big={money(Math.max(lim.target.goal - lim.target.done, 0), cur)} part={lim.target.done / lim.target.goal} tone={T.acc}
              sub={`Ціль ${lim.target.pct}% = ${money(lim.target.goal, cur)} · зароблено ${money(lim.target.done, cur)}`} />
          )}
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center gap-2 text-[14px] font-bold" style={{ color: T.text, fontFamily: T.display }}>
          <Gauge size={16} style={{ color: T.acc }} />Стежимо за правилами
          {g && <span className="rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ fontFamily: T.sans, color: TONE[g.level], background: `rgba(${RGB[g.level]},0.12)` }}>{LEVEL[g.level]}</span>}
        </div>
        {!policy && <p className="m-0 mt-2 text-[13px]" style={{ color: T.warn, fontFamily: T.sans }}>Вкажи тип рахунку вище — тоді перевірятимемо лише ті правила, що діють саме на ньому.</p>}
        {!g && <p className="m-0 mt-2 text-[13px]" style={{ color: T.text3 }}>Перевіряю…</p>}
        {g && (
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {g.items.map((x) => {
              const Icon = x.level === 'bad' ? AlertTriangle : x.level === 'warn' ? AlertTriangle : x.level === 'info' ? Info : CheckCircle2;
              return (
                <div key={x.id} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5" style={{ background: x.level === 'ok' || x.level === 'info' ? 'var(--edge-sunken)' : `rgba(${RGB[x.level]},0.07)`, border: `1px solid ${x.level === 'ok' || x.level === 'info' ? 'var(--edge-line)' : `rgba(${RGB[x.level]},0.3)`}` }}>
                  <Icon size={15} className="mt-[2px] shrink-0" style={{ color: TONE[x.level] }} />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{x.title}</div>
                    {x.text && <div className="mt-0.5 whitespace-pre-line text-[12.5px] leading-[1.5]" style={{ color: T.text3, fontFamily: T.sans }}>{x.text}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="m-0 mt-2 text-[11.5px] leading-[1.5]" style={{ color: T.text3, fontFamily: T.sans }}>
          Перевірка орієнтовна, за угодами останніх 30 днів: час угод і новин — твій місцевий, день рахуємо від півночі, а не за годинником пропа; «тримав через ніч» — за свопом. Остаточне рішення — за пропом.
        </p>
      </div>
    </section>
  );
}

export default function PropAccountPanel({ firmId, data, ctx, dbList, weeks, uid, policy }) {
  const [list, setList] = useState(null);
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    let off = false;
    listMt5Accounts().then((a) => !off && setList(a.filter((x) => x.broker === firmId))).catch(() => !off && setList([]));
    return () => { off = true; };
  }, [firmId]);
  useEffect(() => {
    let off = false;
    Promise.all([fetchWeek(-1), fetchWeek(-2), fetchWeek(-3), fetchWeek(-4)].map((p) => p.catch(() => []))).then((w) => !off && setPrev(w.flat()));
    return () => { off = true; };
  }, []);
  const events = useMemo(() => [...(weeks?.[0] || []), ...(prev || [])], [weeks, prev]);

  if (!list) return <div className="py-10 text-center text-[13px]" style={{ color: T.text3 }}>Завантажую рахунки…</div>;
  if (!list.length) {
    return (
      <section style={CARD} className="flex flex-col items-start gap-3 p-6">
        <PlugZap size={22} style={{ color: T.acc }} />
        <div className="text-[15px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Підключи MT5-рахунок {data?.firm || ''}</div>
        <p className="m-0 max-w-[520px] text-[13.5px] leading-[1.6]" style={{ color: T.text2, fontFamily: T.sans }}>
          Тоді тут буде видно, скільки ще можна втратити сьогодні, скільки лишилось до просадки й до цілі, а угоди перевірятимуться на порушення правил.
        </p>
        <Button onClick={() => openSettings('connect')}>Підключити MT5</Button>
      </section>
    );
  }
  return <div className="grid gap-4">{list.map((m) => <Account key={m.id} mt5={m} firmId={firmId} data={data} ctx={ctx} dbList={dbList} events={events} uid={uid} policy={policy} />)}</div>;
}
