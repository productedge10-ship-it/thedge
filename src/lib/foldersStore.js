import { supabase } from './supabase';
import { CAT_COLORS } from './noteTags';

/* ==================================================================
   Папки нотаток.

   Папка — це полиця, а не властивість запису. Тому вона живе окремою
   таблицею, а не полем-рядком у нотатці: полицю перейменовують і
   перефарбовують, і робити це в сотні рядків одночасно було б і
   повільно, і ненадійно.

   Порядок задає людина перетягуванням, тому `position` тут значуще
   поле, а не декорація. Нумеруємо цілими з нуля і перенумеровуємо
   весь список: папок десятки, а не тисячі, і один короткий запит
   простіший за логіку вставки між дробовими значеннями.
================================================================== */

export const FOLDER_COLORS = CAT_COLORS;

export const NO_FOLDER = '__none__';
export const ALL_NOTES = '__all__';

/* ------------------------------------------------------------------
   Стартовий набір.

   Порожній записник — це не «чистий аркуш», це питання «а що сюди
   взагалі пишуть». Людина, яка вперше відкрила журнал, ще не знає
   відповіді, і найчастіше просто закриває вкладку.

   Тому папки заводяться самі, і назви в них не про організацію
   файлів, а про те, що трейдер справді пише. Порядок — від того,
   що пишеться щодня, до того, що раз на місяць:

   Спостереження — сире, з ринку: «золото знову зняло азійський хай»
   Правила       — свій звід, який дописується після кожної помилки
   Розбори       — по угоді або по тижню, коли вже є що розбирати
   Ідеї          — гіпотези до перевірки в бектесті
   Інше          — щоб не було спокуси зробити з першої-ліпшої думки
                   нову папку

   Це не структура «як правильно», а стартова точка: перейменувати,
   перефарбувати й видалити можна кожну.
------------------------------------------------------------------ */
export const DEFAULT_FOLDERS = [
  { name: 'Спостереження', color: FOLDER_COLORS[0] },
  { name: 'Правила',       color: FOLDER_COLORS[2] },
  { name: 'Розбори',       color: FOLDER_COLORS[1] },
  { name: 'Ідеї',          color: FOLDER_COLORS[3] },
  { name: 'Інше',          color: FOLDER_COLORS[7] },
];

/* Схема на базі може відставати від коду: закріплення папок
   приїхало окремою міграцією, і поки її не виконали, колонки
   `pinned` просто немає.

   Розпізнати цей випадок треба двома способами, бо відповідають на
   нього два різні шари. Postgres кидає 42703 (undefined_column), а
   PostgREST часто не доходить до бази взагалі: він тримає власний
   кеш схеми і відсікає запит своїм PGRST204 з текстом про
   schema cache. Ловити тільки перше — і найчастіший випадок
   проходить повз. */
const isMissingColumn = (error, column) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = `${error.message || ''} ${error.details || ''}`;
  return msg.includes(column) && /schema cache|does not exist/i.test(msg);
};

/* Рядок без id нікуди не годиться: ані як ключ, ані як адреса для
   оновлення. Той самий id двічі — теж збій, а не дві папки. */
