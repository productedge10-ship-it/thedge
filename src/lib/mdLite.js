import { createElement as h, Fragment } from 'react';

/* ==================================================================
   Мінімальна розмітка нотаток.

   Не повний markdown і не бібліотека на 40 кілобайт. Рівно те, що
   людина справді набирає в записнику: заголовки, жирне, курсив, код,
   списки, чеклісти, цитати, роздільники й посилання.

   Чому свій, а не готовий: сторонній парсер тягне за собою власний
   набір правил (таблиці, html, зноски), які тут ніколи не знадобляться,
   і власні класи, які довелося б перефарбовувати під тему. Тут тридцять
   рядків, і кожен видно.

   Головне правило: якщо рядок не схожий на розмітку — він лишається
   текстом як є. Записник не має права зіпсувати те, що вже написано.
================================================================== */

const BULLET = '• ';
const BOX = '☐ ';
const DONE = '☑ ';

/* ---------- рядковий рівень ----------

   Порядок важливий: **жирне** мусить розібратись раніше за *курсив*,
   інакше подвійні зірочки з'їдаються як дві порожні пари. */
const INLINE = [
  { re: /`([^`]+)`/g, tag: 'code' },
  { re: /\*\*([^*]+)\*\*/g, tag: 'strong' },
  { re: /__([^_]+)__/g, tag: 'strong' },
  { re: /(?<!\*)\*([^*\n]+)\*(?!\*)/g, tag: 'em' },
  { re: /~~([^~]+)~~/g, tag: 'del' },
];

const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE = /(https?:\/\/[^\s<]+)/g;

/* Розбираємо рядок у масив вузлів. Робимо це рекурсивно по одному
   правилу за раз: так вкладене **жирне з `кодом`** теж працює, а
   регулярка лишається простою. */
function inline(text, key = 0, style = {}) {
  if (!text) return null;

  for (const rule of INLINE) {
    rule.re.lastIndex = 0;
    const m = rule.re.exec(text);
    if (!m) continue;

    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    const inner = rule.tag === 'code'
      ? m[1]
      : inline(m[1], key + 1, style);

    const props = rule.tag === 'code'
      ? { style: { ...style.code } }
      : rule.tag === 'strong'
        ? { style: { fontWeight: 700, color: style.strong } }
        : rule.tag === 'em'
          ? { style: { fontStyle: 'italic' } }
          : { style: { opacity: 0.6 } };

    return h(Fragment, { key },
      inline(before, key + 1, style),
      h(rule.tag, { key: 'm', ...props }, inner),
      inline(after, key + 2, style));
  }

  /* Посилання — останніми, бо всередині них розмітки вже не буває */
  LINK.lastIndex = 0;
  const link = LINK.exec(text);
  if (link) {
    return h(Fragment, { key },
      inline(text.slice(0, link.index), key + 1, style),
      h('a', { key: 'l', href: link[2], target: '_blank', rel: 'noreferrer', style: { color: style.link } }, link[1]),
      inline(text.slice(link.index + link[0].length), key + 2, style));
  }

  BARE.lastIndex = 0;
  const bare = BARE.exec(text);
  if (bare) {
    return h(Fragment, { key },
      text.slice(0, bare.index),
      h('a', { key: 'u', href: bare[1], target: '_blank', rel: 'noreferrer', style: { color: style.link } }, bare[1]),
      inline(text.slice(bare.index + bare[0].length), key + 1, style));
  }

  return text;
}

/* ---------- блоковий рівень ---------- */

export function renderMd(src, opts = {}) {
  const {
    accent = '#a99cff',
    text = '#e4e4e9',
    muted = '#8b8998',
    line = '#26262f',
    onToggle,
  } = opts;

  const style = { strong: '#ffffff', link: accent, code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '0.9em',
    padding: '2px 6px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${line}`,
  } };

  const lines = String(src || '').split('\n');
  const out = [];
  let list = null;   // накопичувач пунктів списку

  const flush = () => {
    if (!list) return;
    out.push(h('div', { key: `l${out.length}`, style: { margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 6 } }, list.items));
    list = null;
  };

  lines.forEach((raw, i) => {
    const l = raw.trimEnd();

    if (!l.trim()) { flush(); return; }

    /* Роздільник */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())) {
      flush();
      out.push(h('hr', { key: i, style: { border: 0, borderTop: `1px solid ${line}`, margin: '18px 0' } }));
      return;
    }

    /* Заголовки */
    const head = /^(#{1,4})\s+(.*)$/.exec(l);
    if (head) {
      flush();
      const level = head[1].length;
      const size = [22, 19, 17, 15.5][level - 1];
      out.push(h('div', {
        key: i,
        style: {
          fontSize: size,
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '-0.02em',
          lineHeight: 1.3,
          margin: out.length ? '20px 0 8px' : '0 0 8px',
        },
      }, inline(head[2], 0, style)));
      return;
    }

    /* Цитата */
    const quote = /^>\s?(.*)$/.exec(l);
    if (quote) {
      flush();
      out.push(h('div', {
        key: i,
        style: {
          margin: '10px 0',
          padding: '2px 0 2px 14px',
          borderLeft: `2px solid ${accent}66`,
          color: muted,
        },
      }, inline(quote[1], 0, style)));
      return;
    }

    /* Чекліст. Приймаємо і наші ☐/☑, і markdown-варіант — люди
       переносять текст звідусіль, і сваритись за синтаксис тут
       нема сенсу. */
    const check = /^(?:☐|☑|-\s\[( |x|X)\])\s*(.*)$/.exec(l);
    if (check) {
      const done = l.startsWith('☑') || /\[[xX]\]/.test(l);
      if (!list || list.type !== 'check') { flush(); list = { type: 'check', items: [] }; }
      list.items.push(h('div', {
        key: i,
        onClick: onToggle ? () => onToggle(i) : undefined,
        style: {
          display: 'flex', alignItems: 'flex-start', gap: 10,
          cursor: onToggle ? 'pointer' : 'default',
          color: done ? muted : text,
          textDecoration: done ? 'line-through' : 'none',
        },
      },
      h('span', {
        key: 'b',
        style: {
          flex: 'none', width: 17, height: 17, marginTop: 3, borderRadius: 5,
          display: 'grid', placeItems: 'center',
          background: done ? `${accent}2b` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${done ? `${accent}80` : line}`,
          color: accent, fontSize: 11, lineHeight: 1,
        },
      }, done ? '✓' : ''),
      h('span', { key: 't' }, inline(check[2], 0, style))));
      return;
    }

    /* Список */
    const item = /^(?:•|[-*])\s+(.*)$/.exec(l);
    if (item) {
      if (!list || list.type !== 'bullet') { flush(); list = { type: 'bullet', items: [] }; }
      list.items.push(h('div', {
        key: i,
        style: { display: 'flex', alignItems: 'flex-start', gap: 10, color: text },
      },
      h('span', { key: 'd', style: { flex: 'none', marginTop: 9, width: 5, height: 5, borderRadius: 99, background: accent } }),
      h('span', { key: 't' }, inline(item[1], 0, style))));
      return;
    }

    /* Звичайний абзац */
    flush();
    out.push(h('div', { key: i, style: { margin: '6px 0', color: text } }, inline(l, 0, style)));
  });

  flush();
  return out;
}

/* Текст без розмітки — для прев'ю в картці й для пошуку. Показувати
   `## Заголовок` у списку так само погано, як і не показувати нічого. */
export function mdPlain(src) {
  return String(src || '')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(?:☐|☑|•|[-*])\s+/gm, '')
    .replace(/^-\s\[[ xX]\]\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/* Перемикання пункту чеклиста за номером рядка. Тримаємо тут, поруч
   з розбором: правила, за якими рядок вважається пунктом, мусять
   збігатись з тими, за якими він малюється. */
export function toggleCheck(src, lineIndex) {
  const lines = String(src || '').split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return src;

  if (l.startsWith(BOX)) lines[lineIndex] = DONE + l.slice(BOX.length);
  else if (l.startsWith(DONE)) lines[lineIndex] = BOX + l.slice(DONE.length);
  else if (/^-\s\[ \]\s/.test(l)) lines[lineIndex] = l.replace('- [ ] ', '- [x] ');
  else if (/^-\s\[[xX]\]\s/.test(l)) lines[lineIndex] = l.replace(/- \[[xX]\] /, '- [ ] ');
  else return src;

  return lines.join('\n');
}

/* ==================================================================
   Підсвічування прямо в полі введення.

   Друге життя того самого розбору, але з іншим завданням: не
   перемалювати текст, а показати його таким, як він є, лише
   розставивши акценти. Тому тут не можна ані з'їсти жодного символу,
   ані змінити ширину жодної літери — під цим шаром лежить справжня
   textarea, і будь-яка різниця в метриках зсуває курсор.

   Звідси два правила:
     · службові символи (`##`, `**`, `>`) не ховаються, а гаснуть;
     · жирне робиться тінню, а не font-weight — інакше літери стають
       ширшими й текст роз'їжджається з тим, що набирають.
================================================================== */

const FAUX_BOLD = { textShadow: '0 0 0.4px currentColor, 0 0 0.4px currentColor' };

/* Дужки, лапки й решітки лишаються на місці — просто тьмяніють. */
const markStyle = (c) => ({ color: c, opacity: 0.42 });

export function highlightMd(src, opts = {}) {
  const {
    accent = '#a99cff',
    text = '#eceaf4',
    muted = '#8b8998',
  } = opts;

  const nodes = [];
  let key = 0;
  const push = (str, style) => { if (str) nodes.push(h('span', { key: key++, style }, str)); };

  String(src || '').split('\n').forEach((line, li, all) => {
    let rest = line;

    /* ---- початок рядка ---- */
    const head = /^(#{1,4}\s)(.*)$/.exec(line);
    const quote = /^(>\s?)(.*)$/.exec(line);
    const check = /^(☐\s|☑\s|-\s\[[ xX]\]\s)(.*)$/.exec(line);
    const item = /^([•*-]\s)(.*)$/.exec(line);

    let bodyStyle = { color: text };

    if (head) {
      push(head[1], markStyle(accent));
      rest = head[2];
      bodyStyle = { color: '#ffffff', ...FAUX_BOLD };
    } else if (quote) {
      push(quote[1], markStyle(accent));
      rest = quote[2];
      bodyStyle = { color: muted };
    } else if (check) {
      const done = line.startsWith('☑') || /\[[xX]\]/.test(check[1]);
      push(check[1], { color: accent, opacity: done ? 1 : 0.75 });
      rest = check[2];
      bodyStyle = done ? { color: muted, textDecoration: 'line-through' } : { color: text };
    } else if (item) {
      push(item[1], { color: accent, opacity: 0.75 });
      rest = item[2];
    }

    /* ---- усередині рядка ---- */
    const INL = /(\*\*|__)(.+?)\1|(`)([^`]+)(`)|(~~)(.+?)(~~)|(?<!\*)(\*)([^*\n]+)(\*)(?!\*)/g;
    let at = 0;
    let m;
    while ((m = INL.exec(rest)) !== null) {
      push(rest.slice(at, m.index), bodyStyle);
      const open = m[1] || m[3] || m[6] || m[9];
      const inner = m[2] || m[4] || m[7] || m[10];
      const close = m[1] || m[5] || m[8] || m[11];

      push(open, markStyle(muted));
      if (m[1]) push(inner, { ...bodyStyle, color: '#ffffff', ...FAUX_BOLD });
      else if (m[3]) push(inner, { ...bodyStyle, color: accent });
      else if (m[6]) push(inner, { ...bodyStyle, color: muted, textDecoration: 'line-through' });
      else push(inner, { ...bodyStyle, fontStyle: 'italic' });
      push(close, markStyle(muted));

      at = m.index + m[0].length;
    }
    push(rest.slice(at), bodyStyle);

    /* Перенос рядка теж символ: без нього текст злипнеться, а
       курсор поїде на рядок вище. */
    if (li < all.length - 1) nodes.push(h('span', { key: key++ }, '\n'));
  });

  /* Хвостовий пробіл, щоб останній порожній рядок мав висоту */
  nodes.push(h('span', { key: key++ }, ' '));
  return nodes;
}
