import { useMemo } from 'react';
import { josa } from '../features/guide/fallbackMatcher';
import { useCampusStore } from '../store/useCampusStore';
import type { Building, InteriorFloor, Room } from '../types/generated/campus';

/** 오른쪽 패널: 건물 → 층 → 강의실 순서로 내용이 바뀐다 */
export function BuildingPanel() {
  const selectedId = useCampusStore((s) => s.selectedId);
  const floorIndex = useCampusStore((s) => s.floorIndex);
  const selectedRoomId = useCampusStore((s) => s.selectedRoomId);
  const route = useCampusStore((s) => s.route);
  const b = useCampusStore((s) => s.building(selectedId));
  const interior = useCampusStore((s) => (selectedId ? s.interiors[selectedId] : undefined));
  const room = useCampusStore((s) => s.room(selectedRoomId));
  const select = useCampusStore((s) => s.select);
  const back = useCampusStore((s) => s.back);

  if (!b) return null;
  const floor = floorIndex !== null ? interior?.floors[floorIndex] : undefined;

  return (
    <aside className="absolute right-5 top-5 z-40 flex max-h-[calc(100%-8.5rem)] w-[22rem] flex-col rounded-2xl border border-white/10 bg-[#0d1528]/88 shadow-2xl backdrop-blur-md">
      <header className="flex items-start justify-between gap-2 border-b border-white/10 p-5 pb-4">
        <div className="min-w-0">
          <Breadcrumb building={b} floor={floor} room={room} />
          <h2 className="mt-1 truncate text-2xl font-bold text-white">
            {room ? room.name : floor ? `${b.name} ${floor.label}` : b.name}
          </h2>
        </div>
        <div className="flex shrink-0 gap-1">
          {(floor || room) && (
            <button
              className="rounded-full px-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={back}
              aria-label="뒤로"
              title="뒤로 (Esc)"
            >
              ←
            </button>
          )}
          <button
            className="rounded-full px-2 text-lg text-slate-400 hover:bg-white/10 hover:text-white"
            onClick={() => select(null)}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-4">
        {room ? (
          <RoomDetail room={room} floor={floor} />
        ) : floor ? (
          <FloorDetail floor={floor} />
        ) : (
          <BuildingDetail building={b} loading={b.has_interior && !interior} />
        )}
        <RouteBox building={b} route={route} roomName={room?.name} />
      </div>
    </aside>
  );
}

function Breadcrumb({ building, floor, room }: { building: Building; floor?: InteriorFloor; room?: Room }) {
  const select = useCampusStore((s) => s.select);
  const selectFloor = useCampusStore((s) => s.selectFloor);
  const parts: { label: string; onClick?: () => void }[] = [{ label: '캠퍼스', onClick: () => select(null) }];
  parts.push({ label: building.name, onClick: floor ? () => selectFloor(null) : undefined });
  if (floor) parts.push({ label: floor.label, onClick: room ? () => selectFloor(floor.index) : undefined });
  return (
    <p className="flex flex-wrap items-center gap-1 text-[11px] font-semibold tracking-wide text-accent/80">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-500">›</span>}
          {p.onClick ? (
            <button className="hover:text-white hover:underline" onClick={p.onClick}>
              {p.label}
            </button>
          ) : (
            <span className="text-slate-300">{p.label}</span>
          )}
        </span>
      ))}
    </p>
  );
}

