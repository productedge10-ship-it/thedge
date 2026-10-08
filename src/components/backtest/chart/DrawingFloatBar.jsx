import { useEffect, useRef, useState } from 'react';
import { T } from '../../../lib/theme';
import { t as tx } from '../../../lib/lang';
import { caps, itemName } from '../../../lib/candles/drawings';
import ColorPicker from './ColorPicker';
import { usePopover, PopPanel } from './Popover';
import DrawIcon from './DrawingIcons';

/* ==================================================================
   Плаваюча панель вибраного малюнка — як у TV: колір, заливка,
   товщина, стиль лінії, налаштування, замок, копія, видалити.
   Найчастіше людина міняє саме це, і лізти заради кольору у вікно
   налаштувань — зайвий крок.
================================================================== */

function Pop({ label, children, value }) {
  const pop = usePopover();
  return (
    <>
      <button
        ref={pop.anchor}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={pop.open}
        onClick={pop.toggle}
        className="grid h-8 min-w-8 place-items-center rounded-md px-1.5 transition-colors hover:bg-white/10"
        style={{ color: pop.open ? '#5b8cff' : T.text2, background: pop.open ? 'rgba(41,98,255,0.14)' : undefined }}
      >
        {value}
      </button>
      <PopPanel pop={pop} align="center">
        <div onClick={() => pop.setOpen(false)}>{children}</div>
      </PopPanel>
    </>
  );
}

const LineSample = ({ w = 2, style = 'solid' }) => (
  <svg width="34" height="12" aria-hidden>
    <line x1="2" y1="6" x2="32" y2="6" stroke="currentColor" strokeWidth={w} strokeDasharray={style === 'dashed' ? '6 4' : style === 'dotted' ? '1.5 3.5' : ''} strokeLinecap="round" />
  </svg>
);

