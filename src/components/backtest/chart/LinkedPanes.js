import { CandlestickSeries } from 'lightweight-charts';
import { aggregate, barAt, lowerBound, upperBound, tfById } from '../../../lib/candles/agg';
import { seriesOptions } from '../../../lib/candles/chartPrefs';
import { isRemote, remoteName, getManifest, loadMonths, monthOf, shiftMonth } from '../../../lib/candles/remote';

/* ==================================================================
   Графіки інших інструментів у панелях під основним — як «Додати
   символ → у нову панель» у TradingView. Наприклад, GER40 зверху і
   DXY знизу: одна шкала часу, одне перехрестя, гортаються разом.

   Головне правило — свічки панелі стоять рівно на тих самих часах,
   що й свічки основного графіка:
   • рушій рахує все в індексах свічок основного (k − win). Будь-яка
     зайва точка часу в бібліотеці зсунула б ці індекси, тому свічку
     іншого інструмента, для якої в основного немає пари (DXY торгує,
     коли DAX закритий), просто не показуємо;
   • у реплеї панель бачить рівно до тієї ж хвилини, що й основний
     графік: незакрита свічка збирається лише з уже «сталих» хвилинок.
     Жодного тіку з майбутнього — інакше нижній графік підказував би,
     куди піде верхній.

   Дані — з сервера EDGE (місяці навколо видимого) або з власних
   CSV трейдера (браузер).
================================================================== */

const MAX_LINKED = 3;
/* Скільки місяців тягнемо за раз для видимого діапазону. Денний
   графік на 10 років — це 120 місяців хвилинок; беремо найближчі. */
const MAX_MONTHS = 60;

export default class LinkedPanes {
  constructor(engine, { loadLocal, onChange } = {}) {
    this.e = engine;
    this.loadLocal = loadLocal;
    this.onChange = onChange;
    this.list = [];
    this.timer = null;
    this.alive = true;
  }

  get count() { return this.list.length; }

  destroy() {
    this.alive = false;
    clearTimeout(this.timer);
  }

  /* Новий список інструментів (ключі як у меню: «srv:DXY» або назва
     власного файлу). Ті, що вже відкриті, не перезавантажуються. */
  setList(keys) {
    const want = [...new Set((keys || []).filter(Boolean))].slice(0, MAX_LINKED);
    const sig = want.join('|');
    if (sig === this.list.map((x) => x.key).join('|')) return;
    const old = new Map(this.list.map((x) => [x.key, x]));
    this.list = want.map((key) => old.get(key) || this.entry(key));
    this.relayout();
    this.list.forEach((x) => { if (!x.started) this.start(x); });
    this.changed();
  }

  entry(key) {
    return {
      key, name: remoteName(key), remote: isRemote(key), digits: 2,
      base: null, parts: new Map(), aggs: new Map(), manifest: null,
      loading: false, error: null, started: false, api: null, last: null, collapsed: false,
    };
  }

  changed() { this.onChange?.(this.list.map((x) => ({ key: x.key, name: x.name, loading: x.loading, error: x.error, ready: !!x.base, collapsed: !!x.collapsed }))); }

  /* Згорнути панель у тонку смужку з назвою (як подвійний клік у TV)
     і розгорнути назад. */
  setCollapsed(key, on) {
    const x = this.list.find((y) => y.key === key);
    if (!x) return;
    x.collapsed = !!on;
    try { x.api?.applyOptions({ visible: !x.collapsed }); } catch { /* ок */ }
    this.e.sizePanes();
    this.changed();
  }

  /* Усі панелі разом: подвійний клік по графіку ховає їх у смужки
     (основний графік на весь екран) і повертає назад. */
  toggleAll() {
    const open = this.list.some((x) => !x.collapsed);
    this.list.forEach((x) => {
      x.collapsed = open;
      try { x.api?.applyOptions({ visible: !x.collapsed }); } catch { /* ок */ }
    });
    this.e.sizePanes();
    this.changed();
  }

