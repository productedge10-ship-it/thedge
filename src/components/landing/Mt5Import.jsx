import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, RotateCcw, Loader2, Send, MonitorDot, Sparkles,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { useLang } from '../../lib/i18n';
import { EdgeMonogram } from '../core/Layout';

/* ==================================================================
   Автоімпорт з термінала.

   Розповідати про це словами марно — треба показати. Ліворуч стоїть
   термінал зі списком закритих позицій, праворуч порожній журнал.
   Натискаєш кнопку — і угоди фізично перелітають зліва направо,
   з нахилом і невеликим перельотом, ніби їх висипали. Потім
   набігає статистика, і аж наприкінці виходить кіт із висновком.

   Порядок навмисний: спершу дія, потім цифри, потім сенс. Якби кіт
   зʼявився одразу, людина читала б текст замість того, щоб дивитись
   на головне — що вона не ввела жодного символа руками.

   Цифри рахуються з тих самих угод, що летять у таблицю, тому
   анімація не може розійтись із результатом.
================================================================== */

const TRADES = [
  { pair: 'XAUUSD', type: 'buy',  lots: 0.42, r: 2.4,  plan: true,  setup: 'Sweep + FVG' },
  { pair: 'GER40',  type: 'sell', lots: 1.00, r: 1.8,  plan: true,  setup: 'Sweep + FVG' },
  { pair: 'EURUSD', type: 'buy',  lots: 0.75, r: -1,   plan: false, setup: 'Revenge' },
  { pair: 'XAUUSD', type: 'sell', lots: 0.30, r: 3.1,  plan: true,  setup: 'Sweep + FVG' },
  { pair: 'NAS100', type: 'buy',  lots: 0.20, r: -1,   plan: false, setup: 'Late entry' },
  { pair: 'GER40',  type: 'buy',  lots: 0.80, r: 1.9,  plan: true,  setup: 'Judas swing' },
];

const r1 = (n) => Math.round(n * 10) / 10;

/* Цифра, що набігає до цілі */
function Roll({ to, format, color }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 650);
      setN(to * (1 - (1 - k) ** 3));
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [to]);

  return <span className="tabular-nums" style={{ fontFamily: T.mono, color }}>{format(n)}</span>;
}

