import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, X, ArrowLeft, Clock, Sparkles, RotateCcw, HelpCircle, Download,
} from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { EdgeMonogram, EdgeWordmark } from '../core/Layout';
import { useSettings } from '../../context/SettingsContext';
import { NAV, HIDEABLE } from '../../lib/settings';
import { openTour } from '../../lib/tour';
import useCloudState from '../../hooks/useCloudState';
import {
  KEY, QUESTIONS, TOTAL, DIMS, LEVEL, EMPTY, OPEN_EVENT, normalize, portrait,
} from '../../lib/onboarding';

/* ==================================================================
   Знайомство з новим користувачем.

   Правила, за якими це зроблено:

   • Анкету не можна «пройти повз» — вона зустрічає на вході. Але її
     завжди можна відкласти: замкнені двері на першому екрані
     втрачають більше людей, ніж дає будь-яка аналітика.
   • Одне питання на екран. Список із двадцяти пʼяти рядків читають
     по діагоналі й тицяють навмання — і відповіді стають сміттям.
   • Ніякого прогресу у відсотках. Показуємо «6 з 25»: людина має
     бачити кінець, а не абстрактну шкалу.
   • У фіналі — не подяка, а висновок. Анкета, після якої нічого не
     сталося, вчить, що заповнювати анкети тут безглуздо.
================================================================== */

