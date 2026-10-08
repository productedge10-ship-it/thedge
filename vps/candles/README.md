# Сервер свічок EDGE

Свічки M1 лежать у Cloudflare R2 (бакет `edge-candles`) місячними файлами.
Сайт вантажить лише видимі місяці, старші — коли гортаєш вліво.

```
v1/symbols.json               каталог: основні + «на запит»
v1/<SYM>/manifest.json        які місяці є
v1/<SYM>/M1/<YYYY-MM>.bin     місяць хвилинок (gzip, ~150–250 КБ)
```

## Варіант 1 — руками, файлом (зараз)

1. MT5 → Ctrl+U → «Бари» → символ, **M1**, дати → «Запит» → «Експортувати бари».
2. У теці проєкту:
   ```
   node scripts/candles-pack.mjs "D:\export\EURUSD_M1_....csv"
   node scripts/candles-pack.mjs "D:\export\DE40_M1_....csv" GER40   ← своя назва на сайті
   ```
   З'явиться тека `candles-out\v1\...`.
3. Cloudflare → R2 → `edge-candles` → **Objects** → перетягни теку **v1**
   з `candles-out` у вікно бакета. Повторно — так само: старі файли
   просто перезапишуться.

## Варіант 2 — автоматично з VPS (потім)

У `C:\mt\.env` (руками, не надсилати нікому):

```
MT5_PATH_CANDLES=C:\mt\terminals\candles\terminal64.exe
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=edge-candles
CANDLES_CORE=EURUSD,GBPUSD,XAUUSD,GER40=DE40,DXY=USDX
SUPABASE_URL=...            (уже є у воркера)
SUPABASE_SERVICE_KEY=...    (уже є у воркера)
```

Окрема portable-копія MT5 (як для FundingPips), вхід у будь-який рахунок
брокера руками один раз; у терміналі «Макс. барів у вікні» = Unlimited.

```
pip install MetaTrader5 boto3
python edge_candles.py check
python edge_candles.py backfill --years 7
python edge_candles.py serve        ← постійно (як службу)
```

Для «на запит» потрібна міграція `supabase/2026-10-07_candle_jobs.sql`.
