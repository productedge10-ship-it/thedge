import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crosshair, Radio, ClipboardList, ArrowUp } from 'lucide-react';
import { T, SPRING } from './planTheme';

/* ==================================================================
   Ліва вертикальна рейка-якір. Прилипає до екрану і йде разом
   зі скролом (fixed), не займає горизонтальний простір контенту.
   На вузьких екранах ховається — там keep горизонтальний sticky-варіант.
================================================================== */

export const SECTIONS = [
  { id: 'plan',   label: 'Plan',   sub: 'Before', icon: Crosshair },
  { id: 'live',   label: 'Live',   sub: 'During', icon: Radio },
  { id: 'review', label: 'Review', sub: 'After',  icon: ClipboardList },
];

export const SCROLL_OFFSET = 40;

/* Сторінка живе всередині <main> з власним overflow-y, а не у вікні.
   Тому window.scrollTo нічого не робить — шукаємо реальний контейнер. */
export function getScrollParent(node) {
  let el = node?.parentElement;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/* ---------- Scroll-spy хук ---------- */
export function useScrollSpy(ids, offset = SCROLL_OFFSET) {
  const [active, setActive] = useState(ids[0]);
  const [scrolled, setScrolled] = useState(false);
  const lockRef = useRef(false);

  const spy = useCallback(() => {
    const first = document.getElementById(ids[0]);
    if (first) {
      const sc = getScrollParent(first);
      setScrolled((sc.scrollTop ?? window.scrollY) > 320);
    }
    if (lockRef.current) return;

    let current = ids[0];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      // getBoundingClientRect — відносно viewport, тож працює
      // і для вкладеного скрол-контейнера
      if (el.getBoundingClientRect().top - offset - 24 <= 0) current = id;
    }
    setActive(current);
  }, [ids, offset]);

  useEffect(() => {
    spy();
    // capture: true — ловимо скрол вкладеного <main>
    window.addEventListener('scroll', spy, true);
    window.addEventListener('resize', spy);
    return () => {
      window.removeEventListener('scroll', spy, true);
      window.removeEventListener('resize', spy);
    };
  }, [spy]);

  const scrollTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    lockRef.current = true;
    setActive(id);

    const sc = getScrollParent(el);
    const top = sc === document.scrollingElement || sc === document.documentElement
      ? el.getBoundingClientRect().top + window.scrollY - offset
      : sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - offset;

    sc.scrollTo({ top, behavior: 'smooth' });
    setTimeout(() => { lockRef.current = false; spy(); }, 800);
  }, [offset, spy]);

  const scrollToTop = useCallback(() => {
    const first = document.getElementById(ids[0]);
    const sc = first ? getScrollParent(first) : document.scrollingElement;
    sc?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [ids]);

  return { active, scrollTo, scrollToTop, scrolled };
}

function Ring({ value, active }) {
  const R = 17;
  const C = 2 * Math.PI * R;
  const done = value >= 1;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
      <circle cx="20" cy="20" r={R} fill="none" stroke={T.line} strokeWidth="2" />
      <motion.circle
        cx="20" cy="20" r={R} fill="none"
        stroke={done ? T.ok : T.acc}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={C}
        initial={false}
        animate={{
          strokeDashoffset: C * (1 - value),
          opacity: active || value > 0 ? 1 : 0.4,
        }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ filter: value > 0 ? `drop-shadow(0 0 4px ${done ? T.ok : T.acc}66)` : 'none' }}
      />
    </svg>
  );
}

/* ==================================================================
   Десктоп: вертикальна рейка, прикріплена до лівого краю viewport,
   вертикально відцентрована. З'єднувальна лінія між кільцями —
   як прогрес-степпер.
================================================================== */
/* Динамічно рахує ліву позицію рейки — одразу за головним сайдбаром
   застосунку (не позаду нього), і оновлюється при його згортанні. */
