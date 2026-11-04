# backend — 데이터 파이프라인 · Campus API (Python)

## 준비

[uv](https://docs.astral.sh/uv/)가 필요합니다. Python 3.12는 uv가 자동으로 설치합니다.

```bash
cd backend
uv sync
```

## 데이터 파이프라인

```bash
uv run python -m campus.pipeline fetch    # OSM 원본 → data/raw/osm.json (네트워크 필요)
uv run python -m campus.pipeline build    # 원본 → web/public/data/{campus,paths,buildings-index}.json
uv run python -m campus.pipeline schema   # 모델 → shared/schema/campus.schema.json
```

- `build`는 OSM 건물에 `data/interior/`의 층·강의실을 붙입니다. 원본 외곽이 70% 이상 덮는 OSM 건물은 한 건물로 합칩니다(예: 본관 + 대강당 동). 형식은 [data/interior/README.md](data/interior/README.md)를 참고하세요.
- `build`는 리포트를 출력합니다. 이름 없는 건물, 층수 추정 건물, 보행로에 연결되지 않은 건물이 나오면 `data/building_meta.json`을 보강하세요.
- `data/raw/osm.json`은 커밋합니다. 같은 원본에서 항상 같은 결과가 나오도록 하기 위해서예요. OSM을 갱신하고 싶을 때만 `fetch`를 다시 실행합니다.
- 데이터 형식은 `campus/models.py`에서만 바꿉니다. 바꾼 뒤에는 `schema`를 실행하고, `web`에서 `npm run gen:types`를 실행합니다.

## Campus API

```bash
uv run uvicorn campus.api.main:app --reload    # http://localhost:8000/docs
```

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 상태 확인 (서버 깨우기용) |
| GET | `/api/v1/campus` | 캠퍼스 데이터 (편집 내용 반영) |
| GET | `/api/v1/graph` | 보행로 그래프 |
| GET | `/api/v1/buildings/{id}` | 건물 하나 |
| GET | `/api/v1/buildings/{id}/interior` | 층·강의실 |
| POST | `/api/v1/route` | 경로·단계별 안내 (아래 참고) |
| PUT | `/api/v1/buildings/{id}` | 건물 정보 수정 (`X-Admin-Token` 필요) |
| POST | `/api/v1/events` | 검색·길찾기·AI 안내 이벤트 기록 |
| GET | `/api/v1/stats` | 이용 통계 |

환경변수 (`backend/.env` 가능, `.env.example` 참고)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `CAMPUS_DATA_DIR` | `web/public/data` | 파이프라인 산출물 위치 |
| `CAMPUS_DATABASE_URL` | `sqlite:///backend/data/app.db` | 편집·이벤트 저장소 |
| `CAMPUS_ADMIN_TOKEN` | (비어 있음) | 비어 있으면 편집 API 비활성화 |
| `CAMPUS_CORS_ORIGINS` | `["http://localhost:5173"]` | 허용할 프론트 주소 (JSON 배열) |

## 경로 엔진 (`campus/routing/`)

```http
POST /api/v1/route
{ "origin": {"building_id": "music"},
  "destination": {"building_id": "science", "room_id": "science:2:4"},
  "profile": "recommended" }   // recommended | accessible | walkway
```

- **출입구 자동 선택:** 보행로 그래프에 가상 출발점 S와 도착점 T를 붙입니다. S와 T는 각 건물의 모든 출입구에 연결되고, 그 간선 비용은 "강의실 ↔ 출입구" 실내 이동 시간(층 이동 포함)입니다. S→T 최단 경로를 찾으면 출입구 조합까지 함께 최적화됩니다. 예를 들어 본관 2층 대강당으로 갈 때는 경사지 쪽 2층 출입구로 들어갑니다.
- **모드:**
  - `accessible`: 계단 간선을 빼고, 층 이동은 엘리베이터로 합니다. 엘리베이터 정보가 없으면 경고합니다.
  - `walkway`: 차도 구간을 1.6배 멀게 봅니다.
- **대안 경로:** Yen 알고리즘(`nx.shortest_simple_paths`)으로 찾습니다. 비용이 최단의 1.5배 이내이고 겹침이 60% 미만인 경로를 최대 2개까지 줍니다.
- **안내 문장:** 8m 앞뒤 방향으로 꺾임을 판정하고, 18m 안의 건물을 랜드마크로 씁니다. 방위, 차도 주의, 실내 층 이동 안내도 넣습니다(`directions.py`).
- 속도·층 이동 시간 상수는 `engine.py` 위쪽에 있습니다. 현재 값은 보행 1.25m/s, 계단 16초/층, 엘리베이터 대기 40초 + 3초/층입니다.

## 테스트 · 린트

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
