import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const work = join(root, '.cache/road-details');
await mkdir(work, { recursive: true });
const sources = ['web/public/data/campus.json', 'web/public/data/paths.json', 'web/src/features/tour/pavementGrade.ts', 'web/src/features/tour/terrain.ts', 'web/src/features/tour/mainEntrance.ts', 'web/src/features/tour/mainBuildingAccess.ts', 'web/src/features/tour/musicForecourt.ts', 'web/src/features/tour/elevationLevels.ts', 'web/src/features/tour/network.ts', 'web/src/features/tour/fieldWalk.ts', 'web/src/features/tour/gateWalls.ts', 'web/src/scene/tour/MainGrounds.tsx', 'web/src/scene/tour/roadLayout.ts', 'web/src/scene/tour/TourRoads.tsx', 'web/src/scene/tour/terrainGeometry.ts', 'tools/blender/build_road_details.py', 'web/scripts/build-road-details.mjs'];
const digest = createHash('sha256');
sources.push('web/src/features/tour/campusSpine.ts', 'web/src/features/tour/fountainSite.ts', 'web/src/scene/tour/siteGeometry.ts');
sources.push('web/src/features/tour/buildingFrontage.ts', 'web/src/scene/tour/terrainCuts.ts');
sources.push('web/src/features/tour/pavedAreas.ts', 'web/src/features/tour/graduateApproach.ts');
sources.push('web/src/features/tour/southLink.ts', 'web/src/features/tour/rodemEntrance.ts', 'web/src/features/tour/visionEntrance.ts');
for (const path of sources) digest.update(await readFile(join(root, path)));
const revision = digest.digest('hex').slice(0, 16);
const server = await createServer({ root: join(root, 'web'), cacheDir: join(work, 'vite'), configFile: false, server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const campus = JSON.parse(await readFile(join(root, 'web/public/data/campus.json')));
  const graph = JSON.parse(await readFile(join(root, 'web/public/data/paths.json')));
  const { buildTourNetwork } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { buildRoadLayout, groundSurfaceMask } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const { roadGeometries } = await server.ssrLoadModule('/src/scene/tour/TourRoads.tsx');
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { mainAccessDecks, mainPlazaDecks } = await server.ssrLoadModule('/src/scene/tour/MainGrounds.tsx');
  const layout = buildRoadLayout(campus, buildTourNetwork(campus, graph).corridors);
  const names = ['asphalt', 'sidewalks', 'curbs', 'tactile', 'parkingLines', 'walkways'];
  const geometries = [...roadGeometries(layout, tourElevation(campus)), ...mainAccessDecks(layout.asphalt), ...mainPlazaDecks(groundSurfaceMask(layout))];
  const surfaces = geometries.map((g, i) => {
    g.translate(0, i < 6 ? [0.04, 0.04, 0.044, 0.046, 0.045, 0.04][i] : 0, 0);
    return { name: names[i] ?? 'access', positions: [...g.attributes.position.array], indices: g.index ? [...g.index.array] : null };
  });
  await writeFile(join(work, 'recipe.json'), JSON.stringify({ revision, surfaces }));
  geometries.forEach(g => g.dispose());
} finally { await server.close(); }
const index = process.argv.indexOf('--blender');
const executable = index >= 0 ? resolve(process.argv[index + 1]) : process.env.BLENDER_EXECUTABLE ?? 'blender';
const output = join(root, 'web/public/models/tour/drain-grate.glb');
const code = await new Promise((done, reject) => {
  const child = spawn(executable, ['--background', '--factory-startup', '--python', join(root, 'tools/blender/build_road_details.py'), '--', '--recipe', join(work, 'recipe.json'), '--output', output, '--blend', join(root, 'assets/tour/campus-pavement.blend')], { stdio: 'inherit', env: { ...process.env, BLENDER_USER_CONFIG: join(work, 'config') } });
  child.on('error', reject); child.on('exit', done);
});
if (code !== 0) throw new Error(`Blender road details failed (${code})`);
await writeFile(join(root, 'web/public/models/tour/pavement-manifest.json'), JSON.stringify({ revision, generator: 'Blender', sources, grate: { file: 'drain-grate.glb', sha256: createHash('sha256').update(await readFile(output)).digest('hex') } }, null, 2) + '\n');
console.log(`✓ Blender pavement review + beveled drain grate · ${revision}`);
