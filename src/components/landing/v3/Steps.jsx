import { useEffect, useRef, useState } from 'react';
import { C, F, A, SHELL } from './base';

/* ==================================================================
   Три кроки.

   Не три картки поруч, а рейка, у якій лінія заповнюється, поки
   людина прокручує блок. Прокрутка сама стає демонстрацією руху
   «імпорт → запис → перевага», і блок займає 200px замість екрана.
================================================================== */

const STEPS = [
  { n: '1', title: 'Імпорт', sub: 'Підключаєш MetaTrader 5 — закриті позиції лягають у журнал самі.', at: 0.06 },
  { n: '2', title: 'Запис', sub: 'Дописуєш половину, якої не експортує брокер: план, стан, порушене правило.', at: 0.45 },
  { n: '3', title: 'Знайди перевагу', sub: 'Аналітика ранжує сесії, сетапи й настрої за тим, скільки вони платять.', at: 0.82 },
];

export default function Steps() {
  const ref = useRef(null);
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const v = (window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.25);
      setP(Math.max(0, Math.min(1, v)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <section ref={ref} style={{ ...SHELL, paddingTop: '52px', paddingBottom: '56px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>ТРИ КРОКИ</span>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 23, left: '8%', right: '8%', height: 2, background: 'rgba(255,255,255,.07)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              height: 2, width: `${(p * 100).toFixed(1)}%`,
              background: `linear-gradient(90deg,${C.accDeep},${C.acc})`,
              boxShadow: `0 0 16px ${A(0.6)}`, transition: 'width .3s ease',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 28, position: 'relative' }}>
          {STEPS.map((s) => {
            const reached = p >= s.at;
            return (
              <div key={s.n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div
                  style={{
                    width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 16, transition: 'all .3s ease', background: C.panel2,
                    border: `1px solid ${reached ? A(0.55) : 'rgba(255,255,255,.1)'}`,
                    boxShadow: reached ? `0 0 28px ${A(0.3)}` : 'none',
                  }}
                >
                  <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 16.5, color: reached ? '#fff' : C.text5 }}>{s.n}</span>
                </div>

                <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, marginBottom: 8, color: reached ? '#fff' : '#8a8a9c', transition: 'color .3s' }}>
                  {s.title}
                </div>
                <div style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: '#7d7d90', maxWidth: 290 }}>{s.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
