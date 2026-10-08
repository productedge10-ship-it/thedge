import { createChart, CandlestickSeries, createSeriesMarkers, createTextWatermark, LineStyle, PriceScaleMode } from 'lightweight-charts';
import { aggregate, tfById, tfIndexOfBase, barAt, atr, lowerBound, upperBound, sessionOf } from '../../../lib/candles/agg';
import { chartOptions, seriesOptions, withAlpha, DATA_KEYS } from '../../../lib/candles/chartPrefs';
import { fmtStamp } from '../../../lib/candles/timefmt';
import { t as tx } from '../../../lib/lang';

/* ==================================================================
   Рушій графіка з реплеєм.

   Окремий клас, а не React-стан: на швидкості 0.1 с графік
   оновлюється десять разів на секунду, а позиція — на кожну хвилинку
   всередині кроку. Перемальовувати через React весь екран заради
   цього нема сенсу; сторінка отримує лише підсумки (ціна, позиція,
   закриті угоди) через колбеки.

   Позначення:
   • base   — свічки з файлу (зазвичай M1), лежать у масивах;
   • agg    — поточний таймфрейм, зібраний з base;
   • cut    — скільки base-свічок «вже сталося» (null — реплей вимкнено);
   • win    — з якої свічки agg почато дані графіка. Мільйон свічок
              у бібліотеку разом не віддаємо: стартуємо з останніх
              CHUNK і доклеюємо ліворуч, коли людина прокручує назад —
              так само, як TradingView довантажує історію.
================================================================== */

const CHUNK = 12000;
const CUT_MS = 220;

export default class ChartEngine {
  constructor(container, overlay, prefs, cb) {
    this.el = container;
    this.ov = overlay;
    this.cb = cb;
    this.prefs = prefs;
    this.base = null;
    this.agg = null;
    this.aggCache = new Map();
    this.tf = tfById(prefs.tf).id;
    this.cut = null;
    this.win = 0;
    this.lastK = -1;
    this.pos = null;
    /* Чернетка угоди (видно на графіку до входу) і відкладений ордер. */
    this.draft = null;
    this.order = null;
    /* Ширина рамки угоди у свічках (ручка праворуч) і ризик у $ —
       для підписів «Ціль / Стоп», як на позиції в TV. */
    this.boxBars = 14;
    this.riskUsd = 100;
    this.closed = [];
    this.selecting = false;
    this.hoverLogical = null;
    this.hovering = false;
    this.playing = false;
    this.timer = null;
    this.speedMs = 1000;
    this.extending = false;
    this.anim = null;
    this.cutFx = null;

    this.chart = createChart(container, { ...chartOptions(prefs), autoSize: true });
    this.series = this.chart.addSeries(CandlestickSeries, seriesOptions(prefs, 2));
    this.markers = createSeriesMarkers(this.series, []);
    this.watermark = createTextWatermark(this.chart.panes()[0], { horzAlign: 'center', vertAlign: 'center', lines: [] });

    this.onRange = this.onRange.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(this.onRange);
    this.chart.subscribeCrosshairMove(this.onMove);
    this.chart.subscribeClick(this.onClick);

    this.priceLines = {};
    this.auxLines = {};
    this.host = container;
    this.autoScale = true;
    this.vDown = this.vDown.bind(this);
    this.vMove = this.vMove.bind(this);
    this.vUp = this.vUp.bind(this);
    container.addEventListener('pointerdown', this.vDown);
    container.addEventListener('dblclick', this.vUp);
    container.addEventListener('wheel', this.vUp, { passive: true });
    window.addEventListener('pointermove', this.vMove);
    window.addEventListener('pointerup', this.vUp);
    this.raf = requestAnimationFrame(() => this.loop());
  }

  /* ---------------- рух графіка, як у TV ----------------
     Бібліотека з автомасштабом ігнорує рух мишки вгору-вниз: тягнеш
     навскіс — свічки не йдуть за курсором, а шкала ціни сама скаче.
     У TV інакше: щойно потягнув по вертикалі, автомасштаб вимикається
     і графік їде за мишкою 1 в 1 в обидва боки (кнопка «A» внизу
     справа гасне). Повернути — «A», подвійний клік по шкалі ціни або
     Alt+R. */
  vDown(ev) {
    if (ev.button !== 0 || !this.base) return;
    const ps = this.chart.priceScale('right');
    if (!ps.options().autoScale) { this.vd = null; return; }
    const pane = this.chart.panes()[0]?.getHTMLElement?.();
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    const plotR = r.right - ps.width();
    if (ev.clientX < r.left || ev.clientX > plotR || ev.clientY < r.top || ev.clientY > r.bottom) return;
    this.vd = { y0: ev.clientY, h: r.height, on: false, range: null };
  }

  vMove(ev) {
    const v = this.vd;
    if (!v) return;
    if (!(ev.buttons & 1)) { this.vd = null; return; }
    const dy = ev.clientY - v.y0;
    const ps = this.chart.priceScale('right');
    if (!v.on) {
      if (Math.abs(dy) < 4) return;
      const range = ps.getVisibleRange();
      if (!range) { this.vd = null; return; }
      v.on = true;
      v.range = range;
      ps.setAutoScale(false);
      this.syncAuto();
    }
    const per = (v.range.to - v.range.from) / Math.max(1, v.h);
    ps.setVisibleRange({ from: v.range.from + dy * per, to: v.range.to + dy * per });
  }

  vUp() {
    this.vd = null;
    /* Шкалу ціни могли потягнути або скинути подвійним кліком —
       підтягуємо стан кнопки «A». */
    requestAnimationFrame(() => this.syncAuto());
  }

  syncAuto() {
    const on = !!this.chart.priceScale('right').options().autoScale;
    if (on !== this.autoScale) { this.autoScale = on; this.emit(); }
  }

  setAutoScale(on) {
    this.chart.priceScale('right').applyOptions({ autoScale: on });
    this.syncAuto();
  }

  /* Висоти нижніх панелей: графіки інших інструментів — помітні,
     осцилятори — смужки, як у TV. Пропорції, а не пікселі: setHeight
     однієї панелі відбирав місце в сусідньої. */
  sizePanes() {
    const m = this.linked?.count || 0;
    const panes = this.chart.panes();
    const want = panes.map((pn, i) => (i === 0 ? 1 : i <= m ? 0.5 : 0.22));
    /* Згорнута панель інструмента — смужка на 26 px під назву. Частки
       рахуємо так, щоб саме стільки й вийшло. */
    const shut = panes.map((pn, i) => i > 0 && i <= m && !!this.linked.list[i - 1]?.collapsed);
    const k = shut.filter(Boolean).length;
    if (k) {
      const H = Math.max(200, (this.chart.chartElement()?.clientHeight || 600) - (this.chart.timeScale().height() || 28));
      const open = want.reduce((sum, f, i) => sum + (shut[i] ? 0 : f), 0);
      const f = (26 / Math.max(60, H - 26 * k)) * open;
      shut.forEach((on, i) => { if (on) want[i] = f; });
    }
    panes.forEach((pn, i) => { try { pn.setStretchFactor(want[i]); } catch { /* ок */ } });
  }

  destroy() {
    this.pause();
    cancelAnimationFrame(this.raf);
    this.chart.timeScale().unsubscribeVisibleLogicalRangeChange(this.onRange);
    this.chart.unsubscribeCrosshairMove(this.onMove);
    this.chart.unsubscribeClick(this.onClick);
    this.host.removeEventListener('pointerdown', this.vDown);
    this.host.removeEventListener('dblclick', this.vUp);
    this.host.removeEventListener('wheel', this.vUp);
    window.removeEventListener('pointermove', this.vMove);
    window.removeEventListener('pointerup', this.vUp);
    this.chart.remove();
  }

  /* ---------------- дані ---------------- */

  setData(set) {
    this.pause();
    this.anim = null;
    this.base = set;
    this.aggCache.clear();
    this.noOlder = false;
    this.olderBusy = false;
    this.cut = null;
    this.pos = null;
    this.draft = null;
    this.order = null;
    this.closed = [];
    this.clearPriceLines();
    this.series.applyOptions(seriesOptions(this.prefs, set.digits));
    this.useTf(this.tf, true);
    this.emit();
  }

  /* Старіша історія з сервера: свічки ДО першої наявної. Вигляд,
     реплей, позиція й закриті угоди лишаються на місці — зсуваємо лише
     індекси, бо ліворуч додались свічки. */
  prepend(chunk) {
    if (!this.base || !chunk?.n) return 0;
    const b = this.base;
    const k = lowerBound(chunk.t, b.t[0]);
    if (k <= 0) return 0;
    this.finishAnim();
    const n = b.n + k;
    const cat = (A, B, T) => { const out = new T(n); out.set(A.subarray(0, k)); out.set(B, k); return out; };
    const hasV = !!(b.v && chunk.v);
    const oldFirstAgg = this.agg ? this.agg.t[0] : null;
    this.base = {
      ...b, n,
      t: cat(chunk.t, b.t, Int32Array), o: cat(chunk.o, b.o, Float64Array), h: cat(chunk.h, b.h, Float64Array),
      l: cat(chunk.l, b.l, Float64Array), c: cat(chunk.c, b.c, Float64Array), v: hasV ? cat(chunk.v, b.v, Float64Array) : null,
    };
    this.aggCache.clear();
    if (this.cut != null) this.cut += k;
    if (this.cutFx) this.cutFx.cut += k;
    if (this.pos) { this.pos.entryIdx += k; (this.pos.partials || []).forEach((q) => { q.idx += k; }); }
    if (this.order?.placedIdx != null) this.order.placedIdx += k;
    this.closed.forEach((c) => { c.entryIdx += k; c.exitIdx += k; (c.partials || []).forEach((q) => { q.idx += k; }); });
    (this.hist || []).forEach((h) => {
      h.cut += k;
      if (h.pos) { h.pos.entryIdx += k; (h.pos.partials || []).forEach((q) => { q.idx += k; }); }
      if (h.order?.placedIdx != null) h.order.placedIdx += k;
    });
    if (this.snap?.saved?.cut != null) this.snap.saved.cut += k;
    if (this.snap?.saved?.hist) this.snap.saved.hist.forEach((h) => { h.cut += k; });
    /* Угоди з бази, старші за завантажену історію, — тепер, може, вже влазять. */
    this.attachPending();
    if (!this.agg) return k;
    this.agg = this.getAgg(this.tf);
    /* Межі місяців — північ брокера, тож свічки до D1 включно не
       розрізаються: стара перша свічка просто зсувається вправо. */
    const aShift = oldFirstAgg == null ? 0 : lowerBound(this.agg.t, oldFirstAgg);
    this.win += aShift;
    this.lastK += aShift;
    if (this.tfAnchor) { this.tfAnchor.from += aShift; this.tfAnchor.to += aShift; }
    this.keepRange = null;
    this.indicators?.invalidate();
    /* Одразу доклеюємо нове вікно ліворуч, якщо трейдер біля краю. */
    this.onRange(this.chart.timeScale().getVisibleLogicalRange());
    this.emit();
    return k;
  }

