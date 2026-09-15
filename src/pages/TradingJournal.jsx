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
  CandlestickChart,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { notify } from "../utils/notify";
import { prefetchTradeCandles } from "../lib/mt5Store";
import useEmailGate from "../hooks/useEmailGate";
import { useAuth } from "../context/AuthContext";
import { getTradeProfit } from "../utils/journalUtils";
import { T, EASE, SPRING, useEdgeFonts, stagger, fadeUp } from "../lib/theme";

import TradeModal from "../components/modals/TradeModal";
import TradeDetailsModal from "../components/modals/TradeDetailsModal";
import StatCards, { StreakBar } from "../components/journal/StatCards";
import { Magnetic } from "../components/ui/Hovers";
import TradesTable from "../components/journal/TradesTable";
import AssetIcon from "../components/ui/AssetIcon";

const PAGE_SIZES = [10, 20, 30, 40];
const PAGE_DEFAULT = 10;

/* ==================================================================
   Селектори фільтрів.

   Були двоярусні: дрібний підпис «ASSET» зверху, значення знизу. Ідея
   з фінтех-дашбордів, але тут вона не спрацювала — і на це три
   причини, кожна сама по собі достатня.

   Підпис був 9 пікселів кольором `text4`. Це 2.1:1 контрасту при
   нормі 4.5 — його не просто дрібно читати, його майже не видно.

   Він нічого не додавав. Значення й так каже «All assets» і «All
   time»: слово «ASSET» над «All assets» — це той самий іменник двічі,
   тільки вдруге нечитабельний.

   І він ламав вирівнювання. Стрілка стояла в одному рядку з підписом,
   тобто у верхній половині кнопки, а значення — в нижній. Збоку це
   читалось як зʼїхала стрілка, хоч зʼїхала насправді вся сітка.

   Тепер один ярус: іконка, значення, стрілка — усе по центру висоти.
   Висота 54, як у сусідньої головної кнопки: раніше було 44, і рядок
   виглядав ступінчастим.
================================================================== */

