import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, CandlestickChart } from 'lucide-react';
import { T } from '../../lib/theme';
import { t as tx } from '../../lib/lang';
import useCloudState from '../../hooks/useCloudState';
import { DEFAULT_PREFS, normalizePrefs } from '../../lib/candles/chartPrefs';
import { getManifest, loadMonths, monthOf, shiftMonth } from '../../lib/candles/remote';
import { chartTradeFromRow } from '../../lib/backtestMode';
import ChartEngine from './chart/ChartEngine';
import DrawingManager from './chart/DrawingManager';
import { ACT } from './accent';

/* ==================================================================
   Живий знімок угоди в картці журналу.

   Не картинка, а справжній графік: ті самі свічки з сервера, той
   самий таймфрейм, вид і малюнки, що були в момент входу (або
   виходу). Можна гортати й наближати. «Що було далі» показує свічки
   після угоди — у журналі майбутнє вже не секрет.

   Рушій той самий, що на сторінці графіка, лише без реплею й торгівлі:
   малюнки тільки для перегляду, нічого не записується.
================================================================== */

const MAX_BEFORE = 6; // місяців історії ліворуч від входу, не більше

export default function TradeSnapshot({ row, height = 320 }) {
  const trade = useMemo(() => chartTradeFromRow(row), [row]);
  const [prefsRaw] = useCloudState('chart_prefs', DEFAULT_PREFS, { normalize: normalizePrefs });
  const prefs = useMemo(() => ({ ...normalizePrefs(prefsRaw), markerText: true, showClosed: true, showPositions: true }), [prefsRaw]);
  const boxRef = useRef(null);
  const ovRef = useRef(null);
  const engRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [which, setWhich] = useState('entry');

  useEffect(() => {
    if (!trade || !boxRef.current) return undefined;
    let alive = true;
    const eng = new ChartEngine(boxRef.current, ovRef.current, { ...prefs, tf: trade.tf || prefs.tf }, {
      onState: () => {}, onLegend: () => {}, onClosed: () => {}, onFrame: () => {}, needOlder: () => {},
    });
    const dm = new DrawingManager(eng, boxRef.current, { onChange: () => {}, onSelect: () => {}, onTool: () => {} });
    dm.readOnly = true;
    eng.drawings = dm;
    engRef.current = eng;

    (async () => {
      try {
        const name = String(trade.symbol || '').toUpperCase();
        const manifest = await getManifest(name);
        if (!manifest?.months) throw new Error('no_history');
        /* Скільки історії тягнути: від лівого краю виду на вході (але не
           далі ніж MAX_BEFORE місяців) до місяця після виходу. */
        const viewFrom = trade.snaps?.entry?.view?.from;
        const leftT = Math.min(trade.entryT - 86400 * 10, Number.isFinite(viewFrom) ? viewFrom : Infinity);
        let first = monthOf(leftT);
        const floor = shiftMonth(monthOf(trade.entryT), -MAX_BEFORE);
        if (first < floor) first = floor;
        const last = shiftMonth(monthOf(trade.exitT), 1);
        const months = [];
        for (let ym = first; ym <= last; ym = shiftMonth(ym, 1)) if (manifest.months[ym]) months.push(ym);
        if (!months.length) throw new Error('no_history');
        const set = await loadMonths(name, manifest, months);
        if (!alive) return;
        eng.setData(set);
        eng.loadClosed([trade]);
        if (!eng.openSnap(trade.id, 'entry')) throw new Error('outside');
        setStatus('ready');
      } catch (e) {
        if (alive) setStatus(e?.message === 'no_history' ? 'no_history' : 'error');
      }
    })();

    return () => {
      alive = false;
      try { dm.destroy(); eng.destroy(); } catch { /* уже знищено */ }
      engRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade?.id]);

  const show = (w) => {
    setWhich(w);
    const eng = engRef.current;
    if (!eng || !trade) return;
    if (w === 'after') eng.openSnap(trade.id, 'exit', true);
    else eng.openSnap(trade.id, w, false);
  };

  if (!trade) return null;
  const seg = (on) => ({
    height: 30, padding: '0 11px', borderRadius: 8, fontFamily: T.sans, fontSize: 12.5, fontWeight: 600,
    color: on ? '#fff' : T.text2,
    background: on ? `linear-gradient(180deg, ${ACT.from}, ${ACT.to})` : 'transparent',
    transition: 'all .15s',
  });

  return (
    <div className="mt-[11px] overflow-hidden rounded-2xl" style={{ border: `1px solid ${T.line}`, background: prefs.bg }}>
      <div className="relative" style={{ height }}>
        <div ref={boxRef} className="absolute inset-0" />
        <svg ref={ovRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 3 }} />
        {status !== 'ready' && (
          <div className="absolute inset-0 z-[5] grid place-items-center" style={{ background: prefs.bg }}>
            {status === 'loading' ? (
              <span className="flex items-center gap-2 text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
                <Loader2 size={16} className="animate-spin" /> {tx('Завантажую свічки угоди…', 'Loading the trade’s candles…')}
              </span>
            ) : (
              <span className="flex max-w-[320px] flex-col items-center gap-2 text-center text-[13px]" style={{ color: T.text3, fontFamily: T.sans }}>
                <CandlestickChart size={20} />
                {status === 'no_history'
                  ? tx('На сервері немає свічок для цього активу — дивись скріншот.', 'No server candles for this asset — see the screenshot.')
                  : tx('Не вдалося відкрити знімок. Спробуй ще раз пізніше.', 'Couldn’t open the snapshot. Try again later.')}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-2" style={{ background: T.bg, borderTop: `1px solid ${T.line}` }}>
        <span className="flex gap-1">
          {[['entry', tx('На вході', 'At entry')], ['exit', tx('На виході', 'At exit')], ['after', tx('Що було далі', 'What happened next')]].map(([id, label]) => (
            <button key={id} type="button" disabled={status !== 'ready'} onClick={() => show(id)} style={seg(which === id)} className="disabled:opacity-40">{label}</button>
          ))}
        </span>
        <span className="text-[11.5px]" style={{ fontFamily: T.mono, color: T.text3 }}>
          {trade.tf} · {trade.result === 'BE' ? 'BE' : `${trade.r > 0 ? '+' : ''}${Number(trade.r).toFixed(2)}R`}
        </span>
      </div>
    </div>
  );
}
