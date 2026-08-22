import { useEffect, useRef } from 'react';

/* ==================================================================
   Відгук на клік.

   Свідомо тихий. Перша версія була феєрверком: іскри з гравітацією,
   довгі хвости, п'ять кольорів — і кожен клік по кнопці перетворювався
   на подію, якої ніхто не просив. Салют на сторінці, де людина
   намагається щось прочитати, дратує вже на третьому кліку.

   Тепер це коротке зітхання: кілька крихітних пилинок спливають
   угору й тануть. Помітно краєм ока, не заважає, не відволікає.

   Один canvas на весь екран, який нічого не ловить. Поки пилинок
   немає — цикл зупинений, тому сторінка не гріє процесор просто від
   того, що вона відкрита.
================================================================== */

const COLORS = ['139,123,255', '167,139,250', '255,255,255'];

export default function ClickBurst({ count = 7 }) {
  const canvasRef = useRef(null);
  const partsRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      const parts = partsRef.current;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i];

        /* Легкий підйом замість падіння: пил, а не искри від удару */
        p.vy -= 0.008;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;

        if (p.life <= 0) { parts.splice(i, 1); continue; }

        /* Плавне згасання з обох кінців: пилинка проявляється й
           так само тихо зникає, без різкої появи */
        const a = Math.sin(Math.max(0, Math.min(1, p.life)) * Math.PI) * 0.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${a})`;
        ctx.fill();
      }

      if (parts.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    const spawn = (x, y) => {
      const parts = partsRef.current;
      if (parts.length > 90) return;

      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8;
        const speed = 0.5 + Math.random() * 1.1;

        parts.push({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.5,
          size: 0.9 + Math.random() * 1.1,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          life: 1,
          decay: 0.012 + Math.random() * 0.01,
        });
      }

      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    };

    const onDown = (e) => {
      /* Тільки основна кнопка й тільки реальний клік мишею або
         пальцем — програмні кліки з коду пилу не заслуговують */
      if (e.button !== 0 || !e.isTrusted) return;
      spawn(e.clientX, e.clientY);
    };

    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerdown', onDown);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [count]);

  /* Тим, хто вимкнув анімації в системі, нічого не показуємо */
  if (typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[999]"
    />
  );
}
