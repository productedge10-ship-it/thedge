/* ==================================================================
   Новинні нагадування → Telegram.

   Дзвіночок у календарі досі жив тільки в браузері: сповіщення
   показувала сама вкладка, поки сайт відкритий. Це чесно працювало,
   але рівно доти, доки вкладка відкрита — а новина о 15:30 застає
   людину де завгодно, тільки не за цим екраном.

   Тепер той самий дзвіночок ще й кладе рядок у `tg_alerts` — чергу,
   яку бот на VPS вичерпує кожні 30 секунд. Жодних змін у боті для
   цього не потрібно: він уже вміє слати те, що там лежить.

   Дві речі, які тут вирішені:

   1. Один рядок на подію. Людина міняє час попередження туди-сюди —
      і кожна зміна має ПЕРЕЗАПИСАТИ нагадування, а не додати ще одне.
      Тримає це унікальний індекс по (user_id, source, source_id), а
      не перевірка в коді: перевірка програє гонці двох вкладок.

   2. Минулий час не ставимо. Якщо до новини лишилось менше, ніж
      людина просить попередити, рядок у черзі спрацював би миттєво —
      бот шле все, чий час `<= now()`. Нагадування «за 30 хвилин», яке
      прилітає через секунду, виглядає як поломка.
================================================================== */

import { supabase } from './supabase';

const SOURCE = 'news';

/* Текст пишемо тут, а не в боті: бот не знає ні назви події, ні
   валюти — він лише кур'єр для того, що лежить у черзі. */
function alertMessage(ev, lead) {
  const when = lead > 0 ? `через ${lead} хв` : 'зараз';
  return `${ev.title || 'Новина'} — ${when}.`;
}

async function uid() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/* Зняти дзвіночок. Викликається і при вимкненні, і перед кожним
   записом — щоб зміна часу не лишала по собі хвіст. */
export async function dropNewsAlert(eventId) {
  const user = await uid();
  if (!user || !eventId) return;

  await supabase.from('tg_alerts')
    .delete()
    .eq('user_id', user)
    .eq('source', SOURCE)
    .eq('source_id', String(eventId));
}

/* Повертає, що сталось: 'queued' | 'past' | 'off' | 'error'.
   Раніше функція просто мовчала, і випадок «момент уже минув»
   виглядав на екрані точнісінько як поломка: дзвіночок загорівся,
   а нагадування не прийшло й пояснити це було нічим. */
export async function syncNewsAlert(ev, lead) {
  const user = await uid();
  if (!user || !ev?.id || !ev?.at) return 'off';

  const at = ev.at instanceof Date ? ev.at : new Date(ev.at);
  if (Number.isNaN(at.getTime())) return 'off';

  const fireAt = new Date(at.getTime() - (Number(lead) || 0) * 60000);

  /* Момент уже минув — нагадувати нема про що. Рядок у черзі тут
     означав би миттєве повідомлення про подію, до якої лишилось менше
     часу, ніж людина просила. */
  if (fireAt.getTime() <= Date.now()) {
    await dropNewsAlert(ev.id);
    return 'past';
  }

  const { error } = await supabase.from('tg_alerts')
    .upsert({
      user_id: user,
      source: SOURCE,
      source_id: String(ev.id),
      pair: ev.ccy || 'NEWS',
      message: alertMessage(ev, Number(lead) || 0),
      alert_time: fireAt.toISOString(),
      /* Скидаємо прапорець: якщо людина переставила час уже після
         того, як старе нагадування пішло, нове має піти теж. */
      is_sent: false,
    }, { onConflict: 'user_id,source,source_id' });

  return error ? 'error' : 'queued';
}
