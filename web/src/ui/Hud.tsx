import { useCampusStore } from '../store/useCampusStore';

export function Hud() {
  const source = useCampusStore((s) => s.source);
  const count = useCampusStore((s) => s.campus?.buildings.length ?? 0);
  const attribution = useCampusStore((s) => s.campus?.attribution);
  const apiOnline = useCampusStore((s) => s.apiOnline);

  return (
    <>
      <header className="pointer-events-none absolute left-5 top-5 z-40 select-none">
        <p className="text-xs font-semibold tracking-[0.35em] text-accent/80">HANSEI UNIVERSITY</p>
        <div className="mt-1 flex items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}images/hansei.png`}
            alt="한세대학교 마크"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <h1 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_0_18px_rgba(79,209,255,0.35)]">
            한세 3D 캠퍼스
          </h1>
        </div>
        <p className="mt-1 text-sm text-slate-300/80">건물을 클릭하거나, 아래에 가고 싶은 곳을 물어보세요.</p>
        {source && (
          <div className="mt-3 flex gap-2 text-[11px] text-slate-300/90">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
              건물 {count}개
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
              데이터: {source === 'api' ? 'Campus API' : '정적 JSON'}
            </span>
            {apiOnline !== null && (
              <span
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                  apiOnline
                    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                    : 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                }`}
                title={apiOnline ? 'Python 경로 엔진 사용 중' : 'Python 서버가 꺼져 있어 브라우저 간이 계산을 사용해요'}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${apiOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                Python API {apiOnline ? '연결됨' : '꺼짐 · 간이 모드'}
              </span>
            )}
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
