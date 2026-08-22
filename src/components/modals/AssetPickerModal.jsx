import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { supabase } from '../../lib/supabase'; // Перевір шлях
import { motion, AnimatePresence } from 'framer-motion';
import Fuse from 'fuse.js';
import { Search as SearchIcon, X, Star, ChevronDown, ChevronRight, Check } from 'lucide-react';

const CURRENCY_TO_FLAG = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au', 
  CAD: 'ca', CHF: 'ch', NZD: 'nz', CNH: 'cn', HKD: 'hk',
  SGD: 'sg', MXN: 'mx', NOK: 'no', SEK: 'se', DKK: 'dk'
};

const QUICK_SELECT_SYMBOLS = ['BTC/USD', 'EUR/USD', 'GER40', 'ETH/USD', 'GBP/USD', 'XAU/USD'];

export function AssetIcon({ symbol, category }) {
  if (!symbol) return null;
  const cleanSymbol = symbol.replace('/', '').toUpperCase();

  if (category?.toLowerCase().includes('crypto') || category?.toLowerCase().includes('cryptocurrencies')) {
    const coin = symbol.split('/')[0].toLowerCase().trim();
    const cryptoUrl = `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${coin}.svg`;
    return (
      <img src={cryptoUrl} alt={symbol} className="w-6 h-6 rounded-full object-contain bg-zinc-900/50" 
        onError={(e) => { e.target.src = 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/generic.svg'; }} 
      />
    );
  }

  if (category?.toLowerCase().includes('forex') || cleanSymbol.length === 6) {
    const base = cleanSymbol.substring(0, 3);
    const quote = cleanSymbol.substring(3, 6);
    const flag1 = CURRENCY_TO_FLAG[base] || 'un';
    const flag2 = CURRENCY_TO_FLAG[quote] || 'un';

    return (
      <div className="flex items-center relative w-9 h-6 select-none">
        <img src={`https://flagcdn.com/${flag1}.svg`} alt={base} className="w-5 h-5 rounded-full object-cover border-2 border-[var(--edge-bg)] z-10 absolute left-0 shadow-md" />
        <img src={`https://flagcdn.com/${flag2}.svg`} alt={quote} className="w-5 h-5 rounded-full object-cover border-2 border-[var(--edge-bg)] absolute left-3.5 shadow-md" />
      </div>
    );
  }

  if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
    return <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 border border-amber-500/30 flex items-center justify-center text-[9px] font-black text-black shadow-lg shadow-amber-500/10">Au</div>;
  }

  if (cleanSymbol.includes('WTI') || cleanSymbol.includes('BRENT') || cleanSymbol.includes('OIL')) {
    return <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300">🛢️</div>;
  }

  return <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center text-[8px] font-black text-blue-400 tracking-tighter uppercase shadow-inner">{cleanSymbol.substring(0, 3)}</div>;
}

export default function AssetPickerModal({ isOpen, onClose, onSelect, selectedAsset }) {
  const [flatAssets, setFlatAssets] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const searchInputRef = useRef(null);

  const [assetSearch, setAssetSearch] = useState(''); 
  const deferredSearch = useDeferredValue(assetSearch);

  const [expandedCategories, setExpandedCategories] = useState({
    'Forex Majors': true,
    'Cryptocurrencies': true,
  });

  const toggleCategory = (cat) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  useEffect(() => {
    if (!isOpen) return;
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
      } catch (err) { console.error(err); }
    }
    fetchFavorites();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    async function fetchMarketData() {
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
          return; 
        } catch (e) {}
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
      } catch (error) { console.error(error); }
    }
    fetchMarketData();
  }, [isOpen]);

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

  const handleAssetSelect = (asset) => {
    onSelect(asset.symbol, asset.category); 
    onClose();
    setTimeout(() => setAssetSearch(''), 300);
  };

  const handleModalClose = () => {
    onClose();
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          id="modal-backdrop" 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-[300] flex items-center justify-center p-4 select-none"
          onClick={(e) => {
            if (e.target.id === 'modal-backdrop') handleModalClose();
          }}
        >
          <motion.div 
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => searchInputRef.current?.focus()}
            className="bg-[var(--edge-surface)] border border-blue-500/20 w-full max-w-2xl rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(59,130,246,0.18)] flex flex-col h-[85vh] md:h-[80vh]"
          >
            <div className="p-6 border-b border-[var(--edge-hair)] relative bg-[#0E1017]">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent"></div>
              
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-[var(--edge-text)] uppercase tracking-wider flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></span>
                  Select Trading Instrument
                </h3>
                <button onClick={handleModalClose} className="text-zinc-500 hover:text-[var(--edge-text)] transition-colors p-1 bg-[var(--edge-hair)] rounded-lg border border-[var(--edge-hair)]">
                  <X size={18} />
                </button>
              </div>
              <div className="relative">
                <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input 
                  ref={searchInputRef}
                  type="text" 
                  value={assetSearch} 
                  onChange={(e) => setAssetSearch(e.target.value)} 
                  placeholder="Search e.g. EUR/USD, BTC, GER40..." 
                  className="w-full bg-[var(--edge-surface)] border border-blue-500/20 focus:border-blue-500/60 rounded-xl pl-12 pr-4 py-3.5 text-[var(--edge-text)] outline-none text-sm transition-all tracking-wide font-medium" 
                />
              </div>
            </div>

            <div className="p-6 overflow-y-scroll overflow-x-hidden custom-scrollbar space-y-8 flex-1 bg-[var(--edge-bg)]">
              
              {deferredSearch.trim() === '' && favoriteAssetsList.length > 0 && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                  <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-3 pl-1 flex items-center gap-1">
                    <Star size={12} className="fill-amber-500" /> My Favorites
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {favoriteAssetsList.map(asset => (
                      <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 bg-[var(--edge-surface)] border rounded-xl transition-all group text-left ${selectedAsset === asset.symbol ? 'border-amber-500 bg-amber-500/5' : 'border-[var(--edge-hair)] hover:border-amber-500/30 hover:bg-[var(--edge-surface-hi)]'}`}>
                        <div className="flex items-center gap-3">
                          <AssetIcon symbol={asset.symbol} category={asset.category} />
                          <span className="text-xs font-bold text-zinc-300 group-hover:text-[var(--edge-text)] uppercase tracking-wider">{asset.symbol}</span>
                        </div>
                        <Star size={14} className="text-amber-500 fill-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" onClick={(e) => handleToggleFavorite(e, asset.symbol)} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {deferredSearch.trim() === '' && quickSelectAssets.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 pl-1">Quick Select</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {quickSelectAssets.map(asset => {
                      const isFav = favorites.includes(asset.symbol);
                      return (
                        <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 bg-[var(--edge-surface)] border rounded-xl transition-all group text-left ${selectedAsset === asset.symbol ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--edge-hair)] hover:border-[var(--edge-hair-strong)] hover:bg-[var(--edge-surface-hi)]'}`}>
                          <div className="flex items-center gap-3">
                            <AssetIcon symbol={asset.symbol} category={asset.category} />
                            <span className="text-xs font-bold text-zinc-300 group-hover:text-[var(--edge-text)] uppercase tracking-wider">{asset.symbol}</span>
                          </div>
                          <Star size={14} className={`transition-colors ${isFav ? 'text-amber-500 fill-amber-500' : 'text-zinc-700 hover:text-amber-500'}`} onClick={(e) => handleToggleFavorite(e, asset.symbol)} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 pl-1">All Markets</h4>
                <div className="space-y-3">
                  {Object.keys(displayCategories).length > 0 ? (
                    Object.entries(displayCategories).map(([category, items]) => {
                      const isExpanded = expandedCategories[category] || deferredSearch.trim() !== '';
                      return (
                        <div key={category} className="bg-[var(--edge-surface)]/50 border border-[var(--edge-hair)] rounded-xl overflow-hidden">
                          <button onClick={() => toggleCategory(category)} disabled={deferredSearch.trim() !== ''} className="w-full flex items-center justify-between py-3.5 px-4 bg-[var(--edge-surface)] text-zinc-400 hover:text-[var(--edge-text)] transition-colors text-left">
                            <span className="text-xs font-black uppercase tracking-wider">{category}</span>
                            {deferredSearch.trim() === '' && (isExpanded ? <ChevronDown size={16} className="text-zinc-500" /> : <ChevronRight size={16} className="text-zinc-500" />)}
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-[var(--edge-bg)]">
                                {items.map(asset => {
                                  const isFav = favorites.includes(asset.symbol);
                                  return (
                                    <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 rounded-xl transition-all text-left group ${selectedAsset === asset.symbol ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-[var(--edge-surface)]/60 text-zinc-400 hover:bg-[var(--edge-surface-hi)] hover:text-[var(--edge-text)] border border-transparent'}`}>
                                      <div className="flex items-center gap-4">
                                        <AssetIcon symbol={asset.symbol} category={asset.category} />
                                        <div>
                                          <div className="text-xs font-bold uppercase tracking-wider text-zinc-200">{asset.symbol}</div>
                                          <div className="text-[10px] text-zinc-500 mt-0.5">Contract Size: {asset.contractSize.toLocaleString()}</div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <Star size={16} className={`transition-all ${isFav ? 'text-amber-500 fill-amber-500' : 'text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-amber-500'}`} onClick={(e) => handleToggleFavorite(e, asset.symbol)} />
                                        {selectedAsset === asset.symbol && <Check size={14} className="text-blue-500" />}
                                      </div>
                                    </button>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-xs text-zinc-600 font-bold uppercase tracking-widest">No matching tools found</div>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}