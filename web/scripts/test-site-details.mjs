import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import clipping from 'polygon-clipping';
import * as THREE from 'three';
const server = await createServer({ root: new URL('../', import.meta.url).pathname, cacheDir: '.cache/site-details-tests', configFile: false, server: { middlewareMode: true, hmr: false, ws: false } });
const area = polygons => polygons.reduce((s, poly) => s + poly.reduce((s, r, i) => s + (i ? -1 : 1) * Math.abs(r.reduce((s, a, j) => { const b = r[(j + 1) % r.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2), 0), 0);
try {
  const campus = JSON.parse(await readFile(new URL('../public/data/campus.json', import.meta.url)));
  const graph = JSON.parse(await readFile(new URL('../public/data/paths.json', import.meta.url)));
  const { buildTourNetwork } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { buildRoadLayout, inSurface, groundSurfaceMask } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const { makeMainGroundsParts, mainRetainingWalls, mainPlazaDecks, mainAccessDecks } = await server.ssrLoadModule('/src/scene/tour/MainGrounds.tsx');
  const { MAIN_FIRST_FLOOR, MAIN_LOWER_PATH, MAIN_STREET, MAIN_STAIR_PLANTERS, MAIN_LOWER_CUT, MAIN_STAIR_SITE, MAIN_FRONT_PLAZA, mainSitePoint } = await server.ssrLoadModule('/src/features/tour/mainBuildingAccess.ts');
  const { mainEntryLocal, MAIN_ENTRY_BASE } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { makeScenery } = await server.ssrLoadModule('/src/scene/tour/scenery.ts');
  const { FOUNTAIN_CENTER, FOUNTAIN_SIGN, inFountainSite, fountainPlazaLevel } = await server.ssrLoadModule('/src/features/tour/fountainSite.ts');
  const { spinePoint, spineLocal, spineDistanceAtZ, SPINE_DRIVEWAY_Z, SPINE_DRIVEWAY_WIDTH, SPINE_NODES } = await server.ssrLoadModule('/src/features/tour/campusSpine.ts');
  const { VISION_GROUND_APRON } = await server.ssrLoadModule('/src/features/tour/pavedAreas.ts');
  const network = buildTourNetwork(campus, graph), layout = buildRoadLayout(campus, network.corridors), elevation = tourElevation(campus);
  assert.equal(mainEntryLocal(MAIN_LOWER_PATH[0].x, MAIN_LOWER_PATH[0].z).v.toFixed(1), '16.2');
  const parts = makeMainGroundsParts(), box = new THREE.BoxGeometry(), matrix = new THREE.Matrix4(), dummy = new THREE.Object3D();
  const project = g => {
    const p = g.attributes.position, index = g.index;
    let result = [];
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const r = [0, 1, 2].map(j => { const k = index ? index.getX(i + j) : i + j; return [p.getX(k), p.getZ(k)]; });
      if (area([[r]]) > 1e-9) result.push([r]);
    }
    return result.length ? clipping.union(result) : [];
  };
  let structureSamples = 0;
  for (const part of parts.metal) {
    const { u, v } = mainEntryLocal(part.p[0], part.p[2]);
    if (u < 16 || u > 22 || v < 0 || v > 24) continue;
    dummy.position.set(...part.p); dummy.scale.set(...part.s); dummy.rotation.set(0, part.ry ?? 0, part.rz ?? 0); dummy.updateMatrix(); matrix.copy(dummy.matrix);
    const g = box.clone().applyMatrix4(matrix);
    assert(area(clipping.intersection(project(g), layout.asphalt)) < 0.0001, '본관 1층 난간이 차도 안으로 돌출하지 않음'); g.dispose(); structureSamples++;
  }
  const walls = mainRetainingWalls(layout.asphalt);
  for (const g of walls) assert(area(clipping.intersection(project(g), layout.asphalt)) < 0.0001, '1층 옹벽 끝이 차도 밖에 있음');
  const decks = [...mainAccessDecks(layout.asphalt), ...mainPlazaDecks()];
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const facadeSoil = decks.filter(g => g.userData.surface === 'grass').map(g => { const m = new THREE.Mesh(g, material); m.updateMatrixWorld(); return m; });
  for (const g of decks.filter(g=>g.userData.surface==='grass')) assert(area(clipping.difference(project(g), MAIN_STAIR_PLANTERS.map(r=>[r])))<.001,'본관 앞 잔디는 실제 계단 양옆 식재 섬 안에만 있음');
  assert.equal(parts.shrubs.length,22);
  for(const p of parts.shrubs) assert(inSurface([p.x,p.z],MAIN_STAIR_PLANTERS.map(r=>[r])),'관목은 식재 섬 안에만 있음');
  for(const u of [-19,-12,12,25,32,38]) for(const v of [.1,1,4,7,10,14]) {
    const [x,z]=mainSitePoint(u,v);
    if(inSurface([x,z],MAIN_STAIR_PLANTERS.map(r=>[r]))) continue;
    assert(!new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0),0,20).intersectObjects(facadeSoil).length,'본관 앞 일반 대지에 잔디 면 없음');
  }
  // 본관 교차로→대학원관: 로드뷰처럼 차도가 한 번에 고르게 오르고(혹 없음), 분수 삼각지에 잔디 둔덕 벽이 없다.
  const { APPROACH_START_Z, APPROACH_TOP_Z } = await server.ssrLoadModule('/src/features/tour/graduateApproach.ts');
  const spine = await server.ssrLoadModule('/src/features/tour/campusSpine.ts');
  let approachPrev = elevation(...spine.spinePoint(spine.spineDistanceAtZ(APPROACH_START_Z))), approachSamples = 0;
  for (let z = APPROACH_START_Z + 0.5; z <= APPROACH_TOP_Z + 0.001; z += 0.5) {
    const y = elevation(...spine.spinePoint(spine.spineDistanceAtZ(z)));
    assert(y >= approachPrev - 0.001 && y - approachPrev <= 0.11 * 0.5 + 0.001, `본관 교차로→대학원관 차도는 11% 이하의 고른 오르막 (z=${z})`);
    approachPrev = y; approachSamples++;
  }
  for (let x = -72; x <= -38; x += 2) for (let z = -134; z <= -108; z += 2) {
    const slope = Math.hypot(elevation(x + 0.5, z) - elevation(x - 0.5, z), elevation(x, z + 0.5) - elevation(x, z - 0.5));
    assert(slope < 0.3, `분수 삼각지에 급한 둔덕 없음 (${x},${z}) ${slope.toFixed(2)}`); approachSamples++;
  }
  // 이공관 앞 사각 정원: 언덕 없는 평지, 모서리 ㄱ자 수풀 4개 + 가운데 수풀, 벤치 12개, 수풀 사이로 출입문까지 걷는 통로.
  const garden = await server.ssrLoadModule('/src/features/tour/scienceGarden.ts');
  const { inside } = await server.ssrLoadModule('/src/features/tour/network.ts');
  for (let x = 27; x <= 57.5; x += 1.5) for (let z = 178; z <= 202; z += 1.5) {
    if (campus.buildings.some(b => inside([x, z], b.footprint))) continue;
    assert(Math.abs(elevation(x, z) - garden.SCIENCE_GARDEN_LEVEL) < 0.001, `이공관 앞 정원은 평지 (${x},${z})`);
  }
  assert.equal(garden.GARDEN_HEDGES.length, 9); assert.equal(garden.GARDEN_BENCHES.length, 12);
  const walk = [garden.SCIENCE_GARDEN_ENTRY, ...garden.SCIENCE_GARDEN_WALK, garden.SCIENCE_APPROACH];
  for (let i = 1; i < walk.length; i++) for (let t = 0; t <= 1; t += 0.05) {
    const x = walk[i - 1][0] + (walk[i][0] - walk[i - 1][0]) * t, z = walk[i - 1][1] + (walk[i][1] - walk[i - 1][1]) * t;
    assert(garden.GARDEN_HEDGES.every(h => x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1), `정원 통로가 수풀을 관통하지 않음 (${x.toFixed(1)},${z.toFixed(1)})`);
  }
  // 이공관 서쪽 길(영비관 계단 위): 길·벤치 쉼터·경비실 일대는 둔덕 없는 평지.
  const side = await server.ssrLoadModule('/src/features/tour/visionTerrace.ts');
  for (let x = -6; x <= 14; x += 1) for (let z = 179; z <= 210; z += 1) {
    if (campus.buildings.some(b => inside([x, z], b.footprint))) continue;
    assert(Math.abs(elevation(x, z) - side.TERRACE_HEIGHT) < 0.001, `이공관 서쪽 길 주변은 평지 (${x},${z})`);
  }
  const booth = side.GUARD_BOOTH, path = side.VISION_TERRACE_PATH.slice(-4);
  assert(path.every(p => p.x === side.VISION_TERRACE.x) && booth.x1 < side.VISION_TERRACE.x - side.VISION_TERRACE.width / 2, '경비실은 곧은 길의 서쪽');
  for (const r of [0, 2, 3.6, 6.5]) for (let i = 0; i < 32; i++) {
    const angle = i / 32 * Math.PI * 2, x = FOUNTAIN_CENTER[0] + Math.cos(angle) * r, z = FOUNTAIN_CENTER[1] + Math.sin(angle) * r;
    // 본관 교차로→대학원관 오르막 위의 광장: 평면이지만 오르막 방향으로 완만하게(경사의 80%) 기운다.
    assert(Math.abs(elevation(x, z) - fountainPlazaLevel(x, z)) < 0.001, '둥근 분수대와 명패 주변은 하나의 평면');
  }
  const mainDoor = mainSitePoint(0, 0), vx = mainDoor[0] - FOUNTAIN_CENTER[0], vz = mainDoor[1] - FOUNTAIN_CENTER[1];
  assert((vx * FOUNTAIN_SIGN.nx + vz * FOUNTAIN_SIGN.nz) / Math.hypot(vx, vz) > 0.9999, '교명 표지판 앞면은 본관을 향함');
  const scenery = makeScenery(campus, layout);
  assert(!scenery.trees.some(t => inFountainSite(t.x, t.z, 7)), '분수대 구역 전체에 나무와 관목이 없음');
  let spineSamples = 0;
  for (let z = -22; z < 137; z += 1.5) {
    const u = spineDistanceAtZ(z);
    for (const side of [-4.1, -4.9, 4.1, 4.9]) {
      const opening = side > 0 && SPINE_DRIVEWAY_Z.some(z => Math.abs(u - spineDistanceAtZ(z)) < SPINE_DRIVEWAY_WIDTH / 2 + 0.01);
      assert.equal(inSurface(spinePoint(u, side), layout.sidewalks), !opening && !inSurface(spinePoint(u,side),[[VISION_GROUND_APRON]]), '직선 보도는 차량 진입부와 영비관 앞에서 열림'); spineSamples++;
    }
    assert(inSurface(spinePoint(u, 0), layout.asphalt));
    assert(!inSurface(spinePoint(u, -5.6), layout.sidewalks), '수목을 남기는 맞은편 보도는 일정한 폭 유지');
  }
  for (const id of SPINE_NODES) assert(Math.abs(spineLocal(network.nodes[id].x, network.nodes[id].z).side) < 0.0001, '실제 이동 지점도 직선 위에 있음');
  for (const surface of [layout.sidewalks, layout.curbs, layout.tactile]) assert(area(clipping.intersection(surface, layout.parking)) < 0.0001, '주차장 내부에 인도 블록·연석·점자블록을 남기지 않음');
  const central = campus.outdoor_areas.find(a => a.id === 'parking_834838406');
  const lines = clipping.intersection(layout.parkingLines, [central.footprint]);
  let lineVertices = 0;
  const near = (x, values) => values.some(v => Math.abs(x - v) < 0.001);
  for (const poly of lines) for (const ring of poly) for (const p of ring) {
    const { along, side } = spineLocal(...p);
    const u = ((along - spineDistanceAtZ(40.5)) % 2.6 + 2.6) % 2.6, v = ((side - 6.6) % 11.2 + 11.2) % 11.2;
    assert(near(u, [0, 0.1, 2.5, 2.6]) && near(v, [0, 4.7, 4.8, 11.2]), '모든 주차선이 같은 칸 폭·깊이·열 간격에 맞음'); lineVertices++;
  }
  assert(lineVertices > 100);
  // 옆에서 보이는 빈 공간을 잡는다. 상판 아래 2m에서 난간 바깥으로 수평 레이를 쏜다.
  const supports = decks.map(g => { const m = new THREE.Mesh(g, material); m.updateMatrixWorld(); return m; });
  let supportChecks = 0;
  for (const u of [50, 55, 62, 69, 74]) for (const side of [-1, 1]) {
    const [x, z] = mainSitePoint(u, -19 + side * 5);
    const [tx, tz] = mainSitePoint(u, -19);
    const direction = new THREE.Vector3(tx - x, 0, tz - z).normalize();
    assert(new THREE.Raycaster(new THREE.Vector3(x, 3, z), direction, 0, 5).intersectObjects(supports).length, '3층 접근로 아래 옹벽이 지면까지 닫혀 있음'); supportChecks++;
  }
  for (const v of [-37, -33, -29]) {
    const [x,z] = mainSitePoint(56,v), [tx,tz] = mainSitePoint(62,v);
    assert(new THREE.Raycaster(new THREE.Vector3(x,2,z),new THREE.Vector3(tx-x,0,tz-z).normalize(),0,5).intersectObjects(supports).length, '3층 공원 아래를 빈 공간으로 남기지 않음'); supportChecks++;
  }
  for (const v of [4,9]) for (const side of [-1,1]) {
    const [x,z]=mainSitePoint(side*9,v),[tx,tz]=mainSitePoint(0,v);
    assert(new THREE.Raycaster(new THREE.Vector3(x,.3,z),new THREE.Vector3(tx-x,0,tz-z).normalize(),0,4).intersectObjects(supports).length,'2층 정문 계단과 앞마당 아래도 기초까지 닫힘'); supportChecks++;
  }
  const { campusTerrain } = await server.ssrLoadModule('/src/scene/tour/terrainGeometry.ts');
  const { fountainCourtGeometry } = await server.ssrLoadModule('/src/scene/tour/FountainCourt.tsx');
  const { FOUNTAIN_CLEARING } = await server.ssrLoadModule('/src/features/tour/fountainSite.ts');
  const terrain = campusTerrain(campus, groundSurfaceMask(layout)), ground = new THREE.Mesh(terrain, material); ground.updateMatrixWorld();
  const courtGeometry = fountainCourtGeometry(campus, groundSurfaceMask(layout)), court = new THREE.Mesh(courtGeometry,material);court.updateMatrixWorld();
  let clearingSamples = 0;
  for (let x = -74; x < -56; x += 2) for (let z = -123; z < -105; z += 2) {
    if (!inSurface([x,z], [[FOUNTAIN_CLEARING]]) || inSurface([x,z], groundSurfaceMask(layout))) continue;
    const ray = new THREE.Raycaster(new THREE.Vector3(x,20,z),new THREE.Vector3(0,-1,0),0,30);
    assert(!ray.intersectObject(ground).length, '분수 앞뒤 전체 구역에서 잔디 지형 제거');
    assert(ray.intersectObject(court).length, '잔디를 없앤 구역에 포장면 누락 없음'); clearingSamples++;
  }
  assert(clearingSamples > 15);
  assert(area([[FOUNTAIN_CLEARING]]) < 215, '분수 포장은 넓은 공터 대신 작은 원형 공간');
  // 1층 외벽 앞과 지형의 접점에 높은 잔디 삼각형이 남지 않아야 한다.
  for (let u = -19; u <= 41; u += 1) for (const v of [0.1, 1, 4, 7.9]) {
    const [x,z]=mainSitePoint(u,v), ray=new THREE.Raycaster(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0),0,20);
    const hit=ray.intersectObject(ground)[0];
    assert(!hit || hit.point.y <= MAIN_FIRST_FLOOR, '본관 1층 외벽 앞에 접혀 내려오는 잔디 면 없음');
  }
  const { roadGeometries } = await server.ssrLoadModule('/src/scene/tour/TourRoads.tsx');
  const pavementGeometries = roadGeometries(layout,elevation), pavementMeshes=pavementGeometries.slice(0,2).map(g=>{const m=new THREE.Mesh(g,material);m.updateMatrixWorld();return m;});
  const { GRADUATE_ENTRY_SIDEWALK, GRADUATE_ENTRY_BEND, GRADUATE_ENTRY_DOOR, GRADUATE_FORECOURT, onBuildingSide } = await server.ssrLoadModule('/src/features/tour/buildingFrontage.ts');
  const { SPINE_PARKING_RAMPS } = await server.ssrLoadModule('/src/features/tour/campusSpine.ts');
  assert(!scenery.trees.some(t => onBuildingSide(t.x,t.z) && !inSurface([t.x,t.z], [GRADUATE_FORECOURT])), '대학원관 앞 정원을 제외한 건물 쪽 보도에는 수목 없음');
  const graduateWalk = [GRADUATE_ENTRY_SIDEWALK, GRADUATE_ENTRY_BEND, GRADUATE_ENTRY_DOOR];
  for (const [i, b] of graduateWalk.slice(1).entries()) {
    const a = graduateWalk[i];
    for (let t = 0; t < 1; t += 0.05) {
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      assert(inSurface(p, layout.sidewalks) && !inSurface(p, layout.asphalt), '대학원관 입구 포장은 도로변 보도에서 외벽 입구까지 이어짐');
    }
  }
  assert([[-35, -103], [-49, -106], [-61, -110]].every(p => !inSurface(p, groundSurfaceMask(layout))), '대학원관 진입로 양옆은 잔디');
  const graduateFrontWalk = [[-62, -97.8], [-56, -97.8], [-51, -97.8], [-68, -96], [-70, -94]];
  for (let z = -100; z <= 4; z += 2) {
    for (const side of [4.9, 5.35, 6.1]) graduateFrontWalk.push(spinePoint(spineDistanceAtZ(z), side));
  }
  for (const [x, z] of graduateFrontWalk) {
    assert(inSurface([x, z], layout.sidewalks) && !inSurface([x, z], layout.asphalt), '대학원관 모서리와 도로변 보도 사이에 잔디 틈이 없음');
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 0, 4);
    const hit = ray.intersectObject(pavementMeshes[1])[0];
    assert(hit && Math.abs(hit.point.y - 5.2) < 0.002 && !ray.intersectObject(ground).length, '대학원관 연속 보도 실제 메시와 잔디 분리');
  }
  let frontageSamples=0;
  for(let z=-103;z<34;z+=3) for(const side of [5.6,6.5,8.5,10.5,15,22]) {
    const [x,pz]=spinePoint(spineDistanceAtZ(z),side);
    if(inSurface([x,pz],[GRADUATE_FORECOURT]))continue;
    if(campus.buildings.some(b=>inSurface([x,pz],[[b.footprint]])) || inSurface([x,pz],layout.asphalt) || inSurface([x,pz],layout.parking) || inSurface([x,pz],layout.walkways))continue;
    assert(inSurface([x,pz],layout.sidewalks), '건물 쪽 잔디 띠를 외벽/주차장까지 포장');
    const ray=new THREE.Raycaster(new THREE.Vector3(x,20,pz),new THREE.Vector3(0,-1,0),0,30);
    const hit=ray.intersectObject(pavementMeshes[1])[0];
    assert(hit&&Math.abs(hit.point.y-5.2)<.001,'건물 1층과 실제 보도는 같은 평면');
    assert(!ray.intersectObject(ground).length,'보도 사이로 잔디 삼각형이 남지 않음');frontageSamples++;
  }
  const { FIELD_WALK } = await server.ssrLoadModule('/src/features/tour/fieldWalk.ts');
  const walkMesh=new THREE.Mesh(pavementGeometries[5],material);walkMesh.updateMatrixWorld();
  let fieldSamples=0;
  for(let i=1;i<FIELD_WALK.length;i++)for(let t=.1;t<1;t+=.1){
    const a=FIELD_WALK[i-1],b=FIELD_WALK[i],x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
    const hit=new THREE.Raycaster(new THREE.Vector3(x,15,z),new THREE.Vector3(0,-1,0),0,20).intersectObject(walkMesh)[0];
    assert(hit&&Math.abs(hit.point.y-5.2)<.015,'운동장 옆 사잇길 실제 보행면은 평지');fieldSamples++;
  }
  const { FOUNTAIN_WALK,FOUNTAIN_RADIUS }=await server.ssrLoadModule('/src/features/tour/fountainSite.ts');
  for(const p of FOUNTAIN_WALK.slice(1,8))assert(Math.hypot(p[0]-FOUNTAIN_CENTER[0],p[1]-FOUNTAIN_CENTER[1])-0.85>FOUNTAIN_RADIUS+.2,'분수 우회 보행로가 수조를 통과하지 않음');
  const { fountainCornerEdge } = await server.ssrLoadModule('/src/features/tour/fountainSite.ts');
  for (const [offset, surface] of [[-0.16, layout.asphalt], [0.09, layout.curbs], [0.82, layout.tactile], [1.48, layout.sidewalks]]) {
    assert(fountainCornerEdge(offset).slice(1, -1).every(p => inSurface(p, surface)), '분수대 앞 차도·연석·점자블록·보도가 모서리를 따라 연속');
  }
  const island = layout.sidewalks.find(poly => inSurface([-78.8, -147.2], [poly]));
  assert(island, '갈림길 삼각 보도섬 유지');
  const [a, b, c] = island[0];
  for (const [u, v] of [[0.35, 0.2], [0.8, 0.05], [0.12, 0.65]]) {
    const x = a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v;
    const z = a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v;
    const y = elevation(...a) + (elevation(...b) - elevation(...a)) * u + (elevation(...c) - elevation(...a)) * v;
    assert(Math.abs(elevation(x, z) - y) < 0.002, '보도섬의 벽돌과 연석은 한 경사면');
  }
  let junctionSamples = 0;
  for (let x = -89.4; x < -70; x += 1) for (let z = -153.3; z < -144.45; z += 0.9) {
    if (!inSurface([x, z], layout.asphalt)) continue;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 9, z), new THREE.Vector3(0, -1, 0), 0, 12);
    const hit = ray.intersectObject(pavementMeshes[0])[0];
    assert(hit && Math.abs(hit.point.y - MAIN_ENTRY_BASE) < 0.002, '분수대 앞 교차로는 틈 없이 같은 높이의 아스팔트');
    junctionSamples++;
  }
  assert(junctionSamples > 150);
  const {gateWallSections,GATE_ROAD_WIDTH}=await server.ssrLoadModule('/src/features/tour/gateWalls.ts');
  for(const w of gateWallSections()){
    const x=(w.a[0]+w.b[0])/2-w.nx*w.side*.52,z=(w.a[2]+w.b[2])/2-w.nz*w.side*.52;
    assert(inSurface([x,z],layout.sidewalks),'정문 보도 바깥 끝이 외벽 바로 앞까지 이어짐');
    assert(!inSurface([x,z],layout.asphalt),'정문 외벽과 차도 구분');
    assert(GATE_ROAD_WIDTH===9);
  }
  console.log(`✓ 건물 쪽 보도/잔디 경계 ${frontageSamples}점 · 운동장 사잇길 평지 ${fieldSamples}점 · 작은 원형 분수/정문 외벽 접점`);
  let parkingChecks=0;
  const flatParking=clipping.union([central.footprint],[(await server.ssrLoadModule('/src/features/tour/campusSpine.ts')).CENTRAL_PARKING_APRON]);
  for(let x=-51.03;x<28;x+=1.5)for(let z=36.17;z<146;z+=1.5){
    if(!inSurface([x,z],flatParking)||campus.buildings.some(b=>inSurface([x,z],[[b.footprint]])))continue;
    assert(inSurface([x,z],layout.asphalt)||inSurface([x,z],layout.sidewalks),'주차장/도로 경계에 빠진 노면 없음');
    const hit=new THREE.Raycaster(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0),0,5).intersectObjects(pavementMeshes)[0];
    assert(hit&&Math.abs(hit.point.y-5.2)<.001,`음악관 옆 주차장 전체 수평 x=${x} z=${z} y=${hit?.point.y}`);parkingChecks++;
  }
  for(const surface of [layout.sidewalks,layout.curbs,layout.tactile,layout.walkways])assert(area(clipping.intersection(surface,[VISION_GROUND_APRON]))<.00001,'영비관 앞 보도/연석/점자블록 제거');
  assert(area(clipping.intersection(layout.asphalt,layout.walkways))<.00001,'분수 진입 도로와 보행 포장 비겹침');
  assert(inSurface(FOUNTAIN_WALK[0],layout.asphalt)&&!inSurface(FOUNTAIN_WALK[0],layout.walkways),'분수 입구의 기존 차도를 보도가 덮지 않음');
  const {terraceGeometry}=await server.ssrLoadModule('/src/scene/tour/VisionTerrace.tsx');
  const visionDecks=terraceGeometry();
  for(const g of visionDecks){const mesh=new THREE.Mesh(g.top,material);mesh.updateMatrixWorld();
    for(const [x,z] of [[-4,116.5],[9.7,123],[9.7,127]])assert(!new THREE.Raycaster(new THREE.Vector3(x,5.4,z),new THREE.Vector3(0,-1,0),0,.3).intersectObject(mesh).length,'영비관 주차장 위에 전용 보도 메시 없음');
    g.top.dispose();g.base.dispose();
  }
  assert(area(clipping.intersection(layout.parkingLines,layout.sidewalks))<.00001,'주차선 위에 보도 상판 없음');
  console.log(`✓ 중앙 주차장/도로 수평 및 누락 ${parkingChecks}점 · 영비관 앞 보도와 분수 진입부 겹침 제거`);
  const streetVoids = [...campus.buildings.map(b=>b.footprint),MAIN_LOWER_CUT,MAIN_STAIR_SITE,...MAIN_STAIR_PLANTERS,MAIN_FRONT_PLAZA].map(r=>[r]);
  let streetSamples=0;
  for(let u=-37.83;u<=41;u+=2) for(let v=-45.83;v<=27;v+=2) {
    const [x,z]=mainSitePoint(u,v);
    if(inSurface([x,z],streetVoids))continue;
    assert(inSurface([x,z],layout.asphalt),`본관 2층 쪽은 조경과 하행 입구를 빼고 외벽까지 아스팔트 u=${u} v=${v} x=${x} z=${z}`);
    const hit=new THREE.Raycaster(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0),0,12).intersectObject(pavementMeshes[0])[0];
    assert(hit&&Math.abs(hit.point.y-MAIN_ENTRY_BASE)<.002,'본관 앞과 주차장 실제 메시가 한 수평면');streetSamples++;
  }
  // 외벽에서 2cm 떨어진 곳까지 노면이 있어야 도로 아래로 건물이 꺼져 보이지 않는다.
  for(const [u,v] of [[-18.12,-20],[-18.12,-30],[-18.12,-40],[-12,.02],[-4,12],[0,12],[12,12],[21.8,.02]]) {
    const [x,z]=mainSitePoint(u,v);if(inSurface([x,z],streetVoids))continue;
    assert(inSurface([x,z],layout.asphalt),'주차장/본관 외벽 사이에 낮은 빈 구역 없음');
    assert(Math.abs(elevation(x,z)-MAIN_ENTRY_BASE)<.001,'건물 외벽의 도로 접점은 주차장과 같은 높이');
  }
  assert(streetSamples>300);
  console.log(`✓ 본관 수평 아스팔트 ${streetSamples}점 · 외벽 접점과 1층 하행부 분리`);
  let previousHeight = -Infinity, slopeChecks=0;
  for(let z=36;z<=135;z+=1) for(const side of [0,-4.8,4.8]) {
    const [x,pz]=spinePoint(spineDistanceAtZ(z),side), ray=new THREE.Raycaster(new THREE.Vector3(x,15,pz),new THREE.Vector3(0,-1,0),0,20);
    const isAsphalt=inSurface([x,pz],layout.asphalt);
    const hit=ray.intersectObject(pavementMeshes[isAsphalt?0:1])[0];
    if(side>0&&SPINE_DRIVEWAY_Z.some(entry=>Math.abs(z-entry)<4)) continue;
    assert(hit,'음악관→영비관 실제 도로와 양쪽 보도가 이어짐');
    const height=hit.point.y;
    assert(Math.abs(height-elevation(...spinePoint(spineDistanceAtZ(z),0)))<.035,`실제 도로와 보도의 횡단 높이 일치 z=${z} side=${side} height=${height} expected=${elevation(...spinePoint(spineDistanceAtZ(z),0))}`);
    if(side===0){assert(height>=previousHeight-.005,'음악관→영비관 도로는 평지');previousHeight=height;} slopeChecks++;
  }
  assert(Math.abs(elevation(...spinePoint(spineDistanceAtZ(35),0)) - 5.2) < .001);
  assert(Math.abs(elevation(...spinePoint(spineDistanceAtZ(100),0)) - 5.2) < .001);
  [...pavementGeometries,terrain,courtGeometry].forEach(g=>g.dispose());
  console.log(`✓ 측면 옹벽 ${supportChecks}곳 · 분수 구역 잔디 제거/포장 ${clearingSamples}점 · 실제 오르막 횡단면 ${slopeChecks}점`);
  [...walls, ...decks, box].forEach(g => g.dispose()); material.dispose();
  console.log(`✓ 1층 난간 ${structureSamples}개/옹벽 비겹침 · 1층 외벽 개방 · 제한된 조경 · 평지 분수대/교명 방향 · 직선 보도 ${spineSamples}점 · 균일한 주차선 ${lineVertices}개 정점`);
} finally { await server.close(); }
