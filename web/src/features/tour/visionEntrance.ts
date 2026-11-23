type Point = [number, number];

/** 비전관 긴 도로변 외벽에서 북쪽 모서리에 가까운 두 창 사이. */
export const VISION_ENTRY_WALL: [Point, Point] = [[36.95, 277.97], [0.07, 230.92]];
export const VISION_ENTRY_T = 0.82;
export const VISION_DOOR_WIDTH = 4.4;
const [a, b] = VISION_ENTRY_WALL;
const dx = b[0] - a[0], dz = b[1] - a[1];
const length = Math.hypot(dx, dz), ux = dx / length, uz = dz / length;
export const VISION_ENTRY_DOOR: Point = [a[0] + dx * VISION_ENTRY_T, a[1] + dz * VISION_ENTRY_T];

export function visionEntryPoint(distance: number, side = 0): Point {
  return [VISION_ENTRY_DOOR[0] - uz * distance + ux * side, VISION_ENTRY_DOOR[1] + ux * distance + uz * side];
}

export function visionEntrySide(x: number, z: number) {
  return (x - VISION_ENTRY_DOOR[0]) * ux + (z - VISION_ENTRY_DOOR[1]) * uz;
}

const halfWidth = VISION_DOOR_WIDTH / 2 + 0.4;
export const VISION_ENTRY_WALK: Point[] = [
  visionEntryPoint(-0.12, -halfWidth), visionEntryPoint(2.8, -halfWidth),
  visionEntryPoint(2.8, halfWidth), visionEntryPoint(-0.12, halfWidth),
];
export const VISION_ENTRY_STOP = visionEntryPoint(2.55);
export const VISION_ENTRY_NODES = [{ id: 'tour_vision_entry_door', point: VISION_ENTRY_STOP }];
