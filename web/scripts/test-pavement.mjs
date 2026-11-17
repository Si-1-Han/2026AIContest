import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import * as THREE from 'three';

const root = new URL('../../', import.meta.url);
const server = await createServer({ root: new URL('../', import.meta.url).pathname, cacheDir: '.cache/pavement-tests', configFile: false, server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const campus = JSON.parse(await readFile(new URL('web/public/data/campus.json', root)));
  const graph = JSON.parse(await readFile(new URL('web/public/data/paths.json', root)));
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { buildTourNetwork, segmentDistance } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { buildRoadLayout, inSurface } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const { roadGeometries } = await server.ssrLoadModule('/src/scene/tour/TourRoads.tsx');
  const { MAIN_ENTRY_BASE, MAIN_ENTRANCE_PATH } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { MAIN_PARKING, mainSitePoint } = await server.ssrLoadModule('/src/features/tour/mainBuildingAccess.ts');
  const { MUSIC_PARKING } = await server.ssrLoadModule('/src/features/tour/musicForecourt.ts');
  const { MUSIC_FORECOURT_LEVEL } = await server.ssrLoadModule('/src/features/tour/elevationLevels.ts');
  const elevation = tourElevation(campus), network = buildTourNetwork(campus, graph);
  const layout = buildRoadLayout(campus, network.corridors);
  const route = [network.nodes[network.start], ...['n16', 'n24', 'n31', 'n35', 'n33', 'n32', 'n25'].map(id => network.nodes[id]), MAIN_ENTRANCE_PATH[0]];
  let previous = -Infinity, approachSamples = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 4);
    for (let j = 0; j <= count; j++) {
      const t = j / count, y = elevation(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      assert(y >= previous - 0.001, `정문→2층 본관 진입로에 내리막 없음: ${a.id}→${b.id} (${previous}→${y})`);
      previous = y; approachSamples++;
    }
  }
  assert(Math.abs(previous - MAIN_ENTRY_BASE) < 0.001);
  let crossSections = 0;
  for (const r of layout.corridors.filter(c => c.kind === 'road')) {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], len = Math.hypot(dx, dz), count = Math.ceil(len * 4);
    let previous = elevation(...r.a);
    for (let i = 1; i <= count; i++) {
      const t = i / count, x = r.a[0] + dx * t, z = r.a[1] + dz * t, y = elevation(x, z);
      assert(Math.abs(y - previous) < 0.18 * len / count + 0.001, `도로 높이에 접힘·단차 없음 (${x},${z}) ${previous}→${y} segment ${r.a}→${r.b}`);
      previous = y;
      if (t < 0.15 || t > 0.85 || layout.corridors.some(o => o !== r && segmentDistance([x, z], o.a, o.b) < 12)) continue;
      for (const side of [-1, 1]) {
        const distance = side * (r.width / 2 + 1.1), sx = x - dz / len * distance, sz = z + dx / len * distance;
        if (!inSurface([sx, sz], layout.sidewalks)) continue;
        assert(Math.abs(elevation(sx, sz) - y) < 0.011, `차도·인도 경사 일치 (${x},${z})`);
        crossSections++;
      }
    }
  }
  assert(crossSections > 500);
  // 함수 값이 아닌 실제 렌더 삼각형을 레이로 검사해 찌그러짐을 검출한다.
  const geometries = roadGeometries(layout, elevation), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map((g, i) => { const m = new THREE.Mesh(g, material); m.position.y = [0.04, 0.04, 0.044, 0.046, 0.045, 0.04][i]; m.updateMatrixWorld(); return m; });
  let flatSamples = 0;
  for (const { ring, y } of [{ ring: MAIN_PARKING, y: MAIN_ENTRY_BASE }, { ring: MUSIC_PARKING, y: MUSIC_FORECOURT_LEVEL }]) {
    const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
    for (let x = Math.min(...xs) + 0.4; x < Math.max(...xs); x += 1.5) for (let z = Math.min(...zs) + 0.4; z < Math.max(...zs); z += 1.5) {
      if (!inSurface([x, z], [[ring]]) || !inSurface([x, z], layout.asphalt)) continue;
      const hit = new THREE.Raycaster(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(0, -1, 0), 0, 2).intersectObject(meshes[0])[0];
      assert(hit && Math.abs(hit.point.y - y - 0.04) < 0.001, `주차장 실제 메시 수평 (${x},${z},${hit?.point.y})`);
      flatSamples++;
    }
  }
  assert(flatSamples > 200);
  for (const u of [-13, -9, 9, 13]) for (const v of [9, 11, 14]) assert(Math.abs(elevation(...mainSitePoint(u, v)) - MAIN_ENTRY_BASE) < 0.001, '계단 양옆 하부 인도 수평');
  const manifest = JSON.parse(await readFile(new URL('web/public/models/tour/pavement-manifest.json', root)));
  const digest = createHash('sha256');
  for (const path of manifest.sources) digest.update(await readFile(new URL(path, root)));
  assert.equal(manifest.revision, digest.digest('hex').slice(0, 16), 'Blender 노면 원본이 최신 소스와 일치');
  const grate = await readFile(new URL(`web/public/models/tour/${manifest.grate.file}`, root));
  assert.equal(createHash('sha256').update(grate).digest('hex'), manifest.grate.sha256);
  assert.equal(grate.toString('ascii', 0, 4), 'glTF');
  assert(grate.length < 200000, '배수구는 작은 Blender 메시 한 개만 로딩');
  geometries.forEach(g => g.dispose()); material.dispose();
  console.log(`✓ 정문 진입 ${approachSamples}개 표본 · 도로/인도 ${crossSections}개 횡단면 · 주차장 실제 메시 ${flatSamples}점 · Blender 원본/GLB 일치`);
} finally { await server.close(); }
