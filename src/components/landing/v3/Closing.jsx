import { useState } from 'react';
import { ArrowRight, Ban, Check, ChevronDown, Gift, TriangleAlert } from 'lucide-react';
import { C, F, A, reducedMotion, SHELL, SoonTag, PriceRoll } from './base';
import { useUahRate, toUah, fmtUah, TRIAL_DAYS } from '../../../lib/billing';
import { useLang, useTx, pick } from './lang';

/* ==================================================================
   Хвіст сторінки: ритм дня, чого ми не робимо, ціни, питання, футер.

   Усі чотири блоки разом коротші за один старий «Продукт», бо жоден
   із них не викладений стовпчиком однакових карток.
================================================================== */

const RHYTHM = {
  uk: [
  {
    time: '09:40 · ПЕРЕД СЕСІЄЮ', label: 'План: рівні, напрямок, чого чекаю', dur: '2 хвилини',
    title: 'КАРТКА ПЛАНУ',
    rows: [['Напрямок', 'LONG', C.ok], ['Рівень', '2 412.80', C.text2], ['Стан', '5 / 5', C.acc]],
  },
  {
    time: '15:30 · УГОДА', label: 'Вхід із причиною і скріном', dur: '20 секунд',
    title: 'РЯДОК ЖУРНАЛУ',
    rows: [['XAUUSD · свінг + FVG', '+2.4R', C.ok], ['Стан', 'Спокій', C.text2], ['Скрін', 'є', C.acc]],
  },
  {
    time: '22:00 · ВЕЧІР', label: 'Розбір: що спрацювало, що ні, одне правило', dur: '5 хвилин',
    title: 'РОЗБІР ДНЯ',
    rows: [['Дисципліна', '86%', C.ok], ['Порушень', '1', C.warn], ['Правило', 'додано', C.acc]],
  },
  ],
  en: [
    {
      time: '09:40 · BEFORE THE SESSION', label: 'Plan: levels, bias, what I’m waiting for', dur: '2 minutes',
      title: 'PLAN CARD',
      rows: [['Bias', 'LONG', C.ok], ['Level', '2 412.80', C.text2], ['State', '5 / 5', C.acc]],
    },
    {
      time: '15:30 · TRADE', label: 'Entry with a reason and a screenshot', dur: '20 seconds',
      title: 'JOURNAL ROW',
      rows: [['XAUUSD · swing + FVG', '+2.4R', C.ok], ['State', 'Calm', C.text2], ['Screenshot', 'yes', C.acc]],
    },
    {
      time: '22:00 · EVENING', label: 'Review: what worked, what didn’t, one rule', dur: '5 minutes',
      title: 'DAY REVIEW',
      rows: [['Discipline', '86%', C.ok], ['Violations', '1', C.warn], ['Rule', 'added', C.acc]],
    },
  ],
};

export function Rhythm() {
  const lang = useLang();
  const tx = useTx();
  return (
    <section style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.text3 }}>{tx('РИТМ', 'RHYTHM')}</span>
      </div>

      <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(26px,2.3vw,44px)', letterSpacing: '-1.6px', lineHeight: 1.1, margin: '0 0 12px', color: '#fff' }}>
        {tx('Три дотики за день', 'Three touches a day')}
      </h2>
      <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.5, color: '#8a8a9c', margin: '0 0 30px', maxWidth: 680 }}>
        {tx('Журнал не забирає час. Він забирає рішення, які ти й так приймаєш — і залишає їх на папері', 'The journal doesn’t take your time. It takes the decisions you already make — and keeps them on paper')}
      </p>

      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', top: 7, left: '10%', right: '10%', height: 1, background: 'rgba(255,255,255,.07)' }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(250px,100%),1fr))', gap: 24, position: 'relative' }}>
          {pick(lang, RHYTHM).map((r) => (
            <div key={r.time} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '1.2px', color: C.accSoft, marginTop: 18, marginBottom: 8 }}>{r.time}</div>
              <div style={{ fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 14 }}>{r.label}</div>

              <div style={{ width: '100%', background: C.panel, border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 15, textAlign: 'left' }}>
                <div style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.1px', color: C.dim, marginBottom: 11 }}>{r.title}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {r.rows.map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span>
                      <span style={{ fontFamily: F.mono, fontSize: 12, fontWeight: 700, flexShrink: 0, color: c }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontFamily: F.sans, fontSize: 12, color: C.text5, marginTop: 11 }}>{r.dur}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, color: C.accSoft, marginTop: 26 }}>
        {tx('Разом — менше десяти хвилин на день', 'Less than ten minutes a day in total')}
      </div>
    </section>
  );
}

