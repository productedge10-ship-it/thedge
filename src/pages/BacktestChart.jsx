import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Scissors, Play, Pause, SkipForward, SkipBack, FastForward, X, Settings2, CalendarDays, ChevronDown,
  UploadCloud, Trash2, RotateCcw, PanelRight, Columns2, Maximize2, Check, Loader2, CircleDot, Send, Plus,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import useCloudState from '../hooks/useCloudState';
import { T, useEdgeFonts } from '../lib/theme';
import { t as tx, LOCALE } from '../lib/lang';
import { notify } from '../utils/notify';
import { uploadImage } from '../lib/imageStore';
import { sessionMeta, insertSession, updateSessionSettings } from '../lib/backtestMode';
import { setupsOfTags } from '../lib/backtestTags';
import { isDemo } from '../lib/backtestDemo';
import { ACT, act } from '../components/backtest/accent';
import Button from '../components/ui/Button';
import ChartEngine from '../components/backtest/chart/ChartEngine';
import ChartSettings from '../components/backtest/chart/ChartSettings';
import DrawingManager from '../components/backtest/chart/DrawingManager';
import DrawingToolbar, { Star } from '../components/backtest/chart/DrawingToolbar';
import DrawingFloatBar from '../components/backtest/chart/DrawingFloatBar';
import DrawIcon from '../components/backtest/chart/DrawingIcons';
import DrawingSettings from '../components/backtest/chart/DrawingSettings';
import IndicatorManager from '../components/backtest/chart/IndicatorManager';
import LinkedPanes, { MAX_LINKED } from '../components/backtest/chart/LinkedPanes';
import LinkedLegend from '../components/backtest/chart/LinkedLegend';
import NewsMarks from '../components/backtest/chart/NewsMarks';
import SymbolLogo from '../components/backtest/chart/SymbolLogo';
import { assetInfo, GROUPS as ASSET_GROUPS } from '../lib/candles/assets';
import TradePanel from '../components/backtest/chart/TradePanel';
import SideChart from '../components/backtest/chart/SideChart';
import FavoritesBar from '../components/backtest/chart/FavoritesBar';
import IndicatorsDialog from '../components/backtest/chart/IndicatorsDialog';
import IndicatorSettings from '../components/backtest/chart/IndicatorSettings';
import IndicatorLegend from '../components/backtest/chart/IndicatorLegend';
import { loadDrawings, saveDrawings, loadDefaults, saveDefaults, TOOLS, GROUPS, itemName } from '../lib/candles/drawings';
import ImportCandles, { ImportProgress, useCandleFilePicker } from '../components/backtest/chart/ImportCandles';
import { listSets, loadSet, saveSet, deleteSet, parseFile } from '../lib/candles/store';
import {
  remoteAllowed, isRemote, remoteName, REMOTE_PREFIX, getCatalog, getManifest, openRemote, loadOlder, monthOf, shiftMonth,
} from '../lib/candles/remote';
import { TFS, DEFAULT_TF_FAV, isoDay, sessionOf, fmtTime, tfById } from '../lib/candles/agg';

