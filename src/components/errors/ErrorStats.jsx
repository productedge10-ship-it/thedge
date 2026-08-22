import { motion } from 'framer-motion';
import { Flame, CalendarDays, Repeat2, TrendingDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CATS, getCat } from './utils';
import { SoftCard } from '../ui/Hovers';

/* ==================================================================
   Зведення по помилках.
   Головне питання: чи стає їх менше. Тому поруч із загальною
   кількістю завжди видно порівняння з минулим місяцем і те, яка
   помилка тримає перше місце.
================================================================== */

export default function ErrorStats({ entries }) {
  const now = new Date();
  const curKey = now.toISOString().slice(0, 7);
  const prev = new Date(now); prev.setMonth(prev.getMonth() - 1);
  const prevKey = prev.toISOString().slice(0, 7);

  const monthCount = entries.filter((e) => e.date.slice(0, 7) === curKey).length;
  const prevCount = entries.filter((e) => e.date.slice(0, 7) === prevKey).length;

  let deltaText = 'без змін';
  let deltaColor = T.text4;
  if (prevCount > 0 && monthCount !== prevCount) {
    const d = Math.round(((monthCount - prevCount) / prevCount) * 100);
    deltaText = `${d < 0 ? '↓' : '↑'} ${Math.abs(d)}% до минулого`;
    deltaColor = d < 0 ? T.ok : T.bad;
  }

  const counts = {};
  entries.forEach((e) => e.cats.forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  const totalTags = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const distribution = CATS.filter((c) => counts[c.id])
    .map((c) => ({ ...c, count: counts[c.id], pct: Math.round((counts[c.id] / totalTags) * 100) }))
    .sort((a, b) => b.count - a.count);

  const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const topCat = topId ? getCat(topId) : null;

  /* скільки помилок повторюються більше одного разу — саме вони й болять */
  const repeats = distribution.filter((d) => d.count > 1).length;

  const cards = [
    { label: 'Всього записів', value: entries.length, icon: TrendingDown, color: T.acc, hint: 'за весь час' },
    { label: 'Цього місяця', value: monthCount, icon: CalendarDays, color: deltaColor, hint: deltaText },
    { label: 'Найчастіша', value: topCat ? topCat.label : '—', icon: Flame, color: topCat?.color || T.text3, hint: topId ? `${Math.round((counts[topId] / totalTags) * 100)}% усіх позначок` : '', small: true },
    { label: 'Повторюваних', value: repeats, icon: Repeat2, color: repeats ? T.warn : T.ok, hint: 'категорій більше ніж раз' },
  ];

  return (
    <div className="mb-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: i * 0.04, ease: EASE }}
            >
              <SoftCard className="min-w-0 px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    {c.label}
                  </span>
                  <Icon size={14} strokeWidth={2.3} className="shrink-0 opacity-60 transition-opacity duration-300 group-hover:opacity-100" style={{ color: c.color }} />
                </div>
                <div
                  className={`mt-1.5 truncate font-bold leading-none ${c.small ? 'text-[19px]' : 'text-[26px] tabular-nums'}`}
                  style={{ fontFamily: T.display, color: c.color }}
                  title={String(c.value)}
                >
                  {c.value}
                </div>
                <div className="mt-1.5 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {c.hint}
                </div>
              </SoftCard>
            </motion.div>
          );
        })}
      </div>

      {/* розподіл категорій */}
      {distribution.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.16, ease: EASE }}
          className="rounded-2xl px-5 py-4"
          style={{ background: T.surface, border: `1px solid ${T.line}` }}
        >
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Розподіл категорій
          </div>

          <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {distribution.map((d, i) => (
              <motion.div
                key={d.id}
                title={`${d.label} — ${d.pct}%`}
                className="h-full rounded-sm transition-[filter] duration-200 hover:brightness-125"
                style={{ background: d.color, opacity: 0.85 }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(d.pct, 3)}%` }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.04, ease: EASE }}
              />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {distribution.map((d) => (
              <span key={d.id} className="flex items-center gap-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
                {d.label}
                <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{d.count}</span>
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
