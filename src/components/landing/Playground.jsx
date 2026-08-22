import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, RotateCcw, Sparkles } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { useLang } from '../../lib/i18n';
import { EdgeMonogram } from '../core/Layout';
import Term from './Term';

/* ==================================================================
   Playground.

   Найкоротший шлях зрозуміти продукт — не читати про нього, а
   натиснути. Тут вісім угод, які відвідувач перемикає сам, і все
   інше рахується наживо: R, winrate, дисципліна і головне —
   висновок, який кіт робить з цих самих цифр.

   Математика тут та сама, що в застосунку. Це не мультик з
   зарандомленими числами: якщо людина вимкне дисципліну, вона
   побачить рівно те, що побачила б у своєму журналі.
================================================================== */

const SEED = [
  { id: 1, pair: 'XAUUSD', session: 'London', setup: 'Sweep + FVG',  r: 2.4,  win: true,  plan: true,  mood: 'calm' },
  { id: 2, pair: 'GER40',  session: 'London', setup: 'Judas swing',  r: 1.8,  win: true,  plan: true,  mood: 'calm' },
  { id: 3, pair: 'EURUSD', session: 'Asia',   setup: 'No setup',     r: -1,   win: false, plan: false, mood: 'bored' },
  { id: 4, pair: 'XAUUSD', session: 'New York', setup: 'News spike', r: -1,   win: false, plan: false, mood: 'fomo' },
  { id: 5, pair: 'GER40',  session: 'London', setup: 'Sweep + FVG',  r: 3.1,  win: true,  plan: true,  mood: 'calm' },
  { id: 6, pair: 'EURUSD', session: 'New York', setup: 'Revenge',    r: -1,   win: false, plan: false, mood: 'tilt' },
  { id: 7, pair: 'XAUUSD', session: 'London', setup: 'Sweep + FVG',  r: 1.9,  win: true,  plan: true,  mood: 'calm' },
  { id: 8, pair: 'NAS100', session: 'New York', setup: 'Late entry', r: -1,   win: false, plan: false, mood: 'fomo' },
];

/* Кольори тут, підписи — у словнику: настрій називається по-різному
   трьома мовами, а червоний лишається червоним */
const MOOD_COLOR = { calm: T.ok, fomo: T.warn, tilt: T.bad, bored: T.text3 };
const MOOD_TERM = { calm: 'Calm', fomo: 'FOMO', tilt: 'Tilt', bored: 'Bored' };

const r1 = (n) => Math.round(n * 10) / 10;

/* Живе поза Playground: інакше на кожен клік React вважав би це
   новим типом компонента, перемонтовував плитку — і зміна цифри
   стрибала б замість того, щоб перетікати */
