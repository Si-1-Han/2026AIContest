import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const json = (name) => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8'));
const campus = json('campus.json');
const graph = json('paths.json');
const index = json('buildings-index.json');
const rooms = json('rooms-index.json');
const interior = json('floors/gemi.json');
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
let rejectSave = false;
globalThis.fetch = async (url, options) => {
  if (options?.method && options.method !== 'GET') {
    return Response.json(rejectSave ? { detail: 'conflict' } : { ok: true }, { status: rejectSave ? 409 : 200 });
  }
  const path = String(url);
  if (path.endsWith('/api/v1/campus') || path.endsWith('/data/campus.json')) return Response.json(campus);
  if (path.endsWith('/api/v1/graph') || path.endsWith('/data/paths.json')) return Response.json(graph);
  if (path.endsWith('/buildings-index.json')) return Response.json(index);
  if (path.endsWith('/rooms-index.json')) return Response.json(rooms);
  if (path.endsWith('/gemi/interior') || path.endsWith('/floors/gemi.json')) return Response.json(interior);
  throw new Error(`Unexpected request: ${path}`);
};

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
  server: { middlewareMode: true, hmr: false }, appType: 'custom',
});
try {
  const { useCampusStore: store } = await server.ssrLoadModule('/src/store/useCampusStore.ts');
  const { onDataUpdated } = await server.ssrLoadModule('/src/data/dataUpdates.ts');
  const { adminApi } = await server.ssrLoadModule('/src/ui/adminClient.ts');
  await store.getState().load();
  const selected = rooms.rooms.find((r) => r.building_id === 'gemi' && r.category === '공간');
  store.setState({ selectedId: 'gemi', floorIndex: selected.floor_index, selectedRoomId: selected.id,
    interiors: { gemi: structuredClone(interior) } });
  const changedRoom = interior.floors[selected.floor_index].rooms.find((r) => r.id === selected.id);
  changedRoom.name = 'Updated room';
  campus.buildings.find((b) => b.id === 'gemi').name = 'Updated building';
  await store.getState().refresh();
  assert.equal(store.getState().selectedId, 'gemi');
  assert.equal(store.getState().selectedRoomId, selected.id);
  assert.equal(store.getState().room(selected.id).name, 'Updated room');
  assert.equal(store.getState().building('gemi').name, 'Updated building');
  interior.floors[selected.floor_index].rooms = interior.floors[selected.floor_index].rooms.filter((r) => r.id !== selected.id);
  await store.getState().refresh();
  assert.equal(store.getState().selectedRoomId, null);
  assert.equal(store.getState().selectedId, 'gemi');
  const events = [];
  const unsubscribe = onDataUpdated((kind) => events.push(kind));
  await adminApi('courses/example.json/OLD', 'PUT', { code: 'NEW' });
  assert.deepEqual(events, ['courses']);
  rejectSave = true;
  await assert.rejects(adminApi('courses/example.json/NEW', 'PUT', { code: 'DUPLICATE' }), /conflict/);
  assert.deepEqual(events, ['courses']);
  unsubscribe();
  console.log('Verified live refresh, selected building/room preservation, deleted-room cleanup, and notifications only after successful saves.');
} finally {
  await server.close();
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
}
