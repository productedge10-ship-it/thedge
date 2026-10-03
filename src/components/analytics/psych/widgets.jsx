import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceLine, RadarChart, PolarGrid, PolarAngleAxis, Radar, PieChart, Pie, Cell,
  Tooltip as RTooltip,
} from 'recharts';
import {
  Activity, AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock, Cpu, Crosshair, Droplet,
  Compass, Flame, Gauge, Hand, Info, Layers, NotebookPen, Radar as RadarIcon, ScanEye, ShieldCheck, Sparkles, Target, XCircle,
} from 'lucide-react';
import { Delta, ChartTip, axis } from '../ui';
import { F } from '../overview/theme';
import { EMOTION_COLOR, EMOTION_LABEL, signed, r1, r2, sum } from '../data';
import ComingSoon from '../shared/ComingSoon';
import { t as tx } from '../../../lib/lang';
import { NeuroBody, SpotlightCard, TiltTooltip, PlanTooltip, derive, premiumEasing, TARGET_RISK } from './parts';

/* ==================================================================
   Бібліотека віджетів «Психології».

   Той самий формат, що в «Огляді» й «Перформансі»: title, іконка,
   тон, ширина за замовчуванням, перемикачі й render, який повертає
   лише вміст картки. Рамку, заголовок, шестерню й хрестик малює
   дошка.

   Що зникло при переїзді й чому. Заголовок «Психологія» з підписом
   «26 угод розмічено емоціями» дублював назву вкладки, яка й так
   стоїть у шапці, тож пішов. Перемикачі, що жили в правому куті
   панелей (кругова діаграма проти радара, «Деталі» в реєстрі
   помилок), стали звичайними налаштуваннями віджета: там їм і місце,
   бо це вибір вигляду, а не дія.

   Панель більше не потрібна всередині, але імпорт лишається — деякі
   віджети всередині мають вкладені підпанелі.
================================================================== */

/* ------------------------------------------------------------------
   Спільне для віджетів

   Висоти тут немає навмисно: графік розтягується під плитку
   (`flex: 1`), а розмір плитки вибирає людина в налаштуваннях
   віджета. Так усі картки лишаються одного крою й різняться тільки
   наповненням.
------------------------------------------------------------------ */

