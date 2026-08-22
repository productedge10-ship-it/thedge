import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { Search, ArrowUpDown, Loader2, Inbox, Plus, AlertTriangle, X, Layers, Crosshair, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadSearchIndex, buildFuse, searchPlans } from '../lib/planSearch';
import { T, EASE } from '../lib/theme';
import AssetSelect from '../components/trading/AssetSelect';
import DateRangePicker from '../components/trading/DateRangePicker';
import DelayedTooltip from '../components/ui/DelayedTooltip';
import { Spotlight } from '../components/ui/Hovers';
import AnalysisCard, { biasResult } from '../components/analyses/AnalysisCard';
import PremiumAnalysisHover from '../components/analyses/PremiumAnalysisHover';

const MONTHS_UA = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

// Оригінальна, плавна крива анімації
const premiumEasing = [0.22, 1, 0.36, 1]; 

const fadeVariant = {
  hidden: { opacity: 0, y: 10, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: premiumEasing } },
  exit: { opacity: 0, y: -10, filter: 'blur(4px)', transition: { duration: 0.3 } }
};

export default function Analyses() {
  const { user } = useAuth();
  
  // Ініціалізація з кешу для миттєвого відображення
  const [plans, setPlans] = useState(() => {
    try {
      const cached = localStorage.getItem('analyses_cache_v2');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  
  const [loading, setLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('analyses_cache_v2');
      return !cached;
    } catch (e) {
      return true;
    }
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  /* Індекс для нечіткого пошуку: вантажиться раз, при першому запиті */
  const fuseRef = useRef(null);
  const indexRef = useRef(null);
  const [indexing, setIndexing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [planToDelete, setPlanToDelete] = useState(null);
  const [uniquePairs, setUniquePairs] = useState(['All']);
  const navigate = useNavigate();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedPair, setSelectedPair] = useState('All');
  const [sortOrder, setSortOrder] = useState('desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Стан для запобігання спаму кнопок сортування
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Реф, який не дає скидати анімацію при найпершому отриманні даних з бази після рендеру кешу
  
  const observerTarget = useRef(null);
  const searchRef = useRef(null);
  const plansLengthRef = useRef(0);
  const globalMouseX = useMotionValue(0);
  const globalMouseY = useMotionValue(0);
  const bgTemplate = useMotionTemplate`radial-gradient(800px circle at ${globalMouseX}px ${globalMouseY}px, rgba(139,123,255,0.05), transparent 80%)`;

  // Ключ для повної перезапуску анімації


  function handleGlobalMouseMove({ clientX, clientY }) {
    globalMouseX.set(clientX);
    globalMouseY.set(clientY);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  /* «/» кидає курсор у пошук — звичка з нормальних застосунків */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) searchRef.current.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchPairs = async () => {
      const { data } = await supabase.from('trading_plans').select('pair').eq('user_id', user.id);
      if (data) setUniquePairs(['All', ...new Set(data.map(d => d.pair).filter(Boolean))]);
    };
    fetchPairs();
  }, [user]);

  const fetchPlans = useCallback(async (isLoadMore = false) => {
    if (!user) return;
    setFetchError(null);
    if (isLoadMore) setLoadingMore(true);
    else if (plans.length === 0) setLoading(true);

    try {
      /* ---------- Пошук: нечіткий, по всьому написаному ---------- */
      if (debouncedSearch.trim()) {
        if (!fuseRef.current) {
          setIndexing(true);
          indexRef.current = await loadSearchIndex(user.id);
          fuseRef.current = buildFuse(indexRef.current);
          setIndexing(false);
        }

        const hits = searchPlans(fuseRef.current, debouncedSearch);
        const rank = new Map(hits.map((h, i) => [h.id, i]));

        if (rank.size === 0) {
          setPlans([]);
          setHasMore(false);
          return;
        }

        let q = supabase.from('trading_plans').select('*')
          .eq('user_id', user.id)
          .in('id', [...rank.keys()]);
        if (selectedPair !== 'All') q = q.eq('pair', selectedPair);
        if (dateFrom) q = q.gte('date', dateFrom);
        if (dateTo) q = q.lte('date', dateTo);

        const { data: found, error: sErr } = await q;
        if (sErr) throw sErr;

        /* Порядок — за релевантністю, а не за датою */
        const ordered = (found || []).sort((a, b) => rank.get(a.id) - rank.get(b.id));
        setPlans(ordered);
        setHasMore(false);
        return;
      }

      let query = supabase.from('trading_plans').select('*', { count: 'exact' }).eq('user_id', user.id);
      
      if (selectedPair !== 'All') query = query.eq('pair', selectedPair);
      if (dateFrom) query = query.gte('date', dateFrom);
      if (dateTo) query = query.lte('date', dateTo);
      query = query.order('date', { ascending: sortOrder === 'asc' });
      
      const from = isLoadMore ? plansLengthRef.current : 0;
      const to = from + (isLoadMore ? 9 : 19);
      query = query.range(from, to);
      
      const { data, count, error } = await query;
      if (error) throw error;
      
      if (isLoadMore) {
        setPlans(prev => [...prev, ...data]);
        setHasMore(plansLengthRef.current + data.length < count);
      } else {
        setPlans(data);
        setHasMore(data.length < count);
        
        // Якщо це перший запит при переході на сторінку — не міняємо ключ, щоб не зникав кеш.
        // При наступних змінах фільтрів/сортування — пускаємо плавну хвилю.
       
        
        if (!debouncedSearch && selectedPair === 'All' && !dateFrom && !dateTo && sortOrder === 'desc') {
          localStorage.setItem('analyses_cache_v2', JSON.stringify(data));
        }
      }
    } catch (err) {
      /* Раніше помилка йшла тільки в консоль, і сторінка мовчки
         малювала «нічого не знайшлось» — виглядало як зниклі плани */
      console.error('fetchPlans', err);
      setFetchError(err.message || 'Не вдалось прочитати плани з бази.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setIndexing(false);
    }
  }, [user, debouncedSearch, selectedPair, dateFrom, dateTo, sortOrder]);

  useEffect(() => {
    fetchPlans(false);
  }, [fetchPlans]);

  useEffect(() => { 
    plansLengthRef.current = plans.length; 
  }, [plans]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        fetchPlans(true);
      }
    }, { threshold: 0.1 });
    
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, fetchPlans]);

  const handleDeleteClick = (e, plan) => { 
    e.stopPropagation(); 
    setPlanToDelete(plan); 
  };

  const confirmDelete = async () => {
    if (!planToDelete) return;
    try {
      const { error } = await supabase.from('trading_plans').delete().eq('id', planToDelete.id);
      if (error) throw error;
      
      fuseRef.current = null;   // індекс застарів
      const newPlans = plans.filter(p => p.id !== planToDelete.id);
      setPlans(newPlans);
      localStorage.setItem('analyses_cache_v2', JSON.stringify(newPlans));
      setPlanToDelete(null);
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  /* План відкриваємо строго по id з бази — вміст більше не ганяємо
     через localStorage, щоб він не лежав відкритим на диску. */
  const openPlan = (plan) => {
    localStorage.setItem('last_edited_plan_id', plan.id);
    if (plan.date && plan.pair) {
      navigate(`/plan/${plan.date}/${encodeURIComponent(plan.pair)}`, { state: { date: plan.date, pair: plan.pair, id: plan.id } });
    } else {
      navigate('/plan', { state: { id: plan.id } });
    }
  };

  const createNewPlan = () => {
    localStorage.removeItem('last_edited_plan_id');
    navigate('/plan');
  };

  /* Зведення по завантажених планах: скільки їх, скільки цього місяця,
     як часто план справджувався і яка середня оцінка сесії. */
  const summary = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const withResult = plans.map(biasResult).filter((r) => r !== null);
    const hits = withResult.filter(Boolean).length;
    const rated = plans.map((p) => p.plan_data?.sessionRating || 0).filter((r) => r > 0);

    return {
      total: plans.length,
      thisMonth: plans.filter((p) => String(p.date || '').startsWith(ym)).length,
      accuracy: withResult.length ? Math.round((hits / withResult.length) * 100) : null,
      checked: withResult.length,
      rating: rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length) : null,
      mistakes: plans.filter((p) => p.plan_data?.analysisMistake).length,
    };
  }, [plans]);

  /* Плани, згруповані по місяцях — стрічка замість плаского списку */
  const months = useMemo(() => {
    const map = new Map();
    plans.forEach((p) => {
      const key = String(p.date || '').slice(0, 7) || 'без дати';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    });

    return Array.from(map.entries()).map(([key, list]) => {
      const [y, m] = key.split('-');
      const label = m ? `${MONTHS_UA[Number(m) - 1]} ${y}` : 'Без дати';
      const withResult = list.map(biasResult).filter((r) => r !== null);
      const hits = withResult.filter(Boolean).length;
      return {
        key,
        label,
        list,
        accuracy: withResult.length ? Math.round((hits / withResult.length) * 100) : null,
      };
    });
  }, [plans]);

  const toggleSortOrder = () => {
    if (isAnimating) return; // Захист від спаму
    setIsAnimating(true);
    
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');

    // Кнопка буде сірою рівно 500мс (час анімації)
    setTimeout(() => {
      setIsAnimating(false);
    }, 500); 
  };

  if (loading && plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-zinc-500 gap-4 bg-[var(--edge-bg)]">
        <Loader2 className="animate-spin" style={{ color: T.acc }} size={40} />
        <span className="text-xs font-black uppercase tracking-widest">Initializing Secure Connection...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full relative overflow-hidden" onMouseMove={handleGlobalMouseMove}>
      <div className="fixed inset-0 z-[0] pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[150px]" style={{ background: `rgba(${T.accRgb},0.10)` }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[150px]" style={{ background: `rgba(${T.accRgb},0.06)` }}></div>
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_20%,transparent_100%)]"></div>
        <motion.div className="absolute inset-0 z-10" style={{ background: bgTemplate }} />
      </div>

      <div className="p-4 md:p-8 w-full max-w-7xl mx-auto pb-20 relative z-[10]">
        <div className="mb-8 flex flex-col gap-5 relative z-50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="min-w-0">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.22em]" style={{ fontFamily: T.sans, color: T.acc }}>
                Аналізи
              </div>
              <h1
                className="text-[26px] font-bold leading-none sm:text-[34px] lg:text-[42px]"
                style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.03em' }}
              >
                Журнал планів
              </h1>
              <p className="mt-2.5 text-[14px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                Кожен план — гіпотеза. Тут видно, скільки з них ринок підтвердив.
              </p>
            </div>

            <button
              onClick={createNewPlan}
              className="group inline-flex h-[46px] shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-5 text-[14px] font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
              style={{
                background: T.acc, color: 'var(--edge-bg, #0A0A0C)', fontFamily: T.sans,
                boxShadow: `0 6px 18px -8px rgba(${T.accRgb},0.6)`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `0 10px 26px -8px rgba(${T.accRgb},0.75)`)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 6px 18px -8px rgba(${T.accRgb},0.6)`)}
            >
              <Plus size={17} strokeWidth={3} className="shrink-0 transition-transform duration-300 group-hover:rotate-90" />
              Новий аналіз
            </button>
          </div>

          {/* зведення */}
          {plans.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: 'Планів', value: summary.total, icon: Layers,
                  hint: summary.thisMonth ? `${summary.thisMonth} цього місяця` : 'за фільтром',
                  color: T.acc,
                  progress: null,
                },
                {
                  label: 'План справдився', icon: Crosshair,
                  value: summary.accuracy === null ? '—' : `${summary.accuracy}%`,
                  hint: summary.checked ? `перевірено ${summary.checked}` : 'постав фактичний біас',
                  color: summary.accuracy === null ? T.text3 : summary.accuracy >= 60 ? T.ok : summary.accuracy >= 40 ? T.warn : T.bad,
                  progress: summary.accuracy === null ? null : summary.accuracy / 100,
                },
                {
                  label: 'Середня оцінка', icon: Star,
                  value: summary.rating === null ? '—' : summary.rating.toFixed(1),
                  hint: 'із 5 за виконання',
                  color: summary.rating === null ? T.text3 : summary.rating >= 4 ? T.ok : summary.rating >= 3 ? T.warn : T.bad,
                  progress: summary.rating === null ? null : summary.rating / 5,
                },
                {
                  label: 'З помилкою', icon: AlertTriangle,
                  value: summary.mistakes,
                  hint: 'позначено в аналізі',
                  color: summary.mistakes ? T.warn : T.ok,
                  progress: summary.total ? summary.mistakes / summary.total : null,
                },
              ].map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.32, delay: i * 0.04, ease: EASE }}
                  >
                    <Spotlight
                      clip
                      radius={260}
                      color={`${s.color}40`}
                      className="min-w-0 rounded-2xl px-4 py-3.5 transition-colors duration-300"
                      style={{ background: T.surface, border: `1px solid ${T.line}` }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${s.color}44`)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
                    >
                      {/* кольорове відлуння, що прокидається під курсором */}
                      <span
                        className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-0 blur-[34px] transition-opacity duration-500 group-hover:opacity-70"
                        style={{ background: s.color }}
                      />

                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                          {s.label}
                        </span>
                        <Icon
                          size={14}
                          strokeWidth={2.3}
                          className="shrink-0 opacity-50 transition-opacity duration-300 group-hover:opacity-100"
                          style={{ color: s.color }}
                        />
                      </div>

                      <div
                        className="mt-1.5 truncate text-[26px] font-bold tabular-nums leading-none transition-transform duration-300 group-hover:translate-x-0.5"
                        style={{ fontFamily: T.display, color: s.color }}
                      >
                        {s.value}
                      </div>

                      {/* тонка смужка під цифрою — рівень, а не просто число */}
                      {s.progress !== null && (
                        <div className="mt-2.5 h-1 overflow-hidden rounded-full" style={{ background: T.sunken }}>
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(1, s.progress) * 100}%` }}
                            transition={{ duration: 0.7, delay: 0.1 + i * 0.05, ease: premiumEasing }}
                            style={{ background: s.color }}
                          />
                        </div>
                      )}

                      <div className="mt-1.5 truncate text-[12.5px]" style={{ fontFamily: T.sans, color: T.text4 }}>
                        {s.hint}
                      </div>
                    </Spotlight>
                  </motion.div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 bg-[var(--edge-bg)]/80 backdrop-blur-xl p-2.5 rounded-2xl border border-[var(--edge-hair)] shadow-md">
            
            {/* Пошук — головний елемент рядка, тому він і виглядає так:
               ширший, з фокус-обідком і підказкою про гарячу клавішу. */}
            <div className="relative min-w-[240px] flex-1">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200"
                size={17}
                style={{ color: searchTerm ? T.acc : T.text4 }}
              />
              <input
                ref={searchRef}
                type="text"
                placeholder="Шукати всюди: актив, bias, нотатки, висновки…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 w-full rounded-xl pl-12 pr-24 text-[14.5px] outline-none transition-all duration-200"
                style={{
                  background: T.sunken,
                  border: `1px solid ${searchTerm ? T.lineAcc : T.line}`,
                  color: T.text,
                  fontFamily: T.sans,
                }}
                onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget && !searchTerm) e.currentTarget.style.borderColor = T.lineHi; }}
                onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget && !searchTerm) e.currentTarget.style.borderColor = T.line; }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = T.lineAcc;
                  e.currentTarget.style.boxShadow = `0 0 0 3px rgba(${T.accRgb},0.10)`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = searchTerm ? T.lineAcc : T.line;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />

              <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {/* Скільки знайшлось — видно одразу в полі */}
                {debouncedSearch.trim() && !loading && (
                  <span
                    className="hidden text-[12.5px] font-semibold tabular-nums sm:block"
                    style={{ fontFamily: T.sans, color: plans.length ? T.acc : T.text4 }}
                  >
                    {indexing ? 'шукаю…' : `${plans.length} ${plans.length === 1 ? 'план' : plans.length < 5 ? 'плани' : 'планів'}`}
                  </span>
                )}

                <AnimatePresence>
                  {searchTerm && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setSearchTerm('')}
                      className="grid h-7 w-7 place-items-center rounded-lg transition-colors duration-200"
                      style={{ color: T.text4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.text)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.text4)}
                    >
                      <X size={15} strokeWidth={2.6} />
                    </motion.button>
                  )}
                </AnimatePresence>

                {!searchTerm && (
                  <kbd
                    className="hidden rounded-md px-2 py-1 text-[12px] font-semibold sm:block"
                    style={{ fontFamily: T.mono, background: T.surface, border: `1px solid ${T.line}`, color: T.text4 }}
                    title="Натисни /, щоб перейти в пошук"
                  >
                    /
                  </kbd>
                )}
              </span>
            </div>
            
            <div className="w-full sm:w-40 z-[90]">
              <AssetSelect value={selectedPair} onChange={setSelectedPair} options={uniquePairs} />
            </div>
            
            <div className="w-full sm:w-auto z-[100]">
               <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            </div>

            <div className="w-px h-8 bg-white/10 hidden lg:block mx-1"></div>
            
            {/* Порядок тепер підписаний — видно, що саме змінилось */}
            <button
              onClick={toggleSortOrder}
              disabled={isAnimating}
              title="Змінити порядок"
              className="flex h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13.5px] font-semibold transition-all duration-200"
              style={{
                background: T.sunken,
                border: `1px solid ${T.line}`,
                color: T.text2,
                fontFamily: T.sans,
                opacity: isAnimating ? 0.5 : 1,
                cursor: isAnimating ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!isAnimating) { e.currentTarget.style.borderColor = T.lineHi; e.currentTarget.style.color = T.text; } }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.line; e.currentTarget.style.color = T.text2; }}
            >
              <motion.span
                className="flex"
                animate={{ rotate: sortOrder === 'desc' ? 0 : 180 }}
                transition={{ duration: 0.3, ease: premiumEasing }}
                style={{ color: T.text4 }}
              >
                <ArrowUpDown size={16} />
              </motion.span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={sortOrder}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16 }}
                  className="hidden sm:inline"
                >
                  {sortOrder === 'desc' ? 'спочатку нові' : 'спочатку старі'}
                </motion.span>
              </AnimatePresence>
            </button>

            <AnimatePresence>
              {(selectedPair !== 'All' || dateFrom || dateTo || searchTerm) && (
                <DelayedTooltip text="Clear Filters">
                  <motion.button 
                    initial={{ opacity: 0, scale: 0.3 }} 
                    animate={{ opacity: 1, scale: 1 }} 
                    exit={{ opacity: 0, scale: 0.3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => { setSelectedPair('All'); setDateFrom(''); setDateTo(''); setSearchTerm(''); }} 
                    className="p-2 text-zinc-500 hover:text-red-400 bg-[var(--edge-hair)] hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/30 ml-2 flex items-center justify-center shrink-0"
                  >
                    <motion.div
                      initial={{ rotate: -90, scale: 0.6 }}
                      animate={{ rotate: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="flex items-center justify-center"
                    >
                      <X size={18} />
                    </motion.div>
                  </motion.button>
                </DelayedTooltip>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="relative min-h-[60vh] w-full">
          {fetchError && (
            <div
              className="mb-5 flex items-start gap-3 rounded-2xl px-4 py-3.5"
              style={{ background: `rgba(${T.badRgb},0.07)`, border: `1px solid rgba(${T.badRgb},0.25)` }}
            >
              <AlertTriangle size={16} strokeWidth={2.3} className="mt-0.5 shrink-0" style={{ color: T.bad }} />
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold" style={{ fontFamily: T.sans, color: T.bad }}>
                  Плани не завантажились
                </p>
                <p className="mt-0.5 break-words text-[13px]" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {fetchError}
                </p>
              </div>
            </div>
          )}

          <div>
            {plans.length === 0 && !loadingMore && !loading ? (
              <motion.div
                key="empty-state"
                variants={fadeVariant}
                initial="hidden"
                animate="visible"
                className="flex w-full flex-col items-center justify-center rounded-3xl py-32"
                style={{ background: 'rgba(10,10,12,0.6)', border: `1px solid ${T.line}` }}
              >
                <Inbox size={44} style={{ color: T.text4 }} className="mb-4" />
                <p className="text-[14px] font-semibold" style={{ fontFamily: T.sans, color: T.text3 }}>
                  {debouncedSearch.trim() ? `Нічого не знайшлось за «${debouncedSearch.trim()}»` : 'Нічого не знайшлось'}
                </p>
                {debouncedSearch.trim() && (
                  <p className="mt-1.5 max-w-[380px] text-center text-[13px]" style={{ fontFamily: T.sans, color: T.text4, lineHeight: 1.6 }}>
                    Пошук іде по активу, bias, нотатках під таймфреймами,
                    плану на день, факту, помилках і висновках.
                  </p>
                )}
              </motion.div>
            ) : (
              /* Ключ перебудовує список при зміні сортування чи фільтра.
                 FLIP-анімація (layout) тут була зайвою: вона лишала
                 картки на старих координатах, і здавалось, що порядок
                 не змінився. Тепер список чесно збирається наново, а
                 кожна картка проявляється сама. */
              <div
                key={`${sortOrder}|${selectedPair}|${debouncedSearch}|${dateFrom}|${dateTo}`}
                className="relative w-full"
              >
                {/* стрічка по місяцях: зліва тонка лінія з вузлами */}
                <div className="absolute bottom-2 left-[7px] top-3 hidden w-px lg:block" style={{ background: T.line }} />

                <div className="flex flex-col gap-10">
                  {months.map((month) => (
                    <section key={month.key} className="relative lg:pl-10">
                      {/* вузол на лінії */}
                      <span
                        className="absolute left-0 top-[9px] hidden h-4 w-4 items-center justify-center lg:flex"
                        style={{ background: T.bg }}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: T.acc, boxShadow: `0 0 12px rgba(${T.accRgb},0.7)` }} />
                      </span>

                      {/* шапка місяця */}
                      <div className="mb-4 flex flex-wrap items-baseline gap-3">
                        <h2
                          className="text-[19px] font-bold capitalize"
                          style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.02em' }}
                        >
                          {month.label}
                        </h2>
                        <span className="text-[13px] tabular-nums" style={{ fontFamily: T.mono, color: T.text4 }}>
                          {month.list.length} {month.list.length === 1 ? 'план' : 'планів'}
                        </span>

                        {month.accuracy !== null && (
                          <span
                            className="rounded-md px-2 py-0.5 text-[12.5px] font-bold tabular-nums"
                            style={{
                              fontFamily: T.sans,
                              color: month.accuracy >= 60 ? T.ok : month.accuracy >= 40 ? T.warn : T.bad,
                              background: month.accuracy >= 60
                                ? `rgba(${T.okRgb},0.10)`
                                : month.accuracy >= 40 ? `rgba(${T.warnRgb},0.10)` : `rgba(${T.badRgb},0.10)`,
                            }}
                            title="Скільки планів справдилось цього місяця"
                          >
                            {month.accuracy}% влучань
                          </span>
                        )}

                        <span className="ml-auto hidden h-px flex-1 sm:block" style={{ background: `linear-gradient(90deg, ${T.line}, transparent)` }} />
                      </div>

                      <div className="grid w-full grid-cols-1 items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {month.list.map((plan, i) => (
                          <motion.div
                            key={plan.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.3,
                              delay: Math.min(i, 8) * 0.03,
                              ease: premiumEasing,
                            }}
                            className="relative z-10 h-full hover:z-[100]"
                          >
                            <PremiumAnalysisHover planData={plan}>
                              <AnalysisCard plan={plan} onClick={openPlan} onDelete={handleDeleteClick} />
                            </PremiumAnalysisHover>
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}
          </div>

          {hasMore && (
            <div ref={observerTarget} className="w-full h-24 flex items-center justify-center mt-6 relative z-10">
              {loadingMore ? <Loader2 className="animate-spin text-[#8b7bff]/60" size={32} /> : null}
            </div>
          )}
        </div>

        <AnimatePresence>
          {planToDelete && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm bg-black/80">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} 
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="bg-[var(--edge-bg)] border border-[var(--edge-hair-strong)] p-6 rounded-3xl max-w-sm w-full text-center shadow-2xl relative"
              >
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-500 border border-red-500/20">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-black uppercase tracking-wide mb-1 text-[var(--edge-text)]">Delete Analysis?</h3>
                <p className="text-sm text-zinc-400 mb-6 font-medium">Plan for <span className="text-[var(--edge-text)] font-mono bg-white/10 px-1 rounded">{planToDelete.pair}</span> ({planToDelete.date})</p>
                <div className="flex gap-3">
                  <button onClick={() => setPlanToDelete(null)} className="flex-1 py-3 bg-[var(--edge-hair)] hover:bg-white/10 text-[var(--edge-text)] text-xs font-black uppercase tracking-widest rounded-xl border border-[var(--edge-hair)] transition-colors">Cancel</button>
                  <button onClick={confirmDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-[var(--edge-text)] text-xs font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-red-500/20">Delete</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}