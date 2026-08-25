import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  BookOpen, Plus, TrendingUp, TrendingDown, Minus, AlertTriangle, X,
  Filter, Calendar, ChevronDown, Check, Search, ShieldAlert, AlertOctagon, Zap,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { getTradeProfit } from "../utils/journalUtils";
import { T, EASE, SPRING, useEdgeFonts, stagger, fadeUp } from "../lib/theme";

import TradeModal from "../components/modals/TradeModal";
import TradeDetailsModal from "../components/modals/TradeDetailsModal";
import StatCards, { StreakBar } from "../components/journal/StatCards";
import { Magnetic, Shine } from "../components/ui/Hovers";
import TradesTable from "../components/journal/TradesTable";
import AssetIcon from "../components/ui/AssetIcon";

const PAGE = 10;

/* ==================================================================
   Селектори фільтрів — власний преміальний стиль сторінки Journal.
   Двоярусний тригер (дрібний лейбл зверху, значення знизу) — патерн
   фінтех-дашбордів (Stripe/Mercury), а не просто «іконка + текст».
   Скляна панель з ковзним підсвітом активного рядка; в активі —
   миттєвий пошук, бо список активів росте разом з журналом.
================================================================== */

function FieldTrigger({ label, value, icon, active, open, onClick, minWidth = 148 }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING}
      className="relative flex h-[44px] flex-col justify-center gap-0.5 rounded-xl px-3 text-left"
      style={{
        minWidth,
        background: active
          ? `linear-gradient(180deg, rgba(${T.accRgb},0.10), rgba(${T.accRgb},0.02))`
          : T.sunken,
        border: `1px solid ${open || active ? T.lineAcc : T.line}`,
        boxShadow: open
          ? `0 10px 26px -10px rgba(${T.accRgb},0.5)`
          : active
          ? `0 4px 14px -7px rgba(${T.accRgb},0.3)`
          : "none",
      }}
    >
      <span className="flex items-center justify-between gap-2.5">
        <span
          className="text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ fontFamily: T.sans, color: active ? T.acc : T.text4 }}
        >
          {label}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className="flex shrink-0">
          <ChevronDown size={11} strokeWidth={2.6} style={{ color: active ? T.acc : T.text4 }} />
        </motion.span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
        {icon}
        <span className="truncate">{value}</span>
      </span>
    </motion.button>
  );
}

function FieldPanel({ children, width = "w-[248px]" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.16, ease: EASE }}
      className={`absolute left-0 top-[calc(100%+10px)] z-[130] ${width} overflow-hidden rounded-2xl`}
      style={{
        background: T.surfaceHi,
        border: `1px solid ${T.lineHi}`,
        boxShadow: "0 30px 70px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {children}
    </motion.div>
  );
}

function OptionRow({ active, layoutId, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="group/opt relative flex w-full items-center justify-between overflow-hidden rounded-xl px-3 py-2.5 text-left"
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          transition={SPRING}
          className="absolute inset-0 -z-10 rounded-xl"
          style={{ background: `rgba(${T.accRgb},0.14)` }}
        />
      )}
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200 group-hover/opt:h-[60%]"
        style={{ background: T.acc }}
      />
      {children}
    </button>
  );
}

