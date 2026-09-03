import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import {
  X, ImagePlus, Loader2, AlertCircle, AlertTriangle,
  CalendarDays, ChevronDown, Search, Check, Plus, Pencil,
  Wallet,
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

/* Літеральна гама макета, а не токени застосунку: момент запису
   угоди — дія, а не навігація, тож він свідомо виглядає інакше за
   решту UI. Кольори фіксовані (не CSS var(...)), тому alpha-суфікс
   на кшталт `${ACCENT}22` — валідний 8-значний hex і безпечний. */
const ACCENT = '#2FE3A8';
const ACCENT_RGB = '47,227,168';
const PURPLE = '#7C6CF6';
const BAD = '#FF5C6E';
const BAD_RGB = '255,92,110';
const AMBER = '#F5B54A';
const CARD_BG = '#101214';
const FOOTER_BG = '#0c0e10';
const FIELD_BG = '#15181b';
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace";

const txt = (a) => `rgba(242,244,243,${a})`;
const line = (a) => `rgba(255,255,255,${a})`;

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
/* Внутрішні значення лишаються Win/Lose/… (модель даних і решта
   застосунку на них зав'язані), надпис — Take/Stop, як усюди в
   журналі. */
const RESULT_CHIPS = ['Win', 'Lose', 'BE', 'In Progress', 'Missed'];
const RESULT_LABEL = { Win: 'Take', Lose: 'Stop', BE: 'BE', 'In Progress': 'In Progress', Missed: 'Missed' };
const RESULT_COLORS = {
  Win: { c: ACCENT, rgb: ACCENT_RGB },
  Lose: { c: BAD, rgb: BAD_RGB },
  BE: { c: AMBER, rgb: '245,181,74' },
  'In Progress': { c: '#60a5fa', rgb: '96,165,250' },
  Missed: { c: '#9a9aa3', rgb: '154,154,163' },
};
const DEFAULT_PAIRS = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

/* Сім питань розбору — той самий порядок і той самий «good», що й у
   макеті, зіставлений з реальними полями психоблоку. */
const QUESTIONS = [
  { key: 'followedPlan', q: 'Did you follow the trading plan?', good: true },
  { key: 'rushed', q: 'Did you rush the entry (FOMO)?', good: false },
  { key: 'hasMistake', q: 'Did you make an obvious mistake?', good: false },
  { key: 'psyConfident', q: 'Were you confident in your decisions?', good: true },
  { key: 'psyFear', q: 'Was fear present?', good: false },
  { key: 'psyRepeat', q: 'Would you repeat this trade?', good: true },
  { key: 'psyRevenge', q: 'Did you feel the urge to revenge trade?', good: false },
];

/* Локальна дата: toISOString() зсуває день на UTC і о другій ночі
   ставить угоді вчорашнє число */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- дрібні цеглинки ---------- */

/* Блок форми: підпис зверху, поле під ним — структурно, а не
   збоку. Той самий блок будує всю форму: підпис коротко називає,
   що заповнюється нижче, і список таких блоків іде вертикально з
   розділювачами. */
function Row({ label, hint, children, noBorder }) {
  return (
    <div
      className="flex flex-col gap-3"
      style={{
        padding: '22px 0',
        borderBottom: noBorder ? 'none' : `1px solid ${line(0.05)}`,
      }}
    >
      <div className="flex items-baseline gap-2">
        <div className="text-[14px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: txt(0.55) }}>{label}</div>
        {hint && (
          <div className="text-[11.5px]" style={{ fontFamily: MONO, color: txt(0.4) }}>{hint}</div>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}


/* Long/Short — сегментований перемикач на всю ширину під активом:
   заливка ковзає (layoutId) до активної сторони, а не два незалежних
   боксери. Ні рамки, ні крапок — лише прозорий трек і кольорова
   пігулка, яка сама каже, де зараз стоїш. */
function DirectionToggle({ value, onChange }) {
  return (
    <div className="relative flex h-14 w-full gap-1 rounded-2xl p-1" style={{ background: FIELD_BG }}>
      {DIRECTIONS.map((d) => {
        const on = value === d;
        const c = d === 'Long' ? ACCENT : BAD;
        const rgb = d === 'Long' ? ACCENT_RGB : BAD_RGB;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className="relative flex-1 text-[15px] transition-colors duration-150"
            style={{ fontFamily: T.sans, fontWeight: on ? 700 : 500, color: on ? c : txt(0.45) }}
          >
            {on && (
              <motion.span
                layoutId="dir-thumb"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                className="absolute inset-0 -z-10 rounded-xl"
                style={{ background: `rgba(${rgb},0.14)` }}
              />
            )}
            {d}
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
          className="flex h-14 w-full items-center justify-between rounded-2xl px-[18px] text-[18px] font-bold"
          style={{
            fontFamily: T.sans,
            background: value ? `rgba(${ACCENT_RGB},0.07)` : FIELD_BG,
            border: `1px solid ${value ? `rgba(${ACCENT_RGB},0.3)` : (o ? line(0.16) : 'transparent')}`,
            color: '#f2f4f3',
          }}
        >
          {value ? (
            <span className="flex items-center gap-2.5">
              <AssetIcon symbol={value} />
              {value}
            </span>
          ) : (
            <span className="flex items-center gap-2.5 text-[15.5px] font-semibold" style={{ color: txt(0.45) }}>
              <Search size={15} strokeWidth={2.4} />
              Select asset
            </span>
          )}
          <ChevronDown size={16} strokeWidth={2.4} style={{ color: value ? ACCENT : txt(0.4), transform: o ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </motion.button>
      )}
    >
      {({ close }) => (
        <div className="w-[320px] overflow-hidden rounded-2xl" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${line(0.08)}` }}>
            <Search size={12} style={{ color: txt(0.5) }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or new asset…"
              className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:opacity-50"
              style={{ fontFamily: T.sans, color: '#f2f4f3' }}
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
                    className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors duration-150"
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
              <div className="px-3 py-5 text-center text-[12px]" style={{ fontFamily: T.sans, color: txt(0.4) }}>
                Nothing found
              </div>
            )}
          </div>
          {showAdd && (
            <button
              type="button"
              onClick={addAsset}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-[12.5px] font-bold transition-colors"
              style={{ borderTop: `1px solid ${line(0.08)}`, fontFamily: T.sans, color: ACCENT }}
            >
              <Plus size={13} strokeWidth={2.6} />
              Add "{search.trim().toUpperCase()}"
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}

/* ---------- вибір сесії ---------- */

/* Той самий випадний список, що й раніше стояв трьома пігулками —
   лише тепер це реальний список: Азія/Лондон/Нью-Йорк завжди в
   ньому, а свої сесії живуть у user_sessions і додаються/
   перейменовуються/видаляються прямо тут, без кешу на клієнті. */
function SessionPicker({ value, onChange }) {
  const [customSessions, setCustomSessions] = useCachedList('sessions', 'user_sessions', 'id,name', 'created_at');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const all = [...DEFAULT_SESSIONS.map((name) => ({ id: null, name })), ...customSessions];
  const colorOf = (name) => SESSION_COLORS[name] || { c: ACCENT, rgb: ACCENT_RGB };
  const current = colorOf(value);

  const addSession = async () => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from('user_sessions').insert([{ name }]).select('id,name').single();
    if (!error && data) {
      setCustomSessions([...customSessions, data]);
      onChange(data.name);
    }
    setNewName('');
    setAdding(false);
  };

  const renameSession = async (id) => {
    const name = editName.trim();
    if (!name) return setEditingId(null);
    const prevName = customSessions.find((s) => s.id === id)?.name;
    const { error } = await supabase.from('user_sessions').update({ name }).eq('id', id);
    if (!error) {
      setCustomSessions(customSessions.map((s) => (s.id === id ? { ...s, name } : s)));
      if (value === prevName) onChange(name);
    }
    setEditingId(null);
  };

  const removeSession = async (id) => {
    const sess = customSessions.find((s) => s.id === id);
    const { error } = await supabase.from('user_sessions').delete().eq('id', id);
    if (!error) {
      setCustomSessions(customSessions.filter((s) => s.id !== id));
      if (value === sess?.name) onChange(DEFAULT_SESSIONS[0]);
    }
  };

  return (
    <Popover
      z={600}
      renderTrigger={({ toggle, open: o }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-12 items-center gap-3 rounded-xl px-4 text-[16px] font-bold transition-colors duration-150"
          style={{ fontFamily: T.sans, background: `rgba(${current.rgb},0.07)`, border: `1px solid rgba(${current.rgb},0.35)`, color: current.c }}
        >
          {value}
          <ChevronDown size={14} strokeWidth={2.6} style={{ color: current.c, opacity: 0.6, transform: o ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-[250px] overflow-hidden rounded-2xl p-2" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}>
          <div className="flex flex-col gap-0.5">
            {all.map((s) => {
              const on = s.name === value;
              const sc = colorOf(s.name);
              const isCustom = s.id !== null;
              const editing = editingId === s.id && isCustom;
              return (
                <div key={s.id ?? s.name} className="group flex items-center gap-1 rounded-xl">
                  {editing ? (
                    <div className="flex flex-1 items-center gap-2 py-1 pl-3 pr-1.5">
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') renameSession(s.id); if (e.key === 'Escape') setEditingId(null); }}
                        className="h-8 w-full min-w-0 bg-transparent text-[13.5px] outline-none"
                        style={{ fontFamily: T.sans, color: '#f2f4f3' }}
                      />
                      <button
                        type="button"
                        onClick={() => renameSession(s.id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
                        style={{ background: `rgba(${ACCENT_RGB},0.14)`, color: ACCENT }}
                      >
                        <Check size={13} strokeWidth={3} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { onChange(s.name); close(); }}
                        className="flex flex-1 items-center px-2 py-1.5 text-left"
                      >
                        <span
                          className="rounded-lg px-3 py-1.5 text-[13px] font-bold transition-all duration-150"
                          style={{ fontFamily: T.sans, color: sc.c, background: `rgba(${sc.rgb},${on ? 0.18 : 0.09})` }}
                        >
                          {s.name}
                        </span>
                      </button>
                      {isCustom && (
                        <span className="hidden shrink-0 items-center gap-1 pr-1.5 group-hover:flex">
                          <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.name); }} className="grid h-7 w-7 place-items-center rounded-lg transition-colors" style={{ color: txt(0.45) }} onMouseEnter={(e) => { e.currentTarget.style.background = line(0.06); e.currentTarget.style.color = txt(0.85); }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = txt(0.45); }}>
                            <Pencil size={12} strokeWidth={2.4} />
                          </button>
                          <button type="button" onClick={() => removeSession(s.id)} className="grid h-7 w-7 place-items-center rounded-lg transition-colors" style={{ color: txt(0.45) }} onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${BAD_RGB},0.12)`; e.currentTarget.style.color = BAD; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = txt(0.45); }}>
                            <X size={13} strokeWidth={2.6} />
                          </button>
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${line(0.07)}` }}>
            {adding ? (
              <div className="flex items-center gap-2 py-1 pl-3 pr-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSession(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                  placeholder="Session name…"
                  className="h-8 w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:opacity-45"
                  style={{ fontFamily: T.sans, color: '#f2f4f3' }}
                />
                <button
                  type="button"
                  onClick={addSession}
                  disabled={!newName.trim()}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors"
                  style={{
                    background: newName.trim() ? `rgba(${ACCENT_RGB},0.14)` : 'transparent',
                    color: newName.trim() ? ACCENT : txt(0.3),
                  }}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: txt(0.6) }}
                onMouseEnter={(e) => { e.currentTarget.style.background = line(0.05); }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span className="grid h-[18px] w-[18px] place-items-center rounded-md" style={{ background: line(0.07) }}>
                  <Plus size={11} strokeWidth={2.8} />
                </span>
                Add session
              </button>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}

/* ---------- статус угоди ---------- */

/* Той самий випадний список, що й гео: жодної рамки, лише колір
   тексту, що видає стан. Без додавання/видалення — статуси
   фіксовані. */
function StatusPicker({ value, onChange }) {
  const tone = RESULT_COLORS[value] || { c: txt(0.4), rgb: '242,244,243' };
  const placeholder = value === 'Not Selected' || !value;

  return (
    <Popover
      z={600}
      renderTrigger={({ toggle, open: o }) => (
        <motion.button
          type="button"
          onClick={toggle}
          whileTap={{ scale: 0.99 }}
          transition={SPRING}
          className="flex h-14 w-[250px] max-w-full items-center justify-between rounded-2xl px-5 text-[17px] font-bold transition-colors duration-150"
          style={{
            fontFamily: T.sans,
            background: placeholder ? FIELD_BG : `rgba(${tone.rgb},0.1)`,
            border: `1px solid ${placeholder ? (o ? line(0.16) : line(0.08)) : `rgba(${tone.rgb},0.4)`}`,
            color: placeholder ? txt(0.45) : tone.c,
          }}
        >
          <span className="flex items-center gap-2.5">
            {!placeholder && <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: tone.c }} />}
            {placeholder ? 'Select status' : RESULT_LABEL[value]}
          </span>
          <ChevronDown size={15} strokeWidth={2.6} style={{ color: placeholder ? txt(0.4) : tone.c, opacity: 0.7, transform: o ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </motion.button>
      )}
    >
      {({ close }) => (
        <div className="w-[280px] overflow-hidden rounded-2xl p-2" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}>
          {RESULT_CHIPS.map((o) => {
            const on = o === value;
            const c = RESULT_COLORS[o];
            return (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); close(); }}
                className="flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13.5px] font-bold"
                style={{ fontFamily: T.sans, color: c.c, opacity: on ? 1 : 0.62 }}
              >
                {RESULT_LABEL[o]}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

/* ---------- розкривні пункти сетапу ---------- */

/* Три пункти сетапу (назва, скрін, логіка) — не завжди розгорнуті
   стосом полів, а компактні заголовки, що розкриваються по кліку:
   видно, що саме можна заповнити, а сама форма не займає екран,
   поки там нема чого показувати. */
function Disclosure({ title, summary, open, onToggle, children }) {
  return (
    <div className="overflow-hidden rounded-xl transition-colors duration-150" style={{ border: `1px solid ${open ? line(0.1) : line(0.06)}` }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-[42px] w-full items-center justify-between gap-3 px-4 text-left transition-colors duration-150"
        style={{ background: open ? FIELD_BG : 'transparent' }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-[13px] font-semibold" style={{ fontFamily: T.sans, color: txt(0.45) }}>{title}</span>
          {summary && !open && (
            <span className="truncate text-[12px]" style={{ fontFamily: T.sans, color: txt(0.35) }}>{summary}</span>
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
          className="flex h-[52px] items-center gap-2 rounded-xl px-4 text-[14px] font-semibold"
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
          style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
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
              color: #f2f4f3; text-transform: capitalize; letter-spacing: -0.01em; }
            .edge-daypicker .rdp-nav_button { color: ${txt(0.6)}; border-radius: 10px;
              width: 32px; height: 32px; transition: background .2s, color .2s; }
            .edge-daypicker .rdp-nav_button:hover { background: ${line(0.06)} !important; color: #f2f4f3; }
            .edge-daypicker .rdp-head_cell { font-size: 11.5px; font-weight: 700;
              text-transform: uppercase; letter-spacing: .08em; color: ${txt(0.4)}; }
            .edge-daypicker .rdp-day { border-radius: 10px; font-size: 13.5px; font-weight: 600;
              color: ${txt(0.8)}; border: 1px solid transparent;
              transition: background .18s, color .18s, border-color .18s; }
            .edge-daypicker .rdp-day:hover:not(.rdp-day_selected) {
              background: ${line(0.06)} !important; color: #f2f4f3; border-color: ${line(0.08)}; }
            .edge-daypicker .rdp-day_today:not(.rdp-day_selected) { color: ${ACCENT}; border-color: rgba(${ACCENT_RGB},0.35); }
            .edge-daypicker .rdp-day_selected, .edge-daypicker .rdp-day_selected:hover {
              background: ${ACCENT} !important; color: #05201a !important; font-weight: 800; }
            .edge-daypicker .rdp-day_outside { color: ${txt(0.4)}; opacity: .55; }
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
          className="flex h-[52px] w-full items-center justify-between gap-2 rounded-xl px-4 text-[15px] font-semibold"
          style={{ fontFamily: T.sans, background: FIELD_BG, border: `1px solid ${open ? line(0.16) : line(0.08)}`, color: value ? '#f2f4f3' : txt(0.5) }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Wallet size={14} strokeWidth={2.2} style={{ color: txt(0.5) }} />
            <span className="truncate">{value || 'No accounts'}</span>
          </span>
          <ChevronDown size={14} strokeWidth={2.4} style={{ color: txt(0.5), transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[240px] overflow-hidden rounded-2xl p-1.5"
          style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
        >
          {options.length === 0 && (
            <div className="px-3 py-5 text-center text-[13px]" style={{ fontFamily: T.sans, color: txt(0.5) }}>
              Add an account first
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
              style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${line(0.14)}`, color: txt(0.85), backdropFilter: 'blur(8px)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = BAD; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.85); }}
            >
              <X size={15} strokeWidth={2.6} />
            </button>
          </div>
        ) : (
          <motion.div
            whileTap={{ scale: 0.98 }}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold transition-colors duration-150"
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
            style={{ background: 'rgba(10,10,12,0.8)', border: `1px solid ${line(0.14)}`, color: txt(0.8), backdropFilter: 'blur(8px)' }}
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
            <span className="text-[14px] font-medium" style={{ fontFamily: T.sans, color: txt(0.72) }}>{label}</span>
            <span className="text-[12px]" style={{ fontFamily: MONO, color: txt(0.5) }}>drag & drop or choose · PNG / JPG</span>
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
  const [setupOptions, setSetupOptions] = useState([]);
  const [entryTime, setEntryTime] = useState('');
  const [exitTime, setExitTime] = useState('');
  /* Розкриті пункти сетапу — автоматично відкриті, якщо там уже щось
     є (редагування угоди), інакше згорнуті. */
  const [setupNameOpen, setSetupNameOpen] = useState(false);
  const [setupShotOpen, setSetupShotOpen] = useState(false);
  const [setupDescOpen, setSetupDescOpen] = useState(false);

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
      setSetupDescOpen(Boolean(existingTrade.trade_description));
      {
        let tImgs = [];
        if (Array.isArray(existingTrade.trade_images) && existingTrade.trade_images.length > 0) tImgs = existingTrade.trade_images;
        else if (existingTrade.trade_image) tImgs = [existingTrade.trade_image];
        setTradeImages(tImgs);
        setSetupShotOpen(tImgs.length > 0);
      }
      setSetupName(existingTrade.setup || '');
      setSetupNameOpen(Boolean(existingTrade.setup));
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
      setSetupNameOpen(false); setSetupShotOpen(false); setSetupDescOpen(false);
      setFollowedPlan(null); setRushed(null); setHasMistake(null);
      setMistakeText(''); setMistakeImages([]);
      setPsyConfident(null); setPsyFear(null); setPsyRepeat(null); setPsyRevenge(null); setPsyNotes('');
      setErrDraft(null);
    }
    setComposerOpen(false);

    if (listCache.accounts) {
      setAccounts(listCache.accounts);
      if (listCache.accounts.length > 0 && !accToSet) setAccount(listCache.accounts[0].firm_name);
    } else {
      supabase.from('prop_accounts').select('id, firm_name, balance, status').then(({ data }) => {
        if (data) {
          listCache.accounts = data;
          setAccounts(data);
          if (data.length > 0 && !accToSet) setAccount(data[0].firm_name);
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
    else notify.error('No luck', 'Drag a link, not a file.');
  };

  /* ---------- перевірки ---------- */

  const step1Missing = !selectedPair?.trim() || !tradeDate || !account || !risk?.trim();

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
      setErrorMsg('Fill in the asset, date, account and risk.');
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
      return setErrorMsg('Fill in the asset, date, account and risk.');
    }
    if (psyMissing) return setErrorMsg('Answer all the review questions — they\'re what makes the journal useful.');
    if (hasMistake && !mistakeText.trim()) return setErrorMsg('Describe the mistake — otherwise you won\'t remember it in a month.');

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
        notify.success('Updated', 'Trade updated successfully.');
      } else {
        /* id потрібен одразу: за ним помилка знайде дорогу назад до
           угоди, з якої вона взялась */
        const { data, error } = await supabase.from('trades').insert([payload]).select('id').single();
        if (error) throw error;
        tradeId = data?.id || null;

        if (hasMistake) notify.error('Mistake logged', 'It\'s already waiting in the Error Log — you can review it there.');
        else notify.success('Trade saved', 'Trade added to the journal.');

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
                note: `${selectedPair} · ${tradeType} · ${result}`,
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

  const accountOptions = accounts.map((a) => a.firm_name);
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
          style={{ background: 'rgba(6,6,8,0.82)', backdropFilter: 'blur(10px)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.985 }}
            transition={SPRING}
            className="my-auto w-full max-w-[760px] overflow-hidden rounded-[22px]"
            style={{ background: CARD_BG, border: `1px solid ${line(0.08)}`, boxShadow: '0 40px 100px -14px rgba(0,0,0,0.65)' }}
          >
            {/* ─────────── Шапка ─────────── */}
            <div className="flex flex-col gap-6 px-6 pb-6 pt-8 sm:px-10 sm:pt-[34px]" style={{ borderBottom: `1px solid ${line(0.06)}` }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ fontFamily: MONO, color: PURPLE }}>
                    {step === 0
                      ? `Journal entry · ${tradeDate || todayLocal()}`
                      : `Journal entry · ${selectedPair || '—'} · ${tradeType} · ${rr ? `${rr}R` : '—'}`}
                  </span>
                  <h2 className="text-[27px] font-bold leading-none sm:text-[34px]" style={{ fontFamily: T.display, color: '#f2f4f3', letterSpacing: '-0.025em' }}>
                    {step === 0
                      ? (existingTrade ? 'Edit Trade' : 'Log Trade')
                      : 'Execution Review'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] transition-colors duration-200 sm:h-9 sm:w-9"
                  style={{ border: `1px solid ${line(0.09)}`, color: txt(0.6) }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f2f4f3'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.6); }}
                >
                  <X size={15} strokeWidth={2.2} />
                </button>
              </div>

              {/* кроки */}
              <div className="flex gap-9">
                {['Numbers', 'Review'].map((s, i) => {
                  const done = i < step;
                  const on = i === step;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => (i === 0 ? goBack() : goNext())}
                      className="flex flex-1 flex-col gap-2.5 text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-[13px] font-semibold" style={{ fontFamily: MONO, color: on ? ACCENT : done ? ACCENT : txt(0.45) }}>
                          {done ? '✓' : `0${i + 1}`}
                        </span>
                        <span className="text-[14px]" style={{ fontFamily: T.sans, fontWeight: on ? 600 : 500, color: on ? '#f2f4f3' : txt(0.5) }}>
                          {s}
                        </span>
                      </span>
                      <span className="block h-[2px] rounded-[1px]" style={{ background: on ? ACCENT : done ? `rgba(${ACCENT_RGB},0.4)` : line(0.08) }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─────────── Тіло ─────────── */}
            <form onSubmit={handleSubmit} noValidate>
              <div ref={scrollRef} className="max-h-[62vh] overflow-y-auto px-6 py-2 sm:px-10" style={{ scrollbarWidth: 'thin' }}>
                <AnimatePresence mode="wait">
                  {step === 0 ? (
                    <motion.div
                      key="step-1"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.22, ease: EASE }}
                    >
                      {/* Актив і напрямок */}
                      {/* Актив і напрямок — два блоки в одному рядку,
                          кожен зі своїм підписом, на одному рівні. */}
                      <Row label="Asset and Direction" required>
                        <div className="grid grid-cols-2 items-center gap-4">
                          <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: txt(0.4) }}>Asset</span>
                            <AssetPicker value={selectedPair} onChange={setSelectedPair} />
                          </div>
                          <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: txt(0.4) }}>Direction</span>
                            <DirectionToggle value={tradeType} onChange={setTradeType} />
                          </div>
                        </div>
                      </Row>

                      {/* Session */}
                      <Row label="Session" required>
                        <SessionPicker value={session} onChange={setSession} />
                      </Row>

                      {/* Risk */}
                      <Row label="Risk" required>
                        <div className="grid gap-3" style={{ gridTemplateColumns: '1.3fr 1fr 1fr' }}>
                          <AccountPicker value={account} options={accountOptions} onChange={setAccount} />
                          <div className="flex h-[52px] items-center justify-between rounded-xl px-4" style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}` }}>
                            <input
                              value={risk}
                              onChange={(e) => setRisk(e.target.value)}
                              className="w-full min-w-0 bg-transparent text-[16px] font-bold outline-none"
                              style={{ fontFamily: MONO, color: '#f2f4f3' }}
                            />
                            <span className="shrink-0 text-[13px] font-medium" style={{ fontFamily: MONO, color: txt(0.55) }}>%</span>
                          </div>
                          <div className="flex h-[52px] items-center justify-between rounded-xl px-4" style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}` }}>
                            <input
                              value={rr}
                              onChange={(e) => setRr(e.target.value.replace(',', '.'))}
                              inputMode="decimal"
                              placeholder="2.5"
                              className="w-full min-w-0 bg-transparent text-[16px] font-bold outline-none placeholder:opacity-40"
                              style={{ fontFamily: MONO, color: rr ? ACCENT : '#f2f4f3' }}
                            />
                            <span className="shrink-0 text-[13px] font-medium" style={{ fontFamily: MONO, color: txt(0.55) }}>R</span>
                          </div>
                        </div>
                      </Row>

                      {/* Status */}
                      <Row label="Status" required>
                        <StatusPicker value={result} onChange={setResult} />
                      </Row>

                      {/* Setup */}
                      <Row label="Setup" noBorder>
                        <div className="flex flex-col gap-2">
                          <Disclosure
                            title="Setup name"
                            summary={setupName || null}
                            open={setupNameOpen}
                            onToggle={() => setSetupNameOpen((v) => !v)}
                          >
                            <div className="flex flex-col gap-3 pt-2">
                              <input
                                autoFocus
                                value={setupName}
                                onChange={(e) => setSetupName(e.target.value)}
                                placeholder="e.g. Sweep + BOS"
                                className="flex h-11 w-full items-center border-0 border-b bg-transparent px-0 text-[15.5px] font-semibold outline-none transition-colors placeholder:font-normal placeholder:opacity-45"
                                style={{ borderColor: line(0.08), color: '#f2f4f3', fontFamily: T.sans }}
                                onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.4)`; }}
                                onBlur={(e) => { e.currentTarget.style.borderColor = line(0.08); }}
                              />
                              {setupOptions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {setupOptions.map((o) => {
                                    const on = o === setupName;
                                    return (
                                      <button
                                        key={o}
                                        type="button"
                                        onClick={() => setSetupName(on ? '' : o)}
                                        className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors duration-150"
                                        style={{
                                          fontFamily: T.sans,
                                          background: on ? `rgba(${ACCENT_RGB},0.12)` : line(0.04),
                                          color: on ? ACCENT : txt(0.5),
                                        }}
                                      >
                                        {o}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </Disclosure>

                          <Disclosure
                            title="Screenshot"
                            summary={tradeImages.length ? `${tradeImages.length} screenshot${tradeImages.length === 1 ? '' : 's'}` : null}
                            open={setupShotOpen}
                            onToggle={() => setSetupShotOpen((v) => !v)}
                          >
                            <div
                              onPaste={pasteSetup}
                              onDragOver={(e) => { e.preventDefault(); setSetupDropHot(true); }}
                              onDragLeave={() => setSetupDropHot(false)}
                              onDrop={dropSetup}
                              tabIndex={0}
                              className="mt-2 overflow-hidden rounded-2xl outline-none transition-colors duration-200"
                              style={{ border: `1px solid ${setupDropHot ? `rgba(${ACCENT_RGB},0.45)` : line(0.08)}` }}
                            >
                              {tradeImages.length > 0 ? (
                                <>
                                  <ImageSlider images={tradeImages} containerClassName="h-[440px] w-full" />
                                  <div className="flex flex-wrap items-center gap-2 p-2.5" style={{ background: FIELD_BG, borderTop: `1px solid ${line(0.06)}` }}>
                                    {tradeImages.map((img, i) => (
                                      <div key={i} className="group relative h-10 w-10 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${line(0.08)}` }}>
                                        <img src={img} alt="" className="h-full w-full object-cover" />
                                        <button
                                          type="button"
                                          onClick={() => removeTradeImage(i)}
                                          className="absolute inset-0 hidden items-center justify-center transition-colors group-hover:flex"
                                          style={{ background: 'rgba(10,10,12,0.68)', color: '#fff' }}
                                        >
                                          <X size={12} strokeWidth={2.8} />
                                        </button>
                                      </div>
                                    ))}
                                    <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: txt(0.4) }}>Ctrl+V or drag — add more</span>
                                  </div>
                                </>
                              ) : (
                                <motion.div
                                  animate={{ background: setupDropHot ? `rgba(${ACCENT_RGB},0.05)` : FIELD_BG }}
                                  className="flex min-h-[300px] cursor-text flex-col items-center justify-center gap-2 text-center"
                                >
                                  <ImagePlus size={20} strokeWidth={1.8} style={{ color: setupDropHot ? ACCENT : txt(0.4) }} />
                                  <span className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: setupDropHot ? ACCENT : txt(0.65) }}>
                                    {setupDropHot ? 'Drop it' : 'Paste a chart screenshot'}
                                  </span>
                                  <span className="text-[12px]" style={{ fontFamily: T.sans, color: txt(0.4) }}>Ctrl+V — screenshot or a TradingView link, multiple allowed</span>
                                </motion.div>
                              )}
                            </div>
                          </Disclosure>

                          <Disclosure
                            title="Entry logic"
                            summary={tradeDescription ? tradeDescription.slice(0, 40) + (tradeDescription.length > 40 ? '…' : '') : null}
                            open={setupDescOpen}
                            onToggle={() => setSetupDescOpen((v) => !v)}
                          >
                            <textarea
                              autoFocus
                              value={tradeDescription}
                              onChange={(e) => setTradeDescription(e.target.value)}
                              placeholder="Entry logic, confirmations, emotions in the moment…"
                              className="mt-2 min-h-[80px] w-full resize-y border-0 bg-transparent p-0 text-[14.5px] outline-none placeholder:opacity-40"
                              style={{ color: txt(0.8), fontFamily: T.sans, lineHeight: 1.55 }}
                            />
                          </Disclosure>
                        </div>
                      </Row>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step-2"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="flex flex-col gap-[22px] py-[30px]"
                    >
                      <div className="flex flex-wrap items-end justify-between gap-5">
                        <p className="max-w-[400px] text-[15px] leading-[1.5]" style={{ fontFamily: T.sans, color: txt(0.6) }}>
                          Seven questions. Answer how it really was, not how you wish it had been.
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-[20px] font-bold" style={{ fontFamily: MONO, color: ACCENT }}>
                            {psyDoneAll}<span style={{ color: txt(0.4) }}>/7</span>
                          </span>
                          <span className="h-1 w-[88px] overflow-hidden rounded-full" style={{ background: line(0.07) }}>
                            <motion.span
                              className="block h-full rounded-full"
                              initial={false}
                              animate={{ width: `${(psyDoneAll / 7) * 100}%` }}
                              transition={{ duration: 0.25 }}
                              style={{ background: ACCENT }}
                            />
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {QUESTIONS.map((qq) => {
                          const v = psyValues[qq.key];
                          const on = v !== null;
                          const tone = !on ? ACCENT : (v === qq.good ? ACCENT : AMBER);
                          const set = psySetters[qq.key];
                          return (
                            <div
                              key={qq.key}
                              className="flex flex-col justify-between gap-3 rounded-[13px] p-3.5 transition-colors duration-200"
                              style={{ background: on ? '#15181a' : '#131517', border: `1px solid ${on ? `${tone}3d` : line(0.06)}` }}
                            >
                              <span className="min-h-[38px] text-[14px] leading-[1.35] font-medium" style={{ fontFamily: T.sans, color: '#f2f4f3' }}>
                                {qq.q}
                              </span>
                              <div className="flex gap-1.5">
                                {[true, false].map((v2) => {
                                  const active = v === v2;
                                  return (
                                    <button
                                      key={String(v2)}
                                      type="button"
                                      onClick={() => set(active ? null : v2)}
                                      className="flex h-8 min-w-[48px] items-center justify-center rounded-[10px] text-[12px] transition-all duration-150"
                                      style={{
                                        fontFamily: T.sans,
                                        fontWeight: active ? 600 : 500,
                                        border: `1px solid ${active ? tone : line(0.09)}`,
                                        background: active ? `${tone}22` : 'transparent',
                                        color: active ? tone : txt(0.6),
                                      }}
                                    >
                                      {v2 ? 'Yes' : 'No'}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>

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
                                <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: BAD }}>
                                  Mistake analysis
                                </span>

                                {errDraft?.cats?.length > 0 && (
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    {errDraft.cats.map((id) => {
                                      const c = CATS.find((x) => x.id === id);
                                      if (!c) return null;
                                      return (
                                        <span
                                          key={id}
                                          className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
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
                                  className="ml-auto flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold transition-colors"
                                  style={{ fontFamily: T.sans, background: 'transparent', border: `1px solid rgba(${BAD_RGB},0.3)`, color: BAD }}
                                >
                                  {errDraft ? 'Edit review' : 'Break it down'}
                                </button>
                              </div>

                              {mistakeImages.length === 0 ? (
                                <ShotZone image={null} onPaste={pasteMistake} label="Paste mistake screenshots" tone={BAD} />
                              ) : (
                                <div onPaste={pasteMistake} tabIndex={0} className="grid grid-cols-2 gap-2.5 outline-none">
                                  {mistakeImages.map((img, i) => (
                                    <div key={i} className="group relative aspect-video overflow-hidden rounded-xl" style={{ border: `1px solid rgba(${BAD_RGB},0.25)`, background: FIELD_BG }}>
                                      <img src={img} alt="" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        onClick={() => removeMistakeImage(i)}
                                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                        style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${line(0.14)}`, color: BAD }}
                                      >
                                        <X size={13} strokeWidth={2.8} />
                                      </button>
                                    </div>
                                  ))}
                                  <div className="grid aspect-video place-items-center rounded-xl text-center text-[12px] font-semibold" style={{ border: `1px dashed rgba(${BAD_RGB},0.25)`, background: FIELD_BG, color: txt(0.5), fontFamily: T.sans }}>
                                    one more<br />Ctrl+V
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={mistakeText}
                                onChange={(e) => setMistakeText(e.target.value)}
                                placeholder="Describe the mistake in detail so you don't repeat it…"
                                className="min-h-[80px] w-full resize-y rounded-xl p-4 text-[14px] outline-none"
                                style={{ background: FIELD_BG, border: `1px solid ${touched && !mistakeText.trim() ? `rgba(${BAD_RGB},0.4)` : line(0.08)}`, color: txt(0.8), fontFamily: T.sans, lineHeight: 1.55 }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <textarea
                        value={psyNotes}
                        onChange={(e) => setPsyNotes(e.target.value)}
                        placeholder="What exactly hurt or saved this trade?"
                        className="mt-1.5 min-h-[96px] w-full resize-y rounded-2xl p-[18px] text-[15px] outline-none transition-colors duration-150 placeholder:opacity-40"
                        style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}`, color: txt(0.85), fontFamily: T.sans, lineHeight: 1.6 }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.35)`; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = line(0.08); }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ─────────── Підвал ─────────── */}
              <div className="flex flex-col gap-3 px-6 py-5 sm:px-10" style={{ borderTop: `1px solid ${line(0.06)}`, background: FOOTER_BG }}>
                <AnimatePresence>
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold"
                      style={{ background: `rgba(${BAD_RGB},0.09)`, border: `1px solid rgba(${BAD_RGB},0.25)`, color: BAD, fontFamily: T.sans }}
                    >
                      <AlertCircle size={14} strokeWidth={2.4} className="shrink-0" />
                      {errorMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                {step === 0 ? (
                  <div className="flex items-center justify-between gap-4">
                    <span className="hidden text-[14px] sm:block" style={{ fontFamily: T.sans, color: txt(0.55) }}>
                      Draft saves automatically
                    </span>
                    <div className="ml-auto flex items-center gap-3.5">
                      <span className="hidden text-[14px] sm:block" style={{ fontFamily: T.sans, color: txt(0.5) }}>Review left</span>
                      <button
                        type="button"
                        onClick={goNext}
                        className="rounded-xl px-[26px] py-3.5 text-[15px] font-semibold transition-transform duration-150 active:scale-[0.98]"
                        style={{ fontFamily: T.sans, background: ACCENT, color: '#05201a' }}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={goBack}
                      className="rounded-[11px] px-5 py-3 text-[14px] font-medium transition-colors duration-150"
                      style={{ fontFamily: T.sans, border: `1px solid ${line(0.08)}`, color: txt(0.65) }}
                    >
                      ← Back
                    </button>
                    <div className="flex items-center gap-3.5">
                      <span className="hidden text-[14px] sm:block" style={{ fontFamily: T.sans, color: submitReady ? `rgba(${ACCENT_RGB},0.85)` : txt(0.5) }}>
                        {submitReady ? 'All answers in place' : `${7 - psyDoneAll} left`}
                      </span>
                      <button
                        type="submit"
                        disabled={loading || !submitReady}
                        className="flex items-center gap-2 rounded-xl px-[26px] py-3.5 text-[15px] font-semibold transition-all duration-150"
                        style={{
                          fontFamily: T.sans,
                          cursor: submitReady ? 'pointer' : 'not-allowed',
                          background: submitReady ? ACCENT : line(0.06),
                          color: submitReady ? '#05201a' : txt(0.4),
                          border: `1px solid ${submitReady ? ACCENT : line(0.08)}`,
                          boxShadow: submitReady ? `0 0 40px rgba(${ACCENT_RGB},0.28)` : 'none',
                          opacity: loading ? 0.7 : 1,
                        }}
                      >
                        {loading
                          ? <Loader2 size={15} strokeWidth={3} className="animate-spin" />
                          : null}
                        {existingTrade ? 'Update Trade' : 'Log Trade'}
                      </button>
                    </div>
                  </div>
                )}
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
