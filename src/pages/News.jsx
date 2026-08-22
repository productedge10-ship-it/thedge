import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarClock, Bell, BellRing, ChevronDown, Loader2, RefreshCw,
  AlertTriangle, Filter, X,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import useCloudState from '../hooks/useCloudState';
import useTerminalSkin from '../hooks/useTerminalSkin';
import {
  fetchWeek, fetchDescription, describe, WEEKS, IMPACTS, impactOf,
  LEADS, ALERTS_KEY, normalizeAlerts,
} from '../lib/newsStore';

/* ==================================================================
   Календар новин.

   Не стрічка заголовків, а розклад: коли саме ринок тряхне і чи варто
   в цей час узагалі бути в позиції. Тому головне тут не назва події,
   а час і важливість — усе інше розкривається на вимогу.

   Минулий тиждень із фактичними значеннями лежить поруч не для
   архіву: подивитись, як цифра розійшлась із прогнозом і що після
   цього зробила ціна, — єдиний спосіб навчитись читати ці новини.
================================================================== */

const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'CNY'];

const DOW = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота'];
const MON = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDay = (key) => {
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
};

/* Час поточного моменту читаємо у функціях поза компонентом.
   Всередині рендера це нечистий виклик: результат залежить не від
   пропсів, а від того, коли React вирішив перемалювати — і lint
   справедливо на це свариться. */
const isPast = (at) => !!at && at.getTime() < Date.now();

/* Скільки лишилось до події. Показуємо тільки в межах доби: «через
   4 дні» ніхто не планує, а «через 25 хвилин» міняє рішення. */
function countdown(at) {
  if (!at) return null;
  const ms = at.getTime() - Date.now();
  if (ms < 0 || ms > 24 * 3600 * 1000) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `через ${m} хв`;
  return `через ${Math.floor(m / 60)} год ${m % 60 ? `${m % 60} хв` : ''}`.trim();
}

/* ---------- одна подія ---------- */

