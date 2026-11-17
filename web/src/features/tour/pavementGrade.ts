import graph from '../../../public/data/paths.json';
import { straightenSpineNodes, spineLocal, spineGrade, spineRampGrade, spinePoint, SPINE_LENGTH, CENTRAL_PARKING_APRON } from './campusSpine';
import type { CampusData } from '../../types/generated/campus';
import { MAIN_ENTRY_BASE, mainEntryLocal } from './mainEntrance';
import { MAIN_PARKING, MAIN_STREET, inMainStreet, mainLowerGrade } from './mainBuildingAccess';
import { MUSIC_SITE } from './musicForecourt';
import { MUSIC_FORECOURT_LEVEL, PARKING_LEVEL, UPPER_CAMPUS_LEVEL, SLOPE_GAIN } from './elevationLevels';
import { frontageGrade, BUILDING_FRONTAGE, FRONTAGE_FLAT_CLIP } from './buildingFrontage';
import { inFountainSite, fountainSurface } from './fountainSite';
import clipping from 'polygon-clipping';
import { fieldWalkGrade } from './fieldWalk';

type Point = [number, number];
type Anchor = [number, number, number];
const clamp = (t: number) => Math.max(0, Math.min(1, t));
function sample(x: number, z: number, a: Anchor, b: Anchor) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1));
  return { distance: Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), y: a[2] + (b[2] - a[2]) * t };
}
function inPolygon(x: number, z: number, ring: Point[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  if (hit) return true;
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    return sample(x, z, [a[0], a[1], 0], [b[0], b[1], 0]).distance < 0.002;
  });
}

export function pavementPads(campus: CampusData) {
  const parking = (campus.outdoor_areas ?? []).filter(a => a.kind === 'parking').flatMap(a => {
    const rings = [a.footprint];
    const y = a.id === 'parking_970298862' ? MAIN_ENTRY_BASE : a.center[1] > 180 ? UPPER_CAMPUS_LEVEL : PARKING_LEVEL;
    return rings.map(ring => ({ ring, y }));
  });
  if (campus.buildings.some(b => b.id === 'main')) parking.push({ ring: MAIN_STREET, y: MAIN_ENTRY_BASE }, { ring: MAIN_PARKING, y: MAIN_ENTRY_BASE });
  if (campus.buildings.some(b => b.id === 'music')) parking.push({ ring: MUSIC_SITE, y: MUSIC_FORECOURT_LEVEL });
  // 대학원관 앞 보도 중 교차로 오르막에 걸친 북쪽 끝은 경사면으로 따로 만든다.
  for (const poly of clipping.intersection([BUILDING_FRONTAGE], [FRONTAGE_FLAT_CLIP])) parking.push({ ring: poly[0]! as Point[], y: MUSIC_FORECOURT_LEVEL });
  parking.push({ ring: CENTRAL_PARKING_APRON, y: PARKING_LEVEL });
  return parking;
}

