import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { useLang } from '../../lib/i18n';

/* ==================================================================
   Пояснення терміна.

   Демка повна слів, які трейдер знає, а новачок — ні: R, свіп, FVG,
   тілт. Половина з них і є те, що продукт вимірює, тому пояснювати
   їх треба на місці, а не окремим глосарієм у футері, куди ніхто
   не піде.

   Підказка малюється в порталі й позиціюється по слову: усередині
   таблиць із overflow вона б інакше обрізалась. Відкривається і на
   наведення, і на фокус з клавіатури — інакше термін лишається
   недоступним тим, хто не користується мишею.
================================================================== */

export default function Term({ id, children, className = '' }) {
  const { t } = useLang();
  const term = t.gloss.terms[id];

  const [box, setBox] = useState(null);
  const ref = useRef(null);

  if (!term) return children;

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = 288;
    /* Тримаємо панель у межах вікна: біля правого краю вона інакше
       виїжджає за екран і читається наполовину */
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    /* Якщо зверху місця нема — показуємо знизу */
    const above = r.top > 190;
    setBox({ left, top: above ? r.top - 12 : r.bottom + 12, above, w });
  };

  return (
    <>
      <span
        ref={ref}
        tabIndex={0}
        role="button"
        aria-label={term.title}
        onMouseEnter={show}
        onMouseLeave={() => setBox(null)}
        onFocus={show}
        onBlur={() => setBox(null)}
        className={`cursor-help outline-none ${className}`}
        style={{
          borderBottom: `1px dotted ${T.text4}`,
          textUnderlineOffset: 3,
        }}
      >
        {children}
      </span>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {box && (
            <motion.div
              initial={{ opacity: 0, y: box.above ? 6 : -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: box.above ? 6 : -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="pointer-events-none fixed z-[600] rounded-2xl p-4"
              style={{
                left: box.left,
                top: box.top,
                width: box.w,
                transform: box.above ? 'translateY(-100%)' : 'none',
                background: 'rgba(10,10,12,0.96)',
                border: `1px solid ${T.lineHi}`,
                backdropFilter: 'blur(14px)',
                boxShadow: '0 28px 64px -24px rgba(0,0,0,0.95)',
              }}
            >
              <div
                className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ fontFamily: T.sans, color: T.acc }}
              >
                {term.title}
              </div>
              <p
                className="text-[13px]"
                style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.65 }}
              >
                {term.text}
              </p>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
