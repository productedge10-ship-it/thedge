import {
  Area, AreaChart, Bar, BarChart, Cell, CartesianGrid, ComposedChart, Line,
  ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, ArrowDownRight, CalendarDays, ChartColumn, Clock, Crosshair,
  Flame, Layers, ShieldCheck, Target, Timer, TrendingUp,
} from 'lucide-react';
import { F, P, ZERO_DOMAIN } from '../overview/theme';
import { EMOTION_COLOR, EMOTION_LABEL, EMOTIONS, r1, r2, signed, sum } from '../data';
import { t as tx } from '../../../lib/lang';
import ReviewProgress from '../../ui/ReviewProgress';

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
  label: tx('Показник', 'Metric'),
  choices: [['net', tx('Сума R', 'Total R')], ['avg', tx('Середня угода', 'Average trade')], ['wr', tx('Вінрейт', 'Win rate')]],
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

/* Одна точка не малює лінію — Recharts лишає самотню крапку в
   порожній області, а вісь під неї підбирає випадковий діапазон.
   Той самий прийом, що в Огляді: кардіомонітор замість зламаного
   графіка — тьмяна нитка ЕКГ із піком на єдиній реальній точці, і
   світлова хвиля, що постійно її прочісує, як прилад у пошуку
   сигналу. Живіше за просту риску й одразу зрозуміло, чому порожньо. */
