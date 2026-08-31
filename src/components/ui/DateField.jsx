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

      /* ---------- відрізок ----------

         За замовчуванням react-day-picker робить із діапазону сім
         однакових суцільних квадратів: не видно ні де початок, ні де
         кінець, а сама смуга розсипається на плитки.

         Тому середина — суцільна тонована стрічка на клітинці (не на
         кнопці, інакше між днями лишаються щілини), а краї — заокруглені
         з боку, яким вони дивляться назовні. */
      .edge-daypicker .rdp-range_middle {
        background-color: rgba(${accentRgb},0.13);
      }
      .edge-daypicker .rdp-range_middle .rdp-day_button {
        background-color: transparent;
        color: ${T.text};
        font-weight: 600;
        border-radius: 0;
      }
      .edge-daypicker .rdp-range_middle:hover .rdp-day_button {
        background-color: rgba(${accentRgb},0.18);
      }

      .edge-daypicker .rdp-range_start,
      .edge-daypicker .rdp-range_end {
        background-color: rgba(${accentRgb},0.13);
      }
      /* Крайній день не має тягнути стрічку за межі відрізка. */
      .edge-daypicker .rdp-range_start { border-radius: 10px 0 0 10px; }
      .edge-daypicker .rdp-range_end { border-radius: 0 10px 10px 0; }
      /* Один день — і початок, і кінець водночас. */
      .edge-daypicker .rdp-range_start.rdp-range_end { border-radius: 10px; }

      .edge-daypicker .rdp-range_start .rdp-day_button,
      .edge-daypicker .rdp-range_end .rdp-day_button {
        background-color: ${accent};
        color: #0A0A0C;
        font-weight: 800;
        box-shadow: 0 4px 14px -6px rgba(${accentRgb},0.9);
      }

      /* Стрічка не повинна вилазити за край тижня. */
      .edge-daypicker .rdp-week > td:first-child.rdp-range_middle,
      .edge-daypicker .rdp-week > td:first-child.rdp-range_end {
        border-radius: 10px 0 0 10px;
      }
      .edge-daypicker .rdp-week > td:last-child.rdp-range_middle,
      .edge-daypicker .rdp-week > td:last-child.rdp-range_start {
        border-radius: 0 10px 10px 0;
      }

      .edge-daypicker .rdp-outside .rdp-day_button { color: ${T.text4}; }
      .edge-daypicker .rdp-outside.rdp-range_middle { background-color: rgba(${accentRgb},0.07); }
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

/* ==================================================================
   Період одним полем.

   Два окремі поля «від» і «до» змушували двічі відкривати календар і
   щоразу згадувати, який бік ти зараз задаєш. Тут одна панель:
   готові проміжки зліва, календар справа, і видно, що саме обрано.
================================================================== */

const short = (iso, lang) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString((WORDS[lang] || WORDS.uk).loc, { day: '2-digit', month: 'short' });
};

const shiftDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dayKey(d);
};

/* Готові проміжки. Дев'ять із десяти разів шукають саме їх, і клікати
   заради цього по календарю двічі — зайва робота. */
const PRESETS = [
  { label: '7 днів', range: () => ({ from: shiftDays(6), to: dayKey(new Date()) }) },
  { label: '30 днів', range: () => ({ from: shiftDays(29), to: dayKey(new Date()) }) },
  {
    label: 'Цей місяць',
    range: () => {
      const n = new Date();
      return { from: dayKey(new Date(n.getFullYear(), n.getMonth(), 1)), to: dayKey(n) };
    },
  },
  {
    label: 'Минулий місяць',
    range: () => {
      const n = new Date();
      return {
        from: dayKey(new Date(n.getFullYear(), n.getMonth() - 1, 1)),
        to: dayKey(new Date(n.getFullYear(), n.getMonth(), 0)),
      };
    },
  },
  { label: 'Рік', range: () => ({ from: shiftDays(364), to: dayKey(new Date()) }) },
];