/* ---------- чого ми не робимо ---------- */

const NOT_DOING = {
  uk: ['Не даємо сигналів', 'Не керуємо твоїми грошима', 'Не обіцяємо прибуток', 'Не продаємо твої дані'],
  en: ['We don’t give signals', 'We don’t manage your money', 'We don’t promise profit', 'We don’t sell your data'],
};

export function NotDoing() {
  const lang = useLang();
  const tx = useTx();
  return (
    <section style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ position: 'relative', background: 'linear-gradient(150deg,rgba(245,163,59,.11),rgba(245,163,59,.03) 55%,transparent)', border: '1px solid rgba(245,163,59,.3)', borderRadius: 24, padding: 'clamp(18px,4.5vw,30px)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,#f5a33b,rgba(245,163,59,.2),transparent)' }} />

        <div style={{ position: 'relative', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 300px', minWidth: 'min(260px,100%)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'rgba(245,163,59,.14)', border: '1px solid rgba(245,163,59,.4)', borderRadius: 999, padding: '7px 14px', marginBottom: 18 }}>
              <TriangleAlert size={14} strokeWidth={2.2} color={C.warn} />
              <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.4px', color: C.warn }}>{tx('ЧИТАЙ ПЕРЕД РЕЄСТРАЦІЄЮ', 'READ BEFORE SIGNING UP')}</span>
            </div>

            <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(26px,2.3vw,44px)', letterSpacing: '-1.6px', lineHeight: 1.1, margin: '0 0 12px', color: '#fff' }}>
              {tx('Чого ми не робимо', 'What we don’t do')}
            </h2>
            <p style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: '#c4a882', margin: 0, maxWidth: 380 }}>
              {tx('Журнал не заробляє замість тебе. Він показує, де ти вже заробляєш, а де ні', 'The journal doesn’t make money for you. It shows where you already make it and where you don’t')}
            </p>
          </div>

          <div style={{ flex: '1 1 420px', minWidth: 'min(280px,100%)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px,100%),1fr))', gap: 11 }}>
            {pick(lang, NOT_DOING).map((t) => (
              <div
                key={t}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(245,163,59,.07)', border: '1px solid rgba(245,163,59,.26)', borderRadius: 14, padding: '15px 16px', transition: 'border-color .2s ease,background .2s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(245,163,59,.55)'; e.currentTarget.style.background = 'rgba(245,163,59,.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(245,163,59,.26)'; e.currentTarget.style.background = 'rgba(245,163,59,.07)'; }}
              >
                <Ban size={18} strokeWidth={2.1} color={C.warn} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.35 }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- ціни ---------- */

const FREE = {
  uk: ['Журнал без обмежень', 'Уся аналітика в R', 'План на день і чекліст', 'Калькулятор ризику', 'Ручні бектести без обмежень', '2 бектести на реальному графіку', '1 рахунок'],
  en: ['Unlimited journal', 'Full analytics in R', 'Daily plan and checklist', 'Risk calculator', 'Unlimited manual backtests', '2 real-chart backtests', '1 account'],
};
/* Lite — для тих, хто ще вчиться чи йде до пропу: бектест і бот без
   автоімпорту. Перелік короткий навмисно: «усе з Free» + своє. */
const LITE = {
  uk: ['Усе з Free', 'Реальний графік без обмежень', 'Telegram-бот: план, нагадування, підсумки'],
  en: ['Everything in Free', 'Unlimited real-chart backtests', 'Telegram bot: plan, reminders, summaries'],
};
/* `soon` — це не позначка «колись». Поки функції немає, вона не має
   виглядати частиною того, за що людина платить сьогодні: інакше
   перший же тиждень підписки закінчується питанням «а де AI». */
const PRO = {
  uk: [
    'Усе з Lite',
    'Автоімпорт угод з MT5',
    'До 5 рахунків: пропи, реал, демо окремо',
    { text: 'Автоконтроль правил пропфірми' },
    { text: 'Алерти ліміту просадки в Telegram' },
    { text: 'Бот після угоди: «чому зайшов»', soon: true },
    { text: 'Тижневий розбір з найдорожчою помилкою', soon: true },
    { text: 'AI-коуч на твоїх угодах', soon: true },
  ],
  en: [
    'Everything in Lite',
    'MT5 trade auto-import',
    'Up to 5 accounts: prop, live, demo apart',
    { text: 'Automatic prop firm rules tracking' },
    { text: 'Drawdown limit alerts in Telegram' },
    { text: 'Bot after a trade: “why did you enter”', soon: true },
    { text: 'Weekly review with your costliest mistake', soon: true },
    { text: 'AI coach on your trades', soon: true },
  ],
};
/* Ціни — дзеркало src/lib/billing.js (PLANS). */
const PRICES = {
  lite: { month: 5, yearMonth: 4, year: 48, save: 12 },
  pro: { month: 15, yearMonth: 12, year: 144, save: 36 },
};
const COMPARE = {
  uk: [
    ['Всі угоди в одному місці', true],
    ['Рахує R і профіт-фактор', false],
    ['Бачить, який сетап платить', false],
    ['Ловить повтори помилок', false],
    ['Пише правило з твого висновку', false],
    ['Імпорт із MT5', false],
  ],
  en: [
    ['All trades in one place', true],
    ['Calculates R and profit factor', false],
    ['Sees which setup pays', false],
    ['Catches repeated mistakes', false],
    ['Turns your takeaway into a rule', false],
    ['Import from MT5', false],
  ],
};

const COMPARE_GRID = 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)';

export function Pricing() {
  const lang = useLang();
  const tx = useTx();
  const [yearly, setYearly] = useState(false);
  const rate = useUahRate();
  const uah = (usd) => toUah(usd, rate);
  const reduced = reducedMotion();

  /* Кнопка більше не має власного фону. Підсвітка — одна плашка, що
     їздить під ними: коли фон просто гасне в одній кнопці й
     зʼявляється в іншій, перемикач читається як дві лампочки, а не як
     один перемикач із двома положеннями.

     Обидві кнопки однакової ширини — інакше плашка мусила б міряти
     текст, а «Місяць» і «Рік» різної довжини. */
  const tab = (on) => ({
    position: 'relative', zIndex: 1, border: 0, background: 'transparent',
    borderRadius: 999, padding: '9px 0', width: 92, textAlign: 'center',
    fontFamily: F.sans, fontSize: 13.5, fontWeight: 700,
    cursor: 'pointer', transition: 'color .22s ease', whiteSpace: 'nowrap',
    color: on ? '#fff' : '#8a8a9c',
  });

  const feat = (list, color, textColor) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 26 }}>
      {list.map((f) => {
        const soon = typeof f === 'object' && f.soon;
        const label = typeof f === 'object' ? f.text : f;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
            <Check size={14} strokeWidth={2.6} color={soon ? C.text4 : color} style={{ flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.45, color: soon ? '#7d7d90' : textColor }}>
              {label}
              {soon && <SoonTag />}
            </span>
          </div>
        );
      })}
    </div>
  );

  /* Платна картка: Lite і Pro однакові за будовою, Pro лише виділена.
     Намір несемо в адресі (?next=lite|pro), а не в localStorage:
     реєстрація буває в другій вкладці чи на іншому пристрої. */
  const paidCard = (tier) => {
    const pr = PRICES[tier];
    const hot = tier === 'pro';
    const uahM = uah(yearly ? pr.yearMonth : pr.month);
    const uahY = uah(pr.year);
    return (
      <div style={{ position: 'relative', background: hot ? 'linear-gradient(160deg,#12121c,#0c0c14)' : C.panel, border: `1px solid ${hot ? A(0.42) : A(0.2)}`, borderRadius: 22, padding: 'clamp(20px,5vw,30px) clamp(18px,4.5vw,28px)', display: 'flex', flexDirection: 'column', transform: hot ? 'translateY(-6px)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 16, minHeight: 30 }}>
          <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2px', color: C.accSoft }}>{hot ? 'PRO' : 'LITE'}</span>
          {hot ? (
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.2px', color: '#fff', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, borderRadius: 999, padding: '7px 14px', whiteSpace: 'nowrap' }}>
              {tx('НАЙКОРИСНІШЕ', 'MOST VALUE')}
            </span>
          ) : (
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.2px', color: C.accSoft, border: `1px solid ${A(0.3)}`, borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' }}>
              {tx('ДЛЯ СТАРТУ', 'TO START')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
          <PriceRoll
            value={`$${yearly ? pr.yearMonth : pr.month}`}
            size={46}
            style={{ fontFamily: F.display, fontWeight: 700, fontSize: 46, letterSpacing: '-2.2px', color: '#fff' }}
          />
          <span style={{ fontFamily: F.sans, fontSize: 15, color: '#7d7d90' }}>
            {tx('/ місяць', '/ month')}
            {/* Гривня за курсом НБУ на сьогодні — довідково. На англійській
                сторінці гривня нікому не допомагає. */}
            {uahM && lang !== 'en' ? <span style={{ color: '#82829a' }}> · ≈ {fmtUah(uahM)}</span> : null}
          </span>
        </div>

        <div style={{ fontFamily: F.sans, fontSize: 14.5, color: '#8a8a9c', marginBottom: 22, minHeight: 42 }}>
          {/* key перемонтовує рядок, і анімація програється разом із
              ціною; minHeight тримає висоту, щоб кнопка не стрибала. */}
          <span
            key={yearly ? 'y' : 'm'}
            style={{ display: 'inline-block', animation: reduced ? 'none' : 'lnSubIn .42s cubic-bezier(.4,0,.2,1) .16s both' }}
          >
            {lang === 'en'
              ? (yearly ? `$${pr.year} a year — $${pr.save} cheaper` : `${TRIAL_DAYS} days free · card required, cancel before the charge`)
              : (yearly
                ? `$${pr.year} на рік${uahY ? ` (≈ ${fmtUah(uahY)})` : ''} — на $${pr.save} дешевше`
                : `${TRIAL_DAYS} днів безкоштовно · потрібна картка, скасувати можна до списання`)}
          </span>
        </div>

        {feat(pick(lang, hot ? PRO : LITE), C.acc, '#dcdce8')}

        <a
          href={`/auth?next=${tier}`}
          style={hot
            ? { marginTop: 'auto', width: '100%', background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff', fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'center', transition: 'box-shadow .2s' }
            : { marginTop: 'auto', width: '100%', background: A(0.12), border: `1px solid ${A(0.4)}`, color: '#fff', fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'center', transition: 'all .2s' }}
        >
          {tx(`${TRIAL_DAYS} днів безкоштовно`, `${TRIAL_DAYS} days free`)}
        </a>
      </div>
    );
  };

  return (
    <section id="pricing" style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', marginBottom: 30 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.text3 }}>{tx('ЦІНИ', 'PRICING')}</span>
          </div>
          <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 10px', color: '#fff' }}>
            {tx('Дешевше за одну погану угоду', 'Cheaper than one bad trade')}
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16.5, color: '#8a8a9c', margin: 0 }}>{tx('Почни безкоштовно і залиш журнал назавжди', 'Start free and keep the journal forever')}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.09)', borderRadius: 999, padding: 4 }}>
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 4, bottom: 4, left: 4, width: 92,
                borderRadius: 999, background: A(0.18), border: `1px solid ${A(0.32)}`,
                transform: `translateX(${yearly ? 92 : 0}px)`,
                transition: reduced ? 'none' : 'transform .38s cubic-bezier(.34,1.3,.5,1)',
              }}
            />
            <button type="button" onClick={() => setYearly(false)} style={tab(!yearly)}>{tx('Місяць', 'Monthly')}</button>
            <button type="button" onClick={() => setYearly(true)} style={tab(yearly)}>{tx('Рік', 'Yearly')}</button>
          </div>

        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(290px,100%),1fr))', gap: 20, alignItems: 'stretch' }}>
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22, padding: 'clamp(20px,5vw,30px) clamp(18px,4.5vw,28px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2px', color: C.text4, marginBottom: 16 }}>FREE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10 }}>
            <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 46, letterSpacing: '-2.2px', color: '#fff' }}>$0</span>
            <span style={{ fontFamily: F.sans, fontSize: 15, color: '#7d7d90' }}>{tx('назавжди', 'forever')}</span>
          </div>
          <div style={{ fontFamily: F.sans, fontSize: 14.5, color: '#8a8a9c', marginBottom: 22, minHeight: 42 }}>{tx('Усе, щоб виробити звичку. Без картки', 'Everything to build the habit. No card')}</div>
          {feat(pick(lang, FREE), C.text4, '#b8b8c8')}
          <a
            href="/auth"
            style={{ marginTop: 'auto', width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,.13)', color: C.text, fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, padding: 14, borderRadius: 13, cursor: 'pointer', textAlign: 'center', transition: 'all .2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.45); e.currentTarget.style.background = A(0.07); }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.13)'; e.currentTarget.style.background = 'transparent'; }}
          >
            {tx('Почати безкоштовно', 'Start free')}
          </a>
        </div>

        {paidCard('lite')}
        {paidCard('pro')}
      </div>

      {/* Обіцянка раннім підписникам — під картками, а не в одній із
          них: стосується і Lite, і Pro. */}
      <div style={{ marginTop: 16, display: 'flex', gap: 9, alignItems: 'flex-start' }}>
        <Gift size={15} strokeWidth={2.2} color={C.accSoft} style={{ flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.5, color: '#9a9ab0' }}>
          {tx('Оформив Pro до виходу AI-коуча — отримаєш', 'Get Pro before the AI coach launches and receive')}{' '}
          <b style={{ color: '#fff' }}>{tx('два тижні нейромережі в подарунок', 'two weeks of the AI coach as a gift')}</b>{' '}
          {tx('у день запуску', 'on launch day')}
        </span>
      </div>

      <div style={{ marginTop: 26, border: '1px solid rgba(255,255,255,.07)', borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COMPARE_GRID, gap: 12, padding: '15px 22px', background: '#0d0d13', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.text4 }}>{tx('ЩО ВМІЄ', 'WHAT IT DOES')}</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.text4, textAlign: 'center' }}>{tx('ЗВИЧАЙНИЙ ЖУРНАЛ', 'A REGULAR JOURNAL')}</span>
          <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.accSoft, textAlign: 'center' }}>EDGE JOURNAL</span>
        </div>

        {pick(lang, COMPARE).map(([k, basic]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: COMPARE_GRID, gap: 12, alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,.035)', background: C.sunken }}>
            <span style={{ fontFamily: F.sans, fontSize: 14, color: '#b8b8c8' }}>{k}</span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              {basic
                ? <Check size={15} strokeWidth={2.6} color={C.text4} />
                : <span style={{ width: 12, height: 2, borderRadius: 1, background: '#3a3a48', display: 'block' }} />}
            </span>
            <span style={{ display: 'flex', justifyContent: 'center' }}>
              <Check size={15} strokeWidth={2.6} color={C.acc} />
            </span>
          </div>
        ))}
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 13.5, color: C.text5, marginTop: 18 }}>
        {tx('Скасувати можна будь-коли. Дані твої — експорт у CSV в один клік', 'Cancel anytime. Your data is yours — one-click CSV export')}
      </div>
    </section>
  );
}

