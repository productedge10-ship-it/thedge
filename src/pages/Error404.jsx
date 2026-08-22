import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowLeft, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * 404 — інтерактивна сторінка "не знайдено".
 *
 * Компонент не може називатися 404 (JS-ідентифікатор не починається з цифри),
 * тому функція — NotFound, файл/роут — 404.
 *
 * ВАЖЛИВО ПРО LAYOUT:
 * Компонент рендериться як fixed inset-0 z-[9999] — тобто накриває весь екран
 * поверх сайдбара/layout. Якщо хочеш прибрати layout "правильно" — винеси
 * маршрут за межі layout-роута, напр.:
 *
 *   <Routes>
 *     <Route element={<Layout />}>
 *        ... твої сторінки ...
 *     </Route>
 *     <Route path="*" element={<NotFound />} />   // поза layout
 *   </Routes>
 */
export default function NotFound() {
  const navigate = useNavigate();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);

  // блокуємо скрол сторінки під сплешем
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // нормалізована позиція курсору (-0.5 .. 0.5)
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const sx = useSpring(px, { stiffness: 90, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 90, damping: 18, mass: 0.6 });

  // обертання всієї 3D-сцени
  const sceneRotX = useTransform(sy, [-0.5, 0.5], [12, -12]);
  const sceneRotY = useTransform(sx, [-0.5, 0.5], [-16, 16]);

  // паралакс по глибині
  const layerFar = useTransform(sx, [-0.5, 0.5], [-14, 14]);
  const layerFarY = useTransform(sy, [-0.5, 0.5], [-10, 10]);
  const layerMid = useTransform(sx, [-0.5, 0.5], [-30, 30]);
  const layerMidY = useTransform(sy, [-0.5, 0.5], [-22, 22]);

  // хроматична аберація
  const chromaX = useTransform(sx, [-0.5, 0.5], [-10, 10]);
  const chromaY = useTransform(sy, [-0.5, 0.5], [-6, 6]);
  const chromaXneg = useTransform(sx, [-0.5, 0.5], [10, -10]);
  const chromaYneg = useTransform(sy, [-0.5, 0.5], [6, -6]);

  // прожектор за курсором
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);
  const spotBg = useTransform(
    [spotX, spotY],
    ([x, y]) =>
      `radial-gradient(600px circle at ${x}% ${y}%, rgba(139,123,255,0.16), transparent 45%)`
  );

  const handleMove = (e) => {
    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    px.set(nx);
    py.set(ny);
    spotX.set((e.clientX / window.innerWidth) * 100);
    spotY.set((e.clientY / window.innerHeight) * 100);
  };

  return (
    <div
      onMouseMove={reduced ? undefined : handleMove}
      className="fixed inset-0 z-[9999] overflow-hidden bg-[#07070C] text-white antialiased"
      style={{ perspective: "1300px" }}
    >
      {/* фон */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 800px at 50% -10%, rgba(139,123,255,0.12), transparent 60%), radial-gradient(900px 700px at 85% 115%, rgba(0,224,164,0.10), transparent 55%)",
        }}
      />
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ background: spotBg }}
      />

      {/* ЖИВИЙ ГРАФ-СУЗІРʼЯ (за сценою, реагує на курсор) */}
      <ConstellationGraph sx={sx} sy={sy} reduced={reduced} />

      <GridDots sx={sx} sy={sy} />
      <Grain />

      {/* 3D-СЦЕНА */}
      <motion.div
        className="relative z-10 flex h-full flex-col items-center justify-center px-6"
        style={{
          transformStyle: "preserve-3d",
          rotateX: reduced ? 0 : sceneRotX,
          rotateY: reduced ? 0 : sceneRotY,
        }}
      >
        {/* далекий привид 404 */}
        <motion.div
          className="pointer-events-none absolute select-none font-black leading-none tracking-tighter text-white/[0.03]"
          style={{
            fontSize: "min(58vw, 720px)",
            x: reduced ? 0 : layerFar,
            y: reduced ? 0 : layerFarY,
            translateZ: -220,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          404
        </motion.div>

        {/* шарди */}
        <Shards depth={layerMid} depthY={layerMidY} reduced={reduced} />

        {/* головний блок */}
        <motion.div
          className="relative flex flex-col items-center"
          style={{
            x: reduced ? 0 : layerMid,
            y: reduced ? 0 : layerMidY,
            translateZ: 40,
            transformStyle: "preserve-3d",
          }}
        >
          {/* великий 404 з хроматичною аберацією */}
          <div className="relative select-none" style={{ transformStyle: "preserve-3d" }}>
            <motion.h1
              aria-hidden
              className="absolute inset-0 font-black leading-none tracking-tighter mix-blend-screen"
              style={{
                fontSize: "clamp(120px, 26vw, 360px)",
                color: "#00E0A4",
                x: reduced ? 0 : chromaX,
                y: reduced ? 0 : chromaY,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              404
            </motion.h1>
            <motion.h1
              aria-hidden
              className="absolute inset-0 font-black leading-none tracking-tighter mix-blend-screen"
              style={{
                fontSize: "clamp(120px, 26vw, 360px)",
                color: "#8B7BFF",
                x: reduced ? 0 : chromaXneg,
                y: reduced ? 0 : chromaYneg,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              404
            </motion.h1>
            <h1
              className="relative font-black leading-none tracking-tighter"
              style={{
                fontSize: "clamp(120px, 26vw, 360px)",
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                color: "#EDECF7",
              }}
            >
              404
            </h1>
          </div>

          {/* текст */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 flex flex-col items-center text-center"
            style={{ transform: "translateZ(30px)" }}
          >
            <p className="mb-2 font-mono text-[13px] uppercase tracking-[0.34em] text-[#C4B5FD]/70">
              сторінку не знайдено
            </p>
            <p className="max-w-md text-[15px] leading-relaxed text-white/55">
              Ця сторінка кудись зникла. Але простір навколо — цілком реальний.
              Поводи мишкою, потягни осколок, торкнись вузлів графа.
            </p>
          </motion.div>

          {/* кнопки */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 flex flex-wrap items-center justify-center gap-4"
            style={{ transform: "translateZ(50px)" }}
          >
            <Magnetic reduced={reduced}>
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#00E0A4] px-6 py-3.5 text-[14.5px] font-semibold text-[#04241C] transition-colors hover:bg-[#22e9b4]"
              >
                <Home size={18} strokeWidth={2.4} />
                На головну
              </button>
            </Magnetic>
            <Magnetic reduced={reduced}>
              <button
                onClick={() => navigate(-1)}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#C4B5FD]/30 bg-[#8B7BFF]/10 px-6 py-3.5 text-[14.5px] font-medium text-white/90 transition-colors hover:border-[#C4B5FD]/60 hover:bg-[#8B7BFF]/20"
              >
                <ArrowLeft size={18} strokeWidth={2.4} />
                Назад
              </button>
            </Magnetic>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* пінг-понг кулька — окремий шар (точні координати, без 3D-спотворення) */}
      <PongBall reduced={reduced} />

      {/* підказка */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 font-mono text-[11.5px] tracking-wide text-white/25">
        рухай мишкою · кидай кульку · error 404
      </div>
    </div>
  );
}

/* ============ ГРАФ-СУЗІРʼЯ (canvas, реагує на курсор) ============ */
function ConstellationGraph({ sx, sy, reduced }) {
  const canvasRef = useRef(null);
  // легкий паралакс шару графа
  const tx = useTransform(sx, [-0.5, 0.5], [-26, 26]);
  const ty = useTransform(sy, [-0.5, 0.5], [-26, 26]);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let raf;
    const mouse = { x: -9999, y: -9999 };
    let W = 0,
      H = 0,
      dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const N = Math.min(26, Math.floor((W * H) / 65000));
    const nodes = Array.from({ length: Math.max(16, N) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      mint: Math.random() < 0.35,
    }));

    const LINK = 168;
    const REPEL = 130;

    const onMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    window.addEventListener("resize", resize);

    const tick = () => {
      ctx.clearRect(0, 0, W, H);

      // рух + відштовхування від курсора
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;

        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < REPEL && d > 0.01) {
          const f = (1 - d / REPEL) * 1.4;
          n.x += (dx / d) * f;
          n.y += (dy / d) * f;
        }
      }

      // лінії
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < LINK) {
            const o = (1 - dist / LINK) * 0.5;
            ctx.strokeStyle = `rgba(139,123,255,${o})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // лінія до курсора (найближчі вузли)
      for (const n of nodes) {
        const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
        if (d < LINK) {
          const o = (1 - d / LINK) * 0.6;
          ctx.strokeStyle = `rgba(0,224,164,${o})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      // вузли
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = n.mint ? "#00E0A4" : "#8B7BFF";
        ctx.shadowBlur = 8;
        ctx.shadowColor = n.mint ? "rgba(0,224,164,0.8)" : "rgba(139,123,255,0.8)";
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <motion.canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-[2] opacity-70"
      style={{ x: tx, y: ty }}
    />
  );
}

/* ============ МАГНІТНА КНОПКА ============ */
function Magnetic({ children, reduced }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 15 });
  const sy = useSpring(y, { stiffness: 250, damping: 15 });

  const onMove = (e) => {
    if (reduced) return;
    const r = ref.current.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * 0.35);
    y.set((e.clientY - (r.top + r.height / 2)) * 0.4);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.95 }}
    >
      {children}
    </motion.div>
  );
}

