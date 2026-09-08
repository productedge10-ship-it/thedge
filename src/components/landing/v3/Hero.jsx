import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { C, F, A, Cat, Glow, useInView, reducedMotion, SHELL } from './base';
import DemoTransition from './DemoTransition';

/* ==================================================================
   Герой — живий журнал, а не картинка.

   Тут єдине місце на сторінці, де людина щось РОБИТЬ у першу секунду:
   вимикає угоду й бачить, як міняється власний результат. Скріншот
   такого не показує, відео теж — його треба спробувати пальцем.

   Раз на 2.8с зверху приїжджає нова угода з підписом «щойно з MT5»:
   це доводить автоімпорт без жодного слова про нього.
================================================================== */

const POOL = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', mood: 'Спокій', r: 2.4, bad: false },
  { sym: 'GER40', setup: 'Judas swing', mood: 'Спокій', r: 1.8, bad: false },
  { sym: 'EURUSD', setup: 'Без сетапу · повз план', mood: 'Нудьга', r: -1, bad: true },
  { sym: 'XAUUSD', setup: 'Сплеск на новині · повз план', mood: 'FOMO', r: -1, bad: true },
  { sym: 'GER40', setup: 'Свінг + FVG', mood: 'Спокій', r: 3.1, bad: false },
  { sym: 'NAS100', setup: 'Ретест OB', mood: 'Фокус', r: 1.6, bad: false },
  { sym: 'BTCUSD', setup: 'Азійський діапазон', mood: 'Спокій', r: 2.2, bad: false },
  { sym: 'EURUSD', setup: 'Подвоїв обсяг · повз план', mood: 'Тілт', r: -1.4, bad: true },
  { sym: 'US100', setup: 'Свіп лоу + FVG', mood: 'Спокій', r: 1.9, bad: false },
  { sym: 'XAUUSD', setup: 'Відіграв стоп · повз план', mood: 'Тілт', r: -1.2, bad: true },
];

const statsOf = (rows) => {
  const on = rows.filter((r) => r.on);
  const net = on.reduce((a, r) => a + r.r, 0);
  const wins = on.filter((r) => r.r > 0);
  const w = wins.reduce((a, r) => a + r.r, 0);
  const l = Math.abs(on.filter((r) => r.r < 0).reduce((a, r) => a + r.r, 0));
  return { netR: net, wr: on.length ? (wins.length / on.length) * 100 : 0, pf: l ? w / l : w, inf: !l };
};

const lerp = (a, b, t) => a + (b - a) * t;

