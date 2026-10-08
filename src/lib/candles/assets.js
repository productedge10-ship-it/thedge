import { t as tx } from '../lang';

/* ==================================================================
   Що за інструмент: група (форекс, метали, індекси, крипта), назва
   людською мовою і з чого малювати логотип.
================================================================== */

const CCY = {
  USD: ['Долар США', 'U.S. Dollar', 'us'], EUR: ['Євро', 'Euro', 'eu'], GBP: ['Британський фунт', 'British Pound', 'gb'],
  JPY: ['Японська єна', 'Japanese Yen', 'jp'], CHF: ['Швейцарський франк', 'Swiss Franc', 'ch'], CAD: ['Канадський долар', 'Canadian Dollar', 'ca'],
  AUD: ['Австралійський долар', 'Australian Dollar', 'au'], NZD: ['Новозеландський долар', 'New Zealand Dollar', 'nz'],
  CNH: ['Китайський юань', 'Chinese Yuan', 'cn'], SGD: ['Сінгапурський долар', 'Singapore Dollar', 'sg'], HKD: ['Гонконзький долар', 'Hong Kong Dollar', 'hk'],
  NOK: ['Норвезька крона', 'Norwegian Krone', 'no'], SEK: ['Шведська крона', 'Swedish Krona', 'se'], MXN: ['Мексиканське песо', 'Mexican Peso', 'mx'],
  ZAR: ['Південноафриканський ранд', 'South African Rand', 'za'], TRY: ['Турецька ліра', 'Turkish Lira', 'tr'], PLN: ['Польський злотий', 'Polish Zloty', 'pl'],
};

const METALS = {
  XAU: ['Золото', 'Gold', 'Au', '#d4a72c'], XAG: ['Срібло', 'Silver', 'Ag', '#a8adb7'],
  XPT: ['Платина', 'Platinum', 'Pt', '#8fa3b0'], XPD: ['Паладій', 'Palladium', 'Pd', '#b9a07c'],
};

const CRYPTO = {
  BTC: ['Біткоїн', 'Bitcoin', '₿', '#f7931a'], ETH: ['Ефіріум', 'Ethereum', 'Ξ', '#627eea'], XRP: ['XRP', 'XRP', 'X', '#23292f'],
  SOL: ['Солана', 'Solana', 'S', '#9945ff'], LTC: ['Лайткоїн', 'Litecoin', 'Ł', '#345d9d'], ADA: ['Кардано', 'Cardano', 'A', '#0033ad'],
  DOGE: ['Доджкоїн', 'Dogecoin', 'Ð', '#c2a633'], BNB: ['BNB', 'BNB', 'B', '#f0b90b'],
};

const INDICES = {
  GER30: ['Німеччина 40 (DAX)', 'Germany 40 (DAX)', 'de'], GER40: ['Німеччина 40 (DAX)', 'Germany 40 (DAX)', 'de'], DE40: ['Німеччина 40 (DAX)', 'Germany 40 (DAX)', 'de'],
  FRA40: ['Франція 40 (CAC)', 'France 40 (CAC)', 'fr'], UK100: ['Британія 100 (FTSE)', 'UK 100 (FTSE)', 'gb'], EU50: ['Єврозона 50', 'Euro Stoxx 50', 'eu'],
  JP225: ['Японія 225 (Nikkei)', 'Japan 225 (Nikkei)', 'jp'], JPN225: ['Японія 225 (Nikkei)', 'Japan 225 (Nikkei)', 'jp'], AUS200: ['Австралія 200', 'Australia 200', 'au'],
  NDX100: ['Nasdaq 100', 'Nasdaq 100', 'us'], NAS100: ['Nasdaq 100', 'Nasdaq 100', 'us'], USTEC: ['Nasdaq 100', 'Nasdaq 100', 'us'],
  SPX500: ['S&P 500', 'S&P 500', 'us'], US500: ['S&P 500', 'S&P 500', 'us'], US30: ['Dow Jones 30', 'Dow Jones 30', 'us'],
};

export const GROUPS = [
  { id: 'forex', uk: 'Форекс', en: 'Forex' },
  { id: 'metals', uk: 'Метали', en: 'Metals' },
  { id: 'indices', uk: 'Індекси', en: 'Indices' },
  { id: 'crypto', uk: 'Крипта', en: 'Crypto' },
  { id: 'other', uk: 'Інше', en: 'Other' },
];

const ccyName = (c) => (CCY[c] ? tx(CCY[c][0], CCY[c][1]) : c);

export const flagUrl = (code) => `https://flagcdn.com/${code}.svg`;

/* { group, name, logo: { kind: 'pair'|'flag'|'coin', ... } } */
export function assetInfo(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/^SRV:/, '');
  const k = s.replace(/[^A-Z0-9]/g, '');
  if (INDICES[k]) {
    const [uk, en, flag] = INDICES[k];
    return { group: 'indices', name: tx(uk, en), logo: { kind: 'flag', flag } };
  }
  const base = Object.keys(CRYPTO).find((c) => k.startsWith(c));
  if (base) {
    const [uk, en, glyph, color] = CRYPTO[base];
    const q = k.slice(base.length, base.length + 3);
    return { group: 'crypto', name: `${tx(uk, en)} / ${ccyName(q)}`, logo: { kind: 'coin', glyph, color, quote: CCY[q]?.[2] } };
  }
  const m = k.match(/^([A-Z]{3})([A-Z]{3})/);
  if (m && METALS[m[1]]) {
    const [uk, en, glyph, color] = METALS[m[1]];
    return { group: 'metals', name: `${tx(uk, en)} / ${ccyName(m[2])}`, logo: { kind: 'coin', glyph, color, quote: CCY[m[2]]?.[2] } };
  }
  if (m && CCY[m[1]] && CCY[m[2]]) {
    return { group: 'forex', name: `${ccyName(m[1])} / ${ccyName(m[2])}`, logo: { kind: 'pair', a: CCY[m[1]][2], b: CCY[m[2]][2] } };
  }
  return { group: 'other', name: '', logo: { kind: 'text', text: k.slice(0, 2) } };
}
