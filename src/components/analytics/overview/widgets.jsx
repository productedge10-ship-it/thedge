import { useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, AlertOctagon, BrainCircuit, Clock, CalendarDays, CheckCircle2,
  Crosshair, Flame, Layers, ShieldCheck, Target, TrendingUp, Wallet, XCircle, Zap,
} from 'lucide-react';
import { P, F } from './theme';
import { EMOTION_COLOR, EMOTION_LABEL, r1, r2, signed, sum } from '../data';

/* ==================================================================
   Бібліотека віджетів огляду.

   Кожен віджет — запис у словнику: що показує, як називається, чим
   його можна налаштувати і як малюється. Дошка (Board.jsx) про вміст
   не знає нічого: вона розкладає, тягає й зберігає, а що саме
   всередині — питання до цього файлу.

   Такий поділ потрібен не заради краси. Додати новий віджет має
   означати «дописати один об'єкт», а не «правити сітку, панель
   додавання і збереження одночасно».

   Опції описані даними, а не версткою: у кожної є тип, підпис і
   варіанти. Панель налаштувань малює їх сама, тож новий перемикач
   з'являється в інтерфейсі відразу, щойно його вписали сюди.
================================================================== */

/* ---------- дрібні цеглинки ---------- */

const Num = ({ children, color = P.text, size = 30 }) => (
  <b
    style={{
      fontFamily: F.mono, fontSize: size, fontWeight: 800,
      letterSpacing: '-0.03em', lineHeight: 1, color, display: 'block',
    }}
  >
    {children}
  </b>
);

const Cap = ({ children }) => (
  <span
    style={{
      fontFamily: F.sans, fontSize: 10, fontWeight: 700,
      letterSpacing: '1.6px', textTransform: 'uppercase', color: P.text5,
    }}
  >
    {children}
  </span>
);

const Sub = ({ children }) => (
  <span style={{ fontFamily: F.sans, fontSize: 11.5, color: P.text4 }}>{children}</span>
);

/* Смуга-рядок: підкладка показує частку, а не окремий графік поруч.
   Так довжина читається без переведення погляду з тексту на діаграму
   і назад.

   Рядок реагує на курсор: смуга насичується, текст світлішає,
   зʼявляється тонка рамка. Без цього список виглядав як картинка —
   людина вела по ньому мишею, нічого не відбувалось, і ставало
   незрозуміло, чи це взагалі жива таблиця. */
function Row({ label, sub, value, color = P.acc, barColor, share = 0, index }) {
  const [hover, setHover] = useState(false);
  const bar = barColor || color;

  return (
    <div
      data-state={hover ? 'hover' : 'idle'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', borderRadius: 9, overflow: 'hidden',
        border: `1px solid ${hover ? `${bar}3d` : 'transparent'}`,
        transition: 'border-color .2s',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute', inset: 0, width: `${Math.max(2, share * 100)}%`,
          background: `${bar}${hover ? '33' : '1f'}`,
          transition: 'width .5s cubic-bezier(.22,1,.36,1), background .2s',
        }}
      />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px' }}>
        {index != null && (
          <span style={{ fontFamily: F.mono, fontSize: 10, color: hover ? P.text4 : P.dim, width: 14, flexShrink: 0, transition: 'color .2s' }}>
            {index}
          </span>
        )}
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontFamily: F.sans, fontSize: 12.5, color: hover ? 'var(--edge-text)' : P.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color .2s' }}>
            {label}
          </span>
          {sub && <span style={{ display: 'block', fontFamily: F.sans, fontSize: 10.5, color: hover ? P.text4 : P.text5, marginTop: 2, transition: 'color .2s' }}>{sub}</span>}
        </span>
        <b style={{ fontFamily: F.mono, fontSize: 12.5, fontWeight: 700, color, flexShrink: 0 }}>{value}</b>
      </div>
    </div>
  );
}

/* Рядок серій: підпис із поясненням ліворуч, число праворуч.
   Реагує на курсор так само, як решта списків — інакше цей віджет
   виявився б єдиним мертвим серед живих. */
function StreakRow({ label, value, color, sub }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      data-state={hover ? 'hover' : 'idle'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        padding: '7px 9px', marginInline: -9, borderRadius: 9,
        background: hover ? `${color}14` : 'transparent',
        transition: 'background .18s',
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: F.sans, fontSize: 12, color: hover ? 'var(--edge-text)' : P.text3, transition: 'color .18s' }}>{label}</span>
        <span style={{ display: 'block', fontFamily: F.sans, fontSize: 10.5, color: hover ? P.text4 : P.text5, transition: 'color .18s' }}>{sub}</span>
      </span>
      <Num color={color} size={22}>{value}</Num>
    </div>
  );
}

/* Плитка «по плану / без плану». Під курсором насичується у власний
   колір — так одразу видно, на яку саме половину дивишся. */
