import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function FilterSelect({ value, onChange, options, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Знаходимо лейбл для поточного значення (щоб писало "All Assets", а не "All")
  const selectedLabel = options.find(opt => opt.value === value)?.label || placeholder;

  return (
    <div className="relative w-40" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full bg-[#1A1A1A] border border-[#333] px-4 py-2 rounded-xl cursor-pointer hover:border-[#555] transition-colors text-sm font-bold text-[var(--edge-text)] shadow-sm"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={14} className={`text-textMuted shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 mt-2 w-full bg-[#1E1E1E] border border-[#333] rounded-xl shadow-2xl z-50 py-2 overflow-hidden"
          >
            {options.map(option => (
              <div
                key={option.value}
                onClick={() => { onChange(option.value); setIsOpen(false); }}
                className={`px-4 py-2 text-sm font-medium cursor-pointer transition-colors ${
                  value === option.value 
                    ? 'bg-[#3b82f6]/10 text-[#3b82f6]' // Підсвітка вибраного синім
                    : 'text-[#EAEAEA] hover:bg-[#2A2A2A]'
                }`}
              >
                {option.label}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}