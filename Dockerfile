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

# Create a dedicated non-root system account with an explicit, reproducible
# UID/GID (1001) before any application files are copied.  Explicit IDs
# prevent the account from silently getting a different numeric ID on a
# fresh image rebuild and make permission auditing straightforward.
RUN groupadd --gid 1001 appuser \
 && useradd --uid 1001 --gid 1001 --no-create-home --shell /sbin/nologin appuser

# Install dependencies as root — pip needs write access to site-packages.
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

# Copy application files with the correct owner so no extra chown layer is
# required and the filesystem is already in the correct state before USER.
COPY --chown=appuser:appuser backend/app ./app
COPY --chown=appuser:appuser --from=frontend-build /build/frontend/dist ./static

# Drop to non-root for all subsequent layers and the runtime process.
USER appuser


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
