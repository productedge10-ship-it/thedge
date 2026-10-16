# Парсер для монітора правил пропів: curl_cffi + Scrapling (браузер).
# Окремий сервіс у Coolify, порт 8000, наружу не відкривати —
# сайт ходить до нього внутрішньою мережею Docker.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt \
 && scrapling install
COPY app.py .
EXPOSE 8000
HEALTHCHECK --interval=60s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
