import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, AlertCircle, ArrowUpRight, ArrowDownRight, Calendar as CalendarIcon, X, Filter, Activity, Clock, ChevronLeft, ChevronRight, BarChart2, Layers } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter,
  eachDayOfInterval, eachMonthOfInterval, format, isSameMonth, isSameDay,
  addMonths, subMonths, addQuarters, subQuarters, isFuture, isToday,
} from 'date-fns';
import { EMOTION_COLOR, EMOTION_LABEL, signed } from './data';
import { T } from '../../lib/theme';

// ==========================================
// ЛОКАЛІЗАЦІЯ ДАТ
// ==========================================
const UKR_MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

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

// ==========================================
// КАЛЕНДАР УГОД v2 — дрібні елементи
// ==========================================
const fmtR = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
const tintOf = (v) => (v > 0 ? '46,230,168' : v < 0 ? '255,95,109' : '255,255,255');

function NavBtn({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 9, background: 'transparent', color: '#8a8aa0', cursor: 'pointer',
        transition: 'color .2s ease, background .2s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = '#8a8aa0'; e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function TabBtn({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
        fontFamily: T.mono, fontSize: 10.5, letterSpacing: '.16em', transition: 'all .25s ease',
        ...(active
          ? { background: 'linear-gradient(180deg, rgba(108,92,231,.9), rgba(88,72,210,.9))', color: '#fff', boxShadow: '0 6px 18px -8px rgba(108,92,231,.9)' }
          : { background: 'transparent', color: '#9a9ab0' }),
      }}
    >
      {children}
    </button>
  );
}

function StatCell({ label, value, color, small, br, bb }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRight: br ? '1px solid rgba(255,255,255,.07)' : 'none',
        borderBottom: bb ? '1px solid rgba(255,255,255,.07)' : 'none',
      }}
    >
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.18em', color: '#9a9ab0', marginBottom: 7 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: small ? 14 : 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

/* Один місяць у кварталі — той самий принцип клітинок, що й у великому
   місячному вигляді, тільки вдвічі менший і без числа R у клітинці:
   три місяці поруч не лишають місця для другого рядка тексту, а сама
   сила кольору вже показує, яким був день. Деталі — у підказці. */
