import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  XCircle, Flame, Gauge, X,
  Brain, Activity, Zap, ShieldCheck,
  ArrowUpRight, Sparkles, TrendingDown,
} from 'lucide-react';
import { motion, useMotionValue, useMotionTemplate, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { EMOTION_COLOR, EMOTION_LABEL, signed, r1, r2, sum } from '../data';

// ==========================================
// АНІМАЦІЇ
// ==========================================
export const premiumEasing = [0.22, 1, 0.36, 1];



// Цільовий ризик на угоду (%)
export const TARGET_RISK = 1;

// ==========================================
// М'ЯКА КАРТКА SPOTLIGHT
// ==========================================
export function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.06)" }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      onMouseMove={handleMouseMove}
      className={`relative group w-full overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 rounded-[inherit]"
        style={{
          background: useMotionTemplate`radial-gradient(600px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 60%)`,
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

// ==========================================
// КАСТОМНІ TOOLTIPS
// ==========================================
export const TiltTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[var(--edge-sunken)] border border-[#232328] p-3 rounded-[12px] shadow-xl max-w-[200px]">
        <p className="text-[11px] text-[#7A7A85] uppercase font-bold tracking-wider mb-2 border-b border-[var(--edge-hair)] pb-2">
          {label === '0' ? 'Свіжа голова (Без збитків)' : `Серія: ${label} збитків поспіль`}
        </p>
        <div className="text-[12.5px] leading-relaxed text-[#FAFAFA]">
          Наступна угода після такої серії в середньому приносить: 
          <b className={`block text-[16px] mt-1 ${data.avg > 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
            {signed(data.avg, 2)}R
          </b>
        </div>
      </div>
    );
  }
  return null;
};

