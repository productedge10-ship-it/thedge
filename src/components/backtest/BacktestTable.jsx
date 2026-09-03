import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown, Image as ImageIcon, Trash2 } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { rOf, sessionOf, qualityOf, tagsOf, pairOf } from '../../lib/backtestStats';
import { ACT, act } from './accent';

/* ==================================================================
   Таблиця угод бектесту. Той самий компонент працює і в публічному
   перегляді: readOnly прибирає видалення й клік по рядку, лишаючи
   тільки читання.
   Рядок читається за секунду: номер, дата, напрям, сетап, сесія,
   якість і R. Результат окремою колонкою не потрібен — його видно
   за кольором R. Все важке (скрін, нотатка) — на клік.
================================================================== */

const qualColor = (q) => ({ 'A+': T.ok, A: T.ok, B: T.warn, C: T.bad }[q] || T.text4);

const COLS = [
  { key: 'num',     label: '#',               w: '40px',             align: 'left' },
  { key: 'date',    label: 'Дата',            w: '96px',             align: 'left' },
  { key: 'type',    label: 'Напрям',          w: '86px',             align: 'left' },
  { key: 'setup',   label: 'Сетап і нотатка', w: 'minmax(150px,1fr)', align: 'left', noSort: true },
  { key: 'session', label: 'Сесія',           w: '90px',             align: 'left' },
  { key: 'quality', label: 'Якість',          w: '58px',             align: 'left' },
  { key: 'r',       label: 'R',               w: '78px',             align: 'right' },
  { key: 'del',     label: '',                w: '36px',             align: 'center', noSort: true },
];

export default function BacktestTable({ trades, onOpen, onDelete, onShot, readOnly = false }) {
  const [sort, setSort] = useState({ key: 'num', dir: 'desc' });
  const cols = readOnly ? COLS.filter((c) => c.key !== 'del') : COLS;
  const grid = cols.map((c) => c.w).join(' ');

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
    })[sort.key];

    return [...withNum].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return (a.__num - b.__num) * dir;
      return (va > vb ? 1 : -1) * dir;
    });
  }, [trades, sort]);

  const sum = useMemo(() => rows.reduce((s, t) => s + rOf(t), 0), [rows]);

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));

  return (
    <div
      className="overflow-hidden rounded-[20px]"
      style={{ background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`, border: `1px solid ${T.line}` }}
    >
      {/* шапка */}
      <div
        className="hidden items-center gap-2.5 px-[22px] py-3.5 lg:grid"
        style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${T.line}`, background: T.sunken }}
      >
        {cols.map((c) => {
          const on = sort.key === c.key;
          return (
            <button
              key={c.key}
              onClick={() => !c.noSort && toggle(c.key)}
              className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.18em] transition-colors"
              style={{
                fontFamily: T.mono,
                color: on ? ACT.tint : T.text3,
                cursor: c.noSort ? 'default' : 'pointer',
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
              }}
            >
              {c.label}
              {on && !c.noSort && (
                sort.dir === 'asc'
                  ? <ArrowUp size={11} strokeWidth={3} style={{ color: ACT.tint }} />
                  : <ArrowDown size={11} strokeWidth={3} style={{ color: ACT.tint }} />
              )}
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {readOnly
              ? 'У цьому прогоні ще немає угод.'
              : 'Ще немає угод. Запиши першу рядком угорі — це займе 5 секунд.'}
          </p>
        </div>
      ) : (
        <>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((t) => {
              const r = rOf(t);
              const long = t.type === 'LONG';
              const q = qualityOf(t);
              const tags = tagsOf(t);
              const pair = pairOf(t);
              const rColor = r > 0 ? T.ok : r < 0 ? T.bad : T.text3;

              return (
                <motion.div
                  layout
                  key={t.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.25, ease: EASE }}
                  onClick={onOpen ? () => onOpen(t) : undefined}
                  className={`group relative flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-3 transition-colors duration-200 lg:grid lg:px-[22px] lg:py-[15px] ${onOpen ? 'cursor-pointer' : ''}`}
                  style={{ gridTemplateColumns: grid, borderBottom: `1px solid ${T.line}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = act(0.07))}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {String(t.__num).padStart(2, '0')}
                  </span>

                  <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                    {t.date || '—'}
                  </span>

                  <span
                    className="inline-flex h-[26px] w-fit items-center justify-center rounded-[7px] px-2.5 text-[10.5px] font-bold tracking-[0.08em]"
                    style={{
                      fontFamily: T.mono,
                      color: long ? T.ok : T.bad,
                      background: long ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
                    }}
                  >
                    {t.type}
                  </span>

                  <div className="order-last flex w-full min-w-0 items-center gap-2 lg:order-none lg:w-auto">
                    {pair && (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold tracking-[0.04em]"
                        style={{ fontFamily: T.mono, color: T.text3, background: T.sunken, border: `1px solid ${T.line}` }}
                      >
                        {pair}
                      </span>
                    )}
                    <span className="truncate text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                      {tags[0] || t.notes || 'Без сетапу'}
                    </span>
                    {tags.length > 1 && (
                      <span className="shrink-0 text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                        +{tags.length - 1}
                      </span>
                    )}
                    {t.screenshot_url && (
                      onShot ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); onShot(t.screenshot_url); }}
                          title="Показати графік"
                          className="shrink-0 transition-colors"
                          style={{ color: T.text3 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                        >
                          <ImageIcon size={13} strokeWidth={2.1} />
                        </button>
                      ) : (
                        <ImageIcon size={13} strokeWidth={2.1} className="shrink-0" style={{ color: T.text4 }} />
                      )
                    )}
                  </div>

                  <span className="hidden text-[13px] lg:block" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {sessionOf(t)}
                  </span>

                  <span className="text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: q ? qualColor(q) : T.text4 }}>
                    {q || '—'}
                  </span>

                  <span className="text-right text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: rColor }}>
                    {r > 0 ? '+' : ''}{r.toFixed(2)}R
                  </span>

                  {/* Власна колонка, а не накладка поверх рядка: інакше
                      кнопка з'їжджала на цифру R і затуляла її */}
                  {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(t); }}
                    title="Видалити угоду"
                    className="grid h-8 w-8 place-items-center justify-self-center rounded-lg opacity-60 transition-all duration-200 lg:opacity-0 lg:group-hover:opacity-100"
                    style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                  >
                    <Trash2 size={13} strokeWidth={2.2} />
                  </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-4 px-[22px] py-4">
            <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Показано {rows.length} з {trades.length}
            </span>
            <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
              Сумарно{' '}
              <span style={{ fontWeight: 700, color: sum > 0 ? T.ok : sum < 0 ? T.bad : T.text2 }}>
                {sum > 0 ? '+' : ''}{sum.toFixed(2)}R
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
