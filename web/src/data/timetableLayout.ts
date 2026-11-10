import type { RoomTimetable } from './timetables';

export const HOUR_HEIGHT = 64;
const minutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour! * 60 + minute!;
};

interface Block {
  code: string;
  codes: string[];
  top: number;
  height: number;
  start: string;
  end: string;
  lane: number;
  lanes: number;
}

/** Group only exact meetings in this room/day, retaining every section code. */
function mergeMatchingCourses(blocks: Block[], table: RoomTimetable): Block[] {
  const merged = new Map<string, Block>();
  for (const block of blocks) {
    const course = table.courses[block.code]!;
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
    const key = JSON.stringify([normalize(course.name), normalize(course.instructor), block.start, block.end]);
    const previous = merged.get(key);
    if (previous) {
      previous.codes = [...new Set([...previous.codes, ...block.codes])].sort();
    } else merged.set(key, { ...block, codes: [...block.codes] });
  }
  return [...merged.values()];
}

/** Keep simultaneous courses visible instead of overwriting or covering them. */
function arrangeOverlaps(blocks: Block[]) {
  blocks.sort((a, b) => a.top - b.top || b.height - a.height || a.code.localeCompare(b.code));
  let group: Block[] = [];
  let groupEnd = -1;
  const finish = () => {
    const laneEnds: number[] = [];
    for (const block of group) {
      let lane = laneEnds.findIndex((end) => end <= block.top);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = block.top + block.height;
      block.lane = lane;
    }
    for (const block of group) block.lanes = laneEnds.length;
  };
  for (const block of blocks) {
    if (block.top >= groupEnd) { finish(); group = []; }
    group.push(block);
    groupEnd = Math.max(groupEnd, block.top + block.height);
  }
  finish();
  return blocks;
}

export function timetableLayout(table: RoomTimetable) {
  const slots = table.columns.slice(1);
  const start = Math.floor(minutes(slots[0]!.split('-')[0]!) / 60) * 60;
  const end = Math.ceil(minutes(slots.at(-1)!.split('-')[1]!) / 60) * 60;
  const hours = Array.from({ length: (end - start) / 60 }, (_, i) =>
    `${String(start / 60 + i).padStart(2, '0')}:00`,
  );
  const days = table.rows.map((row) => {
    const day = String(row['요일']);
    const blocks: Block[] = [];
    if (table.sessions) {
      for (const session of table.sessions.filter((s) => s.day === day)) {
        blocks.push({ code: session.code, codes: [session.code], top: (minutes(session.start) - start) / 60 * HOUR_HEIGHT,
          height: (minutes(session.end) - minutes(session.start)) / 60 * HOUR_HEIGHT,
          start: session.start, end: session.end, lane: 0, lanes: 1 });
      }
      return { day, blocks: arrangeOverlaps(mergeMatchingCourses(blocks, table)) };
    }
    for (let i = 0; i < slots.length;) {
      const code = row[slots[i]!];
      if (typeof code !== 'string' || !table.courses[code]) { i++; continue; }
      let last = i;
      while (last + 1 < slots.length && row[slots[last + 1]!] === code) last++;
      const from = minutes(slots[i]!.split('-')[0]!);
      const to = minutes(slots[last]!.split('-')[1]!);
      blocks.push({ code, codes: [code], top: (from - start) / 60 * HOUR_HEIGHT, height: (to - from) / 60 * HOUR_HEIGHT,
        start: slots[i]!.split('-')[0]!, end: slots[last]!.split('-')[1]!, lane: 0, lanes: 1 });
      i = last + 1;
    }
    return { day, blocks: arrangeOverlaps(blocks) };
  });
  return { hours, days, height: hours.length * HOUR_HEIGHT };
}
