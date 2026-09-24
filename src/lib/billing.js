import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/* ==================================================================
   Тарифи й підписка.

   Ціни в доларах, і списується теж долар — currency: 'USD' іде і в
   підпис, і в поля платіжної форми. Це принципово: якщо показувати
   долар, а списувати гривню за внутрішнім курсом банку, у виписці
   цифра не збігатиметься з тією, що була на сторінці. Виглядає як
   обман навіть тоді, коли ним не є.

   Мультивалютність має бути ввімкнена для мерчанта в кабінеті
   WayForPay. Якщо її немає — платіжна сторінка впаде з помилкою про
   валюту, і лікується це там, а не тут.

   Міняти ціну — тут і в netlify/functions/wfp-pay.mjs (дзеркало).
   Сервер бере суму зі свого файлу, а не з того, що надіслав браузер:
   інакше досить відкрити консоль і попросити рахунок на долар.
================================================================== */

export const CURRENCY = 'USD';

/* Річний — це $12/міс замість $15, тобто $144 замість $180.

   Знижку показуємо місячною ціною, а не відсотком: «$12 на місяць»
   людина одразу кладе поруч із «$15 на місяць» і бачить різницю.
   «−20%» вимагає рахувати. Повну річну суму все одно називаємо
   поруч — рахунок прийде саме на неї, і ховати це не можна. */
export const PLANS = {
  pro_monthly: {
    id: 'pro_monthly',
    title: 'Pro · місяць',
    amount: 15,
    currency: CURRENCY,
    period: 'monthly',
    perMonth: '$15',
    label: '$15 / місяць',
  },
  pro_yearly: {
    id: 'pro_yearly',
    title: 'Pro · рік',
    amount: 144,
    currency: CURRENCY,
    period: 'yearly',
    perMonth: '$12',
    label: '$12 / місяць',
    note: '$144 на рік — на $36 дешевше',
  },
};

/* Пробний період — безкоштовний: людина лише привʼязує картку, а
   перше списання відбувається через TRIAL_DAYS днів. Рішення команди:
   навіть символічний долар на вході відлякує сильніше, ніж допомагає
   відсіяти неробочі картки.

   TRIAL_HOLD лишається для старих замовлень WayForPay, де привʼязка
   йшла списанням $1. Новий платіжний сервіс привʼязуватиме картку
   без списання. */
export const TRIAL_DAYS = 14;
export const TRIAL_HOLD = 1;
export const TRIAL_HOLD_LABEL = 'Безкоштовно';
export const TRIAL_NOTE = 'Лише привʼязка картки, без списання';

/* ------------------------------------------------------------------
   Ціна в гривнях за курсом НБУ.

   Тариф живе в доларах, а гривню рахуємо з курсу на сьогодні (сервер
   /api/rate, кеш на кілька годин). Округлюємо до цілої гривні: копійки
   в ціні підписки читаються як недбалість.

   Курс тягнемо один раз на сесію сторінки — він міняється раз на добу.
------------------------------------------------------------------ */
let ratePromise = null;
const loadRate = () => {
  if (!ratePromise) {
    ratePromise = fetch('/api/rate')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Number(d.rate) > 0 ? Number(d.rate) : null))
      .catch(() => null);
  }
  return ratePromise;
};

export const toUah = (usd, rate) => (rate ? Math.round(Number(usd) * rate) : null);

export const fmtUah = (n) => (n == null ? '' : `${new Intl.NumberFormat('uk-UA').format(n)} ₴`);

export function useUahRate() {
  const [rate, setRate] = useState(null);
  useEffect(() => {
    let alive = true;
    loadRate().then((r) => { if (alive) setRate(r); });
    return () => { alive = false; };
  }, []);
  return rate;
}

/* Сума з валютою так, як її пишуть люди: «$15», а не «15 USD».

   Гривня окремою гілкою, бо Intl для UAH в англійській локалі дає
   «UAH 599», а в українській — «599,00 грн». Обидва правильні й
   обидва чужі на цьому екрані. Гривня тут лишається для старих
   платежів в історії — переписати їх доларами означало б збрехати
   про те, скільки людина заплатила. */
export const fmtMoney = (amount, currency = CURRENCY) => {
  const n = Number(amount) || 0;
  if (String(currency).toUpperCase() === 'UAH') return `${n.toLocaleString('uk-UA')} ₴`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
};

