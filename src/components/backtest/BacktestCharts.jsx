import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingDown, Flame, Snowflake, Clock, CalendarDays, BarChart3 } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { fmtR } from '../../lib/backtestStats';
import { SoftCard } from '../ui/Hovers';

/* ==================================================================
   Аналітика бектесту: крива з просадкою, розбивка по сесіях і днях,
   серії та розподіл R. Кожен блок відповідає на одне питання —
   інакше це просто стіна графіків.
================================================================== */

export function Panel({ icon: Icon, title, hint, right, children, className = '' }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={className}
    >
      <SoftCard lift={0} className="h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <div className="flex min-w-0 items-center gap-3">
          {Icon && (
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
              style={{ background: `rgba(${T.accRgb},0.09)`, border: `1px solid rgba(${T.accRgb},0.20)` }}
            >
              <Icon size={15} strokeWidth={2.2} style={{ color: T.acc }} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
              {title}
            </h3>
            {hint && <p className="mt-0.5 truncate text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>{hint}</p>}
          </div>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
      </SoftCard>
    </motion.section>
  );
}

/* ---------- тултип кривої ---------- */
function EquityTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows = [
    d.date && { label: 'Дата', value: d.date },
    d.tradeR != null && { label: 'Ця угода', value: fmtR(d.tradeR), color: d.tradeR > 0 ? T.ok : d.tradeR < 0 ? T.bad : T.text2 },
    { label: 'Накопичено', value: fmtR(d.r), color: d.r >= 0 ? T.ok : T.bad },
    { label: 'Баланс', value: `$${d.balance.toLocaleString('uk-UA')}` },
    d.dd < 0 && { label: 'Просадка', value: fmtR(d.dd), color: T.warn },
  ].filter(Boolean);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: 'rgba(19,19,22,0.97)', backdropFilter: 'blur(16px)',
        border: `1px solid ${T.lineHi}`, boxShadow: '0 18px 44px rgba(0,0,0,0.8)', minWidth: 190,
      }}
    >
      <div className="px-3.5 py-2.5" style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}>
        <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
          Угода {d.label}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-6">
            <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{r.label}</span>
            <span className="text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: r.color || T.text2 }}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- крива еквіті + просадка ---------- */
