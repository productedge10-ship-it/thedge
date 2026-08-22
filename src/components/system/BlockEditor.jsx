import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import {
  Plus, GripVertical, Trash2, ChevronRight, Check, Info, AlertTriangle,
  ShieldCheck, Lightbulb,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { emptyBlock, uid } from '../../lib/systemDoc';
import SlashMenu from './SlashMenu';
import ImageBlock from './blocks/ImageBlock';
import TableBlock from './blocks/TableBlock';

/* ==================================================================
   Блоковий редактор.
   Enter — новий блок, Backspace на порожньому — прибрати й піти
   вгору, «/» — меню типів. Зліва від блока при наведенні зʼявляються
   ручка перетягування і плюс; сам текст нічим не обведений, щоб
   сторінка читалась як документ, а не як форма.
================================================================== */

const TONES = {
  acc:  { color: T.acc,  rgb: T.accRgb,  icon: Info },
  ok:   { color: T.ok,   rgb: T.okRgb,   icon: ShieldCheck },
  warn: { color: T.warn, rgb: T.warnRgb, icon: Lightbulb },
  bad:  { color: T.bad,  rgb: T.badRgb,  icon: AlertTriangle },
};

const FONT = {
  h1: { fontSize: 30, fontWeight: 700, family: 'display', mt: 22, mb: 4, lh: 1.25 },
  h2: { fontSize: 23, fontWeight: 700, family: 'display', mt: 18, mb: 2, lh: 1.3 },
  h3: { fontSize: 18, fontWeight: 700, family: 'display', mt: 14, mb: 2, lh: 1.35 },
  text: { fontSize: 16, fontWeight: 400, family: 'sans', mt: 0, mb: 0, lh: 1.75 },
};

const PLACEHOLDER = {
  h1: 'Заголовок', h2: 'Підзаголовок', h3: 'Дрібний заголовок',
  text: 'Пиши тут або тисни «/» для блоків',
  bullet: 'Пункт списку', number: 'Пункт списку', todo: 'Що перевірити',
  toggle: 'Заголовок згортання', callout: 'Правило або попередження', quote: 'Цитата',
};

/* ---------- один блок ---------- */
function Block({
  block, index, total, onChange, onEnter, onBackspace, onDelete, onType,
  focusId, setFocusId, onFullscreen, depth = 0,
}) {
  const controls = useDragControls();
  const [slash, setSlash] = useState(null);      // рядок після «/»
  const [menuPos, setMenuPos] = useState(null);  // координати меню в порталі
  const ref = useRef(null);
  const rowRef = useRef(null);

  /* Меню малюємо в body: усередині блока його ховали сусідні блоки
     й контейнери з overflow. */
  useLayoutEffect(() => {
    if (slash === null) { setMenuPos(null); return; }
    const place = () => {
      const r = rowRef.current?.getBoundingClientRect();
      if (!r) return;
      const H = 360;
      const top = r.bottom + 6 + H > window.innerHeight - 8
        ? Math.max(8, r.top - H - 6)
        : r.bottom + 6;
      setMenuPos({ top, left: Math.min(r.left, window.innerWidth - 300) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [slash]);

  useEffect(() => {
    if (focusId === block.id && ref.current) {
      ref.current.focus();
      const len = ref.current.value?.length ?? 0;
      ref.current.setSelectionRange?.(len, len);
    }
  }, [focusId, block.id]);

  const f = FONT[block.type] || FONT.text;
  const isHeading = ['h1', 'h2', 'h3'].includes(block.type);

  const keyDown = (e) => {
    if (slash !== null && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const carry = ['bullet', 'number', 'todo'].includes(block.type) ? block.type : 'text';
      onEnter(carry);
    }
    if (e.key === 'Backspace' && !block.text) {
      e.preventDefault();
      onBackspace();
    }
    if (e.key === '/' && !block.text) setSlash('');
  };

  const change = (v) => {
    if (slash !== null) {
      if (!v.startsWith('/')) setSlash(null);
      else setSlash(v.slice(1));
    }
    onChange({ text: v });
  };

  const pickType = (type) => {
    setSlash(null);
    onType(type);
  };

  /* текстове поле, спільне для всіх текстових типів */
  const field = (extraStyle = {}, placeholder) => (
    <TextareaAutosize
      ref={ref}
      value={block.text || ''}
      onChange={(e) => change(e.target.value)}
      onKeyDown={keyDown}
      onFocus={() => setFocusId(block.id)}
      placeholder={placeholder ?? PLACEHOLDER[block.type] ?? ''}
      spellCheck={false}
      className="w-full resize-none border-none bg-transparent outline-none placeholder:opacity-40"
      style={{
        fontFamily: f.family === 'display' ? T.display : T.sans,
        fontSize: f.fontSize,
        fontWeight: f.fontWeight,
        lineHeight: f.lh,
        color: T.text,
        letterSpacing: isHeading ? '-0.02em' : '0',
        ...extraStyle,
      }}
    />
  );

  const body = () => {
    switch (block.type) {
      case 'divider':
        return <div className="my-3 h-px w-full" style={{ background: T.line }} />;

      case 'image':
        return <ImageBlock block={block} onChange={onChange} onFullscreen={onFullscreen} />;

      case 'table':
        return <TableBlock block={block} onChange={onChange} />;

      case 'todo':
        return (
          <div className="flex items-start gap-2.5">
            <button
              onClick={() => onChange({ checked: !block.checked })}
              className="mt-[5px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md transition-colors duration-200"
              style={{
                background: block.checked ? T.ok : 'transparent',
                border: `1.5px solid ${block.checked ? T.ok : T.lineHi}`,
              }}
            >
              {block.checked && <Check size={11} strokeWidth={3.6} style={{ color: 'var(--edge-bg, #0A0A0C)' }} />}
            </button>
            {field({
              color: block.checked ? T.text4 : T.text,
              textDecoration: block.checked ? 'line-through' : 'none',
              textDecorationColor: `rgba(${T.okRgb},0.5)`,
            })}
          </div>
        );

      case 'bullet':
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: T.text3 }} />
            {field()}
          </div>
        );

      case 'number':
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-[2px] shrink-0 text-[15px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>
              {index + 1}.
            </span>
            {field()}
          </div>
        );

      case 'quote':
        return (
          <div className="flex items-stretch gap-3.5">
            <span className="w-[3px] shrink-0 rounded-full" style={{ background: T.lineHi }} />
            {field({ fontStyle: 'italic', color: T.text2 })}
          </div>
        );

      case 'callout': {
        const tone = TONES[block.tone || 'acc'];
        const Icon = tone.icon;
        return (
          <div
            className="flex items-start gap-3 rounded-2xl px-4 py-3.5"
            style={{ background: `rgba(${tone.rgb},0.06)`, border: `1px solid rgba(${tone.rgb},0.22)` }}
          >
            <button
              onClick={() => {
                const order = ['acc', 'ok', 'warn', 'bad'];
                const next = order[(order.indexOf(block.tone || 'acc') + 1) % order.length];
                onChange({ tone: next });
              }}
              title="Змінити колір"
              className="mt-[3px] shrink-0"
            >
              <Icon size={16} strokeWidth={2.3} style={{ color: tone.color }} />
            </button>
            {field({ fontSize: 15, color: T.text2 })}
          </div>
        );
      }

      case 'toggle':
        return (
          <div>
            <div className="flex items-start gap-2">
              <button
                onClick={() => onChange({ open: !block.open })}
                className="mt-[5px] grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors duration-200"
                style={{ color: T.text3 }}
              >
                <motion.span animate={{ rotate: block.open ? 90 : 0 }} transition={{ duration: 0.18, ease: EASE }} className="flex">
                  <ChevronRight size={15} strokeWidth={2.6} />
                </motion.span>
              </button>
              {field({ fontWeight: 600 })}
            </div>

            <AnimatePresence initial={false}>
              {block.open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="ml-[27px] mt-1 border-l pl-4" style={{ borderColor: T.line }}>
                    <BlockEditor
                      blocks={block.children || []}
                      onChange={(children) => onChange({ children })}
                      onFullscreen={onFullscreen}
                      depth={depth + 1}
                      compact
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );

      default:
        return field();
    }
  };

  return (
    <Reorder.Item
      ref={rowRef}
      value={block}
      dragListener={false}
      dragControls={controls}
      className="group/block relative"
      style={{ marginTop: f.mt, marginBottom: f.mb }}
    >
      {/* ручки зліва */}
      <div className="absolute -left-[30px] top-1 z-10 flex items-center gap-0.5 opacity-60 transition-opacity duration-200 no-print xl:-left-[52px] xl:opacity-0 xl:group-hover/block:opacity-100">
        <button
          onClick={() => onEnter('text')}
          title="Додати блок нижче"
          className="hidden h-6 w-6 place-items-center rounded-md transition-colors duration-200 xl:grid"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <Plus size={14} strokeWidth={2.6} />
        </button>
        <button
          onPointerDown={(e) => controls.start(e)}
          title="Перетягнути"
          className="grid h-6 w-6 cursor-grab place-items-center rounded-md transition-colors duration-200 active:cursor-grabbing"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <GripVertical size={14} strokeWidth={2.2} />
        </button>
      </div>

      {/* кошик справа */}
      {total > 1 && (
        <button
          onClick={onDelete}
          title="Видалити блок"
          className="absolute -right-6 top-1 z-10 grid h-6 w-6 place-items-center rounded-md opacity-60 transition-all duration-200 no-print xl:-right-8 xl:opacity-0 xl:group-hover/block:opacity-100"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={13} strokeWidth={2.2} />
        </button>
      )}

      {body()}

      {/* меню блоків — у порталі, щоб нічим не перекривалось */}
      {slash !== null && menuPos && createPortal(
        <AnimatePresence>
          <SlashMenu
            query={slash}
            onPick={pickType}
            onClose={() => setSlash(null)}
            style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
          />
        </AnimatePresence>,
        document.body,
      )}
    </Reorder.Item>
  );
}

/* ---------- список блоків ---------- */
export default function BlockEditor({ blocks, onChange, onFullscreen, depth = 0, compact }) {
  const [focusId, setFocusId] = useState(null);

  const setBlock = (id, patch) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const insertAfter = (id, type = 'text') => {
    const i = blocks.findIndex((b) => b.id === id);
    const fresh = emptyBlock(type);
    const next = [...blocks];
    next.splice(i + 1, 0, fresh);
    onChange(next);
    setFocusId(fresh.id);
  };

  const removeBlock = (id) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (blocks.length <= 1) {
      onChange([emptyBlock('text')]);
      return;
    }
    onChange(blocks.filter((b) => b.id !== id));
    const prev = blocks[Math.max(0, i - 1)];
    if (prev) setFocusId(prev.id);
  };

  const changeType = (id, type) => {
    const i = blocks.findIndex((b) => b.id === id);
    const fresh = { ...emptyBlock(type), id: blocks[i].id };
    onChange(blocks.map((b) => (b.id === id ? fresh : b)));
    if (!['image', 'table', 'divider'].includes(type)) setFocusId(id);
  };

  const addAtEnd = () => {
    const fresh = emptyBlock('text');
    onChange([...blocks, fresh]);
    setFocusId(fresh.id);
  };

  return (
    <div className={compact ? '' : 'pb-24'}>
      <Reorder.Group axis="y" values={blocks} onReorder={onChange} className="list-none">
        {blocks.map((block, i) => (
          <Block
            key={block.id}
            block={block}
            index={blocks.filter((b, x) => b.type === 'number' && x <= i).length - 1}
            total={blocks.length}
            depth={depth}
            focusId={focusId}
            setFocusId={setFocusId}
            onFullscreen={onFullscreen}
            onChange={(patch) => setBlock(block.id, patch)}
            onEnter={(type) => insertAfter(block.id, type)}
            onBackspace={() => removeBlock(block.id)}
            onDelete={() => removeBlock(block.id)}
            onType={(type) => changeType(block.id, type)}
          />
        ))}
      </Reorder.Group>

      {!compact && (
        <button
          onClick={addAtEnd}
          className="mt-4 w-full rounded-xl py-3 text-left text-[14px] transition-colors duration-200 no-print"
          style={{ fontFamily: T.sans, color: T.text4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = T.text3)}
          onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
        >
          Клікни, щоб додати блок — або тисни «/» у тексті
        </button>
      )}
    </div>
  );
}

export { uid };
