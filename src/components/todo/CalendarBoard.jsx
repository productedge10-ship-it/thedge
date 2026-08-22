import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Timer, Check, AlertTriangle, X } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import {
  MONTHS, WEEKDAYS, monthGrid, dayStats, fmtDayLong, isOverdue,
} from '../../lib/todoData';
import TaskRow, { toneColor, quadrantOf } from './TaskRow';
import TaskComposer from './TaskComposer';

/* ==================================================================
   Великий календар.
   День показує три речі відразу: що заплановано (з часом), що вже
   зроблено і скільки помодоро у нього вкладено. Клік по дню
   відкриває панель, де цей день можна догрузити.
================================================================== */

export default function CalendarBoard({ tasks, sessions, onToggle, onEdit, onDelete, onAdd, onFocus }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [openDay, setOpenDay] = useState(null);

  const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const stats = useMemo(() => dayStats(tasks, sessions), [tasks, sessions]);
  const maxPomo = useMemo(
    () => Math.max(1, ...Object.values(stats).map((d) => d.pomodoros || 0)),
    [stats],
  );

  const move = (delta) => setYm(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const dayTasks = openDay ? tasks.filter((t) => t.due === openDay) : [];

  return (
    <div className="flex flex-col gap-4">
      {/* керування місяцем */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {[[-1, ChevronLeft], [1, ChevronRight]].map(([d, Icon]) => (
            <button
              key={d}
              onClick={() => move(d)}
              className="grid h-10 w-10 place-items-center rounded-xl transition-all duration-200 active:scale-95"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <Icon size={17} strokeWidth={2.2} />
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.h2
            key={`${ym.y}-${ym.m}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="text-[22px] font-bold"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
          >
            {MONTHS[ym.m]} <span style={{ color: T.text4 }}>{ym.y}</span>
          </motion.h2>
        </AnimatePresence>

        <button
          onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}
          className="ml-auto h-10 rounded-xl px-4 text-[13.5px] font-semibold transition-all duration-200 active:scale-[0.98]"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
        >
          Сьогодні
        </button>
      </div>

      {/* сітка */}
      <div className="overflow-x-auto overflow-y-hidden rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <div className="min-w-[680px] lg:min-w-0">
        <div className="grid grid-cols-7" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-3 py-2.5 text-center text-[12.5px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const d = stats[c.iso];
            const pomo = d?.pomodoros || 0;
            const intensity = pomo ? 0.06 + (pomo / maxPomo) * 0.16 : 0;
            const hasOverdue = (d?.tasks || []).some((t) => isOverdue(t));
            const visible = (d?.tasks || []).slice(0, 3);

            return (
              <motion.button
                key={c.iso}
                onClick={() => setOpenDay(c.iso)}
                initial={{ opacity: 0 }}
                animate={{ opacity: c.inMonth ? 1 : 0.4 }}
                transition={{ duration: 0.2, delay: Math.min(i, 20) * 0.008 }}
                className="group relative flex min-h-[112px] flex-col gap-1.5 p-2 text-left transition-colors duration-200"
                style={{
                  borderRight: (i + 1) % 7 ? `1px solid ${T.line}` : 'none',
                  borderBottom: `1px solid ${T.line}`,
                  background: pomo ? `rgba(${T.accRgb},${intensity})` : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = pomo ? `rgba(${T.accRgb},${intensity + 0.05})` : 'rgba(255,255,255,0.025)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = pomo ? `rgba(${T.accRgb},${intensity})` : 'transparent')}
              >
                {/* число дня */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="grid h-6 min-w-[24px] place-items-center rounded-md px-1 text-[13px] font-bold tabular-nums transition-colors duration-200"
                    style={{
                      fontFamily: T.mono,
                      color: c.isToday ? 'var(--edge-bg, #0A0A0C)' : c.inMonth ? T.text2 : T.text4,
                      background: c.isToday ? T.acc : 'transparent',
                    }}
                  >
                    {c.day}
                  </span>

                  {hasOverdue && <AlertTriangle size={11} strokeWidth={2.6} style={{ color: T.bad }} />}

                  <span className="ml-auto flex items-center gap-1.5">
                    {d?.done > 0 && (
                      <span className="flex items-center gap-0.5 text-[11.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.ok }}>
                        <Check size={10} strokeWidth={3.4} />{d.done}
                      </span>
                    )}
                    {pomo > 0 && (
                      <span className="flex items-center gap-0.5 text-[11.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.acc }}>
                        <Timer size={10} strokeWidth={2.6} />{pomo}
                      </span>
                    )}
                  </span>
                </div>

                {/* завдання дня */}
                <div className="flex flex-col gap-1">
                  {visible.map((t) => {
                    const q = quadrantOf(t.quadrant);
                    const c2 = q ? toneColor(q.tone) : T.text3;
                    return (
                      <span
                        key={t.id}
                        className="flex items-center gap-1.5 truncate rounded-md px-1.5 py-[3px] text-[11.5px]"
                        style={{
                          fontFamily: T.sans,
                          background: T.sunken,
                          color: t.done ? T.text4 : T.text2,
                          textDecoration: t.done ? 'line-through' : 'none',
                        }}
                        title={t.text}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c2 }} />
                        {t.dueTime && (
                          <span className="shrink-0 tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{t.dueTime}</span>
                        )}
                        <span className="truncate">{t.text}</span>
                      </span>
                    );
                  })}
                  {(d?.tasks?.length || 0) > 3 && (
                    <span className="px-1.5 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      +{d.tasks.length - 3} ще
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>
        </div>
      </div>

      {/* легенда */}
      <div className="flex flex-wrap items-center gap-4 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
        <span className="flex items-center gap-1.5"><Check size={12} strokeWidth={3} style={{ color: T.ok }} /> зроблено того дня</span>
        <span className="flex items-center gap-1.5"><Timer size={12} strokeWidth={2.4} style={{ color: T.acc }} /> помодоро — фон дня тим щільніший, чим більше</span>
        <span className="flex items-center gap-1.5"><AlertTriangle size={12} strokeWidth={2.6} style={{ color: T.bad }} /> є прострочене</span>
      </div>

      {/* панель дня */}
      <AnimatePresence>
        {openDay && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpenDay(null)}
            className="fixed inset-0 z-[220] flex justify-end"
            style={{ background: 'rgba(6,6,8,0.8)', backdropFilter: 'blur(8px)' }}
          >
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto"
              style={{ background: T.surface, borderLeft: `1px solid ${T.line}`, paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              <div
                className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: `1px solid ${T.line}`, background: 'rgba(19,19,22,0.94)', backdropFilter: 'blur(14px)' }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-bold capitalize" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                    {fmtDayLong(openDay)}
                  </div>
                  <div className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {dayTasks.length ? `${dayTasks.filter((t) => t.done).length} з ${dayTasks.length} зроблено` : 'нічого не заплановано'}
                    {stats[openDay]?.pomodoros ? ` · ${stats[openDay].pomodoros} помодоро` : ''}
                  </div>
                </div>
                <button
                  onClick={() => setOpenDay(null)}
                  className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex flex-col gap-3 p-5">
                <TaskComposer onAdd={onAdd} defaultDue={openDay} />

                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {dayTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        onToggle={onToggle}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onFocus={onFocus}
                      />
                    ))}
                  </AnimatePresence>

                  {dayTasks.length === 0 && (
                    <p className="px-1 py-6 text-center text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      На цей день нічого немає — саме час щось запланувати.
                    </p>
                  )}
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
