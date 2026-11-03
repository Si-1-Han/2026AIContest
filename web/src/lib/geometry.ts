import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ContextBuilding } from '../types/generated/campus';

type Pt = [number, number];

/**
 * [x, z] 외곽선 → THREE.Shape.
 * Shape는 XY 평면이므로 y = -z로 두고, 나중에 X축으로 -90° 돌리면 (x, 높이, z)가 된다.
 */
export function footprintShape(footprint: Pt[]): THREE.Shape {
  return new THREE.Shape(footprint.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** 바닥이 y=0, 위로 height만큼 솟은 건물 지오메트리 */
export function extrudeFootprint(footprint: Pt[], height: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(footprintShape(footprint), {
    depth: height,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** 평면 도형 (y=0) */
export function flatShape(footprint: Pt[]): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(footprintShape(footprint));
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** 주변 건물 수백 개를 한 번의 draw call로 그리기 위해 하나로 합친다. */
export function mergeContext(context: ContextBuilding[]): THREE.BufferGeometry | null {
  const parts = context.map((c) => extrudeFootprint(c.footprint, c.height));
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

export function buildingHeight(levels: number, floorHeight: number): number {
  return levels * floorHeight;
}
