import { useState } from 'react';
import {
  Check, Crosshair, LayoutGrid, LineChart, CalendarDays, History, Table2, Share2, Newspaper,
} from 'lucide-react';
import { C, F, A, SHELL } from './base';
import { useLang, useTx, pick } from './lang';

/* ==================================================================
   Що всередині.

   Не таби над картинкою, а макет самого застосунку з робочим
   сайдбаром: людина клікає розділи так само, як клікатиме їх завтра
   всередині продукту. Різниця з табами не косметична — таби кажуть
   «подивись на скріншот», сайдбар каже «ти вже тут».
================================================================== */

const NAV = {
  uk: [
  { key: 'plan', title: 'План на день', icon: Crosshair, desc: 'Аналіз згори вниз від 1W до 1m, напрямок і перевірка стану перед сесією, яку не можна пропустити' },
  { key: 'journal', title: 'Журнал угод', icon: Table2, desc: 'Вхід, виконання і чесна частина: що відчував, що порушив, скільки це коштувало' },
  { key: 'analytics', title: 'Аналітика', icon: LineChart, desc: 'Сесії, пари, сетапи, дні тижня й емоції — за тим, скільки вони реально платять' },
  { key: 'weekly', title: 'Тижневі розбори', icon: CalendarDays, desc: 'Зібрати період, назвати закономірність, вибрати одну зміну. Можна поділитись лінком' },
  { key: 'backtest', title: 'Бектести', icon: History, desc: 'Перевір ідею на історії тим самим движком статистики, поки вона не коштувала грошей' },
  { key: 'method', title: 'Метод 20 угод', icon: LayoutGrid, desc: 'Двадцять угод поспіль, виконаних бездоганно за власною системою. Кожна перевіряється за чотирма гранями — стратегія, ризик, план, виконання, — і одна пропущена обнуляє серію' },
  { key: 'blog', title: 'Блог', icon: Newspaper, desc: 'Психологія, розбори тижня й база термінів — те, що видно в журналі, коли записуєш кожну угоду, тепер можна прочитати без входу' },
  ],
  en: [
    { key: 'plan', title: 'Daily plan', icon: Crosshair, desc: 'Top-down analysis from 1W to 1m, a bias, and a pre-session state check you can’t skip' },
    { key: 'journal', title: 'Trade journal', icon: Table2, desc: 'Entry, execution and the honest part: what you felt, what you broke, what it cost' },
    { key: 'analytics', title: 'Analytics', icon: LineChart, desc: 'Sessions, pairs, setups, weekdays and emotions — ranked by how much they actually pay' },
    { key: 'weekly', title: 'Weekly reviews', icon: CalendarDays, desc: 'Gather the period, name the pattern, pick one change. Shareable by link' },
    { key: 'backtest', title: 'Backtests', icon: History, desc: 'Test an idea on history with the same stats engine — before it costs you money' },
    { key: 'method', title: '20-trade method', icon: LayoutGrid, desc: 'Twenty trades in a row, executed flawlessly by your own system. Each is checked on four facets — strategy, risk, plan, execution — and one miss resets the streak' },
    { key: 'blog', title: 'Blog', icon: Newspaper, desc: 'Psychology, weekly reviews and a glossary — what the journal shows when you log every trade, now readable without an account' },
  ],
};

/* Анімації екранів.

   Кожна показує рівно те, що робить сам розділ: чекліст —
   відмічається, журнал — наповнюється рядками, аналітика — рахує
   стовпчики, крива бектесту — малюється зліва направо, метод —
   закриває клітинки одну за одною.

   Усі короткі (0.3–0.9с) і з дрібним кроком затримки: анімація тут
   пояснює зміст, а не розважає. Запускаються заново при кожному
   перемиканні розділу — за це відповідає key на робочій області. */
