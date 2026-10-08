import { useEffect, useRef, useState } from 'react';
import { Plus, Pipette } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { parseColor, toCss, toHex } from '../../../lib/candles/chartPrefs';
import { usePopover, PopPanel } from './Popover';

/* ==================================================================
   Вибір кольору як у TradingView: палітра, свій колір і прозорість.

   «Свій колір» — власний квадрат відтінку, а не системний <input
   type="color">: той відкривав сіре вікно Chrome, яке не схоже ні на
   застосунок, ні на TV, і по-різному виглядає в кожному браузері.
   Останні свої кольори памʼятаємо — як рядок «недавніх» у TV.
================================================================== */

const PALETTE = [
  ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f7525f', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292'],
  ['#b22833', '#f57c00', '#fbc02d', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b'],
  ['#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f'],
];

const CHECKER = 'repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 50% / 8px 8px';
const RECENT_KEY = 'edge_chart_recent_colors';

const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 10) : []; } catch { return []; } };
const pushRecent = (hex) => {
  try {
    const next = [hex, ...readRecent().filter((x) => x !== hex)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* приватний режим */ }
};

/* ---- HSV ↔ RGB ---- */
function rgbToHsv({ r, g, b }) {
  const R = r / 255; const G = g / 255; const B = b / 255;
  const max = Math.max(R, G, B); const min = Math.min(R, G, B); const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
function hsvToRgb({ h, s, v }) {
  const c = v * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/* Тягнути повзунок мишкою чи пальцем — однаково. */
function useDrag(onPos) {
  return (e) => {
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const at = (ev) => {
      const r = el.getBoundingClientRect();
      onPos(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const move = (ev) => at(ev);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
}

function Custom({ color, onPick }) {
  const [hsv, setHsv] = useState(() => rgbToHsv(color));
  const [hex, setHex] = useState(toHex(color).toUpperCase());
  const lastHex = useRef(toHex(color));

  /* Зовнішня зміна (клік по палітрі) — оновлюємо квадрат. */
  useEffect(() => {
    const h = toHex(color);
    if (h !== lastHex.current) { setHsv(rgbToHsv(color)); setHex(h.toUpperCase()); lastHex.current = h; }
  }, [color]);

  const emit = (next) => {
    setHsv(next);
    const rgb = hsvToRgb(next);
    const h = toHex(rgb);
    lastHex.current = h;
    setHex(h.toUpperCase());
    onPick(h);
  };

  const sv = useDrag((x, y) => emit({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => emit({ ...hsv, h: Math.min(359.9, x * 360) }));
  const pure = toHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  const eyedrop = async () => {
    try {
      // eslint-disable-next-line no-undef
      const r = await new EyeDropper().open();
      if (r?.sRGBHex) { const c = parseColor(r.sRGBHex); setHsv(rgbToHsv(c)); setHex(toHex(c).toUpperCase()); lastHex.current = toHex(c); onPick(toHex(c)); }
    } catch { /* скасовано або не підтримується */ }
  };

  return (
    <div className="mt-2 space-y-2.5">
      <div
        onPointerDown={sv}
        className="relative h-[128px] w-full cursor-crosshair touch-none rounded-lg"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
      >
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }}
        />
      </div>
      <div
        onPointerDown={hue}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full"
        style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
      >
        <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${(hsv.h / 360) * 100}%`, background: pure, boxShadow: '0 0 0 1px rgba(0,0,0,.4)' }} />
      </div>
      <div className="flex items-center gap-2">
        {typeof window !== 'undefined' && 'EyeDropper' in window && (
          <button type="button" onClick={eyedrop} title={tx('Піпетка', 'Eyedropper')} aria-label={tx('Піпетка', 'Eyedropper')} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/10" style={{ color: T.text2 }}>
            <Pipette size={15} />
          </button>
        )}
        <span className="text-[12px]" style={{ color: T.text3 }}>HEX</span>
        <input
          value={hex}
          onChange={(e) => {
            const v = e.target.value.toUpperCase();
            setHex(v);
            if (/^#?[0-9A-F]{6}$/.test(v)) { const c = parseColor(v.startsWith('#') ? v : `#${v}`); setHsv(rgbToHsv(c)); lastHex.current = toHex(c); onPick(toHex(c)); }
          }}
          maxLength={7}
          className="h-8 min-w-0 flex-1 rounded-lg px-2.5 text-[12.5px] tabular-nums outline-none"
          style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono }}
        />
      </div>
    </div>
  );
}

export function Swatch({ value, size = 28 }) {
  return (
    <span className="relative block overflow-hidden rounded-md" style={{ width: size, height: size, background: CHECKER, border: `1px solid ${T.lineHi}` }}>
      <span className="absolute inset-0" style={{ background: value }} />
    </span>
  );
}

export default function ColorPicker({ value, onChange, label, disabled }) {
  const pop = usePopover();
  const [custom, setCustom] = useState(false);
  const [recent, setRecent] = useState(readRecent);
  const c = parseColor(value);

  useEffect(() => { if (pop.open) setRecent(readRecent()); else setCustom(false); }, [pop.open]);

  const pick = (hex, remember) => {
    onChange(toCss({ ...parseColor(hex), a: c.a }));
    if (remember) pushRecent(hex);
  };

  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        onClick={() => { if (!disabled) pop.toggle(); }}
        aria-label={label}
        title={label}
        aria-expanded={pop.open}
        className="shrink-0 rounded-md outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-[#2962ff]"
        style={{ opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer', boxShadow: pop.open ? '0 0 0 2px #2962ff' : 'none' }}
      >
        <Swatch value={value} />
      </button>
      <PopPanel pop={pop} width={256} className="!p-3">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(10, 1fr)' }}>
          {PALETTE.flat().map((hex) => {
            const on = toHex(c) === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => pick(hex, false)}
                className="aspect-square rounded-[4px] transition-transform hover:scale-110"
                style={{ background: hex, outline: on ? '2px solid #2962ff' : 'none', outlineOffset: 1 }}
                aria-label={hex}
                title={hex.toUpperCase()}
              />
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center gap-[3px]">
          <button
            type="button"
            onClick={() => setCustom((v) => !v)}
            title={tx('Свій колір', 'Custom color')}
            aria-label={tx('Свій колір', 'Custom color')}
            aria-pressed={custom}
            className="grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[4px] transition-colors"
            style={{ border: `1px dashed ${custom ? '#2962ff' : T.lineHi}`, color: custom ? '#5b8cff' : T.text2 }}
          >
            <Plus size={12} />
          </button>
          {recent.map((hex) => (
            <button key={hex} type="button" onClick={() => pick(hex, false)} className="h-[21px] w-[21px] shrink-0 rounded-[4px] transition-transform hover:scale-110" style={{ background: hex, outline: toHex(c) === hex ? '2px solid #2962ff' : 'none', outlineOffset: 1 }} aria-label={hex} title={hex.toUpperCase()} />
          ))}
        </div>
        {custom && <Custom color={c} onPick={(hex) => { pick(hex, false); }} />}
        {custom && (
          <button type="button" onClick={() => { pushRecent(toHex(c)); setRecent(readRecent()); setCustom(false); }} className="mt-2 w-full rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-white/10" style={{ color: '#5b8cff' }}>
            {tx('Додати до своїх', 'Add to custom')}
          </button>
        )}
        <div className="mt-3">
          <div className="flex justify-between text-[11.5px]" style={{ color: T.text3 }}>
            <span>{tx('Непрозорість', 'Opacity')}</span>
            <span style={{ fontFamily: T.mono }}>{Math.round(c.a * 100)}%</span>
          </div>
          <div className="relative mt-1.5 h-3 rounded-full" style={{ background: CHECKER }}>
            <div className="absolute inset-0 rounded-full" style={{ background: `linear-gradient(to right, transparent, ${toHex(c)})` }} />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(c.a * 100)}
              onChange={(e) => onChange(toCss({ ...c, a: Number(e.target.value) / 100 }))}
              className="edge-alpha absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent"
              aria-label={tx('Непрозорість', 'Opacity')}
            />
          </div>
          <style>{'.edge-alpha::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #2962ff;box-shadow:0 1px 3px rgba(0,0,0,.4)}.edge-alpha::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #2962ff}'}</style>
        </div>
      </PopPanel>
    </>
  );
}
