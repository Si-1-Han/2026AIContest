import { gateRoadPoints, gateWallSections, GATE_ROAD_WIDTH } from '../../features/tour/gateWalls';
import { MAIN_PARKING, MAIN_ROAD_OPENINGS, MAIN_FRONT_PLAZA, MAIN_STREET, MAIN_LOWER_CUT, MAIN_STAIR_SITE, MAIN_STAIR_PLANTERS } from '../../features/tour/mainBuildingAccess';
import { MUSIC_PARKING, MUSIC_SITE } from '../../features/tour/musicForecourt';
import { FIELD_WALK_WIDTH, inFieldWalk } from '../../features/tour/fieldWalk';
import { pavementPads } from '../../features/tour/pavementGrade';
import { BUILDING_FRONTAGE } from '../../features/tour/buildingFrontage';
import { FOUNTAIN_FIELD_LINK, onFountainWalk } from '../../features/tour/fountainSite';
import { SPINE_PARKING_RAMPS, CENTRAL_PARKING_APRON } from '../../features/tour/campusSpine';
import { CAMPUS_SPINE, SPINE_LENGTH, SPINE_RESERVED, SPINE_DRIVEWAY_OPENINGS, SPINE_DRIVEWAY_Z, SPINE_DRIVEWAY_WIDTH, spineDistanceAtZ, spinePoint, spineStrip, onCampusSpine } from '../../features/tour/campusSpine';
import { MAIN_ROAD_FORECOURT, VISION_GROUND_APRON, MUSIC_TO_VISION_ASPHALT } from '../../features/tour/pavedAreas';
import clipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { inside, segmentDistance, type Point, type TourCorridor } from '../../features/tour/network';
import type { CampusData, ContextBuilding } from '../../types/generated/campus';

export interface RoadLayout {
  asphalt: MultiPolygon;
  sidewalks: MultiPolygon;
  curbs: MultiPolygon;
  tactile: MultiPolygon;
  parkingLines: MultiPolygon;
  walkways: MultiPolygon;
  corridors: (TourCorridor & { width: number })[];
  flatPads: ReturnType<typeof pavementPads>;
  parking: MultiPolygon;
}
const rounded = (v: number) => Math.round(v * 10000) / 10000;
function capsule(a: Point, b: Point, radius: number): Polygon {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ring: Point[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = angle - Math.PI / 2 + i / 12 * Math.PI;
    ring.push([rounded(b[0] + Math.cos(t) * radius), rounded(b[1] + Math.sin(t) * radius)]);
  }
  for (let i = 0; i <= 12; i++) {
    const t = angle + Math.PI / 2 + i / 12 * Math.PI;
    ring.push([rounded(a[0] + Math.cos(t) * radius), rounded(a[1] + Math.sin(t) * radius)]);
  }
  return [ring];
}
function merge(polys: Polygon[]): MultiPolygon { return polys.length ? clipping.union(polys[0]!, ...polys.slice(1)) : []; }

