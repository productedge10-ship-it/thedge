import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, Target, Activity, BarChart2, ShieldAlert, BrainCircuit,
  LayoutGrid, History, Database, FileText, Wallet, MessageCircle,
  Bot, Zap, RefreshCw, Gauge, LineChart, Layers, Flame,
  CalendarClock, Send, Compass, Sparkles
} from 'lucide-react';

import useTerminalSkin from '../hooks/useTerminalSkin';
import { openTour } from '../lib/tour';

/* ------------------------------------------------------------------ */
/*  THE EDGE — theme tokens (same as Auth page)                        */
/* ------------------------------------------------------------------ */
const ACCENT_HEX = 'var(--edge-acc, #8b7bff)';
const ACCENT = '139,123,255';

function useEdgeFonts() {
  useEffect(() => {
    if (document.getElementById('edge-auth-fonts')) return;
    const l1 = document.createElement('link');
    l1.rel = 'preconnect';
    l1.href = 'https://fonts.googleapis.com';
    const l2 = document.createElement('link');
    l2.rel = 'preconnect';
    l2.href = 'https://fonts.gstatic.com';
    l2.crossOrigin = 'anonymous';
    const l3 = document.createElement('link');
    l3.id = 'edge-auth-fonts';
    l3.rel = 'stylesheet';
    l3.href =
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap';
    document.head.append(l1, l2, l3);
  }, []);
}

function EdgeLogo({ large = false }) {
  return (
    <div
      className={`select-none font-extrabold whitespace-nowrap ${
        large ? 'text-[24px] tracking-[9px]' : 'text-[15px] tracking-[5px]'
      }`}
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        backgroundImage: `linear-gradient(135deg, #fff 10%, ${ACCENT_HEX} 120%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        filter: `drop-shadow(0 0 22px rgba(${ACCENT},0.4))`,
      }}
    >
      THE&nbsp;EDGE
    </div>
  );
}

/* ---------- small shared atoms ---------- */

function SectionTitle({ eyebrow, title, sub }) {
  return (
    <div className="mb-8">
      <div
        className="text-[10.5px] uppercase mb-3 font-bold"
        style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3, color: ACCENT_HEX }}
      >
        {eyebrow}
      </div>
      <h2
        className="text-[26px] md:text-[30px] font-bold text-[var(--edge-text)] leading-tight"
        style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.3px' }}
      >
        {title}
      </h2>
      {sub && <p className="text-[14px] text-[var(--edge-text)]/50 mt-2 max-w-[640px] leading-relaxed">{sub}</p>}
    </div>
  );
}

function GlassCard({ children, className = '', glow = false, ...rest }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className={`group relative rounded-[20px] border border-[var(--edge-hair)] overflow-hidden transition-colors duration-300 hover:border-[rgba(139,123,255,0.35)] ${className}`}
      style={{ background: 'linear-gradient(180deg, rgba(25,28,36,0.75), rgba(13,15,20,0.85))' }}
      {...rest}
    >
      {glow && (
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(circle, rgba(${ACCENT},0.16), transparent 65%)`, filter: 'blur(30px)' }}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

/* ================================================================== */

