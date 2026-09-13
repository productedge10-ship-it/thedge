import { supabase } from './supabase';

/* ==================================================================
   Підключення торгового рахунку MT5.

   Пароль інвестора шифрується тут, у браузері, ще до того як піде
   кудись по мережі. У Supabase приїжджає вже шифротекст, і ключа,
   яким його відкрити, в базі немає — приватний ключ живе на VPS і
   звідти не виїжджає. Тому витік бази чи навіть service_role ключа
   не дає нікому жодного пароля.

   Шифруємо вбудованим WebCrypto, а не бібліотекою з npm. Причина
   прагматична: RSA-OAEP є в кожному браузері з коробки, а кожна
   зайва залежність у ланцюжку, який тримає чужі паролі, — це ще
   один пакет, який колись оновлять за нас.

   Прив'язка до формату: RSA-OAEP + SHA-256, публічний ключ у SPKI,
   base64 без переносів. На боці VPS це рівно
   `cryptography.hazmat.primitives.asymmetric.padding.OAEP`.
================================================================== */

/* Публічний ключ не секрет — на те він і публічний, тому спокійно
   живе у VITE_-змінній і потрапляє в бандл. Секрет — приватний, і
   його тут немає й бути не може. */
const PUB = import.meta.env.VITE_MT5_PUBLIC_KEY || '';
const KEY_VERSION = Number(import.meta.env.VITE_MT5_KEY_VERSION || 1);

/* Імпорт ключа коштує зайвих мілісекунд, а ключ один на весь сеанс —
   тримаємо обіцянку, а не сам ключ. */
let keyPromise = null;

function publicKey() {
  if (!keyPromise) {
    const raw = Uint8Array.from(atob(PUB), (c) => c.charCodeAt(0));
    keyPromise = crypto.subtle.importKey(
      'spki',
      raw,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }
  return keyPromise;
}

/* Шифрування рядка публічним ключем. Повертає base64.

   RSA вміє шифрувати лише короткі повідомлення (для 4096-бітного
   ключа з OAEP/SHA-256 — до ~446 байт). Паролю цього з головою, але
   якщо колись сюди захочуть покласти щось більше, правильним шляхом
   буде гібридна схема, а не довший ключ. */
export async function sealSecret(plain) {
  if (!PUB) {
    throw new Error('Encryption key is missing — the account was not saved.');
  }

  const key = await publicKey();
  const cipher = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    key,
    new TextEncoder().encode(plain),
  );

  return btoa(String.fromCharCode(...new Uint8Array(cipher)));
}

/* Зберегти підключення.

   Пароль сюди приходить відкритим (його щойно ввели), шифрується і
   далі не існує: у базу йде тільки `secret`, а сам рядок лишається
   в пам'яті рівно до кінця цієї функції. Нікуди не логуємо — рядок
   у console.log живе рівно стільки ж, скільки відкрита вкладка. */
export async function connectMt5({ broker = 'other', server, login, password }) {
  const secret = await sealSecret(password);

  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data?.user) throw new Error('Session expired — sign in again.');

  const { data: row, error } = await supabase
    .from('mt5_accounts')
    .upsert(
      {
        user_id: data.user.id,
        platform: 'mt5',
        /* Проп визначає, яку збірку терміналу воркер підніме на VPS:
           адреси серверів зашиті в саму збірку, і загальний MetaTrader
           про «FTMO-Server5» не знає взагалі. */
        broker,
        server: server.trim(),
        login: login.trim(),
        secret,
        key_version: KEY_VERSION,
        /* pending, а не active: активним рахунок робить VPS, коли
           реально зайде в термінал. Писати «підключено» до першої
           вдалої спроби — обіцяти те, чого ще не сталось. */
        status: 'pending',
        last_error: null,
        /* Скидаємо чергу вручну. Якщо цей рахунок уже падав, воркер
           відсунув його наступну спробу на годину вперед — і нова
           спроба з виправленим паролем чекала б цю годину дарма. */
        next_sync_at: new Date().toISOString(),
        fail_count: 0,
        locked_until: null,
      },
      { onConflict: 'user_id,platform,login' },
    )
    .select('id')
    .single();

  if (error) throw error;
  return row.id;
}

