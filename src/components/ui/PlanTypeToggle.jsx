import { Fragment } from 'react';
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
  /* Одна капсула, як і була, але між режимами — тонка риска: без неї
     неактивна половина зливалась з фоном і не читалась як окремий
     варіант. */
  return (
    <div
      className="relative inline-flex items-center gap-1 rounded-2xl p-1"
      style={{
        /* Кольори — як у кнопки Telegram у налаштуваннях: темне
           заглиблення на токенах картки, без кольорового сяйва. */
        background: T.sunken,
        border: `1px solid ${T.line}`,
      }}
    >
      {OPTIONS.map(({ id, label, icon: Icon, tone }, i) => {
        const isActive = mode === id;
        return (
          <Fragment key={id}>
            {i > 0 && <span aria-hidden className="mx-0.5 h-5 w-px shrink-0" style={{ background: T.line }} />}
            <button
              type="button"
              onClick={() => onChange(id)}
              className="relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-bold uppercase tracking-[0.06em] transition-colors duration-200"
              style={{ fontFamily: T.sans, color: isActive ? T.text : T.text2 }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = T.text2; }}
            >
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  transition={SPRING}
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: T.surfaceHi,
                    border: `1px solid ${T.lineHi}`,
                  }}
                />
              )}
              <motion.span
                className="relative z-10 flex items-center gap-1.5"
                animate={isActive ? { scale: [0.85, 1] } : { scale: 1 }}
                transition={SPRING}
              >
                <Icon size={13} strokeWidth={2.6} style={{ color: isActive ? tone : 'inherit' }} />
                <span>{label}</span>
              </motion.span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
