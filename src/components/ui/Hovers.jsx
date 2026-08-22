import { useState } from 'react';
import { motion, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';
import { T, EASE, SPRING, SPRING_SOFT } from '../../lib/theme';

/* ==================================================================
   Спільні hover-ефекти на framer-motion.
   Правило: ефект має підказувати «це інтерактивне», а не влаштовувати
   світлове шоу. Все тримається в межах 200-400мс і без неонів.
================================================================== */

/* ------------------------------------------------------------------
   Spotlight — мʼяке світло йде за курсором по краю картки.
   Живе на 1px обідку через маску, тому не засвічує контент.
------------------------------------------------------------------ */
export function Spotlight({
  children,
  className = '',
  style,
  radius = 340,
  color = `rgba(${T.accRgb},0.35)`,
  lift = true,
  clip = false,          // true — обрізати вміст по радіусу (для карток із картинками/смужками)
  onClick,
  ...rest
}) {
  const mx = useMotionValue(-500);
  const my = useMotionValue(-500);

  const border = useMotionTemplate`radial-gradient(${radius}px circle at ${mx}px ${my}px, ${color}, transparent 70%)`;
  const wash   = useMotionTemplate`radial-gradient(${radius * 1.1}px circle at ${mx}px ${my}px, rgba(255,255,255,0.035), transparent 65%)`;

  /* Хендлери ззовні не мають затирати внутрішні — інакше пляма світла
     лишається там, де курсор вийшов. Тому склеюємо їх. */
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
    rest.onMouseMove?.(e);
  };
  const leave = (e) => {
    mx.set(-500);
    my.set(-500);
    rest.onMouseLeave?.(e);
  };

  const { onMouseMove: _mm, onMouseLeave: _ml, ...restProps } = rest;

  return (
    <motion.div
      onClick={onClick}
      whileHover={lift ? { y: -3 } : undefined}
      transition={SPRING_SOFT}
      className={`group relative ${clip ? 'overflow-hidden' : ''} ${className}`}
      style={style}
      {...restProps}
      onMouseMove={move}
      onMouseLeave={leave}
    >
      {/* легкий підсвіт поверхні — обрізаний окремо, щоб контент (напр. тултіпи графіків) міг виходити за межі картки */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-400 group-hover:opacity-100"
        style={{ background: wash }}
      />

      {/* світло на обідку */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-400 group-hover:opacity-100"
        style={{
          background: border,
          padding: 1,
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />

      <div className="relative z-10 h-full">{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   SoftCard — базовий ховер для будь-якої поверхні.
   Три речі й нічого більше: картка піднімається на 2px, рамка
   світлішає, під нею глибшає тінь. Так роблять на добрих продуктових
   сайтах — ефект помічаєш периферійно й він не набридає за 200 разів
   на день, на відміну від нахилів і плям світла.
------------------------------------------------------------------ */
export function SoftCard({
  children,
  className = '',
  style,
  lift = 2,
  interactive = true,
  onClick,
  ...rest
}) {
  const base = {
    background: T.surface,
    border: `1px solid ${T.line}`,
    boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset',
    ...style,
  };

  return (
    <motion.div
      onClick={onClick}
      whileHover={interactive && lift ? { y: -lift } : undefined}
      transition={{ duration: 0.22, ease: EASE }}
      className={`group relative rounded-2xl ${className}`}
      style={{ ...base, transition: 'border-color 240ms ease, box-shadow 240ms ease, background-color 240ms ease' }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        e.currentTarget.style.borderColor = T.lineHi;
        e.currentTarget.style.boxShadow = '0 20px 44px -28px rgba(0,0,0,0.95), 0 1px 0 rgba(255,255,255,0.05) inset';
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (!interactive) return;
        e.currentTarget.style.border = base.border;
        e.currentTarget.style.boxShadow = base.boxShadow;
        rest.onMouseLeave?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Tilt — легкий 3D-нахил за курсором. Максимум 6°, інакше
   інтерфейс починає «плавати» і дратує при довгій роботі.
------------------------------------------------------------------ */
export function Tilt({ children, className = '', style, max = 6, scale = 1.01, ...rest }) {
  const rx = useSpring(0, { stiffness: 220, damping: 22, mass: 0.6 });
  const ry = useSpring(0, { stiffness: 220, damping: 22, mass: 0.6 });

  const move = ({ currentTarget, clientX, clientY }) => {
    const r = currentTarget.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * 2 - 1;
    const py = ((clientY - r.top) / r.height) * 2 - 1;
    rx.set(-py * max);
    ry.set(px * max);
  };

  return (
    <motion.div
      onMouseMove={move}
      onMouseLeave={() => { rx.set(0); ry.set(0); }}
      whileHover={{ scale }}
      transition={SPRING_SOFT}
      className={className}
      style={{ ...style, rotateX: rx, rotateY: ry, transformPerspective: 1200 }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------
   Magnetic — кнопка ледь тягнеться до курсора. Дуже стримано:
   максимум 4px, інакше промахуєшся мимо кнопки.
------------------------------------------------------------------ */
export function Magnetic({ children, className = '', style, strength = 4, onClick, ...rest }) {
  const x = useSpring(0, SPRING);
  const y = useSpring(0, SPRING);

  const move = ({ currentTarget, clientX, clientY }) => {
    const r = currentTarget.getBoundingClientRect();
    x.set(((clientX - r.left) / r.width - 0.5) * strength * 2);
    y.set(((clientY - r.top) / r.height - 0.5) * strength * 2);
  };

  return (
    <motion.button
      onMouseMove={move}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className={className}
      style={{ ...style, x, y }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

/* ------------------------------------------------------------------
   Shine — діагональний блиск пробігає по кнопці один раз при наведенні.
   Обгортає будь-який контент, сам нічого не рендерить крім шару.
------------------------------------------------------------------ */
export function Shine({ children, className = '', style, ...rest }) {
  return (
    <span className={`group/shine relative overflow-hidden ${className}`} style={style} {...rest}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full skew-x-[-20deg] transition-transform duration-700 ease-out group-hover/shine:translate-x-full"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
        }}
      />
      <span className="relative z-10">{children}</span>
    </span>
  );
}

/* ------------------------------------------------------------------
   Reveal — контент виїжджає знизу при наведенні на батька.
   Використовується для підказок і кнопок над картинками.
------------------------------------------------------------------ */
export function Reveal({ children, className = '', from = 8 }) {
  return (
    <span
      className={`pointer-events-none block opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:opacity-100 ${className}`}
      style={{ transform: `translateY(${from}px)` }}
      ref={(el) => {
        if (!el) return;
        const parent = el.closest('.group');
        if (!parent || parent.dataset.revealBound) return;
        parent.dataset.revealBound = '1';
        parent.addEventListener('mouseenter', () => (el.style.transform = 'translateY(0)'));
        parent.addEventListener('mouseleave', () => (el.style.transform = `translateY(${from}px)`));
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------
   CountUp — число плавно набігає при першій появі.
   Дрібниця, але робить дашборд «живим» без анімації всього підряд.
------------------------------------------------------------------ */
export function useHoverState() {
  const [hovered, setHovered] = useState(false);
  const bind = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  };
  return [hovered, bind];
}