export default function OnboardingModal() {
  const navigate = useNavigate();
  const [state, setState, { ready }] = useCloudState(KEY, EMPTY, { normalize });

  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  /* 'ask' — питання, 'portrait' — висновок, 'mt5' — підключення терміналу */
  const [stage, setStage] = useState('ask');

  /* Відкриваємо тільки коли стан справді приїхав: інакше анкета
     блимне перед людиною, яка вже все заповнила з іншого пристрою. */
  useEffect(() => {
    if (!ready) return;
    if (state.status === 'new') setOpen(true);
  }, [ready, state.status]);

  /* Відкриття ззовні — кнопкою «Про тебе» в бічній панелі. Якщо все
     вже заповнено, показуємо не питання, а готовий портрет: людина
     частіше приходить перечитати висновок, ніж переписати відповіді. */
  useEffect(() => {
    const onOpen = () => {
      const filled = QUESTIONS.every((x) => typeof state.answers[x.id] === 'boolean');
      setStage(filled ? 'portrait' : 'ask');
      setI(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [state.answers]);

  const restart = () => {
    setState({ status: 'new', answers: {}, at: null });
    setStage('ask');
    setI(0);
  };

  /* Питання, на які ще немає відповіді — щоб після «пізніше» людина
     продовжила з місця, де зупинилась, а не з початку. */
  const queue = useMemo(
    () => QUESTIONS.filter((q) => typeof state.answers[q.id] !== 'boolean'),
    [state.answers],
  );

  const answeredCount = TOTAL - queue.length;
  const q = queue[i];

  const answer = (v) => {
    if (!q) return;
    const next = { ...state.answers, [q.id]: v };
    const finished = Object.keys(next).length >= TOTAL;

    setState({
      status: finished ? 'done' : 'new',
      answers: next,
      at: new Date().toISOString(),
    });

    if (finished) setStage('portrait');
    /* i не рухаємо: черга сама скоротилась, і наступне питання
       вже стоїть під тим самим індексом */
  };

  const back = () => {
    const answeredIds = QUESTIONS.filter((x) => typeof state.answers[x.id] === 'boolean');
    const last = answeredIds[answeredIds.length - 1];
    if (!last) return;

    const next = { ...state.answers };
    delete next[last.id];
    setState({ ...state, answers: next, status: 'new' });
    setI(0);
  };

  const later = () => {
    setState({ ...state, status: 'later' });
    setOpen(false);
  };

  /* Тур не запускається сам. Людину питають — і це не ввічливість:
     той, хто натиснув «покажи», дивиться; той, кому показали без
     попиту, шукає хрестик. Пауза дає модалці доїхати, інакше виріз
     міряється по вікну, яке ще зникає. */
  const finish = (to, withTour) => {
    setState({ ...state, status: 'done' });
    setOpen(false);
    setStage('ask');
    if (to) navigate(to);
    if (withTour) setTimeout(openTour, 520);
  };

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') later();
      if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, state.answers]);

  const p = stage === 'ask' ? null : portrait(state.answers);

  return (
    <>
      {/* Плашка-нагадування прибрана.

          Вона висіла в кутку постійно й перекривала кнопки на
          сторінках — тобто платила за себе чужим місцем щодня, а
          віддавала одне: нагадування про анкету, яку людина вже раз
          свідомо відклала. Хто захоче доповнити портрет, зробить це
          з налаштувань. */}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4"
            style={{ background: 'rgba(6,6,8,0.72)', backdropFilter: 'blur(14px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="relative w-full max-w-[600px] overflow-hidden rounded-3xl"
              style={{
                background: T.surface,
                border: `1px solid ${T.line}`,
                boxShadow: '0 40px 120px -30px rgba(0,0,0,0.9)',
              }}
            >
              {/* Тепле світло згори — щоб вікно не читалось як помилка */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-40"
                style={{ background: `radial-gradient(60% 100% at 50% 0%, rgba(${T.accRgb},0.10), transparent 70%)` }}
              />

              {/* ---------- шапка ---------- */}
              <div className="relative flex items-center gap-3 px-6 pt-6">
                <EdgeMonogram />
                <div className="min-w-0">
                  <EdgeWordmark size={13} />
                  <div className="mt-1 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {stage === 'ask' && 'Расскажи о себе — и советы станут про тебя'}
                    {stage === 'portrait' && 'Вот что я о тебе понял'}
                    {stage === 'pick' && 'Соберём меню под тебя'}
                    {stage === 'mt5' && 'Осталось привезти сюда твои сделки'}
                    {stage === 'offer' && 'Последнее — и отпускаю'}
                  </div>
                </div>

                <button
                  onClick={later}
                  className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors duration-200"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                  title="Отвечу позже"
                >
                  <X size={16} strokeWidth={2.4} />
                </button>
              </div>

              {stage === 'ask' && (
                <Question
                  q={q}
                  index={answeredCount}
                  onAnswer={answer}
                  onBack={back}
                  onLater={later}
                  canBack={answeredCount > 0}
                />
              )}

              {stage === 'portrait' && (
                <Portrait p={p} onNext={() => setStage('pick')} onRestart={restart} />
              )}

              {stage === 'pick' && (
                <PickStep onDone={() => setStage('mt5')} />
              )}

              {stage === 'mt5' && (
                <Mt5Step onDone={() => setStage('offer')} />
              )}

              {stage === 'offer' && (
                <OfferStep
                  onYes={() => finish(p?.to, true)}
                  onNo={() => finish(p?.to, false)}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------- одне питання ---------- */

function Question({ q, index, onAnswer, onBack, onLater, canBack }) {
  if (!q) return null;
  const dim = DIMS[q.dim];

  return (
    <div className="relative px-6 pb-6 pt-7">
      {/* Скільки лишилось. Смуга тонка навмисно: це орієнтир, а не
          головний герой екрана. */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: T.sunken }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: T.acc }}
            animate={{ width: `${(index / TOTAL) * 100}%` }}
            transition={{ duration: 0.45, ease: EASE }}
          />
        </div>
        <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
          {index} / {TOTAL}
        </span>
      </div>

      <div
        className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.18em]"
        style={{ fontFamily: T.sans, color: T.acc }}
      >
        {dim.label} <span style={{ color: T.text4 }}>— {dim.hint}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.h2
          key={q.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="mb-7 text-[22px] font-bold leading-[1.28] sm:text-[25px]"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
        >
          {q.text}
        </motion.h2>
      </AnimatePresence>

      <div className="flex gap-3">
        <Answer label="Да" tone={T.ok} rgb={T.okRgb} onClick={() => onAnswer(true)} />
        <Answer label="Нет" tone={T.text2} rgb="180,180,189" onClick={() => onAnswer(false)} />
      </div>

      <div className="mt-5 flex items-center gap-4">
        {canBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[13px] font-semibold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
          >
            <ArrowLeft size={14} strokeWidth={2.4} /> Назад
          </button>
        )}

        <button
          onClick={onLater}
          className="ml-auto flex items-center gap-1.5 text-[13px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
        >
          <Clock size={14} strokeWidth={2.4} /> Отвечу позже
        </button>
      </div>
    </div>
  );
}

function Answer({ label, tone, rgb, onClick }) {
  return (
    <button
      onClick={onClick}
      className="h-[52px] flex-1 rounded-2xl text-[15.5px] font-bold transition-all duration-200"
      style={{
        fontFamily: T.sans,
        background: T.sunken,
        border: `1px solid ${T.line}`,
        color: tone,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `rgba(${rgb},0.10)`;
        e.currentTarget.style.borderColor = `rgba(${rgb},0.4)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.sunken;
        e.currentTarget.style.borderColor = T.line;
      }}
    >
      {label}
    </button>
  );
}

/* ---------- портрет ---------- */

function Portrait({ p, onNext, onRestart }) {
  const tones = { ok: T.ok, warn: T.warn, bad: T.bad };

  return (
    <div className="relative max-h-[calc(100vh-190px)] overflow-y-auto px-6 pb-6 pt-7">
      <div className="mb-5 flex flex-col gap-2">
        {Object.entries(DIMS).map(([id, d]) => {
          const s = p.score[id];
          const lvl = LEVEL(s.pct);
          const weak = id === p.weakest;

          return (
            <div key={id} className="flex items-center gap-3">
              <span
                className="w-[86px] shrink-0 text-[13px] font-bold"
                style={{ fontFamily: T.sans, color: weak ? T.text : T.text2 }}
              >
                {d.label}
              </span>

              <span className="h-[6px] flex-1 overflow-hidden rounded-full" style={{ background: T.sunken }}>
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: tones[lvl.tone] }}
                  initial={{ width: 0 }}
                  animate={{ width: `${s.pct}%` }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                />
              </span>

              <span
                className="w-[92px] shrink-0 text-right text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: tones[lvl.tone] }}
              >
                {lvl.label}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="rounded-2xl p-5"
        style={{ background: T.sunken, border: `1px solid ${T.line}` }}
      >
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} strokeWidth={2.4} style={{ color: T.acc }} />
          <span
            className="text-[11.5px] font-bold uppercase tracking-[0.16em]"
            style={{ fontFamily: T.sans, color: T.acc }}
          >
            С чего начать
          </span>
        </div>

        <h3
          className="mb-2 text-[17.5px] font-bold leading-snug"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.015em' }}
        >
          {p.title}
        </h3>
        <p className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
          {p.text}
        </p>
      </div>

      {/* Що саме я побачив. Тут не оцінка напрямку, а конкретні
          поєднання відповідей — у них людина впізнає свій вечір, а не
          абстрактну «дисципліну». */}
      {p.notes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5">
          {p.notes.map((n, k) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.15 + k * 0.07 }}
              className="flex gap-3 rounded-xl px-4 py-3"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              <span
                aria-hidden
                className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: T.acc }}
              />
              <p className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.6 }}>
                {n.text}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          onClick={onNext}
          className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl text-[14.5px] font-bold transition-transform duration-200 active:scale-[0.99]"
          style={{
            fontFamily: T.sans,
            background: T.acc,
            color: 'var(--edge-bg, #0A0A0C)',
            boxShadow: `0 16px 40px -16px rgba(${T.accRgb},0.9)`,
          }}
        >
          <Check size={16} strokeWidth={3} /> Дальше
        </button>

        <button
          onClick={onRestart}
          className="flex h-[50px] shrink-0 items-center gap-2 rounded-2xl px-5 text-[14px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
        >
          <RotateCcw size={14} strokeWidth={2.4} /> Пройти заново
        </button>
      </div>
    </div>
  );
}

/* ---------- підключення MT5 ----------

   Ставимо це одразу після портрета не з ліні, а тому що це єдиний
   момент, коли людина вже налаштована щось зробити, а журнал ще
   порожній. Порожній журнал — головна причина, з якої такі сервіси
   закривають і не повертаються.

   Пароль інвестора — не звичайний пароль: він дозволяє дивитись
   історію й не дозволяє торгувати. Люди цього не знають і бояться
   вводити будь-що, тому пояснення лежить прямо тут, а не в довідці.
*/

/* ---------- с чего начать ----------

   Из фидбека: «эффект перегруженности присутствует», и там же —
   «за часик мне стало более-менее понятно, я для себя уже видел бы
   элементы, с которыми работал бы в первую очередь».

   Человек сам отбирает свой минимум — просто делает это через час
   блужданий. Здесь мы даём сделать это сразу.

   Ничего не удаляется: скрытые разделы остаются на своих адресах и
   возвращаются одной кнопкой в настройках. Поэтому шаг безопасный —
   ошибиться тут нечем. */
const STARTER = ['/plan', '/journal', '/analytics'];

function PickStep({ onDone }) {
  const s = useSettings();
  const [picked, setPicked] = useState(() => new Set(STARTER));

  const toggle = (to) => setPicked((cur) => {
    const next = new Set(cur);
    if (next.has(to)) next.delete(to); else next.add(to);
    return next;
  });

  const apply = (all) => {
    s.set({ hiddenNav: all ? [] : HIDEABLE.filter((i) => !picked.has(i.to)).map((i) => i.to) });
    onDone();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="px-6 pb-6 sm:px-8 sm:pb-8"
    >
      <p className="mb-5 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
        Разделов здесь много — это нормально, но сразу все не нужны.
        Отметь то, с чего начнёшь. Остальное спрячется из меню и
        вернётся в один клик из настроек.
      </p>

      <div className="mb-6 flex max-h-[320px] flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.fixed);
          if (!items.length) return null;
          return (
            <div key={g.group}>
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {g.group}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {items.map((it) => {
                  const on = picked.has(it.to);
                  return (
                    <button
                      key={it.to}
                      onClick={() => toggle(it.to)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors duration-150"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `rgba(${T.accRgb},0.12)` : T.sunken,
                        border: `1px solid ${on ? T.lineAcc : T.line}`,
                        color: on ? T.acc : T.text3,
                      }}
                    >
                      <span
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-[5px]"
                        style={{ border: `1px solid ${on ? T.acc : T.lineHi}`, background: on ? T.acc : 'transparent' }}
                      >
                        {on && <Check size={10} strokeWidth={3.4} style={{ color: 'var(--edge-on-acc, #0A0A0C)' }} />}
                      </span>
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => apply(false)}
          className="h-12 flex-1 rounded-xl text-[14px] font-bold transition-transform active:scale-[0.99]"
          style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
        >
          Начать с этого ({picked.size})
        </button>
        <button
          onClick={() => apply(true)}
          className="h-12 rounded-xl px-5 text-[14px] font-semibold transition-colors"
          style={{ border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
        >
          Показать всё
        </button>
      </div>
    </motion.div>
  );
}

/* ---------- предложение тура ----------

   Отдельным экраном, а не строчкой в предыдущем: вопрос, приклеенный
   к чужому шагу, читается как продолжение того шага и мимо него
   проскакивают. Здесь у человека ровно два варианта и оба честные —
   «нет» ничего не блокирует, тур всегда лежит в FAQ. */
function OfferStep({ onYes, onNo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="px-6 pb-6 sm:px-8 sm:pb-8"
    >
      <div className="mb-6 flex items-start gap-4">
        <motion.div
          animate={{ y: [0, -5, 0], rotate: [-2.5, 2.5, -2.5] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          className="shrink-0"
        >
          <EdgeMonogram />
        </motion.div>

        <div className="min-w-0">
          <h3
            className="mb-2 text-[19px] font-bold leading-[1.25]"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
          >
            Показать, что где лежит?
          </h3>
          <p className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
            Пролечу с тобой по разделам и расскажу, зачем каждый нужен —
            это минута. Откажешься — ничего страшного: тур всегда можно
            запустить из FAQ, он никуда не денется.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={onYes}
          className="h-12 flex-1 rounded-xl text-[14px] font-bold transition-transform active:scale-[0.99]"
          style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
        >
          Давай, показывай
        </button>
        <button
          onClick={onNo}
          className="h-12 rounded-xl px-5 text-[14px] font-semibold transition-colors"
          style={{ border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
        >
          Разберусь сам
        </button>
      </div>
    </motion.div>
  );
}

function Mt5Step({ onDone }) {
  const [server, setServer] = useState('');
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');
  const [help, setHelp] = useState(false);

  const ready = server.trim().length > 1 && login.trim().length > 2 && pass.length > 3;

  const field = {
    fontFamily: T.sans,
    background: T.sunken,
    border: `1px solid ${T.line}`,
    color: T.text,
  };

  return (
    <div className="relative max-h-[calc(100vh-190px)] overflow-y-auto px-6 pb-6 pt-7">
      <div className="mb-5 flex items-center gap-3.5">
        {/* Позначка терміналу: впізнається за кольором і підписом,
            чужу графіку сюди не тягнемо */}
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[13px] font-black"
          style={{
            fontFamily: T.sans,
            background: 'linear-gradient(145deg, #1b4d8f, #0d2444)',
            border: '1px solid rgba(96,165,250,0.3)',
            color: '#cfe3ff',
            letterSpacing: '0.02em',
          }}
        >
          MT5
        </span>

        <div className="min-w-0">
          <h3
            className="text-[19px] font-bold leading-tight"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
          >
            Пусть сделки приедут сами
          </h3>
          <p className="mt-1 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            MetaTrader 5 отдаст историю — тебе останется человеческая половина
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <input
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder="Сервер — напр. FTMO-Server или ICMarkets-Live12"
          className="h-12 w-full rounded-xl px-4 text-[14px] outline-none"
          style={field}
        />
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Логин (номер счёта)"
          inputMode="numeric"
          className="h-12 w-full rounded-xl px-4 text-[14px] outline-none"
          style={field}
        />

        <div className="relative">
          <input
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            type="password"
            placeholder="Пароль инвестора"
            className="h-12 w-full rounded-xl pl-4 pr-12 text-[14px] outline-none"
            style={field}
          />
          <button
            onClick={() => setHelp((v) => !v)}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
            style={{
              background: help ? `rgba(${T.accRgb},0.14)` : 'transparent',
              color: help ? T.acc : T.text4,
            }}
            title="Где взять пароль инвестора"
          >
            <HelpCircle size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {help && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div
              className="mt-3 rounded-xl p-4"
              style={{ background: `rgba(${T.accRgb},0.06)`, border: `1px solid ${T.accLine}` }}
            >
              <div
                className="mb-2 text-[11.5px] font-bold uppercase tracking-[0.16em]"
                style={{ fontFamily: T.sans, color: T.acc }}
              >
                Где взять пароль инвестора
              </div>
              <ol
                className="flex list-decimal flex-col gap-1.5 pl-4 text-[13px]"
                style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.55 }}
              >
                <li>Зайди в кабинет пропа или брокера, где лежит твой счёт.</li>
                <li>Найди карточку счёта — там обычно есть вкладка «Credentials» или «Данные для входа».</li>
                <li>Скопируй оттуда имя сервера, номер счёта и именно <b style={{ color: T.text }}>Investor password</b>.</li>
                <li>В самом терминале его тоже можно задать: Сервис → Настройки → Сервер → Изменить пароль → Investor.</li>
              </ol>
              <p className="mt-3 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.55 }}>
                Пароль инвестора позволяет только смотреть историю. Торговать
                или выводить деньги с ним невозможно — поэтому его и просим
                вместо основного.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 flex gap-3">
        <button
          disabled={!ready}
          onClick={onDone}
          className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl text-[14.5px] font-bold transition-transform duration-200 active:scale-[0.99]"
          style={{
            fontFamily: T.sans,
            background: ready ? T.acc : T.sunken,
            border: `1px solid ${ready ? 'transparent' : T.line}`,
            color: ready ? 'var(--edge-bg, #0A0A0C)' : T.text4,
            boxShadow: ready ? `0 16px 40px -16px rgba(${T.accRgb},0.9)` : 'none',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          <Download size={16} strokeWidth={2.8} /> Подключить
        </button>

        <button
          onClick={onDone}
          className="h-[50px] shrink-0 rounded-2xl px-5 text-[14px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}
