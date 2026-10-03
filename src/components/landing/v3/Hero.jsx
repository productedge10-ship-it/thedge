import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw } from 'lucide-react';
import { C, F, A, Cat, useInView, reducedMotion, SHELL } from './base';
import DemoTransition from './DemoTransition';
import { useLang, useTx, pick } from './lang';
import Button from '../../ui/Button';

/* ==================================================================
   Герой — живий журнал, а не картинка.

   Тут єдине місце на сторінці, де людина щось РОБИТЬ у першу секунду:
   вимикає угоду й бачить, як міняється власний результат. Скріншот
   такого не показує, відео теж — його треба спробувати пальцем.

   Раз на 2.8с зверху приїжджає нова угода з підписом «щойно з MT5»:
   це доводить автоімпорт без жодного слова про нього.
================================================================== */

const POOL = [
  { sym: 'XAUUSD', setup: 'Свінг + FVG', setupEn: 'Swing + FVG', mood: 'Спокій', r: 2.4, bad: false },
  { sym: 'GER40', setup: 'Judas swing', setupEn: 'Judas swing', mood: 'Спокій', r: 1.8, bad: false },
  { sym: 'EURUSD', setup: 'Без сетапу · повз план', setupEn: 'No setup · off plan', mood: 'Нудьга', r: -1, bad: true },
  { sym: 'XAUUSD', setup: 'Сплеск на новині · повз план', setupEn: 'News spike · off plan', mood: 'FOMO', r: -1, bad: true },
  { sym: 'GER40', setup: 'Свінг + FVG', setupEn: 'Swing + FVG', mood: 'Спокій', r: 3.1, bad: false },
  { sym: 'NAS100', setup: 'Ретест OB', setupEn: 'OB retest', mood: 'Фокус', r: 1.6, bad: false },
  { sym: 'BTCUSD', setup: 'Азійський діапазон', setupEn: 'Asian range', mood: 'Спокій', r: 2.2, bad: false },
  { sym: 'EURUSD', setup: 'Подвоїв обсяг · повз план', setupEn: 'Doubled size · off plan', mood: 'Тілт', r: -1.4, bad: true },
  { sym: 'US100', setup: 'Свіп лоу + FVG', setupEn: 'Low sweep + FVG', mood: 'Спокій', r: 1.9, bad: false },
  { sym: 'XAUUSD', setup: 'Відіграв стоп · повз план', setupEn: 'Revenge after stop · off plan', mood: 'Тілт', r: -1.2, bad: true },
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

/* Настрій показуємо мовою сторінки, а в логіці лишається українське
   значення — з ним порівнює підсвітка «FOMO / Тілт» нижче. */
const MOOD_EN = { 'Спокій': 'Calm', 'Нудьга': 'Boredom', FOMO: 'FOMO', 'Фокус': 'Focus', 'Тілт': 'Tilt' };

export default function Hero() {
  const tx = useTx();
  const lang = useLang();
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
    fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(19px,5vw,28px)',
    letterSpacing: '-1px', color, animation: pulseAnim,
  });

  return (
    <section
      id="top"
      ref={ref}
      style={{ ...SHELL, paddingTop: '64px', paddingBottom: '72px', position: 'relative' }}
    >
      <style>{`
        @media (max-width: 460px) {
          .ln-hero-mood, .ln-hero-fresh { display: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', gap: 56, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
        {/* ---------- текст ---------- */}
        <div style={{ flex: '1 1 440px', minWidth: 'min(320px,100%)', maxWidth: 720 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              background: A(0.1), border: `1px solid ${A(0.24)}`, borderRadius: 999,
              padding: '8px 16px', fontFamily: F.sans, fontSize: 12.5, fontWeight: 600,
              color: C.accSoft, marginBottom: 28,
            }}
          >
            {tx('Робочий простір · Аналітика · AI-коуч', 'Workspace · Analytics · AI coach')}
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
            {tx('Не шукай ідеальну стратегію', 'Stop hunting for the perfect strategy')}{' '}
            <br />
            {/* Друга половина заголовка — тим самим білим, без градієнта.
                Градієнт «білий → сірий» — найупізнаваніший прийом
                шаблонних AI-лендінгів, а кінець фрази в ньому ще й
                вицвітав до 6:1. Фразу тримає сама думка й розрив рядка. */}
            {tx('Зрозумій свою', 'Understand yours')}{' '}
            {/* Описовий рядок у самому <h1>: несе ключі (журнал, угод,
                MetaTrader, аналітика), яких немає в поетичному заголовку.
                Дрібніший і приглушений — читається як підзаголовок. */}
            <span
              className="lp-sub"
              style={{
                display: 'block', marginTop: 16,
                fontFamily: F.sans, fontWeight: 600,
                fontSize: 'clamp(15px,1.15vw,19px)', lineHeight: 1.4,
                letterSpacing: '-0.2px', color: C.text3, textWrap: 'pretty',
              }}
            >
              {tx('Торговий журнал трейдера з автоімпортом угод з MetaTrader 5', 'Trading journal with automatic MetaTrader 5 trade import')}
            </span>
          </h1>

          <p style={{ fontFamily: F.sans, fontSize: 'clamp(16.5px,1.05vw,21px)', lineHeight: 1.5, color: C.text3, margin: '0 0 34px', maxWidth: 560 }}>
            {tx('Журнал, який рахує за тебе і каже, де саме ти втрачаєш гроші', 'A journal that does the math for you and shows exactly where you lose money')}
          </p>

          <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap', marginBottom: 20 }}>
            {/* Спільна кнопка застосунку: суцільний акцент і темний напис
                (6:1) замість градієнта з білим (3.3:1) і фіолетової
                заграви. Головну дію видно за кольором — цього досить. */}
            <Button as="a" href="/auth" variant="primary" size="lg" iconRight={ArrowRight}>
              {tx('Почати безкоштовно', 'Start free')}
            </Button>

            <Button
              as="a"
              href="/demo"
              variant="secondary"
              size="lg"
              onClick={(e) => {
                /* Без Ctrl/⌘ переходимо самі: анімований перехід
                   пояснює, куди людина потрапляє. З модифікатором —
                   лишаємо браузеру відкрити в новій вкладці. */
                if (e.metaKey || e.ctrlKey || e.shiftKey || reduced) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDemoFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
            >
              {tx('Спробувати демо', 'Try the demo')}
            </Button>
          </div>

          {/* Три заперечення, які виникають рівно тут, біля кнопки.

              Середнє додано пізніше й навмисно: у FAQ питання «Логін
              інвестора — це безпечно?» стоїть найпершим, тобто ми
              самі знаємо, що воно головне. Але FAQ лежить у кінці
              сторінки, а рішення «пускати чи не пускати до свого
              рахунку» людина ухвалює отут. Відповідь, яка наздогнала
              людину після того, як вона пішла, — це не відповідь.

              Формулювання точне, а не заспокійливе: логін інвестора
              в MetaTrader справді не вміє торгувати й виводити
              кошти, і це властивість самого терміналу, а не наша
              обіцянка. Розгорнуто — там же, у FAQ. */}
          <div style={{ fontFamily: F.mono, fontSize: 13, lineHeight: 1.6, color: C.text4 }}>
            {tx('Без картки · MT5 лише на читання · Кожна таблиця замкнена на твій акаунт', 'No card · MT5 read-only · Every table locked to your account')}
          </div>
        </div>

        {/* ---------- журнал ---------- */}
        <div style={{ flex: '1 1 560px', minWidth: 'min(340px,100%)', position: 'relative' }}>
          <div
            style={{
              position: 'relative',
              background: C.panel,
              border: `1px solid ${C.line}`, borderRadius: 22, overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontFamily: F.mono, fontSize: 11.5, fontWeight: 600, letterSpacing: '1.3px', color: C.text4 }}>
                {tx('ЖУРНАЛ', 'JOURNAL')} · {onCount} {tx('З', 'OF')} {rows.length} {tx('УГОД', 'TRADES')}
              </span>

              <button
                type="button"
                onClick={reset}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, color: C.text4, fontFamily: F.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 6px', borderRadius: 7, transition: 'all .16s' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.accSoft; e.currentTarget.style.background = A(0.1); }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.text4; e.currentTarget.style.background = 'transparent'; }}
              >
                <RotateCcw size={12} strokeWidth={2.2} />
                {tx('Скинути', 'Reset')}
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
                      display: 'flex', alignItems: 'center', gap: 'clamp(7px,2vw,13px)', padding: '12px clamp(12px,4vw,18px)',
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

                    <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 600, color: C.text, width: 58, flexShrink: 0, textDecoration: strike }}>
                      {r.sym}
                    </span>

                    <span style={{ fontFamily: F.sans, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.bad ? '#ff9b9b' : C.text2, textDecoration: strike }}>
                      {lang === 'en' ? r.setupEn : r.setup}
                    </span>

                    {r.fresh && (
                      <span className="ln-hero-fresh" style={{ fontFamily: F.sans, fontSize: 10, fontWeight: 700, letterSpacing: '.5px', color: C.accSoft, background: A(0.14), border: `1px solid ${A(0.32)}`, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {tx('ЩОЙНО З MT5', 'JUST IN FROM MT5')}
                      </span>
                    )}

                    <span
                      className="ln-hero-mood"
                      style={{
                        fontFamily: F.sans, fontSize: 11, fontWeight: 700, letterSpacing: '.4px',
                        width: 50, textAlign: 'right', flexShrink: 0,
                        color: r.mood === 'FOMO' || r.mood === 'Тілт' ? C.warn : r.bad ? '#8a8a9c' : C.ok,
                      }}
                    >
                      {lang === 'en' ? (MOOD_EN[r.mood] || r.mood) : r.mood}
                    </span>

                    <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, width: 46, textAlign: 'right', flexShrink: 0, color: r.r >= 0 ? C.ok : C.bad, textDecoration: strike }}>
                      {(r.r >= 0 ? '+' : '−') + Math.abs(r.r).toFixed(1)}R
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,.06)' }}>
              {[
                [tx('ЧИСТИЙ R', 'NET R'), (disp.netR >= 0 ? '+' : '−') + Math.abs(disp.netR).toFixed(1) + 'R', disp.netR >= 0 ? C.ok : C.bad],
                [tx('ВІНРЕЙТ', 'WIN RATE'), `${Math.round(disp.wr)}%`, C.ok],
                [tx('ПРОФІТ-ФАКТОР', 'PROFIT FACTOR'), disp.inf ? '∞' : disp.pf.toFixed(2), C.text],
              ].map(([label, value, color]) => (
                <div key={label} style={{ background: C.panel2, padding: '16px 18px' }}>
                  <div style={{ fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '1.3px', color: C.text4, marginBottom: 8 }}>
                    {label}
                  </div>
                  {/* Цифра лежить у два шари: нижній — сама
                      величина, верхній — її ж копія акцентним кольором (без ореолу), яка
                      гасне прозорістю. Копія абсолютна, тож у
                      розмітці не займає місця й не зсуває сусідів,
                      а накреслення успадковує від батька — інакше
                      вона б не лягла символ у символ. */}
                  <div style={{ ...num(value, color), position: 'relative', animation: 'none' }}>
                    {value}
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        color: C.acc,
                        /* Спокійний стан — невидимий. Кадри йдуть від
                           одиниці до нуля й нічого по собі не лишають,
                           тож після спалаху шар сам повертається сюди.
                           Це ж рятує режим без анімацій: там animation
                           вимкнено зовсім, і копія просто не видно. */
                        opacity: 0,
                        animation: pulseAnim,
                        pointerEvents: 'none',
                      }}
                    >
                      {value}
                    </span>
                  </div>
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
                  {tx(`Угоди повз план коштували тобі ${catCost}R. Решта твоєї торгівлі — плюс`, `Off-plan trades cost you ${catCost}R. The rest of your trading is green`)}
                </div>
              </div>
            )}
          </div>

          <div style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.5, color: C.text5, marginTop: 14, paddingLeft: 2 }}>
            {tx(
              'Це живий приклад, а не скріншот: угоди приїжджають із MetaTrader 5 самі. Вимкни ті, що взяті повз план, і подивись, яким був би рахунок',
              'This is a live example, not a screenshot: trades arrive from MetaTrader 5 on their own. Switch off the off-plan ones and see what the account would have been',
            )}
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
const TICKER = {
  uk: [
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
    'Українська · English',
  ],
  en: [
    'Trading journal',
    'Trade log',
    'Automatic MetaTrader 5 import',
    'MT5 trade history import',
    'Trading statistics',
    'Trade analytics',
    'R-multiple · profit factor · drawdown',
    'AI trading coach',
    'Trading psychology',
    'Tilt and overtrading',
    'Pre-session checklist',
    'Weekly trade review',
    'Strategy backtesting',
    'Prop firm journal',
    'Forex · Crypto · Indices',
    'CSV export',
    'English · Українська',
  ],
};

export function Ticker() {
  const lang = useLang();
  return (
    <section style={{ height: 80, borderTop: `1px solid ${C.lineSoft}`, borderBottom: `1px solid ${C.lineSoft}`, overflow: 'hidden', display: 'flex', alignItems: 'center', background: '#0a0a0e' }}>
      <div style={{ display: 'flex', width: 'max-content', animation: 'lnMarquee 62s linear infinite' }}>
        {[0, 1].map((run) => (
          <div key={run} aria-hidden={run === 1} style={{ display: 'flex', alignItems: 'center', gap: 38, paddingRight: 38 }}>
            {pick(lang, TICKER).map((label) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 38, fontFamily: F.mono, fontSize: 13, letterSpacing: '1.4px', color: C.dim, whiteSpace: 'nowrap' }}>
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
