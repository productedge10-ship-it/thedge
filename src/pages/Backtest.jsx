import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, X, Loader2, FlaskConical, Trash2, ArrowDownUp, Layers,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { T, EASE, useEdgeFonts } from '../lib/theme';
import { computeStats, fmtR, fmtPF } from '../lib/backtestStats';
import { DEMO_SESSIONS } from '../lib/backtestDemo';
import { SoftCard } from '../components/ui/Hovers';
import BacktestCard from '../components/backtest/BacktestCard';
import NewBacktestModal from '../components/backtest/NewBacktestModal';

/* ==================================================================
   Головна бектестів.
   Список усіх гіпотез, які ти перевіряв, з достатньою статистикою,
   щоб зрозуміти, котра з них жива, не заходячи всередину.
   Поки в базі порожньо — показуються демо-бектести.
================================================================== */

function Summary({ sessions }) {
  const agg = useMemo(() => {
    const all = sessions.flatMap((s) => (s.trades || []).map((t) => t));
    const s = computeStats(all, 10000);
    return {
      count: sessions.length,
      trades: s.total,
      netR: s.netR,
      winrate: s.winrate,
      pf: s.profitFactor,
    };
  }, [sessions]);

  const items = [
    { label: 'Бектестів', value: agg.count },
    { label: 'Угод усього', value: agg.trades },
    { label: 'Сумарний R', value: agg.trades ? fmtR(agg.netR) : '—', color: agg.netR > 0 ? T.ok : agg.netR < 0 ? T.bad : T.text },
    { label: 'Win rate', value: agg.trades ? `${agg.winrate.toFixed(0)}%` : '—' },
    { label: 'Profit factor', value: agg.trades ? fmtPF(agg.pf) : '—', color: agg.pf >= 1.5 ? T.ok : agg.pf < 1 && agg.trades ? T.bad : T.text },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: i * 0.04, ease: EASE }}
        >
          <SoftCard className="min-w-0 px-4 py-3.5">
            <div
              className="truncate text-[12px] font-semibold uppercase tracking-[0.09em]"
              style={{ fontFamily: T.sans, color: T.text4 }}
              title={it.label}
            >
              {it.label}
            </div>
            <div
              className="mt-1.5 truncate text-[22px] font-bold tabular-nums leading-none"
              style={{ fontFamily: T.display, color: it.color || T.text }}
              title={String(it.value)}
            >
              {it.value}
            </div>
          </SoftCard>
        </motion.div>
      ))}
    </div>
  );
}

