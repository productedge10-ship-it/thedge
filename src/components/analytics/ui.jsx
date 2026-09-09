import React from 'react';
import { signed } from './data';

export const Panel = ({ title, right, children, className = '', accent }) => (
  <section
    className={`bg-[var(--edge-surface)] border border-[var(--edge-line)] rounded-[14px] p-[18px_20px] ${className}`}
    style={accent ? { borderTopColor: accent } : undefined}
  >
    {(title || right) && (
      <header className="flex justify-between items-center gap-3 mb-4">
        <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[var(--edge-text3)] font-bold">
          {title}
        </span>
        {right && (
          <span className="text-[11px] text-[var(--edge-text3)] [&_b]:text-[var(--edge-text)]">
            {right}
          </span>
        )}
      </header>
    )}
    {children}
  </section>
);

export const Delta = ({ v, unit = 'R', d = 1 }) => (
  <span className={v > 0 ? 'text-[#34d399]' : v < 0 ? 'text-[#f87171]' : 'text-[var(--edge-text3)]'}>
    {signed(v, d)}{unit}
  </span>
);

export const Meter = ({ value, color = 'var(--edge-acc, var(--edge-acc))', height = 4 }) => (
  <div className="w-full bg-[var(--edge-line)] rounded-[4px] overflow-hidden" style={{ height }}>
    <span
      className="block h-full rounded-[4px] transition-all duration-700 ease-out"
      style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
    />
  </div>
);

export const Ring = ({ value, label, color = '#fbbf24', size = 116 }) => {
  const R = size / 2 - 7;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--edge-line, var(--edge-line))" strokeWidth="6" />
        <circle
          cx={size / 2} cy={size / 2} r={R} fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C - (C * value) / 100}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="text-[21px] font-extrabold">{value}%</b>
        <span className="text-[9px] tracking-[0.13em] uppercase text-[var(--edge-text3)]">{label}</span>
      </div>
    </div>
  );
};

export const ChartTip = ({ active, payload, label, unit = 'R' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--edge-sunken)] border border-[var(--edge-line)] rounded-[10px] p-[9px_12px] text-[12px] shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
      <p className="text-[var(--edge-text3)] text-[10px] tracking-[0.1em] uppercase mb-[5px]">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="my-[2px]" style={{ color: p.color || p.fill }}>
          {p.name}: <b>{typeof p.value === 'number' ? signed(p.value, 2) : p.value}{unit}</b>
        </p>
      ))}
    </div>
  );
};

export const axis = { axisLine: false, tickLine: false, tick: { fontSize: 11, fill: 'var(--edge-text3, var(--edge-text3))' } };