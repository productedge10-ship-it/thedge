import toast from 'react-hot-toast';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';
import { motion } from 'framer-motion'; // Додаємо framer-motion

export const notify = {
  success: (title, desc) => {
    toast.custom((t) => (
      <motion.div
        // Початковий стан (до появи)
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        // Стан анімації (залежить від t.visible)
        animate={{ 
          opacity: t.visible ? 1 : 0, 
          y: t.visible ? 0 : 20, 
          scale: t.visible ? 1 : 0.95 
        }}
        // Плавна пружинна анімація
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        
        onClick={() => toast.dismiss(t.id)}
        className="pointer-events-auto cursor-pointer max-w-sm w-full bg-[#0a0a0c]/80 backdrop-blur-xl border border-blue-500/20 shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)] rounded-2xl flex relative overflow-hidden group"
      >
        {/* Градієнтне підсвічування при наведенні */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        <div className="p-4 flex items-start gap-3 w-full relative z-10">
          {/* Іконка з круговим світінням */}
          <div className="bg-blue-500/10 p-1.5 rounded-full border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.4)] shrink-0 mt-0.5">
            <CheckCircle className="text-blue-400" size={18} strokeWidth={2.5} />
          </div>
          
          <div className="flex flex-col w-full">
            <span className="text-blue-50 font-bold text-sm tracking-wide">{title}</span>
            {desc && <span className="text-blue-200/60 text-xs mt-1 leading-relaxed">{desc}</span>}
          </div>

          <button 
            onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }} 
            className="text-gray-500 hover:text-[var(--edge-text)] transition-colors shrink-0 p-1"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
    ), { duration: 4000 });
  },

  error: (title, desc) => {
    toast.custom((t) => (
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{ 
          opacity: t.visible ? 1 : 0, 
          y: t.visible ? 0 : 20, 
          scale: t.visible ? 1 : 0.95 
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        
        onClick={() => toast.dismiss(t.id)}
        className="pointer-events-auto cursor-pointer max-w-sm w-full bg-[#140505]/80 backdrop-blur-xl border border-red-500/20 shadow-[0_10px_40px_-10px_rgba(239,68,68,0.3)] rounded-2xl flex relative overflow-hidden group"
      >
        {/* Червоний градієнт при наведенні */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        <div className="p-4 flex items-start gap-3 w-full relative z-10">
          {/* Іконка з круговим світінням */}
          <div className="bg-red-500/10 p-1.5 rounded-full border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)] shrink-0 mt-0.5">
            <AlertTriangle className="text-red-400" size={18} strokeWidth={2.5} />
          </div>
          
          <div className="flex flex-col w-full">
            <span className="text-red-50 font-bold text-sm tracking-wide">{title}</span>
            {desc && <span className="text-red-200/60 text-xs mt-1 leading-relaxed">{desc}</span>}
          </div>

          <button 
            onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }} 
            className="text-red-500/50 hover:text-red-400 transition-colors shrink-0 p-1"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
      </motion.div>
    ), { duration: 6000 });
  }
};