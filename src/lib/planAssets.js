import { supabase } from './supabase';

/* ==================================================================
   Активи для перемикача плану.

   Це не довідник інструментів, а історія роботи: чим ти займався
   сьогодні і що пишеш регулярно. Тому джерело — таблиця планів,
   а не localStorage і не список бірж.
================================================================== */

export const NO_PAIR_LABEL = 'Без активу';

export const localDay = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Активи, по яких сьогодні вже є план */
export async function loadTodayPairs(userId, date = localDay()) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('trading_plans')
    .select('pair')
    .eq('user_id', userId)
    .eq('date', date);

  if (error || !data) return [];
  return [...new Set(data.map((r) => r.pair).filter((p) => p && p !== NO_PAIR_LABEL))];
}

/* Ті, по яких пишеш найчастіше. Беремо останні 200 планів — цього
   вистачає, щоб побачити звички, і не тягне пів бази. */
export async function loadFrequentPairs(userId, limit = 200) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('trading_plans')
    .select('pair, date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const counts = new Map();
  data.forEach((r) => {
    const p = r.pair;
    if (!p || p === NO_PAIR_LABEL) return;
    counts.set(p, (counts.get(p) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([symbol, count]) => ({ symbol, count }));
}
