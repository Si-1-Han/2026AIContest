import { create } from 'zustand';
import { API_HEALTH_INTERVAL_MS } from '../config';
import {
  checkApiHealth,
  loadData,
  loadInterior,
  routeViaApi,
  sendEvent,
  type DataSourceKind,
} from '../data/dataSource';
import { localRoute } from '../features/navigation/localRoute';
import { Router, type RouteProfile } from '../features/navigation/router';
import type {
  Building,
  BuildingIndex,
  BuildingInterior,
  CampusData,
  PathGraph,
  Room,
  RoomIndex,
  RouteDoor,
  RouteOption,
  RouteResponse,
  RouteStep,
} from '../types/generated/campus';

export type Vec3 = [number, number, number];

/** 화면에서 쓰는 경로 (서버·브라우저 결과를 같은 형태로) */
export interface Route {
  id: string;
  label: string;
  fromId: string;
  toId: string;
  points: Vec3[];
  /** 실외 이동 거리 (m) */
  length: number;
  minutes: number;
  durationS: number;
  indoorS: number;
  roadM: number;
  steps: RouteStep[];
  warnings: string[];
  originDoor: RouteDoor | null;
  destinationDoor: RouteDoor | null;
}

export type RouteEngine = RouteResponse['engine'];

function toRoute(o: RouteOption, fromId: string, toId: string): Route {
  return {
    id: o.id,
    label: o.label,
    fromId,
    toId,
    points: o.points as Vec3[],
    length: Math.round(o.distance_m),
    minutes: Math.max(1, Math.round(o.duration_s / 60)),
    durationS: o.duration_s,
    indoorS: o.indoor_s,
    roadM: o.road_m,
    steps: o.steps,
    warnings: o.warnings,
    originDoor: o.origin_door,
    destinationDoor: o.destination_door,
  };
}

/** 출발·도착 지점: 건물 (+ 선택하면 그 안의 강의실) */
export interface Endpoint {
  buildingId: string;
  roomId: string | null;
}

export type EndpointSlot = 'from' | 'to';

export interface Planner {
  open: boolean;
  from: Endpoint | null;
  to: Endpoint | null;
  /** 지도 클릭으로 채울 칸. null이면 지도 클릭은 평소처럼 건물 선택 */
  active: EndpointSlot | null;
  /** 경로를 만들 수 없을 때 이유 */
  error: string | null;
  profile: RouteProfile;
  /** 경로 계산 중 */
  busy: boolean;
}

const CLOSED_PLANNER: Planner = {
  open: false,
  from: null,
  to: null,
  active: null,
  error: null,
  profile: 'recommended',
  busy: false,
};

/** 경로를 먼저 보여 준 뒤 도착 강의실로 들어가기까지의 시간 */
const ROUTE_THEN_ROOM_MS = 2600;
let roomTimer: number | undefined;

/** Room.id = "<building_id>:<층 index>:<번호>" */
export function parseRoomId(roomId: string): { buildingId: string; floorIndex: number } | null {
  const [buildingId, floor] = roomId.split(':');
  const floorIndex = Number(floor);
  return buildingId && Number.isInteger(floorIndex) ? { buildingId, floorIndex } : null;
}

interface CampusState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  source: DataSourceKind | null;
  /** Python API 응답 여부 (null = API를 쓰지 않는 설정) */
  apiOnline: boolean | null;
  campus: CampusData | null;
  graph: PathGraph | null;
  index: BuildingIndex | null;
  rooms: RoomIndex | null;
  router: Router | null;
  interiors: Record<string, BuildingInterior>;

  hoveredId: string | null;
  selectedId: string | null;
  /** 선택한 건물에서 펼쳐 보는 층 (null이면 층 분해 보기) */
  floorIndex: number | null;
  hoveredRoomId: string | null;
  selectedRoomId: string | null;
  /** 선택한 경로 (routes[routeIndex]) */
  route: Route | null;
  routes: Route[];
  routeIndex: number;
  routeEngine: RouteEngine | null;
  /** 단계 안내에서 고른 위치 (카메라 이동) */
  focusPoint: { point: Vec3; nonce: number } | null;
  planner: Planner;
  /** 카메라가 다시 맞춰야 할 때마다 증가 (같은 건물을 다시 골라도 카메라가 움직이게) */
  viewNonce: number;

  load: () => Promise<void>;
  /** Python API 상태를 주기적으로 확인 (서버가 늦게 켜지거나 꺼져도 반영) */
  watchApi: () => () => void;
  ensureInterior: (buildingId: string) => Promise<BuildingInterior | null>;
  hover: (id: string | null) => void;
  /** 건물 선택. 층·강의실 선택은 초기화된다. */
  select: (id: string | null) => void;
  selectFloor: (index: number | null) => void;
  hoverRoom: (id: string | null) => void;
  selectRoom: (id: string | null) => void;
  /** 강의실로 바로 이동 (건물·층 선택 + 데이터 로딩) */
  focusRoom: (roomId: string) => Promise<boolean>;
  /** 강의실 → 층 → 건물 → 캠퍼스 순서로 한 단계 뒤로 */
  back: () => void;
  /** 길찾기 패널 열기. 주어진 지점을 채우고, 비어 있는 첫 칸을 지도 선택 대상으로 */
  openPlanner: (patch?: { from?: Endpoint | null; to?: Endpoint | null }) => void;
  closePlanner: () => void;
  setEndpoint: (slot: EndpointSlot, endpoint: Endpoint | null) => void;
  setActiveSlot: (slot: EndpointSlot | null) => void;
  swapEndpoints: () => void;
  /** 지도에서 건물·강의실을 클릭했을 때. 길찾기 칸을 채웠으면 true (평소 선택은 하지 않음) */
  pickOnMap: (buildingId: string, roomId?: string | null) => boolean;
  clearRoute: () => void;
  setProfile: (profile: RouteProfile) => void;
  selectRoute: (index: number) => void;
  focusStep: (step: RouteStep) => void;
  building: (id: string | null) => Building | undefined;
  room: (id: string | null) => Room | undefined;
}