const SCREEN_CSS = `
@keyframes lnPop{0%{opacity:0;transform:scale(.82)}60%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes lnSlideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@keyframes lnGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes lnFill{from{width:0}}
@keyframes lnDraw{to{stroke-dashoffset:0}}
@keyframes lnSoftIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ln-screen [data-anim="pop"]{animation:lnPop .34s cubic-bezier(.22,1.3,.36,1) both}
.ln-screen [data-anim="slide"]{animation:lnSlideIn .38s cubic-bezier(.22,1,.36,1) both}
.ln-screen [data-anim="grow"]{transform-origin:bottom;animation:lnGrow .5s cubic-bezier(.22,1,.36,1) both}
.ln-screen [data-anim="fill"]{animation:lnFill .7s cubic-bezier(.22,1,.36,1) both}
.ln-screen [data-anim="soft"]{animation:lnSoftIn .4s ease-out both}
.ln-screen [data-anim="draw"]{stroke-dasharray:640;stroke-dashoffset:640;animation:lnDraw 1.1s cubic-bezier(.3,.9,.4,1) .12s both}

/* Нижче 760px сайдбар-рейка перестає бути рейкою: сім довгих назв
   одна під одною або в горизонтальному скролі — обидва варіанти
   вже пробували, і обидва читались погано на телефоні. Замість
   цього — сітка коротких плиток-іконок, яка сама переносить рядки
   й завжди видна вся одразу, без гортання. */
.ln-product-nav{ flex: 0 0 232px; min-width: 180px; border-right: 1px solid rgba(255,255,255,.06); padding: 12px 10px; display: flex; flex-direction: column; gap: 3px; }
.ln-product-navbtn{ position: relative; display: flex; align-items: center; gap: 11px; text-align: left; border: 0; border-radius: 11px; padding: 11px 12px 11px 14px; cursor: pointer; font-family: ${F.sans}; font-size: 14px; font-weight: 600; transition: background .2s ease, color .2s ease; width: 100%; }
.ln-product-navbar{ position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 2px; background: ${C.acc}; transition: opacity .2s ease; }
.ln-product-screen{ flex: 1 1 420px; min-width: 300px; padding: 24px; min-height: 340px; }

@media (max-width: 760px){
  .ln-product-nav{ flex: 1 1 100%; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.06); padding: 10px; gap: 6px; }
  .ln-product-navbtn{ width: auto; flex: 0 0 auto; gap: 6px; border-radius: 999px; padding: 6px 11px 6px 9px; font-size: 11.5px; border: 1px solid rgba(255,255,255,.08); }
  .ln-product-navbtn svg{ width: 12px; height: 12px; }
  .ln-product-navbar{ display: none; }
  .ln-product-screen{ flex: 1 1 100%; min-width: 0; padding: 16px; }
}

/* Журнал: п'ять жорстких колонок ("80px 1fr 90px 1fr 60px") не
   вміщаються у вузький екран навіть після переносу застосунку в
   один стовпчик. Стан і порушення ховаються з власних колонок і
   зʼявляються дрібним підрядком під сетапом — той самий рядок, лише
   в два поверхи замість одного. */
.ln-journal-sub{ display: none; }
.ln-journal-h-sym-short{ display: none; }
@media (max-width: 640px){
  .ln-journal-head, .ln-journal-row{ grid-template-columns: 62px 1fr 52px !important; }
  .ln-journal-mood, .ln-journal-viol{ display: none; }
  .ln-journal-sub{ display: inline; font-size: 11.5px; }
  .ln-journal-h-sym-full{ display: none; }
  .ln-journal-h-sym-short{ display: inline; }
}
`;

const card = { background: C.sunken, border: '1px solid rgba(255,255,255,.07)', borderRadius: 12 };
const capMono = { fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.dim };

/* ---------- екрани ---------- */

