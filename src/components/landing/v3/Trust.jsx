import { useEffect, useState } from 'react';
import { ShieldCheck, Clock3, ArrowRight, BarChart3, Check, Minus } from 'lucide-react';
import { C, F, A, Section, Eyebrow, H2, Sub, SoonTag } from './base';
import { useLang, useTx, blogPath } from './lang';
import { REVIEWS, CASE } from '../../../lib/testimonials';
import { postsFor } from '../../../lib/blogContent';

/* ==================================================================
   Блоки довіри лендингу: проблема, пропи, докази, порівняння цін,
   статті.

   Правило для всього файлу: жодних обіцянок прибутку і жодних
   вигаданих відгуків чи цифр. Те, чого ще немає (контроль правил
   пропу), позначено «скоро» прямо в заголовку блоку.
================================================================== */

const card = {
  background: C.panel,
  border: '1px solid rgba(255,255,255,.07)',
  borderRadius: 18,
};

/* ---------------- Проблема ---------------- */

const PAINS = {
  uk: [
    { t: 'Два стопи зранку', s: 'І ти вже відбиваєшся. До обіду денний ліміт злито, хоча стратегія тут ні до чого.' },
    { t: 'Excel на тиждень', s: 'Угоди в таблиці ведеш тиждень. Потім кидаєш, бо вносити все руками нудно.' },
    { t: 'Щось не так, але що', s: 'Відчуваєш, що проблема є. Але не бачиш, де саме: у вході, сесії чи стані.' },
  ],
  en: [
    { t: 'Two stops by morning', s: 'And you start revenge trading. By lunch the daily limit is gone, and the strategy had nothing to do with it.' },
    { t: 'Excel for a week', s: 'You log trades in a spreadsheet for a week. Then you quit, because typing it all in is boring.' },
    { t: 'Something is off', s: 'You feel there is a problem. You just can’t see where: the entry, the session or your state.' },
  ],
};

