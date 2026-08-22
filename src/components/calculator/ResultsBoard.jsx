import { motion, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';
import {
  Activity, ShieldAlert, Target, Ruler, Wallet, TrendingDown, AlertCircle,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CopyButton } from '../ui/CopyElements';

/* ==================================================================
   Табло результату.
   Ефекти лишились ті самі — 3D-нахил, промінь за курсором і світіння
   цифр, — але тепер табло не мовчить, коли даних не вистачає, і
   показує не лише лот, а й наслідки: що буде з балансом при плюсі,
   при мінусі і після трьох стопів поспіль.
================================================================== */

/* картка з променем за курсором */
function HoverCard({ children, className, glow, accent, style }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const move = ({ currentTarget, clientX, clientY }) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mx.set(clientX - left);
    my.set(clientY - top);
  };

  return (
    <div onMouseMove={move} className={`group/item relative overflow-hidden ${className}`} style={style}>
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/item:opacity-100"
        style={{ background: useMotionTemplate`radial-gradient(250px circle at ${mx}px ${my}px, ${glow}, transparent 80%)` }}
      />
      <span className="absolute inset-x-0 top-0 z-10 h-[2px]" style={{ background: accent }} />
      {children}
    </div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 15, filter: 'blur(4px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 350, damping: 26 } },
};

const money = (v) => `$${Number(v || 0).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`;

export default function ResultsBoard({
  lotSize, riskAmount, profit, rr,
  missing = [], balance = 0, riskPercent = 0, stopDistance = 0, isPipsMode = false, assetPair = '',
}) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });

  const move = ({ currentTarget, clientX, clientY }) => {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const lx = clientX - left;
    const ly = clientY - top;
    mx.set(lx);
    my.set(ly);
    const max = 4;
    rotateX.set(-Math.max(-1, Math.min(1, (ly / height) * 2 - 1)) * max);
    rotateY.set(Math.max(-1, Math.min(1, (lx / width) * 2 - 1)) * max);
  };

  const leave = () => { rotateX.set(0); rotateY.set(0); };

  const ready = missing.length === 0 && lotSize !== '0.00';
  const rrNum = Number(rr) || 0;
  const risk = Number(riskAmount) || 0;
  const win = Number(profit) || 0;
  const bal = Number(balance) || 0;

  /* пропорції смуги — реальні, а не намальовані 25/75 */
  const riskShare = rrNum > 0 ? 1 / (1 + rrNum) : 0.5;

  const after = [
    { label: 'якщо плюс', value: bal + win, tone: T.ok, icon: Target },
    { label: 'якщо мінус', value: bal - risk, tone: T.bad, icon: TrendingDown },
    { label: '3 стопи поспіль', value: bal - risk * 3, tone: T.warn, icon: AlertCircle },
  ];

  return (
    <motion.div variants={itemVariants} className="flex h-full flex-col lg:col-span-7" style={{ perspective: 1200 }}>
      <motion.div
        onMouseMove={move}
        onMouseLeave={leave}
        style={{
          rotateX,
          rotateY,
          transformStyle: 'preserve-3d',
          background: 'rgba(10,10,12,0.55)',
          border: `1px solid ${T.line}`,
        }}
        className="group relative flex flex-1 cursor-default flex-col justify-center overflow-hidden rounded-[2rem] p-7 shadow-2xl backdrop-blur-xl md:p-10"
      >
        {/* промінь за курсором */}
        <motion.div
          className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: useMotionTemplate`radial-gradient(600px circle at ${mx}px ${my}px, rgba(${T.accRgb},0.13), transparent 80%)` }}
        />

        {/* кольорові ореоли по кутах */}
        <div className="pointer-events-none absolute right-0 top-0 h-[300px] w-[300px] rounded-full" style={{ background: `rgba(${T.accRgb},0.10)`, filter: 'blur(120px)' }} />
        <div className="pointer-events-none absolute bottom-0 left-0 h-[220px] w-[220px] rounded-full" style={{ background: `rgba(${T.badRgb},0.08)`, filter: 'blur(100px)' }} />

        <div className="relative z-10 mx-auto w-full max-w-lg space-y-9" style={{ transform: 'translateZ(30px)' }}>

          {/* головна цифра */}
          <div className="relative text-center">
            <h3
              className="mb-3 flex items-center justify-center gap-2 text-[12px] font-bold uppercase tracking-[0.2em]"
              style={{ fontFamily: T.sans, color: T.text3 }}
            >
              <Activity size={14} style={{ color: T.acc }} /> Обʼєм позиції
            </h3>

            <div className="flex items-center justify-center gap-4">
              <motion.div
                key={lotSize}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                className="text-[68px] font-black leading-none tracking-tighter md:text-[88px]"
                style={{
                  fontFamily: T.mono,
                  color: ready ? T.text : T.text4,
                  filter: ready ? `drop-shadow(0 0 22px rgba(${T.accRgb},0.35))` : 'none',
                }}
              >
                {lotSize}
              </motion.div>
              {ready && (
                <CopyButton
                  textToCopy={lotSize}
                  size={26}
                  className="rounded-xl border p-2 transition-colors"
                  style={{ background: T.surface, borderColor: T.line, color: T.text3 }}
                />
              )}
            </div>

            <div className="mt-2 text-[13px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: ready ? T.acc : T.text4 }}>
              стандартних лотів
            </div>

            {/* що саме заважає порахувати */}
            {!ready && missing.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="mx-auto mt-5 flex max-w-[380px] flex-wrap items-center justify-center gap-2"
              >
                <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>не вистачає:</span>
                {missing.map((m) => (
                  <span
                    key={m}
                    className="rounded-lg px-2 py-1 text-[12.5px] font-semibold"
                    style={{ fontFamily: T.sans, color: T.warn, background: `rgba(${T.warnRgb},0.10)`, border: `1px solid rgba(${T.warnRgb},0.25)` }}
                  >
                    {m}
                  </span>
                ))}
              </motion.div>
            )}
          </div>

          <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${T.lineHi}, transparent)` }} />

          {/* ризик і потенціал */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <HoverCard
              glow={`rgba(${T.badRgb},0.16)`}
              accent={`rgba(${T.badRgb},0.55)`}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(19,19,22,0.8)', border: `1px solid rgba(${T.badRgb},0.14)` }}
            >
              <div className="relative z-10 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                <ShieldAlert size={14} style={{ color: T.bad }} /> Ризик
              </div>
              <div
                className="relative z-10 text-[28px] font-black tabular-nums"
                style={{ fontFamily: T.mono, color: T.bad, filter: `drop-shadow(0 0 10px rgba(${T.badRgb},0.25))` }}
              >
                {money(risk)}
              </div>
              <div className="relative z-10 mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {riskPercent || 0}% від депозиту
              </div>
            </HoverCard>

            <HoverCard
              glow={`rgba(${T.okRgb},0.16)`}
              accent={`rgba(${T.okRgb},0.55)`}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(19,19,22,0.8)', border: `1px solid rgba(${T.okRgb},0.14)` }}
            >
              <div className="relative z-10 mb-2.5 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                <Target size={14} style={{ color: T.ok }} /> Потенціал
              </div>
              <div
                className="relative z-10 text-[28px] font-black tabular-nums"
                style={{ fontFamily: T.mono, color: T.ok, filter: `drop-shadow(0 0 10px rgba(${T.okRgb},0.25))` }}
              >
                {money(win)}
              </div>
              <div className="relative z-10 mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {rrNum > 0 ? `${rr}R до цілі` : 'постав тейк'}
              </div>
            </HoverCard>
          </div>

          {/* смуга ризик : винагорода */}
          <div>
            <div className="mb-2.5 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans }}>
              <span style={{ color: T.bad }}>ризик 1R</span>
              <span
                className="rounded-md px-2.5 py-1 tabular-nums"
                style={{ background: T.surface, border: `1px solid ${T.lineHi}`, color: T.text, fontFamily: T.mono }}
              >
                1 : {rr}
              </span>
              <span style={{ color: rrNum > 0 ? T.ok : T.text4 }}>ціль {rr}R</span>
            </div>

            <div className="relative flex h-3 overflow-hidden rounded-full" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
              <motion.div
                className="relative h-full"
                initial={false}
                animate={{ width: `${riskShare * 100}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                style={{ background: T.bad }}
              >
                <span className="absolute inset-y-0 right-0 w-[2px]" style={{ background: '#fff', boxShadow: '0 0 10px #fff' }} />
              </motion.div>
              <motion.div
                className="h-full"
                initial={false}
                animate={{ width: `${(1 - riskShare) * 100}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                style={{
                  background: rrNum > 0
                    ? `linear-gradient(90deg, rgba(${T.okRgb},0.45), rgba(${T.okRgb},0.9))`
                    : T.line,
                }}
              />
            </div>

            {rrNum > 0 && rrNum < 1.5 && (
              <p className="mt-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.warn }}>
                RR нижче 1.5 — щоб виходити в нуль, треба вигравати частіше ніж {Math.round((1 / (1 + rrNum)) * 100)}% угод.
              </p>
            )}
          </div>

          {/* наслідки */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 20 }}>
            {after.map(({ label, value, tone, icon: Icon }) => (
              <div key={label} className="min-w-0 rounded-xl px-3 py-2.5" style={{ background: 'rgba(19,19,22,0.7)', border: `1px solid ${T.line}` }}>
                <div className="mb-1 flex items-center gap-1.5">
                  <Icon size={12} strokeWidth={2.4} style={{ color: tone }} />
                  <span className="truncate text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {label}
                  </span>
                </div>
                <div className="truncate text-[15px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: bal ? tone : T.text4 }}>
                  {bal ? money(value) : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* дрібні деталі розрахунку */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            <span className="flex items-center gap-1.5">
              <Ruler size={12} strokeWidth={2.2} />
              стоп {stopDistance ? `${stopDistance}${isPipsMode ? ' пунктів' : ''}` : '—'}
            </span>
            <span className="flex items-center gap-1.5">
              <Wallet size={12} strokeWidth={2.2} />
              депозит {bal ? money(bal) : '—'}
            </span>
            {assetPair && <span className="tabular-nums" style={{ fontFamily: T.mono }}>{assetPair}</span>}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
