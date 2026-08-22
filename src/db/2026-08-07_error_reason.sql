-- ==================================================================
-- EDGE JOURNAL — причина, чотири питання та свої категорії
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- ВАЖЛИВО: без цього файлу збереження помилки падає мовчки —
-- клієнт пише поле, якого в таблиці немає, і рядок не створюється.
-- ==================================================================

-- ------------------------------------------------------------------
-- Причина
--
-- Категорія відповідає на «що це було» — FOMO, поспіх, тільт.
-- Причина відповідає на «чому», і саме з неї виводиться правило на
-- наступний тиждень. «Поспішив» — діагноз, з якого не випливає
-- нічого. «Не дочекався підтвердження, бо боявся впустити рух» —
-- уже випливає.
--
-- text, а не enum: своє формулювання часто найточніше, бо описує
-- цей випадок, а не категорію взагалі.
-- ------------------------------------------------------------------

-- Причин може бути кілька: «не було плану» і «відігравав мінус»
-- часто трапляються разом, і вибір однієї з них означав би викинути
-- половину картини. Тому масив, а не рядок.
alter table public.trade_errors
  add column if not exists reasons jsonb not null default '[]'::jsonb;

-- Стара колонка на один текст. Лишається заради вже записаного:
-- видаляти її означало б стерти причини, вписані до цієї зміни.
alter table public.trade_errors
  add column if not exists reason text not null default '';

-- Одноразовий перенос: те, що лежало рядком, стає масивом з одного
-- елемента.
--
-- Окремою транзакцією, і це не формальність. Разом з alter вище воно
-- давало deadlock: alter бере на таблицю виключне блокування, update
-- у той же час тримає читання, і обидва чекають один одного. commit
-- посередині розводить їх у часі.
commit;

update public.trade_errors
   set reasons = to_jsonb(array[reason])
 where reason <> '' and reasons = '[]'::jsonb;

-- ------------------------------------------------------------------
-- Чотири питання
--
-- followed_plan і rushed уже є. Додаються ще два, бо саме вони
-- відрізняють «порушив свою систему» від «порушив план на день» —
-- це різні промахи, і лікуються вони різним.
--
-- boolean без not null: null тут значуще і означає «не відповідав».
-- Без цієї різниці статистика рахувала б мовчання як «ні».
-- ------------------------------------------------------------------

alter table public.trade_errors
  add column if not exists by_system boolean;

alter table public.trade_errors
  add column if not exists risk_ok boolean;

-- ------------------------------------------------------------------
-- Свої категорії
--
-- Таблиця user_mistake_categories існувала давно, але без RLS її
-- не можна було ні читати, ні писати з клієнта.
-- ------------------------------------------------------------------

alter table public.user_mistake_categories
  add column if not exists color text not null default '#8b8f9f';

alter table public.user_mistake_categories enable row level security;

drop policy if exists umc_owner_select on public.user_mistake_categories;
drop policy if exists umc_owner_insert on public.user_mistake_categories;
drop policy if exists umc_owner_update on public.user_mistake_categories;
drop policy if exists umc_owner_delete on public.user_mistake_categories;

create policy umc_owner_select on public.user_mistake_categories
  for select to authenticated using (user_id = auth.uid());

create policy umc_owner_insert on public.user_mistake_categories
  for insert to authenticated with check (user_id = auth.uid());

create policy umc_owner_update on public.user_mistake_categories
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy umc_owner_delete on public.user_mistake_categories
  for delete to authenticated using (user_id = auth.uid());

create unique index if not exists umc_user_name_uniq
  on public.user_mistake_categories (user_id, lower(name));
