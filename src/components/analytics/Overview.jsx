import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip as RTooltip } from 'recharts';
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion';
import { Activity, Layers, Target, TrendingUp, Flame, ShieldCheck, AlertOctagon, BrainCircuit, XCircle, CheckCircle2 } from 'lucide-react';
import { Panel, Delta, ChartTip, axis } from './ui';
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
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  visible: { 
    opacity: 1, y: 0, filter: "blur(0px)", 
    transition: { duration: 0.7, ease: premiumEasing } 
  }
};

// ==========================================
// КАРТКИ ЗІ СВІТЛОМ (SPOTLIGHT)
// ==========================================
function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.05)" }) {
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
          background: useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`,
        }}
      />
      {/* Скляний відблиск */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-50 z-0" />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

// ==========================================
// ІНТЕРАКТИВНА МІНІ-КАРТКА З ГРАФІКОМ (З Performance.js)
// ==========================================
function InteractiveMiniCard({ title, value, subtext, subStats = [], Icon, color, data, dataKey, gradientId }) {
  return (
    <SpotlightCard glowColor={`${color}25`} className="bg-gradient-to-b from-[#18181C]/90 to-[#0D0D10]/90 backdrop-blur-xl border border-[#232328] rounded-[18px] flex flex-col relative overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.4)] h-[140px]">
      <div className="p-[18px] flex justify-between items-start z-20 relative pointer-events-none h-full">
        <div className="flex flex-col justify-between h-full">
          <div>
            <p className="text-[10px] text-[#7A7A85] font-bold uppercase tracking-widest mb-1 drop-shadow-sm">{title}</p>
            <h2 className="text-[28px] font-black tracking-[-0.03em] leading-none mt-1" style={{ color, textShadow: `0 0 15px ${color}40` }}>{value}</h2>
            {subtext && <span className="text-[10.5px] font-semibold text-[#7A7A85] mt-1 block">{subtext}</span>}
          </div>
          
          {subStats.length > 0 && (
            <div className="mt-2 flex flex-col gap-[2px]">
              {subStats.map((stat, i) => (
                <span key={i} className="text-[11px] font-medium text-[#7A7A85]">
                  {stat.label}: <span className="text-[#FAFAFA] font-bold">{stat.val}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="p-2.5 rounded-xl border bg-[var(--edge-surface)]/50 shadow-inner" style={{ borderColor: `${color}33` }}>
          <Icon color={color} size={18} />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[65px] opacity-70 z-10">
        {data && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={true} animationDuration={1500} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </SpotlightCard>
  );
}

// ==========================================
// КАСТОМНИЙ ТУЛТИП ДЛЯ ГРАФІКА ПЛАНУ
// ==========================================
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
// ГОЛОВНИЙ КОМПОНЕНТ OVERVIEW
// ==========================================
export default function Overview({ s }) {
  // Базові розрахунки
  const bestSes = [...s.bySession].sort((a, b) => b.net - a.net)[0];
  const bestAsset = s.byAsset[0] || { key: '—', net: 0 };
  const worstAsset = s.byAsset[s.byAsset.length - 1] || { key: '—', net: 0 };
  const bestSetup = s.bySetup[0] || { key: '—', net: 0 };

  const sources = [
    { label: `Сесія ${bestSes.session}`, v: bestSes.net },
    { label: `${bestAsset.key} (обидві сторони)`, v: bestAsset.net },
    { label: `Сетап «${bestSetup.key}»`, v: bestSetup.net },
    { label: `Середа (Топ день)`, v: s.byDow[2].net },
    { label: `План дотримано`, v: +sum(s.followed.map((t) => t.rr)).toFixed(1) },
    { label: `${worstAsset.key}`, v: worstAsset.net },
  ].sort((a, b) => b.v - a.v);

  // Графік "План vs Порушення" з Psychology.js
  const maxPlanLen = Math.max(s.followed.length, s.broken.length);
  let fAcc = 0; let bAcc = 0;
  const planChartData = useMemo(() => Array.from({ length: maxPlanLen }).map((_, i) => {
    if (i < s.followed.length) fAcc += s.followed[i].rr;
    if (i < s.broken.length) bAcc += s.broken[i].rr;
    return { step: i + 1, fAcc, bAcc };
  }), [s.followed, s.broken, maxPlanLen]);

  const maxEmotionTrades = Math.max(...s.emotionStats.map(e => e.trades));

  // Глобальна мишка
  const globalMouseX = useMotionValue(0);
  const globalMouseY = useMotionValue(0);
  function handleGlobalMouseMove({ clientX, clientY }) {
    globalMouseX.set(clientX);
    globalMouseY.set(clientY);
  }

  return (
    <motion.div 
      variants={staggerContainer} 
      initial="hidden" 
      animate="visible" 
      className="flex flex-col gap-5 relative"
      onMouseMove={handleGlobalMouseMove}
    >
      <motion.div
        className="pointer-events-none fixed inset-0 z-0 opacity-30"
        style={{ background: useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(139,123,255, 0.05), transparent 80%)` }}
      />

      {/* ТОП 4 КАРТКИ З ГРАФІКАМИ (З Performance.js) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Чистий R"
            value={`${signed(s.net)}R`}
            subtext={`${s.trades.length} угод · ${s.byMonth.length} міс.`}
            Icon={TrendingUp}
            color="#34d399"
            data={s.equity}
            dataKey="value"
            gradientId="overview-net"
          />
        </motion.div>
        
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Вінрейт"
            value={`${s.wr}%`}
            subStats={[{ label: 'Угод', val: `${s.wins.length}W · ${s.losses.length}L` }]}
            Icon={Target}
            color="var(--edge-acc, #8b7bff)"
            data={s.byMonth}
            dataKey="wr"
            gradientId="overview-wr"
          />
        </motion.div>

        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Профіт-фактор"
            value={r2(s.pf)}
            subStats={[{ label: 'Баланс', val: `+${r1(s.gross)} / -${r1(s.grossLoss)}` }]}
            Icon={Activity}
            color="#a78bfa"
            data={s.byMonth}
            dataKey="net"
            gradientId="overview-pf"
          />
        </motion.div>

        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Ціна тільта"
            value={`${r1(s.tiltCost)}R`}
            subStats={[{ label: 'Від прибутку', val: `${Math.round((Math.abs(s.tiltCost) / Math.max(1, s.gross)) * 100)}%` }]}
            Icon={Flame}
            color="#f87171"
            data={s.equity} 
            dataKey="dd"
            gradientId="overview-tilt"
          />
        </motion.div>
      </div>

      {/* ГОЛОВНИЙ ГРАФІК ТА ДЖЕРЕЛА */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.5fr)_minmax(340px,1fr)] gap-5 items-start relative z-10">
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel
            title={<><TrendingUp size={14} className="text-[#8b7bff]" /> Крива еквіті (R)</>}
            right={<span className="text-[11.5px] text-[#7A7A85]">Макс. просадка <b className="text-[#f87171]">{r1(s.maxDD)}R</b></span>}
            className="h-full"
          >
            <div className="w-full h-[320px] mt-2">
              <ResponsiveContainer>
                <AreaChart data={s.equity} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eq-main" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--edge-acc, #8b7bff)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--edge-acc, #8b7bff)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-line, #232328)" opacity={0.6} />
                  <XAxis dataKey="date" {...axis} minTickGap={40} axisLine={false} tickLine={false} />
                  <YAxis {...axis} axisLine={false} tickLine={false} />
                  <RTooltip content={<ChartTip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                  <Area type="monotone" dataKey="value" name="Еквіті" stroke="var(--edge-acc, #8b7bff)" strokeWidth={3} fill="url(#eq-main)" isAnimationActive={true} animationDuration={1500} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><Layers size={14} className="text-[#a78bfa]" /> Звідки береться R</>} className="h-full">
            <div className="flex flex-col gap-1.5 mt-2">
              {sources.map((x, i) => (
                <motion.div 
                  key={x.label} 
                  whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.02)' }}
                  className="flex justify-between items-center p-[10px_12px] rounded-[10px] text-[13px] transition-colors border border-transparent hover:border-[var(--edge-hair)]"
                >
                  <span className="text-[#B4B4BD] font-medium flex items-center gap-2">
                    <span className="text-[#4A4A52] text-[10px] w-4">{i + 1}.</span>
                    {x.label}
                  </span>
                  <strong className="font-bold text-[13.5px]"><Delta v={x.v} /></strong>
                </motion.div>
              ))}
            </div>
          </Panel>
        </motion.div>
      </div>

      {/* НИЖНІЙ РЯД: ПЛАН, ПСИХОЛОГІЯ, ПОМИЛКИ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 relative z-10">
        
        {/* БЛОК "ПЛАН ДОТРИМАНО VS ПОРУШЕНО" (З Psychology.js) */}
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><ShieldCheck size={14} className="text-[#34d399]" /> План дотримано vs порушено</>} className="h-full">
            <div className="flex gap-2 mt-2">
              <div className="flex-1 p-3 bg-[var(--edge-surface-hi)]/80 border border-[#34d399]/15 rounded-[12px] transition-colors hover:border-[#34d399]/30">
                <span className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black"><CheckCircle2 size={12} className="text-[#34d399]" /> По плану</span>
                <b className="block text-[20px] font-extrabold mt-1.5 text-[#34d399]">{signed(sum(s.followed.map((t) => t.rr)))}R</b>
                <span className="text-[11px] text-[#7A7A85] block mt-0.5">{s.followed.length} угод</span>
              </div>
              <div className="flex-1 p-3 bg-[var(--edge-surface-hi)]/80 border border-[#f87171]/15 rounded-[12px] transition-colors hover:border-[#f87171]/30">
                <span className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black"><XCircle size={12} className="text-[#f87171]" /> Без плану</span>
                <b className="block text-[20px] font-extrabold mt-1.5 text-[#f87171]">{signed(sum(s.broken.map((t) => t.rr)))}R</b>
                <span className="text-[11px] text-[#7A7A85] block mt-0.5">{s.broken.length} угод</span>
              </div>
            </div>

            <div className="mt-4 w-full bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] p-4">
              <h4 className="text-[10.5px] text-[#7A7A85] font-bold uppercase tracking-widest mb-2 text-center">Накопичений PnL</h4>
              <div className="w-full h-[130px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={planChartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
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
                    <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={1} />
                    <Area type="monotone" dataKey="fAcc" name="По плану" stroke="#34d399" strokeWidth={2} fill="url(#gradF)" isAnimationActive={true} />
                    <Area type="monotone" dataKey="bAcc" name="Порушення" stroke="#f87171" strokeWidth={2} fill="url(#gradB)" isAnimationActive={true} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>
        </motion.div>

        {/* ПСИХОЛОГІЯ (ВІДЖЕТ) */}
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><BrainCircuit size={14} className="text-[#a78bfa]" /> Емоційний стан vs Результат</>} className="h-full">
            <div className="flex flex-col gap-3 mt-3">
              {s.emotionStats.map((e) => {
                const isProfit = e.avg >= 0;
                const fillWidth = `${Math.max(5, (e.trades / maxEmotionTrades) * 100)}%`;
                const baseColor = EMOTION_COLOR[e.emotion] || 'var(--edge-acc, #8b7bff)';

                return (
                  <div key={e.emotion} className="relative w-full bg-[var(--edge-surface-hi)]/50 border border-[var(--edge-hair)] rounded-[8px] p-[10px_14px] overflow-hidden group">
                    <div 
                      className="absolute left-0 top-0 bottom-0 opacity-15 transition-all duration-500 group-hover:opacity-25"
                      style={{ width: fillWidth, backgroundColor: baseColor }}
                    />
                    <div className="relative z-10 flex justify-between items-center">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: baseColor, boxShadow: `0 0 8px ${baseColor}` }} />
                          <b className="text-[13px] text-[#FAFAFA]">{EMOTION_LABEL[e.emotion]}</b>
                        </div>
                        <span className="text-[11px] text-[#7A7A85] ml-4">{e.trades} угод</span>
                      </div>
                      
                      <div className="flex flex-col items-end gap-0.5">
                        <b className={`text-[13.5px] ${isProfit ? 'text-[#34d399]' : 'text-[#f87171]'}`}>
                          {signed(e.avg, 2)}R <span className="text-[10px] text-[#7A7A85] font-normal">/ уг.</span>
                        </b>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="mt-4 p-3 bg-gradient-to-r from-[#18181C] to-[#18181C]/40 border border-[var(--edge-hair)] rounded-[10px] flex items-start gap-3">
              <Activity size={16} className="text-[#B4B4BD] mt-0.5 shrink-0" />
              <p className="text-[11.5px] text-[#7A7A85] leading-[1.6] m-0">
                Емоція — це множник. Різниця між найкращим і найгіршим станом: <b className="text-[#FAFAFA]">{r2(Math.max(...s.emotionStats.map((e) => e.avg)) - Math.min(...s.emotionStats.map((e) => e.avg)))}R</b> на кожну відкриту угоду.
              </p>
            </div>
          </Panel>
        </motion.div>

        {/* НАЙДОРОЖЧІ ПОМИЛКИ */}
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><AlertOctagon size={14} className="text-[#f87171]" /> Найдорожчі звички</>} className="h-full">
            <div className="flex flex-col gap-2 mt-3">
              {s.mistakeLedger.length > 0 ? s.mistakeLedger.slice(0, 5).map((m) => (
                <motion.div 
                  key={m.name} 
                  whileHover={{ x: 4, backgroundColor: 'rgba(248,113,113, 0.05)', borderColor: 'rgba(248,113,113, 0.2)' }}
                  className="flex items-center justify-between gap-4 p-[12px_14px] bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[10px] transition-colors cursor-default"
                >
                  <div className="flex flex-col min-w-0">
                    <b className="text-[13px] text-[#FAFAFA] overflow-hidden text-ellipsis whitespace-nowrap leading-tight">{m.name}</b>
                    <span className="text-[11px] text-[#7A7A85] mt-0.5">Повторено {m.count} разів</span>
                  </div>
                  <div className="px-2.5 py-1 bg-[#f87171]/10 rounded-md border border-[#f87171]/20 shrink-0">
                    <b className="text-[13px] text-[#f87171]">{signed(m.cost, 1)}R</b>
                  </div>
                </motion.div>
              )) : (
                <div className="text-center py-8 text-[#7A7A85] text-[13px]">Немає даних про помилки. Так тримати!</div>
              )}
            </div>
          </Panel>
        </motion.div>

      </div>
    </motion.div>
  );
}