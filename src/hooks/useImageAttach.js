import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { uploadImage, uploadDataUrl, isDataUrl } from '../lib/imageStore';

/* ==================================================================
   Прикріплення картинок.

   Один порядок дій на всі місця, де вставляють скрін: угода, бектест,
   документи системи, обкладинка сторінки. Раніше кожне з них читало
   файл через FileReader і клало base64 просто в рядок таблиці —
   скрін на два мегабайти ставав двома мегабайтами тексту в базі,
   їхав у кожному запиті списку й не кешувався браузером.

   Тепер файл проходить через imageStore: canvas зменшує його до
   розумної ширини й перекодовує у WebP, а в записі лишається
   посилання на сховище довжиною в сотню байт.

   Три речі, заради яких це окремий хук, а не виклик у кожному файлі:

   1. Миттєве прев'ю. Чекати на мережу, дивлячись у порожнечу, — гірше
      за сьогоднішню поведінку. Тому картинка зʼявляється одразу з
      локального blob-посилання, а справжня адреса підмінює його, коли
      доїде.

   2. Чесний відкат. Якщо сховище відмовило (демо, офлайн, збій), файл
      читається в data URL — тобто рівно те, що було до цих змін.
      Картинка не зникає ніколи, найгірший випадок — важкий рядок.

   3. Лічильник завантажень. Поки він не нуль, форму не можна
      зберігати: інакше в базу потрапить blob-посилання, яке після
      перезавантаження сторінки вже нічого не означає.
================================================================== */

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Не вдалось прочитати файл'));
  r.readAsDataURL(file);
});

export const imageFiles = (list) => [...(list || [])].filter((f) => f && f.type?.startsWith('image/'));

/* Картинки з події вставки. Буфер віддає їх то в files, то в items —
   залежно від браузера й від того, скопійовано файл чи сам знімок. */
export function filesFromPaste(e) {
  const dt = e.clipboardData;
  if (!dt) return [];
  const direct = imageFiles(dt.files);
  if (direct.length) return direct;
  return [...(dt.items || [])]
    .filter((i) => i.kind === 'file' && i.type?.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter(Boolean);
}

export default function useImageAttach({ folder = 'loose', maxWidth, quality } = {}) {
  const { user } = useAuth();
  const profile = { maxWidth, quality };
  const [uploading, setUploading] = useState(0);
  const blobs = useRef(new Set());

  /* Локальні посилання відпускаємо разом із формою, а не одразу після
     підміни: інакше між зміною стану й перемальовуванням <img> устигає
     звернутись до вже відкликаного blob і блимає порожньою рамкою. */
  useEffect(() => {
    const live = blobs.current;
    return () => {
      live.forEach((u) => URL.revokeObjectURL(u));
      live.clear();
    };
  }, []);

  const preview = useCallback((file) => {
    const url = URL.createObjectURL(file);
    blobs.current.add(url);
    return url;
  }, []);

  /* Один файл: стиснути, покласти у сховище, повернути адресу. */
  const put = useCallback(async (file) => {
    setUploading((n) => n + 1);
    try {
      if (!user?.id) throw new Error('Немає користувача');
      return await uploadImage(user.id, folder, file, profile);
    } catch (err) {
      /* Мовчки, бо для людини нічого не зламалось: картинка на місці,
         просто лежить у рядку, а не у сховищі. */
      console.error('image upload', err);
      try { return await readAsDataUrl(file); } catch { return null; }
    } finally {
      setUploading((n) => n - 1);
    }
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, folder, maxWidth, quality]);

  /* ------------------------------------------------------------------
     Перенесення старих записів.

     У вже збережених угодах скріни лежать як base64 — вони туди
     потрапили до появи сховища. Окремої кнопки «мігрувати» не буде:
     людина не має знати, що всередині взагалі щось не так. Замість
     цього переганяємо тихо, при першому ж збереженні такого запису.
     Якщо не вийшло — лишаємо як є, запис від цього не ламається.
  ------------------------------------------------------------------ */
  const migrate = useCallback(async (list) => {
    const arr = list || [];
    if (!user?.id || !arr.some(isDataUrl)) return arr;

    setUploading((n) => n + 1);
    try {
      return await Promise.all(arr.map(async (src) => {
        if (!isDataUrl(src)) return src;
        try { return await uploadDataUrl(user.id, folder, src, profile); } catch { return src; }
      }));
    } finally {
      setUploading((n) => n - 1);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [user?.id, folder, maxWidth, quality]);

  /* Додати файли в масив рядків (скріни угоди, бектесту). */
  const addToList = useCallback((files, setList) => {
    imageFiles(files).forEach(async (file) => {
      const local = preview(file);
      setList((prev) => [...(prev || []), local]);
      const url = await put(file);
      setList((prev) => (url
        ? (prev || []).map((x) => (x === local ? url : x))
        : (prev || []).filter((x) => x !== local)));
    });
  }, [preview, put]);

  /* Замінити одне значення (обкладинка, картинка блоку). */
  const attachOne = useCallback(async (file, setValue) => {
    const [img] = imageFiles([file]);
    if (!img) return;
    const local = preview(img);
    setValue(local);
    const url = await put(img);
    setValue(url || '');
  }, [preview, put]);

  return { uploading, busy: uploading > 0, addToList, attachOne, migrate, put };
}
