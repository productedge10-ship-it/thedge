import { motion } from 'framer-motion';
import { ArrowRight, Trash2, Globe, Link2, Loader2 } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { computeStats, sparkFromTrades, fmtPF, fmtR } from '../../lib/backtestStats';
import { ACT, act } from './accent';

/* ==================================================================
   Картка бектесту у списку.

   Одна головна цифра — Net R — і крива поруч із нею: разом вони за
   секунду відповідають «жива гіпотеза чи ні». Усе інше дрібним
   рядком нижче, бо потрібне вже після того, як відповідь отримано.

   Геометрія з макета редизайну, кольори — проєктні токени.
================================================================== */

const mono = (size, extra = {}) => ({ fontFamily: T.mono, fontSize: size, ...extra });

/* Крива капіталу.

   Своя, а не recharts: тут потрібні рівно лінія, заливка під нею й
   крапка на кінці. Recharts заради цього тягне контейнер із
   вимірюванням і власним циклом анімації — на сітці з двадцяти
   карток це помітно, а виглядає так само. */
function Spark({ points, color, id }) {
  const W = 132;
  const H = 54;
  const PAD = 3;

  if (!points || points.length < 2) return null;

  const vals = points.map((p) => p.r);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const pts = vals.map((v, i) => [
    PAD + (i * (W - PAD * 2)) / (vals.length - 1),
    PAD + (H - PAD * 2) * (1 - (v - min) / span),
  ]);

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M${pts[0][0]},${H} L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} L${pts[pts.length - 1][0]},${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.8" fill={color} />
    </svg>
  );
}

function Chip({ children, soft }) {
  return (
    <span
      style={{
        ...mono(10.5, { letterSpacing: '1.1px', fontWeight: soft ? 600 : 700 }),
        padding: '5px 9px',
        borderRadius: 7,
        whiteSpace: 'nowrap',
        color: soft ? T.text2 : '#c2b8ff',
        background: soft ? 'rgba(255,255,255,0.05)' : act(0.18),
        border: `1px solid ${soft ? T.lineHi : act(0.4)}`,
      }}
    >
      {children}
    </span>
  );
}

function Metric({ label, value, tone, last }) {
  return (
    <div style={{ padding: '13px 16px', borderRight: last ? 'none' : `1px solid ${T.line}` }}>
      <div
        className="uppercase"
        style={mono(9, { letterSpacing: '1.5px', fontWeight: 600, color: T.text3 })}
      >
        {label}
      </div>
      <div
        className="tabular-nums"
        style={mono(15, { marginTop: 6, fontWeight: 600, letterSpacing: '-0.2px', color: tone || T.text })}
      >
        {value}
      </div>
    </div>
  );
}

