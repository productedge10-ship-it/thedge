import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const premiumEasing = [0.22, 1, 0.36, 1];

export default function DelayedTooltip({ children, text }) {
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);

  const handleEnter = () => {
    timerRef.current = setTimeout(() => setShow(true), 2500);
  };

  const handleLeave = () => {
    clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <div 
      className="relative flex items-center justify-center"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.9 }}
            transition={{ duration: 0.2, ease: premiumEasing }}
            className="absolute top-full mt-3 left-1/2 -translate-x-1/2 z-[9999] px-3 py-2 bg-black border border-[var(--edge-hair-strong)] text-[var(--edge-text)] text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-2xl whitespace-nowrap pointer-events-none"
          >
            {text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}