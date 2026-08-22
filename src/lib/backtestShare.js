import { supabase } from './supabase';

/* ==================================================================
   Публічний доступ до бектесту.

   Логіка та сама, що в планів і розборів: доки власник не натиснув
   «поділитись», сесія закрита. Різниця лише в тому, що разом із
   сесією треба віддати і її угоди — інакше на публічній сторінці
   не буде ні кривої, ні статистики.
================================================================== */

export async function setBacktestPublic(userId, sessionId, isPublic) {
  const { data, error } = await supabase
    .from('backtest_sessions')
    .update({ is_public: isPublic })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* Коротке пояснення автора до публічної сторінки */
export async function setBacktestSummary(userId, sessionId, summary) {
  const { data, error } = await supabase
    .from('backtest_sessions')
    .update({ summary: summary?.trim() || null })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* Читання без user_id — спирається на політику is_public */
export async function loadPublicBacktest(sessionId) {
  const { data: session, error } = await supabase
    .from('backtest_sessions')
    .select('id, name, pair, strategy_name, initial_balance, summary, created_at')
    .eq('id', sessionId)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  const { data: trades, error: tErr } = await supabase
    .from('backtest_trades')
    .select('id, date, type, result, rr, notes, tda_data, screenshot_url, created_at')
    .eq('session_id', sessionId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true });

  if (tErr) throw tErr;

  return { session, trades: trades || [] };
}
