# AWS EC2 배포 가이드

심사위원이 주소 하나로 바로 접속해 테스트할 수 있도록 EC2 한 대에 전체 서비스를 올립니다.
`main` 브랜치에 push하면 GitHub Actions가 자동으로 새 버전을 배포합니다.

## 1. 구성

```
브라우저 ─▶ EC2 :80 / :443
            └ site  (Caddy)  ── /              정적 사이트 (Vite 빌드)
                              ├ /data/*        지도 JSON (api가 시작할 때 채우는 공유 볼륨)
                              ├ /api/guide  ─▶ guide (Node)    AI 길안내, Anthropic API 호출
                              └ /api/*, /health, /docs ─▶ api (FastAPI)  데이터·경로 엔진·관리자·통계
```

| 컨테이너 | 이미지 | 만드는 곳 |
|---|---|---|
| `site` | `ghcr.io/si-1-han/2026aicontest-site` | `web/Dockerfile` (target `site`) + `deploy/Caddyfile` |
| `guide` | `ghcr.io/si-1-han/2026aicontest-guide` | `web/Dockerfile` (target `guide`) — `web/api/guide.ts`를 `web/server/guide-server.ts`가 감쌈 |
| `api` | `ghcr.io/si-1-han/2026aicontest-api` | `backend/Dockerfile` |

같은 주소에서 모든 것을 제공하므로 CORS 설정이나 `VITE_API_URL` 주소 지정이 필요 없습니다.
웹 이미지는 `VITE_API_URL=/`로 빌드되어 배포판에서도 Python 경로 엔진을 씁니다.

### 자동 배포 흐름 (`.github/workflows/deploy.yml`)

1. `main`에 push (문서·`*.md`만 바뀐 커밋은 제외) 또는 Actions 탭에서 수동 실행
2. 그 커밋이 지금 `main`의 최신인지 확인 (연달아 push했을 때 옛 버전이 덮어쓰지 않게)
3. 이미지 3개 빌드 → GHCR에 `:<커밋 SHA>`, `:latest` 태그로 업로드 (TypeScript 타입 검사·Vite 빌드가 여기서 실패하면 배포 중단)
4. EC2로 `docker-compose.prod.yml`, `deploy.sh`, `.env`를 복사하고 SSH로 `deploy.sh` 실행
5. `deploy.sh`: 새 이미지 pull → 컨테이너 교체 → 헬스체크 대기 → **실패하면 직전 버전으로 자동 롤백**

## 2. 최초 1회 설정

### 2.1 EC2 인스턴스 만들기 (AWS 콘솔)

| 항목 | 권장 |
|---|---|
| AMI | Ubuntu Server 24.04 LTS (Amazon Linux 2023도 가능) |
| 인스턴스 유형 | `t3.small` (2GB). `t3.micro`(1GB)도 스왑을 켜면 동작 |
| 스토리지 | 20GB gp3 |
| 키 페어 | 새로 만들어 `.pem` 보관 (관리자 접속용) |
| 보안 그룹 인바운드 | SSH 22, HTTP 80, HTTPS 443 — 모두 `0.0.0.0/0` (22는 GitHub Actions가 접속하므로 열어 둠, 비밀번호 로그인은 기본으로 꺼져 있음) |

만든 뒤 **탄력적 IP(Elastic IP)를 할당해 인스턴스에 연결**하세요. 연결하지 않으면 인스턴스를 껐다 켤 때마다 주소가 바뀌어 심사위원에게 준 링크가 끊깁니다.

> Graviton(`t4g.*`, ARM) 인스턴스를 고르면 GitHub 변수 `EC2_PLATFORM`을 `linux/arm64`로 설정하세요.

### 2.2 서버 준비 (내 PC에서)

```bash
# Ubuntu AMI의 사용자는 ubuntu, Amazon Linux는 ec2-user
scp -i my-key.pem deploy/ec2-setup.sh ubuntu@<EC2 IP>:~
ssh -i my-key.pem ubuntu@<EC2 IP> 'sudo bash ~/ec2-setup.sh'
```

Docker·Compose 설치, 2GB 스왑, `/opt/hansei-campus` 폴더를 만듭니다.

### 2.3 GitHub Actions 전용 SSH 키

