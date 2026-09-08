import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, ShieldAlert } from 'lucide-react';
import { T } from '../../lib/theme';
import { fromTrades } from '../../lib/monteCarlo';
import WhatIf from './WhatIf';
import Risk from './Risk';

/* ==================================================================
   Симулятор.

   Раніше це були дві сусідні вкладки — «Що якби» і «Ризик», — і
   вони виглядали як два незалежні калькулятори. Насправді це одне
   питання, розрізане навпіл:

     крок 1 — скільки твої звички вже коштували на історії, що є;
     крок 2 — що буде з рахунком далі, якщо торгувати тим, що
              лишилось після викидання цих звичок.

   Розрізане навпіл воно було безглуздим. Людина знімала в першому
   розділі дві погані звички, бачила новий вінрейт, переходила в
   другий — і вручну переписувала ці цифри повзунками. Тепер між
   кроками є передача: кнопка бере відфільтровану історію й одразу
   ставить її параметри в прогноз.

   Тому й порядок саме такий: минуле, потім майбутнє. Прогноз без
   першого кроку — це вигадані числа з голови; перший крок без
   прогнозу — сума, яку вже не повернути.
================================================================== */

const STEPS = [
  {
    id: 'past',
    n: 1,
    icon: FlaskConical,
    label: 'Твої угоди',
    title: 'Скільки коштували звички',
    hint: 'Знімаєш правило — крива перераховується на твоїй же історії.',
  },
  {
    id: 'future',
    n: 2,
    icon: ShieldAlert,
    label: 'Тисяча майбутніх',
    title: 'Що буде далі',
    hint: 'Та сама система, прогнана вперед 1200 разів: межі, просадка, ціль.',
  },
];

function Rail({ step, setStep, carried }) {
  const idx = STEPS.findIndex((x) => x.id === step);

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {/* Лінія під вузлами, а не між ними: суцільна рейка читається
          як шлях, а два окремі відрізки — як дві кнопки поруч. */}
      <div className="relative flex items-stretch gap-3">
        {/* Геометрія рейки рахується від центрів кружків, а не «на
            око»: кнопка має padding 8px, кружок 34px, отже центр
            першого — 25px від лівого краю, другого — на 6px правіше
            за половину (половина гепа gap-3). Тому траса починається
            на 25px і має ширину calc(50% + 6px). */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-[25px] top-[21px] h-px"
          style={{ width: 'calc(50% + 6px)', background: T.line }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-[25px] top-[21px] h-px origin-left"
          initial={false}
          animate={{ scaleX: idx === 0 ? 0 : 1 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{ width: 'calc(50% + 6px)', background: T.acc, boxShadow: `0 0 10px rgba(${T.accRgb},0.7)` }}
        />

        {STEPS.map((s, i) => {
          const on = s.id === step;
          const done = i < idx;
          const Icon = s.icon;
          const color = on ? T.acc : done ? T.text3 : T.text4;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className="relative flex flex-1 flex-col items-start gap-2 rounded-xl px-2 py-1 text-left transition-colors duration-150"
              style={{ minWidth: 0 }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-[13px] font-bold tabular-nums transition-all duration-200"
                  style={{
                    fontFamily: T.mono,
                    background: on ? `rgba(${T.accRgb},0.14)` : T.surface,
                    border: `1px solid ${on ? T.lineAcc : T.line}`,
                    color,
                    boxShadow: on ? `0 0 22px -6px rgba(${T.accRgb},0.9)` : 'none',
                  }}
                >
                  {s.n}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.text : T.text3 }}>
                    <Icon size={13} strokeWidth={2.2} style={{ color }} />
                    {s.title}
                  </span>
                  <span className="truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {s.hint}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Що саме поїхало з першого кроку в другий. Без цього рядка
          прогноз показував би чужі числа без пояснення, звідки вони. */}
      <AnimatePresence initial={false}>
        {carried && step === 'future' && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="rounded-xl px-3.5 py-2.5 text-[12px]"
              style={{
                fontFamily: T.sans,
                color: T.text3,
                background: carried.applied ? `rgba(${T.accRgb},0.07)` : `rgba(${T.warnRgb},0.07)`,
                border: `1px solid ${carried.applied ? T.lineAcc : `rgba(${T.warnRgb},0.28)`}`,
                lineHeight: 1.55,
              }}
            >
              {carried.applied ? (
                <>
                  Параметри взяті з першого кроку: <b style={{ color: T.text }}>{carried.label}</b>.
                  Далі їх можна крутити повзунками — журнал від цього не зміниться.
                </>
              ) : (
                <>
                  Після фільтра лишилось <b style={{ color: T.text }}>{carried.label}</b> — замало,
                  щоб рахувати з цього вінрейт. Прогноз стартував із базових значень, постав свої повзунками.
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Simulator({ trades, rows }) {
  const [step, setStep] = useState('past');
  const [carried, setCarried] = useState(null);

  /* Ключ змушує другий крок змонтуватись наново, коли приїхали нові
     цифри. Це дешевше й чесніше за ефект, який синхронізує стан
     повзунків із пропом: повзунки — стан людини, і переписувати їх
     позаду неї можна лише разом із повним перезапуском кроку. */
  const [carryKey, setCarryKey] = useState(0);

  /* fromTrades повертає null, якщо закритих угод менше десяти: з
     такої вибірки вінрейт — це не вінрейт, а випадковість. Тому
     перевіряємо тут, до переходу, і чесно кажемо про це в рейці,
     замість того щоб мовчки показати базовий пресет як «твої
     цифри». */
  const carry = (payload) => {
    setCarried({ ...payload, applied: !!fromTrades(payload.trades) });
    setCarryKey((k) => k + 1);
    setStep('future');
  };

  return (
    <div className="flex flex-col gap-4">
      <Rail step={step} setStep={setStep} carried={carried} />

      {step === 'past' ? (
        <WhatIf trades={trades} onCarry={carry} />
      ) : (
        <Risk key={carryKey} trades={rows || []} carried={carried} />
      )}
    </div>
  );
}
