import { useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, TrendingUp, BrainCircuit, Wallet, History as HistoryIcon, FlaskConical, ShieldAlert, Sparkles, Loader2, BookOpen } from 'lucide-react';
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
import WhatIf from '../components/analytics/WhatIf';
import Risk from '../components/analytics/Risk';
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
    { id: 'WhatIf', label: 'Що якби', icon: FlaskConical },
    { id: 'Risk', label: 'Ризик', icon: ShieldAlert },
    { id: 'History', label: 'Історія угод', icon: HistoryIcon },
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

          {/* назва · акаунти · період · експорт */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1
              className="text-[24px] font-bold leading-none lg:text-[27px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
            >
              Аналітика
            </h1>

            {/* акаунти */}
            <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto">
              {s.byAccount.map((a) => (
                <div
                  key={a.key}
                  className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                  style={{ background: T.surface, border: `1px solid ${T.line}` }}
                >
                  <span style={{ color: T.text3 }}>{a.key}</span>
                  <Delta v={a.net} />
                </div>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* період */}
              <div
                className="flex items-center gap-1 rounded-[10px] p-1"
                style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              >
                {PERIODS.map((p) => {
                  const on = period === p;
                  return (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors duration-150"
                      style={{
                        background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                        border: `1px solid ${on ? T.lineAcc : 'transparent'}`,
                        color: on ? T.text : T.text3,
                        fontWeight: on ? 600 : 400,
                      }}
                      onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text; }}
                      onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              {/* Експорт — не «вивантажити CSV», а зібрати постер,
                  яким не соромно поділитись */}
              <button
                onClick={() => setExportOpen(true)}
                className="group flex shrink-0 items-center justify-center gap-2 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-200"
                style={{
                  background: `rgba(${T.accRgb},0.10)`,
                  border: `1px solid ${T.lineAcc}`,
                  color: T.acc,
                  fontFamily: T.sans,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${T.accRgb},0.16)`)}
                onMouseLeave={(e) => (e.currentTarget.style.background = `rgba(${T.accRgb},0.10)`)}
              >
                <Sparkles size={14} strokeWidth={2.3} className="transition-transform duration-300 group-hover:scale-110" />
                Поділитись статистикою
              </button>
            </div>
          </div>

          {/* розділи */}
          <nav className="hide-scrollbar -mb-px flex items-center gap-1 overflow-x-auto">
            {NAV.map(({ id, label, icon: Icon, badge }) => {
              const on = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className="relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 pb-3 pt-1 text-[13.5px] transition-colors duration-150"
                  style={{ color: on ? T.text : T.text3 }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                >
                  <Icon size={15} strokeWidth={2} style={{ color: on ? T.acc : 'currentColor' }} /> {label}
                  {badge && (
                    <em
                      className="not-italic rounded-[20px] px-[7px] py-[2px] text-[10px] font-bold"
                      style={{ background: `rgba(${T.badRgb},0.12)`, color: T.bad }}
                    >
                      {badge}
                    </em>
                  )}
                  {/* активний розділ підкреслений — рядок читається як вкладки */}
                  <span
                    className="absolute inset-x-2 bottom-0 h-[2px] rounded-full transition-all duration-200"
                    style={{
                      background: on ? T.acc : 'transparent',
                      boxShadow: on ? `0 0 12px rgba(${T.accRgb},0.6)` : 'none',
                    }}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ---------- КОНТЕНТ ---------- */}
      <main className="animate-fade-in mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 lg:px-8" key={tab}>
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
              <span style={{ color: T.text4 }}>· усі акаунти · {period}</span>
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
          <span
            className="whitespace-nowrap rounded-[20px] px-[13px] py-[7px] text-[11px] font-bold uppercase tracking-[0.08em]"
            style={s.adherence >= 70
              ? { background: `rgba(${T.okRgb},0.10)`, border: `1px solid rgba(${T.okRgb},0.22)`, color: T.ok }
              : { background: `rgba(${T.warnRgb},0.10)`, border: `1px solid rgba(${T.warnRgb},0.22)`, color: T.warn }}
          >
            {s.adherence >= 70 ? 'По плану' : 'Дисципліна просідає'}
          </span>
        </header>

        {tab === 'Overview' && <Overview s={s} />}
        {tab === 'Performance' && <Performance s={s} />}
        {tab === 'Psychology' && <Psychology s={s} />}
        {tab === 'Assets' && <Assets s={s} />}
        {/* Симулятор працює з угодами, а не з готовою статистикою:
            він сам перераховує криву під кожен набір правил. */}
        {tab === 'WhatIf' && <WhatIf trades={s.trades} />}
        {/* Ризик рахується з усього журналу, а не з періоду: місяць
            угод — це не розподіл, з якого можна щось симулювати. */}
        {tab === 'Risk' && <Risk trades={rows || []} />}
        {tab === 'History' && <History s={s} />}
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
