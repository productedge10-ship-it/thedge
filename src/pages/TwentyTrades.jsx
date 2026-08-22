import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  HelpCircle, X, RotateCcw, Target, Loader2, Info, Activity,
  AlertTriangle, ShieldCheck,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import { T, EASE, SPRING, useEdgeFonts } from '../lib/theme';

/* ==================================================================
   Метод 20 угод.

   Вправа не про прибуток, а про дисципліну: треба бездоганно
   виконати двадцять угод за своєю системою. Тому головна цифра тут
   не гроші, а відсоток чистого виконання.

   Таблиця «критерії × угоди» тут була помилкою. Двадцять стовпців
   читались як бухгалтерія, а вісімдесят клітинок з окремою
   анімацією на кожній підвішували сторінку на кожен клік. Тепер
   кожна угода — окремий камінь із чотирма гранями: видно стан
   усієї серії з одного погляду, а перемальовується рівно та
   картка, по якій клікнули.
================================================================== */

const CRITERIA = [
  {
    field: 'strategy', title: 'Стратегія', icon: Activity, short: 'СТР',
    desc: 'Повна відповідність твоїй торговій системі. Галочка — лише якщо ринок сформував сетап, який прописаний у плейбуці. Зайшов «на чуйці» — це мінус.',
  },
  {
    field: 'risk', title: 'Ризик', icon: Target, short: 'РИЗ',
    desc: 'Чи дотримався ризику на угоду? Чи не завищив обсяг у спробі відігратись? Чи відповідає позиція стопу? Галочка, якщо не порушив жодного правила керування капіталом.',
  },
  {
    field: 'plan', title: 'План', icon: Info, short: 'ПЛА',
    desc: 'Чи був чіткий план ДО входу: де вхід, стоп, ціль і за яких умов виходиш. Якщо відкрив позицію, а потім думав, куди ставити стоп — це помилка.',
  },
  {
    field: 'execution', title: 'Виконання', icon: ShieldCheck, short: 'ВИК',
    desc: 'Якість дії в моменті. Не відсував стоп, не закрив прибуток зі страху, не вагався на вході. Ідеально — це коли діяв рівно за написаним планом.',
  },
];

const EMPTY = { strategy: null, risk: null, plan: null, execution: null };
const isFilled = (t) => CRITERIA.every((c) => t[c.field] !== null);
const isPerfect = (t) => CRITERIA.every((c) => t[c.field] === true);
const isTouched = (t) => CRITERIA.some((c) => t[c.field] !== null);

/* стан угоди одним словом — від нього залежить колір усюди */
const stateOf = (t) => {
  if (isPerfect(t)) return 'perfect';
  if (isFilled(t)) return 'broken';
  if (isTouched(t)) return 'partial';
  return 'empty';
};

const HUE = {
  perfect: '52,211,153',
  broken: '248,113,113',
  partial: '139,123,255',
  empty: '110,110,124',
};

/* ---------- лічильник, що набігає ---------- */
function Counter({ value, color, suffix = '', size = 30 }) {
  const count = useMotionValue(0);
  const text = useTransform(count, (v) => `${Math.round(v)}${suffix}`);

  useEffect(() => {
    const c = animate(count, value, { duration: 0.6, ease: 'easeOut' });
    return () => c.stop();
  }, [value, count]);

  return (
    <motion.span
      className="font-bold tabular-nums"
      style={{ fontFamily: T.display, color, fontSize: size, letterSpacing: '-0.04em', lineHeight: 1 }}
    >
      {text}
    </motion.span>
  );
}

/* ---------- кільце серії ----------
   Двадцять дуг по колу — по одній на угоду. Це той самий прогрес,
   що був смугою, але тепер видно не «скільки пройдено», а якою саме
   була кожна угода. Одна червона дуга в колі помітна одразу, у
   рядку прогресу вона просто зникала. */
const RING = 208;
const RING_R = 84;