export function Problem() {
  const lang = useLang();
  const tx = useTx();
  const pains = lang === 'en' ? PAINS.en : PAINS.uk;
  return (
    <Section id="problem" style={{ paddingTop: 72, paddingBottom: 40 }}>
      <Eyebrow>{tx('Знайомо?', 'Sound familiar?')}</Eyebrow>
      <H2>{tx('Рахунок зливають кілька звичок, що повторюються', 'A few repeating habits drain the account')}</H2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 14, marginTop: 30 }}>
        {pains.map((p) => (
          <div key={p.t} style={{ ...card, padding: '22px 22px 24px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{p.t}</div>
            <div style={{ fontFamily: F.sans, fontSize: 14.5, lineHeight: 1.6, color: C.text3 }}>{p.s}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ---------------- Пропи ---------------- */

export function Props() {
  const tx = useTx();
  const rows = [
    [tx('Денна і загальна просадка по твоїх угодах', 'Daily and overall drawdown from your trades'), true],
    [tx('Шаблони FTMO, FundingPips, The5ers', 'FTMO, FundingPips, The5ers templates'), true],
    [tx('Повідомлення в Telegram, коли до ліміту лишається 30%', 'A Telegram alert when 30% of the limit is left'), true],
    [tx('Бектест на реальних хвилинках FTMO', 'Backtesting on real FTMO minute data'), false],
    [tx('Результат у R і статистика по сесіях', 'Results in R and stats by session'), false],
  ];
  return (
    <Section id="props" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <div style={{ ...card, padding: 'clamp(22px,4vw,40px)', borderColor: A(0.3), background: `linear-gradient(150deg, ${A(0.1)}, ${C.panel} 55%)` }}>
        <Eyebrow>{tx('Для проп-трейдерів', 'For prop traders')}</Eyebrow>
        <H2 style={{ fontSize: 'clamp(26px,2.3vw,44px)' }}>{tx('Правила челенджу завжди перед очима', 'Your challenge rules always in sight')}</H2>
        <Sub>{tx('Обираєш фірму й етап, а журнал рахує денну й загальну просадку по твоїх угодах. Частина вже працює, контроль правил у розробці.', 'Pick the firm and the phase, and the journal tracks daily and overall drawdown from your trades. Part of it works today; rule tracking is in development.')}</Sub>
        <div style={{ display: 'grid', gap: 10, marginTop: 26, maxWidth: 640 }}>
          {rows.map(([label, soon]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {soon
                ? <Clock3 size={17} color={C.text3} style={{ flexShrink: 0 }} />
                : <Check size={17} color={C.ok} strokeWidth={2.6} style={{ flexShrink: 0 }} />}
              <span style={{ fontFamily: F.sans, fontSize: 15, color: soon ? C.text3 : '#fff' }}>{label}</span>
              {soon && <SoonTag>{tx('СКОРО', 'SOON')}</SoonTag>}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Докази ---------------- */

const fmt = (n, lang) => Number(n || 0).toLocaleString(lang === 'en' ? 'en-US' : 'uk-UA');

function Counter() {
  const lang = useLang();
  const tx = useTx();
  const [s, setS] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/stats', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { if (alive) setS(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  /* Поки цифр немає або вони скромні — не показуємо зовсім:
     «12 угод» працює проти нас. */
  if (!s || s.trades < 500) return null;
  return (
    <div style={{ display: 'flex', gap: 'clamp(24px,5vw,64px)', flexWrap: 'wrap', marginTop: 28 }}>
      <div>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(34px,3.4vw,56px)', color: '#fff', letterSpacing: '-1.5px' }}>{fmt(s.trades, lang)}</div>
        <div style={{ fontFamily: F.sans, fontSize: 14, color: C.text3 }}>{tx('угод записано в THE EDGE: журнал і бектест', 'trades logged in THE EDGE: journal and backtest')}</div>
      </div>
      {s.traders >= 20 && (
        <div>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(34px,3.4vw,56px)', color: '#fff', letterSpacing: '-1.5px' }}>{fmt(s.traders, lang)}</div>
          <div style={{ fontFamily: F.sans, fontSize: 14, color: C.text3 }}>{tx('трейдерів зареєструвались', 'traders signed up')}</div>
        </div>
      )}
    </div>
  );
}

function Review({ r, lang }) {
  const text = (lang === 'en' && r.text?.en) || r.text?.uk || '';
  const role = (lang === 'en' && r.role?.en) || r.role?.uk || '';
  return (
    <figure style={{ ...card, margin: 0, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <blockquote style={{ margin: 0, fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: '#e6e6ee' }}>«{text}»</blockquote>
      <figcaption style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 'auto' }}>
        {r.photo
          ? <img src={r.photo} alt="" width={40} height={40} loading="lazy" style={{ borderRadius: 999, objectFit: 'cover' }} />
          : <span style={{ width: 40, height: 40, borderRadius: 999, display: 'grid', placeItems: 'center', background: A(0.18), color: C.accSoft, fontFamily: F.sans, fontWeight: 700 }}>{(r.name || '?').slice(0, 1)}</span>}
        <div>
          <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff' }}>{r.name}{r.handle ? <span style={{ color: C.text3, fontWeight: 400 }}> {r.handle}</span> : null}</div>
          {role && <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3 }}>{role}</div>}
        </div>
      </figcaption>
    </figure>
  );
}

/* Живий екран аналітики замість скріна: справжня сторінка застосунку
   на демо-угодах (/demo/analytics) у вбудованому вікні — можна
   перемикати вкладки, наводити на графіки, відкривати угоди. Вантажимо
   лише коли блок підʼїхав до екрана: iframe тягне весь застосунок. */
function LiveDemo() {
  const tx = useTx();
  const [ref, setRef] = useState(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!ref || on) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin: '400px' });
    io.observe(ref);
    return () => io.disconnect();
  }, [ref, on]);
  return (
    <figure ref={setRef} style={{ margin: '30px 0 0', ...card, overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 'min(78vh, 820px)', minHeight: 520, background: C.bg }}>
        {on ? (
          <iframe
            src="/demo/analytics"
            title={tx('Демо аналітики THE EDGE', 'THE EDGE analytics demo')}
            loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <img src="/blog/guide/analytics.webp" alt="" loading="lazy" decoding="async" width="1175" height="824" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        )}
      </div>
      <figcaption style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 16px', fontFamily: F.sans, fontSize: 13, color: C.text3, borderTop: '1px solid rgba(255,255,255,.06)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={15} /> {tx('Живе демо на вигаданих угодах: перемикай вкладки, наводь на графіки, відкривай угоди.', 'A live demo on made-up trades: switch tabs, hover the charts, open trades.')}
        </span>
        <a href="/demo/analytics" style={{ color: C.accSoft, fontWeight: 700 }}>{tx('Відкрити на весь екран', 'Open full screen')} →</a>
      </figcaption>
    </figure>
  );
}

export function Proof() {
  const lang = useLang();
  const tx = useTx();
  const pickL = (v) => (lang === 'en' && v?.en) || v?.uk || '';
  return (
    <Section id="proof" style={{ paddingTop: 40, paddingBottom: 72 }}>
      <Eyebrow>{tx('Як це виглядає', 'What it looks like')}</Eyebrow>
      <H2>{tx('Твоя статистика замість здогадок', 'Your stats instead of guesses')}</H2>
      <Counter />

      <LiveDemo />

      {CASE && (
        <div style={{ ...card, padding: 'clamp(20px,3.5vw,32px)', marginTop: 18 }}>
          <Eyebrow color={C.accSoft}>{tx('Кейс', 'Case')}</Eyebrow>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(20px,1.8vw,30px)', color: '#fff', margin: '12px 0 10px' }}>{pickL(CASE.title)}</div>
          <p style={{ fontFamily: F.sans, fontSize: 15, lineHeight: 1.6, color: C.text3, margin: 0, maxWidth: 720 }}>{pickL(CASE.text)}</p>
          {(CASE.before || CASE.after) && (
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 18, fontFamily: F.mono, fontSize: 14 }}>
              {CASE.before && <span style={{ color: C.bad }}>{tx('До', 'Before')}: {pickL(CASE.before)}</span>}
              {CASE.after && <span style={{ color: C.ok }}>{tx('Після', 'After')}: {pickL(CASE.after)}</span>}
            </div>
          )}
          <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3, marginTop: 14 }}>
            {CASE.author} · {tx('Результат конкретної людини, а не обіцянка.', 'One person’s result, not a promise.')}
          </div>
        </div>
      )}

      {REVIEWS.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 14, marginTop: 18 }}>
          {REVIEWS.slice(0, 5).map((r) => <Review key={r.name + (r.handle || '')} r={r} lang={lang} />)}
        </div>
      )}
    </Section>
  );
}

