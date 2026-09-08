import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight } from 'lucide-react';
import { C, F, A, Cat } from '../landing/v3/base';

/* ==================================================================
   Підказки в демо.

   Три речі, через які такі тури зазвичай дратують, і що з ними
   зроблено:

   1. Затемнення без вирізу. Коли підсвічують «десь там», людина
      однаково шукає очима. Тут навколо цілі справжня діра —
      величезна тінь від прозорого прямокутника, який стоїть рівно
      на елементі.
   2. Підказка не там, де ціль. Тултіп сам вибирає бік: під ціллю,
      над нею, збоку — залежно від того, де є місце.
   3. Неможливо вимкнути. Хрестик і кнопка «Підказки» в шапці
      вимикають тур назавжди в межах сесії.
================================================================== */

const PAD = 8;
const TIP_W = 330;

export default function TourOverlay({ step, index, total, onNext, onSkip }) {
  const [box, setBox] = useState(null);
  /* Підказка не перестрибує з кроку на крок, а гасне й зʼявляється:
     стрибок читається як помилка рендера. Проміжний стан тримає
     власний прапорець, бо анімувати треба два різні елементи —
     виріз у затемненні та саму картку. */
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!step) { setShown(false); return undefined; }
    setShown(false);
    const t = setTimeout(() => setShown(true), 90);
    return () => clearTimeout(t);
  }, [step]);

  /* Позицію рахуємо в layout-фазі: якщо робити це в звичайному
     ефекті, перший кадр малює підказку в лівому верхньому куті. */
  useLayoutEffect(() => {
    if (!step) { setBox(null); return undefined; }

    const measure = () => {
      const el = step.target ? document.querySelector(step.target) : null;
      if (!el) { setBox({ center: true }); return; }
      const r = el.getBoundingClientRect();
      setBox({
        top: r.top - PAD, left: r.left - PAD,
        width: r.width + PAD * 2, height: r.height + PAD * 2,
        center: false,
      });
    };

    measure();
    const t = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => {
    if (!step) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, onNext, onSkip]);

  if (!step || !box) return null;

  /* Куди ставити підказку.

     Спершу пробуємо знизу й зверху — так читається найзвичніше. Але
     для високих цілей (сайдбар на весь екран) місця там немає, і
     підказка лягала просто на ціль, яку щойно підсвітила. Тому далі
     йдуть боки, і сторона обирається за реальним запасом місця. */
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const TIP_H = 220;
  const GAP = 14;
  let tipStyle;

  if (box.center) {
    tipStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
  } else {
    const below = vh - (box.top + box.height);
    const above = box.top;
    const right = vw - (box.left + box.width);
    const left = box.left;

    const clampX = (x) => Math.min(Math.max(16, x), vw - TIP_W - 16);
    const clampY = (y) => Math.min(Math.max(16, y), vh - TIP_H - 16);

    if (below > TIP_H + GAP) {
      tipStyle = { top: box.top + box.height + GAP, left: clampX(box.left + box.width / 2 - TIP_W / 2) };
    } else if (above > TIP_H + GAP) {
      tipStyle = { top: box.top - TIP_H - GAP, left: clampX(box.left + box.width / 2 - TIP_W / 2) };
    } else if (right > TIP_W + GAP) {
      tipStyle = { top: clampY(box.top + box.height / 2 - TIP_H / 2), left: box.left + box.width + GAP };
    } else if (left > TIP_W + GAP) {
      tipStyle = { top: clampY(box.top + box.height / 2 - TIP_H / 2), left: box.left - TIP_W - GAP };
    } else {
      tipStyle = { top: clampY(vh - TIP_H - 24), left: clampX(vw / 2 - TIP_W / 2) };
    }
  }

  const body = (
    <div style={{ position: 'fixed', inset: 0, zIndex: 4000, pointerEvents: 'none' }}>
      {/* Затемнення з вирізом навколо цілі */}
      {box.center ? (
        <div
          onClick={onNext}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(6,6,10,.82)', pointerEvents: 'auto',
            opacity: shown ? 1 : 0, transition: 'opacity .3s ease',
          }}
        />
      ) : (
        <div
          onClick={onNext}
          style={{
            position: 'absolute',
            top: box.top, left: box.left, width: box.width, height: box.height,
            borderRadius: 14,
            boxShadow: `0 0 0 9999px rgba(6,6,10,${shown ? 0.82 : 0.55})`,
            border: `1px solid ${A(shown ? 0.55 : 0)}`,
            pointerEvents: 'auto',
            transition: 'top .42s cubic-bezier(.22,1,.36,1), left .42s cubic-bezier(.22,1,.36,1), width .42s cubic-bezier(.22,1,.36,1), height .42s cubic-bezier(.22,1,.36,1), box-shadow .3s ease, border-color .3s ease',
          }}
        />
      )}

      {/* Сама підказка */}
      <div
        style={{
          position: 'absolute', width: TIP_W, pointerEvents: 'auto',
          background: 'linear-gradient(165deg,#14141d,#0c0c12)',
          border: `1px solid ${A(0.34)}`,
          borderRadius: 18, padding: 16,
          boxShadow: '0 30px 70px -20px #000',
          opacity: shown ? 1 : 0,
          transform: `${tipStyle.transform || ''} translateY(${shown ? 0 : 8}px) scale(${shown ? 1 : 0.985})`.trim(),
          transition: 'opacity .28s ease, transform .34s cubic-bezier(.22,1,.36,1), top .42s cubic-bezier(.22,1,.36,1), left .42s cubic-bezier(.22,1,.36,1)',
          ...tipStyle,
          ...(tipStyle.transform ? {} : { transform: `translateY(${shown ? 0 : 8}px) scale(${shown ? 1 : 0.985})` }),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Cat size={38} />

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.4px', color: C.accSoft }}>
                {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={onSkip}
                title="Вимкнути підказки"
                style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: 8, background: 'transparent', border: 0, color: C.text5, cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.text5; }}
              >
                <X size={13} strokeWidth={2.4} />
              </button>
            </div>

            <div style={{ fontFamily: F.display, fontSize: 15.5, fontWeight: 700, color: '#fff', letterSpacing: '-.3px', marginBottom: 6 }}>
              {step.title}
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: '#b8b8c8' }}>
              {step.text}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                style={{
                  width: i === index ? 16 : 5, height: 5, borderRadius: 999,
                  background: i === index ? C.acc : i < index ? A(0.4) : 'rgba(255,255,255,.14)',
                  transition: 'all .25s',
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={onNext}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff',
              fontFamily: F.sans, fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 11,
              cursor: 'pointer', boxShadow: '0 10px 26px rgba(74,59,245,.34)',
            }}
          >
            {index + 1 === total ? 'Готово' : 'Далі'}
            <ArrowRight size={13} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
