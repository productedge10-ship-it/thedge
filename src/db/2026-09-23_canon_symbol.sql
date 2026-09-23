-- Одна назва на один актив.
--
-- Той самий Nasdaq у різних брокерів називається NAS100, US100, USTEC,
-- NAS100.cash, USTECm — і журнал показував їх як п'ять різних активів,
-- а аналітика ділила статистику на п'ять шматків.
--
-- Чому в базі, а не в інтерфейсі. `plan_pair` читають три десятки місць
-- (журнал, аналітика, помилки, розбори, картки для поширення), і будь-яке
-- забуте з них знову показало б два активи замість одного. Тригер ловить
-- кожен запис незалежно від того, хто пише: форма, імпорт MT5 на VPS
-- (воркер пише сирий symbol термінала), майбутній імпорт з іншого місця.
--
-- Воркеру це не заважає: угоди він звіряє за external_id, а не за назвою
-- активу, тож перейменування не породжує дублікатів.

create or replace function public.canon_symbol(p text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
  m text[];
begin
  if p is null then return null; end if;
  s := upper(btrim(p));
  if s = '' then return p; end if;

  -- Суфікс рахунку брокера майже завжди йде після крапки чи решітки:
  -- NAS100.cash, EURUSD.pro, XAUUSD#. Сам актив — те, що перед ними.
  s := split_part(split_part(s, '.', 1), '#', 1);

  -- Роздільники всередині: BTC/USD, BTC-USD, US TECH 100.
  s := regexp_replace(s, '[^A-Z0-9]', '', 'g');
  if s = '' then return upper(btrim(p)); end if;

  -- Суфікс без крапки: EURUSDm, XAUUSDc, NAS100m, US30cash.
  -- Для валютної пари відрізаємо лише хвіст після шести літер, щоб не
  -- зачепити саму пару.
  m := regexp_match(s, '^([A-Z]{6})(M|C|Z|X|B|R|I|A|SB|PRO|RAW|ECN|STD|MINI|MICRO|CASH|SPOT|PLUS)$');
  if m is not null then s := m[1]; end if;
  m := regexp_match(s, '^([A-Z]+[0-9]+)(M|C|Z|X|B|R|I|A|PRO|RAW|ECN|STD|MINI|MICRO|CASH|SPOT|PLUS|USD)$');
  if m is not null then s := m[1]; end if;

  return case
    when s in ('NAS100','US100','USTEC','USTECM','USTECH','USTECH100','USTEC100','NDX','NDX100',
               'NAS','NASDAQ','NASDAQ100','NQ','NQ100','TECH100','USATECH','USATECH100') then 'NAS100'
    when s in ('US30','DJ30','DJI','DJI30','DOW','DOW30','DOWJONES','WS30','USA30','US30M','YM') then 'US30'
    when s in ('US500','SPX','SPX500','SP500','USA500','ES','SPX500M','US500M') then 'US500'
    when s in ('GER40','GER30','DE40','DE30','DAX','DAX40','DAX30','GERMANY40','DEU40','GDAXI') then 'GER40'
    when s in ('UK100','FTSE','FTSE100','GB100') then 'UK100'
    when s in ('JP225','JPN225','NIKKEI','NIKKEI225','NI225') then 'JP225'
    when s in ('US2000','RUSSELL2000','RUT','RTY') then 'US2000'
    when s in ('FRA40','FR40','CAC','CAC40','F40') then 'FRA40'
    when s in ('EU50','EUSTX50','ESTX50','STOXX50','SX5E') then 'EU50'
    when s in ('HK50','HSI','HANGSENG') then 'HK50'
    when s in ('AUS200','AU200','ASX200') then 'AUS200'
    when s in ('XAUUSD','GOLD') then 'XAUUSD'
    when s in ('XAGUSD','SILVER') then 'XAGUSD'
    when s in ('USOIL','WTI','XTIUSD','CL','OIL','CRUDE','USCRUDE','WTICOUSD') then 'USOIL'
    when s in ('UKOIL','BRENT','XBRUSD','BRENTOIL') then 'UKOIL'
    else s
  end;
end
$$;

create or replace function public.trades_canon_symbol()
returns trigger
language plpgsql
as $$
begin
  new.plan_pair := public.canon_symbol(new.plan_pair);
  return new;
end
$$;

drop trigger if exists trades_canon_symbol_trg on public.trades;
create trigger trades_canon_symbol_trg
  before insert or update of plan_pair on public.trades
  for each row execute function public.trades_canon_symbol();

-- Те, що вже лежить у базі.
update public.trades
   set plan_pair = public.canon_symbol(plan_pair)
 where plan_pair is distinct from public.canon_symbol(plan_pair);