export default function Hero() {
  const [ref, inView] = useInView(0.15);
  const reduced = reducedMotion();
  const navigate = useNavigate();
  /* Координати кліку — щоб коло розкрилось саме з кнопки, а не
     абстрактно з центру екрана. */
  const [demoFrom, setDemoFrom] = useState(null);

  const [rows, setRows] = useState(() => POOL.slice(0, 6).map((t, i) => ({ ...t, id: i, on: true, fresh: false })));
  /* Лічильник у ref, а не в стані: у StrictMode React навмисно
     викликає оновлювачі стану двічі, і побічний ефект усередині
     такого оновлювача теж спрацьовував двічі — журнал ріс удвічі
     швидше й наповнювався дублями. */
  const nextId = useRef(6);
  const [pulse, setPulse] = useState(0);
  const [disp, setDisp] = useState(() => statsOf(POOL.slice(0, 6).map((t) => ({ ...t, on: true }))));

  const raf = useRef(0);
  /* Дзеркало для твіну: читати стан прямо в rAF не можна — там
     завжди буде значення з того рендера, у якому анімацію запустили. */
  const dispRef = useRef(disp);
  useEffect(() => { dispRef.current = disp; }, [disp]);

  /* Цифри не перескакують, а доїжджають за 600мс: стрибок читається як
     помилка рендера, плавний хід — як підрахунок. */
  const tween = useCallback((nextRows) => {
    const target = statsOf(nextRows);
    if (reduced) { setDisp(target); return; }
    const from = dispRef.current || target;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 600);
      const e = 1 - (1 - k) ** 3;
      setDisp({
        netR: lerp(from.netR, target.netR, e),
        wr: lerp(from.wr, target.wr, e),
        pf: lerp(from.pf, target.pf, e),
        inf: target.inf,
      });
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [reduced]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* Перерахунок цифр — реакція на зміну списку, а не побічний ефект
     усередині setState: у StrictMode оновлювачі викликаються двічі,
     і твін теж запускався двічі. */
  useEffect(() => { tween(rows); }, [rows, tween]);

  useEffect(() => {
    if (!inView || reduced) return undefined;
    const id = setInterval(() => {
      const t = POOL[nextId.current % POOL.length];
      nextId.current += 1;

      setRows((prev) => {
        /* Номер рахуємо від уже наявних, а не з окремого лічильника:
           оновлювачі застосовуються послідовно, тому навіть два
           таймери поспіль не видадуть однакового id. Раніше ключі
           повторювались і React лаявся на дублі. */
        const id = prev.reduce((m, r) => Math.max(m, r.id), -1) + 1;
        return [{ ...t, id, on: true, fresh: true }, ...prev].slice(0, 6);
      });
      setPulse((p) => p + 1);
      setTimeout(() => setRows((prev) => prev.map((r) => ({ ...r, fresh: false }))), 2200);
    }, 2800);
    return () => clearInterval(id);
  }, [inView, reduced, tween]);

  const toggle = (id) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
    setPulse((p) => p + 1);
  };

  const reset = () => {
    setRows((prev) => prev.map((r) => ({ ...r, on: true })));
    setPulse((p) => p + 1);
  };

  const offBad = rows.filter((r) => r.bad && !r.on);
  const catShown = offBad.length >= 2;
  const catCost = Math.abs(offBad.reduce((a, r) => a + r.r, 0)).toFixed(1);
  const onCount = rows.filter((r) => r.on).length;
  const pulseAnim = reduced ? 'none' : `${pulse % 2 === 0 ? 'lnNumA' : 'lnNumB'} .4s ease-out`;

  const num = (v, color) => ({
    fontFamily: F.display, fontWeight: 700, fontSize: 28,
    letterSpacing: '-1px', color, animation: pulseAnim,
  });

  return (
    <section
      id="top"
      ref={ref}
      style={{ ...SHELL, paddingTop: '64px', paddingBottom: '72px', position: 'relative' }}
    >
      <Glow x={-120} y={-30} size={500} />

      <div style={{ display: 'flex', gap: 56, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
        {/* ---------- текст ---------- */}
        <div style={{ flex: '1 1 440px', minWidth: 320, maxWidth: 720 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              background: A(0.1), border: `1px solid ${A(0.24)}`, borderRadius: 999,
              padding: '8px 16px', fontFamily: F.sans, fontSize: 12.5, fontWeight: 600,
              color: C.accSoft, marginBottom: 28, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: 999, background: C.acc, display: 'block' }} />
            Робочий простір · Аналітика · AI-коуч
          </div>

          <h1
            style={{
              fontFamily: F.display, fontWeight: 700,
              /* Стеля піднята: на 24-дюймовому моніторі заголовок у
                 58px губився серед порожнечі, тоді як vw уже давав
                 удвічі більше. */
              fontSize: 'clamp(36px,3.6vw,72px)', lineHeight: 1.04,
              letterSpacing: '-1.9px', margin: '0 0 24px', color: '#fff', textWrap: 'balance',
            }}
          >
            Не шукай ідеальну стратегію.
            <br />
            <span
              style={{
                background: 'linear-gradient(170deg,#ffffff 32%,#a9a5bd)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
              }}
            >
              Зрозумій свою.
            </span>
          </h1>

          <p style={{ fontFamily: F.sans, fontSize: 'clamp(16.5px,1.05vw,21px)', lineHeight: 1.5, color: C.text3, margin: '0 0 34px', maxWidth: 560 }}>
            Журнал, який рахує за тебе і каже, де саме ти втрачаєш гроші.
          </p>

          <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', marginBottom: 20 }}>
            <a
              href="/auth"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: `linear-gradient(135deg,${C.acc},${C.accDeep})`, border: 0, color: '#fff',
                fontFamily: F.sans, fontSize: 15.5, fontWeight: 700, padding: '16px 28px',
                borderRadius: 14, cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 16px 44px rgba(74,59,245,.4)', transition: 'all .2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 20px 54px rgba(74,59,245,.56)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 16px 44px rgba(74,59,245,.4)'; e.currentTarget.style.transform = 'none'; }}
            >
              Почати безкоштовно
              <ArrowRight size={16} strokeWidth={2.4} />
            </a>

            <a
              href="/demo"
              onClick={(e) => {
                /* Без Ctrl/⌘ переходимо самі: анімований перехід
                   пояснює, куди людина потрапляє. З модифікатором —
                   лишаємо браузеру відкрити в новій вкладці. */
                if (e.metaKey || e.ctrlKey || e.shiftKey || reduced) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDemoFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              style={{
                background: 'transparent', border: `1px solid ${C.line}`, color: C.text,
                fontFamily: F.sans, fontSize: 15.5, fontWeight: 600, padding: '16px 26px',
                borderRadius: 14, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = A(0.5); e.currentTarget.style.background = A(0.07); }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = 'transparent'; }}
            >
              Спробувати демо
            </a>
          </div>

          <div style={{ fontFamily: F.mono, fontSize: 13, color: C.text4 }}>
            Без картки · Кожна таблиця замкнена на твій акаунт
          </div>
        </div>

        {/* ---------- журнал ---------- */}
        <div style={{ flex: '1 1 560px', minWidth: 340, position: 'relative' }}>
          <Glow x="calc(100% - 270px)" y={-20} size={320} color={A(0.15)} blur={80} />

          <div
            style={{
              position: 'relative',
              background: 'linear-gradient(160deg,#0e0e14,#0b0b10)',
              border: `1px solid ${C.line}`, borderRadius: 22, overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,.6)',
            }}
          >
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${A(0.55)},transparent)` }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: F.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: '1.3px', color: C.text4 }}>
                <span style={{ position: 'relative', width: 6, height: 6, display: 'block' }}>
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.ok, display: 'block' }} />
                  <span style={{ position: 'absolute', inset: 0, borderRadius: 999, background: C.ok, display: 'block', animation: 'lnPing 1.8s ease-out infinite' }} />
                </span>
                ЖУРНАЛ · {onCount} З {rows.length} УГОД
              </span>

              <button
                type="button"
                onClick={reset}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, color: C.text4, fontFamily: F.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 6px', borderRadius: 7, transition: 'all .16s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.accSoft; e.currentTarget.style.background = A(0.1); }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.text4; e.currentTarget.style.background = 'transparent'; }}
              >
                <RotateCcw size={12} strokeWidth={2.2} />
                Скинути
              </button>
            </div>

            <div>
              {rows.map((r) => {
                const strike = r.on ? 'none' : 'line-through';
                return (
                  <div
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px',
                      borderBottom: '1px solid rgba(255,255,255,.035)', cursor: 'pointer',
                      transition: 'opacity .2s ease', opacity: r.on ? 1 : 0.4,
                      animation: r.fresh && !reduced ? 'lnRowIn .5s ease-out, lnFlashIn 1.6s ease-out' : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 17, height: 17, borderRadius: 6, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${r.on ? C.acc : 'rgba(255,255,255,.2)'}`,
                        background: r.on ? C.accDeep : 'transparent',
                      }}
                    >
                      {r.on && <Check size={10} strokeWidth={3.4} color="#fff" />}
                    </span>

                    <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.text, width: 70, flexShrink: 0, textDecoration: strike }}>
                      {r.sym}
                    </span>

                    <span style={{ fontFamily: F.sans, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.bad ? '#ff9b9b' : C.text2, textDecoration: strike }}>
                      {r.setup}
                    </span>

                    {r.fresh && (
                      <span style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: '.5px', color: C.accSoft, background: A(0.14), border: `1px solid ${A(0.32)}`, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        ЩОЙНО З MT5
                      </span>
                    )}

                    <span
                      style={{
                        fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '.4px',
                        width: 50, textAlign: 'right', flexShrink: 0,
                        color: r.mood === 'FOMO' || r.mood === 'Тілт' ? C.warn : r.bad ? '#8a8a9c' : C.ok,
                      }}
                    >
                      {r.mood}
                    </span>

                    <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, width: 52, textAlign: 'right', flexShrink: 0, color: r.r >= 0 ? C.ok : C.bad, textDecoration: strike }}>
                      {(r.r >= 0 ? '+' : '−') + Math.abs(r.r).toFixed(1)}R
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.06)' }}>
              {[
                ['ЧИСТИЙ R', (disp.netR >= 0 ? '+' : '−') + Math.abs(disp.netR).toFixed(1) + 'R', disp.netR >= 0 ? C.ok : C.bad],
                ['ВІНРЕЙТ', `${Math.round(disp.wr)}%`, C.ok],
                ['ПРОФІТ-ФАКТОР', disp.inf ? '∞' : disp.pf.toFixed(2), C.text],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: C.panel2, padding: '16px 18px' }}>
                  <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '1.3px', color: C.text4, marginBottom: 8 }}>
                    {label}
                  </div>
                  <div style={num(value, color)}>{value}</div>
                </div>
              ))}
            </div>

            {catShown && (
              <div
                style={{
                  display: 'flex', gap: 13, alignItems: 'center', padding: '15px 18px',
                  background: A(0.07), borderTop: `1px solid ${A(0.18)}`,
                  animation: reduced ? 'none' : 'lnFadeUp .35s ease-out',
                }}
              >
                {/* Той самий живий кіт, що в застосунку: стежить за
                    курсором, кліпає, ворушить вухами. Статична
                    картинка тут читалась як іконка, а не як співрозмовник. */}
                <Cat size={38} />
                <div style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.5, color: '#cfcfdd' }}>
                  Угоди повз план коштували тобі {catCost}R. Решта твоєї торгівлі — плюс.
                </div>
              </div>
            )}
          </div>

          <div style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: C.text5, marginTop: 14, paddingLeft: 2 }}>
            Це живий приклад, а не скріншот: угоди приїжджають із MetaTrader 5 самі.
            Вимкни ті, що взяті повз план, і подивись, яким був би рахунок.
          </div>
        </div>
      </div>

      {demoFrom && (
        <DemoTransition
          origin={demoFrom}
          onDone={() => {
            /* Прапорець читає вже пісочниця: вона продовжує ту саму
               анімацію замість того, щоб клацнути новим екраном. */
            try { sessionStorage.setItem('edge.demo.enter', '1'); } catch { /* приватний режим */ }
            navigate('/demo');
          }}
        />
      )}
    </section>
  );
}

