import { useEffect, useRef, useState } from 'react';
import { readToken } from '../../lib/themes';

/* ==================================================================
   Живий фон стартової сторінки.

   Та сама крапкова сітка, що на решті сайту, але жива: точки повільно
   дрейфують, як пил у невагомості, а курсор жене по них хвилю — вода,
   а не підсвітка. Клік кидає коло, що розходиться й затухає.

   Малюється на canvas одним циклом. DOM тут не задіяний узагалі:
   півтори тисячі вузлів із трансформами вбили б будь-який браузер,
   а один canvas тримає 60 кадрів навіть на ноутбуці.
================================================================== */

const SPACING = 34;        // крок сітки
const DOT = 1.15;          // радіус точки
const WAVE_R = 190;        // радіус впливу курсора
const RIPPLE_SPEED = 420;  // швидкість кола від кліку, px/с
const RIPPLE_WIDTH = 90;   // товщина гребеня

/* Кольори тут не з токенів, а прочитані з CSS.

   Причина технічна: canvas не розуміє var(), йому потрібен готовий
   колір. Тому питаємо обчислене значення в браузера — і заразом
   отримуємо правильні крапки в обох темах: на світлому тлі білі були
   б невидимі. */
export default function StarField({ hue }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    dots: [],
    pointer: { x: -9999, y: -9999, active: false },
    ripples: [],
    w: 0,
    h: 0,
    dpr: 1,
  });

  /* Перечитуємо кольори, коли міняється тема: клас на <html> — це
     єдиний сигнал, який до нас долітає, і слухати його дешевше, ніж
     тягнути сюди весь контекст налаштувань. */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const mo = new MutationObserver(() => setTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    const st = stateRef.current;

    const accent = hue || readToken('--edge-acc-rgb', '139,123,255');
    /* На темному тлі крапки світлі, на світлому — темні. Інакше
       половина сітки просто зникає. */
    const light = document.documentElement.classList.contains('edge-light');
    const dotRgb = light ? '20,20,28' : '255,255,255';

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

    /* ---------- побудова сітки ---------- */
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      st.dpr = dpr;
      st.w = w;
      st.h = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const dots = [];
      for (let y = SPACING / 2; y < h + SPACING; y += SPACING) {
        for (let x = SPACING / 2; x < w + SPACING; x += SPACING) {
          dots.push({
            x,
            y,
            /* власна фаза й швидкість дихання — інакше сітка
               пульсує синхронно й виглядає як екран, а не як пил */
            phase: Math.random() * Math.PI * 2,
            speed: 0.25 + Math.random() * 0.45,
            drift: 0.6 + Math.random() * 1.4,
            base: 0.10 + Math.random() * 0.20,
          });
        }
      }
      st.dots = dots;
    };

    build();

    /* ---------- події ---------- */
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      st.pointer.x = e.clientX - r.left;
      st.pointer.y = e.clientY - r.top;
      st.pointer.active = true;
    };
    const onLeave = () => { st.pointer.active = false; };
    const onDown = (e) => {
      const r = canvas.getBoundingClientRect();
      st.ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 0, life: 1 });
      if (st.ripples.length > 5) st.ripples.shift();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('blur', onLeave);
    document.addEventListener('pointerleave', onLeave);

    const ro = new ResizeObserver(build);
    ro.observe(canvas);

    /* ---------- цикл ---------- */
    let raf = 0;
    let prev = performance.now();

    const frame = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, st.w, st.h);

      /* кола від кліків живуть окремо від точок */
      for (let i = st.ripples.length - 1; i >= 0; i -= 1) {
        const rp = st.ripples[i];
        rp.r += RIPPLE_SPEED * dt;
        rp.life -= dt * 0.55;
        if (rp.life <= 0) st.ripples.splice(i, 1);
      }

      const px = st.pointer.x;
      const py = st.pointer.y;
      const near = st.pointer.active;

      for (let i = 0; i < st.dots.length; i += 1) {
        const d = st.dots[i];

        /* повільний дрейф — ефект невагомості */
        const wob = reduce ? 0 : Math.sin(t * d.speed + d.phase);
        let x = d.x + wob * d.drift;
        let y = d.y + Math.cos(t * d.speed * 0.8 + d.phase) * d.drift * 0.7;

        let glow = 0;

        /* хвиля від курсора: точки трохи відходять і світлішають */
        if (near) {
          const dx = x - px;
          const dy = y - py;
          const dist = Math.hypot(dx, dy);
          if (dist < WAVE_R) {
            const f = 1 - dist / WAVE_R;
            const push = f * f * 14;
            const inv = dist || 1;
            x += (dx / inv) * push;
            y += (dy / inv) * push;
            glow = f * f;
          }
        }

        /* гребінь кола від кліку */
        for (let k = 0; k < st.ripples.length; k += 1) {
          const rp = st.ripples[k];
          const dist = Math.hypot(x - rp.x, y - rp.y);
          const off = Math.abs(dist - rp.r);
          if (off < RIPPLE_WIDTH) {
            const f = (1 - off / RIPPLE_WIDTH) * rp.life;
            const dx = x - rp.x;
            const dy = y - rp.y;
            const inv = dist || 1;
            x += (dx / inv) * f * 10;
            y += (dy / inv) * f * 10;
            glow = Math.max(glow, f);
          }
        }

        const alpha = d.base + glow * 0.75;
        const radius = DOT + glow * 1.5;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = glow > 0.02
          ? `rgba(${accent}, ${Math.min(1, alpha)})`
          : `rgba(${dotRgb},${alpha})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('blur', onLeave);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [hue, tick]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{
        /* згасання донизу — те саме, що в статичної сітки,
           щоб фон не сперечався з контентом наприкінці сторінки */
        maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 92%)',
      }}
    />
  );
}
