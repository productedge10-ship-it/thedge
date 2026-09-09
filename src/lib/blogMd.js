/* ==================================================================
   БЛОГ — розмітка статей.

   Свій парсер, а не бібліотека, і причина та сама, що в mdLite для
   нотаток: готовий markdown тягне за собою півсотні правил, яких
   тут ніколи не буде, і власні класи, які довелося б перефарбовувати
   під три теми читання.

   Але від mdLite цей парсер відрізняється задачею, тому це окремий
   файл, а не його розширення. Нотатка — рядок тексту, який людина
   набирає на швидкість. Стаття — верстка: таблиці, картинки з
   підписами, плашки-застереження, якорі на заголовках для змісту.
   Змішавши їх, ми б зробили записник важчим заради блогу.

   Парсер повертає дерево з простих об'єктів, а не готовий JSX.
   Через це той самий розбір використовує і сторінка статті, і
   віконце змісту: зміст бере заголовки з тих самих даних, з яких
   намальований текст, тому вони не можуть розійтись.

   Підтримується:
     ## і ###        заголовки (отримують якір)
     звичайний рядок абзац
     - і 1.          списки
     >               цитата
     ::: note Назва  плашка (note | warn | ok), закривається :::
     ![підпис](src)  картинка окремим рядком; src виду
                     placeholder:tone малює заглушку під майбутній SVG
     ::: slider Підпис
     src
     src
     :::             кілька кадрів під одним підписом
     | a | b |       таблиця, другий рядок — роздільник
     ---             лінія
     ```             блок коду
   Усередині рядка: **жирне**, *курсив*, [текст](адреса), `код`.
================================================================== */

/* ------------------------------------------------------------------
   Якорі заголовків.

   Кирилицю треба перекласти в латиницю: адреса з відсотковими
   кодами не читається ні людиною, ні в чужому месенджері. Якщо
   після чистки не лишилось нічого — беремо порядковий номер, бо
   якір без імені все одно має бути унікальним.
------------------------------------------------------------------ */
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ъ: '',
};

export const slugify = (text, index = 0) => {
  const out = String(text)
    .toLowerCase()
    .split('')
    .map((ch) => (MAP[ch] !== undefined ? MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return out || `rozdil-${index + 1}`;
};

/* ------------------------------------------------------------------
   Рядковий рівень.

   Порядок перевірок має значення: код першим, бо всередині нього
   зірочки не є розміткою.
------------------------------------------------------------------ */
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

export const inline = (text) => {
  const parts = String(text).split(INLINE).filter((s) => s !== '' && s !== undefined);
  return parts.map((chunk) => {
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return { t: 'code', text: chunk.slice(1, -1) };
    }
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return { t: 'b', text: chunk.slice(2, -2) };
    }
    if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2) {
      return { t: 'i', text: chunk.slice(1, -1) };
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk);
    if (link) return { t: 'a', text: link[1], href: link[2] };
    return { t: 'text', text: chunk };
  });
};

/* ------------------------------------------------------------------
   Блоковий рівень.
------------------------------------------------------------------ */
const isTableRow = (line) => line.startsWith('|') && line.endsWith('|');
const cells = (line) => line.slice(1, -1).split('|').map((c) => c.trim());

export function parse(md) {
  const lines = String(md).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  let headingIndex = 0;

  const push = (b) => blocks.push(b);

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    /* порожній рядок нічого не означає, крім кінця попереднього блоку */
    if (!line) { i += 1; continue; }

    /* лінія */
    if (/^---+$/.test(line)) { push({ type: 'hr' }); i += 1; continue; }

    /* заголовок */
    const head = /^(#{2,3})\s+(.*)$/.exec(line);
    if (head) {
      const text = head[2].trim();
      push({
        type: 'h',
        level: head[1].length,
        text,
        id: slugify(text, headingIndex),
      });
      headingIndex += 1;
      i += 1;
      continue;
    }

    /* картинка окремим рядком → фігура з підписом */
    const fig = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(line);
    if (fig) {
      push({ type: 'figure', caption: fig[1].trim(), srcs: [fig[2].trim()] });
      i += 1;
      continue;
    }

    /* Слайдер: кілька кадрів під одним підписом.

       ::: slider Підпис
       placeholder:violet
       /blog/shot-2.png
       :::

       Окремий блок, а не кілька картинок підряд: підряд — це три
       окремі ілюстрації, які людина гортає сторінкою, а слайдер —
       одна ілюстрація з кількох кадрів, які треба порівняти між
       собою на одному місці. */
    const slider = /^:::\s*slider\s*(.*)$/.exec(line);
    if (slider) {
      const srcs = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== ':::') {
        const src = lines[i].trim();
        if (src) srcs.push(src.replace(/^!\[[^\]]*\]\(|\)$/g, ''));
        i += 1;
      }
      i += 1;
      push({ type: 'figure', caption: slider[1].trim(), srcs });
      continue;
    }

    /* плашка: ::: kind Назва ... ::: */
    const callout = /^:::\s*(note|warn|ok)\s*(.*)$/.exec(line);
    if (callout) {
      const body = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== ':::') {
        body.push(lines[i].trim());
        i += 1;
      }
      i += 1; /* закривальні двокрапки */
      push({
        type: 'callout',
        kind: callout[1],
        title: callout[2].trim(),
        paras: body.join('\n').split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ')).filter(Boolean),
      });
      continue;
    }

    /* блок коду */
    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      push({ type: 'code', text: body.join('\n') });
      continue;
    }

    /* цитата: злипається, поки рядки починаються з > */
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      push({ type: 'quote', text: body.join(' ').trim() });
      continue;
    }

    /* таблиця: рядок труб, під ним роздільник */
    if (isTableRow(line) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const head2 = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        rows.push(cells(lines[i].trim()));
        i += 1;
      }
      push({ type: 'table', head: head2, rows });
      continue;
    }

    /* списки */
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      push({ type: 'ol', items });
      continue;
    }

    /* абзац: збираємо сусідні рядки, поки не почнеться інший блок */
    const para = [];
    while (
      i < lines.length
      && lines[i].trim()
      && !/^(#{2,3}\s|>|:::|```|[-*]\s|\d+\.\s|---+$)/.test(lines[i].trim())
      && !isTableRow(lines[i].trim())
      && !/^!\[[^\]]*\]\([^)]+\)$/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) push({ type: 'p', text: para.join(' ') });
    else i += 1; /* захист від зациклення на нерозпізнаному рядку */
  }

  return blocks;
}

/* Заголовки для змісту. Беруться з того самого розбору, що й текст,
   тому якорі в змісті завжди збігаються з якорями в статті. */
export const extractHeadings = (md) => parse(md)
  .filter((b) => b.type === 'h')
  .map(({ id, text, level }) => ({ id, text, level }));

/* Чистий текст без розмітки — для пошуку й для опису сторінки. */
export const plainText = (md) => parse(md)
  .map((b) => {
    if (b.type === 'p' || b.type === 'quote' || b.type === 'h') return b.text;
    if (b.type === 'ul' || b.type === 'ol') return b.items.join(' ');
    if (b.type === 'callout') return `${b.title} ${b.paras.join(' ')}`;
    if (b.type === 'table') return [...b.head, ...b.rows.flat()].join(' ');
    return '';
  })
  .join(' ')
  .replace(/[*`[\]()]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