function BuildingDetail({ building: b, loading }: { building: Building; loading: boolean }) {
  const selectFloor = useCampusStore((s) => s.selectFloor);
  const floorsTopDown = [...b.floors].reverse();
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-white/5 p-3">
          <dt className="text-slate-400">지상</dt>
          <dd className="font-semibold text-white">
            {b.levels}층{b.levels_estimated && <span className="ml-1 text-xs text-amber-300">추정</span>}
          </dd>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <dt className="text-slate-400">지하</dt>
          <dd className="font-semibold text-white">{b.basements}층</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        {b.description || '건물 소개는 준비 중이에요.'}
      </p>

      {b.floors.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-xs font-semibold tracking-widest text-slate-400">
            층 선택 {loading && <span className="font-normal">· 불러오는 중…</span>}
          </h3>
          <div className="grid grid-cols-4 gap-2">
            {floorsTopDown.map((f) => (
              <button
                key={f.index}
                onClick={() => selectFloor(f.index)}
                className="rounded-xl border border-white/10 bg-white/5 py-2 text-center transition hover:border-accent/60 hover:bg-accent/15"
              >
                <div className="text-sm font-bold text-white">{f.label}</div>
                <div className="text-[10px] text-slate-400">{f.room_count}개 공간</div>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const FACILITY_ORDER: [string, string][] = [
  ['화장실', '🚻'],
  ['엘리베이터', '🛗'],
  ['계단', '↕'],
  ['출입구', '🚪'],
];

function FloorDetail({ floor }: { floor: InteriorFloor }) {
  const selectRoom = useCampusStore((s) => s.selectRoom);
  const hoverRoom = useCampusStore((s) => s.hoverRoom);
  const hoveredRoomId = useCampusStore((s) => s.hoveredRoomId);

  const { spaces, facilities } = useMemo(() => {
    const spaces = floor.rooms
      .filter((r) => r.category === '공간')
      .sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    const facilities = FACILITY_ORDER.map(([name, icon]) => ({
      name,
      icon,
      count: floor.rooms.filter((r) => r.category === '시설물' && r.name.includes(name)).length,
    })).filter((f) => f.count > 0);
    return { spaces, facilities };
  }, [floor]);

  return (
    <>
      {facilities.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {facilities.map((f) => (
            <span key={f.name} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              {f.icon} {f.name} {f.count}
            </span>
          ))}
        </div>
      )}
      <h3 className="mb-2 text-xs font-semibold tracking-widest text-slate-400">
        공간 {spaces.length}개
      </h3>
      {spaces.length === 0 ? (
        <p className="text-sm text-slate-400">이 층에 등록된 공간이 없어요.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5">
          {spaces.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => selectRoom(r.id)}
                onMouseEnter={() => hoverRoom(r.id)}
                onMouseLeave={() => hoverRoom(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                  hoveredRoomId === r.id ? 'bg-accent/20 text-white' : 'bg-white/5 text-slate-200 hover:bg-white/10'
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RoomDetail({ room, floor }: { room: Room; floor?: InteriorFloor }) {
  const types = room.type.split(',').filter(Boolean);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {floor && (
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
            {floor.label}
          </span>
        )}
        {types.map((t) => (
          <span key={t} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300">
            {t}
          </span>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        {room.description || (room.category === '시설물' ? '편의 시설이에요.' : '상세 설명은 준비 중이에요.')}
      </p>
    </>
  );
}

function RouteBox({
  building,
  route,
  roomName,
}: {
  building: Building;
  route: ReturnType<typeof useCampusStore.getState>['route'];
  roomName?: string;
}) {
  const roomId = useCampusStore((s) => s.selectedRoomId);
  const openPlanner = useCampusStore((s) => s.openPlanner);
  const from = useCampusStore((s) => s.building(route?.fromId ?? null));
  const endpoint = { buildingId: building.id, roomId: roomName ? roomId : null };
  const target = roomName ?? building.name;

  return (
    <>
      {route?.toId === building.id && (
        <div className="mt-5 rounded-xl border border-route/40 bg-route/10 p-4">
          <p className="text-xs text-route">{from?.name ?? '출발지'}에서 출발</p>
          <p className="mt-1 text-xl font-bold text-white">
            {route.length}m · 도보 약 {route.minutes}분
          </p>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          className="rounded-xl border border-[#ffd166]/50 bg-[#ffd166]/10 px-3 py-2.5 text-sm font-semibold text-[#ffd166] transition hover:bg-[#ffd166]/20"
          onClick={() => openPlanner({ from: endpoint })}
          title={`${target}에서 출발`}
        >
          출발
        </button>
        <button
          className="rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-[#06101f] shadow-[0_0_24px_rgba(79,209,255,0.45)] transition hover:brightness-110"
          onClick={() => openPlanner({ to: endpoint })}
          title={`${josa(target, '으로', '로')} 도착`}
        >
          도착
        </button>
      </div>
    </>
  );
}
