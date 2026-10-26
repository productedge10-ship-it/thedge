import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquareHeart, X, Loader2, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import useCloudState from '../../hooks/useCloudState';
import useSubscription from '../../hooks/useSubscription';
import { supabase } from '../../lib/supabase';
import { T, EASE } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import { track } from '../../lib/pulse';

/* ==================================================================
   Короткий відгук: що подобається, що ні, і чи платив би за Lite.

   Не модалка, а картка в кутку: людина прийшла працювати, і перший
   екран не має закривати журнал. Зʼявляється на 3-й день після
   реєстрації (раніше нема про що судити), «Пізніше» — через 7 днів,
   не більше трьох показів. Відповіді — у таблицю feedback, читаємо в
   SQL або адмінці.

   Відкрити вручну: window.dispatchEvent(new Event(FEEDBACK_EVENT)).
================================================================== */

export const FEEDBACK_EVENT = 'edge:feedback';
const KEY = 'feedback_v1';
const EMPTY = { status: 'new', at: null, shown: 0 };
const normalize = (v) => ({ ...EMPTY, ...(v && typeof v === 'object' ? v : {}) });

const DAY = 864e5;
const FIRST_AFTER_DAYS = 3;
const SNOOZE_DAYS = 7;
const MAX_SHOWS = 3;

const PAY = [
  ['yes', tx('Так', 'Yes')],
  ['maybe', tx('Можливо', 'Maybe')],
  ['no', tx('Ні', 'No')],
  ['paid', tx('Вже плачу', 'Already paying')],
];

