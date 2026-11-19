import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';
import clipping from 'polygon-clipping';

const server = await createServer({ root: new URL('../', import.meta.url).pathname, cacheDir: '.cache/main-site-tests', mode: 'static', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const campus = JSON.parse(await readFile(new URL('../public/data/campus.json', import.meta.url)));
  const graph = JSON.parse(await readFile(new URL('../public/data/paths.json', import.meta.url)));
  const { buildTourNetwork, tourPath, planTourMove } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { MAIN_ACCESS_NODES, MAIN_SITE_PATHS, MAIN_WALK_SURFACES, MAIN_UPPER_PATH, MAIN_GARDEN_LEVEL, MAIN_FIRST_FLOOR, MAIN_THIRD_FLOOR, MAIN_PARKING, MAIN_STAIR_PLANTERS, MAIN_LOWER_CUT, mainSitePoint, isMainAccessStair } = await server.ssrLoadModule('/src/features/tour/mainBuildingAccess.ts');
  const { MAIN_ENTRY_FLOOR, MAIN_ENTRY_BASE, mainEntryLocal } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { MUSIC_PARKING, MUSIC_SITE, MUSIC_ACCESS_PATH } = await server.ssrLoadModule('/src/features/tour/musicForecourt.ts');
  const { FIELD_WALK, tourFieldFootprint } = await server.ssrLoadModule('/src/features/tour/fieldWalk.ts');
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { buildExteriorSpec } = await server.ssrLoadModule('/src/scene/tour/exteriorSpec.ts');
  const { mainAccessDecks, mainPlazaDecks, makeMainGroundsParts } = await server.ssrLoadModule('/src/scene/tour/MainGrounds.tsx');
  const { campusTerrain } = await server.ssrLoadModule('/src/scene/tour/terrainGeometry.ts');
  const { buildRoadLayout, groundSurfaceMask, inSurface } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const network = buildTourNetwork(campus, graph), elevation = tourElevation(campus);
  const layout = buildRoadLayout(campus, network.corridors);
  assert(network.corridors.filter(c => c.kind === 'road').every(c => !c.structure), '입구 연결 지점을 분할해도 실제 차도는 전용 보행 데크가 되지 않음');
  for (const p of MAIN_ACCESS_NODES) {
    assert(network.nodes[p.id], `${p.id}: 실제 연결된 이동 지점`);
    assert.equal(network.nodes[p.id].y, p.y);
    assert(tourPath(network, network.start, [p.x, p.z]).includes(p.id));
  }
  assert.equal(MAIN_ENTRY_FLOOR - MAIN_FIRST_FLOOR, 3.6, '정문은 2층, 선큰 입구는 한 층 아래');
  assert(Math.abs(MAIN_THIRD_FLOOR - MAIN_ENTRY_FLOOR - 3.6) < 1e-9);
  for (const path of MAIN_SITE_PATHS.slice(1)) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (!isMainAccessStair(a.id, b.id)) continue;
    const movement = planTourMove(network, a.id, b.id);
    assert.equal(movement.path.at(-1), b.id, '새 계단 끝에서 정지');
    assert.equal(movement.network.nodes[b.id].y, b.y);
  }
  const main = campus.buildings.find(b => b.id === 'main'), spec = buildExteriorSpec(main);
  assert.equal(Math.min(...spec.levels.map(f => f.level)), -1, '2층 정문 아래 1층 외벽 존재');
  assert(spec.glass.some(p => p.p[1] < -1), '낮은 1층 출입문');
  assert(spec.glass.some(p => { const { u, v } = mainEntryLocal(p.p[0], p.p[2]); return u < -20 && v < -5; }), '파란 유리 계단실은 주차장 측면에 배치');
  assert(!spec.glass.some(p => p.s[1] > 15 && Math.abs(mainEntryLocal(p.p[0], p.p[2]).v) < 1), '정면에 긴 파란 판이 없음');
  const streetWindows=spec.glass.filter(p=>p.p[1]<0 && p.p[1]>=MAIN_ENTRY_BASE-MAIN_ENTRY_FLOOR && !inSurface([p.p[0],p.p[2]],[[MAIN_LOWER_CUT]]));
  assert(streetWindows.length>12,'주차장 쪽 최하단 창 검사 대상');
  for(const p of streetWindows) assert(p.p[1]-p.s[1]/2+MAIN_ENTRY_FLOOR>MAIN_ENTRY_BASE+.01,'주차장 쪽 최하단 창이 도로 아래로 잘리지 않음');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const box = new THREE.BoxGeometry(), parts = [...spec.stone.map(p => ({ ...p, p: [p.p[0], p.p[1] + MAIN_ENTRY_FLOOR, p.p[2]] })), ...makeMainGroundsParts().stone];
  const steps = new THREE.InstancedMesh(box, material, parts.length), dummy = new THREE.Object3D();
  parts.forEach((p, i) => { dummy.position.set(...p.p); dummy.scale.set(...p.s); dummy.rotation.set(0, p.ry ?? 0, p.rz ?? 0); dummy.updateMatrix(); steps.setMatrixAt(i, dummy.matrix); });
  steps.computeBoundingSphere(); steps.updateMatrixWorld();
  const decks = [...mainAccessDecks(), ...mainPlazaDecks()], terrain = campusTerrain(campus, groundSurfaceMask(layout));
  const ground = new THREE.Mesh(terrain, material); ground.updateMatrixWorld();
  const surfaces = [steps, ...decks.map(g => { const m = new THREE.Mesh(g, material); m.updateMatrixWorld(); return m; })];
  let checked = 0;
  for (const path of MAIN_WALK_SURFACES) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    for (const t of [0.15, 0.5, 0.85]) for (const side of [-1.3, 0, 1.3]) {
      const x = a.x + dx * t - dz / len * side, z = a.z + dz * t + dx / len * side, y = a.y + (b.y - a.y) * t;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y + 0.35, z), new THREE.Vector3(0, -1, 0), 0, 1);
      const hit = ray.intersectObjects(surfaces)[0];
      assert(hit && Math.abs(hit.point.y - y) < 0.22, `${a.id}→${b.id}: 포장/계단 디딤면이 끊기지 않음`);
      const soil = new THREE.Raycaster(new THREE.Vector3(x, y + 12, z), new THREE.Vector3(0, -1, 0), 0, 30).intersectObject(ground)[0];
      assert(!soil || soil.point.y < hit.point.y - 0.02, `${a.id}→${b.id}: 실제 지형 삼각형이 보행면을 뚫지 않음`);
      checked++;
    }
  }
  for (const p of MAIN_UPPER_PATH) assert(Math.abs(mainEntryLocal(p.x, p.z).v + 19) < 0.001, '3층 진입로는 입구까지 직선');
  for (let i = 1; i < 3; i++) {
    const a = MAIN_UPPER_PATH[i - 1], b = MAIN_UPPER_PATH[i];
    assert((b.y - a.y) / Math.hypot(b.x - a.x, b.z - a.z) < 0.06, '3층 입구 앞은 경사 6% 미만의 완경사');
  }
  assert.equal(MAIN_SITE_PATHS[3][0].y, MAIN_GARDEN_LEVEL);
  assert(MAIN_SITE_PATHS[3].every(p => p.y === MAIN_GARDEN_LEVEL), '공원은 계단 아래 평지에서 같은 높이로 진입');
  const shrubs = makeMainGroundsParts();
  assert(shrubs.shrubs.length >= 10 && shrubs.shrubs.every(p => p.height <= 1.3), '정문 양옆은 작은 둥근 관목');
  assert(shrubs.trees.every(p => mainEntryLocal(p.x,p.z).v < -23 || inSurface([p.x,p.z],MAIN_STAIR_PLANTERS.map(r=>[r]))), '실제 사진의 계단 옆 두 식재 섬에만 정문 나무를 둠');
  const eye = mainSitePoint(19, 6), door = mainSitePoint(19, 0.2);
  const look = new THREE.Vector3(door[0] - eye[0], 0, door[1] - eye[1]);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(eye[0], MAIN_FIRST_FLOOR + 1.4, eye[1]), look.clone().normalize(), 0, look.length()).intersectObject(ground).length, 0, '1층 입구를 바라보는 눈높이를 잔디가 막지 않음');
  for (const p of MUSIC_ACCESS_PATH) assert(network.nodes[p.id], '음악관 서측 1층 입구까지 연결');
  assert(clipping.intersection(layout.parkingLines, [MUSIC_PARKING]).length > 0, '음악관 앞은 주차선이 있는 주차장');
  assert(!network.nodes.tour_music_corner, '주차장에서 운동장 뒤로 뚫었던 지름길 제거');
  assert(!network.segments.some(([a, b]) => [a, b].includes('n79') && [a, b].includes('n64')), '원본의 잘못된 음악관 북쪽 연결도 제외');
  // GEMI관 앞 막다른 차도 끝 → GEMI관·음악관 사이 틈 → 음악관 앞 주차장은 거리뷰로 이어진다(포장 띠는 새로 그리지 않음).
  const gapRoute = tourPath(network, 'n79', [network.nodes.tour_music_parking.x, network.nodes.tour_music_parking.z]);
  assert(gapRoute.includes('tour_gemi_gap_0') && gapRoute.includes('tour_gemi_gap_1') && gapRoute.length < 12, 'GEMI관–음악관 틈 보행 연결');
  // 3층 입구·진입 경사로 옆 지면은 비탈로 이어진다(입구 옆 5m 잔디 절벽·외벽 쪽 1층 높이 띠 없음).
  for (let u = 42.3; u <= 76; u += 0.5) for (let v = -40; v <= -2; v += 0.5) {
    const [x, z] = mainSitePoint(u, v);
    const slope = Math.hypot(elevation(x + 0.25, z) - elevation(x - 0.25, z), elevation(x, z + 0.25) - elevation(x, z - 0.25)) / 0.5;
    assert(slope < 1, `3층 입구 주변 지면에 단층 없음 (${u},${v}) ${slope.toFixed(2)}`);
  }
  const missingParking = clipping.difference([MUSIC_SITE], clipping.union(layout.asphalt, layout.sidewalks));
  const area = polygons => polygons.reduce((sum, poly) => sum + poly.reduce((sum, r, i) => sum + (i ? -1 : 1) * Math.abs(r.reduce((sum, a, j) => { const b = r[(j + 1) % r.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2), 0), 0);
  assert(area([[MUSIC_PARKING]]) > 700, '음악관 지도 네모 전체 크기로 확장');
  assert(area(missingParking) < 0.01, '지도 네모 안에 잔디 면을 남기지 않음');
  const { roadGeometries } = await server.ssrLoadModule('/src/scene/tour/TourRoads.tsx');
  const roads = roadGeometries(layout, elevation);
  let pavementSamples = 0;
  for (const g of roads.slice(0, 2)) {
    const p = g.getAttribute('position');
    const stride = Math.max(3, Math.floor(p.count / 80 / 3) * 3);
    for (let i = 0; i + 2 < p.count; i += stride) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      if (!inSurface([x, z], layout.asphalt) && !inSurface([x, z], layout.sidewalks)) continue;
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 80, z), new THREE.Vector3(0, -1, 0), 0, 120);
      const soil = ray.intersectObject(ground);
      for (const hit of soil) {
        const ids = [hit.face.a, hit.face.b, hit.face.c], positions = terrain.getAttribute('position');
        const ring = ids.map(id => [positions.getX(id), positions.getZ(id)]);
        // Float32 경계 반올림으로 생기는 수 μm 조각만 허용한다.
        assert(area(clipping.intersection([ring], groundSurfaceMask(layout))) < 0.0001, `실제 차도/인도 삼각형 아래에 겹친 잔디가 없음 (${x}, ${z})`);
      }
      pavementSamples++;
    }
    g.dispose();
  }
  assert(pavementSamples > 40);
  for (const g of roads.slice(2)) g.dispose();
  const clippedDecks = mainAccessDecks(layout.asphalt);
  for (const g of clippedDecks) {
    const p = g.getAttribute('position'), index = g.index;
    for (let i = 0; i < index.count; i += 3) {
      const ring = [0, 1, 2].map(j => [p.getX(index.getX(i + j)), p.getZ(index.getX(i + j))]);
      if (Math.abs((ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0])) < 1e-8) continue;
      const overlap = clipping.intersection([ring], layout.asphalt);
      const area = overlap.reduce((sum, poly) => sum + poly.reduce((sum, r) => sum + Math.abs(r.reduce((sum, a, i) => { const b = r[(i + 1) % r.length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0) / 2), 0), 0);
      assert(area < 0.0001, '진입로 포장면을 차도 위에 겹쳐 그리지 않음');
    }
    g.dispose();
  }

  for (const p of MAIN_SITE_PATHS[0]) assert(inSurface([p.x, p.z], layout.asphalt), '주차장 통로는 연속된 아스팔트');
  const field = campus.outdoor_areas.find(a => a.kind === 'field');
  assert.equal(clipping.intersection(layout.walkways, [tourFieldFootprint(field)]).length, 0, '작은 길이 운동장 펜스/잔디 안으로 들어가지 않음');
  for (let i = 0; i < FIELD_WALK.length; i++) assert(network.nodes[`tour_field_walk_${i}`], `음악관 방향 작은 길의 ${i}번째 지점이 연결됨`);
  const fieldPath = tourPath(network, 'tour_field_walk_0', FIELD_WALK.at(-1));
  for (let i = 0; i < FIELD_WALK.length; i++) assert(fieldPath.includes(`tour_field_walk_${i}`), '운동장 서쪽 길을 따라 직진');
  const parkingPaint = clipping.intersection(layout.parkingLines, [MAIN_PARKING]);
  assert(parkingPaint.length > 0, '추가된 본관 주차장에 주차선 존재');
  for (const g of [...decks, terrain, box]) g.dispose(); material.dispose();
  console.log(`✓ 본관 1·2·3층 연결, 주차장, 측면 유리 계단실, ${checked}개 실제 보행면/지형 교차, 운동장 서쪽 연결길 검증`);
} finally { await server.close(); }