export const useCampusStore = create<CampusState>()((set, get) => ({
  status: 'loading',
  error: null,
  source: null,
  apiOnline: null,
  campus: null,
  graph: null,
  index: null,
  rooms: null,
  router: null,
  interiors: {},
  hoveredId: null,
  selectedId: null,
  floorIndex: null,
  hoveredRoomId: null,
  selectedRoomId: null,
  route: null,
  routes: [],
  routeIndex: 0,
  routeEngine: null,
  focusPoint: null,
  planner: CLOSED_PLANNER,
  viewNonce: 0,

  load: async () => {
    try {
      const { campus, graph, index, rooms, source } = await loadData();
      set({ campus, graph, index, rooms, source, router: new Router(graph), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  watchApi: () => {
    let stopped = false;
    const tick = async () => {
      const online = await checkApiHealth();
      if (stopped) return;
      if (online !== get().apiOnline) set({ apiOnline: online });
      if (online !== null) timer = window.setTimeout(tick, API_HEALTH_INTERVAL_MS);
    };
    let timer = window.setTimeout(tick, 0);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  },

  ensureInterior: async (buildingId) => {
    const cached = get().interiors[buildingId];
    if (cached) return cached;
    if (!get().building(buildingId)?.has_interior) return null;
    try {
      const interior = await loadInterior(buildingId);
      set((s) => ({ interiors: { ...s.interiors, [buildingId]: interior } }));
      return interior;
    } catch (err) {
      console.warn('[store] 층 데이터 로딩 실패', buildingId, err);
      return null;
    }
  },

  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },

  select: (id) => {
    set((s) => ({
      selectedId: id,
      floorIndex: null,
      selectedRoomId: null,
      hoveredRoomId: null,
      viewNonce: s.viewNonce + 1,
    }));
    if (id) {
      sendEvent({ type: 'building_view', target_id: id });
      void get().ensureInterior(id); // 미리 받아 두기
    }
  },

  selectFloor: (index) =>
    set((s) => ({
      floorIndex: index,
      selectedRoomId: null,
      hoveredRoomId: null,
      viewNonce: s.viewNonce + 1,
    })),

  hoverRoom: (id) => {
    if (get().hoveredRoomId !== id) set({ hoveredRoomId: id });
  },

  selectRoom: (id) => {
    const parsed = id ? parseRoomId(id) : null;
    set(parsed ? { selectedRoomId: id, floorIndex: parsed.floorIndex } : { selectedRoomId: null });
  },

  focusRoom: async (roomId) => {
    const parsed = parseRoomId(roomId);
    if (!parsed) return false;
    const interior = await get().ensureInterior(parsed.buildingId);
    if (!interior) return false;
    set((s) => ({
      selectedId: parsed.buildingId,
      floorIndex: parsed.floorIndex,
      selectedRoomId: roomId,
      viewNonce: s.viewNonce + 1,
    }));
    return true;
  },

  back: () => {
    const { selectedRoomId, floorIndex, selectedId, route } = get();
    const bump = { viewNonce: get().viewNonce + 1 };
    if (selectedRoomId) set({ selectedRoomId: null });
    else if (floorIndex !== null) set({ floorIndex: null, ...bump });
    else if (selectedId) set({ selectedId: null, ...bump });
    else if (route || get().planner.open) get().closePlanner();
  },

  openPlanner: (patch = {}) => {
    const prev = get().planner;
    const from = patch.from !== undefined ? patch.from : prev.open ? prev.from : null;
    const to = patch.to !== undefined ? patch.to : prev.open ? prev.to : null;
    set({ planner: { ...prev, open: true, from, to, active: null, error: null } });
    afterEndpointsChanged(get, set);
  },

  closePlanner: () => {
    window.clearTimeout(roomTimer);
    requestId++;
    set((s) => ({
      planner: { ...CLOSED_PLANNER, profile: s.planner.profile },
      ...NO_ROUTE,
      viewNonce: s.viewNonce + 1,
    }));
  },

  setEndpoint: (slot, endpoint) => {
    set((s) => ({ planner: { ...s.planner, open: true, [slot]: endpoint } }));
    afterEndpointsChanged(get, set);
  },

  setActiveSlot: (slot) => set((s) => ({ planner: { ...s.planner, active: slot } })),

  swapEndpoints: () => {
    const { from, to } = get().planner;
    set((s) => ({ planner: { ...s.planner, from: to, to: from } }));
    afterEndpointsChanged(get, set);
  },

  pickOnMap: (buildingId, roomId = null) => {
    const { open, active } = get().planner;
    if (!open || !active) return false;
    get().setEndpoint(active, { buildingId, roomId });
    return true;
  },

  clearRoute: () => {
    window.clearTimeout(roomTimer);
    requestId++;
    set(NO_ROUTE);
  },

  setProfile: (profile) => {
    set((s) => ({ planner: { ...s.planner, profile } }));
    if (get().planner.from && get().planner.to) afterEndpointsChanged(get, set);
  },

  selectRoute: (index) => {
    const r = get().routes[index];
    if (r) set({ routeIndex: index, route: r });
  },

  focusStep: (step) =>
    set((s) => ({ focusPoint: { point: step.point as Vec3, nonce: (s.focusPoint?.nonce ?? 0) + 1 } })),

  building: (id) => (id ? get().campus?.buildings.find((b) => b.id === id) : undefined),

  room: (id) => {
    const parsed = id ? parseRoomId(id) : null;
    if (!parsed) return undefined;
    return get()
      .interiors[parsed.buildingId]?.floors[parsed.floorIndex]?.rooms.find((r) => r.id === id);
  },
}));

type Get = () => CampusState;
type Set = (partial: Partial<CampusState> | ((s: CampusState) => Partial<CampusState>)) => void;

const NO_ROUTE = { route: null, routes: [], routeIndex: 0, routeEngine: null, focusPoint: null };

/** 마지막 요청만 반영하기 위한 번호 (빠르게 바꿀 때 늦게 온 응답 무시) */
let requestId = 0;

/**
 * 출발·도착·모드가 바뀔 때마다: 둘 다 있으면 경로 계산, 아니면 비어 있는 칸을 지도 선택 대상으로.
 * Campus API(Python 경로 엔진)를 먼저 쓰고, 없거나 실패하면 브라우저 간이 계산으로 안내한다.
 */
function afterEndpointsChanged(get: Get, set: Set) {
  window.clearTimeout(roomTimer);
  const id = ++requestId;
  const { planner, router, building, rooms } = get();
  const { from, to, profile } = planner;

  if (!from || !to) {
    set({ ...NO_ROUTE, planner: { ...planner, active: !from ? 'from' : 'to', error: null, busy: false } });
    return;
  }

  const a = building(from.buildingId);
  const b = building(to.buildingId);
  const fail = (error: string) =>
    set({ ...NO_ROUTE, planner: { ...get().planner, active: null, error, busy: false } });
  if (!router || !a || !b) return fail('건물 정보를 찾지 못했어요.');

  set({ planner: { ...planner, active: null, error: null, busy: true } });

  const apply = (res: RouteResponse) => {
    if (id !== requestId) return;
    const routes = res.routes.map((o) => toRoute(o, a.id, b.id));
    const first = routes[0];
    if (!first) return fail('경로를 찾지 못했어요.');
    const sameBuilding = a.id === b.id;
    set((s) => ({
      routes,
      routeIndex: 0,
      route: sameBuilding ? null : first,
      routeEngine: res.engine,
      focusPoint: null,
      planner: { ...s.planner, busy: false, error: null },
      selectedId: b.id,
      hoveredId: null,
      floorIndex: null,
      selectedRoomId: null,
      viewNonce: sameBuilding ? s.viewNonce + 1 : s.viewNonce,
    }));
    void get().ensureInterior(b.id);
    sendEvent({ type: 'route', target_id: b.id });

    // 경로 전체를 먼저 보여 준 뒤 도착 강의실로 들어간다 (같은 건물이면 바로)
    if (to.roomId) {
      const roomId = to.roomId;
      roomTimer = window.setTimeout(
        () => void get().focusRoom(roomId),
        sameBuilding ? 0 : ROUTE_THEN_ROOM_MS,
      );
    }
  };

  const fallback = () => {
    if (id !== requestId) return;
    if (a.id === b.id) {
      if (to.roomId) void get().focusRoom(to.roomId);
      return fail('같은 건물 안이에요. 도착 위치를 표시했어요.');
    }
    const room = to.roomId ? rooms?.rooms.find((r) => r.id === to.roomId) : undefined;
    const res = localRoute(
      router,
      a,
      b,
      profile,
      room ? { name: room.name, floorLabel: room.floor_label } : undefined,
    );
    if (!res) return fail('두 건물을 잇는 보행로를 찾지 못했어요.');
    apply(res);
  };

  void routeViaApi({
    origin: { building_id: a.id, room_id: from.roomId },
    destination: { building_id: b.id, room_id: to.roomId },
    profile,
    alternatives: true,
  }).then((res) => (res ? apply(res) : fallback()));
}
