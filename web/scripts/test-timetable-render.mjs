import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  configFile: false, plugins: [react()],
  server: { middlewareMode: true, hmr: false }, appType: 'custom',
});
try {
  const { findTimetable, loadTimetable } = await server.ssrLoadModule('/src/data/timetables.ts');
  const { RoomTimetable } = await server.ssrLoadModule('/src/ui/RoomTimetable.tsx');
  const { timetableLayout } = await server.ssrLoadModule('/src/data/timetableLayout.ts');
  const { CourseDetails } = await server.ssrLoadModule('/src/ui/CourseModal.tsx');
  const reference = findTimetable('student_union', 'student_union:1:1');
  assert.ok(reference);
  const table = await loadTimetable(reference);
  const html = renderToStaticMarkup(createElement(RoomTimetable, { timetable: table }));
  assert.equal((html.match(/<button/g) ?? []).length, 7);
  assert.ok(html.includes('학생회관 101호'));
  assert.ok(html.includes('논리로보는세상'));
  assert.ok(html.includes('2026학년도 2학기'));
  const index = JSON.parse(readFileSync(new URL('../../backend/data/timetable_sources/room-index.json', import.meta.url), 'utf8'));
  assert.equal(index.length, 83);
  assert.ok(index.every((item) => item.room_id && item.mapping_status === 'linked'));
  const overlapTable = await loadTimetable(index.find((item) => item.source_location === '디102'));
  const overlapHtml = renderToStaticMarkup(createElement(RoomTimetable, { timetable: overlapTable }));
  const blocks = timetableLayout(overlapTable).days.flatMap((day) => day.blocks);
  assert.equal((overlapHtml.match(/<button/g) ?? []).length, blocks.length);
  assert.ok(blocks.length < overlapTable.sessions.length);
  const combined = blocks.find((block) => block.codes.length > 1);
  assert.ok(combined);
  const entries = combined.codes.map((code, index) => ({ code, course: {
    ...overlapTable.courses[code], capacity: 20 + index,
    note: `분반별 비고 ${index}`, target: `대상 ${index}`,
  } }));
  const details = renderToStaticMarkup(createElement(CourseDetails, { entries, roomName: overlapTable.name }));
  assert.equal((details.match(/<table/g) ?? []).length, entries.length);
  entries.forEach(({ code, course }) => {
    assert.ok(details.includes(code));
    assert.ok(details.includes(course.note));
    assert.ok(details.includes(course.target));
    assert.ok(details.includes(`${course.capacity}명`));
  });
  console.log('Verified lazy room loading, rendered course buttons, overlap display, and linked-only index.');
} finally {
  await server.close();
}