export default function FAQ() {
  const navigate = useNavigate();

  /* Палітра з термінала — на цій сторінці й у світлій темі */
  useTerminalSkin();

  useEdgeFonts();

  // Стейт для активного розділу плаваючого меню
  const [activeSection, setActiveSection] = useState('overview');

  // Відстеження скролу для оновлення активного пункту меню
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['overview', 'analytics', 'contact', 'modules'];
      let current = 'overview';

      for (const id of sections) {
        const element = document.getElementById(id);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 250) {
            current = id;
          }
        }
      }
      setActiveSection(current);
    };

    // Параметр true (useCapture) дозволяє перехоплювати скрол навіть якщо скролиться вкладений div, а не все вікно
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const scrollTo = (id) => {
    const element = document.getElementById(id);
    if (element) {
      // scrollIntoView працює надійніше в незалежних скрол-контейнерах
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* ------------------ ANALYTICS PAGE GUIDE DATA ------------------ */
  const analyticsTabs = [
    {
      icon: Gauge,
      color: 'var(--edge-acc, #8b7bff)', rgb: '139,123,255',
      title: 'Огляд',
      desc: 'Перший екран, який відповідає на головне питання: «Як у мене справи?» — одним реченням і чотирма цифрами.',
      points: [
        'Розумний підсумок людською мовою: «Ти +17.3R за 47 угод. Ср — твій найкращий день, а спокій — твій найкращий стан».',
        'KPI-картки з міні-графіками: Чистий R, Вінрейт, Профіт-фактор і Ціна тільта — скільки R з\'їли емоції.',
        'Крива еквіті з максимальною просадкою та блок «Звідки береться R» — топ-фактори твого прибутку: сесія, актив, день, сетап.',
        '«План дотримано vs Порушено», «Емоційний стан vs Результат» та «Найдорожчі звички» — три блоки, які показують, де саме тече твій результат.',
      ],
    },
    {
      icon: LineChart,
      color: 'var(--edge-info)', rgb: '79,139,255',
      title: 'Перформанс',
      desc: 'Чиста математика твоєї системи. Тут видно не «пощастило / не пощастило», а справжнє очікування на кожну угоду.',
      points: [
        'Очікування (+R на угоду), середній плюс і мінус, серії перемог та поразок, фактор відновлення.',
        'Середній R по днях тижня та чистий R по сесіях (Asia / London / New York) — коли ти реально заробляєш.',
        'Розподіл R-множників: хвіст справа — це те, за що ти платиш усіма мінусами.',
        'Underwater-крива просадки, R по годинах входу та scatter «час утримання vs результат» — кожна точка це угода.',
      ],
    },
    {
      icon: BrainCircuit,
      color: '#c084fc', rgb: '192,132,252',
      title: 'Психологія',
      desc: 'Найпотужніша вкладка. Модель зчитує всі твої угоди і збирає психологічний зліпок — з цифрами, а не відчуттями.',
      points: [
        'Нейропрофіль: нейро-індекс /100, твій тип трейдера та п\'ять шкал — Фокус, Контроль, Відновлення, Дисципліна, Ризик.',
        'Вердикт по дисципліні: «Зараз +17.3R → Потенціал без витоків +37.6R». Дисципліна має конкретну ціну в R.',
        '«Куди течуть гроші»: помилки виконання, вхід одразу після збитку, імпульсивні стани, надлишковий ризик — з сумою по кожному.',
        'Ланцюг тільта (як падає очікування після 1/2/3 збитків), емоційний радар і рейтинг «Стан входу → гроші»: спокій дає +1.67R, тільт — −0.23R.',
        'Чек-лист перед входом: не галочки, а факт — як часто ти реально дотримувався кожного правила, і скільки коштувало кожне порушення.',
      ],
    },
    {
      icon: Layers,
      color: '#00e0a4', rgb: '0,224,164',
      title: 'Активи та Сетапи',
      desc: 'Де твій edge живе, а де вмирає. Система прямо каже, що торгувати, а від чого тимчасово відійти.',
      points: [
        'Ефективність активів з вердиктом системи: «Найкраще зараз GER40, EURUSD, US100. Від GBPUSD, USDJPY краще відійти».',
        'Матриця напрямків Long / Short: баланс PnL і вінрейт по кожному боці для кожного активу — асиметрія важливіша за загальний вінрейт.',
        'Ефективність сетапів: Trendline break +11.4R проти FVG fill −3.4R — рейтинг твоїх патернів з WR і середнім R.',
        'Теплова матриця «Актив × Сесія»: зелені клітини — твої золоті комбінації, червоні — сліпі зони.',
        'Статистика по кожному проп-акаунту: вінрейт, кількість угод, помилки.',
      ],
    },
    {
      icon: CalendarClock,
      color: 'var(--edge-warn)', rgb: '245,158,11',
      title: 'Історія угод',
      desc: 'Повний реєстр усього, що ти наторгував — з фільтрами по акаунтах і періодах.',
      points: [
        'Перемикання між акаунтами (FTMO, Funding Pips, MFF) та періодами: весь час, квартал, 30 днів, тиждень.',
        'Кожна угода тягне за собою контекст: емоцію, помилки, сесію, сетап — усе, що потім живить аналітику.',
        'Експорт звіту одним кліком.',
      ],
    },
  ];

  /* ---------------------- MODULE DOCUMENTATION ---------------------- */
  const documentation = [
    {
      category: 'Routine (Щоденна рутина)',
      icon: <History size={16} className="text-[var(--edge-text)]/40" />,
      items: [
        {
          title: 'Trading Plan',
          icon: <Target size={22} />,
          color: 'var(--edge-info)', rgb: '79,139,255',
          desc: 'Головний робочий простір трейдера на кожен день. Створюйте торгову ідею перед сесією, логуйте угоди в процесі та підводьте підсумки.',
          features: [
            { title: 'Pre-Session Quiz', desc: "Обов'язковий чеклист стану перед торгами. З'являється лише для нових планів на поточний день." },
            { title: 'AI Logic Critic', desc: "Штучний інтелект аналізує ваш текст плану на наявність логічних дір та відсутності 'Plan B'." },
            { title: 'Post-Session & Psychology', desc: "Порівняння 'Planned Bias' з 'Actual'. Оцінка виконання (1-5) та Журнал Психології (оцінка тильту, страху, впевненості)." },
          ],
        },
        {
          title: '20 Trades Method',
          icon: <Activity size={22} />,
          color: '#00e0a4', rgb: '0,224,164',
          desc: 'Тренажер дисципліни за Марком Дугласом. Відв\'язує емоції від результату та вчить мислити ймовірностями.',
          features: [
            { title: 'Фокус на Процесі', desc: 'Тут немає результатів Win/Loss. Тільки фіксація дотримання правил: Стратегія, Ризик, План, Виконання.' },
            { title: 'Discipline Score', desc: 'Система автоматично вираховує відсоток ідеальних угод, де були дотримані всі правила без винятку.' },
            { title: 'Візуальна Сітка', desc: 'Наочний прогрес серії з 20 угод у вигляді єдиної таблиці для вироблення довгострокового мислення.' },
          ],
        },
        {
          title: 'Trading Journal',
          icon: <BookOpen size={22} />,
          color: 'var(--edge-ok)', rgb: '52,211,153',
          desc: 'Журнал усіх ваших угод. Централізована таблиця для швидкого перегляду результатів та дисципліни.',
          features: [
            { title: 'Швидкі KPI', desc: 'Миттєва статистика зверху: загальний RR, вінрейт, відсоток угод за планом та відсоток допущених помилок.' },
            { title: 'Кастомний Календар', desc: "Фільтруйте угоди за будь-який період зручним календарем з кнопками 'Сьогодні', 'Цей тиждень', 'Останні 3 місяці'." },
            { title: 'Спліт-модалка деталей', desc: 'Клікніть на угоду, і відкриється подвійний екран: зліва — деталі самої угоди (фото, помилки), справа — повний TDA аналіз плану того дня.' },
          ],
        },
        {
          title: 'Analyses Log',
          icon: <FileText size={22} />,
          color: '#818cf8', rgb: '129,140,248',
          desc: 'База даних усіх ваших створених щоденних планів. Бібліотека вашого торгового досвіду.',
          features: [
            { title: 'Розумний пошук', desc: 'Шукайте плани за текстом, активами або за допомогою зручного календаря.' },
            { title: 'List / Grid View', desc: 'Перемикайтесь між детальним списком та компактною плиткою з кольоровою індикацією Bias.' },
          ],
        },
        {
          title: 'Periodic Reviews',
          icon: <BrainCircuit size={22} />,
          color: '#c084fc', rgb: '192,132,252',
          desc: 'Інструмент для глибокої роботи над собою. Аналізуйте тижні чи місяці за допомогою AI.',
          features: [
            { title: 'Спліт-екран', desc: 'Зліва — всі ваші плани, помилки та угоди за вибраний період. Справа — текстовий редактор для звіту.' },
            { title: 'Масовий AI Аналіз', desc: 'Виберіть до 7 проблемних днів, і ШІ знайде психологічні патерни, сильні сторони та згенерує правила на наступний тиждень.' },
          ],
        },
        {
          title: 'Trading System (Playbook)',
          icon: <BookOpen size={22} />,
          color: '#fb923c', rgb: '251,146,60',
          desc: 'Ваша особиста Вікіпедія. Конституція вашої торгівлі, детальний опис сетапів та правил риск-менеджменту.',
          features: [
            { title: 'Папки та Drag & Drop', desc: 'Створюйте необмежену вкладеність папок та перетягуйте сторінки між ними для ідеальної структури.' },
            { title: 'Rich Text & Tiptap', desc: 'Повноцінний текстовий редактор з підтримкою заголовків, списків та палітри кольорів у стилі TradingView.' },
            { title: 'AI Рефакторинг', desc: "Натисніть магічну кнопку, і ШІ автоматично відформатує ваші 'сирі' думки у структурований текст, зберігши всі трейдерські терміни." },
          ],
        },
        {
          title: 'Notes / Dashboard',
          icon: <LayoutGrid size={22} />,
          color: 'var(--edge-warn)', rgb: '251,191,36',
          desc: 'Швидкі нотатки. Зберігайте сюди короткі спостереження, бектести або цікаві сетапи з ринку.',
          features: [
            { title: 'Система Тегів', desc: 'Створюйте власні теги і миттєво фільтруйте нотатки кліком по тегу прямо на картці.' },
            { title: 'Авто-стиснення фото', desc: 'Вставляйте графіки через Ctrl+V — система автоматично стисне їх у формат WebP для швидкої роботи.' },
          ],
        },
      ],
    },
    {
      category: 'Data (Статистика та Метрики)',
      icon: <Database size={16} className="text-[var(--edge-text)]/40" />,
      items: [
        {
          title: 'Prop Accounts',
          icon: <Wallet size={22} />,
          color: 'var(--edge-warn)', rgb: '245,158,11',
          desc: 'Управління вашими торговими рахунками (FTMO, Funding Pips тощо).',
          features: [
            { title: 'Трекінг балансу', desc: 'Додавайте рахунки та слідкуйте за загальним капіталом в управлінні.' },
            { title: "Прив'язка угод", desc: 'Рахунки з цієї бази використовуються при додаванні угод в Trading Plan.' },
          ],
        },
        {
          title: 'Error Log',
          icon: <ShieldAlert size={22} />,
          color: 'var(--edge-bad)', rgb: '248,113,113',
          desc: "Ваша 'Галерея болю'. Ізольований простір для перегляду та аналізу виключно збиткових та помилкових рішень.",
          features: [
            { title: 'Ізоляція помилок', desc: "Усі угоди, позначені як 'Помилка', автоматично потрапляють сюди разом зі скріншотами." },
            { title: 'Редагування психології', desc: 'Детально описуйте причини тильту та змінюйте статуси FOMO/Followed Plan постфактум.' },
          ],
        },
        {
          title: 'Analytics',
          icon: <BarChart2 size={22} />,
          color: 'var(--edge-acc, #8b7bff)', rgb: '139,123,255',
          desc: 'Математика вашої торгової системи. Детальні дашборди для пошуку вашої торгової переваги (Edge). Повний гайд — у секції вище.',
          features: [
            { title: 'Cost of Tilt', desc: "Найважливіша метрика. Показує, скільки 'R' (прибутку) ви втратили через порушення правил та емоції." },
            { title: 'BE та Missed', desc: "Угоди зі статусом 'Break Even' та 'Missed' враховуються у лічильниках, але НЕ псують вашу фінансову криву RR." },
            { title: 'Детальні зрізи', desc: 'Аналіз прибутковості по днях тижня, торгових сесіях (London/NY) та напрямку (Long/Short).' },
          ],
        },
      ],
    },
  ];

  /* ------------------ FLOATING NAV MENU ------------------ */
  const navItems = [
    { id: 'overview', label: 'Огляд', icon: <Compass size={14} /> },
    { id: 'analytics', label: 'Аналітика', icon: <BarChart2 size={14} /> },
    { id: 'contact', label: 'Підтримка', icon: <MessageCircle size={14} /> },
    { id: 'modules', label: 'Модулі', icon: <Layers size={14} /> },
  ];

  return (
    <div
      className="min-h-screen text-[var(--edge-text)] p-6 md:p-10 flex flex-col relative"
      style={{ fontFamily: "'Manrope', sans-serif", backgroundColor: '#060709' }}
    >
      {/* ================= BACKGROUND: BOOK LIGHT METAPHOR ================= */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Головне м'яке світло зверху (світло лампи) */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[100vw] max-w-[1200px] h-[700px]"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, rgba(139, 123, 255, 0.12) 0%, transparent 70%)`,
            filter: 'blur(60px)',
          }}
        />
        {/* Текстура паперу/сітки для кращої читабельності та преміальності */}
        <div
          className="absolute inset-0 opacity-[0.2]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,1) 1px, transparent 0)',
            backgroundSize: '32px 32px',
            maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)',
          }}
        />
      </div>

      <div className="w-full max-w-[1200px] mx-auto pb-32 pt-4 relative z-10">

        {/* ================= FLOATING STICKY DOCK ================= */}
        <div className="sticky top-4 z-50 flex justify-center w-full pointer-events-none mb-12">
          <div className="pointer-events-auto flex items-center p-1.5 bg-[#0a0c10]/80 backdrop-blur-xl border border-[var(--edge-hair-strong)] rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-bold transition-colors duration-300 z-10
                    ${isActive ? 'text-[var(--edge-text)]' : 'text-[#6f7f93] hover:text-[#e4ebf4]'}
                  `}
                >
                  {isActive && (
                    <motion.div
                      layoutId="navPill"
                      className="absolute inset-0 bg-white/10 rounded-full border border-[var(--edge-hair)]"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {item.icon} {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ============================ 1. OVERVIEW ============================ */}
        <div id="overview" className="scroll-mt-32">
          <motion.div {...rise(0)} className="mb-14">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
              <EdgeLogo large />
            </div>
            <h1
              className="text-[34px] md:text-[44px] font-bold text-[var(--edge-text)] leading-[1.1] max-w-[760px]"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.6px' }}
            >
              Журнал, який не просто зберігає угоди —{' '}
              <span
                style={{
                  backgroundImage: `linear-gradient(120deg, ${ACCENT_HEX}, #c4b5fd)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                він розбирає тебе
              </span>.
            </h1>
            <p className="text-[15px] text-[var(--edge-text)]/55 mt-4 max-w-[640px] leading-relaxed">
              The Edge читає кожну твою угоду, бачить тильт, revenge-входи та FOMO — і чесно, але
              по-доброму каже, що саме ти робиш не так. Нижче — все, що вміє система, і як цим
              користуватись.
            </p>

            {/* Тур звідси, а не з окремого розділу: сюди приходять
                саме тоді, коли щось незрозуміло. */}
            <button
              onClick={() => { navigate('/app'); setTimeout(openTour, 260); }}
              className="group mt-6 inline-flex h-11 items-center gap-2.5 rounded-xl px-5 text-[14px] font-bold transition-transform active:scale-[0.99]"
              style={{
                background: `rgba(${ACCENT},0.10)`,
                border: `1px solid rgba(${ACCENT},0.28)`,
                color: ACCENT_HEX,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${ACCENT},0.16)`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = `rgba(${ACCENT},0.10)`)}
            >
              <Sparkles size={15} strokeWidth={2.4} className="transition-transform duration-300 group-hover:scale-110" />
              Пройти знайомство — хвилина
            </button>
          </motion.div>

          <motion.div {...rise(0.05)} className="mb-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <GlassCard glow className="p-7 md:col-span-2">
                <div className="flex flex-col lg:flex-row gap-8">
                  <div className="flex-1 min-w-0">
                    <div
                      className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-5"
                      style={{ background: `rgba(${ACCENT},0.14)`, border: `1px solid rgba(${ACCENT},0.3)`, color: ACCENT_HEX }}
                    >
                      <Bot size={22} strokeWidth={1.8} />
                    </div>
                    <h3 className="text-[20px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      AI-психолог трейдера
                    </h3>
                    <p className="text-[14px] text-[var(--edge-text)]/55 leading-relaxed mb-4">
                      Він питає, як ти хочеш торгувати — а потім дивиться, чи ти реально так торгуєш.
                      Читає угоди, ловить тильт, revenge-входи та FOMO, і відповідає цифрами з твого
                      журналу, а не загальними словами.
                    </p>
                    <p className="text-[14px] text-[var(--edge-text)]/55 leading-relaxed">
                      Аналізує твої дії, твою торгову систему, плани та угоди — і дає вердикт: що
                      працює, що зливає R, і яке правило поставити наступним.
                    </p>
                  </div>

                  <div className="flex-1 min-w-0 lg:max-w-[420px]">
                    <div
                      className="rounded-[16px] border border-[var(--edge-hair)] p-4 flex flex-col gap-3"
                      style={{ background: 'rgba(8,9,11,0.6)' }}
                    >
                      <div
                        className="flex items-center gap-2 text-[9.5px] uppercase text-[var(--edge-text)]/40 pb-2 border-b border-[var(--edge-hair)]"
                        style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 }}
                      >
                        <span
                          className="w-[6px] h-[6px] rounded-full"
                          style={{ background: '#00e0a4', boxShadow: '0 0 8px rgba(0,224,164,0.8)' }}
                        />
                        AI-психолог · на зв'язку
                      </div>
                      <div
                        className="rounded-[12px] p-3.5 text-[12.5px] leading-relaxed text-[var(--edge-text)]/85"
                        style={{ background: `rgba(${ACCENT},0.10)`, border: `1px solid rgba(${ACCENT},0.22)` }}
                      >
                        <span style={{ color: ACCENT_HEX }}>✦</span> Ти відкрив 3 угоди за 8 хвилин після
                        того збитку по GBP. Це твій патерн revenge-трейду — вінрейт у таких входах{' '}
                        <span className="text-[#ff8080] font-semibold">22%</span>.
                      </div>
                      <div
                        className="rounded-[12px] p-3.5 text-[12.5px] leading-relaxed text-[var(--edge-text)]/70 self-end max-w-[85%]"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        Постав мені лок-аут на 30 хв після будь-якого збитку.
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--edge-text)]/35">
                        <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                        правило додано в чек-лист перед входом
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              <GlassCard glow className="p-7">
                <div
                  className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-5"
                  style={{ background: 'rgba(0,224,164,0.12)', border: '1px solid rgba(0,224,164,0.3)', color: '#00e0a4' }}
                >
                  <Zap size={22} strokeWidth={1.8} />
                </div>
                <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Авто-імпорт з MT5
                </h3>
                <p className="text-[13.5px] text-[var(--edge-text)]/55 leading-relaxed mb-5">
                  Підключаєш один раз — і кожен філ, SL, TP та частковий вихід лягає в журнал у
                  реальному часі. Без CSV, без копіпасту.
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { sym: 'XAU/USD · Long', r: '+2.0R', up: true },
                    { sym: 'GER40 · Short', r: '−0.5R', up: false },
                    { sym: 'EUR/USD · Long', r: '+1.2R', up: true },
                  ].map((t) => (
                    <div
                      key={t.sym}
                      className="flex items-center justify-between rounded-[10px] px-3.5 py-2.5 text-[12.5px] border border-[var(--edge-hair)] transition-colors hover:border-white/[0.14]"
                      style={{ background: 'rgba(8,9,11,0.55)', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      <span className="text-[var(--edge-text)]/70">{t.sym}</span>
                      <span style={{ color: t.up ? '#00e0a4' : '#ff6363' }}>{t.r}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-[10.5px] text-[var(--edge-text)]/35 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#00e0a4', boxShadow: '0 0 8px rgba(0,224,164,0.8)' }} />
                    LIVE · синхронізовано з MT5
                  </div>
                </div>
              </GlassCard>

              <GlassCard glow className="p-7">
                <div
                  className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-5"
                  style={{ background: 'rgba(139,123,255,0.12)', border: '1px solid rgba(139,123,255,0.3)', color: 'var(--edge-acc, #8b7bff)' }}
                >
                  <Layers size={22} strokeWidth={1.8} />
                </div>
                <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Абсолютна AI-екосистема
                </h3>
                <p className="text-[13.5px] text-[var(--edge-text)]/55 leading-relaxed mb-5">
                  Це не просто лог помилок. Це могутня екосистема, яка безперервно вивчає твої угоди, звички, настрій та глибоку психологію. AI не дає тобі зірватися в тільт — він змушує запам'ятовувати слабкі місця, виправляти їх і до міліметра виконувати Торгову Систему. Він бачить все і робить тебе кращим.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { t: 'Контроль ТС', c: '0,224,164' },
                    { t: 'Захист від тільту', c: '248,113,113' },
                    { t: 'AI-Трекінг', c: '139,123,255' },
                    { t: 'Психологія', c: '251,191,36' },
                  ].map((tag) => (
                    <span
                      key={tag.t}
                      className="px-3 py-1.5 rounded-full text-[11.5px] font-semibold cursor-default transition-transform hover:scale-105"
                      style={{
                        color: `rgb(${tag.c})`,
                        background: `rgba(${tag.c},0.10)`,
                        border: `1px solid rgba(${tag.c},0.3)`,
                      }}
                    >
                      {tag.t}
                    </span>
                  ))}
                </div>
              </GlassCard>
            </div>
          </motion.div>
        </div>

        {/* ============================ 2. ANALYTICS ============================ */}
        <div id="analytics" className="scroll-mt-32">
          <motion.div {...rise(0)} className="mb-20">
            <SectionTitle
              eyebrow="Analytics · твій edge в цифрах"
              title="Аналітика, яка йде вглиб"
              sub="Вінрейт по сесіях, розподіл R-множників, найкращі пари, найгірші години. 200+ метрик, які відповідають на одне питання: де мій справжній edge? Все розкладено по п'яти вкладках — щоб нічого не відволікало і все було легко знайти."
            />

            <div className="flex flex-col gap-5">
              {analyticsTabs.map((tab, i) => {
                const Icon = tab.icon;
                return (
                  <motion.div key={tab.title} {...rise(i * 0.05)}>
                    <GlassCard glow className="p-7">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="md:w-[260px] shrink-0">
                          <div
                            className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                            style={{ background: `rgba(${tab.rgb},0.12)`, border: `1px solid rgba(${tab.rgb},0.3)`, color: tab.color }}
                          >
                            <Icon size={22} strokeWidth={1.8} />
                          </div>
                          <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            {tab.title}
                          </h3>
                          <p className="text-[13px] text-[var(--edge-text)]/50 leading-relaxed">{tab.desc}</p>
                        </div>
                        <div className="flex-1 flex flex-col gap-2.5">
                          {tab.points.map((p, pi) => (
                            <div
                              key={pi}
                              className="flex items-start gap-3 rounded-[12px] px-4 py-3 border border-[var(--edge-hair)] transition-colors duration-200 hover:border-white/[0.14] hover:bg-[var(--edge-hair)]"
                              style={{ background: 'rgba(8,9,11,0.45)' }}
                            >
                              <span
                                className="mt-[7px] shrink-0 w-[7px] h-[7px] rounded-full"
                                style={{ background: tab.color, boxShadow: `0 0 8px rgba(${tab.rgb},0.7)` }}
                              />
                              <p className="text-[13px] text-[var(--edge-text)]/70 leading-relaxed">{p}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </div>

            <motion.div {...rise(0.1)} className="mt-5">
              <div
                className="rounded-[16px] border p-5 flex items-start gap-4"
                style={{ background: `rgba(${ACCENT},0.07)`, borderColor: `rgba(${ACCENT},0.25)` }}
              >
                <Flame size={22} style={{ color: ACCENT_HEX }} className="shrink-0 mt-0.5" />
                <p className="text-[13.5px] text-[var(--edge-text)]/75 leading-relaxed">
                  Головна ідея всієї аналітики: <span className="text-[var(--edge-text)] font-semibold">дисципліна має ціну в R</span>.
                  Система рахує різницю між тим, що є, і тим, що вже могло бути без витоків — і показує
                  конкреттні звички, які з'їдають результат. Не «стань дисциплінованішим», а «ось ці 4
                  порушення коштували тобі 11.3R за місяць».
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ============================ 3. CONTACT ============================ */}
        <div id="contact" className="scroll-mt-32">
          <motion.div {...rise(0)} className="mb-20">
            <GlassCard glow className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-11 h-11 rounded-[13px] flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(37,163,233,0.12)', border: '1px solid rgba(37,163,233,0.3)', color: '#25A3E9' }}
                  >
                    <MessageCircle size={22} strokeWidth={1.8} />
                  </div>
                  <div>
                    <h2 className="text-[var(--edge-text)] font-bold text-[15px] mb-1" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      Зв'язок зі мною
                    </h2>
                    <p className="text-[var(--edge-text)]/50 text-[13px] leading-relaxed">
                      Якщо виникнуть питання або щось не працює — будь ласка, повідомте мене в Telegram.
                    </p>
                  </div>
                </div>
                <motion.a
                  href="https://t.me/h1f3stt"
                  target="_blank"
                  rel="noreferrer"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="shrink-0 text-[var(--edge-text)] px-7 py-3 rounded-[12px] text-[11.5px] font-bold uppercase tracking-[1.5px] flex items-center gap-2"
                  style={{
                    background: 'linear-gradient(140deg, #4db8f5 0%, #25A3E9 50%, #1273ab 100%)',
                    boxShadow: '0 14px 30px -12px rgba(37,163,233,0.6), inset 0 1px 0 rgba(255,255,255,0.25)',
                  }}
                >
                  <Send size={14} /> Написати в Telegram
                </motion.a>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* ============================ 4. MODULES ============================ */}
        <div id="modules" className="scroll-mt-32">
          <motion.div {...rise(0)}>
            <SectionTitle
              eyebrow="Документація терміналу"
              title="Всі модулі системи"
              sub="Опис кожного інструмента та як з нього витиснути максимум."
            />

            <div className="space-y-14">
              {documentation.map((section, idx) => (
                <div key={idx}>
                  <div className="flex items-center gap-3 mb-6 px-1">
                    {section.icon}
                    <h3
                      className="text-[11.5px] font-bold text-[var(--edge-text)]/45 uppercase"
                      style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 3 }}
                    >
                      {section.category}
                    </h3>
                    <div className="flex-1 h-px ml-4" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.1), transparent)' }} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {section.items.map((item, i) => (
                      <motion.div key={i} {...rise(Math.min(i, 3) * 0.05)}>
                        <GlassCard glow className="p-7 h-full flex flex-col">
                          {/* top accent hairline */}
                          <div
                            className="absolute top-0 left-1/2 -translate-x-1/2 w-[55%] h-px opacity-40 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ background: `linear-gradient(90deg, transparent, rgba(${item.rgb},0.9), transparent)` }}
                          />

                          <div className="flex items-center gap-4 mb-4">
                            <div
                              className="w-11 h-11 rounded-[13px] flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                              style={{ background: `rgba(${item.rgb},0.12)`, border: `1px solid rgba(${item.rgb},0.3)`, color: item.color }}
                            >
                              {item.icon}
                            </div>
                            <h4 className="text-[17px] font-bold text-[var(--edge-text)]" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                              {item.title}
                            </h4>
                          </div>

                          <p className="text-[var(--edge-text)]/55 text-[13px] leading-relaxed mb-5">{item.desc}</p>

                          <div className="space-y-2.5 mt-auto">
                            {item.features.map((feature, fIdx) => (
                              <div
                                key={fIdx}
                                className="rounded-[12px] border border-[var(--edge-hair)] px-4 py-3 flex items-start gap-3 transition-colors duration-200 hover:border-white/[0.14] hover:bg-[var(--edge-hair)]"
                                style={{ background: 'rgba(8,9,11,0.45)' }}
                              >
                                <span
                                  className="mt-[6px] shrink-0 w-[7px] h-[7px] rounded-full"
                                  style={{ background: item.color, boxShadow: `0 0 8px rgba(${item.rgb},0.7)` }}
                                />
                                <div>
                                  <h5 className="text-[var(--edge-text)] font-semibold text-[13px] mb-0.5">{feature.title}</h5>
                                  <p className="text-[var(--edge-text)]/50 text-[12px] leading-relaxed">{feature.desc}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </GlassCard>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* footer */}
        <div
          className="text-center mt-20 text-[10px] uppercase text-[var(--edge-text)]/25"
          style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2 }}
        >
          © 2026 THE EDGE · SOC 2 · 256-BIT
        </div>
      </div>
    </div>
  );
}