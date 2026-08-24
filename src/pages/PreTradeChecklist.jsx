import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Plus, Trash2, Pencil, X, RotateCcw, ShieldAlert,
  ShieldCheck, Zap, Eraser, FolderPlus, SlidersHorizontal,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  DEFAULT_GROUPS, DEFAULT_ITEMS, KEYS,
  normalizeGroups, normalizeItems, normalizeChecked,
  verdictOf, newGroupId,
} from '../lib/checklistData';
import useCloudState from '../hooks/useCloudState';
import {
  Counter, DrawnCheck, ProgressRing, Sweep,
} from '../components/checklist/ChecklistBits';

/* ==================================================================
   Чекліст перед входом.

   Попередня версія була щільною — і саме тому втомлювала. Виявилось,
   що «менше гортати» і «легше читати» тягнуть у різні боки, і
   перемогти має друге: чекліст проходять у момент, коли людина вже
   збуджена сетапом, і дрібний текст у рамочках вона просто
   проглядає, не читаючи.

   Що з цього випливає:

   1. Жодних рамок навколо пунктів. Тринадцять обведених прямокутників
      на екрані — це тринадцять фігур, які око мусить розібрати перш
      ніж дістатись до слів. Тепер пункт — просто рядок з ледь
      світлішою підкладкою, а межу тримає відступ.

   2. Дві колонки, не чотири. Ширша колонка дозволяє більший кегль
      (15px замість 13.5) і довший рядок без переносу. Блоки стоять
      2×2 і все одно поміщаються в екран.

   3. Закритий блок не згортається, а тьмяніє. Згортання смикало
      розкладку під руками і ховало те, що людина щойно зробила —
      а бачити пройдений шлях важливо. Наведення повертає яскравість.

   4. Прохід з клавіатури. Пробіл відмічає поточний пункт і сам
      переходить до наступного невідміченого. Весь чекліст — це
      тринадцять натискань пробілу, без миші й без пошуку очима,
      куди клікати далі.

   Контрасти тримаються трьох рівнів: text — те, що читають; text3 —
   службове; text4 — тільки вимкнене.
================================================================== */

/* ---------- один пункт ---------- */

