import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Plus, Check, AlertTriangle, Link as LinkIcon,
} from 'lucide-react';
import { REASON_GROUPS, REASONS, reasonLabel } from './utils';
import { T } from '../../lib/theme';
import { tvImage } from '../../lib/imageStore';
import AssetPickerModal from '../modals/AssetPickerModal';
import ChartShot from '../ui/ChartShot';

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
const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/* Нижче lg колонки складаються одна під одну, і причини йдуть суцільним
   стовпцем чіпів без жодного дихання між групами — тому нижче тут групи
   отримують власну картку, а на десктопі лишається як було. Рахуємо через
   matchMedia, а не клас: колір картки міксується в JS (color-mix), інлайн-
   стилем це не перемкнути самим лише брейкпоінтом. */
function useBelowLg() {
  const [below, setBelow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setBelow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return below;
}

/* Колір групи причин: він же колір обраних чіпів усередині неї —
   так у списку обраних видно, з якої області промах. */
const GROUP_COLOR = {
  Main: 'var(--edge-bad)',
  Entry: 'var(--edge-info)',
  'Management and exit': 'var(--edge-warn)',
  Risk: 'var(--edge-bad)',
  Mindset: 'var(--edge-acc)',
  Preparation: 'var(--edge-ok)',
};

const GROUP_TITLE = {
  Main: 'Головне',
  Entry: 'Вхід',
  'Management and exit': 'Ведення і вихід',
  Risk: 'Ризик',
  Mindset: 'Стан',
  Preparation: 'Підготовка',
};


const Cap = ({ children, hint, tone }) => (
  <div className="flex items-baseline justify-between gap-2.5">
    <span
      className="text-[11.5px] font-bold uppercase"
      style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: 'var(--edge-text2)' }}
    >
      {children}
    </span>
    {hint && (
      <span className="text-[13px] font-medium" style={{ fontFamily: T.sans, color: tone || 'var(--edge-text3)' }}>
        {hint}
      </span>
    )}
  </div>
);

