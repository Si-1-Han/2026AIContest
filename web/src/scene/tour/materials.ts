import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export type SurfaceKind = 'stone' | 'brick' | 'asphalt' | 'paving' | 'grass' | 'bark' | 'tactile' | 'curb';
export const SURFACE_REPEAT: Record<SurfaceKind, [number, number]> = {
  stone: [0.36, 0.36], brick: [0.28, 0.84], asphalt: [0.7, 0.7], paving: [0.7, 0.7], grass: [0.45, 0.45], bark: [2, 1.5],
  tactile: [3, 3], curb: [0.55, 0.55],
};

/** 색·거칠기·노멀을 같은 높이 패턴에서 만든다. 외부 이미지나 네트워크 요청은 없다. */
export function surfacePixels(kind: SurfaceKind, size = 256) {
  const color = new Uint8Array(size * size * 4), roughness = new Uint8Array(color.length), normal = new Uint8Array(color.length), height = new Float32Array(size * size);
  let seed = 72813;
  const rand = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, noise = rand();
    let h = noise * 0.025, tone = 239 + noise * 13, rough = 205 + noise * 24;
    if (kind === 'brick' || kind === 'paving') {
      const rows = kind === 'brick' ? 16 : 8, row = Math.floor(y / size * rows), cellY = y % (size / rows), cellX = (x + row % 2 * size / 8) % (size / 4);
      const seam = cellY < 1.5 || cellX < 1.5;
      if (seam) { h = -0.12; tone = kind === 'brick' ? 184 : 193; } else { tone -= (Math.sin(row * 7 + Math.floor((x + row % 2 * size / 8) / (size / 4)) * 11) + 1) * 6; }
    } else if (kind === 'stone') {
      const seam = x % (size / 4) < 1.1 || y % (size / 3) < 1.1;
      if (seam) { h = -0.08; tone = 207; }
    } else if (kind === 'asphalt') { tone = 212 + noise * 43; h = noise * 0.065; rough = 223 + noise * 30; }
    else if (kind === 'grass') { tone = 218 + noise * 37; h = noise * 0.06; rough = 240; }
    else if (kind === 'bark') { h = Math.sin(x / size * 94 + Math.sin(y / size * 13) * 2) * 0.12 + noise * 0.03; tone = 210 + h * 120; rough = 245; }
    else if (kind === 'curb') { if (x % (size / 2) < 1.2) { h = -0.09; tone = 201; } }
    else if (kind === 'tactile') { const r = Math.hypot(x % (size / 8) - size / 16, y % (size / 8) - size / 16); h = r < size / 32 ? 0.12 : 0; tone = 245; rough = 220; }
    height[i] = h;
    color.set([tone, tone, tone, 255], i * 4); roughness.set([rough, rough, rough, 255], i * 4);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = (a: number, b: number) => height[((b + size) % size) * size + (a + size) % size]!;
    const nx = (h(x - 1, y) - h(x + 1, y)) * 3, ny = (h(x, y - 1) - h(x, y + 1)) * 3, length = Math.hypot(nx, ny, 1);
    normal.set([Math.round((nx / length * 0.5 + 0.5) * 255), Math.round((ny / length * 0.5 + 0.5) * 255), Math.round((1 / length * 0.5 + 0.5) * 255), 255], (y * size + x) * 4);
  }
  return { color, normal, roughness, size };
}

export function useSurfaceMaps(kind: SurfaceKind) {
  const maps = useMemo(() => {
    const pixels = surfacePixels(kind);
    const make = (bytes: Uint8Array, srgb = false) => {
      const t = new THREE.DataTexture(bytes, pixels.size, pixels.size, THREE.RGBAFormat);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...SURFACE_REPEAT[kind]); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
    };
    return { map: make(pixels.color, true), normalMap: make(pixels.normal), roughnessMap: make(pixels.roughness) };
  }, [kind]);
  useEffect(() => () => Object.values(maps).forEach(t => t.dispose()), [maps]); return maps;
}
