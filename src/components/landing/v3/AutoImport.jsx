import { useEffect, useRef, useState } from 'react';
import { Check, Lock, MonitorSmartphone } from 'lucide-react';
import { C, F, A, useInView, reducedMotion, SHELL } from './base';

/* ==================================================================
   Автоімпорт MT5 + твої дані.

   Два питання, які людина ставить одночасно: «воно справді приїде
   саме?» і «а ти не зіллєш мої угоди?». Тому блок один.

   Ліворуч термінал, праворуч журнал, між ними стрічка, якою летять
   угоди. Політ навмисно неспішний — 3.4с на квиток і 1.5с між ними:
   швидка анімація читається як мигтіння, а тут треба встигнути
   прочитати інструмент і результат на самій картці.
================================================================== */

const POOL = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', r: 2.4 },
  { sym: 'GER40', setup: 'Judas swing', r: 1.8 },
  { sym: 'EURUSD', setup: 'Без сетапу', r: -1 },
  { sym: 'XAUUSD', setup: 'Сплеск на новині', r: -1 },
  { sym: 'NAS100', setup: 'Ретест OB', r: 1.6 },
  { sym: 'BTCUSD', setup: 'Азійський діапазон', r: 2.2 },
  { sym: 'US100', setup: 'Свіп лоу + FVG', r: 1.9 },
];

const MT5_ROWS = [
  { sym: 'XAUUSD', side: 'BUY', lot: '0.42', r: '+2.4R' },
  { sym: 'GER40', side: 'SELL', lot: '1.00', r: '+1.8R' },
  { sym: 'EURUSD', side: 'BUY', lot: '0.75', r: '−1.0R' },
  { sym: 'XAUUSD', side: 'SELL', lot: '0.30', r: '+3.1R' },
  { sym: 'NAS100', side: 'BUY', lot: '0.20', r: '−1.0R' },
];

const TRUST = [
  { title: 'Дані твої', sub: 'Кожна таблиця замкнена на твій акаунт на рівні бази, тому запит на чужі угоди не поверне нічого.' },
  { title: 'Закрито, поки ти не вирішиш', sub: 'Публічного за замовчуванням немає. Розбір чи картка статистики відкриваються за посиланням лише коли ти сам його створиш.' },
  { title: 'Без прив’язки', sub: 'Перестанеш платити — журнал лишиться. Історія на місці, вимикаються лише можливості Pro.' },
];

const SEED = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', r: '+2.4R' },
  { sym: 'GER40', setup: 'Judas swing', r: '+1.8R' },
  { sym: 'EURUSD', setup: 'Без сетапу', r: '−1.0R' },
  { sym: 'NAS100', setup: 'Ретест OB', r: '+1.6R' },
];

const FLIGHT = 3400;   // скільки летить одна угода
const SPAWN = 1500;    // пауза між угодами
const STEP = 26;       // на скільки просувається лічильник за угоду

