import { useEffect, useState } from 'react';
import { motion, animate, useMotionValue, useReducedMotion, AnimatePresence } from 'framer-motion';
import { T, EASE } from '../../lib/theme';

/* ==================================================================
   Дрібні живі деталі чекліста.
   Правило те саме, що й на решті сайту: анімація пояснює зміну стану,
   а не привертає увагу. Все в межах 200–600мс, все поважає
   prefers-reduced-motion.
================================================================== */

/* ---------- цифра, що доїжджає до значення ---------- */
export function Counter({ value, className, style }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const controls = animate(mv, value, {
      duration: 0.45,
      ease: EASE,
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, mv, reduce]);

  return <span className={className} style={style}>{shown}</span>;
}

/* ---------- галочка, яка малюється ---------- */
export function DrawnCheck({ size = 14, color = 'var(--edge-bg, #0A0A0C)', stroke = 3.6 }) {
  const reduce = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <motion.path
        d="M4.5 12.5 L9.5 17.5 L19.5 6.5"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

/* ---------- кільце прогресу з м'яким світлом ---------- */
export function ProgressRing({ value, total, color, size = 74 }) {
  const reduce = useReducedMotion();
  const pct = total ? value / total : 0;
  const R = size / 2 - 7;
  const C = 2 * Math.PI * R;
  const full = total > 0 && value === total;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      {/* світло за кільцем прокидається тільки коли все закрито */}
      <motion.span
        className="pointer-events-none absolute rounded-full"
        style={{ width: size, height: size, background: color, filter: 'blur(18px)' }}
        initial={false}
        animate={{ opacity: full ? 0.28 : 0.06 }}
        transition={{ duration: 0.6, ease: EASE }}
      />

      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={T.line} strokeWidth="4" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={R}
          fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - pct) }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
        />
      </svg>

      {/* Контраст: зроблене — кольором стану, знаменник — читабельним
         вторинним, а не ледь помітним сірим. */}
      <span className="absolute flex items-baseline text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono }}>
        <motion.span initial={false} animate={{ color: full ? color : T.text }} transition={{ duration: 0.4, ease: EASE }}>
          <Counter value={value} />
        </motion.span>
        <span className="text-[13px]" style={{ color: T.text2, opacity: 0.75 }}>/{total}</span>
      </span>
    </div>
  );
}

/* ---------- вузол на вертикальній лінії прогресу ---------- */
export function SpineNode({ done, color }) {
  return (
    <span className="relative grid h-8 w-8 place-items-center">
      <AnimatePresence>
        {done && (
          <motion.span
            key="pulse"
            className="absolute rounded-full"
            style={{ background: color }}
            initial={{ scale: 0.4, opacity: 0.5 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      <motion.span
        className="relative h-3 w-3 rounded-full"
        initial={false}
        animate={{
          backgroundColor: done ? color : T.surface,
          borderColor: done ? color : T.lineHi,
          scale: done ? 1 : 0.8,
        }}
        transition={{ type: 'spring', stiffness: 380, damping: 24 }}
        style={{ borderWidth: 2, borderStyle: 'solid' }}
      />
    </span>
  );
}

/* ---------- одноразовий проблиск по рядку ---------- */
export function Sweep({ trigger, color }) {
  const reduce = useReducedMotion();
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    if (trigger && !reduce) setRuns((n) => n + 1);
  }, [trigger, reduce]);

  if (!trigger || reduce) return null;

  return (
    <motion.span
      key={runs}
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-1/3 rounded-xl"
      style={{ background: `linear-gradient(90deg, transparent, ${color}22, transparent)` }}
      initial={{ x: '-120%' }}
      animate={{ x: '420%' }}
      transition={{ duration: 0.75, ease: 'easeOut' }}
    />
  );
}

/* ---------- лінія прогресу по верхньому краю картки ---------- */
export function EdgeProgress({ pct, color }) {
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: T.line }}>
      <motion.span
        className="absolute inset-y-0 left-0 origin-left"
        style={{ background: `linear-gradient(90deg, ${color}00, ${color})`, width: '100%' }}
        initial={false}
        animate={{ scaleX: pct }}
        transition={{ type: 'spring', stiffness: 140, damping: 24 }}
      />
    </span>
  );
}
