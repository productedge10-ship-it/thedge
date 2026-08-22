import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export default function SavingOverlay() {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-lg"
    >
      <Loader2 size={48} className="text-blue-500 animate-spin mb-6" />
      <h3 className="text-2xl font-black text-[var(--edge-text)] tracking-[0.2em] uppercase mb-2">Saving Progress</h3>
      <p className="text-gray-400 font-medium">Синхронізуємо ваші дані перед виходом...</p>
    </motion.div>
  );
}