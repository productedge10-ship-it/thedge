-- Вхід через Google: пошта вважається підтвердженою одразу.
--
-- Google сам перевіряє пошту (identity_data.email_verified = true), тож
-- такому юзеру ставимо profiles.email_verified = true без листа.
-- Тригер саме на auth.identities, а не на auth.users: так він ловить і
-- новий акаунт через Google, і випадок, коли Google-вхід прив'язується
-- до вже існуючого акаунта з тією ж поштою.
--
-- Захист від «передзахоплення»: якщо хтось раніше зареєструвався з
-- паролем на чужий gmail і так і не підтвердив пошту, то коли справжній
-- власник заходить через Google, пароль того акаунта скидається.
-- Інакше той, хто реєстрував, і далі входив би у вже чужий акаунт.

create or replace function public.mark_google_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  was_verified boolean;
begin
  if new.provider = 'google'
     and coalesce((new.identity_data ->> 'email_verified')::boolean, false) then
    select email_verified into was_verified from public.profiles where id = new.user_id;

    if coalesce(was_verified, false) = false then
      update auth.users set encrypted_password = ''
       where id = new.user_id
         and exists (select 1 from auth.identities i
                      where i.user_id = new.user_id and i.provider = 'email');
    end if;

    insert into public.profiles (id, email_verified, verified_at)
    values (new.user_id, true, now())
    on conflict (id) do update
      set email_verified = true,
          verified_at = coalesce(public.profiles.verified_at, now());
  end if;
  return new;
end
$fn$;

drop trigger if exists on_identity_google on auth.identities;
create trigger on_identity_google
  after insert on auth.identities
  for each row execute function public.mark_google_verified();
