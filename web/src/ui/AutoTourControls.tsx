import { useEffect, useRef } from 'react';
import { AUTO_TOUR_ENDING, autoTourChapter } from '../features/tour/autoTour';
import { AUTO_TOUR_LENGTH, autoTourFrame } from '../features/tour/autoTourHighlights';
import { tourBuildingName } from '../features/tour/buildingName';
import { useCampusStore } from '../store/useCampusStore';
import { useTourStore } from '../store/useTourStore';

const action = 'rounded-md px-2.5 py-2 text-xs font-semibold text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 sm:px-3 sm:text-sm';
const timeLabel = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value) % 60).padStart(2, '0')}`;

export function AutoTourControls() {
  const auto = useTourStore(state => state.auto)!;
  const close = useRef<HTMLButtonElement>(null);
  const frame = autoTourFrame(auto.seconds);
  const building = useCampusStore(state => state.campus?.buildings.find(b => b.id === frame.highlight?.id));
  const chapter = autoTourChapter(frame.routeTime);
  const opening = chapter.at === 0;
  const ending = chapter.at === AUTO_TOUR_ENDING;

  useEffect(() => { close.current?.focus({ preventScroll: true }); }, []);

  return <section aria-label="캠퍼스 자동 투어" className="pointer-events-none absolute inset-0 z-20 select-none text-white">
    {frame.fade > 0 && <div aria-hidden="true" className="absolute inset-0 bg-slate-950" style={{ opacity: frame.fade }} />}
    {auto.phase === 'loading' && <div role="status" className="absolute inset-0 grid place-items-center bg-slate-950 text-sm font-semibold text-white">자동 투어를 준비하고 있어요</div>}
    <header className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 px-3 pt-3 sm:px-6 sm:pt-5">
      {!building && <div className="rounded-lg bg-slate-950/70 px-3 py-2 text-sm font-semibold shadow-sm backdrop-blur-sm" aria-live="polite">{opening || ending ? '한세대학교 · 첫 날갯짓' : chapter.place}</div>}
      <div className="pointer-events-auto ml-auto flex items-center rounded-lg bg-slate-950/75 p-1 shadow-sm backdrop-blur-sm">
        <button type="button" className={action} disabled={auto.phase === 'loading' || auto.phase === 'finished'} onClick={() => useTourStore.getState().toggleAutoPause()}>{auto.phase === 'paused' ? '계속 재생' : '일시정지'}</button>
        <button type="button" className={action} onClick={() => useTourStore.getState().restartAuto()}>다시 시작</button>
        <button type="button" ref={close} className={action} onClick={() => useTourStore.getState().exitAuto()}>자동 투어 종료</button>
      </div>
    </header>
    {auto.phase !== 'loading' && <>
      {building && <div className="absolute bottom-[13%] left-4 max-w-[calc(100%_-_2rem)] sm:left-8 lg:left-10" style={{ opacity: frame.caption }} aria-live="polite">
        <div className="border-l-2 border-sky-200 bg-gradient-to-r from-slate-950/75 to-slate-950/0 py-1.5 pl-3 pr-8 [text-shadow:0_1px_8px_rgb(0_0_0_/_0.9)] sm:pl-4">
          <h2 className="text-3xl leading-none font-bold tracking-tight sm:text-4xl lg:text-5xl">{tourBuildingName(building)}</h2>
          {building.description && <p className="mt-2 text-xs leading-relaxed font-medium text-white/95 sm:text-sm lg:text-base">{building.description}</p>}
        </div>
      </div>}
      {!building && chapter.title && <div className={`absolute right-3 [text-shadow:0_2px_12px_rgb(0_0_0_/_0.95),0_1px_2px_rgb(0_0_0_/_0.9)] ${opening ? 'bottom-12 left-4 text-left sm:bottom-16 sm:left-8' : 'bottom-[12%] left-3 text-center'}`} aria-live="polite">
        <p className={opening || ending ? 'text-xl font-bold tracking-tight sm:text-3xl' : 'text-lg font-bold sm:text-2xl'}>{chapter.title}</p>
        {chapter.detail && <p className="mt-1 text-xs font-medium text-white/95 sm:text-sm">{chapter.detail}</p>}
      </div>}
      <footer className="absolute inset-x-3 bottom-2 flex items-center gap-3 text-[11px] font-semibold tabular-nums sm:inset-x-6 sm:bottom-4">
        <span className="rounded bg-slate-950/75 px-2 py-1">{timeLabel(auto.seconds)} / {timeLabel(AUTO_TOUR_LENGTH)}</span>
        <progress aria-label="자동 투어 진행" className="h-1 flex-1 appearance-none overflow-hidden rounded-full bg-white/20 [&::-webkit-progress-bar]:bg-white/20 [&::-webkit-progress-value]:bg-sky-200 [&::-moz-progress-bar]:bg-sky-200" max={AUTO_TOUR_LENGTH} value={auto.seconds} />
      </footer>
    </>}
  </section>;
}
