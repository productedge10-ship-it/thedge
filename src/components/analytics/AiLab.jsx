import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Lock, MessageSquare, Radar, Sparkles } from 'lucide-react';
import { C, F, A, Cat, KEYFRAMES, reducedMotion } from '../landing/v3/base';
import { EMOTION_LABEL, r1, signed } from './data';

/* ==================================================================
   Розділ AI.

   Сюди зібрано все, що працюватиме на моделі. Причина розділення не
   технічна: у попередній версії чат-психолог стояв усередині
   «Психології», між справжніми графіками, і виглядав як така сама
   їхня частина. Людина не могла відрізнити число, порахане з її
   угод, від тексту, згенерованого моделлю, — а це різниця між «так
   є» і «так вважає програма».

   Оформлення взяте з лендінга (components/landing/v3/base): ті самі
   кольори, картки, підсвітки й той самий живий кіт. Людина, яка
   прийшла з головної, впізнає розділ, про який їй там обіцяли, — а
   не потрапляє на екран, зроблений іншими руками.

   Заглушка не порожня навмисно. «Скоро буде» саме по собі нічого не
   каже. Тут показано, як розбір виглядатиме, і зібрано його з
   реальних чисел журналу — з чесною позначкою, що це поки формула, а
   не модель.
================================================================== */

const PLANNED = [
  {
    icon: MessageSquare,
    title: 'Психолог журналу',
    text: 'Бачить усі угоди разом з емоціями, помилками й часом утримання. Відповідає цифрами з твого журналу, а не порадами з інтернету.',
  },
  {
    icon: CalendarDays,
    title: 'Розбір тижня',
    text: 'Щопонеділка коротко: що змінилось проти минулого тижня, де зʼявився новий витік, що прибрати найпершим.',
  },
  {
    icon: Radar,
    title: 'Рання ознака зриву',
    text: 'Помічає, що поведінка змінилась, раніше ніж це стане видно на кривій. Розмір позиції, темп входів, час доби.',
  },
  {
    icon: Sparkles,
    title: 'Питання до угоди',
    text: 'Відкрив угоду — спитав, чому вона пішла не так. Відповідь спирається на сусідні угоди, а не на загальні правила.',
  },
];

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
      `Твоя перевага живе в одному режимі: у стані «${EMOTION_LABEL[best.emotion]}» середня угода ${signed(best.avg, 2)}R, у стані «${EMOTION_LABEL[worst.emotion]}» — ${signed(worst.avg, 2)}R. Це не ринок, це стан входу.`
    );
  }
  if (leak) {
    lines.push(
      `Найдорожча звичка — «${leak.name}»: ${leak.count} разів, ${r1(leak.cost)}R збитку. Прибрати її дешевше, ніж шукати новий сетап.`
    );
  }
  if (Number.isFinite(s.avgAfterLoss) && Number.isFinite(s.avgAfterWin)) {
    lines.push(
      `Після збитку середній результат ${signed(s.avgAfterLoss, 2)}R проти ${signed(s.avgAfterWin, 2)}R після плюса.` +
      (s.avgAfterLoss < s.avgAfterWin
        ? ' Пауза на пів години після мінуса — найдешевший фікс у журналі.'
        : ' Відновлюєшся після мінуса добре — це сильна сторона.')
    );
  }
  if (bestSes) {
    lines.push(`Найкраще платить ${bestSes.session}: ${signed(bestSes.net)}R за ${bestSes.trades} угод.`);
  }

  return lines.length ? lines : null;
}

