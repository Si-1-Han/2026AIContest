import type { BuildingIndexEntry, RoomIndexEntry } from '../../types/generated/campus';

export interface Place {
  buildingId: string;
  roomId: string | null;
  /** 목록에 보일 이름 */
  title: string;
  /** 보조 설명 (강의실이면 "이공관 3F") */
  subtitle: string;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 출발·도착 입력칸 자동완성: 건물을 먼저, 그다음 강의실(공간) */
export function searchPlaces(
  query: string,
  buildings: BuildingIndexEntry[],
  rooms: RoomIndexEntry[],
  limit = 8,
): Place[] {
  const q = norm(query);
  const names = new Map(buildings.map((b) => [b.id, b.name]));
  if (!q) {
    return buildings.map((b) => ({ buildingId: b.id, roomId: null, title: b.name, subtitle: '건물' }));
  }

  const out: Place[] = [];
  for (const b of buildings) {
    if ([b.name, ...b.aliases].some((t) => norm(t).includes(q))) {
      out.push({ buildingId: b.id, roomId: null, title: b.name, subtitle: '건물' });
    }
  }
  // "이공관 301" 처럼 건물 + 강의실로 입력한 경우: 건물 이름을 떼고 그 건물 안에서 찾는다
  const inBuilding = buildings.find((b) =>
    [b.name, ...b.aliases].some((t) => norm(t).length >= 2 && q.startsWith(norm(t))),
  );
  const rest = inBuilding
    ? q.slice(Math.max(...[inBuilding.name, ...inBuilding.aliases].map((t) => (q.startsWith(norm(t)) ? norm(t).length : 0))))
    : q;

  if (rest) {
    for (const r of rooms) {
      if (r.category !== '공간') continue;
      if (inBuilding && r.building_id !== inBuilding.id) continue;
      if (norm(r.name).includes(rest) || r.tags.some((t) => norm(t).includes(rest))) {
        out.push({
          buildingId: r.building_id,
          roomId: r.id,
          title: r.name,
          subtitle: `${names.get(r.building_id) ?? r.building_id} ${r.floor_label}`,
        });
      }
      if (out.length >= limit * 3) break;
    }
  }
  return out.slice(0, limit);
}