const PlanScreen = ({ tx }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{tx('План на 7 вересня', 'Plan for September 7')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(47,191,143,.1)', border: '1px solid rgba(47,191,143,.3)', borderRadius: 999, padding: '6px 14px' }}>
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.2px', color: C.ok }}>{tx('НАПРЯМОК', 'BIAS')} · LONG</span>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(120px,100%),1fr))', gap: 9, marginBottom: 20 }}>
      {[
        { tf: '1W', dir: tx('Тренд вгору', 'Uptrend'), level: '2 386.40', color: C.ok },
        { tf: '1D', dir: tx('Відкат до OB', 'Pullback to OB'), level: '2 412.80', color: C.ok },
        { tf: '4H', dir: tx('Чекаю свіп', 'Waiting for a sweep'), level: '2 421.15', color: C.warn },
        { tf: '1m', dir: tx('Вхід після FVG', 'Entry after FVG'), level: '2 419.90', color: C.acc },
      ].map((tf, i) => (
        <div key={tf.tf} data-anim="soft" style={{ ...card, padding: '13px 14px', animationDelay: `${i * 60}ms` }}>
          <div style={{ ...capMono, color: C.text4, marginBottom: 8 }}>{tf.tf}</div>
          <div style={{ fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, marginBottom: 5, color: tf.color }}>{tf.dir}</div>
          <div style={{ fontFamily: F.mono, fontSize: 11.5, color: C.text5 }}>{tf.level}</div>
        </div>
      ))}
    </div>

    <div style={{ ...capMono, marginBottom: 12 }}>{tx('СТАН ПЕРЕД СЕСІЄЮ · 5 З 5', 'PRE-SESSION STATE · 5 OF 5')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 9 }}>
      {(tx(
        ['Виспався', 'Немає відкритих збитків', 'План написаний до відкриття', 'Ризик на угоду 1%', 'Немає новин у сесію'],
        ['Slept well', 'No open losses', 'Plan written before the open', 'Risk per trade 1%', 'No news during the session'],
      )).map((t, i) => (
        <div key={t} style={{ ...card, borderRadius: 11, display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px' }}>
          {/* Галочки відмічаються по черзі — так само, як людина
              проходить чекліст перед сесією. */}
          <Check data-anim="pop" size={13} strokeWidth={3} color={C.ok} style={{ flexShrink: 0, animationDelay: `${260 + i * 110}ms` }} />
          <span style={{ fontFamily: F.sans, fontSize: 13, color: '#b8b8c8' }}>{t}</span>
        </div>
      ))}
    </div>
  </div>
);

/* mood лишається українським для підсвітки (порівняння нижче),
   показ — через *En. */
const JOURNAL = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', setupEn: 'Swing + FVG', mood: 'Спокій', moodEn: 'Calm', viol: '—', violEn: '—', r: '+2.4R' },
  { sym: 'GER40', setup: 'Judas swing', setupEn: 'Judas swing', mood: 'Спокій', moodEn: 'Calm', viol: '—', violEn: '—', r: '+1.8R' },
  { sym: 'EURUSD', setup: 'Без сетапу', setupEn: 'No setup', mood: 'Нудьга', moodEn: 'Boredom', viol: 'Вхід без умов', violEn: 'Entry without conditions', r: '−1.0R' },
  { sym: 'XAUUSD', setup: 'Сплеск на новині', setupEn: 'News spike', mood: 'FOMO', moodEn: 'FOMO', viol: 'Подвоїв обсяг', violEn: 'Doubled size', r: '−1.0R' },
  { sym: 'NAS100', setup: 'Ретест OB', setupEn: 'OB retest', mood: 'Фокус', moodEn: 'Focus', viol: '—', violEn: '—', r: '+1.6R' },
];

const GRID = '80px 1fr 90px 1fr 60px';

/* На вузькому екрані вʼязка «символ · сетап · R» лишається як
   основний рядок, а стан і порушення переїжджають дрібним підрядком
   під сетап — так само, як STATUS-бейдж у журналі самого застосунку
   несе на собі другорядну мітку способу виходу. П'ять жорстких
   колонок просто не влазять у 280px, а обрізати дані замість того,
   щоб перекласти їх у два рядки, — гірший компроміс. */
