import { useEffect, useMemo, useRef, useState } from 'react';
import { F, Cat, KEYFRAMES, reducedMotion } from '../landing/v3/base';
import { EMOTION_LABEL, r1, signed } from './data';

/* ==================================================================
   Розділ AI — «Твій коуч».

   Оформлення 1:1 з макета «AI Coach Section»: м'ятно-фіолетова
   палітра, зорі, глоу, картки з ховерами. Шрифти — наші (F.*), а не
   з макета. Кіт, що «літає» у рамці, і аватар у картці «так це
   виглядатиме» — той самий монограмний кіт, що в сайдбарі.

   Заглушка не порожня навмисно: показано, як розбір виглядатиме, і
   зібрано його з реальних чисел журналу — з чесною позначкою, що це
   поки формула, а не модель.
================================================================== */

const strokeProps = {
  width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
};

const ICONS = {
  chat: (
    <svg {...strokeProps}>
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-3.9-.9L3 21l1.9-4.9A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" />
    </svg>
  ),
  cal: (
    <svg {...strokeProps}>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  ),
  target: (
    <svg {...strokeProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  ),
  spark: (
    <svg {...strokeProps}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  ),
};

const LockSvg = ({ stroke = '#5f5f75' }) => (
  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke={stroke} strokeWidth="1.3">
    <rect x="1" y="6" width="10" height="7" rx="2" />
    <path d="M3.5 6V4a2.5 2.5 0 015 0v2" />
  </svg>
);

const FEATURES = [
  {
    icon: 'chat',
    title: 'Психолог журналу',
    text: 'Бачить усі угоди разом з емоціями, помилками й часом утримання. Відповідає цифрами з твого журналу, а не порадами з інтернету.',
  },
  {
    icon: 'cal',
    title: 'Розбір тижня',
    text: 'Щопонеділка коротко: що змінилось проти минулого тижня, де зʼявився новий витік, що прибрати найпершим.',
  },
  {
    icon: 'target',
    title: 'Рання ознака зриву',
    text: 'Помічає, що поведінка змінилась, раніше ніж це стане видно на кривій. Розмір позиції, темп входів, час доби.',
  },
  {
    icon: 'spark',
    title: 'Питання до угоди',
    text: 'Відкрив угоду — спитав, чому вона пішла не так. Відповідь спирається на сусідні угоди, а не на загальні правила.',
  },
];

/* Ключові кадри з макета. lnFadeUp і reduced-motion лишаються з
   лендінга (KEYFRAMES). */
const COACH_KF = `
@keyframes coachFloat{0%,100%{transform:translate3d(0,0,0) rotate(0deg)}50%{transform:translate3d(0,-18px,0) rotate(4deg)}}
@keyframes coachPulse{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}
@keyframes coachTwinkle{0%,100%{opacity:.15}50%{opacity:.9}}
@keyframes coachSweep{0%{transform:translateX(-120%)}60%,100%{transform:translateX(220%)}}
@keyframes coachDot{0%,100%{box-shadow:0 0 0 0 rgba(46,230,168,.55)}50%{box-shadow:0 0 0 6px rgba(46,230,168,0)}}
@keyframes coachWordFloat{0%{transform:translate(-50%,0) rotate(0deg) scale(1)}30%{transform:translate(-50%,-15px) rotate(-.55deg) scale(1.012)}62%{transform:translate(-50%,-7px) rotate(.45deg) scale(1.006)}100%{transform:translate(-50%,0) rotate(0deg) scale(1)}}
@keyframes coachWordGlow{0%,100%{opacity:.55}50%{opacity:1}}
.ln-ai-grid{display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:60px;align-items:start}
@media(max-width:920px){.ln-ai-grid{grid-template-columns:1fr;gap:36px}}
.ln-ai-bleed{margin:-24px -16px -64px}
@media(min-width:1024px){.ln-ai-bleed{margin:-24px -32px -64px}}
`;

/* Приклад розбору. Рахується формулами — тими самими, що вже живуть у
   решті аналітики. Модель писатиме інакше й глибше, але показати, як
   це виглядатиме, можна вже зараз. */
function buildSample(s) {
  const n = s?.trades?.length || 0;
  if (!n) return null;

  const emo = [...(s.emotionStats || [])].filter((e) => e.trades);
  const best = emo.length ? [...emo].sort((a, b) => b.avg - a.avg)[0] : null;
  const worst = emo.length ? [...emo].sort((a, b) => a.avg - b.avg)[0] : null;
  const leak = (s.mistakeLedger || []).find((m) => m.count > 0);
  const ses = [...(s.bySession || [])].filter((x) => x.trades);
  const bestSes = ses.length ? [...ses].sort((a, b) => b.net - a.net)[0] : null;

  const lines = [];

  if (best && worst && best.emotion !== worst.emotion) {
    lines.push(
      `Твоя перевага живе в одному режимі: у стані «${EMOTION_LABEL[best.emotion]}» середня угода ${signed(best.avg, 2)}R, у стані «${EMOTION_LABEL[worst.emotion]}» — ${signed(worst.avg, 2)}R. Це не ринок, це стан входу.`,
    );
  }
  if (leak) {
    lines.push(
      `Найдорожча звичка — «${leak.name}»: ${leak.count} разів, ${r1(leak.cost)}R збитку. Прибрати її дешевше, ніж шукати новий сетап.`,
    );
  }
  if (Number.isFinite(s.avgAfterLoss) && Number.isFinite(s.avgAfterWin)) {
    lines.push(
      `Після збитку середній результат ${signed(s.avgAfterLoss, 2)}R проти ${signed(s.avgAfterWin, 2)}R після плюса.`
      + (s.avgAfterLoss < s.avgAfterWin
        ? ' Пауза на пів години після мінуса — найдешевший фікс у журналі.'
        : ' Відновлюєшся після мінуса добре — це сильна сторона.'),
    );
  }
  if (bestSes) {
    lines.push(`Найкраще платить ${bestSes.session}: ${signed(bestSes.net)}R за ${bestSes.trades} угод.`);
  }

  return lines.length ? lines : null;
}

/* ---------- репліка коуча: hover зсуває вправо й підсвічує рамку ---------- */
function Bubble({ children, reduced, caret, dim }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', padding: '18px 22px', borderRadius: 18,
        border: `1px solid ${hover ? 'rgba(46,230,168,.34)' : 'rgba(255,255,255,.07)'}`,
        background: 'linear-gradient(120deg, rgba(255,255,255,.045), rgba(255,255,255,.015))',
        fontFamily: F.sans, fontSize: 15.5, lineHeight: 1.6, color: dim ? '#9a9ab0' : '#d2d2e2',
        transform: hover ? 'translateX(4px)' : 'none',
        transition: 'border-color .3s ease, transform .3s ease, color .3s ease',
        animation: reduced ? 'none' : 'lnFadeUp .4s cubic-bezier(.2,.8,.2,1) both',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute', left: 0, top: 16, bottom: 16, width: 2, borderRadius: 2,
          background: 'linear-gradient(180deg, #2ee6a8, rgba(108,92,231,.5))', opacity: 0.7,
        }}
      />
      {children}
      {caret && (
        <span aria-hidden style={{ animation: 'lnCaret 1s step-end infinite', color: '#2ee6a8', marginLeft: 1 }}>▍</span>
      )}
    </div>
  );
}

