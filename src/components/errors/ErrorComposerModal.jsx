import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Plus, Check, AlertTriangle, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { REASON_GROUPS, REASONS, reasonLabel } from './utils';
import { T } from '../../lib/theme';
import { useAuth } from '../../context/AuthContext';
import { uploadImage } from '../../lib/imageStore';
import { notify } from '../../utils/notify';
import AssetPickerModal from '../modals/AssetPickerModal';
import ImageSlider from '../ui/ImageSlider';

/* ==================================================================
   Композер помилки.

   Відкривається з чотирьох місць: сторінки помилок, форми запису
   угоди, картки угоди і пост-сесійної діагностики. Виглядати всюди
   має однаково — це та сама дія, а не чотири схожі. Тому вміст іде
   в портал на body: position fixed рахується від вікна тільки доти,
   доки жоден предок не має transform, а всі перелічені місця — це
   анімовані модалки, тобто transform там є завжди.

   Дві колонки. Ліворуч — те, що людина пише сама: пара, текст,
   скріни. Праворуч — те, що вона вибирає: причини, всі одразу на
   очах. Раніше причини ховались у випадашці, і вибір «чому це
   сталось» вимагав спершу здогадатись, що список взагалі є.

   Порядок теж має значення: спершу опис, потім причина. Щоб
   відповісти «чому», треба згадати «що» — коли текст уже написано,
   формулювання приходить саме.
================================================================== */

const Z = 2000;
const A = (a) => `rgba(${T.accRgb}, ${a})`;

/* Колір групи причин: він же колір обраних чіпів усередині неї —
   так у списку обраних видно, з якої області промах. */
const GROUP_COLOR = {
  Main: '#ff7b7b',
  Entry: '#4da3ff',
  'Management and exit': '#f0b13c',
  Risk: '#ff4d6d',
  Mindset: '#9d8cff',
  Preparation: '#3ddc97',
};

const GROUP_TITLE = {
  Main: 'Головне',
  Entry: 'Вхід',
  'Management and exit': 'Ведення і вихід',
  Risk: 'Ризик',
  Mindset: 'Стан',
  Preparation: 'Підготовка',
};

const PROMPTS = [
  { name: 'Що я побачив', text: 'Що я побачив: ' },
  { name: 'Чому зайшов', text: '\nЧому зайшов: ' },
  { name: 'Правило на майбутнє', text: '\nПравило на майбутнє: ' },
];

const Cap = ({ children, hint, tone }) => (
  <div className="flex items-baseline justify-between gap-2.5">
    <span
      className="text-[11.5px] font-bold uppercase"
      style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: '#b4b2c6' }}
    >
      {children}
    </span>
    {hint && (
      <span className="text-[13px] font-medium" style={{ fontFamily: T.sans, color: tone || '#9d9bb0' }}>
        {hint}
      </span>
    )}
  </div>
);

