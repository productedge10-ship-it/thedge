import { useEffect, useRef, useState } from 'react';
import { T } from '../../../lib/theme';
import { EdgeMonogram } from '../../core/Layout';

/* ==================================================================
   Спільна основа лендінга v3.

   Кольори взяті з макета — вони збігаються з палітрою застосунку.
   Шрифти навмисно НЕ з макета: там Space Grotesk і Manrope, а тут
   лишаються ті самі, якими набраний увесь продукт. Лендінг, набраний
   іншою гарнітурою, читається як чужий сайт.
================================================================== */

export const C = {
  bg: '#08080c',
  panel: '#0e0e14',
  panel2: '#0b0b10',
  sunken: '#0a0a0f',
  line: 'rgba(255,255,255,.08)',
  lineSoft: 'rgba(255,255,255,.05)',
  text: '#e9e9f2',
  text2: '#c4c4d4',
  text3: '#9e9eb0',
  text4: '#6f6f82',
  text5: '#5c5c6e',
  dim: '#4e4e60',
  acc: '#8b7bff',
  accDeep: '#4A3BF5',
  accSoft: '#a99cff',
  ok: '#2fbf8f',
  bad: '#ff7b7b',
  warn: '#f5a33b',
};

export const F = { display: T.display, sans: T.sans, mono: T.mono };

/* Ширина сторінки.

   Фіксовані 1240px гарно лягали на ноутбук і розсипались на
   зовнішньому моніторі: контент збирався вузькою колонкою посеред
   екрана, а половина ширини стояла порожня.

   Тепер смуга тягнеться до 1680px і дихає у відсотках, а бічні
   відступи ростуть разом із вікном. Рядки тексту при цьому не
   стають нечитабельно довгими — за це відповідають окремі
   обмеження на самих текстових колонках. */
export const SHELL = {
  width: '100%',
  maxWidth: 1680,
  margin: '0 auto',
  paddingLeft: 'clamp(20px, 3.4vw, 64px)',
  paddingRight: 'clamp(20px, 3.4vw, 64px)',
};

export const A = (a) => `rgba(139,123,255,${a})`;

/* Анімації тримаються в одному місці: кожен блок посилається на них
   по імені, і жодна не дублюється в п'яти файлах. */
export const KEYFRAMES = `
@keyframes lnMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes lnFadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes lnRowIn{0%{opacity:0;transform:translateY(-18px)}60%{opacity:1}100%{opacity:1;transform:translateY(0)}}
@keyframes lnFlashIn{0%{background:rgba(139,123,255,.22)}100%{background:transparent}}
@keyframes lnNumA{0%{color:#8b7bff;text-shadow:0 0 26px rgba(139,123,255,.6)}100%{text-shadow:none}}
@keyframes lnNumB{0%{color:#8b7bff;text-shadow:0 0 26px rgba(139,123,255,.6)}100%{text-shadow:none}}
@keyframes lnPing{0%{transform:scale(1);opacity:.75}100%{transform:scale(2.6);opacity:0}}
@keyframes lnCaret{0%,100%{opacity:1}50%{opacity:0}}
@keyframes lnBreathe{0%,100%{opacity:.3}50%{opacity:.62}}
@keyframes lnRailGlow{0%{transform:translateX(-30%)}100%{transform:translateX(130%)}}
@media (prefers-reduced-motion: reduce){
  .ln-root *{animation:none !important;transition:none !important}
}
`;

export const reducedMotion = () => typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* Блоки оживають, коли потрапляють в екран, і засинають, коли з нього
   йдуть: інакше три анімації крутяться одночасно на сторінці, з якої
   людина бачить одну восьму. */
export function useInView(threshold = 0.15) {
  const ref = useRef(null);
  /* Без IntersectionObserver вважаємо блок видимим одразу — інакше
     анімації не запустяться ніколи. Стартове значення, а не setState
     в ефекті: другий варіант дає зайвий каскадний рендер. */
  const [seen, setSeen] = useState(() => typeof IntersectionObserver !== 'function');

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver(
      ([e]) => setSeen(e.isIntersecting),
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return [ref, seen];
}

export const lerp = (a, b, t) => a + (b - a) * t;

export const Eyebrow = ({ children, color = C.accSoft }) => (
  <div
    style={{
      display: 'inline-flex', alignItems: 'center', gap: 9,
      fontFamily: F.mono, fontSize: 11.5, fontWeight: 700,
      letterSpacing: '2.4px', textTransform: 'uppercase', color,
    }}
  >
    <span style={{ width: 5, height: 5, borderRadius: 999, background: C.acc, display: 'block', boxShadow: `0 0 12px 2px ${A(0.6)}` }} />
    {children}
  </div>
);

export const H2 = ({ children, style }) => (
  <h2
    style={{
      fontFamily: F.display, fontWeight: 700,
      fontSize: 'clamp(28px,2.7vw,52px)', lineHeight: 1.08,
      letterSpacing: '-1.6px', color: '#fff', margin: '18px 0 0',
      textWrap: 'balance', ...style,
    }}
  >
    {children}
  </h2>
);

export const Sub = ({ children, style }) => (
  <p style={{ fontFamily: F.sans, fontSize: 16, lineHeight: 1.55, color: C.text3, margin: '14px 0 0', maxWidth: 620, ...style }}>
    {children}
  </p>
);

export const Section = ({ id, children, style, innerRef }) => (
  <section
    id={id}
    ref={innerRef}
    style={{ ...SHELL, paddingTop: 84, paddingBottom: 84, position: 'relative', ...style }}
  >
    {children}
  </section>
);

/* Кіт із сайдбара — живий: стежить за курсором, кліпає, ворушить
   вухами. Він жорстко 52×52 і має власну рамку, тому масштабується
   трансформом, а розмір слота задається окремо — інакше він вилазить
   за свій блок і накриває сусідні елементи. */
export const Cat = ({ size = 36 }) => (
  <span
    style={{
      width: size, height: size, flex: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <span style={{ transform: `scale(${(size / 52).toFixed(3)})`, transformOrigin: 'center', display: 'block' }}>
      <EdgeMonogram />
    </span>
  </span>
);

export const Glow = ({ x, y, size = 420, color = 'rgba(74,59,245,.17)', blur = 70 }) => (
  <div
    aria-hidden
    style={{
      position: 'absolute', left: x, top: y, width: size, height: size,
      background: `radial-gradient(circle, ${color}, transparent 70%)`,
      filter: `blur(${blur}px)`, pointerEvents: 'none',
    }}
  />
);
