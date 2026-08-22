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
    title: 'Твоя система',
    hint: 'з чого складається перевага',
    fields: [
      { id: 'winRate', label: 'Вінрейт', unit: '%', min: 5, max: 90, step: 1 },
      { id: 'rr', label: 'Середній RR', unit: '', min: 0.2, max: 6, step: 0.1 },
      { id: 'riskPct', label: 'Ризик на угоду', unit: '%', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  {
    title: 'Межі рахунку',
    hint: 'правила пропа або власні',
    fields: [
      { id: 'dailyPct', label: 'Денний ліміт', unit: '%', min: 0, max: 20, step: 0.5 },
      { id: 'ddPct', label: 'Макс. просадка', unit: '%', min: 0, max: 40, step: 0.5 },
      { id: 'targetPct', label: 'Ціль етапу', unit: '%', min: 0, max: 40, step: 0.5 },
    ],
  },
  {
    title: 'Темп',
    hint: 'як довго й як часто',
    fields: [
      { id: 'perDay', label: 'Угод на день', unit: '', min: 1, max: 20, step: 1 },
      { id: 'horizon', label: 'Горизонт', unit: ' угод', min: 20, max: 400, step: 10 },
    ],
  },
];

const axis = { stroke: 'var(--edge-text4, #4A4A52)', fontSize: 10, tickLine: false, axisLine: false };

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
      <div style={{ color: T.text4 }}>угода {label}</div>
      <div style={{ color: T.text }}>медіана <b style={{ fontFamily: T.mono }}>{d.p50}%</b></div>
      <div style={{ color: T.text3 }}>половина сценаріїв <b style={{ fontFamily: T.mono }}>{d.p25}…{d.p75}%</b></div>
      <div style={{ color: T.text4 }}>крайні <b style={{ fontFamily: T.mono }}>{d.p05}…{d.p95}%</b></div>
    </div>
  );
}

export default function Risk({ trades }) {
  const [cfg, setCfg] = useState(PRESET);

  /* Повзунок дає десятки подій підряд, а один прогін — це 1200
     симуляцій. Без затримки палець тягне повзунок, а сторінка рахує
     кожен його піксель. */
  const [live, setLive] = useState(PRESET);
  useEffect(() => {
    const t = setTimeout(() => setLive(cfg), 110);
    return () => clearTimeout(t);
  }, [cfg]);

  const mine = useMemo(() => fromTrades(trades), [trades]);
  const sim = useMemo(() => simulate(live), [live]);
  const v = verdict(sim, live);

  const changed = JSON.stringify(cfg) !== JSON.stringify(PRESET);
  const last = sim.band[sim.band.length - 1];
  const set = (id) => (n) => setCfg((s) => ({ ...s, [id]: n }));

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- параметри ---------- */}
      <Panel
        title={<><ShieldAlert size={13} /> Параметри</>}
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
                <Download size={11} strokeWidth={2.5} /> взяти з журналу
              </button>
            )}
            {changed && (
              <button
                onClick={() => setCfg(PRESET)}
                className="inline-flex items-center gap-1.5 transition-colors"
                style={{ color: T.text3 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
              >
                <RotateCcw size={11} strokeWidth={2.4} /> скинути
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
            Очікування на угоду:{' '}
            <b className="tabular-nums" style={{ fontFamily: T.mono, color: sim.edge > 0 ? T.ok : T.bad }}>
              {sim.edge > 0 ? '+' : ''}{sim.edge}R
            </b>
          </span>
          <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Беззбитковий вінрейт для RR {cfg.rr}:{' '}
            <b className="tabular-nums" style={{ fontFamily: T.mono, color: T.text2 }}>{sim.breakEvenWR}%</b>
          </span>
        </div>
      </Panel>

      {/* ---------- три відповіді ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Odds
          label="Дійду до цілі"
          value={sim.target}
          tone={sim.target >= 50 ? T.ok : T.text}
          hint={sim.toTarget ? `зазвичай за ${sim.toTarget} угод` : 'ціль за горизонтом'}
        />
        <Odds
          label="Зіллю рахунок"
          value={sim.bust}
          tone={sim.bust >= 25 ? T.bad : T.text}
          hint={`денний ліміт ${sim.daily}% · просадка ${sim.drawdown}%`}
        />
        <Odds
          label="Просто торгую далі"
          value={sim.open}
          tone={T.text3}
          hint={`${sim.horizon} угод · ${sim.perDay} на день`}
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
      <Panel title="Куди веде ця система" right={<>{sim.runs} сценаріїв · <b>смуга — половина з них</b></>}>
        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <ComposedChart data={sim.band} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
              <XAxis dataKey="i" {...axis} minTickGap={34} />
              <YAxis {...axis} unit="%" />
              <RTooltip content={<FanTip />} cursor={{ stroke: 'var(--edge-line-hi, #33333A)' }} />

              {/* Межі — головне на цьому графіку. Саме до них
                  дотягуються крайні сценарії, і бачити їх треба разом
                  із віялом, а не в окремій цифрі. */}
              {cfg.targetPct > 0 && (
                <ReferenceLine y={cfg.targetPct} stroke={T.ok} strokeDasharray="4 4"
                  label={{ value: 'ціль', position: 'right', fill: T.ok, fontSize: 10 }} />
              )}
              {cfg.ddPct > 0 && (
                <ReferenceLine y={-cfg.ddPct} stroke={T.bad} strokeDasharray="4 4"
                  label={{ value: 'просадка', position: 'right', fill: T.bad, fontSize: 10 }} />
              )}
              <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />

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
          Лінія — медіанний сценарій. Темна смуга — половина всіх результатів, світла — девʼяносто відсотків.
          На кінці горизонту типовий результат <b style={{ color: T.text2 }}>{last.p50}%</b>, а розкид
          від <b style={{ color: T.text2 }}>{last.p05}%</b> до <b style={{ color: T.text2 }}>{last.p95}%</b>.
        </p>
      </Panel>

      {/* ---------- розподіл і норма ---------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Розподіл результатів" right="де опиняється рахунок наприкінці">
          <div className="h-[220px] w-full">
            <ResponsiveContainer>
              <BarChart data={sim.hist} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
                <XAxis dataKey="x" {...axis} unit="%" minTickGap={26} />
                <YAxis {...axis} />
                <ReferenceLine x={0} stroke="var(--edge-line-hi, #33333A)" />
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
        <Panel title="Що тут нормально" accent={T.warn}>
          <div className="flex flex-col gap-3">
            {[
              { k: 'Серія мінусів', a: `${sim.streakTypical} поспіль`, b: `у важкому випадку ${sim.streakBad}` },
              { k: 'Просадка', a: `${sim.ddTypical}%`, b: `у важкому випадку ${sim.ddBad}%` },
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
              Це не поломка системи, це її звичайна робота. Більшість рахунків зливають
              не тоді, коли метод перестав працювати, а тоді, коли нормальну серію мінусів
              сприймають як сигнал усе поміняти.
            </p>
          </div>
        </Panel>
      </div>

      <p className="px-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
        Симуляція припускає, що вінрейт і RR лишаються сталими, а угоди незалежні одна від одної.
        У житті це не зовсім так — після серії мінусів людина торгує інакше. Тому читай це
        як межі можливого за твоїх припущень, а не як передбачення. Прогнозу заробітку тут немає
        свідомо: просадка з тієї ж математики виходить кориснішою, бо готує до найгіршого
        замість обіцяти найкраще.
      </p>
    </div>
  );
}