function MiniMonth({ monthDate, tradesByDate, selectedDate, setSelectedDate, maxAbs }) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  return (
    <div style={{ flex: '1 1 240px', minWidth: 210 }}>
      <div style={{ fontFamily: T.mono, fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#d6d6e4', marginBottom: 11 }}>
        {UKR_MONTHS[monthDate.getMonth()]}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4, marginBottom: 6 }}>
        {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'].map((w) => (
          <div key={w} style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '.1em', color: '#6f6f85', textAlign: 'center' }}>{w[0]}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 4 }}>
        {days.map((day) => {
          const list = tradesByDate[format(day, 'yyyy-MM-dd')] || [];
          const has = list.length > 0;
          const val = has ? list.reduce((a, t) => a + t.rr, 0) : undefined;
          const muted = !isSameMonth(day, monthDate);
          const today = isToday(day);
          const selected = selectedDate && isSameDay(day, selectedDate);
          const tint = has ? tintOf(val) : '255,255,255';
          const sInt = has ? Math.min(1, Math.abs(val) / maxAbs) : 0;
          return (
            <button
              key={day.toString()}
              type="button"
              title={has ? `${format(day, 'dd.MM')} — ${fmtR(val)}R · ${list.length} уг.` : format(day, 'dd.MM')}
              onClick={() => setSelectedDate(selected ? null : day)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                aspectRatio: '1', borderRadius: 7, cursor: 'pointer', appearance: 'none',
                transition: 'transform .15s ease, box-shadow .15s ease',
                background: has ? `rgba(${tint},${(0.1 + sInt * 0.35).toFixed(3)})` : 'rgba(255,255,255,.02)',
                border: `1px solid rgba(${has ? tint : '255,255,255'},${has ? (0.2 + sInt * 0.32).toFixed(3) : 0.04})`,
                boxShadow: selected ? '0 0 0 2px #fff' : today ? 'inset 0 0 0 1.5px rgba(46,230,168,.9)' : 'none',
                opacity: muted ? 0.32 : 1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.14)'; e.currentTarget.style.zIndex = 1; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.zIndex = 0; }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: today ? 800 : 500, color: today ? '#2ee6a8' : muted ? '#6f6f85' : has ? '#f2f2f8' : '#8a8aa0' }}>
                {format(day, 'd')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// КАЛЕНДАР УГОД v2
// ==========================================
function DetailedActivityCalendar({ tradesByDate, selectedDate, setSelectedDate }) {
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'quarter'
  const [navDate, setNavDate] = useState(selectedDate || new Date());

  const handlePrev = () => setNavDate(viewMode === 'month' ? subMonths(navDate, 1) : subQuarters(navDate, 1));
  const handleNext = () => setNavDate(viewMode === 'month' ? addMonths(navDate, 1) : addQuarters(navDate, 1));

  /* У кварталі свій розклад не по днях, а по трьох окремих місяцях —
     кожен малюється своєю міні-сіткою нижче. */
  const quarterMonths = useMemo(
    () => eachMonthOfInterval({ start: startOfQuarter(navDate), end: endOfQuarter(navDate) }),
    [navDate],
  );

  const days = useMemo(() => {
    if (viewMode === 'month') {
      const start = startOfWeek(startOfMonth(navDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(navDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    return eachDayOfInterval({ start: startOfQuarter(navDate), end: endOfQuarter(navDate) });
  }, [navDate, viewMode]);

  /* Дні з угодами у видимому періоді — з них рахується вся права колонка. */
  const active = useMemo(() => {
    const src = viewMode === 'month' ? days.filter((d) => isSameMonth(d, navDate)) : days;
    return src
      .map((d) => {
        const list = tradesByDate[format(d, 'yyyy-MM-dd')] || [];
        if (!list.length) return null;
        return { day: d, v: list.reduce((a, t) => a + t.rr, 0), n: list.length };
      })
      .filter(Boolean);
  }, [days, viewMode, navDate, tradesByDate]);

  const stats = useMemo(() => {
    const total = active.reduce((a, b) => a + b.v, 0);
    const wins = active.filter((a) => a.v > 0).length;
    const tint = total >= 0 ? '46,230,168' : '255,95,109';

    const cum = active.map((_, i) => active.slice(0, i + 1).reduce((x, a) => x + a.v, 0));
    const peak = Math.max(1, ...cum.map((v) => Math.abs(v)));
    const spark = cum.map((v) => ({ h: Math.max(4, Math.round((Math.abs(v) / peak) * 40)), neg: v < 0 }));

    const NAMES = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'];
    const sums = [0, 0, 0, 0, 0, 0, 0];
    active.forEach((a) => { sums[getUkrDayIndex(a.day)] += a.v; });
    const wdPeak = Math.max(1, ...sums.map((v) => Math.abs(v)));
    const byWeekday = NAMES.map((name, i) => ({ name, sum: sums[i] }));

    const sorted = active.slice().sort((a, b) => b.v - a.v);
    const maxAbs = Math.max(5, ...active.map((a) => Math.abs(a.v)));

    return {
      total, wins, tint, spark, byWeekday, wdPeak, maxAbs,
      count: active.length,
      bestD: sorted[0] || null,
      worstD: sorted.length ? sorted[sorted.length - 1] : null,
    };
  }, [active]);

  const periodLabel = useMemo(() => {
    if (viewMode === 'month') return `${UKR_MONTHS[navDate.getMonth()]} ${navDate.getFullYear()}`;
    const qNum = Math.floor(navDate.getMonth() / 3) + 1;
    return `${qNum}-й квартал ${navDate.getFullYear()}`;
  }, [viewMode, navDate]);

  return (
    <div
      className="w-full relative z-20"
      style={{
        fontFamily: T.sans,
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,.07)',
        background: 'linear-gradient(180deg, rgba(15,16,23,.92), rgba(9,10,14,.92))',
        padding: '24px 26px 26px',
      }}
    >
      <style>{`
        @keyframes tcv2Pulse{0%,100%{box-shadow:inset 0 0 0 1.5px rgba(46,230,168,.9),0 0 0 0 rgba(46,230,168,.4)}50%{box-shadow:inset 0 0 0 1.5px rgba(46,230,168,.9),0 0 0 6px rgba(46,230,168,0)}}
        @keyframes tcv2Rise{from{transform:scaleY(.2);opacity:0}to{transform:scaleY(1);opacity:1}}
      `}</style>

      {/* ── шапка ── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
          flexWrap: 'wrap', paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NavBtn onClick={handlePrev}><ChevronLeft size={14} strokeWidth={2} /></NavBtn>
          <div style={{ minWidth: 190, textAlign: 'center', fontSize: 18, fontWeight: 700, letterSpacing: '-.01em', color: '#fff' }}>
            {periodLabel}
          </div>
          <NavBtn onClick={handleNext}><ChevronRight size={14} strokeWidth={2} /></NavBtn>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedDate && (
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 9,
                border: '1px solid rgba(255,95,109,.25)', background: 'rgba(255,95,109,.1)', color: '#ff7b86',
                fontFamily: T.mono, fontSize: 10, letterSpacing: '.08em', cursor: 'pointer',
              }}
            >
              <X size={11} strokeWidth={2.6} /> {format(selectedDate, 'dd.MM')}
            </button>
          )}
          <div style={{ display: 'flex', padding: 3, borderRadius: 11, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.02)' }}>
            <TabBtn active={viewMode === 'month'} onClick={() => setViewMode('month')}>МІСЯЦЬ</TabBtn>
            <TabBtn active={viewMode === 'quarter'} onClick={() => setViewMode('quarter')}>КВАРТАЛ</TabBtn>
          </div>
        </div>
      </div>

      {/* ── тіло ── */}
      <div style={{ display: 'flex', gap: 34, alignItems: 'stretch', flexWrap: 'wrap', paddingTop: 22 }}>

        {/* календар */}
        <div style={{ flex: viewMode === 'quarter' ? '1 1 620px' : '1 1 440px', minWidth: 300, display: 'flex', flexDirection: 'column' }}>
          {viewMode === 'quarter' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
              {quarterMonths.map((m) => (
                <MiniMonth
                  key={m.toString()}
                  monthDate={m}
                  tradesByDate={tradesByDate}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  maxAbs={stats.maxAbs}
                />
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 7, marginBottom: 9 }}>
                {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД'].map((w) => (
                  <div key={w} style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.18em', color: '#8a8aa0', textAlign: 'center' }}>{w}</div>
                ))}
              </div>

              <div style={{ flex: '1 1 auto', display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gridAutoRows: 'minmax(44px,1fr)', gap: 7 }}>
                {days.map((day) => {
                  const list = tradesByDate[format(day, 'yyyy-MM-dd')] || [];
                  const has = list.length > 0;
                  const val = has ? list.reduce((a, t) => a + t.rr, 0) : undefined;
                  const muted = !isSameMonth(day, navDate);
                  const today = isToday(day);
                  const selected = selectedDate && isSameDay(day, selectedDate);
                  const tint = has ? tintOf(val) : '255,255,255';
                  const sInt = has ? Math.min(1, Math.abs(val) / stats.maxAbs) : 0;
                  return (
                    <button
                      key={day.toString()}
                      type="button"
                      title={has ? `${format(day, 'dd.MM')} — ${fmtR(val)}R · ${list.length} уг.` : format(day, 'dd.MM')}
                      onClick={() => setSelectedDate(selected ? null : day)}
                      style={{
                        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 3, minHeight: 0, borderRadius: 11, cursor: 'pointer', appearance: 'none',
                        transition: 'transform .2s ease, box-shadow .2s ease',
                        background: has ? `rgba(${tint},${(0.07 + sInt * 0.3).toFixed(3)})` : 'rgba(255,255,255,.025)',
                        border: `1px solid rgba(${has ? tint : '255,255,255'},${has ? (0.16 + sInt * 0.3).toFixed(3) : 0.05})`,
                        boxShadow: selected
                          ? '0 0 0 2px #fff'
                          : today
                            ? undefined
                            : (has && sInt > 0.55 ? `0 0 18px rgba(${tint},.3)` : 'none'),
                        animation: today ? 'tcv2Pulse 2.8s ease-in-out infinite' : 'none',
                        opacity: muted ? 0.55 : 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                    >
                      <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: today ? 700 : 500, lineHeight: 1, color: today ? '#2ee6a8' : muted ? '#8a8aa0' : has ? '#f2f2f8' : '#9a9ab0' }}>
                        {format(day, 'd')}
                      </span>
                      {has && (
                        <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, lineHeight: 1, letterSpacing: '-.02em', color: `rgb(${tint})` }}>
                          {fmtR(val)}
                        </span>
                      )}
                      {!has && !today && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,.12)' }} />}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.16em', color: '#8a8aa0' }}>
            <span>−5R</span>
            <span style={{ flex: '0 0 120px', height: 5, borderRadius: 3, background: 'linear-gradient(90deg,#ff5f6d,rgba(255,255,255,.1) 50%,#2ee6a8)' }} />
            <span>+5R</span>
            <span style={{ marginLeft: 'auto' }}>{stats.count ? `${stats.count} АКТИВНИХ ДНІВ` : 'НЕМАЄ УГОД'}</span>
          </div>
        </div>

        {/* права колонка — результат періоду */}
        <div style={{ flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div
            style={{
              position: 'relative', overflow: 'hidden', padding: '20px 20px 18px', borderRadius: 18,
              border: `1px solid rgba(${stats.tint},.22)`,
              background: `linear-gradient(150deg, rgba(${stats.tint},.1), rgba(255,255,255,.012) 60%)`,
            }}
          >
            <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: '.22em', color: '#9a9ab0', marginBottom: 10 }}>РЕЗУЛЬТАТ ПЕРІОДУ</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <span style={{ fontFamily: T.mono, fontSize: 40, fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1, color: `rgb(${stats.tint})`, textShadow: `0 0 40px rgba(${stats.tint},.5)` }}>
                {stats.count ? `${fmtR(stats.total)}R` : '—'}
              </span>
              {stats.count > 0 && <span style={{ fontFamily: T.mono, fontSize: 11, color: '#9a9ab0', paddingBottom: 5 }}>{stats.count} дн.</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44, marginTop: 16 }}>
              {stats.spark.length ? stats.spark.map((b, i) => (
                <span
                  key={i}
                  style={{
                    display: 'block', flex: '1 1 auto', minWidth: 3,
                    borderRadius: b.neg ? '3px 3px 0 0' : 3,
                    transformOrigin: 'bottom',
                    animation: `tcv2Rise .5s ${(i * 0.03).toFixed(2)}s both cubic-bezier(.2,.8,.2,1)`,
                    height: b.h,
                    background: `linear-gradient(180deg, rgba(${b.neg ? '255,95,109' : '46,230,168'},.95), rgba(${b.neg ? '255,95,109' : '46,230,168'},.25))`,
                  }}
                />
              )) : (
                <span style={{ fontFamily: T.mono, fontSize: 10, color: '#8a8aa0' }}>—</span>
              )}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.16em', color: '#8a8aa0', marginTop: 9 }}>НАКОПИЧЕНО ПО ДНЯХ</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,.07)' }}>
            <StatCell label="ВІНРЕЙТ" value={stats.count ? `${Math.round((stats.wins / stats.count) * 100)}%` : '—'} color="#fff" br bb />
            <StatCell label="СЕРЕДНЯ" value={stats.count ? `${fmtR(stats.total / stats.count)}R` : '—'} color="#fff" bb />
            <StatCell label="НАЙКРАЩИЙ" value={stats.bestD ? `${format(stats.bestD.day, 'd')} · ${fmtR(stats.bestD.v)}R` : '—'} color="#2ee6a8" small br />
            <StatCell label="НАЙГІРШИЙ" value={stats.worstD ? `${format(stats.worstD.day, 'd')} · ${fmtR(stats.worstD.v)}R` : '—'} color="#ff7b86" small />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.18em', color: '#9a9ab0' }}>ПО ДНЯХ ТИЖНЯ</div>
            {stats.byWeekday.map((w) => (
              <div key={w.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: '0 0 24px', fontFamily: T.mono, fontSize: 10, color: '#8a8aa0' }}>{w.name}</span>
                <span style={{ flex: '1 1 auto', height: 6, borderRadius: 4, background: 'rgba(255,255,255,.05)', overflow: 'hidden', position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute', top: 0, bottom: 0,
                      ...(w.sum >= 0 ? { left: '50%' } : { right: '50%' }),
                      width: `${Math.round((Math.abs(w.sum) / stats.wdPeak) * 50)}%`,
                      borderRadius: 4,
                      background: `rgb(${w.sum >= 0 ? '46,230,168' : '255,95,109'})`,
                    }}
                  />
                </span>
                <span style={{ flex: '0 0 42px', textAlign: 'right', fontFamily: T.mono, fontSize: 10.5, fontWeight: 700, color: w.sum > 0 ? '#2ee6a8' : w.sum < 0 ? '#ff7b86' : '#8a8aa0' }}>
                  {w.sum ? fmtR(w.sum) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
        <span className="inline-flex items-center gap-[6px] text-[10px] tracking-[0.14em] uppercase text-[var(--edge-text3)] font-bold">
          Всього {s.trades.length} записів
        </span>
      </div>

      {/* ВЕЛИКИЙ КАЛЕНДАР (Тепер він головний фільтр) */}
      <DetailedActivityCalendar tradesByDate={tradesByDate} selectedDate={selectedDate} setSelectedDate={handleDateSelect} />

      {/* ФІЛЬТРИ ТА ПОШУК ДЛЯ СПИСКУ */}
      <div ref={listRef} className="bg-[var(--edge-surface-hi)]/80 backdrop-blur-xl border border-[var(--edge-hair)] rounded-[16px] p-3 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4 sticky top-4 z-30 shadow-2xl mt-4 scroll-mt-[20px]">
        
        <div className="flex items-center gap-[10px] w-full lg:w-[320px] bg-[var(--edge-bg)]/50 border border-[var(--edge-line)] rounded-[12px] px-3 py-2.5 transition-colors focus-within:border-[var(--edge-acc)]/50 focus-within:bg-[var(--edge-bg)] shrink-0">
          <Search size={16} className="text-[var(--edge-text3)]" />
          <input 
            value={query} onChange={(e) => setQuery(e.target.value)} 
            placeholder="Пошук по активу, сетапу, емоції..." 
            className="bg-transparent border-none outline-none text-[var(--edge-text)] text-[13px] w-full placeholder:text-[var(--edge-text4)]" 
          />
        </div>

        <div className="flex items-center justify-between w-full lg:w-auto gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar flex-1 pb-1 lg:pb-0">
            <Filter size={14} className="text-[var(--edge-text3)] mr-2 shrink-0 hidden sm:block" />
            {[{ k: 'all', l: 'Усі' }, { k: 'win', l: 'Плюс' }, { k: 'loss', l: 'Мінус' }, { k: 'mistake', l: 'З помилкою' }, { k: 'clean', l: 'Чисті' }].map(({ k, l }) => (
              <button 
                key={k} onClick={() => setFilter(k)}
                className={`shrink-0 text-[11.5px] px-3.5 py-2 rounded-[10px] font-bold transition-all duration-200 border 
                  ${filter === k ? 'bg-white/10 text-[var(--edge-text)] border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 'bg-transparent text-[var(--edge-text3)] border-transparent hover:bg-[var(--edge-hair)] hover:text-[var(--edge-text)]'}`}
              >{l}</button>
            ))}
          </div>

          {selectedDate && (
             <div className="shrink-0 flex items-center gap-2 bg-[var(--edge-acc)]/10 border border-[var(--edge-acc)]/20 px-3 py-1.5 rounded-[10px] text-[11px] font-bold text-[var(--edge-acc)]">
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

                          <div className="flex flex-col gap-1 text-[var(--edge-text3)]">
                            <span className="flex items-center gap-1.5 text-[11.5px] font-medium"><CalendarIcon size={12}/> {t.date}</span>
                            <span className="flex items-center gap-1.5 text-[11.5px] font-medium"><Clock size={12}/> {String(t.hour).padStart(2, '0')}:00 · {t.session}</span>
                          </div>
                        </div>

                        {/* СЕРЕДНЯ ЧАСТИНА: Сетап, Емоція, Помилки */}
                        <div className="flex-1 flex flex-wrap items-center gap-4 lg:gap-8 w-full xl:w-auto">
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <span className="text-[9px] uppercase tracking-widest text-[var(--edge-text3)] font-black">Сетап / Акаунт</span>
                            <span className="text-[12.5px] text-[var(--edge-text)] font-bold">{t.setup}</span>
                            <span className="text-[11px] text-[var(--edge-text3)]">{t.account}</span>
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
                            <span className="text-[9px] uppercase tracking-widest text-[var(--edge-text3)] font-black mb-0.5">Результат</span>
                            <b 
                              className="text-[24px] font-black tracking-tighter leading-none transition-all duration-300"
                              style={{ color: isProfit ? '#34d399' : isLoss ? '#f87171' : 'var(--edge-text2, var(--edge-text2))', textShadow: isProfit ? '0 0 15px rgba(52,211,153,0.4)' : isLoss ? '0 0 15px rgba(248,113,113,0.4)' : 'none' }}
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
              <Layers size={32} className="text-[var(--edge-text4)] mb-3" />
              <h3 className="text-[16px] text-[var(--edge-text)] font-bold mb-1">Немає угод</h3>
              <p className="text-[12.5px] text-[var(--edge-text3)]">За вибраними фільтрами або датою нічого не знайдено.</p>
              {(query || filter !== 'all' || selectedDate) && (
                <button onClick={() => { setQuery(''); setFilter('all'); setSelectedDate(null); }} className="mt-4 px-4 py-2 bg-[var(--edge-hair)] hover:bg-white/10 text-[var(--edge-text)] text-[12px] font-bold rounded-[8px] transition-colors">
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
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-[10px] bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] text-[var(--edge-text3)] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] transition-colors disabled:opacity-50 disabled:pointer-events-none"><ChevronLeft size={16} /></button>
          {paginationButtons.map(p => (
            <button key={p} onClick={() => setCurrentPage(p)} className={`w-9 h-9 rounded-[10px] text-[12px] font-bold transition-all duration-200 border ${currentPage === p ? 'bg-[var(--edge-acc)] text-[var(--edge-text)] border-[var(--edge-acc)] shadow-[0_0_15px_rgba(139,123,255,0.3)]' : 'bg-[var(--edge-surface-hi)] text-[var(--edge-text3)] border-[var(--edge-hair)] hover:border-white/20 hover:text-[var(--edge-text)]'}`}>{p}</button>
          ))}
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-[10px] bg-[var(--edge-surface-hi)] border border-[var(--edge-hair)] text-[var(--edge-text3)] hover:text-[var(--edge-text)] hover:bg-[var(--edge-hair)] transition-colors disabled:opacity-50 disabled:pointer-events-none"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}