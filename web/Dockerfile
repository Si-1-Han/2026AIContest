# 웹 이미지 2종. 빌드 컨텍스트는 저장소 루트입니다.
#   docker build -f web/Dockerfile --target site  -t hansei-campus-site  .   # 정적 사이트 + 리버스 프록시 (Caddy)
#   docker build -f web/Dockerfile --target guide -t hansei-campus-guide .   # AI 길안내 서버 (Node)

FROM node:22-alpine AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# 프론트가 직접 import하는 원본 데이터 (강의실 유형·시간표 색인)
COPY backend/data/interior ../backend/data/interior
COPY backend/data/timetable_sources ../backend/data/timetable_sources
# '/' = Campus API를 같은 주소(Caddy가 /api/v1로 넘겨 줌)에서 쓴다. config.ts가 끝의 '/'를 지워 ''가 된다.
ARG VITE_API_URL=/
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build && npm run build:server

# ── AI 길안내 서버 (POST /api/guide) ───────────────────────────────
FROM node:22-alpine AS guide
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/web/dist-server/guide-server.mjs ./guide-server.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "guide-server.mjs"]

# ── 정적 사이트 + 리버스 프록시 ─────────────────────────────────────
FROM caddy:2-alpine AS site
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv/site
EXPOSE 80 443
