import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import TextareaAutosize from 'react-textarea-autosize';
import {
  X, Pencil, Save, Trash2, Loader2, ExternalLink, ImagePlus,
  ShieldCheck, ShieldAlert, AlertTriangle, Zap, Brain, FileText,
  Wallet, Clock, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { syncErrorFromTrade, fetchErrorForTrade, catsFromTrade } from '../../lib/errorsStore';
import { CATS } from '../errors/utils';
import ErrorComposerModal from '../errors/ErrorComposerModal';
import ImageSlider from '../ui/ImageSlider';
import { T, EASE, SPRING } from '../../lib/theme';

/* ==================================================================
   Деталі угоди — переписано з нуля.
   Порядок читання: цифри → графіки → опис → процес → психологія.
   Редагування вмикається однією кнопкою і не ламає розкладку:
   ті самі блоки, просто поля стають живими.
================================================================== */

const RESULT_OPTS = [
  { value: 'Win',  c: T.ok,   rgb: T.okRgb },
  { value: 'Lose', c: T.bad,  rgb: T.badRgb },
  { value: 'BE',   c: T.warn, rgb: T.warnRgb },
];

const SESSIONS = ['Asia', 'London', 'New York'];
const TYPES = ['Buy', 'Sell'];

/* ---------- примітиви ---------- */

function Chip({ label, value, icon: Icon, color }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em]"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {Icon && <Icon size={13} strokeWidth={2.6} />}
        {label}
      </span>
      <span
        className="truncate text-[19px] font-bold tabular-nums"
        style={{ fontFamily: T.mono, color: color || T.text }}
      >
        {value}
      </span>
    </div>
  );
}