  toggleCollapsed(key) {
    const x = this.list.find((y) => y.key === key);
    if (x) this.setCollapsed(key, !x.collapsed);
  }

  /* Яка панель інструмента під точкою y (пікселі від верху графіка). */
  paneAt(y) {
    const tops = this.paneTops();
    const panes = this.e.chart.panes();
    for (let i = 0; i < this.list.length; i += 1) {
      const top = tops[i];
      if (top == null) continue;
      let h = 0;
      try { h = panes[i + 1].getHeight(); } catch { /* ок */ }
      if (y >= top && y <= top + h) return this.list[i].key;
    }
    return null;
  }

  /* Свічки інструмента під потрібний ТФ — для бокового графіка. */
  sourceOf(key) { return this.list.find((y) => y.key === key) || null; }

  /* Панелі: спершу наші (одразу під графіком), потім осцилятори.
     Менеджер індикаторів при перебудові прибирає всі нижні панелі —
     тож перебудову робить він і кличе attach(). */
  relayout() {
    const im = this.e.indicators;
    if (im) { im.rebuildPanes(); im.invalidate(true); } else this.attach();
    this.e.sizePanes();
  }

  attach() {
    const chart = this.e.chart;
    this.list.forEach((x, i) => {
      x.api = chart.addSeries(CandlestickSeries, { ...this.opts(x), visible: !x.collapsed }, i + 1);
    });
    this.render();
  }

  opts(x) {
    return { ...seriesOptions(this.e.prefs, x.digits), priceLineVisible: false, visible: !x.collapsed };
  }

  restyle() {
    this.list.forEach((x) => { try { x.api?.applyOptions(this.opts(x)); } catch { /* ок */ } });
    this.render();
  }

  /* ---------------- дані ---------------- */

  async start(x) {
    x.started = true;
    x.loading = true;
    x.error = null;
    this.changed();
    try {
      if (x.remote) {
        x.manifest = await getManifest(x.name);
        if (!x.manifest || !Object.keys(x.manifest.months || {}).length) throw new Error('no_history');
        x.digits = x.manifest.digits ?? 2;
        try { x.api?.applyOptions(this.opts(x)); } catch { /* ок */ }
        await this.ensure(x);
      } else {
        const rec = await this.loadLocal?.(x.key);
        if (!rec) throw new Error('not_found');
        x.base = rec;
        x.digits = rec.digits ?? 2;
        x.aggs.clear();
        try { x.api?.applyOptions(this.opts(x)); } catch { /* ок */ }
      }
    } catch (err) {
      x.error = err?.message || 'error';
    }
    x.loading = false;
    if (!this.alive || !this.list.includes(x)) return;
    this.render();
    this.changed();
  }

