import { CrosshairMode } from 'lightweight-charts';
import { upperBound, lowerBound } from '../../../lib/candles/agg';
import { withAlpha } from '../../../lib/candles/chartPrefs';
import {
  TOOLS, newDrawing, distToSeg, extendSeg, DASH, esc,
} from '../../../lib/candles/drawings';
import { t as tx } from '../../../lib/lang';
import { EXTRA, extraGeom, paint as paintExtra, curveCtrls } from './DrawingExtra';

/* ==================================================================
   Малювання на графіку — мишка, геометрія, SVG.

   Події ловимо на контейнері графіка у фазі перехоплення: так ми
   встигаємо раніше за бібліотеку і, коли клік наш (ставимо точку,
   тягнемо лінію), гасимо його — графік не їде разом із лінією. Коли
   клік не наш (порожнє місце), пропускаємо далі, і графік тягнеться
   як завжди.

   Малюємо в той самий SVG-шар, що й позиції: рушій кличе svg() на
   кожен кадр, тож фігури їдуть разом зі зумом і прокруткою.
================================================================== */

const HANDLE = 5;
const HIT = 6;

const fmtSpan = (sec) => {
  const m = Math.round(Math.abs(sec) / 60);
  const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const mm = m % 60;
  const parts = [];
  if (d) parts.push(`${d}${tx('д', 'd')}`);
  if (h) parts.push(`${h}${tx('г', 'h')}`);
  if (mm || !parts.length) parts.push(`${mm}${tx('хв', 'm')}`);
  return parts.join(' ');
};

