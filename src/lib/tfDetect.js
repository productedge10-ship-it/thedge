/* ==================================================================
   Таймфрейм зі скріна графіка.

   TradingView пише його текстом у шапці: «Germany 40 CFD · 1ч ·
   FOREX.com». Людина потім вибирає те саме руками в TfSelect — двічі
   одне й те саме, і другий раз вона забуває. Тому читаємо шапку самі.

   Без API й без ключів: OCR крутиться в браузері, tesseract.js
   вантажиться окремим чанком у мить першої потреби й більше ніколи.

   ------------------------------------------------------------------
   Чому попередні підходи ламались — і що з цього випливло

   1. Один поріг на всю смужку. У скріні з TradingView зверху йде
      ТЕМНА плашка з білим підписом, а під нею СВІТЛИЙ графік із
      чорним. Один поріг на обидві зони означає, що одна з них завжди
      перетворюється на суцільну заливку, і текст у ній гине. Тепер
      полярність визначається ОКРЕМО для кожної знайденої стрічки:
      текст — це завжди меншість пікселів, і саме за цим ми його й
      упізнаємо, байдуже, темний він чи світлий.

   2. Кеш порожніх відповідей. Не розпізналось один раз — і та сама
      картинка більше ніколи навіть не пробувалась. Тепер кешуємо
      тільки успіх.

   3. Нескінченне очікування. Тепер є бюджет: не вклались у три
      секунди — тихо здаємось, поле лишається порожнім.

   Головне правило не змінилось: результат ніколи не перебиває вибір
   людини. Підставляється тільки в порожнє поле.
================================================================== */

/* Те, що вміє TfSelect. Розпізнане підганяємо під найближче з цього
   списку — свої значення туди класти не можна, вони не виберуться. */
const ALLOWED = ['1m', '5m', '15m', '1H', '4H', '12H', '1D', '1W', '1M', '3M'];

/* Бюджет на розпізнавання.

   Було три секунди — і цього не вистачало рівно на той випадок, заради
   якого все й писалось. TradingView малює над шапкою ще один рядок,
   «…создал(а) график…», і він читається ПЕРШИМ. Одна стрічка — секунда
   з гаком, тож бюджет закінчувався на водяному знаку, а до шапки черга
   не доходила ніколи.

   Чекати тут нікому: людина в цей час пише нотатку, а поле з
   таймфреймом заповниться саме. Тому бюджет великий. */
const TIMEOUT_MS = 16000;

/* ------------------------------------------------------------------
   Завантаження

   Картинку треба не показати, а прочитати попіксельно — а це вимагає
   CORS-заголовка, якого TradingView не дає. Тому спершу пробуємо
   напряму, а якщо ні — через власний проксі /api/img, що доклеює
   заголовок сам.
------------------------------------------------------------------ */

function rawLoad(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed'));
    img.src = src;
  });
}

export function loadForPixels(src) {
  return rawLoad(src).catch(() => rawLoad(`/api/img?u=${encodeURIComponent(src)}`));
}

/* ------------------------------------------------------------------
   Пошук рядків тексту

   Віддавати OCR'у всю верхню смужку — це просити його шукати літери
   в небі й у свічках: текст займає відсотки площі, а час іде на все.
   Тому спершу самі знаходимо, ДЕ лежать рядки, і віддаємо лише їх.
------------------------------------------------------------------ */

