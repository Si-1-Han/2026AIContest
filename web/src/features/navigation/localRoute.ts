// 서버(Campus API)를 쓸 수 없을 때의 브라우저 간이 경로 계산.
// 출입구 조합 중 가장 짧은 것을 고르고, 출발·도착만 안내한다. (상세 안내는 서버 엔진)
import type {
  RouteOption,
  RouteResponse,
  RouteStep,
} from '../../types/generated/campus';
import { WALKING_SPEED } from '../../config';
import { josa } from '../guide/fallbackMatcher';
import type { Router, RouteProfile } from './router';
import type { NavigationPlace } from './places';

function floorText(b: NavigationPlace, index: number | null | undefined): string {
  if ('kind' in b) return '';
  const label = index !== null && index !== undefined ? b.floors[index]?.label : undefined;
  if (!label) return '';
  return label.startsWith('B') ? `지하 ${label.slice(1)}층 ` : `${label.replace('F', '')}층 `;
}

function entryText(place: NavigationPlace, floor: number | null | undefined): string {
  if ('kind' in place) {
    return place.kind === 'gate' ? place.name : `${place.name} 접근 지점(추정)`;
  }
  return `${place.name} ${floorText(place, floor)}출입구`;
}

export function localRoute(
  router: Router,
  from: NavigationPlace,
  to: NavigationPlace,
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
      instruction: `${entryText(from, doorA?.floor_index)}에서 출발하세요.`,
      distance_m: best.path.length,
      duration_s: Math.round(seconds),
      point: start,
      floor_label: null,
    },
    {
      maneuver: 'arrive',
      instruction: `${entryText(to, doorB?.floor_index)}에 도착해요.`,
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
    warnings: [
      '서버에 연결되지 않아 간이 경로로 안내해요. (턴 안내·층 이동 시간 제외)',
      ...([from, to].some((p) => 'kind' in p && p.kind !== 'gate')
        ? ['야외시설 접근 지점은 추정 위치예요. 실제 출입구와 다를 수 있어요.'] : []),
    ],
  };
  return { profile, engine: 'browser', routes: [option] };
}
