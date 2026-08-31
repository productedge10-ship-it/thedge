import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useVelocity, useAnimationFrame } from 'framer-motion';
import {
  History, BookOpen, FileText, BarChart2, Users,
  Activity, AlertTriangle, LogOut, CheckSquare, BrainCircuit,
  HelpCircle, Target, Menu, X, ClipboardCheck, Calculator,
  NotebookPen, ChevronLeft, LayoutGrid, Sparkles, Settings, CalendarClock
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import PlanBackdrop from '../trading/PlanBackdrop';
import OnboardingModal from '../modals/OnboardingModal';
import VerifyEmailModal from '../modals/VerifyEmailModal';
import SettingsModal from '../modals/SettingsModal';
import Tour from './Tour';
import CatChat from './CatChat';
import ThemeSweep from './ThemeSweep';
import { openOnboarding } from '../../lib/onboarding';
import { NAV, openSettings } from '../../lib/settings';
import { openCatChat } from '../../lib/catChat';
import { useSettings } from '../../context/SettingsContext';
import appVersion from '../../version.json';

/* ------------------------------------------------------------------ */
/*  THE EDGE — theme tokens                                            */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  THE EDGE — theme tokens                                            */
/* ------------------------------------------------------------------ */


export function EdgeMonogram() {
  const [isHovered, setIsHovered] = useState(false);
  const [isStroking, setIsStroking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [earTwitch, setEarTwitch] = useState(null); // швидке смикання
  const [earFold, setEarFold] = useState(null); // повільне складання
  const [doubleBlink, setDoubleBlink] = useState(false);
  const [idleAnim, setIdleAnim] = useState('none');
  const [clickCount, setClickCount] = useState(0);

  // Секретка: лиже екран на 10 кліків (або довге натискання)
  const [lickMode, setLickMode] = useState(false);
  const [smudges, setSmudges] = useState([]);

  // Сум при спробі закрити вкладку
  const [sadMode, setSadMode] = useState(false);

  const containerRef = useRef(null);
  const lastX = useRef(0);
  const strokeTimer = useRef(null);
  const clickTimer = useRef(null);
  const globalMoveTimer = useRef(null);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);

  const strokingRef = useRef(false);
  const lickModeRef = useRef(false);
  const sadModeRef = useRef(false);
  const earFoldRef = useRef(null);

  // ===== ОЧІ =====
  const eyeX = useMotionValue(0);
  const eyeY = useMotionValue(0);
  const pupilX = useSpring(eyeX, { stiffness: 130, damping: 16 });
  const pupilY = useSpring(eyeY, { stiffness: 130, damping: 16 });

  // ===== ГОЛОВА =====
  const headTilt = useMotionValue(0);
  const headTiltS = useSpring(headTilt, { stiffness: 120, damping: 20 });
  const headDip = useMotionValue(0);
  const headDipS = useSpring(headDip, { stiffness: 220, damping: 22 });

  // ===== ВУШКА =====
  const earLBend = useMotionValue(0);
  const earRBend = useMotionValue(0);
  const earLBendS = useSpring(earLBend, { stiffness: 160, damping: 14 });
  const earRBendS = useSpring(earRBend, { stiffness: 160, damping: 14 });

  useEffect(() => {
    strokingRef.current = isStroking;
    lickModeRef.current = lickMode;
    sadModeRef.current = sadMode;
    earFoldRef.current = earFold;
  }, [isStroking, lickMode, sadMode, earFold]);

  const busy = () => strokingRef.current || lickModeRef.current || sadModeRef.current;

  // ===== ГЛОБАЛЬНИЙ ТРЕКЕР МИШІ + EXIT INTENT =====
  useEffect(() => {
    const onMove = (e) => {
      // Курсор поїхав до хрестика / панелі вкладок — кіт сумує
      const nearTop = e.clientY <= 14;
      if (nearTop !== sadModeRef.current) setSadMode(nearTop);
      if (nearTop) return;

      if (lickModeRef.current) return;
      const el = containerRef.current;
      if (!el) return;

      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;

      const reach = Math.min(dist / 110, 1) * 1.9;
      eyeX.set((dx / dist) * reach);
      eyeY.set((dy / dist) * reach);

      if (!strokingRef.current) {
        headTilt.set(Math.max(-1, Math.min(1, dx / 260)) * 7);
      }

      // Мишка зупинилась → очі й голова плавно вертаються в нейтраль
      clearTimeout(globalMoveTimer.current);
      globalMoveTimer.current = setTimeout(() => {
        eyeX.set(0);
        eyeY.set(0);
        headTilt.set(0);
      }, 900);
    };

    // Курсор взагалі покинув вікно вгору
    const onOut = (e) => {
      if (!e.relatedTarget && e.clientY <= 0) setSadMode(true);
    };

    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseout', onOut);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseout', onOut);
    };
  }, [eyeX, eyeY, headTilt]);

  // Сумний кіт: вушка прижимаються, очі дивляться прямо і трохи вгору
  useEffect(() => {
    if (sadMode) {
      earLBend.set(-35);
      earRBend.set(35);
      eyeX.set(0);
      eyeY.set(-1.5); // трохи закочує очі наверх до курсора
      headTilt.set(0);
    } else {
      earLBend.set(0);
      earRBend.set(0);
    }
  }, [sadMode, earLBend, earRBend, eyeX, eyeY, headTilt]);

  // Більш різке і реалістичне котяче смикання вушком
  const flickEar = (which) => {
    setEarTwitch(which);
    setTimeout(() => setEarTwitch(null), 350); 
  };

  const foldEar = (which) => {
    setEarFold(which);
    setTimeout(() => setEarFold(null), 2000);
  };

  // ===== IDLE-ЖИТТЯ =====
  useEffect(() => {
    let t;
    const loop = () => {
      t = setTimeout(() => {
        if (!busy() && !earFoldRef.current) {
          const r = Math.random();
          if (r < 0.15) foldEar('left');
          else if (r < 0.30) foldEar('right');
          else if (r < 0.45) foldEar('both');
          else if (r < 0.58) flickEar(Math.random() < 0.5 ? 'left' : 'right');
          else if (r < 0.68) {
            setIdleAnim('sniff');
            setTimeout(() => setIdleAnim('none'), 600);
          } else if (r < 0.78) {
            setIdleAnim('look');
            setTimeout(() => setIdleAnim('none'), 1200);
          } else if (r < 0.88) {
            // Лише анімація мявкання, без тексту
            setMouthOpen(true);
            setTimeout(() => setMouthOpen(false), 650);
          } else {
            setDoubleBlink(true);
            setTimeout(() => setDoubleBlink(false), 750);
          }
        }
        loop();
      }, 2500 + Math.random() * 4500);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  // ===== ГЛАДІННЯ =====
  const handleMouseMove = (e) => {
    if (lickMode || sadMode) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const dxm = x - lastX.current;
    lastX.current = x;

    if (Math.abs(dxm) > 1.2) {
      const dir = Math.sign(dxm);
      if (!strokingRef.current) setIsStroking(true);

      headDip.set(2.5);
      headTilt.set(dir * 10);
      if (dir < 0) {
        earLBend.set(-35);
        earRBend.set(-10);
      } else {
        earRBend.set(35);
        earLBend.set(10);
      }

      clearTimeout(strokeTimer.current);
      strokeTimer.current = setTimeout(() => {
        setIsStroking(false);
        headDip.set(0);
        earLBend.set(0);
        earRBend.set(0);
      }, 250);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setIsStroking(false);
    headDip.set(0);
    if (!sadModeRef.current) {
      earLBend.set(0);
      earRBend.set(0);
    }
  };

  /* Клік відкриває чат. Рахунок до десяти кліків прибрано не через
     примху: з чатом на першому ж кліку до десятого не дійти ніколи.
     Секретка ціла — вона й раніше вмикалась довгим натисканням, тепер
     це єдиний шлях до неї. */
  const handleClick = () => {
    if (lickMode || longPressed.current) return;
    clearTimeout(clickTimer.current);
    setClickCount(0);
    openCatChat();
  };

  const handlePressStart = () => {
    if (lickMode) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      triggerLick();
    }, 900);
  };

  const handlePressEnd = () => {
    clearTimeout(pressTimer.current);
    setTimeout(() => {
      longPressed.current = false;
    }, 50);
  };

  const triggerLick = () => {
    setLickMode(true);
    eyeX.set(0);
    eyeY.set(0);
    headTilt.set(0);

    const marks = Array.from({ length: 3 }, (_, i) => ({
      id: Date.now() + i,
      x: -10 + i * 10 + Math.random() * 4,
      y: 4 + Math.random() * 8,
      rot: -20 + Math.random() * 40,
      delay: 0.45 + i * 0.55,
    }));
    setSmudges(marks);

    setTimeout(() => setSmudges([]), 3400);
    setTimeout(() => setLickMode(false), 2900);
  };

  // ===== ОЧІ: стани =====
  const eyeAnimate = lickMode
    ? { scaleY: 0.22, opacity: 1 } // жмуриться від задоволення
    : sadMode
    ? { scaleY: 0.75, opacity: 1 } // сумний примружений погляд
    : isStroking
    ? { scaleY: 0.18, opacity: 1 }
    : doubleBlink
    ? { scaleY: [1, 0.1, 1, 0.1, 1], opacity: 1 }
    : { scaleY: [1, 0.1, 1, 1, 1], opacity: 1 };

  const eyeTransition = lickMode || sadMode
    ? { duration: 0.35 }
    : isStroking
    ? { duration: 0.18 }
    : doubleBlink
    ? { duration: 0.7 }
    : { duration: 4.5, repeat: Infinity, times: [0, 0.03, 0.06, 0.9, 1] };

  // ===== ВУШКА: складання =====
  const foldL = { rotate: [0, -35, -45, -45, -35, 0] };
  const foldR = { rotate: [0, 35, 45, 45, 35, 0] };
  const foldTransition = { duration: 2.2, ease: 'easeInOut', times: [0, 0.15, 0.3, 0.7, 0.85, 1] };

  const isFoldL = earFold === 'left' || earFold === 'both';
  const isFoldR = earFold === 'right' || earFold === 'both';

  const earAnimL = isFoldL
    ? foldL
    : earTwitch === 'left' || earTwitch === 'both'
    ? { rotate: [0, -22, 10, -5, 0] } // Різке котяче смикання
    : { rotate: 0 };
  const earAnimR = isFoldR
    ? foldR
    : earTwitch === 'right' || earTwitch === 'both'
    ? { rotate: [0, 22, -10, 5, 0] } // Різке котяче смикання
    : { rotate: 0 };

  const earTransL = isFoldL ? foldTransition : { duration: 0.35 };
  const earTransR = isFoldR ? foldTransition : { duration: 0.35 };

  // ===== АНІМАЦІЯ ГОЛОВИ (SVG-шар) =====
  // Для sadMode прибрано хитання, тепер він просто сумно дивиться
  const svgAnimate = sadMode
    ? { rotate: 0, y: 1.5, scale: 1 } 
    : lickMode
    ? { scale: [1, 1.22, 1.22, 1.22, 1], y: [0, 2, 2, 2, 0], rotate: 0 } 
    : idleAnim === 'look'
    ? { rotate: [-5, 5, 0], scale: 1, y: 0 }
    : idleAnim === 'sniff'
    ? { y: [-1, 1, -1, 0], rotate: 0, scale: 1 }
    : { rotate: 0, y: 0, scale: 1 };

  const svgTransition = sadMode
    ? { duration: 0.5, ease: 'easeOut' }
    : lickMode
    ? { duration: 2.9, times: [0, 0.15, 0.5, 0.85, 1], ease: 'easeInOut' }
    : { duration: idleAnim === 'look' ? 1.2 : 0.6, ease: 'easeInOut' };

  const accentStroke = sadMode ? '#8FA3C8' : '#C4B5FD';

  return (
    <motion.div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onClick={handleClick}
      className="shrink-0 rounded-[15px] flex items-center justify-center relative select-none cursor-pointer"
      style={{
        width: '52px',
        height: '52px',
        background: sadMode
          ? `linear-gradient(135deg, rgba(110,130,175,0.22) 0%, var(--edge-mono-bg, rgba(8,10,16,0.96)) 100%)`
          : `linear-gradient(135deg, rgba(${ACCENT},0.25) 0%, var(--edge-mono-bg, rgba(10,11,15,0.95)) 100%)`,
        border: sadMode
          ? `1px solid rgba(143,163,200,0.45)`
          : `1px solid rgba(${ACCENT},0.45)`,
        boxShadow: sadMode
          ? `var(--edge-mono-shadow, 0 8px 20px -6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)), 0 0 15px rgba(${ACCENT}, 0.15)`
          : `var(--edge-mono-shadow, 0 8px 20px -6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)), 0 0 15px rgba(${ACCENT}, 0.25)`,
        transition: 'background 0.45s, border 0.45s, box-shadow 0.45s',
      }}
      whileTap={{ scale: 0.92 }}
      animate={{ scale: isStroking ? 0.965 : 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      {/* Мокрі сліди на "склі" (лизання) */}
      <AnimatePresence>
        {smudges.map((s) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, scaleX: 0.2 }}
            animate={{ opacity: [0, 0.55, 0.4, 0], scaleX: [0.2, 1, 1, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, delay: s.delay, ease: 'easeOut' }}
            className="absolute pointer-events-none z-40"
            style={{
              left: `calc(50% + ${s.x}px)`,
              top: `calc(50% + ${s.y}px)`,
              width: '18px',
              height: '7px',
              marginLeft: '-9px',
              borderRadius: '9999px',
              rotate: `${s.rot}deg`,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
              filter: 'blur(1.2px)',
            }}
          />
        ))}
      </AnimatePresence>

      <div
        className="absolute inset-0 pointer-events-none rounded-[15px] overflow-hidden"
        style={{
          background: `radial-gradient(circle at 50% 100%, rgba(0, 224, 164, 0.15), transparent 60%)`,
        }}
      />

      {/* Дихання */}
      <motion.div
        animate={{ y: [0.5, -0.5, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative z-10 flex flex-col items-center justify-center w-full h-full pt-[3px]"
      >
        {/* Пружинна фізика голови */}
        <motion.div style={{ rotate: headTiltS, y: headDipS }}>
          <motion.svg
            viewBox="0 0 34 34"
            fill="none"
            className="w-[36px] h-[36px]"
            style={{
              filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.7))',
              overflow: 'visible',
            }}
            animate={svgAnimate}
            transition={svgTransition}
          >
            <defs>
              <linearGradient id="headGradBright" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4A4E69" />
                <stop offset="50%" stopColor="#2A2D40" />
                <stop offset="100%" stopColor="#12131A" />
              </linearGradient>
              <linearGradient id="earGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="100%" stopColor="#2A2D40" />
              </linearGradient>
              <linearGradient id="tongueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FF8FB8" />
                <stop offset="100%" stopColor="#E05C8C" />
              </linearGradient>
            </defs>

            {/* Ліве вушко */}
            <motion.g animate={earAnimL} transition={earTransL} style={{ transformOrigin: '10px 12px' }}>
              <motion.path
                d="M 7.5 13 C 5 8 5 4 7 3.5 C 9 3 12 7 14 9.5"
                fill="url(#earGrad)"
                stroke="#C4B5FD"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ rotate: earLBendS, transformOrigin: '10px 12px' }}
              />
            </motion.g>

            {/* Праве вушко */}
            <motion.g animate={earAnimR} transition={earTransR} style={{ transformOrigin: '24px 12px' }}>
              <motion.path
                d="M 26.5 13 C 29 8 29 4 27 3.5 C 25 3 22 7 20 9.5"
                fill="url(#earGrad)"
                stroke="#C4B5FD"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ rotate: earRBendS, transformOrigin: '24px 12px' }}
              />
            </motion.g>

            {/* Мордочка */}
            <motion.path
              fill="url(#headGradBright)"
              stroke={accentStroke}
              strokeWidth="1.5"
              initial={false}
              animate={
                lickMode
                  ? { d: 'M17 29.5C7 29.5 3.5 24 3.5 16C3.5 10 8.5 7 17 7C25.5 7 30.5 10 30.5 16C30.5 24 27 29.5 17 29.5Z' }
                  : { d: 'M17 29C8 29 5 24 5 16C5 10 9 7 17 7C25 7 29 10 29 16C29 24 26 29 17 29Z' }
              }
              transition={{ duration: 0.4 }}
            />

            {/* Рум'янець (тільки під час облизування) */}
            <AnimatePresence>
              {lickMode && (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ellipse cx="8.5" cy="21" rx="2.2" ry="1.2" fill="#FF9ECF" opacity="0.45" />
                  <ellipse cx="25.5" cy="21" rx="2.2" ry="1.2" fill="#FF9ECF" opacity="0.45" />
                </motion.g>
              )}
            </AnimatePresence>

            {/* Вуса */}
            <motion.g animate={isStroking ? { rotate: -10, y: 1 } : { rotate: 0, y: 0 }} style={{ transformOrigin: '5px 19px' }}>
              <path d="M2 18L6 19M2 21L6 20.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round" />
            </motion.g>
            <motion.g animate={isStroking ? { rotate: 10, y: 1 } : { rotate: 0, y: 0 }} style={{ transformOrigin: '29px 19px' }}>
              <path d="M32 18L28 19M32 21L28 20.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1" strokeLinecap="round" />
            </motion.g>

            {/* Очниці */}
            <ellipse cx="11" cy="17" rx="4.5" ry="3.5" fill="#050608" />
            <ellipse cx="23" cy="17" rx="4.5" ry="3.5" fill="#050608" />

            {/* Очі */}
            <motion.g animate={eyeAnimate} transition={eyeTransition} style={{ transformOrigin: '11px 17px' }}>
              <motion.g style={{ x: pupilX, y: pupilY }}>
                <ellipse cx="11" cy="17" rx="3.5" ry="2.8" fill="#00E0A4" style={{ filter: 'drop-shadow(0 0 5px rgba(0,224,164,0.8))' }} />
                <ellipse cx="11" cy="17" rx="0.8" ry="2.2" fill="#000" />
                <circle cx="12" cy="16" r="0.8" fill="#fff" />
              </motion.g>
            </motion.g>

            <motion.g animate={eyeAnimate} transition={eyeTransition} style={{ transformOrigin: '23px 17px' }}>
              <motion.g style={{ x: pupilX, y: pupilY }}>
                <ellipse cx="23" cy="17" rx="3.5" ry="2.8" fill="#00E0A4" style={{ filter: 'drop-shadow(0 0 5px rgba(0,224,164,0.8))' }} />
                <ellipse cx="23" cy="17" rx="0.8" ry="2.2" fill="#000" />
                <circle cx="24" cy="16" r="0.8" fill="#fff" />
              </motion.g>
            </motion.g>

            {/* Сумні брівки */}
            <AnimatePresence>
              {sadMode && (
                <motion.g initial={{ opacity: 0, y: -1 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <path d="M7.5 12.8 L14 14.6" stroke="#9DB4DC" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M26.5 12.8 L20 14.6" stroke="#9DB4DC" strokeWidth="1.1" strokeLinecap="round" />
                </motion.g>
              )}
            </AnimatePresence>

            {/* Ніс */}
            <motion.path
              d="M16.5 22L17 22.8L17.5 22Z"
              fill={lickMode ? '#FF9ECF' : '#C4B5FD'}
              stroke={lickMode ? '#FF9ECF' : '#C4B5FD'}
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={lickMode ? { scaleX: 1.3, y: -0.4 } : { scaleX: 1, y: 0 }}
              style={{ transformOrigin: '17px 22px' }}
              transition={{ duration: 0.35 }}
            />

            {/* ЯЗИЧОК (СЕКРЕТКА) */}
            <AnimatePresence>
              {lickMode && (
                <motion.g
                  initial={{ opacity: 0, scaleY: 0.1 }}
                  animate={{
                    opacity: 1,
                    scaleY: [0.1, 1, 0.55, 1, 0.55, 1, 0.1],
                    x: [0, -1.6, 1.6, -1.6, 1.6, 0, 0],
                  }}
                  exit={{ opacity: 0, scaleY: 0.1 }}
                  transition={{ duration: 2.6, ease: 'easeInOut' }}
                  style={{ transformOrigin: '17px 24px' }}
                >
                  <path
                    d="M14.4 24 C14.4 28.6 19.6 28.6 19.6 24 C18.2 23.3 15.8 23.3 14.4 24 Z"
                    fill="url(#tongueGrad)"
                    stroke="#E05C8C"
                    strokeWidth="0.5"
                  />
                  <path d="M17 25.2 L17 27.4" stroke="#D14E7E" strokeWidth="0.6" strokeLinecap="round" />
                </motion.g>
              )}
            </AnimatePresence>

            {/* Ротик */}
            <motion.path
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill={mouthOpen ? '#ff80a0' : 'none'}
              initial={false}
              animate={
                lickMode
                  ? { d: 'M15 23.8C15 24.4 16 24.8 17 24.4C18 24.8 19 24.4 19 23.8', fillOpacity: 0 }
                  : sadMode
                  ? { d: 'M15 25.6C15 24.2 16.2 23.8 17 24.4C17.8 23.8 19 24.2 19 25.6', fillOpacity: 0 }
                  : mouthOpen
                  ? { d: 'M15.5 23.8 C15.5 26.4 18.5 26.4 18.5 23.8 C17.5 23.4 16.5 23.4 15.5 23.8 Z', fillOpacity: 0.5 }
                  : isStroking
                  ? { d: 'M14 24C14 25.5 16 26 17 25C18 26 19 25.5 19 24', fillOpacity: 0 }
                  : { d: 'M15 24.5C15 25 16 25.5 17 24.5C18 25.5 19 25 19 24.5', fillOpacity: 0 }
              }
              transition={{ duration: 0.25 }}
            />
          </motion.svg>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
/* ------------------------------------------------------------------ */
/*  Логотип-текст                                                      */
/* ------------------------------------------------------------------ */
/* Раніше кожна сторінка набирала «THE EDGE» власними класами — і на
   публічних сторінках, куди Space Grotesk не долітав, знак виглядав
   зовсім іншим. Тепер логотип один на весь застосунок. */
export function EdgeWordmark({
  size = 14, tracking = 3.5, color = 'var(--edge-wordmark, #f2f4f8)', className = '', accent = false,
}) {
  return (
    <span
      className={`select-none whitespace-nowrap uppercase ${className}`}
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 800,
        fontSize: `${size}px`,
        letterSpacing: `${tracking}px`,
        color,
        lineHeight: 1.1,
      }}
    >
      {/* «THE» тихіше, «EDGE» кольором: у назві працює саме друге
          слово, і воно ж тримає весь бренд. Вмикається точково —
          у бічній панелі знак має лишатись спокійним. */}
      THE <span style={accent ? { color: 'var(--edge-acc, #8b7bff)' } : undefined}>EDGE</span>
    </span>
  );
}

