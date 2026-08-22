import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Check, GripVertical, Inbox, CornerDownRight } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { QUADRANTS, isOverdue, relativeDay } from '../../lib/todoData';
import { toneColor } from './TaskRow';

/* ==================================================================
   Матриця Ейзенхауера.
   Перетягування — головний спосіб: береш картку, під курсором
   підсвічується квадрант, куди вона впаде, решта притихають.
   Для тих, хто не любить тягати мишею, на ховері є чотири крапки —
   клік і завдання переїхало.
================================================================== */

function QuickMove({ current, onMove }) {
  return (
    <span
      className="flex items-center gap-1 rounded-lg px-1.5 py-1"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
      onClick={(e) => e.stopPropagation()}
    >
      {QUADRANTS.map((q) => {
        const c = toneColor(q.tone);
        const on = current === q.id;
        return (
          <button
            key={q.id}
            onClick={() => onMove(q.id)}
            title={`${q.label} · ${q.axis}`}
            className="grid h-4 w-4 place-items-center rounded-full transition-transform duration-200 hover:scale-125"
          >
            <span
              className="h-2 w-2 rounded-full transition-all duration-200"
              style={{ background: on ? c : 'transparent', border: `1.5px solid ${c}`, opacity: on ? 1 : 0.6 }}
            />
          </button>
        );
      })}
    </span>
  );
}

function Card({ task, onToggle, onFocus, onMove, color, onDragState }) {
  const [dragging, setDragging] = useState(false);
  const late = isOverdue(task);

  return (
    <motion.div
      layout
      drag
      dragSnapToOrigin
      dragElastic={0.14}
      dragMomentum={false}
      whileDrag={{ scale: 1.04, rotate: -1.2, zIndex: 60, cursor: 'grabbing' }}
      onDragStart={() => { setDragging(true); onDragState(task.id, null); }}
      onDrag={(e, info) => {
        const el = document.elementFromPoint(info.point.x, info.point.y);
        const zone = el?.closest?.('[data-quadrant]')?.getAttribute('data-quadrant') || null;
        onDragState(task.id, zone);
      }}
      onDragEnd={(e, info) => {
        setDragging(false);
        const el = document.elementFromPoint(info.point.x, info.point.y);
        const to = el?.closest?.('[data-quadrant]')?.getAttribute('data-quadrant');
        onDragState(null, null);
        if (to && to !== task.quadrant) onMove(task.id, to);
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="group relative flex cursor-grab items-start gap-2 rounded-xl px-3 py-2.5 transition-colors duration-200 active:cursor-grabbing"
      style={{
        background: T.surface,
        border: `1px solid ${dragging ? `${color}66` : T.line}`,
        boxShadow: dragging ? '0 22px 44px -20px rgba(0,0,0,0.95)' : 'none',
      }}
      onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.borderColor = T.line; }}
    >
      <GripVertical
        size={14}
        strokeWidth={2}
        className="mt-0.5 shrink-0 opacity-0 transition-opacity duration-200 group-hover:opacity-60"
        style={{ color: T.text4 }}
      />

      <button
        onClick={() => onToggle(task.id)}
        className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md transition-colors duration-200"
        style={{ border: `1.5px solid ${T.lineHi}` }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
      >
        <Check size={11} strokeWidth={3.4} className="opacity-0 transition-opacity group-hover:opacity-40" style={{ color }} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text }}>
          {task.text}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {task.due && (
            <span className="text-[12px]" style={{ fontFamily: T.sans, color: late ? T.bad : T.text4 }}>
              {relativeDay(task.due)}{task.dueTime ? `, ${task.dueTime}` : ''}
            </span>
          )}
          {task.pomodoros > 0 && (
            <span className="flex items-center gap-1 text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
              <Timer size={11} strokeWidth={2.2} />{task.pomodoros}
            </span>
          )}

          {/* швидке перенесення без перетягування */}
          <span className="ml-auto opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <QuickMove current={task.quadrant} onMove={(q) => onMove(task.id, q)} />
          </span>
        </div>
      </div>

      <button
        onClick={() => onFocus(task)}
        title="Взяти в помодоро"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
        style={{ color: T.text4 }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
      >
        <Timer size={14} strokeWidth={2.2} />
      </button>
    </motion.div>
  );
}

export default function EisenhowerMatrix({ tasks, onToggle, onMove, onFocus }) {
  const [drag, setDrag] = useState({ id: null, over: null });
  const onDragState = (id, over) => setDrag({ id, over });

  const unsorted = tasks.filter((t) => !t.done && !t.quadrant);
  const dragging = !!drag.id;

  return (
    <div className="flex flex-col gap-4">
      {/* нерозібране */}
      <AnimatePresence initial={false}>
        {unsorted.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl p-3.5" style={{ background: T.surface, border: `1px dashed ${T.lineHi}` }}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Inbox size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
                <span className="text-[13px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  Нерозібране
                </span>
                <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{unsorted.length}</span>
                <span className="ml-auto flex items-center gap-1.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  <CornerDownRight size={13} strokeWidth={2.2} />
                  перетягни в квадрант або тицьни в крапку
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {unsorted.map((t) => (
                  <Card key={t.id} task={t} onToggle={onToggle} onMove={onMove} onFocus={onFocus} color={T.acc} onDragState={onDragState} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* квадранти */}
      <div className="grid gap-4 lg:grid-cols-2">
        {QUADRANTS.map((q, i) => {
          const color = toneColor(q.tone);
          const list = tasks.filter((t) => !t.done && t.quadrant === q.id);
          const isTarget = drag.over === q.id;
          const dimmed = dragging && !isTarget;

          return (
            <motion.div
              key={q.id}
              data-quadrant={q.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: dimmed ? 0.55 : 1,
                scale: isTarget ? 1.012 : 1,
                y: 0,
              }}
              transition={{ duration: 0.24, delay: dragging ? 0 : i * 0.04, ease: EASE }}
              className="relative flex min-h-[240px] flex-col overflow-hidden rounded-2xl"
              style={{
                background: isTarget ? `${color}0d` : T.surface,
                border: `1px solid ${isTarget ? `${color}66` : T.line}`,
                boxShadow: isTarget ? `0 0 0 3px ${color}1f` : 'none',
                transition: 'background 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
              }}
            >
              {/* кольоровий кант зверху */}
              <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, ${color}00)` }} />

              <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color, letterSpacing: '-0.01em' }}>
                    {q.label}
                  </div>
                  <div className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>{q.axis}</div>
                </div>
                <span className="shrink-0 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: list.length ? T.text2 : T.text4 }}>
                  {list.length}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                <AnimatePresence initial={false} mode="popLayout">
                  {list.map((t) => (
                    <Card key={t.id} task={t} onToggle={onToggle} onMove={onMove} onFocus={onFocus} color={color} onDragState={onDragState} />
                  ))}
                </AnimatePresence>

                {/* місце під картку, що летить сюди */}
                <AnimatePresence>
                  {isTarget && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 44 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: EASE }}
                      className="flex items-center justify-center rounded-xl text-[13px] font-semibold"
                      style={{ border: `1px dashed ${color}88`, color, background: `${color}0d` }}
                    >
                      Кинути сюди
                    </motion.div>
                  )}
                </AnimatePresence>

                {list.length === 0 && !isTarget && (
                  <div
                    className="flex flex-1 items-center justify-center rounded-xl px-3 py-6 text-center text-[13px]"
                    style={{ fontFamily: T.sans, color: T.text4, border: `1px dashed ${T.line}` }}
                  >
                    {q.hint}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
