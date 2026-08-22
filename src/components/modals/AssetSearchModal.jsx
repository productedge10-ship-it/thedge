import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, X, Star, ChevronDown, ChevronRight, Check } from 'lucide-react';
import AssetIcon from '../ui/AssetIcon';

export default function AssetSearchModal({
  isOpen,
  onClose,
  searchInputRef,
  assetSearch,
  setAssetSearch,
  deferredSearch,
  favoriteAssetsList,
  quickSelectAssets,
  displayCategories,
  expandedCategories,
  toggleCategory,
  handleAssetSelect,
  handleToggleFavorite,
  assetPair,
  favorites
}) {
  if (!isOpen) return null;

  return (
    <motion.div 
      id="modal-backdrop" 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-[100] flex items-center justify-center p-4 select-none"
      onClick={(e) => {
        if (e.target.id === 'modal-backdrop') onClose();
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
            <button onClick={onClose} className="text-zinc-500 hover:text-[var(--edge-text)] transition-colors p-1 bg-[var(--edge-hair)] rounded-lg border border-[var(--edge-hair)]">
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
                  <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 bg-[var(--edge-surface)] border rounded-xl transition-all group text-left ${assetPair === asset.symbol ? 'border-amber-500 bg-amber-500/5' : 'border-[var(--edge-hair)] hover:border-amber-500/30 hover:bg-[var(--edge-surface-hi)]'}`}>
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
                    <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 bg-[var(--edge-surface)] border rounded-xl transition-all group text-left ${assetPair === asset.symbol ? 'border-blue-500 bg-blue-500/5' : 'border-[var(--edge-hair)] hover:border-[var(--edge-hair-strong)] hover:bg-[var(--edge-surface-hi)]'}`}>
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
                                <button key={asset.symbol} onClick={() => handleAssetSelect(asset)} className={`flex items-center justify-between p-3 rounded-xl transition-all text-left group ${assetPair === asset.symbol ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-[var(--edge-surface)]/60 text-zinc-400 hover:bg-[var(--edge-surface-hi)] hover:text-[var(--edge-text)] border border-transparent'}`}>
                                  <div className="flex items-center gap-4">
                                    <AssetIcon symbol={asset.symbol} category={asset.category} />
                                    <div>
                                      <div className="text-xs font-bold uppercase tracking-wider text-zinc-200">{asset.symbol}</div>
                                      <div className="text-[10px] text-zinc-500 mt-0.5">Contract Size: {asset.contractSize.toLocaleString()}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <Star size={16} className={`transition-all ${isFav ? 'text-amber-500 fill-amber-500' : 'text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-amber-500'}`} onClick={(e) => handleToggleFavorite(e, asset.symbol)} />
                                    {assetPair === asset.symbol && <Check size={14} className="text-blue-500" />}
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
  );
}