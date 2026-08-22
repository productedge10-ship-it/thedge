import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Layout from './components/core/Layout';
import Landing from './pages/Landing';
import Hub from './pages/Hub';
import Dashboard from './pages/Dashboard';
import DailyPlan from './pages/DailyPlan';
import Analyses from './pages/Analyses';
import Accounts from './pages/Accounts';
import TradingJournal from './pages/TradingJournal';
import ErrorLog from './pages/ErrorLog';
import Analytics from './pages/Analytics';
import Todo from './pages/Todo';
import Reviews from './pages/Reviews';
import FAQ from './pages/FAQ';
import TradingSystem from './pages/TradingSystem';
import Backtest from './pages/Backtest';
import BacktestSession from './pages/BacktestSession';
import TwentyTrades from './pages/TwentyTrades';
import Auth from './pages/Auth';
import ProtectedRoute from './components/core/ProtectedRoute';
import CandleReveal from './components/core/CandleReveal';
import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import SharedPlan from './pages/SharedPlan';
import SharedReview from './pages/SharedReview';
import SharedBacktest from './pages/SharedBacktest';
import SharedStats from './pages/SharedStats';
import PreTradeChecklist from './pages/PreTradeChecklist';
import Calculator from './pages/Calculator';
import News from './pages/News';
import NotFound from './pages/Error404';

const router = createBrowserRouter([
  /* --- Публічні маршрути (без Layout і без захисту) ---
     Корінь — лендінг: людина з реклами чи пошуку має потрапляти на
     сторінку, яка продає, а не на форму входу. Залогінених він сам
     перекидає в застосунок. */
  { path: '/', element: <Landing /> },
  { path: '/auth', element: <Auth /> },
  { path: '/shared/plan/:id', element: <SharedPlan /> },
  { path: '/shared/review/:id', element: <SharedReview /> },
  { path: '/shared/backtest/:id', element: <SharedBacktest /> },
  { path: '/shared/stats/:id', element: <SharedStats /> },

  // --- Захищені маршрути з Layout і сайдбаром ---
  {
    path: '/',
    element: (
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
    ),
    children: [
      { path: 'app', element: <Hub /> },
      { path: 'notes', element: <Dashboard /> },
      { path: 'analyses', element: <Analyses /> },
      { path: 'plan', element: <DailyPlan /> },
      { path: 'plan/:date/:pair', element: <DailyPlan /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'journal', element: <TradingJournal /> },
      { path: 'error', element: <ErrorLog /> },
      { path: 'analytics', element: <Analytics /> },
      { path: 'todo', element: <Todo /> },
      { path: 'reviews', element: <Reviews /> },
      { path: 'faq', element: <FAQ /> },
      { path: 'system', element: <TradingSystem /> },
      { path: 'backtest', element: <Backtest /> },
      { path: 'backtest/:sessionId', element: <BacktestSession /> },
      { path: '20-trades', element: <TwentyTrades /> },
      { path: 'checklist', element: <PreTradeChecklist /> },
      { path: 'calculator', element: <Calculator /> },
      { path: 'news', element: <News /> },
    ],
  },

  // --- 404: поза Layout, без сайдбара ---
  // path="*" спрацьовує на будь-який невідомий URL
  { path: '*', element: <NotFound /> },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}