/* ---------- чат коуча: репліки з'являються по черзі й друкуються ----------
   Кожен блок «живе у своєму часі»: наступний стартує лише коли
   попередній дописався. Перед друком — три крапки, під час — миготливий
   курсор, між репліками — коротка пауза. */
function CoachChat({ lines, reduced }) {
  const [visible, setVisible] = useState(reduced ? lines.length : 0);
  const [done, setDone] = useState(reduced ? lines.length : 0);
  const [typing, setTyping] = useState({ idx: -1, text: '' });
  const timers = useRef([]);

  const push = (t) => { timers.current.push(t); return t; };

  // прибрати всі таймери при демонтуванні
  useEffect(() => () => {
    timers.current.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers.current = [];
  }, []);

  // старт: перша репліка
  useEffect(() => {
    if (reduced) return undefined;
    const boot = push(setTimeout(() => setVisible(1), 240));
    return () => clearTimeout(boot);
  }, [reduced]);

  // друк активної репліки: пауза на «роздуми», далі по 2 символи за такт
  useEffect(() => {
    if (reduced) return undefined;
    const idx = visible - 1;
    if (idx < 0 || idx < done || idx >= lines.length) return undefined;
    const full = lines[idx];
    const warm = push(setTimeout(() => {
      let i = 0;
      const tick = push(setInterval(() => {
        i += 1;
        if (i >= full.length) {
          clearInterval(tick);
          setTyping({ idx, text: full });
          setDone(idx + 1);
        } else {
          setTyping({ idx, text: full.slice(0, i) });
        }
      }, 16));
    }, 400));
    return () => clearTimeout(warm);
  }, [visible, done, lines, reduced]);

  // дописав — коротка пауза, тоді наступна репліка
  useEffect(() => {
    if (reduced || done === 0 || done >= lines.length || visible > done) return undefined;
    const nx = push(setTimeout(() => setVisible(done + 1), 460));
    return () => clearTimeout(nx);
  }, [done, visible, lines.length, reduced]);

  const shown = reduced ? lines.length : visible;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      {lines.slice(0, shown).map((line, i) => {
        const finished = reduced || i < done;
        const active = !finished && i === shown - 1;
        const text = active && typing.idx === i ? typing.text : '';
        const warming = active && text === '';
        return (
          <Bubble key={i} reduced={reduced} caret={active && !warming} dim={warming}>
            {finished ? line : warming ? '· · ·' : text || '​'}
          </Bubble>
        );
      })}
    </div>
  );
}

