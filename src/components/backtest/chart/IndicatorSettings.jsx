import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { T } from '../../../lib/theme';
import { t as tx, isEn } from '../../../lib/lang';
import Button from '../../ui/Button';
import ColorPicker from './ColorPicker';
import { Box, NumField, Row } from './ChartSettings';
import { Select } from './Popover';
import { INDICATORS, indName, defaultInputs } from '../../../lib/candles/indicators';
import { TFS } from '../../../lib/candles/agg';

/* ==================================================================
   Налаштування індикатора — форма з опису полів. Вкладки «Вхідні» і
   «Стиль», як у TV. Зміни видно одразу; «Скасувати» повертає;
   «Скинути» — до стандартних значень.

   Для сесій і ліній MA колір стоїть одразу біля галочки — інакше
   довелось би стрибати між вкладками, щоб зрозуміти, яка лінія яка.
================================================================== */

function RangeField({ value, onChange }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const ok = /^(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})$/.test(String(v).trim());
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (ok) onChange(String(v).replace(/\s/g, '')); else setV(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      placeholder="09:30-10:00"
      className="h-9 w-[132px] rounded-lg px-3 text-[13.5px] tabular-nums outline-none"
      style={{ background: T.sunken, border: `1px solid ${ok ? T.line : T.bad}`, color: T.text, fontFamily: T.mono }}
    />
  );
}

function TextField({ value, onChange }) {
  return (
    <input
      defaultValue={value}
      onBlur={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className="h-9 w-[160px] rounded-lg px-3 text-[13.5px] outline-none"
      style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text }}
    />
  );
}

export default function IndicatorSettings({ cfg, onChange, onClose }) {
  const def = INDICATORS[cfg.id];
  const [tab, setTab] = useState('in');
  const snap = useRef(JSON.parse(JSON.stringify(cfg)));
  const inp = { ...defaultInputs(cfg.id), ...(cfg.inputs || {}) };
  const set = (patch) => onChange({ ...cfg, inputs: { ...(cfg.inputs || {}), ...patch } });
  const cancel = () => { onChange(snap.current); onClose(); };

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Колір «прикріплений» до галочки onN, якщо є colorN. */
  const keys = new Set(def.fields.map((x) => x.key));
  const pinned = new Set(def.fields.filter((x) => /^on\d$/.test(x.key) && keys.has(`color${x.key.slice(2)}`)).map((x) => `color${x.key.slice(2)}`));

  const label = (fl) => (isEn ? fl.en : fl.uk);
  const field = (fl) => {
    const raw = label(fl);
    const indent = raw.startsWith('  ');
    const text = raw.trim();
    const pin = /^on\d$/.test(fl.key) && pinned.has(`color${fl.key.slice(2)}`) ? `color${fl.key.slice(2)}` : null;
    let ctrl = null;
    if (fl.type === 'bool') {
      return (
        <div key={fl.key} className={`flex items-center justify-between gap-3 ${indent ? 'pl-7' : ''}`}>
          <Box on={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} label={text} />
          {pin && <ColorPicker value={inp[pin]} onChange={(v) => set({ [pin]: v })} label={text} />}
        </div>
      );
    }
    if (fl.type === 'number') ctrl = <NumField value={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} min={fl.min} max={fl.max} step={fl.step} />;
    if (fl.type === 'color') ctrl = <ColorPicker value={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} label={text} />;
    if (fl.type === 'select') ctrl = <Select value={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} options={fl.options()} width={200} />;
    if (fl.type === 'range') ctrl = <RangeField value={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} />;
    if (fl.type === 'text') ctrl = <TextField value={inp[fl.key]} onChange={(v) => set({ [fl.key]: v })} />;
    return (
      <div key={fl.key} className={indent ? 'pl-7' : ''}>
        <Row label={text}>{ctrl}</Row>
      </div>
    );
  };

  /* Поле з умовою (when) показуємо лише тоді, коли воно має сенс:
     «скільки останніх» — тільки для «останні N» тощо. */
  const visible = (x) => !pinned.has(x.key) && (!x.when || x.when(inp));
  const shown = def.fields.filter((x) => x.sec === tab && visible(x));
  const has = (sec) => def.fields.some((x) => x.sec === sec && !pinned.has(x.key));
  const tabs = [
    ['in', tx('Вхідні', 'Inputs')],
    ...(has('st') ? [['st', tx('Стиль', 'Style')]] : []),
    ...(has('lb') ? [['lb', tx('Підписи', 'Labels')]] : []),
    ['vis', tx('Видимість', 'Visibility')],
  ];

  return (
    <div className="fixed inset-0 z-[125] grid place-items-center p-3" style={{ background: 'rgba(0,0,0,0.22)' }} onMouseDown={cancel}>
      <div
        className="flex max-h-[min(640px,92dvh)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl"
        style={{ background: T.surface, border: `1px solid ${T.line}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)', animation: 'edgeChartPop .2s cubic-bezier(.22,1,.36,1)' }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={indName(cfg.id)}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-[17px] font-bold" style={{ color: T.text }}>{indName(cfg.id)}</h3>
          <button type="button" onClick={cancel} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/5" style={{ color: T.text3 }} aria-label={tx('Закрити', 'Close')}><X size={18} /></button>
        </div>
        <div className="mt-2 flex gap-4 px-5" style={{ borderBottom: `1px solid ${T.line}` }}>
          {tabs.map(([id, l]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className="-mb-px pb-2.5 pt-1 text-[14px] font-semibold transition-colors" style={{ color: tab === id ? T.text : T.text3, borderBottom: `2px solid ${tab === id ? '#2962ff' : 'transparent'}` }}>{l}</button>
          ))}
        </div>
        <div className="min-h-[200px] flex-1 space-y-0.5 overflow-y-auto px-5 py-4">
          {tab === 'vis' ? (
            <>
              <p className="mb-2 text-[13px]" style={{ color: T.text3 }}>{tx('На яких таймфреймах показувати індикатор.', 'Show the indicator on these timeframes.')}</p>
              {TFS.map((tf) => (
                <Box key={tf.id} on={inp[`vis_${tf.id}`] !== false} onChange={(v) => set({ [`vis_${tf.id}`]: v })} label={tf.label} />
              ))}
            </>
          ) : shown.map(field)}
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5" style={{ borderTop: `1px solid ${T.line}` }}>
          <Button size="sm" variant="secondary" onClick={() => onChange({ ...cfg, inputs: {} })}>{tx('Скинути', 'Defaults')}</Button>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={cancel}>{tx('Скасувати', 'Cancel')}</Button>
            <Button size="sm" onClick={onClose}>{tx('Ок', 'Ok')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
