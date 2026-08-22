-- ==================================================================
-- EDGE JOURNAL — нотатки
-- Виконати у Supabase → SQL Editor. Ідемпотентний: можна запускати
-- повторно, нічого не зламається.
--
-- Нотатки жили в localStorage: інший браузер показував порожнечу, а
-- чистка кешу зносила все написане. Тепер це таблиця з RLS — свої
-- записи бачить тільки автор, і жодного публічного доступу тут
-- немає взагалі (нотатками не діляться, на відміну від планів).
-- ==================================================================

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,

  title       text not null default '',
  description text not null default '',

  -- Теги — плаский масив рядків виду "Психологія/Тільт".
  -- jsonb, бо фільтрація й пошук ідуть на клієнті, а структура
  -- може змінитись без міграції.
  tags        jsonb not null default '[]'::jsonb,

  -- Картинки: або посилання на графік (основний шлях, як у TDA),
  -- або data:image для вставлених файлів.
  images      jsonb not null default '[]'::jsonb,

  chart_link  text not null default '',

  -- Дата, до якої належить нотатка. Окремо від created_at: людина
  -- може дописати вчорашній розбір сьогодні, і в стрічці він має
  -- стояти вчорашнім днем.
  note_date   date not null default (timezone('utc', now()))::date,

  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

-- Стрічка завжди сортується за датою в межах одного користувача
create index if not exists notes_user_date_idx
  on public.notes (user_id, note_date desc, created_at desc);

-- Пошук по тегах, якщо колись знадобиться робити його на боці бази
create index if not exists notes_tags_idx
  on public.notes using gin (tags);

alter table public.notes enable row level security;
alter table public.notes force row level security;

drop policy if exists notes_owner_select on public.notes;
drop policy if exists notes_owner_insert on public.notes;
drop policy if exists notes_owner_update on public.notes;
drop policy if exists notes_owner_delete on public.notes;

create policy notes_owner_select on public.notes
  for select to authenticated using (user_id = auth.uid());

create policy notes_owner_insert on public.notes
  for insert to authenticated with check (user_id = auth.uid());

create policy notes_owner_update on public.notes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notes_owner_delete on public.notes
  for delete to authenticated using (user_id = auth.uid());