/* ---------- фінал + питання ---------- */

const FAQ = {
  uk: [
  { chip: 'БЕЗПЕКА', q: 'Логін інвестора — це безпечно?', a: 'Так. Логін інвестора дає лише читання: подивитись історію й баланс. Торгувати, виводити кошти чи змінювати налаштування з ним неможливо технічно, на рівні самого MetaTrader' },
  { chip: 'ЧАС', q: 'Скільки часу це забирає щодня?', a: 'Двадцять секунд на угоду, дві хвилини на план і п’ять на вечірній розбір. Цифри й результат приїжджають з MT5 самі — руками ти дописуєш тільки причину входу й стан' },
  { chip: 'КОУЧ', q: 'Чим коуч відрізняється від ChatGPT?', a: 'Він не радить абстрактно, а працює з твоєю вибіркою: дисципліна, час входів, серії після стопу, ціна кожної звички в R. Порада завжди привʼязана до конкретних угод, які можна відкрити й перевірити' },
  { chip: 'ПРОП', q: 'А якщо я торгую на пропфірмі?', a: 'Проп-рахунки ведуться окремо: ліміт денної просадки, загальна просадка, прогрес до виплати й історія самих виплат. Один журнал тримає особисті й проп-рахунки одночасно' },
  { chip: 'ДАНІ', q: 'Мої угоди йдуть на навчання моделей?', a: 'Ні. Дані замкнені на твій акаунт на рівні бази й не використовуються для тренування. Публічним стає лише те, на що ти сам створиш посилання' },
  { chip: 'ОПЛАТА', q: 'Що буде, якщо я перестану платити?', a: 'Журнал і вся історія лишаються на безкоштовному плані — вимикаються тільки платні можливості Lite чи Pro. Експорт у CSV доступний завжди, в один клік' },
  ],
  en: [
    { chip: 'SECURITY', q: 'Is the investor login safe?', a: 'Yes. The investor login is read-only: it can see history and balance. Trading, withdrawing funds or changing settings with it is technically impossible — that’s how MetaTrader itself works' },
    { chip: 'TIME', q: 'How much time does it take each day?', a: 'Twenty seconds per trade, two minutes for the plan and five for the evening review. Numbers and results arrive from MT5 on their own — you only add the reason for the entry and your state' },
    { chip: 'COACH', q: 'How is the coach different from ChatGPT?', a: 'It doesn’t give abstract advice — it works with your sample: discipline, entry times, streaks after a stop, the R cost of each habit. Every tip is tied to specific trades you can open and check' },
    { chip: 'PROP', q: 'What if I trade a prop firm account?', a: 'Prop accounts are tracked separately: daily drawdown limit, max drawdown, progress to payout and the payout history itself. One journal holds personal and prop accounts at the same time' },
    { chip: 'DATA', q: 'Are my trades used to train models?', a: 'No. Your data is locked to your account at the database level and is not used for training. Only what you create a link for becomes public' },
    { chip: 'BILLING', q: 'What happens if I stop paying?', a: 'The journal and all your history stay on the free plan — only paid Lite or Pro features switch off. CSV export is always available, in one click' },
  ],
};

