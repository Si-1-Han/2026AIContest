import * as THREE from 'three';
import { extrudeFootprint } from '../lib/geometry';
import { colorFacadeGeometry } from './facadeGeometry';

const EAVE = new THREE.Color('#d5cabb');
const TILE = new THREE.Color('#3e6d6b');
const TILE_SHADES = [TILE, new THREE.Color('#457572'), new THREE.Color('#4b7a76')];

// The two long wings and their connecting wing. The two sides of the footprint stay open.
const WINGS = [
  { center: [50.86, 108.0], length: 30.6, width: 11.85, angle: -0.046 },
  { center: [38.96, 134.4], length: 31.6, width: 11.2, angle: -0.046 },
  { center: [45.5, 121.4], length: 20, width: 14.2, angle: Math.PI / 2 - 0.046 },
] as const;

export function makeRodemRoof(outline: [number, number][], height: number) {
  const eaves = colorFacadeGeometry(extrudeFootprint(outline, 0.17), EAVE);
  eaves.translate(0, height, 0);
  const positions: number[] = [];
  const colors: number[] = [];
  const foot = height + 0.15;
  const ridge = height + 1.18;

  for (const {center: [x, z], length, width, angle} of WINGS) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const half = length / 2;
    const hip = half - width * 0.32;
    type Vertex = [u: number, y: number, v: number];
    const triangle = (a: Vertex, b: Vertex, c: Vertex, color: THREE.Color) => {
      const clockwise = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) < 0;
      for (const [u, y, v] of clockwise ? [a, b, c] : [a, c, b]) {
        positions.push(x + u * cos - v * sin, y, z + u * sin + v * cos);
        colors.push(color.r, color.g, color.b);
      }
    };
    const bands = Math.ceil(length / 1.15);
    for (const side of [-1, 1]) {
      const v = side * width / 2;
      for (let i = 0; i < bands; i++) {
        const a = 2 * i / bands - 1;
        const b = 2 * (i + 1) / bands - 1;
        const color = TILE_SHADES[i % TILE_SHADES.length]!;
        triangle([half * a, foot, v], [half * b, foot, v], [hip * b, ridge, 0], color);
        triangle([half * a, foot, v], [hip * b, ridge, 0], [hip * a, ridge, 0], color);
      }
      triangle([side * half, foot, -width / 2], [side * half, foot, width / 2], [side * hip, ridge, 0], TILE);
    }
  }

  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roof.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  roof.computeVertexNormals();
  return [eaves, roof];
}
