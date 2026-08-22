import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import {
  X, ImagePlus, Loader2, AlertCircle, Crosshair, Activity, AlertTriangle,
  CalendarDays, ChevronDown, Search, Plus, BrainCircuit, Check, ArrowLeft,
  ArrowRight, Wallet, Percent, Target, Clock,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { notify } from '../../utils/notify';
import { T, EASE, SPRING, useEdgeFonts } from '../../lib/theme';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import Popover from '../ui/Popover';

/* ==================================================================
   Запис угоди.
   Раніше це була одна довга стрічка, де психологія ховалась в
   акордеон, і людина натискала «зберегти» лише щоб дізнатись, що
   там ще чотири обовʼязкові питання. Тепер два чесні кроки:
   спочатку цифри, потім розбір себе. Обидва видно згори.
================================================================== */

const SESSIONS = ['Asia', 'London', 'New York'];
const DIRECTIONS = ['Long', 'Short'];
const RESULTS = ['Win', 'Lose', 'BE', 'In Progress', 'Missed', 'Not Selected'];
const RISK_CHIPS = ['0.5%', '1%', '2%'];
const DEFAULT_PAIRS = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

const resultTone = (r) => ({
  Win: T.ok, Lose: T.bad, BE: T.warn, 'In Progress': T.info,
}[r] || T.text3);

const dirTone = (d) => (d === 'Long' ? T.ok : T.bad);

/* Локальна дата: toISOString() зсуває день на UTC і о другій ночі
   ставить угоді вчорашнє число */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- дрібні цеглинки ---------- */

function Label({ children, tone }) {
  return (
    <span
      className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em]"
      style={{ fontFamily: T.sans, color: tone || T.text4 }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ icon: Icon, children, hint }) {
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <Icon size={14} strokeWidth={2.3} style={{ color: T.acc }} />
      <span
        className="text-[12px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {children}
      </span>
      {hint && (
        <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          · {hint}
        </span>
      )}
    </div>
  );
}

