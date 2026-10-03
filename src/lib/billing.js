import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { onlyMine } from './myId';
import { t as tx, LOCALE } from './lang';
import { openVerifyEmail } from './emailGate';

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
    title: tx('Pro · місяць', 'Pro · monthly'),
    amount: 15,
    currency: CURRENCY,
    period: 'monthly',
    perMonth: '$15',
    label: tx('$15 / місяць', '$15 / month'),
  },
  pro_yearly: {
    id: 'pro_yearly',
    title: tx('Pro · рік', 'Pro · yearly'),
    amount: 144,
    currency: CURRENCY,
    period: 'yearly',
    perMonth: '$12',
    label: tx('$12 / місяць', '$12 / month'),
    note: tx('$144 на рік — на $36 дешевше', '$144 per year — save $36'),
  },
};

/* Пробний період — безкоштовний: людина лише привʼязує картку, а
   перше списання відбувається через TRIAL_DAYS днів. Рішення команди:
   навіть символічний долар на вході відлякує сильніше, ніж допомагає
   відсіяти неробочі картки.

   TRIAL_HOLD лишається для старих замовлень WayForPay, де привʼязка
   йшла списанням $1. У mono привʼязка — 1 ₴, яку сервер одразу
   повертає: без суми mono не показує Apple Pay / Google Pay. */
export const TRIAL_DAYS = 14;
export const TRIAL_HOLD = 1;
export const TRIAL_HOLD_LABEL = tx('Безкоштовно', 'Free');
export const TRIAL_NOTE = tx('Привʼязка картки: 1 ₴ на перевірку, одразу повертаємо', 'Card link: a small verification charge, refunded instantly');

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

