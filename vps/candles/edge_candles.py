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
DEFAULT_CORE = "EURUSD,GBPUSD,XAUUSD,GER40,DXY"


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
        path = need("MT5_PATH_CANDLES")
        if not m.initialize(path=path, portable=True, timeout=60000):
            sys.exit(f"MT5 не стартував: {m.last_error()} (термінал {path}). "
                     "Відкрий його руками й увійди в будь-який рахунок брокера.")
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


def rates_month(broker: str, ym: str):
    """Свічки M1 місяця за ЧАСОМ БРОКЕРА. MT5 віддає час сервера як
    epoch, тож межі місяця рахуємо в тих самих «секундах брокера» і
    просимо з запасом у добу з обох боків."""
    m = mt5()
    if not m.symbol_select(broker, True):
        raise RuntimeError(f"символ {broker} не знайдено в терміналі")
    a, b = month_bounds(ym)
    lo, hi = int(a.timestamp()), int(b.timestamp())
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


def build_month(m: dict, ym: str, digits: int) -> int:
    """Один місяць у R2. Повертає кількість свічок (0 — історії немає)."""
    rows = rates_month(m["broker"], ym)
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


def catalog(log=print):
    core = core_map()
    syms = mt5().symbols_get() or []
    on_demand = []
    for s in syms:
        if s.name in core.values():
            continue
        on_demand.append({"symbol": s.name, "desc": (s.description or "")[:60], "digits": int(s.digits),
                          "path": (s.path or "").split("\\")[0]})
    core_list = []
    for name, broker in core.items():
        m = get_json(manifest_key(name)) or {}
        core_list.append({"symbol": name, "broker": broker, "digits": m.get("digits"),
                          "first": m.get("first"), "last": m.get("last")})
    body = {"v": 1, "updated": int(time.time()), "core": core_list, "onDemand": on_demand}
    put(f"{PREFIX}/symbols.json", json.dumps(body, separators=(",", ":")).encode(), "application/json", CACHE_MANIFEST)
    log(f"  каталог: {len(core_list)} основних, {len(on_demand)} на запит")


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
    a = ap.parse_args()

    if a.cmd == "check":
        m = mt5()
        acc = m.account_info()
        print("MT5:", "OK" if acc else "немає входу в рахунок", acc.server if acc else "")
        for name, broker in core_map().items():
            info = m.symbol_info(broker)
            print(f"  {name:8} → {broker:12} {'OK, digits=' + str(info.digits) if info else 'НЕ ЗНАЙДЕНО'}")
        s3().head_bucket(Bucket=bucket())
        print("R2: OK, бакет", bucket())
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


if __name__ == "__main__":
    main()
