import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Plus, SlidersHorizontal, Loader2, ChevronDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, QUALITIES, COMMON_PAIRS } from '../../lib/backtestStats';

/* ==================================================================
   Швидкий рядок.
   Бектест — це сотні угод, і кожну відкривати модалкою неможливо.
   Тут усе, що впливає на статистику: напрям, результат, RR, якість,
   сесія, дата. Enter — і угода в базі, фокус лишається на RR.
   Все інше (скрін, нотатка, психологія) — кнопкою «Деталі».
================================================================== */

function Seg({ options, value, onChange, colorOf, size = 'md' }) {
  return (
    <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      {options.map((o) => {
        const on = value === o;
        const c = colorOf ? colorOf(o) : T.acc;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`relative whitespace-nowrap rounded-lg font-bold transition-colors duration-200 ${
              size === 'sm' ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-3 py-1.5 text-[13.5px]'
            }`}
            style={{ fontFamily: T.sans, color: on ? c : T.text3, zIndex: 1 }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${options.join('')}`}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg"
                style={{ background: `${c}1f`, border: `1px solid ${c}3d`, zIndex: -1 }}
              />
            )}
            {o}
          </button>
        );
      })}
    </div>
  );
}

const qualColor = (q) => ({ 'A+': T.ok, A: T.acc, B: T.warn, C: T.bad }[q] || T.text3);
const resColor = (r) => ({ WIN: T.ok, LOSS: T.bad, BE: T.text3 }[r] || T.text3);

/* ---------- вибір активу ----------

   Бектест заводиться під один інструмент, але людина реальноганяє
   в ньому і сусідні — без цього поля всі вони злипались в одну
   статистику, і розділити її потім було нічим.

   Список збирається з трьох джерел, у порядку корисності: актив
   самого бектесту, вже вписані в нього активи, і тільки потім
   загальний перелік. Внизу — поле для чого завгодно свого.

   Головне обмеження: у бектесті активи майже не міняються — сотня
   угод підряд по одній парі. Тому вибране значення живе в стані
   рядка і не скидається після кожного запису. */
function PairPicker({ value, sessionPair, used, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const pick = (p) => { onChange(p); setOpen(false); setDraft(''); };

  const commit = () => {
    const v = draft.trim().toUpperCase();
    if (v) pick(v);
  };

  /* Дублікати прибираємо, порядок джерел зберігаємо */
  const options = [...new Set([sessionPair, ...used, ...COMMON_PAIRS].filter(Boolean))];

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex h-[38px] items-center gap-1.5 rounded-xl px-3 transition-colors"
        style={{
          background: T.sunken,
          border: `1px solid ${open ? T.lineAcc : T.line}`,
          fontFamily: T.mono,
          color: value ? T.text : T.text4,
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        <span className="text-[13.5px] font-bold">{value || 'актив'}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.6}
          style={{ color: T.text4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 top-[42px] z-30 w-[190px] overflow-hidden rounded-xl p-1.5"
            /* Випадайка лежить над рядком, тому фон їй потрібен
               непрозорий — той самий, що в бічній панелі. У світлих
               темах змінна вже перевизначена, тому беремо її, а не
               T.surface. */
            style={{
              background: 'var(--edge-panel, #131316)',
              border: `1px solid ${T.line}`,
              boxShadow: 'var(--edge-panel-shadow, 0 18px 44px rgba(0,0,0,0.55))',
            }}
          >
            <div className="max-h-[210px] overflow-y-auto custom-scrollbar">
              {options.map((p) => {
                const on = p === value;
                return (
                  <button
                    key={p}
                    onClick={() => pick(p)}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-[7px] text-left text-[13px] font-bold transition-colors"
                    style={{ fontFamily: T.mono, color: on ? T.acc : T.text2, background: on ? `rgba(${T.accRgb},0.10)` : 'transparent' }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {p}
                    {p === sessionPair && (
                      <span className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        бектест
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${T.line}` }}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
                onBlur={commit}
                placeholder="свій актив"
                className="h-[32px] w-full rounded-lg bg-transparent px-2.5 text-[13px] font-bold outline-none"
                style={{ fontFamily: T.mono, color: T.text }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QuickTradeBar({
  onQuickAdd, onOpenDetails, saving,
  defaultSession = 'London', sessionPair = '', usedPairs = [],
}) {
  const [q, setQ] = useState({
    type: 'LONG',
    result: 'WIN',
    rr: '2',
    quality: 'A',
    session: defaultSession,
    pair: sessionPair,
    date: new Date().toISOString().slice(0, 10),
  });

  /* Актив бектесту приїжджає після завантаження сесії, тобто вже
     після першого рендера. Підставляємо його тільки якщо людина ще
     нічого не вибрала — інакше свій вибір затирався б відповіддю
     з бази. */
  useEffect(() => {
    if (sessionPair) setQ((s) => (s.pair ? s : { ...s, pair: sessionPair }));
  }, [sessionPair]);

  const set = (p) => setQ((s) => ({ ...s, ...p }));

  const submit = () => {
    if (saving) return;
    const rr = Number(q.rr);
    onQuickAdd({
      ...q,
      rr: q.result === 'LOSS' ? 1 : q.result === 'BE' ? 0 : Number.isFinite(rr) ? Math.abs(rr) : 0,
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-3 sm:gap-2.5 sm:px-4 sm:py-3.5"
      style={{
        background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
        border: `1px solid ${T.line}`,
      }}
    >
      <span className="flex items-center gap-2 pr-1">
        <motion.span
          animate={{ opacity: [1, 0.45, 1] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="flex"
        >
          <Zap size={15} strokeWidth={2.4} style={{ color: T.acc }} />
        </motion.span>
        <span className="text-[12.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>
          Швидкий запис
        </span>
      </span>

      <PairPicker
        value={q.pair}
        sessionPair={sessionPair}
        used={usedPairs}
        onChange={(v) => set({ pair: v })}
      />

      <Seg options={['LONG', 'SHORT']} value={q.type} onChange={(v) => set({ type: v })} colorOf={(v) => (v === 'LONG' ? T.ok : T.info)} />
      <Seg options={['WIN', 'LOSS', 'BE']} value={q.result} onChange={(v) => set({ result: v })} colorOf={resColor} />

      {/* RR — головне поле, тому найпомітніше */}
      <div
        className="flex h-[38px] items-center gap-2 rounded-xl px-3"
        style={{
          background: T.sunken,
          border: `1px solid ${q.result === 'WIN' ? T.lineAcc : T.line}`,
          opacity: q.result === 'WIN' ? 1 : 0.5,
        }}
      >
        <span className="text-[12.5px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>RR</span>
        <input
          value={q.result === 'WIN' ? q.rr : q.result === 'LOSS' ? '−1' : '0'}
          disabled={q.result !== 'WIN'}
          onChange={(e) => set({ rr: e.target.value.replace(',', '.') })}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          inputMode="decimal"
          className="w-[52px] bg-transparent text-[15px] font-bold tabular-nums outline-none"
          style={{ fontFamily: T.mono, color: T.text }}
        />
      </div>

      <Seg options={QUALITIES} value={q.quality} onChange={(v) => set({ quality: v })} colorOf={qualColor} size="sm" />
      <Seg options={SESSIONS} value={q.session} onChange={(v) => set({ session: v })} size="sm" />

      <input
        type="date"
        value={q.date}
        onChange={(e) => set({ date: e.target.value })}
        className="h-[38px] rounded-xl px-3 text-[13.5px] outline-none"
        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, colorScheme: 'dark' }}
      />

      <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
        <button
          onClick={() => onOpenDetails(q)}
          className="flex h-[38px] items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
        >
          <SlidersHorizontal size={14} strokeWidth={2.2} />
          Деталі
        </button>

        <button
          onClick={submit}
          disabled={saving}
          className="group inline-flex h-[38px] flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-[13.5px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] sm:flex-none"
          style={{
            background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
            boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
            opacity: saving ? 0.6 : 1,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
        >
          {saving
            ? <Loader2 size={15} strokeWidth={3} className="animate-spin" />
            : <Plus size={15} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />}
          Записати
        </button>
      </div>
    </motion.section>
  );
}
