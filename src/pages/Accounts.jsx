import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Wallet, Plus, Trash2, X, Activity,
  Loader2, Pencil, Trophy, ArrowDownToLine, TrendingUp, ArrowRight,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { notify } from '../utils/notify';
import { T } from '../lib/theme';
import { money, money2 } from '../lib/accountsStore';
import { supabase as sb } from '../lib/supabase';
import AccountDetails from '../components/accounts/AccountDetails';

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

/* Ховер зроблено як у колекційної картки: фольга, що ловить світло
   під кутом, різкий блік під самим курсором і неонова кромка. Блок
   при цьому не рухається — рух завжди читається як затримка.

   Усе на CSS-змінних, які пишемо прямо у вузол повз React: браузер
   малює це на композиторі, тому світло не відстає від миші. */
function track(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;

  el.style.setProperty('--mx', `${x}px`);
  el.style.setProperty('--my', `${y}px`);
  /* 0…1 по кожній осі — зсув фольги */
  el.style.setProperty('--px', (x / r.width).toFixed(3));
  el.style.setProperty('--py', (y / r.height).toFixed(3));
  /* кут від центру — нахил бліку */
  const ang = (Math.atan2(y - r.height / 2, x - r.width / 2) * 180) / Math.PI;
  el.style.setProperty('--ang', ang.toFixed(1));
}

