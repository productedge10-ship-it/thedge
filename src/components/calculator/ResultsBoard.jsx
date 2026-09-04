import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { ShieldAlert, Target, TrendingDown, AlertCircle, Ruler } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CopyButton } from '../ui/CopyElements';

/* ==================================================================
   Табло результату.

   Липка смуга над полями, а не панель у правій половині екрана:
   калькулятор це лінійна задача, і результат має бути там, куди
   дивишся, коли друкуєш.

   Структура постійна. Раніше при незаповненій формі табло
   підмінялось рядком «заповни, щоб порахувати» з плашками — і це
   виглядало як порожня коробка, яка ще й стрибала, щойно зʼявлялись
   дані. Тепер клітинки ті самі завжди, а невідоме показане
   прочерком. Ризик, до речі, відомий одразу після депозиту й
   відсотка — його видно ще до вибору активу, і це корисно.

   Прибрано 3D-нахил: обертати цифри, які людина читає, — шум.
   Світло за курсором лишилось, воно нічого не рухає.
================================================================== */

const money = (v) => `$${Number(v || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;

/* Дельта, а не підсумок балансу: трейдера цікавить, скільки він
   втратить. І дельти ніколи не збігаються між собою, на відміну від
   балансу при нульовому ризику — саме тому раніше три сценарії
   показували одне й те саме число. */
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
    <div className="sticky top-3 z-30 mb-4">
      <motion.div
        onMouseMove={move}
        className="group relative overflow-hidden rounded-2xl"
        style={{
          background: 'rgba(18,18,22,0.94)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${ready ? T.lineAcc : T.line}`,
          boxShadow: '0 20px 48px -30px rgba(0,0,0,0.95)',
        }}
      >
        <motion.div
          className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, rgba(${T.accRgb},0.10), transparent 80%)` }}
        />

        <div className="relative z-10 p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            {/* обʼєм */}
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                обʼєм позиції
              </div>
              <div className="flex items-center gap-2.5">
                <motion.span
                  key={lotSize}
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE }}
                  className={`leading-none tabular-nums ${ready ? 'text-[46px] font-black sm:text-[54px]' : 'text-[40px] font-light sm:text-[46px]'}`}
                  style={{
                    fontFamily: T.mono,
                    color: ready ? T.text : T.text4,
                    letterSpacing: '-0.03em',
                  }}
                >
                  {/* Поки числа немає, прочерк малювався тим самим
                      наджирним накресленням, що й сам обʼєм, — і
                      виглядав не як «поки порожньо», а як товста
                      риска через пів картки. Тонше й тьмяніше. */}
                  {ready ? lotSize : '—'}
                </motion.span>
                <span className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                  лота
                </span>
                {ready && (
                  <CopyButton
                    textToCopy={lotSize}
                    size={22}
                    className="rounded-lg p-1.5 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', color: T.text3 }}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
              {/* Ризик відомий одразу після депозиту й відсотка —
                  ще до того, як обрано актив. */}
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
              {/* Дистанція стопу — число, яким трейдер очима
                  перевіряє, чи не помилився з розміром. */}
              <Metric
                label="стоп"
                value={stopDistance || '—'}
                sub={isPipsMode ? 'пунктів' : 'ціни'}
                tone={stopDistance ? T.text2 : T.text3}
                icon={Ruler}
              />
            </div>
          </div>

          {/* шкала ризик : винагорода */}
          <AnimatePresence initial={false}>
            {ready && rrNum > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-5" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                  {/* Смуга була в десять пікселів — на тлі решти
                      цифр вона читалась як головний елемент картки,
                      хоч це лише пропорція. Пʼять достатньо, щоб
                      побачити співвідношення. */}
                  <div className="flex h-[5px] overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
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
                    <p className="mt-2.5 text-[13px]" style={{ fontFamily: T.sans, color: T.warn }}>
                      RR нижче 1.5 — щоб виходити в нуль, треба вигравати частіше ніж {Math.round(riskShare * 100)}% угод.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* наслідки для депозиту */}
          <AnimatePresence initial={false}>
            {bal > 0 && risk > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                style={{ overflow: 'hidden' }}
              >
                <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                  {after.map(({ label, value, tone, icon: Icon }) => (
                    <span key={label} className="flex items-center gap-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      <Icon size={13} strokeWidth={2.4} style={{ color: tone }} />
                      {label}
                      <b className="tabular-nums" style={{ fontFamily: T.mono, color: tone }}>{delta(value)}</b>
                    </span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- одна цифра ---------- */

function Metric({ label, value, sub, tone, icon: Icon }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {Icon && <Icon size={12} strokeWidth={2.4} style={{ color: tone }} />}
        {label}
      </div>
      <div className="text-[23px] font-bold leading-none tabular-nums" style={{ fontFamily: T.mono, color: tone }}>
        {value}
      </div>
      <div className="mt-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {sub}
      </div>
    </div>
  );
}
