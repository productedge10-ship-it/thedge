import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { ShieldAlert, Target, TrendingDown, AlertCircle, Ruler } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CopyButton } from '../ui/CopyElements';

/* ==================================================================
   Табло результату.

   Стоїть окремою колонкою праворуч і липне до верху: на широкому
   екрані поля вводу й результат вміщаються поруч, і жодне з них не
   треба шукати прокруткою. На вузькому колонка просто йде першою —
   лишається та сама липка смуга, що була раніше.

   Тому табло тепер вертикальне: обʼєм великим числом угорі, під ним
   цифри одна під одною. У рядок вони ставали дрібними, щойно колонка
   звузилась до 380 пікселів.

   Структура постійна. Невідоме показане прочерком, а не підміною
   всього табла плашкою «заповни форму»: клітинки не мають стрибати,
   щойно зʼявились дані. Ризик, до речі, відомий одразу після
   депозиту й відсотка — ще до вибору активу.
================================================================== */

const money = (v) => `$${Number(v || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;

/* Дельта, а не підсумок балансу: трейдера цікавить, скільки він
   втратить. І дельти ніколи не збігаються між собою, на відміну від
   балансу при нульовому ризику. */
const delta = (v) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;

export default function ResultsBoard({
  lotSize, riskAmount, profit, rr,
  ready, balance = 0, riskPercent = 0, stopDistance = 0,
  isPipsMode = false,
}) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const move = ({ currentTarget, clientX, clientY }) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mx.set(clientX - left);
    my.set(clientY - top);
  };

  const rrNum = Number(rr) || 0;
  const risk = Number(riskAmount) || 0;
  const win = Number(profit) || 0;
  const bal = Number(balance) || 0;
  const riskShare = rrNum > 0 ? 1 / (1 + rrNum) : 1;

  const after = [
    { label: 'плюс', value: win, tone: T.ok, icon: Target },
    { label: 'мінус', value: -risk, tone: T.bad, icon: TrendingDown },
    { label: 'три стопи', value: -risk * 3, tone: T.warn, icon: AlertCircle },
  ];

  return (
    <motion.div
      onMouseMove={move}
      className="group relative overflow-hidden rounded-2xl"
      style={{
        background: 'var(--edge-surface-hi, rgba(18,18,22,0.94))',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${ready ? T.lineAcc : T.line}`,
        boxShadow: '0 20px 48px -30px var(--edge-panel-glow, rgba(0,0,0,0.5))',
      }}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, rgba(${T.accRgb},0.10), transparent 80%)` }}
      />

      <div className="relative z-10 p-5 sm:p-6">
        {/* ---------- обʼєм ---------- */}
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
          обʼєм позиції
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <motion.span
            key={lotSize}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={`leading-none tabular-nums ${ready ? 'text-[52px] font-black sm:text-[58px]' : 'text-[44px] font-light sm:text-[48px]'}`}
            style={{ fontFamily: T.mono, color: ready ? T.text : T.text4, letterSpacing: '-0.03em' }}
          >
            {/* Прочерк тонший за саме число: він означає «поки
                порожньо», а не товсту риску через пів картки. */}
            {ready ? lotSize : '—'}
          </motion.span>
          <span className="text-[15px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
            лота
          </span>
          {ready && (
            <CopyButton
              textToCopy={lotSize}
              size={22}
              className="rounded-lg p-1.5 transition-colors"
              style={{ background: 'rgba(var(--edge-hair-rgb),0.05)', color: T.text3 }}
            />
          )}
        </div>

        {/* ---------- цифри одна під одною ---------- */}
        <div className="mt-5 flex flex-col" style={{ borderTop: `1px solid ${T.line}` }}>
          <Metric
            label="ризик"
            value={risk ? money(risk) : '—'}
            sub={`${riskPercent || 0}% депозиту`}
            tone={risk ? T.bad : T.text3}
            icon={ShieldAlert}
          />
          <Metric
            label="потенціал"
            value={win ? money(win) : '—'}
            sub={rrNum > 0 ? `1 : ${rr}` : 'постав тейк'}
            tone={win ? T.ok : T.text3}
            icon={Target}
          />
          {/* Дистанція стопу — число, яким трейдер очима перевіряє,
              чи не помилився з розміром. */}
          <Metric
            label="стоп"
            value={stopDistance || '—'}
            sub={isPipsMode ? 'пунктів' : 'ціни'}
            tone={stopDistance ? T.text2 : T.text3}
            icon={Ruler}
          />
        </div>

        {/* ---------- шкала ризик : винагорода ---------- */}
        <AnimatePresence initial={false}>
          {ready && rrNum > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div className="mt-4" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                {/* Смуга тонка навмисно: це лише пропорція, а не
                    головний елемент картки. */}
                <div className="flex h-[5px] overflow-hidden rounded-full" style={{ background: 'rgba(var(--edge-hair-rgb),0.06)' }}>
                  <motion.div
                    className="h-full"
                    initial={false}
                    animate={{ width: `${riskShare * 100}%` }}
                    transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                    style={{ background: T.bad }}
                  />
                  <motion.div
                    className="h-full"
                    initial={false}
                    animate={{ width: `${(1 - riskShare) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                    style={{ background: T.ok }}
                  />
                </div>

                {rrNum < 1.5 && (
                  <p className="mt-2.5 text-[13px] leading-snug" style={{ fontFamily: T.sans, color: T.warn }}>
                    RR нижче 1.5 — щоб виходити в нуль, треба вигравати частіше ніж {Math.round(riskShare * 100)}% угод.
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- наслідки для депозиту ---------- */}
        <AnimatePresence initial={false}>
          {bal > 0 && risk > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div className="mt-4 flex flex-col gap-2" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                {after.map(({ label, value, tone, icon: Icon }) => (
                  <span key={label} className="flex items-center gap-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    <Icon size={13} strokeWidth={2.4} style={{ color: tone }} />
                    {label}
                    <b className="ml-auto tabular-nums" style={{ fontFamily: T.mono, color: tone }}>{delta(value)}</b>
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ---------- одна цифра ----------
   Підпис ліворуч, число праворуч: у вузькій колонці так вони
   вирівнюються в стовпчик і читаються як таблиця, а не як три
   випадкові блоки. */

function Metric({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {Icon && <Icon size={13} strokeWidth={2.4} style={{ color: tone }} />}
        {label}
      </div>
      <div className="text-right">
        <div className="text-[21px] font-bold leading-none tabular-nums" style={{ fontFamily: T.mono, color: tone }}>
          {value}
        </div>
        <div className="mt-1 text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {sub}
        </div>
      </div>
    </div>
  );
}