function Item({
  item, checked, editMode, editing, focused,
  onToggle, onStartEdit, onSaveEdit, onCancelEdit, onDelete,
  editText, setEditText,
}) {
  if (editing) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
        style={{ background: T.sunken, border: `1px solid ${T.lineAcc}` }}
      >
        <input
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-[15px] outline-none"
          style={{ fontFamily: T.sans, color: T.text }}
        />
        <button
          onClick={onSaveEdit}
          title="Зберегти (Enter)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-transform duration-200 active:scale-95"
          style={{ background: `rgba(${T.accRgb},0.14)`, border: `1px solid ${T.lineAcc}`, color: T.acc }}
        >
          <Check size={14} strokeWidth={3} />
        </button>
        <button
          onClick={onCancelEdit}
          title="Скасувати (Esc)"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
          style={{ color: T.text3, border: `1px solid ${T.line}` }}
        >
          <X size={14} strokeWidth={2.6} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: EASE }}
      whileTap={editMode ? undefined : { scale: 0.995 }}
      onClick={() => { if (!editMode) onToggle(item.id); }}
      className={`group relative flex select-none items-center gap-3 overflow-hidden rounded-[10px] py-[9px] pl-3 pr-2 ${editMode ? '' : 'cursor-pointer'}`}
      /* Підкладка світліша за картку, а не темніша: темна читалась як
         дірка в поверхні, світла — як предмет, що лежить зверху.
         Відмічений пункт підкладку втрачає й тихо тоне у фоні.

         Курсор показаний акцентною підкладкою, а не смужкою зліва:
         зліва вже живе жовта риска критичності, і два різні сенси на
         одних двох пікселях завжди читаються як один. */
      style={{
        background: checked
          ? 'transparent'
          : focused && !editMode
            ? `rgba(${T.accRgb},0.13)`
            : 'rgba(255,255,255,0.022)',
        transition: 'background 200ms',
      }}
    >
      <Sweep trigger={checked} color={T.ok} />

      {/* Жовта риска = критичність, і більше нічого. Вона лишається й
          після відмітки, тільки тихішає: те, що пункт був критичним,
          не перестає бути правдою від того, що його закрили. */}
      <motion.span
        aria-hidden
        className="absolute inset-y-[5px] left-0 w-[2.5px] rounded-full"
        initial={false}
        animate={{ opacity: item.critical ? (checked ? 0.45 : 0.9) : 0 }}
        transition={{ duration: 0.25, ease: EASE }}
        style={{ backgroundColor: T.warn }}
      />

      {/* галочка */}
      <motion.span
        className="relative z-10 grid h-[21px] w-[21px] shrink-0 place-items-center rounded-[7px]"
        initial={false}
        animate={{
          backgroundColor: checked ? T.ok : 'rgba(0,0,0,0)',
          borderColor: checked ? T.ok : focused && !editMode ? T.acc : T.lineHi,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        style={{ borderWidth: 1.5, borderStyle: 'solid' }}
      >
        <AnimatePresence>{checked && <DrawnCheck key="check" size={13} stroke={3.6} />}</AnimatePresence>
      </motion.span>

      <span className="relative z-10 min-w-0 flex-1">
        <motion.span
          className="text-[15px] leading-[1.4]"
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
            backgroundImage: `linear-gradient(rgba(${T.okRgb},0.5), rgba(${T.okRgb},0.5))`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: '0 62%',
            WebkitBoxDecorationBreak: 'clone',
            boxDecorationBreak: 'clone',
          }}
        >
          {item.text}
        </motion.span>
      </span>

      {editMode && (
        <span className="relative z-10 flex shrink-0 items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onStartEdit(item); }}
            title="Редагувати"
            className="grid h-8 w-8 place-items-center rounded-md transition-colors duration-200"
            style={{ color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
          >
            <Pencil size={14} strokeWidth={2.2} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            title="Видалити"
            className="grid h-8 w-8 place-items-center rounded-md transition-colors duration-200"
            style={{ color: T.text3 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
        </span>
      )}
    </motion.div>
  );
}

/* ---------- кнопка в шапці ---------- */

function Btn({ icon: I, children, onClick, disabled, tone = 'plain', title }) {
  const hot = tone === 'acc';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-[13.5px] font-semibold transition-all duration-200 active:scale-[0.98]"
      style={{
        background: hot ? `rgba(${T.accRgb},0.12)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hot ? T.lineAcc : 'transparent'}`,
        color: hot ? T.acc : T.text2,
        fontFamily: T.sans,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled && !hot) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = T.text; } }}
      onMouseLeave={(e) => { if (!hot) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = T.text2; } }}
    >
      <I size={14} strokeWidth={2.2} />
      {children}
    </button>
  );
}

/* ================================================================== */

