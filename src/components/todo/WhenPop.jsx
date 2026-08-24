import { useEffect, useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
/* Базова сітка календаря. Без цього імпорту DayPicker розсипається
   в неформатований список — раніше стиль тягнувся через DatePop,
   який більше ніде не підключений. Шлях саме такий: у девʼятій
   версії це /style.css, а не /dist/style.css. */
import 'react-day-picker/style.css';
import { uk } from 'date-fns/locale';
import { CalendarDays, Clock, X, ChevronDown } from 'lucide-react';
import { T, EASE } from '../../lib/theme';
import { dayKey, today, addDays, relativeDay } from '../../lib/todoData';
import Popover from '../ui/Popover';

/* ==================================================================
   «Коли» — дата й час в одній панелі.

   Раніше це були три чипи швидких днів, окремий вибір дати і окремий
   вибір часу — пʼять елементів у рядку під полем вводу, і рядок
   виглядав як анкета. Хоча рішення тут одне: коли.

   Важливе про календар. У проєкті react-day-picker 9, а стилі під
   нього були написані для восьмої версії (.rdp-head_cell,
   .rdp-day_selected, --rdp-cell-size). У девʼятці цих класів не
   існує, тому більшість правил тихо не застосовувалась — звідси й
   відчуття, що календар з іншого сайту. Тут селектори правильні:
   .rdp-weekday, .rdp-selected .rdp-day_button, .rdp-outside.
================================================================== */

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const QUICK_TIME = ['09:00', '12:00', '15:00', '18:00', '21:00'];

const sideLabel = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\sр\./, '');
};

/* ---------- колонка годин/хвилин ---------- */

