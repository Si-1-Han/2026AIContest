import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TimetableCourse } from '../data/timetables';

interface CourseEntry {
  code: string;
  course: TimetableCourse;
}

interface DetailProps {
  entries: CourseEntry[];
  roomName: string;
  semester?: string;
}

export function CourseModal({ entries, roomName, semester, onClose }: DetailProps & {
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }
      }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[30rem] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-white/15 bg-[#101c2e] p-5 text-slate-100 shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-accent">{roomName}</p>
          <h2 id={titleId} className="mt-1 text-xl font-bold">과목 상세 정보</h2>
        </div>
        <button autoFocus onClick={onClose} aria-label="과목 상세 닫기" className="rounded-lg px-3 py-1 text-xl text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent">×</button>
      </header>
      <CourseDetails entries={entries} roomName={roomName} semester={semester} />
      <button onClick={onClose} className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-[#06101f] focus-visible:outline-2 focus-visible:outline-white">닫기</button>
    </dialog>,
    document.body,
  );
}

export function CourseDetails({ entries, roomName, semester }: DetailProps) {
  return (
    <>
      {entries.length > 1 && <p className="mb-4 rounded-xl bg-accent/10 p-3 text-sm text-accent">같은 과목·교수·시간으로 등록된 {entries.length}개 분반을 한 칸에 표시했습니다. 분반별 정보는 아래에서 확인하세요.</p>}
      {entries.map(({ code, course }) => {
        const fields = [
          ['과목명', course.name],
          ['교수님', course.instructor],
          ['과목코드·분반', code],
          ['학기', semester ?? '미등록'],
          ['개설 학부·구분', course.department ?? '미등록'],
          ['대상', course.target ?? '미등록'],
          ['영역', course.category ?? '미등록'],
          ['학점', course.credits == null ? '미등록' : `${course.credits}학점`],
          ['주당 수업시간', course.weekly_hours == null ? '미등록' : `${course.weekly_hours}시간`],
          ['정원', course.capacity == null ? '미등록' : `${course.capacity}명`],
          ['강의실', roomName],
          ['전체 수업시간·장소', course.meetings?.map((m) => `${m.day}요일 ${m.start}–${m.end} (${m.location})`).join('\n') ?? `${course.day}요일 ${course.start}–${course.end}`],
          ['교시', course.periods ?? '미등록'],
          ['비고', course.note || '없음'],
        ];
        return (
          <section key={code} className="mb-5 last:mb-0">
            {entries.length > 1 && <h3 className="mb-2 text-sm font-bold text-white">{code}</h3>}
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{course.name} {code} 상세 정보</caption>
              <tbody>
                {fields.map(([label, value]) => (
                  <tr key={label} className="border-b border-white/10 last:border-0">
                    <th scope="row" className="w-28 bg-white/5 px-3 py-3 text-left align-top font-medium text-slate-400">{label}</th>
                    <td className="whitespace-pre-line break-words px-3 py-3 leading-relaxed">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
