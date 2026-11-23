#!/usr/bin/env bash
# EC2 최초 1회 설정: Docker·Compose 설치, 스왑, 배포 폴더 준비.
# Ubuntu 22.04/24.04 와 Amazon Linux 2023 을 지원합니다.
#
#   scp deploy/ec2-setup.sh <user>@<EC2 IP>:~
#   ssh <user>@<EC2 IP> 'sudo bash ~/ec2-setup.sh'
#
# 실행 후 한 번 로그아웃했다가 다시 접속해야 sudo 없이 docker를 쓸 수 있습니다.
set -euo pipefail

APP_DIR=/opt/hansei-campus
DEPLOY_USER=${SUDO_USER:-$(whoami)}

if [[ $EUID -ne 0 ]]; then
  echo "sudo로 실행하세요: sudo bash $0" >&2
  exit 1
fi

. /etc/os-release
echo "▶ OS: $PRETTY_NAME / 배포 사용자: $DEPLOY_USER"

# ── Docker + Compose 플러그인 ─────────────────────────────────────
if ! command -v docker >/dev/null; then
  case "$ID" in
    ubuntu|debian)
      apt-get update -y
      apt-get install -y ca-certificates curl
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
      chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -y
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    amzn)
      dnf install -y docker
      # AL2023 저장소에는 compose 플러그인이 없어 공식 바이너리를 받는다
      mkdir -p /usr/local/lib/docker/cli-plugins
      curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" \
        -o /usr/local/lib/docker/cli-plugins/docker-compose
      chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
      ;;
    *)
      echo "지원하지 않는 OS입니다: $ID" >&2
      exit 1
      ;;
  esac
fi
systemctl enable --now docker
usermod -aG docker "$DEPLOY_USER"
docker compose version

# ── 스왑 2GB (메모리 1GB 인스턴스에서 OOM 방지) ──────────────────
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ── 배포 폴더 ─────────────────────────────────────────────────────
mkdir -p "$APP_DIR/private"
chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
chmod 700 "$APP_DIR/private"

echo
echo "✅ 완료. 다시 로그인한 뒤 'docker ps'가 sudo 없이 되는지 확인하세요."
echo "   이후 배포는 GitHub Actions가 $APP_DIR 에 파일을 올리고 실행합니다."