/** 먼저 차도를 합친 뒤 차도 바깥의 띠만 인도로 사용한다. 교차로 안에는 인도가 생기지 않는다. */
export function buildRoadLayout(campus: CampusData, corridors: TourCorridor[]): RoadLayout {
  const buildings: MultiPolygon = campus.buildings.map(b => [b.footprint]);
  let parking: MultiPolygon = (campus.outdoor_areas ?? []).filter(a => a.kind === 'parking').map(a => [a.footprint]);
  if (campus.buildings.some(b => b.id === 'main')) parking.push([MAIN_PARKING]);
  if (campus.buildings.some(b => b.id === 'music')) parking.push([MUSIC_PARKING]);
  if (campus.buildings.some(b => b.id === 'music')) parking.push([CENTRAL_PARKING_APRON]);
  parking = clipping.difference(parking, [SPINE_RESERVED]);
  const clearance = (p: Point) => Math.min(...campus.buildings.flatMap(b => b.footprint.map((v, i) => segmentDistance(p, v, b.footprint[(i + 1) % b.footprint.length]!))));
  const roads = corridors.filter(c => Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]) > 0.01).map(c => ({ ...c,
    width: c.kind !== 'road' ? !c.structure && (inFieldWalk(...c.a, 0.05) && inFieldWalk(...c.b, 0.05) || onFountainWalk(c.a, c.b)) ? FIELD_WALK_WIDTH : c.kind === 'stairs' || c.structure ? 3.2 : 2.6 : onCampusSpine(c.a, c.b) ? CAMPUS_SPINE.roadWidth : Math.max(3, Math.min(c.a[1] < -140 ? 9 : 7, clearance(c.a) * 2 - 1, clearance(c.b) * 2 - 1)),
  }));
  // 높이가 있는 보행 데크와 계단은 전용 지오메트리로 그린다.
  const surface = merge(roads.filter(c => c.kind !== 'stairs' && !c.structure).map(c => capsule(c.a, c.b, c.width / 2)));
  const vehicleSurface = clipping.union(merge(roads.filter(c => c.kind === 'road').map(c => capsule(c.a,c.b,c.width/2))),parking);
  let asphalt = clipping.difference(clipping.union(surface, parking), buildings);
  const expansion = (amount: number) => merge(roads.filter(c => c.kind === 'road').map(c => capsule(c.a, c.b, c.width / 2 + amount)));
  let sidewalks = clipping.difference(expansion(1.8), asphalt, buildings);
  let curbs = clipping.difference(expansion(0.18), asphalt, buildings);
  let tactile = clipping.difference(expansion(0.95), expansion(0.7), asphalt, buildings);
  // 진입로의 가까운 주차장 접근선에서 생기던 여러 겹의 보도를 하나의 띠로 정리한다.
  // 마지막 교차로는 기존 연결 도로를 유지한다.
  const gate = gateRoadPoints().map(([x, z]): Point => [x, z]);
  const gateStrips = (radius: number) => merge(gate.slice(1).map((b, i) => capsule(gate[i]!, b, radius)));
  const tail = gate.at(-1)!, before = gate.at(-2)!, length = Math.hypot(tail[0] - before[0], tail[1] - before[1]);
  const trim: Point = [tail[0] - (tail[0] - before[0]) / length * 8, tail[1] - (tail[1] - before[1]) / length * 8];
  const mask = merge(gate.slice(1).map((b, i) => capsule(gate[i]!, i === gate.length - 2 ? trim : b, 8.8)));
  const carriageway = gateStrips(GATE_ROAD_WIDTH / 2);
  const replace = (surface: MultiPolygon, replacement: MultiPolygon) => clipping.difference(clipping.union(clipping.difference(surface, mask), clipping.intersection(replacement, mask)), buildings);
  asphalt = replace(asphalt, carriageway);
  sidewalks = replace(sidewalks, clipping.difference(gateStrips(GATE_ROAD_WIDTH / 2 + 1.8), carriageway));
  curbs = replace(curbs, clipping.difference(gateStrips(GATE_ROAD_WIDTH / 2 + 0.18), carriageway));
  tactile = replace(tactile, clipping.difference(gateStrips(GATE_ROAD_WIDTH / 2 + 0.95), gateStrips(GATE_ROAD_WIDTH / 2 + 0.7)));
  // 다른 진입 도로와 만나는 곳에는 보도가 차도를 가로지르지 않게 한다.
  sidewalks = clipping.difference(sidewalks, asphalt); curbs = clipping.difference(curbs, asphalt); tactile = clipping.difference(tactile, asphalt);
  if (campus.buildings.some(b => b.id === 'main')) {
    const voids = [MAIN_FRONT_PLAZA, MAIN_STAIR_SITE, MAIN_LOWER_CUT, ...MAIN_STAIR_PLANTERS].map(r=>[r]);
    const street = clipping.difference([MAIN_STREET], buildings, ...voids);
    asphalt = clipping.difference(clipping.union(asphalt, street), ...voids);
    // 주차장과 외벽 사이에 고립된 인도 블록을 남기지 않는다.
    sidewalks = clipping.difference(sidewalks, [MAIN_STREET]);
    curbs = clipping.difference(curbs, [MAIN_STREET]); tactile = clipping.difference(tactile, [MAIN_STREET]);
    const entrances = MAIN_ROAD_OPENINGS.map(p=>[p]);
    sidewalks = clipping.difference(sidewalks, entrances); curbs = clipping.difference(curbs, entrances); tactile = clipping.difference(tactile, entrances);
  }
  // 음악관 앞 지도 네모 전체: 인도 띠와 그 안쪽 주차장을 명확히 나눈다.
  const musicWalk = clipping.difference([MUSIC_SITE], [MUSIC_PARKING], buildings);
  asphalt = clipping.difference(asphalt, musicWalk);
  sidewalks = clipping.union(sidewalks, musicWalk);
  curbs = clipping.difference(curbs, [MUSIC_SITE]); tactile = clipping.difference(tactile, [MUSIC_SITE]);
  // GEMI→영비관은 작은 OSM 간선별 원형 보도를 합치지 않고 직선 띠 한 쌍으로 만든다.
  const start = spineDistanceAtZ(-30), end = SPINE_LENGTH - 2;
  const spineMask = [spineStrip(start, end, -12, 12)];
  const strip = (left: number, right: number): MultiPolygon => [[spineStrip(start, end, left, right)]];
  const spineAsphalt = strip(-3.5, 3.5);
  const openings: MultiPolygon = SPINE_DRIVEWAY_OPENINGS.map(r => [r]);
  const spineWalk = clipping.difference(clipping.union(strip(-5.3, -3.5), strip(3.5, 5.3)), openings);
  const replaceSpine = (old: MultiPolygon, next: MultiPolygon) => clipping.difference(clipping.union(clipping.difference(old, spineMask), next), buildings);
  // 주차장 쪽에만 진입 개구부를 내며 맞은편 보도와 길의 폭은 그대로 유지한다.
  asphalt = replaceSpine(asphalt, clipping.union(spineAsphalt, clipping.intersection(parking, spineMask), clipping.intersection(openings, spineMask)));
  sidewalks = replaceSpine(sidewalks, spineWalk);
  curbs = replaceSpine(curbs, clipping.difference(clipping.union(strip(-3.68, -3.5), strip(3.5, 3.68)), openings));
  tactile = replaceSpine(tactile, clipping.difference(clipping.union(strip(-4.45, -4.2), strip(4.2, 4.45)), openings));
  // 직선 보도에서 주차장 쪽으로 갈라지던 짧은 보도는 낮은 아스팔트 진입면으로 바꾼다.
  asphalt = clipping.union(asphalt, clipping.intersection(clipping.difference(musicWalk, [SPINE_RESERVED]), spineMask));
  // 주차장 안쪽 이동선은 도색만 한다. 고립된 인도·연석 조각을 생성하지 않는다.
  sidewalks = clipping.difference(sidewalks, parking, asphalt);
  curbs = clipping.difference(curbs, parking, asphalt); tactile = clipping.difference(tactile, parking, asphalt);
  parking = clipping.intersection(parking, asphalt);
  const lines: Polygon[] = [];
  const central = campus.outdoor_areas?.find(a => a.id === 'parking_834838406');
  const centralParking = central ? clipping.intersection(parking, [central.footprint]) : [];
  for (const [ring] of parking) {
    if (central && clipping.intersection([ring!], centralParking).length) continue;
    if (clipping.intersection([ring!], [MUSIC_PARKING]).length) continue;
    const edge = ring!.map((p, i) => ({ a: p, b: ring![(i + 1) % ring!.length]! })).sort((a, b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) - Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]))[0]!;
    const length = Math.hypot(edge.b[0] - edge.a[0], edge.b[1] - edge.a[1]), ux = (edge.b[0] - edge.a[0]) / length, uz = (edge.b[1] - edge.a[1]) / length;
    const point = (u: number, v: number): Point => [rounded(edge.a[0] + ux * u - uz * v), rounded(edge.a[1] + uz * u + ux * v)];
    const uv = ring!.map(p => [(p[0] - edge.a[0]) * ux + (p[1] - edge.a[1]) * uz, -(p[0] - edge.a[0]) * uz + (p[1] - edge.a[1]) * ux]);
    const minU = Math.min(...uv.map(p => p[0]!)), maxU = Math.max(...uv.map(p => p[0]!)), minV = Math.min(...uv.map(p => p[1]!)), maxV = Math.max(...uv.map(p => p[1]!));
    const stripe = (u: number, v: number, w: number, h: number) => lines.push([ [point(u, v), point(u + w, v), point(u + w, v + h), point(u, v + h)] ]);
    for (let v = minV + 1; v + 4.8 < maxV - 0.5; v += 11) for (let u = minU + 1; u + 2.6 < maxU - 0.5; u += 2.6) {
      stripe(u, v, 0.1, 4.8); stripe(u, v, 2.6, 0.1); stripe(u + 2.5, v, 0.1, 4.8);
    }
  }
  const otherLines = lines.length ? clipping.difference(clipping.intersection(merge(lines), parking), surface, buildings) : [];
  const centralLines: Polygon[] = [];
  if (centralParking.length) {
    const stripe = (u: number, v: number, w: number, h: number) => centralLines.push([[spinePoint(u, v), spinePoint(u + w, v), spinePoint(u + w, v + h), spinePoint(u, v + h)]]);
    for (let u = spineDistanceAtZ(40.5); u + 2.6 < spineDistanceAtZ(144); u += 2.6) for (let v = 6.6; v < 65; v += 11.2) {
      if (SPINE_DRIVEWAY_Z.some(z => { const entry = spineDistanceAtZ(z); return u < entry + SPINE_DRIVEWAY_WIDTH / 2 + 0.8 && u + 2.6 > entry - SPINE_DRIVEWAY_WIDTH / 2 - 0.8; })) continue;
      const bay = [spineStrip(u, u + 2.6, v, v + 4.8)];
      // 경계에 걸친 칸을 억지로 잘라 긴 선·짧은 선이 섞이지 않게 한다.
      if (clipping.difference(bay, centralParking).length || clipping.intersection(bay, buildings).length) continue;
      stripe(u, v, 0.1, 4.8); stripe(u, v + 4.7, 2.6, 0.1); stripe(u + 2.5, v, 0.1, 4.8);
    }
  }
  // 건물 쪽은 잔디/수목 대신 외벽까지 이어지는 보도. 주차장 진입부와 차도는 비운다.
  const ramps=SPINE_PARKING_RAMPS.map(r=>[r]);
  asphalt=clipping.union(asphalt,ramps);
  const fields = (campus.outdoor_areas ?? []).filter(a => a.kind === 'field').map(a => [a.footprint]);
  const frontage = clipping.difference([BUILDING_FRONTAGE], buildings, asphalt, parking, openings, fields);
  sidewalks = clipping.union(sidewalks, frontage);
  let parkingLines = clipping.union(otherLines, merge(centralLines));
  // 작은 주차장이 중앙 주차장과 합쳐져도 음악관 앞 도색을 따로 생성한다.
  const musicLines: Polygon[] = [];
  const [ma, mb] = MUSIC_PARKING, ml = Math.hypot(mb![0] - ma![0], mb![1] - ma![1]);
  const mx = (mb![0] - ma![0]) / ml, mz = (mb![1] - ma![1]) / ml;
  const musicPoint = (u: number, v: number): Point => [ma![0] + mx * u - mz * v, ma![1] + mz * u + mx * v];
  const musicBox = (u: number, v: number, w: number, h: number): Polygon => [[musicPoint(u,v), musicPoint(u+w,v), musicPoint(u+w,v+h), musicPoint(u,v+h)]];
  const musicParking = clipping.intersection(parking, [MUSIC_PARKING]);
  for (const v of [1.5, 21]) for (let u = 1.3; u + 2.6 < ml - 1; u += 2.6) {
    const bay = musicBox(u, v, 2.6, 4.8);
    if (clipping.difference(bay, musicParking).length || clipping.intersection(bay, buildings).length) continue;
    musicLines.push(musicBox(u,v,.1,4.8), musicBox(u+2.5,v,.1,4.8), musicBox(u,v === 1.5 ? v : v+4.7,2.6,.1));
  }
  parkingLines = clipping.union(parkingLines, merge(musicLines));
  const fountainLink = FOUNTAIN_FIELD_LINK.slice(1).map((b, i) => capsule(FOUNTAIN_FIELD_LINK[i]!, b, 1.2));
  let walkways = clipping.difference(clipping.union(merge(fountainLink), merge(roads.filter(c => c.kind === 'walk' && !c.structure && (c.width === FIELD_WALK_WIDTH || onFountainWalk(c.a, c.b))).map(c => capsule(c.a, c.b, c.width / 2)))), buildings, vehicleSurface);
  asphalt = clipping.difference(asphalt, walkways);
  sidewalks = clipping.difference(sidewalks, walkways, asphalt,ramps);
  curbs = clipping.difference(curbs, walkways,ramps); tactile = clipping.difference(tactile, walkways,ramps);
  // 정문 외벽이 실제로 있는 구간의 보도만 남기고, 벽 이후의 조각은 도로로 바꾼다.
  const wallWalks=gateWallSections().map(w=>{
    const point=(p:typeof w.a,offset:number):Point=>[p[0]-w.nx*w.side*offset,p[2]-w.nz*w.side*offset];
    return [point(w.a,.5),point(w.b,.5),point(w.b,2.3),point(w.a,2.3)];
  });
  const afterGate=clipping.difference([MAIN_ROAD_FORECOURT],wallWalks.map(r=>[r]));
  const removedWalk=clipping.intersection(clipping.union(sidewalks,curbs,tactile,walkways),clipping.union(afterGate,[VISION_GROUND_APRON],[MUSIC_TO_VISION_ASPHALT]));
  asphalt=clipping.difference(clipping.union(asphalt,removedWalk),buildings);
  sidewalks=clipping.difference(sidewalks,removedWalk,asphalt);
  curbs=clipping.difference(curbs,removedWalk,asphalt);tactile=clipping.difference(tactile,removedWalk,asphalt);
  walkways=clipping.difference(walkways,removedWalk,asphalt);
  parkingLines=clipping.difference(clipping.intersection(parkingLines,asphalt),sidewalks,walkways);
  return { asphalt, sidewalks, curbs, tactile, parkingLines, walkways, corridors: roads, flatPads: pavementPads(campus), parking };
}

export function inSurface(p: Point, surface: MultiPolygon): boolean {
  return surface.some(([outer, ...holes]) => inside(p, outer!) && !holes.some(hole => inside(p, hole)));
}

/** 교내나 통행 면을 차지한 미분류 배경 건물은 투어에 표시하지 않는다. */
export function tourContext(campus: CampusData, layout: RoadLayout): ContextBuilding[] {
  return campus.context.filter(b => {
    if (b.footprint.some(p => inside(p, campus.boundary))) return false;
    return !clipping.intersection([b.footprint], layout.asphalt).length && !clipping.intersection([b.footprint], layout.sidewalks).length && !clipping.intersection([b.footprint], layout.walkways).length;
  });
}

/** 잔디와 모든 포장면이 같은 경계를 공유한다. */
export function groundSurfaceMask(layout: RoadLayout): MultiPolygon {
  return clipping.union(layout.asphalt, layout.sidewalks, layout.walkways, layout.curbs);
}
