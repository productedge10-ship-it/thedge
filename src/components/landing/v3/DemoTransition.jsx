import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { C, F, A, Cat } from './base';

/* ==================================================================
   Перехід «лендінг → пісочниця».

   Звичайна навігація тут читається як обрив: щойно був спокійний
   лендінг — і раптом чужий інтерфейс із сайдбаром. Перехід має
   пояснити, що відбувається, і зайняти рівно стільки часу, скільки
   треба, щоб це прочитати.

   Механіка: коло розкривається з-під самої кнопки (тому людина
   бачить причину й наслідок), усередині кіт відмічає три речі, які
   «готуються», а далі демо проявляється з того самого шару — без
   білого спалаху між сторінками.

   Загалом 1.4с. Менше — не встигаєш прочитати, більше — починаєш
   чекати.
================================================================== */

const LINES = [
  'Створюю демо-журнал',
  'Наливаю десять угод',
  'Підключаю кота-коуча',
];

export default function DemoTransition({ origin, onDone }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 40),
      /* Вміст показуємо, коли коло вже накрило екран: інакше кіт
         з'являється на тлі напіврозкритого лендінга. */
      setTimeout(() => setPhase(2), 600),
      setTimeout(() => setPhase(3), 900),
      setTimeout(() => setPhase(4), 1180),
      setTimeout(() => onDone(), 1520),
    ];
    return () => t.forEach(clearTimeout);
  }, [onDone]);

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;

  const body = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000, pointerEvents: 'all',
        /* Коло росте саме з кнопки: радіус береться з найдальшого
           кута, щоб не лишалось незаповнених ділянок на широких
           екранах. */
        clipPath: `circle(${phase >= 1 ? Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) : 0}px at ${x}px ${y}px)`,
        transition: 'clip-path .62s cubic-bezier(.7,0,.3,1)',
        /* Центр непрозорий: із прозорим першим стопом крізь коло
           просвічував лендінг, і текст «Готую пісочницю» читався
           поверх заголовка. */
        background: `radial-gradient(circle at ${x}px ${y}px, #15151f, #0b0b10 46%, #08080c)`,
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 22,
          opacity: phase >= 2 ? 1 : 0, transition: 'opacity .3s ease',
        }}
      >
        <span
          aria-hidden
          style={{
            position: 'absolute', width: 320, height: 320, borderRadius: '50%',
            background: `radial-gradient(circle, ${A(0.22)}, transparent 68%)`,
            filter: 'blur(50px)', animation: 'lnBreathe 4s ease-in-out infinite',
          }}
        />

        <span style={{ position: 'relative', transform: `scale(${phase >= 2 ? 1 : 0.9})`, transition: 'transform .5s cubic-bezier(.22,1.2,.36,1)' }}>
          <Cat size={92} />
        </span>

        <div style={{ position: 'relative', fontFamily: F.display, fontSize: 20, fontWeight: 700, letterSpacing: '-.5px', color: '#fff' }}>
          Готую пісочницю
        </div>

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 9, minWidth: 230 }}>
          {LINES.map((line, i) => {
            const done = phase >= i + 2;
            return (
              <div
                key={line}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: done ? 1 : 0.28,
                  transform: `translateY(${done ? 0 : 4}px)`,
                  transition: 'opacity .32s ease, transform .32s cubic-bezier(.22,1,.36,1)',
                }}
              >
                <span
                  style={{
                    display: 'grid', placeItems: 'center', width: 18, height: 18, borderRadius: 999,
                    background: done ? A(0.2) : 'rgba(255,255,255,.05)',
                    border: `1px solid ${done ? A(0.55) : 'rgba(255,255,255,.1)'}`,
                    color: C.accSoft, transition: 'all .3s ease',
                  }}
                >
                  {done && <Check size={10} strokeWidth={3.4} />}
                </span>
                <span style={{ fontFamily: F.sans, fontSize: 13.5, color: done ? C.text2 : C.text5, transition: 'color .3s' }}>
                  {line}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: 230, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden', marginTop: 4 }}>
          <div
            style={{
              height: '100%', borderRadius: 999,
              width: `${Math.min(100, phase * 25)}%`,
              background: `linear-gradient(90deg,${C.accDeep},${C.acc})`,
              boxShadow: `0 0 14px ${A(0.7)}`,
              transition: 'width .34s cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(body, document.body) : null;
}
