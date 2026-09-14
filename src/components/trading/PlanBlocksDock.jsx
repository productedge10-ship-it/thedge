import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Check, Plus, LayoutGrid, ChevronDown } from 'lucide-react';
import { T, SPRING, EASE } from './planTheme';
import { usePlanBlocks, PHASE_LABEL } from '../../lib/planBlocks';

/* ==================================================================
   Панель «Блоки плану» угорі, під метаданими плану — єдине місце, де видно всі
   блоки разом. Увімкнений блок — заповнена плашка з галочкою,
   прихований — пунктирна з «+»: пунктир і плюс читаються як «сюди
   можна додати» без жодного пояснення. Приховати можна і тут, і
   іконкою-оком прямо в шапці блоку.
================================================================== */

export default function PlanBlocksDock({ mode }) {
  const { blocks, isVisible, toggle, hidden } = usePlanBlocks(mode);
  const phases = ['plan', 'live', 'review'];
  const shown = blocks.length - blocks.filter((b) => hidden.includes(b.id)).length;
  /* Панель стоїть угорі, над самим планом — налаштовують її рідко,
     тому згортається і памʼятає це, щоб не займати місце щодня. */
  const openKey = 'edge.plan.blocksDock.open';
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(openKey) !== '0'; } catch { return true; }
  });
  const toggleOpen = () => {
    const next = !open;
    try { localStorage.setItem(openKey, next ? '1' : '0'); } catch { /* не памʼятаємо */ }
    setOpen(next);
  };

  return (
    <div
      className="no-print mt-6 rounded-2xl"
      style={{ background: T.surface, border: `1px dashed ${T.lineHi}` }}
    >
      <button type="button" onClick={toggleOpen} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-3 p-5 text-left sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: `rgba(${T.accRgb},0.12)`, color: T.acc }}>
            <LayoutGrid size={19} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[19px] font-semibold" style={{ fontFamily: T.display, color: T.text }}>
              Блоки плану
            </div>
            <div className="mt-0.5 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Залиш тільки те, чим користуєшся. Натисни на блок, щоб прибрати або повернути його — записи не зникнуть.
            </div>
          </div>
        </div>
        <span className="text-[14.5px] font-medium tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
          {shown} з {blocks.length} на сторінці
          <motion.span className="ml-3 inline-grid align-middle" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE }}>
            <ChevronDown size={18} strokeWidth={2.4} />
          </motion.span>
        </span>
      </button>

      <AnimatePresence initial={false}>
      {open && (
      <motion.div
        key="body"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.28, ease: EASE }}
        style={{ overflow: 'hidden' }}
      >

      <div className="flex flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        {phases.map((phase) => {
          const list = blocks.filter((b) => b.phase === phase);
          if (!list.length) return null;
          return (
            <div key={phase} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-[80px] shrink-0 text-[12.5px] font-semibold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {PHASE_LABEL[phase]}
              </span>
              <div className="flex flex-wrap gap-2.5">
                {list.map((b) => {
                  const on = isVisible(b.id);
                  return (
                    <motion.button
                      key={b.id}
                      type="button"
                      layout
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING}
                      onClick={() => toggle(b.id)}
                      title={on ? 'Прибрати зі сторінки' : 'Додати на сторінку'}
                      className="plan-block-chip group flex h-12 items-center gap-2.5 rounded-xl pl-2.5 pr-4 text-[15.5px] font-medium"
                      style={{
                        fontFamily: T.sans,
                        background: on ? T.surfaceHi : 'transparent',
                        border: `1px ${on ? 'solid' : 'dashed'} ${on ? T.lineHi : T.lineHi}`,
                        color: on ? T.text : T.text3,
                      }}
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors duration-200"
                        style={{
                          background: on ? `rgba(${T.okRgb},0.14)` : `rgba(${T.accRgb},0.12)`,
                          color: on ? T.ok : T.acc,
                        }}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span
                            key={on ? 'on' : 'off'}
                            initial={{ scale: 0.4, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.4, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="grid place-items-center"
                          >
                            {on ? <Check size={15} strokeWidth={2.8} /> : <Plus size={15} strokeWidth={2.8} />}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                      {b.title}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      </motion.div>
      )}
      </AnimatePresence>

      <style>{`
        .plan-block-chip { transition: background .2s ease, border-color .2s ease, color .2s ease; }
        .plan-block-chip:hover { color: ${T.text} !important; border-color: rgba(${T.accRgb},0.45) !important; }
      `}</style>
    </div>
  );
}
