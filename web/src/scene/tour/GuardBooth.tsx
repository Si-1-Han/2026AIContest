import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GUARD_BOOTH, TERRACE_HEIGHT } from '../../features/tour/visionTerrace';
import { Batch, type Part } from './Batch';
import { useSurfaceMaps } from './materials';

const B = GUARD_BOOTH, Y = TERRACE_HEIGHT;

/**
 * 이공관 서쪽 길가의 경비실(로드뷰 기준): 회색 단층 몸체, 철창이 달린 창, 처마가 있는 평지붕.
 * 출입문과 큰 창은 길(동쪽)을 향한다.
 */
export function guardBoothParts() {
  const trim: Part[] = [], glass: Part[] = [], bars: Part[] = [];
  const w = B.x1 - B.x0, d = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  trim.push({ p: [cx, Y + 0.18, cz], s: [w + 0.12, 0.36, d + 0.12], color: '#8d918a' });
  trim.push({ p: [cx, Y + B.height + 0.1, cz], s: [w + 0.7, 0.2, d + 0.7], color: '#7c817b' });
  trim.push({ p: [cx, Y + B.height + 0.26, cz], s: [w + 0.4, 0.12, d + 0.4], color: '#6d726c' });
  // 창: 면 위치(축), 면 안의 중심, 폭. 각 창은 유리·창틀·세로 철창으로 이뤄진다.
  const addWindow = (face: 'east' | 'south' | 'north' | 'west', at: number, width: number, bottom = 0.95, height = 1.15) => {
    const out = 0.06, y = Y + bottom + height / 2;
    const place = (along: number, offset: number): [number, number, number] =>
      face === 'east' ? [B.x1 + offset, y, at + along] : face === 'west' ? [B.x0 - offset, y, at + along]
        : face === 'south' ? [at + along, y, B.z1 + offset] : [at + along, y, B.z0 - offset];
    const ry = face === 'east' || face === 'west' ? Math.PI / 2 : 0;
    glass.push({ p: place(0, 0.01), s: [width, height, 0.04], color: '#3f6470', ry });
    for (const [s, h, dy] of [[width + 0.16, 0.08, height / 2 + 0.04], [width + 0.16, 0.1, -height / 2 - 0.05]] as const) trim.push({ p: [place(0, out)[0], y + dy, place(0, out)[2]], s: [s, h, 0.12], color: '#e4e4dc', ry });
    for (const side of [-1, 1]) trim.push({ p: place(side * (width / 2 + 0.04), out), s: [0.08, height, 0.12], color: '#e4e4dc', ry });
    for (let i = 1, n = Math.max(4, Math.round(width / 0.14)); i < n; i++) bars.push({ p: place(-width / 2 + width * i / n, out + 0.06), s: [0.025, height, 0.025], color: '#5a5f5c', ry });
    bars.push({ p: place(0, out + 0.06), s: [width, 0.03, 0.03], color: '#5a5f5c', ry });
  };
  addWindow('east', cz + 0.8, 2.0);
  addWindow('south', cx, 2.2);
  addWindow('north', cx + 0.6, 1.6);
  addWindow('west', cz, 1.4);
  // 출입문(길 쪽, 북쪽 끝)과 문 앞 디딤판.
  const doorZ = B.z0 + 1.0;
  glass.push({ p: [B.x1 + 0.02, Y + 1.12, doorZ], s: [0.95, 2.1, 0.05], color: '#2e3c40', ry: Math.PI / 2 });
  trim.push({ p: [B.x1 + 0.06, Y + 2.24, doorZ], s: [1.15, 0.1, 0.1], color: '#e4e4dc', ry: Math.PI / 2 });
  trim.push({ p: [B.x1 + 0.45, Y + 0.08, doorZ], s: [0.8, 0.16, 1.4], color: '#b7bbb3' });
  return { trim, glass, bars };
}

function boothSign() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#f4f2ea'; c.fillRect(0, 0, 512, 160); c.strokeStyle = '#3c4744'; c.lineWidth = 10; c.strokeRect(5, 5, 502, 150);
  c.fillStyle = '#26302d'; c.font = '900 92px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('경비실', 256, 84);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}

export function GuardBooth() {
  const parts = useMemo(guardBoothParts, []);
  const sign = useMemo(boothSign, []);
  const stone = useSurfaceMaps('stone');
  useEffect(() => () => sign.dispose(), [sign]);
  const w = B.x1 - B.x0, d = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
  return <group>
    <mesh position={[cx, Y + B.height / 2, cz]} castShadow receiveShadow>
      <boxGeometry args={[w, B.height, d]} /><meshStandardMaterial color="#cfd1ca" {...stone} roughness={0.92} />
    </mesh>
    <Batch parts={parts.trim} /><Batch parts={parts.glass} glass /><Batch parts={parts.bars} metal />
    <mesh position={[B.x1 + 0.09, Y + 2.62, B.z0 + 1.0]} rotation-y={Math.PI / 2}><planeGeometry args={[1.3, 0.4]} /><meshStandardMaterial map={sign} roughness={0.8} /></mesh>
  </group>;
}