const clean = (rows) => {
  const seen = new Set();
  return (rows || []).filter((r) => {
    if (!r || r.id == null || r.id === '' || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
};

const toApp = (row) => ({
  id: row.id,
  name: row.name || 'Без назви',
  color: row.color || FOLDER_COLORS[0],
  position: typeof row.position === 'number' ? row.position : 0,
  pinned: !!row.pinned,
  /* Емодзі-іконка. Порожній рядок означає «звичайна», і це не те
     саме, що «ще не вибрали»: людина може свідомо її прибрати. */
  icon: typeof row.icon === 'string' ? row.icon : '',
});

/* Закріплені йдуть першими вже з бази, щоб порядок не залежав від
   того, встиг клієнт відсортувати чи ні.

   Другий запит — не перестраховка, а наслідок того, як тут живуть
   міграції: закріплення приїхало окремим файлом, і на базі, де його
   ще не виконали, колонки `pinned` просто немає. Один запит з нею
   падає цілком — і сторінка отримувала порожній список замість усіх
   папок, тобто нова дрібна можливість зносила стару робочу.
   Тому при промаху по колонці перечитуємо без неї. */
export async function fetchFolders(userId) {
  const { data, error } = await supabase
    .from('note_folders')
    .select(COLS)
    .eq('user_id', userId)
    .order('pinned', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (!error) return clean(data).map(toApp);

  /* Спершу пробуємо без іконки: вона приїхала останньою міграцією і
     її бракує найчастіше. */
  if (isMissingColumn(error, 'icon')) {
    const noIcon = await supabase
      .from('note_folders')
      .select(COLS_NO_ICON)
      .eq('user_id', userId)
      .order('pinned', { ascending: false })
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!noIcon.error) return clean(noIcon.data).map(toApp);
    if (!isMissingColumn(noIcon.error, 'pinned')) throw noIcon.error;
  } else if (!isMissingColumn(error, 'pinned')) {
    /* Будь-яка інша помилка це вже не «схема відстала», і мовчки
       ковтати її не можна. */
    throw error;
  }

  const fallback = await supabase
    .from('note_folders')
    .select(COLS_NO_PIN)
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (fallback.error) throw fallback.error;
  return clean(fallback.data).map(toApp);
}

/* Колонки перелічуємо явно, але `pinned` серед них може ще не
   існувати — тоді впав би і сам запит, і створення папки разом з
   ним. Тому список полів у читанні після вставки той самий, що й у
   fetchFolders, з тим самим відступом на відсталу схему. */
const COLS = 'id, name, color, position, pinned, icon';
const COLS_NO_PIN = 'id, name, color, position';
const COLS_NO_ICON = 'id, name, color, position, pinned';

export async function createFolder(userId, { name, color, position, pinned, icon }) {
  const base = {
    user_id: userId,
    name: (name || '').trim() || 'Нова папка',
    color: color || FOLDER_COLORS[0],
    position: position ?? 0,
  };

  /* Пробуємо від найповнішого набору до найбіднішого: краще завести
     папку без іконки, ніж не завести взагалі через колонку, якої на
     цій базі ще немає. */
  const tries = [
    { row: { ...base, pinned: !!pinned, icon: icon || '' }, cols: COLS },
    { row: { ...base, pinned: !!pinned }, cols: COLS_NO_ICON },
    { row: base, cols: COLS_NO_PIN },
  ];

  let last = null;
  for (const t of tries) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase.from('note_folders').insert([t.row]).select(t.cols).single();
    if (!error) return toApp(data);
    if (!isMissingColumn(error, 'icon') && !isMissingColumn(error, 'pinned')) throw error;
    last = error;
  }
  throw last;
}

/* Стартовий набір заводиться рівно один раз — і ознакою цього є не
   прапорець десь у налаштуваннях, а сама відсутність папок. Якщо
   людина свідомо видалила всі до одної, повертати їх при наступному
   вході було б нав'язуванням; тому викликати це має сторінка тільки
   тоді, коли записник відкривається вперше (папок немає І нотаток
   теж немає). */
export async function createDefaultFolders(userId) {
  const rows = DEFAULT_FOLDERS.map((f, i) => ({
    user_id: userId,
    name: f.name,
    color: f.color,
    position: i,
  }));

  const { data, error } = await supabase
    .from('note_folders').insert(rows).select(COLS);

  if (!error) return (data || []).map(toApp);
  if (!isMissingColumn(error, 'pinned')) throw error;

  const second = await supabase
    .from('note_folders').insert(rows).select(COLS_NO_PIN);

  if (second.error) throw second.error;
  return (second.data || []).map(toApp);
}

export async function updateFolder(userId, id, patch) {
  const build = (level) => {
    const row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = (patch.name || '').trim() || 'Без назви';
    if (patch.color !== undefined) row.color = patch.color;
    if (level >= 1 && patch.pinned !== undefined) row.pinned = !!patch.pinned;
    if (level >= 2 && patch.icon !== undefined) row.icon = patch.icon || '';
    return row;
  };

  const push = (level) => supabase
    .from('note_folders')
    .update(build(level))
    .eq('id', id)
    .eq('user_id', userId);

  /* Перейменування й колір мають доїхати навіть на базі, де іконок
     чи закріплення ще немає: втратити нову назву через невиконану
     міграцію чужої можливості — гірше, ніж не зберегти емодзі. */
  const first = await push(2);
  if (!first.error) return;
  if (!isMissingColumn(first.error, 'icon') && !isMissingColumn(first.error, 'pinned')) throw first.error;

  const second = await push(1);
  if (!second.error) return;
  if (!isMissingColumn(second.error, 'pinned')) throw second.error;

  const third = await push(0);
  if (third.error) throw third.error;
}

/* Нотатки не чіпаємо: за них відповідає on delete set null у схемі,
   і вони поїдуть у «Без папки» самі. Видалення полиці не має бути
   способом випадково стерти написане. */
export async function removeFolder(userId, id) {
  const { error } = await supabase
    .from('note_folders')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

/* Приймаємо вже впорядкований список і розставляємо позиції за
   індексом. Пишемо всі рядки одним upsert — інакше при перетягуванні
   через півсписку летіло б десять окремих запитів. */
export async function reorderFolders(userId, ordered) {
  /* Тільки UPDATE, і тільки по існуючому id.

     Раніше тут був один `upsert` на весь список. Коротший запит, але
     вставка в ньому теж дозволена: варто конфлікту по `id` не
     спрацювати — і замість оновлення позицій база заводила стільки
     нових папок, скільки їх було. Саме тому перетягування створювало
     «Нову папку» з нізвідки.

     Оновлень десяток, вони йдуть паралельно, і жодне з них не вміє
     створити рядок — а це головне. */
  const list = (ordered || []).filter((f) => f && f.id);
  if (!list.length) return;

  const patch = (i, withPin, f) => ({
    position: i,
    updated_at: new Date().toISOString(),
    ...(withPin ? { pinned: !!f.pinned } : null),
  });

  const push = (withPin) => Promise.all(list.map((f, i) => supabase
    .from('note_folders')
    .update(patch(i, withPin, f))
    .eq('id', f.id)
    .eq('user_id', userId)));

  const first = await push(true);
  const bad = first.find((r) => r.error)?.error;
  if (!bad) return;

  /* Відстала схема без колонки `pinned`: порядок має зберегтись і
     там. */
  if (!isMissingColumn(bad, 'pinned')) throw bad;

  const second = await push(false);
  const worse = second.find((r) => r.error)?.error;
  if (worse) throw worse;
}
