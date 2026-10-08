import { withAlpha } from '../../../lib/candles/chartPrefs';

/* ==================================================================
   Додаткові інструменти TradingView: криві, дуга, варіанти вил,
   фібоначчі (канал, часові зони, кола, віяло), Ганн (коробка, віяло),
   піни/прапорці/вказівники/цінові нотатки.

   Кожен інструмент тут — геометрія (відрізки для кліку, області,
   ручки) і набір примітивів для SVG. DrawingManager кличе
   extraGeom() із geom() і paint() із draw().
================================================================== */

const FONT = "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const EXTRA = new Set([
  'curve', 'dcurve', 'arc',
  'fibchannel', 'fibtime', 'fibcircles', 'fibfan', 'gannbox', 'gannfan',
  'pin', 'flag', 'signpost', 'pricenote',
]);

export const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const GANN_LV = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
const GANN_FAN = [[8, '1/8'], [4, '1/4'], [3, '1/3'], [2, '1/2'], [1, '1/1'], [1 / 2, '2/1'], [1 / 3, '3/1'], [1 / 4, '4/1'], [1 / 8, '8/1']];
const CYCLE = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63'];

/* Контрольні точки кривих за замовчуванням — збоку від хорди,
   щоб крива одразу була кривою (як у TV). */
export function curveCtrls(type, A, B) {
  const dx = B.x - A.x; const dy = B.y - A.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L; const ny = dx / L;
  const k = L * 0.3;
  if (type === 'curve') return [{ x: (A.x + B.x) / 2 + nx * k, y: (A.y + B.y) / 2 + ny * k }];
  return [
    { x: A.x + dx / 3 + nx * k, y: A.y + dy / 3 + ny * k },
    { x: A.x + (dx * 2) / 3 - nx * k, y: A.y + (dy * 2) / 3 - ny * k },
  ];
}

const quad = (A, C, B, t) => ({ x: (1 - t) ** 2 * A.x + 2 * (1 - t) * t * C.x + t * t * B.x, y: (1 - t) ** 2 * A.y + 2 * (1 - t) * t * C.y + t * t * B.y });
const cubic = (A, C1, C2, B, t) => {
  const u = 1 - t;
  return { x: u ** 3 * A.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t ** 3 * B.x, y: u ** 3 * A.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t ** 3 * B.y };
};
const sample = (fn, n = 24) => { const out = []; for (let i = 0; i <= n; i += 1) out.push(fn(i / n)); return out; };
const segsOf = (pts) => { const s = []; for (let i = 1; i < pts.length; i += 1) s.push([pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y]); return s; };

/* Пряма з A у напрямку (dx, dy) до краю області. */
function ray(A, dx, dy, W) {
  if (Math.abs(dx) < 1e-6) return [A.x, A.y, A.x, A.y + Math.sign(dy || 1) * 4000];
  const tx = dx > 0 ? (W + 50 - A.x) / dx : (-50 - A.x) / dx;
  const k = Math.max(1, tx);
  return [A.x, A.y, A.x + dx * k, A.y + dy * k];
}

function textW(s, fs) { return String(s).length * fs * 0.6 + 14; }