const JournalScreen = ({ tx, lang }) => (
  <div>
    <div className="ln-journal-head" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '0 4px 12px', ...capMono, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
      <span className="ln-journal-h-sym-full">{tx('ІНСТРУМЕНТ', 'SYMBOL')}</span>
      <span className="ln-journal-h-sym-short">{tx('АКТИВ', 'ASSET')}</span>
      <span>{tx('СЕТАП', 'SETUP')}</span>
      <span className="ln-journal-mood">{tx('СТАН', 'STATE')}</span><span className="ln-journal-viol">{tx('ЩО ПОРУШИВ', 'RULE BROKEN')}</span>
      <span style={{ textAlign: 'right' }}>R</span>
    </div>
    {JOURNAL.map((j, i) => (
      <div
        key={i}
        data-anim="slide"
        className="ln-journal-row"
        style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '13px 4px', borderBottom: '1px solid rgba(255,255,255,.035)', animationDelay: `${i * 70}ms` }}
      >
        <span className="ln-journal-sym" style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.text }}>{j.sym}</span>
        <span className="ln-journal-setup" style={{ fontFamily: F.sans, fontSize: 13, color: '#b8b8c8', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lang === 'en' ? j.setupEn : j.setup}
          <span className="ln-journal-sub">
            {' · '}
            <span style={{ color: j.mood === 'FOMO' ? C.warn : j.mood === 'Нудьга' ? '#8a8a9c' : C.ok }}>{lang === 'en' ? j.moodEn : j.mood}</span>
            {j.viol !== '—' && <span style={{ color: '#ff9b9b' }}>{' · '}{lang === 'en' ? j.violEn : j.viol}</span>}
          </span>
        </span>
        <span className="ln-journal-mood" style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color: j.mood === 'FOMO' ? C.warn : j.mood === 'Нудьга' ? '#8a8a9c' : C.ok }}>{lang === 'en' ? j.moodEn : j.mood}</span>
        <span className="ln-journal-viol" style={{ fontFamily: F.sans, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: j.viol === '—' ? C.dim : '#ff9b9b' }}>{lang === 'en' ? j.violEn : j.viol}</span>
        <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, textAlign: 'right', color: j.r.startsWith('−') ? C.bad : C.ok }}>{j.r}</span>
      </div>
    ))}
  </div>
);

const CHARTS = {
  uk: [
    { title: 'СЕСІЇ', bars: [['Азія', 0.3], ['Лондон', 1], ['NY', 0.62]] },
    { title: 'СЕТАПИ', bars: [['A', 1], ['B', 0.55], ['C', 0.22]] },
    { title: 'ДНІ ТИЖНЯ', bars: [['Пн', 0.6], ['Вт', 0.18], ['Ср', 0.82], ['Чт', 0.44], ['Пт', 0.7]] },
  ],
  en: [
    { title: 'SESSIONS', bars: [['Asia', 0.3], ['London', 1], ['NY', 0.62]] },
    { title: 'SETUPS', bars: [['A', 1], ['B', 0.55], ['C', 0.22]] },
    { title: 'WEEKDAYS', bars: [['Mon', 0.6], ['Tue', 0.18], ['Wed', 0.82], ['Thu', 0.44], ['Fri', 0.7]] },
  ],
};

const RANKING = {
  uk: [
    ['Сетап A · свінг + FVG', '+11.4R', C.ok],
    ['Лондонська сесія', '+8.2R', C.ok],
    ['Входи на FOMO', '−8.4R', C.bad],
    ['Вівторок · вечір', '−9.0R', C.bad],
  ],
  en: [
    ['Setup A · swing + FVG', '+11.4R', C.ok],
    ['London session', '+8.2R', C.ok],
    ['FOMO entries', '−8.4R', C.bad],
    ['Tuesday · evening', '−9.0R', C.bad],
  ],
};

const AnalyticsScreen = ({ tx, lang }) => (
  <div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))', gap: 12, marginBottom: 18 }}>
      {pick(lang, CHARTS).map((ch) => (
        <div key={ch.title} style={{ ...card, borderRadius: 14, padding: 15 }}>
          <div style={{ ...capMono, color: C.text4, marginBottom: 14 }}>{ch.title}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 74 }}>
            {ch.bars.map(([label, v], bi) => (
              <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                <div
                  data-anim="grow"
                  style={{ width: '100%', borderRadius: '4px 4px 0 0', height: Math.round(v * 60), background: v >= 0.55 ? A(0.85) : A(0.32), animationDelay: `${bi * 80}ms` }}
                />
                <span style={{ fontFamily: F.mono, fontSize: 10, color: C.dim }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div style={{ ...capMono, marginBottom: 11 }}>{tx('СКІЛЬКИ ПЛАТИТЬ · РЕЙТИНГ', 'WHAT PAYS · RANKING')}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, overflow: 'hidden' }}>
      {pick(lang, RANKING).map(([k, v, c], i) => (
        <div key={k} data-anim="soft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 15px', background: C.sunken, animationDelay: `${300 + i * 70}ms` }}>
          <span style={{ fontFamily: F.sans, fontSize: 13, color: '#b8b8c8' }}>{k}</span>
          <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: c }}>{v}</span>
        </div>
      ))}
    </div>
  </div>
);

