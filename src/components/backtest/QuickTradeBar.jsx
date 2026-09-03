import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, SlidersHorizontal, Loader2, ChevronDown, Plus } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, resultLabel } from '../../lib/backtestStats';
import { ACT, act, actGradient, actGradientHover, segFill, SEG_TONE } from './accent';
import AssetPicker from './AssetPicker';
import { allSetups, customSetups, addCustomSetup } from '../../lib/backtestSetups';
import DateField from '../ui/DateField';

/* ==================================================================
   Швидкий рядок.
   Бектест — це сотні угод, і кожну відкривати модалкою неможливо.
   У видимому рядку те, що впливає на статистику завжди: актив,
   напрям, результат, RR і сетап. Сесія й дата ховаються під
   «Деталі» — їх міняють раз на десяток угод.
   Enter у полі RR або сетапу записує угоду.
================================================================== */

/* Та сама пружина, що в картці угоди: вибір усюди їде однаково */
const SEG_SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 };

function Seg({ options, value, onChange, id, labelOf }) {
  return (
    <div className="flex items-center gap-[5px] rounded-xl p-[5px]" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className="relative flex h-8 items-center justify-center whitespace-nowrap rounded-[9px] px-[15px] text-[11.5px] font-bold tracking-[0.06em]"
            style={{ fontFamily: T.mono, color: on ? '#ffffff' : T.text2, transition: 'color .25s ease', zIndex: 1 }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
          >
            {on && (
              <motion.span
                layoutId={`qseg-${id}`}
                transition={SEG_SPRING}
                className="absolute inset-0 rounded-[9px]"
                style={{
                  /* Та сама палітра, що в картці угоди: сесії й напрям
                     упізнаються кольором, решта — акцентом розділу */
                  background: segFill(SEG_TONE[o] || ACT.rgb),
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                  zIndex: -1,
                }}
              />
            )}
            {labelOf ? labelOf(o) : o}
          </button>
        );
      })}
    </div>
  );
}

/* Підписи в рядку дрібні й моноширинні — на T.text3 вони зливались
   із карткою. Тримаємо на тон світліше. */
const FieldLabel = ({ children }) => (
  <span className="text-[11.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.mono, color: T.text2 }}>
    {children}
  </span>
);

export default function QuickTradeBar({
  onQuickAdd, onOpenDetails, saving,
  defaultSession = 'London', sessionPair = '', usedPairs = [], usedTags = [],
}) {
  const [more, setMore] = useState(false);
  /* Свої сетапи заводяться тут: угоду записують саме звідси, і
     примушувати відкривати повну форму заради нової назви — зайвий
     крок у найчастішій дії. */
  const [mine, setMine] = useState(customSetups);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupBox = useRef(null);
  const [q, setQ] = useState({
    type: 'LONG',
    result: 'WIN',
    rr: '2',
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

  useEffect(() => {
    if (!setupOpen) return undefined;
    const away = (e) => { if (setupBox.current && !setupBox.current.contains(e.target)) setSetupOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [setupOpen]);

  /* Підказки: вбудовані сетапи, свої, і ті, що вже зустрічались у
     цьому бектесті. Порожнє поле показує весь список. */
  const setups = allSetups({ custom: mine, used: usedTags });
  const query = q.setup.trim().toLowerCase();
  const matches = query ? setups.filter((x) => x.toLowerCase().includes(query)) : setups;
  const canAddSetup = query !== '' && !setups.some((x) => x.toLowerCase() === query);

  const pickSetup = (name) => { set({ setup: name }); setSetupOpen(false); };
  const addSetup = () => {
    const v = q.setup.trim();
    if (!v) return;
    setMine(addCustomSetup(v));
    setSetupOpen(false);
  };

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
    const v = q.setup.trim();
    /* Записаний сетап одразу стає підказкою — навіть якщо його не
       додавали через список окремо. */
    if (v && !setups.some((x) => x.toLowerCase() === v.toLowerCase())) setMine(addCustomSetup(v));
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
        <AssetPicker
          value={q.pair}
          onChange={(v) => set({ pair: v })}
          height={42}
          placeholder="актив"
          className="w-[172px] shrink-0"
          priority={[sessionPair, ...usedPairs].filter(Boolean)}
          noteOf={(p) => (p === sessionPair ? 'бектест' : null)}
        />

        <Seg id="dir" options={['LONG', 'SHORT']} value={q.type} onChange={(v) => set({ type: v })} />
        <Seg id="res" options={['WIN', 'LOSS', 'BE']} value={q.result} onChange={(v) => set({ result: v })} labelOf={resultLabel} />

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
          ref={setupBox}
          className="relative flex h-[42px] min-w-[150px] flex-1 items-center rounded-xl"
          style={{
            background: T.sunken,
            border: `1px solid ${setupOpen ? ACT.to : T.line}`,
            boxShadow: setupOpen ? `0 0 0 3px ${act(0.13)}` : 'none',
            transition: 'border-color .18s, box-shadow .18s',
          }}
        >
          <input
            value={q.setup}
            onChange={(e) => { set({ setup: e.target.value }); setSetupOpen(true); }}
            onFocus={() => setSetupOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setSetupOpen(false); submit(); }
              if (e.key === 'Escape') { e.stopPropagation(); setSetupOpen(false); }
            }}
            placeholder="Сетап або нотатка"
            className="h-full w-full bg-transparent px-3.5 text-[14px] outline-none placeholder:text-[var(--edge-text3,#7A7A85)]"
            style={{ fontFamily: T.sans, color: T.text }}
          />

          {/* Список того, що вже є: без нього в базі осідали «SFP» і
              «sfp» як два різні сетапи. */}
          <AnimatePresence>
            {setupOpen && (matches.length > 0 || canAddSetup) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: EASE }}
                className="absolute left-0 top-[calc(100%+8px)] z-40 w-[340px] max-w-[86vw] overflow-hidden rounded-[12px]"
                style={{
                  background: T.surfaceHi,
                  border: `1px solid ${T.lineHi}`,
                  boxShadow: '0 24px 56px -20px rgba(0,0,0,0.9)',
                }}
              >
                {matches.length > 0 && (
                  /* Дві колонки, коли сетапів більше за чотири: інакше
                     список тягнеться вниз через півсторінки. */
                  <div className={`custom-scrollbar max-h-[200px] overflow-y-auto p-1.5 ${matches.length > 4 ? 'grid grid-cols-2 gap-1' : 'flex flex-col'}`}>
                    {matches.map((tag) => {
                      const on = q.setup.trim().toLowerCase() === tag.toLowerCase();
                      return (
                        <button
                          key={tag}
                          onMouseDown={(e) => { e.preventDefault(); pickSetup(tag); }}
                          className="flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors"
                          style={{ fontFamily: T.sans, color: on ? ACT.tint : T.text2, background: on ? act(0.14) : 'transparent' }}
                          onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surface; }}
                          onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <span className="truncate">{tag}</span>
                          {on && <Check size={12} strokeWidth={3} className="ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {canAddSetup && (
                  <button
                    onMouseDown={(e) => { e.preventDefault(); addSetup(); }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-semibold transition-colors"
                    style={{
                      fontFamily: T.sans,
                      color: ACT.tint,
                      borderTop: matches.length > 0 ? `1px solid ${T.line}` : undefined,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = act(0.1); }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Plus size={13} strokeWidth={3} />
                    Додати «{q.setup.trim()}»
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
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