  /* Біля лівого краю завантаженого — просимо сторінку довантажити. */
  wantOlder() {
    if (this.olderBusy || this.noOlder || !this.cb.needOlder) return;
    this.olderBusy = true;
    Promise.resolve(this.cb.needOlder())
      .then((more) => { if (more === false) this.noOlder = true; })
      .catch(() => { /* сторінка сама покаже помилку */ })
      .finally(() => { this.olderBusy = false; });
  }

  getAgg(id) {
    if (!this.aggCache.has(id)) this.aggCache.set(id, aggregate(this.base, tfById(id)));
    return this.aggCache.get(id);
  }

  useTf(id, fresh = false) {
    if (!this.base) { this.tf = id; return; }
    this.finishAnim();
    /* Таймфрейм дрібніший за файл не зібрати: з H1 не буде M5. */
    const want = tfById(id);
    const tf = want.sec < this.base.baseSec ? tfById('M1') : want;

    /* Як у TV: після зміни таймфрейму лишаємось на тому самому місці
       історії. Якщо видно останню свічку — і далі «живий» край з тим
       самим відступом. Якщо гортали назад — та сама дата лишається біля
       правого краю (або лівого, якщо так вибрано в налаштуваннях).
       Масштаб (ширина свічки) теж не змінюється. */
    let anchor = null;
    const r = !fresh && this.agg ? this.chart.timeScale().getVisibleLogicalRange() : null;
    /* Якщо після попереднього перемикання графік не чіпали — беремо ту
       саму точку відліку, а не рахуємо з нового виду. Так 1H → D → 1m →
       1H повертає рівно туди, де був, навіть якщо на D вид підрізався
       біля кінця історії. */
    const same = r && this.tfAnchor && this.tfAnchor.tf === this.tf
      && Math.abs(this.win + r.from - this.tfAnchor.from) < 1 && Math.abs(this.win + r.to - this.tfAnchor.to) < 1;
    if (same) anchor = this.tfAnchor.anchor;
    else if (r) {
      const span = r.to - r.from;
      const lastL = this.lastK - this.win;
      if (!this.prefs.keepLeft && r.to >= lastL + 0.5) anchor = { live: true, span, offset: r.to - lastL };
      else {
        /* Тримаємо середину екрана: те, на що дивишся, лишається по
           центру, а більший ТФ просто показує більше навколо. */
        const edge = this.prefs.keepLeft ? r.from : (r.from + r.to) / 2;
        const kf = this.win + edge;
        const k0 = Math.max(0, Math.min(this.lastK, Math.floor(kf)));
        /* Час точки з дробовою частиною — щоб не зсуватись на півсвічки
           при кожному перемиканні. */
        const t = this.agg.t[k0] + (kf - k0) * this.agg.sec;
        anchor = { live: false, span, t, left: !!this.prefs.keepLeft };
      }
    }

    /* Ціну підганяємо під нові свічки: інакше на 4H вони вилазили за
       верх екрана, якщо шкалу раніше тягнули вручну. */
    if (anchor) { this.chart.priceScale('right').applyOptions({ autoScale: true }); this.autoScale = true; }
    this.tf = tf.id;
    this.agg = this.getAgg(this.tf);
    this.lastK = this.cut == null ? this.agg.n - 1 : tfIndexOfBase(this.agg, this.cut - 1);
    this.win = Math.max(0, this.lastK + 1 - CHUNK);
    if (anchor?.live) {
      const lastL = this.lastK - this.win;
      this.render({ from: lastL + anchor.offset - anchor.span, to: lastL + anchor.offset });
    } else if (anchor) {
      const k = Math.max(0, Math.min(this.lastK, upperBound(this.agg.t, anchor.t, 0, this.agg.n) - 1));
      const frac = Math.max(0, Math.min(1, (anchor.t - this.agg.t[k]) / this.agg.sec));
      /* Потрібна дата має бути в завантаженому вікні, ще й із запасом
         ліворуч на всю ширину екрана. */
      const need = k - Math.ceil(anchor.span) - 300;
      if (need < this.win) this.win = Math.max(0, need);
      const at = k - this.win + frac;
      let to = anchor.left ? at + anchor.span : at + anchor.span / 2;
      /* Не показуємо пустоту праворуч від останньої свічки більшу за
         звичайний відступ — тоді краще просто край графіка. */
      to = Math.min(to, this.lastK - this.win + Math.max(this.prefs.rightOffset, 2));
      to = Math.max(to, anchor.span * 0.25);
      this.render({ from: to - anchor.span, to });
    } else {
      this.render();
      this.chart.timeScale().scrollToPosition(this.prefs.rightOffset, false);
    }
    this.tfAnchor = anchor && this.keepRange
      ? { tf: this.tf, anchor, from: this.win + this.keepRange.from, to: this.win + this.keepRange.to }
      : null;
    this.updateWatermark();
    this.updateMarkers();
    this.updateAux();
    this.emit();
  }

  /* Свічка k так, як її видно зараз (з урахуванням реплею й кольору
     «від попереднього закриття»). */
  bar(k, cut = this.cut) {
    const a = this.agg;
    const b = (cut == null || k < this.lastK)
      ? { time: a.t[k], open: a.o[k], high: a.h[k], low: a.l[k], close: a.c[k] }
      : barAt(a, this.base, k, cut);
    return this.paint(b, k);
  }

  paint(b, k) {
    const p = this.prefs;
    if (!p.prevCloseColor || k < 1) return b;
    const up = b.close >= this.agg.c[k - 1];
    return {
      ...b,
      color: p.body ? (up ? p.up : p.down) : 'rgba(0,0,0,0)',
      borderColor: up ? p.borderUp : p.borderDown,
      wickColor: up ? p.wickUp : p.wickDown,
    };
  }

  render(keep = null) {
    const out = new Array(Math.max(0, this.lastK - this.win + 1));
    for (let k = this.win; k <= this.lastK; k += 1) out[k - this.win] = this.bar(k);
    this.indicators?.clearData();
    this.series.setData(out);
    this.linked?.render();
    /* Індикатори — одразу, в тому ж кадрі: інакше на мить у графіку
       лишались би точки старого таймфрейму поруч із новими свічками, і
       бібліотека падала на рендері («Value is null»). */
    this.indicators?.invalidate(true);
    if (keep) {
      this.chart.timeScale().setVisibleLogicalRange(keep);
      /* Бібліотека застосовує діапазон із запізненням, і до наступного
         кадру getVisibleLogicalRange віддає проміжне значення. Доклеювання
         історії в onRange брало б саме його і зсувало вид. */
      this.keepRange = keep;
      cancelAnimationFrame(this.keepRaf);
      this.keepRaf = requestAnimationFrame(() => { this.keepRaf = requestAnimationFrame(() => { this.keepRange = null; }); });
    }
  }

  /* Доклеюємо історію ліворуч, коли до краю лишилось мало свічок. */
  onRange(r) {
    if (!r || !this.agg) return;
    if (this.prefs.hiLo) this.updateHiLo();
    this.linked?.ensureSoon();
    /* Наперед, за кілька екранів до краю — щоб не впиратись у стіну. */
    if (this.win === 0 && r.from < Math.max(1500, 3 * (r.to - r.from))) this.wantOlder();
    if (this.extending || this.win === 0 || r.from > 400) return;
    this.extending = true;
    requestAnimationFrame(() => {
      const range = this.keepRange || this.chart.timeScale().getVisibleLogicalRange();
      const add = Math.min(this.win, CHUNK);
      this.win -= add;
      this.render(range ? { from: range.from + add, to: range.to + add } : null);
      this.updateMarkers();
      this.extending = false;
    });
  }

  /* ---------------- вигляд ---------------- */

  applyPrefs(p) {
    const prev = this.prefs;
    this.prefs = p;
    /* rightOffset у опціях бібліотека трактує як «прокрути до краю» —
       будь-яка зміна налаштувань (таймфрейм, індикатор) кидала б графік
       у кінець історії. Тому передаємо його лише коли він змінився. */
    const opts = chartOptions(p);
    if (prev.rightOffset === p.rightOffset) { const { rightOffset, ...ts } = opts.timeScale; opts.timeScale = ts; }
    this.chart.applyOptions(opts);
    /* Курсор «стрілка» ховає перехрестя — опції графіка це скинули б. */
    this.drawings?.applyCursor();
    this.series.applyOptions(seriesOptions(p, this.base?.digits ?? 2));
    this.linked?.restyle();
    this.updateWatermark();
    if (!this.agg) return;
    if (DATA_KEYS.some((k) => prev[k] !== p[k]) && (p.prevCloseColor || prev.prevCloseColor)) {
      this.render(this.chart.timeScale().getVisibleLogicalRange());
    }
    if (prev.rightOffset !== p.rightOffset) this.chart.timeScale().scrollToPosition(p.rightOffset, false);
    this.syncPriceLines();
    this.updateMarkers();
    this.updateAux();
  }

  updateWatermark() {
    const p = this.prefs;
    const label = tfById(this.tf).label;
    this.watermark.applyOptions({
      visible: !!p.watermark && !!this.base,
      lines: this.base ? [{ text: `${this.base.symbol}, ${label}`, color: p.watermarkColor, fontSize: 64, fontStyle: '600' }] : [],
    });
  }

  resetView() {
    this.chart.priceScale('right').applyOptions({ autoScale: true });
    this.chart.timeScale().applyOptions({ barSpacing: 6 });
    this.chart.timeScale().scrollToPosition(this.prefs.rightOffset, false);
    this.syncAuto();
  }

  /* ---------------- курсор і легенда ---------------- */

  onMove(param) {
    this.hoverLogical = param?.logical ?? null;
    this.hovering = param?.time != null && param.logical != null;
    if (!this.agg || this.lastK < 0) return;
    let k = this.lastK;
    if (this.hovering) k = Math.max(0, Math.min(this.lastK, this.win + Math.round(param.logical)));
    const b = (this.anim && k === this.lastK && this.anim.shown) || this.bar(k);
    const prev = k > 0 ? this.agg.c[k - 1] : b.open;
    this.cb.onLegend?.(b, prev, k);
  }

