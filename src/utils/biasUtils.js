export const formatBiasData = (bias) => bias && bias.trim() !== '' ? bias : 'Not Selected';

export function getBiasStyles(narrative) {
  const bias = (narrative || '').toUpperCase();
  if (bias === 'BULLISH') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'rgba(16,185,129,0.15)' };
  if (bias === 'BEARISH') return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', glow: 'rgba(239,68,68,0.15)' };
  if (bias === 'NEUTRAL') return { color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'rgba(245,158,11,0.15)' };
  if (bias === 'DAY OFF') return { color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700', glow: 'rgba(161,161,170,0.1)' };
  return { color: 'text-zinc-500', bg: 'bg-zinc-900', border: 'border-zinc-800', glow: 'transparent' };
}