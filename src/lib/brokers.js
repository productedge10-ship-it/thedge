/* ==================================================================
   Проп-фірми для підключення терміналу.

   Список потрібен не для краси: у кожного пропа своя збірка MT5, і
   тільки вона знає адреси його серверів. Загальний MetaTrader 5 з
   сайту розробника про «FTMO-Server5» не чув узагалі. Тому вибір
   пропа — це насправді вибір терміналу, який воркер підніме на VPS,
   і `id` звідси лягає в `mt5_accounts.broker`, а на VPS перетворюється
   на змінну `MT5_PATH_<ID>`.

   Файл спільний навмисно. Той самий вибір робиться у двох місцях —
   у налаштуваннях і в модалці нового рахунку, — а дві копії списку
   розходяться через тиждень: нову фірму дописують в одну з них.

   `tint` — не фірмовий колір, а наша підкладка під монограму, поки
   логотип не поклали у public/props. Самі логотипи докладає людина:
   лежать вони як /props/<id>.svg і підтягуються адресою, тож брак
   файлу нічого не ламає — вмикається монограма.
================================================================== */

export const BROKERS = [
  { id: 'ftmo',         name: 'FTMO',               tint: '#2f6fdb' },
  { id: 'fundingpips',  name: 'FundingPips',        tint: '#1f9d6b' },
  { id: 'fundednext',   name: 'FundedNext',         tint: '#e0803a' },
  { id: 'the5ers',      name: 'The5ers',            tint: '#4a7de0' },
  { id: 'e8',           name: 'E8 Markets',         tint: '#c9a23f' },
  { id: 'goat',         name: 'Goat Funded Trader', tint: '#8f5ad6' },
  { id: 'brightfunded', name: 'BrightFunded',       tint: '#3fb9a8' },
  { id: 'alphacapital', name: 'Alpha Capital',      tint: '#c2504e' },
  { id: 'fxify',        name: 'FXIFY',              tint: '#5b73e8' },
  { id: 'dnafunded',    name: 'DNA Funded',         tint: '#3f9dc9' },
  { id: 'aquafunded',   name: 'AquaFunded',         tint: '#2f97c4' },
  { id: 'atlasfunded',  name: 'Atlas Funded',       tint: '#b98a4a' },
  { id: 'other',        name: 'Another firm',       tint: '#6b6b78' },
];

/* Невідомий id віддає «Another firm», а не undefined: рахунок міг
   приїхати з бази зі старою назвою пропа, і падати через це дорого. */
export const brokerById = (id) => BROKERS.find((b) => b.id === id) || BROKERS[BROKERS.length - 1];
