import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import Fuse from 'fuse.js';
import {
  Calculator as CalcIcon, ChevronDown, Search as SearchIcon, Loader2, Settings2,
  ArrowUpDown, Star, Wallet, Plus, LayoutGrid,
} from 'lucide-react';

import { T } from '../lib/theme';
import AssetIcon, { CURRENCY_TO_FLAG } from '../components/ui/AssetIcon';
import ResultsBoard from '../components/calculator/ResultsBoard';
import AssetSearchModal from '../components/modals/AssetSearchModal';

/* ==================================================================
   Калькулятор позиції.

   Дві колонки на широкому екрані: зліва ввід, справа липке табло.
   До цього сторінка була одним стовпчиком у 720 пікселів — на
   моніторі це вузька стрічка посеред порожнечі, а результат
   доводилось шукати очима над полями. Тепер число видно постійно,
   і воно міняється в тій самій точці екрана, куди людина дивиться.

   На вузькому екрані колонки складаються в одну, табло йде першим і
   лишається липким — рівно та поведінка, що була.

   Порядок полів збігається з порядком мислення трейдера:
   рахунок → актив → вхід і стоп (задають ризик, стоять поруч)
   → відсоток → тейк, який думається останнім.

   Вибір скрізь зроблено видимим, а не захованим у випадайки й
   модалки: рахунки — плитками з балансом, активи — плитками з
   пошуком і категоріями просто на сторінці, ризик — великими
   кнопками. Модалка лишилась для повного каталогу, але доходити до
   неї тепер майже не треба.
================================================================== */

const QUICK_SELECT_SYMBOLS = ['BTC/USD', 'EUR/USD', 'GER40', 'ETH/USD', 'GBP/USD', 'XAU/USD'];

/* Ризик завжди від стартового капіталу рахунку, не від поточного.
   Наторгований профіт не збільшує розмір наступної позиції — інакше
   1% на рахунку з +$6,000 зверху рахувався б уже не від $100,000, а
   від $106,000, і ризик непомітно ріс би разом із самим рахунком.
   initial_balance фіксується один раз при створенні рахунку; старі
   записи, заведені до цього поля, підстраховані відкатом на balance. */
const initialBalanceOf = (acc) => String(Number(acc?.initial_balance ?? acc?.balance) || 0);

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 26 } },
};

const NO_SPIN = '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]';

/* Скорочені підписи категорій: у базі вони довгі («Forex Majors»),
   а в рядку вкладок місця на це немає. */
const CAT_LABEL = {
  'Forex Majors': 'Форекс',
  'Forex Minors': 'Форекс ·',
  Cryptocurrencies: 'Крипта',
  Indices: 'Індекси',
  Commodities: 'Сировина',
  Metals: 'Метали',
  Stocks: 'Акції',
};

/* ---------- картка без руху ----------
   Тільки світло за курсором. Нахил і підстрибування змушують око
   щоразу заново ловити вміст, а тут його читають. */
