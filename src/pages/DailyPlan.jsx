import { useState, useEffect, useCallback, useRef, useMemo, useDeferredValue } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Crosshair, Radio, LineChart, Stethoscope, NotebookPen } from 'lucide-react';
import Fuse from 'fuse.js';

import { supabase } from '../lib/supabase';
import { notify } from '../utils/notify';
import { checkIsPlanEmpty } from '../utils/planUtils';
import { syncErrorFromPlan } from '../lib/errorsStore';
import {
  emptyDiagnostics, loadDiagnostics, saveDiagnostics, isComplete as diagComplete,
  answeredCount as diagCount, todayKey, wasShownToday, markShownToday,
} from '../lib/diagnostics';
import { useAuth } from '../context/AuthContext';

import TradeModal from '../components/modals/TradeModal';
import TgAlertModal from '../components/modals/TgAlertModal';
import PreSessionQuiz from '../components/trading/PreSessionQuiz';
import PostSessionDiagnostics from '../components/trading/PostSessionDiagnostics';
import PlanHeader from '../components/trading/PlanHeader';
import PlanMetadata from '../components/trading/PlanMetadata';
import LoadingSyncScreen from '../components/trading/LoadingSyncScreen';
import TdaGrid from '../components/trading/TdaGrid';
import UpdatesList from '../components/trading/UpdatesList';
import FloatingActionButtons from '../components/trading/FloatingActionButtons';
import SavingOverlay from '../components/modals/SavingOverlay';
import AssetSearchModal from '../components/modals/AssetSearchModal';
import PlanTabs, { SECTIONS, useScrollSpy, BackToTop } from '../components/trading/PlanTabs';
import AssetSwitcher, { pushRecentAsset } from '../components/trading/AssetSwitcher';
import { Section, SectionAnchor, WriteBlock } from '../components/trading/PlanPrimitives';
import WeeklyPlanView from '../components/trading/WeeklyPlanView';
import { T, EASE, useEdgeFonts } from '../components/trading/planTheme';
import useTerminalSkin from '../hooks/useTerminalSkin';
import {
  WEEK_PAIR, mondayOf, weekRangeLabel, emptyWeekPlan, checkIsWeekPlanEmpty,
  wasPlanTypeAskedToday, markPlanTypeAskedToday,
} from '../lib/weekPlan';
import PlanTypeModal from '../components/modals/PlanTypeModal';

const SECTION_IDS = SECTIONS.map((s) => s.id);

const QUICK_SELECT_SYMBOLS = ['BTC/USD', 'EUR/USD', 'GER40', 'ETH/USD', 'GBP/USD', 'XAU/USD'];

const getUkrainianTitle = (dateStr) => {
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(dateStr));
  } catch { return ''; }
};

/* Коли юзер написав думку, але не обрав актив чи напрям — план усе одно
   зберігається. Замість порожнечі підставляємо зрозумілу заглушку, і в
   списку планів такий запис одразу видно як недороблений. */
export const NO_PAIR = 'Без активу';
export const NO_BIAS = 'Напрям не вказано';

/* Локальна дата, не UTC. new Date().toISOString() о 02:00 за Києвом
   віддає вчорашній день — саме через це плани отримували чужу дату. */
export const todayLocal = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const emptyTda = () => [1, 2, 3, 4].map((id) => ({ id, tf: '', image: null, text: '' }));
const emptyReview = () => [5, 6].map((id) => ({ id, tf: '', image: null, text: '' }));

