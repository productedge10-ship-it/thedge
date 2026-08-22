import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { X, Send, ArrowRight, Sparkles } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { EdgeMonogram } from './Layout';
import { useSettings } from '../../context/SettingsContext';
import {
  findAnswer, HELLO, MISS, STARTERS, OPEN_EVENT,
} from '../../lib/catChat';

/* ==================================================================
   Чат із котом.

   Панель поруч із бічним меню, а не вікно по центру: питання «де
   калькулятор» задають, не відриваючись від роботи, і затемнювати
   заради нього весь екран — це перебільшити важливість питання.

   Кіт «думає» перед відповіддю. Пауза тут не для краси: миттєва
   відповідь читається як пошук по сторінці, а коротка затримка з
   трьома крапками — як розмова. Різниця в тому, чи людина спитає
   вдруге.

   AI поки немає, і вдавати його не треба. Кіт відповідає з бази і
   чесно каже, коли не знає.
================================================================== */

/* Віконце, а не панель на весь бік.

   Питання «де калькулятор» не варте половини екрана: висока панель
   сама по собі обіцяє довгу розмову, і поруч із нею дві репліки
   виглядають як порожнеча. Компактне вікно біля кота обіцяє рівно
   те, що дає — коротке уточнення й далі до роботи. */
const W = 356;
const H = 440;

function Bubble({ from, children }) {
  const mine = from === 'me';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.26, ease: EASE }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className="max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13.5px]"
        style={{
          fontFamily: T.sans,
          lineHeight: 1.6,
          background: mine ? `rgba(${T.accRgb},0.14)` : T.sunken,
          border: `1px solid ${mine ? T.lineAcc : T.line}`,
          color: mine ? T.text : T.text2,
          borderBottomRightRadius: mine ? 6 : undefined,
          borderBottomLeftRadius: mine ? undefined : 6,
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function Dots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((k) => (
        <motion.span
          key={k}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: T.text4 }}
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: k * 0.16, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function CatChat() {
  const navigate = useNavigate();
  const { motion: motionMode } = useSettings();
  const still = motionMode === 'off';

  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ id: 0, from: 'cat', text: HELLO }]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const feedRef = useRef(null);
  const inputRef = useRef(null);
  const idRef = useRef(1);
  const timers = useRef([]);

  useEffect(() => {
    const go = () => setOpen((v) => !v);
    window.addEventListener(OPEN_EVENT, go);
    return () => window.removeEventListener(OPEN_EVENT, go);
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* Стрічка тримається низу — нове повідомлення має бути видно без
     скролу, інакше кіт відповідає в порожнечу. */
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: still ? 'auto' : 'smooth' });
  }, [msgs, thinking, still]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 260);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = (text) => {
    const q = String(text || '').trim();
    if (!q || thinking) return;

    setMsgs((m) => [...m, { id: idRef.current++, from: 'me', text: q }]);
    setDraft('');
    setThinking(true);

    /* Затримка залежить від довжини відповіді: коротке «ось тут»
       не має думати три секунди, а довге пояснення — вискакувати
       миттєво. Так пауза відчувається як читання, а не як таймер. */
    const hit = findAnswer(q);
    const body = hit ? hit.text : MISS;
    const wait = still ? 0 : Math.min(1100, 320 + body.length * 3);

    timers.current.push(setTimeout(() => {
      setThinking(false);
      setMsgs((m) => [...m, {
        id: idRef.current++,
        from: 'cat',
        text: body,
        title: hit?.title,
        to: hit?.to,
        cta: hit?.cta,
      }]);
    }, wait));
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Прозорий шар — тільки щоб зловити клік повз вікно.
              Затемнення немає навмисно: воно зробило б з довідки
              модальне вікно, яке вимагає уваги. */}
          <div
            className="fixed inset-0 z-[290]"
            onClick={() => setOpen(false)}
          />

          {/* Виїжджає знизу вгору від самого кота — так видно, звідки
              воно взялось, і закриття читається як «сховалось назад». */}
          <motion.aside
            className="fixed z-[300] flex flex-col overflow-hidden rounded-2xl"
            initial={{ y: 18, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 14, opacity: 0, scale: 0.97 }}
            transition={still ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26 }}
            style={{
              left: 16,
              bottom: 16,
              width: W,
              height: H,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 32px)',
              transformOrigin: 'bottom left',
              background: 'var(--edge-panel, #131316)',
              border: `1px solid ${T.line}`,
              boxShadow: 'var(--edge-panel-shadow, 0 30px 70px -24px rgba(0,0,0,0.85))',
            }}
          >
            {/* ---------- шапка ---------- */}
            <div
              className="flex shrink-0 items-center gap-3 px-4 py-3.5"
              style={{ borderBottom: `1px solid ${T.line}` }}
            >
              <motion.div
                animate={still ? {} : { y: [0, -4, 0] }}
                transition={still ? {} : { duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="shrink-0"
              >
                <EdgeMonogram />
              </motion.div>

              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                  Кіт
                </div>
                <div className="flex items-center gap-1.5 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: T.ok }} />
                  знає, де що лежить
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors"
                style={{ color: T.text4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* ---------- стрічка ---------- */}
            <div ref={feedRef} className="custom-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-4">
              {msgs.map((m) => (
                <div key={m.id}>
                  <Bubble from={m.from}>
                    {m.title && (
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Sparkles size={10} strokeWidth={2.8} style={{ color: T.acc }} />
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: T.acc }}>
                          {m.title}
                        </span>
                      </div>
                    )}
                    {m.text}
                  </Bubble>

                  {/* Кнопка переходу — головна різниця між довідкою і
                      відповіддю: людина питала не «де», а «як туди». */}
                  {m.to && (
                    <motion.button
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      onClick={() => { navigate(m.to); setOpen(false); }}
                      className="mt-1.5 flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold transition-transform active:scale-[0.98]"
                      style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
                    >
                      {m.cta || 'Перейти'}
                      <ArrowRight size={12} strokeWidth={2.8} />
                    </motion.button>
                  )}
                </div>
              ))}

              <AnimatePresence>
                {thinking && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex justify-start"
                  >
                    <div
                      className="rounded-2xl px-3 py-2"
                      style={{ background: T.sunken, border: `1px solid ${T.line}`, borderBottomLeftRadius: 6 }}
                    >
                      <Dots />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ---------- підказки ----------
                Показуємо тільки поки розмови ще не було: після першої
                відповіді вони перетворюються на шум під рукою. */}
            {msgs.length === 1 && !thinking && (
              <div className="shrink-0 px-4 pb-1">
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                      style={{ fontFamily: T.sans, border: `1px solid ${T.line}`, color: T.text3 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ---------- поле ---------- */}
            <div className="shrink-0 p-3">
              <div
                className="flex items-center gap-2 rounded-xl px-3"
                style={{ background: T.sunken, border: `1px solid ${T.line}` }}
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') ask(draft); }}
                  placeholder="Спитай, де що лежить…"
                  className="h-11 w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:opacity-60"
                  style={{ fontFamily: T.sans, color: T.text }}
                />
                <button
                  onClick={() => ask(draft)}
                  disabled={!draft.trim() || thinking}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all"
                  style={{
                    background: draft.trim() ? T.acc : 'transparent',
                    color: draft.trim() ? 'var(--edge-on-acc, #0A0A0C)' : T.text4,
                    opacity: thinking ? 0.5 : 1,
                  }}
                >
                  <Send size={13} strokeWidth={2.6} />
                </button>
              </div>

              <p className="mt-2 px-1 text-[11px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.45 }}>
                Поки що відповідаю з довідки. Розумніший помічник — попереду.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
