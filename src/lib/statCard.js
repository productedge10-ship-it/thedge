import { supabase } from './supabase';
import { EDGE_LOGO } from './edgeLogo';

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
    /* Рядок під головним числом: скільки угод і за який відрізок.
       Рахуємо тут, щоб і PNG, і публічна сторінка бачили те саме. */
    sub: [
      `${stats.trades?.length || 0} closed trades`,
      stats.months ? `${stats.months} months in journal` : '',
    ].filter(Boolean).join(' · '),
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

const MONO = "'SF Mono', ui-monospace, Menlo, Consolas, monospace";

/* Кольори значень у підвалі.

   Беремо холодну трійцю з макета й ідемо по колу — так рядок цифр
   читається як одна композиція, а не як світлофор. Але поганий
   результат мусить лишатись поганим: збиток і попередження свій
   колір зберігають, інакше картка бреше. */
const CELL_TONES = [
  ['#5eead4', '#2dd4bf'],
  ['#7dd3fc', '#38bdf8'],
  ['#c4b5fd', '#8b5cf6'],
  ['#ffffff', '#ffffff'],
];
const HARD_TONES = { bad: ['#fb7185', '#f43f5e'], warn: ['#fbbf24', '#f59e0b'] };

/* Значення на картці приходять одним рядком: «71%», «1.62R»,
   «5.86». У макеті число й одиниця набрані по-різному, тому
   розділяємо їх тут, а не змушуємо кожну метрику знати про верстку. */
const splitUnit = (raw) => {
  const m = String(raw).match(/^(.*?)([%R]|R\b)?$/);
  const value = m ? m[1] : String(raw);
  const unit = m && m[2] ? m[2] : '';
  return { value: value || String(raw), unit };
};

