import { motion } from 'framer-motion';
import { Bot, CalendarDays, Clock, MessageSquare, Radar } from 'lucide-react';
import { T } from '../../lib/theme';

/* ==================================================================
   Розділ AI.

   Сюди зібрано все, що працюватиме на моделі. Причина розділення
   проста і не технічна: у попередній версії чат-психолог стояв
   усередині «Психології», між справжніми графіками, і виглядав як
   така сама їхня частина. Людина не могла відрізнити число,
   порахуване з її угод, від тексту, згенерованого моделлю, — а це
   різниця між «так є» і «так вважає програма».

   Тепер межа проходить по вкладці. Все, що ліворуч, — арифметика по
   журналу. Все, що тут, — думка моделі, і поки її немає, тут чесно
   написано, що її немає.

   Заглушка не порожня навмисно. «Скоро буде» без пояснення нічого не
   каже; список того, що саме готується, дає зрозуміти, чи варто
   цього чекати.
================================================================== */

const EASE = [0.22, 1, 0.36, 1];

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
    icon: Bot,
    title: 'Питання до угоди',
    text: 'Відкрив угоду — спитав, чому вона пішла не так. Відповідь спирається на сусідні угоди, а не на загальні правила.',
  },
];

export default function AiLab({ s }) {
  const n = s?.trades?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* ---------- герой ---------- */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative overflow-hidden rounded-[22px]"
        style={{
          background: `linear-gradient(180deg, ${T.surfaceHi}, ${T.surface})`,
          border: `1px solid ${T.line}`,
        }}
      >
        {/* Світло згори — статичне. Анімований градієнт за сплячим
            котом виглядав би як завантаження, а тут нічого не
            вантажиться. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
          style={{ background: `radial-gradient(600px 260px at 50% 0%, rgba(${T.accRgb},0.16), transparent 70%)` }}
        />

        <div className="relative flex flex-col items-center px-6 py-14 text-center sm:px-10 sm:py-16">
          <SleepingCat />

          <span
            className="mt-8 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em]"
            style={{
              color: T.acc,
              background: `rgba(${T.accRgb},0.10)`,
              border: `1px solid rgba(${T.accRgb},0.24)`,
            }}
          >
            <Clock size={12} strokeWidth={2.6} />
            скоро
          </span>

          <h2
            className="mt-5 text-[30px] font-bold leading-[1.15] sm:text-[38px]"
            style={{ fontFamily: T.display, color: T.text, letterSpacing: '-0.035em' }}
          >
            AI-розбір ще спить
          </h2>

          <p
            className="mt-4 max-w-[52ch] text-[14.5px] leading-[1.65]"
            style={{ fontFamily: T.sans, color: T.text3 }}
          >
            Ми не хочемо ставити сюди чат, який відповідає загальними словами.
            Поки модель не вміє сказати про твій журнал те, чого ти сам у ньому
            не бачиш, її тут не буде.
          </p>

          {/* Рядок про кількість угод — не прикраса. Модель без даних
              вигадує; тому перше, що має бути готове до її появи, —
              це журнал, а не сама модель. */}
          <p
            className="mt-6 text-[12.5px] leading-relaxed"
            style={{ fontFamily: T.sans, color: T.text4 }}
          >
            {n >= 50
              ? `У тебе вже ${n} угод — цього вистачить, щоб їй було що читати з першого дня.`
              : n > 0
                ? `У журналі ${n} ${plural(n)}. Найкорисніше, що можна зробити до її появи, — вести журнал далі: модель без даних вигадує.`
                : 'Найкорисніше, що можна зробити до її появи, — почати вести журнал: модель без даних вигадує.'}
          </p>
        </div>
      </motion.section>

      {/* ---------- що готується ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLANNED.map((p, i) => (
          <motion.article
            key={p.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.12 + i * 0.07, ease: EASE }}
            className="group relative overflow-hidden rounded-[16px] p-5"
            style={{ background: T.surface, border: `1px solid ${T.line}` }}
          >
            <div className="flex items-start gap-3.5">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]"
                style={{ background: `rgba(${T.accRgb},0.10)`, border: `1px solid rgba(${T.accRgb},0.22)` }}
              >
                <p.icon size={16} strokeWidth={2.1} style={{ color: T.acc }} />
              </span>

              <div className="min-w-0">
                <h3
                  className="text-[14.5px] font-bold leading-tight"
                  style={{ fontFamily: T.sans, color: T.text }}
                >
                  {p.title}
                </h3>
                <p
                  className="mt-2 text-[13px] leading-[1.6]"
                  style={{ fontFamily: T.sans, color: T.text3 }}
                >
                  {p.text}
                </p>
              </div>
            </div>
          </motion.article>
        ))}
      </div>

      {/* ---------- межа між арифметикою і думкою ----------

          Найважливіший абзац на сторінці. Слово «вердикт» в інших
          розділах могло читатись як «так вважає штучний інтелект»;
          насправді це формула. Сказати про це прямо коштує три
          рядки, а недомовленість коштувала б довіри до всіх чисел
          одразу. */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="mx-auto mt-5 max-w-[62ch] text-center text-[12.5px] leading-[1.7]"
        style={{ fontFamily: T.sans, color: T.text4 }}
      >
        Усе, що показують інші розділи аналітики, порахували формули по твоїх
        угодах — нейромережі там немає жодної. Там, де написано «вердикт», це
        арифметика, а не думка.
      </motion.p>
    </div>
  );
}

