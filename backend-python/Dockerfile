FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home pios && mkdir -p /app/data/uploads && chown -R pios:pios /app/data
COPY backend-python/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend-python/pios /app/pios
COPY backend-python/migrations/P*.sql /app/python-migrations/
COPY backend-python/migrations/legacy /app/migrations
# Python extensions live next to the package; original Flyway SQL remains unchanged.
USER pios
EXPOSE 8080
CMD ["uvicorn", "pios.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080", "--no-proxy-headers", "--no-access-log"]
