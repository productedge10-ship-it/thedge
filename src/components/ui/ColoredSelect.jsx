import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ColoredSelect({ value, onChange, options }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find(opt => opt.value === value) || options[0];

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <motion.div 
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full bg-[#15151A]/80 backdrop-blur-md border border-[var(--edge-hair)] px-4 py-2 rounded-xl cursor-pointer hover:border-blue-500/30 hover:bg-[#1A1A22] transition-all text-sm h-[38px] shadow-lg"
      >
        <span className={`px-2.5 py-1 rounded-md text-xs font-black tracking-wide ${selected?.style || 'bg-[var(--edge-hair)] text-gray-300'}`}>
          {selected?.label || value}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={14} className="text-gray-500" />
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute top-[calc(100%+8px)] left-0 w-full bg-[#0A0A10]/95 backdrop-blur-xl border border-[var(--edge-hair-strong)] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-50 p-1.5 overflow-hidden"
          >
            {options.map(option => (
              <div
                key={option.value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                className="px-3 py-2 hover:bg-[var(--edge-hair)] rounded-lg cursor-pointer transition-colors flex items-center"
              >
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide ${option.style || 'bg-[var(--edge-hair)] text-gray-300'}`}>
                  {option.label}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}