import { MAIN_ENTRANCE, MAIN_ENTRY_RISE, mainEntryPoint } from '../../features/tour/mainEntrance';
import type { Part } from './Batch';

/** 본관 정면 저층동과 주차장 측면의 유리 계단실. 높이는 2층 정문 바닥 기준. */
export function addMainBuildingDetails(stone: Part[], frames: Part[], glass: Part[], round: Part[], angle: number) {
  const point = (v: number, u: number, y: number): Part['p'] => {
    const [x, z] = mainEntryPoint(v, u); return [x, y, z];
  };
  const box = (u: number, v: number, y: number, w: number, h: number, d: number, color: string, ry = angle) => stone.push({ p: point(v, u, y), s: [w, h, d], color, ry });
  const door = (u: number, v: number, floor: number, width: number, ry: number, side = false) => {
    box(u, v, floor + 1.45, width + 0.36, 3, 0.11, '#27383e', ry);
    for (const sign of [-1, 1]) {
      const du = side ? 0.14 : sign * width / 4, dv = side ? sign * width / 4 : 0.14;
      glass.push({ p: point(v + dv, u + du, floor + 1.42), s: [width / 2 - 0.09, 2.78, 0.08], color: '#355b64', ry });
    }
    for (const offset of [-width / 2, 0, width / 2]) frames.push({ p: point(v + (side ? offset : 0.2), u + (side ? 0.2 : offset), floor + 1.45), s: [0.07, 2.92, 0.14], color: '#b8c1bd', ry });
    for (const y of [0.04, 2.9]) frames.push({ p: point(v + (side ? 0 : 0.2), u + (side ? 0.2 : 0), floor + y), s: [width + 0.13, 0.09, 0.14], color: '#b8c1bd', ry });
  };
  door(0, 0.13, 0, 6.3, angle);
  for (const side of [-1, 1]) {
    box(side * 5.7, 1.4, 1.55, 0.7, 3.1, 0.75, '#c8c7bb');
    for (const u of [-0.32, 0.32]) round.push({ p: point(0.44, u, 1.35), s: [0.025, 0.48, 0.025], color: '#c2c8c5' });
  }
  box(0, 1.2, 3.2, 13.5, 0.55, 3.4, '#d4d1c2');
  // 계단의 양쪽 벽은 하나의 연속된 경사석으로 이어진다.
  const e = MAIN_ENTRANCE, base = -MAIN_ENTRY_RISE;
  box(0, 0.9, base / 2, 11.5, MAIN_ENTRY_RISE, 1.8, '#c9c9bd');
  for (let i = 0; i < e.upperSteps; i++) {
    const h = -i * e.riser - base;
    box(0, e.upperLanding + (i + 0.5) * e.tread, base + h / 2, e.upperWidth, h, e.tread + 0.012, '#c6c9c5');
    box(0, e.upperLanding + i * e.tread + 0.03, -i * e.riser + 0.008, e.upperWidth, 0.022, 0.07, '#e2e2d9');
  }
  box(0, 4.6, base + 1.05 / 2, 12, 1.05, e.landing, '#c9ccc7');
  for (let i = 0; i < e.lowerSteps; i++) {
    const h = (e.lowerSteps - i) * e.riser;
    box(0, 5.4 + (i + 0.5) * e.tread, base + h / 2, e.width, h, e.tread + 0.012, '#c6c9c5');
    box(0, 5.4 + i * e.tread + 0.03, base + h + 0.008, e.width, 0.022, 0.07, '#e2e2d9');
  }
  box(0, 9.1, base - 0.06, 13.5, 0.12, 1.8, '#c8c7bc');
  for (const side of [-1, 1]) {
    // 일정한 폭의 석재 벽과 덮개를 경사에 맞춰 길게 연결한다.
    for (const [v0, v1, y0, y1] of [[0, 1.8, 0.3, 0.3], [1.8, 3.8, 0.3, -0.45], [3.8, 5.4, -0.45, -0.45], [5.4, 8.35, -0.45, -1.5]]) {
      const len = v1! - v0!, dy = y1! - y0!, y = (y0! + y1!) / 2;
      box(side * 6.65, (v0! + v1!) / 2, (base + y) / 2, 0.32, y - base, len + 0.03, '#adb3ac');
      stone.push({ p: point((v0! + v1!) / 2, side * 6.65, y + 0.04), s: [Math.hypot(len, dy) + 0.03, 0.13, 0.48], color: '#d6d7cc', ry: angle - Math.PI / 2, rz: Math.atan2(dy, len) });
    }
  }
  // 2층 정문과 원형 고층동 사이의 선큰 1층 출입구.
  door(19, 0.17, -3.6, 3, angle);
  box(19, 0.7, -0.48, 4, 0.18, 1.5, '#bfc7c1');
  // 운동장 쪽 옆면의 3층 출입구.
  door(42.02, -19, 3.6, 6.3, angle + Math.PI / 2, true);
  box(42.85, -19, 6.85, 8.1, 0.32, 2.8, '#c3c8c1', angle + Math.PI / 2);

  // 사진의 파란 부분은 4층 저층동의 측면 계단실이다. 정면에 긴 판을 붙이지 않는다.
  const bottom = -3.6, top = 12.6, towerU = -18.85, towerV = -9.8;
  box(towerU, towerV, (bottom + top) / 2, 4.8, top - bottom, 7.8, '#263f4c');
  for (let row = 0; row < 18; row++) {
    const y = bottom + (row + 0.5) * 0.9;
    for (let col = 0; col < 3; col++) {
      glass.push({ p: point(towerV - 2.55 + col * 2.55, towerU - 2.46, y), s: [2.44, 0.79, 0.08], color: row % 4 === 0 ? '#65818d' : '#496777', ry: angle + Math.PI / 2 });
      glass.push({ p: point(towerV + 3.96, towerU - 1.55 + col * 1.55, y), s: [1.43, 0.79, 0.08], color: row % 4 === 0 ? '#7e969e' : '#526e7c', ry: angle });
    }
    frames.push({ p: point(towerV, towerU - 2.53, bottom + row * 0.9), s: [7.9, 0.065, 0.10], color: '#304b5c', ry: angle + Math.PI / 2 });
    frames.push({ p: point(towerV + 4.02, towerU, bottom + row * 0.9), s: [4.9, 0.065, 0.10], color: '#304b5c', ry: angle });
  }
  for (const offset of [-3.9, -1.3, 1.3, 3.9]) frames.push({ p: point(towerV + offset, towerU - 2.53, (top + bottom) / 2), s: [0.09, top - bottom, 0.11], color: '#304b5c', ry: angle + Math.PI / 2 });
  box(towerU, towerV, top + 0.12, 5.05, 0.24, 8.05, '#9ba9ad');
  // 지붕 위 십자가 프레임은 유리 계단실 위에 낮게 둔다.
  for (const side of [-1, 1]) frames.push({ p: point(towerV, towerU + side * 0.8, top + 2.1), s: [0.09, 4.2, 0.09], color: '#a9b3b1' });
  for (const y of [top + 1, top + 3]) frames.push({ p: point(towerV, towerU, y), s: [2.3, 0.09, 0.09], color: '#a9b3b1', ry: angle });
}
