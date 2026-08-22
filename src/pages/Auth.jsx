import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate,
} from 'framer-motion';
import {
  Mail, Lock, AlertTriangle, Check, ArrowLeft, ArrowRight,
  Key, MailCheck, BarChart3, CircleDot, Diamond,
} from 'lucide-react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { armReveal } from '../components/core/CandleReveal';

/* ------------------------------------------------------------------ */
/*  THE EDGE — theme tokens                                            */
/* ------------------------------------------------------------------ */
const ACCENT_HEX = '#8b7bff';
const ACCENT = '139,123,255'; // r,g,b — used by canvas + rgba()

const SEED_TICKER = [
  { sym: 'BTC/USD', px: '68,240.50', chg: '+2.14%', up: true },
  { sym: 'ETH/USD', px: '3,842.10', chg: '+1.07%', up: true },
  { sym: 'SOL/USD', px: '184.62', chg: '-0.43%', up: false },
  { sym: 'XRP/USD', px: '2.1140', chg: '+0.62%', up: true },
  { sym: 'BNB/USD', px: '712.30', chg: '-0.28%', up: false },
  { sym: 'ADA/USD', px: '0.7120', chg: '+0.91%', up: true },
];

const COINGECKO_IDS = [
  { id: 'bitcoin', sym: 'BTC/USD' },
  { id: 'ethereum', sym: 'ETH/USD' },
  { id: 'solana', sym: 'SOL/USD' },
  { id: 'ripple', sym: 'XRP/USD' },
  { id: 'binancecoin', sym: 'BNB/USD' },
  { id: 'cardano', sym: 'ADA/USD' },
];

const FEATURES = [
  {
    icon: BarChart3,
    color: '#4f8bff',
    rgb: '79,139,255',
    title: 'Нейропрофіль трейдера',
    desc: 'Психологічний зліпок кожної сесії',
    stat: '62',
  },
  {
    icon: CircleDot,
    color: '#a78bfa',
    rgb: '167,139,250',
    title: 'AI-психолог',
    desc: 'Розбирає емоції та помилки в угодах',
    stat: '24/7',
  },
  {
    icon: Diamond,
    color: '#00e0a4',
    rgb: '0,224,164',
    title: 'Вердикт по дисципліні',
    desc: 'Бачиш, куди течуть твої R',
    stat: '+37.6R',
  },
];

/* ------------------------------------------------------------------ */
/*  Google Fonts injector                                              */
/* ------------------------------------------------------------------ */
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
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.append(l1, l2, l3);
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Live UTC clock                                                     */
/* ------------------------------------------------------------------ */
function useUtcClock() {
  const [time, setTime] = useState('— UTC');
  useEffect(() => {
    const p = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const d = new Date();
      setTime(`${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);
  return time;
}

/* ------------------------------------------------------------------ */
/*  Live market ticker — real prices from CoinGecko's public API       */
/* ------------------------------------------------------------------ */
function useLiveTicker() {
  const [ticker, setTicker] = useState(SEED_TICKER);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const ids = COINGECKO_IDS.map((t) => t.id).join(',');
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const next = COINGECKO_IDS
          .map(({ id, sym }) => {
            const d = data[id];
            if (!d || typeof d.usd !== 'number') return null;
            const chg = d.usd_24h_change ?? 0;
            const decimals = d.usd < 10 ? 4 : 2;
            return {
              sym,
              px: d.usd.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
              chg: `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
              up: chg >= 0,
            };
          })
          .filter(Boolean);

        if (next.length) setTicker(next);
      } catch {
        // anonymous CoinGecko calls can be rate-limited — keep last good data
      }
    };

    load();
    const iv = setInterval(load, 45000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return ticker;
}

