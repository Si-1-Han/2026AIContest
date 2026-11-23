import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import * as THREE from 'three';

const root = new URL('../../', import.meta.url);
const load = name => readFile(new URL(name, root));
const campus = JSON.parse(await load('web/public/data/campus.json'));
const manifest = JSON.parse(await load('web/public/models/tour/manifest.json'));
const temporary = await mkdtemp(join(tmpdir(), 'campus-model-check-'));
const server = await createServer({ cacheDir: '.cache/vite-tests', mode: 'static', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { surfacePixels } = await server.ssrLoadModule('/src/scene/tour/materials.ts');
  const { MAIN_ENTRANCE, MAIN_ENTRANCE_PATH, MAIN_ENTRY_FLOOR, MAIN_ENTRY_BASE, mainEntryPoint } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { VISION_TERRACE_PATH } = await server.ssrLoadModule('/src/features/tour/visionTerrace.ts');
  const { buildExteriorSpec } = await server.ssrLoadModule('/src/scene/tour/exteriorSpec.ts');
  const { roofCrossLightFinish } = await server.ssrLoadModule('/src/scene/tour/mainBuildingSpec.ts');
  const { buildingElevation } = await server.ssrLoadModule('/src/features/tour/elevationLevels.ts');
  const { designGemiBridgeParts } = await server.ssrLoadModule('/src/scene/tour/TourBuildings.tsx');
  const bridgeDecks = designGemiBridgeParts(campus).slice(0, 2);
  for (const kind of ['stone', 'brick', 'asphalt', 'paving', 'bark', 'tactile']) {
    const maps = surfacePixels(kind, 64);
    assert.equal(maps.normal.length, 64 * 64 * 4);
    assert(maps.normal.some((n, i) => i % 4 === 0 && n !== 128), `${kind}: 실제 노멀 변화`);
    assert(maps.roughness.every((n, i) => i % 4 === 3 ? n === 255 : n > 100));
  }
  assert.equal(Object.keys(manifest.models).length, campus.buildings.length);
  const digest = createHash('sha256');
  for (const name of ['web/public/data/campus.json', 'web/src/scene/tour/exteriorSpec.ts', 'web/src/scene/tour/mainBuildingSpec.ts', 'web/src/features/tour/visionTerrace.ts', 'web/src/features/tour/elevationLevels.ts', 'web/src/features/tour/mainEntrance.ts', 'web/src/features/tour/rodemEntrance.ts', 'web/src/features/tour/musicForecourt.ts', 'web/src/features/tour/visionEntrance.ts', 'web/src/scene/tour/detailGeometry.ts', 'web/src/scene/tour/materials.ts', 'tools/blender/build_exteriors.py']) digest.update(await load(name));
  assert.equal(manifest.revision, digest.digest('hex').slice(0, 16), 'Blender 산출물이 현재 외관/재질 소스와 일치');

  await writeFile(join(temporary, 'decoder.cjs'), await load('web/public/draco/draco_wasm_wrapper.js'));
  const createDecoder = createRequire(import.meta.url)(join(temporary, 'decoder.cjs'));
  const draco = await createDecoder({ wasmBinary: await load('web/public/draco/draco_decoder.wasm') });
  let primitives = 0, totalBytes = 0;
  for (const building of campus.buildings) {
    const bridgeDirection = building.id === 'design' ? -1 : building.id === 'gemi' ? 1 : 0;
    const checkCollision = bridgeDirection !== 0 || building.id === 'main' || building.id === 'vision_center';
    const spec = buildExteriorSpec(building), entry = manifest.models[building.id];
    assert(spec.frames.length > spec.glass.length * 4, `${building.name}: 사방 창틀·분할 프레임`);
    const bytes = await load(`web/public/models/tour/${entry.file}`); totalBytes += bytes.length;
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF'); assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert(bytes.length < 10 * 1024 ** 2, `${building.name}: 단일 건물 로딩 용량 제한`);
    const jsonSize = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonSize));
    const binary = bytes.subarray(28 + jsonSize);
    assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
    assert(gltf.materials.some(m => m.name.startsWith('frames_')));
    assert(gltf.materials.some(m => m.normalTexture));
    assert(gltf.materials.some(m => m.extensions?.KHR_materials_clearcoat));
    const emissiveMaterials = gltf.materials.filter(m => m.emissiveFactor?.some(channel => channel > 0));
    assert.deepEqual(emissiveMaterials.map(m => m.name), building.id === 'main' ? ['crossLight_ffffff_plain'] : [], '실제 GLB: 발광 재질은 본관 십자가에만 적용');
    for (const material of emissiveMaterials) {
      const { emissive, emissiveIntensity, metalness, roughness } = roofCrossLightFinish;
      const expected = new THREE.Color(emissive).multiplyScalar(emissiveIntensity).toArray();
      const strength = material.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
      assert(material.emissiveFactor.every((channel, i) => Math.abs(channel * strength - expected[i]) < 0.00001));
      assert(Math.abs(material.pbrMetallicRoughness.metallicFactor - metalness) < 0.00001);
      assert(Math.abs(material.pbrMetallicRoughness.roughnessFactor - roughness) < 0.00001);
    }
    for (const material of gltf.materials) {
      const rgb = material.name.split('_')[1].match(/../g).map(channel => parseInt(channel, 16) / 255);
      const expected = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const factor = material.pbrMetallicRoughness.baseColorFactor;
      assert(factor, `${building.name}: GLB 내보내기 시 외벽 색상 유지`);
      expected.forEach((v, i) => assert(Math.abs(v - factor[i]) < 0.00001));
    }
    const bounds = new THREE.Box3(), meshMatrices = new Map(), collisionMeshes = [];
    const walk = (index, parent) => {
      const n = gltf.nodes[index], matrix = n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
      matrix.premultiply(parent);
      if (n.mesh !== undefined) meshMatrices.set(n.mesh, matrix.clone());
      if (n.mesh !== undefined) for (const p of gltf.meshes[n.mesh].primitives) {
        const accessor = gltf.accessors[p.attributes.POSITION];
        const box = new THREE.Box3(new THREE.Vector3(...accessor.min), new THREE.Vector3(...accessor.max)).applyMatrix4(matrix); bounds.union(box);
      }
      for (const child of n.children ?? []) walk(child, matrix);
    };
    for (const n of gltf.scenes[gltf.scene ?? 0].nodes) walk(n, new THREE.Matrix4());
    assert(bounds.min.y > (building.id === 'main' ? -3.81 : -0.1) && bounds.max.y < building.levels * building.floor_height + 15, `${building.name}: Y-up 및 지면 정렬`);
    assert(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z)) < 100, `${building.name}: 모델 중심 좌표가 로컬 좌표`);
    for (const [meshIndex, mesh] of gltf.meshes.entries()) for (const primitive of mesh.primitives) {
      const extension = primitive.extensions.KHR_draco_mesh_compression;
      const view = gltf.bufferViews[extension.bufferView], payload = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const decoder = new draco.Decoder(), buffer = new draco.DecoderBuffer(), geometry = new draco.Mesh();
      buffer.Init(new Int8Array(payload.buffer, payload.byteOffset, payload.byteLength), payload.byteLength);
      const status = decoder.DecodeBufferToMesh(buffer, geometry);
      assert(status.ok(), `${building.name}: Draco 실데이터 디코딩`);
      const positions = decoder.GetAttributeByUniqueId(geometry, extension.attributes.POSITION), values = new draco.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(geometry, positions, values);
      assert.equal(geometry.num_points(), gltf.accessors[primitive.attributes.POSITION].count);
      for (let i = 0; i < values.size(); i += Math.max(1, Math.floor(values.size() / 500))) assert(Number.isFinite(values.GetValue(i)));
      if (checkCollision) {
        const positions = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
        const faces = new draco.DracoInt32Array(), indices = [];
        for (let face = 0; face < geometry.num_faces(); face++) { decoder.GetFaceFromMesh(geometry, face, faces); indices.push(faces.GetValue(0), faces.GetValue(1), faces.GetValue(2)); }
        const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setIndex(indices); g.applyMatrix4(meshMatrices.get(meshIndex));
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); m.userData.materialName = gltf.materials[primitive.material].name; m.updateMatrixWorld(); collisionMeshes.push(m);
        draco.destroy(faces);
      }
      primitives++;
      draco.destroy(values); draco.destroy(status); draco.destroy(geometry); draco.destroy(buffer); draco.destroy(decoder);
    }
    if (bridgeDirection) {
      const body = collisionMeshes.filter(m => m.userData.materialName.startsWith('body_'));
      assert.equal(bridgeDecks.length, 2);
      for (const { p, s, ry } of bridgeDecks) {
        const dx = Math.cos(ry), dz = -Math.sin(ry);
        const direction = new THREE.Vector3(bridgeDirection * dx, 0, bridgeDirection * dz);
        const y = p[1] + buildingElevation('design') - buildingElevation(building.id);
        for (const side of [-s[2] / 2, 0, s[2] / 2]) {
          const origin = new THREE.Vector3(p[0] - building.center[0] - dz * side, y, p[2] - building.center[1] + dx * side);
          const ray = new THREE.Raycaster(origin, direction, 0, s[0] / 2 - 0.15);
          assert(ray.intersectObjects(body).length, `실제 GLB: ${building.name} 외벽과 연결 다리의 바닥·지붕이 폭 전체에서 맞물림`);
        }
      }
    }
    if (building.id === 'main') {
      const local = (x, y, z) => new THREE.Vector3(x - building.center[0], y - MAIN_ENTRY_FLOOR, z - building.center[1]);
      // 실제 내보낸 메시에서 두 계단의 디딤면이 지면 위에 남고 높이가 차례대로 올라간다.
      let last = -Infinity;
      for (const offset of [8.0, 7.2, 6.4, 5.6, 4.6, 3.6, 2.8, 2.0, 1]) {
        const [x, z] = mainEntryPoint(offset);
        const ray = new THREE.Raycaster(local(x, MAIN_ENTRY_FLOOR + 0.2, z), new THREE.Vector3(0, -1, 0), 0, 3);
        const hit = ray.intersectObjects(collisionMeshes)[0]; assert(hit, '실제 GLB: 본관 디딤면이 존재함');
        assert(hit.point.y > MAIN_ENTRY_BASE - MAIN_ENTRY_FLOOR - 0.05 && hit.point.y >= last - 0.03, '실제 GLB: 본관 아래 계단→참→위 계단 높이 연속'); last = hit.point.y;
      }
      const [x, z] = mainEntryPoint(10, 1.4), doorRay = new THREE.Raycaster(local(x, MAIN_ENTRY_FLOOR + 1.4, z), new THREE.Vector3(-MAIN_ENTRANCE.nx, 0, -MAIN_ENTRANCE.nz), 0, 11);
      const door = doorRay.intersectObjects(collisionMeshes)[0];
      assert(door?.object.userData.materialName.startsWith('glass_355b64'), '실제 GLB: 본관 정면에서 유리 출입문이 보임');
      const roofMeshes = collisionMeshes.filter(m => /^(frames_(aab4b7|bcc4c4|dee4e3)|crossLight_ffffff)_/.test(m.userData.materialName));
      const roofRay = (offset, height, face = 1) => {
        const [x, z] = mainEntryPoint(-9.8 + face * 4, -18.85 + offset);
        return new THREE.Raycaster(local(x, MAIN_ENTRY_FLOOR + 12.84 + height, z), doorRay.ray.direction.clone().multiplyScalar(face), 0, 8).intersectObjects(roofMeshes);
      };
      for (const face of [-1, 1]) {
        for (const [offset, height] of [[0, 0.9], [0, 3.9], [-1.05, 2.94], [1.05, 2.94]]) {
          assert(roofRay(offset, height, face)[0]?.object.userData.materialName.startsWith('crossLight_ffffff'), '실제 GLB: 본관 옥상 십자가 양면에 빛나는 세로·가로 획');
        }
        assert(roofRay(0.185, 0.9, face)[0]?.object.userData.materialName.startsWith('frames_dee4e3'), '실제 GLB: 발광면 둘레의 금속 테두리');
      }
      for (const [offset, height] of [[-1.68, 1.2], [1.68, 1.2], [-0.85, 5], [0.85, 5]]) {
        assert(roofRay(offset, height).length, '실제 GLB: 옥상에 닿는 지지대와 안으로 꺾인 상단');
      }
      for (const [offset, height] of [[-0.95, 1.2], [0.95, 1.2], [0, 5.2]]) {
        assert.equal(roofRay(offset, height).length, 0, '실제 GLB: 십자가 양옆과 철골 상단 사이가 열려 있음');
      }
    }
    if (building.id === 'vision_center') {
      const origin = (x, y, z) => new THREE.Vector3(x - building.center[0], y, z - building.center[1]);
      const foot = VISION_TERRACE_PATH.find(p => p.id === 'tour_vision_stairs_bottom'), top = VISION_TERRACE_PATH.find(p => p.id === 'tour_vision_stairs_top');
      const direction = new THREE.Vector3(top.x - foot.x, top.y - foot.y, top.z - foot.z), length = direction.length();
      const stair = new THREE.Raycaster(origin(foot.x, 1.8, foot.z), direction.normalize(), 0, length);
      assert.equal(stair.intersectObjects(collisionMeshes).length, 0, '실제 GLB: 1층→2층 계단 이동 중 벽을 통과하지 않음');
      const passage = new THREE.Raycaster(origin(top.x, 5.4, top.z), new THREE.Vector3(0, 0, 1), 0, 32);
      assert.equal(passage.intersectObjects(collisionMeshes).length, 0, '실제 GLB: 2층 외부 통로가 열려 있음');
      const ceiling = new THREE.Raycaster(origin(top.x, 5.4, 156.5), new THREE.Vector3(0, 1, 0), 0, 2);
      assert(ceiling.intersectObjects(collisionMeshes).length > 0, '실제 GLB: 통로 위에는 건물 바닥이 남아 있음');
    }
    for (const m of collisionMeshes) { m.geometry.dispose(); m.material.dispose(); }
  }
  assert(totalBytes < 50 * 1024 ** 2);
  console.log(`✓ 외관 ${campus.buildings.length}동 · 압축 메시 ${primitives}개 실제 디코딩 · PBR/좌표/소스 일치 검증 (${(totalBytes / 1024 ** 2).toFixed(1)}MB)`);
} finally { await server.close(); await rm(temporary, { recursive: true, force: true }); }
