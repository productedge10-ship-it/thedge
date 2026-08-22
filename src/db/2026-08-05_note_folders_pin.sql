-- ==================================================================
-- EDGE JOURNAL — закріплення папок
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Порядок перетягуванням відповідає на «як мені зручно», але не на
-- «що я відкриваю щодня». Друге змінюється рідше й важить більше:
-- дві-три робочі папки мають стояти зверху завжди, незалежно від
-- того, скільки їх завелось нижче.
--
-- Прапорець, а не окрема позиція «нагорі списку»: закріплення не
-- ламає власний порядок людини всередині групи, а лише піднімає
-- групу над рештою.
-- ==================================================================

alter table public.note_folders
  add column if not exists pinned boolean not null default false;

drop index if exists note_folders_user_pos_idx;

create index if not exists note_folders_user_order_idx
  on public.note_folders (user_id, pinned desc, position, created_at);
