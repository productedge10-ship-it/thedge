import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Clock, Wand2 } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { parseWhen, relativeDay } from '../../lib/todoData';
import WhenPop from './WhenPop';

/* ==================================================================
   Додавання завдання.

   Спершу текст — решта опційна і не заважає.

   Головне тут — розбір дати просто з рядка. Людина й так пише
   «подзвонити в банк завтра о 10», а потім лізе в попап поставити те
   саме вдруге. Тепер дата й час читаються з тексту й показуються
   чипом ще до натискання Enter — але з назви нічого не вирізається:
   що написав, те й буде записано.

   Попап «коли» лишається: розбір бере лише те, у чому впевнений, і
   мусить бути спосіб поставити дату руками. Але щойно щось
   розпізнано — попап показує вже його, а не порожнечу.
================================================================== */

export default function TaskComposer({ onAdd, defaultDue = null, inputRef }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [dueTime, setDueTime] = useState(null);
  /* Ручний вибір мусить перебивати розбір: якщо людина відкрила попап
     і поставила дату, текст її вже не міняє. */
  const [manual, setManual] = useState(false);

  const open = text.trim().length > 0;

  const parsed = useMemo(() => parseWhen(text), [text]);

  const finalDue = manual ? due : (parsed.due ?? due);
  const finalTime = manual ? dueTime : (parsed.dueTime ?? dueTime);
  /* Назва — рівно те, що написала людина. Розбір дати з тексту нічого
     з нього не забирає: «завтра в 10 25 подрочити» лишається цілим
     рядком, просто ще й лягає на завтра. */
  const cleanText = text.trim();

  const submit = () => {
    if (!cleanText) return;
    onAdd({ text: cleanText, due: finalDue, dueTime: finalTime, quadrant: null });
    setText('');
    setDueTime(null);
    setManual(false);
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
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setText(''); e.currentTarget.blur(); }
          }}
          placeholder="Що треба зробити? Можна «завтра о 10»"
          className="h-8 w-full bg-transparent text-[15px] outline-none"
          style={{ fontFamily: T.sans, color: T.text }}
        />

        {/* Що саме буде записано — видно до натискання, а не після.
            Інакше вирізане з назви слово виглядає як загублене. */}
        <AnimatePresence>
          {!manual && (parsed.due || parsed.dueTime) && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="hidden shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold sm:flex"
              style={{ fontFamily: T.sans, background: `rgba(${T.accRgb},0.12)`, color: T.acc }}
              title="Розпізнано з тексту"
            >
              <Wand2 size={12} strokeWidth={2.4} />
              {relativeDay(parsed.due)}{parsed.dueTime ? `, ${parsed.dueTime}` : ''}
            </motion.span>
          )}
        </AnimatePresence>

        {open && (
          <button
            onClick={submit}
            className="h-9 shrink-0 whitespace-nowrap rounded-lg px-4 text-[13.5px] font-bold transition-transform duration-200 active:scale-[0.97]"
            style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
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
                due={finalDue}
                dueTime={finalTime}
                onChange={(d, t) => { setManual(true); setDue(d); setDueTime(t); }}
              />

              {/* Час без дати не існує: показуємо це прямо, а не
                  мовчазним перенесенням на сьогодні. */}
              {finalTime && (
                <span className="flex items-center gap-1.5 text-[12.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                  <Clock size={12} strokeWidth={2.2} />
                  {finalTime}
                </span>
              )}

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