function Block({ icon: Icon, title, sub, accent, children }) {
  return (
    <section className="overflow-hidden rounded-xl" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <header className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Icon size={16} strokeWidth={2.4} style={{ color: accent || T.text3 }} />
        <div>
          <h4 className="text-[15px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text }}>
            {title}
          </h4>
          {sub && <p className="mt-1 text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>{sub}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Toggle({ value, onChange, editing, invert }) {
  const good = invert ? !value : value;

  if (!editing) {
    return (
      <span
        className="rounded-lg px-3 py-1.5 text-[13px] font-bold"
        style={{
          background: good ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
          border: `1px solid ${good ? `rgba(${T.okRgb},0.24)` : `rgba(${T.badRgb},0.24)`}`,
          color: good ? T.ok : T.bad,
          fontFamily: T.sans,
        }}
      >
        {value ? 'Так' : 'Ні'}
      </span>
    );
  }

  return (
    <div className="flex rounded-lg p-0.5" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
      {[true, false].map((v) => {
        const on = value === v;
        const isGood = invert ? !v : v;
        const c = isGood ? T.ok : T.bad;
        const rgb = isGood ? T.okRgb : T.badRgb;
        return (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            className="rounded-md px-5 py-1.5 text-[13px] font-bold transition-all duration-200"
            style={{
              background: on ? `rgba(${rgb},0.12)` : 'transparent',
              border: `1px solid ${on ? `rgba(${rgb},0.28)` : 'transparent'}`,
              color: on ? c : T.text4,
              fontFamily: T.sans,
            }}
          >
            {v ? 'Так' : 'Ні'}
          </button>
        );
      })}
    </div>
  );
}

function PillGroup({ options, value, onChange, editing, colorMap }) {
  if (!editing) {
    const c = colorMap?.[value];
    return (
      <span
        className="inline-block rounded-lg px-3 py-1.5 text-[13px] font-bold"
        style={
          c
            ? { background: `rgba(${c.rgb},0.10)`, border: `1px solid rgba(${c.rgb},0.24)`, color: c.c, fontFamily: T.mono }
            : { background: 'var(--edge-hair)', border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.mono }
        }
      >
        {value || '—'}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o;
        const c = colorMap?.[o];
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className="rounded-lg px-4 py-2 text-[13px] font-bold transition-all duration-200"
            style={{
              background: on ? (c ? `rgba(${c.rgb},0.12)` : `rgba(${T.accRgb},0.12)`) : T.bg,
              border: `1px solid ${on ? (c ? `rgba(${c.rgb},0.30)` : T.lineAcc) : T.line}`,
              color: on ? (c ? c.c : T.acc) : T.text3,
              fontFamily: T.mono,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Editable({ value, onChange, editing, placeholder, minRows = 4 }) {
  if (!editing) {
    return value?.trim() ? (
      <p
        className="whitespace-pre-wrap px-4 py-3.5"
        style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.75, color: T.text2 }}
      >
        {value}
      </p>
    ) : (
      <p className="px-4 py-3.5 text-[14px] italic" style={{ color: T.text4, fontFamily: T.sans }}>
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
      className="w-full resize-none border-none bg-transparent px-4 py-3.5 outline-none"
      style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.75, color: T.text }}
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
  const isBuy = d.type?.toLowerCase() === 'buy';
  const resultMap = Object.fromEntries(RESULT_OPTS.map((r) => [r.value, r]));
  const typeMap = { Buy: { c: T.ok, rgb: T.okRgb }, Sell: { c: T.bad, rgb: T.badRgb } };

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
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.3, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-[880px] overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px rgba(0,0,0,0.85)' }}
      >
        {/* Шапка */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-4 px-5 py-4"
          style={{ background: T.surface, borderBottom: `1px solid ${T.line}` }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{
                background: isBuy ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
                border: `1px solid ${isBuy ? `rgba(${T.okRgb},0.22)` : `rgba(${T.badRgb},0.22)`}`,
              }}
            >
              {isBuy
                ? <ArrowUpRight size={16} strokeWidth={2.6} style={{ color: T.ok }} />
                : <ArrowDownRight size={16} strokeWidth={2.6} style={{ color: T.bad }} />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <h2
                  className="truncate text-[24px] font-black leading-none"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                >
                  {d.plan_pair || 'Угода'}
                </h2>
                {res && (
                  <span
                    className="rounded-lg px-2.5 py-1 text-[13px] font-bold uppercase tracking-[0.05em]"
                    style={{
                      background: `rgba(${res.rgb},0.10)`,
                      border: `1px solid rgba(${res.rgb},0.24)`,
                      color: res.c,
                      fontFamily: T.sans,
                    }}
                  >
                    {res.value}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {d.plan_date}{d.session ? ` · ${d.session}` : ''}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {d.plan_date && d.plan_pair && (
              <button
                onClick={() => { onClose(); navigate(`/plan/${d.plan_date}/${encodeURIComponent(d.plan_pair)}`); }}
                title="Відкрити план цього дня"
                className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text3; }}
              >
                <ExternalLink size={14} strokeWidth={2.3} />
              </button>
            )}

            {editing ? (
              <motion.button
                onClick={save}
                disabled={saving}
                whileTap={{ scale: 0.96 }}
                transition={SPRING}
                className="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-bold"
                style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} strokeWidth={2.6} />}
                Зберегти
              </motion.button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-bold transition-colors"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                <Pencil size={14} strokeWidth={2.5} /> Редагувати
              </button>
            )}

            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
              style={{ color: T.text4 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
            >
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </header>

        {/* Смуга цифр */}
        <div
          className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4 lg:grid-cols-5"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <Chip label="R" value={isNaN(rr) ? '—' : `${rr > 0 ? '+' : ''}${rr}R`} color={rrColor} />
          <Chip
            label="Профіт"
            value={profit === null ? '—' : `${profit > 0 ? '+' : profit < 0 ? '−' : ''}$${Math.abs(profit).toFixed(2)}`}
            color={profit === null ? T.text4 : profit > 0 ? T.ok : profit < 0 ? T.bad : T.text3}
          />
          <Chip label="Ризик" value={d.risk || '—'} icon={AlertTriangle} />
          <Chip label="Акаунт" value={d.account_name || '—'} icon={Wallet} />
          <Chip label="Сесія" value={d.session || '—'} icon={Clock} />
        </div>

        <div className="flex flex-col gap-3 p-5">
          {/* Параметри — тільки при редагуванні */}
          <AnimatePresence initial={false}>
            {editing && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="overflow-hidden"
              >
                <Block icon={FileText} title="Параметри" accent={T.acc}>
                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        Результат
                      </span>
                      <PillGroup
                        editing
                        options={RESULT_OPTS.map((r) => r.value)}
                        value={d.result}
                        onChange={(v) => set({ result: v })}
                        colorMap={resultMap}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        Напрямок
                      </span>
                      <PillGroup editing options={TYPES} value={d.type} onChange={(v) => set({ type: v })} colorMap={typeMap} />
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        Сесія
                      </span>
                      <PillGroup editing options={SESSIONS} value={d.session} onChange={(v) => set({ session: v })} />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[['rr', 'R'], ['risk', 'Ризик']].map(([k, label]) => (
                        <div key={k} className="flex flex-col gap-2">
                          <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                            {label}
                          </span>
                          <input
                            value={d[k] ?? ''}
                            onChange={(e) => set({ [k]: e.target.value })}
                            className="h-[42px] rounded-lg px-3.5 outline-none"
                            style={{ background: T.bg, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono, fontSize: 15 }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </Block>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Скріншоти */}
          <Block
            icon={ImagePlus}
            title="Скріншоти"
            sub={editing ? 'Ctrl+V — вставити посилання' : `${images.length} зображень`}
            accent={T.acc}
          >
            {images.length > 0 ? (
              <div className="p-3">
                <ImageSlider images={images} containerClassName="h-[300px] rounded-xl" />
              </div>
            ) : editing ? (
              <div
                onPaste={(e) => handlePaste(e, 'trade')}
                tabIndex={0}
                className="m-3 flex min-h-[110px] cursor-text flex-col items-center justify-center gap-2 rounded-xl outline-none"
                style={{ background: T.bg, border: `1px dashed ${T.line}` }}
              >
                <ImagePlus size={20} strokeWidth={1.7} style={{ color: T.text4 }} />
                <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
                  Ctrl+V — вставити лінк
                </span>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-[14px] italic" style={{ color: T.text4, fontFamily: T.sans }}>
                Скріншотів немає
              </p>
            )}
          </Block>

          {/* Опис */}
          <Block icon={FileText} title="Опис угоди" sub="Що бачив, чому зайшов" accent={T.acc}>
            <Editable
              editing={editing}
              value={d.trade_description}
              onChange={(v) => set({ trade_description: v })}
              placeholder="Опису немає"
            />
          </Block>

          {/* Процес */}
          <Block icon={ShieldCheck} title="Процес" sub="Дисципліна виконання" accent={d.followed_plan ? T.ok : T.bad}>
            <div className="flex flex-col">
              {[
                { icon: d.followed_plan ? ShieldCheck : ShieldAlert, label: 'Торгував за планом', key: 'followed_plan', invert: false },
                { icon: AlertTriangle, label: 'Була помилка в аналізі', key: 'has_mistake', invert: true },
                { icon: Zap, label: 'Поспішив / FOMO', key: 'rushed', invert: true },
              ].map((row, i) => {
                const RowIcon = row.icon;
                const good = row.invert ? !d[row.key] : d[row.key];
                return (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    style={{ borderTop: i ? `1px solid ${T.line}` : 'none' }}
                  >
                    <span className="flex items-center gap-2.5">
                      <RowIcon size={16} strokeWidth={2.4} style={{ color: good ? T.ok : T.bad }} />
                      <span className="text-[15px] font-medium" style={{ color: T.text2, fontFamily: T.sans }}>
                        {row.label}
                      </span>
                    </span>
                    <Toggle
                      editing={editing}
                      value={!!d[row.key]}
                      onChange={(v) => set({ [row.key]: v })}
                      invert={row.invert}
                    />
                  </div>
                );
              })}
            </div>
          </Block>

          {/* Розбір помилки */}
          <AnimatePresence initial={false}>
            {d.has_mistake && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="overflow-hidden"
              >
                <section
                  className="overflow-hidden rounded-xl"
                  style={{ background: `rgba(${T.badRgb},0.03)`, border: `1px solid rgba(${T.badRgb},0.16)` }}
                >
                  <header
                    className="flex flex-wrap items-center gap-2.5 px-4 py-3"
                    style={{ borderBottom: `1px solid rgba(${T.badRgb},0.12)` }}
                  >
                    <AlertTriangle size={13} strokeWidth={2.4} style={{ color: T.bad }} />
                    <h4 className="text-[12px] font-semibold" style={{ fontFamily: T.display, color: T.text }}>
                      Розбір помилки
                    </h4>

                    {errDraft?.cats?.length > 0 && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {errDraft.cats.map((id) => {
                          const c = CATS.find((x) => x.id === id);
                          if (!c) return null;
                          return (
                            <span
                              key={id}
                              className="rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
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
                        setErrForm({
                          pair: errDraft?.pair || d.plan_pair || '',
                          desc: d.mistake_description || '',
                          reasons: errDraft?.reasons || [],
                          tvLink: errDraft?.tvLink || d.trade_image || '',
                          cats: errDraft?.cats?.length ? errDraft.cats : catsFromTrade(d),
                        });
                        setComposerOpen(true);
                      }}
                      className="ml-auto flex h-7 items-center rounded-lg px-2.5 text-[11.5px] font-bold transition-colors"
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
                  </header>
                  <Editable
                    editing={editing}
                    value={d.mistake_description}
                    onChange={(v) => set({ mistake_description: v })}
                    placeholder="Помилку не описано"
                  />
                </section>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Психологія */}
          <Block icon={Brain} title="Психологія" sub="Стан під час угоди" accent="var(--edge-acc)">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-4">
              {[
                ['psy_confident', 'Впевненість', false],
                ['psy_fear', 'Страх', true],
                ['psy_repeat', 'Повторний вхід', true],
                ['psy_revenge', 'Відіграш', true],
              ].map(([key, label, invert]) => (
                <div key={key} className="flex flex-col gap-2">
                  <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {label}
                  </span>
                  <Toggle editing={editing} value={!!d[key]} onChange={(v) => set({ [key]: v })} invert={invert} />
                </div>
              ))}
            </div>

            {(editing || d.psy_notes?.trim()) && (
              <div style={{ borderTop: `1px solid ${T.line}` }}>
                <Editable
                  editing={editing}
                  value={d.psy_notes}
                  onChange={(v) => set({ psy_notes: v })}
                  placeholder="Нотаток про стан немає"
                  minRows={3}
                />
              </div>
            )}
          </Block>
        </div>

        {/* Футер */}
        <footer
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
        >
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] font-bold transition-colors"
            style={{ color: T.text4, fontFamily: T.sans }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
          >
            <Trash2 size={15} strokeWidth={2.3} /> Видалити угоду
          </button>

          {editing ? (
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => { setD(trade); setEditing(false); }}
                className="rounded-lg px-4 py-2.5 text-[14px] font-bold"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              >
                Скасувати
              </button>
              <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
                Ctrl+S
              </span>
            </div>
          ) : (
            <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
              Esc — закрити
            </span>
          )}
        </footer>
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
              initial={{ scale: 0.96, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, y: 12, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[360px] overflow-hidden rounded-2xl"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-7 text-center">
                <div
                  className="grid h-11 w-11 place-items-center rounded-xl"
                  style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.22)` }}
                >
                  <Trash2 size={17} strokeWidth={2.3} style={{ color: T.bad }} />
                </div>
                <h3 className="text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
                  Видалити назавжди?
                </h3>
                <p className="text-[14px] leading-relaxed" style={{ color: T.text3, fontFamily: T.sans }}>
                  Разом з угодою зникнуть скріншоти, опис і розбір помилки.
                </p>
              </div>
              <div className="flex gap-2 p-5">
                <button
                  onClick={() => setConfirmDel(false)}
                  className="flex-1 rounded-xl py-3 text-[15px] font-bold"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Скасувати
                </button>
                <button
                  onClick={remove}
                  className="flex-1 rounded-xl py-3 text-[15px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  Видалити
                </button>
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