const WeeklyScreen = ({ tx }) => (
  <div style={{ ...card, borderRadius: 16, padding: 'clamp(14px,4vw,22px)' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        <div style={{ ...capMono, color: C.text4, marginBottom: 7 }}>{tx('ТИЖНЕВИЙ РОЗБІР', 'WEEKLY REVIEW')}</div>
        <div style={{ fontFamily: F.sans, fontSize: 16.5, fontWeight: 700, color: '#fff' }}>{tx('31 серпня — 6 вересня', 'August 31 — September 6')}</div>
      </div>
      <button
        type="button"
        style={{ display: 'flex', alignItems: 'center', gap: 8, background: A(0.1), border: `1px solid ${A(0.3)}`, color: C.accSoft, fontFamily: F.sans, fontSize: 13, fontWeight: 700, padding: '9px 15px', borderRadius: 11, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .16s' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = A(0.18); e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = A(0.1); e.currentTarget.style.color = C.accSoft; }}
      >
        <Share2 size={13} strokeWidth={2} />
        {tx('Поділитись', 'Share')}
      </button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(110px,100%),1fr))', gap: 9, marginBottom: 18 }}>
      {[['68%', tx('дисципліна', 'discipline'), C.warn], ['22', tx('угод за тиждень', 'trades this week'), C.text], ['−8.4R', tx('повз план', 'off plan'), C.bad]].map(([v, k, c], i) => (
        <div key={k} data-anim="soft" style={{ background: C.panel, border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: 13, animationDelay: `${i * 80}ms` }}>
          <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 22, letterSpacing: '-.8px', color: c }}>{v}</div>
          <div style={{ fontFamily: F.sans, fontSize: 11.5, color: C.text4, marginTop: 5 }}>{k}</div>
        </div>
      ))}
    </div>

    <div style={{ fontFamily: F.sans, fontSize: 14, lineHeight: 1.65, color: '#b8b8c8' }}>
      {tx(
        'Вісім угод із двадцяти двох взяті повз план, і всі вісім у мінус: разом −8.4R. Одна зміна на наступний тиждень — перерва після двох мінусів поспіль',
        'Eight of twenty-two trades were off plan, and all eight lost: −8.4R in total. One change for next week — a break after two losses in a row',
      )}
    </div>
  </div>
);

const BT_STATS = {
  uk: [
    ['+0.42R', 'очікування', C.ok], ['47%', 'вінрейт', C.text], ['1.84', 'профіт-фактор', C.text],
    ['−6.1R', 'просадка', C.bad], ['120', 'угод', C.text], ['Лондон', 'найкраща сесія', C.acc],
  ],
  en: [
    ['+0.42R', 'expectancy', C.ok], ['47%', 'win rate', C.text], ['1.84', 'profit factor', C.text],
    ['−6.1R', 'drawdown', C.bad], ['120', 'trades', C.text], ['London', 'best session', C.acc],
  ],
};

