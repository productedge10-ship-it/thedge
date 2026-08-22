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
  h1:       { label: 'Заголовок 1',   hint: 'Великий розділ' },
  h2:       { label: 'Заголовок 2',   hint: 'Підрозділ' },
  h3:       { label: 'Заголовок 3',   hint: 'Дрібний підзаголовок' },
  text:     { label: 'Текст',         hint: 'Звичайний абзац' },
  bullet:   { label: 'Список',        hint: 'Крапки' },
  number:   { label: 'Нумерований',   hint: '1, 2, 3…' },
  todo:     { label: 'Чекліст',       hint: 'Пункти з галочками' },
  toggle:   { label: 'Згортання',     hint: 'Ховає деталі під заголовком' },
  callout:  { label: 'Виноска',       hint: 'Виділити правило чи попередження' },
  quote:    { label: 'Цитата',        hint: 'Думка або витяг' },
  image:    { label: 'Картинка',      hint: 'Скрін графіка' },
  table:    { label: 'Таблиця',       hint: 'Сесії, пари, умови' },
  divider:  { label: 'Розділювач',    hint: 'Лінія між частинами' },
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
      ['Сесія', 'Пара', 'Умова'],
      ['London', 'EURUSD', 'Свіп азійського мінімуму'],
      ['New York', 'XAUUSD', 'Реакція на новину'],
    ];
  }
  return { ...base, ...extra };
};

export const newPage = (parentId = null, title = 'Новий розділ') => ({
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
    + `<text x="${pad + 12}" y="${zoneY + 29}" font-family="Roboto,sans-serif" font-size="15" fill="#8b7bff">${mark || 'зона входу'}</text>`;

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
    label: 'Правила',
    hint: 'Список того, що я роблю і чого не роблю',
    build: () => [
      b('callout', 'Правила, які не обговорюються в моменті. Змінювати можна тільки на холодну голову, поза сесією.', { tone: 'acc' }),
      b('h2', 'Мої правила'),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', 'Ціна порушення'),
      b('text', 'Що саме я втрачаю, коли порушую ці правила.'),
    ],
  },
  {
    id: 'setup',
    label: 'Сетап',
    hint: 'Умови входу, приклад на графіку, чого не робити',
    build: () => [
      b('h2', 'Умови'),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', 'Приклад'),
      { ...emptyBlock('image'), src: chartSvg({ up: true, mark: 'зона входу' }), caption: 'Заміни на свій скрін', width: 100 },
      b('h2', 'Чого не робити'),
      b('callout', '', { tone: 'bad' }),
    ],
  },
  {
    id: 'table',
    label: 'Таблиця',
    hint: 'Порівняння: інструменти, сесії, умови',
    build: () => [
      b('text', 'Коротко про те, що порівнюю в цій таблиці.'),
      tbl([['Що', 'Умова', 'Нотатка'], ['', '', ''], ['', '', '']]),
    ],
  },
  {
    id: 'blank',
    label: 'З нуля',
    hint: 'Чистий аркуш — сам вирішу структуру',
    build: () => [emptyBlock('text')],
  },
];

export const buildPreset = (id) =>
  (PRESETS.find((p) => p.id === id) || PRESETS[3]).build();

