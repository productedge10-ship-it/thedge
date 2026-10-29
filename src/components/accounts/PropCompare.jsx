import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Scale, TrendingDown, ShieldAlert, Target, Newspaper, ChevronRight } from 'lucide-react';
import { T } from '../../lib/theme';
import { BROKERS } from '../../lib/brokers';
import BrokerMark from '../ui/BrokerMark';

/* ==================================================================
   Порівняння пропів.

   Читається за секунди: зверху — три «найкращі» картки (найбільший
   денний ліміт, найбільша просадка, найменша ціль), далі рядки, де
   кожне число має смужку відносно найкращого значення, а найкраще в
   колонці — зелене. Підпис під кожною колонкою пояснює, що краще:
   більше чи менше. Тип просадки — кольорова мітка (статична легша).
================================================================== */

const TYPES = [['all', 'Усі'], ['1', '1 етап'], ['2', '2 етапи'], ['3', '3+ етапи'], ['0', 'Миттєві']];
const KIND = { 0: 'Миттєвий', 1: '1 етап', 2: '2 етапи', 3: '3+ етапи' };
const FUNDED = /pro trader|funded|master|qualified|ftmo account|instant/i;
const steps = (p) => (p.phases || []).filter((f) => f.profit_target_pct && !FUNDED.test(f.name || ''));
const kindOf = (p) => {
  if (/instant|direct|zero|миттєв/i.test(p.program) || !steps(p).length) return '0';
  const n = steps(p).length;
  return n >= 3 ? '3' : String(n);
};
const DD = {
  static: { label: 'статична', tone: 'ok', hint: 'рахується від стартового балансу' },
  trailing: { label: 'трейлінг', tone: 'warn', hint: 'піднімається разом із прибутком' },
  eod_trailing: { label: 'трейлінг EOD', tone: 'warn', hint: 'піднімається за балансом на кінець дня' },
};

/* higher — чи більше значення краще для трейдера */
const COLS = [
  { id: 'daily', label: 'Денний ліміт', hint: 'більше — м’якше', higher: true, icon: TrendingDown },
  { id: 'max', label: 'Макс. просадка', hint: 'більше — м’якше', higher: true, icon: ShieldAlert },
  { id: 'target', label: 'Ціль', hint: 'менше — легше', higher: false, icon: Target },
  { id: 'days', label: 'Мін. днів', hint: 'менше — швидше', higher: false },
  { id: 'news', label: 'Новини', hint: 'вікно заборони', higher: false, icon: Newspaper },
];

const rgb = (tone) => ({ ok: T.okRgb, warn: T.warnRgb, bad: T.badRgb })[tone] || T.accRgb;

function Bar({ part, best }) {
  return (
    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--edge-sunken)' }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(6, part * 100)}%`, background: best ? T.ok : `rgba(${T.accRgb},0.55)` }} />
    </span>
  );
}