  /* Видимий діапазон змінився — догружаємо місяці, яких бракує.
     Не на кожен піксель прокрутки: раз на 250 мс. */
  ensureSoon() {
    if (!this.list.some((x) => x.remote)) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.list.forEach((x) => { if (x.remote && x.manifest && !x.busy) this.ensure(x); }), 250);
  }

  /* Місяці, які покриває видимий шматок основного графіка (з місяцем
     запасу ліворуч), — від правого краю до лівого. */
  wantedMonths(x) {
    const e = this.e;
    const a = e.agg;
    if (!a || e.lastK < 0) return [];
    const r = e.chart.timeScale().getVisibleLogicalRange();
    const k1 = Math.max(e.win, Math.min(e.lastK, e.win + Math.ceil(r ? r.to : e.lastK - e.win)));
    const k0 = Math.max(e.win, Math.min(k1, e.win + Math.floor(r ? r.from : 0)));
    const last = monthOf(a.t[k1]);
    const first = shiftMonth(monthOf(a.t[k0]), -1);
    const out = [];
    for (let ym = last; ym >= first && out.length < MAX_MONTHS; ym = shiftMonth(ym, -1)) {
      if (x.manifest.months[ym] && !x.parts.has(ym)) out.push(ym);
    }
    return out;
  }

  async ensure(x) {
    if (x.busy) return;
    x.busy = true;
    try {
      for (;;) {
        const need = this.wantedMonths(x);
        if (!need.length) break;
        /* По чотири місяці: панель заповнюється справа наліво й не
           чекає, поки скачається вся видима історія. */
        const batch = need.slice(0, 4);
        const parts = await Promise.all(batch.map((ym) => loadMonths(x.name, x.manifest, [ym]).then((p) => [ym, p])));
        if (!this.alive || !this.list.includes(x)) return;
        parts.forEach(([ym, p]) => x.parts.set(ym, p));
        this.join(x);
        this.render();
        this.changed();
      }
    } catch (err) {
      x.error = err?.message || 'error';
      this.changed();
    } finally {
      x.busy = false;
    }
  }

  /* Завантажені місяці → один відсортований набір хвилинок. */
  join(x) {
    const parts = [...x.parts.keys()].sort().map((k) => x.parts.get(k)).filter((p) => p?.n);
    const n = parts.reduce((s, p) => s + p.n, 0);
    const b = {
      symbol: x.name, digits: x.digits, baseSec: 60, n,
      t: new Int32Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n),
    };
    let at = 0;
    parts.forEach((p) => {
      b.t.set(p.t, at); b.o.set(p.o, at); b.h.set(p.h, at); b.l.set(p.l, at); b.c.set(p.c, at);
      at += p.n;
    });
    x.base = b;
    x.aggs.clear();
  }

  aggOf(x, id) {
    const tf = tfById(id);
    const key = tf.sec < (x.base.baseSec || 60) ? 'base' : tf.id;
    if (!x.aggs.has(key)) x.aggs.set(key, aggregate(x.base, key === 'base' ? x.base.baseSec || 60 : tf));
    return x.aggs.get(key);
  }

  /* ---------------- малювання ---------------- */

  /* Свічки панелі для поточного вікна основного графіка. */
  data(x) {
    const e = this.e;
    const a = e.agg;
    if (!x.base?.n || !a || e.lastK < 0) return [];
    const oa = this.aggOf(x, e.tf);
    const ob = x.base;
    /* До якої хвилини «вже сталося». Поки свічка основного графіка
       ще росте в анімації — рахуємо від її початку. */
    const cut = e.cut == null ? null : (e.anim ? e.anim.from : e.cut);
    const cutTime = cut == null ? Infinity : e.base.t[Math.max(0, cut - 1)];
    const ocut = cutTime === Infinity ? ob.n : upperBound(ob.t, cutTime);
    const out = [];
    let j = lowerBound(oa.t, a.t[e.win]);
    for (let k = e.win; k <= e.lastK && j < oa.n; k += 1) {
      const t = a.t[k];
      while (j < oa.n && oa.t[j] < t) j += 1;
      if (j >= oa.n) break;
      if (oa.t[j] !== t) continue;
      if (oa.s[j] >= ocut) break;
      const full = oa.s[j + 1] <= ocut;
      out.push(full
        ? { time: t, open: oa.o[j], high: oa.h[j], low: oa.l[j], close: oa.c[j] }
        : barAt(oa, ob, j, ocut));
    }
    return out;
  }

  render() {
    if (!this.e.agg) return;
    this.list.forEach((x) => {
      if (!x.api) return;
      const d = this.data(x);
      x.last = d.length ? d[d.length - 1] : null;
      try { x.api.setData(d); } catch { /* панель могли щойно прибрати */ }
    });
  }

  /* Верх кожної панелі в пікселях від верху графіка. */
  paneTops() {
    const out = [];
    try {
      const panes = this.e.chart.panes();
      const root = this.e.chart.chartElement().getBoundingClientRect();
      this.list.forEach((x, i) => {
        const el = panes[i + 1]?.getHTMLElement?.();
        out.push(el ? el.getBoundingClientRect().top - root.top : null);
      });
    } catch { /* ок */ }
    return out;
  }
}

export { MAX_LINKED };

if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
