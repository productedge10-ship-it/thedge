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
          background: "rgba(255,255,255,0.07)",
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
        boxShadow: "0 0 0 1px rgba(255,255,255,0.10)",
      }}
    />
  );
}

/* ---------- випадашка в шапці ---------- */

function DropButton({ open, active, color, children, onClick, minWidth }) {
  const [hov, setHov] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex h-10 items-center gap-2.5 rounded-xl px-3"
      style={{
        minWidth,
        background: open || hov ? "#ffffff12" : "#ffffff08",
        border: `1px solid ${open || active ? `${color}80` : "#21212b"}`,
        transition: "all .16s",
      }}
    >
      {children}
      <ChevronDown
        size={13}
        strokeWidth={1.9}
        style={{
          color: "#a3a1b2",
          flex: "none",
          transform: `rotate(${open ? 180 : 0}deg)`,
          transition: "transform .2s",
        }}
      />
    </button>
  );
}

const Panel = ({ width, children }) => (
  <div
    className="absolute right-0 z-40 mt-2 rounded-2xl p-1.5"
    style={{
      top: "100%",
      width,
      background: "#14141b",
      border: "1px solid #2c2c38",
      boxShadow: "0 26px 54px -18px #000",
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
        style={{ background: "#ff7b7b", boxShadow: "0 0 7px 1px #ff7b7b80" }}
      />,
    );
  }
  if (day.high > 5)
    dots.push(
      <span
        key="more"
        className="h-[5px] w-[5px] rounded-full"
        style={{ background: "#ff7b7b59" }}
      />,
    );
  if (!day.high && !empty)
    dots.push(
      <span
        key="dash"
        className="h-[3px] w-4 rounded-full"
        style={{ background: "#2d2d3a" }}
      />,
    );

  return (
    <button
      onClick={empty ? undefined : onPick}
      onDoubleClick={empty ? undefined : onSolo}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={
        empty
          ? "Подій немає"
          : "Клік — перейти до дня, подвійний — показати тільки його"
      }
      className="relative overflow-hidden rounded-[15px] px-3.5 pb-3 pt-3.5 text-left"
      style={{
        background: active
          ? "linear-gradient(165deg,#17162080,#0d0d13)"
          : hov
            ? "#12121a"
            : "#0d0d12",
        border: `1px solid ${solo ? A(1) : active ? A(0.5) : hov ? "#33333f" : "#1c1c25"}`,
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
          className="text-[9.5px] font-bold uppercase"
          style={{
            fontFamily: T.mono,
            letterSpacing: "1.8px",
            color: active ? "#c4baff" : "#6d6b7d",
          }}
        >
          {day.dow}
        </span>
        <span
          style={{
            fontFamily: T.display,
            fontSize: 23,
            fontWeight: 700,
            letterSpacing: "-1px",
            lineHeight: 1,
            color: active ? "#ffffff" : empty ? "#5b5967" : "#c2c0ce",
          }}
        >
          {day.num}
        </span>
      </span>

      <span className="relative mt-3 flex h-3 items-center gap-1">{dots}</span>

      <span
        className="relative mt-2.5 block text-[11px] font-semibold"
        style={{
          fontFamily: T.sans,
          color: active ? "#c4baff" : empty ? "#43414d" : "#6d6b7d",
          transition: "color .18s",
        }}
      >
        {solo ? "тільки цей день" : empty ? "вихідний" : evWord(day.total)}
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
          color: watched ? (label ? "#c4baff" : T.acc) : open || hovered ? "#a5a3b3" : "#43414d",
          background: watched ? A(label ? 0.18 : 0.12) : open ? "#ffffff0f" : label ? "#ffffff0a" : "transparent",
          border: label ? `1px solid ${watched ? A(0.6) : "#2c2c38"}` : "none",
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
            background: "#14141b",
            border: "1px solid #2c2c38",
            boxShadow: "0 26px 54px -18px #000",
          }}
        >
          <span
            className="block px-2.5 pb-1.5 pt-1 text-[9px] font-bold uppercase"
            style={{
              fontFamily: T.mono,
              letterSpacing: "1.6px",
              color: "#6f6d7d",
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
                  color: on ? "#ffffff" : "#9d9bad",
                  transition: "all .14s",
                }}
              >
                <span
                  className="h-[6px] w-[6px] shrink-0 rounded-full"
                  style={{
                    background: on ? T.acc : "#2f2e3a",
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
                style={{ background: "#22222c" }}
              />
              <button
                onClick={() => {
                  onPick(null);
                  setOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: "#ff9d9d" }}
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
      ? "#6fe0b4"
      : sur < 0
        ? "#ff9d9d"
        : "#ffffff"
    : "#41404b";

  const cell = (v, color, weight) => (
    <span
      className="w-[88px] shrink-0 text-right"
      style={{
        fontFamily: T.display,
        fontSize: 15,
        fontWeight: weight,
        letterSpacing: "-0.2px",
        color: v ? color : "#41404b",
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
          className="flex shrink-0 flex-col items-end justify-center pr-3"
          style={{ width: 74, minHeight: high ? 60 : 52 }}
        >
          <span
            style={{
              fontFamily: T.mono,
              fontSize: 13,
              letterSpacing: "0.6px",
              fontWeight: 700,
              color: past ? "#4f4d59" : high ? "#e8e6f2" : "#8b899a",
            }}
          >
            {ev.time || "—"}
          </span>
        </div>

        <div className="flex w-7 shrink-0 items-start justify-center pt-[22px]">
          <span
            className="rounded-full"
            style={{
              width: 9,
              height: 9,
              background: high ? imp.color : "#0d0d13",
              border: `2px solid ${high ? imp.color : hov || open ? `${imp.color}99` : "#2f2e3a"}`,
              boxShadow: high
                ? `0 0 0 3px ${imp.color}24, 0 0 12px 2px ${imp.color}80`
                : "none",
              transition: "all .18s",
            }}
          />
        </div>

        <div
          className="relative flex min-w-0 flex-1 items-center gap-3.5 overflow-hidden pl-[18px] pr-3"
          style={{
            minHeight: high ? 60 : 52,
            borderRadius: open ? "14px 14px 0 0" : 14,
            background: open
              ? "#15141d"
              : hov
                ? high
                  ? "#171320"
                  : "#12121a"
                : high
                  ? "#100f16"
                  : "#0c0c11",
            border: `1px solid ${open ? `${imp.color}5e` : hov ? `${imp.color}4d` : high ? "#27212c" : "#18181f"}`,
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
            className="relative flex h-[25px] w-[62px] shrink-0 items-center justify-center gap-1.5 rounded-lg"
            style={{
              background: high ? `${imp.color}1f` : "#ffffff0a",
              border: `1px solid ${high ? `${imp.color}42` : "#22222c"}`,
              color: high ? "#ffd9d9" : "#a5a3b3",
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

          <span className="relative flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="min-w-0 truncate"
              style={{
                fontFamily: T.display,
                fontSize: high ? 16.5 : 14.5,
                fontWeight: high ? 600 : 500,
                letterSpacing: "-0.3px",
                color: high ? "#ffffff" : hov || open ? "#e6e4ee" : "#bab8c6",
                transition: "color .18s",
              }}
            >
              {ev.title}
            </span>
            {high && (
              <span className="flex shrink-0 items-center gap-[3px]">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-3 w-[3px] rounded-sm"
                    style={{ background: "#ff7b7b" }}
                  />
                ))}
              </span>
            )}
          </span>

          <span className="relative flex w-[88px] shrink-0 items-center justify-end gap-1.5">
            <span
              style={{
                fontFamily: T.display,
                fontSize: 15,
                fontWeight: ev.actual ? 700 : 500,
                letterSpacing: "-0.2px",
                color: actColor,
              }}
            >
              {ev.actual || "—"}
            </span>
            {!!sur && ev.actual && (
              <span
                style={{
                  fontSize: 9,
                  lineHeight: 1,
                  color: sur > 0 ? "#6fe0b4" : "#ff9d9d",
                }}
              >
                {sur > 0 ? "▲" : "▼"}
              </span>
            )}
          </span>

          <span className="relative">{cell(ev.forecast, "#c2c0ce", 600)}</span>
          <span className="relative">{cell(ev.previous, "#75738a", 500)}</span>

          <span className="relative flex w-9 shrink-0 items-center justify-end gap-1">
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
                color: hov || open ? "#a5a3b3" : "#43414d",
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
            <div className="w-[102px] shrink-0" />
            <div
              className="min-w-0 flex-1 overflow-hidden"
              style={{
                border: `1px solid ${imp.color}5e`,
                borderTopWidth: 0,
                borderRadius: "0 0 14px 14px",
                background: "linear-gradient(180deg,#100f17,#0b0b10)",
              }}
            >
              <div className="flex flex-wrap items-stretch">
                <div className="min-w-[300px] flex-1 px-6 py-5">
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{
                      fontFamily: T.mono,
                      letterSpacing: "1.8px",
                      color: "#9a98ab",
                    }}
                  >
                    Що це означає
                  </span>

                  {mine && (
                    <p
                      className="mt-3 text-[13.5px]"
                      style={{
                        fontFamily: T.sans,
                        color: "#d9d7e4",
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
                        color: "#b9b7ca",
                        lineHeight: 1.65,
                      }}
                    >
                      {ext.text}
                    </p>
                  )}

                  {ext === false && !mine && (
                    <p
                      className="mt-3 text-[13px]"
                      style={{ fontFamily: T.sans, color: "#7d7b8e" }}
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
                          background: "#ffffff0a",
                          border: "1px solid #23232e",
                          color: "#a99cff",
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
                          background: watched ? A(0.18) : "#ffffff0a",
                          border: `1px solid ${watched ? A(0.5) : "#23232e"}`,
                          color: watched ? "#c4baff" : "#a5a3b3",
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
                  className="w-px shrink-0"
                  style={{ background: "#1c1c25" }}
                />

                <div className="w-[280px] shrink-0 px-[22px] py-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="text-[10px] font-bold uppercase"
                      style={{
                        fontFamily: T.mono,
                        letterSpacing: "1.8px",
                        color: "#9a98ab",
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
                              ? "#c2c0ce"
                              : gap.d > 0
                                ? "#6fe0b4"
                                : gap.d < 0
                                  ? "#ff9d9d"
                                  : "#ffffff",
                          }}
                        >
                          {gap.d === 0 ? "0" : fmtDelta(gap.d, gap.unit)}
                        </span>
                        {gap.d !== 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: !gap.done
                                ? "#75738a"
                                : gap.d > 0
                                  ? "#6fe0b4"
                                  : "#ff9d9d",
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
                          color: "#b9b7ca",
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
                                  b.label === "факт" ? "#ffffff" : "#9d9bad",
                              }}
                            >
                              {b.raw}
                            </div>
                            <div
                              className="mt-[3px]"
                              style={{
                                fontFamily: T.sans,
                                fontSize: 10,
                                color: "#57555f",
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
                      style={{ fontFamily: T.sans, color: "#7d7b8e" }}
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
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[330px] flex-col gap-2.5">
      {list.map((a) => (
        <div
          key={a.id}
          className="pointer-events-auto relative overflow-hidden rounded-2xl px-4 py-3.5"
          style={{
            background: "linear-gradient(120deg,#1a1424,#101017 60%,#0c0c12)",
            border: "1px solid #ff7b7b3d",
            boxShadow: "0 26px 60px -22px #000, 0 0 40px -26px #ff7b7b",
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
              background: "#ff7b7b",
              filter: "blur(60px)",
              opacity: 0.16,
            }}
          />

          <div className="relative flex items-start gap-3">
            <span
              className="mt-[3px] grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{
                background: "#ff7b7b1f",
                border: "1px solid #ff7b7b45",
                color: "#ffb3b3",
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
                  color: "#ff9d9d",
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
                  color: "#ffffff",
                }}
              >
                {a.title}
              </div>

              <div
                className="mt-1.5 flex items-center gap-2 text-[11.5px]"
                style={{ fontFamily: T.sans, color: "#9d9bad" }}
              >
                <span className="flex items-center gap-1.5">
                  <Flag ccy={a.ccy} size={13} />
                  {a.ccy}
                </span>
                {a.forecast && (
                  <>
                    <span
                      className="h-[3px] w-[3px] rounded-full"
                      style={{ background: "#3c3a49" }}
                    />
                    <span>прогноз {a.forecast}</span>
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => setList((s) => s.filter((x) => x.id !== a.id))}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
              style={{ color: "#6f6d7d" }}
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
    { id: "all", label: "Усі події", color: "#7A7A85" },
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

      <div className="relative z-10 mx-auto w-[94%] max-w-[1400px] pb-24 pt-5 lg:pt-7">
        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex flex-wrap items-end justify-between gap-8"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-[9px]">
              <span
                className="h-[5px] w-[5px] rounded-full"
                style={{
                  background: "#8b7cff",
                  boxShadow: `0 0 12px 2px ${A(0.67)}`,
                }}
              />
              <span
                className="text-[10px] font-bold uppercase"
                style={{
                  fontFamily: T.mono,
                  letterSpacing: "2.6px",
                  color: "#9b8dff",
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
                  background: "linear-gradient(170deg,#ffffff 32%,#a9a5bd)",
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
                    color: "#7d7b8e",
                  }}
                >
                  {rangeLabel}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* вплив */}
            <div className="relative">
              <DropButton
                open={impOpen}
                active={imp !== "all"}
                color={impCur.color}
                minWidth={172}
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
                  className="min-w-0 flex-1 whitespace-nowrap text-left text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: "#ffffff" }}
                >
                  {impCur.label}
                </span>
              </DropButton>

              {impOpen && (
                <Panel width={218}>
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
                          color: on ? "#ffffff" : "#9d9bad",
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
                            color: "#7d7b8e",
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
            <div className="relative">
              <DropButton
                open={ccyOpen}
                active={ccy !== "all"}
                color={T.acc}
                minWidth={156}
                onClick={() => {
                  setCcyOpen((v) => !v);
                  setImpOpen(false);
                }}
              >
                <Globe
                  size={14}
                  strokeWidth={1.7}
                  style={{ color: "#a3a1b2", flex: "none" }}
                />
                <span
                  className="min-w-0 flex-1 whitespace-nowrap text-left text-[12.5px] font-semibold"
                  style={{ fontFamily: T.sans, color: "#ffffff" }}
                >
                  {ccy === "all" ? "Всі валюти" : ccy}
                </span>
              </DropButton>

              {ccyOpen && (
                <Panel width={242}>
                  <button
                    onClick={() => {
                      setCcy("all");
                      setCcyOpen(false);
                    }}
                    className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[12.5px] font-semibold"
                    style={{
                      fontFamily: T.sans,
                      background: ccy === "all" ? A(0.17) : "transparent",
                      color: ccy === "all" ? "#ffffff" : "#9d9bad",
                    }}
                  >
                    <span className="flex-1 text-left">Всі валюти</span>
                    <span
                      style={{
                        fontFamily: T.mono,
                        fontSize: 10.5,
                        color: "#7d7b8e",
                      }}
                    >
                      {rows.length}
                    </span>
                  </button>

                  <div
                    className="mx-0.5 my-1.5 h-px"
                    style={{ background: "#22222c" }}
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
                            background: on ? A(0.17) : "#ffffff08",
                            border: `1px solid ${on ? A(0.5) : "#22222c"}`,
                            color: on ? "#ffffff" : "#a3a1b2",
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
              className="grid h-10 w-[42px] shrink-0 place-items-center rounded-xl"
              style={{
                background: "#ffffff08",
                border: "1px solid #21212b",
                color: "#a3a1b2",
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#ffffff16";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ffffff08";
                e.currentTarget.style.color = "#a3a1b2";
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
                background: "#0b0b10",
                border: "1px dashed #1e1e27",
                fontFamily: T.sans,
                color: "#6f6d7d",
              }}
            >
              {busy ? "вантажу тиждень…" : "на цей тиждень даних немає"}
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-2">
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
            className="relative mt-3.5 overflow-hidden rounded-2xl px-[18px] py-3.5"
            style={{
              background: "linear-gradient(120deg,#181220,#0f0f16 52%,#0c0c12)",
              border: "1px solid #ff7b7b33",
              boxShadow: "0 16px 40px -26px #ff7b7b59",
            }}
          >
            <span
              className="pointer-events-none absolute rounded-full"
              style={{
                left: -50,
                top: -70,
                width: 280,
                height: 190,
                background: "#ff7b7b",
                filter: "blur(70px)",
                opacity: 0.13,
              }}
            />

            <div className="relative flex flex-wrap items-center gap-[18px]">
              <div className="flex shrink-0 items-center gap-[11px]">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "#ff7b7b",
                    boxShadow: "0 0 10px 2px #ff7b7bcc",
                  }}
                />
                <div>
                  <div
                    className="text-[8.5px] font-bold uppercase"
                    style={{
                      fontFamily: T.mono,
                      letterSpacing: "2.2px",
                      color: "#ff9d9d",
                    }}
                  >
                    Далі — {evWord(upcoming.list.length)} разом
                  </div>
                  <div
                    className="mt-[5px] flex items-baseline gap-[3px]"
                    style={{
                      fontFamily: T.display,
                      fontWeight: 700,
                      color: "#ffffff",
                      letterSpacing: "-1px",
                      lineHeight: 1,
                    }}
                  >
                    <span className="text-[25px]">{cdH}</span>
                    <span
                      className="text-[12.5px]"
                      style={{ color: "#8b8998" }}
                    >
                      г
                    </span>
                    <span className="ml-1 text-[25px]">{cdM}</span>
                    <span
                      className="text-[12.5px]"
                      style={{ color: "#8b8998" }}
                    >
                      хв
                    </span>
                  </div>
                </div>
              </div>

              <span
                className="h-[38px] w-px shrink-0"
                style={{
                  background:
                    "linear-gradient(180deg,transparent,#ffffff2b,transparent)",
                }}
              />

              <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2">
                {upcoming.list.slice(0, 4).map((e) => (
                  <span
                    key={e.id}
                    className="flex items-center gap-2.5 rounded-[11px] py-[7px] pl-2 pr-3"
                    style={{
                      background: "#ffffff0a",
                      border: "1px solid #2c2c38",
                    }}
                  >
                    <span
                      className="flex h-[22px] items-center gap-1.5 rounded-[7px] px-[7px]"
                      style={{
                        background: "#ff7b7b1f",
                        border: "1px solid #ff7b7b42",
                      }}
                    >
                      <Flag ccy={e.ccy} size={12} />
                      <span
                        style={{
                          fontFamily: T.mono,
                          fontSize: 10,
                          letterSpacing: "0.9px",
                          fontWeight: 700,
                          color: "#ffd9d9",
                        }}
                      >
                        {e.ccy}
                      </span>
                    </span>
                    <span
                      className="whitespace-nowrap"
                      style={{
                        fontFamily: T.display,
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "#ffffff",
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {e.title}
                    </span>
                    {e.forecast && (
                      <span
                        className="whitespace-nowrap"
                        style={{
                          fontFamily: T.mono,
                          fontSize: 11,
                          color: "#a3a1b2",
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
                background: "#ffffff06",
                border: "1px dashed #2d2d3a",
                color: "#a3a1b2",
                fontFamily: T.sans,
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = A(0.5);
                e.currentTarget.style.color = "#a99cff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2d2d3a";
                e.currentTarget.style.color = "#a3a1b2";
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
                color: "#c4baff",
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
                background: "#ffffff06",
                border: "1px solid #21212b",
                color: "#a3a1b2",
                fontFamily: T.sans,
                transition: "all .16s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#ffffff12";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#ffffff06";
                e.currentTarget.style.color = "#a3a1b2";
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
              color: "#6f6d7d",
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
              border: "1px solid #ff8f8f33",
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
                  color: "#b9b7ca",
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
            style={{ fontFamily: T.sans, color: "#7d7b8e" }}
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
            style={{ fontFamily: T.sans, color: "#8b8998", lineHeight: 1.7 }}
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
                  className="flex cursor-pointer select-none items-center gap-3.5">
                  <div
                    className="w-14 shrink-0 rounded-[13px] py-2 text-center"
                    style={{
                      background: now ? A(0.12) : "#ffffff06",
                      border: `1px solid ${now ? A(0.37) : "#1e1e27"}`,
                      boxShadow: now ? `0 0 24px -10px ${A(0.8)}` : "none",
                    }}
                  >
                    <div
                      className="text-[9px] font-bold uppercase"
                      style={{
                        fontFamily: T.mono,
                        letterSpacing: "1.6px",
                        color: "#9a98ab",
                      }}
                    >
                      {d
                        .toLocaleDateString("uk-UA", { weekday: "short" })
                        .replace(".", "")}
                    </div>
                    <div
                      className="mt-0.5"
                      style={{
                        fontFamily: T.display,
                        fontSize: 21,
                        fontWeight: 700,
                        letterSpacing: "-0.8px",
                        color: "#ffffff",
                        lineHeight: 1,
                      }}
                    >
                      {String(d.getDate()).padStart(2, "0")}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="capitalize"
                        style={{
                          fontFamily: T.display,
                          fontSize: 16.5,
                          fontWeight: 600,
                          color: "#ffffff",
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
                              background: "#a99cff",
                              boxShadow: `0 0 8px 1px ${A(0.8)}`,
                            }}
                          />
                          <span
                            className="text-[8.5px] font-bold uppercase"
                            style={{
                              fontFamily: T.mono,
                              letterSpacing: "1.4px",
                              color: "#c4baff",
                            }}
                          >
                            Сьогодні
                          </span>
                        </span>
                      )}
                    </div>

                    <div
                      className="mt-1 flex items-center gap-2.5 text-[11.5px]"
                      style={{ fontFamily: T.sans, color: "#8b8998" }}
                    >
                      <span>{evWord(list.length)}</span>
                      {high > 0 && (
                        <>
                          <span
                            className="h-[3px] w-[3px] rounded-full"
                            style={{ background: "#3c3a49" }}
                          />
                          <span
                            className="font-semibold"
                            style={{ color: "#ff9d9d" }}
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
                      background: "linear-gradient(90deg,#22222c,transparent)",
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
                            color: "#6f6d7d",
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
                    className="pointer-events-none absolute w-px"
                    style={{
                      left: 88,
                      top: 14,
                      bottom: 14,
                      background:
                        "linear-gradient(180deg,transparent,#22222c 6%,#22222c 94%,transparent)",
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
      className="flex h-9 shrink-0 items-center gap-2 rounded-xl pl-3.5 pr-3"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: shut ? (hov ? A(0.2) : A(0.12)) : hov ? "#ffffff14" : "#ffffff08",
        border: `1px solid ${shut ? A(hov ? 0.7 : 0.45) : hov ? "#3a3947" : "#26262f"}`,
        color: shut ? "#c4baff" : hov ? "#ffffff" : "#9d9bad",
        transition: "all .16s",
      }}
    >
      <span
        className="whitespace-nowrap text-[11.5px] font-bold"
        style={{ fontFamily: T.sans }}
      >
        {shut ? `Показати ${evWordAcc(count)}` : "Згорнути день"}
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
      className="grid w-[38px] shrink-0 place-items-center rounded-[13px]"
      style={{
        background: hov && !disabled ? "#ffffff12" : "#ffffff06",
        border: `1px solid ${hov && !disabled ? "#33333f" : "#1c1c25"}`,
        color: disabled ? "#3a3945" : hov ? "#ffffff" : "#a3a1b2",
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
      <div className="flex w-[74px] shrink-0 items-center justify-end pr-3">
        <span
          style={{
            fontFamily: T.mono,
            fontSize: 11,
            letterSpacing: "0.6px",
            fontWeight: 700,
            color: "#c4baff",
          }}
        >
          {now}
        </span>
      </div>
      <div className="flex w-7 shrink-0 items-center justify-center">
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
        style={{ fontFamily: T.mono, letterSpacing: "2px", color: "#8b7cff" }}
      >
        Зараз
      </div>
    </div>
  );
}
