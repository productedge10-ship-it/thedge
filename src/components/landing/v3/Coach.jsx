import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { C, F, A, Cat, useInView, reducedMotion, SHELL } from './base';

/* ==================================================================
   Коуч.

   Кіт тут не маскот у кутку, а обличчя того, хто говорить: репліки
   підписані ним і в героі, і тут. Праворуч розігрується справжній
   розбір — картка угоди, питання трейдера, дві відповіді з друком.

   Три сцени по колу: тілт після стопу, сетап, який платить, і час,
   який коштує. Одна сцена показала б лише один талант коуча.
================================================================== */

const SCENES = [
  {
    label: 'ТІЛТ ПІСЛЯ СТОПУ',
    sym: 'XAUUSD', r: '−2.1R', time: '14:32', tag: 'без сетапу', pos: false,
    ask: 'Знову взяв угоду на емоціях, віддав увесь ранок.',
    meta: [['сесія', 'Лондон'], ['обсяг', '2× звичного'], ['утримання', '4 хв']],
    m1: 'Це четверта угода на золоті після збитку за тиждень. Усі чотири — мінус, разом −6.2R. Схоже, ти відіграєшся.',
    m2: 'Правило на завтра: після двох мінусів поспіль — стоп до наступної сесії.',
    btn: 'Додати правило в чекліст',
  },
  {
    label: 'СЕТАП, ЯКИЙ ПЛАТИТЬ',
    sym: 'GER40', r: '+3.1R', time: '10:15', tag: 'свінг + FVG', pos: true,
    ask: 'То цей сетап реально працює чи мені щастить?',
    meta: [['сесія', 'Франкфурт'], ['обсяг', 'за планом'], ['утримання', '1 год 20 хв']],
    m1: 'Свінг + FVG дав +11.4R за 14 угод. Це 78% усього твого плюсу за місяць — і найстабільніший сетап у вибірці.',
    m2: 'Тримай його ядром системи. Решту сетапів варто зупинити, поки в них не буде хоча б 20 угод.',
    btn: 'Зробити сетап основним',
  },
  {
    label: 'ЧАС, ЯКИЙ КОШТУЄ',
    sym: 'EURUSD', r: '−1.0R', time: '16:48', tag: 'повз план', pos: false,
    ask: 'Нормальний тиждень був? Відчуття, що ні.',
    meta: [['сесія', 'Нью-Йорк'], ['обсяг', 'за планом'], ['утримання', '11 хв']],
    m1: 'Дисципліна 68% — найгірший тиждень за місяць. Вісім угод із двадцяти двох повз план, усі вісім у проміжку 15:00–17:00.',
    m2: 'Найдешевша зміна: закривати термінал о 15:00. За місяць це +8.4R без жодної нової стратегії.',
    btn: 'Додати межу часу',
  },
];



