// 층 분해 보기의 위치 계산. 건물 렌더링·강의실·카메라가 같은 값을 쓰도록 한 곳에 둔다.
import type { Building, FloorInfo } from '../types/generated/campus';

/** 층 분해 시 층 사이 간격 (m) */
export const EXPLODE_GAP = 3.2;
/** 층을 골랐을 때 그 위층들이 올라가는 높이 (m) */
export const LIFT_ABOVE = 45;
/** 층을 골랐을 때 바닥판 두께 (m) */
export const PLATE = 0.5;

export type ViewMode =
  | { kind: 'campus' } // 아무것도 선택 안 함 (또는 다른 건물 선택)
  | { kind: 'building' } // 이 건물 선택: 층 분해
  | { kind: 'floor'; index: number }; // 이 건물의 특정 층

export function floorCount(b: Building): number {
  return b.floors.length || b.levels;
}

export function totalHeight(b: Building): number {
  return floorCount(b) * b.floor_height;
}

/** 층 분해 시 i번째 층 바닥 높이 */
export function explodedBase(b: Building, i: number): number {
  return i * (b.floor_height + EXPLODE_GAP);
}

export interface FloorPose {
  y: number;
  /** 층 덩어리의 세로 배율 (1 = 층고 전체, 바닥판일 때는 얇게) */
  scaleY: number;
  opacity: number;
}

export function floorPose(b: Building, floor: FloorInfo, mode: ViewMode, dimmed: boolean): FloorPose {
  const fh = b.floor_height;
  const i = floor.index;
  if (mode.kind === 'campus') return { y: i * fh, scaleY: 1, opacity: dimmed ? 0.16 : 1 };
  if (mode.kind === 'building') return { y: explodedBase(b, i), scaleY: 1, opacity: 1 };

  const k = mode.index;
  if (i < k) return { y: explodedBase(b, i), scaleY: 1, opacity: 0.28 };
  if (i === k) return { y: explodedBase(b, k), scaleY: PLATE / fh, opacity: 1 };
  return { y: explodedBase(b, k) + LIFT_ABOVE + (i - k) * fh, scaleY: 1, opacity: 0 };
}

/** 선택한 층에서 강의실이 놓이는 바닥 높이 */
export function roomBase(b: Building, floorIndex: number): number {
  return explodedBase(b, floorIndex) + PLATE;
}

export function bounds(points: [number, number][]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    size: Math.max(maxX - minX, maxZ - minZ),
    maxX,
  };
}
