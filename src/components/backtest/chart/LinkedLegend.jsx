import { useEffect, useState } from 'react';
import { Loader2, X, ChevronDown, Columns2 } from 'lucide-react';
import { t as tx } from '../../../lib/lang';
import { isLight } from '../../../lib/candles/chartPrefs';

/* ==================================================================
   Підписи панелей з іншими інструментами (LinkedPanes) — зліва
   вгорі кожної панелі, як у TV: назва, таймфрейм, OHLC свічки під
   курсором (або останньої), хрестик — прибрати панель.
================================================================== */

const FONT = "-apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif";

export default function LinkedLegend({ lp, chart, items, prefs, tfLabel, onRemove, onSide, sideKey }) {
  const [tops, setTops] = useState([]);
  const [hover, setHover] = useState(null);

  /* Межу між панелями можна тягнути — підглядаємо зрідка. */
  useEffect(() => {
    if (!lp) return undefined;
    const upd = () => {
      const t = lp.paneTops();
      setTops((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
    };
    /* Кожен кадр, а не раз на 300 мс: інакше при згортанні панелі смужка з
       назвою ще кілька кадрів висить на старому місці посеред графіка. */
    let raf = 0;
    const loop = () => { upd(); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [lp, items]);

  /* Перехрестя спільне для всіх панелей — беремо свічку кожної. */
  useEffect(() => {
    if (!chart || !lp) return undefined;
    const fn = (param) => {
      if (!param?.time) { setHover(null); return; }
      setHover(lp.list.map((x) => (x.api ? param.seriesData.get(x.api) || null : null)));
    };
    chart.subscribeCrosshairMove(fn);
    return () => { try { chart.unsubscribeCrosshairMove(fn); } catch { /* графік уже знищено */ } };
  }, [chart, lp]);

  if (!lp || !items?.length) return null;
  const style = { color: prefs.text, fontSize: prefs.fontSize + 1, fontFamily: FONT };

  return items.map((it, i) => {
    const top = tops[i];
    if (top == null) return null;
    const x = lp.list[i];
    const b = (hover ? hover[i] : null) || x?.last || null;
    const d = x?.digits ?? 2;
    const up = b ? b.close >= b.open : true;
    const col = up ? prefs.up : prefs.down;
    /* Шапка панелі на всю ширину: інший відтінок і чітка лінія зверху —
       щоб графік знизу не зливався з основним (як у TV). */
    const plotW = chart ? chart.timeScale().width() : 0;
    const light = isLight(prefs.bg);
    return (
      <div key={it.key}>
      <div
        className="pointer-events-none absolute left-0 z-[4]"
        style={{
          top, width: plotW || '100%', height: 26,
          background: light ? 'rgba(15,20,30,0.05)' : 'rgba(255,255,255,0.045)',
          borderTop: `1px solid ${light ? 'rgba(15,20,30,0.28)' : 'rgba(255,255,255,0.22)'}`,
          borderBottom: `1px solid ${light ? 'rgba(15,20,30,0.08)' : 'rgba(255,255,255,0.06)'}`,
        }}
      />
      <div className="group pointer-events-none absolute left-2 z-[5] flex items-center gap-2 whitespace-nowrap" style={{ top: top + 4, ...style }}>
        {/* Подвійний клік по назві — згорнути / розгорнути панель, як у TV. */}
        <span
          className="pointer-events-auto cursor-pointer select-none font-semibold"
          title={it.collapsed ? tx('Подвійний клік — розгорнути', 'Double-click to expand') : tx('Подвійний клік — згорнути', 'Double-click to collapse')}
          onDoubleClick={() => lp.toggleCollapsed(it.key)}
        >
          {it.name}
        </span>
        <span className="opacity-60">· {tfLabel}</span>
        {it.loading && <Loader2 size={13} className="animate-spin opacity-70" />}
        {it.error && !it.loading && (
          <span className="text-[11px]" style={{ color: '#f23645' }}>
            {it.error === 'no_history' ? tx('немає історії', 'no history') : tx('не вдалося завантажити', 'failed to load')}
          </span>
        )}
        {b && (
          <span className="tabular-nums" style={{ fontSize: prefs.fontSize }}>
            <span className="opacity-60">O</span><span style={{ color: col }}>{b.open.toFixed(d)}</span>{' '}
            <span className="opacity-60">H</span><span style={{ color: col }}>{b.high.toFixed(d)}</span>{' '}
            <span className="opacity-60">L</span><span style={{ color: col }}>{b.low.toFixed(d)}</span>{' '}
            <span className="opacity-60">C</span><span style={{ color: col }}>{b.close.toFixed(d)}</span>
          </span>
        )}
        {!b && !it.loading && !it.error && it.ready && (
          <span className="text-[11px] opacity-60">{tx('немає свічок на цих датах', 'no candles at these dates')}</span>
        )}
        <button
          type="button"
          title={it.collapsed ? tx('Розгорнути панель', 'Expand pane') : tx('Згорнути панель', 'Collapse pane')}
          aria-label={it.collapsed ? tx('Розгорнути панель', 'Expand pane') : tx('Згорнути панель', 'Collapse pane')}
          onClick={() => lp.toggleCollapsed(it.key)}
          className="pointer-events-auto grid h-[20px] w-[20px] place-items-center rounded opacity-60 transition-opacity hover:opacity-100"
          style={{ background: 'rgba(128,128,128,0.18)' }}
        >
          <ChevronDown size={13} style={{ transform: it.collapsed ? 'rotate(180deg)' : 'none' }} />
        </button>
        {onSide && (
          <button
            type="button"
            title={sideKey === it.key ? tx('Прибрати з бокового графіка', 'Remove from side chart') : tx('Відкрити збоку', 'Open on the side')}
            aria-label={tx('Відкрити збоку', 'Open on the side')}
            onClick={() => onSide(it.key)}
            className="pointer-events-auto grid h-[20px] w-[20px] place-items-center rounded transition-opacity hover:opacity-100"
            style={{ background: sideKey === it.key ? '#2962ff' : 'rgba(128,128,128,0.18)', color: sideKey === it.key ? '#fff' : undefined, opacity: sideKey === it.key ? 1 : 0.6 }}
          >
            <Columns2 size={12} />
          </button>
        )}
        <button
          type="button"
          title={tx('Прибрати панель', 'Remove pane')}
          aria-label={tx('Прибрати панель', 'Remove pane')}
          onClick={() => onRemove(it.key)}
          className="pointer-events-auto grid h-[20px] w-[20px] place-items-center rounded opacity-60 transition-opacity hover:opacity-100"
          style={{ background: 'rgba(128,128,128,0.18)' }}
        >
          <X size={13} />
        </button>
      </div>
      </div>
    );
  });
}
