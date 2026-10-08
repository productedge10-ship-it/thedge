import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import Button from '../../ui/Button';
import ColorPicker from './ColorPicker';
import { Box, Row, NumField, Head } from './ChartSettings';
import { Select, usePopover, PopPanel } from './Popover';
import { caps, itemName, TOOLS, FIB_LEVELS } from '../../../lib/candles/drawings';
import { TFS } from '../../../lib/candles/agg';

/* ==================================================================
   Налаштування одного малюнка — вкладки як у TV: Стиль, Текст,
   Координати, Видимість. Зміни видно одразу; «Скасувати» повертає,
   «Шаблон → Зробити стандартним» — і наступні такі ж фігури
   малюватимуться з цим стилем.
================================================================== */

const LINE_STYLES = () => [['solid', tx('Суцільна', 'Solid')], ['dashed', tx('Пунктир', 'Dashed')], ['dotted', tx('Крапки', 'Dotted')]];
/* У списках товщини й стилю — зразок лінії, а не лише слово. */
const lineSample = (style, w = 2) => (
  <svg width="30" height="10" aria-hidden className="shrink-0"><line x1="1" y1="5" x2="29" y2="5" stroke="currentColor" strokeWidth={w} strokeDasharray={style === 'dashed' ? '6 4' : style === 'dotted' ? '1.5 3.5' : ''} strokeLinecap="round" /></svg>
);
const renderStyle = (v, label) => <span className="flex items-center gap-2">{lineSample(v)}{label}</span>;
const renderWidth = (v, label) => <span className="flex items-center gap-2">{lineSample('solid', Number(v))}{label}</span>;
const WIDTHS = [['1', '1px'], ['2', '2px'], ['3', '3px'], ['4', '4px']];