function Column({ items, value, onPick, label }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current?.querySelector('[data-on="1"]');
    if (el) el.scrollIntoView({ block: 'center' });
  }, [value]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span
        className="mb-1 px-1 text-[10.5px] font-bold uppercase tracking-[0.12em]"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {label}
      </span>
      <div
        ref={ref}
        className="flex max-h-[136px] flex-col gap-0.5 overflow-y-auto pr-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {items.map((v) => {
          const on = value === v;
          return (
            <button
              key={v}
              data-on={on ? '1' : '0'}
              onClick={() => onPick(v)}
              className="h-7 shrink-0 rounded-md text-[13.5px] font-bold tabular-nums transition-colors duration-150"
              style={{
                fontFamily: T.mono,
                color: on ? 'var(--edge-bg, #0A0A0C)' : T.text2,
                background: on ? T.acc : 'transparent',
              }}
              onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
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

/* ---------- рядок швидкого дня ---------- */

function QuickRow({ label, iso, on, onPick }) {
  return (
    <button
      onClick={() => onPick(iso)}
      className="flex h-9 w-full items-center justify-between rounded-lg px-2.5 text-[13.5px] transition-colors duration-150"
      style={{
        fontFamily: T.sans,
        background: on ? `rgba(${T.accRgb},0.13)` : 'transparent',
        color: on ? T.acc : T.text,
        fontWeight: on ? 700 : 600,
      }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      <span className="text-[12px] font-normal tabular-nums" style={{ color: on ? T.acc : T.text3 }}>
        {sideLabel(iso)}
      </span>
    </button>
  );
}

/* ================================================================== */

export default function WhenPop({ due, dueTime, onChange, align = 'left' }) {
  const [openTime, setOpenTime] = useState(false);
  const selected = due ? new Date(`${due}T12:00:00`) : undefined;
  const [hh, mm] = (dueTime || '').split(':');

  const t = today();
  const quick = [
    { label: 'Сьогодні', iso: t },
    { label: 'Завтра', iso: addDays(t, 1) },
    { label: 'Через тиждень', iso: addDays(t, 7) },
  ];

  /* Час без дати — це нічого не означає, тому перше ж торкання
     годинника мовчки ставить сьогодні. Просити дату окремо після
     того, як людина вже сказала «о третій», було б причіпкою. */
  const setTime = (v) => onChange(due || t, v);

  const label = (() => {
    if (!due && !dueTime) return 'Коли';
    if (due && dueTime) return `${relativeDay(due)}, ${dueTime}`;
    if (due) return relativeDay(due);
    return dueTime;
  })();

  const filled = Boolean(due || dueTime);

  return (
    <Popover
      align={align}
      renderTrigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            color: filled ? T.acc : T.text3,
            background: filled ? `rgba(${T.accRgb},0.12)` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${filled || open ? T.lineAcc : 'transparent'}`,
          }}
          onMouseEnter={(e) => { if (!filled && !open) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { if (!filled && !open) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
        >
          <CalendarDays size={13} strokeWidth={2.2} />
          {label}
          {filled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
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
          className="w-[300px] overflow-hidden rounded-2xl"
          style={{
            background: T.surface,
            border: `1px solid ${T.lineHi}`,
            boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
          }}
        >
          {/* швидкі дні */}
          <div className="flex flex-col gap-0.5 p-2">
            {quick.map((q) => (
              <QuickRow
                key={q.label}
                label={q.label}
                iso={q.iso}
                on={due === q.iso}
                onPick={(iso) => onChange(due === iso ? null : iso, dueTime)}
              />
            ))}
          </div>

          {/* календар */}
          <div className="px-2 pb-1" style={{ borderTop: `1px solid ${T.line}` }}>
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => onChange(d ? dayKey(d) : null, dueTime)}
              locale={uk}
              weekStartsOn={1}
              showOutsideDays
              className="edge-dp"
            />
          </div>

          {/* час */}
          <div className="p-2" style={{ borderTop: `1px solid ${T.line}` }}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span
                className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ fontFamily: T.sans, color: T.text3 }}
              >
                <Clock size={11} strokeWidth={2.4} />
                час
              </span>
              <button
                onClick={() => setOpenTime((v) => !v)}
                className="flex items-center gap-1 text-[11.5px] font-semibold transition-colors duration-150"
                style={{ fontFamily: T.sans, color: openTime ? T.acc : T.text3 }}
              >
                інший
                <ChevronDown
                  size={12}
                  strokeWidth={2.6}
                  style={{ transform: openTime ? 'rotate(180deg)' : 'none', transition: `transform 200ms ${EASE}` }}
                />
              </button>
            </div>

            <div className="flex gap-1">
              {QUICK_TIME.map((q) => {
                const on = dueTime === q;
                return (
                  <button
                    key={q}
                    onClick={() => setTime(on ? null : q)}
                    className="h-7 flex-1 rounded-md text-[12px] font-bold tabular-nums transition-colors duration-150"
                    style={{
                      fontFamily: T.mono,
                      color: on ? 'var(--edge-bg, #0A0A0C)' : T.text2,
                      background: on ? T.acc : 'rgba(255,255,255,0.05)',
                    }}
                    onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
                    onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  >
                    {q}
                  </button>
                );
              })}
            </div>

            {openTime && (
              <div className="mt-2 flex gap-2">
                <Column label="год" items={HOURS} value={hh} onPick={(h) => setTime(`${h}:${mm || '00'}`)} />
                <span className="mt-5 text-[14px] font-bold" style={{ fontFamily: T.mono, color: T.text3 }}>:</span>
                <Column label="хв" items={MINUTES} value={mm} onPick={(m) => setTime(`${hh || '12'}:${m}`)} />
              </div>
            )}
          </div>

          {/* підвал */}
          <div className="flex gap-2 p-2" style={{ borderTop: `1px solid ${T.line}` }}>
            <button
              onClick={() => { onChange(null, null); close(); }}
              className="h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors duration-200"
              style={{ fontFamily: T.sans, color: T.text3, background: 'rgba(255,255,255,0.04)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            >
              Без дати
            </button>
            <button
              onClick={close}
              className="h-9 flex-1 rounded-lg text-[13px] font-bold transition-transform duration-200 active:scale-[0.98]"
              style={{ background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans }}
            >
              Готово
            </button>
          </div>

          {/* Селектори саме девʼятої версії. Восьма називала це
              інакше, і саме тому попередні стилі не працювали. */}
          <style>{`
            .edge-dp.rdp-root {
              --rdp-accent-color: ${T.acc};
              --rdp-accent-background-color: rgba(${T.accRgb},0.14);
              --rdp-day-width: 36px;
              --rdp-day-height: 36px;
              --rdp-day_button-width: 32px;
              --rdp-day_button-height: 32px;
              --rdp-day_button-border-radius: 9px;
              --rdp-day_button-border: 1px solid transparent;
              --rdp-selected-border: none;
              --rdp-outside-opacity: 0.3;
              --rdp-disabled-opacity: 0.25;
              --rdp-weekday-opacity: 1;
              --rdp-nav-height: 34px;
              --rdp-nav_button-width: 28px;
              --rdp-nav_button-height: 28px;
              --rdp-today-color: ${T.acc};
              margin: 0;
              font-family: ${T.sans};
              color: ${T.text2};
            }
            .edge-dp .rdp-month_caption {
              font-size: 13.5px; font-weight: 700; color: ${T.text};
              text-transform: capitalize; letter-spacing: -0.01em;
              padding-left: 6px;
            }
            .edge-dp .rdp-button_previous,
            .edge-dp .rdp-button_next {
              color: ${T.text3}; border-radius: 8px;
              transition: background .18s, color .18s;
            }
            .edge-dp .rdp-button_previous:hover,
            .edge-dp .rdp-button_next:hover {
              background: rgba(255,255,255,0.07); color: ${T.text};
            }
            .edge-dp .rdp-chevron { fill: currentColor; width: 15px; height: 15px; }
            .edge-dp .rdp-weekday {
              font-size: 10.5px; font-weight: 700; text-transform: uppercase;
              letter-spacing: .08em; color: ${T.text3};
            }
            .edge-dp .rdp-day_button {
              font-size: 13px; font-weight: 600; color: ${T.text2};
              transition: background .16s, color .16s;
            }
            .edge-dp .rdp-day_button:hover {
              background: rgba(255,255,255,0.07); color: ${T.text};
            }
            .edge-dp .rdp-today .rdp-day_button {
              color: ${T.acc}; font-weight: 800;
            }
            .edge-dp .rdp-selected .rdp-day_button,
            .edge-dp .rdp-selected .rdp-day_button:hover {
              background: ${T.acc}; color: #0A0A0C; font-weight: 800;
            }
            .edge-dp .rdp-outside .rdp-day_button { color: ${T.text3}; }
          `}</style>
        </div>
      )}
    </Popover>
  );
}
