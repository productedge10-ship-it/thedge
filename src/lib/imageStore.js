import { supabase } from './supabase';

/* ==================================================================
   Картинки нотаток.

   Три шляхи, якими графік потрапляє в запис, і всі три ведуть сюди:
   файл із провідника, скрін із буфера, посилання.

   Посилання не чіпаємо — воно вже лежить на чужому сервері, важить
   нуль і працює швидше за будь-яку нашу копію. Файл і буфер даємо
   через стиснення й кладемо у Storage.

   Чому не base64 у базу, як було: `fetchNotes` тягне всі нотатки
   одним запитом. Кожен вставлений скрін ставав частиною цього
   запиту назавжди — двадцять записів зі скрінами відкривались
   секундами. Посилання ж важить сотню байт, а сам файл браузер
   тягне окремо, паралельно і з кешем.
================================================================== */

const BUCKET = 'note-images';

/* Скріншот графіка — це різка сітка й тонкі лінії, тобто рівно те,
   що першим розсипається на артефакти. Тому якість висока, а
   економія береться з іншого: ширина обмежена вдвічі більшим за
   типовий екран розміром, і формат WebP замість PNG.

   2560 — це retina-ширина повноекранного графіка. Далі різниці око
   вже не бачить, а вага росте квадратично. */
const MAX_W = 2560;
const MAX_H = 2560;
const QUALITY = 0.92;

export const isHttpUrl = (s) => /^https?:\/\//i.test(String(s || '').trim());
export const isDataUrl = (s) => /^data:image\//i.test(String(s || ''));

/* ------------------------------------------------------------------
   Посилання з TradingView → сам файл графіка.

   Кнопка «Copy link to the chart image» дає адресу вигляду
   https://www.tradingview.com/x/2gbm6jyC/ — і це НЕ картинка, а
   HTML-сторінка з нею всередині. Колись TradingView віддавав по цій
   адресі і те, і те залежно від запиту, тому <img src> працював.
   Тепер приходить сторінка, і будь-який <img> із таким посиланням
   лишається порожньою рамкою — саме тому графіки зникли одночасно й
   у планах, і в аналізах, хоч у базі все на місці.

   Сам файл лежить у снапшотах, а тека — перша літера коду в нижньому
   регістрі. Переписуємо адресу на льоту, при показі: у базі лишається
   те, що людина скопіювала, і старі записи чинити не треба.
------------------------------------------------------------------ */
const TV_SNAPSHOT = /^https?:\/\/(?:www\.)?tradingview\.com\/x\/([A-Za-z0-9]+)\/?/i;

export const tvImage = (url) => {
  const raw = String(url || '');
  const m = raw.match(TV_SNAPSHOT);
  if (!m) return raw;
  const code = m[1];
  return `https://s3.tradingview.com/snapshots/${code[0].toLowerCase()}/${code}.png`;
};

/* Картинка, що лежить у нашому Storage: її можна прибрати разом із
   нотаткою, на відміну від чужого посилання. */
export const isStored = (s) => typeof s === 'string' && s.includes(`/${BUCKET}/`);

const loadBitmap = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Не вдалось прочитати зображення'));
  img.src = src;
});

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Не вдалось прочитати файл'));
  r.readAsDataURL(file);
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (b) => (b ? resolve(b) : reject(new Error('Не вдалось стиснути зображення'))),
    type,
    quality,
  );
});

/* ------------------------------------------------------------------
   Стиснення.

   GIF пропускаємо як є: перемальовування через canvas залишило б
   від анімації один кадр, а «стиснув» у такому вигляді — це
   зіпсував.
------------------------------------------------------------------ */
export async function compress(file) {
  if (file.type === 'image/gif') {
    return { blob: file, ext: 'gif', type: 'image/gif' };
  }

  const img = await loadBitmap(await readAsDataUrl(file));

  const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  /* Без згладжування зменшена сітка графіка перетворюється на
     муар — саме те, що людина назвала б «втратою якості». */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await canvasToBlob(canvas, 'image/webp', QUALITY);

  /* Буває, що вихід важчий за вхід: маленький PNG-скрін інтерфейсу
     WebP не стискає, а роздуває. Тоді лишаємо оригінал. */
  if (blob.size >= file.size && file.type.startsWith('image/')) {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return { blob: file, ext, type: file.type };
  }

  return { blob, ext: 'webp', type: 'image/webp' };
}

/* ------------------------------------------------------------------
   Завантаження
------------------------------------------------------------------ */

const randomName = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export async function uploadImage(userId, noteId, file) {
  if (!userId) throw new Error('Немає користувача');

  const { blob, ext, type } = await compress(file);
  /* note_id у шляху — щоб потім можна було прибрати картинки
     видаленої нотатки одним префіксом, не тримаючи окремого
     реєстру файлів. */
  const path = `${userId}/${noteId || 'loose'}/${randomName()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: type, upsert: false, cacheControl: '31536000' });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* Base64, що лишився в старих нотатках. Переносимо мовчки при
   першому ж збереженні такої нотатки: окрема кнопка «мігрувати»
   вимагала б від людини розуміти, що взагалі сталось. */
export async function uploadDataUrl(userId, noteId, dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const file = new File([blob], 'note.png', { type: blob.type || 'image/png' });
  return uploadImage(userId, noteId, file);
}

/* ------------------------------------------------------------------
   Прибирання

   Помилку ковтаємо навмисно: якщо файл не стерся, це сміття в
   сховищі, а не втрачені дані. Кидати через це людині повідомлення
   про помилку при видаленні нотатки — гірше, ніж кілька зайвих
   кілобайт.
------------------------------------------------------------------ */
export async function removeImages(urls) {
  const paths = (urls || [])
    .filter(isStored)
    .map((u) => {
      const i = u.indexOf(`/${BUCKET}/`);
      return i === -1 ? null : decodeURIComponent(u.slice(i + BUCKET.length + 2));
    })
    .filter(Boolean);

  if (!paths.length) return;
  try { await supabase.storage.from(BUCKET).remove(paths); } catch { /* мовчки */ }
}
