import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { T } from '../../../lib/theme';

/* ==================================================================
   Спільний поповер для всіх випадайок графіка.

   Чому окремий: раніше кожне меню слухало кліки «повз себе» на
   window у звичайній фазі. А модалки й плаваюча панель гасять
   mousedown, щоб не закритись самим, — і сигнал «клікнули повз» до
   window просто не доходив. Виходило: відкрив колір, тиснеш товщину —
   колір висить поверх, а товщина ніби не перемикається.

   Тут слухаємо у фазі перехоплення (до будь-чиїх stopPropagation) і
   малюємо в body через портал, тож ні прокрутка модалки, ні її
   overflow не обрізають список.
================================================================== */

export function usePopover() {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (panel.current?.contains(e.target) || anchor.current?.contains(e.target)) return;
      setOpen(false);
    };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { open, setOpen, toggle, anchor, panel };
}

/* Панель біля якоря: під ним, а якщо не влазить — над ним. */
export function PopPanel({ pop, children, width, align = 'start', className = '', style }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!pop.open) { setPos(null); return undefined; }
    const place = () => {
      const a = pop.anchor.current?.getBoundingClientRect();
      const p = pop.panel.current;
      if (!a || !p) return;
      const w = p.offsetWidth; const h = p.offsetHeight;
      let x = align === 'end' ? a.right - w : align === 'center' ? a.left + a.width / 2 - w / 2 : a.left;
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      let y = a.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, a.top - h - 6);
      setPos({ x, y });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [pop.open, pop.anchor, pop.panel, align]);

  if (!pop.open) return null;
  return createPortal(
    <div
      ref={pop.panel}
      className={`fixed z-[300] rounded-xl p-1 ${className}`}
      style={{
        left: pos?.x ?? -9999, top: pos?.y ?? -9999, width,
        background: T.surface3, border: `1px solid ${T.lineHi}`,
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        animation: 'edgePop .14s cubic-bezier(.22,1,.36,1)',
        ...style,
      }}
    >
      <style>{'@keyframes edgePop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}'}</style>
      {children}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------
   Випадний список замість системного <select>: той самий вигляд, що
   й решта інтерфейсу, галочка біля вибраного, клавіші ↑ ↓ Enter Esc.
------------------------------------------------------------------ */
export function Select({ value, onChange, options, width = 180, render }) {
  const pop = usePopover();
  const [hi, setHi] = useState(-1);
  const idx = options.findIndex(([v]) => String(v) === String(value));
  const current = options[idx];

  useEffect(() => { if (pop.open) setHi(idx); }, [pop.open, idx]);

  const choose = (v) => { onChange(v); pop.setOpen(false); };

  const onKey = (e) => {
    if (!pop.open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pop.setOpen(true); return; }
    if (!pop.open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[hi]) choose(options[hi][0]); }
  };

  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        onClick={pop.toggle}
        onKeyDown={onKey}
        aria-haspopup="listbox"
        aria-expanded={pop.open}
        className="flex h-9 shrink-0 items-center justify-between gap-2 rounded-lg pl-3 pr-2 text-left text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2962ff]"
        style={{ width, background: T.sunken, border: `1px solid ${pop.open ? '#2962ff' : T.line}`, color: T.text }}
      >
        <span className="min-w-0 truncate">{current ? (render ? render(current[0], current[1]) : current[1]) : '—'}</span>
        <ChevronDown size={14} className="shrink-0 transition-transform duration-150" style={{ color: T.text3, transform: pop.open ? 'rotate(180deg)' : 'none' }} />
      </button>
      <PopPanel pop={pop} style={{ minWidth: width }}>
        <div role="listbox" className="max-h-[280px] overflow-y-auto">
          {options.map(([v, label], i) => {
            const on = String(v) === String(value);
            return (
              <button
                key={String(v)}
                type="button"
                role="option"
                aria-selected={on}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(v)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px]"
                style={{ background: i === hi ? 'rgba(255,255,255,0.07)' : 'transparent', color: on ? '#fff' : T.text }}
              >
                <span className="grid w-4 shrink-0 place-items-center">{on && <Check size={14} color="#5b8cff" strokeWidth={2.6} />}</span>
                <span className="min-w-0 flex-1 truncate">{render ? render(v, label) : label}</span>
              </button>
            );
          })}
        </div>
      </PopPanel>
    </>
  );
}
