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
          className="truncate text-[11px] font-semibold uppercase tracking-[0.13em]"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          {label}
        </span>
      </div>
      <div
        className="relative z-10 text-[22px] font-semibold tabular-nums"
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

  /* Похідні від поля суми — для quick-picks, смуги «частка від
     доступного» і стану кнопки в панелі виплати. */
  const rawAmount = parseFloat(String(amount).replace(',', '.'));
  const hasAmount = !isNaN(rawAmount) && rawAmount > 0;
  const overLimit = hasAmount && rawAmount > Math.max(openProfit, 0);

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
        kind: 'payout', amount: value, happened_at: when, note: '',
      });
      setEvents((list) => [...list, event]);
      onUpdate(next);
      setAmount('');
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

        /* ─────────── Панель виплати: тонка градієнтна рамка навколо
           темної картки й повільний відблиск, що пропливає по ній
           раз на кілька секунд — «преміальна» картка ─────────── */
        .ad-payout-frame {
          background: linear-gradient(140deg,
            rgba(${T.accRgb},0.6) 0%, rgba(${T.accRgb},0.1) 32%,
            rgba(255,255,255,0.05) 60%, rgba(${T.accRgb},0.3) 100%);
        }
        .ad-payout-sheen {
          position: absolute;
          inset: 0 auto 0 0;
          width: 40%;
          background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.05) 50%, transparent 100%);
          animation: ad-payout-sheen-move 7s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes ad-payout-sheen-move {
          0% { transform: translateX(-120%); }
          55%, 100% { transform: translateX(240%); }
        }
        .ad-payout-ping {
          animation: ad-payout-pulse 2.8s ease-out infinite;
        }
        @keyframes ad-payout-pulse {
          0% { opacity: .55; transform: scale(1); }
          70%, 100% { opacity: 0; transform: scale(2.6); }
        }

        /* Кнопка «Log payout» — скляна пігулка: ледь тонований
           фіолетовий, тонка рамка, розмиття позаду. На ховері тло і
           рамка яскравіють, зʼявляється сяйво й легкий підйом. */
        .ad-payout-cta {
          background: rgba(${T.accRgb},0.08);
          color: #c4b5fd;
          border: 1px solid rgba(${T.accRgb},0.4);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition: background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, transform .2s ease;
        }
        .ad-payout-cta:hover:not(:disabled) {
          background: rgba(${T.accRgb},0.18);
          color: #fff;
          border-color: rgba(${T.accRgb},0.8);
          box-shadow: 0 0 20px rgba(${T.accRgb},0.3);
          transform: translateY(-2px);
        }
        .ad-payout-cta:active:not(:disabled) { transform: translateY(0); }
        .ad-payout-cta:disabled {
          background: ${T.surfaceHi};
          border-color: ${T.line};
          color: ${T.text4};
          box-shadow: none;
          cursor: not-allowed;
        }

        .ad-quick-pick:hover:not(:disabled) { border-color: ${T.lineAcc} !important; color: ${T.acc} !important; }

        @media (prefers-reduced-motion: reduce) {
          .ad-payout-sheen, .ad-payout-ping { animation: none; }
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
          .ad-skeleton::after { animation: none; transition: none; }
        }
      `}</style>

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.985 }}
        transition={SPRING}
        /* max-h, а не h: вікно росте під висоту вмісту (короткій
           історії не лишає порожнечі знизу), і лише впирається у
           стелю 94vh на великих екранах, де вмісту справді багато —
           тоді вже вмикається внутрішня прокрутка тіла. */
        className="flex max-h-[94vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-3xl"
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
        {/*
          grid-template-rows 0fr → 1fr замість framer height:'auto' —
          той спосіб вимірював висоту вручну й одного разу обрізав
          панель, коли зовнішнє вікно стало max-h. Цей трюк суто CSS:
          браузер сам плавно інтерполює висоту без жодного виміру,
          тому зламатись так само вже не може, і водночас це
          виглядає як «висувається», а не просто проявляється. */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{
            gridTemplateRows: closePanel ? '1fr' : '0fr',
            borderBottom: closePanel ? `1px solid ${T.line}` : 'none',
            background: `rgba(${T.badRgb},0.04)`,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className="flex flex-col gap-3 px-5 py-4 transition-opacity duration-200 sm:px-7"
              style={{ opacity: closePanel ? 1 : 0, transitionDelay: closePanel ? '80ms' : '0ms' }}
            >
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.bad }}>
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
          </div>
        </div>

        {/* ─────────── Body ─────────── */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">

          {/* Balance / Withdrawn / Earned — three equal columns, the
              headline numbers of the account in one glance. */}
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7" style={{ borderRight: `1px solid ${T.line}` }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Current balance
              </p>
              <span
                className="text-[32px] font-semibold tabular-nums leading-none sm:text-[38px]"
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Withdrawn
              </p>
              <span
                className="text-[32px] font-semibold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: totalPaid ? T.warn : T.text, letterSpacing: '-0.03em' }}
              >
                {money2(totalPaid)}
              </span>
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {payouts.length ? `${payouts.length} payout${payouts.length === 1 ? '' : 's'}` : 'none yet'}
              </span>
            </div>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Total earned
              </p>
              <span
                className="text-[32px] font-semibold tabular-nums leading-none sm:text-[38px]"
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
              className="ad-payout-frame relative rounded-[20px] p-px"
              style={{ boxShadow: '0 26px 60px -34px rgba(139,123,255,0.5)', opacity: isClosed ? 0.5 : 1, pointerEvents: isClosed ? 'none' : 'auto' }}
            >
              <div
                className="ad-payout relative overflow-hidden rounded-[19px] p-5"
                style={{ background: 'linear-gradient(180deg, #14141c 0%, #0d0d11 100%)' }}
              >
                <span aria-hidden className="ad-payout-sheen" />

                <div className="relative z-10 flex flex-col gap-4">
                  {isClosed ? (
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text4 }}>
                      <Lock size={13} strokeWidth={2.3} /> Account is closed — nothing can be logged anymore
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="relative grid h-2 w-2 place-items-center">
                        <span className="absolute h-2 w-2 rounded-full" style={{ background: T.acc }} />
                        <span className="ad-payout-ping absolute h-2 w-2 rounded-full" style={{ background: T.acc }} />
                      </span>
                      <span className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.sans, color: T.acc, letterSpacing: '0.2em' }}>
                        Payout
                      </span>
                      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, rgba(${T.accRgb},0.3), transparent)` }} />
                      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        available{' '}
                        <b className="font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                          {money2(Math.max(openProfit, 0))}
                        </b>
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[minmax(240px,1.4fr)_auto_auto] sm:items-stretch">
                    <div
                      className="ad-field relative flex h-[48px] items-center gap-3 rounded-[15px] px-5"
                      style={{ background: T.bg, border: `1px solid ${T.line}` }}
                    >
                      <span className="text-[18px] font-semibold" style={{ fontFamily: T.mono, color: T.text4 }}>
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
                        placeholder="0.00"
                        className="h-full w-full bg-transparent text-[20px] font-semibold tabular-nums outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        style={{ color: T.text, fontFamily: T.mono, letterSpacing: '-0.02em' }}
                      />
                      {amount && (
                        <button
                          type="button"
                          onClick={() => setAmount('')}
                          aria-label="Clear"
                          className="shrink-0 rounded-lg p-1 transition-colors"
                          style={{ color: T.text4 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
                        >
                          <X size={14} strokeWidth={2.4} />
                        </button>
                      )}
                    </div>

                    <DateField
                      value={when}
                      onChange={setWhen}
                      align="right"
                      lang="en"
                      height={48}
                      monthStyle="short"
                      quickPicks
                      fontSize={14.5}
                      fontWeight={600}
                    />

                    <button
                      onClick={submit}
                      disabled={busy || isClosed || !hasAmount || overLimit}
                      className="ad-payout-cta relative flex h-[48px] min-w-[122px] items-center justify-center gap-1.5 self-center overflow-hidden rounded-xl px-4 text-[12.5px] font-semibold"
                      style={{ fontFamily: T.sans, opacity: busy ? 0.7 : 1 }}
                    >
                      <span className="relative z-10 flex items-center gap-1.5">
                        {busy
                          ? <Loader2 size={14} className="animate-spin" />
                          : <><Check size={14} strokeWidth={2.8} /> Log payout</>}
                      </span>
                    </button>
                  </div>

                  {!isClosed && (
                    <div className="flex flex-wrap items-center gap-2.5">
                      {[25, 50, 100].map((pct) => {
                        const amt = Math.round((Math.max(openProfit, 0) * pct) / 100 * 100) / 100;
                        const active = hasAmount && Math.abs(rawAmount - amt) < 0.005;
                        return (
                          <button
                            key={pct}
                            onClick={() => setAmount(amt.toFixed(2))}
                            disabled={amt <= 0}
                            className="ad-quick-pick rounded-full px-3 py-1.5 text-[12px] font-semibold tabular-nums transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              fontFamily: T.mono,
                              background: active ? `rgba(${T.accRgb},0.12)` : 'transparent',
                              border: `1px solid ${active ? T.lineAcc : T.line}`,
                              color: active ? T.acc : T.text3,
                            }}
                          >
                            {pct === 100 ? 'Max' : `${pct}%`}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {!isClosed && (
                    <div className="flex flex-wrap items-start gap-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex min-w-[120px] flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase" style={{ fontFamily: T.sans, color: T.text4, letterSpacing: '0.13em' }}>
                          Balance after
                        </span>
                        <span className="text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                          {money2(hasAmount && !overLimit ? balance - rawAmount : balance)}
                        </span>
                      </div>
                      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase" style={{ fontFamily: T.sans, color: T.text4, letterSpacing: '0.13em' }}>
                          {hasAmount && !overLimit ? `Share of available · ${Math.round((rawAmount / (openProfit || 1)) * 100)}%` : 'Share of available'}
                        </span>
                        <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: T.sunken }}>
                          <motion.span
                            className="block h-full rounded-full"
                            style={{ background: 'linear-gradient(90deg, #5a4fd6 0%, #a99bff 100%)' }}
                            initial={false}
                            animate={{ width: `${hasAmount && !overLimit && openProfit > 0 ? Math.min(rawAmount / openProfit, 1) * 100 : 0}%` }}
                            transition={{ duration: 0.25, ease: EASE }}
                          />
                        </span>
                        {overLimit ? (
                          <span className="flex items-center gap-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.bad }}>
                            <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: T.bad }} />
                            Over the balance — up to{' '}
                            <b className="font-bold tabular-nums" style={{ fontFamily: T.mono }}>{money2(Math.max(openProfit, 0))}</b>{' '}
                            can be paid out
                          </span>
                        ) : (
                          <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                            {hasAmount
                              ? 'Balance goes down, the payout stays in history'
                              : <>Balance goes down, stays in history — up to <b className="font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>{money2(Math.max(openProfit, 0))}</b> available</>}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6">

            {/* ─────────── Chart + quick stats ─────────── */}
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
              <div
                className="ad-tile relative overflow-hidden rounded-[18px] px-[22px] pb-4 pt-5"
                style={{
                  '--hue': openProfit >= 0 ? T.okRgb : T.badRgb,
                  background: `linear-gradient(180deg, ${T.surfaceHi} 0%, ${T.surface} 100%)`,
                  border: `1px solid ${T.line}`,
                }}
              >
                <div className="relative z-10">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Balance curve
                      </span>
                      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        every point is a movement
                      </span>
                    </div>
                    <div className="flex shrink-0 gap-[3px] rounded-[10px] p-[3px]" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
                      {[['all', 'All'], ['30d', '30d']].map(([k, l]) => {
                        const on = chartRange === k;
                        return (
                          <button
                            key={k}
                            onClick={() => setChartRange(k)}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150"
                            style={{
                              fontFamily: T.sans,
                              background: on ? `rgba(${T.accRgb},0.16)` : 'transparent',
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
                        <b className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                          {money(chartSummary.peak)}
                        </b>
                      </span>
                      <span className="h-3 w-px" style={{ background: T.line }} />
                      <span className="flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Low
                        <b className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
                          {money(chartSummary.low)}
                        </b>
                      </span>
                      <span className="h-3 w-px" style={{ background: T.line }} />
                      <span className="flex items-baseline gap-1.5 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Span
                        <b className="text-[12.5px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>
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
              <h3 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
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
                            <span className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
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
