/* eslint-disable */
/**
 * 자동 생성 파일 — 직접 수정하지 마세요.
 * 기준: backend/campus/models.py
 * 갱신: (backend) uv run python -m campus.pipeline schema → (web) npm run gen:types
 */

/**
 * 자동 생성 파일 — backend/campus/models.py를 수정하세요.
 */
export interface CampusContracts {}
/**
 * 캠퍼스 건물. 클릭·길찾기·AI 안내의 대상.
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "Building".
 */
export interface Building {
  /**
   * 고유 ID (예: main)
   */
  id: string;
  /**
   * 표시 이름 (예: 본관)
   */
  name: string;
  /**
   * AI·검색용 별칭
   */
  aliases: string[];
  osm_id: number | null;
  /**
   * 지상 층수
   */
  levels: number;
  /**
   * OSM에 층수가 없어 기본값을 썼으면 true
   */
  levels_estimated: boolean;
  basements: number;
  /**
   * 층고(m)
   */
  floor_height: number;
  /**
   * 외곽선 (닫는 점 제외)
   */
  footprint: [number, number][];
  /**
   * @minItems 2
   * @maxItems 2
   */
  center: [number, number];
  /**
   * PathNode.id 목록
   */
  entrances: string[];
  description: string;
  facilities: string[];
  /**
   * 층·강의실 데이터가 있으면 true
   */
  has_interior: boolean;
  /**
   * 아래층부터. 비어 있으면 footprint로 단순 렌더링
   */
  floors: FloorInfo[];
  volumes: Volume[];
}
/**
 * 층 요약. 강의실 상세는 floors/<building_id>.json에서 따로 불러온다.
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "FloorInfo".
 */
export interface FloorInfo {
  /**
   * 아래부터 0, 1, 2 … (지하층 포함)
   */
  index: number;
  /**
   * 지하 1층 = -1, 지상 1층 = 1
   */
  level: number;
  /**
   * 표시 이름 (예: B1, 3F)
   */
  label: string;
  /**
   * 이 층의 외곽선
   */
  outline: [number, number][];
  /**
   * 강의실 등 '공간' 수 (시설물 제외)
   */
  room_count: number;
}
/**
 * 층 데이터가 없는 보조 덩어리 (부속동 등). 캠퍼스 보기에서만 그린다.
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "Volume".
 */
export interface Volume {
  footprint: [number, number][];
  /**
   * 바닥 높이(m)
   */
  base: number;
  /**
   * 높이(m)
   */
  height: number;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "BuildingIndex".
 */
export interface BuildingIndex {
  buildings: BuildingIndexEntry[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "BuildingIndexEntry".
 */
export interface BuildingIndexEntry {
  id: string;
  name: string;
  aliases: string[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "BuildingInterior".
 */
export interface BuildingInterior {
  schema_version: 1;
  building_id: string;
  attribution: string;
  floors: InteriorFloor[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "InteriorFloor".
 */
export interface InteriorFloor {
  index: number;
  level: number;
  label: string;
  outline: [number, number][];
  rooms: Room[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "Room".
 */
export interface Room {
  /**
   * <building_id>:<층 index>:<원본 배열 index>
   */
  id: string;
  name: string;
  /**
   * 원본 분류 (예: 강의실,세미나실,멀티실)
   */
  type: string;
  /**
   * 공간 = 강의실 등, 시설물 = 계단·엘베·화장실·출입구
   */
  category: '공간' | '시설물';
  /**
   * 같이 선택할 시설물 묶음 (stairs 등)
   */
  group: string | null;
  /**
   * 예: main-auditorium
   */
  space_group: string | null;
  description: string;
  /**
   * 검색용 별칭 (예: 영비스터디룸)
   */
  tags: string[];
  color: string;
  polygon: [number, number][];
  holes: [number, number][][];
}
/**
 * 편집 모드에서 수정 가능한 필드. 지오메트리는 파이프라인에서만 바뀐다.
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "BuildingPatch".
 */
export interface BuildingPatch {
  name?: string | null;
  aliases?: string[] | null;
  description?: string | null;
  facilities?: string[] | null;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "CampusData".
 */
export interface CampusData {
  schema_version: 1;
  /**
   * 원본 OSM 데이터 기준 시각
   */
  source_timestamp: string;
  /**
   * 원점 (lon, lat)
   *
   * @minItems 2
   * @maxItems 2
   */
  origin: [number, number];
  crs: string;
  attribution: string;
  /**
   * 캠퍼스 경계
   */
  boundary: [number, number][];
  buildings: Building[];
  context: ContextBuilding[];
}
/**
 * 캠퍼스 밖 주변 건물. 배경으로만 렌더링한다.
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "ContextBuilding".
 */
export interface ContextBuilding {
  footprint: [number, number][];
  height: number;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "EventIn".
 */
export interface EventIn {
  type: 'search' | 'route' | 'guide' | 'building_view';
  target_id?: string | null;
  query?: string | null;
  success?: boolean | null;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "FocusBuildingAction".
 */
export interface FocusBuildingAction {
  action: 'focus_building';
  building_id: string;
  /**
   * 건물 안의 강의실 (Room.id)
   */
  room_id: string | null;
  message: string;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "GuideRequest".
 */
export interface GuideRequest {
  query: string;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "GuideResponse".
 */
export interface GuideResponse {
  result: NavigateAction | FocusBuildingAction | StartTourAction | UnknownAction;
  source: 'llm' | 'fallback';
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "NavigateAction".
 */
export interface NavigateAction {
  action: 'navigate';
  /**
   * 없으면 정문 등 기본 출발지
   */
  from_id: string | null;
  to_id: string;
  /**
   * 도착 건물 안의 강의실 (Room.id)
   */
  room_id: string | null;
  message: string;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "StartTourAction".
 */
export interface StartTourAction {
  action: 'start_tour';
  message: string;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "UnknownAction".
 */
export interface UnknownAction {
  action: 'unknown';
  message: string;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "Health".
 */
export interface Health {
  status: 'ok';
  buildings: number;
  nodes: number;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "PathEdge".
 */
export interface PathEdge {
  a: string;
  b: string;
  kind: 'walk' | 'stairs' | 'road';
  /**
   * 미터
   */
  length: number;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "PathGraph".
 */
export interface PathGraph {
  schema_version: 1;
  nodes: PathNode[];
  edges: PathEdge[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "PathNode".
 */
export interface PathNode {
  id: string;
  x: number;
  y: number;
  z: number;
  type: 'junction' | 'entrance' | 'gate' | 'stairs';
  /**
   * 입구 노드면 건물 ID
   */
  building_id: string | null;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "RoomIndex".
 */
export interface RoomIndex {
  rooms: RoomIndexEntry[];
}
/**
 * 길안내·검색용 경량 목록 (rooms-index.json)
 *
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "RoomIndexEntry".
 */
export interface RoomIndexEntry {
  id: string;
  building_id: string;
  floor_index: number;
  floor_label: string;
  name: string;
  category: '공간' | '시설물';
  tags: string[];
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "StatsOut".
 */
export interface StatsOut {
  total_events: number;
  by_type: {
    [k: string]: number;
  };
  top_destinations: TopDestination[];
  guide_success_rate: number | null;
}
/**
 * This interface was referenced by `CampusContracts`'s JSON-Schema
 * via the `definition` "TopDestination".
 */
export interface TopDestination {
  building_id: string;
  count: number;
}