export function FinalFaq() {
  const lang = useLang();
  const tx = useTx();
  const [open, setOpen] = useState(0);
  const reduced = reducedMotion();

  return (
    <section id="faq" style={{ ...SHELL, paddingTop: '0', paddingBottom: '76px' }}>
      <div style={{ display: 'flex', gap: 52, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px', minWidth: 'min(280px,100%)', position: 'relative' }}>

          <div style={{ position: 'relative' }}>
            <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.07, margin: '0 0 16px', color: '#fff', textWrap: 'balance' }}>
              {tx('Стратегія в тебе вже є. Бракує доказів, що вона працює', 'You already have a strategy. What’s missing is proof that it works')}
            </h2>
            <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.55, color: '#8a8a9c', margin: '0 0 28px', maxWidth: 420 }}>
              {tx('Тридцять днів чесних записів — і ти побачиш, які рішення тебе годують, а які коштують', 'Thirty days of honest logging and you’ll see which decisions feed you and which cost you')}
            </p>

            <a
              href="/auth"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff', fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, padding: '17px 30px', borderRadius: 14, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s' }}
            >
              {tx('Почати безкоштовно', 'Start free')}
              <ArrowRight size={16} strokeWidth={2.4} />
            </a>

            <div style={{ fontFamily: F.sans, fontSize: 13, color: C.text5, marginTop: 16 }}>
              {tx('Три хвилини на підключення. Картка не потрібна', 'Three minutes to connect. No card required')}
            </div>
          </div>
        </div>

        <div style={{ flex: '1 1 470px', minWidth: 'min(300px,100%)', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {pick(lang, FAQ).map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q} style={{ position: 'relative', background: C.panel, border: `1px solid ${on ? A(0.28) : 'rgba(255,255,255,.07)'}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color .2s ease' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: `linear-gradient(180deg,${C.acc},${C.accDeep})`, transition: 'opacity .25s ease', opacity: on ? 1 : 0 }} />

                <button
                  type="button"
                  onClick={() => setOpen(on ? -1 : i)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 0, padding: '18px 20px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, fontWeight: 700, flexShrink: 0, color: on ? C.accSoft : C.dim }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ flex: 1, fontFamily: F.sans, fontSize: 15, fontWeight: 700, color: '#fff' }}>{f.q}</span>
                  <span style={{ flexShrink: 0, display: 'flex', transition: 'transform .25s ease', transform: on ? 'rotate(180deg)' : 'none' }}>
                    <ChevronDown size={16} strokeWidth={2.2} color={C.acc} />
                  </span>
                </button>

                {on && (
                  <div style={{ padding: '0 20px 20px 45px', animation: reduced ? 'none' : 'lnFadeUp .25s ease-out' }}>
                    <div style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.65, color: '#8a8a9c' }}>{f.a}</div>
                    <div style={{ display: 'inline-flex', marginTop: 12, fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: C.accSoft, background: A(0.1), border: `1px solid ${A(0.24)}`, borderRadius: 999, padding: '5px 11px' }}>
                      {f.chip}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
