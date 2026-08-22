import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ResultSelect({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const options = [
    { label: 'Not Selected', style: 'bg-[#333] text-[#A0A0A0]', group: 'To-do' },
    { label: 'Missed', style: 'bg-[#444] text-[#ccc]', group: 'To-do' },
    { label: 'In Progress', style: 'bg-[#2D5A88] text-[#EAEAEA]', group: 'In progress' },
    { label: 'BE', style: 'bg-[#8B733D] text-[#EAEAEA]', group: 'In progress' },
    { label: 'Lose', style: 'bg-[#8C4F4A] text-[#EAEAEA]', group: 'Complete' },
    { label: 'Win', style: 'bg-[#4A6B53] text-[#EAEAEA]', group: 'Complete' },
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find(opt => opt.label === value) || options[0];

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full bg-[#222] border border-[#333] px-3 py-2 rounded-lg cursor-pointer text-sm"
      >
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selected.style}`}>
          {selected.label}
        </span>
        <ChevronDown size={14} className="text-textMuted" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 mt-2 w-[200px] bg-[#1E1E1E] border border-[#333] rounded-xl shadow-2xl z-50 py-2"
          >
            {['To-do', 'In progress', 'Complete'].map(group => (
              <div key={group} className="mb-2 last:mb-0">
                <div className="px-3 py-1 text-[10px] font-bold text-textMuted uppercase tracking-wider">{group}</div>
                {options.filter(o => o.group === group).map(option => (
                  <div
                    key={option.label}
                    onClick={() => { onChange(option.label); setIsOpen(false); }}
                    className="px-3 py-1.5 hover:bg-[#2A2A2A] cursor-pointer"
                  >
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${option.style}`}>
                      {option.label}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}