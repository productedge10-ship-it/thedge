import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUp, ArrowDown, ChevronsUpDown, Image as ImageIcon, Trash2,
  TrendingUp, TrendingDown,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { rOf, sessionOf, qualityOf, tagsOf, pairOf } from '../../lib/backtestStats';

/* ==================================================================
   Таблиця угод бектесту.
   Рядок читається за секунду: напрям, дата, якість, RR, результат.
   Все важке (скрін, нотатка) — на клік.
================================================================== */

const qualColor = (q) => ({ 'A+': T.ok, A: T.acc, B: T.warn, C: T.bad }[q] || T.text4);
const resColor = (r) => ({ WIN: T.ok, LOSS: T.bad, BE: T.text3 }[r] || T.text3);

const COLS = [
  { key: 'num',     label: '#',        w: '56px',  align: 'left' },
  { key: 'date',    label: 'Дата',     w: '110px', align: 'left' },
  { key: 'type',    label: 'Напрям',   w: '92px',  align: 'left' },
  { key: 'setup',   label: 'Сетап і нотатка', w: 'minmax(200px,1.8fr)', align: 'left', noSort: true },
  { key: 'session', label: 'Сесія',    w: '104px', align: 'left' },
  { key: 'quality', label: 'Якість',   w: '78px',  align: 'center' },
  { key: 'r',       label: 'R',        w: '86px',  align: 'right' },
  { key: 'result',  label: 'Результат', w: '104px', align: 'center' },
  { key: 'shot',    label: '',         w: '44px',  align: 'center', noSort: true },
  { key: 'del',     label: '',         w: '44px',  align: 'center', noSort: true },
];

const GRID = COLS.map((c) => c.w).join(' ');

