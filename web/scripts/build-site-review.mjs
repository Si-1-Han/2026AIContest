import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url)), work = join(root, '.cache/site-review');
await mkdir(work, { recursive: true });
const server = await createServer({ root: join(root, 'web'), cacheDir: join(work, 'vite'), configFile: false, server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const campus = JSON.parse(await readFile(join(root, 'web/public/data/campus.json'))), graph = JSON.parse(await readFile(join(root, 'web/public/data/paths.json')));
  const load = p => server.ssrLoadModule(`/src/${p}`);
  const { buildTourNetwork } = await load('features/tour/network.ts');
  const { buildRoadLayout, groundSurfaceMask } = await load('scene/tour/roadLayout.ts');
  const { roadGeometries } = await load('scene/tour/TourRoads.tsx');
  const { campusTerrain } = await load('scene/tour/terrainGeometry.ts');
  const { tourElevation } = await load('features/tour/terrain.ts');
  const { buildingElevation } = await load('features/tour/elevationLevels.ts');
  const { mainAccessDecks, mainPlazaDecks, mainRetainingWalls, makeMainGroundsParts } = await load('scene/tour/MainGrounds.tsx');
  const { mainSitePoint } = await load('features/tour/mainBuildingAccess.ts');
  const { fountainCourtGeometry } = await load('scene/tour/FountainCourt.tsx');
  const { gateWallSections } = await load('features/tour/gateWalls.ts');
  const { makeScenery } = await load('scene/tour/scenery.ts');
  const fountain = await load('features/tour/fountainSite.ts');
  const layout = buildRoadLayout(campus, buildTourNetwork(campus, graph).corridors), mask = groundSurfaceMask(layout), elevation = tourElevation(campus);
  const surfaces = [];
  function mesh(g, name, color, wallColor = color, offset = 0) {
    const p = g.attributes.position, ids = g.index;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: ids?.count ?? p.count, materialIndex: 0 }];
    // 면별 정점을 묶고 검토 구역 밖 원경은 제외한다.
    for (const group of groups) {
      const vertices = [], faces = [], indexMap = new Map();
      for (let i = group.start; i < group.start + group.count; i += 3) {
        const tri = [0, 1, 2].map(j => ids ? ids.getX(i + j) : i + j);
        if (tri.every(k => p.getX(k) < -150 || p.getX(k) > 100 || p.getZ(k) < -250 || p.getZ(k) > 180)) continue;
        faces.push(tri.map(k => {
          if (!indexMap.has(k)) { indexMap.set(k, vertices.length / 3); vertices.push(p.getX(k), p.getY(k) + offset, p.getZ(k)); }
          return indexMap.get(k);
        }));
      }
      surfaces.push({ name, color: group.materialIndex === 1 ? wallColor : color, positions: vertices, faces });
    }
    g.dispose();
  }
  mesh(campusTerrain(campus, mask), 'Ground', '#7d9c65');
  const colors = ['#81898b', '#c8a88b', '#deded1', '#ddbe60', '#f7f5e8', '#c8a88b'];
  roadGeometries(layout, elevation).forEach((g, i) => mesh(g, `Pavement ${i}`, colors[i], colors[i], [0.04, 0.04, 0.044, 0.046, 0.045, 0.04][i]));
  for (const g of [...mainAccessDecks(layout.asphalt), ...mainPlazaDecks(mask)]) mesh(g, 'Main site', g.userData.surface === 'grass' ? '#79a950' : g.userData.surface === 'asphalt' ? '#697278' : '#aaa89e', '#b4bab2');
  for (const g of mainRetainingWalls(layout.asphalt)) mesh(g, 'Main retaining', '#bfc5bc');
  mesh(fountainCourtGeometry(campus, mask), 'Fountain court', '#c8a88b');
  const main = makeMainGroundsParts(), scenery = makeScenery(campus, layout);
  const views = [
    { name: 'main-front', eye: [...mainSitePoint(-15, 24)], y: 3.1, target: [...mainSitePoint(0, 0)], ty: 4.2 },
    { name: 'main-side', eye: [...mainSitePoint(-24, 14)], y: 2.7, target: [...mainSitePoint(16, 2)], ty: 1.8 },
    { name: 'main-parking', eye: [...mainSitePoint(-35, -23)], y: 2.92, target: [...mainSitePoint(-15, -15)], ty: 4.8 },
    { name: 'main-entry-split', eye: [...mainSitePoint(19, 23)], y: 2.92, target: [...mainSitePoint(9, 1)], ty: 2.8 },
    { name: 'main-upper', eye: [...mainSitePoint(81, -9)], y: 6.5, target: [...mainSitePoint(48, -22)], ty: 5.7 },
    { name: 'fountain', eye: [-82, -142], y: elevation(-82,-142)+1.7, target: [-60, -111], ty: 5.6 },
    { name: 'fountain-link', eye: [-54, -129], y: elevation(-54,-129)+1.7, target: [-28, -111], ty: 5.7 },
    { name: 'graduate-frontage', eye: [-80, -107], y: 6.9, target: [-56, -42], ty: 7 },
    { name: 'gate-uphill', eye: [-119, -213], y: 1.8, target: [-89, -164], ty: 3.1 },
    { name: 'music-uphill', eye: [-61, -3], y: 6.9, target: [-20, 90], ty: 12.5 },
    { name: 'music-parking-edge', eye: [-46.7, 66], y: 8, target: [-31, 34], ty: 8.4 },
    { name: 'music-front-lines', eye: [-53, 39], y: 10, target: [-32, 17], ty: 5.2 },
    { name: 'parking-to-music', eye: [-6, 112], y: 9.0, target: [4, 21], ty: 15 },
  ];
  const viewIndex = process.argv.indexOf('--views');
  const selectedViews = viewIndex < 0 ? views : views.filter(v => process.argv[viewIndex + 1].split(',').includes(v.name));
  await writeFile(join(work, 'recipe.json'), JSON.stringify({ surfaces, views: selectedViews, gateWalls: gateWallSections(), buildings: campus.buildings.map(b => ({ id: b.id, elevation: buildingElevation(b.id) })), parts: [...main.stone, ...main.metal, ...main.wood], shrubs: main.shrubs, trees: [...scenery.trees, ...main.trees], fountain: { center: fountain.FOUNTAIN_CENTER, level: fountain.FOUNTAIN_LEVEL, radius: fountain.FOUNTAIN_RADIUS, sign: fountain.FOUNTAIN_SIGN } }));
} finally { await server.close(); }
const index = process.argv.indexOf('--blender'), executable = index < 0 ? 'blender' : resolve(process.argv[index + 1]);
const code = await new Promise((done, reject) => {
  const child = spawn(executable, ['--background', '--factory-startup', '--python', join(root, 'tools/blender/review_site.py'), '--', '--recipe', join(work, 'recipe.json'), '--root', root], { stdio: 'inherit', env: { ...process.env, BLENDER_USER_CONFIG: join(work, 'config') } });
  child.on('error', reject); child.on('exit', done);
});
if (code !== 0) throw new Error(`Site review failed (${code})`);
