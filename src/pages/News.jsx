import {
  useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, BellRing, ChevronDown, RefreshCw, AlertTriangle,
  ExternalLink, Loader2, BellOff,
} from 'lucide-react';

import { T, EASE, useEdgeFonts } from '../lib/theme';
import {
  WEEKS, IMPACTS, impactOf, fetchWeek, fetchDescription, describe,
  ALERTS_KEY, normalizeAlerts,
} from '../lib/newsStore';
import {
  LEAD_MIN, askNotifyPermission, notifyState, notifySupported, startNewsWatcher,
} from '../lib/newsAlerts';
import {
  flagSrc, warmFlags, subscribe as flagsSubscribe, getVersion as flagsVersion,
} from '../lib/flags';
import useCloudState from '../hooks/useCloudState';

/* ==================================================================
   Календар економічних новин.

   Сімдесят подій на тиждень — це список, який неможливо прочитати
   цілком, і не треба. Людина приходить сюди з одним із двох питань:
   «що сьогодні може рознести мій стоп» і «коли саме». Тому тут немає
   рамок навколо рядків, немає підкладок під кожною клітинкою і немає
   чотирьох відтінків сірого: важливе світле, службове тьмяне, і все.

   Рядок розгортається, а не веде кудись. Опис вантажиться тільки в
   цей момент — тягнути сімдесят описів на відкритті сторінки заради
   двох, які реально розгорнуть, було б безглуздям.
================================================================== */

const isPast = (at) => !!at && at.getTime() < Date.now();

const countdown = (at) => {
  if (!at) return null;
  const ms = at.getTime() - Date.now();
  if (ms < 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `через ${m} хв`;
  const h = Math.floor(m / 60);
  if (h < 24) return `через ${h} год`;
  return `через ${Math.round(h / 24)} дн`;
};

const DAY_FMT = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
};

const isToday = (iso) => {
  const n = new Date();
  const t = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  return iso === t;
};

/* Порівняння факту з прогнозом. Просте віднімання не годиться:
   значення бувають «208K», «-99.9B», «0.2%». */
const num = (v) => {
  if (!v) return null;
  const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/K/i.test(v)) n *= 1e3;
  if (/M/i.test(v)) n *= 1e6;
  if (/B/i.test(v)) n *= 1e9;
  if (/T/i.test(v)) n *= 1e12;
  return n;
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
function Flag({ ccy }) {
  useSyncExternalStore(flagsSubscribe, flagsVersion, flagsVersion);
  const src = flagSrc(ccy);

  if (!src) {
    /* «All» та інші глобальні події країни не мають. Кружечок тієї
       ж ваги, щоб колонка не стрибала. */
    return (
      <span
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[8px] font-bold"
        style={{ background: 'rgba(255,255,255,0.07)', color: T.text3, fontFamily: T.mono }}
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
      className="h-[18px] w-[18px] shrink-0 rounded-full object-cover"
      style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.10)' }}
    />
  );
}

/* ---------- значення ----------
   Оголошено зовні: компонент, створений усередині рендера, щоразу
   монтується наново і губить свій стан. */
function Val({ label, value, tone }) {
  return (
    <div className="flex min-w-[62px] flex-col">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text3 }}>
        {label}
      </span>
      <span
        className="text-[13.5px] font-bold tabular-nums"
        style={{ fontFamily: T.mono, color: tone || (value ? T.text : T.text3) }}
      >
        {value || '—'}
      </span>
    </div>
  );
}

/* ---------- один рядок ---------- */

