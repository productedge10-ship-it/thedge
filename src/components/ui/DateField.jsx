import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { uk, enGB } from 'date-fns/locale';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { T } from '../../lib/theme';
import Popover from './Popover';

/* ==================================================================
   Поле дати на всю ширину.

   Нативний <input type="date"> малює календар засобами операційної
   системи — світлий, з чужими шрифтами, поверх нашого темного вікна.
   Тут той самий react-day-picker, що на решті сайту, у наших
   кольорах і в порталі, тому його не обрізає модалка.
================================================================== */

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* Дві мови: сторінки застосунку українською, а деталка акаунта
   англійською — вона показується іншим людям */
const WORDS = {
  uk: { pick: 'обрати дату', today: 'сьогодні', yesterday: 'вчора', todayBtn: 'Сьогодні', loc: 'uk-UA' },
  en: { pick: 'pick a date', today: 'today', yesterday: 'yesterday', todayBtn: 'Today', loc: 'en-GB' },
};

const label = (iso, lang) => {
  const w = WORDS[lang] || WORDS.uk;
  if (!iso) return w.pick;
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;

  const today = dayKey(new Date());
  const yest = dayKey(new Date(Date.now() - 86400000));
  if (iso === today) return w.today;
  if (iso === yest) return w.yesterday;

  return d.toLocaleDateString(w.loc, { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\sр\./, '');
};

export default function DateField({ value, onChange, align = 'left', lang = 'uk' }) {
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const w = WORDS[lang] || WORDS.uk;

  return (
    <Popover
      align={align}
      triggerClass="flex w-full"
      renderTrigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl px-3.5 text-[14px] transition-colors duration-200"
          style={{
            fontFamily: T.sans,
            background: T.sunken,
            border: `1px solid ${open ? T.lineAcc : T.line}`,
            color: value ? T.text : T.text4,
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
        >
          <CalendarDays size={15} strokeWidth={2.2} style={{ color: open ? T.acc : T.text4 }} />
          <span className="min-w-0 flex-1 truncate text-left">{label(value, lang)}</span>
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className="shrink-0 transition-transform duration-200"
            style={{ color: T.text4, transform: open ? 'rotate(180deg)' : 'none' }}
          />
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
            defaultMonth={selected}
            onSelect={(d) => { if (d) onChange(dayKey(d)); close(); }}
            locale={lang === 'en' ? enGB : uk}
            weekStartsOn={1}
            showOutsideDays
            className="edge-daypicker"
          />

          <button
            type="button"
            onClick={() => { onChange(dayKey(new Date())); close(); }}
            className="mt-1 h-9 w-full rounded-xl text-[13px] font-semibold transition-colors duration-200"
            style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text3, fontFamily: T.sans }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; e.currentTarget.style.borderColor = T.lineAcc; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
          >
            {w.todayBtn}
          </button>

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
