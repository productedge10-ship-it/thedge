import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Send } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { ACT, act } from './accent';
import { t as tx } from '../../lib/lang';
import { getCatalog } from '../../lib/candles/remote';
import { assetInfo, GROUPS } from '../../lib/candles/assets';
import SymbolLogo from './chart/SymbolLogo';

/* Вибір активу для бектесту «на реальному графіку»: ті самі
   інструменти сервера EDGE по колонках (форекс, метали, індекси,
   крипта), що й у списку на графіку, з логотипами й назвами. */
export default function ServerAssetPicker({ value, onChange, height = 56, fallback }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [catalog, setCatalog] = useState(undefined);
  const box = useRef(null);

  useEffect(() => { let on = true; getCatalog().then((c) => on && setCatalog(c || null)); return () => { on = false; }; }, []);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  if (catalog === null) return fallback || null;

  const needle = q.trim().toUpperCase();
  const core = catalog?.core || [];
  const shown = core.filter((c) => !needle || c.symbol.toUpperCase().includes(needle) || assetInfo(c.symbol, c).name.toUpperCase().includes(needle));
  const cols = GROUPS.map((g) => ({ ...g, items: shown.filter((c) => assetInfo(c.symbol, c).group === g.id) })).filter((g) => g.items.length);
  /* Інструменти «на запит» (149 у брокера) — коли щось шукають: сервер
     докачує їх при першому відкритті. Раніше їх тут не було взагалі. */
  const coreSet = new Set(core.map((c) => c.symbol));
  const demand = needle
    ? (catalog?.onDemand || []).filter((c) => !coreSet.has(c.symbol) && (c.symbol.toUpperCase().includes(needle) || String(c.desc || '').toUpperCase().includes(needle))).slice(0, 40)
    : [];
  const pick = (s) => { onChange(s); setOpen(false); setQ(''); };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2.5 rounded-xl px-3.5"
        style={{ height, background: T.sunken, border: `1px solid ${open ? ACT.to : T.line}`, boxShadow: open ? `0 0 0 3px ${act(0.13)}` : 'none', transition: 'border-color .18s, box-shadow .18s' }}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SymbolLogo symbol={value} size={24} />
          <span className="truncate text-[14px] font-bold tracking-[0.05em]" style={{ fontFamily: T.mono, color: T.text }}>{value}</span>
        </span>
        <ChevronDown size={15} strokeWidth={2.2} className="shrink-0" style={{ color: ACT.tint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE }}
            className="absolute left-0 top-[calc(100%+8px)] z-40 w-full overflow-hidden rounded-[14px]"
            style={{ background: T.surfaceHi, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
              <Search size={13} strokeWidth={2.4} style={{ color: T.text3 }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tx('Пошук активу…', 'Search asset…')}
                className="w-full min-w-0 bg-transparent text-[13px] outline-none"
                style={{ fontFamily: T.sans, color: T.text }}
              />
            </div>
            <div className="custom-scrollbar max-h-[300px] overflow-y-auto p-1.5">
              {catalog === undefined && <p className="px-2.5 py-3 text-[13px]" style={{ color: T.text4 }}>{tx('Завантажую…', 'Loading…')}</p>}
              {catalog && !cols.length && !demand.length && <p className="px-2.5 py-3 text-[13px]" style={{ color: T.text4 }}>{tx('Нічого не знайшлось.', 'Nothing found.')}</p>}
              {cols.map((g) => (
                <div key={g.id}>
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text3 }}>
                    <span>{tx(g.uk, g.en)}</span>
                    <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{g.items.length}</span>
                  </div>
                  {g.items.map((c) => {
                    const info = assetInfo(c.symbol, c);
                    const on = c.symbol === value;
                    return (
                      <button key={c.symbol} type="button" onClick={() => pick(c.symbol)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/5" style={{ background: on ? act(0.18) : undefined }}>
                        <SymbolLogo symbol={c.symbol} size={24} />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-bold leading-tight" style={{ color: T.text }}>{c.symbol}</span>
                          {info.name && <span className="block truncate text-[11.5px] leading-tight" style={{ color: T.text3 }}>{info.name}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {demand.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text3 }}>
                    <span>{tx('На запит', 'On request')}</span>
                    <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{demand.length}</span>
                  </div>
                  {demand.map((c) => (
                    <button key={c.symbol} type="button" onClick={() => pick(c.symbol)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/5" style={{ background: c.symbol === value ? act(0.18) : undefined }}>
                      <SymbolLogo symbol={c.symbol} size={24} />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-bold leading-tight" style={{ color: T.text }}>{c.symbol}</span>
                        <span className="block truncate text-[11.5px] leading-tight" style={{ color: T.text3 }}>{c.desc || assetInfo(c.symbol, c).name} · {tx('перше відкриття ~1 хв', 'first open ~1 min')}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!needle && catalog?.onDemand?.length > 0 && (
                <p className="px-2.5 pb-1 pt-2.5 text-[11.5px]" style={{ color: T.text3 }}>
                  {tx(`Ще ${catalog.onDemand.length} інструментів на запит — почни вводити назву.`, `${catalog.onDemand.length} more on request — start typing.`)}
                </p>
              )}
            </div>
            <div className="px-3 py-2.5" style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}>
              <div className="text-[12px] leading-snug" style={{ color: T.text2 }}>{tx('Немає вашого активу? Будь ласка, напишіть нам у Telegram — додамо.', "Don't see your asset? Please message us on Telegram and we'll add it.")}</div>
              <a href="https://t.me/thedgesupport" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold" style={{ background: act(0.14), color: ACT.tint }}>
                <Send size={13} /> {tx('Написати в Telegram', 'Message on Telegram')}
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
