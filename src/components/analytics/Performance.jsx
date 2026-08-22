import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, Cell, ReferenceLine, ScatterChart, Scatter, ComposedChart, Line, Tooltip as RTooltip } from 'recharts';
import { Target, Clock, TrendingUp, Activity, ShieldCheck } from 'lucide-react';
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion';
import { Panel, Delta, ChartTip, axis } from './ui';
import { EMOTION_COLOR, EMOTION_LABEL, EMOTIONS, signed, r1, r2, sum } from './data';

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

// ==========================================
// КАРТКА SPOTLIGHT (СВІТЛО ЗА КУРСОРОМ)
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
      className={`relative group w-full ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 rounded-[inherit]"
        style={{
          background: useMotionTemplate`radial-gradient(350px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 80%)`,
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

// ==========================================
// ІНТЕРАКТИВНА МІНІ-КАРТКА З ГРАФІКОМ
// ==========================================
function InteractiveMiniCard({ title, value, subtext, subStats = [], Icon, color, data, dataKey, gradientId }) {
  return (
    <SpotlightCard glowColor={`${color}25`} className="bg-[var(--edge-surface-hi)]/80 backdrop-blur-xl border border-[#232328] rounded-[18px] flex flex-col relative overflow-hidden shadow-lg h-[160px]">
      
      {/* Текст та Іконка (pointer-events-none щоб пропускати hover на графік під ними) */}
      <div className="p-[18px] flex justify-between items-start z-20 relative pointer-events-none h-full">
        <div className="flex flex-col justify-between h-full">
          <div>
            <p className="text-[10px] text-[#7A7A85] font-bold uppercase tracking-widest mb-1">{title}</p>
            <h2 className="text-[26px] font-black tracking-[-0.03em] leading-none mt-1" style={{ color }}>{value}</h2>
            {subtext && <span className="text-[10.5px] font-semibold text-[#7A7A85] mt-1 block">{subtext}</span>}
          </div>
          
          {subStats.length > 0 && (
            <div className="mt-2 flex flex-col gap-[3px]">
              {subStats.map((stat, i) => (
                <span key={i} className="text-[11px] font-medium text-[#7A7A85]">
                  {stat.label}: <span className="text-[var(--edge-text)] font-bold">{stat.val}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="p-2.5 rounded-xl border bg-[var(--edge-surface)]/50" style={{ borderColor: `${color}33` }}>
          <Icon color={color} size={20} />
        </div>
      </div>

      {/* Живий графік */}
      <div className="absolute bottom-0 left-0 w-full h-[70px] opacity-80 z-10">
        {data && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={color} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <RTooltip 
                contentStyle={{ backgroundColor: 'var(--edge-sunken, #0D0D10)', borderColor: 'var(--edge-line, #232328)', fontSize: '11px', borderRadius: '8px', padding: '4px 8px' }}
                itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                labelStyle={{ display: 'none' }}
                cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} isAnimationActive={true} animationDuration={1500} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </SpotlightCard>
  );
}

// ==========================================
// ГОЛОВНИЙ КОМПОНЕНТ PERFORMANCE
// ==========================================
export default function Performance({ s }) {
  const bestDay = [...s.byDow].sort((a, b) => b.avg - a.avg)[0];
  const bestSes = [...s.bySession].sort((a, b) => b.net - a.net)[0];
  /* Середнє рахуємо тільки по угодах, де час справді вказано.
     Ділити на всі означало б занижувати тим сильніше, чим більше
     угод людина записала без часу, — і показувати «12 хв» там, де
     насправді даних немає. */
  const timed = s.trades.filter((t) => typeof t.holdMin === 'number');
  const avgHold = timed.length ? Math.round(sum(timed.map((t) => t.holdMin)) / timed.length) : null;

  // Глобальний рух миші для фонового світла
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
      className="flex flex-col gap-4 relative"
      onMouseMove={handleGlobalMouseMove}
    >
      {/* Глобальне слабке світло за курсором */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-0 opacity-40"
        style={{
          background: useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(167, 139, 250, 0.03), transparent 80%)`,
        }}
      />

      {/* ТОП 4 КАРТКИ ЗІ ВСІМА 9 МЕТРИКАМИ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2 relative z-10">
        
        {/* 1. Очікування та Утримання */}
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Очікування"
            value={`${signed(s.expectancy, 2)}R`}
            subtext="на кожну угоду"
            subStats={[
              { label: 'Сер. утримання', val: avgHold === null ? '—' : `${avgHold} хв` }
            ]}
            Icon={Target}
            color="#a78bfa"
            data={s.equity}
            dataKey="value"
            gradientId="spark-exp"
          />
        </motion.div>

        {/* 2. Середні показники (+ та -) */}
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Середній плюс"
            value={`${signed(s.avgWin, 2)}R`}
            subStats={[
              { label: 'Середній мінус', val: `${r2(s.avgLoss)}R` }
            ]}
            Icon={TrendingUp}
            color="#34d399"
            data={s.trades.slice(-20)} // Останні 20 угод для графіку
            dataKey="rr"
            gradientId="spark-win"
          />
        </motion.div>

        {/* 3. Просадка та Відновлення */}
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Макс. просадка"
            value={`${r1(s.maxDD)}R`}
            subStats={[
              { label: 'Фактор відновл.', val: `${r1(s.recovery)}×` }
            ]}
            Icon={Activity}
            color="#f87171"
            data={s.equity}
            dataKey="dd"
            gradientId="spark-dd"
          />
        </motion.div>

        {/* 4. Серії та Помилки */}
        <motion.div variants={fadeUpVariant}>
          <InteractiveMiniCard 
            title="Серія плюсів"
            value={`${s.bestW}`}
            subStats={[
              { label: 'Серія мінусів', val: s.worstL },
              { label: 'Помилки', val: `${s.mistakeRate}%` }
            ]}
            Icon={ShieldCheck}
            color="var(--edge-acc, #8b7bff)"
            data={s.byMonth}
            dataKey="wr"
            gradientId="spark-disc"
          />
        </motion.div>
      </div>

      {/* НИЖНІ ГРАФІКИ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10">
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title="Середній R по днях тижня" right={<>Найкращий: <b className="text-[#34d399]">{bestDay.day}</b></>} className="h-full">
            <div className="w-full h-[260px]">
              <ResponsiveContainer>
                <BarChart data={s.byDow} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis dataKey="day" {...axis} />
                  <YAxis {...axis} />
                  <RTooltip content={<ChartTip />} cursor={{ fill: 'var(--edge-sunken, #0D0D10)' }} />
                  <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />
                  <Bar dataKey="avg" name="Сер. R" radius={[3, 3, 3, 3]} barSize={34}>
                    {s.byDow.map((e, i) => (
                      <Cell key={i} fill={e.avg > 0 ? 'var(--edge-acc, #8b7bff)' : e.avg < 0 ? '#f87171' : 'var(--edge-line-hi, #33333A)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title="Чистий R по сесіях" right={<>Ядро: <b className="text-[#34d399]">{bestSes.session}</b></>} className="h-full">
            <div className="w-full h-[260px]">
              <ResponsiveContainer>
                <BarChart data={s.bySession} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis dataKey="session" {...axis} />
                  <YAxis {...axis} />
                  <RTooltip content={<ChartTip />} cursor={{ fill: 'var(--edge-sunken, #0D0D10)' }} />
                  <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />
                  <Bar dataKey="net" name="Чистий R" radius={[3, 3, 0, 0]} barSize={54}>
                    {s.bySession.map((e, i) => (
                      <Cell key={i} fill={e.net > 0 ? '#34d399' : '#f87171'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10">
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title="Розподіл R-множників" className="h-full">
            <div className="w-full h-[240px]">
              <ResponsiveContainer>
                <BarChart data={s.buckets} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} />
                  <RTooltip content={<ChartTip unit=" угод" />} cursor={{ fill: 'var(--edge-sunken, #0D0D10)' }} />
                  <Bar dataKey="value" name="Угод" radius={[3, 3, 0, 0]} barSize={34}>
                    {s.buckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[12.5px] text-[#7A7A85] leading-[1.6] mt-3">
              Хвіст справа — це те, за що ти платиш усіма мінусами. Угод понад 2R: <b className="text-[#34d399]">{s.trades.filter((t) => t.rr > 2).length}</b>.
            </p>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title="Просадка (underwater)" className="h-full">
            <div className="w-full h-[240px]">
              <ResponsiveContainer>
                <AreaChart data={s.equity} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" stopOpacity={0} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis dataKey="date" {...axis} minTickGap={44} />
                  <YAxis {...axis} />
                  <RTooltip content={<ChartTip />} cursor={{ stroke: 'var(--edge-line-hi, #33333A)' }} />
                  <Area type="monotone" dataKey="dd" name="Просадка" stroke="#f87171" strokeWidth={1.5} fill="url(#dd)" isAnimationActive={true} animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 relative z-10">
        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title={<><Clock size={13} /> Чистий R по годинах входу</>} className="h-full">
            <div className="w-full h-[220px]">
              {/* Порожній графік нічому не вчить, а виглядає як
                  поломка. Кажемо прямо, чого бракує і де це взяти. */}
              {s.byHour.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <Clock size={20} strokeWidth={1.7} style={{ color: 'var(--edge-text4, #4A4A52)' }} />
                  <div className="text-[13.5px] font-semibold" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
                    Часу входу ще немає
                  </div>
                  <div className="max-w-[280px] text-[12.5px]" style={{ color: 'var(--edge-text4, #4A4A52)', lineHeight: 1.6 }}>
                    Вкажи час у формі угоди — і тут зʼявиться, о котрій годині ти заробляєш, а о котрій віддаєш.
                  </div>
                </div>
              ) : (
              <ResponsiveContainer>
                <BarChart data={s.byHour} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis dataKey="hour" {...axis} interval={1} />
                  <YAxis {...axis} />
                  <RTooltip content={<ChartTip />} cursor={{ fill: 'var(--edge-sunken, #0D0D10)' }} />
                  <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />
                  <Bar dataKey="net" name="Чистий R" radius={[2, 2, 0, 0]} barSize={16}>
                    {s.byHour.map((e, i) => <Cell key={i} fill={e.net >= 0 ? 'var(--edge-acc, #8b7bff)' : '#f87171'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </Panel>
        </motion.div>

        <motion.div variants={fadeUpVariant} className="h-full">
          <Panel title="Час утримання vs результат" right="кожна точка — угода" className="h-full">
            <div className="w-full h-[220px]">
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--edge-surface-hi, #18181C)" />
                  <XAxis type="number" dataKey="holdMin" name="Хвилин" unit="хв" {...axis} />
                  <YAxis type="number" dataKey="rr" name="R" {...axis} />
                  <RTooltip content={<ChartTip />} cursor={{ stroke: 'var(--edge-line-hi, #33333A)' }} />
                  <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />
                  <Scatter data={s.trades} name="Угода">
                    {s.trades.map((t, i) => (
                      <Cell key={i} fill={EMOTION_COLOR[t.emotion]} fillOpacity={0.8} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-[#7A7A85]">
              {EMOTIONS.map((e) => (
                <span key={e} className="inline-flex items-center gap-1.5"><i className="w-2 h-2 rounded-[3px] inline-block" style={{ background: EMOTION_COLOR[e] }} />{EMOTION_LABEL[e]}</span>
              ))}
            </div>
          </Panel>
        </motion.div>
      </div>

      <motion.div variants={fadeUpVariant} className="relative z-10">
        <Panel title="По місяцях">
          <div className="w-full h-[240px]">
            <ResponsiveContainer>
              <ComposedChart data={s.byMonth.map((m) => ({ m: m.key, net: m.net, wr: m.wr, trades: m.trades }))} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="m" {...axis} />
                <YAxis {...axis} />
                <RTooltip content={<ChartTip />} cursor={{ fill: 'var(--edge-sunken, #0D0D10)' }} />
                <Bar dataKey="net" name="Чистий R" barSize={40} radius={[3, 3, 0, 0]}>
                  {s.byMonth.map((m, i) => <Cell key={i} fill={m.net >= 0 ? '#34d399' : '#f87171'} />)}
                </Bar>
                <Line type="monotone" dataKey="wr" name="Вінрейт %" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={true} animationDuration={1500} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </motion.div>
    </motion.div>
  );
}