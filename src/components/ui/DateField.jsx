import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { uk, enGB } from 'date-fns/locale';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Sun, History, CalendarRange, Check } from 'lucide-react';
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
  uk: {
    pick: 'обрати дату', today: 'сьогодні', yesterday: 'вчора', todayBtn: 'Сьогодні', yesterdayBtn: 'Вчора',
    customBtn: 'Своя дата', backBtn: 'Назад', loc: 'uk-UA',
  },
  en: {
    pick: 'pick a date', today: 'today', yesterday: 'yesterday', todayBtn: 'Today', yesterdayBtn: 'Yesterday',
    customBtn: 'Custom date', backBtn: 'Back', loc: 'en-GB',
  },
};

const label = (iso, lang, alwaysNumeric, monthStyle) => {
  const w = WORDS[lang] || WORDS.uk;
  if (!iso) return w.pick;
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;

  if (!alwaysNumeric) {
    const today = dayKey(new Date());
    const yest = dayKey(new Date(Date.now() - 86400000));
    if (iso === today) return w.today;
    if (iso === yest) return w.yesterday;
  }

  if (alwaysNumeric) {
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  return d.toLocaleDateString(w.loc, { day: 'numeric', month: monthStyle || 'long', year: 'numeric' })
    .replace(/\sр\./, '')
    .replace(monthStyle === 'short' ? /\.(?=\s|$)/ : /(?!)/, '');
};

const shortDay = (d, loc) => d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });

/* Денна CSS-тема react-day-picker — винесена окремо, бо однакова і
   для звичайного, і для quick-picks режиму. */
function DaypickerTheme({ accent, accentRgb, accentBorder }) {
  return (
    <style>{`
      .edge-daypicker {
        --rdp-cell-size: 38px;
        --rdp-accent-color: ${accent};
        --rdp-background-color: rgba(${accentRgb},0.14);
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
        color: ${accent}; border-color: ${accentBorder};
      }
      .edge-daypicker .rdp-day_selected,
      .edge-daypicker .rdp-day_selected:hover {
        background: ${accent} !important; color: #0A0A0C !important; font-weight: 800;
      }
      .edge-daypicker .rdp-day_outside { color: ${T.text4}; opacity: .55; }
    `}</style>
  );
}

/* Двокроковий пікер: спершу три великі кнопки (сьогодні / вчора /
   своя дата), і лише якщо тиснеш «своя дата» — розгортається
   календар. Власний стан кроку живе тут і скидається щоразу, коли
   попап монтується заново (Popover розмонтовує вміст при закритті). */
function QuickDateMenu({ value, onChange, close, lang, accent, accentRgb, accentBorder, w }) {
  const [step, setStep] = useState('menu');

  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const todayKey = dayKey(today);
  const yestKey = dayKey(yesterday);
  const loc = w.loc;
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const isCustom = value && value !== todayKey && value !== yestKey;

  const pick = (iso) => { onChange(iso); close(); };

  if (step === 'calendar') {
    return (
      <div
        className="w-[300px] rounded-2xl p-2"
        style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
      >
        <button
          type="button"
          onClick={() => setStep('menu')}
          className="mb-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold transition-colors duration-150"
          style={{ color: T.text3, fontFamily: T.sans }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
        >
          <ChevronLeft size={14} strokeWidth={2.4} /> {w.backBtn}
        </button>
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => { if (d) pick(dayKey(d)); }}
          locale={lang === 'en' ? enGB : uk}
          weekStartsOn={1}
          showOutsideDays
          className="edge-daypicker"
        />
        <DaypickerTheme accent={accent} accentRgb={accentRgb} accentBorder={accentBorder} />
      </div>
    );
  }

  const options = [
    { key: 'today', icon: Sun, label: w.todayBtn, sub: shortDay(today, loc), iso: todayKey },
    { key: 'yesterday', icon: History, label: w.yesterday === 'yesterday' ? 'Yesterday' : 'Вчора', sub: shortDay(yesterday, loc), iso: yestKey },
  ];

  return (
    <div
      className="w-[240px] rounded-2xl p-1.5"
      style={{ background: T.surface, border: `1px solid ${T.lineHi}`, boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)' }}
    >
      {options.map((opt) => {
        const active = value === opt.iso;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => pick(opt.iso)}
            className="quick-date-row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150"
            style={{ background: active ? `rgba(${accentRgb},0.12)` : 'transparent' }}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
              style={{ background: active ? `rgba(${accentRgb},0.18)` : T.sunken, color: active ? accent : T.text3 }}
            >
              <opt.icon size={15} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: active ? T.text : T.text2 }}>
                {opt.label}
              </span>
              <span className="block truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {opt.sub}
              </span>
            </span>
            {active && <Check size={15} strokeWidth={2.8} style={{ color: accent }} />}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setStep('calendar')}
        className="quick-date-row flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150"
        style={{ background: isCustom ? `rgba(${accentRgb},0.12)` : 'transparent' }}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: isCustom ? `rgba(${accentRgb},0.18)` : T.sunken, color: isCustom ? accent : T.text3 }}
        >
          <CalendarRange size={15} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: isCustom ? T.text : T.text2 }}>
            {w.customBtn}
          </span>
          <span className="block truncate text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
            {isCustom ? shortDay(selected, loc) : (lang === 'en' ? 'pick from calendar' : 'вибрати з календаря')}
          </span>
        </span>
        <ChevronRight size={14} strokeWidth={2.4} style={{ color: T.text4 }} />
      </button>

      <style>{`
        .quick-date-row:hover { background: ${T.surfaceHi} !important; }
      `}</style>
    </div>
  );
}

export default function DateField({
  value, onChange, align = 'left', lang = 'uk', height = 44, alwaysNumeric = false, monthStyle,
  quickPicks = false,
  accent = T.acc, accentRgb = T.accRgb, accentBorder = T.lineAcc, hoverBorder = T.lineHi,
  fontSize = 14, fontWeight = 400,
}) {
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
          className="flex w-full items-center gap-2.5 rounded-xl px-3.5 transition-colors duration-200"
          style={{
            height,
            fontFamily: T.sans,
            fontSize,
            fontWeight,
            background: T.sunken,
            border: `1px solid ${open ? accentBorder : T.line}`,
            color: value ? T.text : T.text4,
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = hoverBorder; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
        >
          <CalendarDays size={15} strokeWidth={2.2} style={{ color: open ? accent : T.text4 }} />
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{label(value, lang, alwaysNumeric, monthStyle)}</span>
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
        quickPicks ? (
          <QuickDateMenu
            value={value}
            onChange={onChange}
            close={close}
            lang={lang}
            accent={accent}
            accentRgb={accentRgb}
            accentBorder={accentBorder}
            w={w}
          />
        ) : (
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
              onMouseEnter={(e) => { e.currentTarget.style.color = accent; e.currentTarget.style.borderColor = accentBorder; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
            >
              {w.todayBtn}
            </button>

            <DaypickerTheme accent={accent} accentRgb={accentRgb} accentBorder={accentBorder} />
          </div>
        )
      )}
    </Popover>
  );
}
