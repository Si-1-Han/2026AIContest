import roomIndex from '../../../backend/data/timetable_sources/room-index.json';

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

export function loadTimetable(reference: TimetableReference): Promise<RoomTimetable> {
  const load = files[`../../../backend/data/timetables/${reference.file}`];
  if (!load) return Promise.reject(new Error('시간표 파일을 찾을 수 없습니다.'));
  return load();
}
