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

const toApp = (row) => ({
  id: row.id,
  name: row.name || 'Без назви',
  color: row.color || FOLDER_COLORS[0],
  position: typeof row.position === 'number' ? row.position : 0,
  pinned: !!row.pinned,
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
    .select('id, name, color, position, pinned')
    .eq('user_id', userId)
    .order('pinned', { ascending: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (!error) return (data || []).map(toApp);

  /* Будь-яка інша помилка це вже не «схема відстала», і мовчки
     ковтати її не можна. */
  if (!isMissingColumn(error, 'pinned')) throw error;

  const fallback = await supabase
    .from('note_folders')
    .select('id, name, color, position')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (fallback.error) throw fallback.error;
  return (fallback.data || []).map(toApp);
}

/* Колонки перелічуємо явно, але `pinned` серед них може ще не
   існувати — тоді впав би і сам запит, і створення папки разом з
   ним. Тому список полів у читанні після вставки той самий, що й у
   fetchFolders, з тим самим відступом на відсталу схему. */
const COLS = 'id, name, color, position, pinned';
const COLS_NO_PIN = 'id, name, color, position';

export async function createFolder(userId, { name, color, position }) {
  const row = {
    user_id: userId,
    name: (name || '').trim() || 'Нова папка',
    color: color || FOLDER_COLORS[0],
    position: position ?? 0,
  };

  const { data, error } = await supabase
    .from('note_folders').insert([row]).select(COLS).single();

  if (!error) return toApp(data);
  if (!isMissingColumn(error, 'pinned')) throw error;

  const second = await supabase
    .from('note_folders').insert([row]).select(COLS_NO_PIN).single();

  if (second.error) throw second.error;
  return toApp(second.data);
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
  const build = (withPin) => {
    const row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = (patch.name || '').trim() || 'Без назви';
    if (patch.color !== undefined) row.color = patch.color;
    if (withPin && patch.pinned !== undefined) row.pinned = !!patch.pinned;
    return row;
  };

  const push = (withPin) => supabase
    .from('note_folders')
    .update(build(withPin))
    .eq('id', id)
    .eq('user_id', userId);

  const { error } = await push(true);
  if (!error) return;

  /* Перейменування й колір мають доїхати навіть на базі, де
     закріплення ще немає: втратити нову назву через невиконану
     міграцію чужої можливості — гірше, ніж не закріпити папку. */
  if (!isMissingColumn(error, 'pinned')) throw error;

  const { error: second } = await push(false);
  if (second) throw second;
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
  const row = (f, i, withPin) => ({
    id: f.id,
    user_id: userId,
    name: f.name,
    color: f.color,
    position: i,
    updated_at: new Date().toISOString(),
    ...(withPin ? { pinned: !!f.pinned } : null),
  });

  const push = (withPin) => supabase
    .from('note_folders')
    .upsert(ordered.map((f, i) => row(f, i, withPin)), { onConflict: 'id' });

  const { error } = await push(true);
  if (!error) return;

  /* Та сама відстала схема, що й у fetchFolders: без колонки
     `pinned` має зберегтись хоча б порядок, а не нічого. */
  if (!isMissingColumn(error, 'pinned')) throw error;

  const { error: second } = await push(false);
  if (second) throw second;
}
