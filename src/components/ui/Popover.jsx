import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE } from '../../lib/theme';

/* ==================================================================
   Спливаюча панель, яку не обріже батьківський контейнер.
   Малюється в body через портал і позиціюється по кнопці, тому
   всередині карток з overflow-hidden більше нічого «не пливе».
   Якщо знизу немає місця — розкривається вгору.
================================================================== */

export default function Popover({
  renderTrigger, children, align = 'left', gap = 8, z = 400,
  /* Тригер буває і чипом, і полем на всю ширину — inline-flex тоді
     обрізав би його по вмісту */
  triggerClass = 'inline-flex',
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const trigRef = useRef(null);
  const panelRef = useRef(null);

  const place = () => {
    const t = trigRef.current?.getBoundingClientRect();
    if (!t) return;
    const w = panelRef.current?.offsetWidth || 300;
    const h = panelRef.current?.offsetHeight || 320;

    let left = align === 'right' ? t.right - w : t.left;
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);

    let top = t.bottom + gap;
    if (top + h > window.innerHeight - 8) top = Math.max(8, t.top - h - gap);

    setPos({ top, left });
  };

  useLayoutEffect(() => { if (open) place(); /* eslint-disable-next-line */ }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onMove = () => place();
    const onDown = (e) => {
      if (trigRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };

    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
    /* eslint-disable-next-line */
  }, [open]);

  return (
    <>
      <span ref={trigRef} className={triggerClass}>
        {renderTrigger({ open, toggle: () => setOpen((o) => !o) })}
      </span>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -6, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.985 }}
              transition={{ duration: 0.16, ease: EASE }}
              style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: z }}
            >
              {children({ close: () => setOpen(false) })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
