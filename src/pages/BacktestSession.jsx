import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, Trash2, Share2, Globe, Link2Off } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { notify } from '../utils/notify';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { computeStats, pairOf, tagsOf } from '../lib/backtestStats';
import { isDemo, getDemoSession, addDemoTrade, updateDemoTrade, deleteDemoTrade } from '../lib/backtestDemo';
import { setBacktestPublic } from '../lib/backtestShare';
import QuickTradeBar from '../components/backtest/QuickTradeBar';
import BacktestTable from '../components/backtest/BacktestTable';
import TradeSheet from '../components/backtest/TradeSheet';
import StatStrip from '../components/backtest/StatStrip';
import EquityCurve from '../components/backtest/EquityCurve';
import BreakdownPanels from '../components/backtest/BreakdownPanels';
import { ACT, act } from '../components/backtest/accent';

/* ==================================================================
   Сторінка одного бектесту.
   Порядок екрана = порядок читання: спершу підсумок прогону —
   цифри, крива, розбивки; і тільки потім робоча зона, де угоди
   записують і переглядають списком.
================================================================== */

export default function BacktestSession() {
  useEdgeFonts();
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const demo = isDemo(sessionId);
  const [session, setSession] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(null);       // { trade } | { preset }
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [sessionId]);

  async function load() {
    if (demo) {
      const s = getDemoSession(sessionId);
      if (!s) return navigate('/backtest');
      setSession(s);
      setTrades(s.trades);
      setLoading(false);
      return;
    }
    try {
      const [sRes, tRes] = await Promise.all([
        supabase.from('backtest_sessions').select('*').eq('id', sessionId).single(),
        supabase.from('backtest_trades').select('*').eq('session_id', sessionId).order('date', { ascending: true }).order('created_at', { ascending: true }),
      ]);
      if (sRes.error) throw sRes.error;
      setSession(sRes.data);
      setTrades(tRes.data || []);
    } catch (e) {
      console.error(e);
      navigate('/backtest');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- поділитись ---------- */

  const share = async () => {
    if (demo) {
      notify.error('Це демо', 'Створи власний бектест, щоб ним ділитись.');
      return;
    }
    try {
      const next = session.is_public ? session : await setBacktestPublic(user.id, sessionId, true);
      setSession(next);
      await navigator.clipboard.writeText(`${window.location.origin}/shared/backtest/${sessionId}`);
      notify.success('Лінк скопійовано', 'Бектест відкритий для перегляду за посиланням.');
    } catch (e) {
      notify.error('Не вдалось поділитись', e.message);
    }
  };

  const unshare = async () => {
    try {
      const next = await setBacktestPublic(user.id, sessionId, false);
      setSession(next);
      notify.success('Доступ закрито', 'Посилання більше не працює.');
    } catch (e) {
      notify.error('Не вдалось закрити доступ', e.message);
    }
  };

  const stats = useMemo(
    () => computeStats(trades, session?.initial_balance || 10000),
    [trades, session],
  );

  /* Активи, які вже зустрічались у цьому бектесті. Найсвіжіші
     попереду: якщо людина щойно перемкнулась на інший інструмент,
     наступна угода майже напевно буде по ньому ж. */
  const usedPairs = useMemo(() => {
    const seen = [];
    for (let i = trades.length - 1; i >= 0; i -= 1) {
      const p = pairOf(trades[i]);
      if (p && !seen.includes(p)) seen.push(p);
    }
    return seen;
  }, [trades]);

  /* Сетапи, які вже зустрічались у цьому бектесті — щоб форма
     підказувала своє, а не тільки вбудований список. */
  const usedTags = useMemo(() => {
    const seen = [];
    trades.forEach((t) => tagsOf(t).forEach((tag) => { if (tag && !seen.includes(tag)) seen.push(tag); }));
    return seen;
  }, [trades]);

  /* ---------- запис угоди ---------- */

  const toPayload = (f) => ({
    session_id: sessionId,
    user_id: user?.id,
    date: f.date,
    type: f.type,
    result: f.result,
    rr: Number(f.rr) || 0,
    notes: f.notes || '',
    /* У колонку — перший скрін (її читають таблиця й публічна
       сторінка), весь список — у tda_data. */
    screenshot_url: (f.shots && f.shots[0]) || f.screenshot_url || null,
    tda_data: {
      pair: f.pair || session?.pair,
      session: f.session,
      quality: f.quality,
      tags: f.tags || [],
      shots: f.shots || [],
    },
  });

  const quickAdd = async (q) => {
    const payload = toPayload({ ...q, tags: q.tags || [], notes: q.notes || '' });
    setSaving(true);
    try {
      if (demo) {
        const t = addDemoTrade(sessionId, { ...payload, created_at: new Date().toISOString() });
        setTrades((s) => [...s, t]);
      } else {
        const { data, error } = await supabase.from('backtest_trades').insert([payload]).select().single();
        if (error) throw error;
        setTrades((s) => [...s, data]);
      }
    } catch (e) {
      console.error(e);
      alert(e.message || 'Не вдалось зберегти угоду');
    } finally {
      setSaving(false);
    }
  };

  const saveSheet = async (f) => {
    const payload = toPayload(f);
    setSaving(true);
    try {
      if (demo) {
        if (f.id) { updateDemoTrade(sessionId, f.id, payload); setTrades((s) => s.map((t) => (t.id === f.id ? { ...t, ...payload } : t))); }
        else { const t = addDemoTrade(sessionId, { ...payload, created_at: new Date().toISOString() }); setTrades((s) => [...s, t]); }
      } else if (f.id) {
        const { data, error } = await supabase.from('backtest_trades').update(payload).eq('id', f.id).select().single();
        if (error) throw error;
        setTrades((s) => s.map((t) => (t.id === f.id ? data : t)));
      } else {
        const { data, error } = await supabase.from('backtest_trades').insert([payload]).select().single();
        if (error) throw error;
        setTrades((s) => [...s, data]);
      }
      setSheet(null);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Не вдалось зберегти угоду');
    } finally {
      setSaving(false);
    }
  };

  const removeTrade = async (id) => {
    try {
      if (demo) deleteDemoTrade(sessionId, id);
      else await supabase.from('backtest_trades').delete().eq('id', id);
      setTrades((s) => s.filter((t) => t.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setConfirm(null);
      setSheet(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <Loader2 size={32} className="animate-spin" style={{ color: ACT.tint }} />
      </div>
    );
  }

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-wrap items-start justify-between gap-8"
        >
          <div className="flex min-w-0 items-start gap-[18px]">
            <button
              onClick={() => navigate('/backtest')}
              title="До списку бектестів"
              className="group mt-4 grid h-11 w-11 shrink-0 place-items-center rounded-[13px] transition-all duration-200 active:scale-95"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = act(0.15); e.currentTarget.style.borderColor = act(0.45); e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <ArrowLeft size={17} strokeWidth={2.2} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.26em]" style={{ fontFamily: T.mono, color: ACT.tint }}>
                  Бектест
                </span>
                {demo && (
                  <span
                    className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{ fontFamily: T.mono, color: T.warn, background: `rgba(${T.warnRgb},0.10)`, border: `1px solid rgba(${T.warnRgb},0.25)` }}
                  >
                    демо
                  </span>
                )}
              </div>

              <h1
                className="mt-2.5 text-[28px] font-bold leading-none sm:text-[34px] lg:text-[38px]"
                style={{
                  fontFamily: T.display, color: T.text, letterSpacing: '-0.032em',
                  overflowWrap: 'anywhere',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                {session.name}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {session.pair && (
                  <span
                    className="rounded-lg px-[11px] py-1.5 text-[11px] font-bold tracking-[0.1em]"
                    style={{
                      fontFamily: T.mono, color: ACT.tint,
                      background: act(0.18), border: `1px solid ${act(0.45)}`,
                    }}
                  >
                    {session.pair}
                  </span>
                )}
                {[session.strategy_name, `Старт $${Number(session.initial_balance).toLocaleString('uk-UA')}`, 'Ризик 1%']
                  .filter(Boolean)
                  .map((chip) => (
                    <span
                      key={chip}
                      className="cursor-default rounded-lg px-[11px] py-1.5 text-[12.5px] font-medium transition-colors duration-200"
                      style={{ fontFamily: T.sans, color: T.text3, background: T.surface, border: `1px solid ${T.line}` }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text2; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text3; }}
                    >
                      {chip}
                    </span>
                  ))}
              </div>
            </div>
          </div>

          {/* Поділитись прогоном. Демо не ділиться — там нема чого показувати. */}
          {!demo && (
            <div className="mt-[22px] flex shrink-0 items-center gap-2.5">
              <button
                onClick={share}
                className="flex h-11 items-center gap-2.5 rounded-xl px-5 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{
                  fontFamily: T.sans,
                  background: session.is_public ? act(0.15) : T.surface,
                  border: `1px solid ${session.is_public ? act(0.45) : T.line}`,
                  color: session.is_public ? ACT.tint : T.text2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = act(0.15); e.currentTarget.style.borderColor = act(0.45); e.currentTarget.style.color = T.text; }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = session.is_public ? act(0.15) : T.surface;
                  e.currentTarget.style.borderColor = session.is_public ? act(0.45) : T.line;
                  e.currentTarget.style.color = session.is_public ? ACT.tint : T.text2;
                }}
              >
                {session.is_public ? <Globe size={16} strokeWidth={2.1} /> : <Share2 size={16} strokeWidth={2.1} />}
                {session.is_public ? 'Скопіювати лінк' : 'Поділитись'}
              </button>

              {session.is_public && (
                <button
                  onClick={unshare}
                  title="Закрити публічний доступ"
                  className="grid h-11 w-11 place-items-center rounded-xl transition-all duration-200 active:scale-95"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.warn; e.currentTarget.style.borderColor = `rgba(${T.warnRgb},0.35)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                >
                  <Link2Off size={16} strokeWidth={2.2} />
                </button>
              )}
            </div>
          )}
        </motion.div>

        {/* ─────────── Підсумок прогону ─────────── */}
        <StatStrip stats={stats} />

        <div className="mt-[18px]">
          <EquityCurve stats={stats} />
        </div>

        <div className="mt-[18px]">
          <BreakdownPanels stats={stats} />
        </div>

        {/* ─────────── Робоча зона: запис і список ─────────── */}
        <div className="mb-4 mt-[34px]">
          <h2 className="text-[20px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}>
            Угоди
          </h2>
          <p className="mt-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {stats.total} {stats.total === 1 ? 'запис' : 'записів'} · клік по рядку відкриє картку угоди
          </p>
        </div>

        <div className="mb-4">
          <QuickTradeBar
            saving={saving}
            sessionPair={session?.pair || ''}
            usedPairs={usedPairs}
            usedTags={usedTags}
            onQuickAdd={quickAdd}
            onOpenDetails={(preset) => setSheet({ preset })}
          />
        </div>

        <BacktestTable
          trades={stats.trades}
          onOpen={(t) => setSheet({ trade: t })}
          onDelete={(t) => setConfirm(t)}
        />
      </div>

      {/* ─────────── Модалка угоди ─────────── */}
      <AnimatePresence>
        {sheet && (
          <TradeSheet
            key="sheet"
            initial={sheet.trade || (sheet.preset ? {
              date: sheet.preset.date,
              type: sheet.preset.type,
              result: sheet.preset.result,
              rr: sheet.preset.rr,
              tda_data: {
                session: sheet.preset.session,
                pair: sheet.preset.pair || session.pair,
                tags: sheet.preset.tags || [],
              },
            } : null)}
            pair={session.pair}
            knownTags={usedTags}
            saving={saving}
            onClose={() => setSheet(null)}
            onSave={saveSheet}
            onDelete={sheet.trade ? (id) => setConfirm(sheet.trade) : null}
          />
        )}
      </AnimatePresence>

      {/* ─────────── Видалення ─────────── */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirm(null)}
            className="fixed inset-0 z-[300] grid place-items-center p-4"
            style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[400px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div className="mb-2.5 text-[19px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Видалити угоду?</div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                Статистика перерахується одразу.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirm(null)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-semibold"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                >
                  Залишити
                </button>
                <button
                  onClick={() => removeTrade(confirm.id)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-bold"
                  style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  Видалити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
