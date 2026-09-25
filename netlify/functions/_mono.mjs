/* ==================================================================
   Оплата через monobank (plata by mono) — спільне для всіх функцій.

   Файл з підкресленням: server.mjs маршрутизує лише те, що явно
   перелічено в WEB_ROUTES, тож назовні цей модуль недоступний. Це
   бібліотека, а не адреса.

   --------------------------------------------------------------
   Як влаштована підписка.

   WayForPay списував регулярні платежі сам. У mono регулярного
   списання «з відкладеним стартом» немає, тому схема інша:

   1. Тріал. Рахунок на 1 ₴ з saveCard: людина платить карткою, Apple
      Pay чи Google Pay, нам приходить токен, і гривню ми одразу
      повертаємо (invoice/cancel). Доступ Pro — на 14 днів.
      Не `verification` на 0 ₴: на такій сторінці mono показує лише
      поле номера картки, без Apple Pay / Google Pay, а підтримка mono
      підтвердила, що перевірити їх без суми неможливо.
   2. Далі списуємо ми самі: server.mjs раз на 15 хвилин запускає
      runDueCharges(), яка знаходить підписки з next_charge_at у
      минулому й платить токеном (wallet/payment, initiationKind =
      merchant — «платіж без участі клієнта»).
   3. Без тріалу (пробний уже був) — звичайний рахунок на повну суму,
      теж із saveCard, щоб наступні місяці списувались токеном.

   Доступ, як і раніше, відкриває лише підтверджений результат від
   банку: підписаний вебхук або синхронна відповідь на наш власний
   серверний запит. Браузер нічого не вмикає.

   --------------------------------------------------------------
   Гроші.

   Тариф живе в доларах ($15 / $144), списуємо гривню за курсом НБУ
   на день списання — так само, як ціна в гривнях показана на сайті.
   Якщо мерчанту ввімкнуть валютний еквайринг, MONO_CCY=840 перемикає
   списання на долари без правок коду.
================================================================== */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { usdUahRate } from '../../api/rate.js';

export const API = 'https://api.monobank.ua';
export const TRIAL_DAYS = 14;
/* Перевірочне списання під тріал, у гривнях. Повертається одразу. */
export const TRIAL_CHECK_UAH = 1;

/* Скільки після дати списання доступ ще живе. Списання йде раз на 15
   хвилин і може застрягнути в банку — людина не має втрачати Pro
   посеред торгового дня через те, що наш планувальник спізнився. */
const GRACE_MS = 24 * 3600 * 1000;

/* Скільки разів пробуємо невдале чергове списання (раз на добу). */
export const MAX_ATTEMPTS = 3;

/* Дзеркало src/lib/billing.js — ціна в доларах. Сервер бере суму
   звідси, а не з браузера. */
export const PLANS = {
  pro_monthly: { title: 'The Edge Pro — місяць', usd: 15, period: 'monthly' },
  pro_yearly: { title: 'The Edge Pro — рік', usd: 144, period: 'yearly' },
};

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

export const site = () => (process.env.SITE_URL || 'https://theedgecat.com').replace(/\/+$/, '');

export const admin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('немає SUPABASE_URL / SUPABASE_SERVICE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
};

export const newReference = () =>
  `EJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

/* ---------- запити до mono ---------- */

export async function mono(path, { method = 'GET', body, query } = {}) {
  const token = process.env.MONO_TOKEN;
  if (!token) throw new Error('не задано MONO_TOKEN');
  const url = new URL(API + path);
  Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url, {
    method,
    headers: { 'X-Token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`mono ${path} ${r.status}: ${data.errText || data.errCode || text.slice(0, 200)}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ---------- сума списання ---------- */

/* Повертає і мінорні одиниці для банку, і «людську» суму для нашої
   історії платежів. Гривня округлюється до цілої — так само, як ціна
   на сайті: копійки в підписці читаються як недбалість. */
