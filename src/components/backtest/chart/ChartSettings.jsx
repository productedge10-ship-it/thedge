import { useEffect, useRef, useState } from 'react';
import {
  X, CandlestickChart, AlignLeft, Ruler, Paintbrush, ArrowLeftRight, Check, ChevronDown, PencilLine,
} from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx, isEn } from '../../../lib/lang';
import Button from '../../ui/Button';
import ColorPicker from './ColorPicker';
import { Select, usePopover, PopPanel } from './Popover';
import { PRESETS, DEFAULT_PREFS } from '../../../lib/candles/chartPrefs';
import { TIMEZONES, DATE_FORMATS, fmtDate } from '../../../lib/candles/timefmt';

/* ==================================================================
   Налаштування графіка — розділи й поведінка як у TradingView:
   зміни видно одразу під вікном, «Скасувати» повертає як було,
   «Ок» лишає. «Шаблон» міняє лише кольори, а не галочки.
================================================================== */

const SECTIONS = [
  { id: 'inst', icon: CandlestickChart, uk: 'Інструмент', en: 'Symbol' },
  { id: 'status', icon: AlignLeft, uk: 'Рядок статусу', en: 'Status line' },
  { id: 'scales', icon: Ruler, uk: 'Шкали і лінії', en: 'Scales and lines' },
  { id: 'canvas', icon: Paintbrush, uk: 'Оформлення', en: 'Canvas' },
  { id: 'trading', icon: ArrowLeftRight, uk: 'Торгівля', en: 'Trading' },
  { id: 'drawing', icon: PencilLine, uk: 'Малювання', en: 'Drawing' },
];