/* ---------------- Безпека MT5 ---------------- */

export function Security() {
  const tx = useTx();
  const items = [
    [tx('Інвесторський пароль', 'Investor password'), tx('Ми просимо лише пароль інвестора. Ним можна тільки дивитись угоди: відкрити позицію чи вивести гроші неможливо. Це обмеження самого MetaTrader.', 'We only ask for the investor password. It can only view trades: opening a position or withdrawing money is impossible. That is a limit of MetaTrader itself.')],
    [tx('Лише читання', 'Read-only'), tx('Журнал забирає закриті угоди й нічого не надсилає в термінал.', 'The journal pulls closed trades and sends nothing to the terminal.')],
    [tx('Зберігається зашифрованим', 'Stored encrypted'), tx('Пароль шифрується до запису в базу, і відкритим текстом його не бачить ніхто, зокрема ми.', 'The password is encrypted before it is saved, and nobody sees it in plain text, us included.')],
  ];
  return (
    <Section id="security" style={{ paddingTop: 0, paddingBottom: 72 }}>
      <div style={{ ...card, padding: 'clamp(22px,4vw,36px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={22} color={C.ok} />
          <Eyebrow color={C.ok}>{tx('Безпека MT5', 'MT5 security')}</Eyebrow>
        </div>
        <H2 style={{ fontSize: 'clamp(24px,2.1vw,40px)' }}>{tx('Доступ лише на читання. Торгувати ним неможливо', 'Read-only access. It can’t trade')}</H2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(250px,100%),1fr))', gap: 18, marginTop: 24 }}>
          {items.map(([t, s]) => (
            <div key={t}>
              <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{t}</div>
              <div style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.6, color: C.text3 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ---------------- Порівняння цін ----------------

   Ціни з офіційних сторінок конкурентів. ДАТУ ОНОВЛЮВАТИ разом із
   цифрами: таблиця без дати перевірки — це вже не факт, а реклама. */

export const PRICES_CHECKED = '2026-10-14';

const COMPARE = [
  { name: 'THE EDGE Pro', year: 144, month: 15, free: true, mt5: true, bt: true, uk: true, us: true },
  { name: 'THE EDGE Lite', year: 48, month: 5, free: true, mt5: false, bt: true, uk: true, us: true },
  { name: 'Edgewonk', year: 197, month: null, free: false, mt5: true, bt: false, uk: false },
  { name: 'TradeZella Basic', year: 288, month: 29, free: false, mt5: true, bt: 'part', uk: false },
  { name: 'TradeZella Pro', year: 399, month: 49, free: false, mt5: true, bt: true, uk: false },
];

const Mark = ({ v }) => (v === true
  ? <Check size={17} color={C.ok} strokeWidth={2.6} />
  : v === 'part' ? <span style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3 }}>~</span>
    : <Minus size={17} color={C.text3} />);

export function Compare() {
  const lang = useLang();
  const tx = useTx();
  const date = new Date(PRICES_CHECKED).toLocaleDateString(lang === 'en' ? 'en-US' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
  const th = { fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.text3, fontWeight: 700, textAlign: 'center', padding: '12px 10px' };
  const td = { padding: '14px 10px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,.06)' };
  return (
    <Section id="compare" style={{ paddingTop: 0, paddingBottom: 72 }}>
      <Eyebrow>{tx('Порівняння', 'Comparison')}</Eyebrow>
      <H2>{tx('Скільки коштує рік журналу', 'What a year of journaling costs')}</H2>
      <Sub>{tx('Факти без оцінок: ціна за рік і що входить. Висновок зробиш сам.', 'Facts, no spin: the yearly price and what’s included. Draw your own conclusion.')}</Sub>
      <div style={{ ...card, marginTop: 26, overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontFamily: F.sans, fontSize: 14.5, color: '#e6e6ee' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 18 }}>{tx('ЖУРНАЛ', 'JOURNAL')}</th>
              <th style={th}>{tx('ЗА РІК', 'PER YEAR')}</th>
              <th style={th}>{tx('БЕЗКОШТОВНИЙ ПЛАН', 'FREE PLAN')}</th>
              <th style={th}>{tx('АВТОІМПОРТ MT5', 'MT5 AUTO-IMPORT')}</th>
              <th style={th}>{tx('БЕКТЕСТ', 'BACKTEST')}</th>
              <th style={th}>{tx('УКРАЇНСЬКОЮ', 'UKRAINIAN')}</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r.name} style={{ background: r.us ? A(0.08) : 'transparent' }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 18, fontWeight: 700, color: r.us ? '#fff' : '#e6e6ee' }}>{r.name}</td>
                <td style={{ ...td, fontFamily: F.mono, color: r.us ? C.accSoft : '#e6e6ee', fontWeight: r.us ? 700 : 400 }}>${r.year}</td>
                <td style={td}><span style={{ display: 'inline-flex' }}><Mark v={r.free} /></span></td>
                <td style={td}><span style={{ display: 'inline-flex' }}><Mark v={r.mt5} /></span></td>
                <td style={td}><span style={{ display: 'inline-flex' }}><Mark v={r.bt} /></span></td>
                <td style={td}><span style={{ display: 'inline-flex' }}><Mark v={r.uk} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: F.sans, fontSize: 12.5, color: C.text3, marginTop: 12 }}>
        {tx(`Ціни з офіційних сайтів, річна оплата, перевірено ${date}. ~ — обмежений бектест.`, `Prices from official websites, billed yearly, checked ${date}. ~ — limited backtesting.`)}
      </div>
    </Section>
  );
}

