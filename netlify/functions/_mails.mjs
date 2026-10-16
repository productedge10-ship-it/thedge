/* global process */
import { admin, site, sendMail, letter, BG, blend, fmtDay, tierName } from './_mono.mjs';
import { unsubUrl, digestUnsubUrl } from './_onboard.mjs';

/* ==================================================================
   Службові листи поза оплатою й онбордингом:

   welcome   — одразу після підтвердження пошти;
   canceled  — підтвердження скасування підписки (billing-cancel);
   ended     — у день, коли закінчився оплачений доступ;
   digest    — тижневий підсумок у понеділок зранку;
   mt5       — автоімпорт MT5 зупинився (помилка входу або тиша);
   prop      — 90% ліміту пропа поштою, якщо Telegram не підключено.

   Кожен лист рівно один раз: рядок у mail_log (user_id, kind, ref)
   вставляється з ignoreDuplicates, і хто не вставив — не шле. ref —
   те, що робить подію унікальною: тиждень, дата кінця доступу,
   рахунок і день, коли він замовк.

   Перший деплой не має розіслати листи «за минуле»: кожна подія має
   вікно свіжості (години чи дні), старіші просто пропускаємо.
================================================================== */

const H = 3600 * 1000;
const D = 24 * H;
const off = () => process.env.MAIL_JOBS_OFF === '1' || !process.env.RESEND_API_KEY;

