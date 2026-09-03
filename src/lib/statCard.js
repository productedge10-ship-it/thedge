import { supabase } from './supabase';

/* ==================================================================
   Картка статистики.

   Трейдер хоче показати свої цифри — і має отримати не скріншот
   таблиці, а готовий постер: чорне тло, одна головна цифра, крива
   еквіті й кілька опорних метрик. Тому картка малюється як SVG:
   один рядок розмітки, з якого однаково легко зробити PNG, сторінку
   за посиланням і друк у PDF.

   Посилання віддає ЗЛІПОК: цифри заморожуються в момент експорту.
   Інакше людина ділиться результатом, а через тиждень за тим самим
   лінком видно вже інший — це не сніпет, а витік поточного стану.
================================================================== */

/* ---------- палітра ----------

   Взята з логотипа: фіолетовий → синій → бірюзовий. Раніше картка
   була зелена на чорному — колір за замовчуванням для будь-якого
   торгового застосунку, і саме тому вона не запамʼятовувалась.
   Тепер картка забарвлена так само, як знак, і впізнається з
   мініатюри в чужій стрічці.

   Мінус — не червоний, а рожевий: чистий червоний на темному тлі
   кричить і здешевлює. Rose тримає ту саму інформацію спокійніше. */
const P = {
  bg:      '#05060A',
  line:    '#22232c',
  text:    '#FAFAFA',
  text2:   '#B4B4BD',
  text3:   '#7A7A85',
  text4:   '#4A4A52',

  violet:  '#8B5CF6',
  indigo:  '#4F46E5',
  blue:    '#3B82F6',
  cyan:    '#22D3EE',
  teal:    '#2DD4BF',

  acc:     '#7C6BFF',
  ok:      '#2DD4BF',
  bad:     '#FB7185',
  warn:    '#FBBF24',
};

const r2 = (v) => Math.round(Number(v) * 100) / 100;
const signR = (v) => `${v > 0 ? '+' : ''}${r2(v)}R`;

/* ---------- що взагалі можна показати ----------
   Порядок тут = порядок у списку вибору. Перші чотири ввімкнені
   за замовчуванням: це те, що питають першим при будь-якій розмові
   про результат. */
/* label — для списку вибору в застосунку, en — для самої картки.
   Картка англійською свідомо: її показують у X і Discord, де
   українські підписи одразу звужують аудиторію до своїх. */
