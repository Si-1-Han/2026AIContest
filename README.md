# 🏛️ 한세 3D 캠퍼스 (가칭)

> **말하면 길을 그려주는, 한세대학교 3D 캠퍼스 내비게이터**
> 2026-2 한세대학교 AI Contest 출품작 · 컴퓨터공학과 팀

한세대학교 캠퍼스를 게임처럼 화려한 3D로 재현한 웹 서비스입니다.
"학생회관에서 이공관 어떻게 가?"라고 물으면 AI가 출발지와 목적지를 알아듣고, 빛나는 경로를 따라 카메라가 캠퍼스를 날아갑니다.

> 🚧 **현재 상태 (2026-11-04):** 3D 캠퍼스, 층 분해 뷰와 층별 강의실(963개 공간·시설), A* 길찾기 연출, 강의실까지 알아듣는 규칙 기반 길안내가 동작합니다.
> 자세한 내용은 [📄 프로젝트 계획서](docs/PROJECT_PLAN.md)를 참고하세요.

---

## ✨ 주요 기능 (계획)

| | 기능 | 설명 |
|---|---|---|
| 🎬 | **시네마틱 인트로** | 하늘에서 캠퍼스로 내려오며 건물이 땅에서 솟아오르는 오프닝과 BGM |
| 🏢 | **3D 캠퍼스** | 건물 11개 동을 스타일라이즈드 3D로 재현. 낮/노을/밤 전환과 블룸 효과 |
| 🧭 | **길찾기** | 보행로 그래프를 A*로 탐색하고, 발광 경로와 따라가는 카메라로 안내 |
| 🤖 | **AI 길안내 챗봇** | 자연어로 묻고 답하는 길안내. 네트워크 장애 시 규칙 기반 폴백 |
| 🧱 | **층 분해 뷰 · 강의실** | 건물을 선택하면 층이 벌어지고, 층을 고르면 강의실·시설이 나타남. "이공관 301호 어디야?"로 바로 이동 |
| 🎥 | **자동 캠퍼스 투어** | 나레이션과 자막이 있는 카메라 투어 |
| 🐍 | **데이터 파이프라인** | 원본 지도 데이터를 3D 좌표로 변환하고 보행로 그래프를 생성·검증 (Python) |
| 📈 | **캠퍼스 API · 이용 통계** | 캠퍼스 데이터 조회·편집 API, 인기 목적지 등 이용 통계 (FastAPI) |
| 📊 | **AI 활용 대시보드** | 이 프로젝트를 만드는 데 쓴 AI 사용량을 시각화 |
| ✏️ | **편집 모드** | 건물 정보와 마커를 수정해 API로 저장하거나 JSON으로 내보내기 |

## 🛠️ 기술 스택

**TypeScript: 사용자가 보는 모든 것**
- **Frontend:** Vite · React · TypeScript · Tailwind CSS
- **3D:** three.js · React Three Fiber · drei · postprocessing · GSAP
- **State / Audio:** zustand · howler.js
- **AI 길안내:** Vercel Serverless Function + LLM API (function calling)

**Python: 데이터를 만들고 관리하는 쪽**
- **데이터 파이프라인:** Pydantic v2 · Shapely · pyproj(EPSG:5186) · NetworkX
- **Campus API:** FastAPI · SQLModel(SQLite) · Uvicorn
- **Tooling:** uv · pytest · ruff · Docker

**연결:** Pydantic 모델 → JSON Schema → TypeScript 타입 자동 생성 (데이터 계약 단일화)
**배포:** Vercel(`web/`) · Render(`backend/`, Docker) · GitHub Actions

## 🗺️ 시스템 구성

```
[빌드 타임 · Python]  HMH/OSM 원본 ─▶ 파이프라인 ─▶ web/public/data/*.json + TS 타입

[Browser · TypeScript]
  React UI ─┬─ zustand ─ R3F 3D 씬 (건물·경로·이펙트·카메라)
            ├─▶ /api/guide (Vercel 함수) ─▶ LLM API
            └─▶ Campus API (FastAPI, 선택) ─ 조회 · 편집 · 이용 통계
                 └ 응답이 없으면 정적 JSON으로 자동 폴백 → 데모는 백엔드 없이도 동작
```

## 📁 프로젝트 구조

