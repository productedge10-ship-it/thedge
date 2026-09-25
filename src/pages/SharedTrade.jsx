import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, CalendarDays, Clock, Lock, X, ArrowRight, ArrowUpRight, ArrowDownRight,
  Crosshair, NotebookPen, Check, Link2, Timer, Globe2, ImageOff, Layers, Target, Radio,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { readShared } from '../lib/sharedRead';
import { tvImage } from '../lib/imageStore';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';

/* ==================================================================
   Публічна сторінка угоди.

   Людина відкриває її з посилання — у чаті, в Telegram, від ментора.
   Тож перше, що вона має побачити за секунду: актив, напрям і
   результат у R. Далі — сам графік великим планом, а поруч коротка
   картка виконання: наскільки угода була за правилами.

   Акаунт і гроші в доларах чужим не показуємо — лише R і ризик.
================================================================== */

const COLUMNS = [
  'id', 'plan_date', 'plan_pair', 'type', 'session', 'result', 'rr', 'risk', 'setup',
  'entry_time', 'exit_time', 'trade_description', 'trade_image', 'trade_images',
  'followed_plan', 'rushed', 'has_mistake', 'share_tda', 'shared_tda',
].join(', ');

const RESULT = {
  Win: { label: 'Тейк', c: T.ok, rgb: T.okRgb },
  Lose: { label: 'Стоп', c: T.bad, rgb: T.badRgb },
  BE: { label: 'Беззбиток', c: T.warn, rgb: T.warnRgb },
};

const SESSION_UA = { Asia: 'Азія', London: 'Лондон', 'New York': 'Нью-Йорк' };

const fmtDate = (d) => {
  try {
    return new Date(`${d}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return d; }
};

/* Тривалість угоди з часу входу й виходу — «38 хв», «2 год 5 хв». */
function duration(entry, exit) {
  const toMin = (s) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const a = toMin(entry);
  const b = toMin(exit);
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h ? `${h} год${m ? ` ${m} хв` : ''}` : `${m} хв`;
}

/* ---------- примітиви ---------- */

function Glass({ children, className = '', style }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[22px] ${className}`}
      style={{
        background: `linear-gradient(180deg, rgba(255,255,255,0.028), rgba(255,255,255,0.008)), ${T.surface}`,
        border: `1px solid ${T.line}`,
        boxShadow: '0 30px 80px -40px rgba(0,0,0,0.85)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ icon: Icon, children, color = T.text4 }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon size={13} strokeWidth={2.3} style={{ color }} />}
      <span className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color }}>
        {children}
      </span>
    </div>
  );
}

/* ---------- сітка графіків розбору ----------
   Один вигляд і для TDA, і для апдейтів: це той самий блок плану,
   різниця лише в підписі над ним (таймфрейм чи дата). */
