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

const P = {
  bg:      '#0A0A0C',
  line:    '#26262c',
  text:    '#FAFAFA',
  text2:   '#B4B4BD',
  text3:   '#7A7A85',
  text4:   '#4A4A52',
  acc:     '#8b7bff',
  ok:      '#34d399',
  bad:     '#f87171',
  warn:    '#fbbf24',
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

/* ---------- фірмовий знак ----------
   Кіт скопійований з монограми в меню один в один: ті самі криві
   вушок, та сама голова, вуса, очниці, очі, ніс і рот у спокої.
   Прибрано тільки те, що в статичній картинці не має сенсу —
   анімації, лизання, сумний режим. Знак їде в чужу стрічку, і
   людина має впізнати його з першого погляду. */
function catMark(x, y, size, u) {
  const k = size / 34;
  return `<g transform="translate(${x},${y}) scale(${k})">
    <path d="M 7.5 13 C 5 8 5 4 7 3.5 C 9 3 12 7 14 9.5" fill="url(#ear${u})"
          stroke="#C4B5FD" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M 26.5 13 C 29 8 29 4 27 3.5 C 25 3 22 7 20 9.5" fill="url(#ear${u})"
          stroke="#C4B5FD" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 29C8 29 5 24 5 16C5 10 9 7 17 7C25 7 29 10 29 16C29 24 26 29 17 29Z"
          fill="url(#head${u})" stroke="#C4B5FD" stroke-width="1.5"/>
    <path d="M2 18L6 19M2 21L6 20.5" stroke="rgba(255,255,255,0.6)" stroke-width="1" stroke-linecap="round"/>
    <path d="M32 18L28 19M32 21L28 20.5" stroke="rgba(255,255,255,0.6)" stroke-width="1" stroke-linecap="round"/>
    <ellipse cx="11" cy="17" rx="4.5" ry="3.5" fill="#050608"/>
    <ellipse cx="23" cy="17" rx="4.5" ry="3.5" fill="#050608"/>
    <g filter="url(#eyes${u})">
      <ellipse cx="11" cy="17" rx="3.5" ry="2.8" fill="#00E0A4"/>
      <ellipse cx="23" cy="17" rx="3.5" ry="2.8" fill="#00E0A4"/>
    </g>
    <ellipse cx="11" cy="17" rx="0.8" ry="2.2" fill="#000"/>
    <circle cx="12" cy="16" r="0.8" fill="#fff"/>
    <ellipse cx="23" cy="17" rx="0.8" ry="2.2" fill="#000"/>
    <circle cx="24" cy="16" r="0.8" fill="#fff"/>
    <path d="M16.5 22L17 22.8L17.5 22Z" fill="#C4B5FD" stroke="#C4B5FD"
          stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M15 24.5C15 25 16 25.5 17 24.5C18 25.5 19 25 19 24.5" fill="none"
          stroke="rgba(255,255,255,0.7)" stroke-width="1.2" stroke-linecap="round"/>
  </g>`;
}

/* Плашка навколо кота — та сама, що в меню: 52×52, скруглення 15,
   діагональний градієнт від фіолетового до майже чорного. */
function logoBadge(x, y, u) {
  return `<g>
    <rect x="${x}" y="${y}" width="52" height="52" rx="15" fill="url(#badge${u})"
          stroke="rgba(139,123,255,0.45)"/>
    <rect x="${x + 0.5}" y="${y + 0.5}" width="51" height="20" rx="14.5"
          fill="#ffffff" fill-opacity="0.05"/>
    ${catMark(x + 8, y + 8, 36, u)}
  </g>`;
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
  const M = 80;
  const up = card.hero.up;
  const accent = up ? P.ok : P.bad;

  /* Картка живе на сторінці інлайном, а не картинкою — інакше не
     підхопився б фірмовий шрифт. Тому ідентифікатори градієнтів
     мають бути унікальні: два прев'ю в одному документі інакше
     перетягнули б defs одне в одного. */
  const u = Math.random().toString(36).slice(2, 8);

  /* ---------- сітка метрик ----------
     Комірки розділені вертикальними волосинами, а не підкреслені
     зверху. Горизонтальні риски різали композицію на смуги й
     робили з постера таблицю; вертикальні тримають рядок цілим. */
  const items = card.metrics.slice(0, 8);
  const cols = Math.min(4, Math.max(1, items.length));
  const rows = Math.ceil(items.length / cols);
  const gw = W - M * 2;
  const cw = gw / cols;
  const gy = rows > 1 ? 424 : 486;
  const rh = 92;

  const cells = items.map((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * cw + (col ? 26 : 0);
    const y = gy + row * rh;
    const sep = col
      ? `<line x1="${(M + col * cw).toFixed(1)}" y1="${y - 22}" x2="${(M + col * cw).toFixed(1)}" y2="${y + 52}"
               stroke="#ffffff" stroke-opacity="0.07"/>`
      : '';

    return `${sep}
      <text x="${x}" y="${y}" fill="#5e5e6b" font-family="${SANS}"
            font-size="11.5" font-weight="700" letter-spacing="2.4">${esc(m.label.toUpperCase())}</text>
      <text x="${x}" y="${y + 36}" fill="${toneColor(m.tone)}" font-family="${BRAND}"
            font-size="31" font-weight="700" letter-spacing="-1">${esc(m.value)}</text>
      <text x="${x}" y="${y + 57}" fill="#4a4a55" font-family="${SANS}"
            font-size="12.5">${esc(m.sub || m.hint)}</text>`;
  }).join('');

  /* ---------- крива ----------
     Без рамки, підпису осей і сітки. Це не графік для читання цифр,
     а силует результату — він має підпирати головне число, а не
     змагатися з ним за увагу. */
  const cx = 636;
  const cy = 176;
  const cwid = W - M - cx;
  const chgt = 168;
  const path = curvePath(card.curve, cx, cy, cwid, chgt);

  const last = (() => {
    if (card.curve.length < 2) return null;
    const min = Math.min(0, ...card.curve);
    const max = Math.max(0, ...card.curve);
    const span = max - min || 1;
    const v = card.curve[card.curve.length - 1];
    return { x: cx + cwid, y: cy + chgt - ((v - min) / span) * chgt };
  })();

  const footY = gy + rows * rh + 14;
  const code = serial(card.createdAt);
  const stamp = new Date(card.createdAt)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg${u}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#111119"/>
      <stop offset="55%" stop-color="#0A0A0E"/>
      <stop offset="100%" stop-color="#070709"/>
    </linearGradient>

    <!-- Смуга згори: один точний штрих замість рамок і куточків -->
    <linearGradient id="bar${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${P.acc}"/>
      <stop offset="42%" stop-color="${accent}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>

    <radialGradient id="glowA${u}" cx="8%" cy="0%" r="55%">
      <stop offset="0%" stop-color="${P.acc}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${P.acc}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB${u}" cx="88%" cy="14%" r="48%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig${u}" cx="50%" cy="46%" r="72%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
    </radialGradient>

    <!-- Захисне тло: вертикальні волосини, як на банкноті -->
    <pattern id="guard${u}" width="7" height="7" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="7" fill="#ffffff" fill-opacity="0.016"/>
    </pattern>

    <linearGradient id="head${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4A4E69"/>
      <stop offset="50%" stop-color="#2A2D40"/>
      <stop offset="100%" stop-color="#12131A"/>
    </linearGradient>
    <linearGradient id="ear${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C4B5FD"/>
      <stop offset="100%" stop-color="#2A2D40"/>
    </linearGradient>
    <linearGradient id="badge${u}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8b7bff" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#0a0b0f" stop-opacity="0.95"/>
    </linearGradient>

    <linearGradient id="fill${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </linearGradient>

    <filter id="eyes${u}" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="1.6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg${u})"/>
  <rect width="${W}" height="${H}" fill="url(#guard${u})"/>
  <rect width="${W}" height="${H}" fill="url(#glowA${u})"/>
  <rect width="${W}" height="${H}" fill="url(#glowB${u})"/>
  <rect width="${W}" height="${H}" fill="url(#vig${u})"/>
  <rect x="0" y="0" width="${W}" height="3" fill="url(#bar${u})"/>

  <!-- ═══ шапка ═══ -->
  ${logoBadge(M, 58, u)}
  <text x="${M + 68}" y="82" fill="#f4f5f8" font-family="${BRAND}" font-size="16"
        font-weight="800" letter-spacing="4.4">THE EDGE</text>
  ${card.author ? `<text x="${M + 70}" y="101" fill="#5a5a66" font-family="${SANS}"
        font-size="11.5" letter-spacing="2">BY ${esc(card.author.toUpperCase())}</text>` : ''}

  <rect x="${W - M - 168}" y="70" width="168" height="30" rx="15" fill="none"
        stroke="#ffffff" stroke-opacity="0.14"/>
  <text x="${W - M - 84}" y="90" fill="#9a9aa6" font-family="${SANS}" font-size="12"
        font-weight="700" letter-spacing="2.2" text-anchor="middle">${esc(card.period.toUpperCase())}</text>

  <line x1="${M}" y1="140" x2="${W - M}" y2="140" stroke="#ffffff" stroke-opacity="0.07"/>
  <rect x="${M}" y="139" width="56" height="2" fill="${P.acc}"/>

  <!-- ═══ головне число ═══ -->
  <text x="${M}" y="196" fill="#6c6c79" font-family="${SANS}" font-size="12"
        font-weight="700" letter-spacing="3.6">${esc(card.title.toUpperCase())}</text>

  <text x="${M - 6}" y="316" fill="${accent}" font-family="${BRAND}"
        font-size="136" font-weight="700" letter-spacing="-6">${esc(card.hero.value)}</text>

  <text x="${M}" y="352" fill="#6c6c79" font-family="${SANS}" font-size="14.5" letter-spacing="0.3">
    cumulative R${card.trades ? ` · ${card.trades} trades` : ''}
  </text>

  <!-- ═══ крива ═══ -->
  ${card.curve.length > 1 ? `
  <g>
    <path d="${path} L${cx + cwid},${cy + chgt} L${cx},${cy + chgt} Z" fill="url(#fill${u})"/>
    <path d="${path}" fill="none" stroke="${accent}" stroke-width="2"
          stroke-linejoin="round" stroke-linecap="round"/>
    ${last ? `
    <line x1="${last.x.toFixed(1)}" y1="${(last.y + 6).toFixed(1)}" x2="${last.x.toFixed(1)}" y2="${cy + chgt}"
          stroke="${accent}" stroke-opacity="0.35" stroke-width="1" stroke-dasharray="2 4"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4" fill="${accent}"/>
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="9" fill="none"
            stroke="${accent}" stroke-opacity="0.3"/>` : ''}
    <text x="${cx}" y="${cy + chgt + 22}" fill="#43434e" font-family="${SANS}"
          font-size="10.5" font-weight="700" letter-spacing="3.4">EQUITY CURVE</text>
  </g>` : ''}

  <!-- ═══ метрики ═══ -->
  ${cells}

  <!-- ═══ підвал ═══ -->
  <line x1="${M}" y1="${footY}" x2="${W - M}" y2="${footY}" stroke="#ffffff" stroke-opacity="0.06"/>

  <text x="${M}" y="${footY + 34}" fill="#4d4d58" font-family="${BRAND}" font-size="11"
        font-weight="700" letter-spacing="3.2">EDGE JOURNAL</text>

  <text x="${W - M}" y="${footY + 34}" fill="#4d4d58" font-family="${SANS}" font-size="11.5"
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