/* g — заготовка з DrawingManager.geom (segs/areas/handles). */
export function extraGeom(dm, d, P, g) {
  const s = d.style || {};
  const { w: W, h: H } = dm.plot();
  const col = s.color || '#2962ff';
  const paint = [];
  g.paint = paint;
  const levels = (s.levels || []).filter((l) => l.on);

  switch (d.type) {
    case 'curve': case 'dcurve': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const auto = curveCtrls(d.type, A, B);
      const C = [P[2] || auto[0], P[3] || auto[1]];
      const pts = d.type === 'curve' ? sample((t) => quad(A, C[0], B, t)) : sample((t) => cubic(A, C[0], C[1], B, t));
      g.segs.push(...segsOf(pts));
      const path = d.type === 'curve'
        ? `M${A.x},${A.y} Q${C[0].x},${C[0].y} ${B.x},${B.y}`
        : `M${A.x},${A.y} C${C[0].x},${C[0].y} ${C[1].x},${C[1].y} ${B.x},${B.y}`;
      paint.push({ k: 'path', d: path, c: col, w: s.width, dash: s.lineStyle });
      if (P.length > 2) {
        /* Ручки контрольних точок з тонкими «вусами» до кінців — як у TV. */
        paint.push({ k: 'line', a: [A.x, A.y, C[0].x, C[0].y], c: withAlpha(col, 0.45), w: 1, dash: 'dashed', sel: true });
        if (d.type === 'curve') paint.push({ k: 'line', a: [C[0].x, C[0].y, B.x, B.y], c: withAlpha(col, 0.45), w: 1, dash: 'dashed', sel: true });
        else paint.push({ k: 'line', a: [C[1].x, C[1].y, B.x, B.y], c: withAlpha(col, 0.45), w: 1, dash: 'dashed', sel: true });
      }
      return g;
    }
    case 'arc': {
      if (P.length < 3) { if (P.length > 1) { g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); paint.push({ k: 'line', a: [P[0].x, P[0].y, P[1].x, P[1].y], c: col, w: s.width }); } return g; }
      const [A, B, M] = P;
      /* Крива проходить через третю точку: контрольна Q = 2M − (A+B)/2. */
      const Q = { x: 2 * M.x - (A.x + B.x) / 2, y: 2 * M.y - (A.y + B.y) / 2 };
      const pts = sample((t) => quad(A, Q, B, t));
      g.segs.push(...segsOf(pts));
      g.areas.push({ poly: pts.map((q) => [q.x, q.y]) });
      paint.push({ k: 'path', d: `M${A.x},${A.y} Q${Q.x},${Q.y} ${B.x},${B.y} Z`, fill: s.fill || 'none', c: 'none' });
      paint.push({ k: 'path', d: `M${A.x},${A.y} Q${Q.x},${Q.y} ${B.x},${B.y}`, c: col, w: s.width, dash: s.lineStyle });
      return g;
    }
    case 'fibchannel': {
      if (P.length < 3) { if (P.length > 1) { g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); paint.push({ k: 'line', a: [P[0].x, P[0].y, P[1].x, P[1].y], c: col, w: s.width }); } return g; }
      const off = dm.channelOffset(d, P);
      const [A, B] = P;
      let x2 = B.x; let y2off = 0;
      if (s.extendRight && B.x !== A.x) { const k = (W - A.x) / (B.x - A.x); x2 = W; y2off = (B.y - A.y) * k - (B.y - A.y); }
      const L = levels.map((l) => ({ ...l, a: [A.x, A.y + off * l.v, x2, B.y + y2off + off * l.v] })).sort((a, b) => a.v - b.v);
      for (let i = 1; i < L.length; i += 1) {
        const p = L[i - 1].a; const q = L[i].a;
        if (s.fillLevels) paint.push({ k: 'poly', pts: [[p[0], p[1]], [p[2], p[3]], [q[2], q[3]], [q[0], q[1]]], fill: withAlpha(L[i].c, s.fillAlpha ?? 0.12) });
      }
      L.forEach((l) => {
        g.segs.push(l.a);
        paint.push({ k: 'line', a: l.a, c: l.c, w: s.width, dash: s.lineStyle });
        if (s.showLevels) paint.push({ k: 'text', x: l.a[0] - 6, y: l.a[1] + 4, s: l.v, c: l.c, fs: 11, anchor: 'end' });
      });
      g.handles = [{ ...A, idx: 0 }, { ...B, idx: 1 }, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + off, idx: 2 }];
      g.off = off;
      return g;
    }
    case 'fibtime': {
      if (P.length < 2) return g;
      const a0 = dm.absOf(d.pts[0].t) - dm.e.win;
      const unit = dm.absOf(d.pts[1].t) - dm.absOf(d.pts[0].t);
      FIB_TIME.forEach((n, i) => {
        const x = dm.lx(a0 + unit * n);
        if (x == null || x < -20 || x > W + 20) return;
        const c = CYCLE[i % CYCLE.length];
        g.segs.push([x, 0, x, H]);
        paint.push({ k: 'line', a: [x, 0, x, H], c, w: s.width, dash: s.lineStyle });
        paint.push({ k: 'text', x: x + 4, y: H - 8, s: n, c, fs: 11, anchor: 'start' });
      });
      paint.push({ k: 'line', a: [P[0].x, P[0].y, P[1].x, P[1].y], c: col, w: 1, dash: 'dashed' });
      return g;
    }
    case 'fibcircles': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const r = Math.hypot(B.x - A.x, B.y - A.y);
      const L = levels.filter((l) => l.v > 0).sort((a, b) => b.v - a.v);
      L.forEach((l) => {
        const R = r * l.v;
        paint.push({ k: 'circle', cx: A.x, cy: A.y, r: R, c: l.c, w: s.width, fill: s.fillLevels ? withAlpha(l.c, (s.fillAlpha ?? 0.12) / 2) : 'none', dash: s.lineStyle });
        if (s.showLevels) paint.push({ k: 'text', x: A.x + R + 3, y: A.y - 3, s: l.v, c: l.c, fs: 11, anchor: 'start' });
      });
      const R = r * (L[0]?.v || 1);
      g.areas.push({ ring: [A.x, A.y, R] });
      g.segs.push([A.x, A.y, B.x, B.y]);
      paint.push({ k: 'line', a: [A.x, A.y, B.x, B.y], c: col, w: 1, dash: 'dashed' });
      return g;
    }
    case 'fibfan': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const dx = B.x - A.x; const dy = B.y - A.y;
      const fan = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1];
      fan.forEach((v, i) => {
        const c = CYCLE[(i + 1) % CYCLE.length];
        const p = ray(A, dx, dy * v, W);
        g.segs.push(p);
        paint.push({ k: 'line', a: p, c, w: s.width, dash: s.lineStyle });
        paint.push({ k: 'text', x: B.x + 4, y: A.y + dy * v + 4, s: v, c, fs: 11, anchor: 'start' });
        if (v > 0 && v < 1) {
          const q = ray(A, dx * v, dy, W);
          g.segs.push(q);
          paint.push({ k: 'line', a: q, c, w: s.width, dash: s.lineStyle });
        }
      });
      fan.forEach((v) => paint.push({ k: 'line', a: [A.x, A.y + dy * v, B.x, A.y + dy * v], c: withAlpha(col, 0.35), w: 1 }));
      fan.forEach((v) => paint.push({ k: 'line', a: [A.x + dx * v, A.y, A.x + dx * v, B.y], c: withAlpha(col, 0.35), w: 1 }));
      return g;
    }
    case 'gannbox': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const x1 = Math.min(A.x, B.x); const x2 = Math.max(A.x, B.x);
      const y1 = Math.min(A.y, B.y); const y2 = Math.max(A.y, B.y);
      g.areas.push({ rect: [x1, y1, x2 - x1, y2 - y1] });
      for (let i = 1; i < GANN_LV.length; i += 1) {
        const ya = y1 + (y2 - y1) * GANN_LV[i - 1]; const yb = y1 + (y2 - y1) * GANN_LV[i];
        paint.push({ k: 'rect', x: x1, y: ya, w: x2 - x1, h: yb - ya, fill: withAlpha(CYCLE[i], 0.08) });
      }
      GANN_LV.forEach((v, i) => {
        const c = CYCLE[i % CYCLE.length];
        const y = y1 + (y2 - y1) * v; const x = x1 + (x2 - x1) * v;
        paint.push({ k: 'line', a: [x1, y, x2, y], c, w: s.width });
        paint.push({ k: 'line', a: [x, y1, x, y2], c, w: s.width });
        paint.push({ k: 'text', x: x1 - 4, y: y + 4, s: v, c, fs: 10, anchor: 'end' });
        paint.push({ k: 'text', x, y: y1 - 4, s: v, c, fs: 10, anchor: 'middle' });
      });
      g.handles = [{ ...A, idx: 0 }, { ...B, idx: 1 }];
      return g;
    }
    case 'gannfan': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const dx = B.x - A.x; const dy = B.y - A.y;
      const rays = GANN_FAN.map(([r, lbl], i) => ({ p: ray(A, dx, dy / r, W), lbl, c: CYCLE[i % CYCLE.length] }));
      for (let i = 1; i < rays.length; i += 1) {
        const p = rays[i - 1].p; const q = rays[i].p;
        paint.push({ k: 'poly', pts: [[A.x, A.y], [p[2], p[3]], [q[2], q[3]]], fill: withAlpha(rays[i].c, 0.07) });
      }
      rays.forEach((r) => {
        g.segs.push(r.p);
        paint.push({ k: 'line', a: r.p, c: r.c, w: s.width, dash: s.lineStyle });
        const lx = A.x + dx * 1.15; const ly = A.y + (dy / (GANN_FAN.find((x) => x[1] === r.lbl)[0])) * 1.15;
        paint.push({ k: 'text', x: lx, y: ly, s: r.lbl, c: r.c, fs: 10, anchor: 'start' });
      });
      return g;
    }
    case 'pin': {
      const [A] = P;
      g.areas.push({ rect: [A.x - 9, A.y - 30, 18, 30] });
      g.handles = [];
      paint.push({ k: 'path', d: `M${A.x},${A.y} C${A.x - 3},${A.y - 10} ${A.x - 9},${A.y - 14} ${A.x - 9},${A.y - 21} A9,9 0 1 1 ${A.x + 9},${A.y - 21} C${A.x + 9},${A.y - 14} ${A.x + 3},${A.y - 10} ${A.x},${A.y} Z`, fill: col, c: 'none' });
      paint.push({ k: 'circle', cx: A.x, cy: A.y - 21, r: 3.5, fill: '#ffffff', c: 'none' });
      const txt = String(d.text || '').trim();
      if (txt) {
        const fs = s.fontSize || 13;
        const lines = txt.split('\n');
        const w = Math.max(...lines.map((l) => textW(l, fs))); const h = lines.length * fs * 1.3 + 10;
        g.bubble = { x: A.x - w / 2, y: A.y - 36 - h, w, h, lines, fs };
        g.areas.push({ rect: [A.x - w / 2, A.y - 36 - h, w, h], bubble: true });
      }
      return g;
    }
    case 'flag': {
      const [A] = P;
      g.areas.push({ rect: [A.x - 2, A.y - 28, 22, 28] });
      g.handles = [];
      paint.push({ k: 'line', a: [A.x, A.y, A.x, A.y - 28], c: col, w: 2 });
      paint.push({ k: 'path', d: `M${A.x},${A.y - 28} L${A.x + 18},${A.y - 28} L${A.x + 13},${A.y - 22} L${A.x + 18},${A.y - 16} L${A.x},${A.y - 16} Z`, fill: col, c: 'none' });
      return g;
    }
    case 'signpost': {
      const [A] = P;
      const fs = s.fontSize || 12;
      const txt = String(d.text || '').trim() || 'Signpost';
      const w = textW(txt, fs); const h = fs + 12;
      const top = A.y - 44;
      g.segs.push([A.x, A.y, A.x, top]);
      g.areas.push({ rect: [A.x - w / 2, top - h, w, h] });
      g.handles = [{ ...A, idx: 0 }];
      paint.push({ k: 'line', a: [A.x, A.y, A.x, top], c: col, w: 1.5 });
      paint.push({ k: 'circle', cx: A.x, cy: A.y, r: 3, fill: col, c: 'none' });
      paint.push({ k: 'rect', x: A.x - w / 2, y: top - h, w, h, rx: h / 2, fill: col });
      paint.push({ k: 'text', x: A.x, y: top - h / 2 + fs / 2 - 1, s: txt, c: s.textColor || '#fff', fs, anchor: 'middle', bold: true });
      return g;
    }
    case 'pricenote': {
      if (P.length < 2) return g;
      const [A, B] = P;
      const fs = s.fontSize || 12;
      const label = dm.fmtP(d.pts[0].p);
      const w = textW(label, fs); const h = fs + 10;
      g.segs.push([A.x, A.y, B.x, B.y]);
      g.areas.push({ rect: [B.x - w / 2, B.y - h / 2, w, h] });
      paint.push({ k: 'line', a: [A.x, A.y, B.x, B.y], c: col, w: s.width || 1, dash: s.lineStyle });
      paint.push({ k: 'circle', cx: A.x, cy: A.y, r: 3.5, fill: col, c: 'none' });
      paint.push({ k: 'rect', x: B.x - w / 2, y: B.y - h / 2, w, h, rx: 4, fill: col });
      paint.push({ k: 'text', x: B.x, y: B.y + fs / 2 - 1.5, s: label, c: s.textColor || '#fff', fs, anchor: 'middle' });
      return g;
    }
    default:
      return g;
  }
}

