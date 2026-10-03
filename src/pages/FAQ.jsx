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
import { t as tx } from '../lib/lang';

/* ------------------------------------------------------------------ */
/*  THE EDGE — theme tokens (same as Auth page)                        */
/* ------------------------------------------------------------------ */
const ACCENT_HEX = 'var(--edge-acc, var(--edge-acc))';
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
        style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif", letterSpacing: '-0.3px' }}
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
      color: 'var(--edge-acc, var(--edge-acc))', rgb: '139,123,255',
      title: tx('Огляд', 'Overview'),
      desc: tx('Перший екран, який відповідає на головне питання: «Як у мене справи?» — одним реченням і чотирма цифрами.', 'The first screen, answering the main question — "How am I doing?" — in one sentence and four numbers.'),
      points: [
        tx('Розумний підсумок людською мовою: «Ти +17.3R за 47 угод. Ср — твій найкращий день, а спокій — твій найкращий стан».', 'A smart summary in plain language: "You\'re +17.3R over 47 trades. Wednesday is your best day, and calm is your best state."'),
        tx('KPI-картки з міні-графіками: Чистий R, Вінрейт, Профіт-фактор і Ціна тільта — скільки R з\'їли емоції.', 'KPI cards with mini charts: Net R, Win rate, Profit factor and Cost of tilt — how much R your emotions ate.'),
        tx('Крива еквіті з максимальною просадкою та блок «Звідки береться R» — топ-фактори твого прибутку: сесія, актив, день, сетап.', 'Equity curve with max drawdown and a "Where your R comes from" block — the top drivers of your profit: session, asset, day, setup.'),
        tx('«План дотримано vs Порушено», «Емоційний стан vs Результат» та «Найдорожчі звички» — три блоки, які показують, де саме тече твій результат.', '"Plan followed vs Broken", "Emotional state vs Result" and "Most expensive habits" — three blocks that show exactly where your results leak.'),
      ],
    },
    {
      icon: LineChart,
      color: 'var(--edge-info)', rgb: '79,139,255',
      title: tx('Перформанс', 'Performance'),
      desc: tx('Чиста математика твоєї системи. Тут видно не «пощастило / не пощастило», а справжнє очікування на кожну угоду.', 'The pure math of your system. Here you see not "lucky / unlucky" but your real expectancy per trade.'),
      points: [
        tx('Очікування (+R на угоду), середній плюс і мінус, серії перемог та поразок, фактор відновлення.', 'Expectancy (+R per trade), average win and loss, win and loss streaks, recovery factor.'),
        tx('Середній R по днях тижня та чистий R по сесіях (Asia / London / New York) — коли ти реально заробляєш.', 'Average R by weekday and net R by session (Asia / London / New York) — when you actually make money.'),
        tx('Розподіл R-множників: хвіст справа — це те, за що ти платиш усіма мінусами.', 'R-multiple distribution: the right tail is what you pay for with all your losses.'),
        tx('Underwater-крива просадки, R по годинах входу та scatter «час утримання vs результат» — кожна точка це угода.', 'Underwater drawdown curve, R by entry hour and a "holding time vs result" scatter — every dot is a trade.'),
      ],
    },
    {
      icon: BrainCircuit,
      color: '#c084fc', rgb: '192,132,252',
      title: tx('Психологія', 'Psychology'),
      desc: tx('Найпотужніша вкладка. Модель зчитує всі твої угоди і збирає психологічний зліпок — з цифрами, а не відчуттями.', 'The most powerful tab. The model reads all your trades and builds a psychological snapshot — with numbers, not feelings.'),
      points: [
        tx('Нейропрофіль: нейро-індекс /100, твій тип трейдера та п\'ять шкал — Фокус, Контроль, Відновлення, Дисципліна, Ризик.', 'Neuro profile: a neuro index /100, your trader type and five scales — Focus, Control, Recovery, Discipline, Risk.'),
        tx('Вердикт по дисципліні: «Зараз +17.3R → Потенціал без витоків +37.6R». Дисципліна має конкретну ціну в R.', 'Discipline verdict: "Now +17.3R → Potential without leaks +37.6R". Discipline has a concrete price in R.'),
        tx('«Куди течуть гроші»: помилки виконання, вхід одразу після збитку, імпульсивні стани, надлишковий ризик — з сумою по кожному.', '"Where the money leaks": execution mistakes, entering right after a loss, impulsive states, excess risk — with a total for each.'),
        tx('Ланцюг тільта (як падає очікування після 1/2/3 збитків), емоційний радар і рейтинг «Стан входу → гроші»: спокій дає +1.67R, тільт — −0.23R.', 'Tilt chain (how expectancy drops after 1/2/3 losses), an emotion radar and an "Entry state → money" ranking: calm gives +1.67R, tilt gives −0.23R.'),
        tx('Чек-лист перед входом: не галочки, а факт — як часто ти реально дотримувався кожного правила, і скільки коштувало кожне порушення.', 'Pre-entry checklist: not checkboxes but facts — how often you actually followed each rule, and what each violation cost.'),
      ],
    },
    {
      icon: Layers,
      color: '#00e0a4', rgb: '0,224,164',
      title: tx('Активи та Сетапи', 'Assets & Setups'),
      desc: tx('Де твій edge живе, а де вмирає. Система прямо каже, що торгувати, а від чого тимчасово відійти.', 'Where your edge lives and where it dies. The system tells you straight what to trade and what to step away from for now.'),
      points: [
        tx('Ефективність активів з вердиктом системи: «Найкраще зараз GER40, EURUSD, US100. Від GBPUSD, USDJPY краще відійти».', 'Asset performance with the system\'s verdict: "Best right now: GER40, EURUSD, US100. Better step away from GBPUSD, USDJPY."'),
        tx('Матриця напрямків Long / Short: баланс PnL і вінрейт по кожному боці для кожного активу — асиметрія важливіша за загальний вінрейт.', 'Long / Short direction matrix: PnL balance and win rate for each side of every asset — the asymmetry matters more than the overall win rate.'),
        tx('Ефективність сетапів: Trendline break +11.4R проти FVG fill −3.4R — рейтинг твоїх патернів з WR і середнім R.', 'Setup performance: Trendline break +11.4R vs FVG fill −3.4R — a ranking of your patterns with WR and average R.'),
        tx('Теплова матриця «Актив × Сесія»: зелені клітини — твої золоті комбінації, червоні — сліпі зони.', '"Asset × Session" heatmap: green cells are your golden combinations, red ones are blind spots.'),
        tx('Статистика по кожному проп-акаунту: вінрейт, кількість угод, помилки.', 'Stats for each prop account: win rate, number of trades, mistakes.'),
      ],
    },
    {
      icon: CalendarClock,
      color: 'var(--edge-warn)', rgb: '245,158,11',
      title: tx('Історія угод', 'Trade history'),
      desc: tx('Повний реєстр усього, що ти наторгував — з фільтрами по акаунтах і періодах.', 'A full register of everything you\'ve traded — with filters by account and period.'),
      points: [
        tx('Перемикання між акаунтами (FTMO, Funding Pips, MFF) та періодами: весь час, квартал, 30 днів, тиждень.', 'Switch between accounts (FTMO, Funding Pips, MFF) and periods: all time, quarter, 30 days, week.'),
        tx('Кожна угода тягне за собою контекст: емоцію, помилки, сесію, сетап — усе, що потім живить аналітику.', 'Every trade carries its context: emotion, mistakes, session, setup — everything that later feeds the analytics.'),
        tx('Експорт звіту одним кліком.', 'One-click report export.'),
      ],
    },
  ];

  /* ---------------------- MODULE DOCUMENTATION ---------------------- */
  const documentation = [
    {
      category: tx('Routine (Щоденна рутина)', 'Routine (Daily routine)'),
      icon: <History size={16} className="text-[var(--edge-text)]/40" />,
      items: [
        {
          title: 'Trading Plan',
          icon: <Target size={22} />,
          color: 'var(--edge-info)', rgb: '79,139,255',
          desc: tx('Головний робочий простір трейдера на кожен день. Створюйте торгову ідею перед сесією, логуйте угоди в процесі та підводьте підсумки.', 'The trader\'s main daily workspace. Build your trade idea before the session, log trades as you go and wrap up at the end.'),
          features: [
            { title: 'Pre-Session Quiz', desc: tx("Обов'язковий чеклист стану перед торгами. З'являється лише для нових планів на поточний день.", 'A mandatory state checklist before trading. Appears only for new plans for the current day.') },
            { title: 'AI Logic Critic', desc: tx("Штучний інтелект аналізує ваш текст плану на наявність логічних дір та відсутності 'Plan B'.", 'AI checks your plan text for logical holes and a missing "Plan B".') },
            { title: 'Post-Session & Psychology', desc: tx("Порівняння 'Planned Bias' з 'Actual'. Оцінка виконання (1-5) та Журнал Психології (оцінка тильту, страху, впевненості).", 'Compare "Planned Bias" with "Actual". Rate your execution (1-5) and keep a Psychology Journal (tilt, fear, confidence ratings).') },
          ],
        },
        {
          title: '20 Trades Method',
          icon: <Activity size={22} />,
          color: '#00e0a4', rgb: '0,224,164',
          desc: tx('Тренажер дисципліни за Марком Дугласом. Відв\'язує емоції від результату та вчить мислити ймовірностями.', 'A discipline trainer based on Mark Douglas. Detaches emotions from outcomes and teaches you to think in probabilities.'),
          features: [
            { title: tx('Фокус на Процесі', 'Focus on Process'), desc: tx('Тут немає результатів Win/Loss. Тільки фіксація дотримання правил: Стратегія, Ризик, План, Виконання.', 'There are no Win/Loss results here. You only record whether you followed the rules: Strategy, Risk, Plan, Execution.') },
            { title: 'Discipline Score', desc: tx('Система автоматично вираховує відсоток ідеальних угод, де були дотримані всі правила без винятку.', 'The system automatically calculates the share of perfect trades where every rule was followed without exception.') },
            { title: tx('Візуальна Сітка', 'Visual Grid'), desc: tx('Наочний прогрес серії з 20 угод у вигляді єдиної таблиці для вироблення довгострокового мислення.', 'Clear progress through a 20-trade series in a single table, to build long-term thinking.') },
          ],
        },
        {
          title: 'Trading Journal',
          icon: <BookOpen size={22} />,
          color: 'var(--edge-ok)', rgb: '52,211,153',
          desc: tx('Журнал усіх ваших угод. Централізована таблиця для швидкого перегляду результатів та дисципліни.', 'A log of all your trades. One central table for a quick look at results and discipline.'),
          features: [
            { title: tx('Швидкі KPI', 'Quick KPIs'), desc: tx('Миттєва статистика зверху: загальний RR, вінрейт, відсоток угод за планом та відсоток допущених помилок.', 'Instant stats at the top: total RR, win rate, share of trades by plan and share of trades with mistakes.') },
            { title: tx('Кастомний Календар', 'Custom Calendar'), desc: tx("Фільтруйте угоди за будь-який період зручним календарем з кнопками 'Сьогодні', 'Цей тиждень', 'Останні 3 місяці'.", 'Filter trades for any period with a handy calendar and "Today", "This week", "Last 3 months" buttons.') },
            { title: tx('Спліт-модалка деталей', 'Split details modal'), desc: tx('Клікніть на угоду, і відкриється подвійний екран: зліва — деталі самої угоди (фото, помилки), справа — повний TDA аналіз плану того дня.', 'Click a trade to open a dual view: trade details on the left (photos, mistakes), the full TDA analysis of that day\'s plan on the right.') },
          ],
        },
        {
          title: 'Analyses Log',
          icon: <FileText size={22} />,
          color: '#818cf8', rgb: '129,140,248',
          desc: tx('База даних усіх ваших створених щоденних планів. Бібліотека вашого торгового досвіду.', 'A database of all the daily plans you\'ve created. The library of your trading experience.'),
          features: [
            { title: tx('Розумний пошук', 'Smart search'), desc: tx('Шукайте плани за текстом, активами або за допомогою зручного календаря.', 'Search plans by text, asset or with a handy calendar.') },
            { title: 'List / Grid View', desc: tx('Перемикайтесь між детальним списком та компактною плиткою з кольоровою індикацією Bias.', 'Switch between a detailed list and compact tiles with color-coded Bias.') },
          ],
        },
        {
          title: 'Periodic Reviews',
          icon: <BrainCircuit size={22} />,
          color: '#c084fc', rgb: '192,132,252',
          desc: tx('Інструмент для глибокої роботи над собою. Аналізуйте тижні чи місяці за допомогою AI.', 'A tool for deep work on yourself. Analyze weeks or months with AI.'),
          features: [
            { title: tx('Спліт-екран', 'Split screen'), desc: tx('Зліва — всі ваші плани, помилки та угоди за вибраний період. Справа — текстовий редактор для звіту.', 'On the left — all your plans, mistakes and trades for the chosen period. On the right — a text editor for your report.') },
            { title: tx('Масовий AI Аналіз', 'Bulk AI Analysis'), desc: tx('Виберіть до 7 проблемних днів, і ШІ знайде психологічні патерни, сильні сторони та згенерує правила на наступний тиждень.', 'Pick up to 7 problem days, and AI will find psychological patterns and strengths and generate rules for next week.') },
          ],
        },
        {
          title: 'Trading System (Playbook)',
          icon: <BookOpen size={22} />,
          color: '#fb923c', rgb: '251,146,60',
          desc: tx('Ваша особиста Вікіпедія. Конституція вашої торгівлі, детальний опис сетапів та правил риск-менеджменту.', 'Your personal Wikipedia. The constitution of your trading, with detailed setups and risk management rules.'),
          features: [
            { title: tx('Папки та Drag & Drop', 'Folders & Drag & Drop'), desc: tx('Створюйте необмежену вкладеність папок та перетягуйте сторінки між ними для ідеальної структури.', 'Nest folders as deep as you like and drag pages between them for a perfect structure.') },
            { title: 'Rich Text & Tiptap', desc: tx('Повноцінний текстовий редактор з підтримкою заголовків, списків та палітри кольорів у стилі TradingView.', 'A full text editor with headings, lists and a TradingView-style color palette.') },
            { title: tx('AI Рефакторинг', 'AI Refactoring'), desc: tx("Натисніть магічну кнопку, і ШІ автоматично відформатує ваші 'сирі' думки у структурований текст, зберігши всі трейдерські терміни.", 'Press the magic button and AI will turn your raw thoughts into structured text, keeping all the trading terms.') },
          ],
        },
        {
          title: 'Notes / Dashboard',
          icon: <LayoutGrid size={22} />,
          color: 'var(--edge-warn)', rgb: '251,191,36',
          desc: tx('Швидкі нотатки. Зберігайте сюди короткі спостереження, бектести або цікаві сетапи з ринку.', 'Quick notes. Save short observations, backtests or interesting market setups here.'),
          features: [
            { title: tx('Система Тегів', 'Tag System'), desc: tx('Створюйте власні теги і миттєво фільтруйте нотатки кліком по тегу прямо на картці.', 'Create your own tags and filter notes instantly by clicking a tag right on the card.') },
            { title: tx('Авто-стиснення фото', 'Auto photo compression'), desc: tx('Вставляйте графіки через Ctrl+V — система автоматично стисне їх у формат WebP для швидкої роботи.', 'Paste charts with Ctrl+V — the system automatically compresses them to WebP so everything stays fast.') },
          ],
        },
      ],
    },
    {
      category: tx('Data (Статистика та Метрики)', 'Data (Stats & Metrics)'),
      icon: <Database size={16} className="text-[var(--edge-text)]/40" />,
      items: [
        {
          title: 'Prop Accounts',
          icon: <Wallet size={22} />,
          color: 'var(--edge-warn)', rgb: '245,158,11',
          desc: tx('Управління вашими торговими рахунками (FTMO, Funding Pips тощо).', 'Manage your trading accounts (FTMO, Funding Pips, etc.).'),
          features: [
            { title: tx('Трекінг балансу', 'Balance tracking'), desc: tx('Додавайте рахунки та слідкуйте за загальним капіталом в управлінні.', 'Add accounts and keep track of the total capital you manage.') },
            { title: tx("Прив'язка угод", 'Trade linking'), desc: tx('Рахунки з цієї бази використовуються при додаванні угод в Trading Plan.', 'Accounts from this list are used when you add trades in Trading Plan.') },
          ],
        },
        {
          title: 'Error Log',
          icon: <ShieldAlert size={22} />,
          color: 'var(--edge-bad)', rgb: '248,113,113',
          desc: tx("Ваша 'Галерея болю'. Ізольований простір для перегляду та аналізу виключно збиткових та помилкових рішень.", 'Your "Gallery of pain". A separate space to review and analyze only losing and mistaken decisions.'),
          features: [
            { title: tx('Ізоляція помилок', 'Mistake isolation'), desc: tx("Усі угоди, позначені як 'Помилка', автоматично потрапляють сюди разом зі скріншотами.", 'All trades marked as a mistake land here automatically, along with their screenshots.') },
            { title: tx('Редагування психології', 'Psychology editing'), desc: tx('Детально описуйте причини тильту та змінюйте статуси FOMO/Followed Plan постфактум.', 'Describe the causes of tilt in detail and change FOMO/Followed Plan statuses after the fact.') },
          ],
        },
        {
          title: 'Analytics',
          icon: <BarChart2 size={22} />,
          color: 'var(--edge-acc, var(--edge-acc))', rgb: '139,123,255',
          desc: tx('Математика вашої торгової системи. Детальні дашборди для пошуку вашої торгової переваги (Edge). Повний гайд — у секції вище.', 'The math of your trading system. Detailed dashboards to find your trading edge. The full guide is in the section above.'),
          features: [
            { title: 'Cost of Tilt', desc: tx("Найважливіша метрика. Показує, скільки 'R' (прибутку) ви втратили через порушення правил та емоції.", 'The most important metric. Shows how much R (profit) you lost to rule breaks and emotions.') },
            { title: tx('BE та Missed', 'BE & Missed'), desc: tx("Угоди зі статусом 'Break Even' та 'Missed' враховуються у лічильниках, але НЕ псують вашу фінансову криву RR.", 'Trades with "Break Even" and "Missed" status count in the counters but do NOT spoil your RR equity curve.') },
            { title: tx('Детальні зрізи', 'Detailed breakdowns'), desc: tx('Аналіз прибутковості по днях тижня, торгових сесіях (London/NY) та напрямку (Long/Short).', 'Profitability by weekday, trading session (London/NY) and direction (Long/Short).') },
          ],
        },
      ],
    },
  ];

  /* ------------------ FLOATING NAV MENU ------------------ */
  const navItems = [
    { id: 'overview', label: tx('Огляд', 'Overview'), icon: <Compass size={14} /> },
    { id: 'analytics', label: tx('Аналітика', 'Analytics'), icon: <BarChart2 size={14} /> },
    { id: 'contact', label: tx('Підтримка', 'Support'), icon: <MessageCircle size={14} /> },
    { id: 'modules', label: tx('Модулі', 'Modules'), icon: <Layers size={14} /> },
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
        {/* На вузькому екрані чотири пункти з іконкою й підписом не
            влазять у пігулку одним рядком — «Модулі» просто зникав за
            краєм екрана без жодного натяку, що там ще щось є. Замість
            ховати підписи чи переносити в два рядки, пігулка сама їде
            вбік: той самий жест, що й гортання стрічки карток нижче. */}
        <style>{`.faq-dock::-webkit-scrollbar{display:none}`}</style>
        <div className="sticky top-4 z-50 flex justify-center w-full pointer-events-none mb-12 px-1 sm:px-0">
          <div
            className="faq-dock pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto p-1.5 bg-[#0a0c10]/80 backdrop-blur-xl border border-[var(--edge-hair-strong)] rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.6)]"
            style={{ scrollbarWidth: 'none' }}
          >
            {navItems.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`relative flex shrink-0 items-center gap-2 px-3.5 sm:px-4 py-2 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors duration-300 z-10
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
              style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif", letterSpacing: '-0.6px' }}
            >
              {tx('Журнал, який не просто зберігає угоди —', 'A journal that doesn\'t just store your trades —')}{' '}
              {/* Виділення лишається, але суцільним акцентом замість
                  фіолетового градієнта: градієнт у тексті — прикраса,
                  а не наголос, і на кінці він вицвітав. */}
              <span style={{ color: 'var(--edge-acc-text, #A498FF)' }}>
                {tx('він розбирає тебе', 'it breaks you down')}
              </span>.
            </h1>
            <p className="text-[15px] text-[var(--edge-text)]/55 mt-4 max-w-[640px] leading-relaxed">
              {tx(
                'The Edge читає кожну твою угоду, бачить тильт, revenge-входи та FOMO — і чесно, але по-доброму каже, що саме ти робиш не так. Нижче — все, що вміє система, і як цим користуватись.',
                'The Edge reads every trade you take, spots tilt, revenge entries and FOMO — and tells you honestly, but kindly, what exactly you\'re doing wrong. Below is everything the system can do and how to use it.',
              )}
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
                fontFamily: "var(--edge-sans, 'Golos Text'), system-ui, sans-serif",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = `rgba(${ACCENT},0.16)`)}
              onMouseLeave={(e) => (e.currentTarget.style.background = `rgba(${ACCENT},0.10)`)}
            >
              <Sparkles size={15} strokeWidth={2.4} className="transition-transform duration-300 group-hover:scale-110" />
              {tx('Пройти знайомство — хвилина', 'Take the quick tour — one minute')}
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
                    <h3 className="text-[20px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
                      {tx('AI-психолог трейдера', 'AI trading psychologist')}
                    </h3>
                    <p className="text-[14px] text-[var(--edge-text)]/55 leading-relaxed mb-4">
                      {tx(
                        'Він питає, як ти хочеш торгувати — а потім дивиться, чи ти реально так торгуєш. Читає угоди, ловить тильт, revenge-входи та FOMO, і відповідає цифрами з твого журналу, а не загальними словами.',
                        'It asks how you want to trade — and then checks whether you actually trade that way. It reads your trades, catches tilt, revenge entries and FOMO, and answers with numbers from your journal, not generic advice.',
                      )}
                    </p>
                    <p className="text-[14px] text-[var(--edge-text)]/55 leading-relaxed">
                      {tx(
                        'Аналізує твої дії, твою торгову систему, плани та угоди — і дає вердикт: що працює, що зливає R, і яке правило поставити наступним.',
                        'It analyzes your actions, your trading system, plans and trades — and gives a verdict: what works, what bleeds R, and which rule to add next.',
                      )}
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
                        {tx("AI-психолог · на зв'язку", 'AI psychologist · online')}
                      </div>
                      <div
                        className="rounded-[12px] p-3.5 text-[12.5px] leading-relaxed text-[var(--edge-text)]/85"
                        style={{ background: `rgba(${ACCENT},0.10)`, border: `1px solid rgba(${ACCENT},0.22)` }}
                      >
                        <span style={{ color: ACCENT_HEX }}>✦</span> {tx(
                          'Ти відкрив 3 угоди за 8 хвилин після того збитку по GBP. Це твій патерн revenge-трейду — вінрейт у таких входах',
                          'You opened 3 trades within 8 minutes after that GBP loss. That\'s your revenge-trading pattern — your win rate on these entries is',
                        )}{' '}
                        <span className="text-[#ff8080] font-semibold">22%</span>.
                      </div>
                      <div
                        className="rounded-[12px] p-3.5 text-[12.5px] leading-relaxed text-[var(--edge-text)]/70 self-end max-w-[85%]"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        {tx('Постав мені лок-аут на 30 хв після будь-якого збитку.', 'Set a 30-minute lockout for me after any loss.')}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--edge-text)]/35">
                        <RefreshCw size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
                        {tx('правило додано в чек-лист перед входом', 'rule added to your pre-entry checklist')}
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
                <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
                  {tx('Авто-імпорт з MT5', 'Auto-import from MT5')}
                </h3>
                <p className="text-[13.5px] text-[var(--edge-text)]/55 leading-relaxed mb-5">
                  {tx(
                    'Підключаєш один раз — і кожен філ, SL, TP та частковий вихід лягає в журнал у реальному часі. Без CSV, без копіпасту.',
                    'Connect once — and every fill, SL, TP and partial close lands in your journal in real time. No CSV, no copy-paste.',
                  )}
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
                    {tx('LIVE · синхронізовано з MT5', 'LIVE · synced with MT5')}
                  </div>
                </div>
              </GlassCard>

              <GlassCard glow className="p-7">
                <div
                  className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-5"
                  style={{ background: 'rgba(139,123,255,0.12)', border: '1px solid rgba(139,123,255,0.3)', color: 'var(--edge-acc, var(--edge-acc))' }}
                >
                  <Layers size={22} strokeWidth={1.8} />
                </div>
                <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-3" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
                  {tx('Абсолютна AI-екосистема', 'A complete AI ecosystem')}
                </h3>
                <p className="text-[13.5px] text-[var(--edge-text)]/55 leading-relaxed mb-5">
                  {tx(
                    "Це не просто лог помилок. Це могутня екосистема, яка безперервно вивчає твої угоди, звички, настрій та глибоку психологію. AI не дає тобі зірватися в тільт — він змушує запам'ятовувати слабкі місця, виправляти їх і до міліметра виконувати Торгову Систему. Він бачить все і робить тебе кращим.",
                    "It's not just a mistake log. It's an ecosystem that constantly studies your trades, habits, mood and deeper psychology. The AI keeps you from sliding into tilt — it makes you remember your weak spots, fix them and follow your Trading System to the millimeter. It sees everything and makes you better.",
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { t: tx('Контроль ТС', 'System control'), c: '0,224,164' },
                    { t: tx('Захист від тільту', 'Tilt protection'), c: '248,113,113' },
                    { t: tx('AI-Трекінг', 'AI tracking'), c: '139,123,255' },
                    { t: tx('Психологія', 'Psychology'), c: '251,191,36' },
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
              eyebrow={tx('Analytics · твій edge в цифрах', 'Analytics · your edge in numbers')}
              title={tx('Аналітика, яка йде вглиб', 'Analytics that goes deep')}
              sub={tx(
                "Вінрейт по сесіях, розподіл R-множників, найкращі пари, найгірші години. 200+ метрик, які відповідають на одне питання: де мій справжній edge? Все розкладено по п'яти вкладках — щоб нічого не відволікало і все було легко знайти.",
                'Win rate by session, R-multiple distribution, best pairs, worst hours. 200+ metrics that answer one question: where is my real edge? Everything is split across five tabs — so nothing distracts you and everything is easy to find.',
              )}
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
                          <h3 className="text-[18px] font-bold text-[var(--edge-text)] mb-2" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
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
                  {tx('Головна ідея всієї аналітики:', 'The core idea behind all the analytics:')} <span className="text-[var(--edge-text)] font-semibold">{tx('дисципліна має ціну в R', 'discipline has a price in R')}</span>.
                  {' '}{tx(
                    "Система рахує різницю між тим, що є, і тим, що вже могло бути без витоків — і показує конкретні звички, які з'їдають результат. Не «стань дисциплінованішим», а «ось ці 4 порушення коштували тобі 11.3R за місяць».",
                    'The system calculates the gap between what you have and what you could have had without the leaks — and shows the specific habits eating your results. Not "be more disciplined", but "these 4 violations cost you 11.3R this month".',
                  )}
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
                    <h2 className="text-[var(--edge-text)] font-bold text-[15px] mb-1" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
                      {tx("Зв'язок зі мною", 'Contact me')}
                    </h2>
                    <p className="text-[var(--edge-text)]/50 text-[13px] leading-relaxed">
                      {tx('Якщо виникнуть питання або щось не працює — будь ласка, повідомте мене в Telegram.', 'If you have questions or something isn\'t working, please let me know on Telegram.')}
                    </p>
                  </div>
                </div>
                <motion.a
                  href="https://t.me/thedgesupport"
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
                  <Send size={14} /> {tx('Написати в Telegram', 'Message on Telegram')}
                </motion.a>
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* ============================ 4. MODULES ============================ */}
        <div id="modules" className="scroll-mt-32">
          <motion.div {...rise(0)}>
            <SectionTitle
              eyebrow={tx('Документація терміналу', 'Terminal documentation')}
              title={tx('Всі модулі системи', 'All system modules')}
              sub={tx('Опис кожного інструмента та як з нього витиснути максимум.', 'What each tool does and how to get the most out of it.')}
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
                            <h4 className="text-[17px] font-bold text-[var(--edge-text)]" style={{ fontFamily: "var(--edge-display, 'Unbounded'), system-ui, sans-serif" }}>
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