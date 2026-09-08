import { createClient } from '@supabase/supabase-js'

// ВСТАВ СВОЇ ДАНІ СЮДИ:
const supabaseUrl = 'https://hlqqzftlsrjxbtaqbsif.supabase.co'
const supabaseKey = 'sb_publishable_AwLC44Ia4JR7JHNzW3u6aQ_4NltmCDK'

/* Адреса потрібна не тільки клієнту: Edge Functions живуть на тому
   самому домені, і сторінка новин ходить до них напряму. */
export const SUPABASE_URL = supabaseUrl

/* Адресу треба прочитати ДО createClient: клієнт одразу розбирає
   токен і вичищає його з рядка, тож пізніше доказу вже не знайти.

   Саме наявність токена відрізняє перехід із листа від адреси,
   набраної руками: у справжньому посиланні є ?code= (PKCE) або
   access_token у фрагменті, у підробленій — лише мітка. */
const entryUrl = typeof window !== 'undefined' ? window.location.href : ''
const entryHadAuthToken = /[?&]code=/.test(entryUrl)
  || /[#&]access_token=/.test(entryUrl)
  || /[#&]type=recovery/.test(entryUrl)

export const hadAuthTokenInUrl = () => entryHadAuthToken

const realClient = createClient(supabaseUrl, supabaseKey)

/* ==================================================================
   Демо-режим.

   На шляху /demo застосунок працює з підробленим клієнтом: ті самі
   сторінки, ті самі модалки, але відповідає localStorage. Так демо
   не потребує окремої «полегшеної» версії інтерфейсу, яка все одно
   роз'їхалася б із продуктом.

   Перевірка саме за адресою, а не за прапорцем у сховищі: прапорець
   можна забути погасити, і тоді справжній журнал почав би читати
   вигадані угоди. Адреса такого не пробачає — вона або /demo, або ні.
================================================================== */
const onDemoPath = () => typeof window !== 'undefined'
  && window.location.pathname.startsWith('/demo')

let demoClientRef = null

const pickClient = () => {
  if (!onDemoPath()) return realClient
  if (!demoClientRef) {
    /* Вантажимо синхронно з уже зібраного модуля: демо-клієнт
       маленький і не тягне за собою мережу. */
    // eslint-disable-next-line global-require
    demoClientRef = window.__edgeDemoClient || null
  }
  return demoClientRef || realClient
}

export const setDemoClient = (client) => {
  demoClientRef = client
  if (typeof window !== 'undefined') window.__edgeDemoClient = client
}

/* Проксі, а не готовий об'єкт: демо-клієнт реєструється вже після
   того, як модулі застосунку імпортували supabase. */
export const supabase = new Proxy({}, {
  get: (_t, prop) => pickClient()[prop],
})

/* ==================================================================
   Ознака «людина прийшла за посиланням для відновлення пароля».

   Чому це живе тут, а не в компоненті сторінки.

   Supabase розбирає токен з адреси одразу після створення клієнта і
   тоді ж надсилає подію PASSWORD_RECOVERY. React до цього моменту ще
   нічого не змонтував, тож підписка всередині компонента запізнюється
   і подію просто не чує.

   Модуль підписується в момент імпорту — раніше за будь-який рендер,
   тому подія не губиться.

   Прапорець свідомо тримається в памʼяті, а не в URL: адресу можна
   набрати руками, і тоді форма зміни пароля відкрилася б будь-кому,
   хто просто залогінений. Пропуском має бути справжній токен з листа,
   а не рядок в адресному рядку.
================================================================== */

let recoveryFlow = false
const recoveryListeners = new Set()

supabase.auth.onAuthStateChange((event) => {
  if (event !== 'PASSWORD_RECOVERY') return
  recoveryFlow = true
  recoveryListeners.forEach((fn) => fn())
})

export const isRecoveryFlow = () => recoveryFlow

/* Після успішної зміни пароля — щоб форма не відкрилась удруге */
export const endRecoveryFlow = () => { recoveryFlow = false }

export function onRecoveryFlow(fn) {
  recoveryListeners.add(fn)
  return () => recoveryListeners.delete(fn)
}