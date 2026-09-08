import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsLeftRight } from 'lucide-react';
import { C, F, A, lerp, useInView, reducedMotion, SHELL } from './base';

/* ==================================================================
   Різниця — машина дисципліни.

   Замість двох статичних колонок «було / стало» — один параметр,
   який людина крутить сама: дисципліна від 0 до 100%. Місяць
   перебудовується під нею наживо: червоні дні гаснуть, крива
   вирівнюється, цифри перетікають.

   Поки на блок не дивляться — він спить. Коли потрапляє в екран,
   повзунок сам проходить цикл 0 → 100 → 0, показуючи, що його
   взагалі можна крутити. Перший же дотик мишею вимикає автопілот
   на пʼять секунд.
================================================================== */

const D0 = [-1, -1.4, 0.8, -1, -2.1, 1.2, -1, -1, -1.6, 0.9, -1, -2.4, 1.4, -1, -1, -1.2, 0.7, -1, -1.8, -1.1];
const D100 = [1.2, 2.4, -1, 1.8, 0.9, 3.1, 1.6, -1, 2.2, 1.4, 0.8, 1.9, -1, 2.6, 1.1, 0.7, 2.0, 1.5, 0.9, 1.3];

/* Колір індикатора йде від червоного через бурштин до зеленого —
   рівно як настрій самої цифри. */
