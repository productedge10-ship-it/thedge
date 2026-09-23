import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, TrendingUp, BrainCircuit, Wallet, History as HistoryIcon, FlaskConical, Sparkles, Loader2, BookOpen, Bot, CalendarDays, ChevronDown, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { T, EASE } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import { fetchTrades, fetchDayReviews, periodStart } from '../lib/analyticsStore';
import { useStats, r1 } from '../components/analytics/data';
import { METRICS } from '../lib/statCard';
import { Delta } from '../components/analytics/ui';

import Overview from '../components/analytics/Overview';
import Performance from '../components/analytics/Performance';
import Psychology from '../components/analytics/Psychology';
import Assets from '../components/analytics/Assets';
import History from '../components/analytics/History';
import Simulator from '../components/analytics/Simulator';
import AiLab from '../components/analytics/AiLab';
import { EMOTION_LABEL } from '../components/analytics/data';
import ExportStats from '../components/analytics/ExportStats';
import { withSandbox } from '../lib/sandbox';

/* ==================================================================
   Аналітика.
   Навігація живе зверху: розділи, період і акаунти — один рядок
   керування, і вся ширина екрана лишається графікам, а не панелі.
================================================================== */

const PERIODS = ['Весь час', 'Цей квартал', 'Останні 30 днів', 'Цей тиждень'];

/* Напівпрозорий кант і заливки шапки крутяться навколо однієї змінної
   теми, тому пишемо їх через хелпер, а не двадцять разів рядком. */
const hair = (a) => `rgba(var(--edge-hair-rgb, 255,255,255), ${a})`;

/* «28 угод», а не «28 trades»: у випадашці періоду число стоїть поруч
   із назвою, і однина там трапляється частіше, ніж здається. */
const tradeWord = (n) => {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return 'угода';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'угоди';
  return 'угод';
};

/* Період — випадашка біля «Поділитись», а не рядок пігулок під
   вкладками: чотири підписи поруч із назвами розділів змагались за
   одну й ту саму увагу «що зараз обрано». Тут це один компактний
   тригер, і однаковий на будь-якій ширині екрана — окремого мобільного
   ряду більше не треба.

   Поруч із кожним періодом — скільки угод у нього потрапляє. Без цього
   вибір «цей тиждень» був стрибком наосліп: скільки там даних, видно
   тільки після перемикання. */
