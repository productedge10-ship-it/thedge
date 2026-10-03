import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ReferenceLine,
} from 'recharts';
import {
  ShieldAlert, Info, AlertTriangle, RotateCcw, Download,
} from 'lucide-react';

import { T } from '../../lib/theme';
import { Panel } from './ui';
import { simulate, verdict, fromTrades, PRESET } from '../../lib/monteCarlo';
import { t as tx } from '../../lib/lang';

/* ==================================================================
   Монте-Карло.

   Калькулятор, а не звіт по журналу. Усі параметри вводить людина —
   вінрейт, RR, ризик, межі. Питання «а що буде, якщо торгувати з
   вінрейтом 45% і RR 2 при ризику 1%» не потребує історії взагалі,
   воно потребує арифметики, повтореної тисячу разів.

   Журнал тут лише зручність: одна кнопка підставляє реальні цифри,
   якщо вони вже є. Без неї все працює з першого дня.
================================================================== */

const GROUPS = [
  {
    title: tx('Твоя система', 'Your system'),
    hint: tx('з чого складається перевага', 'what your edge is made of'),
    fields: [
      { id: 'winRate', label: tx('Вінрейт', 'Win rate'), unit: '%', min: 5, max: 90, step: 1 },
      { id: 'rr', label: tx('Середній RR', 'Average RR'), unit: '', min: 0.2, max: 6, step: 0.1 },
      { id: 'riskPct', label: tx('Ризик на угоду', 'Risk per trade'), unit: '%', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  {
    title: tx('Межі рахунку', 'Account limits'),
    hint: tx('правила пропа або власні', 'prop firm rules or your own'),
    fields: [
      { id: 'dailyPct', label: tx('Денний ліміт', 'Daily limit'), unit: '%', min: 0, max: 20, step: 0.5 },
      { id: 'ddPct', label: tx('Макс. просадка', 'Max drawdown'), unit: '%', min: 0, max: 40, step: 0.5 },
      { id: 'targetPct', label: tx('Ціль етапу', 'Phase target'), unit: '%', min: 0, max: 40, step: 0.5 },
    ],
  },
  {
    title: tx('Темп', 'Pace'),
    hint: tx('як довго й як часто', 'how long and how often'),
    fields: [
      { id: 'perDay', label: tx('Угод на день', 'Trades per day'), unit: '', min: 1, max: 20, step: 1 },
      { id: 'horizon', label: tx('Горизонт', 'Horizon'), unit: tx(' угод', ' trades'), min: 20, max: 400, step: 10 },
    ],
  },
];

const axis = { stroke: 'var(--edge-text4, var(--edge-text4))', fontSize: 10, tickLine: false, axisLine: false };

function Slider({ label, unit, value, min, max, step, onChange }) {
  return (
    <div className="min-w-0 rounded-xl px-3.5 py-3" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {label}
        </span>
        <span className="ml-auto text-[15px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.acc }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: T.acc }}
      />
    </div>
  );
}

function Odds({ label, value, tone, hint }) {
  return (
    <div className="min-w-0 rounded-xl p-4" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </div>
      <div className="text-[28px] font-bold leading-none tabular-nums" style={{ fontFamily: T.mono, color: tone }}>
        {value}<span className="text-[16px]" style={{ opacity: 0.6 }}>%</span>
      </div>
      {hint && (
        <div className="mt-2 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.45 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function FanTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--edge-panel, #131316)', border: `1px solid ${T.line}`, fontFamily: T.sans }}
    >
      <div style={{ color: T.text4 }}>{tx('угода', 'trade')} {label}</div>
      <div style={{ color: T.text }}>{tx('медіана', 'median')} <b style={{ fontFamily: T.mono }}>{d.p50}%</b></div>
      <div style={{ color: T.text3 }}>{tx('половина сценаріїв', 'half of scenarios')} <b style={{ fontFamily: T.mono }}>{d.p25}…{d.p75}%</b></div>
      <div style={{ color: T.text4 }}>{tx('крайні', 'extremes')} <b style={{ fontFamily: T.mono }}>{d.p05}…{d.p95}%</b></div>
    </div>
  );
}

export default function Risk({ trades, carried }) {
  /* Джерело для кнопки «взяти з журналу».

     Коли прийшла передача з першого кроку симулятора, журналом тут
     вважається вже відфільтрована історія: людина щойно вирішила, що
     тих угод у її системі немає, і підставляти їх назад було б
     дивно. Без передачі все як було — весь журнал. */
  const source = carried?.trades?.length ? carried.trades : trades;

  /* Початковий стан рахується один раз, у ледачому ініціалізаторі.
     Синхронізувати повзунки з пропом через ефект не можна: повзунки —
     це стан людини, і переписувати їх позаду неї означає стерти те,
     що вона щойно накрутила. Тому крок монтується наново (ключем
     ззовні), а не «підправляється» на льоту. */
  const seed = () => {
    const m = carried ? fromTrades(carried.trades) : null;
    return m ? { ...PRESET, winRate: m.winRate, rr: m.rr, perDay: m.perDay } : PRESET;
  };

  const [cfg, setCfg] = useState(seed);

  /* Повзунок дає десятки подій підряд, а один прогін — це 1200
     симуляцій. Без затримки палець тягне повзунок, а сторінка рахує
     кожен його піксель. */
  const [live, setLive] = useState(seed);
  useEffect(() => {
    const t = setTimeout(() => setLive(cfg), 110);
    return () => clearTimeout(t);
  }, [cfg]);

  const mine = useMemo(() => fromTrades(source), [source]);
  const sim = useMemo(() => simulate(live), [live]);
  const v = verdict(sim, live);

  /* «Скинути» повертає до стартових значень цього кроку: якщо цифри
     приїхали з першого кроку, повертатись треба до них, а не до
     заводського пресету. */
  const start = seed();
  const changed = JSON.stringify(cfg) !== JSON.stringify(start);
  const last = sim.band[sim.band.length - 1];
  const set = (id) => (n) => setCfg((s) => ({ ...s, [id]: n }));

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- параметри ---------- */}
      <Panel
        title={<><ShieldAlert size={13} /> {tx('Параметри', 'Parameters')}</>}
        right={(
          <span className="flex items-center gap-3">
            {/* Журнал тут не обовʼязковий, а зручність: кнопка є
                тільки коли є що підставляти. */}
            {mine && (
              <button
                onClick={() => setCfg((s) => ({ ...s, winRate: mine.winRate, rr: mine.rr, perDay: mine.perDay }))}
                className="inline-flex items-center gap-1.5 transition-colors"
                style={{ color: T.acc }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = 0.8)}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = 1)}
              >
                <Download size={11} strokeWidth={2.5} /> {carried ? tx('взяти з кроку 1', 'use step 1') : tx('взяти з журналу', 'use my journal')}
              </button>
            )}
            {changed && (
              <button
                onClick={() => setCfg(start)}
                className="inline-flex items-center gap-1.5 transition-colors"
                style={{ color: T.text3 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                <RotateCcw size={11} strokeWidth={2.4} /> {tx('скинути', 'reset')}
              </button>
            )}
          </span>
        )}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="min-w-0">
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {g.title}
                </span>
                <span className="text-[11px]" style={{ fontFamily: T.sans, color: T.text4 }}>{g.hint}</span>
              </div>
              <div className="flex flex-col gap-2">
                {g.fields.map((f) => (
                  <Slider
                    key={f.id}
                    label={f.label}
                    unit={f.unit}
                    value={cfg[f.id]}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    onChange={set(f.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Перевага — те, з чого все випливає. Показуємо поруч із
            беззбитковим вінрейтом: саме ця пара пояснює, чому 70%
            виграшних при RR 0.5 гірше за 35% при RR 3. */}
        <div
          className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl px-3.5 py-3"
          style={{
            background: sim.edge > 0 ? `rgba(${T.okRgb},0.06)` : `rgba(${T.badRgb},0.07)`,
            border: `1px solid ${sim.edge > 0 ? `rgba(${T.okRgb},0.2)` : `rgba(${T.badRgb},0.24)`}`,
          }}
        >
          <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {tx('Очікування на угоду:', 'Expectancy per trade:')}{' '}
            <b className="tabular-nums" style={{ fontFamily: T.mono, color: sim.edge > 0 ? T.ok : T.bad }}>
              {sim.edge > 0 ? '+' : ''}{sim.edge}R
            </b>
          </span>
          <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            {tx('Беззбитковий вінрейт для RR', 'Breakeven win rate for RR')} {cfg.rr}:{' '}
            <b className="tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>{sim.breakEvenWR}%</b>
          </span>
        </div>
      </Panel>

      {/* ---------- три відповіді ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Odds
          label={tx('Дійду до цілі', 'Hit the target')}
          value={sim.target}
          tone={sim.target >= 50 ? T.ok : T.text}
          hint={sim.toTarget ? tx(`зазвичай за ${sim.toTarget} угод`, `usually in ${sim.toTarget} ${sim.toTarget === 1 ? 'trade' : 'trades'}`) : tx('ціль за горизонтом', 'target beyond the horizon')}
        />
        <Odds
          label={tx('Зіллю рахунок', 'Blow the account')}
          value={sim.bust}
          tone={sim.bust >= 25 ? T.bad : T.text}
          hint={tx(`денний ліміт ${sim.daily}% · просадка ${sim.drawdown}%`, `daily limit ${sim.daily}% · drawdown ${sim.drawdown}%`)}
        />
        <Odds
          label={tx('Просто торгую далі', 'Still trading')}
          value={sim.open}
          tone={T.text3}
          hint={tx(`${sim.horizon} угод · ${sim.perDay} на день`, `${sim.horizon} ${sim.horizon === 1 ? 'trade' : 'trades'} · ${sim.perDay} per day`)}
        />
      </div>

      {v && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: v.tone === 'bad' ? `rgba(${T.badRgb},0.07)` : v.tone === 'warn' ? `rgba(${T.warnRgb},0.07)` : `rgba(${T.okRgb},0.06)`,
            border: `1px solid ${v.tone === 'bad' ? `rgba(${T.badRgb},0.24)` : v.tone === 'warn' ? `rgba(${T.warnRgb},0.24)` : `rgba(${T.okRgb},0.2)`}`,
          }}
        >
          {v.tone === 'ok'
            ? <Info size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.ok }} />
            : <AlertTriangle size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: v.tone === 'bad' ? T.bad : T.warn }} />}
          <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
            {v.text}
          </span>
        </div>
      )}

      {/* ---------- віяло ---------- */}
      <Panel title={tx('Куди веде ця система', 'Where this system leads')} right={<>{sim.runs} {tx('сценаріїв', 'scenarios')} · <b>{tx('смуга — половина з них', 'band — half of them')}</b></>}>
        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <ComposedChart data={sim.band} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
              <XAxis dataKey="i" {...axis} minTickGap={34} />
              <YAxis {...axis} unit="%" />
              <RTooltip content={<FanTip />} cursor={{ stroke: 'var(--edge-line-hi, var(--edge-line-hi))' }} />

              {/* Межі — головне на цьому графіку. Саме до них
                  дотягуються крайні сценарії, і бачити їх треба разом
                  із віялом, а не в окремій цифрі. */}
              {cfg.targetPct > 0 && (
                <ReferenceLine y={cfg.targetPct} stroke={T.ok} strokeDasharray="4 4"
                  label={{ value: tx('ціль', 'target'), position: 'right', fill: T.ok, fontSize: 10 }} />
              )}
              {cfg.ddPct > 0 && (
                <ReferenceLine y={-cfg.ddPct} stroke={T.bad} strokeDasharray="4 4"
                  label={{ value: tx('просадка', 'drawdown'), position: 'right', fill: T.bad, fontSize: 10 }} />
              )}
              <ReferenceLine y={0} stroke="var(--edge-line-hi, var(--edge-line-hi))" />

              {/* Дві смуги стеком: спершу невидима основа, потім
                  товщина. Так recharts малює діапазон, не вміючи
                  малювати діапазони. */}
              <Area dataKey="lo" stackId="wide" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="wideSpan" stackId="wide" stroke="none" fill={`rgba(${T.accRgb},0.10)`} isAnimationActive={false} />
              <Area dataKey="midBase" stackId="mid" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area dataKey="midSpan" stackId="mid" stroke="none" fill={`rgba(${T.accRgb},0.22)`} isAnimationActive={false} />

              <Line type="monotone" dataKey="p50" stroke={T.acc} strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="mt-2 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}>
          {tx('Лінія — медіанний сценарій. Темна смуга — половина всіх результатів, світла — девʼяносто відсотків.', 'The line is the median scenario. The dark band is half of all outcomes, the light one is ninety percent.')}
          {' '}{tx('На кінці горизонту типовий результат', 'At the end of the horizon the typical result is')} <b style={{ color: T.text2 }}>{last.p50}%</b>{tx(', а розкид від', ', with a range from')}{' '}
          <b style={{ color: T.text2 }}>{last.p05}%</b> {tx('до', 'to')} <b style={{ color: T.text2 }}>{last.p95}%</b>.
        </p>
      </Panel>

      {/* ---------- розподіл і норма ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title={tx('Розподіл результатів', 'Outcome distribution')} right={tx('де опиняється рахунок наприкінці', 'where the account ends up')}>
          <div className="h-[220px] w-full">
            <ResponsiveContainer>
              <BarChart data={sim.hist} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="x" {...axis} unit="%" minTickGap={26} />
                <YAxis {...axis} />
                <ReferenceLine x={0} stroke="var(--edge-line-hi, var(--edge-line-hi))" />
                <Bar dataKey="n" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {sim.hist.map((h, i) => (
                    <Cell key={i} fill={h.x >= 0 ? `rgba(${T.accRgb},0.75)` : 'rgba(248,113,113,0.7)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Найважливіший текст на сторінці. Більшість зривів стається
            не тоді, коли система зламалась, а тоді, коли звичайну
            серію мінусів приймають за поломку. */}
        <Panel title={tx('Що тут нормально', "What's normal here")} accent={T.warn}>
          <div className="flex flex-col gap-3">
            {[
              { k: tx('Серія мінусів', 'Losing streak'), a: tx(`${sim.streakTypical} поспіль`, `${sim.streakTypical} in a row`), b: tx(`у важкому випадку ${sim.streakBad}`, `worst case ${sim.streakBad}`) },
              { k: tx('Просадка', 'Drawdown'), a: `${sim.ddTypical}%`, b: tx(`у важкому випадку ${sim.ddBad}%`, `worst case ${sim.ddBad}%`) },
            ].map((r) => (
              <div key={r.k} className="rounded-xl px-3.5 py-3" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {r.k}
                </div>
                <div className="text-[19px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                  {r.a}
                </div>
                <div className="mt-0.5 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {r.b}
                </div>
              </div>
            ))}

            <p className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
              {tx('Це не поломка системи, це її звичайна робота. Більшість рахунків зливають не тоді, коли метод перестав працювати, а тоді, коли нормальну серію мінусів сприймають як сигнал усе поміняти.', "This isn't your system breaking — it's how it normally works. Most accounts aren't blown when the method stops working, but when a normal losing streak is taken as a signal to change everything.")}
            </p>
          </div>
        </Panel>
      </div>

      <p className="px-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
        {tx('Симуляція припускає, що вінрейт і RR лишаються сталими, а угоди незалежні одна від одної. У житті це не зовсім так — після серії мінусів людина торгує інакше. Тому читай це як межі можливого за твоїх припущень, а не як передбачення. Прогнозу заробітку тут немає свідомо: просадка з тієї ж математики виходить кориснішою, бо готує до найгіршого замість обіцяти найкраще.', "The simulation assumes your win rate and RR stay constant and trades are independent. In real life that's not quite true — people trade differently after a losing streak. So read this as the range of what's possible under your assumptions, not a prediction. There's no profit forecast here on purpose: drawdown from the same math is more useful, because it prepares you for the worst instead of promising the best.")}
      </p>
    </div>
  );
}
