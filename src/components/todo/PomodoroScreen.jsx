import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Play, Pause, RotateCcw, SkipForward, X, Check, Settings2, Timer,
  Volume2, VolumeX, Minus, Plus,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { playChime, ensureAudio, askNotifications, systemNotify } from '../../lib/chime';

/* ==================================================================
   Помодоро на весь екран.
   Все зайве гасне: лишається завдання, коло і час. Кільце показує,
   скільки лишилось, а не скільки минуло — так менше спокуси
   рахувати секунди.

   Цикл: фокус → коротка пауза → фокус → … і кожна N-та пауза довга.
   З автопереходом усе котиться саме, від тебе — тільки робота.

   Пробіл — пауза/старт, Esc — вийти.
================================================================== */

const MODES = {
  focus: { label: 'Фокус',         color: T.acc,  hint: 'Одна справа. Телефон екраном донизу.' },
  short: { label: 'Коротка пауза', color: T.ok,   hint: 'Встань, подивись у вікно.' },
  long:  { label: 'Довга пауза',   color: T.info, hint: 'Пройдись. Мозок дозбирає контекст сам.' },
};

const pad = (n) => String(n).padStart(2, '0');

/* компактний степер замість голого number-інпута — рівний і не їде */
function Stepper({ label, value, onChange, min = 1, max = 120, suffix = 'хв' }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="truncate text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </span>
      <div className="flex h-10 items-center rounded-xl" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
        <button
          onClick={() => set(value - 1)}
          className="grid h-full w-9 shrink-0 place-items-center rounded-l-xl transition-colors duration-200"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          <Minus size={14} strokeWidth={2.6} />
        </button>
        <span className="flex-1 text-center text-[14.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
          {value}<span className="ml-0.5 text-[12px]" style={{ color: T.text4 }}>{suffix}</span>
        </span>
        <button
          onClick={() => set(value + 1)}
          className="grid h-full w-9 shrink-0 place-items-center rounded-r-xl transition-colors duration-200"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          <Plus size={14} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}

