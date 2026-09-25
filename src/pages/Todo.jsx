import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListTodo, LayoutGrid, CalendarDays, Timer, ChevronDown, CheckCircle2, Keyboard, Heart,
} from 'lucide-react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor,
  closestCorners, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  KEYS, SEED_TASKS, DEFAULT_SETTINGS, newId,
  normalizeTasks, normalizeSessions, normalizeSettings,
  today, addDays, isOverdue, todayPomodoros, dayKey, relativeDay,
} from '../lib/todoData';
import useCloudState from '../hooks/useCloudState';
import { syncTodoAlert, dropTodoAlert, telegramLinked } from '../lib/todoTgAlerts';
import { notify } from '../utils/notify';
import { SoftCard } from '../components/ui/Hovers';
import TaskRow from '../components/todo/TaskRow';
import TaskComposer from '../components/todo/TaskComposer';
import EisenhowerMatrix from '../components/todo/EisenhowerMatrix';
import CalendarBoard from '../components/todo/CalendarBoard';
import PomodoroScreen from '../components/todo/PomodoroScreen';

/* ==================================================================
   Завдання.
   Три погляди на одні й ті самі дані: список (що робити зараз),
   матриця (що з цього взагалі варте часу) і календар (як день
   виглядав насправді). Помодоро — окремий режим на весь екран.
================================================================== */

const VIEWS = [
  { id: 'list',     label: 'Список',   icon: ListTodo },
  { id: 'matrix',   label: 'Матриця',  icon: LayoutGrid },
  { id: 'calendar', label: 'Календар', icon: CalendarDays },
];