function AccCard({ children, hue = T.accRgb, onClick, className = '', ...rest }) {
  return (
    <motion.div
      onClick={onClick}
      onPointerMove={track}
      className={`acc-card group relative overflow-hidden rounded-2xl ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ '--hue': hue, border: `1px solid ${T.line}` }}
      {...rest}
    >
      <span aria-hidden className="acc-grid" />
      <span aria-hidden className="acc-foil" />
      <span aria-hidden className="acc-gloss" />
      <span aria-hidden className="acc-bloom" />
      <span aria-hidden className="acc-spec" />
      <span aria-hidden className="acc-edge" />
      <span aria-hidden className="acc-tick acc-tick-tl" />
      <span aria-hidden className="acc-tick acc-tick-tr" />
      <span aria-hidden className="acc-tick acc-tick-bl" />
      <span aria-hidden className="acc-tick acc-tick-br" />
      {children}
    </motion.div>
  );
}

export default function Accounts() {
  const { user } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newFirm, setNewFirm] = useState('');
  const [newBalance, setNewBalance] = useState('');

  const [selectedAcc, setSelectedAcc] = useState(null);

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
      notify.error('Не вдалось завантажити акаунти', error.message);
    } finally {
      setLoading(false);
    }
  }

  const closeModal = () => { setIsModalOpen(false); setEditingId(null); setNewFirm(''); setNewBalance(''); };
  const openAddModal = () => { setEditingId(null); setNewFirm(''); setNewBalance(''); setIsModalOpen(true); };
  const openEditModal = (e, acc) => { 
    e.stopPropagation(); 
    setEditingId(acc.id); 
    setNewFirm(acc.firm_name); 
    setNewBalance(acc.balance); 
    setIsModalOpen(true); 
  };
  async function handleSubmitAccount(e) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        const { data, error } = await supabase.from('prop_accounts').update({ firm_name: newFirm, balance: Number(newBalance) }).eq('id', editingId).select();
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
          .insert([{ firm_name: newFirm, balance: Number(newBalance), initial_balance: Number(newBalance), status: 'Active' }])
          .select();
        if (error) throw error;
        if (data && data.length > 0) {
          setAccounts([data[0], ...accounts]);
          closeModal();
        }
      }
    } catch (error) { notify.error('Помилка при збереженні', error.message); } finally { setIsSubmitting(false); }
  }

  async function deleteAccount(e, id) {
    e.stopPropagation();
    if (!confirm("Точно видалити цей акаунт? Разом з ним зникне вся історія виплат.")) return;
    try {
      const { error } = await supabase.from('prop_accounts').delete().eq('id', id);
      if (error) throw error;
      setAccounts(accounts.filter(a => a.id !== id));
    } catch (error) { notify.error('Помилка при видаленні', error.message); }
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

  const totals = useMemo(() => {
    const capital = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const size = accounts.reduce((s, a) => s + Number(a.initial_balance ?? a.balance ?? 0), 0);
    const paid = payouts.reduce((s, p) => s + Number(p.amount || 0), 0);
    const byAcc = {};
    payouts.forEach((p) => { byAcc[p.account_id] = (byAcc[p.account_id] || 0) + Number(p.amount || 0); });
    return { capital, size, paid, open: capital - size, byAcc };
  }, [accounts, payouts]);

  const noSpinnerClass = "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]";

return (
  <div className="min-h-screen w-full relative">
    {/* Фон тут більше не свій: крапкова підкладка йде з Layout, і
        сторінка нарешті стоїть на тому самому тлі, що решта сайту. */}
    <style>{`
      /* ==========================================================
         Картка акаунта.

         Шари знизу вгору: сітка → голографічна фольга → скляний
         блиск → внутрішнє світло → різкий блік → неонова кромка →
         кутові засічки. Кожен окремо ледь помітний, разом дають
         відчуття, що поверхня має товщину і ловить світло.
      ========================================================== */
      .acc-card {
        --mx: 50%;
        --my: 50%;
        --px: .5;
        --py: .5;
        --ang: 0;
        --hue: ${T.accRgb};
        isolation: isolate;
        background-color: rgba(255,255,255,0.014);
        transition: background-color .4s ease, box-shadow .5s ease, border-color .4s ease;
      }
      .acc-card:hover {
        background-color: rgba(255,255,255,0.03);
        border-color: rgba(var(--hue), 0.22) !important;
        box-shadow:
          0 0 0 1px rgba(var(--hue), 0.10),
          0 34px 70px -40px rgba(var(--hue), 0.75),
          0 16px 36px -28px rgba(0,0,0,0.92);
      }

      .acc-grid, .acc-foil, .acc-gloss, .acc-bloom, .acc-spec, .acc-edge {
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
      }

      /* Тонка сітка — поверхня, а не порожнеча */
      .acc-grid {
        background:
          linear-gradient(rgba(255,255,255,.014) 1px, transparent 1px) 0 0 / 100% 26px,
          linear-gradient(90deg, rgba(255,255,255,.014) 1px, transparent 1px) 0 0 / 26px 100%;
        opacity: .8;
      }

      /* Голографічна фольга. Смуги їдуть за курсором, але тримаються
         ледь помітно: райдуга на весь блок відволікала від цифр,
         а це картка з грошима, а не наліпка. Тому вузька маска,
         приглушена яскравість і низька непрозорість — ефект видно
         краєм ока, читати він не заважає. */
      .acc-foil {
        background: repeating-linear-gradient(112deg,
          rgba(255,119,115,.55) 4%,
          rgba(255,237,95,.5) 9%,
          rgba(168,255,95,.5) 14%,
          rgba(131,255,247,.5) 19%,
          rgba(120,148,255,.5) 24%,
          rgba(216,117,255,.55) 29%,
          rgba(255,119,115,.55) 34%);
        background-size: 320% 320%;
        background-position: calc(var(--px) * 120%) calc(var(--py) * 120%);
        /* screen, а не color-dodge: dodge на майже чорному тлі дає
           майже чорне — фольга просто не з'явилась би */
        mix-blend-mode: screen;
        filter: brightness(.22) saturate(1.1);
        -webkit-mask: radial-gradient(190px circle at var(--mx) var(--my), #000 0%, rgba(0,0,0,.3) 40%, transparent 62%);
        mask: radial-gradient(190px circle at var(--mx) var(--my), #000 0%, rgba(0,0,0,.3) 40%, transparent 62%);
        opacity: 0;
        transition: opacity .45s ease;
      }
      .acc-card:hover .acc-foil { opacity: calc(.34 * var(--edge-fx, 1)); }

      /* Замість діагональної смуги — фаска по верхній кромці, що
         ловить світло рівно там, де курсор. Смуга через увесь блок
         читалась як зайвий предмет поверх картки; фаска читається
         як край самої поверхні. */
      .acc-gloss {
        inset: 0 0 auto 0;
        height: 1px;
        border-radius: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.5), transparent);
        -webkit-mask: radial-gradient(170px circle at var(--mx) 0, #000 0%, transparent 72%);
        mask: radial-gradient(170px circle at var(--mx) 0, #000 0%, transparent 72%);
        opacity: 0;
        transition: opacity .35s ease;
      }
      .acc-card:hover .acc-gloss { opacity: calc(1 * var(--edge-fx, 1)); }

      /* Внутрішнє світло у кольорі стану акаунта */
      .acc-bloom {
        background: radial-gradient(280px circle at var(--mx) var(--my),
          rgba(var(--hue), .12), transparent 62%);
        opacity: 0;
        transition: opacity .35s ease;
      }
      .acc-card:hover .acc-bloom { opacity: calc(1 * var(--edge-fx, 1)); }

      /* Різкий блік просто під курсором — крапка, від якої все
         й здається мокрим */
      .acc-spec {
        background: radial-gradient(70px circle at var(--mx) var(--my),
          rgba(255,255,255,.16), transparent 70%);
        opacity: 0;
        transition: opacity .25s ease;
      }
      .acc-card:hover .acc-spec { opacity: calc(1 * var(--edge-fx, 1)); }

      /* Неонова кромка. Маска лишає від градієнта тільки рамку в
         один піксель, тому світиться саме контур. */
      .acc-edge {
        padding: 1px;
        background: radial-gradient(220px circle at var(--mx) var(--my),
          rgba(var(--hue), 1), rgba(var(--hue), .3) 34%, transparent 68%);
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        opacity: 0;
        transition: opacity .3s ease;
      }
      .acc-card:hover .acc-edge { opacity: calc(1 * var(--edge-fx, 1)); }

      /* Кутові засічки — приціл, що зводиться на картці */
      .acc-tick {
        position: absolute;
        width: 12px;
        height: 12px;
        pointer-events: none;
        border: 1.5px solid rgba(var(--hue), .8);
        opacity: 0;
        transition: opacity .3s ease, transform .38s cubic-bezier(.22,1,.36,1);
      }
      .acc-tick-tl { top: 8px; left: 8px;    border-right: 0; border-bottom: 0; border-radius: 5px 0 0 0; transform: translate(-6px,-6px); }
      .acc-tick-tr { top: 8px; right: 8px;   border-left: 0;  border-bottom: 0; border-radius: 0 5px 0 0; transform: translate(6px,-6px); }
      .acc-tick-bl { bottom: 8px; left: 8px; border-right: 0; border-top: 0;    border-radius: 0 0 0 5px; transform: translate(-6px,6px); }
      .acc-tick-br { bottom: 8px; right: 8px;border-left: 0;  border-top: 0;    border-radius: 0 0 5px 0; transform: translate(6px,6px); }
      .acc-card:hover .acc-tick { opacity: 1; transform: translate(0,0); }

      @media (prefers-reduced-motion: reduce) {
        .acc-tick { transition: opacity .2s ease; }
      }
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
            Капітал
          </div>
          <h1
            className="text-[34px] font-bold leading-none sm:text-[42px]"
            style={{ fontFamily: "'Roboto', system-ui, sans-serif", color: 'var(--edge-text, #FAFAFA)', letterSpacing: '-0.03em' }}
          >
            Акаунти
          </h1>
          <p className="mt-2.5 text-[14px]" style={{ fontFamily: "'Roboto', system-ui, sans-serif", color: 'var(--edge-text3, #7A7A85)' }}>
            Скільки капіталу під керуванням і як він поводиться
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="group inline-flex h-[46px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
          style={{
            background: 'var(--edge-acc, #8b7bff)',
            color: 'var(--edge-bg, #0A0A0C)',
            fontFamily: "'Roboto', system-ui, sans-serif",
            boxShadow: '0 6px 18px -8px rgba(139,123,255,0.6)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 10px 26px -8px rgba(139,123,255,0.75)')}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 6px 18px -8px rgba(139,123,255,0.6)')}
        >
          <Plus size={17} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
          Додати акаунт
        </button>
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
            label: 'Всього капіталу', icon: Wallet, hue: T.accRgb, color: T.text,
            value: formatBalance(totals.capital),
            hint: `на ${accounts.length} ${accounts.length === 1 ? 'акаунті' : 'акаунтах'}`,
          },
          {
            label: 'Розмір рахунків', icon: Activity, hue: '110,168,254', color: T.text2,
            value: formatBalance(totals.size),
            hint: 'скільки під керуванням за умовами',
          },
          {
            label: 'Незнятий прибуток', icon: TrendingUp, hue: T.okRgb,
            color: totals.open >= 0 ? T.ok : T.bad,
            value: `${totals.open >= 0 ? '+' : '−'}${formatBalance(Math.abs(totals.open))}`,
            hint: 'понад стартовий розмір',
          },
          {
            label: 'Виведено', icon: Trophy, hue: T.warnRgb,
            color: totals.paid ? T.warn : T.text4,
            value: formatBalance(totals.paid),
            hint: payouts.length ? `${payouts.length} ${payouts.length === 1 ? 'виплата' : 'виплат'}` : 'ще жодної виплати',
          },
        ].map((k) => (
          <motion.div key={k.label} variants={{ hidden: { opacity: 0, y: 15, filter: "blur(4px)" }, visible: { opacity: 1, y: 0, filter: "blur(0px)" } }}>
            <AccCard hue={k.hue} className="h-full p-5">
              <div className="relative z-10 mb-3.5 flex items-center gap-2">
                <k.icon size={14} strokeWidth={2.2} style={{ color: `rgb(${k.hue})` }} />
                <p className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {k.label}
                </p>
              </div>
              <p className="relative z-10 text-[27px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: k.color, letterSpacing: '-0.02em' }}>
                {k.value}
              </p>
              <p className="relative z-10 mt-1 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {k.hint}
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
        ) : accounts.length === 0 ? (
          <motion.div 
            variants={{ hidden: { opacity: 0, scale: 0.96 }, visible: { opacity: 1, scale: 1 } }}
            className="flex flex-col items-center justify-center py-32 bg-[var(--edge-surface)]/60 backdrop-blur-sm border border-dashed border-[#33333A] rounded-[2rem]"
          >
            <Building2 className="text-[#4A4A52] mb-4 opacity-50" size={48} />
            <p className="text-[#7A7A85] font-black text-xs uppercase tracking-widest">Ще немає акаунтів</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {accounts.map((acc) => {
                const size = Number(acc.initial_balance ?? acc.balance) || 0;
                const bal = Number(acc.balance) || 0;
                const open = bal - size;
                const paid = totals.byAcc[acc.id] || 0;
                /* Прогрес до типової цілі пропа — 10% від розміру рахунку */
                const goal = size * 0.1;
                const pct = goal > 0 ? Math.max(0, Math.min(100, (open / goal) * 100)) : 0;
                const hue = open >= 0 ? T.okRgb : T.badRgb;

                return (
                  <motion.div
                    key={acc.id}
                    layout
                    initial={{ opacity: 0, y: 16, filter: "blur(5px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, scale: 0.95, filter: "blur(6px)" }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <AccCard hue={hue} onClick={() => setSelectedAcc(acc)} className="flex h-full flex-col gap-5 p-6">
                      <div className="relative z-10 flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div
                            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                          >
                            <Building2 size={21} strokeWidth={2} style={{ color: T.acc }} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-[18px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
                              {acc.firm_name}
                            </h3>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold" style={{ fontFamily: T.sans, color: T.ok }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.ok, boxShadow: `0 0 8px ${T.ok}` }} />
                              рахунок {formatBalance(size)}
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

                      <div className="relative z-10">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                          Поточний баланс
                        </p>
                        <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                          <h2 className="text-[32px] font-bold tabular-nums" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}>
                            {money2(bal)}
                          </h2>
                          {open !== 0 && (
                            <span
                              className="rounded-lg px-2 py-0.5 text-[12.5px] font-bold tabular-nums"
                              style={{
                                fontFamily: T.mono,
                                background: `rgba(${hue},0.10)`,
                                border: `1px solid rgba(${hue},0.24)`,
                                color: open >= 0 ? T.ok : T.bad,
                              }}
                            >
                              {open >= 0 ? '+' : '−'}{money(Math.abs(open))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Прогрес до виплати замість вигаданих 75% */}
                      <div className="relative z-10 mt-auto">
                        <div className="mb-2 flex items-center justify-between gap-3 text-[12px] font-semibold" style={{ fontFamily: T.sans }}>
                          <span className="uppercase tracking-[0.09em]" style={{ color: T.text4 }}>
                            До цілі 10% · {money(goal)}
                          </span>
                          <span style={{ color: pct >= 100 ? T.ok : T.text3 }}>
                            {pct >= 100 ? 'ціль узято' : `${Math.round(pct)}%`}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: T.sunken }}>
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                            style={{ background: pct >= 100 ? T.ok : T.acc }}
                          />
                        </div>

                        <div className="mt-3.5 flex items-center justify-between gap-3 pt-3.5" style={{ borderTop: `1px solid ${T.line}` }}>
                          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: paid ? T.warn : T.text4 }}>
                            <ArrowDownToLine size={12.5} strokeWidth={2.4} />
                            {paid ? `виведено ${money(paid)}` : 'виплат ще не було'}
                          </span>
                          <span className="flex items-center gap-1 text-[12.5px] font-semibold opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ fontFamily: T.sans, color: T.acc }}>
                            деталі
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
                {editingId ? 'Редагування акаунта' : 'Новий акаунт'}
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
                  Оберіть фірму
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