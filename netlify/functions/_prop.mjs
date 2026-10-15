import { admin, sendMail } from './_mono.mjs';
import { claimMail, mailProp } from './_mails.mjs';

/* ==================================================================
   Автоконтроль правил пропфірми (Pro).

   Для кожного активного проп-рахунку з підключеним MT5 рахуємо дві
   речі, які зливають челендж:

   • денний збиток — від балансу на початок торгового дня до поточного
     equity (відкриті позиції теж рахуються, як у пропів);
   • загальна просадка — від стартового балансу етапу до equity.

   Обидві — у відсотках від розміру рахунку, як у FTMO і більшості
   пропів. Перетнули 70% або 90% свого ліміту — у Telegram
   іде попередження (черга tg_alerts, бот лише вичерпує її). Один
   рівень — один раз: денний на кожен день, загальний на весь етап
   (унікальний індекс user_id+source+source_id і ignoreDuplicates).

   Торговий день починається опівночі за Прагою (CE(S)T) — так рахує
   FTMO, і саме так його бачать більшість пропів.
================================================================== */

const LEVELS = [90, 70];
const TZ = 'Europe/Prague';

const dayKey = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/* Північ за Прагою в UTC: зсув зони беремо з самого Intl, бо літній
   і зимовий час різні. */
function dayStartUtc(now = new Date()) {
  const key = dayKey(now);
  const guess = new Date(`${key}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).formatToParts(guess);
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  return new Date(guess.getTime() - h * 3600_000);
}

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const money = (v, cur) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)} ${cur || '$'}`;

export async function runPropAlerts() {
  if (process.env.PROP_ALERTS_OFF === '1') return;
  const db = admin();
  const now = new Date();

  const { data: accs, error } = await db.from('prop_accounts')
    .select('id,user_id,firm_name,initial_balance,max_daily_loss_pct,max_total_loss_pct,mt5_account_id,status')
    .eq('status', 'Active').not('mt5_account_id', 'is', null);
  if (error) { console.error('prop alerts:', error.message); return; }
  if (!accs?.length) return;

  const users = [...new Set(accs.map((a) => a.user_id))];
  const [{ data: subs }, { data: tgs }] = await Promise.all([
    db.from('subscriptions').select('user_id,plan,status,valid_until').in('user_id', users),
    db.from('user_settings').select('user_id,tg_chat_id').in('user_id', users),
  ]);
  const pro = new Set((subs || []).filter((s) => s.plan === 'pro' && ['active', 'trialing'].includes(s.status)
    && (!s.valid_until || new Date(s.valid_until) > now)).map((s) => s.user_id));
  const tg = new Set((tgs || []).filter((t) => t.tg_chat_id).map((t) => t.user_id));

  const day = dayKey(now);
  const from = dayStartUtc(now).toISOString();

  for (const a of accs) {
    if (!pro.has(a.user_id)) continue;
    try {
      const [{ data: mt }, { data: ph }] = await Promise.all([
        db.from('mt5_accounts').select('balance,equity,currency').eq('id', a.mt5_account_id).eq('user_id', a.user_id).maybeSingle(),
        db.from('account_phases').select('id,label,starting_balance,daily_loss_pct,max_drawdown_pct')
          .eq('account_id', a.id).eq('user_id', a.user_id).eq('status', 'active').maybeSingle(),
      ]);
      const equity = n(mt?.equity) ?? n(mt?.balance);
      if (equity == null) continue;

      /* База — розмір рахунку (initial_balance): так рахують FTMO і
         більшість пропів, і на 2-му етапі баланс знову стартує з нього.
         starting_balance етапу — запасний варіант, якщо розміру немає. */
      const base = n(a.initial_balance) || n(ph?.starting_balance);
      if (!base) continue;
      const dailyPct = n(ph?.daily_loss_pct) ?? n(a.max_daily_loss_pct);
      const totalPct = n(ph?.max_drawdown_pct) ?? n(a.max_total_loss_pct);
      const cur = mt?.currency || '$';
      const alerts = [];

      if (dailyPct > 0) {
        /* Баланс на початок дня: останній знімок до півночі, інакше
           перший сьогоднішній. Немає знімків — денний не рахуємо:
           краще промовчати, ніж налякати неправдою. */
        let { data: snap } = await db.from('mt5_snapshots').select('balance')
          .eq('account_id', a.mt5_account_id).lt('taken_at', from).order('taken_at', { ascending: false }).limit(1).maybeSingle();
        if (!snap) {
          ({ data: snap } = await db.from('mt5_snapshots').select('balance')
            .eq('account_id', a.mt5_account_id).gte('taken_at', from).order('taken_at', { ascending: true }).limit(1).maybeSingle());
        }
        const startDay = n(snap?.balance);
        if (startDay) {
          const lost = Math.max(0, startDay - equity);
          const limit = (dailyPct / 100) * base;
          const share = limit > 0 ? (lost / limit) * 100 : 0;
          const lvl = LEVELS.find((l) => share >= l);
          if (lvl) {
            alerts.push({
              kind: 'day', lvl,
            source_id: `${a.id}:day:${day}:${lvl}`,
              message: `⚠️ ${a.firm_name}: використано ${Math.round(share)}% денного ліміту (${money(-lost, cur)} з ${money(-limit, cur)}). Лишилось ${money(Math.max(0, limit - lost), cur)} до порушення. ${lvl >= 90 ? 'Краще закінчити день.' : 'Зменш ризик на наступні угоди.'}`,
            });
          }
        }
      }

      if (totalPct > 0) {
        const lost = Math.max(0, base - equity);
        const limit = (totalPct / 100) * base;
        const share = limit > 0 ? (lost / limit) * 100 : 0;
        const lvl = LEVELS.find((l) => share >= l);
        if (lvl) {
          alerts.push({
            kind: 'total', lvl,
            source_id: `${a.id}:total:${ph?.id || 'acc'}:${lvl}`,
            message: `🚨 ${a.firm_name}: загальна просадка — ${Math.round(share)}% ліміту (${money(-lost, cur)} з ${money(-limit, cur)}). До зливу рахунку ${money(Math.max(0, limit - lost), cur)}.`,
          });
        }
      }

      for (const al of alerts) {
        /* Без Telegram — лише 90% і поштою: лист на кожні 70% був би
           спамом, а 90% — це вже «зупинись». */
        if (!tg.has(a.user_id)) {
          if (al.lvl < 90 || !process.env.RESEND_API_KEY) continue;
          if (!(await claimMail(db, a.user_id, 'prop', al.source_id))) continue;
          const { data: u } = await db.auth.admin.getUserById(a.user_id).catch(() => ({ data: null }));
          if (!u?.user?.email) continue;
          const m = mailProp(a.firm_name || 'Prop', al.kind, al.message.replace(/^\S+\s/, ''));
          await sendMail(u.user.email, m.subject, m.html);
          continue;
        }
        const { error: e2 } = await db.from('tg_alerts').upsert({
          user_id: a.user_id,
          source: 'prop',
          source_id: al.source_id,
          pair: a.firm_name || 'Prop',
          message: al.message,
          alert_time: now.toISOString(),
          is_sent: false,
        }, { onConflict: 'user_id,source,source_id', ignoreDuplicates: true });
        if (e2) console.error('prop alerts:', a.id, e2.message);
      }
    } catch (e) {
      console.error('prop alerts:', a.id, e.message);
    }
  }
}

export { dayKey, dayStartUtc };