function useRailLeft() {
  const [left, setLeft] = useState(96);

  useEffect(() => {
    const el = document.getElementById('edge-app-sidebar');
    if (!el) return;

    const measure = () => setLeft(Math.round(el.getBoundingClientRect().right + 16));
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Ловимо анімацію згортання (transition на width)
    el.addEventListener('transitionend', measure);
    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      el.removeEventListener('transitionend', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return left;
}

function DesktopRail({ active, onNavigate, progress, overall, assetSwitcher }) {
  const left = useRailLeft();
  return (
    <div
      className="fixed top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center xl:flex no-print"
      style={{ left, filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))', transition: 'left 0.42s cubic-bezier(0.22,1,0.36,1)' }}
    >
      {/* Перемикач активів — окремою капсулою над навігацією */}
      {assetSwitcher && (
        <div
          className="mb-2.5 rounded-2xl p-2"
          style={{
            background: 'rgba(13,13,16,0.90)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${T.line}`,
          }}
        >
          {assetSwitcher}
        </div>
      )}

      <div
        className="flex flex-col items-center gap-1 rounded-2xl p-2.5"
        style={{
          background: 'rgba(13,13,16,0.90)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: `1px solid ${T.line}`,
        }}
      >
        {SECTIONS.map((s, i) => {
          const isActive = active === s.id;
          const value = progress?.[s.id] ?? 0;
          const Icon = s.icon;
          const isLast = i === SECTIONS.length - 1;

          return (
            <div key={s.id} className="flex flex-col items-center">
              <button
                onClick={() => onNavigate(s.id)}
                className="group relative flex items-center"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {isActive && (
                  <motion.div
                    layoutId="planRailPill"
                    className="absolute -inset-1 rounded-xl"
                    style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}` }}
                    transition={SPRING}
                  />
                )}

                <span className="relative z-10 grid h-10 w-10 place-items-center">
                  <Ring value={value} active={isActive} />
                  <Icon
                    size={14}
                    strokeWidth={2.4}
                    className="absolute transition-colors duration-300"
                    style={{ color: isActive ? T.acc : T.text3 }}
                  />
                </span>

                {/* флаутер-підказка вправо */}
                <span
                  className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-2 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                  style={{
                    transform: 'translateY(-50%) translateX(-4px)',
                    background: T.surface,
                    border: `1px solid ${T.lineHi}`,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold" style={{ fontFamily: T.display, color: T.text }}>
                      {s.label}
                    </span>
                    <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {s.sub}
                    </span>
                  </span>
                </span>
              </button>

              {!isLast && (
                <div className="my-1 h-5 w-px overflow-hidden rounded-full" style={{ background: T.line }}>
                  <motion.div
                    className="w-full rounded-full"
                    style={{ background: T.ok, height: '100%' }}
                    initial={false}
                    animate={{ opacity: value >= 1 ? 1 : 0 }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* загальний прогрес — вертикальна смуга під кільцями */}
      <div
        className="mt-2.5 flex flex-col items-center gap-2 rounded-xl px-2 py-2.5"
        style={{ background: 'rgba(13,13,16,0.90)', backdropFilter: 'blur(20px)', border: `1px solid ${T.line}` }}
      >
        <div className="h-14 w-1 overflow-hidden rounded-full" style={{ background: T.line }}>
          <motion.div
            className="w-full rounded-full"
            style={{ background: overall >= 1 ? T.ok : T.acc, marginTop: 'auto' }}
            initial={false}
            animate={{ height: `${Math.round(overall * 100)}%` }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span
          className="text-[12px] font-semibold tabular-nums"
          style={{ fontFamily: T.sans, color: overall >= 1 ? T.ok : T.text3, writingMode: 'vertical-rl' }}
        >
          {Math.round(overall * 100)}%
        </span>
      </div>
    </div>
  );
}

/* ==================================================================
   Мобільний / планшетний фолбек: горизонтальний sticky-док зверху,
   той самий, що був — залишаємо для вузьких екранів.
================================================================== */
function MobileDock({ active, onNavigate, progress, overall }) {
  return (
    <div className="sticky top-3 z-40 mb-8 flex w-full justify-center px-2 no-print xl:hidden">
      <div
        className="pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5"
        style={{
          background: 'rgba(13,13,16,0.90)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${T.line}`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
        }}
      >
        {SECTIONS.map((s) => {
          const isActive = active === s.id;
          const value = progress?.[s.id] ?? 0;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => onNavigate(s.id)}
              className="relative flex items-center gap-2.5 rounded-xl px-3.5 py-2 outline-none sm:px-4"
            >
              {isActive && (
                <motion.div
                  layoutId="planDockPill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}` }}
                  transition={SPRING}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <span className="relative grid h-7 w-7 place-items-center">
                  <Ring value={value} active={isActive} />
                  <Icon size={12} strokeWidth={2.4} className="absolute" style={{ color: isActive ? T.acc : T.text3 }} />
                </span>
                <span className="text-[14px] font-semibold" style={{ fontFamily: T.display, color: isActive ? T.text : T.text3 }}>
                  {s.label}
                </span>
              </span>
            </button>
          );
        })}
        <div className="ml-1 hidden items-center gap-2 rounded-xl border-l px-3.5 py-2 sm:flex" style={{ borderColor: T.line }}>
          <div className="h-1 w-12 overflow-hidden rounded-full" style={{ background: T.line }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: overall >= 1 ? T.ok : T.acc }}
              initial={false}
              animate={{ width: `${Math.round(overall * 100)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <span className="text-[12px] font-semibold tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
            {Math.round(overall * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   Кнопка «нагору» — зʼявляється тільки коли справді є куди вертатись.
================================================================== */
export function BackToTop({ visible, onClick }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          onClick={onClick}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          transition={SPRING}
          title="Нагору"
          className="no-print group grid h-11 w-11 place-items-center rounded-full"
          style={{
            background: 'rgba(19,19,22,0.92)',
            backdropFilter: 'blur(16px)',
            border: `1px solid ${T.line}`,
            boxShadow: '0 12px 32px -12px rgba(0,0,0,0.9)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
        >
          <ArrowUp
            size={16}
            strokeWidth={2.6}
            className="transition-colors duration-200"
            style={{ color: T.text3 }}
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default function PlanTabs({ active, onNavigate, progress, overall, assetSwitcher }) {
  return (
    <>
      <DesktopRail
        active={active}
        onNavigate={onNavigate}
        progress={progress}
        overall={overall}
        assetSwitcher={assetSwitcher}
      />
      <MobileDock active={active} onNavigate={onNavigate} progress={progress} overall={overall} />
    </>
  );
}
