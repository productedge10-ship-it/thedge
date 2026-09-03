import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { fmtR, SESSIONS } from '../../lib/backtestStats';

/* ==================================================================
   Три розбивки поруч: сесії, дні тижня, розподіл результатів.
   Рядок — назва, цифра і тонка смуга. Ніяких осей: тут важлива
   пропорція, а не точне значення.
================================================================== */

/* «1 угод» різало око в кожній панелі — рахуємо форму слова */
const trades = (n) => {
  const t = n % 100;
  const o = n % 10;
  if (t >= 11 && t <= 14) return `${n} угод`;
  if (o === 1) return `${n} угода`;
  if (o >= 2 && o <= 4) return `${n} угоди`;
  return `${n} угод`;
};

function Rows({ rows }) {
  return (
    <div className="mt-5 flex flex-col gap-3.5">
      {rows.map((r, i) => (
        <div key={r.k}>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="min-w-0 truncate text-[13.5px]"
              style={{ fontFamily: T.sans, color: r.strong ? T.text : T.text3, fontWeight: r.strong ? 600 : 500 }}
            >
              {r.k}
            </span>
            <span
              className="shrink-0 tabular-nums"
              style={{
                fontFamily: T.mono,
                fontSize: r.strong ? '13.5px' : '12.5px',
                fontWeight: 600,
                color: r.strong ? r.tone || T.ok : T.text4,
              }}
            >
              {r.v}
            </span>
          </div>
          <div className="mt-2 h-[5px] overflow-hidden rounded-full" style={{ background: T.sunken }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${r.pct}%` }}
              transition={{ duration: 0.6, delay: 0.04 * i, ease: EASE }}
              className="h-full rounded-full"
              style={{ background: r.tone || T.lineHi, opacity: r.tone ? 1 : 0.7 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Ховер — тільки кант: він світлішає, і все. Панель не клікається,
   тому будь-який рух чи підсвітка обіцяли б дію, якої немає. */
function Panel({ title, sub, rows, delay = 0 }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className="rounded-[20px] px-[22px] pb-[22px] pt-5"
      style={{
        background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
        border: `1px solid ${T.line}`,
        transition: 'border-color .3s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; }}
    >
      <div className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>
        {title}
      </div>
      <div className="mt-1.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{sub}</div>
      <Rows rows={rows} />
    </motion.section>
  );
}

export default function BreakdownPanels({ stats }) {
  /* --- сесії --- */
  const sessionMap = Object.fromEntries(stats.bySession.map((s) => [s.name, s]));
  const sMax = Math.max(1, ...SESSIONS.map((n) => Math.abs(sessionMap[n]?.netR || 0)));
  const best = stats.bySession.length
    ? stats.bySession.reduce((a, b) => (b.netR > a.netR ? b : a))
    : null;

  const sessionRows = SESSIONS
    .map((name) => sessionMap[name] || { name, count: 0, netR: 0, winrate: 0 })
    .sort((a, b) => b.count - a.count || b.netR - a.netR)
    .map((s) => ({
      k: s.name,
      v: s.count ? fmtR(s.netR) : 'немає угод',
      pct: s.count ? (Math.abs(s.netR) / sMax) * 100 : 0,
      tone: s.count ? (s.netR >= 0 ? T.ok : T.bad) : null,
      strong: s.count > 0,
    }));

  /* --- дні тижня --- */
  const wMax = Math.max(1, ...stats.byWeekday.map((d) => Math.abs(d.netR)));
  const worst = stats.byWeekday.filter((d) => d.count).sort((a, b) => a.netR - b.netR)[0];
  const weekdayRows = [...stats.byWeekday]
    .sort((a, b) => b.count - a.count)
    .map((d) => ({
      k: d.name,
      v: d.count ? fmtR(d.netR) : 'немає угод',
      pct: d.count ? (Math.abs(d.netR) / wMax) * 100 : 0,
      tone: d.count ? (d.netR >= 0 ? T.ok : T.bad) : null,
      strong: d.count > 0,
    }));

  /* --- розподіл результатів --- */
  const total = Math.max(1, stats.total);
  const distRows = [
    /* Зелений, а не акцент розділу: глибокий фіолетовий на цифрі
       «15 угод» майже не читався, та й виграшні всюди в застосунку
       зелені — окремий колір тут нічого не додавав. */
    { k: 'Виграшні', n: stats.wins, tone: T.ok },
    { k: 'Збиткові', n: stats.losses, tone: T.bad },
    { k: 'У безубиток', n: stats.bes, tone: T.text3 },
  ].map((d) => ({
    k: d.k,
    v: d.n ? trades(d.n) : 'немає',
    pct: (d.n / total) * 100,
    tone: d.n ? d.tone : null,
    strong: d.n > 0,
  }));

  return (
    <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
      <Panel
        title="За сесіями"
        sub={best ? `Найкраща — ${best.name}` : 'Ще немає даних'}
        rows={sessionRows}
      />
      <Panel
        title="За днями тижня"
        sub={worst && worst.netR < 0 ? `Найгірший день — ${worst.name}` : 'Рівно по тижню'}
        rows={weekdayRows}
        delay={0.05}
      />
      <Panel
        title="Розподіл R"
        sub={
          stats.bestWinStreak
            ? `Найкраща серія — ${stats.bestWinStreak} ${stats.bestWinStreak === 1 ? 'перемога' : 'перемог'} поспіль`
            : 'Серій ще немає'
        }
        rows={distRows}
        delay={0.1}
      />
    </div>
  );
}
