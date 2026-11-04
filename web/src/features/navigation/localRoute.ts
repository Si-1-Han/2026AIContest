// 서버(Campus API)를 쓸 수 없을 때의 브라우저 간이 경로 계산.
// 출입구 조합 중 가장 짧은 것을 고르고, 출발·도착만 안내한다. (상세 안내는 서버 엔진)
import type {
  Building,
  RouteOption,
  RouteResponse,
  RouteStep,
} from '../../types/generated/campus';
import { WALKING_SPEED } from '../../config';
import { josa } from '../guide/fallbackMatcher';
import type { Router, RouteProfile } from './router';

function floorText(b: Building, index: number | null | undefined): string {
  const label = index !== null && index !== undefined ? b.floors[index]?.label : undefined;
  if (!label) return '';
  return label.startsWith('B') ? `지하 ${label.slice(1)}층 ` : `${label.replace('F', '')}층 `;
}

export function localRoute(
  router: Router,
  from: Building,
  to: Building,
  profile: RouteProfile,
  destinationRoom?: { name: string; floorLabel: string },
): RouteResponse | null {
  let best: { path: NonNullable<ReturnType<Router['find']>>; a: string; b: string } | null = null;
  for (const a of from.entrances) {
    for (const b of to.entrances) {
      const path = router.find(a, b, profile);
      if (path && (!best || path.length < best.path.length)) best = { path, a, b };
    }
  }
  if (!best) return null;

  const doorA = router.nodes.get(best.a);
  const doorB = router.nodes.get(best.b);
  const seconds = best.path.length / WALKING_SPEED;
  const [start, end] = [best.path.points[0]!, best.path.points[best.path.points.length - 1]!];
  const steps: RouteStep[] = [
    {
      maneuver: 'depart',
      instruction: `${from.name} ${floorText(from, doorA?.floor_index)}출입구에서 출발하세요.`,
      distance_m: best.path.length,
      duration_s: Math.round(seconds),
      point: start,
      floor_label: null,
    },
    {
      maneuver: 'arrive',
      instruction: `${to.name} ${floorText(to, doorB?.floor_index)}출입구에 도착해요.`,
      distance_m: 0,
      duration_s: 0,
      point: end,
      floor_label: null,
    },
  ];
  if (destinationRoom) {
    steps.push({
      maneuver: 'indoor',
      instruction: `${josa(destinationRoom.name, '은', '는')} ${destinationRoom.floorLabel}에 있어요.`,
      distance_m: 0,
      duration_s: 0,
      point: end,
      floor_label: destinationRoom.floorLabel,
    });
  }

  const option: RouteOption = {
    id: 'route-0',
    label: '추천',
    distance_m: best.path.length,
    duration_s: Math.round(seconds),
    indoor_s: 0,
    road_m: 0,
    origin_door: null,
    destination_door: null,
    points: best.path.points,
    steps,
    warnings: ['서버에 연결되지 않아 간이 경로로 안내해요. (턴 안내·층 이동 시간 제외)'],
  };
  return { profile, engine: 'browser', routes: [option] };
}
