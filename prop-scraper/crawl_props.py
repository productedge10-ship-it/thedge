"""Тексти правил проп-фірм у prop-scraper/out/<firm>/*.txt.

Запуск: python prop-scraper/crawl_props.py the5ers alphacapital ...   (без аргументів — усі)
FTMO качає окремий crawl_ftmo.py (там свій sitemap). Тут решта фірм з автоімпорту
(src/lib/brokers.js). У кожної свій тип довідки:
  zendesk  — API статей (FundingPips), текст одразу в JSON;
  intercom — колекції → статті (Alpha Capital, Blue Guardian);
  pages    — список сторінок + посилання з них на тому ж домені (The5ers, CryptoFundTrader).
Уже скачане не качається вдруге: щоб оновити, видали папку фірми.
"""
import json, re, sys, time
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from curl_cffi import requests

S = requests.Session(impersonate="chrome")
BIDI = re.compile("[⁦-⁩‎‏‪-‮]")
SKIP = re.compile(r"affiliate|competition|tournament|promo|giveaway|webinar|podcast|ebook|blog/|careers|privacy|cookie|checkout|thank|gracias|unete|join|login|register|/es/|/fr/|/de/|/it/|/pt/|/ar/|/ja/|/tr/|/ru/|/zh/|/vi/|/pl/", re.I)

FIRMS = {
    "fundingpips": {"type": "zendesk", "url": "https://help.fundingpips.com/api/v2/help_center/en-us/articles.json?per_page=100"},
    "alphacapital": {"type": "intercom", "url": "https://help.alphacapitalgroup.uk/en/"},
    "blueguardian": {"type": "intercom", "url": "https://help.blueguardian.com/en/"},
    "the5ers": {"type": "pages", "url": ["https://the5ers.com/faqs/", "https://the5ers.com/high-stakes/", "https://the5ers.com/hyper-growth/", "https://the5ers.com/bootcamp/", "https://the5ers.com/terms-and-conditions/"],
                "follow": r"^https://the5ers\.com/(?!futures)[a-z0-9-]+/?$",
                "wp": "https://wp.the5ers.com/wp-json/wp/v2/faqs?per_page=100&_fields=link,title,content"},
    "cryptofundtrader": {"type": "pages", "url": ["https://cryptofundtrader.com/faq/", "https://cryptofundtrader.com/evaluation-rules/", "https://cryptofundtrader.com/terms-and-conditions/",
                                                   "https://cryptofundtrader.com/refund-policy/", "https://cryptofundtrader.com/choose-your-challenge/", "https://cryptofundtrader.com/last-updates-faq/"]},
}


def clean(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg", "iframe", "template"]):
        t.decompose()
    root = soup.find("article") or soup.find("main") or soup.body or soup
    for t in root.find_all(["nav", "footer", "header"]):
        t.decompose()
    title = (soup.title.string or "").strip() if soup.title else ""
    text = BIDI.sub("", root.get_text("\n", strip=True))
    return title, re.sub(r"\n{3,}", "\n\n", text).strip(), soup


def get(u):
    for a in range(3):
        try:
            r = S.get(u, timeout=40)
            if r.status_code == 429:
                time.sleep(10 * (a + 1)); continue
            return r
        except Exception as e:  # noqa: BLE001
            print("  ERR", u, str(e)[:80], flush=True); time.sleep(3)
    return None


def save(out, u, title, text, section="", min_len=200):
    if len(text) < min_len:
        return False
    name = re.sub(r"[^a-z0-9]+", "-", re.sub(r"^https?://", "", u).lower()).strip("-")[:120]
    (out / f"page__{name}.txt").write_text(f"URL: {u}\nTITLE: {title}\nSECTION: {section}\n\n{text}", encoding="utf-8")
    return True


def crawl(firm, cfg):
    out = Path(__file__).parent / "out" / firm
    out.mkdir(parents=True, exist_ok=True)
    have = {l.split("URL: ", 1)[1].strip() for f in out.glob("*.txt") for l in f.read_text(encoding="utf-8").splitlines()[:1] if l.startswith("URL: ")}
    n = 0
    if cfg["type"] == "zendesk":
        nxt = cfg["url"]
        while nxt:
            j = get(nxt).json()
            for a in j.get("articles", []):
                if a.get("draft") or a["html_url"] in have or SKIP.search(a["html_url"] + " " + a["title"]):
                    continue
                text = BeautifulSoup(a.get("body") or "", "html.parser").get_text("\n", strip=True)
                n += save(out, a["html_url"], a["title"], re.sub(r"\n{3,}", "\n\n", text), str(a.get("section_id") or ""))
            nxt = j.get("next_page")
    elif cfg["type"] == "intercom":
        base = cfg["url"]; seen = set(); queue = [base]; arts = {}
        while queue and len(seen) < 80:
            u = queue.pop(0)
            if u in seen: continue
            seen.add(u)
            r = get(u)
            if not r or r.status_code != 200: continue
            sec = (re.search(r"collections/\d+-([^/?#]+)", u) or [None, ""])[1]
            for a in BeautifulSoup(r.text, "html.parser").find_all("a", href=True):
                h = urljoin(u, a["href"]).split("?")[0].split("#")[0]
                if not h.startswith(base) or SKIP.search(h): continue
                if "/collections/" in h and h not in seen: queue.append(h)
                elif "/articles/" in h: arts.setdefault(h, sec)
            time.sleep(0.3)
        print(f"  статей: {len(arts)}", flush=True)
        for h, sec in arts.items():
            if h in have: continue
            r = get(h)
            if r and r.status_code == 200:
                title, text, _ = clean(r.text); n += save(out, h, title, text, sec)
            time.sleep(0.3)
    else:
        follow = re.compile(cfg["follow"]) if cfg.get("follow") else None
        queue = list(cfg["url"]); seen = set()
        while queue and len(seen) < 60:
            u = queue.pop(0)
            if u in seen: continue
            seen.add(u)
            r = get(u)
            if not r or r.status_code != 200: print("  пропуск", r and r.status_code, u, flush=True); continue
            title, text, soup = clean(r.text)
            if u not in have: n += save(out, u, title, text)
            if follow:
                for a in soup.find_all("a", href=True) if soup else []:
                    h = urljoin(u, a["href"]).split("?")[0].split("#")[0]
                    if follow.match(h) and not SKIP.search(h) and h not in seen and re.search(r"rule|faq|stake|growth|bootcamp|program|payout|scal|news|drawdown|term|evaluation|challenge|instant", h): queue.append(h)
            time.sleep(0.4)
    if cfg.get("wp"):  # WordPress REST: питання-відповіді, які сайт довантажує скриптом
        for pg in range(1, 20):
            r = get(f"{cfg['wp']}&page={pg}")
            if not r or r.status_code != 200: break
            items = r.json()
            if not items: break
            for it in items:
                title = BeautifulSoup(it["title"]["rendered"], "html.parser").get_text()
                text = BeautifulSoup(it["content"]["rendered"], "html.parser").get_text("\n", strip=True)
                u = it["link"]
                if u in have or SKIP.search(u + " " + title) or "futures" in u.lower(): continue
                n += save(out, u, title, f"{title}\n{text}", "FAQ", 40)
    files = list(out.glob("*.txt"))
    print(f"{firm}: нових {n}, усього {len(files)} сторінок, {sum(f.stat().st_size for f in files)//1000} КБ", flush=True)


for f in (sys.argv[1:] or FIRMS):
    print("==", f, flush=True)
    crawl(f, FIRMS[f])