export function renderCardSvg(card) {
  /* 1600×900 — формат ширококадрового постера з макета. Ті самі
     16:9, що й раніше, тільки вдвічі більший запас на дрібний текст:
     у стрічці картку тиснуть до 600px завширшки, і на 1200 підписи
     розсипались у кашу. */
  const W = 1600;
  const H = 900;
  const LEFT = 452;

  /* Ідентифікатори градієнтів мають бути унікальні: два прев'ю в
     одному документі інакше перетягнули б defs одне в одного. */
  const u = Math.random().toString(36).slice(2, 8);

  const hero = splitHero(card.hero.value);
  /* До восьми показників — рівно стільки, скільки можна вибрати в
     застосунку. Понад чотири вони їдуть другим рядом, а крива
     стискається: віддати їй ту саму висоту означало б або підняти
     цифри на неї, або обрізати нижній ряд. */
  const items = card.metrics.slice(0, 8);
  const metricRows = items.length > 4 ? 2 : 1;

  /* Геометрія підвалу залежить від кількості рядів, тому рахуємо її
     один раз тут, а не розкидаємо магічні числа по розмітці. */
  const chartY = 356;
  const chartH = metricRows > 1 ? 200 : 280;
  const footY = metricRows > 1 ? 600 : 712;
  const rowY = (r) => (metricRows > 1 ? [652, 772][r] : 760);
  const valueSize = metricRows > 1 ? 38 : 44;

  /* ---------- крива ----------
     Своя система координат 1032×280, як у макеті: так шлях лишається
     читабельним, а масштабування бере на себе viewBox. */
  const CW = 1032;
  const CH = 280;
  const top = 26;
  const base = 244;

  const curve = card.curve.length > 1 ? card.curve : [];
  const path = (() => {
    if (!curve.length) return '';
    const min = Math.min(0, ...curve);
    const max = Math.max(0, ...curve);
    const span = max - min || 1;
    /* Останню точку не доводимо до самого краю: там стоїть маркер
       радіусом 17, і вкладений svg зрізав би йому половину. */
    const step = curve.length > 1 ? (CW - 22) / (curve.length - 1) : CW;
    return curve.map((v, i) => {
      const x = i * step;
      const y = base - ((v - min) / span) * (base - top);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  })();

  const lastY = (() => {
    if (!curve.length) return base;
    const min = Math.min(0, ...curve);
    const max = Math.max(0, ...curve);
    const span = max - min || 1;
    return base - ((curve[curve.length - 1] - min) / span) * (base - top);
  })();

  const cells = items.map((m, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cellX = LEFT + 64 + col * ((W - LEFT - 128) / 4);
    const labelY = rowY(row);
    const { value, unit } = splitUnit(m.value);
    const tone = HARD_TONES[m.tone] || CELL_TONES[i % CELL_TONES.length];

    const sep = col ? `<line x1="${(cellX - 26).toFixed(1)}" y1="${labelY - 12}" x2="${(cellX - 26).toFixed(1)}" y2="${labelY + 66}"
          stroke="#ffffff" stroke-opacity="0.07"/>` : '';

    return `${sep}
    <text x="${cellX.toFixed(1)}" y="${labelY}" fill="#8b8fb0" font-family="${MONO}" font-size="11"
          font-weight="700" letter-spacing="3">${esc(m.label.toUpperCase())}</text>
    <g filter="url(#cell${i % 4}${u})">
      <text x="${cellX.toFixed(1)}" y="${labelY + 52}" font-family="${BRAND}" font-weight="700" letter-spacing="-2">
        <tspan fill="${tone[0]}" font-size="${valueSize}">${esc(value)}</tspan>${unit ? `<tspan fill="#5b5f7d" font-size="${Math.round(valueSize * 0.45)}" font-weight="600" letter-spacing="-0.4" dx="5">${esc(unit)}</tspan>` : ''}
      </text>
    </g>`;
  }).join('');

  const code = serial(card.createdAt);
  const stamp = new Date(card.createdAt)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Ліва панель: одна велика радіальна розтяжка від фіолетового
         до бірюзового. Вона ж і є впізнаваним обличчям картки. -->
    <radialGradient id="side${u}" cx="0.2" cy="0.1" r="1.3">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="26%" stop-color="#7c3aed"/>
      <stop offset="52%" stop-color="#4338ca"/>
      <stop offset="82%" stop-color="#0e7490"/>
      <stop offset="100%" stop-color="#0f766e"/>
    </radialGradient>
    <radialGradient id="sideGlow${u}" cx="0.78" cy="0.92" r="0.7">
      <stop offset="0%" stop-color="#5eead4" stop-opacity="0.5"/>
      <stop offset="62%" stop-color="#5eead4" stop-opacity="0"/>
    </radialGradient>

    <radialGradient id="glowA${u}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.34"/>
      <stop offset="45%" stop-color="#3730a3" stop-opacity="0.16"/>
      <stop offset="74%" stop-color="#3730a3" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB${u}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.2"/>
      <stop offset="46%" stop-color="#1e3a8a" stop-opacity="0.1"/>
      <stop offset="74%" stop-color="#1e3a8a" stop-opacity="0"/>
    </radialGradient>

    <pattern id="dotsL${u}" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.8" fill="#ffffff" fill-opacity="0.05"/>
    </pattern>
    <pattern id="dotsR${u}" width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.7" fill="#ffffff" fill-opacity="0.028"/>
    </pattern>

    <!-- Головне число заливається градієнтом, а не кольором: одна
         цифра на пів картки суцільним білим виглядає як заголовок
         документа, а не як результат. -->
    <linearGradient id="hero${u}" x1="0.1" y1="0" x2="0.75" y2="1">
      <stop offset="6%" stop-color="#ffffff"/>
      <stop offset="34%" stop-color="#c4b5fd"/>
      <stop offset="66%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#5eead4"/>
    </linearGradient>
    <filter id="heroGlow${u}" x="-30%" y="-40%" width="160%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="34" flood-color="#7c3aed" flood-opacity="0.7"/>
    </filter>

    <linearGradient id="curveFill${u}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.4"/>
      <stop offset="52%" stop-color="#6d54f0" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="curveLine${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a855f7"/>
      <stop offset="42%" stop-color="#6d8bf5"/>
      <stop offset="76%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#99f6e4"/>
    </linearGradient>

    <linearGradient id="footLine${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.3"/>
      <stop offset="26%" stop-color="#2b2b42"/>
      <stop offset="84%" stop-color="#2b2b42"/>
      <stop offset="100%" stop-color="#2b2b42" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="subLine${u}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2b2b42"/>
      <stop offset="100%" stop-color="#2b2b42" stop-opacity="0"/>
    </linearGradient>

    ${CELL_TONES.map((t, i) => `<filter id="cell${i}${u}" x="-40%" y="-60%" width="180%" height="240%">
      <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="${t[1]}" flood-opacity="0.35"/>
    </filter>`).join('')}

    <filter id="discBlur${u}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="34"/>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="#07070f"/>

  <!-- ═══════════ ліва панель ═══════════ -->
  <g>
    <rect width="${LEFT}" height="${H}" fill="url(#side${u})"/>
    <rect width="${LEFT}" height="${H}" fill="url(#sideGlow${u})"/>
    <rect width="${LEFT}" height="${H}" fill="url(#dotsL${u})"/>
    <rect width="${LEFT}" height="1" fill="#ffffff" fill-opacity="0.27"/>
    <rect x="${LEFT - 1}" width="1" height="${H}" fill="#ffffff" fill-opacity="0.18"/>

    <!-- знак у двох кільцях: суцільному й пунктирному -->
    <g transform="translate(52,60)">
      <circle cx="100" cy="100" r="95" fill="#0b0b18" fill-opacity="0.55" filter="url(#discBlur${u})"/>
      <circle cx="100" cy="100" r="100" fill="none" stroke="#ffffff" stroke-opacity="0.24"/>
      <circle cx="100" cy="100" r="126" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-dasharray="6 8"/>
      <image href="${EDGE_LOGO}" x="7" y="7" width="186" height="186" preserveAspectRatio="xMidYMid meet"/>
    </g>

    <!-- період, підпис і номер — унизу, як вихідні дані документа -->
    <g transform="translate(52,${H - 56})">
      <rect x="0" y="-186" width="${(String(card.period).length * 11.4 + 56).toFixed(0)}" height="40" rx="20"
            fill="#0b0b18" fill-opacity="0.35" stroke="#ffffff" stroke-opacity="0.25"/>
      <circle cx="26" cy="-166" r="3" fill="#ffffff"/>
      <text x="42" y="-161" fill="#ffffff" font-family="${MONO}" font-size="11.5"
            font-weight="700" letter-spacing="3.4">${esc(String(card.period).toUpperCase())}</text>

      <text x="0" y="-88" fill="#ffffff" font-family="${BRAND}" font-size="34"
            font-weight="700" letter-spacing="-1">${esc(card.author ? `@${card.author.replace(/^@/, '')}` : '@theedge')}</text>
      <text x="0" y="-52" fill="#ffffff" fill-opacity="0.66" font-family="${MONO}" font-size="12"
            font-weight="700" letter-spacing="3.2">№ ${code} · ${stamp}</text>
    </g>
  </g>

  <!-- ═══════════ права частина ═══════════ -->
  <g>
    <ellipse cx="${LEFT + 160}" cy="170" rx="380" ry="330" fill="url(#glowA${u})"/>
    <ellipse cx="${W - 160}" cy="430" rx="350" ry="310" fill="url(#glowB${u})"/>
    <rect x="${LEFT}" width="${W - LEFT}" height="${H}" fill="url(#dotsR${u})"/>

    <text x="${LEFT + 64}" y="72" fill="#8b8fb0" font-family="${MONO}" font-size="12.5"
          font-weight="700" letter-spacing="6">${esc(card.title.toUpperCase())}</text>

    <!-- головне число: знак і одиниця дрібніші за саме число -->
    <g filter="url(#heroGlow${u})">
      <text x="${LEFT + 58}" y="268" fill="url(#hero${u})" font-family="${BRAND}" font-weight="700" letter-spacing="-9">
        <tspan font-size="158">${esc(hero.sign)}</tspan><tspan font-size="204">${esc(hero.value)}</tspan><tspan font-size="158">R</tspan>
      </text>
    </g>

    <text x="${LEFT + 64}" y="322" fill="#a5a8c4" font-family="${SANS}" font-size="15.5"
          letter-spacing="0.3">${esc(card.sub || `${card.trades} closed trades`)}</text>
    <rect x="${LEFT + 64 + (String(card.sub || `${card.trades} closed trades`).length * 7.6) + 16}" y="316"
          width="${Math.max(40, W - LEFT - 128 - (String(card.sub || `${card.trades} closed trades`).length * 7.6) - 16).toFixed(0)}"
          height="1" fill="url(#subLine${u})"/>

    ${curve.length ? `
    <svg x="${LEFT + 64}" y="${chartY}" width="${W - LEFT - 128}" height="${chartH}" viewBox="0 0 ${CW} ${CH}" preserveAspectRatio="none">
      <path d="M0 ${base} H${CW}" stroke="#ffffff" stroke-width="1" opacity="0.08" vector-effect="non-scaling-stroke"/>
      <path d="M0 170 H${CW}" stroke="#ffffff" stroke-width="1" opacity="0.05" stroke-dasharray="3 9" vector-effect="non-scaling-stroke"/>
      <path d="M0 96 H${CW}" stroke="#ffffff" stroke-width="1" opacity="0.05" stroke-dasharray="3 9" vector-effect="non-scaling-stroke"/>

      <path d="${path} L${CW - 22} ${CH} L0 ${CH} Z" fill="url(#curveFill${u})"/>
      <path d="${path}" fill="none" stroke="url(#curveLine${u})" stroke-width="11"
            stroke-linejoin="round" stroke-linecap="round" opacity="0.2" vector-effect="non-scaling-stroke"/>
      <path d="${path}" fill="none" stroke="url(#curveLine${u})" stroke-width="4.8"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <path d="M${CW - 22} ${lastY.toFixed(1)} V${base}" stroke="#99f6e4" stroke-width="1"
            stroke-dasharray="4 7" opacity="0.42" vector-effect="non-scaling-stroke"/>
      <circle cx="${CW - 22}" cy="${lastY.toFixed(1)}" r="17" fill="#99f6e4" opacity="0.14"/>
      <circle cx="${CW - 22}" cy="${lastY.toFixed(1)}" r="6.5" fill="#0a0a14" stroke="#b7fce8"
              stroke-width="3" vector-effect="non-scaling-stroke"/>
    </svg>` : ''}

    <rect x="${LEFT + 64}" y="${footY}" width="${W - LEFT - 128}" height="1" fill="url(#footLine${u})"/>
    ${cells}
  </g>
</svg>`;
}

/* Головне число приходить рядком «+24.8R». Розбираємо його на знак,
   саме число й одиницю: у макеті вони набрані трьома різними
   кеглями, і склеєним рядком цього не зробити. */
function splitHero(raw) {
  const m = String(raw).match(/^([+−-]?)([\d.,]+)/);
  if (!m) return { sign: '', value: String(raw) };
  return { sign: m[1] === '-' ? '−' : m[1], value: m[2] };
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
  /* Розмір беремо з самої розмітки, а не з константи: картка вже
     двічі змінювала формат, і кожного разу PNG виходив обрізаним,
     бо полотно лишалось старим. */
  const box = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  const CW = box ? Number(box[1]) : 1600;
  const CH = box ? Number(box[2]) : 900;

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
      canvas.width = CW * scale;
      canvas.height = CH * scale;
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
