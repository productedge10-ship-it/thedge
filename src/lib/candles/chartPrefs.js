import { CrosshairMode, ColorType, LineStyle } from 'lightweight-charts';
import { isEn } from '../lang';
import { fmtChartTime, fmtTick } from './timefmt';

/* ==================================================================
   Вигляд графіка — ті самі розділи, що й у налаштуваннях TradingView:
   Інструмент, Рядок статусу, Шкали і лінії, Оформлення, Торгівля.

   За замовчуванням на самому графіку нічого не написано: ні легенди,
   ні водяного знака, ні підписів угод. Хто звик до них у TV — вмикає
   галочкою, але чистий графік не має кричати, поки людина думає.

   Атрибуція бібліотеки (умова її ліцензії):
   TradingView Lightweight Charts™
   Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/
   Якщо логотип на графіку вимкнено, посилання на tradingview.com
   показує панель угоди — так вимога ліцензії виконана в обох станах.
================================================================== */

/* Колір у налаштуваннях — рядок CSS: «#rrggbb» або «rgba(r,g,b,a)». */
export function parseColor(c) {
  const s = String(c || '').trim();
  let m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
  return { r: 128, g: 128, b: 128, a: 1 };
}
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
export function toCss({ r, g, b, a }) {
  if (a >= 0.999) return toHex({ r, g, b });
  return `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`;
}
export const withAlpha = (c, a) => { const p = parseColor(c); return toCss({ ...p, a: p.a * a }); };

