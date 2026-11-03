# 프로젝트 계획서 — 한세 3D 캠퍼스 (가칭)

> 2026-2 한세대학교 AI Contest 출품작
> 작성일: 2026-11-03 · 최종 수정: 2026-11-03 (기본 구조 완료) · 상태: M1 진행 중

---

## 1. 한 줄 소개

**한세대학교 캠퍼스를 게임처럼 화려한 3D로 재현하고, "○○관 가는 길 알려줘"라고 말하면 AI가 길을 찾아 카메라가 경로를 따라 날아가는 웹 서비스.**

## 2. 배경과 목표

### 2.1 문제

- 네이버·카카오·구글 지도는 캠퍼스 내부(건물 입구, 보행로, 층·강의실)를 거의 알려주지 않는다.
- 한세대는 경사지에 건물이 흩어져 있어 신입생·방문객·수험생이 건물을 찾기 어렵다.
- 학교 홍보 측면에서도 "캠퍼스를 둘러보는 경험"을 온라인으로 줄 수단이 없다.

### 2.2 목표

| 구분 | 목표 |
|---|---|
| 콘테스트 | 34개 팀 중 **"이건 저 팀만 할 수 있다"** 는 인상. 비주얼·사운드·스토리텔링으로 디자인 계열 심사위원도 압도 |
| AI 활용 | ① 제품 안의 AI(자연어 길안내) ② 개발 전 과정의 AI 활용을 **수치로** 증명 |
| 커리어 | 수상 여부와 무관하게 포트폴리오로 쓸 수 있는 완성도. 학교 홈페이지에 링크될 수준. 프론트(3D)와 백엔드(Python 데이터·API)를 모두 보여주는 풀스택 구성 |

### 2.3 교수님 피드백 반영 (2026-10-28 토의)

1. **정적 배포로 충분하다.** 무거운 서버 대신 정적 호스팅(Vercel 등)과 목(mock) JSON 데이터를 쓰되, "언제든 편집·확장 가능"하다는 것을 샘플 기능으로 보여준다.
   → 프론트는 정적 JSON만으로 완전히 동작한다. Python 백엔드는 "편집·확장 가능성"을 실제로 보여주는 **선택적 계층**으로 둔다.
2. **화려하게.** 웅장한 오프닝, BGM과 효과음(AI 생성 사운드), 영상처럼 보이는 연출을 넣는다.
3. **AI 활용량을 숫자로.** 사용한 프롬프트·토큰 총량, A4 환산 분량 등을 요약해 제출한다.
4. **평이한 주제는 피한다.** 상을 못 받더라도 커리어가 되는 결과물을 목표로 한다.
5. **AI 코딩 도구에 투자한다.** Claude Code와 Codex를 적극 활용한다.

## 3. 핵심 기능

우선순위: **P0** = 이게 없으면 데모가 성립하지 않음 · **P1** = 수상을 노리는 차별화 요소 · **P2** = 시간이 남으면

