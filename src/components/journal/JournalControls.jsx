import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, ChevronDown, Check, X, Calendar } from "lucide-react";
import { T, EASE, SPRING } from "../../lib/theme";
import AssetIcon from "../ui/AssetIcon";

/* ==================================================================
   Керування журналом: селект активу, пресети періоду, швидкі фільтри.
================================================================== */

const CTRL =
  "flex h-[42px] items-center gap-2 rounded-xl px-4 text-[14px] font-bold transition-all duration-200";

/* ---------- Дропдаун активу ---------- */
export function AssetFilter({ options, value, onChange, categories = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) =>
      ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`${CTRL} min-w-[142px] justify-between`}
        style={{
          background: T.sunken,
          border: `1px solid ${open || value !== "All" ? T.lineAcc : T.line}`,
          color: value === "All" ? T.text2 : T.text,
          fontFamily: T.sans,
        }}
      >
        <span className="flex items-center gap-2">
          {value === "All" ? (
            <Filter size={14} strokeWidth={2.5} style={{ color: T.text4 }} />
          ) : (
            <span className="flex w-9 shrink-0 items-center justify-start">
              <AssetIcon symbol={value} category={categories[value]} />
            </span>
          )}
          {value === "All" ? "Усі активи" : value}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          <ChevronDown size={14} strokeWidth={2.5} style={{ color: T.text4 }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 top-[calc(100%+6px)] z-[120] max-h-[280px] w-full min-w-[180px] overflow-y-auto rounded-xl p-1.5 asset-dropdown-scroll"
            style={{
              background: T.surface,
              border: `1px solid ${T.lineHi}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
            }}
          >
            {options.map((o) => {
              const active = value === o;
              return (
                <button
                  key={o}
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors duration-150"
                  style={{ background: active ? T.surfaceHi : "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = T.surfaceHi)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = active
                      ? T.surfaceHi
                      : "transparent")
                  }
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {o !== "All" && (
                      <span className="flex w-9 shrink-0 items-center justify-start">
                        <AssetIcon symbol={o} category={categories[o]} />
                      </span>
                    )}
                    <span
                      className="truncate text-[14px] font-bold"
                      style={{
                        fontFamily: T.sans,
                        color: active ? T.acc : T.text2,
                      }}
                    >
                      {o === "All" ? "Усі активи" : o}
                    </span>
                  </span>
                  {active && (
                    <Check size={14} strokeWidth={3} style={{ color: T.acc }} className="shrink-0" />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Пресети періоду ---------- */
const PERIODS = [
  { id: "all", label: "Весь час" },
  { id: "7d", label: "7 днів" },
  { id: "30d", label: "30 днів" },
  { id: "90d", label: "3 місяці" },
  { id: "month", label: "Цей місяць" },
];

export function PeriodFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) =>
      ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const current = PERIODS.find((p) => p.id === value) || PERIODS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`${CTRL} min-w-[128px] justify-between`}
        style={{
          background: T.sunken,
          border: `1px solid ${open || value !== "all" ? T.lineAcc : T.line}`,
          color: value === "all" ? T.text2 : T.text,
          fontFamily: T.sans,
        }}
      >
        <span className="flex items-center gap-2">
          <Calendar
            size={14}
            strokeWidth={2.5}
            style={{ color: value === "all" ? T.text4 : T.acc }}
          />
          {current.label}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex"
        >
          <ChevronDown size={14} strokeWidth={2.5} style={{ color: T.text4 }} />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute left-0 top-[calc(100%+6px)] z-[120] w-full min-w-[150px] rounded-xl p-1.5"
            style={{
              background: T.surface,
              border: `1px solid ${T.lineHi}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
            }}
          >
            {PERIODS.map((p) => {
              const active = value === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors duration-150"
                  style={{ background: active ? T.surfaceHi : "transparent" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = T.surfaceHi)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = active
                      ? T.surfaceHi
                      : "transparent")
                  }
                >
                  <span
                    className="text-[14px] font-bold"
                    style={{
                      fontFamily: T.sans,
                      color: active ? T.acc : T.text2,
                    }}
                  >
                    {p.label}
                  </span>
                  {active && (
                    <Check size={14} strokeWidth={3} style={{ color: T.acc }} />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function periodToRange(id) {
  const fmt = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const now = new Date();
  const back = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  };
  switch (id) {
    case "7d":
      return { from: fmt(back(7)), to: fmt(now) };
    case "30d":
      return { from: fmt(back(30)), to: fmt(now) };
    case "90d":
      return { from: fmt(back(90)), to: fmt(now) };
    case "month":
      return {
        from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: fmt(now),
      };
    default:
      return { from: "", to: "" };
  }
}

/* ==================================================================
   Швидкі фільтри — пілюлі над таблицею. Працюють поверх завантажених
   угод, тому реагують миттєво, без запиту на сервер.
================================================================== */
export const QUICK = [
  {
    id: "win",
    label: "Win",
    c: T.ok,
    rgb: T.okRgb,
    test: (t) => t.result?.trim().toLowerCase() === "win",
  },
  {
    id: "lose",
    label: "Lose",
    c: T.bad,
    rgb: T.badRgb,
    test: (t) => t.result?.trim().toLowerCase() === "lose",
  },
  {
    id: "be",
    label: "BE",
    c: T.warn,
    rgb: T.warnRgb,
    test: (t) => t.result?.trim().toLowerCase() === "be",
  },
  {
    id: "offplan",
    label: "Не за планом",
    c: T.bad,
    rgb: T.badRgb,
    test: (t) => !t.followed_plan,
  },
  {
    id: "mistake",
    label: "З помилкою",
    c: T.warn,
    rgb: T.warnRgb,
    test: (t) => !!t.has_mistake,
  },
  {
    id: "rushed",
    label: "Поспіх",
    c: "#fb923c",
    rgb: "251,146,60",
    test: (t) => !!t.rushed,
  },
];

export function QuickFilters({
  active,
  onToggle,
  onClear,
  counts,
  shown,
  total,
}) {
  const has = active.length > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-5 py-3"
      style={{ borderBottom: `1px solid ${T.line}` }}
    >
      {QUICK.map((f) => {
        const on = active.includes(f.id);
        const n = counts?.[f.id] ?? 0;
        return (
          <motion.button
            key={f.id}
            onClick={() => onToggle(f.id)}
            whileTap={{ scale: 0.95 }}
            transition={SPRING}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-bold transition-all duration-200"
            style={{
              background: on ? `rgba(${f.rgb},0.12)` : T.sunken,
              border: `1px solid ${on ? `rgba(${f.rgb},0.32)` : T.line}`,
              color: on ? f.c : T.text3,
              fontFamily: T.sans,
              opacity: !on && n === 0 ? 0.45 : 1,
            }}
            onMouseEnter={(e) =>
              !on && (e.currentTarget.style.borderColor = T.lineHi)
            }
            onMouseLeave={(e) =>
              !on && (e.currentTarget.style.borderColor = T.line)
            }
          >
            {f.label}
            <span
              className="tabular-nums opacity-60"
              style={{ fontFamily: T.mono }}
            >
              {n}
            </span>
          </motion.button>
        );
      })}

      <AnimatePresence>
        {has && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={SPRING}
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-bold"
            style={{ color: T.text4, fontFamily: T.sans }}
            onMouseEnter={(e) => (e.currentTarget.style.color = T.text2)}
            onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
          >
            <X size={13} strokeWidth={2.8} /> Скинути
          </motion.button>
        )}
      </AnimatePresence>

      <span
        className="ml-auto text-[13px] font-bold tabular-nums"
        style={{ fontFamily: T.sans, color: T.text3 }}
      >
        {has ? `${shown} з ${total}` : `${total} угод`}
      </span>
    </div>
  );
}