/* ------------------------------------------------------------------
   Скріни графіка.

   Кілька, а не один: розбір майже завжди складається з двох картинок
   — як виглядало на вході і чим закінчилось. Перегляд той самий, що
   в картці угоди: лупа на наведення, стрілки між кадрами, фулскрін
   по кліку. Свій переглядач тут був би четвертим у застосунку.
------------------------------------------------------------------ */
function ShotsField({ shots, setShots, entryId }) {
  const { user } = useAuth();
  const [hov, setHov] = useState(false);
  const [busy, setBusy] = useState(0);
  const input = useRef(null);

  const add = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;

    if (!user?.id) {
      notify.error('Спершу увійди', 'Скрін нема куди завантажити без акаунта.');
      return;
    }

    setBusy((n) => n + list.length);
    for (const file of list) {
      try {
        /* Послідовно, а не Promise.all: паралельне завантаження
           чотирьох картинок з телефонної мережі частіше падає
           цілком, ніж встигає швидше. */
        const url = await uploadImage(user.id, `err-${entryId || 'new'}`, file);
        setShots((prev) => [...prev, url]);
      } catch (e) {
        notify.error('Скрін не завантажився', e?.message || 'Сховище відмовило.');
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };

  /* Ctrl+V працює, поки відкрита модалка: скрін графіка майже
     завжди щойно зроблений і лежить у буфері, а не у файлах. */
  useEffect(() => {
    const onPaste = (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); add(files); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  return (
    <div className="mt-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ''; }}
      />

      {shots.length > 0 && (
        /* Видалення живе на самій картинці, поруч із лупою й
           фулскріном: список «кадр 1 · кадр 2» під слайдером змушував
           тримати в голові, який із них зараз показано. */
        <div className="mb-2.5">
          <ImageSlider
            images={shots}
            containerClassName="h-[200px] rounded-[14px]"
            onDelete={(url) => setShots((prev) => prev.filter((x) => x !== url))}
          />
        </div>
      )}

      <div
        onClick={() => input.current?.click()}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onDragOver={(e) => { e.preventDefault(); setHov(true); }}
        onDragLeave={() => setHov(false)}
        onDrop={(e) => { e.preventDefault(); setHov(false); add(e.dataTransfer.files); }}
        className="flex cursor-pointer items-center gap-3 rounded-[14px] p-3"
        style={{
          border: `1.5px dashed ${hov ? A(0.55) : '#24242f'}`,
          background: hov ? A(0.07) : '#ffffff03',
          transition: 'all .2s',
        }}
      >
        <span
          className="grid h-[38px] w-[38px] flex-none place-items-center rounded-xl"
          style={{
            background: hov ? A(0.17) : '#ffffff0a',
            border: `1px solid ${hov ? A(0.44) : '#26262f'}`,
            color: hov ? '#b3a8ff' : '#8b899a',
            transition: 'all .2s',
          }}
        >
          {busy > 0 ? <Loader2 size={17} className="animate-spin" /> : <ImageIcon size={17} strokeWidth={1.7} />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold" style={{ fontFamily: T.sans, color: '#e8e6f0' }}>
            {busy > 0 ? `Завантажую ${busy}…` : shots.length ? 'Додати ще скрін' : 'Скріни графіка'}
          </span>
          <span className="mt-[3px] block text-[12.5px]" style={{ fontFamily: T.sans, color: '#a5a3b8' }}>
            Перетягни, клікни або встав із буфера
          </span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------
   Причини.

   Постійним списком, а не випадашкою: це головне поле вікна, і воно
   мусить бути видно без жодного кліку. Пошук зверху перетворює
   тридцять причин на дві літери набору, а свою причину можна додати
   прямо з рядка пошуку — там же, де шукав готову.
------------------------------------------------------------------ */
function ReasonPanel({ value, onChange, invalid }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);

  /* Через useMemo, а не `value || []`: інакше кожен рендер створює
     новий масив, і всі меми нижче перераховуються дарма. */
  const picked = useMemo(() => value || [], [value]);
  const query = q.trim().toLowerCase();

  const groups = useMemo(() => REASON_GROUPS.map((g) => {
    const color = GROUP_COLOR[g.group] || T.acc;
    const items = g.items.filter((r) => !query || r.label.toLowerCase().includes(query));
    return { ...g, color, items, taken: g.items.filter((r) => picked.includes(r.id)).length };
  }).filter((g) => g.items.length), [query, picked]);

  /* Свої причини не мають групи, тому збираємо їх окремо — інакше
     вони зникали б зі списку одразу після додавання. */
  const own = picked.filter((id) => !REASONS.some((r) => r.id === id));
  const ownShown = own.filter((id) => !query || id.toLowerCase().includes(query));

  const canAdd = query.length > 1
    && !REASONS.some((r) => r.label.toLowerCase() === query)
    && !own.some((id) => id.toLowerCase() === query);

  const toggle = (id) => onChange(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const addOwn = () => {
    const label = q.trim();
    if (!label) return;
    onChange([...picked, label]);
    setQ('');
  };

  const colorOf = (id) => {
    const g = REASON_GROUPS.find((x) => x.items.some((r) => r.id === id));
    return g ? (GROUP_COLOR[g.group] || T.acc) : '#3ddc97';
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-3.5 pt-5">
        <Cap
          hint={picked.length ? `обрано ${picked.length}` : 'можна кілька'}
          tone={invalid ? '#ff9d9d' : undefined}
        >
          Причина
        </Cap>

        <div
          className="mt-2.5 flex h-10 items-center gap-2.5 rounded-xl pl-3.5 pr-2"
          style={{
            background: focus ? '#ffffff12' : '#ffffff08',
            border: `1px solid ${invalid ? '#ff7b7b8c' : focus ? A(0.5) : '#21212b'}`,
            boxShadow: focus ? `0 0 0 4px ${A(0.11)}` : 'none',
            transition: 'all .2s',
          }}
        >
          <Search size={15} strokeWidth={1.8} className="shrink-0" style={{ color: '#a5a3b8' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); addOwn(); } }}
            placeholder="Знайти або написати свою"
            className="w-full border-none bg-transparent text-[14.5px] font-medium outline-none"
            style={{ fontFamily: T.sans, color: '#ffffff' }}
          />
          {canAdd && (
            <button
              onClick={addOwn}
              className="flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold"
              style={{ fontFamily: T.sans, background: A(0.24), border: `1px solid ${A(0.5)}`, color: '#c4baff' }}
            >
              <Plus size={11} strokeWidth={3} />
              додати
            </button>
          )}
        </div>

        {picked.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {picked.map((id) => {
              const c = colorOf(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex items-center gap-2 rounded-full px-3 py-[6px] text-[13px] font-bold"
                  style={{ fontFamily: T.sans, background: `${c}26`, border: `1px solid ${c}73`, color: c, transition: 'all .16s' }}
                >
                  {reasonLabel(id)}
                  <X size={10} strokeWidth={3} />
                </button>
              );
            })}
            <button
              onClick={() => onChange([])}
              className="px-1.5 py-1 text-[13px] font-semibold"
              style={{ fontFamily: T.sans, color: '#9d9bb0' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#a99cff'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#6a6878'; }}
            >
              очистити
            </button>
          </div>
        )}
      </div>

      {/* Без стелі у 404px: список причин довший за неї, і останні
          групи обрізались просто посеред чіпів. Висоту тримає саме
          вікно — обмеження тут було зайвим поверх нього. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {groups.map((g) => {
          const main = !!g.main;
          return (
            <div
              key={g.group}
              className="mt-4"
              style={main ? {
                padding: 14,
                borderRadius: 16,
                background: `linear-gradient(165deg, ${g.color}12, #ffffff03)`,
                border: `1px solid ${g.color}2b`,
              } : undefined}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: g.color, boxShadow: `0 0 8px 1px ${g.color}99` }}
                />
                <span
                  className="whitespace-nowrap text-[11.5px] font-bold uppercase"
                  style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: main ? `${g.color}ee` : '#8d8b9e' }}
                >
                  {GROUP_TITLE[g.group] || g.group}
                </span>
                <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#22222c,transparent)' }} />
                {g.taken > 0 && (
                  <span
                    className="flex-none rounded-md px-2 py-[3px] text-[11.5px]"
                    style={{ fontFamily: T.mono, background: `${g.color}1f`, border: `1px solid ${g.color}42`, color: g.color }}
                  >
                    {g.taken}
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {g.items.map((r) => {
                  const on = picked.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      className="flex items-center gap-1.5 rounded-full px-3.5 py-[8px] text-[13.5px] font-semibold"
                      style={{
                        fontFamily: T.sans,
                        lineHeight: 1.2,
                        background: on ? `${g.color}2b` : '#ffffff08',
                        border: `1px solid ${on ? `${g.color}8c` : '#21212b'}`,
                        color: on ? '#ffffff' : '#c2c0d0',
                        boxShadow: on ? `0 0 18px -8px ${g.color}cc` : 'none',
                        transition: 'all .16s',
                      }}
                    >
                      {on && <Check size={11} strokeWidth={3} className="shrink-0" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {ownShown.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: '#3ddc97', boxShadow: '0 0 8px 1px #3ddc9799' }} />
              <span
                className="whitespace-nowrap text-[11.5px] font-bold uppercase"
                style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: '#a5a3b8' }}
              >
                Свої
              </span>
              <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,#22222c,transparent)' }} />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {ownShown.map((id) => (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-[8px] text-[13.5px] font-semibold"
                  style={{
                    fontFamily: T.sans,
                    background: '#3ddc972b',
                    border: '1px solid #3ddc978c',
                    color: '#ffffff',
                    boxShadow: '0 0 18px -8px #3ddc97cc',
                  }}
                >
                  <Check size={11} strokeWidth={3} className="shrink-0" />
                  {id}
                </button>
              ))}
            </div>
          </div>
        )}

        {!groups.length && !ownShown.length && (
          <div
            className="mt-4 rounded-[14px] px-4 py-6 text-center"
            style={{ border: '1.5px dashed #24242f', background: '#ffffff03' }}
          >
            <div className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: '#c9c7d8' }}>
              Такої причини ще немає
            </div>
            <div className="mt-1.5 text-[12px]" style={{ fontFamily: T.sans, color: '#9d9bb0' }}>
              Натисни «додати», щоб зберегти свою
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */

export default function ErrorComposerModal({ isOpen, onClose, form, setForm, onSave }) {
  const [assetOpen, setAssetOpen] = useState(false);
  const [bodyFocus, setBodyFocus] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);

  /* ---------- що справді обовʼязкове ----------

     Актив і скрін — ні. Помилка «торгував без плану» не належить
     активу, а скріншот через тиждень уже нічого не додає. Вимагати
     їх означало б не пускати в журнал саме ті записи, які найважче
     зробити й найкорисніше мати.

     Причина й опис — так. Без них картка не піддається розбору.

     Кнопка при цьому лишається живою: заблокована не каже, чого їй
     бракує — людина клікає в порожнечу й іде. */
  const [touched, setTouched] = useState(false);

  /* Скидаємо під час рендера, а не ефектом: інакше вікно встигає
     промалюватись із червоними полями від минулого разу. */
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && touched) setTouched(false);
  }

  const missReason = !(form.reasons || []).length;
  const missDesc = form.desc.trim().length < 4;
  const invalid = missReason || missDesc;
  const bad = (miss) => touched && miss;

  const len = form.desc.trim().length;
  const shots = form.shots || [];

  const submit = () => {
    if (invalid) { setTouched(true); return; }
    onSave();
  };

  const addPrompt = (text) => setForm({
    ...form,
    desc: (form.desc ? form.desc.replace(/\s*$/, '') : '') + text,
  });

  const body = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(8px)', zIndex: Z }}
          />

          <div
            style={{
              position: 'fixed', inset: 0, zIndex: Z + 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: 24, pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="err-modal relative flex w-full flex-col overflow-hidden"
              style={{
                pointerEvents: 'auto',
                maxWidth: 1040,
                height: 'min(92vh, 760px)',
                borderRadius: 24,
                backgroundColor: '#0b0b10',
                backgroundImage: 'linear-gradient(170deg,#111117,#0b0b10)',
                border: '1px solid #23232e',
                boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${A(0.08)}`,
              }}
            >
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: 'linear-gradient(90deg,transparent,#ff7b7bb3 26%,#8b7cffcc 72%,transparent)' }}
              />

              {/* Плейсхолдери за замовчуванням майже зливаються з
                  фоном — на яскравому екрані їх не видно взагалі. */}
              <style>{`
                .err-modal input::placeholder,
                .err-modal textarea::placeholder { color: #7d7b90; opacity: 1; }
              `}</style>

              {/* ---------- шапка ---------- */}
              <div
                className="flex flex-none items-center justify-between gap-5 py-4 pl-[22px] pr-[18px]"
                style={{ borderBottom: '1px solid #1c1c25' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-[34px] w-[34px] place-items-center rounded-[11px]"
                    style={{ background: '#ff7b7b1f', border: '1px solid #ff7b7b4d', boxShadow: 'inset 0 1px 0 #ff7b7b55', color: '#ffb3b3' }}
                  >
                    <AlertTriangle size={16} strokeWidth={1.9} />
                  </span>
                  <div>
                    <div
                      className="text-[12px] font-bold uppercase"
                      style={{ fontFamily: T.mono, letterSpacing: '2.2px', color: '#ff9d9d' }}
                    >
                      Зафіксувати помилку
                    </div>
                    <div className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: '#b4b2c6' }}>
                      Що сталося, чому, і що робити далі
                    </div>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
                  style={{ background: '#ffffff08', border: '1px solid #23232e', color: '#b3b1c0', transition: 'all .16s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff16'; e.currentTarget.style.borderColor = '#3d3d4c'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#23232e'; }}
                >
                  <X size={15} strokeWidth={2} />
                </button>
              </div>

              {/* ---------- дві колонки ---------- */}
              {/* Крутиться кожна колонка окремо, а не вікно цілком.
                  Спільна прокрутка тягла список причин разом із полем
                  тексту: щоб дістатись до останньої групи, доводилось
                  прогортати повз власний опис, а шапка й кнопка
                  «Зберегти» їхали за край екрана. */}
              <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[1fr_396px]">
                {/* ліворуч: те, що людина пише сама */}
                <div
                  className="min-w-0 overflow-y-auto px-[22px] pb-[18px] pt-5"
                  style={{ borderRight: '1px solid #1c1c25' }}
                >
                  <Cap>Пара</Cap>
                  <div
                    onClick={() => setAssetOpen(true)}
                    className="mt-2.5 flex h-[46px] cursor-pointer items-center justify-between gap-2.5 rounded-[13px] px-4"
                    style={{ background: '#ffffff08', border: '1px solid #21212b', transition: 'all .16s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#33333f'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#21212b'; }}
                  >
                    <span
                      className="min-w-0 truncate"
                      style={form.pair
                        ? { fontFamily: T.mono, fontSize: 15, letterSpacing: '1px', fontWeight: 700, color: '#ffffff' }
                        : { fontFamily: T.sans, fontSize: 15, fontWeight: 500, color: '#9d9bb0' }}
                    >
                      {form.pair || 'Вибрати актив'}
                    </span>
                    <Search size={15} strokeWidth={1.8} style={{ color: '#8b899a', flex: 'none' }} />
                  </div>

                  <div className="mt-5">
                    <Cap
                      hint={bad(missDesc) ? '⚠ без опису запис не піддається розбору' : len ? `${len} символів` : undefined}
                      tone={bad(missDesc) ? '#ff9d9d' : len > 40 ? '#6fe0b4' : undefined}
                    >
                      Що сталося і що з цього виніс
                    </Cap>

                    <div
                      className="mt-2.5 rounded-[14px] px-4 py-3.5"
                      style={{
                        height: 186,
                        background: bodyFocus ? '#ffffff0a' : '#ffffff05',
                        border: `1px solid ${bad(missDesc) ? '#ff7b7b8c' : bodyFocus ? A(0.45) : '#1e1e27'}`,
                        boxShadow: bodyFocus ? `0 0 0 4px ${A(0.11)}` : 'none',
                        transition: 'all .2s',
                      }}
                    >
                      <textarea
                        value={form.desc}
                        onChange={(e) => setForm({ ...form, desc: e.target.value })}
                        onFocus={() => setBodyFocus(true)}
                        onBlur={() => setBodyFocus(false)}
                        placeholder="Що зробив, де зламався план, що зробиш інакше наступного разу."
                        className="h-full w-full resize-none border-none bg-transparent p-0 outline-none"
                        style={{ fontFamily: T.sans, fontSize: 16, lineHeight: 1.68, color: '#f2f1f8' }}
                      />
                    </div>
                  </div>

                  {/* Підказки дописують заготовку в кінець тексту:
                      порожнє поле — головна причина, чому розбір
                      відкладають «на потім» і не повертаються. */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className="mr-0.5 text-[11.5px] font-bold uppercase"
                      style={{ fontFamily: T.mono, letterSpacing: '1.6px', color: '#75738a' }}
                    >
                      Підказки
                    </span>
                    {PROMPTS.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => addPrompt(p.text)}
                        className="rounded-full px-3.5 py-[7px] text-[13px] font-semibold"
                        style={{ fontFamily: T.sans, background: '#ffffff08', border: '1px solid #26262f', color: '#c2c0d0', transition: 'all .16s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.5); e.currentTarget.style.color = '#ffffff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#21212b'; e.currentTarget.style.color = '#a5a3b3'; }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>

                  <ShotsField
                    shots={shots}
                    setShots={(next) => setForm((f) => ({
                      ...f,
                      shots: typeof next === 'function' ? next(f.shots || []) : next,
                    }))}
                  />
                </div>

                {/* праворуч: те, що людина вибирає */}
                <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ background: '#0c0c11' }}>
                  <ReasonPanel
                    value={form.reasons}
                    onChange={(v) => setForm({ ...form, reasons: v })}
                    invalid={bad(missReason)}
                  />
                </div>
              </div>

              {/* ---------- підвал ---------- */}
              <div
                className="flex flex-none flex-wrap items-center justify-between gap-4 py-3.5 pl-[22px] pr-[18px]"
                style={{ borderTop: '1px solid #1c1c25', background: '#0a0a0e' }}
              >
                <span className="text-[13.5px] font-medium" style={{ fontFamily: T.sans, color: touched && invalid ? '#ff9d9d' : '#b4b2c6' }}>
                  {touched && invalid
                    ? (missReason && missDesc ? 'Заповни причину і опис'
                      : missReason ? 'Обери причину' : 'Опиши, що сталось')
                    : (form.reasons || []).length
                      ? `обрано ${(form.reasons || []).length}`
                      : 'можна кілька'}
                </span>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex h-[44px] items-center rounded-xl px-5 text-[14px] font-semibold"
                    style={{ fontFamily: T.sans, background: '#ffffff08', border: '1px solid #26262f', color: '#d4d2e0', transition: 'all .16s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ffffff14'; e.currentTarget.style.borderColor = '#353542'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff08'; e.currentTarget.style.borderColor = '#23232e'; }}
                  >
                    Скасувати
                  </button>

                  <button
                    onClick={submit}
                    onMouseEnter={() => setCtaHover(true)}
                    onMouseLeave={() => setCtaHover(false)}
                    className="relative flex h-[44px] items-center gap-2.5 overflow-hidden rounded-xl px-5 text-[14.5px] font-bold"
                    style={{
                      fontFamily: T.sans,
                      color: '#ffffff',
                      background: `linear-gradient(180deg, ${ctaHover ? '#6355ff, #4a3bf5' : '#5546f8, #3f30e8'})`,
                      boxShadow: ctaHover
                        ? `0 18px 40px -12px ${A(0.85)}, inset 0 1px 0 #ffffff4d`
                        : `0 12px 30px -12px ${A(0.7)}, inset 0 1px 0 #ffffff33`,
                      transform: `translateY(${ctaHover ? '-2px' : '0'})`,
                      opacity: touched && invalid ? 0.8 : 1,
                      transition: 'transform .3s cubic-bezier(.22,1.2,.36,1), box-shadow .24s, background .18s',
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-px"
                      style={{ background: 'linear-gradient(90deg,transparent,#ffffff99,transparent)' }}
                    />
                    <Check size={15} strokeWidth={2.6} />
                    Зберегти помилку
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Вибір активу — вище за композер, інакше ховався б під ним */}
          <div style={{ position: 'relative', zIndex: Z + 2 }}>
            <AssetPickerModal
              isOpen={assetOpen}
              onClose={() => setAssetOpen(false)}
              selectedAsset={form.pair}
              onSelect={(symbol) => setForm({ ...form, pair: symbol })}
            />
          </div>
        </>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