/* ---------- картка «що готується»: hover піднімає й додає м'ятну тінь ---------- */
function FeatureCard({ icon, title, text, i, reduced }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden', padding: '28px 26px 30px', borderRadius: 24,
        border: `1px solid ${hover ? 'rgba(46,230,168,.3)' : 'rgba(255,255,255,.07)'}`,
        background: 'linear-gradient(165deg, rgba(20,21,31,.9), rgba(9,10,15,.9))',
        transform: hover ? 'translateY(-6px)' : 'none',
        boxShadow: hover ? '0 34px 70px -34px rgba(46,230,168,.4)' : 'none',
        transition: 'transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s ease, box-shadow .35s ease',
        animation: reduced ? 'none' : `lnFadeUp .4s ease-out ${(0.05 * i).toFixed(2)}s both`,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute', top: -60, right: -60, width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(108,92,231,.22), transparent 70%)',
        }}
      />
      <span
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: 14, marginBottom: 22, color: '#b9aefb',
          border: '1px solid rgba(108,92,231,.35)',
          background: 'linear-gradient(150deg, rgba(108,92,231,.22), rgba(255,255,255,.02))',
        }}
      >
        {ICONS[icon]}
      </span>
      <div style={{ position: 'relative', fontFamily: F.sans, fontSize: 16.5, fontWeight: 700, color: '#fff', marginBottom: 10, letterSpacing: '-.01em' }}>
        {title}
      </div>
      <div style={{ position: 'relative', fontFamily: F.sans, fontSize: 14, lineHeight: 1.62, color: '#7d7d93' }}>
        {text}
      </div>
    </div>
  );
}

