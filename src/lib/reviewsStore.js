import { supabase } from './supabase';

/* ==================================================================
   Розбори в базі + матеріал, з якого вони збираються.

   Матеріал не дублюється: угоди й плани лежать у своїх таблицях,
   а розбір зберігає лише id обраного. Помилки теж не окрема сутність
   — це угоди з позначкою has_mistake. Так статистика розбору завжди
   збігається зі статистикою журналу, а не живе окремим життям.
================================================================== */

/* ---------- перетворення угоди журналу у формат розбору ---------- */

const RESULT_MAP = {
  Win: 'WIN', Lose: 'LOSS', BE: 'BE',
  WIN: 'WIN', LOSS: 'LOSS',
};

/* Скріни лежать двома полями: старим одиничним і новим масивом.
   Беремо масив, а одиничне — як запасний варіант для давніх записів. */
const numOrNull = (v) => {
  if (v == null || v === '') return null;
  /* Порожній рядок після чистки — це «цифр не було взагалі». Без цієї
     перевірки Number('') повертає 0, і «абв» перетворювалось на ризик
     у нуль відсотків. */
  const cleaned = String(v).replace(',', '.').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const imagesOf = (arr, single) => {
  const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
  if (list.length) return list;
  return single ? [single] : [];
};

const toTrade = (row) => ({
  id: row.id,
  date: row.plan_date,
  pair: row.plan_pair,
  type: (row.type || '').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG',
  result: RESULT_MAP[row.result] || 'BE',
  rr: Number(row.rr) || 0,
  session: row.session || '',
  followedPlan: row.followed_plan !== false,
  note: row.trade_description || '',

  /* Далі — те, що потрібне лише у вікні перегляду. У списку воно не
     показується, але тягнеться тим самим запитом: окремий похід у
     базу на кожен відкритий рядок дав би затримку там, де її можна
     не мати. */
  account: row.account_name || '',
  /* Ризик у базі буває і числом, і рядком на кшталт «1,5» чи «1%» —
     поле заповнювали руками. Number() на такому дає NaN, і у вікні
     чесно зʼявлялось «NaN%». Витягуємо число, а якщо його там немає,
     лишаємо null: краще не показати поле, ніж показати сміття. */
  risk: numOrNull(row.risk),
  setup: row.setup || '',
  entryTime: row.entry_time || '',
  exitTime: row.exit_time || '',
  rushed: !!row.rushed,
  psy: {
    confident: !!row.psy_confident,
    fear: !!row.psy_fear,
    repeat: !!row.psy_repeat,
    revenge: !!row.psy_revenge,
  },
  images: imagesOf(row.trade_images, row.trade_image),
  psyNotes: row.psy_notes || '',
  createdAt: row.created_at || '',

  /* Помилка живе в тій самій угоді. У вкладці «Помилки» вона окремим
     рядком, але у вікні самої угоди ховати її безглуздо: людина
     дивиться на угоду саме тому, що з нею щось пішло не так. */
  hasMistake: !!row.has_mistake,
  mistakeType: row.mistake_category || '',
  mistakeText: row.mistake_description || '',
  mistakeImages: imagesOf(row.mistake_images, row.mistake_image),
});

/* Помилка = угода, у якій трейдер сам це визнав. Ціна помилки —
   мінус, який вона реально коштувала. */
const toMistake = (row) => {
  const r = Number(row.rr) || 1;
  const lost = (RESULT_MAP[row.result] || 'BE') === 'LOSS' ? -Math.abs(r) : 0;
  return {
    id: row.id,
    date: row.plan_date,
    pair: row.plan_pair,
    type: row.mistake_category || 'no_plan',
    severity: row.rushed ? 'high' : 'mid',
    description: row.mistake_description || '',
    cost: Number(lost.toFixed(2)),

    session: row.session || '',
    rushed: !!row.rushed,
    followedPlan: row.followed_plan !== false,
    note: row.trade_description || '',
    images: imagesOf(row.mistake_images, row.mistake_image),
    psyNotes: row.psy_notes || '',
    psy: {
      confident: !!row.psy_confident,
      fear: !!row.psy_fear,
      repeat: !!row.psy_repeat,
      revenge: !!row.psy_revenge,
    },
  };
};

const toPlan = (row) => {
  const d = row.plan_data || {};
  return {
    id: row.id,
    date: row.date,
    pair: row.pair,
    narrative: row.narrative || '',
    status: d.sessionRating > 0 ? 'Розібрано' : 'Без розбору',
    text: d.planText || d.conclusionsText || '',

    /* Для вікна перегляду. actualNarrative — те, що ринок зробив
       насправді: різниця з narrative і є найцікавішим у плані. */
    actualNarrative: d.actualNarrative || '',
    category: d.category || '',
    rating: Number(d.sessionRating) || 0,
    conclusions: d.conclusionsText || '',
    title: d.title || '',
    isPublic: !!row.is_public,
    createdAt: row.created_at || '',

    /* analysisMistake — прапорець «в аналізі була помилка», а текст
       лежить окремо в analysisMistakeText. Раніше я брав сам прапорець
       як текст, і блок мовчки не малювався: React не виводить boolean. */
    analysisMistake: d.analysisMistake ? (d.analysisMistakeText || 'Помилка в аналізі позначена, без опису.') : '',

    /* Розбір по таймфреймах — головний зміст плану. Це те, заради чого
       план узагалі відкривають повторно. */
    tda: Array.isArray(d.tdaBlocks) ? d.tdaBlocks.filter((b) => b?.text) : [],
    review: Array.isArray(d.reviewBlocks) ? d.reviewBlocks.filter((b) => b?.text) : [],
    updates: Array.isArray(d.updates) ? d.updates : [],
    quiz: d.quiz && typeof d.quiz === 'object' ? d.quiz : null,
    psy: {
      confident: !!d.psyConfident,
      fear: !!d.psyFear,
      repeat: !!d.psyRepeatTrade,
      revenge: !!d.psyRevenge,
    },
    psyNotes: d.psyNotes || '',
  };
};

/* ---------- матеріал за період ---------- */

export async function loadMaterial(userId, from, to) {
  if (!userId) return { trades: [], plans: [], mistakes: [] };

  const [tradesRes, plansRes] = await Promise.all([
    supabase
      .from('trades')
      .select(`
        id, plan_date, plan_pair, type, result, rr, risk, session, setup,
        entry_time, exit_time, account_name,
        followed_plan, rushed, trade_description,
        psy_confident, psy_fear, psy_repeat, psy_revenge,
        has_mistake, mistake_description, mistake_category,
        mistake_image, mistake_images,
        trade_image, trade_images, psy_notes, created_at
      `)
      .eq('user_id', userId)
      .gte('plan_date', from)
      .lte('plan_date', to)
      .order('plan_date', { ascending: true }),

    supabase
      .from('trading_plans')
      .select('id, date, pair, narrative, plan_data, is_public, created_at')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true }),
  ]);

  /* Помилку запиту не ковтаємо.

     Раніше тут стояло `data || []`, і будь-який збій — від політики
     доступу до друкарської помилки в назві колонки — виглядав однаково:
     «за цей період нічого немає». Сторінка вже вміє показати тост про
     невдале завантаження, їй просто ніхто не давав шансу: без throw
     обіцянка завжди виконувалась успішно з порожнім результатом. */
  const failed = tradesRes.error || plansRes.error;
  if (failed) throw new Error(failed.message || 'не вдалось прочитати матеріал');

  const tradeRows = tradesRes.data || [];

  return {
    trades: tradeRows.map(toTrade),
    mistakes: tradeRows.filter((r) => r.has_mistake).map(toMistake),
    plans: (plansRes.data || []).map(toPlan),
  };
}

