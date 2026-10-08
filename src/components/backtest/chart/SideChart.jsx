import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, LineStyle } from 'lightweight-charts';
import { X } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { chartOptions, seriesOptions } from '../../../lib/candles/chartPrefs';
import { tfIndexOfBase, barAt, tfById, aggregate, upperBound } from '../../../lib/candles/agg';

/* ==================================================================
   Другий графік того самого інструмента поруч — інший таймфрейм.
   Наприклад, вхід шукаєш на M15, а контекст тримаєш на H4.

   Свічки — з тих самих хвилинок, що й основний графік, і рівно до тієї
   самої хвилини реплею: незакрита свічка H4 збирається лише з того,
   що вже «сталося». Рівні відкритої угоди (вхід, стоп, тейк) теж тут.
================================================================== */

export const SIDE_TFS = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
const SHOW = 1500; // скільки свічок віддаємо бібліотеці

export default function SideChart({ eng, prefs, tf, st, onTf, onClose, width, linked = null, linkedTick = null, onBack }) {
  const boxRef = useRef(null);
  const api = useRef({ chart: null, series: null, lines: {}, key: '', tf: '' });

  /* Створюємо графік один раз; тема — з налаштувань основного. */
  useEffect(() => {
    const chart = createChart(boxRef.current, { ...chartOptions(prefs), autoSize: true });
    const series = chart.addSeries(CandlestickSeries, seriesOptions(prefs, eng()?.base?.digits ?? 2));
    api.current = { chart, series, lines: {}, key: '', tf: '' };
    return () => { try { chart.remove(); } catch { /* уже немає */ } api.current.chart = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = api.current;
    if (!a.chart) return;
    const { rightOffset, ...ts } = chartOptions(prefs).timeScale; // eslint-disable-line no-unused-vars
    a.chart.applyOptions({ ...chartOptions(prefs), timeScale: ts });
    a.series.applyOptions(seriesOptions(prefs, eng()?.base?.digits ?? 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  /* Дані: на кожен крок реплею, зміну ТФ чи інструмента. */
  useEffect(() => {
    const a = api.current;
    const e = eng();
    if (!a.chart || !e?.base?.n) return;
    /* Джерело: сам інструмент графіка або інструмент з панелі під ним
       («відкрити збоку»). Для іншого інструмента межа реплею — той самий
       час, а не той самий індекс хвилинки. */
    let base = e.base;
    let agg;
    let cut = e.cut == null ? base.n : (e.anim ? e.anim.from : e.cut);
    if (linked) {
      const src = linked.base;
      if (!src?.n) return;
      const cutT = e.cut == null ? Infinity : e.base.t[Math.max(0, cut - 1)];
      if (a.aggSrc !== src || a.aggTf !== tf) { a.agg = aggregate(src, tfById(tf)); a.aggSrc = src; a.aggTf = tf; }
      agg = a.agg;
      base = src;
      cut = cutT === Infinity ? src.n : upperBound(src.t, cutT);
      if (cut < 1) return;
    } else {
      agg = e.getAgg(tfById(tf).sec < (base.baseSec || 60) ? 'M1' : tf);
    }
    const k = tfIndexOfBase(agg, Math.max(0, cut - 1));
    const from = Math.max(0, k - SHOW + 1);
    const out = [];
    for (let i = from; i <= k; i += 1) out.push(i < k ? { time: agg.t[i], open: agg.o[i], high: agg.h[i], low: agg.l[i], close: agg.c[i] } : barAt(agg, base, i, cut));
    const key = `${base.symbol}|${base.t[0]}|${tf}`;
    const fresh = key !== a.key;
    /* Якщо додалась лише остання свічка — update, без повного перемальовування. */
    const step = !fresh && a.lastK != null && (k === a.lastK || k === a.lastK + 1);
    if (step) {
      try {
        if (k === a.lastK + 1 && out.length > 1) a.series.update(out[out.length - 2]);
        a.series.update(out[out.length - 1]);
      } catch { a.series.setData(out); }
    } else {
      a.series.setData(out);
    }
    a.lastFrom = from; a.lastK = k;
    if (fresh) {
      a.key = key;
      a.series.applyOptions(seriesOptions(prefs, base.digits ?? 2));
      a.chart.timeScale().setVisibleLogicalRange({ from: out.length - 90, to: out.length + 6 });
    }
  }, [eng, tf, st?.time, st?.tf, st?.replay, st?.snap?.cutT, linked, linkedTick]);

  /* Рівні угоди. */
  useEffect(() => {
    const a = api.current;
    if (!a.series) return;
    const x = linked ? null : (st?.pos || st?.order || st?.draft);
    const want = x ? {
      entry: { price: x.entry, color: '#787b86' },
      sl: { price: x.sl, color: '#f23645' },
      tp: { price: x.tp, color: '#089981' },
    } : {};
    Object.keys(a.lines).forEach((kk) => { if (!want[kk]) { try { a.series.removePriceLine(a.lines[kk]); } catch { /* ок */ } delete a.lines[kk]; } });
    Object.entries(want).forEach(([kk, o]) => {
      if (!Number.isFinite(o.price)) return;
      const opts = { price: o.price, color: o.color, lineWidth: 1, lineStyle: kk === 'entry' ? LineStyle.Dashed : LineStyle.Solid, axisLabelVisible: true, title: '' };
      if (a.lines[kk]) a.lines[kk].applyOptions(opts); else a.lines[kk] = a.series.createPriceLine(opts);
    });
  }, [st?.pos?.entry, st?.pos?.sl, st?.pos?.tp, st?.order?.entry, st?.order?.sl, st?.order?.tp, st?.draft?.entry, st?.draft?.sl, st?.draft?.tp, !!st?.pos, !!st?.order, !!st?.draft]);

  const own = eng()?.base?.symbol || '';
  const name = linked ? linked.name : own;
  return (
    <div className="relative min-w-[260px] shrink-0" style={{ width, background: prefs.bg, borderLeft: `1px solid ${T.line}` }}>
      <div ref={boxRef} className="absolute inset-0" />
      <div className="absolute left-2 top-1.5 z-[5] flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ background: 'rgba(20,21,26,0.72)', border: `1px solid ${T.line}`, backdropFilter: 'blur(6px)' }}>
        <span className="px-1.5 text-[12px] font-semibold" style={{ color: prefs.text || T.text }}>{name}</span>
        {SIDE_TFS.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => onTf(x)}
            className="rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold"
            style={{ color: x === tf ? '#fff' : T.text3, background: x === tf ? '#2962ff' : 'transparent' }}
          >
            {x}
          </button>
        ))}
        {linked && onBack && (
          <button type="button" onClick={onBack} title={tx(`Повернути ${own}`, `Back to ${own}`)} className="rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold hover:bg-white/10" style={{ color: T.text3 }}>
            ↩ {own}
          </button>
        )}
        <span className="mx-0.5 h-4 w-px" style={{ background: T.line }} />
        <button type="button" onClick={onClose} title={tx('Закрити боковий графік', 'Close side chart')} aria-label={tx('Закрити боковий графік', 'Close side chart')} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-semibold transition-colors hover:bg-[rgba(242,54,69,0.15)] hover:text-[#f23645]" style={{ color: T.text2 }}>
          <X size={13} /> {tx('Закрити', 'Close')}
        </button>
      </div>
    </div>
  );
}
