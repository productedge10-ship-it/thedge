-- ==================================================================
-- EDGE JOURNAL — папки нотаток
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Записник виріс до стану, коли плоска стрічка перестала читатись:
-- усе лежить в одній купі, і теги тут не рятують, бо вони фільтр, а
-- не структура. Папки дають те, чого теги не дають — місце, куди
-- заходиш, і яке видно до того, як почав шукати.
--
-- Папка й теги не конкурують: папка відповідає на «де це лежить»,
-- теги на «про що це». Тому нотатка має рівно одну папку і скільки
-- завгодно тегів.
-- ==================================================================

create table if not exists public.note_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,

  name       text not null default 'Нова папка',

  -- Колір зберігаємо як рядок, а не індекс палітри: палітра в коді
  -- ще не раз зміниться, а папка має лишитись того ж кольору, яким
  -- її запамʼятала людина.
  color      text not null default '#7f9cc4',

  -- Порядок задає користувач перетягуванням. Дробових позицій не
  -- вводимо — папок десятки, перенумерувати весь список дешевше,
  -- ніж тягнути логіку вставки між значеннями.
  position   integer not null default 0,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists note_folders_user_pos_idx
  on public.note_folders (user_id, position, created_at);

alter table public.note_folders enable row level security;
alter table public.note_folders force row level security;

drop policy if exists note_folders_owner_select on public.note_folders;
drop policy if exists note_folders_owner_insert on public.note_folders;
drop policy if exists note_folders_owner_update on public.note_folders;
drop policy if exists note_folders_owner_delete on public.note_folders;

create policy note_folders_owner_select on public.note_folders
  for select to authenticated using (user_id = auth.uid());

create policy note_folders_owner_insert on public.note_folders
  for insert to authenticated with check (user_id = auth.uid());

create policy note_folders_owner_update on public.note_folders
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy note_folders_owner_delete on public.note_folders
  for delete to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------------
-- Звʼязок з нотатками
--
-- on delete set null, а не cascade — і це найважливіший рядок у
-- всьому файлі. Видалення папки не має забирати з собою написане:
-- людина прибирає полицю, а не книжки з неї. Нотатки просто
-- переїжджають у «Без папки».
-- ------------------------------------------------------------------

alter table public.notes
  add column if not exists folder_id uuid references public.note_folders(id) on delete set null;

create index if not exists notes_user_folder_idx
  on public.notes (user_id, folder_id)
  where archived = false;
