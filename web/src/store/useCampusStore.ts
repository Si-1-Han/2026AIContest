import { create } from 'zustand';
import { DEFAULT_FROM_ID, WALKING_SPEED } from '../config';
import { loadData, loadInterior, sendEvent, type DataSourceKind } from '../data/dataSource';
import { Router, type PathResult } from '../features/navigation/router';
import type {
  Building,
  BuildingIndex,
  BuildingInterior,
  CampusData,
  PathGraph,
  Room,
  RoomIndex,
} from '../types/generated/campus';

export interface Route extends PathResult {
  fromId: string;
  toId: string;
  minutes: number;
}

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
  route: Route | null;
  /** 카메라가 다시 맞춰야 할 때마다 증가 (같은 건물을 다시 골라도 카메라가 움직이게) */
  viewNonce: number;

  load: () => Promise<void>;
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
  /** 성공하면 true. fromId가 없으면 기본 출발지에서 출발 */
  navigate: (fromId: string | null, toId: string) => boolean;
  clearRoute: () => void;
  building: (id: string | null) => Building | undefined;
  room: (id: string | null) => Room | undefined;
}

export const useCampusStore = create<CampusState>()((set, get) => ({
  status: 'loading',
  error: null,
  source: null,
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
  viewNonce: 0,

  load: async () => {
    try {
      const { campus, graph, index, rooms, source } = await loadData();
      set({ campus, graph, index, rooms, source, router: new Router(graph), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
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
    else if (selectedId) set({ selectedId: null, route: null, ...bump });
    else if (route) set({ route: null, ...bump });
  },

  navigate: (fromId, toId) => {
    const { router, building, selectedId } = get();
    const from = building(fromId ?? DEFAULT_FROM_ID);
    const to = building(toId);
    const start = from?.entrances[0];
    const goal = to?.entrances[0];
    if (!router || !from || !to || !start || !goal || from.id === to.id) return false;

    const path = router.find(start, goal);
    if (!path) return false;
    const keepInterior = selectedId === to.id; // 같은 건물이면 보던 층·강의실 유지
    set({
      route: {
        ...path,
        fromId: from.id,
        toId: to.id,
        minutes: Math.max(1, Math.round(path.length / WALKING_SPEED / 60)),
      },
      selectedId: to.id,
      ...(keepInterior ? {} : { floorIndex: null, selectedRoomId: null }),
    });
    void get().ensureInterior(to.id);
    sendEvent({ type: 'route', target_id: to.id });
    return true;
  },

  clearRoute: () => set({ route: null }),

  building: (id) => (id ? get().campus?.buildings.find((b) => b.id === id) : undefined),

  room: (id) => {
    const parsed = id ? parseRoomId(id) : null;
    if (!parsed) return undefined;
    return get()
      .interiors[parsed.buildingId]?.floors[parsed.floorIndex]?.rooms.find((r) => r.id === id);
  },
}));
