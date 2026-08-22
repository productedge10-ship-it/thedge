import { useEffect } from 'react';

/* ==================================================================
   EDGE JOURNAL — Daily Plan design tokens
   Глибокий чорний + фіолетовий акцент. Максимальний контраст тексту,
   м'які поверхні. Розраховано на 6+ годин перед екраном.
================================================================== */

/* ------------------------------------------------------------------
   Кольори через CSS-змінні.

   Раніше тут лежали конкретні значення, і кожне з чотирьох тисяч
   місць у розмітці отримувало готовий колір. Тема при такому підході
   не перемикається — її можна тільки переписати в коді.

   Тепер токен — це посилання на змінну, а самі значення живуть у
   lib/themes.js і виставляються на :root. Один запис змінює весь
   застосунок, включно з inline-стилями, до яких CSS зазвичай не
   дотягується.

   Резервне значення в кожній змінній — темна тема. Тому якщо скрипт
   теми чомусь не відпрацював, інтерфейс лишається таким, яким був.

   Окрема історія — RGB-трійки. Вони підставляються всередину
   rgba(...), і rgba(var(--x), 0.2) — валідний CSS, якщо в змінній
   лежить «139,123,255». Саме тому вони зберігаються трійками, а не
   готовим кольором.
------------------------------------------------------------------ */

export const T = {
  /* Поверхні */
  bg:        'var(--edge-bg, #0A0A0C)',         // фон сторінки
  surface:   'var(--edge-surface, #131316)',    // картка
  surfaceHi: 'var(--edge-surface-hi, #18181C)', // картка при hover / вкладена панель
  sunken:    'var(--edge-sunken, #0D0D10)',     // заглиблення (поле вводу, зона графіка)

  /* Бордери */
  line:      'var(--edge-line, #232328)',
  lineHi:    'var(--edge-line-hi, #33333A)',
  lineAcc:   'var(--edge-line-acc, rgba(139,123,255,0.35))',

  /* Текст — контраст перевірено по WCAG на обох темах */
  text:      'var(--edge-text, #FAFAFA)',
  text2:     'var(--edge-text2, #B4B4BD)',
  text3:     'var(--edge-text3, #7A7A85)',
  text4:     'var(--edge-text4, #4A4A52)',

  /* Акцент */
  acc:       'var(--edge-acc, #8b7bff)',
  accRgb:    'var(--edge-acc-rgb, 139,123,255)',
  accSoft:   'var(--edge-acc-soft, rgba(139,123,255,0.10))',
  accLine:   'var(--edge-acc-line, rgba(139,123,255,0.25))',

  /* Семантика */
  ok:        'var(--edge-ok, #34d399)',
  okRgb:     'var(--edge-ok-rgb, 52,211,153)',
  warn:      'var(--edge-warn, #fbbf24)',
  warnRgb:   'var(--edge-warn-rgb, 251,191,36)',
  bad:       'var(--edge-bad, #f87171)',
  badRgb:    'var(--edge-bad-rgb, 248,113,113)',
  info:      'var(--edge-info, #60a5fa)',
  infoRgb:   'var(--edge-info-rgb, 96,165,250)',

  /* Типографіка.
     Roboto — рідний шрифт застосунку (index.css), тримаємо його всюди.
     mono лишається ТІЛЬКИ для колонок з цифрами, де важливе
     вирівнювання розрядів. Дрібні лейбли моноширинним більше не робимо —
     від цього інтерфейс виглядав як згенерований дашборд. */
  /* Через CSS-змінну, а не рядком: так шрифт можна підмінити в одному
     місці — і його підхоплять усі тисячі inline-стилів, не змінюючи
     жодного з них. Значення за замовчуванням лишається в fallback,
     тому без перемикача поводиться рівно як раніше. */
  display: "var(--edge-display, 'Roboto', system-ui, -apple-system, sans-serif)",
  sans:    "var(--edge-sans, 'Roboto', system-ui, -apple-system, sans-serif)",
  mono:    "ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace",
};

/* Плавність в стилі Apple — швидкий старт, м'яке гальмування */
export const EASE = [0.22, 1, 0.36, 1];
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 };
export const SPRING_SOFT = { type: 'spring', stiffness: 260, damping: 30 };

/* Підвантаження Roboto — того самого, що вже використовує застосунок */
export function useEdgeFonts() {
  useEffect(() => {
    if (document.getElementById('edge-roboto')) return;
    const pre1 = document.createElement('link');
    pre1.rel = 'preconnect';
    pre1.href = 'https://fonts.googleapis.com';
    const pre2 = document.createElement('link');
    pre2.rel = 'preconnect';
    pre2.href = 'https://fonts.gstatic.com';
    pre2.crossOrigin = 'anonymous';
    const css = document.createElement('link');
    css.id = 'edge-roboto';
    css.rel = 'stylesheet';
    /* Space Grotesk тут не для тексту, а для логотипа. Публічні
       сторінки живуть поза Layout, тому без цього рядка «THE EDGE»
       на них падав у системний sans і переставав бути знаком. */
    css.href =
      'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&family=Space+Grotesk:wght@500;700;800&display=swap';
    document.head.append(pre1, pre2, css);
  }, []);
}

/* Спільні варіанти появи */
export const fadeUp = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export const stagger = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
