# prop-scraper

Сервіс сторінок для монітора правил пропів. Деталі — у шапці `app.py`.

Змінні: `PROP_SCRAPER_TOKEN` (той самий у сайті).
Сайт: `PROP_SCRAPER_URL=http://<ім'я сервісу в Coolify>:8000`, `PROP_SCRAPER_TOKEN`.

Перевірка: `curl -X POST $URL/fetch -H "x-token: $TOKEN" -H "content-type: application/json" -d '{"url":"https://ftmo.com/en/trading-objectives/"}'`
