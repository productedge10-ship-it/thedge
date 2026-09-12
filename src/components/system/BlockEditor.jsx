import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import TextareaAutosize from 'react-textarea-autosize';
import { Trash2, ChevronRight } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { emptyBlock, uid } from '../../lib/systemDoc';
import SlashMenu from './SlashMenu';
import ImageBlock from './blocks/ImageBlock';
import TableBlock from './blocks/TableBlock';

/* ==================================================================
   Блоковий редактор (макет «System Section v2»).
   Enter — новий блок, Backspace на порожньому — прибрати й піти
   вгору, «/» — меню типів. Ліворуч у 40-піксельному жолобі при
   наведенні зʼявляється ручка перетягування; текст читається як
   документ, з високим контрастом.
================================================================== */

/* Тон виноски: акцент — фіолетовий застосунку, решта — семантика. */
const TONES = {
  acc:  { rgb: T.accRgb,  glyph: 'i' },
  ok:   { rgb: T.okRgb,   glyph: '✓' },
  warn: { rgb: T.warnRgb, glyph: '!' },
  bad:  { rgb: T.badRgb,  glyph: '✕' },
};

/* Вертикальний ритм між блоками. */
const GAP = {
  h1: { mt: 52, mb: 26 },
  h2: { mt: 40, mb: 18 },
  h3: { mt: 34, mb: 16 },
  text: { mt: 0, mb: 30 },
  bullet: { mt: 0, mb: 14 },
  number: { mt: 0, mb: 10 },
  todo: { mt: 0, mb: 6 },
  quote: { mt: 8, mb: 42 },
  callout: { mt: 0, mb: 12 },
  toggle: { mt: 0, mb: 30 },
  image: { mt: 8, mb: 42 },
  divider: { mt: 20, mb: 34 },
};

const PLACEHOLDER = {
  h1: 'Заголовок', h2: 'Підзаголовок', h3: 'Дрібний заголовок',
  text: 'Пиши тут або тисни «/» для блоків',
  bullet: 'Пункт списку', number: 'Пункт списку', todo: 'Що перевірити',
  toggle: 'Заголовок згортання', callout: 'Правило або попередження', quote: 'Цитата',
};

