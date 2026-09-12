import { motion } from 'framer-motion';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { T, SPRING } from '../../lib/theme';

/* ==================================================================
   Перемикач Daily / Weekly — той самий контрол на сторінці плану й
   у аналізах.

   Друга ітерація: перша версія просто пересадила старі uppercase-таби
   на іконки. Тут — власна дрібна деталь: скляна капсула замість
   плаского прямокутника (тонкий внутрішній блік зверху, розмите тло),
   а активна половина — не суцільна заливка, а вертикальний градієнт
   із власним глянцем і м'яким світлом під нею, як у кнопок дій по
   всьому застосунку. Іконка спереду легко «вистрибує» при перемиканні
   — не заради ефекту самого по собі, а щоб клік відчувався одразу,
   до того як бекенд відповість.
================================================================== */

const OPTIONS = [
  { id: 'daily', label: 'Daily', icon: CalendarDays },
  { id: 'weekly', label: 'Weekly', icon: CalendarRange },
];

export default function PlanTypeToggle({ mode, onChange, layoutId = 'plan-type-toggle' }) {
  return (
    <div
      className="relative inline-flex items-center gap-1 rounded-2xl p-1"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid ${T.line}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 10px 28px -18px rgba(0,0,0,0.7)',
      }}
    >
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.06em] transition-colors duration-200"
            style={{ fontFamily: T.sans, color: active ? 'var(--edge-on-acc, #0A0A0C)' : T.text3 }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.text3; }}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING}
                className="absolute inset-0 rounded-xl"
                style={{
                  background: `linear-gradient(180deg, rgba(${T.accRgb},1), rgba(${T.accRgb},0.86))`,
                  boxShadow: `0 6px 20px -6px rgba(${T.accRgb},0.75), inset 0 1px 0 rgba(255,255,255,0.35)`,
                }}
              />
            )}
            <motion.span
              className="relative z-10 flex items-center gap-1.5"
              animate={active ? { scale: [0.85, 1] } : { scale: 1 }}
              transition={SPRING}
            >
              <Icon size={13} strokeWidth={2.6} />
              <span>{label}</span>
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