function Row({ e, open, onToggle, alert, onAlert }) {
  const imp = impactOf(e.impact);
  const soon = countdown(e.at);

  /* Опис із FF тягнемо лише коли подію розкрили. Сімдесят подій на
     екрані означали б сімдесят походів на чужий сайт і майже
     гарантований бан — а прочитають з них одну-дві. */
  const [ff, setFf] = useState(null);
  useEffect(() => {
    if (!open || ff !== null) return;
    let alive = true;
    fetchDescription(e.title, e.ccy).then((t) => { if (alive) setFf(t || ''); });
    return () => { alive = false; };
  }, [open, ff, e.title, e.ccy]);

  /* Свій словник — не заглушка, а перша лінія: він відповідає на «що
     мені з цього», тоді як опис FF переказує методику підрахунку.
     Тому показуємо обидва, і свій зверху. */
  const mine = describe(e.title);
  const desc = mine || ff || null;
  const past = isPast(e.at);

  /* Розбіжність факту з прогнозом — те, від чого ринок і рухається.
     Порівнюємо як числа, вирізавши хвости на кшталт % і K. */
  const num = (v) => {
    const n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const a = num(e.actual);
  const f = num(e.forecast);
  const surprise = a !== null && f !== null ? a - f : null;

  return (
    <div
      className="overflow-hidden rounded-2xl transition-colors duration-200"
      style={{
        background: T.surface,
        border: `1px solid ${open ? T.lineHi : T.line}`,
        opacity: past && !e.actual ? 0.6 : 1,
      }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left sm:gap-4 sm:px-4"
      >
        {/* Смужка важливості замість іконки: колір читається боковим
            зором, а список сканують саме так. */}
        <span className="h-9 w-[3px] shrink-0 rounded-full" style={{ background: imp.color, opacity: e.impact === 'Low' ? 0.45 : 1 }} />

        <span className="w-[52px] shrink-0 text-[13.5px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: past ? T.text4 : T.text }}>
          {e.time || '—'}
        </span>

        <span
          className="w-[44px] shrink-0 rounded-md px-1.5 py-1 text-center text-[11.5px] font-bold"
          style={{ fontFamily: T.mono, background: T.sunken, border: `1px solid ${T.line}`, color: T.text2 }}
        >
          {e.ccy}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.text }}>
            {e.title}
          </span>
          {soon && !past && (
            <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: T.acc }}>{soon}</span>
          )}
        </span>

        {/* Три числа праворуч — те, заради чого сюди й заходять */}
        <span className="hidden shrink-0 items-center gap-3 text-right lg:flex">
          {[
            { k: 'факт', v: e.actual, tone: surprise === null ? T.text : surprise >= 0 ? T.ok : T.bad },
            { k: 'прогноз', v: e.forecast, tone: T.text3 },
            { k: 'було', v: e.previous, tone: T.text4 },
          ].map((c) => (
            <span key={c.k} className="w-[64px]">
              <span className="block text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                {c.k}
              </span>
              <span className="block text-[13px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: c.v ? c.tone : T.text4 }}>
                {c.v || '—'}
              </span>
            </span>
          ))}
        </span>

        <span
          onClick={(ev) => { ev.stopPropagation(); onAlert(); }}
          title={alert ? `Нагадаю ${LEADS.find((l) => l.id === alert.lead)?.label}` : 'Нагадати про подію'}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors"
          style={{
            border: `1px solid ${alert ? T.lineAcc : T.line}`,
            background: alert ? `rgba(${T.accRgb},0.10)` : 'transparent',
            color: alert ? T.acc : T.text4,
          }}
        >
          {alert ? <BellRing size={13} strokeWidth={2.4} /> : <Bell size={13} strokeWidth={2.2} />}
        </span>

        <ChevronDown
          size={14}
          strokeWidth={2.4}
          className="shrink-0 transition-transform duration-200"
          style={{ color: T.text4, transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 pt-1" style={{ borderTop: `1px solid ${T.line}` }}>
              {/* На вузькому екрані числа не влізли в рядок — показуємо тут */}
              <div className="mb-3 flex gap-4 lg:hidden">
                {[['факт', e.actual], ['прогноз', e.forecast], ['було', e.previous]].map(([k, v]) => (
                  <span key={k}>
                    <span className="block text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>{k}</span>
                    <span className="block text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: v ? T.text : T.text4 }}>{v || '—'}</span>
                  </span>
                ))}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span
                  className="rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
                  style={{ fontFamily: T.sans, background: `${imp.color}1f`, border: `1px solid ${imp.color}44`, color: imp.color }}
                >
                  {imp.label} вплив
                </span>
                {surprise !== null && Math.abs(surprise) > 1e-9 && (
                  <span className="text-[12px]" style={{ fontFamily: T.sans, color: surprise > 0 ? T.ok : T.bad }}>
                    {surprise > 0 ? 'вийшло краще за прогноз' : 'вийшло гірше за прогноз'}
                  </span>
                )}
              </div>

              <p className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.65 }}>
                {desc || (ff === null
                  ? 'дістаю опис…'
                  : 'Опису для цієї події немає. Дивись на розбіжність факту з прогнозом — саме вона рухає ринок, а не сама цифра.')}
              </p>

              {/* Якщо є обидва — офіційний ховаємо під розкриттям:
                  він довший і сухіший, і на екрані має бути другим. */}
              {mine && ff && (
                <details className="mt-2">
                  <summary
                    className="cursor-pointer text-[12px] font-semibold"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                  >
                    опис із ForexFactory
                  </summary>
                  <p className="mt-1.5 text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
                    {ff}
                  </p>
                </details>
              )}

              {/* Нагадування налаштовується тут, а не в дзвіночку:
                  один клік ставить типове попередження, а вибрати час
                  можна не поспішаючи. */}
              <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>Нагадати:</span>
                {LEADS.map((l) => {
                  const on = alert?.lead === l.id;
                  return (
                    <button
                      key={l.id}
                      onClick={() => onAlert(l.id)}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                      style={{
                        fontFamily: T.sans,
                        background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                        border: `1px solid ${on ? T.lineAcc : T.line}`,
                        color: on ? T.acc : T.text3,
                      }}
                    >
                      {l.label}
                    </button>
                  );
                })}
                {alert && (
                  <button
                    onClick={() => onAlert(null)}
                    className="ml-1 text-[12px] font-semibold transition-colors"
                    style={{ fontFamily: T.sans, color: T.text4 }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.color = T.bad)}
                    onMouseLeave={(ev) => (ev.currentTarget.style.color = T.text4)}
                  >
                    прибрати
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ================================================================== */

export default function News() {
  useEdgeFonts();
  useTerminalSkin();

  const [week, setWeek] = useState('this');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);

  const [minImpact, setMinImpact] = useState(['High', 'Medium']);
  const [ccy, setCcy] = useState([]);
  const [day, setDay] = useState(null);
  const [openId, setOpenId] = useState(null);

  const [alerts, setAlerts] = useCloudState(ALERTS_KEY, [], { normalize: normalizeAlerts });

  const load = async (w, force) => {
    setError('');
    if (force) {
      setReloading(true);
      try { localStorage.removeItem(`edge_news_${w}`); } catch { /* нічого */ }
    } else {
      setRows(null);
    }

    try {
      const data = await fetchWeek(w);
      setRows(data);
    } catch (e) {
      setRows([]);
      /* Найімовірніша причина — браузер не пустив крос-доменний
         запит. Кажемо це прямо, а не «щось пішло не так»: із такою
         помилкою людина хоч зрозуміє, що це не її дані зникли. */
      setError(e.message || 'Не вдалось дістати календар');
    } finally {
      setReloading(false);
    }
  };

  /* Тиждень змінився — тягнемо новий і скидаємо вибраний день:
     пʼятниця минулого тижня в наступному нічого не означає. */
  useEffect(() => {
    setDay(null);
    load(week);
  }, [week]);

  /* Дні тижня, які реально є в даних */
  const days = useMemo(() => {
    if (!rows) return [];
    return [...new Set(rows.map((r) => r.day).filter(Boolean))].sort();
  }, [rows]);


  const shown = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (minImpact.length && !minImpact.includes(r.impact)) return false;
      if (ccy.length && !ccy.includes(r.ccy)) return false;
      if (day && r.day !== day) return false;
      return true;
    });
  }, [rows, minImpact, ccy, day]);

  const grouped = useMemo(() => {
    const map = new Map();
    shown.forEach((r) => {
      if (!map.has(r.day)) map.set(r.day, []);
      map.get(r.day).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const alertOf = (id) => alerts.find((a) => a.id === id);

  const setAlert = (e) => (lead) => {
    setAlerts((cur) => {
      const rest = cur.filter((a) => a.id !== e.id);
      if (lead === null) return rest;
      /* Клік по дзвіночку без вибору часу — типове попередження за
         15 хвилин: встигнути закрити позицію або не відкривати нову. */
      const value = typeof lead === 'number' ? lead : (alertOf(e.id) ? null : 15);
      if (value === null) return rest;
      return [...rest, {
        id: e.id, key: e.key, title: `${e.ccy} · ${e.title}`, at: e.at ? e.at.toISOString() : '', lead: value,
      }];
    });
  };

  const highToday = useMemo(
    () => (rows || []).filter((r) => r.day === todayKey() && r.impact === 'High').length,
    [rows],
  );

  return (
    <div className="relative min-h-full">
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-24 pt-5 sm:px-6 lg:w-[94%] lg:px-0 lg:pt-7">

        {/* ─────────── Шапка ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Календар
            </div>
            <h1
              className="text-[26px] font-bold leading-none sm:text-[34px] lg:text-[42px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Новини
            </h1>
            <p className="mt-2.5 max-w-[560px] text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
              {highToday
                ? `Сьогодні ${highToday} ${highToday === 1 ? 'подія' : 'подій'} високого впливу — подивись час, перш ніж відкривати позицію.`
                : 'Розклад того, коли ринок тряхне. Час у твоєму поясі.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
              {WEEKS.map((w) => {
                const on = week === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => setWeek(w.id)}
                    title={w.hint}
                    className="whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors"
                    style={{
                      fontFamily: T.sans,
                      background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                      border: `1px solid ${on ? T.lineAcc : 'transparent'}`,
                      color: on ? T.acc : T.text3,
                    }}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => load(week, true)}
              disabled={reloading}
              className="flex h-[42px] items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-colors"
              style={{ fontFamily: T.sans, background: T.surface, border: `1px solid ${T.line}`, color: T.text3 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.lineHi; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.line; }}
            >
              <RefreshCw size={14} strokeWidth={2.3} className={reloading ? 'animate-spin' : ''} />
              Оновити
            </button>
          </div>
        </motion.div>

        {/* ─────────── Фільтри ─────────── */}
        <div className="mb-5 flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter size={13} strokeWidth={2.3} style={{ color: T.text4 }} className="mr-1" />
            {IMPACTS.map((i) => {
              const on = minImpact.includes(i.id);
              return (
                <button
                  key={i.id}
                  onClick={() => toggle(minImpact, setMinImpact, i.id)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                  style={{
                    fontFamily: T.sans,
                    background: on ? `${i.color}1a` : 'transparent',
                    border: `1px solid ${on ? `${i.color}55` : T.line}`,
                    color: on ? i.color : T.text3,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: i.color }} />
                  {i.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {CCY.map((c) => {
              const on = ccy.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(ccy, setCcy, c)}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold transition-colors"
                  style={{
                    fontFamily: T.mono,
                    background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                    border: `1px solid ${on ? T.lineAcc : T.line}`,
                    color: on ? T.acc : T.text3,
                  }}
                >
                  {c}
                </button>
              );
            })}
            {ccy.length > 0 && (
              <button
                onClick={() => setCcy([])}
                className="ml-1 flex items-center gap-1 text-[12px] font-semibold"
                style={{ fontFamily: T.sans, color: T.text4 }}
              >
                <X size={11} strokeWidth={2.6} /> усі
              </button>
            )}
          </div>

          {days.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setDay(null)}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  fontFamily: T.sans,
                  background: !day ? `rgba(${T.accRgb},0.12)` : 'transparent',
                  border: `1px solid ${!day ? T.lineAcc : T.line}`,
                  color: !day ? T.acc : T.text3,
                }}
              >
                Весь тиждень
              </button>
              {days.map((d) => {
                const on = day === d;
                const isToday = d === todayKey();
                return (
                  <button
                    key={d}
                    onClick={() => setDay(on ? null : d)}
                    className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                    style={{
                      fontFamily: T.sans,
                      background: on ? `rgba(${T.accRgb},0.12)` : 'transparent',
                      border: `1px solid ${on ? T.lineAcc : isToday ? T.lineHi : T.line}`,
                      color: on ? T.acc : isToday ? T.text : T.text3,
                    }}
                  >
                    {fmtDay(d).split(',')[0]}
                    {isToday && <span style={{ color: T.acc }}> ·</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─────────── Список ─────────── */}
        {rows === null ? (
          <div className="flex items-center justify-center gap-2.5 py-28">
            <Loader2 size={18} className="animate-spin" style={{ color: T.acc }} />
            <span className="text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>дістаю календар…</span>
          </div>
        ) : error ? (
          <div
            className="flex items-start gap-3 rounded-2xl px-4 py-4"
            style={{ background: `rgba(${T.badRgb},0.06)`, border: `1px solid rgba(${T.badRgb},0.22)` }}
          >
            <AlertTriangle size={15} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.bad }} />
            <div className="min-w-0">
              <div className="mb-1 text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: T.text }}>
                Календар не вдалось завантажити
              </div>
              <p className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
                {error}. Дані беруться напряму з ForexFactory, і браузер може заблокувати
                крос-доменний запит. Якщо повторюється — знадобиться власний проксі на бекенді.
              </p>
            </div>
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-24 text-center">
            <CalendarClock size={22} strokeWidth={1.6} style={{ color: T.text4 }} />
            <div className="text-[15px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
              Нічого не підходить під фільтри
            </div>
            <div className="max-w-[360px] text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
              Спробуй увімкнути низький вплив або прибрати вибір валют.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grouped.map(([d, list]) => (
              <section key={d}>
                <div className="mb-2.5 flex items-center gap-3">
                  <h2
                    className="text-[16px] font-bold"
                    style={{ fontFamily: T.display, color: d === todayKey() ? T.acc : T.text, letterSpacing: '-0.02em' }}
                  >
                    {fmtDay(d)}
                  </h2>
                  <span className="text-[12.5px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                    {list.length}
                  </span>
                  <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
                </div>

                <div className="flex flex-col gap-1.5">
                  {list.map((e) => (
                    <Row
                      key={e.id}
                      e={e}
                      open={openId === e.id}
                      onToggle={() => setOpenId(openId === e.id ? null : e.id)}
                      alert={alertOf(e.id)}
                      onAlert={setAlert(e)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Чесно про те, що сповіщення поки не летять нікуди. Інакше
            людина поставить десять нагадувань і не отримає жодного. */}
        {alerts.length > 0 && (
          <div
            className="mt-6 flex items-start gap-2.5 rounded-2xl px-4 py-3.5"
            style={{ background: T.sunken, border: `1px solid ${T.line}` }}
          >
            <Bell size={14} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.acc }} />
            <p className="text-[12.5px]" style={{ fontFamily: T.sans, color: T.text3, lineHeight: 1.6 }}>
              Нагадувань поставлено: <b style={{ color: T.text }}>{alerts.length}</b>. Вони вже
              зберігаються за тобою, але доставку зробить Telegram-бот і пошта — вони ще в роботі.
              Поки що це список намірів, а не сповіщення.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