function Best({ icon: Icon, label, value, row }) {
  if (!row) return null;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl p-3.5" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.okRgb},0.12)` }}><Icon size={18} style={{ color: T.ok }} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold uppercase" style={{ color: T.text3, fontFamily: T.mono, letterSpacing: '0.05em' }}>{label}</div>
        <div className="truncate text-[13.5px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{row.firm} · {row.program}</div>
      </div>
      <div className="shrink-0 text-[22px] font-bold tabular-nums" style={{ color: T.ok, fontFamily: T.display, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

export default function PropCompare({ rules, onOpen, mine }) {
  const [type, setType] = useState('all');
  const [sort, setSort] = useState({ id: 'firm', dir: 1 });

  const all = useMemo(() => {
    const out = [];
    for (const b of BROKERS) {
      const d = rules?.[b.id];
      if (!d) continue;
      const n = d.structured?.restricted_news || {};
      const none = /немає обмежень/i.test(n.what_is_restricted || '');
      for (const p of d.structured?.programs || []) {
        const st = steps(p);
        out.push({
          b, p, kind: kindOf(p), firm: b.name, program: p.program, mine: mine?.has?.(b.id),
          daily: p.daily_loss_pct ?? null, max: p.max_loss_pct ?? null,
          target: st.reduce((s, f) => s + Number(f.profit_target_pct || 0), 0) || null,
          steps: st.map((f) => f.profit_target_pct),
          days: (p.phases || []).reduce((s, f) => s + Number(f.min_trading_days || 0), 0),
          news: none ? 0 : (Number(n.window_min_before) || null),
          newsAfter: Number(n.window_min_after) || null,
          dd: DD[p.max_loss_type] || null,
          consistency: !!p.consistency_rule,
        });
      }
    }
    return out;
  }, [rules, mine]);

  const counts = useMemo(() => all.reduce((m, r) => ({ ...m, [r.kind]: (m[r.kind] || 0) + 1 }), { all: all.length }), [all]);
  const rows = useMemo(() => {
    const f = type === 'all' ? all : all.filter((r) => r.kind === type);
    return [...f].sort((a, z) => {
      if (sort.id === 'firm') return (Number(!!z.mine) - Number(!!a.mine)) || a.firm.localeCompare(z.firm) * sort.dir;
      const x = a[sort.id]; const y = z[sort.id];
      if (x == null) return 1; if (y == null) return -1;
      return (x - y) * sort.dir;
    });
  }, [all, type, sort]);

  /* Найкраще й найгірше в колонці серед показаних рядків — для смужок і зеленого. */
  const range = useMemo(() => Object.fromEntries(COLS.map((c) => {
    const v = rows.map((r) => r[c.id]).filter((x) => x != null && (c.id !== 'target' || x > 0));
    return [c.id, { min: Math.min(...v), max: Math.max(...v) }];
  })), [rows]);
  const isBest = (c, v) => v != null && rows.length > 1 && range[c.id].min !== range[c.id].max && v === (c.higher ? range[c.id].max : range[c.id].min);
  const part = (c, v) => {
    const { min, max } = range[c.id];
    if (v == null || !Number.isFinite(max) || max === 0) return 0;
    return c.higher ? v / max : (max === min ? 1 : min / v);
  };
  const pickBest = (id, higher) => rows.filter((r) => r[id] != null && r[id] > 0).sort((a, z) => (higher ? z[id] - a[id] : a[id] - z[id]))[0];

  const sortBy = (c) => setSort((s) => (s.id === c.id ? { id: c.id, dir: -s.dir } : { id: c.id, dir: c.higher ? -1 : 1 }));
  const grouped = sort.id === 'firm';
  const Arrow = sort.dir === 1 ? ArrowUp : ArrowDown;
  const GRID = 'grid grid-cols-[minmax(220px,1.6fr)_repeat(3,minmax(110px,1fr))_minmax(80px,0.7fr)_minmax(96px,0.8fr)_24px] items-center gap-x-4';

  return (
    <section className="p-5 sm:p-6" style={{ background: 'var(--edge-surface)', border: '1px solid var(--edge-line)', borderRadius: 20 }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.accRgb},0.12)` }}><Scale size={18} style={{ color: T.acc }} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 text-[17px] font-bold" style={{ color: T.text, fontFamily: T.display }}>Порівняння пропів</h3>
          <p className="m-0 mt-0.5 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>Зелене — найм&apos;якше в колонці. Натисни на рядок, щоб відкрити правила програми.</p>
        </div>
        <div className="inline-flex flex-wrap rounded-xl p-1" style={{ background: 'var(--edge-sunken)', border: '1px solid var(--edge-line)' }}>
          {TYPES.map(([id, label]) => counts[id] ? (
            <button key={id} type="button" onClick={() => setType(id)} className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors"
              style={{ fontFamily: T.sans, color: type === id ? T.text : T.text3, background: type === id ? 'var(--edge-surface)' : 'transparent', boxShadow: type === id ? '0 2px 8px rgba(0,0,0,0.25)' : 'none' }}>
              {label}<span className="text-[11px] tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>{counts[id]}</span>
            </button>
          ) : null)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Best icon={TrendingDown} label="Найбільший денний ліміт" row={pickBest('daily', true)} value={`${pickBest('daily', true)?.daily}%`} />
        <Best icon={ShieldAlert} label="Найбільша просадка" row={pickBest('max', true)} value={`${pickBest('max', true)?.max}%`} />
        <Best icon={Target} label="Найменша ціль" row={pickBest('target', false)} value={`${pickBest('target', false)?.target}%`} />
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={`${GRID} px-4 pb-2`}>
            <button type="button" onClick={() => setSort((s) => ({ id: 'firm', dir: s.id === 'firm' ? -s.dir : 1 }))} className="flex items-center gap-1 text-left text-[11.5px] font-bold uppercase" style={{ color: sort.id === 'firm' ? T.text : T.text3, fontFamily: T.mono, letterSpacing: '0.05em' }}>
              Проп і програма{sort.id === 'firm' && <Arrow size={11} />}
            </button>
            {COLS.map((c) => (
              <button key={c.id} type="button" onClick={() => sortBy(c)} className="text-left">
                <span className="flex items-center gap-1 text-[11.5px] font-bold uppercase" style={{ color: sort.id === c.id ? T.text : T.text3, fontFamily: T.mono, letterSpacing: '0.05em' }}>
                  {c.label}{sort.id === c.id && <Arrow size={11} />}
                </span>
                <span className="block text-[11px]" style={{ color: T.text4 || T.text3, fontFamily: T.sans }}>{c.hint}</span>
              </button>
            ))}
            <span />
          </div>

          <div className="grid gap-1.5">
            {rows.map((r, i) => (
              <div key={`${r.b.id}-${r.program}-${i}`} className="contents">
              {grouped && r.b.id !== rows[i - 1]?.b.id && (
                <div className={`flex items-center gap-2.5 px-1 pb-1 ${i ? 'pt-4' : ''}`}>
                  <BrokerMark broker={r.b} size={26} />
                  <span className="text-[14.5px] font-bold" style={{ color: T.text, fontFamily: T.display }}>{r.firm}</span>
                  {r.mine && <span className="rounded-md px-1.5 py-px text-[11px] font-semibold" style={{ background: `rgba(${T.accRgb},0.14)`, color: T.acc, fontFamily: T.sans }}>твій рахунок</span>}
                  <span className="text-[12px] tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>{rows.filter((x) => x.b.id === r.b.id).length} прогр.</span>
                </div>
              )}
              <button type="button" onClick={() => onOpen?.(r.b.id, r.program)}
                className={`${GRID} group rounded-2xl px-4 py-2.5 text-left transition-colors hover:bg-[var(--edge-nav-hover)]`}
                style={{ background: r.mine ? `rgba(${T.accRgb},0.06)` : 'var(--edge-sunken)', border: `1px solid ${r.mine ? `rgba(${T.accRgb},0.3)` : 'var(--edge-line)'}` }}>
                <span className="flex min-w-0 items-center gap-3">
                  {!grouped && <BrokerMark broker={r.b} size={34} />}
                  <span className="min-w-0">
                    {!grouped && (
                      <span className="flex items-center gap-2 text-[11.5px]" style={{ color: T.text3, fontFamily: T.sans }}>
                        {r.firm}{r.mine && <span style={{ color: T.acc }}>· твій</span>}
                      </span>
                    )}
                    <span className="block truncate text-[14px] font-semibold" style={{ color: T.text, fontFamily: T.sans }}>{r.program}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span className="rounded-md px-1.5 py-px text-[10.5px] font-semibold" style={{ background: 'var(--edge-surface)', color: T.text2, fontFamily: T.sans, border: '1px solid var(--edge-line)' }}>{KIND[r.kind]}</span>
                      {r.consistency && <span className="rounded-md px-1.5 py-px text-[10.5px] font-semibold" title="Є правило консистентності" style={{ background: `rgba(${T.warnRgb},0.1)`, color: T.warn, fontFamily: T.sans }}>консистентність</span>}
                    </span>
                  </span>
                </span>

                {['daily', 'max'].map((id) => {
                  const c = COLS.find((x) => x.id === id); const v = r[id]; const best = isBest(c, v);
                  return (
                    <span key={id} className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[17px] font-bold tabular-nums" style={{ color: best ? T.ok : T.text, fontFamily: T.display }}>{v != null ? `${v}%` : '—'}</span>
                        {id === 'max' && r.dd && <span className="truncate text-[11px] font-semibold" title={r.dd.hint} style={{ color: `rgb(${rgb(r.dd.tone)})`, fontFamily: T.sans }}>{r.dd.label}</span>}
                      </span>
                      <Bar part={part(c, v)} best={best} />
                    </span>
                  );
                })}

                <span className="min-w-0">
                  {r.steps.length ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {r.steps.map((x, k) => (
                        <span key={k} className="flex items-center gap-1">
                          {k > 0 && <ChevronRight size={11} style={{ color: T.text3 }} />}
                          <span className="rounded-md px-1.5 py-0.5 text-[12.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: isBest(COLS[2], r.target) ? T.ok : T.text, background: 'var(--edge-surface)', border: '1px solid var(--edge-line)' }}>{x}%</span>
                        </span>
                      ))}
                    </span>
                  ) : <span className="text-[13px] font-semibold" style={{ color: T.ok, fontFamily: T.sans }}>без цілі</span>}
                </span>

                <span className="text-[15px] font-bold tabular-nums" style={{ color: r.days ? T.text : T.ok, fontFamily: T.display }}>{r.days || 'нема'}</span>

                <span className="text-[13px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: r.news === 0 ? T.ok : r.news != null ? T.text : T.text3 }}>
                  {r.news === 0 ? 'без обмежень' : r.news != null ? `−${r.news} / +${r.newsAfter ?? r.news} хв` : '—'}
                </span>

                <ChevronRight size={16} className="opacity-40 transition-opacity group-hover:opacity-100" style={{ color: T.text3 }} />
              </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="m-0 mt-3 text-[12px]" style={{ color: T.text3, fontFamily: T.sans }}>
        <b style={{ color: T.ok }}>Статична</b> просадка рахується від стартового балансу, <b style={{ color: T.warn }}>трейлінг</b> піднімається разом із прибутком — вона суворіша. Новинне вікно часто діє лише на funded-рахунках.
      </p>
    </section>
  );
}
