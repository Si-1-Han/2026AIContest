import { useEffect, useRef, useState } from 'react';

import { useCampusStore } from '../store/useCampusStore';

const buildingThemes: Record<string, string> = {
  main: 'main-building-theme.mp3',
  science: 'science-theme.mp3',
  design: 'design-theme.mp3',
  gemi: 'gemi-theme.mp3',
  graduate: 'graduate-theme.mp3',
  music: 'music-theme.mp3',
  rodem: 'rodem-theme.mp3',
  student_union: 'student_union-theme.mp3',
  theology: 'theology-theme.mp3',
  vision: 'vision-theme.mp3',
  vision_center: 'vision_center-theme.mp3',
};

export function BackgroundMusic() {
  const selectedId = useCampusStore((state) => state.selectedId);
  const track = (selectedId && buildingThemes[selectedId]) || 'main-theme.mp3';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [volume, setVolume] = useState(0.25);
  const [muted, setMuted] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [error, setError] = useState(false);
  const silent = muted || volume === 0;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setError(false);
    let cancelled = false;
    const removeListeners = () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    const start = () => {
      if (cancelled) return;
      void audio.play().then(() => {
        if (cancelled) audio.pause();
        else removeListeners();
      }).catch(() => { /* Retry after a user gesture if autoplay is blocked. */ });
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    start();
    return () => {
      cancelled = true;
      removeListeners();
      audio.pause();
    };
  }, [track]);

  const circle = 'grid h-11 w-11 shrink-0 place-items-center rounded-full border shadow-lg backdrop-blur-md transition hover:border-accent/60 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const active = 'border-accent/50 bg-accent/15 text-accent';
  const inactive = 'border-white/15 bg-slate-950/80 text-slate-300';

  return (
    <div role="group" aria-label="배경음악 설정" className="pointer-events-auto absolute bottom-2 right-3 z-50 flex items-center gap-2 min-[1100px]:bottom-8 min-[1100px]:right-5">
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}music/${track}`}
        loop
        muted={muted}
        preload="none"
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={() => {
          if (silent) {
            setMuted(false);
            if (volume === 0) setVolume(0.25);
          } else setMuted(true);
        }}
        aria-pressed={silent}
        aria-label={silent ? '배경음악 음소거 해제' : '배경음악 음소거'}
        title={silent ? '음소거 해제' : '음소거'}
        className={`${circle} ${silent ? active : inactive}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5Z" />
          {silent ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></>}
        </svg>
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVolumeOpen((value) => !value)}
          aria-expanded={volumeOpen}
          aria-controls="bgm-volume"
          aria-label="배경음악 볼륨 조절"
          title="볼륨 조절"
          className={`${circle} ${volumeOpen ? active : inactive}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M6 3v5m0 4v9M12 3v10m0 4v4M18 3v2m0 4v12" />
            <path d="M3 8h6m0 5h6m0-8h6" />
          </svg>
        </button>
        {volumeOpen && (
          <div id="bgm-volume" onKeyDown={(event) => { if (event.key === 'Escape') setVolumeOpen(false); }} className="absolute bottom-full right-0 mb-3 w-44 rounded-2xl border border-white/15 bg-slate-950/95 p-4 text-xs text-slate-200 shadow-xl backdrop-blur-md">
            <label className="flex flex-col gap-3">
              <span className="flex justify-between"><span>볼륨</span><span>{Math.round(volume * 100)}%</span></span>
              <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} className="w-full accent-accent" />
            </label>
          </div>
        )}
      </div>
      {error && <p role="status" className="absolute bottom-full right-0 mb-3 w-52 rounded-xl bg-slate-950/95 p-3 text-xs text-amber-200">음악을 불러오지 못했어요.</p>}
    </div>
  );
}
