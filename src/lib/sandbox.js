/* ==================================================================
   Режими, у яких застосунок працює не з власною базою людини.

   Їх два: демо (/demo/*) і перегляд чужого журналу за посиланням
   (/view/<токен>/*). В обох ті самі сторінки й той самий Layout, а
   різниця — у клієнті бази, який підставляє lib/supabase.js.

   Обидва визначаються адресою, а не прапорцем у сховищі: прапорець
   можна забути погасити, і тоді власний журнал почав би показувати
   чужі угоди. Адреса такого не пробачає.
================================================================== */

const path = () => (typeof window !== 'undefined' ? window.location.pathname : '');

/* Токен — 32 hex-символи з бази. Ширший набір лишено на випадок, якщо
   формат колись зміниться: розбір адреси не має ламати старі посилання. */
const VIEW_RE = /^\/view\/([A-Za-z0-9_-]{16,64})(?=\/|$)/;

export const shareToken = () => VIEW_RE.exec(path())?.[1] || null;
export const isSharedView = () => shareToken() !== null;
export const isDemoPath = () => path().startsWith('/demo');
export const inSandbox = () => isDemoPath() || isSharedView();

/* Префікс, під яким живуть сторінки поточного режиму. */
export const sandboxBase = () => {
  if (isDemoPath()) return '/demo';
  const t = shareToken();
  return t ? `/view/${t}` : '';
};

export const withSandbox = (to) => `${sandboxBase()}${to}`;

/* Розділи, доступні гостю за посиланням. Рівно те, що людина вирішила
   показати: журнал, аналітика, аналізи. План відкривається з аналізів,
   тому маршрут на нього є, але пунктом меню він не стоїть. */
export const VIEW_ROUTES = ['/journal', '/analytics', '/analyses'];

export const shareUrl = (token) =>
  `${typeof window !== 'undefined' ? window.location.origin : ''}/view/${token}/journal`;
