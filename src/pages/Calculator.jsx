import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import Fuse from 'fuse.js';
import {
  Calculator as CalcIcon, ChevronDown, Search as SearchIcon, Loader2, Settings2,
} from 'lucide-react';

import { T } from '../lib/theme';
import AssetIcon, { CURRENCY_TO_FLAG } from '../components/ui/AssetIcon';
import ResultsBoard from '../components/calculator/ResultsBoard';
import AssetSearchModal from '../components/modals/AssetSearchModal';
import Popover from '../components/ui/Popover';

/* ==================================================================
   Калькулятор позиції.

   Перероблено з двох колонок в одну, і це головне.

   Калькулятор — лінійна задача: пʼять полів дають одне число. Дві
   колонки розносили ввід і результат на шістсот пікселів, і око
   мандрувало через екран після кожного символу. Тепер результат —
   липка смуга над полями, все в межах одного погляду.

   Порядок полів тепер збігається з порядком мислення трейдера:
   актив → вхід → стоп (ці двоє задають ризик і мусять бути поруч)
   → відсоток → тейк, який насправді необовʼязковий і думається
   останнім. Раніше тейк стояв між входом і стопом, розриваючи
   єдину думку.

   Підписи винесені над поля. Плейсхолдер зникає, щойно почав
   друкувати, і три однакові порожні прямокутники з дрібними
   кольоровими крапками ставали нерозрізненними.
================================================================== */

const QUICK_SELECT_SYMBOLS = ['BTC/USD', 'EUR/USD', 'GER40', 'ETH/USD', 'GBP/USD', 'XAU/USD'];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 350, damping: 26 } },
};

const NO_SPIN = '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]';

/* ---------- картка без руху ----------
   Тільки світло за курсором. Нахил і підстрибування змушують око
   щоразу заново ловити вміст, а тут його читають. */
function Card({ children, className = '' }) {
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
      className={`group relative overflow-hidden rounded-2xl p-5 ${className}`}
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: useMotionTemplate`radial-gradient(400px circle at ${mx}px ${my}px, rgba(${T.accRgb},0.09), transparent 80%)` }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ---------- поле з підписом над ним ----------

   Порожнє обовʼязкове поле підсвічує власний підпис акцентом. Так
   зникла потреба в окремій плашці «заповни: актив, вхід, стоп» —
   вона показувала те саме, але окремою порожньою коробкою вгорі,
   далеко від полів, до яких стосувалась. */
