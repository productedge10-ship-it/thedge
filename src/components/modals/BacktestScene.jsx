import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, TrendingUp, TrendingDown } from 'lucide-react';
import { T } from '../../lib/theme';

/* ==================================================================
   Сцена на замкненому бектесті — на весь екран і з руками.

   Перша версія була SVG, який React перемальовував цілком раз на
   третину секунди: графік рухався стрибками, і на слабших машинах це
   читалось як «висне». Тепер малює canvas у requestAnimationFrame:
   історія їде плавно, поточна свічка росте на очах, шкала не стрибає,
   а React оновлює лише цифри — кілька разів на секунду.

   І головне — у сцену можна гратись, як у справжній бектест:
   • Long / Short (або клавіші L і S) відкривають угоду по поточній
     ціні зі стопом і тейком 1:2;
   • швидкість ×1 / ×4 / ×16 і пауза (пробіл);
   • перехрестя з ціною під курсором.
   На графіку лише угоди, які відкрила сама людина. Раніше поруч
   торгувала ще й «стратегія», і це плутало: угоди з'являлись без
   натискання, а метрики рахували чужі результати. Метрики — по твоїх
   закритих угодах, як у журналі.

   Числа — випадкова симуляція, а не чиїсь результати. Це підписано.
================================================================== */

const STEP = 16;           // ширина свічки з проміжком, px
const BASE_MS = 900;       // тривалість свічки на ×1
const SPEEDS = [1, 4, 16];
const RISK = 1.1;          // відстань до стопа в «пунктах» симуляції
const RR = 2;              // тейк для угод людини
const WIDE_MIN = 760;      // з якої ширини сцени панелі лягають поверх графіка

const COL = {
  up: '#34d399',
  down: '#f87171',
  acc: '#8b7bff',
  grid: 'rgba(196,181,253,0.10)',
  text: 'rgba(237,236,247,0.55)',
};

const rand = (a, b) => a + Math.random() * (b - a);

function newCandle(open, drift) {
  // Ціль закриття й «характер» свічки задаються одразу, а шлях до
  // них промальовується поступово — так свічка росте, а не з'являється.
  const target = open + (Math.random() - 0.5 + drift) * 1.4;
  return { open, close: open, high: open, low: open, target, wob: rand(0.2, 0.6), phase: rand(0, 6.28) };
}

function makeSim() {
  const candles = [];
  let price = 100;
  let drift = 0.06;
  for (let i = 0; i < 160; i++) {
    if (i % 24 === 0) drift = rand(-0.15, 0.15);
    const c = newCandle(price, drift);
    c.close = c.target;
    c.high = Math.max(c.open, c.close) + rand(0, 0.5);
    c.low = Math.min(c.open, c.close) - rand(0, 0.5);
    candles.push(c);
    price = c.close;
  }
  const cur = newCandle(price, drift);
  return {
    candles, cur, f: 0, drift, idx: 0,
    trades: [], seq: 0,
    lo: price - 4, hi: price + 4,
    mouse: null, flash: [],
  };
}

