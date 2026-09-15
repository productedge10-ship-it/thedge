import { useState } from 'react';

/* ==================================================================
   Знак активу.

   ------------------------------------------------------------------
   Чому змінили пак прапорів

   Раніше тут стояв flagcdn — прямокутні прапори, обрізані в коло
   через `object-cover`. Обрізання не буває безкоштовним: у прапора ЄС
   зникали крайні зірки, у японського лишався самий червоний круг без
   білого поля, а швейцарський перетворювався на червоний кружок із
   шматком хреста. Впізнати валюту по такому знаку неможливо — тобто
   іконка робила рівно протилежне тому, навіщо стоїть.

   circle-flags намальовані КРУГЛИМИ з самого початку: композиція в
   кожному підігнана під круг, а не відрізана по ньому. Ліцензія MIT.

   Беремо їх з npm-дзеркала, а не з гілки gh-pages на GitHub: у
   репозиторії `eu.svg` і `un.svg` — це симлінки, і CDN віддає за ними
   текст «european_union.svg» замість картинки. У npm-пакеті симлінки
   вже розгорнуті. Версію фіксуємо мажорною: латки приходять самі,
   а зміна композиції — ні.
================================================================== */

const FLAGS = 'https://cdn.jsdelivr.net/npm/circle-flags@2/flags';
const COINS = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

export const CURRENCY_TO_FLAG = {
  USD: 'us', EUR: 'eu', GBP: 'gb', JPY: 'jp', AUD: 'au',
  CAD: 'ca', CHF: 'ch', NZD: 'nz', CNH: 'cn', CNY: 'cn',
  HKD: 'hk', SGD: 'sg', MXN: 'mx', NOK: 'no', SEK: 'se',
  DKK: 'dk', PLN: 'pl', TRY: 'tr', ZAR: 'za', INR: 'in',
  BRL: 'br', KRW: 'kr', CZK: 'cz', HUF: 'hu', RUB: 'ru',
  THB: 'th', ILS: 'il', CLP: 'cl',
};

/* Індекси — це теж країна, просто названа біржею. Прапор читається
   швидше за тікер: «US30» і «NAS100» відрізняються трьома символами,
   а два однакові прапори на списку видно з іншого кінця екрана. */
const INDEX_TO_FLAG = [
  [/^(US30|DJI|DOW|US100|NAS|NDX|US500|SPX|SP500|USTEC|US2000|RUT)/, 'us'],
  [/^(GER|DAX|DE30|DE40)/, 'de'],
  [/^(UK100|FTSE|GB100)/, 'gb'],
  [/^(JP225|NIKKEI|NI225)/, 'jp'],
  [/^(FRA40|CAC)/, 'fr'],
  [/^(ESP35|IBEX)/, 'es'],
  [/^(ITA40|MIB)/, 'it'],
  [/^(AUS200|ASX)/, 'au'],
  [/^(HK50|HSI)/, 'hk'],
  [/^(CHINA50|CN50|SHANGHAI)/, 'cn'],
  [/^(EU50|STOXX|SX5E)/, 'eu'],
  [/^(SWI20|SMI)/, 'ch'],
  [/^(IND50|NIFTY|BANKNIFTY)/, 'in'],
  [/^(KOSPI|KR200)/, 'kr'],
];

/* Індекси валют — знак валюти, а не прапор.

   DXY це кошик із шести валют, де долар лише одна зі сторін. Поставити
   йому американський прапор означало б зрівняти його з US30, хоча це
   різні речі: індекс долара росте й тоді, коли американський ринок
   падає. Знак валюти читається однозначно й ні з чим не плутається. */
const CURRENCY_INDEX = [
  /* Без двокрапки: сюди приходить уже очищений тікер, тож «TVC:DXY»
     з TradingView виглядає як «TVCDXY». */
  [/^(DXY|USDX|USDIDX|DX|TVCDXY)$/, { text: '$', from: '#4ade80', to: '#15803d', ink: '#04240f' }],
  [/^(EXY|EURX|EURIDX)$/, { text: '€', from: '#7aa7f0', to: '#1e40af', ink: '#04122e' }],
  [/^(JXY|JPYX)$/, { text: '¥', from: '#f08a8a', to: '#9f1239', ink: '#2e0410' }],
  [/^(BXY|GBPX)$/, { text: '£', from: '#b79af0', to: '#5b21b6', ink: '#180430' }],
];

/* Метали своїм кольором, а не прапором: у золота немає країни, і
   будь-який прапор тут був би вигадкою. */
