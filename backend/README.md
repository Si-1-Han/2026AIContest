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

## 테스트 · 린트

```bash
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