function PlanTile({ Icon, label, value, n, color }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      data-state={hover ? 'hover' : 'idle'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, padding: '11px 13px', borderRadius: 12,
        background: `${color}${hover ? '1c' : '0d'}`,
        border: `1px solid ${color}${hover ? '4d' : '26'}`,
        transition: 'background .2s, border-color .2s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
        <Icon size={12} color={color} />
        <Cap>{label}</Cap>
      </span>
      <Num color={color} size={21}>{value}R</Num>
      <span style={{ display: 'block', marginTop: 4 }}><Sub>{n} угод</Sub></span>
    </div>
  );
}

const Empty = ({ children }) => (
  <div
    style={{
      display: 'grid', placeItems: 'center', minHeight: 90, textAlign: 'center',
      fontFamily: F.sans, fontSize: 12.5, color: P.text5, padding: '10px 6px',
    }}
  >
    {children}
  </div>
);

const tip = {
  contentStyle: {
    background: 'var(--edge-sunken)', border: `1px solid ${P.line}`, borderRadius: 10,
    fontFamily: F.sans, fontSize: 12, padding: '8px 11px',
  },
  labelStyle: { color: P.text5, fontSize: 10.5, letterSpacing: '1px', textTransform: 'uppercase' },
  itemStyle: { color: P.text2 },
};

const ax = {
  axisLine: false, tickLine: false,
  tick: { fontSize: 10.5, fill: P.text5, fontFamily: F.mono },
};

/* Спарклайн під числом. Три вигляди, бо один і той самий ряд читається
   по-різному: площа показує масштаб, лінія — форму, а «без графіка»
   потрібен тим, кому в картці важливе лише число. */
