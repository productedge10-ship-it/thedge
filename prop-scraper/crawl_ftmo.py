"""Повний витяг правил FTMO в текстові файли (prop-scraper/out/ftmo).

Запуск: python prop-scraper/crawl_ftmo.py
Джерело — sitemap ftmo.com (robots.txt дозволяє): усі FAQ (CFD і Futures),
сторінки правил/умов і тижневі trading-updates за останній рік.
Текст чистить так само, як app.py (без скриптів, меню, підвалу).
"""
import json, re, sys, time
from pathlib import Path
from bs4 import BeautifulSoup
from curl_cffi import requests

OUT = Path(__file__).parent / "out" / "ftmo"
OUT.mkdir(parents=True, exist_ok=True)
BIDI = re.compile("[⁦-⁩‎‏‪-‮]")
S = requests.Session(impersonate="chrome")


def clean(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg", "iframe", "template"]):
        t.decompose()
    root = soup.find("main") or soup.body or soup
    for t in root.find_all(["nav", "footer", "header"]):
        t.decompose()
    title = (soup.title.string or "").strip() if soup.title else ""
    text = BIDI.sub("", root.get_text("\n", strip=True))
    return title, re.sub(r"\n{3,}", "\n\n", text).strip()


idx = S.get("https://ftmo.com/sitemap_index.xml", timeout=40).text
urls = []
for m in re.findall(r"<loc>([^<]+)</loc>", idx):
    if any(k in m for k in ("page-sitemap", "faq-sitemap", "trading-updates-sitemap")):
        t = S.get(m, timeout=60).text
        urls += re.findall(r"<url>\s*<loc>([^<]+)</loc>(?:\s*<lastmod>([^<]+)</lastmod>)?", t)

KEEP_PAGES = ("trading-objectives", "terms-and-conditions", "terms-and-policies", "forbidden-trading-practices",
              "reward-growth-and-scaling-plan", "1-step-challenge", "2-step-challenge", "instant-account",
              "comparison-table", "symbols", "trading-tools-and-services", "trading-platforms", "how-it-works",
              "news-indicator", "challenge", "general-disclosure")
pick = []
for u, mod in urls:
    if not u.startswith("https://ftmo.com/en/"):
        continue
    p = u.replace("https://ftmo.com/en/", "").strip("/")
    kind = None
    if p.startswith("faq/") or p.startswith("futures/faq/"):
        kind = "faq"
    elif p.split("/")[0] in KEEP_PAGES or (p.startswith("futures/") and p.count("/") == 1):
        kind = "page"
    elif "trading-updates/" in p and ("2026" in p) and "/category/" not in p:
        kind = "update"
    if kind:
        pick.append((u, kind, mod))

print("до скачування:", len(pick), flush=True)
index = []
for i, (u, kind, mod) in enumerate(pick, 1):
    name0 = re.sub(r"[^a-z0-9]+", "-", u.replace("https://ftmo.com/en/", "").lower()).strip("-")[:120]
    f0 = OUT / f"{kind}__{name0}.txt"
    if f0.exists():  # докачка: вже є — не качаємо знову
        index.append({"url": u, "kind": kind, "title": "", "chars": f0.stat().st_size, "lastmod": mod})
        continue
    try:
        r = S.get(u, timeout=40)
        title, text = clean(r.text)
        if r.status_code != 200 or len(text) < 200:
            print("  пропуск", r.status_code, len(text), u, flush=True)
            continue
        name = re.sub(r"[^a-z0-9]+", "-", u.replace("https://ftmo.com/en/", "").lower()).strip("-")[:120]
        (OUT / f"{kind}__{name}.txt").write_text(f"URL: {u}\nTITLE: {title}\nLASTMOD: {mod}\n\n{text}", encoding="utf-8")
        index.append({"url": u, "kind": kind, "title": title, "chars": len(text), "lastmod": mod})
    except Exception as e:  # noqa: BLE001
        print("  ERR", u, str(e)[:80], flush=True)
    if i % 25 == 0:
        print(f"  {i}/{len(pick)}", flush=True)
    time.sleep(0.4)

(OUT / "_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
print("збережено:", len(index), "сторінок,", sum(x["chars"] for x in index), "символів")