export default function DailyPlan() {
  /* Палітра з термінала — на цій сторінці й у світлій темі */
  useTerminalSkin();

  useEdgeFonts();

  const { user } = useAuth();
  const { date: paramDate, pair: paramPair } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const targetDate = paramDate || location.state?.date;
  const targetPair = paramPair ? decodeURIComponent(paramPair) : (location.state?.pair || '');
  const targetId = location.state?.id;

  const { active: activeSection, scrollTo, scrollToTop, scrolled } = useScrollSpy(SECTION_IDS);

  /* Навігація з лівої рейки: спершу просимо секції фази розгорнутись,
     потім скролимо до якоря (з невеликою затримкою, щоб розкриття
     встигло змінити висоту до розрахунку позиції). */
  const navigateToSection = useCallback((id) => {
    window.dispatchEvent(new CustomEvent('edge:plan-jump', { detail: { group: id } }));
    requestAnimationFrame(() => scrollTo(id));
  }, [scrollTo]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const isFirstLoadRef = useRef(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [lastAction, setLastAction] = useState('');

  const [isTgModalOpen, setIsTgModalOpen] = useState(false);
  const [planId, setPlanId] = useState(null);
  const currentPlanIdRef = useRef(null);
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);

  /* Діагностика дня живе окремо від плану: один запис на добу в базі */
  const [diag, setDiag] = useState(emptyDiagnostics);
  const [diagSaving, setDiagSaving] = useState(false);
  const diagLoadedRef = useRef(false);
  const diagDate = todayKey();

  /* --- модалка активів (залишена як була) --- */
  const [flatAssets, setFlatAssets] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [favorites, setFavorites] = useState([]);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  /* У тижневому режимі та сама модалка обирає актив не для planData,
     а для конкретного top-down розбору — потрібно памʼятати, для якого
     саме, доки вона відкрита. */
  const [tdaModalTargetId, setTdaModalTargetId] = useState(null);
  const [assetSearch, setAssetSearch] = useState('');
  const deferredSearch = useDeferredValue(assetSearch);
  const searchInputRef = useRef(null);
  const [expandedCategories, setExpandedCategories] = useState({ 'Forex Majors': true, Cryptocurrencies: true });
  const toggleCategory = (cat) => setExpandedCategories((p) => ({ ...p, [cat]: !p[cat] }));

  const targetDateStr = targetDate || todayLocal();

  const [planData, setPlanData] = useState({
    title: getUkrainianTitle(targetDateStr), date: targetDateStr, pair: targetPair || '',
    narrative: '',
    tdaBlocks: emptyTda(), planText: '', updates: [], reviewBlocks: emptyReview(),
    actualNarrative: '', analysisMistake: null, analysisMistakeText: '',
    sessionRating: 0, conclusionsText: '',
    psyConfident: null, psyFear: null, psyRepeatTrade: null, psyRevenge: null, psyNotes: '',
  });

  /* Зберігаємо будь-який план, у якому вже щось є. Актив і напрям
     більше не пропуск на вихід — замість них підставляються заглушки. */
  const canSaveToCloud = !checkIsPlanEmpty(planData);
  const latestPlanData = useRef(planData);
  const isSavingRef = useRef(false);
  const hasPendingSaveRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const ignoreNextChangeRef = useRef(false);
  /* Номер останньої зміни. Потрібен, щоб не погасити прапорець
     «незбережено» для тексту, надрукованого під час запиту. */
  const changeSeqRef = useRef(0);

  /* Єдина точка зміни плану. Оновлює стан і ОДРАЗУ дзеркало в ref —
     ефекти виконуються після рендера, а вихід зі сторінки може статись
     раніше, і тоді останні правки не потрапляли в збереження. */
  const setPlan = useCallback((updater) => {
    setPlanData((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      latestPlanData.current = next;
      changeSeqRef.current += 1;
      return next;
    });
  }, []);

  /* ==================================================================
     Тижневий план — окремий, свідомо простіший контур збереження.

     Плутати його з денним автозбереженням (рефи, черга, флаш на
     видимість вкладки — усе вище) означало б тягнути в один код дві
     різні моделі даних і ризикувати денним планом заради фічі, яку
     тільки-но додали. Тут дешевший, ізольований шлях: дебаунс на
     зміну, і якщо збій — видно помилку, а не втрачені дані, бо
     `weekData` живе в звичайному стані, не тільки в рефі. */
  /* Перехід із «Аналізів» на конкретний тижневий план приходить сюди
     через router state — так само, як id денного плану. URL лишається
     тим самим /plan, тому масштаб і тиждень мають десь пережити
     перший рендер, а не тільки клік по перемикачу. */
  const [mode, setMode] = useState(() => (location.state?.mode === 'weekly' ? 'weekly' : 'daily'));
  const [weekMonday, setWeekMonday] = useState(() => location.state?.weekMonday || mondayOf(todayLocal()));
  const [weekData, setWeekData] = useState(() => emptyWeekPlan(weekMonday));
  const [isWeekLoading, setIsWeekLoading] = useState(false);
  const [isWeekSaving, setIsWeekSaving] = useState(false);
  const [weekHasUnsaved, setWeekHasUnsaved] = useState(false);
  const [weekLastSaved, setWeekLastSaved] = useState(null);
  const weekPlanIdRef = useRef(null);
  const latestWeekDataRef = useRef(weekData);
  latestWeekDataRef.current = weekData;

  const updateWeekData = useCallback((next) => {
    setWeekData(next);
    setWeekHasUnsaved(true);
  }, []);

  /* ==================================================================
     Вибір типу плану: денний чи тижневий.

     Два незалежні входи в ту саму модалку. «auto» — пн-вт пропонують
     явний вибір замість тихого дефолту на денний, і лише перемикають
     režим (жодних скидань — кожен масштаб сам вантажить свої дані).
     «new» — свідомий клік на «New plan»: як і денний скид нижче, це
     чистий старт, тому вибір тижневого тут заводить порожній тижневий
     план, а не продовжує те, що вже було. */
  const [isPlanTypeModalOpen, setIsPlanTypeModalOpen] = useState(false);
  const [planTypeModalContext, setPlanTypeModalContext] = useState('auto');
  const isPlanTypeModalOpenRef = useRef(false);
  isPlanTypeModalOpenRef.current = isPlanTypeModalOpen;
  const skipNextWeekLoadRef = useRef(false);

  useEffect(() => {
    if (isInitialLoading || location.state?.mode) return;
    const day = new Date().getDay();
    if ((day === 1 || day === 2) && !wasPlanTypeAskedToday()) {
      markPlanTypeAskedToday();
      setPlanTypeModalContext('auto');
      setTimeout(() => setIsPlanTypeModalOpen(true), 500);
    }
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isInitialLoading]);

  const openPlanTypeModalForNewPlan = useCallback(() => {
    setPlanTypeModalContext('new');
    setIsPlanTypeModalOpen(true);
  }, []);

  const handleChoosePlanType = useCallback(async (type) => {
    setIsPlanTypeModalOpen(false);
    if (planTypeModalContext === 'auto') { setMode(type); return; }

    if (type === 'daily') { await handleNewPlan(); return; }

    /* «New plan» → тижневий: свідомо порожній тиждень, а не продовження
       того, що вже лежить у weekData, — той самий принцип, що й у
       handleNewPlan для денного. emptyWeekPlan сама заводить ОДИН новий
       tdaAnalyses-розбір, тому нового блоку ніколи не буде «всередині»
       вже існуючого. */
    if (mode === 'daily' && canSaveToCloud && hasUnsavedChanges && !isSaving) await performSave();
    const monday = mondayOf(todayLocal());
    skipNextWeekLoadRef.current = true;
    weekPlanIdRef.current = null;
    setWeekMonday(monday);
    setWeekData(emptyWeekPlan(monday));
    setWeekHasUnsaved(false);
    setWeekLastSaved(null);
    setMode('weekly');
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [planTypeModalContext, mode, canSaveToCloud, hasUnsavedChanges, isSaving]);

  useEffect(() => {
    if (mode !== 'weekly' || !user?.id) return undefined;
    /* «New plan» щойно завів свій порожній тиждень локально — не тягнемо
       поверх нього те, що лежить у хмарі, інакше скидання й не було. */
    if (skipNextWeekLoadRef.current) { skipNextWeekLoadRef.current = false; return undefined; }
    let alive = true;
    setIsWeekLoading(true);

    (async () => {
      const { data, error } = await supabase.from('trading_plans')
        .select('id, plan_data')
        .eq('user_id', user.id).eq('date', weekMonday).eq('pair', WEEK_PAIR).eq('plan_type', 'weekly')
        .order('created_at', { ascending: false }).limit(1);
      if (!alive) return;

      if (error) {
        console.error('load weekly plan', error);
        notify.error('Не вдалось відкрити тижневий план', error.message || 'Помилка бази.');
        setIsWeekLoading(false);
        return;
      }

      const row = data?.[0];
      weekPlanIdRef.current = row?.id || null;
      setWeekData({ ...emptyWeekPlan(weekMonday), ...(row?.plan_data || {}) });
      setWeekHasUnsaved(false);
      setIsWeekLoading(false);
    })();

    return () => { alive = false; };
  }, [mode, weekMonday, user?.id]);

  const performSaveWeek = useCallback(async () => {
    if (!user?.id) return;
    const raw = latestWeekDataRef.current;
    if (checkIsWeekPlanEmpty(raw)) return;

    setIsWeekSaving(true);
    try {
      /* Немає більше одного bias на весь тиждень — колонка narrative
         для тижневих рядків лишається порожньою, план читають з
         plan_data.tdaAnalyses, де в кожного розбору свій bias. */
      const row = { date: weekMonday, pair: WEEK_PAIR, plan_type: 'weekly', narrative: '', plan_data: raw };
      let id = weekPlanIdRef.current;

      if (id) {
        const { error } = await supabase.from('trading_plans').update(row).eq('id', id);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase.from('trading_plans')
          .insert([{ user_id: user.id, ...row }]).select('id');

        if (error?.code === '23505') {
          const { data: found } = await supabase.from('trading_plans').select('id')
            .eq('user_id', user.id).eq('date', weekMonday).eq('pair', WEEK_PAIR).eq('plan_type', 'weekly').limit(1);
          id = found?.[0]?.id || null;
          if (id) { const { error: upErr } = await supabase.from('trading_plans').update(row).eq('id', id); if (upErr) throw upErr; }
        } else if (error) {
          throw error;
        } else {
          id = created?.[0]?.id || null;
        }
        if (id) weekPlanIdRef.current = id;
      }
      setWeekHasUnsaved(false);
      setWeekLastSaved(new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error('save weekly plan', err);
      notify.error('Не вдалось зберегти тижневий план', err.message || 'Помилка бази.');
    } finally {
      setIsWeekSaving(false);
    }
  }, [user?.id, weekMonday]);

  useEffect(() => {
    if (mode !== 'weekly' || !user?.id || isWeekLoading) return undefined;
    const timer = setTimeout(() => { performSaveWeek(); }, 1500);
    return () => clearTimeout(timer);
  }, [weekData, mode, isWeekLoading, user?.id, performSaveWeek]);

  /* Тижневий план завжди про поточний тиждень — жодного гортання назад
     чи вперед. Єдиний вихід на "той самий" тиждень — кнопка "New week"
     у хедері, яка повертає сюди після перегляду минулого через Аналізи. */
  const goThisWeek = useCallback(() => setWeekMonday(mondayOf(todayLocal())), []);

  /* ---------- Прогрес по вкладках ---------- */
  const progress = useMemo(() => {
    const tdaFilled = planData.tdaBlocks.filter((b) => b.image || b.text?.trim()).length;
    const planPart = [
      planData.pair ? 1 : 0,
      planData.narrative ? 1 : 0,
      Math.min(tdaFilled / 2, 1),
      planData.planText?.trim() ? 1 : 0,
    ];
    const plan = planPart.reduce((a, b) => a + b, 0) / planPart.length;

    const live = planData.updates.length > 0
      ? Math.min(planData.updates.filter((u) => u.image || u.text?.trim()).length / planData.updates.length, 1)
      : 0;

    const reviewFilled = planData.reviewBlocks.filter((b) => b.image || b.text?.trim()).length;
    const reviewPart = [
      Math.min(reviewFilled / 1, 1),
      planData.actualNarrative ? 1 : 0,
      planData.sessionRating > 0 ? 1 : 0,
      planData.analysisMistake !== null ? 1 : 0,
      planData.conclusionsText?.trim() ? 1 : 0,
    ];
    const review = reviewPart.reduce((a, b) => a + b, 0) / reviewPart.length;

    return { plan, live, review };
  }, [planData]);

  const overall = (progress.plan * 0.45 + progress.live * 0.1 + progress.review * 0.45);

  /* ---------- Активи ---------- */
  useEffect(() => {
    async function fetchMarketData() {
      setIsLoadingAssets(true);
      const CACHE_KEY = 'calculator_market_assets_v3';
      const CACHE_TIME_KEY = 'calculator_market_assets_time_v3';
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const cached = localStorage.getItem(CACHE_KEY);
      const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
      const now = Date.now();

      if (cached && cachedTime && now - Number(cachedTime) < ONE_DAY) {
        try {
          setFlatAssets(JSON.parse(cached).flat);
          setIsLoadingAssets(false);
          return;
        } catch {}
      }

      const combined = [];
      try {
        const { data: dbAssets, error } = await supabase.from('instruments').select('symbol, category, contract_size');
        if (dbAssets && !error) {
          combined.push(...dbAssets.map((i) => ({ symbol: i.symbol, category: i.category, contractSize: Number(i.contract_size) })));
        }
        try {
          const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
          const json = await res.json();
          combined.push(...json.symbols
            .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .slice(0, 40)
            .map((s) => ({ symbol: s.symbol.replace('USDT', '/USD'), category: 'Cryptocurrencies', contractSize: 1 })));
        } catch {}
        setFlatAssets(combined);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ flat: combined }));
        localStorage.setItem(CACHE_TIME_KEY, String(now));
      } catch (e) { console.error(e); }
      finally { setIsLoadingAssets(false); }
    }
    fetchMarketData();

    async function fetchFavorites() {
      const KEY = 'calculator_favorites_v1';
      const cached = localStorage.getItem(KEY);
      if (cached) setFavorites(JSON.parse(cached));
      try {
        const { data } = await supabase.from('user_assets').select('name');
        if (data) {
          const favs = data.map((i) => i.name);
          setFavorites(favs);
          localStorage.setItem(KEY, JSON.stringify(favs));
        }
      } catch {}
    }
    fetchFavorites();
  }, []);

  const fuse = useMemo(() => new Fuse(flatAssets, { keys: ['symbol'], threshold: 0.4 }), [flatAssets]);
  const displayCategories = useMemo(() => {
    let results = flatAssets;
    if (deferredSearch.trim()) results = fuse.search(deferredSearch).map((r) => r.item);
    const grouped = {};
    results.forEach((a) => { (grouped[a.category] ||= []).push(a); });
    return grouped;
  }, [flatAssets, deferredSearch, fuse]);
  const quickSelectAssets = useMemo(
    () => QUICK_SELECT_SYMBOLS.map((s) => flatAssets.find((a) => a.symbol === s)).filter(Boolean),
    [flatAssets]
  );
  const favoriteAssetsList = useMemo(
    () => favorites.map((s) => flatAssets.find((a) => a.symbol === s)).filter(Boolean),
    [favorites, flatAssets]
  );

  const handleToggleFavorite = async (e, symbol) => {
    e.stopPropagation();
    const isFav = favorites.includes(symbol);
    const next = isFav ? favorites.filter((f) => f !== symbol) : [...favorites, symbol];
    setFavorites(next);
    if (isFav) supabase.from('user_assets').delete().match({ name: symbol }).then();
    else supabase.from('user_assets').insert([{ name: symbol }]).then();
    localStorage.setItem('calculator_favorites_v1', JSON.stringify(next));
  };

  /* ---------- Синхронізація ---------- */
  useEffect(() => {
    if (planData.date) {
      const t = getUkrainianTitle(planData.date);
      if (planData.title !== t) setPlan((p) => ({ ...p, title: t }));
    }
  }, [planData.date, planData.title]);


  /* Актив, який реально відкривали, потрапляє в «недавні» перемикача */
  useEffect(() => {
    if (!isInitialLoading && planData.pair) pushRecentAsset(planData.pair);
  }, [planData.pair, isInitialLoading]);

  useEffect(() => {
    latestPlanData.current = planData;
    changeSeqRef.current += 1;
    if (ignoreNextChangeRef.current) { ignoreNextChangeRef.current = false; setHasUnsavedChanges(false); }
    else if (!isInitialLoading) setHasUnsavedChanges(true);
  }, [planData, isInitialLoading]);

  const loadPlanFromCloud = useCallback(async (date, pair, specificId, resumeOnlyToday = false) => {
    if (!date && !pair && !specificId) { setIsInitialLoading(false); return; }
    if (!user?.id) return;

    if (isFirstLoadRef.current) isFirstLoadRef.current = false;
    else setIsSwitching(true);

    try {
      let query = supabase.from('trading_plans').select('id, date, pair, narrative, plan_data');
      if (specificId) query = query.eq('id', specificId).eq('user_id', user.id);
      else query = query.eq('date', date).eq('pair', pair).eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(1);

      const { data, error } = await query;
      if (error) throw error;

      const row = data?.[0];

      /* Продовжуємо вчорашнє тільки за прямим запитом. Інакше відкриття
         «Trading Plan» з меню має давати чистий план на сьогодні, а не
         дописувати те, що редагувалось два тижні тому. */
      const stale = resumeOnlyToday && row && row.date !== todayLocal();

      if (row && !stale) {
        /* Рядок знайдено — беремо його навіть якщо plan_data ще порожній.
           Раніше такий план вважався неіснуючим, і сторінка відкривалась
           чистою, а дата з активом ставали undefined. */
        setPlanId(row.id);
        currentPlanIdRef.current = row.id;
        localStorage.setItem('last_edited_plan_id', row.id);
        ignoreNextChangeRef.current = true;
        setPlan((p) => ({
          ...p,
          ...(row.plan_data || {}),
          date: row.date || p.date,
          pair: row.pair || p.pair,
          narrative: row.plan_data?.narrative ?? row.narrative ?? '',
          title: getUkrainianTitle(row.date || p.date),
        }));
      } else {
        setPlanId(null);
        currentPlanIdRef.current = null;
        if (specificId && !stale) localStorage.removeItem('last_edited_plan_id');

        /* Чистий план на сьогодні, коли продовжувати нічого */
        if (stale || (!date && !pair)) {
          ignoreNextChangeRef.current = true;
          const t = todayLocal();
          setPlan((p) => ({
            ...p, title: getUkrainianTitle(t), date: t, pair: '', narrative: '',
            tdaBlocks: emptyTda(), planText: '', updates: [], reviewBlocks: emptyReview(),
            actualNarrative: '', analysisMistake: null, analysisMistakeText: '',
            sessionRating: 0, conclusionsText: '',
          }));
        } else if (date) {
          ignoreNextChangeRef.current = true;
          setPlan((p) => ({
            ...p, title: getUkrainianTitle(date), date, pair: pair || '', narrative: '',
            tdaBlocks: emptyTda(), planText: '', updates: [], reviewBlocks: emptyReview(),
            actualNarrative: '', analysisMistake: null, analysisMistakeText: '',
            sessionRating: 0, conclusionsText: '',
          }));
        }
      }
    } catch (err) {
      console.error('loadPlanFromCloud', err);
      notify.error('Не вдалось відкрити план', err.message || 'Помилка бази.');
      setPlanId(null);
      currentPlanIdRef.current = null;
    } finally {
      /* Пауза згладжує мережеве тремтіння при переході між планами.
         У пісочниці мережі немає — дані вже тут, тож і чекати нема
         навіщо: інакше «Завантаження даних з хмари…» висить дарма. */
      const smooth = (typeof window !== 'undefined'
        && window.location.pathname.startsWith('/demo')) ? 0 : 250;
      setTimeout(() => { setIsInitialLoading(false); setIsSwitching(false); }, smooth);
    }
  }, [user?.id]);

  useEffect(() => {
    if (targetDate && targetPair) loadPlanFromCloud(targetDate, targetPair, targetId);
    else {
      /* У localStorage лежить лише id останнього плану — жодного вмісту.
         Сам план завжди тягнемо з бази під конкретного користувача. */
      const lastId = localStorage.getItem('last_edited_plan_id');
      if (lastId) loadPlanFromCloud(null, null, lastId, true);
      else {
        setPlanId(null);
        currentPlanIdRef.current = null;
        setIsInitialLoading(false);
      }
    }
  }, [targetDate, targetPair, targetId, loadPlanFromCloud]);

  /* ---------- Діагностика дня ---------- */

  useEffect(() => {
    if (!user?.id || diagLoadedRef.current) return;
    diagLoadedRef.current = true;
    (async () => {
      const saved = await loadDiagnostics(user.id, diagDate);
      if (saved) setDiag(saved);
      /* Питаємо рівно один раз на добу: або запису ще немає, або він
         неповний, і ми ще не показували модалку сьогодні */
      if ((!saved || !diagComplete(saved)) && !wasShownToday()) {
        setTimeout(() => {
          /* У пн-вт може саме зараз стояти питання «денний чи тижневий» —
             дві модалки одна на одній не показуємо, квіз почекає до
             наступного відкриття сторінки */
          if (isPlanTypeModalOpenRef.current) return;
          markShownToday();
          setIsQuizModalOpen(true);
        }, 700);
      }
    })();
  }, [user?.id, diagDate]);

  /* Кожна відповідь одразу летить у базу — модалку можна закрити будь-коли */
  const patchDiag = useCallback((patch) => {
    setDiag((prev) => {
      const next = { ...prev, ...patch };
      if (user?.id) {
        setDiagSaving(true);
        saveDiagnostics(user.id, diagDate, next)
          .catch(() => notify.error('Діагностика', 'Не вдалось зберегти відповідь.'))
          .finally(() => setDiagSaving(false));
      }
      return next;
    });
  }, [user?.id, diagDate]);

  const performSave = useCallback(async () => {
    const raw = latestPlanData.current;
    const seqAtStart = changeSeqRef.current;
    if (!user?.id || !raw.date || checkIsPlanEmpty(raw)) return;

    /* Порожні актив і напрям замінюємо заглушками — інакше запис
       не пройде NOT NULL і робота людини просто зникне */
    const d = {
      ...raw,
      pair: raw.pair?.trim() || NO_PAIR,
      narrative: raw.narrative?.trim() || NO_BIAS,
    };
    if (isSavingRef.current) { hasPendingSaveRef.current = true; return; }
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const row = { date: d.date, pair: d.pair, narrative: d.narrative, plan_data: d };

      const findExisting = async () => {
        const { data } = await supabase.from('trading_plans').select('id')
          .eq('date', d.date).eq('pair', d.pair).eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(1);
        return data?.[0]?.id || null;
      };

      const currentId = currentPlanIdRef.current;
      let id = currentId || await findExisting();
      let status = '';

      if (id) {
        /* supabase-js не кидає винятків — помилку треба читати з відповіді,
           інакше збій RLS чи індексу проходить мовчки під написом «Оновлено» */
        const { error } = await supabase.from('trading_plans').update(row).eq('id', id);
        if (error) throw error;
        if (!currentId) { setPlanId(id); currentPlanIdRef.current = id; }
        status = 'Оновлено';
      } else {
        const { data: created, error } = await supabase.from('trading_plans')
          .insert([{ user_id: user.id, ...row }]).select('id');

        if (error?.code === '23505') {
          /* Такий план уже є (унікальний ключ user+date+pair) — оновлюємо його */
          id = await findExisting();
          if (!id) throw error;
          const { error: upErr } = await supabase.from('trading_plans').update(row).eq('id', id);
          if (upErr) throw upErr;
          status = 'Оновлено';
        } else if (error) {
          throw error;
        } else {
          id = created?.[0]?.id || null;
          status = 'Створено';
        }

        if (id) { setPlanId(id); currentPlanIdRef.current = id; }
      }

      /* Дзеркало помилки з діагностики в Журналі помилок.

         Окремим try: план уже збережений, і якщо не доїде саме
         дзеркало, людина не має побачити «план не збережено».

         Драфт (категорії з детального розбору) лежить у самому
         plan_data, тому переживає перемальовування сторінки. */
      if (id) {
        try {
          await syncErrorFromPlan(user.id, { ...d, id }, d.errorDraft);
        } catch (e) {
          console.error('sync plan error log', e);
        }
      }

      if (id) localStorage.setItem('last_edited_plan_id', id);
      setLastSaved(new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }));
      setLastAction(status);

      if (changeSeqRef.current === seqAtStart) {
        setHasUnsavedChanges(false);
      } else {
        /* Поки летів запит, зʼявився новий текст — він ще не в базі,
           тому одразу ставимо повторне збереження */
        hasPendingSaveRef.current = true;
      }
    } catch (err) {
      console.error('performSave', err);
      notify.error('План не збережено', err.message || 'Невідома помилка бази.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      if (hasPendingSaveRef.current) { hasPendingSaveRef.current = false; await performSave(); }
    }
  }, [user?.id]);

  useEffect(() => {
    if (canSaveToCloud && hasUnsavedChanges) {
      const id = setTimeout(() => performSave(), 1500);
      return () => clearTimeout(id);
    }
  }, [planData, canSaveToCloud, targetDate, hasUnsavedChanges, performSave]);

  /* Ctrl/Cmd+S — примусове збереження */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canSaveToCloud && !isSaving) performSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSaveToCloud, isSaving, performSave]);

  /* Виходить зі сторінки — дозаписуємо тихо, без модалок і питань.
     Раніше тут стояв блокер, який не випускав, поки не заповниш актив;
     тепер порожні поля просто отримують заглушки в performSave. */
  useEffect(() => () => {
    /* Якщо саме зараз летить запит — performSave поставить себе в чергу
       сам, тому виклик безпечний і нічого не губить */
    if (!checkIsPlanEmpty(latestPlanData.current)) performSave();
  }, [performSave]);

  /* Закриття вкладки — останній шанс зберегти */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges && !isSavingRef.current) performSave();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [hasUnsavedChanges, performSave]);

  /* Поділитись = свідомо відкрити план назовні. Доки is_public = false,
     посилання не працює ні для кого, навіть якщо id хтось вгадає. */
  const handleShare = async () => {
    let id = planId;
    if (!id) {
      await performSave();
      id = currentPlanIdRef.current;
    }
    if (!id) return notify.error('Немає що показувати', 'Спершу напиши хоч щось у плані.');

    const { error } = await supabase.from('trading_plans')
      .update({ is_public: true }).eq('id', id).eq('user_id', user.id);
    if (error) return notify.error('Не вдалось відкрити доступ', error.message);

    await navigator.clipboard.writeText(`${window.location.origin}/shared/plan/${id}`);
    notify.success('Лінк скопійовано', 'План відкрито для перегляду за посиланням.');
  };

  const handleRouteChange = async (newDate, newPair) => {
    if (newDate === planData.date && newPair === planData.pair) return;
    if (canSaveToCloud && hasUnsavedChanges && !isSaving) {
      setIsExiting(true);
      await performSave();
      setIsExiting(false);
    }
    setHasUnsavedChanges(false);
    ignoreNextChangeRef.current = true;
    navigate(`/plan/${newDate}/${encodeURIComponent(newPair)}`);
  };

  const handleNewPlan = async () => {
    if (canSaveToCloud && hasUnsavedChanges && !isSaving) await performSave();
    localStorage.removeItem('last_edited_plan_id');
    setPlanId(null);
    currentPlanIdRef.current = null;
    if (paramDate || paramPair) navigate('/plan');
    else {
      const today = todayLocal();
      ignoreNextChangeRef.current = true;
      setLastSaved(null);
      setLastAction('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setPlan((p) => ({
        ...p, title: getUkrainianTitle(today), date: today, pair: '', narrative: '',
        tdaBlocks: emptyTda(), planText: '', updates: [], reviewBlocks: emptyReview(),
        actualNarrative: '', analysisMistake: null, analysisMistakeText: '',
        sessionRating: 0, conclusionsText: '',
      }));
      notify.success('Новий план', 'Можна починати.');
    }
  };

  const handleAssetSelectModal = (asset) => {
    setIsAssetModalOpen(false);
    handleRouteChange(planData.date, asset.symbol);
    setTimeout(() => setAssetSearch(''), 300);
  };

  /* Той самий вибір активу, що й у денному плані, тільки пише не в
     planData.pair, а в pair конкретного top-down розбору — того, чия
     кнопка відкрила модалку. */
  const handleTdaAssetSelect = (asset) => {
    setIsAssetModalOpen(false);
    updateWeekData({
      ...weekData,
      tdaAnalyses: weekData.tdaAnalyses.map((t) => (t.id === tdaModalTargetId ? { ...t, pair: asset.symbol } : t)),
    });
    setTdaModalTargetId(null);
    setTimeout(() => setAssetSearch(''), 300);
  };

  /* Стабільні посилання — інакше memo на блоках марна: нова функція
     на кожен рендер змушує перемальовувати всі картки з картинками */
  const saveInto = useCallback((key) => (id, data) =>
    setPlan((p) => ({ ...p, [key]: p[key].map((b) => (b.id === id ? { ...b, ...data } : b)) })), []);

  const saveTda = useMemo(() => saveInto('tdaBlocks'), [saveInto]);
  const saveUpdate = useMemo(() => saveInto('updates'), [saveInto]);
  const saveReview = useMemo(() => saveInto('reviewBlocks'), [saveInto]);

  if (isInitialLoading) return <LoadingSyncScreen />;

  const quizCount = diagCount(diag);
  const quizDone = diagComplete(diag);

  return (
    <div className="relative min-h-screen w-full">

      <div className="relative z-10 mx-auto w-full max-w-[2200px] px-4 pb-32 pt-5 sm:px-6 lg:w-[92%] lg:px-0 lg:pb-40 lg:pt-6">
        <PlanHeader
          title={mode === 'weekly' ? weekRangeLabel(weekMonday) : planData.title}
          pair={mode === 'weekly' ? '' : planData.pair}
          mode={mode}
          onModeChange={setMode}
          onNewPlan={mode === 'weekly' ? goThisWeek : openPlanTypeModalForNewPlan}
          onShare={handleShare}
          onOpenQuiz={() => setIsQuizModalOpen(true)}
          isQuizFullyCompleted={quizDone}
          quizCompletedCount={quizCount}
          onAddTrade={() => setIsTradeModalOpen(true)}
          onOpenTgAlert={() => setIsTgModalOpen(true)}
        />

        {mode === 'weekly' && (
          <WeeklyPlanView
            data={weekData}
            onChange={updateWeekData}
            activeSection={activeSection}
            onNavigateSection={navigateToSection}
            onOpenAssetModal={(id) => { if (!isLoadingAssets) { setTdaModalTargetId(id); setIsAssetModalOpen(true); } }}
            isLoadingAssets={isLoadingAssets}
          />
        )}

        {mode === 'daily' && (
        <>
        <PlanMetadata
          date={planData.date}
          onDateChange={(v) => handleRouteChange(v, planData.pair)}
          pair={planData.pair}
          onOpenAssetModal={() => !isLoadingAssets && setIsAssetModalOpen(true)}
          isLoadingAssets={isLoadingAssets}
          narrative={planData.narrative}
          onNarrativeChange={(v) => setPlan((p) => ({ ...p, narrative: v }))}
        />

        <div className="mt-6">
          <PlanTabs
            active={activeSection}
            onNavigate={navigateToSection}
            progress={progress}
            overall={overall}
            assetSwitcher={
              <AssetSwitcher
                currentPair={planData.pair}
                flatAssets={flatAssets}
                favorites={favorites}
                onPick={(symbol, date) => handleRouteChange(date || planData.date, symbol)}
                onToggleFavorite={handleToggleFavorite}
                onOpenFullSearch={() => !isLoadingAssets && setIsAssetModalOpen(true)}
              />
            }
          />
        </div>

        <motion.div
          animate={{ opacity: isSwitching ? 0.35 : 1, filter: isSwitching ? 'blur(3px)' : 'blur(0px)' }}
          transition={{ duration: 0.22, ease: EASE }}
          className={isSwitching ? 'pointer-events-none' : ''}
        >
          {/* ═══════════════ PLAN ═══════════════ */}
          <SectionAnchor
            id="plan" first
            label="Plan" sub="Before"
            icon={Crosshair}
            progress={progress.plan}
          />

          <div className="flex flex-col gap-5">
            <Section
              icon={Layers}
              storageKey="tda"
              group="plan"
              title="Top-down аналіз"
              hint="Структура від старших ТФ до молодших"
              done={planData.tdaBlocks.filter((b) => b.image || b.text?.trim()).length >= 2}
              right={
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
                      style={{ fontFamily: T.sans, color: T.text4 }}>
                  {planData.tdaBlocks.filter((b) => b.image || b.text?.trim()).length}/4
                </span>
              }
            >
              <div className="p-5 sm:p-6">
                <TdaGrid blocks={planData.tdaBlocks} onSave={saveTda} />
              </div>
            </Section>

            <Section
              icon={Crosshair}
              storageKey="strategy"
              group="plan"
              title="Стратегія та точки входу"
              hint="Тригери, стоп, інвалідація"
              done={!!planData.planText?.trim()}
            >
              <WriteBlock
                value={planData.planText}
                onChange={(v) => setPlan((p) => ({ ...p, planText: v }))}
                placeholder="Де заходиш? Де стоп? Що скасовує ідею?"
                hint="Опиши логіку так, щоб завтра зрозумів себе"
                minRows={8}
              />
            </Section>
          </div>

          {/* ═══════════════ LIVE ═══════════════ */}
          <SectionAnchor
            id="live"
            label="Live" sub="During"
            icon={Radio}
            progress={progress.live}
          />

          <Section
            icon={Radio}
            storageKey="updates"
            group="live"
            title="Апдейти по ходу сесії"
            hint="Що змінилось відносно плану"
            done={progress.live >= 1 && planData.updates.length > 0}
          >
            <div className="p-5 sm:p-6">
              <UpdatesList
                updates={planData.updates}
                onAdd={() =>
                  setPlan((p) => ({
                    ...p,
                    updates: [...p.updates, {
                      id: Date.now(),
                      date: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
                      tf: '', image: null, text: '',
                    }],
                  }))
                }
                onSave={saveUpdate}
              />
            </div>
          </Section>

          {/* ═══════════════ REVIEW ═══════════════ */}
          <SectionAnchor
            id="review"
            label="Review" sub="After"
            icon={LineChart}
            progress={progress.review}
          />

          <div className="flex flex-col gap-5">
            <Section
              icon={LineChart}
              storageKey="review"
              group="review"
              title="Розбір після сесії"
              hint="Як усе виглядало по факту"
              done={planData.reviewBlocks.some((b) => b.image || b.text?.trim())}
              right={
                <span className="text-[12px] font-bold uppercase tracking-[0.16em] tabular-nums"
                      style={{ fontFamily: T.sans, color: T.text4 }}>
                  {planData.reviewBlocks.filter((b) => b.image || b.text?.trim()).length}/2
                </span>
              }
            >
              <div className="p-5 sm:p-6">
                <TdaGrid blocks={planData.reviewBlocks} onSave={saveReview} />
              </div>
            </Section>

            <Section
              icon={Stethoscope}
              storageKey="diagnostics"
              group="review"
              title="Діагностика"
              hint="Три перевірки перед висновками"
              done={
                !!planData.actualNarrative &&
                planData.sessionRating > 0 &&
                planData.analysisMistake !== null
              }
            >
              <PostSessionDiagnostics
                planData={planData}
                planId={planId}
                updatePlanData={(u) => setPlan((p) => ({ ...p, ...u }))}
              />
            </Section>

            <Section
              icon={NotebookPen}
              storageKey="conclusions"
              group="review"
              title="Висновки"
              hint="Головний урок дня"
              done={!!planData.conclusionsText?.trim()}
            >
              <WriteBlock
                value={planData.conclusionsText}
                onChange={(v) => setPlan((p) => ({ ...p, conclusionsText: v }))}
                placeholder="Дотримався плану? Що конкретно зробиш інакше завтра?"
                hint="Один чіткий висновок вартий десяти розмитих"
                minRows={8}
              />
            </Section>
          </div>
        </motion.div>
        </>
        )}
      </div>

      {mode === 'weekly' ? (
        <FloatingActionButtons
          hideTrade
          onSave={() => { if (!isWeekSaving) performSaveWeek(); }}
          isSaving={isWeekSaving}
          canSaveToCloud={!checkIsWeekPlanEmpty(weekData)}
          hasUnsavedChanges={weekHasUnsaved}
          lastSaved={weekLastSaved}
          lastAction="Збережено"
          backToTop={<BackToTop visible={scrolled} onClick={scrollToTop} />}
        />
      ) : (
        <FloatingActionButtons
          onAddTrade={() => setIsTradeModalOpen(true)}
          onSave={() => { if (!isSaving && canSaveToCloud) performSave(); }}
          isSaving={isSaving}
          canSaveToCloud={canSaveToCloud}
          hasUnsavedChanges={hasUnsavedChanges}
          lastSaved={lastSaved}
          lastAction={lastAction}
          backToTop={<BackToTop visible={scrolled} onClick={scrollToTop} />}
        />
      )}

      <PlanTypeModal
        isOpen={isPlanTypeModalOpen}
        onClose={() => setIsPlanTypeModalOpen(false)}
        onChoose={handleChoosePlanType}
      />

      <PreSessionQuiz
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        quizData={diag}
        onAnswer={(k, v) => patchDiag({ [k]: v })}
        onNote={(v) => patchDiag({ note: v })}
        saving={diagSaving}
        dateLabel={new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      <AnimatePresence>{isExiting && <SavingOverlay />}</AnimatePresence>
      <TgAlertModal isOpen={isTgModalOpen} onClose={() => setIsTgModalOpen(false)} pair={planData.pair} />
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        planDate={mode === 'weekly' ? undefined : planData.date}
        planPair={mode === 'weekly' ? undefined : planData.pair}
      />

      <AnimatePresence>
        {isAssetModalOpen && (
          <AssetSearchModal
            isOpen={isAssetModalOpen}
            onClose={() => { setIsAssetModalOpen(false); setTdaModalTargetId(null); }}
            searchInputRef={searchInputRef}
            assetSearch={assetSearch}
            setAssetSearch={setAssetSearch}
            deferredSearch={deferredSearch}
            favoriteAssetsList={favoriteAssetsList}
            quickSelectAssets={quickSelectAssets}
            displayCategories={displayCategories}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            handleToggleFavorite={handleToggleFavorite}
            favorites={favorites}
            {...(mode === 'weekly'
              ? {
                handleAssetSelect: handleTdaAssetSelect,
                assetPair: weekData.tdaAnalyses.find((t) => t.id === tdaModalTargetId)?.pair || '',
              }
              : { handleAssetSelect: handleAssetSelectModal, assetPair: planData.pair })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
