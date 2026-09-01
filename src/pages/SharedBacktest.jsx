import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Lock, ArrowRight, FlaskConical, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { computeStats } from '../lib/backtestStats';
import { loadPublicBacktest } from '../lib/backtestShare';
import PlanBackdrop from '../components/trading/PlanBackdrop';
import { EdgeMonogram, EdgeWordmark } from '../components/core/Layout';
import StatStrip from '../components/backtest/StatStrip';
import EquityCurve from '../components/backtest/EquityCurve';
import BreakdownPanels from '../components/backtest/BreakdownPanels';
import BacktestTable from '../components/backtest/BacktestTable';
import TradeSheet from '../components/backtest/TradeSheet';
import { ACT, act, actGradient, actGradientHover } from '../components/backtest/accent';

/* ==================================================================
   Публічний бектест.
   Показуємо те, заради чого прогін і робиться: чи є перевага, звідки
   вона береться і чого вона коштує в просадці. Угоди — списком нижче,
   без можливості щось змінити.
================================================================== */

export default function SharedBacktest() {
  useEdgeFonts();

  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);
  /* Картка угоди — та сама, що у власника, але тільки для читання */
  const [sheet, setSheet] = useState(null);

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
          {/* Для залогінених головна дія — повернутись до своїх бектестів,
              тому вона в кольорі розділу, як «Новий бектест» у списку */}
          {user ? (
            <button
              onClick={() => navigate('/backtest')}
              className="group flex h-9 items-center gap-2 rounded-xl px-4 text-[13.5px] font-semibold"
              style={{
                fontFamily: T.sans, color: '#fff',
                background: actGradient,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -12px ${act(0.9)}`,
                transition: 'all .18s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.background = actGradientHover;
                e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.27), 0 14px 30px -12px rgba(${ACT.rgb},0.95)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.background = actGradient;
                e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -12px ${act(0.9)}`;
              }}
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
        <Loader2 className="animate-spin" size={30} style={{ color: ACT.tint }} />
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

  const { session } = data;

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
              <FlaskConical size={13} strokeWidth={2.3} style={{ color: ACT.tint }} />
              <span
                className="text-[10px] font-bold uppercase tracking-[0.26em]"
                style={{ fontFamily: T.mono, color: ACT.tint }}
              >
                Бектест
              </span>
            </div>

            <h1
              className="mb-4 text-[28px] font-bold leading-none sm:text-[38px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.032em', overflowWrap: 'anywhere' }}
            >
              {session.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {session.pair && (
                <span
                  className="rounded-lg px-[11px] py-1.5 text-[11px] font-bold tracking-[0.1em]"
                  style={{ fontFamily: T.mono, color: ACT.tint, background: act(0.18), border: `1px solid ${act(0.45)}` }}
                >
                  {session.pair}
                </span>
              )}
              {[
                session.strategy_name,
                `Старт $${Number(session.initial_balance).toLocaleString('uk-UA')}`,
                'Ризик 1%',
                `${stats.total} угод`,
              ].filter(Boolean).map((chip) => (
                <span
                  key={chip}
                  className="rounded-lg px-[11px] py-1.5 text-[12.5px] font-medium"
                  style={{ fontFamily: T.sans, color: T.text3, background: T.surface, border: `1px solid ${T.line}` }}
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

          {/* ─────────── Підсумок прогону ─────────── */}
          <StatStrip stats={stats} />

          <div className="mt-[18px]">
            <EquityCurve stats={stats} />
          </div>

          <div className="mt-[18px]">
            <BreakdownPanels stats={stats} />
          </div>

          {/* ─────────── Угоди ─────────── */}
          <div className="mb-4 mt-[34px]">
            <h2 className="text-[20px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}>
              Угоди
            </h2>
            <p className="mt-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {stats.total} {stats.total === 1 ? 'запис' : 'записів'} · тільки перегляд
            </p>
          </div>

          <BacktestTable trades={stats.trades} readOnly onOpen={setSheet} onShot={setZoom} />

          {/* ─────────── Тиха реклама ─────────── */}
          {!user && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
              className="mt-14 flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:p-7"
              style={{
                background: `linear-gradient(120deg, ${act(0.06)}, ${T.surface} 60%)`,
                border: `1px solid ${T.line}`,
              }}
            >
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                style={{ background: act(0.10), border: `1px solid ${act(0.22)}` }}
              >
                <FlaskConical size={18} strokeWidth={2} style={{ color: ACT.tint }} />
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

      {/* ─────────── Картка угоди ─────────── */}
      <AnimatePresence>
        {sheet && (
          <TradeSheet
            key="shared-sheet"
            readOnly
            initial={sheet}
            pair={session?.pair}
            onClose={() => setSheet(null)}
          />
        )}
      </AnimatePresence>

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
