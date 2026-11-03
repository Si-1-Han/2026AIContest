import { DEFAULT_FROM_ID } from '../config';
import { useCampusStore } from '../store/useCampusStore';

export function BuildingPanel() {
  const selectedId = useCampusStore((s) => s.selectedId);
  const route = useCampusStore((s) => s.route);
  const building = useCampusStore((s) => s.building);
  const select = useCampusStore((s) => s.select);
  const navigate = useCampusStore((s) => s.navigate);
  const clearRoute = useCampusStore((s) => s.clearRoute);

  const b = building(selectedId);
  if (!b) return null;
  const from = building(route?.fromId ?? null);
  const defaultFrom = building(DEFAULT_FROM_ID);

  return (
    <aside className="absolute right-5 top-5 w-80 rounded-2xl border border-white/10 bg-[#0d1528]/85 p-5 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-accent/80">BUILDING</p>
          <h2 className="mt-0.5 text-2xl font-bold text-white">{b.name}</h2>
        </div>
        <button
          className="rounded-full px-2 text-lg text-slate-400 hover:bg-white/10 hover:text-white"
          onClick={() => {
            clearRoute();
            select(null);
          }}
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
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

      {route?.toId === b.id ? (
        <div className="mt-5 rounded-xl border border-route/40 bg-route/10 p-4">
          <p className="text-xs text-route">{from?.name ?? '출발지'}에서 출발</p>
          <p className="mt-1 text-xl font-bold text-white">
            {route.length}m · 도보 약 {route.minutes}분
          </p>
          <button
            className="mt-3 text-xs text-slate-300 underline-offset-4 hover:underline"
            onClick={clearRoute}
          >
            경로 지우기
          </button>
        </div>
      ) : (
        b.id !== DEFAULT_FROM_ID && (
          <button
            className="mt-5 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-[#06101f] shadow-[0_0_24px_rgba(79,209,255,0.45)] transition hover:brightness-110"
            onClick={() => navigate(null, b.id)}
          >
            여기로 길찾기 {defaultFrom && <span className="font-normal">({defaultFrom.name} 출발)</span>}
          </button>
        )
      )}
    </aside>
  );
}