function AssetSelect({ options, value, onChange, categories }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const active = value !== "All";

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQ(""); }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const assets = options.filter((o) => o !== "All");
  const filtered = q ? assets.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : assets;

  return (
    <div className="relative" ref={ref}>
      <FieldTrigger
        label="Актив"
        value={active ? value : "Усі активи"}
        active={active}
        open={open}
        onClick={() => setOpen((v) => !v)}
        icon={
          active ? (
            <span className="flex w-5 shrink-0 scale-[0.8] items-center justify-start">
              <AssetIcon symbol={value} category={categories[value]} />
            </span>
          ) : (
            <Filter size={13} strokeWidth={2.4} style={{ color: T.text3 }} />
          )
        }
      />
      <AnimatePresence>
        {open && (
          <FieldPanel>
            <div className="p-2" style={{ borderBottom: `1px solid ${T.line}` }}>
              <div className="flex items-center gap-2 rounded-xl px-3" style={{ background: T.sunken, height: 38 }}>
                <Search size={13} strokeWidth={2.4} style={{ color: T.text4 }} />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Пошук активу…"
                  className="w-full border-none bg-transparent text-[13.5px] outline-none"
                  style={{ fontFamily: T.sans, color: T.text }}
                />
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto asset-dropdown-scroll p-1.5">
              {!q && (
                <OptionRow active={value === "All"} layoutId="asset-select-active" onClick={() => { onChange("All"); setOpen(false); setQ(""); }}>
                  <span className="flex items-center gap-2.5 pl-1.5 text-[14px] font-bold" style={{ fontFamily: T.sans, color: value === "All" ? T.acc : T.text2 }}>
                    <Filter size={14} strokeWidth={2.4} style={{ color: value === "All" ? T.acc : T.text4 }} />
                    Усі активи
                  </span>
                  {value === "All" && <Check size={14} strokeWidth={3} style={{ color: T.acc }} />}
                </OptionRow>
              )}

              {filtered.map((o) => {
                const rowActive = value === o;
                return (
                  <OptionRow key={o} active={rowActive} layoutId="asset-select-active" onClick={() => { onChange(o); setOpen(false); setQ(""); }}>
                    <span className="flex min-w-0 items-center gap-2.5 pl-1.5">
                      <span className="flex w-9 shrink-0 items-center justify-start">
                        <AssetIcon symbol={o} category={categories[o]} />
                      </span>
                      <span className="truncate text-[14px] font-bold" style={{ fontFamily: T.sans, color: rowActive ? T.acc : T.text2 }}>
                        {o}
                      </span>
                    </span>
                    {rowActive && <Check size={14} strokeWidth={3} style={{ color: T.acc }} className="shrink-0" />}
                  </OptionRow>
                );
              })}

              {q && !filtered.length && (
                <div className="px-3 py-8 text-center text-[13px]" style={{ color: T.text4, fontFamily: T.sans }}>
                  Актив не знайдено
                </div>
              )}
            </div>
          </FieldPanel>
        )}
      </AnimatePresence>
    </div>
  );
}

const PERIODS = [
  { id: "all", label: "Весь час" },
  { id: "7d", label: "7 днів" },
  { id: "30d", label: "30 днів" },
  { id: "90d", label: "3 місяці" },
  { id: "month", label: "Цей місяць" },
];

function PeriodSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = value !== "all";
  const current = PERIODS.find((p) => p.id === value) || PERIODS[0];

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <FieldTrigger
        label="Період"
        value={current.label}
        active={active}
        open={open}
        minWidth={132}
        onClick={() => setOpen((v) => !v)}
        icon={<Calendar size={13} strokeWidth={2.4} style={{ color: active ? T.acc : T.text3 }} />}
      />
      <AnimatePresence>
        {open && (
          <FieldPanel width="w-[178px]">
            <div className="p-1.5">
              {PERIODS.map((p) => {
                const rowActive = value === p.id;
                return (
                  <OptionRow key={p.id} active={rowActive} layoutId="period-select-active" onClick={() => { onChange(p.id); setOpen(false); }}>
                    <span className="pl-1.5 text-[14px] font-bold" style={{ fontFamily: T.sans, color: rowActive ? T.acc : T.text2 }}>
                      {p.label}
                    </span>
                    {rowActive && <Check size={14} strokeWidth={3} style={{ color: T.acc }} />}
                  </OptionRow>
                );
              })}
            </div>
          </FieldPanel>
        )}
      </AnimatePresence>
    </div>
  );
}

function periodToRange(id) {
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
    case "7d": return { from: fmt(back(7)), to: fmt(now) };
    case "30d": return { from: fmt(back(30)), to: fmt(now) };
    case "90d": return { from: fmt(back(90)), to: fmt(now) };
    case "month": return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
    default: return { from: "", to: "" };
  }
}

/* ==================================================================
   Швидкі фільтри — пілюлі над таблицею. Працюють поверх завантажених
   угод, тому реагують миттєво, без запиту на сервер.
================================================================== */
/* Два смислові кластери, а не один ряд з шести однакових пілюль:
   зліва — результат угоди (взаємовиключні стани), справа —
   дисципліна виконання (незалежні прапорці). Розведення по різних
   боках рядка саме й показує цю різницю значень, а не тільки колір. */