const METALS = {
  XAU: { text: 'Au', from: '#f6cf6a', to: '#b8860b', ink: '#3a2a05' },
  XAG: { text: 'Ag', from: '#e2e6ea', to: '#9aa3ab', ink: '#2b3036' },
  XPT: { text: 'Pt', from: '#dfe6ea', to: '#8d9aa3', ink: '#242b31' },
  XPD: { text: 'Pd', from: '#cfd6cf', to: '#87907f', ink: '#22261f' },
  XCU: { text: 'Cu', from: '#e6a071', to: '#a9613a', ink: '#301709' },
};

/* ------------------------------------------------------------------
   Кому дістається рух

   Список нарочито короткий. Коли ворушиться кожен рядок, око не
   чіпляється ні за що — і замість того, щоб упізнавати актив
   миттєво, людина починає читати тікери буквами. Рух тут працює як
   закладка в книжці: він корисний рівно доти, доки закладок кілька.

   Ці пʼять — те, що в цьому журналі відкривають найчастіше.
------------------------------------------------------------------ */
const SHINE = /^(XAU|GOLD|XAUUSD|GER40|GER30|DE40|DE30|DAX)/;
const TUG = /^(EURUSD|GBPUSD)$/;

/* Полиск: світла смуга, що проходить навскіс. Колір різний — у
   золота теплий, у німецького індексу золотий з прапора. */
function Shine({ warm }) {
  return (
    <span
      className="edge-icon-shine"
      style={{
        background: warm
          ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.75), transparent)'
          : 'linear-gradient(90deg, transparent, rgba(255,206,0,0.55), transparent)',
      }}
    />
  );
}

/* Розмір задається одним числом, решта рахується від нього — інакше
   при зміні розміру пара прапорів роз'їжджається. */
function sizing(size) {
  return {
    box: size,
    overlap: Math.round(size * 0.58),
    ring: Math.max(1.5, Math.round(size * 0.08)),
  };
}

/* Кружок із двох літер. Потрібен не «на всяк випадок», а постійно:
   екзотичних тікерів більше, ніж будь-який пак картинок покриває, і
   порожня дірка в рядку гірша за монограму. */
function Monogram({ text, size, tone = '139,123,255' }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-black uppercase"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        letterSpacing: '-0.02em',
        color: `rgb(${tone})`,
        background: `rgba(${tone},0.14)`,
        border: `1px solid rgba(${tone},0.3)`,
      }}
    >
      {String(text || '?').slice(0, 3)}
    </span>
  );
}

/* Прапор із запасним варіантом. Картинка може не приїхати (немає
   такого коду, CDN ліг), і тоді на її місці стає монограма — а не
   значок «зламано», який ламає висоту рядка. */
function Flag({ code, label, size, ring, style, className }) {
  const [broken, setBroken] = useState(false);

  if (broken || !code) {
    return (
      <span className={className} style={{ ...style, display: 'grid', placeItems: 'center' }}>
        <Monogram text={label} size={size} tone="120,125,140" />
      </span>
    );
  }

  return (
    <img
      src={`${FLAGS}/${code}.svg`}
      alt={label}
      loading="lazy"
      className={className}
      onError={() => setBroken(true)}
      style={{
        ...style,
        width: size,
        height: size,
        borderRadius: '50%',
        /* Саме `contain`: круглий прапор уже вписаний у квадрат, і
           `cover` тут знову почав би різати краї. */
        objectFit: 'contain',
        background: 'var(--edge-bg, #0A0A0C)',
        boxShadow: `0 0 0 ${ring}px var(--edge-bg, #0A0A0C)`,
      }}
    />
  );
}

