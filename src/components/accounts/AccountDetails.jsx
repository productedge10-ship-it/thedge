import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Building2, Trophy, Loader2, Check, Trash2, Lock,
  TrendingUp, TrendingDown, Activity, Target, ArrowDownToLine,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/notify';
import { T, EASE, SPRING } from '../../lib/theme';
import {
  fetchEvents, ensureStart, addEvent, removeEvent, setBalance, fetchAccountTrades,
  tradeStats, money, money2, todayLocal, KINDS_EN, CLOSE_REASONS, closeAccount,
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

function Stat({ label, value, hint, tone, hue, icon: Icon }) {
  return (
    <div
      className="ad-tile relative min-w-0 overflow-hidden rounded-2xl px-4 py-3.5"
      style={{ '--hue': hue || T.accRgb, background: T.surface, border: `1px solid ${T.line}` }}
    >
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

  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [histFilter, setHistFilter] = useState('all');
  const [chartRange, setChartRange] = useState('all');
  const [closePanel, setClosePanel] = useState(false);
  const [closeReason, setCloseReason] = useState(CLOSE_REASONS[0]);
  const [closeNote, setCloseNote] = useState('');
  const [closing, setClosing] = useState(false);

  const acc = account;
  const initial = Number(acc.initial_balance ?? acc.balance) || 0;
  const balance = Number(acc.balance) || 0;
  const isClosed = acc.status === 'Closed';

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
  const filteredHistory = useMemo(
    () => (histFilter === 'all' ? history : history.filter((e) => e.kind === histFilter)),
    [history, histFilter],
  );

  /* Просадка від піку: найвищий баланс, який колись бачив акаунт,
     проти поточного. Не «максимальний лосс за день» проп-фірми (ми
     його не рахуємо тут), а тіньова відстань до найкращої точки. */
  const drawdownPct = useMemo(() => {
    if (!events.length) return 0;
    const peak = Math.max(initial, ...events.map((e) => Number(e.balance_after) || 0));
    if (peak <= 0) return 0;
    return Math.max(0, ((peak - balance) / peak) * 100);
  }, [events, initial, balance]);

  /* «30д» показує лише свіжі точки, але завжди лишає одну точку
     перед вирізаним вікном — інакше лінія починалась би нізвідки. */
  const chartEvents = useMemo(() => {
    if (chartRange === 'all' || events.length < 2) return events;
    const cutoff = Date.now() - 30 * 86400000;
    const inRange = events.filter((e) => new Date(`${e.happened_at}T00:00:00`).getTime() >= cutoff);
    const firstInIdx = events.findIndex((e) => inRange.includes(e));
    if (firstInIdx > 0) return events.slice(firstInIdx - 1);
    return inRange.length ? inRange : events;
  }, [events, chartRange]);

  /* Тихий підпис під графіком: пік, дно і скільки днів у вибраному
     вікні — щоб цифру не доводилось вичитувати з самої кривої. */
  const chartSummary = useMemo(() => {
    if (!chartEvents.length) return null;
    const values = chartEvents.map((e) => Number(e.balance_after) || 0);
    const peak = Math.max(initial, ...values);
    const low = Math.min(initial, ...values);
    const first = chartEvents[0]?.happened_at;
    const last = chartEvents[chartEvents.length - 1]?.happened_at;
    const days = first && last
      ? Math.max(1, Math.round((new Date(`${last}T00:00:00`) - new Date(`${first}T00:00:00`)) / 86400000) + 1)
      : 1;
    return { peak, low, days };
  }, [chartEvents, initial]);

  const submit = async () => {
    if (isClosed) return;
    const value = Math.abs(Number(String(amount).replace(',', '.')) || 0);
    if (!value) { notify.error('Enter an amount', 'Zero changes nothing.'); return; }
    /* Вивести можна лише те, що понад базовий розмір рахунку — після
       виплати баланс ніколи не має впасти нижче initial_balance. */
    if (value > openProfit) {
      notify.error(
        'Too much',
        openProfit > 0
          ? `You can only withdraw what's above the ${money(initial)} account size — up to ${money2(openProfit)} right now.`
          : `Balance hasn't grown past the ${money(initial)} account size yet, so there's nothing to withdraw.`,
      );
      return;
    }

    setBusy(true);
    try {
      const { event, account: next } = await addEvent(user.id, acc, {
        kind: 'payout', amount: value, happened_at: when, note,
      });
      setEvents((list) => [...list, event]);
      onUpdate(next);
      setAmount('');
      setNote('');
      notify.success(
        'Payout logged',
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

  const confirmClose = async () => {
    setClosing(true);
    try {
      const reason = closeNote.trim() ? `${closeReason} — ${closeNote.trim()}` : closeReason;
      const next = await closeAccount(user.id, acc.id, reason);
      onUpdate(next);
      setClosePanel(false);
      notify.success('Account closed', reason);
    } catch (err) {
      notify.error('Could not close', err.message);
    } finally {
      setClosing(false);
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
          --hue: ${T.accRgb};
        }

        /* Рядок історії — тільки рамка тепліє, без сяйва: тут довгий
           список, і будь-який блиск на кожному наведенні втомлює. */
        .ad-row {
          transition: border-color .25s ease, background-color .25s ease;
        }
        .ad-row:hover {
          border-color: rgba(var(--hue), 0.22) !important;
          background-color: rgba(255,255,255,0.018);
        }

        /* ─────────── Панель виплати: тонка світла риска зверху,
           амбієнтне сяйво у кутку — «преміальна» картка ─────────── */
        .ad-payout-topline {
          position: absolute;
          top: 0; left: 12%; right: 12%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(${T.warnRgb},0.65), transparent);
          opacity: 0.7;
          pointer-events: none;
        }
        .ad-payout-ambient {
          position: absolute;
          width: 260px; height: 260px;
          right: -140px; top: -170px;
          background: rgba(${T.warnRgb},0.075);
          filter: blur(80px);
          pointer-events: none;
        }

        /* Кнопка «Log it» — той самий прийом, що на «Add Account»
           картках, тільки повільніше: блиск і рамка йдуть по колу
           неспішно, не відволікаючи від форми. */
        .ad-payout-cta {
          isolation: isolate;
          background: linear-gradient(135deg, ${T.warn}, #d99b08);
          box-shadow: 0 8px 25px -14px rgba(${T.warnRgb}, 0.5);
          transition: transform .25s ease, box-shadow .25s ease, background .25s ease;
        }
        .ad-payout-cta:hover {
          transform: translateY(-2px);
          background: linear-gradient(135deg, #fcd34d, ${T.warn});
          box-shadow: 0 12px 32px -12px rgba(${T.warnRgb}, 0.55);
        }
        .ad-payout-cta:active { transform: translateY(0); }
        .ad-payout-cta::before {
          content: '';
          position: absolute;
          top: 0; left: -130%;
          width: 70%; height: 100%;
          transform: skewX(-20deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.4), transparent);
          animation: ad-payout-shine 6s ease-in-out infinite;
        }
        @keyframes ad-payout-shine {
          0% { left: -130%; }
          35% { left: 150%; }
          100% { left: 150%; }
        }
        .ad-payout-cta::after {
          content: '';
          position: absolute;
          inset: -1px;
          z-index: -1;
          border-radius: inherit;
          background: linear-gradient(90deg,
            transparent 0%, transparent 35%, rgba(255,255,255,.7) 50%, transparent 65%, transparent 100%);
          background-size: 250% 100%;
          animation: ad-payout-sweep 5.5s linear infinite;
          opacity: 0.6;
        }
        @keyframes ad-payout-sweep {
          0% { background-position: 250% 0; }
          100% { background-position: -250% 0; }
        }

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

        /* Поле суми в панелі виплати — золотистий ховер/фокус замість
           фіолетового, у тон самій панелі. */
        .ad-field--warn:hover { border-color: rgba(${T.warnRgb}, 0.4) !important; }
        .ad-field--warn:focus-within {
          border-color: rgba(${T.warnRgb}, 0.55) !important;
          box-shadow: 0 0 0 3px rgba(${T.warnRgb}, 0.1);
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
          .ad-payout-cta::before, .ad-payout-cta::after, .ad-skeleton::after { animation: none; transition: none; }
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
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-[20px] font-bold sm:text-[23px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
            >
              {acc.firm_name}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: isClosed ? T.text4 : T.ok }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: isClosed ? T.text4 : T.ok, boxShadow: isClosed ? 'none' : `0 0 8px ${T.ok}` }} />
              {isClosed ? 'Closed' : 'Active'}
              <span style={{ color: T.text4 }}>· {money(initial)} account</span>
              {isClosed && acc.closed_reason && <span style={{ color: T.text4 }}>· {acc.closed_reason}</span>}
            </div>
          </div>

          <div className="flex h-10 shrink-0 items-center gap-2">
            {!isClosed && (
              <button
                onClick={() => setClosePanel((v) => !v)}
                className="flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-bold transition-colors"
                style={{
                  background: `rgba(${T.badRgb},0.1)`,
                  border: `1px solid rgba(${T.badRgb},0.4)`,
                  color: T.bad,
                  fontFamily: T.sans,
                  boxShadow: closePanel ? `0 0 18px -6px rgba(${T.badRgb},0.6)` : 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.16)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = `rgba(${T.badRgb},0.1)`; }}
              >
                <Lock size={13} strokeWidth={2.3} /> Close account
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="ad-close grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text3; }}
          >
            <X size={17} strokeWidth={2.4} />
          </button>
        </div>

        {/* ─────────── Close account panel ─────────── */}
        <AnimatePresence initial={false}>
          {closePanel && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden"
              style={{ borderBottom: `1px solid ${T.line}`, background: `rgba(${T.badRgb},0.04)` }}
            >
              <div className="flex flex-col gap-3 px-5 py-4 sm:px-7">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.bad }}>
                  Why are you closing this account?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CLOSE_REASONS.map((r) => {
                    const on = closeReason === r;
                    return (
                      <button
                        key={r}
                        onClick={() => setCloseReason(r)}
                        className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
                        style={{
                          fontFamily: T.sans,
                          background: on ? `rgba(${T.badRgb},0.14)` : T.surface,
                          border: `1px solid ${on ? `rgba(${T.badRgb},0.4)` : T.line}`,
                          color: on ? T.bad : T.text3,
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                <input
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="Details (optional)"
                  className="h-10 w-full rounded-xl px-3.5 text-[13.5px] outline-none"
                  style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={confirmClose}
                    disabled={closing}
                    className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-bold transition-colors"
                    style={{ background: T.bad, color: '#fff', fontFamily: T.sans, opacity: closing ? 0.6 : 1 }}
                  >
                    {closing ? <Loader2 size={14} className="animate-spin" /> : <Lock size={13} strokeWidth={2.4} />}
                    Confirm close
                  </button>
                  <button
                    onClick={() => setClosePanel(false)}
                    className="text-[13px] font-semibold"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─────────── Body ─────────── */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">

          {/* Balance / Withdrawn / Earned — three equal columns, the
              headline numbers of the account in one glance. */}
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7" style={{ borderRight: `1px solid ${T.line}` }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Current balance
              </p>
              <span
                className="text-[32px] font-bold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
              >
                {money2(balance)}
              </span>
              <span
                className="flex w-fit items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums"
                style={{
                  fontFamily: T.mono,
                  background: openProfit >= 0 ? `rgba(${T.okRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
                  border: `1px solid ${openProfit >= 0 ? `rgba(${T.okRgb},0.24)` : `rgba(${T.badRgb},0.24)`}`,
                  color: openProfit >= 0 ? T.ok : T.bad,
                }}
              >
                {openProfit >= 0 ? <TrendingUp size={11} strokeWidth={2.6} /> : <TrendingDown size={11} strokeWidth={2.6} />}
                {openProfit >= 0 ? '+' : '−'}{money2(Math.abs(openProfit))} from start
              </span>
            </div>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7" style={{ borderRight: `1px solid ${T.line}` }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Withdrawn
              </p>
              <span
                className="text-[32px] font-bold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: totalPaid ? T.warn : T.text, letterSpacing: '-0.03em' }}
              >
                {money2(totalPaid)}
              </span>
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {payouts.length ? `${payouts.length} payout${payouts.length === 1 ? '' : 's'}` : 'none yet'}
              </span>
            </div>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Total earned
              </p>
              <span
                className="text-[32px] font-bold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: earned >= 0 ? T.acc : T.bad, letterSpacing: '-0.03em' }}
              >
                {money(earned)}
              </span>
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                payouts + open profit
              </span>
            </div>
          </div>

          {/* ─────────── Log a payout — premium panel ─────────── */}
          <div className="px-4 py-4 sm:px-6" style={{ borderBottom: `1px solid ${T.line}` }}>
            <div
              className="ad-payout relative overflow-hidden rounded-[20px] p-5"
              style={{
                border: `1px solid ${T.line}`,
                background: `linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)), ${T.surface}`,
                boxShadow: '0 30px 80px -40px rgba(0,0,0,0.55), 0 8px 25px -12px rgba(0,0,0,0.25)',
                opacity: isClosed ? 0.45 : 1,
                pointerEvents: isClosed ? 'none' : 'auto',
              }}
            >
              <span aria-hidden className="ad-payout-topline" />
              <span aria-hidden className="ad-payout-ambient" />

              <div className="relative z-10 flex flex-col gap-4">
                {isClosed ? (
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text4 }}>
                    <Lock size={13} strokeWidth={2.3} /> Account is closed — nothing can be logged anymore
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div
                      className="flex items-center gap-2 text-[11px] font-bold uppercase"
                      style={{ fontFamily: T.sans, color: T.warn, letterSpacing: '0.15em' }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: T.warn, boxShadow: `0 0 0 4px rgba(${T.warnRgb},0.12), 0 0 14px rgba(${T.warnRgb},0.55)` }}
                      />
                      Payout transaction
                    </div>
                    <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ fontFamily: T.sans, color: T.text3 }}>
                      <span className="h-[5px] w-[5px] rounded-full" style={{ background: T.ok, boxShadow: `0 0 8px rgba(${T.okRgb},0.5)` }} />
                      <b className="font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                        {money2(Math.max(openProfit, 0))}
                      </b>
                      available
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[145px_1fr_180px_140px]">
                  <div
                    className="flex h-[58px] items-center gap-2.5 whitespace-nowrap rounded-[14px] px-4 text-[13px] font-semibold"
                    style={{
                      background: `linear-gradient(145deg, rgba(${T.warnRgb},0.09), rgba(255,255,255,0.012))`,
                      border: `1px solid rgba(${T.warnRgb},0.22)`,
                      fontFamily: T.sans,
                    }}
                  >
                    <ArrowDownToLine size={17} strokeWidth={1.8} style={{ color: T.warn, opacity: 0.9 }} />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase" style={{ color: T.text4, letterSpacing: '0.1em' }}>
                        Transaction
                      </span>
                      <span style={{ color: T.text2 }}>Payout</span>
                    </div>
                  </div>

                  <div
                    className="ad-field ad-field--warn relative flex h-[58px] items-center rounded-[14px] px-4"
                    style={{
                      background: 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))',
                      border: `1px solid ${T.line}`,
                    }}
                  >
                    <span className="mr-2 text-[16px] font-semibold" style={{ fontFamily: T.mono, color: T.warn }}>
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !busy && !isClosed && submit()}
                      disabled={isClosed}
                      placeholder="Amount"
                      className="h-full w-full bg-transparent text-[14px] font-medium tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      style={{ color: T.text, fontFamily: T.sans }}
                    />
                  </div>

                  <DateField
                    value={when}
                    onChange={setWhen}
                    align="right"
                    lang="en"
                    height={58}
                    alwaysNumeric
                    accent={T.warn}
                    accentRgb={T.warnRgb}
                    accentBorder={`rgba(${T.warnRgb},0.5)`}
                    hoverBorder={`rgba(${T.warnRgb},0.32)`}
                  />

                  <button
                    onClick={submit}
                    disabled={busy || isClosed}
                    className="ad-payout-cta relative flex h-[58px] items-center justify-center gap-2 overflow-hidden rounded-[14px] text-[15px] font-black uppercase"
                    style={{
                      fontFamily: T.sans,
                      letterSpacing: '0.04em',
                      color: '#16120a',
                      opacity: busy ? 0.7 : 1,
                    }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {busy
                        ? <Loader2 size={18} className="animate-spin" />
                        : <><Check size={18} strokeWidth={3} /> Log it</>}
                    </span>
                  </button>
                </div>

                {openProfit > 0 && !isClosed && (
                  <button
                    onClick={() => setAmount(String(Math.round(openProfit * 100) / 100))}
                    className="-mt-1.5 w-fit rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors duration-200"
                    style={{ background: T.surface, border: `1px dashed ${T.lineHi}`, color: T.text3, fontFamily: T.sans }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = T.warn; e.currentTarget.style.borderColor = `rgba(${T.warnRgb},0.4)`; e.currentTarget.style.background = `rgba(${T.warnRgb},0.07)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.background = T.surface; }}
                  >
                    Full profit — {money2(openProfit)}
                  </button>
                )}

                <div className="flex items-start gap-2.5 pt-3.5 text-[12.5px] leading-relaxed" style={{ borderTop: `1px solid ${T.line}`, fontFamily: T.sans }}>
                  <button
                    onClick={() => setNoteOpen((v) => !v)}
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase transition-colors duration-200"
                    style={{
                      letterSpacing: '0.07em',
                      background: noteOpen ? `rgba(${T.warnRgb},0.1)` : `rgba(${T.warnRgb},0.045)`,
                      border: `1px solid rgba(${T.warnRgb},0.16)`,
                      color: T.warn,
                    }}
                  >
                    {noteOpen ? '− note' : '+ note'}
                  </button>
                  <span style={{ color: T.text3 }}>
                    Balance goes down, stays in history — up to{' '}
                    <b className="font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                      {money2(Math.max(openProfit, 0))}
                    </b>{' '}
                    available
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {noteOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <div className="ad-field ad-field--warn rounded-xl" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
                        <input
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !busy && !isClosed && submit()}
                          placeholder="Note (optional)"
                          className="h-11 w-full bg-transparent px-3.5 text-[14px] outline-none"
                          style={{ color: T.text, fontFamily: T.sans }}
                        />
                      </div>
                      <div className="mt-1.5 text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Just a label for this movement — press Enter or hit «Log it» to save it together with the amount.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6">

            {/* ─────────── Chart + quick stats ─────────── */}
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
              <div
                className="ad-tile relative overflow-hidden rounded-2xl px-4 py-3.5"
                style={{ '--hue': openProfit >= 0 ? T.okRgb : T.badRgb, background: T.surface, border: `1px solid ${T.line}` }}
              >
                <div className="relative z-10">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Balance curve
                      </span>
                      <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        every point is a movement
                      </span>
                    </div>
                    <div className="flex gap-1 rounded-lg p-1" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                      {[['all', 'All'], ['30d', '30d']].map(([k, l]) => {
                        const on = chartRange === k;
                        return (
                          <button
                            key={k}
                            onClick={() => setChartRange(k)}
                            className="rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors duration-150"
                            style={{
                              fontFamily: T.sans,
                              background: on ? `rgba(${T.accRgb},0.14)` : 'transparent',
                              color: on ? T.acc : T.text3,
                            }}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {loading ? <Skeleton h={206} className="border-0" /> : <BalanceChart events={chartEvents} initial={initial} />}

                  {!loading && chartSummary && (
                    <div
                      className="mt-1 flex items-center gap-4 pt-3"
                      style={{ borderTop: `1px solid ${T.line}` }}
                    >
                      <span className="flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Peak
                        <b className="text-[12.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2, fontWeight: 700 }}>
                          {money(chartSummary.peak)}
                        </b>
                      </span>
                      <span className="h-3 w-px" style={{ background: T.line }} />
                      <span className="flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Low
                        <b className="text-[12.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2, fontWeight: 700 }}>
                          {money(chartSummary.low)}
                        </b>
                      </span>
                      <span className="h-3 w-px" style={{ background: T.line }} />
                      <span className="flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Span
                        <b className="text-[12.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2, fontWeight: 700 }}>
                          {chartSummary.days}d
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 grid-rows-2 gap-2.5">
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
                      icon={TrendingDown}
                      hue={T.warnRgb}
                      label="Drawdown"
                      value={`${drawdownPct.toFixed(1)}%`}
                      hint="from peak balance"
                      tone={drawdownPct > 0 ? T.warn : T.text4}
                    />
                  </>
                )}
              </div>
            </div>

            {/* ─────────── History ─────────── */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 pb-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <h3 className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                <Trophy size={12.5} strokeWidth={2.3} style={{ color: T.warn }} /> Account history
                {!loading && <span style={{ color: T.text4, opacity: 0.7 }}>· {events.length}</span>}
              </h3>
              <div className="flex gap-1 rounded-lg p-1" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                {[['all', 'All'], ['payout', 'Payouts'], ['deposit', 'Deposits'], ['adjust', 'Adjustments']].map(([k, l]) => {
                  const on = histFilter === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setHistFilter(k)}
                      className="whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors duration-150"
                      style={{ fontFamily: T.sans, background: on ? `rgba(${T.accRgb},0.14)` : 'transparent', color: on ? T.acc : T.text3 }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 pb-2">
              {loading ? (
                [0, 1].map((i) => <Skeleton key={i} h={68} />)
              ) : filteredHistory.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Nothing here yet.
                </p>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredHistory.map((e) => {
                    const isPayout = e.kind === 'payout';
                    const tone = isPayout ? T.warn : e.kind === 'deposit' ? T.info : T.text3;
                    const hue = isPayout ? T.warnRgb : T.accRgb;

                    return (
                      <motion.div
                        key={e.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="ad-row group relative flex items-center gap-3.5 overflow-hidden rounded-2xl px-4 py-3"
                        style={{ '--hue': hue, background: T.surface, border: `1px solid ${T.line}` }}
                      >

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
                        {!isClosed && e.id === lastId && e.kind !== 'start' && (
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
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
