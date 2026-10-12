import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Send, UploadCloud, Trash2 } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx, LOCALE } from '../../../lib/lang';
import { ACT, act } from '../accent';
import SymbolLogo from './SymbolLogo';
import { assetInfo, GROUPS } from '../../../lib/candles/assets';
import { fmtTime } from '../../../lib/candles/agg';
import { REMOTE_PREFIX } from '../../../lib/candles/remote';

/* ==================================================================
   Пошук інструмента, як у TradingView: одне поле, чипи категорій і
   компактний список, а не стіна з колонок, яку треба гортати.

   Відкривається кнопкою символу або просто набором літер на графіку
   (initial — перша натиснута літера). Стрілки ↑↓ ходять по списку,
   Enter відкриває, Esc закриває.
================================================================== */

const MAX_ON_DEMAND = 40;

/* Без запиту зверху — те, що торгують найчастіше, далі за категоріями. */
const POPULAR = ['XAUUSD', 'EURUSD', 'GBPUSD', 'NDX100', 'US30', 'SPX500', 'GER30', 'USDJPY', 'BTCUSD', 'DXY'];
const popRank = (s) => { const i = POPULAR.indexOf(s); return i < 0 ? 99 : i; };

export default function SymbolSearch({ open, initial = '', onClose, catalog, sets = [], current, onPick, onRemoveSet, onUpload }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [hi, setHi] = useState(0);
  const input = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(initial || '');
    setHi(0);
    const t = setTimeout(() => {
      const el = input.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
    return () => clearTimeout(t);
  }, [open, initial]);

  /* Усі рядки одним списком: сервер EDGE, «на запит» брокера, власні файли. */
  const rows = useMemo(() => {
    const out = [];
    (catalog?.core || []).forEach((c) => {
      const info = assetInfo(c.symbol, c);
      out.push({ key: REMOTE_PREFIX + c.symbol, symbol: c.symbol, name: info.name || c.desc || '', group: info.group, kind: 'core' });
    });
    (sets || []).forEach((s) => {
      const info = assetInfo(s.symbol);
      out.push({
        key: s.symbol, symbol: s.symbol, group: info.group, kind: 'file', set: s,
        name: `${fmtTime(s.from).slice(0, 10)} — ${fmtTime(s.to).slice(0, 10)} · ${s.n.toLocaleString(LOCALE)}`,
      });
    });
    return out;
  }, [catalog, sets]);

  const needle = q.trim().toUpperCase();
  const match = (r) => !needle || r.symbol.toUpperCase().includes(needle) || (r.name || '').toUpperCase().includes(needle);
  const rank = (r) => (r.symbol.toUpperCase().startsWith(needle) ? 0 : 1);

  const counts = useMemo(() => {
    const m = {};
    rows.filter(match).forEach((r) => { m[r.group] = (m[r.group] || 0) + 1; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, needle]);

  const list = useMemo(() => {
    let l = rows.filter((r) => match(r) && (cat === 'all' || r.group === cat));
    const gi = (g) => { const i = GROUPS.findIndex((x) => x.id === g); return i < 0 ? 99 : i; };
    l = [...l].sort((a, b) => (needle ? rank(a) - rank(b) : 0)
      || (a.kind === 'file') - (b.kind === 'file')
      || popRank(a.symbol) - popRank(b.symbol)
      || gi(a.group) - gi(b.group)
      || a.symbol.localeCompare(b.symbol));
    /* Інші символи брокера — лише коли щось шукають, інакше їх сотні. */
    if (needle && cat === 'all') {
      const have = new Set(l.map((r) => r.symbol));
      const extra = (catalog?.onDemand || [])
        .filter((x) => !have.has(x.symbol) && (x.symbol.toUpperCase().includes(needle) || (x.desc || '').toUpperCase().includes(needle)))
        .slice(0, MAX_ON_DEMAND)
        .map((x) => ({ key: REMOTE_PREFIX + x.symbol, symbol: x.symbol, name: x.desc || '', group: assetInfo(x.symbol, x).group, kind: 'demand' }));
      l = [...l, ...extra];
    }
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, needle, cat, catalog]);

  useEffect(() => { setHi(0); }, [needle, cat]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${hi}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  if (!open) return null;

  const pick = (r) => { if (r) { onPick(r.key); onClose(); } };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(list[hi]); }
  };

  const chips = [{ id: 'all', uk: 'Усі', en: 'All' }, ...GROUPS.filter((g) => rows.some((r) => r.group === g.id))];
  const groupName = (id) => { const g = GROUPS.find((x) => x.id === id); return g ? tx(g.uk, g.en) : ''; };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-3 pt-[8vh]"
      style={{ background: 'rgba(5,5,10,0.55)', backdropFilter: 'blur(3px)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl"
        style={{ maxHeight: '80vh', background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.9)', animation: 'edgeSymIn .16s ease-out' }}
        onKeyDown={onKey}
      >
        <style>{'@keyframes edgeSymIn{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}'}</style>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="text-[15px] font-bold" style={{ color: T.text }}>{tx('Пошук інструмента', 'Symbol search')}</div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }} title="Esc"><X size={17} /></button>
        </div>

        <div className="px-5">
          <div className="flex items-center gap-2.5 rounded-xl px-3.5" style={{ height: 44, background: T.sunken, border: `1px solid ${ACT.to}`, boxShadow: `0 0 0 3px ${act(0.13)}` }}>
            <Search size={16} style={{ color: T.text3 }} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tx('Символ або назва: XAU, золото, DAX…', 'Symbol or name: XAU, gold, DAX…')}
              className="w-full min-w-0 bg-transparent text-[14px] font-semibold uppercase outline-none placeholder:normal-case placeholder:font-normal"
              style={{ color: T.text, letterSpacing: q ? '0.03em' : 0 }}
              spellCheck={false}
            />
            {q && <button type="button" onClick={() => { setQ(''); input.current?.focus(); }} style={{ color: T.text3 }}><X size={15} /></button>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((c) => {
              const on = cat === c.id;
              const n = c.id === 'all' ? null : counts[c.id] || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setCat(c.id); input.current?.focus(); }}
                  className="rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors"
                  style={{ background: on ? T.text : T.surfaceHi, color: on ? T.bg : T.text2, opacity: n === 0 ? 0.45 : 1 }}
                >
                  {tx(c.uk, c.en)}{n != null && <span style={{ marginLeft: 5, opacity: 0.6, fontFamily: T.mono, fontSize: 11 }}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div ref={listRef} className="mt-3 min-h-[180px] flex-1 overflow-y-auto px-2.5 pb-2" style={{ borderTop: `1px solid ${T.line}` }}>
          {list.map((r, i) => {
            const on = i === hi;
            const cur = r.key === current;
            return (
              <div
                key={r.key + r.kind}
                data-i={i}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(r)}
                className="group mt-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
                style={{ background: on ? act(0.16) : 'transparent', outline: cur ? `1px solid ${act(0.45)}` : 'none' }}
              >
                <SymbolLogo symbol={r.symbol} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold leading-tight" style={{ color: T.text, fontFamily: T.mono, letterSpacing: '0.02em' }}>{r.symbol}</div>
                  <div className="truncate text-[11.5px] leading-tight" style={{ color: T.text3, fontFamily: r.kind === 'file' ? T.mono : undefined }}>{r.name || ' '}</div>
                </div>
                <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: r.kind === 'core' ? T.text3 : ACT.tint }}>
                  {r.kind === 'file' ? tx('мій файл', 'my file') : r.kind === 'demand' ? tx('на запит', 'on request') : groupName(r.group)}
                </span>
                {r.kind === 'file' && onRemoveSet && (
                  <button
                    type="button"
                    title={tx('Видалити з браузера', 'Remove from browser')}
                    onClick={(e) => { e.stopPropagation(); onRemoveSet(r.symbol); }}
                    className="grid h-7 w-7 place-items-center rounded-md opacity-0 group-hover:opacity-100"
                    style={{ color: T.text3 }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {!list.length && (
            <div className="px-3 py-8 text-center text-[13px]" style={{ color: T.text3 }}>
              {tx('Нічого не знайшли. Спробуй інакше написати символ.', 'Nothing found. Try another spelling.')}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}>
          <span className="text-[12px]" style={{ color: T.text3 }}>{tx('Немає вашого активу? Напишіть нам — додамо.', "Don't see your asset? Message us and we'll add it.")}</span>
          <div className="flex items-center gap-1.5">
            {onUpload && (
              <button type="button" onClick={() => { onClose(); onUpload(); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:bg-white/5" style={{ color: T.text2 }}>
                <UploadCloud size={13} /> CSV
              </button>
            )}
            <a href="https://t.me/thedgesupport" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold" style={{ background: act(0.14), color: ACT.tint }}>
              <Send size={13} /> Telegram
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