| # | 기능 | 설명 | 담당 언어 | 우선순위 |
|---|---|---|---|---|
| F1 | 3D 캠퍼스 씬 | 건물 11개 동을 층수 기반으로 입체화. 지면·보행로·나무·하늘을 스타일라이즈드 로우폴리로 표현 | TS | P0 |
| F2 | 시네마틱 인트로 | 로고 → 하늘에서 캠퍼스로 하강 → 건물이 땅에서 솟아오르는 애니메이션 + BGM | TS | P0 |
| F3 | 건물 인터랙션 | 호버 시 하이라이트, 클릭 시 카메라 비행과 정보 패널(용도·주요 시설·층 정보) | TS | P0 |
| F4 | 길찾기 | 출발지·도착지 선택 → 보행로 그래프에서 A* 탐색 → 빛나는 경로 라인 + 경로를 따라가는 카메라, 예상 소요 시간 표시 | TS | P0 |
| F5 | AI 길안내 챗봇 | 자연어 입력("학생회관에서 이공관 어떻게 가?") → 출발지·목적지 인식 → F4 실행. API 장애 시 규칙 기반 폴백 | TS | P0 |
| F6 | 정적 배포 | Vercel(정적 사이트 + 서버리스 함수 1개)로 공개 URL 제공 | TS | P0 |
| **F15** | **데이터 파이프라인** | HMH/OSM 원본 → 좌표 변환·폴리곤 정리 → `campus.json`·`paths.json`·`rooms.json` 생성. 보행로 그래프 연결성 검증 | **Python** | **P0** |
| F7 | 층 분해 뷰 | 건물 선택 시 층이 위아래로 벌어지며 층별 강의실 표시 | TS | P1 |
| F8 | 자동 캠퍼스 투어 | 미리 정한 동선으로 카메라가 순회하고 나레이션(TTS)과 자막 재생. **발표 시연용** | TS | P1 |
| F9 | 분위기 전환 | 낮/노을/밤 조명 전환. 밤에는 창문 발광과 블룸 효과 | TS | P1 |
| F10 | 사운드 디자인 | 상황별 효과음(클릭, 비행, 도착)과 BGM, 음소거 토글 | TS | P1 |
| **F16** | **캠퍼스 API + 이용 통계** | FastAPI로 캠퍼스 데이터 조회 API와 이벤트 수집(검색어·길찾기 요청)을 제공하고, 인기 목적지 등 통계를 집계 | **Python** | **P1** |
| F11 | AI 활용 대시보드 | 개발에 쓴 AI 사용량(토큰, 세션, A4 환산)과 F16 이용 통계를 시각화한 `/stats` 페이지 | TS + Python | P1 |
| F12 | 편집 모드 | 건물 정보·이벤트 마커를 화면에서 수정. 백엔드가 있으면 API로 저장하고, 없으면 localStorage에 저장한 뒤 JSON으로 내보냄 | TS + Python | P2 |
| F13 | 계절 효과 | 벚꽃·눈 파티클 | TS | P2 |
| F14 | 모바일 대응 | 터치 조작, 저사양 품질 프리셋 | TS | P2 |

## 4. 기술 스택

### 4.1 언어 원칙

- **TypeScript:** 사용자가 보는 모든 것과 AI 길안내 함수. 프론트와 함수가 타입을 공유해 응답 형식 불일치를 컴파일 단계에서 잡는다.
- **Python:** 데이터를 만들고 관리하는 쪽, 즉 데이터 파이프라인과 캠퍼스 API.
- **두 언어의 접점은 데이터 계약 하나:** Pydantic 모델을 기준으로 JSON Schema를 내보내고, 이를 TypeScript 타입으로 자동 생성한다. 데이터 형식을 바꿀 때 Python 모델 한 곳만 고치면 된다.

### 4.2 프론트엔드 (TypeScript)

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite + React + TypeScript | 빠른 개발 서버, 타입 안정성, AI 코딩 도구와의 궁합 |
| 3D | three.js, @react-three/fiber, @react-three/drei | 지도 앱 수준을 넘는 연출 자유도, 지도 토큰 불필요 |
| 이펙트 | @react-three/postprocessing (Bloom, AO, Vignette) | "화려함"의 핵심 |
| 카메라 연출 | drei `CameraControls` + GSAP | 비행·투어 시퀀스 |
| 상태 관리 | zustand | 씬과 UI 간 상태 공유 |
| UI | Tailwind CSS | 오버레이 UI를 빠르게 구성 |
| 사운드 | howler.js | BGM·효과음 관리 |
| 길찾기 | 자체 A* (보행로 그래프 JSON) | 오프라인에서도 동작, 경사로·계단 가중치 조절 |
| AI 챗봇 | Vercel Serverless Function(`web/api/guide.ts`) → LLM API(경량 모델, function calling) | API 키 은닉, 프론트와 같은 도메인이라 CORS 불필요 |
| 나레이션 | Web Speech API 또는 사전 생성 TTS 음원 | 무료, 오프라인 대비 |

### 4.3 백엔드 (Python)

