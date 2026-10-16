/* global process */
import crypto from 'node:crypto';
import { admin, site, sendMail, letter } from './_mono.mjs';

/* ==================================================================
   Нагадування новим юзерам, які ще нічого не внесли.

   24 год після реєстрації: 0 угод і MT5 не підключено → лист
   (і Telegram, якщо бот підключено). 3 дні: досі 0 угод → ще один
   лист. Перша угода чи MT5 зупиняють ланцюжок, бо перевіряємо факти
   перед кожною відправкою.

   Лише для тих, хто зареєструвався за останні 7 днів: перший деплой
   не має розіслати листи всім старим акаунтам разом.

   Кожен лист відправляється рівно один раз: рядок в onboard_mail
   захоплюється атомарним update «where sent_X_at is null», як у
   нагадуваннях про оплату. У кожному листі — посилання «не
   надсилати», воно ставить unsubscribed і тихо гасить ланцюжок.
================================================================== */

const H = 3600 * 1000;
const WINDOW_DAYS = 7;

const secret = () => process.env.UNSUB_SECRET || process.env.SUPABASE_SERVICE_KEY || '';
export const unsubToken = (uid) => crypto.createHmac('sha256', secret()).update(`unsub:${uid}`).digest('hex').slice(0, 32);
export const unsubUrl = (uid) => `${site()}/api/unsub?u=${encodeURIComponent(uid)}&t=${unsubToken(uid)}`;

export const digestUnsubUrl = (uid) => `${unsubUrl(uid)}&k=digest`;

