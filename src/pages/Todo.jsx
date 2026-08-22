import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ListTodo, LayoutGrid, CalendarDays, Timer, ChevronDown, CheckCircle2,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  KEYS, SEED_TASKS, DEFAULT_SETTINGS, newId,
  normalizeTasks, normalizeSessions, normalizeSettings,
  today, addDays, isOverdue, todayPomodoros, dayKey,
} from '../lib/todoData';
import useCloudState from '../hooks/useCloudState';
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
      { id: newId(), text, done: false, doneAt: null, createdAt: today(), due, dueTime, quadrant, pomodoros: 0, note: '' },
      ...s,
    ]);

  const editTask = (id, patch) => setTasks((s) => s.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const toggleTask = (id) =>
    setTasks((s) => s.map((t) => (t.id === id
      ? { ...t, done: !t.done, doneAt: !t.done ? today() : null }
      : t)));

  const completeTask = (id) =>
    setTasks((s) => s.map((t) => (t.id === id ? { ...t, done: true, doneAt: today() } : t)));

  const deleteTask = (id) => setTasks((s) => s.filter((t) => t.id !== id));

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

  const groups = useMemo(() => {
    const active = tasks.filter((t) => !t.done);
    const t0 = today();
    const t1 = addDays(t0, 1);

    const overdue = active.filter((t) => isOverdue(t));
    const rest = active.filter((t) => !isOverdue(t));
    const byTime = (a, b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');

    return [
      { id: 'overdue',  label: 'Прострочене', color: T.bad,   list: [...overdue].sort(byTime) },
      { id: 'today',    label: 'Сьогодні',    color: T.acc,   list: rest.filter((t) => t.due === t0).sort(byTime) },
      { id: 'tomorrow', label: 'Завтра',      color: T.text2, list: rest.filter((t) => t.due === t1).sort(byTime) },
      { id: 'later',    label: 'Пізніше',     color: T.text3, list: rest.filter((t) => t.due && t.due > t1).sort((a, b) => a.due.localeCompare(b.due)) },
      { id: 'someday',  label: 'Колись',      color: T.text4, list: rest.filter((t) => !t.due) },
    ].filter((g) => g.list.length);
  }, [tasks]);

  const doneList = useMemo(
    () => tasks.filter((t) => t.done).sort((a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || ''))),
    [tasks],
  );

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
              className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
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

            {/* помодоро */}
            <button
              onClick={() => openPomodoro(null)}
              className="group inline-flex h-[42px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
              style={{
                background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
            >
              <Timer size={16} strokeWidth={2.6} className="shrink-0 transition-transform duration-300 group-hover:rotate-12" />
              Помодоро
              {stats.pomo > 0 && (
                <span className="rounded-md px-1.5 text-[12.5px] tabular-nums" style={{ background: 'rgba(10,10,12,0.14)' }}>
                  {stats.pomo}
                </span>
              )}
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
              <div className="flex flex-col gap-4">
                <TaskComposer onAdd={addTask} />

                {groups.length === 0 && doneList.length === 0 && (
                  <div className="flex flex-col items-center px-5 py-20 text-center">
                    <div className="mb-6 grid h-16 w-16 place-items-center rounded-2xl" style={{ border: `1px dashed ${T.lineHi}`, color: T.text3 }}>
                      <ListTodo size={24} strokeWidth={1.7} />
                    </div>
                    <div className="mb-2.5 text-[21px] font-bold" style={{ fontFamily: T.display, color: T.text }}>Порожньо</div>
                    <p className="max-w-[420px] text-[14.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.7 }}>
                      Запиши перше завдання вгорі. Дедлайн і квадрант можна поставити одразу — або потім у матриці.
                    </p>
                  </div>
                )}

                {groups.map((g, gi) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: gi * 0.04, ease: EASE }}
                  >
                    <SoftCard lift={0} className="overflow-hidden">
                      <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: `1px solid ${T.line}` }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: g.color }} />
                        <span
                          className="text-[13.5px] font-bold uppercase tracking-[0.12em]"
                          style={{ fontFamily: T.sans, color: g.id === 'overdue' ? T.bad : T.text3 }}
                        >
                          {g.label}
                        </span>
                        <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>{g.list.length}</span>
                      </div>

                      <div className="flex flex-col gap-2 p-3">
                        <AnimatePresence initial={false} mode="popLayout">
                          {g.list.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              onToggle={toggleTask}
                              onEdit={editTask}
                              onDelete={deleteTask}
                              onFocus={openPomodoro}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </SoftCard>
                  </motion.div>
                ))}

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
                          <div className="flex flex-col gap-1 pt-2">
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
              </div>
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
