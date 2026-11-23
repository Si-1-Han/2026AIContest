import { addMainBuildingDetails } from './mainBuildingSpec';
import { MAIN_ENTRANCE, MAIN_ENTRY_RISE, MAIN_ENTRY_BASE, MAIN_ENTRY_FLOOR, mainEntryLocal } from '../../features/tour/mainEntrance';
import clipping from 'polygon-clipping';
import { VISION_PASSAGE_CUT } from '../../features/tour/visionTerrace';
import { RODEM_DOOR_WIDTH, RODEM_ENTRY_T, RODEM_ENTRY_WALL } from '../../features/tour/rodemEntrance';
import { VISION_DOOR_WIDTH, VISION_ENTRY_T, VISION_ENTRY_WALL } from '../../features/tour/visionEntrance';
import { MUSIC_FIELD_DOOR_WIDTH } from '../../features/tour/musicForecourt';
import type { Building } from '../../types/generated/campus';
import type { Part } from './Batch';
import { inside } from '../../features/tour/network';

type P = [number, number];
export interface RoofSpec { x: number; z: number; y: number; length: number; width: number; angle: number; color: string }
export const themes: Record<string, { wall: string; glass: string; trim: string }> = {
  main: { wall: '#d6d7d2', glass: '#54819a', trim: '#aeb9c0' },
  graduate: { wall: '#dedbd1', glass: '#76969f', trim: '#c4c1b7' },
  design: { wall: '#d9dfdd', glass: '#7da2aa', trim: '#bac9cb' },
  gemi: { wall: '#79aeb4', glass: '#588f9d', trim: '#d3e0dd' },
  music: { wall: '#b46b50', glass: '#4e7277', trim: '#e5ddc6' },
  vision_center: { wall: '#e1e4df', glass: '#558e9e', trim: '#c5d4d6' },
  rodem: { wall: '#956e5e', glass: '#7c9990', trim: '#e7e7d5' },
  science: { wall: '#e6e5d8', glass: '#668a8a', trim: '#cba894' },
  vision: { wall: '#e8e1cc', glass: '#659aa4', trim: '#a9aea6' },
  theology: { wall: '#eceee3', glass: '#678995', trim: '#e0e5db' },
  student_union: { wall: '#6daaa3', glass: '#5bada9', trim: '#d9e4d9' },
};
export function edges(outline: P[]) {
  const area = outline.reduce((v, a, i) => { const b = outline[(i + 1) % outline.length]!; return v + a[0] * b[1] - b[0] * a[1]; }, 0);
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]!, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const sign = area > 0 ? 1 : -1;
    return { a, b, length, angle: -Math.atan2(dz, dx), nx: dz / length * sign, nz: -dx / length * sign };
  }).filter(e => e.length > 0.3);
}
export type Edge = ReturnType<typeof edges>[number];
export function onEdge(e: Edge, t: number, offset = 0): P { return [e.a[0] + (e.b[0] - e.a[0]) * t + e.nx * offset, e.a[1] + (e.b[1] - e.a[1]) * t + e.nz * offset]; }

const isEntryWall = ({ a, b }: Edge, wall: [P, P]) => [a, b].every(([x, z], i) => x === wall[i]![0] && z === wall[i]![1]);
const isMusicFieldWall = (edge: Edge) => edge.nz < -0.98 && edge.length > 50;

