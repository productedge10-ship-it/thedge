"""
Перевірка входу в FundingPips до того, як за справу візьметься воркер.

Робить рівно те саме, що воркер при логіні: чистий термінал, логін
одразу в initialize, звірка номера рахунку. Якщо тут OK — воркер теж
зайде. Якщо ні — помилка тут зрозуміліша, ніж рядок у last_error.

Запускати, поки воркер ЗУПИНЕНИЙ: одна portable-копія терміналу не
може обслуговувати два процеси одночасно.

    python check_fundingpips.py
"""

import getpass
import sys
from pathlib import Path

import MetaTrader5 as mt5

ENV_FILE = Path(r"C:\mt\.env")
KEY = "MT5_PATH_FUNDINGPIPS"


def read_env(path: Path) -> dict:
    # Свій розбір, а не python-dotenv: перевірка не має залежати від
    # того, що встановлено в середовищі воркера.
    out = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def main() -> int:
    terminal = read_env(ENV_FILE).get(KEY)
    if not terminal or not Path(terminal).exists():
        print(f"{KEY} не задано в {ENV_FILE} або файлу немає: {terminal!r}")
        return 1

    login = int(input("Login (номер рахунку): ").strip())
    server = input("Server (дослівно з листа FundingPips): ").strip()
    password = getpass.getpass("Investor password: ")

    mt5.shutdown()
    try:
        ok = mt5.initialize(
            path=terminal,
            login=login,
            password=password,
            server=server,
            portable=True,
            timeout=60_000,
        )
    finally:
        # Пароль не живе довше за сам логін — так само, як у воркері.
        del password

    if not ok:
        code, msg = mt5.last_error()
        print(f"FAIL: {code} {msg}")
        if code == -6:
            print("Авторизація не пройшла: перевір пароль і назву сервера.")
            print("Якщо назва точно правильна — сервера немає в servers.dat,")
            print("повтори ручний вхід (крок 2 у setup-fundingpips.ps1).")
        return 1

    try:
        info = mt5.account_info()
        if info is None or info.login != login:
            print("FAIL: термінал залогінився не в той рахунок — не використовуй цю копію.")
            return 1
        print(f"OK  {info.login} @ {info.server}  {info.balance} {info.currency}  1:{info.leverage}")
        return 0
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    sys.exit(main())
