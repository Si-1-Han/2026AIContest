import { Html } from '@react-three/drei';
import { COLORS } from '../config';
import { useCampusStore, type EndpointSlot } from '../store/useCampusStore';
import { totalHeight } from './layout';

const LABEL: Record<EndpointSlot, string> = { from: '출발', to: '도착' };
const COLOR: Record<EndpointSlot, string> = { from: COLORS.origin, to: COLORS.route };

/** 길찾기에서 고른 출발·도착 건물 위에 핀 표시 */
export function EndpointPins() {
  const open = useCampusStore((s) => s.planner.open);
  const hasRoute = useCampusStore((s) => s.route !== null);
  // 경로가 그려지면 경로의 출발·도착 표시가 대신한다
  if (!open || hasRoute) return null;
  return (
    <>
      <Pin slot="from" />
      <Pin slot="to" />
    </>
  );
}

function Pin({ slot }: { slot: EndpointSlot }) {
  const endpoint = useCampusStore((s) => s.planner[slot]);
  const building = useCampusStore((s) => (endpoint ? s.building(endpoint.buildingId) : undefined));
  const exploded = useCampusStore((s) => s.selectedId === building?.id);
  if (!building || exploded) return null;
  return (
    <Html
      position={[building.center[0], totalHeight(building) + 4, building.center[1]]}
      center
      zIndexRange={[25, 15]}
      style={{ pointerEvents: 'none', transform: 'translateY(-50%)' }}
    >
      <div className="flex flex-col items-center">
        <span
          className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold text-[#06101f] shadow-lg"
          style={{ background: COLOR[slot], boxShadow: `0 0 18px ${COLOR[slot]}` }}
        >
          {LABEL[slot]} · {building.name}
        </span>
        <span className="h-4 w-0.5" style={{ background: COLOR[slot] }} />
      </div>
    </Html>
  );
}
