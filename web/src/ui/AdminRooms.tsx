import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useDataRevision } from '../data/dataUpdates';
import { adminApi } from './adminClient';
import { defaultRoomType, RoomTypeSelect } from './RoomTypeSelect';

type Placement = { x: number; z: number; width: number; depth: number };
type Room = { id: string; name: string; type: string; description: string; tags: string[]; color: string; course_count: number; polygon: [number, number][] };
type Floor = { index: number; label: string; outline: [number, number][]; rooms: Room[]; suggested_placement: Placement };
type RoomData = { revision: string; building_id: string; building_name: string; floors: Floor[] };
type Draft = { id?: string; floor_index: number; name: string; type: string; description: string; tags: string[]; color: string; placement?: Placement; revision: string };
const btn = 'rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40';
const input = 'w-full rounded-lg border border-white/20 bg-[#141f32] px-3 py-2 text-sm text-white outline-accent disabled:opacity-50';
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-2 text-sm text-slate-300">{label}{children}</label>; }

export function AdminRooms({ buildingId, onChanged }: { buildingId: string; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<RoomData>();
  const [query, setQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState<Draft>();
  const [remove, setRemove] = useState<{ room: Room; revision: string }>();
  const editor = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const path = `rooms/${encodeURIComponent(buildingId)}`;
  const revision = useDataRevision();

  useEffect(() => {
    let active = true;
    setBusy(true);
    void adminApi<RoomData>(path).then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [path, revision]);
  useEffect(() => { if (draft) editor.current?.showModal(); else editor.current?.close(); }, [Boolean(draft)]);
  useEffect(() => { if (remove) confirmation.current?.showModal(); else confirmation.current?.close(); }, [Boolean(remove)]);

  function add(floor?: Floor) {
    const selected = floor ?? data?.floors[0];
    if (!data || !selected) return;
    setError(''); setMessage('');
    setDraft({ revision: data.revision, floor_index: selected.index, name: '', type: defaultRoomType.value,
      description: '', tags: [], color: defaultRoomType.color, placement: { ...selected.suggested_placement } });
  }
  function update(patch: Partial<Draft>) { setDraft((value) => value ? { ...value, ...patch } : value); }
  function placement(patch: Partial<Placement>) { if (draft?.placement) update({ placement: { ...draft.placement, ...patch } }); }

  async function refreshAfterSave() {
    setData(await adminApi<RoomData>(path));
    await onChanged();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await adminApi(draft.id ? `${path}/${encodeURIComponent(draft.id)}` : path, draft.id ? 'PUT' : 'POST', draft);
      setDraft(undefined); setMessage('호실을 저장했습니다.');
      await refreshAfterSave();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteRoom() {
    if (!remove || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await adminApi(`${path}/${encodeURIComponent(remove.room.id)}`, 'DELETE', { revision: remove.revision });
      setRemove(undefined); setMessage('호실을 삭제했습니다.');
      await refreshAfterSave();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  const floor = data?.floors.find((f) => f.index === draft?.floor_index);
  const search = query.trim().toLocaleLowerCase();
  const floors = data?.floors.filter((f) => !floorFilter || f.index.toString() === floorFilter) ?? [];
  const matching = (room: Room) => `${room.name} ${room.type} ${room.description} ${room.tags.join(' ')}`.toLocaleLowerCase().includes(search);

  return <div>
    <h2 className="text-2xl font-bold">{data?.building_name ?? '강의실'} · 호실 현황</h2>
    <p className="mb-6 mt-2 text-sm text-slate-400">{data ? `${data.floors.length}개 층 · ${data.floors.reduce((n, f) => n + f.rooms.length, 0)}개 공간` : '층별 호실 정보를 불러옵니다.'}</p>
    <div className="mb-5 flex flex-wrap gap-3"><input aria-label="호실 검색" placeholder="호실명, 용도, 설명 검색" value={query} onChange={(event) => setQuery(event.target.value)} className={`${input} min-w-44 flex-1`} /><select aria-label="층 선택" value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)} className={`${input} w-auto`}><option value="">전체 층</option>{data?.floors.map((f) => <option key={f.index} value={f.index}>{f.label}</option>)}</select><button disabled={busy} className={btn} onClick={() => { setBusy(true); setError(''); void adminApi<RoomData>(path).then(setData).catch((failure) => setError(failure.message)).finally(() => setBusy(false)); }}>새로고침</button><button disabled={busy || !data?.floors.length} className={`${btn} bg-accent/10 text-accent`} onClick={() => add(floors[0])}>+ 호실 추가</button></div>
    {error && !draft && !remove && <p role="alert" className="mb-5 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mb-5 text-sm text-emerald-300">{message}</p>}
    {busy && <p role="status" className="mb-4 text-sm text-slate-400">처리 중…</p>}
    <div className="flex flex-col gap-6">{floors.map((f) => {
      const visible = f.rooms.filter(matching);
      if (search && visible.length === 0) return null;
      return <section key={f.index} className="overflow-hidden rounded-2xl border border-white/10"><header className="flex items-center justify-between bg-white/5 px-4 py-3"><h3 className="font-semibold">{f.label} <span className="ml-2 text-xs font-normal text-slate-400">{visible.length}개 공간</span></h3><button disabled={busy} className={btn} onClick={() => add(f)}>+ 이 층에 추가</button></header><div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm"><thead className="text-xs text-slate-400"><tr>{['호실명', '용도', '설명 / 별칭', '배정 수업', '관리'].map((label) => <th key={label} className="p-4 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{visible.map((room) => <tr key={room.id}><td className="p-4 font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: room.color }} />{room.name}</td><td className="max-w-40 p-4 text-slate-400">{room.type || '—'}</td><td className="max-w-64 p-4 text-slate-400">{room.description || '—'}{room.tags.length > 0 && <p className="mt-1 text-xs text-slate-500">{room.tags.join(', ')}</p>}</td><td className="p-4">{room.course_count}개</td><td className="whitespace-nowrap p-4"><button disabled={busy} className={btn} onClick={() => { setError(''); setDraft({ id: room.id, revision: data!.revision, floor_index: f.index, name: room.name, type: room.type, description: room.description, tags: [...room.tags], color: /^#[0-9a-f]{6}$/i.test(room.color) ? room.color : '#79b7d9' }); }}>수정</button> <button disabled={busy} className={`${btn} text-red-300`} onClick={() => { setError(''); setRemove({ room, revision: data!.revision }); }}>삭제</button></td></tr>)}{visible.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">등록된 호실이 없습니다.</td></tr>}</tbody></table></div></section>;
    })}</div>
    {data && !busy && (search ? floors.every((f) => !f.rooms.some(matching)) : floors.length === 0) && <p className="py-8 text-center text-slate-400">검색 결과가 없습니다.</p>}

    <dialog ref={editor} aria-labelledby="room-editor-title" onCancel={(event) => { if (busy) event.preventDefault(); else setDraft(undefined); }} className="fixed inset-0 m-auto max-h-[85vh] w-[min(680px,calc(100%-32px))] overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white backdrop:bg-black/70">
      {draft && <form onSubmit={(event) => void save(event)}><h2 id="room-editor-title" className="mb-5 text-xl font-bold">호실 {draft.id ? '수정' : '추가'}</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <Field label="층"><select required disabled={Boolean(draft.id)} value={draft.floor_index} className={input} onChange={(event) => { const next = data?.floors.find((f) => f.index === Number(event.target.value)); if (next) update({ floor_index: next.index, placement: { ...next.suggested_placement } }); }}>{data?.floors.map((f) => <option key={f.index} value={f.index}>{f.label}</option>)}</select></Field>
        <Field label="호실명"><input autoFocus required maxLength={100} value={draft.name} onChange={(event) => update({ name: event.target.value })} className={input} placeholder="예: 301호" /></Field>
        <div className="sm:col-span-2"><RoomTypeSelect value={draft.type} color={draft.color} onChange={(type, color) => update({ type, color })} /></div>
        <div className="sm:col-span-2"><Field label="검색 별칭 (쉼표로 구분)"><input value={draft.tags.join(',')} onChange={(event) => update({ tags: event.target.value.split(',') })} className={input} /></Field></div>
        <div className="sm:col-span-2"><Field label="설명"><textarea maxLength={3000} rows={3} value={draft.description} onChange={(event) => update({ description: event.target.value })} className={input} /></Field></div>
        {draft.placement && floor && <>
          <div className="sm:col-span-2"><p className="mb-2 text-sm text-slate-300">층 도면에서 새 호실의 위치 선택</p><FloorPreview floor={floor} placement={draft.placement} color={draft.color} onPlace={(x, z) => placement({ x, z })} /><p className="mt-2 text-xs text-slate-400">도면을 클릭하거나 방향키로 위치를 옮길 수 있습니다. 밝은 영역이 새 호실입니다. 기존 공간과 위치가 겹치지 않는지 확인해 주세요.</p></div>
          {(['x', 'z', 'width', 'depth'] as const).map((key) => <Field key={key} label={{ x: '동서 위치 (m)', z: '남북 위치 (m)', width: '가로 크기 (m)', depth: '세로 크기 (m)' }[key]}><input type="number" required step="0.01" min={key === 'width' || key === 'depth' ? 0.11 : -10000} max={key === 'width' || key === 'depth' ? 200 : 10000} value={draft.placement![key]} onChange={(event) => placement({ [key]: Number(event.target.value) })} className={input} /></Field>)}
        </>}
        {draft.id && <p className="text-xs text-slate-400 sm:col-span-2">기존 호실의 도형과 수업 연결은 유지됩니다.</p>}
      </fieldset>{error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} className={btn} onClick={() => { setDraft(undefined); setError(''); }}>취소</button><button disabled={busy} className={`${btn} bg-accent/10 text-accent`}>{busy ? '저장 중…' : '저장'}</button></div></form>}
    </dialog>
    <dialog ref={confirmation} aria-labelledby="room-delete-title" onCancel={(event) => { if (busy) event.preventDefault(); else setRemove(undefined); }} className="fixed inset-0 m-auto w-[min(440px,calc(100%-32px))] rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white backdrop:bg-black/70"><h2 id="room-delete-title" className="text-lg font-bold">호실 삭제</h2><p className="my-4 text-sm text-slate-300">{remove?.room.name}을 삭제하시겠습니까?</p><p className="mb-4 text-xs text-slate-400">배정된 수업이 있으면 먼저 삭제해야 합니다.</p>{error && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}<div className="flex justify-end gap-2"><button disabled={busy} className={btn} onClick={() => { setRemove(undefined); setError(''); }}>취소</button><button disabled={busy} className={`${btn} text-red-300`} onClick={() => void deleteRoom()}>{busy ? '삭제 중…' : '삭제'}</button></div></dialog>
  </div>;
}

function FloorPreview({ floor, placement, color, onPlace }: { floor: Floor; placement: Placement; color: string; onPlace: (x: number, z: number) => void }) {
  const xs = floor.outline.map((p) => p[0]);
  const zs = floor.outline.map((p) => p[1]);
  const minX = Math.min(...xs) - 2, minZ = Math.min(...zs) - 2;
  const width = Math.max(...xs) - minX + 2, depth = Math.max(...zs) - minZ + 2;
  const viewWidth = 600, viewHeight = 260;
  const scale = Math.min(viewWidth / width, viewHeight / depth);
  const offsetX = (viewWidth - width * scale) / 2, offsetZ = (viewHeight - depth * scale) / 2;
  const x = (value: number) => offsetX + (value - minX) * scale;
  const z = (value: number) => offsetZ + (value - minZ) * scale;
  return <svg viewBox="0 0 600 260" role="button" tabIndex={0} aria-label="새 호실 위치 선택 도면" className="h-64 w-full cursor-crosshair rounded-xl border border-white/15 bg-slate-950 focus-visible:outline-2 focus-visible:outline-accent" onClick={(event) => {
    const point = event.currentTarget.createSVGPoint();
    point.x = event.clientX; point.y = event.clientY;
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return;
    const local = point.matrixTransform(matrix.inverse());
    onPlace(Math.round(((local.x - offsetX) / scale + minX) * 100) / 100, Math.round(((local.y - offsetZ) / scale + minZ) * 100) / 100);
  }} onKeyDown={(event) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] };
    const move = moves[event.key];
    if (move) { event.preventDefault(); onPlace(placement.x + move[0], placement.z + move[1]); }
  }}>
    <polygon points={floor.outline.map((p) => `${x(p[0])},${z(p[1])}`).join(' ')} fill="#1e293b" stroke="#64748b" />
    {floor.rooms.map((room) => <polygon key={room.id} points={room.polygon.map((p) => `${x(p[0])},${z(p[1])}`).join(' ')} fill={room.color} fillOpacity="0.18" stroke="#475569" strokeWidth="0.7" />)}
    <rect x={x(placement.x - placement.width / 2)} y={z(placement.z - placement.depth / 2)} width={placement.width * scale} height={placement.depth * scale} fill={color} fillOpacity="0.8" stroke="#fff" strokeWidth="1.5" />
    <path d={`M${x(placement.x)-6} ${z(placement.z)}h12M${x(placement.x)} ${z(placement.z)-6}v12`} stroke="white" />
  </svg>;
}
