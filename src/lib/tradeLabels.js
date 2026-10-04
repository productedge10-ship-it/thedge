import { t as tx } from './lang';

/* Підписи значень угоди.

   У базі значення лишаються англійськими (Win/Lose, Long/Short, назви
   сесій) — на них стоять фільтри, статистика й імпорт MT5. Людина ж
   бачить їх своєю мовою, і словник один на обидві модалки угоди, щоб
   «Плюс» в одній не був «Тейком» в іншій. */

const RESULT = {
  win: tx('Плюс', 'Win'),
  lose: tx('Мінус', 'Loss'),
  loss: tx('Мінус', 'Loss'),
  be: tx('Беззбиток', 'Breakeven'),
  scratch: tx('Беззбиток', 'Breakeven'),
  'in progress': tx('В роботі', 'In progress'),
  open: tx('Відкрита', 'Open'),
  missed: tx('Пропущена', 'Missed'),
};

export const resultLabel = (v) => RESULT[String(v || '').trim().toLowerCase()] || v;

const DIRECTION = { long: tx('Лонг', 'Long'), short: tx('Шорт', 'Short') };

export const directionLabel = (v) => DIRECTION[String(v || '').trim().toLowerCase()] || v;

const SESSION = {
  asia: tx('Азія', 'Asia'),
  frankfurt: tx('Франкфурт', 'Frankfurt'),
  london: tx('Лондон', 'London'),
  'new york': tx('Нью-Йорк', 'New York'),
  'all day': tx('Весь день', 'All day'),
};

export const sessionLabel = (v) => SESSION[String(v || '').trim().toLowerCase()] || v;

/* Терміни трейдерів — англійською незалежно від мови сайту. Так їх
   пише термінал і так їх читають на графіку: «Лонг» чи «Плюс» на
   кнопці змушує перекладати назад у голові. Значення в базі ті самі. */
const RESULT_TERM = { win: 'TP', lose: 'SL', loss: 'SL', be: 'BE', scratch: 'BE' };
const RESULT_TERM_FULL = { TP: 'Take Profit', SL: 'Stop Loss', BE: 'Break-even' };

export const resultTerm = (v) => RESULT_TERM[String(v || '').trim().toLowerCase()] || v;
export const resultTermFull = (v) => RESULT_TERM_FULL[resultTerm(v)] || v;

const DIRECTION_TERM = { long: 'Long', short: 'Short' };
export const directionTerm = (v) => DIRECTION_TERM[String(v || '').trim().toLowerCase()] || v;

const SESSION_TERM = {
  asia: 'Asia', frankfurt: 'Frankfurt', london: 'London', 'new york': 'New York', 'all day': 'All day',
};
export const sessionTerm = (v) => SESSION_TERM[String(v || '').trim().toLowerCase()] || v;

/* Як закрилась позиція (exit_reason від воркера MT5). Тейк і стоп —
   ті самі TP / SL, що й у результаті, щоб у картці не було двох мов
   для одного факту; рішення людини — словом. */
const EXIT_REASON = {
  tp: () => 'TP',
  sl: () => 'SL',
  manual: () => tx('Вручну', 'Manual'),
  expert: () => tx('Радник', 'Expert'),
  stopout: () => 'Stop-out',
  other: () => tx('Інше', 'Other'),
};
export const exitReasonLabel = (v) => (EXIT_REASON[v] ? EXIT_REASON[v]() : v);
