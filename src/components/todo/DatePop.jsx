import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { uk } from 'date-fns/locale';
import { CalendarDays, X } from 'lucide-react';
import { T } from '../../lib/theme';
import { dayKey, relativeDay } from '../../lib/todoData';
import Popover from '../ui/Popover';

/* ==================================================================
   Вибір дати.
   Той самий календар, що на решті сайту (react-day-picker), але
   перефарбований у наші токени і винесений у портал, щоб не
   обрізався картками.
================================================================== */

export default function DatePop({ value, onChange, align = 'left' }) {
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;

  return (
    <Popover
      align={align}
      renderTrigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          className="flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-semibold transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            color: value ? T.acc : T.text3,
            background: value ? `rgba(${T.accRgb},0.12)` : T.sunken,
            border: `1px solid ${value || open ? T.lineAcc : T.line}`,
          }}
          onMouseEnter={(e) => { if (!value && !open) e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { if (!value && !open) e.currentTarget.style.borderColor = T.line; }}
        >
          <CalendarDays size={13} strokeWidth={2.2} />
          {value ? relativeDay(value) : 'дата'}
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
          className="rounded-2xl p-2"
          style={{
            background: T.surface,
            border: `1px solid ${T.lineHi}`,
            boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
          }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => { onChange(d ? dayKey(d) : null); close(); }}
            locale={uk}
            weekStartsOn={1}
            showOutsideDays
            className="edge-daypicker"
          />

          <style>{`
            .edge-daypicker {
              --rdp-cell-size: 38px;
              --rdp-accent-color: ${T.acc};
              --rdp-background-color: rgba(${T.accRgb},0.14);
              margin: 0;
              font-family: ${T.sans};
              color: ${T.text2};
            }
            .edge-daypicker .rdp-months { margin: 0; }
            .edge-daypicker .rdp-caption_label {
              font-size: 14px; font-weight: 700; color: ${T.text};
              text-transform: capitalize; letter-spacing: -0.01em;
            }
            .edge-daypicker .rdp-nav_button {
              color: ${T.text3}; border-radius: 10px; width: 32px; height: 32px;
              transition: background .2s, color .2s;
            }
            .edge-daypicker .rdp-nav_button:hover {
              background: ${T.surfaceHi} !important; color: ${T.text};
            }
            .edge-daypicker .rdp-head_cell {
              font-size: 11.5px; font-weight: 700; text-transform: uppercase;
              letter-spacing: .08em; color: ${T.text4};
            }
            .edge-daypicker .rdp-day {
              border-radius: 10px; font-size: 13.5px; font-weight: 600;
              color: ${T.text2}; transition: background .18s, color .18s, border-color .18s;
              border: 1px solid transparent;
            }
            .edge-daypicker .rdp-day:hover:not(.rdp-day_selected) {
              background: ${T.surfaceHi} !important; color: ${T.text};
              border-color: ${T.line};
            }
            .edge-daypicker .rdp-day_today:not(.rdp-day_selected) {
              color: ${T.acc}; border-color: ${T.lineAcc};
            }
            .edge-daypicker .rdp-day_selected,
            .edge-daypicker .rdp-day_selected:hover {
              background: ${T.acc} !important; color: #0A0A0C !important; font-weight: 800;
            }
            .edge-daypicker .rdp-day_outside { color: ${T.text4}; opacity: .55; }
          `}</style>
        </div>
      )}
    </Popover>
  );
}
