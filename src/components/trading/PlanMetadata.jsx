import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Link as LinkIcon, Book, Search as SearchIcon, Loader2, Layers, Check } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { format, subDays } from 'date-fns';
import { uk } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';

import NarrativeSelect from '../ui/NarrativeSelect';
import { T, EASE, SPRING } from './planTheme';
import { FieldLabel } from './PlanPrimitives';

const QUICK_ASSETS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSDT', 'NQ100', 'GER40', 'DXY', 'S&P500'];

const CONTROL = 'flex h-[42px] w-full items-center justify-between rounded-xl px-3.5 text-[15px] font-semibold transition-all duration-200';

/* ---------------- Date picker ---------------- */
function PlanDatePicker({ dateStr, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = dateStr ? new Date(dateStr) : new Date();

  useEffect(() => {
    const onDoc = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (d) => {
    if (!d) return;
    const p = (n) => String(n).padStart(2, '0');
    onChange(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    setOpen(false);
  };

  return (
    <div className="relative w-full" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={CONTROL}
        style={{
          background: T.sunken,
          border: `1px solid ${open ? T.lineAcc : T.line}`,
          color: T.text,
          fontFamily: T.sans,
        }}
        onMouseEnter={(e) => !open && (e.currentTarget.style.borderColor = T.lineHi)}
        onMouseLeave={(e) => !open && (e.currentTarget.style.borderColor = T.line)}
      >
        {format(selected, 'dd.MM.yyyy')}
        <Calendar size={14} strokeWidth={2.2} style={{ color: T.text4 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute left-0 top-[calc(100%+8px)] z-[200] flex overflow-hidden rounded-2xl"
            style={{
              background: T.surface,
              border: `1px solid ${T.lineHi}`,
              boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
            }}
          >
            <div className="flex w-[118px] shrink-0 flex-col gap-0.5 p-2" style={{ borderRight: `1px solid ${T.line}`, background: T.sunken }}>
              <span className="px-2.5 pb-1 pt-1.5 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text4 }}>
                Швидко
              </span>
              {[['Сьогодні', 0], ['Вчора', 1], ['Позавчора', 2]].map(([label, n]) => (
                <button
                  key={label}
                  onClick={() => pick(subDays(new Date(), n))}
                  className="rounded-lg px-2.5 py-2 text-left text-[14px] font-semibold transition-colors"
                  style={{ color: T.text2 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceHi; e.currentTarget.style.color = T.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text2; }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="p-3">
              <DayPicker mode="single" selected={selected} onSelect={pick} locale={uk} showOutsideDays className="edge-cal m-0" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Metadata bar ---------------- */
export default function PlanMetadata({
  date, onDateChange,
  pair, onOpenAssetModal, isLoadingAssets,
  narrative, onNarrativeChange,
  onSwitchAsset,
}) {
  const [showQuick, setShowQuick] = useState(false);

  return (
    <div
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: T.surface, border: `1px solid ${T.line}` }}
    >
      <style>{`
        .edge-cal { --rdp-cell-size: 34px; --rdp-accent-color: ${T.acc}; --rdp-background-color: transparent; margin: 0; font-family: ${T.sans}; }
        .edge-cal .rdp-button { background: transparent !important; border: none; }
        .edge-cal .rdp-day { color: ${T.text2}; border-radius: 9px; font-weight: 600; font-size: 12.5px; transition: all .18s; }
        .edge-cal .rdp-day:hover:not(.rdp-day_selected) { background: ${T.surfaceHi} !important; color: ${T.text} !important; }
        .edge-cal .rdp-day_selected { background: ${T.acc} !important; color: var(--edge-on-acc, #0A0A0C) !important; font-weight: 700; }
        .edge-cal .rdp-day_today:not(.rdp-day_selected) { color: ${T.acc} !important; }
        .edge-cal .rdp-day_outside { color: ${T.text4} !important; }
        .edge-cal .rdp-head_cell { color: ${T.text4}; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; padding-bottom: 6px; }
        .edge-cal .rdp-caption_label { font-size: 13px; font-weight: 700; color: ${T.text}; text-transform: capitalize; font-family: ${T.display}; }
        .edge-cal .rdp-nav_button { background: ${T.sunken} !important; border: 1px solid ${T.line} !important; border-radius: 8px; width: 26px; height: 26px; color: ${T.text2}; }
        .edge-cal .rdp-nav_button:hover { background: ${T.surfaceHi} !important; }
      `}</style>

      <div className="flex flex-wrap items-end gap-4">
        {/* Дата */}
        <div className="flex min-w-[150px] flex-1 flex-col gap-2 sm:max-w-[180px]">
          <FieldLabel icon={Calendar}>Дата</FieldLabel>
          <PlanDatePicker dateStr={date} onChange={onDateChange} />
        </div>

        {/* Актив */}
        <div className="flex min-w-[150px] flex-1 flex-col gap-2 sm:max-w-[190px]">
          <FieldLabel icon={LinkIcon} required filled={!!pair}>Актив</FieldLabel>
          <motion.button
            whileTap={{ scale: 0.985 }}
            onClick={onOpenAssetModal}
            disabled={isLoadingAssets}
            className={CONTROL}
            style={{
              background: T.sunken,
              border: `1px solid ${pair ? T.lineAcc : `rgba(${T.warnRgb},0.28)`}`,
              color: pair ? T.text : T.text4,
              fontFamily: pair ? T.mono : T.sans,
              cursor: isLoadingAssets ? 'wait' : 'pointer',
            }}
          >
            {pair || 'Вибрати...'}
            {isLoadingAssets
              ? <Loader2 size={14} className="animate-spin" style={{ color: T.text4 }} />
              : <SearchIcon size={14} strokeWidth={2.2} style={{ color: pair ? T.acc : T.warn }} />}
          </motion.button>
        </div>

        {/* Bias */}
        <div className="flex min-w-[180px] flex-1 flex-col gap-2 sm:max-w-[240px]">
          <FieldLabel icon={Book} required filled={!!narrative}>Плановий bias</FieldLabel>
          <NarrativeSelect value={narrative} onChange={onNarrativeChange} />
        </div>

        {/* Швидкі активи */}
        <button
          onClick={() => setShowQuick(!showQuick)}
          className="flex h-[42px] items-center gap-2 rounded-xl px-3.5 text-[14px] font-semibold transition-all duration-200"
          style={{
            background: showQuick ? T.surfaceHi : T.sunken,
            border: `1px solid ${showQuick ? T.lineHi : T.line}`,
            color: showQuick ? T.text : T.text3,
            fontFamily: T.sans,
          }}
        >
          <Layers size={14} strokeWidth={2.2} style={{ color: showQuick ? T.acc : T.text4 }} />
          Швидкий вибір
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showQuick && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-wrap gap-2 pt-4" style={{ borderTop: `1px solid ${T.line}` }}>
              {QUICK_ASSETS.map((a) => {
                const active = pair?.replace('/', '').toUpperCase() === a.replace('/', '').toUpperCase();
                return (
                  <motion.button
                    key={a}
                    whileTap={{ scale: 0.95 }}
                    transition={SPRING}
                    onClick={() => { onSwitchAsset?.(a); setShowQuick(false); }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all duration-200"
                    style={{
                      background: active ? `rgba(${T.accRgb},0.10)` : T.sunken,
                      border: `1px solid ${active ? T.lineAcc : T.line}`,
                      color: active ? T.acc : T.text2,
                      fontFamily: T.sans,
                    }}
                    onMouseEnter={(e) => !active && (e.currentTarget.style.borderColor = T.lineHi)}
                    onMouseLeave={(e) => !active && (e.currentTarget.style.borderColor = T.line)}
                  >
                    {active && <Check size={11} strokeWidth={3} />}
                    {a}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