function arc(i, gapDeg = 3.4) {
  const step = 360 / 20;
  const c = RING / 2;
  const a0 = -90 + i * step + gapDeg / 2;
  const a1 = -90 + (i + 1) * step - gapDeg / 2;
  const p = (a) => [
    (c + RING_R * Math.cos((a * Math.PI) / 180)).toFixed(2),
    (c + RING_R * Math.sin((a * Math.PI) / 180)).toFixed(2),
  ];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0},${y0} A${RING_R},${RING_R} 0 0 1 ${x1},${y1}`;
}

const ARCS = Array.from({ length: 20 }, (_, i) => arc(i));

const SEG_COLOR = {
  perfect: T.ok,
  broken: T.bad,
  partial: `rgba(${T.accRgb},0.55)`,
  empty: T.line,
};

function SeriesRing({ states, discipline, color }) {
  return (
    <div className="relative shrink-0" style={{ width: RING, height: RING }}>
      {/* дихання під кільцем — щоб центр не був мертвою плямою */}
      <motion.span
        aria-hidden
        className="absolute inset-6 rounded-full"
        style={{ background: `radial-gradient(circle, rgba(${T.accRgb},0.16), transparent 68%)`, filter: 'blur(14px)' }}
        animate={{ opacity: [0.45, 0.8, 0.45], scale: [0.96, 1.03, 0.96] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <svg width={RING} height={RING} className="absolute inset-0">
        {ARCS.map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            stroke={SEG_COLOR[states[i]]}
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: 1, pathLength: 1 }}
            transition={{ duration: 0.5, delay: i * 0.022, ease: EASE }}
            style={{
              transition: 'stroke .45s ease',
              filter: states[i] === 'perfect'
                ? `drop-shadow(0 0 5px rgba(${T.okRgb},0.55))`
                : states[i] === 'broken'
                  ? `drop-shadow(0 0 5px rgba(${T.badRgb},0.45))`
                  : 'none',
            }}
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Counter value={discipline} color={color} suffix="%" size={46} />
        <span
          className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          дисципліна
        </span>
      </div>
    </div>
  );
}

/* ---------- грань угоди ----------
   Ніякого AnimatePresence: раніше кожна з вісімдесяти клітинок
   тримала власний presence-вузол, і клік по одній змушував
   framer перерахувати всі. Тепер стан — це css-перехід кольору
   плюс коротка кейфрейм-анімація на зміну, і реакція миттєва. */
const Facet = memo(function Facet({ value, criterion, onClick }) {
  const Icon = criterion.icon;

  const tone = value === true ? T.okRgb : value === false ? T.badRgb : null;
  const color = value === true ? T.ok : value === false ? T.bad : T.text4;

  return (
    <button
      onClick={onClick}
      title={criterion.title}
      className="tt-facet relative grid place-items-center rounded-[10px]"
      style={{
        background: tone ? `rgba(${tone},0.11)` : 'rgba(255,255,255,0.018)',
        border: `1px solid ${tone ? `rgba(${tone},0.30)` : T.line}`,
      }}
    >
      <span key={String(value)} className="tt-pop grid place-items-center">
        <Icon size={14} strokeWidth={2.3} style={{ color }} />
      </span>
      {value === false && (
        <span
          aria-hidden
          className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2"
          style={{ background: `rgba(${T.badRgb},0.45)` }}
        />
      )}
    </button>
  );
});

/* ---------- камінь однієї угоди ---------- */
const TradeCard = memo(function TradeCard({ trade, index, onToggle }) {
  const state = stateOf(trade);
  const hue = HUE[state];

  /* світло пишемо прямо в css-змінні вузла, повз React —
     так воно встигає за курсором на будь-якій машині */
  const track = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <motion.div
      onPointerMove={track}
      initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.45, delay: Math.min(index, 12) * 0.022, ease: EASE }}
      className="tt-card relative overflow-hidden rounded-2xl p-2.5"
      style={{
        '--hue': hue,
        background: T.surface,
        border: `1px solid ${state === 'empty' ? T.line : `rgba(${hue},0.28)`}`,
        boxShadow: state === 'perfect'
          ? `0 18px 44px -32px rgba(${hue},0.9)`
          : state === 'broken'
            ? `0 18px 44px -34px rgba(${hue},0.7)`
            : 'none',
      }}
    >
      <span aria-hidden className="tt-cut" />
      <span aria-hidden className="tt-shine" />
      {state === 'perfect' && <span aria-hidden key="burst" className="tt-burst" />}

      <div className="relative z-10 mb-2 flex items-center justify-between px-0.5">
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ fontFamily: T.mono, color: state === 'empty' ? T.text4 : `rgb(${hue})` }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: state === 'empty' ? T.lineHi : `rgb(${hue})`,
            boxShadow: state === 'empty' ? 'none' : `0 0 8px rgba(${hue},0.8)`,
            transition: 'background .4s ease, box-shadow .4s ease',
          }}
        />
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-1.5">
        {CRITERIA.map((c) => (
          <Facet
            key={c.field}
            criterion={c}
            value={trade[c.field]}
            onClick={() => onToggle(index, c.field)}
          />
        ))}
      </div>
    </motion.div>
  );
});

/* ---------- модалка ---------- */
function Sheet({ open, onClose, icon: Icon, kicker, title, children, action }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[300] flex items-start justify-center overflow-y-auto p-3 sm:p-8"
          style={{ background: 'rgba(6,6,8,0.84)', backdropFilter: 'blur(10px)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            transition={SPRING}
            className="my-auto w-full max-w-[520px] overflow-hidden rounded-3xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.line}`,
              boxShadow: '0 40px 100px -30px rgba(0,0,0,0.95)',
            }}
          >
            <div
              className="relative flex items-center gap-3.5 px-5 py-5"
              style={{ borderBottom: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})` }}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.accRgb},0.09)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                <Icon size={18} strokeWidth={2.1} style={{ color: T.acc }} />
              </span>
              <div className="min-w-0 pr-10">
                {kicker && (
                  <div className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                    {kicker}
                  </div>
                )}
                <h3
                  className="mt-0.5 truncate text-[19px] font-bold"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                >
                  {title}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-xl transition-colors duration-200"
                style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text3; }}
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>

            <div className="px-5 py-5 text-[14.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}>
              {children}
            </div>

            {action && <div className="px-5 pb-5">{action}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ================================================================== */

export default function TwentyTrades() {
  useEdgeFonts();
  const { user } = useAuth();

  const [trades, setTrades] = useState(Array(20).fill(EMPTY));
  const [loading, setLoading] = useState(true);
  /* Поки дані не прочитались, писати в базу не можна: інакше
     невдале завантаження перетворюється на затирання прогресу. */
  const [loadError, setLoadError] = useState(null);

  const [about, setAbout] = useState(false);
  const [info, setInfo] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  /* останній стан і таймер запису живуть у ref: клік не має чекати
     ні на рендер, ні на мережу */
  const latest = useRef(trades);
  const timer = useRef(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (user?.id) fetchTrades();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id]);

  async function fetchTrades() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('method_20_trades')
        .select('trades_data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data?.trades_data) {
        let list = Array.isArray(data.trades_data) ? data.trades_data : Array(20).fill(EMPTY);
        while (list.length < 20) list.push(EMPTY);
        list = list.slice(0, 20);
        latest.current = list;
        setTrades(list);
      }
      setLoadError(null);
      readyRef.current = true;
    } catch (err) {
      console.error('fetchTrades', err);
      setLoadError(err.message || 'Не вдалось прочитати дані з бази.');
    } finally {
      setLoading(false);
    }
  }

  const save = useCallback(async (next) => {
    if (!readyRef.current || !user?.id) return;
    const { error } = await supabase
      .from('method_20_trades')
      .upsert({ user_id: user.id, trades_data: next }, { onConflict: 'user_id' });
    if (error) notify.error('Помилка збереження', error.message);
  }, [user?.id]);

  /* Запис відкладений: серію заповнюють чергою кліків, і раніше
     кожен з них слав окремий запит із усіма двадцятьма угодами.
     Саме звідти бралась затримка на натисканні. */
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(latest.current); }, 550);
  }, [save]);

  const flush = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    save(latest.current);
  }, [save]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  /* null → так → ні → null */
  const toggle = useCallback((index, field) => {
    if (!readyRef.current) {
      notify.error('Дані ще не завантажились', 'Онови сторінку — інакше можна затерти збережене.');
      return;
    }
    const next = latest.current.slice();
    const cur = next[index][field];
    next[index] = { ...next[index], [field]: cur === null ? true : cur === true ? false : null };
    latest.current = next;
    setTrades(next);
    schedule();
  }, [schedule]);

  const reset = () => {
    const next = Array(20).fill(EMPTY);
    latest.current = next;
    setTrades(next);
    save(next);
    setConfirmReset(false);
    notify.success('Скинуто', 'Почато нову серію з двадцяти угод.');
  };

  /* ---------- цифри ---------- */
  const stats = useMemo(() => {
    const done = trades.filter(isFilled);
    const perfect = trades.filter(isPerfect).length;
    return {
      done: done.length,
      perfect,
      broken: done.length - perfect,
      discipline: done.length ? Math.round((perfect / done.length) * 100) : 0,
      states: trades.map(stateOf),
    };
  }, [trades]);

  const dColor = stats.discipline >= 80 ? T.ok : stats.discipline >= 50 ? T.warn : T.bad;

  return (
    <div className="relative min-h-full">
      <style>{`
        /* ==========================================================
           Камінь угоди. Все на CSS і композиторі: React у ховері не
           бере участі, тому світло не відстає від курсора, а клік
           не чекає на перемальовування сусідів.
        ========================================================== */
        .tt-card {
          --mx: 50%;
          --my: 50%;
          isolation: isolate;
          transition: border-color .45s ease, box-shadow .45s ease, background-color .45s ease;
        }
        .tt-card:hover {
          background-color: ${T.surfaceHi} !important;
          box-shadow:
            0 0 0 1px rgba(var(--hue), 0.16),
            0 26px 60px -34px rgba(var(--hue), 0.75),
            0 16px 36px -28px rgba(0,0,0,0.9) !important;
        }

        .tt-cut, .tt-shine, .tt-burst {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        /* Огранка — видна завжди, дуже слабко */
        .tt-cut {
          background:
            linear-gradient(128deg, rgba(255,255,255,.030) 0 24%, transparent 24.4%),
            linear-gradient(312deg, rgba(255,255,255,.018) 0 19%, transparent 19.4%);
        }

        /* Світло всередині каменя — йде рівно за курсором */
        .tt-shine {
          background: radial-gradient(190px circle at var(--mx) var(--my),
            rgba(var(--hue), .20), rgba(var(--hue), .06) 42%, transparent 70%);
          opacity: 0;
          transition: opacity .35s ease;
        }
        .tt-card:hover .tt-shine { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Спалах у момент, коли угода стала чистою */
        .tt-burst {
          border-radius: 16px;
          box-shadow: 0 0 0 0 rgba(var(--hue), .55);
          animation: tt-burst .85s cubic-bezier(.22,1,.36,1) 1;
        }
        @keyframes tt-burst {
          0%   { box-shadow: 0 0 0 0 rgba(var(--hue), .55); opacity: 1; }
          100% { box-shadow: 0 0 0 18px rgba(var(--hue), 0); opacity: 0; }
        }

        /* Грань */
        .tt-facet {
          height: 38px;
          transition: background-color .22s ease, border-color .22s ease, transform .12s ease;
        }
        .tt-facet:hover { border-color: rgba(255,255,255,.16); }
        .tt-facet:active { transform: scale(.93); }

        .tt-pop { animation: tt-pop .22s cubic-bezier(.22,1,.36,1); }
        @keyframes tt-pop {
          from { transform: scale(.55); opacity: .2; }
          to   { transform: scale(1); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .tt-burst, .tt-pop { animation: none; }
        }
      `}</style>

      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Дисципліна
            </div>
            <h1
              className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              20 угод
            </h1>
            <button
              onClick={() => setAbout(true)}
              className="mt-3 flex items-center gap-2 text-[14px] transition-colors duration-200"
              style={{ fontFamily: T.sans, color: T.text3 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
            >
              Вправа на виконання, а не на прибуток
              <HelpCircle size={14} strokeWidth={2.2} style={{ color: T.acc }} />
            </button>
          </div>

          <button
            onClick={() => setConfirmReset(true)}
            className="group inline-flex h-[42px] shrink-0 items-center gap-2 self-start rounded-xl px-4 text-[13.5px] font-semibold transition-all duration-200 active:scale-[0.98]"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.32)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <RotateCcw size={14} strokeWidth={2.3} className="transition-transform duration-500 group-hover:-rotate-180" />
            Нова серія
          </button>
        </motion.div>

        {loadError && (
          <div
            className="mb-5 flex items-start gap-3 rounded-2xl px-4 py-3.5"
            style={{ background: `rgba(${T.badRgb},0.07)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
          >
            <AlertTriangle size={16} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.bad }} />
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.bad }}>
                Дані не завантажились
              </p>
              <p className="mt-0.5 break-words text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {loadError} · Зміни зараз не зберігаються, щоб не затерти те, що вже є.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2.5 py-32">
            <Loader2 size={18} className="animate-spin" style={{ color: T.acc }} />
            <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              завантажую серію…
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* ─────────── Кільце серії ─────────── */}
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex flex-col items-center gap-7 rounded-3xl px-6 py-7 sm:flex-row sm:gap-10 sm:px-9"
              style={{
                background: `linear-gradient(120deg, rgba(${T.accRgb},0.05), ${T.surface} 58%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <SeriesRing states={stats.states} discipline={stats.discipline} color={dColor} />

              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-3 gap-4 sm:gap-7">
                  {[
                    { label: 'Пройдено', value: stats.done, color: T.text, hint: 'з двадцяти' },
                    { label: 'Ідеальних', value: stats.perfect, color: T.ok, hint: 'усі чотири критерії' },
                    { label: 'З помилкою', value: stats.broken, color: stats.broken ? T.bad : T.text3, hint: 'хоч один пункт' },
                  ].map((k) => (
                    <div key={k.label} className="min-w-0">
                      <div
                        className="mb-2 truncate text-[11px] font-bold uppercase tracking-[0.14em]"
                        style={{ fontFamily: T.sans, color: T.text4 }}
                      >
                        {k.label}
                      </div>
                      <Counter value={k.value} color={k.color} size={34} />
                      <div className="mt-1 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        {k.hint}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 h-px w-full" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />

                <p className="mt-4 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                  {stats.done === 20
                    ? 'Серія закрита. Подивись, які грані ламались найчастіше — саме там твоя робота на наступні двадцять.'
                    : stats.done === 0
                      ? 'Перша угода ще попереду. Позначай чотири грані одразу після закриття позиції, поки памʼятаєш, як діяв.'
                      : `Лишилось ${20 - stats.done} ${20 - stats.done === 1 ? 'угода' : 'угод'}. Результат кожної не має значення — має значення тільки виконання.`}
                </p>
              </div>
            </motion.section>

            {/* ─────────── Легенда граней ─────────── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
              className="flex flex-wrap items-center gap-2"
            >
              <span
                className="mr-1 text-[11px] font-bold uppercase tracking-[0.16em]"
                style={{ fontFamily: T.sans, color: T.text4 }}
              >
                Чотири грані
              </span>
              {CRITERIA.map((c, i) => (
                <button
                  key={c.field}
                  onClick={() => setInfo(c)}
                  className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-200"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                >
                  <c.icon size={13} strokeWidth={2.3} style={{ color: T.acc }} />
                  {c.title}
                  <span className="text-[10.5px]" style={{ color: T.text4 }}>
                    {['↖', '↗', '↙', '↘'][i]}
                  </span>
                </button>
              ))}
            </motion.div>

            {/* ─────────── Двадцять каменів ─────────── */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10">
              {trades.map((t, i) => (
                <TradeCard key={i} trade={t} index={i} onToggle={toggle} />
              ))}
            </div>

            <p className="px-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Клік по грані перемикає: порожньо → виконано → зламано → порожньо.
              Коли всі чотири зелені — угода зараховується як чиста.
            </p>
          </div>
        )}
      </div>

      {/* ─────────── Про метод ─────────── */}
      <Sheet
        open={about}
        onClose={() => setAbout(false)}
        icon={Target}
        kicker="Навіщо це"
        title="Суть вправи"
        action={(
          <button
            onClick={() => setAbout(false)}
            className="h-11 w-full rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
            style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
          >
            Зрозуміло
          </button>
        )}
      >
        <p style={{ color: T.text }}>Навчитись мислити ймовірностями.</p>
        <p className="mt-3">
          Вправа відключає емоційну привʼязку до окремої угоди. Мета — бездоганно виконати
          двадцять угод за своєю системою. Результат кожної окремої угоди не має значення:
          мінус за планом зараховується, плюс проти плану — ні.
        </p>
        <p className="mt-3">
          Кожна угода — камінь із чотирма гранями. Натисни назву грані вгорі, щоб побачити,
          що саме там зараховується.
        </p>
      </Sheet>

      {/* ─────────── Пояснення критерію ─────────── */}
      <Sheet
        open={!!info}
        onClose={() => setInfo(null)}
        icon={info?.icon || Info}
        kicker="Грань"
        title={info?.title || ''}
        action={(
          <button
            onClick={() => setInfo(null)}
            className="h-11 w-full rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
            style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
          >
            Зрозумів
          </button>
        )}
      >
        {info?.desc}
      </Sheet>

      {/* ─────────── Скидання ─────────── */}
      <Sheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        icon={RotateCcw}
        kicker="Нова серія"
        title="Скинути всі двадцять?"
        action={(
          <div className="flex gap-2.5">
            <button
              onClick={() => setConfirmReset(false)}
              className="h-11 flex-1 rounded-xl text-[14px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
            >
              Залишити
            </button>
            <button
              onClick={reset}
              className="h-11 flex-1 rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
              style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
            >
              Скинути
            </button>
          </div>
        )}
      >
        Поточний прогрес зникне назавжди — усі позначки по двадцятьох угодах.
        Скидай тільки коли серія справді завершена.
      </Sheet>
    </div>
  );
}