const BacktestScreen = ({ tx, lang }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{tx('Свінг + FVG · 120 угод на історії', 'Swing + FVG · 120 trades on history')}</div>
      <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.text4 }}>2024.01 — 2026.08</span>
    </div>

    <svg viewBox="0 0 300 70" preserveAspectRatio="none" style={{ width: '100%', height: 110, display: 'block', marginBottom: 18 }}>
      <defs>
        <linearGradient id="lnBtFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.acc} stopOpacity=".26" />
          <stop offset="1" stopColor={C.acc} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,58 C24,54 40,56 60,46 C80,37 96,42 116,32 C138,21 152,26 176,18 C200,11 224,14 250,8 C266,5 284,6 300,3 L300,70 L0,70 Z" fill="url(#lnBtFill)" />
      {/* Крива малюється зліва направо — рівно так, як прогін
          проходить історію. */}
      <polyline data-anim="draw" points="0,58 30,54 60,46 90,39 116,32 146,24 176,18 210,13 250,8 300,3" fill="none" stroke={C.acc} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(120px,100%),1fr))', gap: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, overflow: 'hidden' }}>
      {pick(lang, BT_STATS).map(([v, k, c], i) => (
        <div key={k} data-anim="soft" style={{ background: C.sunken, padding: '14px 15px', animationDelay: `${400 + i * 60}ms` }}>
          <div style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: c }}>{v}</div>
          <div style={{ fontFamily: F.sans, fontSize: 11.5, color: C.text5, marginTop: 6 }}>{k}</div>
        </div>
      ))}
    </div>
  </div>
);

/* Метод 20 угод.

   Сама сітка з двадцяти клітинок нічого не пояснює: людина бачить
   квадратики й не розуміє, що це. Тому поруч — з чого складається
   кожна угода (чотири критерії), скільки їх закрито бездоганно і
   що взагалі означає «бездоганно».

   Вправа не про прибуток, а про дисципліну — це і сказано прямо,
   інакше сітку читають як звіт про заробіток. */
const CRITERIA = {
  uk: [
    ['Стратегія', 'сетап є в плейбуці, а не «на чуйці»'],
    ['Ризик', 'обсяг і стоп за правилами, без відігравання'],
    ['План', 'вхід, стоп і ціль написані ДО входу'],
    ['Виконання', 'не відсував стоп і не закрив зі страху'],
  ],
  en: [
    ['Strategy', 'the setup is in your playbook, not a gut call'],
    ['Risk', 'size and stop by the rules, no revenge'],
    ['Plan', 'entry, stop and target written BEFORE the entry'],
    ['Execution', 'didn’t move the stop or close out of fear'],
  ],
};

