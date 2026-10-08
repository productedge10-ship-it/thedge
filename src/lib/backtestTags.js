import { t as tx } from './lang';

/* ==================================================================
   Емоції й помилки угоди бектесту.

   Сетапи живуть у tda_data.tags (так їх уже читає журнал і таблиця),
   а емоції й помилки — окремо: tda_data.emotions і tda_data.mistakes.
   Зберігаємо стабільні id, а підпис беремо мовою інтерфейсу — інакше
   звіт поділив би «Страх» і «Fear» на дві різні емоції.
================================================================== */

export const EMOTIONS = [
  { id: 'calm', uk: 'Спокій', en: 'Calm', tone: 'ok' },
  { id: 'confident', uk: 'Впевненість', en: 'Confident', tone: 'ok' },
  { id: 'doubt', uk: 'Сумнів', en: 'Doubt', tone: 'warn' },
  { id: 'fear', uk: 'Страх', en: 'Fear', tone: 'bad' },
  { id: 'greed', uk: 'Жадібність', en: 'Greed', tone: 'bad' },
  { id: 'fomo', uk: 'FOMO', en: 'FOMO', tone: 'bad' },
  { id: 'impatience', uk: 'Нетерпіння', en: 'Impatience', tone: 'bad' },
  { id: 'revenge', uk: 'Відігратись', en: 'Revenge', tone: 'bad' },
];

export const MISTAKES = [
  { id: 'early_entry', uk: 'Ранній вхід', en: 'Early entry' },
  { id: 'late_entry', uk: 'Пізній вхід', en: 'Late entry' },
  { id: 'no_setup', uk: 'Без сетапу', en: 'No setup' },
  { id: 'counter_trend', uk: 'Проти тренду', en: 'Against trend' },
  { id: 'moved_sl', uk: 'Посунув стоп', en: 'Moved stop' },
  { id: 'early_exit', uk: 'Рано закрив', en: 'Closed early' },
  { id: 'held_loser', uk: 'Тримав збиток', en: 'Held a loser' },
  { id: 'news', uk: 'Новини', en: 'News' },
];

export const emotionLabel = (id) => { const e = EMOTIONS.find((x) => x.id === id); return e ? tx(e.uk, e.en) : id; };
export const mistakeLabel = (id) => { const e = MISTAKES.find((x) => x.id === id); return e ? tx(e.uk, e.en) : id; };

/* Тег, який графік ставить кожній своїй угоді, — не сетап. */
export const CHART_TAGS = ['Реальний графік', 'Real chart'];
export const setupsOfTags = (tags) => (tags || []).filter((t) => !CHART_TAGS.includes(t));