const QUICK_RESULT = [
  { id: "win",  label: "Take", icon: TrendingUp,   c: T.ok,   rgb: T.okRgb,   test: (t) => t.result?.trim().toLowerCase() === "win" },
  { id: "lose", label: "Stop", icon: TrendingDown, c: T.bad,  rgb: T.badRgb,  test: (t) => t.result?.trim().toLowerCase() === "lose" },
  { id: "be",   label: "BE",   icon: Minus,        c: T.warn, rgb: T.warnRgb, test: (t) => t.result?.trim().toLowerCase() === "be" },
];
const QUICK_DISCIPLINE = [
  { id: "offplan", label: "Не за планом", icon: ShieldAlert,  c: T.bad,  rgb: T.badRgb,  test: (t) => !t.followed_plan },
  { id: "mistake", label: "З помилкою",   icon: AlertOctagon, c: T.warn, rgb: T.warnRgb, test: (t) => !!t.has_mistake },
  { id: "rushed",  label: "Поспіх",       icon: Zap,          c: "#fb923c", rgb: "251,146,60", test: (t) => !!t.rushed },
];
const QUICK = [...QUICK_RESULT, ...QUICK_DISCIPLINE];

const TILE_PRESS = { type: "spring", duration: 0.22, bounce: 0 };
const TILE_CONFIRM = { type: "spring", duration: 0.34, bounce: 0.3 };
const CHECK_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', 'Roboto Mono', Menlo, monospace";

/* Швидкий фільтр — компактна картка з іконкою-бейджем. Активний
   стан читається одразу з трьох сигналів одночасно (не тільки
   з кольору): верхня риска, підсвічений бейдж, і сама іконка, що
   «оживає» легким bounce-переходом — щоб клік відчувався подією,
   а не просто перемиканням кольору. */
