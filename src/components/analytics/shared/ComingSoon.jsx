import { useId } from 'react';

/* ==================================================================
   Заглушка «скоро».

   Ставиться там, де висновок робить не арифметика, а модель: поки
   AI не підключений, місце не мусить бути ні порожнім, ні зайнятим
   вигаданим текстом. Тому тут не сірий прямокутник зі словом
   «незабаром», а маленький графік, який щоразу відмальовується
   заново — рівно той жест, заради якого людина взагалі відкриває
   аналітику.

   Три речі, які тримають це в межах преміального, а не «лоадер із
   бутстрапу»:

   1. Рух один. Стовпчики піднімаються, лінія малюється, точка йде
      по лінії — але все це одна хвиля зліва направо, а не три
      незалежні анімації.
   2. Пауза довша за рух. Цикл 4.2 секунди, з них малювання — менше
      половини. Решту часу графік просто стоїть намальований:
      безперервне миготіння в кутку сторінки втомлює вже на другій
      хвилині.
   3. Є статичний фолбек. За prefers-reduced-motion графік просто
      намальований до кінця, без жодного руху.

   Ідентифікатори градієнтів беруться з useId: заглушок на сторінці
   кілька, а однакові id усередині SVG злипаються — другий графік
   почав би тягнути градієнт першого.
================================================================== */

/* Крива еквіті, а не абстрактна хвиля: просадка на третьому кроці,
   вихід на нові максимуми в кінці. pathLength=1 дозволяє анімувати
   штрих незалежно від реальної довжини в пікселях. */
const LINE = 'M6 74 L38 66 L70 71 L102 52 L134 57 L166 38 L198 43 L230 22 L254 12';
const AREA = LINE + ' L254 88 L6 88 Z';
const BARS = [26, 34, 22, 46, 38, 58, 50, 72, 64, 84];

/* tone може прийти і чесним hex, і CSS-змінною (`var(--edge-acc,
   #8b7bff)`). До змінної не дописати альфу рядком: `var(...)1f` це
   невалідний колір, браузер мовчки викидає всю властивість і
   підсвітка йде на повну яскравість замість дванадцяти відсотків.
   Саме через це заглушка нейро-звіту світилась суцільним фіолетовим
   і з'їдала текст.

   color-mix розводить будь-який колір прозорістю, не розбираючи
   його на складові, тому працює однаково для обох випадків. */
const soft = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