const ACCENT_HEX = 'var(--edge-acc, #8b7bff)';
/* Трійка йде всередину rgba(...), тому лишається трійкою: у CSS
   запис rgba(var(--x), 0.2) валідний, якщо у змінній «139,123,255». */
const ACCENT = 'var(--edge-acc-rgb, 139,123,255)';
const EASE = [0.22, 1, 0.36, 1];

const SIDEBAR_W = 264;
/* Монограма — 52px. При RAIL_W = 76 на неї лишалось 36px після
   відступів панелі та шапки, тому кіт вилазив за краї. */
const RAIL_W = 84;

function useEdgeFonts() {
  useEffect(() => {
    if (document.getElementById('edge-auth-fonts')) return;
    const l1 = document.createElement('link');
    l1.rel = 'preconnect';
    l1.href = 'https://fonts.googleapis.com';
    const l2 = document.createElement('link');
    l2.rel = 'preconnect';
    l2.href = 'https://fonts.gstatic.com';
    l2.crossOrigin = 'anonymous';
    const l3 = document.createElement('link');
    l3.id = 'edge-auth-fonts';
    l3.rel = 'stylesheet';
    l3.href =
      /* Space Grotesk раніше обривався на 700, а логотип набраний 800 —
         вагу домальовував браузер, і знак виходив трохи різним у різних
         місцях. Тепер вага справжня. */
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.append(l1, l2, l3);
  }, []);
}