function PeriodDropdown({ value, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-[42px] shrink-0 items-center gap-2.5 rounded-[13px] px-[15px]"
        style={{
          background: `linear-gradient(180deg, ${hair(0.055)}, ${hair(0.02)})`,
          border: `1px solid ${open ? T.lineAcc : hair(0.085)}`,
          boxShadow: `inset 0 1px 0 ${hair(0.06)}`,
          transition: 'border-color .18s, background .18s',
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = hair(0.16); }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = hair(0.085); }}
      >
        <CalendarDays size={14} strokeWidth={1.7} style={{ color: T.text3 }} />
        <span className="text-[12.5px] font-semibold" style={{ fontFamily: T.sans, letterSpacing: '-0.01em', color: T.text }}>
          {value}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE }} className="flex shrink-0" style={{ color: T.text3 }}>
          <ChevronDown size={11} strokeWidth={2.6} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute right-0 top-[calc(100%+8px)] z-[70] min-w-[244px] rounded-[15px] p-1.5"
            style={{
              background: T.surfaceHi,
              border: `1px solid ${hair(0.085)}`,
              boxShadow: '0 34px 80px -28px rgba(0,0,0,0.84)',
            }}
          >
            <div
              className="px-2.5 pb-2 pt-[7px] text-[8.5px] font-medium uppercase"
              style={{ fontFamily: T.mono, letterSpacing: '0.3em', color: T.text2 }}
            >
              Період
            </div>

            {PERIODS.map((p) => {
              const on = value === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { onChange(p); setOpen(false); }}
                  className="flex h-[37px] w-full items-center justify-between gap-4 rounded-[10px] px-2.5 text-left"
                  style={{
                    background: on ? hair(0.055) : 'transparent',
                    transition: 'background .15s, color .15s',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = hair(0.03); }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="flex items-center gap-[11px] text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}>
                    <span
                      className="h-1 w-1 shrink-0 rounded-full"
                      style={{ background: on ? T.acc : hair(0.16), boxShadow: on ? `0 0 8px rgba(${T.accRgb},0.8)` : 'none' }}
                    />
                    {p}
                  </span>
                  <span className="shrink-0 text-[9.5px]" style={{ fontFamily: T.mono, letterSpacing: '0.08em', color: on ? T.acc : T.text2 }}>
                    {counts?.[p] || ''}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();

  const [tab, setTab] = useState('Overview');
  const [period, setPeriod] = useState('Весь час');
  const [exportOpen, setExportOpen] = useState(false);

  const [rows, setRows] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [failed, setFailed] = useState(false);

  /* Тягнемо весь журнал один раз, а період ріжемо на клієнті: вибірка
     невелика, а ходити в базу на кожне перемикання «тиждень / місяць»
     означало б затримку там, де її можна не мати. */
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    /* Розбір дня їде окремо й тихо: якщо його не буде, розділ
       психології просто не покаже свій блок, а решта аналітики має
       працювати як працювала. */
    fetchDayReviews(user.id).then(setReviews).catch(() => setReviews([]));

    fetchTrades(user.id)
      .then((data) => { if (alive) setRows(data); })
      .catch(() => { if (alive) { setRows([]); setFailed(true); } });

    return () => { alive = false; };
  }, [user?.id]);

  const scoped = useMemo(() => {
    if (!rows) return null;
    const from = periodStart(period);
    return from ? rows.filter((t) => t.date >= from) : rows;
  }, [rows, period]);

  /* Розбір ріжемо тим самим періодом, що й угоди: інакше «за тиждень»
     показувало б тижневі угоди поруч із причинами за весь час. */
  const scopedReviews = useMemo(() => {
    const from = periodStart(period);
    return from ? reviews.filter((r) => r.date >= from) : reviews;
  }, [reviews, period]);

  const s = useStats(scoped || [], scopedReviews);

  /* Net R для фіналу анімації кнопки «Поділитись» — той самий get(s),
     що й у картці експорту, тож цифра, яку показує кнопка, ніколи не
     розійдеться зі справжнім експортом. */
  const netMetric = useMemo(() => {
    const m = METRICS.find((x) => x.id === 'net');
    return m.get(s);
  }, [s]);

  /* Скільки угод у кожному періоді — щоб вибір у випадашці був
     видимим ще до перемикання. */
  const periodCounts = useMemo(() => {
    const out = {};
    PERIODS.forEach((p) => {
      if (!rows) { out[p] = ''; return; }
      const from = periodStart(p);
      const n = from ? rows.filter((t) => t.date >= from).length : rows.length;
      out[p] = `${n} ${tradeWord(n)}`;
    });
    return out;
  }, [rows]);

  const loading = rows === null;
  const empty = !loading && rows.length === 0;

  const last = s.trades[s.trades.length - 1];
  const bestDay = [...s.byDow].sort((a, b) => b.avg - a.avg)[0];

  /* `tone` — колір розділу: ним світиться іконка і кільце під
     активною вкладкою. Сім сірих значків поспіль читались як один
     довгий елемент; колір робить із ряду карту, де кожен розділ
     впізнається ще до читання підпису. Де є семантичний токен — беремо
     його, решта два відтінки живуть тут. */
  const NAV = [
    { id: 'Overview', label: 'Огляд', icon: LayoutDashboard, anim: 'an-ic-overview', tone: T.acc },
    { id: 'Performance', label: 'Перформанс', icon: TrendingUp, anim: 'an-ic-perf', tone: T.ok },
    { id: 'Psychology', label: 'Психологія', icon: BrainCircuit, badge: `${r1(s.tiltCost)}R`, anim: 'an-ic-psy', tone: '#fb7185' },
    { id: 'Assets', label: 'Активи', icon: Wallet, anim: 'an-ic-assets', tone: T.info },
    /* «Що якби» і «Ризик» були двома вкладками поруч, хоча це один
       ланцюжок: спершу рахуємо, скільки звички коштували на історії,
       що вже є, потім проганяємо те, що лишилось, уперед. Тепер це
       один розділ із двома кроками й передачею цифр між ними. */
    { id: 'Simulator', label: 'Симулятор', icon: FlaskConical, anim: 'an-ic-sim', tone: T.warn },
    { id: 'History', label: 'Історія угод', icon: HistoryIcon, anim: 'an-ic-history', tone: '#2dd4bf' },
    /* AI останнім і з власною міткою.
       Межа між арифметикою і думкою моделі має бути видна в самій
       навігації: решта розділів рахує формули по журналу, цей —
       єдиний, де відповідатиме модель. Поки її немає, мітка каже
       «скоро», а не мовчить. */
    { id: 'AI', label: 'AI', icon: Bot, soon: true, anim: 'an-ic-ai', tone: T.acc },
  ];

  const active = NAV.find((n) => n.id === tab) || NAV[0];
  const activeLabel = active.label;

  /* ---------- рухома пігулка під вкладками ----------
     Позицію не рахуємо з відступів, а міряємо саму кнопку: підписи
     різної довжини, а на вузькому екрані рядок ще й переноситься —
     будь-яка арифметика по індексах тут розійшлася б із реальністю.

     Пігулка їде лише під СПРАВЖНЮ активну вкладку. Раніше вона
     виїжджала наперед ще на ховері («прев'ю» кудою потрапиш) — і це
     мало протилежний ефект: людина бачила ту саму заповнену підкладку
     під невибраним розділом і читала це як «а я вже тут». Ховер тепер
     живе окремо — своєю анімацією іконки, а не запозиченою міткою
     вибраного стану. */
  const barRef = useRef(null);
  const tabRefs = useRef({});
  const [hoverTab, setHoverTab] = useState(null);
  const [hoverNonce, setHoverNonce] = useState(0);
  const [pill, setPill] = useState(null);

  const measurePill = useCallback(() => {
    const el = tabRefs.current[tab];
    const bar = barRef.current;
    if (!el || !bar) return;
    const b = bar.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = { left: r.left - b.left, top: r.top - b.top, width: r.width, height: r.height };
    setPill((prev) => (prev && ['left', 'top', 'width', 'height'].every((k) => prev[k] === next[k]) ? prev : next));
  }, [tab]);

  useLayoutEffect(() => { measurePill(); });

  useEffect(() => {
    /* Шрифти доїжджають після першого кадру й міняють ширину підписів —
       без повторного заміру пігулка лишалась би зсунутою. */
    const t = setTimeout(measurePill, 260);
    window.addEventListener('resize', measurePill);
    return () => { clearTimeout(t); window.removeEventListener('resize', measurePill); };
  }, [measurePill]);

  return (
    <div
      className="min-h-screen antialiased"
      style={{ fontFamily: T.sans, color: T.text, fontFeatureSettings: "'tnum' 1, 'cv05' 1" }}
    >
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: ${T.lineHi}; border-radius: 8px; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .animate-fade-in { animation: fade-in-up 0.35s ease both; }

        /* Підпис активного розділу вʼїжджає збоку на кожному перемиканні */
        @keyframes an-slide-in { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
        /* Відблиск по мітці «скоро» — повільний, щоб не смикав око */
        @keyframes an-sweep { 0% { transform: translateX(-140%); } 55%, 100% { transform: translateX(280%); } }
        /* Ледь помітний дрейф фонової плями за шапкою */
        @keyframes an-drift { 0%, 100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(3%,4%,0) scale(1.1); } }

        /* ---- іконки розділів: кожна оживає по-своєму ----
           Рух пояснює розділ, а не просто привертає увагу: плитки
           огляду складаються, стрілка перформансу злітає, мозок б'ється,
           гаманець розкривається, колба збовтується, історія
           перемотується назад, бот прокидається. */
        @keyframes an-ic-overview { 0% { transform: scale(.62); opacity: .35 } 55% { transform: scale(1.16) } 100% { transform: none; opacity: 1 } }
        @keyframes an-ic-perf     { 0% { transform: translate(-5px,5px); opacity: .3 } 60% { transform: translate(1.5px,-3px) } 100% { transform: none; opacity: 1 } }
        @keyframes an-ic-psy      { 0%, 100% { transform: none } 20% { transform: scale(1.22) } 40% { transform: scale(.93) } 62% { transform: scale(1.12) } 80% { transform: scale(.97) } }
        @keyframes an-ic-assets   { 0% { transform: perspective(420px) rotateY(-96deg); opacity: .3 } 70% { transform: perspective(420px) rotateY(12deg) } 100% { transform: none; opacity: 1 } }
        @keyframes an-ic-sim      { 0%, 100% { transform: rotate(0) } 18% { transform: rotate(-19deg) } 42% { transform: rotate(14deg) } 66% { transform: rotate(-8deg) } 84% { transform: rotate(4deg) } }
        @keyframes an-ic-history  { 0% { transform: rotate(360deg) scale(.72); opacity: .3 } 100% { transform: none; opacity: 1 } }
        @keyframes an-ic-ai       { 0% { transform: translateY(4px) scale(.8); opacity: .25 } 52% { transform: translateY(-3px) scale(1.1) } 76% { transform: translateY(0) scale(.98) } 100% { transform: none; opacity: 1 } }

        @media (prefers-reduced-motion: reduce) {
          .an-anim { animation: none !important; }
        }
      `}</style>

      {/* ---------- ВЕРХНЯ ПАНЕЛЬ ----------
          Шапка — окрема картка, а не смуга на всю ширину: розділи,
          період і дія читаються як один пульт керування.

          Не липка: прокручується разом зі сторінкою. Тому їй не
          потрібне ні згасання фону, ні розмиття під нею — вони
          існували рівно для того, щоб ховати контент, який проїжджав
          повз закріплену картку. */}
      <div className="relative z-30 px-4 pb-3 pt-4 lg:px-8">
        <div className="relative mx-auto w-full max-w-[1800px]">
          {/* Пляма за карткою — повільно дрейфує, щоб шапка не була
              мертвим прямокутником на чорному. */}
          <div
            aria-hidden
            className="an-anim pointer-events-none absolute -top-[220px] left-[-160px] hidden h-[560px] w-[900px] rounded-full lg:block"
            style={{
              background: `radial-gradient(circle, rgba(${T.accRgb},0.14), transparent 64%)`,
              filter: 'blur(44px)',
              animation: 'an-drift 24s ease-in-out infinite',
            }}
          />

          {/* Кант картки — градієнтом по периметру, тому верхній край
              світліший за нижній, як у справжнього скла. */}
          <div
            className="relative rounded-[26px] p-px"
            style={{
              background: `linear-gradient(155deg, ${hair(0.16)}, ${hair(0.05)} 32%, ${hair(0.018)} 68%, ${hair(0.07)})`,
              boxShadow: '0 44px 110px -46px rgba(0,0,0,0.75)',
            }}
          >
            {/* Без overflow-hidden: усередині живе випадашка періоду, і
                картка обрізала б її по своєму краю. Світіння клеїться
                до країв власним шаром нижче, він і обрізаний. */}
            <div
              className="relative rounded-[25px]"
              style={{ background: `linear-gradient(180deg, ${T.surface}, ${T.sunken})` }}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[25px]">
                <span className="absolute inset-x-[8%] top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${hair(0.3)}, transparent)` }} />
                <span
                  className="absolute -top-[190px] left-5 h-[360px] w-[520px] rounded-full"
                  style={{ background: `radial-gradient(circle, rgba(${T.accRgb},0.13), transparent 66%)` }}
                />
                <span
                  className="absolute -right-[70px] -top-[130px] h-[310px] w-[420px] rounded-full"
                  style={{ background: `radial-gradient(circle, ${hair(0.03)}, transparent 62%)` }}
                />
              </div>

              {/* ---------- рядок 1: де я і одна дія ---------- */}
              <div className="relative flex flex-wrap items-end justify-between gap-x-7 gap-y-4 px-5 pb-[18px] pt-5 sm:px-[30px] sm:pb-[22px] sm:pt-[26px]">
                <div className="min-w-0">
                  <div
                    className="mb-[13px] flex items-center gap-[11px] text-[9px] font-medium uppercase"
                    style={{ fontFamily: T.mono, letterSpacing: '0.34em' }}
                  >
                    <span style={{ color: T.acc }}>Дані</span>
                    <span className="h-px w-3.5 shrink-0" style={{ background: hair(0.14) }} />
                    <span key={tab} className="an-anim truncate" style={{ color: T.text2, animation: 'an-slide-in .26s ease' }}>
                      {activeLabel}
                    </span>
                  </div>

                  {/* Назва градієнтом: від тексту до акценту — та сама
                      пара кольорів, що тримає всю шапку. */}
                  <h1
                    className="m-0 text-[30px] font-extrabold leading-[0.96] sm:text-[36px] lg:text-[40px]"
                    style={{
                      fontFamily: T.display,
                      letterSpacing: '-0.045em',
                      backgroundImage: `linear-gradient(98deg, ${T.text} 24%, ${T.text} 52%, ${T.acc} 99%)`,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: T.text,
                    }}
                  >
                    Аналітика
                  </h1>
                </div>

                <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
                  <PeriodDropdown value={period} onChange={setPeriod} counts={periodCounts} />

                  {/* ─────────── «Export Terminal» (стисла версія) ───────────
                      Та сама ідея — кнопка показує, що відбувається за
                      кліком, — але вкладена в час, який людина реально
                      тримає курсор на кнопці: до секунди. Темне ядро
                      розкривається, встигає майнути одна фраза «пакую», і
                      одразу штамп готового Net R зі стрілкою — тим самим
                      жестом, що відкриє саму модалку. Один прохід на весь
                      ховер, без циклу. */}
                  <button
                    onClick={() => setExportOpen(true)}
                    className="receipt-cta group relative inline-flex h-[42px] shrink-0 items-center gap-2 overflow-hidden rounded-[13px] pl-4 pr-[18px]"
                    style={{
                      background: `linear-gradient(180deg, ${T.acc}, color-mix(in srgb, ${T.acc} 76%, #000))`,
                      border: `1px solid ${hair(0.14)}`,
                      color: 'var(--edge-on-acc, #fff)',
                      fontFamily: T.sans,
                      boxShadow: `inset 0 1px 0 ${hair(0.2)}, 0 12px 28px -14px rgba(${T.accRgb},0.9)`,
                    }}
                  >
                    {/* дефолтний напис — тане, звільняючи місце ядру */}
                    <span className="receipt-cta-default relative z-10 flex w-full items-center justify-center gap-2">
                      <Sparkles size={15} strokeWidth={1.8} className="transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
                      <span className="whitespace-nowrap text-[12.5px] font-bold" style={{ letterSpacing: '-0.012em' }}>Поділитись статистикою</span>
                    </span>

                    {/* темне ядро — картка експорту, що розгортається з центру */}
                    <span aria-hidden className="receipt-cta-core absolute inset-[2px] z-[5] rounded-[11px]">
                      <span className="receipt-cta-step receipt-cta-step-1">
                        <b>[EXPORT]</b> Пакую картку…
                      </span>
                      <span className="receipt-cta-final">
                        <b className={`receipt-cta-final-badge tone-${netMetric.tone}`}>{netMetric.value}</b>
                        <span className="receipt-cta-final-label">Картка готова</span>
                        <span className="receipt-cta-arrow-wrap">
                          <span aria-hidden className="receipt-cta-arrow-ring" />
                          <span className="receipt-cta-arrow"><ArrowRight size={13} strokeWidth={2.6} color="#0c0b10" /></span>
                        </span>
                      </span>
                    </span>

                    {/* світловий блік наприкінці */}
                    <span aria-hidden className="receipt-cta-glimmer" />
                  </button>
                </div>
              </div>

              {/* ---------- рядок 2: розділи ---------- */}
              <div
                className="relative flex flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-3.5 sm:px-6"
                style={{ borderTop: `1px solid ${hair(0.055)}` }}
              >
                <div
                  ref={barRef}
                  className="relative flex flex-wrap items-center gap-0.5 rounded-[15px] p-1"
                  style={{ background: hair(0.022), border: `1px solid ${hair(0.055)}` }}
                >
                  {/* Пігулка їде під активну вкладку — один елемент на
                      всю панель, тому перехід читається як рух, а не як
                      згасання однієї підкладки й поява іншої. */}
                  {pill && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-0 z-0 rounded-[11px]"
                      style={{
                        width: pill.width,
                        height: pill.height,
                        transform: `translate3d(${pill.left}px, ${pill.top}px, 0)`,
                        background: `linear-gradient(180deg, ${hair(0.1)}, ${hair(0.045)})`,
                        boxShadow: `inset 0 1px 0 ${hair(0.14)}, 0 0 0 1px ${active.tone}2e`,
                        transition: 'transform .38s cubic-bezier(.22,.9,.24,1), width .38s cubic-bezier(.22,.9,.24,1), height .2s ease, background .22s, box-shadow .22s',
                      }}
                    />
                  )}

                  {NAV.map(({ id, label, icon: Icon, badge, soon, anim, tone }) => {
                    const on = tab === id;
                    const hovering = !on && hoverTab === id;
                    return (
                      <button
                        key={id}
                        ref={(el) => { if (el) tabRefs.current[id] = el; }}
                        data-tour={`analytics-tab-${id}`}
                        onClick={() => setTab(id)}
                        onMouseEnter={() => { setHoverTab(id); setHoverNonce((n) => n + 1); }}
                        onMouseLeave={() => setHoverTab(null)}
                        className="relative z-[1] inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-[11px] px-3.5 text-[12.5px]"
                        style={{
                          fontFamily: T.sans,
                          fontWeight: on ? 700 : 500,
                          letterSpacing: '-0.012em',
                          color: on ? T.text : hovering ? T.text2 : T.text3,
                          transition: 'color .18s',
                        }}
                      >
                        {/* key міняється щоразу, коли вкладка стає
                            активною, і щоразу на новий заход курсора —
                            саме тому в іконки є своя маленька анімація
                            не лише при виборі розділу, а й на ховері:
                            це і є жива реакція замість запозиченої
                            підкладки вибраного стану, яка раніше
                            виїжджала наперед і виглядала як «уже тут». */}
                        <span
                          key={on ? `on-${tab}` : hovering ? `hv-${id}-${hoverNonce}` : 'off'}
                          className="an-anim inline-flex shrink-0"
                          style={{
                            color: tone,
                            opacity: on ? 1 : hovering ? 0.95 : 0.6,
                            filter: on ? `drop-shadow(0 0 7px ${tone}66)` : hovering ? `drop-shadow(0 0 5px ${tone}44)` : 'none',
                            transition: 'opacity .18s, filter .18s',
                            animation: on
                              ? `${anim} .62s cubic-bezier(.22,1,.36,1)`
                              : hovering ? `${anim} .52s cubic-bezier(.22,1,.36,1)` : undefined,
                          }}
                        >
                          <Icon size={14} strokeWidth={1.9} />
                        </span>
                        {label}

                        {/* Ціна тільта поруч із «Психологією»: не окрема
                            кнопка, а мітка на вкладці — число живе там,
                            куди по нього йдуть. */}
                        {badge && (
                          <em
                            className="inline-flex h-[17px] items-center rounded-[5px] px-1.5 text-[9px] font-semibold not-italic tabular-nums"
                            style={{
                              fontFamily: T.mono,
                              letterSpacing: '0.1em',
                              color: T.bad,
                              background: `rgba(${T.badRgb},0.11)`,
                              opacity: on ? 1 : 0.92,
                              transition: 'opacity .22s',
                            }}
                          >
                            {badge}
                          </em>
                        )}

                        {/* «Скоро» з відблиском: розділ уже в навігації,
                            але ще не працює, і мітка має це показувати
                            сама, без пояснень. */}
                        {soon && (
                          <em
                            className="relative inline-flex h-[17px] items-center overflow-hidden rounded-[5px] px-1.5 text-[9px] font-semibold uppercase not-italic"
                            style={{
                              fontFamily: T.mono,
                              letterSpacing: '0.1em',
                              color: T.acc,
                              background: `rgba(${T.accRgb},0.13)`,
                              boxShadow: `inset 0 0 0 1px rgba(${T.accRgb},0.22)`,
                            }}
                          >
                            скоро
                            <span
                              aria-hidden
                              className="an-anim pointer-events-none absolute inset-y-0 left-0 w-1/2"
                              style={{
                                background: `linear-gradient(90deg, transparent, ${hair(0.38)}, transparent)`,
                                animation: 'an-sweep 3.6s ease-in-out infinite',
                              }}
                            />
                          </em>
                        )}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- КОНТЕНТ ----------
          Розділ AI навмисно без межі 1800px: він один суцільний екран
          із власним тлом на всю ширину, а не колонка карток, тому на
          великому моніторі (24"+) той самий 1800 виглядав як острівець
          посеред порожнечі. Іншим вкладкам межа лишається — там колонки
          карток, які на надширокому екрані просто розтягувались б. */}
      <main
        className={`animate-fade-in w-full px-4 pb-16 pt-6 lg:px-8 ${tab === 'AI' ? '' : 'mx-auto max-w-[1800px]'}`}
        key={tab}
      >
        {/* Розділ AI живе поза перевіркою на порожній журнал: там поки
            нічого не рахується, тож «спочатку запиши угоду» було б
            неправдою. Заглушка має відкриватись завжди. */}
        {tab === 'AI' ? (
          <AiLab s={s} />
        ) : (
        <>
        {/* Три стани замість одного. Порожній журнал — не помилка, а
            нормальний перший день, і сказати про це треба інакше, ніж
            про мережевий збій. */}
        {loading && (
          <div
            className="flex items-center justify-center gap-2.5 rounded-2xl px-5 py-24"
            style={{ border: `1px dashed ${T.line}` }}
          >
            <Loader2 size={16} className="animate-spin" style={{ color: T.text4 }} />
            <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Рахуємо по твоїх угодах
            </span>
          </div>
        )}

        {!loading && empty && (
          <div
            className="flex flex-col items-center rounded-2xl px-5 py-24 text-center"
            style={{ border: `1px dashed ${T.line}` }}
          >
            <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
              {failed ? 'Не вдалось дістати угоди' : 'Рахувати поки нема чого'}
            </div>
            <p
              className="mb-6 max-w-[440px] text-[14px]"
              style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}
            >
              {failed
                ? 'Спробуй оновити сторінку. Якщо повториться — це вже на нашому боці.'
                : 'Аналітика читає твій журнал угод. Приблизно з двадцятої угоди вона починає казати щось, чого ти про себе не знав — до того вибірка замала, щоб їй вірити.'}
            </p>
            {!failed && (
              <Link
                to={withSandbox('/journal')}
                className="flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold"
                style={{ fontFamily: T.sans, background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)' }}
              >
                <BookOpen size={15} strokeWidth={2.6} /> Записати угоду
              </Link>
            )}
          </div>
        )}

        {!loading && !empty && (
        <>
        <header className="mb-[22px] flex items-start justify-between gap-5">
          <div>
            <div
              className="inline-flex items-center gap-[6px] text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ color: T.acc }}
            >
              {last
                ? new Date(last.date).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })
                : 'За обраний період угод немає'}
            </div>
            <p
              className="mt-2.5 max-w-[62ch] text-[19px] font-medium leading-[1.45] lg:text-[22px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}
            >
              {/* Фраза будується з того, що справді є. Раніше вона
                  впевнено називала «найкращий день» навіть коли угод
                  було три — і виглядала як вигадка. */}
              Ти <Delta v={s.net} /> за {s.trades.length} угод.
              {s.trades.length >= 10 && bestDay && (
                <>
                  {' '}{bestDay.day} — твій найкращий день
                  {[...s.emotionStats].some((e) => e.trades) && (
                    <>, а {EMOTION_LABEL[[...s.emotionStats].sort((a, b) => b.avg - a.avg)[0].emotion].toLowerCase()} — твій найкращий стан</>
                  )}.
                </>
              )}
              {s.trades.length < 10 && ' Ще замало, щоб шукати закономірності — веди журнал далі.'}
            </p>
          </div>
          {/* Жовтий ярлик «дисципліна просідає» прибрано свідомо.

              Він висів у кутку постійно, кричав кольором тривоги й не
              вів нікуди: подивитись на нього можна, зробити з ним —
              нічого. Те саме число живе у віджеті «Дисципліна» на
              дошці, де поруч видно, скільки саме коштували порушення,
              і звідти вже зрозуміло, що робити. */}
        </header>

        {/* Огляд отримує ще й сирі угоди: кожен віджет на дошці може
            мати власний період, і рахувати його треба не з уже
            обрізаної статистики, а з повного журналу. */}
        {tab === 'Overview' && <Overview s={s} rows={rows || []} />}
        {tab === 'Performance' && <Performance s={s} rows={rows || []} />}
        {tab === 'Psychology' && <Psychology s={s} rows={rows || []} reviews={reviews} />}
        {tab === 'Assets' && <Assets s={s} />}
        {/* Симулятор працює з угодами, а не з готовою статистикою:
            перший крок перераховує криву під кожен набір правил,
            другий рахує тисячу продовжень. Обидва хочуть сирі угоди,
            причому різні: крок 1 — розмічені емоціями й помилками
            (s.trades), крок 2 — увесь журнал за період (rows). */}
        {tab === 'Simulator' && <Simulator trades={s.trades} rows={rows || []} />}
        {tab === 'History' && <History s={s} />}
        </>
        )}
        </>
        )}
      </main>

      <ExportStats
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        stats={s}
        period={period}
      />
    </div>
  );
}
