import { useEffect, useRef, useState } from 'react';

import { useSettings } from '../../context/SettingsContext';

/* ==================================================================
   Вхід у застосунок.

   Це не прикраса заради прикраси. Після входу нам однаково треба
   сходити в базу за станом дня — і якщо в цю мить екран порожній,
   людина бачить затримку. Якщо в цю мить росте графік, вона бачить
   ефект, а дані приїжджають під ним. Анімація коштує нуль секунд,
   бо йде поверх того, що й так відбувалось.

   Як це працює: екран закритий тією ж темрявою, що й сторінка входу.
   По ній зліва направо женеться графік — свічка за свічкою, все
   швидше. А позаду голови графіка темрява закінчується: там уже
   застосунок. Тобто екран не «зʼявляється», його відкриває сам
   графік, ніби ціна проїхала по ньому й лишила по собі робоче місце.

   Правила, без яких це стає подразником:
   • менше секунди — на десятому вході довге дратує;
   • клік чи клавіша пропускає;
   • раз на сесію, а не на кожен перехід між сторінками;
   • малюємо на canvas, а не сотнею DOM-вузлів: сорок свічок у
     розмітці — це сорок перерахунків розкладки на кожен кадр.
================================================================== */

export const FLAG = 'edge_reveal';

/* Ставимо прапорець перед переходом, а не смикаємо стан через
   півзастосунку: сторінка входу й застосунок — різні дерева. */
export const armReveal = () => {
  try { sessionStorage.setItem(FLAG, '1'); } catch { /* приватний режим */ }
};

const DUR = 950;        /* уся анімація */
const FADE = 140;       /* останній подих завіси */
const STEP = 20;        /* крок між свічками */
const CW = 10;          /* ширина тіла */
const LAG = 190;        /* наскільки голова графіка випереджає відкриття */

const BG = '#07080b';
const ACC = '139,123,255';
const UP = '0,224,164';
const DOWN = '255,99,99';

/* Різкий старт нам не потрібен: спершу графік тільки зрушує, потім
   розганяється, і останню третину екрана проходить майже миттєво.
   Саме ця крива читається як «росте, росте — і опа». */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

export default function CandleReveal({ children }) {
  const { motion: motionMode } = useSettings();

  const [play, setPlay] = useState(() => {
    try {
      if (sessionStorage.getItem(FLAG) !== '1') return false;
      sessionStorage.removeItem(FLAG);

      /* Спокійний і вимкнений режими — це і про вхід теж. Ефект, який
         людина свідомо вимкнула, не має повертатись раз на сесію. */
      if (motionMode !== 'full') return false;

      /* Кому рух шкодить — той його не бачить. Це не опція в
         налаштуваннях, а системна відповідь, яку браузер уже знає. */
      return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  const canvasRef = useRef(null);

  useEffect(() => {
    if (!play) return undefined;

    const cv = canvasRef.current;
    if (!cv) return undefined;

    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;

    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Серію рахуємо одразу на всю ширину: графік має рости, тому
       нахил закладений у генератор, а не в удачу. Дрібні відкати
       лишаємо — рівна лінія вгору виглядає як реклама, а не як ринок. */
    const n = Math.ceil(W / STEP) + 2;
    const candles = [];
    let last = H * 0.72;

    for (let i = 0; i < n; i += 1) {
      const rise = (H * 0.42) / n;                    /* загальний нахил */
      const noise = (Math.random() - 0.42) * (H * 0.035);
      const o = last;
      const c = Math.max(H * 0.14, o - rise - noise);
      const h = Math.min(o, c) - Math.random() * (H * 0.018);
      const l = Math.max(o, c) + Math.random() * (H * 0.018);
      last = c;
      candles.push({ o, h, l, c, x: i * STEP });
    }

    const start = performance.now();
    let raf;
    let stopped = false;

    const frame = (now) => {
      const t = Math.min(1, (now - start) / DUR);
      const p = ease(t);

      const head = p * (W + LAG);          /* де зараз голова графіка */
      const open = Math.max(0, head - LAG); /* докуди вже видно застосунок */

      ctx.clearRect(0, 0, W, H);

      /* Завіса лишається тільки праворуч від межі. Ліворуч — чисто,
         і крізь прозорий canvas видно живий застосунок. */
      ctx.fillStyle = BG;
      ctx.fillRect(open, 0, W - open, H);

      /* Усе, що малюємо далі, живе тільки на завісі */
      ctx.save();
      ctx.beginPath();
      ctx.rect(open, 0, W - open, H);
      ctx.clip();

      /* сітка — щоб темрява читалась як термінал, а не як заглушка */
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let y = H * 0.18; y < H; y += H * 0.16) {
        ctx.beginPath();
        ctx.moveTo(open, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
        ctx.stroke();
      }

      /* свічки до голови */
      const shown = candles.filter((k) => k.x <= head);

      shown.forEach((k) => {
        const up = k.c <= k.o;              /* вгору = менший y */
        const xc = k.x + CW / 2;

        ctx.strokeStyle = `rgba(${up ? UP : DOWN},0.34)`;
        ctx.fillStyle = `rgba(${up ? UP : DOWN},0.16)`;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(xc, k.h);
        ctx.lineTo(xc, k.l);
        ctx.stroke();

        const bt = Math.min(k.o, k.c);
        const bh = Math.max(2, Math.abs(k.c - k.o));
        ctx.fillRect(k.x, bt, CW, bh);
        ctx.strokeRect(k.x + 0.5, bt + 0.5, CW - 1, bh - 1);
      });

      /* лінія ціни поверх свічок */
      if (shown.length > 1) {
        ctx.beginPath();
        shown.forEach((k, i) => {
          const x = k.x + CW / 2;
          if (i) ctx.lineTo(x, k.c); else ctx.moveTo(x, k.c);
        });
        ctx.strokeStyle = `rgba(${ACC},0.75)`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      ctx.restore();

      /* Голова. Живе поза межею відсікання: саме вона веде око, і
         гасити її на краю не можна. */
      const hd = shown[shown.length - 1];
      if (hd) {
        const hx = Math.min(head, W);
        const hy = hd.c;

        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACC},0.95)`;
        ctx.shadowColor = `rgba(${ACC},0.9)`;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      /* Світна межа: те, чим графік «розрізає» темряву */
      if (open > 0 && open < W) {
        const g = ctx.createLinearGradient(open - 26, 0, open + 2, 0);
        g.addColorStop(0, `rgba(${ACC},0)`);
        g.addColorStop(1, `rgba(${ACC},0.5)`);
        ctx.fillStyle = g;
        ctx.fillRect(open - 26, 0, 28, H);

        ctx.fillStyle = `rgba(${ACC},0.85)`;
        ctx.fillRect(open - 1, 0, 2, H);
      }

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else if (!stopped) {
        stopped = true;
        setPlay(false);
      }
    };

    raf = requestAnimationFrame(frame);

    const skip = () => { stopped = true; cancelAnimationFrame(raf); setPlay(false); };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [play]);

  return (
    <>
      {children}

      {play && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none fixed inset-0 z-[200] h-full w-full"
          style={{ animation: `edge-reveal-out ${FADE}ms ease ${DUR - FADE}ms forwards` }}
        />
      )}

      {play && (
        <style>{`
          @keyframes edge-reveal-out { to { opacity: 0; } }
        `}</style>
      )}
    </>
  );
}
