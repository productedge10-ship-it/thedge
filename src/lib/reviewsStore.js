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
    description: row.mistake_description || 'Помилка без опису.',
    cost: Number(lost.toFixed(2)),
  };
};

const toPlan = (row) => ({
  id: row.id,
  date: row.date,
  pair: row.pair,
  narrative: row.narrative || '',
  status: row.plan_data?.sessionRating > 0 ? 'Розібрано' : 'Без розбору',
  text: row.plan_data?.planText || row.plan_data?.conclusionsText || '',
});

/* ---------- матеріал за період ---------- */

export async function loadMaterial(userId, from, to) {
  if (!userId) return { trades: [], plans: [], mistakes: [] };

  const [tradesRes, plansRes] = await Promise.all([
    supabase
      .from('trades')
      .select('id, plan_date, plan_pair, type, result, rr, session, followed_plan, rushed, trade_description, has_mistake, mistake_description, mistake_category')
      .eq('user_id', userId)
      .gte('plan_date', from)
      .lte('plan_date', to)
      .order('plan_date', { ascending: true }),

    supabase
      .from('trading_plans')
      .select('id, date, pair, narrative, plan_data')
      .eq('user_id', userId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true }),
  ]);

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
    .select('id, plan_date, plan_pair, result, rr, rushed, mistake_description, mistake_category')
    .eq('user_id', userId)
    .eq('has_mistake', true)
    .order('plan_date', { ascending: false })
    .limit(limit);

  return (data || []).map(toMistake);
}

/* ---------- самі розбори ---------- */

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
  promises: row.data?.promises || [],
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
