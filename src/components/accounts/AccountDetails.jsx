import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Building2, Trophy, Loader2, Check, Plus, Trash2,
  TrendingUp, TrendingDown, Activity, Target, ArrowDownToLine,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { T, EASE, SPRING } from '../../lib/theme';
import {
  fetchEvents, ensureStart, addEvent, removeEvent, setBalance, fetchAccountTrades,
  tradeStats, money, money2, todayLocal, KINDS_EN,
} from '../../lib/accountsStore';
import DateField from '../ui/DateField';
import BalanceChart from './BalanceChart';

/* ==================================================================
   Account details.

   Вікно англійською: цю картку показують іншим, і змішані мови
   виглядають як недороблений переклад. Розкладка фіксована — висота
   не залежить від кількості подій, тому при відкритті нічого не
   стрибає, а форма запису завжди на тому самому місці справа.

   Ховери всюди зроблені одним прийомом: світло йде за курсором на
   CSS-змінних, повз React. Жодного руху самих блоків.
================================================================== */

const fmtDay = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

/* Пишемо координати курсора у вузол — цим живуть усі ховери нижче */
function track(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function Stat({ label, value, hint, tone, hue, icon: Icon }) {
  return (
    <div
      onPointerMove={track}
      className="ad-tile relative min-w-0 overflow-hidden rounded-2xl px-4 py-3.5"
      style={{ '--hue': hue || T.accRgb, background: T.surface, border: `1px solid ${T.line}` }}
    >
      <span aria-hidden className="ad-bloom" />
      <span aria-hidden className="ad-edge" />
      <div className="relative z-10 mb-1.5 flex items-center gap-2">
        {Icon && <Icon size={12.5} strokeWidth={2.3} style={{ color: `rgb(${hue || T.accRgb})` }} />}
        <span
          className="truncate text-[11px] font-bold uppercase tracking-[0.13em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          {label}
        </span>
      </div>
      <div
        className="relative z-10 text-[22px] font-bold tabular-nums"
        style={{ fontFamily: T.mono, color: tone || T.text, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      {hint && (
        <div className="relative z-10 mt-0.5 truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

/* Кістяк на час завантаження. Займає рівно стільки ж місця, скільки
   готовий вміст, тому вікно не міняє висоту, коли дані прилітають. */
const Skeleton = ({ h, className = '' }) => (
  <div
    className={`ad-skeleton rounded-2xl ${className}`}
    style={{ height: h, background: T.surface, border: `1px solid ${T.line}` }}
  />
);

export default function AccountDetails({ account, onClose, onUpdate }) {
  const { user } = useAuth();

  const [events, setEvents] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState('payout');
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(todayLocal());
  const [note, setNote] = useState('');

  const acc = account;
  const initial = Number(acc.initial_balance ?? acc.balance) || 0;
  const balance = Number(acc.balance) || 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let alive = true;

    (async () => {
      try {
        const [evs, trs] = await Promise.all([
          fetchEvents(acc.id),
          fetchAccountTrades(user.id, acc.firm_name),
        ]);
        if (!alive) return;
        const withStart = await ensureStart(user.id, acc, evs);
        if (!alive) return;
        setEvents(withStart);
        setTrades(trs);
      } catch (err) {
        if (alive) notify.error('Could not load history', err.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, acc.id]);

  const stats = useMemo(() => tradeStats(trades), [trades]);
  const payouts = useMemo(() => events.filter((e) => e.kind === 'payout'), [events]);
  const totalPaid = useMemo(() => payouts.reduce((s, e) => s + Number(e.amount || 0), 0), [payouts]);

  const openProfit = balance - initial;
  const earned = totalPaid + openProfit;

  const history = useMemo(() => [...events].reverse(), [events]);
  const lastId = events.length ? events[events.length - 1].id : null;

  const submit = async () => {
    const value = Math.abs(Number(String(amount).replace(',', '.')) || 0);
    if (!value) { notify.error('Enter an amount', 'Zero changes nothing.'); return; }
    if (kind === 'payout' && value > balance) {
      notify.error('Too much', 'Payout exceeds the current balance.');
      return;
    }

    setBusy(true);
    try {
      const { event, account: next } = await addEvent(user.id, acc, {
        kind, amount: value, happened_at: when, note,
      });
      setEvents((list) => [...list, event]);
      onUpdate(next);
      setAmount('');
      setNote('');
      notify.success(
        kind === 'payout' ? 'Payout logged' : 'Logged',
        `Balance is now ${money(next.balance)}`,
      );
    } catch (err) {
      notify.error('Not saved', err.message);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (ev) => {
    setBusy(true);
    try {
      await removeEvent(user.id, ev);
      const prevBalance = events.length > 1
        ? Number(events[events.length - 2].balance_after)
        : initial;
      const next = await setBalance(user.id, acc.id, prevBalance);

      setEvents((list) => list.filter((x) => x.id !== ev.id));
      onUpdate(next);
      notify.success('Undone', `Balance is back to ${money(prevBalance)}`);
    } catch (err) {
      notify.error('Could not undo', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(6,6,8,0.88)', backdropFilter: 'blur(14px)' }}
    >
      <style>{`
        /* ==========================================================
           Ховери вікна. Одна механіка на все: світло йде за курсором
           через CSS-змінні, які пишемо прямо у вузол. Блоки не
           рухаються — рух завжди читається як затримка.
        ========================================================== */
        .ad-tile, .ad-row, .ad-seg {
          --mx: 50%;
          --my: 50%;
          --hue: ${T.accRgb};
          isolation: isolate;
          transition: background-color .35s ease, border-color .35s ease, box-shadow .4s ease;
        }
        .ad-tile:hover, .ad-row:hover {
          border-color: rgba(var(--hue), 0.24) !important;
          box-shadow: 0 18px 40px -30px rgba(var(--hue), 0.75);
        }

        .ad-bloom, .ad-edge {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
        }
        .ad-bloom {
          background: radial-gradient(200px circle at var(--mx) var(--my),
            rgba(var(--hue), .11), transparent 66%);
          opacity: 0;
          transition: opacity .32s ease;
        }
        .ad-tile:hover .ad-bloom, .ad-row:hover .ad-bloom { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Кромка світиться рівно там, де курсор */
        .ad-edge {
          padding: 1px;
          background: radial-gradient(180px circle at var(--mx) var(--my),
            rgba(var(--hue), .9), rgba(var(--hue), .2) 38%, transparent 70%);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
          opacity: 0;
          transition: opacity .3s ease;
        }
        .ad-tile:hover .ad-edge, .ad-row:hover .ad-edge { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Кнопка з відблиском, що пробігає при наведенні */
        .ad-cta { position: relative; overflow: hidden; }
        .ad-cta::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,.45) 50%, transparent 62%);
          transform: translateX(-120%);
          transition: transform .7s cubic-bezier(.22,1,.36,1);
        }
        .ad-cta:hover::after { transform: translateX(120%); }
        .ad-cta:hover { box-shadow: 0 12px 34px -10px rgba(${T.accRgb}, 0.85) !important; }

        /* Поле, що підсвічує рамку під курсором */
        .ad-field {
          --mx: 50%;
          transition: border-color .3s ease, background-color .3s ease;
        }
        .ad-field:hover { border-color: ${T.lineHi} !important; }
        .ad-field:focus-within {
          border-color: ${T.lineAcc} !important;
          box-shadow: 0 0 0 3px rgba(${T.accRgb}, 0.08);
        }

        .ad-seg:hover { background-color: ${T.surfaceHi} !important; }

        .ad-close { transition: transform .35s cubic-bezier(.22,1,.36,1), background-color .25s, color .25s; }
        .ad-close:hover { transform: rotate(90deg); }

        .ad-skeleton {
          position: relative;
          overflow: hidden;
        }
        .ad-skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(100deg, transparent 30%, rgba(255,255,255,.045) 50%, transparent 70%);
          transform: translateX(-100%);
          animation: ad-shimmer 1.4s infinite;
        }
        @keyframes ad-shimmer { to { transform: translateX(100%); } }

        @media (prefers-reduced-motion: reduce) {
          .ad-cta::after, .ad-skeleton::after { animation: none; transition: none; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={SPRING}
        /* Висота задана, а не виведена з вмісту: інакше вікно росло б
           у момент, коли долітають дані, і стрибало під курсором */
        className="flex h-[min(760px,94vh)] w-full max-w-[1120px] flex-col overflow-hidden rounded-3xl"
        style={{
          background: T.bg,
          border: `1px solid ${T.line}`,
          boxShadow: '0 50px 120px -40px rgba(0,0,0,0.98)',
        }}
      >
        {/* ─────────── Header ─────────── */}
        <div
          className="relative flex shrink-0 items-center gap-4 px-5 py-4 sm:px-7"
          style={{
            borderBottom: `1px solid ${T.line}`,
            background: `linear-gradient(120deg, rgba(${T.accRgb},0.08), ${T.surface} 62%)`,
          }}
        >
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: T.sunken, border: `1px solid rgba(${T.accRgb},0.24)` }}
          >
            <Building2 size={19} strokeWidth={2} style={{ color: T.acc }} />
          </span>
          <div className="min-w-0 flex-1 pr-10">
            <h2
              className="truncate text-[20px] font-bold sm:text-[23px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
            >
              {acc.firm_name}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.ok }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.ok, boxShadow: `0 0 8px ${T.ok}` }} />
              {acc.status === 'Active' ? 'Active' : acc.status}
              <span style={{ color: T.text4 }}>· {money(initial)} account</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="ad-close absolute right-5 top-4 grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text3; }}
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        {/* ─────────── Body ─────────── */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_324px]">

          {/* ══════ Left ══════ */}
          <div className="custom-scrollbar min-h-0 overflow-y-auto px-4 py-5 sm:px-6">

            <div className="mb-4">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Current balance
              </p>
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span
                  className="text-[36px] font-bold tabular-nums leading-none sm:text-[44px]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.04em' }}
                >
                  {money2(balance)}
                </span>
                <span
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-bold tabular-nums"
                  style={{
                    fontFamily: T.mono,
                    background: openProfit >= 0 ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
                    border: `1px solid ${openProfit >= 0 ? `rgba(${T.okRgb},0.24)` : `rgba(${T.badRgb},0.24)`}`,
                    color: openProfit >= 0 ? T.ok : T.bad,
                  }}
                >
                  {openProfit >= 0 ? <TrendingUp size={12} strokeWidth={2.6} /> : <TrendingDown size={12} strokeWidth={2.6} />}
                  {openProfit >= 0 ? '+' : '−'}{money2(Math.abs(openProfit))}
                </span>
              </div>
              <p className="mt-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {openProfit > 0
                  ? 'unrealised profit above account size'
                  : openProfit < 0
                    ? 'below the starting size'
                    : 'exactly at account size'}
              </p>
            </div>

            <div
              onPointerMove={track}
              className="ad-tile relative mb-4 overflow-hidden rounded-2xl px-2 py-3"
              style={{ '--hue': openProfit >= 0 ? T.okRgb : T.badRgb, background: T.surface, border: `1px solid ${T.line}` }}
            >
              <span aria-hidden className="ad-bloom" />
              <span aria-hidden className="ad-edge" />
              <div className="relative z-10">
                {loading ? <Skeleton h={206} className="border-0" /> : <BalanceChart events={events} initial={initial} />}
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
              {loading ? (
                [0, 1, 2, 3].map((i) => <Skeleton key={i} h={92} />)
              ) : (
                <>
                  <Stat
                    icon={Activity}
                    hue="110,168,254"
                    label="Trades"
                    value={stats.total || '—'}
                    hint={stats.total ? `${stats.wins}W · ${stats.losses}L` : 'none in journal yet'}
                  />
                  <Stat
                    icon={Target}
                    hue={T.okRgb}
                    label="Win rate"
                    value={stats.total ? `${stats.winrate}%` : '—'}
                    hint={stats.total ? 'break-even excluded' : 'nothing to count'}
                    tone={stats.total ? (stats.winrate >= 50 ? T.ok : T.text) : T.text4}
                  />
                  <Stat
                    icon={TrendingUp}
                    hue={stats.netR >= 0 ? T.okRgb : T.badRgb}
                    label="Net R"
                    value={stats.total ? `${stats.netR > 0 ? '+' : ''}${stats.netR}R` : '—'}
                    hint={stats.total ? `avg ${stats.avgR > 0 ? '+' : ''}${stats.avgR}R` : '—'}
                    tone={stats.total ? (stats.netR >= 0 ? T.ok : T.bad) : T.text4}
                  />
                  <Stat
                    icon={Trophy}
                    hue={T.accRgb}
                    label="Earned"
                    value={money(earned)}
                    hint="payouts plus what's on the account"
                    tone={earned >= 0 ? T.acc : T.bad}
                  />
                </>
              )}
            </div>

            <h3
              className="mb-3 flex items-center gap-2 pb-2.5 text-[11.5px] font-bold uppercase tracking-[0.16em]"
              style={{ fontFamily: T.sans, color: T.text4, borderBottom: `1px solid ${T.line}` }}
            >
              <Trophy size={12.5} strokeWidth={2.3} style={{ color: T.warn }} /> Account history
              {!loading && <span style={{ color: T.text4, opacity: 0.7 }}>· {events.length}</span>}
            </h3>

            <div className="flex flex-col gap-2 pb-2">
              {loading ? (
                [0, 1].map((i) => <Skeleton key={i} h={68} />)
              ) : (
                <AnimatePresence initial={false}>
                  {history.map((e) => {
                    const isPayout = e.kind === 'payout';
                    const tone = isPayout ? T.warn : e.kind === 'deposit' ? T.info : T.text3;
                    const hue = isPayout ? T.warnRgb : T.accRgb;

                    return (
                      <motion.div
                        key={e.id}
                        layout
                        onPointerMove={track}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="ad-row group relative flex items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3"
                        style={{ '--hue': hue, background: T.surface, border: `1px solid ${T.line}` }}
                      >
                        <span aria-hidden className="ad-bloom" />
                        <span aria-hidden className="ad-edge" />

                        <span
                          className="relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105"
                          style={{ background: `rgba(${hue},0.09)`, border: `1px solid rgba(${hue},0.22)` }}
                        >
                          {isPayout
                            ? <ArrowDownToLine size={15} strokeWidth={2.3} style={{ color: T.warn }} />
                            : <Check size={15} strokeWidth={2.6} style={{ color: T.acc }} />}
                        </span>

                        <div className="relative z-10 min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                              {KINDS_EN[e.kind]?.label || e.kind}
                            </span>
                            {e.kind !== 'start' && Number(e.amount) > 0 && (
                              <span className="text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: tone }}>
                                {isPayout ? '−' : '+'}{money2(e.amount)}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                            {fmtDay(e.happened_at)}
                            {e.note ? ` · ${e.note}` : ''}
                          </div>
                        </div>

                        <span className="relative z-10 shrink-0 text-right">
                          <span className="block text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                            {money2(e.balance_after)}
                          </span>
                          <span className="text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                            balance
                          </span>
                        </span>

                        {/* Undo лише для останньої події — інакше баланси
                            всіх наступних стали б брехнею */}
                        {e.id === lastId && e.kind !== 'start' && (
                          <button
                            onClick={() => undo(e)}
                            disabled={busy}
                            title="Undo last movement"
                            className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg opacity-0 transition-all duration-200 group-hover:opacity-100"
                            style={{ border: `1px solid ${T.line}`, color: T.text4 }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.color = T.bad; ev.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; ev.currentTarget.style.background = `rgba(${T.badRgb},0.08)`; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.color = T.text4; ev.currentTarget.style.borderColor = T.line; ev.currentTarget.style.background = 'transparent'; }}
                          >
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* ══════ Right ══════ */}
          <div
            className="custom-scrollbar min-h-0 overflow-y-auto px-4 py-5 sm:px-5"
            style={{ borderLeft: `1px solid ${T.line}`, background: `linear-gradient(180deg, ${T.surface}, ${T.bg} 240px)` }}
          >
            <div
              onPointerMove={track}
              className="ad-tile relative mb-4 overflow-hidden rounded-2xl px-4 py-3.5"
              style={{ '--hue': T.warnRgb, background: `rgba(${T.warnRgb},0.05)`, border: `1px solid rgba(${T.warnRgb},0.16)` }}
            >
              <span aria-hidden className="ad-bloom" />
              <span aria-hidden className="ad-edge" />
              <p className="relative z-10 mb-1 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Withdrawn to date
              </p>
              <div className="relative z-10 text-[24px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: totalPaid ? T.warn : T.text4 }}>
                {loading ? '—' : money2(totalPaid)}
              </div>
              <p className="relative z-10 mt-0.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {payouts.length ? `${payouts.length} payout${payouts.length === 1 ? '' : 's'}` : 'none yet'}
              </p>
            </div>

            <h3
              className="mb-3 flex items-center gap-2 pb-2.5 text-[11.5px] font-bold uppercase tracking-[0.16em]"
              style={{ fontFamily: T.sans, color: T.text4, borderBottom: `1px solid ${T.line}` }}
            >
              <Plus size={12.5} strokeWidth={2.6} style={{ color: T.acc }} /> Log a movement
            </h3>

            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-3 gap-1.5">
                {['payout', 'deposit', 'adjust'].map((k) => {
                  const on = kind === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      className="ad-seg rounded-lg py-2 text-[12px] font-bold"
                      style={{
                        background: on ? `rgba(${T.accRgb},0.13)` : T.sunken,
                        border: `1px solid ${on ? T.lineAcc : T.line}`,
                        color: on ? T.acc : T.text3,
                        fontFamily: T.sans,
                        boxShadow: on ? `0 0 18px -6px rgba(${T.accRgb},0.55)` : 'none',
                      }}
                    >
                      {KINDS_EN[k].label}
                    </button>
                  );
                })}
              </div>

              <div
                className="ad-field relative rounded-xl"
                style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              >
                <span
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[17px] font-bold"
                  style={{ fontFamily: T.mono, color: T.text4 }}
                >
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
                  placeholder="0"
                  className="h-[52px] w-full bg-transparent pl-8 pr-3.5 text-[20px] font-bold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  style={{ color: T.text, fontFamily: T.mono }}
                />
              </div>

              {/* найчастіший випадок — вивести весь прибуток */}
              {kind === 'payout' && openProfit > 0 && (
                <button
                  onClick={() => setAmount(String(Math.round(openProfit * 100) / 100))}
                  className="rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors duration-200"
                  style={{ background: T.sunken, border: `1px dashed ${T.lineHi}`, color: T.text3, fontFamily: T.sans }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; e.currentTarget.style.background = `rgba(${T.accRgb},0.07)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = T.sunken; }}
                >
                  Full profit — {money2(openProfit)}
                </button>
              )}

              <DateField value={when} onChange={setWhen} align="right" lang="en" />

              <div className="ad-field rounded-xl" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="h-11 w-full bg-transparent px-3.5 text-[14px] outline-none"
                  style={{ color: T.text, fontFamily: T.sans }}
                />
              </div>

              <button
                onClick={submit}
                disabled={busy}
                className="ad-cta mt-0.5 flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
                style={{
                  background: T.acc,
                  color: 'var(--edge-bg, #0A0A0C)',
                  fontFamily: T.sans,
                  opacity: busy ? 0.6 : 1,
                  boxShadow: `0 8px 24px -10px rgba(${T.accRgb},0.7)`,
                }}
              >
                <span className="relative z-10 flex items-center gap-2">
                  {busy
                    ? <Loader2 size={16} className="animate-spin" />
                    : <><Check size={16} strokeWidth={3} /> Log it</>}
                </span>
              </button>

              <p className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}>
                {KINDS_EN[kind].hint}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
