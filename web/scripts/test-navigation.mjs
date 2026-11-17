import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// 포트·외부 API 없이 실제 검색·안내·상태 모듈과 생성 데이터를 검증한다.
const server = await createServer({
  cacheDir: '.cache/vite-tests',
  mode: 'static',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
const previousWindow = globalThis.window;
globalThis.window = globalThis;
try {
  const load = async (file) =>
    JSON.parse(await readFile(new URL(`../public/data/${file}`, import.meta.url)));
  const campus = await load('campus.json');
  const graph = await load('paths.json');
  const index = await load('buildings-index.json');
  const rooms = await load('rooms-index.json');
  const { searchPlaces } = await server.ssrLoadModule('/src/features/navigation/placeSearch.ts');
  const { fallbackMatch } = await server.ssrLoadModule('/src/features/guide/fallbackMatcher.ts');
  const { Router } = await server.ssrLoadModule('/src/features/navigation/router.ts');
  const { useCampusStore } = await server.ssrLoadModule('/src/store/useCampusStore.ts');
  const { BuildingPanel } = await server.ssrLoadModule('/src/ui/BuildingPanel.tsx');
  const { RoutePlanner } = await server.ssrLoadModule('/src/ui/RoutePlanner.tsx');
  const { OutdoorMarkers } = await server.ssrLoadModule('/src/ui/OutdoorMarkers.tsx');
  const render = (component) => {
    // Zustand의 서버 렌더링 스냅샷에 현재 테스트 상태를 주입한다.
    Object.assign(useCampusStore.getInitialState(), useCampusStore.getState());
    return renderToStaticMarkup(createElement(component));
  };
  const guideIndex = { buildings: index.buildings, rooms: rooms.rooms };
  const parking = searchPlaces('주차장', index.buildings, rooms.rooms);
  assert.equal(parking.length, 3);
  assert.equal(new Set(parking.map((p) => p.title)).size, 3);
  assert(parking.every((p) => p.subtitle === '주차장'));
  const field = campus.outdoor_areas.find((a) => a.kind === 'field');
  const tennis = campus.outdoor_areas.find((a) => a.kind === 'tennis');
  assert.equal(fallbackMatch('운동장 어디야?', guideIndex).building_id, field.id);
  const guide = fallbackMatch('운동장에서 테니스장 가는 길', guideIndex);
  assert.equal(guide.action, 'navigate');
  assert.equal(guide.from_id, field.id);
  assert.equal(guide.to_id, tennis.id);
  assert.equal(
    fallbackMatch('본관 옆 주차장 어디야?', guideIndex).building_id,
    'parking_970298862',
  );
  assert.equal(fallbackMatch('운동장에서 주차장 가는 길', guideIndex).action, 'unknown');
  assert.equal(fallbackMatch('이공관 301호 어디야?', guideIndex).room_id, 'science:2:4');
  const gates = searchPlaces('입구', index.buildings, rooms.rooms);
  assert.equal(gates.length, 3);
  assert(gates.every((p) => p.subtitle === '학교 입구'));
  assert.equal(fallbackMatch('정문 어디야?', guideIndex).building_id, 'gate_main');
  const gateRoute = fallbackMatch('정문에서 당정역 방향 입구 가는 길', guideIndex);
  assert.equal(gateRoute.from_id, 'gate_main');
  assert.equal(gateRoute.to_id, 'gate_dangjeong_station');
  assert.equal(
    fallbackMatch('당정초등학교 방향 입구 어디야?', guideIndex).building_id,
    'gate_dangjeong_elementary',
  );
  assert.equal(fallbackMatch('당정역 어디야?', guideIndex).action, 'unknown');

  useCampusStore.setState({
    campus,
    graph,
    index,
    rooms,
    router: new Router(graph),
    status: 'ready',
    interiors: { science: await load('floors/science.json') },
  });
  const markers = render(OutdoorMarkers);
  for (const area of campus.outdoor_areas) assert(markers.includes(`aria-label="${area.name} 선택"`));
  assert(!markers.includes('role="tooltip"'));
  useCampusStore.getState().hover(field.id);
  assert(render(OutdoorMarkers).includes(`role="tooltip"`));
  useCampusStore.getState().hover(null);
  let routesChecked = 0;
  for (const area of campus.outdoor_areas) {
    assert(
      searchPlaces(area.name, index.buildings, rooms.rooms).some((p) => p.buildingId === area.id),
    );
    useCampusStore.getState().select(area.id);
    assert.equal(useCampusStore.getState().place(area.id).id, area.id);
    const panel = render(BuildingPanel);
    assert(panel.includes(area.name) && panel.includes('야외시설'));
    assert(!panel.includes('층 선택'));
    for (const profile of ['recommended', 'accessible', 'walkway']) {
      useCampusStore.getState().closePlanner();
      useCampusStore.getState().setProfile(profile);
      for (const [from, to] of [
        [area.id, 'science'],
        ['science', area.id],
        [area.id, tennis.id],
      ]) {
        if (from === to) continue;
        useCampusStore.getState().openPlanner({
          from: { buildingId: from, roomId: null },
          to: { buildingId: to, roomId: null },
        });
        for (let i = 0; useCampusStore.getState().planner.busy && i < 100; i++) await delay(1);
        const state = useCampusStore.getState();
        assert.equal(state.planner.error, null, `${from} → ${to}`);
        assert.equal(state.planner.busy, false);
        assert.equal(state.routeEngine, 'browser');
        assert(state.route?.length > 0 && state.route.points.length > 1);
        assert(state.route.steps.some((s) => s.instruction.includes(area.name)));
        assert(render(RoutePlanner).includes(area.name));
        routesChecked++;
      }
    }
  }
  useCampusStore.getState().closePlanner();
  useCampusStore.getState().openPlanner();
  assert(useCampusStore.getState().pickOnMap(field.id));
  assert(useCampusStore.getState().pickOnMap(tennis.id));
  await delay(1);
  assert.equal(useCampusStore.getState().planner.from.buildingId, field.id);
  assert.equal(useCampusStore.getState().planner.to.buildingId, tennis.id);
  assert(useCampusStore.getState().route);
  useCampusStore.getState().closePlanner();
  console.log(
    `✓ 야외시설 검색·자연어 안내·정보 패널·지도 선택 및 브라우저 경로 ${routesChecked}개 통과`,
  );
} finally {
  globalThis.window = previousWindow;
  await server.close();
}