/* Сегментований перемикач — швидше за випадайку, і одразу видно варіанти */
function Seg({ options, value, onChange, colorOf, id, wrap }) {
  return (
    <div
      className={`flex items-center gap-1 rounded-xl p-1 ${wrap ? 'flex-wrap' : ''}`}
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {options.map((o) => {
        const on = value === o;
        const c = colorOf ? colorOf(o) : T.acc;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="relative flex-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-bold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: on ? c : T.text3, zIndex: 1 }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
          >
            {on && (
              <motion.span
                layoutId={`trade-seg-${id}`}
                transition={{ type: 'spring', stiffness: 460, damping: 36 }}
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

/* Так / Ні. Кольори залежать від того, яка відповідь «здорова» */
function YesNo({ label, value, onChange, goodIsYes, missing }) {
  const tone = (v) => (v === goodIsYes ? T.ok : T.bad);

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-200"
      style={{
        background: T.sunken,
        border: `1px solid ${missing ? `rgba(${T.badRgb},0.32)` : T.line}`,
      }}
    >
      <span className="min-w-0 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
        {label}
      </span>
      <div className="flex shrink-0 gap-1.5">
        {[true, false].map((v) => {
          const on = value === v;
          const c = tone(v);
          return (
            <button
              key={String(v)}
              type="button"
              onClick={() => onChange(on ? null : v)}
              className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-200 active:scale-95"
              style={{
                fontFamily: T.sans,
                background: on ? `${c}1f` : 'transparent',
                border: `1px solid ${on ? `${c}52` : T.line}`,
                color: on ? c : T.text4,
              }}
              onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; } }}
              onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; } }}
            >
              {v ? 'Так' : 'Ні'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- вибір активу ---------- */

function AssetPicker({ value, onChange }) {
  const [search, setSearch] = useState('');
  const [userPairs, setUserPairs] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('user_assets').select('name').then(({ data }) => {
      if (data) setUserPairs(data.map((d) => d.name));
    });
  }, []);

  const all = useMemo(() => [...new Set([...DEFAULT_PAIRS, ...userPairs])], [userPairs]);
  const filtered = all.filter((p) => p.toLowerCase().includes(search.toLowerCase()));
  const canAdd = search.trim() !== '' && !all.some((p) => p.toLowerCase() === search.trim().toLowerCase());

  const addAsset = async (close) => {
    const name = search.trim().toUpperCase();
    setSaving(true);
    try {
      const { error } = await supabase.from('user_assets').insert([{ name }]);
      if (!error) {
        setUserPairs((p) => [...p, name]);
        onChange(name);
        setSearch('');
        close();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      z={600}
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-bold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: value ? `rgba(${T.accRgb},0.11)` : T.sunken,
            border: `1px solid ${value || open ? T.lineAcc : T.line}`,
            color: value ? T.acc : T.text3,
          }}
        >
          {value || 'Обрати актив'}
          <ChevronDown size={13} strokeWidth={2.6} className="transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[248px] overflow-hidden rounded-2xl"
          style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
            <Search size={13} strokeWidth={2.4} style={{ color: T.text4 }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук активу…"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:opacity-60"
              style={{ fontFamily: T.sans, color: T.text }}
            />
          </div>

          <div className="max-h-[220px] overflow-y-auto p-1.5">
            {filtered.map((p) => {
              const on = p === value;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { onChange(p); close(); }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors duration-150"
                  style={{ fontFamily: T.sans, color: on ? T.acc : T.text2, background: on ? `rgba(${T.accRgb},0.10)` : 'transparent' }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  {p}
                  {on && <Check size={13} strokeWidth={3} />}
                </button>
              );
            })}
            {filtered.length === 0 && !canAdd && (
              <div className="px-3 py-6 text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Нічого не знайшлось
              </div>
            )}
          </div>

          {canAdd && (
            <button
              type="button"
              onClick={() => addAsset(close)}
              disabled={saving}
              className="flex w-full items-center gap-2 px-3.5 py-3 text-[13px] font-bold transition-colors duration-200"
              style={{ fontFamily: T.sans, borderTop: `1px solid ${T.line}`, background: `rgba(${T.accRgb},0.08)`, color: T.acc }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} strokeWidth={3} />}
              Додати «{search.trim().toUpperCase()}»
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/* ---------- дата ---------- */

function TradeDate({ value, onChange }) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();

  const set = (d) => {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return (
    <Popover
      z={600}
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: T.sunken,
            border: `1px solid ${open ? T.lineHi : T.line}`,
            color: T.text2,
          }}
        >
          <CalendarDays size={13} strokeWidth={2.3} style={{ color: open ? T.acc : T.text4 }} />
          {format(selected, 'd MMM yyyy', { locale: uk })}
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="rounded-2xl p-2"
          style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => { if (d) { onChange(set(d)); close(); } }}
            locale={uk}
            weekStartsOn={1}
            showOutsideDays
            className="edge-daypicker"
          />
          <style>{`
            .edge-daypicker { --rdp-cell-size: 38px; --rdp-accent-color: ${T.acc};
              --rdp-background-color: rgba(${T.accRgb},0.14); margin: 0;
              font-family: ${T.sans}; color: ${T.text2}; }
            .edge-daypicker .rdp-months { margin: 0; }
            .edge-daypicker .rdp-caption_label { font-size: 14px; font-weight: 700;
              color: ${T.text}; text-transform: capitalize; letter-spacing: -0.01em; }
            .edge-daypicker .rdp-nav_button { color: ${T.text3}; border-radius: 10px;
              width: 32px; height: 32px; transition: background .2s, color .2s; }
            .edge-daypicker .rdp-nav_button:hover { background: ${T.surfaceHi} !important; color: ${T.text}; }
            .edge-daypicker .rdp-head_cell { font-size: 11.5px; font-weight: 700;
              text-transform: uppercase; letter-spacing: .08em; color: ${T.text4}; }
            .edge-daypicker .rdp-day { border-radius: 10px; font-size: 13.5px; font-weight: 600;
              color: ${T.text2}; border: 1px solid transparent;
              transition: background .18s, color .18s, border-color .18s; }
            .edge-daypicker .rdp-day:hover:not(.rdp-day_selected) {
              background: ${T.surfaceHi} !important; color: ${T.text}; border-color: ${T.line}; }
            .edge-daypicker .rdp-day_today:not(.rdp-day_selected) { color: ${T.acc}; border-color: ${T.lineAcc}; }
            .edge-daypicker .rdp-day_selected, .edge-daypicker .rdp-day_selected:hover {
              background: ${T.acc} !important; color: var(--edge-on-acc, #0A0A0C) !important; font-weight: 800; }
            .edge-daypicker .rdp-day_outside { color: ${T.text4}; opacity: .55; }
          `}</style>
        </div>
      )}
    </Popover>
  );
}

/* ---------- рахунок ---------- */

function AccountPicker({ value, options, onChange }) {
  return (
    <Popover
      z={600}
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: T.sunken,
            border: `1px solid ${open ? T.lineHi : T.line}`,
            color: value ? T.text : T.text4,
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Wallet size={14} strokeWidth={2.2} style={{ color: T.text4 }} />
            <span className="truncate">{value || 'Немає рахунків'}</span>
          </span>
          <ChevronDown size={14} strokeWidth={2.4} style={{ color: T.text4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[240px] overflow-hidden rounded-2xl p-1.5"
          style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
        >
          {options.length === 0 && (
            <div className="px-3 py-5 text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Спершу додай рахунок
            </div>
          )}
          {options.map((o) => {
            const on = o === value;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); close(); }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors duration-150"
                style={{ fontFamily: T.sans, color: on ? T.acc : T.text2, background: on ? `rgba(${T.accRgb},0.10)` : 'transparent' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                {o}
                {on && <Check size={13} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

/* ---------- зона для скріншота ---------- */

function ShotZone({ image, onPaste, onClear, label, tone }) {
  const c = tone || T.acc;
  return (
    <div
      onPaste={onPaste}
      tabIndex={0}
      className="w-full outline-none"
    >
      {image ? (
        <div
          className="group relative w-full overflow-hidden rounded-2xl"
          style={{ border: `1px solid ${T.line}`, background: T.sunken }}
        >
          <img src={image} alt="" className="block h-auto w-full" />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl opacity-0 transition-all duration-200 group-hover:opacity-100"
            style={{ background: 'rgba(10,10,12,0.8)', border: `1px solid ${T.lineHi}`, color: T.text2, backdropFilter: 'blur(8px)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; }}
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
      ) : (
        <motion.div
          whileHover={{ y: -1 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="grid min-h-[132px] cursor-pointer place-items-center rounded-2xl transition-colors duration-200"
          style={{ background: T.sunken, border: `1px dashed ${T.line}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = c)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
        >
          <div className="flex flex-col items-center gap-2.5 px-6 py-6 text-center">
            <ImagePlus size={19} strokeWidth={1.9} style={{ color: T.text4 }} />
            <span className="text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
              {label}
            </span>
            <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Ctrl+V — скрін або посилання
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ================================================================== */

/* Час у хвилинах від початку доби. Порожнє поле — це «не знаю», а не
   нуль: нуль тут означав би опівніч і зіпсував би статистику. */
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

/* Угоду, що перейшла через північ, рахуємо як наступний день, а не як
   відʼємну тривалість. Азійська сесія — це нормальний робочий час. */
export const holdMinutes = (from, to) => {
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 1440 - a;
};

const holdText = (min) => {
  if (min === null) return '';
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
};

function TimeField({ value, onChange }) {
  return (
    <div
      className="flex h-12 items-center gap-2.5 rounded-2xl px-4 transition-colors duration-200"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      <Clock size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 bg-transparent text-[14px] font-bold outline-none"
        style={{ fontFamily: T.mono, color: value ? T.text : T.text4, colorScheme: 'dark' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="shrink-0 transition-colors"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          <X size={13} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

export default function TradeModal({ isOpen, onClose, planDate, planPair, existingTrade = null }) {
  const { user } = useAuth();
  const { psyMode } = useSettings();
  useEdgeFonts();

  const [step, setStep] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [touched, setTouched] = useState(false);   // підсвічувати незаповнене лише після спроби

  const [tradeDate, setTradeDate] = useState('');
  const [selectedPair, setSelectedPair] = useState('');
  const [account, setAccount] = useState('');
  const [risk, setRisk] = useState('1%');
  const [rr, setRr] = useState('');
  const [tradeType, setTradeType] = useState('Long');
  const [result, setResult] = useState('Not Selected');
  const [session, setSession] = useState('London');
  const [tradeDescription, setTradeDescription] = useState('');
  const [tradeImage, setTradeImage] = useState(null);

  /* Сетап і час — те, без чого три розділи аналітики показували
     порожнечу. Сетап вільним текстом: своя назва — частина системи
     трейдера, і чужий перелік або не збігається з його мовою, або
     змушує підганяти під неї. Підказки збираються з його ж
     попередніх угод. */
  const [setupName, setSetupName] = useState('');
  const [setupOptions, setSetupOptions] = useState([]);
  const [entryTime, setEntryTime] = useState('');
  const [exitTime, setExitTime] = useState('');

  const [followedPlan, setFollowedPlan] = useState(null);
  const [rushed, setRushed] = useState(null);
  const [hasMistake, setHasMistake] = useState(null);
  const [mistakeText, setMistakeText] = useState('');
  const [mistakeImages, setMistakeImages] = useState([]);

  /* ---------- детальний розбір помилки ----------

     Помилка з угоди і так летить у Журнал помилок, але летить вона
     з категоріями, вгаданими з психоблоку. Вгадування працює доти,
     доки помилка вкладається в «поспішив» або «відігравав»; усе
     інше — ранній вихід, переторгівля, порушення ризику — з угоди
     не видно, і в журналі така картка виглядала однаково з рештою.

     Тому тут той самий композер, що й на сторінці помилок: не інша
     форма для того самого, а буквально вона. Людина, яка вже
     заводила помилку руками, впізнає її з першого погляду.

     Драфт живе в стані форми, а не пишеться одразу в базу: угода
     може бути ще не збережена, і в неї просто немає id, за яким
     помилка знайшла б дорогу назад. Долетить усе разом при
     збереженні угоди. */
  const [composerOpen, setComposerOpen] = useState(false);
  const [errDraft, setErrDraft] = useState(null);   // null — розбору ще не було
  const [errForm, setErrForm] = useState({
    pair: '', desc: '', tvLink: '', reasons: [], cats: [],
  });

  const [psyConfident, setPsyConfident] = useState(null);
  const [psyFear, setPsyFear] = useState(null);
  const [psyRepeat, setPsyRepeat] = useState(null);
  const [psyRevenge, setPsyRevenge] = useState(null);
  const [psyNotes, setPsyNotes] = useState('');
  /* Розкриті додаткові питання в короткому режимі */
  const [psyOpen, setPsyOpen] = useState(false);

  const scrollRef = useRef(null);

  /* ---------- завантаження ---------- */

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setTouched(false);
    setStep(0);
    let accToSet = '';

    if (existingTrade) {
      setTradeDate(existingTrade.plan_date || todayLocal());
      setSelectedPair(existingTrade.plan_pair || '');
      setRisk(existingTrade.risk || '1%');
      setRr(existingTrade.rr !== null && existingTrade.rr !== undefined ? String(existingTrade.rr) : '');
      setTradeType(existingTrade.type || 'Long');
      setResult(existingTrade.result || 'Not Selected');
      setSession(existingTrade.session || 'London');
      setTradeDescription(existingTrade.trade_description || '');
      setTradeImage(existingTrade.trade_image || null);
      setSetupName(existingTrade.setup || '');
      /* База віддає час як HH:MM:SS, полю input потрібні HH:MM */
      setEntryTime((existingTrade.entry_time || '').slice(0, 5));
      setExitTime((existingTrade.exit_time || '').slice(0, 5));
      setFollowedPlan(existingTrade.followed_plan ?? null);
      setRushed(existingTrade.rushed ?? null);
      setHasMistake(existingTrade.has_mistake ?? null);
      setMistakeText(existingTrade.mistake_description || '');

      let mImgs = [];
      if (Array.isArray(existingTrade.mistake_images) && existingTrade.mistake_images.length > 0) mImgs = existingTrade.mistake_images;
      else if (existingTrade.mistake_image) mImgs = [existingTrade.mistake_image];
      setMistakeImages(mImgs);

      setPsyConfident(existingTrade.psy_confident ?? null);
      setPsyFear(existingTrade.psy_fear ?? null);
      setPsyRepeat(existingTrade.psy_repeat ?? null);
      setPsyRevenge(existingTrade.psy_revenge ?? null);
      setPsyNotes(existingTrade.psy_notes || '');

      accToSet = existingTrade.account_name;
      setAccount(accToSet);

      /* Розбір, який людина колись зробила по цій угоді. Якщо його
         не підтягнути, наступне відкриття угоди показало б порожній
         композер і при збереженні затерло б вибрані категорії
         автоматичними. */
      setErrDraft(null);
      fetchErrorForTrade(user?.id, existingTrade.id)
        .then((e) => { if (e) setErrDraft({ cats: e.cats, tvLink: e.tvLink || '', reasons: e.reasons || [], pair: e.pair }); })
        .catch(() => {});
    } else {
      setTradeDate(planDate || todayLocal());
      setSelectedPair(planPair || '');
      setRisk('1%'); setRr(''); setTradeType('Long'); setResult('Not Selected'); setSession('London');
      setTradeDescription(''); setTradeImage(null);
      setSetupName(''); setEntryTime(''); setExitTime('');
      setFollowedPlan(null); setRushed(null); setHasMistake(null);
      setMistakeText(''); setMistakeImages([]);
      setPsyConfident(null); setPsyFear(null); setPsyRepeat(null); setPsyRevenge(null); setPsyNotes('');
      setErrDraft(null);
    }
    setComposerOpen(false);

    supabase.from('prop_accounts').select('firm_name').then(({ data }) => {
      if (data) setAccounts(data);
      if (data?.length > 0 && !accToSet) setAccount(data[0].firm_name);
    });

    /* Свої сетапи за останні пів року. Беремо частотою, а не
       алфавітом: у підказках першим має стояти те, чим людина
       торгує, а не те, що починається на «А». */
    supabase.from('trades')
      .select('setup')
      .not('setup', 'is', null)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!data) return;
        const freq = new Map();
        data.forEach((r) => {
          const v = (r.setup || '').trim();
          if (v) freq.set(v, (freq.get(v) || 0) + 1);
        });
        setSetupOptions([...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([v]) => v));
      });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isOpen, existingTrade, planDate, planPair]);

  /* Escape закриває, поки відкрито — сторінка під модалкою не скролиться */
  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    /* Escape знімає верхній шар, а не завжди всю форму: коли
       відкритий детальний розбір, вихід з нього не має заразом
       закривати недописану угоду. */
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (composerOpen) { setComposerOpen(false); return; }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose, composerOpen]);

  /* ---------- вставка картинок ---------- */

  const pasteInto = (setter) => (e) => {
    const text = e.clipboardData.getData('text');
    if (text && text.startsWith('http')) {
      e.preventDefault();
      setter(text);
      return;
    }
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => setter(ev.target.result);
        reader.readAsDataURL(items[i].getAsFile());
        return;
      }
    }
  };

  const pasteMistake = pasteInto((src) => setMistakeImages((p) => [...p, src]));
  const removeMistakeImage = (i) => setMistakeImages((p) => p.filter((_, idx) => idx !== i));

  /* ---------- перевірки ---------- */

  const holdLabel = holdText(holdMinutes(entryTime, exitTime));

  const step1Missing = !selectedPair?.trim() || !tradeDate || !account || !risk?.trim();
  /* У короткому режимі обовʼязкові тільки три питання, з яких
     будується статистика. Решта лишається доступною під розкриттям —
     не питаємо, але й не забороняємо відповісти. */
  const psyShort = psyMode === 'short';
  const psyList = psyShort
    ? [followedPlan, rushed, hasMistake]
    : [followedPlan, rushed, hasMistake, psyConfident, psyFear, psyRepeat, psyRevenge];
  const psyTotal = psyList.length;
  const psyAnswered = psyList.filter((v) => v !== null).length;
  const psyMissing = psyAnswered < psyTotal;

  const goNext = () => {
    setTouched(true);
    if (step1Missing) {
      setErrorMsg('Заповни актив, дату, рахунок і ризик.');
      return;
    }
    setErrorMsg('');
    setTouched(false);
    setStep(1);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setErrorMsg('');
    setStep(0);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched(true);

    if (step1Missing) {
      setStep(0);
      return setErrorMsg('Заповни актив, дату, рахунок і ризик.');
    }
    if (psyMissing) return setErrorMsg('Дай відповідь на всі питання розбору — саме вони роблять журнал корисним.');
    if (hasMistake && !mistakeText.trim()) return setErrorMsg('Опиши помилку — інакше через місяць не згадаєш, що сталось.');

    setErrorMsg('');
    setLoading(true);

    try {
      const payload = {
        plan_date: tradeDate, plan_pair: selectedPair, account_name: account, risk,
        rr: rr ? parseFloat(String(rr).replace(',', '.')) : null,
        type: tradeType, result, session,
        setup: setupName.trim() || null,
        entry_time: entryTime || null,
        exit_time: exitTime || null,
        trade_description: tradeDescription, trade_image: tradeImage,
        followed_plan: followedPlan, rushed, has_mistake: hasMistake,
        mistake_description: mistakeText, mistake_images: mistakeImages,
        psy_confident: psyConfident, psy_fear: psyFear, psy_repeat: psyRepeat,
        psy_revenge: psyRevenge, psy_notes: psyNotes,
      };

      let tradeId = existingTrade?.id || null;

      if (existingTrade) {
        const { error } = await supabase.from('trades').update(payload).eq('id', existingTrade.id);
        if (error) throw error;
        notify.success('Оновлено', 'Трейд успішно оновлено.');
      } else {
        /* id потрібен одразу: за ним помилка знайде дорогу назад до
           угоди, з якої вона взялась */
        const { data, error } = await supabase.from('trades').insert([payload]).select('id').single();
        if (error) throw error;
        tradeId = data?.id || null;

        if (hasMistake) notify.error('Помилка зафіксована', 'Вона вже чекає в Журналі помилок — там її можна розібрати.');
        else notify.success('Трейд збережено', 'Трейд додано до журналу.');
      }

      /* Дзеркало помилки в журналі. Свідомо не в try того ж рівня:
         угода вже збережена, і якщо не доїде саме дзеркало — людина
         не має побачити «не вдалось зберегти трейд». */
      if (tradeId) {
        try {
          await syncErrorFromTrade(user?.id, { ...payload, id: tradeId }, errDraft);
        } catch (e) {
          console.error('sync error log', e);
        }
      }

      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const accountOptions = accounts.map((a) => a.firm_name);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[500] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
          style={{ background: 'rgba(6,6,8,0.82)', backdropFilter: 'blur(10px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={SPRING}
            className="my-auto w-full max-w-[720px] overflow-hidden rounded-3xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
            }}
          >
            {/* ─────────── Шапка ─────────── */}
            <div
              className="relative px-4 pb-3 pt-4 sm:px-6 sm:pt-5"
              style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})` }}
            >
              <div className="mb-2.5 flex items-center gap-2">
                <Crosshair size={12} strokeWidth={2.6} style={{ color: T.acc }} />
                <span className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                  Position Entry
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pr-11">
                <h2
                  className="mr-1 text-[22px] font-bold leading-none sm:text-[26px]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                >
                  {existingTrade ? 'Edit Trade' : 'Log Trade'}
                </h2>
                <AssetPicker value={selectedPair} onChange={setSelectedPair} />
                <TradeDate value={tradeDate} onChange={setTradeDate} />
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

              {/* кроки */}
              <div className="mt-4 flex items-center gap-2">
                {['Цифри', 'Розбір'].map((s, i) => {
                  const done = i < step;
                  const on = i === step;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => (i === 0 ? goBack() : goNext())}
                      className="group flex flex-1 flex-col gap-1.5 text-left"
                    >
                      <span className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: T.line }}>
                        <motion.span
                          className="block h-full rounded-full"
                          initial={false}
                          animate={{ width: done || on ? '100%' : '0%' }}
                          transition={{ duration: 0.4, ease: EASE }}
                          style={{ background: T.acc, display: 'block' }}
                        />
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] transition-colors duration-200"
                        style={{ fontFamily: T.sans, color: on ? T.text2 : done ? T.acc : T.text4 }}
                      >
                        {done && <Check size={11} strokeWidth={3.4} />}
                        {i + 1}. {s}
                        {i === 1 && psyAnswered > 0 && (
                          <span className="tabular-nums" style={{ fontFamily: T.mono, color: psyMissing ? T.text4 : T.ok }}>
                            {psyAnswered}/{psyTotal}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─────────── Тіло ─────────── */}
            <form onSubmit={handleSubmit} noValidate>
              <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto px-4 py-5 sm:px-6" style={{ scrollbarWidth: 'thin' }}>
                <AnimatePresence mode="wait">
                  {step === 0 ? (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.24, ease: EASE }}
                      className="flex flex-col gap-6"
                    >
                      {/* Core metrics */}
                      <section>
                        <SectionTitle icon={Activity}>Core metrics</SectionTitle>
                        <div className="grid gap-3.5 sm:grid-cols-[1.4fr_1fr_1fr]">
                          <div>
                            <Label>Account</Label>
                            <AccountPicker value={account} options={accountOptions} onChange={setAccount} />
                          </div>

                          <div>
                            <Label>Risk</Label>
                            <div
                              className="flex h-[42px] items-center gap-1 rounded-xl px-1.5"
                              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                            >
                              <Percent size={13} strokeWidth={2.4} style={{ color: T.text4 }} className="ml-1.5 shrink-0" />
                              <input
                                value={risk}
                                onChange={(e) => setRisk(e.target.value)}
                                className="w-full min-w-0 bg-transparent text-[14px] font-semibold outline-none"
                                style={{ fontFamily: T.mono, color: T.text }}
                              />
                              <span className="flex shrink-0 gap-0.5">
                                {RISK_CHIPS.map((c) => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setRisk(c)}
                                    className="rounded-md px-1.5 py-1 text-[11.5px] font-bold transition-colors duration-150"
                                    style={{
                                      fontFamily: T.mono,
                                      color: risk === c ? T.acc : T.text4,
                                      background: risk === c ? `rgba(${T.accRgb},0.12)` : 'transparent',
                                    }}
                                  >
                                    {c.replace('%', '')}
                                  </button>
                                ))}
                              </span>
                            </div>
                          </div>

                          <div>
                            <Label tone={T.acc}>Result RR</Label>
                            <div
                              className="flex h-[42px] items-center gap-2 rounded-xl px-3.5"
                              style={{ background: T.sunken, border: `1px solid ${rr ? T.lineAcc : T.line}` }}
                            >
                              <Target size={13} strokeWidth={2.4} style={{ color: rr ? T.acc : T.text4 }} />
                              <input
                                value={rr}
                                onChange={(e) => setRr(e.target.value.replace(',', '.'))}
                                inputMode="decimal"
                                placeholder="2.5"
                                className="w-full min-w-0 bg-transparent text-[14px] font-bold outline-none placeholder:opacity-50"
                                style={{ fontFamily: T.mono, color: T.text }}
                              />
                              <span className="shrink-0 text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: T.text4 }}>R</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Execution */}
                      <section className="grid gap-3.5 sm:grid-cols-2">
                        <div>
                          <Label>Session</Label>
                          <Seg id="session" options={SESSIONS} value={session} onChange={setSession} />
                        </div>
                        <div>
                          <Label>Direction</Label>
                          <Seg id="dir" options={DIRECTIONS} value={tradeType} onChange={setTradeType} colorOf={dirTone} />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Result</Label>
                          <Seg id="res" options={RESULTS} value={result} onChange={setResult} colorOf={resultTone} wrap />
                        </div>

                        {/* Два моменти часу, а не тривалість: обидва
                            видно в терміналі, а «скільки тримав»
                            рахується з них саме. Обидва не обовʼязкові —
                            угода без них зберігається як раніше. */}
                        <div>
                          <Label>Вхід</Label>
                          <TimeField value={entryTime} onChange={setEntryTime} />
                        </div>
                        <div>
                          <Label>
                            Вихід
                            {holdLabel && (
                              <span className="ml-2 font-normal normal-case tracking-normal" style={{ color: T.text4 }}>
                                {holdLabel}
                              </span>
                            )}
                          </Label>
                          <TimeField value={exitTime} onChange={setExitTime} />
                        </div>
                      </section>

                      {/* Setup */}
                      <section>
                        <SectionTitle icon={Crosshair} hint="що саме ти побачив">Trade setup</SectionTitle>
                        <div className="flex flex-col gap-3">
                          <div>
                            <input
                              value={setupName}
                              onChange={(e) => setSetupName(e.target.value)}
                              placeholder="Назва сетапу — напр. Sweep + BOS"
                              className="h-12 w-full rounded-2xl px-4 text-[14px] font-semibold outline-none transition-colors duration-200 placeholder:font-normal placeholder:opacity-60"
                              style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                              onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                              onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                            />

                            {/* Підказки — власні сетапи, за частотою. Це і
                                економить набір, і тримає назви однаковими:
                                «OB retest» та «ОБ ретест» у статистиці
                                розʼїжджаються на два різні сетапи. */}
                            {setupOptions.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {setupOptions.map((o) => {
                                  const on = o === setupName;
                                  return (
                                    <button
                                      key={o}
                                      type="button"
                                      onClick={() => setSetupName(on ? '' : o)}
                                      className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
                                      style={{
                                        fontFamily: T.sans,
                                        background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                                        border: `1px solid ${on ? T.lineAcc : T.line}`,
                                        color: on ? T.acc : T.text3,
                                      }}
                                    >
                                      {o}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <ShotZone
                            image={tradeImage}
                            onPaste={pasteInto(setTradeImage)}
                            onClear={() => setTradeImage(null)}
                            label="Встав графік сетапу"
                          />
                          <textarea
                            value={tradeDescription}
                            onChange={(e) => setTradeDescription(e.target.value)}
                            placeholder="Логіка входу, підтвердження, емоції в моменті…"
                            className="min-h-[92px] w-full resize-y rounded-2xl p-4 text-[14px] outline-none transition-colors duration-200 placeholder:opacity-60"
                            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, lineHeight: 1.65 }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                          />
                        </div>
                      </section>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.24, ease: EASE }}
                      className="flex flex-col gap-6"
                    >
                      {/* Психологія. У короткому режимі обовʼязкові
                          тільки три питання, з яких аналітика справді
                          щось будує. Решта не зникає — вона під
                          розкриттям: не питаємо, але й не забороняємо
                          відповісти тому, хто хоче. */}
                      <section>
                        <SectionTitle
                          icon={BrainCircuit}
                          hint={psyShort ? 'три головні — обовʼязкові' : 'усі сім — обовʼязкові'}
                        >
                          Psychology
                        </SectionTitle>
                        <div className="flex flex-col gap-2">
                          <YesNo label="Дотримався торгового плану?" value={followedPlan} onChange={setFollowedPlan} goodIsYes missing={touched && followedPlan === null} />
                          <YesNo label="Спішив зі входом (FOMO)?" value={rushed} onChange={setRushed} goodIsYes={false} missing={touched && rushed === null} />
                          <YesNo label="Припустився очевидної помилки?" value={hasMistake} onChange={setHasMistake} goodIsYes={false} missing={touched && hasMistake === null} />

                          {(!psyShort || psyOpen) && (
                            <>
                              <YesNo label="Був упевнений у рішеннях?" value={psyConfident} onChange={setPsyConfident} goodIsYes missing={!psyShort && touched && psyConfident === null} />
                              <YesNo label="Чи був присутній страх?" value={psyFear} onChange={setPsyFear} goodIsYes={false} missing={!psyShort && touched && psyFear === null} />
                              <YesNo label="Повторив би цю угоду?" value={psyRepeat} onChange={setPsyRepeat} goodIsYes missing={!psyShort && touched && psyRepeat === null} />
                              <YesNo label="Було бажання відігратися?" value={psyRevenge} onChange={setPsyRevenge} goodIsYes={false} missing={!psyShort && touched && psyRevenge === null} />
                            </>
                          )}
                        </div>

                        {psyShort && (
                          <button
                            type="button"
                            onClick={() => setPsyOpen((v) => !v)}
                            className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors"
                            style={{ fontFamily: T.sans, color: T.text3 }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                            onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
                          >
                            <ChevronDown
                              size={13}
                              strokeWidth={2.6}
                              style={{ transform: psyOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                            />
                            {psyOpen ? 'Сховати решту' : 'Ще чотири питання — за бажанням'}
                          </button>
                        )}

                        <textarea
                          value={psyNotes}
                          onChange={(e) => setPsyNotes(e.target.value)}
                          placeholder="Психологічні нотатки (опціонально)…"
                          className="mt-3 min-h-[80px] w-full resize-y rounded-2xl p-4 text-[14px] outline-none transition-colors duration-200 placeholder:opacity-60"
                          style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, lineHeight: 1.65 }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                          onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                        />
                      </section>

                      {/* Розбір помилки */}
                      <AnimatePresence>
                        {hasMistake === true && (
                          <motion.section
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.28, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <div
                              className="flex flex-col gap-3 rounded-2xl p-4"
                              style={{ background: `rgba(${T.badRgb},0.05)`, border: `1px solid rgba(${T.badRgb},0.22)` }}
                            >
                              <div className="flex flex-wrap items-center gap-2.5">
                                <AlertTriangle size={14} strokeWidth={2.4} style={{ color: T.bad }} />
                                <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.bad }}>
                                  Аналіз помилки
                                </span>

                                {/* Категорії з розбору — коротко, прямо в
                                    шапці: інакше про те, що розбір узагалі
                                    зроблено, було б видно тільки в іншому
                                    розділі. */}
                                {errDraft?.cats?.length > 0 && (
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    {errDraft.cats.map((id) => {
                                      const c = CATS.find((x) => x.id === id);
                                      if (!c) return null;
                                      return (
                                        <span
                                          key={id}
                                          className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
                                          style={{
                                            fontFamily: T.sans,
                                            color: c.color,
                                            background: `${c.color}1a`,
                                            border: `1px solid ${c.color}38`,
                                          }}
                                        >
                                          {c.label}
                                        </span>
                                      );
                                    })}
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    /* Композер відкриваємо з тим, що вже
                                       відомо: актив і опис людина щойно
                                       ввела, категорії — або з минулого
                                       розбору, або вгадані з психоблоку.
                                       Порожня форма тут означала б просити
                                       втретє те саме. */
                                    setErrForm({
                                      pair: errDraft?.pair || selectedPair || '',
                                      desc: mistakeText,
                                      reasons: errDraft?.reasons || [],
                          tvLink: errDraft?.tvLink || mistakeImages[0] || tradeImage || '',
                                      cats: errDraft?.cats?.length
                                        ? errDraft.cats
                                        : catsFromTrade({
                                          psy_revenge: psyRevenge, rushed, psy_fear: psyFear,
                                          psy_repeat: psyRepeat, followed_plan: followedPlan,
                                        }),
                                    });
                                    setComposerOpen(true);
                                  }}
                                  className="ml-auto flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold transition-colors"
                                  style={{
                                    fontFamily: T.sans,
                                    background: 'transparent',
                                    border: `1px solid rgba(${T.badRgb},0.3)`,
                                    color: T.bad,
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.1)`; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                  {errDraft ? 'Змінити розбір' : 'Розібрати детально'}
                                </button>
                              </div>

                              {mistakeImages.length === 0 ? (
                                <ShotZone
                                  image={null}
                                  onPaste={pasteMistake}
                                  label="Встав графіки помилки"
                                  tone={T.bad}
                                />
                              ) : (
                                <div onPaste={pasteMistake} tabIndex={0} className="grid grid-cols-2 gap-2.5 outline-none">
                                  {mistakeImages.map((img, i) => (
                                    <div
                                      key={i}
                                      className="group relative aspect-video overflow-hidden rounded-xl"
                                      style={{ border: `1px solid rgba(${T.badRgb},0.25)`, background: T.sunken }}
                                    >
                                      <img src={img} alt="" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => removeMistakeImage(i)}
                                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                        style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.lineHi}`, color: T.bad }}
                                      >
                                        <X size={13} strokeWidth={2.8} />
                                      </button>
                                    </div>
                                  ))}
                                  <div
                                    className="grid aspect-video place-items-center rounded-xl text-center text-[12px] font-semibold"
                                    style={{ border: `1px dashed rgba(${T.badRgb},0.25)`, background: T.sunken, color: T.text4, fontFamily: T.sans }}
                                  >
                                    ще один<br />Ctrl+V
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={mistakeText}
                                onChange={(e) => setMistakeText(e.target.value)}
                                placeholder="Детально опиши помилку, щоб не повторити її в майбутньому…"
                                className="min-h-[92px] w-full resize-y rounded-2xl p-4 text-[14px] outline-none transition-colors duration-200 placeholder:opacity-60"
                                style={{
                                  background: T.sunken,
                                  border: `1px solid ${touched && !mistakeText.trim() ? `rgba(${T.badRgb},0.4)` : T.line}`,
                                  color: T.text2, fontFamily: T.sans, lineHeight: 1.65,
                                }}
                              />
                            </div>
                          </motion.section>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ─────────── Підвал ─────────── */}
              <div
                className="flex flex-col gap-3 px-4 py-3.5 sm:px-6"
                style={{ borderTop: `1px solid ${T.line}`, background: T.surfaceHi }}
              >
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold"
                      style={{ background: `rgba(${T.badRgb},0.09)`, border: `1px solid rgba(${T.badRgb},0.25)`, color: T.bad, fontFamily: T.sans }}
                    >
                      <AlertCircle size={14} strokeWidth={2.4} className="shrink-0" />
                      {errorMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-2.5">
                  {step === 1 && (
                    <button
                      type="button"
                      onClick={goBack}
                      className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold transition-colors duration-200"
                      style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                    >
                      <ArrowLeft size={15} strokeWidth={2.4} />
                      Назад
                    </button>
                  )}

                  <span className="ml-auto hidden text-[12.5px] sm:block" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {step === 0 ? 'Далі — розбір угоди' : psyMissing ? `Лишилось ${psyTotal - psyAnswered} питань` : 'Усе готово'}
                  </span>

                  {step === 0 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="group ml-auto flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] sm:ml-0 sm:flex-none"
                      style={{
                        background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                        boxShadow: `0 8px 22px -10px rgba(${T.accRgb},0.7)`,
                      }}
                    >
                      Далі
                      <ArrowRight size={15} strokeWidth={2.8} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.99] sm:flex-none"
                      style={{
                        background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                        boxShadow: `0 8px 22px -10px rgba(${T.accRgb},0.7)`,
                        opacity: loading ? 0.6 : 1,
                      }}
                    >
                      {loading
                        ? <Loader2 size={16} strokeWidth={3} className="animate-spin" />
                        : <Check size={16} strokeWidth={3} />}
                      {existingTrade ? 'Оновити трейд' : 'Записати трейд'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </motion.div>

          {/* Той самий композер, що й на сторінці помилок — він сам
              іде в портал на body, тому центрується по екрану, а не
              по цій формі.

              Зберігає в стан, а не в базу: угоди може ще не існувати.
              Усе долетить разом при збереженні.

              stopPropagation потрібен і в порталі: React пускає події
              вгору по своєму дереву, а не по DOM, тож без нього клік
              усередині композера закривав би форму угоди. */}
          <div onClick={(e) => e.stopPropagation()}>
            <ErrorComposerModal
              isOpen={composerOpen}
              onClose={() => setComposerOpen(false)}
              form={errForm}
              setForm={setErrForm}
              recentPairs={[...new Set([selectedPair, ...DEFAULT_PAIRS].filter(Boolean))].slice(0, 5)}
              onSave={() => {
                setErrDraft({
                  cats: errForm.cats.length ? errForm.cats : ['haste'],
                  tvLink: errForm.tvLink.trim(),
                  reasons: errForm.reasons || [],
                  pair: errForm.pair.trim().toUpperCase(),
                });
                /* Опис у композері й опис в угоді — це один текст.
                   Два різні означали б, що в журналі помилок написано
                   не те, що в угоді, і людина не знала б, якому
                   вірити. */
                if (errForm.desc.trim()) setMistakeText(errForm.desc);
                setComposerOpen(false);
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