function Box({ on, onChange, label, hint, disabled }) {
  return (
    <label className={`flex min-w-0 items-start gap-3 py-2 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <span
        className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] transition-colors"
        style={{ background: on ? '#2962ff' : 'transparent', border: `1.5px solid ${on ? '#2962ff' : T.lineInput}` }}
      >
        {on && <Check size={13} strokeWidth={3} color="#fff" />}
      </span>
      <input type="checkbox" className="sr-only" checked={!!on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-[14px]" style={{ color: T.text }}>{label}</span>
        {hint && <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: T.text3 }}>{hint}</span>}
      </span>
    </label>
  );
}

/* Число комітимо на виході з поля: інакше стерта цифра одразу
   ставала нулем і графік смикався на кожне натискання. */
function NumField({ value, onChange, suffix, min = 0, max = 100, step = 1 }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  const commit = () => {
    const n = Number(String(v).replace(',', '.'));
    if (Number.isFinite(n) && v !== '') onChange(Math.max(min, Math.min(max, n)));
    else setV(String(value));
  };
  return (
    <span className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const n = (Number(v) || 0) + (e.key === 'ArrowUp' ? step : -step); onChange(Math.max(min, Math.min(max, Math.round(n * 100) / 100))); } }}
        className="h-9 w-[92px] rounded-lg px-3 text-[13.5px] tabular-nums outline-none"
        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono }}
      />
      {suffix && <span className="text-[13px]" style={{ color: T.text3 }}>{suffix}</span>}
    </span>
  );
}

/* Рядок «підпис — керування». З галочкою зліва, якщо її передано. */
function Row({ label, on, onToggle, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-1.5">
      {onToggle ? (
        <Box on={on} onChange={onToggle} label={label} />
      ) : (
        <span className="text-[14px]" style={{ color: T.text }}>{label}</span>
      )}
      <span className="flex items-center gap-2" style={{ opacity: onToggle && !on ? 0.4 : 1 }}>{children}</span>
    </div>
  );
}

/* Картка теми: маленький графік у її кольорах. */
const DEMO = [[30, 22, 34, 18], [22, 26, 30, 19], [26, 16, 28, 14], [16, 20, 23, 13], [20, 12, 22, 9], [12, 15, 18, 10], [15, 8, 17, 6], [8, 11, 14, 5], [11, 6, 12, 3]];
function ThemeCard({ th, label, on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-xl text-left transition-transform active:scale-[0.98]"
      style={{ border: `1.5px solid ${on ? '#2962ff' : T.line}`, boxShadow: on ? '0 0 0 3px rgba(41,98,255,0.18)' : 'none' }}
    >
      <svg viewBox="0 0 120 52" className="block h-[60px] w-full" style={{ background: th.bg }} aria-hidden>
        {[13, 26, 39].map((y) => <line key={y} x1="0" y1={y} x2="120" y2={y} stroke={th.gridHColor} strokeWidth="0.6" />)}
        {DEMO.map(([o, c, w1, w2], i) => {
          const h = Math.min(o, c) - (w1 % 5) - 1; const l = Math.max(o, c) + (w2 % 4) + 1;
          const up = c < o; // у SVG менше y — вище ціна
          const x = 10 + i * 12;
          return (
            <g key={i}>
              <line x1={x} y1={h + 6} x2={x} y2={l + 6} stroke={up ? th.wickUp : th.wickDown} strokeWidth="1" />
              <rect x={x - 3.5} y={Math.min(o, c) + 6} width="7" height={Math.max(1.5, Math.abs(o - c))} fill={up ? th.up : th.down} stroke={up ? th.borderUp : th.borderDown} strokeWidth="0.8" />
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between px-2.5 py-1.5 text-[12.5px] font-semibold" style={{ background: T.sunken, color: on ? '#fff' : T.text2 }}>
        {label}
        {on && <Check size={13} color="#5b8cff" strokeWidth={3} />}
      </div>
    </button>
  );
}

const Head = ({ children }) => (
  <div className="mb-1 mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] first:mt-0" style={{ color: T.text3 }}>{children}</div>
);

const Pair = ({ p, set, a, b, label }) => (
  <>
    <ColorPicker value={p[a]} onChange={(v) => set({ [a]: v })} label={`${label} ↑`} />
    <ColorPicker value={p[b]} onChange={(v) => set({ [b]: v })} label={`${label} ↓`} />
  </>
);

export default function ChartSettings({ prefs, onChange, onClose }) {
  const [tab, setTab] = useState('inst');
  const tplPop = usePopover();
  const snapshot = useRef(prefs);
  const p = prefs;
  const set = (patch) => onChange({ ...p, ...patch });

  const cancel = () => { onChange(snapshot.current); onClose(); };

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const templates = [
    ['tvDark', tx('TradingView темна', 'TradingView dark')],
    ['tvLight', tx('TradingView світла', 'TradingView light')],
    ['edge', 'THE EDGE'],
    ['mono', tx('Монохром', 'Monochrome')],
    ['paper', tx('Папір · сірі', 'Paper · grey')],
    ['paperColor', tx('Папір · кольорові', 'Paper · color')],
    ['midnight', tx('Північ', 'Midnight')],
    ['noir', 'Noir'],
    ['nord', 'Nord'],
    ['neon', tx('Неон', 'Neon')],
    ['solar', 'Solarized'],
  ];
  /* Яка тема зараз — якщо кольори збігаються з нею повністю. */
  const themeOf = (q) => templates.find(([id]) => Object.entries(PRESETS[id]).every(([k, v]) => q[k] === v))?.[0];
  const curTheme = themeOf(p);

  const sample = { y: 2026, mo: 9, d: 6 };

  const body = {
    inst: (
      <>
        <Head>{tx('Японські свічки', 'Candles')}</Head>
        <Box on={p.prevCloseColor} onChange={(v) => set({ prevCloseColor: v })} label={tx('Колір барів за попереднім закриттям', 'Color bars based on previous close')} />
        <Row label={tx('Тіло', 'Body')} on={p.body} onToggle={(v) => set({ body: v })}><Pair p={p} set={set} a="up" b="down" label={tx('Тіло', 'Body')} /></Row>
        <Row label={tx('Рамки', 'Borders')} on={p.border} onToggle={(v) => set({ border: v })}><Pair p={p} set={set} a="borderUp" b="borderDown" label={tx('Рамки', 'Borders')} /></Row>
        <Row label={tx('Ґноти', 'Wick')} on={p.wick} onToggle={(v) => set({ wick: v })}><Pair p={p} set={set} a="wickUp" b="wickDown" label={tx('Ґноти', 'Wick')} /></Row>

        <Head>{tx('Налаштування даних', 'Data modification')}</Head>
        <Row label={tx('Точність', 'Precision')}>
          <Select
            value={String(p.precision)}
            onChange={(v) => set({ precision: v === 'auto' ? 'auto' : Number(v) })}
            options={[['auto', tx('За замовчуванням', 'Default')], ...[0, 1, 2, 3, 4, 5].map((d) => [String(d), d === 0 ? '1' : `1/${10 ** d}`])]}
          />
        </Row>
        <Row label={tx('Часовий пояс', 'Timezone')}>
          <Select value={p.tz} onChange={(v) => set({ tz: v })} options={TIMEZONES.map((z) => [z.id, isEn ? z.en : z.uk])} width={200} />
        </Row>
        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: T.text3 }}>
          {tx('Пояс міняє лише підписи часу. Межі свічок лишаються як у твоєму MT5.', 'The timezone only changes labels. Candle boundaries stay as in your MT5.')}
        </p>
      </>
    ),
    status: (
      <>
        <Head>{tx('Інструмент', 'Symbol')}</Head>
        <Box on={p.stTitle} onChange={(v) => set({ stTitle: v })} label={tx('Назва й таймфрейм', 'Title and timeframe')} />
        <Box on={p.stOhlc} onChange={(v) => set({ stOhlc: v })} label={tx('Значення OHLC', 'OHLC values')} />
        <Box on={p.stChange} onChange={(v) => set({ stChange: v })} label={tx('Зміна бару', 'Bar change values')} />
        <Box on={p.stButtons} onChange={(v) => set({ stButtons: v })} label={tx('Кнопки Buy / Sell', 'Buy / Sell buttons')} hint={tx('Кнопки входу прямо на графіку, як у TradingView.', 'Entry buttons right on the chart, like TradingView.')} />
        <Head>{tx('Графік', 'Chart')}</Head>
        <Box
          on={p.logo}
          onChange={(v) => set({ logo: v })}
          label={tx('Логотип TradingView', 'TradingView logo')}
          hint={tx('Коли вимкнено, посилання на TradingView стоїть унизу панелі угоди — так вимагає ліцензія бібліотеки графіків.', 'When off, the TradingView link sits at the bottom of the trade panel — the chart library licence requires it.')}
        />
      </>
    ),
    scales: (
      <>
        <Head>{tx('Мітки й лінії ціни', 'Price labels & lines')}</Head>
        <Row label={tx('Остання ціна', 'Symbol last price')}>
          <Select
            value={p.lastPrice}
            onChange={(v) => set({ lastPrice: v })}
            options={[['both', tx('Значення і лінія', 'Value and line')], ['value', tx('Лише значення', 'Value only')], ['line', tx('Лише лінія', 'Line only')], ['none', tx('Приховано', 'Hidden')]]}
          />
        </Row>
        <Box on={p.prevDayClose} onChange={(v) => set({ prevDayClose: v })} label={tx('Закриття попереднього дня', 'Previous day close')} />
        <Box on={p.hiLo} onChange={(v) => set({ hiLo: v })} label={tx('Макс. і мін. видимої ділянки', 'High and low of visible range')} />
        <Head>{tx('Шкала часу', 'Time scale')}</Head>
        <Box on={p.weekday} onChange={(v) => set({ weekday: v })} label={tx('День тижня на мітках', 'Day of week on labels')} />
        <Row label={tx('Формат дати', 'Date format')}>
          <Select value={p.dateFmt} onChange={(v) => set({ dateFmt: v })} options={DATE_FORMATS.map((f) => [f, fmtDate(sample, f)])} />
        </Row>
        <Row label={tx('Формат часу', 'Time hours format')}>
          <Select value={p.timeFmt} onChange={(v) => set({ timeFmt: v })} options={[['24', tx('24 години', '24-hours')], ['12', tx('12 годин', '12-hours')]]} width={140} />
        </Row>
        <Box on={p.keepLeft} onChange={(v) => set({ keepLeft: v })} label={tx('Зберігати лівий край при зміні інтервалу', 'Save chart left edge position when changing interval')} />
      </>
    ),
    canvas: (
      <>
        <Head>{tx('Теми', 'Themes')}</Head>
        <div className="grid grid-cols-2 gap-2 pb-1 sm:grid-cols-3">
          {templates.map(([id, label]) => <ThemeCard key={id} th={PRESETS[id]} label={label} on={curTheme === id} onClick={() => set(PRESETS[id])} />)}
        </div>
        <Head>{tx('Основний стиль графіка', 'Chart basic styles')}</Head>
        <Row label={tx('Фон', 'Background')}>
          <Select value={p.bgType} onChange={(v) => set({ bgType: v })} options={[['solid', tx('Суцільний', 'Solid')], ['gradient', tx('Градієнт', 'Gradient')]]} width={140} />
          <ColorPicker value={p.bg} onChange={(v) => set({ bg: v })} label={tx('Фон', 'Background')} />
          {p.bgType === 'gradient' && <ColorPicker value={p.bg2} onChange={(v) => set({ bg2: v })} label={tx('Фон знизу', 'Background bottom')} />}
        </Row>
        <Row label={tx('Вертикальні лінії сітки', 'Vert grid lines')} on={p.gridV} onToggle={(v) => set({ gridV: v })}>
          <ColorPicker value={p.gridVColor} onChange={(v) => set({ gridVColor: v })} label={tx('Вертикальна сітка', 'Vert grid')} disabled={!p.gridV} />
        </Row>
        <Row label={tx('Горизонтальні лінії сітки', 'Horz grid lines')} on={p.gridH} onToggle={(v) => set({ gridH: v })}>
          <ColorPicker value={p.gridHColor} onChange={(v) => set({ gridHColor: v })} label={tx('Горизонтальна сітка', 'Horz grid')} disabled={!p.gridH} />
        </Row>
        <Row label={tx('Перехрестя', 'Crosshair')}>
          <ColorPicker value={p.crossColor} onChange={(v) => set({ crossColor: v })} label={tx('Перехрестя', 'Crosshair')} />
          <Select value={p.crossStyle} onChange={(v) => set({ crossStyle: v })} options={[['dashed', '- - - -'], ['dotted', '· · · · ·'], ['large', '— — —'], ['solid', '————']]} width={110} />
          <Select value={p.crosshair} onChange={(v) => set({ crosshair: v })} options={[['normal', tx('Вільне', 'Free')], ['magnet', tx('Магніт', 'Magnet')]]} width={110} />
        </Row>
        <Row label={tx('Водяний знак', 'Watermark')}>
          <Select value={p.watermark ? 'on' : 'off'} onChange={(v) => set({ watermark: v === 'on' })} options={[['off', tx('Приховано', 'Hidden')], ['on', tx('Інструмент і таймфрейм', 'Symbol and timeframe')]]} width={200} />
          <ColorPicker value={p.watermarkColor} onChange={(v) => set({ watermarkColor: v })} label={tx('Водяний знак', 'Watermark')} disabled={!p.watermark} />
        </Row>
        <Head>{tx('Шкали', 'Scales')}</Head>
        <Row label={tx('Текст', 'Text')}>
          <ColorPicker value={p.text} onChange={(v) => set({ text: v })} label={tx('Текст шкал', 'Scale text')} />
          <Select value={String(p.fontSize)} onChange={(v) => set({ fontSize: Number(v) })} options={[10, 11, 12, 13, 14, 16].map((n) => [String(n), String(n)])} width={84} />
        </Row>
        <Row label={tx('Лінії', 'Lines')}>
          <ColorPicker value={p.scaleLine} onChange={(v) => set({ scaleLine: v })} label={tx('Лінії шкал', 'Scale lines')} />
        </Row>
        <Head>{tx('Поля', 'Margins')}</Head>
        <Row label={tx('Зверху', 'Top')}><NumField value={p.marginTop} onChange={(v) => set({ marginTop: v })} suffix="%" max={40} /></Row>
        <Row label={tx('Знизу', 'Bottom')}><NumField value={p.marginBottom} onChange={(v) => set({ marginBottom: v })} suffix="%" max={40} /></Row>
        <Row label={tx('Справа', 'Right')}><NumField value={p.rightOffset} onChange={(v) => set({ rightOffset: v })} suffix={tx('бари', 'bars')} /></Row>
      </>
    ),
    trading: (
      <>
        <Head>{tx('На графіку', 'On chart')}</Head>
        <Box on={p.showPositions} onChange={(v) => set({ showPositions: v })} label={tx('Відкрита позиція', 'Open position')} hint={tx('Зони ризику й прибутку, лінії SL і TP.', 'Risk and reward zones, SL and TP lines.')} />
        <Box on={p.showClosed} onChange={(v) => set({ showClosed: v })} label={tx('Закриті угоди', 'Closed trades')} />
        <Box on={p.markerText} onChange={(v) => set({ markerText: v })} label={tx('Підписи', 'Labels')} hint={tx('Buy / Sell, SL, TP і результат у R прямо на графіку.', 'Buy / Sell, SL, TP and the result in R on the chart.')} />
        <Head>{tx('Нова угода', 'New trade')}</Head>
        <Row label={tx('Стоп', 'Stop')}><NumField value={p.atrMult} onChange={(v) => set({ atrMult: v })} suffix="× ATR(14)" min={0.1} max={10} step={0.1} /></Row>
        <Row label={tx('Тейк', 'Target')}><NumField value={p.rr} onChange={(v) => set({ rr: v })} suffix="R" min={0.1} max={50} step={0.5} /></Row>
        <Row label={tx('Ризик на угоду', 'Risk per trade')}><NumField value={p.riskPct ?? 1} onChange={(v) => set({ riskPct: v })} suffix={tx('% балансу', '% of balance')} min={0.01} max={100} step={0.25} /></Row>
        <Box on={p.oneClick} onChange={(v) => set({ oneClick: v })} label={tx('Вхід в один клік', 'One-click trading')} hint={tx('Buy / Sell одразу відкривають угоду, без чернетки на графіку.', 'Buy / Sell open at once, without a draft on the chart.')} />
        <Head>{tx('Новини', 'News')}</Head>
        <Box on={p.news !== false} onChange={(v) => set({ news: v })} label={tx('Економічні новини на графіку', 'Economic events on chart')} hint={tx('Значки внизу графіка на свічці виходу новини. У реплеї — лише ті, що вже вийшли; наведи, щоб побачити факт, прогноз і попереднє.', 'Icons at the bottom on the candle of the release. In replay only already released ones; hover for actual, forecast and previous.')} />
        <Row label={tx('Важливість', 'Impact')}>
          <Select value={p.newsImpact || 'medium'} onChange={(v) => set({ newsImpact: v })} options={[['high', tx('Лише висока', 'High only')], ['medium', tx('Висока й середня', 'High and medium')], ['all', tx('Усі', 'All')]]} width={180} />
        </Row>
        <Head>{tx('Реплей', 'Replay')}</Head>
        <Box on={p.animCandles} onChange={(v) => set({ animCandles: v })} label={tx('Свічки формуються наживо', 'Candles build up live')} hint={tx('Нова свічка росте так, як рухалась ціна всередині неї.', 'Each new candle grows the way price moved inside it.')} />
        <Box on={p.animCut} onChange={(v) => set({ animCut: v })} label={tx('Анімація ножиць', 'Scissors animation')} />
      </>
    ),
    drawing: (
      <>
        <Head>{tx('Інструменти', 'Tools')}</Head>
        <Box
          on={p.drawStay}
          onChange={(v) => set({ drawStay: v })}
          label={tx('Режим малювання (як «Stay in drawing mode» у TV)', 'Stay in drawing mode')}
          hint={tx('Увімкнено — будь-який інструмент лишається вибраним після фігури, до Esc або іншого інструмента. Вимкнено — як у TradingView: одна фігура, і назад до курсора. Пензель і маркер лишаються завжди.', 'On — every tool stays selected after a shape until Esc or another tool. Off — like TradingView: one shape, then back to the cursor. Brush and highlighter always stay.')}
        />
        <Box
          on={p.favBar !== false}
          onChange={(v) => set({ favBar: v })}
          label={tx('Панель обраних інструментів', 'Favorites toolbar')}
          hint={tx('Зірочка біля інструмента в лівому меню додає його сюди. Панель можна перетягувати по графіку.', 'Star a tool in the left menu to add it. Drag the bar anywhere on the chart.')}
        />
      </>
    ),
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,0.22)' }} onMouseDown={cancel}>
      <div
        className="flex h-[min(640px,92dvh)] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', animation: 'edgeChartPop .22s cubic-bezier(.22,1,.36,1)' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={tx('Налаштування графіка', 'Chart settings')}
      >
        <style>{'@keyframes edgeChartPop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}'}</style>
        <div className="flex items-center justify-between px-5 pb-3 pt-4 sm:px-6">
          <h3 className="text-[18px] font-bold" style={{ color: T.text }}>{tx('Налаштування', 'Settings')}</h3>
          <button type="button" onClick={cancel} className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/5" style={{ color: T.text3 }} aria-label={tx('Закрити', 'Close')}>
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2 sm:w-[220px] sm:flex-col sm:overflow-visible sm:px-4">
            {SECTIONS.map((s) => {
              const on = tab === s.id;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTab(s.id)}
                  className="flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors"
                  style={{ background: on ? T.surfaceHi : 'transparent', color: on ? T.text : T.text2, fontWeight: on ? 700 : 500 }}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  {isEn ? s.en : s.uk}
                </button>
              );
            })}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:pl-4 sm:pr-7">
            {body[tab]}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 sm:px-6" style={{ borderTop: `1px solid ${T.line}` }}>
          <span ref={tplPop.anchor} className="inline-flex">
            <Button size="sm" variant="secondary" iconRight={ChevronDown} onClick={tplPop.toggle}>
              {tx('Шаблон', 'Template')}
            </Button>
          </span>
          <PopPanel pop={tplPop} width={230}>
            {templates.map(([id, label]) => (
              <button key={id} type="button" onClick={() => { set(PRESETS[id]); tplPop.setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-white/5" style={{ color: T.text }}>
                <span className="h-4 w-4 rounded-[4px]" style={{ background: `linear-gradient(135deg, ${PRESETS[id].bg} 50%, ${PRESETS[id].up} 50%)`, border: `1px solid ${T.lineHi}` }} />
                {label}
              </button>
            ))}
            <div className="my-1 h-px" style={{ background: T.line }} />
            <button
              type="button"
              onClick={() => { onChange({ ...DEFAULT_PREFS, tf: p.tf, speed: p.speed, symbol: p.symbol, panel: p.panel }); tplPop.setOpen(false); }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-white/5"
              style={{ color: T.text2 }}
            >
              {tx('Скинути все до стандартних', 'Reset all to defaults')}
            </button>
          </PopPanel>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={cancel}>{tx('Скасувати', 'Cancel')}</Button>
            <Button size="sm" variant="primary" onClick={onClose} style={{ minWidth: 64 }}>{tx('Ок', 'Ok')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* Ті самі елементи — у вікні налаштувань малюнка. */
export { Box, Row, Select, NumField, Head };