| 영역 | 선택 | 이유 |
|---|---|---|
| 런타임·패키지 | Python 3.12, uv | 빠른 의존성 관리, 재현 가능한 lock 파일 |
| 데이터 모델 | Pydantic v2 | 데이터 계약의 기준. JSON Schema 내보내기 지원 |
| 지오메트리 | Shapely, pyproj | 폴리곤 정리·단순화·면적·중심점 계산, 위경도를 **EPSG:5186(한국 중부원점 TM)** 으로 정확히 투영 |
| 그래프 | NetworkX | 보행로 그래프 생성·연결성 검증(모든 건물 입구에 도달 가능한지), 경로 가중치 산출 |
| API | FastAPI + Uvicorn | 자동 OpenAPI 문서, Pydantic과 같은 모델 사용 |
| 저장소 | SQLite (SQLModel) | 편집 내용·이벤트 로그 저장. 별도 DB 서버 불필요 |
| 품질 | pytest, ruff | 파이프라인 결과 검증 테스트, 린트·포맷 |
| 배포 | Docker → Render(또는 Fly.io) 무료 플랜 | 컨테이너 하나로 배포 |

### 4.4 공통

| 영역 | 선택 |
|---|---|
| 프론트 배포 | Vercel (루트 디렉터리 `web/`) |
| CI | GitHub Actions: `web` 빌드·린트, `backend` pytest·ruff, 타입 생성 결과 최신 여부 확인 |
| 로컬 개발 | `docker compose up`으로 백엔드 실행, `npm run dev`로 프론트 실행 |

## 5. 시스템 구성

```
                    ┌──────────── 빌드 타임 (Python) ────────────┐
 HMH geojson ─┐     │  backend/campus/pipeline                   │
 HMH rooms ───┼───▶ │  좌표 투영(pyproj) · 폴리곤 정리(Shapely)   │ ──▶ web/public/data/*.json
 OSM footway ─┘     │  보행로 그래프 생성·검증(NetworkX)          │      (정적 폴백 데이터)
                    │  Pydantic 모델 → JSON Schema → TS 타입      │ ──▶ web/src/types/generated/
                    └────────────────────────────────────────────┘

┌──────────────────────── Browser (Vercel 정적 사이트) ─────────────────────────┐
│  UI Overlay (React)            3D Scene (R3F)                                │
│  ├ 검색/출발·도착 선택          ├ Campus · Buildings(층 분해)                  │
│  ├ 건물 정보 패널               ├ RouteLine (발광 경로 + 파티클)               │
│  ├ AI 채팅창                    ├ Effects (Bloom/AO)                          │
│  └ 편집 모드 · /stats           └ CameraDirector (비행·투어)                  │
│                 zustand store · dataSource(API 우선, 실패 시 정적 JSON)       │
└───────────┬─────────────────────────────────────────────┬────────────────────┘
            │ (같은 도메인)                                │ (선택, VITE_API_URL)
            ▼                                             ▼
  /api/guide (Vercel Function, TS)              Campus API (FastAPI, Python)
  └▶ LLM API (function calling)                 ├ GET  /api/v1/buildings, /graph
     → { action, from, to, message }            ├ PUT  /api/v1/buildings/{id}  (관리자 토큰)
                                                ├ POST /api/v1/events          (검색·길찾기 로그)
                                                ├ GET  /api/v1/stats           (인기 목적지·이용 통계)
                                                └ SQLite
```

### 5.1 핵심 설계 원칙: 데모는 백엔드 없이도 완벽하게 돈다

- 프론트의 `dataSource`는 `VITE_API_URL`이 설정되어 있으면 FastAPI에서 데이터를 받고, **2초 안에 응답이 없거나 실패하면 `public/data/*.json`으로 자동 전환**한다.
- 이벤트 전송은 응답을 기다리지 않고 보낸 뒤 실패해도 무시한다.
- 그래서 무료 호스팅의 콜드 스타트(첫 요청 지연)나 발표장 네트워크 장애가 데모를 망치지 않는다. 발표 직전에는 헬스체크 요청을 보내 서버를 미리 깨운다.

### 5.2 AI 길안내 흐름

1. 사용자: "도서관에서 이공관 가는 길 알려줘"
2. `/api/guide`: 시스템 프롬프트에 건물 ID·별칭 목록을 넣고, function calling으로 `navigate(from, to)`, `focus_building(id)`, `start_tour()` 중 하나를 선택하게 한다.
3. 클라이언트: 받은 액션을 실행한다. 경로를 탐색하고, 카메라가 비행하며, 챗봇이 안내 문장을 출력한다(TTS 선택).
4. 출발지가 없으면 "현재 위치(정문)"를 기본값으로 쓰거나 되묻는다.
5. 안전장치: 일일 호출 한도, 입력 길이 제한, 키는 서버 환경변수에만 둔다.
6. 질의와 결과(성공·폴백 여부)는 이벤트로 FastAPI에 보내 통계에 반영한다.

