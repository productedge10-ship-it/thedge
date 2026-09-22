-- Надгробки видалених угод.
--
-- Задача одна: людина прибрала імпортовану угоду — і вона не повертається.
--
-- Без цього кнопка «видалити» на MT5-угоді працює рівно до наступної
-- синхронізації. Воркер щопівгодини заливає вікно історії наново,
-- звіряючись за external_id, і вставляє рядок назад. Ззовні це виглядає
-- не як особливість імпорту, а як зламана кнопка: угода зникла, людина
-- пішла, повернулась — вона знову на місці.
--
-- Чому тригером у базі, а не перевіркою у воркері. Воркер — не єдиний,
-- хто пише в trades: є ще ручне додавання, є імпорт із файлу, колись
-- буде щось третє. Перевірка, що живе в одному з них, захищає рівно
-- один шлях, а решта проходить повз. У базі ж це одне правило на всі
-- входи одразу, і забути його неможливо.

create table if not exists public.trades_deleted (
  user_id     uuid        not null references auth.users on delete cascade,
  source      text        not null,
  external_id text        not null,
  deleted_at  timestamptz not null default now(),
  primary key (user_id, source, external_id)
);

alter table public.trades_deleted enable row level security;

drop policy if exists trades_deleted_own on public.trades_deleted;
create policy trades_deleted_own on public.trades_deleted
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- Тригер: не вставляти те, що свідомо прибрали
-- ------------------------------------------------------------------
-- SECURITY DEFINER, бо воркер ходить під service_role і RLS на
-- trades_deleted його б не пустив читати чужі рядки — а йому саме це й
-- треба, він обслуговує всіх користувачів.
--
-- Повертаємо NULL — рядок тихо не вставляється. Саме тихо: воркер шле
-- пачку з сорока угод, і падати всією пачкою через одну навмисно
-- видалену означало б зламати синхронізацію рахунку заради принципу.

create or replace function public.trades_skip_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.external_id is null then
    return new;
  end if;

  if exists (
    select 1 from public.trades_deleted d
     where d.user_id     = new.user_id
       and d.source      = coalesce(new.source, 'mt5')
       and d.external_id = new.external_id
  ) then
    return null;
  end if;

  return new;
end
$$;

drop trigger if exists trades_skip_deleted_trg on public.trades;
create trigger trades_skip_deleted_trg
  before insert on public.trades
  for each row execute function public.trades_skip_deleted();

-- Свічки видаленої угоди теж ні до чого — вони займають місце й нікому
-- більше не належать. Чистимо разом.
create or replace function public.trades_deleted_cleanup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.trade_candles
   where user_id     = new.user_id
     and source      = new.source
     and external_id = new.external_id;
  return new;
end
$$;

drop trigger if exists trades_deleted_cleanup_trg on public.trades_deleted;
create trigger trades_deleted_cleanup_trg
  after insert on public.trades_deleted
  for each row execute function public.trades_deleted_cleanup();

-- Повернути передумане: видалити надгробок, і найближча синхронізація
-- принесе угоду назад.
--   delete from public.trades_deleted where external_id = '550043173:12345';
