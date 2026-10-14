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
      'Привіт! Це Валера, я роблю THE EDGE.',
      `Твій журнал досі порожній. Автоімпорту з ${PLATFORM[platform] || 'твоєї платформи'} поки немає, тож внеси першу угоду вручну: це хвилина.`,
      'Після кількох угод журнал покаже результат у R, сесії і помилки, які коштують найдорожче. Щось незрозуміло — просто відповідай на цей лист.',
    ]
    : [
      'Привіт! Це Валера, я роблю THE EDGE.',
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
      `Лист надіслано, бо ти зареєструвався на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#6b6b75">Не надсилати нагадувань</a><br>Питання?`,
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
      `Лист надіслано, бо ти зареєструвався на theedgecat.com. <a href="${unsubUrl(uid)}" style="color:#6b6b75">Не надсилати нагадувань</a><br>Питання?`,
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
      await sendMail(u.email, m.subject, m.html);

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