/* Крок реплею (як у FX Replay): null — одна свічка поточного ТФ. */
const STEP_TFS = [null, 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
import { fmtStamp } from '../lib/candles/timefmt';
import { DEFAULT_PREFS, normalizePrefs } from '../lib/candles/chartPrefs';

/* ==================================================================
   Бектест на реальному графіку.

   Сторінка — лише рамка: тулбар, панель угоди, список закритих.
   Графік, реплей і розрахунок стопів живуть у ChartEngine, бо
   оновлюються частіше, ніж має сенс перемальовувати React.

   Угоди пишуться в той самий backtest_trades, що й ручні, — тож уся
   статистика бектесту (R, вінрейт, сесії, крива) працює для них без
   жодної окремої логіки.
================================================================== */

const SPEEDS = [
  { ms: 10000, label: '10с', en: '10s' },
  { ms: 3000, label: '3с', en: '3s' },
  { ms: 1000, label: '1с', en: '1s' },
  { ms: 500, label: '0.5с', en: '0.5s' },
  { ms: 300, label: '0.3с', en: '0.3s' },
  { ms: 100, label: '0.1с', en: '0.1s' },
];

/* Курсори з лівої панелі. Бібліотека ставить свій курсор на полотно,
   тож перебиваємо його лише в області свічок (першому рядку таблиці
   графіка), а шкали лишають свої «тягнути»-курсори. */
const DOT = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Ccircle cx='8' cy='8' r='2.5' fill='%23ffffff' stroke='%23000' stroke-width='1'/%3E%3C/svg%3E\") 8 8, crosshair";
const ERASER = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Cpath d='M4 15l8-10 6 5-7 8H8z' fill='%23fff' stroke='%23000'/%3E%3C/svg%3E\") 4 18, pointer";
const CURSOR_CSS = `
.edge-chart-host[data-cursor="cur-cross"] tr:first-child td:nth-child(2) canvas { cursor: crosshair !important; }
.edge-chart-host[data-cursor="cur-dot"] tr:first-child td:nth-child(2) canvas { cursor: ${DOT} !important; }
.edge-chart-host[data-cursor="cur-arrow"] tr:first-child td:nth-child(2) canvas { cursor: default !important; }
.edge-chart-host[data-cursor="eraser"] tr:first-child td:nth-child(2) canvas { cursor: ${ERASER} !important; }
.edge-chart-host[data-over="move"] tr:first-child td:nth-child(2) canvas { cursor: move !important; }
.edge-chart-host[data-over="point"] tr:first-child td:nth-child(2) canvas { cursor: pointer !important; }
.edge-chart-host[data-over="pointer"] tr:first-child td:nth-child(2) canvas { cursor: pointer !important; }
.edge-chart-host[data-selecting="1"] tr:first-child td:nth-child(2) canvas { cursor: crosshair !important; }
`;

const fmtNum = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const fmtR = (r) => `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}R`;

/* Кнопка тулбара — плоска, як у TV, з тонкою підкладкою на наведенні. */
function ToolBtn({ active, title, onClick, children, className = '', disabled }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2962ff] disabled:opacity-40 ${className}`}
      style={{ background: active ? act(0.18) : 'transparent', color: active ? '#fff' : T.text2 }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 hidden h-5 w-px shrink-0 sm:block" style={{ background: T.line }} />;

function Menu({ open, onClose, children, align = 'left', width = 280 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl p-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}
      style={{ width, background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 16px 40px rgba(0,0,0,0.45)' }}
    >
      {children}
    </div>
  );
}

/* Панель реплею вбудована внизу графіка: з'являється знизу. */
const RB_CSS = '@keyframes edgeBarIn{from{opacity:0;translate:0 100%}to{opacity:1;translate:0 0}}@keyframes edgeBarOut{from{opacity:1;translate:0 0}to{opacity:0;translate:0 100%}}';

export default function BacktestChart() {
  useEdgeFonts();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session') || '';
  const uid = user?.id || 'anon';

  const [prefsRaw, setPrefsRaw] = useCloudState('chart_prefs', DEFAULT_PREFS, { normalize: normalizePrefs });
  const prefs = useMemo(() => normalizePrefs(prefsRaw), [prefsRaw]);
  const setPrefs = useCallback((p) => setPrefsRaw(normalizePrefs(p)), [setPrefsRaw]);
  const prefsRef = useRef(null);
  prefsRef.current = prefs;

  const [sets, setSets] = useState(null);
  const [symbol, setSymbol] = useState('');
  const [loadingSet, setLoadingSet] = useState(false);
  /* Свічки з сервера: каталог, стан підвантаження, що вже відкрито. */
  const [catalog, setCatalog] = useState(null);
  const [srvStatus, setSrvStatus] = useState(null); // null | 'request' | 'wait' | 'older'
  const [symQuery, setSymQuery] = useState('');
  const remoteRef = useRef(null); // { name, manifest, firstYm }
  const remoteEnabled = remoteAllowed(user?.email);
  const olderRef = useRef(null);
  const [importing, setImporting] = useState(null);
  const [st, setSt] = useState({ ready: false, tf: prefs.tf, replay: false, selecting: false, playing: false, pos: null });
  const [legend, setLegend] = useState(null);
  const [closed, setClosed] = useState([]);
  const closedRef = useRef([]);
  closedRef.current = closed;
  const [sessions, setSessions] = useState([]);
  const [menu, setMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dateVal, setDateVal] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const chartWrapRef = useRef(null);
  const ovRef = useRef(null);
  const slRef = useRef(null);
  const tpRef = useRef(null);
  const enRef = useRef(null);
  const wRef = useRef(null);
  const qbRef = useRef(null);
  const engRef = useRef(null);
  const posRef = useRef(null);
  const digits = useRef(2);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;
  const dmRef = useRef(null);
  const symRef = useRef('');
  const saveTimer = useRef(null);
  const [draw, setDraw] = useState({ tool: null, count: 0 });
  const [multiN, setMultiN] = useState(0);
  const [textEdit, setTextEdit] = useState(null);
  useEffect(() => { if (dmRef.current) dmRef.current.editing = textEdit; }, [textEdit]);
  const [selDraw, setSelDraw] = useState(null);
  const [drawEdit, setDrawEdit] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [treeTick, setTreeTick] = useState(0);
  const imRef = useRef(null);
  const [indOpen, setIndOpen] = useState(false);
  /* Який інструмент реально завантажено в рушій (після setData). */
  const [loadedSym, setLoadedSym] = useState('');
  const snapParam = params.get('snap') || '';
  const snapOpened = useRef('');

  /* Скріншоти закритих угод: id угоди → Promise<Blob|null>. */
  const shotsRef = useRef(new Map());

  /* Графіки інших інструментів під основним (LinkedPanes). */
  const lpRef = useRef(null);
  const [linkedSt, setLinkedSt] = useState([]);
  const [indEdit, setIndEdit] = useState(null);

  /* ---------------- рушій ---------------- */

  useEffect(() => {
    const eng = new ChartEngine(boxRef.current, ovRef.current, prefs, {
      onState: (s) => { posRef.current = s.pos; setSt(s); },
      onLegend: (b, prev, k) => setLegend({ ...b, prev, k }),
      onClosed: (trade) => {
        /* Скріншот угоди для журналу: через два кадри, коли рамка
           закритої угоди вже намальована. Запис у бектест чекає на нього. */
        shotsRef.current.set(trade.id, new Promise((res) => {
          requestAnimationFrame(() => requestAnimationFrame(() => { eng.snapshot().then(res, () => res(null)); }));
        }));
        setClosed((list) => [...list, { ...trade, saved: false }]);
      },
      onNotice: (code) => {
        if (code === 'back_closed') notify.info?.(tx('Далі назад не можна', 'Can’t go back further'), tx('Тут закрилась угода — вона вже в результатах.', 'A trade closed here — it’s already in the results.'));
      },
      onFrame: () => placeHandles(),
      needOlder: () => olderRef.current?.(),
    });
    engRef.current = eng;

    /* Малювання. Список зберігається окремо для кожного інструмента:
       лінії по золоту не мають зʼявлятися на євро. */
    const dm = new DrawingManager(eng, boxRef.current, {
      onChange: (list) => {
        setDraw((v) => ({ ...v, count: list.length }));
        clearTimeout(saveTimer.current);
        const sym = symRef.current;
        saveTimer.current = setTimeout(() => saveDrawings(uid, sym, list), 300);
      },
      onSelect: (d) => setSelDraw(d ? { ...d, style: { ...d.style } } : null),
      onTool: (tool) => setDraw((v) => ({ ...v, tool })),
      onMulti: (n) => setMultiN(n),
      /* Текст пишеться прямо на графіку, як у TV, а не у вікні. */
      onText: (d) => setTextEdit(d.id),
      onSettings: (d) => setDrawEdit(d.id),
      onContext: (c) => setCtxMenu(c),
      /* Довга/коротка позиція в реплеї — у чернетку панелі угоди. */
      onPosTool: (d) => eng.draftFromTool(d.type, d.pts),
    });
    dm.defaults = loadDefaults(uid);
    /* Подвійний клік будь-де по графіку — панелі інших інструментів
       згортаються в смужки (основний на весь екран), ще раз — повертаються.
       Шкали й малюнки не чіпаємо: там подвійний клік робить своє. */
    const onPaneDbl = (ev) => {
      const lp = lpRef.current;
      if (!lp?.count) return;
      const r = boxRef.current.getBoundingClientRect();
      const x = ev.clientX - r.left; const y = ev.clientY - r.top;
      if (x > eng.chart.timeScale().width() || y > eng.chart.chartElement().clientHeight - eng.chart.timeScale().height()) return;
      /* По малюнку подвійний клік відкриває його налаштування — не чіпаємо. */
      const dm = dmRef.current;
      if (dm && (dm.tool || dm.draft || dm.hit(x, y))) return;
      ev.stopPropagation();
      ev.preventDefault();
      lp.toggleAll();
    };
    boxRef.current.addEventListener('dblclick', onPaneDbl, true);
    eng.drawings = dm;
    const lp = new LinkedPanes(eng, { loadLocal: (key) => loadSet(uid, key), onChange: setLinkedSt });
    eng.linked = lp;
    lpRef.current = lp;
    const im = new IndicatorManager(eng);
    eng.indicators = im;
    imRef.current = im;
    dmRef.current = dm;
    if (import.meta.env?.DEV) { window.__dm = dm; window.__im = im; window.__eng = eng; }
    return () => { boxRef.current?.removeEventListener('dblclick', onPaneDbl, true); lp.destroy(); im.destroy(); dm.destroy(); eng.destroy(); engRef.current = null; dmRef.current = null; imRef.current = null; lpRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engRef.current?.applyPrefs(prefs); }, [prefs]);

  /* Індикатори живуть у налаштуваннях графіка — синхронізуються з
     акаунтом, як і кольори. */
  useEffect(() => { imRef.current?.setConfig(prefs.indicators || []); }, [prefs.indicators]);
  const setIndicators = (list) => setPrefs({ ...prefs, indicators: list });

  /* Панелі з іншими інструментами — у налаштуваннях графіка, як і
     індикатори. Основний інструмент сам під собою не показуємо, а
     серверні — лише тим, кому сервер відкритий. */
  const linkedKeys = (prefs.linked || []).filter((k) => k && k !== symbol && (!isRemote(k) || remoteEnabled));
  const linkedSig = linkedKeys.join('|');
  useEffect(() => { lpRef.current?.setList(linkedKeys); }, [linkedSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const addLinked = (key) => { setPrefs({ ...prefs, linked: [...(prefs.linked || []).filter((k) => k !== key), key].slice(-MAX_LINKED) }); setMenu(null); };
  const removeLinked = (key) => setPrefs({ ...prefs, linked: (prefs.linked || []).filter((k) => k !== key) });
  if (import.meta.env?.DEV) window.__setInd = setIndicators;
  const indCount = (prefs.indicators || []).length;

  /* Стан лівої панелі живе в налаштуваннях графіка — магніт, режим
     малювання, вибрані в групах інструменти памʼятаються. */
  useEffect(() => {
    const dm = dmRef.current;
    if (!dm) return;
    dm.magnet = prefs.drawMagnet || 'off';
    dm.keep = !!prefs.drawStay;
    dm.lockAll = !!prefs.drawLock;
    dm.hideAll = !!prefs.drawHide;
    dm.cursor = prefs.drawCursor || 'cur-cross';
    dm.applyCursor();
  }, [prefs.drawMagnet, prefs.drawStay, prefs.drawLock, prefs.drawHide, prefs.drawCursor]);

  const drawAct = {
    tool: (id) => dmRef.current?.setTool(id),
    cursor: (id) => { setPrefs({ ...prefs, drawCursor: id }); dmRef.current?.setCursor(id); },
    groupSel: (g, id) => setPrefs({ ...prefs, drawGroups: { ...(prefs.drawGroups || {}), [g]: id }, ...(g === 'cursor' ? { drawCursor: id } : {}) }),
    magnet: (m) => setPrefs({ ...prefs, drawMagnet: m, ...(m !== 'off' ? { drawLastMagnet: m } : {}) }),
    keep: () => setPrefs({ ...prefs, drawStay: !prefs.drawStay }),
    lock: () => setPrefs({ ...prefs, drawLock: !prefs.drawLock }),
    hide: () => setPrefs({ ...prefs, drawHide: !prefs.drawHide }),
    removeAll: () => dmRef.current?.removeAll(),
    undo: () => dmRef.current?.undo(),
    /* Обрані інструменти: зірочка в меню групи. Перша зірочка сама
       показує панель обраних. */
    fav: (id) => {
      const list = prefs.drawFav || [];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      setPrefs({ ...prefs, drawFav: next, ...(next.length > list.length ? { favBar: true } : {}) });
    },
    favBar: () => setPrefs({ ...prefs, favBar: !(prefs.favBar === true || (prefs.favBar !== false && (prefs.drawFav || []).length > 0)) }),
  };

  const drawSt = {
    tool: draw.tool,
    cursor: prefs.drawCursor || 'cur-cross',
    magnet: prefs.drawMagnet || 'off',
    lastMagnet: prefs.drawLastMagnet,
    keep: !!prefs.drawStay,
    lockAll: !!prefs.drawLock,
    hideAll: !!prefs.drawHide,
    count: draw.count,
    groupSel: prefs.drawGroups || {},
    favs: prefs.drawFav || [],
    favBar: prefs.favBar === true || (prefs.favBar !== false && (prefs.drawFav || []).length > 0),
  };

  const editing = drawEdit ? dmRef.current?.list.find((x) => x.id === drawEdit) : null;

  /* Ручки SL/TP ставимо напряму в DOM на кожен кадр: тягнеш графік чи
     шкалу — вони мають їхати разом із ціною без запізнення на рендер. */
  /* Ручки рамки угоди — як у позиції TV: квадрати на тейку й стопі,
     кола на вході й праворуч (ширина). Ставимо прямо в DOM на кожен
     кадр, щоб їхали разом із графіком без запізнення. */
  function placeHandles() {
    const eng = engRef.current;
    const g = eng && eng.prefs.showPositions ? eng.ticketGeom() : null;
    const box = boxRef.current;
    const W = box ? box.clientWidth - (eng ? eng.chart.priceScale('right').width() : 0) : 0;
    const H = eng ? eng.chart.paneSize(0).height : 0;
    [[tpRef.current, 'tp'], [slRef.current, 'sl'], [enRef.current, 'entry'], [wRef.current, 'width']].forEach(([el, key]) => {
      if (!el) return;
      let x = null; let y = null;
      if (g && !(key === 'entry' && g.tk.kind === 'pos')) {
        x = key === 'width' ? g.x2 : g.x1;
        y = key === 'tp' ? g.yt : key === 'sl' ? g.ys : g.ye;
      }
      if (x == null || x < -6 || x > W + 6 || y < -6 || y > H + 6) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.transform = `translate(${Math.round(x) - 5}px, ${Math.round(y) - 5}px)`;
    });
    /* Кнопки біля рамки: відкрити / скасувати / закрити — щоб торгувати
       й без панелі праворуч. */
    const qb = qbRef.current;
    if (qb) {
      let x = null; let y = null;
      if (g) {
        /* Під нижнім підписом рамки, щоб нічого не закривати. */
        x = g.x1;
        y = Math.max(g.yt, g.ys) + 28;
        if (y > H - 34) y = Math.min(g.yt, g.ys) - 62;
      }
      else if (eng?.selClosed) {
        const t = eng.closed.find((c) => c.id === eng.selClosed);
        const cg = t ? eng.closedGeom(t) : null;
        if (cg) { x = cg.x2 + 8; y = cg.y1; }
      }
      if (x == null) qb.style.visibility = 'hidden';
      else {
        const w = qb.offsetWidth || 160;
        const xx = Math.max(4, Math.min(W - w - 4, x));
        const yy = Math.max(4, Math.min(H - 34, y));
        qb.style.visibility = 'visible';
        qb.style.transform = `translate(${Math.round(xx)}px, ${Math.round(yy)}px)`;
      }
    }
  }

  /* ---------------- набори свічок ---------------- */

  const refreshSets = useCallback(async () => {
    const list = await listSets(uid);
    setSets(list);
    return list;
  }, [uid]);

  useEffect(() => {
    let alive = true;
    Promise.all([refreshSets(), remoteEnabled ? getCatalog() : Promise.resolve(null)]).then(([list, cat]) => {
      if (!alive) return;
      setCatalog(cat);
      if (isRemote(prefs.symbol) && cat) { setSymbol(prefs.symbol); return; }
      const want = list.find((x) => x.symbol === prefs.symbol) || list[0];
      if (want) setSymbol(want.symbol);
      else if (cat?.core?.length) setSymbol(REMOTE_PREFIX + (cat.core.find((c) => c.symbol === 'XAUUSD') || cat.core[0]).symbol);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSets, remoteEnabled]);

  useEffect(() => {
    if (!symbol) return undefined;
    let alive = true;
    setLoadingSet(true);
    remoteRef.current = null;
    const remote = isRemote(symbol);
    const load = remote
      ? openRemote(remoteName(symbol), { onStatus: (x) => alive && setSrvStatus(x) }).then((r) => {
        remoteRef.current = { name: remoteName(symbol), manifest: r.manifest, firstYm: r.months[0] };
        return r.set;
      })
      : loadSet(uid, symbol);
    load.then((rec) => {
      if (!alive || !rec || !engRef.current) return;
      digits.current = rec.digits;
      engRef.current.useTf(prefs.tf);
      engRef.current.setData(rec);
      setClosed([]);
      symRef.current = rec.symbol;
      setLoadedSym(rec.symbol);
      const list = loadDrawings(uid, rec.symbol);
      dmRef.current?.setList(list);
      setDraw((v) => ({ ...v, count: list.length }));
      if (prefs.symbol !== symbol) setPrefs({ ...prefs, symbol });
    }).catch((e) => {
      const msg = e.message === 'timeout'
        ? tx('Сервер не встиг підготувати історію. Спробуй ще раз за хвилину.', 'The server didn’t prepare the history in time. Try again in a minute.')
        : e.message === 'no_history' ? tx('У брокера немає історії по цьому інструменту.', 'The broker has no history for this symbol.') : e.message;
      notify.error(tx('Не вдалось відкрити свічки', 'Couldn’t open candles'), msg);
    }).finally(() => { if (alive) { setLoadingSet(false); setSrvStatus(null); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, uid]);

  const onFile = async (file) => {
    setMenu(null);
    setImporting(0);
    try {
      const set = await parseFile(file, (p) => setImporting(p));
      if (set.n < 100) throw new Error(tx('У файлі замало свічок', 'Too few candles in the file'));
      setImporting(1);
      await saveSet(uid, set);
      await refreshSets();
      const days = Math.round((set.t[set.n - 1] - set.t[0]) / 86400);
      notify.success(
        tx(`${set.symbol}: ${set.n.toLocaleString(LOCALE)} свічок`, `${set.symbol}: ${set.n.toLocaleString(LOCALE)} candles`),
        tx(`Історія за ${days} дн. — з ${fmtTime(set.t[0]).slice(0, 10)}.`, `${days} days of history from ${fmtTime(set.t[0]).slice(0, 10)}.`),
      );
      if (set.symbol === symbol) {
        const rec = await loadSet(uid, set.symbol);
        engRef.current?.setData(rec);
      } else setSymbol(set.symbol);
    } catch (e) {
      const msg = e.message === 'no_rows'
        ? tx('Не знайшов у файлі жодної свічки. Це точно експорт барів з MT5?', 'No candles found. Is this an MT5 bars export?')
        : e.message;
      notify.error(tx('Не вдалось прочитати файл', 'Couldn’t read the file'), msg);
    } finally {
      setImporting(null);
    }
  };
  const [fileInput, pickFile] = useCandleFilePicker(onFile);

  const removeSet = async (sym) => {
    await deleteSet(uid, sym);
    const list = await refreshSets();
    if (sym === symbol) setSymbol(list[0]?.symbol || '');
  };

  /* ---------------- куди писати угоди ---------------- */

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('backtest_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setSessions(data || []));
  }, [user?.id]);

  const currentSession = sessions.find((s) => s.id === sessionId);
  const demo = isDemo(sessionId);

  const toPayload = (t, shot = null) => ({
    session_id: sessionRef.current,
    user_id: user?.id,
    date: isoDay(t.entryT),
    type: t.side,
    result: t.result,
    rr: t.result === 'BE' ? 0 : Math.abs(t.r),
    notes: t.note || '',
    screenshot_url: shot,
    tda_data: {
      pair: t.symbol,
      session: sessionOf(t.entryT),
      tags: [tx('Реальний графік', 'Real chart'), ...(t.meta?.setups || [])],
      emotions: t.meta?.emotions?.length ? t.meta.emotions : undefined,
      mistakes: t.meta?.mistakes?.length ? t.meta.mistakes : undefined,
      shots: shot ? [shot] : [],
      chart: {
        tf: t.tf, entry: t.entry, sl: t.sl, sl_final: t.slFinal, tp: t.tp, exit: t.exit,
        entry_time: t.entryT, exit_time: t.exitT, exit_reason: t.reason,
        partials: t.partials?.length ? t.partials.map(({ px, frac, t: pt, r }) => ({ px, frac, t: pt, r })) : undefined, trail: t.trail || undefined,
        /* Знімки на вході й виході — малюнки, ТФ і вид. Відкриваються на графіку. */
        snaps: t.snaps || undefined, side: t.side, r: t.r, symbol: t.symbol,
      },
    },
  });

  const saveTrades = useCallback(async (list) => {
    if (!sessionRef.current || isDemo(sessionRef.current) || !user?.id || !list.length) return;
    setSaving(true);
    try {
      /* id з бази — щоб угоду можна було потім прибрати й звідти. */
      /* Спершу скріншоти: якщо сховище недоступне — угода однаково
         пишеться, просто без картинки. */
      const shots = await Promise.all(list.map(async (t) => {
        try {
          const blob = await shotsRef.current.get(t.id);
          if (!blob) return null;
          const file = new File([blob], 'trade.webp', { type: blob.type || 'image/webp' });
          return await uploadImage(user.id, `backtest-${sessionRef.current}`, file);
        } catch { return null; }
      }));
      const { data, error } = await supabase.from('backtest_trades').insert(list.map((t, i) => toPayload(t, shots[i]))).select('id');
      if (error) throw error;
      const dbOf = new Map(list.map((t, i) => [t.id, data?.[i]?.id || null]));
      setClosed((all) => all.map((t) => (dbOf.has(t.id) ? { ...t, saved: true, dbId: dbOf.get(t.id) } : t)));
    } catch (e) {
      notify.error(tx('Угоду не записано', 'Trade not saved'), e.message);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /* Щойно закрита угода — одразу в бектест, якщо його обрано. */
  const lastClosed = closed[closed.length - 1];
  useEffect(() => {
    if (lastClosed && !lastClosed.saved && sessionRef.current) saveTrades([lastClosed]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastClosed?.id]);

  const unsaved = closed.filter((t) => !t.saved);

  /* Угоди цього бектесту по цьому інструменту з бази — щоб їх було
     видно на графіку й у списку, і щоб відкривались їхні знімки. */
  useEffect(() => {
    if (!loadedSym || !sessionId || isDemo(sessionId) || !user?.id) return undefined;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('backtest_trades').select('id,date,type,result,rr,notes,screenshot_url,tda_data').eq('session_id', sessionId);
      if (!alive || error || !Array.isArray(data)) return;
      const own = new Set(closedRef.current.map((x) => x.dbId).filter(Boolean));
      const rows = data.filter((row) => row.tda_data?.chart?.entry_time && (row.tda_data.pair || '') === loadedSym && !own.has(row.id));
      const list = rows.map((row) => {
        const c = row.tda_data.chart;
        const rr = Math.abs(Number(row.rr) || 0);
        const r = c.r ?? (row.result === 'LOSS' ? -rr : row.result === 'BE' ? 0 : rr);
        return {
          id: `db${row.id}`, dbId: row.id, saved: true, fromDb: true,
          symbol: loadedSym, side: c.side || row.type, tf: c.tf, entry: c.entry, sl: c.sl, slFinal: c.sl_final ?? c.sl, tp: c.tp, exit: c.exit,
          entryT: c.entry_time, exitT: c.exit_time, r, result: row.result, reason: c.exit_reason, note: row.notes || '',
          partials: c.partials || [], trail: !!c.trail, snaps: c.snaps || null, digits: digits.current, shot: row.screenshot_url || null,
          meta: { setups: setupsOfTags(row.tda_data.tags), emotions: row.tda_data.emotions || [], mistakes: row.tda_data.mistakes || [] },
        };
      }).sort((a, b) => a.entryT - b.entryT);
      engRef.current?.loadClosed(list);
      setClosed((cur) => [...list, ...cur.filter((x) => !x.fromDb)].sort((a, b) => a.entryT - b.entryT));
      /* Прийшли з журналу за конкретною угодою — одразу її знімок. */
      if (snapParam && snapOpened.current !== snapParam) {
        const hit = list.find((x) => String(x.dbId) === snapParam);
        if (hit) { snapOpened.current = snapParam; openSnap(hit, 'entry'); }
        else {
          const row = data.find((x) => String(x.id) === snapParam);
          const pair = row?.tda_data?.pair;
          if (pair && pair !== loadedSym && remoteEnabled) setSymbol(REMOTE_PREFIX + pair);
        }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedSym, sessionId, user?.id]);

  /* Маніфест інструмента — одразу, паралельно з каталогом і сесіями:
     коли дійде черга відкривати свічки, він уже в памʼяті. */
  useEffect(() => {
    if (remoteEnabled && isRemote(prefs.symbol)) getManifest(remoteName(prefs.symbol)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Шкала ціни з налаштувань — коли графік готовий. */
  useEffect(() => {
    if (st.ready && prefs.scaleMode && prefs.scaleMode !== 'normal' && eng()?.scaleMode !== prefs.scaleMode) eng()?.setScaleMode(prefs.scaleMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.ready]);

  /* Де зупинився реплей — щоб наступного разу продовжити з того ж
     місця. Пишемо лише на паузі й не частіше, ніж раз на 2 с. */
  useEffect(() => {
    if (!st.replay || st.playing || !st.time) return undefined;
    const tm = setTimeout(() => {
      const cur = prefsRef.current || prefs;
      const by = sessionId && !isDemo(sessionId) ? { resumeBy: { ...(cur.resumeBy || {}), [sessionId]: { sym: symbol, t: st.time } } } : {};
      if (cur.resume?.sym === symbol && cur.resume?.t === st.time && (!sessionId || cur.resumeBy?.[sessionId]?.t === st.time)) return;
      setPrefs({ ...cur, resume: { sym: symbol, t: st.time }, ...by });
    }, 2000);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.replay, st.playing, st.time, symbol]);

  /* Нотатка й теги вже закритої угоди: одразу в списку й на графіку,
     а в бектест — з невеликою паузою (щоб не писати на кожну літеру). */
  const editTimers = useRef(new Map());
  const editTrade = (t, patch) => {
    setClosed((all) => all.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    const ec = engRef.current?.closed.find((x) => x.id === t.id);
    if (ec) Object.assign(ec, patch);
    if (!t.dbId) return;
    clearTimeout(editTimers.current.get(t.id));
    editTimers.current.set(t.id, setTimeout(async () => {
      const cur = closedRef.current.find((x) => x.id === t.id);
      if (!cur) return;
      const { data } = await supabase.from('backtest_trades').select('tda_data').eq('id', t.dbId).single();
      const m = cur.meta || {};
      const tda = {
        ...(data?.tda_data || {}),
        tags: [tx('Реальний графік', 'Real chart'), ...(m.setups || [])],
        emotions: m.emotions || [],
        mistakes: m.mistakes || [],
      };
      const { error } = await supabase.from('backtest_trades').update({ notes: cur.note || '', tda_data: tda }).eq('id', t.dbId);
      if (error) notify.error(tx('Теги не збережено', 'Tags not saved'), error.message);
    }, 700));
  };

  /* Видалити угоду: з графіка, зі списку і, якщо вже записана, з бектесту. */
  const deleteTrade = async (t) => {
    if (t.saved && t.dbId) {
      const { error } = await supabase.from('backtest_trades').delete().eq('id', t.dbId);
      if (error) { notify.error(tx('Угоду не видалено', 'Trade not deleted'), error.message); return; }
    }
    engRef.current?.removeClosed(t.id);
    setClosed((all) => all.filter((x) => x.id !== t.id));
  };

  /* Ризик угоди в $ — рамка на графіку підписує ціль і стоп у грошах. */
  const balance = Number(currentSession?.initial_balance) || 10000;
  /* Ризик — з налаштувань бектесту (його задають при створенні), інакше з графіка. */
  const sessMeta = useMemo(() => (currentSession ? sessionMeta(currentSession) : null), [currentSession]);
  const sessRisk = Number(sessMeta?.settings?.riskPct);
  const riskPct = sessRisk > 0 ? sessRisk : (Number(prefs.riskPct) > 0 ? Number(prefs.riskPct) : 1);
  const panelPrefs = useMemo(() => ({ ...prefs, riskPct }), [prefs, riskPct]);
  const setPanelPrefs = (p) => {
    if (currentSession && Number(p.riskPct) !== riskPct && Number(p.riskPct) > 0) {
      updateSessionSettings(currentSession, { riskPct: Number(p.riskPct) })
        .then((settings) => { if (settings) setSessions((list) => list.map((x) => (x.id === currentSession.id ? { ...x, settings } : x))); });
    }
    setPrefs(p);
  };

  /* Відкрили бектест на графіку — графік підлаштовується під нього:
     той самий інструмент і таймфрейм, а реплей продовжується з місця,
     де зупинився минулого разу (або з дати старту, заданої при створенні). */
  const sessOpen = useRef({ sym: '', tf: '', resume: '' });
  useEffect(() => {
    if (!currentSession || !catalog || !remoteEnabled) return;
    const want = String(currentSession.pair || '').toUpperCase();
    if (sessOpen.current.sym === currentSession.id) return;
    sessOpen.current.sym = currentSession.id;
    const all = [...(catalog.core || []), ...(catalog.onDemand || [])].map((c) => String(c.symbol || c).toUpperCase());
    if (want && all.includes(want) && remoteName(symbol) !== want) setSymbol(REMOTE_PREFIX + want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id, catalog]);
  useEffect(() => {
    if (!currentSession || !loadedSym || !st.ready) return;
    const want = String(currentSession.pair || '').toUpperCase();
    /* Чекаємо, поки завантажиться саме інструмент бектесту (якщо він є на сервері). */
    if (want && loadedSym !== want && sessOpen.current.sym === currentSession.id && remoteName(symbol) === want) return;
    if (sessOpen.current.resume === currentSession.id) return;
    sessOpen.current.resume = currentSession.id;
    const set = sessMeta?.settings || {};
    if (set.tf && TFS.some((x) => x.id === set.tf) && st.tf !== set.tf && !prefs.resumeBy?.[currentSession.id]) setTf(set.tf);
    if (snapParam || eng()?.replay) return;
    const r = prefs.resumeBy?.[currentSession.id];
    if (r?.t && r.sym === symbol) { goTime(r.t + 1, 'replay'); return; }
    if (set.start) {
      const sec = Date.UTC(+set.start.slice(0, 4), +set.start.slice(5, 7) - 1, +set.start.slice(8, 10)) / 1000;
      if (Number.isFinite(sec)) goTime(sec, 'replay');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession?.id, loadedSym, st.ready]);
  useEffect(() => { if (engRef.current) engRef.current.riskUsd = (balance * riskPct) / 100; }, [balance, riskPct, st.ready]);

  const chooseSession = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('session', id); else next.delete('session');
    setParams(next, { replace: true });
    setMenu(null);
  };

  /* Новий бектест прямо з графіка — щоб угоди одразу писались. */
  const [creatingSession, setCreatingSession] = useState(false);
  const createSession = async () => {
    if (!user?.id || creatingSession) return;
    setCreatingSession(true);
    try {
      const name = `${remoteName(symbol) || 'Backtest'} · ${new Date().toLocaleDateString(LOCALE)}`;
      const data = await insertSession({
        user_id: user.id, name, pair: remoteName(symbol) || 'EURUSD', initial_balance: 10000,
        mode: 'chart', settings: { riskPct: Number(prefs.riskPct) || 1, tf: st.tf },
      });
      setSessions((list) => [data, ...list]);
      chooseSession(data.id);
      notify.success?.(tx('Бектест створено', 'Backtest created'), name);
    } catch (e) {
      notify.error(tx('Не вдалось створити бектест', 'Couldn’t create the backtest'), e.message);
    } finally {
      setCreatingSession(false);
    }
  };

  /* ---------------- дії ---------------- */

  /* Вихід — з тією самою анімацією, що й вхід, лише навпаки. */
  const leave = () => {
    if (leaving) return;
    setLeaving(true);
    engRef.current?.pause();
    setTimeout(() => navigate(sessionId ? `/backtest/${sessionId}` : '/backtest'), 170);
  };

  const eng = () => engRef.current;
  const setTf = (id) => { eng()?.useTf(id); setPrefs({ ...prefs, tf: id }); };
  const speedIdx = Math.min(SPEEDS.length - 1, Math.max(0, prefs.speed ?? 2));
  const togglePlay = () => {
    const e = eng();
    if (!e?.replay) return;
    if (e.playing) e.pause(); else e.play(SPEEDS[speedIdx].ms);
  };
  const setSpeed = (i) => { setPrefs({ ...prefs, speed: i }); eng()?.setSpeed(SPEEDS[i].ms); setMenu(null); };
  const stepTf = STEP_TFS.includes(prefs.replayStep) ? prefs.replayStep : null;
  const setStepTf = (id) => { setPrefs({ ...prefs, replayStep: id }); eng()?.setStepTf(id); setMenu(null); };
  const stepLabel = (id) => (id ? tfById(id).label : tx('ТФ', 'TF'));
  useEffect(() => { if (st.ready) eng()?.setStepTf(stepTf); }, [st.ready, stepTf]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPos = (side) => {
    const e = eng();
    if (!e) return;
    if (!e.replay) {
      notify.error(tx('Спершу обери точку старту', 'Pick a starting point first'), tx('Натисни «Реплей» і клікни на свічку — далі графік сховано, і можна торгувати.', 'Press “Replay” and click a candle — the future is hidden and you can trade.'));
      return;
    }
    e.openPosition(side, { rr: prefs.rr });
  };

  const exitReplay = () => eng()?.exitReplay();

  /* Панель реплею: зникає одночасно з графіком — легке з'їжджання вниз за ~160 мс. */
  const barWanted = (st.replay || st.selecting) && !st.snap;
  const [barMounted, setBarMounted] = useState(barWanted);
  useEffect(() => {
    if (barWanted) { setBarMounted(true); return undefined; }
    const id = setTimeout(() => setBarMounted(false), 170);
    return () => clearTimeout(id);
  }, [barWanted]);


  /* Гортання вліво біля краю завантаженого: старші місяці з сервера.
     false — далі історії немає, графік більше не питатиме. */
  const loadOlderNow = async (count) => {
    const r = remoteRef.current;
    const e = eng();
    if (!r || !e) return false;
    setSrvStatus('older');
    try {
      const res = await loadOlder(r.name, r.manifest, r.firstYm, { count, onStatus: (x) => setSrvStatus(x === 'request' || x === 'wait' ? 'wait' : 'older') });
      if (remoteRef.current !== r) return false; // поки вантажили — відкрили інший інструмент
      r.manifest = res.manifest;
      if (!res.set) return false;
      e.prepend(res.set);
      r.firstYm = res.months[0];
      return true;
    } catch (err) {
      notify.error(tx('Не вдалось догрузити історію', 'Couldn’t load more history'), err.message === 'timeout' ? tx('Сервер не відповів вчасно.', 'The server timed out.') : err.message);
      return false;
    } finally {
      setSrvStatus(null);
    }
  };
  olderRef.current = () => loadOlderNow();

  const goDate = async (mode) => {
    if (!dateVal) return;
    const sec = Date.UTC(+dateVal.slice(0, 4), +dateVal.slice(5, 7) - 1, +dateVal.slice(8, 10)) / 1000;
    setMenu(null);
    await goTime(sec, mode);
  };

  /* Перейти на час sec (догрузивши історію, якщо треба). */
  const goTime = async (sec, mode) => {
    await ensureHistory(sec);
    if (mode === 'replay') eng()?.startAtTime(sec);
  };

  /* Дата раніше за завантажене — спершу догружаємо місяці до неї
     (плюс місяць перед нею, щоб ліворуч було що побачити). */
  const ensureHistory = async (sec) => {
    const r = remoteRef.current;
    if (r && eng()?.base && sec < eng().base.t[0]) {
      const target = shiftMonth(monthOf(sec), -1);
      let guard = 0;
      while (remoteRef.current === r && r.firstYm > target && guard < 40) {
        guard += 1;
        const diff = (+r.firstYm.slice(0, 4) - +target.slice(0, 4)) * 12 + (+r.firstYm.slice(5, 7) - +target.slice(5, 7));
        // eslint-disable-next-line no-await-in-loop
        const more = await loadOlderNow(Math.min(12, Math.max(1, diff)));
        if (!more) break;
      }
    }
  };

  /* ---------------- знімки угод ---------------- */

  /* Відкрити знімок угоди на графіку (догрузивши історію, якщо угода старша). */
  const openSnap = async (t, which = 'entry') => {
    const e = eng();
    if (!e?.base) return;
    if (!e.closed.find((x) => x.id === t.id)) {
      await ensureHistory(t.entryT - 86400 * 3);
      e.attachPending();
    }
    if (!e.openSnap(t.id, which)) notify.info?.(tx('Знімок недоступний', 'Snapshot unavailable'), tx('Цієї угоди немає в завантаженій історії.', 'This trade is outside the loaded history.'));
  };
  const closeSnap = () => eng()?.closeSnap();

  /* На весь екран — увесь документ, а не лише блок графіка: інакше
     випадайки, вибір кольору й сповіщення (вони живуть у body) у
     повноекранному режимі просто не видно. Графік і так займає весь
     екран поверх застосунку. */
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };

  /* Гарячі клавіші як у TV: Shift+→ крок, Shift+↓ пуск/пауза,
     Alt+R — скинути масштаб, Esc — скасувати вибір точки. */
  useEffect(() => {
    const k = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const en = engRef.current;
      if (!en) return;
      if (en.snap) {
        /* У знімку — лише закрити його (Ctrl+Alt+D або Esc). */
        if ((e.ctrlKey && e.altKey && e.code === 'KeyD') || e.key === 'Escape') { e.preventDefault(); en.closeSnap(); }
        return;
      }
      if (e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); en.pause(); en.step(true); }
      else if (e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); en.stepBack(); }
      else if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); if (en.replay) { if (en.playing) en.pause(); else en.play(); } }
      else if (e.altKey && e.shiftKey && e.code === 'KeyR') { e.preventDefault(); dmRef.current?.setTool('rect'); }
      else if (e.altKey && (e.key === 'r' || e.key === 'R' || e.code === 'KeyR')) { e.preventDefault(); en.resetView(); }
      else if (e.key === 'Escape' && en.selecting) en.cancelSelect();
      else if (e.shiftKey && !e.ctrlKey && !e.altKey && (e.code === 'KeyB' || e.code === 'KeyS') && en.replay && !en.pos && !en.order) {
        /* Shift+B / Shift+S: перше натискання — чернетка, друге — вхід. */
        e.preventDefault();
        const side = e.code === 'KeyB' ? 'LONG' : 'SHORT';
        if (en.draft?.side === side) en.confirmDraft();
        else en.setDraft({ side });
      }
      else if (e.key === 'Escape' && en.draft && !dmRef.current?.draft && !dmRef.current?.tool) en.setDraft(null);
      else {
        /* Малювання: гарячі клавіші TradingView. */
        const dm = dmRef.current;
        if (!dm) return;
        const hot = { KeyT: 'trend', KeyH: 'hline', KeyJ: 'hray', KeyV: 'vline', KeyC: 'cross', KeyF: 'fib' };
        if (e.altKey && !e.ctrlKey && hot[e.code]) { e.preventDefault(); dm.setTool(hot[e.code]); }
        else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC' && dm.sel && !window.getSelection()?.toString()) { dm.copy(dm.sel); }
        else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && dm.clip) { e.preventDefault(); dm.paste(); }
        else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); dm.undo(); }
        else if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) { e.preventDefault(); dm.redo(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && dm.multi?.size) { e.preventDefault(); dm.removeMulti(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && dm.sel) { e.preventDefault(); dm.remove(dm.sel); }
        else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA' && !e.shiftKey) { e.preventDefault(); dm.setMulti(new Set(dm.list.filter((x) => dm.visible(x)).map((x) => x.id))); }
        else if (e.key === 'Escape') {
          dm.setMulti(null);
          if (dm.draft) { dm.draft = null; }
          else if (dm.tool) dm.setTool(null);
          else if (dm.sel) dm.select(null);
          dm.temp = null;
        }
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  /* Стиль фігури як типовий для її інструмента (кнопка «шаблони»). */
  const saveStyleDefault = (d) => {
    const dm = dmRef.current;
    const cur = dm?.list.find((x) => x.id === d?.id) || d;
    if (!dm || !cur) return;
    dm.defaults = { ...dm.defaults, [cur.type]: JSON.parse(JSON.stringify(cur.style)) };
    saveDefaults(uid, dm.defaults);
    notify.success(tx('Збережено', 'Saved'), tx('Нові такі фігури будуть з цим стилем.', 'New drawings of this type will use this style.'));
  };
  const resetStyleDefault = (d) => {
    const dm = dmRef.current;
    if (!dm || !d) return;
    const next = { ...dm.defaults }; delete next[d.type];
    dm.defaults = next;
    saveDefaults(uid, next);
    dm.update(d.id, { style: JSON.parse(JSON.stringify(TOOLS[d.type].style)) });
  };

  /* Меню правого кліку закривається будь-яким кліком і Esc. */
  useEffect(() => {
    if (!ctxMenu) return undefined;
    const close = () => setCtxMenu(null);
    const key = (e) => { if (e.key === 'Escape') close(); };
    const t = setTimeout(() => { window.addEventListener('pointerdown', close); window.addEventListener('wheel', close, { passive: true }); }, 0);
    window.addEventListener('keydown', key);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', close); window.removeEventListener('wheel', close); window.removeEventListener('keydown', key); };
  }, [ctxMenu]);

  /* ---------------- тягання SL / TP ---------------- */

  const startDrag = (key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const r0 = boxRef.current.getBoundingClientRect();
    const move = (ev) => {
      if (key === 'width') { eng()?.setBoxWidth(ev.clientX - r0.left); return; }
      const price = eng()?.priceAt(ev.clientY - r0.top);
      if (price != null) { eng()?.moveLevel(key, price); eng()?.glue(price, ev.clientX - r0.left); }
    };
    const up = () => {
      eng()?.unglue();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const d = digits.current;
  const pos = st.pos;
  const hasSets = sets && sets.length > 0;
  const tfLabel = TFS.find((x) => x.id === st.tf)?.label || '';
  const legendUp = legend ? legend.close >= legend.open : true;
  const chg = legend ? legend.close - legend.prev : 0;

  /* Графік — на весь екран поверх застосунку, як окрема вкладка
     графіка в TV: сайдбар і фон сторінки тут лише заважають. Портал у
     body, бо батьківські блоки застосунку мають власні шари й
     прокрутку, і «fixed» усередині них поводився б непередбачувано. */
  const page = (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[70] flex min-h-0 w-full min-w-0 flex-col overflow-hidden"
      style={{
        background: T.bg,
        animation: leaving ? 'edgeChartOut .18s ease-in forwards' : 'edgeChartIn .32s cubic-bezier(.22,1,.36,1)',
      }}
    >
      <style>{`
        @keyframes edgeChartIn { from { opacity: 0; transform: scale(.985); } to { opacity: 1; transform: none; } }
        @keyframes edgeChartOut { to { opacity: 0; transform: scale(.985); } }
      `}</style>
      {fileInput}

      {/* ─────────── Тулбар ─────────── */}
      {/* Без overflow: прокрутка тулбара обрізала б випадні меню. На
          вузькому екрані замість цього ховаються підписи й другорядне. */}
      <div className="relative z-30 flex h-12 shrink-0 items-center gap-0.5 overflow-x-clip px-1.5 sm:gap-1 sm:px-2" style={{ borderBottom: `1px solid ${T.line}`, background: T.surface }}>
        <ToolBtn title={tx('Назад до бектестів', 'Back to backtests')} onClick={leave}>
          <ArrowLeft size={17} />
        </ToolBtn>
        <Divider />

        {/* Символ */}
        <div className="relative">
          <ToolBtn title={tx('Інструмент', 'Symbol')} onClick={() => setMenu(menu === 'sym' ? null : 'sym')} active={menu === 'sym'}>
            {symbol && <SymbolLogo symbol={remoteName(symbol)} size={18} />}
            <span className="text-[14px] font-bold" style={{ color: T.text }}>{remoteName(symbol) || tx('Свічки', 'Candles')}</span>
            <ChevronDown size={14} />
          </ToolBtn>
          <Menu open={menu === 'sym'} onClose={() => setMenu(null)} width={remoteEnabled && catalog ? Math.min(900, (typeof window !== 'undefined' ? window.innerWidth : 900) - 16) : 300}>
            {remoteEnabled && catalog && (() => {
              const q = symQuery.trim().toUpperCase();
              const core = catalog.core || [];
              const extra = q ? (catalog.onDemand || []).filter((x) => x.symbol.toUpperCase().includes(q) || (x.desc || '').toUpperCase().includes(q)).slice(0, 30) : [];
              const pick = (name) => { setSymbol(REMOTE_PREFIX + name); setMenu(null); setSymQuery(''); };
              return (
                <div className="mb-1 pb-1" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.text3 }}>{tx('Сервер EDGE', 'EDGE server')}</div>
                  {/* Інструменти по колонках: форекс, метали, індекси, крипта. */}
                  {(() => {
                    const shown = core.filter((c) => !q || c.symbol.toUpperCase().includes(q) || assetInfo(c.symbol).name.toUpperCase().includes(q));
                    const cols = ASSET_GROUPS.map((g) => ({ ...g, items: shown.filter((c) => assetInfo(c.symbol).group === g.id) })).filter((g) => g.items.length);
                    if (!cols.length) return null;
                    return (
                      <div className="grid max-h-[60vh] gap-x-1 overflow-y-auto" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(205px, 1fr))` }}>
                        {cols.map((g) => (
                          <div key={g.id} className="min-w-0">
                            <div className="flex items-center justify-between px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text3 }}>
                              <span>{tx(g.uk, g.en)}</span>
                              <span style={{ fontFamily: T.mono, opacity: 0.7 }}>{g.items.length}</span>
                            </div>
                            {g.items.map((c) => {
                              const info = assetInfo(c.symbol);
                              const on = symbol === REMOTE_PREFIX + c.symbol;
                              return (
                                <button key={c.symbol} type="button" onClick={() => pick(c.symbol)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-white/5" style={{ background: on ? act(0.14) : undefined }}>
                                  <SymbolLogo symbol={c.symbol} size={24} />
                                  <span className="min-w-0">
                                    <span className="block text-[13.5px] font-bold leading-tight" style={{ color: T.text }}>{c.symbol}</span>
                                    {info.name && <span className="block truncate text-[11.5px] leading-tight" style={{ color: T.text3 }}>{info.name}</span>}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {(catalog.onDemand || []).length > 0 && <input
                    value={symQuery}
                    onChange={(e) => setSymQuery(e.target.value)}
                    placeholder={tx('Пошук або інший інструмент брокера…', 'Search or other broker symbol…')}
                    className="mx-1 mt-1 w-[calc(100%-8px)] rounded-lg px-2.5 py-2 text-[13px] outline-none"
                    style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text }}
                  />}
                  {extra.map((x) => (
                    <button key={x.symbol} type="button" onClick={() => pick(x.symbol)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left" style={{ background: symbol === REMOTE_PREFIX + x.symbol ? act(0.14) : 'transparent' }}>
                      <span className="flex items-center gap-2"><SymbolLogo symbol={x.symbol} size={18} /><span className="text-[13px] font-bold" style={{ color: T.text }}>{x.symbol}</span></span>
                      <span className="truncate text-[11.5px]" style={{ color: T.text3 }}>{x.desc}</span>
                    </button>
                  ))}
                  {q && !extra.length && !core.some((c) => c.symbol.toUpperCase().includes(q)) && (
                    <div className="px-2.5 py-1.5 text-[12px]" style={{ color: T.text3 }}>{tx('Нічого не знайшов', 'Nothing found')}</div>
                  )}
                  <div className="mx-1 mt-1.5 rounded-lg px-2.5 py-2" style={{ background: T.sunken, border: `1px solid ${T.line}` }}>
                    <div className="text-[12px] leading-snug" style={{ color: T.text2 }}>{tx('Немає вашого активу? Будь ласка, напишіть нам у Telegram — додамо.', "Don't see your asset? Please message us on Telegram and we'll add it.")}</div>
                    <a href="https://t.me/thedgesupport" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold" style={{ background: act(0.14), color: ACT.tint }}>
                      <Send size={13} /> {tx('Написати в Telegram', 'Message on Telegram')}
                    </a>
                  </div>
                  {(sets || []).length > 0 && <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.text3 }}>{tx('Мої файли', 'My files')}</div>}
                </div>
              );
            })()}
            {(sets || []).map((s) => (
              <div key={s.symbol} className="group flex items-center gap-1 rounded-lg" style={{ background: s.symbol === symbol ? act(0.14) : 'transparent' }}>
                <button type="button" onClick={() => { setSymbol(s.symbol); setMenu(null); }} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                  <div className="text-[13.5px] font-bold" style={{ color: T.text }}>{s.symbol}</div>
                  <div className="truncate text-[11.5px]" style={{ color: T.text3, fontFamily: T.mono }}>
                    {fmtTime(s.from).slice(0, 10)} — {fmtTime(s.to).slice(0, 10)} · {s.n.toLocaleString(LOCALE)}
                  </div>
                </button>
                <button
                  type="button"
                  title={tx('Видалити з браузера', 'Remove from browser')}
                  onClick={() => removeSet(s.symbol)}
                  className="mr-1 grid h-8 w-8 place-items-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  style={{ color: T.text3 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!(remoteEnabled && catalog) && (
              <button type="button" onClick={pickFile} className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-semibold" style={{ color: ACT.tint }}>
                <UploadCloud size={15} /> {tx('Завантажити CSV з MT5', 'Load CSV from MT5')}
              </button>
            )}
          </Menu>
        </div>

        {/* Ще один інструмент у панелі під графіком — як «+» біля
            символу в TV. Та сама шкала часу і той самий реплей. */}
        <div className="relative">
          <ToolBtn
            title={tx('Додати графік іншого інструмента знизу', 'Add another symbol below')}
            onClick={() => setMenu(menu === 'link' ? null : 'link')}
            active={menu === 'link'}
            className="px-2"
          >
            <Plus size={16} />
          </ToolBtn>
          <Menu open={menu === 'link'} onClose={() => setMenu(null)} width={260}>
            {(() => {
              const have = new Set(linkedKeys);
              const srv = remoteEnabled && catalog ? (catalog.core || []).map((c) => REMOTE_PREFIX + c.symbol) : [];
              const mine = (sets || []).map((x) => x.symbol);
              const opts = [...srv, ...mine].filter((k) => k !== symbol);
              const full = linkedKeys.length >= MAX_LINKED;
              return (
                <>
                  <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.text3 }}>{tx('Графік знизу', 'Chart below')}</div>
                  <div className="px-2.5 pb-1.5 text-[12px] leading-snug" style={{ color: T.text3 }}>
                    {full
                      ? tx(`Максимум ${MAX_LINKED} графіки — прибери один хрестиком на панелі.`, `Up to ${MAX_LINKED} charts — remove one with the cross on its pane.`)
                      : tx('Та сама дата й таймфрейм, у реплеї — без майбутнього.', 'Same dates and timeframe; no future in replay.')}
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {opts.map((k) => {
                      const on = have.has(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={!on && full}
                          onClick={() => (on ? removeLinked(k) : addLinked(k))}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left disabled:opacity-40"
                          style={{ background: on ? act(0.14) : 'transparent' }}
                        >
                          <span className="text-[13.5px] font-bold" style={{ color: T.text }}>{remoteName(k)}</span>
                          {on ? <Check size={14} style={{ color: ACT.tint }} /> : <span className="text-[11px]" style={{ color: T.text3 }}>{isRemote(k) ? 'EDGE' : tx('мій файл', 'my file')}</span>}
                        </button>
                      );
                    })}
                    {!opts.length && <div className="px-2.5 py-2 text-[12.5px]" style={{ color: T.text3 }}>{tx('Інших інструментів поки немає.', 'No other symbols yet.')}</div>}
                  </div>
                </>
              );
            })()}
          </Menu>
        </div>
        <Divider />

        {/* Таймфрейми: кнопками — лише обрані (зірочка в списку), як у TV.
            Поточний, якщо він не в обраних, теж видно. На телефоні —
            тільки список. */}
        {(() => {
          const favs = Array.isArray(prefs.tfFav) && prefs.tfFav.length ? prefs.tfFav : DEFAULT_TF_FAV;
          const shown = TFS.filter((tf) => favs.includes(tf.id) || tf.id === st.tf);
          const toggleFav = (id) => {
            const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
            setPrefs({ ...prefs, tfFav: next.length ? next : [id] });
          };
          const GROUPS_TF = [['min', tx('Хвилини', 'Minutes')], ['hour', tx('Години', 'Hours')], ['day', tx('Дні', 'Days')]];
          return (
            <>
              {shown.map((tf) => (
                <ToolBtn key={tf.id} active={st.tf === tf.id} title={tx(tf.uk, tf.en)} onClick={() => setTf(tf.id)} className="hidden px-2 sm:flex">
                  {tf.label}
                </ToolBtn>
              ))}
              <div className="relative">
                <ToolBtn title={tx('Усі таймфрейми', 'All timeframes')} active={menu === 'tf'} onClick={() => setMenu(menu === 'tf' ? null : 'tf')} className="px-1.5">
                  <span className="sm:hidden">{tfLabel || '15m'}</span>
                  <ChevronDown size={14} />
                </ToolBtn>
                <Menu open={menu === 'tf'} onClose={() => setMenu(null)} width={220}>
                  <div className="max-h-[70vh] overflow-y-auto">
                    {GROUPS_TF.map(([g, name], gi) => (
                      <div key={g} className={gi ? 'mt-1 pt-1' : ''} style={gi ? { borderTop: `1px solid ${T.line}` } : undefined}>
                        <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.text3 }}>{name}</div>
                        {TFS.filter((tf) => tf.group === g).map((tf) => {
                          const on = st.tf === tf.id;
                          const fav = favs.includes(tf.id);
                          return (
                            <div key={tf.id} className="group/tf flex items-center rounded-lg" style={{ background: on ? act(0.22) : 'transparent' }}>
                              <button type="button" onClick={() => { setTf(tf.id); setMenu(null); }} className="min-w-0 flex-1 px-2.5 py-1.5 text-left text-[13.5px]" style={{ color: on ? '#fff' : T.text }}>
                                {tx(tf.uk, tf.en)}
                              </button>
                              <button
                                type="button"
                                title={fav ? tx('Прибрати з обраних', 'Remove from favorites') : tx('Додати в обрані', 'Add to favorites')}
                                onClick={() => toggleFav(tf.id)}
                                className={`mr-1 grid h-7 w-7 place-items-center rounded-md transition-opacity ${fav ? 'opacity-100' : 'opacity-30 group-hover/tf:opacity-80'}`}
                                style={{ color: T.text2 }}
                              >
                                <Star on={fav} size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </Menu>
              </div>
            </>
          );
        })()}
        <Divider />

        {/* Помітніше за решту кнопок: це вхід у цілий розділ, а не
            перемикач, і його мають знаходити з першого погляду. */}
        <ToolBtn
          title={tx('Індикатори', 'Indicators')}
          active={indOpen}
          onClick={() => setIndOpen(true)}
          disabled={!st.ready}
          className="!text-white"
        >
          <span className="grid h-6 w-6 place-items-center rounded-md text-[14px] italic" style={{ fontFamily: 'Georgia, serif', background: 'rgba(41,98,255,0.22)', color: '#8fb0ff' }}>ƒx</span>
          <span className="hidden md:inline">{tx('Індикатори', 'Indicators')}</span>
          {indCount > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold" style={{ background: 'rgba(41,98,255,0.25)', color: '#8fb0ff' }}>{indCount}</span>}
        </ToolBtn>
        <Divider />

        <ToolBtn
          active={st.replay || st.selecting}
          title={tx('Реплей: обери свічку, з якої почати', 'Replay: pick a starting candle')}
          onClick={() => (st.selecting ? eng()?.cancelSelect() : eng()?.startSelect())}
          disabled={!st.ready}
        >
          <Scissors size={16} /> <span className="hidden lg:inline">{tx('Реплей', 'Replay')}</span>
        </ToolBtn>

        <div className="relative hidden sm:block">
          <ToolBtn title={tx('Почати з дати', 'Start from date')} onClick={() => setMenu(menu === 'date' ? null : 'date')} active={menu === 'date'} disabled={!st.ready}>
            <CalendarDays size={16} />
          </ToolBtn>
          <Menu open={menu === 'date'} onClose={() => setMenu(null)} width={260}>
            <div className="p-2">
              <div className="text-[12px] font-semibold" style={{ color: T.text3 }}>{tx('Почати реплей з дати', 'Start replay at date')}</div>
              <input
                type="date"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
                className="mt-2 w-full rounded-lg px-2.5 py-2 text-[13px] outline-none"
                style={{ background: T.sunken, border: `1px solid ${T.line}`, color: T.text, colorScheme: 'dark' }}
              />
              <Button size="sm" block className="mt-2" disabled={!dateVal} onClick={() => goDate('replay')}>
                {tx('Почати', 'Start')}
              </Button>
            </div>
          </Menu>
        </div>

        <ToolBtn className="hidden sm:flex" title={tx('Скинути масштаб (Alt+R)', 'Reset chart (Alt+R)')} onClick={() => eng()?.resetView()} disabled={!st.ready}>
          <RotateCcw size={15} />
        </ToolBtn>

        <div className="flex-1" />

        {/* Бектест, у який пишуться угоди */}
        <div className="relative">
          <ToolBtn title={tx('Куди записувати угоди', 'Where trades are saved')} onClick={() => setMenu(menu === 'sess' ? null : 'sess')} active={menu === 'sess'}>
            <CircleDot size={14} style={{ color: currentSession ? T.ok : T.text3 }} />
            <span className="hidden max-w-[180px] truncate lg:inline">{currentSession?.name || (demo ? tx('Демо', 'Demo') : tx('Без запису', 'Not saving'))}</span>
            <ChevronDown size={14} />
          </ToolBtn>
          <Menu open={menu === 'sess'} onClose={() => setMenu(null)} align="right" width={280}>
            <div className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-semibold" style={{ color: T.text3 }}>{tx('Записувати угоди в бектест', 'Save trades to backtest')}</div>
            <div className="max-h-[300px] overflow-y-auto">
              {sessions.map((s) => (
                <button key={s.id} type="button" onClick={() => chooseSession(s.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]" style={{ color: T.text, background: s.id === sessionId ? act(0.14) : 'transparent' }}>
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="text-[11px]" style={{ color: T.text3, fontFamily: T.mono }}>{s.pair}</span>
                  {s.id === sessionId && <Check size={14} style={{ color: ACT.tint }} />}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => chooseSession('')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px]" style={{ color: T.text2 }}>
              {tx('Не записувати (тренування)', 'Don’t save (practice)')}
            </button>
          </Menu>
        </div>
        <ToolBtn title={tx('Налаштування графіка', 'Chart settings')} onClick={() => setSettingsOpen(true)}>
          <Settings2 size={16} />
        </ToolBtn>
        <ToolBtn className="hidden md:flex" title={tx('Другий таймфрейм поруч', 'Second timeframe side by side')} active={!!prefs.mtf?.on} onClick={() => setPrefs({ ...prefs, mtf: { tf: 'H4', ...(prefs.mtf || {}), on: !prefs.mtf?.on } })}>
          <Columns2 size={16} />
        </ToolBtn>
        <ToolBtn className="hidden md:flex" title={tx('Панель угоди', 'Trade panel')} active={prefs.panel} onClick={() => setPrefs({ ...prefs, panel: !prefs.panel })}>
          <PanelRight size={16} />
        </ToolBtn>
        <ToolBtn className="hidden sm:flex" title={tx('На весь екран', 'Fullscreen')} onClick={fullscreen}>
          <Maximize2 size={15} />
        </ToolBtn>
      </div>

      <div className="flex min-h-0 flex-1">
        {st.ready && <DrawingToolbar st={drawSt} act={drawAct} />}
        {/* ─────────── Графік ─────────── */}
        <div ref={chartWrapRef} className="relative min-w-0 flex-1 overflow-hidden" style={{ background: prefs.bg }}>
          <div ref={boxRef} className="edge-chart-host absolute inset-x-0 top-0" style={{ bottom: barWanted ? 44 : 0 }} data-selecting={st.selecting ? '1' : ''} />
          {st.ready && drawSt.favBar && (
            <FavoritesBar
              favs={drawSt.favs}
              tool={draw.tool || drawSt.cursor}
              pos={prefs.favPos}
              host={chartWrapRef}
              onPick={(id) => {
                /* Курсори — окремий режим, не інструмент малювання. */
                const cur = (GROUPS.find((g) => g.id === 'cursor')?.items || []);
                if (id && cur.includes(id)) drawAct.cursor(id);
                else if (!id && cur.includes(draw.tool || drawSt.cursor)) { /* курсор лишається */ }
                else drawAct.tool(id);
              }}
              onMove={(p) => setPrefs({ ...prefs, favPos: p })}
              onClose={() => setPrefs({ ...prefs, favBar: false })}
            />
          )}
          <style>{CURSOR_CSS}</style>
          {selDraw && !drawEdit && (
            <DrawingFloatBar
              d={selDraw}
              host={boxRef}
              pos={prefs.floatPos}
              onMove={(p) => setPrefs({ ...prefs, floatPos: p })}
              onFront={() => dmRef.current?.toFront(selDraw.id)}
              onBack={() => dmRef.current?.toBack(selDraw.id)}
              onSaveDefault={() => saveStyleDefault(selDraw)}
              onResetDefault={() => resetStyleDefault(selDraw)}
              onStyle={(patch) => dmRef.current?.update(selDraw.id, (d) => ({ style: { ...d.style, ...patch } }))}
              onPatch={(patch) => dmRef.current?.update(selDraw.id, patch)}
              onSettings={() => setDrawEdit(selDraw.id)}
              onClone={() => dmRef.current?.clone(selDraw.id)}
              onDelete={() => dmRef.current?.remove(selDraw.id)}
            />
          )}
          <svg ref={ovRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 3 }} />

          {/* Правий клік — меню, як у TV: по малюнку — дії з ним, по
              порожньому місцю — меню графіка (ціна під курсором, ордери,
              реплей звідси, дерево об'єктів, прибирання). */}
          {ctxMenu && (() => {
            const dm = dmRef.current;
            const en = eng();
            if (!dm || !en) return null;
            const run = (fn) => (e) => { e.stopPropagation(); setCtxMenu(null); fn(); };
            let items;
            if (ctxMenu.chart) {
              const p = ctxMenu.price;
              const pt = { t: ctxMenu.t, p };
              const ps = p == null ? '' : fmtNum(p, d);
              const name = remoteName(symbol);
              const canTrade = st.replay && !st.pos && !st.order && !st.snap && p != null;
              const kindOf = (side) => (en.orderKind(side, p) === 'limit' ? 'Limit' : 'Stop');
              const order = (side) => { en.setDraft({ side, type: 'pending', entry: p }); en.confirmDraft(); };
              const nDraw = dm.list.length;
              const nInd = (prefs.indicators || []).length;
              items = [
                ['undo', tx('Скинути стан графіка', 'Reset chart'), () => en.resetView(), 'Alt+R'],
                '-',
                ['clone', `${tx('Копіювати ціну', 'Copy price')} ${ps}`, () => { navigator.clipboard?.writeText(ps).catch(() => {}); notify.success?.(tx('Скопійовано', 'Copied'), ps); }, null, p == null],
                ['paste', tx('Вставити', 'Paste'), () => dm.paste(pt), 'Ctrl+V', !dm.clip || st.snap],
                '-',
                ['buy', `${tx('Купити', 'Buy')} ${name} ${canTrade ? kindOf('LONG') : ''} @ ${ps}`, () => order('LONG'), null, !canTrade],
                ['sell', `${tx('Продати', 'Sell')} ${name} ${canTrade ? kindOf('SHORT') : ''} @ ${ps}`, () => order('SHORT'), null, !canTrade],
                ['scissors', tx('Почати реплей звідси', 'Start replay from here'), () => en.startAtX(ctxMenu.x), null, !!st.snap],
                '-',
                ['hline', `${tx('Горизонтальна лінія', 'Horizontal line')} ${ps}`, () => dm.addAt('hline', pt), 'Alt+H', p == null || st.snap],
                ['vline', tx('Вертикальна лінія тут', 'Vertical line here'), () => dm.addAt('vline', pt), 'Alt+V', !!st.snap],
                '-',
                ['tree', tx("Дерево об'єктів", 'Object tree'), () => setTreeOpen(true)],
                [prefs.drawHide ? 'eye' : 'eyeoff', prefs.drawHide ? tx('Показати малюнки', 'Show drawings') : tx('Сховати малюнки', 'Hide drawings'), () => drawAct.hide()],
                '-',
                ['trash', tx(`Видалити ${nDraw} обʼєкт(ів) малювання`, `Remove ${nDraw} drawing(s)`), () => dm.removeAll(), null, !nDraw || st.snap, true],
                ['trash', tx(`Видалити ${nInd} індикатор(ів)`, `Remove ${nInd} indicator(s)`), () => setIndicators([]), null, !nInd, true],
                '-',
                ['gear', tx('Налаштування…', 'Settings…'), () => setSettingsOpen(true)],
              ];
            } else {
              const cd = dm.list.find((x) => x.id === ctxMenu.id);
              if (!cd) return null;
              items = [
                ['gear', tx('Налаштування…', 'Settings…'), () => setDrawEdit(cd.id)],
                ['clone', tx('Копія', 'Clone'), () => dm.clone(cd.id)],
                ['copy', tx('Копіювати', 'Copy'), () => dm.copy(cd.id), 'Ctrl+C'],
                '-',
                ['front', tx('На передній план', 'Bring to front'), () => dm.toFront(cd.id)],
                ['back', tx('На задній план', 'Send to back'), () => dm.toBack(cd.id)],
                [cd.locked ? 'unlock' : 'lock', cd.locked ? tx('Розблокувати', 'Unlock') : tx('Заблокувати', 'Lock'), () => dm.update(cd.id, { locked: !cd.locked })],
                ['eyeoff', tx('Сховати', 'Hide'), () => { dm.update(cd.id, { hidden: true }); dm.select(null); }],
                ['template', tx('Зберегти стиль як типовий', 'Save style as default'), () => saveStyleDefault(cd)],
                '-',
                ['trash', tx('Видалити', 'Remove'), () => dm.remove(cd.id), 'Del', false, true],
              ];
            }
            const box = boxRef.current?.getBoundingClientRect();
            const W = ctxMenu.chart ? 330 : 270;
            const H = items.reduce((a, it) => a + (it === '-' ? 9 : 32), 12);
            const left = Math.max(4, Math.min(ctxMenu.x, (box?.width || 9999) - W - 8));
            const top = Math.max(4, Math.min(ctxMenu.y, (box?.height || 9999) - H - 8));
            return (
              <div
                role="menu"
                className="absolute z-[30] rounded-xl p-1.5"
                style={{ left, top, width: W, background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 14px 34px rgba(0,0,0,0.45)', animation: 'edgeFly .12s ease-out' }}
                onPointerDown={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()}
              >
                {items.map((it, i) => (it === '-'
                  ? <div key={`s${i}`} className="mx-2 my-1 h-px" style={{ background: T.line }} />
                  : (
                    <button
                      key={`${it[1]}${i}`}
                      type="button"
                      role="menuitem"
                      disabled={!!it[4]}
                      onClick={run(it[2])}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                      style={{ color: it[5] ? '#f23645' : T.text }}
                    >
                      <DrawIcon id={it[0]} size={18} />
                      <span className="min-w-0 flex-1 truncate">{it[1]}</span>
                      {it[3] && <span className="shrink-0 text-[11px] opacity-50" style={{ fontFamily: T.mono }}>{it[3]}</span>}
                    </button>
                  )))}
              </div>
            );
          })()}

          {/* Дерево обʼєктів: усі малюнки інструмента — показати,
              сховати, заблокувати, видалити, перейти до малюнка. */}
          {treeOpen && (() => {
            const dm = dmRef.current;
            if (!dm) return null;
            const list = [...dm.list].reverse();
            const upd = () => setTreeTick((v) => v + 1);
            return (
              <div className="absolute right-3 top-14 z-[28] flex max-h-[70%] w-[320px] flex-col rounded-xl" style={{ background: T.surface3, border: `1px solid ${T.lineHi}`, boxShadow: '0 14px 34px rgba(0,0,0,0.45)', animation: 'edgeFly .14s ease-out' }} onPointerDown={(e) => e.stopPropagation()} data-tick={treeTick}>
                <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                  <span className="text-[13px] font-semibold" style={{ color: T.text }}>{tx("Дерево обʼєктів", 'Object tree')} <span style={{ color: T.text3 }}>· {list.length}</span></span>
                  <button type="button" onClick={() => setTreeOpen(false)} className="grid h-7 w-7 place-items-center rounded-md hover:bg-white/10" style={{ color: T.text2 }} aria-label={tx('Закрити', 'Close')}><X size={15} /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {!list.length && <p className="px-2 py-3 text-[12.5px]" style={{ color: T.text3 }}>{tx('Малюнків немає', 'No drawings')}</p>}
                  {list.map((x) => {
                    const sel = dm.sel === x.id;
                    const label = (x.text && String(x.text).trim()) ? `${itemName(x.type)} · ${String(x.text).trim().slice(0, 24)}` : itemName(x.type);
                    const Btn = ({ icon, title, on, onClick, danger }) => (
                      <button type="button" title={title} aria-label={title} onClick={(e) => { e.stopPropagation(); onClick(); upd(); }} className="grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-white/10" style={{ color: danger ? '#f23645' : on ? '#5b8cff' : T.text3 }}>
                        <DrawIcon id={icon} size={17} />
                      </button>
                    );
                    return (
                      <div key={x.id} role="button" tabIndex={0} onClick={() => { dm.reveal(x.id); upd(); }} className="group/ot flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5" style={{ background: sel ? 'rgba(41,98,255,0.16)' : undefined, opacity: x.hidden ? 0.5 : 1 }}>
                        <span style={{ color: x.style?.color || T.text2 }}><DrawIcon id={x.type} size={18} /></span>
                        <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: T.text }}>{label}</span>
                        <Btn icon={x.hidden ? 'eyeoff' : 'eye'} title={x.hidden ? tx('Показати', 'Show') : tx('Сховати', 'Hide')} on={!x.hidden} onClick={() => dm.update(x.id, { hidden: !x.hidden })} />
                        <Btn icon={x.locked ? 'lock' : 'unlock'} title={x.locked ? tx('Розблокувати', 'Unlock') : tx('Заблокувати', 'Lock')} on={x.locked} onClick={() => dm.update(x.id, { locked: !x.locked })} />
                        <Btn icon="trash" title={tx('Видалити', 'Remove')} danger onClick={() => dm.remove(x.id)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Ручки SL / TP — тягнуться мишкою, як на позиції в TV. */}
          {[['tp', tpRef], ['sl', slRef], ['entry', enRef], ['width', wRef]].map(([key, ref]) => (
            <div
              key={key}
              ref={ref}
              onPointerDown={startDrag(key)}
              className={`absolute left-0 top-0 z-10 hidden h-[10px] w-[10px] ${key === 'width' ? 'cursor-ew-resize' : 'cursor-ns-resize'}`}
              style={{
                borderRadius: key === 'entry' || key === 'width' ? '50%' : 2,
                background: prefs.bg || '#0b0b0d',
                border: '1.5px solid #2962ff',
                boxShadow: '0 0 0 3px rgba(41,98,255,0.18)',
                touchAction: 'none',
              }}
              title={key === 'sl' ? tx('Тягни — стоп', 'Drag — stop') : key === 'tp' ? tx('Тягни — тейк', 'Drag — target') : key === 'entry' ? tx('Тягни — ціна входу (стане відкладеним ордером)', 'Drag — entry (becomes a pending order)') : tx('Тягни — ширина рамки', 'Drag — box width')}
            />
          ))}

          {/* Редагування тексту прямо на графіку (як у TV). */}
          {textEdit && (() => {
            const dm = dmRef.current;
            const dd = dm?.list.find((x) => x.id === textEdit);
            if (!dd) return null;
            const pt = dd.type === 'note' && dd.pts[1] ? dd.pts[1] : dd.pts[0];
            const x = dm.x(pt.t); const y = dm.y(pt.p);
            if (x == null || y == null) return null;
            const fs = dd.style?.fontSize || 14;
            const done = (val) => {
              const v = String(val ?? '').replace(/\s+$/, '');
              setTextEdit(null);
              if (!v.trim()) dm.remove(dd.id);
              else dm.update(dd.id, { text: v });
            };
            return (
              <textarea
                key={dd.id}
                autoFocus
                defaultValue={dd.text || ''}
                placeholder={tx('Текст', 'Text')}
                rows={Math.max(1, String(dd.text || '').split('\n').length)}
                onBlur={(e) => done(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') { e.preventDefault(); done(e.currentTarget.value); }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(e.currentTarget.value); }
                }}
                onInput={(e) => { e.currentTarget.rows = Math.max(1, e.currentTarget.value.split('\n').length); }}
                className="absolute z-[13] resize-none overflow-hidden rounded-sm bg-transparent p-0 outline-none"
                style={{
                  left: dd.type === 'note' ? x - 60 : x,
                  top: y - fs - 1,
                  minWidth: 60,
                  width: Math.max(60, Math.max(...String(dd.text || 'Текст').split('\n').map((l) => l.length)) * fs * 0.62 + 24),
                  font: `${dd.style?.bold ? 700 : 400} ${fs}px -apple-system,BlinkMacSystemFont,'Trebuchet MS',Roboto,sans-serif`,
                  lineHeight: 1.3,
                  color: dd.style?.textColor || '#2962ff',
                  border: '1px solid #2962ff',
                  boxShadow: '0 0 0 2px rgba(41,98,255,0.18)',
                  background: prefs.bg,
                }}
              />
            );
          })()}

          {/* Виділено кілька малюнків рамкою (Ctrl + тягнути). */}
          {multiN > 1 && (
            <div className="absolute left-1/2 top-3 z-[12] flex -translate-x-1/2 items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] font-semibold shadow-lg" style={{ background: 'rgba(24,25,31,0.95)', border: '1px solid rgba(41,98,255,0.5)', color: '#e8eaf0' }}>
              {tx(`Виділено: ${multiN}`, `Selected: ${multiN}`)}
              <button type="button" onClick={() => dmRef.current?.removeMulti()} className="rounded-md px-2 py-0.5 text-white" style={{ background: '#f23645' }}>{tx('Видалити', 'Delete')} (Del)</button>
              <button type="button" onClick={() => dmRef.current?.setMulti(null)} className="rounded-md px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.1)' }}>Esc</button>
            </div>
          )}

          {/* Кнопки біля рамки угоди (або виділеної закритої угоди). */}
          {(st.draft || st.order || st.pos || st.selClosed) && (
            <div
              ref={qbRef}
              className="absolute left-0 top-0 z-[11] flex items-center gap-1 rounded-lg p-1 shadow-lg"
              style={{ visibility: 'hidden', background: 'rgba(24,25,31,0.94)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 22px rgba(0,0,0,0.4)' }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const B = ({ onClick, bg, children, title }) => (
                  <button type="button" title={title} onClick={onClick} className="whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-bold text-white transition-transform active:scale-95" style={{ background: bg || 'rgba(255,255,255,0.1)' }}>{children}</button>
                );
                if (st.pos) {
                  return (
                    <>
                      <B onClick={() => eng()?.moveToBE()} title={tx('Стоп у беззбиток', 'Stop to breakeven')}>BE</B>
                      <B onClick={() => eng()?.closePosition('manual')} bg={st.pos.r >= 0 ? '#089981' : '#f23645'}>{tx('Закрити', 'Close')} {fmtR(st.pos.r)}</B>
                    </>
                  );
                }
                if (st.order) {
                  return <B onClick={() => eng()?.cancelOrder()}>{tx('Скасувати ордер', 'Cancel order')}</B>;
                }
                if (st.draft) {
                  const long = st.draft.side === 'LONG';
                  const kind = st.draft.type === 'market' ? tx('по ринку', 'market') : (eng()?.orderKind(st.draft.side, st.draft.entry) === 'limit' ? 'Limit' : 'Stop');
                  return (
                    <>
                      <B onClick={() => eng()?.confirmDraft()} bg={long ? '#2962ff' : '#f23645'} title="Shift+B / Shift+S">{long ? 'Buy' : 'Sell'} {kind}</B>
                      <B onClick={() => eng()?.setDraft(null)} title="Esc">✕</B>
                    </>
                  );
                }
                const t = closed.find((c) => c.id === st.selClosed);
                return t ? <B onClick={() => deleteTrade(t)} bg="#f23645">{tx('Видалити угоду', 'Delete trade')}</B> : null;
              })()}
            </div>
          )}

          {/* Рядок статусу — лише те, що ввімкнено в налаштуваннях.
              За замовчуванням графік чистий. */}
          {st.ready && legend && (prefs.stTitle || prefs.stOhlc || prefs.stChange) && (
            <div className="pointer-events-none absolute left-3 top-2 z-[5] flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ fontFamily: T.mono, color: prefs.text, fontSize: prefs.fontSize + 1 }}>
              {prefs.stTitle && <span className="font-bold" style={{ fontFamily: T.sans }}>{remoteName(symbol)} · {tfLabel}</span>}
              {prefs.stOhlc && [['O', legend.open], ['H', legend.high], ['L', legend.low], ['C', legend.close]].map(([k, v]) => (
                <span key={k}>{k} <span style={{ color: legendUp ? prefs.up : prefs.down }}>{fmtNum(v, d)}</span></span>
              ))}
              {prefs.stChange && (
                <span style={{ color: chg >= 0 ? prefs.up : prefs.down }}>
                  {chg >= 0 ? '+' : ''}{fmtNum(chg, d)} ({legend.prev ? ((chg / legend.prev) * 100).toFixed(2) : '0.00'}%)
                </span>
              )}
            </div>
          )}

          {/* Кнопки Buy / Sell на графіку — як у TV, вмикаються в «Рядку статусу». */}
          {st.ready && prefs.stButtons && (
            <div
              className="absolute left-3 z-[6] flex overflow-hidden rounded-md text-white shadow-md"
              style={{ top: prefs.stTitle || prefs.stOhlc || prefs.stChange ? 30 : 10, fontFamily: T.mono }}
            >
              {pos ? (
                <button type="button" onClick={() => eng()?.closePosition('manual')} className="px-3 py-1 text-left text-[12px] font-bold" style={{ background: pos.r >= 0 ? '#089981' : '#f23645' }}>
                  {tx('Закрити', 'Close')} {fmtR(pos.r)}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => openPos('SHORT')} className="px-3 py-1 text-left leading-tight transition-[filter] hover:brightness-110" style={{ background: '#f23645' }}>
                    <span className="block text-[13px] font-bold">{fmtNum(st.price, d)}</span>
                    <span className="block text-[10px] font-semibold tracking-wider opacity-90">SELL</span>
                  </button>
                  <button type="button" onClick={() => openPos('LONG')} className="px-3 py-1 text-right leading-tight transition-[filter] hover:brightness-110" style={{ background: '#2962ff' }}>
                    <span className="block text-[13px] font-bold">{fmtNum(st.price, d)}</span>
                    <span className="block text-[10px] font-semibold tracking-wider opacity-90">BUY</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* «L» і «%» — логарифмічна шкала й шкала у відсотках, як у TV. */}
          {st.ready && (() => {
            const ch = eng()?.chart;
            const w = ch ? ch.priceScale('right').width() : 0;
            const h = ch ? ch.timeScale().height() : 0;
            if (!w || !h) return null;
            const mode = st.scaleMode || 'normal';
            const set = (m) => { const next = mode === m ? 'normal' : m; eng()?.setScaleMode(next); setPrefs({ ...prefs, scaleMode: next }); };
            return (
              <div className="absolute bottom-0 z-[6] flex items-center gap-1 pr-1" style={{ right: w, height: h }}>
                {[['pct', '%', tx('Шкала у відсотках', 'Percent scale')], ['log', 'L', tx('Логарифмічна шкала', 'Log scale')]].map(([m, lbl, title]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set(m)}
                    title={title}
                    aria-pressed={mode === m}
                    className="grid h-[20px] min-w-[22px] place-items-center rounded px-1 text-[11px] font-bold transition-colors"
                    style={{ color: mode === m ? '#fff' : prefs.text, background: mode === m ? '#2962ff' : 'transparent', border: mode === m ? 'none' : `1px solid ${prefs.scaleLine || 'rgba(128,128,128,0.4)'}`, opacity: mode === m ? 1 : 0.7 }}
                  >{lbl}</button>
                ))}
              </div>
            );
          })()}

          {/* «A» — автомасштаб ціни, як у TV: у куті між шкалами. Гасне,
              коли графік потягли вгору-вниз або тягнули шкалу ціни. */}
          {st.ready && (() => {
            const ch = eng()?.chart;
            const w = ch ? ch.priceScale('right').width() : 0;
            const h = ch ? ch.timeScale().height() : 0;
            if (!w || !h) return null;
            const on = st.autoScale !== false;
            return (
              <button
                type="button"
                onClick={() => eng()?.setAutoScale(!on)}
                title={on ? tx('Автомасштаб увімкнено', 'Auto scale on') : tx('Увімкнути автомасштаб (Alt+R — скинути все)', 'Enable auto scale (Alt+R resets all)')}
                aria-pressed={on}
                className="absolute bottom-0 right-0 z-[6] grid place-items-center"
                style={{ width: w, height: h }}
              >
                <span
                  className="grid h-[20px] min-w-[22px] place-items-center rounded px-1 text-[11px] font-bold transition-colors"
                  style={{ color: on ? '#fff' : prefs.text, background: on ? '#2962ff' : 'transparent', border: on ? 'none' : `1px solid ${prefs.scaleLine || 'rgba(128,128,128,0.4)'}` }}
                >A</span>
              </button>
            );
          })()}

          {/* Легенда індикаторів — під рядком статусу і кнопками, як у TV. */}
          {st.ready && (
            <IndicatorLegend
              config={prefs.indicators || []}
              im={imRef.current}
              k={legend?.k ?? engRef.current?.lastK ?? 0}
              digits={d}
              prefs={prefs}
              tfId={st.tf}
              top={(() => {
                const status = prefs.stTitle || prefs.stOhlc || prefs.stChange;
                if (prefs.stButtons) return (status ? 30 : 10) + 44;
                return status ? 28 : 6;
              })()}
              onChange={setIndicators}
              onSettings={(id) => setIndEdit(id)}
            />
          )}

          {/* Економічні новини внизу графіка (лише ті, що вже вийшли). */}
          {st.ready && prefs.news !== false && loadedSym && (
            <NewsMarks eng={eng} prefs={prefs} symbol={remoteName(loadedSym)} />
          )}

          {/* Підписи панелей з іншими інструментами. */}
          {st.ready && linkedSt.length > 0 && (
            <LinkedLegend
              lp={lpRef.current}
              chart={engRef.current?.chart}
              items={linkedSt}
              prefs={prefs}
              tfLabel={tfLabel}
              onRemove={removeLinked}
              sideKey={prefs.mtf?.on ? prefs.mtf.sym || null : null}
              onSide={(key) => {
                const cur = prefs.mtf || {};
                const same = cur.on && cur.sym === key;
                setPrefs({ ...prefs, mtf: { tf: 'H4', ...cur, on: !same, sym: same ? null : key } });
              }}
            />
          )}

          {/* Посилання на бібліотеку, коли логотип прибрано, а панелі
              угоди немає (у панелі воно своє). Умова ліцензії. */}
          {/* Атрибуція бібліотеки (умова ліцензії) — на сторінці «Умови». */}

          {/* Порожньо / вантажиться */}
          {sets && !hasSets && !(remoteEnabled && catalog) && importing == null && (
            <div className="absolute inset-0 z-20" style={{ background: T.bg }}>
              <ImportCandles onFile={onFile} />
            </div>
          )}
          {(sets === null || loadingSet) && (hasSets !== false || (remoteEnabled && catalog)) && importing == null && (
            <div className="absolute inset-0 z-20 grid place-items-center" style={{ background: srvStatus === 'request' || srvStatus === 'wait' ? T.bg : 'transparent' }}>
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin" style={{ color: ACT.tint }} />
                {(srvStatus === 'request' || srvStatus === 'wait') && (
                  <div className="max-w-[280px] text-center text-[13px]" style={{ color: T.text3 }}>
                    {tx('Готую історію на сервері — перший раз для цього інструмента це до хвилини.', 'Preparing history on the server — the first time for this symbol takes up to a minute.')}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Догружаємо старіші місяці — маленька плашка зліва, графік не блокуємо. */}
          {(srvStatus === 'older' || (srvStatus === 'wait' && !loadingSet)) && (
            <div className="pointer-events-none absolute bottom-10 left-3 z-[7] flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold" style={{ background: T.surface, border: `1px solid ${T.line}`, color: T.text2 }}>
              <Loader2 size={13} className="animate-spin" style={{ color: ACT.tint }} />
              {srvStatus === 'wait' ? tx('Сервер готує старішу історію…', 'Server is preparing older history…') : tx('Догружаю історію…', 'Loading more history…')}
            </div>
          )}
          {importing != null && <ImportProgress progress={importing} />}

          {/* Підказка ножиць */}
          {st.selecting && (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: '#2962ff' }}>
              {tx('Клікни на свічку, з якої почати реплей', 'Click the candle to start replay from')}
            </div>
          )}

          {/* Знімок угоди: плашка зверху. */}
          {st.snap && (() => {
            const t = closed.find((x) => x.id === st.snap.id);
            if (!t) return null;
            const long = t.side === 'LONG';
            const seg = (on) => ({ background: on ? '#2962ff' : 'transparent', color: on ? '#fff' : T.text2 });
            return (
              <div className="absolute left-1/2 top-2 z-[25] flex w-max max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5 text-[12.5px]" style={{ background: T.surface3, border: '1px solid rgba(41,98,255,0.55)', boxShadow: '0 12px 32px rgba(0,0,0,0.45)', animation: 'edgeFly .16s ease-out' }}>
                <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: '#2962ff' }}>{tx('Знімок', 'Snapshot')}</span>
                <span className="font-bold" style={{ color: long ? '#5b8cff' : '#f23645' }}>{long ? 'Buy' : 'Sell'}</span>
                <span className="font-bold tabular-nums" style={{ fontFamily: T.mono, color: t.result === 'BE' ? T.text2 : t.r > 0 ? T.ok : T.bad }}>{t.result === 'BE' ? 'BE' : fmtR(t.r)}</span>
                <span className="tabular-nums" style={{ fontFamily: T.mono, color: T.text3 }}>{fmtStamp(st.snap.which === 'entry' ? t.entryT : t.exitT, prefs)}</span>
                <span className="flex overflow-hidden rounded-lg" style={{ border: `1px solid ${T.line}` }}>
                  <button type="button" onClick={() => eng()?.openSnap(t.id, 'entry', false)} className="px-2 py-1 font-semibold" style={seg(st.snap.which === 'entry' && !st.snap.after)}>{tx('На вході', 'At entry')}</button>
                  <button type="button" onClick={() => eng()?.openSnap(t.id, 'exit', false)} className="px-2 py-1 font-semibold" style={seg(st.snap.which === 'exit' && !st.snap.after)}>{tx('На виході', 'At exit')}</button>
                  <button type="button" onClick={() => eng()?.openSnap(t.id, 'exit', true)} className="px-2 py-1 font-semibold" style={seg(st.snap.after)} title={tx('Свічки після угоди — але не далі, ніж ти дійшов у реплеї', 'Candles after the trade — but no further than your replay')}>{tx('Що було далі', 'What happened next')}</button>
                </span>
                {!(st.snap.which === 'entry' ? st.snap.hasEntry : st.snap.hasExit) && (
                  <span className="text-[11px]" style={{ color: T.warn }}>{tx('малюнків на цей момент не збережено', 'no drawings saved for this moment')}</span>
                )}
                {t.note && <span className="max-w-[220px] truncate text-[12px]" style={{ color: T.text2 }} title={t.note}>“{t.note}”</span>}
                <button type="button" onClick={closeSnap} className="flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold transition-colors hover:bg-white/10" style={{ color: T.text }} title="Ctrl+Alt+D / Esc">
                  <X size={14} /> {tx('Закрити', 'Close')} <span className="text-[10.5px] opacity-50" style={{ fontFamily: T.mono }}>Ctrl+Alt+D</span>
                </button>
              </div>
            );
          })()}

          {/* Панель реплею */}
          {(barWanted || barMounted) && (
            <div
              className="absolute inset-x-0 bottom-0 z-20 flex h-11 items-center justify-center gap-1 overflow-visible px-2"
              style={{ background: T.surface, borderTop: `1px solid ${T.line}`, animation: barWanted ? 'edgeBarIn .18s ease-out' : 'edgeBarOut .16s ease-in forwards', pointerEvents: barWanted ? undefined : 'none' }}
            >
              <style>{RB_CSS}</style>
              <span className="flex items-center">
                <ToolBtn title={tx('Обрати іншу точку', 'Pick another point')} active={st.selecting} onClick={() => (st.selecting ? eng()?.cancelSelect() : eng()?.startSelect())}>
                  <Scissors size={16} />
                </ToolBtn>
              </span>
              <span className="flex items-center">
                <ToolBtn title={tx('Крок назад (Shift+←)', 'Step back (Shift+←)')} onClick={() => eng()?.stepBack()} disabled={!st.replay || !st.canBack}>
                  <SkipBack size={17} />
                </ToolBtn>
              </span>
              <span className="flex items-center">
                <ToolBtn title={st.playing ? tx('Пауза (Shift+↓)', 'Pause (Shift+↓)') : tx('Пуск (Shift+↓)', 'Play (Shift+↓)')} onClick={togglePlay} disabled={!st.replay || st.atEnd}>
                  {st.playing ? <Pause size={17} /> : <Play size={17} />}
                </ToolBtn>
              </span>
              <span className="flex items-center">
                <ToolBtn title={tx('Крок вперед (Shift+→)', 'Step forward (Shift+→)')} onClick={() => { eng()?.pause(); eng()?.step(true); }} disabled={!st.replay || st.atEnd}>
                  <SkipForward size={17} />
                </ToolBtn>
              </span>
              <span className="flex items-center">
                <div className="relative">
                  <ToolBtn title={tx('Стрибнути вперед', 'Jump forward')} onClick={() => setMenu(menu === 'jump' ? null : 'jump')} active={menu === 'jump'} disabled={!st.replay || st.atEnd}>
                    <FastForward size={16} /><ChevronDown size={13} />
                  </ToolBtn>
                  {menu === 'jump' && (
                    <div className={`absolute z-50 bottom-[calc(100%+6px)] left-0 w-[230px] rounded-xl p-1`} style={{ background: T.surface3, border: `1px solid ${T.lineHi}` }}>
                      {[
                        [tx('+10 свічок', '+10 bars'), () => eng()?.jumpBars(10)],
                        [tx('+50 свічок', '+50 bars'), () => eng()?.jumpBars(50)],
                        [tx('До наступного дня', 'To next day'), () => eng()?.jumpDay()],
                        [tx('До відкриття Азії', 'To Asia open'), () => eng()?.jumpSession('Asia')],
                        [tx('До відкриття Лондона', 'To London open'), () => eng()?.jumpSession('London')],
                        [tx('До відкриття Нью-Йорка', 'To New York open'), () => eng()?.jumpSession('New York')],
                      ].map(([label, fn]) => (
                        <button key={label} type="button" onClick={() => { setMenu(null); fn(); }} className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-white/10" style={{ color: T.text }}>{label}</button>
                      ))}
                      <p className="px-3 pb-1 pt-1.5 text-[11px] leading-snug" style={{ color: T.text3 }}>{tx('Якщо дорогою спрацює ордер чи закриється угода — зупинюсь на тій свічці.', 'Stops at the candle where an order fills or a trade closes.')}</p>
                    </div>
                  )}
                </div>
              </span>
              <span className="flex items-center">
                <div className="relative">
                  <ToolBtn title={tx('Крок перемотки: на скільки рухається графік за один крок', 'Replay step: how far one step moves')} onClick={() => setMenu(menu === 'step' ? null : 'step')} active={menu === 'step' || !!stepTf}>
                    <span className="text-[11px]" style={{ color: T.text3 }}>{tx('крок', 'step')}</span>
                    <span style={{ fontFamily: T.mono }}>{stepLabel(stepTf)}</span>
                  </ToolBtn>
                  {menu === 'step' && (
                    <div className={`absolute z-50 bottom-[calc(100%+6px)] left-0 w-[210px] rounded-xl p-1`} style={{ background: T.surface3, border: `1px solid ${T.lineHi}` }}>
                      <p className="px-3 pb-1 pt-1.5 text-[11px] leading-snug" style={{ color: T.text3 }}>{tx('Крок перемотки', 'Replay step')}</p>
                      {STEP_TFS.map((id) => (
                        <button key={id || 'tf'} type="button" onClick={() => setStepTf(id)} className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px]" style={{ color: id === stepTf ? '#fff' : T.text2, background: id === stepTf ? act(0.3) : 'transparent' }}>
                          <span>{id ? tx(tfById(id).uk, tfById(id).en) : tx('Як на графіку', 'Chart timeframe')}</span>
                          <span style={{ fontFamily: T.mono, color: T.text3 }}>{id ? tfById(id).label : tfById(st.tf || prefs.tf || 'H1').label}</span>
                        </button>
                      ))}
                      <p className="px-3 pb-1 pt-1.5 text-[11px] leading-snug" style={{ color: T.text3 }}>{tx('Наприклад, на 1H з кроком 15m свічка росте по чверті години. Діє на «Пуск» і «Крок вперед».', 'E.g. on 1H with a 15m step the candle grows a quarter-hour at a time. Applies to Play and Step.')}</p>
                    </div>
                  )}
                </div>
              </span>
              <span className="flex items-center">
                <div className="relative">
                  <ToolBtn title={tx('Швидкість', 'Speed')} onClick={() => setMenu(menu === 'speed' ? null : 'speed')} active={menu === 'speed'}>
                    <span style={{ fontFamily: T.mono }}>{tx(SPEEDS[speedIdx].label, SPEEDS[speedIdx].en)}</span>
                  </ToolBtn>
                  {menu === 'speed' && (
                    <div className={`absolute z-50 bottom-[calc(100%+6px)] left-0 rounded-xl p-1`} style={{ background: T.surface3, border: `1px solid ${T.lineHi}` }}>
                      {SPEEDS.map((s, i) => (
                        <button key={s.ms} type="button" onClick={() => setSpeed(i)} className="block w-full rounded-lg px-3 py-1.5 text-left text-[13px]" style={{ fontFamily: T.mono, color: i === speedIdx ? '#fff' : T.text2, background: i === speedIdx ? act(0.3) : 'transparent' }}>
                          {tx(s.label, s.en)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </span>
              <span className="flex items-center">
                {st.replay && st.time && (
                  <span className="hidden px-2 text-[12px] tabular-nums sm:inline" style={{ fontFamily: T.mono, color: T.text3 }}>{fmtStamp(st.time, prefs)}</span>
                )}
              </span>
              <span className="flex items-center">
                {/* На телефоні бічної панелі немає — вхід і вихід тут. */}
                {st.replay && (
                  <span className="flex gap-1 md:hidden">
                    {pos ? (
                      <button type="button" onClick={() => eng()?.closePosition('manual')} className="h-9 rounded-lg px-3 text-[13px] font-bold tabular-nums" style={{ background: T.sunken, color: pos.r >= 0 ? T.ok : T.bad, fontFamily: T.mono }}>
                        {fmtR(pos.r)} ✕
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => openPos('SHORT')} className="h-9 rounded-lg px-3 text-[13px] font-bold text-white" style={{ background: '#f23645' }}>Sell</button>
                        <button type="button" onClick={() => openPos('LONG')} className="h-9 rounded-lg px-3 text-[13px] font-bold text-white" style={{ background: '#2962ff' }}>Buy</button>
                      </>
                    )}
                  </span>
                )}
              </span>
              <span className="flex items-center">
                <ToolBtn title={tx('Вийти з реплею', 'Exit replay')} onClick={() => (st.selecting && !st.replay ? eng()?.cancelSelect() : exitReplay())}>
                  <X size={16} />
                </ToolBtn>
              </span>
            </div>
          )}
        </div>

        {/* ─────────── Другий таймфрейм ─────────── */}
        {prefs.mtf?.on && st.ready && (
          <SideChart
            eng={eng}
            prefs={prefs}
            st={st}
            tf={prefs.mtf.tf || 'H4'}
            linked={prefs.mtf.sym ? lpRef.current?.sourceOf(prefs.mtf.sym) : null}
            linkedTick={linkedSt}
            onBack={() => setPrefs({ ...prefs, mtf: { ...prefs.mtf, sym: null } })}
            width="38%"
            onTf={(x) => setPrefs({ ...prefs, mtf: { ...prefs.mtf, tf: x } })}
            onClose={() => setPrefs({ ...prefs, mtf: { ...prefs.mtf, on: false } })}
          />
        )}

        {/* ─────────── Панель угоди ─────────── */}
        {prefs.panel && st.ready && (
          <aside className="hidden w-[300px] shrink-0 flex-col overflow-y-auto md:flex" style={{ borderLeft: `1px solid ${T.line}`, background: T.surface }}>
            <TradePanel
              st={st}
              eng={eng}
              prefs={panelPrefs}
              setPrefs={setPanelPrefs}
              digits={d}
              symbolName={remoteName(symbol)}
              closed={closed}
              balance={balance}
              sessions={sessions}
              sessionId={sessionId}
              demo={demo}
              onChooseSession={chooseSession}
              onCreateSession={createSession}
              creating={creatingSession}
              saving={saving}
              unsaved={unsaved}
              onSaveUnsaved={() => saveTrades(unsaved)}
              onStartReplay={() => eng()?.startSelect()}
              onDeleteTrade={deleteTrade}
              onFocusTrade={(t) => openSnap(t, 'entry')}
              onEditTrade={editTrade}
              resume={prefs.resume && prefs.resume.sym === symbol && !st.replay ? prefs.resume : null}
              onResume={() => goTime(prefs.resume.t + 1, 'replay')}
              onHide={() => setPrefs({ ...prefs, panel: false })}
            />
          </aside>
        )}
      </div>

      {settingsOpen && <ChartSettings prefs={prefs} onChange={setPrefs} onClose={() => setSettingsOpen(false)} />}
      {indOpen && !indEdit && (
        <IndicatorsDialog
          config={prefs.indicators || []}
          notes={imRef.current?.notes || {}}
          onChange={setIndicators}
          onSettings={(id) => setIndEdit(id)}
          onClose={() => setIndOpen(false)}
        />
      )}
      {indEdit && (prefs.indicators || []).some((c) => c.id === indEdit) && (
        <IndicatorSettings
          key={indEdit}
          cfg={(prefs.indicators || []).find((c) => c.id === indEdit)}
          onChange={(next) => setIndicators((prefs.indicators || []).map((c) => (c.id === indEdit ? next : c)))}
          onClose={() => setIndEdit(null)}
        />
      )}
      {editing && (
        <DrawingSettings
          key={editing.id}
          d={editing}
          digits={d}
          fmtTime={(t) => fmtStamp(t, prefs)}
          onChange={(patch, record) => { dmRef.current?.update(editing.id, patch, record); setDrawEdit(editing.id); }}
          onClose={() => {
            /* Порожній текст не лишаємо на графіку — як у TV. */
            const dm = dmRef.current;
            const cur = dm?.list.find((x) => x.id === editing.id);
            if (cur && TOOLS[cur.type].text && !String(cur.text || '').trim()) {
              dm.list = dm.list.filter((x) => x.id !== cur.id);
              dm.select(null);
              dm.changed();
            }
            setDrawEdit(null);
          }}
          onSaveDefault={() => saveStyleDefault(editing)}
          onResetDefault={() => resetStyleDefault(editing)}
        />
      )}
    </div>
  );

  return createPortal(page, document.body);
}
