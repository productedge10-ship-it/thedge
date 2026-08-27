import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Building2, Loader2, Check, Trash2, Lock,
  TrendingUp, TrendingDown,
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

const fmtDayShort = (iso) => {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

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

  /* Дельта від попередньої точки по кожному запису — рахуємо тут раз,
     а не гадаємо по kind: withdrawn завжди мінус, а прибуток/збиток
     від угоди залежить від того, вгору чи вниз пішов баланс. */
  const history = useMemo(() => {
    const rev = [...events].reverse();
    return rev.map((e, i) => {
      const prev = rev[i + 1];
      const delta = e.kind === 'start' ? null : e.balance_after - (prev ? Number(prev.balance_after) : initial);
      return { ...e, delta };
    });
  }, [events, initial]);
  const lastId = events.length ? events[events.length - 1].id : null;
  const filteredHistory = useMemo(
    () => (histFilter === 'all' ? history : history.filter((e) => e.kind === histFilter)),
    [history, histFilter],
  );

  /* Групи по місяцях — рядки під заголовком з назвою місяця. */
  const historyGroups = useMemo(() => {
    const out = [];
    filteredHistory.forEach((e) => {
      const d = new Date(`${String(e.happened_at).slice(0, 10)}T12:00:00`);
      const key = isNaN(d) ? 'Unknown' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
      let g = out[out.length - 1];
      if (!g || g.key !== key) { g = { key, rows: [] }; out.push(g); }
      g.rows.push(e);
    });
    return out;
  }, [filteredHistory]);

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
    return { peak, low, days, count: chartEvents.length, firstDate: first };
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

        /* Рядок у боковій панелі графіка (Peak/Win rate/Net R/
           Drawdown) — тихо світлішає під курсором, як у макеті. */
        .ad-tile-row { transition: background-color .2s ease; }
        .ad-tile-row:hover { background-color: rgba(255,255,255,0.022); }

        /* Рядок історії — легкий фіолетовий градієнт, тонке кільце
           всередині і зсув вправо на 3px, як у макеті. */
        .ad-hist-row {
          transition: background .22s ease, box-shadow .22s ease, transform .22s ease;
        }
        .ad-hist-row:hover {
          background: linear-gradient(90deg, rgba(${T.accRgb},0.07) 0%, rgba(255,255,255,0.02) 45%, rgba(255,255,255,0) 100%);
          box-shadow: inset 0 0 0 1px ${T.lineHi};
          transform: translateX(3px);
        }

        /* ─────────── Панель виплати: тонка градієнтна рамка навколо
           темної картки й повільний відблиск, що пропливає по ній
           раз на кілька секунд — «преміальна» картка ─────────── */
        .ad-payout-frame {
          background: linear-gradient(140deg,
            rgba(${T.accRgb},0.6) 0%, rgba(${T.accRgb},0.1) 32%,
            rgba(255,255,255,0.05) 60%, rgba(${T.accRgb},0.3) 100%);
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
          color: ${T.text3};
          box-shadow: none;
          cursor: not-allowed;
        }

        .ad-quick-pick:hover:not(:disabled) { border-color: ${T.lineAcc} !important; color: ${T.acc} !important; }

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
            <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: isClosed ? T.text3 : T.ok }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: isClosed ? T.text3 : T.ok, boxShadow: isClosed ? 'none' : `0 0 8px ${T.ok}` }} />
              {isClosed ? 'Closed' : 'Active'}
              <span style={{ color: T.text3 }}>· {money(initial)} account</span>
              {isClosed && acc.closed_reason && <span style={{ color: T.text3 }}>· {acc.closed_reason}</span>}
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
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
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
                        color: on ? T.bad : T.text2,
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
                  style={{ fontFamily: T.sans, color: T.text3 }}
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Withdrawn
              </p>
              <span
                className="text-[32px] font-semibold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: totalPaid ? T.warn : T.text, letterSpacing: '-0.03em' }}
              >
                {money2(totalPaid)}
              </span>
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {payouts.length ? `${payouts.length} payout${payouts.length === 1 ? '' : 's'}` : 'none yet'}
              </span>
            </div>
            <div className="flex flex-col gap-2 px-5 py-5 sm:px-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Total earned
              </p>
              <span
                className="text-[32px] font-semibold tabular-nums leading-none sm:text-[38px]"
                style={{ fontFamily: T.display, color: earned >= 0 ? T.acc : T.bad, letterSpacing: '-0.03em' }}
              >
                {money(earned)}
              </span>
              <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
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
                <div className="relative z-10 flex flex-col gap-4">
                  {isClosed ? (
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                      <Lock size={13} strokeWidth={2.3} /> Account is closed — nothing can be logged anymore
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: T.acc }} />
                      <span className="text-[10.5px] font-bold uppercase" style={{ fontFamily: T.sans, color: T.acc, letterSpacing: '0.2em' }}>
                        Payout
                      </span>
                      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, rgba(${T.accRgb},0.3), transparent)` }} />
                      <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
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
                      <span className="text-[18px] font-semibold" style={{ fontFamily: T.mono, color: T.text2 }}>
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
                          style={{ color: T.text3 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
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
                              color: active ? T.acc : T.text2,
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
                        <span className="text-[10px] font-semibold uppercase" style={{ fontFamily: T.sans, color: T.text3, letterSpacing: '0.13em' }}>
                          Balance after
                        </span>
                        <span className="text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                          {money2(hasAmount && !overLimit ? balance - rawAmount : balance)}
                        </span>
                      </div>
                      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase" style={{ fontFamily: T.sans, color: T.text3, letterSpacing: '0.13em' }}>
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
                          <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
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

            {/* ─────────── Chart + side stats — 1:1 з макетом ─────────── */}
            <div
              className="relative -mx-4 mb-5 overflow-hidden sm:-mx-6"
              style={{
                background: `
                  radial-gradient(70% 90% at 10% 0%, rgba(${T.accRgb},0.16) 0%, rgba(10,10,12,0) 60%),
                  radial-gradient(55% 70% at 100% 100%, rgba(${T.okRgb},0.09) 0%, rgba(10,10,12,0) 58%),
                  radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
                  linear-gradient(180deg, ${T.surfaceHi} 0%, ${T.bg} 100%)`,
                backgroundSize: 'auto, auto, 22px 22px, auto',
                borderTop: `1px solid ${T.line}`,
                borderBottom: `1px solid ${T.line}`,
              }}
            >
              <div className="flex flex-wrap items-end justify-between gap-6 px-4 pt-[26px] sm:px-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-[22px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                    Balance curve
                  </h3>
                  <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {loading
                      ? 'every point is a movement'
                      : chartSummary
                        ? `${chartSummary.count} movement${chartSummary.count === 1 ? '' : 's'} since ${fmtDayShort(chartSummary.firstDate)} · hover the line for details`
                        : 'every point is a movement'}
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
                          color: on ? T.acc : T.text2,
                        }}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 items-stretch gap-0 lg:grid-cols-[1fr_260px]" style={{ borderTop: `1px solid ${T.line}` }}>
                <div className="flex flex-col justify-center px-4 pb-4 pt-[18px] sm:px-6 lg:border-r" style={{ borderColor: T.line }}>
                  {loading ? <Skeleton h={264} className="border-0" /> : <BalanceChart events={chartEvents} initial={initial} />}
                </div>

                <div style={{ background: `linear-gradient(180deg, rgba(${T.accRgb},0.06) 0%, rgba(10,10,12,0) 55%)` }}>
                  {loading ? (
                    <div className="flex flex-col gap-2.5 p-4">
                      {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={58} />)}
                    </div>
                  ) : (
                    [
                      { label: 'Peak', value: money(chartSummary?.peak ?? initial), color: T.text, hint: 'highest balance' },
                      {
                        label: 'Win rate',
                        value: stats.total ? `${stats.winrate}%` : '—',
                        color: stats.total ? T.ok : T.text2,
                        hint: stats.total ? `${stats.wins} of ${stats.total} closed green` : 'nothing in journal yet',
                      },
                      {
                        label: 'Net R',
                        value: stats.total ? `${stats.netR > 0 ? '+' : ''}${stats.netR}R` : '—',
                        color: stats.total ? T.acc : T.text2,
                        hint: 'risk-adjusted result',
                      },
                      {
                        label: 'Drawdown',
                        value: `${drawdownPct.toFixed(1)}%`,
                        color: drawdownPct > 0 ? T.bad : T.text2,
                        hint: 'from peak balance',
                      },
                    ].map((t) => (
                      <div
                        key={t.label}
                        className="ad-tile-row flex flex-col justify-center gap-1.5 px-4 py-4 sm:px-6"
                        style={{ borderBottom: `1px solid ${T.line}` }}
                      >
                        <span className="flex items-center gap-2">
                          <span className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: t.color }} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.15em]" style={{ fontFamily: T.sans, color: T.text2 }}>
                            {t.label}
                          </span>
                        </span>
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="text-[22px] font-semibold leading-none tabular-nums" style={{ fontFamily: T.mono, color: t.color, letterSpacing: '-0.02em' }}>
                            {t.value}
                          </span>
                          <span className="truncate text-right text-[11.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                            {t.hint}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ─────────── History — 1:1 з макетом ─────────── */}
          <div
            className="relative -mx-4 px-4 pb-7 pt-6 sm:-mx-6 sm:px-6"
            style={{ background: `radial-gradient(80% 120% at 100% 0%, rgba(${T.accRgb},0.06) 0%, rgba(10,10,12,0) 60%)` }}
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-5">
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
                  History
                </h3>
                <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {loading ? '' : `${filteredHistory.length} ${filteredHistory.length === 1 ? 'entry' : 'entries'} · newest first`}
                </span>
              </div>
              <div className="flex shrink-0 gap-[3px] rounded-[10px] p-[3px]" style={{ background: T.bg, border: `1px solid ${T.line}` }}>
                {[['all', 'All'], ['payout', 'Payouts'], ['trade', 'Profit']].map(([k, l]) => {
                  const on = histFilter === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setHistFilter(k)}
                      className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150"
                      style={{ fontFamily: T.sans, background: on ? `rgba(${T.accRgb},0.16)` : 'transparent', color: on ? T.acc : T.text2 }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[0, 1].map((i) => <Skeleton key={i} h={68} />)}
              </div>
            ) : filteredHistory.length === 0 ? (
              <p className="py-6 text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Nothing here yet.
              </p>
            ) : (
              <div className="flex flex-col gap-[18px]">
                {historyGroups.map((g) => (
                  <div key={g.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-3 px-2.5 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        {g.key}
                      </span>
                      <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
                    </div>

                    <AnimatePresence initial={false}>
                      {g.rows.map((e) => {
                        const isStart = e.kind === 'start';
                        const isPayout = e.kind === 'payout';
                        const isLoss = !isStart && !isPayout && (e.delta || 0) < 0;

                        let glyph = '•';
                        let color = T.text3;
                        let chipBg = 'rgba(255,255,255,0.07)';
                        let tag = 'start';
                        if (isPayout) { glyph = '↓'; color = T.acc; chipBg = `rgba(${T.accRgb},0.15)`; tag = 'payout'; }
                        else if (e.kind === 'trade') {
                          glyph = isLoss ? '↓' : '↑'; color = isLoss ? T.bad : T.ok;
                          chipBg = isLoss ? `rgba(${T.badRgb},0.13)` : `rgba(${T.okRgb},0.13)`;
                          tag = isLoss ? 'loss' : 'profit';
                        } else if (e.kind === 'deposit') { glyph = '+'; color = T.info; chipBg = `rgba(${T.infoRgb},0.13)`; tag = 'deposit'; }
                        else if (e.kind === 'adjust') { glyph = '='; color = T.text2; chipBg = T.surfaceHi; tag = 'adjust'; }

                        return (
                          <motion.div
                            key={e.id}
                            layout
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                            transition={{ duration: 0.22, ease: EASE }}
                            className="ad-hist-row group relative flex items-center justify-between gap-4 rounded-2xl py-3 pl-3 pr-11"
                          >
                            <span className="flex min-w-0 items-center gap-3.5">
                              <span
                                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px] text-[15px] font-semibold"
                                style={{ color, background: chipBg }}
                              >
                                {glyph}
                              </span>
                              <span className="flex min-w-0 flex-col gap-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="text-[14.5px] font-medium" style={{ fontFamily: T.sans, color: T.text }}>
                                    {KINDS_EN[e.kind]?.label || e.kind}
                                  </span>
                                  <span
                                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                                    style={{ color, background: chipBg }}
                                  >
                                    {tag}
                                  </span>
                                </span>
                                <span className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                                  {fmtDay(e.happened_at)}{e.note ? ` · ${e.note}` : ''}
                                </span>
                              </span>
                            </span>

                            <span className="text-[14.5px] font-medium tabular-nums" style={{ fontFamily: T.mono, color, letterSpacing: '-0.02em' }}>
                              {isStart ? money2(e.balance_after) : `${(e.delta || 0) >= 0 ? '+' : '−'}${money2(Math.abs(e.delta || 0))}`}
                            </span>

                            {/* Undo лише для останньої події — інакше
                                баланси всіх наступних стали б брехнею.
                                Абсолютно позиційована в кутку, а не в
                                ряд із сумою — інакше сума їздила туди-
                                сюди щоразу, як кнопка зʼявлялась. */}
                            {!isClosed && e.id === lastId && !isStart && (
                              <button
                                onClick={() => undo(e)}
                                disabled={busy}
                                title="Undo last movement"
                                className="absolute right-2 top-2 grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                style={{ color: T.bad, background: `rgba(${T.badRgb},0.12)` }}
                              >
                                <Trash2 size={12} strokeWidth={2.2} />
                              </button>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
