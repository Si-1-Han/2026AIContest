import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { onDataUpdated } from '../data/dataUpdates';
import { adminApi as api } from './adminClient';
import { AdminRooms } from './AdminRooms';

type BuildingRow = { osm_id: string; id: string; name: string; levels: number; aliases: string[]; description: string; interior_id?: string; has_interior?: boolean; room_count: number };
type Meeting = { day: string; start: string; end: string };
type Course = { file: string; code: string; name: string; instructor: string; department: string; semester: string; credits: number | null; capacity: number | null; note: string; meetings: Meeting[]; room?: string; building_id?: string };
type Room = { file: string; name: string; building_id: string | null; room_id: string | null };
type BuildingData = { revision: string; items: BuildingRow[]; available: { osm_id: string; name: string }[] };
type CourseData = { revision: string; items: Course[]; rooms: Room[] };
const btn = 'rounded-xl border border-white/15 px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40';
const input = 'w-full rounded-lg border border-white/20 bg-[#141f32] px-3 py-2 text-sm text-white outline-accent disabled:opacity-50';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex flex-col gap-2 text-sm text-slate-300">{label}{children}</label>;
}

export function AdminData() {
  const [tab, setTab] = useState<'buildings' | 'courses' | 'rooms'>(() => {
    const saved = sessionStorage.getItem('campus-admin-tab');
    return saved === 'courses' || saved === 'rooms' ? saved : 'buildings';
  });
  const [roomsExpanded, setRoomsExpanded] = useState(tab === 'rooms');
  const [roomBuilding, setRoomBuilding] = useState(() => sessionStorage.getItem('campus-admin-room-building') ?? '');
  const [buildingData, setBuildingData] = useState<BuildingData>();
  const [courseData, setCourseData] = useState<CourseData>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<{ kind: 'buildings'; value: BuildingRow; fresh: boolean; revision: string } | { kind: 'courses'; value: Course; fresh: boolean; revision: string; originalFile?: string }>();
  const [remove, setRemove] = useState<{ path: string; name: string; revision: string; kind: 'buildings' | 'courses' }>();
  const editDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const scrollAfterPageChange = useRef(false);
  useEffect(() => {
    if (!scrollAfterPageChange.current) return;
    scrollAfterPageChange.current = false;
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [page]);
  useEffect(() => { sessionStorage.setItem('campus-admin-tab', tab); }, [tab]);

  async function refresh() {
    const [buildings, courses] = await Promise.all([api<BuildingData>('buildings'), api<CourseData>('courses')]);
    setBuildingData(buildings); setCourseData(courses);
  }
  useEffect(() => onDataUpdated((kind) => {
    if (kind === 'all') void refresh().catch((failure) => setError(failure.message));
  }), []);
  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.all([api<BuildingData>('buildings'), api<CourseData>('courses')]).then(([buildings, courses]) => {
      if (active) { setBuildingData(buildings); setCourseData(courses); }
    }).catch((failure) => { if (active) setError(String(failure.message)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (editor) editDialog.current?.showModal(); else editDialog.current?.close(); }, [Boolean(editor)]);
  useEffect(() => { if (remove) deleteDialog.current?.showModal(); else deleteDialog.current?.close(); }, [Boolean(remove)]);

  const buildings = buildingData?.items ?? [];
  const courses = courseData?.items ?? [];
  const roomName = (file: string) => courseData?.rooms.find((room) => room.file === file)?.name ?? file;
  const search = query.trim().toLocaleLowerCase();
  const filteredBuildings = buildings.filter((b) => `${b.id} ${b.name} ${b.aliases.join(' ')} ${b.description}`.toLocaleLowerCase().includes(search));
  const filteredCourses = courses.filter((c) => (!filter || c.building_id === filter) &&
    `${c.code} ${c.name} ${c.instructor} ${c.department} ${roomName(c.file)} ${c.semester} ${c.meetings.map((m) => `${m.day} ${m.start} ${m.end}`).join(' ')}`.toLocaleLowerCase().includes(search));
  const total = tab === 'buildings' ? filteredBuildings.length : filteredCourses.length;
  const lastPage = Math.max(0, Math.ceil(total / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * 20;
  function changePage(nextPage: number) {
    scrollAfterPageChange.current = true;
    setPage(nextPage);
  }

  function add() {
    setError(''); setMessage('');
    if (tab === 'buildings' && buildingData) setEditor({ kind: tab, fresh: true, revision: buildingData.revision, value: {
      osm_id: buildingData.available[0]?.osm_id ?? '', id: '', name: '', levels: 3,
      aliases: [], description: '', interior_id: '', room_count: 0,
    } });
    if (tab === 'courses' && courseData) setEditor({ kind: tab, fresh: true, revision: courseData.revision, value: {
      file: courseData.rooms.find((room) => !filter || room.building_id === filter)?.file ?? '', code: '', name: '',
      instructor: '', department: '', semester: courses[0]?.semester ?? '2026학년도 2학기',
      credits: null, capacity: null, note: '', meetings: [{ day: '월', start: '09:00', end: '10:00' }],
    } });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true); setError(''); setMessage('');
    const path = editor.kind === 'buildings' ? `buildings/${(editor.value as BuildingRow).osm_id}`
      : `courses/${encodeURIComponent(editor.kind === 'courses' ? editor.originalFile ?? editor.value.file : '')}/${encodeURIComponent((editor.value as Course).code)}`;
    try {
      await api(editor.fresh ? editor.kind : path, editor.fresh ? 'POST' : 'PUT', { ...editor.value, revision: editor.revision });
      setEditor(undefined);
      setMessage('저장했습니다.');
      await refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!remove || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api(remove.path, 'DELETE', { revision: remove.revision });
      setRemove(undefined); setMessage('삭제했습니다.');
      await refresh();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }

  function updateBuilding(patch: Partial<BuildingRow>) { if (editor?.kind === 'buildings') setEditor({ ...editor, value: { ...editor.value, ...patch } }); }
  function updateCourse(patch: Partial<Course>) { if (editor?.kind === 'courses') setEditor({ ...editor, value: { ...editor.value, ...patch } }); }

  return <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-start">
    <nav aria-label="관리자 사이드 메뉴" className="w-full shrink-0 rounded-2xl border border-white/10 bg-white/[0.025] p-3 md:sticky md:top-0 md:w-52">
      <p className="px-3 py-3 text-xs font-semibold tracking-widest text-slate-500">CAMPUS ADMIN</p>
      {(['buildings', 'courses'] as const).map((kind) => <button key={kind} disabled={busy} aria-current={tab === kind ? 'page' : undefined} className={`mb-1 w-full rounded-xl px-3 py-3 text-left text-sm transition ${tab === kind ? 'bg-accent/15 font-semibold text-accent' : 'text-slate-300 hover:bg-white/5'}`} onClick={() => { setTab(kind); setQuery(''); setFilter(''); setPage(0); setError(''); setMessage(''); }}>{kind === 'buildings' ? '건물 현황' : '수업 현황'}</button>)}
      <button disabled={busy} aria-expanded={roomsExpanded} aria-controls="admin-room-buildings" className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm ${tab === 'rooms' ? 'bg-accent/15 font-semibold text-accent' : 'text-slate-300 hover:bg-white/5'}`} onClick={() => { setRoomsExpanded((value) => !value); setTab('rooms'); setError(''); }}><span>강의실 현황</span><span aria-hidden="true">{roomsExpanded ? '▾' : '▸'}</span></button>
      {roomsExpanded && <div id="admin-room-buildings" className="ml-4 mt-2 border-l border-white/10 pl-2">{buildings.map((b) => <button key={b.id} disabled={busy} aria-current={tab === 'rooms' && roomBuilding === b.id ? 'page' : undefined} className={`my-0.5 w-full rounded-lg px-3 py-2 text-left text-sm ${tab === 'rooms' && roomBuilding === b.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`} onClick={() => { setTab('rooms'); setRoomBuilding(b.id); sessionStorage.setItem('campus-admin-room-building', b.id); }}>{b.name}</button>)}</div>}
    </nav>
    <section className="min-w-0 flex-1">
    {tab === 'rooms' && (roomBuilding ? <AdminRooms key={roomBuilding} buildingId={roomBuilding} onChanged={refresh} /> : <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400"><h2 className="mb-3 text-xl font-bold text-white">강의실 현황</h2>왼쪽 메뉴에서 건물을 선택하면 층별 호실을 확인할 수 있습니다.</div>)}
    <div hidden={tab === 'rooms'}>
    <h2 ref={listHeading} tabIndex={-1} className="mb-2 scroll-mt-6 text-2xl font-bold outline-none">{tab === 'buildings' ? '건물 현황' : '수업 현황'}</h2>
    <p className="mb-6 text-sm text-slate-400">{tab === 'buildings' ? `등록 건물 ${buildings.length}개 · 건물 정보와 검색 별칭을 관리합니다.` : `강의실별 수업 ${courses.length}개 · 수업 정보와 배정 시간을 관리합니다.`}</p>
    {tab === 'courses' && <p role="note" className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100/90">‘행정실’로 표시된 수업은 강의실이 배정되지 않은 수업입니다.</p>}
    <div className="mb-4 flex flex-wrap gap-3"><input aria-label="검색" placeholder={tab === 'buildings' ? '건물명, 별칭, 설명 검색' : '수업명, 교수, 강의실, 코드 검색'} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className={`${input} min-w-48 flex-1`} />
      {tab === 'courses' && <select aria-label="건물 필터" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }} className={`${input} w-auto`}><option value="">전체 건물</option>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      <button className={btn} disabled={busy} onClick={() => { setBusy(true); setError(''); void refresh().catch((failure) => setError(failure.message)).finally(() => setBusy(false)); }}>새로고침</button><button className={`${btn} bg-accent/15 text-accent`} disabled={busy || !buildingData || !courseData} onClick={add}>+ {tab === 'buildings' ? '건물' : '수업'} 추가</button>
    </div>
    {error && !editor && !remove && <p role="alert" className="mb-4 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mb-4 text-sm text-emerald-300">{message}</p>}
    <p className="mb-3 text-xs text-slate-400">{busy ? '처리 중…' : `${total}개 항목`}{tab === 'courses' && ' · 같은 수업이 여러 강의실에서 진행되면 강의실별로 표시됩니다.'}</p>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/5 text-slate-400"><tr>{(tab === 'buildings' ? ['건물명', 'ID', '층수', '공간 수', '설명', '관리'] : ['수업명 / 코드', '강의실', '교수 / 학과', '요일·시간', '학점 / 정원', '관리']).map((label) => <th key={label} className="p-4 font-medium">{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-white/10">{tab === 'buildings' ? filteredBuildings.slice(start, start + 20).map((b) => <tr key={b.id}><td className="p-4 font-medium">{b.name}</td><td className="p-4 text-slate-400">{b.id}</td><td className="p-4">{b.levels}</td><td className="p-4">{b.room_count}</td><td className="max-w-64 p-4 text-slate-400">{b.description}</td><td className="whitespace-nowrap p-4"><button className={btn} disabled={busy} onClick={() => { setError(''); setEditor({ kind: 'buildings', value: structuredClone(b), fresh: false, revision: buildingData!.revision }); }}>수정</button> <button className={`${btn} text-red-300`} disabled={busy} onClick={() => { setError(''); setRemove({ path: `buildings/${b.osm_id}`, name: b.name, revision: buildingData!.revision, kind: 'buildings' }); }}>삭제</button></td></tr>)
        : filteredCourses.slice(start, start + 20).map((c) => <tr key={`${c.file}/${c.code}`}><td className="p-4"><p className="font-medium">{c.name}</p><p className="mt-1 text-xs text-slate-400">{c.code} · {c.semester}</p></td><td className="p-4">{roomName(c.file)}</td><td className="p-4">{c.instructor}<p className="text-xs text-slate-400">{c.department}</p></td><td className="whitespace-nowrap p-4">{c.meetings.map((m, index) => <p key={index}>{m.day} {m.start}–{m.end}</p>)}</td><td className="p-4">{c.credits ?? '—'} / {c.capacity ?? '—'}</td><td className="whitespace-nowrap p-4"><button className={btn} disabled={busy} onClick={() => { setError(''); setEditor({ kind: 'courses', value: structuredClone(c), originalFile: c.file, fresh: false, revision: courseData!.revision }); }}>수정</button> <button className={`${btn} text-red-300`} disabled={busy} onClick={() => { setError(''); setRemove({ path: `courses/${encodeURIComponent(c.file)}/${encodeURIComponent(c.code)}`, name: `${roomName(c.file)} · ${c.name}`, revision: courseData!.revision, kind: 'courses' }); }}>삭제</button></td></tr>)}
        {!total && <tr><td colSpan={6} className="p-8 text-center text-slate-400">{busy ? '불러오는 중…' : '검색 결과가 없습니다.'}</td></tr>}
      </tbody></table></div>
    <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button className={btn} disabled={currentPage === 0} onClick={() => changePage(currentPage - 1)}>이전</button><span>{currentPage + 1} / {lastPage + 1}</span><button className={btn} disabled={currentPage === lastPage} onClick={() => changePage(currentPage + 1)}>다음</button></div>
    </div>

    <dialog ref={editDialog} aria-labelledby="edit-title" onCancel={(event) => { if (busy) event.preventDefault(); else setEditor(undefined); }} className="fixed inset-0 m-auto max-h-[85vh] w-[min(680px,calc(100%-32px))] overflow-y-auto rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white backdrop:bg-black/70">
      {editor && <form onSubmit={(event) => void save(event)}><h2 id="edit-title" className="mb-5 text-xl font-bold">{editor.kind === 'buildings' ? '건물' : '수업'} {editor.fresh ? '추가' : '수정'}</h2><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {editor.kind === 'buildings' ? <>
          {editor.fresh && <div className="sm:col-span-2"><Field label="지도에서 사용할 건물 위치"><select required className={input} value={editor.value.osm_id} onChange={(e) => updateBuilding({ osm_id: e.target.value })}><option value="">위치 선택</option>{buildingData?.available.map((a) => <option key={a.osm_id} value={a.osm_id}>{a.name} · {a.osm_id}</option>)}</select></Field><p className="mt-2 text-xs text-slate-400">기존 지도에 있는 미등록 건물 중 선택합니다. 부속동은 다른 건물과 합쳐질 수 있습니다.</p></div>}
          <Field label="건물 ID"><input required pattern="[a-z][a-z0-9_]{0,63}" disabled={!editor.fresh} className={input} value={editor.value.id} onChange={(e) => updateBuilding({ id: e.target.value })} /></Field>
          <Field label="건물명"><input required maxLength={100} className={input} value={editor.value.name} onChange={(e) => updateBuilding({ name: e.target.value })} /></Field>
          <Field label="지상 층수"><input type="number" required min={1} max={100} disabled={editor.value.has_interior} className={input} value={editor.value.levels} onChange={(e) => updateBuilding({ levels: Number(e.target.value) })} />{editor.value.has_interior && <span className="text-xs text-slate-400">층별 도면에서 계산되는 값입니다.</span>}</Field>
          <Field label="검색 별칭 (쉼표로 구분)"><input className={input} value={editor.value.aliases.join(',')} onChange={(e) => updateBuilding({ aliases: e.target.value.split(',') })} /></Field>
          <div className="sm:col-span-2"><Field label="설명"><textarea maxLength={3000} rows={4} className={input} value={editor.value.description} onChange={(e) => updateBuilding({ description: e.target.value })} /></Field></div>
        </> : <>
          <div className="sm:col-span-2"><Field label="강의실"><select required className={input} value={editor.value.file} onChange={(e) => updateCourse({ file: e.target.value })}><option value="">강의실 선택</option>{courseData?.rooms.map((r) => <option key={r.file} value={r.file}>{r.name}</option>)}</select></Field>{!editor.fresh && <p className="mt-2 text-xs text-slate-400">강의실을 변경하면 기존 시간표에서 수업을 빼고 선택한 강의실로 옮깁니다.</p>}</div>
          <Field label="수업 코드"><input required pattern="[A-Za-z0-9_-]{1,60}" disabled={!editor.fresh} className={input} value={editor.value.code} onChange={(e) => updateCourse({ code: e.target.value })} /></Field>
          <Field label="수업명"><input required maxLength={200} className={input} value={editor.value.name} onChange={(e) => updateCourse({ name: e.target.value })} /></Field>
          <Field label="교수"><input maxLength={100} className={input} value={editor.value.instructor} onChange={(e) => updateCourse({ instructor: e.target.value })} /></Field>
          <Field label="학과"><input maxLength={100} className={input} value={editor.value.department ?? ''} onChange={(e) => updateCourse({ department: e.target.value })} /></Field>
          <Field label="학기"><input required maxLength={100} className={input} value={editor.value.semester} onChange={(e) => updateCourse({ semester: e.target.value })} /></Field>
          <Field label="학점"><input type="number" min={0} max={30} step="0.5" className={input} value={editor.value.credits ?? ''} onChange={(e) => updateCourse({ credits: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="정원"><input type="number" min={0} max={10000} className={input} value={editor.value.capacity ?? ''} onChange={(e) => updateCourse({ capacity: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2"><p className="mb-2 text-sm text-slate-300">요일·시간 (30분 단위)</p>{editor.value.meetings.map((m, index) => <div key={index} className="mb-2 flex flex-wrap gap-2">
            <select aria-label={`시간 ${index + 1} 요일`} className={`${input} w-20`} value={m.day} onChange={(e) => updateCourse({ meetings: editor.value.meetings.map((v, i) => i === index ? { ...v, day: e.target.value } : v) })}>{[...'월화수목금토일'].map((day) => <option key={day}>{day}</option>)}</select>
            {(['start', 'end'] as const).map((key) => <input key={key} aria-label={`시간 ${index + 1} ${key === 'start' ? '시작' : '종료'}`} type="time" required step={1800} className={`${input} w-32`} value={m[key]} onChange={(e) => updateCourse({ meetings: editor.value.meetings.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v) })} />)}
            <button type="button" aria-label={`시간 ${index + 1} 삭제`} className={btn} disabled={editor.value.meetings.length === 1} onClick={() => updateCourse({ meetings: editor.value.meetings.filter((_, i) => i !== index) })}>−</button></div>)}<button type="button" disabled={editor.value.meetings.length >= 20} className={btn} onClick={() => updateCourse({ meetings: [...editor.value.meetings, { day: '월', start: '09:00', end: '10:00' }] })}>+ 시간 추가</button><p className="mt-2 text-xs text-slate-400">현재 강의실의 수업만 변경합니다. 겹치는 수업도 시간표에 함께 표시됩니다.</p></div>
          <div className="sm:col-span-2"><Field label="비고"><textarea rows={3} maxLength={3000} className={input} value={editor.value.note ?? ''} onChange={(e) => updateCourse({ note: e.target.value })} /></Field></div>
        </>}
      </fieldset>{error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" disabled={busy} className={btn} onClick={() => { setEditor(undefined); setError(''); }}>취소</button><button disabled={busy} className={`${btn} bg-accent/15 text-accent`}>{busy ? '저장 중…' : '저장'}</button></div></form>}
    </dialog>
    <dialog ref={deleteDialog} aria-labelledby="delete-title" onCancel={(event) => { if (busy) event.preventDefault(); else setRemove(undefined); }} className="fixed inset-0 m-auto w-[min(440px,calc(100%-32px))] rounded-2xl border border-white/15 bg-[#0d1528] p-6 text-white backdrop:bg-black/70"><h2 id="delete-title" className="text-lg font-bold">삭제 확인</h2><p className="my-4 break-words text-sm text-slate-300">{remove?.name} 항목을 삭제하시겠습니까?</p>{remove?.kind === 'buildings' && <p className="mb-4 text-xs text-slate-400">등록된 수업이 있으면 먼저 삭제해야 합니다. 삭제한 건물은 지도에서 제외됩니다.</p>}{error && <p role="alert" className="my-4 text-sm text-red-300">{error}</p>}<div className="flex justify-end gap-2"><button disabled={busy} className={btn} onClick={() => { setRemove(undefined); setError(''); }}>취소</button><button disabled={busy} className={`${btn} text-red-300`} onClick={() => void confirmDelete()}>{busy ? '삭제 중…' : '삭제'}</button></div></dialog>
    </section>
  </div>;
}
