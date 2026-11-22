import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ cacheDir: '.cache/vite-tests', mode: 'static', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const campus = JSON.parse(await readFile(new URL('../public/data/campus.json', import.meta.url)));
  const { birdTourFor, BIRD_HOLD_SECONDS, BIRD_STOPS } = await server.ssrLoadModule('/src/features/tour/birdTour.ts');
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { buildingElevation } = await server.ssrLoadModule('/src/features/tour/elevationLevels.ts');
  const { MAIN_ENTRY_FLOOR, mainEntryLocal } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const tour = birdTourFor(campus);
  const elevation = tourElevation(campus);
  const forward = q => new THREE.Vector3(0, 0, -1).applyQuaternion(q);

  // 2분 이내 발표 분량
  assert(tour.duration >= 100 && tour.duration <= 120, `전체 길이 ${tour.duration.toFixed(1)}초`);

  // 본관 2층 정문 캐노피 턱에서 시작해 같은 자리로 돌아온다
  const start = tour.pose(0), end = tour.pose(tour.duration);
  const canopyTop = MAIN_ENTRY_FLOOR + 3.2 + 0.55 / 2;
  const local = mainEntryLocal(start.position.x, start.position.z);
  assert(local.v > 0 && local.v < 2.9 && Math.abs(local.u) < 6.75, '정문 캐노피 위');
  assert(Math.abs(start.position.y - canopyTop - 0.17) < 0.06, '캐노피 턱에 앉은 눈높이');
  assert(start.position.distanceTo(tour.perch) < 0.1 && end.position.distanceTo(tour.perch) < 0.1, '같은 턱으로 돌아와 내려앉음');
  assert.equal(end.phase, 'done');
  // 처음과 끝 모두 캠퍼스 쪽(정문 바깥)을 본다
  const outward = (q) => { const f = forward(q); const a = mainEntryLocal(start.position.x + f.x, start.position.z + f.z); return a.v - local.v; };
  assert(outward(start.quaternion) > 0.9 && outward(end.quaternion) > 0.9, '정문 바깥을 바라봄');

  // 시계 반대 방향(북쪽이 위인 지도 기준)으로 한 바퀴
  const area = tour.path.reduce((sum, p, i) => { const q = tour.path[(i + 1) % tour.path.length]; return sum + p.x * -q.z - q.x * -p.z; }, 0) / 2;
  assert(area > 20000, `반시계 방향 순환 (면적 ${area.toFixed(0)})`);
  const order = ['main', 'graduate', 'design', 'music', 'vision_center', 'vision', 'theology', 'science', 'main'];
  assert.deepEqual(tour.chapters.map(c => c.id), order, order.join(' → '));
  assert.deepEqual(tour.holds.map(h => h.id), order.slice(1, -1), '일곱 건물 모두 하이라이트');

  // 하이라이트: 고도를 낮춰 건물을 화면 가운데 두고 정확히 8초 머문 뒤 원래 고도로 복귀
  assert.equal(tour.holds.length, BIRD_STOPS.length);
  const legPeak = leg => { let y = -Infinity; for (let t = leg.t0; t <= leg.t1; t += 0.1) y = Math.max(y, tour.pose(t).position.y); return y; };
  for (const [i, hold] of tour.holds.entries()) {
    assert(Math.abs(hold.t1 - hold.t0 - BIRD_HOLD_SECONDS) < 1e-9, `${hold.id} 8초`);
    const during = tour.pose((hold.t0 + hold.t1) / 2).position.y;
    // 먼 구간(150m 이상)에서는 원래 순항 고도로 올라갔다가 건물 앞에서 고도를 낮춘다
    for (const leg of [tour.legs[i], tour.legs[i + 1]]) if (leg.length >= 150) assert(legPeak(leg) - during > 12, `${hold.id} 고도를 낮췄다가 복귀 (${legPeak(leg).toFixed(0)} ↔ ${during.toFixed(0)})`);
    for (let t = hold.t0; t <= hold.t1; t += 0.25) {
      const p = tour.pose(t), to = hold.focus.clone().sub(p.position).normalize();
      assert(forward(p.quaternion).angleTo(to) < 0.08, `${hold.id} 건물이 화면 중앙 (${t.toFixed(2)}s)`);
    }
    assert.equal(tour.pose(hold.t0 + 1).caption?.id, hold.id, `${hold.id} 자막`);
  }

  // 건물·지형과 부딪히지 않고, 화면이 튀지 않는다
  const tops = campus.buildings.map(b => ({ b, top: buildingElevation(b.id) + b.levels * b.floor_height + (b.id === 'main' ? 6 : 1) }));
  const inside = ([x, z], poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, az] = poly[i], [bx, bz] = poly[j]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) c = !c; } return c; };
  const step = 1 / 30;
  let prev = tour.pose(0), maxSpeed = 0, maxTurn = 0, maxHead = 0, minClearance = Infinity;
  for (let t = step; t <= tour.duration; t += step) {
    const p = tour.pose(t);
    for (const { b, top } of tops) if (inside([p.position.x, p.position.z], b.footprint)) assert(p.position.y > top + 2, `${b.id} 지붕 위 (${t.toFixed(2)}s)`);
    for (const c of campus.context) if (inside([p.position.x, p.position.z], c.footprint)) assert(p.position.y > elevation(p.position.x, p.position.z) + c.height + 2, `주변 건물 위 (${t.toFixed(2)}s)`);
    if (p.position.distanceTo(tour.perch) > 15) {
      const clearance = p.position.y - elevation(p.position.x, p.position.z);
      minClearance = Math.min(minClearance, clearance);
      assert(clearance > 6, `지면 위 비행 (${t.toFixed(2)}s, ${clearance.toFixed(1)}m)`);
    }
    maxSpeed = Math.max(maxSpeed, p.position.distanceTo(prev.position) / step);
    const turn = forward(p.quaternion).angleTo(forward(prev.quaternion)) / step;
    // 앉아 있을 때의 고개 짓은 새답게 빠르게, 비행 중 시선은 부드럽게
    if (p.phase === 'perch' || p.phase === 'turn') maxHead = Math.max(maxHead, turn); else maxTurn = Math.max(maxTurn, turn);
    prev = { position: p.position.clone(), quaternion: p.quaternion.clone() };
  }
  assert(maxSpeed < 38, `최고 속도 ${maxSpeed.toFixed(1)}m/s`);
  assert(maxTurn < 2.6, `비행 중 최대 회전 ${maxTurn.toFixed(2)}rad/s`);
  assert(maxHead < 3.6, `고개 짓 ${maxHead.toFixed(2)}rad/s`);

  // 같은 시각은 항상 같은 화면(되감기·녹화 재현성)
  const a = tour.pose(42.3), b = tour.pose(42.3);
  assert(a.position.equals(b.position) && a.quaternion.equals(b.quaternion));
  console.log(`새 시점 투어 ${tour.duration.toFixed(1)}초 · 챕터 ${tour.chapters.map(c => `${c.label} ${c.t.toFixed(1)}s`).join(' → ')} · 최고 ${maxSpeed.toFixed(1)}m/s · 최대 회전 ${maxTurn.toFixed(2)}rad/s · 최저 지상고 ${minClearance.toFixed(1)}m`);
} finally {
  await server.close();
}