## 6. 데이터 설계

### 6.1 출처

| 데이터 | 출처 | 라이선스·조건 |
|---|---|---|
| 건물 외곽선 | OpenStreetMap (HMH `buildings.geojson`에 포함) | ODbL — **출처 표기 필수** |
| 층·강의실 폴리곤 | HMH `rooms.json` (wjdgh0628/open_source_5) | LICENSE 없음 → **원작자 허락 후 사용, README에 출처 표기** |
| 보행로 그래프 | OSM footway를 Overpass로 추출 → 파이프라인이 그래프로 변환 → geojson.io로 수작업 보정 | ODbL + 우리 팀 |
| 건물 설명·별칭 | 학교 홈페이지 등을 참고해 직접 작성 | 우리 팀 |

### 6.2 좌표계

- 파이프라인에서 위경도(EPSG:4326)를 **EPSG:5186(중부원점 TM, 미터 단위)** 으로 투영한 뒤, 캠퍼스 중심 `126.95336, 37.34524`를 원점 `(0, 0)`으로 옮긴다.
- three.js 좌표로는 `x = 동쪽(m)`, `z = -북쪽(m)`, `y = 높이(m)`로 매핑한다.
- 변환은 빌드 타임에 한 번만 하고, 프론트는 미터 좌표만 다룬다.

### 6.3 스키마 (초안 — 기준은 `backend/campus/models.py`)

```python
class Building(BaseModel):
    id: str                      # "main"
    name: str                    # "본관"
    aliases: list[str]           # ["본관", "대학본부"]
    levels: int
    basements: int
    footprint: list[tuple[float, float]]   # 로컬 미터 [x, z]
    floor_height: float = 4.5
    entrances: list[str]         # PathNode.id
    description: str = ""
    facilities: list[str] = []

class PathNode(BaseModel):
    id: str
    x: float; y: float; z: float
    type: Literal["gate", "junction", "entrance", "stairs"]

class PathEdge(BaseModel):
    a: str; b: str
    kind: Literal["walk", "stairs", "slope"]
    length: float                # 파이프라인이 계산
```

## 7. 디렉터리 구조 (예정)

```
2026AIContest/
├── web/                          # ── TypeScript ──
│   ├── api/
│   │   └── guide.ts              # AI 길안내 Vercel 함수
│   ├── public/
│   │   ├── data/                 # 파이프라인 산출물 (정적 폴백)
│   │   ├── audio/                # BGM, 효과음, 나레이션
│   │   └── models/               # (선택) glTF 랜드마크 모델
│   ├── src/
│   │   ├── scene/                # Campus, Building, Ground, Sky, Effects, RouteLine
│   │   ├── camera/               # CameraDirector, 투어 시퀀스
│   │   ├── features/             # intro, navigation(A*), guide, tour, editor, stats
│   │   ├── ui/                   # 패널, 검색, HUD
│   │   ├── store/                # zustand
│   │   ├── data/                 # dataSource (API ↔ 정적 JSON 폴백)
│   │   └── types/generated/      # Pydantic → TS 자동 생성 타입 (직접 수정 금지)
│   ├── scripts/gen-types.mjs     # JSON Schema → TS 타입
│   └── package.json
├── backend/                      # ── Python ──
│   ├── pyproject.toml            # uv
│   ├── campus/
│   │   ├── models.py             # Pydantic 모델 = 데이터 계약의 기준
│   │   ├── pipeline/             # 원본 → campus/paths/rooms.json, 그래프 검증
│   │   │   ├── project.py        # 좌표 투영
│   │   │   ├── buildings.py
│   │   │   ├── graph.py          # NetworkX 그래프 생성·검증
│   │   │   └── __main__.py       # `uv run python -m campus.pipeline`
│   │   └── api/                  # FastAPI 앱 (routers, db, settings)
│   ├── data/raw/                 # 원본 데이터 (HMH, OSM)
│   ├── tests/
│   └── Dockerfile
├── shared/schema/                # Pydantic → JSON Schema (두 언어의 접점)
├── .github/workflows/ci.yml      # backend·web 검사, 산출물·타입 최신 여부 확인
├── docker-compose.yml
└── docs/
    ├── PROJECT_PLAN.md
    └── ai-log/
```