/* ---------------- Статті ---------------- */

export function Read() {
  const lang = useLang();
  const tx = useTx();
  const posts = postsFor(lang === 'en' ? 'en' : 'uk').slice(0, 3);
  if (!posts.length) return null;
  const base = blogPath(lang);
  return (
    <Section id="read" style={{ paddingTop: 0, paddingBottom: 72 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>{tx('Читати', 'Read')}</Eyebrow>
          <H2 style={{ fontSize: 'clamp(24px,2.1vw,40px)' }}>{tx('Статті для трейдерів', 'Articles for traders')}</H2>
        </div>
        <a href={base} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, color: C.accSoft }}>
          {tx('Усі статті', 'All articles')} <ArrowRight size={15} />
        </a>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 14, marginTop: 24 }}>
        {posts.map((p) => (
          <a key={p.slug} href={`${base}/${p.slug}`} style={{ ...card, display: 'flex', flexDirection: 'column', overflow: 'hidden', textDecoration: 'none' }}>
            {p.cover?.src && (
              <img src={p.cover.src} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderBottom: '1px solid rgba(255,255,255,.06)' }} />
            )}
            <div style={{ padding: '16px 18px 20px' }}>
              <div style={{ fontFamily: F.sans, fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.35, marginBottom: 8 }}>{p.title}</div>
              <div style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: C.text3 }}>{p.excerpt}</div>
            </div>
          </a>
        ))}
      </div>
    </Section>
  );
}