function Building({ color, label, w = 84, h = 30 }) {
  const wave = 'M2,21 L30,21 L37,7 L44,29 L51,13 L58,21 L82,21';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: '100%' }}>
      <svg width={w} height={h} viewBox="0 0 84 30" style={{ display: 'block', overflow: 'visible' }}>
        <path d={wave} fill="none" stroke={color} strokeOpacity="0.24" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={wave} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" pathLength="100" strokeDasharray="16 130" opacity="0.95">
          <animate attributeName="stroke-dashoffset" values="100;-100" dur="2.6s" repeatCount="indefinite" />
        </path>
        {/* Точка «зараз» стоїть у кінці нитки, а не десь на піку —
           так само, як на кожному справжньому графіку live-курсор
           сидить на останній секунді, а не посеред форми. */}
        <circle cx="82" cy="21" r="3" fill={color}>
          <animate attributeName="r" values="3;4.4;3" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.55;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
      </svg>
      {label && (
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: P.text5, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* Той самий прилад, тільки мовою стовпчиків: примарні бруски
   «дихають» хвилею зліва направо, ніби еквалайзер чекає на сигнал. */
function BuildingBars({ color, label }) {
  const bars = [8, 14, 10, 18, 12, 16, 9];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: '100%' }}>
      <svg width={108} height={34} viewBox="0 0 108 34" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" y1="30" x2="108" y2="30" stroke={color} strokeOpacity="0.14" strokeWidth="1" />
        {bars.map((h, i) => (
          <rect key={i} x={i * 15.4 + 3} y={30 - h} width="9" height={h} rx="2.5" fill={color} opacity="0.2">
            <animate attributeName="opacity" values="0.16;0.55;0.16" dur="1.8s" begin={`${i * 0.14}s`} repeatCount="indefinite" />
          </rect>
        ))}
      </svg>
      {label && (
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: P.text5, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* І мовою розсіювання: примарні кола там, де колись ляжуть точки,
   і одна жива в центрі — пульсує, як радар у пошуку цілі. */
function BuildingScatter({ color, label }) {
  const dots = [[16, 22], [30, 9], [46, 24], [62, 12], [78, 21], [92, 8]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', height: '100%' }}>
      <svg width={108} height={34} viewBox="0 0 108 34" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" y1="17" x2="108" y2="17" stroke={color} strokeOpacity="0.12" strokeWidth="1" strokeDasharray="2 4" />
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.6" fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="1.2" />
        ))}
        {/* Радар-пінг: кільце, що розходиться й тане, — рух у просторі
           видно одразу, на відміну від попередньої версії, де жива
           крапка просто ледь дихала радіусом на місці й губилась. */}
        <circle cx="54" cy="17" r="3" fill="none" stroke={color} strokeWidth="1.4">
          <animate attributeName="r" values="3;12" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx="54" cy="17" r="3.4" fill={color}>
          <animate attributeName="r" values="3.4;4.6;3.4" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
      {label && (
        <span style={{ fontFamily: F.sans, fontSize: 12.5, color: P.text5, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
          {label}
        </span>
      )}
    </div>
  );
}

/* Recharts анімує розсіювання, лише збільшуючи радіус крапки — на
   3–4px це непомітно, і виглядає так, ніби анімації нема взагалі.
   Тому крапки малюємо самі: кожна виринає власною SMIL-анімацією —
   з нуля, з легким перельотом за розмір і появою прозорості, із
   невеликим зсувом одна за одною. isAnimationActive на Scatter
   вимкнено навмисно — інакше Recharts паралельно смикав би size і
   бив би по нашій <animate>. */
function AnimatedScatterDot(p) {
  const r = p.size != null ? Math.sqrt(Math.max(p.size, 0) / Math.PI) : 3;
  const begin = `${(p.index || 0) * 0.03}s`;
  return (
    <circle cx={p.cx} cy={p.cy} r={0} fill={p.fill} fillOpacity={p.fillOpacity}>
      <animate attributeName="r" values={`0;${r * 1.4};${r}`} keyTimes="0;0.65;1" dur=".5s" begin={begin} fill="freeze" />
      <animate attributeName="opacity" values="0;1" dur=".32s" begin={begin} fill="freeze" />
    </circle>
  );
}

/* Число з розкладом. Такий самий каркас, як у KPI огляду: у вузькій
   картці — саме число, у ширшій із простору виростає пояснення. */
function Kpi({ value, color, facts = [], w = 1 }) {
  const wide = w >= 2 && facts.length > 0;

  return (
    <div style={{ display: 'flex', gap: 18, minHeight: 96 }}>
      <div style={{ flex: wide ? '0 0 auto' : 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 12 }}>
        <b style={{ fontFamily: F.mono, fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color }}>
          {value}
        </b>
      </div>

      <div
        style={{
          flex: 1, alignSelf: 'flex-start', display: 'grid', gap: '6px 14px',
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

/* Класична KPI-картка з дошки до переходу на віджети: велике число,
   підписані підрядки й жива крива внизу замість таблиці фактів.
   Заголовок і шестерня налаштувань лишились у шапці картки — тут
   тільки вміст, який людина впізнає з попередньої версії розділу. */
function ClassicKpi({ id, value, subtext, subStats = [], color, data, dataKey }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 0 }}>
      <div>
        <b style={{ fontFamily: F.mono, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color }}>
          {value}
        </b>
        {subtext && (
          <div style={{ marginTop: 6, fontFamily: F.sans, fontSize: 11, fontWeight: 600, color: P.text5 }}>
            {subtext}
          </div>
        )}
      </div>

      {subStats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {subStats.map((st) => (
            <span key={st.label} style={{ fontFamily: F.sans, fontSize: 11, color: P.text5 }}>
              {st.label}: <b style={{ color: P.text2, fontWeight: 700 }}>{st.val}</b>
            </span>
          ))}
        </div>
      )}

      {data && data.length > 1 && (
        <div style={{ flex: 1, minHeight: 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id={`pk-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#pk-${id})`} isAnimationActive animationDuration={900} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {data && data.length === 1 && (
        <div style={{ flex: 1, minHeight: 28 }}>
          <Building color={color} w={56} h={22} />
        </div>
      )}
    </div>
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
    title: tx('Очікування', 'Expectancy'),
    hint: tx('Скільки в середньому приносить одна угода', 'How much one trade makes on average'),
    icon: Target, group: 'Числа', tone: 'var(--edge-acc)', shape: 'number', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, id }) => {
      const timed = s.trades.filter((t) => typeof t.holdMin === 'number');
      const avgHold = timed.length ? Math.round(sum(timed.map((t) => t.holdMin)) / timed.length) : null;
      return (
        <ClassicKpi
          id={id} color="var(--edge-acc)" value={`${signed(s.expectancy, 2)}R`}
          subtext={tx('на кожну угоду', 'per trade')}
          subStats={[{ label: tx('Сер. утримання', 'Avg hold'), val: avgHold === null ? '—' : tx(`${avgHold} хв`, `${avgHold} min`) }]}
          data={s.equity} dataKey="value"
        />
      );
    },
  },

  avgwin: {
    title: tx('Середній плюс', 'Average win'),
    hint: tx('І скільки коштує середній мінус', 'And what an average loss costs'),
    icon: TrendingUp, group: 'Числа', tone: P.ok, shape: 'number', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, id }) => (
      <ClassicKpi
        id={id} color={P.ok} value={`${signed(s.avgWin, 2)}R`}
        subStats={[{ label: tx('Середній мінус', 'Average loss'), val: `${r2(s.avgLoss)}R` }]}
        data={s.trades.slice(-20)} dataKey="rr"
      />
    ),
  },

  drawdown: {
    title: tx('Макс. просадка', 'Max drawdown'),
    hint: tx('Найглибше дно й наскільки швидко з нього виходиш', 'The deepest low and how fast you recover from it'),
    icon: ArrowDownRight, group: 'Числа', tone: P.bad, shape: 'dip', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, id }) => (
      <ClassicKpi
        id={id} color={P.bad} value={`${r1(s.maxDD)}R`}
        subStats={[{ label: tx('Фактор відновл.', 'Recovery factor'), val: `${r1(s.recovery)}×` }]}
        data={s.equity} dataKey="dd"
      />
    ),
  },

  streak: {
    title: tx('Серія плюсів', 'Win streak'),
    hint: tx('Найдовша серія виграшів поспіль і що коштують помилки', 'Your longest winning streak and what mistakes cost'),
    icon: ShieldCheck, group: 'Числа', tone: 'var(--edge-acc)', shape: 'gauge', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, id }) => (
      <ClassicKpi
        id={id} color="var(--edge-acc)" value={String(s.bestW)}
        subStats={[
          { label: tx('Серія мінусів', 'Losing streak'), val: String(s.worstL) },
          { label: tx('Помилки', 'Mistakes'), val: s.mistakeRate === null ? '—' : `${s.mistakeRate}%` },
        ]}
        data={s.byMonth} dataKey="wr"
      />
    ),
  },

  discipline: {
    title: tx('Дисципліна', 'Discipline'),
    hint: tx('Частка угод за планом і ціна порушень', 'Share of trades by plan and the cost of breaking it'),
    icon: ShieldCheck, group: 'Числа', tone: P.ok, shape: 'gauge', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => (!s.reviewOk ? <Empty><ReviewProgress reviewed={s.reviewed} /></Empty> : (
      <Kpi
        w={w} color={s.adherence >= 70 ? P.ok : P.warn} value={`${s.adherence}%`}
        facts={[
          [tx('угод з помилкою', 'trades with mistakes'), `${s.mistakeRate}%`],
          [tx('ціна тільта', 'cost of tilt'), `${r1(s.tiltCost)}R`],
          [tx('серія плюсів', 'win streak'), String(s.bestW)],
          [tx('чистих поспіль', 'clean in a row'), String(s.cleanStreak)],
        ]}
      />
    )),
  },

  /* ---------- динаміка ---------- */

  rolling: {
    title: tx('Куди рухається перевага', 'Where your edge is heading'),
    hint: tx('Ковзне очікування за останні N угод', 'Rolling expectancy over the last N trades'),
    icon: Timer, group: 'Динаміка', tone: 'var(--edge-acc)', shape: 'curve', defaultW: 4, defaultH: 2,
    /* Вікно за замовчуванням — 10 угод: саме стільки треба, щоб
       крива взагалі мала перший рядок (rollingSeries повертає []
       коли угод менше за вікно). Додати картку, яка одразу скаже
       «замало угод», — той самий випадок, що й із сетапами. */
    ready: (s) => (s.trades || []).length >= 10,
    lockedHint: tx('Назбирай хоча б 10 угод — і крива стане доступною', 'Log at least 10 trades to unlock the curve'),
    options: {
      tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' },
      win: { label: tx('Вікно', 'Window'), choices: [['5', '5'], ['10', '10'], ['20', '20'], ['30', '30']], def: '10' },
      metric: { label: tx('Показник', 'Metric'), choices: [['exp', tx('Очікування', 'Expectancy')], ['wr', tx('Вінрейт', 'Win rate')]], def: 'exp' },
    },
    render: ({ s, o, id }) => {
      const rows = rollingSeries(s.trades, Number(o.win) || 10);
      if (!rows.length) return <Empty>{tx('Замало угод для вікна — ще трохи журналу, і крива зʼявиться', 'Not enough trades for the window — journal a bit more and the curve will appear')}</Empty>;

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
                labelFormatter={(v) => tx(`угода ${v}`, `trade ${v}`)}
                formatter={(v) => [o.metric === 'wr' ? `${v}%` : `${signed(v, 2)}R`, o.metric === 'wr' ? tx('Вінрейт', 'Win rate') : tx('Очікування', 'Expectancy')]}
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
    title: tx('Залежність від крайніх угод', 'Dependence on outlier trades'),
    hint: tx('Що лишиться, якщо прибрати найкращі або найгірші', "What's left if you remove the best or worst trades"),
    icon: Crosshair, group: 'Динаміка', tone: 'var(--edge-warn)', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => (s.trades || []).length > 5,
    lockedHint: tx('Назбирай хоча б 6 угод — і розклад стане доступним', 'Log at least 6 trades to unlock this breakdown'),
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => {
      if (s.trades.length <= 5) return <Empty>{tx('Треба хоча б шість угод', 'You need at least six trades')}</Empty>;
      const rows = outlierSeries(s.trades);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="n" {...AX} tickFormatter={(v) => `−${v}`} />
              <YAxis domain={ZERO_DOMAIN} {...AX} />
              {o.tip !== 'off' && <RTooltip
                {...TIP}
                labelFormatter={(v) => tx(`прибрано ${v} угод`, `${v} ${Number(v) === 1 ? 'trade' : 'trades'} removed`)}
                formatter={(v, n) => [`${signed(v)}R`, n]}
                cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }}
              />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <ReferenceLine y={s.net} stroke="var(--edge-warn)" strokeDasharray="4 4" strokeOpacity={0.55} />
              <Bar dataKey="noTop" name={tx('без найкращих', 'without best')} fill={P.bad} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={32} />
              <Bar dataKey="noWorst" name={tx('без найгірших', 'without worst')} fill={P.ok} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  chain: {
    title: tx('Ланцюг збитків', 'Loss chain'),
    hint: tx('Скільки приносить вхід після одного, двох і трьох мінусів', 'What an entry makes after one, two, and three losses'),
    icon: Flame, group: 'Динаміка', tone: P.bad, shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => {
      const rows = (s.chain || []).filter((c) => c.n > 0);
      if (!rows.length) return <Empty>{tx('Ланцюгів збитків у журналі ще немає', 'No loss chains in your journal yet')}</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="depth" {...AX} tick={{ ...AX.tick, fontSize: 9.5 }} interval={0} />
              <YAxis domain={ZERO_DOMAIN} {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [tx(`${signed(v, 2)}R · ${p.payload.n} угод`, `${signed(v, 2)}R · ${p.payload.n} ${p.payload.n === 1 ? 'trade' : 'trades'}`), tx('Середня', 'Average')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
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
    title: tx('Просадка (underwater)', 'Drawdown (underwater)'),
    hint: tx('Наскільки глибоко й надовго рахунок ішов під воду', 'How deep and how long the account stayed underwater'),
    icon: ArrowDownRight, group: 'Динаміка', tone: P.bad, shape: 'dip', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o, id }) => {
      if (s.equity.length < 2) {
        return (
          <div style={{ display: 'flex', flex: 1, minHeight: 120 }}>
            <Building
              color={P.bad}
              w={130} h={46}
              label={s.equity.length ? tx('Просадка порахується, щойно набереться кілька угод', 'Drawdown will be calculated once you have a few trades') : tx('Ще нема жодної угоди в цьому періоді', 'No trades in this period yet')}
            />
          </div>
        );
      }

      return (
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
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [`${r1(v)}R`, tx('Просадка', 'Drawdown')]} />}
              <Area
                type="monotone" dataKey="dd" stroke={P.bad} strokeWidth={2} fill={`url(#pw-dd-${id})`}
                activeDot={{ r: 4, fill: P.bad, stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
                isAnimationActive animationDuration={520}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  /* ---------- розрізи ---------- */

  dow: {
    title: tx('Дні тижня', 'Days of the week'),
    hint: tx('У які дні торгівля приносить найбільше', 'Which days make you the most'),
    icon: CalendarDays, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' }, metric: metricOption('avg') },
    render: ({ s, o }) => {
      const rows = s.byDow.filter((x) => x.trades);
      if (!rows.length) return <Empty>{tx('Днів з угодами ще немає', 'No days with trades yet')}</Empty>;
      const fmt = fmtBy(o.metric);
      const best = [...rows].sort((a, b) => b[o.metric] - a[o.metric])[0];

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 }}>
          {best && (
            <div style={{ fontFamily: F.sans, fontSize: 11, color: P.text5 }}>
              {tx('Найкращий:', 'Best:')} <b style={{ color: P.ok, fontWeight: 700 }}>{best.day}</b>
            </div>
          )}
          <div style={{ width: '100%', flex: 1 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                {grid()}
                <XAxis dataKey="day" {...AX} />
                <YAxis domain={ZERO_DOMAIN} {...AX} />
                {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [tx(`${fmt(v)} · ${p.payload.trades} угод`, `${fmt(v)} · ${p.payload.trades} ${p.payload.trades === 1 ? 'trade' : 'trades'}`), tx('Результат', 'Result')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
                <ReferenceLine y={0} stroke={P.lineHover} />
                <Bar dataKey={o.metric} radius={[3, 3, 3, 3]} maxBarSize={34} isAnimationActive animationDuration={420}>
                  {rows.map((x) => <Cell key={x.day} fill={x[o.metric] > 0 ? 'var(--edge-acc)' : x[o.metric] < 0 ? P.bad : P.lineHover} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    },
  },

  sessions: {
    title: tx('Сесії', 'Sessions'),
    hint: tx('Скільки платить кожна торгова сесія', 'What each trading session pays'),
    icon: Clock, group: 'Розрізи', tone: 'var(--edge-ok)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' }, metric: metricOption('net') },
    render: ({ s, o }) => {
      const rows = s.bySession.filter((x) => x.trades);
      if (!rows.length) return <Empty>{tx('Сесії ще не набрали угод', 'No trades in sessions yet')}</Empty>;
      const fmt = fmtBy(o.metric);
      const best = [...rows].sort((a, b) => b[o.metric] - a[o.metric])[0];

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 }}>
          {best && (
            <div style={{ fontFamily: F.sans, fontSize: 11, color: P.text5 }}>
              {tx('Ядро:', 'Core:')} <b style={{ color: P.ok, fontWeight: 700 }}>{best.session}</b>
            </div>
          )}
          <div style={{ width: '100%', flex: 1 }}>
            <ResponsiveContainer>
              <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                {grid()}
                <XAxis dataKey="session" {...AX} />
                <YAxis domain={ZERO_DOMAIN} {...AX} />
                {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [tx(`${fmt(v)} · ${p.payload.trades} угод`, `${fmt(v)} · ${p.payload.trades} ${p.payload.trades === 1 ? 'trade' : 'trades'}`), tx('Результат', 'Result')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
                <ReferenceLine y={0} stroke={P.lineHover} />
                <Bar dataKey={o.metric} radius={[3, 3, 0, 0]} maxBarSize={54} isAnimationActive animationDuration={420}>
                  {rows.map((x) => <Cell key={x.session} fill={x[o.metric] >= 0 ? P.ok : P.bad} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    },
  },

  hours: {
    title: tx('Години входу', 'Entry hours'),
    hint: tx('О котрій годині рахунок росте, а о котрій тане', 'Which hours grow the account and which ones drain it'),
    icon: Clock, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => (s.byHour || []).some((h) => h.trades),
    lockedHint: tx('Заповни час входу хоч в одній угоді — і графік стане доступним', 'Add entry time to at least one trade to unlock the chart'),
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => {
      const rows = s.byHour.filter((h) => h.trades);
      if (!rows.length) {
        return (
          <div style={{ display: 'flex', flex: 1, minHeight: 120 }}>
            <BuildingBars color="var(--edge-acc)" label={tx("Години з'являться, щойно проставиш час входу в угодах", 'Hours will appear once you add entry times to your trades')} />
          </div>
        );
      }

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="hour" {...AX} interval="preserveStartEnd" />
              <YAxis domain={ZERO_DOMAIN} {...AX} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [tx(`${signed(v)}R · ${p.payload.trades} угод`, `${signed(v)}R · ${p.payload.trades} ${p.payload.trades === 1 ? 'trade' : 'trades'}`), tx('Результат', 'Result')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <ReferenceLine y={0} stroke={P.lineHover} />
              <Bar dataKey="net" radius={[2, 2, 0, 0]} maxBarSize={16} isAnimationActive animationDuration={420}>
                {rows.map((h) => <Cell key={h.hour} fill={h.net >= 0 ? 'var(--edge-acc)' : P.bad} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  distribution: {
    title: tx('Розподіл R-множників', 'R-multiple distribution'),
    hint: tx('Форма результатів: де густо, а де хвіст', "The shape of your results: where it's dense and where the tail is"),
    icon: ChartColumn, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'bars', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => (
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 120 }}>
        <div style={{ width: '100%', flex: 1 }}>
          <ResponsiveContainer>
            <BarChart data={s.buckets} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
              {grid()}
              <XAxis dataKey="name" {...AX} tick={{ ...AX.tick, fontSize: 9.5 }} interval={0} />
              <YAxis domain={ZERO_DOMAIN} {...AX} allowDecimals={false} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [tx(`${v} угод`, `${v} ${v === 1 ? 'trade' : 'trades'}`), tx('Кількість', 'Count')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={420}>
                {s.buckets.map((b) => <Cell key={b.name} fill={b.color} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p style={{ margin: '10px 0 0', fontFamily: F.sans, fontSize: 11.5, lineHeight: 1.6, color: P.text5 }}>
          {tx('Хвіст справа — це те, за що ти платиш усіма мінусами. Угод понад 2R:', "The right tail is what you pay for with all your losses. Trades above 2R:")} <b style={{ color: P.ok, fontWeight: 700 }}>{s.trades.filter((t) => t.rr > 2).length}</b>.
        </p>
      </div>
    ),
  },

  hold: {
    title: tx('Час утримання проти результату', 'Hold time vs result'),
    hint: tx('Ліворуч збитки — виходиш рано; праворуч — тримаєш надію', "Losses on the left — you exit early; on the right — you're holding on to hope"),
    icon: Timer, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'number', defaultW: 2, defaultH: 2,
    ready: (s) => (s.trades || []).some((t) => typeof t.holdMin === 'number'),
    lockedHint: tx('Заповни час входу й виходу хоч в одній угоді — і графік стане доступним', 'Add entry and exit times to at least one trade to unlock the chart'),
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => {
      const rows = s.trades.filter((t) => typeof t.holdMin === 'number');
      if (!rows.length) {
        return (
          <div style={{ display: 'flex', flex: 1, minHeight: 120 }}>
            <BuildingScatter color="var(--edge-acc)" label={tx("Розклад з'явиться, щойно проставиш час входу й виходу", 'The breakdown will appear once you add entry and exit times')} />
          </div>
        );
      }

      /* Recharts тягне вісь «утримання» від нуля навіть тоді, коли всі
         угоди закрились за майже однаковий час — крапки збиваються
         в одну лінію при самому краю, і розкид, який мав щось
         показати, натомість виглядає як поламаний графік. Домен
         рахуємо від фактичного розкиду даних, а не від нуля, з
         невеликим запасом по краях — так навіть купка близьких
         значень лягає по всій ширині картки. */
      const holdVals = rows.map((t) => t.holdMin);
      const hMin = Math.min(...holdVals);
      const hMax = Math.max(...holdVals);
      const hPad = Math.max(5, Math.round((hMax - hMin) * 0.15));

      return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 120 }}>
          <div style={{ width: '100%', flex: 1 }}>
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                {grid()}
                <XAxis type="number" dataKey="holdMin" name={tx('хв', 'min')} domain={[Math.max(0, hMin - hPad), hMax + hPad]} {...AX} />
                <YAxis type="number" dataKey="rr" name="R" {...AX} />
                {o.tip !== 'off' && <RTooltip
                  {...TIP}
                  cursor={{ strokeDasharray: '3 3', stroke: P.lineHover }}
                  formatter={(v, n) => [n === 'R' ? `${signed(v, 2)}R` : tx(`${v} хв`, `${v} min`), n === 'R' ? tx('Результат', 'Result') : tx('Утримання', 'Hold')]}
                />}
                <ReferenceLine y={0} stroke={P.lineHover} />
                <Scatter data={rows} isAnimationActive={false} shape={AnimatedScatterDot}>
                  {rows.map((t, i) => <Cell key={i} fill={EMOTION_COLOR[t.emotion]} fillOpacity={0.8} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
            {EMOTIONS.map((e) => (
              <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: F.sans, fontSize: 11, color: P.text5 }}>
                <i style={{ width: 8, height: 8, borderRadius: 3, display: 'inline-block', background: EMOTION_COLOR[e] }} />
                {EMOTION_LABEL[e]}
              </span>
            ))}
          </div>
        </div>
      );
    },
  },

  months: {
    title: tx('По місяцях', 'By month'),
    hint: tx('Чистий R стовпцями і вінрейт лінією поверх', 'Net R as bars with win rate as a line on top'),
    icon: Layers, group: 'Розрізи', tone: P.ok, shape: 'bars', defaultW: 4, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' } },
    render: ({ s, o }) => {
      if (!s.byMonth.length) return <Empty>{tx('Місяців з угодами ще немає', 'No months with trades yet')}</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <ComposedChart
              data={s.byMonth.map((m) => ({ m: m.key, net: m.net, wr: m.wr, trades: m.trades }))}
              margin={{ top: 8, right: 6, left: -20, bottom: 0 }}
            >
              {grid()}
              <XAxis dataKey="m" {...AX} />
              {/* R і вінрейт — різні одиниці. На спільній осі 31% стискав
                  стовпчик −5R майже до нуля, тож у вінрейту своя шкала
                  0–100, прихована: значення видно в підказці. */}
              <YAxis domain={ZERO_DOMAIN} {...AX} />
              <YAxis yAxisId="wr" orientation="right" domain={[0, 100]} hide />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n) => [n === tx('Вінрейт %', 'Win rate %') ? `${v}%` : `${signed(v)}R`, n]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
              <Bar dataKey="net" name={tx('Чистий R', 'Net R')} barSize={40} radius={[3, 3, 0, 0]} isAnimationActive animationDuration={420}>
                {s.byMonth.map((m) => <Cell key={m.key} fill={m.net >= 0 ? P.ok : P.bad} />)}
              </Bar>
              <Line
                yAxisId="wr" type="monotone" dataKey="wr" name={tx('Вінрейт %', 'Win rate %')} stroke={P.warn} strokeWidth={2}
                dot={{ r: 3 }} isAnimationActive animationDuration={900}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  equity: {
    title: tx('Крива еквіті', 'Equity curve'),
    hint: tx('Накопичений результат за весь період', 'Cumulative result for the whole period'),
    icon: TrendingUp, group: 'Динаміка', tone: 'var(--edge-acc)', shape: 'curve', defaultW: 4, defaultH: 2,
    options: {
      tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' },
      view: { label: tx('Вигляд', 'View'), choices: [['area', tx('Площа', 'Area')], ['line', tx('Лінія', 'Line')]], def: 'area' },
    },
    render: ({ s, o, id }) => {
      if (!s.equity.length) return <Empty>{tx('Ще нема жодної угоди в цьому періоді', 'No trades in this period yet')}</Empty>;
      if (s.equity.length < 2) {
        return (
          <div style={{ display: 'flex', flex: 1, minHeight: 120 }}>
            <Building color="var(--edge-acc)" label={tx("Крива з'явиться, щойно набереться кілька угод", 'The curve will appear once you have a few trades')} w={130} h={46} />
          </div>
        );
      }

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
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v) => [`${signed(v, 2)}R`, tx('Еквіті', 'Equity')]} />}
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
    title: tx('Стан проти результату', 'State vs result'),
    hint: tx('Наскільки емоція множить або ділить результат', 'How much emotion multiplies or divides your result'),
    icon: Activity, group: 'Розрізи', tone: 'var(--edge-acc)', shape: 'rows', defaultW: 2, defaultH: 2,
    options: { tip: { label: tx('Підказка', 'Tooltip'), choices: [['on', tx('Показати', 'Show')], ['off', tx('Сховати', 'Hide')]], def: 'on' }, metric: metricOption('avg') },
    render: ({ s, o }) => {
      const rows = (s.emotionStats || []).filter((e) => e.trades);
      if (!rows.length) return <Empty>{tx('Стани ще не проставлені в угодах', "You haven't tagged states on your trades yet")}</Empty>;
      const fmt = fmtBy(o.metric);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
              <XAxis type="number" domain={ZERO_DOMAIN} {...AX} />
              {/* 68 обрізало «Впевненість» до «певненість» — найдовшу
                  назву стану треба вміщати цілою, не найкоротшу. */}
              <YAxis type="category" dataKey="emotion" {...AX} width={92} tickFormatter={(v) => ({ calm: tx('Спокій', 'Calm'), confident: tx('Впевненість', 'Confident'), anxious: tx('Тривога', 'Anxious'), tilt: tx('Тільт', 'Tilt'), fomo: 'FOMO' }[v] || v)} />
              {o.tip !== 'off' && <RTooltip {...TIP} formatter={(v, n, p) => [tx(`${fmt(v)} · ${p.payload.trades} угод`, `${fmt(v)} · ${p.payload.trades} ${p.payload.trades === 1 ? 'trade' : 'trades'}`), tx('Результат', 'Result')]} cursor={{ fill: 'rgba(var(--edge-hair-rgb),0.03)' }} />}
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
  { id: 'streak', h: 1, w: 1 },
  { id: 'dow', h: 2, w: 2 },
  { id: 'sessions', h: 2, w: 2 },
  { id: 'distribution', h: 2, w: 2 },
  { id: 'underwater', h: 2, w: 2 },
  { id: 'hours', h: 2, w: 2 },
  { id: 'hold', h: 2, w: 2 },
  { id: 'months', h: 2, w: 4 },
];