/* ============ ПЛАВАЮЧІ ШАРДИ ============ */
function Shards({ depth, depthY, reduced }) {
  const items = [
    { x: "-32vw", y: "-22vh", s: 90, z: -60, r: 18, c: "#8B7BFF" },
    { x: "34vw", y: "-16vh", s: 60, z: -30, r: -24, c: "#00E0A4" },
    { x: "-38vw", y: "20vh", s: 46, z: -10, r: 40, c: "#00E0A4" },
    { x: "40vw", y: "26vh", s: 78, z: -80, r: -12, c: "#8B7BFF" },
    { x: "-8vw", y: "-32vh", s: 34, z: 10, r: 32, c: "#C4B5FD" },
  ];
  return (
    <>
      {items.map((it, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute"
          style={{
            x: reduced ? 0 : depth,
            y: reduced ? 0 : depthY,
            translateZ: it.z,
            left: `calc(50% + ${it.x})`,
            top: `calc(50% + ${it.y})`,
          }}
        >
          <motion.div
            animate={reduced ? {} : { rotate: [it.r, it.r + 12, it.r], y: [0, -14, 0] }}
            transition={{ duration: 6 + i * 1.4, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: it.s,
              height: it.s,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${it.c}22, ${it.c}05)`,
              border: `1px solid ${it.c}55`,
              boxShadow: `0 20px 40px -12px ${it.c}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
              backdropFilter: "blur(2px)",
            }}
          />
        </motion.div>
      ))}
    </>
  );
}