export default function Mt5Import() {
  const { t: L } = useLang();
  const t = L.mt5;

  /* idle → flying → done */
  const [phase, setPhase] = useState('idle');
  const [rows, setRows] = useState(0);
  const timers = useRef([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const run = () => {
    if (phase === 'flying') return;
    clear();
    setRows(0);
    setPhase('flying');

    /* Угоди летять по одній: миттєве заповнення читається як
       підміна картинки, а покрокове — як робота */
    TRADES.forEach((_, i) => {
      timers.current.push(setTimeout(() => setRows(i + 1), 260 + i * 170));
    });
    timers.current.push(setTimeout(() => setPhase('done'), 260 + TRADES.length * 170 + 420));
  };

  const reset = () => { clear(); setRows(0); setPhase('idle'); };

  const shown = TRADES.slice(0, rows);
  const net = r1(shown.reduce((s, x) => s + x.r, 0));
  const wins = shown.filter((x) => x.r > 0).length;
  const wr = shown.length ? Math.round((wins / shown.length) * 100) : 0;
  const gross = shown.filter((x) => x.r > 0).reduce((s, x) => s + x.r, 0);
  const loss = Math.abs(shown.filter((x) => x.r < 0).reduce((s, x) => s + x.r, 0));
  const pf = loss ? r1(gross / loss) : gross ? 99 : 0;

  /* Висновок кота збирається з тих самих угод */
  const bySetup = {};
  TRADES.filter((x) => x.plan).forEach((x) => { bySetup[x.setup] = (bySetup[x.setup] || 0) + x.r; });
  const best = Object.entries(bySetup).sort((a, b) => b[1] - a[1])[0];
  const offPlan = r1(TRADES.filter((x) => !x.plan).reduce((s, x) => s + x.r, 0));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">

      {/* ══════════ Термінал ══════════ */}
      <div
        className="overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${T.line}` }}
      >
        <div
          className="flex items-center gap-2.5 px-5 py-3.5"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <MonitorDot size={15} strokeWidth={2.2} style={{ color: T.info }} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
              {t.terminal}
            </div>
            <div className="truncate text-[11.5px]" style={{ fontFamily: T.mono, color: T.text4 }}>
              {t.account}
            </div>
          </div>
        </div>

        <div className="px-5 py-3">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {TRADES.length} {t.closed}
          </div>

          {/* Позиції в терміналі гаснуть у міру того, як переїжджають */}
          <div className="flex flex-col gap-1">
            {TRADES.map((x, i) => (
              <motion.div
                key={x.pair + i}
                animate={{
                  opacity: phase !== 'idle' && i < rows ? 0.2 : 1,
                  x: phase !== 'idle' && i < rows ? 10 : 0,
                }}
                transition={{ duration: 0.3, ease: EASE }}
                className="flex items-center gap-2 text-[12px]"
                style={{ fontFamily: T.mono, color: T.text3 }}
              >
                <span className="w-[62px] shrink-0">{x.pair}</span>
                <span
                  className="w-[30px] shrink-0 text-[10.5px] font-bold uppercase"
                  style={{ color: x.type === 'buy' ? T.ok : T.bad }}
                >
                  {x.type}
                </span>
                <span className="flex-1" style={{ color: T.text4 }}>{x.lots.toFixed(2)}</span>
                <span style={{ color: x.r > 0 ? T.ok : T.bad }}>{x.r > 0 ? '+' : ''}{x.r}R</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <button
            onClick={phase === 'done' ? reset : run}
            disabled={phase === 'flying'}
            className="ln-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.99]"
            style={{
              background: phase === 'done' ? T.surfaceHi : T.acc,
              border: phase === 'done' ? `1px solid ${T.line}` : 'none',
              color: phase === 'done' ? T.text2 : '#0A0A0C',
              fontFamily: T.sans,
              boxShadow: phase === 'done' ? 'none' : `0 12px 32px -12px rgba(${T.accRgb},0.9)`,
            }}
          >
            <span className="relative z-10 flex items-center gap-2">
              {phase === 'idle' && <><Send size={15} strokeWidth={2.6} /> {t.send}</>}
              {phase === 'flying' && <><Loader2 size={15} className="animate-spin" /> {t.sending}</>}
              {phase === 'done' && <><RotateCcw size={14} strokeWidth={2.4} /> {t.replay}</>}
            </span>
          </button>
        </div>
      </div>

      {/* ══════════ Журнал ══════════ */}
      <div
        className="overflow-hidden rounded-3xl"
        style={{ background: T.surface, border: `1px solid ${phase === 'done' ? `rgba(${T.okRgb},0.24)` : T.line}`, transition: 'border-color .5s ease' }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
        >
          <span className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {phase === 'flying' && <Loader2 size={12} className="animate-spin" style={{ color: T.acc }} />}
            {phase === 'done' && <Check size={12} strokeWidth={3} style={{ color: T.ok }} />}
            {t.journal}
            <span style={{ color: T.text4, opacity: 0.7 }}>
              · {phase === 'idle' ? t.empty : phase === 'flying' ? t.importing : t.done}
            </span>
          </span>
        </div>

        {/* Висота задана: інакше блок росте під час прильоту і
            сторінка сіпається під курсором */}
        <div className="relative h-[268px]">
          <AnimatePresence>
            {phase === 'idle' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-6 text-center"
              >
                <motion.div
                  animate={{ x: [-4, 4, -4] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-[26px]"
                  style={{ color: T.text4 }}
                >
                  ←
                </motion.div>
                <div className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {t.empty}
                </div>
                <div className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {t.emptyHint}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {phase !== 'idle' && (
            <div className="flex flex-col">
              <div className="flex items-center gap-3 px-5 py-2" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="w-[80px] text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>{t.cols.pair}</span>
                <span className="w-[54px] text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>{t.cols.type}</span>
                <span className="flex-1" />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>{t.cols.result}</span>
              </div>

              <AnimatePresence initial={false}>
                {shown.map((x, i) => (
                  <motion.div
                    key={`${x.pair}-${i}`}
                    /* Приліт зліва з нахилом і невеликим перельотом —
                       ніби угоду висипали, а не проявили на місці */
                    initial={{ opacity: 0, x: -120, y: -22, rotate: -7, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.8 }}
                    className="flex items-center gap-3 px-5 py-[9px]"
                    style={{ borderBottom: `1px solid ${T.line}` }}
                  >
                    <span className="w-[80px] text-[13px] font-bold" style={{ fontFamily: T.mono, color: T.text2 }}>{x.pair}</span>
                    <span
                      className="w-[54px] text-[11.5px] font-bold uppercase"
                      style={{ fontFamily: T.sans, color: x.type === 'buy' ? T.ok : T.bad }}
                    >
                      {x.type}
                    </span>
                    <span className="flex-1 text-[12.5px]" style={{ fontFamily: T.mono, color: T.text4 }}>{x.lots.toFixed(2)}</span>
                    <span
                      className="w-[54px] text-right text-[13.5px] font-bold tabular-nums"
                      style={{ fontFamily: T.mono, color: x.r > 0 ? T.ok : T.bad }}
                    >
                      {x.r > 0 ? '+' : ''}{x.r}R
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* статистика набігає слідом за угодами */}
        <div
          className="grid grid-cols-3 gap-3 px-5 py-4"
          style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
        >
          {[
            { label: t.stats.net, value: net, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}R`, color: net >= 0 ? T.ok : T.bad },
            { label: t.stats.wr, value: wr, fmt: (v) => `${Math.round(v)}%`, color: T.text },
            { label: t.stats.pf, value: pf, fmt: (v) => v.toFixed(2), color: pf >= 1.5 ? T.ok : T.text },
          ].map((k) => (
            <div key={k.label} className="min-w-0">
              <div className="mb-1 truncate text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {k.label}
              </div>
              <div className="text-[20px] font-bold" style={{ letterSpacing: '-0.02em' }}>
                {shown.length
                  ? <Roll key={`${k.label}-${rows}`} to={k.value} format={k.fmt} color={k.color} />
                  : <span style={{ fontFamily: T.mono, color: T.text4 }}>—</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ══════════ Кіт із висновком ══════════ */}
        <AnimatePresence>
          {phase === 'done' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div
                className="flex gap-3.5 px-5 py-4"
                style={{
                  borderTop: `1px solid ${T.line}`,
                  background: `linear-gradient(140deg, rgba(${T.accRgb},0.08), ${T.surface} 62%)`,
                }}
              >
                {/* Кіт виїжджає збоку, а не проявляється — так видно,
                    що він прийшов подивитись на щойно імпортоване */}
                <motion.div
                  initial={{ x: -18, opacity: 0, rotate: -12 }}
                  animate={{ x: 0, opacity: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.12 }}
                  className="shrink-0 pt-0.5"
                >
                  <EdgeMonogram />
                </motion.div>

                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Sparkles size={11} strokeWidth={2.4} style={{ color: T.acc }} />
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.acc }}>
                      {t.coach}
                    </span>
                    <span className="ml-auto text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {TRADES.length} {t.tradesIn}
                    </span>
                  </div>

                  {[
                    { text: t.verdictGood(best?.[0], r1(best?.[1] || 0)), tone: T.ok, delay: 0.28 },
                    { text: t.verdictBad(offPlan), tone: T.bad, delay: 0.46 },
                  ].map((v) => (
                    <motion.p
                      key={v.text}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: v.delay, ease: EASE }}
                      className="mb-1.5 flex gap-2.5 text-[13px]"
                      style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}
                    >
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: v.tone }} />
                      {v.text}
                    </motion.p>
                  ))}

                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.62 }}
                    className="mt-2 text-[12px]"
                    style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.55 }}
                  >
                    {t.footnote}
                  </motion.p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