/* ------------------------------------------------------------------
   Скріни графіка.

   Кілька, а не один: розбір майже завжди складається з двох картинок
   — як виглядало на вході і чим закінчилось. Показ той самий, що в
   блоках плану: приглушення світлого графіка, фулскрін, карусель.
------------------------------------------------------------------ */
function ShotsField({ shots, setShots }) {
  const [hov, setHov] = useState(false);

  /* Тільки посилання з TradingView — файли більше не приймаються.

     Так само влаштовані блоки плану, і причина та сама: знімок у
     TradingView уже лежить на їхньому сервері, має власну адресу й
     живе там роками. Завантажувати ту саму картинку вдруге до нас —
     це платити сховищем і трафіком за копію того, що вже є.

     Рядок Ctrl+V лишається головним способом: з TradingView знімок
     копіюють кнопкою «Copy link to the chart image», тобто посилання
     вже в буфері, і найкоротший шлях — просто вставити його. */
  const addUrl = (raw) => {
    const text = String(raw || '').trim();
    if (!/^https?:\/\//i.test(text)) return false;

    /* Розгортаємо сторінку знімка в пряму адресу png: інакше <img>
       отримає HTML і покаже битий значок. */
    const url = tvImage(text);
    setShots((prev) => (prev.includes(url) ? prev : [...prev, url]));
    return true;
  };

  useEffect(() => {
    const onPaste = (e) => {
      const text = e.clipboardData?.getData('text') || '';
      if (addUrl(text)) e.preventDefault();
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  /* Колонка, а не просто блок: зона вставки забирає всю висоту, що
     лишилась під текстом, замість вузької смужки з порожнечею під нею
     до самого низу вікна. */
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      {shots.length > 0 && (
        /* Той самий показ скріна, що в блоках плану: приглушення
           світлого графіка, фулскрін, карусель на кілька кадрів.
           Раніше тут стояв загальний ImageSlider — він уміє менше й
           виглядав інакше, ніж те саме місце в плані. */
        <div className="mb-2.5 flex-none">
          <ChartShot
            images={shots}
            height={320}
            onRemove={(url) => setShots((prev) => prev.filter((x) => x !== url))}
          />
        </div>
      )}

      {/* Зона вставки. Кліком нічого не відкриває — відкривати нічого:
          єдиний спосіб додати скрін це вставити посилання. Тому й
          курсор звичайний, а не «палець»: кнопкою вона не є. */}
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onDragOver={(e) => { e.preventDefault(); setHov(true); }}
        onDragLeave={() => setHov(false)}
        onDrop={(e) => {
          /* Перетягнути посилання прямо з вкладки TradingView теж
             можна — браузер кладе його в dataTransfer як текст. */
          e.preventDefault();
          setHov(false);
          addUrl(e.dataTransfer.getData('text'));
        }}
        className="flex min-h-[112px] flex-1 flex-col items-center justify-center gap-3.5 rounded-[14px] p-5 text-center"
        style={{
          border: `1.5px dashed ${hov ? 'var(--edge-line-hi)' : 'var(--edge-line)'}`,
          background: hov ? 'rgba(var(--edge-hair-rgb),0.04)' : 'rgba(var(--edge-hair-rgb),0.015)',
          transition: 'all .2s',
        }}
      >
        <span
          className="grid h-[46px] w-[46px] flex-none place-items-center rounded-2xl"
          style={{
            background: 'rgba(var(--edge-hair-rgb),0.04)',
            border: `1px solid ${hov ? 'var(--edge-line-hi)' : 'var(--edge-line)'}`,
            color: hov ? 'var(--edge-text2)' : 'var(--edge-text3)',
            transition: 'all .2s',
          }}
        >
          <LinkIcon size={19} strokeWidth={1.9} />
        </span>

        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold" style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}>
            {hov ? 'Відпусти посилання' : shots.length ? 'Додати ще скрін' : 'Скрін графіка'}
          </span>
          <span className="mt-[5px] block text-[12.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text2)' }}>
            Встав лінк з TradingView — Ctrl+V
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
  const belowLg = useBelowLg();

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
    return g ? (GROUP_COLOR[g.group] || T.acc) : 'var(--edge-ok)';
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-3.5 pt-5">
        <Cap
          hint={picked.length ? `обрано ${picked.length}` : undefined}
          tone={invalid ? 'var(--edge-bad)' : undefined}
        >
          Причина
        </Cap>

        <div
          className="mt-2.5 flex h-10 items-center gap-3 px-1"
          style={{
            /* Було заповнене поле з рамкою з усіх боків — на 40px
               висоти з іконкою й кнопкою «додати» всередині це
               залишало впритул 2-3px падінгу, і все ліпилось одне
               до одного. Лишаємо тільки нижню лінію: менше власної
               ваги в компонента, і місце під іконку/текст/кнопку
               більше не тісне. */
            borderBottom: `1px solid ${invalid
              ? 'rgba(var(--edge-bad-rgb),0.55)'
              : focus ? 'var(--edge-acc, #8b7bff)' : 'var(--edge-line)'}`,
            transition: 'border-color .2s',
          }}
        >
          <Search size={15} strokeWidth={1.8} className="shrink-0" style={{ color: 'var(--edge-text2)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) { e.preventDefault(); addOwn(); } }}
            placeholder="Знайти або написати свою"
            className="w-full border-none bg-transparent text-[14.5px] font-medium outline-none"
            style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
          />
          {canAdd && (
            <button
              onClick={addOwn}
              className="flex flex-none items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold"
              style={{ fontFamily: T.sans, background: A(0.24), border: `1px solid ${A(0.5)}`, color: 'var(--edge-acc)' }}
            >
              <Plus size={11} strokeWidth={3} />
              додати
            </button>
          )}
        </div>

        {picked.length > 0 && (
          /* Нижче lg список обраних росте з кожним вибором і на вузькому
             екрані зжирає висоту, потрібну самому переліку причин під
             ним — після трьох-чотирьох виборів картки лишались смужкою
             в палець завширшки. Тому тут власна невисока прокрутка: як
             довго б не був список, він не тисне на те, що нижче. */
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5 lg:max-h-none lg:overflow-visible"
            style={belowLg ? {
              maxHeight: 80,
              overflowY: 'auto',
              WebkitMaskImage: 'linear-gradient(180deg, black 78%, transparent 100%)',
              maskImage: 'linear-gradient(180deg, black 78%, transparent 100%)',
            } : undefined}
          >
            {picked.map((id) => {
              const c = colorOf(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex items-center gap-2 rounded-full px-3 py-[6px] text-[13px] font-bold"
                  style={belowLg
                    ? { fontFamily: T.sans, background: mix(c, 22), border: `1px solid ${mix(c, 55)}`, color: c, transition: 'all .16s' }
                    : { fontFamily: T.sans, background: `${c}26`, border: `1px solid ${c}73`, color: c, transition: 'all .16s' }}
                >
                  {reasonLabel(id)}
                  <X size={10} strokeWidth={3} />
                </button>
              );
            })}
            <button
              onClick={() => onChange([])}
              className="px-1.5 py-1 text-[13px] font-semibold"
              style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--edge-acc)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--edge-text3)'; }}
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
          /* Нижче lg кожна група стає власною карткою — інакше на
             вузькому екрані всі шість груп зливаються в одну стіну
             чіпів без жодного орієнтира, де закінчується одна тема й
             починається інша. На lg+ поведінка не зачіпається взагалі —
             там лишається рівно той самий об'єкт стилю, що був. */
          const boxStyle = belowLg
            ? {
              padding: 14,
              borderRadius: 16,
              background: `linear-gradient(165deg, ${mix(g.color, main ? 14 : 10)}, rgba(var(--edge-hair-rgb),0.01))`,
              border: `1px solid ${mix(g.color, main ? 32 : 24)}`,
            }
            : main
              ? {
                padding: 14,
                borderRadius: 16,
                background: `linear-gradient(165deg, ${g.color}12, rgba(var(--edge-hair-rgb),0.015))`,
                border: `1px solid ${g.color}2b`,
              }
              : undefined;

          return (
            <div key={g.group} className="mt-4" style={boxStyle}>
              <div className="flex items-center gap-2.5">
                {belowLg ? (
                  <span
                    className="grid h-7 w-7 flex-none place-items-center rounded-[9px]"
                    style={{ background: mix(g.color, 20), border: `1px solid ${mix(g.color, 42)}` }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color, boxShadow: `0 0 8px 1px ${mix(g.color, 65)}` }} />
                  </span>
                ) : (
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ background: g.color, boxShadow: `0 0 8px 1px ${g.color}99` }}
                  />
                )}
                <span
                  className="whitespace-nowrap text-[11.5px] font-bold uppercase"
                  style={{
                    fontFamily: T.mono,
                    letterSpacing: '1.8px',
                    color: belowLg ? mix(g.color, 92) : main ? `${g.color}ee` : 'var(--edge-text3)',
                  }}
                >
                  {GROUP_TITLE[g.group] || g.group}
                </span>
                <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,var(--edge-line),transparent)' }} />
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
                      style={belowLg ? {
                        fontFamily: T.sans,
                        lineHeight: 1.2,
                        background: on ? mix(g.color, 26) : 'rgba(var(--edge-hair-rgb),0.05)',
                        border: `1px solid ${on ? mix(g.color, 60) : 'var(--edge-line)'}`,
                        color: on ? 'var(--edge-text)' : 'var(--edge-text2)',
                        boxShadow: on ? `0 0 18px -8px ${mix(g.color, 75)}` : 'none',
                        transition: 'all .16s',
                      } : {
                        fontFamily: T.sans,
                        lineHeight: 1.2,
                        background: on ? `${g.color}2b` : 'rgba(var(--edge-hair-rgb),0.03)',
                        border: `1px solid ${on ? `${g.color}8c` : 'var(--edge-line)'}`,
                        color: on ? 'var(--edge-text)' : 'var(--edge-text2)',
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
          <div
            className="mt-4"
            style={belowLg ? {
              padding: 14,
              borderRadius: 16,
              background: 'linear-gradient(165deg, rgba(var(--edge-ok-rgb),0.10), rgba(var(--edge-hair-rgb),0.01))',
              border: '1px solid rgba(var(--edge-ok-rgb),0.24)',
            } : undefined}
          >
            <div className="flex items-center gap-2.5">
              {belowLg ? (
                <span
                  className="grid h-7 w-7 flex-none place-items-center rounded-[9px]"
                  style={{ background: 'rgba(var(--edge-ok-rgb),0.20)', border: '1px solid rgba(var(--edge-ok-rgb),0.42)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--edge-ok)', boxShadow: '0 0 8px 1px rgba(var(--edge-ok-rgb),0.60)' }} />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: 'var(--edge-ok)', boxShadow: '0 0 8px 1px rgba(var(--edge-ok-rgb),0.60)' }} />
              )}
              <span
                className="whitespace-nowrap text-[11.5px] font-bold uppercase"
                style={{ fontFamily: T.mono, letterSpacing: '1.8px', color: belowLg ? 'var(--edge-ok)' : 'var(--edge-text2)' }}
              >
                Свої
              </span>
              <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg,var(--edge-line),transparent)' }} />
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {ownShown.map((id) => (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-[8px] text-[13.5px] font-semibold"
                  style={{
                    fontFamily: T.sans,
                    background: 'rgba(var(--edge-ok-rgb),0.17)',
                    border: '1px solid rgba(var(--edge-ok-rgb),0.55)',
                    color: 'var(--edge-text)',
                    boxShadow: '0 0 18px -8px rgba(var(--edge-ok-rgb),0.80)',
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
            style={{ border: '1.5px dashed var(--edge-line)', background: 'rgba(var(--edge-hair-rgb),0.015)' }}
          >
            <div className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: 'var(--edge-text2)' }}>
              Такої причини ще немає
            </div>
            <div className="mt-1.5 text-[12px]" style={{ fontFamily: T.sans, color: 'var(--edge-text3)' }}>
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
            className="p-3 sm:p-6"
            style={{
              position: 'fixed', inset: 0, zIndex: Z + 1, display: 'flex',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
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
                /* Ширше й вище. Ліворуч текст і скріни, праворуч
                   довгий список причин — при 1040 обидві колонки були
                   тісні, і список причин прокручувався по чотири
                   пункти за раз. */
                maxWidth: 1320,
                height: 'min(94vh, 900px)',
                borderRadius: 24,
                backgroundColor: 'var(--edge-sunken)',
                backgroundImage: 'linear-gradient(170deg,var(--edge-surface),var(--edge-sunken))',
                border: '1px solid var(--edge-line)',
                boxShadow: `0 50px 110px -40px #000, 0 0 0 1px ${A(0.08)}`,
              }}
            >
              {/* Світна смужка вгорі прибрана.

                  Вона була градієнтом із червоного в фіолетовий і
                  тягла погляд у верхній край вікна — тобто туди, де
                  нема чого робити. У модалці, де головне це вибрати
                  причину справа й написати текст зліва, найяскравіший
                  елемент не має права бути декорацією. */}

              {/* Плейсхолдери за замовчуванням майже зливаються з
                  фоном — на яскравому екрані їх не видно взагалі. */}
              <style>{`
                .err-modal input::placeholder,
                .err-modal textarea::placeholder { color: var(--edge-text3); opacity: 1; }
              `}</style>

              {/* ---------- шапка ---------- */}
              <div
                className="flex flex-none items-center justify-between gap-5 py-4 pl-[22px] pr-[18px]"
                style={{ borderBottom: '1px solid var(--edge-line)' }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-[34px] w-[34px] place-items-center rounded-[11px]"
                    style={{ background: 'rgba(var(--edge-bad-rgb),0.12)', border: '1px solid rgba(var(--edge-bad-rgb),0.30)', boxShadow: 'inset 0 1px 0 rgba(var(--edge-bad-rgb),0.33)', color: 'var(--edge-bad)' }}
                  >
                    <AlertTriangle size={16} strokeWidth={1.9} />
                  </span>
                  <div>
                    <div
                      className="text-[12px] font-bold uppercase"
                      style={{ fontFamily: T.mono, letterSpacing: '2.2px', color: 'var(--edge-bad)' }}
                    >
                      Зафіксувати помилку
                    </div>
                    <div className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: 'var(--edge-text2)' }}>
                      Що сталося, чому, і що робити далі
                    </div>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="grid h-[34px] w-[34px] place-items-center rounded-[10px]"
                  style={{ background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', color: 'var(--edge-text2)', transition: 'all .16s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.09)'; e.currentTarget.style.borderColor = 'var(--edge-line-hi)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.03)'; e.currentTarget.style.borderColor = 'var(--edge-line)'; }}
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
              {/* Права колонка ширша: 396 пікселів на список причин
                  означали по одному чіпу в рядок, і тридцять причин
                  перетворювались на довгий сувій. На 560 в рядок
                  лягає два-три, і більшість груп видно без прокрутки
                  взагалі. */}
              <div className="grid min-h-0 flex-1 overflow-y-auto lg:overflow-hidden lg:grid-cols-[1fr_560px]">
                {/* ліворуч: те, що людина пише сама */}
                <div
                  className="flex min-w-0 flex-col overflow-y-auto border-b px-4 pb-[18px] pt-5 lg:border-b-0 lg:border-r lg:px-[22px]"
                  style={{ borderColor: 'var(--edge-line)', scrollbarGutter: 'stable' }}
                >
                  <Cap>Пара</Cap>
                  <div
                    onClick={() => setAssetOpen(true)}
                    className="mt-2.5 flex h-[46px] shrink-0 cursor-pointer items-center justify-between gap-2.5 rounded-[13px] px-4"
                    style={{ background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', transition: 'all .16s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--edge-line-hi)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--edge-line)'; }}
                  >
                    <span
                      className="min-w-0 truncate"
                      style={form.pair
                        ? { fontFamily: T.mono, fontSize: 15, letterSpacing: '1px', fontWeight: 700, color: 'var(--edge-text)' }
                        : { fontFamily: T.sans, fontSize: 15, fontWeight: 500, color: 'var(--edge-text3)' }}
                    >
                      {form.pair || 'Вибрати актив'}
                    </span>
                    <Search size={15} strokeWidth={1.8} style={{ color: 'var(--edge-text3)', flex: 'none' }} />
                  </div>

                  <div className="mt-5 shrink-0">
                    <Cap
                      hint={bad(missDesc) ? '⚠ без опису запис не піддається розбору' : len ? `${len} символів` : undefined}
                      tone={bad(missDesc) ? 'var(--edge-bad)' : len > 40 ? 'var(--edge-ok)' : undefined}
                    >
                      Що сталося і що з цього виніс
                    </Cap>

                    <div
                      className="mt-2.5 rounded-[14px] px-4 py-3.5"
                      style={{
                        height: 186,
                        background: bodyFocus ? 'rgba(var(--edge-hair-rgb),0.04)' : 'rgba(var(--edge-hair-rgb),0.02)',
                        /* Фокус позначаємо світлішою рамкою, а не
                           фіолетовим ореолом. Акцентний колір тут
                           нічого не означав: він не попереджав і не
                           підказував, просто світився. А поруч із
                           фіолетовою кнопкою «Зберегти» ще й змагався
                           з нею за увагу. */
                        border: `1px solid ${bad(missDesc)
                          ? 'rgba(var(--edge-bad-rgb),0.55)'
                          : bodyFocus ? 'var(--edge-line-hi)' : 'var(--edge-line)'}`,
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
                        style={{ fontFamily: T.sans, fontSize: 16, lineHeight: 1.68, color: 'var(--edge-text)' }}
                      />
                    </div>
                  </div>

                  {/* Рядок «Підказки» прибраний.

                      Заготовки дописували в текст шаблон на кшталт
                      «Що я побачив: ». Задум був зрозумілий — порожнє
                      поле лякає, — але на ділі вони займали смугу під
                      найважливішим полем модалки й тіснили скріни
                      вниз. А причину людина й так вибирає справа: там
                      той самий зміст, тільки списком.

                      Місце віддано полю тексту й скрінам. */}

                  <ShotsField
                    shots={shots}
                    setShots={(next) => setForm((f) => ({
                      ...f,
                      shots: typeof next === 'function' ? next(f.shots || []) : next,
                    }))}
                  />
                </div>

                {/* праворуч: те, що людина вибирає */}
                <div
                  className="flex min-h-0 min-w-0 flex-col overflow-visible rounded-t-[22px] shadow-[0_-16px_28px_-22px_rgba(0,0,0,0.55)] lg:overflow-hidden lg:rounded-none lg:shadow-none"
                  style={{ background: 'var(--edge-sunken)' }}
                >
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
                style={{ borderTop: '1px solid var(--edge-line)', background: 'var(--edge-sunken)' }}
              >
                <span className="text-[13.5px] font-medium" style={{ fontFamily: T.sans, color: touched && invalid ? 'var(--edge-bad)' : 'var(--edge-text2)' }}>
                  {touched && invalid
                    ? (missReason && missDesc ? 'Заповни причину і опис'
                      : missReason ? 'Обери причину' : 'Опиши, що сталось')
                    : (form.reasons || []).length
                      ? `обрано ${(form.reasons || []).length}`
                      : ''}
                </span>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={onClose}
                    className="flex h-[44px] items-center rounded-xl px-5 text-[14px] font-semibold"
                    style={{ fontFamily: T.sans, background: 'rgba(var(--edge-hair-rgb),0.03)', border: '1px solid var(--edge-line)', color: 'var(--edge-text)', transition: 'all .16s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.08)'; e.currentTarget.style.borderColor = 'var(--edge-line-hi)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(var(--edge-hair-rgb),0.03)'; e.currentTarget.style.borderColor = 'var(--edge-line)'; }}
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
                      color: 'var(--edge-text)',
                      background: `linear-gradient(180deg, ${ctaHover ? 'var(--edge-acc), var(--edge-acc)' : 'var(--edge-acc), var(--edge-acc)'})`,
                      boxShadow: ctaHover
                        ? `0 18px 40px -12px ${A(0.85)}, inset 0 1px 0 rgba(var(--edge-text-rgb),0.3)`
                        : `0 12px 30px -12px ${A(0.7)}, inset 0 1px 0 rgba(var(--edge-text-rgb),0.2)`,
                      transform: `translateY(${ctaHover ? '-2px' : '0'})`,
                      opacity: touched && invalid ? 0.8 : 1,
                      transition: 'transform .3s cubic-bezier(.22,1.2,.36,1), box-shadow .24s, background .18s',
                    }}
                  >
                    <span
                      className="pointer-events-none absolute inset-x-0 top-0 h-px"
                      style={{ background: 'linear-gradient(90deg,transparent,rgba(var(--edge-text-rgb),0.6),transparent)' }}
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
