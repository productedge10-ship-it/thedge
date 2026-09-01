import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, SlidersHorizontal, Loader2, ChevronDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, QUALITIES, COMMON_PAIRS } from '../../lib/backtestStats';
import { ACT, act, actGradient, actGradientHover } from './accent';
import DateField from '../ui/DateField';

/* ==================================================================
   Швидкий рядок.
   Бектест — це сотні угод, і кожну відкривати модалкою неможливо.
   У видимому рядку те, що впливає на статистику завжди: актив,
   напрям, результат, RR і сетап. Якість, сесія й дата ховаються
   під «Деталі» — їх міняють раз на десяток угод.
   Enter у полі RR або сетапу записує угоду.
================================================================== */

/* Та сама пружина, що в картці угоди: вибір усюди їде однаково */
const SEG_SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 };

/* Тип активу — суто підказка в списку, щоб не вчитуватись у тікер */
const KIND = {
  NAS100: 'Індекси', US30: 'Індекси', GER40: 'Індекси',
  XAUUSD: 'Метали',
  BTCUSD: 'Крипто', ETHUSD: 'Крипто',
  EURUSD: 'Forex', GBPUSD: 'Forex', USDJPY: 'Forex',
};

function Seg({ options, value, onChange, id }) {
  return (
    <div className="flex items-center gap-[5px] rounded-xl p-[5px]" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className="relative flex h-8 items-center justify-center whitespace-nowrap rounded-[9px] px-[15px] text-[11.5px] font-bold tracking-[0.06em]"
            style={{ fontFamily: T.mono, color: on ? '#ffffff' : T.text3, transition: 'color .25s ease', zIndex: 1 }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
          >
            {on && (
              <motion.span
                layoutId={`qseg-${id}`}
                transition={SEG_SPRING}
                className="absolute inset-0 rounded-[9px]"
                style={{
                  background: actGradient,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                  zIndex: -1,
                }}
              />
            )}
            {o}
          </button>
        );
      })}
    </div>
  );
}

const FieldLabel = ({ children }) => (
  <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.mono, color: T.text3 }}>
    {children}
  </span>
);

