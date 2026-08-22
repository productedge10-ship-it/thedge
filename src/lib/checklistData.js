/* ==================================================================
   Чекліст перед входом.
   Пункти згруповані по тому, в якому порядку трейдер реально
   думає: спершу контекст ринку, потім сам сетап, далі ризик і вже
   наприкінці — власна голова. Критичні пункти позначені окремо:
   без них вердикт не стає зеленим, скільки б інших не було закрито.
================================================================== */

export const DEFAULT_GROUPS = [
  { id: 'context', label: 'Контекст',  hint: 'Що зараз на ринку' },
  { id: 'setup',   label: 'Сетап',     hint: 'Чи є за що заходити' },
  { id: 'risk',    label: 'Ризик',     hint: 'Скільки це коштує' },
  { id: 'head',    label: 'Голова',    hint: 'В якому ти стані' },
];

export const DEFAULT_ITEMS = [
  { id: 1,  group: 'context', critical: false, text: 'Подивився економічний календар — важливих новин найближчу годину немає' },
  { id: 2,  group: 'context', critical: false, text: 'Визначив тренд на старших ТФ (D1, H4)' },
  { id: 3,  group: 'context', critical: false, text: 'Це моя сесія, а не «просто зараз відкритий термінал»' },

  { id: 4,  group: 'setup',   critical: true,  text: 'Ціна в моїй зоні — рівень розмічений заздалегідь' },
  { id: 5,  group: 'setup',   critical: true,  text: 'Є підтвердження на молодшому ТФ, свічка закрилась' },
  { id: 6,  group: 'setup',   critical: false, text: 'Потенціал до цілі мінімум 2R' },
  { id: 7,  group: 'setup',   critical: false, text: 'Цей сетап є в моїй системі, а не «схоже на щось»' },

  { id: 8,  group: 'risk',    critical: true,  text: 'Ризик на угоду не більший за 1%' },
  { id: 9,  group: 'risk',    critical: true,  text: 'Стоп стоїть за структурою, а не «на око»' },
  { id: 10, group: 'risk',    critical: false, text: 'Порахував розмір позиції, а не поставив «як звичайно»' },

  { id: 11, group: 'head',    critical: true,  text: 'Це не відігравання після попереднього стопу' },
  { id: 12, group: 'head',    critical: false, text: 'Не поспішаю — якщо пропущу, буде наступна' },
  { id: 13, group: 'head',    critical: false, text: 'Готовий спокійно прийняти мінус по цій угоді' },
];

export const KEYS = {
  items: 'edge_checklist_items_v2',
  checked: 'edge_checklist_checked_v2',
  groups: 'edge_checklist_groups_v1',
};

/* Блоки теж редагуються користувачем — назва, підпис, порядок,
   видалення. Тому вони живуть у сховищі, а не в коді. */
export function normalizeGroups(parsed) {
  if (!Array.isArray(parsed)) return DEFAULT_GROUPS;
  const list = parsed
    .map((g) => ({ id: String(g.id), label: String(g.label || ''), hint: String(g.hint || '') }))
    .filter((g) => g.id && g.label);
  return list;
}

export function loadGroups() {
  try {
    const raw = localStorage.getItem(KEYS.groups);
    if (!raw) return DEFAULT_GROUPS;
    return normalizeGroups(JSON.parse(raw));
  } catch {
    return DEFAULT_GROUPS;
  }
}

export function normalizeItems(parsed) {
  if (!Array.isArray(parsed)) return DEFAULT_ITEMS;
  return parsed.map((i) => ({
    id: i.id,
    text: String(i.text || ''),
    group: String(i.group || 'setup'),
    critical: !!i.critical,
  })).filter((i) => i.text);
}

export function loadItems() {
  try {
    const raw = localStorage.getItem(KEYS.items);
    if (raw === null) return DEFAULT_ITEMS;
    return normalizeItems(JSON.parse(raw));
  } catch {
    return DEFAULT_ITEMS;
  }
}

export const normalizeChecked = (v) => (Array.isArray(v) ? v : []);

export function loadChecked() {
  try {
    const raw = localStorage.getItem(KEYS.checked);
    return normalizeChecked(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватний режим */ }
};

export const newGroupId = () => `g${Date.now()}`;

/* Вердикт. Зеленим стає тільки коли закриті всі критичні пункти —
   решта показує, наскільки ти взагалі готувався. */
export function verdictOf(items, checkedIds) {
  const total = items.length;
  const done = items.filter((i) => checkedIds.includes(i.id)).length;
  const criticals = items.filter((i) => i.critical);
  const criticalsLeft = criticals.filter((i) => !checkedIds.includes(i.id));

  if (!total) return { state: 'empty', done, total, criticalsLeft };
  if (done === total) return { state: 'go', done, total, criticalsLeft };
  if (criticalsLeft.length === 0) return { state: 'almost', done, total, criticalsLeft };
  return { state: 'stop', done, total, criticalsLeft };
}
