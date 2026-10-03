import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Loader2, Send, Gift, Users, Wallet, Sparkles, Crown } from 'lucide-react';

import { T, EASE } from '../../lib/theme';
import { t } from '../../lib/lang';
import Button from '../ui/Button';
import { REF_USER_PERCENT, refLink, readMyReferral } from '../../lib/referral';
import { PLANS, toUah, useUahRate } from '../../lib/billing';

/* ==================================================================
   Settings → Referral.

   Два обличчя однієї вкладки:
   • звичайний юзер — шкала: що більше запрошених зараз платять,
     то більший % з першої оплати кожного нового. Нараховане
     знімається з власної підписки;
   • партнер (видав адмін) — фіксований %, знижка для його людей і
     облік «нараховано / виплачено / до виплати». Шкали в нього
     немає: його умови домовлені окремо.

   Цифри — з функції бази my_referral, браузер нічого не рахує.
================================================================== */

/* Ховер — світлом, а не рухом (правило проєкту): рамка стає
   акцентною, під карткою зʼявляється ореол. !important — бо рамка
   задана інлайном, а інлайн переважає клас. */
const HOVER_CSS = `
  .rf-card { transition: border-color .2s ease, box-shadow .25s ease, background-color .2s ease; }
  .rf-card:hover {
    border-color: rgba(var(--edge-acc-rgb, 139,123,255), .45) !important;
    box-shadow: none;
  }
  .rf-notch { transition: transform .2s ease, border-color .2s ease; }
  .rf-scale:hover .rf-notch { border-color: rgba(var(--edge-acc-rgb, 139,123,255), .35) !important; }
  .rf-btn { transition: border-color .2s ease, background-color .2s ease, color .2s ease; }
  .rf-btn:hover { border-color: rgba(var(--edge-acc-rgb, 139,123,255), .5) !important; color: var(--edge-text, #fff) !important; }
`;

const money = (v, cur) => {
  const n = Number(v) || 0;
  const s = n.toLocaleString('uk-UA', { maximumFractionDigits: n % 1 ? 2 : 0 });
  return String(cur).toUpperCase() === 'USD' ? `$${s}` : `${s} ₴`;
};
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

/* ---------- шкала «місяць Pro безкоштовно» ----------

   Ставка в звичайного юзера одна — 10%, тож сходинок за кількістю
   друзів більше немає. Шкала показує те, що людину справді цікавить:
   скільки ще лишилось до безкоштовного місяця. Десять поділок —
   кожна це 10% ціни місяця, тобто приблизно один друг на місячній
   підписці. Повні місяці, що вже накопичились, — короною поруч. */