export default function AssetIcon({ symbol, category, size = 24 }) {
  const raw = String(symbol || '').toUpperCase().trim();
  const clean = raw.replace(/[^A-Z0-9]/g, '');
  const cat = String(category || '').toLowerCase();
  const { overlap, ring } = sizing(size);

  /* --- крипта --- */
  if (cat.includes('crypto') || /^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|AVAX|DOT|LINK|LTC|TRX|MATIC|TON)/.test(clean)) {
    /* Зрізаємо валюту котирування. Без цього «ETHUSD» без роздільника
       перетворювався на монету «ethusd», якої в паку немає, — і
       замість ефіру показувалась монограма. */
    const coin = (raw.split(/[/\-_]/)[0] || clean)
      .replace(/(USDT|USDC|BUSD|PERP|USD|EUR|GBP)$/i, '')
      .toLowerCase() || clean.slice(0, 3).toLowerCase();

    return (
      <CoinIcon coin={coin} label={raw} size={size} />
    );
  }

  /* --- індекси валют --- */
  const ccyIndex = CURRENCY_INDEX.find(([re]) => re.test(clean))?.[1];

  /* --- метали --- */
  const metal = METALS[clean.slice(0, 3)] || (clean.includes('GOLD') ? METALS.XAU : null)
    || (clean.includes('SILVER') ? METALS.XAG : null);

  const disc = ccyIndex || metal;
  if (disc) {
    return (
      <span
        className={`edge-icon relative grid shrink-0 place-items-center overflow-hidden rounded-full font-black${
          ccyIndex?.text === '$' ? ' edge-icon-flip' : ''
        }${SHINE.test(clean) ? ' edge-icon-pop' : ''}`}
        style={{
          width: size,
          height: size,
          /* Знак валюти ставимо крупніше за дволітерний символ металу:
             «$» сам по собі вужчий, і в тому ж кеглі виглядав би
             загубленим у кружку. */
          fontSize: Math.round(size * (ccyIndex ? 0.5 : 0.36)),
          lineHeight: 1,
          color: disc.ink,
          background: `linear-gradient(140deg, ${disc.from} 0%, ${disc.to} 100%)`,
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.45)',
        }}
      >
        {SHINE.test(clean) && <Shine warm />}
        <span className="relative">{disc.text}</span>
      </span>
    );
  }

  /* --- нафта --- */
  if (/(WTI|BRENT|CRUDE|USOIL|UKOIL|OIL|NGAS|NATGAS)/.test(clean)) {
    const gas = /(NGAS|NATGAS)/.test(clean);
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          background: gas
            ? 'linear-gradient(140deg, #6fd0e8 0%, #2a7f96 100%)'
            : 'linear-gradient(140deg, #4a4f57 0%, #14161a 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3c3.6 4.2 6 7.3 6 10.2A6 6 0 0 1 6 13.2C6 10.3 8.4 7.2 12 3Z"
            fill={gas ? '#08323d' : '#e8c766'}
          />
        </svg>
      </span>
    );
  }

  /* --- індекси --- */
  /* Ознака валютної пари — шість ЛІТЕР, а не шість символів. Спершу
     тут стояла довжина, і через це «NAS100» та «AUS200» пролітали повз
     індекси й діставались монограми: у них теж рівно шість знаків.
     У валютній парі цифр не буває ніколи. */
  const isPair = /^[A-Z]{6}$/.test(clean);

  const index = INDEX_TO_FLAG.find(([re]) => re.test(clean));
  if (index && !isPair) {
    return (
      <span
        className={`edge-icon relative shrink-0 overflow-hidden rounded-full${
          SHINE.test(clean) ? ' edge-icon-pop' : ''
        }`}
        style={{ width: size, height: size }}
      >
        <Flag code={index[1]} label={raw} size={size} ring={0} />
        {SHINE.test(clean) && <Shine />}
      </span>
    );
  }

  /* --- валютна пара --- */
  const base = clean.slice(0, 3);
  const quote = clean.slice(3, 6);
  if ((cat.includes('forex') || isPair) && CURRENCY_TO_FLAG[base] && CURRENCY_TO_FLAG[quote]) {
    return (
      <span
        className="edge-icon relative shrink-0 select-none"
        style={{ width: overlap + size, height: size }}
      >
        <Flag
          code={CURRENCY_TO_FLAG[base]}
          label={base}
          size={size}
          ring={ring}
          className={TUG.test(clean) ? 'edge-icon-clash-a' : undefined}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 2 }}
        />
        <Flag
          code={CURRENCY_TO_FLAG[quote]}
          label={quote}
          size={size}
          ring={ring}
          className={TUG.test(clean) ? 'edge-icon-clash-b' : undefined}
          style={{ position: 'absolute', left: overlap, top: 0, zIndex: 1 }}
        />
      </span>
    );
  }

  /* --- одна валюта --- */
  if (CURRENCY_TO_FLAG[clean]) {
    return <Flag code={CURRENCY_TO_FLAG[clean]} label={clean} size={size} ring={0} />;
  }

  return <Monogram text={clean || '?'} size={size} />;
}

/* Монета з власним запасним варіантом: пак покриває перші кілька
   сотень тикерів, а їх десятки тисяч. */
function CoinIcon({ coin, label, size }) {
  const [broken, setBroken] = useState(false);

  if (broken) return <Monogram text={label} size={size} tone="240,185,90" />;

  return (
    <img
      src={`${COINS}/${coin}.svg`}
      alt={label}
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
