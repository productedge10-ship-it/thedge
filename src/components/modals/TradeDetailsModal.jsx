import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import TextareaAutosize from 'react-textarea-autosize';
import {
  X, Pencil, Save, Trash2, Loader2, ExternalLink, ImagePlus,
  Check, AlertTriangle, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import ImageSlider from '../ui/ImageSlider';
import { T } from '../../lib/theme';

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
const SPRING_UI = { type: 'spring', duration: 0.35, bounce: 0 };
const SPRING_TAP = { type: 'spring', duration: 0.22, bounce: 0 };

const RESULT_OPTS = [
  { value: 'Win',  c: T.ok,   rgb: T.okRgb },
  { value: 'Lose', c: T.bad,  rgb: T.badRgb },
  { value: 'BE',   c: T.warn, rgb: T.warnRgb },
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

function Eyebrow({ children }) {
  return (
    <span className="block text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: MONO, color: T.text4 }}>
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

function PillGroup({ options, value, onChange, editing, colorMap, groupId }) {
  if (!editing) {
    const c = colorMap?.[value];
    return (
      <span className="text-[13.5px] font-semibold" style={{ color: c ? c.c : T.text2, fontFamily: MONO }}>
        {value || '—'}
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
            className="relative overflow-hidden rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors duration-150"
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
            <span className="relative">{o}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/* Час без нативного колеса прокрутки браузера — звичайний текстовий
   інпут з іконкою годинника, як у мінімалістичних полях Apple. */
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
        className="w-[22px] border-none bg-transparent text-center outline-none"
        style={{ color: T.text, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}
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
      <span className="font-bold" style={{ color: T.text4, fontFamily: MONO, fontSize: 15 }}>:</span>
      <TimeSegment value={M} max={59} onChange={(nm) => set(H, nm)} />
    </div>
  );
}

function Editable({ value, onChange, editing, placeholder, minRows = 4 }) {
  if (!editing) {
    return value?.trim() ? (
      <p className="whitespace-pre-wrap text-[14px]" style={{ fontFamily: T.sans, lineHeight: 1.6, color: T.text2 }}>
        {value}
      </p>
    ) : (
      <p className="text-[13.5px] italic" style={{ color: T.text4, fontFamily: T.sans }}>
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
      spellCheck={false}
      className="w-full resize-none rounded-lg border-none px-3 py-2.5 outline-none"
      style={{ fontFamily: T.sans, fontSize: 14, lineHeight: 1.6, color: T.text, background: T.bg }}
    />
  );
}

/* ================================================================== */

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

  const images = useMemo(() => {
    if (Array.isArray(d?.mistake_images) && d.mistake_images.length) return d.mistake_images;
    if (d?.mistake_image) return [d.mistake_image];
    if (d?.trade_image) return [d.trade_image];
    return [];
  }, [d]);

  const profit = useMemo(() => {
    const rr = parseFloat(d?.rr);
    if (isNaN(rr)) return null;
    const s = String(d?.risk || '').trim();
    let riskValue = 0;
    if (s.includes('$')) riskValue = parseFloat(s.replace(/[^0-9.]/g, ''));
    else if (s.includes('%')) riskValue = (accountsMap[d.account_name] || 0) * (parseFloat(s.replace(/[^0-9.]/g, '')) / 100);
    else {
      const v = parseFloat(s);
      if (!isNaN(v)) riskValue = v <= 10 ? (accountsMap[d.account_name] || 0) * (v / 100) : v;
    }
    return riskValue > 0 ? riskValue * rr : null;
  }, [d, accountsMap]);

  async function save() {
    setSaving(true);
    try {
      const { id, ...payload } = d;
      const { error } = await supabase.from('trades').update(payload).eq('id', id);
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

      notify.success('Збережено', 'Зміни в угоді записані.');
      setEditing(false);
      onUpdated?.(d);
      onUpdateTrade?.(d);
    } catch (err) {
      notify.error('Не вдалось зберегти', err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      const { error } = await supabase.from('trades').delete().eq('id', d.id);
      if (error) throw error;
      notify.success('Видалено', 'Угоду прибрано з журналу.');
      onDeleted?.(d.id);
      onDeleteClick?.(d.id);
      if (!onDeleted && !onDeleteClick) onClose();
    } catch (err) {
      notify.error('Помилка', err.message);
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

  const handlePaste = (e, field) => {
    const text = e.clipboardData.getData('text');
    if (text?.startsWith('http')) {
      e.preventDefault();
      if (field === 'trade') set({ trade_image: text });
      else set({ mistake_images: [...(d.mistake_images || []), text] });
    }
  };

  const res = RESULT_OPTS.find((r) => r.value.toLowerCase() === d.result?.trim().toLowerCase());
  const rr = parseFloat(d.rr);
  const rrColor = isNaN(rr) ? T.text4 : rr > 0 ? T.ok : rr < 0 ? T.bad : T.text3;
  const isLong = d.type === 'Long';
  const resultMap = Object.fromEntries(RESULT_OPTS.map((r) => [r.value, r]));
  const typeMap = { Long: { c: T.ok, rgb: T.okRgb }, Short: { c: T.bad, rgb: T.badRgb } };

  const rrDisplay = isNaN(rr) ? '—' : `${rr > 0 ? '+' : ''}${rr}R`;
  const profitDisplay = profit === null ? '—' : `${profit > 0 ? '+' : profit < 0 ? '−' : ''}$${Math.abs(profit).toFixed(2)}`;
  const profitColor = profit === null ? T.text4 : profit > 0 ? T.ok : profit < 0 ? T.bad : T.text3;

  /* Дисципліна — той самий чекліст, що й «Процес», але зведений в
     оцінку для стрічки цифр: скільки з трьох пунктів пройдено без
     відхилень. */
  const processItems = [
    { key: 'followed_plan', label: 'Торгував за планом', invert: false, value: !!d.followed_plan },
    { key: 'has_mistake', label: 'Була помилка в аналізі', invert: true, value: !!d.has_mistake },
    { key: 'rushed', label: 'Поспішив / FOMO', invert: true, value: !!d.rushed },
  ].map((p) => ({ ...p, ok: p.invert ? !p.value : p.value }));
  const okCount = processItems.filter((p) => p.ok).length;
  const deviations = processItems.filter((p) => !p.ok);
  const clean = deviations.length === 0;
  const disciplineColor = clean ? T.ok : T.warn;

  const psyItems = [
    { key: 'psy_confident', label: 'Впевненість', invert: false, value: !!d.psy_confident },
    { key: 'psy_fear', label: 'Страх', invert: true, value: !!d.psy_fear },
    { key: 'psy_repeat', label: 'Повторний вхід', invert: true, value: !!d.psy_repeat },
    { key: 'psy_revenge', label: 'Відіграш', invert: true, value: !!d.psy_revenge },
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
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(14px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 16, scale: 0.97, filter: 'blur(4px)' }}
        transition={SPRING_UI}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[1180px] overflow-hidden rounded-[18px]"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 50px 100px rgba(0,0,0,0.85)' }}
      >
        {/* ---------- ШАПКА ---------- */}
        <header className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
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

          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="truncate text-[21px] font-semibold leading-none" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                {d.plan_pair || 'Угода'}
              </h2>
              {res && (
                <span
                  className="rounded-md px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.1em]"
                  style={{ background: `rgba(${res.rgb},0.09)`, border: `1px solid rgba(${res.rgb},0.24)`, color: res.c, fontFamily: MONO }}
                >
                  {res.value}
                </span>
              )}
              <span className="rounded-md px-2.5 py-[3px] text-[10px] tracking-[0.08em]" style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text3, fontFamily: MONO }}>
                {(d.type || '—').toUpperCase()}{d.session ? ` · ${d.session}` : ''}
              </span>
            </div>
            <span className="text-[12px]" style={{ fontFamily: MONO, color: T.text4 }}>
              {d.plan_date}{timeRange ? ` · ${timeRange}` : ''}
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex shrink-0 items-center gap-2">
            {d.plan_date && d.plan_pair && (
              <motion.button
                onClick={() => { onClose(); navigate(`/plan/${d.plan_date}/${encodeURIComponent(d.plan_pair)}`); }}
                title="Відкрити план цього дня"
                whileTap={{ scale: 0.92 }}
                transition={SPRING_TAP}
                className="grid h-[34px] w-[34px] place-items-center rounded-lg transition-colors"
                style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text3; }}
              >
                <ExternalLink size={14} strokeWidth={2.3} />
              </motion.button>
            )}

            {editing && (
              <motion.button
                onClick={() => { setD(trade); setEditing(false); }}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="h-[34px] rounded-lg px-3 text-[13px] font-semibold transition-colors"
                style={{ color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                Скасувати
              </motion.button>
            )}

            {editing ? (
              <motion.button
                onClick={save}
                disabled={saving}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="flex h-[34px] items-center gap-2 rounded-lg px-4 text-[13px] font-bold"
                style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2.6} />}
                Зберегти
              </motion.button>
            ) : (
              <motion.button
                onClick={() => setEditing(true)}
                whileTap={{ scale: 0.95 }}
                transition={SPRING_TAP}
                className="flex h-[34px] items-center gap-2 rounded-lg px-3.5 text-[13px] font-semibold transition-colors"
                style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                <Pencil size={13} strokeWidth={2.4} /> Редагувати
              </motion.button>
            )}

            <motion.button
              onClick={onClose}
              whileTap={{ scale: 0.9 }}
              transition={SPRING_TAP}
              className="grid h-[34px] w-[34px] place-items-center rounded-lg transition-colors"
              style={{ background: 'transparent', color: T.text4 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.bg; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text4; }}
            >
              <X size={16} strokeWidth={2.3} />
            </motion.button>
          </div>
        </header>

        {/* ---------- СТРІЧКА ЦИФР ---------- */}
        <div className="flex items-stretch px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
          {[
            { label: 'R', value: rrDisplay, color: rrColor, flex: 1 },
            { label: 'Профіт', value: profitDisplay, color: profitColor, flex: 1 },
            { label: 'Ризик', value: d.risk || '—', color: T.text2, flex: 1 },
            { label: 'Акаунт', value: d.account_name || '—', color: T.text3, flex: 1.4, small: true },
          ].map((cell, i) => (
            <div key={cell.label} className="flex min-w-0" style={{ flex: cell.flex }}>
              {i > 0 && <div className="mx-5 my-2.5 w-px shrink-0" style={{ background: T.line }} />}
              <div className="flex min-w-0 flex-col gap-1.5 py-3.5">
                <Eyebrow>{cell.label.toUpperCase()}</Eyebrow>
                <span
                  className={`truncate font-bold tabular-nums ${cell.small ? 'text-[14px] pt-0.5' : 'text-[19px]'}`}
                  style={{ fontFamily: MONO, color: cell.color }}
                >
                  {cell.value}
                </span>
              </div>
            </div>
          ))}
          <div className="mx-5 my-2.5 w-px shrink-0" style={{ background: T.line }} />
          <div className="flex min-w-0 flex-col gap-1.5 py-3.5" style={{ flex: 1 }}>
            <Eyebrow>ДИСЦИПЛІНА</Eyebrow>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[19px] font-bold tabular-nums" style={{ fontFamily: MONO, color: disciplineColor }}>
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
            «тікає». */}
        <motion.div layout transition={SPRING_UI} className="grid lg:grid-cols-[1.55fr_1fr]">
          {/* ЛІВА КОЛОНКА */}
          <motion.div layout transition={SPRING_UI} className="flex flex-col gap-3 p-5" style={{ borderRight: `1px solid ${T.line}` }}>
            {images.length > 0 ? (
              <ImageSlider images={images} containerClassName="min-h-[420px] rounded-2xl" />
            ) : editing ? (
              <div
                onPaste={(e) => handlePaste(e, 'trade')}
                tabIndex={0}
                className="flex min-h-[420px] cursor-text flex-col items-center justify-center gap-2 rounded-2xl outline-none"
                style={{ background: T.bg, border: `1px dashed ${T.lineAcc}` }}
              >
                <ImagePlus size={22} strokeWidth={1.6} style={{ color: T.text4 }} />
                <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>Ctrl+V — вставити лінк на скріншот</span>
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-2xl" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
                <span className="text-[13px]" style={{ fontFamily: MONO, color: T.text4 }}>СКРІНШОТІВ НЕМАЄ</span>
              </div>
            )}

            <div className="rounded-xl p-4" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
              <Eyebrow>ОПИС УГОДИ</Eyebrow>
              <div className="mt-2">
                <Editable editing={editing} value={d.trade_description} onChange={(v) => set({ trade_description: v })} placeholder="Опису немає" />
              </div>
            </div>
          </motion.div>

          {/* ПРАВА КОЛОНКА — довідка й чеклісти */}
          <motion.div layout transition={SPRING_UI} className="flex flex-col gap-3 p-5">
            {/* Параметри. Пілюльні групи (Напрямок/Сесія/Результат) —
                кожна на свій повний рядок: у половині картки «New
                York» переносилась окремо й ламала висоту рядка.
                Вузькі поля (час, R, ризик) лишились по двоє в рядку. */}
            <div className="overflow-hidden rounded-xl" style={{ border: `1px solid ${T.line}`, background: T.bg }}>
              <div className="grid grid-cols-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                {[
                  { label: 'ВХІД', field: 'entry_time' },
                  { label: 'ВИХІД', field: 'exit_time' },
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
                      <span className="text-[13.5px] font-semibold" style={{ fontFamily: MONO, color: T.text2 }}>
                        {d[p.field] ? d[p.field].slice(0, 5) : '—'}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>НАПРЯМОК</Eyebrow>
                <PillGroup groupId="type" editing={editing} options={TYPES} value={d.type} onChange={(v) => set({ type: v })} colorMap={typeMap} />
              </div>

              <div className="flex flex-col gap-2 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>СЕСІЯ</Eyebrow>
                <PillGroup groupId="session" editing={editing} options={SESSIONS} value={d.session} onChange={(v) => set({ session: v })} colorMap={SESSION_COLORS} />
              </div>

              <div className="flex flex-col gap-2 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                <Eyebrow>РЕЗУЛЬТАТ</Eyebrow>
                <PillGroup groupId="result" editing={editing} options={RESULT_OPTS.map((r) => r.value)} value={d.result} onChange={(v) => set({ result: v })} colorMap={resultMap} />
              </div>

              <div className="grid grid-cols-2">
                <div className="flex flex-col gap-1.5 px-3.5 py-3" style={{ borderRight: `1px solid ${T.line}` }}>
                  <Eyebrow>R</Eyebrow>
                  {editing ? (
                    <input
                      value={d.rr ?? ''}
                      onChange={(e) => set({ rr: e.target.value })}
                      placeholder="напр. 2"
                      className="h-7 w-full rounded-md px-2 outline-none"
                      style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: MONO, fontSize: 13 }}
                    />
                  ) : (
                    <span className="text-[13.5px] font-semibold tabular-nums" style={{ fontFamily: MONO, color: rrColor }}>{rrDisplay}</span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 px-3.5 py-3">
                  <Eyebrow>РИЗИК</Eyebrow>
                  {editing ? (
                    <input
                      value={d.risk ?? ''}
                      onChange={(e) => set({ risk: e.target.value })}
                      placeholder="напр. 1%"
                      className="h-7 w-full rounded-md px-2 outline-none"
                      style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: MONO, fontSize: 13 }}
                    />
                  ) : (
                    <span className="text-[13.5px] font-semibold" style={{ fontFamily: MONO, color: T.text2 }}>{d.risk || '—'}</span>
                  )}
                </div>
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
                  <span className="text-[13px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>Процес</span>
                  <span className="text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>Дисципліна виконання</span>
                </div>
                <span className="text-[11px] font-semibold" style={{ fontFamily: MONO, color: clean ? T.ok : T.bad }}>
                  {clean ? 'чисто' : `${deviations.length} відхил.`}
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
                    <span className="flex-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text2 }}>{p.label}</span>
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
                      <span className="flex-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text2 }}>{p.label}</span>
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
                            <span className="flex-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>{p.label}</span>
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
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: MONO, color: T.bad }}>Розбір помилки</span>
                      {errDraft?.cats?.length > 0 && errDraft.cats.map((id) => {
                        const c = CATS.find((x) => x.id === id);
                        if (!c) return null;
                        return <span key={id} className="text-[11px] font-bold" style={{ fontFamily: T.sans, color: c.color }}>{c.label}</span>;
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
                        className="ml-auto text-[11.5px] font-bold underline decoration-dotted underline-offset-2"
                        style={{ fontFamily: T.sans, color: T.text3 }}
                      >
                        {errDraft ? 'Змінити розбір' : 'Розібрати детально'}
                      </motion.button>
                    </div>
                    <div className="mt-2">
                      <Editable editing={editing} value={d.mistake_description} onChange={(v) => set({ mistake_description: v })} placeholder="Помилку не описано" minRows={2} />
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
                  <span className="text-[11px]">◈</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>Психологія</span>
                  <span className="whitespace-nowrap text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>Стан під час угоди</span>
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
                    <div className="grid grid-cols-2">
                      {psyItems.map((p, i) => (
                        <div
                          key={p.key}
                          className="flex items-center gap-2 px-3.5 py-2.5"
                          style={{ borderBottom: i < psyItems.length - 2 ? `1px solid ${T.line}` : 'none', borderRight: i % 2 === 0 ? `1px solid ${T.line}` : 'none' }}
                        >
                          <div className="h-1 w-1 shrink-0 rounded-full" style={{ background: p.ok ? T.text4 : T.bad }} />
                          <span className="flex-1 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{p.label}</span>
                          <YesNo editing={editing} value={p.value} invert={p.invert} onChange={(v) => set({ [p.key]: v })} />
                        </div>
                      ))}
                    </div>
                    {(editing || d.psy_notes?.trim()) && (
                      <div className="px-3.5 py-3" style={{ borderTop: `1px solid ${T.line}` }}>
                        <Editable editing={editing} value={d.psy_notes} onChange={(v) => set({ psy_notes: v })} placeholder="Нотаток про стан немає" minRows={2} />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex-1" />

            <motion.button
              onClick={() => setConfirmDel(true)}
              whileTap={{ scale: 0.97 }}
              transition={SPRING_TAP}
              className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition-colors"
              style={{ color: T.text4, fontFamily: T.sans }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
            >
              <Trash2 size={13} strokeWidth={2.3} /> Видалити угоду
            </motion.button>
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
                <h3 className="text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Видалити назавжди?</h3>
                <p className="text-[13.5px] leading-relaxed" style={{ color: T.text3, fontFamily: T.sans }}>
                  Разом з угодою зникнуть скріншоти, опис і розбір помилки.
                </p>
              </div>
              <div className="flex gap-2 p-5">
                <motion.button
                  onClick={() => setConfirmDel(false)}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAP}
                  className="flex-1 rounded-xl py-3 text-[14.5px] font-bold"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Скасувати
                </motion.button>
                <motion.button
                  onClick={remove}
                  whileTap={{ scale: 0.96 }}
                  transition={SPRING_TAP}
                  className="flex-1 rounded-xl py-3 text-[14.5px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  Видалити
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
