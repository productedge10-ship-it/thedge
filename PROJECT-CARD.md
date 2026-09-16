# edge-journal — картка проєкту

Довідник «що де лежить». Читати замість сканування репо. Доповнює `CLAUDE.md`
(там правила й деталі блогу), тут — карта розділів, даних і дизайну.

## 1. Коротко

Журнал трейдера: план сесії → угоди → помилки → аналітика → розбори.
Плюс бектести, пропи/MT5, нотатки, todo, новини, калькулятор, публічний блог і демо.

Стек: **React 19 + Vite 8 (rolldown) + Tailwind 3 + inline-стилі на токенах**,
**Supabase** (auth, Postgres з RLS, Storage), деплой **Vercel** (`/api/*` — serverless).

> Збірка тільки на Windows-машині користувача (`node_modules` мають нативний rolldown під win32).
> У Linux-контейнері `npm run build` впаде — перевіряти лише синтаксис/імпорти.

Розмір: ~88k рядків у `src`, ~30 сторінок, ~180 компонентів.

## 2. Маршрути (`src/App.jsx`)

**Публічні:** `/` лендінг · `/auth` · `/blog` → `/:lang/blog[/category/:cat|/tag/:tag|/:slug]` (uk/ru/en)
**Шеринг (без входу):** `/shared/{plan|review|backtest|stats|trade}/:id` — читає рядки з `is_public=true`
**Демо:** `/demo` (`DemoShell` + демо-клієнт Supabase): `plan`, `journal`, `analytics`, `accounts`
**Застосунок** (`ProtectedRoute` + `Layout`): `/app` Hub · `notes` · `analyses` · `plan[/:date/:pair]` ·
`accounts` · `journal` · `error` · `analytics` · `todo` · `reviews` · `faq` · `system` ·
`backtest[/:sessionId]` · `20-trades` · `checklist` · `calculator` · `news`

## 3. Розділ → сторінка → компоненти → store → таблиці

