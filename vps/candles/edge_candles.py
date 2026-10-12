"""
Свічки EDGE: MT5 на VPS → стислі місячні файли → Cloudflare R2.

Сайт не тягне весь CSV. Він бере список місяців (manifest.json) і
вантажить лише ті місяці, які видно на екрані; старші — коли трейдер
гортає вліво. Місяць хвилинок ≈ 150–250 КБ.

Команди (з теки скрипта, у venv воркера):

    python edge_candles.py check              # чи бачимо термінал і R2
    python edge_candles.py backfill --years 7  # основні інструменти, разово
    python edge_candles.py update             # дописати свіжі місяці
    python edge_candles.py catalog            # список усіх символів брокера
    python edge_candles.py serve              # постійно: черга з сайту + update
    python edge_candles.py daily              # раз на добу о 00:05: учорашній день усім символам

Налаштування — у C:\\mt\\.env (див. README.md поруч). Логін брокера
скрипт не знає й не зберігає: у терміналі за MT5_PATH_CANDLES вхід
зроблено руками один раз, initialize() його просто підхоплює.

Формат файлу місяця (усе little-endian, потім gzip):
    0  'EDG1'            4 байти
    4  version  u8       = 1
    5  digits   u8
    6  flags    u16      bit0 — є тіковий обсяг
    8  n        u32      свічок у файлі
    12 t0       i32      час першої свічки, секунди, ЧАС БРОКЕРА (як у MT5)
    16 p0       i32      open першої свічки в пунктах (ціна * 10^digits)
    20 reserved 12 байт
    32 далі шість стовпців по n × i32:
       dt  — хвилин від попередньої свічки (перша — 0)
       dc  — close − попередній close (для першої — від p0)
       od  — open − попередній close
       hu  — high − max(open, close)
       ld  — min(open, close) − low
       vol — тіковий обсяг
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ENV_FILE = Path(r"C:\mt\.env")
PREFIX = "v1"
MAGIC = b"EDG1"
HEADER = struct.Struct("<4sBBHIii12x")

# Основні — повна історія наперед. Формат: НАЗВА_НА_САЙТІ=НАЗВА_У_БРОКЕРА
# Порожньо: список інструментів сайту береться з symbols.json (усе, що
# вже залито). CANDLES_CORE у .env лише додає нові чи задає символ брокера.
DEFAULT_CORE = ""


# ---------------------------------------------------------------- env

def read_env(path: Path) -> dict:
    out = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


ENV = read_env(ENV_FILE)


def need(key: str) -> str:
    v = ENV.get(key)
    if not v:
        sys.exit(f"У {ENV_FILE} немає {key}")
    return v


def core_map() -> dict:
    """{'GER40': 'DE40.cash', ...} — назва на сайті → символ брокера."""
    out = {}
    for part in ENV.get("CANDLES_CORE", DEFAULT_CORE).split(","):
        part = part.strip()
        if not part:
            continue
        name, _, broker = part.partition("=")
        out[name.strip()] = (broker or name).strip()
    return out


def safe_key(name: str) -> str:
    return "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)


# Як той самий інструмент називають різні брокери. Перший, що знайдеться
# в терміналі, і береться.
ALIASES = {
    "NDX100": ["NDX100", "US100", "USTEC", "NAS100"], "NAS100": ["NAS100", "US100", "USTEC", "NDX100"],
    "SPX500": ["SPX500", "US500", "SP500"], "US500": ["US500", "SPX500", "SP500"],
    "US30": ["US30", "DJ30", "WS30"], "GER30": ["GER30", "DE30", "GER40", "DE40"], "GER40": ["GER40", "DE40", "GER30", "DE30"],
    "FRA40": ["FRA40", "FR40", "F40"], "JP225": ["JP225", "JPN225", "JPY225"], "UK100": ["UK100", "FTSE100"],
    "DXY": ["DXY", "USDX", "USDIDX"], "USDX": ["USDX", "DXY"],
    "XAUUSD": ["XAUUSD", "GOLD"], "XAGUSD": ["XAGUSD", "SILVER"],
}


def resolve_broker(name: str, hint: str | None = None) -> str:
    """Символ брокера для назви на сайті. Спершу підказка (CANDLES_CORE
    чи маніфест), далі сама назва й відомі синоніми — точно, а потім із
    суфіксом брокера (DXY.cash, EURUSD.r, XAUUSDm)."""
    m = mt5()
    cands = [c for c in [hint, name, *ALIASES.get(name.upper(), [])] if c]
    for c in cands:
        if m.symbol_info(c) is not None:
            return c
    names = [s.name for s in (m.symbols_get() or [])]
    for c in cands:
        cu = c.upper()
        for n in names:
            nu = n.upper()
            if nu.startswith(cu) and (len(nu) == len(cu) or not nu[len(cu)].isalnum() or len(nu) - len(cu) <= 2):
                return n
    raise RuntimeError(f"символ для {name} не знайдено в терміналі (додай у CANDLES_CORE: {name}=СИМВОЛ_БРОКЕРА)")


def site_symbols() -> dict:
    """Усі інструменти сайту: CANDLES_CORE + ті, що вже лежать у
    symbols.json (зокрема залиті руками з CSV). {назва: підказка брокера}."""
    out = {}
    cat = get_json(f"{PREFIX}/symbols.json") or {}
    for c in cat.get("core", []):
        if c.get("symbol"):
            out[c["symbol"]] = c.get("broker")
    out.update(core_map())
    return out


# ---------------------------------------------------------------- R2

_s3 = None


def s3():
    global _s3
    if _s3 is None:
        import boto3  # pip install boto3
        from botocore.config import Config
        _s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
            aws_access_key_id=need("R2_ACCESS_KEY_ID"),
            aws_secret_access_key=need("R2_SECRET_ACCESS_KEY"),
            region_name="auto",
            config=Config(retries={"max_attempts": 5, "mode": "standard"}),
        )
    return _s3


def bucket() -> str:
    return ENV.get("R2_BUCKET", "edge-candles")


def put(key: str, body: bytes, ctype: str, cache: str):
    s3().put_object(Bucket=bucket(), Key=key, Body=body, ContentType=ctype, CacheControl=cache)


def get_json(key: str):
    try:
        obj = s3().get_object(Bucket=bucket(), Key=key)
        return json.loads(obj["Body"].read())
    except Exception as e:  # noqa: BLE001 — NoSuchKey і мережа однаково «немає»
        if "NoSuchKey" in str(e) or "404" in str(e):
            return None
        raise


# Місячні файли незмінні: в адресі ?v=<час останньої свічки>, тож
# кешувати їх можна назавжди. Маніфест — коротко.
CACHE_MONTH = "public, max-age=31536000, immutable"
CACHE_MANIFEST = "public, max-age=30"


# ---------------------------------------------------------------- MT5

_mt5 = None


def mt5():
    global _mt5
    if _mt5 is None:
        import MetaTrader5 as m  # pip install MetaTrader5
        # Той самий термінал FTMO, що й в автоімпорту (MT5_PATH_FTMO), якщо
        # окремий MT5_PATH_CANDLES не задано. Вхід не робимо: беремо той
        # рахунок, у якому термінал уже залогінений, — котирування однакові.
        path = ENV.get("MT5_PATH_CANDLES") or need("MT5_PATH_FTMO")
        ok = m.initialize(path=path, timeout=60000)
        if ok and m.account_info() is None:
            m.shutdown()
            ok = m.initialize(path=path, portable=True, timeout=60000)
        if not ok or m.account_info() is None:
            sys.exit(f"MT5 без входу в рахунок: {m.last_error()} (термінал {path}).")
        _mt5 = m
    return _mt5


def month_bounds(ym: str):
    y, m = int(ym[:4]), int(ym[5:7])
    a = datetime(y, m, 1, tzinfo=timezone.utc)
    b = datetime(y + (m == 12), m % 12 + 1, 1, tzinfo=timezone.utc)
    return a, b


def month_list(first: str, last: str):
    y, m = int(first[:4]), int(first[5:7])
    out = []
    while f"{y:04d}-{m:02d}" <= last:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def shift_month(ym: str, d: int) -> str:
    y, m = int(ym[:4]), int(ym[5:7]) - 1 + d
    y += m // 12
    return f"{y:04d}-{m % 12 + 1:02d}"


def sync_recent(broker: str, until: int, wait: float = 45.0):
    """Термінал тримає свою копію історії й докачує свіжі хвилинки лише
    тоді, коли символ хтось відкриває. Запит за діапазоном цього не
    запускає: віддає те, що вже лежить на диску (так BTCUSD «застряг» на
    07.10). Тому спершу просимо останню свічку й чекаємо, поки термінал
    докачає історію до потрібного часу або до свіжого тіка."""
    m = mt5()
    tick = m.symbol_info_tick(broker)
    target = min(until - 60, int(tick.time) - 120) if tick and tick.time else until - 60
    deadline = time.time() + wait
    last = 0
    while time.time() < deadline:
        r = m.copy_rates_from_pos(broker, m.TIMEFRAME_M1, 0, 10)
        last = int(r[-1]["time"]) if r is not None and len(r) else 0
        if last >= target:
            return
        time.sleep(1.0)
    print(f"  {broker}: термінал докачав лише до {datetime.fromtimestamp(last, tz=timezone.utc):%d.%m %H:%M}")


def rates_month(broker: str, ym: str, until: int | None = None):
    """Свічки M1 місяця за ЧАСОМ БРОКЕРА. MT5 віддає час сервера як
    epoch, тож межі місяця рахуємо в тих самих «секундах брокера» і
    просимо з запасом у добу з обох боків."""
    m = mt5()
    if not m.symbol_select(broker, True):
        raise RuntimeError(f"символ {broker} не знайдено в терміналі")
    a, b = month_bounds(ym)
    lo, hi = int(a.timestamp()), int(b.timestamp())
    if until is not None and lo < until <= hi + 86400:
        sync_recent(broker, until)
    prev = -1
    rates = None
    # Термінал докачує історію з сервера не одразу — питаємо, доки
    # кількість не перестане рости.
    for _ in range(8):
        rates = m.copy_rates_range(broker, m.TIMEFRAME_M1, a - timedelta(days=1), b + timedelta(days=1))
        cnt = 0 if rates is None else len(rates)
        if cnt == prev:
            break
        prev = cnt
        time.sleep(0.7)
    if rates is None or len(rates) == 0:
        return []
    if until is not None:
        hi = min(hi, until)
    return [r for r in rates if lo <= int(r["time"]) < hi]


# ---------------------------------------------------------------- формат

def encode(rows, digits: int) -> bytes:
    k = 10 ** digits
    n = len(rows)
    T = [int(r["time"]) for r in rows]
    O = [round(float(r["open"]) * k) for r in rows]
    H = [round(float(r["high"]) * k) for r in rows]
    L = [round(float(r["low"]) * k) for r in rows]
    C = [round(float(r["close"]) * k) for r in rows]
    V = [int(r["tick_volume"]) for r in rows]
    p0 = O[0]
    dt, dc, od, hu, ld = [], [], [], [], []
    pt, pc = T[0], p0
    for i in range(n):
        dt.append((T[i] - pt) // 60)
        dc.append(C[i] - pc)
        od.append(O[i] - pc)
        hu.append(H[i] - max(O[i], C[i]))
        ld.append(min(O[i], C[i]) - L[i])
        pt, pc = T[i], C[i]
    head = HEADER.pack(MAGIC, 1, digits, 1, n, T[0], p0)
    cols = b"".join(struct.pack(f"<{n}i", *col) for col in (dt, dc, od, hu, ld, V))
    return gzip.compress(head + cols, 9)


def decode(blob: bytes):
    """Для перевірки: назад у список (t, o, h, l, c, v)."""
    raw = gzip.decompress(blob)
    magic, ver, digits, flags, n, t0, p0 = HEADER.unpack_from(raw, 0)
    assert magic == MAGIC and ver == 1
    cols = [struct.unpack_from(f"<{n}i", raw, HEADER.size + j * n * 4) for j in range(6)]
    k = 10 ** digits
    out, t, pc = [], t0, p0
    for i in range(n):
        t += cols[0][i] * 60
        c = pc + cols[1][i]
        o = pc + cols[2][i]
        h = max(o, c) + cols[3][i]
        lo = min(o, c) - cols[4][i]
        out.append((t, o / k, h / k, lo / k, c / k, cols[5][i]))
        pc = c
    return digits, out


# ---------------------------------------------------------------- маніфест

def manifest_key(name: str) -> str:
    return f"{PREFIX}/{safe_key(name)}/manifest.json"


def load_manifest(name: str, broker: str, digits: int):
    m = get_json(manifest_key(name))
    if not m:
        m = {"v": 1, "symbol": name, "broker": broker, "digits": digits, "baseSec": 60,
             "hasVol": True, "months": {}, "historyStart": None}
    return m


def save_manifest(m: dict):
    months = m["months"]
    keys = sorted(months)
    m["first"] = months[keys[0]]["from"] if keys else None
    m["last"] = months[keys[-1]]["to"] if keys else None
    m["updated"] = int(time.time())
    put(manifest_key(m["symbol"]), json.dumps(m, separators=(",", ":")).encode(),
        "application/json", CACHE_MANIFEST)


def build_month(m: dict, ym: str, digits: int, until: int | None = None) -> int:
    """Один місяць у R2. Повертає кількість свічок (0 — історії немає).
    until — не брати свічок від цього часу (секунди брокера)."""
    rows = rates_month(m["broker"], ym, until)
    if not rows:
        return 0
    blob = encode(rows, digits)
    key = f"{PREFIX}/{safe_key(m['symbol'])}/M1/{ym}.bin"
    put(key, blob, "application/octet-stream", CACHE_MONTH)
    m["months"][ym] = {"n": len(rows), "from": int(rows[0]["time"]), "to": int(rows[-1]["time"]), "bytes": len(blob)}
    return len(rows)


def symbol_digits(broker: str) -> int:
    info = mt5().symbol_info(broker)
    if info is None:
        raise RuntimeError(f"символ {broker} не знайдено в терміналі")
    return int(info.digits)


def this_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def backfill(name: str, broker: str, years: int, log=print):
    digits = symbol_digits(broker)
    m = load_manifest(name, broker, digits)
    m["core"] = True
    last = this_month()
    first = shift_month(last, -12 * years + 1)
    empty_run = 0
    # Від нових до старих: якщо брокер має менше років, зупиняємось на
    # першій порожній смузі, а не крутимо 84 порожні запити.
    for ym in reversed(month_list(first, last)):
        if ym in m["months"] and ym < shift_month(last, -1):
            continue
        n = build_month(m, ym, digits)
        log(f"  {name} {ym}: {n}")
        if n == 0:
            empty_run += 1
            if empty_run >= 2:
                m["historyStart"] = shift_month(ym, 2)
                break
        else:
            empty_run = 0
        save_manifest(m)
    save_manifest(m)


def update_symbol(name: str, broker: str, log=print):
    """Дописати поточний і минулий місяць (минулий — бо на межі місяця
    останні хвилини могли не потрапити)."""
    digits = symbol_digits(broker)
    m = load_manifest(name, broker, digits)
    cur = this_month()
    for ym in (shift_month(cur, -1), cur):
        build_month(m, ym, digits)
    save_manifest(m)
    log(f"  {name}: оновлено до {cur}")


_now_cache = None


def broker_now() -> int:
    """«Зараз» за часом брокера. Беремо найсвіжіший тік серед символів,
    які торгуються й у вихідні (крипта), — інакше в суботу о 00:05
    останній тік був би п'ятничним і п'ятниця не вважалась би закритою."""
    global _now_cache
    if _now_cache:
        return _now_cache
    m = mt5()
    best = 0
    for name in ["BTCUSD", "ETHUSD", *site_symbols().keys()]:
        try:
            b = resolve_broker(name)
            m.symbol_select(b, True)
            t = m.symbol_info_tick(b)
            if t and t.time:
                best = max(best, int(t.time))
        except Exception:  # noqa: BLE001
            continue
    if not best:
        raise RuntimeError("немає жодного тіка — термінал не підключений до брокера?")
    _now_cache = best
    return best


def broker_midnight() -> int:
    """Початок поточної доби за часом брокера."""
    now = broker_now()
    return now - now % 86400


def daily_symbol(name: str, hint: str | None, log=print):
    """Дописати в R2 усі повні доби до сьогоднішньої (сьогоднішню — ні:
    вона ще не закінчилась). Перебудовуємо місяць учорашнього дня, а якщо
    вчора був інший місяць, ніж позавчора, то обидва — щоб пропущений
    запуск не лишав дірок."""
    old = get_json(manifest_key(name)) or {}
    broker = resolve_broker(name, hint or old.get("broker"))
    digits = old.get("digits") or symbol_digits(broker)
    m = load_manifest(name, broker, digits)
    m["broker"] = broker
    cut = broker_midnight()
    yday = datetime.fromtimestamp(cut - 86400, tz=timezone.utc).strftime("%Y-%m")
    last_known = max(m["months"]) if m["months"] else yday
    months = month_list(min(last_known, yday), yday)[-3:]
    total = 0
    for ym in months:
        total += build_month(m, ym, digits, until=cut)
    save_manifest(m)
    day = datetime.fromtimestamp(cut - 86400, tz=timezone.utc).strftime("%d.%m.%Y")
    log(f"  {name} ({broker}): до {day} включно, місяці {', '.join(months)}")
    return total


def daily(log=print):
    ok, bad = 0, []
    for name, hint in site_symbols().items():
        try:
            daily_symbol(name, hint, log)
            ok += 1
        except Exception as e:  # noqa: BLE001
            bad.append(name)
            log(f"  {name}: ПОМИЛКА {e}")
    catalog(log)
    log(f"Готово: {ok} оновлено, помилок {len(bad)}{' (' + ', '.join(bad) + ')' if bad else ''}")
    return 1 if bad else 0


def all_known():
    """Символи, які вже є в R2 (основні + колись запитані з сайту)."""
    pager = s3().get_paginator("list_objects_v2")
    out = []
    for page in pager.paginate(Bucket=bucket(), Prefix=f"{PREFIX}/", Delimiter="/"):
        for p in page.get("CommonPrefixes", []):
            out.append(p["Prefix"].split("/")[1])
    return out


def update_all(log=print):
    core = core_map()
    for name, broker in core.items():
        try:
            update_symbol(name, broker, log)
        except Exception as e:  # noqa: BLE001
            log(f"  {name}: {e}")
    for key in all_known():
        m = get_json(f"{PREFIX}/{key}/manifest.json")
        if not m or m["symbol"] in core:
            continue
        # Запитані з сайту: оновлюємо, лише якщо там уже є недавні місяці.
        if any(k >= shift_month(this_month(), -2) for k in m["months"]):
            try:
                update_symbol(m["symbol"], m["broker"], log)
            except Exception as e:  # noqa: BLE001
                log(f"  {m['symbol']}: {e}")
    catalog(log)


def catalog(log=print, extra=None):
    core = site_symbols()
    for name, broker in (extra or {}).items():
        core.setdefault(name, broker)
    mans = {name: (get_json(manifest_key(name)) or {}) for name in core}
    used = {(mans[n].get("broker") or core[n] or n) for n in core}
    syms = mt5().symbols_get() or []
    on_demand = []
    for s in syms:
        if s.name in used:
            continue
        on_demand.append({"symbol": s.name, "desc": (s.description or "")[:60], "digits": int(s.digits),
                          "path": (s.path or "").split("\\")[0]})
    core_list = []
    for name in core:
        m = mans[name]
        if not m.get("months"):
            continue  # ще не залитий — не показуємо порожній інструмент
        b = m.get("broker") or core[name] or name
        info = mt5().symbol_info(b)
        core_list.append({"symbol": name, "broker": b, "digits": m.get("digits"),
                          "first": m.get("first"), "last": m.get("last"),
                          "path": ((info.path if info else "") or "").split("\\")[0],
                          "desc": ((info.description if info else "") or "")[:60]})
    # Дві назви на один символ брокера (GER30 і GER40 → GER40.cash) —
    # лишаємо ту, в якої довша історія.
    best = {}
    for c in core_list:
        k = c["broker"]
        span = len((mans[c["symbol"]] or {}).get("months") or {})
        if k not in best or span > best[k][0]:
            best[k] = (span, c["symbol"])
    keep = {v[1] for v in best.values()}
    dropped = [c["symbol"] for c in core_list if c["symbol"] not in keep]
    core_list = [c for c in core_list if c["symbol"] in keep]
    if dropped:
        log(f"  дублікати прибрано зі списку: {', '.join(dropped)}")
    body = {"v": 1, "updated": int(time.time()), "core": core_list, "onDemand": on_demand}
    put(f"{PREFIX}/symbols.json", json.dumps(body, separators=(",", ":")).encode(), "application/json", CACHE_MANIFEST)
    log(f"  каталог: {len(core_list)} основних, {len(on_demand)} на запит")


def site_name_for(broker: str, taken: set) -> str:
    """Назва на сайті для символу брокера: без хвоста .cash / .r тощо,
    якщо таке ім'я ще вільне."""
    base = broker.split(".")[0].upper()
    base = "".join(ch for ch in base if ch.isalnum() or ch in "_-") or broker
    return base if base not in taken else safe_key(broker)


