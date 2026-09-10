import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Bell,
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Globe,
  X,
} from "lucide-react";

import { T, EASE, useEdgeFonts } from "../lib/theme";
import {
  IMPACTS,
  WEEK_SPAN,
  impactOf,
  fetchWeek,
  fetchDescription,
  describe,
  ALERTS_KEY,
  normalizeAlerts,
} from "../lib/newsStore";
import {
  LEAD_MIN,
  LEAD_OPTIONS,
  ALERT_EVENT,
  leadLabel,
  askNotifyPermission,
  startNewsWatcher,
} from "../lib/newsAlerts";
import {
  flagSrc,
  warmFlags,
  subscribe as flagsSubscribe,
  getVersion as flagsVersion,
} from "../lib/flags";
import useCloudState from "../hooks/useCloudState";

/* ==================================================================
   Календар економічних новин.

   Сімдесят подій на тиждень — це список, який неможливо прочитати
   цілком, і не треба. Людина приходить сюди з одним із двох питань:
   «що сьогодні може рознести мій стоп» і «коли саме».

   Звідси вся будова сторінки:

   · тижнева стрічка зверху — навігатор, а не фільтр. Клік по дню
     перемотує список до нього, але нічого не ховає: п'ятницю з
     шістьма важливими подіями видно одразу, і при цьому лишається
     видно, що було до неї;
   · червоні крапки на картці дня — по одній за кожну важливу подію.
     Вага дня читається, не заходячи в день;
   · рядок «далі» — найближчі події одним блоком із зворотним
     відліком: питання «коли» має відповідь ще до того, як почав
     гортати;
   · опис вантажиться тільки в момент розгортання. Тягнути сімдесят
     описів заради двох, які реально відкриють, безглуздо.
================================================================== */

const A = (a) => `rgba(${T.accRgb}, ${a})`;

/* Джерело деталізованіше за ForexFactory: крім самих релізів воно
   віддає їхні підкомпоненти — Overtime Pay, GDP Price Index, залишки
   резервів. Це не сміття, але й не те, заради чого відкривають
   календар, тому за замовчуванням список стоїть на «середній і
   вище»: так сторінка виглядає як звичний FF, а повний обсяг лежить
   за одним кліком у тому ж фільтрі й нікуди не дівається. */
const MAJOR = "major";
const isMajor = (r) => r.impact !== "Low";

/* Порядок валют у фільтрі. Алфавіт тут ні до чого: він ставить
   першими AUD і «All», яких ніхто не шукає, а EUR з USD ховає в
   середину. Спершу те, чим торгують найчастіше, решта за абеткою. */
const CCY_ORDER = ["EUR", "USD", "GBP", "JPY"];

/* Тиждень — це зсув від поточного: 0 сьогоднішній, -1 минулий, 2
   через два. Раніше стрілки ходили по трьох фіксованих словах, бо
   стільки віддавав старий фід; тепер джерело знає довільні дати. */

const isPast = (at) => !!at && at.getTime() < Date.now();

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const isToday = (iso) => iso === dayKey(new Date());

const DAY_FMT = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};

const evWord = (n) => `${n} ${plural(n, "подія", "події", "подій")}`;

/* Знахідний відмінок для «Показати …»: «показати 1 подія» ріже око. */
const evWordAcc = (n) => `${n} ${plural(n, "подію", "події", "подій")}`;

/* ---------- згорнуті дні ----------

   Тиждень — це під сотню подій, і людина приходить не за всіма
   одразу: щоб дістатись до сьогодні, доводиться прогортати два
   попередні дні цілком. Тому дні згортаються, а вибір лежить у
   localStorage — інакше кожен захід у календар починався б з
   того самого згортання вручну.

   Дефолт кращий за порожній стан: минулі дні згорнуті самі, бо
   те, що вже вийшло, читають рідше, ніж те, що попереду. Явний
   клік користувача перекриває дефолт і живе далі. */
const FOLD_KEY = "edge.news.folds";

const readFolds = () => {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
};

/* Ключі — це дати, тож без прибирання мапа росла б вічно. Місяця
   вистачає: тижнева стрічка ходить максимум на тиждень назад. */
const writeFolds = (v) => {
  const edge = new Date();
  edge.setDate(edge.getDate() - 31);
  const keep = dayKey(edge);
  const clean = Object.fromEntries(
    Object.entries(v).filter(([iso]) => iso >= keep),
  );
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify(clean));
  } catch {
    /* приватний режим або переповнене сховище — не привід падати */
  }
};

/* Порівняння факту з прогнозом. Просте віднімання не годиться:
   значення бувають «208K», «-99.9B», «0.2%». */
const num = (v) => {
  if (!v) return null;
  const m = String(v)
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/K/i.test(v)) n *= 1e3;
  if (/M/i.test(v)) n *= 1e6;
  if (/B/i.test(v)) n *= 1e9;
  if (/T/i.test(v)) n *= 1e12;
  return n;
};

/* Різницю треба показувати в тих одиницях, у яких прийшло число:
   «+0.4» без знака відсотка чи без K нічого не означає. */
const SCALE = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

const unitOf = (raw) => {
  const t = String(raw || "");
  if (t.includes("%")) return "%";
  const m = t.match(/[KMBT]/i);
  return m ? m[0].toUpperCase() : "";
};

const fmtDelta = (d, unit) => {
  const v = d / (SCALE[unit] || 1);
  const abs = Math.abs(v);
  const fixed = v.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2);
  const trim = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  return `${v > 0 ? "+" : ""}${trim}${unit}`;
};

const surprise = (actual, forecast) => {
  const a = num(actual);
  const f = num(forecast);
  if (a === null || f === null || a === f) return 0;
  return a > f ? 1 : -1;
};

/* ---------- прапор валюти ----------

   Підписка на кеш, а не власний стан: коли прогрів дотягне картинки,
   перемалюються всі прапори одразу, і жоден рядок не тримає для
   цього окремого стану. */
function Flag({ ccy, size = 18 }) {
  useSyncExternalStore(flagsSubscribe, flagsVersion, flagsVersion);
  const src = flagSrc(ccy);

  if (!src) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full text-[8px] font-bold"
        style={{
          width: size,
          height: size,
          background: "var(--edge-hair)",
          color: T.text3,
          fontFamily: T.mono,
        }}
        aria-hidden
      >
        ★
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-full object-cover"
      style={{
        width: size,
        height: size,
        boxShadow: "0 0 0 1px var(--edge-hair-strong)",
      }}
    />
  );
}

/* ---------- випадашка в шапці ---------- */

function DropButton({ open, active, color, children, onClick }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 sm:w-auto sm:min-w-[168px]"
      style={{
        background: open || hov ? "var(--edge-hair-strong)" : "var(--edge-hair)",
        border: `1px solid ${open || active ? `${color}80` : "var(--edge-line)"}`,
        transition: "all .16s",
      }}
    >
      {children}
      <ChevronDown
        size={13}
        strokeWidth={1.9}
        style={{
          color: "var(--edge-text2)",
          flex: "none",
          transform: `rotate(${open ? 180 : 0}deg)`,
          transition: "transform .2s",
        }}
      />
    </button>
  );
}

const Panel = ({ width, align = "right", children }) => (
  <div
    className={`absolute z-40 mt-2 rounded-2xl p-1.5 sm:left-auto sm:right-0 ${
      align === "left" ? "left-0" : "right-0"
    }`}
    style={{
      top: "100%",
      width,
      maxWidth: "calc(100vw - 24px)",
      background: "var(--edge-surface)",
      border: "1px solid var(--edge-line-hi)",
      boxShadow: "0 26px 54px -18px var(--edge-panel-glow, rgba(0,0,0,0.5))",
    }}
  >
    {children}
  </div>
);

/* ---------- картка дня у стрічці ---------- */

