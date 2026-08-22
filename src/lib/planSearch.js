import Fuse from 'fuse.js';
import { supabase } from './supabase';

/* ==================================================================
   Пошук по планах.

   Шукати треба не лише за активом, а за всім, що людина писала:
   bias, план на день, нотатки під кожним таймфреймом, факт, помилка,
   висновки. Тому будуємо легкий індекс — витягуємо з plan_data самі
   тексти по конкретних шляхах, не тягнучи base64-картинки. Інакше
   один запит важив би десятки мегабайт.

   Fuse дає нечіткий збіг: «євр» знайде EURUSD, «фвг» — «ФВГ» і «fvg»,
   а друкарська помилка не залишить людину без результату.
================================================================== */

/* Тексти беремо по індексах блоків — так картинки лишаються в базі */
const TEXT_FIELDS = [
  'id', 'date', 'pair', 'narrative',
  'planText:plan_data->>planText',
  'conclusions:plan_data->>conclusionsText',
  'actual:plan_data->>actualNarrative',
  'mistake:plan_data->>analysisMistakeText',
  'psyNotes:plan_data->>psyNotes',
  't0:plan_data->tdaBlocks->0->>text',
  't1:plan_data->tdaBlocks->1->>text',
  't2:plan_data->tdaBlocks->2->>text',
  't3:plan_data->tdaBlocks->3->>text',
  'tf0:plan_data->tdaBlocks->0->>tf',
  'tf1:plan_data->tdaBlocks->1->>tf',
  'tf2:plan_data->tdaBlocks->2->>tf',
  'tf3:plan_data->tdaBlocks->3->>tf',
  'r0:plan_data->reviewBlocks->0->>text',
  'r1:plan_data->reviewBlocks->1->>text',
].join(',');

export async function loadSearchIndex(userId, limit = 1000) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('trading_plans')
    .select(TEXT_FIELDS)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((r) => ({
    id: r.id,
    date: r.date,
    pair: r.pair || '',
    narrative: r.narrative || '',
    /* Усі вільні тексти зливаємо в одне поле — шукати по ньому
       дешевше, ніж тримати десяток окремих ключів */
    body: [
      r.planText, r.conclusions, r.actual, r.mistake, r.psyNotes,
      r.t0, r.t1, r.t2, r.t3, r.r0, r.r1,
    ].filter(Boolean).join('\n'),
    tf: [r.tf0, r.tf1, r.tf2, r.tf3].filter(Boolean).join(' '),
  }));
}

export function buildFuse(index) {
  return new Fuse(index, {
    /* Вага: актив важливіший за текст, але текст теж знаходиться */
    keys: [
      { name: 'pair', weight: 0.35 },
      { name: 'narrative', weight: 0.2 },
      { name: 'tf', weight: 0.1 },
      { name: 'body', weight: 0.35 },
      { name: 'date', weight: 0.1 },
    ],
    /* 0 — тільки точний збіг, 1 — будь-що. 0.38 прощає одну-дві
       помилки в слові, але не перетворює пошук на випадковість */
    threshold: 0.38,
    ignoreLocation: true,   // збіг у кінці довгого тексту теж рахується
    minMatchCharLength: 2,
    includeScore: true,
    useExtendedSearch: false,
  });
}

export function searchPlans(fuse, query, limit = 60) {
  if (!fuse || !query.trim()) return [];
  return fuse.search(query.trim(), { limit }).map((r) => ({ id: r.item.id, score: r.score }));
}
