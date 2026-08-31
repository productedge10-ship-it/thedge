import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, X, ImageOff, ZoomIn, Search } from 'lucide-react';
import { T, EASE, SPRING } from '../../lib/theme';
import { tvImage } from '../../lib/imageStore';

/* ==================================================================
   ImageSlider з лупою.
   Головна проблема була: щоб прочитати рівні на графіку, доводилось
   щоразу відкривати фулскрін. Тепер наведення вмикає збільшувальне
   скло — ділянка під курсором показується у 2.5× просто на місці.
================================================================== */

const LENS = 128;   // діаметр лупи — менша, щоб не закривала пів графіка
const ZOOM = 2.1;   // кратність

function Lens({ src, containerRef, enabled, seedRef }) {
  const [pos, setPos] = useState(null);
  const [box, setBox] = useState(null);

  useEffect(() => {
    if (!enabled) { setPos(null); return; }
    /* Клік по кнопці лупи — це не mousemove: без «зерна» лупа
       зʼявлялась тільки після того, як курсор ще раз ворухнеться.
       Тому одразу підставляємо останню відому позицію миші. */
    const el = containerRef.current;
    const seed = seedRef?.current;
    if (el && seed) {
      const r = el.getBoundingClientRect();
      const x = seed.x - r.left;
      const y = seed.y - r.top;
      if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) {
        setBox({ w: r.width, h: r.height });
        setPos({ x, y });
      }
    }
  }, [enabled, containerRef, seedRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) { setPos(null); return; }
      setBox({ w: r.width, h: r.height });
      setPos({ x, y });
    };
    const onLeave = () => setPos(null);

    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [containerRef, enabled]);

  if (!pos || !box) return null;

  /* Лупа тримається біля курсора, але не вилазить за межі контейнера */
  const half = LENS / 2;
  const left = Math.min(Math.max(pos.x, half), box.w - half);
  const top  = Math.min(Math.max(pos.y, half), box.h - half);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.16, ease: EASE }}
      className="pointer-events-none absolute z-30 overflow-hidden rounded-full"
      style={{
        width: LENS,
        height: LENS,
        left: left - half,
        top: top - half,
        border: `1.5px solid rgba(${T.accRgb},0.5)`,
        boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 10px 26px rgba(0,0,0,0.55), inset 0 0 16px rgba(0,0,0,0.3)`,
        backgroundColor: T.bg,
        backgroundImage: `url(${src})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${box.w * ZOOM}px ${box.h * ZOOM}px`,
        backgroundPosition: `${-pos.x * ZOOM + half}px ${-pos.y * ZOOM + half}px`,
      }}
    >
      {/* перехрестя по центру — щоб точно знати, що саме збільшено */}
      <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2" style={{ background: `rgba(${T.accRgb},0.5)` }} />
      <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2" style={{ background: `rgba(${T.accRgb},0.5)` }} />
    </motion.div>
  );
}

export default function ImageSlider({ images = [], containerClassName = '' }) {
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  const [hovering, setHovering] = useState(false);
  const wrapRef = useRef(null);
  const lastPosRef = useRef(null);
  const fullRef = useRef(null);

  /* Адреси з TradingView ведуть на HTML-сторінку, а не на файл —
     переписуємо тут, щоб кожен виклик слайдера не робив цього сам. */
  const list = (Array.isArray(images) ? images.filter(Boolean) : []).map(tvImage);
  const count = list.length;

  const go = useCallback(
    (dir) => setIndex((i) => (count ? (i + dir + count) % count : 0)),
    [count]
  );

  useEffect(() => { if (index > count - 1) setIndex(0); }, [count, index]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'Escape') setFull(false);
      if (e.key.toLowerCase() === 'z') setLensOn((v) => !v);
    };
    if (full) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [full, go]);

  if (!count) {
    return (
      <div className={`flex items-center justify-center gap-2 ${containerClassName}`} style={{ color: T.text4 }}>
        <ImageOff size={20} strokeWidth={1.6} />
        <span className="text-[14px] font-bold" style={{ fontFamily: T.sans }}>No images</span>
      </div>
    );
  }

  const NavBtn = ({ dir, icon: Icon, side, big }) => (
    <motion.button
      onClick={(e) => { e.stopPropagation(); go(dir); }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      transition={SPRING}
      className={`absolute ${side} top-1/2 z-40 grid ${big ? 'h-11 w-11' : 'h-9 w-9'} -translate-y-1/2 place-items-center rounded-full opacity-0 transition-opacity duration-200 group-hover/slider:opacity-100`}
      style={{
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${T.line}`,
        color: T.text2,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineAcc; e.currentTarget.style.color = T.text; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
    >
      <Icon size={big ? 20 : 17} strokeWidth={2.4} />
    </motion.button>
  );

  const ToolBtn = ({ icon: Icon, label, active, onClick }) => (
    <motion.button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg"
      style={{
        background: active ? `rgba(${T.accRgb},0.16)` : 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${active ? T.lineAcc : T.line}`,
        color: active ? T.acc : T.text2,
      }}
    >
      <Icon size={16} strokeWidth={2.4} />
    </motion.button>
  );

  return (
    <>
      <div
        ref={wrapRef}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onMouseMove={(e) => { lastPosRef.current = { x: e.clientX, y: e.clientY }; }}
        className={`group/slider relative overflow-hidden ${containerClassName}`}
        style={{ background: T.bg, cursor: lensOn ? 'crosshair' : 'zoom-in' }}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={index}
            src={list[index]}
            alt={`Image ${index + 1} of ${count}`}
            initial={{ opacity: 0, scale: 1.01 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={() => setFull(true)}
            draggable={false}
            className="h-full w-full object-contain"
          />
        </AnimatePresence>

        {/* Лупа */}
        <AnimatePresence>
          {lensOn && hovering && (
            <Lens src={list[index]} containerRef={wrapRef} enabled={lensOn && hovering} seedRef={lastPosRef} />
          )}
        </AnimatePresence>

        {/* Панель інструментів */}
        <div className="absolute right-3 top-3 z-40 flex gap-2 opacity-0 transition-opacity duration-200 group-hover/slider:opacity-100">
          <ToolBtn
            icon={lensOn ? Search : ZoomIn}
            label={lensOn ? 'Turn off magnifier (Z)' : 'Turn on magnifier (Z)'}
            active={lensOn}
            onClick={() => setLensOn((v) => !v)}
          />
          <ToolBtn icon={Maximize2} label="Fullscreen" onClick={() => setFull(true)} />
        </div>

        {count > 1 && (
          <>
            <NavBtn dir={-1} icon={ChevronLeft} side="left-3" />
            <NavBtn dir={1} icon={ChevronRight} side="right-3" />

            <div
              className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2"
              style={{ background: 'rgba(10,10,12,0.78)', backdropFilter: 'blur(12px)', border: `1px solid ${T.line}` }}
            >
              {list.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setIndex(i); }}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: i === index ? 18 : 6,
                    background: i === index ? T.acc : 'rgba(255,255,255,0.25)',
                  }}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
            </div>
          </>
        )}

        {/* Підказка про лупу — тільки поки не наведено */}
        {lensOn && !hovering && (
          <div
            className="pointer-events-none absolute bottom-3 right-3 z-30 rounded-lg px-2.5 py-1.5 opacity-60"
            style={{ background: 'rgba(10,10,12,0.7)', border: `1px solid ${T.line}` }}
          >
            <span className="text-[12px] font-bold" style={{ fontFamily: T.sans, color: T.text3 }}>
              Hover to zoom
            </span>
          </div>
        )}
      </div>

      {/* Фулскрін */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {full && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFull(false)}
              className="group/slider fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-10"
              style={{ background: 'rgba(6,6,8,0.95)', backdropFilter: 'blur(20px)' }}
            >
              <motion.button
                onClick={() => setFull(false)}
                whileHover={{ scale: 1.08, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={SPRING}
                className="absolute right-5 top-5 z-50 grid h-10 w-10 place-items-center rounded-lg"
                style={{ background: 'rgba(19,19,22,0.8)', border: `1px solid ${T.line}`, color: T.text2 }}
              >
                <X size={18} strokeWidth={2.4} />
              </motion.button>

              <div
                ref={fullRef}
                onClick={(e) => e.stopPropagation()}
                className="relative max-h-full max-w-full overflow-hidden rounded-xl"
                style={{ border: `1px solid ${T.lineHi}` }}
              >
                <motion.img
                  key={index}
                  src={list[index]}
                  alt={`Image ${index + 1}`}
                  initial={{ scale: 0.97, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.97, opacity: 0 }}
                  transition={SPRING}
                  draggable={false}
                  className="max-h-[85vh] max-w-full object-contain"
                />
              </div>

              {count > 1 && (
                <>
                  <NavBtn dir={-1} icon={ChevronLeft} side="left-6" big />
                  <NavBtn dir={1} icon={ChevronRight} side="right-6" big />
                  <span
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg px-3.5 py-2 text-[13px] font-bold tabular-nums"
                    style={{ background: 'rgba(19,19,22,0.85)', border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.mono }}
                  >
                    {index + 1} / {count}
                  </span>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
