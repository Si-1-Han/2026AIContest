import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { createServer } from 'vite';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const work = join(root, '.cache/tour-models');
const output = join(root, 'web/public/models/tour');
await mkdir(work, { recursive: true }); await mkdir(output, { recursive: true });
const sourceFiles = ['web/public/data/campus.json', 'web/src/scene/tour/exteriorSpec.ts', 'web/src/scene/tour/mainBuildingSpec.ts', 'web/src/features/tour/visionTerrace.ts', 'web/src/features/tour/elevationLevels.ts', 'web/src/features/tour/mainEntrance.ts', 'web/src/scene/tour/detailGeometry.ts', 'web/src/scene/tour/materials.ts', 'tools/blender/build_exteriors.py'];
const digest = createHash('sha256'); for (const name of sourceFiles) digest.update(await readFile(join(root, name)));
const revision = digest.digest('hex').slice(0, 16);
const server = await createServer({ root: join(root, 'web'), cacheDir: join(work, 'vite'), mode: 'static', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
// RGBA 텍스처를 외부 이미지 패키지 없이 PNG로 기록한다.
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc32(body), out.length - 4); return out; };
async function png(path, pixels, size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) Buffer.from(pixels.buffer, pixels.byteOffset + y * size * 4, size * 4).copy(rows, y * (size * 4 + 1) + 1);
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  await writeFile(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}
try {
  const { buildExteriorSpec, themes } = await server.ssrLoadModule('/src/scene/tour/exteriorSpec.ts');
  const { extrudeFootprint } = await server.ssrLoadModule('/src/lib/geometry.ts');
  const { pedimentGeometry, roofGeometry } = await server.ssrLoadModule('/src/scene/tour/detailGeometry.ts');
  const { surfacePixels, SURFACE_REPEAT } = await server.ssrLoadModule('/src/scene/tour/materials.ts');
  const campus = JSON.parse(await readFile(join(root, 'web/public/data/campus.json')));
  const textures = {};
  for (const kind of ['stone', 'brick']) {
    const maps = surfacePixels(kind);
    textures[kind] = { repeat: SURFACE_REPEAT[kind] };
    for (const channel of ['color', 'normal', 'roughness']) { const path = join(work, `${kind}-${channel}.png`); await png(path, maps[channel], maps.size); textures[kind][channel] = path; }
  }
  const mesh = (g, p, angle, color, surface = null) => {
    const result = { positions: [...g.attributes.position.array], uv: [...g.attributes.uv.array], p, angle, color, surface }; g.dispose(); return result;
  };
  const buildings = campus.buildings.map(b => {
    const spec = buildExteriorSpec(b), theme = themes[b.id], surface = ['music', 'rodem'].includes(b.id) ? 'brick' : 'stone';
    return { id: b.id, name: b.name, center: b.center, radius: Math.max(...b.footprint.map(([x, z]) => Math.hypot(x - b.center[0], z - b.center[1]))), height: spec.height, front: spec.front,
      parts: { stone: spec.stone, frames: spec.frames, glass: spec.glass, cylinder: spec.round, cone: spec.cones },
      meshes: [
        ...spec.levels.map(f => mesh(extrudeFootprint(f.outline.map(([x, z]) => [x - b.center[0], z - b.center[1]]), b.floor_height), [b.center[0], f.level * b.floor_height, b.center[1]], 0, b.id === 'graduate' && f.level < 2 ? '#475052' : theme.wall, surface)),
        ...spec.roofs.map(r => mesh(roofGeometry(r.width, r.length), [r.x, r.y, r.z], r.angle + Math.PI / 2, r.color)),
        ...spec.pediments.map(p => mesh(pedimentGeometry(...p.s), p.p, p.ry ?? 0, p.color)),
      ],
    };
  });
  await writeFile(join(work, 'recipe.json'), JSON.stringify({ version: 1, revision, attribution: campus.attribution, coordinateSystem: 'x-east/y-up/z-south; local building center', textures, buildings }));
} finally { await server.close(); }

const arg = process.argv.indexOf('--blender');
const blender = arg >= 0 ? process.argv[arg + 1] : process.env.BLENDER_EXECUTABLE ?? 'blender';
const args = ['--background', '--factory-startup', '--python', join(root, 'tools/blender/build_exteriors.py'), '--', '--recipe', join(work, 'recipe.json'), '--output', output, '--blend', join(root, 'assets/tour/campus-exteriors.blend')];
if (process.argv.includes('--preview')) args.push('--preview');
const code = await new Promise((resolveExit, reject) => {
  const child = spawn(blender, args, { cwd: root, stdio: 'inherit', env: { ...process.env, BLENDER_USER_CONFIG: join(work, 'config') } });
  child.on('error', reject); child.on('exit', resolveExit);
});
if (code !== 0) throw new Error(`Blender 모델 생성 실패 (${code})`);
const manifest = JSON.parse(await readFile(join(output, 'manifest.json')));
for (const entry of Object.values(manifest.models)) entry.sha256 = createHash('sha256').update(await readFile(join(output, entry.file))).digest('hex');
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Blender 외관 모델 ${Object.keys(manifest.models).length}개 생성 · revision ${revision}`);
