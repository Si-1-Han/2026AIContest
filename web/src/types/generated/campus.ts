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