function StripDay({ day, active, onPick, onSolo, solo }) {
  const [hov, setHov] = useState(false);
  const empty = !day.total;

  /* По одній крапці за кожну важливу подію, максимум п'ять плюс
     блідий хвостик: рахувати шість крапок оком уже не виходить, а
     «багато важливого» видно й так. */
  const dots = [];
  const shown = Math.min(day.high, 5);
  for (let i = 0; i < shown; i += 1) {
    dots.push(
      <span
        key={i}
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: "var(--edge-bad)", boxShadow: "0 0 7px 1px rgba(var(--edge-bad-rgb),0.50)" }}
      />,
    );
  }
  if (day.high > 5)
    dots.push(
      <span
        key="more"
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: "rgba(var(--edge-bad-rgb),0.35)" }}
      />,
    );
  if (!day.high && !empty)
    dots.push(
      <span
        key="dash"
        className="h-[3px] w-4 rounded-full"
        style={{ background: "var(--edge-line-hi)" }}
      />,
    );

  return (
    <button
      onClick={empty ? undefined : onPick}
      onDoubleClick={empty ? undefined : onSolo}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      data-strip-active={active ? "1" : undefined}
      title={
        empty
          ? "Подій немає"
          : "Клік — перейти до дня, подвійний — показати тільки його"
      }
      className="relative w-[60px] shrink-0 snap-start overflow-hidden rounded-[15px] px-3 pb-2.5 pt-3 text-left sm:w-auto sm:px-3.5 sm:pb-3 sm:pt-3.5"
      style={{
        background: active
          ? "linear-gradient(165deg, rgba(var(--edge-acc-rgb),0.14), var(--edge-surface))"
          : hov
            ? "var(--edge-surface)"
            : "var(--edge-sunken)",
        border: `1px solid ${solo ? A(1) : active ? A(0.5) : hov ? "var(--edge-line-hi)" : "var(--edge-line)"}`,
        boxShadow: active ? `0 18px 40px -22px ${A(0.8)}` : "none",
        transform: `translateY(${active ? "-3px" : hov ? "-1px" : "0"})`,
        opacity: empty ? 0.62 : 1,
        cursor: empty ? "default" : "pointer",
        transition:
          "transform .26s cubic-bezier(.22,1.2,.36,1), border-color .18s, background .18s, box-shadow .24s",
      }}
    >
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          left: -30,
          top: -50,
          width: 150,
          height: 120,
          background: T.acc,
          filter: "blur(44px)",
          opacity: active ? 0.22 : 0,
          transition: "opacity .24s",
        }}
      />

      <span className="relative flex items-baseline justify-between gap-1.5">
        <span
          className="text-[9px] font-bold uppercase sm:text-[9.5px]"
          style={{
            fontFamily: T.mono,
            letterSpacing: "1.6px",
            color: active ? "var(--edge-acc)" : "var(--edge-text3)",
          }}
        >
          {day.dow}
        </span>
        <span
          className="text-[19px] sm:text-[23px]"
          style={{
            fontFamily: T.display,
            fontWeight: 700,
            letterSpacing: "-1px",
            lineHeight: 1,
            color: active ? "var(--edge-text)" : empty ? "var(--edge-text4)" : "var(--edge-text2)",
          }}
        >
          {day.num}
        </span>
      </span>

      <span className="relative mt-2.5 flex h-3 items-center gap-1 sm:mt-3">{dots}</span>

      <span
        className="relative mt-2 block truncate text-[10px] font-semibold sm:mt-2.5 sm:text-[11px]"
        style={{
          fontFamily: T.sans,
          color: active ? "var(--edge-acc)" : empty ? "var(--edge-text4)" : "var(--edge-text3)",
          transition: "color .18s",
        }}
      >
        {solo ? "тільки цей" : empty ? "вихідний" : evWord(day.total)}
      </span>
    </button>
  );
}

/* ---------- дзвіночок із вибором часу ----------

   Один клік ставить нагадування за замовчуванням, стрілка поруч
   відкриває список. Так найчастіший випадок лишається в один рух, а
   вибір «за 30 хвилин» не вимагає лізти в налаштування. */