export async function claimMail(db, uid, kind, ref = '') {
  const { data, error } = await db.from('mail_log')
    .upsert({ user_id: uid, kind, ref: String(ref) }, { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
    .select('user_id');
  if (error) { console.error('mail_log:', error.message); return false; }
  return !!data?.length;
}

const emailOf = async (db, uid) => {
  const { data } = await db.auth.admin.getUserById(uid).catch(() => ({ data: null }));
  return data?.user?.email || null;
};

const isPaid = (s, now = Date.now()) => s && ['active', 'trialing'].includes(s.status)
  && (!s.valid_until || new Date(s.valid_until).getTime() > now);

/* ---------- дрібні блоки верстки ---------- */

const steps = (items) => ({
  html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 18px">${items.map((it, i) => `
<tr><td width="40" valign="top" style="padding:0 0 12px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" style="${BG('#1C1A2B')}border:1px solid #3A3463;border-radius:999px;color:#A498FF;font-size:13px;font-weight:700">${blend(String(i + 1))}</td></tr></table></td>
<td valign="top" style="padding:3px 0 12px">${blend(`<div style="color:#FAFAFA;font-size:15px;font-weight:700;line-height:1.4">${it.title}</div><div style="color:#8E8E99;font-size:14px;line-height:1.55;margin-top:2px">${it.text}</div>`)}</td></tr>`).join('')}</table>`,
});

const tiles = (items) => ({
  html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>${items.map((it, i) => `
<td width="${Math.floor(100 / items.length)}%" valign="top" style="padding:0 ${i < items.length - 1 ? 8 : 0}px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${BG('#18181C')}border:1px solid #2E2E36;border-radius:14px;padding:14px 12px">${blend(`<div style="color:#8E8E99;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${it.label}</div><div style="color:${it.color || '#FAFAFA'};font-size:22px;font-weight:700;margin-top:6px;white-space:nowrap">${it.value}</div>${it.sub ? `<div style="color:#8E8E99;font-size:12px;margin-top:2px">${it.sub}</div>` : ''}`)}</td></tr></table></td>`).join('')}</tr></table>`,
});

const note = (text, tone = 'acc') => {
  const c = { acc: ['#1C1A2B', '#3A3463', '#C9C2FF'], warn: ['#2A2213', '#5C4718', '#FCD877'], bad: ['#2A1616', '#5E2626', '#FCA5A5'] }[tone];
  return { html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="${BG(c[0])}border:1px solid ${c[1]};border-radius:14px;padding:14px 16px">${blend(`<div style="color:${c[2]};font-size:14px;line-height:1.6">${text}</div>`)}</td></tr></table>` };
};

const tier = (p) => (String(p || '').startsWith('lite') ? 'Lite' : tierName(p));
const r2 = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}R`;

/* ---------- шаблони ---------- */

export function mailWelcome() {
  return {
    subject: 'Ласкаво просимо в THE EDGE',
    html: letter('Ласкаво просимо в THE EDGE', [
      'Привіт! Це розробник THE EDGE. Дякую, що зареєструвався. Журнал допомагає побачити, що саме у твоїй торгівлі приносить гроші, а що їх забирає. Ось з чого почати:',
      steps([
        { title: 'Додай угоди', text: 'Підключи MT5 (2 хвилини, лише читання) або внеси першу угоду вручну, це хвилина.' },
        { title: 'Розбери кожну угоду', text: 'Чи йшов за планом, чи поспішав, що відчував. Через 10–20 угод журнал покаже твої дорогі помилки.' },
        { title: 'Плануй день', text: 'Торговий план і чекліст перед входом: менше імпульсних угод.' },
      ]),
      note('Хочеш спершу подивитись, як усе виглядає з даними? У журналі є приклад на демо-угодах.'),
      'Щось незрозуміло — просто відповідай на цей лист або пиши в Telegram.',
    ], { href: `${site()}/app`, text: 'Відкрити журнал' },
    'Лист надіслано, бо ти зареєструвався на theedgecat.com.<br>Питання?'),
  };
}

export function mailCanceled(plan, validUntil) {
  const tn = tier(plan);
  const until = validUntil ? fmtDay(validUntil) : null;
  return {
    subject: `Підписку ${tn} скасовано`,
    html: letter(`Підписку ${tn} скасовано`, [
      until
        ? `Автосписань більше не буде. Доступ до ${tn} лишається до <b style="color:#FAFAFA">${until}</b>, а далі акаунт перейде на Free.`
        : `Автосписань більше не буде. Акаунт перейде на Free.`,
      note('Нічого не зникне: угоди, плани, розбори й статистика лишаються. Журнал, аналітика й калькулятор на Free безкоштовні.'),
      'Передумаєш — підписку можна відновити будь-коли в налаштуваннях, з тими самими даними.',
    ], { href: `${site()}/app?settings=billing`, text: 'Налаштування підписки' },
    'Лист надіслано, бо ти скасував підписку на theedgecat.com<br>Питання?'),
  };
}

export function mailEnded(plan) {
  const tn = tier(plan);
  return {
    subject: `Доступ до ${tn} закінчився`,
    html: letter(`Доступ до ${tn} закінчився`, [
      `Сьогодні закінчився оплачений період ${tn}, і акаунт перейшов на Free.`,
      note('Твої угоди, плани й статистика на місці. Журнал, аналітика, калькулятор і ручні бектести працюють і далі безкоштовно.'),
      tn === 'Lite'
        ? 'Що закрилось: бектести на реальному графіку без ліміту і Telegram-бот.'
        : 'Що закрилось: автоімпорт MT5, Telegram-бот, контроль правил пропа і бектести на реальному графіку без ліміту.',
      'Повернутись можна в один клік, усе підхопиться з того ж місця.',
    ], { href: `${site()}/app?settings=billing`, text: 'Подивитись тарифи' },
    'Лист надіслано, бо в тебе був платний доступ на theedgecat.com<br>Питання?'),
  };
}

const MT5_HINT = (err) => {
  const e = String(err || '').toLowerCase();
  if (e.includes('authorization') || e.includes('invalid account') || e.includes('password')) {
    return 'Брокер не пускає за збереженими даними. Найчастіше змінився пароль інвестора або рахунок перенесли на інший сервер.';
  }
  if (e.includes('expired') || e.includes('disabled')) return 'Схоже, брокер закрив або архівував рахунок.';
  return 'Ми кілька разів не змогли підключитись до рахунку.';
};

export function mailMt5(acc) {
  const name = acc.account_title || [acc.broker, acc.login].filter(Boolean).join(' · ') || acc.login || 'MT5';
  return {
    subject: 'Автоімпорт MT5 зупинився',
    html: letter('Автоімпорт MT5 зупинився', [
      `Нові угоди з рахунку <b style="color:#FAFAFA">${name}</b> не надходять${acc.last_sync_at ? ` з ${fmtDay(acc.last_sync_at).replace(/\.$/, '')}` : ''}.`,
      note(MT5_HINT(acc.last_error), 'warn'),
      'Перевір сервер і пароль інвестора в налаштуваннях автоімпорту й збережи ще раз. Угоди за пропущені дні підтягнуться самі.',
    ], { href: `${site()}/app?settings=connect`, text: 'Перевірити підключення' },
    'Лист надіслано, бо в тебе підключений автоімпорт на theedgecat.com<br>Питання?'),
  };
}

export function mailProp(firm, kind, text) {
  const t = kind === 'total' ? `${firm}: загальна просадка біля межі` : `${firm}: денний ліміт майже вичерпано`;
  return {
    subject: `⚠️ ${t}`,
    html: letter(t, [
      note(text, 'bad'),
      kind === 'total'
        ? 'До зливу рахунку лишилось зовсім мало. Найкраще зараз — зупинитись і переглянути ризик.'
        : 'Найкраще сьогодні більше не входити: денний ліміт скидається з новим торговим днем.',
      'Підключи Telegram-бота в налаштуваннях, і такі попередження приходитимуть миттєво, ще на 70%.',
    ], { href: `${site()}/accounts`, text: 'Відкрити рахунок' },
    'Лист надіслано, бо в тебе увімкнений контроль правил пропа на theedgecat.com<br>Питання?'),
  };
}

export function mailDigest(uid, s) {
  const trend = s.prevNetR == null ? null : s.netR - s.prevNetR;
  const lines = [
    `Ось як пройшов твій тиждень ${s.range}.`,
    tiles([
      { label: 'Угод', value: String(s.total), sub: `${s.wins}W · ${s.losses}L · ${s.be}BE` },
      { label: 'Net R', value: r2(s.netR), color: s.netR > 0 ? '#34d399' : s.netR < 0 ? '#f87171' : '#FAFAFA', sub: trend == null ? '' : `${trend >= 0 ? '▲' : '▼'} ${r2(trend)} до мин.` },
      { label: 'Win rate', value: s.decided ? `${s.winrate}%` : '—', sub: s.decided ? `з ${s.decided} рішучих` : 'лише BE' },
    ]),
  ];
  if (s.money != null) lines.push(`Результат у грошах: <b style="color:${s.money >= 0 ? '#34d399' : '#f87171'}">${s.money >= 0 ? '+' : '−'}$${Math.abs(s.money).toFixed(0)}</b>.`);
  if (s.mistakes > 0) {
    lines.push(note(`Угод з помилкою: <b>${s.mistakes}</b>${s.mistakeR < 0 ? `, вони коштували <b>${r2(s.mistakeR)}</b>` : ''}.${s.topMistake ? ` Найчастіша: «${s.topMistake}».` : ''} Саме тут найпростіше додати до результату.`, 'warn'));
  } else if (s.reviewed > 0) {
    lines.push(note('Жодної угоди з позначеною помилкою. Так тримати.', 'acc'));
  }
  if (s.planPct != null) lines.push(`За планом: <b style="color:#FAFAFA">${s.planPct}%</b> угод.`);
  if (s.unreviewed > 0) lines.push(`Ще не розібрано: ${s.unreviewed} ${s.unreviewed === 1 ? 'угода' : 'угод'}. Розбір займає хвилину, а без нього статистика помилок неповна.`);
  return {
    subject: `Твій тиждень: ${r2(s.netR)}, ${s.total} ${s.total === 1 ? 'угода' : 'угод'}`,
    html: letter('Підсумок тижня', lines, { href: `${site()}/analytics`, text: 'Відкрити аналітику' },
      `Щопонеділка, лише якщо були угоди. <a href="${digestUnsubUrl(uid)}" style="color:#8E8E99">Не надсилати підсумки</a> · <a href="${unsubUrl(uid)}" style="color:#8E8E99">Вимкнути всі нагадування</a><br>Питання?`),
  };
}

const showVal = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? [x.name, x.profit_target_pct != null ? `${x.profit_target_pct}%` : null, x.min_trading_days != null ? `${x.min_trading_days} дн.` : null].filter(Boolean).join(' ') : x)).join(', ');
  return String(v).replace(/_/g, ' ');
};

/* Зміна правил пропа — після схвалення адміном, лише серйозні. */
export function mailPropRules(c) {
  const rows = (c.diff || []).slice(0, 8).map((d) => `<tr>
<td style="padding:10px 12px;border-top:1px solid #2E2E36;color:#8E8E99;font-size:13px">${blend(d.label)}</td>
<td style="padding:10px 12px;border-top:1px solid #2E2E36;color:#8E8E99;font-size:13px;text-decoration:line-through">${blend(showVal(d.old))}</td>
<td style="padding:10px 12px;border-top:1px solid #2E2E36;color:#FAFAFA;font-size:13px;font-weight:700">${blend(showVal(d.new))}</td></tr>`).join('');
  return {
    subject: `${c.firm} змінив правила (${c.program})`,
    html: letter(`${c.firm} змінив правила`, [
      `Програма <b style="color:#FAFAFA">${c.program}</b>. Ми помітили зміну на сайті ${c.firm} і перевірили її.`,
      note(c.conclusion || 'Подивись, що змінилось, перед наступною угодою.', 'warn'),
      { html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;${BG('#18181C')}border:1px solid #2E2E36;border-radius:14px;overflow:hidden">
<tr><td style="padding:10px 12px;color:#8E8E99;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${blend('Правило')}</td><td style="padding:10px 12px;color:#8E8E99;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${blend('Було')}</td><td style="padding:10px 12px;color:#8E8E99;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${blend('Стало')}</td></tr>${rows}</table>` },
      'Зазвичай нові правила діють для рахунків, куплених після зміни, а старі рахунки дограють за старими. Перевір це у своєму кабінеті пропа.',
    ], { href: `${site()}/prop-rules`, text: 'Правила мого пропа' },
    'Лист надіслано, бо в тебе в THE EDGE є рахунок цього пропа.<br>Питання?'),
  };
}

/* ---------- статистика тижня (те саме правило, що src/lib/tradeStats) ---------- */

const OUTCOME = { win: 'win', lose: 'loss', loss: 'loss', be: 'be', scratch: 'be' };
const outcomeOf = (r) => OUTCOME[String(r || '').trim().toLowerCase()] || null;
const rrOf = (t) => { const v = parseFloat(t?.rr); return Number.isFinite(v) ? v : 0; };
const signedR = (t) => {
  const v = rrOf(t);
  if (t?.source === 'mt5') return v;
  const o = outcomeOf(t?.result);
  if (o === 'win') return Math.abs(v);
  if (o === 'loss') return -Math.abs(v);
  if (o === 'be') return 0;
  return v;
};

export function weekStats(trades, prev) {
  const closed = (trades || []).filter((t) => outcomeOf(t.result));
  if (!closed.length) return null;
  let wins = 0, losses = 0, be = 0, netR = 0, mistakes = 0, mistakeR = 0, reviewed = 0, planYes = 0, planAns = 0;
  let money = 0, moneyN = 0;
  const cats = {};
  for (const t of closed) {
    const o = outcomeOf(t.result);
    if (o === 'win') wins++; else if (o === 'loss') losses++; else be++;
    const r = signedR(t);
    netR += r;
    const m = Number(t.profit_money);
    if (t.profit_money != null && Number.isFinite(m)) { money += m; moneyN++; }
    const rev = t.followed_plan != null || t.has_mistake != null || t.rushed != null || (t.trade_description || '').trim();
    if (rev) reviewed++;
    if (t.followed_plan != null) { planAns++; if (t.followed_plan) planYes++; }
    if (t.has_mistake) {
      mistakes++; mistakeR += Math.min(0, r);
      const c = String(t.mistake_category || '').trim();
      if (c) cats[c] = (cats[c] || 0) + 1;
    }
  }
  const prevClosed = (prev || []).filter((t) => outcomeOf(t.result));
  const decided = wins + losses;
  return {
    total: closed.length, wins, losses, be, decided,
    winrate: decided ? Math.round((wins / decided) * 100) : 0,
    netR: Math.round(netR * 100) / 100,
    prevNetR: prevClosed.length ? Math.round(prevClosed.reduce((a, t) => a + signedR(t), 0) * 100) / 100 : null,
    money: moneyN === closed.length ? money : null,
    mistakes, mistakeR: Math.round(mistakeR * 100) / 100,
    topMistake: Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    reviewed, unreviewed: closed.length - reviewed,
    planPct: planAns ? Math.round((planYes / planAns) * 100) : null,
  };
}

/* Понеділок попереднього тижня (за Києвом) і неділя — рядки YYYY-MM-DD,
   бо plan_date у trades — текстова дата. */
const kyivDate = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lastWeek(now = new Date()) {
  const k = kyivDate(now);
  const dow = (k.getDay() + 6) % 7; // 0 = понеділок
  const mon = new Date(k.getFullYear(), k.getMonth(), k.getDate() - dow - 7);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const pmon = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 7);
  const pSun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1);
  const f = (d) => d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return { from: ymd(mon), to: ymd(sun), pFrom: ymd(pmon), pTo: ymd(pSun), range: `${f(mon)} – ${f(sun)}`, kyiv: k };
}

const TRADE_COLS = 'user_id,result,rr,source,profit_money,followed_plan,has_mistake,rushed,mistake_category,trade_description,plan_date';

async function fetchTrades(db, from, to, uid) {
  const out = [];
  for (let p = 0; ; p++) {
    let q = db.from('trades').select(TRADE_COLS).gte('plan_date', from).lte('plan_date', to)
      .order('id').range(p * 1000, p * 1000 + 999);
    if (uid) q = q.eq('user_id', uid);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/* ---------- задачі ---------- */

async function runWelcome(db) {
  const now = Date.now();
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) { console.error('welcome:', error.message); return; }
  for (const u of data?.users || []) {
    const at = u.email_confirmed_at || u.confirmed_at;
    if (!u.email || !at || now - new Date(at).getTime() > 6 * H) continue;
    if (!(await claimMail(db, u.id, 'welcome'))) continue;
    const m = mailWelcome();
    await sendMail(u.email, m.subject, m.html, { kind: 'welcome', userId: u.id });
    console.log('mail: welcome →', u.id);
  }
}

async function runEnded(db) {
  const now = Date.now();
  const { data, error } = await db.from('subscriptions').select('user_id,plan,plan_id,status,valid_until')
    .gte('valid_until', new Date(now - 3 * D).toISOString()).lte('valid_until', new Date(now).toISOString());
  if (error) { console.error('ended:', error.message); return; }
  for (const s of data || []) {
    if (['active', 'trialing'].includes(s.status)) continue; // продовжиться списанням
    if (!(await claimMail(db, s.user_id, 'ended', String(s.valid_until).slice(0, 10)))) continue;
    const email = await emailOf(db, s.user_id);
    if (!email) continue;
    const m = mailEnded(s.plan_id || s.plan);
    await sendMail(email, m.subject, m.html, { kind: 'ended', userId: s.user_id });
    console.log('mail: ended →', s.user_id);
  }
}

async function runMt5(db) {
  const now = Date.now();
  const { data, error } = await db.from('mt5_accounts')
    .select('id,user_id,status,last_error,last_sync_at,created_at,broker,login,account_title')
    .gte('last_sync_at', new Date(now - 7 * D).toISOString());
  if (error) { console.error('mt5 mail:', error.message); return; }
  const stale = (data || []).filter((a) => {
    const quiet = now - new Date(a.last_sync_at).getTime();
    if (a.status === 'error') return quiet > 2 * H;
    /* Тиша без помилки: воркер міг просто не дійти (Free після Pro не
       синкається — це не поломка), тому лише для платних і після 12 год. */
    return a.status === 'active' && quiet > 12 * H;
  });
  if (!stale.length) return;
  const { data: subs } = await db.from('subscriptions').select('user_id,status,valid_until')
    .in('user_id', [...new Set(stale.map((a) => a.user_id))]);
  const paid = new Set((subs || []).filter((s) => isPaid(s, now)).map((s) => s.user_id));
  for (const a of stale) {
    if (!paid.has(a.user_id)) continue;
    if (!(await claimMail(db, a.user_id, 'mt5', `${a.id}:${String(a.last_sync_at).slice(0, 10)}`))) continue;
    const email = await emailOf(db, a.user_id);
    if (!email) continue;
    const m = mailMt5(a);
    await sendMail(email, m.subject, m.html, { kind: 'mt5', userId: a.user_id });
    console.log('mail: mt5 →', a.user_id);
  }
}

async function runDigest(db) {
  const w = lastWeek();
  /* Понеділок, з 9:00 до 14:00 за Києвом: тік раз на 15 хв, тож усі
     встигнуть, а пізніше в тиждень підсумок «минулого тижня» вже ні до чого. */
  if (w.kyiv.getDay() !== 1 || w.kyiv.getHours() < 9 || w.kyiv.getHours() >= 14) return;
  if (process.env.DIGEST_OFF === '1') return;

  const trades = await fetchTrades(db, w.from, w.to);
  const by = new Map();
  for (const t of trades) { if (!by.has(t.user_id)) by.set(t.user_id, []); by.get(t.user_id).push(t); }
  if (!by.size) return;

  const users = [...by.keys()];
  const [{ data: sent }, { data: opt }] = await Promise.all([
    db.from('mail_log').select('user_id').eq('kind', 'digest').eq('ref', w.from).in('user_id', users),
    db.from('onboard_mail').select('user_id,unsubscribed,digest_off').in('user_id', users),
  ]);
  const skip = new Set([...(sent || []).map((r) => r.user_id),
    ...(opt || []).filter((r) => r.unsubscribed || r.digest_off).map((r) => r.user_id)]);

  for (const uid of users) {
    if (skip.has(uid)) continue;
    try {
      const s = weekStats(by.get(uid), await fetchTrades(db, w.pFrom, w.pTo, uid));
      if (!s) continue;
      if (!(await claimMail(db, uid, 'digest', w.from))) continue;
      const email = await emailOf(db, uid);
      if (!email) continue;
      const m = mailDigest(uid, { ...s, range: w.range });
      await sendMail(email, m.subject, m.html, { kind: 'digest', userId: uid });
      console.log('mail: digest →', uid);
    } catch (e) {
      console.error('digest:', uid, e.message);
    }
  }
}

export async function runMailJobs() {
  if (off()) return;
  const db = admin();
  for (const [name, job] of [['welcome', runWelcome], ['ended', runEnded], ['mt5', runMt5], ['digest', runDigest]]) {
    try { await job(db); } catch (e) { console.error(`mail ${name}:`, e.message); }
  }
}

/* Підтвердження скасування — викликає billing-cancel. Ніколи не кидає. */
export async function sendCanceledMail(db, user, sub) {
  try {
    if (off() || !user?.email) return;
    if (!(await claimMail(db, user.id, 'canceled', String(sub?.valid_until || '').slice(0, 10)))) return;
    const m = mailCanceled(sub?.plan_id || sub?.plan, sub?.valid_until);
    await sendMail(user.email, m.subject, m.html, { kind: 'canceled', userId: user.id });
  } catch (e) {
    console.error('mail canceled:', e.message);
  }
}

/* Для scripts/test-mail.mjs: усі нові листи на прикладах. */
export const sampleMails2 = (uid = '00000000-0000-0000-0000-000000000000') => ({
  welcome: mailWelcome(),
  canceled: mailCanceled('pro_monthly', new Date(Date.now() + 12 * D).toISOString()),
  ended: mailEnded('pro_monthly'),
  mt5: mailMt5({ broker: 'FTMO-Server', login: '1510234', last_sync_at: new Date(Date.now() - D).toISOString(), last_error: "terminal: (-6, 'Terminal: Authorization failed')" }),
  proprules: mailPropRules({ firm: 'FundedNext', program: 'Stellar 2-Step', conclusion: 'Денний ліміт тепер 4% замість 5%, а торгівля за 5 хвилин до і після важливих новин заборонена і на етапах оцінки. Запас на день менший — зменш ризик на угоду.', diff: [{ label: 'Денний ліміт, %', old: 5, new: 4 }, { label: 'Торгівля на новинах', old: 'restricted_funded_only', new: 'restricted_all' }, { label: 'Вікно навколо новин, хв', old: 2, new: 5 }] }),
  prop: mailProp('FTMO', 'day', 'FTMO: використано 92% денного ліміту (−4 600 $ з −5 000 $). Лишилось 400 $ до порушення.'),
  digest: mailDigest(uid, {
    range: '5 жовтня – 11 жовтня', total: 12, wins: 6, losses: 4, be: 2, decided: 10, winrate: 60,
    netR: 4.35, prevNetR: 1.2, money: 870, mistakes: 3, mistakeR: -2.4, topMistake: 'Вхід без підтвердження',
    reviewed: 10, unreviewed: 2, planPct: 75,
  }),
});
