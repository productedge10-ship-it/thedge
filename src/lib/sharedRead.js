import { supabase } from './supabase';

/* ==================================================================
   Читання поширеного запису (угода, план, розбір, бектест, картка).

   Лише через функції бази за id (shared_trade, shared_plan, …): вони
   віддають один запис і тільки ті поля, які показує спільна сторінка.
   Прямий select по таблиці з is_public дозволяв вивантажити всі
   поширені записи всіх людей разом із приватними полями.

   Запасний шлях — старий прямий запит — лише на час, поки SQL-міграція
   2026-09-26_shared_by_id ще не виконана: тоді функції в базі немає
   (PGRST202), і сторінка має працювати як раніше, а не ламатись.
================================================================== */
export async function readShared(fn, id, fallback) {
  const { data, error } = await supabase.rpc(fn, { p_id: id });
  if (!error) return data ?? null;
  const missingFn = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
  if (missingFn && fallback) return fallback();
  /* Кривий id (не uuid) — просто «немає такого», а не збій. */
  if (error.code === '22P02') return null;
  throw error;
}