function Field({ id, label, hint, value, onChange, placeholder, tone, inputRef, required }) {
  const wanted = required && !Number(value);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 flex items-baseline justify-between text-[13px] font-semibold"
        style={{ fontFamily: T.sans, color: wanted ? T.acc : T.text2 }}
      >
        <span className="flex items-center gap-2">
          {tone && <span className="h-2 w-2 rounded-full" style={{ background: tone }} />}
          {label}
        </span>
        {hint && <span className="text-[12px]" style={{ color: T.text3 }}>{hint}</span>}
      </label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        placeholder={placeholder}
        className={`h-14 w-full rounded-xl px-4 text-[18px] outline-none transition-colors ${NO_SPIN}`}
        style={{
          fontFamily: T.mono,
          background: T.sunken,
          border: `1px solid ${wanted ? `rgba(${T.accRgb},0.28)` : T.line}`,
          color: T.text,
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
        onBlur={(e) => (e.currentTarget.style.borderColor = wanted ? `rgba(${T.accRgb},0.28)` : T.line)}
      />
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
        const { data: accData } = await supabase.from('prop_accounts').select('*').order('created_at', { ascending: false });
        const savedAcc = localStorage.getItem('calc_selected_account');
        const savedBal = localStorage.getItem('calc_custom_balance');

        if (accData && accData.length > 0) {
          setAccounts(accData);
          if (savedAcc === 'custom') {
            setSelectedAccount('custom');
            setBalance(savedBal || '');
          } else if (savedAcc && accData.some((a) => a.id === savedAcc)) {
            setSelectedAccount(savedAcc);
            setBalance(accData.find((a) => a.id === savedAcc).balance.toString());
          } else {
            setSelectedAccount(accData[0].id);
            setBalance(accData[0].balance.toString());
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
    setBalance(acc === 'custom' ? (localStorage.getItem('calc_custom_balance') || '') : acc.balance.toString());
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

  /* Улюблені попереду, типові добираються слідом. Шість штук —
     стільки влазить у два рядки й охоплюється поглядом. */
  const quickRow = useMemo(() => {
    const seen = new Set();
    return [...favoriteAssetsList, ...quickSelectAssets]
      .filter((a) => a && !seen.has(a.symbol) && seen.add(a.symbol))
      .slice(0, 6);
  }, [favoriteAssetsList, quickSelectAssets]);

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

  return (
    <div className="relative min-h-full">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto w-full max-w-[720px] px-4 pb-24 pt-5 sm:px-6 lg:pt-7"
      >
        {/* ─────────── Шапка ─────────── */}
        <motion.div variants={item} className="mb-5 flex items-center gap-3.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.lineAcc}` }}
          >
            <CalcIcon size={20} style={{ color: T.acc }} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Ризик-менеджмент
            </div>
            <h1
              className="text-[26px] font-bold leading-none sm:text-[30px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Калькулятор позиції
            </h1>
          </div>
        </motion.div>

        {/* ─────────── Результат ─────────── */}
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

        <div className="flex flex-col gap-3">

          {/* ─────────── Рахунок ─────────── */}
          <motion.div variants={item} className="relative z-20">
            <Card>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Рахунок
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                {/* Портальний Popover, а не абсолютний блок усередині
                    картки: у Card стоїть overflow-hidden заради
                    заокруглення й світла за курсором, і він обрізав
                    випадайку по нижньому краю картки. */}
                <div className="min-w-0 flex-1">
                  <label className="mb-2 block text-[13px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    Звідки капітал
                  </label>
                  <Popover
                    triggerClass="block w-full"
                    renderTrigger={({ open, toggle }) => (
                      <button
                        type="button"
                        onClick={() => !isLoadingAccounts && toggle()}
                        className="flex h-14 w-full items-center justify-between rounded-xl px-4 text-left transition-colors"
                        style={{
                          background: T.sunken,
                          border: `1px solid ${open ? T.lineAcc : T.line}`,
                          cursor: isLoadingAccounts ? 'wait' : 'pointer',
                        }}
                      >
                        <span className="truncate text-[15px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                          {isLoadingAccounts ? (
                            <span className="flex items-center gap-2" style={{ color: T.text3 }}>
                              <Loader2 size={15} className="animate-spin" /> завантажую…
                            </span>
                          ) : selectedAccount === 'custom'
                            ? 'Вручну'
                            : accounts.find((a) => a.id === selectedAccount)?.firm_name || 'Обрати'}
                        </span>
                        <ChevronDown
                          size={16}
                          style={{ color: T.text3, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                        />
                      </button>
                    )}
                  >
                    {({ close }) => (
                      <div
                        className="w-[280px] overflow-hidden rounded-xl"
                        style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
                      >
                        <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto p-1.5">
                          {accounts.map((acc) => {
                            const on = selectedAccount === acc.id;
                            return (
                              <button
                                key={acc.id}
                                onClick={() => { handleAccountSelect(acc); close(); }}
                                className="flex items-center justify-between rounded-lg px-3 py-3 text-[14px] font-semibold transition-colors"
                                style={{
                                  fontFamily: T.sans,
                                  color: on ? T.acc : T.text2,
                                  background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                                }}
                              >
                                <span className="truncate">{acc.firm_name}</span>
                                <span className="ml-2 shrink-0 tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
                                  ${acc.balance.toLocaleString('uk-UA')}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            onClick={() => { handleAccountSelect('custom'); close(); }}
                            className="rounded-lg px-3 py-3 text-left text-[14px] font-semibold transition-colors"
                            style={{
                              fontFamily: T.sans,
                              color: selectedAccount === 'custom' ? T.acc : T.text2,
                              background: selectedAccount === 'custom' ? `rgba(${T.accRgb},0.12)` : 'transparent',
                              borderTop: accounts.length ? `1px solid ${T.line}` : 'none',
                            }}
                          >
                            Ввести вручну
                          </button>
                        </div>
                      </div>
                    )}
                  </Popover>
                </div>

                <div className="min-w-0 flex-1">
                  <Field
                    id="calc-balance"
                    inputRef={balanceRef}
                    required
                    label="Депозит, $"
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
              </div>
            </Card>
          </motion.div>

          {/* ─────────── Угода ─────────── */}
          <motion.div variants={item}>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  Угода
                </div>
                {/* Режим — тихий перемикач, а не два великі прямокутники:
                    його чіпають раз на місяць. */}
                <div className="flex gap-1 rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
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
                        className="rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors"
                        style={{
                          fontFamily: T.sans,
                          color: on ? T.text : T.text3,
                          background: on ? 'rgba(255,255,255,0.09)' : 'transparent',
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3.5">

                {/* актив */}
                <div>
                  <label
                    className="mb-2 flex items-center justify-between text-[13px] font-semibold"
                    style={{ fontFamily: T.sans, color: assetPair ? T.text2 : T.acc }}
                  >
                    Актив
                    {isLoadingAssets && <Loader2 size={13} className="animate-spin" style={{ color: T.acc }} />}
                  </label>
                  <button
                    type="button"
                    onClick={() => !isLoadingAssets && setIsAssetModalOpen(true)}
                    className="flex h-14 w-full items-center justify-between rounded-xl px-4 transition-colors"
                    style={{ background: T.sunken, border: `1px solid ${assetPair ? T.line : `rgba(${T.accRgb},0.28)`}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = assetPair ? T.line : `rgba(${T.accRgb},0.28)`)}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {assetPair && (
                        <AssetIcon symbol={assetPair} category={flatAssets.find((a) => a.symbol === assetPair)?.category} />
                      )}
                      <span
                        className="truncate text-[17px] font-bold"
                        style={{ fontFamily: assetPair ? T.mono : T.sans, color: assetPair ? T.text : T.text3 }}
                      >
                        {assetPair || 'обрати інструмент'}
                      </span>
                    </span>
                    <SearchIcon size={17} style={{ color: T.text3 }} />
                  </button>

                  {/* Швидкі активи прямо тут: улюблені плюс типові.
                      Раніше вони жили тільки всередині модалки, і щоб
                      узяти EUR/USD, треба було її відкрити, знайти,
                      клікнути. Тепер один дотик. */}
                  {quickRow.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {quickRow.map((a) => {
                        const on = assetPair === a.symbol;
                        return (
                          <button
                            key={a.symbol}
                            type="button"
                            onClick={() => handleAssetSelect(a)}
                            className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] font-bold transition-colors"
                            style={{
                              fontFamily: T.mono,
                              color: on ? T.acc : T.text2,
                              background: on ? `rgba(${T.accRgb},0.12)` : 'rgba(255,255,255,0.04)',
                            }}
                            onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
                            onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                          >
                            <AssetIcon symbol={a.symbol} category={a.category} />
                            {a.symbol}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Вхід і стоп поруч: разом вони задають ризик, це одна
                    думка. Раніше між ними стояв тейк і розривав її. */}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {!isPipsMode && (
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
                  )}
                  <Field
                    id="calc-stop"
                    inputRef={stopRef}
                    required
                    label={isPipsMode ? 'Стоп, пунктів' : 'Стоп'}
                    hint={!isPipsMode && stopDistance ? `${stopDistance}` : null}
                    value={stopLoss}
                    onChange={setStopLoss}
                    placeholder={isPipsMode ? '250' : '1.08300'}
                    tone={T.bad}
                  />
                </div>

                {/* ризик */}
                <div>
                  <label htmlFor="calc-risk" className="mb-2 flex items-baseline justify-between text-[13px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: T.bad }} />
                      Ризик на угоду
                    </span>
                    {riskMoney && <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.bad }}>{riskMoney}</span>}
                  </label>

                  <div className="flex gap-2">
                    {/* Порівняння числове, не рядкове. Раніше тут було
                        String(riskPercent) === v, і при значенні '1.0'
                        чип '1' ніколи не підсвічувався — вибране
                        значення виглядало як невибране. */}
                    <div className="flex flex-1 gap-1.5">
                      {['0.25', '0.5', '1', '2'].map((v) => {
                        const on = Number(riskPercent) === Number(v);
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => { setRiskPercent(v); localStorage.setItem('calc_risk_percent', v); }}
                            className="h-14 flex-1 rounded-xl text-[15px] font-bold tabular-nums transition-colors"
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
                      className={`h-14 w-[84px] shrink-0 rounded-xl px-2 text-center text-[17px] outline-none transition-colors ${NO_SPIN}`}
                      style={{ fontFamily: T.mono, background: T.sunken, border: `1px solid ${T.line}`, color: T.bad }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.45)`)}
                      onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                    />
                  </div>
                </div>

                {/* Тейк останній і підписаний як необовʼязковий — він і
                    справді думається після того, як ризик уже заданий. */}
                <Field
                  id="calc-tp"
                  label={isPipsMode ? 'Тейк, пунктів' : 'Тейк'}
                  hint="не обовʼязково"
                  value={takeProfit}
                  onChange={setTakeProfit}
                  placeholder={isPipsMode ? '500' : '1.08900'}
                  tone={T.ok}
                />

                {/* Розмір контракту підставляється з активу сам, тому
                    ховається. Раніше він стояв поруч із ризиком і мав
                    три різні підписи на одне поле. */}
                <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
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
                            className={`h-11 w-full rounded-xl px-3.5 text-[15px] outline-none ${NO_SPIN}`}
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
              </div>
            </Card>
          </motion.div>
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
