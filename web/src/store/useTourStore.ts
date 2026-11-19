import { tourPlaceGoal, tourPlaceLookAt } from '../features/tour/buildingAccess';
import { create } from 'zustand';
import { buildTourNetwork, nearestTourNode, planTourMove, tourPath, TOUR_STEP_METERS, type TourNetwork } from '../features/tour/network';
import { useCampusStore } from './useCampusStore';

type TourView = 'street' | 'flight';

interface TourState {
  active: boolean;
  view: TourView;
  network: TourNetwork | null;
  nodeId: string;
  targetId: string | null;
  travel: string[];
  positionNonce: number;
  visited: string[];
  yaw: number;
  destination: string | null;
  error: string | null;
  start: () => boolean;
  stop: () => void;
  setView: (view: TourView) => void;
  move: (id: string) => void;
  jumpToBuilding: (id: string) => void;
  arrive: () => void;
  look: (yaw: number) => void;
  setDestination: (id: string | null) => void;
}
export const useTourStore = create<TourState>((set, get) => ({
  active: false, view: 'street', network: null, nodeId: '', targetId: null, travel: [], positionNonce: 0, visited: [], yaw: 0, destination: null, error: null,
  start: () => {
    if (get().active) return true;
    const campus = useCampusStore.getState();
    if (!campus.campus || !campus.graph) return false;
    try {
      const network = buildTourNetwork(campus.campus, campus.graph);
      const n = network.nodes[network.start]!;
      const center = campus.campus.buildings.find(b => b.id === 'main')?.center ?? [0, 0];
      const next = n.neighbors.map(id => network.nodes[id]!).sort((a, b) => Math.hypot(a.x - center[0]!, a.z - center[1]!) - Math.hypot(b.x - center[0]!, b.z - center[1]!))[0]!;
      campus.closePlanner(); campus.select(null); campus.hover(null);
      document.body.style.cursor = '';
      set({ active: true, view: 'street', network, nodeId: n.id, targetId: null, travel: [], positionNonce: get().positionNonce + 1, visited: [n.id], yaw: Math.atan2(-(next.x - n.x), -(next.z - n.z)), destination: null, error: null });
      return true;
    } catch (error) { set({ error: error instanceof Error ? error.message : '투어를 시작할 수 없어요.' }); return false; }
  },
  stop: () => set({ active: false, view: 'street', targetId: null, travel: [], destination: null }),
  setView: (view) => {
    const s = get();
    if (s.active && !s.targetId && s.view !== view) set({ view });
  },
  move: (id) => {
    const s = get();
    if (!s.active || s.view !== 'street' || s.targetId || !s.network?.nodes[s.nodeId]?.neighbors.includes(id)) return;
    const campus = useCampusStore.getState().campus;
    const goal = [...(campus?.buildings ?? []), ...(campus?.outdoor_areas ?? [])].find(p => p.id === s.destination);
    const guide = goal ? tourPath(s.network, s.nodeId, tourPlaceGoal(goal)) : undefined;
    const move = planTourMove(s.network, s.nodeId, id, TOUR_STEP_METERS, guide);
    if (move.path.length > 1) set({ network: move.network, targetId: move.path.at(-1)!, travel: move.path });
  },
  jumpToBuilding: (id) => {
    const s = get(), building = useCampusStore.getState().campus?.buildings.find(b => b.id === id);
    if (!s.active || s.view !== 'street' || !s.network || !building) return;
    const target = nearestTourNode(s.network, tourPlaceGoal(building)), lookAt = tourPlaceLookAt(building);
    set({ nodeId: target.id, targetId: null, travel: [], positionNonce: s.positionNonce + 1, destination: id,
      yaw: Math.atan2(-(lookAt[0] - target.x), -(lookAt[1] - target.z)),
      visited: s.visited.includes(target.id) ? s.visited : [...s.visited, target.id],
    });
  },
  arrive: () => {
    const s = get();
    if (s.active && s.targetId) set({ nodeId: s.targetId, targetId: null, travel: [], visited: [...new Set([...s.visited, ...s.travel])] });
  },
  look: (yaw) => set({ yaw }),
  setDestination: (destination) => set({ destination }),
}));
