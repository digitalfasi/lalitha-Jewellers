# DFX Wholesale API. Built and run by deploy/docker-compose.yml.
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Run as an ordinary user inside the container, never root.
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /data/uploads \
    && chown -R app:app /app /data
USER app

EXPOSE 8000

# Migrations only ever add (new tables / columns), and run before the app starts.
# 2 workers suit the 2-CPU server; proxy headers come from the host's nginx.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips='*'"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"