function Card({ children, title, right, className = '' }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);

  const move = ({ currentTarget, clientX, clientY }) => {
    const { left, top } = currentTarget.getBoundingClientRect();
    mx.set(clientX - left);
    my.set(clientY - top);
  };

  return (
    <div
      onMouseMove={move}
      className={`group relative overflow-hidden rounded-2xl p-5 sm:p-6 ${className}`}
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: useMotionTemplate`radial-gradient(400px circle at ${mx}px ${my}px, rgba(${T.accRgb},0.09), transparent 80%)` }}
      />
      <div className="relative z-10">
        {(title || right) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {title}
            </div>
            {right}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------- поле з підписом над ним ----------

   Порожнє обовʼязкове поле підсвічує власний підпис акцентом. Так
   зникла потреба в окремій плашці «заповни: актив, вхід, стоп» —
   вона показувала те саме, але окремою коробкою вгорі, далеко від
   полів, до яких стосувалась. */
function Field({ id, label, hint, value, onChange, placeholder, tone, inputRef, required, sub }) {
  const wanted = required && !Number(value);

  return (
    <div className="min-w-0">
      {/* Порожній підпис лишав би над полем висоту рядка — і сусідні
          поля в тому ж ряду ставали б на різній висоті. */}
      {(label || hint) && (
        <label
          htmlFor={id}
          className="mb-2 flex items-baseline justify-between gap-2 text-[13.5px] font-semibold"
          style={{ fontFamily: T.sans, color: wanted ? T.acc : T.text2 }}
        >
          <span className="flex items-center gap-2">
            {tone && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />}
            {label}
          </span>
          {hint && <span className="shrink-0 text-[12px]" style={{ color: T.text3 }}>{hint}</span>}
        </label>
      )}
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        placeholder={placeholder}
        className={`h-16 w-full rounded-xl px-4 text-[21px] outline-none transition-colors ${NO_SPIN}`}
        style={{
          fontFamily: T.mono,
          background: T.sunken,
          border: `1px solid ${wanted ? `rgba(${T.accRgb},0.28)` : T.line}`,
          color: T.text,
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
        onBlur={(e) => (e.currentTarget.style.borderColor = wanted ? `rgba(${T.accRgb},0.28)` : T.line)}
      />
      {/* Підказка під полем, а не в підписі: вона стосується вже
          введеного числа, тож має стояти після нього. Рядок під полем
          зарезервований завжди — інакше картка підстрибує на 18
          пікселів, щойно введено стоп. */}
      <div className="mt-1.5 h-[16px] text-[12.5px] leading-none tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
        {sub}
      </div>
    </div>
  );
}

export default function Calculator() {
  const [accounts, setAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [flatAssets, setFlatAssets] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [swapHint, setSwapHint] = useState(false);

  const searchInputRef = useRef(null);
  const balanceRef = useRef(null);
  const entryRef = useRef(null);
  const stopRef = useRef(null);
  const riskRef = useRef(null);

  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balance, setBalance] = useState('');
  const [riskPercent, setRiskPercent] = useState(() => localStorage.getItem('calc_risk_percent') || '1');
  const [assetPair, setAssetPair] = useState(() => localStorage.getItem('calc_selected_asset') || '');
  const [contractSize, setContractSize] = useState(() => localStorage.getItem('calc_contract_size') || '');
  const [isPipsMode, setIsPipsMode] = useState(() => localStorage.getItem('calc_pips_mode') === 'true');

  const [assetSearch, setAssetSearch] = useState('');
  const deferredSearch = useDeferredValue(assetSearch);

  /* Окремий пошук просто на сторінці — модалка лишається для
     повного каталогу, але типовий вибір робиться без неї. */
  const [inlineSearch, setInlineSearch] = useState('');
  const deferredInline = useDeferredValue(inlineSearch);
  const [assetTab, setAssetTab] = useState('fav');

  const [entryPrice, setEntryPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  const [expandedCategories, setExpandedCategories] = useState({
    'Forex Majors': true,
    Cryptocurrencies: true,
  });

  const toggleCategory = (cat) => setExpandedCategories((p) => ({ ...p, [cat]: !p[cat] }));

  useEffect(() => {
    if (isAssetModalOpen) {
      const w = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${w}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isAssetModalOpen]);

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const { data: raw } = await supabase.from('prop_accounts').select('*').order('created_at', { ascending: false });
        /* Архівні (Closed) рахунки сюди не потрапляють — калькулятор
           рахує наступну угоду, а по закритому рахунку її не буде. */
        const accData = (raw || []).filter((a) => a.status !== 'Closed');
        const savedAcc = localStorage.getItem('calc_selected_account');
        const savedBal = localStorage.getItem('calc_custom_balance');

        if (accData.length > 0) {
          setAccounts(accData);
          if (savedAcc === 'custom') {
            setSelectedAccount('custom');
            setBalance(savedBal || '');
          } else if (savedAcc && accData.some((a) => a.id === savedAcc)) {
            setSelectedAccount(savedAcc);
            setBalance(initialBalanceOf(accData.find((a) => a.id === savedAcc)));
          } else {
            setSelectedAccount(accData[0].id);
            setBalance(initialBalanceOf(accData[0]));
          }
        } else {
          setSelectedAccount('custom');
          setBalance(savedBal || '');
        }
      } catch (error) {
        console.error('Помилка акаунтів:', error);
        setSelectedAccount('custom');
        setBalance(localStorage.getItem('calc_custom_balance') || '');
      } finally {
        setIsLoadingAccounts(false);
      }
    }
    fetchAccounts();
  }, []);

  useEffect(() => {
    async function fetchFavorites() {
      const CACHE_KEY = 'calculator_favorites_v1';
      const cachedFavs = localStorage.getItem(CACHE_KEY);
      if (cachedFavs) setFavorites(JSON.parse(cachedFavs));
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.user) return;
        const { data, error } = await supabase.from('user_assets').select('name');
        if (error) throw error;
        if (data) {
          const dbFavs = data.map((i) => i.name);
          if (JSON.stringify(dbFavs) !== cachedFavs) {
            setFavorites(dbFavs);
            localStorage.setItem(CACHE_KEY, JSON.stringify(dbFavs));
          }
        }
      } catch (err) {
        console.error('Помилка інструментів:', err);
      }
    }
    fetchFavorites();
  }, []);

  useEffect(() => {
    async function fetchMarketData() {
      setIsLoadingAssets(true);
      const CACHE_KEY = 'calculator_market_assets_v3';
      const CACHE_TIME_KEY = 'calculator_market_assets_time_v3';
      const ONE_DAY = 24 * 60 * 60 * 1000;

      const cachedData = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      const now = Date.now();

      if (cachedData && cachedTime && now - Number(cachedTime) < ONE_DAY) {
        try {
          const parsed = JSON.parse(cachedData);
          setFlatAssets(parsed.flat);
          setIsLoadingAssets(false);
          preload(parsed.flat);
          return;
        } catch {
          console.warn('Помилка парсингу кешу.');
        }
      }

      const combined = [];
      try {
        const { data: dbAssets, error } = await supabase.from('instruments').select('symbol, category, contract_size');
        if (dbAssets && !error) {
          combined.push(...dbAssets.map((i) => ({
            symbol: i.symbol, category: i.category, contractSize: Number(i.contract_size),
          })));
        }
        try {
          const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
          const j = await res.json();
          combined.push(...j.symbols
            .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .slice(0, 40)
            .map((s) => ({ symbol: s.symbol.replace('USDT', '/USD'), category: 'Cryptocurrencies', contractSize: 1 })));
        } catch { /* біржа недоступна — лишаємось на своїй базі */ }

        setFlatAssets(combined);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ flat: combined }));
        localStorage.setItem(CACHE_TIME_KEY, now.toString());
        preload(combined);
      } catch (error) {
        console.error('Помилка маркет-дати:', error);
      } finally {
        setIsLoadingAssets(false);
      }
    }
    fetchMarketData();
  }, []);

  const preload = (assets) => {
    QUICK_SELECT_SYMBOLS.forEach((sym) => {
      const a = assets.find((x) => x.symbol === sym);
      if (!a) return;
      const clean = a.symbol.replace('/', '');
      if (a.category === 'Cryptocurrencies' && a.symbol.includes('/')) {
        new Image().src = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${a.symbol.split('/')[0].toLowerCase()}.svg`;
      } else if (clean.length === 6) {
        const b = CURRENCY_TO_FLAG[clean.substring(0, 3)];
        const q = CURRENCY_TO_FLAG[clean.substring(3, 6)];
        if (b) new Image().src = `https://flagcdn.com/${b}.svg`;
        if (q) new Image().src = `https://flagcdn.com/${q}.svg`;
      }
    });
  };

  const handleToggleFavorite = async (e, symbol) => {
    e.stopPropagation();
    const isFav = favorites.includes(symbol);
    const next = isFav ? favorites.filter((f) => f !== symbol) : [...favorites, symbol];
    setFavorites(next);
    if (isFav) supabase.from('user_assets').delete().match({ name: symbol }).then();
    else supabase.from('user_assets').insert([{ name: symbol }]).then();
    localStorage.setItem('calculator_favorites_v1', JSON.stringify(next));
  };

  const handleAccountSelect = (acc) => {
    const type = acc === 'custom' ? 'custom' : acc.id;
    setSelectedAccount(type);
    localStorage.setItem('calc_selected_account', type);
    setBalance(acc === 'custom' ? (localStorage.getItem('calc_custom_balance') || '') : initialBalanceOf(acc));
  };

  const handleAssetSelect = (asset) => {
    setIsAssetModalOpen(false);
    requestAnimationFrame(() => {
      setAssetPair(asset.symbol);
      setContractSize(asset.contractSize.toString());
      localStorage.setItem('calc_selected_asset', asset.symbol);
      localStorage.setItem('calc_contract_size', asset.contractSize.toString());
    });
    setTimeout(() => setAssetSearch(''), 300);
  };

  const handleModalClose = () => {
    setIsAssetModalOpen(false);
    setTimeout(() => setAssetSearch(''), 300);
  };

  const fuse = useMemo(() => new Fuse(flatAssets, { keys: ['symbol'], threshold: 0.4 }), [flatAssets]);

  const displayCategories = useMemo(() => {
    let results = flatAssets;
    if (deferredSearch.trim() !== '') results = fuse.search(deferredSearch).map((r) => r.item);
    const grouped = {};
    results.forEach((a) => {
      if (!grouped[a.category]) grouped[a.category] = [];
      grouped[a.category].push(a);
    });
    return grouped;
  }, [flatAssets, deferredSearch, fuse]);

  const quickSelectAssets = useMemo(
    () => QUICK_SELECT_SYMBOLS.map((s) => flatAssets.find((a) => a.symbol === s)).filter(Boolean),
    [flatAssets],
  );
  const favoriteAssetsList = useMemo(
    () => favorites.map((s) => flatAssets.find((a) => a.symbol === s)).filter(Boolean),
    [favorites, flatAssets],
  );

  /* Улюблені попереду, типові добираються слідом. */
  const quickRow = useMemo(() => {
    const seen = new Set();
    return [...favoriteAssetsList, ...quickSelectAssets]
      .filter((a) => a && !seen.has(a.symbol) && seen.add(a.symbol))
      .slice(0, 8);
  }, [favoriteAssetsList, quickSelectAssets]);

  /* Вкладки будуються з того, що реально є в базі, а не з
     захардкодженого переліку: інструменти додаються, і список
     категорій мав би розʼїжджатись із ним. */
  const categories = useMemo(() => {
    const count = {};
    flatAssets.forEach((a) => { count[a.category] = (count[a.category] || 0) + 1; });
    return Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
  }, [flatAssets]);

  /* Що показати плитками: знайдене, вкладка категорії або добірка
     «улюблені + типові». */
  const assetGrid = useMemo(() => {
    const q = deferredInline.trim();
    if (q) return fuse.search(q).map((r) => r.item).slice(0, 12);
    if (assetTab === 'fav') return quickRow;
    return flatAssets.filter((a) => a.category === assetTab).slice(0, 12);
  }, [deferredInline, fuse, assetTab, quickRow, flatAssets]);

  /* ---------- розрахунок ---------- */
  const calculatePosition = () => {
    const bal = Number(balance) || 0;
    const riskPct = Number(riskPercent) || 0;
    const entry = Number(entryPrice);
    const slInput = Number(stopLoss);
    const tpInput = Number(takeProfit);
    const size = Number(contractSize) || 100000;
    const riskAmt = bal * (riskPct / 100);

    const empty = { lotSize: '0.00', riskAmount: '0.00', rr: '0.00', profit: '0.00' };
    if (!slInput || riskAmt === 0 || !assetPair) return empty;
    if (!isPipsMode && !entry) return empty;

    const spec = flatAssets.find((a) => a.symbol === assetPair) || { category: 'Forex' };
    const cat = spec.category?.toLowerCase() || '';
    const clean = assetPair.replace('/', '').toUpperCase();

    let distance = 0;
    if (isPipsMode) {
      let tick = 0.00001;
      if (cat.includes('crypto')) tick = 0.01;
      else if (clean.includes('XAU') || clean.includes('GOLD')) tick = 0.01;
      else if (clean.includes('JPY')) tick = 0.001;
      else if (cat.includes('forex') || clean.length === 6) tick = 0.00001;
      else tick = 0.01;
      distance = slInput * tick;
    } else {
      distance = Math.abs(entry - slInput);
    }

    if (distance === 0) return empty;

    let lot = riskAmt / (distance * size);
    if (assetPair.includes('JPY') && !cat.includes('crypto')) {
      lot = (riskAmt * (entry || 150)) / (distance * size);
    }

    let rr = 0;
    let profit = 0;
    if (tpInput) {
      if (isPipsMode) rr = tpInput / slInput;
      else if (entry) rr = Math.abs(tpInput - entry) / distance;
      profit = riskAmt * rr;
    }

    return {
      lotSize: lot.toFixed(2),
      riskAmount: riskAmt.toFixed(2),
      rr: rr > 0 ? rr.toFixed(2) : '0.00',
      profit: profit.toFixed(2),
    };
  };

  const { lotSize, riskAmount, rr, profit } = calculatePosition();

  const ready = lotSize !== '0.00';

  const stopDistance = useMemo(() => {
    if (!Number(stopLoss)) return 0;
    if (isPipsMode) return Number(stopLoss);
    if (!Number(entryPrice)) return 0;
    return Number(Math.abs(Number(entryPrice) - Number(stopLoss)).toFixed(5));
  }, [stopLoss, entryPrice, isPipsMode]);

  const riskMoney = Number(balance) && Number(riskPercent)
    ? `$${(Number(balance) * Number(riskPercent) / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`
    : null;

  /* Напрям угоди з самих чисел, а не окремим перемикачем: стоп під
     входом означає лонг, над ним — шорт. Показуємо це підписом, щоб
     помилка в полі була видна одразу. */
  const side = useMemo(() => {
    const e = Number(entryPrice);
    const s = Number(stopLoss);
    if (isPipsMode || !e || !s || e === s) return null;
    return s < e ? 'Long' : 'Short';
  }, [entryPrice, stopLoss, isPipsMode]);

  const swapLevels = () => {
    setEntryPrice(stopLoss);
    setStopLoss(entryPrice);
  };

  return (
    <div className="relative min-h-full">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto w-full max-w-[1240px] px-4 pb-24 pt-5 sm:px-6 lg:pt-7"
      >
        {/* ─────────── Шапка ─────────── */}
        <motion.div variants={item} className="mb-5 flex flex-wrap items-center gap-3.5">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.lineAcc}` }}
          >
            <CalcIcon size={21} style={{ color: T.acc }} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Ризик-менеджмент
            </div>
            <h1
              className="text-[28px] font-bold leading-none sm:text-[34px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Калькулятор позиції
            </h1>
          </div>

          {/* Режим — тихий перемикач у шапці: його чіпають раз на
              місяць, але стосується він усієї форми, тому стоїть над
              нею, а не всередині картки з рівнями. */}
          <div className="ml-auto flex gap-1 rounded-xl p-1" style={{ background: 'rgba(var(--edge-hair-rgb),0.04)' }}>
            {[
              { id: false, label: 'за ціною' },
              { id: true, label: 'у пунктах' },
            ].map((m) => {
              const on = isPipsMode === m.id;
              return (
                <button
                  key={String(m.id)}
                  type="button"
                  onClick={() => { setIsPipsMode(m.id); localStorage.setItem('calc_pips_mode', String(m.id)); }}
                  className="rounded-lg px-3.5 py-2 text-[13px] font-bold transition-colors"
                  style={{
                    fontFamily: T.sans,
                    color: on ? T.text : T.text3,
                    background: on ? 'rgba(var(--edge-hair-rgb),0.09)' : 'transparent',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* ─────────── Дві колонки ───────────
            Табло першим у розмітці: на вузькому екрані воно має
            лишитись зверху, а на широкому grid ставить його праворуч
            без жодного дублювання. */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_370px] lg:gap-5">

          {/* ───── права колонка (на мобільному — верхня) ───── */}
          <motion.div variants={item} className="sticky top-3 z-30 lg:order-2">
            <ResultsBoard
              lotSize={lotSize}
              riskAmount={riskAmount}
              profit={profit}
              rr={rr}
              ready={ready}
              balance={balance}
              riskPercent={riskPercent}
              stopDistance={stopDistance}
              isPipsMode={isPipsMode}
            />
          </motion.div>

          {/* ───── ліва колонка: ввід ───── */}
          <div className="flex min-w-0 flex-col gap-4 lg:order-1">

            {/* ─────────── Рахунок ─────────── */}
            <motion.div variants={item}>
              <Card title="Рахунок">
                {isLoadingAccounts ? (
                  <div className="flex h-[76px] items-center gap-2 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    <Loader2 size={15} className="animate-spin" /> завантажую рахунки…
                  </div>
                ) : (
                  <>
                    {/* Плитки замість випадайки: рахунків у трейдера
                        одиниці, а число на плитці — саме те, що піде
                        в розрахунок ризику. Це стартовий баланс
                        рахунку, а не поточний: тіло риск-менеджменту
                        не росте разом із наторгованим профітом, тож і
                        тут не показуємо число, яке однаково не
                        використається. */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {accounts.map((acc) => {
                        const on = selectedAccount === acc.id;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => handleAccountSelect(acc)}
                            className="flex h-[74px] flex-col justify-center gap-1 rounded-xl px-3.5 text-left transition-colors"
                            style={{
                              background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                              border: `1px solid ${on ? T.lineAcc : T.line}`,
                            }}
                            onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
                            onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
                          >
                            <span
                              className="truncate text-[13.5px] font-bold"
                              style={{ fontFamily: T.sans, color: on ? T.acc : T.text2 }}
                            >
                              {acc.firm_name}
                            </span>
                            <span className="truncate text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: on ? T.text : T.text3 }}>
                              ${Number(acc.initial_balance ?? acc.balance).toLocaleString('uk-UA')}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => { handleAccountSelect('custom'); balanceRef.current?.focus(); }}
                        className="flex h-[74px] flex-col justify-center gap-1 rounded-xl px-3.5 text-left transition-colors"
                        style={{
                          background: selectedAccount === 'custom' ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${selectedAccount === 'custom' ? T.lineAcc : T.line}`,
                        }}
                      >
                        <span className="flex items-center gap-1.5 text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: selectedAccount === 'custom' ? T.acc : T.text2 }}>
                          {accounts.length ? <Plus size={14} strokeWidth={2.6} /> : <Wallet size={14} strokeWidth={2.4} />}
                          Вручну
                        </span>
                        <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                          свій депозит
                        </span>
                      </button>
                    </div>

                    <div className="mt-3.5">
                      <Field
                        id="calc-balance"
                        inputRef={balanceRef}
                        required
                        label="Депозит"
                        hint={riskMoney ? `ризик ${riskMoney}` : null}
                        value={balance}
                        onChange={(v) => {
                          setBalance(v);
                          setSelectedAccount('custom');
                          localStorage.setItem('calc_selected_account', 'custom');
                          localStorage.setItem('calc_custom_balance', v);
                        }}
                        placeholder="10000"
                      />
                    </div>
                  </>
                )}
              </Card>
            </motion.div>

            {/* ─────────── Актив ─────────── */}
            <motion.div variants={item}>
              <Card
                title="Актив"
                right={isLoadingAssets ? <Loader2 size={14} className="animate-spin" style={{ color: T.acc }} /> : null}
              >
                {/* Обраний актив великою плашкою: це якір усієї
                    сторінки, від нього залежить і розмір контракту, і
                    ціна пункту. */}
                <div
                  className="mb-3.5 flex h-16 items-center gap-3 rounded-xl px-4"
                  style={{
                    background: assetPair ? `rgba(${T.accRgb},0.08)` : T.sunken,
                    border: `1px solid ${assetPair ? T.lineAcc : `rgba(${T.accRgb},0.28)`}`,
                  }}
                >
                  {assetPair
                    ? <AssetIcon symbol={assetPair} category={flatAssets.find((a) => a.symbol === assetPair)?.category} />
                    : <SearchIcon size={18} style={{ color: T.text3 }} />}
                  <span
                    className="truncate text-[21px] font-bold"
                    style={{ fontFamily: assetPair ? T.mono : T.sans, color: assetPair ? T.text : T.text3 }}
                  >
                    {assetPair || 'інструмент не обрано'}
                  </span>
                  {assetPair && (
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, assetPair)}
                      className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors"
                      style={{
                        background: 'rgba(var(--edge-hair-rgb),0.05)',
                        color: favorites.includes(assetPair) ? T.warn : T.text3,
                      }}
                      title={favorites.includes(assetPair) ? 'Прибрати з улюблених' : 'В улюблені'}
                    >
                      <Star size={16} strokeWidth={2.2} fill={favorites.includes(assetPair) ? T.warn : 'none'} />
                    </button>
                  )}
                </div>

                {/* Пошук прямо тут. Раніше єдиний шлях до інструмента
                    лежав через модалку: відкрити, знайти, клікнути,
                    дочекатись закриття — чотири дії на те, що робиться
                    одним дотиком. */}
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: T.text3 }} />
                    <input
                      type="text"
                      value={inlineSearch}
                      onChange={(e) => setInlineSearch(e.target.value)}
                      placeholder="Пошук: EURUSD, BTC, GER40…"
                      className="h-12 w-full rounded-xl pl-10 pr-3 text-[15px] outline-none transition-colors"
                      style={{ fontFamily: T.sans, background: T.sunken, border: `1px solid ${T.line}`, color: T.text }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => !isLoadingAssets && setIsAssetModalOpen(true)}
                    className="flex h-12 shrink-0 items-center gap-2 rounded-xl px-3.5 text-[13.5px] font-bold transition-colors"
                    style={{ fontFamily: T.sans, background: T.sunken, border: `1px solid ${T.line}`, color: T.text2 }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
                    title="Повний каталог"
                  >
                    <LayoutGrid size={15} strokeWidth={2.2} />
                    <span className="hidden sm:inline">усі</span>
                  </button>
                </div>

                {/* Вкладки категорій. Поки в пошуку щось є — вони
                    ховаються: два фільтри одночасно тільки плутають. */}
                {!deferredInline.trim() && categories.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[{ id: 'fav', label: 'Обрані' }, ...categories.map((c) => ({ id: c, label: CAT_LABEL[c] || c }))].map((tab) => {
                      const on = assetTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAssetTab(tab.id)}
                          className="h-9 rounded-lg px-3 text-[13px] font-bold transition-colors"
                          style={{
                            fontFamily: T.sans,
                            color: on ? T.acc : T.text3,
                            background: on ? `rgba(${T.accRgb},0.12)` : 'rgba(var(--edge-hair-rgb),0.04)',
                            border: `1px solid ${on ? T.accLine : 'transparent'}`,
                          }}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Плитки: іконка плюс тікер, у два-три стовпчики.
                    Рядок чипів, що був раніше, тримав три штуки й
                    обрізався — решту доводилось шукати в модалці. */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {assetGrid.map((a) => {
                    const on = assetPair === a.symbol;
                    return (
                      <button
                        key={a.symbol}
                        type="button"
                        onClick={() => handleAssetSelect(a)}
                        className="flex h-12 items-center gap-2.5 rounded-xl px-3 text-left transition-colors"
                        style={{
                          background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? T.lineAcc : T.line}`,
                        }}
                        onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = T.lineHi; }}
                        onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = T.line; }}
                      >
                        <AssetIcon symbol={a.symbol} category={a.category} />
                        <span className="truncate text-[14px] font-bold" style={{ fontFamily: T.mono, color: on ? T.acc : T.text2 }}>
                          {a.symbol}
                        </span>
                      </button>
                    );
                  })}

                  {assetGrid.length === 0 && (
                    <div className="col-span-full py-3 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {isLoadingAssets ? 'завантажую інструменти…' : 'нічого не знайшлось — спробуй повний каталог'}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* ─────────── Рівні ─────────── */}
            <motion.div variants={item}>
              <Card
                title="Рівні"
                right={side && (
                  <span
                    className="rounded-lg px-2.5 py-1 text-[12px] font-bold"
                    style={{
                      fontFamily: T.sans,
                      color: side === 'Long' ? T.ok : T.bad,
                      background: side === 'Long' ? `rgba(${T.okRgb},0.12)` : `rgba(${T.badRgb},0.12)`,
                    }}
                  >
                    {side}
                  </span>
                )}
              >
                {/* Вхід і стоп поруч: разом вони задають ризик, це одна
                    думка. Кнопка між ними міняє їх місцями — помилка
                    «набрав навпаки» трапляється частіше за всі інші,
                    і виправляти її переписуванням двох полів довго. */}
                {/* Вирівнювання по ВЕРХУ. По низу поле зі стопом
                    підскакувало вгору, щойно під ним зʼявлялась
                    дистанція: flex тягнув до спільного низу разом із
                    підказкою, і два однакові поля ставали на різній
                    висоті. */}
                <div className="flex items-start gap-2">
                  {!isPipsMode && (
                    <>
                      <div className="min-w-0 flex-1">
                        <Field
                          id="calc-entry"
                          inputRef={entryRef}
                          required
                          label="Вхід"
                          value={entryPrice}
                          onChange={setEntryPrice}
                          placeholder="1.08500"
                          tone={T.acc}
                        />
                      </div>
                      {/* Сама стрілка не пояснює, що робить кнопка, а
                          системний title спливає аж через секунду й у
                          чужому стилі. Тому підказка своя й майже
                          миттєва. */}
                      {/* 30px — рівно висота підпису над полем
                          (13.5px рядок + 8px відступу): так кнопка
                          стоїть врівень з обома полями, а не з їхніми
                          заголовками. */}
                      <div
                        className="relative shrink-0"
                        style={{ marginTop: 30 }}
                        onMouseEnter={() => setSwapHint(true)}
                        onMouseLeave={() => setSwapHint(false)}
                      >
                        <button
                          type="button"
                          onClick={swapLevels}
                          className="grid h-16 w-11 place-items-center rounded-xl transition-colors"
                          style={{
                            background: swapHint ? `rgba(${T.accRgb},0.10)` : T.sunken,
                            border: `1px solid ${swapHint ? T.lineAcc : T.line}`,
                            color: swapHint ? T.acc : T.text3,
                          }}
                          aria-label="Поміняти вхід і стоп місцями"
                        >
                          <ArrowUpDown size={16} strokeWidth={2.2} />
                        </button>

                        <AnimatePresence>
                          {swapHint && (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 4 }}
                              transition={{ duration: 0.14 }}
                              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
                              style={{
                                fontFamily: T.sans,
                                background: T.surfaceHi,
                                border: `1px solid ${T.lineHi}`,
                                color: T.text2,
                                boxShadow: '0 12px 28px -12px rgba(0,0,0,0.9)',
                              }}
                            >
                              поміняти місцями
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </>
                  )}
                  <div className="min-w-0 flex-1">
                    <Field
                      id="calc-stop"
                      inputRef={stopRef}
                      required
                      label={isPipsMode ? 'Стоп, пунктів' : 'Стоп'}
                      value={stopLoss}
                      onChange={setStopLoss}
                      placeholder={isPipsMode ? '250' : '1.08300'}
                      tone={T.bad}
                      sub={!isPipsMode && stopDistance ? `дистанція ${stopDistance}` : null}
                    />
                  </div>
                </div>

                {/* Тейк останній і підписаний як необовʼязковий — він і
                    справді думається після того, як ризик уже заданий. */}
                <div className="mt-3.5">
                  <Field
                    id="calc-tp"
                    label={isPipsMode ? 'Тейк, пунктів' : 'Тейк'}
                    hint="не обовʼязково"
                    value={takeProfit}
                    onChange={setTakeProfit}
                    placeholder={isPipsMode ? '500' : '1.08900'}
                    tone={T.ok}
                    sub={Number(rr) > 0 ? `1 : ${rr}` : null}
                  />
                </div>
              </Card>
            </motion.div>

            {/* ─────────── Ризик ─────────── */}
            <motion.div variants={item}>
              <Card
                title="Ризик на угоду"
                right={riskMoney && (
                  <span className="text-[16px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.bad }}>
                    {riskMoney}
                  </span>
                )}
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {/* Порівняння числове, не рядкове: при значенні '1.0'
                      чип '1' інакше ніколи не підсвічувався. */}
                  {['0.25', '0.5', '1', '2'].map((v) => {
                    const on = Number(riskPercent) === Number(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => { setRiskPercent(v); localStorage.setItem('calc_risk_percent', v); }}
                        className="h-16 rounded-xl text-[19px] font-bold tabular-nums transition-colors"
                        style={{
                          fontFamily: T.mono,
                          color: on ? T.bad : T.text3,
                          background: on ? `rgba(${T.badRgb},0.12)` : T.sunken,
                          border: `1px solid ${on ? `rgba(${T.badRgb},0.32)` : T.line}`,
                        }}
                      >
                        {v}%
                      </button>
                    );
                  })}
                </div>

                {/* Своє значення — окремим підписаним полем, а не
                    пʼятим чипом у ряду: раніше воно виглядало як
                    кнопка з обрізаним числом. */}
                <div className="mt-3.5 flex items-end gap-3">
                  <div className="w-[140px] shrink-0">
                    <label htmlFor="calc-risk" className="mb-2 block text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                      Своє, %
                    </label>
                    <input
                      id="calc-risk"
                      ref={riskRef}
                      type="text"
                      inputMode="decimal"
                      value={riskPercent}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                        setRiskPercent(val);
                        localStorage.setItem('calc_risk_percent', val);
                      }}
                      className={`h-14 w-full rounded-xl px-3 text-center text-[19px] outline-none transition-colors ${NO_SPIN}`}
                      style={{ fontFamily: T.mono, background: T.sunken, border: `1px solid ${T.line}`, color: T.bad }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.45)`)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                    />
                  </div>
                  <p className="pb-4 text-[12.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text3 }}>
                    Відсоток від депозиту, яким готовий ризикнути в цій угоді.
                  </p>
                </div>

                {/* Розмір контракту підставляється з активу сам, тому
                    ховається під згортайкою. */}
                <div className="mt-4" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-[12.5px] font-semibold transition-colors"
                    style={{ fontFamily: T.sans, color: showAdvanced ? T.acc : T.text3 }}
                  >
                    <Settings2 size={13} strokeWidth={2.2} />
                    Розмір контракту
                    <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                      {contractSize || '—'}
                    </span>
                    <ChevronDown
                      size={13}
                      strokeWidth={2.6}
                      style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {showAdvanced && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="pt-3">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={contractSize}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^\d.]/g, '');
                              setContractSize(v);
                              localStorage.setItem('calc_contract_size', v);
                            }}
                            placeholder="100000"
                            className={`h-12 w-full rounded-xl px-3.5 text-[15px] outline-none ${NO_SPIN}`}
                            style={{ fontFamily: T.mono, background: T.sunken, border: `1px solid ${T.line}`, color: T.text2 }}
                          />
                          <p className="mt-2 text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                            Підставляється з активу автоматично. Міняй, лише якщо у твого брокера інший.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isAssetModalOpen && (
          <AssetSearchModal
            isOpen={isAssetModalOpen}
            onClose={handleModalClose}
            searchInputRef={searchInputRef}
            assetSearch={assetSearch}
            setAssetSearch={setAssetSearch}
            deferredSearch={deferredSearch}
            favoriteAssetsList={favoriteAssetsList}
            quickSelectAssets={quickSelectAssets}
            displayCategories={displayCategories}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            handleAssetSelect={handleAssetSelect}
            handleToggleFavorite={handleToggleFavorite}
            assetPair={assetPair}
            favorites={favorites}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
