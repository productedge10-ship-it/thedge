/* ==================================================================
   Сповіщення про новини — браузерні.

   Telegram і пошта будуть, але для них потрібен сервер, який знає
   розклад і вміє будити людину з закритою вкладкою. Поки цього немає,
   робимо чесно менше: сповіщення від самого браузера, поки сайт
   відкритий хоча б у фоновій вкладці.

   Три речі, які тут вирішені й через які така штука зазвичай ламається:

   1. Дозвіл не питаємо на вході. Notification.requestPermission()
      при завантаженні сторінки — найшвидший спосіб отримати «блок»
      назавжди: людина ще не зрозуміла, навіщо їй це. Питаємо рівно в
      мить, коли вона сама натиснула дзвіночок.

   2. Один таймер, а не таймер на подію. setTimeout на кожну з
      сімдесяти подій — це сімдесят таймерів, які браузер у фоні
      душить і зсуває. Замість цього один тик раз на 20 секунд, який
      просто дивиться на годинник. Йому байдуже, скільки вкладка
      спала.

   3. Показане памʼятається в localStorage. Без цього перезавантаження
      сторінки за пʼять хвилин до новини показало б те саме
      сповіщення вдруге, а вкладка, відкрита у двох вікнах, — вчетверо.
================================================================== */

export const LEAD_MIN = 10;          // за скільки хвилин попереджаємо
const TICK = 20 * 1000;              // як часто звіряємось із годинником
const FIRED_KEY = 'edge_news_fired';
const GRACE = 90 * 1000;             /* Якщо вкладка спала й момент
                                        проґавлено — показуємо ще
                                        півтори хвилини. Далі вже
                                        безглуздо: новина от-от вийде. */

/* ---------- памʼять про показане ---------- */

const readFired = () => {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
};

const writeFired = (map) => {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify(map)); } catch { /* приватний режим */ }
};

/* Прибираємо все, що старше доби: інакше запис росте вічно. */
const prune = (map) => {
  const edge = Date.now() - 24 * 3600 * 1000;
  const out = {};
  Object.entries(map).forEach(([k, v]) => { if (v > edge) out[k] = v; });
  return out;
};

/* ---------- дозвіл ---------- */

export const notifySupported = () => typeof window !== 'undefined' && 'Notification' in window;

export const notifyState = () => (notifySupported() ? Notification.permission : 'unsupported');

/* Повертає підсумковий стан, а не кидає помилку: відмова від
   сповіщень — це нормальний вибір, а не збій. */
export async function askNotifyPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/* ---------- показ ---------- */

function fire(ev, minutes) {
  const body = [
    ev.ccy,
    minutes <= 0 ? 'вже зараз' : `через ${minutes} хв`,
    ev.forecast ? `прогноз ${ev.forecast}` : null,
  ].filter(Boolean).join(' · ');

  try {
    const n = new Notification(ev.title, {
      body,
      tag: `edge-news-${ev.id}`,   // браузер сам не покаже дубль із тим самим tag
      icon: '/favicon.png',
      badge: '/favicon.png',
    });
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* деякі браузери вимагають Service Worker — тоді просто тиша */ }
}

/* ---------- планувальник ----------

   Приймає функцію, яка щоразу віддає актуальний список подій під
   наглядом. Саме функцію, а не масив: список міняється, коли людина
   тисне дзвіночок, і перепідписуватись на кожну зміну означало б
   гасити й піднімати таймер по десять разів на хвилину. */
export function startNewsWatcher(getWatched) {
  if (!notifySupported()) return () => {};

  let fired = prune(readFired());

  const tick = () => {
    if (Notification.permission !== 'granted') return;

    const now = Date.now();
    const list = getWatched() || [];

    list.forEach((ev) => {
      if (!ev?.at) return;
      const t = ev.at instanceof Date ? ev.at.getTime() : new Date(ev.at).getTime();
      if (Number.isNaN(t)) return;

      const left = t - now;
      const window0 = LEAD_MIN * 60 * 1000;

      /* Вікно: від «за 10 хвилин» до «прострочили на GRACE».
         Верхня межа потрібна, бо інакше подія на наступний тиждень
         теж вважалась би такою, що ось-ось. */
      if (left > window0 || left < -GRACE) return;
      if (fired[ev.id]) return;

      fire(ev, Math.max(0, Math.round(left / 60000)));
      fired = { ...fired, [ev.id]: now };
      writeFired(fired);
    });
  };

  tick();
  const id = setInterval(tick, TICK);

  /* Повернення на вкладку — привід звіритись негайно, не чекаючи
     чергового тику: поки вкладка була у фоні, таймер міг гальмувати. */
  const onVis = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVis);
  };
}