export async function priceFor(planId) {
  const plan = PLANS[planId];
  if (!plan) throw new Error(`невідомий тариф ${planId}`);

  if (String(process.env.MONO_CCY || '980') === '840') {
    return { ccy: 840, currency: 'USD', amount: plan.usd, minor: Math.round(plan.usd * 100) };
  }
  const { rate } = await usdUahRate();
  const uah = Math.round(plan.usd * rate);
  return { ccy: 980, currency: 'UAH', amount: uah, minor: uah * 100 };
}

/* ---------- захист пробного періоду ----------

   Пробний період — один на людину, а не на акаунт: новий акаунт
   створюється за хвилину. Тому памʼятаємо не акаунт, а те, що
   змінити важче:

   • картку — маска PAN (перші 6 і останні 4 цифри) і платіжна система.
     З Apple / Google Pay банк бачить номер-замінник пристрою, тож
     та сама картка вручну й через гаманець дає різні мітки.
     Нову картку за хвилину не заведеш;
   • пошту в нормальному вигляді — у Gmail «ivan.petrov+1@gmail.com» і
     «ivanpetrov@gmail.com» одна скринька.

   У базі лежить лише sha256 від цього — не сама маска й не адреса. */
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function normEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at).split('+')[0];
  let domain = e.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/* Одноразові скриньки: пробний період з них не даємо (оплатити
   можна). Список короткий навмисно — найпоширеніші сервіси. */
const DISPOSABLE = new Set([
  'mailinator.com', 'yopmail.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net',
  'temp-mail.io', 'tempmailo.com', 'throwawaymail.com', 'getnada.com', 'nada.email',
  'dispostable.com', 'maildrop.cc', 'mohmal.com', 'fakeinbox.com', 'trashmail.com',
  'mail.tm', 'mailto.plus', '1secmail.com', '1secmail.org', 'emailondeck.com', 'mintemail.com',
  'spamgourmet.com', 'moakt.com', 'tmpmail.org', 'tmpmail.net', 'burnermail.io', 'inboxkitten.com',
]);
export const isDisposable = (email) => DISPOSABLE.has(normEmail(email).split('@')[1] || '');

export const emailMark = (email) => sha(`email:${normEmail(email)}`);
export function cardMark(info) {
  const pan = String(info?.maskedPan || '').replace(/[^0-9*]/g, '');
  /* Потрібно щонайменше 4 останні цифри. mono зараз віддає маску
     «43260979******08» — 8 цифр BIN і лише 2 останні. У всіх карток
     одного продукту банку BIN однаковий, тож на 2 цифрах збіг — кожна
     сота картка: при сотні клієнтів одного банку чесні люди масово
     отримували б «картку вже використано». Тому з такою маскою картку
     не перевіряємо взагалі (mark = null) — захищають пошта й MT5. Якщо
     mono почне віддавати 4 цифри, перевірка ввімкнеться сама. */
  if (!/^\d{6,8}\*+\d{4}$/.test(pan)) return null;
  return sha(`card:${pan.slice(0, 6)}${pan.slice(-4)}:${String(info?.paymentSystem || '').toLowerCase()}`);
}

/* Чи вже брав тріал хтось ІНШИЙ з цією міткою. */
export async function markTakenByOther(db, kind, hash, userId) {
  if (!hash) return false;
  const { data } = await db.from('trial_marks').select('user_id').eq('kind', kind).eq('hash', hash).limit(1);
  return !!(data?.[0] && data[0].user_id !== userId);
}

/* Закріпити мітку за людиною. Первинний ключ (kind, hash) не дасть
   двом акаунтам одночасно записати ту саму картку — другий побачить
   чужого власника й тріалу не отримає. */
export async function claimMark(db, kind, hash, userId) {
  if (!hash) return true;
  await db.from('trial_marks').upsert({ kind, hash, user_id: userId }, { onConflict: 'kind,hash', ignoreDuplicates: true });
  const { data } = await db.from('trial_marks').select('user_id').eq('kind', kind).eq('hash', hash).limit(1);
  return !data?.[0] || data[0].user_id === userId;
}

/* ---------- знижка за промокодом ----------

   Береться з бази, а не з браузера: відсоток, який прислав клієнт, —
   це відсоток, який він собі й намалював. Лічильник знижених оплат
   зменшується лише в applyInvoice, коли банк справді провів платіж:
   відмова картки не має зʼїдати людині знижку. */
