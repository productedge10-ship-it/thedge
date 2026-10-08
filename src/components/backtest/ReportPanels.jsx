import { motion } from 'framer-motion';
import { T, EASE } from '../../lib/theme';
import { t as tx, LOCALE } from '../../lib/lang';
import { rOf, fmtR, metaOf, tagsOf, pairOf } from '../../lib/backtestStats';
import { setupsOfTags, emotionLabel, mistakeLabel } from '../../lib/backtestTags';
import { Panel } from './BreakdownPanels';

/* ==================================================================
   Звіт по бектесту — відповіді на «що в мене працює»:
   сетапи, лонг/шорт, емоції, помилки (скільки вони коштують), години
   входу, місяці, найкращі й найгірші угоди. Той самий звіт видно за
   публічним посиланням на бектест.
================================================================== */

const group = (trades, keysOf) => {
  const map = new Map();
  trades.forEach((t) => {
    const keys = keysOf(t);
    (keys.length ? keys : [null]).forEach((k) => {
      if (k == null) return;
      const g = map.get(k) || { k, count: 0, netR: 0, wins: 0, dec: 0 };
      const r = rOf(t);
      g.count += 1; g.netR += r;
      if (t.result === 'WIN') g.wins += 1;
      if (t.result !== 'BE') g.dec += 1;
      map.set(k, g);
    });
  });
  return [...map.values()].map((g) => ({ ...g, netR: Number(g.netR.toFixed(2)), winrate: g.dec ? (g.wins / g.dec) * 100 : 0 }));
};

const toRows = (groups, { label = (k) => k, sort = (a, b) => b.count - a.count, limit = 7 } = {}) => {
  const max = Math.max(1, ...groups.map((g) => Math.abs(g.netR)));
  return [...groups].sort(sort).slice(0, limit).map((g) => ({
    k: `${label(g.k)} · ${g.count}`,
    v: `${fmtR(g.netR)} · ${g.winrate.toFixed(0)}%`,
    pct: (Math.abs(g.netR) / max) * 100,
    tone: g.netR >= 0 ? T.ok : T.bad,
    strong: true,
  }));
};

const empty = (text) => [{ k: text, v: '', pct: 0, tone: null, strong: false }];

const hourOf = (t) => {
  const sec = metaOf(t).chart?.entry_time;
  if (!sec) return null;
  const h = new Date(sec * 1000).getUTCHours();
  const b = Math.floor(h / 3) * 3;
  return `${String(b).padStart(2, '0')}–${String(b + 3).padStart(2, '0')}`;
};

const monthOf = (t) => (t.date ? String(t.date).slice(0, 7) : null);
const monthLabel = (ym) => {
  const d = new Date(`${ym}-15T12:00:00`);
  return isNaN(d) ? ym : d.toLocaleDateString(LOCALE, { month: 'short', year: '2-digit' });
};