  /* Без курсора над графіком легенда показує останню свічку — як у TV. */
  legendLast() {
    if (!this.hovering) this.onMove(null);
  }

  /* ---------------- реплей ---------------- */

  get replay() { return this.cut != null; }

  startSelect() {
    if (!this.base || this.snap) return;
    this.pause();
    this.finishAnim();
    this.selecting = true;
    this.emit();
  }

  cancelSelect() {
    this.selecting = false;
    this.emit();
  }

  onClick(param) {
    if (!this.selecting) { this.pickClosed(param?.point); return; }
    if (param?.logical == null) return;
    const rel = Math.round(param.logical);
    const k = Math.max(1, Math.min(this.lastK, this.win + rel));
    this.selecting = false;
    /* Обрана свічка — остання видима, як у TV. */
    const cut = this.agg.s[k + 1];
    if (!this.prefs.animCut) { this.setCut(cut, true); return; }
    /* Вигляд не стрибає — свічки ліворуч лишаються на своїх місцях,
       праві коротко гаснуть (див. loop). */
    this.cutFx = { rel: k - this.win, t0: performance.now(), cut };
    this.emit();
  }

  /* Реплей «звідси» (меню графіка): свічка під курсором стає останньою. */
  startAtX(x) {
    if (!this.base || this.snap) return;
    const l = this.chart.timeScale().coordinateToLogical(x);
    if (l == null) return;
    const k = Math.max(1, Math.min(this.lastK, this.win + Math.round(l)));
    this.selecting = false;
    this.setCut(this.agg.s[k + 1] ?? this.base.n, true);
  }

  /* Старт реплею з дати: показано все ДО неї. */
  startAtTime(sec) {
    if (!this.base) return;
    const i = lowerBound(this.base.t, sec);
    this.selecting = false;
    this.setCut(Math.max(1, Math.min(this.base.n - 1, i)), false);
  }

  setCut(cut, keepView = false) {
    this.pause();
    this.finishAnim();
    if (this.pos) this.closePosition('manual');
    this.draft = null;
    this.order = null;
    const r = keepView ? this.chart.timeScale().getVisibleLogicalRange() : null;
    const oldWin = this.win;
    this.cut = cut;
    this.hist = [];
    this.lastK = tfIndexOfBase(this.agg, cut - 1);
    this.win = Math.max(0, this.lastK + 1 - CHUNK);
    if (r) {
      const d = oldWin - this.win;
      this.render({ from: r.from + d, to: r.to + d });
    } else {
      this.render();
      this.chart.timeScale().scrollToPosition(Math.max(20, this.prefs.rightOffset), false);
    }
    this.updateMarkers();
    this.updateAux();
    this.emit();
  }

  exitReplay() {
    this.pause();
    this.finishAnim();
    if (this.pos) this.closePosition('manual');
    this.draft = null;
    this.order = null;
    this.selecting = false;
    this.cutFx = null;
    this.cut = null;
    this.hist = [];
    this.clearPriceLines();
    this.useTf(this.tf);
  }

  /* Один крок = одна свічка поточного таймфрейму. Усередині кроку
     проходимо кожну базову свічку — інакше на H4 стоп і тейк в одній
     свічці вирішувались би навмання. */
  step(manual = false) {
    if (!this.replay || this.snap) return false;
    this.finishAnim();
    if (this.cut >= this.base.n) { this.pause(); this.emit(); return false; }
    const k = tfIndexOfBase(this.agg, this.cut);
    /* Остання свічка історії: наступної немає — край і є кінець файлу.
       Раніше тут виходив undefined, і «Пуск» далі крутився вхолосту. */
    let next = this.agg.s[k + 1] ?? this.base.n;
    /* Крок реплею окремо від таймфрейму графіка (як у FX Replay): на 1H
       можна йти по 15 хвилин — свічка годинника росте частинами. Більший
       крок за ТФ графіка — кілька свічок за раз. */
    const sTf = this.stepTf ? tfById(this.stepTf) : null;
    if (sTf && sTf.sec >= (this.base.baseSec || 60) && sTf.sec !== this.agg.sec) {
      const sa = this.getAgg(sTf.id);
      const sn = sa.s[tfIndexOfBase(sa, this.cut) + 1] ?? this.base.n;
      if (sTf.sec > this.agg.sec) return this.advanceTo(sn, true);
      next = Math.min(next, sn);
    }
    if (next <= this.cut) next = this.cut + 1;
    const from = this.cut;
    this.pushHist();
    /* lastK і cut рухаємо одразу: наступний крок не має повторити цей. */
    this.cut = next;
    this.lastK = k;

    const dur = manual ? 260 : Math.min(700, this.speedMs * 0.7);
    if (!this.prefs.animCandles || dur < 90) {
      this.series.update(this.bar(k));
      this.settle(from, next);
      return true;
    }
    this.anim = { k, from, next, frames: this.framesFor(k, from, next), t0: performance.now(), dur, shown: null };
    return true;
  }

  /* Кадри появи свічки. Якщо всередині є кілька базових свічок (H1 з
     хвилинок) — це справжній шлях ціни: свічка росте так, як росла
     насправді. Якщо одна (M1) — шлях open → екстремум → екстремум →
     close, як тік-реплей у TV. */
  framesFor(k, from, next) {
    const frames = [];
    const n = next - from;
    if (n > 1) {
      const stepN = Math.max(1, Math.floor(n / 28));
      for (let j = from + 1; j <= next; j += stepN) frames.push(barAt(this.agg, this.base, k, j));
      frames.push(barAt(this.agg, this.base, k, next));
      return frames;
    }
    const fin = barAt(this.agg, this.base, k, next);
    const prevPart = k === tfIndexOfBase(this.agg, from - 1) && from > this.agg.s[k] ? barAt(this.agg, this.base, k, from) : null;
    const o = prevPart ? prevPart.close : fin.open;
    const path = fin.close >= fin.open ? [o, fin.low, fin.high, fin.close] : [o, fin.high, fin.low, fin.close];
    let hi = prevPart ? prevPart.high : o; let lo = prevPart ? prevPart.low : o;
    const SEG = 7;
    for (let s = 0; s < path.length - 1; s += 1) {
      for (let q = 1; q <= SEG; q += 1) {
        const px = path[s] + (path[s + 1] - path[s]) * (q / SEG);
        hi = Math.max(hi, px); lo = Math.min(lo, px);
        frames.push({ time: fin.time, open: fin.open, high: hi, low: lo, close: px });
      }
    }
    frames.push(fin);
    return frames;
  }

  tickAnim(now) {
    const a = this.anim;
    if (!a) return;
    const t = Math.min(1, (now - a.t0) / a.dur);
    const idx = Math.min(a.frames.length - 1, Math.floor(t * a.frames.length));
    const f = this.paint(a.frames[idx], a.k);
    if (f !== a.shown) { this.series.update(f); a.shown = f; this.legendLast(); }
    if (t >= 1) this.finishAnim();
  }

  finishAnim() {
    const a = this.anim;
    if (!a) return;
    this.anim = null;
    this.series.update(this.bar(a.k));
    this.settle(a.from, a.next);
  }

  /* Свічка домальована — тепер перевіряємо позицію. Так вихід по
     стопу не зʼявляється раніше, ніж ціна до нього «дійшла» на екрані. */
  settle(from, next) {
    const had = this.closed.length;
    const hadPos = !!this.pos;
    for (let i = from; i < next && (this.pos || this.order); i += 1) {
      if (this.order) this.tryFill(i);
      else this.checkPos(i);
    }
    if (!hadPos && this.pos) { this.syncPriceLines(); this.updateMarkers(); }
    else if (this.draft || this.order || this.pos?.trail) this.syncPriceLines();
    if (this.pos) this.pos.bars += 1;
    if (this.closed.length !== had) this.updateMarkers();
    this.updateAux();
    this.linked?.render();
    this.indicators?.invalidate();
    this.emit();
  }

  /* ---------------- крок назад і стрибки ----------------
     Перед кожним кроком запамʼятовуємо, де були (cut у хвилинках — не
     залежить від таймфрейму) і що було з позицією/ордером. Назад —
     просто повертаємо. Через закриту угоду назад не йдемо: вона вже
     могла записатись у бектест, і «відмотати» її було б нечесно. */
  pushHist() {
    if (!this.hist) this.hist = [];
    const cl = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    this.hist.push({ cut: this.cut, pos: cl(this.pos), order: cl(this.order), closedN: this.closed.length });
    if (this.hist.length > 5000) this.hist.shift();
  }

  get canBack() { const h = this.hist?.[this.hist.length - 1]; return !!h && this.closed.length <= h.closedN; }

  /* Перемістити край реплею на cut, не смикаючи вид: якщо видно
     останню свічку — край їде разом з нею, інакше вид стоїть. */
  moveCut(cut) {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const oldWin = this.win;
    const oldL = this.lastK - oldWin;
    this.cut = cut;
    this.lastK = tfIndexOfBase(this.agg, cut - 1);
    if (this.lastK < this.win || this.lastK - this.win + 1 > CHUNK * 1.5) this.win = Math.max(0, this.lastK + 1 - CHUNK);
    const newL = this.lastK - this.win;
    let keep = null;
    if (r) {
      const span = r.to - r.from;
      const live = r.to >= oldL - 0.5;
      keep = live ? { from: newL + (r.to - oldL) - span, to: newL + (r.to - oldL) } : { from: r.from + oldWin - this.win, to: r.to + oldWin - this.win };
    }
    this.render(keep);
  }

  stepBack() {
    if (!this.replay || this.snap) return false;
    this.pause();
    this.finishAnim();
    const h = this.hist?.[this.hist.length - 1];
    if (!h) return false;
    if (this.closed.length > h.closedN) { this.cb.onNotice?.('back_closed'); return false; }
    this.hist.pop();
    this.moveCut(h.cut);
    this.pos = h.pos;
    this.order = h.order;
    this.syncPriceLines();
    this.updateMarkers();
    this.updateAux();
    this.emit();
    return true;
  }