export function DateRangeField({
  value, onChange, lang = 'uk', height = 42, align = 'left',
  placeholder = 'Будь-яка дата', fontSize = 13.5,
}) {
  const from = value?.from || '';
  const to = value?.to || '';

  /* Чи ми зараз посеред вибору.

     Без цього прапорця нічого не працює: react-day-picker на першому
     ж кліку віддає відрізок, у якого `to` дорівнює `from`. Тобто «я
     обрав початок» і «я обрав день у день» приходять однаковими. */
  const [picking, setPicking] = useState(false);

  const selected = {
    from: from ? new Date(`${from}T12:00:00`) : undefined,
    to: to ? new Date(`${to}T12:00:00`) : undefined,
  };

  const text = from || to
    ? `${short(from, lang) || '…'} — ${short(to, lang) || '…'}`
    : placeholder;

  /* Спираємось на день, який натиснули, а не на відрізок, що повернув
     календар. Коли період уже заданий і людина тицяє всередину нього,
     react-day-picker сам вирішує, який кінець посунути, — і починати
     новий вибір із його здогадки означало б ставити не ту дату. */
  const pick = (day) => {
    if (!day) return;
    const clicked = dayKey(day);

    if (!picking) {
      onChange({ from: clicked, to: '' });
      setPicking(true);
      return;
    }

    /* Людина має право тицьнути раніший день другим — це «від нього
       й досі», а не помилка. */
    const [start, end] = from <= clicked ? [from, clicked] : [clicked, from];
    onChange({ from: start, to: end });
    setPicking(false);
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.label;

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
            fontWeight: 500,
            background: T.surface,
            border: `1px solid ${open ? T.lineAcc : T.line}`,
            color: from || to ? T.text : T.text3,
          }}
          onMouseEnter={(e) => { if (!open) e.currentTarget.style.borderColor = T.lineHi; }}
          onMouseLeave={(e) => { if (!open) e.currentTarget.style.borderColor = T.line; }}
        >
          <CalendarRange size={15} strokeWidth={2.2} style={{ color: open ? T.acc : T.text4 }} />
          <span className="min-w-0 flex-1 truncate text-left tabular-nums">{text}</span>
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
          className="flex overflow-hidden rounded-2xl"
          style={{
            background: T.surface,
            border: `1px solid ${T.lineHi}`,
            boxShadow: '0 28px 64px -20px rgba(0,0,0,0.9)',
          }}
        >
          {/* Готові проміжки */}
          <div
            className="flex w-[168px] shrink-0 flex-col gap-1 p-2"
            style={{ borderRight: `1px solid ${T.line}`, background: T.sunken }}
          >
            {PRESETS.map((p) => {
              const on = activePreset === p.label;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onChange(p.range()); setPicking(false); }}
                  className="rounded-lg px-3 text-left transition-colors duration-200"
                  style={{
                    fontFamily: T.sans, height: 36, fontSize: 13.5, fontWeight: 500,
                    background: on ? `rgba(${T.accRgb},0.13)` : 'transparent',
                    color: on ? T.acc : T.text2,
                  }}
                  onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; } }}
                  onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; } }}
                >
                  {p.label}
                </button>
              );
            })}

            <div className="mt-auto" style={{ paddingTop: 8 }}>
              <button
                type="button"
                onClick={() => { onChange({ from: '', to: '' }); setPicking(false); }}
                className="w-full rounded-lg px-3 text-left transition-colors duration-200"
                style={{ fontFamily: T.sans, height: 36, fontSize: 13.5, color: T.text3 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = T.bad; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
              >
                Будь-яка дата
              </button>
            </div>
          </div>

          {/* Календар */}
          <div className="p-2">
            {/* Видно, що вже обрано і чого ще бракує — інакше після
                першого кліку панель мовчить. */}
            <div
              className="mb-2 flex items-center justify-between rounded-xl px-3 py-2"
              style={{ background: T.sunken, border: `1px solid ${T.line}` }}
            >
              <span className="flex items-baseline gap-2">
                <span style={{ fontFamily: T.sans, fontSize: 12, color: T.text3 }}>Від</span>
                <span style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 600, color: from ? T.text : T.text4 }}>
                  {short(from, lang) || '—'}
                </span>
              </span>
              <span className="flex items-baseline gap-2">
                <span style={{ fontFamily: T.sans, fontSize: 12, color: T.text3 }}>До</span>
                <span style={{ fontFamily: T.mono, fontSize: 13.5, fontWeight: 600, color: to ? T.text : T.text4 }}>
                  {to ? short(to, lang) : picking ? 'обери день' : '—'}
                </span>
              </span>
            </div>

            <DayPicker
              mode="range"
              navLayout="around"
              selected={selected.from ? selected : undefined}
              defaultMonth={selected.from}
              onSelect={(_range, day) => pick(day)}
              locale={lang === 'en' ? enGB : uk}
              weekStartsOn={1}
              showOutsideDays
              className="edge-daypicker"
            />

            <button
              type="button"
              onClick={close}
              className="mt-1 h-10 w-full rounded-xl text-[13.5px] font-bold transition-all duration-200"
              style={{
                fontFamily: T.sans,
                background: T.acc,
                color: 'var(--edge-on-acc, #0A0A0C)',
              }}
            >
              Готово
            </button>

            <DaypickerTheme accent={T.acc} accentRgb={T.accRgb} accentBorder={T.lineAcc} />
          </div>
        </div>
      )}
    </Popover>
  );
}