function Spark({ data, dataKey, color, view, id, hover, tip: showTip = true, labelKey = 'date', name = 'Значення', unit = 'R' }) {
  if (view === 'off' || !data?.length) return null;
  const gid = `sp-${id}`;

  const fmt = (v) => (unit === '%' ? `${v}%` : `${signed(v, 2)}R`);

  return (
    /* Крива живе під числом і сама по собі ловить курсор.

       Раніше на її місці була просто картинка, а «реакцією на ховер»
       — тонка риска під числом. Риска нічого не повідомляла: людина
       наводить на графік, щоб дізнатись, що там за точка, а не щоб
       побачити, що картка помітила курсор.

       Тепер це справжній графік: вертикальна нитка, точка на кривій і
       підказка з датою та значенням — рівно те, за чим на неї
       дивляться. */
    <div
      style={{
        position: 'absolute', left: -6, right: -6, bottom: -6, height: 74,
        opacity: hover ? 1 : 0.62,
        transition: 'opacity .28s ease',
        /* Лише верхній край кривої мʼяко гасне — щоб випадковий пік не
           різав підпис над графіком; сам графік лишається читабельним. */
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 24%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 24%)',
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {view === 'line' ? (
          <LineChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 6 }}>
            <XAxis dataKey={labelKey} hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            {showTip && <RTooltip
              {...tip}
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.6 }}
              formatter={(v) => [fmt(v), name]}
            />}
            <Line
              type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: color, stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
              isAnimationActive animationDuration={420}
            />
          </LineChart>
        ) : (
          <AreaChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 6 }}>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.42} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey={labelKey} hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            {showTip && <RTooltip
              {...tip}
              cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '3 3', strokeOpacity: 0.6 }}
              formatter={(v) => [fmt(v), name]}
            />}
            <Area
              type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gid})`}
              activeDot={{ r: 4, fill: color, stroke: 'var(--edge-sunken)', strokeWidth: 2 }}
              isAnimationActive animationDuration={520}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/* Каркас числової картки: число, підпис під ним і крива на всю
   ширину знизу.

   Тут прибрано дві речі, які здавались оздобленням, а насправді
   заважали. Перша — підпис усередині картки: він дослівно повторював
   заголовок у шапці віджета, і «ЧИСТИЙ R» стояло двічі одне під
   одним. Друга — квадратик з іконкою в правому кутку: та сама іконка
   вже є в шапці, а обведена рамка навколо неї робила з картки
   таблицю з клітинками.

   Лишилось те, заради чого картку відкривають: число.

   Мінімальна висота, а не фіксована: сітка тягне всі картки в рядку
   до найвищої, і жорсткий розмір заважав би їй це робити. */
function KpiBody({ value, color, sub, spark, facts = [], w = 1, hover }) {
  /* Ширша за чверть картка показує ще й розклад числа.

     Доти віджет, розтягнутий на пів екрана, лишався тим самим одним
     числом посеред порожнечі — місця стало більше, а сказано те саме.
     Тепер із простору виростає зміст: звідки це число взялось. */
  const wide = w >= 2 && facts.length > 0;

  return (
    <div style={{ position: 'relative', minHeight: 104, display: 'flex', gap: 18 }}>
      {spark}

      {/* Число не ловить курсор.

         Ось через що підказки на цих картках не було взагалі: блок із
         числом лежить поверх графіка і в вузькій картці займає всю її
         ширину. Мишу він перехоплював першим, а до кривої під ним
         подія просто не доходила — виглядало так, ніби tooltip не
         працює, хоч він був на місці.

         Число нікуди клікати не треба, тож воно просто пропускає
         курсор крізь себе. Розклад праворуч — навпаки, ловить: там є
         власний ховер по рядках. */}
      <div
        style={{
          position: 'relative', flex: wide ? '0 0 auto' : 1, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', gap: 7,
        }}
      >
        <Num color={color} size={34}>{value}</Num>
        {sub && <Sub>{sub}</Sub>}
      </div>

      {wide && (
        <div
          style={{
            position: 'relative', flex: 1, alignSelf: 'center',
            display: 'grid', gap: '6px 14px',
            gridTemplateColumns: w >= 3 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
          }}
        >
          {facts.slice(0, w >= 3 ? 4 : 3).map(([k, v, c]) => (
            <Fact key={k} label={k} value={v} color={c} />
          ))}
        </div>
      )}
    </div>
  );
}

/* Рядок розкладу: підпис ліворуч, число праворуч, тонка лінія між
   ними. Реагує на курсор — інакше в широкій картці зʼявляється
   чотири нових елементи, і жоден із них не живий. */
function Fact({ label, value, color = P.text2 }) {
  const [hover, setHover] = useState(false);

  return (
    <span
      data-state={hover ? 'hover' : 'idle'}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8,
        padding: '4px 7px', marginInline: -7, borderRadius: 7,
        background: hover ? 'rgba(var(--edge-hair-rgb),0.04)' : 'transparent',
        transition: 'background .18s',
      }}
    >
      <span style={{ fontFamily: F.sans, fontSize: 11, color: hover ? P.text3 : P.text5, whiteSpace: 'nowrap', transition: 'color .18s' }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: hover ? 'rgba(var(--edge-hair-rgb),0.10)' : 'rgba(var(--edge-hair-rgb),0.05)', transition: 'background .18s' }} />
      <b style={{ fontFamily: F.mono, fontSize: 12.5, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {value}
      </b>
    </span>
  );
}

/* ---------- спільні набори опцій ----------

   Виносяться сюди, бо повторюються в половині віджетів, а різнобій у
   формулюваннях того самого перемикача виглядає як недогляд. */

const sparkOption = {
  label: 'Графік',
  choices: [['area', 'Площа'], ['line', 'Лінія'], ['off', 'Без графіка']],
  def: 'area',
};

const countOption = (def = '5') => ({
  label: 'Скільки рядків',
  choices: [['3', '3'], ['5', '5'], ['8', '8'], ['all', 'Усі']],
  def,
});

const cut = (arr, n) => (n === 'all' ? arr : arr.slice(0, Number(n) || 5));

/* ==================================================================
   РЕЄСТР
================================================================== */

export const WIDGETS = {

  /* ---------- числа ---------- */

  net: {
    title: 'Чистий R',
    hint: 'Підсумок за період і крива під ним',
    icon: TrendingUp,
    group: 'Числа',
    tone: 'var(--edge-ok)',
    shape: 'spark',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      spark: sparkOption,
      sub: {
        label: 'Підпис',
        choices: [['count', 'Кількість угод'], ['avg', 'Середня угода'], ['off', 'Без підпису']],
        def: 'count',
      },
    },
    render: ({ s, o, id, w, hover }) => (
      <KpiBody
        value={`${signed(s.net)}R`}
        color={s.net >= 0 ? P.ok : P.bad}
        sub={o.sub === 'off' ? null
          : o.sub === 'avg' ? `${signed(s.expectancy, 2)}R на угоду`
            : `${s.trades.length} угод · ${s.byMonth.length} міс.`}
        spark={<Spark id={id} data={s.equity} dataKey="value" labelKey="date" name="Еквіті" color={s.net >= 0 ? P.ok : P.bad} view={o.spark} hover={hover} tip={o.tip !== 'off'} />}
        w={w}
        hover={hover}
        facts={[['Прибуток', `+${r1(s.gross)}R`, P.ok], ['Збитки', `−${r1(s.grossLoss)}R`, P.bad], ['Очікування', `${signed(s.expectancy, 2)}R`], ['Просадка', `${r1(s.maxDD)}R`, P.bad]]}
      />
    ),
  },

  winrate: {
    title: 'Вінрейт',
    hint: 'Частка виграшних угод',
    icon: Target,
    group: 'Числа',
    tone: 'var(--edge-acc)',
    shape: 'ring',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      spark: sparkOption,
      sub: {
        label: 'Підпис',
        choices: [['wl', 'Виграші й програші'], ['be', 'Беззбиткові'], ['off', 'Без підпису']],
        def: 'wl',
      },
    },
    render: ({ s, o, id, w, hover }) => (
      <KpiBody
        value={`${s.wr}%`}
        color={P.acc}
        sub={o.sub === 'off' ? null
          : o.sub === 'be' ? `${s.be.length} у беззбиток`
            : `${s.wins.length}W · ${s.losses.length}L`}
        spark={<Spark id={id} data={s.byMonth} dataKey="wr" labelKey="key" name="Вінрейт" unit="%" color={P.acc} view={o.spark} hover={hover} tip={o.tip !== 'off'} />}
        w={w}
        hover={hover}
        facts={[['Виграшів', String(s.wins.length), P.ok], ['Програшів', String(s.losses.length), P.bad], ['У беззбиток', String(s.be.length)], ['Смуга', String(s.bestW), P.ok]]}
      />
    ),
  },

  pf: {
    title: 'Профіт-фактор',
    hint: 'Скільки зароблено на кожну втрачену одиницю',
    icon: Activity,
    group: 'Числа',
    tone: 'var(--edge-acc)',
    shape: 'spark',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      spark: sparkOption,
      sub: {
        label: 'Підпис',
        choices: [['balance', 'Плюс і мінус'], ['dd', 'Просадка'], ['off', 'Без підпису']],
        def: 'balance',
      },
    },
    render: ({ s, o, id, w, hover }) => (
      <KpiBody
        value={r2(s.pf)}
        color="var(--edge-acc)"
        sub={o.sub === 'off' ? null
          : o.sub === 'dd' ? `Макс. просадка ${r1(s.maxDD)}R`
            : `+${r1(s.gross)} / −${r1(s.grossLoss)}`}
        spark={<Spark id={id} data={s.byMonth} dataKey="net" labelKey="key" name="Чистий R" color="var(--edge-acc)" view={o.spark} hover={hover} tip={o.tip !== 'off'} />}
        w={w}
        hover={hover}
        facts={[['Прибуток', `+${r1(s.gross)}R`, P.ok], ['Збитки', `−${r1(s.grossLoss)}R`, P.bad], ['Відновлення', `×${r2(s.recovery)}`], ['Просадка', `${r1(s.maxDD)}R`, P.bad]]}
      />
    ),
  },

  tilt: {
    title: 'Ціна тільта',
    hint: 'Скільки коштували угоди на емоціях і з порушеннями',
    icon: Flame,
    group: 'Числа',
    tone: 'var(--edge-bad)',
    shape: 'dip',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      spark: sparkOption,
      sub: {
        label: 'Підпис',
        choices: [['share', 'Частка від прибутку'], ['rate', 'Частка угод з помилкою'], ['off', 'Без підпису']],
        def: 'share',
      },
    },
    render: ({ s, o, id, w, hover }) => (
      <KpiBody
        value={`${r1(s.tiltCost)}R`}
        color={P.bad}
        sub={o.sub === 'off' ? null
          : o.sub === 'rate' ? `${s.mistakeRate}% угод з помилкою`
            : `${Math.round((Math.abs(s.tiltCost) / Math.max(1, s.gross)) * 100)}% від прибутку`}
        spark={<Spark id={id} data={s.equity} dataKey="dd" labelKey="date" name="Просадка" color={P.bad} view={o.spark} hover={hover} tip={o.tip !== 'off'} />}
        w={w}
        hover={hover}
        facts={[['Угод з помилкою', `${s.mistakeRate}%`, P.warn], ['Після збитку', `${signed(s.avgAfterLoss, 2)}R`, s.avgAfterLoss >= 0 ? P.ok : P.bad], ['Після плюсу', `${signed(s.avgAfterWin, 2)}R`, s.avgAfterWin >= 0 ? P.ok : P.bad], ['Реванш', String(s.revenge), P.bad]]}
      />
    ),
  },

  expectancy: {
    title: 'Очікування',
    hint: 'Скільки в середньому приносить одна угода',
    icon: Zap,
    group: 'Числа',
    tone: 'var(--edge-warn)',
    shape: 'number',
    defaultW: 1, defaultH: 1,
    options: {
      sub: {
        label: 'Підпис',
        choices: [['avgwin', 'Середні виграш і програш'], ['recovery', 'Фактор відновлення'], ['off', 'Без підпису']],
        def: 'avgwin',
      },
    },
    render: ({ s, o, w, hover }) => (
      <KpiBody
        value={`${signed(s.expectancy, 2)}R`}
        color={s.expectancy >= 0 ? P.ok : P.bad}
        sub={o.sub === 'off' ? null
          : o.sub === 'recovery' ? `Відновлення ×${r2(s.recovery)}`
            : `+${r2(s.avgWin)} / ${r2(s.avgLoss)}`}
        spark={null}
        w={w}
        hover={hover}
        facts={[['Сер. виграш', `+${r2(s.avgWin)}R`, P.ok], ['Сер. програш', `${r2(s.avgLoss)}R`, P.bad], ['Профіт-фактор', r2(s.pf)], ['Угод', String(s.trades.length)]]}
      />
    ),
  },

  streak: {
    title: 'Серії',
    hint: 'Найдовші смуги виграшів, програшів і чистих угод',
    icon: Layers,
    group: 'Числа',
    tone: 'var(--edge-info)',
    shape: 'streak',
    /* Три рядки не влазять у одну клітинку (звідси й minH): без
       нього дошка дозволяла зберегти h:1, і плитку доводилось
       читати обрізаною по обидва краї. */
    defaultW: 1, defaultH: 2, minH: 2,
    options: {},
    render: ({ s }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 122, justifyContent: 'center' }}>
        {[
          ['Найкраща смуга', `${s.bestW}`, P.ok, 'виграшів поспіль'],
          ['Найгірша смуга', `${s.worstL}`, P.bad, 'програшів поспіль'],
          ['Чистих поспіль', `${s.cleanStreak}`, P.acc, 'угод без порушень'],
        ].map(([label, v, color, sub]) => (
          <StreakRow key={label} label={label} value={v} color={color} sub={sub} />
        ))}
      </div>
    ),
  },

  /* ---------- графіки ---------- */

  equity: {
    title: 'Крива еквіті',
    hint: 'Накопичений результат у R за весь період',
    icon: TrendingUp,
    group: 'Графіки',
    tone: 'var(--edge-acc)',
    shape: 'curve',
    defaultW: 3, defaultH: 2,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      view: { label: 'Вигляд', choices: [['area', 'Площа'], ['line', 'Лінія']], def: 'area' },
      dd: { label: 'Просадка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
    },
    render: ({ s, o }) => {
      if (!s.equity.length) return <Empty>Ще нема жодної угоди в цьому періоді</Empty>;

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={s.equity} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="ov-eq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={P.acc} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={P.acc} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" {...ax} minTickGap={38} />
              <YAxis {...ax} />
              {o.tip !== 'off' && <RTooltip {...tip} formatter={(v) => [`${signed(v, 2)}R`, 'Еквіті']} />}
              <ReferenceLine y={0} stroke={P.line} />
              {o.dd === 'on' && (
                <Area type="monotone" dataKey="dd" stroke={P.bad} strokeWidth={1.4} fill="none" strokeOpacity={0.55} isAnimationActive={false} name="Просадка" />
              )}
              <Area
                type="monotone" dataKey="value" name="Еквіті"
                stroke={P.acc} strokeWidth={2.6}
                fill={o.view === 'line' ? 'none' : 'url(#ov-eq)'}
                isAnimationActive animationDuration={520}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  sessions: {
    title: 'Сесії',
    hint: 'Скільки платить кожна торгова сесія',
    icon: Clock,
    group: 'Графіки',
    tone: 'var(--edge-ok)',
    shape: 'bars',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      metric: { label: 'Показник', choices: [['net', 'Сума R'], ['avg', 'Середня угода'], ['wr', 'Вінрейт']], def: 'net' },
      view: { label: 'Вигляд', choices: [['bars', 'Стовпці'], ['rows', 'Рядки']], def: 'bars' },
    },
    render: ({ s, o }) => {
      const key = o.metric;
      const rows = (s.bySession || []).filter((x) => x.trades);
      if (!rows.length) return <Empty>Сесії ще не набрали угод</Empty>;

      const fmt = (v) => (key === 'wr' ? `${v}%` : `${signed(v, key === 'avg' ? 2 : 1)}R`);
      const max = Math.max(...rows.map((x) => Math.abs(x[key])), 1);

      if (o.view === 'rows') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {rows.map((x) => (
              <Row
                key={x.session}
                label={x.session}
                sub={`${x.trades} угод`}
                value={fmt(x[key])}
                color={x[key] >= 0 ? P.ok : P.bad}
                share={Math.abs(x[key]) / max}
              />
            ))}
          </div>
        );
      }

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="session" {...ax} />
              <YAxis {...ax} />
              {o.tip !== 'off' && <RTooltip {...tip} formatter={(v) => [fmt(v), 'Результат']} cursor={{ fill: 'rgba(255,255,255,.03)' }} />}
              <ReferenceLine y={0} stroke={P.line} />
              <Bar dataKey={key} radius={[5, 5, 0, 0]} isAnimationActive animationDuration={420}>
                {rows.map((x) => (
                  <Cell key={x.session} fill={x[key] >= 0 ? P.ok : P.bad} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  dow: {
    title: 'Дні тижня',
    hint: 'У які дні торгівля приносить найбільше',
    icon: CalendarDays,
    group: 'Графіки',
    tone: 'var(--edge-acc)',
    shape: 'bars',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      metric: { label: 'Показник', choices: [['net', 'Сума R'], ['avg', 'Середня угода'], ['wr', 'Вінрейт']], def: 'avg' },
    },
    render: ({ s, o }) => {
      const rows = (s.byDow || []).filter((x) => x.trades);
      if (!rows.length) return <Empty>Днів з угодами ще немає</Empty>;
      const fmt = (v) => (o.metric === 'wr' ? `${v}%` : `${signed(v, o.metric === 'avg' ? 2 : 1)}R`);

      return (
        <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <XAxis dataKey="day" {...ax} />
              <YAxis {...ax} />
              {o.tip !== 'off' && <RTooltip {...tip} formatter={(v) => [fmt(v), 'Результат']} cursor={{ fill: 'rgba(255,255,255,.03)' }} />}
              <ReferenceLine y={0} stroke={P.line} />
              <Bar dataKey={o.metric} radius={[5, 5, 0, 0]} isAnimationActive animationDuration={420}>
                {rows.map((x) => (
                  <Cell key={x.day} fill={x[o.metric] >= 0 ? P.acc : P.bad} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    },
  },

  plan: {
    title: 'План проти порушень',
    hint: 'Дві криві: угоди за планом і повз нього',
    icon: ShieldCheck,
    group: 'Графіки',
    tone: 'var(--edge-ok)',
    shape: 'split',
    defaultW: 1, defaultH: 1,
    options: {
      tip: { label: 'Підказка', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
      chart: { label: 'Крива', choices: [['on', 'Показати'], ['off', 'Тільки цифри']], def: 'on' },
    },
    render: ({ s, o }) => {
      const followed = sum(s.followed.map((t) => t.rr));
      const broken = sum(s.broken.map((t) => t.rr));

      const len = Math.max(s.followed.length, s.broken.length);
      let fa = 0; let ba = 0;
      const data = Array.from({ length: len }, (_, i) => {
        if (i < s.followed.length) fa += s.followed[i].rr;
        if (i < s.broken.length) ba += s.broken[i].rr;
        return { step: i + 1, fa: +fa.toFixed(2), ba: +ba.toFixed(2) };
      });

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              [CheckCircle2, 'По плану', followed, s.followed.length, P.ok],
              [XCircle, 'Без плану', broken, s.broken.length, P.bad],
            ].map(([Icon, label, val, n, color]) => (
              <PlanTile key={label} Icon={Icon} label={label} value={signed(val)} n={n} color={color} />
            ))}
          </div>

          {o.chart === 'on' && data.length > 0 && (
            <div style={{ width: '100%', flex: 1, minHeight: 120 }}>
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 6, right: 4, left: -26, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ov-pf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.ok} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={P.ok} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ov-pb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={P.bad} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={P.bad} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="step" {...ax} />
                  <YAxis {...ax} />
                  {o.tip !== 'off' && <RTooltip {...tip} formatter={(v, n) => [`${signed(v, 2)}R`, n]} />}
                  <ReferenceLine y={0} stroke={P.line} />
                  <Area type="monotone" dataKey="fa" name="По плану" stroke={P.ok} strokeWidth={2} fill="url(#ov-pf)" isAnimationActive animationDuration={420} />
                  <Area type="monotone" dataKey="ba" name="Порушення" stroke={P.bad} strokeWidth={2} fill="url(#ov-pb)" isAnimationActive animationDuration={420} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      );
    },
  },

  /* ---------- списки ---------- */

  sources: {
    title: 'Звідки береться R',
    hint: 'Найприбутковіші й найзбитковіші джерела разом',
    icon: Layers,
    group: 'Списки',
    tone: 'var(--edge-info)',
    shape: 'rows',
    /* За замовчуванням тут 6 рядків — у клітинку h:1 влазить два-три,
       решта обрізалась би. */
    defaultW: 1, defaultH: 2, minH: 2,
    options: {
      count: countOption('6'),
      order: { label: 'Порядок', choices: [['best', 'Спершу найкращі'], ['worst', 'Спершу найгірші']], def: 'best' },
    },
    render: ({ s, o }) => {
      const bestSes = [...(s.bySession || [])].filter((x) => x.trades).sort((a, b) => b.net - a.net)[0];
      const bestAsset = s.byAsset[0];
      const worstAsset = s.byAsset[s.byAsset.length - 1];
      const bestSetup = s.bySetup[0];
      const bestDay = [...(s.byDow || [])].filter((x) => x.trades).sort((a, b) => b.net - a.net)[0];

      const raw = [
        bestSes && { label: `Сесія ${bestSes.session}`, v: bestSes.net },
        bestAsset && { label: `${bestAsset.key}`, v: bestAsset.net },
        bestSetup && { label: `Сетап «${bestSetup.key}»`, v: bestSetup.net },
        bestDay && { label: `${bestDay.day} — найкращий день`, v: bestDay.net },
        { label: 'План дотримано', v: +sum(s.followed.map((t) => t.rr)).toFixed(1) },
        worstAsset && worstAsset !== bestAsset && { label: `${worstAsset.key}`, v: worstAsset.net },
      ].filter(Boolean);

      if (!raw.length) return <Empty>Джерел поки не видно</Empty>;

      const sorted = [...raw].sort((a, b) => (o.order === 'worst' ? a.v - b.v : b.v - a.v));
      const list = cut(sorted, o.count);
      const max = Math.max(...list.map((x) => Math.abs(x.v)), 1);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((x, i) => (
            <Row
              key={x.label}
              index={i + 1}
              label={x.label}
              value={`${signed(x.v)}R`}
              color={x.v >= 0 ? P.ok : P.bad}
              share={Math.abs(x.v) / max}
            />
          ))}
        </div>
      );
    },
  },

  emotions: {
    title: 'Стан проти результату',
    hint: 'Скільки приносить кожен емоційний стан',
    icon: BrainCircuit,
    group: 'Списки',
    tone: 'var(--edge-acc)',
    shape: 'rows',
    /* Емоційних станів до чотирьох, і кожен — свій рядок: h:1 тісний
       вже на трьох. */
    defaultW: 1, defaultH: 2, minH: 2,
    options: {
      metric: { label: 'Показник', choices: [['avg', 'Середня угода'], ['net', 'Сума R'], ['wr', 'Вінрейт']], def: 'avg' },
      note: { label: 'Висновок', choices: [['on', 'Показати'], ['off', 'Сховати']], def: 'on' },
    },
    render: ({ s, o }) => {
      const rows = (s.emotionStats || []).filter((e) => e.trades);
      if (!rows.length) return <Empty>Стани ще не проставлені в угодах</Empty>;

      const key = o.metric;
      const maxTrades = Math.max(...rows.map((e) => e.trades), 1);
      const fmt = (v) => (key === 'wr' ? `${v}%` : `${signed(v, key === 'avg' ? 2 : 1)}R`);
      const spread = Math.max(...rows.map((e) => e.avg)) - Math.min(...rows.map((e) => e.avg));

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {rows.map((e) => (
            <Row
              key={e.emotion}
              label={EMOTION_LABEL[e.emotion] || e.emotion}
              sub={`${e.trades} угод`}
              value={fmt(e[key])}
              /* Число — зеленим або червоним за результатом, а смуга —
                 кольором самого стану. Так у рядку два різні факти й
                 обидва читаються: скільки це коштує і про що воно. */
              color={e[key] >= 0 ? P.ok : P.bad}
              barColor={EMOTION_COLOR[e.emotion]}
              share={e.trades / maxTrades}
            />
          ))}

          {o.note === 'on' && rows.length > 1 && (
            <p
              style={{
                margin: '8px 0 0', padding: '10px 12px', borderRadius: 10,
                background: 'rgba(255,255,255,.02)', border: `1px solid ${P.lineSoft}`,
                fontFamily: F.sans, fontSize: 11.5, lineHeight: 1.6, color: P.text4,
              }}
            >
              Емоція — це множник. Різниця між найкращим і найгіршим станом:{' '}
              <b style={{ fontFamily: F.mono, color: P.text2 }}>{r2(spread)}R</b> на кожну угоду.
            </p>
          )}
        </div>
      );
    },
  },

  mistakes: {
    title: 'Найдорожчі звички',
    hint: 'Порушення, відсортовані за ціною',
    icon: AlertOctagon,
    group: 'Списки',
    tone: 'var(--edge-bad)',
    shape: 'rows',
    defaultW: 1, defaultH: 2, minH: 2,
    options: {
      count: countOption('5'),
      metric: { label: 'Сортувати за', choices: [['cost', 'Ціною'], ['count', 'Частотою']], def: 'cost' },
    },
    render: ({ s, o }) => {
      const rows = (s.mistakeLedger || []).filter((m) => m.count > 0);
      if (!rows.length) return <Empty>Помилок у журналі немає. Так тримати.</Empty>;

      const sorted = [...rows].sort((a, b) => (o.metric === 'count' ? b.count - a.count : a.cost - b.cost));
      const list = cut(sorted, o.count);
      const max = Math.max(...list.map((m) => Math.abs(m.cost)), 1);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {list.map((m) => (
            <Row
              key={m.name}
              label={m.name}
              sub={`повторено ${m.count} раз${m.count === 1 ? '' : 'ів'}`}
              value={`${signed(m.cost)}R`}
              color={P.bad}
              share={Math.abs(m.cost) / max}
            />
          ))}
        </div>
      );
    },
  },

  assets: {
    title: 'Активи',
    hint: 'Що приносить, а що забирає',
    icon: Wallet,
    group: 'Списки',
    tone: 'var(--edge-ok)',
    shape: 'rows',
    defaultW: 1, defaultH: 2, minH: 2,
    options: {
      count: countOption('5'),
      metric: { label: 'Показник', choices: [['net', 'Сума R'], ['avg', 'Середня угода'], ['wr', 'Вінрейт']], def: 'net' },
    },
    render: ({ s, o }) => {
      const rows = s.byAsset || [];
      if (!rows.length) return <Empty>Активів у журналі ще немає</Empty>;
      const key = o.metric;
      const sorted = [...rows].sort((a, b) => b[key] - a[key]);
      const list = cut(sorted, o.count);
      const max = Math.max(...list.map((x) => Math.abs(x[key])), 1);
      const fmt = (v) => (key === 'wr' ? `${v}%` : `${signed(v, key === 'avg' ? 2 : 1)}R`);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {list.map((x) => (
            <Row
              key={x.key}
              label={x.key}
              sub={`${x.trades} угод`}
              value={fmt(x[key])}
              color={x[key] >= 0 ? P.ok : P.bad}
              share={Math.abs(x[key]) / max}
            />
          ))}
        </div>
      );
    },
  },

  setups: {
    title: 'Сетапи',
    hint: 'Які схеми входу справді платять',
    icon: Crosshair,
    group: 'Списки',
    tone: 'var(--edge-warn)',
    shape: 'rows',
    defaultW: 1, defaultH: 2, minH: 2,
    options: {
      count: countOption('5'),
      metric: { label: 'Показник', choices: [['net', 'Сума R'], ['avg', 'Середня угода'], ['wr', 'Вінрейт']], def: 'net' },
    },
    render: ({ s, o }) => {
      const rows = (s.bySetup || []).filter((x) => x.key && x.key !== '—');
      if (!rows.length) return <Empty>Сетапи ще не заповнені в угодах</Empty>;
      const key = o.metric;
      const sorted = [...rows].sort((a, b) => b[key] - a[key]);
      const list = cut(sorted, o.count);
      const max = Math.max(...list.map((x) => Math.abs(x[key])), 1);
      const fmt = (v) => (key === 'wr' ? `${v}%` : `${signed(v, key === 'avg' ? 2 : 1)}R`);

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {list.map((x) => (
            <Row
              key={x.key}
              label={x.key}
              sub={`${x.trades} угод`}
              value={fmt(x[key])}
              color={x[key] >= 0 ? P.ok : P.bad}
              share={Math.abs(x[key]) / max}
            />
          ))}
        </div>
      );
    },
  },

  discipline: {
    title: 'Дисципліна',
    hint: 'Частка угод за планом і що буде без витоків',
    icon: ShieldCheck,
    group: 'Числа',
    tone: 'var(--edge-ok)',
    shape: 'gauge',
    defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s }) => {
      const potential = s.net - sum(s.broken.filter((t) => t.rr < 0).map((t) => t.rr));

      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 122, justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Cap>план дотримано</Cap>
            <Num color={s.adherence >= 70 ? P.ok : P.warn} size={26}>{s.adherence}%</Num>
          </div>

          {/* Смуга під числом: відсоток без опори важко відчути, а
              заповнена на дві третини смуга зчитується миттєво. */}
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.05)', overflow: 'hidden' }}>
            <span
              style={{
                display: 'block', height: '100%', borderRadius: 999,
                width: `${s.adherence}%`, background: s.adherence >= 70 ? P.ok : P.warn,
                transition: 'width .7s cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <Sub>Без збиткових порушень</Sub>
            <b style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: P.ok }}>{signed(potential)}R</b>
          </div>
        </div>
      );
    },
  },
};

export const WIDGET_IDS = Object.keys(WIDGETS);

/* Розкладка за замовчуванням. Порядок не випадковий: спершу чотири
   числа одним рядком, далі велика крива з джерелами поруч, знизу три
   розбори. Це та сама сторінка, що була до дошки, — щоб той, хто
   нічого не налаштовував, не помітив переїзду. */
export const DEFAULT_LAYOUT = [
  { id: 'net', h: 1, w: 1 },
  { id: 'winrate', h: 1, w: 1 },
  { id: 'pf', h: 1, w: 1 },
  { id: 'tilt', h: 1, w: 1 },
  { id: 'equity', h: 2, w: 3 },
  { id: 'sources', h: 2, w: 1 },
  { id: 'plan', h: 1, w: 1 },
  { id: 'emotions', h: 2, w: 1 },
  { id: 'mistakes', h: 2, w: 1 },
];

/* Значення опції за замовчуванням — з реєстру, а не з розкладки: так
   новий перемикач у вже збереженій дошці не стає undefined. */
export const optionsFor = (spec, saved = {}) => {
  const schema = spec?.options || {};
  const out = {};
  Object.entries(schema).forEach(([key, def]) => {
    const known = def.choices.some(([v]) => v === saved[key]);
    out[key] = known ? saved[key] : def.def;
  });
  return out;
};
