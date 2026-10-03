/* ==================================================================
   Документ торгової системи.

   Модель навмисно проста: плаский словник сторінок із parentId —
   з нього легко зібрати дерево будь-якої глибини, легко переносити
   гілки й так само легко буде покласти в базу (одна таблиця).

   Сторінка = { id, parentId, title, icon, cover, blocks[], order }
   Блок     = { id, type, ...дані типу }
================================================================== */

/* v2 — інша структура: не дерево сторінок, а плоский набір розділів
   з готовим наповненням. Ключ змінено, щоб старий документ не
   вантажився в нову оболонку напівпорожнім. */
import { t as tx } from './lang';

export const STORAGE_KEY = 'edge_system_doc_v2';

/* Відтінок розділу. Той самий набір, що на стартовій сторінці —
   розділ упізнається за кольором, а не тільки за іконкою. */
export const HUES = {
  ice:    '110,168,254',
  mint:   '79,209,197',
  violet: '167,139,250',
  amber:  '251,191,36',
  rose:   '251,113,133',
  lime:   '163,230,53',
  sky:    '56,189,248',
  peach:  '251,146,60',
};

export const BLOCK_TYPES = {
  h1:       { label: tx('Заголовок 1', 'Heading 1'),   hint: tx('Великий розділ', 'Big section') },
  h2:       { label: tx('Заголовок 2', 'Heading 2'),   hint: tx('Підрозділ', 'Subsection') },
  h3:       { label: tx('Заголовок 3', 'Heading 3'),   hint: tx('Дрібний підзаголовок', 'Small subheading') },
  text:     { label: tx('Текст', 'Text'),         hint: tx('Звичайний абзац', 'Plain paragraph') },
  bullet:   { label: tx('Список', 'Bulleted list'),        hint: tx('Крапки', 'Bullet points') },
  number:   { label: tx('Нумерований', 'Numbered list'),   hint: '1, 2, 3…' },
  todo:     { label: tx('Чекліст', 'Checklist'),       hint: tx('Пункти з галочками', 'Items with checkboxes') },
  toggle:   { label: tx('Згортання', 'Toggle'),     hint: tx('Ховає деталі під заголовком', 'Hides details under a heading') },
  callout:  { label: tx('Виноска', 'Callout'),       hint: tx('Виділити правило чи попередження', 'Highlight a rule or a warning') },
  quote:    { label: tx('Цитата', 'Quote'),        hint: tx('Думка або витяг', 'A thought or an excerpt') },
  image:    { label: tx('Картинка', 'Image'),      hint: tx('Скрін графіка', 'Chart screenshot') },
  table:    { label: tx('Таблиця', 'Table'),       hint: tx('Сесії, пари, умови', 'Sessions, pairs, conditions') },
  divider:  { label: tx('Розділювач', 'Divider'),    hint: tx('Лінія між частинами', 'A line between parts') },
};

export const CALLOUT_TONES = ['acc', 'ok', 'warn', 'bad'];

export const uid = (p = 'b') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const emptyBlock = (type = 'text', extra = {}) => {
  const base = { id: uid('b'), type, text: '' };
  if (type === 'todo') base.checked = false;
  if (type === 'toggle') { base.open = true; base.children = [{ id: uid('b'), type: 'text', text: '' }]; }
  if (type === 'callout') base.tone = 'acc';
  if (type === 'image') { base.src = ''; base.caption = ''; base.width = 100; }
  if (type === 'table') {
    base.rows = [
      [tx('Сесія', 'Session'), tx('Пара', 'Pair'), tx('Умова', 'Condition')],
      ['London', 'EURUSD', tx('Свіп азійського мінімуму', 'Asian low sweep')],
      ['New York', 'XAUUSD', tx('Реакція на новину', 'News reaction')],
    ];
  }
  return { ...base, ...extra };
};

export const newPage = (parentId = null, title = tx('Новий розділ', 'New section')) => ({
  id: uid('p'),
  parentId,
  title,
  icon: '📄',
  hint: '',
  hue: 'violet',
  cover: '',
  blocks: [emptyBlock('text')],
  updatedAt: Date.now(),
});