export default function BacktestTable({ trades, onOpen, onDelete }) {
  const [sort, setSort] = useState({ key: 'num', dir: 'desc' });

  const rows = useMemo(() => {
    const withNum = trades.map((t, i) => ({ ...t, __num: i + 1 }));
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (t) => ({
      num: t.__num,
      date: t.date || '',
      type: t.type || '',
      session: sessionOf(t),
      quality: ['C', 'B', 'A', 'A+'].indexOf(qualityOf(t)),
      r: rOf(t),
      result: ['LOSS', 'BE', 'WIN'].indexOf(t.result),
    })[sort.key];

    return [...withNum].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return (a.__num - b.__num) * dir;
      return (va > vb ? 1 : -1) * dir;
    });
  }, [trades, sort]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  const SortIcon = ({ k }) => {
    if (sort.key !== k) return <ChevronsUpDown size={12} strokeWidth={2.4} style={{ color: T.text4, opacity: 0.5 }} />;
    return sort.dir === 'asc'
      ? <ArrowUp size={12} strokeWidth={3} style={{ color: T.acc }} />
      : <ArrowDown size={12} strokeWidth={3} style={{ color: T.acc }} />;
  };

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      {/* шапка */}
      <div
        className="hidden items-center gap-3 px-5 py-3.5 lg:grid"
        style={{ gridTemplateColumns: GRID, borderBottom: `1px solid ${T.line}`, background: T.sunken }}
      >
        {COLS.map((c) => (
          <button
            key={c.key}
            onClick={() => !c.noSort && toggle(c.key)}
            className="flex items-center gap-1.5 text-[12.5px] font-bold uppercase tracking-[0.08em]"
            style={{
              fontFamily: T.sans,
              color: sort.key === c.key ? T.text2 : T.text4,
              cursor: c.noSort ? 'default' : 'pointer',
              justifyContent: c.align === 'right' ? 'flex-end' : c.align === 'center' ? 'center' : 'flex-start',
            }}
          >
            {c.label}
            {!c.noSort && c.label && <SortIcon k={c.key} />}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Ще немає угод. Запиши першу рядком угорі — це займе 5 секунд.
          </p>
        </div>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((t) => {
            const r = rOf(t);
            const long = t.type === 'LONG';
            const q = qualityOf(t);
            const tags = tagsOf(t);
            const pair = pairOf(t);
            const hasShot = !!t.screenshot_url;

            return (
              <motion.div
                layout
                key={t.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 30, transition: { duration: 0.18 } }}
                transition={{ duration: 0.25, ease: EASE }}
                onClick={() => onOpen(t)}
                className="group relative flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors duration-200 lg:grid lg:gap-3 lg:px-5"
                style={{ gridTemplateColumns: GRID, borderBottom: `1px solid ${T.line}`, minHeight: 56 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.surfaceHi)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 transition-all duration-200 group-hover:h-[32px]"
                  style={{ background: resColor(t.result) }}
                />

                <span className="text-[13.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                  {String(t.__num).padStart(2, '0')}
                </span>

                <span className="text-[13.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text2 }}>
                  {t.date || '—'}
                </span>

                <span
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-bold"
                  style={{
                    fontFamily: T.sans,
                    color: long ? T.ok : T.info,
                    background: long ? `rgba(${T.okRgb},0.10)` : `rgba(${T.infoRgb},0.10)`,
                    border: `1px solid ${long ? `rgba(${T.okRgb},0.22)` : `rgba(${T.infoRgb},0.22)`}`,
                  }}
                >
                  {long ? <TrendingUp size={12} strokeWidth={2.6} /> : <TrendingDown size={12} strokeWidth={2.6} />}
                  {t.type}
                </span>

                <div className="order-last w-full min-w-0 lg:order-none lg:w-auto">
                  <div className="flex items-center gap-2">
                    {pair && (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
                        style={{ fontFamily: T.sans, color: T.text2, background: T.sunken, border: `1px solid ${T.line}` }}
                      >
                        {pair}
                      </span>
                    )}
                    <span className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                      {tags[0] || 'Без сетапу'}
                    </span>
                    {tags.length > 1 && (
                      <span className="shrink-0 text-[12px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>+{tags.length - 1}</span>
                    )}
                  </div>
                  {t.notes && (
                    <div className="truncate text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>{t.notes}</div>
                  )}
                </div>

                <span className="hidden text-[13.5px] lg:block" style={{ fontFamily: T.sans, color: T.text3 }}>{sessionOf(t)}</span>

                <span className="flex justify-center">
                  {q ? (
                    <span
                      className="inline-flex min-w-[30px] items-center justify-center rounded-lg px-2 py-1 text-[12.5px] font-bold tabular-nums"
                      style={{ fontFamily: T.mono, color: qualColor(q), background: `${qualColor(q)}18`, border: `1px solid ${qualColor(q)}33` }}
                    >
                      {q}
                    </span>
                  ) : <span style={{ color: T.text4 }}>—</span>}
                </span>

                <span
                  className="text-right text-[15px] font-bold tabular-nums"
                  style={{ fontFamily: T.mono, color: r > 0 ? T.ok : r < 0 ? T.bad : T.text3 }}
                >
                  {r > 0 ? '+' : ''}{Number(r.toFixed(2))}R
                </span>

                <span className="flex justify-center">
                  <span
                    className="rounded-lg px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.06em]"
                    style={{
                      fontFamily: T.sans, color: resColor(t.result),
                      background: `${resColor(t.result)}14`, border: `1px solid ${resColor(t.result)}2e`,
                    }}
                  >
                    {t.result}
                  </span>
                </span>

                <span className="hidden justify-center lg:flex" style={{ color: hasShot ? T.text3 : T.text4, opacity: hasShot ? 1 : 0.35 }}>
                  <ImageIcon size={15} strokeWidth={2.1} />
                </span>

                <span className="flex justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(t); }}
                    className="grid h-8 w-8 place-items-center rounded-lg opacity-60 transition-all lg:opacity-0 lg:group-hover:opacity-100"
                    style={{ border: `1px solid ${T.line}`, color: T.text3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      )}
    </div>
  );
}
