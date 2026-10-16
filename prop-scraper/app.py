"""
Парсер сторінок для монітора правил пропів (THE EDGE).

Окремий маленький сервіс, бо браузер для Scrapling важить під гігабайт,
і в образі сайту йому не місце. Сайт (server.mjs) раз на добу кличе
POST /fetch і отримує чистий текст сторінки.

Порядок спроб — той самий, що в старому backend/scraper:
  1. curl_cffi з відбитком справжнього Chrome — швидко, без браузера.
     Підходить, коли сторінка рендериться на сервері (FTMO).
  2. Scrapling StealthyFetcher — прихований браузер. Коли curl_cffi
     відбили (Cloudflare, 403) або сторінка збирається JavaScript-ом
     і в HTML майже немає тексту (FundingPips, FundedNext).
     Там же клікаємо вкладки програм (options.tabs), бо прихований
     вміст вкладок у DOM не потрапляє, поки на них не натиснути.

ScraperAPI навмисно немає: на цих сайтах він працював гірше.

Захист: сервіс не має домену й портів назовні — до нього ходить лише
сайт внутрішньою мережею Coolify. Додатково можна задати
PROP_SCRAPER_TOKEN (тоді потрібен заголовок x-token).
"""
import asyncio
import os
import re
import time

from bs4 import BeautifulSoup
from curl_cffi.requests import AsyncSession
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

TOKEN = os.environ.get("PROP_SCRAPER_TOKEN", "")
app = FastAPI()

BLOCK_MARKERS = (
    "cf-chl", "challenge-platform", "Just a moment", "Attention Required",
    "Access denied", "captcha-delivery", "Verifying you are human",
)
BIDI = re.compile("[⁦⁧⁨⁩‎‏‪-‮]")


class FetchReq(BaseModel):
    url: str
    min_chars: int = 1500          # менше тексту — вважаємо, що сторінка JS-ова
    render: bool = False           # одразу браузером
    tabs: list[str] | None = None  # підписи вкладок, які треба проклікати
    wait_ms: int = 1500


def clean_text(html: str) -> str:
    """Текст сторінки без скриптів, меню й підвалу. Прихований вміст
    (розгортки «Show Trading Objectives») лишаємо — BeautifulSoup не
    знає про CSS, і це якраз те, що потрібно."""
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg", "iframe", "template"]):
        t.decompose()
    root = soup.find("main") or soup.body or soup
    for t in root.find_all(["nav", "footer", "header"]):
        t.decompose()
    text = root.get_text("\n", strip=True)
    text = BIDI.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def blocked(status: int, html: str) -> bool:
    if status in (401, 403, 429, 503):
        return True
    head = html[:20000]
    return any(m in head for m in BLOCK_MARKERS)


async def via_curl(url: str):
    async with AsyncSession(impersonate="chrome") as s:
        r = await s.get(url, timeout=25, allow_redirects=True)
        return r.status_code, r.text


def via_browser(url: str, tabs: list[str] | None, wait_ms: int):
    """Scrapling у потоці: його браузерний API синхронний."""
    from scrapling.fetchers import StealthyFetcher

    collected: list[str] = []
    missing: list[str] = []

    def action(page):
        page.wait_for_timeout(wait_ms)
        if not tabs:
            return page
        for label in tabs:
            loc = page.get_by_role("button", name=label, exact=True)
            if loc.count() == 0:
                loc = page.get_by_text(label, exact=True)
            if loc.count() == 0:
                missing.append(label)
                continue
            try:
                loc.first.click(timeout=5000)
                page.wait_for_timeout(900)
                body = page.inner_text("main") if page.locator("main").count() else page.inner_text("body")
                collected.append(f"\n\n=== {label} ===\n{body}")
            except Exception:  # noqa: BLE001 — одна вкладка не має валити всю сторінку
                missing.append(label)
        return page

    page = StealthyFetcher.fetch(
        url, headless=True, network_idle=True, solve_cloudflare=True,
        page_action=action, timeout=60000,
    )
    html = page.html_content if hasattr(page, "html_content") else str(page.body)
    return getattr(page, "status", 200), html, collected, missing


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/fetch")
async def fetch(req: FetchReq, x_token: str = Header(default="")):
    # Сервіс живе лише у внутрішній мережі Docker (без домену й портів назовні).
    # Токен — другий замок на випадок, якщо його колись відкриють: якщо
    # PROP_SCRAPER_TOKEN задано, без нього не пускаємо.
    if TOKEN and x_token != TOKEN:
        raise HTTPException(status_code=401, detail="bad token")
    t0 = time.time()
    notes: list[str] = []

    if not req.render and not req.tabs:
        try:
            status, html = await via_curl(req.url)
            if not blocked(status, html):
                text = clean_text(html)
                if len(text) >= req.min_chars:
                    return {"ok": True, "via": "curl_cffi", "status": status, "text": text,
                            "ms": int((time.time() - t0) * 1000)}
                notes.append(f"curl_cffi: мало тексту ({len(text)})")
            else:
                notes.append(f"curl_cffi: заблоковано ({status})")
        except Exception as e:  # noqa: BLE001
            notes.append(f"curl_cffi: {e}")

    try:
        status, html, tabs_text, missing = await asyncio.to_thread(via_browser, req.url, req.tabs, req.wait_ms)
        text = clean_text(html) if not tabs_text else BIDI.sub("", "".join(tabs_text)).strip()
        if missing:
            notes.append("не знайдено вкладок: " + ", ".join(missing))
        ok = len(text) >= min(req.min_chars, 500) and not blocked(status or 200, html)
        return {"ok": ok, "via": "scrapling", "status": status, "text": text, "missing_tabs": missing,
                "notes": notes, "ms": int((time.time() - t0) * 1000)}
    except Exception as e:  # noqa: BLE001
        notes.append(f"scrapling: {e}")
        return {"ok": False, "via": None, "status": None, "text": "", "notes": notes,
                "ms": int((time.time() - t0) * 1000)}