```
├── web/                      # TypeScript
│   ├── api/guide.ts          # AI 길안내 서버리스 함수 (Vercel)
│   ├── public/data/          # 파이프라인 산출물 (커밋됨, 정적 폴백, floors/<건물>.json)
│   ├── scripts/gen-types.mjs # JSON Schema → TS 타입
│   └── src/
│       ├── scene/            # 지면·건물·보행로·경로·이펙트
│       ├── camera/           # 인트로·건물 비행·경로 맞춤
│       ├── features/         # navigation(A*), guide(폴백 매처·클라이언트)
│       ├── ui/               # HUD, 건물 패널, 길안내 입력창
│       ├── store/            # zustand
│       ├── data/             # dataSource (API ↔ 정적 JSON 폴백)
│       └── types/generated/  # 자동 생성 타입 (직접 수정 금지)
├── backend/                  # Python (uv) — 자세한 내용은 backend/README.md
│   ├── campus/models.py      # 데이터 계약의 기준 (Pydantic)
│   ├── campus/pipeline/      # OSM → JSON 변환, 보행로 그래프 생성·검증
│   ├── campus/api/           # FastAPI
│   ├── data/                 # OSM 원본, 건물 메타데이터, interior/(층·강의실 원본)
│   └── tests/
├── shared/schema/            # Pydantic → JSON Schema (두 언어의 접점)
├── .github/workflows/ci.yml
├── docker-compose.yml
└── docs/                     # 계획서, AI 활용 기록
```

## 🚀 시작하기

**필요한 것:** Node.js 22+, (백엔드 작업 시) [uv](https://docs.astral.sh/uv/)

```bash
git clone https://github.com/Si-1-Han/2026AIContest.git
cd 2026AIContest/web
npm install
npm run dev          # http://localhost:5173
```

프론트만 작업한다면 여기까지면 됩니다. 캠퍼스 데이터(`web/public/data`)는 이미 커밋되어 있어요.

**백엔드 (Python)**

```bash
cd backend
uv sync
uv run python -m campus.pipeline build     # 데이터 다시 생성
uv run uvicorn campus.api.main:app --reload  # API → http://localhost:8000/docs
uv run pytest                                # 테스트
```

API를 프론트에 연결하려면 `web/.env.local`에 `VITE_API_URL=http://localhost:8000`을 넣습니다. 비워 두면 정적 JSON만 사용해요. Docker가 있다면 저장소 루트에서 `docker compose up --build`로도 API를 띄울 수 있어요.

**데이터 형식을 바꿀 때**

1. `backend/campus/models.py`를 수정합니다.
2. `backend`에서 `uv run python -m campus.pipeline all`을 실행합니다. (`all`은 fetch부터 다시 하니, 원본 갱신이 필요 없으면 `build`와 `schema`만 실행하세요.)
3. `web`에서 `npm run gen:types`를 실행합니다.

CI가 생성 결과가 커밋된 것과 같은지 검사합니다.

## 📅 일정

| 기간 | 마일스톤 |
|---|---|
| 11/3 | 기획·리포 세팅 |
| 11/4–5 | 기본 3D 씬 · 데이터 파이프라인 v1 |
| 11/6–8 | 건물 인터랙션 · 길찾기 · 보행로 그래프 |
| 11/9–11 | AI 챗봇 · 사운드 · 아트 · FastAPI |
| **11/12** | **기능 동결 · 배포** |
| 11/13–16 | 완성도 · 투어 · 발표 준비 |
| 11/17 | 제출·발표 (마감일 확정 시 갱신) |

## 👥 팀

| 이름 | 역할 (가안) |
|---|---|
| 한시원 | 총괄 · Python 백엔드(파이프라인 · FastAPI) · AI 길안내 함수 · 배포 |
| 유재웅 | 3D 씬 · 이펙트 · 카메라 연출 · 길찾기 연출 |
| 조상현 | UI/UX · 채팅 UI · 사운드 · 발표 · AI 활용 기록 |

## 🤝 협업 규칙

- 기능 단위 브랜치(`feat/…`, `fix/…`) → PR → 1명 리뷰 후 `main` 병합
- 커밋 메시지: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`
- AI로 작업한 세션은 `docs/ai-log/`에 기록 ([작성 규칙](docs/ai-log/README.md))

## 📜 데이터 출처 및 감사

- 건물 외곽선: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)
- 층·강의실 데이터: [HMH – 한세대학교 3D 캠퍼스맵](https://github.com/wjdgh0628/open_source_5) 팀의 데이터를 원작자 허락을 받아 사용하고, 팀에서 시설물 분류·대강당 데이터를 보완했습니다. ([backend/data/interior](backend/data/interior/README.md))
- 건물 공식 이름·층별 안내 요약: [한세대학교 사이버투어](https://hansei.ac.kr/view.do?no=10270)