/* ------------------------------------------------------------------ */
/*  Live candlestick chart — INTERACTIVE brand visual                  */
/*  · terminal crosshair + live price readout follows the cursor       */
/*  · OHLC tooltip for the hovered candle                              */
/*  · the whole chart surface warps toward the cursor (gravity well)   */
/*  · cursor carries a soft light; particles drift away from it        */
/*  · click = "pump the market": shockwave, spark burst, bullish run   */
/* ------------------------------------------------------------------ */
function useCandlestickChart(canvasRef) {
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const host = cv.parentNode;
    const ctx = cv.getContext('2d');
    const step = 22;
    const cw = 11;
    let W = 0, H = 0, dpr = 1, raf;
    let last = 100 + Math.random() * 40;
    let candles = [];
    let pump = 0; // click-injected bullish momentum, decays per new candle

    const gen = () => {
      const o = last;
      const c = o + (Math.random() - 0.47) * 6.5 + pump;
      pump *= 0.55;
      const h = Math.max(o, c) + Math.random() * 3.2;
      const l = Math.min(o, c) - Math.random() * 3.2;
      last = c;
      return { o, h, l, c };
    };

    const resize = () => {
      const parent = cv.parentNode;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = r.width;
      H = r.height;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const need = Math.ceil(W / step) + 4;
      while (candles.length < need) candles.push(gen());
      while (candles.length > need) candles.shift();
    };
    resize();
    window.addEventListener('resize', resize);

    /* ---- pointer state ---- */
    const mouse = { x: -9999, y: -9999, in: false };
    const cur = { x: -9999, y: -9999, amt: 0 }; // spring-smoothed cursor
    let ripples = [];
    let bursts = [];

    const toLocal = (e) => {
      const r = host.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onMove = (e) => { const p = toLocal(e); mouse.x = p.x; mouse.y = p.y; mouse.in = true; };
    const onLeave = () => { mouse.in = false; };
    const onDown = (e) => {
      const p = toLocal(e);
      pump += 5.5; // the next few candles rally
      ripples.push({ x: p.x, y: p.y, r: 0, a: 0.9 });
      ripples.push({ x: p.x, y: p.y, r: -18, a: 0.5 });
      for (let i = 0; i < 26; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = Math.random() * 2.6 + 0.8;
        bursts.push({ x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 0.6, a: 1, s: Math.random() * 2 + 1 });
      }
    };
    host.style.cursor = 'crosshair';
    host.addEventListener('mousemove', onMove);
    host.addEventListener('mouseleave', onLeave);
    host.addEventListener('mousedown', onDown);

    const particles = Array.from({ length: 42 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() * 1.6 + 0.4,
      v: Math.random() * 0.0006 + 0.00018,
      a: Math.random() * 0.35 + 0.08,
    }));

    let offset = 0, vMin = null, vMax = null;

    const frame = () => {
      if (!W) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, W, H);
      offset += 0.32;
      if (offset >= step) {
        offset -= step;
        candles.shift();
        candles.push(gen());
      }

      // spring-smooth the cursor + fade its influence in/out
      cur.amt += ((mouse.in ? 1 : 0) - cur.amt) * 0.08;
      if (mouse.in) {
        if (cur.x < -999) { cur.x = mouse.x; cur.y = mouse.y; }
        cur.x += (mouse.x - cur.x) * 0.18;
        cur.y += (mouse.y - cur.y) * 0.18;
      }

      let mn = Infinity, mx = -Infinity;
      for (const k of candles) {
        if (k.l < mn) mn = k.l;
        if (k.h > mx) mx = k.h;
      }
      const pad = (mx - mn) * 0.16 + 1;
      mn -= pad; mx += pad;
      if (vMin == null) { vMin = mn; vMax = mx; }
      else { vMin += (mn - vMin) * 0.05; vMax += (mx - vMax) * 0.05; }

      const topPad = H * 0.14, botPad = H * 0.20, ph = H - topPad - botPad;
      const yOf = (p) => topPad + ph - ((p - vMin) / (vMax - vMin)) * ph;

      // gravity well: everything near the cursor bends toward it
      const sigma2 = 2 * 95 * 95;
      const warp = (x, y) => {
        if (cur.amt < 0.01) return y;
        const dx = x - cur.x, dy = y - cur.y;
        const f = Math.exp(-(dx * dx + dy * dy) / sigma2) * cur.amt;
        return y + (cur.y - y) * 0.32 * f;
      };

      const pts = candles.map((k, i) => {
        const x = i * step - offset + cw / 2;
        return { x, y: warp(x, yOf(k.c)) };
      });

      // hovered candle index (for highlight + OHLC tooltip)
      let hi = -1;
      if (cur.amt > 0.05) {
        hi = Math.round((cur.x + offset - cw / 2) / step);
        if (hi < 0 || hi >= candles.length) hi = -1;
      }

      const g = ctx.createLinearGradient(0, topPad, 0, H - botPad);
      g.addColorStop(0, `rgba(${ACCENT},0.15)`);
      g.addColorStop(1, `rgba(${ACCENT},0)`);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, H - botPad);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.lineTo(pts[pts.length - 1].x, H - botPad);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      for (let i = 0; i < candles.length; i++) {
        const k = candles[i];
        const x = i * step - offset;
        const xc = x + cw / 2;
        const up = k.c >= k.o;
        // whole candle shifts with the gravity well
        const midY = yOf((k.h + k.l) / 2);
        const shift = warp(xc, midY) - midY;
        const isHi = i === hi;
        const boost = isHi ? cur.amt : 0;
        ctx.strokeStyle = up
          ? `rgba(0,224,164,${0.30 + 0.5 * boost})`
          : `rgba(255,99,99,${0.26 + 0.5 * boost})`;
        ctx.fillStyle = up
          ? `rgba(0,224,164,${0.14 + 0.28 * boost})`
          : `rgba(255,99,99,${0.12 + 0.28 * boost})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xc, yOf(k.h) + shift);
        ctx.lineTo(xc, yOf(k.l) + shift);
        ctx.stroke();
        const yo = yOf(k.o) + shift, yc = yOf(k.c) + shift;
        const bt = Math.min(yo, yc), bh = Math.max(2, Math.abs(yc - yo));
        ctx.fillRect(x, bt, cw, bh);
        ctx.strokeRect(x + 0.5, bt + 0.5, cw - 1, bh - 1);
      }

      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = `rgba(${ACCENT},0.55)`;
      ctx.lineWidth = 1.6;
      ctx.stroke();

      const hd = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT},0.95)`;
      ctx.shadowColor = `rgba(${ACCENT},0.9)`;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // ambient particles, gently pushed away from the cursor
      for (const q of particles) {
        q.y -= q.v;
        if (q.y < 0) { q.y = 1; q.x = Math.random(); }
        if (cur.amt > 0.01) {
          const dx = q.x * W - cur.x, dy = q.y * H - cur.y;
          const d2 = dx * dx + dy * dy;
          const f = Math.exp(-d2 / (2 * 110 * 110)) * cur.amt;
          if (f > 0.001) {
            const d = Math.sqrt(d2) + 0.001;
            q.x += (dx / d) * f * 0.0035;
            q.y += (dy / d) * f * 0.0035;
          }
        }
        ctx.beginPath();
        ctx.arc(q.x * W, q.y * H, q.s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${q.a * 0.55})`;
        ctx.fill();
      }

      /* ---- cursor overlay: soft light, crosshair, price readout ---- */
      if (cur.amt > 0.02) {
        // travelling light
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, 240);
        lg.addColorStop(0, `rgba(${ACCENT},${0.10 * cur.amt})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(cur.x - 240, cur.y - 240, 480, 480);
        ctx.restore();

        // terminal crosshair
        ctx.save();
        ctx.globalAlpha = cur.amt;
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(232,234,237,0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cur.x + 0.5, 0); ctx.lineTo(cur.x + 0.5, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cur.y + 0.5); ctx.lineTo(W, cur.y + 0.5); ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';

        // live price tag pinned to the right edge
        const price = vMin + (1 - (cur.y - topPad) / ph) * (vMax - vMin);
        const txt = price.toFixed(2);
        const tw = ctx.measureText(txt).width + 16;
        ctx.fillStyle = `rgba(${ACCENT},0.22)`;
        ctx.strokeStyle = `rgba(${ACCENT},0.55)`;
        ctx.fillRect(W - tw - 10, cur.y - 11, tw, 22);
        ctx.strokeRect(W - tw - 9.5, cur.y - 10.5, tw - 1, 21);
        ctx.fillStyle = '#e8eaed';
        ctx.fillText(txt, W - tw - 2, cur.y + 1);

        // OHLC readout for the hovered candle
        if (hi >= 0) {
          const k = candles[hi];
          const line = `O ${k.o.toFixed(1)}  H ${k.h.toFixed(1)}  L ${k.l.toFixed(1)}  C ${k.c.toFixed(1)}`;
          const lw = ctx.measureText(line).width + 18;
          const bx = Math.min(Math.max(cur.x - lw / 2, 10), W - lw - 10);
          const by = Math.max(cur.y - 44, 12);
          ctx.fillStyle = 'rgba(10,11,15,0.85)';
          ctx.strokeStyle = 'rgba(255,255,255,0.14)';
          ctx.fillRect(bx, by, lw, 24);
          ctx.strokeRect(bx + 0.5, by + 0.5, lw - 1, 23);
          ctx.fillStyle = k.c >= k.o ? '#00e0a4' : '#ff6363';
          ctx.fillText(line, bx + 9, by + 13);
        }
        ctx.restore();
      }

      /* ---- click shockwaves + spark bursts ---- */
      if (ripples.length || bursts.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ripples = ripples.filter((rp) => rp.a > 0.03);
        for (const rp of ripples) {
          rp.r += 4.6;
          rp.a *= 0.94;
          if (rp.r > 0) {
            ctx.beginPath();
            ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(${ACCENT},${rp.a})`;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
        }
        bursts = bursts.filter((b) => b.a > 0.04);
        for (const b of bursts) {
          b.x += b.vx;
          b.y += b.vy;
          b.vy -= 0.012; // sparks drift upward, like the market they just pumped
          b.a *= 0.955;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.s, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,224,164,${b.a * 0.9})`;
          ctx.fill();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      host.removeEventListener('mousemove', onMove);
      host.removeEventListener('mouseleave', onLeave);
      host.removeEventListener('mousedown', onDown);
      host.style.cursor = '';
    };
  }, [canvasRef]);
}