const mixRG = (t) => {
  const stops = [[255, 123, 123], [245, 163, 59], [47, 191, 143]];
  const k = t <= 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = t <= 0.5 ? stops[0] : stops[1];
  const b = t <= 0.5 ? stops[1] : stops[2];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

export default function Difference() {
  const [wrapRef, inView] = useInView(0.15);
  const boxRef = useRef(null);
  const reduced = reducedMotion();

  const [disc, setDisc] = useState(reduced ? 45 : 0);
  const [auto, setAuto] = useState(!reduced);

  const raf = useRef(0);
  const t0 = useRef(0);
  const autoRef = useRef(auto);
  autoRef.current = auto;
  const resumeT = useRef(0);

  useEffect(() => {
    if (!inView || reduced) return undefined;
    t0.current = performance.now() - 300;
    const period = 10200;
    const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

    const loop = (now) => {
      if (autoRef.current) {
        const t = (now - t0.current) % period;
        let v;
        if (t < 5200) v = ease(t / 5200) * 100;
        else if (t < 7200) v = 100;
        else if (t < 9400) v = 100 - ease((t - 7200) / 2200) * 100;
        else v = 0;
        setDisc((prev) => (Math.abs(v - prev) > 0.15 ? v : prev));
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [inView, reduced]);

  useEffect(() => () => clearTimeout(resumeT.current), []);

  const setFromX = useCallback((clientX) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 30;
    const p = ((clientX - r.left - pad) / (r.width - pad * 2)) * 100;
    setDisc(Math.max(0, Math.min(100, p)));
    setAuto(false);
    clearTimeout(resumeT.current);
    /* Повертаємо автопілот через пʼять секунд простою: інакше блок
       назавжди застигає на тому, куди людина випадково смикнула. */
    resumeT.current = setTimeout(() => { t0.current = performance.now(); setAuto(true); }, 5000);
  }, []);

  const onDown = (e) => {
    setFromX(e.clientX);
    const move = (ev) => setFromX(ev.clientX);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onTouch = (e) => { if (e.touches?.[0]) setFromX(e.touches[0].clientX); };

  const onKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setDisc((v) => Math.max(0, v - 5)); setAuto(false); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setDisc((v) => Math.min(100, v + 5)); setAuto(false); }
  };

  const t = disc / 100;
  const accent = mixRG(t);

  const bars = D0.map((v0, i) => {
    const v = lerp(v0, D100[i], t);
    const h = Math.min(62, (Math.abs(v) / 3.2) * 62);
    return {
      h: `${h.toFixed(1)}px`,
      c: v >= 0 ? 'rgba(47,191,143,.85)' : 'rgba(255,123,123,.8)',
      glow: Math.abs(v) > 2 ? (v >= 0 ? '0 0 14px rgba(47,191,143,.35)' : '0 0 14px rgba(255,123,123,.3)') : 'none',
      top: v >= 0 ? 'auto' : '50%',
      bottom: v >= 0 ? '50%' : 'auto',
    };
  });

  let cum = 0;
  const cumVals = D0.map((v0, i) => { cum += lerp(v0, D100[i], t); return cum; });
  const maxAbs = Math.max(5, ...cumVals.map(Math.abs));
  const pts = cumVals.map((v, i) => ({ x: (i / 19) * 300, y: 35 - (v / maxAbs) * 30 }));
  const curvePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const curveArea = `M0,${pts[0].y.toFixed(1)} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L300,70 L0,70 Z`;

  const tag = t < 0.45
    ? { txt: 'БЕЗ ЖУРНАЛУ', bg: 'rgba(255,123,123,.1)', bc: 'rgba(255,123,123,.3)', fg: C.bad }
    : t < 0.8
      ? { txt: '15 ДНІВ ЗАПИСІВ', bg: 'rgba(245,163,59,.1)', bc: 'rgba(245,163,59,.3)', fg: C.warn }
      : { txt: 'ЧЕРЕЗ 30 ДНІВ ЗАПИСІВ', bg: 'rgba(47,191,143,.1)', bc: 'rgba(47,191,143,.32)', fg: C.ok };

  const net = lerp(-4.2, 11.6, t);
  const metric = (value, label, color = C.text) => (
    <div>
      <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 30, letterSpacing: '-1.4px', color }}>{value}</div>
      <div style={{ fontFamily: F.sans, fontSize: 12, color: C.text4, marginTop: 5 }}>{label}</div>
    </div>
  );

  return (
    <section ref={wrapRef} style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>РІЗНИЦЯ</span>
      </div>

      <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 28px', color: '#fff' }}>
        Ти програєш не ринку.
        <br />
        Ти програєш тим самим трьом звичкам.
      </h2>

      <div
        ref={boxRef}
        tabIndex={0}
        role="slider"
        aria-label="Дисципліна"
        aria-valuenow={Math.round(disc)}
        aria-valuemin={0}
        aria-valuemax={100}
        onMouseDown={onDown}
        onTouchStart={onTouch}
        onTouchMove={onTouch}
        onKeyDown={onKey}
        style={{
          position: 'relative', background: 'linear-gradient(160deg,#0e0e14,#0b0b10)',
          border: `1px solid ${C.line}`, borderRadius: 24, padding: 30, overflow: 'hidden',
          cursor: 'ew-resize', outline: 'none', touchAction: 'pan-y',
        }}
      >
        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${A(0.55)},transparent)` }} />
        <span
          aria-hidden
          style={{
            position: 'absolute', top: -90, left: -60, width: 360, height: 360, filter: 'blur(70px)', pointerEvents: 'none',
            transition: 'background .4s ease',
            background: t < 0.5 ? 'radial-gradient(circle,rgba(255,123,123,.14),transparent 70%)' : 'radial-gradient(circle,rgba(74,59,245,.16),transparent 70%)',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute', bottom: -110, right: -40, width: 340, height: 340, filter: 'blur(70px)', pointerEvents: 'none',
            transition: 'background .4s ease',
            background: t < 0.5 ? 'radial-gradient(circle,rgba(245,163,59,.1),transparent 70%)' : 'radial-gradient(circle,rgba(47,191,143,.14),transparent 70%)',
          }}
        />

        <div style={{ position: 'relative', display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* ---------- індикатор ---------- */}
          <div style={{ flex: '0 1 232px', minWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            <div style={{ position: 'relative', width: 208, height: 208 }}>
              <svg viewBox="0 0 208 208" style={{ width: 208, height: 208, display: 'block', transform: 'rotate(-90deg)' }}>
                <circle cx="104" cy="104" r="88" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="10" />
                <circle
                  cx="104" cy="104" r="88" fill="none" strokeWidth="10" strokeLinecap="round"
                  strokeDasharray="552.9" stroke={accent} strokeDashoffset={(552.9 * (1 - t)).toFixed(1)}
                  style={{ filter: `drop-shadow(0 0 12px ${accent})` }}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 52, letterSpacing: '-2.6px', lineHeight: 1, color: '#fff' }}>
                  {Math.round(disc)}%
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '1.8px', color: C.text4 }}>ДИСЦИПЛІНА</div>
              </div>
            </div>

            <div
              style={{
                display: 'inline-flex', borderRadius: 999, padding: '8px 16px',
                fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '1.2px', whiteSpace: 'nowrap',
                transition: 'all .35s ease', background: tag.bg, border: `1px solid ${tag.bc}`, color: tag.fg,
              }}
            >
              {tag.txt}
            </div>
          </div>

          {/* ---------- місяць ---------- */}
          <div style={{ flex: '1 1 480px', minWidth: 300 }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 5, height: 132, position: 'relative', marginBottom: 6 }}>
              <span style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: C.line }} />
              {bars.map((b, i) => (
                <div key={i} style={{ flex: 1, position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, borderRadius: 3, height: b.h, background: b.c, top: b.top, bottom: b.bottom, boxShadow: b.glow }} />
                </div>
              ))}
            </div>

            <svg viewBox="0 0 300 70" preserveAspectRatio="none" style={{ width: '100%', height: 88, display: 'block' }}>
              <defs>
                <linearGradient id="lnCurveFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopOpacity=".3" stopColor={accent} />
                  <stop offset="1" stopOpacity="0" stopColor={accent} />
                </linearGradient>
              </defs>
              <path d={curveArea} fill="url(#lnCurveFill)" />
              <polyline points={curvePoints} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <circle cx={pts[19].x.toFixed(1)} cy={pts[19].y.toFixed(1)} r="3.4" fill={accent} style={{ filter: `drop-shadow(0 0 8px ${accent})` }} />
            </svg>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 14, marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.06)' }}>
              {metric(`${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(1)}R`, 'за місяць', net >= 0 ? C.ok : C.bad)}
              {metric(String(Math.round(lerp(63, 28, t))), 'угод')}
              {metric(`${Math.round(lerp(38, 54, t))}%`, 'вінрейт')}
              {metric(String(Math.round(lerp(19, 2, t))), 'угод на тілті', t < 0.5 ? C.bad : C.ok)}
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, marginTop: 22, fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.dim }}>
          <ChevronsLeftRight size={13} strokeWidth={2.2} />
          {auto ? 'ТЯГНИ, ЩОБ ПРОКРУТИТИ МІСЯЦЬ ВРУЧНУ' : 'РУЧНИЙ РЕЖИМ · АВТО ПОВЕРНЕТЬСЯ ЗА 5 С'}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap', marginTop: 18 }}>
        <div style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.55, color: C.text5, maxWidth: 600 }}>
          Приклад рахунку — цифри, які журнал зазвичай показує, коли в ньому вже 40+ угод.
          Твої будуть іншими, у цьому й суть.
        </div>
        <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: C.accSoft }}>
          Не 63 угоди, а 28. Менше угод — не менше грошей.
        </div>
      </div>
    </section>
  );
}
