# Honcho Memory Console runtime image for the private honcho-memory-prod sandbox.
#
# This image contains only the repo-managed console backend and the compiled Vite
# frontend bundle. Runtime credentials are injected by Docker Compose from
# /etc/honcho-memory-console/runtime.env on the VM; do not bake secrets here.

FROM node:22-bookworm-slim AS console-frontend-builder

WORKDIR /workspace/console/frontend
COPY console/frontend/package.json console/frontend/package-lock.json ./
RUN npm ci
COPY console/frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS console-runtime

COPY --from=ghcr.io/astral-sh/uv:0.9.24 /uv /bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    HOME=/app \
    UV_CACHE_DIR=/tmp/uv-cache \
    HONCHO_CONSOLE__FRONTEND_STATIC_DIR=/app/console/frontend/dist

COPY uv.lock pyproject.toml /app/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-group dev

RUN addgroup --system app \
    && adduser --system --group app \
    && mkdir -p /tmp/uv-cache /app/console/frontend/dist \
    && chown -R app:app /app /tmp/uv-cache

COPY --chown=app:app console/__init__.py /app/console/__init__.py
COPY --chown=app:app console/backend/ /app/console/backend/
COPY --from=console-frontend-builder --chown=app:app \
    /workspace/console/frontend/dist/ /app/console/frontend/dist/

USER app
EXPOSE 8080

CMD ["uvicorn", "console.backend.app.main:app", "--host", "0.0.0.0", "--port", "8080"]