function buildTemplate() {
  const root = {
    ...newPage(null, 'Моя торгова система'),
    icon: '🎯',
    hint: 'Те, чого я НЕ роблю у решту часу',
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
    sec('Інструменти', '📌', 'ice', 'Що я торгую і, головне, чого не торгую', [
      b('callout', 'Що менше інструментів, то глибше ти їх читаєш. Три пари, які ти знаєш напамʼять, кращі за двадцять, за якими просто стежиш.', { tone: 'acc' }),
      b('h2', 'Основні'),
      tbl([
        ['Інструмент', 'Чому саме він', 'Коли не торгую'],
        ['', '', ''],
        ['', '', ''],
      ]),
      b('h2', 'У спостереженні'),
      b('text', 'Те, що вивчаю, але ще не торгую живими грішми.'),
      b('bullet', ''),
      b('h2', 'Чорний список'),
      b('callout', 'Інструменти, на яких я системно втрачаю. Сюди пишу чесно — це найкорисніший список у всій системі.', { tone: 'bad' }),
      b('bullet', ''),
    ]),

    /* ---------- 2. Час ---------- */
    sec('Час', '🕐', 'amber', 'Коли я за терміналом, а коли мене там немає', [
      b('callout', 'Розклад — це не дисципліна заради дисципліни. Це спосіб не сідати за графік втомленим.', { tone: 'acc' }),
      b('h2', 'Мої вікна'),
      tbl([
        ['Сесія', 'Час (мій)', 'Що я тут роблю'],
        ['', '', ''],
        ['', '', ''],
      ]),
      b('h2', 'Розпорядок торгового дня'),
      b('todo', 'Розмітка з вечора або за годину до відкриття'),
      b('todo', 'Діагностика стану перед сесією'),
      b('todo', 'Торгівля тільки у своєму вікні'),
      b('todo', 'Розбір угод одразу після сесії, поки памʼятаю'),
      b('h2', 'Коли я не торгую'),
      b('bullet', 'Спав менше шести годин'),
      b('bullet', 'День виходу ключових новин по моєму інструменту'),
      b('bullet', ''),
    ]),

    /* ---------- 3. TDA ---------- */
    sec('Top-down аналіз', '✍️', 'violet', 'Як я приходжу до ідеї: від контексту до входу', [
      b('callout', 'Спершу контекст, потім зона, і тільки потім вхід. Якщо почав з молодшого таймфрейму — це вже не аналіз, а пошук виправдання.', { tone: 'acc' }),
      b('h2', 'Порядок таймфреймів'),
      b('number', '1W / 1D — напрямок і глобальний контекст'),
      b('number', '4H / 1H — де лежить ліквідність і куди ціна по неї йде'),
      b('number', '15m — зона, від якої я готовий діяти'),
      b('number', '5m / 1m — підтвердження і вхід'),
      b('h2', 'Що я шукаю на кожному кроці'),
      tbl([
        ['Таймфрейм', 'Питання', 'Відповідь = дія'],
        ['1D', 'Куди ринок хоче?', ''],
        ['1H', 'Де він набирає позицію?', ''],
        ['15m', 'Де моя зона?', ''],
      ]),
      b('h2', 'Приклад розмітки'),
      { ...emptyBlock('image'), src: chartSvg({ up: true, mark: 'зона, розмічена зранку' }), caption: 'Заміни на свій скрін: розмітка з вечора → реакція в зоні → вхід після підтвердження', width: 100 },
      b('callout', 'Якщо на старших таймфреймах ідеї немає — молодші її не створять.', { tone: 'warn' }),
    ]),

    /* ---------- 4. Ризик ---------- */
    sec('Ризик', '💵', 'mint', 'Цифри, які не обговорюються під час сесії', [
      b('callout', 'Ці числа міняються тільки на холодну голову, поза ринком. Усередині сесії вони — закон.', { tone: 'bad' }),
      b('h2', 'Мої цифри'),
      tbl([
        ['Параметр', 'Значення'],
        ['Ризик на угоду', '1%'],
        ['Максимум угод на день', '2'],
        ['Денний стоп', '−2%'],
        ['Тижневий стоп', '−5%'],
      ]),
      b('h2', 'Правила'),
      b('todo', 'Обсяг рахую до входу, а не «на око»'),
      b('todo', 'Стоп ставлю одразу разом з ордером'),
      b('todo', 'Після денного стопу термінал закрито до завтра'),
      b('todo', 'Не додаю до збиткової позиції ніколи'),
      b('h2', 'Коли зменшую ризик удвічі'),
      b('bullet', 'Перші дні на новому рахунку'),
      b('bullet', 'Після серії з трьох мінусів'),
      b('bullet', ''),
      b('quote', 'Розмір позиції — це не про жадібність. Це про те, чи зможеш ти спокійно дивитись на просадку.'),
    ]),

    /* ---------- 5. Особисті правила ---------- */
    sec('Особисті правила', '🛑', 'rose', 'За кожне з них я вже заплатив', [
      b('callout', 'Тут не теорія з книжок, а правила, куплені власними грішми. Під кожним — конкретна історія.', { tone: 'acc' }),
      b('h2', 'Мої закони'),
      b('todo', ''),
      b('todo', ''),
      b('todo', ''),
      b('h2', 'Що я порушую найчастіше'),
      {
        ...emptyBlock('toggle'),
        text: 'Ранній вхід',
        children: [
          b('text', 'Заходжу до закриття свічки, бо «здається, вже пішло».'),
          b('callout', 'Правило: вхід тільки після закриття свічки на робочому таймфреймі.', { tone: 'ok' }),
        ],
      },
      {
        ...emptyBlock('toggle'),
        text: 'Відігравання після стопу',
        children: [
          b('text', 'Одразу після мінуса відкриваю наступну угоду без сетапу.'),
          b('callout', 'Правило: після стопу — тридцять хвилин без графіка.', { tone: 'ok' }),
        ],
      },
    ]),

    /* ---------- 6. Проп ---------- */
    sec('Проп-компанії', '🥇', 'lime', 'Умови рахунків і що я перевіряю перед купівлею', [
      b('callout', 'Проп — це не безкоштовні гроші, а екзамен з дисципліни. Умови важать більше, ніж розмір рахунку.', { tone: 'acc' }),
      b('h2', 'Мої рахунки'),
      tbl([
        ['Компанія', 'Розмір', 'Етап', 'Денний ліміт', 'Загальний ліміт'],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
      ]),
      b('h2', 'Що перевіряю перед покупкою'),
      b('todo', 'Денна просадка: від балансу чи від еквіті'),
      b('todo', 'Просадка статична чи трейлінг'),
      b('todo', 'Чи можна тримати позицію через новини й вихідні'),
      b('todo', 'Реальні строки й відсоток виплат'),
      b('todo', 'Скільки я вже віддав цій компанії за спроби'),
      b('h2', 'Правила проп-рахунку'),
      b('bullet', 'Ризик на проп-рахунку менший, ніж на своєму'),
      b('bullet', ''),
    ]),

    /* ---------- 7. Нотатки ---------- */
    sec('Нотатки', '📍', 'peach', 'Те, що ще не стало правилом', [
      b('text', 'Чернетка системи. Звідси ідеї або переїжджають у розділи вище, або відсіюються.'),
      b('h2', 'Спостереження'),
      b('bullet', ''),
      b('h2', 'Гіпотези на перевірку'),
      b('todo', ''),
      b('todo', ''),
      b('h2', 'Що подивитись і прочитати'),
      b('bullet', ''),
    ]),
  ];

  return { pages, openId: null };
}

/* ---------- сховище ---------- */

export function loadDoc() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildTemplate();
    const parsed = JSON.parse(raw);
    if (!parsed?.pages?.length) return buildTemplate();
    return parsed;
  } catch {
    return buildTemplate();
  }
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