export default function DrawingFloatBar({ d, host, pos, onMove, onStyle, onPatch, onSettings, onClone, onDelete, onFront, onBack, onSaveDefault, onResetDefault }) {
  const ref = useRef(null);
  const [at, setAt] = useState(pos || null);
  useEffect(() => { setAt(pos || null); }, [pos?.x, pos?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const c = caps(d.type);
  const s = d.style || {};
  const Sep = () => <span className="mx-0.5 h-5 w-px" style={{ background: T.line }} />;

  /* Як у TV: панель можна відтягнути за «ручку» зліва, місце
     памʼятається. Подвійний клік по ручці — назад по центру. */
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const box = host?.current?.getBoundingClientRect();
    const me = ref.current?.getBoundingClientRect();
    if (!box || !me) return;
    const start = { x: me.left - box.left, y: me.top - box.top };
    const sx = e.clientX; const sy = e.clientY;
    let last = start;
    const move = (ev) => {
      last = { x: Math.max(0, Math.min(box.width - me.width, start.x + ev.clientX - sx)), y: Math.max(0, Math.min(box.height - me.height, start.y + ev.clientY - sy)) };
      setAt(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      onMove?.(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const MenuItem = ({ onClick, children, danger }) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[12.5px] hover:bg-white/10" style={{ color: danger ? '#f23645' : T.text }}>{children}</button>
  );

  return (
    <div
      ref={ref}
      className={`absolute z-[12] flex items-center gap-0.5 rounded-xl px-1 py-1 ${at ? '' : 'left-1/2 top-2 -translate-x-1/2'}`}
      style={{ ...(at ? { left: at.x, top: at.y } : {}), background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 10px 26px rgba(0,0,0,0.4)', animation: 'edgeFly .14s ease-out' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={tx('Тягни, щоб перемістити. Подвійний клік — по центру', 'Drag to move. Double-click to center')}
        aria-label={tx('Перемістити панель', 'Move toolbar')}
        onPointerDown={startDrag}
        onDoubleClick={() => { setAt(null); onMove?.(null); }}
        className="grid h-8 w-3.5 cursor-grab place-items-center rounded opacity-50 hover:opacity-100 active:cursor-grabbing"
        style={{ color: T.text2, touchAction: 'none' }}
      >
        <svg width="6" height="14" viewBox="0 0 6 14" aria-hidden>{[[1.5, 2], [4.5, 2], [1.5, 7], [4.5, 7], [1.5, 12], [4.5, 12]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" />)}</svg>
      </button>
      <Pop label={tx('Шаблони стилю', 'Style templates')} value={<DrawIcon id="template" size={22} />}>
        <MenuItem onClick={onSaveDefault}>{tx('Зберегти як типовий стиль', 'Save as default')}</MenuItem>
        <MenuItem onClick={onResetDefault}>{tx('Скинути до стандартного', 'Reset to standard')}</MenuItem>
      </Pop>
      <span className="px-1.5 text-[12px] font-semibold" style={{ color: T.text3 }}>{itemName(d.type)}</span>
      <Sep />
      {c.color && <ColorPicker value={s.color} onChange={(v) => onStyle({ color: v })} label={tx('Колір лінії', 'Line color')} />}
      {c.fill && <span className="ml-1"><ColorPicker value={s.fill} onChange={(v) => onStyle({ fill: v })} label={tx('Заливка', 'Fill')} /></span>}
      {c.textStyle && <span className="ml-1"><ColorPicker value={s.textColor} onChange={(v) => onStyle({ textColor: v })} label={tx('Колір тексту', 'Text color')} /></span>}
      {c.width && (
        <Pop label={tx('Товщина', 'Width')} value={<span className="flex items-center gap-1"><LineSample w={s.width} /><span className="text-[11px]">{s.width}px</span></span>}>
          {[1, 2, 3, 4].map((w) => (
            <button key={w} type="button" onClick={() => onStyle({ width: w })} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10" style={{ color: w === s.width ? '#5b8cff' : T.text }}>
              <LineSample w={w} /> <span className="text-[12px]">{w}px</span>
            </button>
          ))}
        </Pop>
      )}
      {c.lineStyle && (
        <Pop label={tx('Стиль лінії', 'Line style')} value={<LineSample w={2} style={s.lineStyle} />}>
          {['solid', 'dashed', 'dotted'].map((v) => (
            <button key={v} type="button" onClick={() => onStyle({ lineStyle: v })} className="flex w-full items-center rounded-lg px-2 py-1.5 hover:bg-white/10" style={{ color: v === s.lineStyle ? '#5b8cff' : T.text }}>
              <LineSample w={2} style={v} />
            </button>
          ))}
        </Pop>
      )}
      {c.textStyle && (
        <Pop label={tx('Розмір тексту', 'Font size')} value={<span className="text-[12px] tabular-nums">{s.fontSize}</span>}>
          {[10, 12, 14, 16, 20, 24, 28].map((v) => (
            <button key={v} type="button" onClick={() => onStyle({ fontSize: v })} className="block w-full rounded-lg px-3 py-1 text-left text-[12.5px] hover:bg-white/10" style={{ color: v === s.fontSize ? '#5b8cff' : T.text }}>{v}</button>
          ))}
        </Pop>
      )}
      <Sep />
      <button type="button" title={tx('Налаштування', 'Settings')} aria-label={tx('Налаштування', 'Settings')} onClick={onSettings} className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10" style={{ color: T.text2 }}><DrawIcon id="gear" size={22} /></button>
      <button type="button" title={d.locked ? tx('Розблокувати', 'Unlock') : tx('Заблокувати', 'Lock')} aria-label={tx('Замок', 'Lock')} onClick={() => onPatch({ locked: !d.locked })} className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10" style={{ color: d.locked ? '#5b8cff' : T.text2 }}><DrawIcon id={d.locked ? 'lock' : 'unlock'} size={22} /></button>
      <button type="button" title={tx('Видалити (Delete)', 'Remove (Delete)')} aria-label={tx('Видалити', 'Remove')} onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/10 hover:text-[#f23645]" style={{ color: T.text2 }}><DrawIcon id="trash" size={22} /></button>
      <Pop label={tx('Ще', 'More')} value={<DrawIcon id="more" size={22} />}>
        <MenuItem onClick={onClone}><DrawIcon id="clone" size={18} />{tx('Копія', 'Clone')}</MenuItem>
        <MenuItem onClick={onFront}><DrawIcon id="front" size={18} />{tx('На передній план', 'Bring to front')}</MenuItem>
        <MenuItem onClick={onBack}><DrawIcon id="back" size={18} />{tx('На задній план', 'Send to back')}</MenuItem>
        <MenuItem onClick={onSettings}><DrawIcon id="gear" size={18} />{tx('Налаштування…', 'Settings…')}</MenuItem>
      </Pop>
    </div>
  );
}