## 8. 일정 (2주 스프린트)

> 오늘(11/3, 화)부터 2주 이내로 가정하고 **마감을 11/17(화)로 잡았다.** 공식 마감일이 확정되면 이 표를 수정한다.
> 원칙: **11/12에 기능 동결(Feature Freeze)** 하고, 나머지 기간은 완성도·발표 준비에 쓴다.

| 날짜 | 마일스톤 | 프론트 (TS) | 백엔드 (Python) |
|---|---|---|---|
| 11/3 (화) | M0 기획 | 기획 확정, 리포 세팅 | **HMH 원작자에게 데이터 사용 허락 요청** |
| 11/4–5 | M1 기본 씬 | Vite+R3F 세팅, 정적 JSON으로 건물 extrude, 카메라 컨트롤 | uv 프로젝트, Pydantic 모델, 파이프라인 v1(건물 → `campus.json`), TS 타입 생성 연결 |
| 11/6–8 | M2 인터랙션 | 건물 호버·클릭·정보 패널, A* + 경로 연출, 인트로 1차 | 파이프라인 v2: OSM footway → 보행로 그래프, NetworkX 연결성 검증, 수작업 보정 |
| 11/9–11 | M3 AI·연출 | `/api/guide` + 폴백, 채팅 UI, 포스트프로세싱, 사운드, 층 분해 뷰 | FastAPI 조회 API·이벤트 수집, Docker, Render 배포, `dataSource` 연동 |
| 11/12 (목) | **Feature Freeze** | Vercel 배포, 전체 동선 점검 | 백엔드 장애 시 정적 폴백 동작 확인 |
| 11/13–14 | M4 완성도 | 자동 투어 + 나레이션, 낮/밤 전환, `/stats` 화면 | 통계 집계 API, AI 사용량 집계, (여유 시) 편집 저장 API |
| 11/15–16 | M5 발표 준비 | 발표 자료, **시연 영상 녹화(백업용)**, 리허설 | AI 활용 수치 정리, 아키텍처 슬라이드 |
| 11/17 (화) | 제출·발표 | — | — |

## 9. 역할 분담 (가안)

| 이름 | 담당 | 주요 산출물 |
|---|---|---|
| 한시원 | 총괄 · **Python 백엔드 전체**(파이프라인·FastAPI) · AI 길안내 함수 · 배포 | `backend/`, `web/api/guide.ts`, `docker-compose.yml`, CI |
| 유재웅 | 3D 씬 · 이펙트 · 카메라 연출 · 길찾기(A*) 연출 | `web/src/scene/`, `camera/`, `features/navigation/`, 인트로·투어 |
| 조상현 | UI/UX · 채팅 UI · 사운드 · 발표 자료 · AI 활용 기록 | `web/src/ui/`, `features/guide/`, `audio/`, `docs/ai-log/`, 발표 PPT·영상 |

> 첫 회의에서 조정한다. 공통 규칙은 기능 단위 브랜치 → PR → 1명 리뷰 후 `main` 병합이다.
> 백엔드와 프론트의 접점은 `models.py`와 자동 생성 타입뿐이다. 데이터 형식 변경은 반드시 `models.py`에서 시작한다.

## 10. AI 활용 전략 (평가 어필 포인트)

| 단계 | 활용 | 기록 방법 |
|---|---|---|
| 기획 | 회의 녹취 요약, 요구사항 정리, 계획서 초안 | `docs/ai-log/`에 세션 요약 |
| 개발 | Claude Code·Codex로 코드 작성·리뷰·디버깅 | 세션별 사용량(토큰·프롬프트 수) 기록 |
| 에셋 | AI 생성 BGM·효과음·나레이션, 로고·텍스처 | 사용 도구, 프롬프트, **라이선스 확인 결과** 기록 |
| 제품 | AI 길안내 챗봇 | FastAPI 이벤트 로그로 호출 수·성공률·폴백률 집계 |