export async function promoFor(db, userId) {
  const { data } = await db.from('promo_redemptions')
    .select('id,percent,charges_left')
    .eq('user_id', userId).eq('kind', 'percent').gt('charges_left', 0)
    .order('redeemed_at', { ascending: true }).limit(1);
  const r = data?.[0];
  return r && r.percent > 0 && r.percent < 100 ? r : null;
}

export function discounted(price, percent) {
  if (!percent) return price;
  const k = 1 - percent / 100;
  if (price.ccy === 840) {
    const minor = Math.max(100, Math.round(price.minor * k));
    return { ...price, minor, amount: minor / 100 };
  }
  /* Гривня — ціла, як і в priceFor. */
  const uah = Math.max(1, Math.round(price.amount * k));
  return { ...price, amount: uah, minor: uah * 100 };
}

const CCY_CODE = { UAH: 980, USD: 840, EUR: 978 };

/* ---------- підпис вебхука ----------

   mono підписує тіло вебхука ECDSA-ключем, відкриту частину якого
   віддає /api/merchant/pubkey. Ключ кешуємо, але якщо підпис не
   зійшовся — перечитуємо один раз: банк міг його змінити, і без
   цього всі вебхуки до перезапуску сервера відкидались би. */
let pubKeyCache = null;

async function pubKey(force = false) {
  if (pubKeyCache && !force) return pubKeyCache;
  const { key } = await mono('/api/merchant/pubkey');
  pubKeyCache = Buffer.from(key, 'base64').toString('utf8');
  return pubKeyCache;
}

const verifyWith = (pem, raw, sign) => {
  try {
    return crypto.createVerify('SHA256').update(raw).verify(pem, Buffer.from(sign, 'base64'));
  } catch {
    return false;
  }
};

export async function verifySignature(raw, sign) {
  if (!sign) return false;
  if (verifyWith(await pubKey(), raw, sign)) return true;
  return verifyWith(await pubKey(true), raw, sign);
}

/* ---------- дати ---------- */

const addPeriod = (from, period) => {
  const d = new Date(from);
  if (period === 'trial') d.setDate(d.getDate() + TRIAL_DAYS);
  else if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

/* ---------- пошта ----------

   Листи — приємний додаток, а не частина оплати: будь-яка помилка тут
   лише пишеться в лог і ніколи не зриває запис підписки. Немає ключа
   Resend — листів просто немає. */
export async function sendMail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'The Edge <hello@theedgecat.com>',
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error('mail: Resend відповів', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('mail: не вдалось надіслати —', e.message);
  }
}

export const fmtDay = (d) => new Date(d).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });

/* Лист у кольорах застосунку. Табличною версткою й інлайн-стилями:
   поштові клієнти (особливо Gmail і Outlook) викидають <style> і
   половину сучасного CSS. */
export const letter = (title, lines, cta) => `<!doctype html><html><body style="margin:0;background:#0a0a0c;padding:32px 12px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#111116;border:1px solid #26262c;border-radius:18px" cellpadding="0" cellspacing="0">
<tr><td style="padding:32px 32px 8px;color:#8b7bff;font-size:12px;font-weight:bold;letter-spacing:3px">THE EDGE</td></tr>
<tr><td style="padding:8px 32px 0;color:#fafafa;font-size:24px;font-weight:bold;line-height:1.25">${title}</td></tr>
<tr><td style="padding:16px 32px 0;color:#b4b4bd;font-size:15px;line-height:1.6">${lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join('')}</td></tr>
<tr><td style="padding:12px 32px 32px"><a href="${cta.href}" style="display:inline-block;background:#8b7bff;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 26px;border-radius:12px">${cta.text}</a></td></tr>
</table>
<p style="color:#4a4a52;font-size:12px;margin:18px 0 0">Лист надіслано, бо ти оформив підписку на theedgecat.com</p>
</td></tr></table></body></html>`;

