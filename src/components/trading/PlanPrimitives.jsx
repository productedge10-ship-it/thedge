import { useState, useRef, useEffect } from 'react';
import useDeferredField from '../../hooks/useDeferredField';
import { motion, AnimatePresence } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { Maximize2, Minimize2, Check } from 'lucide-react';
import { T, EASE, SPRING } from './planTheme';
import { Spotlight } from '../ui/Hovers';

/* ==================================================================
   Спільні будівельні блоки сторінки плану.
================================================================== */

/* ---------- Якір секції ---------- */
/* Розділювач між фазами дня. Дає око за що зачепитись при скролі
   і працює як ціль для навігації в доці. */
export function SectionAnchor({ id, label, sub, icon: Icon, progress = 0, first }) {
  const done = progress >= 1;
  return (
    <div
      id={id}
      className={`flex items-center gap-4 ${first ? 'mb-5' : 'mb-5 mt-12'}`}
      style={{ scrollMarginTop: 40 }}
    >
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2"
        style={{
          background: T.surface,
          border: `1px solid ${done ? `rgba(${T.okRgb},0.22)` : T.line}`,
        }}
      >
        <Icon size={13} strokeWidth={2.5} style={{ color: done ? T.ok : T.acc }} />
        <span
          className="text-[13px] font-bold uppercase tracking-[0.18em]"
          style={{ fontFamily: T.sans, color: T.text }}
        >
          {label}
        </span>
        <span
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          {sub}
        </span>
      </div>

      <div className="h-px flex-1" style={{ background: `linear-gradient(to right, ${T.line}, transparent)` }} />

      <span
        className="shrink-0 text-[12px] font-semibold tabular-nums"
        style={{ fontFamily: T.sans, color: done ? T.ok : T.text4 }}
      >
        {Math.round(progress * 100)}%
      </span>
    </div>
  );
}