export default function PreTradeChecklist() {
  useEdgeFonts();

  const [groups, setGroups] = useCloudState('checklist_groups', DEFAULT_GROUPS, {
    legacyKey: KEYS.groups, normalize: normalizeGroups,
  });
  const [items, setItems] = useCloudState('checklist_items', DEFAULT_ITEMS, {
    legacyKey: KEYS.items, normalize: normalizeItems,
  });
  const [checked, setChecked] = useCloudState('checklist_checked', [], {
    legacyKey: KEYS.checked, normalize: normalizeChecked,
  });

  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [adding, setAdding] = useState(null);
  const [newText, setNewText] = useState('');
  const [newCritical, setNewCritical] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupDraft, setGroupDraft] = useState({ label: '', hint: '' });
  const [confirm, setConfirm] = useState(null);
  const [cursor, setCursor] = useState(null);   // id пункту під клавіатурним курсором
  const addRef = useRef(null);

  const verdict = useMemo(() => verdictOf(items, checked), [items, checked]);

  /* Плаский список у тому порядку, в якому пункти читаються на
     екрані — по блоках згори вниз. На ньому й живе клавіатура. */
  const flat = useMemo(
    () => groups.flatMap((g) => items.filter((i) => i.group === g.id)),
    [groups, items],
  );

  const toggle = useCallback(
    (id) => setChecked((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    [setChecked],
  );

  /* Активний пункт — обчислюється, а не зберігається.

     Зберігати позицію курсора в стані виявилось пасткою: варто було
     відмітити щось мишею чи скинути чекліст, і збережений курсор
     показував на вже закритий пункт. Звідси й стрибки «закрито
     чотири, а пробіл починає з девʼятого».

     Тепер cursor — лише необовʼязкове побажання від стрілок. Якщо
     воно застаріло (пункт зник або вже закритий), активним стає
     перший незакритий згори. Стан не може розʼїхатись із тим, що
     людина бачить на екрані. */
  const active = useMemo(() => {
    const wanted = flat.find((i) => i.id === cursor && !checked.includes(i.id));
    if (wanted) return wanted.id;
    const first = flat.find((i) => !checked.includes(i.id));
    return first ? first.id : null;
  }, [flat, cursor, checked]);

  /* Наступний незакритий після заданого. Обхід із поверненням на
     початок — щоб пропущений раніше пункт не загубився назавжди. */
  const nextOpen = useCallback((afterId) => {
    const start = flat.findIndex((i) => i.id === afterId);
    for (let k = start + 1; k < flat.length; k += 1) {
      if (!checked.includes(flat[k].id)) return flat[k].id;
    }
    for (let k = 0; k < Math.max(0, start); k += 1) {
      if (!checked.includes(flat[k].id)) return flat[k].id;
    }
    return null;
  }, [flat, checked]);

  /* Відмітити активний і поїхати далі. Одна дія для пробілу й для
     миші — інакше вони розходяться в поведінці. */
  const strike = useCallback((id) => {
    const target = id ?? active;
    if (!target) return;
    const wasChecked = checked.includes(target);
    toggle(target);
    setCursor(wasChecked ? target : nextOpen(target));
  }, [active, checked, toggle, nextOpen]);

  useEffect(() => {
    if (editMode || confirm) return undefined;

    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (!flat.length) return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        strike(null);
        return;
      }

      const idx = flat.findIndex((i) => i.id === active);

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setCursor(flat[idx < 0 ? 0 : Math.min(flat.length - 1, idx + 1)].id);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setCursor(flat[idx <= 0 ? 0 : idx - 1].id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, active, editMode, confirm, strike]);

  useEffect(() => {
    if (!confirm) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setConfirm(null); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [confirm]);

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

  const reset = () => { setChecked([]); setCursor(null); };

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

  const clearAll = () => { setItems([]); setChecked([]); };

  const restoreDefaults = () => {
    setGroups(DEFAULT_GROUPS);
    setItems(DEFAULT_ITEMS);
    setChecked([]);
  };

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'group') deleteGroup(confirm.id);
    if (confirm.kind === 'clear') clearAll();
    if (confirm.kind === 'restore') restoreDefaults();
    setConfirm(null);
  };

  const leaveEdit = () => {
    setEditMode(false);
    setAdding(null);
    setEditingId(null);
    setEditingGroup(null);
    setNewText('');
    setNewCritical(false);
  };

  /* rgb поруч із color — не дублювання, а необхідність. Токени теми
     це рядки виду var(--edge-ok, #34d399), і приклеїти до них
     прозорість (`${V.color}22`) не можна: виходить невалідний CSS,
     браузер тихо відкидає правило й малює своє. Саме через це тут
     колись зʼявився білий бордер. Для напівпрозорого треба окремий
     rgb-токен і чесна rgba(). */
  const V = {
    go:     { color: T.ok,    rgb: T.okRgb,        icon: ShieldCheck, title: 'Можна заходити',   text: 'Усі пункти закриті. Далі — тільки виконання.' },
    almost: { color: T.info,  rgb: T.infoRgb,      icon: Zap,         title: 'Критичні закриті', text: `Лишилось ${verdict.total - verdict.done} необовʼязкових.` },
    stop:   { color: T.bad,   rgb: T.badRgb,       icon: ShieldAlert, title: 'Ще рано',          text: `Не закрито критичних: ${verdict.criticalsLeft.length}. Саме через них і прилітає мінус.` },
    empty:  { color: T.text3, rgb: '122,122,133',  icon: ShieldAlert, title: 'Чекліст порожній', text: 'Додай пункти, які ти справді перевіряєш.' },
  }[verdict.state];

  const VIcon = V.icon;

  return (
    <div className="relative min-h-full">
      <div className="relative z-10 mx-auto w-[94%] max-w-[1720px] pb-20 pt-5 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Перед входом
            </div>
            <h1
              className="text-[26px] font-bold leading-none sm:text-[32px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              {editMode ? 'Налаштування чекліста' : 'Чекліст'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editMode ? (
              <>
                <Btn icon={FolderPlus} onClick={addGroup}>Блок</Btn>
                <Btn
                  icon={ShieldCheck}
                  onClick={() => setConfirm({
                    kind: 'restore',
                    title: 'Повернути стандартний чекліст?',
                    text: 'Твої блоки й пункти будуть замінені на початковий набір.',
                    cta: 'Повернути',
                  })}
                >
                  Стандартний
                </Btn>
                <Btn
                  icon={Eraser}
                  disabled={!items.length}
                  onClick={() => setConfirm({
                    kind: 'clear',
                    title: 'Очистити чекліст?',
                    text: `Зникнуть усі ${items.length} пунктів. Блоки лишаться порожніми.`,
                    cta: 'Очистити',
                  })}
                >
                  Очистити
                </Btn>
                <Btn icon={Check} tone="acc" onClick={leaveEdit}>Готово</Btn>
              </>
            ) : (
              <>
                <Btn icon={RotateCcw} onClick={reset} disabled={!checked.length}>Скинути</Btn>
                <Btn icon={SlidersHorizontal} onClick={() => setEditMode(true)}>Налаштувати</Btn>
              </>
            )}
          </div>
        </motion.div>

        {/* ─────────── Вердикт ───────────
            Без бордера взагалі. Стан тут і так сказаний тричі —
            кольором заголовка, кільцем і смугою прогресу; обведення
            додавало тільки ще одну лінію на екран. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="sticky top-3 z-20 mb-4"
        >
          <div
            className="relative flex items-center gap-4 overflow-hidden rounded-2xl px-4 py-3.5 sm:px-5"
            style={{
              background: 'rgba(20,20,24,0.94)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 18px 40px -30px rgba(0,0,0,0.9)',
            }}
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={false}
              animate={{ background: `linear-gradient(100deg, rgba(${V.rgb},0.09), transparent 52%)` }}
              transition={{ duration: 0.6, ease: EASE }}
            />

            <div className="relative z-10 flex w-full items-center gap-4">
              <ProgressRing value={verdict.done} total={verdict.total} color={V.color} size={64} />

              <div className="min-w-0 flex-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={verdict.state}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.22, ease: EASE }}
                  >
                    <div className="mb-0.5 flex items-center gap-2">
                      <VIcon size={16} strokeWidth={2.3} className="shrink-0" style={{ color: V.color }} />
                      <span className="truncate text-[17px] font-bold" style={{ fontFamily: T.display, color: V.color, letterSpacing: '-0.01em' }}>
                        {V.title}
                      </span>
                    </div>
                    <p className="truncate text-[13.5px]" style={{ fontFamily: T.sans, color: T.text2 }}>
                      {V.text}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="hidden w-[150px] shrink-0 sm:block">
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
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
                <div className="mt-1 text-right text-[12px] tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {verdict.criticalsLeft.length
                    ? <>критичних лишилось: <Counter value={verdict.criticalsLeft.length} /></>
                    : 'критичні закриті'}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ─────────── Блоки 2×2 ─────────── */}
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          {groups.map((g, gi) => {
            const list = items.filter((i) => i.group === g.id);
            const doneIn = list.filter((i) => checked.includes(i.id)).length;
            const allDone = list.length > 0 && doneIn === list.length;

            return (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: gi * 0.04, ease: EASE }}
              >
                {/* Закритий блок тьмяніє, але лишається на місці — так
                    видно пройдений шлях, і розкладка не смикається під
                    руками. Наведення повертає повну яскравість. */}
                <motion.div
                  className="overflow-hidden rounded-2xl"
                  initial={false}
                  animate={{ opacity: allDone && !editMode ? 0.45 : 1 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  style={{
                    background: T.surface,
                    border: `1px solid ${allDone ? `rgba(${T.okRgb},0.18)` : T.line}`,
                  }}
                >
                  {/* шапка блоку */}
                  <div className="flex items-center gap-3 px-3.5 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                    <motion.span
                      className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-lg text-[12.5px] font-bold tabular-nums"
                      initial={false}
                      animate={{
                        backgroundColor: allDone ? `rgba(${T.okRgb},0.14)` : 'rgba(255,255,255,0.05)',
                        color: allDone ? T.ok : T.text3,
                      }}
                      transition={{ duration: 0.35, ease: EASE }}
                      style={{ fontFamily: T.mono }}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={allDone ? 'done' : 'num'}
                          initial={{ y: 7, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -7, opacity: 0 }}
                          transition={{ duration: 0.18, ease: EASE }}
                          className="flex"
                        >
                          {allDone ? <Check size={13} strokeWidth={3.4} /> : gi + 1}
                        </motion.span>
                      </AnimatePresence>
                    </motion.span>

                    {editingGroup === g.id ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <input
                          autoFocus
                          value={groupDraft.label}
                          onChange={(e) => setGroupDraft((d) => ({ ...d, label: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveGroupEdit();
                            if (e.key === 'Escape') setEditingGroup(null);
                          }}
                          placeholder="Назва"
                          className="h-8 min-w-0 flex-1 rounded-md px-2 text-[15px] font-bold outline-none"
                          style={{ fontFamily: T.display, color: T.text, background: T.sunken, border: `1px solid ${T.lineAcc}` }}
                        />
                        <input
                          value={groupDraft.hint}
                          onChange={(e) => setGroupDraft((d) => ({ ...d, hint: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveGroupEdit();
                            if (e.key === 'Escape') setEditingGroup(null);
                          }}
                          placeholder="Підпис"
                          className="h-8 min-w-0 flex-1 rounded-md px-2 text-[13px] outline-none"
                          style={{ fontFamily: T.sans, color: T.text2, background: T.sunken, border: `1px solid ${T.line}` }}
                        />
                        <button
                          onClick={saveGroupEdit}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                          style={{ background: `rgba(${T.accRgb},0.12)`, border: `1px solid ${T.lineAcc}`, color: T.acc }}
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>
                        <button
                          onClick={() => setEditingGroup(null)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                          style={{ border: `1px solid ${T.line}`, color: T.text3 }}
                        >
                          <X size={14} strokeWidth={2.6} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15.5px] font-bold leading-tight" style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.01em' }}>
                            {g.label}
                          </div>
                          {g.hint && (
                            <div className="truncate text-[12.5px] leading-tight" style={{ fontFamily: T.sans, color: T.text3 }}>{g.hint}</div>
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
                          <span className="text-[12px]" style={{ color: T.text3 }}>/{list.length}</span>
                        </span>

                        {editMode && (
                          <span className="flex shrink-0 items-center gap-0.5">
                            <button
                              onClick={() => startGroupEdit(g)}
                              title="Перейменувати блок"
                              className="grid h-8 w-8 place-items-center rounded-md transition-colors duration-200"
                              style={{ color: T.text3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                            >
                              <Pencil size={14} strokeWidth={2.2} />
                            </button>
                            <button
                              onClick={() => setConfirm({
                                kind: 'group',
                                id: g.id,
                                title: `Видалити блок «${g.label}»?`,
                                text: list.length
                                  ? `Разом із ним зникнуть ${list.length} ${list.length === 1 ? 'пункт' : 'пунктів'}.`
                                  : 'Блок порожній.',
                                cta: 'Видалити',
                              })}
                              title="Видалити блок"
                              className="grid h-8 w-8 place-items-center rounded-md transition-colors duration-200"
                              style={{ color: T.text3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                            >
                              <Trash2 size={14} strokeWidth={2.2} />
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* пункти */}
                  <div className="flex flex-col gap-1 p-2.5">
                    {list.length === 0 && adding !== g.id && (
                      <p className="px-1 py-2 text-[13.5px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                        Порожньо.
                      </p>
                    )}

                    <AnimatePresence initial={false} mode="popLayout">
                      {list.map((item) => (
                        <Item
                          key={item.id}
                          item={item}
                          checked={checked.includes(item.id)}
                          editMode={editMode}
                          editing={editingId === item.id}
                          focused={active === item.id}
                          onToggle={strike}
                          onStartEdit={startEdit}
                          onSaveEdit={saveEdit}
                          onCancelEdit={() => setEditingId(null)}
                          onDelete={removeItem}
                          editText={editText}
                          setEditText={setEditText}
                        />
                      ))}
                    </AnimatePresence>

                    {editMode && (adding === g.id ? (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="rounded-lg p-1.5"
                        style={{ background: T.sunken, border: `1px solid ${T.lineAcc}` }}
                      >
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
                          className="h-8 w-full bg-transparent px-1.5 text-[15px] outline-none"
                          style={{ fontFamily: T.sans, color: T.text }}
                        />
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            onClick={() => setNewCritical((v) => !v)}
                            title="Без цього пункту не заходити"
                            className="flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-semibold transition-colors duration-200"
                            style={{
                              fontFamily: T.sans,
                              color: newCritical ? T.warn : T.text3,
                              background: newCritical ? `rgba(${T.warnRgb},0.10)` : 'transparent',
                              border: `1px solid ${newCritical ? `rgba(${T.warnRgb},0.28)` : T.line}`,
                            }}
                          >
                            <ShieldAlert size={13} strokeWidth={2.3} />
                            критичний
                          </button>
                          <button
                            onClick={() => addItem(g.id)}
                            disabled={!newText.trim()}
                            title="Додати (Enter)"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-transform duration-200 active:scale-95"
                            style={{
                              background: newText.trim() ? `rgba(${T.accRgb},0.14)` : 'transparent',
                              border: `1px solid ${newText.trim() ? T.lineAcc : T.line}`,
                              color: newText.trim() ? T.acc : T.text3,
                              cursor: newText.trim() ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <Check size={14} strokeWidth={3} />
                          </button>
                          <button
                            onClick={() => { setAdding(null); setNewText(''); setNewCritical(false); }}
                            title="Скасувати (Esc)"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
                            style={{ color: T.text3, border: `1px solid ${T.line}` }}
                          >
                            <X size={14} strokeWidth={2.6} />
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <button
                        onClick={() => { setAdding(g.id); setNewText(''); }}
                        className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] font-semibold transition-colors duration-200"
                        style={{ fontFamily: T.sans, color: T.text3, border: `1px dashed ${T.line}` }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
                      >
                        <Plus size={13} strokeWidth={2.6} />
                        Пункт
                      </button>
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>

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
              <p className="mb-6 text-[14px]" style={{ fontFamily: T.sans, color: T.text2, lineHeight: 1.65 }}>
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
    </div>
  );
}