function BellPick({ watched, lead, hovered, label, onPick }) {
  const [open, setOpen] = useState(false);
  /* Меню живе в <body>, а не поруч із кнопкою: картка події має
     overflow:hidden заради власного світіння, і випадашка всередині
     неї обрізалась би до кількох пікселів. Тому позицію рахуємо від
     кнопки і малюємо поверх усього. */
  const [at, setAt] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (!box.current?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span className="relative" onClick={(e) => e.stopPropagation()}>
      <span
        role="button"
        tabIndex={-1}
        className={
          label
            ? "flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-[11px] px-[15px]"
            : "grid h-7 w-7 cursor-pointer place-items-center rounded-lg"
        }
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          /* Події внизу екрана: меню, що відкривається вниз, поїхало б
             за край вікна. Не влазить — розкриваємо вгору. */
          const h = watched ? 288 : 244;
          const down = r.bottom + 6 + h < window.innerHeight - 8;
          setAt({
            top: down ? r.bottom + 6 : Math.max(8, r.top - h - 6),
            right: window.innerWidth - r.right,
          });
          setOpen((v) => !v);
        }}
        title={watched ? `Нагадаю ${leadLabel(lead)} — змінити` : "Нагадати"}
        style={{
          color: watched ? (label ? "var(--edge-acc)" : T.acc) : open || hovered ? "var(--edge-text2)" : "var(--edge-text4)",
          background: watched ? A(label ? 0.18 : 0.12) : open ? "var(--edge-hair)" : label ? "var(--edge-hair)" : "transparent",
          border: label ? `1px solid ${watched ? A(0.6) : "var(--edge-line-hi)"}` : "none",
          boxShadow: label && watched ? `0 0 22px -8px ${A(0.8)}` : "none",
          transition: "all .16s",
        }}
      >
        {watched ? (
          <BellRing size={label ? 14 : 14} strokeWidth={label ? 1.9 : 2.2} />
        ) : (
          <Bell size={14} strokeWidth={label ? 1.9 : 2.2} />
        )}
        {label && (
          <span
            className="whitespace-nowrap text-[12px] font-bold"
            style={{ fontFamily: T.sans }}
          >
            {label}
          </span>
        )}
        {label && (
          <ChevronDown
            size={13}
            strokeWidth={2.2}
            style={{
              opacity: 0.7,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform .2s",
            }}
          />
        )}
      </span>

      {open &&
        at &&
        createPortal(
        <div
          ref={box}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-[90] w-[190px] rounded-2xl p-1.5"
          style={{
            top: at.top,
            right: at.right,
            background: "var(--edge-surface)",
            border: "1px solid var(--edge-line-hi)",
            boxShadow: "0 26px 54px -18px var(--edge-panel-glow, rgba(0,0,0,0.5))",
          }}
        >
          <span
            className="block px-2.5 pb-1.5 pt-1 text-[9px] font-bold uppercase"
            style={{
              fontFamily: T.mono,
              letterSpacing: "1.6px",
              color: "var(--edge-text3)",
            }}
          >
            Нагадати
          </span>

          {LEAD_OPTIONS.map((o) => {
            const on = watched && lead === o.min;
            return (
              <button
                key={o.min}
                onClick={() => {
                  onPick(o.min);
                  setOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] font-semibold"
                style={{
                  fontFamily: T.sans,
                  background: on ? A(0.17) : "transparent",
                  color: on ? "var(--edge-text)" : "var(--edge-text3)",
                  transition: "all .14s",
                }}
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{
                    background: on ? T.acc : "var(--edge-line-hi)",
                    boxShadow: on ? `0 0 8px 1px ${A(0.8)}` : "none",
                  }}
                />
                {o.label}
              </button>
            );
          })}

          {watched && (
            <>
              <span
                className="mx-1 my-1 block h-px"
                style={{ background: "var(--edge-line)" }}
              />
              <button
                onClick={() => {
                  onPick(null);
                  setOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: "var(--edge-bad)" }}
              >
                <X size={12} strokeWidth={2.4} />
                Прибрати нагадування
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
    </span>
  );
}

/* ---------- одна подія ---------- */

function EventRow({ ev, watched, lead, onWatch, canWatch }) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);
  /* undefined — ще не питали, false — питали й не знайшли,
     обʼєкт — знайшли. */
  const [ext, setExt] = useState(undefined);
  const asked = useRef(false);

  const imp = impactOf(ev.impact);
  const high = ev.impact === "High";
  const past = isPast(ev.at);
  const mine = describe(ev.title);
  const sur = surprise(ev.actual, ev.forecast);
  const loading = open && ext === undefined;

  useEffect(() => {
    if (!open || asked.current) return undefined;
    asked.current = true;
    let alive = true;
    fetchDescription(ev.title, ev.ccy).then((d) => {
      if (alive) setExt(d || false);
    });
    return () => {
      alive = false;
    };
  }, [open, ev.title, ev.ccy]);

  const actColor = ev.actual
    ? sur > 0
      ? "var(--edge-ok)"
      : sur < 0
        ? "var(--edge-bad)"
        : "var(--edge-text)"
    : "var(--edge-text4)";

  const cell = (v, color, weight, hideMobile) => (
    <span
      className={`${hideMobile ? "hidden sm:block " : ""}w-[62px] shrink-0 text-right text-[13px] sm:w-[88px] sm:text-[15px]`}
      style={{
        fontFamily: T.display,
        fontWeight: weight,
        letterSpacing: "-0.2px",
        color: v ? color : "var(--edge-text4)",
      }}
    >
      {v || "—"}
    </span>
  );

  /* Ринок рухає не саме число, а розбіжність із тим, чого чекали:
     0.3% при прогнозі 0.3% не варті нічого, а ті самі 0.3% при
     прогнозі 0.8% розвертають пару. Тому в панелі одна велика
     величина — розрив, — а не діаграма з двох стовпчиків, яка
     повторює цифри з рядка й до того ж бреше пропорціями, коли
     значення різного знаку.

     Поки факту немає, показуємо очікуваний зсув: наскільки прогноз
     відходить від попереднього значення. */
  const gap = (() => {
    const a = num(ev.actual);
    const f = num(ev.forecast);
    const p = num(ev.previous);
    if (a !== null && f !== null)
      return { done: true, d: a - f, unit: unitOf(ev.actual || ev.forecast) };
    if (f !== null && p !== null)
      return {
        done: false,
        d: f - p,
        unit: unitOf(ev.forecast || ev.previous),
      };
    return null;
  })();

  const facts = [
    { label: "факт", raw: ev.actual },
    { label: "прогноз", raw: ev.forecast },
    { label: "було", raw: ev.previous },
  ].filter((b) => b.raw);

  return (
    <div>
      <div
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        className="flex cursor-pointer items-stretch"
      >
        <div
          className="flex w-[46px] shrink-0 flex-col items-end justify-center pr-2 sm:w-[74px] sm:pr-3"
          style={{ minHeight: high ? 60 : 52 }}
        >
          <span
            className="text-[12px] sm:text-[13px]"
            style={{
              fontFamily: T.mono,
              letterSpacing: "0.6px",
              fontWeight: 700,
              color: past ? "var(--edge-text4)" : high ? "var(--edge-text)" : "var(--edge-text3)",
            }}
          >
            {ev.time || "—"}
          </span>
        </div>

        <div className="flex w-5 shrink-0 items-start justify-center pt-[19px] sm:w-7 sm:pt-[22px]">
          <span
            className="rounded-full"
            style={{
              width: 9,
              height: 9,
              background: high ? imp.color : "var(--edge-sunken)",
              border: `2px solid ${high ? imp.color : hov || open ? `${imp.color}99` : "var(--edge-line-hi)"}`,
              boxShadow: high
                ? `0 0 0 3px ${imp.color}24, 0 0 12px 2px ${imp.color}80`
                : "none",
              transition: "all .18s",
            }}
          />
        </div>

        <div
          className="relative flex min-w-0 flex-1 items-center gap-2 overflow-hidden pl-3 pr-2 sm:gap-3.5 sm:pl-[18px] sm:pr-3"
          style={{
            minHeight: high ? 60 : 52,
            borderRadius: open ? "14px 14px 0 0" : 14,
            background: open
              ? "var(--edge-surface)"
              : hov
                ? high
                  ? "var(--edge-surface-hi)"
                  : "var(--edge-surface)"
                : high
                  ? "var(--edge-sunken)"
                  : "var(--edge-sunken)",
            border: `1px solid ${open ? `${imp.color}5e` : hov ? `${imp.color}4d` : high ? "var(--edge-line)" : "var(--edge-line)"}`,
            transform: `translateX(${hov && !open ? "3px" : "0"})`,
            opacity: past && !ev.actual && !hov && !open ? 0.78 : 1,
            transition: "background .18s, border-color .18s, transform .22s",
          }}
        >
          <span
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{
              background: `linear-gradient(180deg, ${imp.color}, ${imp.color}2b)`,
              opacity: high ? 1 : hov || open ? 0.8 : 0.28,
              transition: "opacity .18s",
            }}
          />
          <span
            className="pointer-events-none absolute rounded-full"
            style={{
              left: -40,
              top: -60,
              width: 220,
              height: 150,
              background: imp.color,
              filter: "blur(52px)",
              opacity: high
                ? hov || open
                  ? 0.16
                  : 0.09
                : hov || open
                  ? 0.08
                  : 0,
              transition: "opacity .24s",
            }}
          />

          <span
            className="relative flex h-[25px] w-[52px] shrink-0 items-center justify-center gap-1 rounded-lg sm:w-[62px] sm:gap-1.5"
            style={{
              background: high ? `${imp.color}1f` : "var(--edge-hair)",
              border: `1px solid ${high ? `${imp.color}42` : "var(--edge-line)"}`,
              color: high ? "var(--edge-bad)" : "var(--edge-text2)",
            }}
          >
            <Flag ccy={ev.ccy} size={13} />
            <span
              style={{
                fontFamily: T.mono,
                fontSize: 10.5,
                letterSpacing: "0.6px",
                fontWeight: 700,
              }}
            >
              {ev.ccy}
            </span>
          </span>

          <span className="relative flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <span
              className={`min-w-0 truncate ${high ? "text-[14.5px] sm:text-[16.5px]" : "text-[13.5px] sm:text-[14.5px]"}`}
              style={{
                fontFamily: T.display,
                fontWeight: high ? 600 : 500,
                letterSpacing: "-0.3px",
                color: high ? "var(--edge-text)" : hov || open ? "var(--edge-text)" : "var(--edge-text2)",
                transition: "color .18s",
              }}
            >
              {ev.title}
            </span>
            {high && (
              <span className="hidden shrink-0 items-center gap-[3px] sm:flex">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-3 w-[3px] rounded-sm"
                    style={{ background: "var(--edge-bad)" }}
                  />
                ))}
              </span>
            )}
          </span>

          <span className="relative flex w-[54px] shrink-0 items-center justify-end gap-1 sm:w-[88px] sm:gap-1.5">
            <span
              className="hidden text-[15px] sm:inline"
              style={{
                fontFamily: T.display,
                fontWeight: ev.actual ? 700 : 500,
                letterSpacing: "-0.2px",
                color: actColor,
              }}
            >
              {ev.actual || "—"}
            </span>
            <span
              className="text-[13px] sm:hidden"
              style={{
                fontFamily: T.display,
                fontWeight: ev.actual ? 700 : 500,
                letterSpacing: "-0.2px",
                color: ev.actual ? actColor : "var(--edge-text3)",
              }}
            >
              {ev.actual || ev.forecast || "—"}
            </span>
            {!!sur && ev.actual && (
              <span
                style={{
                  fontSize: 9,
                  lineHeight: 1,
                  color: sur > 0 ? "var(--edge-ok)" : "var(--edge-bad)",
                }}
              >
                {sur > 0 ? "▲" : "▼"}
              </span>
            )}
          </span>

          <span className="relative hidden sm:block">{cell(ev.forecast, "var(--edge-text2)", 600, true)}</span>
          <span className="relative hidden sm:block">{cell(ev.previous, "var(--edge-text3)", 500, true)}</span>

          <span className="relative flex w-7 shrink-0 items-center justify-end gap-1 sm:w-9">
            {!past && canWatch && (
              <BellPick
                watched={watched}
                lead={lead}
                hovered={hov}
                onPick={(min) => onWatch(ev, min)}
              />
            )}
            <ChevronDown
              size={14}
              strokeWidth={2}
              style={{
                color: hov || open ? "var(--edge-text2)" : "var(--edge-text4)",
                transform: open ? "rotate(180deg)" : "none",
                transition: "transform .22s, color .18s",
              }}
            />
          </span>
        </div>
      </div>

      {/* Розкриття зроблено на grid-rows, а не на анімації висоти:
          коли рух вимкнено (у налаштуваннях чи в системі), твін
          висоти має шанс застигнути на нулі — і панель тихо не
          відкривається. CSS-перехід у найгіршому разі просто
          спрацьовує миттєво. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition:
            "grid-template-rows .26s cubic-bezier(.22,1,.36,1), opacity .2s",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="flex">
            <div className="w-[66px] shrink-0 sm:w-[102px]" />
            <div
              className="min-w-0 flex-1 overflow-hidden"
              style={{
                border: `1px solid ${imp.color}5e`,
                borderTopWidth: 0,
                borderRadius: "0 0 14px 14px",
                background: "linear-gradient(180deg,var(--edge-sunken),var(--edge-sunken))",
              }}
            >
              {/* На вузькому екрані назва події в рядку майже не
                  вміщається — дублюємо її повністю тут, у шапці
                  розкритої панелі. На десктопі назва в рядку видна,
                  тож блок непотрібен. */}
              <div
                className="flex items-center gap-2.5 px-4 py-3.5 sm:hidden"
                style={{ borderBottom: `1px solid ${imp.color}3d` }}
              >
                <span
                  className="flex h-[24px] shrink-0 items-center gap-1 rounded-lg px-1.5"
                  style={{
                    background: high ? `${imp.color}1f` : "var(--edge-hair)",
                    border: `1px solid ${high ? `${imp.color}42` : "var(--edge-line)"}`,
                    color: high ? "var(--edge-bad)" : "var(--edge-text2)",
                  }}
                >
                  <Flag ccy={ev.ccy} size={12} />
                  <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: "0.5px", fontWeight: 700 }}>
                    {ev.ccy}
                  </span>
                </span>
                <span
                  className="min-w-0 flex-1 leading-snug"
                  style={{
                    fontFamily: T.display,
                    fontSize: 14.5,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                    color: "var(--edge-text)",
                  }}
                >
                  {ev.title}
                </span>
                {ev.time && (
                  <span
                    className="shrink-0"
                    style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 700, color: "var(--edge-text3)" }}
                  >
                    {ev.time}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-stretch">
                <div className="min-w-0 flex-1 px-4 py-4 sm:min-w-[300px] sm:px-6 sm:py-5">
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{
                      fontFamily: T.mono,
                      letterSpacing: "1.8px",
                      color: "var(--edge-text3)",
                    }}
                  >
                    Що це означає
                  </span>

                  {mine && (
                    <p
                      className="mt-3 text-[13.5px]"
                      style={{
                        fontFamily: T.sans,
                        color: "var(--edge-text)",
                        lineHeight: 1.65,
                      }}
                    >
                      {mine}
                    </p>
                  )}

                  {loading && (
                    <Loader2
                      size={15}
                      className="mt-3 animate-spin"
                      style={{ color: T.text3 }}
                    />
                  )}

                  {ext && (
                    <p
                      className="mt-3 text-[13.5px]"
                      style={{
                        fontFamily: T.sans,
                        color: "var(--edge-text2)",
                        lineHeight: 1.65,
                      }}
                    >
                      {ext.text}
                    </p>
                  )}

                  {ext === false && !mine && (
                    <p
                      className="mt-3 text-[13px]"
                      style={{ fontFamily: T.sans, color: "var(--edge-text3)" }}
                    >
                      Опису для цієї події знайти не вдалось.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2.5">
                    {ext?.url && (
                      <a
                        href={ext.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-semibold"
                        style={{
                          background: "var(--edge-hair)",
                          border: "1px solid var(--edge-line)",
                          color: "var(--edge-acc)",
                        }}
                      >
                        {ext.title || ext.source}
                        <ExternalLink size={12} strokeWidth={1.9} />
                      </a>
                    )}

                    {!past && canWatch && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onWatch(ev, watched ? null : LEAD_MIN);
                        }}
                        className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-semibold"
                        style={{
                          background: watched ? A(0.18) : "var(--edge-hair)",
                          border: `1px solid ${watched ? A(0.5) : "var(--edge-line)"}`,
                          color: watched ? "var(--edge-acc)" : "var(--edge-text2)",
                          transition: "all .16s",
                        }}
                      >
                        {watched ? (
                          <BellRing size={12} strokeWidth={2} />
                        ) : (
                          <Bell size={12} strokeWidth={2} />
                        )}
                        {watched ? `Нагадаю за ${leadLabel(lead)}` : "Нагадати"}
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="h-px w-full shrink-0 sm:h-auto sm:w-px"
                  style={{ background: "var(--edge-line)" }}
                />

                <div className="w-full shrink-0 px-4 py-4 sm:w-[280px] sm:px-[22px] sm:py-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="text-[10px] font-bold uppercase"
                      style={{
                        fontFamily: T.mono,
                        letterSpacing: "1.8px",
                        color: "var(--edge-text3)",
                      }}
                    >
                      {gap && !gap.done ? "Очікують" : "Сюрприз"}
                    </span>
                    <span
                      className="rounded-full px-2.5 py-[3px] text-[10px] font-bold"
                      style={{
                        background: `${imp.color}1f`,
                        border: `1px solid ${imp.color}4d`,
                        color: imp.color,
                        fontFamily: T.sans,
                      }}
                    >
                      {imp.label}
                    </span>
                  </div>

                  {gap ? (
                    <>
                      <div className="mt-3.5 flex items-baseline gap-2">
                        <span
                          style={{
                            fontFamily: T.display,
                            fontSize: 30,
                            fontWeight: 700,
                            letterSpacing: "-1.2px",
                            lineHeight: 1,
                            color: !gap.done
                              ? "var(--edge-text2)"
                              : gap.d > 0
                                ? "var(--edge-ok)"
                                : gap.d < 0
                                  ? "var(--edge-bad)"
                                  : "var(--edge-text)",
                          }}
                        >
                          {gap.d === 0 ? "0" : fmtDelta(gap.d, gap.unit)}
                        </span>
                        {gap.d !== 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: !gap.done
                                ? "var(--edge-text3)"
                                : gap.d > 0
                                  ? "var(--edge-ok)"
                                  : "var(--edge-bad)",
                            }}
                          >
                            {gap.d > 0 ? "▲" : "▼"}
                          </span>
                        )}
                      </div>

                      {/* Формулювання навмисно нейтральне: «вище» не
                          означає «краще» — по безробіттю вище це гірше,
                          і вирішувати за трейдера, куди піде ціна, не
                          наша справа. */}
                      <p
                        className="mt-2 text-[12.5px]"
                        style={{
                          fontFamily: T.sans,
                          color: "var(--edge-text2)",
                          lineHeight: 1.55,
                        }}
                      >
                        {gap.done
                          ? gap.d === 0
                            ? "Вийшло рівно як очікували — реакції зазвичай немає."
                            : `Факт ${gap.d > 0 ? "вище" : "нижче"} за прогноз.`
                          : gap.d === 0
                            ? "Чекають без змін до попереднього значення."
                            : `Чекають ${gap.d > 0 ? "вище" : "нижче"} за попереднє${ev.time ? `, вихід о ${ev.time}` : ""}.`}
                      </p>

                      <div className="mt-4 flex items-stretch gap-2">
                        {facts.map((b) => (
                          <div key={b.label} className="min-w-0 flex-1">
                            <div
                              className="truncate"
                              style={{
                                fontFamily: T.display,
                                fontSize: 14,
                                fontWeight: b.label === "факт" ? 700 : 500,
                                letterSpacing: "-0.2px",
                                color:
                                  b.label === "факт" ? "var(--edge-text)" : "var(--edge-text3)",
                              }}
                            >
                              {b.raw}
                            </div>
                            <div
                              className="mt-[3px]"
                              style={{
                                fontFamily: T.sans,
                                fontSize: 10,
                                color: "var(--edge-text4)",
                              }}
                            >
                              {b.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p
                      className="mt-4 text-[12.5px]"
                      style={{ fontFamily: T.sans, color: "var(--edge-text3)" }}
                    >
                      {facts.length
                        ? "Порівняти нема з чим — опублікували лише одне значення."
                        : "Ця подія без цифр — важить сам факт виступу чи зустрічі."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- картка нагадування ----------

   Системне сповіщення бачить лише той, хто дав дозвіл, а браузер до
   того ж ховає його, коли вкладка активна. Тому нагадування завжди
   дублюється карткою в самій сторінці: людина, що натиснула
   дзвіночок, мусить отримати нагадування незалежно від того, як
   налаштований її браузер. */

function AlertToasts() {
  const [list, setList] = useState([]);

  useEffect(() => {
    const on = (e) => {
      const d = e.detail;
      if (!d?.id) return;
      setList((s) => (s.some((x) => x.id === d.id) ? s : [...s, d]));
      /* Хвилина на екрані: менше — можна не помітити, повернувшись
         з іншої вкладки; більше — картка починає заважати. */
      setTimeout(() => setList((s) => s.filter((x) => x.id !== d.id)), 60000);
    };
    window.addEventListener(ALERT_EVENT, on);
    return () => window.removeEventListener(ALERT_EVENT, on);
  }, []);

  if (!list.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 right-4 z-[80] flex flex-col gap-2.5 sm:bottom-5 sm:left-auto sm:right-5 sm:w-[330px]">
      {list.map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto relative overflow-hidden rounded-2xl px-4 py-3.5"
          style={{
            background: "linear-gradient(120deg, var(--edge-surface-hi), var(--edge-surface) 60%, var(--edge-surface))",
            border: "1px solid rgba(var(--edge-bad-rgb),0.24)",
            boxShadow: "0 26px 60px -22px var(--edge-panel-glow, rgba(0,0,0,0.5)), 0 0 40px -26px var(--edge-bad)",
            animation: "edgeAlertIn .28s cubic-bezier(.22,1.2,.36,1)",
          }}
        >
          <span
            className="pointer-events-none absolute rounded-full"
            style={{
              left: -40,
              top: -60,
              width: 220,
              height: 150,
              background: "var(--edge-bad)",
              filter: "blur(60px)",
              opacity: 0.16,
            }}
          />

          <div className="relative flex items-start gap-3">
            <span
              className="mt-[3px] grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{
                background: "rgba(var(--edge-bad-rgb),0.12)",
                border: "1px solid rgba(var(--edge-bad-rgb),0.27)",
                color: "var(--edge-bad)",
              }}
            >
              <BellRing size={15} strokeWidth={2.1} />
            </span>

            <div className="min-w-0 flex-1">
              <div
                className="text-[9px] font-bold uppercase"
                style={{
                  fontFamily: T.mono,
                  letterSpacing: "1.8px",
                  color: "var(--edge-bad)",
                }}
              >
                {a.minutes <= 0 ? "виходить зараз" : `через ${a.minutes} хв`}
              </div>

              <div
                className="mt-1 truncate"
                style={{
                  fontFamily: T.display,
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "-0.3px",
                  color: "var(--edge-text)",
                }}
              >
                {a.title}
              </div>

              <div
                className="mt-1.5 flex items-center gap-2 text-[11.5px]"
                style={{ fontFamily: T.sans, color: "var(--edge-text3)" }}
              >
                <span className="flex items-center gap-1.5">
                  <Flag ccy={a.ccy} size={13} />
                  {a.ccy}
                </span>
                {a.forecast && (
                  <>
                    <span
                      className="h-[3px] w-[3px] rounded-full"
                      style={{ background: "var(--edge-line-hi)" }}
                    />
                    <span>прогноз {a.forecast}</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setList((s) => s.filter((x) => x.id !== a.id))}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
              style={{ color: "var(--edge-text3)" }}
              title="Прибрати"
            >
              <X size={13} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      ))}

      <style>{`@keyframes edgeAlertIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

/* ================================================================== */

export default function News() {
  useEdgeFonts();

  const [week, setWeek] = useState(0);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(null);
  const [imp, setImp] = useState(MAJOR);
  const [ccy, setCcy] = useState("all");

  const [impOpen, setImpOpen] = useState(false);
  const [ccyOpen, setCcyOpen] = useState(false);
  const [pickedDay, setPickedDay] = useState(null);
  const [soloDay, setSoloDay] = useState(null);
  const [tick, setTick] = useState(0);

  const dayRefs = useRef({});
  const stripRef = useRef(null);
  const [folds, setFolds] = useState(readFolds);

  useEffect(() => {
    writeFolds(folds);
  }, [folds]);
  const [alerts, setAlerts] = useCloudState(ALERTS_KEY, [], {
    normalize: normalizeAlerts,
  });

  /* Годинник для зворотного відліку. Раз на півхвилини — цього
     досить для «через 1 год 48 хв» і не змушує сторінку жити в
     постійному перемальовуванні. */
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  /* Жодного setState до першого await: «вантажиться» вмикає той, хто
     це спричинив. Якщо ставити прапорець в ефекті, React справедливо
     лається на каскад. */
  const load = useCallback(async (w, force = false) => {
    try {
      const data = await fetchWeek(w, force);
      setRows(data);
      setErr(null);
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    load(week);
  }, [week, load]);

  const refresh = () => {
    setBusy(true);
    load(week, true);
  };

  const goWeek = (next) => {
    if (next < -WEEK_SPAN || next > WEEK_SPAN || next === week) return;
    setBusy(true);
    setPickedDay(null);
    setSoloDay(null);
    setWeek(next);
  };

  /* Планувальник дивиться на актуальний список через функцію, тому
     його не треба перепідписувати щоразу, коли натиснули дзвіночок. */
  const watchRef = useRef([]);
  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    watchRef.current = rows.filter((r) => ids.has(r.id));
  }, [alerts, rows]);

  useEffect(() => startNewsWatcher(() => watchRef.current), []);

  const currencies = useMemo(() => {
    const all = [...new Set(rows.map((r) => r.ccy).filter(Boolean))];
    const head = CCY_ORDER.filter((c) => all.includes(c));
    const tail = all.filter((c) => !CCY_ORDER.includes(c)).sort();
    return [...head, ...tail];
  }, [rows]);

  useEffect(() => {
    warmFlags(currencies);
  }, [currencies]);

  /* Два кроки навмисно: стрічка зверху має рахувати те саме, що
     показує список, але не звужуватись до одного дня, коли увімкнено
     «тільки цей день». */
  const matched = useMemo(
    () =>
      rows.filter((r) => {
        if (imp === MAJOR ? !isMajor(r) : imp !== "all" && r.impact !== imp)
          return false;
        if (ccy !== "all" && r.ccy !== ccy) return false;
        return true;
      }),
    [rows, imp, ccy],
  );

  const shown = useMemo(
    () => (soloDay ? matched.filter((r) => r.day === soloDay) : matched),
    [matched, soloDay],
  );

  const days = useMemo(() => {
    const map = new Map();
    shown.forEach((r) => {
      if (!map.has(r.day)) map.set(r.day, []);
      map.get(r.day).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const today = dayKey(new Date());
  /* Без явного вибору минуле згорнуте, майбутнє відкрите. */
  const folded = (iso) => (iso in folds ? folds[iso] : iso < today);
  const toggleFold = (iso) =>
    setFolds((f) => ({ ...f, [iso]: !folded(iso) }));

  const allFolded = days.length > 0 && days.every(([iso]) => folded(iso));
  const foldAll = () =>
    setFolds((f) => {
      const next = { ...f };
      days.forEach(([iso]) => {
        next[iso] = !allFolded;
      });
      return next;
    });

  /* ---------- тижнева стрічка ----------

     Будується з самих подій, а не з календаря: сім клітинок від
     першого дня тижня, який зараз показано. Порожні дні лишаються
     на місці — без них тиждень перестає бути тижнем. */
  const strip = useMemo(() => {
    const dated = matched
      .map((r) => r.day)
      .filter(Boolean)
      .sort();
    if (!dated.length) return [];

    /* Тиждень рахуємо від першого дня, який реально прийшов у фіді:
       якщо жорстко ставити понеділок, а фід почав тиждень з неділі,
       шість клітинок стають порожніми, а справжні дні вивалюються за
       край стрічки. */
    const start = new Date(`${dated[0]}T12:00:00`);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = dayKey(d);
      const list = matched.filter((r) => r.day === iso);
      return {
        iso,
        dow: d
          .toLocaleDateString("uk-UA", { weekday: "short" })
          .replace(".", ""),
        num: String(d.getDate()).padStart(2, "0"),
        total: list.length,
        high: list.filter((e) => e.impact === "High").length,
      };
    });
  }, [matched]);

  const rangeLabel = useMemo(() => {
    if (!strip.length) return "";
    const a = new Date(`${strip[0].iso}T12:00:00`);
    const b = new Date(`${strip[6].iso}T12:00:00`);
    const fmt = (d, withMonth) =>
      d.toLocaleDateString(
        "uk-UA",
        withMonth ? { day: "numeric", month: "long" } : { day: "numeric" },
      );
    const sameMonth = a.getMonth() === b.getMonth();
    return `${fmt(a, !sameMonth)} — ${fmt(b, true)} ${b.getFullYear()}`;
  }, [strip]);

  /* Активний день: вибраний вручну, інакше сьогодні, інакше перший
     день тижня, у якому взагалі щось є. */
  const activeDay =
    pickedDay ||
    strip.find((d) => isToday(d.iso))?.iso ||
    strip.find((d) => d.total)?.iso ||
    null;

  /* На вузькому екрані стрічка днів горизонтально скролиться —
     активний день має бути в полі зору, а не з'їхати під стрілку. */
  useEffect(() => {
    const host = stripRef.current;
    if (!host || host.scrollWidth <= host.clientWidth) return;
    const el = host.querySelector('[data-strip-active="1"]');
    if (el) {
      host.scrollTo({
        left: el.offsetLeft - (host.clientWidth - el.offsetWidth) / 2,
        behavior: "smooth",
      });
    }
  }, [activeDay, strip.length]);

  /* Перемотка написана руками, а не через scrollIntoView({smooth}):
     плавний варіант браузер мовчки вимикає при prefers-reduced-motion
     і в кількох вбудованих webview — сторінка тоді просто не рухається,
     і клік по дню виглядає як зламана кнопка. Свій твін завжди
     доводить до місця, а за коротшу тривалість відповідає та сама
     системна настройка. */
  const gotoDay = (iso) => {
    setPickedDay(iso);
    /* Перемотувати до згорнутого дня безглуздо — його не видно.
       Тому клік по стрічці спершу розгортає день, а міряти позицію
       можна лише наступним кадром, коли список уже вирос. */
    if (folded(iso)) {
      setFolds((f) => ({ ...f, [iso]: false }));
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToDay(iso)));
      return;
    }
    scrollToDay(iso);
  };

  const scrollToDay = (iso) => {
    const el = dayRefs.current[iso];
    if (!el) return;

    let box = el.parentElement;
    while (box && box !== document.body) {
      const oy = getComputedStyle(box).overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        box.scrollHeight > box.clientHeight
      )
        break;
      box = box.parentElement;
    }
    const win = !box || box === document.body;

    const from = win ? window.scrollY : box.scrollTop;
    const gap = win
      ? el.getBoundingClientRect().top
      : el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    const to = Math.max(0, from + gap - 18);
    if (Math.abs(to - from) < 2) return;

    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const put = (v) => {
      if (win) window.scrollTo(0, v);
      else box.scrollTop = v;
    };

    if (quick) {
      put(to);
      return;
    }

    const t0 = performance.now();
    const dur = Math.min(620, 240 + Math.abs(to - from) * 0.12);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - (1 - k) ** 3;
      put(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ---------- найближчі події ----------

     Беремо не одну, а всі, що виходять у ту саму хвилину: о 15:30
     їх буває чотири, і показати з них одну означає збрехати про вагу
     моменту. */
  const upcoming = useMemo(() => {
    const future = rows
      .filter((r) => r.at && r.at.getTime() > Date.now() && r.impact === "High")
      .sort((a, b) => a.at - b.at);
    if (!future.length) return null;
    const t = future[0].at.getTime();
    return {
      at: future[0].at,
      list: future.filter((r) => r.at.getTime() === t),
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [rows, tick]);

  const left = upcoming ? Math.max(0, upcoming.at.getTime() - Date.now()) : 0;
  const cdH = String(Math.floor(left / 3600000)).padStart(2, "0");
  const cdM = String(Math.floor((left % 3600000) / 60000)).padStart(2, "0");

  const watchedIds = useMemo(() => new Set(alerts.map((a) => a.id)), [alerts]);
  const leadOf = (id) => alerts.find((a) => a.id === id)?.lead ?? LEAD_MIN;

  /* Дозвіл питаємо в мить, коли людина ставить перше нагадування, і
     не робимо з відповіді умову: відмовила — нагадування прийде
     карткою в самій сторінці. */
  const setWatch = async (ev, lead) => {
    if (lead === null) {
      setAlerts((s) => s.filter((a) => a.id !== ev.id));
      return;
    }

    if (!watchedIds.has(ev.id)) askNotifyPermission();

    setAlerts((s) => [
      ...s.filter((a) => a.id !== ev.id),
      {
        id: ev.id,
        key: ev.key,
        title: ev.title,
        ccy: ev.ccy,
        at: ev.at ? ev.at.toISOString() : "",
        lead,
      },
    ]);
  };

  const toggleWatch = (ev) =>
    setWatch(ev, watchedIds.has(ev.id) ? null : LEAD_MIN);

  /* Дзвіночок доступний завжди: навіть без дозволу на системні
     сповіщення нагадування спрацює всередині сторінки. */
  const canWatch = true;
  const upWatched = upcoming
    ? upcoming.list.every((e) => watchedIds.has(e.id))
    : false;
  const upLead = upcoming ? leadOf(upcoming.list[0].id) : LEAD_MIN;

  const LEVELS = [
    { id: MAJOR, label: "Середній і вище", color: T.acc },
    { id: "all", label: "Усі події", color: "var(--edge-text3)" },
    ...IMPACTS,
  ];

  const impCur = LEVELS.find((l) => l.id === imp) || impactOf(imp);
  const hasFilter = imp !== MAJOR || ccy !== "all" || !!soloDay;
  const impCount = (id) =>
    rows.filter(
      (r) =>
        (id === "all" || (id === MAJOR ? isMajor(r) : r.impact === id)) &&
        (ccy === "all" || r.ccy === ccy),
    ).length;

  return (
    <div className="relative min-h-full">
      <AlertToasts />

      {/* Ширина сторінки.

          Кап у 1400px комфортно лягав на ноутбук, але на зовнішньому
          моніторі від 24" контент збирався вузькою колонкою по центру, а
          третина ширини стояла порожня. Піднімаємо стелю до 1880px і
          тримаємо 94% вікна — на ноутбуці це ті самі ~1400px (різниця
          непомітна), а на великому екрані сторінка нарешті дихає на всю
          доступну ширину. Рядки календаря всередині — flex/grid, тож
          вони просто розтягуються рівномірно. */}
      <div className="relative z-10 mx-auto w-[92%] max-w-[1880px] pb-20 pt-4 sm:w-[94%] sm:pb-24 sm:pt-5 lg:pt-7">
        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-wrap items-end justify-between gap-5 sm:gap-8"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-[9px]">
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{
                  background: "var(--edge-acc)",
                  boxShadow: `0 0 12px 2px ${A(0.67)}`,
                }}
              />
              <span
                className="text-[10px] font-bold uppercase"
                style={{
                  fontFamily: T.mono,
                  letterSpacing: "2.6px",
                  color: "var(--edge-acc)",
                }}
              >
                Економічний календар
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-[18px]">
              <h1
                className="text-[34px] font-bold sm:text-[44px]"
                style={{
                  fontFamily: T.display,
                  letterSpacing: "-1.8px",
                  lineHeight: 1,
                  backgroundImage: `linear-gradient(170deg, ${T.text} 34%, ${T.text3})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Новини
              </h1>
              {rangeLabel && (
                <span
                  className="text-[13px]"
                  style={{
                    fontFamily: T.mono,
                    letterSpacing: "1.6px",
                    color: "var(--edge-text3)",
                  }}
                >
                  {rangeLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:flex-nowrap">
            {/* вплив */}
            <div className="relative order-1 w-[calc(100%-3.25rem)] min-w-0 sm:w-auto sm:flex-none">
              <DropButton
                open={impOpen}
                active={imp !== "all"}
                color={impCur.color}
                onClick={() => {
                  setImpOpen((v) => !v);
                  setCcyOpen(false);
                }}
              >
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{
                    background: impCur.color,
                    boxShadow: `0 0 9px 1px ${impCur.color}aa`,
                  }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: "var(--edge-text)" }}
                >
                  {impCur.label}
                </span>
              </DropButton>

              {impOpen && (
                <Panel width={218} align="left">
                  {LEVELS.map((i) => {
                    const on = imp === i.id;
                    return (
                      <button
                        key={i.id}
                        onClick={() => {
                          setImp(i.id);
                          setImpOpen(false);
                        }}
                        className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-[12.5px] font-semibold"
                        style={{
                          fontFamily: T.sans,
                          background: on ? `${i.color}24` : "transparent",
                          border: `1px solid ${on ? `${i.color}5e` : "transparent"}`,
                          color: on ? "var(--edge-text)" : "var(--edge-text3)",
                          transition: "all .14s",
                        }}
                      >
                        <span
                          className="h-[7px] w-[7px] shrink-0 rounded-full"
                          style={{
                            background: i.color,
                            boxShadow: on ? `0 0 9px 1px ${i.color}cc` : "none",
                          }}
                        />
                        <span className="flex-1 text-left">{i.label}</span>
                        <span
                          style={{
                            fontFamily: T.mono,
                            fontSize: 10.5,
                            color: "var(--edge-text3)",
                          }}
                        >
                          {impCount(i.id)}
                        </span>
                      </button>
                    );
                  })}
                </Panel>
              )}
            </div>

            {/* валюта */}
            <div className="relative order-3 w-full min-w-0 sm:order-2 sm:w-auto sm:flex-none">
              <DropButton
                open={ccyOpen}
                active={ccy !== "all"}
                color={T.acc}
                onClick={() => {
                  setCcyOpen((v) => !v);
                  setImpOpen(false);
                }}
              >
                <Globe
                  size={14}
                  strokeWidth={1.7}
                  style={{ color: "var(--edge-text2)", flex: "none" }}
                />
                <span
                  className="min-w-0 flex-1 truncate text-left text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: "var(--edge-text)" }}
                >
                  {ccy === "all" ? "Всі валюти" : ccy}
                </span>
              </DropButton>

              {ccyOpen && (
                <Panel width={242} align="left">
                  <button
                    onClick={() => {
                      setCcy("all");
                      setCcyOpen(false);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[12.5px] font-semibold"
                    style={{
                      fontFamily: T.sans,
                      background: ccy === "all" ? A(0.17) : "transparent",
                      color: ccy === "all" ? "var(--edge-text)" : "var(--edge-text3)",
                    }}
                  >
                    <span className="flex-1 text-left">Всі валюти</span>
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 10.5,
                        color: "var(--edge-text3)",
                      }}
                    >
                      {rows.length}
                    </span>
                  </button>

                  <div
                    className="mx-0.5 my-1.5 h-px"
                    style={{ background: "var(--edge-line)" }}
                  />

                  <div className="grid grid-cols-3 gap-[5px]">
                    {currencies.map((c) => {
                      const on = ccy === c;
                      return (
                        <button
                          key={c}
                          onClick={() => {
                            setCcy(on ? "all" : c);
                            setCcyOpen(false);
                          }}
                          className="flex h-8 items-center justify-center gap-1.5 rounded-[9px]"
                          style={{
                            fontFamily: T.mono,
                            fontSize: 11.5,
                            letterSpacing: "0.8px",
                            fontWeight: 700,
                            background: on ? A(0.17) : "var(--edge-hair)",
                            border: `1px solid ${on ? A(0.5) : "var(--edge-line)"}`,
                            color: on ? "var(--edge-text)" : "var(--edge-text2)",
                            transition: "all .14s",
                          }}
                        >
                          <Flag ccy={c} size={13} />
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </Panel>
              )}
            </div>

            <button
              onClick={refresh}
              title="Оновити"
              className="order-2 grid h-10 w-[42px] shrink-0 place-items-center rounded-xl sm:order-3"
              style={{
                background: "var(--edge-hair)",
                border: "1px solid var(--edge-line)",
                color: "var(--edge-text2)",
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--edge-hair-strong)";
                e.currentTarget.style.color = "var(--edge-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--edge-hair)";
                e.currentTarget.style.color = "var(--edge-text2)";
              }}
            >
              <RefreshCw
                size={16}
                strokeWidth={1.9}
                className={busy ? "animate-spin" : ""}
              />
            </button>
          </div>
        </motion.div>

        {/* ─────────── Тижнева стрічка ─────────── */}
        {/* Стрічку показуємо завжди, навіть коли тиждень не
            завантажився: інакше разом із нею зникають стрілки, і
            людина лишається замкненою на порожньому тижні без
            жодного способу повернутись назад. */}
        <div className="mt-6 flex items-stretch gap-2.5">
          <NavBtn
            onClick={() => goWeek(week - 1)}
            disabled={week <= -WEEK_SPAN}
            side="left"
          />

          {strip.length === 0 ? (
            <div
              className="grid min-w-0 flex-1 place-items-center rounded-[15px] text-[12.5px]"
              style={{
                minHeight: 92,
                background: "var(--edge-sunken)",
                border: "1px dashed var(--edge-line)",
                fontFamily: T.sans,
                color: "var(--edge-text3)",
              }}
            >
              {busy ? "вантажу тиждень…" : "на цей тиждень даних немає"}
            </div>
          ) : (
            <div
              ref={stripRef}
              className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto [scrollbar-width:none] sm:grid sm:grid-cols-7 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
            >
              {strip.map((d) => (
                <StripDay
                  key={d.iso}
                  day={d}
                  active={activeDay === d.iso}
                  solo={soloDay === d.iso}
                  onPick={() => gotoDay(d.iso)}
                  onSolo={() => setSoloDay((v) => (v === d.iso ? null : d.iso))}
                />
              ))}
            </div>
          )}

          <NavBtn
            onClick={() => goWeek(week + 1)}
            disabled={week >= WEEK_SPAN}
            side="right"
          />
        </div>

        {/* ─────────── Найближче ─────────── */}
        {upcoming && (
          <div
            className="relative mt-3.5 overflow-hidden rounded-2xl px-3.5 py-3 sm:px-[18px] sm:py-3.5"
            style={{
              background: "linear-gradient(120deg, var(--edge-surface-hi), var(--edge-surface) 52%, var(--edge-surface))",
              border: "1px solid rgba(var(--edge-bad-rgb),0.20)",
              boxShadow: "0 16px 40px -26px rgba(var(--edge-bad-rgb),0.35)",
            }}
          >
            <span
              className="pointer-events-none absolute rounded-full"
              style={{
                left: -50,
                top: -70,
                width: 280,
                height: 190,
                background: "var(--edge-bad)",
                filter: "blur(70px)",
                opacity: 0.13,
              }}
            />

            <div className="relative flex flex-wrap items-center gap-3 sm:gap-[18px]">
              <div className="flex shrink-0 items-center gap-[11px]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--edge-bad)",
                    boxShadow: "0 0 10px 2px rgba(var(--edge-bad-rgb),0.80)",
                  }}
                />
                <div>
                  <div
                    className="text-[8.5px] font-bold uppercase"
                    style={{
                      fontFamily: T.mono,
                      letterSpacing: "2.2px",
                      color: "var(--edge-bad)",
                    }}
                  >
                    Далі — {evWord(upcoming.list.length)} разом
                  </div>
                  <div
                    className="mt-[5px] flex items-baseline gap-[3px]"
                    style={{
                      fontFamily: T.display,
                      fontWeight: 700,
                      color: "var(--edge-text)",
                      letterSpacing: "-1px",
                      lineHeight: 1,
                    }}
                  >
                    <span className="text-[25px]">{cdH}</span>
                    <span
                      className="text-[12.5px]"
                      style={{ color: "var(--edge-text3)" }}
                    >
                      г
                    </span>
                    <span className="ml-1 text-[25px]">{cdM}</span>
                    <span
                      className="text-[12.5px]"
                      style={{ color: "var(--edge-text3)" }}
                    >
                      хв
                    </span>
                  </div>
                </div>
              </div>

              <span
                className="hidden h-[38px] w-px shrink-0 sm:block"
                style={{
                  background:
                    "linear-gradient(180deg,transparent,var(--edge-hair-strong),transparent)",
                }}
              />

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:min-w-[240px]">
                {upcoming.list.slice(0, 4).map((e, i) => (
                  <span
                    key={e.id}
                    className={`${i >= 2 ? "hidden sm:flex" : "flex"} min-w-0 max-w-full items-center gap-2.5 rounded-[11px] py-[7px] pl-2 pr-3`}
                    style={{
                      background: "var(--edge-hair)",
                      border: "1px solid var(--edge-line-hi)",
                    }}
                  >
                    <span
                      className="flex h-[22px] items-center gap-1.5 rounded-[7px] px-[7px]"
                      style={{
                        background: "rgba(var(--edge-bad-rgb),0.12)",
                        border: "1px solid rgba(var(--edge-bad-rgb),0.26)",
                      }}
                    >
                      <Flag ccy={e.ccy} size={12} />
                      <span
                        style={{
                          fontFamily: T.mono,
                          fontSize: 10,
                          letterSpacing: "0.9px",
                          fontWeight: 700,
                          color: "var(--edge-bad)",
                        }}
                      >
                        {e.ccy}
                      </span>
                    </span>
                    <span
                      className="min-w-0 truncate"
                      style={{
                        fontFamily: T.display,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--edge-text)",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {e.title}
                    </span>
                    {e.forecast && (
                      <span
                        className="hidden whitespace-nowrap sm:inline"
                        style={{
                          fontFamily: T.mono,
                          fontSize: 11,
                          color: "var(--edge-text2)",
                        }}
                      >
                        {e.forecast}
                      </span>
                    )}
                  </span>
                ))}
              </div>

              {canWatch && (
                /* Одна кнопка на всі події, що виходять у ту саму
                   хвилину: обраний час ставиться кожній із них, і
                   зняття теж спільне. */
                <BellPick
                  watched={upWatched}
                  lead={upLead}
                  hovered
                  label={upWatched ? `Нагадаю ${leadLabel(upLead)}` : "Нагадати"}
                  onPick={(min) =>
                    upcoming.list.forEach((e) => setWatch(e, min))
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* ─────────── Стан фільтрів ─────────── */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          {hasFilter && (
            <button
              onClick={() => {
                setImp(MAJOR);
                setCcy("all");
                setSoloDay(null);
              }}
              className="flex h-[34px] items-center gap-[7px] rounded-[10px] px-3 text-[11.5px] font-semibold"
              style={{
                background: "var(--edge-hair)",
                border: "1px dashed var(--edge-line-hi)",
                color: "var(--edge-text2)",
                fontFamily: T.sans,
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = A(0.5);
                e.currentTarget.style.color = "var(--edge-acc)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--edge-line-hi)";
                e.currentTarget.style.color = "var(--edge-text2)";
              }}
            >
              <X size={11} strokeWidth={2.4} />
              Скинути фільтри
            </button>
          )}

          {/* Повернення до поточного тижня одним рухом: інакше після
              пʼяти кліків уперед доводиться робити пʼять назад. */}
          {week !== 0 && (
            <button
              onClick={() => goWeek(0)}
              className="flex h-[34px] items-center gap-[7px] rounded-[10px] px-3 text-[11.5px] font-semibold"
              style={{
                background: A(0.14),
                border: `1px solid ${A(0.45)}`,
                color: "var(--edge-acc)",
                fontFamily: T.sans,
                transition: "all .16s",
              }}
            >
              <ChevronLeft size={12} strokeWidth={2.4} />
              Цей тиждень
            </button>
          )}

          {days.length > 1 && (
            <button
              onClick={foldAll}
              className="flex h-[34px] items-center gap-[7px] rounded-[10px] px-3 text-[11.5px] font-semibold"
              style={{
                background: "var(--edge-hair)",
                border: "1px solid var(--edge-line)",
                color: "var(--edge-text2)",
                fontFamily: T.sans,
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--edge-hair-strong)";
                e.currentTarget.style.color = "var(--edge-text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--edge-hair)";
                e.currentTarget.style.color = "var(--edge-text2)";
              }}
            >
              <ChevronDown
                size={12}
                strokeWidth={2.4}
                style={{
                  transform: allFolded ? "rotate(-90deg)" : "none",
                  transition: "transform .2s",
                }}
              />
              {allFolded ? "Розгорнути всі дні" : "Згорнути всі дні"}
            </button>
          )}

          <span className="flex-1" />

          <span
            className="text-[11px] uppercase"
            style={{
              fontFamily: T.mono,
              letterSpacing: "1.2px",
              color: "var(--edge-text3)",
            }}
          >
            {shown.length} з {rows.length} подій
          </span>
        </div>

        {/* ─────────── Помилка ─────────── */}
        {err && (
          <div
            className="mt-3 flex items-start gap-3 rounded-2xl p-4"
            style={{
              background: `rgba(${T.badRgb},0.08)`,
              border: "1px solid rgba(var(--edge-bad-rgb),0.20)",
            }}
          >
            <AlertTriangle
              size={17}
              strokeWidth={2.2}
              className="mt-0.5 shrink-0"
              style={{ color: T.bad }}
            />
            <div>
              <div
                className="mb-1 text-[14.5px] font-bold"
                style={{ fontFamily: T.display, color: T.bad }}
              >
                Календар не завантажився
              </div>
              <p
                className="text-[13px]"
                style={{
                  fontFamily: T.sans,
                  color: "var(--edge-text2)",
                  lineHeight: 1.6,
                }}
              >
                {err}
              </p>
            </div>
          </div>
        )}

        {busy && !rows.length && (
          <div
            className="flex items-center justify-center gap-2 py-20 text-[14px]"
            style={{ fontFamily: T.sans, color: "var(--edge-text3)" }}
          >
            <Loader2 size={16} className="animate-spin" />
            вантажу календар…
          </div>
        )}

        {/* Порожньо буває з двох різних причин, і плутати їх не варто:
            або фільтри занадто вузькі, або джерело ще не виклало
            далекий тиждень. Друге — не помилка. */}
        {!busy && !err && !days.length && (
          <p
            className="py-20 text-center text-[14px]"
            style={{ fontFamily: T.sans, color: "var(--edge-text3)", lineHeight: 1.7 }}
          >
            {rows.length ? (
              "Під ці фільтри нічого не підпадає."
            ) : week > 0 ? (
              <>
                На цей тиждень розклад ще не опублікували.
                <br />
                Далекі дати зʼявляються поступово, за тиждень-два.
              </>
            ) : (
              "На цей тиждень подій немає."
            )}
          </p>
        )}

        {/* ─────────── Дні ─────────── */}
        <div className="mt-6 flex flex-col gap-[30px]">
          {days.map(([day, list]) => {
            const now = isToday(day);
            const high = list.filter((e) => e.impact === "High").length;
            const d = new Date(`${day}T12:00:00`);

            /* Позначка «зараз» стоїть між подіями, що вже пройшли, і
               тими, що попереду. Без неї сьогоднішній день читається
               як суцільна стрічка, у якій незрозуміло, де ти. */
            const nowAt = now
              ? list.findIndex((e) => e.at && e.at.getTime() > Date.now())
              : -1;
            const shut = folded(day);

            return (
              <div
                key={day}
                ref={(el) => {
                  dayRefs.current[day] = el;
                }}
                style={{ scrollMarginTop: 24 }}
              >
                {/* Шапка дня — сама по собі перемикач: цілий рядок
                    клікабельний, бо цілитись у маленьку стрілку при
                    сімох днях підряд незручно. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleFold(day)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleFold(day);
                    }
                  }}
                  title={shut ? "Розгорнути день" : "Згорнути день"}
                  className="flex cursor-pointer select-none items-center gap-2.5 sm:gap-3.5">
                  <div
                    className="w-12 shrink-0 rounded-[13px] py-1.5 text-center sm:w-14 sm:py-2"
                    style={{
                      background: now ? A(0.12) : "var(--edge-hair)",
                      border: `1px solid ${now ? A(0.37) : "var(--edge-line)"}`,
                      boxShadow: now ? `0 0 24px -10px ${A(0.8)}` : "none",
                    }}
                  >
                    <div
                      className="text-[9px] font-bold uppercase"
                      style={{
                        fontFamily: T.mono,
                        letterSpacing: "1.6px",
                        color: "var(--edge-text3)",
                      }}
                    >
                      {d
                        .toLocaleDateString("uk-UA", { weekday: "short" })
                        .replace(".", "")}
                    </div>
                    <div
                      className="mt-0.5 text-[18px] sm:text-[21px]"
                      style={{
                        fontFamily: T.display,
                        fontWeight: 700,
                        letterSpacing: "-0.8px",
                        color: "var(--edge-text)",
                        lineHeight: 1,
                      }}
                    >
                      {String(d.getDate()).padStart(2, "0")}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 sm:flex-none">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="truncate capitalize text-[15px] sm:text-[16.5px]"
                        style={{
                          fontFamily: T.display,
                          fontWeight: 600,
                          color: "var(--edge-text)",
                          letterSpacing: "-0.3px",
                        }}
                      >
                        {DAY_FMT(day)}
                      </span>
                      {now && (
                        <span
                          className="flex items-center gap-1.5 rounded-full px-2.5 py-[3px]"
                          style={{
                            background: A(0.17),
                            border: `1px solid ${A(0.5)}`,
                          }}
                        >
                          <span
                            className="h-[5px] w-[5px] rounded-full"
                            style={{
                              background: "var(--edge-acc)",
                              boxShadow: `0 0 8px 1px ${A(0.8)}`,
                            }}
                          />
                          <span
                            className="text-[8.5px] font-bold uppercase"
                            style={{
                              fontFamily: T.mono,
                              letterSpacing: "1.4px",
                              color: "var(--edge-acc)",
                            }}
                          >
                            Сьогодні
                          </span>
                        </span>
                      )}
                    </div>

                    <div
                      className="mt-1 flex items-center gap-2.5 text-[11.5px]"
                      style={{ fontFamily: T.sans, color: "var(--edge-text3)" }}
                    >
                      <span>{evWord(list.length)}</span>
                      {high > 0 && (
                        <>
                          <span
                            className="h-[3px] w-[3px] rounded-full"
                            style={{ background: "var(--edge-line-hi)" }}
                          />
                          <span
                            className="font-semibold"
                            style={{ color: "var(--edge-bad)" }}
                          >
                            {high}{" "}
                            {plural(high, "важлива", "важливі", "важливих")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <span
                    className="h-px flex-1"
                    style={{
                      background: "linear-gradient(90deg,var(--edge-line),transparent)",
                    }}
                  />

                  {!shut && (
                    <div className="hidden shrink-0 items-center gap-3.5 lg:flex">
                      {["Факт", "Прогноз", "Було"].map((h) => (
                        <span
                          key={h}
                          className="w-[88px] text-right text-[9px] font-bold uppercase"
                          style={{
                            fontFamily: T.mono,
                            letterSpacing: "1.8px",
                            color: "var(--edge-text3)",
                          }}
                        >
                          {h}
                        </span>
                      ))}
                    </div>
                  )}

                  <FoldPill shut={shut} count={list.length} />
                </div>

                {/* Згорнутий день просто не рендериться: ховати його
                    через CSS означало б і далі тримати в дереві сотню
                    рядків, а вся суть згортання — щоб сторінка стала
                    коротшою і легшою. */}
                {!shut && (
                <div className="relative mt-3">
                  <span
                    className="pointer-events-none absolute bottom-[14px] top-[14px] left-[55px] w-px sm:left-[88px]"
                    style={{
                      background:
                        "linear-gradient(180deg,transparent,var(--edge-line) 6%,var(--edge-line) 94%,transparent)",
                    }}
                  />

                  <div className="flex flex-col gap-1.5">
                    {list.map((ev, i) => (
                      <div key={ev.id}>
                        {i === nowAt && <NowLine />}
                        <EventRow
                          ev={ev}
                          watched={watchedIds.has(ev.id)}
                          lead={leadOf(ev.id)}
                          onWatch={setWatch}
                          canWatch={canWatch}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- перемикач дня ----------

   Гола стрілочка збоку не пояснює сама себе: незрозуміло ні що вона
   згортає, ні що станеться після кліку. Тому це підписана кнопка —
   слово «Згорнути» поруч зі стрілкою знімає обидва питання, а в
   згорнутому стані підпис ще й нагадує, скільки подій сховано. */

function FoldPill({ shut, count }) {
  const [hov, setHov] = useState(false);

  return (
    <span
      className="flex h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 sm:pl-3.5 sm:pr-3"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: shut ? (hov ? A(0.2) : A(0.12)) : hov ? "var(--edge-hair-strong)" : "var(--edge-hair)",
        border: `1px solid ${shut ? A(hov ? 0.7 : 0.45) : hov ? "var(--edge-line-hi)" : "var(--edge-line)"}`,
        color: shut ? "var(--edge-acc)" : hov ? "var(--edge-text)" : "var(--edge-text3)",
        transition: "all .16s",
      }}
    >
      <span
        className="whitespace-nowrap text-[11.5px] font-bold"
        style={{ fontFamily: T.sans }}
      >
        <span className="hidden sm:inline">
          {shut ? `Показати ${evWordAcc(count)}` : "Згорнути день"}
        </span>
        <span className="sm:hidden">{shut ? count : ""}</span>
      </span>
      <ChevronDown
        size={15}
        strokeWidth={2.4}
        style={{
          transform: shut ? "rotate(-90deg)" : "none",
          transition: "transform .2s",
        }}
      />
    </span>
  );
}

/* ---------- стрілка тижня ---------- */

function NavBtn({ onClick, disabled, side }) {
  const [hov, setHov] = useState(false);
  const I = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={side === "left" ? "Попередній тиждень" : "Наступний тиждень"}
      className="grid w-8 shrink-0 place-items-center rounded-[13px] sm:w-[38px]"
      style={{
        background: hov && !disabled ? "var(--edge-hair-strong)" : "var(--edge-hair)",
        border: `1px solid ${hov && !disabled ? "var(--edge-line-hi)" : "var(--edge-line)"}`,
        color: disabled ? "var(--edge-text4)" : hov ? "var(--edge-text)" : "var(--edge-text2)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all .16s",
      }}
    >
      <I size={15} strokeWidth={2} />
    </button>
  );
}

/* ---------- «зараз» у стрічці дня ---------- */

function NowLine() {
  const now = new Date().toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="relative flex h-[30px] items-center">
      <div className="flex w-[46px] shrink-0 items-center justify-end pr-2 sm:w-[74px] sm:pr-3">
        <span
          className="text-[10px] sm:text-[11px]"
          style={{
            fontFamily: T.mono,
            letterSpacing: "0.6px",
            fontWeight: 700,
            color: "var(--edge-acc)",
          }}
        >
          {now}
        </span>
      </div>
      <div className="flex w-5 shrink-0 items-center justify-center sm:w-7">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{
            background: T.acc,
            boxShadow: `0 0 0 4px ${A(0.18)}, 0 0 16px 3px ${A(0.8)}`,
          }}
        />
      </div>
      <div
        className="h-px flex-1"
        style={{
          background: `linear-gradient(90deg, ${T.acc}, ${A(0.17)} 60%, transparent)`,
        }}
      />
      <div
        className="shrink-0 pl-3 text-[9px] font-bold uppercase"
        style={{ fontFamily: T.mono, letterSpacing: "2px", color: "var(--edge-acc)" }}
      >
        Зараз
      </div>
    </div>
  );
}
