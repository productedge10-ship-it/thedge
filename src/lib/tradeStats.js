import { t as tx } from './lang';

/* Спільний підсумок угод для Журналу й Аналітики.

   Дві сторінки рахували ті самі угоди по-різному: Журнал ділив
   виграші на всі угоди (разом з BE і scratch), Аналітика — лише на
   виграші + програші; а net R Аналітика збирала тільки з WIN і LOSS,
   тож R беззбиткових угод, які насправді закрились трохи в мінус чи
   плюс (комісія, спред), у неї мовчки зникав. Трейдер бачив дві
   різні цифри для одного набору — і переставав вірити обом. Тепер
   рахує одна функція. */

/* У базі впереміш «Win» з ручної форми і «win»/«loss» з імпорту MT5,
   а Аналітика вже має свої WIN/LOSS/BE — тому зводимо до малих літер.
   scratch — це той самий «вийшов при своїх», окремого відра не треба. */
const OUTCOME = { win: 'win', lose: 'loss', loss: 'loss', be: 'be', scratch: 'be' };

export const outcomeOf = (result) => OUTCOME[String(result || '').trim().toLowerCase()] || null;

/* R буває рядком (старі записи, ручне введення) — тому parseFloat,
   а не перевірка typeof. Це сире число з бази, без знаку результату. */
export const rrOf = (t) => {
  const v = parseFloat(t?.rr);
  return Number.isFinite(v) ? v : 0;
};

/* R угоди зі знаком — ОДНЕ правило для Журналу, Аналітики, Рахунків і
   стартової сторінки.

   Угода з MT5 приходить з R, у якому знак уже є (термінал знає, скільки
   заробив чи втратив), — беремо як є, разом із дрібним плюсом чи мінусом
   беззбиткових угод (комісія, спред).

   У ручній угоді знак визначає результат, а число береться по модулю:
   Плюс → +|R|, Мінус → −|R|, Беззбиток → 0. Людина вводить «2.5» і
   обирає «Мінус» — це −2.5R, а не +2.5. Раніше сторінки читали це
   по-різному: Журнал і Аналітика сумували число як є, Рахунки й старт
   брали знак з результату (ще й рахували порожній мінус за −1R), і
   net R для тих самих угод розходився. */
export function signedR(t) {
  const v = rrOf(t);
  if (t?.source === 'mt5') return v;
  const o = outcomeOf(t?.result);
  if (o === 'win') return Math.abs(v);
  if (o === 'loss') return -Math.abs(v);
  if (o === 'be') return 0;
  return v;
}

/* Поля розбору — те, що відповідає людина, а не термінал. Той самий
   список захищає від синхронізації тригер trades_keep_user_date
   (supabase/2026-10-04_trades_reviewed_at.sql). */
export const REVIEW_FIELDS = [
  'followed_plan', 'rushed', 'has_mistake', 'mistake_category', 'mistake_description',
  'mistake_image', 'mistake_images', 'psy_confident', 'psy_fear', 'psy_repeat',
  'psy_revenge', 'psy_notes', 'trade_description',
];

/* Колонки для запитів, яким потрібне isReviewed без reviewed_at */
export const REVIEW_TRACE_COLUMNS =
  'source, followed_plan, has_mistake, rushed, mistake_category, psy_confident, psy_fear, psy_repeat, psy_revenge, psy_notes, trade_description';

const filled = (v) => typeof v === 'string' && v.trim() !== '';

/* Чи людина сама розібрала угоду.

   Відповідь — reviewed_at: його ставить застосунок, коли розбір
   збережено. До міграції 2026-10-04 цієї колонки немає (і в рядку
   немає ключа), тоді судимо зі слідів — тим самим правилом, яким
   міграція заповнює reviewed_at для старих угод:
   - ручна угода: на питання про план є відповідь (форма починає з
     порожнього);
   - угода з MT5: людина щось у ній змінила. Default true у followed_plan
     нічого не каже — імпорт ставив його сам, і журнал показував
     «100% за планом» тому, хто не відкрив жодної угоди. */
export function isReviewed(row) {
  if (!row) return false;
  if ('reviewed_at' in row) return !!row.reviewed_at;
  if (row.followed_plan === false || row.has_mistake || row.rushed || filled(row.mistake_category)
    || row.psy_confident || row.psy_fear || row.psy_revenge || row.psy_repeat) return true;
  if (row.source === 'mt5') return filled(row.psy_notes) || filled(row.trade_description);
  return row.followed_plan === true;
}

/* Запит з reviewed_at, а якщо міграцію ще не запустили — той самий
   без нього. Інакше до міграції весь журнал лишився б порожнім через
   одну відсутню колонку. `make(cols)` будує запит з переданого списку. */
export async function withReviewedAt(make, cols) {
  const res = await make(`${cols}, reviewed_at`);
  if (res.error && /reviewed_at/.test(res.error.message || '')) return make(cols);
  return res;
}

/* Менше розібраних угод — відсоток дисципліни й висновки про стан
   були б випадковістю, тож показуємо лише, скільки розібрано. */
export const REVIEW_MIN = 10;

/* Рахуємо до порогу, а не до всіх угод: «1 з 146» читалось як «розбери
   всі 146», хоча для аналізу досить десяти. */
export const reviewHint = (reviewed) => {
  const x = Math.min(reviewed || 0, REVIEW_MIN);
  const y = REVIEW_MIN - x;
  return tx(
    `Розібрано ${x} з ${REVIEW_MIN}. Ще ${y} ${y === 1 ? 'угода' : y >= 2 && y <= 4 ? 'угоди' : 'угод'} — і тут зʼявиться аналіз`,
    `Reviewed ${x} of ${REVIEW_MIN}. ${y} more ${y === 1 ? 'trade' : 'trades'} and the analysis appears here`,
  );
};

/* Колонки, яких до відповідних міграцій у базі немає. Запис з ними
   впав би цілком — і разом з однією новою колонкою загубились би всі
   інші правки угоди. Тому відсутню колонку відкидаємо й пишемо решту. */
const OPTIONAL_COLUMNS = ['reviewed_at', 'date_edited'];

export async function writeWithOptional(run, payload) {
  let body = { ...payload };
  for (let i = 0; i <= OPTIONAL_COLUMNS.length; i += 1) {
    const res = await run(body);
    const missing = res.error && OPTIONAL_COLUMNS.find((c) => c in body && (res.error.message || '').includes(c));
    if (!missing) return res;
    const { [missing]: _drop, ...rest } = body;
    body = rest;
  }
  return run(body);
}

export function tradeSummary(trades) {
  let wins = 0, losses = 0, be = 0, netR = 0;
  (trades || []).forEach((t) => {
    const o = outcomeOf(t.result);
    if (o === 'win') wins++;
    else if (o === 'loss') losses++;
    else if (o === 'be') be++;
    /* net R — з усіх закритих угод, включно з BE: це реальні гроші */
    netR += signedR(t);
  });
  const decided = wins + losses;
  return {
    total: (trades || []).length,
    wins, losses, be, decided,
    /* Вінрейт без BE: беззбиткова угода не виграш і не програш */
    winrate: decided ? Math.round((wins / decided) * 100) : 0,
    netR: Math.round(netR * 100) / 100,
  };
}
