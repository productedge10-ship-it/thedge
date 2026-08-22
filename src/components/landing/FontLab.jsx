import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Type, X, RotateCcw } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import {
  FONTS, SHIFTS, applyFonts, byId, loadPreviewFonts, readChoice, writeChoice,
} from '../../lib/fontLab';

/* ==================================================================
   Перемикач шрифтів для лендінга.

   Це інструмент вибору, а не функція для відвідувача: панель висить
   збоку, поки ми вирішуємо, якою гарнітурою розмовляє бренд. Коли
   рішення ухвалене — вибране значення переїжджає в theme.js, а
   компонент прибирається з Landing одним рядком.

   Заголовки й текст перемикаються окремо, бо це різні задачі. Гучна
   геометрична гарнітура добре тримає велику фразу й розсипається у
   підписі на тринадцять пікселів — побачити це можна тільки
   поставивши їх у різні ролі.
================================================================== */

export default function FontLab() {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(readChoice);

  /* Шрифти тягнемо один раз і одразу: панель має показувати кандидатів
     їхніми ж накресленнями, інакше вибирати доводиться за назвою. */
  useEffect(() => { loadPreviewFonts(); }, []);

  useEffect(() => {
    applyFonts(choice);
    writeChoice(choice);
  }, [choice]);

  const pick = (role, id) => setChoice((c) => ({ ...c, [role]: id }));

  /* Дрібні кнопки-перемикачі: ваги й зсуви */
  const Chips = ({ items, value, onPick, render }) => (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((it) => {
        const on = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onPick(it.id)}
            className="rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors duration-150"
            style={{
              fontFamily: T.sans,
              background: on ? `rgba(${T.accRgb},0.14)` : T.sunken,
              border: `1px solid ${on ? T.accLine : T.line}`,
              color: on ? T.acc : T.text3,
            }}
          >
            {render ? render(it) : it.name}
          </button>
        );
      })}
    </div>
  );

  const Row = ({ role, label }) => (
    <div>
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        {label}
      </div>
      <div className="flex flex-col gap-1">
        {FONTS.map((f) => {
          const on = choice[role] === f.id;
          return (
            <button
              key={f.id}
              onClick={() => pick(role, f.id)}
              className="flex items-baseline gap-2 rounded-lg px-2.5 py-2 text-left transition-colors duration-150"
              style={{
                background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                border: `1px solid ${on ? T.accLine : 'transparent'}`,
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Назву малюємо самою гарнітурою — так видно характер,
                  а не просто підпис у списку */}
              <span
                className="text-[15px] font-bold"
                style={{ fontFamily: f.stack, color: on ? T.acc : T.text }}
              >
                {f.name}
              </span>
              <span className="text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {f.note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <motion.button
        onClick={() => setOpen((v) => !v)}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.6 }}
        className="fixed bottom-5 left-5 z-[70] grid h-11 w-11 place-items-center rounded-xl"
        style={{
          background: open ? T.acc : T.surface,
          border: `1px solid ${open ? 'transparent' : T.line}`,
          color: open ? '#0A0A0C' : T.text2,
          backdropFilter: 'blur(12px)',
        }}
        title="Примірочна шрифтів"
      >
        {open ? <X size={17} strokeWidth={2.4} /> : <Type size={17} strokeWidth={2.4} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -12, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="fixed bottom-20 left-5 z-[70] w-[290px] rounded-2xl p-4"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.8)',
              maxHeight: 'calc(100vh - 130px)',
              overflowY: 'auto',
            }}
          >
            <div className="mb-3.5 flex items-center gap-2">
              <span
                className="text-[13px] font-bold uppercase tracking-[0.14em]"
                style={{ fontFamily: T.sans, color: T.text2 }}
              >
                Шрифти
              </span>
              <button
                onClick={() => setChoice({ display: 'main', sans: 'main', headWeight: 0, textShift: 0 })}
                className="ml-auto grid h-7 w-7 place-items-center rounded-lg"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
                title="Повернути як було"
              >
                <RotateCcw size={12} strokeWidth={2.4} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <Row role="display" label="Заголовки" />
                {/* Заголовків мало і роль у них одна — їм можна просто
                    призначити вагу */}
                <Chips
                  items={[{ id: 0, name: 'як є' }, ...(byId(choice.display).weights || []).map((w) => ({ id: w, name: String(w) }))]}
                  value={choice.headWeight}
                  onPick={(v) => setChoice((c) => ({ ...c, headWeight: v }))}
                  render={(it) => (
                    <span style={{ fontFamily: byId(choice.display).stack, fontWeight: it.id || 700 }}>
                      {it.name}
                    </span>
                  )}
                />
              </div>

              <div>
                <Row role="sans" label="Текст" />
                {/* А текст не задаємо, а зсуваємо: у ньому побудована
                    ієрархія, і одна вага на все її стерла б */}
                <Chips
                  items={SHIFTS}
                  value={choice.textShift}
                  onPick={(v) => setChoice((c) => ({ ...c, textShift: v }))}
                />
              </div>
            </div>

            <p
              className="mt-4 text-[11.5px]"
              style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}
            >
              Вибір зберігається в браузері й діє на весь сайт. Заголовкам вага
              задається напряму, тексту — зсувається вся шкала, щоб не втратити
              різницю між рівнями. Etude Noire запрацює, щойно покладемо файл
              шрифта в проєкт.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
