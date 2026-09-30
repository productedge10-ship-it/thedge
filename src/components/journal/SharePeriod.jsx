import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link2, Copy, Check, Trash2, Loader2, X, Calendar } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { shareUrl } from '../../lib/sandbox';
import { notify } from '../../utils/notify';
import { T, SPRING } from '../../lib/theme';
import { t } from '../../lib/lang';
import { DateRangeField } from '../ui/DateField';

/* ==================================================================
   Поділитись журналом за період.

   Не новий «публічний» екран, а той самий перегляд /view/<токен>,
   що й у «Share journal» у налаштуваннях: гість бачить справжню
   сторінку журналу, тільки лише з угодами вибраних дат і без права
   щось змінити. Різниця — у токені (починається з «p») і в тому, що
   угоди фільтрує база (shared_journal_period), а не браузер гостя.

   Посилань може бути кілька одночасно, тому внизу список живих із
   кнопкою «закрити доступ»: скинув ментору вересень — і прибрав,
   коли розібрали.
================================================================== */

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Тиждень з понеділка: так рахує і календар новин, і сам трейдер. */
function presetRange(id) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  switch (id) {
    case 'week': return { from: iso(monday), to: iso(now) };
    case 'lastweek': {
      const a = new Date(monday); a.setDate(monday.getDate() - 7);
      const b = new Date(monday); b.setDate(monday.getDate() - 1);
      return { from: iso(a), to: iso(b) };
    }
    case 'month': return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case 'lastmonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case '30d': { const a = new Date(now); a.setDate(now.getDate() - 30); return { from: iso(a), to: iso(now) }; }
    case 'all': return { from: '', to: '' };
    default: return null;
  }
}

const PRESETS = [
  { id: 'week', label: t('Цей тиждень', 'This week') },
  { id: 'lastweek', label: t('Минулий тиждень', 'Last week') },
  { id: 'month', label: t('Цей місяць', 'This month') },
  { id: 'lastmonth', label: t('Минулий місяць', 'Last month') },
  { id: '30d', label: t('30 днів', '30 days') },
  { id: 'all', label: t('Весь час', 'All time') },
];

