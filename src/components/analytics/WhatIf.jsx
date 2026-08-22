import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, ReferenceLine,
} from 'recharts';
import {
  FlaskConical, AlertTriangle, Info, RotateCcw, Dices, Shuffle,
} from 'lucide-react';
import { T } from '../../lib/theme';
import { Panel } from './ui';
import {
  RULES, DIMS, apply, statsOf, breakdown, confidence, valuesOf,
} from '../../lib/whatIf';
import { generateTrades, DEMO_SIZES } from '../../lib/demoTrades';

/* ==================================================================
   «Що якби».

   Одне питання: скільки коштували власні звички. Не «скільки б я
   заробив» — цього ми не знаємо і не вгадуємо, — а «скільки забрали
   ці конкретні угоди», що вже сталося.

   Дві криві на одній осі, бо різницю треба бачити, а не рахувати в
   голові. І обовʼязково розмір вибірки поруч із результатом: без
   нього симулятор перетворюється на машинку для самообману, де з
   трьох угод виводять правило на все життя.
================================================================== */

const fmtR = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}R`;

const axis = {
  stroke: 'var(--edge-text4, #4A4A52)',
  fontSize: 10,
  tickLine: false,
  axisLine: false,
};

function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-[12px]"
      style={{ background: 'var(--edge-panel, #131316)', border: `1px solid ${T.line}`, fontFamily: T.sans }}
    >
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: <b style={{ fontFamily: T.mono }}>{fmtR(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </div>
      <div className="text-[20px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: tone || T.text }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function WhatIf({ trades: real }) {
  const [on, setOn] = useState([]);
  const [keep, setKeep] = useState({});

  /* Стенд. Тримається окремим станом, а не підмішується до реальних
     угод: людина в будь-який момент має бачити, дивиться вона на
     себе чи на згенеровану історію. */
  const [demoSize, setDemoSize] = useState(0);
  const [seed, setSeed] = useState(7);

  const demo = useMemo(
    () => (demoSize ? generateTrades(demoSize, seed) : null),
    [demoSize, seed],
  );
  const trades = demo || real;

  const toggleRule = (id) => setOn((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const toggleValue = (dim, v) => setKeep((c) => {
    const cur = c[dim] || [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    return { ...c, [dim]: next };
  });

  const reset = () => { setOn([]); setKeep({}); };

  const { kept, removed } = useMemo(() => apply(trades, on, keep), [trades, on, keep]);

  const base = useMemo(() => statsOf(trades), [trades]);
  const sim = useMemo(() => statsOf(kept), [kept]);
  const parts = useMemo(() => breakdown(trades, on), [trades, on]);

  const touched = on.length > 0 || DIMS.some((d) => (keep[d.id] || []).length);
  const conf = confidence(removed.length, kept.length);
  const diff = +(sim.net - base.net).toFixed(1);

  /* Обидві криві в одному масиві точок: інакше recharts малює їх по
     різних осях X, і однакова кількість угод виглядає різною
     довжиною лінії. */
  const chart = useMemo(() => {
    const n = Math.max(base.points.length, sim.points.length);
    return Array.from({ length: n }, (_, i) => ({
      i: i + 1,
      було: base.points[i]?.r ?? null,
      стало: sim.points[i]?.r ?? null,
    }));
  }, [base.points, sim.points]);

  /* Перемикач стенда. Показуємо завжди — зокрема й тоді, коли
     власних угод ще замало: саме там він найпотрібніший. */
  const demoBar = (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-xl px-3.5 py-3"
      style={{
        background: demo ? `rgba(${T.warnRgb},0.07)` : T.sunken,
        border: `1px solid ${demo ? `rgba(${T.warnRgb},0.26)` : T.line}`,
      }}
    >
      <Dices size={14} strokeWidth={2.3} style={{ color: demo ? T.warn : T.text4 }} />
      <span className="text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: demo ? T.warn : T.text3 }}>
        {demo ? `Демо-історія · ${demoSize} угод` : 'Тестові дані'}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {DEMO_SIZES.map((n) => {
          const active = demoSize === n;
          return (
            <button
              key={n}
              onClick={() => { setDemoSize(active ? 0 : n); reset(); }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold tabular-nums transition-colors duration-150"
              style={{
                fontFamily: T.mono,
                background: active ? `rgba(${T.warnRgb},0.14)` : 'transparent',
                border: `1px solid ${active ? `rgba(${T.warnRgb},0.4)` : T.line}`,
                color: active ? T.warn : T.text3,
              }}
            >
              {n}
            </button>
          );
        })}

        {demo && (
          <>
            <button
              onClick={() => setSeed((v) => v + 1)}
              title="Інша випадкова історія"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
              style={{ fontFamily: T.sans, border: `1px solid ${T.line}`, color: T.text3 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
            >
              <Shuffle size={12} strokeWidth={2.4} /> ще раз
            </button>
            <button
              onClick={() => { setDemoSize(0); reset(); }}
              className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
              style={{ fontFamily: T.sans, border: `1px solid ${T.line}`, color: T.text3 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
            >
              до своїх
            </button>
          </>
        )}
      </div>

      <p className="w-full text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.5 }}>
        {demo
          ? 'Це вигадана історія з навмисно закладеними звичками — подивись, як симулятор їх знаходить. У базу нічого не пишеться.'
          : 'Згенерувати історію локально, щоб побачити роботу симулятора. Твій журнал не зміниться.'}
      </p>
    </div>
  );

  if (trades.length < 5) {
    return (
      <div className="flex flex-col gap-4">
        {demoBar}
        <Panel title={<><FlaskConical size={13} /> Що якби</>}>
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <FlaskConical size={22} strokeWidth={1.6} style={{ color: T.text4 }} />
            <div className="text-[14px] font-semibold" style={{ color: T.text3 }}>Замало угод</div>
            <div className="max-w-[380px] text-[12.5px]" style={{ color: T.text4, lineHeight: 1.6 }}>
              Симулятор накладає правила на твою власну історію. Поки в ній кілька записів,
              будь-яка «закономірність» тут буде випадковістю. Увімкни тестові дані вище,
              щоб подивитись, як це працює.
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {demoBar}
      {/* ---------- правила ---------- */}
      <Panel
        title={<><FlaskConical size={13} /> Що якби я дотримувався правил</>}
        right={touched ? (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 transition-colors"
            style={{ color: T.text3 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
          >
            <RotateCcw size={11} strokeWidth={2.4} /> скинути
          </button>
        ) : 'обери правило — крива перерахується'}
      >
        <div className="flex flex-wrap gap-1.5">
          {RULES.map((r) => {
            const active = on.includes(r.id);
            const hit = trades.filter(r.test).length;
            return (
              <button
                key={r.id}
                onClick={() => toggleRule(r.id)}
                disabled={!hit}
                title={r.hint}
                className="rounded-xl px-3 py-2 text-left transition-colors duration-150"
                style={{
                  fontFamily: T.sans,
                  background: active ? `rgba(${T.accRgb},0.12)` : T.sunken,
                  border: `1px solid ${active ? T.lineAcc : T.line}`,
                  color: active ? T.acc : T.text3,
                  opacity: hit ? 1 : 0.4,
                  cursor: hit ? 'pointer' : 'not-allowed',
                }}
              >
                <span className="block text-[13px] font-semibold">{r.label}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums" style={{ color: T.text4, fontFamily: T.mono }}>
                  {hit} {hit === 1 ? 'угода' : 'угод'}
                </span>
              </button>
            );
          })}
        </div>

        {/* ---------- виміри ---------- */}
        <div className="mt-4 flex flex-col gap-3">
          {DIMS.map((d) => {
            const values = valuesOf(trades, d.id);
            if (values.length < 2) return null;
            const picked = keep[d.id] || [];
            return (
              <div key={d.id}>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Торгувати тільки · {d.label}
                  {picked.length === 0 && <span style={{ opacity: 0.7 }}> — зараз усі</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((v) => {
                    const active = picked.includes(v);
                    return (
                      <button
                        key={v}
                        onClick={() => toggleValue(d.id, v)}
                        className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
                        style={{
                          fontFamily: T.sans,
                          background: active ? `rgba(${T.accRgb},0.12)` : 'transparent',
                          border: `1px solid ${active ? T.lineAcc : T.line}`,
                          color: active ? T.acc : T.text3,
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ---------- підсумок ---------- */}
      {touched && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="grid gap-4"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Це коштувало"
              value={diff === 0 ? '—' : fmtR(diff)}
              sub={`${removed.length} угод відпало`}
              tone={diff > 0 ? T.ok : diff < 0 ? T.bad : T.text3}
            />
            <Stat label="Було" value={fmtR(base.net)} sub={`${base.trades} угод · WR ${base.wr}%`} />
            <Stat label="Стало" value={fmtR(sim.net)} sub={`${sim.trades} угод · WR ${sim.wr}%`} tone={T.text} />
            <Stat
              label="Просадка"
              value={`${sim.maxDD.toFixed(1)}R`}
              sub={`було ${base.maxDD.toFixed(1)}R`}
              tone={sim.maxDD < base.maxDD ? T.ok : sim.maxDD > base.maxDD ? T.bad : T.text3}
            />
          </div>

          {/* Надійність — поруч із цифрою, а не в кінці сторінки: саме
              тут людина вирішує, вірити їй чи ні. */}
          <div
            className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{
              background: conf.level === 'low' ? `rgba(${T.warnRgb},0.08)` : T.sunken,
              border: `1px solid ${conf.level === 'low' ? `rgba(${T.warnRgb},0.28)` : T.line}`,
            }}
          >
            {conf.level === 'low'
              ? <AlertTriangle size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.warn }} />
              : <Info size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.text4 }} />}
            <span className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
              {conf.text}
            </span>
          </div>
        </motion.div>
      )}

      {/* ---------- криві ---------- */}
      <Panel
        title="Крива в R"
        right={touched ? <>сіра — як було, кольорова — <b>без відфільтрованих</b></> : 'твоя фактична крива'}
      >
        <div className="h-[300px] w-full">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--edge-surface-hi, #18181C)" />
              <XAxis dataKey="i" {...axis} minTickGap={32} />
              <YAxis {...axis} />
              <RTooltip content={<Tip />} cursor={{ stroke: 'var(--edge-line-hi, #33333A)' }} />
              <ReferenceLine y={0} stroke="var(--edge-line-hi, #33333A)" />
              <Line
                type="monotone" dataKey="було" stroke="var(--edge-text4, #4A4A52)"
                strokeWidth={1.6} dot={false} isAnimationActive={false}
              />
              {touched && (
                <Line
                  type="monotone" dataKey="стало" stroke={diff >= 0 ? '#34d399' : '#f87171'}
                  strokeWidth={2.2} dot={false} isAnimationActive
                  animationDuration={600} connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ---------- розклад ---------- */}
      {parts.length > 0 && (
        <Panel title="Куди пішли ці R" right="за кожним правилом окремо">
          <div className="flex flex-col gap-2">
            {parts.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    {p.tag}
                  </span>
                  <span className="text-[11.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {p.count} {p.count === 1 ? 'угода' : 'угод'}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[15px] font-bold tabular-nums"
                  style={{ fontFamily: T.mono, color: p.cost < 0 ? T.bad : T.ok }}
                >
                  {fmtR(p.cost)}
                </span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}>
            Сума часток може не збігатись із загальною різницею: одна угода буває
            і в тільті, і поза планом одночасно — тоді вона рахується в обох рядках.
          </p>
        </Panel>
      )}

      {/* Дисклеймер знизу, але він тут не формальність: без нього
          вкладка обіцяє передбачення замість факту про минуле. */}
      <p className="px-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
        Це не прогноз заробітку. Прибрані угоди вже сталися, і ми лише рахуємо, скільки
        вони забрали. Що ти зробив би замість них — не знає ніхто, тому «стало» варто
        читати як ціну звички, а не як обіцянку.
      </p>
    </div>
  );
}
