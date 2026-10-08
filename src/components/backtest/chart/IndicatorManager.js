import { LineSeries, HistogramSeries, LineStyle } from 'lightweight-charts';
import { INDICATORS, inputsOf } from '../../../lib/candles/indicators';
import { tfIndexOfBase, barAt, volAt } from '../../../lib/candles/agg';

/* ==================================================================
   Рушій індикаторів: рахує, малює й чистить за собою.

   Дві частини:
   • лінії (MA, VWAP, RSI…) — справжні серії бібліотеки, з власною
     шкалою й перехрестям; осцилятори — у своїх панелях під графіком;
   • фігури (сесії, рівні, FVG…) — у тому ж SVG-шарі, що й малюнки,
     у координатах «індекс свічки / ціна», тож їдуть разом із графіком.

   Рахуємо не на кожен кадр, а коли змінились дані: крок реплею,
   інший таймфрейм, довантажена історія. Між цим лише переводимо
   готові фігури в пікселі.
================================================================== */

const DASH = { solid: '', dashed: '6 4', dotted: '1.5 3.5' };
const LS = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted };
const FONT = "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif";
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default class IndicatorManager {
  constructor(engine) {
    this.e = engine;
    this.config = [];
    this.series = new Map();
    this.shapes = [];
    this.notes = {};
    this.timer = null;
    this.paneOf = new Map();
    this.vals = {};
    this.listeners = new Set();
  }

  /* Легенда зліва вгорі підписується на перерахунок — щоб значення
     ліній оновлювались і під час реплею. */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => { try { fn(); } catch { /* ок */ } }); }

  /* Значення ліній індикатора на свічці k (глобальний індекс). */
  valuesAt(id, k) {
    const v = this.vals[id];
    if (!v) return [];
    const i = k - v.abs0;
    return v.list.map((s) => {
      const p = s.data[i];
      return { color: (s.kind === 'hist' && p?.color) || s.color, value: p && Number.isFinite(p.value) ? p.value : null, precision: s.precision, hist: s.kind === 'hist' };
    }).filter((x) => x.value != null);
  }

  /* Верх кожної нижньої панелі в пікселях від верху графіка. */
  paneTops() {
    const out = {};
    try {
      const panes = this.e.chart.panes();
      const root = this.e.chart.chartElement().getBoundingClientRect();
      this.paneOf.forEach((idx, id) => {
        const el = panes[idx]?.getHTMLElement?.();
        if (el) out[id] = el.getBoundingClientRect().top - root.top;
      });
    } catch { /* ок */ }
    return out;
  }

  destroy() {
    clearTimeout(this.timer);
  }

  setConfig(list) {
    const next = (list || []).filter((c) => INDICATORS[c.id]);
    const sig = (l) => l.filter((c) => c.on !== false).map((c) => c.id).join(',');
    const rebuild = sig(next) !== sig(this.config);
    this.config = next;
    if (rebuild) this.rebuildPanes();
    this.invalidate(true);
  }

  /* Набір увімкнених змінився — прибираємо всі серії й панелі
     індикаторів і ставимо заново в тому ж порядку. */
  rebuildPanes() {
    const chart = this.e.chart;
    this.series.forEach((s) => { try { chart.removeSeries(s); } catch { /* вже немає */ } });
    this.series.clear();
    for (let i = chart.panes().length - 1; i > 0; i -= 1) { try { chart.removePane(i); } catch { /* ок */ } }
    this.paneOf.clear();
    /* Одразу під графіком — інші інструменти (LinkedPanes), осцилятори
       після них. Їхні панелі щойно прибрано разом з усіма — ставимо
       назад першими, щоб номери не переплутались. */
    this.e.linked?.attach();
    let pane = this.e.linked?.count || 0;
    this.config.forEach((c) => {
      if (c.on === false) return;
      if (INDICATORS[c.id].pane) { pane += 1; this.paneOf.set(c.id, pane); }
    });
  }

  /* Перед заміною свічок (інший таймфрейм, обрізка) спершу чистимо
     лінії індикаторів — щоб жодного кадру старі точки не жили поруч із
     новими свічками. */
  clearData() {
    this.series.forEach((s) => { try { s.setData([]); } catch { /* ок */ } });
  }

  invalidate(now = false) {
    if (now) { clearTimeout(this.timer); this.timer = null; this.compute(); return; }
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.compute(); }, 30);
  }

  /* Свічки вікна так, як їх видно ЗАРАЗ. Остання — недоформована,
     якщо реплей зупинився посеред неї. */
  context() {
    const e = this.e;
    const a = e.agg;
    /* Свічка, що зараз «росте» в анімації, ще не намальована до кінця:
       її фінальні значення — це майбутнє. Рахуємо без неї; щойно
       анімація закінчиться, рушій попросить перерахунок. */
    const from = e.win; const to = e.anim ? e.anim.k - 1 : e.lastK;
    const n = Math.max(0, to - from + 1);
    const T = new Array(n); const O = new Float64Array(n); const H = new Float64Array(n);
    const L = new Float64Array(n); const C = new Float64Array(n);
    const V = e.base.v ? new Float64Array(n) : null;
    for (let i = 0; i < n; i += 1) {
      const k = from + i;
      T[i] = a.t[k]; O[i] = a.o[k]; H[i] = a.h[k]; L[i] = a.l[k]; C[i] = a.c[k];
      if (V) V[i] = a.v ? a.v[k] : 0;
    }
    if (n && e.cut != null && !e.anim) {
      const b = barAt(a, e.base, to, e.cut);
      O[n - 1] = b.open; H[n - 1] = b.high; L[n - 1] = b.low; C[n - 1] = b.close;
      if (V) V[n - 1] = volAt(a, e.base, to, e.cut);
    }
    const lastBase = e.anim ? e.anim.from - 1 : (e.cut ?? e.base.n) - 1;
    const digits = e.base.digits ?? 2;
    return {
      n, T, O, H, L, C, V, abs0: from, sec: a.sec, tf: e.tf, lastBase, digits,
      fmt: (p) => Number(p).toFixed(digits),
      getAgg: (id) => e.getAgg(id),
      /* Поточний день — лише до останньої «сталої» хвилинки. */
      barD1: (k) => barAt(e.getAgg('D1'), e.base, k, lastBase + 1),
      tfIndexOfBase,
    };
  }

  compute() {
    const e = this.e;
    if (!e.agg || !e.base || e.lastK < 0) return;
    const active = this.config.filter((c) => c.on !== false);
    if (!active.length) { this.shapes = []; this.vals = {}; this.emit(); return; }
    const ctx = this.context();
    const shapes = [];
    const seen = new Set();
    this.notes = {};
    this.vals = {};
    active.forEach((c) => {
      const def = INDICATORS[c.id];
      const inp = inputsOf(c);
      /* Вкладка «Видимість»: на вимкнених таймфреймах індикатора немає. */
      if (inp[`vis_${e.tf}`] === false) return;
      let out;
      try { out = def.compute(ctx, inp) || {}; } catch (err) { console.error(`indicator ${c.id}`, err); return; }
      if (out.note) this.notes[c.id] = out.note;
      this.vals[c.id] = { abs0: ctx.abs0, list: (out.series || []).map((x) => ({ kind: x.kind, color: x.color, precision: x.precision, data: x.data })) };
      if (c.hidden) return;
      if (out.shapes) shapes.push(out.shapes);
      (out.series || []).forEach((s) => {
        const id = `${c.id}:${s.key}`;
        seen.add(id);
        let api = this.series.get(id);
        const pane = this.paneOf.get(c.id) || 0;
        if (!api) {
          api = this.add(s, pane);
          this.series.set(id, api);
          if (pane > 0) this.sizePanes = true;
        } else this.style(api, s);
        api.setData(s.data);
      });
    });
    /* Серії, яких більше немає (вимкнули лінію в налаштуваннях). */
    this.series.forEach((api, id) => {
      if (!seen.has(id)) { try { e.chart.removeSeries(api); } catch { /* ок */ } this.series.delete(id); }
    });
    this.shapes = shapes;
    this.emit();
    /* Висоти панелей — після того, як усі створені: інакше кожна нова
       відбирала місце в попередньої і перші ставали тонкими смужками. */
    if (this.sizePanes) {
      this.sizePanes = false;
      /* Пропорції, а не пікселі: setHeight однієї панелі відбирав місце
         в сусідньої. Основний графік — 1, кожен осцилятор — 0.22. */
      e.sizePanes();
    }
  }

  add(s, pane) {
    const chart = this.e.chart;
    if (s.kind === 'hist') {
      const opts = { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'volume' } };
      if (s.overlay) {
        const api = chart.addSeries(HistogramSeries, { ...opts, priceScaleId: 'edge-vol' }, 0);
        api.priceScale().applyOptions({ scaleMargins: { top: 1 - (s.height || 20) / 100, bottom: 0 } });
        return api;
      }
      return chart.addSeries(HistogramSeries, { ...opts, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }, pane);
    }
    const api = chart.addSeries(LineSeries, {
      color: s.color, lineWidth: s.width || 1, lineStyle: LS[s.dash] ?? LineStyle.Solid,
      priceLineVisible: false, lastValueVisible: s.axis ?? pane > 0, title: s.title || '', crosshairMarkerVisible: false,
      ...(s.precision != null ? { priceFormat: { type: 'price', precision: s.precision, minMove: 1 / 10 ** s.precision } } : {}),
    }, pane);
    (s.levels || []).forEach((v) => api.createPriceLine({ price: v, color: 'rgba(120,123,134,0.6)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false }));
    return api;
  }

  style(api, s) {
    if (s.kind === 'hist') return;
    api.applyOptions({ color: s.color, lineWidth: s.width || 1, lineStyle: LS[s.dash] ?? LineStyle.Solid, lastValueVisible: !!s.axis, title: s.title || '' });
  }

  /* ---------------- SVG ---------------- */

  svg(plotW, plotH) {
    this.tags = [];
    if (!this.shapes.length) return '';
    const e = this.e;
    const ts = e.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return '';
    const lo = e.win + r.from - 2; const hi = e.win + r.to + 2;
    const x = (abs) => (abs === 'R' ? plotW : e.lx(abs - e.win));
    const y = (p) => e.series.priceToCoordinate(p);
    const o = [];
    /* Підпис: просто текст кольору лінії або з плашкою (білий текст на
       кольоровому тлі) — щоб читався навіть поверх свічок. */
    const label = (lx, ly, text, color, anchor = 'start', size = 11, bg = false) => {
      if (!text) return;
      if (bg) {
        const w = String(text).length * size * 0.6 + 10; const h = size + 6;
        const bx = anchor === 'end' ? lx - w + 4 : anchor === 'middle' ? lx - w / 2 : lx - 4;
        o.push(`<rect x="${bx}" y="${ly - size}" width="${w}" height="${h}" rx="3" fill="${color}"/>`);
        o.push(`<text x="${bx + w / 2}" y="${ly}" fill="#fff" font-size="${size}" font-weight="600" text-anchor="middle" font-family="${FONT}">${esc(text)}</text>`);
        return;
      }
      o.push(`<text x="${lx}" y="${ly}" fill="${color}" font-size="${size}" font-weight="600" text-anchor="${anchor}" font-family="${FONT}" paint-order="stroke" stroke="rgba(0,0,0,0.35)" stroke-width="2">${esc(text)}</text>`);
    };
    const vis = (a1, a2) => (a2 === 'R' ? true : a2 >= lo) && a1 <= hi;

    for (const sh of this.shapes) {
      if (sh.band) {
        const b = sh.band;
        const a = Math.max(0, Math.floor(lo - b.abs0)); const z = Math.min(b.up.length - 1, Math.ceil(hi - b.abs0));
        const top = []; const bot = [];
        for (let i = a; i <= z; i += 1) {
          if (!Number.isFinite(b.up[i])) continue;
          const xx = x(b.abs0 + i); const yu = y(b.up[i]); const yd = y(b.dn[i]);
          if (xx == null || yu == null || yd == null) continue;
          top.push(`${xx.toFixed(1)},${yu.toFixed(1)}`); bot.unshift(`${xx.toFixed(1)},${yd.toFixed(1)}`);
        }
        if (top.length > 1) o.push(`<polygon points="${top.join(' ')} ${bot.join(' ')}" fill="${b.fill}"/>`);
      }
      (sh.rects || []).forEach((rc) => {
        if (!vis(rc.a1, rc.a2)) return;
        const x1 = x(rc.a1); const x2 = x(rc.a2);
        if (x1 == null || x2 == null) return;
        const y1 = rc.p1 === Infinity ? 0 : y(rc.p1); const y2 = rc.p2 === -Infinity ? plotH : y(rc.p2);
        if (y1 == null || y2 == null) return;
        const yy = Math.min(y1, y2); const hh = Math.abs(y2 - y1);
        o.push(`<rect x="${x1}" y="${yy}" width="${Math.max(0, x2 - x1)}" height="${hh}" fill="${rc.fill || 'none'}" ${rc.stroke ? `stroke="${rc.stroke}" stroke-width="1" ${rc.dash ? `stroke-dasharray="${DASH[rc.dash] || ''}"` : ''}` : ''}/>`);
        if (rc.label && x2 - x1 > 18) {
          const size = rc.labelSize || 11;
          const full = rc.p1 === Infinity;
          const top = full ? 4 : yy; const bot = full ? plotH - 4 : yy + hh;
          const pos = rc.labelPos || 'tl';
          const lc = rc.labelColor || '#9598a1';
          if (pos === 'inside') label((x1 + Math.min(x2, plotW)) / 2, yy + hh / 2 + size / 3, rc.label, lc, 'middle', size, rc.labelBg);
          else {
            const right = pos === 'tr' || pos === 'br';
            const lx = right ? Math.min(x2, plotW) - 4 : x1 + 4;
            const ly = pos[0] === 't' ? (full ? top + size + 2 : top - 4) : (full ? bot - 2 : bot + size + 2);
            label(lx, ly, rc.label, lc, right ? 'end' : 'start', size, rc.labelBg);
          }
        }
      });
      (sh.segs || []).forEach((sg) => {
        if (!vis(sg.a1, sg.a2)) return;
        const x1 = Math.max(-10, x(sg.a1) ?? -10); const x2 = Math.min(plotW + 10, x(sg.a2) ?? plotW);
        const yy = y(sg.p);
        if (yy == null || x2 < x1) return;
        o.push(`<line x1="${x1}" y1="${yy}" x2="${x2}" y2="${yy}" stroke="${sg.color}" stroke-width="${sg.width || 1}" ${sg.dash && DASH[sg.dash] ? `stroke-dasharray="${DASH[sg.dash]}"` : ''} ${sg.faded ? 'opacity="0.45"' : ''}/>`);
        if (sg.label) {
          const size = sg.labelSize || 11;
          const pos = sg.labelPos || 'end';
          const xe = Math.min(x2, plotW) - 4; const xs = Math.max(x1, 0) + 4;
          if (pos === 'mid') label((x1 + x2) / 2, yy - 4, sg.label, sg.color, 'middle', size, sg.labelBg);
          else if (pos === 'midBelow') label((x1 + x2) / 2, yy + size + 2, sg.label, sg.color, 'middle', size, sg.labelBg);
          else if (pos === 'start') label(xs, yy - 4, sg.label, sg.color, 'start', size, sg.labelBg);
          else if (pos === 'below') label(xe, yy + size + 2, sg.label, sg.color, 'end', size, sg.labelBg);
          else label(xe, yy - 4, sg.label, sg.color, 'end', size, sg.labelBg);
        }
        if (sg.axis) this.tags.push({ y: yy, p: sg.p, color: sg.color });
      });
      (sh.dots || []).forEach((d) => {
        if (d.a < lo || d.a > hi) return;
        const xx = x(d.a); const yy = y(d.p);
        if (xx == null || yy == null) return;
        o.push(`<circle cx="${xx}" cy="${yy}" r="3" fill="${d.color}"/>`);
      });
      (sh.vlines || []).forEach((v) => {
        if (v.a < lo || v.a > hi) return;
        const xx = x(v.a);
        if (xx == null) return;
        o.push(`<line x1="${xx}" y1="0" x2="${xx}" y2="${plotH}" stroke="${v.color}" stroke-width="${v.width || 1}" ${DASH[v.dash] ? `stroke-dasharray="${DASH[v.dash]}"` : ''}/>`);
        if (v.label) label(xx + 4, (v.labelSize || 11) + 4, v.label, v.color.replace(/[\d.]+\)$/, '0.9)'), 'start', v.labelSize || 11);
      });
      if (sh.round) {
        const pTop = e.series.coordinateToPrice(0); const pBot = e.series.coordinateToPrice(plotH);
        if (pTop == null || pBot == null) continue;
        const span = Math.abs(pTop - pBot);
        let step = sh.round.step;
        if (!step || span / step > 40) {
          /* Авто: «круглий» крок, щоб на екрані було ~6–12 рівнів. */
          const raw = span / 8; const pow = 10 ** Math.floor(Math.log10(raw));
          step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((st) => span / st <= 12) || pow * 10;
        }
        const start = Math.ceil(Math.min(pTop, pBot) / step) * step;
        for (let p = start; p <= Math.max(pTop, pBot); p += step) {
          const yy = y(p);
          if (yy == null) continue;
          o.push(`<line x1="0" y1="${yy}" x2="${plotW}" y2="${yy}" stroke="${sh.round.color}" stroke-width="1" ${DASH[sh.round.dash] ? `stroke-dasharray="${DASH[sh.round.dash]}"` : ''}/>`);
          if (sh.round.labels) label(plotW - 4, yy - 3, p.toFixed(e.base.digits), sh.round.color, 'end', sh.round.labelSize || 10);
        }
      }
    }
    return o.join('');
  }

  /* Мітки ціни на шкалі (як «PDH 4170.22» у TV) — малюються поза
     обрізкою основної панелі, просто на шкалі цін праворуч. */
  axisSvg(plotW, plotH) {
    if (!this.tags?.length) return '';
    const e = this.e;
    const w = e.chart.priceScale('right').width();
    if (!w) return '';
    const fs = e.prefs.fontSize || 11;
    const h = fs + 6;
    return this.tags
      .filter((t) => t.y >= 0 && t.y <= plotH)
      .map((t) => `<rect x="${plotW + 1}" y="${t.y - h / 2}" width="${w - 2}" height="${h}" rx="2" fill="${t.color}"/><text x="${plotW + w / 2}" y="${t.y + fs / 2 - 1}" fill="#fff" font-size="${fs}" text-anchor="middle" font-family="${FONT}">${esc(Number(t.p).toFixed(e.base.digits))}</text>`)
      .join('');
  }
}

/* Двигун графіка живе в ref сторінки: гаряча заміна модуля лишила б
   старий екземпляр зі старим кодом. Тому при зміні — повне оновлення. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