function ChartGrid({ blocks, onZoom, eyebrowOf }) {
  /* Дві колонки — тільки коли є що ставити в обидві.

     Один блок у двоколонковій сітці займав ліву половину, а права
     лишалась порожнім темним прямокутником на пів екрана: виглядало
     як недовантажена картка. Непарний останній блок із тієї ж
     причини розтягується на всю ширину. */
  const two = blocks.length > 1;
  const odd = two && blocks.length % 2 === 1;

  return (
    <div className={`grid grid-cols-1 gap-px ${two ? 'xl:grid-cols-2' : ''}`} style={{ background: T.line }}>
      {blocks.map((b, i) => (
        <div
          key={b.id || i}
          className={`flex flex-col ${odd && i === blocks.length - 1 ? 'xl:col-span-2' : ''}`}
          style={{ background: T.surface }}
        >
          {b.image && (
            <button
              onClick={() => onZoom(b.image)}
              className="group relative block w-full cursor-zoom-in"
              style={{ background: T.sunken }}
            >
              <img
                src={tvImage(b.image)}
                alt=""
                className={`block h-auto w-full object-contain ${two ? 'max-h-[40vh]' : 'max-h-[56vh]'}`}
                /* Світлі графіки з TradingView на темній сторінці
                   світяться ліхтарем — автор міг приглушити їх у себе,
                   і це рішення їде разом зі знімком. */
                style={{ opacity: b.isDimmed ? 0.72 : 1 }}
              />
              {eyebrowOf(b) && (
                <span
                  className="absolute left-3 top-3 rounded-md px-2 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em]"
                  style={{ background: 'rgba(10,10,12,0.82)', border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans, backdropFilter: 'blur(8px)' }}
                >
                  {eyebrowOf(b)}
                </span>
              )}
            </button>
          )}

          {b.text?.trim() && (
            <p
              className="whitespace-pre-wrap px-5 py-4 text-[14.5px]"
              style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}
            >
              {b.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, color = T.text, sub }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-4">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text4 }}>{label}</span>
      <span className="truncate text-[20px] font-bold leading-none tabular-nums" style={{ fontFamily: T.mono, color }}>{value}</span>
      {sub && <span className="truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{sub}</span>}
    </div>
  );
}

/* Кільце дисципліни: скільки з трьох правил дотримано. */
function Ring({ value, total, color }) {
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={R} fill="none" stroke={T.line} strokeWidth="6" />
        <motion.circle
          cx="38" cy="38" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - value / total) }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.3 }}
          style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <span className="absolute text-[19px] font-bold tabular-nums" style={{ fontFamily: T.mono, color }}>
        {value}/{total}
      </span>
    </div>
  );
}

/* ================================================================== */

