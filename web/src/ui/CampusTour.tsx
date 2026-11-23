import { MAIN_ACCESS_NODES } from '../features/tour/mainBuildingAccess';
import { tourPlaceGoal } from '../features/tour/buildingAccess';
import { useEffect, useMemo, useRef, useState } from 'react';
import { planTourMove, tourPath, TOUR_STEP_METERS } from '../features/tour/network';
import { useCampusStore } from '../store/useCampusStore';
import { useTourStore } from '../store/useTourStore';
import { tourBuildingName } from '../features/tour/buildingName';
import { AutoTourControls } from './AutoTourControls';

const button = 'rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-40';
export function TourLauncher() {
  const error = useTourStore(s => s.error);
  const plannerOpen = useCampusStore(s => s.planner.open);
  if (plannerOpen) return null;
  return <div className="absolute left-5 top-52 z-40 max-w-[calc(100%-40px)]">
    <button id="tour-launcher-focus" onClick={() => useTourStore.getState().start()} className="rounded-2xl border border-emerald-300/40 bg-emerald-950/90 px-5 py-3 text-left text-white shadow-xl backdrop-blur transition hover:bg-emerald-900">
      <span className="block text-sm font-bold">캠퍼스 투어 시작 ↗</span><span className="mt-0.5 block text-xs text-emerald-200">정문에서 거리뷰로 둘러보기</span>
    </button>
    {error && <p role="alert" className="mt-2 rounded-lg bg-red-950 px-3 py-2 text-xs text-white">{error}</p>}
  </div>;
}

function FlightControls() {
  const surface = useRef<HTMLDivElement>(null);
  const [mouseLocked, setMouseLocked] = useState(false);
  useEffect(() => {
    surface.current?.focus({ preventScroll: true });
    const update = () => setMouseLocked(document.pointerLockElement === surface.current);
    document.addEventListener('pointerlockchange', update);
    return () => document.removeEventListener('pointerlockchange', update);
  }, []);

  return <>
    <div id="flight-look-surface" ref={surface} tabIndex={0} role="region" aria-label="공중 시점 조작 영역" aria-describedby="flight-controls-help" className="absolute inset-0 cursor-crosshair focus:outline-none" />
    <footer id="flight-controls-help" data-tour-ui className="pointer-events-none absolute bottom-5 left-3 right-3 mx-auto max-w-lg rounded-2xl bg-white/95 p-3 text-center text-xs leading-relaxed shadow-xl backdrop-blur sm:bottom-7">
      <p className="font-semibold"><kbd>W</kbd> 전진 · <kbd>S</kbd> 후진 · <kbd>A</kbd>/<kbd>D</kbd> 좌우 이동</p>
      <p className="mt-1 text-slate-600">하늘이나 땅을 보고 W를 누르면 올라가거나 내려갑니다.</p>
      <p className="mt-1 text-slate-600" aria-live="polite">{mouseLocked ? '마우스 이동으로 시야 조절 · Esc로 마우스 놓기' : '화면을 클릭한 뒤 마우스를 움직이거나, 화면을 드래그하세요.'}</p>
    </footer>
  </>;
}