export const PlanTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--edge-sunken)] border border-[#232328] p-3 rounded-[12px] shadow-xl">
        <p className="text-[10px] text-[#7A7A85] uppercase font-bold tracking-wider mb-2 border-b border-[var(--edge-hair)] pb-2">
          Угода №{label}
        </p>
        <div className="flex flex-col gap-2">
          {payload.map((entry, i) => (
            <div key={i} className="flex justify-between items-center gap-6 text-[12.5px]">
              <span className="text-[#FAFAFA] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                {entry.name}
              </span>
              <b style={{ color: entry.color }}>{signed(entry.value, 2)}R</b>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

// ==========================================
// НЕЙРОПРОФІЛЬ — РОЗРАХУНОК МЕТРИК
// ==========================================
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

function buildNeuro(s) {
  const trades = s.trades || [];
  const total = Math.max(1, trades.length);

  const calm = s.emotionStats.find((e) => e.emotion === 'calm') || { avg: 0, net: 0, trades: 0, wr: 0, list: [] };
  const tilt = s.emotionStats.find((e) => e.emotion === 'tilt') || { avg: 0, net: 0, trades: 0, wr: 0, list: [] };

  const cleanTrades = trades.filter((t) => !(t.mistakes || []).length).length;
  const impulsive = trades.filter((t) => t.emotion === 'tilt' || t.emotion === 'fomo').length;
  const maxRisk = Math.max(0, ...s.emotionStats.map((e) => (e.trades ? sum(e.list.map((t) => t.risk)) / e.trades : 0)));
  const mistakeCost = Math.abs(sum(s.mistakeLedger.map((m) => m.cost)));

  const axes = [
    { key: 'focus', label: 'Фокус', full: 'Холодний фокус', value: clamp100((calm.trades / total) * 100), color: 'var(--edge-acc, #8b7bff)', icon: Brain, desc: 'Частка входів у спокійному стані від усіх угод.', formula: `${calm.trades} спокійних входів із ${trades.length}`, hint: 'Норма — вище 60%. Це база, на якій стоїть уся статистика.' },
    { key: 'impulse', label: 'Контроль', full: 'Контроль імпульсу', value: clamp100(100 - (impulsive / total) * 100), color: 'var(--edge-acc, #8b7bff)', icon: Zap, desc: 'Наскільки рідко ти входиш у тільті або на FOMO.', formula: `${impulsive} імпульсивних входів із ${trades.length}`, hint: 'Кожен імпульсивний вхід коштує тобі частини місячного профіту.' },
    { key: 'recovery', label: 'Відновлення', full: 'Відновлення після збитку', value: clamp100(55 + s.avgAfterLoss * 45), color: '#34d399', icon: Activity, desc: 'Що відбувається з очікуванням одразу після мінуса.', formula: `Сер. R після збитку: ${signed(s.avgAfterLoss, 2)}R проти ${signed(s.avgAfterWin, 2)}R після плюса`, hint: 'Просідання тут = класичний ланцюг тільта. Лікується паузою.' },
    { key: 'discipline', label: 'Дисципліна', full: 'Дотримання плану', value: clamp100(s.adherence), color: '#fbbf24', icon: ShieldCheck, desc: 'Скільки угод відкрито строго за твоїм чек-листом.', formula: `${s.followed.length} за планом · ${s.broken.length} з порушенням`, hint: 'Дисципліна — єдина метрика, яку ти контролюєш на 100%.' },
    { key: 'risk', label: 'Ризик', full: 'Стабільність ризику', value: clamp100(100 - Math.max(0, maxRisk - 1) * 90), color: '#f87171', icon: Gauge, desc: 'Наскільки розмір позиції не залежить від настрою.', formula: `Пік середнього ризику: ${r2(maxRisk)}% на угоду`, hint: 'Плаваючий об’єм ламає математику навіть прибуткової системи.' }
  ];

  const weights = { focus: 0.2, impulse: 0.2, recovery: 0.2, discipline: 0.25, risk: 0.15 };
  const index = clamp100(sum(axes.map((a) => a.value * weights[a.key])));

  const tier =
    index >= 80 ? { name: 'Снайпер', color: '#34d399', text: 'Психіка стабільна. Твій головний ризик зараз — не емоції, а нудьга.' }
    : index >= 60 ? { name: 'Оператор', color: 'var(--edge-acc, #8b7bff)', text: 'База міцна, але є вузьке місце, яке з’їдає частину результату.' }
    : index >= 40 ? { name: 'Нестабільний', color: '#fbbf24', text: 'Система працює, психіка — ні. Половина профіту губиться на емоціях.' }
    : { name: 'Реактивний', color: '#f87171', text: 'Ринок керує тобою, а не навпаки. Спочатку режим, потім вхід.' };

  const weakest = [...axes].sort((a, b) => a.value - b.value)[0];
  const strongest = [...axes].sort((a, b) => b.value - a.value)[0];

  return { axes, index, tier, weakest, strongest, calm, tilt, maxRisk, mistakeCost, cleanTrades, impulsive, total: trades.length };
}

// ==========================================
// СКАНЕР: 3D ГОЛОВА
// ==========================================
const NODES = {
  focus:      { x: 118, y: 74 },
  impulse:    { x: 152, y: 92 },
  recovery:   { x: 96,  y: 108 },
  discipline: { x: 138, y: 126 },
  risk:       { x: 104, y: 148 }
};

function NeuroScanner({ neuro, active, setActive }) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [10, -10]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-14, 14]), { stiffness: 120, damping: 18 });

  function move({ currentTarget, clientX, clientY }) {
    const r = currentTarget.getBoundingClientRect();
    mx.set((clientX - r.left) / r.width);
    my.set((clientY - r.top) / r.height);
  }
  function leave() { mx.set(0.5); my.set(0.5); }

  return (
    <div
      onMouseMove={move}
      onMouseLeave={leave}
      className="relative w-full flex items-center justify-center select-none"
      style={{ perspective: '900px' }}
    >
      <motion.div style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }} className="relative">
        <svg viewBox="0 0 260 260" className="w-[250px] h-[250px] overflow-visible">
          <defs>
            <radialGradient id="npAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={neuro.tier.color} stopOpacity="0.22" />
              <stop offset="70%" stopColor={neuro.tier.color} stopOpacity="0.04" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="npSkull" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.95" />
              <stop offset="100%" stopColor={neuro.tier.color} stopOpacity="0.65" />
            </linearGradient>
            <linearGradient id="npScan" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--edge-acc, #8b7bff)" stopOpacity="0" />
              <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--edge-acc, #8b7bff)" stopOpacity="0" />
            </linearGradient>
            <clipPath id="npClip">
              <path d="M176 244 L176 200 C176 190 184 186 194 181 C208 174 213 160 212 141 C212 133 220 130 222 122 C224 115 215 111 211 105 C207 98 209 90 205 76 C194 42 161 24 127 28 C86 33 60 66 60 106 C60 141 76 167 98 183 C112 193 118 201 118 216 L118 244 Z" />
            </clipPath>
          </defs>

          <circle cx="130" cy="130" r="122" fill="url(#npAura)" />

          <motion.circle
            cx="130" cy="130" r="112" fill="none" stroke="var(--edge-line-hi, #33333A)" strokeWidth="1"
            strokeDasharray="3 9"
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '130px 130px' }}
          />
          <motion.circle
            cx="130" cy="130" r="98" fill="none" stroke={neuro.tier.color} strokeOpacity="0.25" strokeWidth="1"
            strokeDasharray="60 200"
            animate={{ rotate: -360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            style={{ transformOrigin: '130px 130px' }}
          />
          {[0, 90, 180, 270].map((a) => (
            <rect key={a} x="129" y="14" width="2" height="10" fill="var(--edge-line-hi, #33333A)"
              transform={`rotate(${a} 130 130)`} />
          ))}

          <path
            d="M176 244 L176 200 C176 190 184 186 194 181 C208 174 213 160 212 141 C212 133 220 130 222 122 C224 115 215 111 211 105 C207 98 209 90 205 76 C194 42 161 24 127 28 C86 33 60 66 60 106 C60 141 76 167 98 183 C112 193 118 201 118 216 L118 244"
            fill="rgba(139,123,255,0.05)"
            stroke="url(#npSkull)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <g clipPath="url(#npClip)" opacity="0.5">
            <path d="M78 96 C104 74 138 76 158 96 C176 114 172 142 150 154 C126 167 96 158 84 136" fill="none" stroke="var(--edge-acc, #8b7bff)" strokeOpacity="0.35" strokeWidth="1" />
            <path d="M92 122 C112 106 140 108 154 124" fill="none" stroke="var(--edge-acc, #8b7bff)" strokeOpacity="0.25" strokeWidth="1" />
            <path d="M100 150 C122 140 146 142 160 156" fill="none" stroke="#34d399" strokeOpacity="0.22" strokeWidth="1" />
            <path d="M118 62 L118 178" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
            <path d="M64 118 L214 118" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
            {Object.entries(NODES).map(([k, p]) => (
              <line key={k} x1="118" y1="118" x2={p.x} y2={p.y} stroke="var(--edge-acc, #8b7bff)" strokeOpacity="0.18" strokeWidth="1" />
            ))}
          </g>

          <g clipPath="url(#npClip)">
            <motion.g animate={{ y: [-4, 220, -4] }} transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}>
              <rect x="40" y="16" width="200" height="2" fill="url(#npScan)" />
              <rect x="40" y="18" width="200" height="26" fill="url(#npScan)" opacity="0.12" />
            </motion.g>
          </g>

          {neuro.axes.map((a) => {
            const p = NODES[a.key];
            const on = active === a.key;
            return (
              <g key={a.key} onMouseEnter={() => setActive(a.key)} onMouseLeave={() => setActive(null)} style={{ cursor: 'pointer' }}>
                <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                <motion.circle
                  cx={p.x} cy={p.y} r={on ? 13 : 9}
                  fill={a.color} fillOpacity="0.12" stroke={a.color} strokeOpacity={on ? 0.9 : 0.4} strokeWidth="1"
                  animate={{ scale: on ? [1, 1.12, 1] : [1, 1.35, 1], opacity: on ? 1 : [0.7, 0.25, 0.7] }}
                  transition={{ duration: on ? 1.2 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                />
                <circle cx={p.x} cy={p.y} r={on ? 4.5 : 3} fill={a.color} />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <span className="text-[9px] tracking-[0.24em] uppercase text-[#7A7A85] font-black">Нейро-індекс</span>
          <div className="flex items-baseline gap-1">
            <span className="font-['Instrument_Serif',serif] text-[40px] leading-none text-[var(--edge-text)]">{neuro.index}</span>
            <span className="text-[13px] text-[#7A7A85] font-bold">/100</span>
          </div>
          <span className="mt-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: neuro.tier.color }}>
            {neuro.tier.name}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

// ==========================================
// НЕЙРОПРОФІЛЬ — МОДАЛКА (СКЛО, ПО ЦЕНТРУ)
// ==========================================
function NeuroModal({ neuro, s, impactTrades, onClose, onOpenTrade }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8">
      {/* СКЛЯНИЙ ФОН */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[#08080A]/55 backdrop-blur-[14px] backdrop-saturate-150"
        onClick={onClose}
      />

      {/* КАРТКА */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 24 }}
        transition={{ duration: 0.35, ease: premiumEasing }}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-[980px] max-h-[88vh] flex flex-col rounded-[24px] border border-[var(--edge-hair-strong)] bg-[var(--edge-sunken)]/85 backdrop-blur-2xl shadow-[0_40px_120px_rgba(0,0,0,0.75)] overflow-hidden"
      >
        {/* ШАПКА */}
        <div className="shrink-0 relative px-6 md:px-8 py-5 border-b border-[var(--edge-hair)] bg-[var(--edge-hair)]">
          <div className="absolute inset-0 opacity-[0.18] pointer-events-none"
            style={{ background: `radial-gradient(700px circle at 12% 0%, ${neuro.tier.color}, transparent 62%)` }} />

          <button onClick={onClose} className="absolute top-5 right-5 z-20 text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors bg-[var(--edge-hair)] hover:bg-white/10 p-2 rounded-full border border-[var(--edge-hair)]">
            <X size={18} />
          </button>

          <div className="relative z-10 flex items-center gap-4 pr-12">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border shrink-0"
              style={{ background: `${neuro.tier.color}14`, borderColor: `${neuro.tier.color}33` }}>
              <Brain size={24} style={{ color: neuro.tier.color }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[var(--edge-text)] text-[24px] leading-none font-normal m-0 font-['Instrument_Serif',serif] tracking-wide">
                Нейропрофіль трейдера
              </h3>
              <p className="text-[12.5px] text-[#7A7A85] mt-2 m-0">
                Індекс <b className="text-[var(--edge-text)]">{neuro.index}/100</b> · тип <b style={{ color: neuro.tier.color }}>{neuro.tier.name}</b> · вибірка {neuro.total} угод
              </p>
            </div>
          </div>
        </div>

        {/* ТІЛО */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 py-6 flex flex-col gap-7">

          <p className="text-[13.5px] text-[#B4B4BD] leading-[1.65] m-0">
            {neuro.tier.text} Найсильніша сторона — <b className="text-[var(--edge-text)]">{neuro.strongest.full.toLowerCase()}</b> ({neuro.strongest.value}/100).
            Вузьке місце — <b style={{ color: neuro.weakest.color }}>{neuro.weakest.full.toLowerCase()}</b> ({neuro.weakest.value}/100), саме воно тягне індекс вниз.
          </p>

          <div>
            <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mb-3">Як рахується індекс</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {neuro.axes.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.key} className="p-4 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[16px] hover:border-[var(--edge-hair-strong)] transition-colors">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#FAFAFA]">
                        <Icon size={16} style={{ color: a.color }} />
                        {a.full}
                      </div>
                      <b className="text-[16px]" style={{ color: a.color }}>{a.value}</b>
                    </div>
                    <div className="w-full bg-[var(--edge-hair)] h-[5px] rounded-full overflow-hidden mb-2.5">
                      <motion.div className="h-full rounded-full" style={{ background: a.color }}
                        initial={{ width: 0 }} animate={{ width: `${a.value}%` }} transition={{ duration: 0.9, ease: premiumEasing }} />
                    </div>
                    <p className="text-[12.5px] text-[#B4B4BD] leading-[1.5] m-0">{a.desc}</p>
                    <p className="text-[11.5px] text-[#7A7A85] mt-1.5 m-0 font-medium">{a.formula}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mb-3">Що збиває профіль</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { t: 'Серія збитків', v: `${signed(s.avgAfterLoss, 2)}R`, d: 'середній результат наступного входу після мінуса', c: '#f87171' },
                { t: 'Стан «Тільт»', v: `${signed(neuro.tilt.net)}R`, d: `${neuro.tilt.trades} угод, вінрейт ${neuro.tilt.wr}%`, c: '#fbbf24' },
                { t: 'Помилки виконання', v: `${r1(-neuro.mistakeCost)}R`, d: `${s.mistakeLedger.length} типів порушень плану`, c: 'var(--edge-acc, #8b7bff)' }
              ].map((x, i) => (
                <div key={i} className="p-4 rounded-[16px] border bg-[var(--edge-hair)]" style={{ borderColor: `${x.c}22` }}>
                  <span className="text-[10.5px] uppercase tracking-[0.14em] font-black text-[#7A7A85]">{x.t}</span>
                  <b className="block text-[24px] font-extrabold mt-1.5 mb-1" style={{ color: x.c }}>{x.v}</b>
                  <small className="text-[12px] text-[#7A7A85] leading-snug block">{x.d}</small>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] m-0">Угоди, що сформували профіль</h4>
              <span className="text-[11px] text-[#7A7A85]">натисни, щоб відкрити угоду</span>
            </div>
            <div className="flex flex-col gap-2">
              {impactTrades.map((t, i) => (
                <button
                  key={t.id ?? i}
                  onClick={() => onOpenTrade(t)}
                  className="w-full text-left p-3.5 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[14px] hover:border-white/15 hover:bg-[var(--edge-hair)] transition-colors group"
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: EMOTION_COLOR[t.emotion] || 'var(--edge-text3, #7A7A85)' }} />
                      <b className="text-[13.5px] text-[#FAFAFA] truncate">{t.symbol}</b>
                      <span className="text-[11.5px] text-[#7A7A85] shrink-0">{t.date}</span>
                      <span className="text-[10.5px] px-2 py-0.5 rounded-full border shrink-0 hidden sm:inline"
                        style={{ color: EMOTION_COLOR[t.emotion] || 'var(--edge-text3, #7A7A85)', borderColor: `${EMOTION_COLOR[t.emotion] || 'var(--edge-text3, #7A7A85)'}33`, background: `${EMOTION_COLOR[t.emotion] || 'var(--edge-text3, #7A7A85)'}10` }}>
                        {EMOTION_LABEL[t.emotion] || 'без мітки'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <b className={`text-[13.5px] ${t.rr >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(t.rr, 2)}R</b>
                      <ArrowUpRight size={16} className="text-[#7A7A85] group-hover:text-[var(--edge-text)] transition-colors" />
                    </div>
                  </div>
                  <p className="text-[12.5px] text-[#B4B4BD] leading-[1.5] m-0 line-clamp-2">{t.note}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-[16px] border border-[#8b7bff]/20 bg-[#8b7bff]/[0.07]">
            <div className="flex items-center gap-2.5 mb-2.5">
              <Sparkles size={16} className="text-[#8b7bff]" />
              <b className="text-[13.5px] text-[var(--edge-text)]">Що зробити цього тижня</b>
            </div>
            <ul className="flex flex-col gap-2 m-0 p-0 text-[13px] text-[#B4B4BD]">
              <li className="flex gap-3 items-start"><span className="text-[#8b7bff] font-black">01</span><span className="leading-snug">Після двох мінусів поспіль — стоп на день. Саме там очікування падає до {signed(s.avgAfterLoss, 2)}R.</span></li>
              <li className="flex gap-3 items-start"><span className="text-[#8b7bff] font-black">02</span><span className="leading-snug">Фіксуй ризик {r2(TARGET_RISK)}% у калькуляторі до входу, а не «на око» — пік зараз {r2(neuro.maxRisk)}%.</span></li>
              <li className="flex gap-3 items-start"><span className="text-[#8b7bff] font-black">03</span><span className="leading-snug">Прибери одну помилку — «{s.mistakeLedger[0]?.name || '—'}». Це {r1(Math.abs(s.mistakeLedger[0]?.cost || 0))}R назад у депозит.</span></li>
            </ul>
          </div>

        </div>

        {/* ФУТЕР */}
        <div className="shrink-0 px-6 md:px-8 py-4 border-t border-[var(--edge-hair)] bg-[var(--edge-hair)] flex items-center justify-between gap-4">
          <span className="text-[11.5px] text-[#7A7A85]">Профіль перераховується після кожної нової угоди</span>
          <button onClick={onClose} className="px-5 py-2 bg-[var(--edge-hair)] hover:bg-white/10 text-[var(--edge-text)] text-[13px] font-bold rounded-xl transition-colors border border-[var(--edge-hair-strong)]">
            Закрити
          </button>
        </div>

      </motion.div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

// ==========================================
// НЕЙРОПРОФІЛЬ — ГОЛОВНИЙ БЛОК
// ==========================================
/* Ширину картки задає людина, а не екран.

   Ламати розкладку по медіа-запитах тут не можна: `lg:` дивиться на
   ширину вікна, а картка може бути вчетверо вужчою за нього. Саме
   через це нейропрофіль на чверть екрана лишався двоколонковим:
   голова займала всі 260 пікселів, а осі, цифри й заглушка тислися
   в те, що лишилось, і налазили одна на одну.

   Тому весь адаптив тут рахується від w — тієї самої чверті, половини
   чи повної ширини, яку віджет займає на дошці. */
export function NeuroBody({ s, onOpenTrade, w = 4 }) {
  const wide = w >= 3;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const neuro = useMemo(() => buildNeuro(s), [s]);

  const impactTrades = useMemo(() => {
    const src = (s.trades || []).filter((t) => (t.mistakes || []).length || t.emotion === 'tilt' || t.emotion === 'fomo');
    const pool = (src.length ? src : (s.trades || [])).slice(0, 5);
    return pool.map((t, i) => ({
      id: t.id ?? i,
      symbol: t.symbol || t.pair || t.asset || `TRADE-${i + 1}`,
      date: t.date || '—',
      rr: typeof t.rr === 'number' ? t.rr : 0,
      emotion: t.emotion || 'calm',
      note: t.note || `Заглушка: вхід у стані «${EMOTION_LABEL[t.emotion] || 'без мітки'}»${(t.mistakes || []).length ? `, порушення: ${t.mistakes.join(', ')}` : ', план дотримано'}. Тут буде твій коментар до угоди.`
    }));
  }, [s]);

  const activeAxis = neuro.axes.find((a) => a.key === active);

  return (
    <>
      <>
        <div
          className="mt-2 grid items-center gap-5"
          style={{ gridTemplateColumns: wide ? '240px minmax(0,1fr)' : 'minmax(0,1fr)' }}
        >

          <div style={wide ? undefined : { maxWidth: 230, margin: '0 auto', width: '100%' }}>
            <NeuroScanner neuro={neuro} active={active} setActive={setActive} />
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <p className="text-[12.5px] text-[#B4B4BD] leading-[1.6] m-0">
              {activeAxis ? (
                <><b className="text-[var(--edge-text)]">{activeAxis.full}:</b> {activeAxis.desc} {activeAxis.hint}</>
              ) : (
                <>Модель зчитала <b className="text-[var(--edge-text)]">{neuro.total}</b> угод і зібрала твій психологічний зліпок. Тип — <b style={{ color: neuro.tier.color }}>{neuro.tier.name}</b>. {neuro.tier.text}</>
              )}
            </p>

            <div className="flex flex-col gap-2">
              {neuro.axes.map((a) => {
                const Icon = a.icon;
                const on = active === a.key;
                return (
                  <div
                    key={a.key}
                    onMouseEnter={() => setActive(a.key)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[10px] border transition-colors cursor-default ${on ? 'bg-[var(--edge-surface-hi)] border-white/15' : 'bg-[var(--edge-surface-hi)]/40 border-[var(--edge-hair)]'}`}
                  >
                    <Icon size={14} style={{ color: a.color }} className="shrink-0" />
                    <span
                      className="text-[12px] font-semibold text-[#FAFAFA] shrink-0"
                      style={{ width: wide ? 92 : 78 }}
                    >
                      {a.label}
                    </span>
                    <div className="flex-1 bg-[#232328] h-[5px] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: a.color, boxShadow: on ? `0 0 10px ${a.color}80` : 'none' }}
                        initial={{ width: 0 }}
                        animate={{ width: `${a.value}%` }}
                        transition={{ duration: 1, ease: premiumEasing }}
                      />
                    </div>
                    <b className="text-[12.5px] w-[30px] text-right font-black" style={{ color: a.color }}>{a.value}</b>
                  </div>
                );
              })}
            </div>

            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${w >= 3 ? 4 : 2}, minmax(0,1fr))` }}
            >
              {[
                { l: 'Спокійних', v: `${Math.round((neuro.calm.trades / Math.max(1, neuro.total)) * 100)}%`, c: 'var(--edge-acc, #8b7bff)' },
                { l: 'Чистих угод', v: `${neuro.cleanTrades}/${neuro.total}`, c: '#34d399' },
                { l: 'Імпульсивних', v: `${neuro.impulsive}`, c: '#f87171' },
                { l: 'Пік ризику', v: `${r2(neuro.maxRisk)}%`, c: '#fbbf24' }
              ].map((x, i) => (
                <div key={i} className="px-3 py-2.5 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[10px]">
                  <span className="block text-[9.5px] uppercase tracking-[0.12em] text-[#7A7A85] font-black">{x.l}</span>
                  <b className="block text-[15px] font-extrabold mt-0.5" style={{ color: x.c }}>{x.v}</b>
                </div>
              ))}
            </div>

            <button
              onClick={() => setOpen(true)}
              className="mt-1 w-full py-2.5 rounded-xl border text-[12.5px] font-bold transition-colors flex items-center justify-center gap-2"
              style={{ borderColor: `${neuro.tier.color}33`, background: `${neuro.tier.color}10`, color: neuro.tier.color }}
            >
              <Brain size={15} /> Відкрити повний нейро-звіт
            </button>
          </div>
        </div>
      </>

      <AnimatePresence>
        {open && (
          <NeuroModal
            neuro={neuro}
            s={s}
            impactTrades={impactTrades}
            onClose={() => setOpen(false)}
            onOpenTrade={onOpenTrade}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ==========================================
// ГОЛОВНИЙ КОМПОНЕНТ
// ==========================================


/* ==================================================================
   Деталі «Психології».

   Тут лишилось усе, що не є самою карткою: маскот-сканер, розрахунок
   нейропрофілю, дві підказки для графіків і derive() — один прохід по
   журналу, з якого віджети беруть готові зрізи.

   Розділити довелось, коли сторінка переїхала на ту саму дошку, що
   «Огляд» і «Перформанс». Дошка дає картці рамку, заголовок, іконку,
   налаштування й хрестик, тож віджет має повертати лише вміст. Панелі
   зі старої сторінки поїхали у widgets.jsx, а спільне лягло сюди.
================================================================== */

/* Один прохід замість десяти.

   Кожен віджет отримує ту саму статистику s і рахує з неї свої зрізи.
   Рахувати рейтинг станів окремо в чотирьох картках означало б
   чотири однакові проходи по журналу на кожен кадр, тому результат
   кешується за самим обʼєктом s: useStats повертає стабільне
   посилання на період, отже друге звернення з тим самим s віддає
   готове. */
const once = (fn) => fn();

let cachedFor = null;
let cachedVal = null;

export function derive(s) {
  if (cachedFor === s && cachedVal) return cachedVal;
  cachedFor = s;
  cachedVal = compute(s);
  return cachedVal;
}

function compute(s) {
  const worstMistake = s.mistakeLedger[0] || { name: 'Немає помилок', cost: 0 };
  const totalGross = Math.max(1, s.gross || 1);
  const maxRisk = Math.max(...s.emotionStats.map((e) => e.trades ? sum(e.list.map((t) => t.risk)) / e.trades : 0));

  const ledgerTotal = sum(s.mistakeLedger.map((m) => m.cost));
  const ledgerCount = sum(s.mistakeLedger.map((m) => m.count || 0));
  const ledgerAbs = Math.max(1, Math.abs(ledgerTotal));

  // ------------------------------------------
  // РОЗРАХУНКИ ДЛЯ ПЕРЕРОБЛЕНИХ БЛОКІВ
  // ------------------------------------------
  const totalTrades = Math.max(1, s.trades.length);

  const rankedStates = once(
    () => [...s.emotionStats].sort((a, b) => b.avg - a.avg),
    [s.emotionStats]
  );
  const maxAbsNet = Math.max(1, ...s.emotionStats.map((e) => Math.abs(e.net)));
  const netTotal = sum(s.emotionStats.map((e) => e.net));
  const impulsiveStates = s.emotionStats.filter((e) => e.emotion === 'tilt' || e.emotion === 'fomo');
  const impulsiveNet = sum(impulsiveStates.map((e) => e.net));
  const impulsiveTrades = sum(impulsiveStates.map((e) => e.trades));
  const netWithoutImpulse = netTotal - impulsiveNet;
  const bestState = rankedStates[0] || { emotion: 'calm', avg: 0 };
  const worstState = rankedStates[rankedStates.length - 1] || { emotion: 'tilt', avg: 0 };

  const calmStat = s.emotionStats.find((e) => e.emotion === 'calm') || { avg: 0, net: 0, trades: 0, list: [] };
  const tiltStat = s.emotionStats.find((e) => e.emotion === 'tilt') || { avg: 0, net: 0, trades: 0, list: [] };

  /* Той самий вердикт, що жив у старому компоненті: чи росте розмір
     позиції разом з тривогою чи тільтом, а не лишається сталим. */
  const riskVerdict = once(() => {
    let maxState = calmStat;
    let highestRisk = calmStat.trades ? sum(calmStat.list.map((t) => t.risk)) / calmStat.trades : 0;
    s.emotionStats.forEach((e) => {
      const avg = e.trades ? sum(e.list.map((t) => t.risk)) / e.trades : 0;
      if (avg > highestRisk && (e.emotion === 'tilt' || e.emotion === 'fomo' || e.emotion === 'anxiety')) {
        highestRisk = avg;
        maxState = e;
      }
    });
    return { emotion: maxState.emotion, risk: highestRisk, warn: highestRisk > 1.05 };
  });

  const riskRows = once(() => s.emotionStats.map((e) => {
    const avgRisk = e.trades ? sum(e.list.map((t) => t.risk)) / e.trades : 0;
    const dev = avgRisk - TARGET_RISK;
    const zone = Math.abs(dev) <= 0.1 ? 'ok' : Math.abs(dev) <= 0.3 ? 'warn' : 'bad';
    return { ...e, avgRisk, dev, zone, extraR: e.trades * Math.max(0, dev) / TARGET_RISK };
  }), [s.emotionStats]);
  const extraRiskR = sum(riskRows.map((r) => r.extraR));

  const leaks = once(() => {
    const list = [
      { name: 'Помилки виконання', cost: Math.abs(Math.min(0, ledgerTotal)), color: '#f87171', fix: `Найдорожча — «${worstMistake.name}»`, icon: XCircle },
      { name: 'Імпульсивні стани', cost: Math.abs(Math.min(0, impulsiveNet)), color: '#fbbf24', fix: `${impulsiveTrades} входів у тільті / FOMO`, icon: Flame },
      { name: 'Надлишковий ризик', cost: Math.abs(extraRiskR), color: 'var(--edge-acc, #8b7bff)', fix: `Пік ${r2(maxRisk)}% замість ${r2(TARGET_RISK)}%`, icon: Gauge },
      { name: 'Вхід одразу після збитку', cost: Math.abs(Math.min(0, s.avgAfterLoss - s.avgAfterWin)) * Math.max(1, Math.round(totalTrades * 0.15)), color: 'var(--edge-acc, #8b7bff)', fix: `Очікування падає до ${signed(s.avgAfterLoss, 2)}R`, icon: TrendingDown }
    ].filter((l) => l.cost > 0.01);
    return list.sort((a, b) => b.cost - a.cost);
  }, [ledgerTotal, impulsiveNet, extraRiskR, s.avgAfterLoss, s.avgAfterWin, totalTrades, maxRisk, worstMistake.name, impulsiveTrades]);

  const leakTotal = sum(leaks.map((l) => l.cost));
  const maxLeak = Math.max(1, ...leaks.map((l) => l.cost));
  const potential = netTotal + leakTotal;

  const liveRules = once(() => {
    const calmCount = s.trades.filter((t) => t.emotion !== 'tilt' && t.emotion !== 'fomo').length;
    const riskCount = s.trades.filter((t) => (t.risk ?? 0) <= TARGET_RISK + 0.001).length;

    const base = [
      { txt: 'Входжу лише в робочому стані', ok: calmCount, total: totalTrades, cost: Math.abs(Math.min(0, impulsiveNet)) },
      { txt: `Ризик ≤ ${r2(TARGET_RISK)}% на угоду`, ok: riskCount, total: totalTrades, cost: Math.abs(extraRiskR) }
    ];

    const fromMistakes = s.mistakeLedger.slice(0, 4).map((m) => ({
      txt: `Не допускаю: ${m.name}`,
      ok: Math.max(0, totalTrades - (m.count || 0)),
      total: totalTrades,
      cost: Math.abs(m.cost)
    }));

    return [...base, ...fromMistakes]
      .map((r) => ({ ...r, pct: Math.round((r.ok / Math.max(1, r.total)) * 100) }))
      .sort((a, b) => a.pct - b.pct);
  }, [s.trades, s.mistakeLedger, totalTrades, impulsiveNet, extraRiskR]);

  const readiness = Math.round(sum(liveRules.map((r) => r.pct)) / Math.max(1, liveRules.length));

  const stateData = s.emotionStats.map((e) => ({
    subject: EMOTION_LABEL[e.emotion],
    trades: e.trades,
    wr: e.wr,
    clean: e.trades ? Math.round(((e.trades - e.list.filter((t) => t.mistakes.length).length) / e.trades) * 100) : 0,
    color: EMOTION_COLOR[e.emotion]
  }));

  const maxPlanLen = Math.max(s.followed.length, s.broken.length);
  let fAcc = 0;
  let bAcc = 0;
  const planChartData = Array.from({ length: maxPlanLen }).map((_, i) => {
    if (i < s.followed.length) fAcc += s.followed[i].rr;
    if (i < s.broken.length) bAcc += s.broken[i].rr;
    return { step: i + 1, fAcc, bAcc };
  });
  return {
    worstMistake,
    totalGross,
    maxRisk,
    ledgerTotal,
    ledgerCount,
    ledgerAbs,
    totalTrades,
    rankedStates,
    maxAbsNet,
    netTotal,
    impulsiveStates,
    impulsiveNet,
    impulsiveTrades,
    netWithoutImpulse,
    bestState,
    worstState,
    calmStat,
    tiltStat,
    riskVerdict,
    riskRows,
    extraRiskR,
    leaks,
    leakTotal,
    maxLeak,
    potential,
    liveRules,
    readiness,
    stateData,
    maxPlanLen,
    planChartData,
  };
}