function luminance(px, i) {
  return (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
}

function textBands(img) {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return [];

  /* Шапка живе вгорі зліва. Беремо з запасом: над підписом
     TradingView інколи малює ще рядок «…создал(а) график…». */
  const w = Math.max(60, Math.round(W * 0.62));
  const h = Math.max(20, Math.round(H * 0.22));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);

  const px = ctx.getImageData(0, 0, w, h).data;

  /* Для кожного рядка пікселів — його власна середня яскравість і
     кількість «не-фонових» точок. Локально, а не глобально: у верхній
     плашці фон чорний, у графіку — світлий, і спільного фону в них
     немає взагалі. */
  const rowMean = new Float32Array(h);
  const rowInk = new Int32Array(h);

  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) sum += luminance(px, (y * w + x) * 4);
    const mean = sum / w;
    rowMean[y] = mean;

    let ink = 0;
    for (let x = 0; x < w; x++) {
      if (Math.abs(luminance(px, (y * w + x) * 4) - mean) > 45) ink++;
    }
    rowInk[y] = ink;
  }

  /* Рядок тексту — це рядок, де є помітна меншість «інших» пікселів.
     Верхня межа теж потрібна: суцільна межа сітки або вісь дають
     майже всю ширину й текстом не є. */
  const lo = Math.max(2, Math.round(w * 0.002));
  const hi = Math.round(w * 0.45);
  const isText = (y) => rowInk[y] >= lo && rowInk[y] <= hi;

  const bands = [];
  let from = -1;
  let gap = 0;

  for (let y = 0; y < h; y++) {
    if (isText(y)) {
      if (from < 0) from = y;
      gap = 0;
    } else if (from >= 0) {
      gap++;
      /* Три порожні рядки поспіль — рядок скінчився. Менше не рахуємо:
         між великою й малою літерою прогалина є завжди. */
      if (gap >= 3) {
        const height = y - gap - from + 1;
        if (height >= 6 && height <= 40) bands.push([from, y - gap + 1]);
        from = -1;
        gap = 0;
      }
    }
  }
  if (from >= 0 && h - from >= 6 && h - from <= 40) bands.push([from, h]);

  /* Порядок спроб вирішує швидкість.

     У верхні 22% скріна потрапляють не лише підписи, а й перші
     свічки — і рядок, що їх перетинає, теж виглядає як «трохи
     чорнила на світлому». Відрізнити просто: підпис тулиться до
     лівого краю, а свічки розмазані по всій ширині. Тому рахуємо,
     яка частка чорнила лежить у лівій третині, і починаємо з тих
     стрічок, де ця частка найбільша. Потрібна майже завжди виявляється
     першою, і решту ми навіть не читаємо. */
  const leftEdge = Math.round(w * 0.35);
  const scored = bands.map(([a, b]) => {
    let left = 0;
    let total = 0;
    let right = 0;
    for (let y = a; y < b; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.abs(luminance(px, (y * w + x) * 4) - rowMean[y]) > 45) {
          total++;
          if (x < leftEdge) left++;
          if (x > right) right = x;
        }
      }
    }
    /* `right` — де закінчується чорнило. Потрібен, щоб не тягнути в
       OCR півкадру порожнього графіка: чим вужчий кадр, тим сильніше
       можна збільшити те, що в ньому лишилось. */
    return { band: [a, b, right], score: total ? left / total : 0 };
  });

  scored.sort((p, q) => q.score - p.score);
  return scored.map((x) => x.band);
}

/* Прямокутник → готове для OCR полотно: темний текст на світлому,
   збільшений.

   Раніше тут різали рівно ОДНУ стрічку й читали її режимом «один
   рядок тексту». На скріні з TradingView це не працює: підпис
   «…создал(а) график…» і шапка стоять упритул, детектор бачить їх
   однією стрічкою, а режим «один рядок» повертає з неї тільки верхній
   підпис. Саме тому в лозі був водяний знак — і більше нічого.

   Тепер віддаємо БЛОК із кількома рядками, а розбирає їх уже OCR.

   Полярність: медіана яскравості — це фон (він завжди більшість).
   Темний фон означає світлий текст, який треба інвертувати. `mode`
   дозволяє спробувати навпаки — на випадок графіка, де підпис
   лежить на плашці іншого кольору, ніж решта смужки. */
