import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, TrendingUp, BrainCircuit, Wallet, History as HistoryIcon, FlaskConical, Sparkles, Loader2, BookOpen, Bot, ChevronDown, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { T } from '../lib/theme';
import { useAuth } from '../context/AuthContext';
import { fetchTrades, periodStart } from '../lib/analyticsStore';
import { useStats, r1 } from '../components/analytics/data';
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

/* ==================================================================
   Аналітика.
   Навігація живе зверху: розділи, період і акаунти — один рядок
   керування, і вся ширина екрана лишається графікам, а не панелі.
================================================================== */

const PERIODS = ['Весь час', 'Цей квартал', 'Останні 30 днів', 'Цей тиждень'];

/* ------------------------------------------------------------------
   Період — випадашка.

   Сегментований перемикач на чотири варіанти був завеликий: на
   ноутбуці тиснув вкладки, на телефоні розсипався сіткою. Випадашка
   займає рівно один рядок тексту, а вибір ховає під клік. */
function PeriodMenu({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative order-3 w-full lg:order-2 lg:ml-auto lg:w-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-semibold transition-colors duration-150 lg:w-auto"
        style={{
          background: T.sunken,
          border: `1px solid ${open ? T.lineAcc : T.line}`,
          color: T.text,
          fontFamily: T.sans,
        }}
      >
        <span>{value}</span>
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          style={{ color: T.text3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 z-50 mt-2 rounded-[12px] p-1 lg:left-auto lg:right-0 lg:min-w-[196px]"
            style={{
              background: 'var(--edge-panel, rgba(10,10,12,0.96))',
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 24px 60px -20px var(--edge-panel-glow, rgba(0,0,0,0.7))',
              backdropFilter: 'blur(18px)',
            }}
          >
            {options.map((p) => {
              const on = p === value;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { onChange(p); setOpen(false); }}
                  className="flex w-full items-center justify-between rounded-[8px] px-3 py-2 text-left text-[12.5px] transition-colors duration-150"
                  style={{
                    background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                    color: on ? T.acc : T.text2,
                    fontWeight: on ? 600 : 450,
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(var(--edge-text-rgb),0.05)'; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
                >
                  {p}
                  {on && <Check size={13} strokeWidth={2.6} />}
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
  const [failed, setFailed] = useState(false);

  /* Тягнемо весь журнал один раз, а період ріжемо на клієнті: вибірка
     невелика, а ходити в базу на кожне перемикання «тиждень / місяць»
     означало б затримку там, де її можна не мати. */
  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

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

  const s = useStats(scoped || []);

  const loading = rows === null;
  const empty = !loading && rows.length === 0;

  const last = s.trades[s.trades.length - 1];
  const bestDay = [...s.byDow].sort((a, b) => b.avg - a.avg)[0];

  const NAV = [
    { id: 'Overview', label: 'Огляд', icon: LayoutDashboard },
    { id: 'Performance', label: 'Перформанс', icon: TrendingUp },
    { id: 'Psychology', label: 'Психологія', icon: BrainCircuit, badge: `${r1(s.tiltCost)}R` },
    { id: 'Assets', label: 'Активи', icon: Wallet },
    /* «Що якби» і «Ризик» були двома вкладками поруч, хоча це один
       ланцюжок: спершу рахуємо, скільки звички коштували на історії,
       що вже є, потім проганяємо те, що лишилось, уперед. Тепер це
       один розділ із двома кроками й передачею цифр між ними. */
    { id: 'Simulator', label: 'Симулятор', icon: FlaskConical },
    { id: 'History', label: 'Історія угод', icon: HistoryIcon },
    /* AI останнім і з власною міткою.
       Межа між арифметикою і думкою моделі має бути видна в самій
       навігації: решта розділів рахує формули по журналу, цей —
       єдиний, де відповідатиме модель. Поки її немає, мітка каже
       «скоро», а не мовчить. */
    { id: 'AI', label: 'AI', icon: Bot, soon: true },
  ];

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
        @keyframes ai-soon-sweep { 0% { transform: translateX(-120%); } 60%, 100% { transform: translateX(220%); } }
      `}</style>

      {/* ---------- ВЕРХНЯ ПАНЕЛЬ ----------
          Та сама шапка, що на публічних сторінках: напівпрозоре скло
          поверх крапкового тла. Раніше вона була суцільною синьою
          плитою і виглядала як шматок іншого застосунку. */}
      <div
        className="sticky top-0 z-30"
        style={{
          background: 'var(--edge-panel, rgba(10,10,12,0.82))',
          backdropFilter: 'blur(18px)',
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div className="mx-auto w-full max-w-[1800px] px-4 pt-4 lg:px-8">

          {/* ---------- рядок 1: хто я і одна дія ----------

              Раніше тут стояло все одразу: назва, акаунти, чотири
              кнопки періоду й експорт. Виходив рівний за вагою рядок,
              у якому нічого не головне. Тепер верхній рядок відповідає
              на «де я і чий це рахунок», а нижній — на «що саме
              дивлюсь». Два питання, два рядки. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <h1
              className="order-1 shrink-0 text-[24px] font-bold leading-none lg:text-[26px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
            >
              Аналітика
            </h1>

            <PeriodMenu value={period} onChange={setPeriod} options={PERIODS} />

            <button
              onClick={() => setExportOpen(true)}
              className="group order-2 ml-auto flex shrink-0 items-center justify-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-200 lg:order-3 lg:ml-0"
              style={{
                background: `rgba(${T.accRgb},0.10)`,
                border: `1px solid ${T.lineAcc}`,
                color: T.acc,
                fontFamily: T.sans,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = `rgba(${T.accRgb},0.16)`;
                e.currentTarget.style.boxShadow = `0 8px 24px -12px rgba(${T.accRgb},0.9)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`;
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <Sparkles size={14} strokeWidth={2.3} className="transition-transform duration-300 group-hover:scale-110" />
              <span className="hidden sm:inline">Поділитись статистикою</span>
              <span className="sm:hidden">Поділитись</span>
            </button>
          </div>

          {/* ---------- рядок 2: розділи ----------

              Вкладки на всю ширину рядка. Раніше поруч стояв період і на
              ноутбуці з'їдав місце — останні розділи ховались за краєм
              без натяку на прокрутку. Тепер рядок гортається
              горизонтально, а край гасне градієнтом: видно, що є ще. */}
          <div
            className="hide-scrollbar mt-3.5 overflow-x-auto"
            style={{
              WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 26px), transparent)',
              maskImage: 'linear-gradient(90deg, #000 calc(100% - 26px), transparent)',
            }}
          >
            <nav className="-mb-px flex items-center gap-0.5">
              {NAV.map(({ id, label, icon: Icon, badge, soon }) => {
                const on = tab === id;
                return (
                  <button
                    key={id}
                    data-tour={`analytics-tab-${id}`}
                    onClick={() => setTab(id)}
                    className="relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-[10px] px-3.5 pb-3 pt-2 text-[13.5px] transition-colors duration-150"
                    style={{ color: on ? T.text : T.text3, fontWeight: on ? 600 : 450 }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                  >
                    <Icon size={15} strokeWidth={2} style={{ color: on ? T.acc : 'currentColor' }} />
                    {label}

                    {/* Ціна тільта поруч із «Психологією». Була червона
                        пігулка з підкладкою — на спокійній шапці вона
                        кричала гучніше за все інше. Лишилось саме
                        число, моноширинним. */}
                    {badge && (
                      <em
                        className="not-italic text-[11px] font-bold tabular-nums"
                        style={{ fontFamily: T.mono, color: T.bad, opacity: on ? 1 : 0.65 }}
                      >
                        {badge}
                      </em>
                    )}

                    {/* «Скоро» — під стиль хедера самого розділу AI:
                        м'ятна пігулка з тонкою рамкою й відблиском, що
                        пробігає раз на кілька секунд. */}
                    {soon && (
                      <em
                        className="relative inline-flex items-center overflow-hidden rounded-full px-[9px] py-[3px] text-[9px] not-italic uppercase"
                        style={{
                          fontFamily: T.mono, letterSpacing: '0.2em', color: '#2ee6a8',
                          border: '1px solid rgba(46,230,168,0.32)', background: 'rgba(46,230,168,0.08)',
                        }}
                      >
                        скоро
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 w-2/5"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
                            animation: 'ai-soon-sweep 3.4s ease-in-out infinite',
                          }}
                        />
                      </em>
                    )}

                    {on && (
                      <motion.span
                        layoutId="an-tab"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                        style={{ background: T.acc, boxShadow: `0 0 12px rgba(${T.accRgb},0.7)` }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* ---------- КОНТЕНТ ---------- */}
      <main className="animate-fade-in mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 lg:px-8" key={tab}>
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
                to="/journal"
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
        {tab === 'Psychology' && <Psychology s={s} rows={rows || []} />}
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
