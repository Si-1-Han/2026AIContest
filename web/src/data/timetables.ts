import roomIndex from '../../../backend/data/timetable_sources/room-index.json';
import { API_ENABLED, API_TIMEOUT_MS, API_URL } from '../config';

export interface TimetableMeeting {
  day: string;
  start: string;
  end: string;
  location: string;
  periods: string;
}

export interface TimetableCourse {
  name: string;
  instructor: string;
  day: string;
  start: string;
  end: string;
  note: string;
  credits: number | null;
  weekly_hours: number | null;
  capacity: number | null;
  department?: string;
  meetings?: TimetableMeeting[];
  target?: string;
  category?: string;
  periods?: string;
}

export interface RoomTimetable {
  name: string;
  building_id: string | null;
  room_id: string | null;
  semester?: string;
  mapping_status?: 'linked' | 'unlinked';
  columns: string[];
  rows: Record<string, string | string[] | null>[];
  courses: Record<string, TimetableCourse>;
  sessions?: (TimetableMeeting & { code: string })[];
}

// Load only the selected room's data; unlinked spaces are not in the index.
const files = import.meta.glob<RoomTimetable>('../../../backend/data/timetables/*.json', {
  import: 'default',
});

export type TimetableReference = (typeof roomIndex)[number];

export function findTimetable(buildingId: string, roomId: string): TimetableReference | undefined {
  return roomIndex.find((table) => table.building_id === buildingId && table.room_id === roomId);
}

export async function fetchTimetableIndex(): Promise<TimetableReference[]> {
  if (API_ENABLED) {
    try {
      const response = await fetch(`${API_URL}/api/v1/timetables`, { signal: AbortSignal.timeout(API_TIMEOUT_MS), cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch { /* Static campus remains usable without the API. */ }
  }
  return roomIndex;
}

export async function loadTimetable(reference: TimetableReference): Promise<RoomTimetable> {
  if (API_ENABLED) {
    let response: Response | undefined;
    try {
      response = await fetch(`${API_URL}/api/v1/timetables/${encodeURIComponent(reference.file)}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS), cache: 'no-store' });
      if (response.ok) return await response.json();
    } catch { /* Fall back to bundled data if the API is unavailable. */ }
    if (response?.status === 404) throw new Error('삭제된 시간표입니다.');
  }
  const load = files[`../../../backend/data/timetables/${reference.file}`];
  if (!load) return Promise.reject(new Error('시간표 파일을 찾을 수 없습니다.'));
  return load();
}
