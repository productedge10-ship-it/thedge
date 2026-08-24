import { useState, useEffect, useMemo, useCallback } from "react";
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
import { BookOpen, Plus, TrendingUp, AlertTriangle } from "lucide-react";

import { supabase } from "../lib/supabase";
import { getTradeProfit } from "../utils/journalUtils";
import { T, EASE, SPRING, useEdgeFonts, stagger, fadeUp } from "../lib/theme";

import TradeModal from "../components/modals/TradeModal";
import TradeDetailsModal from "../components/modals/TradeDetailsModal";
import StatCards, { StreakBar } from "../components/journal/StatCards";
import { Magnetic, Shine } from "../components/ui/Hovers";
import TradesTable from "../components/journal/TradesTable";
import {
  AssetFilter,
  PeriodFilter,
  periodToRange,
  QuickFilters,
  QUICK,
} from "../components/journal/JournalControls";

const PAGE = 20;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

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

  const fetchTradesList = useCallback(
    async (reset = false, currentLen = 0) => {
      reset
        ? (setLoadingInitial(true), setHasMore(true))
        : setLoadingMore(true);
      try {
        const from = reset ? 0 : currentLen;
        const q = applyFilters(
          supabase
            .from("trades")
            .select("*")
            .order("plan_date", { ascending: false })
        ).range(from, from + PAGE - 1);

        const { data, error } = await q;
        if (error) throw error;

        setTrades((prev) => (reset ? data || [] : [...prev, ...(data || [])]));
        if (!data || data.length < PAGE) setHasMore(false);
      } catch (err) {
        console.error("Помилка завантаження угод:", err);
      } finally {
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [applyFilters]
  );

  useEffect(() => {
    fetchGlobalData();
    fetchTradesList(true);
  }, [fetchGlobalData, fetchTradesList]);

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

  /* Швидкі фільтри працюють локально — миттєво, без запиту */
  const visibleTrades = useMemo(() => {
    if (!quick.length) return trades;
    return trades.filter((t) =>
      quick.every((id) => QUICK.find((f) => f.id === id)?.test(t))
    );
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
      setTrades((prev) => prev.filter((t) => t.id !== id));
      fetchGlobalData();
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

          <div className="flex flex-wrap items-center gap-2">
            <AssetFilter
              options={uniquePairs}
              categories={pairCategories}
              value={filterPair}
              onChange={setFilterPair}
            />
            <PeriodFilter value={period} onChange={setPeriod} />

            <Magnetic
              onClick={() => setIsTradeModalOpen(true)}
              className="group ml-1 inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-[1px]"
              style={{
                background: "#00C896",
                color: "#06110D",
                fontFamily: T.sans,
                boxShadow: "0 6px 20px -7px rgba(0, 200, 150, 0.65)",
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

        {streak && streak.count >= 2 && (
          <div className="mt-3">
            <StreakBar streak={streak} />
          </div>
        )}

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
            total={trades.length}
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
            loading={loadingInitial}
            loadingMore={loadingMore}
            hasMore={hasMore && !quick.length}
            onLoadMore={() => fetchTradesList(false, trades.length)}
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
          fetchGlobalData();
          fetchTradesList(true);
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
              setTrades((prev) => prev.filter((t) => t.id !== id));
              fetchGlobalData();
            }}
            onUpdated={() => {
              fetchGlobalData();
              fetchTradesList(true);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
