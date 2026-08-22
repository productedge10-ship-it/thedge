import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, AlertCircle, ArrowUpRight, ArrowDownRight, Calendar as CalendarIcon, X, Filter, Activity, Clock, ChevronLeft, ChevronRight, BarChart2, Layers } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, isFuture, isToday } from 'date-fns';
import { Panel, Delta } from './ui';
import { EMOTION_COLOR, EMOTION_LABEL, signed } from './data';

// ==========================================
// ЛОКАЛІЗАЦІЯ ДАТ
// ==========================================
const UKR_MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const UKR_DAYS_SHORT = ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const UKR_DAYS_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];

function getUkrDayIndex(date) { return (date.getDay() + 6) % 7; } // Пн = 0, Нд = 6

// ==========================================
// АНІМАЦІЇ
// ==========================================
const premiumEasing = [0.22, 1, 0.36, 1];

const staggerContainer = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const rowVariant = {
  hidden: { opacity: 0, y: 15, scale: 0.98, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.4, ease: premiumEasing } },
  exit: { opacity: 0, scale: 0.98, filter: "blur(4px)", transition: { duration: 0.2 } }
};

// ==========================================
// SPOTLIGHT ЕФЕКТИ
// ==========================================
function SpotlightRow({ children, className, isProfit, isLoss }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left); mouseY.set(clientY - top);
  }
  const glow = isProfit ? "rgba(52, 211, 153, 0.12)" : isLoss ? "rgba(248,113,113, 0.12)" : "rgba(255, 255, 255, 0.05)";
  return (
    <div onMouseMove={handleMouseMove} className={`relative group w-full overflow-hidden ${className}`}>
      <motion.div className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 rounded-[inherit]" style={{ background: useMotionTemplate`radial-gradient(500px circle at ${mouseX}px ${mouseY}px, ${glow}, transparent 60%)` }} />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}

function SpotlightCard({ children, className, glowColor = "rgba(255,255,255,0.06)" }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  function handleMouseMove({ currentTarget, clientX, clientY }) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left); mouseY.set(clientY - top);
  }
  return (
    <div onMouseMove={handleMouseMove} className={`relative group/spotlight w-full h-full overflow-hidden ${className}`}>
      <motion.div className="pointer-events-none absolute -inset-px z-0 opacity-0 transition-opacity duration-500 group-hover/spotlight:opacity-100 rounded-[inherit]" style={{ background: useMotionTemplate`radial-gradient(400px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 60%)` }} />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

// ==========================================
// ВЕЛИКИЙ ДЕТАЛЬНИЙ КАЛЕНДАР
// ==========================================
function DetailedActivityCalendar({ tradesByDate, selectedDate, setSelectedDate }) {
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'
  const [navDate, setNavDate] = useState(selectedDate || new Date());

  const handlePrev = () => setNavDate(viewMode === 'month' ? subMonths(navDate, 1) : subWeeks(navDate, 1));
  const handleNext = () => setNavDate(viewMode === 'month' ? addMonths(navDate, 1) : addWeeks(navDate, 1));

  const days = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(navDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(navDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else {
      const start = startOfWeek(navDate, { weekStartsOn: 1 });
      const end = endOfWeek(navDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
  }, [navDate, viewMode]);

  return (
    <Panel 
      title={<><CalendarIcon size={14} /> Календар активності</>} 
      right={
        <div className="flex bg-[var(--edge-bg)]/50 border border-[var(--edge-hair-strong)] rounded-lg p-1">
          <button onClick={() => setViewMode('month')} className={`px-4 py-1.5 rounded-md transition-all text-[11px] font-bold tracking-wide uppercase ${viewMode === 'month' ? 'bg-[#8b7bff] text-[var(--edge-text)] shadow-[0_0_15px_rgba(139,123,255,0.3)]' : 'text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)]'}`}>Місяць</button>
          <button onClick={() => setViewMode('week')} className={`px-4 py-1.5 rounded-md transition-all text-[11px] font-bold tracking-wide uppercase ${viewMode === 'week' ? 'bg-[#8b7bff] text-[var(--edge-text)] shadow-[0_0_15px_rgba(139,123,255,0.3)]' : 'text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)]'}`}>Тиждень</button>
        </div>
      }
      className="w-full relative z-20"
    >
      {/* Шапка календаря */}
      <div className="flex items-center justify-between mt-2 mb-6 px-2">
        <div className="flex items-center gap-4">
          <button onClick={handlePrev} className="p-2 bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] hover:border-white/20 hover:bg-[var(--edge-hair)] rounded-xl text-[#7A7A85] hover:text-[var(--edge-text)] transition-all"><ChevronLeft size={18} /></button>
          <div className="flex flex-col">
            <span className="text-[22px] font-black tracking-tight text-[#FAFAFA] font-['Instrument_Serif',serif] leading-none">
              {UKR_MONTHS[navDate.getMonth()]} {navDate.getFullYear()}
            </span>
            {viewMode === 'week' && <span className="text-[11px] text-[#8b7bff] font-bold uppercase tracking-wider mt-1">Тижневий зріз</span>}
          </div>
          <button onClick={handleNext} className="p-2 bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] hover:border-white/20 hover:bg-[var(--edge-hair)] rounded-xl text-[#7A7A85] hover:text-[var(--edge-text)] transition-all"><ChevronRight size={18} /></button>
        </div>

        {selectedDate && (
          <button onClick={() => setSelectedDate(null)} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-[#f87171] hover:text-[var(--edge-text)] transition-colors bg-[#f87171]/10 hover:bg-[#f87171] px-3 py-1.5 rounded-lg border border-[#f87171]/20">
            <X size={14} /> Скинути вибір
          </button>
        )}
      </div>

      {/* Дні тижня (Заголовки) */}
      <div className="grid grid-cols-7 gap-2 mb-2 px-1">
        {UKR_DAYS_SHORT.map(d => <div key={d} className="text-right pr-2 text-[10px] font-black tracking-widest uppercase text-[#7A7A85] pb-2 border-b border-[var(--edge-hair)]">{d}</div>)}
      </div>

      {/* Сітка */}
      <div className="grid grid-cols-7 gap-2 px-1 pb-2">
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const tList = tradesByDate[dateStr] || [];
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, navDate);
          const isTodayDate = isToday(day);
          
          const rValue = tList.length ? tList.reduce((acc, t) => acc + t.rr, 0) : null;
          const isProfit = rValue > 0;
          const isLoss = rValue < 0;
          const isBE = rValue === 0;

          const glowColor = isProfit ? "rgba(52, 211, 153, 0.25)" : isLoss ? "rgba(248,113,113, 0.25)" : "rgba(255, 255, 255, 0.1)";
          const cellHeight = viewMode === 'month' ? 'h-[110px]' : 'min-h-[180px] h-auto';

          // Підрахунок для тултіпу
          const wins = tList.filter(t => t.rr > 0).length;
          const wr = tList.length ? Math.round((wins / tList.length) * 100) : 0;
          const longs = tList.filter(t => t.side === 'LONG').length;
          const mistakes = tList.reduce((acc, t) => acc + t.mistakes.length, 0);
          const uniqueAssets = [...new Set(tList.map(t => t.asset))].join(', ');

          return (
            <div key={day.toString()} className="relative group/cell z-10 hover:z-50">
              <button
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`w-full text-left transition-all duration-300 rounded-[14px] ${cellHeight} ${!isCurrentMonth && viewMode === 'month' ? 'opacity-40 grayscale hover:grayscale-0 hover:opacity-100' : ''}`}
              >
                <SpotlightCard glowColor={glowColor} className={`rounded-[14px] border ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#131316]' : ''} ${tList.length ? (isProfit ? 'border-[#34d399]/30 bg-[#34d399]/[0.03]' : isLoss ? 'border-[#f87171]/30 bg-[#f87171]/[0.03]' : 'border-[var(--edge-hair-strong)] bg-[var(--edge-hair)]') : 'border-[var(--edge-hair)] bg-[var(--edge-surface-hi)]/40 hover:bg-[var(--edge-surface-hi)]/80'}`}>
                  <div className="w-full h-full p-2.5 flex flex-col justify-between relative overflow-hidden">
                    
                    {/* Топ: Число і День */}
                    <div className="flex justify-between items-start z-10">
                      <span className={`text-[18px] font-black leading-none ${isTodayDate ? 'text-[#8b7bff] drop-shadow-[0_0_8px_rgba(139,123,255,0.8)]' : 'text-[#FAFAFA]'}`}>{format(day, 'd')}</span>
                      <span className="text-[9px] uppercase font-bold text-[#7A7A85] tracking-wider">{UKR_MONTHS[day.getMonth()].slice(0,3)}</span>
                    </div>

                    {/* Центр: R Значення */}
                    {tList.length > 0 && viewMode === 'month' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <b className={`text-[24px] font-black tracking-tighter ${isProfit ? 'text-[#34d399] drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]' : isLoss ? 'text-[#f87171] drop-shadow-[0_0_15px_rgba(248,113,113,0.5)]' : 'text-[#B4B4BD]'}`}>
                          {signed(rValue, 1)}
                        </b>
                      </div>
                    )}

                    {/* Тижневий вид: Список угод */}
                    {tList.length > 0 && viewMode === 'week' && (
                      <div className="flex-1 mt-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 relative z-10">
                        {tList.map((t, i) => (
                          <div key={i} className="flex justify-between items-center bg-[var(--edge-bg)]/60 p-1.5 rounded-md border border-[var(--edge-hair)]">
                            <span className="text-[10px] font-bold text-[var(--edge-text)] truncate max-w-[50px]">{t.asset}</span>
                            <span className={`text-[10px] font-black ${t.rr >= 0 ? 'text-[#34d399]' : 'text-[#f87171]'}`}>{signed(t.rr, 1)}R</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Низ: Бедж угод (для місяця) або Тотал (для тижня) */}
                    <div className="relative z-10 mt-auto flex justify-between items-end">
                      {tList.length > 0 ? (
                        <>
                          <span className="text-[10px] font-bold text-[#B4B4BD] bg-[var(--edge-bg)]/80 px-1.5 py-0.5 rounded backdrop-blur-sm border border-[var(--edge-hair)]">
                            {tList.length} уг.
                          </span>
                          {viewMode === 'week' && (
                            <b className={`text-[14px] font-black ${isProfit ? 'text-[#34d399]' : isLoss ? 'text-[#f87171]' : 'text-[#B4B4BD]'}`}>{signed(rValue, 1)}R</b>
                          )}
                        </>
                      ) : (
                        <span className="text-[9px] uppercase tracking-widest text-[#4A4A52] font-bold opacity-0 group-hover/cell:opacity-100 transition-opacity">Немає угод</span>
                      )}
                    </div>
                  </div>
                </SpotlightCard>
              </button>

              {/* ХОВЕР ТУЛТІП (Тільки в режимі Місяця і якщо є угоди) */}
              {viewMode === 'month' && tList.length > 0 && (
                <div className="absolute bottom-[calc(100%+12px)] left-1/2 -translate-x-1/2 w-[260px] opacity-0 invisible group-hover/cell:opacity-100 group-hover/cell:visible transition-all duration-300 z-[100] pointer-events-none">
                  <div className="bg-[var(--edge-sunken)]/95 backdrop-blur-2xl border border-[var(--edge-hair-strong)] rounded-[16px] p-4 shadow-[0_30px_60px_rgba(0,0,0,0.8)] relative">
                    {/* Стрілочка вниз */}
                    <div className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-[var(--edge-sunken)] border-b border-r border-[var(--edge-hair-strong)] rotate-45" />
                    
                    <div className="flex justify-between items-start border-b border-[var(--edge-hair)] pb-3 mb-3">
                      <div>
                        <span className="text-[10px] text-[#7A7A85] font-black uppercase tracking-widest">{UKR_DAYS_FULL[getUkrDayIndex(day)]}</span>
                        <h4 className="text-[var(--edge-text)] text-[15px] font-bold m-0 leading-tight">{format(day, 'd')} {UKR_MONTHS[day.getMonth()]} {day.getFullYear()}</h4>
                      </div>
                      <b className={`text-[18px] font-black ${isProfit ? 'text-[#34d399]' : isLoss ? 'text-[#f87171]' : 'text-[#B4B4BD]'}`}>{signed(rValue, 2)}R</b>
                    </div>

                    <div className="grid grid-cols-1 gap-3 mb-3 sm:grid-cols-2">
                      <div className="bg-[var(--edge-hair)] rounded-lg p-2">
                        <span className="block text-[9px] text-[#7A7A85] uppercase font-bold mb-1">Угод</span>
                        <b className="text-[var(--edge-text)] text-[14px]">{tList.length}</b>
                      </div>
                      <div className="bg-[var(--edge-hair)] rounded-lg p-2">
                        <span className="block text-[9px] text-[#7A7A85] uppercase font-bold mb-1">Вінрейт</span>
                        <b className="text-[var(--edge-text)] text-[14px]">{wr}%</b>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 text-[11.5px] text-[#B4B4BD]">
                      <div className="flex justify-between"><span>Напрямки:</span> <b className="text-[var(--edge-text)]"><span className="text-[#34d399]">{longs} L</span> / <span className="text-[#f87171]">{tList.length - longs} S</span></b></div>
                      <div className="flex justify-between"><span>Активи:</span> <b className="text-[var(--edge-text)] truncate max-w-[120px] text-right">{uniqueAssets}</b></div>
                      {mistakes > 0 && <div className="flex justify-between items-center mt-1 pt-1 border-t border-[var(--edge-hair)]"><span className="text-[#f87171] flex items-center gap-1"><AlertCircle size={12}/> Помилок:</span> <b className="text-[#f87171]">{mistakes}</b></div>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ==========================================
// ГОЛОВНИЙ КОМПОНЕНТ HISTORY
// ==========================================
export default function History({ s }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Реф для скролу до списку
  const listRef = useRef(null);

  useEffect(() => { setCurrentPage(1); }, [query, filter, selectedDate]);

  // Угруповання угод по датах (для календаря)
  const tradesByDate = useMemo(() => {
    const map = {};
    s.trades.forEach(t => {
      if(!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return map;
  }, [s]);

  // Фільтрація
  const filtered = useMemo(() => {
    return s.trades.slice().reverse().filter((t) => {
      const q = query.trim().toLowerCase();
      const okQ = !q || [t.asset, t.side, t.account, t.setup, t.session, EMOTION_LABEL[t.emotion]].join(' ').toLowerCase().includes(q);
      const okF = filter === 'all' ? true : filter === 'win' ? t.result === 'WIN' : filter === 'loss' ? t.result === 'LOSS' : filter === 'mistake' ? t.mistakes.length > 0 : filter === 'clean' ? t.mistakes.length === 0 : t.planFollowed;
      const okDate = selectedDate ? t.date === format(selectedDate, 'yyyy-MM-dd') : true;
      return okQ && okF && okDate;
    });
  }, [s.trades, query, filter, selectedDate]);

  // Пагінація
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const paginatedTrades = useMemo(() => filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE), [filtered, currentPage]);

  const paginationButtons = useMemo(() => {
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, currentPage + 2);
    if (currentPage <= 3) end = Math.min(5, totalPages);
    if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);
    const btns = [];
    for (let i = start; i <= end; i++) btns.push(i);
    return btns;
  }, [currentPage, totalPages]);

  // Скрол до списку при виборі дати
  const handleDateSelect = (date) => {
    setSelectedDate(date);
    if (date && listRef.current) {
      setTimeout(() => { listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-baseline gap-4 mb-2">
        <h2 className="font-['Instrument_Serif',serif] text-[30px] font-normal m-0 tracking-[0.2px] text-[var(--edge-text)]">Історія угод</h2>
        <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[#7A7A85] font-bold">
          Всього {s.trades.length} записів
        </span>
      </div>

      {/* ВЕЛИКИЙ КАЛЕНДАР (Тепер він головний фільтр) */}
      <DetailedActivityCalendar tradesByDate={tradesByDate} selectedDate={selectedDate} setSelectedDate={handleDateSelect} />

      {/* ФІЛЬТРИ ТА ПОШУК ДЛЯ СПИСКУ */}
      <div ref={listRef} className="bg-[var(--edge-surface-hi)]/80 backdrop-blur-xl border border-[var(--edge-hair)] rounded-[16px] p-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 sticky top-4 z-30 shadow-2xl mt-4 scroll-mt-[20px]">
        
        <div className="flex items-center gap-[10px] w-full lg:w-[320px] bg-[var(--edge-bg)]/50 border border-[#232328] rounded-[12px] px-3 py-2.5 transition-colors focus-within:border-[#8b7bff]/50 focus-within:bg-[var(--edge-bg)] shrink-0">
          <Search size={16} className="text-[#7A7A85]" />
          <input 
            value={query} onChange={(e) => setQuery(e.target.value)} 
            placeholder="Пошук по активу, сетапу, емоції..." 
            className="bg-transparent border-none outline-none text-[#FAFAFA] text-[13px] w-full placeholder:text-[#4A4A52]" 
          />
        </div>

        <div className="flex items-center justify-between w-full lg:w-auto gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar flex-1 pb-1 lg:pb-0">
            <Filter size={14} className="text-[#7A7A85] mr-2 shrink-0 hidden sm:block" />
            {[{ k: 'all', l: 'Усі' }, { k: 'win', l: 'Плюс' }, { k: 'loss', l: 'Мінус' }, { k: 'mistake', l: 'З помилкою' }, { k: 'clean', l: 'Чисті' }].map(({ k, l }) => (
              <button 
                key={k} onClick={() => setFilter(k)}
                className={`shrink-0 text-[11.5px] px-3.5 py-2 rounded-[10px] font-bold transition-all duration-200 border 
                  ${filter === k ? 'bg-white/10 text-[var(--edge-text)] border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'bg-transparent text-[#7A7A85] border-transparent hover:bg-[var(--edge-hair)] hover:text-[#FAFAFA]'}`}
              >{l}</button>
            ))}
          </div>

          {selectedDate && (
             <div className="shrink-0 flex items-center gap-2 bg-[#8b7bff]/10 border border-[#8b7bff]/20 px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-[#8b7bff]">
               <CalendarIcon size={13}/>
               {format(selectedDate, 'dd.MM.yyyy')}
             </div>
          )}
        </div>
      </div>

      {/* СПИСОК УГОД (КАРТКИ) */}
      <div className="flex flex-col gap-2 min-h-[400px]">
        <AnimatePresence mode="popLayout">
          {paginatedTrades.length > 0 ? (
            <motion.div key={`page-${currentPage}`} variants={staggerContainer} initial="hidden" animate="visible" exit="exit" className="flex flex-col gap-2">
              {paginatedTrades.map((t) => {
                const isProfit = t.rr > 0;
                const isLoss = t.rr < 0;
                
                return (
                  <motion.div key={t.id} layout variants={rowVariant}>
                    <SpotlightRow isProfit={isProfit} isLoss={isLoss} className="rounded-[14px]">
                      <div className="bg-[var(--edge-surface-hi)]/60 backdrop-blur-md border border-[var(--edge-hair)] rounded-[14px] p-4 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 transition-colors hover:border-[var(--edge-hair-strong)] group/row cursor-default">
                        
                        {/* ЛІВА ЧАСТИНА: Дата, Актив, Напрямок */}
                        <div className="flex items-center gap-5 min-w-[260px] shrink-0">
                          <div className="flex flex-col gap-1 w-[80px]">
                            <span className="text-[14px] font-black text-[var(--edge-text)]">{t.asset}</span>
                            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: t.side === 'LONG' ? '#34d399' : '#f87171' }}>
                              {t.side === 'LONG' ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}{t.side}
                            </div>
                          </div>

                          <div className="w-px h-8 bg-[var(--edge-hair)] hidden lg:block" />

                          <div className="flex flex-col gap-1 text-[#7A7A85]">
                            <span className="flex items-center gap-1.5 text-[11.5px] font-medium"><CalendarIcon size={12}/> {t.date}</span>
                            <span className="flex items-center gap-1.5 text-[11.5px] font-medium"><Clock size={12}/> {String(t.hour).padStart(2, '0')}:00 · {t.session}</span>
                          </div>
                        </div>

                        {/* СЕРЕДНЯ ЧАСТИНА: Сетап, Емоція, Помилки */}
                        <div className="flex-1 flex flex-wrap items-center gap-4 lg:gap-8 w-full xl:w-auto">
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <span className="text-[9px] uppercase tracking-widest text-[#7A7A85] font-black">Сетап / Акаунт</span>
                            <span className="text-[12.5px] text-[#FAFAFA] font-bold">{t.setup}</span>
                            <span className="text-[11px] text-[#7A7A85]">{t.account}</span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center justify-center text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-[8px] border bg-[var(--edge-surface-hi)]" style={{ color: EMOTION_COLOR[t.emotion], borderColor: EMOTION_COLOR[t.emotion] + '40' }}>
                              {EMOTION_LABEL[t.emotion]}
                            </span>
                            
                            {t.mistakes.length > 0 && (
                              <div className="flex gap-1.5 flex-wrap">
                                {t.mistakes.map(m => (
                                  <span key={m} className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-1.5 rounded-[8px] bg-[#f87171]/10 text-[#f87171] border border-[#f87171]/20">
                                    <AlertCircle size={12} /> {m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ПРАВА ЧАСТИНА: R */}
                        <div className="flex items-center justify-end w-full xl:w-auto mt-2 xl:mt-0 shrink-0">
                          <div className="flex flex-col items-end min-w-[80px]">
                            <span className="text-[9px] uppercase tracking-widest text-[#7A7A85] font-black mb-0.5">Результат</span>
                            <b 
                              className="text-[24px] font-black tracking-tighter leading-none transition-all duration-300"
                              style={{ color: isProfit ? '#34d399' : isLoss ? '#f87171' : 'var(--edge-text2, #B4B4BD)', textShadow: isProfit ? '0 0 15px rgba(52,211,153,0.4)' : isLoss ? '0 0 15px rgba(248,113,113,0.4)' : 'none' }}
                            >
                              {signed(t.rr, 2)}R
                            </b>
                          </div>
                        </div>

                      </div>
                    </SpotlightRow>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 px-4 text-center border border-dashed border-[var(--edge-hair-strong)] rounded-[16px] bg-[var(--edge-surface-hi)]/30">
              <Layers size={32} className="text-[#4A4A52] mb-3" />
              <h3 className="text-[16px] text-[#FAFAFA] font-bold mb-1">Немає угод</h3>
              <p className="text-[12.5px] text-[#7A7A85]">За вибраними фільтрами або датою нічого не знайдено.</p>
              {(query || filter !== 'all' || selectedDate) && (
                <button onClick={() => { setQuery(''); setFilter('all'); setSelectedDate(null); }} className="mt-4 px-4 py-2 bg-[var(--edge-hair)] hover:bg-white/10 text-[#FAFAFA] text-[12px] font-bold rounded-[8px] transition-colors">
                  Скинути фільтри
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ПАГІНАЦІЯ */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 pb-8">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-[10px] bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] transition-colors disabled:opacity-50 disabled:pointer-events-none"><ChevronLeft size={16} /></button>
          {paginationButtons.map(p => (
            <button key={p} onClick={() => setCurrentPage(p)} className={`w-9 h-9 rounded-[10px] text-[12px] font-bold transition-all duration-200 border ${currentPage === p ? 'bg-[#8b7bff] text-[var(--edge-text)] border-[#8b7bff] shadow-[0_0_15px_rgba(139,123,255,0.3)]' : 'bg-[var(--edge-surface-hi)] text-[#7A7A85] border-[var(--edge-hair)] hover:border-white/20 hover:text-[#FAFAFA]'}`}>{p}</button>
          ))}
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-[10px] bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] text-[#7A7A85] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] transition-colors disabled:opacity-50 disabled:pointer-events-none"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}