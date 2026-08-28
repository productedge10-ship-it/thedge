import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Wallet, Plus, Trash2, X, Activity,
  Loader2, Pencil, Trophy, ArrowDownToLine, TrendingUp, TrendingDown, ArrowRight, Archive, Lock,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import { T } from '../lib/theme';
import { money, money2 } from '../lib/accountsStore';
import { supabase as sb } from '../lib/supabase';
import AccountDetails from '../components/accounts/AccountDetails';
import useEmailGate from '../hooks/useEmailGate';

const PREDEFINED_FIRMS = [
  'FTMO', 'Funding Pips', 'Topstep', 'The Funded Trader', 
  'FundedNext', 'MyFundedFX', 'Personal'
];


// Прив'язка фірм до їхніх доменів для завантаження реальних логотипів
const FIRM_DOMAINS = {
  'FTMO': 'ftmo.com',
  'FUNDING PIPS': 'fundingpips.com',
  'TOPSTEP': 'topstep.com',
  'THE FUNDED TRADER': 'thefundedtraderpt.com',
  'FUNDEDNEXT': 'fundednext.com',
  'MYFUNDEDFX': 'myfundedfx.com'
};

// Швидкі баланси для вибору
const QUICK_BALANCES = [10000, 25000, 50000, 100000, 200000];

/* Рамка-«рідина» на ховері: лінія стартує рівно з центру верхнього
   краю і обтікає весь периметр по колу назад у ту саму точку.
   Шлях будується по реальних пропорціях картки (ResizeObserver), але
   сам SVG намальований через CSS width/height:100% + preserveAspectRatio
   "none" — тобто малюнок ЗАВЖДИ розтягується рівно по картці, навіть
   якщо виміряні пропорції трохи неточні. Раніше SVG мав фіксовані
   пікселі width/height — будь-яка похибка вимірювання одразу давала
   маленький прямокутник в кутку картки замість повного контуру. */
function useBoxRatio(active) {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 100, h: 100 });
  useEffect(() => {
    if (!active) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);
  return [ref, size];
}

function topCenterRoundedRectPath(w, h, r) {
  const x0 = 1, y0 = 1, x1 = w - 1, y1 = h - 1;
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const cx = w / 2;
  return `M ${cx} ${y0}
    L ${x1 - rr} ${y0} A ${rr} ${rr} 0 0 1 ${x1} ${y0 + rr}
    L ${x1} ${y1 - rr} A ${rr} ${rr} 0 0 1 ${x1 - rr} ${y1}
    L ${x0 + rr} ${y1} A ${rr} ${rr} 0 0 1 ${x0} ${y1 - rr}
    L ${x0} ${y0 + rr} A ${rr} ${rr} 0 0 1 ${x0 + rr} ${y0}
    L ${cx} ${y0}`;
}