export default function Coach() {
  const [ref, inView] = useInView(0.15);
  const reduced = reducedMotion();

  const [scene, setScene] = useState(0);
  const [step, setStep] = useState(reduced ? 5 : 0);
  const [m1, setM1] = useState(reduced ? SCENES[0].m1 : '');
  const [m2, setM2] = useState(reduced ? SCENES[0].m2 : '');
  const [typing, setTyping] = useState(0);
  const [ruleAdded, setRuleAdded] = useState(false);

  const timers = useRef([]);
  const typer = useRef(0);
  const alive = useRef(true);


  const later = useCallback((fn, ms) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  const clearAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    clearInterval(typer.current);
  }, []);



  /* Друк по два символи за такт: посимвольно виглядає як зламаний
     термінал, а цілим блоком зникає сам ефект «він зараз думає». */
  const type = useCallback((text, set, done) => {
    let i = 0;
    clearInterval(typer.current);
    typer.current = setInterval(() => {
      i += 2;
      if (i >= text.length) {
        clearInterval(typer.current);
        set(text);
        done?.();
      } else set(text.slice(0, i));
    }, 16);
  }, []);

  /* Сцена не викликає наступну рекурсивно: в кінці вона просто
     перемикає номер сцени, а ефект нижче запускає нову. Так немає
     ані рекурсії в useCallback, ані ланцюжка таймерів, які треба
     ловити при розмонтуванні. */
  const play = useCallback((i) => {
    const sc = SCENES[i];
    clearAll();
    /* Нульовий таймер навмисно: скидання стану синхронно всередині
       ефекту дає зайвий каскадний рендер на кожній зміні сцени. */
    later(() => { setStep(1); setM1(''); setM2(''); setTyping(0); setRuleAdded(false); }, 0);

    later(() => setStep(2), 700);
    later(() => {
      setStep(3);
      later(() => {
        setStep(4); setTyping(1);
        type(sc.m1, setM1, () => {
          setTyping(0);
          later(() => {
            setTyping(2);
            type(sc.m2, setM2, () => {
              setStep(5); setTyping(0);
              later(() => { if (alive.current) setScene((n) => (n + 1) % SCENES.length); }, 5200);
            });
          }, 600);
        });
      }, 900);
    }, 1500);
  }, [clearAll, type, later]);

  useEffect(() => {
    const on = inView && !reduced;
    alive.current = on;
    if (on) play(scene);
    else clearAll();
    return () => {
      alive.current = false;
      clearAll();
    };
  }, [inView, reduced, scene, play, clearAll]);

  const sc = SCENES[scene];
  const accent = sc.pos ? C.ok : C.bad;
  const cardBg = sc.pos ? 'rgba(47,191,143,.07)' : 'rgba(255,123,123,.06)';
  const cardBc = sc.pos ? 'rgba(47,191,143,.26)' : 'rgba(255,123,123,.22)';
  const fade = reduced ? 'none' : 'lnFadeUp .35s ease-out';

  const bubble = (text, showCaret) => (
    <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <Cat size={34} />
      <div style={{ background: A(0.08), border: `1px solid ${A(0.2)}`, borderRadius: 16, borderTopLeftRadius: 5, padding: '13px 16px', fontFamily: F.sans, fontSize: 14, lineHeight: 1.6, color: '#dcdce8', maxWidth: 440 }}>
        {text}
        {showCaret && <span style={{ animation: 'lnCaret 1s step-end infinite', color: C.accSoft }}>▍</span>}
      </div>
    </div>
  );

  return (
    <section id="coach" ref={ref} style={{ ...SHELL, paddingTop: '0', paddingBottom: '72px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>ТВІЙ КОУЧ</span>
      </div>

      <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(28px,2.7vw,52px)', letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 12px', color: '#fff' }}>
        Кіт прочитав кожну твою угоду.
      </h2>
      <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.5, color: '#8a8a9c', margin: '0 0 32px', maxWidth: 660 }}>
        Не чатбот, прикручений до дашборда. Він працює з твоїми цифрами — дисципліна, угоди на тілті, найкращі години.
      </p>

      <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {/* ---------- кіт ---------- */}
        <div style={{ flex: '0 1 260px', minWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, position: 'relative' }}>
          <span
            aria-hidden
            style={{
              position: 'absolute', top: '10%', width: 270, height: 270, borderRadius: '50%',
              background: `radial-gradient(circle,${A(0.24)},transparent 68%)`, filter: 'blur(50px)',
              animation: reduced ? 'none' : 'lnBreathe 6s ease-in-out infinite',
            }}
          />
          {/* Великий портрет — той самий кіт, збільшений трансформом:
              він живий, тож масштабувати треба саме компонент, а не
              підставляти замість нього нерухомий файл. */}
          <span style={{ position: 'relative' }}>
            <Cat size={190} />
          </span>

          {/* Замість трьох безіменних рисок — підписані сцени.
              Риска не каже, що буде далі, і перемикати її наосліп
              нецікаво; назва обіцяє конкретний розбір. */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 260 }}>
            {SCENES.map((sceneItem, i) => {
              const on = i === scene;
              return (
                <button
                  key={sceneItem.label}
                  type="button"
                  onClick={() => setScene(i)}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                    background: on ? A(0.12) : 'rgba(255,255,255,.03)',
                    border: `1px solid ${on ? A(0.42) : 'rgba(255,255,255,.07)'}`,
                    borderRadius: 11, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all .2s ease', overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => { if (!on) e.currentTarget.style.borderColor = A(0.24); }}
                  onMouseLeave={(e) => { if (!on) e.currentTarget.style.borderColor = 'rgba(255,255,255,.07)'; }}
                >
                  <span
                    style={{
                      width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                      background: on ? C.acc : 'rgba(255,255,255,.18)',
                      boxShadow: on ? `0 0 10px 1px ${A(0.9)}` : 'none',
                      transition: 'all .2s',
                    }}
                  />
                  <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '.6px', color: on ? '#fff' : '#7d7d90', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sceneItem.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: F.mono, fontSize: 10.5, color: on ? C.accSoft : C.dim, flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- розбір ---------- */}
        <div style={{ flex: '1 1 520px', minWidth: 320, background: 'linear-gradient(160deg,#0e0e14,#0b0b10)', border: `1px solid ${C.line}`, borderRadius: 22, padding: 24, position: 'relative', overflow: 'hidden', minHeight: 430, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${A(0.5)},transparent)` }} />
          <span aria-hidden style={{ position: 'absolute', top: -70, left: -50, width: 280, height: 280, background: 'radial-gradient(circle,rgba(74,59,245,.13),transparent 70%)', filter: 'blur(60px)' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.4px', color: C.text4 }}>РОЗБІР УГОДИ · {sc.label}</span>
            <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.dim }}>{scene + 1} / {SCENES.length}</span>
          </div>

          {/* Картка угоди — не просто рядок із символом: під нею
              йдуть три обставини, з яких коуч і робить висновок.
              Без них порада виглядає як здогадка, з ними — як розбір
              конкретної угоди. */}
          {step >= 1 && (
            <div style={{ position: 'relative', borderRadius: 14, padding: '13px 15px 12px', animation: fade, background: cardBg, border: `1px solid ${cardBc}`, overflow: 'hidden' }}>
              <span
                aria-hidden
                style={{ position: 'absolute', right: -30, top: -40, width: 140, height: 110, background: accent, filter: 'blur(42px)', opacity: 0.14, pointerEvents: 'none' }}
              />

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 3, height: 26, borderRadius: 2, display: 'block', background: accent, boxShadow: `0 0 10px ${accent}` }} />
                <span style={{ fontFamily: F.mono, fontSize: 13.5, fontWeight: 700, color: C.text, letterSpacing: '.4px' }}>{sc.sym}</span>
                <span style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color: accent }}>{sc.r}</span>
                <span style={{ fontFamily: F.mono, fontSize: 12, color: C.text5 }}>{sc.time}</span>
                <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '5px 11px', marginLeft: 'auto', whiteSpace: 'nowrap', color: accent, background: 'rgba(0,0,0,.25)', border: `1px solid ${cardBc}` }}>
                  {sc.tag}
                </span>
              </div>

              <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 12, paddingTop: 11, borderTop: `1px solid ${cardBc}` }}>
                {sc.meta.map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: '1.2px', textTransform: 'uppercase', color: C.dim }}>{k}</span>
                    <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: C.text2 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step >= 2 && (
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', animation: reduced ? 'none' : 'lnFadeUp .3s ease-out' }}>
              <div style={{ background: 'rgba(255,255,255,.05)', border: `1px solid ${C.line}`, borderRadius: 16, borderTopRightRadius: 5, padding: '12px 16px', fontFamily: F.sans, fontSize: 14, lineHeight: 1.5, color: '#b8b8c8', maxWidth: 400 }}>
                {sc.ask}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'center' }}>
              <Cat size={34} />
              <div style={{ display: 'flex', gap: 5, background: A(0.06), border: `1px solid ${A(0.16)}`, borderRadius: 16, padding: '14px 16px' }}>
                {[0, 0.2, 0.4].map((d) => (
                  <span key={d} style={{ width: 6, height: 6, borderRadius: 999, background: C.acc, display: 'block', animation: `lnBreathe 1.2s ease-in-out ${d}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          {step >= 4 && bubble(m1, typing === 1)}
          {step >= 4 && (typing === 2 || step === 5) && bubble(m2, typing === 2)}

          {step >= 5 && (
            <div style={{ position: 'relative', display: 'flex', gap: 11, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto', paddingTop: 8, animation: fade }}>
              <button
                type="button"
                onClick={() => { setRuleAdded(true); later(() => setRuleAdded(false), 2800); }}
                style={{ background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff', fontFamily: F.sans, fontSize: 13.5, fontWeight: 700, padding: '12px 20px', borderRadius: 12, cursor: 'pointer', boxShadow: '0 12px 30px rgba(74,59,245,.3)', whiteSpace: 'nowrap', transition: 'box-shadow .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 16px 40px rgba(74,59,245,.45)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 12px 30px rgba(74,59,245,.3)'; }}
              >
                {sc.btn}
              </button>

              <button
                type="button"
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.12)', color: '#b8b8c8', fontFamily: F.sans, fontSize: 13.5, fontWeight: 600, padding: '12px 20px', borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.4); e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.12)'; e.currentTarget.style.color = '#b8b8c8'; }}
              >
                Не зараз
              </button>

              {ruleAdded && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(47,191,143,.1)', border: '1px solid rgba(47,191,143,.3)', borderRadius: 11, padding: '10px 14px', animation: reduced ? 'none' : 'lnFadeUp .3s ease-out' }}>
                  <Check size={13} strokeWidth={2.8} color={C.ok} />
                  <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 700, color: C.ok, whiteSpace: 'nowrap' }}>Правило додано</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
