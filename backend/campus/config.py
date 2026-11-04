"""경로와 캠퍼스 상수. 파이프라인과 API가 함께 쓴다."""

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent

RAW_DIR = BACKEND_DIR / "data" / "raw"
RAW_OSM_PATH = RAW_DIR / "osm.json"
BUILDING_META_PATH = BACKEND_DIR / "data" / "building_meta.json"
INTERIOR_DIR = BACKEND_DIR / "data" / "interior"  # 층·강의실 원본 (팀 관리)

# 원본 건물 외곽이 OSM 건물을 이 비율 이상 덮으면 하나의 건물로 합친다 (예: 본관 + 대강당 동)
MERGE_COVERAGE = 0.7

INTERIOR_ATTRIBUTION = (
    "층·강의실: HMH 한세대학교 3D 캠퍼스맵(wjdgh0628/open_source_5) 기반, 팀 보완"
)

WEB_DATA_DIR = REPO_ROOT / "web" / "public" / "data"
SCHEMA_PATH = REPO_ROOT / "shared" / "schema" / "campus.schema.json"

# 캠퍼스 원점 (lon, lat). three.js 좌표 (0, 0, 0)이 이 지점이다.
ORIGIN_LON_LAT: tuple[float, float] = (126.95336, 37.34524)

# 한국 중부원점 TM (미터 단위). 위경도를 이 좌표계로 투영한 뒤 원점을 뺀다.
TARGET_CRS = "EPSG:5186"

# Overpass 조회 범위 (south, west, north, east)
BBOX: tuple[float, float, float, float] = (37.3401, 126.9488, 37.3496, 126.9585)

# OSM의 한세대학교 경계 (amenity=university)
CAMPUS_BOUNDARY_WAY_ID = 156206593

# 캠퍼스 밖 주변 건물은 원점에서 이 반경(m) 안에 있는 것만 배경으로 렌더링한다.
CONTEXT_RADIUS_M = 450.0

# 보행로 그래프는 캠퍼스 경계에서 이 거리(m)만큼 넓힌 영역까지 포함한다.
GRAPH_BOUNDARY_BUFFER_M = 40.0

# 건물 입구를 보행로에 연결할 때 허용하는 최대 거리(m)
MAX_ENTRANCE_LINK_M = 80.0

DEFAULT_LEVELS = 3
DEFAULT_FLOOR_HEIGHT_M = 3.6

ATTRIBUTION = "© OpenStreetMap contributors (ODbL 1.0)"
