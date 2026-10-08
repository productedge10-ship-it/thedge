import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown, Dices, History, X, Loader2 } from 'lucide-react';
import { T } from '../../lib/theme';
import { ACT } from './accent';
import { t as tx, LOCALE } from '../../lib/lang';
import { getManifest } from '../../lib/candles/remote';

/* ==================================================================
   Дата старту реплею — календар, який знає історію активу.

   Зверху — вся доступна історія інструмента з сервера: роки, а в
   кожному дванадцять клітинок-місяців (є свічки — підсвічено). Одразу
   видно, скільки там часу і з якого місяця можна починати. Клік по
   місяцю — календар переходить туди.

   Дні поза історією не клікаються, вихідні приглушені (ринок
   закритий). Швидкі варіанти: найраніша дата, рік тому, пів року
   тому і випадкова дата — щоб не підганяти бектест під знайомий
   відрізок ринку.
================================================================== */

const pad = (n) => String(n).padStart(2, '0');
const ymOf = (y, m) => `${y}-${pad(m + 1)}`;
const isoOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const mono = (size, extra = {}) => ({ fontFamily: T.mono, fontSize: size, ...extra });

const monthName = (y, m, style = 'long') => {
  const s = new Date(Date.UTC(y, m, 15)).toLocaleDateString(LOCALE, { month: style, timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1).replace('.', '');
};
const fmtIso = (iso) => (iso ? iso.split('-').reverse().join('.') : '');

/* «6 р. 4 міс.» — скільки історії. */
const spanText = (months) => {
  const y = Math.floor(months / 12); const m = months % 12;
  const parts = [];
  if (y) parts.push(tx(`${y} р.`, `${y}y`));
  if (m) parts.push(tx(`${m} міс.`, `${m}mo`));
  return parts.join(' ') || tx('менше місяця', 'under a month');
};

export default function HistoryDatePicker({ pair, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, months: null, pair: '' });

  /* Історія активу з сервера — які місяці є. */
  useEffect(() => {
    const p = String(pair || '').toUpperCase();
    if (!p) return undefined;
    let alive = true;
    setState({ loading: true, months: null, pair: p });
    getManifest(p)
      .then((m) => { if (alive) setState({ loading: false, months: m?.months ? Object.keys(m.months).sort() : [], pair: p }); })
      .catch(() => { if (alive) setState({ loading: false, months: [], pair: p }); });
    return () => { alive = false; };
  }, [pair]);

  const months = useMemo(() => state.months || [], [state.months]);
  const have = useMemo(() => new Set(months), [months]);
  const first = months[0] || null;
  const last = months[months.length - 1] || null;
  const today = todayIso();
  const minIso = first ? `${first}-01` : null;
  const maxIso = today;

  /* Дата поза історією (змінили актив) — скидаємо. */
  useEffect(() => {
    if (value && first && (value < minIso || !have.has(value.slice(0, 7)))) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, last]);

  const init = value || (last ? `${last}-01` : today);
  const [view, setView] = useState({ y: +init.slice(0, 4), m: +init.slice(5, 7) - 1 });
  useEffect(() => {
    const at = value || (last ? `${last}-01` : null);
    if (at) setView({ y: +at.slice(0, 4), m: +at.slice(5, 7) - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  const years = useMemo(() => {
    if (!first) return [];
    const out = [];
    for (let y = +first.slice(0, 4); y <= +today.slice(0, 4); y += 1) out.push(y);
    return out;
  }, [first, today]);

  const okDay = (iso) => {
    if (iso > maxIso) return false;
    if (!first) return true; // історії на сервері немає — будь-яка минула дата
    return have.has(iso.slice(0, 7));
  };

  const pick = (iso) => { onChange(iso); setOpen(false); };

  /* Швидкі варіанти. Ліву межу тримаємо на місяць від початку історії,
     щоб ліворуч від старту було видно хоч трохи графіка. */
  const shiftIso = (monthsBack) => {
    const d = new Date(); d.setUTCMonth(d.getUTCMonth() - monthsBack);
    let iso = d.toISOString().slice(0, 10);
    if (minIso && iso < minIso) iso = minIso;
    return iso;
  };
  const earliest = first ? `${months[Math.min(1, months.length - 1)]}-01` : null;
  const randomIso = () => {
    const pool = months.slice(1, Math.max(2, months.length - 1));
    if (!pool.length) return null;
    for (let i = 0; i < 40; i += 1) {
      const ym = pool[Math.floor(Math.random() * pool.length)];
      const y = +ym.slice(0, 4); const m = +ym.slice(5, 7) - 1;
      const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const d = 1 + Math.floor(Math.random() * dim);
      const wd = new Date(Date.UTC(y, m, d)).getUTCDay();
      if (wd !== 0 && wd !== 6) return isoOf(y, m, d);
    }
    return null;
  };

  /* Сітка місяця: понеділок першим. */
  const { y, m } = view;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const step = (d) => setView((v) => { const k = v.y * 12 + v.m + d; return { y: Math.floor(k / 12), m: ((k % 12) + 12) % 12 }; });
  const canPrev = !first || ymOf(y, m) > first;
  const canNext = ymOf(y, m) < today.slice(0, 7);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(LOCALE, { weekday: 'short', timeZone: 'UTC' }).slice(0, 2));

  const total = months.length;
  const summary = state.loading
    ? tx('Дивлюсь історію активу…', 'Checking the asset history…')
    : first
      ? `${monthName(+first.slice(0, 4), +first.slice(5, 7) - 1, 'short')} ${first.slice(0, 4)} — ${monthName(+last.slice(0, 4), +last.slice(5, 7) - 1, 'short')} ${last.slice(0, 4)} · ${spanText(total)}`
      : tx('На сервері немає історії цього активу — точку старту обереш на графіку', 'No server history for this asset — pick the start on the chart');

  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <span className="uppercase" style={mono(9.5, { letterSpacing: '1.8px', fontWeight: 600, color: T.text3 })}>
        {tx('Почати реплей з дати · не обовʼязково', 'Start replay from · optional')}
      </span>

      {/* Поле */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
        className="flex cursor-pointer items-center justify-between"
        style={{
          minHeight: 56, borderRadius: 14, padding: '8px 14px', gap: 12,
          background: T.sunken,
          border: `1px solid ${open ? ACT.to : T.line}`,
          boxShadow: open ? `0 0 0 4px rgba(${ACT.rgb},0.13)` : 'none',
          transition: 'border-color .18s, box-shadow .18s',
        }}
      >
        <span className="flex min-w-0 items-center" style={{ gap: 11 }}>
          <span className="grid shrink-0 place-items-center" style={{ width: 34, height: 34, borderRadius: 10, background: `rgba(${ACT.rgb},0.14)`, color: 'var(--edge-acc)' }}>
            {state.loading ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} strokeWidth={2.1} />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span style={value ? mono(15, { fontWeight: 600, color: T.text }) : { fontFamily: T.sans, fontSize: 14.5, color: T.text3 }}>
              {value ? fmtIso(value) : tx('Обрати дату старту', 'Pick a start date')}
            </span>
            <span className="truncate" style={{ fontFamily: T.sans, fontSize: 11.5, color: T.text3, marginTop: 2 }}>{summary}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center" style={{ gap: 4 }}>
          {value && (
            <button
              type="button"
              aria-label={tx('Очистити дату', 'Clear date')}
              onClick={(e) => { e.stopPropagation(); onChange(''); }}
              className="grid h-7 w-7 place-items-center rounded-lg transition-colors hover:bg-white/10"
              style={{ color: T.text3 }}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={16} style={{ color: T.text3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </span>
      </div>

      {/* Календар — розгортається під полем, а не спливає: модалка його не обріже. */}
      {open && (
        <div style={{ borderRadius: 16, background: T.sunken, border: `1px solid ${T.lineHi}`, padding: 14, animation: 'edgeFly .16s ease-out' }}>
          {/* Історія активу: роки × місяці */}
          {first && (
            <div style={{ marginBottom: 12 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 7 }}>
                <span className="flex items-center uppercase" style={mono(9.5, { letterSpacing: '1.6px', fontWeight: 600, color: T.text3, gap: 6 })}>
                  <History size={12} /> {tx('Історія', 'History')} {state.pair}
                </span>
                <span style={mono(10.5, { color: T.text3 })}>{total} {tx('міс.', 'mo')}</span>
              </div>
              <div className="flex flex-col" style={{ gap: 3 }}>
                {years.map((yy) => (
                  <div key={yy} className="flex items-center" style={{ gap: 6 }}>
                    <span style={mono(10, { width: 32, color: yy === y ? T.text : T.text3, fontWeight: yy === y ? 700 : 500 })}>{yy}</span>
                    <div className="grid flex-1" style={{ gridTemplateColumns: 'repeat(12, 1fr)', gap: 3 }}>
                      {Array.from({ length: 12 }, (_, mm) => {
                        const ym = ymOf(yy, mm);
                        const on = have.has(ym);
                        const cur = yy === y && mm === m;
                        const sel = value && value.slice(0, 7) === ym;
                        return (
                          <button
                            key={mm}
                            type="button"
                            disabled={!on}
                            title={`${monthName(yy, mm)} ${yy}${on ? '' : ` · ${tx('немає свічок', 'no candles')}`}`}
                            onClick={() => setView({ y: yy, m: mm })}
                            style={{
                              height: 11, borderRadius: 3,
                              background: sel ? ACT.to : on ? `rgba(${ACT.rgb},${cur ? 0.75 : 0.32})` : 'rgba(255,255,255,0.04)',
                              boxShadow: cur ? `0 0 0 1.5px ${ACT.to}` : 'none',
                              cursor: on ? 'pointer' : 'default',
                              transition: 'background .15s',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Місяць */}
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <button type="button" disabled={!canPrev} onClick={() => step(-1)} aria-label={tx('Попередній місяць', 'Previous month')} className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-25" style={{ color: T.text2 }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontFamily: T.display, fontSize: 15, fontWeight: 600, color: T.text, letterSpacing: '-0.2px' }}>
              {monthName(y, m)} <span style={{ color: T.text3 }}>{y}</span>
            </span>
            <button type="button" disabled={!canNext} onClick={() => step(1)} aria-label={tx('Наступний місяць', 'Next month')} className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/10 disabled:opacity-25" style={{ color: T.text2 }}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {weekdays.map((w, i) => (
              <span key={w + i} className="text-center uppercase" style={mono(9.5, { letterSpacing: '1px', fontWeight: 600, color: i >= 5 ? T.text4 : T.text3, paddingBottom: 4 })}>{w}</span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const iso = isoOf(y, m, d);
              const ok = okDay(iso);
              const weekend = i % 7 >= 5;
              const sel = value === iso;
              const isToday = iso === today;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!ok}
                  onClick={() => pick(iso)}
                  title={!ok ? tx('Немає свічок', 'No candles') : weekend ? tx('Вихідний — ринок закритий, реплей почнеться з понеділка', 'Weekend — market closed, replay starts Monday') : ''}
                  className="relative grid place-items-center transition-colors"
                  style={{
                    height: 34, borderRadius: 9,
                    ...mono(12.5, { fontWeight: sel ? 700 : 500 }),
                    color: sel ? '#fff' : !ok ? T.text4 : weekend ? T.text3 : T.text,
                    background: sel ? `linear-gradient(180deg, ${ACT.from}, ${ACT.to})` : 'transparent',
                    boxShadow: isToday && !sel ? `inset 0 0 0 1px ${T.lineHi}` : 'none',
                    opacity: ok ? 1 : 0.35,
                    textDecoration: ok ? 'none' : 'line-through',
                    cursor: ok ? 'pointer' : 'not-allowed',
                  }}
                  onMouseEnter={(e) => { if (ok && !sel) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Швидкі варіанти */}
          <div className="flex flex-wrap" style={{ gap: 6, marginTop: 12 }}>
            {[
              earliest && [tx('З початку історії', 'From the start'), () => pick(earliest)],
              [tx('Рік тому', 'A year ago'), () => pick(shiftIso(12))],
              [tx('Пів року тому', '6 months ago'), () => pick(shiftIso(6))],
              first && [<span key="r" className="flex items-center" style={{ gap: 5 }}><Dices size={13} /> {tx('Випадкова дата', 'Random date')}</span>, () => { const r = randomIso(); if (r) pick(r); }, tx('Чесний бектест: не знаєш наперед, що буде на графіку', 'Honest test: you don’t know what the chart will do')],
            ].filter(Boolean).map(([label, fn, title], i) => (
              <button
                key={i}
                type="button"
                onClick={fn}
                title={title || ''}
                style={{
                  height: 32, padding: '0 11px', borderRadius: 9,
                  fontFamily: T.sans, fontSize: 12.5, fontWeight: 600,
                  color: T.text2, background: 'rgba(255,255,255,0.03)', boxShadow: `inset 0 0 0 1px ${T.line}`,
                  transition: 'all .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.boxShadow = `inset 0 0 0 1px rgba(${ACT.rgb},0.5)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${T.line}`; }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