function Row({ ev, watched, onWatch, canWatch }) {
  const [open, setOpen] = useState(false);
  /* undefined — ще не питали, false — питали й не знайшли,
     обʼєкт — знайшли. Три стани одним значенням, щоб не ставити
     прапорець «вантажиться» синхронно всередині ефекту: це
     викликає зайвий каскад рендерів. */
  const [ext, setExt] = useState(undefined);
  const asked = useRef(false);

  const imp = impactOf(ev.impact);
  const past = isPast(ev.at);
  const soon = countdown(ev.at);
  const mine = describe(ev.title);
  const sur = surprise(ev.actual, ev.forecast);
  const loading = open && ext === undefined;

  useEffect(() => {
    if (!open || asked.current) return undefined;
    asked.current = true;
    let alive = true;
    fetchDescription(ev.title, ev.ccy).then((d) => { if (alive) setExt(d || false); });
    return () => { alive = false; };
  }, [open, ev.title, ev.ccy]);

  return (
    <div className="rounded-xl" style={{ background: open ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        className="group relative flex cursor-pointer items-center gap-3 rounded-xl py-2.5 pl-3 pr-2 transition-colors duration-200"
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        style={{ opacity: past && !ev.actual ? 0.5 : 1 }}
      >
        {/* важливість — колірна риска, а не ще один значок */}
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[2.5px] rounded-full"
          style={{ background: imp.color, opacity: ev.impact === 'High' ? 0.95 : ev.impact === 'Medium' ? 0.6 : 0.22 }}
        />

        <span
          className="w-[46px] shrink-0 text-[13.5px] font-bold tabular-nums"
          style={{ fontFamily: T.mono, color: past ? T.text3 : T.text }}
        >
          {ev.time || '—'}
        </span>

        <span className="flex w-[74px] shrink-0 items-center gap-2">
          <Flag ccy={ev.ccy} />
          <span className="text-[12.5px] font-bold" style={{ fontFamily: T.mono, color: T.text2 }}>
            {ev.ccy}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px]" style={{ fontFamily: T.sans, color: past ? T.text2 : T.text }}>
            {ev.title}
          </span>
          {soon && ev.impact === 'High' && (
            <span className="text-[11.5px]" style={{ fontFamily: T.sans, color: T.warn }}>{soon}</span>
          )}
        </span>

        <span className="hidden shrink-0 items-center gap-5 md:flex">
          <Val
            label="факт"
            value={ev.actual}
            tone={sur > 0 ? T.ok : sur < 0 ? T.bad : undefined}
          />
          <Val label="прогноз" value={ev.forecast} />
          <Val label="було" value={ev.previous} />
        </span>

        {/* дзвіночок тільки для того, що ще не сталося */}
        {!past && canWatch && (
          <button
            onClick={(e) => { e.stopPropagation(); onWatch(ev); }}
            title={watched ? 'Не нагадувати' : `Нагадати за ${LEAD_MIN} хв`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-200"
            style={{
              color: watched ? T.acc : T.text3,
              background: watched ? `rgba(${T.accRgb},0.12)` : 'transparent',
            }}
            onMouseEnter={(e) => { if (!watched) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!watched) e.currentTarget.style.color = T.text3; }}
          >
            {watched ? <BellRing size={15} strokeWidth={2.2} /> : <Bell size={15} strokeWidth={2.2} />}
          </button>
        )}

        <ChevronDown
          size={15}
          strokeWidth={2.4}
          className="shrink-0"
          style={{
            color: T.text3,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: `transform 220ms ${EASE}`,
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-3 px-3 pb-3.5 pt-1">
              {/* значення для вузьких екранів */}
              <div className="flex gap-6 md:hidden">
                <Val label="факт" value={ev.actual} tone={sur > 0 ? T.ok : sur < 0 ? T.bad : undefined} />
                <Val label="прогноз" value={ev.forecast} />
                <Val label="було" value={ev.previous} />
              </div>

              {/* Спершу «що з цим робити» — це відповідь на питання,
                  з яким людина сюди прийшла. Енциклопедичний опис
                  нижче: він пояснює, що це взагалі таке. */}
              {mine && (
                <p className="text-[14px] leading-relaxed" style={{ fontFamily: T.sans, color: T.text }}>
                  {mine}
                </p>
              )}

              {loading && (
                <span className="flex items-center gap-2 text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  <Loader2 size={13} className="animate-spin" />
                  шукаю опис…
                </span>
              )}

              {ext && (
                <div
                  className="rounded-lg p-3"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <p className="text-[13.5px] leading-relaxed" style={{ fontFamily: T.sans, color: T.text2 }}>
                    {ext.text}
                  </p>
                  {ext.url && (
                    <a
                      href={ext.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold transition-colors duration-150"
                      style={{ fontFamily: T.sans, color: T.text3 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = T.acc; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; }}
                    >
                      {ext.title || ext.source}
                      <ExternalLink size={11} strokeWidth={2.4} />
                    </a>
                  )}
                </div>
              )}

              {ext === false && !mine && (
                <p className="text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  Опису для цієї події знайти не вдалось.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- перемикач ---------- */

function Seg({ items, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)' }}>
      {items.map((it) => {
        const on = value === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className="relative h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors duration-200"
            style={{ fontFamily: T.sans, color: on ? T.text : T.text3 }}
          >
            {on && (
              <motion.span
                layoutId={`seg-${items[0].id}`}
                className="absolute inset-0 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */

export default function News() {
  useEdgeFonts();

  const [week, setWeek] = useState('this');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState(null);
  const [imp, setImp] = useState('all');
  const [ccy, setCcy] = useState('all');
  const [perm, setPerm] = useState(notifyState());

  const [alerts, setAlerts] = useCloudState(ALERTS_KEY, [], { normalize: normalizeAlerts });

  /* Жодного setState до першого await.

     «Вантажиться» вмикає той, хто це спричинив — обробник кліку по
     тижню чи по оновленню. Ефект тільки забирає дані й розкладає
     результат. Якщо ставити прапорець тут, React справедливо лається
     на каскад: ефект міняє стан, стан викликає ефект. */
  const load = useCallback(async (w) => {
    try {
      const data = await fetchWeek(w);
      setRows(data);
      setErr(null);
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
    setBusy(false);
  }, []);

  useEffect(() => { load(week); }, [week, load]);

  const pickWeek = (w) => { setBusy(true); setWeek(w); };
  const refresh = () => { setBusy(true); load(week); };

  /* Планувальник дивиться на актуальний список через функцію, тому
     його не треба перепідписувати щоразу, коли натиснули дзвіночок. */
  const watchRef = useRef([]);
  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    watchRef.current = rows.filter((r) => ids.has(r.id));
  }, [alerts, rows]);

  useEffect(() => startNewsWatcher(() => watchRef.current), []);

  const currencies = useMemo(
    () => [...new Set(rows.map((r) => r.ccy).filter(Boolean))].sort(),
    [rows],
  );

  /* Прогріваємо кеш прапорів, коли стало відомо, які валюти взагалі
     є на екрані. Качається тільки те, чого ще немає в localStorage,
     тому на другому візиті цей виклик нічого не робить. */
  useEffect(() => { warmFlags(currencies); }, [currencies]);

  const shown = useMemo(() => rows.filter((r) => {
    if (imp !== 'all' && r.impact !== imp) return false;
    if (ccy !== 'all' && r.ccy !== ccy) return false;
    return true;
  }), [rows, imp, ccy]);

  const days = useMemo(() => {
    const map = new Map();
    shown.forEach((r) => {
      if (!map.has(r.day)) map.set(r.day, []);
      map.get(r.day).push(r);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  const watchedIds = useMemo(() => new Set(alerts.map((a) => a.id)), [alerts]);

  const toggleWatch = async (ev) => {
    if (watchedIds.has(ev.id)) {
      setAlerts((s) => s.filter((a) => a.id !== ev.id));
      return;
    }
    const state = await askNotifyPermission();
    setPerm(state);
    if (state !== 'granted') return;
    setAlerts((s) => [
      ...s,
      { id: ev.id, key: ev.key, title: ev.title, ccy: ev.ccy, at: ev.at ? ev.at.toISOString() : '', lead: LEAD_MIN },
    ]);
  };

  const canWatch = notifySupported() && perm !== 'denied';

  return (
    <div className="relative min-h-full">
      <div className="relative z-10 mx-auto w-[94%] max-w-[1400px] pb-20 pt-5 lg:pt-7">

        {/* ─────────── Хедер ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
              Календар
            </div>
            <h1
              className="text-[26px] font-bold leading-none sm:text-[32px]"
              style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
            >
              Новини
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Seg items={WEEKS} value={week} onChange={pickWeek} />
            <button
              onClick={refresh}
              title="Оновити"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', color: T.text3 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.text3; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            >
              <RefreshCw size={15} strokeWidth={2.2} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        </motion.div>

        {/* ─────────── Фільтри ─────────── */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {[{ id: 'all', label: 'Усі', color: T.text3 }, ...IMPACTS].map((i) => {
            const on = imp === i.id;
            return (
              <button
                key={i.id}
                onClick={() => setImp(i.id)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors duration-200"
                style={{
                  fontFamily: T.sans,
                  color: on ? T.text : T.text3,
                  background: on ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                }}
              >
                {i.id !== 'all' && (
                  <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
                )}
                {i.label}
              </button>
            );
          })}

          <span className="mx-1 h-5 w-px" style={{ background: T.line }} />

          {['all', ...currencies].map((c) => {
            const on = ccy === c;
            return (
              <button
                key={c}
                onClick={() => setCcy(c)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-bold transition-colors duration-200"
                style={{
                  fontFamily: c === 'all' ? T.sans : T.mono,
                  color: on ? T.text : T.text3,
                  background: on ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                }}
              >
                {c !== 'all' && <Flag ccy={c} />}
                {c === 'all' ? 'Всі валюти' : c}
              </button>
            );
          })}
        </div>

        {/* ─────────── Стан сповіщень ─────────── */}
        {!notifySupported() && (
          <Note icon={BellOff} tone={T.text3}>
            Цей браузер не вміє показувати сповіщення.
          </Note>
        )}
        {notifySupported() && perm === 'denied' && (
          <Note icon={BellOff} tone={T.warn}>
            Сповіщення заблоковані в налаштуваннях браузера — дзвіночки не спрацюють, доки не дозволиш їх для цього сайту.
          </Note>
        )}
        {notifySupported() && perm === 'granted' && alerts.length > 0 && (
          <Note icon={BellRing} tone={T.acc}>
            Стежу за {alerts.length} {alerts.length === 1 ? 'подією' : 'подіями'}. Попереджу за {LEAD_MIN} хвилин — поки сайт відкритий хоча б у фоновій вкладці.
          </Note>
        )}

        {/* ─────────── Помилка ─────────── */}
        {err && (
          <div
            className="mb-3 flex items-start gap-3 rounded-xl p-4"
            style={{ background: `rgba(${T.badRgb},0.08)` }}
          >
            <AlertTriangle size={17} strokeWidth={2.2} className="mt-0.5 shrink-0" style={{ color: T.bad }} />
            <div>
              <div className="mb-1 text-[14.5px] font-bold" style={{ fontFamily: T.display, color: T.bad }}>
                Календар не завантажився
              </div>
              <p className="text-[13px] leading-relaxed" style={{ fontFamily: T.sans, color: T.text2 }}>{err}</p>
            </div>
          </div>
        )}

        {/* ─────────── Дні ─────────── */}
        {busy && !rows.length && (
          <div className="flex items-center justify-center gap-2 py-16 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            <Loader2 size={16} className="animate-spin" />
            вантажу календар…
          </div>
        )}

        {!busy && !err && !days.length && (
          <p className="py-16 text-center text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
            Під ці фільтри нічого не підпадає.
          </p>
        )}

        {/* День — окрема картка, а не просто заголовок над списком.
            Суцільна стрічка з сімдесяти рядків читається як одна
            маса: око не бачить, де закінчився вівторок. Картка дає
            межу, а тонкі лінії всередині розділяють самі події, не
            додаючи кожній власної рамки. */}
        <div className="flex flex-col gap-3">
          {days.map(([day, list]) => {
            const now = isToday(day);
            const high = list.filter((e) => e.impact === 'High').length;

            return (
              <div
                key={day}
                className="overflow-hidden rounded-2xl"
                style={{
                  background: T.surface,
                  border: `1px solid ${now ? T.lineAcc : T.line}`,
                }}
              >
                <div
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
                  style={{
                    background: now ? `rgba(${T.accRgb},0.07)` : 'rgba(255,255,255,0.025)',
                    borderBottom: `1px solid ${T.line}`,
                  }}
                >
                  <h2
                    className="text-[15px] font-bold capitalize"
                    style={{
                      fontFamily: T.display,
                      color: now ? T.acc : T.text,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {DAY_FMT(day)}
                  </h2>

                  {now && (
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ fontFamily: T.sans, color: T.acc }}>
                      сьогодні
                    </span>
                  )}

                  <span className="ml-auto flex items-baseline gap-3 text-[12px] tabular-nums" style={{ fontFamily: T.sans, color: T.text3 }}>
                    {high > 0 && (
                      <span className="flex items-center gap-1.5" style={{ color: T.bad }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: T.bad }} />
                        {high} важлив{high === 1 ? 'а' : 'их'}
                      </span>
                    )}
                    <span>{list.length} поді{list.length === 1 ? 'я' : 'й'}</span>
                  </span>
                </div>

                <div className="flex flex-col px-1.5 py-1">
                  {list.map((ev, i) => (
                    <div
                      key={ev.id}
                      style={i ? { borderTop: `1px solid ${T.line}` } : undefined}
                    >
                      <Row
                        ev={ev}
                        watched={watchedIds.has(ev.id)}
                        onWatch={toggleWatch}
                        canWatch={canWatch}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- тиха плашка ---------- */

function Note({ icon: I, tone, children }) {
  return (
    <div
      className="mb-3 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      <I size={15} strokeWidth={2.2} className="shrink-0" style={{ color: tone }} />
      <span className="text-[13px]" style={{ fontFamily: T.sans, color: T.text2 }}>{children}</span>
    </div>
  );
}
