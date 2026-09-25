/* ==================================================================
   Створення рахунку в mono.

   Клієнт називає лише ТАРИФ і чи хоче пробний період. Суму, тріал і
   того, хто платить, вирішує сервер: сума — з PLANS, користувач — з
   токена сесії, право на тріал — з бази. Інакше будь-хто з консолі
   попросив би рахунок на гривню за річний тариф або тріал удруге.
================================================================== */

import {
  PLANS, TRIAL_DAYS, TRIAL_CHECK_UAH, json, site, admin, newReference, mono, priceFor,
  promoFor, discounted, emailMark, isDisposable, markTakenByOther, claimMark,
} from './_mono.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!process.env.MONO_TOKEN) {
    console.error('mono pay: не задано MONO_TOKEN');
    return json({ error: 'Оплата ще не налаштована' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  const planId = body?.plan;
  if (!PLANS[planId]) return json({ error: 'Невідомий тариф' }, 400);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Треба увійти' }, 401);

  let db;
  try { db = admin(); } catch (e) {
    console.error('mono pay:', e.message);
    return json({ error: 'Сервер не налаштований' }, 500);
  }

  const { data: { user } = {}, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Сесія застаріла' }, 401);

  /* Купівля — лише з підтвердженою поштою: на неї йдуть листи про
     списання й чеки. Прапорець ставить тільки наш сервер після кліку
     в листі, тож з браузера його не підробити. */
  const { data: prof } = await db.from('profiles').select('email_verified').eq('id', user.id).maybeSingle();
  if (prof?.email_verified !== true) {
    return json({ error: 'Підтверди пошту, щоб оформити підписку', code: 'email_unverified' }, 403);
  }

  const { data: sub } = await db.from('subscriptions')
    .select('trial_used_at,status,valid_until,plan')
    .eq('user_id', user.id).maybeSingle();

  /* Уже є діючий Pro — другий рахунок не виставляємо: інакше подвійний
     клік чи друга вкладка дають дві підписки й два списання. */
  const live = sub?.plan === 'pro'
    && ['active', 'trialing', 'past_due'].includes(sub?.status)
    && (!sub.valid_until || Date.parse(sub.valid_until) > Date.now());
  if (live) return json({ error: 'Підписка вже активна' }, 409);

  let trial = body?.trial === true && !sub?.trial_used_at;

  /* Тріал на одноразову скриньку чи на пошту, з якої його вже брали
     (з точністю до крапок і +тегів у Gmail), — не даємо. Не мовчки
     повною ціною, а чесною відповіддю: людина бачить причину й сама
     вирішує, чи платити. Картку перевіримо окремо, коли її привʼяжуть. */
  if (trial) {
    const mark = emailMark(user.email);
    const reason = isDisposable(user.email) ? 'Пробний період недоступний для тимчасових скриньок'
      : await markTakenByOther(db, 'email', mark, user.id) ? 'Пробний період з цією поштою вже використано'
      : !(await claimMark(db, 'email', mark, user.id)) ? 'Пробний період з цією поштою вже використано'
      : null;
    if (reason) {
      await db.from('subscriptions').upsert({
        user_id: user.id,
        ...(sub ? {} : { plan: 'free', status: 'inactive' }),
        trial_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      return json({ error: `${reason}. Підписку можна оформити звичайною оплатою.`, code: 'trial_used' }, 409);
    }
  }
  const plan = PLANS[planId];
  const reference = newReference();

  /* Знижка — лише на справжню оплату. Перевірочна гривня тріалу
     знижки не зʼїдає: вона дістанеться першому списанню після тріалу. */
  const promo = trial ? null : await promoFor(db, user.id);

  let price;
  try {
    /* Тріал — перевірочна гривня, а не verification на 0 ₴. Сторінка
       verification приймає лише номер картки, а Apple Pay / Google Pay
       mono показує тільки там, де є списання (підтверджено підтримкою
       mono). Гривню повертаємо одразу після успіху — див. applyInvoice. */
    price = trial ? { amount: TRIAL_CHECK_UAH, minor: TRIAL_CHECK_UAH * 100, ccy: 980, currency: 'UAH' }
      : discounted(await priceFor(planId), promo?.percent);
  } catch (e) {
    console.error('mono pay: курс —', e.message);
    return json({ error: 'Не вдалось порахувати суму, спробуй за хвилину' }, 502);
  }

  const { error: insErr } = await db.from('payment_orders').insert({
    user_id: user.id,
    reference,
    plan: planId,
    amount: price.amount,
    currency: price.currency,
    status: 'pending',
    provider: 'mono',
    kind: trial ? 'verify' : 'charge',
    ...(promo ? { promo_id: promo.id } : {}),
  });
  if (insErr) {
    console.error('mono pay: замовлення —', insErr.message);
    return json({ error: 'Не вдалось створити рахунок' }, 500);
  }

  const title = trial ? `${plan.title} — ${TRIAL_DAYS} днів безкоштовно` : plan.title;

  try {
    const out = await mono('/api/merchant/invoice/create', {
      method: 'POST',
      body: {
        amount: price.minor,
        ccy: price.ccy,
        paymentType: 'debit',
        /* Гаманець — id користувача: один гаманець на людину, і токен
           завжди можна знайти, навіть якщо вебхук із ним загубився. */
        saveCardData: { saveCard: true, walletId: user.id },
        merchantPaymInfo: {
          reference,
          destination: title,
          customerEmails: user.email ? [user.email] : [],
          basketOrder: [{
            name: trial ? 'Перевірка картки (буде повернено)' : title,
            qty: 1, sum: price.minor, total: price.minor, unit: 'шт.', code: trial ? 'card_check' : planId,
          }],
        },
        redirectUrl: `${site()}/app?paid=1`,
        webHookUrl: `${site()}/api/mono-callback`,
        validity: 3600,
      },
    });

    await db.from('payment_orders').update({ invoice_id: out.invoiceId }).eq('reference', reference);
    return json({ url: out.pageUrl });
  } catch (e) {
    console.error('mono pay: invoice/create —', e.message);
    await db.from('payment_orders').update({ status: 'declined' }).eq('reference', reference);
    return json({ error: 'Платіжна система не відповіла. Спробуй за хвилину' }, 502);
  }
};
