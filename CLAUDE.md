# edge-journal — карта проєкту

Читати це замість того, щоб сканувати весь репозиторій. Якщо файл тут не згаданий — його, найімовірніше, і не треба чіпати.

## Стек

React 19 + Vite 8 (rolldown), Tailwind 3 + інлайнові стилі на токенах, Supabase (auth + Postgres з RLS + Storage), деплой Vercel (`vercel.json` переписує все на `index.html`, `/api/*` — serverless).
Збірка йде **тільки на Windows-машині користувача**: `node_modules` мають нативний бінарник rolldown під win32, у Linux-оболонці `npm run build` падає. Перевіряти можна лише синтаксис, імпорти й прев'ю в контейнері.

## Точки входу

| Файл | Що там |
| --- | --- |
| `src/App.jsx` | усі маршрути. Публічні: `/`, `/auth`, `/demo/*`, `/shared/*`, `/:lang/blog*`. Захищені — під `ProtectedRoute` + `Layout` |
| `src/components/core/Layout.jsx` | сайдбар, оболонка застосунку. Тут же `EdgeMonogram` (живий кіт, 560 рядків, framer-motion) і `EdgeWordmark` |
| `src/lib/supabase.js` | клієнт + підміна на демо-клієнт на шляху `/demo` |
| `src/context/AuthContext.jsx`, `SettingsContext.jsx` | сесія і налаштування |

## Дизайн-система

- `src/lib/theme.js` — токени `T.*` (посилання на CSS-змінні), `useEdgeFonts()`, `EASE`, `SPRING`.
- `src/lib/themes.js` — палітри тем застосунку (`THEMES = [dark, light]`), значення лягають на `:root`.
- `src/index.css` — глобальне: `body{background:#111}`, скролбари, **`.edge-add-btn`** (головна кнопка дії), keyframes.
- Словник кнопок (нотатки / аналітика / розбори / бектести): висота 42–44, радіус 12 (`rounded-xl`), 14px, `font-bold`; головна — `.edge-add-btn`; фільтр — фон `rgba(acc,.14)` + рамка `lineAcc`; іконкова — 42×42 з рамкою `line`. Перемикач періоду на аналітиці — заглиблена доріжка `radius 10, p-1` з кнопками `rounded-lg px-3 py-1.5`.

## Лендінг

`src/pages/Landing.jsx` + `src/components/landing/v3/*` (Hero, Steps, Difference, AutoImport, Product, Coach, Closing).
`v3/base.jsx` — кольори `C.*` (`bg #08080c`, `panel #0e0e14`, `acc #8b7bff`), `KEYFRAMES`, `Eyebrow/H2/Sub/Section/Cat/Glow`.
`src/lib/i18n.js` — три словники (en/uk/ru) для лендінга.

## Блог (публічний, без входу)

Адреси: `/:lang/blog`, `/:lang/blog/category/:cat`, `/:lang/blog/tag/:tag`, `/:lang/blog/:slug`; `/blog` → редирект за мовою браузера. Мови: `uk | ru | en`.

| Файл | Що там |
| --- | --- |
| `src/lib/blogContent.js` | **джерело статей** (поки статика: `POSTS`) + `CATEGORIES`, `BLOG_LANGS`, `AUTHOR`. Уся решта коду ходить лише через функції внизу файлу: `postsFor`, `postBySlug`, `postsInCategory`, `postsWithTag`, `tagCloud`, `relatedPosts`, `categoryCounts`, `readMinutes`. **Переїзд на базу = переписати рівно ці функції** |
| `src/lib/blogMd.js` | свій парсер розмітки → дерево блоків. Підтримує `##/###` (з якорями), списки, цитати, таблиці, `::: note\|warn\|ok`, `::: slider`, `![](placeholder:tone)`, `---`, ```` ``` ````. Експорт: `parse`, `inline`, `extractHeadings`, `plainText`, `slugify` |
| `src/lib/blogReader.js` | три теми читання (`dark/light/book`) як набори CSS-змінних `--bl-*`, шкали розміру/гарнітури/ширини/інтервалу, `useReaderPrefs()` (localStorage `edge_blog_reader`), `themeVars`, `textVars` |
| `src/lib/blogImages.js` | заглушка обкладинки як справжня картинка: SVG → `data:URI` у кольорах теми. `placeholderImage`, `resolveSrc` |
| `src/lib/blogSeo.js` | `useDocumentMeta` (title, description, canonical, og, hreflang, JSON-LD) |
| `src/components/blog/BlogChrome.jsx` | **весь CSS блогу** (`BLOG_CSS`, класи `bl-*`), хедер, футер, `Cover`, `Seg`, `Crumbs`, `blogPath`, `fmtDate`. Ширина сторінки — змінна `--bl-shell: min(80%,1720px)` |
| `src/components/blog/BlogLogo.jsx` | векторний знак `EdgeWordmark` (currentColor) і `BlogCat` (кіт без рамки) |
| `src/components/blog/Markdown.jsx` | дерево блоків → розмітка; ілюстрації через `ImageSlider` застосунку |
| `src/components/blog/ReadingTools.jsx` | смуга прогресу, плаваючі кнопки, віконце налаштувань читання, `SideToc`, `useActiveHeading` |
| `src/pages/BlogList.jsx` | список: розділи, пошук (fuse.js), сітка карток, теги (згорнуті) |
| `src/pages/BlogPost.jsx` | стаття: зміст збоку + текст, обкладинка з зумом, теги, схожі, CTA |

Спільне з застосунком: `src/components/ui/ImageSlider.jsx` — перегляд картинок із лупою (клавіша Z), фулскріном і стрілками. Блог використовує **його**, свого переглядача не має.

## Що де ще лежить

- `src/pages/*` — сторінки застосунку: Hub, DailyPlan, TradingJournal, Analytics, Reviews, Backtest, TwentyTrades, Accounts, Todo, Notes(Dashboard), ErrorLog, News, Calculator, FAQ, TradingSystem, Demo.
- `src/lib/*Store.js` — доступ до даних відповідних розділів.
- `src/db/*.sql` — міграції Supabase, за датами.
- `api/news.js`, `api/verify-email.js` — serverless.

## Правила, які не варто ламати

1. Коментарі українською, пояснюють **чому**, а не що.
2. Блог фарбується змінними `--bl-*` на своєму корені, застосунок — `--edge-*` на `:root`. Вони не перетинаються.
3. `Layout.jsx` спільний із застосунком: блог знімає рамку кота **своїм** CSS, а не правкою Layout.
4. Ніякого `dangerouslySetInnerHTML` у блозі — текст колись поїде з адмінки.
5. У статтях немає вигаданих цифр соціального доказу; приклади підписані як приклади.
