import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Loader2, FlaskConical } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { COMMON_PAIRS as PAIRS } from '../../lib/backtestStats';

/* ==================================================================
   Створення бектесту.
   Чотири поля — і можна працювати. Все інше добудується з угод.
================================================================== */

export default function NewBacktestModal({ saving, onClose, onCreate }) {
  const [f, setF] = useState({
    name: '',
    pair: 'EURUSD',
    strategy_name: '',
    initial_balance: 10000,
  });
  const set = (p) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const canSave = f.name.trim() && Number(f.initial_balance) > 0;

  const Label = ({ children, hint }) => (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="text-[12.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text3 }}>{children}</span>
      {hint && <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{hint}</span>}
    </div>
  );

  const inputStyle = {
    background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans,
  };

  /* спільний тихий ховер для полів: рамка світлішає, на фокусі — акцент */
  const fieldHover = {
    onMouseEnter: (e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = T.lineHi; },
    onMouseLeave: (e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = T.line; },
    onFocus: (e) => (e.currentTarget.style.borderColor = T.lineAcc),
    onBlur: (e) => (e.currentTarget.style.borderColor = T.line),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[220] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[560px] overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)' }}
      >
        <div className="flex items-center gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.accLine}` }}
          >
            <FlaskConical size={15} strokeWidth={2.2} style={{ color: T.acc }} />
          </div>
          <div>
            <div className="text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Новий бектест</div>
            <div className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>Ризик фіксований — 1% на угоду</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto grid h-9 w-9 place-items-center rounded-xl transition-colors"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
          >
            <X size={15} strokeWidth={2.4} />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6">
          <div>
            <Label>Назва</Label>
            <input
              autoFocus
              value={f.name}
              onChange={(e) => set({ name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onCreate(f); }}
              placeholder="Наприклад: Silver Bullet · London · Q3"
              className="h-12 w-full rounded-xl px-4 text-[15px] outline-none transition-colors duration-200"
              style={inputStyle}
              {...fieldHover}
            />
          </div>

          <div>
            <Label>Актив</Label>
            <div className="flex flex-wrap gap-2">
              {PAIRS.map((p) => {
                const on = f.pair === p;
                return (
                  <button
                    key={p}
                    onClick={() => set({ pair: p })}
                    className="rounded-lg px-3 py-2 text-[13.5px] font-semibold tabular-nums transition-colors duration-200"
                    style={{
                      fontFamily: T.sans,
                      color: on ? T.acc : T.text3,
                      background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                      border: `1px solid ${on ? T.lineAcc : T.line}`,
                    }}
                    onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                    onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; } }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            <input
              value={PAIRS.includes(f.pair) ? '' : f.pair}
              onChange={(e) => set({ pair: e.target.value.toUpperCase() })}
              placeholder="або впиши свій"
              className="mt-2 h-10 w-full rounded-xl px-3.5 text-[13.5px] outline-none transition-colors duration-200"
              style={inputStyle}
              {...fieldHover}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="не обовʼязково">Стратегія</Label>
              <input
                value={f.strategy_name}
                onChange={(e) => set({ strategy_name: e.target.value })}
                placeholder="SFP, Silver Bullet…"
                className="h-11 w-full rounded-xl px-3.5 text-[14px] outline-none transition-colors duration-200"
                style={inputStyle}
                {...fieldHover}
              />
            </div>
            <div>
              <Label>Стартовий депозит</Label>
              <div className="flex h-11 items-center gap-2 rounded-xl px-3.5" style={inputStyle}>
                <span className="text-[14px]" style={{ color: T.text4 }}>$</span>
                <input
                  value={f.initial_balance}
                  onChange={(e) => set({ initial_balance: e.target.value.replace(/[^\d]/g, '') })}
                  inputMode="numeric"
                  className="w-full bg-transparent text-[14px] font-semibold tabular-nums outline-none"
                  style={{ fontFamily: T.mono, color: T.text }}
                />
              </div>
            </div>
          </div>

          <p className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
            1R = 1% депозиту, тобто ${Math.round((Number(f.initial_balance) || 0) * 0.01).toLocaleString('uk-UA')} на угоду.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-4 py-4 sm:px-6" style={{ borderTop: `1px solid ${T.line}` }}>
          <button
            onClick={onClose}
            className="h-11 rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
          >
            Скасувати
          </button>
          <button
            onClick={() => canSave && onCreate(f)}
            disabled={!canSave || saving}
            className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            style={{
              background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
              opacity: canSave && !saving ? 1 : 0.45,
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? `0 6px 18px -8px rgba(${T.accRgb},0.6)` : 'none',
            }}
            onMouseEnter={(e) => { if (canSave) e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`; }}
            onMouseLeave={(e) => { if (canSave) e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`; }}
          >
            {saving ? <Loader2 size={15} strokeWidth={3} className="animate-spin" /> : <Check size={15} strokeWidth={3} className="shrink-0" />}
            Створити
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