| Розділ | Сторінка | Компоненти | Дані | Таблиці |
| --- | --- | --- | --- | --- |
| План сесії | `pages/DailyPlan.jsx` | `components/trading/*` (PlanHeader, PlanTabs, PlanBlocksDock, Tda*, WeeklyPlanView, PreSessionQuiz, PostSessionDiagnostics) | `lib/planBlocks.js`, `planAssets.js`, `weekPlan.js`, `utils/planUtils.js` | `trading_plans` (jsonb `plan_data`, `plan_type` daily/weekly), `daily_diagnostics`, `user_assets` |
| Журнал угод | `pages/TradingJournal.jsx` | `components/journal/*` (TradesTable, StatCards, TradeLevels), `modals/TradeModal`, `TradeDetailsModal` | `utils/journalUtils.js`, `utils/tradingData.js` | `trades`, `trade_candles`, `instruments` |
| Помилки | `pages/ErrorLog.jsx` | `components/errors/*` (ErrorGrid, ErrorComposerModal, ErrorDetailDrawer, ErrorFilters, ErrorStats, RuleFromErrorModal) | `lib/errorsStore.js` | `trade_errors` (FK → `trades`, `trading_plans`), `user_mistake_categories` |
| Аналітика | `pages/Analytics.jsx` | `components/analytics/*`: Overview(+`overview/Board,widgets,theme`), Performance(`perf/widgets`), Risk, Psychology(`psych/*`)+PsychologistPanel, Assets, History, Simulator, WhatIf, AiLab, ExportStats | `lib/analyticsStore.js`, `utils/analyticsStats.js`, `lib/monteCarlo.js`, `whatIf.js`, `statCard.js` | читає `trades` + `trade_errors`; `stat_cards` (шеринг картки) |
| Розбори | `pages/Reviews.jsx` | `components/reviews/*` (ReviewBuilder, ReviewComposer, ReviewReader, ReviewRow, EvidencePicker, MaterialPreview, PeriodBar) | `lib/reviewsStore.js`, `reviewsData.js` | `trader_reviews` (jsonb `data`), legacy `periodic_reviews` |
| Бектест | `pages/Backtest.jsx`, `BacktestSession.jsx` | `components/backtest/*` (BacktestTable, EquityCurve, StatStrip, TradeSheet, QuickTradeBar, NewBacktestModal, BreakdownPanels, AssetPicker) | `lib/backtestStats.js`, `backtestSetups.js`, `backtestShare.js`, `backtestDemo.js` | `backtest_sessions`, `backtest_trades` |
| Акаунти / пропи | `pages/Accounts.jsx` | `components/accounts/*` (AccountDetails, BalanceChart, Survival, LinkedTerminal) | `lib/accountsStore.js`, `mt5Store.js` | `prop_accounts`, `account_events` (start/payout/deposit/adjust/trade), `mt5_accounts`, `mt5_snapshots` |
| Нотатки | `pages/Dashboard.jsx` | `components/notes/*` (FolderBoard, NoteEditor, NoteReader, TagPicker, VoiceCapture, VoicePlayer, NotesBackdrop) | `lib/notesStore.js`, `foldersStore.js`, `noteTags.js`, `noteCard.js`, `speech.js` | `notes`, `note_folders` |
| Спостереження | `pages/Analyses.jsx` | `components/analyses/*` | — | `trader_observations`, `trader_notes` |
| Todo | `pages/Todo.jsx` | `components/todo/*` (CalendarBoard, EisenhowerMatrix, PomodoroScreen, TaskComposer, TaskRow, WhenPop/DatePop/TimePop) | `lib/todoData.js` | `tasks`, `user_state` |
| Система | `pages/TradingSystem.jsx` | `components/system/*` (BlockEditor, blocks/*, SlashMenu, SearchModal) | `lib/systemDoc.js` | `trading_system` (дерево через `parent_id`) |
| 20 угод | `pages/TwentyTrades.jsx` | — | — | `method_20_trades` (усе в jsonb) |
| Чекліст | `pages/PreTradeChecklist.jsx` | `components/checklist/*` | `lib/checklistData.js` | `trade_checklist` |
| Новини | `pages/News.jsx` | `modals/TgAlertModal` | `lib/newsStore.js`, `newsAlerts.js`, `db/edge-news.ts` | `tg_alerts`; дані з `api/news.js` |
| Калькулятор | `pages/Calculator.jsx` | `components/calculator/ResultsBoard` | — | `instruments` |
| Хаб / FAQ | `pages/Hub.jsx`, `FAQ.jsx` | — | `lib/hubData.js`, `launchpad.js` | `user_state` |
| Лендінг | `pages/Landing.jsx` | `components/landing/v3/*` (Hero, Steps, Difference, AutoImport, Product, Coach, Closing) + `base.jsx` | `lib/i18n.js` (en/uk/ru) | — |
| Блог | `pages/BlogList.jsx`, `BlogPost.jsx` | `components/blog/*` | `lib/blogContent.js` (зараз статика), `blogMd.js`, `blogReader.js`, `blogImages.js`, `blogSeo.js` | `blog_posts` (готова, ще не підключена) |
| Демо | `pages/Demo.jsx`, `DemoShell.jsx` | `components/demo/*` | `lib/demoDb.js`, `demoTrades.js` | немає (фейковий клієнт) |

## 4. Ядро

- `src/App.jsx` — усі маршрути (`createBrowserRouter`).
- `src/components/core/Layout.jsx` — сайдбар + оболонка; тут `EdgeMonogram` (живий кіт, ~560 рядків framer-motion) і `EdgeWordmark`.
- `core/ProtectedRoute.jsx`, `CatChat.jsx`, `Tour.jsx`, `ThemeSweep.jsx`, `CandleReveal.jsx`.
- `context/AuthContext.jsx` — сесія; `context/SettingsContext.jsx` — налаштування.
- `lib/supabase.js` — клієнт; на шляху `/demo` підміняється демо-клієнтом.
- Хуки: `useCloudState` (стан у `user_state`), `useCachedList`, `useDeferredField`, `useEmailGate`, `useTerminalSkin`.
- `lib/imageStore.js` — стиснення + завантаження картинок/аудіо в Supabase Storage, віддає public URL.
- `lib/flags.js` — фіче-флаги. `lib/notify.jsx` (`utils/`) — тости.

## 5. База даних (Supabase, RLS по `user_id = auth.uid()`)

Ядро: `trading_plans`, `trades`, `trade_errors`, `trader_reviews`, `daily_diagnostics`.
Довідники: `user_assets`, `user_mistake_categories`, `instruments`, `trade_checklist`.
Акаунти: `prop_accounts` → `account_events`; `mt5_accounts` → `mt5_snapshots`, `trade_candles`.
Бектест: `backtest_sessions` → `backtest_trades`.
Нотатки/контент: `notes` → `note_folders`, `trading_system`, `trader_notes`, `trader_observations`, `blog_posts`.
Службові: `profiles` (верифікація пошти), `user_settings` (gemini ключ, tg chat), `user_state` (key+jsonb, будь-який UI-стан), `user_emails`, `tasks`, `tg_alerts`, `stat_cards`, `method_20_trades`, `periodic_reviews` (legacy).
Адмінка: `admin_users`, `admin_audit`, `promo_codes`.

Домовленості:
- Шеринг = прапорець `is_public` на рядку (`trading_plans`, `trades`, `trader_reviews`, `backtest_sessions`, `stat_cards`) + сторінка `/shared/...`.
- Складні структури лежать у `jsonb`: `trading_plans.plan_data`, `trader_reviews.data`, `notes.card`, `trade_errors.cats/reasons/shots`, `backtest_trades.tda_data`, `method_20_trades.trades_data`, `user_state.data`.
- Міграції — `src/db/*.sql` з датою в імені.
- Картинки — в Storage, у таблицях лежать URL (`trade_images`, `images`, `shots`).

## 6. Дизайн-система

- `src/lib/theme.js` — токени `T.*`, кожен = `var(--edge-*, fallback)`. Плюс `useEdgeFonts()`, `EASE`, `SPRING`.
- `src/lib/themes.js` — палітри `THEMES = [dark, light]`, значення лягають на `:root`. Світла **не інверсія**: акцент темніє, семантика глибша.
- Токени: поверхні `bg/surface/surfaceHi/sunken`, лінії `line/lineHi/lineAcc`, текст `text…text4`, акцент `acc` (#8b7bff) + `accRgb/accSoft/accLine`, семантика `ok #34d399 / warn #fbbf24 / bad #f87171 / info #60a5fa` — у кожної є `*Rgb`-трійка для `rgba()`.
- `src/index.css` — глобальне: `body{background:#111}`, скролбари, `.edge-add-btn` (головна кнопка), keyframes.
- Словник кнопок: висота 42–44, `rounded-xl`, 14px, `font-bold`; головна — `.edge-add-btn`; фільтр — фон `rgba(acc,.14)` + рамка `lineAcc`; іконкова — 42×42 з рамкою `line`. Перемикач періоду — заглиблена доріжка `radius 10, p-1`, кнопки `rounded-lg px-3 py-1.5`.
- Спільні примітиви — `src/components/ui/*` (Popover, ConfirmModal, DateField, *Select, ImageSlider з лупою по Z, SpotlightCard, EmojiPicker, DelayedTooltip…).
- Лендінг має власну палітру `C.*` у `landing/v3/base.jsx` (`bg #08080c`, `panel #0e0e14`, `acc #8b7bff`).
- Блог фарбується **своїми** змінними `--bl-*` на своєму корені; з `--edge-*` вони не перетинаються.
- Анімації — framer-motion; графіки — recharts; іконки — lucide-react.

## 7. Serverless і зовнішнє

- `api/news.js` — економічний календар/новини (FRED, NASDAQ, scraper-ключі), `api/verify-email.js` — лист підтвердження (Resend).
- Telegram-алерти: `tg_alerts` + `TG_BOT_TOKEN`.
- MT5-синхронізація: `lib/mt5Store.js` ↔ зовнішній воркер (`VITE_MT*`), секрет шифрується (`sealSecret`, `key_version`).
- `.env`: `SUPABASE_URL/KEY/SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `FRED/NASDAQ/SCRAPER_API_KEY`, `RESEND_API_KEY`, `TG_BOT_TOKEN`, `SITE_URL`, `VITE_MT*`.

## 8. Правила, які не ламаємо

1. Коментарі українською, пояснюють **чому**, а не що.
2. Кольори — тільки через `T.*` / CSS-змінні. Ніяких хардкодів hex у розмітці.
3. Блог і застосунок не ділять змінні; `Layout.jsx` блог не править — знімає рамку кота своїм CSS.
4. Ніякого `dangerouslySetInnerHTML` у блозі.
5. Доступ до даних — через `lib/*Store.js`, а не прямі запити зі сторінок.
6. Нова таблиця → міграція `src/db/YYYY-MM-DD_*.sql` + RLS.
7. У статтях немає вигаданих цифр соцдоказу.
8. Збірку не запускати в Linux-контейнері.

## 9. Автоімпорт MT5 (окремий проєкт, Windows-VPS)

Python-воркер, що крутиться на VPS із встановленими терміналами MT5 і сам заливає
угоди й стан рахунків у ту саму базу Supabase. Фронт до термінала не ходить взагалі.

### Файли воркера

| Файл | Що робить |
| --- | --- |
| `main.py` | точка входу, вічний цикл: `mt5_claim` → `process(acc)` → `mt5_done`. `process` = розшифрувати пароль → підняти термінал → зберегти стан → синхронізувати проп-рахунок → зібрати угоди → записати → `mark_backfilled` |
| `config.py` | `.env` поруч зі скриптом; `terminal_path(broker)` → `MT5_PATH_<BROKER>` |
| `terminal.py` | `open_account` (initialize+login+перевірка), `close`, `stats(info)` |
| `trades.py` | deals → рядки журналу: `collect`, `classify`, `levels_of`, `candles_for`, `pick_tf`, `_window`, `wait_history`, `session_of` |
| `api.py` | усе спілкування з Supabase під `service_role`: `push_trades`, `push_candles`, `save_stats`, `sync_prop_account`, `mark_backfilled`, `call` (RPC) |
| `secrets_box.py` | `unseal(secret)` — RSA-OAEP(SHA-256), приватний ключ вантажиться один раз при імпорті з `PRIVATE_KEY_PATH` (`C:\mt\private.pem`) |
| `log.py` | `log(msg)` — рядок із часом `%H:%M:%S`, `dbg(msg)` — те саме під `VERBOSE` |

### Черга

Живе в Postgres, не в пам'яті процесу: RPC `mt5_claim(p_worker, p_limit, p_lease)` і
`mt5_done(p_id, p_ok, p_error, p_interval)` — обидві в `src/db/2026-09-14_mt5_queue.sql`.
`mt5_claim` бере рядки через `for update skip locked` з коротким `lock_timeout`, `pending` іде поперед усіх.
`mt5_done` при помилці відсовує рахунок експоненційно (1→32 хв, стеля година), на 10-й поспіль рахунок з черги випадає.
Стан у `mt5_accounts`:
`next_sync_at`, `locked_by`, `locked_until`, `fail_count`, `status`, `last_error`, `last_sync_at`.
Воркер можна вбити будь-якої миті — рядок повернеться в чергу після закінчення оренди.
Кілька копій на одній машині: кожній своя тека термінала (`/portable`), свій `MT5_PATH_*`, свій `WORKER_NAME`.

### Що куди пише

| Крок | Таблиця | Як |
| --- | --- | --- |
| стан рахунку | `mt5_accounts` (PATCH) | завжди: `account_title, currency, leverage, balance, equity, stat_at` |
| історія балансу | `mt5_snapshots` | лише якщо баланс зрушив (>0.004) або минуло `SNAPSHOT_MINUTES` |
| рахунок у розділі Accounts | `prop_accounts` | upsert по `mt5_account_id`: створення фіксує `initial_balance`, далі оновлюються **тільки** `firm_name` і `balance` |
| угоди | `trades` | два проходи на `on_conflict=user_id,source,external_id`: `ignore-duplicates` (щоб порахувати нових) + `merge-duplicates` (оновити ціни) |
| свічки | `trade_candles` | окремо, `merge-duplicates` — вони цілком належать брокеру |

### Домовленості, які ламати не можна

1. **Один рахунок — чистий термінал.** `mt5.shutdown()` перед кожним логіном, логін одразу в `initialize`, потім перевірка `info.login == login`. Інакше в чужий журнал тихо заїде чужа історія.
2. **`external_id = "{login}:{position_id}"`**, `source = "mt5"`. Це ключ ідемпотентності.
3. **Словник результату той самий, що й у застосунку:** `win | lose | be | scratch` — саме `lose`, не `loss`. `be` — до ±0.08R, `scratch` — до 0.25R.
4. **У payload угоди немає психології, опису й розбору.** `ON CONFLICT DO UPDATE` торкається лише надісланих колонок, тому ручні нотатки затерти фізично неможливо — і так має лишатись.
5. **Свічки не в `trades`.** Рядки журналу тягнуть пачками по 40, свічки потрібні лише при відкритті картки.
6. **Ризик не вигадуємо.** `risk_money` рахується зі стопа ордера входу (`trade_tick_size`/`trade_tick_value`); немає стопа — поле порожнє, бо на ньому стоїть уся аналітика.
7. **`backfilled_at`, а не `last_sync_at`** вирішує, брати повну історію чи вікно `HISTORY_DAYS`. Ставиться лише після вдалого запису.
8. **Час.** Межі дат термінал розуміє як час сервера (запас +2 доби вгору); вікно свічок шукається **за міткою часу**, не за ціною; сесія рахується від UTC (`session_of`).
9. **`user_id` проставляємо вручну** — ходимо під `service_role`, RLS нас не стосується.
10. **Пароль ніде не осідає.** У базі лише шифротекст (`mt5_accounts.secret` + `key_version`), приватна половина ключа живе тільки на VPS. Розшифрований пароль існує рівно на час логіну: не пишеться ні в лог, ні в базу, ні на диск, і в `process()` видаляється у `finally`. Витік `service_role` не дає жодного пароля — так і має лишитись.

### Формат свічок (`trade_candles.data`)

```
{ "tf": "M5", "s": { "M5": { "b": [[ts,o,h,l,c], …], "i": вхідБар, "o": вихідБар } , … } }
```
До 4 таймфреймів на угоду; базовий добирається `pick_tf` так, щоб угода зайняла ~`HELD_TARGET` свічок,
а кадр — `BARS_TARGET` барів з угодою по центру.

### `.env` воркера

`SUPABASE_URL`, `SERVICE_KEY` (service_role), `PRIVATE_KEY_PATH`, `WORKER_NAME`,
`MT5_PATH_<BROKER>` / `MT5_PATH`, `SYNC_INTERVAL` (30 minutes), `LEASE` (2 minutes),
`BATCH` (1), `IDLE_SECONDS` (3), `HISTORY_DAYS` (7), `SNAPSHOT_MINUTES` (15),
`BARS_TARGET` (80), `HELD_TARGET` (15), `CANDLES`, `PAD_BARS`, `VERBOSE`.

### Бік застосунку

`src/lib/mt5Store.js`: `sealSecret` (шифрує пароль публічним ключем), `connectMt5`,
`watchMt5Account`, `readMt5Status`, `listMt5Accounts`, `listMt5Snapshots`,
`peekTradeCandles` / `prefetchTradeCandles` / `getTradeCandles`, `pullMt5Trades`, `removeMt5Account`.
UI — `components/accounts/LinkedTerminal.jsx`, `components/trading/LoadingSyncScreen.jsx`,
`components/landing/Mt5Import.jsx` + `landing/v3/AutoImport.jsx`.

## 10. Telegram-бот (Windows-VPS, у репо його НЕМАЄ)

Коду бота в цьому репозиторії немає навмисно: він живе тільки на VPS. Крутиться поруч із MT5-воркером у `C:\mt\bot\`, читає той самий `C:\mt\.env`,
ходить у Supabase під `service_role` — тобто **кожен запит фільтрує `user_id` сам**.
Один процес, long polling; друга копія красла б оновлення в першої.

| Файл | Що робить |
| --- | --- |
| `main.py` | цикл: `getUpdates` → `handlers.handle`, раз на `ALERT_TICK` — чотири розсилки |
| `handlers.py` | маршрути кнопок і колбеків; `tr:` гортання, `td:` картка угоди, `pl:` вибір/картка плану, `hour:` ранок, `unlink:` |
| `views.py` | усі тексти й клавіатури; `plan_card`, `trade_card`, `stats_text`, `alert_text(source)` |
| `db.py` | PostgREST: угоди, плани, черга `tg_alerts`, `tg_sent`, привʼязка |
| `alerts.py` | таймери з черги, нові угоди з MT5, підсумок дня, ранкове нагадування |
| `card.py` | PNG аналітики на Pillow (вінрейт, угоди, net R, profit factor) |
| `tg.py` | HTTP до Telegram: `send`, `send_photo`, `edit`, `answer_callback` |

Домовленості:
1. Будь-який id із `callback_data` читається з бази **тільки разом із `user_id`** чату.
2. Кнопки на сайт — `web_app` на https (відкривається всередині Telegram), `url` на http.
   Порожній/локальний `SITE_URL` → кнопки немає взагалі: інакше 400 на все повідомлення.
3. Картинка — прикраса. Не намалювалась → ті самі цифри йдуть текстом.
4. `tg_alerts` — спільна черга трьох джерел: `manual` (таймер із плану), `news`, `todo`.
   Фронт пише (`lib/newsTgAlerts.js`, `lib/todoTgAlerts.js`), бот лише вичерпує.
   Один рядок на сутність тримає унікальний індекс `(user_id, source, source_id)`.
5. Ранкове нагадування — `user_settings.tg_morning_hour` (8/9/10), вікно 3 години.