export function EquityPanel({ stats }) {
  const up = stats.netR >= 0;
  const color = up ? T.ok : T.bad;

  return (
    <Panel
      icon={BarChart3}
      title="Крива еквіті"
      hint={`${stats.total} угод · максимальна просадка ${stats.maxDrawdownR.toFixed(2)}R`}
      right={
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>Net</div>
            <div className="text-[17px] font-bold tabular-nums" style={{ fontFamily: T.mono, color }}>{fmtR(stats.netR)}</div>
          </div>
          <div className="text-right">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>Max DD</div>
            <div className="text-[17px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: stats.maxDrawdownR > 0 ? T.warn : T.text3 }}>
              −{stats.maxDrawdownR.toFixed(2)}R
            </div>
          </div>
        </div>
      }
    >
      <div className="h-[200px] w-full sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={stats.equity} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="bt-eq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.26} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bt-dd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.warn} stopOpacity={0} />
                <stop offset="100%" stopColor={T.warn} stopOpacity={0.22} />
              </linearGradient>
            </defs>

            <XAxis dataKey="label" tick={{ fill: T.text4, fontSize: 12, fontFamily: T.sans }} tickLine={false} axisLine={{ stroke: T.line }} minTickGap={24} />
            <YAxis tick={{ fill: T.text4, fontSize: 12, fontFamily: T.mono }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${v}R`} />
            <ReferenceLine y={0} stroke={T.lineHi} strokeDasharray="3 3" />
            <Tooltip content={<EquityTip />} cursor={{ stroke: T.lineHi, strokeWidth: 1, strokeDasharray: '3 3' }} />

            {/* просадка як тінь під нулем — видно, наскільки глибоко провалювався */}
            <Area type="monotone" dataKey="dd" stroke="none" fill="url(#bt-dd)" isAnimationActive={false} />
            <Area
              type="monotone" dataKey="r" stroke={color} strokeWidth={2.2} fill="url(#bt-eq)"
              animationDuration={800} animationEasing="ease-out"
              dot={false} activeDot={{ r: 4.5, fill: color, stroke: T.surface, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

/* ---------- універсальний рядок-бар ---------- */
function BarRow({ label, netR, count, winrate, max, i, muted }) {
  const positive = netR >= 0;
  const c = count === 0 ? T.lineHi : positive ? T.ok : T.bad;
  const pct = max ? (Math.abs(netR) / max) * 100 : 0;

  return (
    <div
      className="group/bar -mx-2 rounded-xl px-2 py-1.5 transition-colors duration-200"
      style={{ opacity: muted ? 0.45 : 1 }}
      onMouseEnter={(e) => { if (count) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
          {label}
        </span>
        <span className="shrink-0 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: count ? c : T.text4 }}>
          {count ? fmtR(netR) : '—'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: T.sunken }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: 0.05 * i, ease: EASE }}
          className="h-full rounded-full transition-[filter] duration-200 group-hover/bar:brightness-110"
          style={{ background: c }}
        />
      </div>
      <div className="mt-1.5 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {count ? `${count} угод · ${Math.round(winrate)}% win` : 'немає угод'}
      </div>
    </div>
  );
}

export function SessionPanel({ stats }) {
  const max = Math.max(1, ...stats.bySession.map((s) => Math.abs(s.netR)));
  const best = stats.bySession.length ? stats.bySession.reduce((a, b) => (b.netR > a.netR ? b : a)) : null;

  return (
    <Panel
      icon={Clock}
      title="За сесіями"
      hint={best ? `Найкраща — ${best.name}` : 'Ще немає даних'}
    >
      <div className="flex flex-col gap-5">
        {stats.bySession.length === 0 ? (
          <p className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>Додай угоди — і побачиш, де ти реально заробляєш.</p>
        ) : (
          stats.bySession.map((s, i) => <BarRow key={s.name} label={s.name} {...s} max={max} i={i} />)
        )}
      </div>
    </Panel>
  );
}

export function WeekdayPanel({ stats }) {
  const max = Math.max(1, ...stats.byWeekday.map((d) => Math.abs(d.netR)));
  const worst = stats.byWeekday.filter((d) => d.count).sort((a, b) => a.netR - b.netR)[0];

  return (
    <Panel
      icon={CalendarDays}
      title="За днями тижня"
      hint={worst && worst.netR < 0 ? `Найгірший день — ${worst.name}` : 'Рівно по тижню'}
    >
      <div className="flex flex-col gap-5">
        {stats.byWeekday.map((d, i) => (
          <BarRow key={d.name} label={d.name} {...d} max={max} i={i} muted={!d.count} />
        ))}
      </div>
    </Panel>
  );
}

/* ---------- серії + розподіл R ---------- */
export function StreakPanel({ stats }) {
  const cur = stats.currentStreak;
  const curWin = cur?.type === 'WIN';

  return (
    <Panel
      icon={TrendingDown}
      title="Серії та розподіл R"
      hint="Наскільки рівно йде крива — і що буває найчастіше"
    >
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Best win', value: stats.bestWinStreak, color: T.ok, icon: Flame },
          { label: 'Worst loss', value: stats.worstLossStreak, color: T.bad, icon: Snowflake },
          { label: 'Зараз', value: cur ? cur.count : 0, color: cur ? (curWin ? T.ok : T.bad) : T.text3, icon: curWin ? Flame : Snowflake },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="min-w-0 rounded-xl p-3.5 transition-colors duration-200"
            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineHi)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Icon size={13} strokeWidth={2.3} className="shrink-0" style={{ color }} />
              <span className="truncate text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {label}
              </span>
            </div>
            <div className="text-[24px] font-bold tabular-nums leading-none" style={{ fontFamily: T.display, color }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex h-[120px] items-end gap-1.5 sm:h-[140px] sm:gap-2">
        {stats.distribution.map((d, i) => {
          const c = d.neutral ? T.text4 : d.positive ? T.ok : T.bad;
          return (
            <div key={d.key} className="group/col flex min-w-0 flex-1 cursor-default flex-col items-center gap-2">
              <span className="text-[12px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: d.count ? T.text2 : T.text4 }}>
                {d.count || ''}
              </span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(d.pct, d.count ? 6 : 2)}%` }}
                transition={{ duration: 0.6, delay: 0.04 * i, ease: EASE }}
                className="w-full rounded-md transition-opacity duration-200 group-hover/col:opacity-100"
                style={{ background: d.count ? `${c}` : T.line, opacity: d.count ? 0.8 : 0.4, minHeight: 3 }}
                title={`${d.key}: ${d.count}`}
              />
              <span
                className="w-full truncate text-center text-[11.5px] text-[#4A4A52] transition-colors duration-200 group-hover/col:text-[#B4B4BD]"
                style={{ fontFamily: T.sans }}
              >
                {d.key}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
