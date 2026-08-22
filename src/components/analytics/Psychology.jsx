import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, Radar, PieChart, Pie, Cell, Tooltip as RTooltip } from 'recharts';
import { CheckCircle2, XCircle, AlertTriangle, Flame, Gauge, Info, PieChart as PieChartIcon, Radar as RadarIcon, HelpCircle, X, Brain, Activity, Zap, ShieldCheck, ChevronDown, ArrowUpRight, ArrowRight, Cpu, Sparkles, Target, Crosshair, TrendingDown, Droplet } from 'lucide-react';
import { motion, useMotionValue, useMotionTemplate, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { Panel, Delta, ChartTip, axis, Meter } from './ui';
import { PsychologistPanel } from './PsychologistPanel';
import { EMOTION_COLOR, EMOTION_LABEL, signed, r1, r2, sum } from './data';

// ==========================================
// АНІМАЦІЇ
// ==========================================
const premiumEasing = [0.22, 1, 0.36, 1];

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.05 }
  }
};

const fadeUpVariant = {
  hidden: { opacity: 0, y: 20, filter: "blur(4px)" },
  visible: { 
    opacity: 1, y: 0, filter: "blur(0px)", 
    transition: { duration: 0.6, ease: premiumEasing } 
  }
};

// Цільовий ризик на угоду (%)
const TARGET_RISK = 1;

