# ---------------------------------------------------------
# Stage 1: Build the React frontend
# ---------------------------------------------------------
FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./

RUN npm ci

COPY frontend/ ./

RUN npm run build


# ---------------------------------------------------------
# Stage 2: Build the runtime application
# ---------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt

RUN python -m pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

COPY --from=frontend-build /build/frontend/dist ./static


# ---------------------------------------------------------
# Runtime
# ---------------------------------------------------------
EXPOSE 8000

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=10s \
    --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