export default function SharedTrade() {
  useEdgeFonts();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [trade, setTrade] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        /* Лише цей запис і лише ці поля — див. src/lib/sharedRead.js */
        const data = await readShared('shared_trade', id, async () => {
          const { data: d, error: e } = await supabase.from('trades').select(COLUMNS)
            .eq('id', id).eq('is_public', true).maybeSingle();
          if (e) throw e;
          return d;
        });
        if (!data) throw new Error('closed');
        setTrade(data);
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

  /* Розбір дня — знімок, покладений у саму угоду в момент, коли автор
     відкрив його кнопкою. Плану тут не читаємо: він приватний. */
  const tda = useMemo(() => {
    /* Порожній знімок мусить мати ту саму форму, що й повний —
       інакше нижче падає tda.updates.length на ще не поширеній угоді. */
    if (!trade?.share_tda || !trade.shared_tda) return { blocks: [], planText: '', updates: [] };
    /* Перші знімки клались голим масивом блоків. Читаємо обидва
       формати, щоб уже поширені посилання не осліпли. */
    const raw = trade.shared_tda;
    const blocks = Array.isArray(raw) ? raw : (raw.blocks || []);
    return {
      blocks: blocks.filter((b) => b?.image || b?.text?.trim()),
      planText: Array.isArray(raw) ? '' : (raw.planText || ''),
      updates: Array.isArray(raw) ? [] : (raw.updates || []).filter((u) => u?.image || u?.text?.trim()),
    };
  }, [trade]);


  const images = useMemo(() => {
    if (!trade) return [];
    const list = Array.isArray(trade.trade_images) && trade.trade_images.length ? trade.trade_images : [trade.trade_image];
    return list.filter(Boolean);
  }, [trade]);

  /* Зміст збоку — рівно ті секції, які справді є на сторінці.
     Оголошено після images і tda: обидва потрібні, щоб вирішити, які
     пункти взагалі показувати. */
  const sections = useMemo(() => [
    images.length && { id: 'chart', label: 'Графік угоди', icon: Crosshair },
    tda.blocks.length && { id: 'plan', label: 'Trading Plan', icon: Layers },
    tda.planText && { id: 'strategy', label: 'Стратегія і входи', icon: Target },
    tda.updates.length && { id: 'updates', label: 'Апдейти сесії', icon: Radio },
    trade?.trade_description?.trim() && { id: 'logic', label: 'Логіка угоди', icon: NotebookPen },
  ].filter(Boolean), [images, tda, trade]);

  const jump = (anchor) => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* буфер недоступний — нічого страшного */ }
  };

  const TopBar = () => (
    <div className="sticky top-0 z-40" style={{ background: 'rgba(10,10,12,0.78)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${T.line}` }}>
      <div className="mx-auto flex w-full items-center gap-3 px-4 py-3 sm:px-8 lg:px-[5vw] 2xl:px-[7vw]">
        <Link to={user ? '/app' : '/'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>
        <span
          className="ml-1 hidden items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:flex"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
        >
          <Globe2 size={12} strokeWidth={2.2} /> публічна угода
        </span>
        <div className="ml-auto flex items-center gap-2">
          {trade && (
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
              {error === 'closed' ? 'Угода закрита' : 'Угоди не існує'}
            </h1>
            <p className="text-[15px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {error === 'closed'
                ? 'Власник ще не відкрив доступ до цієї угоди. Попроси його натиснути «Поділитись» — і посилання запрацює.'
                : 'Схоже, посилання застаріло або угоду видалили.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const t = trade;
  const res = RESULT[t.result] || null;
  const rr = parseFloat(t.rr);
  const hasR = !Number.isNaN(rr);
  const tone = hasR ? (rr > 0 ? { c: T.ok, rgb: T.okRgb } : rr < 0 ? { c: T.bad, rgb: T.badRgb } : { c: T.text2, rgb: '180,180,189' })
    : res ? { c: res.c, rgb: res.rgb } : { c: T.text2, rgb: '180,180,189' };
  const isLong = t.type === 'Long';
  const DirIcon = isLong ? ArrowUpRight : ArrowDownRight;
  const dirTone = isLong ? { c: T.ok, rgb: T.okRgb } : { c: T.bad, rgb: T.badRgb };
  const time = t.entry_time && t.exit_time ? `${t.entry_time.slice(0, 5)} → ${t.exit_time.slice(0, 5)}` : null;
  const dur = duration(t.entry_time, t.exit_time);
  const process = [
    { label: 'Дотримався плану', hint: 'вхід за сценарієм', ok: !!t.followed_plan },
    { label: 'Без помилки в аналізі', hint: 'структура прочитана вірно', ok: !t.has_mistake },
    { label: 'Без поспіху / FOMO', hint: 'дочекався сигналу', ok: !t.rushed },
  ];
  const okCount = process.filter((p) => p.ok).length;
  const discTone = okCount === 3 ? T.ok : okCount === 2 ? T.warn : T.bad;
  const discVerdict = okCount === 3 ? 'Чисте виконання' : okCount === 2 ? 'Дрібне відхилення' : 'Виконання з порушеннями';

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />
      {/* Ледь помітне сяйво кольору результату за шапкою — перше, що
          «читається» ще до тексту: зелене — плюс, червоне — мінус. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{ background: `radial-gradient(60% 70% at 50% 0%, rgba(${tone.rgb},0.14), transparent 70%)` }}
      />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full px-4 pb-24 pt-8 sm:px-8 sm:pt-12 lg:px-[5vw] 2xl:px-[7vw]">
          {/* ─────────── Герой ─────────── */}
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <Glass>
              <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
                <div className="min-w-0">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    {t.type && (
                      <span
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: `rgba(${dirTone.rgb},0.12)`, border: `1px solid rgba(${dirTone.rgb},0.3)`, color: dirTone.c, fontFamily: T.sans }}
                      >
                        <DirIcon size={14} strokeWidth={2.6} /> {isLong ? 'Лонг' : 'Шорт'}
                      </span>
                    )}
                    {res && (
                      <span
                        className="rounded-lg px-2.5 py-1 text-[12.5px] font-bold uppercase tracking-[0.08em]"
                        style={{ background: `rgba(${res.rgb},0.12)`, border: `1px solid rgba(${res.rgb},0.3)`, color: res.c, fontFamily: T.sans }}
                      >
                        {res.label}
                      </span>
                    )}
                    {t.setup && (
                      <span
                        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold"
                        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                      >
                        <Crosshair size={12} strokeWidth={2.3} style={{ color: T.text4 }} /> {t.setup}
                      </span>
                    )}
                  </div>

                  <h1 className="truncate text-[40px] font-bold leading-none sm:text-[56px]" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}>
                    {t.plan_pair || 'Угода'}
                  </h1>

                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {t.plan_date && <span className="flex items-center gap-2"><CalendarDays size={14} strokeWidth={2.2} style={{ color: T.text4 }} />{fmtDate(t.plan_date)}</span>}
                    {t.session && <span className="flex items-center gap-2"><Globe2 size={14} strokeWidth={2.2} style={{ color: T.text4 }} />{SESSION_UA[t.session] || t.session}</span>}
                    {time && <span className="flex items-center gap-2 tabular-nums"><Clock size={14} strokeWidth={2.2} style={{ color: T.text4 }} />{time}</span>}
                  </div>
                </div>

                {hasR && (
                  <div className="shrink-0 sm:text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text4 }}>Результат</div>
                    <div
                      className="mt-1 text-[56px] font-bold leading-none tabular-nums sm:text-[72px]"
                      style={{ fontFamily: T.mono, color: tone.c, letterSpacing: '-0.04em', textShadow: `0 0 40px rgba(${tone.rgb},0.35)` }}
                    >
                      {rr > 0 ? '+' : ''}{rr}R
                    </div>
                  </div>
                )}
              </div>

              {/* Розділювачі — щілина в 1px поверх фону кольору лінії, а не
                  рамки окремих плиток: так лінії правильні і в 4 колонки,
                  і в 2 на телефоні, без правил під кожен розмір. */}
              <div className="grid grid-cols-2 gap-px sm:grid-cols-4" style={{ background: T.line, borderTop: `1px solid ${T.line}` }}>
                {[
                  { label: 'Ризик', value: t.risk || '—', color: T.text },
                  { label: 'Напрям', value: t.type ? (isLong ? 'Лонг' : 'Шорт') : '—', color: t.type ? dirTone.c : T.text3 },
                  { label: 'Тривалість', value: dur || '—', color: T.text, sub: time },
                  { label: 'Дисципліна', value: `${okCount}/3`, color: discTone },
                ].map((s) => (
                  <div key={s.label} style={{ background: T.surface }}>
                    <Stat {...s} />
                  </div>
                ))}
              </div>
            </Glass>
          </motion.div>

          {/* ─────────── Дисципліна ───────────

              Була окремою карткою в правій колонці — і забирала чверть
              екрана під три галочки, поки сам графік тулився у
              вужчому. Тепер це тонкий рядок одразу під шапкою: те
              саме читається за секунду й не змагається з головним. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.06 }}
            className="mt-4"
          >
            <Glass>
              <div className="flex flex-col gap-px sm:flex-row" style={{ background: T.line }}>
                <div className="flex items-center gap-3 px-5 py-4 sm:w-[300px]" style={{ background: T.surface }}>
                  <Ring value={okCount} total={3} color={discTone} />
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>{discVerdict}</div>
                    <div className="mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {okCount} з 3 правил дотримано
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-px sm:grid-cols-3" style={{ background: T.line }}>
                  {process.map((p, i) => (
                    <motion.div
                      key={p.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, ease: EASE, delay: 0.2 + i * 0.06 }}
                      className="flex items-center gap-3 px-5 py-4"
                      style={{ background: T.surface }}
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={{ background: `rgba(${p.ok ? T.okRgb : T.badRgb},0.12)`, color: p.ok ? T.ok : T.bad }}
                      >
                        {p.ok ? <Check size={15} strokeWidth={2.8} /> : <X size={15} strokeWidth={2.8} />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>{p.label}</div>
                        <div className="truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>{p.ok ? p.hint : 'порушено'}</div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Glass>
          </motion.div>

          {/* ─────────── Зміст + секції ───────────

              Зміст збоку — той самий, що в шерингу планів: сторінка
              стала довшою (графік, розбір, логіка), і скролити її
              наосліп немає сенсу. На вузькому екрані зникає: там
              прокрутка коротка й зміст лише забирав би перший екран. */}
          <div className="mt-4 grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)] 2xl:grid-cols-[240px_minmax(0,1fr)]">
            {sections.length > 1 && (
              <aside className="hidden lg:block">
                <div className="sticky top-24">
                  <div className="mb-3 px-2 text-[10.5px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.text4 }}>Зміст</div>
                  <nav className="flex flex-col gap-1">
                    {sections.map((sec, i) => {
                      const I = sec.icon;
                      return (
                        <button
                          key={sec.id}
                          onClick={() => jump(sec.id)}
                          className="group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200"
                          style={{ color: T.text3 }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
                        >
                          <span className="w-5 shrink-0 text-[11px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{String(i + 1).padStart(2, '0')}</span>
                          <I size={14} strokeWidth={2.2} className="shrink-0" />
                          <span className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans }}>{sec.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              </aside>
            )}

            <div className={`flex min-w-0 flex-col gap-4 ${sections.length > 1 ? '' : 'lg:col-span-2'}`}>

              {/* ---------- Графік угоди ----------
                  Висота обмежена 58vh, а не 80: скрін на весь екран
                  доводилось прокручувати, щоб побачити, що під ним, —
                  а під ним найцікавіше. Хто хоче більше, натискає й
                  відкриває на повний екран. */}
              {images.length > 0 && (
                <motion.div id="chart" style={{ scrollMarginTop: 90 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}>
                  <Glass>
                    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                      <Eyebrow icon={Crosshair} color={T.text3}>Графік угоди</Eyebrow>
                      <div className="flex items-center gap-4">
                        {dur && (
                          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                            <Timer size={13} strokeWidth={2.2} /> {dur}
                          </span>
                        )}
                        {images.length > 1 && (
                          <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                            {active + 1} / {images.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setZoom(images[active])}
                      className="group relative block w-full cursor-zoom-in"
                      style={{ background: T.sunken }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.img
                          key={images[active]}
                          src={tvImage(images[active])}
                          alt=""
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="block h-auto max-h-[58vh] w-full object-contain"
                        />
                      </AnimatePresence>
                      <span
                        className="absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-[12px] font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        style={{ background: 'rgba(0,0,0,0.65)', color: T.text, fontFamily: T.sans, backdropFilter: 'blur(6px)' }}
                      >
                        Натисни, щоб збільшити
                      </span>
                    </button>

                    {images.length > 1 && (
                      <div className="flex gap-2 overflow-x-auto p-3" style={{ borderTop: `1px solid ${T.line}` }}>
                        {images.map((src, i) => (
                          <button
                            key={src + i}
                            onClick={() => setActive(i)}
                            className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg transition-all duration-200"
                            style={{ border: `1px solid ${i === active ? T.acc : T.line}`, opacity: i === active ? 1 : 0.6, background: T.sunken }}
                          >
                            <img src={tvImage(src)} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </Glass>
                </motion.div>
              )}

              {/* ---------- Trading Plan ----------

                  Підготовка до угоди: сітка таймфреймів, стратегія і
                  апдейти по ходу сесії. Показується, тільки якщо автор
                  сам відкрив її кнопкою в картці угоди. */}
              {tda.blocks.length > 0 && (
                <motion.div id="plan" style={{ scrollMarginTop: 90 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.18 }}>
                  <Glass>
                    <div className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                      <Eyebrow icon={Layers} color={T.text3}>Trading Plan</Eyebrow>
                      {t.setup && (
                        <span
                          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-semibold"
                          style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.accLine}`, color: T.acc, fontFamily: T.sans }}
                        >
                          <Crosshair size={12} strokeWidth={2.4} /> {t.setup}
                        </span>
                      )}
                      <span className="ml-auto text-[12px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                        {tda.blocks.length}
                      </span>
                    </div>
                    <ChartGrid blocks={tda.blocks} onZoom={setZoom} eyebrowOf={(b) => b.tf} />
                  </Glass>
                </motion.div>
              )}

              {/* ---------- Стратегія і входи ----------
                  Те саме поле, що в плані дня зветься «Стратегія та
                  точки входу»: чому заходимо і де. Головний текст усієї
                  підготовки, тому окремою карткою, а не приміткою. */}
              {tda.planText && (
                <motion.div id="strategy" style={{ scrollMarginTop: 90 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}>
                  <Glass>
                    <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                      <Eyebrow icon={Target} color={T.text3}>Стратегія і точки входу</Eyebrow>
                    </div>
                    <p className="whitespace-pre-wrap px-6 py-5 text-[15.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.8 }}>
                      {tda.planText}
                    </p>
                  </Glass>
                </motion.div>
              )}

              {/* ---------- Апдейти сесії ----------
                  Що змінилось по ходу дня. Підпис над графіком — дата
                  запису, а не таймфрейм: тут важливо коли, а не де. */}
              {tda.updates.length > 0 && (
                <motion.div id="updates" style={{ scrollMarginTop: 90 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}>
                  <Glass>
                    <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                      <Eyebrow icon={Radio} color={T.text3}>Апдейти сесії</Eyebrow>
                      <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                        {tda.updates.length}
                      </span>
                    </div>
                    <ChartGrid blocks={tda.updates} onZoom={setZoom} eyebrowOf={(u) => u.date || u.tf} />
                  </Glass>
                </motion.div>
              )}

              {/* ---------- Логіка угоди ---------- */}
              {t.trade_description?.trim() && (
                <motion.div id="logic" style={{ scrollMarginTop: 90 }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}>
                  <Glass>
                    <div className="px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
                      <Eyebrow icon={NotebookPen} color={T.text3}>Логіка угоди</Eyebrow>
                    </div>
                    <p className="whitespace-pre-wrap px-6 py-5 text-[15.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.8 }}>
                      {t.trade_description}
                    </p>
                  </Glass>
                </motion.div>
              )}

              {!images.length && (
                <Glass>
                  <div className="flex min-h-[200px] flex-col items-center justify-center gap-2" style={{ background: T.sunken }}>
                    <ImageOff size={22} strokeWidth={1.7} style={{ color: T.text4 }} />
                    <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>Скріна графіка немає</span>
                  </div>
                </Glass>
              )}
            </div>
          </div>

          {/* ─────────── Запрошення ───────────
              Одне, унизу, на всю ширину — після того, як людина вже
              подивилась те, за чим прийшла. */}
          {!user && (
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.24 }}
            >
              <div
                className="flex flex-col items-start gap-5 rounded-[22px] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
                style={{ background: `linear-gradient(120deg, rgba(${T.accRgb},0.13), ${T.surface} 62%)`, border: `1px solid rgba(${T.accRgb},0.2)` }}
              >
                <div className="flex items-center gap-4">
                  <EdgeMonogram />
                  <div className="min-w-0">
                    <div className="text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
                      Веди свої угоди так само
                    </div>
                    <p className="mt-1 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                      Журнал угод, плани по днях і розбір помилок — в одному місці.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigate('/auth')}
                  className="group flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-[14.5px] font-bold transition-all duration-200 hover:-translate-y-px sm:w-auto"
                  style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  Спробувати безкоштовно
                  <ArrowRight size={15} strokeWidth={2.6} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

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
