// src/components/trading/DateRangePicker.jsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css'; 
import { format } from 'date-fns';
import { uk } from 'date-fns/locale';
import { 
  formatDate, getToday, getThisWeek, 
  getThisMonth, getLast3Months, parseDateString 
} from '../../utils/journalUtils';

export default function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [range, setRange] = useState(() => {
    const from = parseDateString(dateFrom);
    const to = parseDateString(dateTo);
    return from || to ? { from, to } : undefined;
  });

  useEffect(() => {
    const from = parseDateString(dateFrom);
    const to = parseDateString(dateTo);
    setRange(from || to ? { from, to } : undefined);
  }, [dateFrom, dateTo, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApply = () => {
    const fromStr = range?.from ? formatDate(range.from) : '';
    const toStr = range?.to ? formatDate(range.to) : '';
    onChange(fromStr, toStr);
    setIsOpen(false);
  };

  const setPreset = (fromStr, toStr) => {
    onChange(fromStr, toStr);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (!dateFrom && !dateTo) return "За весь час";
    if (dateFrom && dateTo) {
      return `${format(parseDateString(dateFrom), 'dd MMM', { locale: uk })} — ${format(parseDateString(dateTo), 'dd MMM', { locale: uk })}`;
    }
    if (dateFrom) return `Від ${format(parseDateString(dateFrom), 'dd MMM yy', { locale: uk })}`;
    if (dateTo) return `До ${format(parseDateString(dateTo), 'dd MMM yy', { locale: uk })}`;
    return "Період не вибрано";
  };

  return (
    <div className="relative w-full sm:w-auto shrink-0" ref={dropdownRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full sm:w-[210px] bg-[var(--edge-hair)] hover:bg-[var(--edge-hair)] border border-[var(--edge-hair)] hover:border-[var(--edge-hair-strong)] px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-300"
      >
        <div className="flex items-center gap-2.5 text-zinc-200 overflow-hidden">
          <CalendarDays size={14} className="text-blue-500/80 shrink-0" />
          <span className="text-xs font-bold tracking-wide truncate">{getDisplayText()}</span>
        </div>
        <ChevronDown size={14} className={`text-zinc-500 shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5, filter: "blur(4px)" }} 
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} 
            exit={{ opacity: 0, y: -5, filter: "blur(4px)" }}
            transition={{ duration: 0.2 }}
            className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 bg-[var(--edge-bg)]/95 backdrop-blur-2xl border border-[var(--edge-hair-strong)] rounded-2xl shadow-[0_30px_60px_rgba(0,0,0,0.9)] z-[100] flex flex-col md:flex-row overflow-hidden w-[95vw] sm:w-auto"
          >
            <div className="w-full md:w-[160px] bg-black/40 border-b md:border-b-0 md:border-r border-[var(--edge-hair)] flex flex-col p-3 gap-1.5 shrink-0">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 px-3 mb-2 mt-1">Швидкий вибір</span>
              {[
                { label: 'Сьогодні', from: getToday(), to: getToday() },
                { label: 'Цей тиждень', from: getThisWeek().from, to: getThisWeek().to },
                { label: 'Цей місяць', from: getThisMonth().from, to: getThisMonth().to },
                { label: 'Останні 3 міс.', from: getLast3Months().from, to: getLast3Months().to }
              ].map((preset, idx) => (
                <button key={idx} onClick={() => setPreset(preset.from, preset.to)} className="text-left px-3 py-2.5 text-xs font-bold text-zinc-400 hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] rounded-lg transition-colors">
                  {preset.label}
                </button>
              ))}
              <div className="h-px bg-[var(--edge-hair)] my-2"></div>
              <button onClick={() => setPreset('', '')} className="text-left px-3 py-2.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">Весь час</button>
            </div>

            <div className="p-5 flex flex-col items-center bg-transparent w-full">
              <DayPicker 
                mode="range" 
                selected={range} 
                onSelect={setRange} 
                locale={uk} 
                showOutsideDays 
                className="trade-calendar m-0 w-full" 
              />
              <div className="flex justify-end gap-3 pt-5 border-t border-[var(--edge-hair)] mt-4 w-full">
                <button onClick={() => setIsOpen(false)} className="px-5 py-2 text-xs font-bold text-zinc-400 hover:text-[var(--edge-text)] transition-colors bg-[var(--edge-hair)] rounded-xl border border-[var(--edge-hair)] hover:bg-[var(--edge-hair-strong)]">Скасувати</button>
                <button onClick={handleApply} className="px-6 py-2 bg-blue-600/90 hover:bg-blue-500 text-[var(--edge-text)] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(59,130,246,0.4)] active:scale-95">Застосувати</button>
              </div>
            </div>

            <style>{`
              .trade-calendar { 
                --rdp-cell-size: 36px; 
                margin: 0; 
              }
              
              /* Скидання базових стилів кнопок, щоб прибрати білі артефакти */
              .trade-calendar .rdp-button { 
                background: transparent !important; 
                border: none !important; 
                outline: none !important; 
              }
              
              /* Базовий стиль для кожного дня */
              .trade-calendar .rdp-day { 
                color: #d4d4d8; 
                border-radius: 10px; /* Красиві заокруглення за замовчуванням */
                font-weight: 500; 
                font-size: 13px; 
                background-color: transparent !important;
                transition: background-color 0.2s, color 0.2s;
              }
              
              /* Ховер для звичайних днів */
              .trade-calendar .rdp-day:hover:not(.rdp-day_selected) { 
                background-color: rgba(255, 255, 255, 0.08) !important; 
                color: white; 
              }
              
              /* --- СТИЛІЗАЦІЯ ВИБРАНОГО ДІАПАЗОНУ --- */
              
              /* Загальний стиль для всіх вибраних днів (включаючи початок і кінець) */
              .trade-calendar .rdp-day_selected { 
                background-color: #3b82f6 !important; 
                color: white !important; 
                font-weight: 800; 
                box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
              }
              
              /* Середина діапазону (між початком і кінцем) */
              .trade-calendar .rdp-day_range_middle { 
                background-color: rgba(59, 130, 246, 0.15) !important; 
                color: #93c5fd !important; 
                border-radius: 0 !important; /* Прибираємо заокруглення, щоб з'єднати в лінію */
                box-shadow: none !important; /* Прибираємо світіння всередині діапазону */
              }
              
              /* З'єднання для першого дня діапазону */
              .trade-calendar .rdp-day_range_start { 
                border-radius: 10px 0 0 10px !important; 
              }
              
              /* З'єднання для останнього дня діапазону */
              .trade-calendar .rdp-day_range_end { 
                border-radius: 0 10px 10px 0 !important; 
              }
              
              /* Якщо вибрано лише один день (старт і кінець співпадають) */
              .trade-calendar .rdp-day_range_start.rdp-day_range_end {
                border-radius: 10px !important;
              }

              /* Інші дні, що не належать поточному місяцю */
              .trade-calendar .rdp-day_outside {
                opacity: 0.3;
              }

              /* --- СТИЛІЗАЦІЯ ШАПКИ ТА НАВІГАЦІЇ --- */
              .trade-calendar .rdp-head_cell { 
                color: #71717a; 
                font-size: 10px; 
                font-weight: 800; 
                text-transform: uppercase; 
                padding-bottom: 12px; 
                letter-spacing: 0.1em; 
              }
              
              .trade-calendar .rdp-nav_button { 
                background-color: rgba(255, 255, 255, 0.03) !important; 
                border: 1px solid rgba(255, 255, 255, 0.05) !important; 
                border-radius: 8px; 
                width: 28px; 
                height: 28px; 
                display: flex; 
                align-items: center; 
                justify-content: center; 
                transition: all 0.2s; 
                color: #a1a1aa; 
              }
              
              .trade-calendar .rdp-nav_button:hover { 
                background-color: rgba(255, 255, 255, 0.1) !important; 
                border-color: rgba(255, 255, 255, 0.2) !important; 
                color: white; 
              }
              
              .trade-calendar .rdp-caption_label { 
                font-size: 15px; 
                font-weight: 800; 
                color: #fff; 
                text-transform: capitalize; 
              }
              
              @media (max-width: 640px) {
                .trade-calendar { 
                  --rdp-cell-size: 38px; 
                  width: 100%; 
                  display: flex; 
                  justify-content: center; 
                }
              }
            `}</style>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}