export default function AiLab({ s }) {
  const reduced = reducedMotion();
  const n = s?.trades?.length || 0;
  const sample = useMemo(() => buildSample(s), [s]);

  /* Зорі — детермінований шум, щоб не миготіли по-новому на кожен
     рендер. Логіка з макета. */
  const stars = useMemo(() => {
    const rnd = (seed) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };
    const out = [];
    for (let i = 0; i < 70; i += 1) {
      out.push({
        top: (rnd(i * 3.1) * 100).toFixed(2),
        left: (rnd(i * 7.7 + 1) * 100).toFixed(2),
        size: 1 + Math.round(rnd(i * 5.3) * 1.6),
        mint: rnd(i * 2.9) > 0.62,
        dur: (3 + rnd(i) * 5).toFixed(1),
        delay: (rnd(i * 11) * 4).toFixed(1),
      });
    }
    return out;
  }, []);

  const stats = sample ? [
    { k: 'РЕЗУЛЬТАТ', v: `${signed(s.net)}R`, c: s.net >= 0 ? '#2ee6a8' : '#ff5f6d' },
    { k: 'ДИСЦИПЛІНА', v: String(s.adherence), suffix: '%', c: s.adherence >= 70 ? '#2ee6a8' : '#f0a63c' },
    { k: 'ВІНРЕЙТ', v: String(s.wr), suffix: '%', c: '#fff' },
    { k: 'ЦІНА ТІЛТУ', v: `${r1(s.tiltCost)}R`, c: '#ff5f6d' },
  ] : [];

  return (
    <div
      className="ln-root ln-ai-bleed"
      style={{
        position: 'relative', overflow: 'hidden',
        background: '#050508', color: '#e9e9f2', fontFamily: F.sans,
        padding: 'clamp(52px,7vw,96px) clamp(24px,4.5vw,56px) 96px',
      }}
    >
      <style>{KEYFRAMES + COACH_KF}</style>

      {/* ---------- атмосфера ---------- */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(rgba(255,255,255,.055) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(120% 80% at 50% 20%, #000 30%, transparent 85%)',
          WebkitMaskImage: 'radial-gradient(120% 80% at 50% 20%, #000 30%, transparent 85%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', top: -320, left: -180, width: 920, height: 920, borderRadius: '50%',
          pointerEvents: 'none', filter: 'blur(20px)',
          background: 'radial-gradient(circle, rgba(108,92,231,.28), rgba(108,92,231,0) 62%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', bottom: -380, right: -220, width: 980, height: 980, borderRadius: '50%',
          pointerEvents: 'none', filter: 'blur(24px)',
          background: 'radial-gradient(circle, rgba(46,230,168,.14), rgba(46,230,168,0) 62%)',
        }}
      />
      {stars.map((st, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'absolute', top: `${st.top}%`, left: `${st.left}%`,
            width: st.size, height: st.size, borderRadius: '50%', pointerEvents: 'none',
            background: st.mint ? '#2ee6a8' : '#8f7ff5',
            animation: reduced ? 'none' : `coachTwinkle ${st.dur}s ease-in-out ${st.delay}s infinite`,
          }}
        />
      ))}

      {/* Водяний знак «КОУЧ»: суцільно, але майже прозоро, з м'яким
          фіолетовим сяйвом і легким розмиттям. Повільно левітує —
          спливає, ледь хитається й дихає розміром, наче висить у
          повітрі за контентом. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 44, left: '50%', pointerEvents: 'none',
          whiteSpace: 'nowrap', lineHeight: 1,
          fontFamily: F.display, fontSize: 'clamp(140px,26vw,340px)', fontWeight: 800, letterSpacing: '-.05em',
          color: 'rgba(255,255,255,.022)',
          textShadow: '0 0 90px rgba(139,123,255,.05)',
          filter: 'blur(0.8px)',
          transform: 'translate(-50%,0)',
          animation: reduced ? 'none' : 'coachWordFloat 15s ease-in-out infinite, coachWordGlow 11s ease-in-out infinite',
        }}
      >
        КОУЧ
      </div>

      {/* ---------- контент ---------- */}
      <div style={{ position: 'relative', maxWidth: 1400, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26, flexWrap: 'wrap' }}>
          <div style={{ width: 34, height: 1, background: 'linear-gradient(90deg, transparent, #6c5ce7)' }} />
          <span style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#a99cf5' }}>
            Твій коуч
          </span>
          <span
            style={{
              position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center',
              padding: '6px 13px', borderRadius: 999, border: '1px solid rgba(46,230,168,.32)',
              background: 'rgba(46,230,168,.08)', fontFamily: F.mono, fontSize: 11,
              letterSpacing: '.2em', color: '#2ee6a8',
            }}
          >
            СКОРО
            <span
              aria-hidden
              style={{
                position: 'absolute', top: 0, bottom: 0, width: '40%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent)',
                animation: reduced ? 'none' : 'coachSweep 3.4s ease-in-out infinite',
              }}
            />
          </span>
        </div>

        <h2
          style={{
            margin: '0 0 24px', fontFamily: F.display, fontSize: 'clamp(32px,4.6vw,62px)',
            lineHeight: 1.03, fontWeight: 800, letterSpacing: '-.035em', color: '#fff',
            maxWidth: '16ch', textShadow: '0 0 60px rgba(108,92,231,.35)',
          }}
        >
          Кіт уже читає твій журнал.<br />
          <span style={{ color: '#2ee6a8', textShadow: '0 0 70px rgba(46,230,168,.4)' }}>
            Говорити ще вчиться.
          </span>
        </h2>

        <p style={{ margin: '0 0 64px', maxWidth: 620, fontFamily: F.sans, fontSize: 17, lineHeight: 1.65, color: '#8a8aa0' }}>
          Не чатбот, прикручений до дашборда. Поки модель не вміє сказати про твої
          угоди те, чого ти сам у них не бачиш, її тут не буде.
        </p>

        <div className="ln-ai-grid">

          {/* ---------- ліворуч: кіт, що літає, і статуси ---------- */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', padding: '18px 0 26px' }}>
              <div
                aria-hidden
                style={{
                  position: 'absolute', top: '50%', left: '50%', width: 300, height: 300,
                  margin: '-150px 0 0 -150px', borderRadius: '50%', filter: 'blur(30px)',
                  background: 'radial-gradient(circle, rgba(108,92,231,.42), rgba(108,92,231,.12) 45%, transparent 70%)',
                  animation: reduced ? 'none' : 'coachPulse 5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  position: 'relative', width: 216, height: 216, borderRadius: 58, padding: 1,
                  background: 'linear-gradient(150deg, rgba(108,92,231,.6), rgba(255,255,255,.06) 60%, rgba(108,92,231,.28))',
                  boxShadow: '0 40px 90px -30px rgba(108,92,231,.7)',
                  animation: reduced ? 'none' : 'coachFloat 9s ease-in-out infinite',
                }}
              >
                <div
                  style={{
                    width: '100%', height: '100%', borderRadius: 57, overflow: 'hidden',
                    background: 'radial-gradient(120% 100% at 50% 0%, #16182a, #08090f 70%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Cat size={188} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['ЖУРНАЛ ПРОЧИТАНО', '0s'], ['ЦИФРИ РАХУЮТЬСЯ', '.8s']].map(([label, delay]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 16,
                    border: '1px solid rgba(46,230,168,.22)',
                    background: 'linear-gradient(100deg, rgba(46,230,168,.09), rgba(46,230,168,.02))',
                  }}
                >
                  <span
                    style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#2ee6a8',
                      animation: reduced ? 'none' : `coachDot 2.4s ${delay} ease-in-out infinite`,
                    }}
                  />
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, letterSpacing: '.16em', color: '#d8fff0' }}>
                    {label}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '14px 18px', borderRadius: 16, border: '1px dashed rgba(255,255,255,.1)',
                  background: 'rgba(255,255,255,.015)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3a3a4a' }} />
                  <span style={{ fontFamily: F.mono, fontSize: 11.5, letterSpacing: '.16em', color: '#6b6b80' }}>
                    МОДЕЛЬ НАВЧАЄТЬСЯ
                  </span>
                </span>
                <LockSvg stroke="#4a4a5c" />
              </div>
            </div>
          </div>

          {/* ---------- праворуч: «так це виглядатиме» ---------- */}
          <div
            style={{
              position: 'relative', borderRadius: 30, padding: 1,
              background: 'linear-gradient(155deg, rgba(108,92,231,.55), rgba(255,255,255,.05) 42%, rgba(46,230,168,.35))',
              boxShadow: '0 60px 120px -50px rgba(0,0,0,.9)',
            }}
          >
            <div
              style={{
                borderRadius: 29, padding: '30px 32px 26px', backdropFilter: 'blur(20px)',
                background: 'linear-gradient(180deg, rgba(16,17,26,.96), rgba(8,9,13,.96))',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '.26em', color: '#5f5f75' }}>
                  ТАК ЦЕ ВИГЛЯДАТИМЕ
                </span>
                <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '.2em', color: '#5f5f75' }}>
                  {n} УГОД
                </span>
              </div>

              {sample ? (
                <>
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 2,
                      borderRadius: 20, overflow: 'hidden', background: 'rgba(255,255,255,.06)', marginBottom: 26,
                    }}
                  >
                    {stats.map(({ k, v, suffix, c }) => (
                      <div
                        key={k}
                        style={{ padding: '18px 20px', background: 'linear-gradient(180deg, rgba(24,25,36,.98), rgba(13,14,20,.98))' }}
                      >
                        <div style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: '.2em', color: '#5f5f75', marginBottom: 9 }}>
                          {k}
                        </div>
                        <div
                          style={{
                            fontFamily: F.mono, fontSize: 26, fontWeight: 700, color: c,
                            textShadow: c === '#2ee6a8' ? '0 0 30px rgba(46,230,168,.45)' : 'none',
                          }}
                        >
                          {v}
                          {suffix && <span style={{ fontSize: 16 }}>{suffix}</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
                    <div
                      style={{
                        flex: '0 0 auto', width: 42, height: 42, borderRadius: 14,
                        border: '1px solid rgba(46,230,168,.3)',
                        background: 'radial-gradient(120% 120% at 50% 0%, rgba(46,230,168,.18), rgba(10,11,16,1))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 30px -8px rgba(46,230,168,.5)',
                      }}
                    >
                      <Cat size={24} />
                    </div>
                    <div style={{ flex: '1 1 auto', maxWidth: 760, minWidth: 0 }}>
                      <CoachChat lines={sample} reduced={reduced} />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 26, paddingTop: 22,
                      borderTop: '1px solid rgba(255,255,255,.06)',
                    }}
                  >
                    <span style={{ flex: '0 0 auto', marginTop: 2 }}><LockSvg stroke="#5f5f75" /></span>
                    <p style={{ margin: 0, fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.6, color: '#6b6b80' }}>
                      Текст вище зібрала формула з твого журналу. Модель писатиме
                      інакше — і про те, що формулою не дістати: чому саме ці угоди
                      йдуть разом і що з цим робити завтра.
                    </p>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '44px 12px', maxWidth: 360, margin: '0 auto' }}>
                  <div style={{ fontFamily: F.display, fontSize: 19, fontWeight: 700, color: '#c4c4d4', marginBottom: 10 }}>
                    Читати поки нема чого
                  </div>
                  <p style={{ margin: 0, fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.6, color: '#6f6f82' }}>
                    Найкорисніше, що можна зробити до появи моделі, — вести журнал.
                    Без даних вона вигадує, а з двадцятьма угодами вже має що сказати.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- що готується ---------- */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 18, marginTop: 72 }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} text={f.text} i={i} reduced={reduced} />
          ))}
        </div>

        <p
          style={{
            margin: '66px auto 0', maxWidth: 640, textAlign: 'center', fontFamily: F.sans,
            fontSize: 13.5, lineHeight: 1.7, color: '#9c9cb2',
          }}
        >
          Усе, що показують інші розділи аналітики, порахували формули по твоїх
          угодах — нейромережі там немає жодної. Там, де написано «вердикт», це
          арифметика, а не думка.
        </p>

        <div style={{ marginTop: 34, textAlign: 'center', fontFamily: F.mono, fontSize: 11, letterSpacing: '.24em', color: '#6b6b80' }}>
          кіт · читає · рахує · ще мовчить
        </div>
      </div>
    </div>
  );
}
