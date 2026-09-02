import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Trash2, ImagePlus, Loader2, CalendarDays, Plus, Pencil, TrendingUp, TrendingDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { SESSIONS, metaOf, pairOf, resultLabel, shotsOf } from '../../lib/backtestStats';
import { ACT, act, actGradient, actGradientHover, segFill as fill, SEG_TONE } from './accent';
import DateField from '../ui/DateField';
import ImageSlider from '../ui/ImageSlider';
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

/* Пружина під пальці: плавний хід без пружинення в кінці. Та сама
   в усіх перемикачах розділу, щоб вибір усюди відчувався однаково. */
const SEG_SPRING = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 };

function Label({ children, hint, right }) {
  return (
    <div className="flex items-baseline justify-between gap-2.5">
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          /* Підписи були 9.5px моноширинним із широким розрядженням —
             формально є, а прочитати треба примружитись. Побільшали й
             стиснули розрядження: більший кегль сам дає повітря. */
          className="text-[11.5px] font-bold uppercase tracking-[0.13em]"
          style={{ fontFamily: T.mono, color: T.text2 }}
        >
          {children}
        </span>
        {hint && <span className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{hint}</span>}
      </div>
      {right}
    </div>
  );
}

/* Заливка не перемальовується, а переїжджає: градієнт неможливо
   анімувати через CSS, тому активний стан — окремий шар із layoutId,
   який framer переносить пружиною з попередньої кнопки на нову. */