/* ==================================================================
   Що входить у Free, а що ні.

   Межа проходить не по «скільки», а по «що». Ліміт на кількість
   угод зробив би безкоштовну версію непридатною саме тоді, коли
   людина почала нею користуватись — тобто карав би за звичку, яку
   продукт і намагається виробити. Тому журнал, аналітика й
   калькулятор безкоштовні цілком, без стель.

   Платне — те, що коштує нам грошей на кожного користувача або
   працює, поки людина спить: термінал на VPS, бот, запити до моделі.
   Плюс масштаб — кілька рахунків. Це чесна межа, і головне, її не
   доведеться пересувати: вона проведена по нашій собівартості, а не
   по відчуттю «за це вже можна брати».

   Чого тут свідомо немає: лімітів на кількість угод, обмеження
   історії та урізаної аналітики. Журнал продає звичку, а звичка
   формується місяцями — ліміт спрацював би рівно тоді, коли людина
   почала вести записи регулярно, тобто вибивав би саме тих, хто мав
   заплатити. Аналітика ж і є причина заповнювати журнал: забрати її
   наполовину означає забрати сенс заповнювати.
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
  accounts: {
    title: 'Безлім рахунків',
    hint: 'Проп-челенджі, реал і демо окремо — з власною статистикою на кожному',
  },
  backtest: {
    title: 'Бектест',
    hint: 'Прогін стратегії по історії з тими самими метриками, що й у журналі',
  },
  ai: {
    title: 'AI-коуч',
    hint: 'Розбір твоїх угод: що повторюється, де втрачаєш і що робити завтра',
  },
};

export const isProFeature = (key) => key in PRO_FEATURES;

/* ------------------------------------------------------------------
   Межі безкоштовної версії.

   Один рахунок, а не нуль: безкоштовна версія має бути придатною для
   роботи назавжди, інакше нема чому звикати. Обмеження відчує тільки
   той, хто торгує кілька челенджів одночасно — тобто людина, яка вже
   платить пропу сотні доларів, і для якої підписка не питання.

   Жорстке правило: ліміт забороняє СТВОРЮВАТИ нове, але ніколи не
   ховає вже внесене. Скінчився Pro — рахунки лишаються видимими й
   редагованими, зупиняється тільки синхронізація. Ховати чужі дані
   за платіжною стіною — це заручники, а не тариф.
------------------------------------------------------------------ */
export const FREE_LIMITS = {
  accounts: 1,
};

/* Поточний стан доступу.

   Читаємо функцію бази, а не рахуємо дати в браузері. Термін дії,
   порахований клієнтом, — це термін дії, який клієнт може й
   переписати. */
export async function readSubscription() {
  const [{ data: sub }, { data: pro }, { data: orders }] = await Promise.all([
    supabase.from('subscriptions').select('plan,status,valid_until,trial_used_at').maybeSingle(),
    supabase.rpc('is_pro'),
    /* Історія платежів — щоб екран підписки показував факти, а не
       саму лише дату наступного списання.

       Беремо пʼять останніх: більше на цьому екрані нікому не
       потрібно, а хто захоче повну — питатиме в підтримці, і там
       усе одно дивитимуться в базу. */
    supabase
      .from('payment_orders')
      .select('reference,plan,amount,currency,status,created_at,paid_at,payload')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  /* Маску картки дістаємо з тіла останнього вдалого колбека.

     Своєї копії не тримаємо навмисно: навіть чотири останні цифри —
     це дані картки, і зберігати їх у власній колонці означає взяти
     на себе відповідальність там, де можна не брати. Тут вони просто
     лежать у збереженій відповіді банку, яку ми й так зобовʼязані
     мати для розборів. */
  const paid = (orders || []).find((o) => o.status === 'approved');
  const card = paid?.payload?.cardPan || null;

  return {
    plan: sub?.plan || 'free',
    status: sub?.status || 'inactive',
    validUntil: sub?.valid_until || null,
    /* Чи горів уже пробний період. Кнопку це не «захищає» — рішення
       все одно ухвалює сервер, — але дозволяє чесно підписати її
       заздалегідь, а не показувати «14 днів безкоштовно» тому, хто
       їх уже витратив. */
    trialUsed: !!sub?.trial_used_at,
    isPro: pro === true,

    /* Чим і коли платили востаннє. */
    card,
    cardType: paid?.payload?.cardType || null,
    lastPaidAt: paid?.paid_at || null,
    lastAmount: paid ? Number(paid.amount) : null,

    /* Уся історія — для списку внизу вкладки. */
    orders: (orders || []).map((o) => ({
      ref: o.reference,
      plan: o.plan,
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      at: o.paid_at || o.created_at,
    })),
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

/* Скасувати підписку.

   Робить це сервер: скасування означає похід у WayForPay з
   секретним ключем мерчанта, а він у браузері не живе. Звідси ж і
   єдина чесна відповідь про результат — якщо їхній API не
   підтвердив, ми не пишемо «скасовано».

   Доступ при цьому лишається до кінця оплаченого періоду. Забрати
   його в мить скасування технічно простіше й читається як помста
   за те, що людина пішла. */
export async function cancelSubscription() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Треба увійти');

  const r = await fetch('/api/wfp-cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || 'Не вдалось скасувати');
  return out;
}