export default function ComingSoon({
  tone = 'var(--edge-acc, #8b7bff)',
  eyebrow = 'Скоро',
  title,
  text,
  compact = false,
  /* chart=false прибирає графік і зі сну — виняток для контексту,
     де він взагалі не потрібен. */
  chart = true,
}) {
  const uid = useId().replace(/:/g, '');
  const gLine = 'cs-line-' + uid;
  const gArea = 'cs-area-' + uid;
  const cls = 'cs-' + uid;

  return (
    <div
      className={cls}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 14,
        border: '1px solid var(--edge-hair, #232328)',
        background: 'linear-gradient(165deg, rgba(255,255,255,.028), rgba(255,255,255,.008))',
        padding: compact ? '14px 16px 12px' : '13px 18px 10px',
      }}
    >
      <style>{`
        .${cls} .cs-bar{ transform-origin: bottom; animation: ${cls}-bar 4.2s cubic-bezier(.22,1,.36,1) infinite; }
        .${cls} .cs-line{ stroke-dasharray: 1; stroke-dashoffset: 1; animation: ${cls}-draw 4.2s cubic-bezier(.4,0,.2,1) infinite; }
        .${cls} .cs-fill{ opacity: 0; animation: ${cls}-fill 4.2s ease-out infinite; }
        .${cls} .cs-dot{ offset-path: path('${LINE}'); offset-rotate: 0deg; opacity: 0; animation: ${cls}-dot 4.2s cubic-bezier(.4,0,.2,1) infinite; }

        @keyframes ${cls}-bar{
          0%,4%   { transform: scaleY(.06); opacity: .25 }
          46%,86% { transform: scaleY(1);   opacity: 1 }
          100%    { transform: scaleY(.06); opacity: .25 }
        }
        @keyframes ${cls}-draw{
          0%,4%   { stroke-dashoffset: 1 }
          46%,86% { stroke-dashoffset: 0 }
          100%    { stroke-dashoffset: 1 }
        }
        @keyframes ${cls}-fill{
          0%,10%  { opacity: 0 }
          52%,86% { opacity: 1 }
          100%    { opacity: 0 }
        }
        @keyframes ${cls}-dot{
          0%,4%    { offset-distance: 0%;   opacity: 0 }
          10%      { opacity: 1 }
          46%,86%  { offset-distance: 100%; opacity: 1 }
          94%,100% { offset-distance: 100%; opacity: 0 }
        }

        /* Статичний фолбек: графік намальований, нічого не рухається. */
        @media (prefers-reduced-motion: reduce){
          .${cls} .cs-bar,
          .${cls} .cs-line,
          .${cls} .cs-fill,
          .${cls} .cs-dot{ animation: none }
          .${cls} .cs-bar{ transform: scaleY(1); opacity: 1 }
          .${cls} .cs-line{ stroke-dashoffset: 0 }
          .${cls} .cs-fill{ opacity: 1 }
          .${cls} .cs-dot{ offset-distance: 100%; opacity: 1 }
        }
      `}</style>

      {/* Світло за графіком — те саме, що по всьому продукту: не
          обводка, а підсвітка знизу під кривою. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(420px circle at 22% 118%, ${soft(tone, 12)}, transparent 70%)`,
        }}
      />

      {/* Графік — фон, не сусід тексту в рядку.

          Три спроби поспіль ділити ширину картки між графіком і
          текстом провалились однаково: десь ширини вистачало, десь
          ні, і те, що працювало на одному екрані, обрізало текст на
          іншому. Тут той самий прийом, що вже стоїть на KPI-картках
          «Огляду» (Spark): графік лежить під текстом абсолютом, поза
          потоком, тож він фізично не може забрати в тексту жодного
          пікселя ширини чи висоти — рядків завжди стільки, скільки
          треба самому тексту, за будь-якої ширини колонки.

          Маска зліва направо ховає графік там, де починається текст,
          і показує там, де картка зазвичай порожня (праворуч) —
          лінія й так яскравішає до кінця (градієнт нижче), тож фейд
          підсилює те, що графік уже сам малює. */}
      {chart && (
        <svg
          aria-hidden
          viewBox="0 0 260 92"
          preserveAspectRatio="none"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', opacity: compact ? 0.5 : 0.65,
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, transparent 30%, #000 62%)',
            maskImage: 'linear-gradient(90deg, transparent 0%, transparent 30%, #000 62%)',
          }}
        >
          <defs>
            <linearGradient id={gLine} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={tone} stopOpacity="0.35" />
              <stop offset="100%" stopColor={tone} stopOpacity="1" />
            </linearGradient>
            <linearGradient id={gArea} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity="0.28" />
              <stop offset="100%" stopColor={tone} stopOpacity="0" />
            </linearGradient>
          </defs>

          {BARS.map((h, i) => (
            <rect
              key={i}
              className="cs-bar"
              x={6 + i * 25.4}
              y={88 - h}
              width="7"
              height={h}
              rx="2"
              fill={tone}
              opacity="0.16"
              style={{ animationDelay: `${i * 55}ms` }}
            />
          ))}

          <path className="cs-fill" d={AREA} fill={`url(#${gArea})`} />
          <path
            className="cs-line"
            d={LINE}
            pathLength="1"
            fill="none"
            stroke={`url(#${gLine})`}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle className="cs-dot" r="3.4" fill="#fff" stroke={tone} strokeWidth="2.2" />
        </svg>
      )}

      <div style={{ position: 'relative' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            fontSize: 9.5, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: tone,
          }}
        >
          <i style={{ width: 5, height: 5, borderRadius: 99, background: tone, boxShadow: `0 0 8px ${soft(tone, 70)}`, display: 'block' }} />
          {eyebrow}
        </span>

        {title && (
          <b style={{ display: 'block', marginTop: 4, fontSize: compact ? 13.5 : 15, fontWeight: 800, color: 'var(--edge-text, #FAFAFA)', letterSpacing: '-0.1px' }}>
            {title}
          </b>
        )}

        {/* text2, не text3: найтьмяніший відтінок тримав опис ледь
           видимим на темній підкладці картки — саме на нього
           скаржились, не на розмір чи перенос. */}
        {text && (
          <p style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.4, color: 'var(--edge-text2, #B4B4BD)' }}>
            {text}
          </p>
        )}
      </div>
    </div>
  );
}
