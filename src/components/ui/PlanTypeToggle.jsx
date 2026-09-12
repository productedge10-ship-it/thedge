import { motion } from 'framer-motion';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { T, SPRING } from '../../lib/theme';

/* ==================================================================
   Перемикач Daily / Weekly — той самий контрол на сторінці плану й
   у аналізах.

   Третя ітерація: другій бракувало характеру — обидва режими світились
   однаковим фіолетовим, і капсула сама по собі читалась як ще одна
   тиха деталь хедера, а не як перемикач масштабу. Тепер у кожного
   режиму власний колір (день — фіолетовий, тиждень — синій), і саме
   він тепер задає сяйво під усією капсулою — перемикання відчувається
   як зміна режиму, а не пересування однієї плашки.
================================================================== */

const OPTIONS = [
  { id: 'daily', label: 'Daily', icon: CalendarDays, tone: T.acc, rgb: T.accRgb },
  { id: 'weekly', label: 'Weekly', icon: CalendarRange, tone: T.info, rgb: T.infoRgb },
];

export default function PlanTypeToggle({ mode, onChange, layoutId = 'plan-type-toggle' }) {
  const active = OPTIONS.find((o) => o.id === mode) || OPTIONS[0];

  return (
    <div
      className="relative inline-flex items-center gap-1 rounded-2xl p-1"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: `1px solid rgba(${active.rgb},0.28)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 32px -18px rgba(${active.rgb},0.55)`,
        transition: 'border-color .35s ease, box-shadow .35s ease',
      }}
    >
      {OPTIONS.map(({ id, label, icon: Icon, tone, rgb }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.06em] transition-colors duration-200"
            style={{ fontFamily: T.sans, color: isActive ? 'var(--edge-on-acc, #0A0A0C)' : T.text3 }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = tone; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = T.text3; }}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                transition={SPRING}
                className="absolute inset-0 rounded-xl"
                style={{
                  background: `linear-gradient(180deg, ${tone}, rgba(${rgb},0.86))`,
                  boxShadow: `0 6px 20px -6px rgba(${rgb},0.8), inset 0 1px 0 rgba(255,255,255,0.35)`,
                }}
              />
            )}
            <motion.span
              className="relative z-10 flex items-center gap-1.5"
              animate={isActive ? { scale: [0.85, 1] } : { scale: 1 }}
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