/* Помилки за весь час — потрібні, щоб показати, що повторюється
   не вперше. Тягнемо тільки те, що дійсно позначене помилкою. */
export async function loadAllMistakes(userId, limit = 500) {
  if (!userId) return [];
  const { data } = await supabase
    .from('trades')
    .select('id, plan_date, plan_pair, result, rr, rushed, session, followed_plan, trade_description, mistake_description, mistake_category, mistake_image, mistake_images, psy_notes, psy_confident, psy_fear, psy_repeat, psy_revenge')
    .eq('user_id', userId)
    .eq('has_mistake', true)
    .order('plan_date', { ascending: false })
    .limit(limit);

  return (data || []).map(toMistake);
}

/* ---------- самі розбори ---------- */

/* Домовленості приводимо до одного вигляду.

   Застосунок пише їх обʼєктами {text, done}, а демо-наповнення (і
   старі записи) — просто рядками. Читалка чекала обʼєкт, тому на
   таких розборах показувала три порожні рядки з галочками: текст
   лежав там, де його ніхто не шукав. Нормалізуємо на вході, щоб далі
   форму даних розбирати не доводилось. */
const toPromise = (p) =>
  (typeof p === 'string' ? { text: p, done: false } : { text: p?.text || '', done: !!p?.done });

const fromRow = (row) => ({
  id: row.id,
  from: row.period_from,
  to: row.period_to,
  score: row.score || 0,
  lesson: row.lesson || '',
  isPublic: !!row.is_public,
  createdAt: row.created_at,
  emotions: row.data?.emotions || [],
  answers: row.data?.answers || {},
  promises: (row.data?.promises || []).map(toPromise),
  /* Скріни до відповідей: { worked: [{src,name}], broke: [...] } */
  shots: row.data?.shots || {},
  stats: row.data?.stats || {},
  evidence: row.data?.evidence || { trades: [], plans: [], mistakes: [] },
});

const toRow = (review, userId) => ({
  user_id: userId,
  period_from: review.from,
  period_to: review.to,
  score: review.score || 0,
  lesson: review.lesson || '',
  data: {
    emotions: review.emotions || [],
    answers: review.answers || {},
    promises: review.promises || [],
    shots: review.shots || {},
    stats: review.stats || {},
    evidence: review.evidence || { trades: [], plans: [], mistakes: [] },
  },
});

export async function loadReviews(userId, limit = 200) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('trader_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('period_to', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(fromRow);
}

export async function createReview(userId, review) {
  const { data, error } = await supabase
    .from('trader_reviews')
    .insert([toRow(review, userId)])
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function updateReview(userId, id, review) {
  const { data, error } = await supabase
    .from('trader_reviews')
    .update(toRow(review, userId))
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function deleteReview(userId, id) {
  const { error } = await supabase
    .from('trader_reviews')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

/* Відкрити чи закрити публічний доступ */
export async function setReviewPublic(userId, id, isPublic) {
  const { data, error } = await supabase
    .from('trader_reviews')
    .update({ is_public: isPublic })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

/* Публічне читання — без user_id, спирається на політику is_public */
export async function loadPublicReview(id) {
  const { data, error } = await supabase
    .from('trader_reviews')
    .select('id, period_from, period_to, score, lesson, data, created_at')
    .eq('id', id)
    .eq('is_public', true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return fromRow({ ...data, is_public: true });
}
