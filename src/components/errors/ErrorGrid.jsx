import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, AlertTriangle, Link2, Circle } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { getCat, hexA, generateCandles } from './utils';

/* ==================================================================
   Сітка помилок.
   Кожен запис — картка з міні-графіком: він не несе даних, але дає
   оку за що зачепитись і робить архів схожим на архів угод, а не
   на список нотаток.
================================================================== */

export default function ErrorGrid({ groups, numMap, onOpenCard }) {
  if (!groups.length) return null;

  return (
    <div className="flex flex-col gap-9">
      {groups.map((g) => (
        <section key={g.label}>
          {g.label && (
            <div className="mb-4 flex items-center gap-3">
              <h2
                className="text-[19px] font-bold capitalize"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
              >
                {g.label}
              </h2>
              <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                {g.items.length} {g.items.length === 1 ? 'запис' : 'записів'}
              </span>
              <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
            </div>
          )}

          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {g.items.map((e, i) => {
                const candles = generateCandles(e.id, 22);
                const main = getCat(e.cats[0]);

                return (
                  <motion.article
                    key={e.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03, ease: EASE }}
                    whileHover={{ y: -3 }}
                    onClick={() => onOpenCard(e)}
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl"
                    style={{
                      background: T.surface,
                      border: `1px solid ${T.line}`,
                      transition: 'border-color 240ms ease, box-shadow 240ms ease',
                    }}
                    onMouseEnter={(ev) => {
                      ev.currentTarget.style.borderColor = hexA(main.color, 0.4);
                      ev.currentTarget.style.boxShadow = '0 20px 44px -28px rgba(0,0,0,0.95)';
                    }}
                    onMouseLeave={(ev) => {
                      ev.currentTarget.style.borderColor = T.line;
                      ev.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* міні-графік */}
                    <div className="relative h-[132px]" style={{ background: T.sunken, borderBottom: `1px solid ${T.line}` }}>
                      <div className="absolute inset-x-3 bottom-8 top-4 flex items-stretch gap-[2px] opacity-70 transition-opacity duration-300 group-hover:opacity-100">
                        {candles.map((c) => (
                          <div key={c.id} className="relative flex-1">
                            <div style={c.wick} />
                            <div style={c.body} />
                          </div>
                        ))}
                      </div>

                      <span
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
                        style={{ background: `linear-gradient(180deg, transparent, ${T.surface})` }}
                      />

                      <span
                        className="absolute bottom-2.5 left-3 rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums"
                        style={{
                          fontFamily: T.mono, color: T.text,
                          background: 'rgba(10,10,12,0.8)', border: `1px solid ${T.line}`, backdropFilter: 'blur(6px)',
                        }}
                      >
                        {e.pair}
                      </span>

                      <span className="absolute right-3 top-3 text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                        №{String(numMap[e.id] || 0).padStart(3, '0')}
                      </span>

                      {/* Звідки запис. Автоматичний має відрізнятись від
                          заведеного руками: інакше через місяць буде
                          незрозуміло, чи ти сам це помітив, чи журнал. */}
                      {(e.source === 'trade' || e.source === 'plan') && (
                        <span
                          className="absolute left-3 top-3 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                          style={{
                            fontFamily: T.sans, color: T.text3,
                            background: 'rgba(10,10,12,0.72)', border: `1px solid ${T.line}`, backdropFilter: 'blur(6px)',
                          }}
                        >
                          <Link2 size={10} strokeWidth={2.8} /> {e.source === 'trade' ? 'з угоди' : 'з плану'}
                        </span>
                      )}
                    </div>

                    {/* тіло */}
                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>{e.date}</span>

                        {/* Нерозібране позначаємо, розібране — ні. Галочка
                            на кожній опрацьованій картці перетворила б
                            сторінку на список галочок. */}
                        {!e.resolved && (
                          <span
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
                            style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.10)` }}
                          >
                            <Circle size={8} strokeWidth={3} fill="currentColor" /> не розібрано
                          </span>
                        )}

                        {!e.followedPlan && (
                          <span
                            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold"
                            style={{ fontFamily: T.sans, color: T.warn, background: `rgba(${T.warnRgb},0.10)` }}
                          >
                            <AlertTriangle size={11} strokeWidth={2.6} /> поза планом
                          </span>
                        )}
                      </div>

                      <p
                        className="text-[13.5px]"
                        style={{
                          fontFamily: T.sans, color: T.text3, lineHeight: 1.62,
                          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          minHeight: 'calc(1.62em * 3)',
                        }}
                      >
                        {e.desc}
                      </p>

                      <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                        {e.cats.map((id) => {
                          const c = getCat(id);
                          return (
                            <span
                              key={id}
                              className="rounded-md px-2 py-1 text-[12px] font-semibold"
                              style={{
                                fontFamily: T.sans,
                                color: c.color,
                                background: hexA(c.color, 0.10),
                                border: `1px solid ${hexA(c.color, 0.26)}`,
                              }}
                            >
                              {c.label}
                            </span>
                          );
                        })}

                        <ArrowRight
                          size={14}
                          strokeWidth={2.4}
                          className="ml-auto shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
                          style={{ color: T.text4 }}
                        />
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      ))}
    </div>
  );
}