- **수치화:** 총 토큰, 세션 수, AI 생성 코드 비율, 대화량의 A4 환산 페이지 수(환산 기준 명시)를 `/stats` 페이지와 발표 자료에 넣는다.
- **기록 규칙:** 작업 세션이 끝날 때마다 `docs/ai-log/YYYY-MM-DD-이름.md`에 *무엇을 시켰고, 무엇을 얻었고, 사용량은 얼마인지* 3줄을 남긴다.

## 11. 리스크와 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| HMH 원작자 허락 지연·거절 | 층·강의실 데이터 없음 | 건물 외곽은 OSM에서 직접 추출해 P0 진행. 층 분해 뷰(P1)는 층수만으로 단순화 |
| 보행로 데이터 부재·불량 | 길찾기 품질 저하 | 파이프라인의 연결성 검증으로 끊긴 구간을 자동 탐지하고, 주요 동선부터 수작업 보정 |
| 백엔드 호스팅 콜드 스타트·장애 | API 응답 지연 | 프론트가 정적 JSON으로 자동 폴백. 발표 전 헬스체크로 서버를 미리 깨움 |
| 한시원 업무 과부하 (백엔드 + AI 함수) | 일정 지연 | FastAPI는 P1. 늦어지면 파이프라인(P0)만으로도 Python 기여가 성립. AI 함수는 짧은 코드라 우선 완료 |
| 두 언어 간 데이터 형식 불일치 | 런타임 오류 | Pydantic → TS 타입 자동 생성, CI에서 생성 결과가 최신인지 확인 |
| 발표장 PC 성능 | 프레임 저하 | 품질 프리셋(그림자·AO 끄기), 인스턴싱, 사전 녹화 영상 백업 |
| 발표장 네트워크 장애 | AI 챗봇 실패 | 규칙 기반 폴백, 로컬 빌드 실행본 준비 |
| API 키 노출·비용 | 보안·과금 | 서버리스 함수에서만 키 사용, 일일 호출 한도 |
| 2주 일정 압박 | 미완성 | P0만으로도 데모가 성립하도록 설계, 11/12 기능 동결 엄수 |
| AI 생성 음원 라이선스 | 저작권 문제 | 상업·공개 이용이 허용된 도구·플랜만 사용, 출처 기록 |

## 12. 발표 시나리오 (초안)

1. **훅 (30초):** 화면을 끄고 BGM과 함께 인트로를 재생한다. 하늘에서 캠퍼스로 내려오며 건물이 솟아오른다.
2. **문제 (30초):** "신입생 때 이공관 찾느라 헤맨 적 있으시죠?"
3. **라이브 데모 (2분):** 챗봇에 "학생회관에서 이공관 가는 길" 입력 → 경로 비행 → 층 분해 → 밤 모드 전환
4. **AI 활용 (1분):** 2주 동안 AI와 나눈 대화량(A4 환산)과 AI로 만든 사운드·코드 비율을 보여준다.
5. **확장성 (30초):** 편집 모드와 이용 통계(백엔드)를 보여주며 학교 홈페이지 연동, 행사·축제 안내로 확장할 수 있음을 제시한다.

## 13. 다음 할 일 (체크리스트)

- [ ] 공모 요강의 **평가 기준·제출물·마감일** 확인 후 이 문서 갱신
- [ ] HMH 원작자에게 데이터·코드 사용 허락 요청
- [ ] 팀 회의: 역할 확정, 프로젝트 이름 확정
- [x] `web/` 초기 세팅: Vite + React + TS + R3F (건물 렌더·클릭·A* 경로 연출·폴백 길안내까지 동작)
- [x] `backend/` 초기 세팅: uv + Pydantic 모델 + 파이프라인(OSM) + FastAPI + 테스트
- [x] 타입 자동 생성(`web/scripts/gen-types.mjs`) 연결, CI 구성
- [ ] 이름 없는 건물 3개(`osm_834838408`, `osm_834838429`, `osm_834838432`)와 층수 추정 건물 확인 → `backend/data/building_meta.json` 보강
- [ ] 기본 출발지(정문) 노드 지정 (`web/src/config.ts`의 `DEFAULT_FROM_ID`)
- [ ] Vercel(`web/`)·Render(`backend/`) 프로젝트 연결
- [ ] `docs/ai-log/` 기록 시작
