import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, CalendarDays, CalendarRange, Book, Crosshair, Clock, NotebookPen, Lock, X,
  ArrowRight, TrendingUp, TrendingDown, Minus, Coffee, Star, Layers, Target, Link2, Check,
  Globe2, Maximize2, ArrowRightLeft, Hash,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { tvImage } from '../lib/imageStore';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';
import { weekRangeLabel } from '../lib/weekPlan';

/* ==================================================================
   Публічна сторінка плану — денного чи тижневого.

   Її відкриває людина з посилання: колега, ментор, підписник. Тож за
   секунду має бути ясно три речі — який це план (день чи тиждень), про
   що він (актив, bias) і де головне (графіки). Далі — картки секцій і
   збоку короткий зміст, щоб стрибати між ними, а не гортати навмання.
================================================================== */

const BIAS = {
  Bullish: { color: T.ok, rgb: T.okRgb, icon: TrendingUp, ua: 'Бичачий' },
  Bearish: { color: T.bad, rgb: T.badRgb, icon: TrendingDown, ua: 'Ведмежий' },
  Neutral: { color: T.text2, rgb: '180,180,189', icon: Minus, ua: 'Нейтральний' },
  'Day off': { color: T.info, rgb: T.infoRgb, icon: Coffee, ua: 'Вихідний' },
};

const fmtDate = (d) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return d; }
};
const fmtWeekday = (d) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'long' });
  } catch { return ''; }
};

const filled = (b) => b && (b.image || b.text?.trim());

/* ---------- примітиви ---------- */

function Glass({ children, className = '', style, id }) {
  return (
    <div
      id={id}
      className={`relative overflow-hidden rounded-[22px] ${className}`}
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.006)), ${T.surface}`,
        border: `1px solid ${T.line}`,
        boxShadow: '0 30px 80px -40px rgba(0,0,0,0.85)',
        scrollMarginTop: 90,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHead({ icon: Icon, title, right, tone = T.acc }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: T.sunken, border: `1px solid ${T.line}`, color: tone }}>
        <Icon size={15} strokeWidth={2.3} />
      </span>
      <h2 className="min-w-0 flex-1 truncate text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {right}
    </div>
  );
}

/* Поява секцій — одразу при відкритті, коротким каскадом, а не «коли
   доскролив». Анімація за видимістю залежить від IntersectionObserver:
   якщо він не спрацює (вбудований перегляд, збій), гість побачив би
   порожню сторінку замість плану. Зміст ніколи не має від цього залежати. */
let revealIndex = 0;
function Reveal({ children }) {
  const [delay] = useState(() => Math.min(0.08 + (revealIndex++) * 0.05, 0.4));
  useEffect(() => () => { revealIndex = 0; }, []);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay }}>
      {children}
    </motion.div>
  );
}

function Prose({ text, big }) {
  return (
    <p
      className={`whitespace-pre-wrap px-5 py-5 sm:px-6 ${big ? 'text-[16.5px]' : 'text-[15.5px]'}`}
      style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.8 }}
    >
      {text}
    </p>
  );
}

function BiasPill({ value, label, size = 'md' }) {
  if (!value) return null;
  const b = BIAS[value];
  const Icon = b?.icon || Book;
  const big = size === 'lg';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg font-bold ${big ? 'px-3 py-1.5 text-[14px]' : 'px-2.5 py-1 text-[12.5px]'}`}
      style={{
        background: b ? `rgba(${b.rgb},0.12)` : T.sunken,
        border: `1px solid ${b ? `rgba(${b.rgb},0.3)` : T.line}`,
        color: b ? b.color : T.text2,
        fontFamily: T.sans,
      }}
    >
      {label && <span className="font-semibold" style={{ color: T.text4 }}>{label}</span>}
      <Icon size={big ? 15 : 12} strokeWidth={2.5} />
      {b?.ua || value}
    </span>
  );
}

/* Графік: таймфрейм у шапці, зображення на всю ширину з підказкою «збільшити»,
   нотатка під ним. */
