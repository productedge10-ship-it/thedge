import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DayPicker } from 'react-day-picker';
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import {
  X, ImagePlus, Loader2, AlertCircle, AlertTriangle,
  CalendarDays, ChevronDown, ChevronUp, ChevronRight, Search, Check, Plus, Pencil,
  Wallet, Clock,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { notify } from '../../utils/notify';
import { T, EASE, SPRING, useEdgeFonts } from '../../lib/theme';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import AssetIcon from '../ui/AssetIcon';
import Popover from '../ui/Popover';

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
const RESULT_LABEL = { Win: 'Take', Lose: 'Stop', BE: 'BE', 'In Progress': 'В процесі', Missed: 'Пропущено' };
const DEFAULT_PAIRS = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

/* Сім питань розбору — той самий порядок і той самий «good», що й у
   макеті, зіставлений з реальними полями психоблоку. */
const QUESTIONS = [
  { key: 'followedPlan', q: 'Дотримався торгового плану?', good: true },
  { key: 'rushed', q: 'Спішив зі входом (FOMO)?', good: false },
  { key: 'hasMistake', q: 'Припустився очевидної помилки?', good: false },
  { key: 'psyConfident', q: 'Був упевнений у рішеннях?', good: true },
  { key: 'psyFear', q: 'Чи був присутній страх?', good: false },
  { key: 'psyRepeat', q: 'Повторив би цю угоду?', good: true },
  { key: 'psyRevenge', q: 'Було бажання відігратися?', good: false },
];

/* Локальна дата: toISOString() зсуває день на UTC і о другій ночі
   ставить угоді вчорашнє число */
const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- дрібні цеглинки ---------- */

/* Рядок форми: підпис + позначка обов'язковості зліва (150px),
   поле — праворуч. Той самий рядок, що будує всю форму в макеті:
   ніякого «блок над блоком», просто список рядків з розділювачами. */
function Row({ label, required, hint, children, noBorder }) {
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: '150px 1fr',
        columnGap: 28,
        rowGap: 12,
        padding: '26px 0',
        borderBottom: noBorder ? 'none' : `1px solid ${line(0.05)}`,
      }}
    >
      <div className="flex flex-col gap-1.5">
        <div className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: '#f2f4f3' }}>{label}</div>
        <div className="text-[12px]" style={{ fontFamily: MONO, color: required ? ACCENT : txt(0.5) }}>
          {required ? "обов'язково" : (hint || 'опційно')}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* Ряд-пігулок з рівномірною бірюзовою активністю — так само в
   макеті виглядають і сесії, і статус: активний варіант завжди
   один і той самий стиль, незалежно від того, яка саме опція. */
