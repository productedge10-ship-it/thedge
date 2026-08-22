import { useEffect, useRef } from 'react';
import { Clock, X } from 'lucide-react';
import { T } from '../../lib/theme';
import Popover from '../ui/Popover';

/* ==================================================================
   Вибір часу.
   Системний <input type="time"> у кожному браузері свій і скрізь
   потворний. Тут — дві колонки: години і хвилини кроком у пʼять,
   плюс ряд типових годин, бо в 90% випадків час круглий.
================================================================== */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const QUICK = ['09:00', '12:00', '15:00', '18:00', '21:00'];

function Column({ items, value, onPick, label }) {
  const ref = useRef(null);

  /* активний елемент має бути видно одразу, без прокрутки руками */
  useEffect(() => {
    const el = ref.current?.querySelector('[data-on="1"]');
    if (el) el.scrollIntoView({ block: 'center' });
  }, [value]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span
        className="mb-1.5 px-1 text-[11.5px] font-bold uppercase tracking-[0.1em]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        {label}
      </span>
      <div
        ref={ref}
        className="flex max-h-[188px] flex-col gap-1 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              data-on={on ? '1' : '0'}
              onClick={() => onPick(v)}
              className="h-8 shrink-0 rounded-lg text-[14px] font-bold tabular-nums transition-colors duration-150"
              style={{
                fontFamily: T.mono,
                color: on ? 'var(--edge-bg, #0A0A0C)' : T.text2,
                background: on ? T.acc : 'transparent',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = T.surfaceHi; }}
              onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TimePop({ value, onChange, align = 'left' }) {
  const [hh, mm] = (value || '').split(':');

  const set = (h, m) => onChange(`${h || '12'}:${m || '00'}`);

  return (
    <Popover
      align={align}
      renderTrigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
          style={{
            fontFamily: value ? T.mono : T.sans,
            color: value ? T.acc : T.text3,
            background: value ? `rgba(${T.accRgb},0.12)` : T.sunken,
            border: `1px solid ${value || open ? T.lineAcc : T.line}`,
          }}
          onMouseEnter={(e) => { if (!value && !open) e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { if (!value && !open) e.currentTarget.style.borderColor = T.line; }}
        >
          <Clock size={13} strokeWidth={2.2} />
          {value || 'час'}
          {value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="ml-0.5 grid h-4 w-4 place-items-center rounded"
              style={{ opacity: 0.7 }}
            >
              <X size={11} strokeWidth={3} />
            </span>
          )}
        </button>
      )}
    >
      {({ close }) => (
        <div
          className="w-[244px] rounded-2xl p-3"
          style={{
            background: T.surface,
            border: `1px solid ${T.lineHi}`,
            boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
          }}
        >
          {/* типові години */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK.map((q) => {
              const on = value === q;
              return (
                <button
                  key={q}
                  onClick={() => { onChange(q); close(); }}
                  className="h-8 flex-1 rounded-lg px-2 text-[13px] font-bold tabular-nums transition-colors duration-200"
                  style={{
                    fontFamily: T.mono,
                    color: on ? T.acc : T.text3,
                    background: on ? `rgba(${T.accRgb},0.14)` : T.sunken,
                    border: `1px solid ${on ? T.lineAcc : T.line}`,
                  }}
                  onMouseEnter={(e) => { if (!on) { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; } }}
                  onMouseLeave={(e) => { if (!on) { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; } }}
                >
                  {q}
                </button>
              );
            })}
          </div>

          <div className="flex gap-2" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
            <Column label="год" items={HOURS} value={hh} onPick={(h) => set(h, mm)} />
            <span className="mt-7 text-[15px] font-bold" style={{ fontFamily: T.mono, color: T.text4 }}>:</span>
            <Column label="хв" items={MINUTES} value={mm} onPick={(m) => set(hh, m)} />
          </div>

          <div className="mt-3 flex gap-2" style={{ borderTop: `1px solid ${T.line}`, paddingTop: 12 }}>
            <button
              onClick={() => { onChange(null); close(); }}
              className="h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors duration-200"
              style={{ fontFamily: T.sans, color: T.text3, border: `1px solid ${T.line}` }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
            >
              Без часу
            </button>
            <button
              onClick={close}
              className="h-9 flex-1 rounded-lg text-[13px] font-bold transition-transform duration-200 active:scale-[0.98]"
              style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
