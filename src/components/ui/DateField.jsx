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
    pick: 'обрати дату', todayBtn: 'Сьогодні', yesterdayBtn: 'Вчора',
    customBtn: 'Своя дата', backBtn: 'Назад', loc: 'uk-UA',
  },
  en: {
    pick: 'pick a date', todayBtn: 'Today', yesterdayBtn: 'Yesterday',
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
    if (iso === today) return w.todayBtn;
    if (iso === yest) return w.yesterdayBtn;
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
/* react-day-picker v9 (не v8!) — інші назви класів і CSS-змінних,
   ніж у поширених прикладах в інтернеті: .rdp-caption → .rdp-
   month_caption, .rdp-day_selected → .rdp-selected, --rdp-cell-size
   → --rdp-day-width/height. Попередня версія цього стилю була
   написана під v8 і жодне правило тут не спрацьовувало — картинка
   малювалась дефолтними стилями бібліотеки, звідси й розʼїжджені
   стрілки (у v9 .rdp-nav за замовчуванням стоїть absolute), і
   фіолетовий колір, якого ми не задавали. Разом з navLayout="around"
   на <DayPicker> (нижче) стрілки тепер завжди в межах сітки днів. */
function DaypickerTheme({ accent, accentRgb, accentBorder }) {
  return (
    <style>{`
      .edge-daypicker {
        /* Сітка днів вужча за попап (34px * 7 ≈ 238px < 268px
           контенту), тому за замовчуванням вона висіла ліворуч з
           порожнім простором справа — центруємо весь блок. */
        display: flex;
        justify-content: center;
        --rdp-accent-color: ${accent};
        --rdp-accent-background-color: rgba(${accentRgb},0.14);
        --rdp-day-width: 34px;
        --rdp-day-height: 34px;
        --rdp-day_button-width: 32px;
        --rdp-day_button-height: 32px;
        --rdp-day_button-border-radius: 10px;
        --rdp-day_button-border: 1px solid transparent;
        --rdp-nav_button-width: 28px;
        --rdp-nav_button-height: 28px;
        --rdp-nav-height: 32px;
        --rdp-today-color: ${accent};
        --rdp-selected-border: 1px solid transparent;
        margin: 0;
        font-family: ${T.sans};
        color: ${T.text2};
      }
      .edge-daypicker .rdp-month_caption {
        font-size: 14px; font-weight: 700; color: ${T.text};
        text-transform: capitalize; letter-spacing: -0.01em;
        justify-content: center;
      }
      .edge-daypicker .rdp-button_previous,
      .edge-daypicker .rdp-button_next {
        color: ${T.text3}; border-radius: 8px;
        transition: background-color .2s, color .2s;
      }
      .edge-daypicker .rdp-button_previous:hover,
      .edge-daypicker .rdp-button_next:hover {
        background-color: ${T.surfaceHi};
      }
      .edge-daypicker .rdp-weekday {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .07em; color: ${T.text4}; opacity: 1;
      }
      .edge-daypicker .rdp-day_button {
        font-size: 13px; font-weight: 600;
        transition: background-color .16s, color .16s, border-color .16s;
      }
      .edge-daypicker .rdp-day:not(.rdp-selected):hover .rdp-day_button {
        background-color: ${T.surfaceHi};
        color: ${T.text};
      }
      .edge-daypicker .rdp-today:not(.rdp-selected) .rdp-day_button {
        color: ${accent};
        border-color: ${accentBorder};
      }
      .edge-daypicker .rdp-selected .rdp-day_button {
        background-color: ${accent};
        color: #0A0A0C;
        font-weight: 800;
      }
      .edge-daypicker .rdp-outside .rdp-day_button { color: ${T.text4}; }
      .edge-daypicker .rdp-chevron { fill: currentColor; }
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
          navLayout="around"
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
    { key: 'yesterday', icon: History, label: w.yesterdayBtn, sub: shortDay(yesterday, loc), iso: yestKey },
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
              navLayout="around"
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