export function checkUnsub(uid, token) {
  if (!uid || !token || !secret()) return false;
  const a = Buffer.from(unsubToken(uid));
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const PLATFORM = { ctrader: 'cTrader', match: 'Match-Trader', tradelocker: 'TradeLocker', other: 'твоєї платформи' };

function mail24(platform, uid) {
  const manual = platform && platform !== 'mt5';
  const lines = manual
    ? [
      'Привіт! Це розробник THE EDGE.',
      `Твій журнал досі порожній. Автоімпорту з ${PLATFORM[platform] || 'твоєї платформи'} поки немає, тож внеси першу угоду вручну: це хвилина.`,
      'Після кількох угод журнал покаже результат у R, сесії і помилки, які коштують найдорожче. Щось незрозуміло — просто відповідай на цей лист.',
    ]
    : [
      'Привіт! Це розробник THE EDGE.',
      'Твій журнал досі порожній. Підключи MT5: це 2 хвилини, доступ лише на читання, і угоди підтягнуться самі.',
      'Після цього журнал покаже win rate, результат у R і помилки, які коштують найдорожче. Щось незрозуміло — просто відповідай на цей лист.',
    ];
  return {
    subject: 'Твій журнал досі порожній',
    html: letter(
      'Твій журнал досі порожній',
      lines,
      manual
        ? { href: `${site()}/journal?new=1`, text: 'Внести першу угоду' }
        : { href: `${site()}/app?settings=connect`, text: 'Підключити MT5' },
      `Лист надіслано, бо ти зареєструвався на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#8E8E99">Не надсилати нагадувань</a><br>Питання?`,
    ),
  };
}

function mail3d(uid) {
  return {
    subject: '2 хвилини до твоєї першої статистики',
    html: letter(
      '2 хвилини до твоєї першої статистики',
      [
        'Три дні тому ти зареєструвався в THE EDGE, але угод у журналі ще немає.',
        'Внеси хоча б одну, вручну або через MT5, і подивись, як виглядає статистика. Не хочеш поки своїх — відкрий приклад на демо-угодах.',
      ],
      { href: `${site()}/app`, text: 'Відкрити журнал' },
      `Лист надіслано, бо ти зареєструвався на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#8E8E99">Не надсилати нагадувань</a><br>Питання?`,
    ),
  };
}

async function hasActivity(db, uid) {
  const [tr, mt] = await Promise.all([
    db.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    db.from('mt5_accounts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
  ]);
  if (tr.error || mt.error) return true; // не знаємо напевно — краще промовчати
  return (tr.count || 0) > 0 || (mt.count || 0) > 0;
}

async function claim(db, uid, col) {
  await db.from('onboard_mail').upsert({ user_id: uid }, { onConflict: 'user_id', ignoreDuplicates: true });
  const { data } = await db.from('onboard_mail')
    .update({ [col]: new Date().toISOString() })
    .eq('user_id', uid).eq('unsubscribed', false).is(col, null)
    .select('user_id');
  return !!data?.length;
}

export async function runOnboardingReminders() {
  if (process.env.ONBOARD_MAIL_OFF === '1' || !process.env.RESEND_API_KEY) return;
  const db = admin();
  const now = Date.now();

  /* Юзерів у нас сотні, а не мільйони: один запит на сторінку. */
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { console.error('onboard mail:', error.message); return; }

  const fresh = (data?.users || []).filter((u) => {
    const age = now - new Date(u.created_at).getTime();
    return u.email && age >= 24 * H && age <= WINDOW_DAYS * 24 * H;
  });
  if (!fresh.length) return;

  const { data: rows } = await db.from('onboard_mail').select('user_id,sent_24h_at,sent_3d_at,unsubscribed')
    .in('user_id', fresh.map((u) => u.id));
  const seen = new Map((rows || []).map((r) => [r.user_id, r]));

  for (const u of fresh) {
    try {
      const row = seen.get(u.id);
      if (row?.unsubscribed) continue;
      const age = now - new Date(u.created_at).getTime();
      const kind = age >= 72 * H ? '3d' : '24h';
      const col = kind === '3d' ? 'sent_3d_at' : 'sent_24h_at';
      if (row?.[col]) continue;
      /* Хто вже отримав 24-годинний лист лише що (наприклад, після
         простою сервера), не отримає другий у той самий день. */
      if (kind === '3d' && row?.sent_24h_at && now - new Date(row.sent_24h_at).getTime() < 24 * H) continue;

      if (await hasActivity(db, u.id)) continue;
      if (!(await claim(db, u.id, col))) continue;

      const { data: st } = await db.from('user_state').select('data')
        .eq('user_id', u.id).eq('key', 'onboard_v1').maybeSingle();
      const platform = st?.data?.platform || null;

      const m = kind === '3d' ? mail3d(u.id) : mail24(platform, u.id);
      await sendMail(u.email, m.subject, m.html, { kind: `onboard${kind}`, userId: u.id });

      if (kind === '24h') {
        const { data: tg } = await db.from('user_settings').select('tg_chat_id').eq('user_id', u.id).maybeSingle();
        if (tg?.tg_chat_id) {
          await db.from('tg_alerts').upsert({
            user_id: u.id,
            source: 'onboard',
            source_id: '24h',
            pair: 'THE EDGE',
            message: platform && platform !== 'mt5'
              ? 'Журнал досі порожній. Внеси першу угоду вручну, це хвилина: theedgecat.com/journal?new=1'
              : 'Журнал досі порожній. Підключи MT5 за 2 хвилини (лише читання), і угоди підтягнуться самі: theedgecat.com/app?settings=connect',
            alert_time: new Date().toISOString(),
            is_sent: false,
          }, { onConflict: 'user_id,source,source_id' });
        }
      }
      console.log(`onboard mail: ${kind} → ${u.id}`);
    } catch (e) {
      console.error('onboard mail:', u.id, e.message);
    }
  }
}

/* ==================================================================
   Листи повернення колишнім платникам.

   14 днів після кінця доступу — «що змінилось + чому пішов» (відповідь
   на лист іде просто розробнику). 30 днів — нагадування, що журнал і
   статистика нікуди не ділись, Free працює, а бектести й бот є в Lite
   за $5. Знижок не обіцяємо: промокоди видаються вручну.

   Лише ті, у кого доступ скінчився не раніше ніж 60 днів тому: перший
   деплой не розсилає листи всім, хто пішов колись. Знову оплатив або
   відписався — тиша. Кожен лист рівно один раз (claim як вище).
================================================================== */

function mailWb14(uid) {
  return {
    subject: 'Що змінилось у THE EDGE',
    html: letter(
      'Що змінилось у THE EDGE',
      [
        'Привіт! Це розробник THE EDGE. Два тижні тому закінчився твій доступ до платних розділів, і мені важливо зрозуміти, чому ти не лишився.',
        'Відтоді зʼявились тариф Lite за $5 (бектести без ліміту + Telegram-бот), нова анкета й чекліст старту. Журнал, аналітика й калькулятор на Free лишились безкоштовними, твої угоди на місці.',
        'Якщо чогось бракувало або щось бісило — просто відповідай на цей лист одним реченням. Я читаю кожен.',
      ],
      { href: `${site()}/app`, text: 'Відкрити журнал' },
      `Лист надіслано, бо в тебе був платний доступ на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#8E8E99">Не надсилати таких листів</a><br>Питання?`,
    ),
  };
}

function mailWb30(uid) {
  return {
    subject: 'Твій журнал на місці',
    html: letter(
      'Твій журнал на місці',
      [
        'Місяць тому скінчився твій доступ до платних розділів THE EDGE. Нічого не зникло: угоди, плани й статистика лежать там, де були, і журнал працює на Free.',
        'Якщо повертаєшся до тестування стратегій — Lite за $5/міс відкриває бектести без ліміту і Telegram-бота. Автоімпорт MT5 і кілька рахунків — у Pro.',
      ],
      { href: `${site()}/app?settings=billing&plan=lite`, text: 'Подивитись тарифи' },
      `Лист надіслано, бо в тебе був платний доступ на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#8E8E99">Не надсилати таких листів</a><br>Питання?`,
    ),
  };
}

export async function runWinback() {
  if (process.env.WINBACK_MAIL_OFF === '1' || !process.env.RESEND_API_KEY) return;
  const db = admin();
  const now = Date.now();
  const since = new Date(now - 60 * 24 * H).toISOString();
  const until = new Date(now - 14 * 24 * H).toISOString();

  const { data: subs, error } = await db.from('subscriptions')
    .select('user_id,status,valid_until,trial_used_at')
    .gte('valid_until', since).lte('valid_until', until);
  if (error) { console.error('winback:', error.message); return; }
  /* Ті, у кого був платний доступ (оплата чи тріал) і хто не
     продовжив. Тріал теж рахуємо: людина спробувала й пішла — саме
     її відповідь «чому» нам найцікавіша. Тому й тексти нейтральні:
     «закінчився доступ», а не «ти платив». */
  const gone = (subs || []).filter((s) => ['canceled', 'past_due', 'inactive', 'expired'].includes(s.status));
  if (!gone.length) return;

  for (const s of gone) {
    try {
      const age = now - new Date(s.valid_until).getTime();
      const kind = age >= 30 * 24 * H ? 'wb30' : 'wb14';
      const col = kind === 'wb30' ? 'sent_wb30_at' : 'sent_wb14_at';
      const { data: row } = await db.from('onboard_mail').select('sent_wb14_at,sent_wb30_at,unsubscribed').eq('user_id', s.user_id).maybeSingle();
      if (row?.unsubscribed || row?.[col]) continue;
      /* Два листи в один день — ні: хто не отримав 14-денний вчасно,
         отримає 30-денний не раніше ніж за тиждень після нього. */
      if (kind === 'wb30' && row?.sent_wb14_at && now - new Date(row.sent_wb14_at).getTime() < 7 * 24 * H) continue;
      if (!(await claim(db, s.user_id, col))) continue;

      const { data: u } = await db.auth.admin.getUserById(s.user_id);
      const email = u?.user?.email;
      if (!email) continue;
      const m = kind === 'wb30' ? mailWb30(s.user_id) : mailWb14(s.user_id);
      await sendMail(email, m.subject, m.html, { kind, userId: s.user_id });
      console.log(`winback: ${kind} → ${s.user_id}`);
    } catch (e) {
      console.error('winback:', s.user_id, e.message);
    }
  }
}

/* Для ручної перевірки листів (scripts/test-mail.mjs): усі шаблони
   без будь-якої логіки відбору. */
export const sampleMails = (uid = '00000000-0000-0000-0000-000000000000') => ({
  onboard24: mail24('mt5', uid),
  onboard3d: mail3d(uid),
  winback14: mailWb14(uid),
  winback30: mailWb30(uid),
});