export default function BacktestCard({ session, onOpen, onDelete, onShare, sharing }) {
  const trades = session.trades || [];
  const s = computeStats(trades, session.initial_balance || 10000);
  const spark = sparkFromTrades(s.trades);
  const color = s.total === 0 ? T.text3 : s.netR >= 0 ? T.ok : T.bad;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.35, ease: EASE }}
      whileHover={{ y: -4 }}
      onClick={() => onOpen(session)}
      className="group relative h-full cursor-pointer overflow-hidden"
      style={{
        borderRadius: 18,
        background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
        border: `1px solid ${T.line}`,
        transition: 'border-color .22s, box-shadow .22s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = act(0.6);
        e.currentTarget.style.boxShadow = `0 26px 54px -26px #000, 0 0 0 4px ${act(0.08)}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.line;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ padding: '18px 20px 0' }}>
        <div className="flex items-center justify-between" style={{ gap: 10 }}>
          <div className="flex min-w-0 items-center" style={{ gap: 7 }}>
            <Chip>{session.pair}</Chip>
            {session.strategy_name && <Chip soft>{session.strategy_name}</Chip>}
            {session.demo && <Chip soft>демо</Chip>}
            {session.is_public && (
              <span
                title="Відкритий за посиланням"
                className="grid shrink-0 place-items-center"
                style={{
                  width: 26, height: 26, borderRadius: 7,
                  color: '#c2b8ff', background: act(0.16),
                }}
              >
                <Globe size={12} strokeWidth={2.4} />
              </span>
            )}
          </div>

          <span className="shrink-0" style={mono(11, { color: T.text2 })}>
            {s.total} угод
          </span>
        </div>

        <div
          className="truncate"
          style={{
            fontFamily: T.display, marginTop: 14, fontSize: 17,
            fontWeight: 600, letterSpacing: '-0.3px', color: T.text,
          }}
        >
          {session.name}
        </div>

        <div className="flex items-end justify-between" style={{ gap: 14, marginTop: 12 }}>
          <div className="min-w-0">
            <div
              className="uppercase"
              style={mono(9, { letterSpacing: '1.7px', fontWeight: 600, color: T.text3 })}
            >
              Net R
            </div>
            <div
              className="tabular-nums"
              style={mono(29, { marginTop: 5, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color })}
            >
              {s.total ? fmtR(s.netR) : '—'}
            </div>
          </div>

          <div className="shrink-0" style={{ width: 132 }}>
            <Spark points={spark} color={color} id={`spark-${session.id}`} />
          </div>
        </div>

        <div style={{ fontFamily: T.sans, marginTop: 9, fontSize: 12.5, color: T.text3 }}>
          {s.total
            ? `${s.returnPct >= 0 ? '+' : ''}${s.returnPct.toFixed(1)}% · $${Math.round(s.balance).toLocaleString('uk-UA')}`
            : 'ще немає угод'}
        </div>
      </div>

      <div className="grid grid-cols-3" style={{ marginTop: 18, borderTop: `1px solid ${T.line}` }}>
        <Metric
          label="Win"
          value={s.total ? `${s.winrate.toFixed(0)}%` : '—'}
          tone={s.total && s.winrate >= 50 ? T.ok : undefined}
        />
        <Metric
          label="PF"
          value={s.total ? fmtPF(s.profitFactor) : '—'}
          tone={s.profitFactor >= 1.5 ? T.ok : s.profitFactor < 1 && s.total ? T.bad : undefined}
        />
        <Metric
          label="Очік."
          value={s.total ? fmtR(s.expectancy) : '—'}
          tone={s.expectancy > 0 ? T.ok : s.expectancy < 0 ? T.bad : undefined}
          last
        />
      </div>

      <div
        className="flex items-center justify-between"
        style={{ gap: 12, padding: '13px 20px', borderTop: `1px solid ${T.line}` }}
      >
        <span style={mono(11.5, { color: T.text2 })}>
          DD{' '}
          <span style={{ color: s.maxDrawdownR > 0 ? T.bad : T.text3, fontWeight: 600 }}>
            {s.total ? `−${s.maxDrawdownR.toFixed(1)}R` : '—'}
          </span>
          {' · серія '}
          <span style={{ color: T.text, fontWeight: 600 }}>
            {s.bestWinStreak ? `${s.bestWinStreak}W` : '—'}
          </span>
        </span>

        {/* Дії й стрілка стоять упритул: прихована кнопка не просто
            гасне, а стискається до нульової ширини разом із відступом.
            Раніше вона лишала по собі дірку, і між лінком та стрілкою
            зяяв простір, якого ніхто не замовляв.

            Порядок — видалення, лінк, стрілка: рідкісна й небезпечна
            дія найдалі від стрілки, якою картку відкривають. */}
        <span className="flex shrink-0 items-center">
          {onDelete && !session.demo && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(session); }}
              title="Видалити бектест"
              className="grid h-[26px] w-0 place-items-center overflow-hidden rounded-lg opacity-0 transition-all duration-200 group-hover:mr-1.5 group-hover:w-[26px] group-hover:opacity-100"
              style={{ color: T.text3 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'transparent'; }}
            >
              <Trash2 size={13} strokeWidth={2.2} />
            </button>
          )}

          {/* Поділитись просто зі списку: щоб кинути комусь прогін,
              не треба заходити в нього й шукати кнопку всередині.
              Відкритий прогін світить лінком завжди — так видно, що
              ним уже поділились. */}
          {onShare && !session.demo && (
            <button
              onClick={(e) => { e.stopPropagation(); onShare(session); }}
              title={session.is_public ? 'Скопіювати лінк' : 'Відкрити доступ і скопіювати лінк'}
              disabled={sharing}
              className={`grid h-[26px] place-items-center overflow-hidden rounded-lg transition-all duration-200 ${
                session.is_public
                  ? 'mr-2 w-[26px]'
                  : 'w-0 opacity-0 group-hover:mr-2 group-hover:w-[26px] group-hover:opacity-100'
              }`}
              style={{ color: session.is_public ? ACT.tint : T.text3 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = ACT.tint; e.currentTarget.style.background = act(0.12); }}
              onMouseLeave={(e) => { e.currentTarget.style.color = session.is_public ? ACT.tint : T.text3; e.currentTarget.style.background = 'transparent'; }}
            >
              {sharing
                ? <Loader2 size={13} strokeWidth={2.6} className="animate-spin" />
                : <Link2 size={13} strokeWidth={2.2} />}
            </button>
          )}

          <ArrowRight
            size={16}
            strokeWidth={1.9}
            className="transition-transform duration-300 group-hover:translate-x-1"
            style={{ color: '#9b8dff' }}
          />
        </span>
      </div>
    </motion.article>
  );
}
