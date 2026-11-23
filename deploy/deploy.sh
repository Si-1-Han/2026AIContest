#!/usr/bin/env bash
# EC2에서 실행되는 배포 스크립트. GitHub Actions(deploy.yml)가 SSH로 호출합니다.
#
#   echo "<GHCR 토큰>" | GHCR_USER=<github 사용자> bash /opt/hansei-campus/deploy.sh
#
# 1) GHCR 로그인 → 2) 새 이미지 pull → 3) 컨테이너 교체 후 헬스체크 대기
# 4) 실패하면 직전에 성공한 버전(.deployed-tag)으로 자동 롤백
set -euo pipefail

APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"
COMPOSE=(docker compose -f docker-compose.prod.yml)

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
NEW_TAG=$(env_get IMAGE_TAG)
PREV_TAG=$(cat .deployed-tag 2>/dev/null || true)
SITE_ADDRESS=$(env_get SITE_ADDRESS || true)
echo "▶ 배포: ${PREV_TAG:-(처음)} → $NEW_TAG"

# 토큰은 프로세스 목록에 보이지 않도록 표준 입력으로 받는다
if [[ -n "${GHCR_USER:-}" ]] && read -r -t 5 GHCR_TOKEN && [[ -n "$GHCR_TOKEN" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

up() { "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 180; }

smoke() {
  # 도메인(HTTPS)일 때는 인증서 발급이 끝나기 전일 수 있어 컨테이너 헬스체크만 본다
  [[ -n "$SITE_ADDRESS" ]] && return 0
  for _ in 1 2 3 4 5; do
    curl -fsS -o /dev/null http://127.0.0.1/ && curl -fsS http://127.0.0.1/health && echo && return 0
    sleep 3
  done
  return 1
}

"${COMPOSE[@]}" pull --quiet
if up && smoke; then
  echo "$NEW_TAG" > .deployed-tag
  echo "✅ 배포 성공: $NEW_TAG"
else
  echo "❌ 새 버전이 정상 기동하지 않았습니다." >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --tail 80 >&2 || true
  if [[ -n "$PREV_TAG" && "$PREV_TAG" != "$NEW_TAG" ]]; then
    echo "↩ 이전 버전($PREV_TAG)으로 롤백합니다." >&2
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$PREV_TAG/" .env
    "${COMPOSE[@]}" pull --quiet && up || echo "롤백도 실패했습니다. EC2에서 직접 확인하세요." >&2
  fi
  exit 1
fi

# 7일 넘은 미사용 이미지만 정리 (직전 버전은 롤백용으로 남김)
docker image prune -af --filter "until=168h" >/dev/null || true
