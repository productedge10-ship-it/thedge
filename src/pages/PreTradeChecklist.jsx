import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Plus, Trash2, Pencil, X, RotateCcw, HelpCircle, ShieldAlert,
  ShieldCheck, Zap, Eraser, FolderPlus,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  DEFAULT_GROUPS, DEFAULT_ITEMS, KEYS,
  normalizeGroups, normalizeItems, normalizeChecked,
  verdictOf, newGroupId,
} from '../lib/checklistData';
import useCloudState from '../hooks/useCloudState';
import { SoftCard } from '../components/ui/Hovers';
import {
  Counter, DrawnCheck, ProgressRing, SpineNode, Sweep, EdgeProgress,
} from '../components/checklist/ChecklistBits';

/* ==================================================================
   Чекліст перед входом.
   Головна ідея: його треба ПРОКЛІКАТИ, а не проглянути. Тому пункт —
   велика зона натискання на всю ширину, а зверху завжди видно
   вердикт: можна заходити чи ні. Критичні пункти тримають вердикт
   червоним, поки не закриті.
================================================================== */

/* ---------- пункт ---------- */
function Item({ item, checked, editing, onToggle, onStartEdit, onSaveEdit, onCancelEdit, onDelete, editText, setEditText }) {
  const c = checked ? T.ok : item.critical ? T.warn : T.acc;

  if (editing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="rounded-xl"
        style={{ background: T.sunken, border: `1px solid ${T.lineAcc}` }}
      >
        <div className="flex items-center gap-2 px-2.5 py-2">
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="h-9 min-w-0 flex-1 bg-transparent px-1.5 text-[14.5px] outline-none"
            style={{ fontFamily: T.sans, color: T.text }}
          />
          <span className="h-5 w-px shrink-0" style={{ background: T.line }} />
          <button
            onClick={onSaveEdit}
            title="Зберегти (Enter)"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-200 active:scale-95"
            style={{ background: `rgba(${T.accRgb},0.14)`, border: `1px solid ${T.lineAcc}`, color: T.acc }}
          >
            <Check size={15} strokeWidth={3} />
          </button>
          <button
            onClick={onCancelEdit}
            title="Скасувати (Esc)"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
            style={{ color: T.text4, border: `1px solid ${T.line}` }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
          >
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.14 } }}
      transition={{ duration: 0.22, ease: EASE }}
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onToggle(item.id)}
      className="group relative flex cursor-pointer select-none items-center gap-3.5 overflow-hidden rounded-xl px-3.5 py-3 transition-colors duration-300"
      style={{
        background: checked ? `rgba(${T.okRgb},0.06)` : T.sunken,
        border: `1px solid ${checked ? `rgba(${T.okRgb},0.22)` : T.line}`,
      }}
      onMouseEnter={(e) => { if (!checked) e.currentTarget.style.borderColor = T.lineHi; }}
      onMouseLeave={(e) => { if (!checked) e.currentTarget.style.borderColor = T.line; }}
    >
      {/* одноразовий проблиск у момент відмітки */}
      <Sweep trigger={checked} color={T.ok} />

      {/* риска зліва: у критичних тліє завжди, у звичайних — тільки
         коли пункт закрито. Так критичні видно, не крикнувши. */}
      <motion.span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[2px] rounded-full"
        initial={false}
        animate={{
          backgroundColor: checked ? T.ok : T.warn,
          opacity: checked ? 0.55 : item.critical ? 0.4 : 0,
          scaleY: checked || item.critical ? 1 : 0.4,
        }}
        transition={{ duration: 0.3, ease: EASE }}
      />

      {/* галочка */}
      <motion.span
        className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-lg"
        initial={false}
        animate={{
          backgroundColor: checked ? T.ok : 'rgba(0,0,0,0)',
          borderColor: checked ? T.ok : T.lineHi,
          scale: checked ? 1 : 0.96,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        style={{ borderWidth: 1.5, borderStyle: 'solid' }}
      >
        <AnimatePresence>{checked && <DrawnCheck key="check" />}</AnimatePresence>
      </motion.span>

      {/* текст.
         Закреслення прокреслюється градієнтом по самому тексту, а не
         лінією через увесь рядок — тому воно тягнеться рівно по словах
         і коректно переноситься, якщо пункт довгий. */}
      <span className="relative z-10 min-w-0 flex-1">
        <motion.span
          className="text-[14.5px] leading-snug"
          initial={false}
          animate={{
            color: checked ? T.text3 : T.text,
            backgroundSize: checked ? '100% 1.5px' : '0% 1.5px',
          }}
          transition={{
            color: { duration: 0.3, ease: EASE },
            backgroundSize: { duration: 0.34, ease: [0.65, 0, 0.35, 1] },
          }}
          style={{
            fontFamily: T.sans,
            display: 'inline',
            backgroundImage: `linear-gradient(rgba(${T.okRgb},0.6), rgba(${T.okRgb},0.6))`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0 62%',
            WebkitBoxDecorationBreak: 'clone',
            boxDecorationBreak: 'clone',
          }}
        >
          {item.text}
        </motion.span>
      </span>

      {/* критичність */}
      <AnimatePresence>
        {item.critical && !checked && (
          <motion.span
            key="crit"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="relative z-10 hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.08em] sm:inline"
            style={{ fontFamily: T.sans, color: T.warn, background: `rgba(${T.warnRgb},0.10)` }}
          >
            критичний
          </motion.span>
        )}
      </AnimatePresence>

      {/* дії */}
      <span className="relative z-10 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onStartEdit(item); }}
          title="Редагувати"
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <Pencil size={14} strokeWidth={2.2} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          title="Видалити"
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
          style={{ color: T.text4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
        >
          <Trash2 size={14} strokeWidth={2.2} />
        </button>
      </span>
    </motion.div>
  );
}

/* ================================================================== */

export default function PreTradeChecklist() {
  useEdgeFonts();

  /* Чекліст — це особисті правила входу, тому він має їхати за
     трейдером між пристроями. Зберігається в базі, локально лишається
     тільки дзеркало для миттєвого відкриття сторінки. */
  const [groups, setGroups] = useCloudState('checklist_groups', DEFAULT_GROUPS, {
    legacyKey: KEYS.groups, normalize: normalizeGroups,
  });
  const [items, setItems] = useCloudState('checklist_items', DEFAULT_ITEMS, {
    legacyKey: KEYS.items, normalize: normalizeItems,
  });
  const [checked, setChecked] = useCloudState('checklist_checked', [], {
    legacyKey: KEYS.checked, normalize: normalizeChecked,
  });
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [adding, setAdding] = useState(null);     // id групи, куди додаємо
  const [newText, setNewText] = useState('');
  const [newCritical, setNewCritical] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);   // id блоку, який перейменовуємо
  const [groupDraft, setGroupDraft] = useState({ label: '', hint: '' });
  const [confirm, setConfirm] = useState(null);   // { kind, id, title, text }
  const [cheatOpen, setCheatOpen] = useState(false);
  const addRef = useRef(null);

  useEffect(() => {
    if (!cheatOpen && !confirm) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (confirm) setConfirm(null);
      else setCheatOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [cheatOpen, confirm]);

  const verdict = useMemo(() => verdictOf(items, checked), [items, checked]);

  const toggle = (id) =>
    setChecked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const removeItem = (id) => {
    setItems((s) => s.filter((i) => i.id !== id));
    setChecked((s) => s.filter((x) => x !== id));
  };

  const startEdit = (item) => { setEditingId(item.id); setEditText(item.text); };
  const saveEdit = () => {
    if (editText.trim()) setItems((s) => s.map((i) => (i.id === editingId ? { ...i, text: editText.trim() } : i)));
    setEditingId(null);
  };

  const addItem = (group) => {
    const text = newText.trim();
    if (!text) return;
    setItems((s) => [...s, { id: Date.now(), text, group, critical: newCritical }]);
    setNewText('');
    setNewCritical(false);
    setTimeout(() => addRef.current?.focus(), 0);
  };

  const reset = () => setChecked([]);

  /* ---------- блоки ---------- */

  const startGroupEdit = (g) => {
    setEditingGroup(g.id);
    setGroupDraft({ label: g.label, hint: g.hint });
  };

  const saveGroupEdit = () => {
    const label = groupDraft.label.trim();
    if (label) {
      setGroups((s) => s.map((g) => (g.id === editingGroup ? { ...g, label, hint: groupDraft.hint.trim() } : g)));
    }
    setEditingGroup(null);
  };

  const addGroup = () => {
    const id = newGroupId();
    setGroups((s) => [...s, { id, label: 'Новий блок', hint: '' }]);
    setTimeout(() => { setEditingGroup(id); setGroupDraft({ label: 'Новий блок', hint: '' }); }, 0);
  };

  const deleteGroup = (id) => {
    const ids = items.filter((i) => i.group === id).map((i) => i.id);
    setItems((s) => s.filter((i) => i.group !== id));
    setChecked((s) => s.filter((x) => !ids.includes(x)));
    setGroups((s) => s.filter((g) => g.id !== id));
  };

  const clearAll = () => {
    setItems([]);
    setChecked([]);
  };

  const restoreDefaults = () => {
    setGroups(DEFAULT_GROUPS);
    setItems(DEFAULT_ITEMS);
    setChecked([]);
  };

  const askConfirm = (cfg) => setConfirm(cfg);
  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'group') deleteGroup(confirm.id);
    if (confirm.kind === 'clear') clearAll();
    if (confirm.kind === 'restore') restoreDefaults();
    setConfirm(null);
  };

  const V = {
    go:     { color: T.ok,   icon: ShieldCheck, title: 'Можна заходити', text: 'Усі пункти закриті. Далі — тільки виконання: стоп на місці, розмір порахований.' },
    almost: { color: T.info, icon: Zap,        title: 'Критичні закриті', text: `Лишилось ${verdict.total - verdict.done} необовʼязкових. Якщо це свідомо — заходь.` },
    stop:   { color: T.bad,  icon: ShieldAlert, title: 'Ще рано',        text: `Не закрито критичних пунктів: ${verdict.criticalsLeft.length}. Саме через них зазвичай і прилітає мінус.` },
    empty:  { color: T.text3, icon: ShieldAlert, title: 'Чекліст порожній', text: 'Додай хоча б кілька пунктів, які ти справді перевіряєш.' },
  }[verdict.state];

  const VIcon = V.icon;

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1100px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Перед входом
            </div>
            <h1
              className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Чекліст
            </h1>
            <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              Проклікай кожен пункт вголос до себе — саме це й зупиняє від дурних входів
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={reset}
              disabled={!checked.length}
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{
                background: T.surface, border: `1px solid ${T.line}`, color: T.text2,
                fontFamily: T.sans, opacity: checked.length ? 1 : 0.45,
              }}
              onMouseEnter={(e) => { if (checked.length) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <RotateCcw size={15} strokeWidth={2.2} />
              Скинути
            </button>

            <button
              onClick={() => askConfirm({
                kind: 'clear',
                title: 'Очистити чекліст?',
                text: `Зникнуть усі ${items.length} пунктів у всіх блоках. Блоки лишаться порожніми.`,
                cta: 'Очистити',
              })}
              disabled={!items.length}
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{
                background: T.surface, border: `1px solid ${T.line}`, color: T.text2,
                fontFamily: T.sans, opacity: items.length ? 1 : 0.45,
              }}
              onMouseEnter={(e) => { if (items.length) { e.currentTarget.style.borderColor = `rgba(${T.badRgb},0.35)`; e.currentTarget.style.color = T.bad; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <Eraser size={15} strokeWidth={2.2} />
              Очистити все
            </button>

            <button
              onClick={() => askConfirm({
                kind: 'restore',
                title: 'Повернути стандартний чекліст?',
                text: 'Твої блоки й пункти будуть замінені на початковий набір.',
                cta: 'Повернути',
              })}
              title="Повернути стандартні блоки й пункти"
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <ShieldCheck size={15} strokeWidth={2.2} />
              Стандартний
            </button>

            <button
              onClick={() => setCheatOpen(true)}
              className="flex h-[42px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[14px] font-semibold transition-all duration-200 active:scale-[0.98]"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <HelpCircle size={15} strokeWidth={2.2} />
              Памʼятка
            </button>
          </div>
        </motion.div>

        {/* ─────────── Вердикт ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="sticky top-3 z-20 mb-5"
        >
          <motion.div
            className="relative flex items-center gap-4 overflow-hidden rounded-2xl px-4 py-4 sm:px-5"
            initial={false}
            animate={{ borderColor: `${V.color}33` }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              background: 'rgba(19,19,22,0.92)',
              backdropFilter: 'blur(16px)',
              borderWidth: 1,
              borderStyle: 'solid',
              boxShadow: '0 18px 40px -28px rgba(0,0,0,0.9)',
            }}
          >
            {/* дуже тихий кольоровий підмальовок стану */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={false}
              animate={{ background: `linear-gradient(100deg, ${V.color}12, transparent 55%)` }}
              transition={{ duration: 0.6, ease: EASE }}
            />

            <div className="relative z-10 flex w-full items-center gap-4">
              <ProgressRing value={verdict.done} total={verdict.total} color={V.color} />

              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={verdict.state}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.22, ease: EASE }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <VIcon size={16} strokeWidth={2.3} className="shrink-0" style={{ color: V.color }} />
                      <span className="truncate text-[17px] font-bold" style={{ fontFamily: T.display, color: V.color, letterSpacing: '-0.01em' }}>
                        {V.title}
                      </span>
                    </div>
                    <p className="text-[13.5px] leading-snug" style={{ fontFamily: T.sans, color: T.text3 }}>
                      {V.text}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* смуга прогресу для широких екранів */}
              <div className="hidden w-[180px] shrink-0 lg:block">
                <div className="h-2 overflow-hidden rounded-full" style={{ background: T.sunken }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={false}
                    animate={{
                      width: `${verdict.total ? (verdict.done / verdict.total) * 100 : 0}%`,
                      backgroundColor: V.color,
                    }}
                    transition={{ type: 'spring', stiffness: 140, damping: 24 }}
                  />
                </div>
                <div className="mt-1.5 text-right text-[12.5px] tabular-nums" style={{ fontFamily: T.sans, color: T.text4 }}>
                  {verdict.criticalsLeft.length
                    ? <>лишилось критичних: <Counter value={verdict.criticalsLeft.length} /></>
                    : 'критичні закриті'}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* ─────────── Групи ─────────── */}
        <div className="relative flex flex-col gap-4 lg:pl-11">
          {/* вертикальна лінія прогресу — шлях, яким ти спускаєшся до входу */}
          <div className="pointer-events-none absolute bottom-6 left-[15px] top-6 hidden w-px lg:block" style={{ background: T.line }}>
            <motion.span
              className="absolute inset-x-0 top-0 origin-top"
              style={{ height: '100%', background: `linear-gradient(${T.acc}, ${V.color})` }}
              initial={false}
              animate={{ scaleY: verdict.total ? verdict.done / verdict.total : 0 }}
              transition={{ type: 'spring', stiffness: 120, damping: 26 }}
            />
          </div>

          {groups.map((g, gi) => {
            const list = items.filter((i) => i.group === g.id);
            const doneIn = list.filter((i) => checked.includes(i.id)).length;
            const allDone = list.length > 0 && doneIn === list.length;
            const groupPct = list.length ? doneIn / list.length : 0;

            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: gi * 0.05, ease: EASE }}
                className="relative"
              >
                {/* вузол на лінії */}
                <span className="absolute -left-11 top-3 hidden lg:block">
                  <SpineNode done={allDone} color={allDone ? T.ok : T.acc} />
                </span>

                <SoftCard lift={0} className="group/blk overflow-hidden">
                  <EdgeProgress pct={groupPct} color={allDone ? T.ok : T.acc} />
                  {/* шапка групи */}
                  <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5" style={{ borderBottom: `1px solid ${T.line}` }}>
                    <motion.span
                      className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg text-[12.5px] font-bold tabular-nums"
                      initial={false}
                      animate={{
                        backgroundColor: allDone ? `rgba(${T.okRgb},0.12)` : T.sunken,
                        borderColor: allDone ? `rgba(${T.okRgb},0.28)` : T.line,
                        color: allDone ? T.ok : T.text3,
                      }}
                      transition={{ duration: 0.35, ease: EASE }}
                      style={{ fontFamily: T.mono, borderWidth: 1, borderStyle: 'solid' }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={allDone ? 'done' : 'num'}
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -8, opacity: 0 }}
                          transition={{ duration: 0.18, ease: EASE }}
                          className="flex"
                        >
                          {allDone ? <Check size={13} strokeWidth={3.4} /> : gi + 1}
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>

                    {editingGroup === g.id ? (
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <input
                          autoFocus
                          value={groupDraft.label}
                          onChange={(e) => setGroupDraft((d) => ({ ...d, label: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveGroupEdit();
                            if (e.key === 'Escape') setEditingGroup(null);
                          }}
                          placeholder="Назва блоку"
                          className="h-9 min-w-[140px] flex-1 rounded-lg px-3 text-[14.5px] font-bold outline-none"
                          style={{ fontFamily: T.display, color: T.text, background: T.sunken, border: `1px solid ${T.lineAcc}` }}
                        />
                        <input
                          value={groupDraft.hint}
                          onChange={(e) => setGroupDraft((d) => ({ ...d, hint: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveGroupEdit();
                            if (e.key === 'Escape') setEditingGroup(null);
                          }}
                          placeholder="Підпис (не обовʼязково)"
                          className="h-9 min-w-[140px] flex-1 rounded-lg px-3 text-[13.5px] outline-none"
                          style={{ fontFamily: T.sans, color: T.text2, background: T.sunken, border: `1px solid ${T.line}` }}
                        />
                        <button
                          onClick={saveGroupEdit}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
                          style={{ background: `rgba(${T.accRgb},0.12)`, border: `1px solid ${T.lineAcc}`, color: T.acc }}
                        >
                          <Check size={15} strokeWidth={3} />
                        </button>
                        <button
                          onClick={() => setEditingGroup(null)}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
                          style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
                        >
                          <X size={15} strokeWidth={2.6} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="min-w-0 flex-1 cursor-text"
                          onDoubleClick={() => startGroupEdit(g)}
                          title="Подвійний клік — перейменувати"
                        >
                          <div className="truncate text-[15px] font-bold" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                            {g.label}
                          </div>
                          {g.hint && (
                            <div className="truncate text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>{g.hint}</div>
                          )}
                        </div>

                        <span className="flex shrink-0 items-baseline text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono }}>
                          <motion.span
                            initial={false}
                            animate={{ color: allDone ? T.ok : doneIn ? T.text : T.text3 }}
                            transition={{ duration: 0.3, ease: EASE }}
                          >
                            <Counter value={doneIn} />
                          </motion.span>
                          <span className="text-[12.5px]" style={{ color: T.text2, opacity: 0.7 }}>/{list.length}</span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover/blk:opacity-100">
                          <button
                            onClick={() => startGroupEdit(g)}
                            title="Перейменувати блок"
                            className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
                            style={{ color: T.text4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Pencil size={14} strokeWidth={2.2} />
                          </button>
                          <button
                            onClick={() => askConfirm({
                              kind: 'group',
                              id: g.id,
                              title: `Видалити блок «${g.label}»?`,
                              text: list.length
                                ? `Разом із ним зникнуть ${list.length} ${list.length === 1 ? 'пункт' : 'пунктів'}.`
                                : 'Блок порожній.',
                              cta: 'Видалити',
                            })}
                            title="Видалити блок"
                            className="grid h-8 w-8 place-items-center rounded-lg transition-colors duration-200"
                            style={{ color: T.text4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; e.currentTarget.style.background = `rgba(${T.badRgb},0.10)`; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; }}
                          >
                            <Trash2 size={14} strokeWidth={2.2} />
                          </button>
                        </span>
                      </>
                    )}
                  </div>

                  {/* пункти */}
                  <div className="flex flex-col gap-2 p-3 sm:p-4">
                    {list.length === 0 && adding !== g.id && (
                      <p className="px-1 pb-1 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        Порожньо — додай перше, що ти тут перевіряєш.
                      </p>
                    )}

                    <AnimatePresence initial={false} mode="popLayout">
                      {list.map((item) => (
                        <Item
                          key={item.id}
                          item={item}
                          checked={checked.includes(item.id)}
                          editing={editingId === item.id}
                          onToggle={toggle}
                          onStartEdit={startEdit}
                          onSaveEdit={saveEdit}
                          onCancelEdit={() => setEditingId(null)}
                          onDelete={removeItem}
                          editText={editText}
                          setEditText={setEditText}
                        />
                      ))}
                    </AnimatePresence>

                    {/* додавання.
                       Один рядок замість трьох різнокаліберних кнопок:
                       поле, перемикач «критичний» усередині нього і одна
                       дія праворуч. Все однієї висоти й однієї мови. */}
                    {adding === g.id ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="rounded-xl transition-colors duration-200"
                        style={{ background: T.sunken, border: `1px solid ${T.line}` }}
                        onFocusCapture={(e) => (e.currentTarget.style.borderColor = T.lineAcc)}
                        onBlurCapture={(e) => (e.currentTarget.style.borderColor = T.line)}
                      >
                        <div className="flex items-center gap-2 px-2.5 py-2">
                          <input
                            ref={addRef}
                            autoFocus
                            value={newText}
                            onChange={(e) => setNewText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addItem(g.id);
                              if (e.key === 'Escape') { setAdding(null); setNewText(''); setNewCritical(false); }
                            }}
                            placeholder="Що саме ти перевіряєш?"
                            className="h-9 min-w-0 flex-1 bg-transparent px-1.5 text-[14.5px] outline-none"
                            style={{ fontFamily: T.sans, color: T.text }}
                          />

                          {/* перемикач важливості — тихий чип, а не кнопка */}
                          <button
                            onClick={() => setNewCritical((v) => !v)}
                            title="Без цього пункту не заходити"
                            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
                            style={{
                              fontFamily: T.sans,
                              color: newCritical ? T.warn : T.text4,
                              background: newCritical ? `rgba(${T.warnRgb},0.10)` : 'transparent',
                              border: `1px solid ${newCritical ? `rgba(${T.warnRgb},0.28)` : 'transparent'}`,
                            }}
                            onMouseEnter={(e) => { if (!newCritical) { e.currentTarget.style.color = T.text2; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; } }}
                            onMouseLeave={(e) => { if (!newCritical) { e.currentTarget.style.color = T.text4; e.currentTarget.style.background = 'transparent'; } }}
                          >
                            <ShieldAlert size={14} strokeWidth={2.3} />
                            критичний
                          </button>

                          <span className="h-5 w-px shrink-0" style={{ background: T.line }} />

                          <button
                            onClick={() => addItem(g.id)}
                            disabled={!newText.trim()}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-all duration-200 active:scale-95"
                            title="Додати (Enter)"
                            style={{
                              background: newText.trim() ? `rgba(${T.accRgb},0.14)` : 'transparent',
                              border: `1px solid ${newText.trim() ? T.lineAcc : T.line}`,
                              color: newText.trim() ? T.acc : T.text4,
                              cursor: newText.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <Check size={15} strokeWidth={3} />
                          </button>

                          <button
                            onClick={() => { setAdding(null); setNewText(''); setNewCritical(false); }}
                            title="Скасувати (Esc)"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
                            style={{ color: T.text4, border: `1px solid ${T.line}` }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = T.text2; e.currentTarget.style.borderColor = T.lineHi; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
                          >
                            <X size={15} strokeWidth={2.6} />
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <button
                        onClick={() => { setAdding(g.id); setNewText(''); }}
                        className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors duration-200"
                        style={{ fontFamily: T.sans, color: T.text4, border: `1px dashed ${T.line}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
                      >
                        <Plus size={14} strokeWidth={2.6} />
                        Додати пункт
                      </button>
                    )}
                  </div>
                </SoftCard>
              </motion.div>
            );
          })}
        </div>

        {/* новий блок */}
        <button
          onClick={addGroup}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[14px] font-semibold transition-colors duration-200"
          style={{ fontFamily: T.sans, color: T.text4, border: `1px dashed ${T.line}` }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text4; e.currentTarget.style.borderColor = T.line; }}
        >
          <FolderPlus size={16} strokeWidth={2.2} />
          Додати блок
        </button>

        {/* підказка знизу */}
        <p className="mt-6 text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text4 }}>
          Стан чекліста зберігається — скинь його після кожної угоди. Назву блоку можна змінити подвійним кліком.
        </p>
      </div>

      {/* ─────────── Підтвердження ─────────── */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setConfirm(null)}
            className="fixed inset-0 z-[300] grid place-items-center p-4"
            style={{ background: 'rgba(6,6,8,0.86)', backdropFilter: 'blur(10px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[420px] rounded-2xl p-7 text-center"
              style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 40px 90px -30px rgba(0,0,0,0.95)' }}
            >
              <div
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
                style={{ background: `rgba(${T.badRgb},0.10)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
              >
                <Trash2 size={22} strokeWidth={1.9} style={{ color: T.bad }} />
              </div>
              <div
                className="mb-2.5 text-[19px] font-bold"
                style={{ fontFamily: T.display, color: T.text, overflowWrap: 'anywhere' }}
              >
                {confirm.title}
              </div>
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                {confirm.text}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirm(null)}
                  className="h-11 flex-1 rounded-xl text-[14px] font-semibold transition-colors duration-200"
                  style={{ background: T.surfaceHi, border: `1px solid ${T.line}`, color: T.text2, fontFamily: T.sans }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.text2)}
                >
                  Скасувати
                </button>
                <button
                  onClick={runConfirm}
                  className="h-11 flex-1 rounded-xl text-[14px] font-bold transition-transform duration-200 active:scale-[0.98]"
                  style={{ background: T.bad, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
                >
                  {confirm.cta || 'Видалити'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─────────── Памʼятка ─────────── */}
      <AnimatePresence>
        {cheatOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setCheatOpen(false)}
            className="fixed inset-0 z-[300] grid cursor-zoom-out place-items-center p-4 sm:p-8"
            style={{ background: 'rgba(6,6,8,0.92)', backdropFilter: 'blur(10px)' }}
          >
            <button
              onClick={() => setCheatOpen(false)}
              className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-xl transition-colors duration-200"
              style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = T.surface; e.currentTarget.style.color = T.text2; }}
            >
              <X size={18} strokeWidth={2.4} />
            </button>

            <motion.img
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.26, ease: EASE }}
              src="/analyz.png"
              alt="Памʼятка"
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] max-w-[92vw] rounded-2xl object-contain"
              style={{ border: `1px solid ${T.lineHi}`, background: T.surface }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
