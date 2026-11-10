import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { HOUR_HEIGHT, timetableLayout } from '../src/data/timetableLayout.ts';

const directory = new URL('../../backend/data/timetables/', import.meta.url);
let sessions = 0;
let mergedBlocks = 0;
for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
  const table = JSON.parse(readFileSync(new URL(file, directory), 'utf8'));
  const layout = timetableLayout(table);
  const represented = layout.days.flatMap(({ day, blocks }) => blocks.flatMap((block) =>
    block.codes.map((code) => JSON.stringify([day, block.start, block.end, code])))).sort();
  assert.deepEqual(represented, table.sessions.map((s) => JSON.stringify([s.day, s.start, s.end, s.code])).sort(), file);
  mergedBlocks += layout.days.flatMap((day) => day.blocks).filter((block) => block.codes.length > 1).length;
  sessions += table.sessions.length;
  for (const { blocks } of layout.days) {
    for (const block of blocks) {
      assert.ok(block.top >= 0 && block.height > 0 && block.top + block.height <= layout.height, file);
      for (const other of blocks) {
        if (block === other) continue;
        const overlap = block.top < other.top + other.height && other.top < block.top + block.height;
        if (overlap) assert.notEqual(block.lane, other.lane, `${file}: hidden overlap`);
      }
    }
  }
}

const grouping = {
  columns: ['요일', '09:00-09:30', '09:30-10:00', '10:00-10:30'],
  rows: [{ 요일: '월' }, { 요일: '화' }],
  courses: {
    a: { name: '동일 강의', instructor: '교수 A' },
    b: { name: '동일 강의', instructor: '교수 A' },
    c: { name: '동일 강의', instructor: '교수 B' },
    d: { name: '다른 강의', instructor: '교수 A' },
    e: { name: '동일 강의', instructor: '교수 A' },
  },
  sessions: [
    ...['a', 'b', 'c', 'd'].map((code) => ({ code, day: '월', start: '09:00', end: '10:00' })),
    { code: 'e', day: '월', start: '09:30', end: '10:30' },
    { code: 'b', day: '화', start: '09:00', end: '10:00' },
  ],
};
const grouped = timetableLayout(grouping);
assert.equal(grouped.days[0].blocks.length, 4);
assert.deepEqual(grouped.days[0].blocks.find((block) => block.code === 'a').codes, ['a', 'b']);
assert.deepEqual(grouped.days[1].blocks[0].codes, ['b']);

const slots = ['09:00-09:30', '09:30-10:00', '10:00-10:30', '10:30-11:00'];
for (const [values, top, height] of [
  [['a', null, null, null], 0, 0.5],
  [[null, 'a', 'a', 'a'], 0.5, 1.5],
  [['a', 'a', 'a', 'a'], 0, 2],
]) {
  const table = { columns: ['요일', ...slots], rows: [Object.fromEntries([
    ['요일', '월'], ...slots.map((slot, i) => [slot, values[i]]),
  ])], courses: { a: {} } };
  const block = timetableLayout(table).days[0].blocks[0];
  assert.equal(block.top, top * HOUR_HEIGHT);
  assert.equal(block.height, height * HOUR_HEIGHT);
}
console.log(`Verified ${sessions} meetings preserved, ${mergedBlocks} merged groups, distinct courses/teachers/times/days, lanes and half-hour positioning.`);