const DOW_UA = tx(['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'], ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const dirty = (t) => (t.mistakes || []).length > 0;

/* Велике число з підписом. Той самий каркас, що в KPI «Перформансу»:
   у вузькій картці лишається саме число, у ширшій із простору, що
   зʼявився, виростають факти. */
function Big({ value, tone, facts = [], w = 1, note }) {
  const wide = w >= 2 && facts.length > 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-4">
        <b
          className="leading-none tabular-nums"
          style={{ fontFamily: F.mono, fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', color: tone }}
        >
          {value}
        </b>
        <div
          className="flex-1 grid gap-x-4 gap-y-1.5"
          style={{ gridTemplateColumns: wide && w >= 3 ? 'repeat(2, minmax(0,1fr))' : 'minmax(0,1fr)' }}
        >
          {facts.slice(0, wide && w >= 3 ? 4 : 2).map(([k, v]) => (
            <span key={k} className="flex items-baseline gap-2">
              <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--edge-text3, #7A7A85)' }}>{k}</span>
              <span className="flex-1 h-px" style={{ background: '#ffffff0d' }} />
              <b className="text-[12.5px] tabular-nums whitespace-nowrap" style={{ color: 'var(--edge-text2, #B4B4BD)' }}>{v}</b>
            </span>
          ))}
        </div>
      </div>
      {note && (
        <p className="m-0 text-[11.5px] leading-[1.4]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>{note}</p>
      )}
    </div>
  );
}

function Hollow({ children }) {
  return (
    <div className="grid place-items-center px-4 py-10 text-center text-[12.5px]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
      {children}
    </div>
  );
}

/* ---------- обчислення ---------- */

/* Скільки чистих угод поспіль просто зараз. Не найдовша серія за
   історію, а та, що триває: саме її людина може зіпсувати наступним
   входом, і саме тому вона мотивує. */
const tailClean = (trades) => {
  let n = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (dirty(trades[i])) break;
    n++;
  }
  return n;
};

/* Ковзна частка чистих угод. Підсумковий відсоток однаковий у того,
   хто виправився місяць тому, і в того, хто саме зараз розсипається;
   вікно показує напрямок. */
const cleanSeries = (trades, win) => {
  if (trades.length < win) return [];
  return trades.slice(win - 1).map((_, i) => {
    const slice = trades.slice(i, i + win);
    return {
      n: i + win,
      pct: Math.round((slice.filter((t) => !dirty(t)).length / win) * 100),
    };
  });
};

const byDowDiscipline = (trades) => [1, 2, 3, 4, 5].map((d) => {
  const list = trades.filter((t) => t.dow === d);
  const bad = list.filter(dirty);
  return {
    day: DOW_UA[d],
    trades: list.length,
    rate: list.length ? Math.round((bad.length / list.length) * 100) : 0,
    cost: +sum(bad.filter((t) => t.rr < 0).map((t) => t.rr)).toFixed(1),
  };
});

const byHourDiscipline = (trades) => {
  const hours = trades.map((t) => t.hour).filter((h) => typeof h === 'number');
  if (!hours.length) return [];
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((h) => {
    const list = trades.filter((t) => t.hour === h);
    const bad = list.filter(dirty);
    return {
      hour: `${h}:00`,
      trades: list.length,
      rate: list.length ? Math.round((bad.length / list.length) * 100) : 0,
      cost: +sum(bad.filter((t) => t.rr < 0).map((t) => t.rr)).toFixed(1),
    };
  });
};

/* Вартість помсти. s.revenge рахує входи протягом години після
   збитку, у яких людина сама відзначила порушення. Тут додаємо, у що
   вони обійшлись. */
const revengeCost = (trades) => {
  let cost = 0;
  let n = 0;
  for (let i = 1; i < trades.length; i++) {
    const prev = trades[i - 1];
    const cur = trades[i];
    if (prev.result !== 'LOSS') continue;
    if (typeof cur.holdMin !== 'number' || cur.holdMin >= 60) continue;
    if (!dirty(cur)) continue;
    n++;
    if (cur.rr < 0) cost += cur.rr;
  }
  return { n, cost: +cost.toFixed(1) };
};

/* Стовпчик списку розбору: підпис, смуга й кількість днів.

   Смуга рахується від найчастішої відповіді в СВОЄМУ списку, а не від
   кількості днів узагалі. Якщо «страх» траплявся тричі за десять
   днів, він має виглядати як головна причина серед причин — а не як
   майже порожня смуга, бо решту сім днів питання просто не ставилось. */
function ReviewList({ title, items, empty, tone }) {
  const top = Math.max(1, ...items.map((x) => x.days));

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: F.sans, color: 'var(--edge-text4, #4A4A52)' }}
      >
        {title}
      </span>

      {items.length === 0 ? (
        <span className="text-[12.5px]" style={{ fontFamily: F.sans, color: 'var(--edge-text4, #4A4A52)' }}>
          {empty}
        </span>
      ) : (
        items.slice(0, 6).map((x) => (
          <div key={x.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px]" style={{ fontFamily: F.sans, color: 'var(--edge-text2, #B4B4BD)' }}>
                {x.label}
              </span>
              <span
                className="shrink-0 text-[12px] font-bold tabular-nums"
                style={{ fontFamily: F.mono, color: x.rgb ? `rgb(${x.rgb})` : tone }}
              >
                {x.days}
              </span>
            </div>
            <div className="h-[3px] overflow-hidden rounded-full" style={{ background: 'var(--edge-line, #26262c)' }}>
              <motion.div
                className="h-full rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: x.days / top }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                style={{ originX: 0, background: x.rgb ? `rgb(${x.rgb})` : tone }}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* Обгортка «ще не працює».

   Блок не видаляємо й не ховаємо: він уже стоїть у чиїхось збережених
   розкладках, і зникнути посеред дошки — гірше, ніж чесно сказати, що
   він поки порожній. Тому вміст глушиться й накривається бейджем,
   а кліки крізь нього не проходять — інакше кнопка всередині
   обіцяла б те, чого не станеться. */
function SoonWrap({ children }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        className="pointer-events-none flex h-full min-h-0 flex-col"
        style={{ opacity: 0.32, filter: 'grayscale(1)' }}
      >
        {children}
      </div>

      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full px-3.5 py-1.5 text-[10.5px] font-black uppercase tracking-[0.18em]"
        style={{
          fontFamily: F.mono,
          color: 'var(--edge-text2, #B4B4BD)',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--edge-line-hi, #33333f)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {tx('Скоро', 'Soon')}
      </span>
    </div>
  );
}

/* Спільний вигляд для пари «одне проти іншого».

   Три блоки психології відповідають на однакове за формою питання:
   дві групи днів чи угод, і скільки кожна дає. Тримати три майже
   однакові розмітки означало б, що вони почнуть розходитись у
   дрібницях — і читатись як три різні інструменти замість одного. */
function Duel({ rows, note, unit = 'R' }) {
  const top = Math.max(1, ...rows.map((r) => Math.abs(r.value)));

  return (
    <div className="flex h-full flex-col justify-between gap-3 pt-1">
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[12.5px]" style={{ fontFamily: F.sans, color: 'var(--edge-text2, #B4B4BD)' }}>
                {r.label}
                {r.sub && (
                  <span className="ml-1.5 text-[11.5px]" style={{ color: 'var(--edge-text4, #4A4A52)' }}>{r.sub}</span>
                )}
              </span>
              <span className="shrink-0 text-[14px] font-extrabold tabular-nums" style={{ fontFamily: F.mono, color: r.c }}>
                {signed(r.value, 2)}{unit}
              </span>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full" style={{ background: 'var(--edge-line, #26262c)' }}>
              <motion.div
                className="h-full rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.abs(r.value) / top }}
                transition={{ duration: 0.55, ease: premiumEasing }}
                style={{ originX: 0, background: r.c }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Висновок словами — і тільки якщо вибірка на нього дає право.
          Фраза «рука коштує тобі 0.4R» на трьох угодах звучить так
          само впевнено, як на трьохстах, і саме тому небезпечна. */}
      <div
        className="rounded-xl px-3.5 py-2.5 text-[12.5px] leading-[1.5]"
        style={{
          fontFamily: F.sans,
          color: 'var(--edge-text2, #B4B4BD)',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--edge-line, #26262c)',
        }}
      >
        {note}
      </div>
    </div>
  );
}

function Empty({ title, hint }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <span className="text-[13px] font-semibold" style={{ fontFamily: F.sans, color: 'var(--edge-text3, #7A7A85)' }}>
        {title}
      </span>
      <span className="text-[12px]" style={{ fontFamily: F.sans, color: 'var(--edge-text4, #4A4A52)' }}>
        {hint}
      </span>
    </div>
  );
}

const ALL_PSYCH_WIDGETS = {
  /* Читання ринку і гроші.

     Питання не про точність прогнозу — прогнозувати ринок ніхто не
     зобовʼязаний. Питання психологічне: що ти робиш у день, коли
     читання не справдилось. */
  biasmoney: {
    title: tx('Коли читання не справдилось', 'When your read was wrong'),
    hint: tx('Що ти робиш у дні, коли ринок пішов проти твого bias', 'What you do on days the market went against your bias'),
    icon: Compass, group: 'Психологія', tone: '#60a5fa', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => !!s.biasMoney,
    lockedHint: tx('Постав фактичний bias у розборі дня — і віджет стане доступним', 'Set the actual bias in your day review to unlock this widget'),
    render: ({ s }) => {
      const b = s.biasMoney;
      if (!b) {
        return <Empty title={tx('Немає звірених днів', 'No checked days')} hint={tx('Постав фактичний bias у розборі дня — і тут зʼявиться порівняння', 'Set the actual bias in your day review and the comparison will show up here')} />;
      }

      const thin = b.right.days < 3 || b.wrong.days < 3;
      const gap = b.right.perDay - b.wrong.perDay;

      return (
        <Duel
          rows={[
            { id: 'right', label: tx('Читання збіглось', 'Read was right'), sub: tx(`${b.right.days} дн · ${r1(b.right.tradesPerDay)} угод/день`, `${b.right.days} d · ${r1(b.right.tradesPerDay)} trades/day`), value: b.right.perDay, c: '#34d399' },
            { id: 'wrong', label: tx('Читання не спрацювало', 'Read was wrong'), sub: tx(`${b.wrong.days} дн · ${r1(b.wrong.tradesPerDay)} угод/день`, `${b.wrong.days} d · ${r1(b.wrong.tradesPerDay)} trades/day`), value: b.wrong.perDay, c: '#f87171' },
          ]}
          note={thin ? (
            <>{tx(`Потрібно хоча б по три дні кожного типу. Поки збіглось ${b.rate}% із ${b.days}`, `You need at least three days of each type. So far ${b.rate}% of ${b.days} matched`)}</>
          ) : (
            <>
              {tx('Читання збігається в', 'Your read is right on')} <b style={{ color: 'var(--edge-text, #FAFAFA)' }}>{b.rate}%</b> {tx('днів.', 'of days.')}
              {' '}{tx('У дні помилки ти береш', 'On wrong days you take')}{' '}
              <b style={{ color: b.wrong.tradesPerDay > b.right.tradesPerDay ? '#f87171' : '#34d399' }}>
                {r1(b.wrong.tradesPerDay)}
              </b>{' '}
              {tx(`угод проти ${r1(b.right.tradesPerDay)}, а різниця в результаті —`, `trades vs ${r1(b.right.tradesPerDay)}, and the difference in results is`)}{' '}
              <b style={{ color: gap >= 0 ? '#34d399' : '#f87171' }}>{r2(Math.abs(gap))}R</b> {tx('на день', 'per day')}
            </>
          )}
        />
      );
    },
  },

  /* Слово проти діла. */
  conflict: {
    title: tx('Слово проти діла', 'Words vs actions'),
    hint: tx('Дні, де вечірня відповідь розійшлась із журналом', 'Days when your evening answer didn\'t match the journal'),
    icon: ScanEye, group: 'Психологія', tone: '#fbbf24', shape: 'list', defaultW: 2, defaultH: 3,
    render: ({ s }) => {
      const list = s.conflicts || [];

      if (!list.length) {
        return (
          <Empty
            title={tx('Розбіжностей немає', 'No mismatches')}
            hint={tx('Вечірні відповіді сходяться з тим, що в журналі — це найкращий результат цього блоку', 'Your evening answers match your journal — the best possible result for this block')}
          />
        );
      }

      return (
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1 pt-1">
          <span className="text-[12px]" style={{ fontFamily: F.sans, color: 'var(--edge-text3, #7A7A85)' }}>
            {tx('Увечері здавалось одне, у журналі стоїть інше. Саме ці дні варто перечитати', 'In the evening it felt one way, the journal says another. These are the days worth rereading')}
          </span>

          {list.slice(0, 12).map((c, i) => (
            <div
              key={`${c.date}-${i}`}
              className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--edge-line, #26262c)' }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-semibold" style={{ fontFamily: F.sans, color: c.tone }}>
                  «{c.said}»
                </span>
                <span className="shrink-0 text-[11px] tabular-nums" style={{ fontFamily: F.mono, color: 'var(--edge-text4, #4A4A52)' }}>
                  {c.date.slice(5).replace('-', '.')}
                </span>
              </div>
              <span className="text-[12.5px]" style={{ fontFamily: F.sans, color: 'var(--edge-text2, #B4B4BD)' }}>
                {c.real}
              </span>
            </div>
          ))}
        </div>
      );
    },
  },


  /* Ціна виходу руками.

     Стоп і тейк поставлені ДО входу, холодною головою. Рішення
     закрити руками приймається посеред угоди, коли емоція вже
     працює. Різниця в середньому R між цими групами — буквально ціна
     одного такого рішення, порахована на власних грошах.

     Це найсильніше, що ми зараз уміємо сказати про психологію з
     чистих даних: тут нічого не треба відмічати вручну, термінал
     сказав усе сам. */
  handcost: {
    title: tx('Ціна виходу руками', 'Cost of manual exits'),
    hint: tx('Скільки коштує рішення закрити позицію самому замість ордера', 'What it costs to close a position yourself instead of letting the order do it'),
    icon: Hand, group: 'Психологія', tone: '#fbbf24', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => !!(s.hand && s.hand.known),
    lockedHint: tx('Доступно лише для угод з автоімпорту MT5 — причину виходу приносить термінал', 'Only available for MT5 auto-imported trades — the terminal provides the exit reason'),
    render: ({ s }) => {
      const h = s.hand || { known: 0 };
      if (!h.known) {
        return <Empty title={tx('Немає даних від термінала', 'No terminal data')} hint={tx('Причину виходу приносить автоімпорт MT5 — у ручних угодах її немає', 'The exit reason comes from MT5 auto-import — manual trades don\'t have it')} />;
      }

      const thin = h.hand.n < 5 || h.order.n < 5;
      const costs = h.delta < 0;

      return (
        <Duel
          rows={[
            { id: 'order', label: tx('Закрив ордер', 'Closed by order'), sub: tx(`тейк або стоп · ${h.order.n}`, `TP or SL · ${h.order.n}`), value: h.order.avg, c: '#34d399' },
            { id: 'hand', label: tx('Закрив руками', 'Closed manually'), sub: tx(`по ринку · ${h.hand.n}`, `at market · ${h.hand.n}`), value: h.hand.avg, c: '#fbbf24' },
          ]}
          note={thin ? (
            <>{tx('Замало виходів для висновку — потрібно хоча б по пʼять у кожній групі', 'Not enough exits to conclude — you need at least five in each group')}</>
          ) : (
            <>
              {tx('Кожен вихід руками', 'Each manual exit')} {costs ? tx('коштує', 'costs') : tx('дає', 'adds')}{' '}
              <b style={{ color: costs ? '#f87171' : '#34d399' }}>{r2(Math.abs(h.delta))}R</b>{' '}
              {costs ? tx('проти ордера', 'vs the order') : tx('понад ордер', 'over the order')}
            </>
          )}
        />
      );
    },
  },

  /* Дні за планом проти днів з відхиленнями.

     Звʼязка вечірнього розбору з грошима: сам розбір каже, як день
     минув, а це — скільки він коштував. По днях, а не по угодах:
     рішення відійти від плану приймається раз на сесію. */
  flowmoney: {
    title: tx('Дисципліна в грошах', 'Discipline in money'),
    hint: tx('Скільки дають дні за планом проти днів з відхиленнями', 'What days on plan make vs days with deviations'),
    icon: ShieldCheck, group: 'Психологія', tone: '#34d399', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => { const f = s.flowMoney; return !!f && (f.plan.days > 0 || f.drift.days > 0); },
    lockedHint: tx('Відмічай у плані, як минув день — і віджет стане доступним', 'Mark how your day went in the plan to unlock this widget'),
    render: ({ s }) => {
      const f = s.flowMoney;
      if (!f || (!f.plan.days && !f.drift.days)) {
        return <Empty title={tx('Розборів ще замало', 'Not enough reviews yet')} hint={tx('Відмічай у плані, як минув день — і тут зʼявиться його ціна', 'Mark how your day went in the plan and its cost will show up here')} />;
      }

      const thin = f.plan.days < 3 || f.drift.days < 3;
      const gap = f.plan.perDay - f.drift.perDay;

      return (
        <Duel
          rows={[
            { id: 'plan', label: tx('За планом', 'On plan'), sub: tx(`${f.plan.days} дн · ${f.plan.trades} угод`, `${f.plan.days} d · ${f.plan.trades} ${f.plan.trades === 1 ? 'trade' : 'trades'}`), value: f.plan.perDay, c: '#34d399' },
            { id: 'drift', label: tx('З відхиленнями', 'With deviations'), sub: tx(`${f.drift.days} дн · ${f.drift.trades} угод`, `${f.drift.days} d · ${f.drift.trades} ${f.drift.trades === 1 ? 'trade' : 'trades'}`), value: f.drift.perDay, c: '#fbbf24' },
          ]}
          note={thin ? (
            <>{tx('Потрібно хоча б по три дні кожного типу, щоб різниця щось значила', 'You need at least three days of each type for the difference to mean anything')}</>
          ) : (
            <>
              {tx('День за планом дає на', 'A day on plan makes')}{' '}
              <b style={{ color: gap >= 0 ? '#34d399' : '#f87171' }}>{r2(Math.abs(gap))}R</b>{' '}
              {gap >= 0 ? tx('більше', 'more') : tx('менше', 'less')} {tx('за день з відхиленнями', 'than a day with deviations')}
            </>
          )}
        />
      );
    },
  },

  /* Вечірній розбір.

     Єдине місце, де видно ПРИЧИНУ, а не наслідок. Прапорці психології
     в угоді кажуть, що вхід був зі страхом; розбір дня каже, чому саме
     страх — «уже був у мінусі за день» чи «не повірив своєму аналізу».
     Це різні хвороби з однаковою температурою, і лікуються вони теж
     по-різному.

     Рахунок у днях, а не в угодах: причина стосується сесії цілком. */
  dayreview: {
    title: tx('Вечірній розбір', 'Evening review'),
    hint: tx('Причини, які ти сам назвав наприкінці дня', 'Reasons you named yourself at the end of the day'),
    icon: NotebookPen, group: 'Психологія', tone: '#8b7bff', shape: 'bars', defaultW: 2, defaultH: 3,
    ready: (s) => !!(s.review && s.review.days > 0),
    lockedHint: tx('Заповни «Як минув торговий день» у плані — і віджет стане доступним', 'Fill in "How did your trading day go" in the plan to unlock this widget'),
    render: ({ s }) => {
      const r = s.review || { days: 0, states: [], why: [], hard: [] };

      if (!r.days) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="text-[13px] font-semibold" style={{ fontFamily: F.sans, color: 'var(--edge-text3, #7A7A85)' }}>
              {tx('Розборів ще немає', 'No reviews yet')}
            </span>
            <span className="text-[12px]" style={{ fontFamily: F.sans, color: 'var(--edge-text4, #4A4A52)' }}>
              {tx('Заповни «Як минув торговий день» у плані — і причини зʼявляться тут', 'Fill in "How did your trading day go" in the plan and the reasons will show up here')}
            </span>
          </div>
        );
      }

      return (
        <div className="flex h-full flex-col gap-4 px-1">
          <span className="text-[12px]" style={{ fontFamily: F.sans, color: 'var(--edge-text3, #7A7A85)' }}>
            {tx('Зібрано з', 'Collected from')} <b style={{ color: 'var(--edge-text, #FAFAFA)' }}>{r.days}</b>{' '}
            {tx(r.days === 1 ? 'дня' : 'днів', r.days === 1 ? 'day' : 'days')} {tx('розбору', 'of reviews')}
          </span>

          <div className="flex min-w-0 flex-wrap gap-6">
            <ReviewList
              title={tx('Що керувало', 'What drove you')}
              items={r.states}
              empty={tx('Стан не відмічався', 'No state marked')}
              tone="#8b7bff"
            />
            <ReviewList
              title={tx('Чому так сталося', 'Why it happened')}
              items={r.why}
              empty={tx('Причин ще немає', 'No reasons yet')}
              tone="#fbbf24"
            />
            <ReviewList
              title={tx('Що давалось найважче', 'What was hardest')}
              items={r.hard}
              empty={tx('Не відмічалось', 'Not marked')}
              tone="#34d399"
            />
          </div>
        </div>
      );
    },
  },


  neuro: {
    title: tx('Нейропрофіль', 'Neuro-profile'),
    hint: tx('У розробці — зʼявиться разом з AI-коучем', 'In development — coming with the AI coach'),
    icon: Cpu, group: 'Психологія', tone: '#8b7bff', shape: 'gauge',
    /* Сканер + 5 осей + плитки + кнопка звіту вкладаються в h:3;
       h:4 лишав ~300px порожнечі внизу картки. */
    defaultW: 4, defaultH: 3, minH: 3,
    options: {
    },
    render: ({ s, w }) => <SoonWrap><NeuroBody s={s} w={w} /></SoonWrap>,
  },
  tilt: {
    title: tx('Ланцюг тільта', 'Tilt chain'),
    hint: tx('Що стається з наступною угодою після серії мінусів', 'What happens to your next trade after a losing streak'),
    icon: Flame, group: 'Психологія', tone: '#f87171', shape: 'curve', defaultW: 2, defaultH: 2,
    options: {
    },
    render: ({ s }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx('Ланцюг тільта складеться, щойно в журналі буде за що зачепитись', 'The tilt chain will build up as soon as your journal has something to go on')} />;
      return (
        <>
        <div className="w-full mt-2 relative group" style={{ flex: 1, minHeight: 120 }}>
          <ResponsiveContainer>
            <AreaChart data={s.chain} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="tiltGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.6}/>
                  <stop offset="30%" stopColor="#fbbf24" stopOpacity={0.4}/>
                  <stop offset="100%" stopColor="#f87171" stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
              <XAxis dataKey="depth" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} tickFormatter={(val) => val === '0' ? tx('Старт', 'Start') : `${val} L`} />
              <YAxis {...axis} />
              <RTooltip content={<TiltTooltip />} cursor={{ stroke: 'var(--edge-text4, #4A4A52)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={2} />
              <Area type="monotone" dataKey="avg" name={tx('Сер. R', 'Avg R')} stroke="url(#tiltGrad)" strokeWidth={3} fill="url(#tiltGrad)" fillOpacity={0.2} activeDot={{ r: 6, fill: '#fff', stroke: '#f87171', strokeWidth: 2 }} isAnimationActive={true} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 p-3 bg-[var(--edge-hair)] border border-[var(--edge-hair)] rounded-xl flex items-start gap-3">
          <Info size={16} className="text-[#8b7bff] mt-0.5 shrink-0" />
          <p className="text-[12px] text-[#B4B4BD] leading-[1.5] m-0">
            {tx('Після плюса твоя наступна угода дає', 'After a win your next trade makes')} <b><Delta v={s.avgAfterWin} d={2} /></b>.{' '}
            {tx('Але щойно ти ловиш мінус, наступний вхід у середньому падає до', 'But as soon as you take a loss, your next entry drops on average to')} <b><Delta v={s.avgAfterLoss} d={2} /></b>.
          </p>
        </div>
        </>
      );
    },
  },
  emotions: {
    title: tx('Емоційний розподіл', 'Emotion breakdown'),
    hint: tx('Які стани супроводжують входи і що вони дають', 'Which states come with your entries and what they bring'),
    icon: RadarIcon, group: 'Психологія', tone: '#8b7bff', shape: 'bars', defaultW: 2, defaultH: 2,
    options: {
      view: { label: tx('Вигляд', 'View'), choices: [['radar', tx('Ефективність', 'Performance')], ['pie', tx('Частка станів', 'State share')]], def: 'radar' },
    },
    render: ({ s, o }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx("Розподіл станів з'явиться, щойно в журналі буде що рахувати", 'The state breakdown will appear once your journal has something to count')} />;
      const { stateData } = derive(s);
      return (
        <>
        <p className="text-[11.5px] text-[#7A7A85] leading-[1.5] mt-1 mb-2">
          {o.view === 'pie' ? tx('Які емоції найчастіше супроводжують твої входи в ринок (у % від загальної кількості угод).', 'Which emotions most often come with your market entries (as % of all trades).') : tx('Як різні емоційні стани впливають на твій Вінрейт та Дисципліну (чисті угоди без помилок).', 'How different emotional states affect your win rate and discipline (clean trades with no mistakes).')}
        </p>

        <div className="w-full mt-2 flex items-center justify-center relative" style={{ flex: 1, minHeight: 120 }}>
          {o.view === 'pie' ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={stateData} 
                    dataKey="trades" 
                    nameKey="subject" 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={55} 
                    outerRadius={85} 
                    paddingAngle={4}
                    stroke="none"
                    isAnimationActive={true}
                  >
                    {stateData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip 
                    contentStyle={{ backgroundColor: 'var(--edge-sunken, #0D0D10)', borderColor: 'var(--edge-line, #232328)', borderRadius: '12px', fontSize: '12px', padding: '10px 14px' }}
                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    formatter={(value, name) => [tx(`${value} угод`, `${value} ${value === 1 ? 'trade' : 'trades'}`), name]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col gap-2.5">
                {stateData.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11.5px] font-medium text-[#FAFAFA]">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: e.color }} />
                    <span>{e.subject} <span className="text-[#7A7A85] ml-1">({Math.round((e.trades / s.trades.length) * 100)}%)</span></span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={stateData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <PolarGrid stroke="var(--edge-line, #232328)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--edge-text3, #7A7A85)' }} />
                <Radar name={tx('Вінрейт', 'Win rate')} dataKey="wr" stroke="var(--edge-acc, #8b7bff)" fill="var(--edge-acc, #8b7bff)" fillOpacity={0.25} isAnimationActive={true} animationDuration={800} />
                <Radar name={tx('Чистих угод', 'Clean trades')} dataKey="clean" stroke="#34d399" fill="#34d399" fillOpacity={0.18} isAnimationActive={true} animationDuration={800} />
                <RTooltip content={<ChartTip unit="%" />} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>
        </>
      );
    },
  },
  states: {
    title: tx('Стан входу → гроші', 'Entry state → money'),
    hint: tx('Рейтинг станів за тим, скільки вони платять', 'States ranked by how much they pay'),
    icon: Activity, group: 'Психологія', tone: '#34d399', shape: 'rows',
    /* Список станів + підсумковий висновок унизу не влазять у h:3 —
       останній рядок тексту йшов під прокрутку. */
    defaultW: 4, defaultH: 4, minH: 4,
    options: {
    },
    render: ({ s }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx("Рейтинг станів з'явиться, щойно в журналі буде що зважити", 'The state ranking will appear once your journal has something to weigh')} />;
      const { totalTrades, rankedStates, maxAbsNet, netTotal, impulsiveTrades, netWithoutImpulse, bestState, worstState, calmStat, tiltStat } = derive(s);
      return (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
          <div className="p-3 rounded-[12px] border border-[#34d399]/15 bg-[#34d399]/[0.05]">
            <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">{tx('Найкращий стан', 'Best state')}</span>
            <b className="block text-[15px] font-extrabold mt-1 text-[#34d399]">{EMOTION_LABEL[bestState.emotion]}</b>
            <small className="text-[11px] text-[#7A7A85]">{signed(bestState.avg, 2)}R {tx('на угоду', 'per trade')}</small>
          </div>
          <div className="p-3 rounded-[12px] border border-[#f87171]/15 bg-[#f87171]/[0.05]">
            <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">{tx('Найгірший стан', 'Worst state')}</span>
            <b className="block text-[15px] font-extrabold mt-1 text-[#f87171]">{EMOTION_LABEL[worstState.emotion]}</b>
            <small className="text-[11px] text-[#7A7A85]">{signed(worstState.avg, 2)}R {tx('на угоду', 'per trade')}</small>
          </div>
          <div className="p-3 rounded-[12px] border border-[var(--edge-hair-strong)] bg-[var(--edge-hair)]">
            <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">{tx('Без імпульсивних входів', 'Without impulsive entries')}</span>
            <div className="flex items-center gap-2 mt-1">
              <b className="text-[15px] font-extrabold text-[#7A7A85] line-through decoration-[#f87171]/60">{signed(netTotal)}R</b>
              <ArrowRight size={13} className="text-[#7A7A85]" />
              <b className="text-[15px] font-extrabold text-[#34d399]">{signed(netWithoutImpulse)}R</b>
            </div>
            <small className="text-[11px] text-[#7A7A85]">{tx(`мінус ${impulsiveTrades} угод у тільті / FOMO`, `minus ${impulsiveTrades} ${impulsiveTrades === 1 ? 'trade' : 'trades'} on tilt / FOMO`)}</small>
          </div>
        </div>

        {/* flex:1 + space-evenly, не gap: станів буває три, чотири чи
           п'ять — стільки, скільки їх реально траплялось у журналі.
           Клітинка розрахована на найбільше число, і фіксований gap
           лишав під меншим порожній хвіст знизу картки. Рядки
           розходяться на всю висоту, що лишилась після сітки зверху й
           висновку знизу, — скільки б їх не було. */}
        <div className="flex flex-col flex-1 min-h-0 justify-evenly mt-2.5">
          {rankedStates.map((e, i) => {
            const color = EMOTION_COLOR[e.emotion];
            const pos = e.net >= 0;
            const share = Math.round((e.trades / totalTrades) * 100);
            return (
              <SpotlightCard key={e.emotion} glowColor={`${color}25`} className="rounded-[12px]">
                <div className="px-4 py-3 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] transition-colors group-hover:border-[var(--edge-hair-strong)]">

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] font-black text-[#7A7A85] w-[16px] shrink-0">{i + 1}</span>
                    <span className="flex items-center gap-2 text-[13px] font-bold text-[#FAFAFA] w-[104px] shrink-0">
                      <i className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: 'none' }} />
                      {EMOTION_LABEL[e.emotion]}
                    </span>

                    <div className="relative flex-1 min-w-[140px] h-[10px] bg-[var(--edge-surface-hi)] rounded-full">
                      <div className="absolute left-1/2 -top-1 -bottom-1 w-px bg-white/15" />
                      <motion.div
                        className="absolute top-0 h-full rounded-full"
                        style={pos
                          ? { left: '50%', background: color }
                          : { right: '50%', background: color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(Math.abs(e.net) / maxAbsNet) * 50}%` }}
                        transition={{ duration: 0.9, ease: premiumEasing }}
                      />
                    </div>

                    <b className="text-[13px] font-black w-[64px] text-right shrink-0" style={{ color: pos ? '#34d399' : '#f87171' }}>
                      {signed(e.net)}R
                    </b>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap mt-2 pl-[19px] text-[11px] text-[#7A7A85]">
                    <span>{e.trades} {tx('угод', e.trades === 1 ? 'trade' : 'trades')} <span className="text-[#4A4A52]">({share}%)</span></span>
                    <span className="flex items-center gap-1.5">
                      WR
                      <span className="inline-block w-[42px] h-[3px] rounded-full bg-[#232328] overflow-hidden align-middle">
                        <span className="block h-full" style={{ width: `${e.wr}%`, background: color }} />
                      </span>
                      <b className="text-[#FAFAFA]">{e.wr}%</b>
                    </span>
                    <span>{tx('Сер.', 'Avg')} <b style={{ color: e.avg >= 0 ? '#34d399' : '#f87171' }}>{signed(e.avg, 2)}R</b></span>
                    <span className={e.mistakes ? 'text-[#f87171]' : 'text-[#7A7A85]'}>
                      {e.mistakes} {tx('помилок', e.mistakes === 1 ? 'mistake' : 'mistakes')}
                    </span>
                  </div>

                </div>
              </SpotlightCard>
            );
          })}
        </div>

        <div className="mt-3 p-3 bg-[var(--edge-surface-hi)]/80 border border-[var(--edge-hair)] rounded-[12px]">
          <p className="text-[12.5px] text-[#FAFAFA] leading-[1.6] m-0">
            <span className="text-[#8b7bff] font-bold">💡 {tx('Простими словами:', 'In plain words:')}</span> {tx('Спокійний вхід приносить', 'A calm entry makes')} <b className="text-[#34d399]">{signed(calmStat.avg, 2)}R</b>{tx(', вхід у тільті —', ', an entry on tilt makes')} <b className="text-[#f87171]">{signed(tiltStat.avg, 2)}R</b>. {tx('Різниця в', 'The difference of')} <b className="text-[var(--edge-text)]">{r2(Math.abs(calmStat.avg - tiltStat.avg))}R</b> {tx('на кожну угоду — це і є ціна одного емоційного рішення.', 'per trade is the price of one emotional decision.')}
          </p>
        </div>
        </>
      );
    },
  },
  mistakes: {
    title: tx('Реєстр помилок (Дисципліна)', 'Mistake log (discipline)'),
    hint: tx('Скільки коштує кожне порушення й скільки їх було', 'What each break costs and how many there were'),
    icon: XCircle, group: 'Психологія', tone: '#f87171', shape: 'rows', defaultW: 4, defaultH: 1,
    /* Розклад (перелік кожної помилки окремою карткою) прибрано:
       список довільної довжини й фіксована h:1 не сумісні — увімкнений
       «Показати» переповнював би клітинку. Підсумку (сума, типи, разів,
       найдорожча) досить, а по типи вже видно на самому нижньому графіку. */
    options: {},
    render: ({ s }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx("Реєстр помилок з'явиться, щойно в журналі буде що перевірити", 'The mistake log will appear once your journal has something to check')} />;
      const { worstMistake, ledgerTotal, ledgerCount, ledgerAbs } = derive(s);
      return (
        <div className="flex flex-col flex-1 min-h-0 justify-center p-2.5 bg-[var(--edge-surface-hi)]/70 border border-[#f87171]/10 rounded-[12px]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="shrink-0">
              <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">{tx('Втрачено на помилках', 'Lost to mistakes')}</span>
              <b className="block text-[21px] font-extrabold text-[#f87171] leading-tight">{r1(ledgerTotal)}R</b>
            </div>
            <div className="h-8 w-px bg-[var(--edge-hair)] hidden sm:block" />
            <div className="flex gap-5 text-[11.5px] flex-wrap">
              <span className="text-[#7A7A85]">{tx('Типів:', 'Types:')} <b className="text-[var(--edge-text)]">{s.mistakeLedger.length}</b></span>
              <span className="text-[#7A7A85]">{tx('Разів:', 'Times:')} <b className="text-[var(--edge-text)]">{ledgerCount}</b></span>
              <span className="text-[#7A7A85]">{tx('Найдорожча:', 'Costliest:')} <b className="text-[#FAFAFA]">{worstMistake.name}</b> <b className="text-[#f87171]">{signed(worstMistake.cost)}R</b></span>
            </div>
          </div>

          <div className="mt-2 w-full h-[6px] rounded-full overflow-hidden flex bg-[#232328]">
            {s.mistakeLedger.map((m, i) => (
              <div
                key={m.name}
                className="h-full"
                title={`${m.name}: ${signed(m.cost)}R`}
                style={{
                  width: `${(Math.abs(m.cost) / ledgerAbs) * 100}%`,
                  background: '#f87171',
                  opacity: 1 - i * 0.16,
                  marginRight: i < s.mistakeLedger.length - 1 ? '2px' : 0
                }}
              />
            ))}
          </div>

          <p className="text-[11.5px] text-[#7A7A85] leading-[1.4] mt-2 mb-0">
            {tx('Без цих порушень твій результат був би на', 'Without these breaks your result would be')} <b className="text-[#34d399]">{r1(Math.abs(ledgerTotal))}R</b> {tx('вищим.', 'higher.')}
          </p>
        </div>
      );
    },
  },
  plan: {
    title: tx('План проти порушень', 'Plan vs breaks'),
    hint: tx('Дві криві: угоди за планом і угоди повз нього', 'Two curves: trades on plan and trades off it'),
    icon: ShieldCheck, group: 'Психологія', tone: '#34d399', shape: 'curve', defaultW: 2, defaultH: 2,
    options: {
    },
    render: ({ s }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx("Порівняння з'явиться, щойно в журналі буде за що зачепитись", 'The comparison will appear once your journal has something to go on')} />;
      const { planChartData } = derive(s);
      return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[10px]">
          <SpotlightCard glowColor="rgba(52, 211, 153, 0.25)" className="rounded-[14px]">
            <div className="p-4 bg-[var(--edge-surface-hi)]/80 border border-[#34d399]/10 rounded-[14px] relative overflow-hidden transition-colors hover:border-[#34d399]/30">
              <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">{tx('По плану', 'On plan')}</span>
              <b className="block text-[28px] font-extrabold mt-2 mb-1 text-[#34d399]">{signed(sum(s.followed.map((t) => t.rr)))}R</b>
              <small className="text-[11.5px] font-medium text-[#7A7A85]">{s.followed.length} {tx('угод', s.followed.length === 1 ? 'trade' : 'trades')} · WR {Math.round((s.followed.filter((t) => t.result === 'WIN').length / Math.max(1, s.followed.filter((t) => t.result !== 'BE').length)) * 100)}%</small>
            </div>
          </SpotlightCard>
          <SpotlightCard glowColor="rgba(248,113,113, 0.25)" className="rounded-[14px]">
            <div className="p-4 bg-[var(--edge-surface-hi)]/80 border border-[#f87171]/10 rounded-[14px] relative overflow-hidden transition-colors hover:border-[#f87171]/30">
              <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">{tx('З порушенням', 'With breaks')}</span>
              <b className="block text-[28px] font-extrabold mt-2 mb-1 text-[#f87171]">{signed(sum(s.broken.map((t) => t.rr)))}R</b>
              <small className="text-[11.5px] font-medium text-[#7A7A85]">{s.broken.length} {tx('угод', s.broken.length === 1 ? 'trade' : 'trades')} · WR {Math.round((s.broken.filter((t) => t.result === 'WIN').length / Math.max(1, s.broken.filter((t) => t.result !== 'BE').length)) * 100)}%</small>
            </div>
          </SpotlightCard>
        </div>

        {/* Заголовок над графіком прибрано: назва картки й так каже,
           що це план проти порушень, а два кольори криво самі себе
           пояснюють через підказку. Рядок тексту коштував 23px, яких
           не вистачало картці, щоб влізти без прокрутки. */}
        <div className="mt-4 flex flex-col flex-1 min-h-0 w-full bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] p-3">
          <div className="w-full" style={{ flex: 1, minHeight: 105 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={planChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradF" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f87171" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="step" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} />
                <YAxis {...axis} />
                <RTooltip content={<PlanTooltip />} cursor={{ stroke: 'var(--edge-text4, #4A4A52)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" strokeWidth={2} />
                <Area type="monotone" dataKey="fAcc" name={tx('По плану', 'On plan')} stroke="#34d399" strokeWidth={2.5} fill="url(#gradF)" isAnimationActive={true} />
                <Area type="monotone" dataKey="bAcc" name={tx('З порушенням', 'With breaks')} stroke="#f87171" strokeWidth={2.5} fill="url(#gradB)" isAnimationActive={true} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
      );
    },
  },
  risk: {
    title: tx('Ризик і стан', 'Risk and state'),
    hint: tx('Чи росте обсяг позиції разом з емоціями', 'Whether your position size grows with your emotions'),
    icon: Gauge, group: 'Психологія', tone: '#fbbf24', shape: 'gauge',
    /* Чотири рядки шкали + вердикт-плашка внизу не влазять у h:2. */
    defaultW: 2, defaultH: 3, minH: 3,
    options: {
    },
    render: ({ s }) => {
      if (!s.trades.length) return <Empty title={tx('Ще немає угод', 'No trades yet')} hint={tx("Шкала ризику з'явиться, щойно в журналі буде що зважити", 'The risk scale will appear once your journal has something to weigh')} />;
      const { riskRows, extraRiskR, riskVerdict } = derive(s);
      return (
        <>
        <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.14em] font-black text-[#7A7A85] mt-2 mb-1.5 px-[100px]">
          <span>{tx('недобір', 'under')}</span>
          <span className="text-[#7A7A85]">{tx('ціль', 'target')}</span>
          <span>{tx('перебір', 'over')}</span>
        </div>

        {/* flex:1 + space-evenly: станів буває три чи п'ять, а
           клітинка розрахована на найбільше число — фіксований gap
           лишав під меншим порожнечу над плашками знизу. */}
        <div className="flex flex-col flex-1 min-h-0 justify-evenly">
          {riskRows.map((e) => {
            const zoneColor = e.zone === 'ok' ? '#34d399' : e.zone === 'warn' ? '#fbbf24' : '#f87171';
            const pct = Math.max(2, Math.min(98, (e.avgRisk / (TARGET_RISK * 2)) * 100));
            return (
              <SpotlightCard key={e.emotion} glowColor={`${zoneColor}22`} className="rounded-[12px]">
                <div className="px-3 py-2.5 bg-[var(--edge-surface-hi)]/40 border border-[var(--edge-hair)] rounded-[12px] transition-colors hover:border-[var(--edge-hair-strong)] flex items-center gap-3">

                  <span className="flex items-center gap-2 text-[12.5px] font-medium text-[#FAFAFA] w-[96px] shrink-0">
                    <i className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: EMOTION_COLOR[e.emotion] }} />
                    {EMOTION_LABEL[e.emotion]}
                  </span>

                  <div className="relative flex-1 h-[22px] flex items-center min-w-[90px]">
                    <div className="absolute inset-y-[7px] left-0 right-0 bg-[var(--edge-surface-hi)] rounded-full" />
                    <div className="absolute inset-y-[7px] rounded-full bg-[#34d399]/20" style={{ left: '45%', width: '10%' }} />
                    <div className="absolute left-1/2 top-1 bottom-1 w-px bg-white/25" />
                    <motion.div
                      className="absolute inset-y-[7px] rounded-full"
                      style={e.avgRisk >= TARGET_RISK
                        ? { left: '50%', background: zoneColor }
                        : { right: '50%', background: zoneColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.abs(pct - 50)}%` }}
                      transition={{ duration: 0.8, ease: premiumEasing }}
                    />
                    <motion.div
                      className="absolute w-[3px] h-[14px] rounded-full"
                      style={{ background: zoneColor, boxShadow: 'none' }}
                      initial={{ left: '50%' }}
                      animate={{ left: `${pct}%` }}
                      transition={{ duration: 0.8, ease: premiumEasing }}
                    />
                  </div>

                  <div className="w-[84px] text-right shrink-0">
                    <b className="block text-[13px] font-bold" style={{ color: zoneColor }}>{r2(e.avgRisk)}%</b>
                    <span className="block text-[10px] text-[#7A7A85]">
                      {e.dev >= 0 ? '+' : ''}{r2(e.dev)}% · {e.trades} {tx('уг.', e.trades === 1 ? 'trade' : 'trades')}
                    </span>
                  </div>
                </div>
              </SpotlightCard>
            );
          })}
        </div>

        <div className="mt-3 p-3 rounded-xl border border-[var(--edge-hair)] bg-[var(--edge-surface-hi)]/60 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Crosshair size={15} className="text-[#8b7bff] shrink-0" />
            <span className="text-[12px] text-[#B4B4BD] leading-snug">{tx('Зайвого ризику взято понад ціль', 'Extra risk taken above target')}</span>
          </div>
          <b className="text-[15px] font-extrabold text-[#8b7bff]">{r1(extraRiskR)}R</b>
        </div>

        {riskVerdict.warn ? (
          <div className="mt-3 p-3 bg-[#f87171]/10 border border-[#f87171]/20 rounded-xl flex items-start gap-3">
            <AlertTriangle size={16} className="text-[#f87171] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#f87171] leading-[1.5] m-0">
              <b>{tx('Попередження:', 'Warning:')}</b> {tx('У стані', 'In the state')} <b>«{EMOTION_LABEL[riskVerdict.emotion]}»</b> {tx(`твій ризик зростає до ${r2(riskVerdict.risk)}%. Ти емоційно збільшуєш об'єм, щоб відігратися. Контролюй розмір позиції!`, `your risk climbs to ${r2(riskVerdict.risk)}%. You're emotionally sizing up to win it back. Keep your position size in check!`)}
            </p>
          </div>
        ) : (
          <div className="mt-3 p-3 bg-[#34d399]/10 border border-[#34d399]/20 rounded-xl flex items-start gap-3">
            <CheckCircle2 size={16} className="text-[#34d399] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#34d399] leading-[1.5] m-0">
              <b>{tx('Все чудово:', 'All good:')}</b> {tx('Твій розмір позиції стабільний і не піддається впливу емоцій. Так тримати!', 'Your position size is steady and not swayed by emotions. Keep it up!')}
            </p>
          </div>
        )}
        </>
      );
    },
  },
  verdict: {
    title: tx('Вердикт по дисципліні', 'Discipline verdict'),
    hint: tx('Різниця між тим, що є, і тим, що вже могло бути', 'The gap between where you are and where you could already be'),
    icon: Gauge, group: 'Психологія', tone: '#8b7bff', shape: 'bars', defaultW: 4, defaultH: 2, minH: 2,
    options: {
    },
    render: ({ s }) => {
      const { netTotal, leaks, leakTotal, maxLeak, potential } = derive(s);
      return (
        <>
        <div className="mt-2 p-4 rounded-[14px] border border-[var(--edge-hair)] bg-[var(--edge-surface-hi)]/80 relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.12] pointer-events-none"
            style={{ background: 'radial-gradient(300px circle at 100% 0%, #34d399, transparent 70%)' }} />
          <div className="relative z-10 flex items-end justify-between gap-3">
            <div>
              <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#7A7A85] font-black">{tx('Зараз', 'Now')}</span>
              <b className="block text-[22px] font-extrabold text-[var(--edge-text)] leading-tight mt-1">{signed(netTotal)}R</b>
            </div>
            <ArrowRight size={16} className="text-[#4A4A52] mb-2 shrink-0" />
            <div className="text-right">
              <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[#34d399] font-black">{tx('Потенціал без витоків', 'Potential without leaks')}</span>
              <b className="block text-[22px] font-extrabold text-[#34d399] leading-tight mt-1">{signed(potential)}R</b>
            </div>
          </div>

          <div className="relative z-10 mt-3 w-full h-2 bg-[#232328] rounded-full overflow-hidden flex">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, (netTotal / Math.max(1, potential)) * 100))}%` }}
              transition={{ duration: 1.1, ease: premiumEasing }}
              className="h-full bg-gradient-to-r from-[#8b7bff] to-[#34d399]"
            />
            <div className="flex-1 h-full bg-[#f87171]/25" />
          </div>
          <p className="relative z-10 text-[11.5px] text-[#7A7A85] leading-[1.5] mt-2.5 m-0">
            {tx('Дисципліна коштує тобі', 'Discipline is costing you')} <b className="text-[#f87171]">{r1(leakTotal)}R</b> {tx('— це різниця між тим, що є, і тим, що вже могло бути.', '— the gap between where you are and where you could already be.')}
          </p>
        </div>

        <h4 className="text-[9.5px] text-[#7A7A85] font-black uppercase tracking-[0.16em] mt-4 mb-2 flex items-center gap-2">
          <Droplet size={12} /> {tx('Куди течуть гроші', 'Where the money leaks')}
        </h4>

        <div className="flex flex-col gap-2">
          {leaks.map((l) => {
            const Icon = l.icon;
            const share = (l.cost / Math.max(1, leakTotal)) * 100;
            return (
              <SpotlightCard key={l.name} glowColor={`${l.color}22`} className="rounded-[12px]">
                <div className="p-3 bg-[var(--edge-surface-hi)]/60 border border-[var(--edge-hair)] rounded-[12px] transition-colors hover:border-[var(--edge-hair-strong)]">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 text-[12.5px] font-medium text-[#FAFAFA] min-w-0">
                      <Icon size={14} style={{ color: l.color }} className="shrink-0" />
                      <span className="truncate">{l.name}</span>
                    </div>
                    <b className="text-[13px] shrink-0" style={{ color: l.color }}>−{r1(l.cost)}R</b>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 bg-[#232328] h-[4px] rounded-full overflow-hidden">
                      <motion.div className="h-full rounded-full" style={{ background: l.color }}
                        initial={{ width: 0 }} animate={{ width: `${(l.cost / maxLeak) * 100}%` }}
                        transition={{ duration: 0.9, ease: premiumEasing }} />
                    </div>
                    <span className="text-[10px] font-black text-[#7A7A85] w-[30px] text-right">{Math.round(share)}%</span>
                  </div>
                  <p className="text-[11px] text-[#7A7A85] mt-1.5 m-0 leading-snug">{l.fix}</p>
                </div>
              </SpotlightCard>
            );
          })}
        </div>

        <p className="text-[10.5px] text-[#4A4A52] mt-3 m-0 leading-snug">
          {tx('Категорії частково перетинаються — одна угода може бути і в тільті, і з порушенням плану.', 'Categories partly overlap — one trade can be both on tilt and off plan.')}
        </p>
        </>
      );
    },
  },
  checklist: {
    title: tx('Чек-лист перед входом', 'Pre-entry checklist'),
    hint: tx('Як часто ти реально дотримувався кожного правила', 'How often you actually followed each rule'),
    icon: Target, group: 'Психологія', tone: '#34d399', shape: 'rows', defaultW: 4, defaultH: 4, minH: 3,
    options: {
    },
    render: ({ s }) => {
      const { totalTrades, liveRules } = derive(s);
      return (
        <>
        <p className="text-[11.5px] text-[#7A7A85] leading-[1.5] mt-1 mb-3 m-0">
          {tx(`Не галочки, а факт: як часто ти реально дотримувався кожного правила за ${totalTrades} угод.`, `Not checkboxes, but facts: how often you actually followed each rule over ${totalTrades} ${totalTrades === 1 ? 'trade' : 'trades'}.`)}
        </p>

        {/* flex:1 + space-evenly: правил буває від двох до шести —
           стільки, скільки типів помилок трапилось у журналі. */}
        <div className="flex flex-col flex-1 min-h-0 justify-evenly">
          {liveRules.map((r, i) => {
            const color = r.pct >= 90 ? '#34d399' : r.pct >= 70 ? '#fbbf24' : '#f87171';
            const broken = r.total - r.ok;
            return (
              <div key={i} className="p-3 bg-[var(--edge-surface-hi)]/50 border border-[var(--edge-hair)] rounded-[12px] hover:border-[var(--edge-hair-strong)] transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {r.pct >= 90
                      ? <CheckCircle2 size={15} className="text-[#34d399] shrink-0 mt-[1px]" />
                      : <XCircle size={15} style={{ color }} className="shrink-0 mt-[1px]" />}
                    <span className="text-[12.5px] font-medium text-[#FAFAFA] leading-snug">{r.txt}</span>
                  </div>
                  <b className="text-[13px] shrink-0" style={{ color }}>{r.pct}%</b>
                </div>

                <div className="w-full bg-[#232328] h-[4px] rounded-full overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ background: color }}
                    initial={{ width: 0 }} animate={{ width: `${r.pct}%` }}
                    transition={{ duration: 0.9, ease: premiumEasing }} />
                </div>

                <div className="flex justify-between text-[10.5px] text-[#7A7A85] mt-1.5">
                  <span>{broken > 0 ? tx(`${broken} порушень`, `${broken} ${broken === 1 ? 'break' : 'breaks'}`) : tx('без порушень', 'no breaks')}</span>
                  {r.cost > 0.01 && <span>{tx('ціна:', 'cost:')} <b className="text-[#f87171]">−{r1(r.cost)}R</b></span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 p-3 rounded-xl border border-[#8b7bff]/20 bg-[#8b7bff]/[0.06] flex items-start gap-2.5">
          <Target size={15} className="text-[#8b7bff] mt-0.5 shrink-0" />
          <p className="text-[11.5px] text-[#B4B4BD] leading-[1.5] m-0">
            {tx('Фокус тижня —', 'Focus of the week:')} <b className="text-[var(--edge-text)]">«{liveRules[0]?.txt}»</b>. {tx(`Це найслабше правило: ${liveRules[0]?.pct}% виконання.`, `It's your weakest rule: ${liveRules[0]?.pct}% followed.`)}
          </p>
        </div>
        </>
      );
    },
  },
  /* ---------- нові розрізи ---------- */

  streaks: {
    title: tx('Серії', 'Streaks'),
    hint: tx('Найдовші смуги плюсів, мінусів і чистих угод', 'Longest runs of wins, losses and clean trades'),
    icon: Layers, group: 'Психологія', tone: '#a78bfa', shape: 'bars', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => {
      const now = tailClean(s.trades);
      return (
        <Big
          w={w}
          tone="#a78bfa"
          value={String(s.bestW || 0)}
          facts={[
            [tx('плюсів поспіль', 'wins in a row'), String(s.bestW || 0)],
            [tx('мінусів поспіль', 'losses in a row'), String(s.worstL || 0)],
            [tx('чистих поспіль', 'clean in a row'), String(s.cleanStreak || 0)],
            [tx('зараз без помилок', 'current clean run'), String(now)],
          ]}
          note={now >= 3
            ? tx(`Зараз тримаєш ${now} угод поспіль без жодного порушення.`, `You're currently on ${now} trades in a row without a single break.`)
            : tx('Серія чистих угод обривається на першому ж порушенні — це найдешевший лічильник, який у тебе є.', 'A clean streak ends at the first break — it\'s the cheapest counter you have.')}
        />
      );
    },
  },

  revenge: {
    title: tx('Помста ринку', 'Revenge trading'),
    hint: tx('Входи протягом години після збитку, взяті повз правила', 'Entries within an hour of a loss, taken against your rules'),
    icon: Flame, group: 'Психологія', tone: '#f87171', shape: 'dip', defaultW: 1, defaultH: 1,
    options: {},
    render: ({ s, w }) => {
      const { n, cost } = revengeCost(s.trades);
      const share = s.trades.length ? Math.round((n / s.trades.length) * 100) : 0;
      return (
        <Big
          w={w}
          tone={n ? '#f87171' : '#34d399'}
          value={n ? `${r1(cost)}R` : '—'}
          facts={[
            [tx('таких входів', 'such entries'), String(n)],
            [tx('від усіх угод', 'of all trades'), `${share}%`],
            [tx('середній збиток', 'average loss'), n ? `${r2(cost / n)}R` : '—'],
            [tx('за весь період', 'whole period'), tx(`${s.trades.length} угод`, `${s.trades.length} ${s.trades.length === 1 ? 'trade' : 'trades'}`)],
          ]}
          note={n
            ? tx('Угода відкрита менш ніж за годину після мінуса й із власноруч відміченим порушенням. Класична спроба відігратись.', 'A trade opened less than an hour after a loss, with a break you marked yourself. A classic attempt to win it back.')
            : tx('Жодного входу відразу після збитку з порушенням правил. Пауза після мінуса працює.', 'Not a single rule-breaking entry right after a loss. Your post-loss pause is working.')}
        />
      );
    },
  },

  cleancurve: {
    title: tx('Крива чистоти', 'Clean-trade curve'),
    hint: tx('Частка угод без порушень у ковзному вікні', 'Share of break-free trades in a rolling window'),
    icon: Sparkles, group: 'Психологія', tone: '#34d399', shape: 'curve', defaultW: 2, defaultH: 2,
    /* Вікно за замовчуванням — 10 угод: менше — cleanSeries повертає
       [], і картка на дошці одразу каже «замало угод». Той самий
       принцип, що й із сетапами: не давати додати те, що зараз
       нема з чого показати. */
    ready: (s) => (s.trades || []).length >= 10,
    lockedHint: tx('Назбирай хоча б 10 угод — і крива стане доступною', 'Log at least 10 trades to unlock the curve'),
    options: {
      win: { label: tx('Вікно', 'Window'), choices: [['5', '5'], ['10', '10'], ['20', '20']], def: '10' },
    },
    render: ({ s, o }) => {
      const win = Number(o.win) || 10;
      const rows = cleanSeries(s.trades, win);
      if (!rows.length) {
        return <Hollow>{tx(`Замало угод для вікна в ${win}. Ще трохи журналу, і крива зʼявиться.`, `Not enough trades for a window of ${win}. A bit more journaling and the curve will appear.`)}</Hollow>;
      }
      const last = rows[rows.length - 1].pct;
      const first = rows[0].pct;
      return (
        <>
          <p className="m-0 mt-1 mb-2 text-[11.5px] leading-[1.5]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
            {tx('Підсумковий відсоток однаковий у того, хто виправився місяць тому, і в того, хто саме зараз розсипається. Крива показує напрямок.', 'The overall percentage looks the same for someone who improved a month ago and someone falling apart right now. The curve shows the direction.')}
          </p>
          <div className="w-full" style={{ flex: 1, minHeight: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows} margin={{ top: 6, right: 10, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="cleanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="n" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} />
                <YAxis domain={[0, 100]} {...axis} />
                <RTooltip content={<ChartTip unit="%" />} />
                <ReferenceLine y={80} stroke="#34d399" strokeDasharray="4 4" strokeOpacity={0.4} />
                <Area
                  type="monotone" dataKey="pct" name={tx('Чистих', 'Clean')}
                  stroke="#34d399" strokeWidth={2.5} fill="url(#cleanGrad)"
                  isAnimationActive animationDuration={420}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="m-0 mt-2 text-[11.5px] leading-[1.5]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
            {tx('Було', 'Was')} <b style={{ color: 'var(--edge-text)' }}>{first}%</b>{tx(', стало', ', now')}{' '}
            <b style={{ color: last >= first ? '#34d399' : '#f87171' }}>{last}%</b>. {tx('Пунктир — вісімдесят відсотків, робочий рівень.', 'The dashed line is eighty percent, the working level.')}
          </p>
        </>
      );
    },
  },

  dowmood: {
    title: tx('Дисципліна по днях', 'Discipline by weekday'),
    hint: tx('У який день тижня правила ламаються найчастіше', 'Which weekday your rules break most often'),
    icon: CalendarDays, group: 'Психологія', tone: '#fbbf24', shape: 'bars', defaultW: 2, defaultH: 2,
    options: {
      metric: { label: tx('Показник', 'Metric'), choices: [['rate', tx('Частка порушень', 'Break rate')], ['cost', tx('Ціна порушень', 'Cost of breaks')]], def: 'rate' },
    },
    render: ({ s, o }) => {
      const rows = byDowDiscipline(s.trades);
      if (!rows.some((r) => r.trades)) return <Hollow>{tx('За цей період угод по днях тижня немає.', 'No trades by weekday in this period.')}</Hollow>;
      const isRate = o.metric !== 'cost';
      const worst = [...rows].sort((a, b) => (isRate ? b.rate - a.rate : a.cost - b.cost))[0];
      return (
        <>
          <div className="w-full mt-2" style={{ flex: 1, minHeight: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 6, right: 10, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="day" {...axis} tick={{ fontSize: 11, fill: 'var(--edge-text3, #7A7A85)' }} />
                <YAxis {...axis} />
                <RTooltip content={<ChartTip unit={isRate ? '%' : 'R'} />} cursor={{ fill: '#ffffff08' }} />
                <Bar
                  dataKey={isRate ? 'rate' : 'cost'}
                  name={isRate ? tx('Порушень', 'Breaks') : tx('Ціна', 'Cost')}
                  radius={[5, 5, 0, 0]} maxBarSize={44}
                  isAnimationActive animationDuration={420}
                >
                  {rows.map((r) => (
                    <Cell
                      key={r.day}
                      fill={isRate
                        ? (r.rate >= 50 ? '#f87171' : r.rate >= 25 ? '#fbbf24' : '#34d399')
                        : '#f87171'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {worst && worst.trades > 0 && (
            <p className="m-0 mt-2 text-[11.5px] leading-[1.5]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
              {tx('Найгірший день —', 'Worst day:')} <b style={{ color: 'var(--edge-text)' }}>{worst.day}</b>:{' '}
              {isRate
                ? <>{tx(`${worst.rate}% угод із порушенням`, `${worst.rate}% of trades with breaks`)}</>
                : <>{tx(`порушення коштували ${r1(worst.cost)}R`, `breaks cost ${r1(worst.cost)}R`)}</>}
              {tx(`, усього ${worst.trades} угод.`, `, ${worst.trades} ${worst.trades === 1 ? 'trade' : 'trades'} total.`)}
            </p>
          )}
        </>
      );
    },
  },

  hourrisk: {
    title: tx('Години зриву', 'Break-down hours'),
    hint: tx('О котрій годині ти найчастіше виходиш за правила', 'What time of day you most often break your rules'),
    icon: Clock, group: 'Психологія', tone: '#f87171', shape: 'bars', defaultW: 2, defaultH: 2,
    ready: (s) => (s.trades || []).some((t) => typeof t.hour === 'number'),
    lockedHint: tx('Заповни час входу хоч в одній угоді — і графік стане доступним', 'Fill in the entry time on at least one trade to unlock this chart'),
    options: {
    },
    render: ({ s }) => {
      const rows = byHourDiscipline(s.trades);
      if (!rows.length) return <Hollow>{tx('У журналі поки немає часу входу, тож розріз по годинах порожній.', 'Your journal has no entry times yet, so the hourly breakdown is empty.')}</Hollow>;
      const worst = [...rows].filter((r) => r.trades >= 2).sort((a, b) => b.rate - a.rate)[0];
      return (
        <>
          <div className="w-full mt-2" style={{ flex: 1, minHeight: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 6, right: 10, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="hour" {...axis} tick={{ fontSize: 10, fill: 'var(--edge-text3, #7A7A85)' }} />
                <YAxis domain={[0, 100]} {...axis} />
                <RTooltip content={<ChartTip unit="%" />} cursor={{ fill: '#ffffff08' }} />
                <Bar dataKey="rate" name={tx('Порушень', 'Breaks')} radius={[5, 5, 0, 0]} maxBarSize={34} isAnimationActive animationDuration={420}>
                  {rows.map((r) => (
                    <Cell key={r.hour} fill={r.rate >= 50 ? '#f87171' : r.rate >= 25 ? '#fbbf24' : '#34d399'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {worst && (
            <p className="m-0 mt-2 text-[11.5px] leading-[1.5]" style={{ color: 'var(--edge-text3, #7A7A85)' }}>
              {tx('Найбільше порушень о', 'Most breaks at')} <b style={{ color: 'var(--edge-text)' }}>{worst.hour}</b>: {tx(`${worst.rate}% від ${worst.trades} угод`, `${worst.rate}% of ${worst.trades} ${worst.trades === 1 ? 'trade' : 'trades'}`)}
              {worst.cost < 0 && <>{tx(` і ${r1(worst.cost)}R збитку`, ` and ${r1(worst.cost)}R lost`)}</>}.
            </p>
          )}
        </>
      );
    },
  },

  aicoach: {
    title: tx('AI-психолог', 'AI psychologist'),
    hint: tx('Читає твої угоди й відповідає на питання про них', 'Reads your trades and answers questions about them'),
    icon: Sparkles, group: 'Психологія', tone: '#8b7bff', shape: 'number',
    /* Живе лише в боковій колонці (SIDE_IDS), на всю її ширину —
       defaultW мусить бути 4, як у verdict/checklist поруч, інакше
       Board.jsx (що тепер завжди бере розмір із реєстру, а не зі
       збереженої розкладки) посадить картку вдвічі вужчою. */
    defaultW: 4, defaultH: 1,
    options: {
    },
    render: () => (
      /* Плитка тут фіксовано h:1. Графік лишається — ComingSoon сам
         ховає його через контейнерний медіа-запит, коли колонці
         реально затісно для графіка й тексту разом, і повертає, щойно
         місця вистачає. */
      <ComingSoon
        tone="#8b7bff"
        title={tx('AI-психолог', 'AI psychologist')}
        text={tx('Читає твої угоди й відповідає на питання про них.', 'Reads your trades and answers questions about them.')}
      />
    ),
  },
};

/* Стара сторінка стояла на двох нерівних колонках — широкій зліва й
   вужчій, приклеєній справа (AI-психолог → вердикт → чек-лист), а не
   на одній спільній сітці. Дошку це не вміє: одна сітка — один
   реєстр. Тому дошки тепер дві, кожна зі своєю розкладкою й
   бібліотекою — по суті два «Огляди» поруч, — а 2fr/1fr-колонки й
   sticky для правої малює вже сама Psychology.jsx. Ліва лишається
   тим самим реєстром, що й був: сім блоків старого дизайну плюс пʼять
   розрізів, яких там не було (streaks, revenge, cleancurve, dowmood,
   hourrisk) — вони лишаються в бібліотеці, не в дефолтних слотах. */
const MAIN_IDS = ['handcost', 'flowmoney', 'biasmoney', 'conflict', 'neuro', 'dayreview', 'tilt', 'emotions', 'states', 'mistakes', 'plan', 'risk', 'streaks', 'revenge', 'cleancurve', 'dowmood', 'hourrisk'];
const SIDE_IDS = ['aicoach', 'verdict', 'checklist'];

const pickWidgets = (ids) => Object.fromEntries(ids.map((id) => [id, ALL_PSYCH_WIDGETS[id]]));

export const PSYCH_MAIN_WIDGETS = pickWidgets(MAIN_IDS);
export const PSYCH_SIDE_WIDGETS = pickWidgets(SIDE_IDS);

/* Порядок за тим, що ми справді вміємо порахувати.

   Нейропрофіль стояв першим і був обличчям розділу — а показував
   індекс, зібраний із припущень. Тепер угорі те, що спирається на
   факти: ціна виходу руками (її каже термінал), дисципліна в грошах і
   вечірній розбір (їх каже сам трейдер). Нейропрофіль лишився в
   реєстрі й у дошці, але сірим і з позначкою. */
export const PSYCH_MAIN_DEFAULT = [
  /* Розділ читається як розповідь, і порядок — це її сюжет.

     1. ЩО РОБЛЯТЬ РУКИ. Ціна виходу руками не потребує від людини
        жодної відмітки: термінал сказав усе сам. Тому вона перша —
        це єдина цифра тут, з якою неможливо посперечатись.

     2. ЩО ТИ САМ ПРО СЕБЕ СКАЗАВ і скільки це коштувало: дисципліна
        в грошах і поведінка в дні, коли читання не справдилось.

     3. ДЕ ОДНЕ НЕ СХОДИТЬСЯ З ІНШИМ. «Слово проти діла» — головне,
        заради чого варто тримати обидва джерела: жодне з них окремо
        цього не бачить.

     4. Далі — старі блоки по самих угодах, і в самому кінці сірий
        нейропрофіль, якого ще немає. */
  { id: 'handcost', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'flowmoney', h: 2, w: 2, p: 'inherit', o: {} },

  { id: 'dayreview', h: 3, w: 4, p: 'inherit', o: {} },

  { id: 'biasmoney', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'conflict', h: 3, w: 2, p: 'inherit', o: {} },

  { id: 'tilt', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'emotions', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'states', h: 4, w: 2, p: 'inherit', o: {} },
  { id: 'mistakes', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'plan', h: 2, w: 2, p: 'inherit', o: {} },
  { id: 'risk', h: 3, w: 2, p: 'inherit', o: {} },

  { id: 'neuro', h: 3, w: 4, p: 'inherit', o: {} },
];



/* Права колонка: кожен блок на всю її ширину (w:4 — «на всю ширину
   ЦІЄЇ дошки», яка сама вужча за ліву), тож вони стають одне під
   одним, як і в старому дизайні, а не діляться навпіл. */
export const PSYCH_SIDE_DEFAULT = [
  { id: 'aicoach', h: 1, w: 4, p: 'inherit', o: {} },
  { id: 'verdict', h: 2, w: 4, p: 'inherit', o: {} },
  { id: 'checklist', h: 4, w: 4, p: 'inherit', o: {} },
];
