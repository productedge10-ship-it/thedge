import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Trash2, ImagePlus, Loader2, TrendingUp, TrendingDown, CalendarDays, Plus } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, metaOf, pairOf, resultLabel } from '../../lib/backtestStats';
import { ACT, act, actGradient, actGradientHover, segFill as fill, SEG_TONE } from './accent';
import DateField from '../ui/DateField';
import { allSetups, customSetups, addCustomSetup, removeCustomSetup } from '../../lib/backtestSetups';
import AssetPicker from './AssetPicker';
import AssetIcon from '../ui/AssetIcon';

/* ==================================================================
   Деталі угоди бектесту.
   Дві колонки: зліва все, що впливає на статистику, справа — те, що
   пишеться довільно (скрін і запис). Так форма читається за один
   погляд і не перетворюється на анкету з двадцяти полів.
================================================================== */

/* Тип активу — підказка в списку, щоб не вчитуватись у тікер */
const KIND = {
  NAS100: 'Індекси', US30: 'Індекси', GER40: 'Індекси',
  XAUUSD: 'Метали',
  BTCUSD: 'Крипто', ETHUSD: 'Крипто',
  EURUSD: 'Forex', GBPUSD: 'Forex', USDJPY: 'Forex',
};

const resTone = (r) => (r === 'WIN' ? T.okRgb : r === 'LOSS' ? T.badRgb : ACT.rgb);

/* Пружина під пальці: плавний хід без пружинення в кінці. Та сама
   в усіх перемикачах розділу, щоб вибір усюди відчувався однаково. */
const SEG_SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 };

function Label({ children, hint, right }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className="text-[9.5px] font-bold uppercase tracking-[0.19em]"
          style={{ fontFamily: T.mono, color: T.text3 }}
        >
          {children}
        </span>
        {hint && <span className="truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>{hint}</span>}
      </div>
      {right}
    </div>
  );
}

/* Заливка не перемальовується, а переїжджає: градієнт неможливо
   анімувати через CSS, тому активний стан — окремий шар із layoutId,
   який framer переносить пружиною з попередньої кнопки на нову. */