/* ---------- вибір активу ----------

   Бектест заводиться під один інструмент, але людина реально ганяє
   в ньому і сусідні — без цього поля всі вони злипались в одну
   статистику, і розділити її потім було нічим.

   Список збирається з трьох джерел, у порядку корисності: актив
   самого бектесту, вже вписані в нього активи, і тільки потім
   загальний перелік. Внизу — поле для чого завгодно свого. */
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
  const commit = () => { const v = draft.trim().toUpperCase(); if (v) pick(v); };

  const options = [...new Set([sessionPair, ...used, ...COMMON_PAIRS].filter(Boolean))];

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((s) => !s)}
        className="flex h-[42px] items-center gap-2.5 rounded-xl px-3.5 transition-all duration-200"
        style={{
          background: T.sunken,
          border: `1px solid ${open ? ACT.to : T.line}`,
          boxShadow: open ? `0 0 0 3px ${act(0.14)}` : 'none',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
      >
        <span className="text-[14px] font-bold tracking-[0.05em]" style={{ fontFamily: T.mono, color: value ? T.text : T.text4 }}>
          {value || 'актив'}
        </span>
        <ChevronDown
          size={15}
          strokeWidth={2.4}
          style={{ color: ACT.tint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 top-[calc(100%+8px)] z-30 w-[210px] overflow-hidden rounded-[14px] p-1.5"
            style={{
              /* Суцільний фон, а не панельна змінна: --edge-panel
                 напівпрозорий (він розрахований на розмиту бічну
                 панель), і крізь випадайку просвічував вміст під нею. */
              background: T.surfaceHi,
              border: `1px solid ${T.lineHi}`,
              boxShadow: 'var(--edge-panel-shadow, 0 24px 50px -18px rgba(0,0,0,0.9))',
            }}
          >
            <div className="custom-scrollbar max-h-[230px] overflow-y-auto">
              {options.map((p) => {
                const on = p === value;
                return (
                  <button
                    key={p}
                    onClick={() => pick(p)}
                    className="flex w-full items-center justify-between gap-4 rounded-[10px] px-3 py-2.5 text-left transition-colors"
                    style={{ background: on ? act(0.18) : 'transparent' }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = on ? act(0.18) : 'transparent'; }}
                  >
                    <span className="text-[13px] font-bold tracking-[0.05em]" style={{ fontFamily: T.mono, color: T.text }}>{p}</span>
                    <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {p === sessionPair ? 'бектест' : KIND[p] || ''}
                    </span>
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
                className="h-[32px] w-full rounded-lg bg-transparent px-3 text-[13px] font-bold outline-none"
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
  const [more, setMore] = useState(false);
  const [q, setQ] = useState({
    type: 'LONG',
    result: 'WIN',
    rr: '2',
    quality: 'A',
    session: defaultSession,
    pair: sessionPair,
    setup: '',
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

  /* Сетап їде тегом — саме його показує колонка таблиці */
  const payload = (s) => {
    const rr = Number(s.rr);
    const setup = (s.setup || '').trim();
    return {
      ...s,
      tags: setup ? [setup] : [],
      notes: '',
      rr: s.result === 'LOSS' ? 1 : s.result === 'BE' ? 0 : Number.isFinite(rr) ? Math.abs(rr) : 0,
    };
  };

  const submit = () => {
    if (saving) return;
    onQuickAdd(payload(q));
    setQ((s) => ({ ...s, setup: '' }));
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="rounded-[20px] px-[22px] py-5"
      style={{
        background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
        border: `1px solid ${act(0.4)}`,
        boxShadow: `0 0 0 4px ${act(0.07)}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <motion.span animate={{ opacity: [1, 0.45, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="flex">
          <Zap size={15} strokeWidth={2.2} style={{ color: ACT.tint }} />
        </motion.span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.mono, color: ACT.tint }}>
          Швидкий запис
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <PairPicker value={q.pair} sessionPair={sessionPair} used={usedPairs} onChange={(v) => set({ pair: v })} />

        <Seg id="dir" options={['LONG', 'SHORT']} value={q.type} onChange={(v) => set({ type: v })} />
        <Seg id="res" options={['WIN', 'LOSS', 'BE']} value={q.result} onChange={(v) => set({ result: v })} />

        {/* RR — головне поле, тому найпомітніше */}
        <div
          className="flex h-[42px] shrink-0 items-center gap-2.5 rounded-xl px-3.5"
          style={{
            background: T.sunken,
            border: `1px solid ${q.result === 'WIN' ? act(0.4) : T.line}`,
            opacity: q.result === 'WIN' ? 1 : 0.5,
          }}
        >
          <FieldLabel>RR</FieldLabel>
          <input
            value={q.result === 'WIN' ? q.rr : q.result === 'LOSS' ? '−1' : '0'}
            disabled={q.result !== 'WIN'}
            onChange={(e) => set({ rr: e.target.value.replace(',', '.') })}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            inputMode="decimal"
            className="w-[46px] bg-transparent text-[15px] font-bold tabular-nums outline-none"
            style={{ fontFamily: T.mono, color: T.text }}
          />
        </div>

        <div
          className="flex h-[42px] min-w-[150px] flex-1 items-center rounded-xl"
          style={{ background: T.sunken, border: `1px solid ${T.line}` }}
        >
          <input
            value={q.setup}
            onChange={(e) => set({ setup: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="Сетап або нотатка"
            className="h-full w-full bg-transparent px-3.5 text-[14px] outline-none"
            style={{ fontFamily: T.sans, color: T.text }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <button
            onClick={() => setMore((s) => !s)}
            className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200"
            style={{
              fontFamily: T.sans,
              color: more ? T.text : T.text2,
              background: more ? act(0.15) : T.surface,
              border: `1px solid ${more ? act(0.45) : T.line}`,
            }}
          >
            {more ? 'Менше' : 'Деталі'}
            <ChevronDown size={14} strokeWidth={2.4} style={{ transform: more ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>

          <button
            onClick={submit}
            disabled={saving}
            className="flex h-[42px] items-center gap-2.5 whitespace-nowrap rounded-xl px-[22px] text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
            style={{
              fontFamily: T.sans,
              color: '#ffffff',
              background: actGradient,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 28px -12px ${act(0.9)}`,
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = actGradientHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = actGradient; }}
          >
            {saving
              ? <Loader2 size={15} strokeWidth={3} className="animate-spin" />
              : <Check size={15} strokeWidth={3} />}
            Записати
          </button>
        </div>
      </div>

      {/* Розкриття через grid-template-rows 0fr → 1fr.

          Анімувати height:auto не вийшло: framer міряє висоту до того,
          як поле дати домалюється, і рядок лишався підрізаним. Тут
          нічого міряти не треба — браузер сам інтерполює частку рядка,
          тому картка росте рівно під свій вміст, яким би він не був.

          Блок завжди в розмітці (а не через AnimatePresence), інакше
          в момент появи нема від чого анімувати. Згорнутий він не
          клікається і не ловить фокус з клавіатури. */}
      <div
        className="grid"
        aria-hidden={!more}
        style={{
          gridTemplateRows: more ? '1fr' : '0fr',
          opacity: more ? 1 : 0,
          pointerEvents: more ? 'auto' : 'none',
          transition: 'grid-template-rows .34s cubic-bezier(0.22,1,0.36,1), opacity .26s ease',
        }}
      >
        <div className="overflow-hidden">
            <div className="mt-3 flex flex-wrap items-center gap-3 pt-4" style={{ borderTop: `1px solid ${T.line}` }}>
              <div className="flex items-center gap-2.5">
                <FieldLabel>Якість</FieldLabel>
                <Seg id="qual" options={QUALITIES} value={q.quality} onChange={(v) => set({ quality: v })} />
              </div>

              <div className="flex items-center gap-2.5">
                <FieldLabel>Сесія</FieldLabel>
                <Seg id="sess" options={SESSIONS} value={q.session} onChange={(v) => set({ session: v })} />
              </div>

              {/* Дата — тим самим полем, що й у розборах: наш календар,
                  а не системний. Нативний <input type="date"> малює
                  попап засобами ОС — світлий, чужими шрифтами, поверх
                  темного вікна. Одразу сітка днів, без проміжного
                  меню: у бектесті дату гортають по історії, і
                  «сьогодні / вчора» там ні до чого. */}
              <div className="w-[186px] shrink-0">
                <DateField
                  value={q.date}
                  onChange={(v) => set({ date: v })}
                  height={42}
                  fontSize={13.5}
                  fontWeight={500}
                  alwaysNumeric
                  accent={ACT.tint}
                  accentRgb={ACT.rgb}
                  accentBorder={act(0.45)}
                />
              </div>

              <button
                onClick={() => onOpenDetails(payload(q))}
                className="ml-auto flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[13.5px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
              >
                <SlidersHorizontal size={14} strokeWidth={2.2} />
                Повна форма
              </button>
            </div>
        </div>
      </div>
    </motion.section>
  );
}
