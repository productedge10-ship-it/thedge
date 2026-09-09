import { useCallback, useEffect, useState } from 'react';

/* ==================================================================
   БЛОГ — режим читання.

   Блог живе за власними кольорами, а не за темою застосунку, і це
   свідомо. Застосунок — робочий інструмент, там тема одна на весь
   інтерфейс. Блог читають довго й підряд, тому тут вибір ближчий до
   читалки: чорне тло вночі, біле вдень, паперове для довгого тексту.

   Технічно теми — це набори CSS-змінних, які вішаються на корінь
   блогу, а не на :root. Через це блог не може випадково перефарбувати
   застосунок, а застосунок не перефарбовує блог: дві системи стоять
   поруч і не перетинаються.

   Усі налаштування зберігаються одним об'єктом в localStorage.
   Людина, яка збільшила шрифт у першій статті, не має робити це
   вдруге в другій.
================================================================== */

export const READER_THEMES = [
  { id: 'dark', label: { uk: 'Темна', ru: 'Тёмная', en: 'Dark' } },
  { id: 'light', label: { uk: 'Світла', ru: 'Светлая', en: 'Light' } },
  { id: 'book', label: { uk: 'Книжкова', ru: 'Книжная', en: 'Paper' } },
];

/* ------------------------------------------------------------------
   Палітри.

   Темна повторює лендінг — людина приходить із головної, і різкий
   стрибок кольору читався б як інший сайт.

   Світла й книжкова зроблені з переданої палітри: FFFEF5, FAF5FF,
   EDE6D9, CFE9F9, AFAFE2. Пастель гарна на тлі, але як колір тексту
   вона не читається взагалі, тому текст і акцент беруться глибші —
   інакше довгий абзац перетворюється на туман. Це те саме правило,
   що вже діє в темах застосунку: світла тема не інверсія темної.
------------------------------------------------------------------ */
const PALETTES = {
  dark: {
    '--bl-bg': '#08080c',
    '--bl-bg2': '#0b0b10',
    '--bl-surface': '#0e0e14',
    '--bl-surface-hi': '#14141c',
    '--bl-line': 'rgba(255,255,255,.09)',
    '--bl-line-soft': 'rgba(255,255,255,.05)',
    '--bl-text': '#ececf5',
    '--bl-text2': '#c2c2d2',
    '--bl-text3': '#9a9aad',
    '--bl-text4': '#6c6c80',
    '--bl-acc': '#8b7bff',
    '--bl-acc-text': '#a99cff',
    '--bl-acc-soft': 'rgba(139,123,255,.12)',
    '--bl-acc-line': 'rgba(139,123,255,.34)',
    '--bl-acc-line-hi': 'rgba(139,123,255,.5)',
    '--bl-on-acc': '#0a0a0c',
    '--bl-btn-bg': '#17151f',
    '--bl-btn-bg-hi': '#1c1a26',
    '--bl-ok': '#2fbf8f',
    '--bl-ok-soft': 'rgba(47,191,143,.12)',
    '--bl-warn': '#f5a33b',
    '--bl-warn-soft': 'rgba(245,163,59,.12)',
    '--bl-shadow': '0 24px 60px -34px rgba(0,0,0,.9)',
    '--bl-cover-fade': 'rgba(8,8,12,.55)',
    '--bl-mark': 'rgba(139,123,255,.22)',
    '--bl-scrim': 'rgba(8,8,12,.72)',
  },

  light: {
    '--bl-bg': '#faf5ff',
    '--bl-bg2': '#f3edfb',
    '--bl-surface': '#ffffff',
    '--bl-surface-hi': '#fbf8ff',
    '--bl-line': 'rgba(38,30,70,.12)',
    '--bl-line-soft': 'rgba(38,30,70,.07)',
    '--bl-text': '#191725',
    '--bl-text2': '#413d55',
    '--bl-text3': '#645f7d',
    '--bl-text4': '#8b86a3',
    '--bl-acc': '#5a48d6',
    '--bl-acc-text': '#5136c9',
    '--bl-acc-soft': 'rgba(175,175,226,.28)',
    '--bl-acc-line': 'rgba(90,72,214,.28)',
    '--bl-acc-line-hi': 'rgba(90,72,214,.42)',
    '--bl-on-acc': '#ffffff',
    '--bl-btn-bg': '#ffffff',
    '--bl-btn-bg-hi': '#f1ebfd',
    '--bl-ok': '#128a63',
    '--bl-ok-soft': 'rgba(18,138,99,.10)',
    '--bl-warn': '#a56414',
    '--bl-warn-soft': 'rgba(165,100,20,.10)',
    '--bl-shadow': '0 18px 44px -30px rgba(41,30,86,.45)',
    '--bl-cover-fade': 'rgba(250,245,255,.55)',
    '--bl-mark': 'rgba(207,233,249,.85)',
    '--bl-scrim': 'rgba(250,245,255,.75)',
  },

  book: {
    '--bl-bg': '#ede6d9',
    '--bl-bg2': '#e6ddcd',
    '--bl-surface': '#fffef5',
    '--bl-surface-hi': '#fffdf0',
    '--bl-line': 'rgba(74,58,36,.18)',
    '--bl-line-soft': 'rgba(74,58,36,.10)',
    '--bl-text': '#231e17',
    '--bl-text2': '#4a4136',
    '--bl-text3': '#6d6152',
    '--bl-text4': '#948674',
    '--bl-acc': '#584bb0',
    '--bl-acc-text': '#4c3fa6',
    '--bl-acc-soft': 'rgba(175,175,226,.30)',
    '--bl-acc-line': 'rgba(88,75,176,.30)',
    '--bl-acc-line-hi': 'rgba(88,75,176,.45)',
    '--bl-on-acc': '#fffef5',
    '--bl-btn-bg': '#fffef5',
    '--bl-btn-bg-hi': '#f7f1e2',
    '--bl-ok': '#3f7a4e',
    '--bl-ok-soft': 'rgba(63,122,78,.12)',
    '--bl-warn': '#96591a',
    '--bl-warn-soft': 'rgba(150,89,26,.12)',
    '--bl-shadow': '0 16px 40px -30px rgba(60,45,20,.55)',
    '--bl-cover-fade': 'rgba(237,230,217,.55)',
    '--bl-mark': 'rgba(207,233,249,.80)',
    '--bl-scrim': 'rgba(237,230,217,.78)',
  },
};