export function CampusTour() {
  const campus = useCampusStore(s => s.campus)!;
  const network = useTourStore(s => s.network)!;
  const nodeId = useTourStore(s => s.nodeId);
  const targetId = useTourStore(s => s.targetId);
  const visited = useTourStore(s => s.visited);
  const destination = useTourStore(s => s.destination);
  const yaw = useTourStore(s => s.yaw);
  const flying = useTourStore(s => s.view === 'flight');
  const automatic = useTourStore(s => s.view === 'auto');
  const [mapOpen, setMapOpen] = useState(true);
  const [course, setCourse] = useState('free');
  const [courseIndex, setCourseIndex] = useState(0);
  const exit = useRef<HTMLButtonElement>(null);
  const autoStart = useRef<HTMLButtonElement>(null);
  const n = network.nodes[nodeId]!;
  const places = [...campus.buildings, ...(campus.outdoor_areas ?? [])];
  const placeDistance = (p: typeof places[number]) => { const goal = tourPlaceGoal(p); return Math.min(Math.hypot(goal[0] - n.x, goal[1] - n.z), ...(p.id === 'main' ? MAIN_ACCESS_NODES.map(a => Math.hypot(a.x - n.x, a.z - n.z)) : [])); };
  const nearest = places.reduce((a, b) => placeDistance(b) < placeDistance(a) ? b : a);
  const full = ['main', 'graduate', 'design', 'gemi', 'music', 'rodem', 'vision_center', 'science', 'student_union', 'theology', 'vision', 'gate_main'];
  const highlights = ['main', 'field_834838428', 'music', 'vision_center', 'student_union'];
  const itinerary = course === 'full' ? full : highlights;
  const goal = places.find(b => b.id === destination);
  const route = useMemo(() => goal ? tourPath(network, nodeId, tourPlaceGoal(goal)) : [], [network, nodeId, goal?.id]);
  const arrived = !!goal && route.length <= 1;
  const moves = useMemo(() => Object.fromEntries(n.neighbors.map(id => {
    const move = planTourMove(network, nodeId, id, TOUR_STEP_METERS, route);
    const end = move.network.nodes[move.path.at(-1)!]!;
    return [id, { distance: move.distance, x: end.x, y: (end.y ?? 0) + 0.2, z: end.z }];
  })), [network, nodeId, route]);
  useEffect(() => { exit.current?.focus(); return () => document.getElementById('tour-launcher-focus')?.focus(); }, []);
  useEffect(() => {
    if (!automatic && document.activeElement === document.body) autoStart.current?.focus({ preventScroll: true });
  }, [automatic]);
  useEffect(() => {
    if (course !== 'free') useTourStore.getState().setDestination(itinerary[courseIndex] ?? null);
  }, [course, courseIndex]);
  const direction = (id: string) => {
    const next = network.nodes[id]!;
    const angle = Math.atan2(-(next.x - n.x), -(next.z - n.z)) - yaw;
    const degrees = (angle * 180 / Math.PI % 360 + 540) % 360 - 180;
    const kind = network.kinds[`${nodeId}/${id}`] ?? network.kinds[`${id}/${nodeId}`];
    const text = kind === 'stairs' ? (next.y ?? 0) > (n.y ?? 0) ? '계단 올라가기' : '계단 내려가기' : Math.abs(degrees) > 135 ? '뒤로' : degrees > 35 ? '왼쪽' : degrees < -35 ? '오른쪽' : '앞으로';
    return { text, angle: -degrees, distance: Math.round(moves[id]!.distance) };
  };
  if (automatic) return <AutoTourControls />;
  return <div id="tour-look-surface" className="absolute inset-0 z-20 touch-none cursor-grab select-none text-slate-800" role="region" aria-label={flying ? '캠퍼스 공중 자유 시점' : '캠퍼스 거리뷰. 드래그 또는 방향키로 둘러보고 이동 지점 버튼을 선택하세요.'}>
    {flying && <FlightControls />}
    <header data-tour-ui className="absolute left-3 right-3 top-3 flex flex-wrap items-center justify-between gap-2 p-3 sm:left-5 sm:right-5 sm:top-5 sm:px-5">
      <div><p className="text-[10px] font-bold tracking-[0.22em] text-emerald-700">HANSEI CAMPUS WALK</p><h1 className="text-base font-extrabold sm:text-xl">캠퍼스 거리 투어</h1><p className="text-xs text-slate-500">{flying ? '공중 자유 시점' : `${tourBuildingName(nearest)} 주변 · 이동 지점 ${visited.length}곳 탐색`}</p></div>
      <div className="flex flex-wrap gap-2">
        {!flying && <button className={button} onClick={() => useTourStore.getState().look(yaw + Math.PI)} aria-label="뒤돌아보기">↶ 뒤돌기</button>}
        <button className={`${button} !border-emerald-300 !bg-emerald-50 !text-emerald-800`} disabled={!!targetId} onClick={() => useTourStore.getState().setView(flying ? 'street' : 'flight')}>{flying ? '거리뷰로 돌아가기' : '공중 자유 시점'}</button>
        <button ref={autoStart} className={`${button} !border-blue-800 !bg-blue-900 !text-white`} disabled={!!targetId} onClick={() => useTourStore.getState().startAuto()}>자동 투어</button>
        <button ref={exit} className={button} onClick={() => useTourStore.getState().stop()}>투어 종료 {!flying && <span className="hidden sm:inline">· Esc</span>}</button>
      </div>
    </header>
    {!flying && <>
    <div data-tour-ui className="absolute left-3 top-36 max-w-[calc(100%-24px)] rounded-2xl bg-white/90 p-3 shadow-md backdrop-blur sm:left-5 sm:top-32">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-500">둘러보기 방식<select aria-label="투어 코스" value={course} onChange={e => { setCourse(e.target.value); setCourseIndex(0); useTourStore.getState().setDestination(null); }} className="mt-1 block rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800"><option value="free">자유 둘러보기</option><option value="full">정문부터 캠퍼스 한 바퀴</option><option value="highlights">주요 장소 둘러보기</option></select></label>
        {course === 'free' && <label className="text-xs text-slate-500">방향 안내<select aria-label="방향 안내 장소" value={destination ?? ''} onChange={e => useTourStore.getState().setDestination(e.target.value || null)} className="mt-1 block max-w-44 rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800"><option value="">장소 선택</option>{places.map(b => <option key={b.id} value={b.id}>{tourBuildingName(b)}</option>)}</select></label>}
        <label className="text-xs text-slate-500">건물 바로 이동<select aria-label="건물 바로 이동" value="" onChange={e => { if (e.target.value) { setCourse('free'); useTourStore.getState().jumpToBuilding(e.target.value); } }} className="mt-1 block max-w-44 rounded-lg border border-emerald-300 bg-white p-2 text-sm text-emerald-800"><option value="">건물을 선택하세요</option>{campus.buildings.map(b => <option key={b.id} value={b.id}>{tourBuildingName(b) === b.name ? b.name : `${tourBuildingName(b)} · ${b.name}`}</option>)}</select></label>
      </div>
      {goal && <div className="mt-2 max-w-80 text-xs text-emerald-800" aria-live="polite">{arrived ? `${tourBuildingName(goal)} 주변에 도착했어요.` : `${tourBuildingName(goal)} 방향 · 초록 화살표를 따라 이동하세요.`}{course !== 'free' && <span className="ml-1 text-slate-500">({courseIndex + 1}/{itinerary.length})</span>}{arrived && course !== 'free' && <button className="ml-2 rounded-md bg-emerald-700 px-2 py-1 text-white" onClick={() => { if (courseIndex + 1 < itinerary.length) setCourseIndex(i => i + 1); else { setCourse('free'); useTourStore.getState().setDestination(null); } }}>{courseIndex + 1 < itinerary.length ? '다음 장소 →' : '코스 마치기'}</button>}</div>}
    </div>
    {n.neighbors.map(id => { const dir = direction(id); return <button key={id} id={`tour-node-${id}`} data-tour-ui data-x={moves[id]!.x} data-y={moves[id]!.y} data-z={moves[id]!.z} disabled={!!targetId} onClick={() => useTourStore.getState().move(id)} aria-label={`${dir.text} 이동 지점 ${dir.distance}미터`} style={{ visibility: 'hidden', transform: 'translate(-50%, -50%)' }} className={`absolute grid h-12 w-16 place-items-center rounded-[50%] border-2 border-white text-3xl font-black text-white shadow-lg transition hover:scale-110 ${route[1] === id ? 'bg-emerald-600/90' : 'bg-slate-700/70'}`}><span style={{ transform: `rotate(${dir.angle}deg)` }}>↑</span></button>; })}
    {mapOpen && <aside data-tour-ui className="absolute bottom-36 right-3 hidden w-44 rounded-2xl border border-white/80 bg-white/90 p-3 shadow-lg backdrop-blur sm:block sm:right-5" aria-label="투어 미니맵">
      <div className="mb-1 flex justify-between text-xs font-semibold"><span>캠퍼스 미니맵</span><span>북 ↑</span></div>
      <svg viewBox="-140 -280 280 630" className="h-56 w-full" role="img" aria-label={`현재 ${tourBuildingName(nearest)} 주변. 초록색은 안내 경로입니다.`}>
        <polygon points={campus.boundary.map(p => p.join(',')).join(' ')} fill="#ecf1df" />
        {campus.buildings.map(b => <polygon key={b.id} points={b.footprint.map(p => p.join(',')).join(' ')} fill="#b4c7be" />)}
        {network.segments.map(([a, b]) => <line key={`${a}-${b}`} x1={network.nodes[a]!.x} y1={network.nodes[a]!.z} x2={network.nodes[b]!.x} y2={network.nodes[b]!.z} stroke="#a5b5b0" strokeWidth="2" />)}
        {route.length > 0 && <polyline points={route.map(id => `${network.nodes[id]!.x},${network.nodes[id]!.z}`).join(' ')} fill="none" stroke="#059669" strokeWidth="5" />}
        {visited.map(id => <circle key={id} cx={network.nodes[id]!.x} cy={network.nodes[id]!.z} r="2.3" fill="#42ad8a" />)}
        <circle cx={n.x} cy={n.z} r="8" fill="#047857" stroke="white" strokeWidth="3" /><path d="M0 -17 L-6 -7 L6 -7 Z" fill="#047857" transform={`translate(${n.x} ${n.z}) rotate(${-yaw * 180 / Math.PI})`} />
      </svg><p className="text-[10px] text-slate-500">지형·외관을 단순화한 3D 재현</p>
    </aside>}
    <footer data-tour-ui className="absolute bottom-5 left-3 right-3 mx-auto max-w-2xl rounded-2xl bg-white/95 p-3 text-center shadow-xl backdrop-blur sm:bottom-7">
      <p className="mb-2 text-xs text-slate-500" aria-live="polite">{targetId ? '도로를 따라 이동 중…' : '기본 이동 30m · 갈림길·도착 지점에서는 정지 · 드래그로 둘러보기'}</p>
      <div className="flex flex-wrap justify-center gap-2">{n.neighbors.map(id => { const dir = direction(id); return <button key={id} className={`${button} ${route[1] === id ? '!border-emerald-500 !bg-emerald-50 !text-emerald-800' : ''}`} disabled={!!targetId} onClick={() => useTourStore.getState().move(id)}><span aria-hidden style={{ display: 'inline-block', transform: `rotate(${dir.angle}deg)` }}>↑</span> {dir.text} {dir.distance}m</button>; })}<button className={`${button} hidden sm:block`} aria-pressed={mapOpen} onClick={() => setMapOpen(v => !v)}>지도 {mapOpen ? '접기' : '펴기'}</button></div>
    </footer>
    </>}
    <p className="pointer-events-none absolute bottom-1 left-3 rounded bg-white/70 px-1 text-[9px] text-slate-600">{campus.attribution}</p>
  </div>;
}
