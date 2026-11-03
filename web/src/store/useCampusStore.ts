import { create } from 'zustand';
import { DEFAULT_FROM_ID, WALKING_SPEED } from '../config';
import { loadData, sendEvent, type DataSourceKind } from '../data/dataSource';
import { Router, type PathResult } from '../features/navigation/router';
import type { Building, BuildingIndex, CampusData, PathGraph } from '../types/generated/campus';

export interface Route extends PathResult {
  fromId: string;
  toId: string;
  minutes: number;
}

interface CampusState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  source: DataSourceKind | null;
  campus: CampusData | null;
  graph: PathGraph | null;
  index: BuildingIndex | null;
  router: Router | null;

  hoveredId: string | null;
  selectedId: string | null;
  route: Route | null;

  load: () => Promise<void>;
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
  /** 성공하면 true. fromId가 없으면 기본 출발지에서 출발 */
  navigate: (fromId: string | null, toId: string) => boolean;
  clearRoute: () => void;
  building: (id: string | null) => Building | undefined;
}

export const useCampusStore = create<CampusState>()((set, get) => ({
  status: 'loading',
  error: null,
  source: null,
  campus: null,
  graph: null,
  index: null,
  router: null,
  hoveredId: null,
  selectedId: null,
  route: null,

  load: async () => {
    try {
      const { campus, graph, index, source } = await loadData();
      set({ campus, graph, index, source, router: new Router(graph), status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },

  select: (id) => {
    set({ selectedId: id });
    if (id) sendEvent({ type: 'building_view', target_id: id });
  },

  navigate: (fromId, toId) => {
    const { router, building } = get();
    const from = building(fromId ?? DEFAULT_FROM_ID);
    const to = building(toId);
    const start = from?.entrances[0];
    const goal = to?.entrances[0];
    if (!router || !from || !to || !start || !goal || from.id === to.id) return false;

    const path = router.find(start, goal);
    if (!path) return false;
    set({
      route: {
        ...path,
        fromId: from.id,
        toId: to.id,
        minutes: Math.max(1, Math.round(path.length / WALKING_SPEED / 60)),
      },
      selectedId: to.id,
    });
    sendEvent({ type: 'route', target_id: to.id });
    return true;
  },

  clearRoute: () => set({ route: null }),

  building: (id) => (id ? get().campus?.buildings.find((b) => b.id === id) : undefined),
}));