/* Стежити за результатом перевірки.

   Воркер на VPS перевіряє рахунок за кілька секунд і пише в рядок
   'active' або 'error'. Замість того щоб довбити базу опитуванням,
   підписуємось на зміну саме цього рядка — Realtime штовхне її сам.

   Повертає функцію відписки: канал треба закрити, інакше при
   кожному відкритті форми лишатиметься зайвий вебсокет. */
export function watchMt5Account(id, onChange) {
  const channel = supabase
    .channel(`mt5-account-${id}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'mt5_accounts', filter: `id=eq.${id}` },
      (payload) => onChange(payload.new),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

/* Запасний шлях. Realtime не долітає частіше, ніж хотілося б: спляча
   вкладка, обрив вебсокета, корпоративний проксі. Тому через кілька
   десятків секунд просто питаємо базу напряму. */
export async function readMt5Status(id) {
  const { data, error } = await supabase
    .from('mt5_accounts')
    .select('status, last_error')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/* Список підключень. Пароль звідси не повертаємо взагалі — він і в
   зашифрованому вигляді інтерфейсу не потрібен. */
export async function listMt5Accounts() {
  const { data, error } = await supabase
    .from('mt5_accounts')
    .select('id, platform, broker, server, login, status, last_error, last_sync_at, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function removeMt5Account(id) {
  const { error } = await supabase.from('mt5_accounts').delete().eq('id', id);
  if (error) throw error;
}

/* Забрати угоди з терміналу «прямо зараз».

   Кнопка на фронті нічого не тягне з MT5 сама — до термінала має
   доступ тільки VPS. Тому «підтягнути» означає: посунути свої рахунки
   на початок черги, дочекатись, поки воркер відзвітує, і забрати з
   бази те, що він поклав.

   Виглядає як обхідний шлях, але це і є правильна архітектура:
   браузер ніколи не тримає ні паролів, ні зʼєднання з брокером. */
export async function pullMt5Trades({ timeoutMs = 25000 } = {}) {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error('Session expired — sign in again.');

  const { data: accounts, error: accErr } = await supabase
    .from('mt5_accounts')
    .select('id, server, login, status, last_sync_at')
    .eq('user_id', user.id);

  if (accErr) throw accErr;
  if (!accounts?.length) throw new Error('No MT5 account connected — add one in Settings first.');

  /* Запамʼятовуємо, коли кожен рахунок синхронізували востаннє: саме
     зміна цієї позначки означає, що воркер до нього дійшов. */
  const seen = new Map(accounts.map((a) => [a.id, a.last_sync_at || '']));

  /* fail_count скидаємо разом із чергою: натиснута руками кнопка —
     це явне «спробуй ще раз», і вона має важити більше за десяток
     попередніх невдач, через які воркер уже махнув на рахунок рукою. */
  const { error: bumpErr } = await supabase
    .from('mt5_accounts')
    .update({ next_sync_at: new Date().toISOString(), locked_until: null, fail_count: 0 })
    .eq('user_id', user.id);

  if (bumpErr) throw bumpErr;

  const deadline = Date.now() + timeoutMs;
  let synced = false;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const { data: fresh } = await supabase
      .from('mt5_accounts')
      .select('id, last_sync_at, status, last_error')
      .eq('user_id', user.id);

    if (fresh?.some((a) => (a.last_sync_at || '') !== seen.get(a.id))) {
      synced = true;
      break;
    }
  }

  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, plan_date, plan_pair, account_name, type, result, rr, profit_money, session, entry_time, exit_time, external_id')
    .eq('user_id', user.id)
    .eq('source', 'mt5')
    .order('plan_date', { ascending: false })
    .order('entry_time', { ascending: false });

  if (error) throw error;

  /* synced=false не помилка: воркер міг бути зайнятий іншою пачкою.
     Угоди все одно віддаємо — просто це ще не оновлені дані. */
  return { trades: trades || [], synced, accounts };
}
