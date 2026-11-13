import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const json = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom',
});
try {
  const { useCampusStore: store } = await server.ssrLoadModule('/src/store/useCampusStore.ts');
  const { BuildingPanel } = await server.ssrLoadModule('/src/ui/BuildingPanel.tsx');
  const interior = json('floors/gemi.json');
  const floor = interior.floors.find((f) => f.rooms.some((r) => r.category === '공간'));
  const room = floor.rooms.find((r) => r.category === '공간');
  store.setState({ campus: json('campus.json'), selectedId: 'gemi', floorIndex: floor.index,
    selectedRoomId: room.id, interiors: { gemi: interior } });
  // React server rendering reads Zustand's server snapshot, rather than the live snapshot.
  Object.assign(store.getInitialState(), store.getState());
  const guest = renderToStaticMarkup(createElement(BuildingPanel));
  assert.ok(!guest.includes('관리자 강의실 편집'));
  const admin = renderToStaticMarkup(createElement(BuildingPanel, { adminUser: 'admin' }));
  assert.ok(admin.includes('관리자 강의실 편집'));
  assert.ok(admin.includes('aria-label="강의실 수정"'));
  assert.ok(admin.includes('aria-label="강의실 삭제"'));
  const facilityFloor = interior.floors.find((f) => f.rooms.some((r) => r.category === '시설물'));
  store.setState({ floorIndex: facilityFloor.index,
    selectedRoomId: facilityFloor.rooms.find((r) => r.category === '시설물').id });
  Object.assign(store.getInitialState(), store.getState());
  const facility = renderToStaticMarkup(createElement(BuildingPanel, { adminUser: 'admin' }));
  assert.ok(!facility.includes('관리자 강의실 편집'));
  console.log('Verified campus room edit/delete controls appear for administrators only, and not for facilities.');
} finally {
  await server.close();
}