export const METRICS = [
  { id: 'net',        label: 'Net R',            hint: 'сумарний результат',
    en: 'Net R',              enHint: 'total result',            def: true,
    get: (s) => ({ value: signR(s.net), tone: s.net >= 0 ? 'ok' : 'bad' }) },
  { id: 'wr',         label: 'Win rate',         hint: 'частка прибуткових',
    en: 'Win Rate',           enHint: 'winning trades',          def: true,
    get: (s) => ({ value: `${s.wr}%`, tone: s.wr >= 50 ? 'ok' : 'plain' }) },
  { id: 'pf',         label: 'Profit factor',    hint: 'прибуток до збитку',
    en: 'Profit Factor',      enHint: 'gross win / gross loss',  def: true,
    get: (s) => ({ value: r2(s.pf).toFixed(2), tone: s.pf >= 1.5 ? 'ok' : s.pf >= 1 ? 'warn' : 'bad' }) },
  { id: 'trades',     label: 'Угод',             hint: 'у вибірці',
    en: 'Trades',             enHint: 'in sample',               def: true,
    get: (s) => ({ value: String(s.trades.length), tone: 'plain' }) },

  { id: 'expectancy', label: 'Очікування',       hint: 'на одну угоду',
    en: 'Expectancy',         enHint: 'per trade',               def: false,
    get: (s) => ({ value: signR(s.expectancy), tone: s.expectancy >= 0 ? 'ok' : 'bad' }) },
  { id: 'maxdd',      label: 'Макс. просадка',   hint: 'найглибше падіння',
    en: 'Max Drawdown',       enHint: 'deepest decline',         def: false,
    get: (s) => ({ value: `${r2(s.maxDD)}R`, tone: 'warn' }) },
  { id: 'adherence',  label: 'За планом',        hint: 'угод без порушень',
    en: 'Plan Adherence',     enHint: 'trades by the book',      def: false,
    get: (s) => ({ value: `${s.adherence}%`, tone: s.adherence >= 70 ? 'ok' : 'warn' }) },
  { id: 'avgwin',     label: 'Середній плюс',    hint: 'по виграшних',
    en: 'Average Win',        enHint: 'across winners',          def: false,
    get: (s) => ({ value: signR(s.avgWin), tone: 'ok' }) },
  { id: 'avgloss',    label: 'Середній мінус',   hint: 'по програшних',
    en: 'Average Loss',       enHint: 'across losers',           def: false,
    get: (s) => ({ value: signR(s.avgLoss), tone: 'bad' }) },
  { id: 'bestw',      label: 'Найдовша серія',   hint: 'плюсів поспіль',
    en: 'Best Streak',        enHint: 'wins in a row',           def: false,
    get: (s) => ({ value: String(s.bestW), tone: 'ok' }) },
  { id: 'recovery',   label: 'Recovery factor',  hint: 'результат до просадки',
    en: 'Recovery Factor',    enHint: 'net / max drawdown',      def: false,
    get: (s) => ({ value: r2(s.recovery).toFixed(2), tone: s.recovery >= 2 ? 'ok' : 'plain' }) },
  { id: 'session',    label: 'Найкраща сесія',   hint: 'за сумою R',
    en: 'Best Session',       enHint: 'by total R',              def: false,
    get: (s) => {
      const b = [...s.bySession].sort((a, c) => c.net - a.net)[0];
      return { value: b ? b.session : '—', sub: b ? signR(b.net) : '', tone: 'plain' };
    } },
  { id: 'asset',      label: 'Найкращий актив',  hint: 'за сумою R',
    en: 'Best Instrument',    enHint: 'by total R',              def: false,
    get: (s) => {
      const b = [...s.byAsset].sort((a, c) => c.net - a.net)[0];
      return { value: b ? b.key : '—', sub: b ? signR(b.net) : '', tone: 'plain' };
    } },
  { id: 'day',        label: 'Найкращий день',   hint: 'за середнім R',
    en: 'Best Weekday',       enHint: 'by average R',            def: false,
    get: (s) => {
      const b = [...s.byDow].sort((a, c) => c.avg - a.avg)[0];
      return { value: b ? b.day : '—', sub: b ? `${signR(b.avg)} avg` : '', tone: 'plain' };
    } },
];

/* Період приходить зі сторінки аналітики українською */
const PERIOD_EN = {
  'Весь час': 'All Time',
  'Цей квартал': 'This Quarter',
  'Останні 30 днів': 'Last 30 Days',
  'Цей тиждень': 'This Week',
};

export const DEFAULT_METRICS = METRICS.filter((m) => m.def).map((m) => m.id);

/* ---------- модель картки ----------
   Усе, що потрібно для малювання, рахуємо один раз тут. Далі і PNG,
   і публічна сторінка беруть готовий обʼєкт, тому не можуть
   розійтись у цифрах. */
export function buildCard(stats, { title, period, metrics, author }) {
  const chosen = metrics
    .map((id) => METRICS.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => ({ id: m.id, label: m.en, hint: m.enHint, ...m.get(stats) }));

  const eq = stats.equity || [];
  const step = Math.max(1, Math.ceil(eq.length / 120));
  const curve = eq.filter((_, i) => i % step === 0).map((p) => p.value);

  return {
    v: 2,
    title: title?.trim() || 'Net Performance',
    period: PERIOD_EN[period] || period || 'All Time',
    author: author || '',
    trades: stats.trades?.length || 0,
    createdAt: new Date().toISOString(),
    hero: {
      label: 'Net R',
      value: signR(stats.net),
      up: stats.net >= 0,
    },
    metrics: chosen,
    curve,
  };
}

/* ---------- SVG ---------- */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const toneColor = (tone) => ({ ok: P.ok, bad: P.bad, warn: P.warn }[tone] || P.text);