function MonthScale({ credit, monthPrice, cur }) {
  const ratio = monthPrice > 0 ? credit / monthPrice : 0;
  const months = Math.floor(ratio);
  const part = ratio - months;
  const filled = part * 10;
  const left = monthPrice > 0 ? Math.max(0, monthPrice - (credit % monthPrice)) : 0;

  return (
    <div
      className="rf-card rf-scale"
      style={{
        borderRadius: 18, padding: '20px 22px 18px',
        background: `radial-gradient(120% 140% at 0% 0%, rgba(${T.accRgb},.16), transparent 55%), ${T.bg}`,
        border: `1px solid ${T.lineAcc}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.acc }}>
            {t('До безкоштовного місяця Pro', 'Towards a free month of Pro')}
          </div>
          <div style={{ fontFamily: T.display, fontSize: 30, fontWeight: 700, color: T.text, letterSpacing: '-0.02em', marginTop: 4 }}>
            {Math.round(part * 100)}%
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {months > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: `rgba(${T.accRgb},.16)`, border: `1px solid ${T.lineAcc}`, fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: T.acc }}>
              <Crown size={14} /> × {months} {t('міс. уже накопичено', 'mo. already earned')}
            </span>
          )}
        </div>
      </div>

      {/* десять поділок */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6, marginTop: 14 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const f = Math.max(0, Math.min(1, filled - i));
          return (
            <div key={i} className="rf-notch" style={{ position: 'relative', height: 16, borderRadius: 6, background: T.surface, border: `1px solid ${T.line}`, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${f * 100}%` }}
                transition={{ duration: 0.5, delay: 0.06 * i, ease: EASE }}
                style={{
                  position: 'absolute', inset: '0 auto 0 0',
                  background: `linear-gradient(90deg, rgba(${T.accRgb},.6), ${T.acc})`,
                  boxShadow: 'none',
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 10, fontFamily: T.sans, fontSize: 13.5, color: T.text3 }}>
        <span>{t('1 поділка ≈ 1 друг на місячній підписці', '1 notch ≈ 1 friend on a monthly plan')}</span>
        {monthPrice > 0 && (
          <span>
            {t('Ще', 'Another')} <b style={{ color: T.text }}>{money(left, cur)}</b> {t('— і місяць безкоштовно', 'for a free month')}
          </span>
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="rf-card" style={{ flex: '1 1 160px', borderRadius: 16, padding: '16px 18px', background: T.bg, border: `1px solid ${T.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.text4 }}>
        <Icon size={13} /> {label}
      </div>
      <div style={{ fontFamily: T.display, fontSize: 26, fontWeight: 700, color: accent || T.text, marginTop: 8 }}>{value}</div>
    </div>
  );
}

/* Поки SQL не запущено (або база не відповіла), вкладка не пустує:
   показуємо ту саму сторінку з нулями — людина бачить, як усе
   працює, а посилання зʼявиться, щойно програма ввімкнеться. */
const EMPTY = {
  code: null, kind: 'user', active: true, commission_percent: null, discount_percent: 0,
  invited: 0, paid: 0, paying: 0, rate: REF_USER_PERCENT, currency: 'UAH',
  earned: 0, credit_used: 0, paid_out: 0, recent: [],
};

export default function ReferralTab() {
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const rate = useUahRate();

  useEffect(() => {
    let alive = true;
    readMyReferral()
      .then((x) => { if (alive) setD(x || EMPTY); })
      .catch(() => { if (alive) setD(EMPTY); });
    return () => { alive = false; };
  }, []);

  if (!d) return <Loader2 size={18} className="animate-spin" style={{ color: T.text3 }} />;

  const link = d.code ? refLink(d.code) : refLink('········');
  const partner = d.kind === 'partner';
  const cur = d.currency || 'UAH';
  const balance = partner
    ? Math.max(0, Number(d.earned) - Number(d.paid_out))
    : Math.max(0, Number(d.earned) - Number(d.credit_used));
  const monthUsd = PLANS.pro_monthly.amount;
  const monthPrice = String(cur).toUpperCase() === 'USD' ? monthUsd : toUah(monthUsd, rate) || 0;

  const copy = async () => {
    if (!d.code) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* посилання видно — можна виділити руками */ }
  };

  const tg = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t('Веду торговий журнал у The Edge — спробуй', 'I keep my trading journal in The Edge — give it a try'))}`;

  return (
    <div style={{ maxWidth: '100%', display: 'grid', gap: 24 }}>
      <style>{HOVER_CSS}</style>
      {/* ---------- шапка ---------- */}
      <div>
        <div style={{ fontFamily: T.display, fontSize: 16, fontWeight: 600, color: T.text }}>
          {partner ? t('Партнерське посилання', 'Partner link') : t('Запрошуй друзів', 'Invite friends')}
        </div>
        <div style={{ fontFamily: T.sans, marginTop: 6, fontSize: 14, lineHeight: '21px', color: T.text3 }}>
          {partner
            ? t(
              `Твої ${d.rate}% з першої оплати кожного, хто прийде за посиланням.${d.discount_percent ? ` Їм — знижка ${d.discount_percent}% на першу оплату.` : ''} Виплати — від нас напряму.`,
              `You get ${d.rate}% of the first payment of everyone who signs up via your link.${d.discount_percent ? ` They get ${d.discount_percent}% off their first payment.` : ''} We pay you out directly.`,
            )
            : t(
              `Друг оформлює Pro за твоїм посиланням — ти отримуєш ${REF_USER_PERCENT}% з його першої оплати в рахунок своєї підписки. Без лімітів: що більше друзів, то ближче безкоштовні місяці.`,
              `A friend gets Pro via your link — you get ${REF_USER_PERCENT}% of their first payment towards your own subscription. No limits: more friends, more free months.`,
            )}
        </div>
      </div>

      {/* ---------- посилання ---------- */}
      <div
        className="rf-card"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: 10, paddingLeft: 18, borderRadius: 16,
          background: `linear-gradient(135deg, rgba(${T.accRgb},.10), transparent 60%), ${T.bg}`,
          border: `1px solid ${T.lineAcc}`,
        }}
      >
        <code style={{ flex: '1 1 260px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 14.5, color: T.text }}>
          {link}
        </code>
        <Button variant="primary" icon={copied ? Check : Copy} disabled={!d.code} onClick={copy}>
          {copied ? t('Скопійовано', 'Copied') : t('Копіювати', 'Copy')}
        </Button>
        <a href={tg} target="_blank" rel="noreferrer" className="rf-btn" style={{ height: 42, padding: '0 14px', borderRadius: 12, fontFamily: T.sans, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8, background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}>
          <Send size={15} /> Telegram
        </a>
      </div>

      {!d.code && (
        <div style={{ fontFamily: T.sans, fontSize: 13.5, color: T.text3, marginTop: -10 }}>
          {t('Твоє посилання зʼявиться тут за хвилину — програма саме вмикається.', 'Your link will appear here shortly — the programme is being switched on.')}
        </div>
      )}

      {!d.active && (
        <div style={{ fontFamily: T.sans, fontSize: 13.5, color: T.bad }}>
          {t('Посилання зараз вимкнене — нові люди за ним не закріплюються.', 'This link is switched off — new sign-ups are not attributed to it.')}
        </div>
      )}

      {/* ---------- шкала (лише звичайні юзери) ---------- */}
      {!partner && <MonthScale credit={balance} monthPrice={monthPrice} cur={cur} />}

      {/* ---------- цифри ---------- */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Stat icon={Users} label={t('Прийшли', 'Signed up')} value={d.invited} />
        <Stat icon={Sparkles} label={t('Оплатили', 'Paid')} value={d.paid} />
        <Stat icon={Gift} label={t('Нараховано', 'Earned')} value={money(d.earned, cur)} accent={T.ok} />
        <Stat
          icon={Wallet}
          label={partner ? t('До виплати', 'To be paid') : t('На підписку', 'Credit left')}
          value={money(balance, cur)}
          accent={T.acc}
        />
      </div>
      <div style={{ fontFamily: T.sans, fontSize: 13, lineHeight: '20px', color: T.text3, marginTop: -10 }}>
        {partner
          ? t(`Уже виплачено: ${money(d.paid_out, cur)}.`, `Already paid out: ${money(d.paid_out, cur)}.`)
          : t('Кредит автоматично зменшує наступне списання за твою підписку.', 'Credit automatically reduces your next subscription charge.')}
      </div>

      {/* ---------- як це працює ---------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {[
          [t('1. Скинь посилання', '1. Share the link'), t('Другу, у чат, у сторіз — куди завгодно.', 'To a friend, a chat, your stories — anywhere.')],
          [t('2. Друг реєструється', '2. A friend signs up'), d.discount_percent
            ? t(`І отримує −${d.discount_percent}% на першу оплату Pro.`, `And gets ${d.discount_percent}% off their first Pro payment.`)
            : t('Посилання запамʼятовується на 30 днів.', 'The link is remembered for 30 days.')],
          [t('3. Перша оплата', '3. First payment'), partner
            ? t(`Тобі нараховується ${d.rate}% від неї.`, `You get ${d.rate}% of it.`)
            : t(`Тобі — ${REF_USER_PERCENT}% від неї в рахунок підписки.`, `You get ${REF_USER_PERCENT}% of it towards your subscription.`)],
        ].map(([h, p]) => (
          <div key={h} className="rf-card" style={{ borderRadius: 16, padding: '16px 18px', background: T.bg, border: `1px solid ${T.line}` }}>
            <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: T.text }}>{h}</div>
            <div style={{ fontFamily: T.sans, fontSize: 13, lineHeight: '19px', color: T.text3, marginTop: 4 }}>{p}</div>
          </div>
        ))}
      </div>

      {/* ---------- останні ---------- */}
      {Array.isArray(d.recent) && d.recent.length > 0 && (
        <div>
          <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: T.text4, marginBottom: 8 }}>
            {t('Останні запрошені', 'Recent invites')}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {d.recent.map((r, i) => (
              <div key={i} className="rf-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: T.bg, border: `1px solid ${T.line}`, fontFamily: T.sans, fontSize: 13.5 }}>
                <span style={{ color: T.text4, width: 70 }}>{day(r.at)}</span>
                <span style={{ flex: 1, color: r.paid_at ? T.text : T.text3 }}>
                  {r.paid_at ? t('Оплатив Pro', 'Paid for Pro') : t('Зареєструвався', 'Signed up')}
                </span>
                {r.paid_at && Number(r.amount) > 0 && (
                  <span style={{ color: T.ok, fontWeight: 700 }}>+{money(r.amount, r.currency || cur)} · {r.percent}%</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
