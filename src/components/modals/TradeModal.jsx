import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import {
  X, ImagePlus, Loader2, AlertCircle, AlertTriangle,
  CalendarDays, ChevronDown, Search, Check, Plus,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { notify } from '../../utils/notify';
import { T, EASE, SPRING, useEdgeFonts } from '../../lib/theme';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { logTradeMovement } from '../../lib/accountsStore';
import { getTradeProfit } from '../../utils/journalUtils';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import AssetIcon from '../ui/AssetIcon';
import ImageSlider from '../ui/ImageSlider';
import Popover from '../ui/Popover';
import useCachedList, { listCache } from '../../hooks/useCachedList';

/* ==================================================================
   Запис угоди — «Ledger»: редакційна одноколонна форма. Підпис зліва,
   поле справа, один погляд згори вниз. Два чесні кроки — спочатку
   цифри, потім розбір себе — а не акордеон, який ховає, що там ще
   чотири обовʼязкові питання.
================================================================== */

/* Гама «Log Trade Modal» (макет .dc): первинний акцент — фіолетовий,
   як у решті застосунку, тому беремо токен теми. Семантичні кольори —
   напрямок, статус, сесії — лишаються своїми.

   Альфа до токена рядком не дописується (`var(...)1f` невалідний),
   тому напівпрозорі відтінки первинного кольору робимо через
   rgba(var(--edge-acc-rgb), a). */
const ACCENT = 'var(--edge-acc)';
const ACCENT_RGB = 'var(--edge-acc-rgb)';
/* Семантичний зелений — тільки Long / Take. Фіксований hex, бо тут
   потрібні 8-значні alpha-суфікси. */
/* Та сама межа, що й на сторінці рахунків: архівний — лише 'Closed',
   усе інше (включно з порожнім статусом старих записів) активне. */
const isOpenAccount = (a) => a?.status !== 'Closed';

const GREEN = '#2FE3A8';
const GREEN_RGB = '47,227,168';
const BAD = '#FF5C6E';
const BAD_RGB = '255,92,110';
const AMBER = '#F5B54A';
/* Поверхні за макетом: картка трохи піднята, ПОЛЯ майже такі ж темні
   (у макеті #121218 на #0d0d11) — відділяє їх бордер, не сіра
   заливка. color-mix працює в обидві теми. */
const CARD_BG = 'var(--edge-surface, #101214)';
const FOOTER_BG = 'color-mix(in srgb, var(--edge-surface) 90%, var(--edge-bg))';
const FIELD_BG = 'color-mix(in srgb, var(--edge-surface) 96%, var(--edge-text) 4%)';
/* Цифри й підписи теж у Roboto — модалка має бути одним шрифтом; назва MONO лишилась, щоб не чіпати десятки місць. */
const MONO = T.sans;

/* txt()/line() крутять прозорість, тому їм потрібен саме триплет, а не
   готовий rgba-токен. */
const txt = (a) => `rgba(var(--edge-text-rgb, 242,244,243), ${a})`;
const line = (a) => `rgba(var(--edge-hair-rgb, 255,255,255), ${a})`;

const DEFAULT_SESSIONS = ['Asia', 'London', 'New York'];
/* Той самий колірний код сесій, що й у деталях угоди: Азія —
   рожево-червона (нічна, нервова), Лондон — синій, Нью-Йорк —
   зелений. Свої сесії (з БД) підсвічуються акцентом. */
const SESSION_COLORS = {
  Asia: { c: '#fb7185', rgb: '251,113,133' },
  London: { c: '#60a5fa', rgb: '96,165,250' },
  'New York': { c: '#34d399', rgb: '52,211,153' },
};
const DIRECTIONS = ['Long', 'Short'];
/* Значення в БД лишаються англійськими — перекладаємо лише підпис. */
const DIRECTION_LABEL = { Long: 'Лонг', Short: 'Шорт' };
const SESSION_LABEL = { Asia: 'Азія', London: 'Лондон', 'New York': 'Нью-Йорк' };
/* Внутрішні значення лишаються Win/Lose/… (модель даних і решта
   застосунку на них зав'язані), надпис — Take/Stop, як усюди в
   журналі. */
const RESULT_CHIPS = ['Win', 'Lose', 'BE', 'In Progress', 'Missed'];
const RESULT_LABEL = { Win: 'Тейк', Lose: 'Стоп', BE: 'Беззбиток', 'In Progress': 'В процесі', Missed: 'Пропущено' };
const RESULT_COLORS = {
  Win: { c: GREEN, rgb: GREEN_RGB },
  Lose: { c: BAD, rgb: BAD_RGB },
  BE: { c: AMBER, rgb: '245,181,74' },
  'In Progress': { c: '#60a5fa', rgb: '96,165,250' },
  Missed: { c: 'var(--edge-text3)', rgb: '154,154,163' },
};
/* Базові сетапи — щоб список не був порожнім у новачка; свої, з
   історії угод, стають першими. */
const DEFAULT_SETUPS = ['OB retest', 'FVG retest', 'Liquidity sweep', 'BOS + retest', 'CHoCH', 'Breaker block', 'Range breakout', 'Trend continuation'];
const DEFAULT_PAIRS = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

/* Сім питань розбору — той самий порядок і той самий «good», що й у
   макеті, зіставлений з реальними полями психоблоку. */
const QUESTIONS = [
  { key: 'followedPlan', q: 'Чи дотримувався торгового плану?', short: 'План', good: true },
  { key: 'rushed', q: 'Чи поспішав зі входом (FOMO)?', short: 'FOMO', good: false },
  { key: 'hasMistake', q: 'Чи була очевидна помилка?', short: 'Помилка', good: false },
  { key: 'psyConfident', q: 'Чи був впевнений у своїх рішеннях?', short: 'Впевненість', good: true },
  { key: 'psyFear', q: 'Чи був присутній страх?', short: 'Страх', good: false },
  { key: 'psyRepeat', q: 'Чи повторив би цю угоду?', short: 'Повторив би', good: true },
  { key: 'psyRevenge', q: 'Чи було бажання відігратися?', short: 'Відігратися', good: false },
];

/* Локальна дата: toISOString() зсуває день на UTC і о другій ночі
   ставить угоді вчорашнє число */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- дрібні цеглинки ---------- */

/* Трикутна стрілка-каре з макета v12 — замість іконки ChevronDown,
   там, де тригер компактний і своя іконка забирає зайве місце. */
function Caret({ color, open }) {
  return (
    <span
      className="shrink-0"
      style={{
        width: 0,
        height: 0,
        borderLeft: '3.5px solid transparent',
        borderRight: '3.5px solid transparent',
        borderTop: `4px solid ${color || txt(0.4)}`,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform .2s',
      }}
    />
  );
}

/* Long / Short — макет v12: одна доріжка з двома сегментами (як
   перемикач періоду на аналітиці), а не дві окремі картки. Активний
   сегмент заливається своїм тоном, значок напрямку — в маленькому
   квадраті зліва від підпису. */
function DirectionToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-[3px] rounded-[12px] p-1" style={{ background: line(0.02), border: `1px solid ${line(0.07)}` }}>
      {DIRECTIONS.map((d) => {
        const on = value === d;
        const c = d === 'Long' ? GREEN : BAD;
        const rgb = d === 'Long' ? GREEN_RGB : BAD_RGB;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className="flex h-10 flex-1 items-center justify-center gap-[9px] rounded-[10px] text-[14px] font-semibold transition-all duration-200"
            style={{
              fontFamily: T.sans,
              letterSpacing: '-0.005em',
              background: on ? `rgba(${rgb},0.13)` : 'transparent',
              color: on ? c : txt(0.42),
            }}
          >
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] transition-all duration-200"
              style={{ background: on ? `rgba(${rgb},0.16)` : line(0.04), color: on ? c : txt(0.44) }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d={d === 'Long' ? 'M4 16l6-6 4 4 6-7' : 'M4 8l6 6 4-4 6 7'} />
              </svg>
            </span>
            {DIRECTION_LABEL[d] || d}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- вибір активу ---------- */

/* Маленька випадашка з пошуком, як було спочатку — не повноекранна
   модалка. Свій актив, якого нема в списку, не «кешується» на
   клієнті, а одразу летить у user_assets: наступного разу він є
   в списку з будь-якого пристрою. */
function AssetPicker({ value, onChange }) {
  const [search, setSearch] = useState('');
  const [userAssetRows, setUserAssetRows] = useCachedList('assets', 'user_assets', 'name', 'name');
  const userPairs = userAssetRows.map((d) => d.name);

  const allPairs = [...new Set([...DEFAULT_PAIRS, ...userPairs])];
  const filtered = allPairs.filter((p) => p.toLowerCase().includes(search.toLowerCase()));
  const showAdd = search.trim() !== '' && !allPairs.some((p) => p.toLowerCase() === search.trim().toLowerCase());

  const addAsset = async () => {
    const name = search.trim().toUpperCase();
    if (!name) return;
    const { error } = await supabase.from('user_assets').insert([{ name }]);
    if (!error) {
      setUserAssetRows([...userAssetRows, { name }]);
      onChange(name);
      setSearch('');
    }
  };

  const removeAsset = async (e, name) => {
    e.stopPropagation();
    if (DEFAULT_PAIRS.includes(name)) return;
    const { error } = await supabase.from('user_assets').delete().eq('name', name);
    if (!error) {
      setUserAssetRows(userAssetRows.filter((x) => x.name !== name));
      if (value === name) onChange('');
    }
  };

  return (
    <Popover
      z={600}
      renderTrigger={({ toggle, open: o }) => (
        <motion.button
          type="button"
          onClick={toggle}
          whileTap={{ scale: 0.99 }}
          transition={SPRING}
          className="flex h-[48px] w-full items-center justify-between gap-2 rounded-[12px] px-4 transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: FIELD_BG,
            border: `1px solid ${value ? line(0.11) : (o ? line(0.16) : line(0.07))}`,
          }}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2.5 overflow-hidden text-[15.5px] font-semibold" style={{ fontFamily: MONO, letterSpacing: '0.05em', color: 'var(--edge-text)' }}>
              <AssetIcon symbol={value} />
              <span className="truncate">{value}</span>
            </span>
          ) : (
            <span className="text-[14.5px] font-medium" style={{ letterSpacing: '-0.005em', color: txt(0.45) }}>
              Актив
            </span>
          )}
          <Caret color={value ? ACCENT : txt(0.4)} open={o} />
        </motion.button>
      )}
    >
      {({ close }) => (
        <div className="w-[320px] overflow-hidden rounded-2xl" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px var(--edge-panel-glow, rgba(0,0,0,0.5))' }}>
          <div className="px-3 pb-1 pt-2.5 text-[9px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.26em', color: txt(0.4) }}>Актив</div>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${line(0.08)}` }}>
            <Search size={12} style={{ color: txt(0.5) }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук або новий актив…"
              className="w-full min-w-0 bg-transparent text-[14.5px] outline-none placeholder:opacity-50"
              style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto p-1.5">
            {filtered.map((p) => {
              const on = p === value;
              const custom = userPairs.includes(p);
              return (
                <div key={p} className="group flex items-center">
                  <button
                    type="button"
                    onClick={() => { onChange(p); close(); }}
                    className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[14.5px] font-medium transition-colors duration-200"
                    style={{ fontFamily: T.sans, color: on ? ACCENT : txt(0.85), background: on ? `rgba(${ACCENT_RGB},0.1)` : 'transparent' }}
                  >
                    <AssetIcon symbol={p} />
                    {p}
                  </button>
                  {custom && (
                    <button
                      type="button"
                      onClick={(e) => removeAsset(e, p)}
                      className="hidden shrink-0 pr-2 transition-colors group-hover:block"
                      style={{ color: txt(0.4) }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = BAD; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.4); }}
                    >
                      <X size={12} strokeWidth={2.6} />
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !showAdd && (
              <div className="px-3 py-5 text-center text-[13.5px]" style={{ fontFamily: T.sans, color: txt(0.4) }}>
                Нічого не знайдено
              </div>
            )}
          </div>
          {showAdd && (
            <button
              type="button"
              onClick={addAsset}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] font-semibold transition-colors duration-200"
              style={{ borderTop: `1px solid ${line(0.08)}`, fontFamily: T.sans, color: ACCENT }}
            >
              <Plus size={13} strokeWidth={2.6} />
              Додати "{search.trim().toUpperCase()}"
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/* ---------- узагальнений тригер-піквер (макет v12) ----------
   Один компонент на сетап / сесію / статус: кнопка-тригер + спливний
   список замість завжди розгорнутих піґулок. Сетап додатково пускає
   вписати свій варіант; сесії й статуси лишаються фіксованим набором,
   як і було задумано раніше — тут лише візуальна форма змінюється. */
function MenuPicker({
  title, value, options, onChange, labelOf = (v) => v, colorOf, placeholder,
  isEmpty = (v) => !v, toggleOff, allowCustom, height = 48, radius = 12,
}) {
  const [draft, setDraft] = useState('');
  const empty = isEmpty(value);

  const submitDraft = () => {
    const v = draft.trim();
    if (!v) return;
    onChange(v);
    setDraft('');
  };

  return (
    <Popover
      z={600}
      triggerClass="flex w-full"
      renderTrigger={({ open, toggle }) => {
        const dot = colorOf && !empty ? colorOf(value) : null;
        return (
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center justify-between gap-2 px-4 transition-colors duration-200"
            style={{ height, borderRadius: radius, fontFamily: T.sans, background: FIELD_BG, border: `1px solid ${!empty ? line(0.11) : (open ? line(0.16) : line(0.07))}` }}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {dot && (
                <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: dot.c, boxShadow: `0 0 7px rgba(${dot.rgb},0.75)` }} />
              )}
              <span
                className="truncate text-[14.5px]"
                style={{ fontWeight: empty ? 400 : 500, letterSpacing: '-0.005em', color: empty ? txt(0.45) : 'var(--edge-text)' }}
              >
                {empty ? placeholder : labelOf(value)}
              </span>
            </span>
            <Caret color={!empty ? ACCENT : txt(0.4)} open={open} />
          </button>
        );
      }}
    >
      {({ close }) => (
        <div className="w-[220px] overflow-hidden rounded-2xl p-1.5" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px var(--edge-panel-glow, rgba(0,0,0,0.5))' }}>
          {title && (
            <div className="px-2.5 pb-1 pt-1.5 text-[9px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.26em', color: txt(0.4) }}>{title}</div>
          )}
          {options.map((o) => {
            const on = o === value;
            const c = colorOf?.(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(on && toggleOff !== undefined ? toggleOff : o); close(); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors duration-200"
                style={{ fontFamily: T.sans, fontWeight: on ? 600 : 500, color: on ? 'var(--edge-text)' : txt(0.62), background: on ? `rgba(${ACCENT_RGB},0.1)` : 'transparent' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = line(0.06); }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                {c && <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: c.c, boxShadow: `0 0 7px rgba(${c.rgb},${on ? 1 : 0.55})` }} />}
                <span className="truncate">{labelOf(o)}</span>
                {on && <Check size={11} strokeWidth={3} className="ml-auto shrink-0" style={{ color: c?.c || ACCENT }} />}
              </button>
            );
          })}
          {allowCustom && (
            <div className="mt-1 flex items-center gap-2 border-t pl-2.5 pr-1.5 pt-1.5" style={{ borderColor: line(0.07) }}>
              <Plus size={12} strokeWidth={2.4} style={{ color: txt(0.45) }} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { submitDraft(); close(); } }}
                placeholder="Свій варіант"
                className="h-[34px] min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none"
                style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
              />
              <button
                type="button"
                onClick={() => { submitDraft(); close(); }}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13.5px] transition-all duration-200"
                style={{ background: draft.trim() ? `rgba(${ACCENT_RGB},0.16)` : 'transparent', color: draft.trim() ? ACCENT : txt(0.35) }}
              >
                ↵
              </button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

/* Сесія — фіксовані три варіанти з гео-палітрою, без своїх варіантів:
   Азія / Лондон / Нью-Йорк покривають усе. */
function SessionPicker({ value, onChange }) {
  const colorOf = (name) => SESSION_COLORS[name] || { c: ACCENT, rgb: ACCENT_RGB };
  return (
    <MenuPicker
      title="Сесія"
      value={value}
      options={DEFAULT_SESSIONS}
      onChange={onChange}
      labelOf={(v) => SESSION_LABEL[v] || v}
      colorOf={colorOf}
      placeholder="Сесія"
      isEmpty={(v) => !v}
    />
  );
}

/* Статус — той самий тригер, підпис через RESULT_LABEL (Take/Stop/…),
   повторний клік на активному знімає вибір назад у «Not Selected». */
function StatusPicker({ value, onChange }) {
  const colorOf = (o) => RESULT_COLORS[o];
  return (
    <MenuPicker
      title="Статус"
      value={value}
      options={RESULT_CHIPS}
      onChange={onChange}
      labelOf={(v) => RESULT_LABEL[v] || v}
      colorOf={colorOf}
      placeholder="Статус"
      isEmpty={(v) => !v || v === 'Not Selected'}
      toggleOff="Not Selected"
    />
  );
}

/* ---------- розкривні пункти сетапу ---------- */

/* Три пункти сетапу (назва, скрін, логіка) — не завжди розгорнуті
   стосом полів, а компактні заголовки, що розкриваються по кліку:
   видно, що саме можна заповнити, а сама форма не займає екран,
   поки там нема чого показувати. */
function Disclosure({ title, summary, open, onToggle, children }) {
  return (
    <div className="overflow-hidden rounded-xl transition-colors duration-200" style={{ border: `1px solid ${open ? line(0.1) : line(0.06)}` }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-[42px] w-full items-center justify-between gap-3 px-4 text-left transition-colors duration-200"
        style={{ background: open ? FIELD_BG : 'transparent' }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-[14.5px] font-medium" style={{ fontFamily: T.sans, color: txt(0.45) }}>{title}</span>
          {summary && !open && (
            <span className="truncate text-[13.5px]" style={{ fontFamily: T.sans, color: txt(0.35) }}>{summary}</span>
          )}
        </span>
        <ChevronDown size={13} strokeWidth={2.4} style={{ color: txt(0.4), transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4" style={{ borderTop: `1px solid ${line(0.06)}` }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
          className="flex h-[52px] items-center gap-2 rounded-xl px-4 text-[15.5px] font-medium"
          style={{ fontFamily: T.sans, background: FIELD_BG, border: `1px solid ${open ? line(0.16) : line(0.08)}`, color: txt(0.8) }}
        >
          <CalendarDays size={13} strokeWidth={2.3} style={{ color: open ? ACCENT : txt(0.5) }} />
          {format(selected, 'd MMM yyyy', { locale: uk })}
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="rounded-2xl p-2"
          style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px var(--edge-panel-glow, rgba(0,0,0,0.5))' }}
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
            .edge-daypicker { --rdp-cell-size: 38px; --rdp-accent-color: ${ACCENT};
              --rdp-background-color: rgba(${ACCENT_RGB},0.14); margin: 0;
              font-family: ${T.sans}; color: ${txt(0.8)}; }
            .edge-daypicker .rdp-months { margin: 0; }
            .edge-daypicker .rdp-caption_label { font-size: 14px; font-weight: 700;
              color: var(--edge-text); text-transform: capitalize; letter-spacing: -0.01em; }
            .edge-daypicker .rdp-nav_button { color: ${txt(0.6)}; border-radius: 10px;
              width: 32px; height: 32px; transition: background .2s, color .2s; }
            .edge-daypicker .rdp-nav_button:hover { background: ${line(0.06)} !important; color: var(--edge-text); }
            .edge-daypicker .rdp-head_cell { font-size: 11.5px; font-weight: 700;
              text-transform: uppercase; letter-spacing: .08em; color: ${txt(0.4)}; }
            .edge-daypicker .rdp-day { border-radius: 10px; font-size: 13.5px; font-weight: 600;
              color: ${txt(0.8)}; border: 1px solid transparent;
              transition: background .18s, color .18s, border-color .18s; }
            .edge-daypicker .rdp-day:hover:not(.rdp-day_selected) {
              background: ${line(0.06)} !important; color: var(--edge-text); border-color: ${line(0.08)}; }
            .edge-daypicker .rdp-day_today:not(.rdp-day_selected) { color: ${ACCENT}; border-color: rgba(${ACCENT_RGB},0.35); }
            .edge-daypicker .rdp-day_selected, .edge-daypicker .rdp-day_selected:hover {
              background: ${ACCENT} !important; color: var(--edge-on-acc) !important; font-weight: 800; }
            .edge-daypicker .rdp-day_outside { color: ${txt(0.4)}; opacity: .55; }
          `}</style>
        </div>
      )}
    </Popover>
  );
}

/* ---------- рахунок ----------
   Той самий випадаючий список рахунків, що й був — джерело, поведінка
   і сама панель не змінюються, тільки тригер тепер сидить першою
   колонкою в об'єднаній картці (див. AccountRiskCard) замість
   окремого поля зі своєю рамкою й радіусом. */
function AccountPicker({ value, options, onChange }) {
  return (
    <Popover
      z={600}
      triggerClass="flex h-full"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-full w-full flex-col items-start gap-[7px] px-4 py-[17px] text-left transition-colors duration-200"
          style={{ background: open ? line(0.03) : 'transparent' }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = line(0.03); }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.22em', color: txt(0.45) }}>Акаунт</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: ACCENT, boxShadow: `0 0 7px rgba(${ACCENT_RGB},0.8)` }} />
            <span className="truncate text-[15.5px] font-semibold" style={{ fontFamily: T.sans, color: value ? 'var(--edge-text)' : txt(0.5) }}>{value || 'Немає акаунтів'}</span>
            <Caret color={txt(0.45)} open={open} />
          </span>
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[240px] overflow-hidden rounded-2xl p-1.5"
          style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px var(--edge-panel-glow, rgba(0,0,0,0.5))' }}
        >
          {options.length === 0 && (
            <div className="px-3 py-5 text-center text-[14.5px]" style={{ fontFamily: T.sans, color: txt(0.5) }}>
              Спочатку додай акаунт
            </div>
          )}
          {options.map((o) => {
            const on = o === value;
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); close(); }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[14.5px] font-medium transition-colors duration-200"
                style={{ fontFamily: T.sans, color: on ? ACCENT : txt(0.8), background: on ? `rgba(${ACCENT_RGB},0.10)` : 'transparent' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = line(0.06); }}
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

/* Сетап — той самий вільний текст із частотними підказками, що й був,
   але тепер тригер-поповер замість окремої картки з інпутом: набір
   попередніх сетапів у списку, свій варіант — рядком знизу. */
function SetupPicker({ value, onChange, options, height, radius }) {
  return (
    <MenuPicker
      title="Сетап"
      value={value}
      options={options && options.length ? options : []}
      onChange={onChange}
      placeholder="Сетап"
      isEmpty={(v) => !v?.trim()}
      allowCustom
      height={height}
      radius={radius}
    />
  );
}

/* ---------- об'єднана картка «рахунок · 1R · результат · ризик» (макет v12) ----------
   Три колонки зверху (рахунок / гроші в 1R / результат у R), знизу —
   один рядок: пресети ризику, ціль у R і сетап. Розрахунок 1R і колір
   результату — та сама логіка, що була в RiskCard. */
function AccountRiskCard({
  account, accountOptions, onAccount, risk, setRisk, rr, setRr, balance, setup, setSetup, setupOptions,
}) {
  const pct = parseFloat(String(risk).replace('%', '').replace(',', '.')) || 0;
  const oneR = balance ? Math.round(balance * pct / 100) : null;
  const rNum = parseFloat(String(rr).replace(',', '.'));
  const hasR = !Number.isNaN(rNum);
  const rColor = !hasR ? txt(0.4) : rNum > 0 ? GREEN : rNum < 0 ? BAD : 'var(--edge-text)';
  const setPct = (v) => setRisk(`${v}%`);

  return (
    <div className="overflow-hidden rounded-[14px]" style={{ border: `1px solid ${line(0.08)}`, background: line(0.018) }}>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr) auto' }}>
        <div style={{ borderRight: `1px solid ${line(0.07)}` }}>
          <AccountPicker value={account} options={accountOptions} onChange={onAccount} />
        </div>

        <div className="flex flex-col gap-[6px] px-4 py-[17px]" style={{ borderRight: `1px solid ${line(0.07)}` }}>
          <div className="text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.22em', color: txt(0.45) }}>1R у грошах</div>
          <div className="flex items-baseline gap-[3px]">
            <span className="text-[14.5px] font-medium" style={{ fontFamily: T.sans, color: txt(0.55) }}>$</span>
            <span className="text-[26.5px] font-semibold leading-none" style={{ fontFamily: MONO, letterSpacing: '-0.04em', color: 'var(--edge-text)' }}>
              {oneR != null ? oneR.toLocaleString('en-US') : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-[6px] px-4 py-[17px]">
          <div className="text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.22em', color: txt(0.45) }}>Результат</div>
          <div className="text-[19px] font-semibold leading-[1.25]" style={{ fontFamily: MONO, letterSpacing: '-0.02em', color: hasR ? rColor : txt(0.45) }}>
            {hasR ? `${rNum > 0 ? '+' : ''}${rNum.toFixed(2)}R` : '0.00R'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-[10px] gap-y-3 px-5 py-4" style={{ borderTop: `1px solid ${line(0.07)}` }}>
        <span className="shrink-0 text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.22em', color: txt(0.45) }}>Ризик</span>
        <div className="flex shrink-0 gap-1">
          {['0.25', '0.5', '1', '2'].map((v) => {
            const on = pct === parseFloat(v);
            return (
              <button
                key={v}
                type="button"
                onClick={() => setPct(v)}
                className="flex h-11 items-center rounded-[11px] px-3.5 text-[13px] font-medium transition-all duration-200"
                style={{
                  fontFamily: MONO,
                  background: on ? `rgba(${ACCENT_RGB},0.14)` : 'transparent',
                  border: `1px solid ${on ? `rgba(${ACCENT_RGB},0.42)` : line(0.07)}`,
                  color: on ? '#b6a4ff' : txt(0.52),
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = line(0.05); }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
              >
                {v}%
              </button>
            );
          })}
        </div>

        <span className="h-[18px] w-px shrink-0" style={{ background: line(0.08) }} />

        <span className="shrink-0 text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.22em', color: txt(0.45) }}>Ціль</span>
        <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-[11px] px-3.5" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${line(0.07)}` }}>
          <input
            value={rr}
            onChange={(e) => setRr(e.target.value.replace(',', '.'))}
            inputMode="decimal"
            placeholder="2.5"
            className="w-[40px] bg-transparent text-[14px] outline-none"
            style={{ fontFamily: MONO, color: hasR ? rColor : 'var(--edge-text)' }}
          />
          <span className="shrink-0 text-[11px]" style={{ fontFamily: MONO, color: txt(0.42) }}>R</span>
        </div>

        <div className="min-w-[200px] flex-1">
          <SetupPicker value={setup} onChange={setSetup} options={setupOptions} height={44} radius={11} />
        </div>
      </div>
    </div>
  );
}

/* ---------- зона для скріншота ---------- */
/* Горизонтальна дропзона з макета: іконка зліва, підпис справа, а не
   центрований квадрат. Коли є картинка — звичайний превʼю з хрестиком. */
function ShotZone({ image, onPaste, onClear, label, tone, compact }) {
  if (compact) {
    return (
      <div onPaste={onPaste} tabIndex={0} className="outline-none">
        {image ? (
          <div className="group relative w-full overflow-hidden rounded-2xl" style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}` }}>
            <img src={image} alt="" className="block max-h-[280px] w-full object-contain" />
            <button
              type="button"
              onClick={onClear}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl opacity-0 transition-all duration-200 group-hover:opacity-100"
              style={{ background: 'var(--edge-panel, rgba(10,10,12,0.82))', border: `1px solid ${line(0.14)}`, color: txt(0.85), backdropFilter: 'blur(8px)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = BAD; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.85); }}
            >
              <X size={15} strokeWidth={2.6} />
            </button>
          </div>
        ) : (
          <motion.div
            whileTap={{ scale: 0.98 }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition-colors duration-200"
            style={{ fontFamily: T.sans, background: 'transparent', border: `1px dashed ${line(0.16)}`, color: txt(0.5) }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.4)`)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = line(0.16))}
          >
            <ImagePlus size={13} strokeWidth={2} />
            {label}
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div onPaste={onPaste} tabIndex={0} className="w-full outline-none">
      {image ? (
        <div className="group relative w-full overflow-hidden rounded-xl" style={{ border: `1px solid ${line(0.08)}`, background: FIELD_BG }}>
          <img src={image} alt="" className="block h-auto w-full" />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl opacity-0 transition-all duration-200 group-hover:opacity-100"
            style={{ background: 'var(--edge-panel, rgba(10,10,12,0.82))', border: `1px solid ${line(0.14)}`, color: txt(0.8), backdropFilter: 'blur(8px)' }}
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
      ) : (
        <motion.div
          whileHover={{ y: -1 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="flex cursor-pointer items-center gap-3.5 rounded-xl p-4 transition-colors duration-200"
          style={{ border: `1px dashed ${line(0.14)}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = tone ? `rgba(${BAD_RGB},0.4)` : `rgba(${ACCENT_RGB},0.4)`)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = line(0.14))}
        >
          <div className="grid h-6 w-[30px] shrink-0 place-items-center rounded-[5px]" style={{ border: `1px solid ${txt(0.35)}` }}>
            <ImagePlus size={13} strokeWidth={1.9} style={{ color: txt(0.5) }} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[15.5px] font-medium" style={{ fontFamily: T.sans, color: txt(0.72) }}>{label}</span>
            <span className="text-[13.5px]" style={{ fontFamily: MONO, color: txt(0.5) }}>перетягни або обери · PNG / JPG</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ---------- сітка розбору (макет «Розбір виконання») ----------

   Сім питань — не стос карток, а щільна сітка 4×2: у клітинці коротка
   назва і дві мікрокнопки. Восьма клітинка — «Дисципліна»: рахунок
   чистих відповідей і сім планок. Під сіткою рядок-підказка: повне
   питання тієї клітинки, над якою миша (або останньої відповіді), і
   вердикт. Колір відповіді — не «так/ні», а «добре/погано»: «ні» на
   FOMO — зелене, «так» на страх — бурштинове. */
const AMBER_RGB = '245,181,74';
const toneOf = (q, v) => (v === null || v === undefined ? null : v === q.good ? { c: GREEN, rgb: GREEN_RGB } : { c: AMBER, rgb: AMBER_RGB });

function plural(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} відповідь`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} відповіді`;
  return `${n} відповідей`;
}

function ReviewGrid({ values, setters }) {
  const [hov, setHov] = useState(null);
  const [cur, setCur] = useState(0);

  const done = QUESTIONS.filter((q) => values[q.key] !== null).length;
  const clean = QUESTIONS.filter((q) => values[q.key] !== null && values[q.key] === q.good).length;
  const full = done === QUESTIONS.length;
  const hi = hov ?? cur;

  const scoreColor = !done ? txt(0.3) : clean >= done - 1 ? GREEN : clean * 2 >= done ? AMBER : BAD;
  const verdict = !full
    ? { text: `Лишилось ${QUESTIONS.length - done}`, c: '#b3a6ff', rgb: ACCENT_RGB }
    : clean === 7 ? { text: 'Чисте виконання', c: GREEN, rgb: GREEN_RGB, glow: true }
      : clean >= 5 ? { text: 'Дрібні зриви', c: AMBER, rgb: AMBER_RGB }
        : { text: 'Емоції керували', c: '#ff7d88', rgb: BAD_RGB };

  const set = (i, key, v) => {
    /* повторний клік знімає відповідь — інакше помилкову не прибрати */
    setters[key](values[key] === v ? null : v);
    setCur(i);
  };

  return (
    <div className="overflow-hidden rounded-[18px]" style={{ background: CARD_BG, border: `1px solid ${line(0.05)}` }}>
      <div className="grid grid-cols-2 sm:grid-cols-4">
        {QUESTIONS.map((q, i) => {
          const v = values[q.key];
          const tone = toneOf(q, v);
          const tn = tone || { c: '#a89bf9', rgb: ACCENT_RGB };
          return (
            <div
              key={q.key}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov(null)}
              className="flex h-[88px] flex-col justify-between gap-3 px-[14px] py-[13px] transition-colors duration-200"
              style={{
                borderRight: `1px solid ${line(0.05)}`,
                borderTop: `1px solid ${line(0.05)}`,
                marginTop: -1,
                background: hov === i ? line(0.035) : tone ? `rgba(${tone.rgb},0.05)` : 'transparent',
              }}
            >
              <div className="flex items-center gap-[7px]">
                <span className="h-[5px] w-[5px] shrink-0 rounded-full transition-colors duration-200" style={{ background: tone ? tone.c : line(0.14) }} />
                <span className="truncate text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.2em', color: txt(0.55) }}>{q.short}</span>
              </div>
              <div className="flex gap-1.5">
                {[true, false].map((opt) => {
                  const active = v === opt;
                  return (
                    <button
                      key={String(opt)}
                      type="button"
                      onClick={() => set(i, q.key, opt)}
                      className="flex h-[30px] flex-1 items-center justify-center rounded-lg text-[13px] transition-all duration-150"
                      style={{
                        fontFamily: T.sans,
                        fontWeight: active ? 600 : 500,
                        background: active ? `rgba(${tn.rgb},0.14)` : 'rgba(0,0,0,0.25)',
                        border: `1px solid ${active ? `rgba(${tn.rgb},0.36)` : line(0.06)}`,
                        color: active ? tn.c : txt(0.6),
                      }}
                    >
                      {opt ? 'Так' : 'Ні'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="flex h-[88px] flex-col justify-between gap-3 px-4 py-[13px]" style={{ background: `rgba(${ACCENT_RGB},0.07)`, borderTop: `1px solid ${line(0.05)}`, marginTop: -1 }}>
          <span className="text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.2em', color: '#9b8cfa' }}>Дисципліна</span>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[22px] font-semibold leading-none transition-colors duration-200" style={{ fontFamily: T.sans, letterSpacing: '-0.01em', color: scoreColor }}>
              {done ? `${clean}/${done}` : '—'}
            </span>
            <span className="flex items-end gap-[3px]">
              {QUESTIONS.map((q) => {
                const tone = toneOf(q, values[q.key]);
                return (
                  <span
                    key={q.key}
                    className="w-[3px] rounded-sm transition-all duration-300"
                    style={{ height: tone ? 16 : 7, background: tone ? tone.c : line(0.12) }}
                  />
                );
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-[46px] items-center gap-3 px-4 py-2" style={{ borderTop: `1px solid ${line(0.05)}`, background: 'rgba(0,0,0,0.18)' }}>
        <span className="shrink-0 text-[10.5px] font-medium" style={{ fontFamily: MONO, letterSpacing: '0.14em', color: '#a89bf9' }}>
          {String(hi + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 text-[14px] leading-[1.3]" style={{ fontFamily: T.sans, color: txt(0.75) }}>
          {QUESTIONS[hi].q}
        </span>
        <span
          className="shrink-0 rounded-lg px-[11px] py-1.5 text-[10px] font-semibold uppercase transition-all duration-300"
          style={{
            fontFamily: MONO,
            letterSpacing: '0.16em',
            background: `rgba(${verdict.rgb},0.14)`,
            border: `1px solid rgba(${verdict.rgb},0.34)`,
            color: verdict.c,
            boxShadow: verdict.glow ? `0 0 26px rgba(${verdict.rgb},0.18)` : 'none',
          }}
        >
          {verdict.text}
        </span>
      </div>
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
  /* Скрінів сетапу може бути декілька — як в аналізі угоди: галерея
     з лупою й фулскріном (ImageSlider), а не одна картинка. */
  const [tradeImages, setTradeImages] = useState([]);

  /* Сетап і час — те, без чого три розділи аналітики показували
     порожнечу. Сетап вільним текстом: своя назва — частина системи
     трейдера, і чужий перелік або не збігається з його мовою, або
     змушує підганяти під неї. Підказки збираються з його ж
     попередніх угод. */
  const [setupName, setSetupName] = useState('');
  const [setupOptions, setSetupOptions] = useState(DEFAULT_SETUPS);
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
      {
        let tImgs = [];
        if (Array.isArray(existingTrade.trade_images) && existingTrade.trade_images.length > 0) tImgs = existingTrade.trade_images;
        else if (existingTrade.trade_image) tImgs = [existingTrade.trade_image];
        setTradeImages(tImgs);
      }
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
      setTradeDescription(''); setTradeImages([]);
      setSetupName(''); setEntryTime(''); setExitTime('');
      setFollowedPlan(null); setRushed(null); setHasMistake(null);
      setMistakeText(''); setMistakeImages([]);
      setPsyConfident(null); setPsyFear(null); setPsyRepeat(null); setPsyRevenge(null); setPsyNotes('');
      setErrDraft(null);
    }
    setComposerOpen(false);

    /* Рахунок за замовчуванням — перший АКТИВНИЙ. Раніше брався просто
       перший у списку, і нова угода могла тихо лягти на архівний
       рахунок, якого людина вже не бачить на сторінці рахунків. */
    const firstOpen = (list) => list.find(isOpenAccount)?.firm_name;

    if (listCache.accounts) {
      setAccounts(listCache.accounts);
      if (!accToSet) setAccount(firstOpen(listCache.accounts) || '');
    } else {
      supabase.from('prop_accounts').select('id, firm_name, balance, status').then(({ data }) => {
        if (data) {
          listCache.accounts = data;
          setAccounts(data);
          if (!accToSet) setAccount(firstOpen(data) || '');
        }
      });
    }

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
        const mine = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
        setSetupOptions([...new Set([...mine, ...DEFAULT_SETUPS])].slice(0, 12));
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

  /* Скрін сетапу — приймає і те, і те: звичайний скріншот
     (Ctrl+V картинки) і посилання на графік з TradingView. */
  const removeTradeImage = (i) => setTradeImages((p) => p.filter((_, idx) => idx !== i));
  const [setupDropHot, setSetupDropHot] = useState(false);

  const pasteSetup = pasteInto((src) => setTradeImages((p) => [...p, src]));

  const dropSetup = (e) => {
    e.preventDefault();
    setSetupDropHot(false);
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    if (url && url.startsWith('http')) setTradeImages((p) => [...p, url]);
    else notify.error('Не вийшло', 'Перетягни посилання, а не файл.');
  };

  /* ---------- перевірки ---------- */

  const step1Missing = !selectedPair?.trim() || !tradeDate || !account || !risk?.trim();
  /* Той самий набір обов'язкових полів, що й у step1Missing, — лічильник
     у футері має показувати правду, а не вигадану цифру з макета. */
  const step1LeftCount = [!selectedPair?.trim(), !tradeDate, !account, !risk?.trim()].filter(Boolean).length;

  /* Значення семи питань розбору, в порядку QUESTIONS */
  const psyValues = { followedPlan, rushed, hasMistake, psyConfident, psyFear, psyRepeat, psyRevenge };
  const psySetters = {
    followedPlan: setFollowedPlan, rushed: setRushed, hasMistake: setHasMistake,
    psyConfident: setPsyConfident, psyFear: setPsyFear, psyRepeat: setPsyRepeat, psyRevenge: setPsyRevenge,
  };
  /* У короткому режимі обовʼязкові тільки три перших питання, з яких
     будується статистика; решта — відповідай, якщо хочеш, але
     картки видно всі сім одразу, як у макеті. */
  const psyShort = psyMode === 'short';
  const requiredKeys = psyShort ? ['followedPlan', 'rushed', 'hasMistake'] : QUESTIONS.map((q) => q.key);
  const psyTotal = requiredKeys.length;
  const psyAnswered = requiredKeys.filter((k) => psyValues[k] !== null).length;
  const psyMissing = psyAnswered < psyTotal;
  const psyDoneAll = QUESTIONS.filter((q) => psyValues[q.key] !== null).length;

  const goNext = () => {
    setTouched(true);
    if (step1Missing) {
      setErrorMsg('Заповни актив, дату, акаунт і ризик.');
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
      return setErrorMsg('Заповни актив, дату, акаунт і ризик.');
    }
    if (psyMissing) return setErrorMsg('Дай відповідь на всі питання розбору — саме вони роблять журнал корисним.');
    if (hasMistake && !mistakeText.trim()) return setErrorMsg('Опиши помилку — інакше за місяць не згадаєш.');

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
        trade_description: tradeDescription,
        trade_image: tradeImages[0] || null,
        trade_images: tradeImages.length ? tradeImages : null,
        followed_plan: followedPlan, rushed, has_mistake: hasMistake,
        mistake_description: mistakeText, mistake_images: mistakeImages,
        psy_confident: psyConfident, psy_fear: psyFear, psy_repeat: psyRepeat,
        psy_revenge: psyRevenge, psy_notes: psyNotes,
      };

      let tradeId = existingTrade?.id || null;

      if (existingTrade) {
        const { error } = await supabase.from('trades').update(payload).eq('id', existingTrade.id);
        if (error) throw error;
        notify.success('Оновлено', 'Угоду успішно оновлено.');
      } else {
        /* id потрібен одразу: за ним помилка знайде дорогу назад до
           угоди, з якої вона взялась */
        const { data, error } = await supabase.from('trades').insert([payload]).select('id').single();
        if (error) throw error;
        tradeId = data?.id || null;

        if (hasMistake) notify.error('Помилку записано', 'Вона вже чекає в Журналі помилок — там її можна розібрати.');
        else notify.success('Угоду збережено', 'Угоду додано в журнал.');

        /* Авто-рух балансу проп-акаунта — тільки для нових угод, щоб
           не порахувати той самий трейд двічі й не чіпати заднім
           числом угоди, залоговані до цієї фічі. Не блокує збереження
           трейду: якщо акаунт не знайдено чи профіт не рахується —
           просто нічого не рухаємо. */
        try {
          const accRow = accounts.find((a) => a.firm_name === account);
          if (accRow) {
            const accountsMap = { [account]: Number(accRow.balance) || 0 };
            const profit = getTradeProfit(payload, accountsMap);
            if (profit) {
              const { account: updatedAcc } = await logTradeMovement(user?.id, accRow, {
                profit,
                happened_at: tradeDate,
                note: `${selectedPair} · ${DIRECTION_LABEL[tradeType] || tradeType} · ${result}`,
              });
              if (listCache.accounts) {
                listCache.accounts = listCache.accounts.map((a) => (a.id === updatedAcc.id ? updatedAcc : a));
              }
            }
          }
        } catch (e) {
          console.error('auto account balance', e);
        }
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

  /* У виборі лише активні рахунки — так само, як їх ділить сторінка
     рахунків (status !== 'Closed'). Виняток один: рахунок угоди, яку
     редагують. Якщо його вже архівували, він лишається у списку, інакше
     поле показало б порожнечу, а збереження тихо перекинуло б стару
     угоду на інший рахунок. Кеш списку не фільтруємо — він спільний. */
  const accountOptions = accounts
    .filter((a) => isOpenAccount(a) || (existingTrade && a.firm_name === existingTrade.account_name))
    .map((a) => a.firm_name);
  const submitReady = psyDoneAll === 7 && !psyMissing;

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
          style={{ background: `radial-gradient(circle at 50% -12%, rgba(${ACCENT_RGB},0.12), transparent 55%), rgba(6,6,8,0.82)`, backdropFilter: 'blur(10px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={SPRING}
            className="my-auto flex max-h-[calc(100vh-36px)] w-full max-w-[900px] flex-col overflow-hidden rounded-[20px]"
            style={{ background: CARD_BG, border: `1px solid ${line(0.08)}`, boxShadow: '0 40px 110px -10px rgba(0,0,0,0.65), 0 0 0 1px var(--edge-hair) inset' }}
          >
            {/* ─────────── Шапка ─────────── */}
            <div className="flex shrink-0 items-center justify-between gap-5 px-6 pb-3 pt-[14px]" style={{ borderBottom: `1px solid ${line(0.06)}` }}>
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase" style={{ fontFamily: MONO, letterSpacing: '0.28em', color: txt(0.45) }}>
                  {step === 0
                    ? `Запис журналу · ${tradeDate || todayLocal()}`
                    : `Запис журналу · ${selectedPair || '—'} · ${DIRECTION_LABEL[tradeType] || tradeType} · ${rr ? `${rr}R` : '—'}`}
                </div>
                <h2 className="mt-[5px] text-[23px] font-bold leading-[1.1]" style={{ fontFamily: T.display, color: 'var(--edge-text)', letterSpacing: '-0.03em' }}>
                  {step === 0
                    ? (existingTrade ? 'Редагувати угоду' : 'Записати угоду')
                    : 'Розбір виконання'}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-3.5">
                <div className="flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em' }}>
                  <button
                    type="button"
                    onClick={goBack}
                    style={{ color: step === 0 ? 'var(--edge-text)' : ACCENT, fontWeight: step === 0 ? 600 : 500, transition: 'color .2s' }}
                  >
                    {step > 0 ? '✓ ' : '01 '}ЦИФРИ
                  </button>
                  <span className="h-px w-3" style={{ background: line(0.16) }} />
                  <button
                    type="button"
                    onClick={goNext}
                    style={{ color: step === 1 ? 'var(--edge-text)' : txt(0.45), fontWeight: step === 1 ? 600 : 500, transition: 'color .2s' }}
                  >
                    02 РОЗБІР
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-all duration-200"
                  style={{ background: 'transparent', border: `1px solid ${line(0.08)}`, color: txt(0.55) }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = line(0.06); e.currentTarget.style.color = 'var(--edge-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = txt(0.55); }}
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* ─────────── Тіло ─────────── */}
            <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-[14px]" style={{ scrollbarWidth: 'thin' }}>
                {/* Крок міняється без AnimatePresence-exit: усередині
                    кроку 1 живуть портальні поповери, і їхнє
                    розмонтування під час exit-анімації підвішувало
                    framer, і крок 2 не з являвся. */}
                <div>
                  {step === 0 ? (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex flex-col gap-[10px]"
                    >
                      {/* Скрін графіка — компактна зона з макета v12; коли
                          скрінів уже є — та сама галерея з лупою й
                          фулскріном (ImageSlider), просто без окремого
                          підпису-секції над нею. */}
                      <div
                        onPaste={pasteSetup}
                        onDragOver={(e) => { e.preventDefault(); setSetupDropHot(true); }}
                        onDragLeave={() => setSetupDropHot(false)}
                        onDrop={dropSetup}
                        tabIndex={0}
                        className="relative rounded-[13px] outline-none transition-colors duration-200"
                        style={{ background: line(0.02), border: `1px solid ${setupDropHot ? `rgba(${ACCENT_RGB},0.42)` : line(0.07)}` }}
                      >
                        {tradeImages.length > 0 && (
                          <span
                            className="pointer-events-none absolute left-[14px] top-[14px] z-[3] rounded-lg px-2.5 py-[5px] text-[11.5px] uppercase"
                            style={{ fontFamily: MONO, letterSpacing: '0.14em', color: ACCENT, background: 'var(--edge-panel, rgba(10,10,14,0.85))', border: `1px solid ${line(0.1)}` }}
                          >
                            {`Скрін ${tradeImages.length}`}
                          </span>
                        )}

                        {tradeImages.length > 0 ? (
                          <div className="overflow-hidden rounded-[13px]">
                            <ImageSlider images={tradeImages} containerClassName="h-[220px] w-full" />
                            <div className="flex flex-wrap items-center gap-2 p-2.5" style={{ borderTop: `1px solid ${line(0.06)}` }}>
                              {tradeImages.map((img, i) => (
                                <div key={i} className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${line(0.08)}` }}>
                                  <img src={img} alt="" className="h-full w-full object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => removeTradeImage(i)}
                                    className="absolute inset-0 hidden items-center justify-center transition-colors group-hover:flex"
                                    style={{ background: 'rgba(10,10,12,0.68)', color: 'var(--edge-text)' }}
                                  >
                                    <X size={12} strokeWidth={2.8} />
                                  </button>
                                </div>
                              ))}
                              <span className="text-[13px]" style={{ fontFamily: T.sans, color: txt(0.4) }}>Ctrl+V або перетягни — додати ще</span>
                            </div>
                          </div>
                        ) : (
                          <motion.div
                            animate={{ background: setupDropHot ? `rgba(${ACCENT_RGB},0.045)` : 'transparent' }}
                            className="grid h-[150px] cursor-text place-items-center rounded-[13px] text-center"
                          >
                            <div className="flex flex-col items-center gap-[9px]">
                              <ImagePlus size={20} strokeWidth={1.5} style={{ color: setupDropHot ? ACCENT : txt(0.5) }} />
                              <span className="text-[14px] font-medium" style={{ fontFamily: T.sans, color: setupDropHot ? ACCENT : txt(0.58) }}>
                                {setupDropHot ? 'Відпускай' : 'Встав або перетягни скріншот'}
                              </span>
                              <span className="text-[10px] uppercase" style={{ fontFamily: MONO, letterSpacing: '0.16em', color: txt(0.45) }}>
                                Ctrl+V · або посилання TradingView
                              </span>
                            </div>
                          </motion.div>
                        )}
                      </div>

                      {/* Актив і напрямок */}
                      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <AssetPicker value={selectedPair} onChange={setSelectedPair} />
                        <DirectionToggle value={tradeType} onChange={setTradeType} />
                      </div>

                      {/* Рахунок · 1R · результат · ризик · сетап — одна картка з макета v12 */}
                      <AccountRiskCard
                        account={account}
                        accountOptions={accountOptions}
                        onAccount={setAccount}
                        risk={risk}
                        setRisk={setRisk}
                        rr={rr}
                        setRr={setRr}
                        balance={Number(accounts.find((a) => a.firm_name === account)?.balance) || null}
                        setup={setupName}
                        setSetup={setSetupName}
                        setupOptions={setupOptions}
                      />

                      {/* Сесія і статус */}
                      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <SessionPicker value={session} onChange={setSession} />
                        <StatusPicker value={result} onChange={setResult} />
                      </div>

                      {/* Нотатка — один рядок з макета v12: іконка ліворуч,
                          лічильник символів справа. Той самий tradeDescription,
                          що й раніше — просто без окремої великої textarea. */}
                      <div className="edge-note-field flex h-12 items-center gap-2.5 rounded-xl px-[15px] transition-colors duration-200" style={{ background: line(0.02), border: `1px solid ${line(0.07)}` }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={txt(0.5)} strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h9" /></svg>
                        <input
                          value={tradeDescription}
                          onChange={(e) => setTradeDescription(e.target.value)}
                          placeholder="Логіка входу, підтвердження, емоції…"
                          className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium outline-none placeholder:opacity-60"
                          style={{ fontFamily: T.sans, color: 'var(--edge-text)' }}
                        />
                        <span className="shrink-0 text-[11px]" style={{ fontFamily: MONO, color: txt(0.42) }}>{tradeDescription.length}</span>
                      </div>
                      <style>{`.edge-note-field:focus-within { border-color: rgba(${ACCENT_RGB},0.4) !important; }`}</style>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex flex-col gap-3 py-5"
                    >
                      <ReviewGrid values={psyValues} setters={psySetters} />

                      {/* Розбір помилки — функціональний блок понад
                          макет: помилка з угоди летить у Журнал
                          помилок, і без детального опису та категорій
                          там залишилась би тільки автовгадана картка. */}
                      <AnimatePresence>
                        {hasMistake === true && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col gap-3 rounded-xl p-4" style={{ background: `rgba(${BAD_RGB},0.05)`, border: `1px solid rgba(${BAD_RGB},0.22)` }}>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <AlertTriangle size={14} strokeWidth={2.4} style={{ color: BAD }} />
                                <span className="text-[13.5px] font-semibold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: BAD }}>
                                  Розбір помилки
                                </span>

                                {errDraft?.cats?.length > 0 && (
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    {errDraft.cats.map((id) => {
                                      const c = CATS.find((x) => x.id === id);
                                      if (!c) return null;
                                      return (
                                        <span
                                          key={id}
                                          className="rounded-md px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.08em]"
                                          style={{ fontFamily: T.sans, color: c.color, background: `${c.color}1a`, border: `1px solid ${c.color}38` }}
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
                                    setErrForm({
                                      pair: errDraft?.pair || selectedPair || '',
                                      desc: mistakeText,
                                      reasons: errDraft?.reasons || [],
                                      tvLink: errDraft?.tvLink || mistakeImages[0] || tradeImages[0] || '',
                                      cats: errDraft?.cats?.length
                                        ? errDraft.cats
                                        : catsFromTrade({
                                          psy_revenge: psyRevenge, rushed, psy_fear: psyFear,
                                          psy_repeat: psyRepeat, followed_plan: followedPlan,
                                        }),
                                    });
                                    setComposerOpen(true);
                                  }}
                                  className="ml-auto flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[14px] font-semibold transition-colors duration-200"
                                  style={{ fontFamily: T.sans, background: 'transparent', border: `1px solid rgba(${BAD_RGB},0.3)`, color: BAD }}
                                >
                                  {errDraft ? 'Редагувати розбір' : 'Розібрати'}
                                </button>
                              </div>

                              {mistakeImages.length === 0 ? (
                                <ShotZone image={null} onPaste={pasteMistake} label="Встав скріншоти помилки" tone={BAD} />
                              ) : (
                                <div onPaste={pasteMistake} tabIndex={0} className="grid grid-cols-2 gap-2.5 outline-none">
                                  {mistakeImages.map((img, i) => (
                                    <div key={i} className="group relative aspect-video overflow-hidden rounded-xl" style={{ border: `1px solid rgba(${BAD_RGB},0.25)`, background: FIELD_BG }}>
                                      <img src={img} alt="" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => removeMistakeImage(i)}
                                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                        style={{ background: 'var(--edge-panel, rgba(10,10,12,0.82))', border: `1px solid ${line(0.14)}`, color: BAD }}
                                      >
                                        <X size={13} strokeWidth={2.8} />
                                      </button>
                                    </div>
                                  ))}
                                  <div className="grid aspect-video place-items-center rounded-xl text-center text-[13.5px] font-medium" style={{ border: `1px dashed rgba(${BAD_RGB},0.25)`, background: FIELD_BG, color: txt(0.5), fontFamily: T.sans }}>
                                    ще один<br />Ctrl+V
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={mistakeText}
                                onChange={(e) => setMistakeText(e.target.value)}
                                placeholder="Детально опиши помилку, щоб не повторити її…"
                                className="min-h-[80px] w-full resize-y rounded-xl p-4 text-[15.5px] outline-none"
                                style={{ background: FIELD_BG, border: `1px solid ${touched && !mistakeText.trim() ? `rgba(${BAD_RGB},0.4)` : 'var(--edge-line)'}`, color: txt(0.85), fontFamily: T.sans, lineHeight: 1.55 }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex min-h-[54px] items-center gap-3.5 rounded-2xl px-[18px] transition-colors duration-200" style={{ background: CARD_BG, border: `1px solid ${line(0.05)}` }}>
                        <span className="flex shrink-0 flex-col gap-[3px]">
                          <span className="h-[1.5px] w-[13px]" style={{ background: txt(0.4) }} />
                          <span className="h-[1.5px] w-[13px]" style={{ background: txt(0.4) }} />
                          <span className="h-[1.5px] w-[9px]" style={{ background: txt(0.4) }} />
                        </span>
                        <textarea
                          value={psyNotes}
                          onChange={(e) => setPsyNotes(e.target.value)}
                          rows={1}
                          placeholder="Що зіпсувало або зберегло цю угоду?"
                          className="min-w-0 flex-1 resize-none bg-transparent py-4 text-[15px] leading-[1.4] outline-none placeholder:opacity-60"
                          style={{ fontFamily: T.sans, color: txt(0.85), fieldSizing: 'content' }}
                        />
                        <span className="shrink-0 text-[11.5px] font-medium" style={{ fontFamily: MONO, color: txt(0.4) }}>{psyNotes.length}</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* ─────────── Підвал ─────────── */}
              <div className="flex shrink-0 flex-col gap-2.5 px-6 py-[9px]" style={{ borderTop: `1px solid ${line(0.07)}`, background: FOOTER_BG }}>
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium"
                      style={{ background: `rgba(${BAD_RGB},0.09)`, border: `1px solid rgba(${BAD_RGB},0.25)`, color: BAD, fontFamily: T.sans }}
                    >
                      <AlertCircle size={14} strokeWidth={2.4} className="shrink-0" />
                      {errorMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between gap-5">
                  <div className="flex items-center gap-2.5 text-[13.5px] font-medium" style={{ fontFamily: T.sans, color: txt(0.55) }}>
                    <span className="h-[5px] w-[5px] shrink-0 animate-pulse rounded-full" style={{ background: GREEN, boxShadow: `0 0 8px 1px rgba(${GREEN_RGB},0.5)` }} />
                    <span className="hidden sm:inline">Чернетка зберігається автоматично</span>
                  </div>

                  <div className="flex shrink-0 flex-nowrap items-center gap-3">
                    <span className="hidden whitespace-nowrap text-[13.5px] font-medium sm:block" style={{ fontFamily: T.sans, color: step === 0 ? (step1LeftCount === 0 ? GREEN : txt(0.5)) : (submitReady ? GREEN : txt(0.5)) }}>
                      {step === 0
                        ? (step1LeftCount === 0 ? 'Можна продовжувати' : `Залишилось полів: ${step1LeftCount}`)
                        : (submitReady ? 'Можна записувати' : `Лишилось ${plural(7 - psyDoneAll)}`)}
                    </span>

                    {step === 1 && (
                      <button
                        type="button"
                        onClick={goBack}
                        className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] px-5 text-[14.5px] font-medium transition-colors duration-200"
                        style={{ fontFamily: T.sans, background: 'transparent', border: `1px solid ${line(0.1)}`, color: txt(0.65) }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--edge-text)'; e.currentTarget.style.borderColor = line(0.22); }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.65); e.currentTarget.style.borderColor = line(0.1); }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H6M11 6l-6 6 6 6" /></svg>
                        Назад
                      </button>
                    )}

                    {step === 0 ? (
                      <button
                        type="button"
                        onClick={goNext}
                        className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] px-5 text-[14.5px] font-semibold transition-all duration-200 active:scale-[0.98]"
                        style={{ fontFamily: T.sans, background: ACCENT, color: 'var(--edge-on-acc)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)'; e.currentTarget.style.boxShadow = `0 10px 30px -6px rgba(${ACCENT_RGB},0.55)`; }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        Далі
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading || !submitReady}
                        className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[13px] px-[22px] text-[14.5px] font-semibold transition-all duration-200"
                        style={{
                          fontFamily: T.sans,
                          cursor: submitReady ? 'pointer' : 'not-allowed',
                          background: submitReady ? ACCENT : line(0.05),
                          color: submitReady ? 'var(--edge-on-acc)' : txt(0.42),
                          border: `1px solid ${submitReady ? ACCENT : line(0.07)}`,
                          boxShadow: submitReady ? `0 0 36px rgba(${ACCENT_RGB},0.35)` : 'none',
                          opacity: loading ? 0.7 : 1,
                        }}
                      >
                        {loading ? <Loader2 size={14} strokeWidth={3} className="animate-spin" /> : null}
                        {existingTrade ? 'Оновити угоду' : 'Записати угоду'}
                        {!loading && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </form>
          </motion.div>

          {/* Той самий композер, що й на сторінці помилок — він сам
              іде в портал на body, тому центрується по екрану, а не
              по цій формі.

              Зберігає в стан, а не в базу: угоди може ще не існувати.
              Усе долетить разом при збереженні угоди.

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
