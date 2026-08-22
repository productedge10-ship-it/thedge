import { supabase } from './supabase';
import { flagsFromReasons, reasonsFromFlags, catsFromReasons } from '../components/errors/utils';

/* ==================================================================
   Журнал помилок у базі.

   Було: масив у localStorage поверх демо-прикладів. Виходило погано
   двічі — на новому пристрої людина бачила чужі помилки замість
   своїх, а чистка кешу зносила все написане.

   Стало: таблиця `trade_errors` з RLS. Пишемо по одному запису:
   помилки додають по одній, а ганяти весь список на кожне
   збереження — це і зайвий трафік, і шанс затерти те, що прилетіло
   з іншого пристрою.
================================================================== */

export const LEGACY_KEY = 'tj-errorlog-v1';
const MIGRATED_KEY = 'edge_errors_migrated_v1';

export const uid = () => (
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
);

export const todayISO = () => {
  /* Локальна дата, а не UTC: увечері toISOString віддає вчорашній день */
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* ---------- база ↔ застосунок ----------
   Форму запису на сторінці не чіпаємо: компоненти вже вміють читати
   date/desc/tvLink, і переписувати їх заради назв колонок означало б
   правити півдесятка файлів без жодної користі. */

const toApp = (row) => ({
  id: row.id,
  pair: row.pair || '',
  date: row.error_date || todayISO(),
  cats: Array.isArray(row.cats) ? row.cats : [],
  desc: row.description || '',
  tvLink: row.tv_link || undefined,
  /* Записи, зроблені до появи списку причин, тримали чотири головні
     окремими прапорцями. Показуємо їх причинами, інакше стара
     помилка виглядає так, ніби її не розбирали. */
  reasons: Array.isArray(row.reasons) && row.reasons.length
    ? row.reasons
    : reasonsFromFlags(row),
  followedPlan: !!row.followed_plan,
  rushed: !!row.rushed,
  /* null тут значуще — «не відповідав», а не «ні» */
  bySystem: row.by_system ?? null,
  riskOk: row.risk_ok ?? null,
  tradeId: row.trade_id || null,
  source: row.source || 'manual',
  resolved: !!row.resolved,
});

const toRow = (e, userId) => {
  const row = {
    id: e.id,
    user_id: userId,
    pair: (e.pair || '').toUpperCase(),
    description: e.desc || '',
    /* Категорію більше не питають окремо — виводимо її з причин.
       Явно передана має пріоритет: дзеркало помилки з угоди рахує
       свою з психоблоку, і воно точніше. */
    cats: e.cats?.length ? e.cats : catsFromReasons(e.reasons),
    tv_link: e.tvLink || '',
    reasons: e.reasons || [],
    /* Чотири головні дублюються в окремі колонки: по них рахується
       статистика розділу, а виймати їх з jsonb на кожен підрахунок —
       і повільно, і незручно для майбутніх запитів на боці бази. */
    ...flagsFromReasons(e.reasons),
    error_date: e.date || todayISO(),
    trade_id: e.tradeId || null,
    source: e.source || 'manual',
    updated_at: new Date().toISOString(),
  };

  /* Стан розбору чіпаємо тільки якщо про нього спитали. Форма
     редагування помилки його не містить, і якби ми писали сюди
     `!!e.resolved`, то будь-яка правка тексту мовчки повертала б
     уже розібрану помилку назад у список справ. */
  if (e.resolved !== undefined) row.resolved = !!e.resolved;

  return row;
};

const SELECT = `id, pair, description, cats, tv_link, reasons, followed_plan, rushed,
  by_system, risk_ok, error_date, trade_id, source, resolved`;

/* ---------- читання ---------- */

export async function fetchErrors(userId) {
  const { data, error } = await supabase
    .from('trade_errors')
    .select(SELECT)
    .eq('user_id', userId)
    .order('error_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toApp);
}

/* ---------- запис ---------- */

export async function saveError(userId, entry) {
  const row = toRow(entry, userId);
  const { error } = await supabase.from('trade_errors').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return toApp(row);
}

export async function removeError(userId, id) {
  const { error } = await supabase.from('trade_errors').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function setErrorResolved(userId, id, resolved) {
  const { error } = await supabase
    .from('trade_errors')
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* ---------- помилка з угоди ----------

   Категорії не питаємо окремо: угода вже містить відповіді, з яких
   вони однозначно виводяться. Питати те саме вдруге — найшвидший
   спосіб зробити так, щоб перестали відповідати обидва рази.

   Порядок важливий: відігравання ставимо першим, бо саме воно
   найдорожче і має визначати колір картки. */
export function catsFromTrade(t) {
  const out = [];
  if (t.psy_revenge) out.push('revenge');
  if (t.rushed) out.push('haste');
  if (t.psy_fear) out.push('fear');
  if (t.psy_repeat) out.push('fomo');
  if (t.followed_plan === false) out.push('risk');
  return out.length ? out : ['haste'];
}

/* Дзеркалить помилку угоди в журнал помилок.

   Викликається на кожному збереженні угоди, тому має бути стійким до
   повторів: за унікальним індексом по trade_id один запис на угоду,
   а зняте «була помилка» прибирає дзеркало.

   Опис не перезаписуємо мовчки при кожному відкритті угоди — але
   якщо людина його змінила в угоді, зміна має доїхати сюди, інакше
   в журналі лишиться стара версія і два джерела правди. */
/* Що вже лежить у журналі по цій угоді. Потрібно формі угоди, щоб
   при відкритті показати розбір, який людина колись зробила, а не
   пропонувати заповнити його вдруге. */
export async function fetchErrorForTrade(userId, tradeId) {
  if (!userId || !tradeId) return null;

  const { data, error } = await supabase
    .from('trade_errors')
    .select(SELECT)
    .eq('user_id', userId)
    .eq('trade_id', tradeId)
    .maybeSingle();

  if (error || !data) return null;
  return toApp(data);
}

/* `draft` — те, що людина вибрала руками в детальному розборі.

   Без нього категорії виводились з угоди щоразу заново, і будь-яке
   наступне збереження угоди стирало ручний вибір. Виходило, що
   детальний розбір живе рівно до наступного дотику до угоди — тобто
   не живе взагалі.

   Тому руками вибране має пріоритет, а автоматичне лишається
   запасним варіантом для угод, які ніхто не розбирав. */
export async function syncErrorFromTrade(userId, trade, draft = null) {
  if (!userId || !trade?.id) return;

  const text = (trade.mistake_description || '').trim();

  if (!trade.has_mistake || !text) {
    /* Прибираємо тільки автоматичний запис: якщо людина завела
       помилку руками, вона не має зникати від того, що в угоді зняли
       галочку. */
    await supabase
      .from('trade_errors')
      .delete()
      .eq('user_id', userId)
      .eq('trade_id', trade.id)
      .eq('source', 'trade');
    return;
  }

  const { data: found } = await supabase
    .from('trade_errors')
    .select('id, resolved')
    .eq('user_id', userId)
    .eq('trade_id', trade.id)
    .maybeSingle();

  const cats = draft?.cats?.length ? draft.cats : catsFromTrade(trade);

  const row = {
    user_id: userId,
    pair: (draft?.pair || trade.plan_pair || '').toUpperCase(),
    description: text,
    cats,
    tv_link: draft?.tvLink || trade.trade_image || '',
    reasons: draft?.reasons || [],
    ...(draft?.reasons?.length
      ? flagsFromReasons(draft.reasons)
      : { followed_plan: !!trade.followed_plan, rushed: !!trade.rushed, by_system: null, risk_ok: null }),
    error_date: trade.plan_date || todayISO(),
    trade_id: trade.id,
    source: 'trade',
    updated_at: new Date().toISOString(),
  };

  if (found) {
    /* Стан розбору лишаємо як є: людина вже щось із цією помилкою
       робила, і правка тексту в угоді не привід повертати її в
       «не розібрано». */
    const { error } = await supabase.from('trade_errors').update(row).eq('id', found.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('trade_errors').insert([{ ...row, resolved: false }]);
  if (error) throw error;
}

/* ---------- помилка з плану дня ----------

   Пост-сесійна діагностика питає про помилку одразу після сесії —
   тобто тоді, коли людина ще пам'ятає, що саме сталось. Досі ця
   відповідь лишалась усередині плану того дня і не потрапляла
   нікуди: ні в стрічку журналу, ні в статистику, ні в тижневий
   розбір. Найчесніші записи писались туди, звідки їх ніхто не читав.

   Категорій діагностика не питає — і не має: три кроки після сесії
   мають лишатись трьома. Тому за замовчуванням ставимо 'risk'
   (порушення процесу), а точні категорії людина вибирає в детальному
   розборі, якщо захоче.
*/
export async function fetchErrorForPlan(userId, planId) {
  if (!userId || !planId) return null;

  const { data, error } = await supabase
    .from('trade_errors')
    .select(SELECT + ', plan_id')
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .maybeSingle();

  if (error || !data) return null;
  return toApp(data);
}

export async function syncErrorFromPlan(userId, plan, draft = null) {
  if (!userId || !plan?.id) return;

  const text = (plan.analysisMistakeText || '').trim();

  /* Немає помилки або немає опису — прибираємо дзеркало. Саму лише
     галочку в журнал не пускаємо: картка без тексту не піддається
     розбору, а місце в стрічці займає. */
  if (!plan.analysisMistake || !text) {
    await supabase
      .from('trade_errors')
      .delete()
      .eq('user_id', userId)
      .eq('plan_id', plan.id)
      .eq('source', 'plan');
    return;
  }

  const { data: found } = await supabase
    .from('trade_errors')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_id', plan.id)
    .maybeSingle();

  const row = {
    user_id: userId,
    pair: (draft?.pair || plan.pair || '').toUpperCase(),
    description: text,
    cats: draft?.cats?.length ? draft.cats : ['risk'],
    tv_link: draft?.tvLink || '',
    reasons: draft?.reasons || [],
    /* План — це і є заявка на дисципліну, тому «за планом» тут
       false: якщо в діагностиці визнано помилку процесу, план у цій
       частині не виконано. */
    ...{ ...flagsFromReasons(draft?.reasons), followed_plan: false },
    error_date: plan.date || todayISO(),
    plan_id: plan.id,
    source: 'plan',
    updated_at: new Date().toISOString(),
  };

  if (found) {
    const { error } = await supabase.from('trade_errors').update(row).eq('id', found.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('trade_errors').insert([{ ...row, resolved: false }]);
  if (error) throw error;
}

/* ---------- перенесення зі старого сховища ----------
   Одноразово: якщо в базі порожньо, а на цьому пристрої лишились
   записи з localStorage — переносимо їх. Людина, яка вже щось
   написала, не має побачити чистий аркуш після оновлення.

   Демо-приклади при цьому відсіюються: у них цілі числа замість
   id і вони прилетіли з коду, а не від користувача. */
export async function migrateLegacyErrors(userId, cloudCount) {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return [];

    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw || cloudCount > 0) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return [];
    }

    const rows = parsed.map((e) => toRow({ ...e, id: uid() }, userId));

    const { error } = await supabase.from('trade_errors').insert(rows);
    if (error) throw error;

    localStorage.setItem(MIGRATED_KEY, '1');
    return rows.map(toApp);
  } catch {
    /* не змогли перенести — не блокуємо роботу: старі дані лишаються
       в localStorage, спробу можна повторити наступного разу */
    return [];
  }
}
