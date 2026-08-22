import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, Plus, X, Check, Tag as TagIcon } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import {
  SEP, splitTag, tagLabel, tagColor, flattenTree,
  addCategory, addChild, removeTag,
} from '../../lib/noteTags';

/* ==================================================================
   Одна випадайка з пошуком — і для фільтра списку, і для вибору
   тегів у нотатці. Дерево дворівневе: категорія → підтег.
   Свої теги створюються прямо звідси, з вибором куди покласти.
================================================================== */

/* ---------- чип тега ---------- */
export function TagChip({ id, tree, onClick, onRemove, size = 'sm', showPath }) {
  const c = tagColor(id, tree);
  const [cat, sub] = splitTag(id);
  const big = size === 'lg';

  return (
    <span
      onClick={onClick}
      title={sub ? `${cat} · ${sub}` : cat}
      className={`inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors ${
        big ? 'px-2.5 py-1.5 text-[13px]' : 'px-2 py-1 text-[12.5px]'
      } ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        fontFamily: T.sans,
        color: c,
        background: `${c}14`,
        border: `1px solid ${c}2e`,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = `${c}22`; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.background = `${c}14`; }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
      {showPath && sub ? (
        <span>
          <span style={{ opacity: 0.65 }}>{cat} · </span>{sub}
        </span>
      ) : (
        tagLabel(id)
      )}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          className="ml-0.5 grid h-4 w-4 place-items-center rounded transition-opacity"
          style={{ color: c, opacity: 0.6 }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.6)}
        >
          <X size={11} strokeWidth={3} />
        </button>
      )}
    </span>
  );
}

/* ---------- рядок дерева ---------- */
function Row({ label, color, depth = 0, active, count, onClick, right, dot = true }) {
  return (
    <div
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors"
      style={{
        paddingLeft: 10 + depth * 16,
        background: active ? `rgba(${T.accRgb},0.12)` : 'transparent',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.045)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span
        className="min-w-0 flex-1 truncate text-[14px] font-medium"
        style={{ fontFamily: T.sans, color: active ? T.text : T.text2 }}
      >
        {label}
      </span>
      {count != null && (
        <span className="shrink-0 text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
          {count}
        </span>
      )}
      {right}
    </div>
  );
}

export default function TagPicker({
  tree,
  onTreeChange,
  selected,            // string | null — режим фільтра
  onSelect,
  value = [],          // string[] — режим вибору
  onChange,
  multi = false,
  counts = {},
  align = 'left',
  label = 'Теги',
  width = 300,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState({});
  const [creatingFor, setCreatingFor] = useState(false); // показати вибір «куди покласти»
  const box = useRef(null);
  const input = useRef(null);
  const panel = useRef(null);

  /* ---------- де малювати список ----------

     Раніше випадайка була absolute всередині кнопки — і це працювало
     рівно доти, доки кнопка стояла на сторінці. У модалці нотатки
     контейнер має overflow-hidden (без нього не буде заокруглених
     кутів у прокрутки), тож список обрізався по краю вікна: видно
     чотири категорії з семи, а підтеги не видно взагалі.

     Тому список іде в портал на body і позиціонується від кнопки в
     координатах вікна. Заразом розв'язується друга річ: усередині
     модалки він більше ні під ким не опиняється, бо z-index
     рахується від body, а не від шару, у якому лежить кнопка. */
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const el = box.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const gap = 8;
    const wanted = Math.min(width, vw - 24);

    /* Знизу місця має вистачати на щось осмислене, а не на два
       рядки. Не вистачає — розкриваємось угору. */
    const below = vh - r.bottom - gap - 12;
    const above = r.top - gap - 12;
    const up = below < 260 && above > below;

    const maxH = Math.max(200, Math.min(440, up ? above : below));

    let left = align === 'right' ? r.right - wanted : r.left;
    left = Math.max(12, Math.min(left, vw - wanted - 12));

    setPos({
      left,
      top: up ? undefined : r.bottom + gap,
      bottom: up ? vh - r.top + gap : undefined,
      width: wanted,
      maxH,
      up,
    });
  }, [align, width]);

  /* Відкриття й закриття — одним місцем, а не набором setState по
     всьому файлу: разом з видимістю треба щоразу скинути пошук і
     недобудований тег, і забути про це в одній з п'яти точок було
     питанням часу.

     Позиція рахується тут же, у момент кліку, а не в ефекті після
     нього: інакше список встигав промалюватись у лівому верхньому
     куті вікна й лише потім стрибав на місце. */
  const openDrop = useCallback(() => { place(); setOpen(true); }, [place]);

  const closeDrop = useCallback(() => {
    setOpen(false);
    setQ('');
    setCreatingFor(false);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const t = setTimeout(() => input.current?.focus(), 40);

    /* Сторінка під випадайкою може їхати: прокрутка сторінки,
       прокрутка тіла модалки, зміна розміру вікна. Слухаємо
       прокрутку в фазі захоплення — так ловимо будь-який
       контейнер, а не тільки вікно. */
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    /* Клік поза списком закриває — але сам список тепер лежить у
       порталі, тобто поза кнопкою. Перевіряти треба обидва. */
    const onDown = (e) => {
      if (box.current?.contains(e.target)) return;
      if (panel.current?.contains(e.target)) return;
      closeDrop();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDrop(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, closeDrop]);

  const flat = useMemo(() => flattenTree(tree), [tree]);
  const query = q.trim().toLowerCase();

  /* пошук — плоский результат; без пошуку — дерево, що розгортається */
  const searchHits = useMemo(() => {
    if (!query) return null;
    return flat.filter((t) =>
      t.name.toLowerCase().includes(query) || t.cat.toLowerCase().includes(query));
  }, [flat, query]);

  const exactExists = !!query && flat.some((t) => t.name.toLowerCase() === query || t.id.toLowerCase() === query);

  const isOn = (id) => (multi ? value.includes(id) : selected === id);

  const pick = (id) => {
    if (multi) {
      onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
      setQ('');
      input.current?.focus();
    } else {
      onSelect(selected === id ? null : id);
      closeDrop();
    }
  };

  /* створення власного тега */
  const createIn = (catName) => {
    const raw = q.trim();
    if (!raw) return;

    /* «Price Action/FVG» — можна вписати одразу шлях */
    if (raw.includes(SEP)) {
      const [c, s] = splitTag(raw);
      let next = tree.some((x) => x.name.toLowerCase() === c.trim().toLowerCase()) ? tree : addCategory(tree, c.trim());
      const realCat = next.find((x) => x.name.toLowerCase() === c.trim().toLowerCase())?.name || c.trim();
      next = addChild(next, realCat, s.trim());
      onTreeChange(next);
      if (multi && s.trim()) onChange([...new Set([...value, `${realCat}${SEP}${s.trim()}`])]);
      setQ(''); setCreatingFor(false);
      return;
    }

    if (catName) {
      const next = addChild(tree, catName, raw);
      onTreeChange(next);
      const id = `${catName}${SEP}${raw}`;
      if (multi) onChange([...new Set([...value, id])]);
      else onSelect(id);
      setExpanded((p) => ({ ...p, [catName]: true }));
    } else {
      const next = addCategory(tree, raw);
      onTreeChange(next);
      if (multi) onChange([...new Set([...value, raw])]);
      else onSelect(raw);
    }
    setQ(''); setCreatingFor(false);
    if (!multi) closeDrop();
  };

  const drop = pos && (
    <motion.div
      ref={panel}
      initial={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: pos.up ? 6 : -6, scale: 0.985 }}
      transition={{ duration: 0.16, ease: EASE }}
      className="fixed z-[500] flex flex-col overflow-hidden rounded-2xl"
      style={{
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        width: pos.width,
        maxHeight: pos.maxH,
        /* Непрозорий фон панелі, а не T.surface: список лежить над
           модалкою, і крізь напівпрозору поверхню читався б текст
           під ним. */
        background: 'var(--edge-panel, #131316)',
        border: `1px solid ${T.lineHi}`,
        boxShadow: 'var(--edge-panel-shadow, 0 28px 64px -20px rgba(0,0,0,0.9))',
      }}
    >
      {/* пошук */}
      <div className="flex shrink-0 items-center gap-2.5 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Search size={15} strokeWidth={2.2} style={{ color: T.text4 }} />
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCreatingFor(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (searchHits?.length) pick(searchHits[0].id);
              else if (q.trim()) setCreatingFor(true);
            }
          }}
          placeholder="Шукати або створити тег…"
          className="w-full bg-transparent text-[14px] outline-none"
          style={{ fontFamily: T.sans, color: T.text }}
        />
        {q && (
          <button onClick={() => setQ('')} style={{ color: T.text4 }}>
            <X size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
        {/* «усі теги» — тільки у фільтрі */}
        {!multi && !query && (
          <Row
            label="Усі теги"
            dot={false}
            active={!selected}
            onClick={() => { onSelect(null); closeDrop(); }}
          />
        )}

        {searchHits ? (
          searchHits.length ? (
            searchHits.map((t) => (
              <Row
                key={t.id}
                label={t.sub ? `${t.cat} · ${t.sub}` : t.cat}
                color={t.color}
                active={isOn(t.id)}
                count={counts[t.id]}
                onClick={() => pick(t.id)}
                right={isOn(t.id) ? <Check size={14} strokeWidth={3} style={{ color: T.acc }} /> : null}
              />
            ))
          ) : (
            <p className="px-3 py-3 text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
              Нічого не знайшлось — можна створити свій.
            </p>
          )
        ) : (
          tree.map((c) => {
            const isExp = expanded[c.name];
            const kids = c.children || [];
            return (
              <div key={c.name}>
                <Row
                  label={c.name}
                  color={c.color}
                  active={isOn(c.name)}
                  count={counts[c.name]}
                  onClick={() => pick(c.name)}
                  right={
                    <span className="flex shrink-0 items-center gap-0.5">
                      {isOn(c.name) && <Check size={14} strokeWidth={3} style={{ color: T.acc }} />}
                      <button
                        title="Видалити категорію зі списку"
                        onClick={(e) => { e.stopPropagation(); onTreeChange(removeTag(tree, c.name)); }}
                        className="grid h-6 w-6 place-items-center rounded-md opacity-0 transition-all group-hover:opacity-100"
                        style={{ color: T.text4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                      >
                        <X size={12} strokeWidth={2.8} />
                      </button>
                      {kids.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpanded((p) => ({ ...p, [c.name]: !p[c.name] })); }}
                          className="grid h-6 w-6 place-items-center rounded-md"
                          style={{ color: T.text3 }}
                        >
                          <motion.span animate={{ rotate: isExp ? 90 : 0 }} transition={{ duration: 0.18, ease: EASE }} className="flex">
                            <ChevronRight size={14} strokeWidth={2.5} />
                          </motion.span>
                        </button>
                      )}
                    </span>
                  }
                />

                <AnimatePresence initial={false}>
                  {isExp && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE }}
                      className="overflow-hidden"
                    >
                      {kids.map((s) => {
                        const id = `${c.name}${SEP}${s}`;
                        return (
                          <Row
                            key={id}
                            label={s}
                            color={c.color}
                            depth={1}
                            active={isOn(id)}
                            count={counts[id]}
                            onClick={() => pick(id)}
                            right={
                              <span className="flex shrink-0 items-center gap-0.5">
                                {isOn(id) && <Check size={14} strokeWidth={3} style={{ color: T.acc }} />}
                                <button
                                  title="Видалити підтег зі списку"
                                  onClick={(e) => { e.stopPropagation(); onTreeChange(removeTag(tree, id)); }}
                                  className="grid h-6 w-6 place-items-center rounded-md opacity-0 transition-all group-hover:opacity-100"
                                  style={{ color: T.text4 }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                                >
                                  <X size={12} strokeWidth={2.8} />
                                </button>
                              </span>
                            }
                          />
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* створення свого тега */}
      {q.trim() && !exactExists && (
        <div className="shrink-0" style={{ borderTop: `1px solid ${T.line}`, background: T.sunken }}>
          {!creatingFor ? (
            <button
              onClick={() => setCreatingFor(true)}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13.5px] font-semibold transition-colors"
              style={{ fontFamily: T.sans, color: T.acc }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${T.accRgb},0.07)`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={14} strokeWidth={3} />
              Створити «{q.trim()}»
            </button>
          ) : (
            <div className="px-3 py-2.5">
              <p className="mb-2 px-0.5 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Куди покласти
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => createIn(null)}
                  className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: T.text, background: T.surfaceHi, border: `1px solid ${T.lineHi}` }}
                >
                  Нова категорія
                </button>
                {tree.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => createIn(c.name)}
                    className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                    style={{ fontFamily: T.sans, color: c.color, background: `${c.color}14`, border: `1px solid ${c.color}2e` }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );

  const activeCount = multi ? value.length : selected ? 1 : 0;

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => (open ? closeDrop() : openDrop())}
        className="flex h-[40px] items-center gap-2 whitespace-nowrap rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors"
        style={{
          fontFamily: T.sans,
          background: open || activeCount ? T.surfaceHi : 'transparent',
          border: '1px solid transparent',
          color: activeCount ? T.text : T.text2,
        }}
        onMouseEnter={(e) => { if (!open && !activeCount) e.currentTarget.style.background = T.surfaceHi; }}
        onMouseLeave={(e) => { if (!open && !activeCount) e.currentTarget.style.background = 'transparent'; }}
      >
        <TagIcon size={15} strokeWidth={2.2} style={{ color: activeCount ? T.acc : T.text3 }} />
        {!multi && selected ? tagLabel(selected) : label}
        {multi && activeCount > 0 && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[12px] font-bold tabular-nums"
            style={{ background: `rgba(${T.accRgb},0.14)`, color: T.acc }}
          >
            {activeCount}
          </span>
        )}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE }} className="flex" style={{ color: T.text4 }}>
          <ChevronRight size={14} strokeWidth={2.5} className="rotate-90" />
        </motion.span>
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>{open && drop}</AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