const dm = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('.') : '');
function periodText(from, to) {
  if (!from && !to) return t('Весь час', 'All time');
  if (from && to) return from === to ? dm(from) : `${dm(from)} – ${dm(to)}`;
  return from ? t(`з ${dm(from)}`, `from ${dm(from)}`) : t(`до ${dm(to)}`, `until ${dm(to)}`);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function SharePeriodModal({ initial, onClose }) {
  const { user } = useAuth();
  const [from, setFrom] = useState(initial?.from || '');
  const [to, setTo] = useState(initial?.to || '');
  const [preset, setPreset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('journal_period_shares')
        .select('token, date_from, date_to, created_at')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (alive) setLinks(error ? [] : (data || []));
    })();
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pick = (id) => {
    const r = presetRange(id);
    if (!r) return;
    setPreset(id);
    setFrom(r.from);
    setTo(r.to);
  };

  const flash = (token) => {
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 1800);
  };

  const copy = async (token) => {
    if (await copyText(shareUrl(token))) flash(token);
    else notify.error(t('Не вдалось скопіювати', 'Could not copy'), t('Виділи посилання й скопіюй вручну.', 'Select the link and copy it manually.'));
  };

  const bad = from && to && from > to;

  const create = async () => {
    if (busy || bad) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('journal_period_shares')
      .insert({ user_id: user.id, date_from: from || null, date_to: to || null })
      .select('token, date_from, date_to, created_at')
      .single();
    setBusy(false);
    if (error) {
      notify.error(t('Не вдалось створити посилання', 'Could not create the link'), error.message);
      return;
    }
    setFresh(data.token);
    setLinks((l) => [data, ...(l || [])]);
    copy(data.token);
  };

  const revoke = async (token) => {
    const { error } = await supabase.from('journal_period_shares').delete().eq('token', token).eq('user_id', user.id);
    if (error) { notify.error(t('Не вдалось закрити доступ', 'Could not close access'), error.message); return; }
    setLinks((l) => (l || []).filter((x) => x.token !== token));
    if (fresh === token) setFresh(null);
    notify.success(t('Доступ закрито', 'Access closed'), t('За цим посиланням більше нічого не відкриється.', 'This link no longer opens anything.'));
  };

  const input = {
    height: 44, borderRadius: 12, padding: '0 12px', fontFamily: T.sans, fontSize: 14, fontWeight: 600,
    background: T.bg, border: `1px solid ${T.line}`, color: T.text, width: '100%', minWidth: 0, boxSizing: 'border-box',
  };
  const iconBtn = {
    width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', flexShrink: 0,
    background: T.bg, border: `1px solid ${T.line}`, color: T.text3,
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        transition={SPRING}
        style={{ width: 'min(560px, 100%)', maxHeight: '90dvh', overflowY: 'auto', borderRadius: 20, background: T.surface, border: `1px solid ${T.line}`, padding: 22, fontFamily: T.sans, color: T.text }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: T.acc }}>{t('Поділитись', 'Share')}</div>
            <div style={{ fontFamily: T.display, fontSize: 22, fontWeight: 700, marginTop: 4 }}>{t('Журнал за період', 'Journal for a period')}</div>
          </div>
          <button type="button" onClick={onClose} style={{ ...iconBtn, border: 'none', background: 'transparent' }} aria-label={t('Закрити', 'Close')}>
            <X size={17} />
          </button>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: T.text3, marginBottom: 18 }}>
          {t(
            'За посиланням відкриється твій журнал угод лише з угодами цих дат. Змінити, додати чи видалити там нічого не можна.',
            'The link opens your trade journal with only the trades from these dates. Nothing can be changed, added or deleted there.',
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {PRESETS.map((p) => {
            const on = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                style={{
                  height: 36, padding: '0 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  background: on ? `rgba(${T.accRgb},.14)` : T.bg,
                  border: `1px solid ${on ? T.lineAcc : T.line}`, color: on ? T.acc : T.text2,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Той самий календар, що на решті сайту (DateRangeField), а не
            нативний <input type="date"> — той малювався засобами ОС,
            світлим і чужим шрифтом поверх темного вікна. */}
        <div style={{ marginBottom: 6 }}>
          <DateRangeField
            value={{ from, to }}
            onChange={(r) => { setFrom(r.from || ''); setTo(r.to || ''); setPreset(null); }}
            placeholder={t('Весь час', 'All time')}
            height={44}
            fontSize={14}
            z={700}
          />
        </div>
        <div style={{ fontSize: 12.5, color: bad ? T.bad : T.text4, minHeight: 18, marginBottom: 12 }}>
          {bad
            ? t('Дата «від» пізніша за «до».', '“From” is later than “To”.')
            : !from && !to ? t('Порожні дати = усі угоди за весь час.', 'Empty dates = all trades of all time.') : periodText(from, to)}
        </div>

        <button
          type="button"
          onClick={create}
          disabled={busy || bad}
          className="edge-add-btn"
          style={{ width: '100%', height: 46, borderRadius: 12, fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: bad ? 0.5 : 1 }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} strokeWidth={2.4} />}
          {t('Створити посилання й скопіювати', 'Create link & copy')}
        </button>

        <AnimatePresence>
          {fresh && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input readOnly value={shareUrl(fresh)} onFocus={(e) => e.target.select()} style={{ ...input, fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, border: `1px solid ${T.lineAcc}` }} />
                <button type="button" onClick={() => copy(fresh)} style={{ ...iconBtn, width: 44, height: 44, color: copied === fresh ? T.ok : T.text2 }} aria-label={t('Копіювати', 'Copy')}>
                  {copied === fresh ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.text4, marginBottom: 10 }}>
            {t('Активні посилання', 'Active links')}
          </div>
          {links === null ? (
            <Loader2 size={16} className="animate-spin" style={{ color: T.text4 }} />
          ) : links.length === 0 ? (
            <div style={{ fontSize: 13.5, color: T.text4 }}>{t('Поки немає жодного.', 'None yet.')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {links.map((l) => (
                <div key={l.token} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: T.bg, border: `1px solid ${T.line}` }}>
                  <Calendar size={15} style={{ color: T.acc, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{periodText(l.date_from, l.date_to)}</div>
                    <div style={{ fontSize: 12, color: T.text4 }}>{t('створено', 'created')} {dm(l.created_at)}</div>
                  </div>
                  <button type="button" onClick={() => copy(l.token)} style={{ ...iconBtn, color: copied === l.token ? T.ok : T.text2 }} title={t('Копіювати посилання', 'Copy link')}>
                    {copied === l.token ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button type="button" onClick={() => revoke(l.token)} style={{ ...iconBtn, color: T.bad }} title={t('Закрити доступ', 'Close access')}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/* Кнопка для рядка фільтрів журналу. Висота 54 — як у сусідніх
   «Asset», «Period» і «Add Trade», щоб рядок лишився рівним. */
export default function SharePeriodButton({ initial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.985 }}
        transition={SPRING}
        className="field-trigger flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl px-4 sm:w-auto"
        style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, fontSize: 14, fontWeight: 700 }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.55)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
        title={t('Поділитись журналом за період', 'Share journal for a period')}
      >
        <Link2 size={15} strokeWidth={2.4} style={{ color: T.acc }} />
        {t('Поділитись', 'Share')}
      </motion.button>
      <AnimatePresence>
        {open && <SharePeriodModal initial={initial} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
