import { motion } from 'framer-motion';
import { Target } from 'lucide-react';

export default function LoadingSyncScreen() {
  return (
    <div className="w-full h-[80vh] flex flex-col items-center justify-center relative">
      <motion.div 
        animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.6, 1, 0.6] }} 
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="mb-8 relative"
      >
        <div className="absolute inset-0 bg-blue-500 blur-[40px] opacity-20 rounded-full"></div>
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#1A1A1A] to-[#2A2A2A] border border-[#333] flex items-center justify-center shadow-2xl relative z-10">
          <Target size={36} className="text-blue-500" />
        </div>
      </motion.div>
      <h2 className="text-2xl font-black tracking-[0.2em] uppercase mb-3 text-[var(--edge-text)]">Syncing Plan</h2>
      <p className="text-sm text-gray-500 font-medium animate-pulse">Завантаження даних з хмари...</p>
    </div>
  );
}