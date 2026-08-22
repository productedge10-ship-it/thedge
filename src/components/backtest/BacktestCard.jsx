import { motion } from 'framer-motion';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { ArrowRight, Trash2, Flame, Snowflake, Globe } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { computeStats, sparkFromTrades, fmtPF, fmtR } from '../../lib/backtestStats';
import { SoftCard } from '../ui/Hovers';

/* ==================================================================
   Картка бектесту у списку.
   Тут навмисно багато цифр: щоб вирішити «заходити чи ні», треба
   бачити не тільки Net R, а й чим він дався — просадкою, PF,
   очікуванням і серіями.
================================================================== */

function Stat({ label, value, color, wide }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </div>
      <div className="mt-1 text-[16px] font-bold tabular-nums leading-none" style={{ fontFamily: T.mono, color: color || T.text }}>
        {value}
      </div>
    </div>
  );
}

export default function BacktestCard({ session, onOpen, onDelete }) {
  const trades = session.trades || [];
  const s = computeStats(trades, session.initial_balance || 10000);
  const spark = sparkFromTrades(s.trades);
  const up = s.netR >= 0;
  const color = s.total === 0 ? T.text3 : up ? T.ok : T.bad;
  const streak = s.currentStreak;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.35, ease: EASE }}
      className="h-full"
    >
      <SoftCard
        onClick={() => onOpen(session)}
        className="flex h-full cursor-pointer flex-col overflow-hidden"
      >
      {/* смужка результату */}
      <span className="absolute inset-y-0 left-0 z-10 w-[2px] transition-opacity duration-300" style={{ background: color, opacity: 0.55 }} />

      {/* шапка */}
      <div className="flex items-start justify-between gap-3 p-5 pb-4 pl-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-md px-2 py-0.5 text-[12px] font-bold"
              style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.10)`, border: `1px solid ${T.accLine}` }}
            >
              {session.pair}
            </span>
            {session.strategy_name && (
              <span
                className="rounded-md px-2 py-0.5 text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: T.text3, background: T.sunken, border: `1px solid ${T.line}` }}
              >
                {session.strategy_name}
              </span>
            )}
            {session.demo && (
              <span
                className="rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.08em]"
                style={{ fontFamily: T.sans, color: T.warn, background: `rgba(${T.warnRgb},0.10)`, border: `1px solid rgba(${T.warnRgb},0.25)` }}
              >
                демо
              </span>
            )}

            {/* Видно, що прогін лежить у публічному доступі */}
            {session.is_public && (
              <span
                title="Відкритий за посиланням"
                className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.08em]"
                style={{ fontFamily: T.sans, color: T.acc, background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.24)` }}
              >
                <Globe size={10} strokeWidth={2.6} />
                лінк
              </span>
            )}
          </div>
          <h3
            className="truncate text-[19px] font-bold leading-tight"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
          >
            {session.name}
          </h3>
        </div>

        {onDelete && !session.demo && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(session); }}
            title="Видалити бектест"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg opacity-0 transition-all group-hover:opacity-100"
            style={{ border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.4)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* головна цифра + спарклайн */}
      <div className="relative px-5 pl-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Net R
            </div>
            <div className="mt-1.5 text-[34px] font-bold leading-none tabular-nums" style={{ fontFamily: T.display, color, letterSpacing: '-0.03em' }}>
              {s.total ? fmtR(s.netR) : '—'}
            </div>
            <div className="mt-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {s.total ? `${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(1)}% · $${Math.round(s.balance).toLocaleString('uk-UA')}` : 'ще немає угод'}
            </div>
          </div>

          <div className="h-[62px] w-[46%] min-w-[110px]">
            {s.total > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`bc-${session.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone" dataKey="r" stroke={color} strokeWidth={1.8}
                    fill={`url(#bc-${session.id})`} isAnimationActive dot={false}
                    animationDuration={700}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* статистика */}
      <div
        className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 pl-6 sm:grid-cols-4"
        style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
      >
        <Stat label="Угод" value={s.total} />
        <Stat label="Win" value={`${s.winrate.toFixed(0)}%`} color={s.total ? (s.winrate >= 50 ? T.ok : T.text) : T.text4} />
        <Stat label="PF" value={s.total ? fmtPF(s.profitFactor) : '—'} color={s.profitFactor >= 1.5 ? T.ok : s.profitFactor < 1 && s.total ? T.bad : T.text} />
        <Stat label="Очік." value={s.total ? fmtR(s.expectancy) : '—'} color={s.expectancy > 0 ? T.ok : s.expectancy < 0 ? T.bad : T.text} />

        <Stat label="Max DD" value={s.total ? `−${s.maxDrawdownR.toFixed(1)}R` : '—'} color={s.maxDrawdownR > 0 ? T.warn : T.text3} />
        <Stat label="Best" value={s.total ? fmtR(s.bestR) : '—'} color={T.ok} />
        <Stat label="Worst" value={s.total ? fmtR(s.worstR) : '—'} color={T.bad} />
        <Stat label="Серія" value={s.bestWinStreak ? `${s.bestWinStreak}W` : '—'} />
      </div>

      {/* підвал */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 pl-6" style={{ borderTop: `1px solid ${T.line}` }}>
        <div className="flex min-w-0 items-center gap-2">
          {streak ? (
            <span
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold"
              style={{
                fontFamily: T.sans,
                color: streak.type === 'WIN' ? T.ok : T.bad,
                background: streak.type === 'WIN' ? `rgba(${T.okRgb},0.08)` : `rgba(${T.badRgb},0.08)`,
                border: `1px solid ${streak.type === 'WIN' ? `rgba(${T.okRgb},0.20)` : `rgba(${T.badRgb},0.20)`}`,
              }}
            >
              {streak.type === 'WIN' ? <Flame size={12} strokeWidth={2.4} /> : <Snowflake size={12} strokeWidth={2.4} />}
              {streak.count} поспіль
            </span>
          ) : (
            <span className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {s.lastDate ? `останній запис ${s.lastDate}` : 'порожній бектест'}
            </span>
          )}
        </div>

        <span
          className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[#7A7A85] transition-colors duration-300 group-hover:text-[#FAFAFA]"
          style={{ fontFamily: T.sans }}
        >
          Відкрити
          <ArrowRight size={14} strokeWidth={2.4} className="transition-transform duration-300 group-hover:translate-x-1" />
        </span>
      </div>
      </SoftCard>
    </motion.article>
  );
}