function Seg({ id, options, value, onChange, labelOf, readOnly }) {
  return (
    <div
      className="mt-[9px] flex w-full items-center gap-[5px] rounded-xl p-[5px]"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {options.map((o) => {
        const on = value === o;
        const rgb = SEG_TONE[o] || ACT.rgb;
        return (
          <button
            key={o}
            onClick={readOnly ? undefined : () => onChange(o)}
            disabled={readOnly}
            className="relative flex h-[34px] flex-1 items-center justify-center whitespace-nowrap rounded-[9px] px-2.5 text-[12px] font-bold tracking-[0.07em]"
            style={{
              fontFamily: T.mono,
              color: on ? '#fff' : T.text3,
              transition: 'color .25s ease',
              cursor: readOnly ? 'default' : 'pointer',
              zIndex: 1,
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={SEG_SPRING}
                className="absolute inset-0 rounded-[9px]"
                style={{
                  background: fill(rgb),
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

/* Нерухоме поле: та сама геометрія, що в редагованого, але без
   керування. У режимі перегляду важливо, щоб картка виглядала так
   само, — інакше публічна сторінка читається як інша форма. */
function StaticField({ children, height = 46 }) {
  return (
    <div
      className="mt-[9px] flex items-center gap-2.5 overflow-hidden rounded-xl px-3.5"
      style={{ height, background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {children}
    </div>
  );
}

/* Рамка поля: спокійна в спокої, акцентна з ореолом у фокусі */
const fieldStyle = (focused) => ({
  background: T.sunken,
  border: `1px solid ${focused ? ACT.to : T.line}`,
  boxShadow: focused ? `0 0 0 3px ${act(0.13)}` : 'none',
  transition: 'border-color .18s, box-shadow .18s',
});

/* ==================================================================
   Модалка центрується не по вікну, а по робочій області.

   Сайдбар непрозорий і займає ліві ~300px. Вікно, відцентроване по
   viewport, математично стоїть посередині, але виглядає зсунутим
   уліво: половину його «половини» зʼїдає меню. Тому міряємо <main>
   і накриваємо саме його.

   ResizeObserver, а не одноразовий вимір: сайдбар згортається, і
   робоча область при цьому міняє ширину під уже відкритою модалкою.
   Якщо <main> немає (публічна сторінка) — лишається весь екран.
================================================================== */
function useContentBox() {
  const [box, setBox] = useState(null);

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return undefined;

    const measure = () => {
      const r = main.getBoundingClientRect();
      setBox({ left: r.left, width: r.width });
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  return box;
}

function IconBtn({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="grid h-[38px] w-[38px] place-items-center rounded-[11px] transition-all duration-200 active:scale-95"
      style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? `rgba(${T.badRgb},0.12)` : T.surfaceHi;
        e.currentTarget.style.borderColor = danger ? `rgba(${T.badRgb},0.4)` : T.lineHi;
        e.currentTarget.style.color = danger ? T.bad : T.text;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.surface;
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.color = T.text2;
      }}
    >
      <Icon size={16} strokeWidth={2.1} />
    </button>
  );
}

export default function TradeSheet({
  initial, pair, saving, onClose, onSave, onDelete, knownTags = [],
  /* Публічна сторінка показує ту саму картку, але дивитись її може
     будь-хто за посиланням — тому там усе тільки для читання. */
  readOnly = false,
}) {
  const meta = metaOf(initial);
  const [f, setF] = useState({
    id: initial?.id || null,
    date: initial?.date || new Date().toISOString().slice(0, 10),
    pair: pairOf(initial, pair) || pair || '',
    type: initial?.type || 'LONG',
    result: initial?.result || 'WIN',
    rr: initial?.rr != null ? String(Math.abs(initial.rr)) : '2',
    /* Оцінку угоди більше не виставляють, але у старих записах вона
       є — тягнемо як було, щоб редагування її не стирало. */
    quality: meta.quality || null,
    session: meta.session || 'London',
    tags: meta.tags || [],
    notes: initial?.notes || '',
    screenshot_url: initial?.screenshot_url || null,
  });
  const [focus, setFocus] = useState(null);
  const [drop, setDrop] = useState(false);
  const [mine, setMine] = useState(customSetups);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const contentBox = useContentBox();
  const fileRef = useRef(null);
  const set = (p) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const readFile = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const r = new FileReader();
    r.onload = () => set({ screenshot_url: r.result });
    r.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text');
    if (text && /^https?:\/\//.test(text.trim())) { set({ screenshot_url: text.trim() }); e.preventDefault(); return; }
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.indexOf('image') !== -1);
    if (item) { e.preventDefault(); readFile(item.getAsFile()); }
  };

  const toggleTag = (tag) =>
    set({ tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag] });

  /* Список сетапів: вбудовані, свої (їх заводять у швидкому рядку),
     і ті, що вже зустрічались у цьому бектесті. Обрані в поточній
     угоді теж, інакше сетап зі старого запису зник би з форми при
     редагуванні. */
  const setups = allSetups({ custom: mine, used: [...knownTags, ...f.tags] });

  /* Додавання без підказок: список сетапів і так лежить плашками
     вище, тому дублювати його випадайкою нема сенсу — тут просто
     вписують назву, якої в ряду ще немає. */
  const commitSetup = () => {
    const v = draft.trim();
    if (!v) { setAdding(false); setDraft(''); return; }
    const known = setups.find((x) => x.toLowerCase() === v.toLowerCase());
    if (known) {
      if (!f.tags.includes(known)) toggleTag(known);
    } else {
      setMine(addCustomSetup(v));
      set({ tags: [...f.tags, v] });
    }
    setDraft('');
    setAdding(false);
  };

  /* Прибрати свій сетап зі списку — виправити описку інакше нічим */
  const forgetSetup = (e, tag) => {
    e.stopPropagation();
    setMine(removeCustomSetup(tag));
    set({ tags: f.tags.filter((x) => x !== tag) });
  };

  const submit = () => {
    const rr = Number(String(f.rr).replace(',', '.'));
    onSave({
      ...f,
      rr: f.result === 'BE' ? 0 : f.result === 'LOSS' ? 1 : Number.isFinite(rr) ? Math.abs(rr) : 0,
    });
  };

  const short = f.type === 'SHORT';
  const tone = resTone(f.result);
  const dateLabel = (() => {
    const d = String(f.date).split('-');
    return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : f.date;
  })();

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-y-0 z-[220] overflow-y-auto"
      style={{
        left: contentBox ? contentBox.left : 0,
        width: contentBox ? contentBox.width : '100%',
        background: 'rgba(6,6,8,0.86)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Обгортка на всю висоту: тільки так вікно стоїть рівно по
          центру екрана, але прокручується, коли не влазить */}
      <div className="flex min-h-full items-center justify-center p-3 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
        className="relative w-full max-w-[1140px] overflow-hidden rounded-[26px]"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 44px 100px -34px rgba(0,0,0,0.95)' }}
      >
        {/* Волосяна лінія згори — єдине, що видає колір розділу до того,
            як людина щось натисне */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${act(0.8)}, transparent)` }}
        />

        {/* ─────────── Шапка ─────────── */}
        <div
          className="flex items-center justify-between gap-5 px-6 py-5"
          style={{ borderBottom: `1px solid ${T.line}` }}
        >
          <div className="flex min-w-0 items-center gap-3.5">
            {/* ---------- напрям угоди ----------

                Стрічка, а не підміна картинки: стрілки стоять одна за
                одною на відстані рівно у висоту плитки, і при
                перемиканні вся стрічка проїжджає на один крок. Тому
                для SHORT графік іде згори вниз, для LONG — знизу
                вгору, і в кадрі завжди рівно одна стрілка.

                Ніяких пружин і поштовхів: рух рівний від початку до
                кінця, з мʼяким входом і виходом. Колір при цьому
                переливається окремим шаром — градієнт CSS анімувати
                не вміє, тому червоний просто проявляється поверх
                зеленого. */}
            <div
              className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px]"
              style={{
                background: fill(T.okRgb),
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 10px 22px -12px rgba(${short ? T.badRgb : T.okRgb},0.9)`,
                transition: 'box-shadow .5s ease',
              }}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0"
                style={{ background: fill(T.badRgb) }}
                animate={{ opacity: short ? 1 : 0 }}
                transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
              />

              <AnimatePresence initial={false}>
                <motion.span
                  key={f.type}
                  className="absolute inset-0 grid place-items-center"
                  /* 44px — рівно висота плитки: стрілка заходить точно
                     з-за краю і виходить точно за край, без «стрибка»
                     всередині кадру. */
                  initial={{ y: short ? -44 : 44 }}
                  animate={{ y: 0 }}
                  exit={{ y: short ? 44 : -44 }}
                  transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
                >
                  {short
                    ? <TrendingDown size={21} strokeWidth={2.2} style={{ color: '#fff' }} />
                    : <TrendingUp size={21} strokeWidth={2.2} style={{ color: '#fff' }} />}
                </motion.span>
              </AnimatePresence>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                  {f.id ? 'Угода' : 'Нова угода'}
                </span>
                <span
                  className="rounded-[7px] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.1em]"
                  style={{
                    fontFamily: T.mono,
                    color: `rgb(${tone})`,
                    background: `rgba(${tone},0.12)`,
                    border: `1px solid rgba(${tone},0.3)`,
                  }}
                >
                  {resultLabel(f.result)}
                </span>
              </div>
              <div className="mt-[5px] truncate text-[12.5px]" style={{ fontFamily: T.mono, color: T.text3 }}>
                {f.pair || 'без активу'} · {f.session} · {dateLabel}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!readOnly && f.id && onDelete && <IconBtn icon={Trash2} label="Видалити" onClick={() => onDelete(f.id)} danger />}
            <IconBtn icon={X} label="Закрити (Esc)" onClick={onClose} />
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_460px]">
          {/* ─────────── Ліва колонка: цифри ─────────── */}
          <div className="flex flex-col gap-[18px] px-6 pb-6 pt-[22px] lg:border-r" style={{ borderColor: T.line }}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Напрям</Label>
                <Seg id="type" options={['LONG', 'SHORT']} value={f.type} onChange={(v) => set({ type: v })} readOnly={readOnly} />
              </div>
              <div>
                <Label>Результат</Label>
                <Seg id="result" options={['WIN', 'LOSS', 'BE']} value={f.result} onChange={(v) => set({ result: v })} labelOf={resultLabel} readOnly={readOnly} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_1.15fr]">
              <div className="min-w-0">
                <Label>Актив</Label>
                {readOnly ? (
                  <StaticField>
                    {f.pair && <AssetIcon symbol={f.pair} />}
                    <span className="truncate text-[14.5px] font-bold tracking-[0.05em]" style={{ fontFamily: T.mono, color: T.text }}>
                      {f.pair || '—'}
                    </span>
                  </StaticField>
                ) : (
                  <AssetPicker
                    value={f.pair}
                    onChange={(v) => set({ pair: v })}
                    className="mt-[9px]"
                    priority={pair ? [pair] : []}
                  />
                )}
              </div>

              <div className="min-w-0">
                <Label hint={f.result !== 'WIN' ? 'авто' : null}>R</Label>
                <div
                  className="mt-[9px] flex h-[46px] items-center overflow-hidden rounded-xl"
                  style={{ ...fieldStyle(focus === 'r'), opacity: f.result === 'WIN' ? 1 : 0.55 }}
                >
                  <input
                    value={f.result === 'WIN' ? f.rr : f.result === 'LOSS' ? '−1' : '0'}
                    disabled={readOnly || f.result !== 'WIN'}
                    onChange={(e) => set({ rr: e.target.value.replace(',', '.') })}
                    onFocus={() => setFocus('r')}
                    onBlur={() => setFocus(null)}
                    inputMode="decimal"
                    className="h-full w-full border-none bg-transparent px-3.5 text-[15.5px] font-bold tabular-nums outline-none"
                    style={{ fontFamily: T.mono, color: T.text }}
                  />
                </div>
              </div>

              <div className="min-w-0">
                <Label>Дата</Label>
                {/* Наш календар, а не системний: попап ОС світлий і
                    малюється чужим шрифтом поверх темної модалки */}
                {readOnly ? (
                  <StaticField>
                    <CalendarDays size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
                    <span className="text-[14px] tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                      {dateLabel}
                    </span>
                  </StaticField>
                ) : (
                  <div className="mt-[9px]">
                    <DateField
                      value={f.date}
                      onChange={(v) => set({ date: v })}
                      height={46}
                      fontSize={14}
                      fontWeight={500}
                      alwaysNumeric
                      accent={ACT.tint}
                      accentRgb={ACT.rgb}
                      accentBorder={act(0.45)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Сесія</Label>
              <Seg id="session" options={SESSIONS} value={f.session} onChange={(v) => set({ session: v })} readOnly={readOnly} />
            </div>

            <div>
              <Label
                hint={readOnly ? null : 'можна кілька'}
                right={f.tags.length ? (
                  <span className="shrink-0 text-[11px] font-bold" style={{ fontFamily: T.mono, color: ACT.tint }}>
                    {f.tags.length} обрано
                  </span>
                ) : null}
              >
                Сетап
              </Label>
              <div className="mt-[11px] flex flex-wrap gap-[7px]">
                {readOnly && f.tags.length === 0 && (
                  <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>Сетап не вказано</span>
                )}
                {(readOnly ? f.tags : setups).map((tag) => {
                  const on = f.tags.includes(tag);
                  const own = mine.includes(tag);
                  return (
                    <motion.button
                      key={tag}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }}
                      onClick={readOnly ? undefined : () => toggleTag(tag)}
                      disabled={readOnly}
                      className="group/tag relative flex h-[34px] items-center whitespace-nowrap rounded-[10px] pl-3.5 text-[13px] font-semibold transition-colors duration-200"
                      style={{
                        fontFamily: T.sans,
                        /* Свої лишають місце під хрестик, щоб плашка
                           не смикалась на наведенні */
                        paddingRight: own && !readOnly ? 26 : 14,
                        cursor: readOnly ? 'default' : 'pointer',
                        color: on ? T.text : T.text2,
                        background: on ? act(0.18) : T.surfaceHi,
                        border: `1px solid ${on ? act(0.5) : T.line}`,
                      }}
                      onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                      onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; } }}
                    >
                      {tag}
                      {own && !readOnly && (
                        <span
                          role="button"
                          tabIndex={-1}
                          title="Прибрати сетап зі списку"
                          onClick={(e) => forgetSetup(e, tag)}
                          className="absolute right-[7px] top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded opacity-0 transition-opacity duration-150 group-hover/tag:opacity-100"
                          style={{ color: T.text4 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
                        >
                          <X size={11} strokeWidth={3} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}

                {readOnly ? null : adding ? (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }}
                    className="flex h-[34px] items-center gap-1.5 rounded-[10px] pl-3 pr-1.5"
                    style={{ background: T.sunken, border: `1px solid ${ACT.to}`, boxShadow: `0 0 0 3px ${act(0.13)}` }}
                  >
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitSetup(); }
                        if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setDraft(''); }
                      }}
                      onBlur={commitSetup}
                      placeholder="Назва сетапу"
                      className="w-[140px] bg-transparent text-[13px] font-semibold outline-none"
                      style={{ fontFamily: T.sans, color: T.text }}
                    />
                    <span
                      role="button"
                      onMouseDown={(e) => { e.preventDefault(); commitSetup(); }}
                      className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md"
                      style={{ background: actGradient, color: '#fff' }}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                  </motion.div>
                ) : (
                  <motion.button
                    layout
                    onClick={() => setAdding(true)}
                    className="flex h-[34px] items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors duration-200"
                    style={{
                      fontFamily: T.sans,
                      color: T.text3,
                      background: 'transparent',
                      border: `1px dashed ${T.lineHi}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = ACT.tint; e.currentTarget.style.borderColor = act(0.5); e.currentTarget.style.background = act(0.07); }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Plus size={13} strokeWidth={2.8} />
                    Свій сетап
                  </motion.button>
                )}

              </div>
            </div>
          </div>

          {/* ─────────── Права колонка: скрін і запис ─────────── */}
          <div className="flex flex-col gap-[18px] px-6 pb-6 pt-[22px]" style={{ background: T.sunken }}>
            <div>
              <Label hint="Ctrl+V, файл або посилання">Графік</Label>

              {f.screenshot_url ? (
                <div
                  className="group relative mt-[11px] overflow-hidden rounded-2xl"
                  style={{ border: `1px solid ${T.line}` }}
                >
                  <img
                    src={f.screenshot_url}
                    alt=""
                    className="block max-h-[260px] w-full object-contain"
                    style={{ background: T.bg }}
                  />
                  {!readOnly && (
                  <button
                    onClick={() => set({ screenshot_url: null })}
                    title="Прибрати"
                    className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
                    style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, backdropFilter: 'blur(8px)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
                  >
                    <X size={14} strokeWidth={2.6} />
                  </button>
                  )}
                </div>
              ) : readOnly ? (
                <div
                  className="mt-[11px] grid h-[260px] w-full place-items-center rounded-2xl text-[13px]"
                  style={{ background: T.bg, border: `1px dashed ${T.line}`, fontFamily: T.sans, color: T.text4 }}
                >
                  Скріна немає
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
                  onDragLeave={() => setDrop(false)}
                  onDrop={(e) => { e.preventDefault(); setDrop(false); readFile(e.dataTransfer.files?.[0]); }}
                  onMouseEnter={() => setDrop(true)}
                  onMouseLeave={() => setDrop(false)}
                  className="mt-[11px] flex h-[260px] w-full flex-col items-center justify-center rounded-2xl px-5 text-center transition-all duration-200"
                  style={{
                    background: drop ? act(0.08) : T.bg,
                    border: `1.5px dashed ${drop ? act(0.66) : T.lineHi}`,
                  }}
                >
                  <span
                    className="grid h-[46px] w-[46px] place-items-center rounded-[14px]"
                    style={{ background: act(0.14), border: `1px solid ${act(0.28)}` }}
                  >
                    <ImagePlus size={21} strokeWidth={1.7} style={{ color: ACT.tint }} />
                  </span>
                  <span className="mt-3 text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                    Встав скрін графіка
                  </span>
                  <span className="mt-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    PNG, JPG або посилання TradingView
                  </span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => readFile(e.target.files?.[0])} />
            </div>

            <div className="flex flex-1 flex-col">
              <Label
                right={f.notes.length ? (
                  <span className="shrink-0 text-[11px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {f.notes.length}
                  </span>
                ) : null}
              >
                Запис
              </Label>
              <div
                className="mt-[11px] flex min-h-[132px] flex-1 overflow-hidden rounded-[14px]"
                style={fieldStyle(focus === 'n')}
              >
                <textarea
                  value={f.notes}
                  readOnly={readOnly}
                  placeholder={readOnly ? 'Записів до угоди немає.' : undefined}
                  onChange={(e) => set({ notes: e.target.value })}
                  onFocus={() => setFocus('n')}
                  onBlur={() => setFocus(null)}
                  {...(readOnly ? {} : { placeholder: 'Що бачив, чому зайшов, що зробив би інакше.' })}
                  className="h-full w-full resize-none border-none bg-transparent px-4 py-3.5 outline-none"
                  style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.55, color: T.text }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─────────── Дії ─────────── */}
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-6 pb-[22px] pt-[18px]"
          style={{ borderTop: `1px solid ${T.line}` }}
        >
          <span className="min-w-0 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {f.tags.length ? f.tags.join(' · ') : 'Сетап не обрано'}
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            {readOnly ? (
              <button
                onClick={onClose}
                className="flex h-11 items-center rounded-xl px-6 text-[14.5px] font-semibold transition-all duration-200"
                style={{ fontFamily: T.sans, color: T.text2, background: T.surfaceHi, border: `1px solid ${T.line}` }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
              >
                Закрити
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="flex h-11 items-center rounded-xl px-[22px] text-[14.5px] font-semibold transition-all duration-200"
                  style={{ fontFamily: T.sans, color: T.text2, background: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
                >
                  Скасувати
                </button>
                <button
                  onClick={submit}
                  disabled={saving}
                  className="flex h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-6 text-[14.5px] font-semibold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
                  style={{
                    fontFamily: T.sans, color: '#fff',
                    background: actGradient,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 30px -12px ${act(0.9)}`,
                    opacity: saving ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = actGradientHover; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = actGradient; }}
                >
                  {saving ? <Loader2 size={16} strokeWidth={3} className="animate-spin" /> : <Check size={16} strokeWidth={2.6} />}
                  {f.id ? 'Зберегти' : 'Додати угоду'}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
      </div>
    </motion.div>
  );
}