const MethodScreen = ({ tx, lang }) => (
  <div>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 6 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, color: '#fff' }}>{tx('Метод 20 угод', 'The 20-trade method')}</div>
        <div style={{ fontFamily: F.sans, fontSize: 13, color: '#8a8a9c', marginTop: 5, maxWidth: 420 }}>
          {tx(
            'Вправа не про прибуток, а про дисципліну: двадцять угод поспіль, виконаних бездоганно за власною системою',
            'An exercise in discipline, not profit: twenty trades in a row, executed flawlessly by your own system',
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        <span style={{ fontFamily: F.display, fontSize: 30, fontWeight: 700, letterSpacing: '-1.2px', color: C.acc }}>12</span>
        <span style={{ fontFamily: F.sans, fontSize: 13, color: C.text4 }}>/ 20 {tx('бездоганних', 'flawless')}</span>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 18 }}>
      {/* ---- сітка ---- */}
      <div style={{ flex: '1 1 300px', minWidth: 'min(260px,100%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(44px,100%),1fr))', gap: 8 }}>
          {Array.from({ length: 20 }, (_, i) => {
            const done = i < 12 ? 4 : i === 12 ? 3 : i < 15 ? 2 : 0;
            const perfect = done === 4;
            return (
              <div
                key={i}
                data-anim="pop"
                title={tx(`Угода ${i + 1}: ${done} з 4 критеріїв`, `Trade ${i + 1}: ${done} of 4 criteria`)}
                style={{
                  borderRadius: 10, padding: '8px 7px',
                  border: `1px solid ${perfect ? A(0.34) : done ? 'rgba(245,163,59,.3)' : 'rgba(255,255,255,.06)'}`,
                  background: perfect ? A(0.09) : done ? 'rgba(245,163,59,.05)' : C.sunken,
                  animationDelay: `${i * 26}ms`,
                }}
              >
                <div style={{ fontFamily: F.mono, fontSize: 10, color: done ? C.text4 : '#3f3f4e', marginBottom: 6 }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
                  {[0, 1, 2, 3].map((k) => (
                    <span
                      key={k}
                      style={{
                        height: 4, borderRadius: 2, display: 'block',
                        background: k < done ? (perfect ? C.acc : C.warn) : 'rgba(255,255,255,.09)',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          {[[tx('бездоганна', 'flawless'), C.acc], [tx('з порушенням', 'with a violation'), C.warn], [tx('попереду', 'ahead'), 'rgba(255,255,255,.14)']].map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: F.sans, fontSize: 12, color: C.text4 }}>
              <span style={{ width: 14, height: 4, borderRadius: 2, background: color, display: 'block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ---- з чого складається кожна угода ---- */}
      <div style={{ flex: '1 1 260px', minWidth: 'min(240px,100%)' }}>
        <div style={{ ...capMono, marginBottom: 12 }}>{tx('ЧОТИРИ ГРАНІ КОЖНОЇ УГОДИ', 'FOUR FACETS OF EVERY TRADE')}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pick(lang, CRITERIA).map(([name, hint], i) => (
            <div
              key={name}
              data-anim="soft"
              style={{ ...card, display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 13px', animationDelay: `${180 + i * 70}ms` }}
            >
              <span
                style={{
                  display: 'grid', placeItems: 'center', width: 20, height: 20, flexShrink: 0, marginTop: 1,
                  borderRadius: 6, background: A(0.14), border: `1px solid ${A(0.36)}`, color: C.accSoft,
                }}
              >
                <Check size={11} strokeWidth={3.2} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{name}</span>
                <span style={{ display: 'block', fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.45, color: '#7d7d90', marginTop: 3 }}>{hint}</span>
              </span>
            </div>
          ))}
        </div>

        <div
          data-anim="soft"
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: '12px 14px', borderRadius: 13, background: A(0.07), border: `1px solid ${A(0.2)}`, animationDelay: '480ms' }}
        >
          <span style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: '#c4c4d4' }}>
            {tx(
              'Одна пропущена грань — і угода не зараховується, навіть якщо вона в плюс. Серія обнуляється: рахується виконання, а не результат',
              'Miss one facet and the trade doesn’t count, even if it’s green. The streak resets: execution counts, not the result',
            )}
          </span>
        </div>
      </div>
    </div>
  </div>
);

/* Блог.

   Єдиний екран тут не з застосунку, а з публічної частини сайту —
   і це видно навмисно: обкладинки-градієнти й картки статей замість
   плиток та кривих. Той самий журнал, який щойно рахував сесії й
   сетапи, віддає частину висновків назовні, без входу. */
const BLOG_POSTS = {
  uk: [
  {
    cat: 'Психологія', color: C.acc,
    title: 'Чому дисципліна тримається на цифрах, а не на силі волі',
    excerpt: 'Що насправді показує журнал за місяць — і чому це працює краще за обіцянки собі',
    read: '4 хв',
  },
  {
    cat: 'Weekly review', color: C.ok,
    title: 'Розбір тижня: одна звичка, яка зʼїдає перевагу',
    excerpt: 'Приклад рядок за рядком — як зібрати період і побачити патерн, а не окрему угоду',
    read: '3 хв',
  },
  {
    cat: 'База', color: C.warn,
    title: 'R-multiple, профіт-фактор і просадка — коротко про терміни',
    excerpt: 'Словник, який економить час, коли читаєш власну статистику',
    read: '5 хв',
  },
  ],
  en: [
    {
      cat: 'Psychology', color: C.acc,
      title: 'Why discipline runs on numbers, not willpower',
      excerpt: 'What a month of journaling really shows — and why it beats promises to yourself',
      read: '4 min',
    },
    {
      cat: 'Weekly review', color: C.ok,
      title: 'Weekly review: the one habit eating your edge',
      excerpt: 'A line-by-line example of gathering a period and seeing a pattern instead of a single trade',
      read: '3 min',
    },
    {
      cat: 'Basics', color: C.warn,
      title: 'R-multiple, profit factor and drawdown in brief',
      excerpt: 'A glossary that saves time when you read your own stats',
      read: '5 min',
    },
  ],
};

const BlogScreen = ({ tx, lang }) => (
  <div>
    <div style={{ ...capMono, marginBottom: 14 }}>{tx('ОСТАННІ СТАТТІ', 'LATEST ARTICLES')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(190px,100%),1fr))', gap: 14 }}>
      {pick(lang, BLOG_POSTS).map((p, i) => (
        <div
          key={p.title}
          data-anim="soft"
          style={{ ...card, borderRadius: 14, overflow: 'hidden', animationDelay: `${i * 90}ms` }}
        >
          <div
            style={{
              position: 'relative', height: 84,
              background: `linear-gradient(135deg, ${p.color}2e, transparent)`,
              borderBottom: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span
              data-anim="pop"
              style={{
                position: 'absolute', left: 12, bottom: 10,
                fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '.3px',
                color: p.color, background: `${p.color}1f`, border: `1px solid ${p.color}4d`,
                borderRadius: 999, padding: '4px 10px', animationDelay: `${160 + i * 90}ms`,
              }}
            >
              {p.cat}
            </span>
          </div>
          <div style={{ padding: '14px 15px 16px' }}>
            <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.32, marginBottom: 7 }}>
              {p.title}
            </div>
            <div style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: '#8a8a9c', marginBottom: 11 }}>
              {p.excerpt}
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, color: C.dim }}>{p.read} {tx('читання', 'read')}</div>
          </div>
        </div>
      ))}
    </div>

    <div
      data-anim="soft"
      style={{
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
        padding: '12px 14px', borderRadius: 13, background: A(0.07), border: `1px solid ${A(0.2)}`,
        animationDelay: '420ms',
      }}
    >
      <Newspaper size={15} strokeWidth={1.9} style={{ flexShrink: 0, color: C.accSoft }} />
      <span style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: '#c4c4d4' }}>
        {tx('Публічний розділ — можна читати й ділитись лінком без акаунта', 'A public section — read and share by link without an account')}
      </span>
    </div>
  </div>
);