/* ------------------------------------------------------------------ */
/*  Tooltip for the collapsed rail                                     */
/* ------------------------------------------------------------------ */
function RailTooltip({ children }) {
  /* Підказка малюється в body, а не всередині рейки. Інакше вона
     зникає, щойно списку вистачає висоти й зʼявляється скрол:
     контейнер зі скролом обрізає все, що виходить за його межі. */
  const [box, setBox] = useState(null);
  const hostRef = useRef(null);

  const show = () => {
    const el = hostRef.current?.parentElement;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setBox({ top: r.top + r.height / 2, left: r.right + 14 });
  };

  return (
    <>
      <span ref={hostRef} className="hidden" aria-hidden />
      <span
        className="absolute inset-0"
        onMouseEnter={show}
        onMouseLeave={() => setBox(null)}
      />
      {box && typeof document !== 'undefined' && createPortal(
        <span
          className="pointer-events-none fixed z-[999] -translate-y-1/2 whitespace-nowrap rounded-[9px] px-3 py-[7px] text-[12px] font-semibold text-[#eef0f5]"
          style={{
            top: box.top,
            left: box.left,
            background: 'rgba(16,18,25,0.97)',
            border: `1px solid rgba(${ACCENT},0.35)`,
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          }}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav item with magical glowing background                           */
/* ------------------------------------------------------------------ */
/* Атрибут для туру. Ставиться автоматично з адреси розділу, тому
   новий пункт меню стає доступною ціллю без жодної правки тут. */
function NavItem({ to, icon: Icon, label, badge, collapsed, end = false, onClick, isDanger, tour }) {
  const Inner = ({ isActive }) => (
    <div
      className={`group relative flex items-center ${collapsed ? 'justify-center w-11 h-11 mx-auto' : 'h-11 px-3 w-full'} rounded-[12px] transition-colors duration-200 cursor-pointer ${
        isActive 
          ? 'text-[var(--edge-nav-active)]' 
          : isDanger 
            ? 'text-[var(--edge-nav)] hover:text-[#e0484f] hover:bg-[rgba(255,99,99,0.09)]'
            : 'text-[var(--edge-nav)] hover:text-[var(--edge-nav-active)] hover:bg-[var(--edge-nav-hover)]'
      }`}
    >
      {isActive && (
        <motion.div
          layoutId="edge-nav-lamp"
          className="absolute inset-0 rounded-[12px] pointer-events-none"
          style={{
            background: `linear-gradient(100deg, rgba(${ACCENT},0.18), rgba(${ACCENT},0.04) 70%)`,
            boxShadow: `inset 0 0 0 1px rgba(${ACCENT},0.22)`,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {!collapsed && (
            <div
              className="absolute left-0 top-[9px] bottom-[9px] w-[3px] rounded-r-[4px]"
              style={{ background: ACCENT_HEX, boxShadow: `0 0 12px rgba(${ACCENT},0.8)` }}
            />
          )}
        </motion.div>
      )}

      <div className={`${collapsed ? '' : 'w-[32px]'} flex shrink-0 items-center justify-center relative z-10`}>
        <Icon size={19} style={{ color: isActive ? ACCENT_HEX : 'currentColor' }} className="transition-colors duration-250" />
        {badge && (
          <span className="absolute -top-1 -right-1 w-[7px] h-[7px] pointer-events-none">
            <span className="absolute inset-0 rounded-full bg-[#f87171] opacity-60 animate-ping" />
            <span className="absolute inset-[1px] rounded-full bg-[#f87171] shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
          </span>
        )}
      </div>

      {!collapsed && (
        <span className="relative z-10 flex-1 whitespace-nowrap text-[13.5px] font-semibold tracking-[0.1px] ml-1 select-none truncate">
          {label}
        </span>
      )}
      {collapsed && <RailTooltip>{label}</RailTooltip>}
    </div>
  );

  if (onClick) {
    return (
      <div onClick={onClick} data-tour={tour} className="block outline-none select-none">
        <Inner isActive={false} />
      </div>
    );
  }

  return (
    <NavLink to={to} end={end} data-tour={tour || `nav-${to}`} className="block outline-none select-none">
      {({ isActive }) => <Inner isActive={isActive} />}
    </NavLink>
  );
}

/* ------------------------------------------------------------------ */
/*  Section group                                                      */
/* ------------------------------------------------------------------ */
function NavGroup({ title, collapsed, children }) {
  return (
    <div className="mb-3">
      <div className="relative h-6 mb-1">
        {!collapsed ? (
          <div className="absolute inset-0 flex items-end px-3 pb-1 font-['JetBrains_Mono'] text-[10px] font-semibold tracking-[2.5px] uppercase text-[var(--edge-nav-dim)] select-none">
            {title}
          </div>
        ) : (
          <div className="absolute left-3 right-3 bottom-[9px] h-px bg-[var(--edge-hair-strong)]" />
        )}
      </div>
      <nav className="flex flex-col gap-[2px]">{children}</nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar body                                                       */
/* ------------------------------------------------------------------ */
/* Іконки лишаються тут, а не в lib: тягнути lucide у файл з даними
   означало б, що список розділів більше не можна прочитати без
   збирача. Тому в даних — назва, тут — сама іконка. */
const NAV_ICONS = {
  LayoutGrid, Target, BookOpen, Activity, ClipboardCheck, CheckSquare, Calculator,
  FileText, BrainCircuit, History, NotebookPen, BarChart2, Users, AlertTriangle,
  CalendarClock,
};

function SidebarContent({ collapsed, hasUncompleted, signOut }) {
  const { hiddenNav } = useSettings();

  return (
    <div className="flex flex-col h-full relative z-10">
      {/* -------- Header (Logo) -------- */}
      {/* overflow-hidden тут обрізав монограму разом з її ореолом —
          тепер ховаємо тільки текст, який виїжджає при згортанні */}
      <div className={`flex h-[76px] shrink-0 items-center ${collapsed ? 'justify-center px-2' : 'px-3.5'}`}>
        <div className={`flex min-w-0 items-center gap-3 ${collapsed ? '' : 'w-full'}`}>
          <EdgeMonogram />
          <span className="min-w-0 flex-1 overflow-hidden">
            <AnimatePresence mode="popLayout">
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <EdgeWordmark />
                </motion.div>
              )}
            </AnimatePresence>
          </span>
        </div>
      </div>

      <div className="h-px mx-3.5 mb-2 shrink-0" style={{ background: 'linear-gradient(90deg, transparent, var(--edge-hair, rgba(255,255,255,0.07)), transparent)' }} />

      {/* -------- Nav -------- */}
      {/* Скрол потрібен в обох станах: на невисокому екрані список
          розділів довший за рейку і раніше просто вилазив за панель. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 custom-scrollbar">
        {/* Меню збирається зі списку в lib/settings.js. Порожня група
            зникає разом з усіма своїми пунктами — заголовок над
            порожнечею виглядає як помилка. */}
        <div className="flex flex-col pb-4">
          {NAV.map((g) => {
            const items = g.items.filter((it) => !hiddenNav.includes(it.to));
            if (!items.length) return null;

            return (
              <NavGroup key={g.group} title={g.group} collapsed={collapsed}>
                {items.map((it) => (
                  <NavItem
                    key={it.to}
                    collapsed={collapsed}
                    to={it.to}
                    end={it.end}
                    icon={NAV_ICONS[it.icon]}
                    label={it.label}
                    badge={it.badge === 'tasks' ? hasUncompleted : undefined}
                  />
                ))}
              </NavGroup>
            );
          })}
        </div>
      </div>

      {/* -------- Footer -------- */}
      <div className="shrink-0 px-3 pb-3.5 pt-1.5">
        <div className="h-px mx-1 mb-2" style={{ background: 'linear-gradient(90deg, transparent, var(--edge-hair, rgba(255,255,255,0.07)), transparent)' }} />

        <div className="flex flex-col gap-[2px]">
          {/* Анкета живе тут, поруч із довідкою: її шукають саме там,
              де «налаштування про мене», а не серед розділів журналу */}
          <NavItem collapsed={collapsed} onClick={openOnboarding} icon={Sparkles} label="Про тебе" tour="about" />
          <NavItem collapsed={collapsed} onClick={openSettings} icon={Settings} label="Settings" tour="settings" />
          <NavItem collapsed={collapsed} to="/faq" icon={HelpCircle} label="FAQ / Help" />
          <NavItem collapsed={collapsed} onClick={signOut} icon={LogOut} label="Sign out" isDanger />
        </div>
        
        {/* Версія. Світлодіод прибрано: у згорнутій рейці він висів
            самотньою зеленою крапкою й читався як помилка. */}
        {!collapsed && (
          <div className="mt-1.5 flex h-6 items-center px-3">
            <span className="whitespace-nowrap font-['JetBrains_Mono'] text-[9.5px] font-semibold uppercase tracking-[1.5px] text-[var(--edge-nav-dim)] select-none">
              V{appVersion?.version || '0.6'} · BETA
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MAIN LAYOUT COMPONENT                                              */
/* ================================================================== */
export default function Layout() {
  useEdgeFonts();
  const { signOut, user } = useAuth();
  const { liveBg, motion: motionMode } = useSettings();
  const [hasUncompleted, setHasUncompleted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('edge-sidebar-collapsed') === '1'; } catch { return false; }
  });
  const location = useLocation();

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try { localStorage.setItem('edge-sidebar-collapsed', c ? '0' : '1'); } catch { /* noop */ }
      return !c;
    });
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  /* Поки відкрите мобільне меню — сторінка під ним не скролиться,
     і Esc закриває, як і будь-яку іншу панель у застосунку. */
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setIsMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!user) return;

    const fetchTasksCount = async () => {
      const { count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('is_completed', false);

      if (!error) setHasUncompleted(count > 0);
    };

    fetchTasksCount();

    const channelName = `tasks_changes_${Date.now()}`;
    const tasksSubscription = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasksCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksSubscription);
    };
  }, [user]);

  return (
    <div
      className="flex flex-col md:flex-row h-[100dvh] w-full text-[#e8eaed] overflow-hidden relative"
      style={{ fontFamily: "'Manrope', sans-serif", '--edge-accent': ACCENT_HEX, backgroundColor: 'var(--edge-shell, #07080b)', isolation: 'isolate' }}
    >
      {/* ===================== MOBILE HEADER ===================== */}
      <div
        className="md:hidden flex items-center justify-between px-4 h-[60px] border-b border-[var(--edge-hair)] z-[60] shrink-0 w-full relative"
        style={{
          background: 'rgba(8,9,11,0.85)',
          backdropFilter: 'blur(16px)',
          paddingTop: 'env(safe-area-inset-top)',
          height: 'calc(60px + env(safe-area-inset-top))',
        }}
      >
        <div className="flex items-center gap-2">
          <EdgeMonogram />
          <EdgeWordmark size={13} tracking={3} className="ml-1" />
        </div>
        <button
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          className="w-10 h-10 rounded-[12px] flex items-center justify-center text-[#e8eaed]/60 hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] transition-colors"
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* ===================== MOBILE DRAWER ===================== */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 bg-black/70 z-[70] md:hidden"
              style={{ backdropFilter: 'blur(8px)' }}
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-105%' }}
              animate={{ x: 0 }}
              exit={{ x: '-105%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 left-0 z-[80] w-[86vw] max-w-[300px] p-3 md:hidden"
              style={{
                paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
                paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
              }}
            >
              <aside
                className="w-full h-full rounded-[20px] border border-[var(--edge-hair)] relative overflow-hidden"
                style={{
                  background: 'var(--edge-panel, rgba(12,13,18,0.95))',
                  backdropFilter: 'blur(30px) saturate(140%)',
                  boxShadow: 'var(--edge-panel-shadow, 0 40px 100px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08))',
                }}
              >
                <SidebarContent
                  collapsed={false}
                  hasUncompleted={hasUncompleted}
                  signOut={signOut}
                />
              </aside>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===================== DESKTOP SIDEBAR ===================== */}
      {/* На ноутбуках лишаємо ті самі 264px, але поля вужчі — інакше
         на 1280px екрані контенту лишається мало. */}
      <motion.div
        id="edge-app-sidebar"
        className="hidden md:block shrink-0 h-full p-2.5 lg:p-4 relative z-[60]"
        initial={false}
        animate={{ width: collapsed ? RAIL_W + 20 : SIDEBAR_W + 20 }}
        transition={{ duration: 0.42, ease: EASE }}
      >
        <aside
          className="w-full h-full rounded-[20px] relative overflow-visible flex flex-col"
          style={{
            /* Панель прозора. Її межа тримається на канті, а не на
               заливці — тому крапкова сітка йде наскрізь. */
            background: 'transparent',
            border: '1px solid var(--edge-hair, rgba(255,255,255,0.05))',
            boxShadow: 'inset 0 1px 0 var(--edge-hair, rgba(255,255,255,0.04))',
          }}
        >
          {/* Та сама крапкова сітка, що й на сторінці. Малюємо її тут,
              бо фон сторінки живе у своєму шарі й під панель не заходить. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[20px] opacity-[0.16]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
              backgroundSize: '32px 32px',
              maskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 85%)',
            }}
          />

          {/* Світлова лінія зверху (Hairline) */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, rgba(${ACCENT},0.55), transparent)` }}
          />
          
          {/* Ambient Glow (внутрішнє світіння) */}
          <div className="absolute top-0 left-0 w-full h-[120px] pointer-events-none rounded-t-[20px] overflow-hidden">
            <div
              className="absolute -top-10 left-1/2 -translate-x-1/2 w-[120%] h-24"
              style={{ background: `radial-gradient(ellipse at top, rgba(${ACCENT},0.12), transparent 70%)`, filter: 'blur(12px)' }}
            />
          </div>

          {/* Кнопка згортання / розгортання */}
          <button
            onClick={toggleCollapse}
            className="absolute top-[37px] -right-[12px] w-6 h-6 rounded-full bg-[#14161e] border border-[var(--edge-hair-strong)] text-[#96a0b3] hover:text-[var(--edge-text)] flex items-center justify-center cursor-pointer z-50 transition-all duration-200"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = `rgba(${ACCENT},0.35)`)}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
          >
            <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ duration: 0.42, ease: EASE }}>
              <ChevronLeft size={13} />
            </motion.div>
          </button>

          <SidebarContent
            collapsed={collapsed}
            hasUncompleted={hasUncompleted}
            signOut={signOut}
          />
        </aside>
      </motion.div>

      {/* ===================== MAIN ===================== */}
      {/* Фон малюємо один раз тут, а не в кожній сторінці — інакше
          при переходах він перемальовується заново й блимає. На
          стартовій він живий: точки дрейфують і розходяться хвилею. */}
      <main className="relative z-0 h-full w-full min-w-0 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {/* Живі крапки на всіх сторінках. На вітринах — стартовій і
            рахунках — на повну силу, на робочих екранах тихіше: там
            фон не має сперечатися з таблицями.

            «Спокійні» гасять фон нарівні з «вимкненими»: цей режим
            прямо обіцяє «без фону й ефектів входу», і живі крапки під
            час нього робили з обіцянки напівправду. Рух елементів при
            цьому лишається — саме цим calm і відрізняється від off. */}
        <PlanBackdrop
          live={
            !liveBg || motionMode !== 'full' ? 'off'
              : ['/app', '/accounts'].includes(location.pathname)
          }
        />
        <Outlet />
      </main>

      {/* Знайомство з новим користувачем. Живе тут, а не на стартовій
          сторінці: людина може зайти одразу за посиланням у журнал, і
          питання мають зустріти її будь-де. */}
      <OnboardingModal />
      {/* Нагадування підтвердити пошту. Теж живе тут, а не на сторінці
          входу: з вимкненим «Confirm email» реєстрація одразу видає
          сесію, і людина потрапляє в застосунок, не побачивши жодного
          екрана авторизації після кнопки «Зареєструватись». */}
      <VerifyEmailModal />
      <SettingsModal />
      <Tour />
      <CatChat />
      <ThemeSweep />
    </div>
  );
}