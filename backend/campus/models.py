"""데이터 계약의 기준(single source of truth).

여기 정의한 모델이 JSON Schema(`shared/schema/campus.schema.json`)로 내보내지고,
프론트엔드의 TypeScript 타입(`web/src/types/generated/campus.ts`)으로 자동 생성된다.
데이터 형식을 바꿀 때는 반드시 이 파일부터 수정한다.

좌표 규약: 모든 좌표는 캠퍼스 원점 기준 로컬 미터이며 three.js 축을 따른다.
  x = 동쪽(+), z = 남쪽(+) (북쪽이 -z), y = 높이
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Point2 = tuple[float, float]
"""[x, z] 로컬 미터 좌표"""


class Contract(BaseModel):
    # 내보내는 JSON에는 기본값이 있는 필드도 항상 들어가므로, 스키마에서도 필수로 표시한다.
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


# ── 캠퍼스 데이터 (파이프라인 산출물: campus.json) ──────────────────────────────


class FloorInfo(Contract):
    """층 요약. 강의실 상세는 floors/<building_id>.json에서 따로 불러온다."""

    index: int = Field(ge=0, description="아래부터 0, 1, 2 … (지하층 포함)")
    level: int = Field(description="지하 1층 = -1, 지상 1층 = 1")
    label: str = Field(description="표시 이름 (예: B1, 3F)")
    outline: list[Point2] = Field(description="이 층의 외곽선")
    room_count: int = Field(ge=0, description="강의실 등 '공간' 수 (시설물 제외)")


class Volume(Contract):
    """층 데이터가 없는 보조 덩어리 (부속동 등). 캠퍼스 보기에서만 그린다."""

    footprint: list[Point2]
    base: float = Field(ge=0, description="바닥 높이(m)")
    height: float = Field(gt=0, description="높이(m)")


class Building(Contract):
    """캠퍼스 건물. 클릭·길찾기·AI 안내의 대상."""

    id: str = Field(description="고유 ID (예: main)")
    name: str = Field(description="표시 이름 (예: 본관)")
    aliases: list[str] = Field(default_factory=list, description="AI·검색용 별칭")
    osm_id: int | None = None
    levels: int = Field(ge=1, description="지상 층수")
    levels_estimated: bool = Field(
        default=False, description="OSM에 층수가 없어 기본값을 썼으면 true"
    )
    basements: int = Field(default=0, ge=0)
    floor_height: float = Field(gt=0, description="층고(m)")
    footprint: list[Point2] = Field(description="외곽선 (닫는 점 제외)")
    center: Point2
    entrances: list[str] = Field(default_factory=list, description="PathNode.id 목록")
    description: str = ""
    facilities: list[str] = Field(default_factory=list)
    has_interior: bool = Field(default=False, description="층·강의실 데이터가 있으면 true")
    floors: list[FloorInfo] = Field(
        default_factory=list, description="아래층부터. 비어 있으면 footprint로 단순 렌더링"
    )
    volumes: list[Volume] = Field(default_factory=list)


class ContextBuilding(Contract):
    """캠퍼스 밖 주변 건물. 배경으로만 렌더링한다."""

    footprint: list[Point2]
    height: float


class CampusData(Contract):
    schema_version: Literal[1] = 1
    # 생성 시각 대신 원본 기준 시각을 써서, 같은 원본이면 산출물이 항상 같게 한다.
    source_timestamp: str = Field(description="원본 OSM 데이터 기준 시각")
    origin: tuple[float, float] = Field(description="원점 (lon, lat)")
    crs: str
    attribution: str
    boundary: list[Point2] = Field(description="캠퍼스 경계")
    buildings: list[Building]
    context: list[ContextBuilding]


# ── 건물 내부 (floors/<building_id>.json) ───────────────────────────────────────

RoomCategory = Literal["공간", "시설물"]


class Room(Contract):
    id: str = Field(description="<building_id>:<층 index>:<원본 배열 index>")
    name: str
    type: str = Field(description="원본 분류 (예: 강의실,세미나실,멀티실)")
    category: RoomCategory = Field(description="공간 = 강의실 등, 시설물 = 계단·엘베·화장실·출입구")
    group: str | None = Field(default=None, description="같이 선택할 시설물 묶음 (stairs 등)")
    space_group: str | None = Field(default=None, description="예: main-auditorium")
    description: str = ""
    tags: list[str] = Field(default_factory=list, description="검색용 별칭 (예: 영비스터디룸)")
    color: str
    polygon: list[Point2]
    holes: list[list[Point2]] = Field(default_factory=list)


class InteriorFloor(Contract):
    index: int
    level: int
    label: str
    outline: list[Point2]
    rooms: list[Room]


class BuildingInterior(Contract):
    schema_version: Literal[1] = 1
    building_id: str
    attribution: str
    floors: list[InteriorFloor]


class RoomIndexEntry(Contract):
    """길안내·검색용 경량 목록 (rooms-index.json)"""

    id: str
    building_id: str
    floor_index: int
    floor_label: str
    name: str
    category: RoomCategory
    tags: list[str]


class RoomIndex(Contract):
    rooms: list[RoomIndexEntry]


# ── 보행로 그래프 (paths.json) ──────────────────────────────────────────────────


class PathNode(Contract):
    id: str
    x: float
    y: float = 0.0
    z: float
    type: Literal["junction", "entrance", "gate", "stairs"] = "junction"
    building_id: str | None = Field(default=None, description="입구 노드면 건물 ID")


class PathEdge(Contract):
    a: str
    b: str
    kind: Literal["walk", "stairs", "road"]
    length: float = Field(ge=0, description="미터")


class PathGraph(Contract):
    schema_version: Literal[1] = 1
    nodes: list[PathNode]
    edges: list[PathEdge]


# ── 건물 색인 (buildings-index.json): AI 안내 함수·폴백 검색용 경량 목록 ──────────


class BuildingIndexEntry(Contract):
    id: str
    name: str
    aliases: list[str]


class BuildingIndex(Contract):
    buildings: list[BuildingIndexEntry]


# ── AI 길안내 응답 계약 (web/api/guide.ts ↔ 프론트) ─────────────────────────────


class NavigateAction(Contract):
    action: Literal["navigate"]
    from_id: str | None = Field(default=None, description="없으면 정문 등 기본 출발지")
    to_id: str
    room_id: str | None = Field(default=None, description="도착 건물 안의 강의실 (Room.id)")
    message: str


class FocusBuildingAction(Contract):
    action: Literal["focus_building"]
    building_id: str
    room_id: str | None = Field(default=None, description="건물 안의 강의실 (Room.id)")
    message: str


class StartTourAction(Contract):
    action: Literal["start_tour"]
    message: str


class UnknownAction(Contract):
    action: Literal["unknown"]
    message: str


GuideAction = Annotated[
    NavigateAction | FocusBuildingAction | StartTourAction | UnknownAction,
    Field(discriminator="action"),
]


class GuideRequest(Contract):
    query: str = Field(min_length=1, max_length=200)


class GuideResponse(Contract):
    result: GuideAction
    source: Literal["llm", "fallback"]


# ── Campus API (FastAPI) ────────────────────────────────────────────────────────


class BuildingPatch(Contract):
    """편집 모드에서 수정 가능한 필드. 지오메트리는 파이프라인에서만 바뀐다."""

    name: str | None = Field(default=None, min_length=1, max_length=50)
    aliases: list[str] | None = None
    description: str | None = Field(default=None, max_length=2000)
    facilities: list[str] | None = None


EventType = Literal["search", "route", "guide", "building_view"]


class EventIn(Contract):
    type: EventType
    target_id: str | None = Field(default=None, max_length=64)
    query: str | None = Field(default=None, max_length=200)
    success: bool | None = None


class TopDestination(Contract):
    building_id: str
    count: int


class StatsOut(Contract):
    total_events: int
    by_type: dict[str, int]
    top_destinations: list[TopDestination]
    guide_success_rate: float | None


class Health(Contract):
    status: Literal["ok"]
    buildings: int
    nodes: int