function TradeList({ title, sub, list, onOpen, delay }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className="rounded-[20px] px-[22px] pb-[18px] pt-5"
      style={{ background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`, border: `1px solid ${T.line}` }}
    >
      <div className="text-[15.5px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}>{title}</div>
      <div className="mt-1.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>{sub}</div>
      <div className="mt-4 flex flex-col gap-1">
        {!list.length && <span className="text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>{tx('Ще немає угод', 'No trades yet')}</span>}
        {list.map((t) => {
          const r = rOf(t);
          const tags = setupsOfTags(tagsOf(t));
          return (
            <button
              key={t.id}
              type="button"
              disabled={!onOpen}
              onClick={() => onOpen?.(t)}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-white/5"
            >
              <span className="w-[74px] shrink-0 text-[12px] tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{String(t.date || '').slice(5).split('-').reverse().join('.')}</span>
              <span className="w-[42px] shrink-0 text-[11.5px] font-bold" style={{ fontFamily: T.mono, color: t.type === 'SHORT' ? T.bad : T.ok }}>{t.type === 'SHORT' ? 'SHORT' : 'LONG'}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>{[pairOf(t), ...tags].filter(Boolean).join(' · ') || '—'}</span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ fontFamily: T.mono, color: r > 0 ? T.ok : r < 0 ? T.bad : T.text3 }}>{fmtR(r)}</span>
            </button>
          );
        })}
      </div>
    </motion.section>
  );
}

export default function ReportPanels({ stats, onOpen }) {
  const trades = stats.trades || [];

  const setups = group(trades, (t) => { const s = setupsOfTags(tagsOf(t)); return s.length ? s : [tx('Без сетапу', 'No setup')]; });
  const bestSetup = [...setups].filter((g) => g.count >= 2).sort((a, b) => b.netR - a.netR)[0];

  const sides = group(trades, (t) => [t.type === 'SHORT' ? 'Short' : 'Long']);

  const emotions = group(trades, (t) => metaOf(t).emotions || []);
  const mistakes = group(trades, (t) => metaOf(t).mistakes || []);
  const mistakeCost = mistakes.reduce((s, g) => s + Math.min(0, g.netR), 0);
  const withMistakes = trades.filter((t) => (metaOf(t).mistakes || []).length).length;

  const hours = group(trades, (t) => { const h = hourOf(t); return h ? [h] : []; });
  const months = group(trades, (t) => { const m = monthOf(t); return m ? [m] : []; });

  const byR = [...trades].sort((a, b) => rOf(a) - rOf(b));
  const worst = byR.filter((t) => rOf(t) < 0).slice(0, 5);
  const best = byR.filter((t) => rOf(t) > 0).reverse().slice(0, 5);

  return (
    <div>
      <div className="mb-4 mt-[34px]">
        <h2 className="text-[20px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}>{tx('Звіт', 'Report')}</h2>
        <p className="mt-1.5 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {tx('Що працює, а що ні: сетапи, сторона, емоції, помилки, час і найрезультативніші угоди. R · вінрейт.', 'What works and what doesn’t: setups, side, emotions, mistakes, timing and standout trades. R · win rate.')}
        </p>
      </div>
      <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        <Panel
          title={tx('За сетапами', 'By setup')}
          sub={bestSetup ? tx(`Найкращий — ${bestSetup.k}`, `Best — ${bestSetup.k}`) : tx('Познач сетапи в угодах — і тут буде видно, який працює', 'Tag setups on trades to see which one works')}
          rows={setups.length ? toRows(setups) : empty(tx('немає угод', 'no trades'))}
        />
        <Panel
          title={tx('Лонг чи шорт', 'Long vs short')}
          sub={sides.length > 1 ? tx(`Краще — ${[...sides].sort((a, b) => b.netR - a.netR)[0].k}`, `Better — ${[...sides].sort((a, b) => b.netR - a.netR)[0].k}`) : tx('Порівняння сторін угоди', 'Trade side comparison')}
          rows={sides.length ? toRows(sides) : empty(tx('немає угод', 'no trades'))}
          delay={0.05}
        />
        <Panel
          title={tx('Помилки', 'Mistakes')}
          sub={withMistakes ? tx(`${withMistakes} угод з помилками · коштували ${fmtR(mistakeCost)}`, `${withMistakes} trades with mistakes · cost ${fmtR(mistakeCost)}`) : tx('Помилок не позначено', 'No mistakes tagged')}
          rows={mistakes.length ? toRows(mistakes, { label: mistakeLabel, sort: (a, b) => a.netR - b.netR }) : empty(tx('познач у панелі угоди', 'tag them in the trade panel'))}
          delay={0.1}
        />
        <Panel
          title={tx('Емоції', 'Emotions')}
          sub={emotions.length ? tx('З якими емоціями торгуєш краще', 'Which state you trade best in') : tx('Емоцій не позначено', 'No emotions tagged')}
          rows={emotions.length ? toRows(emotions, { label: emotionLabel }) : empty(tx('познач у панелі угоди', 'tag them in the trade panel'))}
          delay={0.12}
        />
        <Panel
          title={tx('Година входу', 'Entry hour')}
          sub={hours.length ? tx('Час брокера, по 3 години', 'Broker time, 3-hour buckets') : tx('Лише для угод з графіка', 'Chart trades only')}
          rows={hours.length ? toRows(hours, { sort: (a, b) => (a.k < b.k ? -1 : 1), limit: 8 }) : empty(tx('немає даних', 'no data'))}
          delay={0.14}
        />
        <Panel
          title={tx('За місяцями', 'By month')}
          sub={months.length ? tx(`${months.filter((m) => m.netR > 0).length} з ${months.length} місяців у плюсі`, `${months.filter((m) => m.netR > 0).length} of ${months.length} months positive`) : tx('Ще немає даних', 'No data yet')}
          rows={months.length ? toRows(months, { label: monthLabel, sort: (a, b) => (a.k < b.k ? 1 : -1), limit: 8 }) : empty(tx('немає угод', 'no trades'))}
          delay={0.16}
        />
      </div>
      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-2">
        <TradeList title={tx('Найгірші угоди', 'Worst trades')} sub={tx('Звідси найбільше уроків', 'The most lessons are here')} list={worst} onOpen={onOpen} delay={0.18} />
        <TradeList title={tx('Найкращі угоди', 'Best trades')} sub={tx('Що варто повторювати', 'What to repeat')} list={best} onOpen={onOpen} delay={0.2} />
      </div>
    </div>
  );
}