/* ---------- один блок ---------- */
function Block({
  block, index, headIndex, total, onChange, onEnter, onBackspace, onDelete, onType,
  focusId, setFocusId, onFullscreen, depth = 0, tint = T.accRgb, compact = false,
}) {
  const controls = useDragControls();
  const [slash, setSlash] = useState(null);
  const [menuPos, setMenuPos] = useState(null);
  const ref = useRef(null);
  const rowRef = useRef(null);

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

  const pickType = (type) => { setSlash(null); onType(type); };

  /* Спільне поле для всіх текстових типів. */
  const field = (extraStyle = {}, placeholder) => (
    <TextareaAutosize
      ref={ref}
      value={block.text || ''}
      onChange={(e) => change(e.target.value)}
      onKeyDown={keyDown}
      onFocus={() => setFocusId(block.id)}
      placeholder={placeholder ?? PLACEHOLDER[block.type] ?? ''}
      spellCheck={false}
      className="w-full resize-none border-none bg-transparent outline-none placeholder:opacity-30"
      style={{
        fontFamily: T.sans,
        fontSize: 17,
        fontWeight: 400,
        lineHeight: 1.78,
        color: T.text,
        ...extraStyle,
      }}
    />
  );

  const body = () => {
    /* ── Заголовки ── */
    if (block.type === 'h1') {
      return (
        <div id={`h-${block.id}`} style={{ scrollMarginTop: 100 }}>
          <div className="text-[10.5px]" style={{ fontFamily: T.mono, letterSpacing: '0.24em', color: `rgb(${tint})` }}>
            {String(headIndex || 1).padStart(2, '0')}
          </div>
          {field({
            marginTop: 12, fontFamily: T.display, fontSize: 36, fontWeight: 900,
            letterSpacing: '-0.032em', lineHeight: 1.1, color: T.text,
          })}
          <div className="mt-[22px] h-px w-full" style={{ background: T.line }} />
        </div>
      );
    }
    if (block.type === 'h2') {
      return (
        <div id={`h-${block.id}`} style={{ scrollMarginTop: 100 }}>
          {field({
            fontFamily: T.display, fontSize: 22, fontWeight: 700,
            letterSpacing: '-0.022em', lineHeight: 1.3, color: T.text,
          })}
        </div>
      );
    }
    if (block.type === 'h3') {
      return field({
        fontFamily: T.mono, fontSize: 11, fontWeight: 500,
        letterSpacing: '0.22em', textTransform: 'uppercase', lineHeight: 1.5, color: T.text2,
      });
    }

    switch (block.type) {
      case 'divider':
        return (
          <div className="flex items-center gap-3.5">
            <span className="h-px flex-1" style={{ background: T.line }} />
            <span className="h-[3px] w-[3px] rounded-full" style={{ background: T.lineHi }} />
            <span className="h-px flex-1" style={{ background: T.line }} />
          </div>
        );

      case 'image':
        return <ImageBlock block={block} onChange={onChange} onFullscreen={onFullscreen} />;

      case 'table':
        return <TableBlock block={block} onChange={onChange} tint={tint} />;

      case 'todo':
        return (
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => onChange({ checked: !block.checked })}
              className="grid h-[19px] w-[19px] shrink-0 place-items-center rounded-md text-[10px] font-bold transition-colors duration-150"
              style={{
                background: block.checked ? `rgb(${tint})` : 'transparent',
                border: `1px solid ${block.checked ? `rgb(${tint})` : T.lineHi}`,
                color: block.checked ? 'var(--edge-on-acc, #0A0A0C)' : 'transparent',
              }}
            >
              ✓
            </button>
            {field({
              fontSize: 16, lineHeight: 1.5,
              color: block.checked ? T.text4 : T.text,
              textDecoration: block.checked ? 'line-through' : 'none',
            })}
          </div>
        );

      case 'bullet':
        return (
          <div className="flex items-start gap-4">
            <span className="mt-[14px] h-px w-4 shrink-0" style={{ background: `rgb(${tint})`, opacity: 0.8 }} />
            {field({ fontSize: 16.5, lineHeight: 1.7, color: T.text })}
          </div>
        );

      case 'number':
        return (
          <div className="flex items-start gap-[18px]">
            <span
              className="mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]"
              style={{ fontFamily: T.mono, border: `1px solid rgba(${tint},0.35)`, color: `rgb(${tint})` }}
            >
              {index + 1}
            </span>
            {field({ fontSize: 16.5, lineHeight: 1.7, color: T.text })}
          </div>
        );

      case 'quote':
        return field({
          paddingLeft: 26,
          borderLeft: `1px solid rgb(${tint})`,
          fontSize: 23,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: '-0.02em',
          color: T.text,
        });

      case 'callout': {
        const tone = TONES[block.tone || 'acc'];
        return (
          <div
            className="flex items-start gap-[15px] rounded-[14px] px-5 py-[17px]"
            style={{
              border: `1px solid rgba(${tone.rgb},0.2)`,
              background: `linear-gradient(100deg, rgba(${tone.rgb},0.09), rgba(${tone.rgb},0.02))`,
            }}
          >
            <button
              onClick={() => {
                const order = ['acc', 'ok', 'warn', 'bad'];
                const next = order[(order.indexOf(block.tone || 'acc') + 1) % order.length];
                onChange({ tone: next });
              }}
              title="Змінити колір"
              className="mt-[1px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] text-[12px] leading-none"
              style={{ fontFamily: T.mono, background: `rgba(${tone.rgb},0.16)`, color: `rgb(${tone.rgb})` }}
            >
              {tone.glyph}
            </button>
            {field({ fontSize: 15.5, lineHeight: 1.6, color: T.text })}
          </div>
        );
      }

      case 'toggle':
        return (
          <div style={{ borderTop: `1px solid ${T.line}`, borderBottom: `1px solid ${T.line}` }}>
            <button
              onClick={() => onChange({ open: !block.open })}
              className="flex w-full items-center gap-3.5 py-[18px] text-left"
              style={{ color: T.text }}
            >
              <motion.span animate={{ rotate: block.open ? 90 : 0 }} transition={{ duration: 0.18, ease: EASE }} className="grid h-5 w-5 place-items-center" style={{ color: T.text3 }}>
                <ChevronRight size={15} strokeWidth={2.6} />
              </motion.span>
              <span className="min-w-0 flex-1">
                {field({ fontFamily: T.sans, fontSize: 16.5, fontWeight: 500, lineHeight: 1.4, letterSpacing: '-0.01em', color: T.text })}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {block.open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="pb-[22px] pl-[34px]">
                    <BlockEditor
                      blocks={block.children || []}
                      tint={tint}
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

  const gap = GAP[block.type] || GAP.text;

  return (
    <Reorder.Item
      ref={rowRef}
      value={block}
      dragListener={false}
      dragControls={controls}
      className="group/block relative"
      style={{ marginTop: gap.mt, marginBottom: gap.mb, paddingLeft: compact ? 0 : 40 }}
    >
      {/* жолоб з ручкою — з'являється при наведенні на блок */}
      {!compact && (
        <div className="absolute left-0 top-0 flex items-center gap-1 opacity-0 transition-opacity duration-150 no-print group-hover/block:opacity-100">
          <button
            onPointerDown={(e) => controls.start(e)}
            title="Перетягнути"
            className="grid h-6 w-6 cursor-grab place-items-center rounded-[7px] text-[11px] transition-colors duration-150 active:cursor-grabbing"
            style={{ background: 'rgba(var(--edge-text-rgb),0.04)', border: `1px solid ${T.line}`, color: T.text4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; }}
          >
            ⠿
          </button>
        </div>
      )}

      {/* видалити блок */}
      {total > 1 && !compact && (
        <button
          onClick={onDelete}
          title="Видалити блок"
          className="absolute -right-8 top-0 z-10 grid h-6 w-6 place-items-center rounded-[7px] opacity-0 transition-all duration-150 no-print group-hover/block:opacity-100"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={13} strokeWidth={2.2} />
        </button>
      )}

      {body()}

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
export default function BlockEditor({ blocks, onChange, onFullscreen, depth = 0, compact, tint = T.accRgb }) {
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
    <div className={compact ? '' : ''}>
      <Reorder.Group axis="y" values={blocks} onReorder={onChange} className="list-none">
        {blocks.map((block, i) => (
          <Block
            key={block.id}
            block={block}
            index={blocks.filter((b, x) => b.type === 'number' && x <= i).length - 1}
            headIndex={blocks.filter((b, x) => b.type === 'h1' && x <= i).length}
            total={blocks.length}
            depth={depth}
            tint={tint}
            compact={compact}
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
          className="mt-[10px] flex w-full items-center justify-center gap-2.5 rounded-[12px] py-4 text-[13.5px] transition-all duration-150 no-print"
          style={{ fontFamily: T.sans, fontWeight: 400, color: T.text4, border: `1px solid ${T.line}`, background: 'transparent', marginLeft: 40, width: 'calc(100% - 40px)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.4)`; e.currentTarget.style.background = `rgba(${T.accRgb},0.04)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; e.currentTarget.style.background = 'transparent'; }}
        >
          <span className="text-[15px] leading-none">+</span>
          Додати блок — або тисни «/» у тексті
        </button>
      )}
    </div>
  );
}

export { uid };
