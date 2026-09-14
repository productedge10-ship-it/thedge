import { useCallback, useEffect, useState } from 'react';

/* Набір блоків плану, які людина може прибрати зі сторінки.
   Приховування — це вибір «мені цей блок не потрібен», а не згортання:
   згорнутий блок усе одно займає місце і рахується в прогрес. Дані
   прихованого блоку не видаляються — повернув блок, і все на місці. */

export const PLAN_BLOCKS = {
  daily: [
    { id: 'tda', phase: 'plan', title: 'Top-down аналіз' },
    { id: 'strategy', phase: 'plan', title: 'Стратегія та точки входу' },
    { id: 'updates', phase: 'live', title: 'Апдейти по ходу сесії' },
    { id: 'review', phase: 'review', title: 'Розбір після сесії' },
    { id: 'diagnostics', phase: 'review', title: 'Діагностика' },
    { id: 'conclusions', phase: 'review', title: 'Висновки' },
  ],
  weekly: [
    { id: 'week-tda', phase: 'plan', title: 'Top-down аналізи' },
    { id: 'week-thesis', phase: 'plan', title: 'Теза тижня' },
    { id: 'week-updates', phase: 'live', title: 'Проміжні перевірки' },
    { id: 'week-outcome', phase: 'review', title: 'Що вийшло по активах' },
    { id: 'week-conclusions', phase: 'review', title: 'Висновки тижня' },
  ],
};

export const PHASE_LABEL = { plan: 'Plan', live: 'Live', review: 'Review' };

const storageKey = (mode) => `edge.plan.hidden.${mode}`;
/* Подія, щоб усі місця, які читають набір (сторінка, рейка, панель),
   оновлювались разом, а не лише той компонент, де клікнули. */
const EVENT = 'edge:plan-blocks';

function read(mode) {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function usePlanBlocks(mode) {
  const [hidden, setHidden] = useState(() => read(mode));

  /* mode на сторінці сталий (денний і тижневий — окремі компоненти),
     тож початкове читання в useState достатньо; ефект лише слухає зміни. */
  useEffect(() => {
    const onChange = (e) => { if (e.detail?.mode === mode) setHidden(read(mode)); };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [mode]);

  const write = useCallback((next) => {
    try { localStorage.setItem(storageKey(mode), JSON.stringify(next)); } catch { /* приватний режим — живе до перезавантаження */ }
    setHidden(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { mode } }));
  }, [mode]);

  const isVisible = useCallback((id) => !hidden.includes(id), [hidden]);
  const hide = useCallback((id) => write([...new Set([...read(mode), id])]), [mode, write]);
  const show = useCallback((id) => write(read(mode).filter((x) => x !== id)), [mode, write]);
  const toggle = useCallback((id) => (read(mode).includes(id) ? show(id) : hide(id)), [mode, show, hide]);

  const blocks = PLAN_BLOCKS[mode] || [];
  const phaseVisible = useCallback(
    (phase) => blocks.some((b) => b.phase === phase && !hidden.includes(b.id)),
    [blocks, hidden],
  );

  return { hidden, isVisible, hide, show, toggle, phaseVisible, blocks };
}
