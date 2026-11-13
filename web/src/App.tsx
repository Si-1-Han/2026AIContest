import { useCallback, useEffect, useState } from 'react';
import { AdminAccess } from './ui/AdminAccess';
import { notifyDataUpdated, onDataUpdated } from './data/dataUpdates';
import { CampusScene } from './scene/CampusScene';
import { useCampusStore } from './store/useCampusStore';
import { BuildingPanel } from './ui/BuildingPanel';
import { GuideBox } from './ui/GuideBox';
import { Hud } from './ui/Hud';
import { BackgroundMusic } from './ui/BackgroundMusic';
import { RoutePlanner } from './ui/RoutePlanner';

export default function App() {
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const closeAdmin = useCallback(() => setAdminOpen(false), []);
  const status = useCampusStore((s) => s.status);
  const error = useCampusStore((s) => s.error);
  const load = useCampusStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => useCampusStore.getState().watchApi(), []);

  useEffect(() => {
    let refreshing = false;
    let pending = false;
    const reload = async () => {
      if (refreshing) { pending = true; return; }
      refreshing = true;
      try {
        do { pending = false; await useCampusStore.getState().refresh(); } while (pending);
      } finally { refreshing = false; }
    };
    const unsubscribe = onDataUpdated((kind) => { if (kind !== 'courses') void reload(); });
    const onHotUpdate = () => notifyDataUpdated();
    import.meta.hot?.on('campus:data-updated', onHotUpdate);
    return () => {
      unsubscribe();
      import.meta.hot?.off('campus:data-updated', onHotUpdate);
    };
  }, []);

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
      {/* 3D 라벨(Html)이 화면 UI 위로 올라오지 않도록 장면을 별도 레이어로 분리 */}
      <div className="absolute inset-0 isolate z-0">
        <CampusScene />
      </div>
      <Hud onAdminOpen={() => setAdminOpen(true)} adminUser={adminUser} />
      <AdminAccess open={adminOpen} onClose={closeAdmin} user={adminUser} setUser={setAdminUser} />
      <BackgroundMusic />
      {status === 'ready' && (
        <>
          <RoutePlanner />
          <BuildingPanel adminUser={adminUser} />
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
