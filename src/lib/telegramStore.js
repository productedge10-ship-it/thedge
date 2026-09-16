import { supabase } from './supabase';

/* ==================================================================
   Підключення Telegram.

   Раніше людина вручну вставляла свій `chat_id` у поле «ключ». Це було
   погано двічі. Незручно — його ще треба десь дізнатись, і пересічна
   людина не знає навіть, що це таке. І діряво: вставивши ЧУЖИЙ id,
   можна було отримувати чужі сповіщення, бо ніхто не перевіряв, що
   цей чат справді твій.

   Тепер навпаки: сайт створює одноразовий код, прив'язаний до твого
   акаунта, і відкриває бота з ним у посиланні. Бот бачить код у
   `/start`, знаходить рядок і записує chat_id тому користувачеві, що
   в рядку. Код знає тільки той, хто щойно натиснув кнопку у своєму
   акаунті, — тож привʼязати чужий чат неможливо.
================================================================== */

/* Ім'я бота живе тут, а не в .env: воно публічне за визначенням —
   людина бачить його в адресі, — і зайва змінна оточення на фронті
   означала б ще одне місце, де збірка може поїхати без помилки. */
export const BOT_NAME = 'TheEdgeSpace_bot';

/* Без схожих символів. Код читають очима з екрана телефона, і пара
   0/O чи 1/l/I перетворює привʼязку на гру «вгадай літеру» — навіть
   попри те, що зазвичай його не набирають руками. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function makeCode(len = 8) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/* ------------------------------------------------------------------
   Стан підключення
------------------------------------------------------------------ */

export async function readTelegram() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('user_settings')
    .select('tg_chat_id, tg_username, tg_alerts_on, tg_trades_on, tg_daily_on, tg_plan_on')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) throw error;

  /* Рядка може не бути взагалі — людина ще нічого не налаштовувала.
     Повертаємо ті самі значення, що стоять умовчанням у базі, щоб
     перемикачі не блимали при першому відкритті. */
  return {
    linked: !!data?.tg_chat_id,
    username: data?.tg_username || null,
    alerts: data?.tg_alerts_on ?? true,
    trades: data?.tg_trades_on ?? true,
    daily: data?.tg_daily_on ?? true,
    plan: data?.tg_plan_on ?? false,
  };
}

/* ------------------------------------------------------------------
   Код привʼязки
------------------------------------------------------------------ */

export async function createLinkCode() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Сесія закінчилась — увійди ще раз.');

  /* Прибираємо свої старі коди перед видачею нового.

     Не заради чистоти таблиці: кожен невикористаний код лишається
     робочим ключем до акаунта на пʼятнадцять хвилин. Людина, яка
     натиснула кнопку тричі, лишила б по собі три таких ключі. */
  await supabase.from('tg_links').delete().eq('user_id', uid);

  const code = makeCode();

  const { error } = await supabase
    .from('tg_links')
    .insert({ code, user_id: uid });

  if (error) throw error;

  return { code, url: `https://t.me/${BOT_NAME}?start=${code}` };
}

/* ------------------------------------------------------------------
   Відключення й налаштування
------------------------------------------------------------------ */

export async function unlinkTelegram() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Сесія закінчилась — увійди ще раз.');

  const { error } = await supabase
    .from('user_settings')
    .update({ tg_chat_id: null, tg_username: null })
    .eq('user_id', uid);

  if (error) throw error;
}

const PREF_COLUMN = {
  alerts: 'tg_alerts_on',
  trades: 'tg_trades_on',
  daily: 'tg_daily_on',
  plan: 'tg_plan_on',
};

export async function setTelegramPref(key, value) {
  const column = PREF_COLUMN[key];
  if (!column) return;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) throw new Error('Сесія закінчилась — увійди ще раз.');

  /* upsert, а не update: рядка в user_settings може ще не бути, і
     тихий update не створив би його, а просто нічого не змінив. */
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: uid, [column]: value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' });

  if (error) throw error;
}

/* Чи привʼязався бот, поки вікно відкрите.

   Realtime тут був би зайвим: людина йде в Telegram і повертається за
   кілька секунд, а канал заради цих секунд довелося б тримати на
   кожному відкритті налаштувань. Простий опит рідшає сам і гасне за
   дві хвилини. */
export function watchTelegramLink(onLinked) {
  let stop = false;
  let tries = 0;

  const tick = async () => {
    if (stop || tries > 40) return;
    tries += 1;

    try {
      const state = await readTelegram();
      if (state?.linked) { onLinked(state); return; }
    } catch { /* мовчки: це фонова перевірка, а не дія людини */ }

    setTimeout(tick, tries < 10 ? 2000 : 5000);
  };

  setTimeout(tick, 2000);
  return () => { stop = true; };
}