function KPI({ label, value, tone, hint }) {
  return (
    <div
      className="min-w-0 rounded-2xl px-4 py-3.5"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <div className="mb-1.5 truncate text-[11px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={String(value)}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="text-[24px] font-bold tabular-nums"
          style={{ fontFamily: T.mono, color: tone || T.text, letterSpacing: '-0.02em' }}
        >
          {value}
        </motion.div>
      </AnimatePresence>
      {hint && (
        <div className="mt-0.5 truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text3 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Playground({ compact = false }) {
  const { t: L } = useLang();
  const t = L.play;

  /* У героєві показуємо пʼять угод замість восьми: правий стовпець
     вужчий, і довгий список там перетворюється на стіну */
  const ROWS = compact ? SEED.slice(0, 5) : SEED;

  /* Спершу ввімкнені всі — людина вимикає ті, які «не рахуються»,
     і бачить, як міняється картина */
  const [on, setOn] = useState(() => ROWS.map((x) => x.id));

  const toggle = (id) =>
    setOn((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const trades = useMemo(() => ROWS.filter((x) => on.includes(x.id)), [on, ROWS]);

  const stats = useMemo(() => {
    const n = trades.length;
    if (!n) return null;

    const wins = trades.filter((x) => x.win);
    const net = trades.reduce((s, x) => s + x.r, 0);
    const byPlan = trades.filter((x) => x.plan);
    const brokePlan = trades.filter((x) => !x.plan);

    const gross = trades.filter((x) => x.r > 0).reduce((s, x) => s + x.r, 0);
    const loss = Math.abs(trades.filter((x) => x.r < 0).reduce((s, x) => s + x.r, 0));

    /* Скільки коштує кожна група — саме заради цієї різниці й
       ведеться журнал */
    const planR = byPlan.reduce((s, x) => s + x.r, 0);
    const breakR = brokePlan.reduce((s, x) => s + x.r, 0);

    const bySetup = {};
    trades.forEach((x) => {
      bySetup[x.setup] = (bySetup[x.setup] || 0) + x.r;
    });
    const bestSetup = Object.entries(bySetup).sort((a, b) => b[1] - a[1])[0];

    const bySession = {};
    trades.forEach((x) => {
      bySession[x.session] = (bySession[x.session] || 0) + x.r;
    });
    const bestSession = Object.entries(bySession).sort((a, b) => b[1] - a[1])[0];

    return {
      n,
      net: r1(net),
      wr: Math.round((wins.length / n) * 100),
      pf: loss ? r1(gross / loss) : gross ? 99 : 0,
      adherence: Math.round((byPlan.length / n) * 100),
      planR: r1(planR),
      breakR: r1(breakR),
      bestSetup,
      bestSession,
    };
  }, [trades]);

  /* Висновок збирається з тих самих цифр, а не написаний наперед */
  const insight = useMemo(() => {
    const I = t.insights;
    if (!stats) return I.empty;
    if (stats.breakR < 0 && stats.planR > 0) return I.leak(stats.planR, stats.breakR, Math.abs(stats.breakR));
    if (stats.adherence === 100) return I.clean(stats.net);
    if (stats.net < 0) return I.red(stats.net, stats.n);
    return I.best(t.setups[stats.bestSetup?.[0]] || stats.bestSetup?.[0], stats.bestSession?.[0]);
  }, [stats, t]);

  return (
    <div className={compact
      ? 'flex flex-col gap-3'
      : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_480px]'}>

      {/* ─────────── Список угод ─────────── */}
      <div
        className="overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <span className="text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {t.sample} · {trades.length} {t.of} {ROWS.length} {t.tradesWord}
          </span>
          <button
            onClick={() => setOn(ROWS.map((x) => x.id))}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: T.text4 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.acc)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
          >
            <RotateCcw size={12} strokeWidth={2.4} /> {t.reset}
          </button>
        </div>

        <div className="flex flex-col">
          {ROWS.map((x, i) => {
            const active = on.includes(x.id);
            const moodColor = MOOD_COLOR[x.mood];

            return (
              /* Рядок став div, а не button: усередині зʼявились
                 пояснення термінів, які теж ловлять фокус, а кнопка
                 в кнопці ламає і розмітку, і навігацію з клавіатури.
                 Перемикачем тепер працює сам чекбокс. */
              <div
                key={x.id}
                onClick={() => toggle(x.id)}
                className="group relative flex cursor-pointer items-center gap-3 px-4 py-3 pl-5 text-left transition-all duration-200 sm:px-5 sm:pl-6"
                style={{
                  borderBottom: i === ROWS.length - 1 ? 'none' : `1px solid ${T.line}`,
                  opacity: active ? 1 : 0.34,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.022)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Смужка стану зліва — той самий орієнтир, що в
                    журналі: зелена смуга видно раніше за цифру */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] transition-opacity duration-200"
                  style={{ background: x.r > 0 ? T.ok : T.bad, opacity: active ? 0.6 : 0.2 }}
                />
                <button
                  role="checkbox"
                  aria-checked={active}
                  aria-label={`${x.pair} ${x.r > 0 ? '+' : ''}${x.r}R`}
                  onClick={(e) => { e.stopPropagation(); toggle(x.id); }}
                  className="ln-tap grid h-6 w-6 shrink-0 place-items-center rounded-md outline-none transition-colors duration-200"
                  style={{
                    background: active ? `rgba(${T.accRgb},0.16)` : 'transparent',
                    border: `1px solid ${active ? T.lineAcc : T.line}`,
                  }}
                >
                  {active && <Check size={12} strokeWidth={3.2} style={{ color: T.acc }} />}
                </button>

                <span className="w-[74px] shrink-0 text-[13px] font-bold" style={{ fontFamily: T.mono, color: T.text2 }}>
                  {x.pair}
                </span>

                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]" style={{ fontFamily: T.sans, color: x.plan ? T.text2 : T.bad }}>
                  <Term id={x.setup} className="truncate">{t.setups[x.setup] || x.setup}</Term>
                  {!x.plan && <span className="shrink-0 text-[11.5px]" style={{ color: T.bad }}>· {t.offPlanTag}</span>}
                </span>

                <span
                  className="hidden shrink-0 rounded-md px-2 py-[3px] text-[11px] font-semibold sm:block"
                  style={{ background: `${moodColor}12`, border: `1px solid ${moodColor}24`, color: moodColor, fontFamily: T.sans }}
                >
                  <Term id={MOOD_TERM[x.mood]}>{t.moods[x.mood]}</Term>
                </span>

                <span
                  className="w-[62px] shrink-0 rounded-lg py-1 text-center text-[13.5px] font-bold tabular-nums"
                  style={{
                    fontFamily: T.mono,
                    color: x.r > 0 ? T.ok : T.bad,
                    background: x.r > 0 ? `rgba(${T.okRgb},0.08)` : `rgba(${T.badRgb},0.08)`,
                  }}
                >
                  {x.r > 0 ? '+' : ''}{x.r}R
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────── Що з цього виходить ─────────── */}
      <div className="flex flex-col gap-3">
        <div className={compact ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-2 gap-3'}>
          <KPI
            label={<Term id="R">{t.netR}</Term>}
            value={stats ? `${stats.net > 0 ? '+' : ''}${stats.net}R` : '—'}
            tone={stats ? (stats.net >= 0 ? T.ok : T.bad) : T.text4}
            hint={stats ? `${stats.n} ${t.hintTrades}` : t.hintNothing}
          />
          <KPI
            label={t.winRate}
            value={stats ? `${stats.wr}%` : '—'}
            tone={stats && stats.wr >= 50 ? T.ok : T.text}
            hint={t.hintWinners}
          />
          <KPI
            label={t.profitFactor}
            value={stats ? stats.pf.toFixed(2) : '—'}
            tone={stats && stats.pf >= 1.5 ? T.ok : stats && stats.pf >= 1 ? T.warn : T.bad}
            hint={t.hintWinLoss}
          />
          {!compact && (
            <KPI
              label={t.adherence}
              value={stats ? `${stats.adherence}%` : '—'}
              tone={stats && stats.adherence >= 70 ? T.ok : T.warn}
              hint={t.hintBook}
            />
          )}
        </div>

        {/* Головний блок: різниця між «за планом» і «повз план» */}
        {stats && !compact && (
          <div
            className="grid grid-cols-2 gap-3 rounded-2xl p-3"
            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
          >
            <div className="rounded-xl px-3.5 py-3" style={{ background: `rgba(${T.okRgb},0.06)`, border: `1px solid rgba(${T.okRgb},0.18)` }}>
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {t.byPlan}
              </div>
              <div className="text-[20px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.ok }}>
                {stats.planR > 0 ? '+' : ''}{stats.planR}R
              </div>
            </div>
            <div className="rounded-xl px-3.5 py-3" style={{ background: `rgba(${T.badRgb},0.06)`, border: `1px solid rgba(${T.badRgb},0.18)` }}>
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {t.offPlan}
              </div>
              <div className="text-[20px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.bad }}>
                {stats.breakR > 0 ? '+' : ''}{stats.breakR}R
              </div>
            </div>
          </div>
        )}

        {/* Кіт читає ті самі цифри */}
        <div
          className="flex flex-1 gap-3.5 rounded-2xl p-4"
          style={{
            background: `linear-gradient(140deg, rgba(${T.accRgb},0.07), ${T.surface} 60%)`,
            border: `1px solid ${T.line}`,
          }}
        >
          <div className="shrink-0 pt-0.5">
            <EdgeMonogram />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Sparkles size={12} strokeWidth={2.4} style={{ color: T.acc }} />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.acc }}>
                {t.coach}
              </span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={insight}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="text-[13.5px]"
                style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.65 }}
              >
                {insight}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <p className="px-1 text-[12px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}>
          <X size={11} strokeWidth={2.6} className="mr-1 inline" />
          {t.footnote}
        </p>
      </div>
    </div>
  );
}