/* ------------------------------------------------------------------
   Шкали.

   Кожна — рівно чотири-три позиції. Повзунок із двадцятьма
   значеннями виглядає щедро, але людина крутить його раз, а потім
   ніколи не знає, де було добре.
------------------------------------------------------------------ */
export const FONT_SIZES = [
  { id: 'sm', px: 16.5, label: 'A' },
  { id: 'md', px: 18.5, label: 'A' },
  { id: 'lg', px: 20.5, label: 'A' },
  { id: 'xl', px: 22.5, label: 'A' },
];

export const FAMILIES = [
  { id: 'sans', label: { uk: 'Без засічок', ru: 'Без засечек', en: 'Sans' } },
  { id: 'serif', label: { uk: 'З засічками', ru: 'С засечками', en: 'Serif' } },
];

export const WIDTHS = [
  { id: 'narrow', px: 660, label: { uk: 'Вузько', ru: 'Узко', en: 'Narrow' } },
  { id: 'normal', px: 780, label: { uk: 'Норма', ru: 'Норма', en: 'Normal' } },
  { id: 'wide', px: 940, label: { uk: 'Широко', ru: 'Широко', en: 'Wide' } },
];

export const LEADINGS = [
  { id: 'tight', value: 1.6, label: { uk: 'Щільно', ru: 'Плотно', en: 'Tight' } },
  { id: 'normal', value: 1.75, label: { uk: 'Норма', ru: 'Норма', en: 'Normal' } },
  { id: 'airy', value: 1.95, label: { uk: 'Просторо', ru: 'Просторно', en: 'Airy' } },
];

export const DEFAULT_PREFS = {
  theme: 'dark',
  size: 'md',
  family: 'sans',
  width: 'normal',
  leading: 'normal',
};

const KEY = 'edge_blog_reader';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* приватний режим або зіпсований запис — читаємо за замовчуванням */
    return DEFAULT_PREFS;
  }
};

/* ------------------------------------------------------------------
   Гарнітура з засічками.

   Вантажиться лише тоді, коли її обрали: більшість читає без
   засічок, і тягнути кириличний serif усім заради меншості — це
   зайві сто кілобайт на кожному відкритті статті.

   Georgia в резерві не випадково: вона є в системі майже скрізь і
   має кирилицю, тому текст не стрибає, поки Literata їде.
------------------------------------------------------------------ */
export const SERIF_STACK = "'Literata', Georgia, 'Times New Roman', serif";

const ensureSerif = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('edge-blog-serif')) return;
  const link = document.createElement('link');
  link.id = 'edge-blog-serif';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600;7..72,700&display=swap&subset=cyrillic,latin';
  document.head.append(link);
};

/* ------------------------------------------------------------------
   Хук налаштувань.

   Повертає готовий об'єкт стилів із CSS-змінними: сторінка вішає
   його на свій корінь і більше нічого про теми не знає.
------------------------------------------------------------------ */
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState(read);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* приватний режим */ }
  }, [prefs]);

  useEffect(() => {
    if (prefs.family === 'serif') ensureSerif();
  }, [prefs.family]);

  const setPref = useCallback((k, v) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), []);

  return { prefs, setPref, reset };
}

/* Змінні теми окремо від змінних тексту: список статей фарбується
   темою, але розміром шрифту статті не керує. */
export const themeVars = (themeId) => PALETTES[themeId] || PALETTES.dark;

export const textVars = (prefs) => {
  const size = FONT_SIZES.find((s) => s.id === prefs.size) || FONT_SIZES[1];
  const width = WIDTHS.find((w) => w.id === prefs.width) || WIDTHS[1];
  const lead = LEADINGS.find((l) => l.id === prefs.leading) || LEADINGS[1];
  return {
    '--bl-fs': `${size.px}px`,
    '--bl-measure': `${width.px}px`,
    '--bl-lh': String(lead.value),
    '--bl-family': prefs.family === 'serif'
      ? SERIF_STACK
      : "var(--edge-sans, 'Roboto', system-ui, -apple-system, sans-serif)",
  };
};

/* Темна тема просить у браузера темні скролбари й правильний колір
   форм; без цього в світлій темі поле пошуку лишається чорним. */
export const colorScheme = (themeId) => (themeId === 'dark' ? 'dark' : 'light');
