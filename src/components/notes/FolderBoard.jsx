import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  motion, AnimatePresence, animate, useMotionValue,
} from 'framer-motion';
import {
  Plus, Pencil, Trash2, Check, X, Inbox, GripVertical, Pin, PinOff,
} from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { FOLDER_COLORS, NO_FOLDER } from '../../lib/foldersStore';

/* ==================================================================
   Полиця з папками.

   Перша сторінка записника, коли папки вже є. Папка тут — предмет, а
   не рядок списку: корінець свого кольору, паперова поверхня,
   лічильник збоку. Впізнаватись вона має боковим зором, ще до того,
   як людина прочитала назву.

   Ховер зроблений без руху: картка не підстрибує й не масштабується,
   рухається тільки світло під курсором. Стрибок картки під рукою
   змушує око щоразу заново її ловити, а на полиці з десятком папок
   це втомлює швидко.

   Перетягування — те саме, що в плиток Лаунчпада, і з тієї ж причини:
   CSS-сітка під час жесту сама переставляє елементи, і браузер
   починає боротись із анімацією. Тому позиції рахуються вручну, а
   картки абсолютні — рухаються тільки трансформи.
================================================================== */

/* Розмір картки.

   Було 216×152 — розмір рядка списку, який намалювали як картку.
   Папка на такій площі читається як плашка: назва туди влазить у
   два слова, а лічильник і кнопки б'ються за одні й ті самі
   пікселі.

   260×190 — це вже предмет: назва в один рядок великим кеглем,
   лічильник помітний з іншого кінця екрана, і лишається порожнє
   поле, без якого картка виглядає забитою. На ширині 1600 це рівно
   п'ять у ряд — стільки, скільки людина охоплює одним поглядом. */
const GAP = 16;
const ROW = 190;
const MIN_W = 260;
const SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.7 };