def purge_history(broker: str) -> int:
    """Стерти скачану терміналом історію символу з диска VPS (вона вже в
    R2). Повертає скільки МБ звільнено. Заблоковані файли пропускаємо —
    термінал за потреби докачає історію сам."""
    import shutil
    m = mt5()
    try:
        ti = m.terminal_info()
        acc = m.account_info()
    except Exception:  # noqa: BLE001
        return 0
    if not ti or not acc:
        return 0
    root = Path(ti.data_path) / "bases" / acc.server
    freed = 0
    for sub in ("history", "ticks"):
        d = root / sub / broker
        if not d.is_dir():
            continue
        for f in d.rglob("*"):
            if f.is_file():
                try:
                    size = f.stat().st_size
                    f.unlink()
                    freed += size
                except OSError:
                    pass
        shutil.rmtree(d, ignore_errors=True)
    return freed // (1024 * 1024)


def backfill_all(years: int, log=print):
    """Уся історія M1 усіх символів брокера (до `years` років). Можна
    перервати й запустити знову: готові місяці пропускаються."""
    m = mt5()
    known = site_symbols()
    used = {}
    for name, hint in known.items():
        old = get_json(manifest_key(name)) or {}
        try:
            used[resolve_broker(name, hint or old.get("broker"))] = name
        except Exception:  # noqa: BLE001
            pass
    taken = set(known)
    todo = []
    for s in m.symbols_get() or []:
        if s.name in used:
            todo.append((used[s.name], s.name))
            continue
        name = site_name_for(s.name, taken)
        taken.add(name)
        todo.append((name, s.name))
    log(f"Символів: {len(todo)}, глибина до {years} р. Можна перервати Ctrl+C і запустити знову.")
    t0 = time.time()
    extra = dict(todo)
    for i, (name, broker) in enumerate(todo, 1):
        info = m.symbol_info(broker)
        was_selected = bool(info and info.select)
        try:
            m.symbol_select(broker, True)
            log(f"[{i}/{len(todo)}] {name} ({broker})")
            backfill(name, broker, years, log=lambda x: None)
            man = get_json(manifest_key(name)) or {}
            ks = sorted(man.get("months") or {})
            log(f"    {len(ks)} міс., {ks[0] if ks else '-'} … {ks[-1] if ks else '-'}")
        except KeyboardInterrupt:
            raise
        except Exception as e:  # noqa: BLE001
            log(f"    ПОМИЛКА {e}")
        finally:
            if not was_selected:
                m.symbol_select(broker, False)  # не тримати 200 символів в «Огляді ринку»
                # Історія вже в R2 — з диска VPS її прибираємо одразу, інакше
                # 170 символів за 10 років не влізуть. Символи, відкриті в
                # «Огляді ринку» (ними користуються автоімпорт і сайт щодня),
                # не чіпаємо.
                time.sleep(1.0)
                mb = purge_history(broker)
                if mb:
                    log(f"    з диска VPS прибрано {mb} МБ")
        if i % 10 == 0:
            catalog(log, extra)
    catalog(log, extra)
    log(f"Готово за {int((time.time() - t0) / 60)} хв.")