export default function Todo() {
  useEdgeFonts();

  /* Усе живе в базі під ключем: завдання, помодоро, налаштування
     таймера. На цьому пристрої лишається лише дзеркало для швидкого
     старту, а те, що було в localStorage до переїзду, переноситься. */
  const [tasks, setTasks] = useCloudState('todo_tasks', SEED_TASKS, {
    legacyKey: KEYS.tasks, normalize: normalizeTasks,
  });
  const [sessions, setSessions] = useCloudState('todo_sessions', [], {
    legacyKey: KEYS.sessions, normalize: normalizeSessions,
  });
  const [settings, setSettings] = useCloudState('todo_settings', DEFAULT_SETTINGS, {
    legacyKey: KEYS.settings, normalize: normalizeSettings,
  });
  const [view, setView] = useState('list');
  const [focusTask, setFocusTask] = useState(null);
  const [pomoOpen, setPomoOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  /* ---------- дії над завданнями ---------- */

  const addTask = ({ text, due, dueTime, quadrant }) =>
    setTasks((s) => [
      { id: newId(), text, done: false, doneAt: null, createdAt: today(), due, dueTime, quadrant, pomodoros: 0, note: '', remind: false },
      ...s,
    ]);

  /* ---------- нагадування в Telegram ----------

     Черга `tg_alerts` живе в базі, а не в цій вкладці, тому запис
     робиться поруч зі зміною завдання, а не замість неї: завдання
     має зберегтись навіть тоді, коли мережа підвела саме нагадування.

     Переставили годину — рядок у черзі перезаписується сам (унікальний
     індекс по (user_id, source, source_id)). Зняли годину, відмітили
     виконаним, видалили — рядок прибирається: нагадування про те, що
     вже зроблено, дратує сильніше, ніж відсутнє. */
  const queueRemind = (next, prev) => {
    const wasOn = !!prev?.remind;
    const isOn = !!next?.remind;
    if (!wasOn && !isOn) return;

    syncTodoAlert(next)
      .then(async (queued) => {
        if (queued && !wasOn) {
          const linked = await telegramLinked();
          notify.success(
            'Нагадаємо',
            linked
              ? `${relativeDay(next.due)} о ${next.dueTime} — повідомлення прилетить у Telegram.`
              : 'Лишилось підключити Telegram у налаштуваннях — інакше повідомленню нікуди йти.',
          );
        } else if (!queued && wasOn) {
          notify.success('Нагадування знято', 'Більше нічого про це завдання не прийде.');
        }
      })
      .catch(() => {});
  };

  const editTask = (id, patch) => {
    const prev = tasks.find((t) => t.id === id);
    setTasks((s) => s.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (prev) queueRemind({ ...prev, ...patch }, prev);
  };

  const toggleTask = (id) => {
    const prev = tasks.find((t) => t.id === id);
    setTasks((s) => s.map((t) => (t.id === id
      ? { ...t, done: !t.done, doneAt: !t.done ? today() : null }
      : t)));

    /* Виконане нагадувати нема сенсу. Знімаємо тихо, без тосту:
       людина щойно закрила завдання, і підтвердження про побічний
       ефект тут читалось би як «щось пішло не так». */
    if (prev && prev.remind && !prev.done) dropTodoAlert(id).catch(() => {});
    if (prev && prev.remind && prev.done) syncTodoAlert({ ...prev, done: false }).catch(() => {});
  };

  const completeTask = (id) =>
    setTasks((s) => s.map((t) => (t.id === id ? { ...t, done: true, doneAt: today() } : t)));

  const deleteTask = (id) => {
    setTasks((s) => s.filter((t) => t.id !== id));
    dropTodoAlert(id).catch(() => {});
  };

  const moveTask = (id, quadrant) => editTask(id, { quadrant });

  /* ---------- помодоро ---------- */

  const openPomodoro = (task = null) => {
    setFocusTask(task);
    setPomoOpen(true);
  };

  const onSessionDone = ({ mode, minutes, taskId }) => {
    setSessions((s) => [...s, {
      id: `s${Date.now()}`, mode, minutes, taskId,
      day: dayKey(new Date()), at: new Date().toISOString(),
    }]);
    if (mode === 'focus' && taskId) {
      setTasks((s) => s.map((t) => (t.id === taskId ? { ...t, pomodoros: (t.pomodoros || 0) + 1 } : t)));
    }
  };

  /* завдання в таймері має жити: лічильник помодоро росте на очах */
  const liveFocusTask = useMemo(
    () => (focusTask ? tasks.find((t) => t.id === focusTask.id) || focusTask : null),
    [focusTask, tasks],
  );

  /* ---------- групи списку ---------- */

  /* Групи в порядку самого списку, а не за часом.

     Сортування за дедлайном сперечалося б із перетягуванням: людина
     ставить завдання на друге місце, а список тут-таки повертає його
     назад «бо о 14:00 пізніше». Порядок тепер тримає рука, а час
     лишається підписом на рядку. */
  const groups = useMemo(() => {
    const active = tasks.filter((t) => !t.done);
    const t0 = today();
    const t1 = addDays(t0, 1);

    const late = active.filter((t) => isOverdue(t));
    const rest = active.filter((t) => !isOverdue(t));

    return {
      overdue:  { id: 'overdue',  label: 'Прострочене', color: T.bad,   list: late },
      today:    { id: 'today',    label: 'Сьогодні',    color: T.acc,   list: rest.filter((t) => t.due === t0) },
      tomorrow: { id: 'tomorrow', label: 'Завтра',      color: T.text2, list: rest.filter((t) => t.due === t1) },
      later:    { id: 'later',    label: 'Пізніше',     color: T.text3, list: rest.filter((t) => t.due && t.due > t1) },
      someday:  { id: 'someday',  label: 'Колись',      color: T.text4, list: rest.filter((t) => !t.due) },
    };
  }, [tasks]);

  /* Плаский порядок обходу для клавіатури — рівно той, у якому
     завдання стоять на екрані: спершу ліва колонка, потім права. */
  const flat = useMemo(
    () => ['overdue', 'today', 'tomorrow', 'later', 'someday'].flatMap((k) => groups[k].list),
    [groups],
  );

  const anyActive = flat.length > 0;

  const doneList = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))),
    [tasks],
  );

  /* ---------- клавіатура ----------

     Список завдань проходять швидше за все з клавіатури: стрілки —
     курсор, пробіл — відмітити, t/m — перекинути на сьогодні чи
     завтра, n — нове завдання. Миша лишається, але вже не обовʼязкова.

     Курсор живе по id, а не по індексу: індекс з'їжджає, щойно
     завдання відмічене й пішло зі списку. */
  const [cursor, setCursor] = useState(null);
  const composerRef = useRef(null);

  const move = useCallback((step) => {
    if (!flat.length) return;
    const i = flat.findIndex((t) => t.id === cursor);
    const next = i < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, i + step));
    setCursor(flat[next].id);
  }, [flat, cursor]);

  useEffect(() => {
    const onKey = (e) => {
      /* У полі вводу клавіші належать полю. Тільки Escape забирає
         з нього фокус — інакше з композера не вийти без миші. */
      const tag = e.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable;
      if (typing) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const cur = flat.find((t) => t.id === cursor);

      /* Літери беремо з e.code, а не з e.key: на українській розкладці
         фізична M дає «ь», T — «е», і за символом жодна буквена
         клавіша не спрацьовувала б. Стрілки й пробіл однакові скрізь,
         тому вони лишаються по e.key. */
      const code = e.code;

      if (e.key === 'ArrowDown' || code === 'KeyJ') { e.preventDefault(); move(1); return; }
      if (e.key === 'ArrowUp' || code === 'KeyK') { e.preventDefault(); move(-1); return; }
      if (e.key === 'Escape') { setCursor(null); return; }
      if (code === 'KeyN') { e.preventDefault(); composerRef.current?.focus(); return; }

      /* Далі — дії над завданням під курсором. Якщо курсора ще немає,
         беремо перше завдання: інакше перше ж натискання «на завтра»
         мовчки нічого не робить, і клавіші здаються зламаними. */
      const target = cur || flat[0];
      if (!target) return;

      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setCursor(target.id); toggleTask(target.id); return; }
      if (code === 'KeyT') { e.preventDefault(); setCursor(target.id); editTask(target.id, { due: today() }); return; }
      if (code === 'KeyM') { e.preventDefault(); setCursor(target.id); editTask(target.id, { due: addDays(today(), 1) }); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteTask(target.id); setCursor(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, cursor, move]);

  /* ---------- перетягування ----------

     Тягнути можна між групами — і це, власне, головне: перекинути
     завдання із «Колись» у «Сьогодні» рухом, а не через попап з
     календарем. Група-приймач сама каже, яку дату поставити. */
  const [dragId, setDragId] = useState(null);
  const sensors = useSensors(
    /* 6 пікселів люфту: без них будь-який клік по рядку рахувався б
       за початок перетягування, і завдання переставало відмічатись. */
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dueForGroup = (id, task) => {
    const t0 = today();
    switch (id) {
      case 'today': case 'overdue': return t0;
      case 'tomorrow': return addDays(t0, 1);
      /* «Пізніше» — будь-який день після завтра. Якщо завдання вже
         там, дату не чіпаємо: людина рухала порядок, а не строк. */
      case 'later': return task.due && task.due > addDays(t0, 1) ? task.due : addDays(t0, 2);
      case 'someday': return null;
      default: return task.due;
    }
  };

  const groupOf = (id) => ['overdue', 'today', 'tomorrow', 'later', 'someday']
    .find((k) => groups[k].list.some((t) => t.id === id));

  const onDragEnd = ({ active, over }) => {
    setDragId(null);
    if (!over) return;

    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    /* Кинути можна і на саму групу (її порожнє тіло), і на сусіднє
       завдання — тому ціль шукаємо в обох виглядах. */
    const target = String(over.id).startsWith('group:')
      ? String(over.id).slice(6)
      : groupOf(over.id);
    if (!target) return;

    const from = groupOf(active.id);
    const nextDue = dueForGroup(target, task);

    setTasks((list) => {
      let out = list;

      if (from !== target || (task.due || null) !== nextDue) {
        out = out.map((t) => (t.id === task.id ? { ...t, due: nextDue } : t));
      }

      /* Порядок міняємо лише всередині однієї групи: при переїзді в
         іншу завдання стає першим — саме там його й шукатимуть. */
      if (active.id !== over.id && !String(over.id).startsWith('group:')) {
        const oldI = out.findIndex((t) => t.id === active.id);
        const newI = out.findIndex((t) => t.id === over.id);
        if (oldI >= 0 && newI >= 0) out = arrayMove(out, oldI, newI);
      }
      return out;
    });
  };

  const dragTask = dragId ? tasks.find((t) => t.id === dragId) : null;

  const stats = useMemo(() => {
    const active = tasks.filter((t) => !t.done);
    return {
      active: active.length,
      todayLeft: active.filter((t) => t.due === today()).length,
      overdue: active.filter((t) => isOverdue(t)).length,
      pomo: todayPomodoros(sessions),
    };
  }, [tasks, sessions]);

  /* ================================================================ */

  return (
    <div className="relative min-h-full">

      <div className="relative z-10 mx-auto w-full max-w-[1500px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-32 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Завдання
            </div>
            <h1
              className="edge-page-title"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              План дня
            </h1>
            <p className="mt-3 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {stats.active} активних
              {stats.todayLeft > 0 && <> · {stats.todayLeft} на сьогодні</>}
              {stats.overdue > 0 && <> · <span style={{ color: T.bad }}>{stats.overdue} прострочено</span></>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* перемикач видів */}
            <div className="flex h-[42px] items-center gap-1 rounded-xl p-1" style={{ background: T.surface, border: `1px solid ${T.line}` }}>
              {VIEWS.map((v) => {
                const on = view === v.id;
                const Icon = v.icon;
                return (
                  <button
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className="relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-semibold transition-colors duration-200"
                    style={{ fontFamily: T.sans, color: on ? T.text : T.text3, zIndex: 1 }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = T.text2; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = T.text3; }}
                  >
                    {on && (
                      <motion.span
                        layoutId="todo-view"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute inset-0 rounded-lg"
                        style={{ background: `rgba(${T.accRgb},0.12)`, zIndex: -1 }}
                      />
                    )}
                    <Icon size={15} strokeWidth={2.2} style={{ color: on ? T.acc : T.text4 }} />
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                );
              })}
            </div>

            {/* помодоро — та сама база, що в «Новий бектест» і «Нова
                папка»: темний градієнт, лавандова рамка, світіння
                знизу. Ховер — «пульс»: годинник згортається в серце,
                що б'ється, а фон промальовує ЕКГ (уся анімація —
                `.pomodoro-cta*` в index.css, тут лише розмітка). */}
            <button
              type="button"
              onClick={() => openPomodoro(null)}
              className="pomodoro-cta inline-flex h-[42px] shrink-0 items-center justify-center gap-2.5 rounded-2xl px-6 text-[14.5px] font-bold"
              style={{
                background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
                border: '1px solid rgba(139,123,255,0.5)',
                color: '#fff',
                fontFamily: T.sans,
                boxShadow: '0 10px 28px -12px rgba(139,123,255,0.4)',
              }}
            >
              <span className="pomodoro-cta-ecg" aria-hidden="true">
                <svg viewBox="0 0 176 54" preserveAspectRatio="none">
                  <path className="pomodoro-cta-ecg-line" d="M 0 27 L 19 27 L 24 22 L 28 27 L 33 9 L 38 43 L 43 16 L 48 30 L 52 27 L 72 27 L 77 22 L 81 27 L 86 11 L 91 40 L 96 18 L 101 27 L 132 27 C 148 27, 160 27, 176 27" />
                  <path className="pomodoro-cta-ecg-beam" d="M 0 27 L 19 27 L 24 22 L 28 27 L 33 9 L 38 43 L 43 16 L 48 30 L 52 27 L 72 27 L 77 22 L 81 27 L 86 11 L 91 40 L 96 18 L 101 27 L 132 27 C 148 27, 160 27, 176 27" />
                </svg>
              </span>

              <span className="pomodoro-cta-icon" aria-hidden="true">
                <Timer size={16} strokeWidth={2.6} className="pomodoro-cta-timer" style={{ color: 'var(--edge-acc, #8b7bff)' }} />
                <Heart size={16} className="pomodoro-cta-heart" fill="#ef4444" stroke="none" />
              </span>

              {/* Бейдж 25/5 не додає власного місця в рядку — лежить
                  абсолютно поверх напису й лише зʼявляється замість
                  нього, тому кнопка не ширшає на ховері. */}
              <span className="pomodoro-cta-textstage">
                <span className="pomodoro-cta-label whitespace-nowrap">Помодоро</span>
                <span className="pomodoro-cta-badge" aria-hidden="true">
                  <span className="pomodoro-cta-badge-inner">
                    <b>25</b><i>/</i>5<small>хв</small>
                  </span>
                </span>
              </span>

              {stats.pomo > 0 && (
                <span
                  className="pomodoro-cta-count rounded-md px-1.5 text-[12.5px] tabular-nums"
                  style={{ background: 'rgba(139,123,255,0.16)', border: '1px solid rgba(139,123,255,0.3)', color: '#c7d2fe' }}
                >
                  {stats.pomo}
                </span>
              )}

              <span className="pomodoro-cta-glimmer" aria-hidden="true" />
            </button>
          </div>
        </motion.div>

        {/* ─────────── Види ─────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            {view === 'list' && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={({ active }) => setDragId(active.id)}
                onDragCancel={() => setDragId(null)}
                onDragEnd={onDragEnd}
              >
                <div className="flex flex-col gap-4">
                  <TaskComposer onAdd={addTask} inputRef={composerRef} />

                  {!anyActive && doneList.length === 0 && (
                    <div className="flex flex-col items-center px-5 py-20 text-center">
                      <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl" style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}>
                        <ListTodo size={24} strokeWidth={1.7} />
                      </div>
                      <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Порожньо</div>
                      <p className="max-w-[420px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                        Запиши перше завдання вгорі — дату можна просто вписати в текст: «здати звіт завтра о 10».
                      </p>
                    </div>
                  )}

                  {/* Дві колонки. Ліва — те, що робиш зараз: прострочене
                      й сьогоднішнє. Права — все, що ще не горить.

                      Одним стовпчиком сторінка виглядала порожньою:
                      три завдання розтягувались на півтори тисячі
                      пікселів ширини, а під ними лишався екран пустоти.
                      Тепер важливе займає більшу половину й читається
                      першим, а решта стоїть поруч, а не під ним. */}
                  {anyActive && (
                    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                      <motion.div layout className="flex min-w-0 flex-col gap-4">
                        <AnimatePresence initial={false}>
                        <GroupCard key="overdue" g={groups.overdue} cursor={cursor} setCursor={setCursor} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} onFocus={openPomodoro} />
                        <GroupCard key="today" g={groups.today} cursor={cursor} setCursor={setCursor} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} onFocus={openPomodoro} always />
                        </AnimatePresence>
                      </motion.div>

                      <motion.div layout className="flex min-w-0 flex-col gap-4">
                        <AnimatePresence initial={false}>
                        <GroupCard key="tomorrow" g={groups.tomorrow} cursor={cursor} setCursor={setCursor} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} onFocus={openPomodoro} always />
                        <GroupCard key="later" g={groups.later} cursor={cursor} setCursor={setCursor} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} onFocus={openPomodoro} />
                        <GroupCard key="someday" g={groups.someday} cursor={cursor} setCursor={setCursor} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} onFocus={openPomodoro} />
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  )}

                  {/* виконане */}
                  {doneList.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowDone((v) => !v)}
                        className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors duration-200"
                        style={{ fontFamily: T.sans, color: T.text4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
                        onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                      >
                        <motion.span animate={{ rotate: showDone ? 0 : -90 }} transition={{ duration: 0.2, ease: EASE }} className="flex">
                          <ChevronDown size={15} strokeWidth={2.4} />
                        </motion.span>
                        <CheckCircle2 size={15} strokeWidth={2.2} style={{ color: T.ok }} />
                        Виконано ({doneList.length})
                      </button>

                      <AnimatePresence initial={false}>
                        {showDone && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.24, ease: EASE }}
                            className="overflow-hidden"
                          >
                            <div className="grid grid-cols-1 gap-1 pt-2 lg:grid-cols-2">
                              {doneList.map((t) => (
                                <TaskRow
                                  key={t.id}
                                  task={t}
                                  onToggle={toggleTask}
                                  onEdit={editTask}
                                  onDelete={deleteTask}
                                />
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Підказка про клавіші — один тихий рядок унизу.
                      Клавіатурний прохід нічого не вартий, якщо про
                      нього ніде не сказано. */}
                  {anyActive && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[12px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                      <Keyboard size={13} strokeWidth={2} />
                      <Key k="↑ ↓" t="курсор" />
                      <Key k="Space" t="відмітити" />
                      <Key k="T" t="на сьогодні" />
                      <Key k="M" t="на завтра" />
                      <Key k="N" t="нове" />
                      <Key k="⌫" t="видалити" />
                    </div>
                  )}
                </div>

                {/* Привид під курсором: без нього рядок зникає з місця
                    й тягнеться порожнеча. */}
                <DragOverlay dropAnimation={null}>
                  {dragTask && (
                    <div className="rounded-xl opacity-95" style={{ background: T.surfaceHi, border: `1px solid ${T.lineAcc}`, boxShadow: '0 24px 60px -20px rgba(0,0,0,0.9)' }}>
                      <TaskRow task={dragTask} onToggle={() => {}} onEdit={() => {}} onDelete={() => {}} compact />
                    </div>
                  )}
                </DragOverlay>
              </DndContext>
            )}

            {view === 'matrix' && (
              <div className="flex flex-col gap-4">
                <TaskComposer onAdd={addTask} />
                <EisenhowerMatrix
                  tasks={tasks}
                  onToggle={toggleTask}
                  onMove={moveTask}
                  onFocus={openPomodoro}
                />
              </div>
            )}

            {view === 'calendar' && (
              <CalendarBoard
                tasks={tasks}
                sessions={sessions}
                onToggle={toggleTask}
                onEdit={editTask}
                onDelete={deleteTask}
                onAdd={addTask}
                onFocus={openPomodoro}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─────────── Помодоро ─────────── */}
      <AnimatePresence>
        {pomoOpen && (
          <PomodoroScreen
            key="pomo"
            task={liveFocusTask}
            settings={settings}
            onSettings={setSettings}
            doneToday={stats.pomo}
            onClose={() => setPomoOpen(false)}
            onSessionDone={onSessionDone}
            onCompleteTask={completeTask}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- підпис клавіші ---------- */
function Key({ k, t }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd
        className="rounded px-1.5 py-0.5 text-[11px] font-bold"
        style={{ fontFamily: T.mono, background: 'rgba(var(--edge-hair-rgb),0.06)', color: T.text3 }}
      >
        {k}
      </kbd>
      {t}
    </span>
  );
}

/* ---------- завдання, яке можна тягнути ---------- */
function SortableRow({ task, cursor, setCursor, ...rest }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onMouseDown={() => setCursor(task.id)}
    >
      <TaskRow
        task={task}
        selected={cursor === task.id}
        onSelect={() => setCursor(task.id)}
        dragging={isDragging}
        dragHandle={{ ...attributes, ...listeners }}
        {...rest}
      />
    </div>
  );
}

/* ---------- одна група ----------

   Приймає перетягування навіть коли порожня: саме порожня група й
   потрібна найчастіше — щоб перекинути в неї перше завдання. Тому
   «Сьогодні» і «Завтра» показуються завжди (`always`), навіть без
   жодного рядка, а решта ховається, поки порожня. */
function GroupCard({ g, cursor, setCursor, always, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id: `group:${g.id}` });
  const ids = useMemo(() => g.list.map((t) => t.id), [g.list]);

  if (!g.list.length && !always) return null;

  return (
    /* layout на самій групі: коли завдання переїжджає, сусідні картки
       не стрибають на нову висоту, а доїжджають до неї. */
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.16 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
    >
      <SoftCard lift={0} className="overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
          <motion.span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: g.color }}
            animate={{ scale: isOver ? 1.8 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          />
          <span
            className="text-[13.5px] font-bold uppercase tracking-[0.12em]"
            style={{ fontFamily: T.sans, color: g.id === 'overdue' ? T.bad : T.text3 }}
          >
            {g.label}
          </span>
          {/* Лічильник міняється стрибком числа — саме тому він
              перемальовується з новим ключем, а не тихо підмінюється. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={g.list.length}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="text-[13px] tabular-nums"
              style={{ fontFamily: T.mono, color: T.text4 }}
            >
              {g.list.length}
            </motion.span>
          </AnimatePresence>
        </div>

        <motion.div
          ref={setNodeRef}
          layout
          className="flex flex-col gap-2 p-3"
          animate={{ backgroundColor: isOver ? `rgba(${T.accRgb},0.07)` : 'rgba(0,0,0,0)' }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <AnimatePresence initial={false} mode="popLayout">
              {g.list.map((t) => (
                <SortableRow key={t.id} task={t} cursor={cursor} setCursor={setCursor} {...rest} />
              ))}
            </AnimatePresence>
          </SortableContext>

          {!g.list.length && (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, borderColor: isOver ? T.lineAcc : T.line, color: isOver ? T.acc : T.text4 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="grid h-[52px] place-items-center rounded-xl text-[13px]"
              style={{ borderWidth: 1, borderStyle: 'dashed', fontFamily: T.sans }}
            >
              перетягни сюди
            </motion.div>
          )}
        </motion.div>
      </SoftCard>
    </motion.div>
  );
}
