/* ==================================================================
   БЛОГ — заглушки обкладинок як справжні картинки.

   Раніше заглушка була набором div'ів із градієнтом. Виглядало це
   правильно, але з появою лупи й слайдера стало заважати: і лупа, і
   фулскрін, і перегортання кадрів працюють із зображенням, а не з
   версткою. Тримати для заглушок окрему гілку логіки — це два різні
   перегляди картинок на одному сайті, з яких другий ніхто не
   перевірятиме.

   Тому заглушка тепер — справжня картинка: SVG, зібраний рядком і
   відданий як data:URI. Для слайдера вона нічим не відрізняється від
   майбутнього файлу, тому коли зʼявляться намальовані SVG, зміниться
   рівно одне поле в даних статті, а весь перегляд лишиться той самий.

   Кольори приходять ззовні, з поточної теми: заглушка на паперовому
   тлі не має бути чорним прямокутником.

   Кодування через encodeURIComponent, а не base64: воно коротше, і
   рядок лишається читабельним у devtools.
================================================================== */

const TONE = {
  violet: '#8b7bff',
  green: '#2fbf8f',
  blue: '#60a5fa',
  amber: '#f5a33b',
  lavender: '#afafe2',
};

/* Довгий підпис ріжемо на рядки самі: SVG не вміє переносити текст,
   а обрізаний на півслові підпис виглядає як помилка рендера. */
const wrap = (text, per = 42) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > per) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur ? `${cur} ${w}` : w);
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export function placeholderImage({
  tone = 'violet',
  hint = '',
  vars = {},
  width = 1200,
  height = 675,
}) {
  const acc = TONE[tone] || TONE.violet;
  const bg = vars['--bl-bg2'] || '#0b0b10';
  const line = vars['--bl-line'] || 'rgba(255,255,255,.09)';
  const lineSoft = vars['--bl-line-soft'] || 'rgba(255,255,255,.05)';
  const text = vars['--bl-text3'] || '#9a9aad';
  const scrim = vars['--bl-scrim'] || 'rgba(8,8,12,.72)';

  const lines = wrap(hint);
  const boxH = 26 + lines.length * 30;
  const boxW = Math.min(width - 80, 60 + Math.max(...lines.map((l) => l.length), 10) * 14);
  const boxY = height - 40 - boxH;

  const label = lines.length ? `
    <rect x="40" y="${boxY}" width="${boxW}" height="${boxH}" rx="14"
          fill="${scrim}" stroke="${line}" stroke-dasharray="6 5"/>
    ${lines.map((l, i) => `<text x="62" y="${boxY + 36 + i * 30}" fill="${text}"
        font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24"
        letter-spacing="0.5">${esc(l)}</text>`).join('')}
  ` : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${acc}" stop-opacity="0.34"/>
      <stop offset="0.6" stop-color="${acc}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${acc}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="${lineSoft}" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="url(#p)"/>
  ${label}
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' '))}`;
}

/* Джерело з розмітки статті: або справжній файл, або placeholder:tone.
   Одна функція на обидва випадки, щоб компоненти не розбирались, що
   їм передали. */
export const resolveSrc = (src, { tone, hint, vars }) => {
  if (!src) return placeholderImage({ tone, hint, vars });
  const ph = /^placeholder:(.+)$/.exec(src);
  if (ph) return placeholderImage({ tone: ph[1], hint, vars });
  return src;
};
