import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { adminApi } from './adminClient';
import { RoomTypeSelect, roomTypeColor } from './RoomTypeSelect';

type RoomRecord = { id: string; name: string; type: string; description: string; tags: string[]; color: string; course_count: number };
type RoomData = { revision: string; building_name: string; floors: { index: number; label: string; rooms: RoomRecord[] }[] };
type Draft = { revision: string; floor_index: number; name: string; type: string; description: string; tags: string[]; color: string };
const button = 'rounded-xl border border-white/15 px-4 py-2 text-sm transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40';
const input = 'w-full rounded-lg border border-white/20 bg-[#141f32] px-3 py-2 text-sm text-white outline-accent';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-2 text-sm text-slate-300">{label}{children}</label>;
}

export function CampusRoomActions({ buildingId, roomId }: { buildingId: string; roomId: string }) {
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState<Draft>();
  const [location, setLocation] = useState('');
  const [courseCount, setCourseCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const path = `rooms/${encodeURIComponent(buildingId)}`;
  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);

  async function open(action: 'edit' | 'delete') {
    setMode(action); setDraft(undefined); setError(''); setBusy(true);
    try {
      const data = await adminApi<RoomData>(path);
      const floor = data.floors.find((f) => f.rooms.some((room) => room.id === roomId));
      const room = floor?.rooms.find((r) => r.id === roomId);
      if (!floor || !room) throw new Error('강의실을 찾을 수 없습니다. 선택한 호실을 다시 확인해 주세요.');
      setLocation(`${data.building_name} · ${floor.label}`);
      setCourseCount(room.course_count);
      setDraft({ revision: data.revision, floor_index: floor.index, name: room.name, type: room.type,
        description: room.description, tags: [...room.tags],
        color: roomTypeColor(room.type, room.color) });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  function update(patch: Partial<Draft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !mode || busy) return;
    setBusy(true); setError('');
    try {
      await adminApi(`${path}/${encodeURIComponent(roomId)}`, mode === 'edit' ? 'PUT' : 'DELETE',
        mode === 'edit' ? draft : { revision: draft.revision });
      setMode(null);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="flex items-center gap-0.5 border-r border-white/10 pr-1" role="group" aria-label="관리자 강의실 편집">
      <button type="button" disabled={busy} aria-label="강의실 수정" title="강의실 수정" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-accent/10 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40" onClick={() => void open('edit')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1 1-6Z" /></svg>
      </button>
      <button type="button" disabled={busy} aria-label="강의실 삭제" title="강의실 삭제" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-red-400/10 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-red-300 disabled:opacity-40" onClick={() => void open('delete')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="campus-room-edit-title" onKeyDown={(event) => event.stopPropagation()} onCancel={(event) => { if (busy) event.preventDefault(); else setMode(null); }} className="fixed inset-0 m-auto max-h-[85vh] w-[min(520px,calc(100%-32px))] overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white shadow-2xl backdrop:bg-black/70">
      <form onSubmit={(event) => void submit(event)}>
        <h2 id="campus-room-edit-title" className="text-xl font-bold">강의실 {mode === 'delete' ? '삭제' : '수정'}</h2>
        {draft && <p className="mb-5 mt-2 text-sm text-slate-400">{location} · {draft.name}</p>}
        {busy && !draft && <p role="status" className="my-5 text-sm text-slate-400">호실 정보를 불러오는 중…</p>}
        {draft && mode === 'edit' && <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="호실명"><input autoFocus required maxLength={100} className={input} value={draft.name} onChange={(event) => update({ name: event.target.value })} /></Field></div>
          <div className="sm:col-span-2"><RoomTypeSelect value={draft.type} color={draft.color} onChange={(type, color) => update({ type, color })} /></div>
          <div className="sm:col-span-2"><Field label="검색 별칭 (쉼표로 구분)"><input className={input} value={draft.tags.join(',')} onChange={(event) => update({ tags: event.target.value.split(',') })} /></Field></div>
          <div className="sm:col-span-2"><Field label="설명"><textarea rows={4} maxLength={3000} className={input} value={draft.description} onChange={(event) => update({ description: event.target.value })} /></Field></div>
          <p className="text-xs text-slate-400 sm:col-span-2">저장하면 지도와 시간표에 바로 반영됩니다. 호실의 도형과 수업 연결은 유지됩니다.</p>
        </fieldset>}
        {draft && mode === 'delete' && <div className="my-5 text-sm text-slate-300"><p>{draft.name}을 삭제하시겠습니까?</p><p className="mt-3 text-xs text-slate-400">삭제하면 지도에서 이 호실이 사라집니다.</p>{courseCount > 0 && <p className="mt-3 text-amber-200">배정된 수업이 {courseCount}개 있습니다. 수업 현황에서 다른 강의실로 옮기거나 삭제한 후 진행해 주세요.</p>}</div>}
        {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} className={button} onClick={() => setMode(null)}>취소</button><button disabled={busy || !draft || (mode === 'delete' && courseCount > 0)} className={`${button} ${mode === 'delete' ? 'text-red-300' : 'bg-accent/10 text-accent'}`}>{busy ? '처리 중…' : mode === 'delete' ? '삭제' : '저장'}</button></div>
      </form>
    </dialog>
  </>;
}
