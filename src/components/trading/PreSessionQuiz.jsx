import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertTriangle, X, Check, Loader2, ShieldCheck } from 'lucide-react';

import { T, EASE, SPRING } from './planTheme';
import { DIAG_QUESTIONS, answeredCount, isComplete, riskFlags } from '../../lib/diagnostics';

/* ==================================================================
   Діагностика перед сесією.
   Чотири питання, які трейдер має поставити собі до того, як
   відкриє термінал. Відповіді летять у базу одразу — модалка нічого
   не тримає в собі й нічим не шантажує на виході.
================================================================== */

function Question({ q, value, onAnswer, index }) {
  const good = value !== null && value !== undefined && value === q.goodIsYes;
  const bad = value !== null && value !== undefined && value !== q.goodIsYes;
  const dot = good ? T.ok : bad ? T.bad : T.lineHi;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE, delay: index * 0.05 }}
      className="flex flex-col gap-3 rounded-2xl px-4 py-3.5 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between"
      style={{
        background: T.sunken,
        border: `1px solid ${good ? `rgba(${T.okRgb},0.22)` : bad ? `rgba(${T.badRgb},0.22)` : T.line}`,
      }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <motion.span
          className="h-2 w-2 shrink-0 rounded-full"
          animate={{ background: dot, boxShadow: good || bad ? `0 0 12px ${dot}` : 'none' }}
          transition={{ duration: 0.3 }}
        />
        <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text2 }}>
          {q.label}
        </span>
      </span>

      <div className="flex shrink-0 gap-2">
        {[true, false].map((v) => {
          const on = value === v;
          const c = v === q.goodIsYes ? T.ok : T.bad;
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onAnswer(q.key, on ? null : v)}
              className="flex-1 rounded-xl px-5 py-2 text-[13px] font-bold transition-all duration-200 active:scale-95 sm:flex-none"
              style={{
                fontFamily: T.sans,
                background: on ? `${c}1f` : 'transparent',
                border: `1px solid ${on ? `${c}55` : T.line}`,
                color: on ? c : T.text4,
              }}
              onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = c; e.currentTarget.style.borderColor = `${c}40`; } }}
              onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; } }}
            >
              {v ? 'Так' : 'Ні'}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export default function PreSessionQuiz({
  isOpen, onClose, quizData, onAnswer, onNote, saving, dateLabel,
}) {
  if (typeof document === 'undefined') return null;

  const data = quizData || {};
  const count = answeredCount(data);
  const done = isComplete(data);
  const flags = riskFlags(data);
  const pct = (count / DIAG_QUESTIONS.length) * 100;
  const tone = done ? (flags.length ? T.warn : T.ok) : T.acc;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
          style={{ background: 'rgba(6,6,8,0.84)', backdropFilter: 'blur(10px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={SPRING}
            className="my-auto w-full max-w-[620px] overflow-hidden rounded-3xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
            }}
          >
            {/* ─────────── Шапка ─────────── */}
            <div
              className="relative flex items-center gap-3.5 px-4 py-4 sm:px-6 sm:py-5"
              style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})` }}
            >
              <div
                className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.accRgb},0.09)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                {done && !flags.length
                  ? <ShieldCheck size={19} strokeWidth={2.2} style={{ color: T.ok }} />
                  : <Activity size={19} strokeWidth={2.2} style={{ color: T.acc }} />}
              </div>

              <div className="min-w-0 pr-10">
                <div className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                  Risk management
                </div>
                <h3
                  className="mt-0.5 truncate text-[19px] font-bold leading-tight sm:text-[22px]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                >
                  Pre-Session Diagnostics
                </h3>
                {dateLabel && (
                  <div className="mt-0.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {dateLabel}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200 sm:right-6 sm:top-5"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text3; }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            {/* ─────────── Питання ─────────── */}
            <div className="max-h-[64vh] overflow-y-auto px-4 py-5 sm:px-6">
              <div className="flex flex-col gap-2.5">
                {DIAG_QUESTIONS.map((q, i) => (
                  <Question key={q.key} q={q} index={i} value={data[q.key]} onAnswer={onAnswer} />
                ))}
              </div>

              {/* Прогрес */}
              <div className="mt-5 flex items-center gap-3.5">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                  <motion.span
                    className="block h-full rounded-full"
                    initial={false}
                    animate={{ width: `${pct}%`, background: tone }}
                    transition={{ duration: 0.45, ease: EASE }}
                    style={{ boxShadow: `0 0 12px ${tone}` }}
                  />
                </span>
                <motion.span
                  className="flex shrink-0 items-center gap-1.5 text-[13px] font-bold tabular-nums"
                  animate={{ color: done ? T.ok : T.text4 }}
                  transition={{ duration: 0.3 }}
                  style={{ fontFamily: T.mono }}
                >
                  {done && <Check size={13} strokeWidth={3.4} />}
                  {count} / {DIAG_QUESTIONS.length}
                </motion.span>
              </div>

              {/* Попередження — рівно ті питання, що дали поганий сигнал */}
              <AnimatePresence>
                {flags.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 18 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.28, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div
                      className="flex gap-3 rounded-2xl p-4"
                      style={{ background: `rgba(${T.warnRgb},0.06)`, border: `1px solid rgba(${T.warnRgb},0.24)` }}
                    >
                      <AlertTriangle size={16} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.warn }} />
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.warn }}>
                          {flags.length === 1 ? 'Один сигнал проти торгівлі' : `${flags.length} сигнали проти торгівлі`}
                        </p>
                        <p className="mt-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                          {flags.map((f) => f.label.replace(/\?$/, '')).join(' · ')}. Зменш ризик удвічі
                          або пропусти сесію — це дешевше за відігравання.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Нотатка */}
              {onNote && (
                <textarea
                  value={data.note || ''}
                  onChange={(e) => onNote(e.target.value)}
                  placeholder="Що ще важливо памʼятати сьогодні? (опціонально)"
                  className="mt-4 min-h-[72px] w-full resize-y rounded-2xl p-4 text-[14px] outline-none transition-colors duration-200 placeholder:opacity-60"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, lineHeight: 1.6 }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                />
              )}
            </div>

            {/* ─────────── Підвал ─────────── */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 sm:px-6"
              style={{ borderTop: `1px solid ${T.line}`, background: T.surfaceHi }}
            >
              <span className="flex min-w-0 items-center gap-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {saving
                  ? <><Loader2 size={12} className="animate-spin" /> зберігаю…</>
                  : done
                    ? <><Check size={12} strokeWidth={3} style={{ color: T.ok }} /> збережено</>
                    : `лишилось ${DIAG_QUESTIONS.length - count}`}
              </span>

              <button
                type="button"
                onClick={onClose}
                className="ml-auto flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] sm:flex-none"
                style={{
                  background: done ? tone : T.surface,
                  border: `1px solid ${done ? 'transparent' : T.line}`,
                  color: done ? 'var(--edge-bg, #0A0A0C)' : T.text2,
                  fontFamily: T.sans,
                  boxShadow: done ? `0 8px 22px -10px ${tone}` : 'none',
                }}
              >
                {done && <Check size={15} strokeWidth={3} />}
                {done ? (flags.length ? 'Торгую обережно' : 'Почати сесію') : 'Закрити'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