/** Road, sidewalk, curb and paint share one engineered grade, independent of landscape pads. */
export function pavementGrade(campus: CampusData, profiles: { id: string; points: Anchor[] }[]) {
  const parking = pavementPads(campus);
  const profileSegments = profiles.flatMap(p => p.points.slice(1).map((b, i) => ({ a: p.points[i]!, b })));
  const gate = profiles.find(p => p.id === 'main-west')!.points;
  const level = (x: number, z: number) => {
    const { u, v } = mainEntryLocal(x, z);
    if (inMainStreet(x,z)) return MAIN_ENTRY_BASE;
    // 본관 안쪽 순환 차도·측면 주차장은 계단 하부와 같은 평지다.
    if (u > -45 && u < 32 && v > 10 && v < 28) return MAIN_ENTRY_BASE;
    const spine = spineLocal(x, z);
    if (spine.along >= -0.002 && spine.along <= SPINE_LENGTH + 0.002 && Math.abs(spine.side) <= 5.302) return spineGrade((spinePoint(spine.along))[1]);
    const ramp = spineRampGrade(x, z); if (ramp !== undefined) return ramp;
    const pad = parking.find(p => inPolygon(x, z, p.ring));
    if (pad) return pad.y;
    const frontage = frontageGrade(campus, x, z); if (frontage !== undefined) return frontage;
    const fieldWalk = fieldWalkGrade(x, z); if (fieldWalk !== undefined) return fieldWalk;
    // 분수 삼각지를 가로지르는 연결 차도는 삼각지 경사면을 그대로 따른다.
    if (inFountainSite(x, z)) return fountainSurface(x, z);
    // 중앙 주차장 내부 교차로는 수평이며 서측 진입 경사는 위에서 별도로 처리한다.
    if (z >= 36 && z <= 146 && x > -54 && x < 34) return PARKING_LEVEL;
    const nearest = profileSegments.map(p => sample(x, z, p.a, p.b)).reduce((a, b) => a.distance < b.distance ? a : b);
    if (nearest.distance < 25) return nearest.y;
    if (z >= 170) return UPPER_CAMPUS_LEVEL;
    if (z >= 35) return PARKING_LEVEL;
    // GEMI관 옆 서측 직선 도로는 본관 교차로부터 음악관까지 일정한 오르막.
    if (x < -45 && z > -132) return MAIN_ENTRY_BASE + (PARKING_LEVEL - MAIN_ENTRY_BASE) * clamp((z + 132) / 192);
    return 4 * SLOPE_GAIN + (PARKING_LEVEL - 4 * SLOPE_GAIN) * clamp(z / 36);
  };
  const nodes = new Map(straightenSpineNodes(graph.nodes).map(n => [n.id, [n.x, n.z, level(n.x, n.z)] as Anchor]));
  const roads = graph.edges.filter(e => e.kind === 'road' && !([e.a, e.b].includes('n58') && [e.a, e.b].includes('n66'))).flatMap(e => {
    const a = nodes.get(e.a)!, b = nodes.get(e.b)!;
    if (!a || !b) return [];
    const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const stops = [{ p: a, t: 0 }, { p: b, t: 1 }];
    for (const profile of profiles) for (const p of profile.points) {
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2;
      if (t > 0.001 && t < 0.999 && sample(p[0], p[1], a, b).distance < 0.01) stops.push({ p, t });
    }
    for (let i=0;i<MAIN_STREET.length;i++) {
      const c=MAIN_STREET[i]!,d=MAIN_STREET[(i+1)%MAIN_STREET.length]!,ex=d[0]-c[0],ez=d[1]-c[1],det=dx*ez-dz*ex;
      if(Math.abs(det)<1e-9) continue;
      const px=c[0]-a[0],pz=c[1]-a[1],t=(px*ez-pz*ex)/det,q=(px*dz-pz*dx)/det;
      if(t>0.00001&&t<.99999&&q>=0&&q<=1) stops.push({p:[a[0]+dx*t,a[1]+dz*t,MAIN_ENTRY_BASE],t});
    }
    const ordered = stops.sort((a, b) => a.t - b.t).filter((p, i, all) => !i || p.t - all[i - 1]!.t > 0.00001);
    return ordered.slice(1).map((b, i) => ({ a: ordered[i]!.p, b: b.p }));
  });
  return (x: number, z: number, original: number) => {
    const lower = mainLowerGrade(x,z); if (lower !== undefined) return lower;
    if (inMainStreet(x,z)) return MAIN_ENTRY_BASE;
    const spine = spineLocal(x, z);
    if (spine.along >= -0.002 && spine.along <= SPINE_LENGTH + 0.002 && Math.abs(spine.side) <= 5.302) return spineGrade((spinePoint(spine.along))[1]);
    const ramp = spineRampGrade(x, z); if (ramp !== undefined) return ramp;
    const pad = parking.find(p => inPolygon(x, z, p.ring));
    if (pad) return pad.y;
    const { u, v } = mainEntryLocal(x, z);
    const frontage = frontageGrade(campus, x, z); if (frontage !== undefined) return frontage;
    const fieldWalk = fieldWalkGrade(x, z); if (fieldWalk !== undefined) return fieldWalk;
    // 넓은 계단 앞마당과 양옆 인도까지 수평으로 이어진다.
    if (Math.abs(u) <= 15 && v >= 8.2 && v <= 16.5) return MAIN_ENTRY_BASE;
    let nearest = { distance: Infinity, y: original };
    let nearestRoad: typeof roads[number] | undefined;
    const samples: { distance: number; y: number; road: typeof roads[number] }[] = [];
    for (const road of roads) {
      const p = sample(x, z, road.a, road.b);
      if (p.distance < 10) samples.push({ ...p, road });
      if (p.distance < nearest.distance) { nearest = p; nearestRoad = road; }
    }
    // 교차로에서 서로 다른 경사의 최근접 선이 바뀌어도 높이가 튀지 않는다.
    let total = 0, y = 0;
    for (const p of samples) {
      if (nearestRoad && p.road !== nearestRoad) {
        const a = nearestRoad, b = p.road;
        const ax = a.b[0] - a.a[0], az = a.b[1] - a.a[1], bx = b.b[0] - b.a[0], bz = b.b[1] - b.a[1];
        // 같은 직선의 경사→평지 연결은 단면 전체가 동시에 전환된다.
        if (Math.abs(ax * bz - az * bx) < 0.1 * Math.hypot(ax, az) * Math.hypot(bx, bz)) continue;
      }
      const weight = Math.max(0, 1 - (p.distance - nearest.distance) / 1.5) ** 2;
      total += weight; y += p.y * weight;
    }
    if (total) nearest.y = y / total;
    // 같은 횡단면에서 차도와 양쪽 1.8m 보도가 같은 높이를 공유한다.
    const t = clamp((nearest.distance - 6.8) / 3);
    let result = nearest.y + (original - nearest.y) * t * t * (3 - 2 * t);
    // 가까이 나란히 달리는 본관 안쪽 길이 정문 보도를 끌어올리지 않게 한다.
    const gateSample = gate.slice(1).map((b, i) => sample(x, z, gate[i]!, b)).reduce((a, b) => a.distance < b.distance ? a : b);
    if (gateSample.distance < 9.8) {
      const start = gate[0]!, next = gate[1]!, dx = next[0] - start[0], dz = next[1] - start[1];
      const progress = ((x - start[0]) * dx + (z - start[1]) * dz) / Math.hypot(dx, dz);
      const junction = clamp((16 - u) / 4) * clamp((v - 26) / 2) * clamp(progress / 8) * clamp((9.8 - gateSample.distance) / 3);
      result += (gateSample.y - result) * junction * junction * (3 - 2 * junction);
    }
    return result;
  };
}