function ChartCard({ block, onZoom, eyebrow }) {
  return (
    <Glass>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        <span
          className="rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums"
          style={{ background: `rgba(${T.accRgb},0.12)`, border: `1px solid rgba(${T.accRgb},0.26)`, color: T.acc, fontFamily: T.mono }}
        >
          {block.tf || eyebrow || 'TF'}
        </span>
        {eyebrow && block.tf && (
          <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{eyebrow}</span>
        )}
      </div>
      {block.image && (
        <button onClick={() => onZoom(block.image)} className="group relative block w-full cursor-zoom-in" style={{ background: T.sunken }}>
          <img src={tvImage(block.image)} alt="" className="block h-auto max-h-[70vh] w-full object-contain" />
          <span
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            style={{ background: 'rgba(0,0,0,0.6)', color: T.text, backdropFilter: 'blur(6px)' }}
          >
            <Maximize2 size={14} strokeWidth={2.4} />
          </span>
        </button>
      )}
      {block.text?.trim() && (
        <p className="whitespace-pre-wrap px-4 py-3.5 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.7, borderTop: block.image ? `1px solid ${T.line}` : 'none' }}>
          {block.text}
        </p>
      )}
    </Glass>
  );
}

function ChartGrid({ blocks, onZoom, eyebrowOf }) {
  return (
    <div className={`grid gap-4 ${blocks.length > 1 ? 'xl:grid-cols-2' : ''}`}>
      {blocks.map((b, i) => <ChartCard key={b.id ?? i} block={b} onZoom={onZoom} eyebrow={eyebrowOf?.(b)} />)}
    </div>
  );
}

/* Плитки цифр під героєм. Розділювачі — щілина 1px над фоном лінії,
   тож лінії правильні в будь-якій кількості колонок. */
