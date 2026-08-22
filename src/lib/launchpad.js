/* ==================================================================
   Розкладка Launchpad.

   Розділів у журналі багато, і майже ніхто не користується всіма:
   один живе в планах і аналітиці, другий у бектестах, третій узагалі
   веде тільки нотатки. Показувати всім однакову стіну з чотирнадцяти
   плиток означає, що кожен щоразу шукає свої три очима.

   Тому розкладка належить користувачу: він ховає зайве й ставить
   потрібне вгору. Зберігаємо тільки порядок і список схованих —
   самі плитки лишаються в коді, інакше додати новий розділ означало б
   мігрувати збережені розкладки всіх користувачів.
================================================================== */

/* Порядок за замовчуванням — той самий, у якому розділи відкривають
   протягом дня: підготовка, робота, розбір. */
export const DEFAULT_ORDER = [
  '/plan',
  '/journal',
  '/checklist',
  '/calculator',
  '/system',
  '/todo',
  '/error',
  '/notes',
  '/reviews',
  '/analytics',
  '/analyses',
  '/backtest',
  '/20-trades',
  '/accounts',
];

export const DEFAULT_LAYOUT = { order: DEFAULT_ORDER, hidden: [], sizes: {} };

/* Ширина плитки в колонках. Як з віджетами на телефоні: розмірів
   рівно два, і не кожна плитка вміє обидва — там, де більше місця
   нічим зайняти, тягнути нема сенсу. */
export const SIZES = [1, 2];

/* Приводимо збережене до робочого стану.

   Головне тут — нові розділи. Якщо в коді зʼявилась плитка, якої
   немає в збереженому порядку, вона має додатись, а не зникнути:
   людина оновила застосунок і не побачила нову можливість — це гірше,
   ніж зіпсований порядок. */
export function normalizeLayout(saved, known) {
  const valid = new Set(known);

  const order = Array.isArray(saved?.order)
    ? saved.order.filter((id) => valid.has(id))
    : [];

  /* усе, чого немає в збереженому порядку, стає в кінець */
  known.forEach((id) => { if (!order.includes(id)) order.push(id); });

  const hidden = Array.isArray(saved?.hidden)
    ? saved.hidden.filter((id) => valid.has(id))
    : [];

  /* Зберігаємо тільки те, що людина справді міняла. Розмір за
     замовчуванням лишається в коді: якщо колись передумаємо, яка
     плитка широка, збережені розкладки не доведеться чіпати. */
  const sizes = {};
  if (saved?.sizes && typeof saved.sizes === 'object') {
    Object.entries(saved.sizes).forEach(([id, n]) => {
      if (valid.has(id) && SIZES.includes(n)) sizes[id] = n;
    });
  }

  return { order, hidden, sizes };
}

/* Переставити елемент. Повертає новий масив, бо стан у React
   порівнюється за посиланням. */
export function move(order, from, to) {
  if (from === to || from < 0 || to < 0) return order;
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
