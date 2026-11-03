# Campus API 컨테이너. 빌드 컨텍스트는 저장소 루트입니다.
#   docker build -f backend/Dockerfile -t hansei-campus-api .
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app/backend

# 의존성 레이어 (pyproject/uv.lock이 바뀔 때만 다시 설치)
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/campus ./campus
RUN uv sync --frozen --no-dev

# 파이프라인 산출물을 이미지에 포함 (docker compose에서는 볼륨으로 덮어씀)
COPY web/public/data /app/data

ENV CAMPUS_DATA_DIR=/app/data \
    CAMPUS_DATABASE_URL=sqlite:////app/var/app.db

EXPOSE 8000
# Render 등은 PORT 환경변수로 포트를 지정한다.
CMD ["sh", "-c", "uvicorn campus.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
