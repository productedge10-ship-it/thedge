import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { TFS } from '../../../lib/candles/agg';

/* ==================================================================
   «Змінити інтервал», як у TradingView: на графіку натиснув цифру —
   відкривається віконце з полем, Enter застосовує, Esc закриває.

   Формат TV: просто число — хвилини (1, 15, 45), H — години (1H, 4H),
   D — день, W — тиждень, M — місяці (1M, 3M). Регістр не важливий,
   кирилиця з тієї ж клавіші теж працює (Р = H, В = D, Ц = W, Ь = M).
================================================================== */

const CYR = { р: 'h', в: 'd', ц: 'w', ь: 'm', м: 'm', д: 'd', т: 'w', г: 'h' };

export function parseTf(raw) {
  let s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  s = s.replace(/[а-яіїєґ]/g, (ch) => CYR[ch] || ch);
  const m = /^(\d*)([hdwm]?)$/.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  const n = m[1] ? Number(m[1]) : 1;
  if (!n) return null;
  const u = m[2];
  let hit;
  if (!u) hit = TFS.find((x) => x.group !== 'day' && x.sec === n * 60);
  else if (u === 'h') hit = TFS.find((x) => !x.cal && x.sec === n * 3600 && x.group === 'hour');
  else if (u === 'd') hit = n === 1 ? TFS.find((x) => x.id === 'D1') : null;
  else if (u === 'w') hit = n === 1 ? TFS.find((x) => x.id === 'W1') : null;
  else if (u === 'm') hit = TFS.find((x) => x.cal === 'M' && (x.n || 1) === n);
  return hit || null;
}

export default function TfDialog({ open, initial = '', onClose, onPick }) {
  const [v, setV] = useState('');
  const input = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setV(initial || '');
    const t = setTimeout(() => {
      const el = input.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
    return () => clearTimeout(t);
  }, [open, initial]);

  if (!open) return null;
  const hit = parseTf(v);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      if (hit) { onPick(hit.id); onClose(); }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-3" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-label={tx('Змінити інтервал', 'Change interval')}
        className="w-[300px] rounded-xl p-4"
        style={{ background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 30px 70px -20px rgba(0,0,0,0.9)', animation: 'edgeSymIn .14s ease-out' }}
      >
        <div className="mb-3 text-[15px] font-semibold" style={{ color: T.text }}>{tx('Змінити інтервал', 'Change interval')}</div>
        <input
          ref={input}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg px-3 text-[15px] outline-none"
          style={{ height: 40, background: T.sunken, color: T.text, border: `1px solid ${hit || !v ? T.lineHi : 'rgba(239,68,68,0.6)'}`, fontFamily: T.mono }}
        />
        <div className="mt-2 text-[13px]" style={{ color: hit ? T.text2 : T.text3 }}>
          {hit ? tx(hit.uk, hit.en) : v ? tx('Немає такого інтервалу', 'No such interval') : tx('Напр. 15, 1H, 4H, 1D, 1W', 'E.g. 15, 1H, 4H, 1D, 1W')}
        </div>
      </div>
    </div>,
    document.body,
  );
}
