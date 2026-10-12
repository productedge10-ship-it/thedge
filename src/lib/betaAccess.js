import { useAuth } from '../context/AuthContext';

/* ==================================================================
   Закритий доступ до бектестів.

   Бектест на графіку ще в тестуванні: бачать його лише ці пошти.
   Решті розділ зникає з меню, плитка — з Лаунчпада, а прямий перехід
   за адресою веде на головну.

   Це клієнтська перевірка — вона вирішує, ЩО показати. Дані в базі
   вона не охороняє: для цього потрібна політика RLS на
   backtest_sessions / backtest_trades (див. supabase/2026-10-08_backtest_beta.sql).
================================================================== */
export const BETA_EMAILS = ['h1f3st@gmail.com', 'andreejdhh@gmail.com', 'zozuk.ruslana2006@gmail.com'];

export const BETA_ROUTES = ['/backtest'];

/* true — бектести відкриті всім (платний доступ лишається через підписку). false — лише BETA_EMAILS. */
export const BETA_OPEN = true;

export const isBetaEmail = (email) => BETA_OPEN || !!email && BETA_EMAILS.includes(String(email).trim().toLowerCase());

export const useBetaAccess = () => {
  const { user } = useAuth();
  return isBetaEmail(user?.email);
};
