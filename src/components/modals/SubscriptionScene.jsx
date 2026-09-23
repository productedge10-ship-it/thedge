import { useEffect, useRef } from 'react';
import { T } from '../trading/planTheme';

/* ==================================================================
   Сцена над карткою підписки.

   Це графік, а не прикраса «в стилі графіка»: свічки з тілами й
   тінями, сітка рівнів, лінія по закриттях і рівень останньої ціни.
   Стрічка повільно їде вліво, нові свічки приходять справа — так
   само, як у терміналі.

   Чому саме це. Прикраса на платному екрані має говорити про
   продукт. Зірки й конфеті сказали б «ти заплатив», хвиля —
   «тут щось технологічне»; свічки кажуть рівно те, за що платять.

   --------------------------------------------------------------
   Чому не бібліотека графіків.

   Будь-яка з них важить більше за всю цю вкладку разом, а тут
   потрібно намалювати сотню прямокутників і ламану. Тягнути движок
   заради цього — плюс кількасот кілобайт кожному, хто просто
   відкрив налаштування.

   --------------------------------------------------------------
   Чому дані вигадані й чому це чесно.

   Показувати тут справжній рахунок людини не можна: на цьому екрані
   сидить і той, у кого угод ще нуль, і тоді замість графіка була б
   порожнеча рівно в тому місці, де ми просимо грошей. А підставляти
   чужі числа — брехня. Тому це явно декоративна стрічка без осей,
   без цін і без підписів: її неможливо прочитати як чиюсь
   статистику, бо читати там нічого.
================================================================== */

/* Крок стрічки й ширина тіла. Свічки навмисно вузькі: на 168px
   висоти широкі читаються як стовпчикова діаграма, а не як ціна. */
const PITCH = 11;
const BODY = 6;

/* Пікселів за секунду. Повільно: стрічка має жити на краю зору, а
   не тягнути погляд на себе, поки людина читає ціну. */
const SPEED = 7;

/* Детермінований генератор.

   Math.random() тут був би помилкою: свічки перемальовувались би на
   кожному кадрі, і замість графіка вийшов би шум. Зерно прив'язане
   до номера свічки, тож та сама свічка завжди однакова — стрічку
   можна гортати в обидва боки й вона лишається собою. */