function curvePath(values, x, y, w, h) {
  if (!values.length) return '';
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const step = values.length > 1 ? w / (values.length - 1) : w;

  return values
    .map((v, i) => {
      const px = x + i * step;
      const py = y + h - ((v - min) / span) * h;
      return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

/* Логотип має бути логотипом і в картинці теж, тому «THE EDGE» тут
   набрано тим самим Space Grotesk, що й у меню. Картка малюється
   інлайн у сторінці — шрифт, який уже підвантажив застосунок,
   застосовується до неї так само, як до звичайного тексту. */
const BRAND = "'Space Grotesk', 'Trebuchet MS', Arial, sans-serif";
const SANS = "Roboto, 'Segoe UI', Arial, sans-serif";

/* Короткий код картки — з дати створення, щоб не мінявся між
   перемальовуваннями. Дає документу відчуття екземпляра, а не
   скріншота: у кожної картки свій номер. */
function serial(iso) {
  let h = 0;
  const s = String(iso);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().slice(-4).padStart(4, '0');
}

export function renderCardSvg(card) {
  const W = 1200;
  const H = 675;
  const M = 88;
  const up = card.hero.up;
  const accent = up ? P.ok : P.bad;

  /* Картка живе на сторінці інлайном, а не картинкою — інакше не
     підхопився б фірмовий шрифт. Тому ідентифікатори градієнтів
     мають бути унікальні: два прев'ю в одному документі інакше
     перетягнули б defs одне в одного. */
  const u = Math.random().toString(36).slice(2, 8);

  /* ---------- сітка метрик ----------

     Net R звідси прибрано: він уже стоїть головним числом, і
     повторений унизу з підписом «total result» читався як помилка
     верстки. Дублювати найголовніше — найшвидший спосіб зробити з
     постера дашборд.

     Розділових ліній між комірками теж немає. Рівний крок і спільна
     базова лінія тримають рядок краще за волосини, а кожна зайва
     риска на такій картці працює проти неї. */
  const picked = card.metrics.filter((m) => m.id !== 'net');
  const items = (picked.length ? picked : card.metrics).slice(0, 4);
  const cols = Math.max(1, items.length);
  const step = (W - M * 2) / cols;

  const GY = 512;                       // базова лінія підписів
  const cells = items.map((m, i) => {
    const x = M + i * step;
    return `
      <text x="${x.toFixed(1)}" y="${GY}" fill="#5c5c68" font-family="${SANS}"
            font-size="11" font-weight="700" letter-spacing="2.6">${esc(m.label.toUpperCase())}</text>
      <text x="${x.toFixed(1)}" y="${GY + 46}" fill="${toneColor(m.tone)}" font-family="${BRAND}"
            font-size="40" font-weight="700" letter-spacing="-1.5">${esc(m.value)}</text>
      ${m.sub ? `<text x="${x.toFixed(1)}" y="${GY + 70}" fill="#4a4a55" font-family="${SANS}"
            font-size="12.5">${esc(m.sub)}</text>` : ''}`;
  }).join('');

  /* ---------- крива ----------

     Без рамки, осей і підпису «EQUITY CURVE». Це не графік для
     читання цифр, а силует результату: форма зрозуміла без слів, а
     підпис лише крав би увагу в головного числа.

     Зона побільшала — раніше крива тулилась у куті й виглядала як
     віджет, приліплений збоку. */
  const cx = 646;
  const cy = 206;
  const cwid = W - M - cx;
  const chgt = 200;
  const path = curvePath(card.curve, cx, cy, cwid, chgt);

  const last = (() => {
    if (card.curve.length < 2) return null;
    const min = Math.min(0, ...card.curve);
    const max = Math.max(0, ...card.curve);
    const span = max - min || 1;
    const v = card.curve[card.curve.length - 1];
    return { x: cx + cwid, y: cy + chgt - ((v - min) / span) * chgt };
  })();

  /* ---------- головне число ----------
     Суфікс «R» відділяється й ставиться меншим, піднятим до верхньої
     лінії — так, як набирають валюту на банкнотах і в фінансових
     звітах. Цифра лишається цифрою, одиниця не змагається з нею за
     розмір. */
  const hm = String(card.hero.value).match(/^([+\-−]?[\d.,]+)(.*)$/);
  const heroNum = hm ? hm[1] : String(card.hero.value);
  const heroSuf = hm ? hm[2] : '';

  const footY = 600;
  const code = serial(card.createdAt);
  const stamp = new Date(card.createdAt)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg${u}" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="#0B0C15"/>
      <stop offset="48%" stop-color="#06070C"/>
      <stop offset="100%" stop-color="#040509"/>
    </linearGradient>

    <!-- ── світло в кутах ──
         Не декор: два джерела в кольорах знака тримають композицію
         по діагоналі й не дають чорному полю здатись пласким. -->
    <radialGradient id="lightA${u}" cx="86%" cy="4%" r="58%">
      <stop offset="0%" stop-color="${P.violet}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${P.violet}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lightB${u}" cx="4%" cy="96%" r="52%">
      <stop offset="0%" stop-color="${P.teal}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${P.teal}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig${u}" cx="46%" cy="48%" r="74%">
      <stop offset="52%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.52"/>
    </radialGradient>

    <pattern id="guard${u}" width="7" height="7" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="7" fill="#ffffff" fill-opacity="0.014"/>
    </pattern>

    <linearGradient id="bar${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${P.violet}"/>
      <stop offset="34%" stop-color="${P.blue}"/>
      <stop offset="64%" stop-color="${P.teal}"/>
      <stop offset="100%" stop-color="${P.teal}" stop-opacity="0"/>
    </linearGradient>

    <!-- Головне число: біле згори, кольорове знизу. Повністю
         кольорова цифра на темному втрачає читабельність, повністю
         біла — характер. Градієнт дає і те, і те. -->
    <linearGradient id="heroFill${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="52%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <radialGradient id="heroGlow${u}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="fill${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>

    <linearGradient id="sheen${u}" x1="0" y1="0" x2="1" y2="0.55">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.03"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0.006"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg${u})"/>
  <rect width="${W}" height="${H}" fill="url(#guard${u})"/>
  <rect width="${W}" height="${H}" fill="url(#lightA${u})"/>
  <rect width="${W}" height="${H}" fill="url(#lightB${u})"/>
  <rect width="${W}" height="${H}" fill="url(#sheen${u})"/>
  <rect width="${W}" height="${H}" fill="url(#vig${u})"/>
  <rect x="0" y="0" width="${W}" height="3" fill="url(#bar${u})"/>

  <!-- ═══ паспарту ═══
       Тонка внутрішня рамка з кутовими мітками. Дві дрібниці, але
       саме вони змушують око читати це як документ, який видали, а
       не картинку, яку зробили. -->
  <rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="12" fill="none"
        stroke="#ffffff" stroke-opacity="0.055"/>
  <g stroke="${P.violet}" stroke-opacity="0.5" stroke-width="1.4" fill="none" stroke-linecap="square">
    <path d="M30 56 L30 30 L56 30"/>
    <path d="M${W - 56} 30 L${W - 30} 30 L${W - 30} 56"/>
    <path d="M${W - 30} ${H - 56} L${W - 30} ${H - 30} L${W - 56} ${H - 30}"/>
    <path d="M56 ${H - 30} L30 ${H - 30} L30 ${H - 56}"/>
  </g>

  <!-- ═══ знак ═══
       Тільки вордмарк, без графічного знака поруч. Набір збігається
       з EdgeWordmark один в один — Space Grotesk 800, верхній
       регістр, розрядка 4.4, «THE» тихіше, «EDGE» кольором. Логотип
       має бути тим самим логотипом скрізь, інакше картка в чужій
       стрічці читається як від іншого продукту. -->
  <text x="${M}" y="${card.author ? 96 : 104}" font-family="${BRAND}" font-size="19"
        font-weight="800" letter-spacing="4.8"><tspan fill="#e8e9ef">THE </tspan><tspan fill="${P.violet}">EDGE</tspan></text>

  ${card.author ? `<text x="${M + 1}" y="118" fill="#7d7d8c" font-family="${SANS}"
        font-size="11.5" font-weight="600" letter-spacing="2.4">${esc(card.author.toUpperCase())}</text>` : ''}

  <rect x="${W - M - 168}" y="85" width="168" height="30" rx="15" fill="none"
        stroke="#ffffff" stroke-opacity="0.16"/>
  <text x="${W - M - 84}" y="105" fill="#a5a5b4" font-family="${SANS}" font-size="12"
        font-weight="700" letter-spacing="2.2" text-anchor="middle">${esc(card.period.toUpperCase())}</text>

  <line x1="${M}" y1="172" x2="${W - M}" y2="172" stroke="#ffffff" stroke-opacity="0.07"/>
  <rect x="${M}" y="171" width="64" height="2" fill="url(#bar${u})"/>

  <!-- ═══ головне число ═══ -->
  <ellipse cx="${M + 210}" cy="318" rx="340" ry="155" fill="url(#heroGlow${u})"/>

  <text x="${M}" y="226" fill="#75757f" font-family="${SANS}" font-size="12"
        font-weight="700" letter-spacing="3.6">${esc(card.title.toUpperCase())}</text>

  <text x="${M - 7}" y="372" fill="url(#heroFill${u})" font-family="${BRAND}" font-weight="700" xml:space="preserve"><tspan font-size="158" letter-spacing="-7.5">${esc(heroNum)}</tspan>${heroSuf ? `<tspan font-size="60" dx="11" dy="-54" letter-spacing="-1">${esc(heroSuf)}</tspan>` : ''}</text>

  ${card.trades ? `<text x="${M}" y="414" fill="#75757f" font-family="${SANS}" font-size="12"
        font-weight="700" letter-spacing="3.2">OVER ${card.trades} TRADES</text>` : ''}

  <!-- ═══ крива ═══ -->
  ${card.curve.length > 1 ? `
  <g>
    <path d="${path} L${cx + cwid},${cy + chgt} L${cx},${cy + chgt} Z" fill="url(#fill${u})"/>
    <path d="${path}" fill="none" stroke="${accent}" stroke-width="2.6"
          stroke-linejoin="round" stroke-linecap="round"/>
    ${last ? `
    <line x1="${last.x.toFixed(1)}" y1="${(last.y + 8).toFixed(1)}" x2="${last.x.toFixed(1)}" y2="${cy + chgt}"
          stroke="${accent}" stroke-opacity="0.28" stroke-width="1" stroke-dasharray="2 4"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="12" fill="${accent}" fill-opacity="0.16"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="5" fill="#ffffff"/>` : ''}
  </g>` : ''}

  <!-- ═══ метрики ═══ -->
  <line x1="${M}" y1="472" x2="${W - M}" y2="472" stroke="#ffffff" stroke-opacity="0.07"/>
  ${cells}

  <!-- ═══ підвал ═══ -->
  <line x1="${M}" y1="${footY}" x2="${W - M}" y2="${footY}" stroke="#ffffff" stroke-opacity="0.06"/>

  <text x="${M}" y="${footY + 34}" fill="#55555f" font-family="${BRAND}" font-size="11"
        font-weight="700" letter-spacing="3.2">EDGE JOURNAL</text>

  <text x="${W - M}" y="${footY + 34}" fill="#55555f" font-family="${SANS}" font-size="11.5"
        font-weight="600" letter-spacing="1.6" text-anchor="end">№ ${code} · ${stamp}</text>
</svg>`;
}

/* ---------- шрифти всередині картинки ----------
   SVG, намальований у canvas, живе у власному світі: підключені
   сторінкою шрифти туди не потрапляють, і логотип у PNG виїхав би
   системним Arial. Тому перед експортом забираємо самі файли шрифтів
   і вшиваємо їх у розмітку через base64. Результат кешуємо — це
   потрібно один раз за сеанс. */
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;700;800&display=swap',
];

let fontCssCache = null;

async function toDataUri(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return `data:font/woff2;base64,${btoa(bin)}`;
}

export async function brandFontCss() {
  if (fontCssCache !== null) return fontCssCache;

  try {
    const parts = await Promise.all(FONT_URLS.map(async (href) => {
      const css = await (await fetch(href)).text();
      const faces = css.match(/@font-face\s*{[^}]+}/g) || [];

      /* Латиниця й кирилиця — усе, що трапляється на картці.
         Решта підмножин (грецька, вʼєтнамська) лише роздували б файл. */
      const need = faces.filter((f) => /U\+0000|U\+0301/.test(f));

      const out = await Promise.all(need.map(async (face) => {
        const m = face.match(/url\((https:\/\/[^)]+\.woff2)\)/);
        if (!m) return '';
        try {
          const uri = await toDataUri(m[1]);
          return face.replace(m[1], uri);
        } catch { return ''; }
      }));

      return out.join('\n');
    }));

    fontCssCache = parts.join('\n');
  } catch {
    /* без інтернету картинка просто вийде системним шрифтом —
       це краще, ніж зламаний експорт */
    fontCssCache = '';
  }

  return fontCssCache;
}

/* ---------- SVG → PNG ----------
   Без зовнішніх бібліотек: малюємо svg у canvas і забираємо dataURL.
   Множник 2 дає картинку, яку не соромно вставити в твіт. */
export async function svgToPng(svg, scale = 2) {
  const css = await brandFontCss();
  const withFonts = css
    ? svg.replace('<defs>', `<defs><style type="text/css">${css}</style>`)
    : svg;

  return new Promise((resolve, reject) => {
    const blob = new Blob([withFonts], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200 * scale;
      canvas.height = 675 * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
    img.src = url;
  });
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- зліпок у базі ---------- */

export async function saveCard(userId, card) {
  const { data, error } = await supabase
    .from('stat_cards')
    .insert([{ user_id: userId, data: card, is_public: true }])
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function loadPublicCard(id) {
  const { data, error } = await supabase
    .from('stat_cards')
    .select('id, data, created_at')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw error;
  return data?.data || null;
}
