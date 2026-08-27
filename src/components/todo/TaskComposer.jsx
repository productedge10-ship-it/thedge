import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import WhenPop from './WhenPop';

/* ==================================================================
   Додавання завдання.

   Спершу текст — решта опційна і не заважає. Другий ряд зʼявляється
   тільки коли почав писати, щоб поле не виглядало як анкета.

   У другому ряду тепер один елемент замість шести. Було: три чипи
   швидких днів, вибір дати, вибір часу і чотири квадранти Ейзенхауера
   — десять кнопок під однорядковим полем. Квадранти пішли зовсім
   (їх ставлять у самій матриці, перетягуванням, і там це очевидно),
   а дата з часом злились в одне «коли», бо рішення тут і справді
   одне.
================================================================== */

export default function TaskComposer({ onAdd, defaultDue = null }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [dueTime, setDueTime] = useState(null);
  const open = text.trim().length > 0;

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), due, dueTime, quadrant: null });
    setText('');
    setDueTime(null);
    if (!defaultDue) setDue(null);
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
        <Plus size={17} strokeWidth={2.6} className="shrink-0" style={{ color: open ? T.acc : T.text3 }} />
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
            <div
              className="flex flex-wrap items-center gap-2 px-3.5 pb-3"
              style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}
            >
              <WhenPop
                due={due}
                dueTime={dueTime}
                onChange={(d, t) => { setDue(d); setDueTime(t); }}
              />

              <span className="ml-auto text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Enter — додати
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
