-- ------------------------------------------------------------------
-- Публічне посилання на угоду
--
-- Так само, як із планами (див. 2026-07-31_security.sql, п. 4):
-- угоду бачать чужі тільки після того, як власник сам натиснув
-- «Поділитись» у картці угоди. Читання анонімом, без права змінити.
-- ------------------------------------------------------------------

alter table public.trades
  add column if not exists is_public boolean not null default false;

drop policy if exists trades_public_read on public.trades;
create policy trades_public_read
  on public.trades
  for select
  to anon, authenticated
  using (is_public = true);