const isLightColor = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
};
const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(2)}K` : String(Math.round(v)));

/* Згладжена лінія через точки пензля: Catmull-Rom у кубічні Безьє. */
function smoothPath(P) {
  const f = (v) => v.toFixed(1);
  if (P.length < 3) return `M${f(P[0].x)},${f(P[0].y)} L${f(P[P.length - 1].x)},${f(P[P.length - 1].y)}`;
  let d = `M${f(P[0].x)},${f(P[0].y)}`;
  for (let i = 0; i < P.length - 1; i += 1) {
    const p0 = P[i - 1] || P[i]; const p1 = P[i]; const p2 = P[i + 1]; const p3 = P[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/* Які інструменти лишаються вибраними після фігури — як у TV:
   • за замовчуванням кожен інструмент — на одну фігуру, далі курсор;
   • «Режим малювання» (замок з олівцем) — усі лишаються до Esc;
   • пензель і маркер лишаються завжди: ними малюють кількома мазками. */
const KEEP_ALWAYS = new Set(['brush', 'highlighter']);

export default class DrawingManager {
  constructor(engine, host, cb) {
    this.e = engine;
    this.host = host;
    this.cb = cb;
    this.list = [];
    this.sel = null;
    this.hover = null;
    this.tool = null;
    this.cursor = 'cur-cross';
    this.magnet = 'off';
    this.keep = false;
    this.lockAll = false;
    this.hideAll = false;
    this.draft = null;
    this.drag = null;
    this.temp = null;
    this.mouse = null;
    this.defaults = {};
    this.past = [];
    this.futureStack = [];

    this.down = this.down.bind(this);
    this.move = this.move.bind(this);
    this.up = this.up.bind(this);
    this.dbl = this.dbl.bind(this);
    this.leave = this.leave.bind(this);
    this.ctx = this.ctx.bind(this);
    host.addEventListener('contextmenu', this.ctx, true);
    host.addEventListener('pointerdown', this.down, true);
    host.addEventListener('mousedown', this.swallow = (ev) => { if (this.ate) { ev.stopPropagation(); ev.preventDefault(); } }, true);
    host.addEventListener('touchstart', this.swallowT = (ev) => { if (this.ate) ev.stopPropagation(); }, true);
    window.addEventListener('pointermove', this.move, true);
    window.addEventListener('pointerup', this.up, true);
    host.addEventListener('dblclick', this.dbl, true);
    host.addEventListener('pointerleave', this.leave);
    this.applyCursor();
  }

  destroy() {
    this.host.removeEventListener('contextmenu', this.ctx, true);
    this.host.removeEventListener('pointerdown', this.down, true);
    this.host.removeEventListener('mousedown', this.swallow, true);
    this.host.removeEventListener('touchstart', this.swallowT, true);
    window.removeEventListener('pointermove', this.move, true);
    window.removeEventListener('pointerup', this.up, true);
    this.host.removeEventListener('dblclick', this.dbl, true);
    this.host.removeEventListener('pointerleave', this.leave);
  }

  /* ---------------- стан ---------------- */

  setList(list) {
    this.list = list || [];
    this.sel = null;
    this.draft = null;
    this.temp = null;
    this.past = [];
    this.futureStack = [];
    this.cb.onSelect?.(null);
  }

  /* У знімку угоди малюнки лише для перегляду — і нічого не пишемо. */
  changed() { if (!this.readOnly) this.cb.onChange?.(this.list); }

  snapshot() {
    this.past.push(JSON.stringify(this.list));
    if (this.past.length > 60) this.past.shift();
    this.futureStack = [];
  }

  undo() {
    if (!this.past.length) return;
    this.futureStack.push(JSON.stringify(this.list));
    this.list = JSON.parse(this.past.pop());
    this.select(this.list.find((d) => d.id === this.sel)?.id || null);
    this.changed();
  }

  redo() {
    if (!this.futureStack.length) return;
    this.past.push(JSON.stringify(this.list));
    this.list = JSON.parse(this.futureStack.pop());
    this.changed();
  }

  setTool(tool) {
    if (tool && this.readOnly) return;
    this.tool = tool;
    this.draft = null;
    if (tool) this.select(null);
    this.applyCursor();
    this.cb.onTool?.(tool);
  }

  setCursor(c) {
    this.cursor = c;
    this.setTool(null);
  }

  applyCursor() {
    const c = this.tool ? 'cur-cross' : this.cursor;
    this.host.dataset.cursor = c;
    /* Курсор «стрілка» — без перехрестя, як у TV. */
    const mode = c === 'cur-arrow' ? CrosshairMode.Hidden : (this.e.prefs.crosshair === 'magnet' ? CrosshairMode.Magnet : CrosshairMode.Normal);
    this.e.chart.applyOptions({ crosshair: { mode } });
  }

  get selected() { return this.list.find((d) => d.id === this.sel) || null; }

  select(id) {
    this.sel = id;
    this.cb.onSelect?.(this.selected);
  }

  update(id, patch, record = true) {
    const d = this.list.find((x) => x.id === id);
    if (!d) return;
    /* Тягнеш повзунок кольору — це одна дія, а не сотня кроків «назад». */
    const now = Date.now();
    if (record && now - (this.lastRec || 0) > 700) this.snapshot();
    if (record) this.lastRec = now;
    Object.assign(d, typeof patch === 'function' ? patch(d) : patch);
    if (d.id === this.sel) this.cb.onSelect?.(d);
    this.changed();
  }

  remove(id) {
    this.snapshot();
    this.list = this.list.filter((d) => d.id !== id);
    if (this.multi?.has(id)) { this.multi.delete(id); if (!this.multi.size) this.multi = null; }
    if (this.sel === id) this.select(null);
    this.changed();
  }

  removeAll() {
    if (!this.list.length) return;
    this.snapshot();
    this.list = [];
    this.select(null);
    this.changed();
  }

  /* Порядок малюнків: пізніший малюється поверх. */
  toFront(id) { const d = this.list.find((x) => x.id === id); if (!d) return; this.snapshot(); this.list = [...this.list.filter((x) => x !== d), d]; this.changed(); }

  toBack(id) { const d = this.list.find((x) => x.id === id); if (!d) return; this.snapshot(); this.list = [d, ...this.list.filter((x) => x !== d)]; this.changed(); }

  /* Правий клік по малюнку — меню, як у TV. По порожньому місцю —
     звичайне меню графіка не чіпаємо. */
  ctx(ev) {
    if (!this.ready || this.draft) return;
    const m = this.local(ev);
    if (!this.inPlot(m)) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (this.tool) { this.setTool(null); return; }
    const h = this.readOnly ? null : this.hit(m.x, m.y);
    if (h) {
      this.select(h.id);
      this.cb.onContext?.({ id: h.id, x: m.x, y: m.y });
      return;
    }
    /* Порожнє місце графіка — меню графіка, як у TV: ціна й час під курсором. */
    const pt = this.pointAt(m.x, m.y, { magnet: false });
    this.cb.onContext?.({ chart: true, x: m.x, y: m.y, price: this.e.series.coordinateToPrice(m.y), t: pt.t });
  }

  /* Буфер обміну малюнків (Ctrl+C / Ctrl+V). */
  copy(id) {
    const d = this.list.find((x) => x.id === id);
    if (d) this.clip = JSON.stringify(d);
  }

  /* Вставити скопійоване. at — точка (час/ціна), куди стане перша
     точка малюнка; без неї — поруч з оригіналом, як «Копія». */
  paste(at = null) {
    if (!this.clip || this.readOnly) return false;
    const src = JSON.parse(this.clip);
    const sec = this.e.agg?.sec || 60;
    const dt = at ? at.t - src.pts[0].t : sec * 5;
    const dp = at ? at.p - src.pts[0].p : 0;
    const copy = { ...src, id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, hidden: false };
    copy.pts = src.pts.map((q) => ({ t: q.t + dt, p: q.p + dp }));
    this.snapshot();
    this.list.push(copy);
    this.select(copy.id);
    this.changed();
    return true;
  }

  /* Поставити однокліковий інструмент у точку (з меню графіка). */
  addAt(type, pt) {
    if (this.readOnly) return;
    this.place(newDrawing(type, [pt], this.defaults));
  }

  /* Показати малюнок: прокрутити графік до його першої точки. */
  reveal(id) {
    const d = this.list.find((x) => x.id === id);
    if (!d || !this.e.agg) return;
    const ts = this.e.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const span = r ? r.to - r.from : 120;
    const l = this.absOf(d.pts[0].t) - this.e.win;
    if (l < 0) return;
    ts.setVisibleLogicalRange({ from: l - span / 2, to: l + span / 2 });
    this.select(id);
  }

  clone(id) {
    const d = this.list.find((x) => x.id === id);
    if (!d) return;
    this.snapshot();
    const sec = this.e.agg?.sec || 60;
    const copy = { ...JSON.parse(JSON.stringify(d)), id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` };
    copy.pts = copy.pts.map((q) => ({ t: q.t + sec * 5, p: q.p }));
    this.list.push(copy);
    this.select(copy.id);
    this.changed();
  }

  /* ---------------- координати ---------------- */

  get ready() { return !!(this.e.agg && this.e.base); }

  plot() {
    const ts = this.e.chart.timeScale();
    return { w: ts.width(), h: this.e.chart.paneSize(0).height };
  }

  absOf(t) {
    const a = this.e.agg; const sec = a.sec; const last = this.e.lastK;
    if (t <= a.t[0]) return (t - a.t[0]) / sec;
    if (t >= a.t[last]) return last + (t - a.t[last]) / sec;
    const k = upperBound(a.t, t, 0, last + 1) - 1;
    const span = Math.max(sec, (a.t[k + 1] ?? a.t[k] + sec) - a.t[k]);
    return k + Math.min(0.999, (t - a.t[k]) / span);
  }

  timeOf(abs) {
    const a = this.e.agg; const sec = a.sec; const last = this.e.lastK;
    if (abs <= 0) return a.t[0] + abs * sec;
    if (abs >= last) return a.t[last] + (abs - last) * sec;
    const k = Math.floor(abs);
    const span = Math.max(sec, a.t[k + 1] - a.t[k]);
    return a.t[k] + (abs - k) * span;
  }

  /* Бібліотека перетворює в координату лише цілі індекси (дробовий дає
     0), а точка малюнка може бути між свічками: інтерполюємо самі. */
  lx(l) {
    const ts = this.e.chart.timeScale();
    const f = Math.floor(l);
    const x0 = ts.logicalToCoordinate(f);
    if (x0 == null || l === f) return x0;
    const x1 = ts.logicalToCoordinate(f + 1);
    return x1 == null ? x0 : x0 + (x1 - x0) * (l - f);
  }

  x(t) { return this.lx(this.absOf(t) - this.e.win); }
  y(p) { return this.e.series.priceToCoordinate(p); }

  /* Точка з мишки. Час — на свічку (як у TV), ціна — з магнітом. */
  pointAt(px, py, { snapTime = true, magnet = true } = {}) {
    const ts = this.e.chart.timeScale();
    /* Бібліотека віддає індекс свічки цілим — для пензля це давало
       «сходинки» (усі точки однієї свічки ставали в одну x). Добираємо
       дробову частину самі з відстані до центру свічки. */
    let l = ts.coordinateToLogical(px);
    if (l != null) {
      const x0 = ts.logicalToCoordinate(Math.round(l));
      const x1 = ts.logicalToCoordinate(Math.round(l) + 1);
      if (x0 != null && x1 != null && x1 !== x0) l = Math.round(l) + (px - x0) / (x1 - x0);
    }
    let abs = (l ?? 0) + this.e.win;
    if (snapTime) abs = Math.round(abs);
    const t = this.timeOf(abs);
    let p = this.e.series.coordinateToPrice(py);
    const mode = this.magnet;
    if (magnet && mode !== 'off') {
      const k = Math.round(abs);
      if (k >= 0 && k <= this.e.lastK) {
        const b = this.e.bar(k);
        let best = null; let bd = Infinity;
        for (const v of [b.open, b.high, b.low, b.close]) {
          const yy = this.y(v);
          const dd = Math.abs(yy - py);
          if (dd < bd) { bd = dd; best = v; }
        }
        if (mode === 'strong' || bd < 18) p = best;
      }
    }
    return { t, p };
  }

  local(ev) {
    const r = this.host.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  inPlot({ x, y }) {
    const { w, h } = this.plot();
    return x >= 0 && y >= 0 && x <= w && y <= h;
  }

  visible(d) {
    if (this.hideAll || d.hidden) return false;
    return !d.vis || d.vis[this.e.tf] !== false;
  }

  /* ---------------- мишка ---------------- */

  eat(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    this.ate = true;
  }

  down(ev) {
    this.ate = false;
    if (!this.ready || this.e.selecting || ev.button !== 0 || this.readOnly) return;
    const m = this.local(ev);
    if (!this.inPlot(m)) return;
    this.mouse = m;
    this.downAt = m;

    /* Тимчасова лінійка й зум зникають з наступним кліком. */
    if (this.temp && !this.draft) { this.temp = null; }

    if (this.tool || (ev.shiftKey && !this.draft)) {
      this.eat(ev);
      const tool = this.tool || 'measure';
      const def = TOOLS[tool];
      const pt = this.pointAt(m.x, m.y, { snapTime: tool !== 'brush' && tool !== 'highlighter' });
      if (def.points === 0) {
        this.draft = newDrawing(tool, [pt], this.defaults);
        this.draft.free = true;
        return;
      }
      if (!this.draft) {
        if (def.points === 1) { this.place(newDrawing(tool, [pt], this.defaults)); return; }
        this.draft = newDrawing(tool, [pt, { ...pt }], this.defaults);
        this.draft.tool = tool;
        return;
      }
      const d = this.draft;
      d.pts[d.pts.length - 1] = pt;
      if (def.points === -1 || d.pts.length < def.points) d.pts.push({ ...pt });
      else this.place(d);
      return;
    }

    const hit = this.hit(m.x, m.y);
    /* Ctrl/Cmd: рамка виділення, як у TV, або додати/зняти малюнок з
       виділення кліком. */
    if ((ev.ctrlKey || ev.metaKey) && this.cursor !== 'eraser') {
      this.eat(ev);
      if (hit) {
        /* Як у TV: Ctrl+клік — додати/зняти з виділення, Ctrl+тягнути —
           копія малюнка. Що саме — вирішуємо, коли мишка зрушить. */
        this.ctrlHit = { id: hit.id, start: m };
      } else {
        this.marquee = { x0: m.x, y0: m.y, x1: m.x, y1: m.y };
      }
      return;
    }
    if (this.cursor === 'eraser') {
      if (hit) { this.eat(ev); this.remove(hit.id); }
      return;
    }
    if (hit) {
      this.eat(ev);
      this.select(hit.id);
      const d = this.selected;
      if (d.locked || this.lockAll) return;
      /* Тягнеш один з виділених рамкою — їдуть усі. */
      const group = this.multi?.has(d.id) && hit.part === 'body'
        ? this.list.filter((x) => this.multi.has(x.id) && x.id !== d.id && !x.locked).map((x) => ({ id: x.id, orig: JSON.parse(JSON.stringify(x.pts)) }))
        : null;
      if (!group) this.setMulti(null);
      else this.sel = d.id;
      this.drag = { id: d.id, part: hit.part, idx: hit.idx, start: m, orig: JSON.parse(JSON.stringify(d.pts)), moved: false, before: JSON.stringify(this.list), group };
    } else {
      if (this.sel) this.select(null);
      this.setMulti(null);
    }
  }

  move(ev) {
    if (!this.ready) return;
    const m = this.local(ev);
    this.mouse = m;
    if (this.marquee) {
      ev.stopPropagation();
      this.marquee.x1 = m.x; this.marquee.y1 = m.y;
      return;
    }
    if (this.ctrlHit && (ev.buttons & 1)) {
      ev.stopPropagation();
      const ch = this.ctrlHit;
      if (Math.hypot(m.x - ch.start.x, m.y - ch.start.y) < 4) return;
      this.ctrlHit = null;
      const src = this.list.find((x) => x.id === ch.id);
      if (!src) return;
      const before = JSON.stringify(this.list);
      const copy = { ...JSON.parse(JSON.stringify(src)), id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` };
      this.list.push(copy);
      this.setMulti(null);
      this.select(copy.id);
      this.drag = { id: copy.id, part: 'body', start: ch.start, orig: JSON.parse(JSON.stringify(copy.pts)), moved: false, before };
      this.dragTo(m, ev.shiftKey);
      return;
    }
    if (this.drag) {
      ev.stopPropagation();
      this.dragTo(m, ev.shiftKey);
      return;
    }
    if (this.draft) {
      const d = this.draft;
      if (d.free) {
        if (!(ev.buttons & 1)) return;
        ev.stopPropagation();
        const last = d.pts[d.pts.length - 1];
        const lx = this.x(last.t); const ly = this.y(last.p);
        if (lx == null || Math.hypot(lx - m.x, ly - m.y) > 4) d.pts.push(this.pointAt(m.x, m.y, { snapTime: false, magnet: false }));
        return;
      }
      let pt = this.pointAt(m.x, m.y);
      /* Shift — рівно горизонтально, як у TV. */
      if (ev.shiftKey && d.pts.length >= 2) pt = { ...pt, p: d.pts[d.pts.length - 2].p };
      d.pts[d.pts.length - 1] = pt;
      return;
    }
    if (!this.inPlot(m) || ev.buttons) { if (this.hover) { this.hover = null; this.setHostCursor(); } return; }
    const h = this.hit(m.x, m.y);
    const id = h ? `${h.id}:${h.part}` : null;
    if (id !== this.hoverKey) {
      this.hoverKey = id;
      this.hover = h;
      this.setHostCursor();
    }
  }

  up(ev) {
    if (!this.ready) return;
    const m = this.local(ev);
    if (this.ctrlHit) {
      const id = this.ctrlHit.id;
      this.ctrlHit = null;
      ev.stopPropagation();
      const set = new Set(this.multi || []);
      if (this.sel && !set.size) set.add(this.sel);
      if (set.has(id)) set.delete(id); else set.add(id);
      this.setMulti(set);
      return;
    }
    if (this.marquee) {
      const q = this.marquee;
      this.marquee = null;
      ev.stopPropagation();
      const x1 = Math.min(q.x0, m.x); const x2 = Math.max(q.x0, m.x);
      const y1 = Math.min(q.y0, m.y); const y2 = Math.max(q.y0, m.y);
      if (x2 - x1 < 3 && y2 - y1 < 3) { this.setMulti(null); return; }
      /* Малюнок у виділенні, якщо його рамка перетинає прямокутник. */
      const ids = this.list.filter((d) => {
        if (!this.visible(d)) return false;
        const b = this.bbox(d);
        return b && b.x2 >= x1 && b.x1 <= x2 && b.y2 >= y1 && b.y1 <= y2;
      }).map((d) => d.id);
      this.setMulti(new Set(ids));
      return;
    }
    if (this.drag) {
      const dr = this.drag;
      this.drag = null; this.e.unglue?.();
      if (dr.moved) {
        this.past.push(dr.before);
        this.futureStack = [];
        this.changed();
        this.cb.onSelect?.(this.selected);
      }
      ev.stopPropagation();
      return;
    }
    const d = this.draft;
    if (!d) return;
    if (d.free) { if (d.pts.length > 1) this.place(d); else this.draft = null; return; }
    /* Клік-протягування-відпустив для двоточкових — теж ставить фігуру. */
    const def = TOOLS[d.type];
    if (def.points === 2 && d.pts.length === 2 && this.downAt && Math.hypot(m.x - this.downAt.x, m.y - this.downAt.y) > 8) {
      d.pts[1] = this.pointAt(m.x, m.y);
      this.place(d);
    }
  }

  dbl(ev) {
    if (!this.ready || this.readOnly) return;
    const d = this.draft;
    if (d && TOOLS[d.type].points === -1) {
      this.eat(ev);
      d.pts.pop();
      while (d.pts.length > 2 && JSON.stringify(d.pts[d.pts.length - 1]) === JSON.stringify(d.pts[d.pts.length - 2])) d.pts.pop();
      if (d.pts.length >= 2) this.place(d); else this.draft = null;
      return;
    }
    const m = this.local(ev);
    const h = this.hit(m.x, m.y);
    if (h) {
      this.eat(ev);
      this.select(h.id);
      const sel = this.selected;
      if (TOOLS[sel.type].text) this.cb.onText?.(sel);
      else this.cb.onSettings?.(sel);
    }
  }

  leave() { this.mouse = null; }

  /* Готова фігура — у список. */
  place(d) {
    this.draft = null;
    const def = TOOLS[d.type];
    if (d.type === 'long' || d.type === 'short') {
      d.pts = this.positionPts(d.type, d.pts[0]);
      /* У реплеї позиція з інструмента — це майбутня угода: віддаємо її
         в панель угоди (чернетка з тими самими рівнями), а не лишаємо
         окремим малюнком. */
      if (this.cb.onPosTool?.(d)) {
        if (!this.keepTool(d.type)) this.setTool(null);
        return;
      }
    }
    if (def.temp) {
      if (d.type === 'zoom') this.applyZoom(d);
      else this.temp = d;
      if (!this.keepTool(d.type)) this.setTool(null);
      return;
    }
    delete d.free; delete d.tool;
    if ((d.type === 'curve' || d.type === 'dcurve') && d.pts.length === 2) {
      /* Як у TV: ставиш два кінці, а вигин — ручками посередині. */
      const A = { x: this.x(d.pts[0].t), y: this.y(d.pts[0].p) };
      const B = { x: this.x(d.pts[1].t), y: this.y(d.pts[1].p) };
      if (A.x != null && B.x != null && A.y != null && B.y != null) {
        curveCtrls(d.type, A, B).forEach((c) => d.pts.push(this.pointAt(c.x, c.y, { snapTime: false, magnet: false })));
      }
    }
    this.snapshot();
    this.list.push(d);
    this.select(d.id);
    this.changed();
    if (!this.keepTool(d.type)) this.setTool(null);
    if (def.text) this.cb.onText?.(d);
  }

  keepTool(type) {
    if (KEEP_ALWAYS.has(type)) return true;
    /* Лінійка й зум — тимчасові, їх режим малювання не тримає. */
    if (type === 'measure' || type === 'zoom') return false;
    return !!this.keep;
  }

  positionPts(type, pt) {
    const sec = this.e.agg.sec;
    const dist = this.e.defaultDistance() * (this.e.prefs.atrMult || 1);
    const rr = this.e.prefs.rr || 2;
    const dir = type === 'long' ? 1 : -1;
    const t2 = pt.t + sec * 30;
    return [{ t: pt.t, p: pt.p }, { t: t2, p: pt.p + dir * dist * rr }, { t: t2, p: pt.p - dir * dist }];
  }

  applyZoom(d) {
    const a = this.absOf(d.pts[0].t) - this.e.win;
    const b = this.absOf(d.pts[1].t) - this.e.win;
    if (Math.abs(b - a) < 2) return;
    this.e.chart.timeScale().setVisibleLogicalRange({ from: Math.min(a, b), to: Math.max(a, b) });
  }

  dragTo(m, shift) {
    this.dragTo0(m, shift);
    const dr = this.drag;
    if (dr?.moved && dr.part === 'point') {
      const d = this.list.find((x) => x.id === dr.id);
      const q = d?.pts[dr.idx];
      this.e.glue?.(q ? q.p : this.e.series.coordinateToPrice(m.y), m.x);
    }
  }

  dragTo0(m, shift) {
    const dr = this.drag;
    const d = this.list.find((x) => x.id === dr.id);
    if (!d) return;
    if (!dr.moved && Math.hypot(m.x - dr.start.x, m.y - dr.start.y) < 3) return;
    dr.moved = true;
    if (dr.part === 'point') {
      let pt = this.pointAt(m.x, m.y);
      if (shift && d.pts.length > 1) pt = { ...pt, p: d.pts[dr.idx === 0 ? 1 : 0].p };
      if (d.type === 'long' || d.type === 'short') {
        const o = dr.orig;
        if (dr.idx === 0) {
          const dp = pt.p - o[0].p;
          d.pts = [{ t: pt.t, p: pt.p }, { t: o[1].t, p: o[1].p + dp }, { t: o[2].t, p: o[2].p + dp }];
        } else if (dr.idx === 1) d.pts[1] = { ...d.pts[1], p: pt.p };
        else if (dr.idx === 2) d.pts[2] = { ...d.pts[2], p: pt.p };
        else { d.pts[1] = { ...d.pts[1], t: Math.max(pt.t, o[0].t + this.e.agg.sec) }; d.pts[2] = { ...d.pts[2], t: d.pts[1].t }; }
        return;
      }
      if (d.type === 'rect' && dr.idx >= 10) {
        /* Межі рамки з початкових точок: ліво/право — час, верх/низ — ціна. */
        const o = dr.orig;
        let tL = Math.min(o[0].t, o[1].t); let tR = Math.max(o[0].t, o[1].t);
        let pT = Math.max(o[0].p, o[1].p); let pB = Math.min(o[0].p, o[1].p);
        const k = dr.idx;
        if (k === 10 || k === 16 || k === 17) tL = pt.t;
        if (k === 12 || k === 13 || k === 14) tR = pt.t;
        if (k === 10 || k === 11 || k === 12) pT = pt.p;
        if (k === 14 || k === 15 || k === 16) pB = pt.p;
        d.pts = [{ t: tL, p: pT }, { t: tR, p: pB }];
        return;
      }
      if (d.type === 'channel' && dr.idx === 2) {
        d.pts[2] = { t: d.pts[2].t, p: pt.p };
        return;
      }
      d.pts[dr.idx] = pt;
      return;
    }
    /* Тягнемо всю фігуру: зсув у свічках і в ціні від точки старту. */
    const ts = this.e.chart.timeScale();
    const l0 = ts.coordinateToLogical(dr.start.x); const l1 = ts.coordinateToLogical(m.x);
    const dAbs = Math.round((l1 ?? 0) - (l0 ?? 0));
    const p0 = this.e.series.coordinateToPrice(dr.start.y); const p1 = this.e.series.coordinateToPrice(m.y);
    const dp = (p1 ?? 0) - (p0 ?? 0);
    const free = d.type === 'brush' || d.type === 'highlighter';
    const shift2 = (x, orig) => orig.map((q) => {
      const fr = x.type === 'brush' || x.type === 'highlighter';
      const abs = this.absOf(q.t) + dAbs;
      return { t: fr ? q.t + dAbs * this.e.agg.sec : this.timeOf(abs), p: q.p + (x.type === 'vline' ? 0 : dp) };
    });
    d.pts = dr.orig.map((q) => {
      const abs = this.absOf(q.t) + dAbs;
      return { t: free ? q.t + dAbs * this.e.agg.sec : this.timeOf(abs), p: q.p + (d.type === 'vline' ? 0 : dp) };
    });
    (dr.group || []).forEach((gx) => {
      const x = this.list.find((y) => y.id === gx.id);
      if (x) x.pts = shift2(x, gx.orig);
    });
  }

  /* ---------------- виділення кількох ---------------- */

  setMulti(set) {
    const next = set && set.size ? set : null;
    if (!next && !this.multi) return;
    this.multi = next;
    if (next && next.size === 1) this.select([...next][0]);
    else if (next) this.select(null);
    this.cb.onMulti?.(next ? next.size : 0);
  }

  removeMulti() {
    if (!this.multi?.size) return;
    this.snapshot();
    const ids = this.multi;
    this.list = this.list.filter((d) => !ids.has(d.id));
    this.multi = null;
    this.select(null);
    this.cb.onMulti?.(0);
    this.changed();
  }

  /* Прямокутник, що охоплює малюнок, у пікселях. */
  bbox(d) {
    const g = this.geom(d);
    if (!g) return null;
    const xs = []; const ys = [];
    g.segs.forEach(([a, b, c, e]) => { xs.push(a, c); ys.push(b, e); });
    g.areas.forEach((a) => {
      if (a.rect) { const [rx, ry, rw, rh] = a.rect; xs.push(rx, rx + rw); ys.push(ry, ry + rh); }
      if (a.poly) a.poly.forEach(([px, py]) => { xs.push(px); ys.push(py); });
      const cr = a.circ || a.ring;
      if (cr) { const [cx, cy, r] = cr; xs.push(cx - r, cx + r); ys.push(cy - r, cy + r); }
    });
    d.pts.forEach((q) => { const x = this.x(q.t); const y = this.y(q.p); if (x != null && y != null) { xs.push(x); ys.push(y); } });
    if (!xs.length) return null;
    return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
  }

  setHostCursor() {
    const h = this.hover;
    if (this.tool || !h) { this.host.style.removeProperty('--draw-cursor'); this.host.dataset.over = ''; return; }
    if (this.cursor === 'eraser') { this.host.dataset.over = 'erase'; return; }
    const d = this.list.find((x) => x.id === h.id);
    const locked = d?.locked || this.lockAll;
    this.host.dataset.over = locked ? 'pointer' : (h.part === 'point' ? 'point' : 'move');
  }

  /* Сума обсягу хвилинок між двома часами (для діапазонів). */
  volBetween(t1, t2) {
    const b = this.e.base;
    if (!b?.v) return null;
    const a = Math.min(t1, t2); const z = Math.max(t1, t2);
    const lastI = (this.e.cut ?? b.n) - 1;
    let sum = 0;
    for (let i = lowerBound(b.t, a); i <= lastI && b.t[i] < z; i += 1) sum += b.v[i];
    return sum;
  }

  /* Результат «паперової» угоди з інструмента позиції: перша хвилинка
     після входу, що торкнулась стопу чи тейку (стоп першим, якщо обидва
     в одній), у межах рамки й лише серед уже показаних свічок. */
  positionOutcome(d) {
    const e = this.e; const b = e.base;
    if (!b || !e.agg) return null;
    const [en, tp, sl] = d.pts;
    const long = d.type === 'long';
    const tEnd = d.pts[1].t;
    const lastI = (e.cut ?? b.n) - 1;
    let i = lowerBound(b.t, en.t + 60);
    if (i > lastI) return null;
    const risk = Math.abs(en.p - sl.p) || 1e-9;
    const R = (px) => ((long ? px - en.p : en.p - px) / risk);
    for (; i <= lastI && b.t[i] <= tEnd; i += 1) {
      const hitSl = long ? b.l[i] <= sl.p : b.h[i] >= sl.p;
      const hitTp = long ? b.h[i] >= tp.p : b.l[i] <= tp.p;
      if (hitSl || hitTp) {
        const px = hitSl ? sl.p : tp.p;
        return { closed: true, price: px, r: R(px), x: this.x(b.t[i]) };
      }
    }
    const j = Math.min(i - 1, lastI);
    if (j < 0) return null;
    return { closed: b.t[j] >= tEnd, price: b.c[j], r: R(b.c[j]), x: this.x(b.t[j]) };
  }

  /* Мітки вибраного малюнка на шкалах, як у TV: ціни точок на шкалі
     цін і час точок на шкалі часу (синім), між ними — блакитна смуга. */
  axisSvg(plotW, plotH) {
    const d = this.selected;
    if (!d || !this.visible(d) || !this.ready) return '';
    const ch = this.e.chart;
    const pw = ch.priceScale('right').width();
    const th = ch.timeScale().height();
    const FONT = "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif";
    const fs = this.e.prefs.fontSize || 11;
    const o = [];
    const noPrice = d.type === 'vline';
    const noTime = d.type === 'hline' || d.type === 'hray';
    const prices = noPrice ? [] : [...new Set(d.pts.map((q) => q.p))].map((p) => ({ p, y: this.y(p) })).filter((q) => q.y != null);
    const times = noTime ? [] : [...new Set(d.pts.map((q) => q.t))].map((t) => ({ t, x: this.x(t) })).filter((q) => q.x != null);
    if (prices.length > 1) {
      const ys = prices.map((q) => q.y);
      const y1 = Math.max(0, Math.min(...ys)); const y2 = Math.min(plotH, Math.max(...ys));
      if (y2 > y1) o.push(`<rect x="${plotW}" y="${y1}" width="${pw}" height="${y2 - y1}" fill="rgba(41,98,255,0.18)"/>`);
    }
    if (times.length > 1) {
      const xs = times.map((q) => q.x);
      const x1 = Math.max(0, Math.min(...xs)); const x2 = Math.min(plotW, Math.max(...xs));
      if (x2 > x1) o.push(`<rect x="${x1}" y="${plotH}" width="${x2 - x1}" height="${th}" fill="rgba(41,98,255,0.18)"/>`);
    }
    prices.forEach(({ p, y }) => {
      if (y < 0 || y > plotH) return;
      const h = fs + 6;
      o.push(`<rect x="${plotW + 1}" y="${y - h / 2}" width="${pw - 2}" height="${h}" rx="2" fill="#2962ff"/><text x="${plotW + pw / 2}" y="${y + fs / 2 - 1}" fill="#fff" font-size="${fs}" text-anchor="middle" font-family="${FONT}">${esc(this.fmtP(p))}</text>`);
    });
    times.forEach(({ t, x }) => {
      if (x < 0 || x > plotW) return;
      const txt = this.e.fmtTime?.(Math.round(t)) || '';
      const w = txt.length * fs * 0.6 + 12;
      o.push(`<rect x="${x - w / 2}" y="${plotH + 2}" width="${w}" height="${th - 4}" rx="2" fill="#2962ff"/><text x="${x}" y="${plotH + th / 2 + fs / 2 - 1}" fill="#fff" font-size="${fs}" text-anchor="middle" font-family="${FONT}">${esc(txt)}</text>`);
    });
    return o.join('');
  }

  /* ---------------- геометрія й попадання ---------------- */

  /* Усе, що треба і для малювання, і для кліку: відрізки, області,
     ручки. Координати — пікселі області графіка. */
  geom(d) {
    const W = this.plot().w; const H = this.plot().h;
    const P = d.pts.map((q) => ({ x: this.x(q.t), y: this.y(q.p) }));
    if (P.some((q) => q.x == null || q.y == null)) return null;
    const g = { segs: [], areas: [], handles: P.map((q, i) => ({ ...q, idx: i })) };
    const s = d.style || {};
    if (EXTRA.has(d.type)) { extraGeom(this, d, P, g); g.P = P; return g; }
    switch (d.type) {
      case 'trend': case 'ray': case 'extended': case 'info': case 'angle': case 'arrow': {
        if (P.length < 2) return g;
        const [ax, ay, bx, by] = extendSeg(P[0].x, P[0].y, P[1].x, P[1].y, W, s.extendLeft, s.extendRight);
        g.segs.push([ax, ay, bx, by]);
        break;
      }
      case 'path': case 'brush': case 'highlighter':
        for (let i = 1; i < P.length; i += 1) g.segs.push([P[i - 1].x, P[i - 1].y, P[i].x, P[i].y]);
        if (d.type !== 'path') g.handles = P.length > 1 ? [{ ...P[0], idx: -1, only: true }, { ...P[P.length - 1], idx: -1, only: true }] : [];
        break;
      case 'hline':
        g.segs.push([0, P[0].y, W, P[0].y]);
        /* Одна квадратна ручка біля правого краю, як у TV. */
        g.handles = [{ x: Math.max(20, W - 70), y: P[0].y, idx: 0, sq: true }];
        break;
      case 'hray':
        g.segs.push([P[0].x, P[0].y, W, P[0].y]);
        break;
      case 'vline':
        g.segs.push([P[0].x, 0, P[0].x, H]);
        g.handles = [{ x: P[0].x, y: Math.min(H - 12, Math.max(12, P[0].y)), idx: 0 }];
        break;
      case 'cross':
        g.segs.push([0, P[0].y, W, P[0].y], [P[0].x, 0, P[0].x, H]);
        break;
      case 'channel': {
        if (P.length < 2) return g;
        const off = P.length > 2 ? this.channelOffset(d, P) : 0;
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]);
        if (P.length > 2) {
          g.segs.push([P[0].x, P[0].y + off, P[1].x, P[1].y + off]);
          g.areas.push({ poly: [[P[0].x, P[0].y], [P[1].x, P[1].y], [P[1].x, P[1].y + off], [P[0].x, P[0].y + off]] });
          g.handles = [{ ...P[0], idx: 0 }, { ...P[1], idx: 1 }, { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 + off, idx: 2 }];
          g.off = off;
        }
        break;
      }
      case 'rect': case 'ellipse': case 'prange': case 'drange': case 'dprange': case 'measure': case 'zoom': {
        if (P.length < 2) return g;
        let x1 = Math.min(P[0].x, P[1].x); let x2 = Math.max(P[0].x, P[1].x);
        const y1 = Math.min(P[0].y, P[1].y); const y2 = Math.max(P[0].y, P[1].y);
        if (d.type === 'rect') { if (s.extendLeft) x1 = 0; if (s.extendRight) x2 = W; }
        g.box = { x1, x2, y1, y2 };
        g.areas.push({ rect: [x1, y1, x2 - x1, y2 - y1] });
        if (d.type === 'rect') {
          /* Як у TV: 4 кути й 4 середини сторін. Кут тягне дві сторони,
             середина — одну. */
          const bx1 = Math.min(P[0].x, P[1].x); const bx2 = Math.max(P[0].x, P[1].x);
          const mx = (bx1 + bx2) / 2; const my = (y1 + y2) / 2;
          g.handles = [
            { x: bx1, y: y1, idx: 10 }, { x: mx, y: y1, idx: 11, sq: true }, { x: bx2, y: y1, idx: 12 }, { x: bx2, y: my, idx: 13, sq: true },
            { x: bx2, y: y2, idx: 14 }, { x: mx, y: y2, idx: 15, sq: true }, { x: bx1, y: y2, idx: 16 }, { x: bx1, y: my, idx: 17, sq: true },
          ];
        }
        break;
      }
      case 'fib': case 'fibext': {
        if (P.length < 2) return g;
        const lv = this.fibPrices(d);
        const xs = d.type === 'fib' ? [P[0].x, P[1].x] : [P[2]?.x ?? P[1].x, (P[2]?.x ?? P[1].x) + Math.abs(P[1].x - P[0].x)];
        let x1 = Math.min(...xs); let x2 = Math.max(...xs);
        if (s.extendLeft) x1 = 0;
        if (s.extendRight) x2 = W;
        g.fib = { x1, x2, lv };
        lv.forEach((l) => { const yy = this.y(l.price); if (yy != null) g.segs.push([x1, yy, x2, yy]); });
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]);
        if (P[2]) g.segs.push([P[1].x, P[1].y, P[2].x, P[2].y]);
        break;
      }
      case 'regression': {
        if (P.length < 2) return g;
        const r = this.regress(d);
        if (!r) { g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); break; }
        g.segs.push(...r.lines);
        g.areas.push({ poly: r.poly });
        g.handles = [{ x: r.lines[0][0], y: r.lines[0][1], idx: 0 }, { x: r.lines[0][2], y: r.lines[0][3], idx: 1 }];
        break;
      }
      case 'flat': {
        if (P.length < 3) { if (P.length > 1) g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); break; }
        const y2 = P[2].y;
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y], [P[0].x, y2, P[1].x, y2]);
        g.areas.push({ poly: [[P[0].x, P[0].y], [P[1].x, P[1].y], [P[1].x, y2], [P[0].x, y2]] });
        g.handles = [{ ...P[0], idx: 0 }, { ...P[1], idx: 1 }, { x: (P[0].x + P[1].x) / 2, y: y2, idx: 2, sq: true }];
        break;
      }
      case 'disjoint': {
        if (P.length < 3) { if (P.length > 1) g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); break; }
        const Q = P.length > 3 ? P[3] : { x: P[2].x + (P[1].x - P[0].x), y: P[2].y + (P[1].y - P[0].y) };
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y], [P[2].x, P[2].y, Q.x, Q.y]);
        g.areas.push({ poly: [[P[0].x, P[0].y], [P[1].x, P[1].y], [Q.x, Q.y], [P[2].x, P[2].y]] });
        break;
      }
      case 'pitchfork': case 'schiff': case 'modschiff': case 'inside': {
        if (P.length < 3) { if (P.length > 1) g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); break; }
        const mx = (P[1].x + P[2].x) / 2; const my = (P[1].y + P[2].y) / 2;
        /* Звідки йде медіана: класичні — з першої точки; Шифф — по ціні
           посередині між 1-ю і 2-ю; модифікований Шифф — середина 1–2;
           внутрішні — середина між 1-ю точкою й серединою 2–3. */
        const O = d.type === 'schiff' ? { x: P[0].x, y: (P[0].y + P[1].y) / 2 }
          : d.type === 'modschiff' ? { x: (P[0].x + P[1].x) / 2, y: (P[0].y + P[1].y) / 2 }
            : d.type === 'inside' ? { x: (P[0].x + mx) / 2, y: (P[0].y + my) / 2 } : P[0];
        const dx = mx - O.x; const dy = my - O.y;
        const k = dx > 1 ? Math.max(1, (W + 400 - O.x) / dx) : 1;
        const far = (o) => [o.x, o.y, o.x + dx * k, o.y + dy * k];
        const m = far(O); const u = far(P[1]); const l = far(P[2]);
        g.segs.push(m, u, l, [P[1].x, P[1].y, P[2].x, P[2].y]);
        if (O !== P[0]) g.segs.push([P[0].x, P[0].y, O.x, O.y]);
        g.areas.push({ poly: [[m[0], m[1]], [m[2], m[3]], [u[2], u[3]], [u[0], u[1]], [mx, my]] }, { poly: [[m[0], m[1]], [m[2], m[3]], [l[2], l[3]], [l[0], l[1]], [mx, my]] });
        g.fork = { m, u, l };
        break;
      }
      case 'rotrect': {
        if (P.length < 3) { if (P.length > 1) g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]); break; }
        const q = this.rotCorners(P);
        g.areas.push({ poly: q });
        g.segs.push([q[0][0], q[0][1], q[1][0], q[1][1]], [q[1][0], q[1][1], q[2][0], q[2][1]], [q[2][0], q[2][1], q[3][0], q[3][1]], [q[3][0], q[3][1], q[0][0], q[0][1]]);
        g.rot = q;
        break;
      }
      case 'triangle': case 'polyline': {
        if (P.length < 2) break;
        for (let i = 1; i < P.length; i += 1) g.segs.push([P[i - 1].x, P[i - 1].y, P[i].x, P[i].y]);
        if (P.length > 2) {
          g.segs.push([P[P.length - 1].x, P[P.length - 1].y, P[0].x, P[0].y]);
          g.areas.push({ poly: P.map((q) => [q.x, q.y]) });
        }
        break;
      }
      case 'circle': {
        if (P.length < 2) break;
        const r = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y);
        g.areas.push({ circ: [P[0].x, P[0].y, r] });
        g.circ = [P[0].x, P[0].y, r];
        break;
      }
      case 'arrowm': {
        if (P.length < 2) break;
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]);
        break;
      }
      case 'long': case 'short': {
        const x1 = P[0].x; const x2 = P[1].x;
        g.pos = { x1, x2, ye: P[0].y, yt: P[1].y, ys: P[2].y };
        g.areas.push({ rect: [Math.min(x1, x2), Math.min(P[0].y, P[1].y, P[2].y), Math.abs(x2 - x1), Math.abs(Math.max(P[1].y, P[2].y, P[0].y) - Math.min(P[0].y, P[1].y, P[2].y))] });
        /* Як у TV: вхід — коло, тейк/стоп/ширина — квадрати. */
        g.handles = [{ x: x1, y: P[0].y, idx: 0 }, { x: x1, y: P[1].y, idx: 1, sq: true }, { x: x1, y: P[2].y, idx: 2, sq: true }, { x: x2, y: P[0].y, idx: 3, sq: true }];
        break;
      }
      case 'text': {
        const fs = s.fontSize || 14;
        const lines = String(d.text || tx('Текст', 'Text')).split('\n');
        const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6 + 8;
        const h = lines.length * fs * 1.3 + 6;
        g.areas.push({ rect: [P[0].x - 4, P[0].y - fs - 2, w, h] });
        g.text = { lines, fs, w, h };
        break;
      }
      case 'note': {
        if (P.length < 2) return g;
        const fs = s.fontSize || 13;
        const lines = String(d.text || tx('Текст', 'Text')).split('\n');
        const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6 + 20;
        const h = lines.length * fs * 1.3 + 12;
        g.segs.push([P[0].x, P[0].y, P[1].x, P[1].y]);
        g.areas.push({ rect: [P[1].x - w / 2, P[1].y - h / 2, w, h] });
        g.text = { lines, fs, w, h };
        break;
      }
      case 'plabel': {
        const fs = s.fontSize || 12;
        const label = this.fmtP(d.pts[0].p);
        const w = label.length * fs * 0.62 + 14; const h = fs + 10;
        g.areas.push({ rect: [P[0].x, P[0].y - h - 6, w, h] });
        g.label = { label, w, h, fs };
        break;
      }
      case 'arrowup': case 'arrowdown':
        g.areas.push({ rect: [P[0].x - 9, d.type === 'arrowup' ? P[0].y : P[0].y - 26, 18, 26] });
        break;
      default:
        break;
    }
    g.P = P;
    return g;
  }

  /* Повернутий прямокутник: перша сторона — точки 0–1, ширина — від
     третьої точки до цієї сторони (по перпендикуляру). */
  rotCorners(P) {
    const dx = P[1].x - P[0].x; const dy = P[1].y - P[0].y;
    const L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L; const ny = dx / L;
    const w = (P[2].x - P[0].x) * nx + (P[2].y - P[0].y) * ny;
    return [[P[0].x, P[0].y], [P[1].x, P[1].y], [P[1].x + nx * w, P[1].y + ny * w], [P[0].x + nx * w, P[0].y + ny * w]];
  }

  /* Лінійна регресія закриттів між двома точками + канал ±dev·σ. */
  regress(d) {
    const a = this.e.agg;
    if (!a) return null;
    let i0 = Math.round(this.absOf(d.pts[0].t)); let i1 = Math.round(this.absOf(d.pts[1].t));
    if (i0 > i1) [i0, i1] = [i1, i0];
    i0 = Math.max(0, i0); i1 = Math.min(a.n - 1, this.e.lastK ?? a.n - 1, i1);
    if (i1 - i0 < 1) return null;
    const n = i1 - i0 + 1;
    let sx = 0; let sy = 0; let sxy = 0; let sxx = 0;
    for (let i = i0; i <= i1; i += 1) { const x = i - i0; const y = a.c[i]; sx += x; sy += y; sxy += x * y; sxx += x * x; }
    const den = n * sxx - sx * sx || 1;
    const b = (n * sxy - sx * sy) / den; const c = (sy - b * sx) / n;
    let ss = 0;
    for (let i = i0; i <= i1; i += 1) { const e = a.c[i] - (c + b * (i - i0)); ss += e * e; }
    const sd = Math.sqrt(ss / n) * (d.style?.dev || 2);
    const xa = this.x(a.t[i0]); const xb = this.x(a.t[i1]);
    const pa = c; const pb = c + b * (i1 - i0);
    const Y = (p) => this.y(p);
    if (xa == null || xb == null || Y(pa) == null || Y(pb) == null) return null;
    const ln = (off) => [xa, Y(pa + off), xb, Y(pb + off)];
    const lines = [ln(0), ln(sd), ln(-sd)];
    return { lines, poly: [[lines[1][0], lines[1][1]], [lines[1][2], lines[1][3]], [lines[2][2], lines[2][3]], [lines[2][0], lines[2][1]]] };
  }

  channelOffset(d, P) {
    /* Зсув паралелі — різниця між третьою точкою й ціною базової
       лінії в той самий момент часу. */
    const [a, b, c] = d.pts;
    const k = b.t === a.t ? 0 : (c.t - a.t) / (b.t - a.t);
    const base = a.p + (b.p - a.p) * k;
    const yb = this.y(base);
    const yc = this.y(c.p);
    return yb == null || yc == null ? 0 : yc - yb;
  }

  fibPrices(d) {
    const [a, b, c] = d.pts;
    const levels = (d.style.levels || []).filter((l) => l.on);
    return levels.map((l) => {
      const v = d.style.reverse ? 1 - l.v : l.v;
      const price = d.type === 'fib' ? b.p + (a.p - b.p) * v : (c ? c.p : b.p) + (b.p - a.p) * v;
      return { ...l, price };
    });
  }

  hit(x, y) {
    for (let i = this.list.length - 1; i >= 0; i -= 1) {
      const d = this.list[i];
      if (!this.visible(d)) continue;
      const g = this.geom(d);
      if (!g) continue;
      if (d.id === this.sel || (this.hover && this.hover.id === d.id)) {
        for (const h of g.handles) if (!h.only && Math.hypot(h.x - x, h.y - y) <= HANDLE + 3) return { id: d.id, part: 'point', idx: h.idx };
      }
      for (const sgm of g.segs) if (distToSeg(x, y, ...sgm) <= HIT + (d.style?.width || 1) / 2) return { id: d.id, part: 'body' };
      for (const a of g.areas) {
        if (a.rect) {
          const [rx, ry, rw, rh] = a.rect;
          if (d.type === 'ellipse') {
            const cx = rx + rw / 2; const cy = ry + rh / 2;
            const v = ((x - cx) / (rw / 2 || 1)) ** 2 + ((y - cy) / (rh / 2 || 1)) ** 2;
            if (v <= 1.08) return { id: d.id, part: 'body' };
          } else if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return { id: d.id, part: 'body' };
        }
        if (a.poly && pointInPoly(x, y, a.poly)) return { id: d.id, part: 'body' };
        if (a.circ && Math.hypot(x - a.circ[0], y - a.circ[1]) <= a.circ[2] + 2) return { id: d.id, part: 'body' };
        if (a.ring && Math.abs(Math.hypot(x - a.ring[0], y - a.ring[1]) - a.ring[2]) <= HIT) return { id: d.id, part: 'body' };
      }
    }
    return null;
  }

  /* ---------------- малювання ---------------- */

  fmtP(p) { return Number(p).toFixed(this.e.base?.digits ?? 2); }

  svg() {
    if (!this.ready) return '';
    /* Вибраний малюнок сховали (інший таймфрейм, «сховати все») —
       знімаємо вибір, інакше панель висить над порожнечею. */
    if (this.sel) { const d = this.selected; if (!d || !this.visible(d)) this.select(null); }
    const out = [];
    for (const d of this.list) if (this.visible(d) && d.id !== this.editing) out.push(this.draw(d, d.id === this.sel, this.hover?.id === d.id));
    /* Виділені рамкою — блакитний контур навколо кожного. */
    if (this.multi?.size > 1) {
      this.list.forEach((d) => {
        if (!this.multi.has(d.id) || !this.visible(d)) return;
        const b = this.bbox(d);
        if (b) out.push(`<rect x="${b.x1 - 4}" y="${b.y1 - 4}" width="${b.x2 - b.x1 + 8}" height="${b.y2 - b.y1 + 8}" rx="3" fill="rgba(41,98,255,0.06)" stroke="#2962ff" stroke-width="1" stroke-dasharray="4 3"/>`);
      });
    }
    if (this.draft) out.push(this.draw(this.draft, true, false));
    if (this.temp) out.push(this.draw(this.temp, false, false));
    if (this.marquee) {
      const q = this.marquee;
      out.push(`<rect x="${Math.min(q.x0, q.x1)}" y="${Math.min(q.y0, q.y1)}" width="${Math.abs(q.x1 - q.x0)}" height="${Math.abs(q.y1 - q.y0)}" fill="rgba(41,98,255,0.12)" stroke="#2962ff" stroke-width="1"/>`);
    }
    return out.join('');
  }

  draw(d, selected, hovered) {
    const g = this.geom(d);
    if (!g) return '';
    const s = d.style || {};
    const W = this.plot().w; const H = this.plot().h;
    const col = s.color || '#2962ff';
    const width = s.width || 1;
    const dash = DASH[s.lineStyle] || '';
    const stroke = `stroke="${col}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linecap="round" fill="none"`;
    const o = [];
    const P = g.P;
    const label = (x, y, text, bg, fg = '#fff', anchor = 'middle', fs = 11) => {
      const w = String(text).length * fs * 0.6 + 12; const h = fs + 8;
      const lx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      o.push(`<rect x="${lx}" y="${y - h / 2}" width="${w}" height="${h}" rx="4" fill="${bg}"/>`);
      o.push(`<text x="${lx + w / 2}" y="${y + fs / 2 - 1.5}" fill="${fg}" font-size="${fs}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(text)}</text>`);
    };

    if (EXTRA.has(d.type)) o.push(paintExtra(g, { selected, hovered, d }));
    switch (d.type) {
      case 'trend': case 'ray': case 'extended': case 'info': case 'angle': case 'arrow': case 'path':
        g.segs.forEach(([a, b, c, e]) => o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${stroke}/>`));
        if (d.type === 'arrow' && P.length > 1) {
          const ang = Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x);
          const L = 10 + width * 2;
          const p1 = [P[1].x - L * Math.cos(ang - 0.45), P[1].y - L * Math.sin(ang - 0.45)];
          const p2 = [P[1].x - L * Math.cos(ang + 0.45), P[1].y - L * Math.sin(ang + 0.45)];
          o.push(`<polygon points="${P[1].x},${P[1].y} ${p1} ${p2}" fill="${col}"/>`);
        }
        if ((d.type === 'info' || s.showInfo) && P.length > 1 && d.type !== 'path') {
          const [a, b] = d.pts;
          const dp = b.p - a.p;
          const bars = Math.round(this.absOf(b.t) - this.absOf(a.t));
          const txt = `${dp >= 0 ? '+' : ''}${this.fmtP(dp)} (${((dp / a.p) * 100).toFixed(2)}%) · ${bars} ${tx('бар.', 'bars')}`;
          label(P[1].x, P[1].y + (P[1].y > P[0].y ? 18 : -18), txt, withAlpha(col, 0.9));
        }
        if ((d.type === 'angle' || s.showAngle) && P.length > 1) {
          const ang = -Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x) * 180 / Math.PI;
          o.push(`<line x1="${P[0].x}" y1="${P[0].y}" x2="${P[0].x + 50}" y2="${P[0].y}" stroke="${col}" stroke-width="1" stroke-dasharray="3 3"/>`);
          label(P[0].x + 64, P[0].y - 12, `${ang.toFixed(1)}°`, withAlpha(col, 0.9));
        }
        break;
      case 'regression': case 'flat': case 'disjoint': case 'triangle': case 'polyline': case 'rotrect': {
        const poly = g.areas.find((a) => a.poly);
        if (poly && s.fill) o.push(`<polygon points="${poly.poly.map((q) => q.join(',')).join(' ')}" fill="${s.fill}" stroke="none"/>`);
        g.segs.forEach(([a, b, c, e], i) => {
          const dashed = d.type === 'regression' && i === 0;
          o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${dashed ? stroke.replace(/stroke-dasharray="[^"]*"/, 'stroke-dasharray="6 4"') : stroke}/>`);
        });
        break;
      }
      case 'pitchfork': case 'schiff': case 'modschiff': case 'inside': {
        if (g.fork) {
          g.areas.forEach((a, i) => { if (s.fill) o.push(`<polygon points="${a.poly.map((q) => q.join(',')).join(' ')}" fill="${i ? withAlpha(col, 0.1) : s.fill}" stroke="none"/>`); });
          g.segs.forEach(([a, b, c, e], i) => o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${i >= 3 ? stroke.replace(/stroke-dasharray="[^"]*"/, 'stroke-dasharray="4 4"') : stroke}/>`));
        } else g.segs.forEach(([a, b, c, e]) => o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${stroke}/>`));
        break;
      }
      case 'circle':
        if (g.circ) o.push(`<circle cx="${g.circ[0]}" cy="${g.circ[1]}" r="${g.circ[2]}" fill="${s.fill || 'none'}" ${stroke.replace('fill="none"', '')}/>`);
        break;
      case 'arrowm': {
        if (P.length < 2) break;
        const dx = P[1].x - P[0].x; const dy = P[1].y - P[0].y;
        const L = Math.hypot(dx, dy) || 1;
        const ux = dx / L; const uy = dy / L; const nx = -uy; const ny = ux;
        const hl = Math.min(L * 0.55, 22 + width * 2); const hw = 8 + width * 2; const bw = 2.5 + width;
        const bx = P[1].x - ux * hl; const by = P[1].y - uy * hl;
        const pts = [[P[0].x, P[0].y], [bx + nx * bw, by + ny * bw], [bx + nx * hw, by + ny * hw], [P[1].x, P[1].y], [bx - nx * hw, by - ny * hw], [bx - nx * bw, by - ny * bw]];
        o.push(`<polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="${col}" stroke="${col}" stroke-width="1" stroke-linejoin="round"/>`);
        break;
      }
      case 'brush': case 'highlighter':
        /* Плавна крива через точки (Catmull-Rom → Безьє), як пензель у TV,
           а не ламана з кутами. */
        if (P.length > 1) o.push(`<path d="${smoothPath(P)}" stroke="${col}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
        break;
      case 'hline': case 'hray': case 'vline': case 'cross':
        g.segs.forEach(([a, b, c, e]) => o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${stroke}/>`));
        if (s.showPrice && d.type !== 'vline') label(W - 4, P[0].y, this.fmtP(d.pts[0].p), col, '#fff', 'end');
        if (s.showTime && (d.type === 'vline' || d.type === 'cross')) label(P[0].x, H - 12, this.e.fmtTime?.(d.pts[0].t) || '', col);
        break;
      case 'channel':
        if (g.areas[0] && s.fill) o.push(`<polygon points="${g.areas[0].poly.map((q) => q.join(',')).join(' ')}" fill="${s.fill}"/>`);
        g.segs.forEach(([a, b, c, e]) => o.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${e}" ${stroke}/>`));
        if (P.length > 2 && s.showMiddle) {
          o.push(`<line x1="${P[0].x}" y1="${P[0].y + g.off / 2}" x2="${P[1].x}" y2="${P[1].y + g.off / 2}" stroke="${col}" stroke-width="1" stroke-dasharray="6 4"/>`);
        }
        break;
      case 'rect':
        o.push(`<rect x="${g.box.x1}" y="${g.box.y1}" width="${g.box.x2 - g.box.x1}" height="${g.box.y2 - g.box.y1}" fill="${s.fill || 'none'}" ${stroke.replace('fill="none"', '')}/>`);
        if (s.showMiddle) o.push(`<line x1="${g.box.x1}" y1="${(g.box.y1 + g.box.y2) / 2}" x2="${g.box.x2}" y2="${(g.box.y1 + g.box.y2) / 2}" stroke="${col}" stroke-width="1" stroke-dasharray="6 4"/>`);
        break;
      case 'ellipse': {
        const { x1, x2, y1, y2 } = g.box;
        o.push(`<ellipse cx="${(x1 + x2) / 2}" cy="${(y1 + y2) / 2}" rx="${(x2 - x1) / 2}" ry="${(y2 - y1) / 2}" fill="${s.fill || 'none'}" ${stroke.replace('fill="none"', '')}/>`);
        break;
      }
      case 'prange': case 'drange': case 'dprange': case 'measure': {
        const { x1, x2, y1, y2 } = g.box;
        const [a, b] = d.pts;
        const dp = b.p - a.p;
        const up = dp >= 0;
        const mc = d.type === 'measure' ? (up ? '#2962ff' : '#f23645') : col;
        const fill = d.type === 'measure' ? withAlpha(mc, 0.18) : (s.fill || 'none');
        o.push(`<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${fill}"/>`);
        const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
        const bars = Math.round(this.absOf(b.t) - this.absOf(a.t));
        const vert = d.type !== 'drange';
        const horz = d.type !== 'prange';
        if (vert) {
          o.push(`<line x1="${mx}" y1="${P[0].y}" x2="${mx}" y2="${P[1].y}" stroke="${mc}" stroke-width="${d.type === 'measure' ? 1 : 2}"/>`);
          const ay = P[1].y; const dir = P[1].y > P[0].y ? -1 : 1;
          o.push(`<polygon points="${mx},${ay} ${mx - 5},${ay + dir * 8} ${mx + 5},${ay + dir * 8}" fill="${mc}"/>`);
        }
        if (horz) {
          o.push(`<line x1="${P[0].x}" y1="${my}" x2="${P[1].x}" y2="${my}" stroke="${mc}" stroke-width="${d.type === 'measure' ? 1 : 2}"/>`);
          const ax = P[1].x; const dir = P[1].x > P[0].x ? -1 : 1;
          o.push(`<polygon points="${ax},${my} ${ax + dir * 8},${my - 5} ${ax + dir * 8},${my + 5}" fill="${mc}"/>`);
        }
        /* Підпис як у TV: кілька рядків — ціна (абсолютно, %, тіки),
           бари й час, обсяг. Лінійка — суцільна кольорова плашка,
           діапазони — світла плашка з рамкою. */
        if (s.showInfo !== false) {
          const lines = [];
          const dig = this.e.base?.digits ?? 2;
          if (vert) lines.push(`${up ? '' : '−'}${this.fmtP(Math.abs(dp))} (${up ? '' : '−'}${Math.abs((dp / a.p) * 100).toFixed(2)}%) ${Math.round(Math.abs(dp) * 10 ** dig).toLocaleString('en-US')}`);
          if (horz) lines.push(`${bars} ${tx('бар.', 'bars')}, ${fmtSpan(Math.abs(b.t - a.t))}`);
          const vol = this.volBetween(a.t, b.t);
          if (vol != null && horz) lines.push(`${tx('Обс.', 'Vol')} ${fmtVol(vol)}`);
          const fs = 11; const lh = 14;
          const w = Math.max(...lines.map((l) => l.length)) * fs * 0.6 + 16;
          const h = lines.length * lh + 8;
          const below = P[1].y > P[0].y;
          const ly = below ? y2 + 8 : y1 - 8 - h;
          const solid = d.type === 'measure';
          const lightBg = isLightColor(this.e.prefs.bg);
          const bg = solid ? mc : (lightBg ? '#ffffff' : '#1e222d');
          const fg = solid ? '#ffffff' : (lightBg ? '#131722' : '#d1d4dc');
          o.push(`<rect x="${mx - w / 2}" y="${ly}" width="${w}" height="${h}" rx="3" fill="${bg}" ${solid ? '' : `stroke="${lightBg ? '#e0e3eb' : '#363a45'}"`}/>`);
          lines.forEach((ln, i) => o.push(`<text x="${mx}" y="${ly + 4 + (i + 1) * lh - 3}" fill="${fg}" font-size="${fs}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(ln)}</text>`));
        }
        break;
      }
      case 'zoom': {
        const { x1, x2, y1, y2 } = g.box;
        o.push(`<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="rgba(41,98,255,0.08)" stroke="#2962ff" stroke-dasharray="4 3"/>`);
        break;
      }
      case 'fib': case 'fibext': {
        const { x1, x2, lv } = g.fib;
        const ys = lv.map((l) => ({ ...l, y: this.y(l.price) })).filter((l) => l.y != null);
        if (s.fillLevels) {
          const sorted = [...ys].sort((a, b) => a.v - b.v);
          for (let i = 1; i < sorted.length; i += 1) {
            const a = sorted[i - 1]; const b = sorted[i];
            o.push(`<rect x="${x1}" y="${Math.min(a.y, b.y)}" width="${x2 - x1}" height="${Math.abs(b.y - a.y)}" fill="${withAlpha(b.c, s.fillAlpha ?? 0.12)}"/>`);
          }
        }
        ys.forEach((l) => {
          o.push(`<line x1="${x1}" y1="${l.y}" x2="${x2}" y2="${l.y}" stroke="${l.c}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`);
          if (s.showLevels || s.showPrices) {
            const t = `${s.showLevels ? l.v : ''}${s.showLevels && s.showPrices ? ' ' : ''}${s.showPrices ? `(${this.fmtP(l.price)})` : ''}`;
            o.push(`<text x="${x1 - 6}" y="${l.y + 4}" fill="${l.c}" font-size="11" text-anchor="end" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(t)}</text>`);
          }
        });
        o.push(`<line x1="${P[0].x}" y1="${P[0].y}" x2="${P[1].x}" y2="${P[1].y}" stroke="${col}" stroke-width="1" stroke-dasharray="4 4"/>`);
        if (P[2]) o.push(`<line x1="${P[1].x}" y1="${P[1].y}" x2="${P[2].x}" y2="${P[2].y}" stroke="${col}" stroke-width="1" stroke-dasharray="4 4"/>`);
        break;
      }
      case 'long': case 'short': {
        const { x1, x2, ye, yt, ys } = g.pos;
        const L = Math.min(x1, x2); const Wd = Math.abs(x2 - x1);
        o.push(`<rect x="${L}" y="${Math.min(ye, yt)}" width="${Wd}" height="${Math.abs(yt - ye)}" fill="${s.tp}"/>`);
        o.push(`<rect x="${L}" y="${Math.min(ye, ys)}" width="${Wd}" height="${Math.abs(ys - ye)}" fill="${s.sl}"/>`);
        /* Що сталося б з цією угодою на свічках усередині рамки — як у
           TV: темніша зона від входу до виходу й пунктир до точки виходу.
           У реплеї дивимось лише на вже показані свічки. */
        const out = this.positionOutcome(d);
        if (out && out.x != null) {
          const yx = this.y(out.price);
          if (yx != null) {
            const xr = Math.min(out.x, L + Wd);
            const up = out.r >= 0;
            o.push(`<rect x="${L}" y="${Math.min(ye, yx)}" width="${Math.max(0, xr - L)}" height="${Math.abs(yx - ye)}" fill="${up ? 'rgba(8,153,129,0.25)' : 'rgba(242,54,69,0.25)'}"/>`);
            o.push(`<line x1="${L}" y1="${ye}" x2="${xr}" y2="${yx}" stroke="#787b86" stroke-width="1" stroke-dasharray="4 3"/>`);
          }
        }
        o.push(`<line x1="${L}" y1="${ye}" x2="${L + Wd}" y2="${ye}" stroke="#787b86" stroke-width="1"/>`);
        /* Підписи — коли позицію вибрано або навели, як у TV. */
        if (s.showInfo !== false && (selected || hovered)) {
          const [en, tp, sl] = d.pts;
          const risk = Math.abs(en.p - sl.p) || 1e-9;
          const reward = Math.abs(tp.p - en.p);
          const rr = reward / risk;
          const dig = this.e.base?.digits ?? 2;
          const ticks = (v) => Math.round(v * 10 ** dig).toLocaleString('en-US');
          const pct = (v) => `${((v / en.p) * 100).toFixed(3)}%`;
          const usd = this.e.riskUsd || 100;
          const money = (v) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
          const cx = L + Wd / 2;
          const tpUp = yt < ye;
          label(cx, yt + (tpUp ? -12 : 12), `${tx('Ціль', 'Target')}: ${this.fmtP(reward)} (${pct(reward)}) ${ticks(reward)}, ${tx('Сума', 'Amount')}: ${money(usd * rr)}`, '#089981');
          label(cx, ys + (tpUp ? 12 : -12), `${tx('Стоп', 'Stop')}: ${this.fmtP(risk)} (${pct(risk)}) ${ticks(risk)}, ${tx('Сума', 'Amount')}: ${money(usd)}`, '#f23645');
          const pnlTxt = out
            ? `${out.closed ? tx('Закрита П/З', 'Closed P&L') : tx('Відкрита П/З', 'Open P&L')}: ${out.r >= 0 ? '+' : '−'}${Math.abs(out.r).toFixed(2)}R, ${money(out.r * usd)}`
            : tx('Угода ще не почалась', 'Not started');
          /* Посередині — одна плашка на два рядки, як у TV. */
          const l2 = `${tx('Співвідношення ризик/прибуток', 'Risk/reward ratio')}: ${rr.toFixed(2)}`;
          const mbg = out ? (out.r >= 0 ? '#089981' : '#f23645') : '#787b86';
          const mw = Math.max(pnlTxt.length, l2.length) * 6.4 + 14;
          o.push(`<rect x="${cx - mw / 2}" y="${ye - 15}" width="${mw}" height="30" rx="3" fill="${mbg}"/>`);
          [pnlTxt, l2].forEach((tline, i) => o.push(`<text x="${cx}" y="${ye - 3 + i * 13}" fill="#fff" font-size="11" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(tline)}</text>`));
        }
        break;
      }
      case 'text': {
        const { lines, fs, w, h } = g.text;
        const [rx, ry] = g.areas[0].rect;
        if (s.bg) o.push(`<rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="4" fill="${s.bg}" ${s.border ? `stroke="${s.border}"` : ''}/>`);
        lines.forEach((ln, i) => o.push(`<text x="${P[0].x}" y="${P[0].y + i * fs * 1.3}" fill="${s.textColor}" font-size="${fs}" font-weight="${s.bold ? 700 : 400}" font-style="${s.italic ? 'italic' : 'normal'}" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(ln)}</text>`));
        break;
      }
      case 'note': {
        if (P.length < 2) break;
        const { lines, fs, w, h } = g.text;
        o.push(`<line x1="${P[0].x}" y1="${P[0].y}" x2="${P[1].x}" y2="${P[1].y}" stroke="${col}" stroke-width="1.5"/>`);
        o.push(`<circle cx="${P[0].x}" cy="${P[0].y}" r="3" fill="${col}"/>`);
        o.push(`<rect x="${P[1].x - w / 2}" y="${P[1].y - h / 2}" width="${w}" height="${h}" rx="6" fill="${col}"/>`);
        lines.forEach((ln, i) => o.push(`<text x="${P[1].x}" y="${P[1].y - h / 2 + 6 + fs + i * fs * 1.3 - 2}" fill="${s.textColor}" font-size="${fs}" text-anchor="middle" font-weight="${s.bold ? 700 : 400}" font-style="${s.italic ? 'italic' : 'normal'}" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(ln)}</text>`));
        break;
      }
      case 'plabel': {
        const { label: lt, w, h, fs } = g.label;
        const x = P[0].x; const y = P[0].y;
        o.push(`<path d="M${x},${y} L${x + 6},${y - 6} L${x + w},${y - 6} L${x + w},${y - 6 - h} L${x},${y - 6 - h} Z" fill="${col}"/>`);
        o.push(`<text x="${x + w / 2}" y="${y - 6 - h / 2 + fs / 2 - 1}" fill="${s.textColor}" font-size="${fs}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${esc(lt)}</text>`);
        break;
      }
      case 'arrowup': case 'arrowdown': {
        const x = P[0].x; const y = P[0].y; const dir = d.type === 'arrowup' ? 1 : -1;
        o.push(`<path d="M${x},${y} L${x + 9},${y + dir * 11} L${x + 4},${y + dir * 11} L${x + 4},${y + dir * 26} L${x - 4},${y + dir * 26} L${x - 4},${y + dir * 11} L${x - 9},${y + dir * 11} Z" fill="${col}"/>`);
        break;
      }
      default:
        break;
    }

    /* Ручки — лише у вибраного, як у TV (наведення їх не показує).
       Коло — точка, квадрат — сторона/рівень. Заливка — колір фону. */
    if (selected) {
      const bg = this.e.prefs.bg || '#ffffff';
      g.handles.forEach((h) => {
        if (h.sq) o.push(`<rect x="${h.x - 4}" y="${h.y - 4}" width="8" height="8" rx="2" fill="${bg}" stroke="#2962ff" stroke-width="1.5"/>`);
        else o.push(`<circle cx="${h.x}" cy="${h.y}" r="${h.only ? 3.5 : 4.5}" fill="${bg}" stroke="#2962ff" stroke-width="1.5"/>`);
      });
    }
    return o.join('');
  }
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Двигун графіка живе в ref сторінки: гаряча заміна модуля лишила б
   старий екземпляр зі старим кодом. Тому при зміні — повне оновлення. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