export default function Backtest() {
  useEdgeFonts();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usingDemo, setUsingDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function load() {
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('backtest_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!rows || rows.length === 0) {
        setSessions(DEMO_SESSIONS);
        setUsingDemo(true);
      } else {
        const ids = rows.map((r) => r.id);
        const { data: trades } = await supabase
          .from('backtest_trades')
          .select('*')
          .in('session_id', ids)
          .order('date', { ascending: true });

        const byId = {};
        (trades || []).forEach((t) => {
          (byId[t.session_id] = byId[t.session_id] || []).push(t);
        });
        setSessions(rows.map((r) => ({ ...r, trades: byId[r.id] || [] })));
        setUsingDemo(false);
      }
    } catch (e) {
      console.error(e);
      setSessions(DEMO_SESSIONS);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }

  const createSession = async (f) => {
    setSaving(true);
    try {
      const payload = {
        user_id: user?.id,
        name: f.name.trim(),
        pair: f.pair || 'EURUSD',
        strategy_name: f.strategy_name || null,
        initial_balance: Number(f.initial_balance) || 10000,
      };
      const { data, error } = await supabase.from('backtest_sessions').insert([payload]).select().single();
      if (error) throw error;
      setCreating(false);
      navigate(`/backtest/${data.id}`);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Не вдалось створити бектест');
    } finally {
      setSaving(false);
    }
  };

  const removeSession = async (s) => {
    try {
      await supabase.from('backtest_trades').delete().eq('session_id', s.id);
      await supabase.from('backtest_sessions').delete().eq('id', s.id);
      setSessions((list) => list.filter((x) => x.id !== s.id));
    } catch (e) {
      console.error(e);
    } finally {
      setConfirm(null);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sessions.filter((s) =>
      !q
      || (s.name || '').toLowerCase().includes(q)
      || (s.pair || '').toLowerCase().includes(q)
      || (s.strategy_name || '').toLowerCase().includes(q));

    const stat = (s) => computeStats(s.trades || [], s.initial_balance || 10000);
    return [...list].sort((a, b) => {
      if (sort === 'netR') return stat(b).netR - stat(a).netR;
      if (sort === 'trades') return (b.trades?.length || 0) - (a.trades?.length || 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [sessions, search, sort]);

  const SORTS = [
    { key: 'recent', label: 'нові' },
    { key: 'netR', label: 'за R' },
    { key: 'trades', label: 'за угодами' },
  ];

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1800px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Backtesting
            </div>
            <h1
              className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Бектести
            </h1>
            <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {usingDemo
                ? 'Це демо-дані — створи свій бектест, і вони зникнуть.'
                : `${sessions.length} ${sessions.length === 1 ? 'бектест' : 'бектестів'} · статистика рахується по всіх угодах`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex h-[42px] w-full items-center gap-2.5 rounded-xl px-3.5 sm:w-[240px]"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <Search size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Назва, актив, стратегія…"
                className="w-full bg-transparent text-[14px] outline-none"
                style={{ fontFamily: T.sans, color: T.text }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ color: T.text4 }}>
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div className="flex h-[42px] items-center gap-1 rounded-xl p-1" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              <ArrowDownUp size={14} strokeWidth={2.2} style={{ color: T.text4, marginLeft: 6, marginRight: 2 }} />
              {SORTS.map((s) => {
                const on = sort === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
                    style={{
                      fontFamily: T.sans,
                      color: on ? T.acc : T.text3,
                      background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCreating(true)}
              className="group inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
              style={{
                background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
            >
              <Plus size={16} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
              Новий бектест
            </button>
          </div>
        </motion.div>

        {loading ? (
          <div className="grid place-items-center py-32">
            <Loader2 size={30} className="animate-spin" style={{ color: T.acc }} />
          </div>
        ) : (
          <>
            {sessions.length > 0 && <Summary sessions={sessions} />}

            {visible.length === 0 ? (
              <div className="flex flex-col items-center px-5 py-24 text-center">
                <div
                  className="mb-6 grid h-16 w-16 place-items-center rounded-2xl"
                  style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}
                >
                  <FlaskConical size={24} strokeWidth={1.7} />
                </div>
                <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>
                  {sessions.length === 0 ? 'Ще немає бектестів' : 'Нічого не знайшлось'}
                </div>
                <p className="mb-7 max-w-[440px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                  {sessions.length === 0
                    ? 'Створи бектест під конкретну гіпотезу — і прожени по ній 50–100 угод. Статистика покаже, чи варта вона реальних грошей.'
                    : 'Спробуй інші слова в пошуку.'}
                </p>
                <button
                  onClick={() => (sessions.length === 0 ? setCreating(true) : setSearch(''))}
                  className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-bold"
                  style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  {sessions.length === 0 ? <><Plus size={15} strokeWidth={3} /> Створити перший</> : 'Скинути пошук'}
                </button>
              </div>
            ) : (
              <motion.div layout className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                <AnimatePresence mode="popLayout" initial={false}>
                  {visible.map((s) => (
                    <BacktestCard
                      key={s.id}
                      session={s}
                      onOpen={(x) => navigate(`/backtest/${x.id}`)}
                      onDelete={(x) => setConfirm(x)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {usingDemo && visible.length > 0 && (
              <div
                className="mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5"
                style={{ background: `rgba(${T.warnRgb},0.05)`, border: `1px solid rgba(${T.warnRgb},0.18)` }}
              >
                <Layers size={16} strokeWidth={2.2} style={{ color: T.warn }} />
                <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                  Демо-бектести показані для прикладу. У них можна клікати й навіть додавати угоди — але після перезавантаження вони повернуться як були.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <NewBacktestModal
            key="new"
            saving={saving}
            onClose={() => setCreating(false)}
            onCreate={createSession}
          />
        )}
      </AnimatePresence>

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
              className="w-full max-w-[420px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}` }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div
                className="mb-2.5 text-[19px] font-bold"
                style={{
                  fontFamily: T.display, color: T.text,
                  overflowWrap: 'anywhere',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}
              >
                Видалити «{confirm.name}»?
              </div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                Разом із бектестом зникнуть усі {confirm.trades?.length || 0} угод у ньому.
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
                  onClick={() => removeSession(confirm)}
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
