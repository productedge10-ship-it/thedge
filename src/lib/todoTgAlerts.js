/* ==================================================================
   Нагадування про завдання → Telegram.

   Та сама черга `tg_alerts`, що й у новин: бот вичерпує її кожні
   30 секунд і не знає, звідки саме прийшов рядок. Тому тут не
   потрібно нічого міняти на VPS — лише покласти запис.

   Вибору «за скільки попередити» свідомо немає. Завдання на 10:30 —
   це нагадування о 10:30. Селектор із хвилинами тут виглядав би
   розумно, а насправді додавав би рішення там, де людина його вже
   прийняла, коли ставила час.

   Три речі, які вирішені саме так, а не інакше:

   1. Один рядок на завдання. Людина пересуває час туди-сюди — і
      кожна зміна має ПЕРЕЗАПИСАТИ нагадування, а не додати ще одне.
      Тримає це унікальний індекс по (user_id, source, source_id).

   2. Немає часу — немає нагадування. Завдання «колись» або
      «завтра будь-коли» неможливо нагадати вчасно: о котрій? Тому
      дзвіночок узагалі не показується без `dueTime`.

   3. Минулий момент прибирається, а не ставиться в чергу. Бот шле
      все, чий час `<= now()`, і нагадування про 10:30, поставлене
      об 11:00, прилетіло б миттєво — тобто виглядало б як поломка.
================================================================== */

import { supabase } from './supabase';

const SOURCE = 'todo';

/* Чи можна взагалі нагадати про це завдання. Одна функція на весь
   застосунок, щоб UI і запис у чергу не розходились у думці. */
export const canRemind = (task) => Boolean(task?.due && task?.dueTime && !task?.done);

/* Момент нагадування в UTC. `due` і `dueTime` людина ставила у своїй
   зоні, і рядок без зони браузер розбирає саме як локальний час —
   це тут і потрібно. */
export function remindAt(task) {
  if (!canRemind(task)) return null;
  const d = new Date(`${task.due}T${task.dueTime}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* Текст пишемо на фронті: бот — лише кур'єр для того, що лежить у
   черзі, і про завдання він не знає нічого. */
function message(task) {
  const text = String(task.text || '').trim() || 'Завдання';
  return `${text} — час.`;
}

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export async function dropTodoAlert(taskId) {
  const user = await uid();
  if (!user || !taskId) return;

  await supabase.from('tg_alerts')
    .delete()
    .eq('user_id', user)
    .eq('source', SOURCE)
    .eq('source_id', String(taskId));
}

/* Повертає true, якщо нагадування реально стало в чергу — сторінці
   це потрібно, щоб показати підтвердження тільки тоді, коли є що
   підтверджувати. */
export async function syncTodoAlert(task) {
  const user = await uid();
  if (!user || !task?.id) return false;

  const at = task.remind ? remindAt(task) : null;

  if (!at || at.getTime() <= Date.now()) {
    await dropTodoAlert(task.id);
    return false;
  }

  const { error } = await supabase.from('tg_alerts')
    .upsert({
      user_id: user,
      source: SOURCE,
      source_id: String(task.id),
      pair: 'TODO',
      message: message(task),
      alert_time: at.toISOString(),
      /* Скидаємо прапорець: якщо час переставили вже після того, як
         старе нагадування пішло, нове має піти теж. */
      is_sent: false,
    }, { onConflict: 'user_id,source,source_id' });

  return !error;
}

/* Чи є куди слати. Потрібно рівно для одного: чесно сказати в
   підтвердженні, що бот не підключений. Мовчазне «нагадаємо», яке
   нікуди не прийде, гірше за відсутність кнопки. */
export async function telegramLinked() {
  const user = await uid();
  if (!user) return false;

  const { data } = await supabase.from('user_settings')
    .select('tg_chat_id')
    .eq('user_id', user)
    .maybeSingle();

  return Boolean(data?.tg_chat_id);
}