function Seg({ id, options, value, onChange, labelOf, readOnly, grow = true }) {
  return (
    <div
      className={`mt-[9px] flex items-center gap-[5px] rounded-xl p-[5px] ${grow ? 'w-full' : 'w-fit'}`}
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
            className={`relative flex h-[34px] items-center justify-center whitespace-nowrap rounded-[9px] text-[12px] font-bold tracking-[0.07em] ${grow ? 'flex-1 px-2.5' : 'px-5'}`}
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
    /* Скрінів може бути кілька. У колонці бази лишається перший —
       щоб таблиця й старі читачі бачили те саме, що й раніше, — а
       весь список живе в tda_data. */
    shots: shotsOf(initial),
  });
  /* Клік по угоді відкриває її на перегляд, а не на редагування:
     випадкове торкання поля в списку з сотні записів не має мовчки
     міняти статистику. Нова угода, навпаки, одразу редагується —
     її для того й відкрили. */
  const [editing, setEditing] = useState(!initial?.id);
  const [focus, setFocus] = useState(null);
  const [drop, setDrop] = useState(false);
  const [mine, setMine] = useState(customSetups);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const contentBox = useContentBox();
  /* Публічна сторінка не редагується взагалі, власна — поки не
     натиснули «Редагувати». Далі по формі дивимось саме на locked. */
  const locked = readOnly || !editing;
  const fileRef = useRef(null);
  const set = (p) => setF((s) => ({ ...s, ...p }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const addShot = (src) => { if (src) setF((s) => ({ ...s, shots: [...s.shots, src] })); };
  const dropShot = (i) => setF((s) => ({ ...s, shots: s.shots.filter((_, idx) => idx !== i) }));

  const readFiles = (files) => {
    Array.from(files || [])
      .filter((file) => file && file.type?.startsWith('image/'))
      .forEach((file) => {
        const r = new FileReader();
        r.onload = () => addShot(r.result);
        r.readAsDataURL(file);
      });
  };

  const onPaste = (e) => {
    if (locked) return;
    const text = e.clipboardData?.getData('text');
    if (text && /^https?:\/\//.test(text.trim())) { addShot(text.trim()); e.preventDefault(); return; }
    const items = Array.from(e.clipboardData?.items || []).filter((i) => i.type.indexOf('image') !== -1);
    if (items.length) {
      e.preventDefault();
      readFiles(items.map((i) => i.getAsFile()));
    }
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

  /* Те, що поїде в базу. Порівнюємо саме цю форму, а не стан: у полі
     RR лежить рядок («2», «2,0»), і без нормалізації однакові значення
     виглядали б різними. */
  const payloadOf = (state) => {
    const rr = Number(String(state.rr).replace(',', '.'));
    return {
      ...state,
      rr: state.result === 'BE' ? 0 : state.result === 'LOSS' ? 1 : Number.isFinite(rr) ? Math.abs(rr) : 0,
    };
  };

  /* Знімок на момент входу в редагування. Якщо людина натиснула
     «Редагувати», нічого не змінила й тиснула «Зберегти» — писати в
     базу нема чого: зайвий запит, зайвий перерахунок статистики і
     зайва мітка «оновлено» на угоді, якої ніхто не чіпав. */
  const baseline = useRef(JSON.stringify(payloadOf(f)));

  useEffect(() => {
    if (editing) baseline.current = JSON.stringify(payloadOf(f));
    /* Знімаємо рівно при вході в режим, тому в залежностях лише він */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [editing]);

  const submit = () => {
    const next = payloadOf(f);
    /* Нова угода зберігається завжди — навіть незмінені значення за
       замовчуванням це осмислений запис. */
    if (f.id && JSON.stringify(next) === baseline.current) {
      onClose();
      return;
    }
    onSave(next);
  };

  const short = f.type === 'SHORT';
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
        className="relative w-full max-w-[940px] overflow-hidden rounded-[26px]"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 44px 100px -34px rgba(0,0,0,0.95)' }}
      >
        {/* ─────────── Шапка ─────────── */}
        <div
          className="flex items-center justify-between gap-5 px-6 py-5"
          style={{ borderBottom: `1px solid ${T.line}` }}
        >
          <div className="flex min-w-0 items-center gap-3.5">
            {/* ---------- напрям угоди ----------

                Стрічка, а не підміна картинки: стрілки стоять одна за
                одною на відстані рівно у висоту плитки, і при
                перемиканні вся стрічка проїжджає на один крок. Для
                SHORT графік іде згори вниз, для LONG — знизу вгору, і
                в кадрі завжди рівно одна стрілка.

                Колір переливається окремим шаром: градієнт CSS
                анімувати не вміє, тому червоний проявляється поверх
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
                     з-за краю і виходить точно за край. */
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
              {/* Пігулки результату немає: він стоїть перемикачем за
                  пару сантиметрів нижче й дублювати його нема сенсу. */}
              <div className="text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                {f.id ? 'Угода' : 'Нова угода'}
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

        {/* ─────────── Графік і запис ─────────── */}
        <div className="flex flex-col gap-5 px-6 pb-5 pt-[22px]" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div>
              <Label
                hint={locked ? null : 'Ctrl+V, файл або посилання'}
                right={f.shots.length > 1 ? (
                  <span className="shrink-0 text-[11px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {f.shots.length}
                  </span>
                ) : null}
              >
                Графік
              </Label>

              {f.shots.length > 0 ? (
                /* Той самий слайдер, що в журналі: стрілки, лупа на
                   наведенні й фулскрін по кліку. Заводити для бектесту
                   власний перегляд не було сенсу — рівні на графіку
                   читають однаково в обох місцях. */
                <div className="mt-[11px] overflow-hidden rounded-2xl" style={{ border: `1px solid ${T.line}` }}>
                  <ImageSlider images={f.shots} containerClassName="h-[288px] w-full" />

                  {!locked && (
                    <div
                      className="flex flex-wrap items-center gap-2 p-2.5"
                      style={{ background: T.bg, borderTop: `1px solid ${T.line}` }}
                    >
                      {f.shots.map((src, i) => (
                        <div
                          key={`${src.slice(0, 24)}-${i}`}
                          className="group/shot relative h-10 w-10 shrink-0 overflow-hidden rounded-lg"
                          style={{ border: `1px solid ${T.line}` }}
                        >
                          <img src={src} alt="" className="h-full w-full object-cover" />
                          <button
                            onClick={() => dropShot(i)}
                            title="Прибрати скрін"
                            className="absolute inset-0 hidden place-items-center transition-colors group-hover/shot:grid"
                            style={{ background: 'rgba(10,10,12,0.7)', color: '#fff' }}
                          >
                            <X size={12} strokeWidth={2.8} />
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={() => fileRef.current?.click()}
                        title="Додати ще скрін"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors"
                        style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = ACT.tint; e.currentTarget.style.borderColor = act(0.5); e.currentTarget.style.background = act(0.07); }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = 'transparent'; }}
                      >
                        <ImagePlus size={15} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
              ) : locked ? (
                <div
                  className="mt-3 grid h-[288px] w-full place-items-center rounded-2xl text-[13px]"
                  style={{ background: T.bg, border: `1px solid ${T.line}`, fontFamily: T.sans, color: T.text3 }}
                >
                  Скрінів немає
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrop(true); }}
                  onDragLeave={() => setDrop(false)}
                  onDrop={(e) => { e.preventDefault(); setDrop(false); readFiles(e.dataTransfer.files); }}
                  onMouseEnter={() => setDrop(true)}
                  onMouseLeave={() => setDrop(false)}
                  className="mt-3 flex h-[288px] w-full flex-col items-center justify-center rounded-2xl px-5 text-center transition-all duration-200"
                  style={{
                    background: drop ? act(0.08) : T.bg,
                    border: `1.5px dashed ${drop ? act(0.66) : T.lineHi}`,
                  }}
                >
                  <span
                    className="grid h-[54px] w-[54px] place-items-center rounded-2xl"
                    style={{ background: act(0.14), border: `1px solid ${act(0.28)}` }}
                  >
                    <ImagePlus size={25} strokeWidth={1.7} style={{ color: ACT.tint }} />
                  </span>
                  <span className="mt-3.5 text-[15.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                    Встав скрін графіка
                  </span>
                  <span className="mt-[7px] text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    PNG, JPG або посилання TradingView
                  </span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => { readFiles(e.target.files); e.target.value = ''; }}
              />
            </div>

            <div>
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
                className="mt-[11px] flex h-[80px] overflow-hidden rounded-[14px]"
                /* У перегляді поле не має вигляду поля: ні акцентної
                   рамки на фокусі, ні натяку, що сюди можна писати. */
                style={locked
                  ? { background: T.sunken, border: `1px solid ${T.line}` }
                  : fieldStyle(focus === 'n')}
              >
                <textarea
                  value={f.notes}
                  readOnly={locked}
                  placeholder={locked ? 'Записів до угоди немає.' : undefined}
                  onChange={(e) => set({ notes: e.target.value })}
                  onFocus={() => setFocus('n')}
                  onBlur={() => setFocus(null)}
                  {...(locked ? {} : { placeholder: 'Що бачив, чому зайшов, що зробив би інакше.' })}
                  className="h-full w-full resize-none border-none bg-transparent px-4 py-3 outline-none"
                  style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.55, color: locked ? T.text2 : T.text, cursor: locked ? 'default' : 'text' }}
                />
              </div>
            </div>
        </div>

        {/* ─────────── Цифри ─────────── */}
        <div className="flex flex-col gap-[18px] px-6 pb-6 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Напрям</Label>
                {locked ? (
                  <StaticField height={44}>
                    <span className="text-[13px] font-bold tracking-[0.07em]" style={{ fontFamily: T.mono, color: T.text }}>
                      {f.type}
                    </span>
                  </StaticField>
                ) : (
                  <Seg id="type" options={['LONG', 'SHORT']} value={f.type} onChange={(v) => set({ type: v })} />
                )}
              </div>
              <div>
                <Label>Результат</Label>
                {locked ? (
                  <StaticField height={44}>
                    <span className="text-[13px] font-bold tracking-[0.07em]" style={{ fontFamily: T.mono, color: T.text }}>
                      {resultLabel(f.result)}
                    </span>
                  </StaticField>
                ) : (
                  <Seg id="result" options={['WIN', 'LOSS', 'BE']} value={f.result} onChange={(v) => set({ result: v })} labelOf={resultLabel} />
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1.1fr_1fr_1.15fr]">
              <div className="min-w-0">
                <Label>Актив</Label>
                {locked ? (
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
                    disabled={locked || f.result !== 'WIN'}
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
                {locked ? (
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
              {/* Три коротких слова не тягнемо на всю ширину: розтягнута
                  смуга читається як помилка верстки. */}
              {locked ? (
                <div className="w-fit">
                  <StaticField height={44}>
                    <span className="text-[13px] font-bold tracking-[0.07em]" style={{ fontFamily: T.mono, color: T.text }}>
                      {f.session}
                    </span>
                  </StaticField>
                </div>
              ) : (
                <Seg id="session" options={SESSIONS} value={f.session} onChange={(v) => set({ session: v })} grow={false} />
              )}
            </div>

            <div>
              <Label
                right={f.tags.length ? (
                  <span className="shrink-0 text-[11px] font-bold" style={{ fontFamily: T.mono, color: locked ? T.text3 : ACT.tint }}>
                    {f.tags.length} обрано
                  </span>
                ) : null}
              >
                Сетап
              </Label>
              <div className="mt-[11px] flex flex-wrap gap-[7px]">
                {locked && f.tags.length === 0 && (
                  <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>Сетап не вказано</span>
                )}
                {(locked ? f.tags : setups).map((tag) => {
                  const on = f.tags.includes(tag);
                  const own = mine.includes(tag);
                  return (
                    <motion.button
                      key={tag}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.7 }}
                      onClick={locked ? undefined : () => toggleTag(tag)}
                      disabled={locked}
                      className="group/tag relative flex h-[34px] items-center whitespace-nowrap rounded-[10px] pl-3.5 text-[13px] font-semibold transition-colors duration-200"
                      style={{
                        fontFamily: T.sans,
                        /* Свої лишають місце під хрестик, щоб плашка
                           не смикалась на наведенні */
                        paddingRight: own && !locked ? 26 : 14,
                        cursor: locked ? 'default' : 'pointer',
                        color: locked ? T.text2 : (on ? T.text : T.text2),
                        background: locked ? T.sunken : (on ? act(0.18) : T.surfaceHi),
                        border: `1px solid ${locked ? T.line : (on ? act(0.5) : T.line)}`,
                      }}
                      onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                      onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; } }}
                    >
                      {tag}
                      {own && !locked && (
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

                {locked ? null : adding ? (
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

        {/* ─────────── Дії ─────────── */}
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-6 pb-[22px] pt-[18px]"
          style={{ borderTop: `1px solid ${T.line}` }}
        >
          {/* Порожній підвал краще за напис «нічого не обрано»: коли
              сетапів немає, нема про що й повідомляти. */}
          <span className="min-w-0 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {f.tags.join(' · ')}
          </span>

          <div className="ml-auto flex items-center gap-2.5">
            {locked ? (
              <>
                <button
                  onClick={onClose}
                  className="flex h-11 items-center rounded-xl px-[22px] text-[14.5px] font-semibold transition-all duration-200"
                  style={{ fontFamily: T.sans, color: T.text2, background: 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
                >
                  Закрити
                </button>

                {/* Редагування — окрема дія, а не режим за замовчуванням */}
                {!readOnly && (
                  <button
                    onClick={() => setEditing(true)}
                    className="flex h-11 items-center gap-2.5 whitespace-nowrap rounded-xl px-6 text-[14.5px] font-semibold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
                    style={{
                      fontFamily: T.sans, color: '#fff',
                      background: actGradient,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 12px 30px -12px ${act(0.9)}`,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = actGradientHover; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = actGradient; }}
                  >
                    <Pencil size={15} strokeWidth={2.4} />
                    Редагувати
                  </button>
                )}
              </>
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
