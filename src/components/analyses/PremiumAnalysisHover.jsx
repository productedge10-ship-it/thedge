import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid, Target, Crosshair, ShieldCheck, Activity, RefreshCw, AlertTriangle, Check, X,
} from 'lucide-react';
import { T } from '../../lib/theme';
import AssetIcon from '../ui/AssetIcon';
import { formatBiasData } from '../../utils/biasUtils';
import { biasOf, biasResult } from './AnalysisCard';

/* ==================================================================
   Швидкий перегляд плану при наведенні.
   Ефект лишився той самий — картка вилітає збоку з розмиття, — але
   тепер у кольорах сайту і з головним рядком: план справдився чи ні.
================================================================== */

function Cell({ icon: Icon, label, children, accent }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-2xl p-3.5"
      style={{ background: T.sunken, border: `1px solid ${accent || T.line}` }}
    >
      <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em]" style={{ fontFamily: T.sans, color: T.text4 }}>
        <Icon size={12} strokeWidth={2.4} /> {label}
      </span>
      {children}
    </div>
  );
}

export default function PremiumAnalysisHover({ children, planData }) {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState('right');
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);

  const data = {
    pair: planData?.pair || 'UNKNOWN',
    date: planData?.date || 'N/A',
    planned: formatBiasData(planData?.narrative || planData?.plan_data?.narrative),
    actual: formatBiasData(planData?.plan_data?.actualNarrative),
    rating: planData?.plan_data?.sessionRating || 0,
    updates: planData?.plan_data?.updates?.length || 0,
    mistake: !!planData?.plan_data?.analysisMistake,
  };

  const planned = biasOf(data.planned);
  const actual = biasOf(data.actual);
  const hit = biasResult(planData);
  const accent = planned?.color || T.acc;

  const onEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const w = 360;
        if (rect.width > 600) setPosition('inside-right');
        else if (rect.right + w + 40 > window.innerWidth) setPosition('left');
        else setPosition('right');
      }
      setIsHovered(true);
    }, 120);
  };

  const onLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsHovered(false);
  };

  let initial, animate, exit, place;
  if (position === 'inside-right') {
    initial = { opacity: 0, x: 20, scale: 0.96, filter: 'blur(5px)' };
    animate = { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 25 } };
    exit = { opacity: 0, x: 20, scale: 0.96, filter: 'blur(5px)' };
    place = 'right-6';
  } else if (position === 'left') {
    initial = { opacity: 0, x: 15, scale: 0.96, filter: 'blur(5px)' };
    animate = { opacity: 1, x: -20, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 25 } };
    exit = { opacity: 0, x: 0, scale: 0.96, filter: 'blur(5px)' };
    place = 'right-full';
  } else {
    initial = { opacity: 0, x: -15, scale: 0.96, filter: 'blur(5px)' };
    animate = { opacity: 1, x: 20, scale: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 300, damping: 25 } };
    exit = { opacity: 0, x: 0, scale: 0.96, filter: 'blur(5px)' };
    place = 'left-full';
  }

  return (
    <div
      ref={containerRef}
      className="group/hovercard relative h-full w-full hover:z-[50]"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="relative z-10 h-full w-full">{children}</div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={initial}
            animate={animate}
            exit={exit}
            className={`pointer-events-none absolute top-1/2 z-[1000] hidden w-[360px] -translate-y-1/2 md:block ${place}`}
          >
            <div
              className="relative overflow-hidden rounded-3xl p-5"
              style={{
                background: 'rgba(11,11,14,0.98)',
                border: `1px solid ${T.lineHi}`,
                boxShadow: '0 25px 60px rgba(0,0,0,0.95)',
              }}
            >
              <div
                className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full opacity-30 blur-[70px]"
                style={{ background: accent }}
              />

              {/* шапка */}
              <div className="relative z-10 mb-4 flex items-center justify-between pb-3.5" style={{ borderBottom: `1px solid ${T.line}` }}>
                <span className="flex items-center gap-2">
                  <LayoutGrid size={15} style={{ color: accent }} />
                  <span className="text-[12px] font-bold uppercase tracking-[0.16em]" style={{ fontFamily: T.sans, color: T.text }}>
                    Огляд плану
                  </span>
                </span>
                <span
                  className="rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums"
                  style={{ fontFamily: T.mono, background: T.sunken, color: T.text3 }}
                >
                  {data.date}
                </span>
              </div>

              {/* вердикт: план проти реальності */}
              {hit !== null && (
                <div
                  className="relative z-10 mb-3 flex items-center gap-2.5 rounded-2xl px-3.5 py-3"
                  style={{
                    background: hit ? `rgba(${T.okRgb},0.07)` : `rgba(${T.badRgb},0.07)`,
                    border: `1px solid ${hit ? `rgba(${T.okRgb},0.22)` : `rgba(${T.badRgb},0.22)`}`,
                  }}
                >
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: hit ? `rgba(${T.okRgb},0.14)` : `rgba(${T.badRgb},0.14)` }}
                  >
                    {hit
                      ? <Check size={14} strokeWidth={3.4} style={{ color: T.ok }} />
                      : <X size={14} strokeWidth={3.4} style={{ color: T.bad }} />}
                  </span>
                  <span className="text-[13.5px] font-bold" style={{ fontFamily: T.sans, color: hit ? T.ok : T.bad }}>
                    {hit ? 'Ринок пішов за планом' : 'Ринок пішов інакше'}
                  </span>
                </div>
              )}

              <div className="relative z-10 grid grid-cols-2 gap-2.5">
                <Cell icon={Target} label="Актив">
                  <span className="flex items-center gap-2">
                    <AssetIcon symbol={data.pair} category={planData?.plan_data?.category} />
                    <span className="truncate text-[14px] font-bold" style={{ fontFamily: T.display, color: T.text }}>{data.pair}</span>
                  </span>
                </Cell>

                <Cell icon={Crosshair} label="План">
                  <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: planned?.color || T.text3 }}>
                    {planned?.label || data.planned}
                  </span>
                </Cell>

                <Cell icon={ShieldCheck} label="Факт">
                  <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: actual?.color || T.text4 }}>
                    {actual?.label || 'не вказано'}
                  </span>
                </Cell>

                <Cell icon={Activity} label="Оцінка">
                  <span className="flex items-baseline gap-1 text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: T.text }}>
                    {data.rating}
                    <span className="text-[12px]" style={{ color: T.text4 }}>/ 5</span>
                  </span>
                </Cell>

                <Cell icon={RefreshCw} label="Оновлень">
                  <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: T.mono, color: data.updates ? T.acc : T.text4 }}>
                    {data.updates}
                  </span>
                </Cell>

                <Cell
                  icon={AlertTriangle}
                  label="Помилки"
                  accent={data.mistake ? `rgba(${T.badRgb},0.28)` : undefined}
                >
                  <span className="text-[14px] font-bold" style={{ fontFamily: T.sans, color: data.mistake ? T.bad : T.ok }}>
                    {data.mistake ? 'є' : 'чисто'}
                  </span>
                </Cell>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