const plural = (n) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'угод';
  if (b > 1 && b < 5) return 'угоди';
  if (b === 1) return 'угода';
  return 'угод';
};

/* ==================================================================
   Сплячий кіт.

   Той самий маскот, що в бічній панелі: та сама сітка 34×34, та сама
   форма голови й вушок, ті самі градієнти. Інакше на сторінці
   зʼявився б другий кіт — схожий, але не той, і це помітно навіть
   якщо не розумієш чому.

   Відмінності рівно дві й обидві по суті: очі заплющені (він спить, а
   не дивиться на курсор) і груди піднімаються від дихання. Спить —
   бо ще не готовий, а не тому що зламався.
================================================================== */
function SleepingCat() {
  return (
    <div className="relative" style={{ width: 168, height: 168 }}>
      {/* Ореол-подушка під котом. Він саме під ним, а не навколо
          картки: так видно, що спить кіт, а не світиться блок. */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 190,
          height: 190,
          background: `radial-gradient(circle, rgba(${T.accRgb},0.20), transparent 65%)`,
          filter: 'blur(6px)',
        }}
      />

      {/* Zzz. Три літери, кожна зі своїм зсувом фази — інакше вони
          злітають строєм і виглядають як анімація завантаження. */}
      {[
        { x: 118, y: 34, size: 13, delay: 0 },
        { x: 132, y: 20, size: 17, delay: 1.1 },
        { x: 148, y: 4, size: 22, delay: 2.2 },
      ].map((z) => (
        <motion.span
          key={z.delay}
          aria-hidden
          className="absolute font-bold"
          style={{
            left: z.x,
            top: z.y,
            fontFamily: T.display,
            fontSize: z.size,
            color: T.acc,
          }}
          animate={{ opacity: [0, 0.85, 0.85, 0], y: [4, -6, -10, -16] }}
          transition={{ duration: 3.3, repeat: Infinity, delay: z.delay, ease: 'easeOut' }}
        >
          z
        </motion.span>
      ))}

      {/* Дихання. Дуже повільне і дуже дрібне: якщо помітно, що це
          анімація, кіт перестає спати й починає пульсувати. */}
      <motion.svg
        viewBox="0 0 34 34"
        width={168}
        height={168}
        className="relative"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.65))' }}
        animate={{ scale: [1, 1.022, 1], y: [0, 0.6, 0] }}
        transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <defs>
          <linearGradient id="aiHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A4E69" />
            <stop offset="50%" stopColor="#2A2D40" />
            <stop offset="100%" stopColor="#12131A" />
          </linearGradient>
          <linearGradient id="aiEarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C4B5FD" />
            <stop offset="100%" stopColor="#2A2D40" />
          </linearGradient>
        </defs>

        {/* Вушка. Уві сні трохи розведені в боки — так само, як у
            справжнього кота, коли він не слухає. */}
        <path
          d="M 7.5 13 C 5 8 5 4 7 3.5 C 9 3 12 7 14 9.5"
          fill="url(#aiEarGrad)"
          stroke="#C4B5FD"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="rotate(-9 10 12)"
        />
        <path
          d="M 26.5 13 C 29 8 29 4 27 3.5 C 25 3 22 7 20 9.5"
          fill="url(#aiEarGrad)"
          stroke="#C4B5FD"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="rotate(9 24 12)"
        />

        {/* Мордочка — рівно та сама крива, що в маскота */}
        <path
          d="M17 29C8 29 5 24 5 16C5 10 9 7 17 7C25 7 29 10 29 16C29 24 26 29 17 29Z"
          fill="url(#aiHeadGrad)"
          stroke={`rgba(${T.accRgb},0.55)`}
          strokeWidth="1.5"
        />

        {/* Заплющені очі — дуги донизу. Пряма риска читалась би як
            «примружився», дуга — як «спить». */}
        <path
          d="M7.6 17.2 C9.2 19.4 12.8 19.4 14.4 17.2"
          fill="none"
          stroke="#C9D4EA"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M19.6 17.2 C21.2 19.4 24.8 19.4 26.4 17.2"
          fill="none"
          stroke="#C9D4EA"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Рум'янець сплячого */}
        <ellipse cx="8.6" cy="21.4" rx="2.3" ry="1.2" fill="#FF9ECF" opacity="0.28" />
        <ellipse cx="25.4" cy="21.4" rx="2.3" ry="1.2" fill="#FF9ECF" opacity="0.28" />

        {/* Носик і рот */}
        <path d="M16.4 22.2 L17 23 L17.6 22.2 Z" fill="#FF8FB8" />
        <path
          d="M17 23.1 L17 23.9 M17 23.9 C16.2 25 15 24.6 14.7 23.8 M17 23.9 C17.8 25 19 24.6 19.3 23.8"
          fill="none"
          stroke="#D14E7E"
          strokeWidth="0.6"
          strokeLinecap="round"
        />

        {/* Вуса */}
        <path d="M2 18L6 19M2 21L6 20.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
        <path d="M32 18L28 19M32 21L28 20.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
      </motion.svg>
    </div>
  );
}