export default function FeedbackPulse() {
  const { user } = useAuth();
  const sub = useSubscription();
  const [state, setState, { ready }] = useCloudState(KEY, EMPTY, { normalize });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [score, setScore] = useState(0);
  const [likes, setLikes] = useState('');
  const [dislikes, setDislikes] = useState('');
  const [pay, setPay] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  /* Коли показати самому. */
  useEffect(() => {
    if (!ready || !user?.created_at) return undefined;
    if (state.status === 'done' || state.shown >= MAX_SHOWS) return undefined;
    const age = Date.now() - new Date(user.created_at).getTime();
    if (age < FIRST_AFTER_DAYS * DAY) return undefined;
    if (state.status === 'later' && state.at && Date.now() - new Date(state.at).getTime() < SNOOZE_DAYS * DAY) return undefined;
    /* Не в першу секунду: спершу хай відкриються сторінка й інші вікна. */
    const t = setTimeout(() => setOpen(true), 20000);
    return () => clearTimeout(t);
  }, [ready, user?.created_at, state.status, state.at, state.shown]);

  /* Відкриття вручну — одразу розгорнуто. */
  useEffect(() => {
    const on = () => { setOpen(true); setExpanded(true); };
    window.addEventListener(FEEDBACK_EVENT, on);
    return () => window.removeEventListener(FEEDBACK_EVENT, on);
  }, []);

  const later = () => {
    setOpen(false);
    if (!done) setState({ ...state, status: 'later', at: new Date().toISOString(), shown: (state.shown || 0) + 1 });
  };

  const send = async () => {
    if (!score && !likes.trim() && !dislikes.trim() && !pay) { setErr(tx('Обери хоча б оцінку', 'Pick at least a score')); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.from('feedback').insert({
      kind: 'pulse',
      score: score || null,
      likes: likes.trim().slice(0, 2000) || null,
      dislikes: dislikes.trim().slice(0, 2000) || null,
      would_pay: pay || null,
      plan: sub?.tier || (sub?.isPro ? 'pro' : sub?.hasLite ? 'lite' : 'free'),
    });
    setBusy(false);
    if (error) { setErr(tx('Не вдалось надіслати. Спробуй ще раз', 'Could not send. Try again')); return; }
    track('feedback_sent', { score, pay });
    setDone(true);
    setState({ ...state, status: 'done', at: new Date().toISOString() });
    setTimeout(() => setOpen(false), 2600);
  };

  const area = (value, set, ph) => (
    <textarea
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={ph}
      rows={2}
      className="w-full resize-none rounded-xl px-3 py-2.5 text-[13.5px] outline-none"
      style={{ fontFamily: T.sans, color: T.text, background: T.sunken, border: `1px solid ${T.line}` }}
    />
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fb"
          role="dialog"
          aria-label={tx('Відгук', 'Feedback')}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="fixed bottom-4 left-4 z-[480] w-[calc(100vw-32px)] max-w-[380px] rounded-2xl p-4"
          style={{
            background: `radial-gradient(120% 80% at 0% 0%, rgba(${T.accRgb},0.14), transparent 60%), ${T.surface}`,
            border: `1px solid rgba(${T.accRgb},0.28)`,
            boxShadow: '0 30px 80px -30px rgba(0,0,0,0.9)',
          }}
        >
          <button type="button" aria-label={tx('Закрити', 'Close')} onClick={later} className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg" style={{ color: T.text3 }}>
            <X size={15} />
          </button>

          {done ? (
            <div className="flex items-center gap-2.5 py-2 pr-6 text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
              <Check size={18} style={{ color: T.ok }} />
              {tx('Дякую! Я читаю кожен відгук.', 'Thank you! I read every reply.')}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 pr-7">
                <MessageSquareHeart size={18} style={{ color: T.acc }} />
                <div className="text-[14.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                  {tx('Як тобі THE EDGE?', 'How do you like THE EDGE?')}
                </div>
              </div>
              <p className="m-0 mt-1 text-[12.5px] leading-[1.5]" style={{ fontFamily: T.sans, color: T.text3 }}>
                {tx('30 секунд. Від відповідей залежить, що я роблю далі.', '30 seconds. Your answers decide what I build next.')}
              </p>

              <div className="mt-3 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setScore(n); setExpanded(true); }}
                    className="h-9 flex-1 rounded-lg text-[14px] font-bold transition-colors"
                    style={{
                      fontFamily: T.mono,
                      color: score === n ? T.text : T.text2,
                      background: score === n ? `rgba(${T.accRgb},0.2)` : T.sunken,
                      border: `1px solid ${score === n ? T.acc : T.line}`,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10.5px]" style={{ fontFamily: T.sans, color: T.text4 || T.text3 }}>
                <span>{tx('погано', 'bad')}</span><span>{tx('супер', 'great')}</span>
              </div>

              {expanded && (
                <div className="mt-3 flex flex-col gap-2">
                  {area(likes, setLikes, tx('Що подобається?', 'What do you like?'))}
                  {area(dislikes, setDislikes, tx('Що бісить або чого бракує?', 'What annoys you or is missing?'))}
                  <div className="mt-1 text-[12.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text2 }}>
                    {tx('Заплатив би $5/міс за бектести без ліміту й Telegram-бота?', 'Would you pay $5/mo for unlimited backtests and the Telegram bot?')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PAY.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPay(id)}
                        className="h-8 rounded-lg px-3 text-[12.5px] font-semibold"
                        style={{
                          fontFamily: T.sans,
                          color: pay === id ? T.text : T.text2,
                          background: pay === id ? `rgba(${T.accRgb},0.2)` : T.sunken,
                          border: `1px solid ${pay === id ? T.acc : T.line}`,
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {err && <div className="text-[12px]" style={{ fontFamily: T.sans, color: T.bad }}>{err}</div>}
                  <div className="mt-1 flex gap-2">
                    <button type="button" onClick={send} disabled={busy} className="edge-add-btn flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold">
                      {busy && <Loader2 size={14} className="animate-spin" />}
                      {tx('Надіслати', 'Send')}
                    </button>
                    <button type="button" onClick={later} className="h-10 rounded-xl px-3.5 text-[13px] font-semibold" style={{ fontFamily: T.sans, color: T.text3, border: `1px solid ${T.line}` }}>
                      {tx('Пізніше', 'Later')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