const SCREENS = [PlanScreen, JournalScreen, AnalyticsScreen, WeeklyScreen, BacktestScreen, MethodScreen, BlogScreen];

export default function Product() {
  const lang = useLang();
  const tx = useTx();
  const navItems = pick(lang, NAV);
  const [nav, setNav] = useState(0);
  const Screen = SCREENS[nav];
  const item = navItems[nav];

  return (
    <section id="product" style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <style>{SCREEN_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.text3 }}>{tx('ЩО ВСЕРЕДИНІ', 'WHAT’S INSIDE')}</span>
      </div>

      <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 30px', color: '#fff' }}>
        {tx('Ти заповнюєш журнал', 'You fill in the journal')}{' '}
        <br />
        {tx('Він думає за тебе', 'It does the thinking')}
      </h2>

      <div style={{ position: 'relative', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          {[0, 1, 2].map((d) => <span key={d} style={{ width: 9, height: 9, borderRadius: 999, background: '#3a3a46', display: 'block' }} />)}
          <span style={{ marginLeft: 12, fontFamily: F.mono, fontSize: 11.5, letterSpacing: '1.3px', color: C.text4 }}>
            EDGE JOURNAL · {item.title.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div className="ln-product-nav">
            {navItems.map((n, i) => {
              const on = i === nav;
              const Icon = n.icon;
              return (
                <button
                  key={n.key}
                  type="button"
                  className="ln-product-navbtn"
                  onClick={() => setNav(i)}
                  style={{
                    background: on ? A(0.1) : 'transparent',
                    color: on ? '#fff' : '#8a8a9c',
                    borderColor: on ? A(0.4) : undefined,
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = A(0.07); }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = on ? A(0.1) : 'transparent'; }}
                >
                  <span className="ln-product-navbar" style={{ opacity: on ? 1 : 0 }} />
                  <Icon size={15} strokeWidth={1.9} style={{ flexShrink: 0, color: on ? C.accSoft : C.text5 }} />
                  {n.title}
                </button>
              );
            })}
          </div>

          {/* key перезапускає анімації на кожному перемиканні: без
              нього другий і подальші екрани показувались би вже
              «доанімованими». */}
          <div key={item.key} className="ln-screen ln-product-screen">
            <Screen tx={tx} lang={lang} />
          </div>
        </div>
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: '#7d7d90', marginTop: 16, maxWidth: 760 }}>
        {item.desc}
      </div>
    </section>
  );
}
