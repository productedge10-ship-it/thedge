import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, X, Sparkles } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { EdgeMonogram } from './Layout';
import { useSettings } from '../../context/SettingsContext';
import useCloudState from '../../hooks/useCloudState';
import { KEY, STEPS, EMPTY, OPEN_EVENT, normalize } from '../../lib/tour';

/* ==================================================================
   Тур застосунком.

   Дві речі роблять його не схожим на звичайний туторіал.

   Перше — картка не зникає й не зʼявляється, вона **перелітає** від
   кроку до кроку. Це не прикраса: коли підказка щоразу гасне й
   спалахує в новому місці, око втрачає її і починає шукати заново.
   Летюча картка тягне погляд за собою, і людина сама приїжджає туди,
   куди треба дивитись.

   Друге — виріз у затемненні. Замість стрілки, яка кудись показує,
   ми просто гасимо все, крім потрібного елемента. Показувати
   стрілкою — це просити знайти; вирізати — це не лишити варіантів.

   Виріз зроблений однією гігантською тінню на прозорому блоці:
   box-shadow заливає весь екран, а сам блок лишається дірою. Так не
   потрібні ні SVG-маски, ні чотири прямокутники по краях, і все
   анімується як звичайні координати.
================================================================== */

const PAD = 8;      /* повітря навколо вирізу */
const CARD = 352;   /* ширина хмаринки */
const GAP = 30;     /* відстань від вирізу: місце для кота */
const CAT = 56;     /* розмір кота */

/* Пружина навмисно мʼякша за решту застосунку: кіт має долетіти, а
   не телепортуватись. Трохи нижча жорсткість і менше гасіння дають
   легкий доліт у кінці — саме він читається як політ. */
const SPRING = { type: 'spring', stiffness: 190, damping: 22, mass: 1 };

/* Куди поставити картку, щоб вона не виїхала за екран. Бажане місце
   беремо з кроку, але якщо там не влазить — обираємо самі: краще
   збоку, ніж наполовину за краєм. */
/* Висота приходить виміряна, а не вгадана. Раніше тут стояло
   приблизне число — і хмаринка з довгим текстом спокійно вилазила
   під нижній край екрана, бо «влазить» рахувалось не для неї.
   Текст у кроках різної довжини, тож єдиний надійний спосіб —
   спитати в самого елемента. */
function place(rect, want, H) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits = {
    right: rect.right + GAP + CARD < vw - 12,
    left: rect.left - GAP - CARD > 12,
    bottom: rect.bottom + GAP + H < vh - 12,
    top: rect.top - GAP - H > 12,
  };

  const order = [want, 'right', 'bottom', 'left', 'top'].filter((p, i, a) => a.indexOf(p) === i);
  const use = order.find((p) => fits[p]) || 'bottom';

  let x;
  let y;

  if (use === 'right') { x = rect.right + GAP; y = rect.top; }
  else if (use === 'left') { x = rect.left - GAP - CARD; y = rect.top; }
  else if (use === 'top') { x = rect.left; y = rect.top - GAP - H; }
  else { x = rect.left; y = rect.bottom + GAP; }

  /* Затискаємо в межі екрана вже після вибору сторони. Кіт висить
     над верхнім кутом хмаринки, тому згори лишаємо йому місце —
     інакше він зрізався б об край так само, як хмаринка знизу. */
  x = Math.max(12, Math.min(x, vw - CARD - 12));
  y = Math.max(34, Math.min(y, vh - H - 12));

  return { x, y, use };
}