관리자용 `.pem`을 GitHub에 올리지 않도록 배포 전용 키를 따로 만듭니다.

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
ssh-copy-id -i deploy_key.pub -o "IdentityFile=my-key.pem" ubuntu@<EC2 IP>
#   ssh-copy-id가 없으면:  cat deploy_key.pub | ssh -i my-key.pem ubuntu@<EC2 IP> 'cat >> ~/.ssh/authorized_keys'
ssh-keyscan <EC2 IP>          # 출력 전체를 EC2_KNOWN_HOSTS에 넣으면 중간자 공격을 막을 수 있음 (선택)
```

### 2.4 GitHub 저장소 설정

**Settings → Secrets and variables → Actions**

| 종류 | 이름 | 값 | 필수 |
|---|---|---|---|
| Secret | `EC2_HOST` | 탄력적 IP (또는 도메인) | ✅ |
| Secret | `EC2_USER` | `ubuntu` (Amazon Linux는 `ec2-user`) | ✅ |
| Secret | `EC2_SSH_KEY` | `deploy_key` **개인 키** 파일 내용 전체 | ✅ |
| Secret | `ANTHROPIC_API_KEY` | AI 길안내용 키. 없으면 규칙 기반 폴백으로 동작 | |
| Secret | `CAMPUS_ADMIN_TOKEN` | `PUT /api/v1/buildings/{id}` 편집 토큰. 없으면 비활성화 | |
| Secret | `EC2_KNOWN_HOSTS` | `ssh-keyscan` 출력 | |
| Variable | `SITE_URL` | 심사위원에게 줄 주소 (예: `http://3.38.x.x`). Actions 화면에 링크로 표시 | |
| Variable | `SITE_ADDRESS` | 도메인을 쓸 때만 (예: `campus.example.com`) → HTTPS 자동 발급 | |
| Variable | `GUIDE_DAILY_LIMIT` | 하루 LLM 호출 상한 (기본 2000, 넘으면 그날은 폴백) | |
| Variable | `EC2_PLATFORM` / `EC2_SSH_PORT` | `linux/arm64` / SSH 포트 | |

이미지 업로드 권한(`packages: write`)은 워크플로 파일에 적혀 있어, **Settings → Actions → General → Workflow permissions**는 기본값(읽기 전용) 그대로 두어도 됩니다.

### 2.5 첫 배포

Actions 탭 → **Deploy (EC2)** → **Run workflow** (branch: `main`).
완료되면 `http://<EC2 IP>`로 접속해 확인합니다. 이후에는 `main`에 push할 때마다 자동으로 배포됩니다.

### 2.6 관리자 계정 (선택)

관리자 화면 로그인 계정은 저장소가 아니라 EC2에만 둡니다.

```bash
ssh -i my-key.pem ubuntu@<EC2 IP>
python3 /opt/hansei-campus/make_admin.py /opt/hansei-campus/private/admins.json <아이디>
```

`make_admin.py`는 첫 배포 때 EC2로 복사됩니다. 계정 파일은 바로 반영됩니다(재시작 불필요).

## 3. HTTPS (선택)

도메인이 있으면 DNS A 레코드를 탄력적 IP로 지정하고, GitHub 변수 `SITE_ADDRESS`에 도메인, `SITE_URL`에 `https://도메인`을 넣은 뒤 다시 배포하세요. Caddy가 Let's Encrypt 인증서를 자동으로 받고 갱신합니다.
HTTP로도 모든 기능이 동작하지만, 브라우저 주소창에 "주의 요함"이 표시되고 휴대폰 위치(geolocation) 같은 기능은 HTTPS에서만 쓸 수 있습니다.

## 4. 운영

```bash
cd /opt/hansei-campus
docker compose -f docker-compose.prod.yml ps              # 상태
docker compose -f docker-compose.prod.yml logs -f api     # 로그 (api / guide / site)
docker compose -f docker-compose.prod.yml restart guide   # 재시작
cat .deployed-tag                                          # 지금 배포된 커밋
```

**수동 롤백:** Actions 탭에서 예전 실행을 골라 **Re-run all jobs** 하면 그 커밋으로 다시 배포됩니다(단, 최신 커밋이 아니면 건너뛰므로 `main`을 되돌리는 커밋을 push하는 것이 가장 확실합니다).

### 데이터 정책

- **지도 데이터의 기준은 `main` 브랜치**입니다. 컨테이너가 시작될 때마다 이미지에 든 `web/public/data`로 덮어씁니다.
  관리자 화면에서 고친 건물·강의실 정보는 다음 배포(또는 재시작) 전까지만 유지되므로, 유지할 내용은 로컬에서 고쳐 커밋하세요.
- 이벤트 로그·이용 통계·`PUT /api/v1/buildings` 수정 내용은 SQLite 볼륨(`api-var`)에 저장되어 배포해도 유지됩니다.

## 5. 주의할 점

- **CI와 배포는 분리되어 있습니다.** 현재(2026-11-23) `main`의 CI는 `test:tour`·`test:main-site`·`test:site-details`가 실패하고 있어, CI 성공을 조건으로 걸면 배포가 막힙니다. 테스트를 고친 뒤 CI 통과 후에만 배포하려면 `deploy.yml` 상단 주석대로 트리거를 바꾸세요.
- **비용:** 인스턴스·EBS·탄력적 IP(퍼블릭 IPv4)는 프리 티어 조건을 벗어나면 과금됩니다. 콘테스트가 끝나면 인스턴스를 종료하고 탄력적 IP를 해제하세요.
- **API 키:** 공개 주소이므로 `guide` 서버가 IP당 분당 20회, 하루 `GUIDE_DAILY_LIMIT`회로 LLM 호출을 제한합니다. Anthropic 콘솔에서도 월 사용 한도를 걸어 두세요.
- 기존 `docker-compose.yml`(루트)은 로컬 개발용 그대로입니다. 운영 구성은 `deploy/docker-compose.prod.yml`입니다.
