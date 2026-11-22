import { useTourStore, type TourView } from '../store/useTourStore';

const VIEWS: { id: TourView; label: string; short: string }[] = [
  { id: 'street', label: '거리뷰', short: '거리뷰' },
  { id: 'flight', label: '공중 자유 시점', short: '자유 시점' },
  { id: 'bird', label: '새의 시점 투어', short: '새의 시점' },
];

/** 투어 시점 전환 탭. 세 시점을 한 줄에 나란히 둔다. */
export function TourViewTabs({ tone = 'light' }: { tone?: 'light' | 'glass' }) {
  const view = useTourStore(s => s.view);
  const moving = useTourStore(s => !!s.targetId);
  const shell = tone === 'glass' ? 'border-white/25 bg-white/10' : 'border-emerald-200 bg-emerald-50/80';
  const idle = tone === 'glass' ? 'text-white/80 hover:bg-white/15' : 'text-slate-600 hover:bg-white';
  const active = tone === 'glass' ? 'bg-white text-slate-900 shadow' : 'bg-emerald-700 text-white shadow';
  return <div role="tablist" aria-label="투어 시점" className={`flex rounded-xl border p-1 ${shell}`}>
    {VIEWS.map(v => <button key={v.id} type="button" role="tab" aria-selected={view === v.id} disabled={moving && view !== v.id}
      onClick={() => useTourStore.getState().setView(v.id)}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-40 ${view === v.id ? active : idle}`}>
      <span className="hidden sm:inline">{v.label}</span><span className="sm:hidden">{v.short}</span>
    </button>)}
  </div>;
}