function noise(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/* Свічка за номером.

   Ціна — випадкове блукання з легким нахилом угору. Нахил малий
   (0.012 на свічку): різко зростаючий графік на сторінці оплати
   читається як обіцянка прибутку, а ми її не даємо. Тут потрібен
   рух, а не підйом.

   Синусоїда згори домішує повільні хвилі, щоб стрічка не була
   рівним шумом: без неї свічки виглядають як статичні перешкоди. */
const cache = new Map();

function candle(i) {
  const hit = cache.get(i);
  if (hit) return hit;

  /* Накопичену ціну рахуємо від початку, але не з нуля кожного
     разу: беремо найближчу відому зліва й доходимо від неї. */
  let base = 0;
  let from = 0;
  for (let k = i - 1; k >= 0 && k > i - 400; k -= 1) {
    const prev = cache.get(k);
    if (prev) { base = prev.c; from = k + 1; break; }
  }

  let c = base;
  let o = base;
  for (let k = from; k <= i; k += 1) {
    o = c;
    const step = (noise(k) - 0.5) * 1.9 + 0.012 + Math.sin(k * 0.085) * 0.12;
    c = o + step;
  }

  const wick = 0.25 + noise(i + 7777) * 0.85;
  const cell = {
    o,
    c,
    h: Math.max(o, c) + wick,
    l: Math.min(o, c) - wick * (0.4 + noise(i + 555) * 0.7),
  };

  cache.set(i, cell);

  /* Кеш не має рости вічно: вкладку можуть лишити відкритою на
     годину, а це шістсот свічок за хвилину. */
  if (cache.size > 900) {
    const cut = i - 400;
    cache.forEach((_, k) => { if (k < cut) cache.delete(k); });
  }

  return cell;
}

export default function SubscriptionScene({ height = 168, tone = 'acc' }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    /* Колір беремо з реальної теми, а не з константи: акцент у
       застосунку змінний, і сцена має їхати за ним. */
    const css = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => (css.getPropertyValue(name) || fallback).trim();
    const rgb = tone === 'ok'
      ? pick('--edge-ok-rgb', '52,211,153')
      : pick('--edge-acc-rgb', '139,123,255');

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let scroll = reduced ? 240 : 0;
    let last = 0;
    let w = 0;
    let h = 0;

    /* Межі ціни згладжуємо, а не перераховуємо щокадру.

       Різкий перерахунок означає, що варто новій свічці пробити
       максимум — і вся стрічка смикається вниз. Згладжування
       перетворює цей стрибок на плавне «віддалення камери», як у
       справжньому терміналі. */
    let lo = null;
    let hi = null;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const TOP = 16;
    const BOT = 34;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      if (w <= 0) return;

      const count = Math.ceil(w / PITCH) + 2;
      const first = Math.floor(scroll / PITCH);
      const shift = -(scroll % PITCH);

      const cells = [];
      for (let n = 0; n < count; n += 1) cells.push(candle(first + n));

      let tLo = Infinity;
      let tHi = -Infinity;
      cells.forEach((cell) => {
        if (cell.l < tLo) tLo = cell.l;
        if (cell.h > tHi) tHi = cell.h;
      });

      const pad = (tHi - tLo) * 0.12 || 1;
      tLo -= pad;
      tHi += pad;

      lo = lo == null ? tLo : lo + (tLo - lo) * 0.06;
      hi = hi == null ? tHi : hi + (tHi - hi) * 0.06;

      const span = Math.max(0.0001, hi - lo);
      const y = (v) => TOP + (1 - (v - lo) / span) * (h - TOP - BOT);

      /* 1. Сітка. Горизонталі рідкі й дуже тихі — вони потрібні, щоб
         око прочитало площину як цінову, а не як просто фон. */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.032)';
      for (let g = 0; g <= 3; g += 1) {
        const gy = Math.round(TOP + ((h - TOP - BOT) * g) / 3) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(w, gy);
        ctx.stroke();
      }

      /* 2. Вертикальні засічки часу — ще тихіші й рідші, кожна
         восьма свічка. Вони їдуть разом зі стрічкою, і саме це
         каже оку, що рух — це час, а не просто анімація. */
      ctx.strokeStyle = 'rgba(255,255,255,0.022)';
      for (let n = 0; n < count; n += 1) {
        if ((first + n) % 8) continue;
        const gx = Math.round(shift + n * PITCH + BODY / 2) + 0.5;
        ctx.beginPath();
        ctx.moveTo(gx, TOP);
        ctx.lineTo(gx, h - BOT);
        ctx.stroke();
      }

      /* 3. Свічки. Зростальні залиті, спадні порожні — так графік
         читається як свічковий навіть в одному кольорі. Червоно-
         зелений тут був би зайвим: карта вже має свій тон, і два
         сигнальні кольори поверх нього перетворюють спокійний фон
         на панель приладів. */
      cells.forEach((cell, n) => {
        const x = shift + n * PITCH;
        const cx = Math.round(x + BODY / 2) + 0.5;
        const up = cell.c >= cell.o;

        const yo = y(cell.o);
        const yc = y(cell.c);
        const top = Math.min(yo, yc);
        const hgt = Math.max(1.5, Math.abs(yc - yo));

        ctx.strokeStyle = `rgba(${rgb},0.2)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y(cell.h));
        ctx.lineTo(cx, y(cell.l));
        ctx.stroke();

        if (up) {
          ctx.fillStyle = `rgba(${rgb},0.26)`;
          ctx.fillRect(Math.round(x), Math.round(top), BODY, Math.round(hgt));
        } else {
          ctx.strokeStyle = `rgba(${rgb},0.3)`;
          ctx.strokeRect(Math.round(x) + 0.5, Math.round(top) + 0.5, BODY - 1, Math.max(1, Math.round(hgt) - 1));
        }
      });

      /* 4. Лінія по закриттях. Єдине яскраве в кадрі — і єдине, що
         читається з відстані: свічки дають фактуру, лінія дає форму. */
      ctx.beginPath();
      cells.forEach((cell, n) => {
        const cx = shift + n * PITCH + BODY / 2;
        const cy = y(cell.c);
        if (n) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy);
      });
      ctx.strokeStyle = `rgba(${rgb},0.95)`;
      ctx.lineWidth = 1.7;
      ctx.lineJoin = 'round';
      ctx.shadowColor = `rgba(${rgb},0.9)`;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      /* 5. Рівень останньої ціни. Пунктир і крапка — та сама
         деталь, по якій термінал упізнається з півпогляду. */
      const lastCell = cells[cells.length - 1];
      const ly = Math.round(y(lastCell.c)) + 0.5;
      const lx = shift + (count - 1) * PITCH + BODY / 2;

      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = `rgba(${rgb},0.3)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ly);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(lx, y(lastCell.c), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.shadowColor = `rgba(${rgb},0.9)`;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const loop = (ts) => {
      /* Крок рахуємо від справжнього часу, а не від кадру: на 144Гц
         стрічка інакше їхала б удвічі швидше, ніж на 60. */
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      scroll += dt * SPEED;
      draw();
      raf = requestAnimationFrame(loop);
    };

    resize();

    if (reduced) {
      /* Один кадр і тиша. Людина, яка вимкнула анімації в системі,
         зробила це не для того, щоб у налаштуваннях щось їхало. */
      draw();
    } else {
      raf = requestAnimationFrame(loop);
    }

    /* Зупиняємось, коли вкладку сховали: крутити канвас у фоні —
       це гріти батарею ноутбука заради нікого. */
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !reduced) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };

    const onResize = () => { resize(); draw(); };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tone]);

  return (
    <div className="pointer-events-none relative w-full overflow-hidden" style={{ height }} aria-hidden>
      {/* Ліворуч стрічка розчиняється, а не обривається: свічка,
          зрізана краєм карти навпіл, читається як помилка верстки. */}
      <div
        className="absolute inset-0"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 100%)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 16%, #000 100%)',
        }}
      >
        <canvas ref={ref} className="block h-full w-full" />
      </div>

      {/* Верх теж зводимо, інакше свічка впирається в кант карти і
          графік виглядає обрізаним, а не таким, що йде далі. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-5"
        style={{ background: `linear-gradient(to bottom, ${T.surface}, transparent)` }}
      />

      {/* Низ зводимо в колір карти, щоб сцена не обривалась різкою
          лінією там, де починається текст. Колір має збігатися з
          фоном карти точно — інакше на стику видно прямокутник. */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
        style={{ background: `linear-gradient(to bottom, transparent, ${T.surface})` }}
      />
    </div>
  );
}