export default function AutoImport() {
  const [ref, inView] = useInView(0.15);
  const reduced = reducedMotion();

  const [tickets, setTickets] = useState([]);
  const [landed, setLanded] = useState(reduced ? SEED : []);
  const [imported, setImported] = useState(reduced ? 412 : 0);
  const [done, setDone] = useState(reduced);
  const seq = useRef(0);

  useEffect(() => {
    if (!inView || reduced || done) return undefined;
    const id = setInterval(() => {
      const t = POOL[Math.floor(Math.random() * POOL.length)];
      seq.current += 1;
      setTickets((prev) => prev.concat([{
        id: `tk${seq.current}`,
        sym: t.sym,
        setup: t.setup,
        r: `${t.r >= 0 ? '+' : '−'}${Math.abs(t.r).toFixed(1)}R`,
        lot: (0.2 + Math.random()).toFixed(2),
        lane: prev.length % 3,
      }]));
    }, SPAWN);
    return () => clearInterval(id);
  }, [inView, reduced, done]);

  /* Приземлення: квиток зникає зі стрічки й одночасно зʼявляється
     рядком у журналі — без цієї одночасності анімація виглядає як
     два незалежні мультики. */
  const land = (tk) => {
    setTickets((prev) => prev.filter((x) => x.id !== tk.id));
    setLanded((prev) => [{ sym: tk.sym, setup: tk.setup, r: tk.r }, ...prev].slice(0, 4));
    setImported((prev) => {
      const next = Math.min(412, prev + STEP);
      if (next >= 412) {
        setDone(true);
        setTimeout(() => { setImported(0); setLanded([]); setDone(false); }, 4200);
      }
      return next;
    });
  };

  const panel = {
    background: C.sunken, border: '1px solid rgba(255,255,255,.07)',
    borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 14,
  };

  return (
    <section id="autoimport" ref={ref} style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <style>{`
        @keyframes lnTicketFly{0%{left:-16%;opacity:0}12%{opacity:1}86%{opacity:1}100%{left:100%;opacity:0}}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap', marginBottom: 26 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
            <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>АВТОІМПОРТ</span>
          </div>
          <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 10px', color: '#fff' }}>
            Угоди приїжджають самі.
          </h2>
          <p style={{ fontFamily: F.sans, fontSize: 16.5, color: '#8a8a9c', margin: 0, maxWidth: 520 }}>
            Підключаєш MetaTrader 5 — і історія тече в журнал без жодного CSV.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(47,191,143,.07)', border: '1px solid rgba(47,191,143,.26)', borderRadius: 999, padding: '9px 16px' }}>
          <span style={{ position: 'relative', width: 7, height: 7, display: 'block' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.ok, display: 'block' }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.ok, display: 'block', animation: 'lnPing 1.6s ease-out infinite' }} />
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 11.5, letterSpacing: '1.3px', color: C.ok, whiteSpace: 'nowrap' }}>
            {done ? 'СИНХРОНІЗОВАНО' : 'СИНХРОНІЗАЦІЯ АКТИВНА'}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: `1px solid ${C.line}`, borderRadius: 24, padding: 26, overflow: 'hidden' }}>
        <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${A(0.55)},transparent)` }} />
        <span aria-hidden style={{ position: 'absolute', top: -80, left: '34%', width: 400, height: 340, background: 'radial-gradient(circle,rgba(74,59,245,.15),transparent 70%)', filter: 'blur(70px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* ---------- термінал ---------- */}
          <div style={{ ...panel, flex: '1 1 230px', minWidth: 210 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <MonitorSmartphone size={17} strokeWidth={1.8} color="#5aa9ff" />
              <div>
                <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff' }}>MetaTrader 5</div>
                <div style={{ fontFamily: F.mono, fontSize: 11, color: C.text5, marginTop: 2 }}>#71042318 · Демо</div>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,.06)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {MT5_ROWS.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: F.mono, fontSize: 11.5 }}>
                  <span style={{ color: C.text3, width: 54 }}>{m.sym}</span>
                  <span style={{ fontWeight: 700, width: 32, color: m.side === 'BUY' ? C.ok : C.bad }}>{m.side}</span>
                  <span style={{ color: '#3f3f4e', flex: 1 }}>{m.lot}</span>
                  <span style={{ fontWeight: 700, color: m.r.startsWith('−') ? C.bad : C.ok }}>{m.r}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 'auto', fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.1px', color: C.dim }}>
              412 ЗАКРИТИХ ПОЗИЦІЙ
            </div>
          </div>

          {/* ---------- стрічка ---------- */}
          <div style={{ flex: '1 1 260px', minWidth: 200, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Смуги руху вміщаються у висоту контейнера з запасом:
                при кроці в 52px нижня картка вилазила за край і
                накривала підпис під стрічкою. */}
            <div style={{ position: 'relative', height: 176, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: `linear-gradient(90deg,${A(0.08)},${A(0.35)},${A(0.08)})`, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -1, left: 0, width: '34%', height: 4, background: `linear-gradient(90deg,transparent,${A(0.9)},transparent)`, animation: 'lnRailGlow 3.2s linear infinite' }} />
              </div>

              {tickets.map((tk) => (
                <div
                  key={tk.id}
                  onAnimationEnd={() => land(tk)}
                  style={{
                    position: 'absolute', width: 92, background: '#12121c',
                    border: `1px solid ${A(0.4)}`, borderRadius: 11, padding: '8px 10px',
                    boxShadow: '0 12px 30px rgba(74,59,245,.28)',
                    animation: `lnTicketFly ${FLIGHT}ms linear forwards`,
                    top: `${tk.lane * 44 + 2}px`,
                  }}
                >
                  <div style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: '#dcdce8' }}>{tk.sym}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 5 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 10, color: C.text5 }}>{tk.lot}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: tk.r.startsWith('−') ? C.bad : C.ok }}>{tk.r}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', fontFamily: F.mono, fontSize: 10.5, letterSpacing: '1.2px', color: C.dim, marginTop: 12 }}>
              ЗАКРИТІ ПОЗИЦІЇ → ЖУРНАЛ
            </div>
          </div>

          {/* ---------- журнал ---------- */}
          <div style={{ ...panel, flex: '1 1 300px', minWidth: 250, border: `1px solid ${A(0.22)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
                <svg viewBox="0 0 74 74" style={{ width: 74, height: 74, display: 'block', transform: 'rotate(-90deg)' }}>
                  <circle cx="37" cy="37" r="32" fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="6" />
                  <circle
                    cx="37" cy="37" r="32" fill="none" stroke={C.acc} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray="201.1" strokeDashoffset={(201.1 * (1 - imported / 412)).toFixed(1)}
                    style={{ transition: 'stroke-dashoffset .6s ease' }}
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: '#fff' }}>
                  {imported}
                </div>
              </div>

              <div>
                <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Edge Journal</div>
                <div style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 1.45, color: '#7d7d90' }}>
                  {done ? 'Уся історія на місці' : 'з 412 закритих позицій'}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,.06)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 126 }}>
              {landed.map((j, i) => (
                <div key={`${j.sym}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 9, animation: reduced ? 'none' : 'lnRowIn .45s ease-out' }}>
                  <span style={{ width: 3, height: 18, borderRadius: 2, flexShrink: 0, background: j.r.startsWith('−') ? C.bad : C.ok }} />
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, color: C.text, width: 54 }}>{j.sym}</span>
                  <span style={{ fontFamily: F.sans, fontSize: 11.5, color: '#7d7d90', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.setup}</span>
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, fontWeight: 700, color: j.r.startsWith('−') ? C.bad : C.ok }}>{j.r}</span>
                </div>
              ))}

              {!landed.length && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, fontSize: 12, color: '#3f3f4e' }}>
                  чекаю першу позицію…
                </div>
              )}
            </div>

            {done && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'rgba(47,191,143,.09)', border: '1px solid rgba(47,191,143,.28)', borderRadius: 11, padding: '10px 12px', animation: reduced ? 'none' : 'lnFadeUp .35s ease-out' }}>
                <Check size={13} strokeWidth={2.8} color={C.ok} style={{ flexShrink: 0 }} />
                <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 700, color: C.ok }}>
                  412 угод у журналі. Далі — автоматично.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.55, color: C.text5, marginTop: 16, maxWidth: 760 }}>
        Ти пишеш лише людську половину: з якого плану вийшла угода, у якому стані ти був, яке правило порушив.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, marginTop: 24 }}>
        {TRUST.map((t) => (
          <div
            key={t.title}
            style={{ display: 'flex', gap: 13, alignItems: 'flex-start', background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, padding: '17px 18px', transition: 'border-color .2s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(47,191,143,.32)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'; }}
          >
            <Lock size={16} strokeWidth={1.9} color={C.ok} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontFamily: F.sans, fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: '#7d7d90' }}>{t.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
