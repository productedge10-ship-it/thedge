import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Згруповано за одиницею часу — так око одразу бачить логіку,
// і зникає плутанина між 1m (хвилина) та 1M (місяць).
const TF_GROUPS = [
  { label: 'Minutes', cols: 'grid-cols-3', items: ['1m', '5m', '15m'] },
  { label: 'Hours',   cols: 'grid-cols-3', items: ['1H', '4H', '12H'] },
  { label: 'Higher',  cols: 'grid-cols-4', items: ['1D', '1W', '1M', '3M'] },
];

export default function TfSelect({ value, onChange, iconColor = 'text-[#8b7bff]' }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="relative z-50" ref={ref}>
      {/* Тригер — компактна таблетка, без "коробки в коробці" */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group flex h-9 items-center gap-2 rounded-lg border border-[var(--edge-hair)] bg-[var(--edge-hair)] pl-2.5 pr-2 transition-colors duration-200 hover:border-[var(--edge-hair-strong)] hover:bg-[var(--edge-hair)]"
      >
        <Clock size={14} strokeWidth={2.25} className={`${iconColor} shrink-0`} />
        <span className="text-xs font-bold uppercase leading-none tracking-[0.15em] text-gray-300 transition-colors group-hover:text-[var(--edge-text)]">
          {value || 'TF'}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          <ChevronDown size={13} className="text-zinc-500 transition-colors group-hover:text-zinc-300" />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="absolute left-0 top-[calc(100%+8px)] w-[240px] origin-top-left rounded-2xl border border-[var(--edge-hair-strong)] bg-[#0B0B10]/95 p-2.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
          >
            {TF_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? 'mt-3' : ''}>
                <div className="px-1.5 pb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                  {group.label}
                </div>
                <div className={`grid ${group.cols} gap-1.5`}>
                  {group.items.map((tf) => {
                    const active = value === tf;
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => { onChange(tf); setIsOpen(false); }}
                        className={`h-9 rounded-lg text-xs font-bold tracking-wide transition-all duration-200 ${
                          active
                            ? 'border border-[#8b7bff]/40 bg-[#8b7bff]/15 text-[#a99bff] shadow-[0_0_14px_-2px_rgba(139,123,255,0.55)]'
                            : 'border border-[var(--edge-hair)] text-zinc-400 hover:border-[var(--edge-hair-strong)] hover:bg-[var(--edge-hair)] hover:text-[var(--edge-text)]'
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Custom TF — тепер завжди на видноті, ніякого обрізання */}
            <button
              type="button"
              className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--edge-hair-strong)] text-[11px] font-semibold uppercase tracking-widest text-zinc-500 transition-colors duration-200 hover:border-white/20 hover:bg-[var(--edge-hair)] hover:text-[var(--edge-text)]"
            >
              <Plus size={13} /> Custom
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}