export default function DrawingSettings({ d, digits, fmtTime, onChange, onClose, onSaveDefault, onResetDefault }) {
  const c = caps(d.type);
  const tabs = [
    ['style', tx('Стиль', 'Style')],
    ...(c.text ? [['text', tx('Текст', 'Text')]] : []),
    ['coords', tx('Координати', 'Coordinates')],
    ['vis', tx('Видимість', 'Visibility')],
  ];
  const [tab, setTab] = useState(c.text && TOOLS[d.type].text ? 'text' : 'style');
  const tplPop = usePopover();
  const snap = useRef(JSON.parse(JSON.stringify(d)));
  /* Крок для Ctrl+Z пишемо лише при першій зміні: просто відкрите й
     закрите вікно не має зʼїдати один крок «назад». */
  const touched = useRef(false);
  const change = (patch) => { onChange(patch, !touched.current); touched.current = true; };
  const s = d.style || {};

  const setStyle = (patch) => change({ style: { ...s, ...patch } });
  const cancel = () => { if (touched.current) onChange(snap.current, false); onClose(); };

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineRow = (label = tx('Лінія', 'Line')) => (
    <Row label={label}>
      <ColorPicker value={s.color} onChange={(v) => setStyle({ color: v })} label={label} />
      {c.width && <Select value={String(s.width)} onChange={(v) => setStyle({ width: Number(v) })} options={WIDTHS} width={118} render={renderWidth} />}
      {c.lineStyle && <Select value={s.lineStyle} onChange={(v) => setStyle({ lineStyle: v })} options={LINE_STYLES()} width={150} render={renderStyle} />}
    </Row>
  );

  const levels = s.levels || FIB_LEVELS;
  const setLevel = (i, patch) => setStyle({ levels: levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const style = (
    <>
      {c.position ? (
        <>
          <Row label={tx('Зона цілі', 'Target zone')}><ColorPicker value={s.tp} onChange={(v) => setStyle({ tp: v })} label={tx('Зона цілі', 'Target zone')} /></Row>
          <Row label={tx('Зона стопу', 'Stop zone')}><ColorPicker value={s.sl} onChange={(v) => setStyle({ sl: v })} label={tx('Зона стопу', 'Stop zone')} /></Row>
          <Row label={tx('Лінія входу', 'Entry line')}><ColorPicker value={s.color} onChange={(v) => setStyle({ color: v })} label={tx('Лінія входу', 'Entry line')} /></Row>
          <Box on={s.showInfo !== false} onChange={(v) => setStyle({ showInfo: v })} label={tx('Підписи: ціль, стоп, R:R', 'Labels: target, stop, R:R')} />
        </>
      ) : c.fib ? (
        <>
          {lineRow(tx('Трендова лінія', 'Trend line'))}
          <Head>{tx('Рівні', 'Levels')}</Head>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Box on={l.on} onChange={(v) => setLevel(i, { on: v })} label="" />
                <input
                  defaultValue={l.v}
                  onBlur={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v)) setLevel(i, { v }); }}
                  className="h-8 w-[76px] rounded-lg px-2 text-[13px] tabular-nums outline-none"
                  style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono }}
                />
                <ColorPicker value={l.c} onChange={(v) => setLevel(i, { c: v })} label={String(l.v)} />
              </div>
            ))}
          </div>
          <Head>{tx('Вигляд', 'Appearance')}</Head>
          <Row label={tx('Заливка між рівнями', 'Background')} on={s.fillLevels} onToggle={(v) => setStyle({ fillLevels: v })}>
            <input type="range" min={0} max={50} value={Math.round((s.fillAlpha ?? 0.12) * 100)} onChange={(e) => setStyle({ fillAlpha: Number(e.target.value) / 100 })} className="w-32 accent-[#2962ff]" />
          </Row>
          <Box on={s.showLevels} onChange={(v) => setStyle({ showLevels: v })} label={tx('Значення рівнів', 'Levels')} />
          <Box on={s.showPrices} onChange={(v) => setStyle({ showPrices: v })} label={tx('Ціни рівнів', 'Prices')} />
          <Box on={s.reverse} onChange={(v) => setStyle({ reverse: v })} label={tx('Перевернути', 'Reverse')} />
          <Box on={s.extendLeft} onChange={(v) => setStyle({ extendLeft: v })} label={tx('Продовжити ліворуч', 'Extend left')} />
          <Box on={s.extendRight} onChange={(v) => setStyle({ extendRight: v })} label={tx('Продовжити праворуч', 'Extend right')} />
        </>
      ) : (
        <>
          {c.color && lineRow(d.type === 'note' || d.type === 'plabel' ? tx('Фон', 'Background') : undefined)}
          {c.fill && (
            <Row label={tx('Заливка', 'Background')} on={!!s.fill && s.fill !== 'none'} onToggle={(v) => setStyle({ fill: v ? (snap.current.style.fill || 'rgba(41,98,255,0.2)') : '' })}>
              <ColorPicker value={s.fill || 'rgba(41,98,255,0.2)'} onChange={(v) => setStyle({ fill: v })} label={tx('Заливка', 'Background')} />
            </Row>
          )}
          {c.extend && (
            <>
              <Box on={s.extendLeft} onChange={(v) => setStyle({ extendLeft: v })} label={tx('Продовжити ліворуч', 'Extend left')} />
              <Box on={s.extendRight} onChange={(v) => setStyle({ extendRight: v })} label={tx('Продовжити праворуч', 'Extend right')} />
            </>
          )}
          {'showMiddle' in s && <Box on={s.showMiddle} onChange={(v) => setStyle({ showMiddle: v })} label={tx('Середня лінія', 'Middle line')} />}
          {c.showPrice && <Box on={s.showPrice} onChange={(v) => setStyle({ showPrice: v })} label={tx('Мітка ціни', 'Price label')} />}
          {'showTime' in s && <Box on={s.showTime} onChange={(v) => setStyle({ showTime: v })} label={tx('Мітка часу', 'Time label')} />}
          {'showInfo' in s && <Box on={s.showInfo !== false} onChange={(v) => setStyle({ showInfo: v })} label={tx('Статистика', 'Stats')} hint={tx('Зміна ціни, %, кількість барів.', 'Price change, %, bar count.')} />}
          {'showAngle' in s && <Box on={s.showAngle} onChange={(v) => setStyle({ showAngle: v })} label={tx('Кут', 'Angle')} />}
          {d.type === 'text' && (
            <Row label={tx('Фон тексту', 'Text background')} on={!!s.bg} onToggle={(v) => setStyle({ bg: v ? 'rgba(41,98,255,0.15)' : '' })}>
              <ColorPicker value={s.bg || 'rgba(41,98,255,0.15)'} onChange={(v) => setStyle({ bg: v })} label={tx('Фон тексту', 'Text background')} />
            </Row>
          )}
          {c.textStyle && !c.text && (
            <Row label={tx('Текст', 'Text')}>
              <ColorPicker value={s.textColor} onChange={(v) => setStyle({ textColor: v })} label={tx('Колір тексту', 'Text color')} />
              <Select value={String(s.fontSize)} onChange={(v) => setStyle({ fontSize: Number(v) })} options={[10, 11, 12, 14, 16, 20].map((n) => [String(n), String(n)])} width={78} />
            </Row>
          )}
        </>
      )}
    </>
  );

  const text = (
    <>
      <textarea
        autoFocus
        value={d.text || ''}
        onChange={(e) => change({ text: e.target.value })}
        rows={4}
        placeholder={tx('Текст', 'Text')}
        className="w-full resize-y rounded-lg p-3 text-[14px] outline-none"
        style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text }}
      />
      <Row label={tx('Колір і розмір', 'Color and size')}>
        <ColorPicker value={s.textColor} onChange={(v) => setStyle({ textColor: v })} label={tx('Колір тексту', 'Text color')} />
        <Select value={String(s.fontSize)} onChange={(v) => setStyle({ fontSize: Number(v) })} options={[10, 12, 14, 16, 20, 24, 28, 32, 40].map((n) => [String(n), String(n)])} width={78} />
      </Row>
      <Box on={s.bold} onChange={(v) => setStyle({ bold: v })} label={tx('Жирний', 'Bold')} />
      <Box on={s.italic} onChange={(v) => setStyle({ italic: v })} label={tx('Курсив', 'Italic')} />
    </>
  );

  const ptName = (i) => {
    if (c.position) return [tx('Вхід', 'Entry'), tx('Ціль', 'Target'), tx('Стоп', 'Stop')][i];
    return `#${i + 1}`;
  };
  const coords = (
    <div className="space-y-1">
      {d.pts.slice(0, d.type === 'brush' || d.type === 'highlighter' ? 0 : 6).map((q, i) => (
        <Row key={i} label={ptName(i)}>
          <span className="text-[12px] tabular-nums" style={{ color: T.text3, fontFamily: T.mono }}>{fmtTime(q.t)}</span>
          <input
            defaultValue={Number(q.p).toFixed(digits)}
            onBlur={(e) => {
              const v = Number(e.target.value.replace(',', '.'));
              if (Number.isFinite(v)) change({ pts: d.pts.map((x, j) => (j === i ? { ...x, p: v } : x)) });
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="h-9 w-[120px] rounded-lg px-3 text-right text-[13.5px] tabular-nums outline-none"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, fontFamily: T.mono }}
          />
        </Row>
      ))}
      {(d.type === 'brush' || d.type === 'highlighter') && (
        <p className="text-[13px]" style={{ color: T.text3 }}>{tx('У пензля координат забагато, щоб правити їх вручну.', 'A brush has too many points to edit by hand.')}</p>
      )}
    </div>
  );

  const vis = (
    <>
      <p className="mb-2 text-[13px]" style={{ color: T.text3 }}>{tx('На яких таймфреймах показувати.', 'Show on these timeframes.')}</p>
      {TFS.map((tf) => (
        <Box
          key={tf.id}
          on={!d.vis || d.vis[tf.id] !== false}
          onChange={(v) => change({ vis: { ...(d.vis || {}), [tf.id]: v } })}
          label={tf.label}
        />
      ))}
    </>
  );

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-3" style={{ background: 'rgba(0,0,0,0.22)' }} onMouseDown={cancel}>
      <div
        className="flex max-h-[min(620px,92dvh)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', animation: 'edgeChartPop .2s cubic-bezier(.22,1,.36,1)' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={itemName(d.type)}
      >
        <style>{'@keyframes edgeChartPop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}'}</style>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-[17px] font-bold" style={{ color: T.text }}>{itemName(d.type)}</h3>
          <button type="button" onClick={cancel} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }} aria-label={tx('Закрити', 'Close')}><X size={18} /></button>
        </div>
        <div className="mt-2 flex gap-4 px-5" style={{ borderBottom: `1px solid ${T.line}` }}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="-mb-px pb-2.5 pt-1 text-[14px] font-semibold transition-colors" style={{ color: tab === id ? T.text : T.text3, borderBottom: `2px solid ${tab === id ? '#2962ff' : 'transparent'}` }}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-h-[220px] flex-1 overflow-y-auto px-5 py-4">
          {tab === 'style' && style}
          {tab === 'text' && text}
          {tab === 'coords' && coords}
          {tab === 'vis' && vis}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderTop: `1px solid ${T.line}` }}>
          <span ref={tplPop.anchor} className="inline-flex">
            <Button size="sm" variant="secondary" iconRight={ChevronDown} onClick={tplPop.toggle}>{tx('Шаблон', 'Template')}</Button>
          </span>
          <PopPanel pop={tplPop} width={250}>
            <button type="button" onClick={() => { onSaveDefault(); tplPop.setOpen(false); }} className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: T.text }}>{tx('Зробити стилем за замовчуванням', 'Save as default')}</button>
            <button type="button" onClick={() => { onResetDefault(); tplPop.setOpen(false); }} className="w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-white/5" style={{ color: T.text2 }}>{tx('Скинути до стандартного', 'Reset to default')}</button>
          </PopPanel>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={cancel}>{tx('Скасувати', 'Cancel')}</Button>
            <Button size="sm" onClick={onClose}>{tx('Ок', 'Ok')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