  /* Стрибок уперед до хвилинки target. Позицію й ордер перевіряємо
     на кожній хвилинці дорогою; якщо угода закрилась чи ордер
     спрацював — зупиняємось на кінці тієї свічки, щоб людина побачила
     подію, а не пролетіла її. */
  advanceTo(target, keepPlaying = false) {
    if (!this.replay || !this.base || this.snap) return false;
    if (!keepPlaying) this.pause();
    this.finishAnim();
    let to = Math.min(this.base.n, Math.max(this.cut + 1, Math.round(target)));
    if (to <= this.cut) return false;
    this.pushHist();
    const from = this.cut;
    const k0 = this.lastK;
    for (let i = from; i < to && (this.pos || this.order); i += 1) {
      const hadPos = !!this.pos; const hadOrder = !!this.order;
      if (this.order) this.tryFill(i); else this.checkPos(i);
      if ((hadOrder && !this.order) || (hadPos && !this.pos)) {
        const edge = this.agg.s[tfIndexOfBase(this.agg, i) + 1];
        to = Math.min(to, edge ?? to);
      }
    }
    this.moveCut(to);
    if (this.pos) this.pos.bars += Math.max(1, this.lastK - k0);
    this.syncPriceLines();
    this.updateMarkers();
    this.updateAux();
    this.emit();
    return true;
  }

  /* Куди стрибати. */
  jumpBars(n) {
    if (!this.replay) return false;
    const k = tfIndexOfBase(this.agg, this.cut);
    return this.advanceTo(this.agg.s[k + n] ?? this.base.n);
  }

  /* До відкриття наступного дня (час брокера) — останньою видно
     свічку перед ним. */
  jumpDay() {
    if (!this.replay) return false;
    const b = this.base;
    const day = Math.floor(b.t[this.cut - 1] / 86400);
    let i = this.cut + 1;
    while (i < b.n && Math.floor(b.t[i] / 86400) === day) i += 1;
    return this.advanceTo(i);
  }

  /* До відкриття сесії: 'Asia' | 'London' | 'New York'. */
  jumpSession(name) {
    if (!this.replay) return false;
    const b = this.base;
    let prev = sessionOf(b.t[this.cut]);
    for (let i = this.cut + 1; i < b.n; i += 1) {
      const cur = sessionOf(b.t[i]);
      if (cur === name && prev !== name) return this.advanceTo(i);
      prev = cur;
    }
    return this.advanceTo(b.n);
  }

  /* Показати закриту угоду: прокрутити до неї й виділити. */
  focusTrade(id) {
    const t = this.closed.find((x) => x.id === id);
    if (!t || !this.agg) return;
    const k0 = tfIndexOfBase(this.agg, t.entryIdx);
    const k1 = tfIndexOfBase(this.agg, t.exitIdx);
    if (k0 < this.win) { this.win = Math.max(0, k0 - 400); this.render(); }
    const span = Math.max(80, (k1 - k0) * 3);
    const mid = (k0 + k1) / 2 - this.win;
    this.chart.timeScale().setVisibleLogicalRange({ from: mid - span / 2, to: mid + span / 2 });
    this.selClosed = id;
    this.emit();
  }

  /* Знімок графіка разом із нашим шаром (угоди, малюнки) — для
     скріншота угоди в журналі. */
  async snapshot() {
    try {
      const cnv = this.chart.takeScreenshot();
      const W = cnv.width; const H = cnv.height;
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const ctx = out.getContext('2d');
      ctx.drawImage(cnv, 0, 0);
      const el = this.chart.chartElement();
      const cw = el.clientWidth; const ch = el.clientHeight;
      if (this.ov && cw && ch) {
        const svg = this.ov.cloneNode(true);
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', cw);
        svg.setAttribute('height', ch);
        svg.setAttribute('viewBox', `0 0 ${cw} ${ch}`);
        const xml = new XMLSerializer().serializeToString(svg);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
        ctx.drawImage(img, 0, 0, W, H);
      }
      return await new Promise((res) => out.toBlob(res, 'image/webp', 0.92));
    } catch {
      return null;
    }
  }

  /* ---------------- знімки угод ----------------
     Не картинка, а стан: таймфрейм, час реплею, видима ділянка й копія
     малюнків. Два знімки на угоду — на вході й на виході. Відкриваються
     на цьому ж графіку (див. openSnap), тож їх можна гортати й зумити. */

  /* Час для логічного індексу (і за правим краєм — уперед кроком ТФ). */
  timeAtLogical(l) {
    const a = this.agg;
    const k = this.win + l;
    if (k <= 0) return a.t[0] + k * a.sec;
    if (k >= this.lastK) return a.t[this.lastK] + (k - this.lastK) * a.sec;
    const f = Math.floor(k);
    return a.t[f] + (k - f) * ((a.t[f + 1] ?? a.t[f] + a.sec) - a.t[f]);
  }

  logicalAtTime(t) {
    const a = this.agg;
    const last = this.lastK;
    if (t >= a.t[last]) return last + (t - a.t[last]) / a.sec - this.win;
    const k = Math.max(0, upperBound(a.t, t, 0, last + 1) - 1);
    const span = Math.max(a.sec, (a.t[k + 1] ?? a.t[k] + a.sec) - a.t[k]);
    return k + Math.min(0.999, (t - a.t[k]) / span) - this.win;
  }

  captureSnap(t) {
    try {
      const r = this.chart.timeScale().getVisibleLogicalRange();
      const dm = this.drawings;
      return {
        tf: this.tf,
        t,
        view: r ? { from: this.timeAtLogical(r.from), to: this.timeAtLogical(r.to) } : null,
        drawings: dm ? JSON.parse(JSON.stringify(dm.list.filter((d) => dm.visible(d)))) : [],
      };
    } catch {
      return { tf: this.tf, t, view: null, drawings: [] };
    }
  }

  /* Угоди з бази (минулі заходи): кладемо на графік ті, що влазять у
     завантажену історію; старші чекають, поки історію догрузять. */
  loadClosed(list) {
    this.pendingClosed = [...(list || [])];
    this.closed = this.closed.filter((c) => !String(c.id).startsWith('db'));
    this.attachPending();
  }

  attachPending() {
    const b = this.base;
    if (!b || !this.pendingClosed?.length) return;
    const left = [];
    this.pendingClosed.forEach((t) => {
      if (t.entryT < b.t[0] || t.exitT > b.t[b.n - 1]) { left.push(t); return; }
      const entryIdx = Math.min(b.n - 1, lowerBound(b.t, t.entryT));
      const exitIdx = Math.min(b.n - 1, lowerBound(b.t, t.exitT));
      const partials = (t.partials || []).map((q) => ({ ...q, idx: q.t ? Math.min(b.n - 1, lowerBound(b.t, q.t)) : exitIdx }));
      this.closed.push({ ...t, entryIdx, exitIdx, partials });
    });
    this.pendingClosed = left;
    this.closed.sort((x, y) => x.entryT - y.entryT);
    this.updateMarkers();
    this.emit();
  }

  /* Відкрити знімок угоди. which: 'entry' | 'exit'. after — показати,
     що було далі (але не далі, ніж ти вже дійшов у реплеї). */
  openSnap(id, which = 'entry', after = false) {
    const trade = this.closed.find((x) => x.id === id);
    if (!trade || !this.base) return false;
    this.pause();
    this.finishAnim();
    if (!this.snap) {
      const r = this.chart.timeScale().getVisibleLogicalRange();
      this.snap = {
        saved: {
          cut: this.cut, tf: this.tf, hist: this.hist,
          range: r ? { from: r.from + this.win, to: r.to + this.win } : null,
          drawings: this.drawings ? this.drawings.list : null,
        },
      };
      this.hist = [];
      this.clearPriceLines();
      if (this.drawings) { this.drawings.readOnly = true; this.drawings.select(null); this.drawings.setTool?.(null); }
    }
    Object.assign(this.snap, { id, which, after, trade });
    this.applySnap();
    return true;
  }

  applySnap() {
    const s = this.snap;
    const t = s.trade;
    const b = this.base;
    const shot = t.snaps?.[s.which] || null;
    const tf = shot?.tf || t.tf || this.tf;
    const at = s.which === 'entry' ? t.entryT : t.exitT;
    /* Межа «далі»: не далі за реплей, у якому ти зараз. */
    const limitT = s.saved.cut != null ? b.t[s.saved.cut - 1] : b.t[b.n - 1];
    let cutT = shot?.t ?? at;
    if (s.after) cutT = Math.min(limitT, Math.max(cutT, t.exitT) + tfById(tf).sec * 120);
    cutT = Math.min(cutT, limitT);
    s.cutT = cutT;
    this.cut = Math.max(1, Math.min(b.n, upperBound(b.t, cutT)));
    this.useTf(tf, true);
    /* Вид — як був у момент знімка; якщо його немає — угода по центру. */
    let from; let to;
    if (shot?.view && !s.after) { from = this.logicalAtTime(shot.view.from); to = this.logicalAtTime(shot.view.to); }
    else {
      const a = this.logicalAtTime(t.entryT); const z = this.logicalAtTime(Math.min(t.exitT, cutT));
      const span = Math.max(80, (z - a) * 3);
      from = (a + z) / 2 - span / 2; to = (a + z) / 2 + span / 2;
      if (s.after) { to = this.lastK - this.win + 8; from = Math.min(from, to - span); }
    }
    if (from < 0 && this.win > 0) {
      const need = Math.max(0, this.win + Math.floor(from) - 50);
      const d = this.win - need;
      this.win = need;
      this.render();
      from += d; to += d;
    }
    this.chart.timeScale().setVisibleLogicalRange({ from, to });
    if (this.drawings) this.drawings.setList(JSON.parse(JSON.stringify(shot?.drawings || s.saved.drawings || [])));
    this.updateMarkers();
    this.updateAux();
    this.emit();
  }

  closeSnap() {
    const s = this.snap;
    if (!s) return false;
    this.snap = null;
    const sv = s.saved;
    this.cut = sv.cut;
    this.useTf(sv.tf, true);
    this.hist = sv.hist || [];
    if (sv.range) {
      if (sv.range.from < this.win) { this.win = Math.max(0, Math.floor(sv.range.from) - 300); this.render(); }
      this.chart.timeScale().setVisibleLogicalRange({ from: sv.range.from - this.win, to: sv.range.to - this.win });
    }
    if (this.drawings) { this.drawings.readOnly = false; this.drawings.setList(sv.drawings || []); }
    this.syncPriceLines();
    this.updateMarkers();
    this.updateAux();
    this.emit();
    return true;
  }

  /* Шкала ціни: звичайна, логарифмічна чи у відсотках — як «L» і «%» у TV. */
  setScaleMode(mode) {
    this.scaleMode = mode;
    const m = mode === 'log' ? PriceScaleMode.Logarithmic : mode === 'pct' ? PriceScaleMode.Percentage : PriceScaleMode.Normal;
    try { this.chart.priceScale('right').applyOptions({ mode: m }); } catch { /* ок */ }
    this.emit();
  }

