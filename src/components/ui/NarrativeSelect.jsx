import { useState, useRef, useEffect } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Minus, Coffee, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ACC = '139,123,255';
const LINE = 'var(--edge-line, #232328)';
const LINE_HI = 'var(--edge-line-hi, #33333A)';
const SUNKEN = 'var(--edge-sunken, #0D0D10)';
const SURFACE = 'var(--edge-surface, #131316)';
const SURFACE_HI = 'var(--edge-surface-hi, #18181C)';
const SANS = "'Roboto', system-ui, -apple-system, sans-serif";

const OPTIONS = [
  { label: 'Bullish', rgb: '52,211,153',  color: 'var(--edge-ok)', icon: TrendingUp },
  { label: 'Bearish', rgb: '248,113,113', color: 'var(--edge-bad)', icon: TrendingDown },
  { label: 'Neutral', rgb: '180,180,189', color: 'var(--edge-text2, #B4B4BD)', icon: Minus },
  { label: 'Day off', rgb: '96,165,250',  color: 'var(--edge-info)', icon: Coffee },
];

export default function NarrativeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const selected = OPTIONS.find((o) => o.label === value);
  const Icon = selected?.icon;

  return (
    <div className="relative w-full" ref={ref}>
      {/* Вибраний bias фарбує всю кнопку, а не плашку всередині —
          раніше через це здавалось, що контрол не на всю ширину */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3.5 text-[15px] font-semibold transition-all duration-200"
        style={{
          background: selected ? `rgba(${selected.rgb},0.09)` : SUNKEN,
          border: `1px solid ${
            open
              ? (selected ? `rgba(${selected.rgb},0.45)` : `rgba(${ACC},0.35)`)
              : (selected ? `rgba(${selected.rgb},0.26)` : LINE)
          }`,
          color: selected ? selected.color : 'var(--edge-text4, #4A4A52)',
          fontFamily: SANS,
        }}
        onMouseEnter={(e) => {
          if (open) return;
          e.currentTarget.style.borderColor = selected ? `rgba(${selected.rgb},0.42)` : LINE_HI;
        }}
        onMouseLeave={(e) => {
          if (open) return;
          e.currentTarget.style.borderColor = selected ? `rgba(${selected.rgb},0.26)` : LINE;
        }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected && <Icon size={15} strokeWidth={2.5} className="shrink-0" />}
          <span className="truncate">{selected ? selected.label : 'Вибрати bias...'}</span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex shrink-0">
          <ChevronDown size={14} strokeWidth={2.2} style={{ color: selected ? selected.color : 'var(--edge-text4, #4A4A52)', opacity: selected ? 0.7 : 1 }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-[calc(100%+8px)] z-[100] w-full min-w-[200px] rounded-xl p-1.5"
            style={{
              background: SURFACE,
              border: `1px solid ${LINE_HI}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          >
            {OPTIONS.map((o) => {
              const OptIcon = o.icon;
              const active = value === o.label;
              return (
                <button
                  key={o.label}
                  onClick={() => { onChange(o.label); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-150"
                  style={{ background: active ? SURFACE_HI : 'transparent' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE_HI)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = active ? SURFACE_HI : 'transparent')}
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                    style={{ background: `rgba(${o.rgb},0.10)`, border: `1px solid rgba(${o.rgb},0.22)` }}
                  >
                    <OptIcon size={12} strokeWidth={2.6} style={{ color: o.color }} />
                  </span>
                  <span className="text-[15px] font-semibold" style={{ color: o.color, fontFamily: SANS }}>
                    {o.label}
                  </span>
                  {active && <Check size={13} strokeWidth={3} className="ml-auto" style={{ color: o.color }} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