function FieldTrigger({ label, value, icon, active, open, onClick, minWidth = 168 }) {
  /* .field-trigger:hover у index.css сюди не дістає — той самий
     background/border стоїть інлайном, і інлайн завжди переважає
     клас, навіть на :hover. Тому підсвічуємо руками — тим самим
     акцентним бордером і сяйвом, що й на «Add Trade» поруч: три
     кнопки в одному рядку мають світитись однією мовою. Без бекграунда
     й без анімації — тут це зайве, кнопка маленька й не головна. */
  const hover = (e) => {
    if (open || active) return;
    e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.55)`;
    e.currentTarget.style.boxShadow = `0 12px 30px -14px rgba(${T.accRgb},0.5), 0 0 0 3px rgba(${T.accRgb},0.10)`;
  };
  const unhover = (e) => {
    if (open || active) return;
    e.currentTarget.style.borderColor = T.line;
    e.currentTarget.style.boxShadow = 'none';
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={hover}
      onMouseLeave={unhover}
      aria-label={label}
      aria-expanded={open}
      whileTap={{ scale: 0.985 }}
      transition={SPRING}
      className="field-trigger relative flex h-[54px] items-center gap-2.5 rounded-2xl px-4 text-left"
      style={{
        minWidth,
        background: active ? `rgba(${T.accRgb},0.10)` : T.surface,
        border: `1px solid ${open || active ? T.lineAcc : T.line}`,
        boxShadow: open ? `0 10px 26px -10px rgba(${T.accRgb},0.5)` : "none",
      }}
    >
      {/* Іконка в своєму квадраті: без нього прапорець пари й значок
          календаря мають різну ширину, і текст поруч стрибає на
          кілька пікселів при кожній зміні фільтра. */}
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        {icon}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[14px] font-bold"
        style={{ fontFamily: T.sans, color: active ? T.text : T.text2 }}
      >
        {value}
      </span>

      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={SPRING}
        className="flex shrink-0"
      >
        <ChevronDown size={14} strokeWidth={2.6} style={{ color: active ? T.acc : T.text3 }} />
      </motion.span>
    </motion.button>
  );
}

/* Панель ніколи не вужча за свій тригер. Раніше ширина була зашита
   числом, і випадайка то звисала збоку, то обривалась вужче за кнопку —
   а звʼязок «це відкрилось саме звідси» тримається саме на тому, що
   ліві краї збігаються, а права не тікає. */
function FieldPanel({ children, width = "w-[268px]" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.96 }}
      transition={{ duration: 0.16, ease: EASE }}
      className={`absolute left-0 top-[calc(100%+8px)] z-[130] ${width} overflow-hidden rounded-2xl`}
      style={{
        minWidth: '100%',
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
        label="Asset"
        value={active ? value : "All assets"}
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
            {/* Пошук без власної рамки.

                Була заглиблена плашка з фоном, та ще й із яскравою
                фіолетовою обводкою у фокусі — рамка в рамці всередині
                рамки. Тепер поле просто лежить у шапці панелі, а межу
                малює одна лінія знизу: вона й так відділяє пошук від
                списку, другої межі для цього не треба. */}
            <div className="flex items-center gap-2.5 px-3.5" style={{ height: 46, borderBottom: `1px solid ${T.line}` }}>
              <Search size={14} strokeWidth={2.4} style={{ color: T.text3 }} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search asset…"
                className="w-full border-none bg-transparent text-[14px] outline-none placeholder:opacity-60"
                style={{ fontFamily: T.sans, color: T.text, boxShadow: 'none' }}
              />
            </div>

            <div className="asset-dropdown-scroll max-h-[288px] overflow-y-auto p-1.5">
              {!q && (
                <OptionRow active={value === "All"} layoutId="asset-select-active" onClick={() => { onChange("All"); setOpen(false); setQ(""); }}>
                  <span className="flex min-w-0 items-center gap-3 text-[14px] font-semibold" style={{ fontFamily: T.sans, color: value === "All" ? T.text : T.text2 }}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center">
                      <Filter size={14} strokeWidth={2.4} style={{ color: value === "All" ? T.acc : T.text3 }} />
                    </span>
                    All assets
                  </span>
                  {value === "All" && <Check size={15} strokeWidth={3} style={{ color: T.acc }} />}
                </OptionRow>
              )}

              {filtered.map((o) => {
                const rowActive = value === o;
                return (
                  <OptionRow key={o} active={rowActive} layoutId="asset-select-active" onClick={() => { onChange(o); setOpen(false); setQ(""); }}>
                    {/* Знак активу в квадраті фіксованої ширини.

                        Пара прапорів ширша за одинарний прапор, а той
                        ширший за монограму — і без спільної колонки
                        назви в списку стояли сходинкою, кожна зі своїм
                        відступом. */}
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center">
                        <AssetIcon symbol={o} category={categories[o]} size={22} />
                      </span>
                      <span className="truncate text-[14px] font-semibold" style={{ fontFamily: T.sans, color: rowActive ? T.text : T.text2 }}>
                        {o}
                      </span>
                    </span>
                    {rowActive && <Check size={15} strokeWidth={3} style={{ color: T.acc }} className="shrink-0" />}
                  </OptionRow>
                );
              })}

              {q && !filtered.length && (
                <div className="px-3 py-8 text-center text-[13.5px]" style={{ color: T.text3, fontFamily: T.sans }}>
                  Asset not found
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
  { id: "all", label: "All time" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "3 months" },
  { id: "month", label: "This month" },
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
        label="Period"
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
/* Словник результату мав би бути один, але в базі досі трапляється
   написання з імпорту перших версій — LOSS замість lose. Нормалізуємо
   в одному місці: інакше таблиця показує «Stop», а фільтр тих самих
   угод не бачить, і виглядає це як зламаний фільтр. */
const normResult = (v) => {
  const s = String(v || "").trim().toLowerCase();
  return s === "loss" ? "lose" : s;
};

/* Ті самі синоніми для запиту в базу: SQL порівнює посимвольно і про
   регістр не здогадається. Прибрати можна буде тоді, коли в таблиці
   не лишиться жодного старого написання. */
const RESULT_ALIASES = {
  win:     ["win", "Win", "WIN"],
  lose:    ["lose", "Lose", "LOSE", "loss", "Loss", "LOSS"],
  be:      ["be", "Be", "BE"],
  scratch: ["scratch", "Scratch", "SCRATCH"],
};

const QUICK_RESULT = [
  { id: "win",  label: "Take", icon: TrendingUp,   c: T.ok,   rgb: T.okRgb,   test: (t) => normResult(t.result) === "win" },
  { id: "lose", label: "Stop", icon: TrendingDown, c: T.bad,  rgb: T.badRgb,  test: (t) => normResult(t.result) === "lose" },
  { id: "be",   label: "BE",   icon: Minus,        c: T.warn, rgb: T.warnRgb, test: (t) => normResult(t.result) === "be" },
  /* Закрився там же, де зайшов. Окремий фільтр потрібен, бо такі
     угоди найцікавіше дивитись пачкою: зазвичай за ними стоїть одна
     й та сама причина, і видно її тільки поруч. */
  { id: "scratch", label: "Scratch", icon: Minus, c: T.info, rgb: T.infoRgb, test: (t) => normResult(t.result) === "scratch" },
];
const QUICK_DISCIPLINE = [
  { id: "offplan", label: "Off plan", icon: ShieldAlert,  c: T.bad,  rgb: T.badRgb,  test: (t) => !t.followed_plan },
  { id: "mistake", label: "Mistake",   icon: AlertOctagon, c: T.warn, rgb: T.warnRgb, test: (t) => !!t.has_mistake },
  { id: "rushed",  label: "Rushed",       icon: Zap,          c: "#fb923c", rgb: "251,146,60", test: (t) => !!t.rushed },
];
const QUICK = [...QUICK_RESULT, ...QUICK_DISCIPLINE];
const RESULT_QUICK_IDS = QUICK_RESULT.map((f) => f.id);

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

/* Скільки рядків показувати. Заглиблена доріжка з пігулками — той
   самий словник, що й перемикач періоду на аналітиці, тож людина
   впізнає елемент, не вчитуючись. */
function PageSizePicker({ value, onChange }) {
  return (
    <div
      className="flex items-center gap-1 rounded-[10px] p-1"
      style={{ background: T.sunken, border: `1px solid ${T.line}` }}
    >
      {PAGE_SIZES.map((n) => {
        const on = n === value;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="rounded-lg px-2.5 py-1 text-[12px] font-bold tabular-nums transition-colors"
            style={{
              fontFamily: T.sans,
              color: on ? T.text : T.text4,
              background: on ? `rgba(${T.accRgb},0.16)` : "transparent",
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function QuickFilters({ active, onToggle, onClear, counts, total, pageSize, onPageSize }) {
  const has = active.length > 0;

  return (
    <div className="px-5 py-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Quick filters
          </span>

          {/* Лічильник стоїть біля заголовка, а не в протилежному кутку:
              він описує саме те, що зараз відібрано фільтрами, і з
              відстані в пів екрана цей звʼязок не читався. */}
          <span className="text-[12px] font-bold tabular-nums" style={{ fontFamily: T.sans, color: has ? T.acc : T.text3 }}>
            {total} {total === 1 ? "trade" : "trades"}
            {has ? " found" : ""}
          </span>

          <AnimatePresence>
            {has && (
              <motion.button
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={TILE_PRESS}
                whileTap={{ scale: 0.94 }}
                onClick={onClear}
                className="flex items-center gap-1 text-[12px] font-bold transition-colors"
                style={{ color: T.text4, fontFamily: T.sans }}
                onMouseEnter={(e) => (e.currentTarget.style.color = T.bad)}
                onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
              >
                <X size={11} strokeWidth={3} /> Reset
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Per page
          </span>
          <PageSizePicker value={pageSize} onChange={onPageSize} />
        </div>
      </div>

      {/* Результат зліва, дисципліна справа — просторовий поділ сам
          читається як «це різні категорії», без додаткових пояснень. */}
      <div className="flex flex-wrap items-stretch justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
            Result
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
            Discipline
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
      label: "Accumulated",
      value: `${d.cumulativeRR > 0 ? "+" : ""}${d.cumulativeRR}R`,
      color: d.cumulativeRR >= 0 ? T.ok : T.bad,
      big: true,
    },
    {
      label: "Money",
      value: `${
        d.cumulativeProfit > 0 ? "+" : d.cumulativeProfit < 0 ? "−" : ""
      }$${Math.abs(d.cumulativeProfit).toFixed(2)}`,
      color: d.cumulativeProfit >= 0 ? T.ok : T.bad,
    },
    { label: "Win rate", value: `${d.winRate}%`, color: T.text2 },
    { label: "Plan rate", value: `${d.planRate}%`, color: T.text2 },
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
          trade #{d.trades}
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

  /* Свої угоди просимо явно, а не покладаємось на RLS.

     У політиках trades є admin_read_all з умовою is_admin(), і для
     адміністратора база чесно віддає геть усе — так і задумано для
     адмінки. Але журнал — не адмінка: тут людина дивиться власну
     торгівлю, і побачити в ній чужі угоди страшніше за будь-яку
     помилку. RLS лишається підлогою, а не фільтром застосунку. */
  const { user } = useAuth();
  const mine = (q) => (user?.id ? q.eq('user_id', user.id) : q);

  /* Створювати угоди можна лише з підтвердженою поштою. Кнопка при
     цьому лишається клікабельною — guard покаже пояснення замість
     мовчазної відмови. */
  const { guard } = useEmailGate();

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

  /* Скільки рядків тягнути за раз. Вибір людини переживає перезахід —
     хто один раз попросив сорок, той не хоче просити щоразу. */
  const [pageSize, setPageSize] = useState(() => {
    const saved = Number(localStorage.getItem("journal_page_size"));
    return PAGE_SIZES.includes(saved) ? saved : PAGE_DEFAULT;
  });

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
      const { data } = await mine(supabase.from("prop_accounts").select("*"));
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
      const { data } = await mine(supabase.from("trades").select("plan_pair"));
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
      q = mine(q);
      if (filterPair !== "All") q = q.eq("plan_pair", filterPair);
      if (dateFrom) q = q.gte("plan_date", dateFrom);
      if (dateTo) q = q.lte("plan_date", dateTo);
      return q;
    },
    [filterPair, dateFrom, dateTo, user?.id]
  );

  /* Швидкі фільтри — теж у запит, а не поверх завантаженої сторінки.
     Раніше вони відсіювали лише те, що вже лежало на екрані: сторінка
     з десяти прибуткових угод після кліку на «Stop» ставала порожньою,
     хоча стопи в журналі були — просто на інших сторінках. Виглядало
     це як непрацюючий фільтр, і по суті ним і було.

     Результати між собою йдуть через АБО (взаємовиключні стани однієї
     угоди), прапорці дисципліни — через І (незалежні ознаки). */
  const applyQuick = useCallback(
    (q) => {
      const results = quick.filter((id) => RESULT_QUICK_IDS.includes(id));
      if (results.length) {
        q = q.in("result", results.flatMap((id) => RESULT_ALIASES[id] || [id]));
      }
      if (quick.includes("offplan")) q = q.eq("followed_plan", false);
      if (quick.includes("mistake")) q = q.eq("has_mistake", true);
      if (quick.includes("rushed")) q = q.eq("rushed", true);
      return q;
    },
    [quick]
  );

  const fetchGlobalData = useCallback(async () => {
    const q = applyFilters(
      supabase
        .from("trades")
        /* profit_money тягнемо обовʼязково: для імпортованих угод це
           справжній результат від брокера, і без нього підсумок у
           доларах рахувався лише по тих угодах, де вручну заповнений
           ризик. */
        .select(
          "plan_date, result, rr, followed_plan, has_mistake, rushed, account_name, risk, profit_money"
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
  const cacheKey = (pageNum) =>
    `${filterPair}|${dateFrom}|${dateTo}|${[...quick].sort().join(",")}|${pageSize}|${pageNum}`;

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
        const from = (pageNum - 1) * pageSize;
        const q = applyQuick(
          applyFilters(
            supabase
              .from("trades")
              .select("*", { count: "exact" })
              .order("plan_date", { ascending: false })
          )
        ).range(from, from + pageSize - 1);

        const { data, error, count } = await q;
        if (error) throw error;

        tradesCache.current[key] = { data: data || [], count: count || 0 };
        setTrades(data || []);
        setTotalCount(count || 0);

        /* Свічки для цієї сторінки тягнемо у фоні, без await: список
           уже намальований, а на момент, коли людина відкриє картку,
           графік буде в памʼяті. Інакше кожне відкриття починалось би
           з порожнього кадру. */
        prefetchTradeCandles(data || []);
      } catch (err) {
        console.error("Error loading trades:", err);
      } finally {
        setLoadingInitial(false);
      }
    },
    [applyFilters, applyQuick, filterPair, dateFrom, dateTo, quick, pageSize]
  );

  /* Ручного імпорту з терміналу тут більше немає.

     Воркер тягне угоди сам щохвилини, тож кнопка просила людину
     зробити те, що вже робиться без неї. Разом із нею пішли стан
     `pulling`, обробник і виклик `pullMt5Trades`. */

  /* Зміна фільтрів завжди повертає на першу сторінку — інакше
     можна опинитись на сторінці 8, якої після фільтра вже нема. */
  useEffect(() => {
    setPage(1);
  }, [filterPair, dateFrom, dateTo, quick, pageSize]);

  useEffect(() => {
    localStorage.setItem("journal_page_size", String(pageSize));
  }, [pageSize]);

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
      priced = 0,
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
      if (p !== null) { totalProfit += p; priced++; }
    });

    return {
      total,
      winrate: total ? Math.round((wins / total) * 100) : 0,
      totalRR: parseFloat(totalRR.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      /* Скільки угод узагалі мають ціну. Якщо менше за всі — сума в
         доларах порахована не по тому ж наборі, що R, і мовчати про
         це не можна: саме так «−5.72R» опинявся поруч із «+$191». */
      pricedTrades: priced,
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

  /* Фільтрація тепер уся на сервері, тож показуємо рівно те, що
     прийшло. Лишається як окрема назва, бо так читається різниця між
     «сирі дані сторінки» і «те, що на екрані». */
  const visibleTrades = trades;

  /* Лічильники рахуємо з повного набору, а не зі сторінки: цифра на
     плитці має відповідати на питання «скільки в мене стопів узагалі»,
     а не «скільки їх серед десяти видимих рядків». globalStatsData
     навмисно не знає про швидкі фільтри — інакше після кліку на «Stop»
     усі інші плитки показали б нуль. */
  const quickCounts = useMemo(() => {
    const c = {};
    QUICK.forEach((f) => {
      c[f.id] = globalStatsData.filter(f.test).length;
    });
    return c;
  }, [globalStatsData]);

  const confirmDelete = async () => {
    const id = tradeToDelete;
    setTradeToDelete(null);
    try {
      /* user_id у видаленні — не зайва обережність: адмінська політика
         дає нам право читати чужі рядки, і один невдалий id міг би
         стерти чужу угоду. */
      const { error } = await mine(supabase.from("trades").delete().eq("id", id));
      if (error) throw error;
      tradesCache.current = {};
      fetchGlobalData();
      /* Останній рядок на не першій сторінці — повертаємось на
         попередню, інакше лишимось на порожній сторінці. */
      if (trades.length === 1 && page > 1) setPage((p) => p - 1);
      else fetchTradesList(page, { force: true });
    } catch {
      console.error("Failed to delete trade");
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
                Trade History
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

            {/* Кнопка «Pull from MT5» прибрана.

                Вона просила людину зробити руками те, що воркер робить
                сам щохвилини. Кнопка, яка дублює автоматику, шкідлива
                двічі: вона займає місце в найпомітнішому рядку сторінки
                і натякає, що без неї дані застаріють — тобто підриває
                довіру до самої синхронізації. */}

            {/* Головна дія сторінки.

                Раніше вона була зелена, `#00C896` — колір, якого немає
                більше ніде в застосунку. І це не дрібниця: зелений у
                журналі вже зайнятий, ним позначені прибуткові угоди.
                Виходило, що найпомітніший елемент екрана пофарбований
                у колір результату, хоча жодного результату не означає.

                Тепер акцент — той самий фіолетовий, що й у решти
                головних дій. Заразом прибраний зсув угору на ховері:
                правило проєкту каже «замість руху — світло», і тут
                воно доречне вдвічі, бо кнопка стоїть у рядку з іншими
                й тягла рядок за собою. */}
            <Magnetic
              onClick={guard(() => setIsTradeModalOpen(true))}
              /* strength=0 — магніт вимкнено.

                 Саме він і смикав кнопку: Magnetic тягне елемент до
                 курсора, і перша ж подія руху миші прилітає не з краю,
                 а звідти, де курсор опинився, — тому кнопка стрибала
                 вниз ривком замість того, щоб плавно поїхати.

                 Правило сторінки й так каже «замість руху — світло», і
                 тут воно доречне вдвічі: кнопка стоїть у рядку з
                 фільтрами й тягла б рядок за собою. Від Magnetic
                 лишається стиск при натисканні. */
              strength={0}
              className="journal-cta group ml-1 inline-flex h-[54px] shrink-0 items-center justify-center rounded-2xl px-6 text-[14.5px] font-bold"
              /* Темна панель, а не суцільна заливка акцентом.

                 Причина проста: під курсором кнопка перетворюється на
                 графік, а свічки мають бути зеленими й червоними —
                 своїми справжніми кольорами. На фіолетовому тлі
                 зелений і червоний або гаснуть, або починають із ним
                 сваритись. На темному вони читаються так само, як у
                 самому журналі, і кнопка стає маленьким терміналом.

                 Помітність від цього не впала: її тримають акцентна
                 рамка, фіолетовий ореол під кнопкою й іконка. */
              style={{
                background: 'linear-gradient(180deg, var(--edge-surface-hi, #18181C), var(--edge-sunken, #0D0D10))',
                border: `1px solid ${T.lineAcc}`,
                color: T.text,
                fontFamily: T.sans,
                boxShadow: `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
              }}
              /* Ховер — світлом, а не рухом: кнопка стоїть у рядку з
                 фільтрами, і будь-який зсув тягнув рядок за собою.
                 Ореол розростається й трохи яскравішає сама заливка —
                 цього достатньо, щоб було ясно, що під курсором. */
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 16px 40px -14px rgba(${T.accRgb},0.8), 0 0 0 3px rgba(${T.accRgb},0.14)`;
                e.currentTarget.style.borderColor = `rgba(${T.accRgb},0.55)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 10px 28px -12px rgba(${T.accRgb},0.55), inset 0 1px 0 rgba(255,255,255,0.05)`;
                e.currentTarget.style.borderColor = T.lineAcc;
              }}
            >
              {/* Кнопка стає графіком.

                  Під курсором підпис іде вгору й гасне, а знизу
                  виростають свічки — одна за одною, зліва направо, —
                  і по їхніх вершинах прокреслюється лінія тренду.
                  Кнопка показує рівно те, що по ній натискають.

                  Свічки без заокруглень і з `shapeRendering
                  ="crispEdges"` навмисно. Кнопка розтягує полотно по
                  ширині, тож дробові координати неминучі — а на них
                  заокруглений кут у два пікселі перетворюється на
                  розмиту пляму замість кута. Прямий різкий край на
                  такому розмірі і чіткіший, і чесніше схожий на
                  свічку.

                  `preserveAspectRatio="none"` — щоб графік ліг рівно
                  по кнопці, а не лишив поля. Лінію від розтягування
                  рятує `vectorEffect`, а `pathLength="1"` робить її
                  довжину одиничною, щоб малювати її одним зсувом. */}
              <svg
                className="journal-cta-chart"
                viewBox="0 0 220 54"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <linearGradient id="journalCtaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--edge-ok, #34d399)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--edge-ok, #34d399)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Заливка під трендом — зʼявляється першою й дає
                    відчуття, що кнопка наливається знизу. */}
                <path
                  className="journal-cta-area"
                  d="M0,50 L44,42 L94,32 L146,20 L198,10 L220,6 L220,54 L0,54 Z"
                  fill="url(#journalCtaFill)"
                />

                {/* Свічки. Кожна — своя група, щоб рости від власної
                    основи, а не від краю кнопки. */}
                <g shapeRendering="crispEdges">
                  <g className="journal-cta-candle up">
                    <rect x="14" y="34" width="2" height="18" />
                    <rect x="8" y="38" width="14" height="10" />
                  </g>
                  <g className="journal-cta-candle up">
                    <rect x="40" y="27" width="2" height="19" />
                    <rect x="34" y="30" width="14" height="12" />
                  </g>
                  <g className="journal-cta-candle down">
                    <rect x="66" y="30" width="2" height="19" />
                    <rect x="60" y="33" width="14" height="11" />
                  </g>
                  <g className="journal-cta-candle up">
                    <rect x="92" y="19" width="2" height="21" />
                    <rect x="86" y="22" width="14" height="14" />
                  </g>
                  <g className="journal-cta-candle down">
                    <rect x="118" y="23" width="2" height="20" />
                    <rect x="112" y="26" width="14" height="12" />
                  </g>
                  <g className="journal-cta-candle up">
                    <rect x="144" y="11" width="2" height="21" />
                    <rect x="138" y="14" width="14" height="14" />
                  </g>
                  <g className="journal-cta-candle up">
                    <rect x="170" y="6" width="2" height="22" />
                    <rect x="164" y="9" width="14" height="15" />
                  </g>
                  <g className="journal-cta-candle up">
                    <rect x="196" y="1" width="2" height="22" />
                    <rect x="190" y="4" width="14" height="15" />
                  </g>
                </g>

                <path
                  className="journal-cta-line"
                  pathLength="1"
                  d="M3,43 L41,36 L67,39 L93,29 L119,32 L145,21 L171,17 L205,12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              <span className="journal-cta-label relative flex items-center gap-2 whitespace-nowrap">
                <CandlestickChart size={17} strokeWidth={2.6} className="shrink-0" style={{ color: T.acc }} />
                Add Trade
              </span>
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
                  Equity Curve
                </h3>
                <p
                  className="mt-1 text-[13px]"
                  style={{ color: T.text3, fontFamily: T.sans }}
                >
                  Accumulated R for the period
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
                  Not enough data for a chart
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
                Trades
              </h3>
              <p
                className="mt-1 text-[13px]"
                style={{ color: T.text3, fontFamily: T.sans }}
              >
                Click a row for details
              </p>
            </div>
          </div>

          <QuickFilters
            active={quick}
            counts={quickCounts}
            total={totalCount}
            pageSize={pageSize}
            onPageSize={setPageSize}
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
            pageSize={pageSize}
            page={page}
            totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
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
                  Delete trade?
                </h3>
                <p
                  className="text-[14px] leading-relaxed"
                  style={{ color: T.text3, fontFamily: T.sans }}
                >
                  The record will be permanently deleted along with screenshots and notes.
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
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 rounded-xl py-3 text-[14px] font-bold transition-all"
                  style={{
                    background: T.bad,
                    color: "var(--edge-on-acc, #0A0A0C)",
                    fontFamily: T.sans,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.filter = "brightness(1.1)")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
                >
                  Delete
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
