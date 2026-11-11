import { useEffect, useRef, useState } from 'react';

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    setError(false);
    try {
      await audio.play();
    } catch {
      setError(true);
    }
  }

  return (
    <div className="pointer-events-auto mt-3 w-fit rounded-xl border border-white/15 bg-slate-950/80 px-3 py-2 text-xs text-slate-200">
      <audio
        ref={audioRef}
        src={`${import.meta.env.BASE_URL}music/main-theme.mp3`}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError(true); }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-pressed={playing}
          className="rounded px-1 py-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {playing ? 'Ⅱ BGM 일시정지' : '▶ BGM 재생'}
        </button>
        <label className="flex items-center gap-2">
          <span>볼륨</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="w-20 accent-accent"
          />
        </label>
      </div>
      {error && <p role="status" className="mt-1 text-amber-200">음악을 재생하지 못했어요. 다시 눌러 주세요.</p>}
    </div>
  );
}
