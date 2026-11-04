import { useMemo, useRef, useState } from 'react';
import { COLORS } from '../config';
import { searchPlaces } from '../features/navigation/placeSearch';
import { useCampusStore, type Endpoint, type EndpointSlot } from '../store/useCampusStore';

const SLOT_LABEL: Record<EndpointSlot, string> = { from: '출발', to: '도착' };
const SLOT_COLOR: Record<EndpointSlot, string> = { from: COLORS.origin, to: COLORS.route };

/** 지도 앱식 길찾기: 출발 → 도착을 지도 클릭이나 검색으로 고르면 바로 안내 */
export function RoutePlanner() {
  const planner = useCampusStore((s) => s.planner);
  const route = useCampusStore((s) => s.route);
  const openPlanner = useCampusStore((s) => s.openPlanner);
  const closePlanner = useCampusStore((s) => s.closePlanner);
  const swapEndpoints = useCampusStore((s) => s.swapEndpoints);

  if (!planner.open) {
    return (
      <button
        onClick={() => openPlanner()}
        className="absolute left-5 top-[9.5rem] z-40 flex items-center gap-2 rounded-xl border border-accent/40 bg-[#0d1528]/85 px-4 py-2.5 text-sm font-semibold text-white shadow-xl backdrop-blur-md transition hover:border-accent hover:bg-accent/15"
      >
        <span>🧭</span> 길찾기
      </button>
    );
  }

  const hint =
    planner.active === 'from'
      ? '지도에서 출발할 건물을 클릭하거나 검색하세요'
      : planner.active === 'to'
        ? '지도에서 도착할 건물을 클릭하거나 검색하세요'
        : null;

  return (
    <section className="absolute left-5 top-[9.5rem] z-40 w-[20rem] rounded-2xl border border-white/10 bg-[#0d1528]/90 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-white">🧭 길찾기</h2>
        <button
          onClick={closePlanner}
          className="rounded-full px-2 text-lg leading-none text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="길찾기 닫기"
        >
          ×
        </button>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <EndpointField slot="from" />
          <EndpointField slot="to" />
        </div>
        <button
          onClick={swapEndpoints}
          disabled={!planner.from && !planner.to}
          className="w-8 shrink-0 rounded-lg text-lg text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-30"
          aria-label="출발·도착 바꾸기"
          title="출발·도착 바꾸기"
        >
          ⇅
        </button>
      </div>

      {hint && (
        <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs text-accent">
          <span className="animate-pulse">●</span> {hint}
        </p>
      )}
      {planner.error && (
        <p className="mt-2.5 rounded-lg bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-200">
          {planner.error}
        </p>
      )}
      {route && !planner.error && (
        <div className="mt-2.5 rounded-xl border border-route/40 bg-route/10 px-3 py-2.5">
          <p className="text-xl font-bold text-white">
            {route.length}m <span className="text-base font-semibold text-slate-300">· 도보 약 {route.minutes}분</span>
          </p>
        </div>
      )}
    </section>
  );
}

function useEndpointName(endpoint: Endpoint | null): { title: string; subtitle?: string } | null {
  const building = useCampusStore((s) => (endpoint ? s.building(endpoint.buildingId) : undefined));
  const room = useCampusStore((s) =>
    endpoint?.roomId ? s.rooms?.rooms.find((r) => r.id === endpoint.roomId) : undefined,
  );
  if (!endpoint || !building) return null;
  return room
    ? { title: room.name, subtitle: `${building.name} ${room.floor_label}` }
    : { title: building.name };
}

function EndpointField({ slot }: { slot: EndpointSlot }) {
  const endpoint = useCampusStore((s) => s.planner[slot]);
  const active = useCampusStore((s) => s.planner.active === slot);
  const setActiveSlot = useCampusStore((s) => s.setActiveSlot);
  const setEndpoint = useCampusStore((s) => s.setEndpoint);
  const index = useCampusStore((s) => s.index);
  const rooms = useCampusStore((s) => s.rooms);
  const name = useEndpointName(endpoint);

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () =>
      focused && index && rooms ? searchPlaces(query, index.buildings, rooms.rooms) : [],
    [focused, query, index, rooms],
  );

  const choose = (e: Endpoint) => {
    setEndpoint(slot, e);
    setQuery('');
    setFocused(false);
    input.current?.blur();
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 transition ${
          active ? 'border-accent bg-accent/10 shadow-[0_0_16px_rgba(79,209,255,0.25)]' : 'border-white/10 bg-white/5'
        }`}
        onClick={() => setActiveSlot(slot)}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SLOT_COLOR[slot] }} />
        <span className="w-7 shrink-0 text-xs font-semibold text-slate-400">{SLOT_LABEL[slot]}</span>
        <input
          ref={input}
          value={focused ? query : ''}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setActiveSlot(slot);
          }}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) choose(results[0]);
            if (e.key === 'Escape') input.current?.blur();
          }}
          placeholder={
            name && !focused ? '' : focused ? '건물·강의실 검색' : '지도에서 선택 또는 검색'
          }
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        {name && !focused && (
          <span className="pointer-events-none absolute left-[4.6rem] right-8 truncate text-sm font-semibold text-white">
            {name.title}
            {name.subtitle && <span className="ml-1.5 text-xs font-normal text-slate-400">{name.subtitle}</span>}
          </span>
        )}
        {endpoint && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEndpoint(slot, null);
            }}
            className="shrink-0 rounded px-1 text-slate-500 hover:text-white"
            aria-label={`${SLOT_LABEL[slot]} 지우기`}
          >
            ×
          </button>
        )}
      </div>

      {focused && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#0b1222]/95 py-1 shadow-2xl backdrop-blur">
          {results.map((p) => (
            <li key={p.roomId ?? p.buildingId}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose({ buildingId: p.buildingId, roomId: p.roomId })}
                className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm text-slate-100 hover:bg-accent/15"
              >
                <span className="truncate font-medium">{p.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{p.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