/* ---------- демо-скріни ---------- */

/* Малюємо приклад графіка прямо в SVG: жодних зовнішніх файлів,
   працює офлайн і одразу видно, що блок картинки живий. */
export function chartSvg({ up = true, label = '', mark = '' } = {}) {
  const W = 960, H = 420, pad = 28;
  const n = 44;
  let seed = up ? 7 : 13;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  let price = up ? 120 : 300;
  const candles = [];
  for (let i = 0; i < n; i++) {
    const drift = (up ? -1 : 1) * (rnd() * 4 + 1.4);
    const noise = (rnd() - 0.5) * 26;
    const open = price;
    price = Math.max(60, Math.min(360, price + drift + noise));
    const close = price;
    const high = Math.min(370, Math.max(open, close) + rnd() * 16);
    const low = Math.max(50, Math.min(open, close) - rnd() * 16);
    candles.push({ open, close, high, low });
  }

  const step = (W - pad * 2) / n;
  const bodyW = step * 0.55;
  const green = '#34d399';
  const red = '#f87171';

  const grid = Array.from({ length: 5 }, (_, i) => {
    const y = pad + ((H - pad * 2) / 4) * i;
    return `<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#232328" stroke-width="1"/>`;
  }).join('');

  const bars = candles.map((c, i) => {
    const x = pad + i * step + step / 2;
    const bull = c.close <= c.open;           // ціна вгору = менший y
    const color = bull ? green : red;
    const top = Math.min(c.open, c.close);
    const h = Math.max(2, Math.abs(c.close - c.open));
    return `<line x1="${x}" y1="${c.high}" x2="${x}" y2="${c.low}" stroke="${color}" stroke-width="1.4" opacity="0.8"/>`
      + `<rect x="${x - bodyW / 2}" y="${top}" width="${bodyW}" height="${h}" rx="1.5" fill="${color}" opacity="0.9"/>`;
  }).join('');

  const zoneY = up ? 250 : 150;
  const zone = `<rect x="${pad}" y="${zoneY}" width="${W - pad * 2}" height="46" fill="rgba(139,123,255,0.12)" stroke="rgba(139,123,255,0.45)" stroke-dasharray="6 5"/>`
    + `<text x="${pad + 12}" y="${zoneY + 29}" font-family="Roboto,sans-serif" font-size="15" fill="#8b7bff">${mark || tx('зона входу', 'entry zone')}</text>`;

  const caption = label
    ? `<text x="${pad}" y="${H - 10}" font-family="Roboto,sans-serif" font-size="14" fill="#7A7A85">${label}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#0D0D10"/>
    ${grid}${zone}${bars}${caption}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ---------- шаблон ---------- */

const b = (type, text, extra = {}) => ({ ...emptyBlock(type), text, ...extra });
const tbl = (rows) => ({ ...emptyBlock('table'), rows });

/* ---------- заготовки для власного розділу ----------
   Людина створює свій розділ і одразу отримує кістяк, а не білий
   аркуш. Порожній старт — головна причина, чому описи систем
   лишаються недописаними. */
export const PRESETS = [
  {
    id: 'rules',
    label: tx('Правила', 'Rules'),
    hint: tx('Список того, що я роблю і чого не роблю', 'What I do and what I don’t'),
    build: () => [
      b('callout', tx('Правила, які не обговорюються в моменті. Змінювати можна тільки на холодну голову, поза сесією.', 'Rules that aren’t up for debate in the moment. Change them only with a cool head, outside the session.'), { tone: 'acc' }),
      b('h2', tx('Мої правила', 'My rules')),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', tx('Ціна порушення', 'The cost of breaking them')),
      b('text', tx('Що саме я втрачаю, коли порушую ці правила.', 'What exactly I lose when I break these rules.')),
    ],
  },
  {
    id: 'setup',
    label: tx('Сетап', 'Setup'),
    hint: tx('Умови входу, приклад на графіку, чого не робити', 'Entry conditions, a chart example, what not to do'),
    build: () => [
      b('h2', tx('Умови', 'Conditions')),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', tx('Приклад', 'Example')),
      { ...emptyBlock('image'), src: chartSvg({ up: true, mark: tx('зона входу', 'entry zone') }), caption: tx('Заміни на свій скрін', 'Replace with your own screenshot'), width: 100 },
      b('h2', tx('Чого не робити', 'What not to do')),
      b('callout', '', { tone: 'bad' }),
    ],
  },
  {
    id: 'table',
    label: tx('Таблиця', 'Table'),
    hint: tx('Порівняння: інструменти, сесії, умови', 'Comparison: instruments, sessions, conditions'),
    build: () => [
      b('text', tx('Коротко про те, що порівнюю в цій таблиці.', 'A quick note on what this table compares.')),
      tbl([[tx('Що', 'What'), tx('Умова', 'Condition'), tx('Нотатка', 'Note')], ['', '', ''], ['', '', '']]),
    ],
  },
  {
    id: 'blank',
    label: tx('З нуля', 'From scratch'),
    hint: tx('Чистий аркуш — сам вирішу структуру', 'Blank page — I’ll decide the structure'),
    build: () => [emptyBlock('text')],
  },
];

export const buildPreset = (id) =>
  (PRESETS.find((p) => p.id === id) || PRESETS[3]).build();

function buildTemplate() {
  const root = {
    ...newPage(null, tx('Моя торгова система', 'My trading system')),
    icon: '🎯',
    hint: tx('Те, чого я НЕ роблю у решту часу', 'What I DON’T do the rest of the time'),
    blocks: [],
  };

  const sec = (title, icon, hue, hint, blocks) => ({
    ...newPage(root.id, title),
    icon,
    hue,
    hint,
    blocks,
  });

  const pages = [
    root,

    /* ---------- 1. Інструменти ---------- */
    sec(tx('Інструменти', 'Instruments'), '📌', 'ice', tx('Що я торгую і, головне, чого не торгую', 'What I trade and, more importantly, what I don’t'), [
      b('callout', tx('Що менше інструментів, то глибше ти їх читаєш. Три пари, які ти знаєш напамʼять, кращі за двадцять, за якими просто стежиш.', 'The fewer instruments, the deeper you read them. Three pairs you know by heart beat twenty you just watch.'), { tone: 'acc' }),
      b('h2', tx('Основні', 'Core')),
      tbl([
        [tx('Інструмент', 'Instrument'), tx('Чому саме він', 'Why this one'), tx('Коли не торгую', 'When I don’t trade it')],
        ['', '', ''],
        ['', '', ''],
      ]),
      b('h2', tx('У спостереженні', 'On the watchlist')),
      b('text', tx('Те, що вивчаю, але ще не торгую живими грішми.', 'Things I’m studying but don’t trade with real money yet.')),
      b('bullet', ''),
      b('h2', tx('Чорний список', 'Blacklist')),
      b('callout', tx('Інструменти, на яких я системно втрачаю. Сюди пишу чесно — це найкорисніший список у всій системі.', 'Instruments I consistently lose on. Be honest here — it’s the most useful list in the whole system.'), { tone: 'bad' }),
      b('bullet', ''),
    ]),

    /* ---------- 2. Час ---------- */
    sec(tx('Час', 'Time'), '🕐', 'amber', tx('Коли я за терміналом, а коли мене там немає', 'When I’m at the terminal and when I’m not'), [
      b('callout', tx('Розклад — це не дисципліна заради дисципліни. Це спосіб не сідати за графік втомленим.', 'A schedule isn’t discipline for its own sake. It’s how you avoid sitting down at the chart tired.'), { tone: 'acc' }),
      b('h2', tx('Мої вікна', 'My windows')),
      tbl([
        [tx('Сесія', 'Session'), tx('Час (мій)', 'Time (mine)'), tx('Що я тут роблю', 'What I do here')],
        ['', '', ''],
        ['', '', ''],
      ]),
      b('h2', tx('Розпорядок торгового дня', 'Trading day routine')),
      b('todo', tx('Розмітка з вечора або за годину до відкриття', 'Mark up the chart the evening before or an hour before the open')),
      b('todo', tx('Діагностика стану перед сесією', 'Check my state before the session')),
      b('todo', tx('Торгівля тільки у своєму вікні', 'Trade only in my window')),
      b('todo', tx('Розбір угод одразу після сесії, поки памʼятаю', 'Review trades right after the session while it’s fresh')),
      b('h2', tx('Коли я не торгую', 'When I don’t trade')),
      b('bullet', tx('Спав менше шести годин', 'Slept less than six hours')),
      b('bullet', tx('День виходу ключових новин по моєму інструменту', 'Key news day for my instrument')),
      b('bullet', ''),
    ]),

    /* ---------- 3. TDA ---------- */
    sec(tx('Top-down аналіз', 'Top-down analysis'), '✍️', 'violet', tx('Як я приходжу до ідеї: від контексту до входу', 'How I get to an idea: from context to entry'), [
      b('callout', tx('Спершу контекст, потім зона, і тільки потім вхід. Якщо почав з молодшого таймфрейму — це вже не аналіз, а пошук виправдання.', 'Context first, then the zone, and only then the entry. If you start on the lower timeframe, that’s not analysis — it’s looking for an excuse.'), { tone: 'acc' }),
      b('h2', tx('Порядок таймфреймів', 'Timeframe order')),
      b('number', tx('1W / 1D — напрямок і глобальний контекст', '1W / 1D — direction and the big-picture context')),
      b('number', tx('4H / 1H — де лежить ліквідність і куди ціна по неї йде', '4H / 1H — where liquidity sits and where price is heading for it')),
      b('number', tx('15m — зона, від якої я готовий діяти', '15m — the zone I’m ready to act from')),
      b('number', tx('5m / 1m — підтвердження і вхід', '5m / 1m — confirmation and entry')),
      b('h2', tx('Що я шукаю на кожному кроці', 'What I look for at each step')),
      tbl([
        [tx('Таймфрейм', 'Timeframe'), tx('Питання', 'Question'), tx('Відповідь = дія', 'Answer = action')],
        ['1D', tx('Куди ринок хоче?', 'Where does the market want to go?'), ''],
        ['1H', tx('Де він набирає позицію?', 'Where is it building a position?'), ''],
        ['15m', tx('Де моя зона?', 'Where’s my zone?'), ''],
      ]),
      b('h2', tx('Приклад розмітки', 'Markup example')),
      { ...emptyBlock('image'), src: chartSvg({ up: true, mark: tx('зона, розмічена зранку', 'zone marked in the morning') }), caption: tx('Заміни на свій скрін: розмітка з вечора → реакція в зоні → вхід після підтвердження', 'Replace with your own screenshot: evening markup → reaction in the zone → entry after confirmation'), width: 100 },
      b('callout', tx('Якщо на старших таймфреймах ідеї немає — молодші її не створять.', 'If there’s no idea on the higher timeframes, the lower ones won’t create one.'), { tone: 'warn' }),
    ]),

    /* ---------- 4. Ризик ---------- */
    sec(tx('Ризик', 'Risk'), '💵', 'mint', tx('Цифри, які не обговорюються під час сесії', 'Numbers that aren’t up for debate during the session'), [
      b('callout', tx('Ці числа міняються тільки на холодну голову, поза ринком. Усередині сесії вони — закон.', 'These numbers only change with a cool head, away from the market. During the session they’re the law.'), { tone: 'bad' }),
      b('h2', tx('Мої цифри', 'My numbers')),
      tbl([
        [tx('Параметр', 'Parameter'), tx('Значення', 'Value')],
        [tx('Ризик на угоду', 'Risk per trade'), '1%'],
        [tx('Максимум угод на день', 'Max trades per day'), '2'],
        [tx('Денний стоп', 'Daily stop'), '−2%'],
        [tx('Тижневий стоп', 'Weekly stop'), '−5%'],
      ]),
      b('h2', tx('Правила', 'Rules')),
      b('todo', tx('Обсяг рахую до входу, а не «на око»', 'I calculate size before entry, not by eye')),
      b('todo', tx('Стоп ставлю одразу разом з ордером', 'I set the stop together with the order')),
      b('todo', tx('Після денного стопу термінал закрито до завтра', 'After the daily stop the terminal is closed until tomorrow')),
      b('todo', tx('Не додаю до збиткової позиції ніколи', 'I never add to a losing position')),
      b('h2', tx('Коли зменшую ризик удвічі', 'When I cut risk in half')),
      b('bullet', tx('Перші дні на новому рахунку', 'The first days on a new account')),
      b('bullet', tx('Після серії з трьох мінусів', 'After three losses in a row')),
      b('bullet', ''),
      b('quote', tx('Розмір позиції — це не про жадібність. Це про те, чи зможеш ти спокійно дивитись на просадку.', 'Position size isn’t about greed. It’s about whether you can calmly watch the drawdown.')),
    ]),

    /* ---------- 5. Особисті правила ---------- */
    sec(tx('Особисті правила', 'Personal rules'), '🛑', 'rose', tx('За кожне з них я вже заплатив', 'I’ve already paid for each of these'), [
      b('callout', tx('Тут не теорія з книжок, а правила, куплені власними грішми. Під кожним — конкретна історія.', 'Not theory from books — rules bought with my own money. Each one has a real story behind it.'), { tone: 'acc' }),
      b('h2', tx('Мої закони', 'My laws')),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', tx('Що я порушую найчастіше', 'What I break most often')),
      {
        ...emptyBlock('toggle'),
        text: tx('Ранній вхід', 'Early entry'),
        children: [
          b('text', tx('Заходжу до закриття свічки, бо «здається, вже пішло».', 'I enter before the candle closes because “it looks like it’s already going.”')),
          b('callout', tx('Правило: вхід тільки після закриття свічки на робочому таймфреймі.', 'Rule: enter only after the candle closes on the working timeframe.'), { tone: 'ok' }),
        ],
      },
      {
        ...emptyBlock('toggle'),
        text: tx('Відігравання після стопу', 'Revenge trading after a stop'),
        children: [
          b('text', tx('Одразу після мінуса відкриваю наступну угоду без сетапу.', 'Right after a loss I open the next trade without a setup.')),
          b('callout', tx('Правило: після стопу — тридцять хвилин без графіка.', 'Rule: after a stop — thirty minutes away from the chart.'), { tone: 'ok' }),
        ],
      },
    ]),

    /* ---------- 6. Проп ---------- */
    sec(tx('Проп-компанії', 'Prop firms'), '🥇', 'lime', tx('Умови рахунків і що я перевіряю перед купівлею', 'Account rules and what I check before buying'), [
      b('callout', tx('Проп — це не безкоштовні гроші, а екзамен з дисципліни. Умови важать більше, ніж розмір рахунку.', 'Prop isn’t free money, it’s a discipline exam. The rules matter more than the account size.'), { tone: 'acc' }),
      b('h2', tx('Мої рахунки', 'My accounts')),
      tbl([
        [tx('Компанія', 'Firm'), tx('Розмір', 'Size'), tx('Етап', 'Phase'), tx('Денний ліміт', 'Daily limit'), tx('Загальний ліміт', 'Overall limit')],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
      ]),
      b('h2', tx('Що перевіряю перед покупкою', 'What I check before buying')),
      b('todo', tx('Денна просадка: від балансу чи від еквіті', 'Daily drawdown: from balance or from equity')),
      b('todo', tx('Просадка статична чи трейлінг', 'Static or trailing drawdown')),
      b('todo', tx('Чи можна тримати позицію через новини й вихідні', 'Can I hold through news and weekends')),
      b('todo', tx('Реальні строки й відсоток виплат', 'Real payout timing and split')),
      b('todo', tx('Скільки я вже віддав цій компанії за спроби', 'How much I’ve already paid this firm for attempts')),
      b('h2', tx('Правила проп-рахунку', 'Prop account rules')),
      b('bullet', tx('Ризик на проп-рахунку менший, ніж на своєму', 'Risk on a prop account is lower than on my own')),
      b('bullet', ''),
    ]),

    /* ---------- 7. Нотатки ---------- */
    sec(tx('Нотатки', 'Notes'), '📍', 'peach', tx('Те, що ще не стало правилом', 'Things that aren’t rules yet'), [
      b('text', tx('Чернетка системи. Звідси ідеї або переїжджають у розділи вище, або відсіюються.', 'A draft of the system. Ideas from here either move into the sections above or get dropped.')),
      b('h2', tx('Спостереження', 'Observations')),
      b('bullet', ''),
      b('h2', tx('Гіпотези на перевірку', 'Hypotheses to test')),
      b('todo', ''),
      b('todo', ''),
      b('h2', tx('Що подивитись і прочитати', 'What to watch and read')),
      b('bullet', ''),
    ]),
  ];

  return { pages, openId: null };
}

/* ---------- сховище ---------- */

/* Порожня система для нового акаунта: лише обкладинка без розділів.
   Заповнений шаблон новачок не читав і не писав — він лише заважав
   би, і людина видаляла б чужий текст замість того, щоб писати свій.
   Шаблон лишається кнопкою «Приклад» (resetDoc). */
export function buildBlank() {
  return {
    pages: [{ ...newPage(null, tx('Моя торгова система', 'My trading system')), icon: '🎯', hint: '', blocks: [] }],
    openId: null,
  };
}

export function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildBlank();
    const parsed = JSON.parse(raw);
    if (!parsed?.pages?.length) return buildBlank();
    return parsed;
  } catch {
    return buildBlank();
  }
}

/* Для useCloudState: з бази чи дзеркала може прийти що завгодно —
   порожній або зламаний документ замінюємо чистою обкладинкою. */
export function normalizeDoc(v) {
  return v && Array.isArray(v.pages) && v.pages.length ? v : buildBlank();
}

export function saveDoc(doc) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)); } catch { /* приватний режим */ }
}

export const resetDoc = () => buildTemplate();

/* ---------- дерево ---------- */

export function buildTree(pages, parentId = null) {
  return pages
    .filter((p) => p.parentId === parentId)
    .map((p) => ({ ...p, children: buildTree(pages, p.id) }));
}

export function descendants(pages, id) {
  const kids = pages.filter((p) => p.parentId === id);
  return kids.reduce((acc, k) => [...acc, k.id, ...descendants(pages, k.id)], []);
}

export function pathTo(pages, id) {
  const out = [];
  let cur = pages.find((p) => p.id === id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? pages.find((p) => p.id === cur.parentId) : null;
  }
  return out;
}

/* ---------- пошук ---------- */

const blockText = (block) => {
  if (!block) return '';
  if (block.type === 'table') return (block.rows || []).flat().join(' ');
  if (block.type === 'image') return block.caption || '';
  const own = block.text || '';
  const kids = (block.children || []).map(blockText).join(' ');
  return `${own} ${kids}`;
};

export const pageText = (page) => (page.blocks || []).map(blockText).join(' ');

export function searchPages(pages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return pages
    .map((p) => {
      const title = (p.title || '').toLowerCase();
      const body = pageText(p).toLowerCase();
      if (!title.includes(q) && !body.includes(q)) return null;

      const i = body.indexOf(q);
      const snippet = i === -1
        ? ''
        : `…${pageText(p).slice(Math.max(0, i - 40), i + 60).trim()}…`;

      return { page: p, inTitle: title.includes(q), snippet };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.inTitle) - Number(a.inTitle));
}