const move = (arr, from, to) => {
  if (from === to || from < 0 || to < 0) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/* Курсорне світло живе на CSS-змінних: під час руху миші не
   перерендерюється жоден компонент, змінюються тільки дві величини
   на самому елементі. */
const trackLight = (e) => {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
};

/* ---------- одна позиція в сітці ---------- */

/* Два шари, а не один — і це головне тут.

   Раніше сітка й жест писали в одні й ті самі x/y. Виглядало
   економно, а насправді два господарі одного значення завжди
   домовляються погано: варто було framer'у перехопити координати
   під drag, і картка переставала слухати сітку. Найгірше це видно
   було не при перетягуванні, а при вході на сторінку — ширина
   комірки міряється вже після першого рендера, і всі картки, крім
   недрагабельних, залишались на позиціях, порахованих для
   попередньої ширини. Звідси й наїзд одна на одну.

   Тепер зовнішній шар — це місце в сітці, і про жест він не знає
   взагалі. Внутрішній — сам жест, і він завжди зміщення відносно
   свого місця, тобто після відпускання просто повертається в нуль.
   Ніхто нікому не пише в чужі значення. */
function Slot({ slot, dragging, draggable, bounds, onStart, onMove, onEnd, children }) {
  const x = useMotionValue(slot.x);
  const y = useMotionValue(slot.y);
  const w = useMotionValue(slot.w);
  const first = useRef(true);

  useEffect(() => {
    /* Перша поява — без анімації: картка має зʼявитись на місці, а
       не приїхати туди з лівого верхнього кута. */
    if (first.current) {
      first.current = false;
      x.set(slot.x); y.set(slot.y); w.set(slot.w);
      return undefined;
    }
    const a = animate(x, slot.x, SPRING);
    const b = animate(y, slot.y, SPRING);
    const c = animate(w, slot.w, SPRING);
    return () => { a.stop(); b.stop(); c.stop(); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [slot.x, slot.y, slot.w]);

  return (
    <motion.div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        x,
        y,
        width: w,
        height: ROW,
        zIndex: dragging ? 30 : 1,
      }}
    >
      <motion.div
        drag={draggable}
        dragConstraints={bounds}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={onStart}
        onDrag={onMove}
        onDragEnd={onEnd}
        /* Поки тягнуть — керує рука. Відпустили — вертаємось у нуль,
           тобто рівно на своє місце в сітці, хай куди воно за час
           жесту переїхало. */
        animate={dragging ? undefined : { x: 0, y: 0 }}
        transition={SPRING}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ---------- стікер ---------- */

function Sticker({ folder, count, dragging, onOpen, onEdit, onPin, onDelete }) {
  const c = folder.color;

  return (
    <div
      onClick={onOpen}
      onMouseMove={trackLight}
      className="fb-card group/st relative flex h-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl p-[22px] pl-[26px]"
      style={{
        '--c': c,
        background: T.surface,
        border: `1px solid ${dragging ? c : T.line}`,
        boxShadow: dragging
          ? `0 26px 52px -18px rgba(0,0,0,0.6), 0 0 0 1px ${c}55`
          : 'var(--edge-card-shadow, 0 1px 0 rgba(255,255,255,0.03) inset)',
      }}
    >
      {/* корінець — те, що робить стікер предметом, а не плашкою */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[5px]" style={{ background: c }} />
      <span className="pointer-events-none absolute inset-y-0 left-[5px] w-[12px]" style={{ background: `linear-gradient(90deg, ${c}2e, transparent)` }} />

      {/* світло під курсором */}
      <span className="fb-glow pointer-events-none absolute inset-0" />
      {/* корінець підсвічується разом із карткою */}
      <span className="fb-edge pointer-events-none absolute inset-y-0 left-0 w-[5px]" style={{ background: c }} />

      <div className="relative flex items-start justify-between gap-2">
        {/* Порожня папка не кричить кольором: нуль записів — це не
            досягнення і не проблема, це просто ще не почато. */}
        <span
          className="grid h-[46px] min-w-[46px] shrink-0 place-items-center rounded-xl px-2 text-[19px] font-bold tabular-nums"
          style={{
            background: count ? `${c}1c` : T.sunken,
            border: `1px solid ${count ? `${c}3d` : T.line}`,
            color: count ? c : T.text4,
            fontFamily: T.mono,
          }}
        >
          {count}
        </span>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/st:opacity-100">
          {[
            { I: folder.pinned ? PinOff : Pin, t: folder.pinned ? 'Відкріпити' : 'Закріпити зверху', on: onPin, hue: T.acc },
            { I: Pencil, t: 'Змінити', on: onEdit, hue: T.text },
            { I: Trash2, t: 'Видалити папку', on: onDelete, hue: T.bad },
          ].map(({ I, t, on, hue }) => (
            <button
              key={t}
              onClick={(e) => { e.stopPropagation(); on(); }}
              title={t}
              className="grid h-7 w-7 place-items-center rounded-lg transition-colors duration-150"
              style={{ border: `1px solid ${T.line}`, color: T.text4, background: T.sunken }}
              onMouseEnter={(e) => { e.currentTarget.style.color = hue; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
            >
              <I size={12} strokeWidth={2.3} />
            </button>
          ))}
          <span className="ml-0.5 grid h-7 w-4 cursor-grab place-items-center active:cursor-grabbing" style={{ color: T.text4 }} title="Перетягнути">
            <GripVertical size={13} strokeWidth={2.2} />
          </span>
        </div>
      </div>

      <div className="relative">
        <div className="mb-2 flex items-center gap-1.5">
          {folder.pinned && <Pin size={12} strokeWidth={2.6} style={{ color: c }} />}
          <span
            className="text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ fontFamily: T.sans, color: folder.pinned ? c : T.text4 }}
          >
            {folder.pinned ? 'закріплено' : count ? (count === 1 ? 'запис' : 'записів') : 'порожня'}
          </span>
        </div>
        <div
          className="truncate text-[21px] font-bold leading-tight"
          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.025em' }}
        >
          {folder.name}
        </div>
      </div>
    </div>
  );
}

/* ---------- вікно зміни папки ----------

   Окремим шаром, а не всередині картки: назва, палітра і дві кнопки
   в картку 216×152 не влазять — вони там накладались одне на одне.
   Та й міняти папку зручніше, коли її видно цілком, а не в комірці
   сітки, яка щойно поїхала. */
export function FolderDialog({ folder, fresh, onSave, onClose }) {
  /* Щойно створеній папці підставлене «Нова папка» стирати
     доводиться самому — це слово там технічне, а не запропоноване.
     Тому в неї поле відкривається порожнім. */
  const [name, setName] = useState(fresh ? '' : folder.name);
  const [color, setColor] = useState(folder.color);
  const [pinned, setPinned] = useState(!!folder.pinned);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);

  const save = () => onSave({ name, color, pinned });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      style={{ background: 'rgba(6,6,8,0.82)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.985 }}
        transition={{ duration: 0.26, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onClose();
        }}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl"
        style={{
          background: 'var(--edge-panel, #131316)',
          border: `1px solid ${T.line}`,
          boxShadow: 'var(--edge-panel-shadow, 0 40px 100px -30px rgba(0,0,0,0.9))',
        }}
      >
        {/* смуга кольору — миттєвий прев'ю того, що вибираєш */}
        <div className="h-1.5 w-full transition-colors duration-300" style={{ background: color }} />

        <div className="p-6">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Назва
          </p>
          <input
            ref={ref}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад: Розбори тижня"
            className="h-11 w-full rounded-xl px-3.5 text-[15px] font-semibold outline-none transition-colors"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.sans }}
            onFocus={(e) => (e.currentTarget.style.borderColor = color)}
            onBlur={(e) => (e.currentTarget.style.borderColor = T.line)}
          />

          <p className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Колір
          </p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="grid h-8 w-8 place-items-center rounded-xl transition-transform duration-150 hover:scale-[1.08]"
                style={{ background: `${c}22`, border: `1px solid ${c === color ? c : `${c}44`}` }}
              >
                <span className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />
              </button>
            ))}
          </div>

          <button
            onClick={() => setPinned((p) => !p)}
            className="mt-6 flex h-11 w-full items-center gap-2.5 rounded-xl px-3.5 text-[13.5px] font-semibold transition-colors"
            style={{
              background: pinned ? `${color}17` : T.sunken,
              border: `1px solid ${pinned ? color : T.line}`,
              color: pinned ? T.text : T.text3,
              fontFamily: T.sans,
            }}
          >
            <Pin size={14} strokeWidth={2.4} style={{ color: pinned ? color : T.text4 }} />
            {pinned ? 'Закріплена зверху' : 'Закріпити зверху'}
          </button>

          <div className="mt-6 flex gap-2">
            <button
              onClick={save}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-transform active:scale-[0.99]"
              style={{ background: T.acc, color: 'var(--edge-on-acc, #0A0A0C)', fontFamily: T.sans }}
            >
              <Check size={15} strokeWidth={3} /> {fresh ? 'Готово' : 'Зберегти'}
            </button>
            <button
              onClick={onClose}
              className="h-11 rounded-xl px-4 text-[14px] font-semibold transition-colors"
              style={{ border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.text3)}
            >
              Скасувати
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ================================================================== */

export default function FolderBoard({
  folders, countOf, looseCount, onOpen, onCreate, onRename, onDelete, onReorder,
}) {
  const wrapRef = useRef(null);
  const [cols, setCols] = useState(1);
  /* 0 — ще не міряли. Малювати сітку до вимірювання не можна: вгадана
     ширина комірки дала б картки не на своїх місцях, а потім вони б
     на очах роз'їжджались. Один кадр порожнього місця чесніший за
     кадр з невірним розкладом. */
  const [cellW, setCellW] = useState(0);

  const [dragId, setDragId] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);
  const [editId, setEditId] = useState(null);

  const cellRef = useRef('');
  const atRef = useRef(0);
  const boxRef = useRef(null);
  const movedRef = useRef(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;

    const measure = () => {
      const w = el.clientWidth;
      if (!w) return;
      const n = Math.max(1, Math.floor((w + GAP) / (MIN_W + GAP)));
      setCols(n);
      setCellW((w - GAP * (n - 1)) / n);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byId = Object.fromEntries(folders.map((f) => [f.id, f]));
  const baseOrder = folders.map((f) => f.id);
  const order = dragOrder || baseOrder;

  const tail = [];
  if (looseCount > 0) tail.push(NO_FOLDER);
  tail.push('__new__');

  const all = [...order, ...tail];
  const rows = Math.ceil(all.length / cols) || 1;
  /* Поки не виміряно, cols ще одиниця, і висота вийшла б на весь
     список у стовпчик — сторінка смикнулась би скролом. Тримаємо
     висоту одного рядка: після виміру вона доїде до правильної. */
  const height = cellW ? rows * ROW + (rows - 1) * GAP : ROW;

  const slotAt = (i) => ({
    x: (i % cols) * (cellW + GAP),
    y: Math.floor(i / cols) * (ROW + GAP),
    w: cellW,
  });

  /* ---------- жест ---------- */
  const startDrag = (id) => {
    const el = wrapRef.current;
    const r = el ? el.getBoundingClientRect() : null;
    boxRef.current = r ? { left: r.left, top: r.top, scroll: window.scrollY } : null;
    cellRef.current = '';
    atRef.current = 0;
    movedRef.current = false;
    setDragOrder(baseOrder);
    setDragId(id);
  };

  const onDragMove = (e) => {
    const box = boxRef.current;
    if (!dragId || !box || !cellW) return;
    movedRef.current = true;

    const px = e.clientX - box.left;
    const py = e.clientY - box.top + (window.scrollY - box.scroll);

    const c = Math.floor(px / (cellW + GAP));
    const r = Math.floor(py / (ROW + GAP));
    if (c < 0 || c >= cols || r < 0) return;

    /* мертва зона по краях комірки: на межі двох карток намір людини
       ще не визначений, і вгадувати його не треба */
    const inX = px - c * (cellW + GAP);
    const inY = py - r * (ROW + GAP);
    if (inX < cellW * 0.18 || inX > cellW * 0.82) return;
    if (inY < ROW * 0.18 || inY > ROW * 0.82) return;

    const cell = `${r}:${c}`;
    if (cell === cellRef.current) return;

    const now = performance.now();
    if (now - atRef.current < 140) return;

    const over = (dragOrder || [])[r * cols + c];
    if (!over || over === dragId) return;

    /* Закріплені й звичайні не змішуються. Інакше папку можна було б
       перетягнути вниз, а вона б відскочила назад нагору — жест без
       результату гірший за заборонений жест. */
    if (!!byId[over]?.pinned !== !!byId[dragId]?.pinned) return;

    cellRef.current = cell;
    atRef.current = now;

    setDragOrder((cur) => {
      const base = cur || baseOrder;
      return move(base, base.indexOf(dragId), base.indexOf(over));
    });
  };

  const endDrag = () => {
    const next = dragOrder;
    cellRef.current = '';
    boxRef.current = null;
    setDragId(null);
    setDragOrder(null);
    if (next) onReorder(next.map((id) => byId[id]).filter(Boolean));
    /* клік після перетягування не має відкривати папку */
    setTimeout(() => { movedRef.current = false; }, 0);
  };

  const openIf = (id) => { if (!movedRef.current) onOpen(id); };

  const editing = editId ? byId[editId] : null;

  /* ================================================================ */

  return (
    <>
      <style>{`
        .fb-card { transition: border-color .28s ease, box-shadow .28s ease; --mx: 50%; --my: 50%; }
        .fb-glow {
          background: radial-gradient(240px circle at var(--mx) var(--my),
            color-mix(in srgb, var(--c) 22%, transparent), transparent 68%);
          opacity: 0;
          transition: opacity .35s ease;
        }
        .fb-card:hover .fb-glow { opacity: calc(1 * var(--edge-fx, 1)); }

        /* Корінець наливається кольором на ховері — рух є, але його
           робить світло, а не сама картка. */
        .fb-edge { opacity: 0; filter: blur(5px); transition: opacity .35s ease; }
        .fb-card:hover .fb-edge { opacity: calc(.9 * var(--edge-fx, 1)); }

        .fb-card:hover {
          border-color: color-mix(in srgb, var(--c) 55%, transparent);
          box-shadow: 0 14px 32px -18px rgba(0,0,0,.55),
                      inset 0 0 0 1px color-mix(in srgb, var(--c) 12%, transparent);
        }

        /* Світлій темі ореол потрібен слабший: на папері він швидко
           перетворюється на брудну пляму. */
        :root.edge-light .fb-glow {
          background: radial-gradient(220px circle at var(--mx) var(--my),
            color-mix(in srgb, var(--c) 13%, transparent), transparent 70%);
        }
      `}</style>

      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        {/* До першого виміру ширини рендеримо саму лише коробку —
            їй же й міряти. Картки зʼявляться наступним кадром, уже
            на своїх місцях. */}
        {!cellW ? null : all.map((id, i) => {
          const slot = slotAt(i);

          if (id === '__new__') {
            return (
              <Slot key="__new__" slot={slot} dragging={false} draggable={false} bounds={wrapRef}>
                <button
                  onClick={onCreate}
                  className="group/new flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-2xl transition-colors duration-300"
                  style={{ border: `1px dashed ${T.lineHi}`, background: 'transparent', color: T.text3 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.acc; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text3; }}
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl transition-colors duration-300"
                    style={{ border: `1px solid ${T.line}` }}
                  >
                    <Plus size={19} strokeWidth={2.4} className="transition-transform duration-300 group-hover/new:rotate-90" />
                  </span>
                  <span className="text-[14.5px] font-semibold" style={{ fontFamily: T.sans }}>Нова папка</span>
                </button>
              </Slot>
            );
          }

          if (id === NO_FOLDER) {
            return (
              <Slot key={NO_FOLDER} slot={slot} dragging={false} draggable={false} bounds={wrapRef}>
                <div
                  onClick={() => onOpen(NO_FOLDER)}
                  onMouseMove={trackLight}
                  className="fb-card relative flex h-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl p-[22px]"
                  style={{ '--c': '#8a8a94', background: T.surface, border: `1px solid ${T.line}` }}
                >
                  <span className="fb-glow pointer-events-none absolute inset-0" />
                  <span
                    className="relative grid h-[46px] w-[46px] place-items-center rounded-xl"
                    style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3 }}
                  >
                    <Inbox size={19} strokeWidth={2.1} />
                  </span>
                  <div className="relative">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      {looseCount} {looseCount === 1 ? 'запис' : 'записів'}
                    </div>
                    <div className="text-[21px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text2, letterSpacing: '-0.025em' }}>
                      Без папки
                    </div>
                  </div>
                </div>
              </Slot>
            );
          }

          const f = byId[id];
          if (!f) return null;

          return (
            <Slot
              key={id}
              slot={slot}
              dragging={dragId === id}
              draggable
              bounds={wrapRef}
              onStart={() => startDrag(id)}
              onMove={onDragMove}
              onEnd={endDrag}
            >
              <Sticker
                folder={f}
                count={countOf(f.id)}
                dragging={dragId === id}
                onOpen={() => openIf(f.id)}
                onEdit={() => setEditId(f.id)}
                onPin={() => onRename(f, { pinned: !f.pinned })}
                onDelete={() => onDelete(f)}
              />
            </Slot>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <FolderDialog
            key="folder-dialog"
            folder={editing}
            onSave={(patch) => { onRename(editing, patch); setEditId(null); }}
            onClose={() => setEditId(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
