import { motion } from 'framer-motion';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
import { Hash, Target, TrendingUp, TrendingDown, ShieldCheck, Flame, Snowflake } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { Spotlight } from '../ui/Hovers';

/* ==================================================================
   Картки статистики.
   Правило: колір несе інформацію, а не прикрашає. Нейтральні за
   замовчуванням; зелений/червоний/жовтий зʼявляються лише тоді,
   коли цифра щось означає.
   Ховер по спарклайну показує ту саму інфу, що й крива капіталу.
================================================================== */

/* Тултип спарклайна — компактний, але з усім контекстом точки */
function SparkTip({ active, payload, primary }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  const rows = [
    { label: 'Trade',      value: `#${d.trades}` },
    { label: 'Accumulated', value: `${d.cumulativeRR > 0 ? '+' : ''}${d.cumulativeRR}R`, color: d.cumulativeRR >= 0 ? T.ok : T.bad },
    { label: 'Win rate',   value: `${d.winRate}%` },
    { label: 'Plan rate',  value: `${d.planRate}%` },
  ];

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: 'rgba(19,19,22,0.97)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${T.lineHi}`,
        boxShadow: '0 18px 44px rgba(0,0,0,0.8)',
        minWidth: 168,
      }}
    >
      <div
        className="px-3 py-2"
        style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
      >
        <span className="text-[13px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
          {d.name}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3 py-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-5">
            <span className="text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {r.label}
            </span>
            <span
              className="text-[13px] font-bold tabular-nums"
              style={{ fontFamily: T.mono, color: r.color || (r.label === primary ? T.text : T.text2) }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Spark({ data, dataKey, color, primary }) {
  if (!data?.length) return null;
  const id = `spark-${dataKey}`;
  return (
    <div className="absolute inset-x-0 bottom-0 h-[58px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          <Tooltip
            content={<SparkTip primary={primary} />}
            cursor={{ stroke: T.lineHi, strokeWidth: 1, strokeDasharray: '3 3' }}
            wrapperStyle={{ zIndex: 60 }}
            offset={14}
          />

          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.6}
            fill={`url(#${id})`}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: T.surface, strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Card({ label, icon: Icon, accent, children, spark, note }) {
  const glow = accent ? `${accent}55` : `rgba(${T.accRgb},0.28)`;

  return (
    <motion.div
      className="h-full"
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
      }}
    >
      <Spotlight
        color={glow}
        radius={300}
        className="flex h-full min-h-[152px] flex-col rounded-2xl"
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset',
        }}
      >
        {/* спарклайн під контентом, але клікабельний для тултипа */}
        <div className="absolute inset-0 z-0">{spark}</div>

        <div className="pointer-events-none relative z-10 flex flex-1 items-start justify-between gap-3 p-4 pb-16 sm:p-5 sm:pb-[68px]">
          <div className="min-w-0">
            <p
              className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.08em]"
              style={{ fontFamily: T.sans, color: T.text3 }}
            >
              {label}
            </p>
            {children}
            {note && (
              <p className="mt-2 text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
                {note}
              </p>
            )}
          </div>

          <motion.div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{
              background: accent ? `${accent}14` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${accent ? `${accent}30` : T.line}`,
            }}
            whileHover={{ rotate: -6, scale: 1.06 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18 }}
          >
            <Icon size={17} strokeWidth={2.3} style={{ color: accent || T.text3 }} />
          </motion.div>
        </div>
      </Spotlight>
    </motion.div>
  );
}

const Num = ({ children, color }) => (
  <span
    className="block text-[38px] font-black leading-none tabular-nums"
    style={{ fontFamily: T.display, color: color || T.text, letterSpacing: '-0.02em' }}
  >
    {children}
  </span>
);

export default function StatCards({ stats, chartData }) {
  const rrUp = stats.totalRR >= 0;
  const rrColor = stats.totalRR === 0 ? T.text : rrUp ? T.ok : T.bad;
  const profitColor = stats.totalProfit === 0 ? T.text3 : stats.totalProfit > 0 ? T.ok : T.bad;

  /* Winrate стає жовтим лише коли справді просів */
  const wrLow = stats.total >= 5 && stats.winrate < 45;
  /* Дисципліна червоніє, коли план порушується частіше ніж у третині угод */
  const planLow = stats.total >= 5 && stats.planRate < 70;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card
        label="Total Trades"
        icon={Hash}
        spark={<Spark data={chartData} dataKey="trades" color={T.text3} primary="Trade" />}
        note={stats.total === 0 ? 'No records yet' : null}
      >
        <Num>{stats.total}</Num>
      </Card>

      <Card
        label="Win rate"
        icon={Target}
        accent={wrLow ? T.warn : null}
        spark={<Spark data={chartData} dataKey="winRate" color={wrLow ? T.warn : T.text3} primary="Win rate" />}
        note={stats.total > 0 ? `${Math.round((stats.winrate / 100) * stats.total)} of ${stats.total}` : null}
      >
        <Num color={wrLow ? T.warn : T.text}>{stats.winrate}%</Num>
      </Card>

      <Card
        label="Total R / PnL"
        icon={rrUp ? TrendingUp : TrendingDown}
        accent={stats.totalRR === 0 ? null : rrUp ? T.ok : T.bad}
        spark={<Spark data={chartData} dataKey="cumulativeRR" color={rrUp ? T.ok : T.bad} primary="Accumulated" />}
      >
        <Num color={rrColor}>
          {stats.totalRR > 0 ? '+' : ''}{stats.totalRR}R
        </Num>
        <span
          className="mt-2 block text-[16px] font-bold tabular-nums"
          style={{ fontFamily: T.mono, color: profitColor }}
        >
          {stats.totalProfit > 0 ? '+' : stats.totalProfit < 0 ? '−' : ''}
          ${Math.abs(stats.totalProfit).toFixed(2)}
        </span>
      </Card>

      <Card
        label="Plan Adherence"
        icon={ShieldCheck}
        accent={planLow ? T.bad : null}
        spark={<Spark data={chartData} dataKey="planRate" color={planLow ? T.bad : T.text3} primary="Plan rate" />}
        note={stats.mistakeRate > 0 ? `mistakes in ${stats.mistakeRate}% of trades` : null}
      >
        <Num color={planLow ? T.bad : T.text}>{stats.planRate}%</Num>
      </Card>
    </div>
  );
}

/* ==================================================================
   Серія — хайповий банер, а не тихий рядок статистики. Стрік це
   момент адреналіну (як у Duolingo чи кіл-стріку в шутері), тому
   тут навмисно гучніше за решту сторінки: відблиск, що пробігає
   поверхнею, пульсуюче світіння, іконка, що оживає.
================================================================== */

export function StreakBar({ streak }) {
  if (!streak || streak.count < 2) return null;
  const win = streak.type === 'win';
  const c = win ? T.ok : T.bad;
  const rgb = win ? T.okRgb : T.badRgb;
  const Icon = win ? Flame : Snowflake;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.5, bounce: 0.4 }}
      className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl px-5 py-4"
      style={{
        background: `linear-gradient(120deg, rgba(${rgb},0.24), rgba(${rgb},0.05) 70%)`,
        border: `1.5px solid rgba(${rgb},0.5)`,
      }}
    >
      {/* Пульсуюче зовнішнє світіння */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        animate={{ boxShadow: [`0 0 0px rgba(${rgb},0)`, `0 0 34px rgba(${rgb},0.55)`, `0 0 0px rgba(${rgb},0)`] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Відблиск, що періодично пробігає поверхнею */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-[20deg]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)' }}
        animate={{ left: ['-45%', '140%'] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
      />

      <motion.span
        className="relative flex shrink-0"
        animate={win ? { rotate: [0, -10, 10, -6, 0], scale: [1, 1.18, 1] } : { y: [0, -4, 0] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon size={30} strokeWidth={2} style={{ color: c, filter: `drop-shadow(0 0 10px rgba(${rgb},0.85))` }} />
      </motion.span>

      <div className="relative flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <motion.span
          className="text-[32px] font-black italic leading-none tabular-nums"
          style={{ fontFamily: T.display, color: c }}
          animate={{ textShadow: [`0 0 0px rgba(${rgb},0)`, `0 0 18px rgba(${rgb},0.9)`, `0 0 0px rgba(${rgb},0)`] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {streak.count}
        </motion.span>
        <span className="text-[16px] font-black uppercase tracking-wide" style={{ color: c, fontFamily: T.display }}>
          {win ? 'Win Streak' : 'Losing Streak'}
        </span>
      </div>

      <span className="relative ml-auto text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
        {win ? 'stay disciplined with risk' : 'consider taking a break'}
      </span>
    </motion.div>
  );
}
