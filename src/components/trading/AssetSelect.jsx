// src/components/trading/AssetSelect.jsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, ChevronDown } from 'lucide-react';

export default function AssetSelect({ options, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full sm:w-auto shrink-0" ref={dropdownRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full sm:w-[160px] bg-[var(--edge-hair)] hover:bg-[var(--edge-hair)] border border-[var(--edge-hair)] hover:border-[var(--edge-hair-strong)] px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300"
      >
        <div className="flex items-center gap-2.5 text-zinc-200">
          <Filter size={14} className="text-blue-500/80" />
          <span className="text-xs font-bold tracking-wide">{value === 'All' ? 'All Assets' : value}</span>
        </div>
        <ChevronDown size={14} className={`text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, filter: "blur(4px)" }} 
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
            exit={{ opacity: 0, y: -5, filter: "blur(4px)" }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 mt-2 w-full bg-[var(--edge-bg)]/95 backdrop-blur-2xl border border-[var(--edge-hair-strong)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[100] py-1.5 overflow-hidden"
          >
            <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
              {options.map(option => (
                <div
                  key={option}
                  onClick={() => { onChange(option); setIsOpen(false); }}
                  className={`px-4 py-2.5 text-xs font-bold tracking-wide cursor-pointer transition-colors ${
                    value === option 
                      ? 'text-blue-400 bg-blue-500/10 border-l-2 border-blue-500' 
                      : 'text-zinc-400 hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] border-l-2 border-transparent'
                  }`}
                >
                  {option === 'All' ? 'All Assets' : option}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}