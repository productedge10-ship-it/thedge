import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BarChart as RechartsBarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip as RTooltip, PieChart, Pie } from 'recharts';
import { Wallet, ArrowUpRight, ArrowDownRight, TrendingUp, Layers, Crosshair, Clock, Trophy, Activity, AlertTriangle, Lightbulb, BarChart2, PieChart as PieIcon, Maximize2, X, Sparkles, Target, Zap, ShieldCheck } from 'lucide-react';
import { motion, useMotionValue, useMotionTemplate, AnimatePresence } from 'framer-motion';
import { Panel, Delta, axis } from './ui';
import { ASSETS, signed, sum, r2 } from './data';

// ==========================================
// АНІМАЦІЇ ТА ЕФЕКТИ
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
// ЧИСТА КРУГОВА ДІАГРАМА
// ==========================================
function StaticAssetPie({ data }) {
  const renderCustomLabel = (props) => {
    const { cx, cy, x, y, name, net, index } = props;
    const isProfit = net >= 0;
    const isRight = x > cx;

    return (
      <foreignObject x={isRight ? x + 4 : x - 134} y={y - 14} width={130} height={32} style={{ overflow: 'visible', outline: 'none' }}>
        <motion.div 
          initial={{ opacity: 0, y: 10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.4 + (index * 0.08), ease: "easeOut" }}
          className={`flex items-center ${isRight ? 'justify-start' : 'justify-end'} w-full h-full outline-none`}
        >
          <div className="flex items-center gap-2 bg-[var(--edge-surface-hi)] border border-[var(--edge-hair-strong)] px-2.5 py-1 rounded-[6px] shadow-sm select-none hover:bg-[var(--edge-hair)] transition-colors cursor-default">
            <div className={`w-1.5 h-1.5 rounded-full ${isProfit ? 'bg-[#34d399]' : 'bg-[#f87171]'}`} />
            <b className="text-[10px] font-black uppercase text-[#FAFAFA] tracking-wider">{name}</b>
            <span className={`text-[10px] font-bold ${isProfit ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(net, 1)}R</span>
          </div>
        </motion.div>
      </foreignObject>
    );
  };

  return (
    <div className="w-full h-[280px] relative select-none outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
      <div className="w-full h-full relative flex items-center justify-center outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={65} outerRadius={85} dataKey="value" stroke="none" paddingAngle={2} minAngle={15}
              labelLine={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1.5, strokeDasharray: '2 3' }}
              label={renderCustomLabel} isAnimationActive={true} animationDuration={600} style={{ outline: 'none' }}
            >
              {data.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#34d399' : '#f87171'} fillOpacity={0.9 - (i % 3) * 0.15} style={{ outline: 'none' }} />)}
            </Pie>
            <RTooltip content={<AssetTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute flex flex-col items-center justify-center pointer-events-none w-[90px] h-[90px] rounded-full border border-[var(--edge-hair)] bg-[#08080A]/60 backdrop-blur-md">
          <Activity size={18} className="text-[#7A7A85] mb-0.5 opacity-60" />
          <span className="text-[16px] font-black text-[#FAFAFA]">{data.length}</span>
          <span className="text-[8px] tracking-[0.2em] text-[#7A7A85] uppercase font-bold mt-1">Активів</span>
        </div>
      </div>
    </div>
  );
}

const AssetTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isProfit = data.net >= 0;
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15, ease: 'easeOut' }}
        className="bg-[var(--edge-sunken)]/95 backdrop-blur-md border border-[#232328] p-3 rounded-[12px] shadow-xl max-w-[200px] z-50 pointer-events-none"
      >
        <p className="text-[11px] text-[#7A7A85] uppercase font-bold tracking-wider mb-2 border-b border-[var(--edge-hair)] pb-2">{data.asset || data.name}</p>
        <div className="flex flex-col gap-1 text-[12.5px]">
          <div className="flex justify-between items-center gap-4"><span className="text-[#B4B4BD]">Чистий R:</span><b className={isProfit ? 'text-[#34d399]' : 'text-[#f87171]'}>{signed(data.net, 2)}R</b></div>
          {data.trades && <div className="flex justify-between items-center gap-4"><span className="text-[#B4B4BD]">Угод:</span><b className="text-[var(--edge-text)]">{data.trades}</b></div>}
        </div>
      </motion.div>
    );
  }
  return null;
};

// ==========================================
// МОДАЛКА: ОДИН СЕТАП
// ==========================================
function SingleSetupModal({ setup, s, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = 'auto'; };
  }, [onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const trades = s.trades.filter(t => t.setup === setup.key);
  const isProfit = setup.net >= 0;
  const color = isProfit ? 'var(--edge-acc, #8b7bff)' : '#f87171';
  
  let lTrades = 0, sTrades = 0, lNet = 0, sNet = 0;
  trades.forEach(t => {
    if(t.direction === 'LONG' || t.type === 'LONG' || t.dir === 'L') { lTrades++; lNet += t.rr; }
    else { sTrades++; sNet += t.rr; }
  });

  const assetMap = {};
  trades.forEach(t => {
    const a = t.asset || t.pair || 'Unknown';
    if(!assetMap[a]) assetMap[a] = { net: 0, trades: 0 };
    assetMap[a].net += t.rr;
    assetMap[a].trades += 1;
  });
  const sortedAssets = Object.entries(assetMap).map(([k, v]) => ({ asset: k, ...v })).sort((a, b) => b.net - a.net);
  const bestAsset = sortedAssets[0];
  const worstAsset = sortedAssets[sortedAssets.length - 1];

  const sessMap = { 'Asia': 0, 'London': 0, 'New York': 0 };
  trades.forEach(t => { if(sessMap[t.session] !== undefined) sessMap[t.session] += t.rr; });

  const verdict = setup.net >= 5 
    ? "Флагманський сетап. Дає стабільний прибуток, можна плавно збільшувати об'єм або частоту торгівлі."
    : setup.net > 0 
    ? "Робочий сетап. Тримається в плюсі, але потребує оптимізації (можливо, ріже вінрейт на певних сесіях)."
    : "Тягне депозит на дно. Потрібно переглянути правила входу, бектест або тимчасово призупинити торгівлю цим патерном.";

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[#08080A]/60 backdrop-blur-[14px] backdrop-saturate-150" onClick={onClose}
      />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.35, ease: premiumEasing }} onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-[800px] max-h-[88vh] flex flex-col rounded-[24px] border border-[var(--edge-hair-strong)] bg-[var(--edge-sunken)]/90 backdrop-blur-2xl shadow-[0_40px_120px_rgba(0,0,0,0.75)] overflow-hidden"
      >
        <div className="shrink-0 relative px-6 md:px-8 py-6 border-b border-[var(--edge-hair)] bg-[var(--edge-hair)]">
          <div className="absolute inset-0 opacity-[0.15] pointer-events-none" style={{ background: `radial-gradient(600px circle at 0% 0%, ${color}, transparent 70%)` }} />
          <button onClick={onClose} className="absolute top-6 right-6 z-20 text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors bg-[var(--edge-hair)] hover:bg-white/10 p-2 rounded-full border border-[var(--edge-hair)]"><X size={18} /></button>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-[18px] flex items-center justify-center border shrink-0" style={{ background: `${color}14`, borderColor: `${color}33` }}>
              <Layers size={28} style={{ color }} />
            </div>
            <div>
              <span className="block text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black mb-1">Аналітика сетапу</span>
              <div className="flex items-baseline gap-3">
                <h3 className="text-[var(--edge-text)] text-[28px] leading-none font-normal m-0 font-['Instrument_Serif',serif] tracking-wide">{setup.key}</h3>
                <b className="text-[20px] font-black" style={{ color: isProfit ? '#34d399' : '#f87171' }}>{signed(setup.net, 2)}R</b>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 flex flex-col gap-6">
          <div className="p-4 rounded-[16px] border border-[#8b7bff]/20 bg-[#8b7bff]/[0.07] flex items-start gap-3">
            <Sparkles size={18} className="text-[#8b7bff] mt-0.5 shrink-0" />
            <p className="text-[13px] text-[#FAFAFA] leading-[1.6] m-0"><b className="text-[#8b7bff]">Вердикт системи:</b> {verdict}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[14px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-1">Угод</span>
              <b className="text-[20px] text-[var(--edge-text)] font-black">{setup.trades}</b>
            </div>
            <div className="p-4 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[14px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-1">Вінрейт</span>
              <b className="text-[20px] text-[var(--edge-text)] font-black">{setup.wr}%</b>
            </div>
            <div className="p-4 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[14px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-1">Сер. R</span>
              <b className="text-[20px] font-black" style={{ color: setup.avg >= 0 ? '#34d399' : '#f87171' }}>{signed(setup.avg, 2)}</b>
            </div>
            <div className="p-4 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[14px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-1">Long / Short</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[13px] font-bold text-[#34d399]">{lTrades}</span>
                <span className="text-[#4A4A52]">/</span>
                <span className="text-[13px] font-bold text-[#8b7bff]">{sTrades}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[16px]">
              <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mb-4 flex items-center gap-2"><Crosshair size={14}/> Напрямок</h4>
              <div className="flex flex-col gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1 text-[12.5px]"><span className="text-[#B4B4BD]">LONG ({lTrades})</span><b className={lNet>=0?'text-[#34d399]':'text-[#f87171]'}>{signed(lNet,2)}R</b></div>
                  <div className="w-full h-[4px] bg-[#232328] rounded-full"><div className="h-full bg-[#34d399] rounded-full" style={{width: `${Math.min(100, (lTrades/setup.trades)*100)}%`}}/></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1 text-[12.5px]"><span className="text-[#B4B4BD]">SHORT ({sTrades})</span><b className={sNet>=0?'text-[#8b7bff]':'text-[#f87171]'}>{signed(sNet,2)}R</b></div>
                  <div className="w-full h-[4px] bg-[#232328] rounded-full"><div className="h-full bg-[#8b7bff] rounded-full" style={{width: `${Math.min(100, (sTrades/setup.trades)*100)}%`}}/></div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[16px]">
              <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mb-4 flex items-center gap-2"><Clock size={14}/> Сесії (PnL)</h4>
              <div className="flex justify-between items-center h-[40px] px-2">
                {Object.entries(sessMap).map(([k, v]) => (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <b className={`text-[15px] ${v >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(v,1)}</b>
                    <span className="text-[10px] text-[#7A7A85] uppercase font-bold">{k}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {sortedAssets.length > 0 && (
            <div>
              <h4 className="text-[10.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mb-3">Де працює найкраще</h4>
              <div className="flex gap-3 flex-wrap">
                {bestAsset && (
                  <div className="flex-1 p-3.5 bg-[#34d399]/5 border border-[#34d399]/20 rounded-[12px] flex justify-between items-center">
                    <div>
                      <span className="text-[9.5px] text-[#34d399] uppercase font-bold block mb-0.5">Топ актив</span>
                      <b className="text-[15px] text-[var(--edge-text)]">{bestAsset.asset}</b>
                    </div>
                    <div className="text-right">
                      <b className="text-[15px] text-[#34d399] block">{signed(bestAsset.net, 2)}R</b>
                      <span className="text-[10px] text-[#7A7A85]">{bestAsset.trades} угод</span>
                    </div>
                  </div>
                )}
                {worstAsset && worstAsset.net < 0 && (
                  <div className="flex-1 p-3.5 bg-[#f87171]/5 border border-[#f87171]/20 rounded-[12px] flex justify-between items-center">
                    <div>
                      <span className="text-[9.5px] text-[#f87171] uppercase font-bold block mb-0.5">Тягне вниз</span>
                      <b className="text-[15px] text-[var(--edge-text)]">{worstAsset.asset}</b>
                    </div>
                    <div className="text-right">
                      <b className="text-[15px] text-[#f87171] block">{signed(worstAsset.net, 2)}R</b>
                      <span className="text-[10px] text-[#7A7A85]">{worstAsset.trades} угод</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
  return createPortal(modalContent, document.body);
}

// ==========================================
// МОДАЛКА: ВСІ СЕТАПИ
// ==========================================
function AllSetupsModal({ s, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = 'auto'; };
  }, [onClose]);

  if (!mounted || typeof document === 'undefined') return null;

  const maxNet = Math.max(0.1, ...s.bySetup.map(x => Math.abs(x.net)));

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[#08080A]/70 backdrop-blur-[14px] backdrop-saturate-150" onClick={onClose}
      />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ duration: 0.35, ease: premiumEasing }} onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-[1000px] max-h-[90vh] flex flex-col rounded-[24px] border border-[var(--edge-hair-strong)] bg-[var(--edge-sunken)]/95 backdrop-blur-3xl shadow-[0_40px_120px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        <div className="shrink-0 relative px-6 md:px-8 py-6 border-b border-[var(--edge-hair)] bg-[var(--edge-hair)]">
          <button onClick={onClose} className="absolute top-6 right-6 z-20 text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors bg-[var(--edge-hair)] hover:bg-white/10 p-2 rounded-full border border-[var(--edge-hair)]"><X size={18} /></button>
          <div className="relative z-10">
            <h3 className="text-[var(--edge-text)] text-[28px] leading-none font-normal m-0 font-['Instrument_Serif',serif] tracking-wide flex items-center gap-3">
              <Layers className="text-[#8b7bff]" size={28}/> Усі сетапи (Детальна аналітика)
            </h3>
            <p className="text-[13px] text-[#7A7A85] mt-2 m-0">Порівняння ефективності всіх патернів, які ти торгуєш.</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="p-5 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[16px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-4">PnL за сетапами</span>
              <div className="flex flex-col gap-3">
                {s.bySetup.map(x => {
                  const isProfit = x.net >= 0;
                  const c = isProfit ? 'var(--edge-acc, #8b7bff)' : '#f87171';
                  const w = (Math.abs(x.net) / maxNet) * 100;
                  return (
                    <div key={x.key} className="flex items-center gap-3">
                      <span className="text-[11.5px] font-bold text-[#FAFAFA] w-[60px] truncate">{x.key}</span>
                      <div className="flex-1 h-[14px] bg-[var(--edge-surface-hi)] rounded-md relative flex items-center border border-[var(--edge-hair)]">
                        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/10 z-0" />
                        <motion.div className="absolute top-0 bottom-0 rounded-md z-10"
                          style={{ background: `linear-gradient(to ${isProfit ? 'right' : 'left'}, ${c}80, ${c})`, [isProfit ? 'left' : 'right']: '50%' }}
                          initial={{ width: 0 }} animate={{ width: `${w / 2}%`, boxShadow: `0 0 10px ${c}40` }} transition={{ duration: 1, ease: premiumEasing }}
                        />
                      </div>
                      <b className={`text-[12.5px] w-[50px] text-right ${isProfit?'text-[#8b7bff]':'text-[#f87171]'}`}>{signed(x.net,1)}R</b>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="p-5 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-[16px]">
              <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black mb-4">Вінрейт vs Кількість угод</span>
              <div className="flex flex-col gap-3">
                {s.bySetup.map(x => (
                  <div key={x.key} className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] font-bold text-[#FAFAFA] w-[60px] truncate">{x.key}</span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="w-[40px] text-[11.5px] text-[#7A7A85] text-right">{x.trades} уг.</div>
                      <div className="flex-1 bg-[#232328] h-[6px] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width: `${x.wr}%`, background: x.wr >= 50 ? '#34d399' : '#fbbf24'}}/>
                      </div>
                      <b className="text-[12.5px] text-[var(--edge-text)] w-[40px]">{x.wr}%</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full border-collapse text-[13px] whitespace-nowrap min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-left p-[0_12px_12px] border-b border-[var(--edge-hair)]">Сетап</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-center p-[0_12px_12px] border-b border-[var(--edge-hair)]">Угод</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-center p-[0_12px_12px] border-b border-[var(--edge-hair)]">Вінрейт</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-right p-[0_12px_12px] border-b border-[var(--edge-hair)]">Net PnL</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-right p-[0_12px_12px] border-b border-[var(--edge-hair)]">Сер. R</th>
                </tr>
              </thead>
              <tbody>
                {s.bySetup.map(x => (
                  <tr key={x.key} className="hover:bg-[var(--edge-hair)] transition-colors border-b border-[var(--edge-hair)] last:border-0">
                    <td className="text-left p-[14px_12px] font-bold text-[#FAFAFA]">{x.key}</td>
                    <td className="text-center p-[14px_12px] text-[#B4B4BD]">{x.trades}</td>
                    <td className="text-center p-[14px_12px]">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${x.wr >= 50 ? 'bg-[#34d399]/10 text-[#34d399]' : 'bg-[var(--edge-hair)] text-[#7A7A85]'}`}>{x.wr}%</span>
                    </td>
                    <td className="text-right p-[14px_12px]"><b className={x.net >= 0 ? 'text-[#8b7bff]' : 'text-[#f87171]'}>{signed(x.net, 2)}R</b></td>
                    <td className="text-right p-[14px_12px]"><b className={x.avg >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}>{signed(x.avg, 2)}R</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
  return createPortal(modalContent, document.body);
}

// ==========================================
// ГОЛОВНИЙ КОМПОНЕНТ
// ==========================================
export default function Assets({ s }) {
  const globalMouseX = useMotionValue(0);
  const globalMouseY = useMotionValue(0);
  const [viewMode, setViewMode] = useState('chart');
  
  const [activeSetupModal, setActiveSetupModal] = useState(null);
  const [isAllSetupsOpen, setIsAllSetupsOpen] = useState(false);

  function handleGlobalMouseMove({ clientX, clientY }) {
    globalMouseX.set(clientX);
    globalMouseY.set(clientY);
  }

  const rankedAssets = useMemo(() => [...s.byAsset].sort((a, b) => b.net - a.net), [s.byAsset]);
  const bestAsset = rankedAssets[0];
  const worstAsset = rankedAssets[rankedAssets.length - 1];
  
  const pieData = useMemo(() => rankedAssets.map(a => ({ name: a.key, value: Math.max(0.5, Math.abs(a.net)), net: a.net, trades: a.trades })), [rankedAssets]);

  const verdict = useMemo(() => {
    if (!rankedAssets.length) return "Немає достатньо даних для аналізу.";
    const top = rankedAssets.filter(a => a.net >= 1).map(a => a.key);
    const bad = rankedAssets.filter(a => a.net <= -1).map(a => a.key);
    return (
      <div className="text-[12.5px] text-[#B4B4BD] leading-[1.6]">
        <b className="text-[#FAFAFA] block mb-1">Вердикт системи:</b>
        {top.length > 0 ? <span>Найкраще зараз торгувати <b className="text-[#34d399]">{top.join(', ')}</b> — вони дають основний профіт. </span> : "Поки що немає стабільно прибуткових активів з великим R. "}
        {bad.length > 0 && <span>Від активів <b className="text-[#f87171]">{bad.join(', ')}</b> краще переключитись на інші або тимчасово призупинити торгівлю ними — зараз вони тягнуть депозит вниз.</span>}
      </div>
    );
  }, [rankedAssets]);

  const maxSetupNet = Math.max(1, ...s.bySetup.map(x => Math.abs(x.net)));

  const lsStats = useMemo(() => {
    let lt = 0, st = 0, ln = 0, sn = 0, lw = 0, sw = 0;
    s.matrix.forEach(row => {
      if (row.l) { lt += row.l.trades; ln += row.l.net; lw += (row.l.trades * (row.l.wr / 100)); }
      if (row.s) { st += row.s.trades; sn += row.s.net; sw += (row.s.trades * (row.s.wr / 100)); }
    });
    const total = lt + st;
    return {
      lt, st, total, ln, sn,
      lWr: lt ? Math.round((lw / lt) * 100) : 0, sWr: st ? Math.round((sw / st) * 100) : 0,
      lPct: total ? Math.round((lt / total) * 100) : 0, sPct: total ? Math.round((st / total) * 100) : 0,
    };
  }, [s.matrix]);

  const lsPieData = [{ name: 'LONG', value: lsStats.lt, fill: '#34d399' }, { name: 'SHORT', value: lsStats.st, fill: 'var(--edge-acc, #8b7bff)' }];
  const lsBarData = [{ name: 'LONG', net: lsStats.ln, color: '#34d399' }, { name: 'SHORT', net: lsStats.sn, color: 'var(--edge-acc, #8b7bff)' }];

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-4 relative" onMouseMove={handleGlobalMouseMove}>
      <motion.div className="pointer-events-none fixed inset-0 z-0 opacity-40" style={{ background: useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(139,123,255, 0.04), transparent 80%)` }} />

      <AnimatePresence>
        {activeSetupModal && <SingleSetupModal setup={activeSetupModal} s={s} onClose={() => setActiveSetupModal(null)} />}
        {isAllSetupsOpen && <AllSetupsModal s={s} onClose={() => setIsAllSetupsOpen(false)} />}
      </AnimatePresence>

      <motion.div variants={fadeUpVariant} className="flex items-baseline gap-4 relative z-10 mb-2">
        <h2 className="font-['Instrument_Serif',serif] text-[30px] font-normal m-0 tracking-[0.2px] text-[var(--edge-text)]">Активи та Сетапи</h2>
        <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">
          {s.byAsset.length} активів в роботі · {s.bySetup.length} сетапів
        </span>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4 items-start relative z-10">
        <div className="flex flex-col gap-4">
          <motion.div variants={fadeUpVariant}>
            <Panel title={<><TrendingUp size={13} /> Ефективність активів</>} 
              right={
                <div className="flex bg-[var(--edge-surface-hi)] border border-[var(--edge-hair-strong)] rounded-lg p-0.5">
                  <button onClick={() => setViewMode('chart')} className={`px-3 py-1.5 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 ${viewMode === 'chart' ? 'bg-[#33333A] text-[var(--edge-text)] shadow-sm' : 'text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)]'}`}><BarChart2 size={13} /> Графік</button>
                  <button onClick={() => setViewMode('pie')} className={`px-3 py-1.5 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 ${viewMode === 'pie' ? 'bg-[#33333A] text-[var(--edge-text)] shadow-sm' : 'text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)]'}`}><PieIcon size={13} /> Діаграма</button>
                </div>
              }
            >
              <div className="flex flex-col sm:flex-row gap-4 mb-4 mt-2">
                {bestAsset && (
                  <SpotlightCard glowColor="rgba(52, 211, 153, 0.2)" className="rounded-[12px] flex-1">
                    <div className="p-3.5 bg-[var(--edge-surface-hi)]/60 border border-[#34d399]/10 rounded-[12px] transition-colors hover:border-[#34d399]/30 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#34d399]/10 flex items-center justify-center border border-[#34d399]/20 shrink-0"><Trophy size={18} className="text-[#34d399]" /></div>
                      <div>
                        <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Топ актив</span>
                        <b className="block text-[16px] font-extrabold mt-0.5 text-[#FAFAFA]">{bestAsset.key} <span className="text-[#34d399] ml-1">{signed(bestAsset.net)}R</span></b>
                      </div>
                    </div>
                  </SpotlightCard>
                )}
                {worstAsset && worstAsset.net < 0 && (
                  <SpotlightCard glowColor="rgba(248,113,113, 0.2)" className="rounded-[12px] flex-1">
                    <div className="p-3.5 bg-[var(--edge-surface-hi)]/60 border border-[#f87171]/10 rounded-[12px] transition-colors hover:border-[#f87171]/30 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#f87171]/10 flex items-center justify-center border border-[#f87171]/20 shrink-0"><AlertTriangle size={18} className="text-[#f87171]" /></div>
                      <div>
                        <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Тягне вниз</span>
                        <b className="block text-[16px] font-extrabold mt-0.5 text-[#FAFAFA]">{worstAsset.key} <span className="text-[#f87171] ml-1">{signed(worstAsset.net)}R</span></b>
                      </div>
                    </div>
                  </SpotlightCard>
                )}
              </div>

              <div className="w-full relative min-h-[280px] outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none">
                <AnimatePresence mode="wait">
                  {viewMode === 'chart' ? (
                    <motion.div key="chart" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }} className="w-full h-[280px] outline-none">
                      <ResponsiveContainer className="outline-none" style={{ outline: 'none' }}>
                        <RechartsBarChart layout="vertical" data={s.byAsset.map((a) => ({ asset: a.key, net: a.net }))} margin={{ top: 0, right: 24, left: 12, bottom: 0 }}>
                          <defs>
                            <linearGradient id="assetWin" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#34d399" stopOpacity={0.8}/><stop offset="100%" stopColor="#34d399" stopOpacity={0.3}/></linearGradient>
                            <linearGradient id="assetLoss" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f87171" stopOpacity={0.3}/><stop offset="100%" stopColor="#f87171" stopOpacity={0.8}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--edge-line, #232328)" />
                          <XAxis type="number" {...axis} />
                          <YAxis dataKey="asset" type="category" {...axis} width={70} tick={{ fontSize: 12, fill: 'var(--edge-text2, #B4B4BD)', fontWeight: 'bold' }} />
                          <RTooltip content={<AssetTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                          <ReferenceLine x={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={2} />
                          <Bar dataKey="net" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={true} animationDuration={600} animationEasing="ease-out">
                            {s.byAsset.map((a, i) => <Cell key={i} fill={a.net >= 0 ? 'url(#assetWin)' : 'url(#assetLoss)'} style={{ outline: 'none' }} />)}
                          </Bar>
                        </RechartsBarChart>
                      </ResponsiveContainer>
                    </motion.div>
                  ) : (
                    <motion.div key="pie" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.3 }} className="w-full outline-none">
                      <StaticAssetPie data={pieData} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-4 p-4 bg-gradient-to-r from-[#18181C] to-[#18181C]/40 border border-[var(--edge-hair)] rounded-[12px] flex items-start gap-3">
                <Lightbulb size={18} className="text-[#8b7bff] mt-0.5 shrink-0" />
                {verdict}
              </div>
            </Panel>
          </motion.div>
        </div>

        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><Wallet size={13} /> Статистика акаунтів</>} className="h-full">
            <div className="flex flex-col gap-3 mt-2">
              {s.byAccount.map((a) => {
                const isProfit = a.net >= 0;
                const color = isProfit ? '#34d399' : '#f87171';
                return (
                  <SpotlightCard key={a.key} glowColor={`${color}20`} className="rounded-[14px]">
                    <div className="bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[14px] p-4 transition-colors hover:border-[var(--edge-hair-strong)] cursor-default">
                      <div className="flex justify-between items-center mb-3">
                        <b className="text-[14px] text-[#FAFAFA]">{a.key}</b>
                        <b className={`text-[15px] ${isProfit ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(a.net, 2)}R</b>
                      </div>
                      <div className="w-full bg-[#232328] h-[6px] rounded-full overflow-hidden mb-3 relative">
                        <motion.div className="absolute left-0 top-0 h-full rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}80` }} initial={{ width: 0 }} animate={{ width: `${a.wr}%` }} transition={{ duration: 1, ease: premiumEasing }} />
                      </div>
                      <div className="flex justify-between items-end text-[11px] text-[#7A7A85] tracking-wide">
                        <span className="flex flex-col gap-0.5"><span className="text-[9px] uppercase font-black">Вінрейт</span><b className="text-[#FAFAFA] text-[13px]">{a.wr}%</b></span>
                        <span className="flex flex-col gap-0.5 text-center"><span className="text-[9px] uppercase font-black">Угод</span><b className="text-[#FAFAFA] text-[13px]">{a.trades}</b></span>
                        <span className={`flex flex-col gap-0.5 text-right ${a.mistakes ? 'text-[#f87171]' : 'text-[#34d399]'}`}><span className="text-[9px] uppercase font-black">Помилок</span><b className="text-[13px]">{a.mistakes}</b></span>
                      </div>
                    </div>
                  </SpotlightCard>
                );
              })}
            </div>
          </Panel>
        </motion.div>
      </div>

      <motion.div variants={fadeUpVariant} className="relative z-10">
        <Panel title={<><Crosshair size={13} /> Матриця напрямків (Long / Short)</>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 mt-2">
            <SpotlightCard glowColor="rgba(255,255,255,0.08)" className="rounded-[12px]">
              <div className="h-full p-4 bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] flex items-center gap-5 relative overflow-hidden transition-colors hover:border-[var(--edge-hair-strong)]">
                <div className="w-[100px] h-[100px] relative select-none outline-none [&_.recharts-wrapper]:outline-none [&_svg]:outline-none shrink-0 group">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart style={{ outline: 'none' }}>
                      <Pie data={lsPieData} cx="50%" cy="50%" innerRadius={36} outerRadius={48} dataKey="value" stroke="none" paddingAngle={4} isAnimationActive={true} animationDuration={800} style={{ outline: 'none' }}>
                        {lsPieData.map((d, i) => <Cell key={i} fill={d.fill} style={{ outline: 'none', transition: 'filter 0.3s' }} className="hover:brightness-110" />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-transform group-hover:scale-105">
                    <span className="text-[17px] font-black text-[#FAFAFA] drop-shadow-md">{lsStats.total}</span>
                    <span className="text-[8px] tracking-[0.2em] text-[#7A7A85] uppercase font-bold mt-0.5">Угод</span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col gap-3 min-w-0">
                  <div className="group/item cursor-default">
                    <div className="flex justify-between items-center mb-1.5"><span className="text-[#34d399] font-black text-[11px] uppercase tracking-wider flex items-center gap-1 group-hover/item:brightness-125 transition-all"><ArrowUpRight size={13} /> Long</span><b className="text-[var(--edge-text)] text-[14px]">{lsStats.lPct}%</b></div>
                    <div className="w-full h-[4px] bg-[#232328] rounded-full overflow-hidden shadow-inner"><motion.div initial={{ width: 0 }} animate={{ width: `${lsStats.lPct}%` }} transition={{ duration: 1, ease: premiumEasing }} className="h-full bg-[#34d399] rounded-full shadow-[0_0_8px_#34d39980]" /></div>
                    <span className="text-[10.5px] text-[#7A7A85] mt-1.5 block group-hover/item:text-[#B4B4BD] transition-colors">{lsStats.lt} угод · WR {lsStats.lWr}%</span>
                  </div>
                  <div className="group/item cursor-default">
                    <div className="flex justify-between items-center mb-1.5"><span className="text-[#8b7bff] font-black text-[11px] uppercase tracking-wider flex items-center gap-1 group-hover/item:brightness-125 transition-all">Short <ArrowDownRight size={13} /></span><b className="text-[var(--edge-text)] text-[14px]">{lsStats.sPct}%</b></div>
                    <div className="w-full h-[4px] bg-[#232328] rounded-full overflow-hidden shadow-inner"><motion.div initial={{ width: 0 }} animate={{ width: `${lsStats.sPct}%` }} transition={{ duration: 1, ease: premiumEasing }} className="h-full bg-[#8b7bff] rounded-full shadow-[0_0_8px_#8b7bff80]" /></div>
                    <span className="text-[10.5px] text-[#7A7A85] mt-1.5 block group-hover/item:text-[#B4B4BD] transition-colors">{lsStats.st} угод · WR {lsStats.sWr}%</span>
                  </div>
                </div>
              </div>
            </SpotlightCard>
            <SpotlightCard glowColor="rgba(255,255,255,0.08)" className="rounded-[12px]">
              <div className="h-full p-5 bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] flex flex-col justify-center gap-5 transition-colors hover:border-[var(--edge-hair-strong)]">
                <span className="block text-[10px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">Баланс PnL за напрямками</span>
                <div className="flex flex-col gap-4">
                  {lsBarData.map((d) => {
                    const maxNet = Math.max(0.1, Math.abs(lsStats.ln), Math.abs(lsStats.sn));
                    const isProfit = d.net >= 0;
                    const widthPct = Math.max(4, (Math.abs(d.net) / maxNet) * 100);
                    const displayColor = isProfit ? d.color : '#f87171';
                    const glowColor = isProfit ? `rgba(52,211,153,0.3)` : `rgba(248,113,113,0.3)`;
                    return (
                      <div key={d.name} className="flex flex-col gap-1.5 group cursor-default">
                        <div className="flex justify-between items-end px-1">
                          <span className="text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 text-[#7A7A85] group-hover:text-[#FAFAFA] transition-colors">
                            {d.name === 'LONG' ? <ArrowUpRight size={13} className={isProfit ? "text-[#34d399]" : "text-[#f87171]"}/> : <ArrowDownRight size={13} className={isProfit ? "text-[#8b7bff]" : "text-[#f87171]"}/>}
                            {d.name}
                          </span>
                          <span className={`text-[13.5px] font-black transition-all duration-300 ${isProfit ? 'text-[var(--edge-text)] group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'text-[#f87171] group-hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.6)] group-hover:text-[#f87171]'}`}>{signed(d.net, 2)}R</span>
                        </div>
                        <div className="w-full h-[12px] bg-[var(--edge-bg)] rounded-full p-[2px] border border-[var(--edge-hair)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)]">
                          <motion.div className="h-full rounded-full relative overflow-hidden" style={{ background: displayColor }} initial={{ width: 0 }} animate={{ width: `${widthPct}%`, boxShadow: `0 0 12px ${glowColor}` }} transition={{ duration: 1, ease: premiumEasing }}>
                            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent opacity-40" />
                            <motion.div className="absolute top-0 bottom-0 left-0 w-[150%] bg-gradient-to-r from-transparent via-white/25 to-transparent" animate={{ x: ['-100%', '100%'] }} transition={{ repeat: Infinity, duration: 2.5, ease: "linear", repeatDelay: 1 }} />
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SpotlightCard>
          </div>

          <div className="overflow-x-auto custom-scrollbar pb-2">
            <table className="w-full border-collapse text-[13px] whitespace-nowrap min-w-[700px]">
              <thead>
                <tr>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-left p-[0_12px_12px]">Актив</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#34d399] font-black text-center p-[0_12px_12px]" colSpan={2}><div className="flex items-center justify-center gap-1.5"><ArrowUpRight size={13} /> LONG</div></th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-center p-[0_12px_12px] w-[120px]">Баланс PnL</th>
                  <th className="text-[10px] tracking-[0.14em] uppercase text-[#f87171] font-black text-center p-[0_12px_12px]" colSpan={2}><div className="flex items-center justify-center gap-1.5">SHORT <ArrowDownRight size={13} /></div></th>
                </tr>
                <tr>
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)]" />
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)] text-[9.5px] text-[#7A7A85] font-bold uppercase tracking-wider text-center">Угод (WR)</th>
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)] text-[9.5px] text-[#7A7A85] font-bold uppercase tracking-wider text-right">PnL</th>
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)]" />
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)] text-[9.5px] text-[#7A7A85] font-bold uppercase tracking-wider text-left pl-6">PnL</th>
                  <th className="p-[0_12px_12px] border-b border-[var(--edge-hair)] text-[9.5px] text-[#7A7A85] font-bold uppercase tracking-wider text-center">Угод (WR)</th>
                </tr>
              </thead>
              <tbody>
                {s.matrix.map((row) => {
                  const lNet = row.l ? row.l.net : 0;
                  const sNet = row.s ? row.s.net : 0;
                  const totalAbsNet = Math.abs(lNet) + Math.abs(sNet);
                  const lPct = totalAbsNet === 0 ? 50 : (Math.abs(lNet) / totalAbsNet) * 100;
                  const sPct = totalAbsNet === 0 ? 50 : (Math.abs(sNet) / totalAbsNet) * 100;
                  return (
                    <tr key={row.asset} className="hover:bg-[#232328]/80 transition-colors duration-300 group relative cursor-default border-b border-transparent hover:border-[var(--edge-hair)]">
                      <td className="text-left p-[14px_12px] font-bold text-[#FAFAFA] group-hover:text-[var(--edge-text)] transition-colors">{row.asset}</td>
                      <td className="text-center p-[14px_12px]">
                        {row.l ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[#B4B4BD] group-hover:text-[var(--edge-text)] transition-colors">{row.l.trades}</span>
                            <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-bold transition-all ${row.l.wr >= 50 ? 'bg-[#34d399]/10 text-[#34d399] group-hover:bg-[#34d399]/20' : 'bg-[var(--edge-hair)] text-[#7A7A85] group-hover:bg-white/10 group-hover:text-[#B4B4BD]'}`}>{row.l.wr}%</span>
                          </div>
                        ) : <span className="text-[#4A4A52]">—</span>}
                      </td>
                      <td className="text-right p-[14px_12px]">
                        {row.l ? <b className={`transition-all ${lNet >= 0 ? 'text-[#34d399] group-hover:drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'text-[#f87171] group-hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'}`}>{signed(lNet, 2)}R</b> : <span className="text-[#4A4A52]">—</span>}
                      </td>
                      <td className="text-center p-[14px_12px] w-[140px] align-middle">
                        <div className="w-full h-[6px] flex bg-[var(--edge-bg)] rounded-full overflow-hidden opacity-70 group-hover:opacity-100 transition-all duration-300 shadow-inner border border-[var(--edge-hair)]">
                          {row.l && <div className="transition-all duration-500 group-hover:brightness-125 group-hover:shadow-[0_0_8px_currentColor]" style={{ width: `${lPct}%`, background: lNet >= 0 ? '#34d399' : '#f87171' }} />}
                          {row.s && <div className="transition-all duration-500 group-hover:brightness-125 group-hover:shadow-[0_0_8px_currentColor]" style={{ width: `${sPct}%`, background: sNet >= 0 ? 'var(--edge-acc, #8b7bff)' : '#f87171' }} />}
                        </div>
                      </td>
                      <td className="text-left p-[14px_12px] pl-6">
                        {row.s ? <b className={`transition-all ${sNet >= 0 ? 'text-[#8b7bff] group-hover:drop-shadow-[0_0_8px_rgba(139,123,255,0.5)]' : 'text-[#f87171] group-hover:drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'}`}>{signed(sNet, 2)}R</b> : <span className="text-[#4A4A52]">—</span>}
                      </td>
                      <td className="text-center p-[14px_12px]">
                        {row.s ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-[10.5px] px-2 py-0.5 rounded-md font-bold transition-all ${row.s.wr >= 50 ? 'bg-[#8b7bff]/10 text-[#8b7bff] group-hover:bg-[#8b7bff]/20' : 'bg-[var(--edge-hair)] text-[#7A7A85] group-hover:bg-white/10 group-hover:text-[#B4B4BD]'}`}>{row.s.wr}%</span>
                            <span className="text-[#B4B4BD] group-hover:text-[var(--edge-text)] transition-colors">{row.s.trades}</span>
                          </div>
                        ) : <span className="text-[#4A4A52]">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 p-3 bg-[var(--edge-surface-hi)]/50 border border-[var(--edge-hair)] rounded-[12px] flex items-start gap-3">
            <Activity size={16} className="text-[#8b7bff] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#B4B4BD] leading-[1.5] m-0">Асиметрія напрямків важливіша за загальний вінрейт. Якщо один бік (наприклад, Short) стабільно мінусує, поки Long в плюсі — це проблема не ринку, а твого фільтра входу в конкретних фазах.</p>
          </div>
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10">
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel 
            title={<><Layers size={13} /> Ефективність сетапів</>} 
            className="h-full"
            right={
              <button onClick={() => setIsAllSetupsOpen(true)} className="flex items-center gap-1.5 text-[10px] tracking-[0.14em] uppercase font-bold text-[#7A7A85] hover:text-[var(--edge-text)] transition-colors group">
                Всі сетапи
                <div className="p-1 bg-[var(--edge-hair)] rounded-md group-hover:bg-white/10 transition-colors"><Maximize2 size={12} /></div>
              </button>
            }
          >
            <div className="flex flex-col gap-2 mt-2">
              {s.bySetup.map((x, i) => {
                const isProfit = x.net >= 0;
                const color = isProfit ? 'var(--edge-acc, #8b7bff)' : '#f87171';
                const share = (Math.abs(x.net) / maxSetupNet) * 100;
                return (
                  <SpotlightCard key={x.key} glowColor={`${color}20`} className="rounded-[12px]">
                    <button 
                      onClick={() => setActiveSetupModal(x)}
                      className="w-full text-left p-[14px_16px] bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] flex flex-col gap-3 transition-all hover:border-white/15 hover:bg-[var(--edge-surface-hi)] group hover:scale-[1.01]"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-[#7A7A85] w-[14px]">{i + 1}</span>
                          <b className="text-[#FAFAFA] text-[13.5px] group-hover:text-[var(--edge-text)] transition-colors">{x.key}</b>
                        </div>
                        <b className={`text-[14.5px] font-black ${isProfit ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(x.net, 2)}R</b>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-[#232328] h-[4px] rounded-full overflow-hidden">
                          <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${share}%` }} transition={{ duration: 0.9, ease: premiumEasing }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-[#7A7A85]">
                        <span>{x.trades} угод</span>
                        <span className="flex items-center gap-1.5">WR <b className="text-[#FAFAFA] group-hover:text-[var(--edge-text)]">{x.wr}%</b></span>
                        <span>Сер. <b style={{ color: x.avg >= 0 ? '#34d399' : '#f87171' }}>{signed(x.avg, 2)}R</b></span>
                      </div>
                    </button>
                  </SpotlightCard>
                );
              })}
            </div>
          </Panel>
        </motion.div>

    <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><Clock size={13} /> Актив × Сесія</>} right="Теплова матриця" className="h-full">
            <div className="overflow-x-auto custom-scrollbar mt-2 pb-2">
              <table className="w-full border-separate border-spacing-y-2 border-spacing-x-2 text-[13px] whitespace-nowrap min-w-[500px]">
                <thead>
                  <tr>
                    <th className="text-[9.5px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-left p-[0_4px_8px] w-[80px]">Актив</th>
                    {['Asia', 'London', 'New York'].map((x) => <th key={x} className="text-[9.5px] tracking-[0.14em] uppercase text-[#7A7A85] font-black text-center p-[0_4px_8px]">{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ASSETS.map((a) => (
                    /* ЗМІНА: Використовуємо group/row замість group, щоб не вмикати всі 3 картки одразу */
                    <tr key={a} className="group/row cursor-default">
                      <td className="text-left p-[0_12px_0_4px] font-bold text-[#FAFAFA] text-[12.5px] group-hover/row:text-[var(--edge-text)] transition-colors align-middle">
                        <span className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover/row:bg-white/30 transition-colors" />
                          {a}
                        </span>
                      </td>
                      {['Asia', 'London', 'New York'].map((ses) => {
                        const list = s.trades.filter((t) => t.asset === a && t.session === ses);
                        const v = +sum(list.map((t) => t.rr)).toFixed(1);
                        const wr = list.length ? Math.round((list.filter(t => t.rr > 0).length / list.length) * 100) : 0;
                        
                        if (list.length > 0) {
                          const isProfit = v >= 0;
                          const color = isProfit ? '#34d399' : '#f87171';
                          const bg = isProfit ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)';

                          return (
                            <td key={ses} className="p-0 h-[64px] align-middle w-1/3">
                              {/* SpotlightCard створює ефект м'якого світла за курсором */}
                              <SpotlightCard glowColor={isProfit ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"} className="h-full rounded-[12px]">
                                <div
                                  className="w-full h-full relative group/cell overflow-hidden rounded-[12px] border flex flex-col items-center justify-center gap-0.5 transition-colors duration-300"
                                  style={{ backgroundColor: bg, borderColor: `${color}30` }}
                                >
                                  {/* Текст з крутим ефектом світіння (drop-shadow) при наведенні */}
                                  <b 
                                    className={`relative z-10 text-[16px] font-black tracking-tight transition-all duration-300 ${isProfit ? 'group-hover/cell:drop-shadow-[0_0_12px_rgba(52,211,153,1)]' : 'group-hover/cell:drop-shadow-[0_0_12px_rgba(248,113,113,1)]'}`} 
                                    style={{ color }}
                                  >
                                    {signed(v, 1)}R
                                  </b>
                                  <div className="relative z-10 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-[#B4B4BD] group-hover/cell:text-[var(--edge-text)] transition-colors duration-300">
                                    <span>{list.length} уг.</span>
                                    <span className="w-1 h-1 rounded-full bg-white/20 group-hover/cell:bg-white/50 transition-colors" />
                                    <span>{wr}% WR</span>
                                  </div>
                                </div>
                              </SpotlightCard>
                            </td>
                          );
                        } else {
                          return (
                            <td key={ses} className="p-0 h-[64px] align-middle w-1/3">
                              <div 
                                className="w-full h-full rounded-[12px] border border-dashed border-[var(--edge-hair)] flex flex-col items-center justify-center relative overflow-hidden group/empty transition-colors hover:border-[var(--edge-hair-strong)] hover:bg-[var(--edge-hair)]"
                                style={{
                                  background: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.015) 4px, rgba(255,255,255,0.015) 8px)'
                                }}
                              >
                                <span className="text-[9.5px] text-[#4A4A52] font-black tracking-[0.15em] uppercase group-hover/empty:text-[#7A7A85] transition-colors relative z-10">0 угод</span>
                              </div>
                            </td>
                          );
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex items-center justify-center gap-6 text-[10.5px] text-[#7A7A85] font-medium tracking-wide">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-[4px] bg-[#f87171]/20 border border-[#f87171]/50" />Збиток</div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-[4px] border border-dashed border-white/20" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)' }} />
                Сліпа зона
              </div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-[4px] bg-[#34d399]/20 border border-[#34d399]/50" />Прибуток</div>
            </div>
          </Panel>
        </motion.div>
      </div>
    </motion.div>
  );
}