  /* Перший крок — одразу після натискання, а не через інтервал: на
     повільній швидкості здавалось, що «Пуск» не спрацював. Помилка в
     кроці більше не зупиняє програвання намертво: перемальовуємо графік
     і йдемо далі. */
  play(ms) {
    if (ms) this.speedMs = ms;
    if (!this.replay || this.snap) return;
    this.pause();
    if (this.cut >= this.base.n) { this.emit(); return; }
    this.playing = true;
    this.emit();
    const tick = () => {
      if (!this.playing) return;
      let ok;
      try {
        ok = this.step();
      } catch (err) {
        console.warn('[replay] step failed, redrawing', err);
        this.anim = null;
        try { this.useTf(this.tf); } catch { /* ок */ }
        ok = this.cut < this.base.n;
      }
      if (!ok || !this.playing) { this.pause(); return; }
      this.timer = setTimeout(tick, this.speedMs);
    };
    tick();
  }

  setStepTf(id) {
    this.stepTf = id || null;
    this.emit();
  }

  /* Наступний крок сам візьме нову швидкість — не перезапускаємо. */
  setSpeed(ms) {
    this.speedMs = ms;
  }

  pause() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.playing) { this.playing = false; this.emit(); }
  }

  /* ---------------- позиція ---------------- */

  price() {
    if (!this.base) return 0;
    const i = this.replay ? this.cut - 1 : this.base.n - 1;
    return this.base.c[i];
  }

  defaultDistance() {
    const d = atr(this.agg, this.base, this.lastK, this.cut ?? this.base.n);
    return d > 0 ? d : this.price() * 0.002;
  }

  openPosition(side, { rr = 2, sl = null, tp = null, note = '', meta = null } = {}) {
    if (!this.replay || this.pos || this.snap) return;
    this.finishAnim();
    const entry = this.price();
    const d = this.defaultDistance() * (this.prefs.atrMult || 1);
    const dir = side === 'LONG' ? 1 : -1;
    /* Рівні з чернетки — якщо вони по правильний бік ціни. */
    const okSl = sl != null && Number.isFinite(sl) && (dir > 0 ? sl < entry : sl > entry);
    const okTp = tp != null && Number.isFinite(tp) && (dir > 0 ? tp > entry : tp < entry);
    const s0 = okSl ? sl : entry - dir * d;
    this.pos = {
      side, entry, sl: s0, sl0: s0, tp: okTp ? tp : entry + dir * Math.abs(entry - s0) * rr, size: 1, realized: 0,
      entryIdx: this.cut - 1, entryT: this.base.t[this.cut - 1], bars: 0, tf: this.tf, note, meta: meta || null,
    };
    this.pos.snapEntry = this.captureSnap(this.pos.entryT);
    this.draft = null;
    this.order = null;
    this.syncPriceLines();
    this.updateMarkers();
    this.emit();
  }

  setLevels({ sl, tp }) {
    const p = this.pos;
    if (!p) return;
    this.finishAnim();
    const now = this.price();
    const long = p.side === 'LONG';
    /* Мінімальна відстань рівня від ціни: тік або 5% ATR. Без неї стоп,
       притягнутий упритул до входу, давав ризик у мільйонну частку
       пункту — і угода в «−90 000 000R». */
    const tick = 1 / 10 ** (this.base?.digits ?? 2);
    const gap = Math.max(tick * 2, this.defaultDistance() * 0.05);
    if (sl != null && Number.isFinite(sl)) {
      /* Стоп не може стояти по той бік ціни — він спрацював би одразу. */
      p.sl = long ? Math.min(sl, now - gap) : Math.max(sl, now + gap);
      /* Поки не пройшло жодної свічки — це ще планування, і ризик
         угоди рахуємо від нового стопа. Потім стоп можна підтягувати,
         а R лишається від початкового. */
      if (p.bars === 0) p.sl0 = p.sl;
    }
    if (tp != null && Number.isFinite(tp)) p.tp = long ? Math.max(tp, now + gap) : Math.min(tp, now - gap);
    this.syncPriceLines();
    this.emit();
  }

  moveToBE() {
    if (!this.pos) return;
    this.finishAnim();
    const now = this.price();
    const p = this.pos;
    if ((p.side === 'LONG' && now <= p.entry) || (p.side === 'SHORT' && now >= p.entry)) return;
    p.sl = p.entry;
    this.syncPriceLines();
    this.emit();
  }

  /* ---------------- чернетка й відкладені ордери ----------------
     Як ордер-панель у TV: обрав Buy чи Sell — на графіку зʼявляється
     майбутня угода (вхід, стоп, тейк), її можна тягнути. Підтвердив —
     або вхід по ринку, або відкладений ордер, що спрацює, коли ціна
     дійде до рівня. Відстані стопа й тейка чернетки «по ринку» живуть
     відносно ціни: крок реплею — і вся рамка їде за ціною. */

  minGap() {
    const tick = 1 / 10 ** (this.base?.digits ?? 2);
    return Math.max(tick * 2, this.defaultDistance() * 0.05);
  }

  setDraft(d) {
    if (!d) { this.draft = null; this.syncPriceLines(); this.emit(); return; }
    if (!this.replay || this.pos || this.snap) return;
    this.finishAnim();
    const prev = this.draft;
    const base = this.defaultDistance() * (this.prefs.atrMult || 1);
    const side = d.side || prev?.side || 'LONG';
    const slD = d.slD ?? prev?.slD ?? base;
    const tpD = d.tpD ?? prev?.tpD ?? slD * (this.prefs.rr || 2);
    const type = d.type || prev?.type || 'market';
    const entry = type === 'pending' ? (d.entry ?? prev?.entry ?? this.price()) : null;
    this.draft = { side, type, entry, slD: Math.max(this.minGap(), slD), tpD: Math.max(this.minGap(), tpD) };
    this.syncPriceLines();
    this.emit();
  }

  /* Рівні чернетки в цінах. */
  draftLevels(d = this.draft) {
    if (!d) return null;
    const dir = d.side === 'LONG' ? 1 : -1;
    const entry = d.type === 'pending' ? d.entry : this.price();
    return { side: d.side, type: d.type, entry, sl: entry - dir * d.slD, tp: entry + dir * d.tpD, rr: d.tpD / (d.slD || 1e-9) };
  }

  /* Довга / коротка позиція, намальована інструментом, — у чернетку. */
  draftFromTool(type, pts) {
    if (!this.replay || this.pos || !pts?.length) return false;
    const [en, tp, sl] = pts;
    const side = type === 'long' ? 'LONG' : 'SHORT';
    const near = Math.abs(en.p - this.price()) <= Math.max(this.minGap(), this.defaultDistance() * 0.1);
    this.order = null;
    this.draft = null;
    this.setDraft({ side, type: near ? 'market' : 'pending', entry: near ? null : en.p, slD: Math.abs(en.p - sl.p), tpD: Math.abs(tp.p - en.p) });
    return true;
  }

  /* Поки тягнемо ручку (подія мишки йде не на графік), перехрестя
     «приклеюємо» до її рівня — як у TV, де лінія завжди на ручці. */
  glue(price, x) {
    try {
      const a = this.agg;
      if (!a || price == null || !Number.isFinite(price)) return;
      /* Рамка угоди часто стоїть праворуч від останньої свічки, а там
         у бібліотеки немає часу — її вертикаль стрибнула б на останню
         свічку. Тож вертикаль ховаємо й малюємо свою, рівно під мишкою. */
      if (!this.glueAt) this.chart.applyOptions({ crosshair: { vertLine: { visible: false, labelVisible: false } } });
      this.glueAt = { x };
      const l = this.chart.timeScale().coordinateToLogical(x);
      const k = Math.max(this.win, Math.min(this.lastK, Math.round((l ?? 0) + this.win)));
      this.chart.setCrosshairPosition(price, a.t[k], this.series);
    } catch { /* час поза даними — не страшно */ }
  }

  unglue() {
    if (!this.glueAt) return;
    this.glueAt = null;
    try {
      this.chart.applyOptions({ crosshair: { vertLine: { visible: true, labelVisible: true } } });
      this.chart.clearCrosshairPosition();
    } catch { /* ок */ }
  }

  /* Своя вертикаль перехрестя під час тягання ручки + мітка часу. */
  glueSvg(plotW, plotH) {
    const g = this.glueAt;
    if (!g || g.x < 0 || g.x > plotW) return '';
    const p = this.prefs;
    const hex = String(p.bg || '').replace('#', '');
    const light = hex.length >= 6 && (parseInt(hex.slice(0, 2), 16) * 299 + parseInt(hex.slice(2, 4), 16) * 587 + parseInt(hex.slice(4, 6), 16) * 114) / 1000 > 150;
    const dash = p.crossStyle === 'solid' ? '' : p.crossStyle === 'dotted' ? '1 3' : '4 4';
    const totalH = this.chart.chartElement().clientHeight;
    const axisH = Math.max(0, totalH - this.chart.timeScale().height());
    const o = [`<line x1="${g.x}" y1="0" x2="${g.x}" y2="${axisH}" stroke="${p.crossColor}" stroke-width="1" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`];
    const dm = this.drawings;
    if (dm?.ready) {
      const l = this.chart.timeScale().coordinateToLogical(g.x);
      if (l != null) {
        const txt = this.fmtTime?.(Math.round(dm.timeOf(l + this.win))) || '';
        const fs = p.fontSize || 12; const w = txt.length * fs * 0.6 + 14; const th = this.chart.timeScale().height();
        o.push(`<rect x="${g.x - w / 2}" y="${axisH + 1}" width="${w}" height="${th - 2}" rx="2" fill="${light ? '#131722' : '#363a45'}"/><text x="${g.x}" y="${axisH + th / 2 + fs / 2 - 1}" fill="#fff" font-size="${fs}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif">${txt.replace(/[<>&]/g, '')}</text>`);
      }
    }
    return o.join('');
  }

  /* Ручка на графіку чи поле в панелі: рівень ціною. */
  moveLevel(key, price) {
    if (!Number.isFinite(price)) return;
    if (this.pos) { if (key !== 'entry') this.setLevels({ [key]: price }); return; }
    if (this.order) {
      const o = this.order;
      const dir = o.side === 'LONG' ? 1 : -1;
      const g = this.minGap();
      if (key === 'entry') { const dsl = o.entry - o.sl; const dtp = o.tp - o.entry; o.entry = price; o.sl = price - dsl; o.tp = price + dtp; o.kind = this.orderKind(o.side, price); }
      if (key === 'sl') o.sl = dir > 0 ? Math.min(price, o.entry - g) : Math.max(price, o.entry + g);
      if (key === 'tp') o.tp = dir > 0 ? Math.max(price, o.entry + g) : Math.min(price, o.entry - g);
      this.syncPriceLines();
      this.emit();
      return;
    }
    const d = this.draft;
    if (!d) return;
    const L = this.draftLevels();
    const dir = d.side === 'LONG' ? 1 : -1;
    if (key === 'entry') {
      /* Потягнув вхід від ціни — це вже відкладений ордер. */
      const near = Math.abs(price - this.price()) < this.minGap();
      this.setDraft(near ? { type: 'market' } : { type: 'pending', entry: price });
      return;
    }
    if (key === 'sl') this.setDraft({ slD: Math.max(this.minGap(), dir * (L.entry - price)) });
    if (key === 'tp') this.setDraft({ tpD: Math.max(this.minGap(), dir * (price - L.entry)) });
  }

  orderKind(side, entry) {
    const now = this.price();
    return side === 'LONG' ? (entry < now ? 'limit' : 'stop') : (entry > now ? 'limit' : 'stop');
  }

  /* Підтвердження чернетки: ринок — одразу в позицію, інакше ордер. */
  confirmDraft({ note = '', meta = null } = {}) {
    const L = this.draftLevels();
    if (!L || !this.replay || this.pos) return false;
    if (L.type === 'market') {
      this.openPosition(L.side, { sl: L.sl, tp: L.tp, note, meta });
      return true;
    }
    this.finishAnim();
    this.order = {
      side: L.side, entry: L.entry, sl: L.sl, tp: L.tp, kind: this.orderKind(L.side, L.entry),
      placedIdx: this.cut - 1, placedT: this.base.t[this.cut - 1], tf: this.tf, note, meta: meta || null,
    };
    this.draft = null;
    this.syncPriceLines();
    this.emit();
    return true;
  }

  cancelOrder() {
    if (!this.order) return;
    this.order = null;
    this.syncPriceLines();
    this.emit();
  }

  /* Хвилинка i: чи дійшла ціна до ордера. Геп через рівень — вхід по
     відкриттю хвилинки: для ліміту це краща ціна, для стопа гірша,
     як і в реальності. */
  tryFill(i) {
    const o = this.order;
    if (!o || i <= o.placedIdx) return;
    const b = this.base;
    const buy = o.side === 'LONG';
    const lim = o.kind === 'limit';
    const down = buy === lim; // купівля лімітом / продаж стопом — ціна має впасти до рівня
    const hit = down ? b.l[i] <= o.entry : b.h[i] >= o.entry;
    if (!hit) return;
    const px = down ? (b.o[i] <= o.entry ? b.o[i] : o.entry) : (b.o[i] >= o.entry ? b.o[i] : o.entry);
    this.order = null;
    this.pos = {
      side: o.side, entry: px, sl: o.sl, sl0: o.sl, tp: o.tp, size: 1, realized: 0,
      entryIdx: i, entryT: b.t[i], bars: 0, tf: o.tf, note: o.note, meta: o.meta || null, kind: o.kind,
    };
    this.pos.snapEntry = this.captureSnap(b.t[i]);
  }

  /* Що зараз показувати ручками: позиція, ордер або чернетка. */
  ticket() {
    if (this.snap) return null;
    if (this.pos) return { kind: 'pos', side: this.pos.side, entry: this.pos.entry, sl: this.pos.sl, tp: this.pos.tp };
    if (this.order) return { ...this.order, kind: 'order', orderKind: this.order.kind };
    const L = this.draftLevels();
    return L ? { kind: 'draft', ...L } : null;
  }

  rOf(p, price) {
    const risk = Math.abs(p.entry - p.sl0) || 1e-9;
    return (p.side === 'LONG' ? price - p.entry : p.entry - price) / risk;
  }

  /* R усієї угоди: уже зафіксоване частковими закриттями + решта
     обсягу за ціною px. */
  posR(p, px) { return (p.realized || 0) + (p.size ?? 1) * this.rOf(p, px); }

  /* Нотатка й теги відкритої позиції (або ордера) — змінюються, поки
     угода триває: сетап видно одразу, емоції й помилки — по ходу. */
  setTradeMeta({ note, meta } = {}) {
    const p = this.pos || this.order;
    if (!p) return;
    if (note != null) p.note = note;
    if (meta) p.meta = { ...(p.meta || {}), ...meta };
    this.emit();
  }

  /* Закрити частину позиції за поточною ціною (за замовчуванням половину). */
  partialClose(frac = 0.5) {
    const p = this.pos;
    if (!p) return;
    this.finishAnim();
    if (!this.pos) return;
    const px = this.price();
    const part = (p.size ?? 1) * frac;
    p.realized = (p.realized || 0) + part * this.rOf(p, px);
    p.size = (p.size ?? 1) - part;
    p.partials = [...(p.partials || []), { px, frac: part, idx: this.cut - 1, t: this.base.t[this.cut - 1], r: this.rOf(p, px) }];
    if (p.size < 0.02) { this.closePosition('manual'); return; }
    this.updateMarkers();
    this.emit();
  }

  /* Трейлінг-стоп: тримає стоп на тій самій відстані від найкращої
     ціни, яку бачила угода. Відстань — та, що зараз між ціною і стопом. */
  toggleTrail() {
    const p = this.pos;
    if (!p) return;
    this.finishAnim();
    if (p.trail) { p.trail = false; this.emit(); return; }
    const now = this.price();
    const dist = Math.abs(now - p.sl);
    if (!(dist > 0)) return;
    p.trail = true;
    p.trailD = dist;
    p.best = now;
    this.emit();
  }

  checkPos(i) {
    const p = this.pos;
    if (!p || i <= p.entryIdx) return;
    const b = this.base;
    const long = p.side === 'LONG';
    const o = b.o[i];
    const hitSL = long ? b.l[i] <= p.sl : b.h[i] >= p.sl;
    const hitTP = long ? b.h[i] >= p.tp : b.l[i] <= p.tp;
    if (!hitSL && !hitTP) {
      /* Стоп підтягуємо вже після хвилинки: її максимум стає відомим
         лише в кінці, тож стоп від нього діє з наступної. */
      if (p.trail) {
        if (long) { p.best = Math.max(p.best ?? p.entry, b.h[i]); p.sl = Math.max(p.sl, p.best - p.trailD); }
        else { p.best = Math.min(p.best ?? p.entry, b.l[i]); p.sl = Math.min(p.sl, p.best + p.trailD); }
      }
      return;
    }
    /* Гепом відкрились за рівнем — виходимо по відкриттю, як і в
       реальності. Обидва рівні в одній хвилинці — вважаємо, що першим
       був стоп: краще недооцінити систему, ніж перехвалити. */
    let reason; let px;
    if (long ? o <= p.sl : o >= p.sl) { reason = 'sl'; px = o; }
    else if (long ? o >= p.tp : o <= p.tp) { reason = 'tp'; px = o; }
    else if (hitSL) { reason = 'sl'; px = p.sl; }
    else { reason = 'tp'; px = p.tp; }
    this.finish(reason, px, i);
  }

  closePosition(reason = 'manual') {
    if (!this.pos) return;
    this.finishAnim();
    if (!this.pos) return;
    this.finish(reason, this.price(), this.cut - 1);
  }

  finish(reason, px, idx) {
    const p = this.pos;
    const r = this.posR(p, px);
    const result = Math.abs(r) < 0.05 ? 'BE' : r > 0 ? 'WIN' : 'LOSS';
    const trade = {
      id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      symbol: this.base.symbol, side: p.side, tf: p.tf,
      entry: p.entry, sl: p.sl0, slFinal: p.sl, tp: p.tp, exit: px,
      entryIdx: p.entryIdx, exitIdx: idx, entryT: p.entryT, exitT: this.base.t[idx],
      r: Math.round(r * 100) / 100, result, reason, digits: this.base.digits, note: p.note || '', meta: p.meta || null,
      kind: p.kind || 'market', partials: p.partials || [], trail: !!p.trail,
      snaps: { entry: p.snapEntry || null, exit: this.captureSnap(this.base.t[idx]) },
    };
    this.pos = null;
    this.closed.push(trade);
    this.syncPriceLines();
    this.updateMarkers();
    this.cb.onClosed?.(trade);
    this.emit();
  }

  /* Рамка закритої угоди на екрані. */
  closedGeom(t) {
    const x1 = this.xOfBase(t.entryIdx); const x2 = this.xOfBase(t.exitIdx);
    const ye = this.series.priceToCoordinate(t.entry);
    const ys = this.series.priceToCoordinate(t.sl);
    const yt = this.series.priceToCoordinate(t.tp);
    if (x1 == null || x2 == null || ye == null) return null;
    const xs = [x1, Math.max(x2, x1 + 6)];
    const ys2 = [ye, ys ?? ye, yt ?? ye];
    return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys2), y2: Math.max(...ys2), ye };
  }

  /* Клік по рамці закритої угоди — виділяємо її (зʼявляється кнопка
     «Видалити»). Клік повз — знімаємо виділення. */
  pickClosed(pt) {
    let hit = null;
    if (pt && this.prefs.showClosed) {
      for (let i = this.closed.length - 1; i >= 0 && !hit; i -= 1) {
        const g = this.closedGeom(this.closed[i]);
        if (g && pt.x >= g.x1 - 2 && pt.x <= g.x2 + 2 && pt.y >= g.y1 - 2 && pt.y <= g.y2 + 2) hit = this.closed[i].id;
      }
    }
    if (hit !== (this.selClosed || null)) { this.selClosed = hit; this.emit(); }
  }

  /* Прибрати закриту угоду з графіка (рамка й стрілки). */
  removeClosed(id) {
    const n = this.closed.length;
    this.closed = this.closed.filter((t) => t.id !== id);
    if (this.selClosed === id) this.selClosed = null;
    if (this.closed.length !== n) { this.updateMarkers(); this.emit(); }
  }

  /* ---------------- лінії й маркери ---------------- */

  clearPriceLines() {
    Object.values(this.priceLines).forEach((l) => { try { this.series.removePriceLine(l); } catch { /* вже немає */ } });
    this.priceLines = {};
  }

  syncPriceLines() {
    const tk = this.ticket();
    if (!tk || !this.prefs.showPositions) { this.clearPriceLines(); return; }
    const txt = this.prefs.markerText;
    const long = tk.side === 'LONG';
    const live = tk.kind === 'pos';
    const kindTxt = tk.kind === 'order' ? `${long ? 'Buy' : 'Sell'} ${tk.orderKind === 'limit' ? 'Limit' : 'Stop'}` : (long ? 'Long' : 'Short');
    const want = {
      entry: { price: tk.entry, color: live ? '#787b86' : (long ? '#2962ff' : '#e91e63'), title: txt || !live ? kindTxt : '', lineStyle: LineStyle.Dashed },
      sl: { price: tk.sl, color: live ? '#f23645' : 'rgba(242,54,69,0.75)', title: txt ? 'SL' : '', lineStyle: live ? LineStyle.Solid : LineStyle.Dashed },
      tp: { price: tk.tp, color: live ? '#089981' : 'rgba(8,153,129,0.75)', title: txt ? 'TP' : '', lineStyle: live ? LineStyle.Solid : LineStyle.Dashed },
    };
    Object.entries(want).forEach(([key, o]) => {
      /* Лише мітка на шкалі: саму угоду малює рамка (як позиція в TV),
         лінії через увесь графік тільки заважали б. */
      const opts = { price: o.price, color: o.color, lineWidth: 1, lineStyle: o.lineStyle, axisLabelVisible: true, title: '', lineVisible: false };
      if (this.priceLines[key]) this.priceLines[key].applyOptions(opts);
      else this.priceLines[key] = this.series.createPriceLine(opts);
    });
  }

  /* Допоміжні лінії з «Шкали і лінії»: закриття попереднього дня,
     максимум і мінімум видимої ділянки. */
  setAux(key, price, opts) {
    if (price == null) {
      if (this.auxLines[key]) { try { this.series.removePriceLine(this.auxLines[key]); } catch { /* ок */ } delete this.auxLines[key]; }
      return;
    }
    const o = { price, lineWidth: 1, axisLabelVisible: true, ...opts };
    if (this.auxLines[key]) this.auxLines[key].applyOptions(o);
    else this.auxLines[key] = this.series.createPriceLine(o);
  }

  updateAux() {
    if (!this.agg || this.lastK < 0) return;
    const p = this.prefs;
    if (p.prevDayClose) {
      const d1 = this.getAgg('D1');
      const lastBase = (this.cut ?? this.base.n) - 1;
      const dk = tfIndexOfBase(d1, lastBase);
      this.setAux('pdc', dk > 0 ? d1.c[dk - 1] : null, { color: '#787b86', lineStyle: LineStyle.Dotted, title: p.markerText ? 'PDC' : '' });
    } else this.setAux('pdc', null);
    this.updateHiLo();
  }

  updateHiLo() {
    if (!this.prefs.hiLo || !this.agg) { this.setAux('hi', null); this.setAux('lo', null); return; }
    const r = this.chart.timeScale().getVisibleLogicalRange();
    if (!r) return;
    const a = Math.max(this.win, this.win + Math.floor(r.from));
    const b = Math.min(this.lastK, this.win + Math.ceil(r.to));
    let hi = -Infinity; let lo = Infinity;
    for (let k = a; k <= b; k += 1) {
      /* Свічка, що зараз «росте», — лише те, що вже показано. */
      const bar = k === this.lastK ? ((this.anim && this.anim.shown) || this.bar(k)) : null;
      const h = bar ? bar.high : this.agg.h[k];
      const l = bar ? bar.low : this.agg.l[k];
      if (h > hi) hi = h;
      if (l < lo) lo = l;
    }
    if (!Number.isFinite(hi)) return;
    const txt = this.prefs.markerText;
    this.setAux('hi', hi, { color: withAlpha(this.prefs.up, 0.8), lineStyle: LineStyle.Dashed, title: txt ? 'High' : '' });
    this.setAux('lo', lo, { color: withAlpha(this.prefs.down, 0.8), lineStyle: LineStyle.Dashed, title: txt ? 'Low' : '' });
  }

  timeOfBase(i) {
    const k = tfIndexOfBase(this.agg, i);
    return k >= this.win && k <= this.lastK ? this.agg.t[k] : null;
  }

  updateMarkers() {
    if (!this.agg) return;
    const m = [];
    const txt = this.prefs.markerText;
    const add = (i, side, isEntry, text) => {
      const time = this.timeOfBase(i);
      if (time == null) return;
      const long = side === 'LONG';
      if (isEntry) {
        m.push({ time, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: long ? '#2962ff' : '#e91e63', text: txt ? text : '' });
      } else {
        m.push({ time, position: long ? 'aboveBar' : 'belowBar', shape: 'circle', color: '#9598a1', size: 0.6, text: txt ? text : '' });
      }
    };
    const sn = this.snap;
    if (sn) {
      /* У знімку — лише те, що вже сталось на той момент. */
      const t = sn.trade;
      add(t.entryIdx, t.side, true, t.side === 'LONG' ? 'Buy' : 'Sell');
      (t.partials || []).forEach((q) => { if (this.base.t[q.idx] <= sn.cutT) add(q.idx, t.side, false, `½ ${q.r > 0 ? '+' : ''}${q.r.toFixed(2)}R`); });
      if (t.exitT <= sn.cutT) add(t.exitIdx, t.side, false, `${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}R`);
    } else if (this.prefs.showClosed) {
      this.closed.forEach((t) => {
        add(t.entryIdx, t.side, true, t.side === 'LONG' ? 'Buy' : 'Sell');
        (t.partials || []).forEach((q) => add(q.idx, t.side, false, `½ ${q.r > 0 ? '+' : ''}${q.r.toFixed(2)}R`));
        add(t.exitIdx, t.side, false, `${t.r > 0 ? '+' : ''}${t.r.toFixed(2)}R`);
      });
    }
    if (this.pos && this.prefs.showPositions && !sn) {
      add(this.pos.entryIdx, this.pos.side, true, this.pos.side === 'LONG' ? 'Buy' : 'Sell');
      (this.pos.partials || []).forEach((q) => add(q.idx, this.pos.side, false, `½ ${q.r > 0 ? '+' : ''}${q.r.toFixed(2)}R`));
    }
    m.sort((a, b) => a.time - b.time);
    this.markers.setMarkers(m);
  }

  /* ---------------- оверлей (зони позиції, ножиці) ---------------- */

  /* Де на екрані рамка угоди. Для відкритої — від свічки входу, для
     ордера й чернетки — від поточної. */
  ticketGeom() {
    const tk = this.ticket();
    if (!tk || !this.agg || !this.replay) return null;
    const ts = this.chart.timeScale();
    const i0 = tk.kind === 'pos' ? this.pos.entryIdx : this.cut - 1;
    const k0 = tfIndexOfBase(this.agg, i0) - this.win;
    const x1 = ts.logicalToCoordinate(k0);
    const x2 = ts.logicalToCoordinate(k0 + Math.max(3, this.boxBars));
    const ye = this.series.priceToCoordinate(tk.entry);
    const ys = this.series.priceToCoordinate(tk.sl);
    const yt = this.series.priceToCoordinate(tk.tp);
    if (x1 == null || x2 == null || ye == null || ys == null || yt == null) return null;
    return { tk, x1, x2, ye, ys, yt, k0 };
  }

  ticketSvg(g, plotW) {
    const { tk, x1, x2, ye, ys, yt } = g;
    if (x2 < 0 || x1 > plotW) return '';
    const d = this.base?.digits ?? 2;
    const pip = 10 ** -d;
    const long = tk.side === 'LONG';
    const live = tk.kind === 'pos';
    const risk0 = live ? Math.abs(tk.entry - this.pos.sl0) : Math.abs(tk.entry - tk.sl);
    const tpD = Math.abs(tk.tp - tk.entry); const slD = Math.abs(tk.entry - tk.sl);
    const rr = tpD / (risk0 || 1e-9);
    const pct = (v) => ((v / tk.entry) * 100).toFixed(3).replace(/\.?0+$/, '');
    const money = (v) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 })}`;
    const f = (v) => v.toFixed(d);
    const L = Math.min(x1, x2); const W = Math.abs(x2 - x1);
    const o = [];
    const a = live ? 0.24 : tk.kind === 'order' ? 0.2 : 0.16;
    const dash = live ? '' : 'stroke-dasharray="4 3"';
    o.push(`<rect x="${L}" y="${Math.min(ye, yt)}" width="${W}" height="${Math.abs(yt - ye)}" fill="rgba(8,153,129,${a})" stroke="rgba(8,153,129,0.7)" stroke-width="1" ${dash}/>`);
    o.push(`<rect x="${L}" y="${Math.min(ye, ys)}" width="${W}" height="${Math.abs(ys - ye)}" fill="rgba(242,54,69,${a})" stroke="rgba(242,54,69,0.7)" stroke-width="1" ${dash}/>`);
    o.push(`<line x1="${L}" y1="${ye}" x2="${L + W}" y2="${ye}" stroke="${live ? '#787b86' : long ? '#2962ff' : '#e91e63'}" stroke-width="1.5"/>`);
    /* Відкрита угода: де ціна зараз — пунктир від входу. */
    if (live) {
      const yn = this.series.priceToCoordinate(this.price());
      const xn = this.xOfBase(this.cut - 1);
      if (yn != null && xn != null) o.push(`<line x1="${x1}" y1="${ye}" x2="${xn}" y2="${yn}" stroke="#9598a1" stroke-width="1" stroke-dasharray="3 3"/>`);
    }
    const FONT = "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif";
    const cx = (Math.max(L, 0) + Math.min(plotW, L + W)) / 2;
    const label = (y, lines, bg) => {
      const w = Math.max(...lines.map((s) => s.length)) * 6.3 + 14;
      const h = lines.length * 14 + 6;
      const x = Math.max(2, Math.min(plotW - w - 2, cx - w / 2));
      o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${bg}"/>`);
      lines.forEach((ln, i) => o.push(`<text x="${x + w / 2}" y="${y + 14 + i * 14}" fill="#fff" font-size="11.5" font-weight="600" text-anchor="middle" font-family="${FONT}">${ln.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`));
      return h;
    };
    const top = Math.min(yt, ys); const bot = Math.max(yt, ys);
    const tpLine = `${tx('Ціль', 'Target')}: ${f(tpD)} (${pct(tpD)}%) ${Math.round(tpD / pip)}, ${money(this.riskUsd * rr)}`;
    const slLine = `${tx('Стоп', 'Stop')}: ${f(slD)} (${pct(slD)}%) ${Math.round(slD / pip)}, ${money(-this.riskUsd * (slD / (risk0 || 1e-9)))}`;
    const tpTop = yt < ys;
    label(tpTop ? top - 24 : bot + 4, [tpTop ? tpLine : slLine], tpTop ? '#089981' : '#f23645');
    label(tpTop ? bot + 4 : top - 24, [tpTop ? slLine : tpLine], tpTop ? '#f23645' : '#089981');
    let mid; let bg;
    if (live) {
      const r = this.rOf(this.pos, this.price());
      mid = [`${tx('П/З', 'P&L')}: ${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R, ${money(r * this.riskUsd)} · R:R ${rr.toFixed(2)}`];
      bg = r >= 0 ? '#089981' : '#f23645';
    } else if (tk.kind === 'order') {
      mid = [`${long ? 'Buy' : 'Sell'} ${tk.orderKind === 'limit' ? 'Limit' : 'Stop'} ${f(tk.entry)} · R:R ${rr.toFixed(2)}`];
      bg = long ? '#2962ff' : '#e91e63';
    } else {
      mid = [`${long ? tx('Довга', 'Long') : tx('Коротка', 'Short')} ${tk.type === 'market' ? tx('по ринку', 'market') : f(tk.entry)} · R:R ${rr.toFixed(2)}`];
      bg = long ? '#2962ff' : '#e91e63';
    }
    label(ye - 10, mid, bg);
    return o.join('');
  }

  /* Ручка праворуч: ширина рамки у свічках. */
  setBoxWidth(x) {
    const g = this.ticketGeom();
    if (!g) return;
    const l = this.chart.timeScale().coordinateToLogical(x);
    if (l == null) return;
    this.boxBars = Math.max(3, Math.round(l - g.k0));
  }

  xOfBase(i) {
    const k = tfIndexOfBase(this.agg, i);
    return this.chart.timeScale().logicalToCoordinate(k - this.win);
  }

  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.ov || !this.agg) return;
    const now = performance.now();
    this.tickAnim(now);

    const ts = this.chart.timeScale();
    const plotW = ts.width();
    const plotH = this.chart.paneSize(0).height;
    const p = this.prefs;
    const parts = [];

    const zone = (x1, x2, yA, yB, color) => {
      const x = Math.max(0, Math.min(x1, x2)); const w = Math.min(plotW, Math.max(x1, x2)) - x;
      if (w <= 0) return;
      const y = Math.min(yA, yB); const h = Math.abs(yA - yB);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`);
    };

    /* Знімок угоди: її план (вхід, стоп, тейк) від входу; якщо вихід
       уже видно — ще й лінія до виходу. */
    const sn = this.snap;
    if (sn) {
      const t = sn.trade;
      const x1 = this.xOfBase(t.entryIdx);
      const shown = t.exitT <= sn.cutT;
      const xEnd = shown ? Math.max(this.xOfBase(t.exitIdx) ?? 0, (x1 ?? 0) + 6) : (ts.logicalToCoordinate(this.lastK - this.win) ?? x1);
      const ye = this.series.priceToCoordinate(t.entry);
      const ys = this.series.priceToCoordinate(t.sl);
      const yt = this.series.priceToCoordinate(t.tp);
      if (x1 != null && ye != null) {
        const x2 = Math.max(xEnd ?? x1, x1 + 40);
        if (yt != null) zone(x1, x2, ye, yt, 'rgba(8,153,129,0.18)');
        if (ys != null) zone(x1, x2, ye, ys, 'rgba(242,54,69,0.18)');
        parts.push(`<line x1="${x1}" y1="${ye}" x2="${x2}" y2="${ye}" stroke="#787b86" stroke-width="1"/>`);
        if (t.slFinal != null && shown && t.slFinal !== t.sl) {
          const yf = this.series.priceToCoordinate(t.slFinal);
          if (yf != null) parts.push(`<line x1="${x1}" y1="${yf}" x2="${x2}" y2="${yf}" stroke="#f23645" stroke-width="1" stroke-dasharray="4 3"/>`);
        }
        const yx = this.series.priceToCoordinate(t.exit);
        if (shown && yx != null) parts.push(`<line x1="${x1}" y1="${ye}" x2="${x2}" y2="${yx}" stroke="${t.r >= 0 ? '#089981' : '#f23645'}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
      }
    }

    /* Закриті угоди — бліді коробки від входу до виходу, як позиції в TV. */
    if (p.showClosed && !sn) {
      for (const t of this.closed) {
        const x1 = this.xOfBase(t.entryIdx); const x2 = this.xOfBase(t.exitIdx);
        if (x1 == null || x2 == null || (x1 > plotW && x2 > plotW) || (x1 < 0 && x2 < 0)) continue;
        const ye = this.series.priceToCoordinate(t.entry);
        const ys = this.series.priceToCoordinate(t.sl);
        const yt = this.series.priceToCoordinate(t.tp);
        const yx = this.series.priceToCoordinate(t.exit);
        if (ye == null) continue;
        const xx2 = Math.max(x2, x1 + 6);
        if (yt != null) zone(x1, xx2, ye, yt, 'rgba(8,153,129,0.13)');
        if (ys != null) zone(x1, xx2, ye, ys, 'rgba(242,54,69,0.13)');
        if (yx != null) parts.push(`<line x1="${x1}" y1="${ye}" x2="${xx2}" y2="${yx}" stroke="${t.r >= 0 ? '#089981' : '#f23645'}" stroke-width="1" stroke-dasharray="3 3"/>`);
        if (t.id === this.selClosed) {
          const g = this.closedGeom(t);
          if (g) parts.push(`<rect x="${g.x1 - 1.5}" y="${g.y1 - 1.5}" width="${g.x2 - g.x1 + 3}" height="${g.y2 - g.y1 + 3}" fill="none" stroke="#2962ff" stroke-width="1.5" rx="2"/>`);
        }
      }
    }

    /* Відкрита позиція — від входу до правого краю. */
    /* Під позицією — спершу індикатори, над ними малюнки: зони угоди
       мають лишатись читабельними, а лінія людини — над сесіями. */
    if (this.drawings) parts.unshift(this.drawings.svg());
    if (this.indicators) parts.unshift(this.indicators.svg(plotW, plotH));

    /* Угода, ордер або чернетка — рамка як «Довга/Коротка позиція» в
       TV: зелена зона до тейку, червона до стопу, підписи зверху,
       посередині й знизу. Ручки (квадрати й кола) — у сторінці. */
    const g = p.showPositions ? this.ticketGeom() : null;
    if (g) parts.push(this.ticketSvg(g, plotW));

    /* Ножиці: вертикаль під курсором і затемнення «майбутнього». */
    if (this.selecting && this.hoverLogical != null) {
      const x = ts.logicalToCoordinate(Math.round(this.hoverLogical));
      if (x != null) {
        parts.push(`<rect x="${x}" y="0" width="${Math.max(0, plotW - x)}" height="${plotH}" fill="${withAlpha(p.bg, 0.72)}"/>`);
        parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${plotH}" stroke="#2962ff" stroke-width="1.5"/>`);
      }
    }

    /* Розріз: майбутні свічки просто плавно гаснуть, потім дані
       обрізаються. Без шторок і ліній — лише щоб не було різко. */
    const fx = this.cutFx;
    if (fx) {
      const x = ts.logicalToCoordinate(fx.rel) ?? 0;
      const xr = x + ((ts.logicalToCoordinate(fx.rel + 1) ?? x + 6) - x) / 2;
      const t = Math.min(1, (now - fx.t0) / CUT_MS);
      const e = t * t * (3 - 2 * t);
      parts.push(`<rect x="${xr}" y="0" width="${Math.max(0, plotW - xr)}" height="${plotH}" fill="${p.bg}" opacity="${e.toFixed(3)}"/>`);
      if (t >= 1) {
        this.cutFx = null;
        this.setCut(fx.cut, true);
      }
    }

    /* Усе обрізаємо по основній панелі: інакше лінія нижче видимих
       цін залазила б на панель RSI чи MACD. */
    const html = `<defs><clipPath id="edge-main-clip"><rect x="0" y="0" width="${plotW}" height="${plotH}"/></clipPath></defs><g clip-path="url(#edge-main-clip)">${parts.join('')}</g>${this.indicators ? this.indicators.axisSvg(plotW, plotH) : ''}${this.drawings ? this.drawings.axisSvg(plotW, plotH) : ''}${this.glueSvg(plotW, plotH)}`;
    if (html !== this.lastOv) { this.ov.innerHTML = html; this.lastOv = html; }
    this.cb.onFrame?.();
  }

  fmtTime(t) { return fmtStamp(t, this.prefs); }

  /* Координата дробового індексу свічки: бібліотека вміє лише цілі. */
  lx(l) {
    const ts = this.chart.timeScale();
    const f = Math.floor(l);
    const x0 = ts.logicalToCoordinate(f);
    if (x0 == null || l === f) return x0;
    const x1 = ts.logicalToCoordinate(f + 1);
    return x1 == null ? x0 : x0 + (x1 - x0) * (l - f);
  }

  /* Координата ціни — для ручок SL/TP, які малює сторінка. */
  y(price) { return this.series.priceToCoordinate(price); }
  priceAt(y) { return this.series.coordinateToPrice(y); }

  /* ---------------- стан для сторінки ---------------- */

  emit() {
    if (this.agg && this.lastK >= 0) this.legendLast();
    const p = this.pos;
    const now = this.price();
    this.cb.onState?.({
      ready: !!this.base,
      tf: this.tf,
      replay: this.replay,
      selecting: this.selecting,
      cutting: !!this.cutFx,
      playing: this.playing,
      stepTf: this.stepTf || null,
      atEnd: this.replay && this.cut >= this.base.n,
      time: this.base ? this.base.t[(this.replay ? this.cut : this.base.n) - 1] : null,
      price: now,
      autoScale: this.autoScale,
      selClosed: this.selClosed || null,
      canBack: this.replay && this.canBack && !this.snap,
      snap: this.snap ? { id: this.snap.id, which: this.snap.which, after: this.snap.after, cutT: this.snap.cutT, hasEntry: !!this.snap.trade.snaps?.entry, hasExit: !!this.snap.trade.snaps?.exit } : null,
      scaleMode: this.scaleMode || 'normal',
      pos: p ? { ...p, r: this.posR(p, now), rr: Math.abs(p.tp - p.entry) / (Math.abs(p.entry - p.sl0) || 1e-9) } : null,
      draft: this.draft && this.base ? this.draftLevels() : null,
      order: this.order ? { ...this.order, rr: Math.abs(this.order.tp - this.order.entry) / (Math.abs(this.order.entry - this.order.sl) || 1e-9) } : null,
    });
  }
}

/* Двигун графіка живе в ref сторінки: гаряча заміна модуля лишила б
   старий екземпляр зі старим кодом. Тому при зміні — повне оновлення. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