function QuickTile({ f, on, n, onToggle }) {
  const Icon = f.icon;
  const dim = !on && n === 0;

  return (
    <motion.button
      onClick={onToggle}
      disabled={dim}
      whileHover={dim ? undefined : { y: -2 }}
      whileTap={dim ? undefined : { scale: 0.96 }}
      transition={TILE_PRESS}
      className="group relative flex min-w-[92px] items-center gap-2 overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors duration-150"
      style={{
        background: on ? `linear-gradient(165deg, rgba(${f.rgb},0.15), rgba(${f.rgb},0.03))` : T.sunken,
        border: `1px solid ${on ? `rgba(${f.rgb},0.42)` : T.line}`,
        opacity: dim ? 0.4 : 1,
        boxShadow: on
          ? `inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 20px -10px rgba(${f.rgb},0.55)`
          : "inset 0 1px 0 rgba(255,255,255,0.02)",
        cursor: dim ? "default" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (dim) return;
        e.currentTarget.style.borderColor = on ? `rgba(${f.rgb},0.7)` : T.lineHi;
        if (!on) e.currentTarget.style.background = T.surfaceHi;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = on ? `rgba(${f.rgb},0.42)` : T.line;
        if (!on) e.currentTarget.style.background = T.sunken;
      }}
    >
      {/* Верхня акцентна риска — сигнал стану ще до того, як прочитав число */}
      <span
        className="absolute inset-x-0 top-0 h-[2px] origin-left transition-transform duration-300"
        style={{ background: f.c, transform: on ? "scaleX(1)" : "scaleX(0)" }}
      />

      {/* Сам бейдж — це і є чекбокс: вимкнено — помітна нейтральна
          рамка з іконкою категорії; увімкнено — суцільна заливка
          кольором з галочкою. Один чіткий елемент замість двох
          слабких, тому видно одразу, а не треба придивлятись. */}
      <span
        className="relative grid h-7 w-7 shrink-0 place-items-center rounded-md border-[1.5px] transition-colors duration-150"
        style={{
          background: on ? f.c : "transparent",
          borderColor: on ? f.c : T.text3,
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={on ? "on" : "off"}
            initial={{ scale: 0.55, opacity: 0, rotate: on ? -18 : 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.55, opacity: 0 }}
            transition={TILE_CONFIRM}
          >
            {on ? (
              <Check size={14} strokeWidth={3.2} style={{ color: T.bg }} />
            ) : (
              <Icon size={13} strokeWidth={2.4} style={{ color: T.text2 }} />
            )}
          </motion.span>
        </AnimatePresence>
      </span>

      <span className="flex min-w-0 flex-col gap-0">
        <span
          className="truncate text-[9.5px] font-bold uppercase tracking-[0.05em]"
          style={{ fontFamily: T.sans, color: on ? f.c : T.text4 }}
        >
          {f.label}
        </span>
        <span className="text-[14px] font-black leading-none tabular-nums" style={{ fontFamily: CHECK_MONO, color: on ? T.text : T.text2 }}>
          {n}
        </span>
      </span>
    </motion.button>
  );
}

function QuickFilters({ active, onToggle, onClear, counts, shown, total }) {
  const has = active.length > 0;

  return (
    <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
          Швидкі фільтри
        </span>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {has && (
              <motion.button
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={TILE_PRESS}
                whileTap={{ scale: 0.94 }}
                onClick={onClear}
                className="flex items-center gap-1 text-[12px] font-bold transition-colors"
                style={{ color: T.text4, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <X size={11} strokeWidth={3} /> Скинути
              </motion.button>
            )}
          </AnimatePresence>
          <span className="text-[12px] font-bold tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
            {has ? `${shown} з ${total}` : `${total} угод`}
          </span>
        </div>
      </div>

      {/* Результат зліва, дисципліна справа — просторовий поділ сам
          читається як «це різні категорії», без додаткових пояснень. */}
      <div className="flex flex-wrap items-stretch justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Результат
          </span>
          <div className="flex gap-1.5">
            {QUICK_RESULT.map((f) => (
              <QuickTile key={f.id} f={f} on={active.includes(f.id)} n={counts?.[f.id] ?? 0} onToggle={() => onToggle(f.id)} />
            ))}
          </div>
        </div>

        <div className="hidden w-px self-stretch sm:block" style={{ background: T.line }} />

        <div className="flex flex-col items-start gap-1.5 sm:items-end">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Дисципліна
          </span>
          <div className="flex gap-1.5">
            {QUICK_DISCIPLINE.map((f) => (
              <QuickTile key={f.id} f={f} on={active.includes(f.id)} n={counts?.[f.id] ?? 0} onToggle={() => onToggle(f.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   Тултип графіка. Показує все, що корисно бачити в точці: дату,
   номер угоди, накопичений R, гроші, winrate і дисципліну на той
   момент — щоб не гадати, звідки взявся злам кривої.
================================================================== */
function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  const rows = [
    {
      label: "Накопичено",
      value: `${d.cumulativeRR > 0 ? "+" : ""}${d.cumulativeRR}R`,
      color: d.cumulativeRR >= 0 ? T.ok : T.bad,
      big: true,
    },
    {
      label: "Гроші",
      value: `${
        d.cumulativeProfit > 0 ? "+" : d.cumulativeProfit < 0 ? "−" : ""
      }$${Math.abs(d.cumulativeProfit).toFixed(2)}`,
      color: d.cumulativeProfit >= 0 ? T.ok : T.bad,
    },
    { label: "Win rate", value: `${d.winRate}%`, color: T.text2 },
    { label: "За планом", value: `${d.planRate}%`, color: T.text2 },
  ];

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "rgba(19,19,22,0.97)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${T.lineHi}`,
        boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
        minWidth: 190,
      }}
    >
      <div
        className="flex items-baseline justify-between gap-4 px-3.5 py-2.5"
        style={{ borderBottom: `1px solid ${T.line}`, background: T.sunken }}
      >
        <span
          className="text-[14px] font-bold"
          style={{ fontFamily: T.sans, color: T.text }}
        >
          {d.name}
        </span>
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{ fontFamily: T.sans, color: T.text4 }}
        >
          угода №{d.trades}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3.5 py-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-6"
          >
            <span
              className="text-[13px]"
              style={{ fontFamily: T.sans, color: T.text3 }}
            >
              {r.label}
            </span>
            <span
              className={`${
                r.big ? "text-[16px]" : "text-[14px]"
              } font-bold tabular-nums`}
              style={{ fontFamily: T.mono, color: r.color }}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TradingJournal() {
  useEdgeFonts();

  const [trades, setTrades] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [globalStatsData, setGlobalStatsData] = useState([]);
  const [accountsMap, setAccountsMap] = useState({});
  const [uniquePairs, setUniquePairs] = useState(["All"]);

  const [filterPair, setFilterPair] = useState("All");
  const [period, setPeriod] = useState("all");
  const [quick, setQuick] = useState([]);

  const [tradeToDelete, setTradeToDelete] = useState(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [pairCategories, setPairCategories] = useState({});

  const { from: dateFrom, to: dateTo } = useMemo(
    () => periodToRange(period),
    [period]
  );

  /* ---------- Завантаження ---------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("prop_accounts").select("*");
      if (data) {
        const map = {};
        data.forEach((a) => {
          map[a.firm_name] = parseFloat(
            a.account_size || a.balance || a.size || a.amount || 0
          );
        });
        setAccountsMap(map);
      }
    })();

    (async () => {
      const { data } = await supabase.from("trades").select("plan_pair");
      if (data)
        setUniquePairs([
          "All",
          ...new Set(data.map((t) => t.plan_pair).filter(Boolean)),
        ]);
    })();

    (async () => {
      const CACHE_KEY = "journal_instrument_categories_v1";
      const CACHE_TIME_KEY = "journal_instrument_categories_time_v1";
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      if (cached && cachedTime && Date.now() - Number(cachedTime) < ONE_DAY_MS) {
        try {
          setPairCategories(JSON.parse(cached));
          return;
        } catch {}
      }

      const { data } = await supabase.from("instruments").select("symbol, category");
      if (data) {
        const map = {};
        data.forEach((i) => { map[i.symbol] = i.category; });
        setPairCategories(map);
        localStorage.setItem(CACHE_KEY, JSON.stringify(map));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      }
    })();
  }, []);

  const applyFilters = useCallback(
    (q) => {
      if (filterPair !== "All") q = q.eq("plan_pair", filterPair);
      if (dateFrom) q = q.gte("plan_date", dateFrom);
      if (dateTo) q = q.lte("plan_date", dateTo);
      return q;
    },
    [filterPair, dateFrom, dateTo]
  );

  const fetchGlobalData = useCallback(async () => {
    const q = applyFilters(
      supabase
        .from("trades")
        .select(
          "plan_date, result, rr, followed_plan, has_mistake, rushed, account_name, risk"
        )
        .order("plan_date", { ascending: true })
    );
    const { data, error } = await q;
    if (!error && data) setGlobalStatsData(data);
  }, [applyFilters]);

  /* Кеш сторінок у межах поточної сесії: раз завантажену сторінку
     вдруге з сервера не тягнемо — 1→2→3→назад на 1 бере дані з
     памʼяті миттєво. Ключ несе в собі фільтри, тому зміна активу чи
     періоду просто працює з новим неймспейсом, а не плутається зі
     старими сторінками. Мутації (додав/видалив/відредагував угоду)
     скидають кеш повністю — свіжість даних важливіша за швидкість. */
  const tradesCache = useRef({});
  const cacheKey = (pageNum) => `${filterPair}|${dateFrom}|${dateTo}|${pageNum}`;

  const fetchTradesList = useCallback(
    async (pageNum = 1, { force = false } = {}) => {
      const key = cacheKey(pageNum);
      const cached = tradesCache.current[key];
      if (cached && !force) {
        setTrades(cached.data);
        setTotalCount(cached.count);
        return;
      }

      setLoadingInitial(true);
      try {
        const from = (pageNum - 1) * PAGE;
        const q = applyFilters(
          supabase
            .from("trades")
            .select("*", { count: "exact" })
            .order("plan_date", { ascending: false })
        ).range(from, from + PAGE - 1);

        const { data, error, count } = await q;
        if (error) throw error;

        tradesCache.current[key] = { data: data || [], count: count || 0 };
        setTrades(data || []);
        setTotalCount(count || 0);
      } catch (err) {
        console.error("Помилка завантаження угод:", err);
      } finally {
        setLoadingInitial(false);
      }
    },
    [applyFilters, filterPair, dateFrom, dateTo]
  );

  /* Зміна фільтрів завжди повертає на першу сторінку — інакше
     можна опинитись на сторінці 8, якої після фільтра вже нема. */
  useEffect(() => {
    setPage(1);
  }, [filterPair, dateFrom, dateTo]);

  /* Статистика/графік не залежать від сторінки — рахуються з усього
     відфільтрованого набору. Раніше цей запит висів у тому ж
     ефекті, що й сторінка, тому летів у мережу при КОЖНІЙ навігації
     між сторінками — саме це виглядало як «кожен раз підвантажує». */
  useEffect(() => {
    fetchGlobalData();
  }, [fetchGlobalData]);

  useEffect(() => {
    fetchTradesList(page);
  }, [fetchTradesList, page]);

  /* ---------- Похідні дані ---------- */
  const stats = useMemo(() => {
    const total = globalStatsData.length;
    let wins = 0,
      totalRR = 0,
      totalProfit = 0,
      followed = 0,
      mistakes = 0,
      rushed = 0;

    globalStatsData.forEach((t) => {
      if (t.result?.trim().toLowerCase() === "win") wins++;
      totalRR += t.rr ? parseFloat(t.rr) : 0;
      if (t.followed_plan) followed++;
      if (t.has_mistake) mistakes++;
      if (t.rushed) rushed++;
      const p = getTradeProfit(t, accountsMap);
      if (p !== null) totalProfit += p;
    });

    return {
      total,
      winrate: total ? Math.round((wins / total) * 100) : 0,
      totalRR: parseFloat(totalRR.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      planRate: total ? Math.round((followed / total) * 100) : 0,
      mistakeRate: total ? Math.round((mistakes / total) * 100) : 0,
      rushRate: total ? Math.round((rushed / total) * 100) : 0,
    };
  }, [globalStatsData, accountsMap]);

  /* Поточна серія — рахуємо з кінця, від найсвіжішої угоди */
  const streak = useMemo(() => {
    const graded = [...globalStatsData]
      .reverse()
      .filter((t) => ["win", "lose"].includes(t.result?.trim().toLowerCase()));
    if (!graded.length) return null;
    const type = graded[0].result.trim().toLowerCase();
    let count = 0;
    for (const t of graded) {
      if (t.result.trim().toLowerCase() !== type) break;
      count++;
    }
    return { type, count };
  }, [globalStatsData]);

  const chartData = useMemo(() => {
    let cumRR = 0,
      cumProfit = 0,
      wins = 0,
      followed = 0;
    return globalStatsData.map((t, i) => {
      cumRR += parseFloat(t.rr) || 0;
      const p = getTradeProfit(t, accountsMap);
      if (p !== null) cumProfit += p;
      if (t.result?.trim().toLowerCase() === "win") wins++;
      if (t.followed_plan) followed++;
      return {
        name: format(new Date(t.plan_date), "dd MMM", { locale: uk }),
        cumulativeRR: parseFloat(cumRR.toFixed(2)),
        cumulativeProfit: parseFloat(cumProfit.toFixed(2)),
        winRate: parseFloat(((wins / (i + 1)) * 100).toFixed(1)),
        planRate: parseFloat(((followed / (i + 1)) * 100).toFixed(1)),
        trades: i + 1,
      };
    });
  }, [globalStatsData, accountsMap]);

  /* Швидкі фільтри працюють локально — миттєво, без запиту.
     Win/Lose/BE — взаємовиключні стани однієї угоди, тому між собою
     вони об'єднуються через АБО (інакше вибір двох одразу завжди
     давав порожній список). Решта прапорців (не за планом, з
     помилкою, поспіх) — незалежні один від одного, тому лишаються
     на І: угода має відповідати кожному з них. */
  const RESULT_QUICK_IDS = ["win", "lose", "be"];
  const visibleTrades = useMemo(() => {
    if (!quick.length) return trades;
    const resultIds = quick.filter((id) => RESULT_QUICK_IDS.includes(id));
    const otherIds = quick.filter((id) => !RESULT_QUICK_IDS.includes(id));
    return trades.filter((t) => {
      const resultOk = !resultIds.length || resultIds.some((id) => QUICK.find((f) => f.id === id)?.test(t));
      const otherOk = otherIds.every((id) => QUICK.find((f) => f.id === id)?.test(t));
      return resultOk && otherOk;
    });
  }, [trades, quick]);

  const quickCounts = useMemo(() => {
    const c = {};
    QUICK.forEach((f) => {
      c[f.id] = trades.filter(f.test).length;
    });
    return c;
  }, [trades]);

  const confirmDelete = async () => {
    const id = tradeToDelete;
    setTradeToDelete(null);
    try {
      const { error } = await supabase.from("trades").delete().eq("id", id);
      if (error) throw error;
      tradesCache.current = {};
      fetchGlobalData();
      /* Останній рядок на не першій сторінці — повертаємось на
         попередню, інакше лишимось на порожній сторінці. */
      if (trades.length === 1 && page > 1) setPage((p) => p - 1);
      else fetchTradesList(page, { force: true });
    } catch {
      console.error("Не вдалося видалити угоду");
    }
  };

  const rrUp = stats.totalRR >= 0;

  return (
    <div className="relative min-h-screen w-full">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative z-10 mx-auto w-full max-w-[2200px] px-4 pb-24 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pt-6"
      >
        {/* ─────────── Хедер ─────────── */}
        <motion.div
          variants={fadeUp}
          className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"
        >
          <div className="min-w-0">
            <div
              className="mb-2 text-[13px] font-bold uppercase tracking-[0.14em]"
              style={{ fontFamily: T.sans, color: T.acc }}
            >
              Journal
            </div>
            <div className="flex items-baseline gap-3">
              <h1
                className="text-[28px] font-bold leading-none sm:text-[38px] lg:text-[46px]"
                style={{
                  fontFamily: T.display,
                  color: T.text,
                  letterSpacing: "-0.03em",
                }}
              >
                Історія угод
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <AssetSelect
              options={uniquePairs}
              categories={pairCategories}
              value={filterPair}
              onChange={setFilterPair}
            />
            <PeriodSelect value={period} onChange={setPeriod} />

            <Magnetic
              onClick={() => setIsTradeModalOpen(true)}
              className="group ml-1 inline-flex h-[54px] shrink-0 items-center justify-center rounded-2xl px-6 text-[14.5px] font-bold transition-all duration-200 hover:-translate-y-[2px]"
              style={{
                background: "#00C896",
                color: "#06110D",
                fontFamily: T.sans,
                boxShadow: "0 10px 28px -8px rgba(0, 200, 150, 0.55)",
              }}
            >
              <Shine className="[&>span]:!flex [&>span]:!flex-row [&>span]:!items-center [&>span]:!gap-2 [&>span]:!whitespace-nowrap">
                <Plus
                  size={16}
                  strokeWidth={3}
                  className="!block !shrink-0 transition-transform duration-300 group-hover:rotate-90"
                />
                <span className="!whitespace-nowrap">Додати угоду</span>
              </Shine>
            </Magnetic>
          </div>
        </motion.div>

        {/* ─────────── Статистика ─────────── */}
        <StatCards stats={stats} chartData={chartData} />

        {/* {streak && streak.count >= 2 && (
          <div className="mt-3">
            <StreakBar streak={streak} />
          </div>
        )} */}

        {/* ─────────── Графік ─────────── */}
        <motion.div
          variants={fadeUp}
          className="mt-5 overflow-hidden rounded-2xl "
          style={{ background: T.surface, border: `1px solid ${T.line}` }}
        >
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${T.line}` }}
          >
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{
                  background: `rgba(${T.accRgb},0.09)`,
                  border: `1px solid rgba(${T.accRgb},0.20)`,
                }}
              >
                <TrendingUp
                  size={17}
                  strokeWidth={2.3}
                  style={{ color: T.acc }}
                />
              </div>
              <div>
                <h3
                  className="text-[17px] font-bold leading-tight"
                  style={{ fontFamily: T.display, color: T.text }}
                >
                  Крива капіталу
                </h3>
                <p
                  className="mt-1 text-[13px]"
                  style={{ color: T.text3, fontFamily: T.sans }}
                >
                  Накопичений R за період
                </p>
              </div>
            </div>

            <span
              className="text-[18px] font-bold tabular-nums"
              style={{ fontFamily: T.mono, color: rrUp ? T.ok : T.bad }}
            >
              {stats.totalRR > 0 ? "+" : ""}
              {stats.totalRR}R
            </span>
          </div>

          <div
            className="h-[260px] w-full px-2 pb-2 pt-4"
            style={{ outline: "none", WebkitTapHighlightColor: "transparent" }}
          >
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 16, left: -14, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="jrnRR" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={rrUp ? T.ok : T.bad}
                        stopOpacity={0.2}
                      />
                      <stop
                        offset="100%"
                        stopColor={rrUp ? T.ok : T.bad}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke={T.line}
                    strokeDasharray="0"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    stroke="transparent"
                    tick={{ fill: T.text3, fontSize: 12, fontFamily: T.sans }}
                    tickLine={false}
                    axisLine={false}
                    dy={8}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="transparent"
                    tick={{ fill: T.text3, fontSize: 12, fontFamily: T.sans }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />

                  <Tooltip
                    cursor={{
                      stroke: T.lineHi,
                      strokeWidth: 1,
                      strokeDasharray: "4 4",
                    }}
                    content={<ChartTooltip />}
                  />

                  <Area
                    type="monotone"
                    dataKey="cumulativeRR"
                    stroke={rrUp ? T.ok : T.bad}
                    strokeWidth={2}
                    fill="url(#jrnRR)"
                    isAnimationActive
                    animationDuration={900}
                    animationEasing="ease-out"
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: rrUp ? T.ok : T.bad,
                      stroke: T.surface,
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <span
                  className="text-[14px]"
                  style={{ color: T.text4, fontFamily: T.sans }}
                >
                  Замало даних для графіка
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* ─────────── Таблиця ─────────── */}
        <motion.div
          variants={fadeUp}
          className="mt-5 overflow-hidden rounded-2xl"
          style={{ background: T.surface, border: `1px solid ${T.line}` }}
        >
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: `1px solid ${T.line}` }}
          >
            <div
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${T.line}`,
              }}
            >
              <BookOpen
                size={17}
                strokeWidth={2.3}
                style={{ color: T.text3 }}
              />
            </div>
            <div>
              <h3
                className="text-[17px] font-bold leading-tight"
                style={{ fontFamily: T.display, color: T.text }}
              >
                Угоди
              </h3>
              <p
                className="mt-1 text-[13px]"
                style={{ color: T.text3, fontFamily: T.sans }}
              >
                Клік по рядку — деталі
              </p>
            </div>
          </div>

          <QuickFilters
            active={quick}
            counts={quickCounts}
            shown={visibleTrades.length}
            total={totalCount}
            onToggle={(id) =>
              setQuick((q) =>
                q.includes(id) ? q.filter((x) => x !== id) : [...q, id]
              )
            }
            onClear={() => setQuick([])}
          />

          <TradesTable
            trades={visibleTrades}
            accountsMap={accountsMap}
            getProfit={getTradeProfit}
            onOpen={setSelectedTrade}
            onDelete={setTradeToDelete}
            loading={loadingInitial && trades.length === 0}
            pageSize={PAGE}
            page={page}
            totalPages={Math.max(1, Math.ceil(totalCount / PAGE))}
            onPageChange={setPage}
          />
        </motion.div>
      </motion.div>

      {/* ─────────── Модалка видалення ─────────── */}
      <AnimatePresence>
        {tradeToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setTradeToDelete(null)}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
            style={{
              background: "rgba(6,6,8,0.82)",
              backdropFilter: "blur(12px)",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[380px] overflow-hidden rounded-2xl"
              style={{
                background: T.surface,
                border: `1px solid ${T.lineHi}`,
                boxShadow: "0 30px 70px rgba(0,0,0,0.8)",
              }}
            >
              <div className="flex flex-col items-center gap-3 px-6 pb-2 pt-7 text-center">
                <div
                  className="grid h-11 w-11 place-items-center rounded-xl"
                  style={{
                    background: `rgba(${T.badRgb},0.10)`,
                    border: `1px solid rgba(${T.badRgb},0.22)`,
                  }}
                >
                  <AlertTriangle
                    size={18}
                    strokeWidth={2.3}
                    style={{ color: T.bad }}
                  />
                </div>
                <h3
                  className="text-[18px] font-bold"
                  style={{ fontFamily: T.display, color: T.text }}
                >
                  Видалити угоду?
                </h3>
                <p
                  className="text-[14px] leading-relaxed"
                  style={{ color: T.text3, fontFamily: T.sans }}
                >
                  Запис зникне назавжди разом зі скріншотами й нотатками.
                </p>
              </div>

              <div className="flex gap-2 p-5">
                <button
                  onClick={() => setTradeToDelete(null)}
                  className="flex-1 rounded-xl py-3 text-[14px] font-bold transition-colors"
                  style={{
                    background: T.sunken,
                    border: `1px solid ${T.line}`,
                    color: T.text2,
                    fontFamily: T.sans,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = T.lineHi)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = T.line)
                  }
                >
                  Скасувати
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 rounded-xl py-3 text-[14px] font-bold transition-all"
                  style={{
                    background: T.bad,
                    color: "var(--edge-bg, #0A0A0C)",
                    fontFamily: T.sans,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.filter = "brightness(1.1)")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
                >
                  Видалити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TradeModal сам не сигналить про успіх — просто перечитуємо
          дані щоразу при закритті */}
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={() => {
          setIsTradeModalOpen(false);
          tradesCache.current = {};
          fetchGlobalData();
          /* Нова угода спливає найновішою — показуємо першу сторінку. */
          if (page === 1) fetchTradesList(1, { force: true });
          else setPage(1);
        }}
      />

      <AnimatePresence>
        {selectedTrade && (
          <TradeDetailsModal
            trade={selectedTrade}
            accountsMap={accountsMap}
            onClose={() => setSelectedTrade(null)}
            onDeleted={(id) => {
              setSelectedTrade(null);
              tradesCache.current = {};
              fetchGlobalData();
              if (trades.length === 1 && page > 1) setPage((p) => p - 1);
              else fetchTradesList(page, { force: true });
            }}
            onUpdated={() => {
              tradesCache.current = {};
              fetchGlobalData();
              fetchTradesList(page, { force: true });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
