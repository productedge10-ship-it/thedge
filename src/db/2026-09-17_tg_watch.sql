-- Сторожі й підсумки в Telegram.
--
-- Кожен вид сповіщень отримує власний прапорець, а не спільний.
-- Причина проста: вони різні за характером. Попередження про денний
-- ліміт — це тривога, і людина може хотіти її навіть тоді, коли решту
-- вимкнула. Підсумок місяця — навпаки, приємний звіт, який комусь
-- просто не потрібен. Один вимикач на все змусив би вибирати між
-- речами, що нічого спільного не мають.
--
-- Типово увімкнені всі, крім місячного: він приходить раз на місяць і
-- за замовчуванням нікому не заважає, але й побачити його вперше
-- краще усвідомлено.

alter table public.user_settings
  add column if not exists tg_risk_on    boolean not null default true,
  add column if not exists tg_streak_on  boolean not null default true,
  add column if not exists tg_weekly_on  boolean not null default true,
  add column if not exists tg_monthly_on boolean not null default true,
  add column if not exists tg_review_on  boolean not null default true;