function prepCanvas(img, y0, y1, w, mode, zoom) {
  const pad = 4;
  const top = Math.max(0, Math.round(y0) - pad);
  const bot = Math.min(img.naturalHeight, Math.round(y1) + pad);
  const bh = bot - top;
  if (bh < 6 || w < 20) return null;

  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = bh;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(img, 0, top, w, bh, 0, 0, w, bh);

  const data = pctx.getImageData(0, 0, w, bh);
  const px = data.data;
  const total = px.length / 4;

  const hist = new Int32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    hist[Math.min(255, Math.max(0, Math.round(luminance(px, i))))] += 1;
  }

  const at = (frac) => {
    const want = total * frac;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= want) return v;
    }
    return 255;
  };

  const median = at(0.5);
  const dark = median < 128;
  const invert = mode === 'flip' || mode === 'binary-flip' ? !dark : dark;

  if (mode === 'binary' || mode === 'binary-flip') {
    /* Жорстка бінаризація: чисто чорне на чисто білому, поріг —
       медіана смужки.

       Розтяг контрасту (нижче) зберігає півтони, і на тьмяно-сірому
       підписі TradingView (#787b86 на майже чорному) цього замало:
       текст лишається сірою тінню, і OCR перетворює «Germany 40 CFD»
       на «i 0 i». Тут же кожен піксель однозначно або фон, або
       чорнило — саме так тонкий дрібний шрифт і читається. */
    for (let i = 0; i < px.length; i += 4) {
      const l = luminance(px, i);
      const ink = invert ? l > median + 18 : l < median - 18;
      const v = ink ? 0 : 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    pctx.putImageData(data, 0, 0);
  } else {
    /* Розтяг контрасту по перцентилях, а не по min/max: одна яскрава
       свічка або біла рамка інакше забирає весь діапазон собі. */
    let lo = at(0.02);
    let hi = at(0.98);
    if (hi - lo < 24) { lo = Math.max(0, median - 40); hi = Math.min(255, median + 40); }
    const span = Math.max(1, hi - lo);

    for (let i = 0; i < px.length; i += 4) {
      let g = (luminance(px, i) - lo) / span;
      g = g < 0 ? 0 : g > 1 ? 1 : g;
      if (invert) g = 1 - g;
      const v = Math.round(g * 255);
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    pctx.putImageData(data, 0, 0);
  }

  /* Збільшення рахується від ВИСОТИ РЯДКА, а не від ширини кадру.

     Раніше було навпаки — «тягнути полотно до 1600px по ширині», — і
     воно працювало рівно назадницю: що більший скрін, то менше
     збільшення діставалось тексту. На знімку з дрібною шапкою літера
     лишалась висотою в три пікселі, і OCR повертав кашу з будь-якою
     бінаризацією.

     Tesseract хоче приблизно 30–40 пікселів на літеру. */
  let scale = Math.min(8, Math.max(2, Math.round(zoom || 3)));
  /* Стеля на розмір полотна: восьмикратне збільшення широкого кадру
     дало б десять тисяч пікселів у ширину — це вже не точність, а
     кілька секунд простою й мегабайти памʼяті. */
  while (scale > 2 && w * scale > 4200) scale -= 1;
  const out = document.createElement('canvas');
  out.width = w * scale;
  out.height = bh * scale;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(probe, 0, 0, out.width, out.height);
  return out;
}

/* ------------------------------------------------------------------
   Розбір прочитаного
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Розбір прочитаного

   Найдорожча помилка тут — не «не знайшли», а «знайшли не те». Саме
   вона й сталась: розбір шукав «цифру з буквою» будь-де в рядку, а
   OCR повертає багато сміття — і в сміття така пара знаходиться
   майже завжди. Через це всюди проставлялось 1m.

   Тому тепер не шукаємо, а перевіряємо. TradingView пише шапку
   строго: «Germany 40 CFD · 1ч · FOREX.com». Таймфрейм — це ЦІЛИЙ
   сегмент між крапками-роздільниками, у якому немає нічого, крім
   числа й однієї літери одиниці. «Germany 40 CFD» цілим сегментом не
   є, «2026» без букви — теж, і жоден із них більше не пройде.
------------------------------------------------------------------ */

/* Рядок водяного знака TradingView — не шапка. У ньому повно цифр
   (дата, час, UTC+3), і саме він дає найбільше хибних збігів. */
const WATERMARK = /tradingview|created|создал|створ|utc|\d{1,2}:\d{2}/i;

/* Одиниці: літера (і кириличний двійник) або ціле слово. Довгі форми
   стоять першими навмисно — інакше «month» з'їлось би як «m». */
/* `\w` у JS — це тільки латиниця, тож кириличні хвости доводиться
   виписувати класом; без цього «хвилин» і «минут» не збігались. */
const CYR = '[А-Яа-яЇїІіЄєҐґ]*';
const UNIT_WORD = [
  [new RegExp(`^(months?|mo|мес${CYR}|м[іi]с${CYR})$`, 'i'), 'M'],
  [new RegExp(`^(weeks?|wk|нед${CYR}|тиж${CYR})$`, 'i'), 'W'],
  [new RegExp(`^(days?|дн${CYR}|день)$`, 'i'), 'D'],
  [new RegExp(`^(hours?|hr|час${CYR}|год${CYR})$`, 'i'), 'H'],
  [new RegExp(`^(min|mins|minutes?|мин${CYR}|хв${CYR})$`, 'i'), 'm'],
];

/* Скільки чого існує в TradingView насправді. Це і є головний фільтр:
   «40» хвилин не буває, «2026» днів не буває — а саме такі числа й
   прилітають з OCR-сміття. Раніше будь-яке число підганялось до
   найближчого TF, і тому всюди з'являлось 1m. */
const REAL = {
  m: { 1: '1m', 2: '1m', 3: '5m', 5: '5m', 10: '15m', 15: '15m', 30: '15m', 45: '1H' },
  H: { 1: '1H', 2: '1H', 3: '4H', 4: '4H', 6: '4H', 8: '12H', 12: '12H' },
  D: { 1: '1D', 2: '1D', 3: '1D' },
  W: { 1: '1W', 2: '1W', 3: '1W' },
  M: { 1: '1M', 3: '3M', 6: '3M', 12: '3M' },
};

/* Літера одиниці з урахуванням регістру й кирилиці.
   Регістр вирішує: M — місяць, m — хвилина. Плутати не можна. */
function unitOf(letter) {
  if (letter === 'M' || letter === 'М') return 'M';
  const l = letter.toLowerCase();
  if (l === 'm' || l === 'м') return 'm';
  /* «ч» вузьке, низьке й без виносних — найгірша літера для OCR у
     шрифті на 11 пікселів. Її бачать як «u», «y», «ц», «и», «г», «c»,
     «r». Жодна з них одиницею часу не є в жодній мові, тож прийняти
     їх усі за годину безпечно: хибного спрацювання це дати не може. */
  if ('hчuyцигcr'.includes(l)) return 'H';
  if (l === 'd' || l === 'д') return 'D';
  /* Тиждень: «W» англійською, «Н» російською, «Т» українською. Латинська
     «T» сюди ж — OCR не розрізняє її й кириличну «Т» ніяк. */
  if (l === 'w' || l === 'н' || l === 'т' || l === 't') return 'W';
  return null;
}

/* OCR-двійники одиниць.

   У шрифті шапки 11 пікселів, і кирилична «Д» там регулярно читається
   як «4»: денний графік приходить сегментом «14» замість «1Д». Число
   14 хвилин не існує, тож строгий розбір його відкидав — і дейлі був
   єдиним таймфреймом, який не впізнавався ніколи.

   Тому після строгого проходу є ще один: остання ЦИФРА сегмента
   пробується як літера. «0» сюди навмисно не входить — «10» це
   справжні десять хвилин, і плутати його з «1D» не можна. */
const REPAIR = { 4: 'D', А: 'D', A: 'D', а: 'D', a: 'D', 7: 'W' };

function repairSegment(segRaw, build2) {
  const seg = String(segRaw).trim()
    .replace(/^[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+|[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+$/g, '');
  const m = /^(\d{1,3})\s*(.)$/.exec(seg);
  if (!m) return null;
  const unit = REPAIR[m[2]];
  return unit ? build2(Number(m[1]), unit) : null;
}

function build(n, unit) {
  const def = REAL[unit];
  const tf = def && def[n];
  /* Остання перевірка: TfSelect не вміє нічого поза ALLOWED, і
     значення, якого немає в списку, просто мовчки не вибереться. */
  return tf && ALLOWED.includes(tf) ? tf : null;
}

/* Один сегмент → таймфрейм або null.

   `strict` = сегмент прийшов не з розділеної шапки, а з довільного
   тексту: там голі числа заборонені зовсім. */
function segmentToTf(segRaw, strict) {
  const seg = String(segRaw).trim()
    .replace(/^[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+|[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+$/g, '');
  if (!seg) return null;

  /* «15 хвилин», «4 hours» — число й слово-одиниця. */
  const word = /^(\d{1,3})\s*([A-Za-zА-Яа-яЇїІіЄєҐґ]{2,8})\.?$/.exec(seg);
  if (word) {
    const n = Number(word[1]);
    for (const [re, u] of UNIT_WORD) if (re.test(word[2])) return build(n, u);
    return null;
  }

  const m = /^(\d{1,3})\s*([A-Za-zА-Яа-яЇїІіЄєҐґ]?)$/.exec(seg);
  if (!m) return null;

  const n = Number(m[1]);
  const letter = m[2];
  if (!n) return null;

  if (letter) {
    const u = unitOf(letter);
    return u ? build(n, u) : null;
  }

  /* Голе число. Англійський інтерфейс справді пише «5» замість «5m»,
     тож зовсім заборонити не можна. Але 1 і 2 відкинуто навмисно:
     одиниця й двійка трапляються в OCR-смітті частіше за всі інші
     числа разом, і саме вони давали хибне 1m. Хто торгує на M1 —
     вибере руками, це дешевше за неправильне автозаповнення. */
  if (strict) return null;
  if (n < 3) return null;
  return build(n, 'm');
}

/* Прочитане може прийти кількома рядками одразу: стрічки в скріні
   стоять упритул, і межа між «…создал(а) график…» і шапкою інколи
   зникає. Відкидати через це весь текст — втрачати саме те, по що
   прийшли. Тому водяний знак відсіюємо ПОРЯДКОВО. */
function parse(textRaw) {
  const lines = String(textRaw || '').split(/[\r\n]+/);
  for (const line of lines) {
    const tf = parseLine(line);
    if (tf) return tf;
  }
  return null;
}

function parseLine(textRaw) {
  const text = String(textRaw || '').replace(/\s+/g, ' ').trim();
  if (!text || WATERMARK.test(text)) return null;

  /* Основний шлях: сегменти між роздільниками. OCR інколи бачить «·»
     як «.», «-» або «•» — приймаємо всі, але тільки коли навколо них
     пробіли, інакше розваляться «FOREX.com» і «19:23».

     Голе число приймається лише тут: шапка TradingView — єдине місце,
     де число саме по собі означає таймфрейм. І лише коли сегментів
     принаймні три («актив · TF · біржа»): у парі з двох те саме число
     з однаковим успіхом може бути шматком назви. */
  /* «·» OCR бачить по-різному: крапкою, зірочкою, рискою, плюсом.
     Приймаємо всі, але лише з пробілами навколо — інакше розваляться
     «FOREX.com» і «19:23». */
  const parts = text.split(/\s[·•∙:.,;*+~=/\\\-–—|]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const strict = parts.length < 3;
    for (const part of parts) {
      const tf = segmentToTf(part, strict);
      if (tf) return tf;
    }
  }

  /* Запасний шлях: «15m» одним словом або «15 хвилин» двома. Голі
     числа тут не приймаються ніколи. */
  const toks = text.split(/[\s,;|]+/)
    .map((t) => t.replace(/^[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+|[^\dA-Za-zА-Яа-яЇїІіЄєҐґ]+$/g, ''))
    .filter(Boolean);

  for (let i = 0; i < toks.length; i += 1) {
    const one = toks[i];
    if (/^\d{1,3}[A-Za-zА-Яа-яЇїІіЄєҐґ]{1,8}$/.test(one)) {
      const tf = segmentToTf(one, true);
      if (tf) return tf;
    }
    const next = toks[i + 1];
    if (next && /^\d{1,3}$/.test(one) && /^[A-Za-zА-Яа-яЇїІіЄєҐґ]{2,8}$/.test(next)) {
      const tf = segmentToTf(`${one} ${next}`, true);
      if (tf) return tf;
    }
  }

  /* Останній прохід — лагодимо OCR-двійники. Тільки по сегментах
     шапки: у довільному тексті таке виправлення знайшло б таймфрейм
     у будь-якому числі, що закінчується на четвірку. */
  if (parts.length >= 2) {
    for (const part of parts) {
      const tf = repairSegment(part, build);
      if (tf) return tf;
    }
  }

  return null;
}

/* ------------------------------------------------------------------
   Рушій
------------------------------------------------------------------ */

let enginePromise = null;

async function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const mod = await import('tesseract.js');
      const worker = await mod.createWorker('eng+rus', 1, { legacyCore: false });
      await worker.setParameters({
        /* Білого списку символів тут більше немає.

           Він здавався захистом, а насправді ламав розпізнавання: з
           рядка «Germany 40 CFD · 1ч · FOREX.com» лишалась каша з
           цифр і кількох випадкових літер, без роздільників і без
           слів. Модель мови на такому не працює, а розбір втрачав
           єдину надійну ознаку — межі сегмента.

           Тепер читаємо рядок як є, а відсіюємо вже на розборі. */

        /* 6 — «однорідний блок тексту», а не 7 — «рівно один рядок».
           Це ключова правка: підпис «…создал(а) график…» і шапка з
           таймфреймом стоять упритул, і в режимі одного рядка другий
           із них просто не читався. */
        tessedit_pageseg_mode: '6',
      });
      return worker;
    })().catch((e) => {
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
}

/* Прогрів. Модель важить кілька мегабайт і кешується браузером в
   IndexedDB — але перший раз її треба звідкись узяти, і робити це в
   мить вставки скріна означає змусити чекати саме тоді, коли людина
   дивиться на результат. Тому піднімаємо воркер заздалегідь, у
   простої: сторінку вже намальовано, мережа вільна. */
export function warmUpTf() {
  const go = () => { engine().catch(() => {}); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2500);
}

/* ------------------------------------------------------------------
   «1ч» проти «1Д»

   Це єдина пара, яку текстом розрізнити неможливо. Після бінаризації
   дрібна кирилична «ч» і велика «Д» дають настільки схожий контур, що
   OCR обидві повертає четвіркою: і годинний, і денний графік
   приходять однаковим «14».

   Але розрізнити їх можна не за формою, а за ЗРОСТОМ. «Д» — велика
   літера на всю висоту рядка, «ч» — рядкова, приблизно дві третини.
   Цифра поруч дає еталон висоти, тож порівняння чесне й не залежить
   ні від масштабу скріна, ні від шрифту.

   Рамки символів OCR рахує сам — лишається їх прочитати.
------------------------------------------------------------------ */
function fixAmbiguousUnits(data) {
  const text = String(data?.text || '');
  const words = data?.words || [];
  if (!words.length) return text;

  let out = text;

  for (const word of words) {
    const t = String(word?.text || '').trim();
    /* Ціль — «одна-дві цифри й один знак». Сюди потрапляють і «1ч», і
       «14», і «1Н»: що саме там написано, вирішуємо не за літерою, яку
       повернув OCR, а за геометрією. Літера ненадійна, рамка — ні. */
    if (!/^\d{1,2}[^\s]$/.test(t)) continue;

    const sym = word?.symbols || [];
    if (sym.length < 2) continue;

    const a = sym[0]?.bbox;
    const b = sym[sym.length - 1]?.bbox;
    if (!a || !b) continue;

    const hDigit = a.y1 - a.y0;
    const hUnit = b.y1 - b.y0;
    if (hDigit < 6 || hUnit < 3) continue;

    const ratio = hUnit / hDigit;
    /* Наскільки знак звисає нижче цифри. Цифри стоять на базовій
       лінії рівно, тож будь-яке помітне звисання — це ніжки «Д». */
    const drop = (b.y1 - a.y1) / hDigit;

    let unit = null;
    if (drop > 0.12) unit = 'Д';          // ніжки під базовою лінією
    else if (ratio < 0.82) unit = 'ч';    // рядкова, без виносних

    console.info(
      `[tf] «${t}»: висота ${Math.round(ratio * 100)}%, звисання ${Math.round(drop * 100)}% → `
      + (unit === 'Д' ? 'дні' : unit === 'ч' ? 'години' : 'лишаємо як прочитано'),
    );

    if (unit) out = out.replace(t, `${t.slice(0, -1)}${unit}`);
  }

  return out;
}

/* Кешуємо ТІЛЬКИ успіх. Порожня відповідь у кеші означала б, що та
   сама картинка більше ніколи навіть не спробується — а причина
   невдачі могла бути тимчасовою (модель ще качалась, мережа лягла). */
const cache = new Map();

/* Єдине, що звідси потрібно назовні.
   Повертає '5m' | '1H' | … або null, якщо не впевнені. */
export async function detectTimeframe(src) {
  if (cache.has(src)) return cache.get(src);

  const deadline = Date.now() + TIMEOUT_MS;
  const log = [];

  try {
    const img = await loadForPixels(src);
    const H = img.naturalHeight;
    const w = Math.max(60, Math.round(img.naturalWidth * 0.62));

    /* Стрічки потрібні вже не щоб читати їх поодинці, а щоб знати межі
       блока з підписами: від верху першої до низу останньої. Так у
       кадр гарантовано потрапляють ОБИДВА рядки — і водяний знак, і
       шапка, — а розділить їх сам OCR. */
    const near = textBands(img)
      .filter(([a]) => a < H * 0.18)
      .sort((p, q) => p[0] - q[0]);

    const targets = [];

    if (near.length) {
      const top = near[0][0];
      const bot = near[near.length - 1][1];

      /* Висота рядка задає збільшення: ціль — близько 38 пікселів на
         літеру, стільки Tesseract читає впевнено. */
      const lineH = Math.max(6, Math.min(...near.map(([a, b]) => b - a)));
      const zoom = Math.max(2, Math.min(8, Math.round(38 / lineH)));

      /* Дві ширини кадру.

         Вузька — по найкоротшому рядку. Шапка з таймфреймом майже
         завжди найкоротша: водяний знак довший, а підпис індикатора
         («CRYPTOLOGY sessions (GMT+3, No, London, 1000-1500, …»)
         тягнеться на півекрана. Обрізавши кадр по ній, ми і зайве
         відсікаємо, і решту можемо збільшити сильніше.

         Широка — на випадок, коли найкоротшим виявився не той рядок. */
      const rights = near.map(([, , r]) => r).filter((r) => r > 0).sort((p, q) => p - q);
      const cap = Math.round(img.naturalWidth * 0.62);
      const narrow = rights.length ? Math.min(cap, Math.max(120, rights[0] + 14)) : w;
      const wide = rights.length ? Math.min(cap, Math.max(160, rights[rights.length - 1] + 14)) : w;

      /* Жорстка бінаризація йде ПЕРШОЮ: на тьмяному дрібному шрифті
         шапки вона читається помітно краще за півтони. */
      targets.push(prepCanvas(img, top, bot, narrow, 'binary', Math.round(zoom * 1.4)));
      targets.push(prepCanvas(img, top, bot, narrow, 'auto', Math.round(zoom * 1.4)));
      if (wide > narrow * 1.2) {
        targets.push(prepCanvas(img, top, bot, wide, 'binary', zoom));
        targets.push(prepCanvas(img, top, bot, wide, 'auto', zoom));
      }
      /* Протилежна полярність: буває, що підпис лежить на плашці,
         темнішій або світлішій за решту кадру, і автовибір
         помиляється. */
      targets.push(prepCanvas(img, top, bot, narrow, 'binary-flip', zoom));
    }

    /* Запасний варіант — просто верхівка кадру, без жодних здогадів
       про те, де там рядки. */
    const strip = Math.max(48, Math.round(H * 0.16));
    targets.push(prepCanvas(img, 0, strip, w, 'binary', 3));
    targets.push(prepCanvas(img, 0, strip, w, 'auto', 3));

    const ready = targets.filter(Boolean);
    if (!ready.length) {
      console.warn('[tf] у шапці не знайшлось жодного рядка тексту');
      return null;
    }

    const worker = await engine();

    for (const canvas of ready) {
      if (Date.now() > deadline) break;
      const { data } = await worker.recognize(canvas);
      const text = fixAmbiguousUnits(data).trim();
      log.push(text);
      const found = parse(text);
      if (found) {
        cache.set(src, found);
        return found;
      }
    }

    console.warn('[tf] TF у шапці не впізнано. Прочитано:', JSON.stringify(log));
    return null;
  } catch (e) {
    console.warn('[tf] не вдалось прочитати таймфрейм:', e?.message || e);
    return null;
  }
}
