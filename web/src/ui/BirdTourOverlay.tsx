import { useEffect, useMemo, useRef, useState } from 'react';
import { BIRD_TOUR_TITLE, birdTourFor } from '../features/tour/birdTour';
import { birdClock, useBirdTourStore } from '../store/useBirdTourStore';
import { useCampusStore } from '../store/useCampusStore';
import { useTourStore } from '../store/useTourStore';
import { TourViewTabs } from './TourViewTabs';

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const glass = 'border border-white/20 bg-slate-950/35 text-white shadow-lg backdrop-blur-md';
const control = 'grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/25 bg-white/10 text-white transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white';

/**
 * 새의 시점 자동 투어 화면. 발표 중 화면을 가리지 않도록 조작 UI는 반투명이며,
 * 재생 중 마우스를 멈추면 사라진다. 자막(제목·하이라이트)은 영상의 일부로 남는다.
 */
export function BirdTourOverlay() {
  const campus = useCampusStore(s => s.campus)!;
  const tour = useMemo(() => birdTourFor(campus), [campus]);
  const time = useBirdTourStore(s => s.time);
  const playing = useBirdTourStore(s => s.playing);
  const caption = useBirdTourStore(s => s.caption);
  const uiHidden = useBirdTourStore(s => s.uiHidden);
  const [awake, setAwake] = useState(true);
  const exit = useRef<HTMLButtonElement>(null);
  const finished = !playing && time >= tour.duration - 0.05;
  const chromeVisible = !uiHidden && (awake || !playing);
  const hold = tour.holds.find(h => time >= h.t0 && time <= h.t1);

  useEffect(() => {
    exit.current?.focus({ preventScroll: true });
    return () => { useBirdTourStore.getState().pause(); document.getElementById('tour-launcher-focus')?.focus(); };
  }, []);
  useEffect(() => {
    let timer = 0;
    const wake = () => { setAwake(true); window.clearTimeout(timer); timer = window.setTimeout(() => setAwake(false), 2600); };
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
      const store = useBirdTourStore.getState();
      if (e.code === 'Space') { e.preventDefault(); store.toggle(); }
      else if (e.code === 'KeyH') store.setUiHidden(!store.uiHidden);
      else if (e.code === 'ArrowRight') store.seek(birdClock.t + 5);
      else if (e.code === 'ArrowLeft') store.seek(birdClock.t - 5);
      else if (e.code === 'Home') { store.seek(0); store.play(); }
      else return;
      wake();
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', onKey); };
  }, []);

  const fade = (show: boolean) => `transition-opacity duration-500 ${show ? 'opacity-100' : 'pointer-events-none opacity-0'}`;
  return <div className={`absolute inset-0 z-20 select-none text-white ${chromeVisible ? '' : 'cursor-none'}`} role="region" aria-label="새의 시점 캠퍼스 자동 투어">
    <header className={`absolute left-3 right-3 top-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5 sm:left-5 sm:right-5 sm:top-5 ${glass} ${fade(chromeVisible)}`}>
      <div>
        <p className="text-[10px] font-bold tracking-[0.22em] text-sky-200">HANSEI CAMPUS FLIGHT</p>
        <h1 className="text-base font-extrabold sm:text-lg">새의 시점 투어</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TourViewTabs tone="glass" />
        <button ref={exit} type="button" className="rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/25" onClick={() => useTourStore.getState().stop()}>투어 종료</button>
      </div>
    </header>

    {caption?.kind === 'title' && <div key="title" className="bird-caption-in pointer-events-none absolute inset-x-0 top-[30%] text-center [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]">
      <p className="text-xs font-bold tracking-[0.5em] text-sky-100 sm:text-sm">{BIRD_TOUR_TITLE.eyebrow}</p>
      <h2 className="mt-2 text-4xl font-black tracking-tight sm:text-6xl">{caption.title}</h2>
      <p className="mt-3 text-sm font-medium text-white/90 sm:text-lg">{caption.detail}</p>
    </div>}

    {caption && caption.kind !== 'title' && <div key={`${caption.kind}-${caption.id}`} aria-live="polite" className="bird-caption-in pointer-events-none absolute bottom-44 left-4 max-w-[min(30rem,calc(100%-2rem))] sm:left-8 min-[1100px]:bottom-32">
      <div className="border-l-4 border-sky-300 pl-4 [text-shadow:0_2px_14px_rgba(0,0,0,0.6)]">
        <p className="text-[11px] font-bold tracking-[0.3em] text-sky-200">HIGHLIGHT</p>
        <h2 className="text-3xl font-black sm:text-5xl">{caption.title}</h2>
        {caption.detail && <p className="mt-1 text-sm font-medium text-white/90 sm:text-base">{caption.detail}</p>}
      </div>
      {hold?.id === caption.id && <div className="ml-5 mt-3 h-1 w-40 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label={`${caption.title} 머무는 시간`} aria-valuemin={0} aria-valuemax={8} aria-valuenow={Math.round(time - hold.t0)}>
        <div className="h-full rounded-full bg-sky-300 transition-[width] duration-100 ease-linear" style={{ width: `${Math.min(100, (time - hold.t0) / (hold.t1 - hold.t0) * 100)}%` }} />
      </div>}
    </div>}

    {finished && !uiHidden && <div className={`absolute left-1/2 top-1/2 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 text-center ${glass}`}>
      <p className="text-xs font-bold tracking-[0.3em] text-sky-200">FLIGHT COMPLETE</p>
      <h2 className="mt-1 text-2xl font-extrabold">본관으로 돌아왔어요</h2>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-900" onClick={() => { useBirdTourStore.getState().seek(0); useBirdTourStore.getState().play(); }}>다시 보기</button>
        <button type="button" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-semibold" onClick={() => useTourStore.getState().setView('street')}>거리뷰로 둘러보기</button>
      </div>
    </div>}

    <footer className={`absolute bottom-16 left-3 right-3 rounded-2xl px-4 py-3 sm:left-5 sm:right-5 min-[1100px]:bottom-6 min-[1100px]:right-[17rem] ${glass} ${fade(chromeVisible)}`}>
      <div className="flex items-center gap-3">
        <button type="button" className={control} onClick={() => useBirdTourStore.getState().toggle()} aria-label={playing ? '일시정지' : '재생'} title={playing ? '일시정지 (Space)' : '재생 (Space)'}>
          {playing ? <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
            : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M4 2.5v11l9.5-5.5z" /></svg>}
        </button>
        <button type="button" className={control} onClick={() => { useBirdTourStore.getState().seek(0); useBirdTourStore.getState().play(); }} aria-label="처음부터" title="처음부터 (Home)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M3 3v4h4" /><path d="M3.5 7A5 5 0 1 1 5 11.5" /></svg>
        </button>
        <div className="relative min-w-0 flex-1 pb-5">
          <input type="range" min={0} max={tour.duration} step={0.1} value={time} aria-label="투어 진행 위치" aria-valuetext={`${clock(time)} / ${clock(tour.duration)}`}
            onChange={e => useBirdTourStore.getState().seek(Number(e.target.value))} className="w-full accent-sky-300" />
          {tour.chapters.map(c => <button key={`${c.id}-${c.t}`} type="button" onClick={() => useBirdTourStore.getState().seek(c.t)} title={`${c.label}부터 보기`}
            className={`absolute top-6 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold sm:text-[11px] ${time >= c.t ? 'text-sky-200' : 'text-white/60'} hover:text-white`} style={{ left: `${c.t / tour.duration * 100}%` }}>
            {/* 출발 직후 첫 건물과 겹치지 않게 출발점은 점으로만 표시한다 */}
            {c.t > 0 && <span className="hidden md:inline">{c.label}</span>}<span className={c.t > 0 ? 'md:hidden' : ''}>•</span>
          </button>)}
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-white/85">{clock(time)} / {clock(tour.duration)}</span>
        <button type="button" className="hidden shrink-0 rounded-lg border border-white/25 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/15 sm:block" onClick={() => useBirdTourStore.getState().setUiHidden(true)} title="화면 UI 숨기기 (H)">UI 숨기기 · H</button>
      </div>
    </footer>
    <p className="pointer-events-none absolute bottom-1 left-3 rounded bg-black/30 px-1 text-[9px] text-white/80">{campus.attribution}</p>
  </div>;
}