/* ============ ПІНГ-ПОНГ КУЛЬКА (реалістична фізика + легкий захват) ============ */
function PongBall({ reduced }) {
  const ballRef = useRef(null);
  const trailRefs = useRef([]);

  useEffect(() => {
    if (reduced) return;
    const R = 22; // Візуальний радіус кульки (44px / 2), для правильного відбивання від стін
    const TRAIL = 8;
    let W = window.innerWidth;
    let H = window.innerHeight;

    // старт по центру-низу
    const st = {
      x: W / 2,
      y: H / 2 + 160,
      vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2),
      vy: -(3 + Math.random() * 2),
    };

    const trail = Array.from({ length: TRAIL }, () => ({ x: st.x, y: st.y }));

    let dragging = false;
    let raf;
    let last = { x: st.x, y: st.y, t: performance.now() };

    const el = ballRef.current;

    const onDown = (e) => {
      dragging = true;
      el.setPointerCapture?.(e.pointerId);
      last = { x: e.clientX, y: e.clientY, t: performance.now() };
      // Зупиняємо кульку в момент захвату
      st.vx = 0;
      st.vy = 0;
    };
    
    const onMoveWin = (e) => {
      if (!dragging) return;
      st.x = e.clientX;
      st.y = e.clientY;
      const now = performance.now();
      const dt = Math.max(now - last.t, 10); 
      
      // Динамічна швидкість: слабкий рух = слабкий кидок, сильний = сильний.
      // Розширено ліміт до 45 для можливості дуже різких кидків
      st.vx = clamp(((e.clientX - last.x) / dt) * 18, -45, 45);
      st.vy = clamp(((e.clientY - last.y) / dt) * 18, -45, 45);
      last = { x: e.clientX, y: e.clientY, t: now };
    };
    
    const onUp = () => { dragging = false; };

    // клік по кульці дає випадковий легкий "стусан"
    const onClick = () => {
      if (Math.hypot(st.vx, st.vy) < 2 && !dragging) {
        st.vx = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
        st.vy = (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6);
      }
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
    window.addEventListener("pointermove", onMoveWin);
    window.addEventListener("pointerup", onUp);
    const onResize = () => { W = window.innerWidth; H = window.innerHeight; };
    window.addEventListener("resize", onResize);

    const REST = 0.88;   // пружність пластикової кульки (добре стрибає)
    const FRICTION = 0.99; // опір повітря (пінг-понг легкий, тому гальмує помітно)

    const tick = () => {
      if (!dragging) {
        st.x += st.vx;
        st.y += st.vy;

        // відбивання від країв екрана з врахуванням візуального розміру (R)
        if (st.x < R) { st.x = R; st.vx = Math.abs(st.vx) * REST; }
        else if (st.x > W - R) { st.x = W - R; st.vx = -Math.abs(st.vx) * REST; }
        if (st.y < R) { st.y = R; st.vy = Math.abs(st.vy) * REST; }
        else if (st.y > H - R) { st.y = H - R; st.vy = -Math.abs(st.vy) * REST; }

        st.vx *= FRICTION;
        st.vy *= FRICTION;
      }

      // слід
      trail.unshift({ x: st.x, y: st.y });
      trail.pop();
      trailRefs.current.forEach((t, i) => {
        if (!t) return;
        const p = trail[i];
        const k = 1 - i / TRAIL;
        t.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%,-50%) scale(${0.4 + k * 0.6})`;
        t.style.opacity = String(k * 0.25);
      });

      // сама кулька (центрується точно по координатах)
      el.style.transform = `translate(${st.x}px, ${st.y}px) translate(-50%,-50%)`;

      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("click", onClick);
      window.removeEventListener("pointermove", onMoveWin);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onResize);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[15]">
      {/* Білий розмитий слід */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          ref={(n) => (trailRefs.current[i] = n)}
          className="absolute left-0 top-0 h-[44px] w-[44px] rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 50%, #ffffff, #e0e0e0 50%, transparent 80%)",
            filter: "blur(3px)",
            willChange: "transform, opacity",
          }}
        />
      ))}
      
      {/* 
        ОБГОРТКА-ХІТБОКС: 
        робимо її розміром 80x80, щоб було дуже легко "спіймати" мишкою, 
        навіть якщо курсор трохи з'їхав 
      */}
      <div
        ref={ballRef}
        className="pointer-events-auto absolute left-0 top-0 flex h-[80px] w-[80px] cursor-grab items-center justify-center rounded-full active:cursor-grabbing"
        style={{
          willChange: "transform",
          touchAction: "none",
        }}
      >
        {/* РЕАЛІСТИЧНА КУЛЬКА ДЛЯ ПІНГ-ПОНГУ */}
        <div
          className="h-[44px] w-[44px] rounded-full"
          style={{
            // Матовий об'ємний пластик
            background: "radial-gradient(circle at 35% 25%, #ffffff 0%, #f0f0f0 20%, #d4d4d4 60%, #9e9e9e 100%)",
            boxShadow: `
              inset -4px -4px 8px rgba(0,0,0,0.15), 
              inset 2px 2px 6px rgba(255,255,255,0.9),
              0 12px 24px -6px rgba(0,0,0,0.4)
            `,
          }}
        />
      </div>
    </div>
  );
}
/* дрібний хелпер */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/* ============ СІТКА З КРАПОК ============ */
function GridDots({ sx, sy }) {
  const x = useTransform(sx, [-0.5, 0.5], [-20, 20]);
  const y = useTransform(sy, [-0.5, 0.5], [-20, 20]);
  return (
    <motion.div
      className="pointer-events-none absolute inset-[-40px] z-[1] opacity-[0.35]"
      style={{
        x,
        y,
        backgroundImage:
          "radial-gradient(rgba(196,181,253,0.25) 1px, transparent 1px)",
        backgroundSize: "38px 38px",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 75%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 45%, black, transparent 75%)",
      }}
    />
  );
}

/* ============ ЗЕРНО ============ */
function Grain() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[3] opacity-[0.05] mix-blend-overlay"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}