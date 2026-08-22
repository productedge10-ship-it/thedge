import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, Cloud, CloudOff, Loader2, Check } from 'lucide-react';
import { T, SPRING } from './planTheme';

/* ==================================================================
   Плаваюча панель: статус синхронізації + швидкий трейд.
   Статус тепер читається одним поглядом — колір крапки каже все.
================================================================== */

export default function FloatingActionButtons({
  onAddTrade, onSave, isSaving, canSaveToCloud, hasUnsavedChanges, lastSaved, lastAction, backToTop,
}) {
  const state = !canSaveToCloud ? 'blocked'
    : isSaving ? 'saving'
    : hasUnsavedChanges ? 'dirty'
    : lastSaved ? 'saved' : 'idle';

  const cfg = {
    blocked: { c: T.warn, rgb: T.warnRgb, icon: CloudOff,  text: 'Вибери актив і bias' },
    saving:  { c: T.acc,  rgb: T.accRgb,  icon: Loader2,   text: 'Зберігаю...' },
    dirty:   { c: T.warn, rgb: T.warnRgb, icon: Cloud,     text: 'Є незбережені зміни' },
    saved:   { c: T.ok,   rgb: T.okRgb,   icon: Check,     text: `${lastAction} · ${lastSaved}` },
    idle:    { c: T.text3, rgb: '122,122,133', icon: Cloud, text: 'Натисни щоб зберегти' },
  }[state];

  const Icon = cfg.icon;

  return (
    <div className="no-print fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5 sm:bottom-8 sm:right-8">
      {backToTop}

      <motion.button
        onClick={onAddTrade}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.96 }}
        transition={SPRING}
        className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[14px] font-semibold"
        style={{
          background: T.surface,
          border: `1px solid rgba(${T.okRgb},0.28)`,
          color: T.ok,
          fontFamily: T.sans,
          boxShadow: '0 12px 32px -12px rgba(0,0,0,0.9)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Briefcase size={14} strokeWidth={2.4} />
        Трейд
      </motion.button>

      <motion.button
        onClick={onSave}
        whileHover={canSaveToCloud ? { y: -2 } : undefined}
        whileTap={canSaveToCloud ? { scale: 0.96 } : undefined}
        transition={SPRING}
        className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-[13px] font-semibold"
        style={{
          background: T.surface,
          border: `1px solid rgba(${cfg.rgb},0.28)`,
          color: cfg.c,
          fontFamily: T.sans,
          cursor: canSaveToCloud ? 'pointer' : 'not-allowed',
          boxShadow: '0 12px 32px -12px rgba(0,0,0,0.9)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <span className="relative grid h-4 w-4 place-items-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={state}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute"
            >
              <Icon size={14} strokeWidth={2.6} className={state === 'saving' ? 'animate-spin' : ''} />
            </motion.span>
          </AnimatePresence>
        </span>
        {cfg.text}
      </motion.button>
    </div>
  );
}