export const fmtUah = (n) => (n == null ? '' : `${new Intl.NumberFormat(LOCALE).format(n)} ₴`);

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
  if (String(currency).toUpperCase() === 'UAH') return `${n.toLocaleString(LOCALE)} ₴`;
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
    title: tx('Підключення MetaTrader', 'MetaTrader connection'),
    hint: tx('Угоди приїжджають із термінала самі — разом зі свічками, стопами й часом у ринку', 'Trades flow in from the terminal on their own — with candles, stops and time in the market'),
  },
  telegram: {
    title: tx('Telegram-бот', 'Telegram bot'),
    hint: tx('Нова угода, підсумок дня, таймери з плану — у чат', 'New trades, daily summary, plan timers — right in your chat'),
  },
  accounts: {
    title: tx('До 5 рахунків', 'Up to 5 accounts'),
    hint: tx('Проп-челенджі, реал і демо окремо — з власною статистикою на кожному', 'Prop challenges, live and demo kept apart — each with its own stats'),
  },
  backtest: {
    title: tx('Бектест', 'Backtest'),
    hint: tx('Прогін стратегії по історії з тими самими метриками, що й у журналі', 'Run your strategy on historical data with the same metrics as your journal'),
  },
  ai: {
    title: tx('AI-коуч', 'AI coach'),
    hint: tx('Розбір твоїх угод: що повторюється, де втрачаєш і що робити завтра', 'A breakdown of your trades: what repeats, where you lose, and what to do tomorrow'),
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
/* Нові колонки mono можуть ще не існувати, якщо код викотили раніше
   за SQL-міграцію. Тоді читаємо старий набір — екран підписки не
   має ламатись через порядок деплою. */
const readSubRow = async () => {
  /* onlyMine повертає вже виконаний запит, тож maybeSingle — всередині. */
  const r = await onlyMine(supabase.from('subscriptions')
    .select('plan,status,valid_until,trial_used_at,next_charge_at,plan_id,provider').maybeSingle());
  if (!r.error) return r;
  return onlyMine(supabase.from('subscriptions').select('plan,status,valid_until,trial_used_at').maybeSingle());
};

export async function readSubscription() {
  const [{ data: sub }, { data: pro }, { data: orders }, { data: promos }, { data: block }] = await Promise.all([
    readSubRow(),
    supabase.rpc('is_pro'),
    /* Історія платежів — щоб екран підписки показував факти, а не
       саму лише дату наступного списання.

       Беремо пʼять останніх: більше на цьому екрані нікому не
       потрібно, а хто захоче повну — питатиме в підтримці, і там
       усе одно дивитимуться в базу. */
    onlyMine(supabase
      .from('payment_orders')
      .select('reference,plan,amount,currency,status,created_at,paid_at,payload')
      .order('created_at', { ascending: false })
      .limit(5)),
    /* Активна знижка за промокодом. Таблиці може ще не бути (SQL не
       виконано) — тоді просто без знижки. */
    onlyMine(supabase
      .from('promo_redemptions')
      .select('percent,charges_left')
      .eq('kind', 'percent')
      .gt('charges_left', 0)
      .limit(1)).catch(() => ({ data: null })),
    /* Окремим запитом: колонки може ще не бути, і тоді падає лише він,
       а не весь стан підписки. */
    onlyMine(supabase.from('subscriptions').select('trial_block').maybeSingle())
      .catch(() => ({ data: null })),
  ]);

  /* Знижка запрошеного за реферальним посиланням — лише на першу
     оплату. Сервер бере більшу з двох (промокод чи реферал), тож і
     тут показуємо більшу. Функції може ще не бути — тоді без неї. */
  let refPct = 0;
  try {
    const { data, error } = await supabase.rpc('my_ref_discount');
    if (!error) refPct = Number(data) || 0;
  } catch { refPct = 0; }
  const promoRow = promos?.[0] || null;
  const promo = refPct > 0 && refPct >= (promoRow?.percent || 0)
    ? { percent: refPct, charges_left: 1 }
    : promoRow;

  /* Маску картки дістаємо з тіла останнього вдалого колбека.

     Своєї копії не тримаємо навмисно: навіть чотири останні цифри —
     це дані картки, і зберігати їх у власній колонці означає взяти
     на себе відповідальність там, де можна не брати. Тут вони просто
     лежать у збереженій відповіді банку, яку ми й так зобовʼязані
     мати для розборів. */
  /* Перевірочна гривня тріалу одразу повертається (refunded), але
     картку саме нею й привʼязали — тож маску беремо і звідти. */
  const paid = (orders || []).find((o) => o.status === 'approved')
    || (orders || []).find((o) => o.status === 'refunded' && o.payload?.paymentInfo?.maskedPan);
  /* WayForPay кладе маску в cardPan, mono — у paymentInfo.maskedPan. */
  const card = paid?.payload?.cardPan || paid?.payload?.paymentInfo?.maskedPan || null;
  const sys = paid?.payload?.paymentInfo?.paymentSystem;

  return {
    plan: sub?.plan || 'free',
    status: sub?.status || 'inactive',
    validUntil: sub?.valid_until || null,
    /* Дата списання окремо від кінця доступу: у mono доступ живе на
       добу довше за дату списання (запас на затримку банку), і
       показувати людині треба саме день, коли знімуть гроші. */
    nextChargeAt: sub?.next_charge_at || null,
    planId: sub?.plan_id || null,
    /* crypto — передоплата без автосписань: екран підписки показує
       «оплачено до» й кнопку продовження замість скасування. */
    provider: sub?.provider || null,
    /* Чи горів уже пробний період. Кнопку це не «захищає» — рішення
       все одно ухвалює сервер, — але дозволяє чесно підписати її
       заздалегідь, а не показувати «14 днів безкоштовно» тому, хто
       їх уже витратив. */
    trialUsed: !!sub?.trial_used_at,
    /* Останню привʼязку картки відхилено: з цією карткою тріал уже
       брали на іншому акаунті. Гривню повернули — кажемо чому. */
    trialDenied: orders?.[0]?.payload?.trial_denied === 'card',
    /* Пробний період закрито, бо на ньому підключали MT5-рахунок,
       уже використаний на пробному з іншого акаунта. */
    trialBlock: block?.trial_block || null,
    isPro: pro === true,
    /* { percent, left } — знижка, яку сервер застосує до наступних оплат. */
    discount: promo ? { percent: promo.percent, left: promo.charges_left } : null,

    /* Чим і коли платили востаннє. */
    card,
    cardType: paid?.payload?.cardType || (sys ? sys[0].toUpperCase() + sys.slice(1) : null),
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

/* Погасити промокод. Усі перевірки — у функції бази redeem_promo:
   активність, строк, ліміт, один раз на людину. Тут лише показуємо
   відповідь. */
/* Реферальний код (8 символів) працює і як промокод: введений у тому
   ж полі, він закріплює запрошувача й дає знижку на першу оплату.
   Звичайні промокоди — 12 символів, тож переплутати їх не вийде. */
const REF_ERRORS = {
  no_code: tx('Такого коду немає', 'No such code'),
  self: tx('Це твій власний код — поділись ним із другом', 'That’s your own code — share it with a friend'),
  already: tx('Ти вже прийшов за іншим запрошенням', 'You’re already linked to another invite'),
  already_paid: tx('Цей код діє лише до першої оплати', 'This code only works before your first payment'),
  not_signed_in: tx('Треба увійти', 'Please sign in'),
};

async function redeemReferral(code) {
  const { data, error } = await supabase.rpc('claim_referral', { p_code: code, p_manual: true });
  if (error) {
    if (error.code === 'PGRST202') throw new Error(tx('Такого промокоду немає', 'No such promo code'));
    throw new Error(error.message);
  }
  if (!data?.ok) throw new Error(REF_ERRORS[data?.error] || tx('Код не застосувався', 'The code didn’t apply'));
  /* Партнерський код може бути й без знижки — тоді просто «прийнято». */
  return data.discount > 0
    ? { kind: 'percent', percent: data.discount, months: 1 }
    : { kind: 'referral' };
}

export async function redeemPromo(code) {
  const clean = String(code || '').trim().toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{8}$/.test(clean)) return redeemReferral(clean);
  const { data, error } = await supabase.rpc('redeem_promo', { p_code: code });
  if (error) {
    if (error.code === 'PGRST202') throw new Error(tx('Промокоди ще не ввімкнені', 'Promo codes aren\'t enabled yet'));
    throw new Error(error.message || tx('Не вдалось застосувати промокод', 'Couldn\'t apply the promo code'));
  }
  if (!data?.ok) throw new Error(data?.error || tx('Такого промокоду немає', 'No such promo code'));
  return data;
}

/* Почати оплату (plata by mono).

   Уся робота — на сервері: він вирішує суму й право на тріал,
   створює рахунок у mono й віддає посилання на платіжну сторінку.
   Браузер лише переходить за ним. Токен мерчанта сюди не потрапляє. */
export async function startCheckout(planId, { trial = false } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(tx('Треба увійти', 'Please sign in'));

  const r = await fetch('/api/mono-pay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan: planId, trial }),
  });

  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.url) throw checkoutError(out);

  window.location.assign(out.url);
}

/* Помилка оплати з кодом від сервера. Окремо обробляємо непідтверджену
   пошту: сервер відмовляє (email_unverified), і замість тихої відмови
   одразу відкриваємо вікно підтвердження — інакше людина тисне кнопку
   й не розуміє, чому нічого не відбувається. */
function checkoutError(out) {
  if (out?.code === 'email_unverified') openVerifyEmail();
  return Object.assign(
    new Error(out?.error || tx('Не вдалось створити рахунок', 'Couldn\'t create the invoice')),
    { code: out?.code },
  );
}

/* Оплата криптою (NOWPayments). Лише повний період наперед — тріалу
   немає, бо гаманець не можна привʼязати для списання через 14 днів. */
export async function startCryptoCheckout(planId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(tx('Треба увійти', 'Please sign in'));

  const r = await fetch('/api/np-pay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ plan: planId }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.url) throw checkoutError(out);
  window.location.assign(out.url);
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
  if (!session) throw new Error(tx('Треба увійти', 'Please sign in'));

  /* Один маршрут для обох систем: сервер сам знає, чим оформлена
     підписка (mono чи старий WayForPay). */
  const r = await fetch('/api/billing-cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.error || tx('Не вдалось скасувати', 'Couldn\'t cancel'));
  return out;
}