export default function PomodoroScreen({
  task, settings, onSettings, doneToday, onClose, onSessionDone, onCompleteTask,
}) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState('focus');
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(settings.focus * 60);
  const [cycle, setCycle] = useState(0);
  const [tuning, setTuning] = useState(false);
  const [sound, setSound] = useState(true);
  const endRef = useRef(null);

  const total = settings[mode] * 60;
  const M = MODES[mode];

  const switchMode = (next) => {
    setMode(next);
    setRunning(false);
    setLeft(settings[next] * 60);
    endRef.current = null;
  };

  /* зміна тривалості в налаштуваннях підхоплюється, поки таймер стоїть */
  useEffect(() => {
    if (!running) setLeft(settings[mode] * 60);
    /* eslint-disable-next-line */
  }, [settings.focus, settings.short, settings.long]);

  /* Тік по реальному часу, а не по лічильнику інтервалів —
     інакше у фоновій вкладці таймер відстає. */
  useEffect(() => {
    if (!running) return undefined;
    if (!endRef.current) endRef.current = Date.now() + left * 1000;

    const id = setInterval(() => {
      const rest = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setLeft(rest);
      if (rest === 0) finish();
    }, 250);

    return () => clearInterval(id);
    /* eslint-disable-next-line */
  }, [running]);

  const finish = () => {
    setRunning(false);
    endRef.current = null;
    onSessionDone({ mode, minutes: settings[mode], taskId: task?.id || null });

    const wasFocus = mode === 'focus';
    if (sound) playChime(wasFocus ? 'focus' : 'break');

    if (wasFocus) {
      const nextCycle = cycle + 1;
      const next = nextCycle % settings.longEvery === 0 ? 'long' : 'short';
      setCycle(nextCycle);
      systemNotify('Помодоро завершено', `Час на ${next === 'long' ? 'довгу' : 'коротку'} паузу — ${settings[next]} хв`);
      switchMode(next);
      if (settings.autoNext) setTimeout(() => setRunning(true), 1200);
    } else {
      systemNotify('Пауза закінчилась', `Наступний фокус — ${settings.focus} хв`);
      switchMode('focus');
      if (settings.autoNext) setTimeout(() => setRunning(true), 1200);
    }
  };

  const toggle = () => {
    if (running) {
      setRunning(false);
      endRef.current = null;
    } else {
      ensureAudio();
      askNotifications();
      endRef.current = Date.now() + left * 1000;
      setRunning(true);
    }
  };

  const reset = () => {
    setRunning(false);
    endRef.current = null;
    setLeft(settings[mode] * 60);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  });

  const pct = total ? left / total : 0;
  const R = 132;
  const C = 2 * Math.PI * R;
  const mins = Math.floor(left / 60);
  const secs = left % 60;

  const dots = useMemo(
    () => Array.from({ length: settings.longEvery }, (_, i) => i < cycle % settings.longEvery),
    [cycle, settings.longEvery],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      className="fixed inset-0 z-[300] flex flex-col overflow-y-auto"
      style={{ background: T.bg, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* тихе дихання фону в такт роботі */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-1/2 h-[min(720px,110vw)] w-[min(720px,110vw)] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${M.color}22, transparent 62%)`, filter: 'blur(60px)' }}
        animate={reduce || !running ? { opacity: 0.35, scale: 1 } : { opacity: [0.3, 0.5, 0.3], scale: [1, 1.05, 1] }}
        transition={{ duration: 6, repeat: running ? Infinity : 0, ease: 'easeInOut' }}
      />

      {/* шапка */}
      <div className="relative z-10 flex flex-wrap items-center gap-3 px-4 py-3 sm:px-8 sm:py-4">
        <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text3 }}>
          <Timer size={15} strokeWidth={2.3} style={{ color: M.color }} />
          Помодоро
        </span>
        <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
          сьогодні {doneToday}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { setSound((s) => !s); if (!sound) { ensureAudio(); playChime('focus'); } }}
            title={sound ? 'Звук увімкнено' : 'Звук вимкнено'}
            className="grid h-10 w-10 place-items-center rounded-xl transition-all duration-200 active:scale-95"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: sound ? T.text2 : T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = T.line; }}
          >
            {sound ? <Volume2 size={16} strokeWidth={2.2} /> : <VolumeX size={16} strokeWidth={2.2} />}
          </button>

          <button
            onClick={() => setTuning((v) => !v)}
            title="Налаштування"
            className="grid h-10 w-10 place-items-center rounded-xl transition-all duration-200 active:scale-95"
            style={{
              background: tuning ? T.surfaceHi : T.surface,
              border: `1px solid ${tuning ? T.lineHi : T.line}`,
              color: tuning ? T.text : T.text2,
            }}
          >
            <Settings2 size={16} strokeWidth={2.2} />
          </button>

          <button
            onClick={onClose}
            title="Вийти (Esc)"
            className="grid h-10 w-10 place-items-center rounded-xl transition-all duration-200 active:scale-95"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* налаштування — рівна картка по центру, нічого не виїжджає */}
      <AnimatePresence>
        {tuning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="relative z-10 overflow-hidden px-5 sm:px-8"
          >
            <div
              className="mx-auto mb-2 w-full max-w-[620px] rounded-2xl p-4"
              style={{ background: T.surface, border: `1px solid ${T.line}` }}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stepper label="фокус" value={settings.focus} onChange={(v) => onSettings({ ...settings, focus: v })} />
                <Stepper label="коротка" value={settings.short} onChange={(v) => onSettings({ ...settings, short: v })} />
                <Stepper label="довга" value={settings.long} onChange={(v) => onSettings({ ...settings, long: v })} />
                <Stepper label="довга кожні" value={settings.longEvery} onChange={(v) => onSettings({ ...settings, longEvery: v })} min={2} max={8} suffix="×" />
              </div>

              <button
                onClick={() => onSettings({ ...settings, autoNext: !settings.autoNext })}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors duration-200"
                style={{ background: T.sunken, border: `1px solid ${settings.autoNext ? T.lineAcc : T.line}` }}
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                    Автоперехід
                  </span>
                  <span className="block text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    сам запускає наступний відрізок після сигналу
                  </span>
                </span>
                <motion.span
                  className="relative h-6 w-11 shrink-0 rounded-full"
                  initial={false}
                  animate={{ backgroundColor: settings.autoNext ? T.acc : T.line }}
                  transition={{ duration: 0.2 }}
                >
                  <motion.span
                    className="absolute top-1 h-4 w-4 rounded-full"
                    style={{ background: settings.autoNext ? 'var(--edge-bg, #0A0A0C)' : T.text3 }}
                    initial={false}
                    animate={{ left: settings.autoNext ? 26 : 4 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 30 }}
                  />
                </motion.span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* центр */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-4 py-6 sm:gap-7 sm:px-5 sm:py-8">
        {/* режими */}
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl p-1" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
          {Object.entries(MODES).map(([key, m]) => {
            const on = mode === key;
            return (
              <button
                key={key}
                onClick={() => switchMode(key)}
                className="relative rounded-lg px-3 py-2 text-[13px] font-bold transition-colors duration-200 sm:px-4 sm:text-[13.5px]"
                style={{ fontFamily: T.sans, color: on ? m.color : T.text3, zIndex: 1 }}
              >
                {on && (
                  <motion.span
                    layoutId="pomo-mode"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-lg"
                    style={{ background: `${m.color}1a`, border: `1px solid ${m.color}38`, zIndex: -1 }}
                  />
                )}
                {m.label}
              </button>
            );
          })}
        </div>

        {/* як котиться цикл */}
        <p className="text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {settings.focus} хв роботи → {settings.short} хв пауза, кожна {settings.longEvery}-та пауза — {settings.long} хв
          {settings.autoNext ? ' · перемикається саме' : ' · перемикаєш вручну'}
        </p>

        {/* кільце — всередині тільки час */}
        <div className="relative grid place-items-center">
          <svg viewBox="0 0 300 300" className="h-[240px] w-[240px] -rotate-90 sm:h-[300px] sm:w-[300px]">
            <circle cx={150} cy={150} r={R} fill="none" stroke={T.line} strokeWidth="6" />
            <motion.circle
              cx={150} cy={150} r={R}
              fill="none" stroke={M.color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={C}
              initial={false}
              animate={{ strokeDashoffset: C * (1 - pct) }}
              transition={{ duration: 0.3, ease: 'linear' }}
              style={{ filter: `drop-shadow(0 0 12px ${M.color}55)` }}
            />
          </svg>

          <span
            className="absolute text-[52px] font-bold leading-none tabular-nums sm:text-[72px]"
            style={{ fontFamily: T.mono, color: T.text, letterSpacing: '-0.03em' }}
          >
            {pad(mins)}:{pad(secs)}
          </span>
        </div>

        {/* підказка режиму — під кільцем, а не в ньому */}
        <AnimatePresence mode="wait">
          <motion.p
            key={mode + running}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="text-center text-[14px]"
            style={{ fontFamily: T.sans, color: running ? T.text3 : T.text4 }}
          >
            {running ? M.hint : 'на паузі'}
          </motion.p>
        </AnimatePresence>

        {/* завдання */}
        <div className="flex min-h-[52px] w-full max-w-[560px] items-center justify-center">
          <AnimatePresence mode="wait">
            {task ? (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: EASE }}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background: T.surface, border: `1px solid ${T.line}` }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: M.color }} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
                  {task.text}
                </span>
                {task.pomodoros > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    <Timer size={12} strokeWidth={2.2} />{task.pomodoros}
                  </span>
                )}
                <button
                  onClick={() => onCompleteTask(task.id)}
                  className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-colors duration-200"
                  style={{ color: T.text3, border: `1px solid ${T.line}`, fontFamily: T.sans }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.ok; e.currentTarget.style.borderColor = `rgba(${T.okRgb},0.35)`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                >
                  <Check size={14} strokeWidth={3} />
                  готово
                </button>
              </motion.div>
            ) : (
              <motion.p
                key="none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[14px]" style={{ fontFamily: T.sans, color: T.text4 }}
              >
                Без завдання — просто чистий фокус
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* керування */}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            title="Скинути"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-all duration-200 active:scale-95 sm:h-12 sm:w-12"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <RotateCcw size={18} strokeWidth={2.2} />
          </button>

          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.96 }}
            className="flex h-14 w-[142px] items-center justify-center gap-2.5 rounded-2xl text-[15px] font-bold transition-shadow duration-200 sm:h-16 sm:w-[168px] sm:text-[16px]"
            style={{
              background: M.color,
              color: 'var(--edge-bg, #0A0A0C)',
              fontFamily: T.sans,
              boxShadow: `0 10px 30px -12px ${M.color}`,
            }}
          >
            {running ? <Pause size={20} strokeWidth={2.8} /> : <Play size={20} strokeWidth={2.8} />}
            {running ? 'Пауза' : 'Старт'}
          </motion.button>

          <button
            onClick={finish}
            title="Пропустити відрізок"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-all duration-200 active:scale-95 sm:h-12 sm:w-12"
            style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            <SkipForward size={18} strokeWidth={2.2} />
          </button>
        </div>

        {/* цикл */}
        <div className="flex items-center gap-2">
          {dots.map((on, i) => (
            <motion.span
              key={i}
              className="h-2 rounded-full"
              initial={false}
              animate={{ width: on ? 22 : 8, backgroundColor: on ? T.acc : T.line }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            />
          ))}
          <span className="ml-2 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            до довгої паузи
          </span>
        </div>

        <p className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          Пробіл — старт і пауза · Esc — вийти
        </p>
      </div>
    </motion.div>
  );
}
