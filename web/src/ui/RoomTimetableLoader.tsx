import { useEffect, useState } from 'react';
import { loadTimetable, type RoomTimetable as Timetable, type TimetableReference } from '../data/timetables';
import { RoomTimetable } from './RoomTimetable';

export function RoomTimetableLoader({ reference }: { reference: TimetableReference }) {
  const [table, setTable] = useState<Timetable>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadTimetable(reference).then(
      (value) => { if (active) setTable(value); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [reference, attempt]);
  if (table) return <RoomTimetable timetable={table} />;
  return (
    <div className="mt-5 text-xs text-slate-400" role="status">
      {failed ? <><p>시간표를 불러오지 못했어요.</p><button className="mt-2 text-accent underline" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>다시 시도</button></> : '시간표를 불러오는 중…'}
    </div>
  );
}
