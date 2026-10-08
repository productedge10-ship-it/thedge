import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { flagSrc, warmFlags } from '../../../lib/flags';
import { upperBound } from '../../../lib/candles/agg';
import { fmtStamp } from '../../../lib/candles/timefmt';
import { newsBetween, newsCcys, IMPACT_RANK, IMPACT_COLOR, surprise } from '../../../lib/candles/newsHistory';

/* ==================================================================
   Новини внизу графіка, як економічні події в TradingView.

   Значок стоїть на свічці, під час якої вийшла новина. У реплеї видно
   лише те, що вже вийшло: майбутні новини не показуємо зовсім, щоб не
   підказувати, що буде далі. Наведи — побачиш факт, прогноз і
   попереднє значення.
================================================================== */

const MIN_RANK = { high: 3, medium: 2, all: 1 };
const PAD = 15 * 86400;

export default function NewsMarks({ eng, prefs, symbol }) {
  const [events, setEvents] = useState([]);
  const [marks, setMarks] = useState({ list: [], h: 0, w: 0 });
  const [hover, setHover] = useState(null);
  const want = useRef({ from: 0, to: 0 });
  const sig = useRef('');

  const ccys = useMemo(() => newsCcys(symbol), [symbol]);
  const minRank = MIN_RANK[prefs.newsImpact] || 2;

  useEffect(() => { warmFlags(ccys); }, [ccys]);

  /* Що видно і де стоять значки — кожен кадр (дешево: лише видиме). */
  useEffect(() => {
    let raf = 0;
    let loading = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const e = eng();
      const agg = e?.agg;
      if (!e?.chart || !agg?.t?.length || e.lastK == null) return;
      const ts = e.chart.timeScale();
      const r = ts.getVisibleLogicalRange();
      if (!r) return;
      const k0 = Math.max(0, Math.floor(r.from + e.win));
      const k1 = Math.min(e.lastK, Math.ceil(r.to + e.win));
      if (k1 < k0) return;
      const from = agg.t[k0];
      const to = agg.t[k1] + agg.sec;

      /* Підвантаження з запасом, щоб гортання не впиралось у порожнечу. */
      const w = want.current;
      if (!loading && (from < w.from || to > w.to)) {
        loading = true;
        const lo = from - PAD; const hi = to + PAD;
        newsBetween(lo, hi).then((list) => {
          want.current = { from: lo, to: hi };
          setEvents(list);
        }).finally(() => { loading = false; });
      }

      const nowT = e.replay && e.cut != null ? e.base.t[e.cut - 1] + 59 : Infinity;
      let h = 0; let pw = 0;
      try { h = e.chart.panes()[0].getHeight(); } catch { /* ок */ }
      try { pw = ts.width(); } catch { /* ок */ }
      const groups = new Map();
      for (const ev of events) {
        if (ev.t < from || ev.t > to || ev.t > nowT) continue;
        if ((IMPACT_RANK[ev.impact] ?? 1) < minRank || !ccys.includes(ev.ccy)) continue;
        const k = upperBound(agg.t, ev.t) - 1;
        if (k < 0 || k > e.lastK) continue;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(ev);
      }
      const list = [];
      groups.forEach((evs, k) => {
        const x = ts.logicalToCoordinate(k - e.win);
        if (x == null || x < 8 || x > pw - 8) return;
        list.push({ k, x: Math.round(x), evs });
      });
      list.sort((a, b) => a.x - b.x);
      /* Значки ближче 22 px зливаються в один — інакше на 1H вони
         налазять один на одного. */
      for (let i = list.length - 1; i > 0; i -= 1) {
        if (list[i].x - list[i - 1].x < 22) {
          list[i - 1] = { ...list[i - 1], evs: [...list[i - 1].evs, ...list[i].evs] };
          list.splice(i, 1);
        }
      }
      const s = `${h}|${pw}|${list.map((m) => `${m.k}:${m.x}:${m.evs.length}`).join(',')}`;
      if (s !== sig.current) { sig.current = s; setMarks({ list, h, w: pw }); }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [eng, events, ccys, minRank]);

  /* Зміна інструмента — інша валюта, з нуля. */
  useEffect(() => { want.current = { from: 0, to: 0 }; setHover(null); }, [symbol]);

  if (!marks.h) return null;
  const y = marks.h - 26;
  const hv = hover && marks.list.find((m) => m.k === hover);

  return (
    <>
      {hv && (
        <div className="pointer-events-none absolute top-0 z-[6] w-px" style={{ left: hv.x, height: marks.h, background: 'repeating-linear-gradient(to bottom, rgba(120,123,134,0.7) 0 4px, transparent 4px 8px)' }} />
      )}
      {marks.list.map((m) => {
        const top = m.evs.reduce((a, b) => ((IMPACT_RANK[b.impact] ?? 0) > (IMPACT_RANK[a.impact] ?? 0) ? b : a), m.evs[0]);
        const src = flagSrc(top.ccy);
        return (
          <div
            key={m.k}
            className="absolute z-[7] -translate-x-1/2 cursor-pointer"
            style={{ left: m.x, top: y }}
            onMouseEnter={() => setHover(m.k)}
            onMouseLeave={() => setHover((h) => (h === m.k ? null : h))}
          >
            <span className="relative grid h-[20px] w-[20px] place-items-center overflow-hidden rounded-full" style={{ border: `2px solid ${IMPACT_COLOR[top.impact] || '#787b86'}`, background: T.surface3 }}>
              {src ? <img src={src} alt={top.ccy} className="h-full w-full object-cover" draggable={false} /> : <span className="text-[8px] font-bold" style={{ color: T.text }}>{top.ccy}</span>}
            </span>
            {m.evs.length > 1 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-[13px] min-w-[13px] place-items-center rounded-full px-0.5 text-[9px] font-bold text-white" style={{ background: '#2962ff' }}>{m.evs.length}</span>
            )}
          </div>
        );
      })}
      {hv && (
        <div
          className="pointer-events-none absolute z-[30] w-[300px] rounded-xl p-2.5"
          style={{
            left: Math.max(8, Math.min(hv.x - 150, marks.w - 308)),
            top: y - 8, transform: 'translateY(-100%)',
            background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}
        >
          {hv.evs.slice(0, 8).map((ev) => {
            const s = surprise(ev);
            return (
              <div key={ev.id} className="border-b py-1.5 last:border-b-0" style={{ borderColor: T.line }}>
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: T.text }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: IMPACT_COLOR[ev.impact] }} />
                  {flagSrc(ev.ccy) && <img src={flagSrc(ev.ccy)} alt="" className="h-3 w-4 shrink-0 rounded-[2px] object-cover" />}
                  <span className="truncate">{ev.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-3 pl-3.5 text-[11.5px] tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>
                  <span>{ev.ccy} · {fmtStamp(ev.t, prefs)}</span>
                </div>
                <div className="mt-1 grid grid-cols-3 gap-1 pl-3.5 text-[11.5px] tabular-nums" style={{ fontFamily: T.mono }}>
                  <span style={{ color: T.text3 }}>{tx('Факт', 'Actual')} <b style={{ color: s > 0 ? '#089981' : s < 0 ? '#f23645' : T.text }}>{ev.actual || '—'}</b></span>
                  <span style={{ color: T.text3 }}>{tx('Прогн.', 'Fcst')} <b style={{ color: T.text2 }}>{ev.forecast || '—'}</b></span>
                  <span style={{ color: T.text3 }}>{tx('Попер.', 'Prev')} <b style={{ color: T.text2 }}>{ev.previous || '—'}</b></span>
                </div>
              </div>
            );
          })}
          {hv.evs.length > 8 && <div className="pt-1 text-[11px]" style={{ color: T.text3 }}>{tx(`і ще ${hv.evs.length - 8}`, `and ${hv.evs.length - 8} more`)}</div>}
        </div>
      )}
    </>
  );
}