export default function Tour() {
  const navigate = useNavigate();
  const location = useLocation();
  const { motion: motionMode } = useSettings();
  const [state, setState, { ready }] = useCloudState(KEY, EMPTY, { normalize });

  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const raf = useRef(0);

  /* Реальна висота хмаринки. Міряємо через ResizeObserver, бо текст
     кроку міняється всередині вже змонтованого елемента — і висота
     разом із ним, без жодного перемонтування. */
  const cardRef = useRef(null);
  const [cardH, setCardH] = useState(240);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  /* Відкриття ззовні */
  useEffect(() => {
    const go = () => { setI(0); setOpen(true); };
    window.addEventListener(OPEN_EVENT, go);
    return () => window.removeEventListener(OPEN_EVENT, go);
  }, []);

  /* Сам себе тур не запускає: його викликає онбординг після того, як
     людина відповіла на питання. Інакше він накривав би анкету. */

  const finish = useCallback((status) => {
    setOpen(false);
    setState({ status, step: 0, at: new Date().toISOString() });
  }, [setState]);

  /* Крок може жити на іншій сторінці — переходимо мовчки */
  useEffect(() => {
    if (!open || !step?.route) return;
    if (location.pathname !== step.route) navigate(step.route);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, i]);

  /* ---------- пошук цілі ----------

     Міряємо в циклі, а не один раз: сторінка після переходу ще
     доїжджає, панелі анімуються, і рамка, знята одразу, виявляється
     не там. Дешевше перемірювати, ніж вгадувати момент. */
  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    let alive = true;
    let tries = 0;

    const tick = () => {
      if (!alive) return;
      const el = document.querySelector(step.sel);

      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, right: r.right, bottom: r.bottom });
      } else if (tries > 36) {
        /* Ціль так і не знайшлась — крок пропускаємо, а не показуємо
           картку, що вказує в порожнечу. Найчастіша причина не
           помилка, а схований у налаштуваннях розділ: розповідати
           про нього тоді нема сенсу. Поріг короткий саме тому —
           кілька схованих розділів підряд не мають перетворитись на
           кілька секунд порожнечі. */
        setRect(null);
        if (!last) setI((v) => v + 1); else finish('done');
        return;
      } else {
        tries += 1;
      }

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(raf.current); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open, i, step?.sel]);

  /* Клавіатура: тур має закриватись і гортатись без миші */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') finish('skipped');
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (last) finish('done'); else setI((v) => v + 1);
      }
      if (e.key === 'ArrowLeft' && i > 0) setI((v) => v - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, last, finish]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return undefined;
    const measure = () => setCardH(el.offsetHeight || 240);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [open, i]);

  if (!ready || !open || !step || !rect) return null;
  if (typeof document === 'undefined') return null;

  const pos = place(rect, step.place, cardH);
  /* Вимкнені анімації — картка просто зʼявляється на місці */
  const still = motionMode === 'off';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="tour"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="fixed inset-0 z-[500]"
        style={{ pointerEvents: 'none' }}
      >
        {/* ---------- виріз ----------
            Прозорий блок, навколо якого тінь заливає весь екран.
            Він же ловить кліки повз ціль, щоб тур не «протикався». */}
        <motion.div
          className="absolute rounded-2xl"
          animate={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          transition={still ? { duration: 0 } : SPRING}
          style={{
            pointerEvents: 'auto',
            boxShadow: `0 0 0 9999px rgba(6,6,8,0.78), inset 0 0 0 1px rgba(${T.accRgb},0.55)`,
          }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* м'який ореол навколо вирізу — щоб край не був різаний */}
        <motion.div
          className="absolute rounded-2xl"
          animate={{
            top: rect.top - PAD - 6,
            left: rect.left - PAD - 6,
            width: rect.width + PAD * 2 + 12,
            height: rect.height + PAD * 2 + 12,
          }}
          transition={still ? { duration: 0 } : SPRING}
          style={{
            pointerEvents: 'none',
            boxShadow: `0 0 34px rgba(${T.accRgb},0.32)`,
          }}
        />

        {/* Приземлення. Одна хвиля, що розходиться від вирізу на
            кожному новому кроці — коротка позначка «дивись сюди», яка
            встигає спрацювати, поки кіт ще летить, і не перетворюється
            на постійне блимання. */}
        {!still && (
          <motion.div
            key={`pulse-${step.id}`}
            className="absolute rounded-2xl"
            initial={{
              top: rect.top - PAD,
              left: rect.left - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              opacity: 0.55,
              scale: 1,
            }}
            animate={{ opacity: 0, scale: 1.08 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.18 }}
            style={{
              pointerEvents: 'none',
              boxShadow: `0 0 0 2px rgba(${T.accRgb},0.6)`,
            }}
          />
        )}

        {/* ---------- кіт із хмаринкою ----------
            Один елемент на весь тур: він не перемонтовується, а
            перелітає. Саме через це погляд не губиться — а кіт іще й
            тягне його за собою, бо за живим оком стежать мимоволі. */}
        <motion.div
          className="absolute"
          animate={{ x: pos.x, y: pos.y }}
          initial={{ x: pos.x, y: pos.y }}
          transition={still ? { duration: 0 } : SPRING}
          style={{ top: 0, left: 0, width: CARD, pointerEvents: 'auto' }}
        >
          {/* Кіт зависає над кутом хмаринки й тихо гойдається на
              місці. Гойдання окремою анімацією від польоту: інакше
              воно збивало б пружину під час перельоту. */}
          <motion.div
            className="absolute z-10"
            style={{ left: -18, top: -26 }}
            animate={still ? {} : { y: [0, -5, 0], rotate: [-2.5, 2.5, -2.5] }}
            transition={still ? { duration: 0 } : {
              duration: 4.2, repeat: Infinity, ease: 'easeInOut',
            }}
          >
            <div
              className="grid place-items-center rounded-2xl"
              style={{
                width: CAT,
                height: CAT,
                background: `radial-gradient(circle at 50% 30%, rgba(${T.accRgb},0.26), var(--edge-panel, #131316) 78%)`,
                border: `1px solid rgba(${T.accRgb},0.45)`,
                boxShadow: `0 14px 34px -10px rgba(${T.accRgb},0.55)`,
              }}
            >
              <EdgeMonogram />
            </div>
          </motion.div>

          <div
            ref={cardRef}
            className="overflow-hidden rounded-2xl"
            style={{
              background: 'var(--edge-panel, #131316)',
              border: `1px solid ${T.line}`,
              boxShadow: 'var(--edge-panel-shadow, 0 40px 100px -30px rgba(0,0,0,0.9))',
            }}
          >
          <div className="px-5 pb-4 pl-[52px] pt-4.5">
            <div className="mb-2.5 flex items-center gap-2">
              <Sparkles size={12} strokeWidth={2.6} style={{ color: T.acc }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.acc }}>
                Знайомство
              </span>
              <button
                onClick={() => finish('skipped')}
                className="ml-auto grid h-6 w-6 place-items-center rounded-lg transition-colors"
                style={{ color: T.text4 }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <X size={13} strokeWidth={2.6} />
              </button>
            </div>

            {/* Текст міняється всередині картки, поки сама картка
                летить — так перехід читається як одна дія. */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: still ? 0 : 0.22, ease: EASE }}
              >
                <h3
                  className="mb-2 text-[17px] font-bold leading-[1.25]"
                  style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                >
                  {step.title}
                </h3>
                <p className="text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.62 }}>
                  {step.text}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div
            className="flex items-center gap-3 px-5 py-3"
            style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}
          >
            {/* Прогрес крапками: видно, що кінець близько, і це не
                виглядає як завдання з дедлайном */}
            <div className="flex items-center gap-1.5">
              {STEPS.map((s, k) => (
                <button
                  key={s.id}
                  onClick={() => setI(k)}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: k === i ? 18 : 6,
                    background: k === i ? T.acc : k < i ? `rgba(${T.accRgb},0.4)` : T.lineHi,
                  }}
                />
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {i > 0 && (
                <button
                  onClick={() => setI((v) => v - 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg transition-colors"
                  style={{ border: `1px solid ${T.line}`, color: T.text3 }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
                >
                  <ArrowLeft size={13} strokeWidth={2.5} />
                </button>
              )}
              <button
                onClick={() => (last ? finish('done') : setI((v) => v + 1))}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-bold transition-transform active:scale-[0.98]"
                style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
              >
                {last ? 'Зрозуміло' : 'Далі'}
                {!last && <ArrowRight size={13} strokeWidth={2.8} />}
              </button>
            </div>
          </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