/* ------------------------------------------------------------------ */
/*  Flow field — 3D streams of light that trail the cursor             */
/*  Particles ride a slowly rotating vector field. Each one carries a  */
/*  depth value: far strands are dim, thin and parallax-lag behind the */
/*  cursor, near strands are bright, thick and lead it — which is what */
/*  sells the 3D. Near the cursor the field turns into a vortex, so    */
/*  the streams curl around the pointer and stretch out behind it.     */
/* ------------------------------------------------------------------ */
const TRAIL = 16;

function useFlowField(canvasRef, pointerRef) {
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, raf, t = 0;

    const resize = () => {
      const parent = cv.parentNode;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 90;
    const spawn = (p) => {
      p.x = Math.random() * (W + 200) - 100;
      p.y = Math.random() * (H + 200) - 100;
      p.z = 0.25 + Math.random() * 0.75;   // depth: 0 far … 1 near
      p.life = 60 + Math.random() * 200;
      p.trail.length = 0;
      return p;
    };
    const parts = Array.from({ length: COUNT }, () => spawn({ trail: [] }));

    // smoothed pointer, so the streams lag elegantly instead of snapping
    const cur = { x: -9999, y: -9999, amt: 0 };

    const frame = () => {
      if (!W) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, W, H);
      t += 0.0042;

      const ptr = pointerRef.current;
      cur.amt += ((ptr.in ? 1 : 0) - cur.amt) * 0.06;
      if (ptr.in) {
        if (cur.x < -999) { cur.x = ptr.x; cur.y = ptr.y; }
        cur.x += (ptr.x - cur.x) * 0.12;
        cur.y += (ptr.y - cur.y) * 0.12;
      }

      for (const p of parts) {
        // ambient field angle
        let a = Math.sin(p.x * 0.0042 + t * 1.7) * 1.7
              + Math.cos(p.y * 0.0049 - t * 1.3) * 1.7;
        let speed = 0.55 + p.z * 1.5;

        // vortex around the pointer — streams curl, then stream away behind it
        if (cur.amt > 0.01) {
          const dx = p.x - cur.x, dy = p.y - cur.y;
          const d = Math.hypot(dx, dy) + 0.001;
          const pull = Math.exp(-(d * d) / (2 * 165 * 165)) * cur.amt;
          if (pull > 0.002) {
            const tangent = Math.atan2(dy, dx) + Math.PI * 0.5;
            let diff = tangent - a;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            a += diff * pull * 0.85;
            speed += pull * 3.4 * p.z;
          }
        }

        p.x += Math.cos(a) * speed;
        p.y += Math.sin(a) * speed;

        p.trail.push(p.x, p.y);
        if (p.trail.length > TRAIL * 2) p.trail.splice(0, 2);

        if (--p.life < 0 || p.x < -140 || p.x > W + 140 || p.y < -140 || p.y > H + 140) spawn(p);
      }

      // parallax offset per depth layer — the real 3D tell
      const shiftX = cur.amt ? (cur.x - W / 2) * 0.035 : 0;
      const shiftY = cur.amt ? (cur.y - H / 2) * 0.035 : 0;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'lighter';

      for (const p of parts) {
        const n = p.trail.length / 2;
        if (n < 3) continue;
        const par = (1 - p.z);            // far strands drift opposite the cursor
        const ox = shiftX * par * 2.4;
        const oy = shiftY * par * 2.4;

        const fade = Math.min(1, p.life / 45);
        const alpha = (0.05 + p.z * 0.30) * fade;

        ctx.beginPath();
        ctx.moveTo(p.trail[0] + ox, p.trail[1] + oy);
        for (let i = 1; i < n; i++) ctx.lineTo(p.trail[i * 2] + ox, p.trail[i * 2 + 1] + oy);
        ctx.strokeStyle = `rgba(${ACCENT},${alpha})`;
        ctx.lineWidth = 0.4 + p.z * 1.5;
        ctx.stroke();

        // bright head, brighter the closer the strand is
        const hx = p.trail[(n - 1) * 2] + ox, hy = p.trail[(n - 1) * 2 + 1] + oy;
        ctx.beginPath();
        ctx.arc(hx, hy, 0.5 + p.z * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${190 + p.z * 65},${180 + p.z * 70},255,${(0.12 + p.z * 0.5) * fade})`;
        ctx.fill();
      }

      // soft light carried by the cursor
      if (cur.amt > 0.02) {
        const lg = ctx.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, 200);
        lg.addColorStop(0, `rgba(${ACCENT},${0.09 * cur.amt})`);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(cur.x - 200, cur.y - 200, 400, 400);
      }

      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, pointerRef]);
}

/* ------------------------------------------------------------------ */
/*  UI atoms                                                           */
/* ------------------------------------------------------------------ */
function EdgeLogo({ large = false }) {
  return (
    <div
      className={`select-none font-extrabold whitespace-nowrap ${
        large ? 'text-[24px] tracking-[9px]' : 'text-[16px] tracking-[6px]'
      }`}
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundImage: `linear-gradient(135deg, #fff 10%, ${ACCENT_HEX} 120%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        filter: `drop-shadow(0 0 22px rgba(${ACCENT},0.4))`,
      }}
    >
      THE&nbsp;EDGE
    </div>
  );
}

