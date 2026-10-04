-- ==================================================================
-- Розбір угоди: позначка reviewed_at і захист розбору від синхронізації.
--
-- Навіщо:
--   1. followed_plan мав default true, тож кожна угода з MT5 зʼявлялась
--      уже «за планом»: журнал показував «Discipline 3/3» і «clean» на
--      угодах, яких ніхто не відкривав. Відрізнити розібрану угоду від
--      нерозібраної було неможливо — тепер це каже reviewed_at.
--   2. Воркер MT5 (без користувача в сесії) регулярно перезаписує угоди.
--      Від нього була захищена лише ручна дата, тому розбір MT5-угод
--      злітав після чергової синхронізації.
--
-- Запускати один раз у SQL Editor. Повторний запуск безпечний.
-- ==================================================================

begin;

-- ---------- 1. колонка ----------
-- null = угоду ще не розбирали. Ставить застосунок при збереженні розбору.
alter table public.trades add column if not exists reviewed_at timestamptz null;

-- ---------- 2. прибрати фальшиве «за планом» ----------
-- Без default нові угоди з MT5 приходять з followed_plan = null —
-- «не відповідали», а не «за планом». Ручна форма й так передає
-- значення явно, тож для неї нічого не змінюється. Наявні рядки не
-- чіпаємо: для нерозібраних угод застосунок це поле не показує.
alter table public.trades alter column followed_plan drop default;

-- ---------- 3. тригер: синхронізація не затирає розбір ----------
-- Логіка з датою — без змін (див. 2026-09-30_period_share_trade_date.sql).
-- Нове: якщо угоду вже розібрано і пише не користувач (auth.uid() is
-- null — це воркер з service_role), поля розбору лишаються старими.
-- Правки з застосунку йдуть під користувачем і проходять як завжди.
create or replace function public.trades_keep_user_date()
returns trigger
language plpgsql
as $$
begin
  if old.date_edited and auth.uid() is null then
    new.plan_date   := old.plan_date;
    new.date_edited := true;
  end if;

  if old.reviewed_at is not null and auth.uid() is null then
    new.reviewed_at         := old.reviewed_at;
    new.followed_plan       := old.followed_plan;
    new.rushed              := old.rushed;
    new.has_mistake         := old.has_mistake;
    new.mistake_category    := old.mistake_category;
    new.mistake_description := old.mistake_description;
    new.mistake_image       := old.mistake_image;
    new.mistake_images      := old.mistake_images;
    new.psy_confident       := old.psy_confident;
    new.psy_fear            := old.psy_fear;
    new.psy_repeat          := old.psy_repeat;
    new.psy_revenge         := old.psy_revenge;
    new.psy_notes           := old.psy_notes;
    new.trade_description   := old.trade_description;
  end if;

  return new;
end $$;

-- Тригер уже існує з минулої міграції; перестворюємо на випадок, якщо
-- її запускали не повністю.
drop trigger if exists trades_keep_user_date on public.trades;
create trigger trades_keep_user_date
  before update on public.trades
  for each row execute function public.trades_keep_user_date();

-- ---------- 4. одноразово: уже розібрані угоди ----------
-- Ручні: на питання про план є відповідь (форма починає з порожнього).
-- З MT5: людина щось у них змінила — default true тут нічого не значить,
-- тож дивимось на сліди. Саме це правило застосунок використовував до
-- міграції, тому після неї нічого «не розбереться» й не зникне.
-- `is true` замість голого значення — на випадок null у булевих полях.
-- Під SQL Editor auth.uid() is null, але тригер це не зачепить: у цих
-- рядків old.reviewed_at ще null.
update public.trades
set reviewed_at = coalesce(created_at, now())
where reviewed_at is null
  and (
    (source is distinct from 'mt5' and followed_plan is not null)
    or (
      source = 'mt5' and (
           followed_plan is false
        or has_mistake   is true
        or rushed        is true
        or nullif(trim(mistake_category), '') is not null
        or psy_confident is true
        or psy_fear      is true
        or psy_repeat    is true
        or psy_revenge   is true
        or nullif(trim(psy_notes), '') is not null
        or nullif(trim(trade_description), '') is not null
      )
    )
  );

commit;

-- ---------- перевірка (запустити окремо після міграції) ----------
-- Має бути: has_column = true, followed_plan_default = null,
 trigger_has_review = true, далі кількість розібраних / усіх угод.

 select
   exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'trades'
             and column_name = 'reviewed_at')                       as has_column,
   (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'trades'
       and column_name = 'followed_plan')                          as followed_plan_default,
   position('reviewed_at' in pg_get_functiondef('public.trades_keep_user_date'::regproc)) > 0
                                                                   as trigger_has_review,
   (select count(*) from public.trades where reviewed_at is not null) as reviewed,
   (select count(*) from public.trades)                              as total;
