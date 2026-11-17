import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import clipping from 'polygon-clipping';

const server = await createServer({ cacheDir: '.cache/vite-tests', mode: 'static', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
const previousDocument = globalThis.document;
const previousWindow = globalThis.window;
globalThis.document = { body: { style: {} } };
globalThis.window = globalThis;
try {
  const read = async name => JSON.parse(await readFile(new URL(`../public/data/${name}`, import.meta.url)));
  const campus = await read('campus.json'), graph = await read('paths.json');
  const { buildTourNetwork, clearSegment, inside, segmentDistance, tourPath, planTourMove, TOUR_STEP_METERS } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { buildRoadLayout, tourContext, inSurface } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const { treeGeometry } = await server.ssrLoadModule('/src/scene/tour/Trees.tsx');
  const { makeScenery } = await server.ssrLoadModule('/src/scene/tour/scenery.ts');
  const { VISION_TERRACE_PATH, RODEM_ACCESS_PATH, VISION_PASSAGE_CUT, TERRACE_HEIGHT, inVisionTerrace } = await server.ssrLoadModule('/src/features/tour/visionTerrace.ts');
  const { makeTerraceParts, terraceGeometry } = await server.ssrLoadModule('/src/scene/tour/VisionTerrace.tsx');
  const { PARKING_LEVEL, MIDDLE_LEVEL, UPPER_CAMPUS_LEVEL, SLOPE_GAIN, buildingElevation } = await server.ssrLoadModule('/src/features/tour/elevationLevels.ts');
  const { tourElevation, SLOPE_PROFILES } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { tourCollisionOutlines, SCIENCE_APPROACH, tourPlaceGoal, tourPlaceLookAt } = await server.ssrLoadModule('/src/features/tour/buildingAccess.ts');
  const { MAIN_ENTRANCE_PATH, MAIN_ENTRY_RISE, MAIN_ENTRY_FLOOR, MAIN_ENTRY_BASE, mainEntryPoint, mainEntryLocal } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { MUSIC_PARKING } = await server.ssrLoadModule('/src/features/tour/musicForecourt.ts');
  const { MAIN_PARKING } = await server.ssrLoadModule('/src/features/tour/mainBuildingAccess.ts');
  const { buildExteriorSpec } = await server.ssrLoadModule('/src/scene/tour/exteriorSpec.ts');
  const { gateWallSections, inGateApproach, gateRoadPoints, GATE_ROAD_WIDTH } = await server.ssrLoadModule('/src/features/tour/gateWalls.ts');
  const { roadGeometries } = await server.ssrLoadModule('/src/scene/tour/TourRoads.tsx');
  const { campusTerrain } = await server.ssrLoadModule('/src/scene/tour/terrainGeometry.ts');
  const { useCampusStore } = await server.ssrLoadModule('/src/store/useCampusStore.ts');
  const { useTourStore } = await server.ssrLoadModule('/src/store/useTourStore.ts');
  const { CampusTour } = await server.ssrLoadModule('/src/ui/CampusTour.tsx');
  const square = [[0, 0], [5, 0], [5, 5], [0, 5]];
  assert(!clearSegment([-2, 2], [7, 2], square), '건물 관통 금지');
  assert(!clearSegment([2, 2], [7, 2], square), '실내 출발 금지');
  assert(!clearSegment([-2, -1], [7, -1], square), '벽면 여유 거리 확보');
  assert(clearSegment([-2, -2], [7, -2], square));
  const network = buildTourNetwork(campus, graph);
  const start = network.nodes[network.start];
  const gate = campus.outdoor_areas.find(a => a.id === 'gate_main');
  assert(Math.hypot(start.x - gate.center[0], start.z - gate.center[1]) < 0.1, '정문 출발');
  assert(Object.keys(network.nodes).length > 150);
  assert(Object.values(network.nodes).some(n => n.z > 260), '남쪽 캠퍼스까지 연결');
  const reached = new Set([network.start]), queue = [network.start];
  for (let i = 0; i < queue.length; i++) for (const next of network.nodes[queue[i]].neighbors) if (!reached.has(next)) { reached.add(next); queue.push(next); }
  assert.equal(reached.size, Object.keys(network.nodes).length, '단절된 이동 지점 제외');
  for (const [aId, bId] of network.segments) {
    const a = network.nodes[aId], b = network.nodes[bId];
    assert(a.neighbors.includes(bId) && b.neighbors.includes(aId));
    assert(Math.hypot(b.x - a.x, b.z - a.z) <= 10.01, '내부 보간 구간은 10m 이내');
    assert(campus.buildings.every(bldg => tourCollisionOutlines(bldg, a.y, b.y).every(outline => clearSegment([a.x, a.z], [b.x, b.z], outline))), '이동 구간의 건물 충돌 검사');
    const p = [(a.x + b.x) / 2, (a.z + b.z) / 2];
    assert(inside(p, campus.boundary) || campus.boundary.some((v, i) => segmentDistance(p, v, campus.boundary[(i + 1) % campus.boundary.length]) < 8));
  }
  for (const place of [...campus.buildings, ...campus.outdoor_areas]) {
    const path = tourPath(network, network.start, place.center);
    assert.equal(path[0], network.start);
    assert(path.every((id, i) => i === 0 || network.nodes[path[i - 1]].neighbors.includes(id)));
    const end = network.nodes[path.at(-1)];
    assert(Math.hypot(end.x - place.center[0], end.z - place.center[1]) < 45, `${place.name} 외관 접근`);
  }
  assert.throws(() => buildTourNetwork(campus, { nodes: [], edges: [] }));
  assert(network.nodes.tour_south_0 && network.nodes.tour_south_1 && network.nodes.tour_south_2, '지도에서 확인한 동쪽 도로와 이공관 앞 연결길');
  assert(tourPath(network, 'n133', [64, 213]).length <= 3, '동쪽 연결도로로 직접 이동');
  for (const p of VISION_TERRACE_PATH) {
    assert(network.nodes[p.id], `${p.id}: 영상비전센터 계단·쉼터 경로 연결`);
    assert.equal(network.nodes[p.id].y, p.y);
  }
  const stairsUp = planTourMove(network, 'tour_vision_stairs_bottom', 'tour_vision_landing_start');
  assert.equal(stairsUp.path.at(-1), 'tour_vision_stairs_top', '계단 상단에서 정지');
  assert.equal(network.nodes[stairsUp.path.at(-1)].y, MIDDLE_LEVEL, '첫 계단은 중간 평지까지 올라감');
  assert(stairsUp.path.every((id, i, ids) => !i || network.nodes[id].y >= network.nodes[ids[i - 1]].y), '계단 오르기 높이 연속성');
  const stairsDown = planTourMove(network, 'tour_vision_stairs_top', 'tour_vision_landing_end');
  assert.equal(stairsDown.path.at(-1), 'tour_vision_stairs_bottom', '계단 아래로 돌아올 수 있음');
  const restPath = tourPath(network, 'tour_vision_stairs_top', [6.8, 183]);
  assert.equal(restPath.at(-1), 'tour_vision_rest');
  const middle = planTourMove(network, 'tour_vision_stairs_top', 'tour_vision_side');
  assert.equal(middle.path.at(-1), 'tour_vision_side', '2층 외부 통로의 로뎀관 갈림길에서 정지');
  assert(middle.path.every(id => network.nodes[id].y === MIDDLE_LEVEL));
  const secondStairs = planTourMove(network, 'tour_vision_rear', 'tour_vision_rest_entry');
  assert.equal(secondStairs.path.at(-1), 'tour_vision_rest_entry');
  assert.equal(network.nodes.tour_vision_rest_entry.y, UPPER_CAMPUS_LEVEL, '두 번째 계단을 올라야 쉼터 높이에 도착');
  assert(tourPath(network, 'tour_vision_rest', [14.59, 207.48]).includes('n99'), '쉼터에서 이공관 앞길로 연결');
  const plateauRoute = tourPath(network, 'tour_vision_rest', [14.59, 207.48]);
  assert(plateauRoute.every(id => Math.abs(network.nodes[id].y - UPPER_CAMPUS_LEVEL) < 0.001), '쉼터→이공관은 내려가지 않는 평지');
  const elevation = tourElevation(campus);
  assert.equal(buildingElevation('vision_center'), PARKING_LEVEL);
  for (const building of campus.buildings) for (const [x, z] of building.footprint) {
    const { u, v } = mainEntryLocal(x, z), y = elevation(x, z);
    if (building.id === 'main') {
      assert(y >= MAIN_ENTRY_FLOOR - 3.66 && y <= MAIN_ENTRY_FLOOR + 3.61, '본관 지면은 노출된 1층과 3층 진입 높이 안에 있음');
    } else assert(Math.abs(y - buildingElevation(building.id)) < 0.001, `${building.name}: 건물 기초와 지면 높이 일치`);
  }
  for (const id of ['science', 'student_union', 'theology', 'vision']) assert.equal(buildingElevation(id), UPPER_CAMPUS_LEVEL);
  for (const profile of SLOPE_PROFILES) {
    for (const [x, z, y] of profile.points) assert(Math.abs(elevation(x, z) - y) < 0.01, `${profile.id}: 빨간 표시 구간 도로 고도`);
    for (let i = 1; i < profile.points.length; i++) {
      const a = profile.points[i - 1], b = profile.points[i];
      const grade = (b[2] - a[2]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      assert(grade >= 0 && grade < 0.11, `${profile.id}: 내리막 없는 평지 또는 일정한 오르막 경사`);
    }
  }
  assert.equal(buildingElevation('rodem'), MIDDLE_LEVEL, '로뎀관과 영비관 2층 통로가 같은 고도');
  assert(Math.abs(MIDDLE_LEVEL - PARKING_LEVEL - campus.buildings.find(b => b.id === 'vision_center').floor_height) < 0.001);
  const rodemRoute = tourPath(network, 'tour_vision_side', [RODEM_ACCESS_PATH.at(-1).x, RODEM_ACCESS_PATH.at(-1).z]);
  assert(rodemRoute.includes('tour_rodem_turn') && rodemRoute.includes('tour_rodem_north'), '로뎀관까지 동→북→동으로 꺾어 걸어야 함');
  assert(rodemRoute.every(id => Math.abs(network.nodes[id].y - MIDDLE_LEVEL) < 0.001));
  const vision = campus.buildings.find(b => b.id === 'vision_center'), visionSpec = buildExteriorSpec(vision);
  const insidePassage = Object.values(network.nodes).filter(p => Math.abs(p.x - 9.7) < 0.01 && (p.y ?? 0) <= MIDDLE_LEVEL && inside([p.x, p.z], vision.footprint));
  assert(insidePassage.length >= 3, '계단·2층 통로가 건물 저층 안으로 들어감');
  for (const point of insidePassage) {
    assert(inside([point.x, point.z], VISION_PASSAGE_CUT));
    for (const level of [0, 1]) assert(visionSpec.levels.filter(f => f.level === level).every(f => !inside([point.x, point.z], f.outline)), '열린 외부 계단·통로에 건물 벽이 없음');
  }
  assert(visionSpec.levels.some(f => f.level === 2 && inside([8.4, 156.5], f.outline)), '통로 위에는 건물의 3층 바닥이 이어짐');
  assert.equal(tourCollisionOutlines(vision, UPPER_CAMPUS_LEVEL, UPPER_CAMPUS_LEVEL).length, 1, '확인되지 않은 상층 건물 관통은 계속 금지');
  const science = campus.buildings.find(b => b.id === 'science'), scienceSpec = buildExteriorSpec(science);
  assert(scienceSpec.entrance.edge.nz > 0.9, '이공관 입구는 로뎀관 반대인 신학관 방향');
  assert.deepEqual(tourPlaceGoal(science), SCIENCE_APPROACH);
  assert.equal(tourPath(network, network.start, SCIENCE_APPROACH).at(-1), 'tour_science_1', '이공관 안내·바로 이동은 남향 안뜰로 도착');
  const mainSpec = buildExteriorSpec(campus.buildings.find(b => b.id === 'main'));
  assert.equal(mainSpec.entrance.stairsHeight, MAIN_ENTRY_RISE);
  assert(mainSpec.front.nx < -0.8 && mainSpec.front.nz > 0.4, '본관 입구는 정문에서 올라오는 저층동 정면');
  assert.equal(mainSpec.entrance.rise, 0, '본관 유리문은 계단 위 건물 바닥에 맞춤');
  for (const p of MAIN_ENTRANCE_PATH) {
    assert(network.nodes[p.id], '본관 두 계단과 입구까지 실제 이동 가능');
    assert.equal(network.nodes[p.id].y, p.y);
    assert(elevation(p.x, p.z) < p.y + 0.01, '본관 계단은 지형 밖으로 드러남');
  }
  assert(!network.nodes.n48, '기존 잔디 언덕으로 이어지던 막힌 접근선 제거');
  assert.equal(tourPath(network, network.start, tourPlaceGoal(campus.buildings.find(b => b.id === 'main'))).at(-1), 'tour_main_approach');
  const mainMove = planTourMove(network, 'tour_main_stairs_bottom', 'tour_main_landing_start');
  assert.equal(mainMove.path.at(-1), 'tour_main_stairs_top');
  assert(Math.abs(MAIN_ENTRY_FLOOR - MAIN_ENTRY_BASE - MAIN_ENTRY_RISE) < 0.001);
  const walls = gateWallSections();
  assert(walls.some(w => w.side === -1) && walls.some(w => w.side === 1), '정문 오르막 양옆 교명 옹벽');
  assert.equal(walls.filter(w => w.side === 1).length, 1, '본관 쪽 벽은 첫 보도 구간 끝까지만 남김');
  assert.equal(walls.filter(w => w.side === -1).length, 2, '반대편 벽은 유지');
  const near = VISION_TERRACE_PATH[0], foot = network.nodes.tour_vision_stairs_bottom, top = network.nodes.tour_vision_stairs_top;
  assert(Math.abs(near.x - foot.x) < 0.001 && Math.abs(foot.x - top.x) < 0.001 && near.z < foot.z && foot.z < top.z, '주차장에서 보이는 왼쪽 정면의 외부 계단');
  const straightThrough = VISION_TERRACE_PATH.slice(1, VISION_TERRACE_PATH.findIndex(p => p.id === 'tour_vision_rear') + 1);
  assert(straightThrough.every(p => Math.abs(p.x - foot.x) < 0.001), '계단을 오른 방향 그대로 2층을 직선 통과하며 꺾지 않음');
  assert(top.z < Math.min(...vision.footprint.map(p => p[1])) + 1, '첫 계단 상단은 건물 앞쪽 테라스에 붙음');
  assert(walls.every(w => w.b[1] > w.a[1]), '옹벽은 정문 진입로를 따라 함께 올라감');
  assert(SLOPE_GAIN > 1 && SLOPE_GAIN < 1.5, '전체 도로 경사를 적당히 높임');
  const terrace = makeTerraceParts();
  assert.equal(terrace.wood.length, 32, '쓰레기통을 둘러싼 네 벤치의 좌판·등받이(사용자 배치도)');
  assert(terrace.metal.length > 60, '계단·쉼터 난간');
  for (const parts of Object.values(terrace)) for (const p of parts) assert([...p.p, ...p.s, p.ry ?? 0, p.rz ?? 0].every(Number.isFinite));
  const decks = terraceGeometry(), deckMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const deckMeshes = decks.map(g => { const m = new THREE.Mesh(g.top, deckMaterial); m.updateMatrixWorld(); return m; });
  for (const [a, b] of [[VISION_TERRACE_PATH[1], VISION_TERRACE_PATH[2]], [VISION_TERRACE_PATH[3], VISION_TERRACE_PATH[4]]]) for (const t of [0.25, 0.5, 0.75]) {
    const ray = new THREE.Raycaster(new THREE.Vector3(a.x + (b.x - a.x) * t, MIDDLE_LEVEL + 2, a.z + (b.z - a.z) * t), new THREE.Vector3(0, -1, 0));
    assert(ray.intersectObjects(deckMeshes).every(hit => hit.point.y < a.y + (b.y - a.y) * t + 0.2), '평지 끝의 둥근 덮개가 계단 입구·디딤면을 막지 않음');
  }
  decks.forEach(g => { g.base.dispose(); g.top.dispose(); }); deckMaterial.dispose();
  const layout = buildRoadLayout(campus, network.corridors);
  assert(layout.asphalt.length > 0, '고도가 있는 도로도 지면에 표시');
  const roadMeshes = roadGeometries(layout, elevation);
  for (const [index, mesh] of roadMeshes.entries()) {
    const p = mesh.getAttribute('position');
    for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 500))) {
      const above = p.getY(i) - elevation(p.getX(i), p.getZ(i));
      assert(above > -0.01 && above < (index === 1 ? 0.13 : 0.01), `도로·보도·주차선이 같은 경사 지면에 놓임 ${index} (${p.getX(i)},${p.getZ(i)}) above=${above}`);
    }
    mesh.dispose();
  }
  const groundMesh = campusTerrain(campus);
  assert(groundMesh.attributes.position.array.every(Number.isFinite));
  // 실제 삼각형 사이를 보간한 잔디가 수평 참·계단 보행면 위로 솟지 않는지 확인한다.
  const gp = groundMesh.attributes.position, gi = groundMesh.index;
  const triangles = [];
  for (let i = 0; i < gi.count; i += 3) {
    const vertices = [0, 1, 2].map(j => { const id = gi.getX(i + j); return [gp.getX(id), gp.getY(id), gp.getZ(id)]; });
    const cx = vertices.reduce((n, p) => n + p[0], 0) / 3, cz = vertices.reduce((n, p) => n + p[2], 0) / 3;
    if (inVisionTerrace(cx, cz, 3)) triangles.push(vertices);
  }
  for (let i = 2; i < VISION_TERRACE_PATH.length; i++) {
    const a = VISION_TERRACE_PATH[i - 1], b = VISION_TERRACE_PATH[i], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    for (const t of [0.1, 0.5, 0.9]) for (const side of [-1.35, 0, 1.35]) {
      const x = a.x + dx * t + dz / len * side, z = a.z + dz * t - dx / len * side;
      const target = a.y + (b.y - a.y) * t;
      let found = false;
      for (const [p, q, r] of triangles) {
        const det = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
        const u = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / det;
        const v = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / det;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        assert(u * p[1] + v * q[1] + (1 - u - v) * r[1] < target + 0.04, `${a.id}→${b.id}: 잔디가 계단·평지를 뚫지 않음`);
        found = true; break;
      }
      assert(found || campus.buildings.some(building => clipping.intersection([building.footprint], [[[x-.001,z-.001],[x+.001,z-.001],[x+.001,z+.001],[x-.001,z+.001]]]).length), '건물 바깥 계단 주변 지형 삼각형 존재; 건물 안 지형은 제거됨');
    }
  }
  groundMesh.dispose();
  assert.equal(clipping.intersection(layout.asphalt, layout.sidewalks).length, 0, '차도 안의 겹치거나 교차하는 인도 제거');
  assert.equal(clipping.intersection(layout.asphalt, layout.tactile).length, 0, '점자블록은 차도 양옆에만 배치');
  const parking = [...campus.outdoor_areas.filter(a => a.kind === 'parking').map(a => [a.footprint]), [MAIN_PARKING], [MUSIC_PARKING]];
  assert.equal(clipping.intersection(layout.sidewalks, layout.parking).length, 0, '직선 보도 폭을 확보한 주차장 안에는 교차 인도가 없음');
  assert(layout.parkingLines.length > 0, '주차장 흰 주차선');
  assert.equal(clipping.difference(layout.parkingLines, parking).length, 0, '주차선은 주차장 내부에만 배치');
  const context = tourContext(campus, layout);
  assert(!context.includes(campus.context[3]), '운동장 옆 통행로를 가리는 구조물 제외');
  assert(context.every(b => !clipping.intersection([b.footprint], layout.asphalt).length));
  const gatePoints = gateRoadPoints();
  for (let i = 1; i < gatePoints.length; i++) {
    const a = gatePoints[i - 1], b = gatePoints[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    for (const t of [0.2, 0.4, 0.6]) for (const side of [-1, 1]) {
      const offset = (GATE_ROAD_WIDTH / 2 + 0.9) * side;
      const x = a[0] + dx * t + dz / len * offset, z = a[1] + dz * t - dx / len * offset;
      assert(layout.sidewalks.some(([outline]) => inside([x, z], outline)), '정문 양옆의 한 줄 보도가 연속됨');
      assert(Math.abs(elevation(x, z) - (a[2] + (b[2] - a[2]) * t)) < 0.01, '정문 보도의 횡방향 울렁임 제거');
    }
  }
  const scenery = makeScenery(campus, layout);
  assert(scenery.trunks.filter(p => p.s[1] === 6).every(p => !inGateApproach(p.p[0], p.p[2], 2)), '정문 오르막 가로등 제거');
  for (const [kind, parts] of Object.entries(scenery)) if (kind !== 'trees') for (const p of parts) assert([...p.p, ...p.s, p.ry ?? 0].every(Number.isFinite));
  assert(scenery.trees.length > 100);
  for (const tree of scenery.trees) assert(campus.buildings.every(b => !inside([tree.x, tree.z], b.footprint)), '건물 안에 나무 배치 금지');
  assert(scenery.trees.every(t => !inVisionTerrace(t.x, t.z, t.shrub ? 1 : 2.4)), '계단과 벤치 쉼터 동선을 수목이 막지 않음');
  assert(scenery.stone.every(p => !inSurface([p.p[0], p.p[2]], layout.parking) || p.s[1] < 0.3), '주차장 차량/직육면체 블록 제거');
  for (const species of ['pine', 'broadleaf', 'flowering', 'ginkgo']) {
    const tree = treeGeometry(species, 0);
    assert(tree.foliage.attributes.position.count > 2000 && tree.bark.attributes.position.count > 300);
    assert([...tree.foliage.attributes.position.array].every(Number.isFinite));
    tree.bark.dispose(); tree.foliage.dispose();
  }
  const straight = { start: 'a', nodes: { a: { id: 'a', x: 0, z: 0, neighbors: ['b'] }, b: { id: 'b', x: 10, z: 0, neighbors: ['a', 'c'] }, c: { id: 'c', x: 20, z: 0, neighbors: ['b', 'd'] }, d: { id: 'd', x: 40, z: 0, neighbors: ['c'] } }, segments: [['a', 'b'], ['b', 'c'], ['c', 'd']], kinds: {}, corridors: [] };
  const snapshot = JSON.stringify(straight), step = planTourMove(straight, 'a', 'b');
  assert.equal(TOUR_STEP_METERS, 30); assert.equal(step.distance, 30);
  assert.equal(step.network.nodes[step.path.at(-1)].x, 30, '정확한 기본 30m 이동');
  assert.equal(JSON.stringify(straight), snapshot, '기존 그래프를 변형하지 않음');
  assert.equal(step.network.corridors, straight.corridors, '이동 중 도로와 조경을 다시 생성하지 않음');
  const slope = structuredClone(straight);
  slope.nodes.a.y = 0; slope.nodes.b.y = 3; slope.nodes.c.y = 6; slope.nodes.d.y = 12;
  const slopeMove = planTourMove(slope, 'a', 'b');
  const slopeEnd = slopeMove.network.nodes[slopeMove.path.at(-1)];
  assert(Math.abs(Math.hypot(slopeEnd.x, slopeEnd.y) - 30) < 0.001, '높이가 있는 길도 실제 30m와 카메라 높이 보간 유지');
  const curved = structuredClone(straight); curved.nodes.c = { ...curved.nodes.c, x: 10, z: 10 }; curved.nodes.d = { ...curved.nodes.d, x: 10, z: 25 };
  const turn = planTourMove(curved, 'a', 'b');
  assert.deepEqual(turn.path.slice(0, 3), ['a', 'b', 'c']);
  assert.equal(turn.network.nodes[turn.path.at(-1)].z, 20, '모서리를 관통하지 않고 굽은 길을 따라 30m 이동');
  const fork = structuredClone(straight);
  fork.nodes.side = { id: 'side', x: 10, z: 15, neighbors: ['b'] };
  fork.nodes.b.neighbors.push('side'); fork.segments.push(['b', 'side']);
  for (const guide of [undefined, ['a', 'b', 'c', 'd']]) {
    const arrival = planTourMove(fork, 'a', 'b', 30, guide);
    assert.deepEqual(arrival.path, ['a', 'b'], '직진 또는 안내 경로가 있어도 갈림길에서 정지');
    assert.equal(arrival.distance, 10);
    assert.equal(planTourMove(arrival.network, 'b', 'side').path.at(-1), 'side', '갈림길에서 옆길 선택 가능');
  }
  // 정문에서 30m 두 번 이동한 뒤 나타나는 실제 운동장 방향 갈림길.
  let approach = network, from = network.start, previous = null;
  for (let i = 0; i < 3; i++) {
    const node = approach.nodes[from];
    const forward = node.neighbors.filter(id => id !== previous).sort((a, b) => approach.nodes[b].z - approach.nodes[a].z)[0];
    const arrival = planTourMove(approach, from, forward);
    assert(arrival.path.slice(1, -1).every(id => approach.nodes[id]?.neighbors.length <= 2), '중간 갈림길을 건너뛰지 않음');
    previous = arrival.path.at(-2); from = arrival.path.at(-1); approach = arrival.network;
  }
  assert.equal(from, 'n24', '운동장 방향 분기가 있는 교차로에서 정지');
  const fieldRoute = tourPath(approach, from, campus.outdoor_areas.find(a => a.kind === 'field').center);
  assert(fieldRoute.length > 1);
  assert(approach.nodes[from].neighbors.includes(fieldRoute[1]), '교차로에서 운동장 방향 경로 선택 가능');
  assert.notEqual(fieldRoute[1], previous, '운동장으로 가기 위해 정문으로 되돌아가지 않음');

  useCampusStore.setState({ campus, graph, status: 'ready', selectedId: 'main' });
  assert(useTourStore.getState().start());
  assert(Math.cos(useTourStore.getState().yaw) < 0, '정문에서 교내 방향을 바라보고 시작');
  assert.equal(useCampusStore.getState().selectedId, null);
  assert.equal(useCampusStore.getState().planner.open, false);
  let s = useTourStore.getState();
  s.move('not-a-node'); assert.equal(useTourStore.getState().targetId, null);
  const far = Object.values(network.nodes).find(n => n.id !== s.nodeId && !network.nodes[s.nodeId].neighbors.includes(n.id));
  s.move(far.id); assert.equal(useTourStore.getState().targetId, null, '연결되지 않은 곳으로 순간이동 금지');
  const next = network.nodes[s.nodeId].neighbors[0];
  const preview = planTourMove(network, s.nodeId, next);
  s.move(next); s.move(network.nodes[s.nodeId].neighbors[1]);
  const destinationId = preview.path.at(-1);
  assert.equal(useTourStore.getState().targetId, destinationId, '이동 도중 중복 클릭 차단');
  assert(useTourStore.getState().start());
  assert.equal(useTourStore.getState().targetId, destinationId, '늦은 투어 시작 요청이 현재 이동을 초기화하지 않음');
  const render = () => { Object.assign(useCampusStore.getInitialState(), useCampusStore.getState()); Object.assign(useTourStore.getInitialState(), useTourStore.getState()); return renderToStaticMarkup(createElement(CampusTour)); };
  assert.match(render(), /disabled=""/);
  s.arrive(); s = useTourStore.getState();
  assert.equal(s.nodeId, destinationId); assert.equal(s.targetId, null); assert.equal(s.visited.length, preview.path.length);
  assert.match(render(), /정문부터 캠퍼스 한 바퀴/);
  assert.match(render(), /주요 장소 둘러보기/);
  s.move(s.network.nodes[s.nodeId].neighbors[0]); s.stop(); s.arrive();
  assert.equal(useTourStore.getState().nodeId, destinationId, '종료 후 늦게 도착한 프레임 무시');
  s.move(s.network.nodes[s.nodeId].neighbors[0]); assert.equal(useTourStore.getState().targetId, null);
  assert(useTourStore.getState().start()); assert.equal(useTourStore.getState().visited.length, 1, '재시작 초기화');
  for (const building of campus.buildings) {
    useTourStore.getState().jumpToBuilding(building.id);
    const state = useTourStore.getState(), point = state.network.nodes[state.nodeId];
    assert(Math.hypot(point.x - building.center[0], point.z - building.center[1]) < 45);
    assert.equal(state.targetId, null); assert.equal(state.destination, building.id);
    assert.equal(Math.round(state.yaw * 1e5), Math.round(Math.atan2(-(tourPlaceLookAt(building)[0] - point.x), -(tourPlaceLookAt(building)[1] - point.z)) * 1e5), '바로 이동 후 건물을 바라봄');
    assert.match(render(), new RegExp(building.name));
  }
  s = useTourStore.getState(); s.move(s.network.nodes[s.nodeId].neighbors[0]);
  const nonce = useTourStore.getState().positionNonce;
  useTourStore.getState().jumpToBuilding('science'); const jumpedId = useTourStore.getState().nodeId;
  assert.equal(jumpedId, 'tour_science_1', '이공관 바로 이동은 신학관 쪽 안뜰');
  assert.equal(useTourStore.getState().positionNonce, nonce + 1);
  useTourStore.getState().arrive(); assert.equal(useTourStore.getState().nodeId, jumpedId, '바로 이동 시 이전 카메라 이동 취소');
  useTourStore.getState().jumpToBuilding('invalid'); assert.equal(useTourStore.getState().nodeId, jumpedId);
  assert.match(render(), /건물 바로 이동/);
  useTourStore.setState({ nodeId: 'tour_vision_stairs_bottom', targetId: null, travel: [], destination: null });
  assert.match(render(), /계단 올라가기/);
  useTourStore.setState({ nodeId: 'tour_vision_stairs_top' });
  assert.match(render(), /계단 내려가기/);
  assert.match(render(), new RegExp(`data-y="${MIDDLE_LEVEL + 0.2}`));
  useTourStore.getState().stop();
  console.log(`거리뷰 검증 통과: ${reached.size}개 지점, ${network.segments.length}개 안전 구간, 모든 건물·야외시설 접근, 이동 상태·UI·조경 검증`);
} finally { globalThis.document = previousDocument; globalThis.window = previousWindow; await server.close(); }