async function thankYou(db, userId, kind, { nextCharge, amount, currency }) {
  const { data } = await db.auth.admin.getUserById(userId).catch(() => ({ data: null }));
  const email = data?.user?.email;
  if (!email) return;
  const app = `${site()}/app`;
  const money = currency === 'UAH' ? `${Number(amount).toLocaleString('uk-UA')} ₴` : `$${amount}`;

  if (kind === 'verify') {
    await sendMail(email, 'Pro активовано — 14 днів безкоштовно', letter(
      'Дякуємо, що з нами!',
      [
        'Картку привʼязано, Pro уже працює: автоімпорт з MetaTrader 5, Telegram-бот, бектест і до 5 рахунків.',
        `Наступні ${TRIAL_DAYS} днів безкоштовні: 1 ₴ за перевірку картки ми вже повернули. Перше списання — <b style="color:#fafafa">${fmtDay(nextCharge)}</b>. Скасувати можна будь-коли в налаштуваннях, до цієї дати гроші не знімаються.`,
      ],
      { href: app, text: 'Відкрити журнал' },
    ));
  } else {
    await sendMail(email, 'Дякуємо за підписку на The Edge Pro', letter(
      'Дякуємо за підписку!',
      [
        `Оплату ${money} отримано, Pro активовано.`,
        `Наступне списання — <b style="color:#fafafa">${fmtDay(nextCharge)}</b>. Керувати підпискою можна в налаштуваннях.`,
      ],
      { href: app, text: 'Відкрити журнал' },
    ));
  }
}

