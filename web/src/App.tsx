import { useEffect } from 'react';
import { CampusScene } from './scene/CampusScene';
import { useCampusStore } from './store/useCampusStore';
import { BuildingPanel } from './ui/BuildingPanel';
import { GuideBox } from './ui/GuideBox';
import { Hud } from './ui/Hud';

export default function App() {
  const status = useCampusStore((s) => s.status);
  const error = useCampusStore((s) => s.error);
  const load = useCampusStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  // Esc: 강의실 → 층 → 건물 → 캠퍼스 순서로 뒤로
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) useCampusStore.getState().back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <main className="relative h-full w-full">
      <CampusScene />
      <Hud />
      {status === 'ready' && (
        <>
          <BuildingPanel />
          <GuideBox />
        </>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-slate-300">
          캠퍼스를 불러오는 중…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center text-red-300">
          데이터를 불러오지 못했어요: {error}
        </div>
      )}
    </main>
  );
}
