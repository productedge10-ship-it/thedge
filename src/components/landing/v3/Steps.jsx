import { useEffect, useRef, useState } from 'react';
import { C, F, A, SHELL } from './base';

/* ==================================================================
   Три кроки.

   На широкому екрані — рейка, у якій лінія заповнюється зліва
   направо, поки людина прокручує блок. На вузькому кроки стоять
   один під одним, і та сама лінія стає вертикальним таймлайном
   зверху вниз: горизонтальна рейка над одним-єдиним кружечком
   виглядала як помилка верстки, а не як «крок 1 із 3».

   Значення заповнення (`p`) одне на обидва вигляди — рахує його той
   самий скрол-ефект, різниться лише CSS-змінна, яку рейка читає як
   ширину або як висоту залежно від брейкпоінту.
================================================================== */

const STEPS = [
  { n: '1', title: 'Імпорт', sub: 'Підключаєш MetaTrader 5 — закриті позиції лягають у журнал самі', at: 0.06 },
  { n: '2', title: 'Запис', sub: 'Дописуєш половину, якої не експортує брокер: план, стан, порушене правило', at: 0.45 },
  { n: '3', title: 'Знайди перевагу', sub: 'Аналітика ранжує сесії, сетапи й настрої за тим, скільки вони платять', at: 0.82 },
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
      <style>{`
        .ln-steps-outer{ position: relative; }
        .ln-steps-rail{
          position: absolute; top: 23px; left: 8%; right: 8%; height: 2px;
          background: rgba(255,255,255,.07); border-radius: 2px; overflow: hidden;
        }
        .ln-steps-rail-fill{
          display: block; height: 100%; width: var(--p, 0%);
          background: linear-gradient(90deg,${C.accDeep},${C.acc});
          box-shadow: 0 0 16px ${A(0.6)}; transition: width .3s ease;
        }
        .ln-steps-grid{
          display: grid; grid-template-columns: repeat(auto-fit,minmax(min(240px,100%),1fr));
          gap: 28px; position: relative;
        }
        .ln-steps-item{ display: flex; flex-direction: column; align-items: center; text-align: center; }
        .ln-steps-num{
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px; transition: all .3s ease; background: ${C.panel2};
        }
        .ln-steps-sub{ max-width: 290px; }

        @media (max-width: 680px){
          .ln-steps-rail{ top: 0; bottom: 0; left: 22px; right: auto; width: 2px; height: auto; }
          .ln-steps-rail-fill{ width: 100%; height: var(--p, 0%); }
          .ln-steps-grid{ display: flex; flex-direction: column; gap: 0; }
          .ln-steps-item{ flex-direction: row; align-items: flex-start; text-align: left; gap: 18px; padding: 16px 0; }
          .ln-steps-num{ margin-bottom: 0; }
          .ln-steps-sub{ max-width: none; }
        }
      `}
      </style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>ТРИ КРОКИ</span>
      </div>

      <div className="ln-steps-outer">
        <div className="ln-steps-rail">
          <div className="ln-steps-rail-fill" style={{ '--p': `${(p * 100).toFixed(1)}%` }} />
        </div>

        <div className="ln-steps-grid">
          {STEPS.map((s) => {
            const reached = p >= s.at;
            return (
              <div key={s.n} className="ln-steps-item">
                <div
                  className="ln-steps-num"
                  style={{
                    border: `1px solid ${reached ? A(0.55) : 'rgba(255,255,255,.1)'}`,
                    boxShadow: reached ? `0 0 28px ${A(0.3)}` : 'none',
                  }}
                >
                  <span style={{ fontFamily: F.display, fontWeight: 700, fontSize: 16.5, color: reached ? '#fff' : C.text5 }}>{s.n}</span>
                </div>

                <div>
                  <div style={{ fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, marginBottom: 8, color: reached ? '#fff' : '#8a8a9c', transition: 'color .3s' }}>
                    {s.title}
                  </div>
                  <div className="ln-steps-sub" style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.55, color: '#7d7d90' }}>{s.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