function AccCard({ children, hue = T.accRgb, onClick, hoverable = false, className = '', style, ...rest }) {
  const [boxRef, { w, h }] = useBoxRatio(!!onClick);
  const path = topCenterRoundedRectPath(w, h, 16);
  const soft = !onClick && hoverable;

  return (
    <motion.div
      ref={boxRef}
      onClick={onClick}
      whileHover={onClick ? { y: -4 } : soft ? { y: -2 } : undefined}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`acc-card group relative overflow-hidden rounded-2xl ${onClick ? 'acc-card--live cursor-pointer' : ''} ${soft ? 'acc-card--soft' : ''} ${className}`}
      style={{ '--hue': hue, border: `1px solid ${T.line}`, ...style }}
      {...rest}
    >
      {onClick && (
        <svg
          className="acc-liquid-svg absolute inset-0 h-full w-full"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d={path} pathLength="100" className="acc-liquid-soft" vectorEffect="non-scaling-stroke" />
          <path d={path} pathLength="100" className="acc-liquid-main" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {children}
    </motion.div>
  );
}

export default function Accounts() {
  const { user } = useAuth();
  /* Створювати акаунти можна лише з підтвердженою поштою. Кнопка
     лишається клікабельною — guard покаже пояснення замість мовчазної
     відмови. */
  const { guard } = useEmailGate();

  const [accounts, setAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newFirm, setNewFirm] = useState('');
  const [newBalance, setNewBalance] = useState('');
  /* Ліміти проп-фірми — просто зберігаємо, як каже кабінет пропа
     (FTMO і подібні: 5% денний, 10% загальний). Нікуди не рахується
     автоматично, це майданчик під майбутню перевірку. */
  const [newDailyLoss, setNewDailyLoss] = useState('');
  const [newTotalLoss, setNewTotalLoss] = useState('');

  const [selectedAcc, setSelectedAcc] = useState(null);
  /* «Архів» тут — це вигляд екрана, не окреме поле в БД: перемикає,
     які акаунти показує сітка — активні чи закриті. */
  const [showArchive, setShowArchive] = useState(false);

  const submitBtnRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!submitBtnRef.current) return;
    const rect = submitBtnRef.current.getBoundingClientRect();
    submitBtnRef.current.style.setProperty('--x', `${e.clientX - rect.left}px`);
    submitBtnRef.current.style.setProperty('--y', `${e.clientY - rect.top}px`);
  };

  useEffect(() => { if (user?.id) fetchAccounts(); /* eslint-disable-next-line */ }, [user?.id]);

  async function fetchAccounts() {
    setLoading(true);
    try {
      /* Виплати тягнемо одразу за всіма акаунтами — з них рахується
         головна цифра сторінки: скільки грошей уже виведено. */
      const [accRes, payRes] = await Promise.all([
        supabase.from('prop_accounts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('account_events').select('account_id, amount, happened_at').eq('user_id', user.id).eq('kind', 'payout'),
      ]);

      if (accRes.error) throw accRes.error;
      setAccounts(accRes.data || []);
      if (!payRes.error) setPayouts(payRes.data || []);
    } catch (error) {
      notify.error('Could not load accounts', error.message);
    } finally {
      setLoading(false);
    }
  }

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setNewFirm(''); setNewBalance(''); setNewDailyLoss(''); setNewTotalLoss(''); };
  const openAddModal = () => { setEditingId(null); setNewFirm(''); setNewBalance(''); setNewDailyLoss(''); setNewTotalLoss(''); setIsModalOpen(true); };
  const openEditModal = (e, acc) => {
    e.stopPropagation();
    setEditingId(acc.id);
    setNewFirm(acc.firm_name);
    setNewBalance(acc.balance);
    setNewDailyLoss(acc.max_daily_loss_pct ?? '');
    setNewTotalLoss(acc.max_total_loss_pct ?? '');
    setIsModalOpen(true);
  };
  async function handleSubmitAccount(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const riskFields = {
        max_daily_loss_pct: newDailyLoss === '' ? null : Number(newDailyLoss),
        max_total_loss_pct: newTotalLoss === '' ? null : Number(newTotalLoss),
      };
      if (editingId) {
        const { data, error } = await supabase.from('prop_accounts').update({ firm_name: newFirm, balance: Number(newBalance), ...riskFields }).eq('id', editingId).select();
        if (error) throw error;
        if (data && data.length > 0) {
          setAccounts(accounts.map(acc => acc.id === editingId ? data[0] : acc));
          closeModal();
        }
      } else {
        /* initial_balance фіксується один раз при створенні: саме до
           нього повертається рахунок після виплати прибутку */
        const { data, error } = await supabase
          .from('prop_accounts')
          .insert([{ firm_name: newFirm, balance: Number(newBalance), initial_balance: Number(newBalance), status: 'Active', ...riskFields }])
          .select();
        if (error) throw error;
        if (data && data.length > 0) {
          setAccounts([data[0], ...accounts]);
          closeModal();
        }
      }
    } catch (error) { notify.error('Save failed', error.message); } finally { setIsSubmitting(false); }
  }

  async function deleteAccount(e, id) {
    e.stopPropagation();
    if (!confirm("Delete this account for good? Its whole payout history goes with it.")) return;
    try {
      const { error } = await supabase.from('prop_accounts').delete().eq('id', id);
      if (error) throw error;
      setAccounts(accounts.filter(a => a.id !== id));
    } catch (error) { notify.error('Delete failed', error.message); }
  }

  const patchAccount = (next) => {
    setAccounts((list) => list.map((a) => (a.id === next.id ? { ...a, ...next } : a)));
    setSelectedAcc((cur) => (cur && cur.id === next.id ? { ...cur, ...next } : cur));
    /* виплати могли змінитись — перечитаємо суму по всіх акаунтах */
    sb.from('account_events').select('account_id, amount, happened_at')
      .eq('user_id', user.id).eq('kind', 'payout')
      .then(({ data }) => data && setPayouts(data));
  };

  const formatBalance = money;

  /* Закритий акаунт — це архів: ховається з активної сітки й зі
     статистики капіталу (баланс закритого акаунта більше не «в
     роботі»), але лишається в списку — просто за перемикачем. */
  const activeAccounts = useMemo(() => accounts.filter((a) => a.status !== 'Closed'), [accounts]);
  const closedAccounts = useMemo(() => accounts.filter((a) => a.status === 'Closed'), [accounts]);

  const totals = useMemo(() => {
    const activeIds = new Set(activeAccounts.map((a) => a.id));
    const activePayouts = payouts.filter((p) => activeIds.has(p.account_id));
    const capital = activeAccounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const size = activeAccounts.reduce((s, a) => s + Number(a.initial_balance ?? a.balance ?? 0), 0);
    const paid = activePayouts.reduce((s, p) => s + Number(p.amount || 0), 0);
    const byAcc = {};
    payouts.forEach((p) => { byAcc[p.account_id] = (byAcc[p.account_id] || 0) + Number(p.amount || 0); });
    return { capital, size, paid, open: capital - size, byAcc, payoutsCount: activePayouts.length };
  }, [activeAccounts, payouts]);

  const shownAccounts = showArchive ? closedAccounts : activeAccounts;

  const noSpinnerClass = "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]";