export default function AiLab({ s }) {
  const reduced = reducedMotion();
  const n = s?.trades?.length || 0;
  const sample = useMemo(() => buildSample(s), [s]);

  /* Друк по два символи за такт — так само, як у коуча на лендінгу.
     Посимвольно виглядає як зламаний термінал, а цілим блоком зникає
     сам ефект «він зараз думає». */
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  const full = sample ? sample[0] : '';

  useEffect(() => {
    if (!full || reduced) { setTyped(full); setDone(true); return undefined; }
    let i = 0;
    setTyped(''); setDone(false);
    timer.current = setInterval(() => {
      i += 2;
      if (i >= full.length) { clearInterval(timer.current); setTyped(full); setDone(true); }
      else setTyped(full.slice(0, i));
    }, 18);
    return () => clearInterval(timer.current);
  }, [full, reduced]);

  return (
    <div className="ln-root" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <style>{KEYFRAMES}</style>

      {/* ---------- шапка розділу ---------- */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ width: 26, height: 1, background: C.accDeep, display: 'block' }} />
        <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '2.2px', color: C.acc }}>
          ТВІЙ КОУЧ
        </span>
        <span
          style={{
            fontFamily: F.sans, fontSize: 10.5, fontWeight: 700, letterSpacing: '1.4px',
            color: C.accSoft, background: A(0.1), border: `1px solid ${A(0.26)}`,
            borderRadius: 999, padding: '4px 10px',
          }}
        >
          СКОРО
        </span>
      </div>

      <h2
        style={{
          fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(27px,3.2vw,42px)',
          letterSpacing: '-1.9px', lineHeight: 1.08, margin: '0 0 12px', color: '#fff',
        }}
      >
        Кіт уже читає твій журнал.<br />Говорити ще вчиться.
      </h2>

      <p style={{ fontFamily: F.sans, fontSize: 16.5, lineHeight: 1.5, color: '#8a8a9c', margin: '0 0 32px', maxWidth: 660 }}>
        Не чатбот, прикручений до дашборда. Поки модель не вміє сказати про твої
        угоди те, чого ти сам у них не бачиш, її тут не буде.
      </p>

      <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', alignItems: 'stretch' }}>

        {/* ---------- кіт ---------- */}
        <div
          style={{
            flex: '0 1 260px', minWidth: 200, position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 22,
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute', top: '8%', width: 270, height: 270, borderRadius: '50%',
              background: `radial-gradient(circle,${A(0.24)},transparent 68%)`, filter: 'blur(50px)',
              animation: reduced ? 'none' : 'lnBreathe 6s ease-in-out infinite',
            }}
          />

          {/* Той самий живий кіт, що в сайдбарі й на головній, — просто
              більший. Малювати для цієї сторінки окремого, схожого, але
              не того, було б помітно, навіть якщо не розумієш чому. */}
          <span style={{ position: 'relative' }}>
            <Cat size={190} />
          </span>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 260 }}>
            {[
              ['ЖУРНАЛ ПРОЧИТАНО', true],
              ['ЦИФРИ РАХУЮТЬСЯ', true],
              ['МОДЕЛЬ НАВЧАЄТЬСЯ', false],
            ].map(([label, on]) => (
              <div
                key={label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: on ? A(0.1) : 'rgba(255,255,255,.03)',
                  border: `1px solid ${on ? A(0.3) : 'rgba(255,255,255,.07)'}`,
                  borderRadius: 11, padding: '9px 12px',
                }}
              >
                <span
                  style={{
                    width: 6, height: 6, borderRadius: 999, flexShrink: 0,
                    background: on ? C.acc : 'rgba(255,255,255,.2)',
                    boxShadow: on ? `0 0 10px 1px ${A(0.9)}` : 'none',
                  }}
                />
                <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 700, letterSpacing: '.6px', color: on ? '#fff' : '#7d7d90' }}>
                  {label}
                </span>
                {!on && (
                  <Lock size={11} strokeWidth={2.4} style={{ marginLeft: 'auto', color: C.dim, flexShrink: 0 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ---------- приклад розбору ---------- */}
        <div
          style={{
            flex: '1 1 520px', minWidth: 320, position: 'relative', overflow: 'hidden',
            background: 'linear-gradient(160deg,#0e0e14,#0b0b10)',
            border: `1px solid ${C.line}`, borderRadius: 22, padding: 24,
            minHeight: 430, display: 'flex', flexDirection: 'column', gap: 14,
          }}
        >
          <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${A(0.5)},transparent)` }} />
          <span aria-hidden style={{ position: 'absolute', top: -70, left: -50, width: 280, height: 280, background: 'radial-gradient(circle,rgba(74,59,245,.13),transparent 70%)', filter: 'blur(60px)' }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.4px', color: C.text4 }}>
              ТАК ЦЕ ВИГЛЯДАТИМЕ
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '1.2px', color: C.dim }}>
              {n} УГОД
            </span>
          </div>

          {sample ? (
            <>
              {/* Зведення по журналу — те, з чого коуч робитиме висновок.
                  Без обставин порада виглядає як здогадка. */}
              <div
                style={{
                  position: 'relative', borderRadius: 14, padding: '13px 15px 12px',
                  background: 'rgba(255,255,255,.02)', border: `1px solid ${C.line}`,
                  display: 'flex', flexWrap: 'wrap', gap: 18,
                }}
              >
                {[
                  ['результат', `${signed(s.net)}R`, s.net >= 0 ? C.ok : C.bad],
                  ['дисципліна', `${s.adherence}%`, s.adherence >= 70 ? C.ok : C.warn],
                  ['вінрейт', `${s.wr}%`, C.text],
                  ['ціна тілту', `${r1(s.tiltCost)}R`, C.bad],
                ].map(([k, v, color]) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontFamily: F.sans, fontSize: 10.5, letterSpacing: '1.2px', textTransform: 'uppercase', color: C.text5 }}>{k}</span>
                    <span style={{ fontFamily: F.mono, fontSize: 15, fontWeight: 700, color }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Репліка коуча. Аватар — той самий кіт, що ліворуч:
                  говорить одна істота, а не дві схожі. */}
              <div style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <Cat size={34} />
                <div
                  style={{
                    background: A(0.08), border: `1px solid ${A(0.2)}`, borderRadius: 16,
                    borderTopLeftRadius: 5, padding: '13px 16px', fontFamily: F.sans,
                    fontSize: 14, lineHeight: 1.6, color: '#dcdce8', maxWidth: 460,
                  }}
                >
                  {typed}
                  {!done && <span style={{ animation: 'lnCaret 1s step-end infinite', color: C.accSoft }}>▍</span>}
                </div>
              </div>

              {/* Решта висновків — без друку: три бульбашки, що
                  друкуються одна за одною, перетворюють екран на
                  чекання. */}
              {done && sample.slice(1).map((line) => (
                <div
                  key={line}
                  style={{
                    position: 'relative', marginLeft: 46, animation: reduced ? 'none' : 'lnFadeUp .35s ease-out',
                    background: 'rgba(255,255,255,.025)', border: `1px solid ${C.lineSoft}`,
                    borderRadius: 14, padding: '11px 15px',
                    fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.6, color: C.text3, maxWidth: 460,
                  }}
                >
                  {line}
                </div>
              ))}

              {/* Найважливіший рядок картки. Без нього це виглядало б
                  як уже працюючий AI — тобто рівно та плутанина, через
                  яку розділ і винесли окремо. */}
              <div
                style={{
                  position: 'relative', marginTop: 'auto', paddingTop: 14,
                  borderTop: '1px solid rgba(255,255,255,.06)',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}
              >
                <Lock size={13} strokeWidth={2.2} style={{ color: C.dim, marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.55, color: C.text5 }}>
                  Текст вище зібрала формула з твого журналу. Модель писатиме
                  інакше — і про те, що формулою не дістати: чому саме ці угоди
                  йдуть разом і що з цим робити завтра.
                </span>
              </div>
            </>
          ) : (
            <div style={{ position: 'relative', margin: 'auto', textAlign: 'center', maxWidth: 340 }}>
              <span style={{ fontFamily: F.display, fontSize: 19, fontWeight: 700, color: C.text2, display: 'block', marginBottom: 10 }}>
                Читати поки нема чого
              </span>
              <p style={{ fontFamily: F.sans, fontSize: 13.5, lineHeight: 1.6, color: C.text4, margin: 0 }}>
                Найкорисніше, що можна зробити до появи моделі, — вести журнал.
                Без даних вона вигадує, а з двадцятьма угодами вже має що сказати.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------- що готується ---------- */}
      <div
        style={{
          marginTop: 36, display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        }}
      >
        {PLANNED.map((p, i) => (
          <article
            key={p.title}
            style={{
              position: 'relative', overflow: 'hidden', padding: 20,
              background: 'linear-gradient(160deg,#0e0e14,#0b0b10)',
              border: `1px solid ${C.line}`, borderRadius: 18,
              animation: reduced ? 'none' : `lnFadeUp .4s ease-out ${0.05 * i}s both`,
            }}
          >
            <span style={{ position: 'absolute', top: 0, left: 20, right: 20, height: 1, background: `linear-gradient(90deg,transparent,${A(0.32)},transparent)` }} />

            <span
              style={{
                display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10,
                background: A(0.1), border: `1px solid ${A(0.22)}`, marginBottom: 13,
              }}
            >
              <p.icon size={16} strokeWidth={2.1} style={{ color: C.acc }} />
            </span>

            <h3 style={{ fontFamily: F.sans, fontSize: 14.5, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>
              {p.title}
            </h3>
            <p style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.6, color: C.text4, margin: 0 }}>
              {p.text}
            </p>
          </article>
        ))}
      </div>

      {/* ---------- межа між арифметикою і думкою ----------

          Найважливіший абзац на сторінці. Слово «вердикт» в інших
          розділах могло читатись як «так вважає штучний інтелект»;
          насправді це формула. Сказати про це прямо коштує три
          рядки, а недомовленість коштувала б довіри до всіх чисел
          одразу. */}
      <p
        style={{
          margin: '28px auto 0', maxWidth: '62ch', textAlign: 'center',
          fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.7, color: C.text5,
        }}
      >
        Усе, що показують інші розділи аналітики, порахували формули по твоїх
        угодах — нейромережі там немає жодної. Там, де написано «вердикт», це
        арифметика, а не думка.
      </p>
    </div>
  );
}
