import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';
import Fuse from 'fuse.js';
import { 
  Calculator as CalcIcon, Wallet, ChevronDown, 
  DollarSign, Crosshair, Search as SearchIcon, Loader2, Edit3 
} from 'lucide-react';

// Імпорт сповіщень
import { notify } from '../utils/notify';
import { T } from '../lib/theme';

// Імпорти суб-компонентів
import AssetIcon, { CURRENCY_TO_FLAG } from '../components/ui/AssetIcon';
import { InputWithCopy } from '../components/ui/CopyElements';
import ResultsBoard from '../components/calculator/ResultsBoard';
import AssetSearchModal from '../components/modals/AssetSearchModal';

const QUICK_SELECT_SYMBOLS = ['BTC/USD', 'EUR/USD', 'GER40', 'ETH/USD', 'GBP/USD', 'XAU/USD'];

// --- АНІМАЦІЙНІ ВАРІАНТИ ---
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: 'spring', stiffness: 350, damping: 26 } }
};

// --- НАДІЙНА ВЕРСІЯ КАРТКИ ЗІ СВІТЛОМ (З ACCOUNTS) ---
function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.05)", onClick, layout, initial, animate, exit }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });
  const rotateY = useSpring(0, { stiffness: 200, damping: 25, mass: 0.5 });

  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top, width, height } = currentTarget.getBoundingClientRect();
    const localX = clientX - left;
    const localY = clientY - top;
    mouseX.set(localX);
    mouseY.set(localY);

    const maxRotate = 3; // Легкий 3D ефект нахилу
    const px = Math.max(-1, Math.min(1, (localX / width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, (localY / height) * 2 - 1));

    rotateX.set(-py * maxRotate);
    rotateY.set(px * maxRotate);
  }

  function handleMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <motion.div
      layout={layout}
      initial={initial}
      animate={animate}
      exit={exit}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1200 }}
      className="relative group w-full h-full"
    >
      <motion.div
        style={{ rotateX, rotateY, transformPerspective: 1200 }}
        className={`relative w-full h-full ${className}`}
      >
        <motion.div
          className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 rounded-[inherit]"
          style={{
            background: useMotionTemplate`radial-gradient(500px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`,
          }}
        />
        <div className="relative z-10 h-full w-full">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export default function Calculator() {
  // --- СТАН ---
  const [accounts, setAccounts] = useState([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  
  const [flatAssets, setFlatAssets] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  
  const [favorites, setFavorites] = useState([]);
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  
  const accountRef = useRef(null);
  const searchInputRef = useRef(null);

  // Стейт для глобального відстеження світла за мишкою
  const globalMouseX = useMotionValue(0);
  const globalMouseY = useMotionValue(0);

  function handleGlobalMouseMove({ clientX, clientY }) {
    globalMouseX.set(clientX);
    globalMouseY.set(clientY);
  }

  // Відновлення налаштувань з localStorage
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [balance, setBalance] = useState('');
  const [riskPercent, setRiskPercent] = useState(() => localStorage.getItem('calc_risk_percent') || '1.0');
  
  const [assetPair, setAssetPair] = useState(() => localStorage.getItem('calc_selected_asset') || ''); 
  const [contractSize, setContractSize] = useState(() => localStorage.getItem('calc_contract_size') || '');

  // Стан для перемикання між ціною та піпсами
  const [isPipsMode, setIsPipsMode] = useState(() => localStorage.getItem('calc_pips_mode') === 'true');

  const [assetSearch, setAssetSearch] = useState(''); 
  const deferredSearch = useDeferredValue(assetSearch);

  const [entryPrice, setEntryPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');

  const [expandedCategories, setExpandedCategories] = useState({
    'Forex Majors': true,
    'Cryptocurrencies': true,
  });

  const toggleCategory = (cat) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  // Scroll Lock для модалки
  useEffect(() => {
    if (isAssetModalOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isAssetModalOpen]);

  // Завантаження акаунтів
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
          } else if (savedAcc && accData.some(a => a.id === savedAcc)) {
            setSelectedAccount(savedAcc);
            const activeAcc = accData.find(a => a.id === savedAcc);
            setBalance(activeAcc.balance.toString());
          } else {
            setSelectedAccount(accData[0].id);
            setBalance(accData[0].balance.toString());
          }
        } else {
          setSelectedAccount('custom');
          setBalance(savedBal || '');
        }
      } catch (error) {
        console.error("Помилка акаунтів:", error);
        setSelectedAccount('custom');
        setBalance(localStorage.getItem('calc_custom_balance') || '');
      } finally {
        setIsLoadingAccounts(false);
      }
    }
    fetchAccounts();
  }, []);

  // Синхронізація Favorites
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
          const dbFavs = data.map(item => item.name);
          if (JSON.stringify(dbFavs) !== cachedFavs) {
            setFavorites(dbFavs);
            localStorage.setItem(CACHE_KEY, JSON.stringify(dbFavs));
          }
        }
      } catch (err) {
        console.error("Помилка інструментів:", err);
      }
    }
    fetchFavorites();
  }, []);

  // Завантаження інструментів ринку
  useEffect(() => {
    async function fetchMarketData() {
      setIsLoadingAssets(true);
      const CACHE_KEY = 'calculator_market_assets_v3';
      const CACHE_TIME_KEY = 'calculator_market_assets_time_v3';
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const cachedData = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      const now = Date.now();

      if (cachedData && cachedTime && (now - Number(cachedTime) < ONE_DAY_MS)) {
        try {
          const parsedCache = JSON.parse(cachedData);
          setFlatAssets(parsedCache.flat);
          setIsLoadingAssets(false);
          preloadQuickSelectImages(parsedCache.flat); 
          return; 
        } catch (e) {
          console.warn("Помилка парсингу кешу.");
        }
      }

      const combinedAssets = [];
      try {
        const { data: dbAssets, error } = await supabase.from('instruments').select('symbol, category, contract_size');
        if (dbAssets && !error) {
          combinedAssets.push(...dbAssets.map(item => ({
            symbol: item.symbol, category: item.category, contractSize: Number(item.contract_size)
          })));
        }

        try {
          const binanceRes = await fetch('https://api.binance.com/api/v3/exchangeInfo');
          const binanceData = await binanceRes.json();
          const cryptoPairs = binanceData.symbols
            .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .slice(0, 40)
            .map(s => ({ symbol: s.symbol.replace('USDT', '/USD'), category: 'Cryptocurrencies', contractSize: 1 }));
          combinedAssets.push(...cryptoPairs);
        } catch (binanceErr) {}

        setFlatAssets(combinedAssets);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ flat: combinedAssets }));
        localStorage.setItem(CACHE_TIME_KEY, now.toString());
        preloadQuickSelectImages(combinedAssets);

      } catch (error) {
        console.error("Помилка маркет-дати:", error);
      } finally {
        setIsLoadingAssets(false);
      }
    }
    fetchMarketData();
  }, []);

  const preloadQuickSelectImages = (assets) => {
    QUICK_SELECT_SYMBOLS.forEach(sym => {
      const asset = assets.find(a => a.symbol === sym);
      if (!asset) return;
      const clean = asset.symbol.replace('/', '');
      if (asset.category === 'Cryptocurrencies' && asset.symbol.includes('/')) {
        const coin = asset.symbol.split('/')[0].toLowerCase();
        new Image().src = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`;
      } else if (clean.length === 6) {
        const b = clean.substring(0,3).toLowerCase();
        const q = clean.substring(3,6).toLowerCase();
        if (CURRENCY_TO_FLAG[b.toUpperCase()]) new Image().src = `https://flagcdn.com/${CURRENCY_TO_FLAG[b.toUpperCase()]}.svg`;
        if (CURRENCY_TO_FLAG[q.toUpperCase()]) new Image().src = `https://flagcdn.com/${CURRENCY_TO_FLAG[q.toUpperCase()]}.svg`;
      }
    });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (accountRef.current && !accountRef.current.contains(event.target)) setIsAccountDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleFavorite = async (e, symbol) => {
    e.stopPropagation(); 
    const isFavorite = favorites.includes(symbol);
    let newFavorites;

    if (isFavorite) {
      newFavorites = favorites.filter(f => f !== symbol);
      setFavorites(newFavorites);
      supabase.from('user_assets').delete().match({ name: symbol }).then();
    } else {
      newFavorites = [...favorites, symbol];
      setFavorites(newFavorites);
      supabase.from('user_assets').insert([{ name: symbol }]).then();
    }
    localStorage.setItem('calculator_favorites_v1', JSON.stringify(newFavorites));
  };

  const handleAccountSelect = (acc) => {
    const type = acc === 'custom' ? 'custom' : acc.id;
    setSelectedAccount(type);
    localStorage.setItem('calc_selected_account', type);

    if (acc === 'custom') {
      const savedBal = localStorage.getItem('calc_custom_balance') || '';
      setBalance(savedBal);
    } else {
      setBalance(acc.balance.toString());
    }
    setIsAccountDropdownOpen(false);
  };

  const handleAssetSelect = (asset) => {
    setIsAssetModalOpen(false); 
    
    requestAnimationFrame(() => {
      setAssetPair(asset.symbol);
      setContractSize(asset.contractSize.toString());
      
      localStorage.setItem('calc_selected_asset', asset.symbol);
      localStorage.setItem('calc_contract_size', asset.contractSize.toString());
    });
    
    setTimeout(() => {
      setAssetSearch('');
    }, 300);
  };

  const handleModalClose = () => {
    setIsAssetModalOpen(false);
    setTimeout(() => setAssetSearch(''), 300);
  };

  const fuse = useMemo(() => new Fuse(flatAssets, { keys: ['symbol'], threshold: 0.4 }), [flatAssets]);

  const displayCategories = useMemo(() => {
    let results = flatAssets;
    if (deferredSearch.trim() !== '') {
      results = fuse.search(deferredSearch).map(r => r.item);
    }
    const grouped = {};
    results.forEach(asset => {
      if (!grouped[asset.category]) grouped[asset.category] = [];
      grouped[asset.category].push(asset);
    });
    return grouped;
  }, [flatAssets, deferredSearch, fuse]);

  const quickSelectAssets = useMemo(() => QUICK_SELECT_SYMBOLS.map(sym => flatAssets.find(a => a.symbol === sym)).filter(Boolean), [flatAssets]);
  const favoriteAssetsList = useMemo(() => favorites.map(sym => flatAssets.find(a => a.symbol === sym)).filter(Boolean), [favorites, flatAssets]);

  // РОЗРАХУНОК: Врахування Тіків (Points) замість класичних Піпсів (Pips)
  const calculatePosition = () => {
    const bal = Number(balance) || 0;
    const riskPct = Number(riskPercent) || 0;
    const entry = Number(entryPrice);
    const slInput = Number(stopLoss);
    const tpInput = Number(takeProfit);
    const activeContractSize = Number(contractSize) || 100000;
    const riskAmt = bal * (riskPct / 100);

    // Базові перевірки
    if (!slInput || riskAmt === 0 || !assetPair) {
      return { lotSize: '0.00', riskAmount: '0.00', rr: '0.00', profit: '0.00' };
    }
    
    // В Price Mode ми зобов'язані мати Entry, щоб порахувати дистанцію
    if (!isPipsMode && !entry) {
      return { lotSize: '0.00', riskAmount: '0.00', rr: '0.00', profit: '0.00' };
    }

    const assetSpec = flatAssets.find(a => a.symbol === assetPair) || { category: 'Forex' };
    const safeCategory = assetSpec.category?.toLowerCase() || '';
    const cleanSymbol = assetPair.replace('/', '').toUpperCase();
    
    let distance = 0;

    if (isPipsMode) {
      // Розмір 1 тіка (Point) для різних інструментів
      let tickSize = 0.00001; 
      if (safeCategory.includes('crypto')) {
        tickSize = 0.01; 
      } else if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
        tickSize = 0.01;
      } else if (cleanSymbol.includes('JPY')) {
        tickSize = 0.001;
      } else if (safeCategory.includes('forex') || cleanSymbol.length === 6) {
        tickSize = 0.00001;
      } else {
        tickSize = 0.01; 
      }
      
      // Дистанція розраховується чисто з введених тіків
      distance = slInput * tickSize;
    } else {
      // Дистанція розраховується як різниця цін
      distance = Math.abs(entry - slInput);
    }

    if (distance === 0) {
      return { lotSize: '0.00', riskAmount: '0.00', rr: '0.00', profit: '0.00' };
    }

    // Базовий розрахунок лота
    let calculatedLot = riskAmt / (distance * activeContractSize);
    
    // Коригування для JPY пар
    if (assetPair.includes('JPY') && !safeCategory.includes('crypto')) {
      const jpyRate = entry || 150; 
      calculatedLot = (riskAmt * jpyRate) / (distance * activeContractSize); 
    }

    // Розрахунок RR та Profit
    let rr = 0; let profit = 0;
    if (tpInput) {
      if (isPipsMode) {
        rr = tpInput / slInput;
      } else {
        if (!entry) return { lotSize: calculatedLot.toFixed(2), riskAmount: riskAmt.toFixed(2), rr: '0.00', profit: '0.00' };
        const tpDistance = Math.abs(tpInput - entry);
        rr = tpDistance / distance;
      }
      profit = riskAmt * rr;
    }
    
    return {
      lotSize: calculatedLot.toFixed(2),
      riskAmount: riskAmt.toFixed(2),
      rr: rr > 0 ? rr.toFixed(2) : '0.00',
      profit: profit.toFixed(2)
    };
  };

  const { lotSize, riskAmount, rr, profit } = calculatePosition();

  /* Чого саме бракує для розрахунку — щоб табло не мовчало нулями */
  const missingFields = useMemo(() => {
    const m = [];
    if (!Number(balance)) m.push('депозит');
    if (!Number(riskPercent)) m.push('ризик %');
    if (!assetPair) m.push('актив');
    if (!isPipsMode && !Number(entryPrice)) m.push('вхід');
    if (!Number(stopLoss)) m.push(isPipsMode ? 'стоп у пунктах' : 'стоп');
    return m;
  }, [balance, riskPercent, assetPair, entryPrice, stopLoss, isPipsMode]);

  /* Дистанція стопу для підпису під табло */
  const stopDistance = useMemo(() => {
    if (!Number(stopLoss)) return 0;
    if (isPipsMode) return Number(stopLoss);
    if (!Number(entryPrice)) return 0;
    return Number(Math.abs(Number(entryPrice) - Number(stopLoss)).toFixed(5));
  }, [stopLoss, entryPrice, isPipsMode]);
  const noSpinnerClass = "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]";

  return (
    <div 
      className="min-h-screen w-full relative overflow-hidden"
      onMouseMove={handleGlobalMouseMove}
    >
      {/* ФОН — той самий, що на решті сайту, плюс промінь за курсором */}
      <div className="fixed inset-0 z-[0] pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[150px]" style={{ background: `rgba(${T.accRgb},0.10)` }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px]" style={{ background: `rgba(${T.accRgb},0.06)` }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]"></div>
        <motion.div
          className="absolute inset-0 z-10"
          style={{ background: useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(${T.accRgb}, 0.05), transparent 80%)` }}
        />
      </div>

      {/* ГОЛОВНИЙ КОНТЕЙНЕР */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-10 font-sans text-zinc-200 relative z-[10]">
        
        {/* Шапка — в одному стилі з рештою сторінок */}
        <motion.div variants={itemVariants} className="mb-9 flex items-center gap-4 pb-6" style={{ borderBottom: `1px solid ${T.line}` }}>
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl backdrop-blur-md"
            style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.accLine}`, boxShadow: `0 0 30px rgba(${T.accRgb},0.14)` }}
          >
            <CalcIcon size={26} style={{ color: T.acc }} />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Ризик-менеджмент
            </div>
            <h1
              className="text-[32px] font-bold leading-none sm:text-[38px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Калькулятор позиції
            </h1>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Панель балансу */}
            <motion.div variants={itemVariants} className="relative z-20">
              <SpotlightCard glowColor="rgba(139,123,255,0.15)" className="bg-black/40 backdrop-blur-xl border border-[var(--edge-hair-strong)] rounded-[2rem] p-8 shadow-2xl transition-all duration-300">
                <h2 className="text-[10px] font-black text-[#8b7bff] uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Wallet size={14} /> Capital Source
                </h2>
                <div className="relative mb-6" ref={accountRef}>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Select Account</label>
                  <div 
                    onClick={() => !isLoadingAccounts && setIsAccountDropdownOpen(!isAccountDropdownOpen)}
                    className={`w-full bg-[#111218]/80 backdrop-blur border border-[var(--edge-hair)] hover:border-[#8b7bff]/50 p-4 rounded-xl flex items-center justify-between transition-all ${isLoadingAccounts ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
                  >
                    <span className="font-bold text-sm">
                      {isLoadingAccounts ? (
                        <span className="flex items-center gap-2 text-zinc-500"><Loader2 size={14} className="animate-spin" /> Перевірка кешу...</span>
                      ) : selectedAccount === 'custom' ? (
                        'Custom Balance'
                      ) : (
                        accounts.find(a => a.id === selectedAccount)?.firm_name || 'Select Account...'
                      )}
                    </span>
                    <ChevronDown size={16} className={`text-zinc-500 transition-transform ${isAccountDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <AnimatePresence>
                    {isAccountDropdownOpen && !isLoadingAccounts && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }} className="absolute top-full left-0 w-full mt-2 bg-[#1A1A1A] border border-[#333] rounded-xl overflow-hidden shadow-2xl z-50">
                        <div className="p-2 flex flex-col gap-1 max-h-[240px] overflow-y-auto custom-scrollbar">
                          {accounts.map(acc => (
                            <button key={acc.id} onClick={() => handleAccountSelect(acc)} className={`flex justify-between items-center px-4 py-3 rounded-lg text-sm font-bold transition-all ${selectedAccount === acc.id ? 'bg-[#8b7bff]/10 text-[#a99bff]' : 'text-zinc-400 hover:bg-[#222] hover:text-[var(--edge-text)]'}`}>
                              <span>{acc.firm_name}</span>
                              <span className="text-xs opacity-60">${acc.balance.toLocaleString()}</span>
                            </button>
                          ))}
                          <button onClick={() => handleAccountSelect('custom')} className={`text-left px-4 py-3 rounded-lg text-sm font-bold transition-all border-t border-[#333] mt-1 ${selectedAccount === 'custom' ? 'bg-[#8b7bff]/10 text-[#a99bff]' : 'text-zinc-400 hover:bg-[#222] hover:text-[var(--edge-text)]'}`}>
                            Manual / Custom Balance
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Account Balance ($)</label>
                  <div className="relative group">
                    <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-[#8b7bff] transition-colors" size={18} />
                    <input 
                      type="number" 
                      value={balance} 
                      onChange={(e) => { 
                        const val = e.target.value;
                        setBalance(val); 
                        setSelectedAccount('custom'); 
                        localStorage.setItem('calc_selected_account', 'custom');
                        localStorage.setItem('calc_custom_balance', val);
                      }} 
                      className={`w-full bg-[#111218]/80 backdrop-blur border border-[var(--edge-hair)] pl-12 pr-4 py-4 rounded-xl text-[var(--edge-text)] font-mono text-lg outline-none focus:border-[#8b7bff]/50 transition-all ${noSpinnerClass}`} 
                      placeholder="100000" 
                    />
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>

            {/* Параметри Угоди */}
            <motion.div variants={itemVariants} className="relative z-10">
              <SpotlightCard glowColor="rgba(139,123,255,0.15)" className="bg-black/40 backdrop-blur-xl border border-[var(--edge-hair-strong)] rounded-[2rem] p-8 shadow-2xl transition-all duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[10px] font-black text-[#8b7bff] uppercase tracking-widest flex items-center gap-2">
                    <Crosshair size={14} /> Trade Parameters
                  </h2>
                </div>

                {/* ПЕРЕМИКАЧ РЕЖИМІВ */}
                <div className="flex p-1 bg-[#111218]/90 border border-[var(--edge-hair)] rounded-xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPipsMode(false);
                      localStorage.setItem('calc_pips_mode', 'false');
                      notify.success('Price Mode Активний', 'Розрахунок ведеться за цінами');
                    }}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${!isPipsMode ? 'bg-zinc-800 text-[var(--edge-text)] shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Price Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPipsMode(true);
                      localStorage.setItem('calc_pips_mode', 'true');
                      notify.success('Ticks Mode Активний', 'Розрахунок ведеться в тіках (Points)');
                    }}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${isPipsMode ? 'bg-[#8b7bff] text-[var(--edge-text)] shadow-[0_0_15px_rgba(139,123,255,0.4)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Ticks / Points Mode
                  </button>
                </div>

                <div className="space-y-6">
                  
                  <div className="relative">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex justify-between">
                      <span>Asset</span>
                      {isLoadingAssets && <Loader2 size={12} className="animate-spin text-[#8b7bff]" />}
                    </label>
                    <div 
                      onClick={() => !isLoadingAssets && setIsAssetModalOpen(true)}
                      className="w-full bg-[#111218]/80 backdrop-blur border border-[var(--edge-hair)] hover:border-[#8b7bff]/50 p-4 rounded-xl flex items-center justify-between cursor-pointer transition-all min-h-[58px]"
                    >
                      <div className="flex items-center gap-4">
                        {assetPair && (
                          <AssetIcon symbol={assetPair} category={flatAssets.find(a => a.symbol === assetPair)?.category} />
                        )}
                        <span className={`font-bold text-sm tracking-wider uppercase ${assetPair ? 'text-[var(--edge-text)]' : 'text-zinc-600'}`}>
                          {assetPair || 'SELECT FINANCIAL ASSET...'}
                        </span>
                      </div>
                      <SearchIcon size={16} className="text-zinc-500" />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-widest" style={{ color: T.text4 }}>
                        <span>Ризик</span>
                        <span style={{ color: T.bad }}>
                          {Number(balance) && Number(riskPercent)
                            ? `$${(Number(balance) * Number(riskPercent) / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 })}`
                            : `${riskPercent || 0}%`}
                        </span>
                      </label>

                      {/* типові значення — один клік замість набору */}
                      <div className="mb-2 flex gap-1.5">
                        {['0.25', '0.5', '1', '2'].map((v) => {
                          const on = String(riskPercent) === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              onClick={() => { setRiskPercent(v); localStorage.setItem('calc_risk_percent', v); }}
                              className="h-8 flex-1 rounded-lg text-[12.5px] font-bold tabular-nums transition-colors duration-200"
                              style={{
                                fontFamily: T.mono,
                                color: on ? T.bad : T.text4,
                                background: on ? `rgba(${T.badRgb},0.12)` : 'transparent',
                                border: `1px solid ${on ? `rgba(${T.badRgb},0.30)` : T.line}`,
                              }}
                              onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; } }}
                              onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; } }}
                            >
                              {v}%
                            </button>
                          );
                        })}
                      </div>

                      <input
                        type="text"
                        inputMode="decimal"
                        value={riskPercent}
                        onChange={(e) => {
                          /* кома з української розкладки ламала розрахунок */
                          const val = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
                          setRiskPercent(val);
                          localStorage.setItem('calc_risk_percent', val);
                        }}
                        className={`w-full rounded-xl px-4 py-4 text-center font-mono outline-none transition-all ${noSpinnerClass}`}
                        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.bad }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.45)`)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2 flex justify-between items-center">
                        <span>Contract Size</span>
                        <Edit3 size={12} className="text-[#8b7bff]" />
                      </label>
                      <input 
                        type="number" 
                        value={contractSize} 
                        onChange={(e) => {
                          setContractSize(e.target.value);
                          localStorage.setItem('calc_contract_size', e.target.value);
                        }} 
                        placeholder="Size" 
                        className={`w-full bg-[#111218]/80 backdrop-blur border border-[var(--edge-hair)] px-4 py-4 rounded-xl text-[#a99bff] font-mono text-center outline-none focus:border-[#8b7bff]/50 transition-all ${noSpinnerClass}`} 
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[var(--edge-hair)]">
                    <InputWithCopy 
                      label="Entry Price" 
                      value={entryPrice} 
                      setValue={setEntryPrice} 
                      dotColor="bg-[#8b7bff]" 
                      textColor="text-[var(--edge-text)]" 
                    />
                    
                    {/* Динамічні інпути зі зміною кольорів при Ticks Mode */}
                    <div className={`transition-all rounded-xl ${isPipsMode ? 'ring-1 ring-emerald-500/30 bg-emerald-500/5' : ''}`}>
                      <InputWithCopy 
                        label={isPipsMode ? "Take Profit (Ticks / Points)" : "Take Profit (Price)"} 
                        value={takeProfit} 
                        setValue={setTakeProfit} 
                        dotColor="bg-emerald-500" 
                        textColor="text-emerald-100" 
                      />
                    </div>
                    
                    <div className={`transition-all rounded-xl ${isPipsMode ? 'ring-1 ring-red-500/30 bg-red-500/5' : ''}`}>
                      <InputWithCopy 
                        label={isPipsMode ? "Stop Loss (Ticks / Points)" : "Stop Loss (Price)"} 
                        value={stopLoss} 
                        setValue={setStopLoss} 
                        dotColor="bg-red-500" 
                        textColor="text-red-100" 
                      />
                    </div>
                  </div>

                </div>
              </SpotlightCard>
            </motion.div>
          </div>

          <ResultsBoard
            lotSize={lotSize}
            riskAmount={riskAmount}
            profit={profit}
            rr={rr}
            missing={missingFields}
            balance={balance}
            riskPercent={riskPercent}
            stopDistance={stopDistance}
            isPipsMode={isPipsMode}
            assetPair={assetPair}
          />
          
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