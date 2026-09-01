import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { fmtPF, fmtR, money } from '../../lib/backtestStats';

/* ==================================================================
   Смуга ключових цифр.
   Раніше це були шість окремих карток — око бігало між ними й не
   бачило головного. Тепер це одна панель: Net R великим зліва,
   решта дрібнішим поруч, розділені волосяними лініями.
================================================================== */

const Label = ({ children }) => (
  <div
    className="text-[10px] font-bold uppercase leading-none tracking-[0.2em]"
    style={{ fontFamily: T.mono, color: T.text3 }}
  >
    {children}
  </div>
);

export default function StatStrip({ stats }) {
  const up = stats.netR >= 0;
  const netColor = stats.total === 0 ? T.text : up ? T.ok : T.bad;

  const cells = [
    {
      label: 'Win rate',
      value: `${stats.winrate.toFixed(1)}%`,
      sub: `${stats.wins} виграшних із ${stats.decisive || 0}`,
      color: T.text,
    },
    {
      label: 'Profit factor',
      value: fmtPF(stats.profitFactor),
      sub: `+${stats.grossWin.toFixed(1)}R проти −${stats.grossLoss.toFixed(1)}R`,
      color: stats.profitFactor >= 1.5 ? T.ok : stats.profitFactor < 1 && stats.total ? T.bad : T.text,
    },
    {
      label: 'Просадка',
      value: `−${stats.maxDrawdownR.toFixed(2)}R`,
      sub: stats.currentDDR > 0 ? `зараз −${stats.currentDDR.toFixed(2)}R від піку` : 'зараз на піку',
      color: stats.maxDrawdownR > 0 ? T.warn : T.text3,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="grid overflow-hidden rounded-[20px] sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]"
      style={{
        background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
        border: `1px solid ${T.line}`,
      }}
    >
      {/* Net R — головна цифра прогону */}
      <div className="px-6 py-[22px]" style={{ borderRight: `1px solid ${T.line}` }}>
        <Label>Net R</Label>
        <div
          className="mt-3 text-[34px] font-bold leading-none tabular-nums sm:text-[40px]"
          style={{ fontFamily: T.mono, color: netColor, letterSpacing: '-0.035em' }}
        >
          {fmtR(stats.netR)}
        </div>
        <div className="mt-[11px] text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {stats.total} угод · {stats.wins}W / {stats.losses}L · {stats.bes} BE
        </div>
        <div className="mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          Баланс {money(Math.round(stats.balance))} · {stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(1)}%
          {' · '}очікування {fmtR(stats.expectancy)}
        </div>
      </div>

      {cells.map((c, i) => (
        <div
          key={c.label}
          className={`border-t px-6 py-[22px] xl:border-t-0 ${i === 0 ? 'sm:border-t-0' : ''}`}
          style={{
            borderColor: T.line,
            borderRight: i < cells.length - 1 ? `1px solid ${T.line}` : undefined,
          }}
        >
          <Label>{c.label}</Label>
          <div
            className="mt-3 text-[26px] font-bold leading-none tabular-nums sm:text-[30px]"
            style={{ fontFamily: T.mono, color: c.color, letterSpacing: '-0.03em' }}
          >
            {c.value}
          </div>
          <div className="mt-[11px] text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>{c.sub}</div>
        </div>
      ))}
    </motion.div>
  );
}