// ==========================================
// М'ЯКА КАРТКА SPOTLIGHT
// ==========================================
function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.06)" }) {
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
const TiltTooltip = ({ active, payload, label }) => {
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

const PlanTooltip = ({ active, payload, label }) => {
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
function NeuroProfile({ s, onOpenTrade }) {
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
      <Panel
        title={<><Cpu size={13} /> Нейропрофіль</>}
        right={<span className="text-[10px] tracking-[0.14em] uppercase font-bold" style={{ color: neuro.tier.color }}>Сканування завершено</span>}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5 items-center mt-2">

          <NeuroScanner neuro={neuro} active={active} setActive={setActive} />

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
                    <span className="text-[12px] font-semibold text-[#FAFAFA] w-[92px] shrink-0">{a.label}</span>
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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
      </Panel>

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
export default function Psychology({ s, onOpenTrade = (t) => console.log('open trade', t) }) {
  const [profileView, setProfileView] = useState('radar');
  const [isRiskInfoOpen, setIsRiskInfoOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const calmStat = s.emotionStats.find((e) => e.emotion === 'calm') || { avg: 0, net: 0, trades: 0, list: [] };
  const tiltStat = s.emotionStats.find((e) => e.emotion === 'tilt') || { avg: 0, net: 0 };
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

  const rankedStates = useMemo(
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

  const riskRows = useMemo(() => s.emotionStats.map((e) => {
    const avgRisk = e.trades ? sum(e.list.map((t) => t.risk)) / e.trades : 0;
    const dev = avgRisk - TARGET_RISK;
    const zone = Math.abs(dev) <= 0.1 ? 'ok' : Math.abs(dev) <= 0.3 ? 'warn' : 'bad';
    return { ...e, avgRisk, dev, zone, extraR: e.trades * Math.max(0, dev) / TARGET_RISK };
  }), [s.emotionStats]);
  const extraRiskR = sum(riskRows.map((r) => r.extraR));

  const leaks = useMemo(() => {
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

  const liveRules = useMemo(() => {
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

  const getRiskVerdict = () => {
    let maxState = calmStat;
    let highestRisk = calmStat.trades ? sum(calmStat.list.map(t => t.risk)) / calmStat.trades : 0;

    s.emotionStats.forEach(e => {
      const avg = e.trades ? sum(e.list.map(t => t.risk)) / e.trades : 0;
      if (avg > highestRisk && (e.emotion === 'tilt' || e.emotion === 'fomo' || e.emotion === 'anxiety')) {
        highestRisk = avg;
        maxState = e;
      }
    });

    if (highestRisk > 1.05) {
      return (
        <div className="mt-3 p-3 bg-[#f87171]/10 border border-[#f87171]/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#f87171] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#f87171] leading-[1.5] m-0">
            <b>Попередження:</b> У стані <b>«{EMOTION_LABEL[maxState.emotion]}»</b> твій ризик зростає до {r2(highestRisk)}%. Ти емоційно збільшуєш об'єм, щоб відігратися. Контролюй розмір позиції!
          </p>
        </div>
      );
    }
    return (
      <div className="mt-3 p-3 bg-[#34d399]/10 border border-[#34d399]/20 rounded-xl flex items-start gap-3">
        <CheckCircle2 size={16} className="text-[#34d399] mt-0.5 shrink-0" />
        <p className="text-[12px] text-[#34d399] leading-[1.5] m-0">
          <b>Все чудово:</b> Твій розмір позиції стабільний і не піддається впливу емоцій. Так тримати!
        </p>
      </div>
    );
  };

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

  const globalMouseX = useMotionValue(0);
  const globalMouseY = useMotionValue(0);

  function handleGlobalMouseMove({ clientX, clientY }) {
    globalMouseX.set(clientX);
    globalMouseY.set(clientY);
  }

  const RiskModal = () => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted || typeof document === 'undefined') return null;

    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-[#08080A]/55 backdrop-blur-[14px] backdrop-saturate-150"
          onClick={() => setIsRiskInfoOpen(false)}
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-sm max-h-full overflow-y-auto custom-scrollbar bg-[var(--edge-sunken)]/90 backdrop-blur-2xl border border-[var(--edge-hair-strong)] rounded-[20px] shadow-[0_30px_90px_rgba(0,0,0,0.7)] p-6"
        >
          <button onClick={() => setIsRiskInfoOpen(false)} className="absolute top-4 right-4 text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors">
            <X size={18} />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#8b7bff]/10 flex items-center justify-center mb-4 border border-[#8b7bff]/20">
            <Info size={20} className="text-[#8b7bff]" />
          </div>
          <h3 className="text-[var(--edge-text)] text-lg font-bold mb-2 font-['Instrument_Serif',serif] tracking-wide">Як працює цей блок?</h3>
          <p className="text-[13px] text-[#B4B4BD] leading-[1.6] mb-4">
            Шкала показує <b>відхилення від цілі {r2(TARGET_RISK)}%</b>. Центр смуги — ціль, вліво — недобір об'єму, вправо — перебір.
          </p>
          <ul className="flex flex-col gap-3 text-[12.5px] text-[#7A7A85]">
            <li className="flex gap-2.5 items-start">
              <CheckCircle2 size={16} className="text-[#34d399] shrink-0 mt-0.5" /> 
              <span className="leading-snug">Зелена зона — ризик у коридорі ±0.1% від цілі. Так має бути в кожному стані.</span>
            </li>
            <li className="flex gap-2.5 items-start">
              <AlertTriangle size={16} className="text-[#f87171] shrink-0 mt-0.5" /> 
              <span className="leading-snug">Якщо в тільті чи FOMO мітка йде вправо — емоції збільшують об'єм. «Зайвий ризик» унизу показує, скільки додаткових R ти вже поставив на кон.</span>
            </li>
          </ul>
          <button onClick={() => setIsRiskInfoOpen(false)} className="w-full mt-6 py-2.5 bg-[var(--edge-hair)] hover:bg-white/10 text-[var(--edge-text)] text-[13px] font-bold rounded-xl transition-colors border border-[var(--edge-hair-strong)]">
            Зрозуміло
          </button>
        </motion.div>
      </div>,
      document.body
    );
  };

  return (
    <motion.div 
      variants={staggerContainer} 
      initial="hidden" 
      animate="visible" 
      className="flex flex-col gap-4 relative"
      onMouseMove={handleGlobalMouseMove}
    >
      <AnimatePresence>
        {isRiskInfoOpen && <RiskModal />}
      </AnimatePresence>

      <motion.div
        className="pointer-events-none fixed inset-0 z-0 opacity-40"
        style={{
          background: useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(52, 211, 153, 0.04), transparent 80%)`,
        }}
      />

      <motion.div variants={fadeUpVariant} className="flex items-baseline gap-4 relative z-10 mb-2">
        <h2 className="font-['Instrument_Serif',serif] text-[30px] font-normal m-0 tracking-[0.2px] text-[var(--edge-text)]">Психологія</h2>
        <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">
          {s.trades.length} угод розмічено емоціями · {s.trades.filter((t) => t.mistakes.length).length} з помилками
        </span>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4 items-start relative z-10">
        <div className="flex flex-col gap-4">

          <motion.div variants={fadeUpVariant}>
            <NeuroProfile s={s} onOpenTrade={onOpenTrade} />
          </motion.div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <motion.div variants={fadeUpVariant} className="h-full">
              <Panel title={<><Flame size={13} /> Ланцюг тільта</>} right="Графік залежності" className="h-full">
                <div className="w-full h-[200px] mt-2 relative group">
                  <ResponsiveContainer>
                    <AreaChart data={s.chain} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tiltGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#34d399" stopOpacity={0.6}/>
                          <stop offset="30%" stopColor="#fbbf24" stopOpacity={0.4}/>
                          <stop offset="100%" stopColor="#f87171" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                      <XAxis dataKey="depth" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} tickFormatter={(val) => val === '0' ? 'Старт' : `${val} L`} />
                      <YAxis {...axis} />
                      <RTooltip content={<TiltTooltip />} cursor={{ stroke: 'var(--edge-text4, #4A4A52)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                      <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={2} />
                      <Area type="monotone" dataKey="avg" name="Сер. R" stroke="url(#tiltGrad)" strokeWidth={3} fill="url(#tiltGrad)" fillOpacity={0.2} activeDot={{ r: 6, fill: '#fff', stroke: '#f87171', strokeWidth: 2 }} isAnimationActive={true} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 p-3 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-xl flex items-start gap-3">
                  <Info size={16} className="text-[#8b7bff] mt-0.5 shrink-0" />
                  <p className="text-[12px] text-[#B4B4BD] leading-[1.5] m-0">
                    Після плюса твоя наступна угода дає <b><Delta v={s.avgAfterWin} d={2} /></b>. 
                    Але щойно ти ловиш мінус, наступний вхід у середньому падає до <b><Delta v={s.avgAfterLoss} d={2} /></b>.
                  </p>
                </div>
              </Panel>
            </motion.div>

            <motion.div variants={fadeUpVariant} className="h-full">
              <Panel 
                title="Емоційний розподіл" 
                right={
                  <div className="flex bg-[var(--edge-surface-hi)] border border-[var(--edge-hair-strong)] rounded-lg p-0.5">
                    <button onClick={() => setProfileView('pie')} className={`p-1.5 rounded-md transition-all ${profileView === 'pie' ? 'bg-[#33333A] text-[var(--edge-text)]' : 'text-[#7A7A85] hover:text-[var(--edge-text)]'}`} title="Частка станів (%)">
                      <PieChartIcon size={14} />
                    </button>
                    <button onClick={() => setProfileView('radar')} className={`p-1.5 rounded-md transition-all ${profileView === 'radar' ? 'bg-[#33333A] text-[var(--edge-text)]' : 'text-[#7A7A85] hover:text-[var(--edge-text)]'}`} title="Ефективність станів">
                      <RadarIcon size={14} />
                    </button>
                  </div>
                } 
                className="h-full flex flex-col"
              >
                <p className="text-[11.5px] text-[#7A7A85] leading-[1.5] mt-1 mb-2">
                  {profileView === 'pie' ? 'Які емоції найчастіше супроводжують твої входи в ринок (у % від загальної кількості угод).' : 'Як різні емоційні стани впливають на твій Вінрейт та Дисципліну (чисті угоди без помилок).'}
                </p>
                
                <div className="w-full flex-1 min-h-[200px] mt-2 flex items-center justify-center relative">
                  {profileView === 'pie' ? (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie 
                            data={stateData} 
                            dataKey="trades" 
                            nameKey="subject" 
                            cx="50%" 
                            cy="50%" 
                            innerRadius={55} 
                            outerRadius={85} 
                            paddingAngle={4}
                            stroke="none"
                            isAnimationActive={true}
                          >
                            {stateData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RTooltip 
                            contentStyle={{ backgroundColor: 'var(--edge-sunken, #0D0D10)', borderColor: 'var(--edge-line, #232328)', borderRadius: '12px', fontSize: '12px', padding: '10px 14px' }}
                            itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                            formatter={(value, name) => [`${value} угод`, name]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2.5">
                        {stateData.map((e, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11.5px] font-medium text-[#FAFAFA]">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: e.color }} />
                            <span>{e.subject} <span className="text-[#7A7A85] ml-1">({Math.round((e.trades / s.trades.length) * 100)}%)</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={stateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <PolarGrid stroke="var(--edge-line, #232328)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--edge-text3, #7A7A85)' }} />
                        <Radar name="Вінрейт" dataKey="wr" stroke="var(--edge-acc, #8b7bff)" fill="var(--edge-acc, #8b7bff)" fillOpacity={0.25} isAnimationActive={true} animationDuration={800} />
                        <Radar name="Чистих угод" dataKey="clean" stroke="#34d399" fill="#34d399" fillOpacity={0.18} isAnimationActive={true} animationDuration={800} />
                        <RTooltip content={<ChartTip unit="%" />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Panel>
            </motion.div>
          </div>

          {/* ===== СТАН ВХОДУ → ГРОШІ (перероблено) ===== */}
          <motion.div variants={fadeUpVariant}>
            <Panel title="Стан входу → гроші" right="рейтинг станів за середнім R">

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                <div className="p-3.5 rounded-[12px] border border-[#34d399]/15 bg-[#34d399]/[0.05]">
                  <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Найкращий стан</span>
                  <b className="block text-[15px] font-extrabold mt-1 text-[#34d399]">{EMOTION_LABEL[bestState.emotion]}</b>
                  <small className="text-[11px] text-[#7A7A85]">{signed(bestState.avg, 2)}R на угоду</small>
                </div>
                <div className="p-3.5 rounded-[12px] border border-[#f87171]/15 bg-[#f87171]/[0.05]">
                  <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Найгірший стан</span>
                  <b className="block text-[15px] font-extrabold mt-1 text-[#f87171]">{EMOTION_LABEL[worstState.emotion]}</b>
                  <small className="text-[11px] text-[#7A7A85]">{signed(worstState.avg, 2)}R на угоду</small>
                </div>
                <div className="p-3.5 rounded-[12px] border border-[var(--edge-hair-strong)] bg-[var(--edge-hair)]">
                  <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Без імпульсивних входів</span>
                  <div className="flex items-center gap-2 mt-1">
                    <b className="text-[15px] font-extrabold text-[#7A7A85] line-through decoration-[#f87171]/60">{signed(netTotal)}R</b>
                    <ArrowRight size={13} className="text-[#7A7A85]" />
                    <b className="text-[15px] font-extrabold text-[#34d399]">{signed(netWithoutImpulse)}R</b>
                  </div>
                  <small className="text-[11px] text-[#7A7A85]">мінус {impulsiveTrades} угод у тільті / FOMO</small>
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-3">
                {rankedStates.map((e, i) => {
                  const color = EMOTION_COLOR[e.emotion];
                  const pos = e.net >= 0;
                  const share = Math.round((e.trades / totalTrades) * 100);
                  return (
                    <SpotlightCard key={e.emotion} glowColor={`${color}25`} className="rounded-[12px]">
                      <div className="px-4 py-3 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] transition-colors group-hover:border-[var(--edge-hair-strong)]">

                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[10px] font-black text-[#7A7A85] w-[16px] shrink-0">{i + 1}</span>
                          <span className="flex items-center gap-2 text-[13px] font-bold text-[#FAFAFA] w-[104px] shrink-0">
                            <i className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}80` }} />
                            {EMOTION_LABEL[e.emotion]}
                          </span>

                          <div className="relative flex-1 min-w-[140px] h-[10px] bg-[var(--edge-surface-hi)] rounded-full">
                            <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-white/15" />
                            <motion.div
                              className="absolute top-0 h-full rounded-full"
                              style={pos
                                ? { left: '50%', background: color }
                                : { right: '50%', background: color }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(Math.abs(e.net) / maxAbsNet) * 50}%` }}
                              transition={{ duration: 0.9, ease: premiumEasing }}
                            />
                          </div>

                          <b className="text-[13px] font-black w-[64px] text-right shrink-0" style={{ color: pos ? '#34d399' : '#f87171' }}>
                            {signed(e.net)}R
                          </b>
                        </div>

                        <div className="flex items-center gap-4 flex-wrap mt-2 pl-[19px] text-[11px] text-[#7A7A85]">
                          <span>{e.trades} угод <span className="text-[#4A4A52]">({share}%)</span></span>
                          <span className="flex items-center gap-1.5">
                            WR
                            <span className="inline-block w-[42px] h-[3px] rounded-full bg-[#232328] overflow-hidden align-middle">
                              <span className="block h-full" style={{ width: `${e.wr}%`, background: color }} />
                            </span>
                            <b className="text-[#FAFAFA]">{e.wr}%</b>
                          </span>
                          <span>Сер. <b style={{ color: e.avg >= 0 ? '#34d399' : '#f87171' }}>{signed(e.avg, 2)}R</b></span>
                          <span className={e.mistakes ? 'text-[#f87171]' : 'text-[#7A7A85]'}>
                            {e.mistakes} помилок
                          </span>
                        </div>

                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>

              <div className="mt-4 p-4 bg-[var(--edge-surface-hi)]/80 border border-[var(--edge-hair)] rounded-[12px]">
                <p className="text-[12.5px] text-[#FAFAFA] leading-[1.6] m-0">
                  <span className="text-[#8b7bff] font-bold">💡 Простими словами:</span> Спокійний вхід приносить <b className="text-[#34d399]">{signed(calmStat.avg, 2)}R</b>, вхід у тільті — <b className="text-[#f87171]">{signed(tiltStat.avg, 2)}R</b>. Різниця в <b className="text-[var(--edge-text)]">{r2(Math.abs(calmStat.avg - tiltStat.avg))}R</b> на кожну угоду — це і є ціна одного емоційного рішення.
                </p>
              </div>
            </Panel>
          </motion.div>

          <motion.div variants={fadeUpVariant}>
            <Panel
              title="Реєстр помилок (Дисципліна)"
              right={
                <button
                  onClick={() => setLedgerOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase font-bold text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors"
                >
                  {ledgerOpen ? 'Згорнути' : 'Деталі'}
                  <motion.span animate={{ rotate: ledgerOpen ? 180 : 0 }} transition={{ duration: 0.25 }} className="flex">
                    <ChevronDown size={14} />
                  </motion.span>
                </button>
              }
            >
              <div className="mt-2 p-3.5 bg-[var(--edge-surface-hi)]/70 border border-[#f87171]/10 rounded-[12px]">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="shrink-0">
                    <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Втрачено на помилках</span>
                    <b className="block text-[24px] font-extrabold text-[#f87171] leading-tight">{r1(ledgerTotal)}R</b>
                  </div>
                  <div className="h-9 w-px bg-[var(--edge-hair)] hidden sm:block" />
                  <div className="flex gap-5 text-[11.5px] flex-wrap">
                    <span className="text-[#7A7A85]">Типів: <b className="text-[var(--edge-text)]">{s.mistakeLedger.length}</b></span>
                    <span className="text-[#7A7A85]">Разів: <b className="text-[var(--edge-text)]">{ledgerCount}</b></span>
                    <span className="text-[#7A7A85]">Найдорожча: <b className="text-[#FAFAFA]">{worstMistake.name}</b> <b className="text-[#f87171]">{signed(worstMistake.cost)}R</b></span>
                  </div>
                </div>

                <div className="mt-3 w-full h-[6px] rounded-full overflow-hidden flex bg-[#232328]">
                  {s.mistakeLedger.map((m, i) => (
                    <div
                      key={m.name}
                      className="h-full"
                      title={`${m.name}: ${signed(m.cost)}R`}
                      style={{
                        width: `${(Math.abs(m.cost) / ledgerAbs) * 100}%`,
                        background: '#f87171',
                        opacity: 1 - i * 0.16,
                        marginRight: i < s.mistakeLedger.length - 1 ? '2px' : 0
                      }}
                    />
                  ))}
                </div>

                {!ledgerOpen && (
                  <p className="text-[11.5px] text-[#7A7A85] leading-[1.5] mt-2.5 m-0">
                    Без цих порушень твій результат був би на <b className="text-[#34d399]">{r1(Math.abs(ledgerTotal))}R</b> вищим.
                  </p>
                )}
              </div>

              <AnimatePresence initial={false}>
                {ledgerOpen && (
                  <motion.div
                    key="ledger"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: premiumEasing }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 mt-3">
                      {s.mistakeLedger.map((m) => {
                        const share = Math.abs(m.cost) / ledgerAbs * 100;
                        return (
                          <SpotlightCard key={m.name} glowColor="rgba(248,113,113, 0.15)" className="rounded-[12px]">
                            <div className="p-[14px_16px] bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] flex flex-col gap-[10px] transition-colors hover:border-[var(--edge-hair-strong)]">
                              <div className="flex justify-between items-end">
                                <b className="text-[#FAFAFA] text-[13px]">{m.name}</b>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-[#232328] h-[4px] rounded-full overflow-hidden">
                                  <div className="h-full bg-[#f87171]" style={{ width: `${share}%` }}></div>
                                </div>
                                <b className="text-[#f87171] text-[13px] w-[50px] text-right font-black">{signed(m.cost)}R</b>
                              </div>
                              <div className="text-[11px] text-[#7A7A85]">
                                {m.count} разів · {Math.round(share)}% усіх втрат від помилок
                              </div>
                            </div>
                          </SpotlightCard>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          </motion.div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            
            <motion.div variants={fadeUpVariant} className="h-full">
              <Panel title="План дотримано vs порушено" className="h-full">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
                  <SpotlightCard glowColor="rgba(52, 211, 153, 0.25)" className="rounded-[14px]">
                    <div className="p-5 bg-[var(--edge-surface-hi)]/80 border border-[#34d399]/10 shadow-[0_0_15px_rgba(52,211,153,0.02)] rounded-[14px] relative overflow-hidden transition-colors hover:border-[#34d399]/30">
                      <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">По плану</span>
                      <b className="block text-[28px] font-extrabold mt-2 mb-1 text-[#34d399]">{signed(sum(s.followed.map((t) => t.rr)))}R</b>
                      <small className="text-[11.5px] font-medium text-[#7A7A85]">{s.followed.length} угод · WR {Math.round((s.followed.filter((t) => t.result === 'WIN').length / Math.max(1, s.followed.filter((t) => t.result !== 'BE').length)) * 100)}%</small>
                    </div>
                  </SpotlightCard>
                  <SpotlightCard glowColor="rgba(248,113,113, 0.25)" className="rounded-[14px]">
                    <div className="p-5 bg-[var(--edge-surface-hi)]/80 border border-[#f87171]/10 shadow-[0_0_15px_rgba(248,113,113,0.02)] rounded-[14px] relative overflow-hidden transition-colors hover:border-[#f87171]/30">
                      <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">З порушенням</span>
                      <b className="block text-[28px] font-extrabold mt-2 mb-1 text-[#f87171]">{signed(sum(s.broken.map((t) => t.rr)))}R</b>
                      <small className="text-[11.5px] font-medium text-[#7A7A85]">{s.broken.length} угод · WR {Math.round((s.broken.filter((t) => t.result === 'WIN').length / Math.max(1, s.broken.filter((t) => t.result !== 'BE').length)) * 100)}%</small>
                    </div>
                  </SpotlightCard>
                </div>
                
                <div className="mt-5 w-full bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] p-4">
                  <h4 className="text-[11px] text-[#7A7A85] font-bold uppercase tracking-widest mb-3 text-center">Накопичений PnL (Крива капіталу)</h4>
                  <div className="w-full h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={planChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="gradF" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f87171" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                        <XAxis dataKey="step" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} />
                        <YAxis {...axis} />
                        <RTooltip content={<PlanTooltip />} cursor={{ stroke: 'var(--edge-text4, #4A4A52)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                        <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={2} />
                        <Area type="monotone" dataKey="fAcc" name="По плану" stroke="#34d399" strokeWidth={2.5} fill="url(#gradF)" isAnimationActive={true} />
                        <Area type="monotone" dataKey="bAcc" name="З порушенням" stroke="#f87171" strokeWidth={2.5} fill="url(#gradB)" isAnimationActive={true} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Panel>
            </motion.div>

            {/* ===== РИЗИК І СТАН (перероблено) ===== */}
            <motion.div variants={fadeUpVariant} className="h-full">
              <Panel 
                title={
                  <div className="flex items-center gap-2">
                    Ризик і стан
                    <button onClick={() => setIsRiskInfoOpen(true)} className="text-[#7A7A85] hover:text-[#8b7bff] transition-colors" title="Як це працює?">
                      <HelpCircle size={14} />
                    </button>
                  </div>
                } 
                right={<span className="inline-flex items-center gap-1.5"><Target size={12} /> ціль {r2(TARGET_RISK)}%</span>}
                className="h-full"
              >
                <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.14em] font-black text-[#7A7A85] mt-2 mb-1.5 px-[100px]">
                  <span>недобір</span>
                  <span className="text-[#7A7A85]">ціль</span>
                  <span>перебір</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  {riskRows.map((e) => {
                    const zoneColor = e.zone === 'ok' ? '#34d399' : e.zone === 'warn' ? '#fbbf24' : '#f87171';
                    const pct = Math.max(2, Math.min(98, (e.avgRisk / (TARGET_RISK * 2)) * 100));
                    return (
                      <SpotlightCard key={e.emotion} glowColor={`${zoneColor}22`} className="rounded-[12px]">
                        <div className="px-3 py-2.5 bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] transition-colors hover:border-[var(--edge-hair-strong)] flex items-center gap-3">

                          <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#FAFAFA] w-[96px] shrink-0">
                            <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: EMOTION_COLOR[e.emotion] }} />
                            {EMOTION_LABEL[e.emotion]}
                          </span>

                          <div className="relative flex-1 h-[22px] flex items-center min-w-[90px]">
                            <div className="absolute inset-y-[7px] left-0 right-0 bg-[var(--edge-surface-hi)] rounded-full" />
                            <div className="absolute inset-y-[7px] rounded-full bg-[#34d399]/20" style={{ left: '45%', width: '10%' }} />
                            <div className="absolute left-1/2 top-1 bottom-1 w-px bg-white/25" />
                            <motion.div
                              className="absolute inset-y-[7px] rounded-full"
                              style={e.avgRisk >= TARGET_RISK
                                ? { left: '50%', background: zoneColor }
                                : { right: '50%', background: zoneColor }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.abs(pct - 50)}%` }}
                              transition={{ duration: 0.8, ease: premiumEasing }}
                            />
                            <motion.div
                              className="absolute w-[3px] h-[14px] rounded-full"
                              style={{ background: zoneColor, boxShadow: `0 0 8px ${zoneColor}` }}
                              initial={{ left: '50%' }}
                              animate={{ left: `${pct}%` }}
                              transition={{ duration: 0.8, ease: premiumEasing }}
                            />
                          </div>

                          <div className="w-[84px] text-right shrink-0">
                            <b className="block text-[13px] font-bold" style={{ color: zoneColor }}>{r2(e.avgRisk)}%</b>
                            <span className="block text-[10px] text-[#7A7A85]">
                              {e.dev >= 0 ? '+' : ''}{r2(e.dev)}% · {e.trades} уг.
                            </span>
                          </div>
                        </div>
                      </SpotlightCard>
                    );
                  })}
                </div>

                <div className="mt-3 p-3 rounded-xl border border-[var(--edge-hair)] bg-[var(--edge-surface-hi)]/60 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <Crosshair size={15} className="text-[#8b7bff] shrink-0" />
                    <span className="text-[12px] text-[#B4B4BD] leading-snug">Зайвого ризику взято понад ціль</span>
                  </div>
                  <b className="text-[15px] font-extrabold text-[#8b7bff]">{r1(extraRiskR)}R</b>
                </div>

                {getRiskVerdict()}

              </Panel>
            </motion.div>
          </div>
        </div>

        {/* Права колонка */}
        <div className="flex flex-col gap-4 lg:sticky top-5">
          <motion.div variants={fadeUpVariant}>
            <PsychologistPanel stats={s} />
          </motion.div>

          {/* ===== ВЕРДИКТ ПО ДИСЦИПЛІНІ (перероблено) ===== */}
          <motion.div variants={fadeUpVariant}>
            <Panel title={<><Gauge size={13} /> Вердикт по дисципліні</>} right={`${s.adherence}% плану`}>

              <div className="mt-2 p-4 rounded-[14px] border border-[var(--edge-hair)] bg-[var(--edge-surface-hi)]/80 relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.12] pointer-events-none"
                  style={{ background: 'radial-gradient(300px circle at 100% 0%, #34d399, transparent 70%)' }} />
                <div className="relative z-10 flex items-end justify-between gap-3">
                  <div>
                    <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Зараз</span>
                    <b className="block text-[22px] font-extrabold text-[var(--edge-text)] leading-tight mt-1">{signed(netTotal)}R</b>
                  </div>
                  <ArrowRight size={16} className="text-[#4A4A52] mb-2 shrink-0" />
                  <div className="text-right">
                    <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#34d399] font-black">Потенціал без витоків</span>
                    <b className="block text-[22px] font-extrabold text-[#34d399] leading-tight mt-1">{signed(potential)}R</b>
                  </div>
                </div>

                <div className="relative z-10 mt-3 w-full h-2 bg-[#232328] rounded-full overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, (netTotal / Math.max(1, potential)) * 100))}%` }}
                    transition={{ duration: 1.1, ease: premiumEasing }}
                    className="h-full bg-gradient-to-r from-[#8b7bff] to-[#34d399]"
                  />
                  <div className="flex-1 h-full bg-[#f87171]/25" />
                </div>
                <p className="relative z-10 text-[11.5px] text-[#7A7A85] leading-[1.5] mt-2.5 m-0">
                  Дисципліна коштує тобі <b className="text-[#f87171]">{r1(leakTotal)}R</b> — це різниця між тим, що є, і тим, що вже могло бути.
                </p>
              </div>

              <h4 className="text-[9.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mt-4 mb-2 flex items-center gap-2">
                <Droplet size={12} /> Куди течуть гроші
              </h4>

              <div className="flex flex-col gap-2">
                {leaks.map((l) => {
                  const Icon = l.icon;
                  const share = (l.cost / Math.max(1, leakTotal)) * 100;
                  return (
                    <SpotlightCard key={l.name} glowColor={`${l.color}22`} className="rounded-[12px]">
                      <div className="p-3 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] transition-colors hover:border-[var(--edge-hair-strong)]">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#FAFAFA] min-w-0">
                            <Icon size={14} style={{ color: l.color }} className="shrink-0" />
                            <span className="truncate">{l.name}</span>
                          </div>
                          <b className="text-[13px] shrink-0" style={{ color: l.color }}>−{r1(l.cost)}R</b>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 bg-[#232328] h-[4px] rounded-full overflow-hidden">
                            <motion.div className="h-full rounded-full" style={{ background: l.color }}
                              initial={{ width: 0 }} animate={{ width: `${(l.cost / maxLeak) * 100}%` }}
                              transition={{ duration: 0.9, ease: premiumEasing }} />
                          </div>
                          <span className="text-[10px] font-black text-[#7A7A85] w-[30px] text-right">{Math.round(share)}%</span>
                        </div>
                        <p className="text-[11px] text-[#7A7A85] mt-1.5 m-0 leading-snug">{l.fix}</p>
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>

              <p className="text-[10.5px] text-[#4A4A52] mt-3 m-0 leading-snug">
                Категорії частково перетинаються — одна угода може бути і в тільті, і з порушенням плану.
              </p>
            </Panel>
          </motion.div>

          {/* ===== ЧЕК-ЛИСТ (перероблено) ===== */}
          <motion.div variants={fadeUpVariant}>
            <Panel
              title="Чек-лист перед входом"
              right={
                <span className="text-[10px] tracking-[0.14em] uppercase font-bold" style={{ color: readiness >= 80 ? '#34d399' : readiness >= 60 ? '#fbbf24' : '#f87171' }}>
                  виконання {readiness}%
                </span>
              }
            >
              <p className="text-[11.5px] text-[#7A7A85] leading-[1.5] mt-1 mb-3 m-0">
                Не галочки, а факт: як часто ти реально дотримувався кожного правила за {totalTrades} угод.
              </p>

              <div className="flex flex-col gap-2">
                {liveRules.map((r, i) => {
                  const color = r.pct >= 90 ? '#34d399' : r.pct >= 70 ? '#fbbf24' : '#f87171';
                  const broken = r.total - r.ok;
                  return (
                    <div key={i} className="p-3 bg-[var(--edge-surface-hi)]/50 border border-[var(--edge-hair)] rounded-[12px] hover:border-[var(--edge-hair-strong)] transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {r.pct >= 90
                            ? <CheckCircle2 size={15} className="text-[#34d399] shrink-0 mt-[1px]" />
                            : <XCircle size={15} style={{ color }} className="shrink-0 mt-[1px]" />}
                          <span className="text-[12.5px] font-medium text-[#FAFAFA] leading-snug">{r.txt}</span>
                        </div>
                        <b className="text-[13px] shrink-0" style={{ color }}>{r.pct}%</b>
                      </div>

                      <div className="w-full bg-[#232328] h-[4px] rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ background: color }}
                          initial={{ width: 0 }} animate={{ width: `${r.pct}%` }}
                          transition={{ duration: 0.9, ease: premiumEasing }} />
                      </div>

                      <div className="flex justify-between text-[10.5px] text-[#7A7A85] mt-1.5">
                        <span>{broken > 0 ? `${broken} порушень` : 'без порушень'}</span>
                        {r.cost > 0.01 && <span>ціна: <b className="text-[#f87171]">−{r1(r.cost)}R</b></span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 p-3 rounded-xl border border-[#8b7bff]/20 bg-[#8b7bff]/[0.06] flex items-start gap-2.5">
                <Target size={15} className="text-[#8b7bff] mt-0.5 shrink-0" />
                <p className="text-[11.5px] text-[#B4B4BD] leading-[1.5] m-0">
                  Фокус тижня — <b className="text-[var(--edge-text)]">«{liveRules[0]?.txt}»</b>. Це найслабше правило: {liveRules[0]?.pct}% виконання.
                </p>
              </div>
            </Panel>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}