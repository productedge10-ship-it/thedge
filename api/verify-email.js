/* global process */
/* ==================================================================
   Підтвердження пошти — серверна частина.

   Сюди веде посилання з листа, який шле Supabase.

   ---

   Чому це має бути на сервері, а не в браузері.

   Спокуса зробити простіше: юзер клікає лінк, Supabase логінить його
   і кидає назад у застосунок, а там клієнтський код ставить
   email_verified = true. Так робити не можна. Той код лежить у
   браузері, і будь-хто відкриє консоль та викличе його напряму,
   взагалі не заходячи в пошту. Підтвердження, яке підтверджує саме
   себе, захистом не є.

   Тому токен з листа перевіряється тут. verifyOtp() звертається до
   Supabase, і якщо токен несправжній, прострочений або вже
   використаний — далі не йдемо. Прапорець ставиться службовим
   ключем, якого в браузері немає в принципі.

   Свої токени при цьому не вигадуємо: генерацію, термін дії й
   одноразовість робить Supabase. Ми лише переносимо результат
   перевірки у власну таблицю profiles.
================================================================== */

import { createClient } from '@supabase/supabase-js'

/* Куди повертати юзера після кліку. На хостингу задається змінною
   середовища, локально лишається дефолт дев-сервера. */
const site = () => (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '')

/* Ведемо одразу в застосунок, а не на корінь: корінь — це лендінг,
   і він миттєво перекидає залогіненого далі, зʼїдаючи параметр разом
   із повідомленням про результат. */
const back = (res, status) => res.redirect(302, `${site()}/app?verified=${status}`)

/* Типи, з якими цей обробник узагалі має справу. Список закритий
   навмисно: type приходить із рядка запиту, а отже підконтрольний
   тому, хто відкриває посилання. Без білого списку сюди можна було б
   підсунути, скажімо, 'recovery' — і токеном для зміни пароля
   підтвердити пошту. Володіння скринькою це все одно доводить, але
   змішувати призначення токенів не варто: кожен має робити рівно те,
   заради чого виданий. */
const ALLOWED_TYPES = new Set(['magiclink', 'email', 'signup'])

export default async function handler(req, res) {
  const { token_hash: tokenHash, type = 'magiclink' } = req.query || {}

  if (!tokenHash) return back(res, 'error')
  if (!ALLOWED_TYPES.has(type)) return back(res, 'error')

  /* Імена змінних — ті самі, що в функціях оплати, плюс старі як
     запасні.

     Цей файл писався раніше за оплату і чекав SUPABASE_KEY та
     SUPABASE_SERVICE_ROLE_KEY. Оплата ж узяла SUPABASE_SERVICE_KEY, і
     на сервері завели саме її. Результат: кожне посилання з листа
     закінчувалось ?verified=error, і жоден користувач не міг
     підтвердити пошту. Два імені для одного ключа — пастка, тож
     основне тепер одне на весь проєкт, а старе лишається лише щоб не
     зламати вже налаштоване десь іще. */
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  /* Публічний ключ для verifyOtp. Якщо окремо не заданий — службовий.
     Це безпечно: перевірка токена — звичайна публічна операція
     авторизації, і службовий ключ тут не дає нічого понад те, що дав
     би публічний. Зате не треба заводити на сервері ще одну змінну
     заради одного виклику. */
  const anonKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || serviceKey

  /* Мовчазний редірект тут був би найгіршим варіантом: юзер бачить
     «не вдалось» і не розуміє, що просто не дописані ключі. */
  if (!url || !serviceKey) {
    console.error('verify-email: не задані SUPABASE_URL / SUPABASE_SERVICE_KEY')
    return back(res, 'error')
  }

  try {
    /* 1. Чи справжній токен із листа.
       Ключ тут анонімний — це звичайна публічна операція авторизації.
       Сесію, яку вона повертає, не використовуємо: браузер юзера має
       власну, а нам потрібен лише факт «токен валідний» і id. */
    const pub = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await pub.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error || !data?.user) {
      console.error('verify-email: токен не пройшов перевірку', error?.message)
      return back(res, 'error')
    }

    /* 2. Тільки тепер ставимо прапорець — службовим ключем, бо
       клієнтові запис у profiles заборонено на рівні RLS. */
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error: upError } = await admin
      .from('profiles')
      .update({ email_verified: true, verified_at: new Date().toISOString() })
      .eq('id', data.user.id)

    if (upError) {
      console.error('verify-email: не вдалось оновити profiles', upError)
      return back(res, 'error')
    }

    return back(res, '1')
  } catch (e) {
    console.error('verify-email:', e)
    return back(res, 'error')
  }
}
