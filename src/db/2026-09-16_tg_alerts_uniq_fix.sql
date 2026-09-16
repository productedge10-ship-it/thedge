-- Полагодити ключ ідемпотентності черги нагадувань.
--
-- Учорашня міграція створила індекс частковим (`where source_id is not
-- null`), і це тихо зламало всю фічу: Postgres не виводить
-- `ON CONFLICT (user_id, source, source_id)` на частковий індекс — для
-- цього в запиті має стояти той самий предикат, а PostgREST його не
-- надсилає. Кожен upsert із фронту повертав 42P10, помилка ковталась
-- фоновим catch, і в `tg_alerts` не зʼявлялось нічого.
--
-- Індекс без предикату працює й не ламає старих рядків: у них
-- `source_id` порожній, а NULL у Postgres за замовчуванням не дорівнює
-- NULL, тож ручні таймери й далі можуть лежати десятками.

drop index if exists tg_alerts_source_uniq;

create unique index if not exists tg_alerts_source_uniq
  on public.tg_alerts (user_id, source, source_id);