function Stats({ items }) {
  return (
    <div
      className={`grid gap-px ${items.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
      style={{ background: T.line, borderTop: `1px solid ${T.line}` }}
    >
      {items.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col gap-1.5 px-5 py-4 sm:px-6" style={{ background: T.surface }}>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text4 }}>{s.label}</span>
          <span className="truncate text-[18px] font-bold leading-tight" style={{ fontFamily: s.mono ? T.mono : T.sans, color: s.color || T.text }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */

export default function SharedPlan() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        /* Тільки явно відкриті плани. Політика в базі теж це стереже,
           але фільтр тут дає зрозумілу помилку замість порожнечі. */
        const { data, error: e } = await supabase
          .from('trading_plans')
          .select('id, date, pair, narrative, plan_data, plan_type')
          .eq('id', id)
          .eq('is_public', true)
          .maybeSingle();
        if (e) throw e;
        if (!data) throw new Error('closed');
        setPlan(data);
      } catch (err) {
        setError(err.message === 'closed' ? 'closed' : 'missing');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(null);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [zoom]);

  const isWeekly = plan?.plan_type === 'weekly';
  const d = useMemo(() => plan?.plan_data || {}, [plan]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* буфер недоступний */ }
  };

  const jump = (anchor) => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const TopBar = () => (
    <div className="sticky top-0 z-40" style={{ background: 'rgba(10,10,12,0.78)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${T.line}` }}>
      <div className="mx-auto flex w-full items-center gap-3 px-4 py-3 sm:px-8 lg:px-[5vw] 2xl:px-[7vw]">
        <Link to={user ? '/app' : '/'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>
        {plan && (
          <span
            className="ml-1 hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:flex"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
          >
            <Globe2 size={12} strokeWidth={2.2} /> {isWeekly ? 'тижневий план' : 'денний план'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {plan && (
            <button
              onClick={copyLink}
              className="flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold transition-colors duration-200"
              style={{
                background: copied ? `rgba(${T.okRgb},0.12)` : T.surface,
                border: `1px solid ${copied ? `rgba(${T.okRgb},0.35)` : T.line}`,
                color: copied ? T.ok : T.text2,
                fontFamily: T.sans,
              }}
            >
              {copied ? <Check size={14} strokeWidth={2.6} /> : <Link2 size={14} strokeWidth={2.4} />}
              <span className="hidden sm:inline">{copied ? 'Скопійовано' : 'Копіювати лінк'}</span>
            </button>
          )}
          <button
            onClick={() => navigate(user ? '/app' : '/auth')}
            className="group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-bold transition-all duration-200 hover:-translate-y-px"
            style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
          >
            {user ? 'До застосунку' : 'Спробувати'}
            <ArrowRight size={14} strokeWidth={2.6} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: T.bg }}>
        <Loader2 className="animate-spin" size={30} style={{ color: T.acc }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen" style={{ background: T.bg }}>
        <PlanBackdrop />
        <div className="relative z-10">
          <TopBar />
          <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-4 py-28 text-center">
            <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <Lock size={22} strokeWidth={1.9} style={{ color: T.text4 }} />
            </div>
            <h1 className="mb-2 text-[26px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
              {error === 'closed' ? 'План закритий' : 'Плану не існує'}
            </h1>
            <p className="text-[15px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {error === 'closed'
                ? 'Власник ще не відкрив доступ до цього плану. Попроси його натиснути «Поділитись» — і посилання запрацює.'
                : 'Схоже, посилання застаріло або план видалили.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- дані для розкладки ---------- */
  const typeTone = isWeekly ? { c: T.info, rgb: T.infoRgb } : { c: T.acc, rgb: T.accRgb };
  const bias = BIAS[plan.narrative] || null;

  const dailyTda = (d.tdaBlocks || []).filter(filled);
  const updates = (d.updates || []).filter(filled);
  const review = (d.reviewBlocks || []).filter(filled);
  const analyses = (d.tdaAnalyses || []).filter((t) => t.pair || (t.blocks || []).some(filled));
  const weekAssets = [...new Set(analyses.map((t) => t.pair).filter(Boolean))];
  const rating = Number(isWeekly ? d.weekRating : d.sessionRating) || 0;
  const chartsCount = isWeekly ? analyses.reduce((n, t) => n + (t.blocks || []).filter((b) => b.image).length, 0) : dailyTda.filter((b) => b.image).length;

  /* Секції в порядку показу — з них же будується зміст збоку. */
  const sections = isWeekly
    ? [
      ...analyses.map((t, i) => ({ id: `asset-${i}`, label: t.pair || 'Актив', icon: Layers })),
      d.planText?.trim() && { id: 'thesis', label: 'Теза тижня', icon: NotebookPen },
      updates.length && { id: 'updates', label: 'Проміжні перевірки', icon: Clock },
      (d.conclusionsText?.trim() || rating) && { id: 'conclusions', label: 'Висновки тижня', icon: Book },
    ].filter(Boolean)
    : [
      dailyTda.length && { id: 'tda', label: 'Top-down аналіз', icon: Crosshair },
      d.planText?.trim() && { id: 'plan', label: 'План на день', icon: NotebookPen },
      updates.length && { id: 'updates', label: 'Оновлення сесії', icon: Clock },
      review.length && { id: 'review', label: 'Як вийшло насправді', icon: Target },
      d.conclusionsText?.trim() && { id: 'conclusions', label: 'Висновки', icon: Book },
    ].filter(Boolean);

  const stats = isWeekly
    ? [
      { label: 'Тиждень', value: weekRangeLabel(plan.date) },
      { label: 'Активи', value: weekAssets.length ? weekAssets.join(' · ') : '—', mono: true, color: T.acc },
      { label: 'Графіків', value: String(chartsCount), mono: true },
      { label: 'Оцінка тижня', value: rating ? `${rating} / 5` : '—', mono: true, color: rating ? T.warn : T.text3 },
    ]
    : [
      { label: 'Дата', value: fmtDate(plan.date) },
      { label: 'Актив', value: plan.pair || '—', mono: true, color: T.acc },
      { label: 'Bias', value: bias?.ua || plan.narrative || '—', color: bias?.color },
      { label: 'Графіків', value: String(chartsCount), mono: true },
    ];

  const Stars = ({ value, size = 16 }) => (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={2} fill={n <= value ? T.warn : 'none'} style={{ color: n <= value ? T.warn : T.text4 }} />
      ))}
    </span>
  );

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px]"
        style={{ background: `radial-gradient(60% 70% at 30% 0%, rgba(${typeTone.rgb},0.16), transparent 70%)` }}
      />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full px-4 pb-24 pt-8 sm:px-8 sm:pt-12 lg:px-[5vw] 2xl:px-[7vw]">
          {/* ─────────── Герой ─────────── */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <Glass>
              <div
                aria-hidden
                className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
                style={{ background: `radial-gradient(circle, rgba(${typeTone.rgb},0.22), transparent 65%)` }}
              />
              <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  {/* Тип плану — перше, що бачить гість. */}
                  <span
                    className="mb-5 inline-flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3.5"
                    style={{
                      background: `linear-gradient(135deg, rgba(${typeTone.rgb},0.18), rgba(${typeTone.rgb},0.05))`,
                      border: `1px solid rgba(${typeTone.rgb},0.34)`,
                      boxShadow: `0 10px 28px -14px rgba(${typeTone.rgb},0.8)`,
                    }}
                  >
                    <span className="relative grid h-9 w-9 place-items-center rounded-lg" style={{ background: `rgba(${typeTone.rgb},0.2)`, color: typeTone.c }}>
                      {isWeekly ? <CalendarRange size={17} strokeWidth={2.3} /> : <CalendarDays size={17} strokeWidth={2.3} />}
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: typeTone.c, boxShadow: `0 0 8px rgba(${typeTone.rgb},0.9)` }} />
                    </span>
                    <span className="flex flex-col leading-none">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text4 }}>Спільний</span>
                      <span className="mt-1 text-[15px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>{isWeekly ? 'Тижневий план' : 'Денний план'}</span>
                    </span>
                  </span>

                  <h1
                    className="text-[38px] font-bold leading-[1.02] sm:text-[56px]"
                    style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
                  >
                    {isWeekly ? weekRangeLabel(plan.date) : (d.title || plan.pair)}
                  </h1>
                  <p className="mt-3 text-[15px] first-letter:uppercase" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {isWeekly
                      ? `План на тиждень · ${weekAssets.length || 0} ${weekAssets.length === 1 ? 'актив' : weekAssets.length >= 2 && weekAssets.length <= 4 ? 'активи' : 'активів'}`
                      : `${fmtWeekday(plan.date)} · ${fmtDate(plan.date)}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
                  {isWeekly ? (
                    <>
                      {rating > 0 && <Stars value={rating} size={20} />}
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {analyses.filter((t) => t.pair).map((t, i) => (
                          <button
                            key={t.id || i}
                            onClick={() => jump(`asset-${analyses.indexOf(t)}`)}
                            className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-bold transition-colors duration-200"
                            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
                          >
                            {t.pair}
                            {BIAS[t.narrative] && (() => { const B = BIAS[t.narrative]; const I = B.icon; return <I size={13} strokeWidth={2.6} style={{ color: B.color }} />; })()}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : bias ? (
                    <div
                      className="flex items-center gap-3 rounded-2xl px-4 py-3"
                      style={{ background: `rgba(${bias.rgb},0.1)`, border: `1px solid rgba(${bias.rgb},0.3)`, boxShadow: `0 0 40px -10px rgba(${bias.rgb},0.45)` }}
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `rgba(${bias.rgb},0.16)`, color: bias.color }}>
                        {(() => { const I = bias.icon; return <I size={22} strokeWidth={2.4} />; })()}
                      </span>
                      <span className="flex flex-col leading-none">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text4 }}>Bias на день</span>
                        <span className="mt-1.5 text-[22px] font-bold" style={{ fontFamily: T.display, color: bias.color, letterSpacing: '-0.01em' }}>{bias.ua}</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <Stats items={stats} />
            </Glass>
          </motion.div>

          {/* ─────────── Зміст + секції ─────────── */}
          <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]">
            {sections.length > 1 && (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <div className="mb-3 px-2 text-[10.5px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.text4 }}>Зміст</div>
                  <nav className="flex flex-col gap-1">
                    {sections.map((s, i) => {
                      const I = s.icon;
                      return (
                        <button
                          key={s.id}
                          onClick={() => jump(s.id)}
                          className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200"
                          style={{ color: T.text3 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
                        >
                          <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{String(i + 1).padStart(2, '0')}</span>
                          <I size={14} strokeWidth={2.2} className="shrink-0" />
                          <span className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans }}>{s.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </aside>
            )}

            <div className={`flex min-w-0 flex-col gap-8 ${sections.length > 1 ? '' : 'lg:col-span-2'}`}>
              {isWeekly ? (
                <>
                  {analyses.map((t, i) => {
                    const blocks = (t.blocks || []).filter(filled);
                    const changed = t.actualBias && t.narrative && t.actualBias !== t.narrative;
                    return (
                      <Reveal key={t.id || i}>
                        <Glass id={`asset-${i}`}>
                          <div className="flex flex-wrap items-center gap-3 px-5 py-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.info }}>
                              <Hash size={15} strokeWidth={2.3} />
                            </span>
                            <h2 className="text-[22px] font-bold leading-none" style={{ fontFamily: T.mono, color: T.text, letterSpacing: '-0.02em' }}>
                              {t.pair || 'Актив'}
                            </h2>
                            <div className="ml-auto flex flex-wrap items-center gap-2">
                              <BiasPill value={t.narrative} label="План" />
                              {t.actualBias && (
                                <>
                                  <ArrowRightLeft size={13} strokeWidth={2.3} style={{ color: T.text4 }} />
                                  <BiasPill value={t.actualBias} label="Факт" />
                                </>
                              )}
                            </div>
                          </div>

                          {blocks.length > 0 && (
                            <div className="p-4 sm:p-5">
                              <ChartGrid blocks={blocks} onZoom={setZoom} />
                            </div>
                          )}

                          {t.outcome?.trim() && (
                            <div
                              className="mx-4 mb-5 rounded-2xl sm:mx-5"
                              style={{ background: changed ? `rgba(${T.warnRgb},0.06)` : `rgba(${T.okRgb},0.05)`, border: `1px solid ${changed ? `rgba(${T.warnRgb},0.22)` : `rgba(${T.okRgb},0.2)`}` }}
                            >
                              <div className="flex items-center gap-2 px-5 pt-4">
                                <Target size={14} strokeWidth={2.3} style={{ color: changed ? T.warn : T.ok }} />
                                <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>Що вийшло</span>
                              </div>
                              <p className="whitespace-pre-wrap px-5 pb-4 pt-2 text-[15px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}>{t.outcome}</p>
                            </div>
                          )}
                        </Glass>
                      </Reveal>
                    );
                  })}

                  {d.planText?.trim() && (
                    <Reveal>
                      <Glass id="thesis">
                        <CardHead icon={NotebookPen} title="Теза тижня" />
                        <Prose text={d.planText} big />
                      </Glass>
                    </Reveal>
                  )}

                  {updates.length > 0 && (
                    <Reveal>
                      <div id="updates" style={{ scrollMarginTop: 90 }}>
                        <div className="mb-4 flex items-center gap-2.5 px-1">
                          <Clock size={15} strokeWidth={2.3} style={{ color: T.acc }} />
                          <span className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Проміжні перевірки</span>
                        </div>
                        <ChartGrid blocks={updates} onZoom={setZoom} eyebrowOf={(u) => u.date} />
                      </div>
                    </Reveal>
                  )}

                  {(d.conclusionsText?.trim() || rating > 0) && (
                    <Reveal>
                      <Glass id="conclusions">
                        <CardHead icon={Book} title="Висновки тижня" right={rating > 0 ? <Stars value={rating} /> : null} />
                        {d.conclusionsText?.trim() && <Prose text={d.conclusionsText} big />}
                      </Glass>
                    </Reveal>
                  )}
                </>
              ) : (
                <>
                  {dailyTda.length > 0 && (
                    <Reveal>
                      <div id="tda" style={{ scrollMarginTop: 90 }}>
                        <div className="mb-4 flex items-center gap-2.5 px-1">
                          <Crosshair size={15} strokeWidth={2.3} style={{ color: T.acc }} />
                          <span className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Top-down аналіз</span>
                          <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>від старших ТФ до молодших</span>
                        </div>
                        <ChartGrid blocks={dailyTda} onZoom={setZoom} />
                      </div>
                    </Reveal>
                  )}

                  {d.planText?.trim() && (
                    <Reveal>
                      <Glass id="plan">
                        <CardHead icon={NotebookPen} title="План на день" />
                        <Prose text={d.planText} big />
                      </Glass>
                    </Reveal>
                  )}

                  {updates.length > 0 && (
                    <Reveal>
                      <div id="updates" style={{ scrollMarginTop: 90 }}>
                        <div className="mb-4 flex items-center gap-2.5 px-1">
                          <Clock size={15} strokeWidth={2.3} style={{ color: T.acc }} />
                          <span className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Оновлення по ходу сесії</span>
                        </div>
                        <ChartGrid blocks={updates} onZoom={setZoom} eyebrowOf={(u) => u.date} />
                      </div>
                    </Reveal>
                  )}

                  {review.length > 0 && (
                    <Reveal>
                      <div id="review" style={{ scrollMarginTop: 90 }}>
                        <div className="mb-4 flex items-center gap-2.5 px-1">
                          <Target size={15} strokeWidth={2.3} style={{ color: T.acc }} />
                          <span className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Як вийшло насправді</span>
                        </div>
                        <ChartGrid blocks={review} onZoom={setZoom} />
                      </div>
                    </Reveal>
                  )}

                  {d.conclusionsText?.trim() && (
                    <Reveal>
                      <Glass id="conclusions">
                        <CardHead icon={Book} title="Висновки" right={rating > 0 ? <Stars value={rating} /> : null} />
                        <Prose text={d.conclusionsText} big />
                      </Glass>
                    </Reveal>
                  )}
                </>
              )}

              {sections.length === 0 && (
                <Glass>
                  <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                    <NotebookPen size={22} strokeWidth={1.8} style={{ color: T.text4 }} />
                    <span className="text-[15px]" style={{ fontFamily: T.sans, color: T.text3 }}>План поки порожній</span>
                  </div>
                </Glass>
              )}

              {!user && (
                <Reveal>
                  <div
                    className="flex flex-col items-start gap-4 rounded-[22px] p-6 sm:flex-row sm:items-center sm:p-7"
                    style={{ background: `linear-gradient(120deg, rgba(${T.accRgb},0.14), ${T.surface} 65%)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
                  >
                    <EdgeMonogram />
                    <div className="min-w-0 flex-1">
                      <p className="text-[17px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                        Такий план можна вести й собі
                      </p>
                      <p className="mt-1 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                        Плани по днях і тижнях, розбір угод, статистика й робота з помилками — в одному журналі.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/auth')}
                      className="group flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px"
                      style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                    >
                      Спробувати безкоштовно
                      <ArrowRight size={15} strokeWidth={2.8} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </Reveal>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────── Лайтбокс ─────────── */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-[400] flex cursor-zoom-out items-center justify-center p-4 sm:p-10"
            style={{ background: 'rgba(6,6,8,0.93)', backdropFilter: 'blur(10px)' }}
          >
            <motion.img
              src={tvImage(zoom)} alt=""
              initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="max-h-full max-w-full rounded-2xl object-contain"
              style={{ border: `1px solid ${T.lineHi}` }}
            />
            <button onClick={() => setZoom(null)} className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl" style={{ background: T.surface, border: `1px solid ${T.lineHi}`, color: T.text2 }}>
              <X size={17} strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
