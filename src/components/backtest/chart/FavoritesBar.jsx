import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { itemName } from '../../../lib/candles/drawings';
import DrawIcon from './DrawingIcons';

/* ==================================================================
   Панель обраних інструментів — як у TradingView: плаває над
   графіком, тягнеш за «ручку» зліва куди зручно, місце памʼятається.
   Інструменти додаються зірочкою в лівому меню.
================================================================== */

export default function FavoritesBar({ favs, tool, pos, host, onPick, onMove, onClose }) {
  const ref = useRef(null);
  const [at, setAt] = useState(pos || { x: 64, y: 56 });
  const [vertical, setVertical] = useState(!!pos?.v);
  useEffect(() => { if (pos) { setAt({ x: pos.x, y: pos.y }); setVertical(!!pos.v); } }, [pos?.x, pos?.y, pos?.v]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Не даємо панелі вилізти за межі графіка (наприклад, після
     зміни розміру вікна). */
  const clamp = (x, y) => {
    const box = host.current?.getBoundingClientRect();
    const me = ref.current?.getBoundingClientRect();
    if (!box || !me) return { x, y };
    return { x: Math.max(0, Math.min(box.width - me.width, x)), y: Math.max(0, Math.min(box.height - me.height, y)) };
  };

  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const sx = e.clientX; const sy = e.clientY;
    const start = { ...at };
    let last = start;
    const move = (ev) => { last = clamp(start.x + ev.clientX - sx, start.y + ev.clientY - sy); setAt(last); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onMove({ ...last, v: vertical });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  /* Графік став вужчим (другий таймфрейм, панель угоди) — панель не
     має лишитись за його краєм. */
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setAt((p) => clamp(p.x, p.y)));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = () => { const v = !vertical; setVertical(v); onMove({ ...at, v }); };

  const [tip, setTip] = useState(null);

  return (
    <div
      ref={ref}
      className={`group/fav absolute z-[8] flex items-center gap-1 rounded-2xl p-1.5 ${vertical ? 'flex-col' : 'flex-row'}`}
      style={{
        left: at.x,
        top: at.y,
        background: 'linear-gradient(180deg, rgba(38,40,48,0.92), rgba(24,25,31,0.92))',
        border: '1px solid rgba(255,255,255,0.09)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={tx('Тягни, щоб перемістити. Подвійний клік — повернути панель', 'Drag to move. Double-click to rotate')}
        aria-label={tx('Перемістити панель', 'Move toolbar')}
        onPointerDown={startDrag}
        onDoubleClick={flip}
        className={`grid cursor-grab place-items-center rounded-lg opacity-50 transition-opacity hover:opacity-100 active:cursor-grabbing ${vertical ? 'h-4 w-9' : 'h-9 w-4'}`}
        style={{ color: '#c9ccd6', touchAction: 'none' }}
      >
        <svg width={vertical ? 14 : 6} height={vertical ? 6 : 14} viewBox={vertical ? '0 0 14 6' : '0 0 6 14'} aria-hidden>
          {(vertical ? [[2, 1.5], [7, 1.5], [12, 1.5], [2, 4.5], [7, 4.5], [12, 4.5]] : [[1.5, 2], [4.5, 2], [1.5, 7], [4.5, 7], [1.5, 12], [4.5, 12]]).map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />)}
        </svg>
      </button>
      <span className={vertical ? 'h-px w-6' : 'h-6 w-px'} style={{ background: 'rgba(255,255,255,0.08)' }} />
      {favs.length === 0 && (
        <span className="px-2 text-[12px]" style={{ color: T.text3 }}>{tx('Зірочка в лівому меню додає інструмент сюди', 'Star a tool in the left menu')}</span>
      )}
      {favs.map((id) => {
        const on = tool === id;
        return (
          <div key={id} className="relative">
            <button
              type="button"
              aria-label={itemName(id)}
              aria-pressed={on || undefined}
              onClick={() => onPick(on ? null : id)}
              onMouseEnter={() => setTip(id)}
              onMouseLeave={() => setTip(null)}
              className="grid h-9 w-9 place-items-center rounded-xl transition-all duration-150 active:scale-95"
              style={{
                color: on ? '#fff' : '#c9ccd6',
                background: on ? 'linear-gradient(180deg, #3d6bff, #2453e6)' : tip === id ? 'rgba(255,255,255,0.08)' : 'transparent',
                boxShadow: on ? '0 4px 14px rgba(41,98,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)' : 'none',
              }}
            >
              <DrawIcon id={id} size={24} />
            </button>
            {tip === id && (
              <span
                className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-semibold ${vertical ? 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2' : 'left-1/2 top-[calc(100%+8px)] -translate-x-1/2'}`}
                style={{ background: '#0f1014', color: '#e8eaf0', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 6px 16px rgba(0,0,0,0.4)' }}
              >
                {itemName(id)}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        title={tx('Сховати панель обраних', 'Hide favorites')}
        aria-label={tx('Сховати панель обраних', 'Hide favorites')}
        onClick={onClose}
        className="grid h-6 w-6 place-items-center rounded-md opacity-0 transition-opacity hover:!opacity-100 group-hover/fav:opacity-50"
        style={{ color: '#c9ccd6' }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
