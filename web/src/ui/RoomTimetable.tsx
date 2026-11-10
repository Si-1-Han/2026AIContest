import { useState } from 'react';
import { CourseModal } from './CourseModal';
import type { RoomTimetable as Timetable } from '../data/timetables';
import { HOUR_HEIGHT, timetableLayout } from '../data/timetableLayout';

const COLORS = ['#dcebf9', '#fbe2e5', '#e7f2d4', '#fff0ce', '#ece3f9', '#daf1e9', '#f7dfee'];

export function RoomTimetable({ timetable }: { timetable: Timetable }) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const codes = Object.keys(timetable.courses);
  const layout = timetableLayout(timetable);
  const columns = `40px repeat(${layout.days.length}, minmax(0, 1fr))`;
  return (
    <section className="mt-5 border-t border-white/10 pt-4" aria-label={`${timetable.name} 시간표`}>
      <h3 className="mb-3 text-sm font-bold text-white">{timetable.name} 시간표</h3>
      {timetable.semester && <p className="mb-2 text-[11px] text-slate-400">{timetable.semester}</p>}
      <div className="overflow-hidden rounded-xl border border-white/15">
        <div className="grid bg-[#1c293c] text-center text-xs text-slate-200" style={{ gridTemplateColumns: columns }}>
          <span className="py-2 text-[10px]">시간</span>
          {layout.days.map(({ day }) => <span key={day} className="border-l border-white/10 py-2 font-semibold">{day}</span>)}
        </div>
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="bg-[#1c293c] text-center text-[9px] tabular-nums text-slate-400">
            {layout.hours.map((hour) => <div key={hour} className="border-t border-white/10 pt-1" style={{ height: HOUR_HEIGHT }}>{hour}</div>)}
          </div>
          {layout.days.map(({ day, blocks }) => (
            <div key={day} role="group" aria-label={`${day}요일 수업`} className="relative border-l border-white/10 bg-white/[0.025]" style={{ height: layout.height }}>
              {layout.hours.map((hour, index) => (
                <div key={hour} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-white/10" style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }} />
              ))}
              {blocks.map(({ code, codes: sectionCodes, top, height, start, end, lane, lanes }) => {
                const course = timetable.courses[code]!;
                const details = `${course.name} · ${course.instructor} · ${day} ${start}–${end}${sectionCodes.length > 1 ? ` · ${sectionCodes.length}개 분반` : ''}`;
                return (
                  <button
                    key={`${code}-${top}`}
                    type="button"
                    onClick={() => setSelectedCodes(sectionCodes)}
                    aria-label={`${details} 상세 정보`}
                    title={details}
                    className="absolute flex cursor-pointer flex-col overflow-hidden border-b border-r border-white/20 px-1 py-0.5 text-left text-slate-800 transition hover:brightness-105 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-800"
                    style={{ top, height, left: `${lane / lanes * 100}%`, width: `${100 / lanes}%`, backgroundColor: COLORS[codes.indexOf(code) % COLORS.length] }}
                  >
                    <span className={`${height <= HOUR_HEIGHT / 2 ? 'w-full truncate' : 'line-clamp-3 break-all'} shrink-0 text-[11px] font-bold leading-[14px]`}>{course.name}</span>
                    <span className="w-full shrink-0 truncate text-[10px] leading-[12px] text-slate-600">{course.instructor}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">한 칸은 1시간입니다. 30분 수업은 반 칸으로 표시됩니다. 수업을 클릭하면 상세 정보를 볼 수 있어요.</p>
      {layout.days.some((day) => day.blocks.some((block) => block.lanes > 1)) && <p className="mt-1 text-[10px] text-amber-200">원본에 같은 시간·장소로 배정된 수업이 있어 나란히 표시했습니다.</p>}
      {selectedCodes.length > 0 && <CourseModal entries={selectedCodes.map((code) => ({ code, course: timetable.courses[code]! }))} roomName={timetable.name} semester={timetable.semester} onClose={() => setSelectedCodes([])} />}
    </section>
  );
}
