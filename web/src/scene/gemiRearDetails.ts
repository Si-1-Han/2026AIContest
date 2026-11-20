import * as THREE from 'three';
import { placeFacadePart, type FacadeEdge } from './facadeGeometry';

const STEEL = new THREE.Color('#a2b1b8');
const STAIR = new THREE.Color('#687b86');
const ORANGE = new THREE.Color('#d08c39');
const YELLOW = new THREE.Color('#d6b62c');
const BAY_GLASS = new THREE.Color('#7299b3');

export function makeGemiRearDetails(edges: FacadeEdge[], height: number, floorIndex: number, topFloor: boolean) {
  const parts: THREE.BufferGeometry[] = [];
  const addBox = (
    edge: FacadeEdge, along: number, y: number, outward: number,
    size: [number, number, number], color: THREE.Color, slope = 0,
  ) => {
    parts.push(placeFacadePart(edge, new THREE.BoxGeometry(...size), [along, y, outward], color, slope));
  };

  // Rear left, on the same short wall at every level.
  const stairWall = edges.filter((edge) => edge.length > 6)
    .sort((a, b) => a.start[1] - b.start[1])[0];
  if (stairWall) {
    const left = 0.95;
    const right = stairWall.length - 0.95;
    for (const landing of [left, right]) {
      addBox(stairWall, landing, 0.12, 1.55, [1.75, 0.24, 2.3], STAIR);
      const columnHeight = topFloor ? 1.05 : height;
      addBox(stairWall, landing, columnHeight / 2, 2.62, [0.15, columnHeight, 0.15], STEEL);
      addBox(stairWall, landing, 0.98, 2.62, [1.75, 0.07, 0.07], STEEL);
    }

    if (!topFloor) {
      const direction = floorIndex % 2 === 0 ? 1 : -1;
      const start = direction > 0 ? left : right;
      const span = right - left;
      const rise = height - 0.18;
      const steps = 14;
      for (let i = 0; i < steps; i++) {
        const t = (i + 0.5) / steps;
        addBox(stairWall, start + direction * span * t, 0.18 + rise * t, 1.65,
          [span / steps + 0.03, 0.17, 1.55], STAIR);
      }
      for (const outward of [0.88, 2.43]) {
        for (const lift of [0.46, 0.89]) {
          addBox(stairWall, (left + right) / 2, 0.18 + rise / 2 + lift, outward,
            [Math.hypot(span, rise), 0.06, 0.06], STEEL, direction * Math.atan2(rise, span));
        }
        for (const t of [0.18, 0.42, 0.66, 0.9]) {
          addBox(stairWall, start + direction * span * t, 0.18 + rise * t + 0.47, outward,
            [0.06, 0.9, 0.06], STEEL);
        }
      }
    }
  }

  if (floorIndex === 3 || floorIndex === 4) {
    // Rear right, measured from the southern corner so both bays line up.
    const bayWall = edges.filter((edge) => edge.length > 4.25).sort((a, b) =>
      (b.start[1] + b.dz * b.length) - (a.start[1] + a.dz * a.length))[0];
    if (bayWall) {
      const center = bayWall.length - 2.25;
      const y = height * 0.53;
      addBox(bayWall, center, y, 0.82, [3.65, height * 0.76, 1.68], floorIndex === 3 ? YELLOW : ORANGE);
      addBox(bayWall, center, y, 1.68, [3.15, height * 0.57, 0.07], BAY_GLASS);
    }
  }

  return parts;
}
