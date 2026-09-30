import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import TextareaAutosize from 'react-textarea-autosize';
import {
  X, Pencil, Save, Trash2, Loader2, ImagePlus,
  Check, AlertTriangle, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Clock, BookOpen, Share2,
  Eye, EyeOff, ChevronLeft, ChevronRight,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { onlyMine } from '../../lib/myId';
import { useAuth } from '../../context/AuthContext';
import { deleteTrade } from '../../lib/tradesStore';
import { notify } from '../../utils/notify';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import ImageSlider from '../ui/ImageSlider';
import TradeLevels from '../journal/TradeLevels';
import DateField from '../ui/DateField';
import { T } from '../../lib/theme';
import { inSandbox, isSharedView, withSandbox } from '../../lib/sandbox';
import useImageAttach, { filesFromPaste, imageFiles } from '../../hooks/useImageAttach';
import { t as tx } from '../../lib/lang';

/* ==================================================================
   Деталі угоди — термінальна фінтех-панель: JetBrains Mono для цифр,
   розумне розкриття (за замовчуванням видно лише відхилення від
   плану, решта ховається за «Показати все»), check/x замість
   тексту «Так/Ні».

   Редагування явно позначене: поля отримують пунктирну акцентну
   рамку й теплуватий фон, а не просто стають клікабельними
   непомітно. Розкриття/згортання — тільки growth за висотою й
   opacity, ніколи translate — нічого не «виїжджає» збоку.
================================================================== */

const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace";

/* Як позиція закрилась за даними термінала.

   Кольори не за «добре/погано», а за «хто вирішив»: тейк і стоп —
   рішення, прийняте до входу, тому вони спокійних кольорів системи;
   вихід руками — жовтий, бо це рішення посеред угоди; стоп-аут —
   червоний, бо це вже не рішення.

   Ключі збігаються зі значеннями, які пише воркер MT5. */
const EXIT_REASON = {
  tp:      { label: 'Тейк',        color: T.ok,    rgb: T.okRgb },
  sl:      { label: 'Стоп',        color: T.bad,   rgb: T.badRgb },
  manual:  { label: 'Руками',      color: T.warn,  rgb: T.warnRgb },
  expert:  { label: 'Радник',      color: T.info,  rgb: T.infoRgb },
  stopout: { label: 'Стоп-аут',    color: T.bad,   rgb: T.badRgb },
  other:   { label: 'Інше',        color: T.text3, rgb: T.text3Rgb || '122,122,133' },
};
const SPRING_UI = { type: 'spring', duration: 0.35, bounce: 0 };
const SPRING_TAP = { type: 'spring', duration: 0.22, bounce: 0 };

/* value — те, що йде в базу (лишається сумісним з рештою застосунку:
   таблицею угод, фільтрами, статистикою); label — те, що бачить
   трейдер тут: Take/Stop замість Win/Lose. */
const RESULT_OPTS = [
  { value: 'Win',  label: 'Take', c: T.ok,   rgb: T.okRgb },
  { value: 'Lose', label: 'Stop', c: T.bad,  rgb: T.badRgb },
  { value: 'BE',   label: 'BE',   c: T.warn, rgb: T.warnRgb },
];

const SESSIONS = ['Asia', 'London', 'New York'];
const TYPES = ['Long', 'Short'];

/* Кожна сесія — свій відтінок, щоб бейдж впізнавався з першого
   погляду, а не тільки за текстом. */
const SESSION_COLORS = {
  Asia: { c: '#fb7185', rgb: '251,113,133' },      // рожево-червоний
  London: { c: '#60a5fa', rgb: '96,165,250' },     // синій
  'New York': { c: '#34d399', rgb: '52,211,153' }, // зелений
};

/* ---------- примітиви ---------- */

function Eyebrow({ children, tone }) {
  return (
    <span className="block text-[12px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: MONO, color: tone || T.text4 }}>
      {children}
    </span>
  );
}

/* Check/X замість «Так/Ні» — просити прочитати слово повільніше,
   ніж просто розпізнати зелену галку чи червоний хрестик. */
function YesNoIcon({ good, size = 15 }) {
  return good ? (
    <Check size={size} strokeWidth={3} style={{ color: T.ok }} />
  ) : (
    <X size={size} strokeWidth={3} style={{ color: T.bad }} />
  );
}

function YesNo({ value, onChange, editing, invert }) {
  const good = invert ? !value : value;

  if (!editing) {
    return (
      <div
        className="grid h-6 w-6 place-items-center rounded-full"
        style={{ background: good ? `rgba(${T.okRgb},0.12)` : `rgba(${T.badRgb},0.12)` }}
      >
        <YesNoIcon good={good} size={13} />
      </div>
    );
  }

  return (
    <div className="flex rounded-lg p-0.5" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
      {/* Колір іде за формою іконки, а не за семантикою good/bad
          конкретного поля: галочка завжди зелена, хрестик завжди
          червоний — інакше на інвертованих полях (типу «Була
          помилка») галочка ставала червоною, що плутало. */}
      {[true, false].map((v) => {
        const on = value === v;
        const c = v ? T.ok : T.bad;
        const rgb = v ? T.okRgb : T.badRgb;
        return (
          <motion.button
            key={String(v)}
            onClick={() => onChange(v)}
            whileTap={{ scale: 0.92 }}
            transition={SPRING_TAP}
            className="grid h-6 w-8 place-items-center rounded-md transition-colors duration-150"
            style={{ background: on ? `rgba(${rgb},0.16)` : 'transparent' }}
          >
            {v ? <Check size={13} strokeWidth={3} style={{ color: on ? c : T.text4 }} /> : <X size={13} strokeWidth={3} style={{ color: on ? c : T.text4 }} />}
          </motion.button>
        );
      })}
    </div>
  );
}

function PillGroup({ options, value, onChange, editing, colorMap, groupId, labelMap }) {
  if (!editing) {
    const c = colorMap?.[value];
    return (
      <span className="text-[15.5px] font-semibold" style={{ color: c ? c.c : T.text2, fontFamily: MONO }}>
        {value ? (labelMap?.[value] ?? value) : '—'}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o;
        const c = colorMap?.[o];
        return (
          <motion.button
            key={o}
            onClick={() => onChange(o)}
            whileTap={{ scale: 0.95 }}
            className="relative overflow-hidden rounded-lg px-3 py-1.5 text-[14px] font-bold transition-colors duration-150"
            style={{
              border: `1px solid ${on ? (c ? `rgba(${c.rgb},0.32)` : T.lineAcc) : T.line}`,
              color: on ? (c ? c.c : T.acc) : T.text3,
              fontFamily: MONO,
            }}
          >
            {/* Спільний layoutId — фон плавно ковзає між пілюлями
                замість того, щоб зникати на старій і зʼявлятись на
                новій одночасно (це й читалось як «стрибає»). */}
            {on && (
              <motion.span
                layoutId={`pill-bg-${groupId}`}
                transition={SPRING_UI}
                className="absolute inset-0 -z-10"
                style={{ background: c ? `rgba(${c.rgb},0.14)` : `rgba(${T.accRgb},0.14)` }}
              />
            )}
            <span className="relative">{labelMap?.[o] ?? o}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/* Один сегмент HH або MM — велика цифра по центру, тонкі стрілки
   вгору/вниз збоку. Клік — виділяє все, щоб просто ввести число з
   клавіатури; колесо миші — теж крутить значення, як степер у
   Health/Годиннику. Ніякого нативного колеса браузера. */
function TimeSegment({ value, max, onChange }) {
  const step = (dir) => onChange(((value + dir) % (max + 1) + (max + 1)) % (max + 1));
  return (
    <div className="flex items-center gap-[3px]">
      <input
        value={String(value).padStart(2, '0')}
        onFocus={(e) => e.target.select()}
        onWheel={(e) => { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(-2);
          if (digits === '') return onChange(0);
          onChange(Math.min(max, parseInt(digits, 10)));
        }}
        className="w-[26px] border-none bg-transparent text-center outline-none"
        style={{ color: T.text, fontFamily: MONO, fontSize: 17, fontWeight: 700 }}
      />
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => step(1)}
          className="grid h-[9px] w-[13px] place-items-center rounded-sm transition-colors"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.acc)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          <ChevronUp size={9} strokeWidth={3} />
        </button>
        <button
          type="button"
          onClick={() => step(-1)}
          className="grid h-[9px] w-[13px] place-items-center rounded-sm transition-colors"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.acc)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          <ChevronDown size={9} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

/* Час без нативного колеса прокрутки браузера — звичайний текстовий
   інпут з іконкою годинника, як у мінімалістичних полях Apple. */
function TimeField({ value, onChange }) {
  const [hh, mm] = (value || '').split(':');
  const H = Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
  const M = Math.min(59, Math.max(0, parseInt(mm, 10) || 0));
  const set = (nh, nm) => onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);

  return (
    <div
      className="flex h-9 w-fit items-center gap-1.5 rounded-lg px-2.5"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      <Clock size={12} strokeWidth={2.4} style={{ color: T.text4 }} />
      <TimeSegment value={H} max={23} onChange={(nh) => set(nh, M)} />
      <span className="font-bold" style={{ color: T.text4, fontFamily: MONO, fontSize: 17 }}>:</span>
      <TimeSegment value={M} max={59} onChange={(nm) => set(H, nm)} />
    </div>
  );
}

/* Дуже довгий опис не повинен розтягувати всю картку у висоту —
   і в перегляді, і в редагуванні текст впирається у стелю й далі
   гортається всередині свого блоку, а не штовхає модалку. */
function Editable({ value, onChange, editing, placeholder, minRows = 4, maxRows = 12 }) {
  if (!editing) {
    return value?.trim() ? (
      <p
        className="notes-scroll max-h-[320px] overflow-y-auto whitespace-pre-wrap pr-1 text-[16px]"
        style={{ fontFamily: T.sans, lineHeight: 1.6, color: T.text2 }}
      >
        {value}
      </p>
    ) : (
      <p className="text-[15.5px] italic" style={{ color: T.text4, fontFamily: T.sans }}>
        {placeholder}
      </p>
    );
  }
  return (
    <TextareaAutosize
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      minRows={minRows}
      maxRows={maxRows}
      spellCheck={false}
      className="notes-scroll w-full resize-none rounded-lg border-none px-3 py-2.5 outline-none"
      style={{ fontFamily: T.sans, fontSize: 15.5, lineHeight: 1.65, color: T.text, background: T.bg }}
    />
  );
}

/* ================================================================== */

/* ---------- редагування в стрічці цифр ----------

   R, ризик і акаунт — головні числа угоди, тож і правляться там, де їх
   читають: у стрічці зверху, а не дрібними інпутами в кінці правої
   колонки. Пунктирна акцентна рамка — та сама мова «це поле зараз
   редагується», що й у решті картки. */
const RISK_PRESETS = ['0.25%', '0.5%', '1%', '2%'];

/* Пунктирна рамка читалась як заготовка, а не як поле, яке чекає
   введення. Тепер це звичайний інпут: заглиблення, суцільний кант і
   виразний фокус — видно, що саме зараз правиш. */
function StripInput({ value, onChange, placeholder, suffix, color, width = 104 }) {
  const [focus, setFocus] = useState(false);
  return (
    <label
      className="flex h-[38px] items-center gap-1.5 rounded-[10px] px-3"
      style={{
        width,
        background: T.sunken,
        border: `1px solid ${focus ? T.acc : T.line}`,
        boxShadow: focus ? `0 0 0 3px rgba(${T.accRgb},0.12)` : 'none',
        transition: 'border-color .18s, box-shadow .18s',
        cursor: 'text',
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={placeholder}
        inputMode="decimal"
        className="min-w-0 flex-1 bg-transparent text-[19px] font-bold tabular-nums outline-none"
        style={{ fontFamily: MONO, color: color || T.text }}
      />
      {suffix && <span className="shrink-0 text-[13px] font-semibold" style={{ fontFamily: MONO, color: T.text4 }}>{suffix}</span>}
    </label>
  );
}

function AccountSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[38px] w-full min-w-[160px] items-center justify-between gap-2 rounded-[10px] px-3"
        style={{
          background: T.sunken,
          border: `1px solid ${open ? T.acc : T.line}`,
          boxShadow: open ? `0 0 0 3px rgba(${T.accRgb},0.12)` : 'none',
          color: T.text,
          transition: 'border-color .18s, box-shadow .18s',
        }}
      >
        <span className="truncate text-[15px] font-semibold" style={{ fontFamily: MONO }}>{value || 'Select account'}</span>
        <ChevronDown size={14} style={{ color: T.text4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[240px] rounded-xl p-1"
            style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}`, boxShadow: '0 18px 40px -12px rgba(0,0,0,.7)' }}
          >
            {options.length === 0 ? (
              <div className="px-3 py-2.5 text-[13.5px]" style={{ color: T.text4, fontFamily: T.sans }}>No active accounts</div>
            ) : options.map((o) => {
              const on = o.firm_name === value;
              return (
                <button
                  key={o.id || o.firm_name}
                  type="button"
                  onClick={() => { onChange(o.firm_name); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                  style={{ background: on ? `rgba(${T.accRgb},0.12)` : 'transparent', color: on ? T.text : T.text2 }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.bg; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans }}>{o.firm_name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {o.balance != null && (
                      <span className="text-[12px] tabular-nums" style={{ fontFamily: MONO, color: T.text4 }}>
                        ${Number(o.balance).toLocaleString('en-US')}
                      </span>
                    )}
                    {on && <Check size={13} strokeWidth={2.8} style={{ color: T.acc }} />}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- торговий план дня ----------

   Угода без плану — половина історії: видно, що зробив, але не видно,
   що збирався зробити. Тож план того ж дня й активу підтягується
   прямо в картку — bias, скріни top-down, стратегія й висновки, — а
   повний план відкривається одним кліком. */
function Clamp({ text, lines = 4 }) {
  const [more, setMore] = useState(false);
  const long = (text || '').length > 220;
  return (
    <div>
      <p
        className="whitespace-pre-wrap text-[14.5px] leading-[1.55]"
        style={{
          fontFamily: T.sans, color: T.text2,
          ...(more || !long ? {} : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className="mt-1 text-[12.5px] font-semibold"
          style={{ fontFamily: T.sans, color: T.acc }}
        >
          {more ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function PlanPanel({ plan, pair, date, onOpen }) {
  const pd = plan?.plan_data || {};
  const bias = plan?.narrative || pd.narrative || '';
  const biasTone = /bull/i.test(bias) ? T.ok : /bear/i.test(bias) ? T.bad : T.text3;
  const showBias = /bull|bear|neutral|range/i.test(bias);
  const tda = (pd.tdaBlocks || []).filter((b) => b.image);
  const planText = (pd.planText || '').trim();
  const conclusions = (pd.conclusionsText || '').trim();
  const empty = plan && !tda.length && !planText && !conclusions;

  return (
    <div className="rounded-xl p-4" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={13} strokeWidth={2.4} style={{ color: T.acc }} />
          <Eyebrow>TRADING PLAN</Eyebrow>
          {showBias && (
            <span
              className="rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.08em]"
              style={{ fontFamily: MONO, color: biasTone, background: T.sunken, border: `1px solid ${T.line}` }}
            >
              {bias}
            </span>
          )}
        </div>
        {date && pair && (
          <button
            type="button"
            onClick={onOpen}
            className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
          >
            {plan ? 'Open plan' : 'Create plan'}
            <ArrowUpRight size={13} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {plan === undefined ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-3 w-2/3 animate-pulse rounded" style={{ background: T.sunken }} />
          <div className="h-3 w-1/2 animate-pulse rounded" style={{ background: T.sunken }} />
        </div>
      ) : plan === null ? (
        <p className="mt-2.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {date && pair ? `No plan for ${pair} on ${date}.` : 'This trade has no date or asset to find a plan.'}
        </p>
      ) : empty ? (
        <p className="mt-2.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>The plan exists but is still empty.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          {tda.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tda.slice(0, 4).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={onOpen}
                  className="relative aspect-video overflow-hidden rounded-lg"
                  style={{ border: `1px solid ${T.line}`, background: T.sunken }}
                >
                  <img src={b.image} alt="" className="h-full w-full object-cover" />
                  {b.tf && (
                    <span
                      className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold"
                      style={{ fontFamily: MONO, color: T.text, background: 'rgba(0,0,0,.6)' }}
                    >
                      {b.tf}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {planText && (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>STRATEGY</Eyebrow>
              <Clamp text={planText} />
            </div>
          )}
          {conclusions && (
            <div className="flex flex-col gap-1.5">
              <Eyebrow>CONCLUSIONS</Eyebrow>
              <Clamp text={conclusions} lines={3} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Скріни й графік з терміналу — в одному вікні, слайдами.

   Раніше скрін і схема MT5 стояли одне під одним, і картка
   розросталась удвічі. Тепер це одна рамка: спершу скріни (їх
   людина додала навмисно, вони важливіші), останнім слайдом —
   графік із терміналу. Перемикаються вкладками над рамкою або
   стрілками по боках.

   У режимі редагування в тому ж рядку вкладок стоять «+ Скрін» і
   «Прибрати» — окремої смуги з мініатюрами більше немає, вона лише
   захаращувала картку. Ctrl+V і перетягування працюють по всій
   рамці. */
function TradeMedia({ trade, images, ownShots, hasLevels, editing, busy, onFiles, onLink, onRemove }) {
  const fileRef = useRef(null);
  const [hot, setHot] = useState(false);
  const slides = useMemo(
    () => [...images.map((src) => ({ kind: 'img', src })), ...(hasLevels ? [{ kind: 'levels' }] : [])],
    [images, hasLevels],
  );
  const [idx, setIdx] = useState(0);

  /* Щойно доданий скрін показуємо одразу — інакше людина вставила
     картинку й дивиться на графік, не розуміючи, чи вона взагалі
     додалась. */
  const [seen, setSeen] = useState(images.length);
  if (images.length !== seen) {
    if (images.length > seen) setIdx(images.length - 1);
    setSeen(images.length);
  }

  const cur = Math.min(idx, Math.max(slides.length - 1, 0));
  const slide = slides[cur];
  const go = (d) => setIdx((i) => (Math.min(i, slides.length - 1) + d + slides.length) % slides.length);

  const isLink = (v) => /^https?:\/\//i.test(String(v || '').trim());
  const onPaste = (e) => {
    if (!editing) return;
    const text = e.clipboardData.getData('text');
    if (isLink(text)) { e.preventDefault(); onLink(text.trim()); return; }
    const files = filesFromPaste(e);
    if (files.length) { e.preventDefault(); onFiles(files); }
  };
  const onDrop = (e) => {
    if (!editing) return;
    e.preventDefault();
    setHot(false);
    const files = imageFiles(e.dataTransfer.files);
    if (files.length) { onFiles(files); return; }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    if (isLink(url)) onLink(url.trim());
  };

  let n = 0;
  const tabLabel = (s) => (s.kind === 'levels' ? tx('Графік MT5', 'MT5 chart') : `${tx('Скрін', 'Shot')} ${(n += 1)}`);

  const chip = (on) => ({
    height: 30, padding: '0 12px', borderRadius: 8, fontFamily: T.sans, fontSize: 12.5, fontWeight: 700,
    background: on ? `rgba(${T.accRgb},0.14)` : 'transparent',
    border: `1px solid ${on ? T.lineAcc : 'transparent'}`, color: on ? T.acc : T.text3,
  });
  const tool = {
    height: 30, padding: '0 11px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
    fontFamily: T.sans, fontSize: 12.5, fontWeight: 700, background: T.bg, border: `1px solid ${T.line}`, color: T.text2,
  };
  const arrow = (side) => ({
    position: 'absolute', top: '50%', [side]: 10, transform: 'translateY(-50%)', zIndex: 5,
    width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center',
    background: 'rgba(10,10,14,.72)', border: `1px solid ${T.line}`, color: T.text, backdropFilter: 'blur(6px)',
  });

  const showBar = slides.length > 1 || editing;

  return (
    <div
      tabIndex={editing ? 0 : undefined}
      onPaste={onPaste}
      onDragOver={(e) => { if (editing) { e.preventDefault(); setHot(true); } }}
      onDragLeave={() => setHot(false)}
      onDrop={onDrop}
      className="flex flex-col gap-2 outline-none"
    >
      {showBar && (
        <div className="flex flex-wrap items-center gap-1.5">
          {slides.length > 1 && slides.map((s, i) => (
            <button key={s.kind === 'img' ? s.src : 'levels'} type="button" onClick={() => setIdx(i)} style={chip(i === cur)}>
              {tabLabel(s)}
            </button>
          ))}
          <div className="flex-1" />
          {editing && slide?.kind === 'img' && ownShots.includes(slide.src) && (
            <button type="button" onClick={() => onRemove(slide.src)} style={{ ...tool, color: T.bad }}>
              <Trash2 size={13} strokeWidth={2.3} /> {tx('Прибрати', 'Remove')}
            </button>
          )}
          {editing && (
            <button type="button" onClick={() => fileRef.current?.click()} style={tool}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={14} strokeWidth={2} style={{ color: T.acc }} />}
              {tx('Скрін', 'Screenshot')}
            </button>
          )}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-2xl"
        style={{ outline: hot ? `2px dashed ${T.acc}` : 'none', outlineOffset: 2 }}
      >
        {!slide ? (
          <div
            className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-2xl"
            style={{ background: T.bg, border: `1px ${editing ? 'dashed' : 'solid'} ${editing ? T.lineAcc : T.line}` }}
          >
            {editing ? (
              <>
                <ImagePlus size={22} strokeWidth={1.6} style={{ color: T.text4 }} />
                <span className="text-[14px]" style={{ color: T.text4, fontFamily: T.sans }}>
                  {tx('Ctrl+V, перетягни файл або натисни «Скрін» угорі', 'Ctrl+V, drop a file or press “Screenshot” above')}
                </span>
              </>
            ) : (
              <span className="text-[14.5px]" style={{ fontFamily: MONO, color: T.text4 }}>NO SCREENSHOTS</span>
            )}
          </div>
        ) : slide.kind === 'img' ? (
          <ImageSlider key={slide.src} images={[slide.src]} containerClassName="min-h-[420px] rounded-2xl" />
        ) : (
          <TradeLevels trade={trade} className="min-h-[420px]" />
        )}

        {slides.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} style={arrow('left')} aria-label={tx('Попередній', 'Previous')}>
              <ChevronLeft size={17} strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => go(1)} style={arrow('right')} aria-label={tx('Наступний', 'Next')}>
              <ChevronRight size={17} strokeWidth={2.4} />
            </button>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { onFiles(imageFiles(e.target.files)); e.target.value = ''; }}
      />
    </div>
  );
}

export default function TradeDetailsModal({
  trade, accountsMap = {}, onClose, onDeleted, onUpdated,
  /* сумісність зі старим API */
  onDeleteClick, onUpdateTrade,
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [d, setD] = useState(trade);
  const [processOpen, setProcessOpen] = useState(false);
  const [psyOpen, setPsyOpen] = useState(false);

  /* Розбір помилки — те саме, що у формі запису: категорії, актив,
     посилання. Драфт лежить у стані й летить у журнал разом зі
     збереженням угоди, щоб опис в угоді й опис у журналі не
     розʼїхались. */
  const [composerOpen, setComposerOpen] = useState(false);
  const [errDraft, setErrDraft] = useState(null);
  const [errForm, setErrForm] = useState({
    pair: '', desc: '', tvLink: '', reasons: [], cats: [],
  });

  useEffect(() => {
    setD(trade);
    setEditing(false);
    setComposerOpen(false);
    setErrDraft(null);
    setProcessOpen(false);
    setPsyOpen(false);
    if (!trade?.id) return;
    fetchErrorForTrade(user?.id, trade.id)
      .then((e) => { if (e) setErrDraft({ cats: e.cats, tvLink: e.tvLink || '', reasons: e.reasons || [], pair: e.pair }); })
      .catch(() => {});
  }, [trade, user?.id]);

  const set = (patch) => setD((p) => ({ ...p, ...patch }));

  /* Акаунти — з балансом і статусом: список для перемикача (лише
     активні + той, що вже стоїть в угоді) і баланс для профіту, щоб
     при зміні акаунта долари перерахувались одразу. */
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    let alive = true;
    onlyMine(supabase.from('prop_accounts').select('id, firm_name, balance, status'))
      .then(({ data }) => { if (alive && Array.isArray(data)) setAccounts(data); });
    return () => { alive = false; };
  }, []);
  const balances = useMemo(
    () => ({ ...accountsMap, ...Object.fromEntries(accounts.map((a) => [a.firm_name, Number(a.balance) || 0])) }),
    [accountsMap, accounts],
  );
  const accountOptions = useMemo(
    () => accounts.filter((a) => a.status !== 'Closed' || a.firm_name === trade?.account_name),
    [accounts, trade?.account_name],
  );

  /* План дня: undefined — ще вантажиться, null — плану немає. */
  const [plan, setPlan] = useState(undefined);
  useEffect(() => {
    let alive = true;
    if (!user?.id || !trade?.plan_date || !trade?.plan_pair) { setPlan(null); return undefined; }
    setPlan(undefined);
    supabase.from('trading_plans').select('id, date, pair, narrative, plan_data')
      .eq('user_id', user.id).eq('date', trade.plan_date).eq('pair', trade.plan_pair)
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data, error }) => { if (alive) setPlan(error ? null : (data?.[0] || null)); });
    return () => { alive = false; };
  }, [user?.id, trade?.plan_date, trade?.plan_pair]);
  const openPlan = () => { onClose(); navigate(withSandbox(`/plan/${d.plan_date}/${encodeURIComponent(d.plan_pair)}`)); };

  /* Поділитись — один клік: відкриваємо доступ (is_public) і одразу
     кладемо посилання в буфер. Сторінка /shared/trade/:id показує
     угоду без акаунта й доларів. У демо даних у справжній базі нема,
     тож посилання там нікуди б не вело — кажемо про це прямо. */
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  async function share() {
    if (inSandbox()) {
      notify.error(isSharedView() ? 'Лише перегляд' : 'Недоступно в демо', isSharedView() ? 'Це чужий журнал — поділитись угодою може лише власник.' : 'Поділитись угодою можна у своєму журналі після реєстрації.');
      return;
    }
    if (!d?.id || sharing) return;
    setSharing(true);
    try {
      if (!d.is_public) {
        const { error } = await supabase.from('trades').update({ is_public: true }).eq('id', d.id).eq('user_id', user?.id);
        if (error) throw error;
        setD((p) => ({ ...p, is_public: true }));
      }
      await navigator.clipboard.writeText(`${window.location.origin}/shared/trade/${d.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      notify.success('Лінк скопійовано', 'Угоду відкрито для перегляду за посиланням.');
    } catch (err) {
      notify.error('Не вдалось поділитись', err.message);
    } finally {
      setSharing(false);
    }
  }

  /* TDA в посиланні.

     За замовчуванням вимкнено: людина ділиться однією угодою, а не
     всією підготовкою дня. При вмиканні кладемо в угоду ЗНІМОК блоків
     замість посилання на план — інакше довелось би відкрити анонові
     весь рядок плану, включно з тим, чим людина не ділилась.

     Знімок означає, що пізніші правки розбору в посилання не
     доїдуть. Це радше плюс: поділився — зафіксував. Щоб оновити,
     досить вимкнути й увімкнути. */
  const tdaBlocks = useMemo(() => {
    const list = plan?.plan_data?.tdaBlocks;
    return Array.isArray(list) ? list.filter((b) => b?.image || b?.text?.trim()) : [];
  }, [plan]);

  /* У знімок їде не тільки сітка графіків, а й стратегія з апдейтами:
     без них розбір читається як набір скрінів без висновку. */
  const tdaSnapshot = useMemo(() => ({
    blocks: tdaBlocks,
    planText: plan?.plan_data?.planText?.trim() || '',
    narrative: plan?.narrative || '',
    updates: (plan?.plan_data?.updates || []).filter((u) => u?.image || u?.text?.trim()),
  }), [tdaBlocks, plan]);

  /* Знімок оновлюється сам, поки ділитись увімкнено.

     Спершу він був «зроблено раз і назавжди»: поділився — зафіксував.
     На практиці це означало, що дописаний після публікації апдейт у
     посилання не доїжджав, і єдиний спосіб його туди додати — вимкнути
     кнопку й увімкнути назад. Ніхто цього не вгадає. Тож поки розбір
     відкритий, посилання показує те, що в плані зараз. */
  useEffect(() => {
    if (!d?.id || !d.share_tda || !plan) return;
    if (JSON.stringify(d.shared_tda) === JSON.stringify(tdaSnapshot)) return;
    supabase.from('trades').update({ shared_tda: tdaSnapshot })
      .eq('id', d.id).eq('user_id', user?.id)
      .then(({ error }) => { if (!error) setD((p) => ({ ...p, shared_tda: tdaSnapshot })); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id, d?.share_tda, plan, tdaSnapshot]);

  const hasPlanToShare = tdaSnapshot.blocks.length > 0
    || Boolean(tdaSnapshot.planText)
    || tdaSnapshot.updates.length > 0;

  const [tdaBusy, setTdaBusy] = useState(false);
  const [tdaHint, setTdaHint] = useState(false);
  async function toggleTda() {
    if (!d?.id || tdaBusy) return;
    if (inSandbox()) {
      notify.error(isSharedView() ? 'Лише перегляд' : 'Недоступно в демо', isSharedView() ? 'Це чужий журнал — змінювати його може лише власник.' : 'Спробуй у своєму журналі після реєстрації.');
      return;
    }
    const next = !d.share_tda;
    setTdaBusy(true);
    try {
      const patch = { share_tda: next, shared_tda: next ? tdaSnapshot : null };
      const { error } = await supabase.from('trades').update(patch).eq('id', d.id).eq('user_id', user?.id);
      if (error) throw error;
      setD((p) => ({ ...p, ...patch }));
      notify.success(
        next ? 'Розбір у посиланні' : 'Розбір приховано',
        next ? 'Хто відкриє лінк, побачить твій TDA за цей день.' : 'За посиланням лишилась тільки сама угода.',
      );
    } catch (err) {
      notify.error('Не вдалось змінити', err.message);
    } finally {
      setTdaBusy(false);
    }
  }

  /* Скріни угоди й скріни помилки — разом, угода першою.

     Раніше показувався лише один набір: якщо в угоди були скріни
     помилки, власний скрін графіка не було видно зовсім. Для угод з
     MT5 це стало помітно, щойно туди дозволили додавати скрін: людина
     вставляла картинку, зберігала — і не бачила її. */
  const tradeShots = useMemo(() => {
    if (Array.isArray(d?.trade_images) && d.trade_images.length) return d.trade_images;
    return d?.trade_image ? [d.trade_image] : [];
  }, [d?.trade_images, d?.trade_image]);

  const images = useMemo(() => {
    const mistakes = Array.isArray(d?.mistake_images) && d.mistake_images.length
      ? d.mistake_images
      : d?.mistake_image ? [d.mistake_image] : [];
    return [...new Set([...tradeShots, ...mistakes])];
  }, [tradeShots, d?.mistake_images, d?.mistake_image]);

  /* Скріни угоди в режимі редагування. Той самий хук, що у формі
     «Add trade»: файл стискається й іде в сховище, у запис лягає
     посилання. Функціональний setter — бо хук підмінює локальне
     blob-прев'ю на справжню адресу, коли файл доїде. */
  const attach = useImageAttach({ folder: `trade-${trade?.id || 'loose'}` });
  const setShots = (updater) => setD((p) => {
    const cur = Array.isArray(p?.trade_images) && p.trade_images.length
      ? p.trade_images
      : p?.trade_image ? [p.trade_image] : [];
    const next = typeof updater === 'function' ? updater(cur) : updater;
    return { ...p, trade_images: next.length ? next : null, trade_image: next[0] || null };
  });

  /* Схему малюємо тільки коли є з чого: сам лише вхід без стопа й
     тейка — це одна лінія посеред порожнечі, гірша за чесне «немає
     скріншотів». */
  const hasLevels = useMemo(() => {
    const n = (v) => Number.isFinite(Number(v)) && Number(v) !== 0;
    return n(d?.entry_price) && (n(d?.sl_price) || n(d?.tp_price) || n(d?.exit_price));
  }, [d?.entry_price, d?.sl_price, d?.tp_price, d?.exit_price]);

  const profit = useMemo(() => {
    const rr = parseFloat(d?.rr);
    if (isNaN(rr)) return null;
    const s = String(d?.risk || '').trim();
    let riskValue = 0;
    if (s.includes('$')) riskValue = parseFloat(s.replace(/[^0-9.]/g, ''));
    else if (s.includes('%')) riskValue = (balances[d.account_name] || 0) * (parseFloat(s.replace(/[^0-9.]/g, '')) / 100);
    else {
      const v = parseFloat(s);
      if (!isNaN(v)) riskValue = v <= 10 ? (balances[d.account_name] || 0) * (v / 100) : v;
    }
    return riskValue > 0 ? riskValue * rr : null;
  }, [d, balances]);

  /* Скільки це в грошах. «1%» саме по собі нічого не каже — ризик стає
     відчутним тільки коли видно суму, якою платиш за помилку. Рахуємо
     тією ж логікою, що й профіт вище: відсоток від балансу акаунта, а
     число з «$» беремо як є. */
  const riskMoney = useMemo(() => {
    const s = String(d?.risk || '').trim();
    if (!s) return null;
    const bal = balances[d?.account_name] || 0;
    const num = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(num) || num <= 0) return null;
    if (s.includes('$')) return num;
    if (s.includes('%')) return bal ? bal * (num / 100) : null;
    /* Голе число: до 10 — це відсотки, більше — уже сума. */
    return num <= 10 ? (bal ? bal * (num / 100) : null) : num;
  }, [d?.risk, d?.account_name, balances]);

  const riskMoneyLabel = riskMoney != null
    ? `$${Math.round(riskMoney).toLocaleString('en-US')}`
    : null;

  async function save() {
    if (attach.busy) {
      notify.error(tx('Скрін ще вантажиться', 'Screenshot is still uploading'), tx('Секунду — і можна зберігати.', 'One sec and you can save.'));
      return;
    }
    setSaving(true);
    try {
      /* d могло прийти зі списку, де рядки доповнені обчисленими
         полями для відображення (напр. _profit у таблиці угод) —
         такого стовпця в БД нема, і update з ним падає з помилкою
         schema cache. Відсікаємо все, що починається з «_». */
      const { id, ...rest } = d;
      const payload = Object.fromEntries(Object.entries(rest).filter(([k]) => !k.startsWith('_')));
      let { error } = await supabase.from('trades').update(payload).eq('id', id);
      /* date_edited зʼявляється з міграцією 2026-09-30. Якщо її ще не
         запустили, не губимо решту правок через одну колонку: дата
         збережеться, просто синхронізація MT5 зможе її перезаписати. */
      if (error && /date_edited/.test(error.message || '')) {
        const { date_edited: _skip, ...rest2 } = payload;
        ({ error } = await supabase.from('trades').update(rest2).eq('id', id));
      }
      if (error) throw error;

      /* Дзеркало в журналі помилок. Досі його тут не було зовсім:
         правка опису помилки в картці угоди нікуди не доїжджала, і
         в журналі лишалась перша версія тексту. Два джерела правди
         на одну помилку — найшвидший спосіб перестати вірити
         обом. */
      try {
        await syncErrorFromTrade(user?.id, { ...payload, id }, errDraft);
      } catch (e) {
        console.error('sync error log', e);
      }

      notify.success('Saved', 'Trade changes recorded.');
      setEditing(false);
      onUpdated?.(d);
      onUpdateTrade?.(d);
    } catch (err) {
      notify.error('Failed to save', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      /* Через спільний tradesStore, а не запитом тут.

         Раніше це був прямий delete по id — і він не ставив
         надгробок, тож імпортована угода, видалена з картки,
         поверталась наступною синхронізацією. З таблиці та сама
         угода видалялась назавжди. Один і той самий кошик поводився
         по-різному залежно від того, звідки його натиснули. */
      await deleteTrade(d, user?.id);
      notify.success('Deleted', 'Trade removed from journal.');
      onDeleted?.(d.id);
      onDeleteClick?.(d.id);
      if (!onDeleted && !onDeleteClick) onClose();
    } catch (err) {
      notify.error('Error', err.message);
    }
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      /* Порядок шарів згори вниз: розбір → підтвердження
         видалення → сама картка. */
      if (e.key === 'Escape') {
        if (composerOpen) setComposerOpen(false);
        else if (confirmDel) setConfirmDel(false);
        else onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && editing) { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }); // навмисно без масиву: хендлер має бачити свіжий d/editing

  if (!d) return null;

  const res = RESULT_OPTS.find((r) => r.value.toLowerCase() === d.result?.trim().toLowerCase());
  const rr = parseFloat(d.rr);
  const rrColor = isNaN(rr) ? T.text4 : rr > 0 ? T.ok : rr < 0 ? T.bad : T.text3;
  const isLong = d.type === 'Long';
  const resultMap = Object.fromEntries(RESULT_OPTS.map((r) => [r.value, r]));
  const resultLabelMap = Object.fromEntries(RESULT_OPTS.map((r) => [r.value, r.label]));
  const typeMap = { Long: { c: T.ok, rgb: T.okRgb }, Short: { c: T.bad, rgb: T.badRgb } };

  const rrDisplay = isNaN(rr) ? '—' : `${rr > 0 ? '+' : ''}${rr}R`;
  const profitDisplay = profit === null ? '—' : `${profit > 0 ? '+' : profit < 0 ? '−' : ''}$${Math.abs(profit).toFixed(2)}`;
  const profitColor = profit === null ? T.text4 : profit > 0 ? T.ok : profit < 0 ? T.bad : T.text3;

  /* Дисципліна — той самий чекліст, що й «Процес», але зведений в
     оцінку для стрічки цифр: скільки з трьох пунктів пройдено без
     відхилень. */
  const processItems = [
    { key: 'followed_plan', label: 'Followed the plan', invert: false, value: !!d.followed_plan },
    { key: 'has_mistake', label: 'Analysis mistake', invert: true, value: !!d.has_mistake },
    { key: 'rushed', label: 'Rushed / FOMO', invert: true, value: !!d.rushed },
  ].map((p) => ({ ...p, ok: p.invert ? !p.value : p.value }));
  const okCount = processItems.filter((p) => p.ok).length;
  const deviations = processItems.filter((p) => !p.ok);
  const clean = deviations.length === 0;
  const disciplineColor = clean ? T.ok : T.warn;

  const psyItems = [
    { key: 'psy_confident', label: 'Confidence', invert: false, value: !!d.psy_confident },
    { key: 'psy_fear', label: 'Fear', invert: true, value: !!d.psy_fear },
    { key: 'psy_repeat', label: 'Re-entry', invert: true, value: !!d.psy_repeat },
    { key: 'psy_revenge', label: 'Revenge trading', invert: true, value: !!d.psy_revenge },
  ].map((p) => ({ ...p, ok: p.invert ? !p.value : p.value }));

  const psyExpanded = editing || psyOpen;

  const timeRange = d.entry_time && d.exit_time ? `${d.entry_time.slice(0, 5)}–${d.exit_time.slice(0, 5)}` : null;

  const body = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-x-hidden overflow-y-auto p-3 sm:p-6"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(14px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(4px)' }}
        transition={SPRING_UI}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[1180px] overflow-hidden rounded-[18px] 2xl:max-w-[1420px]"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 50px 100px rgba(0,0,0,0.85)' }}
      >
        {/* ---------- ШАПКА ---------- */}
        {/* Хрестик закриття винесений з групи дій в окремий верхній
            рядок разом з іконкою й назвою: коли «Поділитись»/Edit не
            влазили й переносились нижче, X переносився разом з ними
            і опинявся зліва посеред картки, а не там, де його шукає
            рука — у правому верхньому куті. Тепер він завжди на
            першому рядку, праворуч, незалежно від того, скільки
            вторинних кнопок пішло на рядок нижче. */}
        <header className="flex flex-col gap-2 px-4 py-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
          <div className="flex items-start gap-3">
            <div
              className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl"
              style={{
                background: isLong ? `rgba(${T.okRgb},0.09)` : `rgba(${T.badRgb},0.09)`,
                border: `1px solid ${isLong ? `rgba(${T.okRgb},0.22)` : `rgba(${T.badRgb},0.22)`}`,
              }}
            >
              {isLong
                ? <ArrowUpRight size={17} strokeWidth={2.4} style={{ color: T.ok }} />
                : <ArrowDownRight size={17} strokeWidth={2.4} style={{ color: T.bad }} />}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="truncate text-[23.5px] font-semibold leading-none" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                  {d.plan_pair || 'Trade'}
                </h2>
                {res && (
                  <span
                    className="rounded-md px-2.5 py-[3px] text-[11.5px] font-bold uppercase tracking-[0.1em]"
                    style={{ background: `rgba(${res.rgb},0.09)`, border: `1px solid rgba(${res.rgb},0.24)`, color: res.c, fontFamily: MONO }}
                  >
                    {res.label}
                  </span>
                )}
                <span className="rounded-md px-2.5 py-[3px] text-[11.5px] tracking-[0.08em]" style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text3, fontFamily: MONO }}>
                  {(d.type || '—').toUpperCase()}{d.session ? ` · ${d.session}` : ''}
                </span>
              </div>
              {editing ? (
                /* Дату можна виправити, зокрема в угоді з MT5: термінал
                   пише дату входу, а людина часто веде угоду за днем
                   плану. Позначка date_edited каже базі не повертати
                   стару дату наступною синхронізацією. */
                <div className="flex items-center gap-2.5 pt-1">
                  <div style={{ width: 170 }}>
                    <DateField
                      value={String(d.plan_date || '').slice(0, 10)}
                      onChange={(v) => v && set({ plan_date: v, date_edited: true })}
                      alwaysNumeric
                      height={32}
                      fontSize={13.5}
                      z={1200}
                    />
                  </div>
                  {timeRange ? <span className="text-[13.5px]" style={{ fontFamily: MONO, color: T.text4 }}>{timeRange}</span> : null}
                </div>
              ) : (
                <span className="text-[13.5px]" style={{ fontFamily: MONO, color: T.text4 }}>
                  {d.plan_date}{timeRange ? ` · ${timeRange}` : ''}
                </span>
              )}
            </div>

            <motion.button
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_TAP}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg transition-colors"
              style={{ background: 'transparent', color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text4; }}
            >
              <X size={16} strokeWidth={2.3} />
            </motion.button>
          </div>

          {/* У журналі за посиланням кнопки власника (поділитись, TDA,
              Edit) не показуємо зовсім. Раніше вони були, а натискання
              закінчувалось «лише перегляд» — гість бачив кнопку, яка
              ніколи не спрацює. */}
          {!isSharedView() && (
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              onClick={share}
              disabled={sharing}
              title="Поділитись: скопіювати посилання на угоду"
              whileTap={{ scale: 0.95 }}
              transition={SPRING_TAP}
              className="flex h-[34px] items-center gap-2 rounded-lg px-3 text-[14.5px] font-semibold transition-colors"
              style={{
                background: copied ? `rgba(${T.okRgb},0.12)` : T.bg,
                border: `1px solid ${copied ? `rgba(${T.okRgb},0.35)` : T.line}`,
                color: copied ? T.ok : T.text2,
                fontFamily: T.sans,
              }}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.borderColor = T.line; }}
            >
              {sharing ? <Loader2 size={13} className="animate-spin" /> : copied ? <Check size={13} strokeWidth={2.8} /> : <Share2 size={13} strokeWidth={2.4} />}
              {copied ? 'Скопійовано' : 'Поділитись'}
            </motion.button>

            {/* Іконка без підпису: дія рідкісна й другорядна поруч із
                «Поділитись». Що вона робить — каже підказка при
                наведенні, своя, бо системний title спливає аж через
                секунду й у чужому стилі. */}
            {hasPlanToShare && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => setTdaHint(true)}
                onMouseLeave={() => setTdaHint(false)}
              >
                <motion.button
                  onClick={toggleTda}
                  disabled={tdaBusy}
                  whileTap={{ scale: 0.95 }}
                  transition={SPRING_TAP}
                  aria-label={d.share_tda ? 'Прибрати розбір дня з посилання' : 'Показати розбір дня за посиланням'}
                  className="grid h-[34px] w-[34px] place-items-center rounded-lg transition-colors"
                  style={{
                    background: d.share_tda ? `rgba(${T.accRgb},0.12)` : T.bg,
                    border: `1px solid ${d.share_tda ? T.lineAcc : T.line}`,
                    color: d.share_tda ? T.acc : T.text3,
                  }}
                >
                  {tdaBusy
                    ? <Loader2 size={14} className="animate-spin" />
                    : d.share_tda ? <Eye size={14} strokeWidth={2.3} /> : <EyeOff size={14} strokeWidth={2.3} />}
                </motion.button>

                <AnimatePresence>
                  {tdaHint && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.14 }}
                      className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-50 w-[220px] rounded-xl px-3 py-2.5 text-left"
                      style={{
                        background: T.surfaceHi,
                        border: `1px solid ${T.lineHi}`,
                        boxShadow: '0 16px 36px -14px rgba(0,0,0,0.9)',
                      }}
                    >
                      <div className="text-[12.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                        {d.share_tda ? 'Розбір дня видно за посиланням' : 'Розбір дня приховано'}
                      </div>
                      <div className="mt-1 text-[12px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.5 }}>
                        {d.share_tda
                          ? 'Натисни, щоб лишити в лінку тільки саму угоду.'
                          : `Натисни, щоб додати в лінк підготовку за цей день: графіки, стратегію, апдейти.`}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}


            {editing && (
              <motion.button
                onClick={() => { setD(trade); setEditing(false); }}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="h-[34px] rounded-lg px-3 text-[14.5px] font-semibold transition-colors"
                style={{ color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                Cancel
              </motion.button>
            )}

            {editing ? (
              <motion.button
                onClick={save}
                disabled={saving}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="flex h-[34px] items-center gap-2 rounded-lg px-4 text-[14.5px] font-bold"
                style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2.6} />}
                Save
              </motion.button>
            ) : (
              <motion.button
                onClick={() => setEditing(true)}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="flex h-[34px] items-center gap-2 rounded-lg px-3.5 text-[14.5px] font-semibold transition-colors"
                style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                <Pencil size={13} strokeWidth={2.4} /> Edit
              </motion.button>
            )}
          </div>
          )}
        </header>

        {/* ---------- СТРІЧКА ЦИФР ---------- */}
        {/* У режимі редагування R, ризик і акаунт правляться прямо тут —
            профіт поруч перераховується наживо. */}
        {/* П'ять колонок стояли на flex:1 з min-w-0 — flex-basis:0 разом
            із min-width:0 дозволяє стискатись хоч до нуля, тому ряд
            ніколи не переносився сам: на 320px усі пʼять стовпців і
            чотири розділювачі просто напливали одне на одне замість
            того, щоб піти в два-три рядки. min-w-[128px] на мобільному
            задає підлогу, нижче якої стискатись нікуди, крім переносу. */}
        <div className="flex flex-wrap items-stretch px-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div className="flex min-w-[128px] flex-col gap-1.5 py-3.5 sm:min-w-0" style={{ flex: 1 }}>
            <Eyebrow>R</Eyebrow>
            {editing ? (
              <StripInput value={d.rr ?? ''} onChange={(v) => set({ rr: v.replace(',', '.') })} placeholder="2.5" suffix="R" color={rrColor} />
            ) : (
              <span className="truncate text-[21.5px] font-bold tabular-nums" style={{ fontFamily: MONO, color: rrColor }}>{rrDisplay}</span>
            )}
          </div>

          <div className="my-2.5 hidden w-px shrink-0 sm:mx-5 sm:block" style={{ background: T.line }} />
          <div className="flex min-w-[128px] flex-col gap-1.5 py-3.5 sm:min-w-0" style={{ flex: 1 }}>
            <Eyebrow>PROFIT</Eyebrow>
            <span className={`truncate font-bold tabular-nums ${editing ? 'pt-1.5 text-[19px]' : 'text-[21.5px]'}`} style={{ fontFamily: MONO, color: profitColor }}>
              {profitDisplay}
            </span>
          </div>

          <div className="my-2.5 hidden w-px shrink-0 sm:mx-5 sm:block" style={{ background: T.line }} />
          <div className="flex min-w-[128px] flex-col gap-1.5 py-3.5 sm:min-w-0" style={{ flex: editing ? 1.7 : 1 }}>
            <Eyebrow tone={editing ? T.acc : undefined}>RISK</Eyebrow>
            {editing ? (
              /* Ризик — єдине поле тут, ціна помилки в якому вимірюється
                 грішми, тому воно й виглядає інакше за сусідів: власне
                 значення стоїть першим і великим, пресети — поруч як
                 швидкий набір, а під ними сума, якою платиш. */
              <div className="flex flex-col gap-1.5">
                <div
                  className="flex h-[38px] w-fit max-w-full items-center gap-1 rounded-[10px] p-[3px]"
                  style={{
                    background: `rgba(${T.accRgb},0.07)`,
                    border: `1px solid rgba(${T.accRgb},0.34)`,
                    boxShadow: `0 0 0 3px rgba(${T.accRgb},0.07)`,
                  }}
                >
                  <label
                    className="flex h-full items-center gap-0.5 rounded-[7px] pl-2.5 pr-2"
                    style={{ background: T.sunken, cursor: 'text' }}
                  >
                    <input
                      value={String(d.risk ?? '').replace('%', '')}
                      onChange={(e) => {
                        const v = e.target.value.replace(',', '.').replace(/[^0-9.$]/g, '');
                        set({ risk: v === '' ? '' : v.includes('$') ? v : `${v}%` });
                      }}
                      placeholder="—"
                      inputMode="decimal"
                      className="w-[42px] bg-transparent text-right text-[17px] font-bold tabular-nums outline-none"
                      style={{ fontFamily: MONO, color: T.acc }}
                    />
                    {!String(d.risk ?? '').includes('$') && (
                      <span className="text-[13px] font-bold" style={{ fontFamily: MONO, color: T.acc, opacity: 0.6 }}>%</span>
                    )}
                  </label>

                  <span className="mx-0.5 h-4 w-px shrink-0" style={{ background: `rgba(${T.accRgb},0.24)` }} />

                  {RISK_PRESETS.map((r) => {
                    const on = String(d.risk || '').replace(/\s/g, '') === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => set({ risk: r })}
                        className="h-full rounded-[7px] px-2 text-[13px] font-semibold tabular-nums transition-colors"
                        style={{
                          fontFamily: MONO,
                          background: on ? `rgba(${T.accRgb},0.22)` : 'transparent',
                          color: on ? T.acc : T.text3,
                        }}
                        onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`; e.currentTarget.style.color = T.text2; } }}
                        onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
                      >
                        {r.replace('%', '')}
                      </button>
                    );
                  })}
                </div>

                {/* Підказка каже саме те, чого бракує: без ризику — одне,
                    без балансу акаунта — інше. Спільне «обери акаунт»
                    брехало б у половині випадків. */}
                <span className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: MONO, color: riskMoneyLabel ? T.text2 : T.text4 }}>
                  {riskMoneyLabel
                    ? `${riskMoneyLabel} на угоду`
                    : String(d.risk ?? '').trim()
                      ? 'у акаунта немає балансу'
                      : 'вкажи ризик'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <span className="truncate text-[21.5px] font-bold tabular-nums" style={{ fontFamily: MONO, color: T.text2 }}>{d.risk || '—'}</span>
                {riskMoneyLabel && (
                  <span className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: MONO, color: T.text4 }}>
                    {riskMoneyLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="my-2.5 hidden w-px shrink-0 sm:mx-5 sm:block" style={{ background: T.line }} />
          <div className="flex min-w-[128px] flex-col gap-1.5 py-3.5 sm:min-w-0" style={{ flex: 1.4 }}>
            <Eyebrow>ACCOUNT</Eyebrow>
            {editing ? (
              <AccountSelect value={d.account_name} options={accountOptions} onChange={(v) => set({ account_name: v })} />
            ) : (
              <span className="truncate pt-0.5 text-[16px] font-bold" style={{ fontFamily: MONO, color: T.text3 }}>{d.account_name || '—'}</span>
            )}
          </div>

          <div className="my-2.5 hidden w-px shrink-0 sm:mx-5 sm:block" style={{ background: T.line }} />
          <div className="flex min-w-[128px] flex-col gap-1.5 py-3.5 sm:min-w-0" style={{ flex: 1 }}>
            <Eyebrow>DISCIPLINE</Eyebrow>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[21.5px] font-bold tabular-nums" style={{ fontFamily: MONO, color: disciplineColor }}>
                {okCount}/{processItems.length}
              </span>
              <div className="flex items-center gap-[3px]">
                {processItems.map((p) => (
                  <div key={p.key} className="h-3.5 w-[5px] rounded-full" style={{ background: p.ok ? T.ok : T.bad }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ---------- ТІЛО: зліва скрін+опис, справа деталі ---------- */}
        {/* layout — при вході в редагування текст миттю змінюється на
            інпути різної висоти (Процес/Психологія розкриваються теж).
            Без layout уся картка стрибала б стрибком; з layout Framer
            плавно донормовує розмір, і елемент під курсором нікуди не
            «тікає».
            flex-col замість grid до lg: у CSS Grid порожня колонка за
            замовчуванням рахується по max-content вмісту, і будь-який
            рядок усередині, що не переноситься (напр. шапка графіка
            TradeLevels), розтягував усю картку ширше за екран і робив
            сторінку горизонтально скролящейся. Flexbox так не робить —
            діти просто займають 100% ширини контейнера. */}
        <motion.div layout transition={SPRING_UI} className="flex flex-col lg:grid lg:grid-cols-[1.55fr_1fr]">
          {/* ЛІВА КОЛОНКА */}
          <motion.div layout transition={SPRING_UI} className="flex min-w-0 flex-col gap-3 p-5" style={{ borderRight: `1px solid ${T.line}` }}>
            <TradeMedia
              trade={d}
              images={images}
              ownShots={tradeShots}
              hasLevels={hasLevels}
              editing={editing}
              busy={attach.busy}
              onFiles={(files) => attach.addToList(files, setShots)}
              onLink={(url) => setShots((p) => [...p, url])}
              onRemove={(src) => setShots((p) => p.filter((x) => x !== src))}
            />

            <div className="rounded-xl p-4" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
              <Eyebrow>TRADE DESCRIPTION</Eyebrow>
              <div className="mt-2">
                <Editable editing={editing} value={d.trade_description} onChange={(v) => set({ trade_description: v })} placeholder="No description" />
              </div>
            </div>

            <PlanPanel plan={plan} pair={d.plan_pair} date={d.plan_date} onOpen={openPlan} />
          </motion.div>

          {/* ПРАВА КОЛОНКА — довідка й чеклісти */}
          <motion.div layout transition={SPRING_UI} className="flex min-w-0 flex-col gap-3 p-5">
            {/* Параметри. Пілюльні групи (Напрямок/Сесія/Результат) —
                кожна на свій повний рядок: у половині картки «New
                York» переносилась окремо й ламала висоту рядка.
                Вузькі поля (час, R, ризик) лишились по двоє в рядку. */}
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
              <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                {[
                  { label: 'ENTRY', field: 'entry_time' },
                  { label: 'EXIT', field: 'exit_time' },
                ].map((p, i) => (
                  <div
                    key={p.label}
                    className="flex flex-col gap-1.5 px-3.5 py-3"
                    style={{ borderRight: i === 0 ? `1px solid ${T.line}` : 'none' }}
                  >
                    <Eyebrow>{p.label}</Eyebrow>
                    {editing ? (
                      <TimeField value={d[p.field]} onChange={(v) => set({ [p.field]: v })} />
                    ) : (
                      <span className="text-[15.5px] font-semibold" style={{ fontFamily: MONO, color: T.text2 }}>
                        {d[p.field] ? d[p.field].slice(0, 5) : '—'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>DIRECTION</Eyebrow>
                <PillGroup groupId="type" editing={editing} options={TYPES} value={d.type} onChange={(v) => set({ type: v })} colorMap={typeMap} />
              </div>

              <div className="flex flex-col gap-2 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>SESSION</Eyebrow>
                <PillGroup groupId="session" editing={editing} options={SESSIONS} value={d.session} onChange={(v) => set({ session: v })} colorMap={SESSION_COLORS} />
              </div>

              {/* Як саме закрилась позиція. Приходить із термінала й
                  редагуванню не підлягає: це факт від брокера, а не
                  твоя оцінка. Показуємо лише коли він є — у ручних
                  угодах цього поля немає, і порожній рядок «—» тут
                  читався б як «невідомо чому», хоча питання просто не
                  ставилось.

                  Різниця між «взяв тейк» і «закрив руками в тому ж
                  місці» — саме те, заради чого ведуть журнал: за
                  грошима це одна угода, за дисципліною різні. */}
              {EXIT_REASON[d.exit_reason] && (
                <div className="flex items-center justify-between gap-3 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <Eyebrow>ВИХІД</Eyebrow>
                  <span
                    className="rounded-md px-2 py-1 text-[12.5px] font-bold"
                    style={{
                      fontFamily: T.sans,
                      color: EXIT_REASON[d.exit_reason].color,
                      background: `rgba(${EXIT_REASON[d.exit_reason].rgb},0.12)`,
                      border: `1px solid rgba(${EXIT_REASON[d.exit_reason].rgb},0.28)`,
                    }}
                  >
                    {EXIT_REASON[d.exit_reason].label}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2 px-3.5 py-3">
                <Eyebrow>RESULT</Eyebrow>
                <PillGroup groupId="result" editing={editing} options={RESULT_OPTS.map((r) => r.value)} value={d.result} onChange={(v) => set({ result: v })} colorMap={resultMap} labelMap={resultLabelMap} />
              </div>

            </div>

            {/* Процес — за замовчуванням тільки відхилення, решта за кліком */}
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${clean ? T.line : `rgba(${T.badRgb},0.22)`}`, background: T.bg }}>
              <div className="flex items-center gap-2.5 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <div
                  className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md"
                  style={{ background: clean ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.11)`, color: clean ? T.ok : T.bad }}
                >
                  {clean ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={2.6} />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>Process</span>
                  <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>Execution discipline</span>
                </div>
                <span className="text-[12.5px] font-semibold" style={{ fontFamily: MONO, color: clean ? T.ok : T.bad }}>
                  {clean ? 'clean' : `${deviations.length} deviation${deviations.length === 1 ? '' : 's'}`}
                </span>
              </div>

              {/* Редагування: один стабільний список у фіксованому
                  порядку — жоден пункт не переїжджає між «відхилення»
                  і «решта» просто від того, що ти клацнув по ньому.
                  Перегляд: розумне розкриття — спершу тільки
                  відхилення, решта за кліком. */}
              {editing ? (
                processItems.map((p, i) => (
                  <div
                    key={p.key}
                    className="flex items-center gap-2.5 px-3.5 py-2.5"
                    style={{ borderBottom: i < processItems.length - 1 ? `1px solid ${T.line}` : 'none' }}
                  >
                    <span className="flex-1 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>{p.label}</span>
                    <YesNo editing value={p.value} invert={p.invert} onChange={(v) => set({ [p.key]: v })} />
                  </div>
                ))
              ) : (
                <>
                  {deviations.map((p) => (
                    <div
                      key={p.key}
                      className="flex items-center gap-2.5 px-3.5 py-2.5"
                      style={{ borderBottom: `1px solid ${T.line}`, background: `rgba(${T.badRgb},0.035)` }}
                    >
                      <div className="h-1 w-1 shrink-0 rounded-full" style={{ background: T.bad }} />
                      <span className="flex-1 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>{p.label}</span>
                      <YesNo editing={false} value={p.value} invert={p.invert} onChange={() => {}} />
                    </div>
                  ))}

                  <button
                    onClick={() => setProcessOpen((v) => !v)}
                    className="flex w-full items-center gap-2 px-3.5 py-2 transition-colors"
                    style={{ background: 'transparent' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.sunken)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="flex-1" />
                    <Check size={12} strokeWidth={3} style={{ color: T.ok }} />
                    <motion.span animate={{ rotate: processOpen ? 180 : 0 }} transition={SPRING_TAP}>
                      <ChevronDown size={13} strokeWidth={2.4} style={{ color: T.text4 }} />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {processOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={SPRING_UI}
                        className="overflow-hidden"
                        style={{ borderTop: `1px solid ${T.line}` }}
                      >
                        {processItems.filter((p) => p.ok).map((p, i) => (
                          <div key={p.key} className="flex items-center gap-2.5 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${T.line}` : 'none' }}>
                            <span className="flex-1 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{p.label}</span>
                            <YesNo editing={false} value={p.value} invert={p.invert} onChange={() => {}} />
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Розбір помилки */}
            <AnimatePresence initial={false}>
              {d.has_mistake && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING_UI} className="overflow-hidden">
                  <div className="rounded-xl p-3.5" style={{ border: `1px solid rgba(${T.badRgb},0.2)`, background: `rgba(${T.badRgb},0.03)` }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: MONO, color: T.bad }}>Mistake breakdown</span>
                      {errDraft?.cats?.length > 0 && errDraft.cats.map((id) => {
                        const c = CATS.find((x) => x.id === id);
                        if (!c) return null;
                        return <span key={id} className="text-[12.5px] font-bold" style={{ fontFamily: T.sans, color: c.color }}>{c.label}</span>;
                      })}
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        transition={SPRING_TAP}
                        onClick={() => {
                          setErrForm({
                            pair: errDraft?.pair || d.plan_pair || '',
                            desc: d.mistake_description || '',
                            reasons: errDraft?.reasons || [],
                            tvLink: errDraft?.tvLink || d.trade_image || '',
                            cats: errDraft?.cats?.length ? errDraft.cats : catsFromTrade(d),
                          });
                          setComposerOpen(true);
                        }}
                        className="ml-auto text-[13px] font-bold underline decoration-dotted underline-offset-2"
                        style={{ fontFamily: T.sans, color: T.text3 }}
                      >
                        {errDraft ? 'Edit breakdown' : 'Break down in detail'}
                      </motion.button>
                    </div>
                    <div className="mt-2">
                      <Editable editing={editing} value={d.mistake_description} onChange={(v) => set({ mistake_description: v })} placeholder="Mistake not described" minRows={2} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Психологія — теж згорнута за замовчуванням */}
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
              <button
                onClick={() => !editing && setPsyOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors"
                style={{ cursor: editing ? 'default' : 'pointer' }}
                onMouseEnter={(e) => { if (!editing) e.currentTarget.style.background = T.sunken; }}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <div className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md" style={{ background: `rgba(${T.accRgb},0.10)`, color: T.acc }}>
                  <span className="text-[12.5px]">◈</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>Psychology</span>
                  <span className="whitespace-nowrap text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>State during the trade</span>
                </div>
                {!editing && (
                  <motion.span animate={{ rotate: psyOpen ? 180 : 0 }} transition={SPRING_TAP}>
                    <ChevronDown size={13} strokeWidth={2.4} style={{ color: T.text4 }} />
                  </motion.span>
                )}
              </button>

              <AnimatePresence initial={false}>
                {psyExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING_UI} className="overflow-hidden" style={{ borderTop: `1px solid ${T.line}` }}>
                    {/* На вузьких екранах grid-cols-2 ріже підписи типу "Confidence" до "Confi…" —
                        тому 1 колонка на мобільних, 2 з sm; рамки рахуються під обидва варіанти */}
                    <div className="grid grid-cols-1 sm:grid-cols-2">
                      {psyItems.map((p, i) => {
                        const isLastMobile = i === psyItems.length - 1;
                        const isLastRow2col = i >= psyItems.length - 2;
                        const isLeftCol = i % 2 === 0;
                        return (
                          <div
                            key={p.key}
                            className={[
                              'flex items-center gap-2 px-3.5 py-2.5 border-b',
                              isLastMobile ? 'border-b-0' : '',
                              isLastRow2col ? 'sm:border-b-0' : 'sm:border-b',
                              isLeftCol ? 'sm:border-r' : '',
                            ].filter(Boolean).join(' ')}
                            style={{ borderColor: T.line }}
                          >
                            <div className="h-1 w-1 shrink-0 rounded-full" style={{ background: p.ok ? T.text4 : T.bad }} />
                            <span className="flex-1 truncate text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>{p.label}</span>
                            <YesNo editing={editing} value={p.value} invert={p.invert} onChange={(v) => set({ [p.key]: v })} />
                          </div>
                        );
                      })}
                    </div>
                    {(editing || d.psy_notes?.trim()) && (
                      <div className="px-3.5 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
                        <Editable editing={editing} value={d.psy_notes} onChange={(v) => set({ psy_notes: v })} placeholder="No notes on state" minRows={2} maxRows={5} />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-1" />

            {!isSharedView() && (
            <motion.button
              onClick={() => setConfirmDel(true)}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_TAP}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[14px] font-semibold transition-colors"
              style={{ color: T.text4, fontFamily: T.sans }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
            >
              <Trash2 size={13} strokeWidth={2.3} /> Delete trade
            </motion.button>
            )}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Підтвердження видалення */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => { e.stopPropagation(); setConfirmDel(false); }}
            className="fixed inset-0 z-[1100] flex items-center justify-center p-4"
            style={{ background: 'rgba(6,6,8,0.9)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10, opacity: 0, filter: 'blur(3px)' }}
              animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ scale: 0.95, y: 10, opacity: 0, filter: 'blur(3px)' }}
              transition={SPRING_UI}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] overflow-hidden rounded-[20px]"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-8 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-full" style={{ background: `rgba(${T.badRgb},0.10)` }}>
                  <Trash2 size={17} strokeWidth={2.3} style={{ color: T.bad }} />
                </div>
                <h3 className="text-[20.5px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Delete permanently?</h3>
                <p className="text-[15.5px] leading-relaxed" style={{ color: T.text3, fontFamily: T.sans }}>
                  Screenshots, description, and the mistake review will be deleted along with the trade.
                </p>
              </div>
              <div className="flex gap-2 p-5">
                <motion.button
                  onClick={() => setConfirmDel(false)}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAP}
                  className="flex-1 rounded-xl py-3 text-[16.5px] font-bold"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  onClick={remove}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAP}
                  className="flex-1 rounded-xl py-3 text-[16.5px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
                >
                  Delete
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Той самий композер, що й на сторінці помилок і у формі
          запису угоди. Три входи — одна форма. */}
      {/* Картка угоди закривається кліком по своєму фону. Композер
          хоч і лежить у порталі, події пускає вгору по React-дереву —
          тому без зупинки спливання закриття розбору забирало б і
          саму угоду. */}
      <div onClick={(e) => e.stopPropagation()}>
        <ErrorComposerModal
          isOpen={composerOpen}
          onClose={() => setComposerOpen(false)}
          form={errForm}
          setForm={setErrForm}
          recentPairs={[d.plan_pair].filter(Boolean)}
          onSave={() => {
            setErrDraft({
              cats: errForm.cats.length ? errForm.cats : ['haste'],
              tvLink: errForm.tvLink.trim(),
              pair: errForm.pair.trim().toUpperCase(),
            });
            /* Опис пишемо в саму угоду: у журналі й в угоді має
               стояти один текст, інакше незрозуміло, якому вірити.
               Записується він при збереженні угоди — тому вмикаємо
               редагування, щоб кнопка «Зберегти» була на видноті. */
            if (errForm.desc.trim() && errForm.desc !== d.mistake_description) {
              set({ mistake_description: errForm.desc });
              setEditing(true);
            }
            setComposerOpen(false);
          }}
        />
      </div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
