-- ==================================================================
-- EDGE JOURNAL — сховище картинок нотаток
-- Виконати у Supabase → SQL Editor. Ідемпотентний.
--
-- Досі скріншот, вставлений у нотатку, їхав у колонку `images`
-- рядком base64. Один графік з TradingView — це 1–3 МБ тексту в
-- jsonb, і платить за це не диск, а швидкість: `fetchNotes` тягне
-- всі нотатки одним запитом, тобто разом із кожною картинкою, яку
-- людина коли-небудь вставила. Двадцять записів зі скрінами — і
-- сторінка відкривається секундами.
--
-- Правильне місце для файлу — файлове сховище. У базі лишається
-- посилання, а сама картинка тягнеться браузером окремо, паралельно
-- і з кешем.
--
-- Bucket публічний на читання свідомо: посилання на нотатку і так
-- показується лише її автору, а публічний URL знімає потребу
-- підписувати кожну картинку токеном з терміном життя — інакше
-- відкрита вкладка через годину показувала б порожні рамки.
-- Запис і видалення — тільки свої, за першим сегментом шляху.
-- ==================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  10485760,                                    -- 10 МБ: стиснення на клієнті дає 200–600 КБ, решта — запас
  array['image/webp', 'image/png', 'image/jpeg', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------------
-- Політики
--
-- Шлях файлу: <user_id>/<note_id>/<random>.webp
-- Перший сегмент — власник. storage.foldername() повертає масив
-- сегментів, тому [1] це саме user_id.
-- ------------------------------------------------------------------

drop policy if exists note_images_public_read on storage.objects;
drop policy if exists note_images_owner_insert on storage.objects;
drop policy if exists note_images_owner_update on storage.objects;
drop policy if exists note_images_owner_delete on storage.objects;

create policy note_images_public_read on storage.objects
  for select
  using (bucket_id = 'note-images');

create policy note_images_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy note_images_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy note_images_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