/* ---------- стрічка ---------- */

/* Слова в стрічці — це не декор, а єдине місце на першому екрані, де
   поруч стоять усі запити, за якими продукт шукають: «щоденник
   трейдера», «імпорт історії MT5», «психологія трейдингу». Тому
   список тримаємо як пошукові фрази, а не як перелік ринків.

   Стрічка малюється двічі, щоб цикл не мав шва. Другий прогін
   позначений aria-hidden: для читалки й для пошуковика це той самий
   текст двічі, і дубль тут ні до чого. */
const TICKER = [
  'Щоденник трейдера',
  'Журнал угод',
  'Trading journal',
  'Автоімпорт з MetaTrader 5',
  'Імпорт історії угод MT5',
  'Статистика торгівлі',
  'Аналітика угод',
  'R-multiple · профіт-фактор · просадка',
  'AI-коуч для трейдера',
  'Психологія трейдингу',
  'Тілт і овертрейдинг',
  'Чекліст перед сесією',
  'Тижневий розбір угод',
  'Бектест стратегії',
  'Журнал для пропфірми',
  'Форекс · Крипта · Індекси',
  'CSV-експорт',
  'Українська · English · Русский',
];

export function Ticker() {
  return (
    <section style={{ height: 80, borderTop: `1px solid ${C.lineSoft}`, borderBottom: `1px solid ${C.lineSoft}`, overflow: 'hidden', display: 'flex', alignItems: 'center', background: '#0a0a0e' }}>
      <div style={{ display: 'flex', width: 'max-content', animation: 'lnMarquee 62s linear infinite' }}>
        {[0, 1].map((run) => (
          <div key={run} aria-hidden={run === 1} style={{ display: 'flex', alignItems: 'center', gap: 38, paddingRight: 38 }}>
            {TICKER.map((label) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 38, fontFamily: F.mono, fontSize: 13, letterSpacing: '1.4px', color: C.dim, whiteSpace: 'nowrap' }}>
                {label}
                <span style={{ width: 4, height: 4, borderRadius: 999, background: '#2b2b38', display: 'block' }} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
