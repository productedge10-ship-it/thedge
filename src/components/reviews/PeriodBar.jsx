import { motion } from 'framer-motion';
import { CalendarDays, Repeat2, AlertTriangle } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { fmtR, MISTAKE_TYPES } from '../../lib/reviewsData';
import { SoftCard } from '../ui/Hovers';

/* ==================================================================
   Шапка розбору: період, цифри за нього і повторювані помилки.
   Спочатку факти, потім текст — інакше висновок пишеться на відчуттях.
================================================================== */

const PRESETS = [
  { key: 'day',   label: 'День',    days: 0 },
  { key: 'week',  label: 'Тиждень', days: 6 },
  { key: 'month', label: 'Місяць',  days: 29 },
];

export function PeriodPicker({ from, to, onChange }) {
  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    onChange({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
  };

  const field = {
    background: T.sunken, border: `1px solid ${T.line}`, color: T.text2,
    fontFamily: T.sans, colorScheme: 'dark',
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-[42px] items-center gap-2 rounded-xl px-3.5" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        <CalendarDays size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
        <input
          type="date"
          value={from}
          onChange={(e) => onChange({ from: e.target.value, to })}
          className="bg-transparent text-[13.5px] outline-none"
          style={{ fontFamily: T.sans, color: T.text2, colorScheme: 'dark' }}
        />
        <span style={{ color: T.text4 }}>—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onChange({ from, to: e.target.value })}
          className="bg-transparent text-[13.5px] outline-none"
          style={{ fontFamily: T.sans, color: T.text2, colorScheme: 'dark' }}
        />
      </div>

      <div className="flex h-[42px] items-center gap-1 rounded-xl p-1" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.days)}
            className="rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: T.text3, ...field, background: 'transparent', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PeriodStats({ stats }) {
  const items = [
    { label: 'Угод', value: stats.total },
    { label: 'Net R', value: fmtR(stats.netR), color: stats.netR > 0 ? T.ok : stats.netR < 0 ? T.bad : T.text },
    { label: 'Win rate', value: `${Math.round(stats.winrate)}%` },
    { label: 'За планом', value: `${Math.round(stats.planRate)}%`, color: stats.total ? (stats.planRate >= 70 ? T.ok : T.warn) : T.text },
    { label: 'Помилок', value: stats.mistakes, color: stats.mistakes > 0 ? T.warn : T.text },
    { label: 'Ціна помилок', value: stats.costOfMistakes ? fmtR(stats.costOfMistakes) : '0R', color: stats.costOfMistakes < 0 ? T.bad : T.text },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.03, ease: EASE }}
        >
          <SoftCard className="min-w-0 px-4 py-3.5">
            <div className="truncate text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }} title={it.label}>
              {it.label}
            </div>
            <div
              className="mt-1.5 truncate text-[22px] font-bold tabular-nums leading-none"
              style={{ fontFamily: T.display, color: it.color || T.text }}
              title={String(it.value)}
            >
              {it.value}
            </div>
          </SoftCard>
        </motion.div>
      ))}
    </div>
  );
}

/* Повтори — головна цінність розбору. Якщо помилка вже була раніше,
   це не випадковість, а звичка, і вона підсвічується окремо. */
export function RepeatedMistakes({ rows }) {
  if (!rows.length) return null;
  const repeats = rows.filter((r) => r.before > 0);

  return (
    <SoftCard lift={0} className="overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: `rgba(${T.warnRgb},0.09)`, border: `1px solid rgba(${T.warnRgb},0.20)` }}
        >
          <Repeat2 size={15} strokeWidth={2.2} style={{ color: T.warn }} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Що повторюється</h3>
          <p className="truncate text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {repeats.length
              ? `${repeats.length} ${repeats.length === 1 ? 'помилка була' : 'помилки були'} й до цього періоду`
              : 'Усе нове — повторів немає'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {rows.map((r) => {
          const meta = MISTAKE_TYPES[r.type] || { label: r.type };
          const isRepeat = r.before > 0;
          return (
            <div
              key={r.type}
              className="flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors duration-200"
              style={{
                background: isRepeat ? `rgba(${T.warnRgb},0.05)` : T.sunken,
                border: `1px solid ${isRepeat ? `rgba(${T.warnRgb},0.20)` : T.line}`,
              }}
            >
              {isRepeat && <AlertTriangle size={14} strokeWidth={2.4} className="shrink-0" style={{ color: T.warn }} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                  {meta.label}
                </div>
                <div className="truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {isRepeat ? `${r.now} у цьому періоді · ${r.before} раніше` : `${r.now} у цьому періоді`}
                </div>
              </div>
              <span className="shrink-0 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: r.cost < 0 ? T.bad : T.text3 }}>
                {r.cost ? fmtR(r.cost) : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </SoftCard>
  );
}