# ---------------------------------------------------------------- черга з сайту

def sb(method: str, path: str, body=None):
    url = need("SUPABASE_URL").rstrip("/") + "/rest/v1/" + path
    key = need("SUPABASE_SERVICE_KEY")
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    req.add_header("apikey", key)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def run_job(job: dict, log=print):
    """Місяць символу, який просить сайт. Назва на сайті = символ брокера
    (для основних — через CANDLES_CORE)."""
    name = job["symbol"]
    broker = core_map().get(name, name)
    digits = symbol_digits(broker)
    m = load_manifest(name, broker, digits)
    ym = job["month"]
    hs = m.get("historyStart")
    if hs and ym < hs:
        return 0
    if ym in m["months"] and ym < shift_month(this_month(), -1):
        return m["months"][ym]["n"]
    n = build_month(m, ym, digits)
    if n == 0 and ym < this_month():
        # Порожній місяць у минулому — далі вліво історії немає.
        m["historyStart"] = max(m.get("historyStart") or "", shift_month(ym, 1))
    save_manifest(m)
    log(f"  запит {name} {ym}: {n}")
    return n


def serve():
    print("Слухаю чергу candle_jobs. Ctrl+C — стоп.")
    last_update = 0.0
    while True:
        try:
            jobs = sb("GET", "candle_jobs?status=eq.pending&order=priority.desc,created_at.asc&limit=6&select=id,symbol,month") or []
            for j in jobs:
                sb("PATCH", f"candle_jobs?id=eq.{j['id']}", {"status": "running"})
                try:
                    n = run_job(j)
                    sb("PATCH", f"candle_jobs?id=eq.{j['id']}", {"status": "done", "bars": n, "done_at": datetime.now(timezone.utc).isoformat()})
                except Exception as e:  # noqa: BLE001
                    sb("PATCH", f"candle_jobs?id=eq.{j['id']}", {"status": "error", "error": str(e)[:300], "done_at": datetime.now(timezone.utc).isoformat()})
                    print(f"  помилка {j['symbol']} {j['month']}: {e}")
            if time.time() - last_update > 15 * 60:
                last_update = time.time()
                update_all()
            time.sleep(2 if jobs else 3)
        except KeyboardInterrupt:
            break
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  мережа: {e}; ще раз за 10 с")
            time.sleep(10)
        except Exception as e:  # noqa: BLE001
            print(f"  збій: {e}; ще раз за 10 с")
            time.sleep(10)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Свічки EDGE → R2")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    b = sub.add_parser("backfill")
    b.add_argument("--years", type=int, default=7)
    b.add_argument("symbols", nargs="*", help="назви з CANDLES_CORE; порожньо — усі основні")
    sub.add_parser("update")
    sub.add_parser("catalog")
    sub.add_parser("serve")
    sub.add_parser("daily")
    ba = sub.add_parser("backfill-all")
    ba.add_argument("--years", type=int, default=10)
    a = ap.parse_args()

    if a.cmd == "check":
        m = mt5()
        acc = m.account_info()
        print("MT5:", "OK" if acc else "немає входу в рахунок", acc.server if acc else "")
        s3().head_bucket(Bucket=bucket())
        print("R2: OK, бакет", bucket())
        for name, hint in site_symbols().items():
            try:
                b = resolve_broker(name, hint)
                print(f"  {name:8} → {b:14} OK, digits={m.symbol_info(b).digits}")
            except Exception as e:  # noqa: BLE001
                print(f"  {name:8} → НЕ ЗНАЙДЕНО ({e})")
        return
    if a.cmd == "backfill":
        core = core_map()
        names = a.symbols or list(core)
        for name in names:
            if name not in core:
                sys.exit(f"{name} немає в CANDLES_CORE")
            print(f"{name} ({core[name]}): {a.years} р.")
            backfill(name, core[name], a.years)
        catalog()
        return
    if a.cmd == "update":
        update_all()
        return
    if a.cmd == "catalog":
        catalog()
        return
    if a.cmd == "serve":
        serve()
    if a.cmd == "backfill-all":
        backfill_all(a.years)
        return
    if a.cmd == "daily":
        sys.exit(daily())


if __name__ == "__main__":
    main()