function PillRow({ options, value, onChange, labelOf, wrap, equal }) {
  return (
    <div className={`flex gap-2 ${wrap ? 'flex-wrap' : ''}`}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded-xl text-center transition-colors duration-150 ${equal ? 'flex-1 py-3.5 text-[15px]' : 'px-[18px] py-3 text-[14px]'}`}
            style={{
              fontFamily: T.sans,
              fontWeight: on ? 600 : 500,
              background: on ? `rgba(${ACCENT_RGB},0.12)` : 'transparent',
              border: `1px solid ${on ? `rgba(${ACCENT_RGB},0.4)` : line(0.08)}`,
              color: on ? ACCENT : txt(0.6),
            }}
          >
            {labelOf ? labelOf(o) : o}
          </button>
        );
      })}
    </div>
  );
}

/* Long/Short — не два рівнозначні перемикачі, а один бокс, де
   активна сторона отримує власну кольорову пігулку всередині. */
function DirectionToggle({ value, onChange }) {
  return (
    <div
      className="flex h-[52px] w-[150px] shrink-0 items-center overflow-hidden rounded-xl"
      style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}` }}
    >
      {DIRECTIONS.map((d) => {
        const on = value === d;
        const c = d === 'Long' ? ACCENT : BAD;
        const rgb = d === 'Long' ? ACCENT_RGB : BAD_RGB;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className="flex h-full flex-1 items-center justify-center text-[14px] transition-colors duration-150"
            style={{ fontFamily: T.sans, fontWeight: on ? 600 : 500, color: on ? c : txt(0.6) }}
          >
            <span
              className="flex h-[34px] w-full items-center justify-center rounded-[9px]"
              style={{ background: on ? `rgba(${rgb},0.14)` : 'transparent' }}
            >
              {d}
            </span>
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
  const [userPairs, setUserPairs] = useState([]);

  useEffect(() => {
    supabase.from('user_assets').select('name').order('name')
      .then(({ data }) => { if (data) setUserPairs(data.map((d) => d.name)); });
  }, []);

  const allPairs = [...new Set([...DEFAULT_PAIRS, ...userPairs])];
  const filtered = allPairs.filter((p) => p.toLowerCase().includes(search.toLowerCase()));
  const showAdd = search.trim() !== '' && !allPairs.some((p) => p.toLowerCase() === search.trim().toLowerCase());

  const addAsset = async () => {
    const name = search.trim().toUpperCase();
    if (!name) return;
    const { error } = await supabase.from('user_assets').insert([{ name }]);
    if (!error) {
      setUserPairs((p) => [...p, name]);
      onChange(name);
      setSearch('');
    }
  };

  const removeAsset = async (e, name) => {
    e.stopPropagation();
    if (DEFAULT_PAIRS.includes(name)) return;
    const { error } = await supabase.from('user_assets').delete().eq('name', name);
    if (!error) {
      setUserPairs((p) => p.filter((x) => x !== name));
      if (value === name) onChange('');
    }
  };

  return (
    <Popover
      z={600}
      renderTrigger={({ toggle, open: o }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-[52px] flex-1 items-center justify-between rounded-xl px-4 text-[17px] font-bold"
          style={{ fontFamily: T.sans, background: FIELD_BG, border: `1px solid ${value ? `rgba(${ACCENT_RGB},0.28)` : (o ? line(0.16) : line(0.08))}`, color: '#f2f4f3' }}
        >
          {value ? (
            <span className="flex items-center gap-2">
              <AssetIcon symbol={value} />
              {value}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: txt(0.5) }}>
              <Search size={14} strokeWidth={2.4} />
              Обрати актив
            </span>
          )}
          <span className="text-[13px] font-normal" style={{ color: txt(0.55) }}>▾</span>
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-[240px] overflow-hidden rounded-2xl" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${line(0.08)}` }}>
            <Search size={12} style={{ color: txt(0.5) }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Пошук або новий актив…"
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
                Нічого не знайдено
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
              Додати «{search.trim().toUpperCase()}»
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
  const [customSessions, setCustomSessions] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    supabase.from('user_sessions').select('id,name').order('created_at')
      .then(({ data }) => { if (data) setCustomSessions(data); });
  }, []);

  const all = [...DEFAULT_SESSIONS.map((name) => ({ id: null, name })), ...customSessions];
  const colorOf = (name) => SESSION_COLORS[name] || { c: ACCENT, rgb: ACCENT_RGB };
  const current = colorOf(value);

  const addSession = async () => {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from('user_sessions').insert([{ name }]).select('id,name').single();
    if (!error && data) {
      setCustomSessions((p) => [...p, data]);
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
      setCustomSessions((p) => p.map((s) => (s.id === id ? { ...s, name } : s)));
      if (value === prevName) onChange(name);
    }
    setEditingId(null);
  };

  const removeSession = async (id) => {
    const sess = customSessions.find((s) => s.id === id);
    const { error } = await supabase.from('user_sessions').delete().eq('id', id);
    if (!error) {
      setCustomSessions((p) => p.filter((s) => s.id !== id));
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
          className="flex h-[52px] w-full items-center justify-between rounded-xl px-4 text-[15px] font-semibold"
          style={{ fontFamily: T.sans, background: FIELD_BG, border: `1px solid ${o ? line(0.16) : line(0.08)}`, color: '#f2f4f3' }}
        >
          <span className="flex items-center gap-2.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.c }} />
            {value}
          </span>
          <ChevronDown size={14} strokeWidth={2.4} style={{ color: txt(0.5), transform: o ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-[240px] overflow-hidden rounded-2xl p-1.5" style={{ background: CARD_BG, border: `1px solid ${line(0.1)}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}>
          {all.map((s) => {
            const on = s.name === value;
            const sc = colorOf(s.name);
            const isCustom = s.id !== null;
            const editing = editingId === s.id && isCustom;
            return (
              <div key={s.id ?? s.name} className="group flex items-center">
                {editing ? (
                  <div className="flex flex-1 items-center gap-1.5 px-2.5 py-1.5">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') renameSession(s.id); if (e.key === 'Escape') setEditingId(null); }}
                      className="w-full min-w-0 bg-transparent text-[13px] outline-none"
                      style={{ fontFamily: T.sans, color: '#f2f4f3' }}
                    />
                    <button type="button" onClick={() => renameSession(s.id)}><Check size={13} strokeWidth={3} style={{ color: ACCENT }} /></button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { onChange(s.name); close(); }}
                      className="flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors duration-150"
                      style={{ fontFamily: T.sans, color: on ? sc.c : txt(0.85), background: on ? `rgba(${sc.rgb},0.12)` : 'transparent' }}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: sc.c }} />
                      {s.name}
                    </button>
                    {isCustom && (
                      <span className="hidden shrink-0 items-center gap-0.5 pr-1 group-hover:flex">
                        <button type="button" onClick={() => { setEditingId(s.id); setEditName(s.name); }} className="grid h-6 w-6 place-items-center rounded transition-colors" style={{ color: txt(0.45) }}>
                          <Pencil size={11} strokeWidth={2.4} />
                        </button>
                        <button type="button" onClick={() => removeSession(s.id)} className="grid h-6 w-6 place-items-center rounded transition-colors" style={{ color: txt(0.45) }} onMouseEnter={(e) => { e.currentTarget.style.color = BAD; }} onMouseLeave={(e) => { e.currentTarget.style.color = txt(0.45); }}>
                          <X size={12} strokeWidth={2.6} />
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="mt-1 px-1 pt-1" style={{ borderTop: `1px solid ${line(0.06)}` }}>
            {adding ? (
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addSession(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                  placeholder="Нова сесія"
                  className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:opacity-50"
                  style={{ fontFamily: T.sans, color: '#f2f4f3' }}
                />
                <button type="button" onClick={addSession}><Check size={14} strokeWidth={3} style={{ color: ACCENT }} /></button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors"
                style={{ fontFamily: T.sans, color: txt(0.6) }}
              >
                <Plus size={13} strokeWidth={2.6} />
                Додати сесію
              </button>
            )}
          </div>
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
            <span className="truncate">{value || 'Немає рахунків'}</span>
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
function ShotZone({ image, onPaste, onClear, label, tone }) {
  const c = tone || ACCENT;
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
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = `rgba(${ACCENT_RGB},0.4)`)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = line(0.14))}
        >
          <div className="grid h-6 w-[30px] shrink-0 place-items-center rounded-[5px]" style={{ border: `1px solid ${txt(0.35)}` }}>
            <ImagePlus size={13} strokeWidth={1.9} style={{ color: txt(0.5) }} />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[14px] font-medium" style={{ fontFamily: T.sans, color: txt(0.72) }}>{label}</span>
            <span className="text-[12px]" style={{ fontFamily: MONO, color: txt(0.5) }}>перетягни або вибери · PNG / JPG</span>
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

/* Один розряд часу (ГГ або ХХ): велика цифра по центру, тонкі
   стрілки вгору/вниз збоку — клацання й колесо миші крутять
   значення. Клік на цифру виділяє її, щоб просто набрати з
   клавіатури. */
function TimeStep({ value, max, placeholder, onChange }) {
  const step = (dir) => {
    const cur = value === '' ? (dir > 0 ? -1 : 0) : parseInt(value, 10);
    const next = ((cur + dir) % (max + 1) + (max + 1)) % (max + 1);
    onChange(String(next).padStart(2, '0'));
  };
  return (
    <div className="flex items-center gap-[2px]">
      <input
        value={value}
        placeholder={placeholder}
        onFocus={(e) => e.target.select()}
        onWheel={(e) => { e.preventDefault(); step(e.deltaY < 0 ? 1 : -1); }}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(-2);
          if (digits === '') return onChange('');
          onChange(String(Math.min(max, parseInt(digits, 10))).padStart(2, '0'));
        }}
        className="w-[24px] border-none bg-transparent text-center outline-none placeholder:opacity-40"
        style={{ color: value ? txt(0.9) : txt(0.5), fontFamily: MONO, fontSize: 15, fontWeight: 700 }}
      />
      <div className="flex flex-col">
        <button type="button" onClick={() => step(1)} className="grid h-[8px] w-[12px] place-items-center rounded-sm transition-colors" style={{ color: txt(0.4) }} onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)} onMouseLeave={(e) => (e.currentTarget.style.color = txt(0.4))}>
          <ChevronUp size={8} strokeWidth={3} />
        </button>
        <button type="button" onClick={() => step(-1)} className="grid h-[8px] w-[12px] place-items-center rounded-sm transition-colors" style={{ color: txt(0.4) }} onMouseEnter={(e) => (e.currentTarget.style.color = ACCENT)} onMouseLeave={(e) => (e.currentTarget.style.color = txt(0.4))}>
          <ChevronDown size={8} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

/* Бокс «Вхід»/«Вихід» з макета: підпис зліва, ГГ:ХХ справа, той
   самий висувний degree-степер, що й раніше, лише перевдягнений у
   рядок замість плашки з іконкою годинника. */
function TimeField({ label, value, onChange }) {
  const [hh = '', mm = ''] = (value || '').split(':');
  const setPart = (h, m) => (h === '' && m === '' ? onChange('') : onChange(`${h || '00'}:${m || '00'}`));

  return (
    <div className="flex h-[52px] flex-1 items-center justify-between rounded-xl px-4" style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}` }}>
      <span className="text-[12px] font-medium uppercase tracking-[0.1em]" style={{ fontFamily: MONO, color: txt(0.55) }}>{label}</span>
      <div className="flex items-center gap-1">
        <TimeStep value={hh} max={23} placeholder="––" onChange={(h) => setPart(h, mm)} />
        <span className="font-bold" style={{ color: txt(0.5), fontFamily: MONO, fontSize: 15 }}>:</span>
        <TimeStep value={mm} max={59} placeholder="––" onChange={(m) => setPart(hh, m)} />
        {value && (
          <button type="button" onClick={() => onChange('')} className="ml-1 shrink-0 transition-colors" style={{ color: txt(0.4) }}>
            <X size={12} strokeWidth={2.6} />
          </button>
        )}
      </div>
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
  /* Час згорнутий за замовчуванням — це необов'язкові дані, і поки
     їх нема, порожні «--:--» плашки лише займають місце. Розкривається
     стрілкою вбік або сам, якщо в угоді час уже був заповнений. */
  const [timeOpen, setTimeOpen] = useState(false);

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
      setTradeImage(existingTrade.trade_image || null);
      setSetupName(existingTrade.setup || '');
      /* База віддає час як HH:MM:SS, полю input потрібні HH:MM */
      setEntryTime((existingTrade.entry_time || '').slice(0, 5));
      setExitTime((existingTrade.exit_time || '').slice(0, 5));
      setTimeOpen(Boolean(existingTrade.entry_time || existingTrade.exit_time));
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
      setSetupName(''); setEntryTime(''); setExitTime(''); setTimeOpen(false);
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
  const dirColor = tradeType === 'Long' ? ACCENT : BAD;
  const dirRgb = tradeType === 'Long' ? ACCENT_RGB : BAD_RGB;
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
                      ? (existingTrade ? 'Редагувати угоду' : 'Записати угоду')
                      : 'Розбір виконання'}
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
                {['Цифри', 'Розбір'].map((s, i) => {
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
                      <Row label="Актив" required>
                        <div className="flex gap-3">
                          <AssetPicker value={selectedPair} onChange={setSelectedPair} />
                          <DirectionToggle value={tradeType} onChange={setTradeType} />
                        </div>
                      </Row>

                      {/* Сесія */}
                      <Row label="Сесія" required>
                        <SessionPicker value={session} onChange={setSession} />
                      </Row>

                      {/* Ризик */}
                      <Row label="Ризик" required>
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

                      {/* Статус */}
                      <Row label="Статус" required>
                        <PillRow options={RESULT_CHIPS} value={result} onChange={setResult} labelOf={(o) => RESULT_LABEL[o]} wrap />
                      </Row>

                      {/* Сетап */}
                      <Row label="Сетап" noBorder>
                        <div className="flex flex-col gap-3">
                          <input
                            value={setupName}
                            onChange={(e) => setSetupName(e.target.value)}
                            placeholder="Назва — напр. Sweep + BOS"
                            className="flex h-[52px] w-full items-center rounded-xl px-4 text-[16px] font-normal outline-none placeholder:opacity-100"
                            style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}`, color: '#f2f4f3', fontFamily: T.sans }}
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
                                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-150"
                                    style={{
                                      fontFamily: T.sans,
                                      background: on ? `rgba(${ACCENT_RGB},0.12)` : 'transparent',
                                      border: `1px solid ${on ? `rgba(${ACCENT_RGB},0.4)` : line(0.08)}`,
                                      color: on ? ACCENT : txt(0.55),
                                    }}
                                  >
                                    {o}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex flex-col gap-3">
                            <button
                              type="button"
                              onClick={() => setTimeOpen((v) => !v)}
                              className="flex h-11 w-full items-center justify-between rounded-xl px-4 text-[13.5px] font-semibold transition-colors"
                              style={{ fontFamily: T.sans, background: timeOpen ? FIELD_BG : 'transparent', border: `1px solid ${line(0.08)}`, color: txt(0.7) }}
                            >
                              <span className="flex items-center gap-2">
                                <Clock size={13} strokeWidth={2.2} style={{ color: txt(0.5) }} />
                                Час входу і виходу
                                {holdLabel && <span style={{ fontFamily: MONO, color: ACCENT }}>· {holdLabel}</span>}
                              </span>
                              <ChevronRight size={14} strokeWidth={2.4} style={{ color: txt(0.5), transform: timeOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                            </button>
                            <AnimatePresence initial={false}>
                              {timeOpen && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.22, ease: EASE }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex gap-3">
                                    <TimeField label="Вхід" value={entryTime} onChange={setEntryTime} />
                                    <TimeField label="Вихід" value={exitTime} onChange={setExitTime} />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <ShotZone image={tradeImage} onPaste={pasteInto(setTradeImage)} onClear={() => setTradeImage(null)} label="Скрін графіка" />
                          <textarea
                            value={tradeDescription}
                            onChange={(e) => setTradeDescription(e.target.value)}
                            placeholder="Логіка входу, підтвердження, емоції в моменті… (опційно)"
                            className="min-h-[80px] w-full resize-y rounded-xl p-4 text-[15px] outline-none placeholder:opacity-50"
                            style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}`, color: txt(0.8), fontFamily: T.sans, lineHeight: 1.55 }}
                          />
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
                          Сім питань. Відповідай як було, а не як хотілося б.
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
                                      {v2 ? 'Так' : 'Ні'}
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
                                  Аналіз помилки
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
                                  style={{ fontFamily: T.sans, background: 'transparent', border: `1px solid rgba(${BAD_RGB},0.3)`, color: BAD }}
                                >
                                  {errDraft ? 'Змінити розбір' : 'Розібрати детально'}
                                </button>
                              </div>

                              {mistakeImages.length === 0 ? (
                                <ShotZone image={null} onPaste={pasteMistake} label="Встав графіки помилки" tone={BAD} />
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
                                    ще один<br />Ctrl+V
                                  </div>
                                </div>
                              )}

                              <textarea
                                value={mistakeText}
                                onChange={(e) => setMistakeText(e.target.value)}
                                placeholder="Детально опиши помилку, щоб не повторити її в майбутньому…"
                                className="min-h-[80px] w-full resize-y rounded-xl p-4 text-[14px] outline-none"
                                style={{ background: FIELD_BG, border: `1px solid ${touched && !mistakeText.trim() ? `rgba(${BAD_RGB},0.4)` : line(0.08)}`, color: txt(0.8), fontFamily: T.sans, lineHeight: 1.55 }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid items-start gap-7 pt-1.5" style={{ gridTemplateColumns: '150px 1fr' }}>
                        <div className="flex flex-col gap-1.5">
                          <div className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: '#f2f4f3' }}>Нотатка</div>
                          <div className="text-[12px]" style={{ fontFamily: MONO, color: txt(0.5) }}>опційно</div>
                        </div>
                        <textarea
                          value={psyNotes}
                          onChange={(e) => setPsyNotes(e.target.value)}
                          placeholder="Що саме зіпсувало або зберегло цю угоду?"
                          className="min-h-[80px] w-full resize-y rounded-xl p-4 text-[15px] outline-none placeholder:opacity-50"
                          style={{ background: FIELD_BG, border: `1px solid ${line(0.08)}`, color: txt(0.8), fontFamily: T.sans, lineHeight: 1.55 }}
                        />
                      </div>
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
                      Чернетка зберігається автоматично
                    </span>
                    <div className="ml-auto flex items-center gap-3.5">
                      <span className="hidden text-[14px] sm:block" style={{ fontFamily: T.sans, color: txt(0.5) }}>Лишився розбір</span>
                      <button
                        type="button"
                        onClick={goNext}
                        className="rounded-xl px-[26px] py-3.5 text-[15px] font-semibold transition-transform duration-150 active:scale-[0.98]"
                        style={{ fontFamily: T.sans, background: ACCENT, color: '#05201a' }}
                      >
                        Далі →
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
                      ← Назад
                    </button>
                    <div className="flex items-center gap-3.5">
                      <span className="hidden text-[14px] sm:block" style={{ fontFamily: T.sans, color: submitReady ? `rgba(${ACCENT_RGB},0.85)` : txt(0.5) }}>
                        {submitReady ? 'Усі відповіді на місці' : `Лишилось ${7 - psyDoneAll}`}
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
                        {existingTrade ? 'Оновити трейд' : 'Записати трейд'}
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
