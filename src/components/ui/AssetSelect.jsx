import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Activity, CircleDot, Plus, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase'; //

const getIcon = (pair) => {
  const p = pair.toUpperCase();
  if (p.includes('EUR')) return <span className="mr-2">🇪🇺</span>;
  if (p.includes('GER')) return <span className="mr-2">🇩🇪</span>;
  if (p.includes('NQ') || p.includes('S&P')) return <Activity size={14} className="mr-2 text-accent" />;
  return <CircleDot size={14} className="mr-2 text-textMuted" />;
};

const defaultPairs = ['GER40', 'EURUSD', 'NQ100', 'S&P500', 'GOLD', 'NZD/USD', 'BTC', 'ETH', 'SOL'];

export default function AssetSelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [userPairs, setUserPairs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Завантажуємо активи користувача при монтуванні
  useEffect(() => {
    fetchUserAssets();
    
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchUserAssets() {
    const { data, error } = await supabase
      .from('user_assets')
      .select('name')
      .order('name');
    if (!error && data) setUserPairs(data.map(d => d.name));
  }

  // Об'єднуємо дефолтні та кастомні пари, прибираючи дублікати
  const allPairs = [...new Set([...defaultPairs, ...userPairs])];
  const filtered = allPairs.filter(p => p.toLowerCase().includes(search.toLowerCase()));

  // Чи потрібно показувати кнопку "Додати новий"
  const showAddButton = search.trim() !== '' && !allPairs.some(p => p.toLowerCase() === search.toLowerCase().trim());

  const handleAddAsset = async () => {
    const newName = search.trim().toUpperCase();
    setIsLoading(true);
    try {
      const { error } = await supabase.from('user_assets').insert([{ name: newName }]);
      if (!error) {
        setUserPairs(prev => [...prev, newName]);
        onChange(newName);
        setSearch('');
        setIsOpen(false);
      } else {
        console.error("Error adding asset:", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAsset = async (e, name) => {
    e.stopPropagation();
    if (defaultPairs.includes(name)) return; // Не видаляємо дефолтні
    
    const { error } = await supabase.from('user_assets').delete().eq('name', name);
    if (!error) {
      setUserPairs(prev => prev.filter(p => p !== name));
      if (value === name) onChange('');
    }
  };

  return (
    <div className="relative w-[150px]" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between bg-transparent hover:bg-[#262626] px-2 py-1 -ml-2 rounded-md transition-colors cursor-pointer h-[32px]"
      >
        <div className="flex items-center text-sm text-textMain font-bold truncate pr-1">
          {value ? <>{getIcon(value)} {value}</> : <span className="text-textMuted font-normal">Select pair...</span>}
        </div>
        <ChevronDown size={14} className={`text-textMuted shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute z-50 top-full left-0 mt-1 w-[220px] bg-[#252525] border border-[#333] rounded-md shadow-2xl overflow-hidden"
          >
            <div className="p-2 border-b border-[#333] flex items-center gap-2">
              <Search size={12} className="text-textMuted" />
              <input 
                autoFocus
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                className="bg-transparent text-xs outline-none w-full text-[var(--edge-text)]" 
                placeholder="Search or add new..." 
              />
            </div>

            <div className="p-1 max-h-48 overflow-y-auto custom-scrollbar">
              {filtered.map(p => (
                <div key={p} className="flex group items-center">
                  <button 
                    onClick={() => { onChange(p); setIsOpen(false); }} 
                    className="flex-1 flex items-center px-3 py-2 text-xs hover:bg-[var(--edge-hair)] rounded-md text-[#ccc] hover:text-[var(--edge-text)] transition-all text-left"
                  >
                    {getIcon(p)} {p}
                  </button>
                  
                  {/* Кнопка видалення тільки для кастомних активів */}
                  {userPairs.includes(p) && (
                    <button 
                      onClick={(e) => handleRemoveAsset(e, p)}
                      className="p-2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}

              {filtered.length === 0 && !showAddButton && (
                <div className="p-4 text-center text-[10px] text-gray-500 uppercase font-bold">
                  No assets found
                </div>
              )}
            </div>

            {showAddButton && (
              <button 
                onClick={handleAddAsset}
                disabled={isLoading}
                className="w-full flex items-center gap-2 p-3 bg-blue-600/10 border-t border-[#333] text-blue-400 hover:bg-blue-600/20 transition-all text-xs font-bold"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add "{search.toUpperCase()}"
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}