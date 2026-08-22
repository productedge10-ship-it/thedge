import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CalendarDays } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { QUADRANTS, today, addDays, relativeDay } from '../../lib/todoData';
import { toneColor } from './TaskRow';
import DatePop from './DatePop';
import TimePop from './TimePop';

/* ==================================================================
   Додавання завдання.
   Спершу текст — решта опційна і не заважає. Дата й час зʼявляються
   тільки коли почав писати, щоб рядок не виглядав як анкета.
================================================================== */

const QUICK_DAYS = [
  { label: 'сьогодні', get: () => today() },
  { label: 'завтра',   get: () => addDays(today(), 1) },
  { label: 'за тиждень', get: () => addDays(today(), 7) },
];

export default function TaskComposer({ onAdd, defaultDue = null, defaultQuadrant = null }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [dueTime, setDueTime] = useState(null);
  const [quadrant, setQuadrant] = useState(defaultQuadrant);
  const open = text.trim().length > 0;

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), due, dueTime, quadrant });
    setText('');
    setDueTime(null);
    if (!defaultDue) setDue(null);
    if (!defaultQuadrant) setQuadrant(null);
  };

  return (
    <motion.div
      layout
      className="rounded-2xl transition-colors duration-200"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
      onBlurCapture={(e) => (e.currentTarget.style.borderColor = T.line)}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <Plus size={17} strokeWidth={2.6} className="shrink-0" style={{ color: open ? T.acc : T.text4 }} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') setText('');
          }}
          placeholder="Що треба зробити?"
          className="h-8 w-full bg-transparent text-[15px] outline-none"
          style={{ fontFamily: T.sans, color: T.text }}
        />
        {open && (
          <button
            onClick={submit}
            className="h-9 shrink-0 whitespace-nowrap rounded-lg px-4 text-[13.5px] font-bold transition-transform duration-200 active:scale-[0.97]"
            style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
          >
            Додати
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 px-3.5 pb-3" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
              {/* коли */}
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                <CalendarDays size={13} strokeWidth={2.2} />
                коли
              </span>

              {QUICK_DAYS.map((d) => {
                const iso = d.get();
                const on = due === iso;
                return (
                  <button
                    key={d.label}
                    onClick={() => setDue(on ? null : iso)}
                    className="h-8 rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
                    style={{
                      fontFamily: T.sans,
                      color: on ? T.acc : T.text3,
                      background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                      border: `1px solid ${on ? T.lineAcc : T.line}`,
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
                  >
                    {d.label}
                  </button>
                );
              })}

              <DatePop value={due} onChange={setDue} />

              {/* час */}
              <TimePop value={dueTime} onChange={setDueTime} />

              <span className="mx-1 hidden h-5 w-px sm:block" style={{ background: T.line }} />

              {/* квадрант */}
              {QUADRANTS.map((q) => {
                const on = quadrant === q.id;
                const c = toneColor(q.tone);
                return (
                  <button
                    key={q.id}
                    onClick={() => setQuadrant(on ? null : q.id)}
                    title={q.axis}
                    className="h-8 rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
                    style={{
                      fontFamily: T.sans,
                      color: on ? c : T.text4,
                      background: on ? `${c}14` : 'transparent',
                      border: `1px solid ${on ? `${c}38` : T.line}`,
                    }}
                    onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; } }}
                    onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; } }}
                  >
                    {q.label}
                  </button>
                );
              })}

              {due && (
                <span className="ml-auto text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  → {relativeDay(due)}{dueTime ? `, до ${dueTime}` : ''}
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
