import { useCampusStore } from '../store/useCampusStore';

export function Hud() {
  const source = useCampusStore((s) => s.source);
  const count = useCampusStore((s) => s.campus?.buildings.length ?? 0);
  const attribution = useCampusStore((s) => s.campus?.attribution);

  return (
    <>
      <header className="pointer-events-none absolute left-5 top-5 select-none">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent/80">HANSEI UNIVERSITY</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_0_18px_rgba(79,209,255,0.35)]">
          한세 3D 캠퍼스
        </h1>
        <p className="mt-1 text-sm text-slate-300/80">건물을 클릭하거나, 아래에 가고 싶은 곳을 물어보세요.</p>
        {source && (
          <div className="mt-3 flex gap-2 text-[11px] text-slate-300/90">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
              건물 {count}개
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
              데이터: {source === 'api' ? 'Campus API' : '정적 JSON'}
            </span>
          </div>
        )}
      </header>
      {attribution && (
        <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-400/70">
          {attribution}
        </p>
      )}
    </>
  );
}
