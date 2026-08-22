import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Clock, Timer, Pencil, Trash2, X, AlertTriangle } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { QUADRANTS, relativeDay, isOverdue } from '../../lib/todoData';

/* ==================================================================
   Рядок завдання.
   Все важливе в один погляд: галочка, текст, коли треба зробити,
   скільки помодоро уже вкладено. Помодоро запускається прямо звідси.
================================================================== */

export const toneColor = (tone) => ({ bad: T.bad, ok: T.ok, warn: T.warn, muted: T.text3 }[tone] || T.acc);
export const quadrantOf = (id) => QUADRANTS.find((q) => q.id === id);

export default function TaskRow({ task, onToggle, onEdit, onDelete, onFocus, compact }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const q = quadrantOf(task.quadrant);
  const late = isOverdue(task);
  const accent = q ? toneColor(q.tone) : T.acc;

  const commit = () => {
    if (draft.trim()) onEdit(task.id, { text: draft.trim() });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-xl" style={{ background: T.sunken, border: `1px solid ${T.lineAcc}` }}>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setDraft(task.text); setEditing(false); }
            }}
            className="h-9 min-w-0 flex-1 bg-transparent px-1.5 text-[14.5px] outline-none"
            style={{ fontFamily: T.sans, color: T.text }}
          />
          <button
            onClick={commit}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-200 active:scale-95"
            style={{ background: `rgba(${T.accRgb},0.14)`, border: `1px solid ${T.lineAcc}`, color: T.acc }}
          >
            <Check size={15} strokeWidth={3} />
          </button>
          <button
            onClick={() => { setDraft(task.text); setEditing(false); }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
            style={{ color: T.text4, border: `1px solid ${T.line}` }}
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
      transition={{ duration: 0.22, ease: EASE }}
      whileHover={{ x: 2 }}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl px-3.5 py-2.5 transition-colors duration-300"
      style={{
        background: task.done ? 'transparent' : T.sunken,
        border: `1px solid ${task.done ? 'transparent' : T.line}`,
      }}
      onMouseEnter={(e) => { if (!task.done) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!task.done) e.currentTarget.style.borderColor = task.done ? 'transparent' : T.line; }}
    >
      {/* колір квадранта тонкою рискою */}
      <motion.span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[2px] rounded-full"
        initial={false}
        animate={{ backgroundColor: task.done ? T.ok : accent, opacity: task.done ? 0.4 : q ? 0.55 : 0 }}
        transition={{ duration: 0.3, ease: EASE }}
      />

      {/* галочка */}
      <motion.button
        onClick={() => onToggle(task.id)}
        className="relative z-10 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md"
        initial={false}
        animate={{
          backgroundColor: task.done ? T.ok : 'rgba(0,0,0,0)',
          borderColor: task.done ? T.ok : T.lineHi,
        }}
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        style={{ borderWidth: 1.5, borderStyle: 'solid' }}
      >
        <AnimatePresence>
          {task.done && (
            <motion.span
              key="v"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.3, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="flex"
            >
              <Check size={13} strokeWidth={3.6} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* текст */}
      <button
        onClick={() => onToggle(task.id)}
        className="relative z-10 min-w-0 flex-1 text-left"
      >
        <motion.span
          className="text-[14.5px] leading-snug"
          initial={false}
          animate={{
            color: task.done ? T.text4 : T.text,
            backgroundSize: task.done ? '100% 1.5px' : '0% 1.5px',
          }}
          transition={{
            color: { duration: 0.3, ease: EASE },
            backgroundSize: { duration: 0.32, ease: [0.65, 0, 0.35, 1] },
          }}
          style={{
            fontFamily: T.sans,
            display: 'inline',
            backgroundImage: `linear-gradient(rgba(${T.okRgb},0.55), rgba(${T.okRgb},0.55))`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0 62%',
            WebkitBoxDecorationBreak: 'clone',
            boxDecorationBreak: 'clone',
          }}
        >
          {task.text}
        </motion.span>
      </button>

      {/* дедлайн */}
      {task.due && !task.done && (
        <span
          className="relative z-10 hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-semibold tabular-nums sm:flex"
          style={{
            fontFamily: T.sans,
            color: late ? T.bad : T.text3,
            background: late ? `rgba(${T.badRgb},0.10)` : 'transparent',
            border: `1px solid ${late ? `rgba(${T.badRgb},0.25)` : T.line}`,
          }}
          title={late ? 'Дедлайн минув' : 'Дедлайн'}
        >
          {late ? <AlertTriangle size={12} strokeWidth={2.4} /> : <Clock size={12} strokeWidth={2.2} />}
          {relativeDay(task.due)}{task.dueTime ? `, ${task.dueTime}` : ''}
        </span>
      )}

      {/* помодоро */}
      {task.pomodoros > 0 && (
        <span
          className="relative z-10 hidden shrink-0 items-center gap-1 text-[12.5px] font-semibold tabular-nums sm:flex"
          style={{ fontFamily: T.mono, color: T.text4 }}
          title={`${task.pomodoros} помодоро вкладено`}
        >
          <Timer size={12} strokeWidth={2.2} />
          {task.pomodoros}
        </span>
      )}

      {/* дії */}
      <span className="relative z-10 flex shrink-0 items-center gap-1">
        {!task.done && onFocus && (
          <button
            onClick={() => onFocus(task)}
            title="Взяти в помодоро"
            className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
            style={{ color: T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
          >
            <Timer size={15} strokeWidth={2.2} />
          </button>
        )}

        {!compact && (
          <>
            <button
              onClick={() => { setDraft(task.text); setEditing(true); }}
              title="Редагувати"
              className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
              style={{ color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
            >
              <Pencil size={14} strokeWidth={2.2} />
            </button>
            <button
              onClick={() => onDelete(task.id)}
              title="Видалити"
              className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
              style={{ color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
            >
              <Trash2 size={14} strokeWidth={2.2} />
            </button>
          </>
        )}
      </span>
    </motion.div>
  );
}
