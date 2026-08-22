import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2, Lock, ArrowRight, FlaskConical, Target, X,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  computeStats, fmtPF, fmtR, money, rText, sessionOf, qualityOf, pairOf,
} from '../lib/backtestStats';
import { loadPublicBacktest } from '../lib/backtestShare';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';
import { EquityPanel, SessionPanel, WeekdayPanel, StreakPanel } from '../components/backtest/BacktestCharts';

/* ==================================================================
   Публічний бектест.
   Показуємо те, заради чого прогін і робиться: чи є перевага, звідки
   вона береться і чого вона коштує в просадці. Угоди — списком нижче,
   без можливості щось змінити.
================================================================== */

const qColor = (q) => ({ 'A+': T.ok, A: T.acc, B: T.warn, C: T.bad }[q] || T.text3);
const resColor = (r) => ({ WIN: T.ok, LOSS: T.bad, BE: T.text3 }[r] || T.text3);

function Kpi({ label, value, tone, hint }) {
  return (
    <div
      className="min-w-0 rounded-2xl px-4 py-3.5"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <div
        className="mb-1.5 truncate text-[11.5px] font-bold uppercase tracking-[0.12em]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        {label}
      </div>
      <div className="text-[21px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: tone || T.text }}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function SharedBacktest() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await loadPublicBacktest(id);
        if (!alive) return;
        if (!res) setError('closed');
        else setData(res);
      } catch {
        if (alive) setError('missing');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(null);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [zoom]);

  const stats = useMemo(
    () => computeStats(data?.trades || [], data?.session?.initial_balance || 10000),
    [data],
  );

  /* ---------- Верхня смуга ---------- */
  const TopBar = () => (
    <div
      className="sticky top-0 z-40"
      style={{
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(18px)',
        borderBottom: `1px solid ${T.line}`,
      }}
    >
      <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3 sm:px-6">
        <Link to={user ? '/app' : '/auth'} className="flex items-center gap-2.5">
          <EdgeMonogram />
          <span className="hidden sm:block"><EdgeWordmark /></span>
        </Link>

        <span
          className="ml-1 hidden rounded-lg px-2.5 py-1 text-[12px] font-semibold sm:block"
          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text4, fontFamily: T.sans }}
        >
          бектест
        </span>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <button
              onClick={() => navigate('/backtest')}
              className="group flex h-9 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.line; }}
            >
              Мої бектести
              <ArrowRight size={14} strokeWidth={2.4} className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/auth')}
                className="h-9 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors duration-200"
                style={{ color: T.text3, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                Вхід
              </button>
              <button
                onClick={() => navigate('/auth')}
                className="h-9 rounded-xl px-4 text-[13.5px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0"
                style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                Реєстрація
              </button>
            </>
          )}
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
          <div className="mx-auto flex w-full max-w-[520px] flex-col items-center px-4 py-24 text-center">
            <div
              className="mb-5 grid h-14 w-14 place-items-center rounded-2xl"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <Lock size={20} strokeWidth={1.9} style={{ color: T.text4 }} />
            </div>
            <h1 className="mb-2 text-[24px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
              {error === 'closed' ? 'Бектест закритий' : 'Бектесту не існує'}
            </h1>
            <p className="text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
              {error === 'closed'
                ? 'Автор ще не відкрив доступ до цього прогону або вже його закрив.'
                : 'Схоже, посилання застаріло або бектест видалили.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { session, trades } = data;
  const up = stats.netR >= 0;

  return (
    <div className="relative min-h-screen" style={{ background: T.bg }}>
      <PlanBackdrop />

      <div className="relative z-10">
        <TopBar />

        <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
          {/* ─────────── Шапка ─────────── */}
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="mb-8"
          >
            <div className="mb-2.5 flex items-center gap-2">
              <FlaskConical size={13} strokeWidth={2.3} style={{ color: T.acc }} />
              <span
                className="text-[12px] font-bold uppercase tracking-[0.22em]"
                style={{ fontFamily: T.sans, color: T.acc }}
              >
                Бектест
              </span>
            </div>

            <h1
              className="mb-4 text-[30px] font-bold leading-[1.1] sm:text-[40px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em', overflowWrap: 'anywhere' }}
            >
              {session.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {[
                session.pair,
                session.strategy_name,
                `Старт $${Number(session.initial_balance).toLocaleString('uk-UA')}`,
                'Ризик 1%',
                `${stats.total} угод`,
              ].filter(Boolean).map((chip) => (
                <span
                  key={chip}
                  className="rounded-lg px-2.5 py-1 text-[13px] font-semibold"
                  style={{ fontFamily: T.sans, color: T.text2, background: T.surface, border: `1px solid ${T.line}` }}
                >
                  {chip}
                </span>
              ))}
            </div>

            {session.summary && (
              <p
                className="mt-5 max-w-[720px] whitespace-pre-wrap text-[15px]"
                style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.75 }}
              >
                {session.summary}
              </p>
            )}
          </motion.header>

          {/* ─────────── KPI ─────────── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
            className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6"
          >
            <Kpi label="Net R" value={fmtR(stats.netR)} tone={up ? T.ok : T.bad} hint={money(stats.netMoney)} />
            <Kpi label="Winrate" value={`${stats.winrate.toFixed(0)}%`} hint={`${stats.wins}W / ${stats.losses}L`} />
            <Kpi label="Profit factor" value={fmtPF(stats.profitFactor)} tone={stats.profitFactor >= 1.5 ? T.ok : stats.profitFactor >= 1 ? T.warn : T.bad} />
            <Kpi label="Очікування" value={fmtR(stats.expectancy)} tone={stats.expectancy >= 0 ? T.ok : T.bad} hint="на угоду" />
            <Kpi label="Макс. просадка" value={`−${stats.maxDrawdownR.toFixed(2)}R`} tone={T.warn} />
            <Kpi label="Угод" value={stats.total} hint={`${stats.be} BE`} />
          </motion.div>

          {/* ─────────── Графіки ─────────── */}
          <div className="mb-5">
            <EquityPanel stats={stats} />
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <SessionPanel stats={stats} />
            <WeekdayPanel stats={stats} />
            <StreakPanel stats={stats} />
          </div>

          {/* ─────────── Угоди ─────────── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
            className="overflow-hidden rounded-2xl"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <div
              className="flex items-center gap-2.5 px-5 py-4"
              style={{ borderBottom: `1px solid ${T.line}` }}
            >
              <Target size={14} strokeWidth={2.3} style={{ color: T.acc }} />
              <span className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Усі угоди
              </span>
              <span className="ml-auto text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                {trades.length}
              </span>
            </div>

            <div className="divide-y" style={{ borderColor: T.line }}>
              {trades.map((t) => {
                const q = qualityOf(t);
                return (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 lg:px-5"
                    style={{ borderTop: `1px solid ${T.line}` }}
                  >
                    <span className="w-[86px] shrink-0 text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                      {t.date}
                    </span>

                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-[12.5px] font-bold"
                      style={{
                        fontFamily: T.sans,
                        color: t.type === 'SHORT' ? T.info : T.ok,
                        background: t.type === 'SHORT' ? `rgba(${T.infoRgb},0.10)` : `rgba(${T.okRgb},0.10)`,
                      }}
                    >
                      {t.type}
                    </span>

                    <span className="shrink-0 text-[13px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                      {pairOf(t, session.pair)}
                    </span>

                    <span className="hidden shrink-0 text-[13px] lg:block" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {sessionOf(t)}
                    </span>

                    {q && (
                      <span
                        className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-bold"
                        style={{ fontFamily: T.sans, color: qColor(q), background: `${qColor(q)}14` }}
                      >
                        {q}
                      </span>
                    )}

                    <span
                      className="ml-auto shrink-0 text-[13.5px] font-bold tabular-nums"
                      style={{ fontFamily: T.mono, color: resColor(t.result) }}
                    >
                      {rText(t)}
                    </span>

                    {t.screenshot_url && (
                      <button
                        onClick={() => setZoom(t.screenshot_url)}
                        className="shrink-0 text-[12.5px] font-semibold"
                        style={{ fontFamily: T.sans, color: T.acc }}
                      >
                        графік
                      </button>
                    )}

                    {t.notes && (
                      <p
                        className="order-last w-full min-w-0 text-[13px]"
                        style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}
                      >
                        {t.notes}
                      </p>
                    )}
                  </div>
                );
              })}

              {trades.length === 0 && (
                <p className="px-5 py-10 text-center text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  У цьому прогоні ще немає угод.
                </p>
              )}
            </div>
          </motion.section>

          {/* ─────────── Тиха реклама ─────────── */}
          {!user && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              className="mt-14 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-7"
              style={{
                background: `linear-gradient(120deg, rgba(${T.accRgb},0.06), ${T.surface} 60%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                <FlaskConical size={18} strokeWidth={2} style={{ color: T.acc }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[16px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                  Перевір свою стратегію на історії
                </p>
                <p className="mt-1 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                  Edge Journal рахує profit factor, очікування й просадку сам —
                  ти лише записуєш угоди в один рядок.
                </p>
              </div>
              <button
                onClick={() => navigate('/auth')}
                className="group flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0"
                style={{ background: T.text, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
              >
                Спробувати
                <ArrowRight size={15} strokeWidth={2.8} className="transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* ─────────── Лайтбокс ─────────── */}
      <AnimatePresence>
        {zoom && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setZoom(null)}
            className="fixed inset-0 z-[400] flex cursor-zoom-out items-center justify-center p-4 sm:p-10"
            style={{ background: 'rgba(6,6,8,0.93)', backdropFilter: 'blur(10px)' }}
          >
            <motion.img
              src={zoom}
              alt=""
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="max-h-full max-w-full rounded-2xl object-contain"
              style={{ border: `1px solid ${T.lineHi}` }}
            />
            <button
              onClick={() => setZoom(null)}
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}`, color: T.text2 }}
            >
              <X size={17} strokeWidth={2.4} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
