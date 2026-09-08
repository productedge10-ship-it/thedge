import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { CATS } from './utils';

/* ==================================================================
   Зведення по журналу помилок.

   Одна панель на два питання, і обидва — про повторюваність:
   скільки записів усього (і чи стало їх більше цього місяця) та
   що саме повторюється частіше за інше.

   Свідомо без «найчастішої категорії» окремою карткою: та сама
   інформація вже стоїть першим рядком у розкладі праворуч, а
   продубльована — лише розмиває погляд.

   Зведення читає чужі записи й не має права падати через жоден із
   них: один запис без дати чи без категорій клав усю сторінку
   разом із формою, через яку його тільки й можна виправити.
================================================================== */

const A = (a) => `rgba(${T.accRgb}, ${a})`;

const plural = (n) => `${n} ${n === 1 ? 'запис' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'записи' : 'записів'}`;

export default function ErrorStats({ entries }) {
  const list = Array.isArray(entries) ? entries : [];

  const now = new Date();
  const curKey = now.toISOString().slice(0, 7);
  const prev = new Date(now); prev.setMonth(prev.getMonth() - 1);
  const prevKey = prev.toISOString().slice(0, 7);

  const monthOf = (e) => String(e?.date || '').slice(0, 7);
  const monthCount = list.filter((e) => monthOf(e) === curKey).length;
  const prevCount = list.filter((e) => monthOf(e) === prevKey).length;

  /* Менше помилок — це добре, тому стрілка вниз зелена. Це єдине
     місце в застосунку, де падіння цифри — привід радіти, і колір
     мусить це казати замість користувача. */
  const diff = monthCount - prevCount;
  const trendGood = diff <= 0;
  const trendLabel = diff === 0 ? 'без змін' : `${diff > 0 ? '+' : ''}${diff}`;

  const counts = {};
  list.forEach((e) => (e?.cats || []).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
  const marks = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const breakdown = CATS.filter((c) => counts[c.id])
    .map((c) => ({ ...c, count: counts[c.id], pct: Math.round((counts[c.id] / marks) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const repeated = Object.values(counts).filter((n) => n > 1).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="relative mb-5 overflow-hidden rounded-[20px] px-7"
      style={{
        background: 'linear-gradient(140deg,#131320,#0d0d13 54%,#0b0b10)',
        border: '1px solid #1f1f2b',
        boxShadow: '0 24px 60px -34px #000',
      }}
    >
      <span
        className="pointer-events-none absolute rounded-full"
        style={{ left: -60, top: -90, width: 340, height: 230, background: T.acc, filter: 'blur(76px)', opacity: 0.13 }}
      />

      <div className="relative flex flex-wrap items-stretch">
        {/* ─── всього записів ─── */}
        <div className="w-[248px] flex-none py-6 pr-7">
          <div
            className="text-[10.5px] font-bold uppercase"
            style={{ fontFamily: T.mono, letterSpacing: '2px', color: '#8d8b9e' }}
          >
            Всього записів
          </div>

          <div className="mt-3 flex items-baseline gap-2.5">
            <span
              style={{ fontFamily: T.display, fontSize: 56, fontWeight: 700, letterSpacing: '-2.4px', lineHeight: 1, color: '#ffffff' }}
            >
              {list.length}
            </span>
            <span className="text-[13.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
              {plural(list.length).split(' ')[1]}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2.5">
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12px] font-bold"
              style={{
                fontFamily: T.sans,
                background: trendGood ? '#2fbf8f1f' : '#ff7b7b1f',
                border: `1px solid ${trendGood ? '#2fbf8f4d' : '#ff7b7b4d'}`,
                color: trendGood ? '#6fe0b4' : '#ff9d9d',
              }}
            >
              {trendGood
                ? <TrendingDown size={12} strokeWidth={2.4} />
                : <TrendingUp size={12} strokeWidth={2.4} />}
              {trendLabel}
            </span>
            <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
              цього місяця
            </span>
          </div>
        </div>

        <div
          className="my-5 w-px flex-none"
          style={{ background: 'linear-gradient(180deg,transparent,#ffffff1c 22%,#ffffff1c 78%,transparent)' }}
        />

        {/* ─── що повторюється ─── */}
        <div className="min-w-[320px] flex-1 py-6 pl-7">
          <div className="flex items-baseline justify-between gap-3">
            <div
              className="text-[10.5px] font-bold uppercase"
              style={{ fontFamily: T.mono, letterSpacing: '2px', color: '#8d8b9e' }}
            >
              Що повторюється
            </div>
            <div className="text-[12.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e' }}>
              {repeated
                ? `${repeated} ${repeated === 1 ? 'категорія повторюється' : 'категорії повторюються'}`
                : 'поки без повторів'}
            </div>
          </div>

          {breakdown.length ? (
            <div className="mt-4 flex flex-col gap-3">
              {breakdown.map((b) => (
                <div key={b.id} className="flex items-center gap-3.5">
                  <div
                    className="w-[140px] flex-none truncate text-[13.5px] font-semibold"
                    style={{ fontFamily: T.sans, color: '#d4d2e0' }}
                  >
                    {b.label}
                  </div>

                  <div
                    className="h-[7px] min-w-[40px] flex-1 overflow-hidden rounded-full"
                    style={{ background: '#17171f', boxShadow: 'inset 0 1px 2px #00000099' }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(6, b.pct)}%`,
                        background: `linear-gradient(90deg, ${b.color}5e, ${b.color})`,
                        boxShadow: `0 0 12px ${b.color}66`,
                      }}
                    />
                  </div>

                  <div
                    className="w-6 flex-none text-right"
                    style={{ fontFamily: T.display, fontSize: 16, fontWeight: 700, color: '#ffffff' }}
                  >
                    {b.count}
                  </div>
                  <div
                    className="w-10 flex-none text-right text-[12px]"
                    style={{ fontFamily: T.mono, color: `${b.color}dd` }}
                  >
                    {b.pct}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[13.5px]" style={{ fontFamily: T.sans, color: '#7d7b8e', lineHeight: 1.6 }}>
              Розклад зʼявиться, щойно накопичиться перша пара записів.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