/* ---------- Картка секції ---------- */
export function Card({ children, className = '', style, glow, ...rest }) {
  return (
    <Spotlight
      clip
      lift={false}
      radius={420}
      color={glow || `rgba(${T.accRgb},0.30)`}
      className={`rounded-2xl ${className}`}
      style={{
        background: T.surface,
        border: `1px solid ${T.line}`,
        boxShadow: 'var(--edge-card-shadow, 0 1px 0 rgba(255,255,255,0.03) inset, 0 24px 48px -32px rgba(0,0,0,0.9))',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Spotlight>
  );
}

/* ---------- Шапка секції ---------- */
export function SectionHead({ icon: Icon, title, hint, accent = T.acc, right, done }) {
  return (
    <div
      className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
      style={{ borderBottom: `1px solid ${T.line}` }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{
            background: done ? `rgba(${T.okRgb},0.10)` : `rgba(${T.accRgb},0.09)`,
            border: `1px solid ${done ? `rgba(${T.okRgb},0.22)` : `rgba(${T.accRgb},0.20)`}`,
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span
                key="done"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={SPRING}
              >
                <Check size={15} strokeWidth={3} style={{ color: T.ok }} />
              </motion.span>
            ) : (
              <motion.span
                key="icon"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={SPRING}
              >
                <Icon size={15} strokeWidth={2.2} style={{ color: accent }} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="min-w-0">
          <h3
            className="truncate text-[15px] font-semibold leading-tight"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}
          >
            {title}
          </h3>
          {hint && (
            <p className="mt-0.5 truncate text-[14px] font-medium" style={{ color: T.text3 }}>
              {hint}
            </p>
          )}
        </div>
      </div>

      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/* ---------- Лейбл поля ---------- */
export function FieldLabel({ icon: Icon, children, required, filled }) {
  const color = required && !filled ? T.warn : T.text3;
  return (
    <span
      className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.16em]"
      style={{ fontFamily: T.sans, color }}
    >
      {Icon && <Icon size={11} strokeWidth={2.5} />}
      {children}
      {required && !filled && <span style={{ color: T.warn }}>*</span>}
    </span>
  );
}

/* ==================================================================
   WriteBlock — головне поле для письма.
   Було: маленький прозорий textarea без меж, важко цілитись і читати.
   Стало: явна зона з підсвіткою фокусу, велика зручна типографіка,
   лічильник слів і режим фокусу на весь екран.
================================================================== */
export function WriteBlock({
  value,
  onChange,
  placeholder,
  minRows = 7,
  accent = T.acc,
  hint,
}) {
  const [focused, setFocused] = useState(false);
  const [zen, setZen] = useState(false);
  const ref = useRef(null);

  /* Друкуємо локально, нагору віддаємо після паузи — інакше кожна
     літера піднімала стан усього плану і ввід затинався */
  const field$ = useDeferredField(value, onChange);
  const words = field$.draft.trim() ? field$.draft.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (!zen) return;
    const onKey = (e) => e.key === 'Escape' && setZen(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [zen]);

  const field = (big) => (
    <TextareaAutosize
      ref={big ? undefined : ref}
      value={field$.draft}
      onChange={(e) => field$.onType(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); field$.flush(); }}
      placeholder={placeholder}
      minRows={big ? 16 : minRows}
      autoFocus={big}
      spellCheck={false}
      className="w-full resize-none border-none bg-transparent outline-none"
      style={{
        fontFamily: T.sans,
        fontSize: big ? 17 : 15.5,
        lineHeight: 1.75,
        color: T.text,
        letterSpacing: '0.002em',
      }}
    />
  );

  return (
    <>
      <div className="p-5 sm:p-6">
        <div
          className="relative rounded-xl transition-all duration-300"
          style={{
            background: T.sunken,
            border: `1px solid ${focused ? `rgba(${T.accRgb},0.45)` : T.line}`,
            boxShadow: focused ? `0 0 0 3px rgba(${T.accRgb},0.10)` : 'none',
          }}
        >
          {/* вертикальна риска-акцент при фокусі */}
          <motion.span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[2px] rounded-full"
            style={{ background: accent }}
            initial={false}
            animate={{ opacity: focused ? 1 : 0, scaleY: focused ? 1 : 0.3 }}
            transition={{ duration: 0.3, ease: EASE }}
          />

          <div className="px-5 py-4">{field(false)}</div>

          {/* нижня панель */}
          <div
            className="flex items-center justify-between px-5 py-2.5"
            style={{ borderTop: `1px solid ${T.line}` }}
          >
            <span
              className="text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ fontFamily: T.sans, color: T.text4 }}
            >
              {hint || 'Markdown не потрібен — пиши як думаєш'}
            </span>

            <div className="flex items-center gap-3">
              <span
                className="text-[12px] font-semibold tabular-nums"
                style={{ fontFamily: T.sans, color: words > 0 ? T.text3 : T.text4 }}
              >
                {words} сл.
              </span>
              <button
                onClick={() => setZen(true)}
                title="Режим фокусу (Esc — вийти)"
                className="grid h-6 w-6 place-items-center rounded-md transition-colors"
                style={{ color: T.text4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <Maximize2 size={12} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Режим фокусу */}
      <AnimatePresence>
        {zen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-[9998] flex items-start justify-center overflow-y-auto p-4 sm:p-10"
            style={{ background: 'rgba(6,6,8,0.94)', backdropFilter: 'blur(16px)' }}
          >
            <motion.div
              initial={{ y: 18, opacity: 0, scale: 0.99 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="my-auto w-full max-w-3xl rounded-2xl"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div
                className="flex items-center justify-between px-6 py-3.5"
                style={{ borderBottom: `1px solid ${T.line}` }}
              >
                <span
                  className="text-[12px] font-bold uppercase tracking-[0.18em]"
                  style={{ fontFamily: T.sans, color: T.text3 }}
                >
                  Режим фокусу · {words} сл.
                </span>
                <button
                  onClick={() => setZen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors"
                  style={{ color: T.text2, background: T.surfaceHi, border: `1px solid ${T.line}` }}
                >
                  <Minimize2 size={12} strokeWidth={2.5} /> Esc
                </button>
              </div>
              <div className="px-7 py-6">{field(true)}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