const DASHES = { solid: '', dashed: '6 4', dotted: '1.5 3.5' };

/* Примітиви → SVG. sel — показувати лише у вибраного (вуса кривих). */
export function paint(g, { selected, hovered, d }) {
  const o = [];
  (g.paint || []).forEach((p) => {
    if (p.sel && !selected) return;
    const dash = DASHES[p.dash] ?? '';
    const da = dash ? ` stroke-dasharray="${dash}"` : '';
    const st = p.c && p.c !== 'none' ? ` stroke="${p.c}" stroke-width="${p.w || 1}"${da}` : ' stroke="none"';
    if (p.k === 'line') o.push(`<line x1="${p.a[0]}" y1="${p.a[1]}" x2="${p.a[2]}" y2="${p.a[3]}"${st} stroke-linecap="round"/>`);
    if (p.k === 'path') o.push(`<path d="${p.d}" fill="${p.fill || 'none'}"${st} stroke-linecap="round" stroke-linejoin="round"/>`);
    if (p.k === 'poly') o.push(`<polygon points="${p.pts.map((q) => q.join(',')).join(' ')}" fill="${p.fill || 'none'}"${st}/>`);
    if (p.k === 'circle') o.push(`<circle cx="${p.cx}" cy="${p.cy}" r="${Math.max(0, p.r)}" fill="${p.fill || 'none'}"${st}/>`);
    if (p.k === 'rect') o.push(`<rect x="${p.x}" y="${p.y}" width="${Math.max(0, p.w)}" height="${Math.max(0, p.h)}" rx="${p.rx || 0}" fill="${p.fill || 'none'}"${p.c ? st : ''}/>`);
    if (p.k === 'text') o.push(`<text x="${p.x}" y="${p.y}" fill="${p.c}" font-size="${p.fs || 11}" font-weight="${p.bold ? 600 : 400}" text-anchor="${p.anchor || 'start'}" font-family="${FONT}">${esc(p.s)}</text>`);
  });
  /* Пін: текст видно, коли наводиш або вибрав — як у TV. */
  if (g.bubble && (selected || hovered)) {
    const b = g.bubble; const s = d.style || {};
    o.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="${s.bg || '#1e222d'}" stroke="${s.color || '#2962ff'}" stroke-width="1"/>`);
    b.lines.forEach((ln, i) => o.push(`<text x="${b.x + b.w / 2}" y="${b.y + 5 + b.fs + i * b.fs * 1.3 - 2}" fill="${s.textColor || '#fff'}" font-size="${b.fs}" text-anchor="middle" font-family="${FONT}">${esc(ln)}</text>`));
  }
  return o.join('');
}