return (
  <div className="min-h-screen w-full relative">
    {/* Фон тут більше не свій: крапкова підкладка йде з Layout, і
        сторінка нарешті стоїть на тому самому тлі, що решта сайту. */}
    <style>{`
      .acc-card {
        --hue: ${T.accRgb};
        background-color: rgba(255,255,255,0.014);
      }

      /* Ховер картки акаунта: рамка тепліє, тінь густішає, картка
         ледь підіймається (робить motion), і за нею проявляється
         м'яке фіолетове сяйво — того ж кольору, що ховер і акценти
         сторінки. box-shadow не обрізається власним overflow-hidden
         картки, тому сяйво спокійно виходить за її межі. */
      .acc-card--live {
        transition: border-color .3s ease, box-shadow .45s ease, background-color .3s ease;
      }
      .acc-card--live:hover {
        border-color: rgba(var(--hue), 0.32);
        background-color: rgba(255,255,255,0.024);
        box-shadow:
          0 16px 32px -18px rgba(0,0,0,0.55),
          0 0 70px -18px rgba(139,123,255,0.45),
          0 0 130px -30px rgba(139,123,255,0.28);
      }
      /* SVG завжди розтягнутий рівно по картці (width/height:100% +
         preserveAspectRatio="none"), тому лінія ніколи не обрізається,
         навіть якщо виміряні пропорції для viewBox трохи неточні.
         Стартує з центру верхнього краю (шлях побудований так у JS)
         і «витікає» по периметру назад у ту саму точку. */
      .acc-liquid-svg { overflow: visible; }
      .acc-liquid-main {
        fill: none;
        stroke: #8b7bff;
        stroke-width: 1.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 0 100;
        opacity: 0;
        filter:
          drop-shadow(0 0 4px rgba(139,123,255,.9))
          drop-shadow(0 0 10px rgba(139,123,255,.5))
          drop-shadow(0 0 20px rgba(139,123,255,.22));
        transition: stroke-dasharray 1.1s ease, opacity .35s ease;
      }
      .acc-liquid-soft {
        fill: none;
        stroke: rgba(139,123,255,.22);
        stroke-width: 3.5;
        stroke-linecap: round;
        stroke-dasharray: 0 100;
        opacity: 0;
        filter: blur(5px);
        transition: stroke-dasharray 1.1s ease, opacity .9s ease;
      }
      .acc-card--live:hover .acc-liquid-main,
      .acc-card--live:hover .acc-liquid-soft {
        opacity: 1;
        stroke-dasharray: 100 0;
      }

      /* Кнопка «Add Account» — без анімації: статична рамка того ж
         фіолетового, що раніше було обертовим акцентом, і мінімальний
         ховер (рамка й тло ледь світлішають). */
      .acc-add-btn {
        background: #17151f;
        border: 1px solid rgba(139,123,255,0.5);
        transition: background-color .2s ease, border-color .2s ease;
      }
      .acc-add-btn:hover {
        background: #1c1a26;
        border-color: rgba(139,123,255,0.85);
      }

      /* Кнопка «Archive» — та сама скляна панель, що інші преміальні
         блоки: градієнтне тло, іконка в колі, м'який ховер. */
      .acc-archive-btn {
        transition: border-color .25s ease, background-color .25s ease, color .25s ease;
      }
      .acc-archive-btn:hover {
        border-color: rgba(139,123,255,0.4) !important;
        color: var(--edge-text2, #B4B4BD) !important;
      }
      .acc-archive-icon {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 9px;
        background: rgba(139,123,255,0.1);
        transition: background-color .25s ease;
      }

      /* Ховер на плашках статистики — без обводки-рідини, але
         помітніший: тепла рамка, легка тінь у кольорі картки й
         іконка + число трохи виступають. */
      .acc-card--soft {
        transition: border-color .3s ease, background-color .3s ease, box-shadow .3s ease;
      }
      .acc-card--soft:hover {
        border-color: rgba(var(--hue), 0.4);
        background-color: rgba(255,255,255,0.028);
        box-shadow: 0 14px 30px -18px rgba(var(--hue), 0.55), 0 2px 8px -4px rgba(0,0,0,0.4);
      }
      .acc-card--soft .acc-soft-icon { transition: transform .3s cubic-bezier(.22,1,.36,1); }
      .acc-card--soft:hover .acc-soft-icon { transform: scale(1.12); }
      .acc-card--soft .acc-soft-value { transition: transform .3s cubic-bezier(.22,1,.36,1); }
      .acc-card--soft:hover .acc-soft-value { transform: translateX(2px); }

      /* «Details» — маленька пігулка замість голого слова зі
         стрілкою: стрілка трохи їде вперед при наведенні. */
      .acc-details-chip svg { transition: transform .2s ease; }
      .group:hover .acc-details-chip svg { transform: translateX(2px); }
    `}</style>

    {/* ГОЛОВНИЙ КОНТЕЙНЕР (Каскадна анімація появи всього контенту) */}
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.05, delayChildren: 0.02 }
        }
      }}
      className="w-full max-w-[1600px] mx-auto pb-24 pt-5 sm:pb-32 sm:pt-8 relative z-[10] font-sans text-[#B4B4BD] px-4 sm:px-6 md:px-10"
    >
      
      {/* ХЕДЕР ТА КНОПКА */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
          visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: "easeOut" } }
        }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8"
      >
        <div className="min-w-0">
          <div
            className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]"
            style={{ fontFamily: "'Roboto', system-ui, sans-serif", color: 'var(--edge-acc, #8b7bff)' }}
          >
            Capital
          </div>
          <h1
            className="text-[34px] font-bold leading-none sm:text-[42px]"
            style={{ fontFamily: "'Roboto', system-ui, sans-serif", color: 'var(--edge-text, #FAFAFA)', letterSpacing: '-0.03em' }}
          >
            Accounts
          </h1>
          <p className="mt-2.5 text-[14px]" style={{ fontFamily: "'Roboto', system-ui, sans-serif", color: 'var(--edge-text3, #7A7A85)' }}>
            How much capital is at work and how it's behaving
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <button
            onClick={() => setShowArchive((v) => !v)}
            className="acc-archive-btn inline-flex h-[54px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-2xl pl-2.5 pr-5 text-[14px] font-bold"
            style={{
              background: showArchive
                ? 'linear-gradient(145deg, rgba(139,123,255,0.16), rgba(139,123,255,0.05))'
                : 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))',
              border: `1px solid ${showArchive ? 'rgba(139,123,255,0.45)' : 'var(--edge-line, #232328)'}`,
              color: showArchive ? 'var(--edge-acc, #8b7bff)' : 'var(--edge-text3, #7A7A85)',
              fontFamily: T.sans,
            }}
          >
            <span className="acc-archive-icon">
              <Archive size={13.5} strokeWidth={2.4} style={{ color: 'var(--edge-acc, #8b7bff)' }} />
            </span>
            {showArchive ? 'Back to accounts' : 'Archive'}
            {!showArchive && closedAccounts.length > 0 && (
              <span
                className="grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold"
                style={{ background: 'rgba(139,123,255,0.18)', color: 'var(--edge-acc, #8b7bff)' }}
              >
                {closedAccounts.length}
              </span>
            )}
          </button>

          <button
            onClick={guard(openAddModal)}
            className="acc-add-btn ml-1 inline-flex h-[54px] shrink-0 items-center justify-center gap-2 rounded-2xl px-6 text-[14.5px] font-bold"
            style={{ color: '#fff', fontFamily: T.sans }}
          >
            <Plus size={16} strokeWidth={3} className="shrink-0" style={{ color: '#8b7bff' }} />
            <span className="whitespace-nowrap">Add Account</span>
          </button>
        </div>
      </motion.div>

      {/* СТАТИСТИКА */}
      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.04 } }
        }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
      >
        {[
          {
            label: 'Total capital', icon: Wallet, hue: T.accRgb, color: T.text,
            value: formatBalance(totals.capital),
          },
          {
            label: 'Account size', icon: Activity, hue: '110,168,254', color: T.text2,
            value: formatBalance(totals.size),
          },
          {
            label: 'Unwithdrawn profit', icon: TrendingUp, hue: T.okRgb,
            color: totals.open >= 0 ? T.ok : T.bad,
            value: `${totals.open >= 0 ? '+' : '−'}${formatBalance(Math.abs(totals.open))}`,
          },
          {
            label: 'Withdrawn', icon: Trophy, hue: T.warnRgb,
            color: totals.paid ? T.warn : T.text4,
            value: formatBalance(totals.paid),
          },
        ].map((k) => (
          <motion.div key={k.label} variants={{ hidden: { opacity: 0, y: 15, filter: "blur(4px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)" } }}>
            <AccCard hue={k.hue} hoverable className="h-full p-5">
              <div className="relative z-10 mb-3.5 flex items-center gap-2">
                <k.icon size={14} strokeWidth={2.2} className="acc-soft-icon" style={{ color: `rgb(${k.hue})` }} />
                <p className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {k.label}
                </p>
              </div>
              <p className="acc-soft-value relative z-10 text-[27px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: k.color, letterSpacing: '-0.02em' }}>
                {k.value}
              </p>
            </AccCard>
          </motion.div>
        ))}
      </motion.div>

      {/* КАРТКИ ОРГАНІЗАЦІЙ */}
      <motion.div
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
        }}
      >
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="animate-spin text-[#4A4A52]" size={40} /></div>
        ) : shownAccounts.length === 0 ? (
          <motion.div
            variants={{ hidden: { opacity: 0, scale: 0.96 }, visible: { opacity: 1, scale: 1 } }}
            className="flex flex-col items-center justify-center py-32 bg-[var(--edge-surface)]/60 backdrop-blur-sm border border-dashed border-[#33333A] rounded-[2rem]"
          >
            <Building2 className="text-[#4A4A52] mb-4 opacity-50" size={48} />
            <p className="text-[#7A7A85] font-black text-xs uppercase tracking-widest">
              {showArchive ? 'No closed accounts' : 'No accounts yet'}
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {shownAccounts.map((acc) => {
                const size = Number(acc.initial_balance ?? acc.balance) || 0;
                const bal = Number(acc.balance) || 0;
                const open = bal - size;
                const paid = totals.byAcc[acc.id] || 0;
                /* Прогрес до типової цілі пропа — 10% від розміру
                   рахунку, рахується сама, нічого не вводиться. */
                const goalPct = 10;
                const goal = size * (goalPct / 100);
                const rawPct = goal > 0 ? (open / goal) * 100 : 0;
                const pct = Math.max(0, Math.min(100, rawPct));
                /* Колір смужки міняється по дорозі до цілі: щойно
                   почав — червоний, на півдорозі — жовтий, ближче до
                   кінця (80%+) — зелений. */
                const goalHue = rawPct >= 80 ? T.okRgb : rawPct >= 33 ? T.warnRgb : T.badRgb;
                const goalColor = rawPct >= 80 ? T.ok : rawPct >= 33 ? T.warn : T.bad;
                const isClosed = acc.status === 'Closed';
                const hue = isClosed ? '242,244,243' : open >= 0 ? T.okRgb : T.badRgb;

                return (
                  <motion.div
                    key={acc.id}
                    layout
                    initial={{ opacity: 0, y: 16, filter: "blur(5px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.95, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <AccCard hue={hue} onClick={() => setSelectedAcc(acc)} className="flex h-full flex-col gap-5 p-6" style={{ opacity: isClosed ? 0.72 : 1 }}>
                      {isClosed && (
                        <span
                          className="absolute right-5 top-5 z-20 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.08em]"
                          style={{
                            background: 'rgba(10,10,12,0.85)',
                            border: `1px solid rgba(${T.badRgb},0.4)`,
                            color: T.bad,
                            fontFamily: T.sans,
                            backdropFilter: 'blur(6px)',
                          }}
                        >
                          <Lock size={11} strokeWidth={2.6} /> Closed
                        </span>
                      )}
                      <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                          >
                            <Building2 size={21} strokeWidth={2} style={{ color: isClosed ? T.text4 : T.acc }} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
                              {acc.firm_name}
                            </h3>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ fontFamily: T.sans, color: isClosed ? T.text4 : T.ok }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: isClosed ? T.text4 : T.ok, boxShadow: isClosed ? 'none' : `0 0 8px ${T.ok}` }} />
                              {isClosed ? 'Closed' : 'Active'}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <button
                            onClick={(e) => openEditModal(e, acc)}
                            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
                            style={{ border: `1px solid ${T.line}`, color: T.text4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
                          >
                            <Pencil size={13} strokeWidth={2.2} />
                          </button>
                          <button
                            onClick={(e) => deleteAccount(e, acc.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
                            style={{ border: `1px solid ${T.line}`, color: T.text4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
                          >
                            <Trash2 size={13} strokeWidth={2.2} />
                          </button>
                        </div>
                      </div>

                      <div
                        className="relative z-10 overflow-hidden rounded-2xl px-4 py-3.5"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: `1px solid ${T.line}`,
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                            Current balance
                          </p>
                          {open !== 0 && (
                            <span
                              className="flex items-center gap-1 text-[12px] font-bold tabular-nums"
                              style={{ fontFamily: T.mono, color: open >= 0 ? T.ok : T.bad }}
                            >
                              {open >= 0 ? <TrendingUp size={12} strokeWidth={2.8} /> : <TrendingDown size={12} strokeWidth={2.8} />}
                              {open >= 0 ? '+' : '−'}{Math.abs(size) > 0 ? Math.round((Math.abs(open) / size) * 1000) / 10 : 0}%
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                          <h2 className="text-[32px] font-bold tabular-nums" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}>
                            {money2(bal)}
                          </h2>
                          {open !== 0 && (
                            <span className="text-[13px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: open >= 0 ? T.ok : T.bad }}>
                              {open >= 0 ? '+' : '−'}{money(Math.abs(open))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Прогрес до типової цілі пропа — 10% від
                          розміру рахунку, рахується сама. Колір
                          показує, наскільки близько: щойно почав —
                          червоний, на півдорозі — жовтий, 80%+ —
                          зелений. */}
                      <div className="relative z-10 mt-auto">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[12px] font-semibold" style={{ fontFamily: T.sans }}>
                          <span className="uppercase tracking-[0.09em]" style={{ color: T.text4 }}>
                            To {goalPct}% goal · {money(goal)}
                          </span>
                          <span className="uppercase tracking-[0.05em]" style={{ color: goalColor }}>
                            {Math.round(pct)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: T.sunken }}>
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            style={{ background: `rgb(${goalHue})` }}
                          />
                        </div>

                        <div className="mt-3.5 flex items-center justify-between gap-3 pt-3.5" style={{ borderTop: `1px solid ${T.line}` }}>
                          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: paid ? T.acc : T.text4 }}>
                            <ArrowDownToLine size={12.5} strokeWidth={2.4} />
                            {paid ? `withdrawn ${money(paid)}` : 'no payouts yet'}
                          </span>
                          <span
                            className="acc-details-chip flex items-center gap-1 text-[12.5px] font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                            style={{ fontFamily: T.sans, color: T.acc }}
                          >
                            Details
                            <ArrowRight size={12.5} strokeWidth={2.6} />
                          </span>
                        </div>
                      </div>
                    </AccCard>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.div>

    {/* МОДАЛКА: ДОДАВАННЯ / РЕДАГУВАННЯ */}
    <AnimatePresence>
      {isModalOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-md" 
          onClick={closeModal}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 15, filter: "blur(4px)" }} 
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }} 
            exit={{ opacity: 0, scale: 0.96, y: 15, filter: "blur(4px)" }} 
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--edge-surface)] border border-[#232328] w-full max-w-xl rounded-2xl shadow-2xl relative overflow-hidden"
          >
            {/* Хедер модалки */}
            <div className="flex justify-between items-center px-6 py-5 border-b border-[#232328] bg-[var(--edge-sunken)]">
              <h2 className="text-sm font-bold text-[var(--edge-text)] uppercase tracking-wider flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#8b7bff] shadow-[0_0_10px_rgba(139,123,255,0.6)]"></span>
                {editingId ? 'Edit account' : 'New account'}
              </h2>
              <button 
                onClick={closeModal} 
                className="text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors bg-[var(--edge-sunken)] hover:bg-[var(--edge-surface-hi)] p-2.5 rounded-xl border border-[#232328]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Форма */}
            <form onSubmit={handleSubmitAccount} className="p-6 flex flex-col gap-8">
              
              {/* Секція: Вибір Фірми */}
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-black tracking-widest text-[#7A7A85] uppercase">
                  Choose a firm
                </label>
                
                <div className="grid grid-cols-3 gap-2.5">
                  {PREDEFINED_FIRMS.map((firm, idx) => {
                    const isSelected = newFirm?.toUpperCase() === firm.toUpperCase();
                    const domain = FIRM_DOMAINS[firm.toUpperCase()];
                    
                    return (
                      <motion.button 
                        key={firm}
                        initial={{ opacity: 0, y: 8, filter: "blur(2px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ delay: 0.04 + idx * 0.03, ease: "easeOut" }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        type="button" 
                        onClick={() => setNewFirm(firm)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors duration-300 group text-left ${
                          isSelected 
                            ? 'bg-[#8b7bff]/10 border-[#8b7bff]/40 shadow-[0_0_20px_rgba(139,123,255,0.05)]' 
                            : 'bg-[#111218] border-[#232328] hover:border-white/15'
                        }`}
                      >
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-white flex items-center justify-center shrink-0 border border-[#232328] relative">
                          {domain ? (
                            <img 
                              src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} 
                              alt={firm} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <Building2 size={12} className="text-[#7A7A85]" style={{ display: domain ? 'none' : 'flex' }} />
                        </div>
                        <span className={`text-xs font-black tracking-wide leading-tight transition-colors ${isSelected ? 'text-[#a99bff]' : 'text-[#B4B4BD] group-hover:text-[var(--edge-text)]'}`}>
                          {firm}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Ручне введення назви */}
                <div className="relative group mt-1">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                    <AnimatePresence mode="wait">
                      {newFirm && FIRM_DOMAINS[newFirm.toUpperCase()] ? (
                        <motion.div
                          key={`logo-${FIRM_DOMAINS[newFirm.toUpperCase()]}`}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="w-full h-full rounded-sm bg-white overflow-hidden flex items-center justify-center absolute shadow-sm"
                        >
                          <img 
                            src={`https://www.google.com/s2/favicons?domain=${FIRM_DOMAINS[newFirm.toUpperCase()]}&sz=32`} 
                            alt={newFirm} 
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.parentNode.style.display = 'none';
                            }}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="default-building-icon"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="w-full h-full flex items-center justify-center absolute"
                        >
                          <Building2 size={16} className="text-[#7A7A85] group-focus-within:text-[#a99bff] transition-colors duration-300" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <input 
                    type="text" 
                    required 
                    placeholder="Or type custom firm name..." 
                    value={newFirm} 
                    onChange={(e) => setNewFirm(e.target.value)} 
                    className="w-full bg-[#111218] border border-[#232328] focus:border-[#8b7bff]/40 pl-11 pr-4 py-3.5 rounded-xl text-sm text-[var(--edge-text)] outline-none font-medium transition-all duration-300 placeholder:text-[#4A4A52] focus:bg-[#14151C]" 
                  />
                </div>
              </div>

              {/* Секція: Баланс */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black tracking-widest text-[#7A7A85] uppercase">
                    Account Size
                  </label>
                </div>
                
                {/* Швидкі кнопки балансу */}
                <div className="grid grid-cols-5 gap-2">
                  {QUICK_BALANCES.map((amount, idx) => {
                    const isSelected = Number(newBalance) === amount;
                    return (
                      <motion.button
                        key={amount}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.08 + idx * 0.02, ease: "easeOut" }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        type="button"
                        onClick={() => setNewBalance(amount.toString())}
                        className={`py-2.5 rounded-lg text-[11px] font-bold tracking-wider transition-colors duration-300 border ${
                          isSelected
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                            : 'bg-[#111218] text-[#7A7A85] border-[#232328] hover:border-white/15 hover:text-[#B4B4BD]'
                        }`}
                      >
                        ${amount >= 1000 ? `${amount / 1000}k` : amount}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Основний інпут балансу */}
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-mono font-bold text-lg select-none">
                    $
                  </div>
                  <input 
                    type="number" 
                    required 
                    min="0" 
                    placeholder="100000" 
                    value={newBalance} 
                    onChange={(e) => setNewBalance(e.target.value)} 
                    className={`w-full bg-[#0D0E13] border border-[#232328] group-focus-within:border-emerald-500/40 pl-9 pr-4 py-4 rounded-xl text-xl text-emerald-400 outline-none font-mono font-bold transition-all duration-300 placeholder:text-[#4A4A52] shadow-inner shadow-black/50 ${noSpinnerClass}`}
                  />
                </div>
              </div>

              {/* Секція: Ліміти проп-фірми — просто зберігаємо, як у
                  кабінеті брокера (FTMO і подібні: 5% денний, 10%
                  загальний). Поки що ніде не рахується автоматично. */}
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-black tracking-widest text-[#7A7A85] uppercase">
                  Risk limits <span className="normal-case font-medium tracking-normal text-[#4A4A52]">(optional, from your prop's rules)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative group">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="5"
                      value={newDailyLoss}
                      onChange={(e) => setNewDailyLoss(e.target.value)}
                      className={`w-full bg-[#111218] border border-[#232328] focus:border-[#8b7bff]/40 pl-4 pr-9 py-3.5 rounded-xl text-sm text-[var(--edge-text)] outline-none font-mono font-bold transition-all duration-300 placeholder:text-[#4A4A52] placeholder:font-normal ${noSpinnerClass}`}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4A4A52]">% / day</span>
                  </div>
                  <div className="relative group">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="10"
                      value={newTotalLoss}
                      onChange={(e) => setNewTotalLoss(e.target.value)}
                      className={`w-full bg-[#111218] border border-[#232328] focus:border-[#8b7bff]/40 pl-4 pr-9 py-3.5 rounded-xl text-sm text-[var(--edge-text)] outline-none font-mono font-bold transition-all duration-300 placeholder:text-[#4A4A52] placeholder:font-normal ${noSpinnerClass}`}
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4A4A52]">% total</span>
                  </div>
                </div>
              </div>

              {/* ПРЕМІАЛЬНА КНОПКА (Фіксована висота та жорстке центрування тексту) */}
              <motion.button 
                ref={submitBtnRef}
                onMouseMove={handleMouseMove}
                whileTap={{ scale: 0.98 }}
                type="submit" 
                disabled={isSubmitting} 
                className="relative overflow-hidden w-full mt-2 h-[52px] bg-[#111218] border border-[#232328] rounded-xl transition-all duration-300 shadow-[0_4px_25px_rgba(0,0,0,0.7)] flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none group"
              >
                <div 
                  className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-xl"
                  style={{
                    background: `radial-gradient(180px circle at var(--x, 0px) var(--y, 0px), rgba(139,123,255, 0.18) 0%, rgba(139,123,255, 0.06) 45%, transparent 80%)`
                  }}
                />
                
                <div className="relative z-10 flex items-center justify-center h-full w-full pointer-events-none">
                  {isSubmitting ? (
                    <Loader2 size={18} className="animate-spin text-[#8b7bff]" />
                  ) : (
                    <span className="text-[#7A7A85] font-sans font-medium uppercase tracking-[0.25em] text-[10.5px] leading-none group-hover:text-[var(--edge-text)] transition-colors duration-300 drop-shadow-[0_0_12px_rgba(139,123,255,0.15)]">
                      {editingId ? 'Save Configuration' : 'Create Prop Account'}
                    </span>
                  )}
                </div>
              </motion.button>

            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ─────────── ДЕТАЛКА АКАУНТА ─────────── */}
    <AnimatePresence>
      {selectedAcc && (
        <AccountDetails
          key={selectedAcc.id}
          account={selectedAcc}
          onClose={() => setSelectedAcc(null)}
          onUpdate={patchAccount}
        />
      )}
    </AnimatePresence>
  </div>
);
}