import { supabase } from './supabase';

/* ==================================================================
   Нотатки в базі.

   Було: масив у localStorage. Інший браузер показував порожнечу, а
   чистка кешу зносила все написане. Стало: таблиця `notes` з RLS —
   свої нотатки бачить тільки автор.

   Записуємо по одній нотатці, а не весь список: людина рідко змінює
   двадцять записів одразу, а ганяти їх усі на кожне збереження — це
   і трафік, і ризик затерти те, що прилетіло з іншого пристрою.
================================================================== */

export const LEGACY_KEY = 'edge_notes_v1';
const MIGRATED_KEY = 'edge_notes_migrated_v1';

export const uid = () => (
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
);

const todayISO = () => {
  /* Локальна дата, а не UTC: увечері toISOString дає вчорашній день */
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Схема на базі може відставати від коду: вигляд картки приїхав
   окремою міграцією, і поки її не виконали, колонки `card` просто
   немає. Розпізнати це треба двома способами: Postgres кидає 42703,
   а PostgREST часто не доходить до бази взагалі й відсікає запит
   своїм PGRST204 з тексту про schema cache. */
const isMissingColumn = (error, column) => {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  const msg = `${error.message || ''} ${error.details || ''}`;
  return msg.includes(column) && /schema cache|does not exist/i.test(msg);
};

/* Прапорець для сторінки: якщо колонки немає, вигляд картки живе
   тільки до перезавантаження, і людина має про це знати — мовчки
   з'їдати її вибір гірше, ніж сказати правду один раз. */
export const cardSupport = { ok: true };

/* ---------- база ↔ застосунок ---------- */

const toApp = (row) => ({
  id: row.id,
  title: row.title || '',
  description: row.description || '',
  tags: Array.isArray(row.tags) ? row.tags : [],
  images: Array.isArray(row.images) ? row.images : [],
  chart_link: row.chart_link || '',
  created_at: row.note_date || todayISO(),
  updated_at: row.updated_at || null,
  archived: !!row.archived,
  folder_id: row.folder_id || null,
  /* Вигляд картки: колір, іконка, обкладинка, розмір. Живе одним
     json-полем, бо це набір смаку, а не дані: додати сюди ще одну
     ручку не має коштувати міграції. */
  card: row.card && typeof row.card === 'object' && !Array.isArray(row.card) ? row.card : {},
});

const toRow = (note, userId) => ({
  id: note.id,
  user_id: userId,
  title: note.title || 'Без назви',
  description: note.description || '',
  tags: note.tags || [],
  images: note.images || [],
  chart_link: note.chart_link || '',
  note_date: note.created_at || todayISO(),
  archived: !!note.archived,
  folder_id: note.folder_id || null,
  card: note.card && typeof note.card === 'object' ? note.card : {},
  updated_at: new Date().toISOString(),
});

/* ---------- читання ---------- */

/* Архівні тягнемо разом з рештою: записник — це десятки записів, а
   не тисячі, і другий запит по кліку на «Архів» коштував би більше,
   ніж кілька зайвих рядків у першому. Розділяє їх уже сторінка. */
/* `updated_at` читаємо нарівні з рештою. Досі його тільки писали:
   у застосунок нотатка приходила без нього, і «змінено» показувало
   дату створення — тобто щойно відредагований запис бачився як
   вчорашній. */
const COLS = 'id, title, description, tags, images, chart_link, note_date, archived, folder_id, card, updated_at';
const COLS_NO_CARD = 'id, title, description, tags, images, chart_link, note_date, archived, folder_id, updated_at';

export async function fetchNotes(userId) {
  const read = (cols) => supabase
    .from('notes')
    .select(cols)
    .eq('user_id', userId)
    .order('note_date', { ascending: false })
    .order('created_at', { ascending: false });

  const { data, error } = await read(COLS);
  if (!error) { cardSupport.ok = true; return (data || []).map(toApp); }

  /* Будь-яка інша помилка це вже не «схема відстала», і мовчки
     ковтати її не можна. */
  if (!isMissingColumn(error, 'card')) throw error;

  cardSupport.ok = false;
  const second = await read(COLS_NO_CARD);
  if (second.error) throw second.error;
  return (second.data || []).map(toApp);
}

/* ---------- запис ---------- */

export async function saveNote(userId, note) {
  const row = toRow(note, userId);
  const { error } = await supabase.from('notes').upsert(row, { onConflict: 'id' });
  if (!error) { cardSupport.ok = true; return toApp(row); }

  /* Текст нотатки важливіший за її вигляд: на відсталій схемі
     зберігаємо все, крім оформлення, а не втрачаємо запис цілком. */
  if (!isMissingColumn(error, 'card')) throw error;

  cardSupport.ok = false;
  const plain = { ...row };
  delete plain.card;
  const second = await supabase.from('notes').upsert(plain, { onConflict: 'id' });
  if (second.error) throw second.error;
  return toApp(row);
}

export async function removeNote(userId, id) {
  const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

/* Окремо від saveNote навмисно: архівування — це один прапорець, і
   ганяти через нього весь вміст нотатки означало б ризик затерти
   правки, зроблені на іншому пристрої, просто натиснувши «в архів». */
export async function setNoteArchived(userId, id, archived) {
  const { error } = await supabase
    .from('notes')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* Так само точково, як і архів: перенести нотатку в іншу папку — це
   одне поле, і воно не має тягнути за собою весь текст. */
export async function setNoteFolder(userId, id, folderId) {
  const { error } = await supabase
    .from('notes')
    .update({ folder_id: folderId || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ---------- перенесення зі старого сховища ----------
   Одноразово: якщо в базі порожньо, а на цьому пристрої лишились
   нотатки з localStorage — переносимо їх, а не показуємо чистий
   аркуш людині, яка вже щось написала. */
export async function migrateLegacyNotes(userId, cloudCount) {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return [];
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) { localStorage.setItem(MIGRATED_KEY, '1'); return []; }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length || cloudCount > 0) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return [];
    }

    const rows = parsed.map((n) => toRow({
      ...n,
      id: uid(),
      created_at: (n.created_at || todayISO()).slice(0, 10),
    }, userId));

    const { error } = await supabase.from('notes').insert(rows);
    if (error) throw error;

    localStorage.setItem(MIGRATED_KEY, '1');
    return rows.map(toApp);
  } catch {
    /* не змогли перенести — не блокуємо роботу, старі дані лишаються
       в localStorage і спробу можна повторити */
    return [];
  }
}

export { todayISO };