function TickerMarquee({ data, small = false }) {
  const loop = [...data, ...data];
  const mask = 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)';
  return (
    <div className="overflow-hidden" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <div
        className={`flex ${small ? 'gap-5 text-[11px]' : 'gap-[34px] text-[12px]'} w-max`}
        style={{ fontFamily: "'JetBrains Mono', monospace", animation: `edgeMarquee ${small ? 22 : 26}s linear infinite` }}
      >
        {loop.map((tk, i) => (
          <div key={i} className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-[#e8eaed]/55">{tk.sym}</span>
            <span className="text-[#e8eaed]/85">{tk.px}</span>
            <span style={{ color: tk.up ? '#00e0a4' : '#ff6363' }}>{tk.chg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldInput({ icon: Icon, ...props }) {
  return (
    <div className="relative group">
      <Icon
        size={17}
        strokeWidth={1.7}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e8eaed]/40 transition-colors"
      />
      <input
        {...props}
        className="w-full h-[54px] pl-11 pr-4 rounded-[13px] bg-white/[0.03] border border-white/[0.09] text-[#e8eaed] text-[14.5px] font-medium placeholder:text-[#e8eaed]/30 outline-none transition-all duration-200 focus:border-[rgba(139,123,255,0.6)] focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(139,123,255,0.22)]"
        style={{ fontFamily: "'Manrope', sans-serif" }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="w-[18px] h-[18px] rounded-full"
      style={{
        border: '2px solid rgba(255,255,255,0.4)',
        borderTopColor: '#fff',
        animation: 'edgeSpin 0.7s linear infinite',
      }}
    />
  );
}

/* ---------------- 3D magnetic button ---------------- */
function PrimaryButton({ children, loading, withArrow = false, disabled, ...props }) {
  const ref = useRef(null);
  const inert = loading || disabled;

  // normalized cursor position inside the button (0..1)
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);

  const spring = { stiffness: 240, damping: 18, mass: 0.4 };
  const rotateX = useSpring(useTransform(py, [0, 1], [13, -13]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-17, 17]), spring);
  const lift = useSpring(useTransform(hover, [0, 1], [0, -4]), spring);
  const depth = useSpring(useTransform(hover, [0, 1], [0, 16]), spring);
  const glowOpacity = useSpring(useTransform(hover, [0, 1], [0, 1]), { stiffness: 180, damping: 24 });

  const lx = useTransform(px, (v) => `${v * 100}%`);
  const ly = useTransform(py, (v) => `${v * 100}%`);
  // specular highlight that chases the cursor across the face
  const specular = useMotionTemplate`radial-gradient(160px circle at ${lx} ${ly}, rgba(255,255,255,0.5), rgba(255,255,255,0.06) 45%, transparent 70%)`;
  // colored bloom underneath, tilting with the surface
  const bloomX = useTransform(rotateY, (v) => -v * 1.1);
  const bloomY = useTransform(rotateX, (v) => v * 1.1);

  const onMove = (e) => {
    if (inert || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onEnter = () => { if (!inert) hover.set(1); };
  const onLeave = () => {
    hover.set(0);
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <div className="relative mt-1" style={{ perspective: 800 }}>
      {/* tilting colored bloom behind the button */}
      <motion.div
        aria-hidden
        className="absolute inset-x-3 -bottom-1 h-full rounded-[18px] pointer-events-none blur-xl"
        style={{
          background: `linear-gradient(140deg, rgba(${ACCENT},0.9), rgba(79,55,220,0.7))`,
          opacity: glowOpacity,
          x: bloomX,
          y: bloomY,
        }}
      />

      <motion.button
        {...props}
        ref={ref}
        disabled={inert}
        onMouseMove={onMove}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        whileTap={inert ? undefined : { scale: 0.975 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="relative w-full h-[54px] rounded-[13px] text-white font-bold text-[13px] uppercase tracking-[2px] flex items-center justify-center disabled:opacity-60"
        style={{
          fontFamily: "'Manrope', sans-serif",
          rotateX,
          rotateY,
          y: lift,
          transformStyle: 'preserve-3d',
          background: `linear-gradient(140deg, #b9aeff 0%, ${ACCENT_HEX} 46%, #4a35c9 100%)`,
          boxShadow: `0 18px 40px -16px rgba(${ACCENT},0.75), inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -12px 20px -12px rgba(0,0,0,0.4)`,
        }}
      >
        {/* clipped surface effects */}
        <span className="absolute inset-0 rounded-[13px] overflow-hidden pointer-events-none">
          {/* ambient sweep */}
          <span
            className="absolute top-0 left-0 w-[38%] h-full"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
              animation: 'edgeShine 4.5s ease-in-out infinite',
            }}
          />
          {/* cursor-tracking specular */}
          <motion.span
            className="absolute inset-0"
            style={{ backgroundImage: specular, opacity: glowOpacity, mixBlendMode: 'screen' }}
          />
          {/* glass rim */}
          <span
            className="absolute inset-0 rounded-[13px]"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)' }}
          />
        </span>

        {/* label floats above the surface in 3D */}
        <motion.span
          className="relative z-10 inline-flex items-center gap-2"
          style={{ translateZ: depth }}
        >
          {loading ? <Spinner /> : (
            <>
              <span>{children}</span>
              {withArrow && <ArrowRight size={15} strokeWidth={2} />}
            </>
          )}
        </motion.span>
      </motion.button>
    </div>
  );
}

function Divider() {
  return (
    <div
      className="h-px my-[26px]"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)' }}
    />
  );
}

function FeatureRow({ feature, index }) {
  const { icon: Icon, color, rgb, title, desc, stat } = feature;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35 + index * 0.09, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-[14px] px-4 py-[13px] rounded-[14px] border border-white/[0.06]"
      style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))' }}
    >
      <div
        className="w-[38px] h-[38px] rounded-[11px] shrink-0 flex items-center justify-center"
        style={{ color, background: `rgba(${rgb},0.14)`, border: `1px solid rgba(${rgb},0.3)` }}
      >
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-[13.5px] text-[#eef1f4]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {title}
        </div>
        <div className="text-[11.5px] text-[#e8eaed]/45 mt-0.5">{desc}</div>
      </div>
      <div className="text-[12px] font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace", color }}>
        {stat}
      </div>
    </motion.div>
  );
}

const screenMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function Auth() {
  useEdgeFonts();
  const liveTicker = useLiveTicker();
  const clock = useUtcClock();

  // 'login' | 'register' | 'reset' | 'verify'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }

  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  /* Куди повертати після входу: або звідки прийшов, або на головну */
  const from = location.state?.from?.pathname || '/app';
  const canvasRef = useRef(null);
  useCandlestickChart(canvasRef);

  /* ---- right panel: flow field + 3D card tilt ---- */
  const flowRef = useRef(null);
  const cardRef = useRef(null);
  const pointer = useRef({ x: -9999, y: -9999, in: false });
  useFlowField(flowRef, pointer);

  const tilt = { stiffness: 110, damping: 18, mass: 0.5 };
  const nx = useMotionValue(0.5); // cursor position across the card, 0..1
  const ny = useMotionValue(0.5);
  const sheenOn = useMotionValue(0);
  const cardRotX = useSpring(useTransform(ny, [0, 1], [4.5, -4.5]), tilt);
  const cardRotY = useSpring(useTransform(nx, [0, 1], [-5.5, 5.5]), tilt);
  const sheenX = useTransform(nx, (v) => `${v * 100}%`);
  const sheenY = useTransform(ny, (v) => `${v * 100}%`);
  const sheenOpacity = useSpring(sheenOn, { stiffness: 150, damping: 26 });
  const cardSheen = useMotionTemplate`radial-gradient(420px circle at ${sheenX} ${sheenY}, rgba(${ACCENT},0.16), rgba(255,255,255,0.03) 40%, transparent 68%)`;

  const onPanelMove = (e) => {
    const host = e.currentTarget.getBoundingClientRect();
    pointer.current = { x: e.clientX - host.left, y: e.clientY - host.top, in: true };
    const c = cardRef.current?.getBoundingClientRect();
    if (c) {
      nx.set((e.clientX - c.left) / c.width);
      ny.set((e.clientY - c.top) / c.height);
      sheenOn.set(1);
    }
  };
  const onPanelLeave = () => {
    pointer.current = { ...pointer.current, in: false };
    nx.set(0.5);
    ny.set(0.5);
    sheenOn.set(0);
  };

  const getErrorMessage = (error) => {
    const msg = error?.message || '';
    if (msg.includes('Email not confirmed')) return 'Будь ласка, підтвердіть вашу пошту (перейдіть за посиланням у листі).';
    if (msg.includes('Invalid login credentials')) return 'Неправильний email або пароль.';
    if (msg.includes('User already registered') || msg.includes('already exists')) return 'Акаунт з таким email вже існує.';
    if (msg.includes('Password should be at least')) return 'Пароль має містити мінімум 6 символів.';
    if (msg.includes('rate limit')) return 'Забагато спроб. Спробуйте пізніше.';
    if (msg.includes('invalid email')) return 'Некоректний формат email адреси.';
    if (msg.includes('Signups not allowed')) return 'Реєстрація нових користувачів вимкнена в базі.';
    return `Системна помилка: ${msg}`;
  };

  const switchMode = useCallback((next) => {
    setMode(next);
    setMessage(null);
    setPassword('');
  }, []);

  const handleInputChange = (setter) => (e) => {
    setter(e.target.value);
    if (message?.type === 'error') setMessage(null);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        /* Прапорець ставимо до переходу: застосунок прочитає його при
           монтуванні й розкриється свічкою замість того, щоб просто
           зʼявитись. Заразом це ховає час, поки вантажиться стан дня. */
        armReveal();
        navigate(from, { replace: true });
      } else if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data?.user && data.user.identities && data.user.identities.length === 0) {
          setMessage({ type: 'error', text: 'Акаунт з таким email вже існує.' });
          setLoading(false);
          return;
        }

        setMode('verify');
        setPassword('');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/auth',
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Посилання для відновлення надіслано на пошту.' });
        setMode('login');
        setPassword('');
      }
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setMessage({ type: 'success', text: 'Лист надіслано повторно.' });
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setResending(false);
    }
  };

  const gridMask = 'radial-gradient(120% 100% at 68% 42%, #000 28%, transparent 74%)';

  /* Уже залогінений — нічого показувати, одразу в застосунок */
  if (user) return <Navigate to={from === '/auth' ? '/' : from} replace />;

  return (
    <div
      className="fixed inset-0 flex bg-[#08090b] text-[#e8eaed] overflow-hidden"
      style={{ fontFamily: "'Manrope', sans-serif" }}
    >
      <style>{`
        @keyframes edgeAurora { 0%{transform:translate(0,0) scale(1);} 50%{transform:translate(6%,-4%) scale(1.15);} 100%{transform:translate(0,0) scale(1);} }
        @keyframes edgeAurora2 { 0%{transform:translate(0,0) scale(1.1);} 50%{transform:translate(-5%,5%) scale(.95);} 100%{transform:translate(0,0) scale(1.1);} }
        @keyframes edgeShine { 0%{transform:translateX(-160%) skewX(-20deg);} 55%{transform:translateX(320%) skewX(-20deg);} 100%{transform:translateX(320%) skewX(-20deg);} }
        @keyframes edgeFloat { 0%{transform:translateY(0);} 50%{transform:translateY(-6px);} 100%{transform:translateY(0);} }
        @keyframes edgePulse { 0%{opacity:.5;} 50%{opacity:1;} 100%{opacity:.5;} }
        @keyframes edgeMarquee { 0%{transform:translateX(0);} 100%{transform:translateX(-50%);} }
        @keyframes edgeSpin { to { transform: rotate(360deg); } }
        input:-webkit-autofill { -webkit-text-fill-color:#e8eaed; -webkit-box-shadow:0 0 0 40px #16181d inset; transition:background-color 9999s; }

        /* scrollable but with no visible scrollbar */
        .edge-right { overflow-y: auto; overflow-x: hidden; scrollbar-width: none; -ms-overflow-style: none; }
        .edge-right::-webkit-scrollbar { width: 0; height: 0; display: none; }

        .edge-brand-panel { display: block; }
        .edge-mobile-bar { display: none; }
        @media (max-width: 1000px) {
          .edge-brand-panel { display: none !important; }
          .edge-mobile-bar { display: flex !important; }
          .edge-right { padding: 76px 20px 32px !important; align-items: flex-start !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; }
        }
      `}</style>

      {/* ambient background glows */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            top: '-12%', left: '20%', width: 640, height: 640,
            background: `radial-gradient(circle, rgba(${ACCENT},0.24), transparent 62%)`,
            filter: 'blur(30px)', animation: 'edgeAurora 18s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '-18%', right: '4%', width: 560, height: 560,
            background: 'radial-gradient(circle, rgba(79,139,255,0.16), transparent 60%)',
            filter: 'blur(40px)', animation: 'edgeAurora2 22s ease-in-out infinite',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            bottom: '6%', left: '-8%', width: 420, height: 420,
            background: 'radial-gradient(circle, rgba(0,224,164,0.10), transparent 60%)',
            filter: 'blur(40px)', animation: 'edgeAurora 26s ease-in-out infinite',
          }}
        />
      </div>

      {/* compact brand bar — replaces the brand panel below 1000px */}
      <div
        className="edge-mobile-bar items-center gap-4 fixed top-0 left-0 right-0 h-[56px] px-4 z-30 border-b border-white/[0.06]"
        style={{ background: 'rgba(8,9,11,0.75)', backdropFilter: 'blur(16px)' }}
      >
        <EdgeLogo />
        <div className="flex-1 min-w-0">
          <TickerMarquee data={liveTicker} small />
        </div>
      </div>

      {/* ============================= LEFT ============================= */}
      <div
        className="edge-brand-panel select-none relative z-[1] overflow-hidden border-r border-white/[0.06]"
        style={{ flex: 1.15 }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 22% 30%, transparent 30%, rgba(8,9,11,0.55) 100%), linear-gradient(180deg, rgba(8,9,11,0.72) 0%, rgba(8,9,11,0.30) 40%, rgba(8,9,11,0.55) 100%)',
          }}
        />

        <div className="relative h-full flex flex-col justify-between p-[52px_58px] z-[2]">
          <EdgeLogo large />

          <div className="max-w-[520px]">
            <div
              className="text-[11px] uppercase mb-[22px]"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 4, color: ACCENT_HEX }}
            >
              Trading Terminal Access
            </div>
            <div
              className="font-semibold text-[32px] leading-[1.08] text-[#f6f8fa] sm:text-[46px]"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.5px' }}
            >
              Торгуй з перевагою,<br />яку можна виміряти.
            </div>
            <div
              className="mt-6 text-[10.5px] uppercase text-[#e8eaed]/35"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2.5 }}
            >
              Клікни по графіку — розжени ринок ↗
            </div>
          </div>

          <div>
            <div className="mb-[26px]">
              <TickerMarquee data={liveTicker} />
            </div>
            <div
              className="flex items-center gap-[10px] text-[10.5px] uppercase text-[#e8eaed]/40"
              style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2.5 }}
            >
              <span
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: '#00e0a4', boxShadow: '0 0 10px rgba(0,224,164,0.8)',
                  animation: 'edgePulse 2.4s ease-in-out infinite',
                }}
              />
              SOC 2 · 256-BIT ENCRYPTION
            </div>
          </div>
        </div>
      </div>

      {/* ============================ RIGHT ============================ */}
      <div
        className="edge-right relative flex-1 flex flex-col items-center justify-center z-[2] p-10"
        onMouseMove={onPanelMove}
        onMouseLeave={onPanelLeave}
      >
        {/* everything decorative is clipped to the panel so nothing can create a scrollbar */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* dotted grid texture */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
              backgroundSize: '34px 34px',
              maskImage: gridMask,
              WebkitMaskImage: gridMask,
            }}
          />
          {/* streams of light trailing the cursor */}
          <canvas ref={flowRef} className="absolute inset-0 w-full h-full block" />
          {/* accent glow, top-right */}
          <div
            className="absolute rounded-full"
            style={{
              top: '4%', right: '-14%', width: 560, height: 560,
              background: `radial-gradient(circle, rgba(${ACCENT},0.22), transparent 62%)`,
              filter: 'blur(50px)', animation: 'edgeAurora 20s ease-in-out infinite',
            }}
          />
        </div>

        <div className="relative z-[1] w-full max-w-[428px] flex flex-col" style={{ perspective: 1400 }}>
          {/* top status strip */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-between mb-5 text-[10.5px] uppercase text-[#e8eaed]/42"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 }}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-[7px] h-[7px] rounded-full"
                style={{
                  background: '#00e0a4', boxShadow: '0 0 10px rgba(0,224,164,0.8)',
                  animation: 'edgePulse 2.4s ease-in-out infinite',
                }}
              />
              Ринок відкрито
            </div>
            <div className="text-[#e8eaed]/60" style={{ letterSpacing: 1.5 }}>{clock}</div>
          </motion.div>

          {/* ============================ CARD ============================ */}
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[24px] border border-white/[0.09] p-[40px_40px_34px]"
            style={{
              rotateX: cardRotX,
              rotateY: cardRotY,
              transformStyle: 'preserve-3d',
              background: 'linear-gradient(180deg, rgba(25,28,36,0.9), rgba(13,15,20,0.92))',
              backdropFilter: 'blur(28px) saturate(140%)',
              boxShadow: '0 40px 90px -30px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            {/* sheen that follows the cursor across the glass */}
            <motion.div
              className="absolute inset-0 rounded-[24px] pointer-events-none"
              style={{ backgroundImage: cardSheen, opacity: sheenOpacity }}
            />
            {/* inner corner accent glow */}
            <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none">
              <div
                className="absolute"
                style={{
                  top: '-40%', right: '-18%', width: '70%', height: '70%',
                  background: `radial-gradient(circle, rgba(${ACCENT},0.20), transparent 65%)`,
                  filter: 'blur(22px)',
                }}
              />
            </div>
            {/* top hairline + glow */}
            <div
              className="absolute -top-px left-1/2 -translate-x-1/2 w-[64%] h-px pointer-events-none"
              style={{ background: `linear-gradient(90deg, transparent, rgba(${ACCENT},0.95), transparent)` }}
            />
            <div
              className="absolute -top-6 left-1/2 -translate-x-1/2 w-[70%] h-6 pointer-events-none"
              style={{ background: `radial-gradient(ellipse at center, rgba(${ACCENT},0.32), transparent 70%)`, filter: 'blur(6px)' }}
            />

            <div className="relative">
              {/* brand mark */}
              <div className="flex justify-center mb-[26px]">
                <EdgeLogo />
              </div>

              {/* message banner */}
              <AnimatePresence mode="popLayout">
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="mb-5 px-4 py-3.5 rounded-xl flex items-start gap-2.5 text-[13px] font-semibold leading-[1.45]"
                      style={
                        message.type === 'error'
                          ? { background: 'rgba(255,99,99,0.10)', border: '1px solid rgba(255,99,99,0.24)', color: '#ff8080' }
                          : { background: 'rgba(0,224,164,0.10)', border: '1px solid rgba(0,224,164,0.24)', color: '#4fe3b6' }
                      }
                    >
                      {message.type === 'error'
                        ? <AlertTriangle size={18} strokeWidth={2} className="shrink-0 mt-px" />
                        : <Check size={18} strokeWidth={2} className="shrink-0 mt-px" />}
                      <span>{message.text}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {/* ---------------------- LOGIN ---------------------- */}
                {mode === 'login' && (
                  <motion.div key="login" {...screenMotion}>
                    <div className="text-center mb-7">
                      <div className="font-bold text-[28px] tracking-[1px] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        ВХІД
                      </div>
                      <div className="text-[10px] tracking-[3.5px] text-[#e8eaed]/40 mt-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        TRADING TERMINAL ACCESS
                      </div>
                    </div>

                    <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
                      <FieldInput icon={Mail} type="email" placeholder="Електронна пошта" required
                        value={email} onChange={handleInputChange(setEmail)} autoComplete="email" />
                      <FieldInput icon={Lock} type="password" placeholder="Пароль" required
                        value={password} onChange={handleInputChange(setPassword)} autoComplete="current-password" />
                      <div className="flex justify-end">
                        <button type="button" onClick={() => switchMode('reset')}
                          className="text-[11px] font-bold uppercase tracking-[1px] text-[#e8eaed]/50 hover:text-white transition-colors">
                          Забули пароль?
                        </button>
                      </div>
                      <PrimaryButton type="submit" loading={loading} withArrow>Увійти</PrimaryButton>
                    </form>

                    <Divider />
                    <div className="text-center">
                      <button type="button" onClick={() => switchMode('register')}
                        className="text-[12.5px] text-[#e8eaed]/48 hover:text-white transition-colors">
                        Немає акаунту? Зареєструватися
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* --------------------- REGISTER --------------------- */}
                {mode === 'register' && (
                  <motion.div key="register" {...screenMotion}>
                    <div className="text-center mb-7">
                      <div className="font-bold text-[28px] tracking-[1px] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        РЕЄСТРАЦІЯ
                      </div>
                      <div className="text-[10px] tracking-[3.5px] text-[#e8eaed]/40 mt-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        TRADING TERMINAL ACCESS
                      </div>
                    </div>

                    <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
                      <FieldInput icon={Mail} type="email" placeholder="Електронна пошта" required
                        value={email} onChange={handleInputChange(setEmail)} autoComplete="email" />
                      <FieldInput icon={Lock} type="password" placeholder="Пароль" required
                        value={password} onChange={handleInputChange(setPassword)} autoComplete="new-password" />
                      <PrimaryButton type="submit" loading={loading} withArrow>Створити акаунт</PrimaryButton>
                    </form>

                    <Divider />
                    <div className="text-center">
                      <button type="button" onClick={() => switchMode('login')}
                        className="text-[12.5px] text-[#e8eaed]/48 hover:text-white transition-colors">
                        Вже є акаунт? Увійти
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ----------------------- RESET ---------------------- */}
                {mode === 'reset' && (
                  <motion.div key="reset" {...screenMotion}>
                    <div className="text-center mb-6">
                      <div
                        className="w-[52px] h-[52px] mx-auto mb-[18px] rounded-[15px] flex items-center justify-center"
                        style={{ background: `rgba(${ACCENT},0.22)`, border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <Key size={22} color={ACCENT_HEX} strokeWidth={1.7} />
                      </div>
                      <div className="font-bold text-[25px] tracking-[0.5px] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        Відновлення
                      </div>
                      <div className="text-[13px] leading-[1.5] text-[#e8eaed]/50 mt-[11px]">
                        Введіть свою пошту — ми надішлемо посилання для відновлення доступу.
                      </div>
                    </div>

                    <form onSubmit={handleAuth} className="flex flex-col gap-3.5">
                      <FieldInput icon={Mail} type="email" placeholder="Електронна пошта" required
                        value={email} onChange={handleInputChange(setEmail)} autoComplete="email" />
                      <PrimaryButton type="submit" loading={loading}>Надіслати посилання</PrimaryButton>
                    </form>

                    <div className="text-center mt-6">
                      <button type="button" onClick={() => switchMode('login')}
                        className="inline-flex items-center gap-2 text-[12.5px] text-[#e8eaed]/48 hover:text-white transition-colors">
                        <ArrowLeft size={14} strokeWidth={2} /> Повернутися до входу
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ----------------------- VERIFY --------------------- */}
                {mode === 'verify' && (
                  <motion.div key="verify" {...screenMotion} className="text-center">
                    <div
                      className="w-16 h-16 mx-auto mt-1 mb-5 rounded-[19px] flex items-center justify-center"
                      style={{
                        background: `rgba(${ACCENT},0.22)`, border: '1px solid rgba(255,255,255,0.1)',
                        animation: 'edgeFloat 4s ease-in-out infinite',
                      }}
                    >
                      <MailCheck size={28} color={ACCENT_HEX} strokeWidth={1.6} />
                    </div>
                    <div className="font-bold text-[24px] tracking-[0.5px] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Перевірте пошту
                    </div>
                    <div className="text-[13.5px] leading-[1.6] text-[#e8eaed]/55 mt-3 mb-[26px] max-w-[320px] mx-auto">
                      Ми надіслали лист із підтвердженням на адресу{' '}
                      <span className="text-[#e8eaed]/85 font-semibold break-all">{email || 'your@email.com'}</span>.
                      {' '}Перейдіть за посиланням, щоб активувати акаунт.
                    </div>

                    <PrimaryButton type="button" loading={resending} onClick={handleResend}>
                      Надіслати лист повторно
                    </PrimaryButton>

                    <div className="mt-5">
                      <button type="button" onClick={() => switchMode('login')}
                        className="text-[12.5px] text-[#e8eaed]/35 hover:text-white transition-colors">
                        Повернутися до входу
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* ======================= FEATURE STRIP ======================= */}
          <div className="flex flex-col gap-2.5 mt-[22px]">
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} feature={f} index={i} />
            ))}
          </div>

          <div
            className="text-center mt-5 text-[10px] uppercase text-[#e8eaed]/28"
            style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 }}
          >
            © 2026 THE EDGE · SOC 2 · 256-BIT
          </div>
        </div>
      </div>
    </div>
  );
}