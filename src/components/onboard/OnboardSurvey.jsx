import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import useCloudState from '../../hooks/useCloudState';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/analytics';
import { KEY, EMPTY, normalize, PLATFORMS, GOALS, TPW, SAVED_EVENT } from '../../lib/onboard';

/* ==================================================================
   Анкета з трьох питань після першого входу.

   Одне питання на екран, відповідь — клік по варіанту, без кнопки
   «Далі». «Пізніше» закриває назавжди: другий раз ця анкета вже
   заважає, а не допомагає. Відповіді потрібні двом речам: чекліст
   підлаштовує головну дію, а ми бачимо, на якій платформі люди
   торгують (рішення про cTrader).
================================================================== */

const QUESTIONS = [
  { id: 'platform', title: tx('На якій платформі ти торгуєш?', 'Which platform do you trade on?'), options: PLATFORMS },
  { id: 'goal', title: tx('Яка в тебе ціль?', 'What is your goal?'), options: GOALS },
  { id: 'tpw', title: tx('Скільки угод на тиждень?', 'How many trades per week?'), options: TPW },
];

export default function OnboardSurvey() {
  const { user } = useAuth();
  const [state, setState, { ready }] = useCloudState(KEY, EMPTY, { normalize });
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    if (!ready || !user?.id) return;
    if (state.status === 'new') setOpen(true);
  }, [ready, user?.id, state.status]);

  const save = (v) => {
    setState(v);
    window.dispatchEvent(new CustomEvent(SAVED_EVENT, { detail: v }));
  };

  const later = () => {
    save({ ...state, ...answers, status: 'later', at: new Date().toISOString() });
    track('onboarding_skipped', { step: i });
    setOpen(false);
  };

  const pick = (id, value) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (i < QUESTIONS.length - 1) { setI(i + 1); return; }
    save({ ...state, ...next, status: 'done', at: new Date().toISOString() });
    track('onboarding_answered', next);
    setOpen(false);
  };

  const q = QUESTIONS[i];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="onb"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[520] flex items-center justify-center px-4"
          style={{ background: 'rgba(6,6,10,0.72)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            role="dialog"
            aria-label={tx('Знайомство', 'Getting started')}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="w-full max-w-[460px] rounded-2xl p-6 sm:p-7"
            style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.9)' }}
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.2em]" style={{ fontFamily: T.sans, color: T.acc }}>
                {tx(`Крок ${i + 1} з ${QUESTIONS.length}`, `Step ${i + 1} of ${QUESTIONS.length}`)}
              </span>
              <button type="button" onClick={later} className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {tx('Пізніше', 'Later')}
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <h2 className="mb-5 text-[22px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}>
                  {q.title}
                </h2>
                <div className={`grid gap-2 ${q.options.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {q.options.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => pick(q.id, value)}
                      className="rounded-xl px-3 py-3 text-left text-[14.5px] font-semibold transition-colors hover:brightness-125"
                      style={{
                        fontFamily: T.sans, color: T.text,
                        background: answers[q.id] === value ? `rgba(${T.accRgb},0.18)` : T.sunken,
                        border: `1px solid ${answers[q.id] === value ? T.acc : T.line}`,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <p className="mt-5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              {tx('Три кліки. Під відповіді підлаштуємо перші кроки.', 'Three clicks. We tailor your first steps to the answers.')}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