/* ==================================================================
   Застосувати стан рахунку до замовлення й підписки.

   Одна функція для всіх джерел: вебхук, синхронна відповідь на
   списання токеном і ручна перевірка статусу. Тому вона мусить бути
   ідемпотентною: той самий «success» може прийти тричі (відповідь,
   вебхук, повтор вебхука), а гроші й доступ — рівно один раз.

   Кидає помилку, якщо не вдався запис у базу, — тоді вебхук отримує
   500 і mono повторить його.
================================================================== */
export async function applyInvoice(db, body, { trusted = false } = {}) {
  const ref = body?.reference;
  const invoiceId = body?.invoiceId;
  const status = body?.status;

  const must = ({ error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); };

  let order = null;
  if (ref) ({ data: order } = await db.from('payment_orders').select('*').eq('reference', ref).maybeSingle());
  if (!order && invoiceId) ({ data: order } = await db.from('payment_orders').select('*').eq('invoice_id', invoiceId).maybeSingle());

  if (!order) {
    console.error('mono: невідоме замовлення', ref, invoiceId, status);
    return { ok: false, reason: 'unknown' };
  }

  /* Токен картки. Може прийти в будь-якому вебхуку рахунку з
     saveCardData, зокрема окремим листом про зміну статусу токена. */
  const wd = body.walletData;
  if (wd?.cardToken && wd.status === 'created') {
    must(await db.from('subscriptions').update({
      card_token: wd.cardToken,
      wallet_id: wd.walletId || order.user_id,
      updated_at: new Date().toISOString(),
    }).eq('user_id', order.user_id), 'subscriptions token');
  }

  /* Застарілі листи. Порядок доставки mono не гарантує: success
     може прийти раніше за processing. Актуальний — з більшим
     modifiedDate. */
  const prevAt = Date.parse(order.payload?.modifiedDate || '') || 0;
  const thisAt = Date.parse(body.modifiedDate || '') || 0;
  if (prevAt && thisAt && thisAt < prevAt) return { ok: true, reason: 'stale' };

  /* Уже застосоване «оплачено» нічим, крім повернення, не
     перезаписуємо — повтор листа не має продовжувати доступ удруге. */
  if (order.status === 'approved' && status !== 'reversed') return { ok: true, reason: 'done' };

  const patchOrder = (fields) => db.from('payment_orders')
    .update({ payload: body, ...(invoiceId ? { invoice_id: invoiceId } : {}), ...fields })
    .eq('id', order.id);

  /* Тріал уже відмовлено (картка чужа) — повтор листа нічого не міняє. */
  if (order.payload?.trial_denied) return { ok: true, reason: 'done' };

  if (status === 'success') {
    /* Сума й валюта. Підпис доводить, що лист від mono, але не що
       списали стільки, скільки ми виставляли. */
    const wantMinor = Math.round(Number(order.amount) * 100);
    const wantCcy = CCY_CODE[String(order.currency).toUpperCase()];
    if (!trusted && (Number(body.amount) !== wantMinor || (body.ccy && Number(body.ccy) !== wantCcy))) {
      console.error('mono: сума чи валюта не та', order.reference, body.amount, body.ccy, 'очікували', wantMinor, wantCcy);
      return { ok: false, reason: 'amount' };
    }

    const { data: sub } = await db.from('subscriptions')
      .select('next_charge_at,trial_used_at,card_token,wallet_id')
      .eq('user_id', order.user_id).maybeSingle();

    /* Картку привʼязали для тріалу — перевіряємо, чи не брав уже тріал
       хтось інший із цією карткою. Якщо брав: гривню повертаємо, тріалу
       не даємо, а на екрані підписки людина побачить чому й зможе
       оформити звичайну оплату. */
    if (order.kind === 'verify') {
      const mark = cardMark(body.paymentInfo);
      const mine = await claimMark(db, 'card', mark, order.user_id);
      if (!mine) {
        must(await patchOrder({ status: 'refunded', payload: { ...body, trial_denied: 'card' } }), 'payment_orders');
        must(await db.from('subscriptions').upsert({
          user_id: order.user_id,
          ...(sub ? {} : { plan: 'free', status: 'inactive' }),
          trial_used_at: sub?.trial_used_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' }), 'subscriptions');
        if (invoiceId || order.invoice_id) {
          await mono('/api/merchant/invoice/cancel', {
            method: 'POST',
            body: { invoiceId: invoiceId || order.invoice_id, extRef: `refund-${order.reference}` },
          }).catch((e) => console.error('mono: гривню не повернуто —', order.reference, e.message));
        }
        console.warn('mono: тріал відмовлено, картка вже використана', order.user_id);
        return { ok: true, reason: 'trial_denied' };
      }
    }

    const now = new Date();
    const period = order.kind === 'verify' ? 'trial'
      : (order.plan === 'pro_yearly' ? 'yearly' : 'monthly');

    /* Чергове списання продовжує від запланованої дати, а не від
       «зараз»: якщо планувальник спізнився на годину, людина не має
       щомісяця губити цю годину. */
    const base = order.kind === 'renew' && sub?.next_charge_at
      ? new Date(Math.max(Date.parse(sub.next_charge_at), now.getTime() - GRACE_MS))
      : now;
    const next = addPeriod(base, period);

    must(await patchOrder({ status: 'approved', paid_at: now.toISOString() }), 'payment_orders');

    /* Оплата зі знижкою пройшла — списуємо одну з N знижених оплат.
       Сюди доходимо один раз на замовлення: повторний вебхук по вже
       approved зупиняється вище. */
    if (order.promo_id) {
      const { data: pr } = await db.from('promo_redemptions')
        .select('charges_left').eq('id', order.promo_id).maybeSingle();
      if (pr?.charges_left > 0) {
        await db.from('promo_redemptions').update({ charges_left: pr.charges_left - 1 }).eq('id', order.promo_id);
      }
    }

    must(await db.from('subscriptions').upsert({
      user_id: order.user_id,
      plan: 'pro',
      provider: 'mono',
      plan_id: order.plan,
      status: order.kind === 'verify' ? 'trialing' : 'active',
      next_charge_at: next.toISOString(),
      valid_until: new Date(next.getTime() + GRACE_MS).toISOString(),
      charge_attempts: 0,
      charge_lock: null,
      wallet_id: sub?.wallet_id || order.user_id,
      ...(wd?.cardToken && wd.status === 'created' ? { card_token: wd.cardToken } : {}),
      last_order: order.reference,
      updated_at: now.toISOString(),
      /* Тріал вважається використаним лише коли картку справді
         привʼязано: дійти до сторінки оплати й закрити її — ще не
         тріал. */
      ...(order.kind === 'verify' && !sub?.trial_used_at ? { trial_used_at: now.toISOString() } : {}),
    }, { onConflict: 'user_id' }), 'subscriptions');

    /* Перевірочну гривню повертаємо одразу. Після запису доступу і без
       права зірвати його: не повернулась — видно в логах, повернемо
       руками в кабінеті, а людина тим часом уже має свій тріал. */
    if (order.kind === 'verify' && Number(order.amount) > 0 && (invoiceId || order.invoice_id)) {
      await mono('/api/merchant/invoice/cancel', {
        method: 'POST',
        body: { invoiceId: invoiceId || order.invoice_id, extRef: `refund-${order.reference}` },
      }).catch((e) => console.error('mono: перевірочну гривню не повернуто —', order.reference, e.message));
    }

    if (order.kind !== 'renew') {
      await thankYou(db, order.user_id, order.kind, {
        nextCharge: next, amount: order.amount, currency: order.currency,
      });
    }
    return { ok: true, reason: 'applied' };
  }

  if (status === 'failure' || status === 'expired') {
    must(await patchOrder({ status: 'declined' }), 'payment_orders');

    if (order.kind === 'renew') {
      /* Чергове списання не пройшло. Доступ не відбираємо — він
         згасне сам із valid_until. Пробуємо ще раз через добу, до
         MAX_ATTEMPTS разів, і чесно показуємо past_due. */
      const { data: sub } = await db.from('subscriptions')
        .select('charge_attempts,status').eq('user_id', order.user_id).maybeSingle();
      const attempts = (sub?.charge_attempts || 0) + 1;
      if (sub?.status !== 'canceled') {
        must(await db.from('subscriptions').update({
          status: 'past_due',
          charge_attempts: attempts,
          charge_lock: null,
          next_charge_at: attempts < MAX_ATTEMPTS ? new Date(Date.now() + GRACE_MS).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq('user_id', order.user_id), 'subscriptions');
      }
    }
    return { ok: true, reason: 'declined' };
  }

  if (status === 'reversed') {
    /* Повернення робить власник у кабінеті — доступ тут не чіпаємо,
       як і з WayForPay: закрити його, якщо треба, — окреме рішення. */
    must(await patchOrder({ status: 'refunded' }), 'payment_orders');
    return { ok: true, reason: 'refunded' };
  }

  /* created / processing / hold — справа ще йде. Запамʼятовуємо лише
     номер рахунку, стан не чіпаємо. */
  if (invoiceId && !order.invoice_id) {
    must(await db.from('payment_orders').update({ invoice_id: invoiceId }).eq('id', order.id), 'payment_orders');
  }
  return { ok: true, reason: 'pending' };
}

/* ==================================================================
   Чергові списання.

   Запускається з server.mjs раз на 15 хвилин. Бере підписки, в яких
   настала дата списання, і платить токеном картки.

   Захист від подвійного списання — головне в цій функції:
   • підписку спершу «захоплюємо» (charge_lock) одним атомарним
     update — два процеси одночасно одну підписку не візьмуть;
   • якщо по підписці вже висить незавершене чергове замовлення, нове
     не створюємо, а питаємо в банку статус старого.
================================================================== */
export async function runDueCharges() {
  if (!process.env.MONO_TOKEN || process.env.MONO_BILLING_OFF === '1') return;
  const db = admin();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await db.from('subscriptions')
    .select('user_id,plan_id,card_token,wallet_id,status')
    .eq('provider', 'mono')
    .in('status', ['trialing', 'active', 'past_due'])
    .lte('next_charge_at', nowIso)
    .or(`charge_lock.is.null,charge_lock.lt.${nowIso}`)
    .limit(25);

  if (error) { console.error('mono cron: вибірка —', error.message); return; }

  for (const s of due || []) {
    try {
      await chargeOne(db, s);
    } catch (e) {
      console.error('mono cron:', s.user_id, e.message);
    }
  }
}

async function chargeOne(db, s) {
  const nowIso = new Date().toISOString();

  /* Захоплення. Якщо рядок уже взяв хтось інший — select поверне
     порожньо, і ми тихо йдемо далі. */
  const { data: claimed } = await db.from('subscriptions')
    .update({ charge_lock: new Date(Date.now() + 30 * 60_000).toISOString() })
    .eq('user_id', s.user_id)
    .lte('next_charge_at', nowIso)
    .or(`charge_lock.is.null,charge_lock.lt.${nowIso}`)
    .select('user_id');
  if (!claimed?.length) return;

  /* Незавершене замовлення з попереднього проходу — спершу з'ясовуємо
     його долю, а не платимо вдруге. */
  const { data: open } = await db.from('payment_orders')
    .select('id,reference,invoice_id,created_at')
    .eq('user_id', s.user_id).eq('kind', 'renew').eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1);
  const pending = open?.[0];
  if (pending) {
    if (pending.invoice_id) {
      const st = await mono('/api/merchant/invoice/status', { query: { invoiceId: pending.invoice_id } });
      await applyInvoice(db, { ...st, reference: pending.reference });
      return;
    }
    /* Запит пішов, а відповіді не було (обрив мережі). Годину чекаємо
       на вебхук — у ньому буде наш reference. Далі вважаємо, що
       списання не відбулось, і пробуємо знову. */
    if (Date.now() - Date.parse(pending.created_at) < 3600_000) return;
    await db.from('payment_orders').update({ status: 'declined' }).eq('id', pending.id);
  }

  /* Токен. Якщо окремий вебхук із ним загубився — питаємо гаманець. */
  let cardToken = s.card_token;
  if (!cardToken) {
    const w = await mono('/api/merchant/wallet', { query: { walletId: s.wallet_id || s.user_id } }).catch(() => null);
    cardToken = w?.wallet?.[0]?.cardToken || null;
    if (cardToken) await db.from('subscriptions').update({ card_token: cardToken }).eq('user_id', s.user_id);
  }

  const planId = s.plan_id || 'pro_monthly';
  const reference = newReference();

  if (!cardToken) {
    /* Списувати нічим — чергових спроб не плануємо, доступ згасне
       сам із valid_until, а в налаштуваннях буде past_due. */
    console.error('mono cron: немає токена картки', s.user_id);
    await db.from('subscriptions').update({
      status: 'past_due', charge_lock: null, next_charge_at: null, updated_at: nowIso,
    }).eq('user_id', s.user_id);
    return;
  }

  const promo = await promoFor(db, s.user_id);
  const price = discounted(await priceFor(planId), promo?.percent);
  const { error: insErr } = await db.from('payment_orders').insert({
    user_id: s.user_id, reference, plan: planId, amount: price.amount,
    currency: price.currency, status: 'pending', provider: 'mono', kind: 'renew',
    ...(promo ? { promo_id: promo.id } : {}),
  });
  if (insErr) throw new Error(`payment_orders: ${insErr.message}`);

  const out = await mono('/api/merchant/wallet/payment', {
    method: 'POST',
    body: {
      cardToken,
      amount: price.minor,
      ccy: price.ccy,
      initiationKind: 'merchant',
      webHookUrl: `${site()}/api/mono-callback`,
      merchantPaymInfo: {
        reference,
        destination: PLANS[planId].title,
        basketOrder: [{ name: PLANS[planId].title, qty: 1, sum: price.minor, total: price.minor, unit: 'шт.', code: planId }],
      },
    },
  });

  await db.from('payment_orders').update({ invoice_id: out.invoiceId }).eq('reference', reference);

  /* Відповідь на наш власний серверний запит — довірена: суму ми
     щойно виставили самі. Остаточні стани застосовуємо одразу,
     processing чекає на вебхук. */
  if (out.status === 'success' || out.status === 'failure') {
    await applyInvoice(db, {
      invoiceId: out.invoiceId, reference, status: out.status,
      amount: price.minor, ccy: price.ccy,
      modifiedDate: out.modifiedDate || new Date().toISOString(),
      failureReason: out.failureReason,
    });
  }
}