/* Наскільки світлий фон — від нього колір підписів поверх графіка. */
export function isLight(c) {
  const { r, g, b } = parseColor(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
}

/* Лише кольори — шаблон не має скидати галочки й поля людини. */
export const PRESETS = {
  tvDark: {
    bg: '#131722', bg2: '#131722', gridVColor: 'rgba(42,46,57,0.6)', gridHColor: 'rgba(42,46,57,0.6)', text: '#b2b5be', scaleLine: '#2a2e39',
    up: '#089981', down: '#f23645', wickUp: '#089981', wickDown: '#f23645', borderUp: '#089981', borderDown: '#f23645',
    crossColor: '#9598a1', watermarkColor: 'rgba(178,181,190,0.08)',
  },
  tvLight: {
    bg: '#ffffff', bg2: '#ffffff', gridVColor: 'rgba(240,243,250,1)', gridHColor: 'rgba(240,243,250,1)', text: '#131722', scaleLine: '#e0e3eb',
    up: '#089981', down: '#f23645', wickUp: '#089981', wickDown: '#f23645', borderUp: '#089981', borderDown: '#f23645',
    crossColor: '#9598a1', watermarkColor: 'rgba(19,23,34,0.07)',
  },
  edge: {
    bg: '#0a0a0c', bg2: '#0a0a0c', gridVColor: '#18181d', gridHColor: '#18181d', text: '#8e8e99', scaleLine: '#2e2e36',
    up: '#34d399', down: '#f87171', wickUp: '#34d399', wickDown: '#f87171', borderUp: '#34d399', borderDown: '#f87171',
    crossColor: '#8e8e99', watermarkColor: 'rgba(142,142,153,0.08)',
  },
  mono: {
    bg: '#ffffff', bg2: '#ffffff', gridVColor: 'rgba(0,0,0,0)', gridHColor: 'rgba(0,0,0,0)', text: '#131722', scaleLine: '#e0e3eb',
    up: '#c3c3c3', down: '#5d606b', wickUp: '#000000', wickDown: '#000000', borderUp: '#5d606b', borderDown: '#5d606b',
    crossColor: '#9598a1', watermarkColor: 'rgba(19,23,34,0.07)',
  },  /* Світлий «папір», як у трейдера на скріні: сірий фон без сітки,
     світлі й темні сірі свічки з темним контуром. */
  paper: {
    bg: '#f4f4f4', bg2: '#f4f4f4', gridVColor: 'rgba(0,0,0,0)', gridHColor: 'rgba(0,0,0,0)', text: '#3a3d46', scaleLine: '#d9dbe1',
    up: '#c6c7cc', down: '#5d606b', wickUp: '#2f3138', wickDown: '#2f3138', borderUp: '#5d606b', borderDown: '#3d4049',
    crossColor: '#9598a1', watermarkColor: 'rgba(19,23,34,0.06)',
  },
  /* Той самий папір, але свічки червоно-зелені. */
  paperColor: {
    bg: '#f4f4f4', bg2: '#f4f4f4', gridVColor: 'rgba(0,0,0,0)', gridHColor: 'rgba(0,0,0,0)', text: '#3a3d46', scaleLine: '#d9dbe1',
    up: '#26a69a', down: '#ef5350', wickUp: '#26a69a', wickDown: '#ef5350', borderUp: '#26a69a', borderDown: '#ef5350',
    crossColor: '#9598a1', watermarkColor: 'rgba(19,23,34,0.06)',
  },
  /* Власні: темно-синя «північ», мінімалістичний чорно-білий, Nord,
     неонова й теплий світлий Solarized. */
  midnight: {
    bg: '#0b1220', bg2: '#0b1220', gridVColor: 'rgba(56,72,104,0.22)', gridHColor: 'rgba(56,72,104,0.22)', text: '#8b9bb8', scaleLine: '#1c2740',
    up: '#2dd4bf', down: '#fb7185', wickUp: '#2dd4bf', wickDown: '#fb7185', borderUp: '#2dd4bf', borderDown: '#fb7185',
    crossColor: '#6b7a99', watermarkColor: 'rgba(139,155,184,0.07)',
  },
  noir: {
    bg: '#000000', bg2: '#000000', gridVColor: 'rgba(255,255,255,0.04)', gridHColor: 'rgba(255,255,255,0.04)', text: '#a1a1aa', scaleLine: '#1f1f23',
    up: '#000000', down: '#e4e4e7', wickUp: '#e4e4e7', wickDown: '#e4e4e7', borderUp: '#e4e4e7', borderDown: '#e4e4e7',
    crossColor: '#71717a', watermarkColor: 'rgba(255,255,255,0.05)',
  },
  nord: {
    bg: '#2e3440', bg2: '#2e3440', gridVColor: 'rgba(76,86,106,0.35)', gridHColor: 'rgba(76,86,106,0.35)', text: '#d8dee9', scaleLine: '#3b4252',
    up: '#a3be8c', down: '#bf616a', wickUp: '#a3be8c', wickDown: '#bf616a', borderUp: '#a3be8c', borderDown: '#bf616a',
    crossColor: '#81a1c1', watermarkColor: 'rgba(216,222,233,0.06)',
  },
  neon: {
    bg: '#120f1d', bg2: '#120f1d', gridVColor: 'rgba(124,92,255,0.08)', gridHColor: 'rgba(124,92,255,0.08)', text: '#b9b2d9', scaleLine: '#2a2340',
    up: '#00f5a0', down: '#ff3d81', wickUp: '#00f5a0', wickDown: '#ff3d81', borderUp: '#00f5a0', borderDown: '#ff3d81',
    crossColor: '#7c5cff', watermarkColor: 'rgba(185,178,217,0.06)',
  },
  solar: {
    bg: '#fdf6e3', bg2: '#fdf6e3', gridVColor: 'rgba(147,161,161,0.18)', gridHColor: 'rgba(147,161,161,0.18)', text: '#586e75', scaleLine: '#e6dfc8',
    up: '#2aa198', down: '#dc322f', wickUp: '#2aa198', wickDown: '#dc322f', borderUp: '#2aa198', borderDown: '#dc322f',
    crossColor: '#93a1a1', watermarkColor: 'rgba(88,110,117,0.07)',
  },
};

export const DEFAULT_PREFS = {
  ...PRESETS.tvDark,
  /* Інструмент */
  body: true, border: true, wick: true, prevCloseColor: false, precision: 'auto', tz: 'broker',
  /* Рядок статусу */
  stTitle: false, stOhlc: false, stChange: false, stButtons: false, logo: false,
  /* Шкали і лінії */
  lastPrice: 'both', prevDayClose: false, hiLo: false, weekday: true,
  dateFmt: "dd MMM 'yy", timeFmt: '24', keepLeft: false,
  /* Оформлення */
  bgType: 'solid', gridV: true, gridH: true, crosshair: 'normal', crossStyle: 'dashed',
  watermark: false, fontSize: 11, marginTop: 10, marginBottom: 8, rightOffset: 12,
  /* Торгівля */
  showPositions: true, showClosed: true, markerText: false, atrMult: 1, rr: 2,
  animCandles: true, animCut: true,
  /* Стан сторінки */
  tf: 'M15', speed: 2, symbol: '', panel: true,
};

const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function normalizePrefs(v) {
  const src = v && typeof v === 'object' ? v : {};
  const p = { ...DEFAULT_PREFS, ...src };
  /* Перша версія мала один колір сітки на обидва напрямки. */
  if (src.grid && !src.gridVColor) p.gridVColor = src.grid;
  if (src.grid && !src.gridHColor) p.gridHColor = src.grid;
  if (!src.bg2) p.bg2 = p.bg;
  p.fontSize = num(p.fontSize, 9, 16, 11);
  p.marginTop = num(p.marginTop, 0, 40, 10);
  p.marginBottom = num(p.marginBottom, 0, 40, 8);
  p.rightOffset = num(p.rightOffset, 0, 100, 12);
  p.atrMult = num(p.atrMult, 0.1, 10, 1);
  p.rr = num(p.rr, 0.1, 50, 2);
  return p;
}

const CROSS_STYLE = { solid: LineStyle.Solid, dotted: LineStyle.Dotted, dashed: LineStyle.Dashed, large: LineStyle.LargeDashed };

export function chartOptions(p) {
  const light = isLight(p.bg);
  const line = { color: p.crossColor, style: CROSS_STYLE[p.crossStyle] ?? LineStyle.Dashed, width: 1, labelBackgroundColor: light ? '#131722' : '#363a45' };
  return {
    layout: {
      background: p.bgType === 'gradient'
        ? { type: ColorType.VerticalGradient, topColor: p.bg, bottomColor: p.bg2 }
        : { type: ColorType.Solid, color: p.bg },
      textColor: p.text,
      fontSize: p.fontSize,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
      attributionLogo: !!p.logo,
      /* Розділювач панелей (RSI, MACD) — кольором шкал, а не білим. */
      /* Межа між панелями — темна й чітка, щоб графік знизу не зливався
         з основним (на світлій темі — помітно сіра). */
      panes: { separatorColor: light ? '#8f96a3' : '#3b4150', separatorHoverColor: 'rgba(41,98,255,0.55)', enableResize: true },
    },
    grid: {
      vertLines: { color: p.gridVColor, visible: !!p.gridV },
      horzLines: { color: p.gridHColor, visible: !!p.gridH },
    },
    crosshair: {
      mode: p.crosshair === 'magnet' ? CrosshairMode.Magnet : CrosshairMode.Normal,
      vertLine: line,
      horzLine: line,
    },
    rightPriceScale: { borderColor: p.scaleLine, scaleMargins: { top: p.marginTop / 100, bottom: p.marginBottom / 100 } },
    timeScale: {
      borderColor: p.scaleLine, timeVisible: true, secondsVisible: false, rightOffset: p.rightOffset,
      minBarSpacing: 0.5,
      tickMarkFormatter: (time, type) => fmtTick(time, type, p),
    },
    /* Мову й формат часу задаємо самі: інакше бібліотека бере
       navigator.language, а він буває екзотичним («en-US@posix») і
       валить форматування дат. */
    localization: {
      locale: isEn ? 'en-GB' : 'uk-UA',
      timeFormatter: (time) => fmtChartTime(time, p),
    },
    /* Як у TV: колесо — зум, тягнути — рух, тягнути шкалу — масштаб. */
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
    kineticScroll: { mouse: false, touch: true },
  };
}

export function seriesOptions(p, digits) {
  const prec = p.precision === 'auto' ? digits : num(p.precision, 0, 8, digits);
  /* Без тіла — порожнисті свічки, як у TV при знятій галочці «Тіло». */
  const clear = 'rgba(0,0,0,0)';
  return {
    upColor: p.body ? p.up : clear, downColor: p.body ? p.down : clear,
    wickVisible: !!p.wick, wickUpColor: p.wickUp, wickDownColor: p.wickDown,
    borderVisible: !!p.border, borderUpColor: p.borderUp, borderDownColor: p.borderDown,
    priceFormat: { type: 'price', precision: prec, minMove: 1 / 10 ** prec },
    priceLineVisible: p.lastPrice === 'both' || p.lastPrice === 'line',
    lastValueVisible: p.lastPrice === 'both' || p.lastPrice === 'value',
  };
}

/* Які ключі вимагають перемалювати дані (а не лише опції). */
export const DATA_KEYS = ['prevCloseColor', 'up', 'down', 'wickUp', 'wickDown', 'borderUp', 'borderDown', 'body'];
