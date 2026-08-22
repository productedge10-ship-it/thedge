import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Heading1, Heading2, Heading3, Type, List, ListOrdered, ListChecks,
  ChevronRight, Info, Quote, Image as ImageIcon, Table, Minus,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { BLOCK_TYPES } from '../../lib/systemDoc';

/* ==================================================================
   Меню блоків.
   Відкривається по «/» прямо в тексті або кнопкою «+» на полях.
   Керується стрілками й Enter — руки не відриваються від клавіатури.
================================================================== */

const ICONS = {
  h1: Heading1, h2: Heading2, h3: Heading3, text: Type,
  bullet: List, number: ListOrdered, todo: ListChecks, toggle: ChevronRight,
  callout: Info, quote: Quote, image: ImageIcon, table: Table, divider: Minus,
};

const ORDER = ['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'callout', 'quote', 'image', 'table', 'divider'];

export default function SlashMenu({ query = '', onPick, onClose, style }) {
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = ORDER.map((key) => ({ key, ...BLOCK_TYPES[key] }));
    if (!q) return all;
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.key.includes(q));
  }, [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
      if (e.key === 'Enter') { e.preventDefault(); if (items[active]) onPick(items[active].key); }
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [items, active, onPick, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-on="1"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!items.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.985 }}
      transition={{ duration: 0.15, ease: EASE }}
      className="z-[400] w-[288px] overflow-hidden rounded-2xl"
      style={{
        background: T.surface,
        border: `1px solid ${T.lineHi}`,
        boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
        ...style,
      }}
    >
      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${T.line}` }}>
        <span className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ fontFamily: T.sans, color: T.text4 }}>
          {query ? `пошук: ${query}` : 'блоки'}
        </span>
      </div>

      <div ref={listRef} className="max-h-[320px] overflow-y-auto p-1.5">
        {items.map((it, i) => {
          const Icon = ICONS[it.key] || Type;
          const on = i === active;
          return (
            <button
              key={it.key}
              data-on={on ? '1' : '0'}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(it.key)}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-150"
              style={{ background: on ? `rgba(${T.accRgb},0.10)` : 'transparent' }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={{ background: T.sunken, border: `1px solid ${on ? T.lineAcc : T.line}`, color: on ? T.acc : T.text3 }}
              >
                <Icon size={15} strokeWidth={2.2} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: on ? T.text : T.text2 }}>
                  {it.label}
                </span>
                <span className="block truncate text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {it.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
