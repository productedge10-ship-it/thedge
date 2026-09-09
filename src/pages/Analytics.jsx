import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, TrendingUp, BrainCircuit, Wallet, History as HistoryIcon, FlaskConical, Sparkles, Loader2, BookOpen, Bot } from 'lucide-react';
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
      `}</style>

      {/* ---------- ВЕРХНЯ ПАНЕЛЬ ----------
          Та сама шапка, що на публічних сторінках: напівпрозоре скло
          поверх крапкового тла. Раніше вона була суцільною синьою
          плитою і виглядала як шматок іншого застосунку. */}
      <div
        className="sticky top-0 z-30"
        style={{
          background: 'rgba(10,10,12,0.82)',
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
              className="shrink-0 text-[24px] font-bold leading-none lg:text-[26px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
            >
              Аналітика
            </h1>

            <button
              onClick={() => setExportOpen(true)}
              className="group ml-auto flex shrink-0 items-center justify-center gap-2 rounded-[11px] px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-200"
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
              Поділитись статистикою
            </button>
          </div>

          {/* ---------- рядок 2: що дивлюсь ----------

              Розділ і період стоять поруч, бо це одне рішення з двох
              половин: який зріз журналу зараз на екрані. Обидва перемикачі
              з ковзним індикатором на layoutId: підкреслення й пігулка
              переїжджають, а не перемальовуються, і рух показує, що це
              один набір, а не окремі кнопки. */}
          <div className="mt-3.5 flex items-end justify-between gap-6">
            <nav className="hide-scrollbar -mb-px flex items-center gap-0.5 overflow-x-auto">
              {NAV.map(({ id, label, icon: Icon, badge, soon }) => {
                const on = tab === id;
                return (
                  <button
                    key={id}
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

                    {soon && (
                      <em
                        className="not-italic rounded-[20px] px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-[0.12em]"
                        style={{ background: `rgba(${T.accRgb},0.12)`, color: T.acc }}
                      >
                        скоро
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

            {/* Період. Рамки навколо групи більше немає, лишилась
                заглиблена підкладка: коробка в коробці читалась як два
                різні елементи керування. */}
            <div
              className="mb-2.5 hidden shrink-0 items-center rounded-[11px] p-1 lg:flex"
              style={{ background: T.sunken }}
            >
              {PERIODS.map((p) => {
                const on = period === p;
                return (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className="relative whitespace-nowrap rounded-[8px] px-3 py-1.5 text-[12.5px] transition-colors duration-150"
                    style={{ color: on ? T.text : T.text3, fontWeight: on ? 600 : 450 }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                  >
                    {on && (
                      <motion.span
                        layoutId="an-period"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-[8px]"
                        style={{
                          background: T.surfaceHi,
                          border: `1px solid ${T.lineAcc}`,
                          boxShadow: `0 4px 14px -8px rgba(${T.accRgb},0.9)`,
                        }}
                      />
                    )}
                    <span className="relative">{p}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Період на вузькому екрані: окремим рядком під вкладками,
              бо поруч із ними він там не поміщається. */}
          <div className="hide-scrollbar -mt-px flex items-center gap-1 overflow-x-auto pb-2.5 lg:hidden">
            {PERIODS.map((p) => {
              const on = period === p;
              return (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className="shrink-0 whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[12.5px] transition-colors duration-150"
                  style={{
                    background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                    border: `1px solid ${on ? T.lineAcc : 'transparent'}`,
                    color: on ? T.text : T.text3,
                    fontWeight: on ? 600 : 450,
                  }}
                >
                  {p}
                </button>
              );
            })}
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