export default function BacktestScene({ children }) {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const wrap = useRef(null);
  const canvas = useRef(null);
  const sim = useRef(null);
  if (!sim.current) sim.current = makeSim();

  const [speed, setSpeed] = useState(4);
  const [paused, setPaused] = useState(!!reduced);
  const [stats, setStats] = useState({ n: 0, wr: 0, net: 0, pf: 0, open: null, eq: [0] });
  const [toast, setToast] = useState(null);
  /* Широка розкладка: метрики, кнопки й текст лежать поверх графіка.
     Вузька (телефон, планшет, вузьке вікно з сайдбаром): усе це йде
     під графіком окремими блоками, інакше панелі закривають свічки.
     Рішення беремо з ширини самої сцени, а не екрана: сайдбар забирає
     свої 250px, і «широкий екран» ще не означає широку сцену. */
  const [wide, setWide] = useState(true);
  const wideRef = useRef(true);

  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  /* Відкрити угоду по поточній ціні. Одна за раз: так легше стежити,
     чим закінчилась саме ця, і так поводиться більшість бектестів. */
  const openTrade = useCallback((dir) => {
    const s = sim.current;
    if (s.trades.some((t) => !t.done)) {
      setToast('Одна угода за раз — спершу дочекайся стопа чи тейка');
      return;
    }
    const entry = s.cur.close;
    s.trades.push({
      id: ++s.seq, dir, entry, rr: RR,
      sl: entry - dir * RISK, tp: entry + dir * RISK * RR,
      at: s.idx + s.f, done: false,
    });
    setToast(null);
  }, []);

  /* Головний цикл: симуляція + малювання. */
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv.getContext('2d');
    let raf;
    let last = performance.now();
    let W = 0;
    let H = 0;
    let statsAt = 0;

    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = (wrap.current?.getBoundingClientRect().width || W) >= WIDE_MIN;
      if (w !== wideRef.current) { wideRef.current = w; setWide(w); }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    if (wrap.current) ro.observe(wrap.current);

    const step = (dt) => {
      const s = sim.current;
      s.f += dt / (BASE_MS / speedRef.current);

      // Свічка росте: ціна йде до цілі з «хвилюванням», тіні тягнуться.
      const e = Math.min(s.f, 1);
      const ease = 1 - (1 - e) ** 2;
      const c = s.cur;
      c.close = c.open + (c.target - c.open) * ease + Math.sin(e * 9 + c.phase) * c.wob * (1 - e) * 0.6;
      c.high = Math.max(c.high, c.close);
      c.low = Math.min(c.low, c.close);

      // Стопи й тейки перевіряємо по живій ціні.
      for (const t of s.trades) {
        if (t.done) continue;
        const hitTp = t.dir > 0 ? c.close >= t.tp : c.close <= t.tp;
        const hitSl = t.dir > 0 ? c.close <= t.sl : c.close >= t.sl;
        if (hitTp || hitSl) {
          t.done = true;
          t.r = hitTp ? t.rr : -1;
          t.closeAt = s.idx + s.f;
          t.exit = hitTp ? t.tp : t.sl;
          s.flash.push({ x: t.closeAt, y: t.exit, r: t.r, born: performance.now() });
        }
      }

      if (s.f >= 1) {
        c.close = c.target;
        c.high = Math.max(c.high, c.close);
        c.low = Math.min(c.low, c.close);
        s.candles.push(c);
        if (s.candles.length > 400) s.candles.splice(0, s.candles.length - 400);
        s.idx += 1;
        s.f = 0;
        if (s.idx % 22 === 0) s.drift = rand(-0.18, 0.18);
        s.cur = newCandle(c.close, s.drift);
        // Сцена може крутитись годинами — історію угод тримаємо обмеженою.
        if (s.trades.length > 80) s.trades = s.trades.slice(-60);
      }
    };

    const draw = () => {
      const s = sim.current;
      ctx.clearRect(0, 0, W, H);

      /* На широкому екрані метрики й кнопки лежать поверх графіка, тож
         знизу під них лишаємо місце. На вузькому вони йдуть окремо під
         сценою, і графік може зайняти всю висоту полотна. */
      const wide = wideRef.current;
      const st = wide ? STEP : 12;
      const chartTop = wide ? 64 : 56;
      const chartBottom = wide ? H - 150 : H - 78;
      const chartH = Math.max(chartBottom - chartTop, 120);
      const headX = W * (wide ? 0.72 : 0.64);               // де «зараз» — праворуч лишається простір
      const nVisible = Math.ceil(headX / st) + 2;
      const vis = s.candles.slice(-nVisible);
      const all = [...vis, s.cur];

      // Шкала їде плавно, а не стрибає за кожною новою свічкою.
      const openLv = s.trades.filter((t) => !t.done).flatMap((t) => [t.sl, t.tp]);
      const tLo = Math.min(...all.map((c) => c.low), ...openLv) - 0.6;
      const tHi = Math.max(...all.map((c) => c.high), ...openLv) + 0.6;
      s.lo += (tLo - s.lo) * 0.06;
      s.hi += (tHi - s.hi) * 0.06;
      const y = (v) => chartTop + ((s.hi - v) / (s.hi - s.lo)) * chartH;
      const xAt = (pos) => headX - (s.idx + s.f - pos) * st; // pos у «свічках»

      // Сітка з крапок, як на 404.
      ctx.fillStyle = COL.grid;
      for (let gx = 12; gx < W; gx += 28) for (let gy = 12; gy < H; gy += 28) ctx.fillRect(gx, gy, 1.2, 1.2);

      // Горизонтальні рівні з цінами.
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const v = s.lo + ((s.hi - s.lo) * i) / 4;
        const yy = y(v);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillText((1.08 + v / 1000).toFixed(4), W - 10, yy - 4);
      }

      // Зони угод.
      for (const t of s.trades) {
        const x0 = xAt(t.at);
        const x1 = t.done ? xAt(t.closeAt) : headX;
        if (x1 < -40) continue;
        const a = t.done ? 0.07 : 0.14;
        ctx.fillStyle = `rgba(52,211,153,${a})`;
        ctx.fillRect(x0, Math.min(y(t.entry), y(t.tp)), x1 - x0, Math.abs(y(t.tp) - y(t.entry)));
        ctx.fillStyle = `rgba(248,113,113,${a})`;
        ctx.fillRect(x0, Math.min(y(t.entry), y(t.sl)), x1 - x0, Math.abs(y(t.sl) - y(t.entry)));
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath(); ctx.moveTo(x0, y(t.entry)); ctx.lineTo(x1, y(t.entry)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x0, y(t.entry), 4, 0, Math.PI * 2);
        ctx.fillStyle = t.dir > 0 ? COL.up : COL.down;
        ctx.fill();
      }

      // Свічки: закриті + та, що росте.
      const drawCandle = (c, x) => {
        const upC = c.close >= c.open;
        const col = upC ? COL.up : COL.down;
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.moveTo(x, y(c.high)); ctx.lineTo(x, y(c.low)); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        const top = y(Math.max(c.open, c.close));
        ctx.fillRect(x - st * 0.32, top, st * 0.64, Math.max(Math.abs(y(c.open) - y(c.close)), 1.5));
      };
      const first = s.idx - vis.length;
      vis.forEach((c, i) => drawCandle(c, xAt(first + i + 0.5)));
      drawCandle(s.cur, xAt(s.idx + 0.5));

      // Поточна ціна. Вертикальну «голову» програвача зі смугою світла
      // прибрали: вона різала графік навпіл і відволікала від свічок.
      const py = y(s.cur.close);
      ctx.strokeStyle = 'rgba(139,123,255,0.35)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COL.acc;
      ctx.beginPath();
      ctx.roundRect?.(W - 78, py - 10, 70, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#0b0a12';
      ctx.textAlign = 'center';
      ctx.fillText((1.08 + s.cur.close / 1000).toFixed(4), W - 43, py + 4);

      // Спалахи результату над закритими угодами.
      const now = performance.now();
      s.flash = s.flash.filter((f) => now - f.born < 1600);
      for (const f of s.flash) {
        const k = (now - f.born) / 1600;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = f.r > 0 ? COL.up : COL.down;
        ctx.font = 'bold 15px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(f.r > 0 ? `+${f.r}R` : '−1R', xAt(f.x), y(f.y) - 12 - k * 26);
        ctx.globalAlpha = 1;
      }
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';

      // Перехрестя під курсором.
      if (s.mouse && s.mouse.y > chartTop - 20 && s.mouse.y < chartBottom + 20) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(s.mouse.x, 0); ctx.lineTo(s.mouse.x, H);
        ctx.moveTo(0, s.mouse.y); ctx.lineTo(W, s.mouse.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const v = s.hi - ((s.mouse.y - chartTop) / chartH) * (s.hi - s.lo);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.roundRect?.(8, s.mouse.y - 10, 70, 20, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.textAlign = 'center';
        ctx.fillText((1.08 + v / 1000).toFixed(4), 43, s.mouse.y + 4);
      }

      // Крива капіталу внизу на всю ширину.
      const closed = s.trades.filter((t) => t.done);
      const eq = [0];
      closed.forEach((t) => eq.push(eq[eq.length - 1] + t.r));
      const eTop = wide ? H - 118 : H - 64;
      const eH = wide ? 60 : 44;
      const eLo = Math.min(...eq, 0);
      const eHi = Math.max(...eq, 1);
      const ex = (i) => 24 + (i / Math.max(eq.length - 1, 1)) * ((wide ? W * 0.62 : W - 24) - 24);
      const ey = (v) => eTop + eH - ((v - eLo) / (eHi - eLo || 1)) * eH;
      if (eq.length > 1) {
        const grad = ctx.createLinearGradient(0, eTop, 0, eTop + eH);
        grad.addColorStop(0, 'rgba(139,123,255,0.35)');
        grad.addColorStop(1, 'rgba(139,123,255,0)');
        ctx.beginPath();
        eq.forEach((v, i) => (i ? ctx.lineTo(ex(i), ey(v)) : ctx.moveTo(ex(i), ey(v))));
        ctx.lineTo(ex(eq.length - 1), eTop + eH);
        ctx.lineTo(ex(0), eTop + eH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        eq.forEach((v, i) => (i ? ctx.lineTo(ex(i), ey(v)) : ctx.moveTo(ex(i), ey(v))));
        ctx.strokeStyle = COL.acc;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(ex(eq.length - 1), ey(eq[eq.length - 1]), 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COL.acc;
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(24, eTop + eH); ctx.lineTo(wide ? W * 0.62 : W - 24, eTop + eH); ctx.stroke();
      ctx.fillStyle = COL.text;
      ctx.textAlign = 'left';
      ctx.fillText('крива капіталу, R', 24, eTop - 8);

      return { closed, eq };
    };

    const loop = (now) => {
      const dt = Math.min(now - last, 64); // після згорнутої вкладки не «перемотуємо» хвилини
      last = now;
      if (!pausedRef.current) step(dt);
      const { closed, eq } = draw();

      // Цифри в React — не частіше 4 разів на секунду.
      if (now - statsAt > 250) {
        statsAt = now;
        const wins = closed.filter((t) => t.r > 0);
        const gain = wins.reduce((a, t) => a + t.r, 0);
        const loss = closed.length - wins.length;
        const mine = sim.current.trades.find((t) => !t.done);
        setStats({
          n: closed.length,
          wr: closed.length ? Math.round((wins.length / closed.length) * 100) : 0,
          net: eq[eq.length - 1],
          pf: loss ? gain / loss : gain ? Infinity : 0,
          open: mine ? { dir: mine.dir, live: ((sim.current.cur.close - mine.entry) * mine.dir) / RISK } : null,
          eq,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [openTrade]);

  /* Клавіші: L / S — угода, пробіл — пауза. Лише поки сцена на екрані
     й фокус не в полі вводу. */
  useEffect(() => {
    const onKey = (e) => {
      if (/input|textarea|select/i.test(e.target?.tagName || '')) return;
      const k = e.key.toLowerCase();
      if (k === 'l' || k === 'д') openTrade(1);
      else if (k === 's' || k === 'і' || k === 'ы') openTrade(-1);
      else if (k === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTrade]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const onMove = (e) => {
    const r = canvas.current.getBoundingClientRect();
    sim.current.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onLeave = () => { sim.current.mouse = null; };

  const netCol = stats.net > 0 ? COL.up : stats.net < 0 ? COL.down : '#EDECF7';
  const glass = {
    background: 'rgba(12,11,20,0.72)',
    border: '1px solid rgba(139,123,255,0.18)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  const controls = (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-4 gap-2">
        {[
          ['угод', stats.n || '—'],
          ['win rate', stats.n ? `${stats.wr}%` : '—'],
          [wide ? 'profit f.' : 'pf', stats.n ? (stats.pf === Infinity ? '∞' : stats.pf.toFixed(2)) : '—'],
          ['net', stats.n ? `${stats.net > 0 ? '+' : ''}${stats.net.toFixed(1)}R` : '—'],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl px-2.5 py-2" style={glass}>
            <div className="truncate text-[9.5px] uppercase tracking-[0.14em]" style={{ fontFamily: T.mono, color: 'rgba(255,255,255,0.38)' }}>{k}</div>
            <div className="mt-0.5 truncate text-[14px] font-semibold tabular-nums sm:text-[15px]" style={{ fontFamily: T.mono, color: k === 'net' ? netCol : '#EDECF7' }}>{v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          [1, 'Long', 'L', TrendingUp, COL.up, '52,211,153'],
          [-1, 'Short', 'S', TrendingDown, COL.down, '248,113,113'],
        ].map(([dir, label, key, Icon, col, rgb]) => (
          <motion.button
            key={label}
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => openTrade(dir)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl text-[14.5px] font-bold"
            style={{
              fontFamily: T.sans,
              color: col,
              background: `rgba(${rgb},0.12)`,
              border: `1px solid rgba(${rgb},0.35)`,
              boxShadow: `0 10px 30px -14px rgba(${rgb},0.7)`,
            }}
          >
            <Icon size={16} strokeWidth={2.4} />
            {label}
            {/* Клавіші — лише там, де є клавіатура. */}
            {wide && <span className="rounded-md px-1.5 text-[10.5px]" style={{ fontFamily: T.mono, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' }}>{key}</span>}
          </motion.button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-[11px]" style={{ fontFamily: T.mono, color: 'rgba(255,255,255,0.3)' }}>
        <span className="truncate">
          {stats.open
            ? <>твоя угода: <b style={{ color: stats.open.live >= 0 ? COL.up : COL.down }}>{stats.open.live >= 0 ? '+' : ''}{stats.open.live.toFixed(2)}R</b></>
            : wide ? 'стоп 1R · тейк 2R · пробіл — пауза' : 'стоп 1R · тейк 2R'}
        </span>
        <span className="shrink-0">симуляція</span>
      </div>
    </div>
  );

  return (
    <div
      ref={wrap}
      className={`relative w-full overflow-hidden rounded-3xl ${wide ? 'h-[calc(100dvh-96px)] min-h-[600px] lg:h-[calc(100dvh-32px)]' : 'flex flex-col'}`}
      style={{
        background: 'radial-gradient(1100px 600px at 70% -10%, rgba(139,123,255,0.14), transparent 60%), radial-gradient(800px 500px at 10% 110%, rgba(52,211,153,0.07), transparent 60%), #08080c',
        border: `1px solid ${T.lineAcc}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
    <div className={wide ? 'absolute inset-0' : 'relative h-[58vh] min-h-[340px] max-h-[560px]'}>
      <canvas
        ref={canvas}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
      />

      {/* верх: що програється і як швидко */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3 py-3 sm:px-5 sm:py-4">
        <span className="flex min-w-0 items-center gap-2 truncate text-[10.5px] uppercase tracking-[0.16em] sm:text-[11px] sm:tracking-[0.22em]" style={{ fontFamily: T.mono, color: 'rgba(196,181,253,0.8)' }}>
          <span className="relative flex h-2 w-2">
            {!paused && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: T.acc }} />}
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: T.acc }} />
          </span>
          replay · EURUSD · M15
        </span>

        <div className="pointer-events-auto flex items-center gap-1 rounded-xl p-1" style={glass}>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/10"
            aria-label={paused ? 'Продовжити' : 'Пауза'}
            style={{ color: '#EDECF7' }}
          >
            {paused ? <Play size={14} strokeWidth={2.4} /> : <Pause size={14} strokeWidth={2.4} />}
          </button>
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSpeed(sp)}
              className="h-8 rounded-lg px-2.5 text-[12px] font-semibold transition-colors"
              style={{
                fontFamily: T.mono,
                background: speed === sp ? 'rgba(139,123,255,0.22)' : 'transparent',
                color: speed === sp ? '#EDECF7' : 'rgba(237,236,247,0.5)',
              }}
            >
              ×{sp}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute left-1/2 top-16 z-20 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl px-4 py-2 text-center text-[13px]"
            style={{ ...glass, fontFamily: T.sans, color: '#EDECF7' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>

      {wide ? (
        <>
          {/* текст і кнопка від сторінки — ліворуч унизу, поверх графіка */}
          {children && <div className="absolute bottom-5 left-5 z-10 w-[min(420px,40%)]">{children}</div>}
          <div className="absolute bottom-5 right-5 z-10 w-[min(420px,calc(55%-40px))]">{controls}</div>
        </>
      ) : (
        /* На вузькому — під графіком, у звичайному потоці. Спершу гра
           (метрики й Long/Short), потім пропозиція: людина спершу пробує,
           і тільки тоді їй є за що платити. */
        <div className="relative flex flex-col gap-3 p-3">
          {controls}
          {children}
        </div>
      )}
    </div>
  );
}
