import {
  Area, AreaChart, Bar, BarChart, Cell, CartesianGrid, ComposedChart, Line,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip as RTooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import {
  Activity, ArrowDownRight, CalendarDays, ChartColumn, Clock, Crosshair,
  Flame, Layers, ShieldCheck, Target, Timer, TrendingUp,
} from 'lucide-react';
import { F, P } from '../overview/theme';
import { r1, r2, signed, sum } from '../data';

/* ==================================================================
   Бібліотека віджетів «Перформансу».

   Той самий формат, що в огляді, і та сама дошка під ним: додати,
   прибрати, переставити, розтягнути, налаштувати кожен окремо.
   Різниця тільки у вмісті — тут не «як справи», а «чому саме так».

   Три розрізи, яких у продукті не було й через які половина панелей
   нічого не пояснювала:

   • ковзне очікування — підсумкове число однакове і в того, хто
     вчиться, і в того, хто повільно віддає зароблене торік;
   • залежність від крайніх угод — якщо без пʼяти найкращих результат
     відʼємний, це поки не система;
   • ланцюг збитків — скільки коштує кожен наступний вхід після
     мінуса. Тут зазвичай і живе найдешевше виправлення.
================================================================== */

/* ---------- спільне ---------- */

const AX = {
  axisLine: false, tickLine: false,
  tick: { fontSize: 10.5, fill: P.text5, fontFamily: F.mono },
};

const TIP = {
  contentStyle: {
    background: 'rgba(10,10,15,.94)', border: `1px solid ${P.lineHover}`, borderRadius: 12,
    fontFamily: F.sans, fontSize: 12, padding: '9px 12px',
    boxShadow: '0 18px 40px -16px rgba(0,0,0,.9)',
  },
  labelStyle: { color: P.text5, fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 4 },
  itemStyle: { color: P.text2 },
};

const grid = () => <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(var(--edge-hair-rgb),0.04)" />;

/* Висота графіка більше не константа й не налаштування: віджет
   розтягується під плитку, а плитці розмір задає людина. */
const metricOption = (def = 'net') => ({
  label: 'Показник',
  choices: [['net', 'Сума R'], ['avg', 'Середня угода'], ['wr', 'Вінрейт']],
  def,
});
const fmtBy = (key) => (v) => (key === 'wr' ? `${v}%` : `${signed(v, key === 'avg' ? 2 : 1)}R`);

function Empty({ children }) {
  return (
    <div
      style={{
        display: 'grid', placeItems: 'center', minHeight: 150, textAlign: 'center',
        fontFamily: F.sans, fontSize: 12.5, color: P.text5, padding: '10px 6px',
      }}
    >
      {children}
    </div>
  );
}

/* Число з розкладом. Такий самий каркас, як у KPI огляду: у вузькій
   картці — саме число, у ширшій із простору виростає пояснення. */
function Kpi({ value, color, facts = [], w = 1 }) {
  const wide = w >= 2 && facts.length > 0;

  return (
    <div style={{ display: 'flex', gap: 18, minHeight: 96 }}>
      <div style={{ flex: wide ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
        <b style={{ fontFamily: F.mono, fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color }}>
          {value}
        </b>
      </div>

      <div
        style={{
          flex: 1, alignSelf: 'center', display: 'grid', gap: '6px 14px',
          gridTemplateColumns: wide && w >= 3 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
        }}
      >
        {facts.slice(0, wide && w >= 3 ? 4 : 2).map(([k, v]) => (
          <Fact key={k} label={k} value={v} />
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <span className="perf-fact" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0' }}>
      <span style={{ fontFamily: F.sans, fontSize: 11, color: P.text5, whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(var(--edge-hair-rgb),0.05)' }} />
      <b style={{ fontFamily: F.mono, fontSize: 12.5, fontWeight: 700, color: P.text2, whiteSpace: 'nowrap' }}>{value}</b>
    </span>
  );
}

/* ---------- обчислення ---------- */

const rollingSeries = (trades, win) => {
  if (trades.length < win) return [];
  return trades.slice(win - 1).map((_, i) => {
    const slice = trades.slice(i, i + win);
    const wins = slice.filter((x) => x.result === 'WIN').length;
    const losses = slice.filter((x) => x.result === 'LOSS').length;
    return {
      n: i + win,
      exp: +(sum(slice.map((x) => x.rr)) / win).toFixed(3),
      wr: wins + losses ? Math.round((wins / (wins + losses)) * 100) : 0,
    };
  });
};

const outlierSeries = (trades) => {
  const sorted = [...trades].sort((a, b) => b.rr - a.rr);
  const cut = (n, from) => {
    const drop = new Set(from === 'top' ? sorted.slice(0, n) : sorted.slice(-n));
    return +sum(trades.filter((t) => !drop.has(t)).map((t) => t.rr)).toFixed(1);
  };
  return [1, 3, 5].map((n) => ({
    n: `${n}`,
    noTop: trades.length > n ? cut(n, 'top') : 0,
    noWorst: trades.length > n ? cut(n, 'bottom') : 0,
  }));
};

/* ==================================================================
   РЕЄСТР
================================================================== */

export const PERF_WIDGETS = {

  /* ---------- числа ---------- */

  expectancy: {
    title: 'Очікування',
    hint: 'Скільки в середньому приносить одна угода',
    icon: Target, group: 'Числа', tone: 'var(--edge-acc)', shape: 'number', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => {
      const timed = s.trades.filter((t) => typeof t.holdMin === 'number');
      const avgHold = timed.length ? Math.round(sum(timed.map((t) => t.holdMin)) / timed.length) : null;
      return (
        <Kpi
          w={w} color="var(--edge-acc)" value={`${signed(s.expectancy, 2)}R`}
          facts={[
            ['угод', String(s.trades.length)],
            ['утримання', avgHold === null ? '—' : `${avgHold} хв`],
            ['профіт-фактор', r2(s.pf)],
            ['вінрейт', `${s.wr}%`],
          ]}
        />
      );
    },
  },

  avgwin: {
    title: 'Середній плюс',
    hint: 'І скільки коштує середній мінус',
    icon: TrendingUp, group: 'Числа', tone: P.ok, shape: 'number', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => (
      <Kpi
        w={w} color={P.ok} value={`${signed(s.avgWin, 2)}R`}
        facts={[
          ['середній мінус', `${r2(s.avgLoss)}R`],
          ['профіт-фактор', r2(s.pf)],
          ['виграшів', String(s.wins.length)],
          ['програшів', String(s.losses.length)],
        ]}
      />
    ),
  },

  drawdown: {
    title: 'Макс. просадка',
    hint: 'Найглибше дно й наскільки швидко з нього виходиш',
    icon: ArrowDownRight, group: 'Числа', tone: P.bad, shape: 'dip', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => (
      <Kpi
        w={w} color={P.bad} value={`${r1(s.maxDD)}R`}
        facts={[
          ['відновлення', `×${r2(s.recovery)}`],
          ['серія мінусів', String(s.worstL)],
          ['чистий R', `${signed(s.net)}R`],
          ['угод', String(s.trades.length)],
        ]}
      />
    ),
  },

  discipline: {
    title: 'Дисципліна',
    hint: 'Частка угод за планом і ціна порушень',
    icon: ShieldCheck, group: 'Числа', tone: P.ok, shape: 'gauge', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => (
      <Kpi
        w={w} color={s.adherence >= 70 ? P.ok : P.warn} value={`${s.adherence}%`}
        facts={[
          ['угод з помилкою', `${s.mistakeRate}%`],
          ['ціна тільта', `${r1(s.tiltCost)}R`],
          ['серія плюсів', String(s.bestW)],
          ['чистих поспіль', String(s.cleanStreak)],
        ]}
      />
    ),
  },

  /* ---------- динаміка ---------- */

  rolling: {
    title: 'Куди рухається перевага',
    hint: 'Ковзне очікування за останні N угод',
    icon: Timer, group: 'Динаміка', tone: 'var(--edge-acc)', shape: 'curve', defaultW: 4, defaultH: 2,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      win: { label: 'Вікно', choices: [['5', '5'], ['10', '10'], ['20', '20'], ['30', '30']], def: '10' },
      metric: { label: 'Показник', choices: [['exp', 'Очікування'], ['wr', 'Вінрейт']], def: 'exp' },
    },
    render: ({ s, o, id }) => {
      const rows = rollingSeries(s.trades, Number(o.win) || 10);
      if (!rows.length) return <Empty>Замало угод для вікна — ще трохи журналу, і крива зʼявиться</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`pw-roll-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--edge-acc)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--edge-acc)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid()}
              <XAxis dataKey="n" {...AX} minTickGap={28} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip
                {...TIP}
                labelFormatter={(v) => `угода ${v}`}
                formatter={(v) => [o.metric === 'wr' ? `${v}%` : `${signed(v, 2)}R`, o.metric === 'wr' ? 'Вінрейт' : 'Очікування']}
              />}
              {o.metric === 'exp' && <ReferenceLine y={0} stroke={P.lineHover} />}
              <Area
                type="monotone" dataKey={o.metric} stroke="var(--edge-acc)" strokeWidth={2.4}
                fill={`url(#pw-roll-${id})`}
                activeDot={{ r: 4, fill: 'var(--edge-acc)', stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
                isAnimationActive animationDuration={520}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  outliers: {
    title: 'Залежність від крайніх угод',
    hint: 'Що лишиться, якщо прибрати найкращі або найгірші',
    icon: Crosshair, group: 'Динаміка', tone: 'var(--edge-warn)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => {
      if (s.trades.length <= 5) return <Empty>Треба хоча б шість угод</Empty>;
      const rows = outlierSeries(s.trades);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="n" {...AX} tickFormatter={(v) => `−${v}`} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip
                {...TIP}
                labelFormatter={(v) => `прибрано ${v} угод`}
                formatter={(v, n) => [`${signed(v)}R`, n]}
                cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }}
              />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <ReferenceLine y={s.net} stroke="var(--edge-warn)" strokeDasharray="4 4" strokeOpacity={0.55} />
              <Bar dataKey="noTop" name="без найкращих" fill={P.bad} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={32} />
              <Bar dataKey="noWorst" name="без найгірших" fill={P.ok} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  chain: {
    title: 'Ланцюг збитків',
    hint: 'Скільки приносить вхід після одного, двох і трьох мінусів',
    icon: Flame, group: 'Динаміка', tone: P.bad, shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => {
      const rows = (s.chain || []).filter((c) => c.n > 0);
      if (!rows.length) return <Empty>Ланцюгів збитків у журналі ще немає</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="depth" {...AX} tick={{ ...AX.tick, fontSize: 9.5 }} interval={0} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [`${signed(v, 2)}R · ${p.payload.n} угод`, 'Середня']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Bar dataKey="avg" radius={[5, 5, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={420}>
                {rows.map((c) => <Cell key={c.depth} fill={c.avg >= 0 ? P.ok : P.bad} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  underwater: {
    title: 'Просадка',
    hint: 'Наскільки глибоко й надовго рахунок ішов під воду',
    icon: ArrowDownRight, group: 'Динаміка', tone: P.bad, shape: 'dip', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o, id }) => (
      <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
        <ResponsiveContainer>
          <AreaChart data={s.equity} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id={`pw-dd-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={P.bad} stopOpacity={0} />
                <stop offset="100%" stopColor={P.bad} stopOpacity={0.42} />
              </linearGradient>
            </defs>
            {grid()}
            <XAxis dataKey="date" {...AX} minTickGap={34} />
            <YAxis {...AX} />
            {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [`${r1(v)}R`, 'Просадка']} />}
            <Area
              type="monotone" dataKey="dd" stroke={P.bad} strokeWidth={2} fill={`url(#pw-dd-${id})`}
              activeDot={{ r: 4, fill: P.bad, stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
              isAnimationActive animationDuration={520}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    ),
  },

  /* ---------- розрізи ---------- */

  dow: {
    title: 'Дні тижня',
    hint: 'У які дні торгівля приносить найбільше',
    icon: CalendarDays, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' }, metric: metricOption('avg') },
    render: ({ s, o }) => {
      const rows = s.byDow.filter((x) => x.trades);
      if (!rows.length) return <Empty>Днів з угодами ще немає</Empty>;
      const fmt = fmtBy(o.metric);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="day" {...AX} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [`${fmt(v)} · ${p.payload.trades} угод`, 'Результат']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Bar dataKey={o.metric} radius={[5, 5, 0, 0]} maxBarSize={44} isAnimationActive animationDuration={420}>
                {rows.map((x) => <Cell key={x.day} fill={x[o.metric] >= 0 ? 'var(--edge-acc)' : P.bad} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  sessions: {
    title: 'Сесії',
    hint: 'Скільки платить кожна торгова сесія',
    icon: Clock, group: 'Розрізи', tone: 'var(--edge-ok)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' }, metric: metricOption('net') },
    render: ({ s, o }) => {
      const rows = s.bySession.filter((x) => x.trades);
      if (!rows.length) return <Empty>Сесії ще не набрали угод</Empty>;
      const fmt = fmtBy(o.metric);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="session" {...AX} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [`${fmt(v)} · ${p.payload.trades} угод`, 'Результат']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Bar dataKey={o.metric} radius={[5, 5, 0, 0]} maxBarSize={54} isAnimationActive animationDuration={420}>
                {rows.map((x) => <Cell key={x.session} fill={x[o.metric] >= 0 ? 'var(--edge-ok)' : P.bad} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  hours: {
    title: 'Години входу',
    hint: 'О котрій годині рахунок росте, а о котрій тане',
    icon: Clock, group: 'Розрізи', tone: 'var(--edge-info)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => {
      const rows = s.byHour.filter((h) => h.trades);
      if (!rows.length) return <Empty>Час входу ще не проставлений в угодах</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="hour" {...AX} interval="preserveStartEnd" />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [`${signed(v)}R · ${p.payload.trades} угод`, 'Результат']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Bar dataKey="net" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={420}>
                {rows.map((h) => <Cell key={h.hour} fill={h.net >= 0 ? 'var(--edge-info)' : P.bad} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  distribution: {
    title: 'Розподіл R-множників',
    hint: 'Форма результатів: де густо, а де хвіст',
    icon: ChartColumn, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => (
      <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
        <ResponsiveContainer>
          <BarChart data={s.buckets} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
            {grid()}
            <XAxis dataKey="name" {...AX} tick={{ ...AX.tick, fontSize: 9.5 }} interval={0} />
            <YAxis {...AX} allowDecimals={false} />
            {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [`${v} угод`, 'Кількість']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
            <Bar dataKey="value" radius={[5, 5, 0, 0]} isAnimationActive animationDuration={420}>
              {s.buckets.map((b) => <Cell key={b.name} fill={b.color} fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    ),
  },

  hold: {
    title: 'Час утримання проти результату',
    hint: 'Ліворуч збитки — виходиш рано; праворуч — тримаєш надію',
    icon: Timer, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'number', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => {
      const rows = s.trades
        .filter((t) => typeof t.holdMin === 'number')
        .map((t) => ({ hold: t.holdMin, rr: t.rr, z: Math.abs(t.rr) + 1 }));
      if (!rows.length) return <Empty>Час утримання ще не рахується — заповни час входу й виходу</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <ScatterChart margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis type="number" dataKey="hold" name="хв" {...AX} />
              <YAxis type="number" dataKey="rr" name="R" {...AX} />
              <ZAxis type="number" dataKey="z" range={[24, 130]} />
              {o.tip !== 'off' && <RTooltip
                {...TIP}
                cursor={{ strokeDasharray: '3 3', stroke: P.lineHover }}
                formatter={(v, n) => [n === 'R' ? `${signed(v, 2)}R` : `${v} хв`, n === 'R' ? 'Результат' : 'Утримання']}
              />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Scatter data={rows} isAnimationActive animationDuration={420}>
                {rows.map((p, i) => <Cell key={i} fill={p.rr >= 0 ? P.ok : P.bad} fillOpacity={0.55} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  months: {
    title: 'По місяцях',
    hint: 'Чистий R стовпцями і вінрейт лінією поверх',
    icon: Layers, group: 'Розрізи', tone: P.ok, shape: 'bars', defaultW: 4, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' } },
    render: ({ s, o }) => {
      if (!s.byMonth.length) return <Empty>Місяців з угодами ще немає</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={s.byMonth.map((m) => ({ m: m.key, net: m.net, wr: m.wr, trades: m.trades }))}
              margin={{ top: 8, right: 6, left: -20, bottom: 0 }}
            >
              {grid()}
              <XAxis dataKey="m" {...AX} />
              <YAxis yAxisId="l" {...AX} />
              <YAxis yAxisId="r" orientation="right" {...AX} domain={[0, 100]} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n) => [n === 'Вінрейт' ? `${v}%` : `${signed(v)}R`, n]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine yAxisId="l" y={0} stroke={P.lineHover} />
              <Bar yAxisId="l" dataKey="net" name="Чистий R" radius={[5, 5, 0, 0]} maxBarSize={54} isAnimationActive animationDuration={420}>
                {s.byMonth.map((m) => <Cell key={m.key} fill={m.net >= 0 ? P.ok : P.bad} fillOpacity={0.8} />)}
              </Bar>
              <Line
                yAxisId="r" type="monotone" dataKey="wr" name="Вінрейт" stroke="var(--edge-acc)" strokeWidth={2.4}
                dot={{ r: 3, fill: 'var(--edge-acc)' }} activeDot={{ r: 5, fill: 'var(--edge-acc)', stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  equity: {
    title: 'Крива еквіті',
    hint: 'Накопичений результат за весь період',
    icon: TrendingUp, group: 'Динаміка', tone: 'var(--edge-acc)', shape: 'curve', defaultW: 4, defaultH: 2,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      view: { label: 'Вигляд', choices: [['area', 'Площа'], ['line', 'Лінія']], def: 'area' },
    },
    render: ({ s, o, id }) => {
      if (!s.equity.length) return <Empty>Ще нема жодної угоди в цьому періоді</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={s.equity} margin={{ top: 8, right: 6, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={`pw-eq-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--edge-acc)" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="var(--edge-acc)" stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid()}
              <XAxis dataKey="date" {...AX} minTickGap={36} />
              <YAxis {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [`${signed(v, 2)}R`, 'Еквіті']} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Area
                type="monotone" dataKey="value" stroke="var(--edge-acc)" strokeWidth={2.6}
                fill={o.view === 'line' ? 'none' : `url(#pw-eq-${id})`}
                activeDot={{ r: 4, fill: 'var(--edge-acc)', stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
                isAnimationActive animationDuration={520}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  emotions: {
    title: 'Стан проти результату',
    hint: 'Наскільки емоція множить або ділить результат',
    icon: Activity, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'rows', defaultW: 2, defaultH: 2,
    options: { tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' }, metric: metricOption('avg') },
    render: ({ s, o }) => {
      const rows = (s.emotionStats || []).filter((e) => e.trades);
      if (!rows.length) return <Empty>Стани ще не проставлені в угодах</Empty>;
      const fmt = fmtBy(o.metric);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <XAxis type="number" {...AX} />
              <YAxis type="category" dataKey="emotion" {...AX} width={68} tickFormatter={(v) => ({ calm: 'Спокій', confident: 'Впевненість', anxious: 'Тривога', tilt: 'Тільт', fomo: 'FOMO' }[v] || v)} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [`${fmt(v)} · ${p.payload.trades} угод`, 'Результат']} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine x={0} stroke={P.lineHover} />
              <Bar dataKey={o.metric} radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive animationDuration={420}>
                {rows.map((e) => <Cell key={e.emotion} fill={e[o.metric] >= 0 ? P.ok : P.bad} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },
};

/* Розкладка за замовчуванням: чотири числа рядком, під ними крива
   напрямку на всю ширину, далі розрізи парами. Порядок від
   загального до дрібного — так само, як читають графіки. */
export const PERF_DEFAULT = [
  { id: 'expectancy', h: 1, w: 1 },
  { id: 'avgwin', h: 1, w: 1 },
  { id: 'drawdown', h: 1, w: 1 },
  { id: 'discipline', h: 1, w: 1 },
  { id: 'rolling', h: 2, w: 4 },
  { id: 'dow', h: 2, w: 2 },
  { id: 'sessions', h: 2, w: 2 },
  { id: 'outliers', h: 2, w: 2 },
  { id: 'chain', h: 2, w: 2 },
  { id: 'distribution', h: 2, w: 2 },
  { id: 'underwater', h: 2, w: 2 },
  { id: 'hours', h: 2, w: 2 },
  { id: 'hold', h: 2, w: 2 },
  { id: 'months', h: 2, w: 4 },
];
