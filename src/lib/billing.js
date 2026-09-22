import { supabase } from './supabase';

/* ==================================================================
   Тарифи й підписка.

   Ціни в гривнях, і це не дрібниця. WayForPay списує в UAH — долар
   можна передати лише довідковою «альтернативною» сумою. Тож або на
   сайті стоїть гривня і людина бачить рівно те, що спишеться, або
   стоїть долар, а списується плаваюча сума за внутрішнім курсом
   банку. Друге виглядає як обман навіть тоді, коли ним не є: у
   виписці цифра не збігається з тією, що на сторінці цін.

   Міняти ціну — тут і більше ніде. Сервер бере суму з цього ж файлу,
   а не з того, що надіслав браузер: інакше досить відкрити консоль і
   попросити рахунок на одну гривню.
================================================================== */

export const PLANS = {
  pro_monthly: {
    id: 'pro_monthly',
    title: 'Pro · місяць',
    amount: 599,
    currency: 'UAH',
    period: 'monthly',
    label: '599 ₴ / місяць',
  },
  pro_yearly: {
    id: 'pro_yearly',
    title: 'Pro · рік',
    amount: 5990,
    currency: 'UAH',
    period: 'yearly',
    /* Два місяці в подарунок — рахується з 599×12 = 7188. Знижку
       називаємо місяцями, а не відсотками: «два місяці безкоштовно»
       людина розуміє без калькулятора, «−17%» ні. */
    label: '5 990 ₴ / рік',
    note: 'Два місяці у подарунок',
  },
};

/* Скільки триває безкоштовний період і скільки коштує привʼязка.

   Одна гривня, а не нуль. Нуль виглядає добріше, але нічого не
   доводить: картка з нульовим балансом чи з забороною інтернет-
   платежів пройде верифікацію і відвалиться рівно через два тижні,
   коли людина вже звикла до продукту. Гривня — найдешевша перевірка,
   що картка справді робоча, і вона повертається першим же списанням.
*/
export const TRIAL_DAYS = 14;
export const TRIAL_HOLD = 1;

/* ==================================================================
   Що входить у Free, а що ні.

   Межа проходить не по «скільки», а по «що». Ліміт на кількість
   угод зробив би безкоштовну версію непридатною саме тоді, коли
   людина почала нею користуватись — тобто карав би за звичку, яку
   продукт і намагається виробити. Тому журнал, аналітика й
   калькулятор безкоштовні цілком, без стель.

   Платне — те, що коштує нам грошей щомісяця і працює, поки людина
   спить: термінал на VPS, який тягне угоди, і бот, який шле
   сповіщення. Це чесна межа: платиш за те, що працює за тебе.
================================================================== */
export const PRO_FEATURES = {
  mt5: {
    title: 'Підключення MetaTrader',
    hint: 'Угоди приїжджають із термінала самі — разом зі свічками, стопами й часом у ринку',
  },
  telegram: {
    title: 'Telegram-бот',
    hint: 'Нова угода, підсумок дня, таймери з плану — у чат',
  },
};

export const isProFeature = (key) => key in PRO_FEATURES;

/* Поточний стан доступу.

   Читаємо функцію бази, а не рахуємо дати в браузері. Термін дії,
   порахований клієнтом, — це термін дії, який клієнт може й
   переписати. */
export async function readSubscription() {
  const [{ data: sub }, { data: pro }] = await Promise.all([
    supabase.from('subscriptions').select('plan,status,valid_until').maybeSingle(),
    supabase.rpc('is_pro'),
  ]);

  return {
    plan: sub?.plan || 'free',
    status: sub?.status || 'inactive',
    validUntil: sub?.valid_until || null,
    isPro: pro === true,
  };
}

/* Почати оплату.

   Уся робота — на сервері: він створює замовлення, рахує підпис і
   віддає готовий набір полів. Браузер лише складає з них форму й
   сабмітить. Секретний ключ мерчанта сюди не потрапляє й потрапити
   не може.

   Форму саме сабмітимо, а не відкриваємо посилання: WayForPay чекає
   POST, а в POST поля масивів (`productName[]`) передаються так, як
   їх не запхати в query-рядок. */
export async function startCheckout(planId, { trial = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Треба увійти');

  const r = await fetch('/api/wfp-pay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan: planId, trial }),
  });

  if (!r.ok) {
    const { error } = await r.json().catch(() => ({}));
    throw new Error(error || 'Не вдалось створити рахунок');
  }

  const { action, fields } = await r.json();

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.acceptCharset = 'utf-8';
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    /* Масиви йдуть окремими полями з тим самим імʼям — так їх і
       розбирає приймальна сторона. */
    (Array.isArray(value) ? value : [value]).forEach((v) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(v);
      form.appendChild(input);
    });
  });

  document.body.appendChild(form);
  form.submit();
}
