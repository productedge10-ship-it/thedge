import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { T } from '../../lib/theme';
import { money2 } from '../../lib/accountsStore';
import { listMt5Snapshots } from '../../lib/mt5Store';

/* ==================================================================
   Картка підключеного терміналу.

   Числа тут — брокерські, не наші: у балансі вже враховані свопи,
   комісії й виплати, які журнал може й не бачити. Тому ця картка
   свідомо не намагається зійтися з тим, що порахував журнал; вона
   показує рахунок таким, яким його бачить проп.

   Крива вантажиться лише при розкритті — на сторінці таких карток
   може бути з десяток, і тягнути історію для всіх наперед значить
   платити за те, на що ніхто не дивиться.
================================================================== */

function Sparkline({ points, up }) {
  const d = useMemo(() => {
    if (!points || points.length < 2) return null;

    const vals = points.map((p) => Number(p.balance)).filter(Number.isFinite);
    if (vals.length < 2) return null;

    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || Math.abs(hi) * 0.001 || 1;

    const W = 300;
    const H = 64;
    const step = W / (vals.length - 1);

    const line = vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(H - ((v - lo) / span) * (H - 8) - 4).toFixed(1)}`)
      .join(' ');

    return { line, area: `${line} L ${W} ${H} L 0 ${H} Z`, W, H };
  }, [points]);

  if (!d) return null;
  const c = up ? T.ok : T.bad;
  const rgb = up ? T.okRgb : T.badRgb;

  return (
    <svg viewBox={`0 0 ${d.W} ${d.H}`} preserveAspectRatio="none" className="h-16 w-full">
      <defs>
        <linearGradient id={`lt-${rgb}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`rgba(${rgb},0.28)`} />
          <stop offset="100%" stopColor={`rgba(${rgb},0)`} />
        </linearGradient>
      </defs>
      <path d={d.area} fill={`url(#lt-${rgb})`} />
      <path d={d.line} fill="none" stroke={c} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function LinkedTerminal({ acc, Card }) {
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || points) return undefined;
    let alive = true;
    setLoading(true);
    listMt5Snapshots(acc.id)
      .then((rows) => { if (alive) setPoints(rows); })
      .catch(() => { if (alive) setPoints([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, points, acc.id]);

  const live = acc.status === 'active';
  const bal = Number(acc.balance);
  const eq = Number(acc.equity);

  /* Плаваючий прибуток — різниця між еквіті й балансом: скільки зараз
     висить у відкритих позиціях. Нуль означає, що позицій немає. */
  const float = Number.isFinite(eq) && Number.isFinite(bal) ? eq - bal : null;
  const up = points && points.length > 1
    ? Number(points[points.length - 1].balance) >= Number(points[0].balance)
    : (float ?? 0) >= 0;

  return (
    <Card hue={live ? T.okRgb : T.warnRgb} hoverable className="p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative z-10 block w-full text-left"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: live ? T.ok : T.warn, boxShadow: `0 0 8px ${live ? T.ok : T.warn}` }}
          />
          <span className="min-w-0 flex-1 truncate text-[14px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
            {acc.account_title || acc.server}
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }} style={{ display: 'grid', color: T.text4 }}>
            <ChevronDown size={15} strokeWidth={2.4} />
          </motion.span>
        </div>

        <p
          className="mt-3 text-[26px] font-bold tabular-nums"
          style={{ fontFamily: T.mono, color: T.text, letterSpacing: '-0.02em' }}
        >
          {Number.isFinite(bal) ? money2(bal) : '—'}
          {acc.currency && (
            <span className="ml-1.5 text-[12px] font-semibold" style={{ color: T.text4 }}>{acc.currency}</span>
          )}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {Number.isFinite(eq) && (
            <Bit label="Equity" value={money2(eq)} c={T.text2} />
          )}
          {float !== null && Math.abs(float) > 0.004 && (
            <Bit
              label="Floating"
              value={`${float > 0 ? '+' : '−'}${money2(Math.abs(float))}`}
              c={float >= 0 ? T.ok : T.bad}
            />
          )}
          {acc.leverage ? <Bit label="Leverage" value={`1:${acc.leverage}`} c={T.text3} /> : null}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28 }}
            className="relative z-10 overflow-hidden"
          >
            <div className="mt-4 border-t pt-3" style={{ borderColor: T.line }}>
              {loading && (
                <p className="py-6 text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Loading history…
                </p>
              )}

              {!loading && points && points.length > 1 && (
                <>
                  <Sparkline points={points} up={up} />
                  <p className="mt-2 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                    Balance over the last {points.length} checks
                  </p>
                </>
              )}

              {/* Знімків ще нема — це не поломка, а вік рахунку: воркер
                  лишає слід тільки коли баланс змінився. */}
              {!loading && points && points.length < 2 && (
                <p className="py-5 text-center text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  Not enough history yet — the curve shows up once the balance moves.
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                <Bit label="Login" value={String(acc.login)} c={T.text3} />
                <Bit label="Server" value={acc.server} c={T.text3} />
                {acc.last_sync_at && (
                  <Bit label="Synced" value={new Date(acc.last_sync_at).toLocaleString()} c={T.text4} />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Bit({ label, value, c }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        {label}
      </span>
      <span className="tabular-nums text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: c || T.text2 }}>
        {value}
      </span>
    </span>
  );
}
