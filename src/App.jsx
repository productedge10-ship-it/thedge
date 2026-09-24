import { createElement, lazy as reactLazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { demoClient } from './lib/demoDb';
import { sharedClient } from './lib/sharedDb';
import { setDemoClient, setSharedClient } from './lib/supabase';

/* Демо-клієнт реєструється до першого рендера: AuthContext питає
   сесію одразу, і на шляху /demo відповісти має вже він. Клієнт
   перегляду за посиланням (/view/*) — з тієї самої причини. */
setDemoClient(demoClient);
setSharedClient(sharedClient);
import { Toaster } from 'react-hot-toast';

/* Сесія потрібна до першого рендера будь-якого маршруту, тому
   провайдер автентифікації лишається у стартовому шматку. */
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import ProtectedRoute from './components/core/ProtectedRoute';
/* ProSection вирішує, що показати на платній сторінці — вміст чи
   замок, — тож має бути на місці ще до того, як сторінка почне
   малюватись. Ліниво тягнути його означало б зайвий кадр із
   порожнечею перед кожним платним розділом. */
import ProSection from './components/core/ProSection';
import Landing from './pages/Landing';

/* ==================================================================
   Що вантажиться одразу, а що — за потреби.

   Лендінг лишається у стартовому шматку: це корінь, на нього
   приходять із реклами й пошуку, і саме його заголовок вимірюється
   як LCP. Ліниве завантаження додало б йому зайвий похід у мережу
   рівно там, де ми економимо час.

   Решта — через lazy. Раніше всі тридцять сторінок імпортувались
   статично, тому людина з реклами скачувала журнал, аналітику з
   графіками, бектест і пошук по блогу, щоб побачити один екран із
   заголовком: майже мегабайт коду, з якого на лендінгу не
   виконувалось три чверті.
================================================================== */
/* Лінива сторінка, яка переживає деплой.

   Після кожного оновлення сайту старі файли сторінок (з хешем у назві)
   зникають із сервера. Людина з давно відкритою вкладкою клікає на
   блог, браузер просить файл, якого вже немає, — і замість сторінки
   бачить «Failed to fetch dynamically imported module».

   Тому при такій помилці один раз тихо перезавантажуємо сторінку: новий
   index.html приведе вже нові файли. Позначка в sessionStorage не дає
   зациклитись, якщо файл справді зламаний, — тоді помилка покажеться
   як є. */
const RELOAD_KEY = 'edge:chunk-reload';
const lazy = (load) => reactLazy(() => load()
  .then((m) => { sessionStorage.removeItem(RELOAD_KEY); return m; })
  .catch((e) => {
    if (!sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
      return new Promise(() => {});
    }
    throw e;
  }));

const Auth = lazy(() => import('./pages/Auth'));
const Terms = lazy(() => import('./pages/Terms'));
const DemoShell = lazy(() => import('./pages/DemoShell'));
const ViewShell = lazy(() => import('./pages/ViewShell'));
const Hub = lazy(() => import('./pages/Hub'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const DailyPlan = lazy(() => import('./pages/DailyPlan'));
const Analyses = lazy(() => import('./pages/Analyses'));
const Accounts = lazy(() => import('./pages/Accounts'));
const TradingJournal = lazy(() => import('./pages/TradingJournal'));
const ErrorLog = lazy(() => import('./pages/ErrorLog'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Todo = lazy(() => import('./pages/Todo'));
const Reviews = lazy(() => import('./pages/Reviews'));
const FAQ = lazy(() => import('./pages/FAQ'));
const TradingSystem = lazy(() => import('./pages/TradingSystem'));
const Backtest = lazy(() => import('./pages/Backtest'));
const BacktestSession = lazy(() => import('./pages/BacktestSession'));
const TwentyTrades = lazy(() => import('./pages/TwentyTrades'));
const SharedPlan = lazy(() => import('./pages/SharedPlan'));
const SharedReview = lazy(() => import('./pages/SharedReview'));
const SharedBacktest = lazy(() => import('./pages/SharedBacktest'));
const SharedStats = lazy(() => import('./pages/SharedStats'));
const SharedTrade = lazy(() => import('./pages/SharedTrade'));
const PreTradeChecklist = lazy(() => import('./pages/PreTradeChecklist'));
const Calculator = lazy(() => import('./pages/Calculator'));
const News = lazy(() => import('./pages/News'));
const BlogList = lazy(() => import('./pages/BlogList'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const NotFound = lazy(() => import('./pages/Error404'));

/* Оболонка застосунку теж лінива: до входу вона не потрібна, а тягне
   за собою бічну панель із живим котом на framer-motion — це
   найважчий компонент у проєкті.

   ProtectedRoute і SettingsProvider лишаються звичайними імпортами:
   разом вони важать п'ять кілобайт, і окремий похід у мережу за ними
   коштував би дорожче за них самих. */
const Layout = lazy(() => import('./components/core/Layout'));
const CandleReveal = lazy(() => import('./components/core/CandleReveal'));

/* Заглушка фарбується змінною теми, а не чорним: у світлій темі
   чорний прямокутник між сторінками помітніший за саме очікування. */
const Blank = <div style={{ minHeight: '100vh', background: 'var(--edge-bg, #0A0A0C)' }} />;

/* Suspense на кожну сторінку окремо, а не один на застосунок: інакше
   перехід між розділами гасив би разом зі сторінкою й бічну панель,
   тобто блимав би весь екран замість його середини. */
const page = (Comp) => (
  <Suspense fallback={Blank}>{createElement(Comp)}</Suspense>
);

/* Платна сторінка. Замок малюється замість вмісту, але маршрут
   лишається на місці й лишається в меню.

   Ховати пункт узагалі — найгірший варіант з можливих: прихованого
   розділу для людини не існує, вона ніколи не дізнається, що продукт
   таке вміє, і ніколи за це не заплатить. */
const proPage = (Comp, feature) => (
  <Suspense fallback={Blank}>
    <ProSection feature={feature}>{createElement(Comp)}</ProSection>
  </Suspense>
);

/* ------------------------------------------------------------------
   /blog без мови.

   Мова блогу стоїть в адресі, бо кожна версія індексується окремо.
   Але руками набирають саме /blog, і в такому разі краще здогадатись
   за мовою браузера, ніж показати 404.
------------------------------------------------------------------ */
const BLOG_LANGS = ['uk', 'en'];

function BlogRedirect() {
  const nav = (navigator.language || 'uk').slice(0, 2).toLowerCase();
  const lang = BLOG_LANGS.includes(nav) ? nav : 'uk';
  return <Navigate to={`/${lang}/blog`} replace />;
}

const router = createBrowserRouter([
  /* --- Публічні маршрути (без Layout і без захисту) ---
     Корінь — лендінг: людина з реклами чи пошуку має потрапляти на
     сторінку, яка продає, а не на форму входу. Залогінених він сам
     перекидає в застосунок. */
  { path: '/', element: <Landing /> },
  { path: '/auth', element: page(Auth) },
  /* ---- Пісочниця ----
     Ті самі сторінки й ті самі модалки, що в застосунку: підмінений
     лише клієнт бази, тому демо не може розійтися з продуктом. */
  {
    path: '/demo',
    element: page(DemoShell),
    children: [
      { index: true, element: page(DailyPlan) },
      { path: 'plan', element: page(DailyPlan) },
      { path: 'plan/:date/:pair', element: page(DailyPlan) },
      { path: 'journal', element: page(TradingJournal) },
      { path: 'analytics', element: page(Analytics) },
      { path: 'analyses', element: page(Analyses) },
      { path: 'accounts', element: page(Accounts) },
    ],
  },
  /* ---- Журнал за посиланням ----
     Ті самі сторінки, що в застосунку, на даних власника посилання й
     без права змін. Підмінений лише клієнт бази (lib/sharedDb.js). */
  {
    path: '/view/:token',
    element: page(ViewShell),
    children: [
      { index: true, element: <Navigate to="journal" replace /> },
      { path: 'journal', element: page(TradingJournal) },
      { path: 'analytics', element: page(Analytics) },
      { path: 'analyses', element: page(Analyses) },
      { path: 'plan', element: page(DailyPlan) },
      { path: 'plan/:date/:pair', element: page(DailyPlan) },
    ],
  },
  /* ---- Блог ----
     Публічна частина без входу: сюди приходять із пошуку, а не з
     застосунку. Мова живе в адресі (/uk/blog/slug), бо кожна мовна
     версія має індексуватись окремо; лендінг лишається на корені й
     перемикає мову сам. */
  { path: '/blog', element: <BlogRedirect /> },
  { path: '/:lang/blog', element: page(BlogList) },
  { path: '/:lang/blog/category/:cat', element: page(BlogList) },
  { path: '/:lang/blog/tag/:tag', element: page(BlogList) },
  { path: '/:lang/blog/:slug', element: page(BlogPost) },

  /* Умови мають бути доступні до входу: на них посилається форма
     реєстрації, а погодитись із тим, чого не можеш прочитати, —
     це не погодження. */
  { path: '/terms', element: page(Terms) },

  { path: '/shared/plan/:id', element: page(SharedPlan) },
  { path: '/shared/review/:id', element: page(SharedReview) },
  { path: '/shared/backtest/:id', element: page(SharedBacktest) },
  { path: '/shared/stats/:id', element: page(SharedStats) },
  { path: '/shared/trade/:id', element: page(SharedTrade) },

  // --- Захищені маршрути з Layout і сайдбаром ---
  {
    path: '/',
    element: (
      <Suspense fallback={Blank}>
        <ProtectedRoute>
          {/* Налаштування обгортають усе: від них залежить і меню, і фон,
              і те, чи взагалі щось рухається. */}
          <SettingsProvider>
            {/* Завіса з графіком лежить поверх усього застосунку разом із
                бічною панеллю: відкриватись має весь екран, а не його
                середина. */}
            <CandleReveal>
              <Toaster position="bottom-right" reverseOrder={false} />
              <Layout />
            </CandleReveal>
          </SettingsProvider>
        </ProtectedRoute>
      </Suspense>
    ),
    children: [
      { path: 'app', element: page(Hub) },
      { path: 'notes', element: page(Dashboard) },
      { path: 'analyses', element: page(Analyses) },
      { path: 'plan', element: page(DailyPlan) },
      { path: 'plan/:date/:pair', element: page(DailyPlan) },
      { path: 'accounts', element: page(Accounts) },
      { path: 'journal', element: page(TradingJournal) },
      { path: 'error', element: page(ErrorLog) },
      { path: 'analytics', element: page(Analytics) },
      { path: 'todo', element: page(Todo) },
      { path: 'reviews', element: page(Reviews) },
      { path: 'faq', element: page(FAQ) },
      { path: 'system', element: page(TradingSystem) },
      { path: 'backtest', element: proPage(Backtest, 'backtest') },
      { path: 'backtest/:sessionId', element: proPage(BacktestSession, 'backtest') },
      { path: '20-trades', element: page(TwentyTrades) },
      { path: 'checklist', element: page(PreTradeChecklist) },
      { path: 'calculator', element: page(Calculator) },
      { path: 'news', element: page(News) },
    ],
  },

  // --- 404: поза Layout, без сайдбара ---
  // path="*" спрацьовує на будь-який невідомий URL
  { path: '*', element: page(NotFound) },
]);

/* Аналітика поведінки — окремим шматком і лише коли браузер
   звільнився після першого малювання. Трекер не має права ні
   сповільнити відкриття сторінки, ні зламати її: якщо шматок не
   довантажився, помилку ковтаємо тут, а не ведемо на самовідновлення
   з перезавантаженням, як для сторінок. */
if (typeof window !== 'undefined') {
  const bootAnalytics = () => import('./lib/analytics')
    .then((m) => m.startAnalytics(router))
    .catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(bootAnalytics, { timeout: 3000 });
  else setTimeout(bootAnalytics, 1500);
}

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
