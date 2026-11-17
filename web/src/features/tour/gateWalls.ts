import { SLOPE_PROFILES } from './terrain';

export const GATE_ROAD_WIDTH = 9;
export const gateRoadPoints = () => SLOPE_PROFILES.find(p => p.id === 'main-west')!.points;
/** 정문→본관 진입로 양옆 옹벽. 차량·인도 폭을 비워 두고 경사선을 따른다. */
export function gateWallSections() {
  const points = gateRoadPoints();
  return [-1, 1].flatMap(side => points.slice(1, side === 1 ? 2 : undefined).map((b, i) => {
    const a = points[i]!, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), nx = dz / length, nz = -dx / length;
    // 차도 9m + 양쪽 보도 1.8m. 벽 안쪽 면이 보도 끝과 정확히 만난다.
    const offset = (GATE_ROAD_WIDTH / 2 + 1.8 + 0.5) * side;
    return { side, length, angle: -Math.atan2(dz, dx), nx, nz, a: [a[0] + nx * offset, a[2], a[1] + nz * offset] as [number, number, number], b: [b[0] + nx * offset, b[2], b[1] + nz * offset] as [number, number, number] };
  }));
}
export function inGateWall(x: number, z: number, margin: number) {
  return gateWallSections().some(w => {
    const dx = w.b[0] - w.a[0], dz = w.b[2] - w.a[2], t = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (z - w.a[2]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - w.a[0] - dx * t, z - w.a[2] - dz * t) < margin + 0.5;
  });
}

/** 정문 오르막 구간의 보도와 시설물을 정리할 범위. */
export function inGateApproach(x: number, z: number, margin = 0) {
  const points = gateRoadPoints();
  return points.slice(1).some((b, i) => {
    const a = points[i]!, dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) <= GATE_ROAD_WIDTH / 2 + 4.5 + margin;
  });
}