export function buildExteriorSpec(b: Building) {
  const theme = themes[b.id] ?? themes.main!;
  const stone: Part[] = [], frames: Part[] = [], glass: Part[] = [], round: Part[] = [], cones: Part[] = [], pediments: Part[] = [];
  const box = (p: Part['p'], s: Part['s'], color: string, ry = 0, rz = 0) => stone.push({ p, s, color, ry, rz });
  const outlineEdges = edges(b.footprint);
  // 정면 방향은 제공된 사진과 운동장/중앙도로의 상대 위치를 기준으로 지정한다.
  const frontDir: P = ['graduate', 'design', 'gemi'].includes(b.id) ? [1, 0] : b.id === 'music' ? [0, 1] : b.id === 'student_union' ? [-1, 0] : b.id === 'main' ? [-1, 0.5] : b.id === 'science' ? [0, 1] : [0, -1];
  const movedDoor = b.id === 'rodem' ? { wall: RODEM_ENTRY_WALL, t: RODEM_ENTRY_T, width: RODEM_DOOR_WIDTH }
    : b.id === 'vision' ? { wall: VISION_ENTRY_WALL, t: VISION_ENTRY_T, width: VISION_DOOR_WIDTH } : undefined;
  const movedFront = movedDoor && outlineEdges.find(e => isEntryWall(e, movedDoor.wall));
  const musicFieldFront = b.id === 'music' ? outlineEdges.find(isMusicFieldWall) : undefined;
  const front = movedFront ?? outlineEdges.filter(e => e.length > 9).sort((a, c) => (c.nx * frontDir[0] + c.nz * frontDir[1]) * 30 + c.length * 0.08 - (a.nx * frontDir[0] + a.nz * frontDir[1]) * 30 - a.length * 0.08)[0]!;
  const floorShift = b.id === 'main' ? 1 : 0;
  const height = (b.levels - floorShift) * b.floor_height;
  const floors = b.floors.filter(f => f.level > 0);
  const levels = Array.from({ length: b.levels }, (_, i) => {
    const outline = floors.find(f => f.level === i + 1)?.outline ?? b.footprint;
    // 1·2층 왼쪽 계단과 외부 통로를 건물에 파서 3층 바닥이 통로의 천장이 된다.
    return b.id === 'vision_center' && i < 2 ? clipping.difference([outline], [VISION_PASSAGE_CUT]).map(([outline]) => ({ outline: outline!, level: i })) : [{ outline, level: i - floorShift }];
  }).flat();
  for (const { outline, level } of levels) for (const e of edges(outline)) {
    const y = level * b.floor_height;
    const curtain = b.id === 'gemi' || b.id === 'student_union' || (b.id === 'vision_center' && level < 3);
    const count = Math.max(1, Math.floor(e.length / (curtain ? 2.5 : 3.4)));
    const cell = e.length / count;
    const doorway = level !== 0 ? undefined : movedDoor && isEntryWall(e, movedDoor.wall) ? movedDoor
      : musicFieldFront && isMusicFieldWall(e) ? { t: 0.5, width: MUSIC_FIELD_DOOR_WIDTH } : undefined;
    if (e.length > 2.5) for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = onEdge(e, t, 0.14);
      // 출입구 위에 일반 창문·창턱을 겹쳐 그리지 않는다.
      if (doorway && Math.abs(t - doorway.t) * e.length < doorway.width / 2 + cell * 0.4) continue;
      if (b.id === 'main' && level === 0 && e.nx * front.nx + e.nz * front.nz > 0.99) {
        const center = onEdge(front, MAIN_ENTRANCE.t), u = (p[0] - center[0]) * MAIN_ENTRANCE.ux + (p[1] - center[1]) * MAIN_ENTRANCE.uz;
        if (Math.abs(u) < 5.3) continue;
      }
      if (b.id === 'main' && (level === -1 || level === 1)) {
        const { u, v } = mainEntryLocal(p[0], p[1]);
        if (level === -1 && Math.abs(u - 19) < 2.2 && Math.abs(v) < 0.5 || level === 1 && Math.abs(u - 41.9) < 0.6 && Math.abs(v + 19) < 3.6) continue;
      }
      if (b.id === 'music' && level === 0 && e.nx < -0.9 && Math.abs(t - 0.5) * e.length < 2.2) continue;
      const alternate = b.id === 'vision_center' && level > 5 && (i * 7 + level * 3) % 5 < 2;
      const w = cell * (curtain ? 0.95 : 0.73);
      let h = b.floor_height * (curtain ? 0.94 : alternate ? 0.4 : 0.57), cy = y + b.floor_height * 0.56;
      if (b.id === 'main' && level === -1) {
        const {u,v}=mainEntryLocal(p[0],p[1]);
        if (!(u>16.4 && u<21.6 && Math.abs(v)<.5)) {
          // 주차장 면에 접하는 최하단 창과 창턱을 노면 위에 온전히 둔다.
          const bottom=MAIN_ENTRY_BASE-MAIN_ENTRY_FLOOR+.3;
          h=MAIN_ENTRY_FLOOR-MAIN_ENTRY_BASE-.6;cy=bottom+h/2;
        }
      }
      glass.push({ p: [p[0], cy, p[1]], s: [w, h, 0.055], color: (i * 17 + level * 11) % 7 === 0 ? '#90a8b0' : theme.glass, ry: e.angle });
      const backing = onEdge(e, t, 0.035);
      box([backing[0], cy, backing[1]], [w + 0.18, h + 0.18, 0.055], '#384951', e.angle);
      // 네 면의 두께 있는 프레임과 돌출 창턱. 유리 뒤는 막아 실내가 보이지 않게 한다.
      const frameColor = curtain ? '#c2cbd0' : '#637781';
      for (const side of [-1, 1]) {
        const q = onEdge(e, t + side * (w + 0.08) / 2 / e.length, 0.19);
        frames.push({ p: [q[0], cy, q[1]], s: [0.085, h + 0.20, 0.23], color: frameColor, ry: e.angle });
        const r = onEdge(e, t, 0.19);
        frames.push({ p: [r[0], cy + side * (h + 0.08) / 2, r[1]], s: [w + 0.18, 0.085, 0.23], color: frameColor, ry: e.angle });
      }
      frames.push({ p: [p[0], cy, p[1]], s: [0.045, h, 0.10], color: frameColor, ry: e.angle });
      if (!curtain) {
        const q = onEdge(e, t, 0.24);
        box([q[0], cy - h / 2 - 0.16, q[1]], [w + 0.34, 0.14, 0.48], theme.trim, e.angle);
        frames.push({ p: [p[0], cy - h * 0.27, p[1]], s: [w, 0.045, 0.10], color: frameColor, ry: e.angle });
      }
      if (!curtain && i % 3 === 0) {
        const q = onEdge(e, i / count, 0.09);
        box([q[0], y + 1.8, q[1]], [0.14, b.floor_height, 0.16], theme.wall, e.angle);
      }
    }
    const p = onEdge(e, 0.5, 0.1);
    if (doorway) {
      const center = e.length * doorway.t, opening = doorway.width / 2 + 0.07;
      for (const [start, end] of [[0, center - opening], [center + opening, e.length]] as const) {
        const [x, z] = onEdge(e, (start + end) / (2 * e.length), 0.1);
        box([x, y + 0.08, z], [end - start, 0.12, 0.30], theme.trim, e.angle);
      }
    } else box([p[0], y + 0.08, p[1]], [e.length, b.id === 'music' ? 0.18 : 0.12, 0.30], theme.trim, e.angle);
    if (b.id === 'graduate' && level < 2) box([p[0], y + 0.4, p[1]], [e.length, 0.8, 0.2], '#454d50', e.angle);
    if (b.id === 'science' && level < 2) box([p[0], y + 0.5, p[1]], [e.length, 0.7, 0.2], '#d1ad9b', e.angle);
    if (b.id === 'vision' && e.length > 15) for (let t = 0.04; t < 1; t += 0.12) { const q = onEdge(e, t, 0.17); box([q[0], y + 1.8, q[1]], [0.8, 3.6, 0.3], theme.wall, e.angle); }
    if (level === b.levels - 1 - floorShift) box([p[0], height + 0.12, p[1]], [e.length + 0.3, 0.32, b.id === 'design' ? 2.6 : 0.6], theme.trim, e.angle);
    const nextFloor = levels.filter(f => f.level === level + 1).map(f => f.outline);
    const inner = onEdge(e, 0.5, -0.25);
    if (['main', 'graduate', 'design', 'gemi', 'vision_center'].includes(b.id) && e.length > 5 && (!nextFloor.length || !nextFloor.some(outline => inside(inner, outline)))) {
      const top = (level + 1) * b.floor_height;
      for (const railY of [0.50, 0.95]) frames.push({ p: [p[0], top + railY, p[1]], s: [e.length, 0.055, 0.055], color: '#9aa8a9', ry: e.angle });
      for (let t = 0.04; t < 1; t += 2.6 / e.length) { const q = onEdge(e, t, 0.1); frames.push({ p: [q[0], top + 0.5, q[1]], s: [0.055, 1.0, 0.055], color: '#a8b2b0' }); }
    }
  }
  const fp = (t: number, offset: number, y: number): Part['p'] => { const p = onEdge(front, t, offset); return [p[0], y, p[1]]; };
  // 이공관은 남향 안뜰에만 출입구를 둔다. 영비관 문은 계단이 열리는 쪽을 비운다.
  const entranceT = movedFront && movedDoor ? movedDoor.t : b.id === 'vision_center' ? 0.26 : b.id === 'main' ? MAIN_ENTRANCE.t : 0.5;
  const entranceRise = 0;
  const entrance = { edge: front, t: entranceT, rise: entranceRise, stairsHeight: b.id === 'main' ? MAIN_ENTRY_RISE : 0 };
  const addGlazedEntrance = (edge: Edge, t: number, width: number) => {
    const door = (side: number, offset: number, y: number): Part['p'] => {
      const [x, z] = onEdge(edge, t + side / edge.length, offset);
      return [x, y, z];
    };
    box(door(0, 0.055, 1.39), [width + 0.14, 2.78, 0.14], '#263d42', edge.angle);
    for (const side of [-1, 1]) {
      glass.push({ p: door(side * (width / 4 - 0.012), 0.145, 1.39), s: [width / 2 - 0.1, 2.54, 0.08], color: '#52737d', ry: edge.angle });
      box(door(side * 0.11, 0.22, 1.13), [0.04, 0.34, 0.08], '#bbc5c4', edge.angle);
    }
    for (const side of [-width / 2, 0, width / 2]) {
      frames.push({ p: door(side, 0.17, 1.4), s: [0.1, 2.72, 0.14], color: '#526d73', ry: edge.angle });
    }
    box(door(0, 0.56, 3.07), [width + 0.64, 0.24, 1.38], theme.trim, edge.angle);
  };
  let roofCrossLights: Part[] = [];
  if (b.id === 'main') {
    roofCrossLights = addMainBuildingDetails(stone, frames, glass, round, front.angle);
  } else if (movedFront && movedDoor) {
    addGlazedEntrance(movedFront, entranceT, movedDoor.width);
  } else {
    glass.push({ p: fp(entranceT, 0.19, 1.5), s: [3, 3, 0.2], color: '#355b64', ry: front.angle });
    box(fp(entranceT, 1.0, 3.25), [6, 0.35, 2.6], ['graduate', 'theology', 'student_union'].includes(b.id) ? '#3a464b' : theme.trim, front.angle);
    for (let i = 0; i < (b.id === 'theology' ? 11 : 3); i++) box(fp(entranceT, 1.3 + i * 0.4, 0.12 + (b.id === 'theology' ? 10 - i : 2 - i) * 0.14), [b.id === 'theology' ? 8.5 : 5.2, 0.24, 0.6], '#c9ccc0', front.angle);
  }
  if (musicFieldFront) addGlazedEntrance(musicFieldFront, 0.5, MUSIC_FIELD_DOOR_WIDTH);
  if (b.id === 'graduate' || b.id === 'design') {
    glass.push({ p: fp(0.86, 0.55, height * 0.52), s: [3.8, height * 0.95, 1.3], color: '#7caaaf', ry: front.angle });
    if (b.id === 'design') {
      box(fp(0.14, 0.25, height * 0.52), [4.1, height * 0.94, 0.5], theme.wall, front.angle);
      box(fp(0.14, 0.55, height * 0.52), [1.4, height * 0.82, 0.16], '#58676a', front.angle);
      for (let y = 3; y < height - 1; y += 0.35) box(fp(0.14, 0.67, y), [1.4, 0.09, 0.14], '#a8b1a9', front.angle);
    }
  }
  if (b.id === 'gemi') {
    const base = fp(0.25, 3.2, 0);
    for (const side of [-2.2, 2.2]) { const q = onEdge(front, 0.25 + side / front.length, 3.2); round.push({ p: [q[0], height / 2, q[1]], s: [0.18, height, 0.18], color: '#e7e1c9' }); }
    for (let floor = 0; floor < b.levels; floor++) {
      const y = floor * b.floor_height;
      box([base[0], y + 0.25, base[2]], [5.6, 0.25, 3.8], '#dcd5bb', front.angle);
      // Exposed stair flights alternate direction each storey.
      for (let step = 0; step < 14; step++) box(fp(0.25 + (step / 13 - 0.5) * 4 / front.length * (floor % 2 ? -1 : 1), 3.2, y + step / 14 * 3.6), [0.45, 0.16, 1.5], '#ddd7bd', front.angle);
      for (let rail = 0; rail < 4; rail++) box([base[0], y + 0.5 + rail * 0.22, base[2] + front.nz * 1.95], [5.7, 0.06, 0.07], '#ece6d1', front.angle);
    }
    for (const y of [9.7, 15.3]) { box(fp(0.78, 1.0, y), [3.4, 3.5, 2.5], '#e4ae36', front.angle); glass.push({ p: fp(0.78, 2.28, y), s: [2.5, 2.6, 0.12], color: '#739a9f', ry: front.angle }); }
  }
  if (b.id === 'music') {
    // GEMI관을 지난 서측 작은 주차장을 향한 1층 중앙 출입구.
    const west = outlineEdges.find(e => e.nx < -0.9)!;
    const p = onEdge(west, 0.5, 0.2), ry = west.angle;
    box([p[0], 1.42, p[1]], [3.5, 2.94, 0.12], '#263f45', ry);
    for (const sign of [-1, 1]) {
      const q = onEdge(west, 0.5 + sign * 0.79 / west.length, 0.3);
      glass.push({ p: [q[0], 1.37, q[1]], s: [1.48, 2.68, 0.1], color: '#52737d', ry });
    }
    for (const offset of [-1.62, 0, 1.62]) {
      const q = onEdge(west, 0.5 + offset / west.length, 0.36);
      frames.push({ p: [q[0], 1.42, q[1]], s: [0.08, 2.85, 0.12], color: '#bdc5c1', ry });
    }
    // 실제 서측 박공면의 세로 유리 계단실과 가는 수평 몰딩.
    const stairGlass = onEdge(west, 0.68, 0.24);
    glass.push({ p: [stairGlass[0], height * 0.5, stairGlass[1]], s: [4.8, height * 0.92, 0.18], color: '#547c86', ry });
    for (let y = 0.8; y < height; y += 1.25) {
      const q = onEdge(west, 0.68, 0.37);
      frames.push({ p: [q[0], y, q[1]], s: [4.9, 0.065, 0.1], color: '#778b8b', ry });
    }
    for (const t of [0.68 - 2.5 / west.length, 0.68 + 2.5 / west.length]) {
      const q = onEdge(west, t, 0.37); frames.push({ p: [q[0], height / 2, q[1]], s: [0.12, height, 0.2], color: '#d5d3bf', ry });
    }
    const canopy = onEdge(west, 0.5, 0.75);
    box([canopy[0], 3.05, canopy[1]], [4.6, 0.22, 1.7], '#d4d3c7', ry);
    const threshold = onEdge(west, 0.5, 0.8);
    box([threshold[0], 0.035, threshold[1]], [4, 0.07, 1.6], '#c8c9be', ry);
  }
  if (b.id === 'music') {
    // 주차장에서 보이는 남측 정면: 세 개의 넓은 석재 박공과 중앙 곡면 유리 계단실.
    for (const t of [0.04, 0.5, 0.96]) {
      const width = t === .5 ? 7 : 5.8;
      box(fp(t, .18, height / 2), [width, height, .44], theme.trim, front.angle);
      pediments.push({ p: fp(t, .20, height + 1.5), s: [width + .2, 3, .45], color: theme.trim, ry: front.angle });
      if (t === .5) continue;
      for (let level = 0; level < b.levels - 1; level++) {
        glass.push({ p: fp(t, .44, level * b.floor_height + 2), s: [2.1, 1.65, .1], color: '#4e7277', ry: front.angle });
        frames.push({ p: fp(t, .52, level * b.floor_height + 2), s: [.06, 1.65, .1], color: '#5b6667', ry: front.angle });
      }
      glass.push({ p: fp(t, .44, height - 3), s: [2.3, 3, .1], color: '#4e7277', ry: front.angle });
      round.push({ p: fp(t, .44, height - 1.5), s: [1.15, .12, 1.15], color: '#4e7277', ry: front.angle + Math.PI / 2, rz: Math.PI / 2 });
    }
    round.push({ p: fp(.5, .5, height / 2 + 1), s: [2.3, height - 2, 2.3], color: '#547d86' });
    for (let y = 2.2; y < height; y += 1.35) round.push({ p: fp(.5, .5, y), s: [2.35, .09, 2.35], color: '#bcc5be' });
    cones.push({ p: fp(.5, .5, height + .6), s: [2.6, 2.4, 2.6], color: '#a34e42' });
  }
  if (b.id === 'vision_center') {
    // 열린 2층 외부 통로 옆 기둥. 중앙 보행 폭은 확보한다.
    for (const z of [150.5, 160.5, 162.5]) box([12.1, b.floor_height, z], [0.4, b.floor_height * 2, 0.4], theme.trim);
    for (const e of edges(levels.at(-1)!.outline)) {
      const p = onEdge(e, 0.5, 0.3);
      box([p[0], height + 2.1, p[1]], [e.length, 0.16, 0.2], '#e3e7db', e.angle);
      for (let t = 0; t < 1; t += 2.1 / e.length) { const q = onEdge(e, t, 0.3); box([q[0], height + 1.2, q[1]], [0.14, 2.6, 0.16], '#e3e7db', e.angle); }
    }
  }
  if (b.id === 'theology') for (let t = 0.06; t < 1; t += 0.12) round.push({ p: fp(t, 0.24, height / 2), s: [0.3, height - 0.4, 0.3], color: '#f3f2e5' });
  if (b.id === 'student_union') box(fp(0.5, 0.8, height * 0.65), [front.length * 0.85, 0.8, 2], '#32494a', front.angle);
  if (b.id === 'rodem') for (const e of outlineEdges.filter(e => e.length > 6)) {
    const p = onEdge(e, 0.5); box([p[0], height + 0.35, p[1]], [e.length + 1.2, 0.3, 3.4], '#4c8c80', e.angle);
  }
  const roofs: RoofSpec[] = b.id === 'music' ? [{ x: b.center[0], z: b.center[1], y: height, length: 64, width: 20.5, angle: front.angle, color: '#ab654b' }] : b.id === 'rodem' ? [
    { x: 50.5, z: 108, y: height, length: 32, width: 12, angle: 0.045, color: '#508f80' },
    { x: 45.7, z: 121.5, y: height, length: 19.6, width: 14.8, angle: Math.PI / 2 + 0.055, color: '#508f80' },
    { x: 39, z: 135, y: height, length: 32, width: 11.8, angle: 0.045, color: '#508f80' },
  ] : [];
  return { stone, frames, glass, round, cones, pediments, roofs, roofCrossLights, front, entrance, musicFieldFront, levels, height };
}
