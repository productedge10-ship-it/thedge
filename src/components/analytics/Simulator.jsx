import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, ShieldAlert, Check } from 'lucide-react';
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
      className="relative overflow-hidden rounded-2xl"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {/* Список на всю ширину, а не два стиснутих стовпці: підказка
          кожного кроку — окремий рядок тексту, який має право
          перенестись, а не обрізатись на середині слова. Активний
          крок підсвічений заливкою й смужкою зліва, пройдений —
          зеленою галочкою замість номера. */}
      <div className="relative flex flex-col">
        {STEPS.map((s, i) => {
          const on = s.id === step;
          const done = i < idx;
          const Icon = s.icon;
          const color = on ? T.acc : done ? T.ok : T.text4;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className="relative flex items-start gap-3 px-4 py-3.5 text-left transition-colors duration-150"
              style={{
                background: on ? `rgba(${T.accRgb},0.07)` : 'transparent',
                borderBottom: i < STEPS.length - 1 ? `1px solid ${T.line}` : 'none',
              }}
            >
              {on && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: T.acc }} />}
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12.5px] font-bold tabular-nums transition-all duration-200"
                style={{
                  fontFamily: T.mono,
                  background: on ? `rgba(${T.accRgb},0.16)` : done ? `rgba(${T.okRgb},0.14)` : T.surface,
                  border: `1px solid ${on ? T.lineAcc : done ? `rgba(${T.okRgb},0.4)` : T.line}`,
                  color,
                  boxShadow: on ? `0 0 22px -6px rgba(${T.accRgb},0.9)` : 'none',
                }}
              >
                {done ? <Check size={13} strokeWidth={2.6} /> : s.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.text : T.text3 }}>
                  <Icon size={13} strokeWidth={2.2} style={{ color }} />
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-[1.45]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {s.hint}
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
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="mx-4 mb-4 mt-3.5 rounded-xl px-3.5 py-2.5 text-[12px]"
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
