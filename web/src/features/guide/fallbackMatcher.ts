// 규칙 기반 길안내. LLM 키가 없거나 API가 실패할 때 쓰인다.
// 브라우저와 Vercel 함수(api/guide.ts) 양쪽에서 import하므로 DOM·Vite 의존성을 두지 않는다.
import type {
  BuildingIndexEntry,
  FocusBuildingAction,
  NavigateAction,
  RoomIndexEntry,
  StartTourAction,
  UnknownAction,
} from '../../types/generated/campus';

export type GuideAction = NavigateAction | FocusBuildingAction | StartTourAction | UnknownAction;

export interface GuideIndex {
  buildings: BuildingIndexEntry[];
  rooms: RoomIndexEntry[];
}

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

const ROUTE_WORDS = ['가는길', '어떻게가', '길', '가려면', '가고싶', '안내', '경로', '데려'];
const TOUR_WORDS = ['투어', '둘러', '구경', '소개'];
/** 301, B104, 107-A 같은 호수 */
const ROOM_NO = /[a-z]?\d{3,4}(?:-[a-z0-9]+)?/;

/** 받침에 따라 조사만 고르기: particle('본관', '은', '는') → '은' */
export function particle(word: string, withBatchim: string, without: string): string {
  const last = word[word.length - 1] ?? '';
  // 숫자는 읽는 소리로: 영·일·삼·육·칠·팔은 받침 있음 (일·칠·팔은 ㄹ)
  const DIGIT_JONG: Record<string, number> = { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 };
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  let jong: number;
  if (/\d/.test(last)) jong = DIGIT_JONG[last] ?? 0;
  else if (code >= 0 && code <= 11171) jong = code % 28;
  else return `${withBatchim}(${without})`;
  // '(으)로'는 받침이 ㄹ이면 '로'
  const batchim = withBatchim === '으로' ? jong !== 0 && jong !== 8 : jong !== 0;
  return batchim ? withBatchim : without;
}

/** 받침에 따라 조사 붙이기: josa('본관', '은', '는') → '본관은' */
export function josa(word: string, withBatchim: string, without: string): string {
  return word + particle(word, withBatchim, without);
}

/** 시설물은 '여자화장실'처럼 이름이 길어도 '화장실'만으로 찾는다 */
const FACILITY_WORDS: [string, string][] = [
  ['화장실', '화장실'],
  ['엘리베이터', '엘리베이터'],
  ['엘베', '엘리베이터'],
  ['계단', '계단'],
  ['출입구', '출입구'],
];

interface Hit {
  building: BuildingIndexEntry;
  pos: number;
}

function findBuildings(query: string, buildings: BuildingIndexEntry[]): Hit[] {
  const q = normalize(query);
  const hits: Hit[] = [];
  for (const b of buildings) {
    let best = -1;
    let bestLen = 0;
    for (const term of [b.name, ...b.aliases]) {
      const t = normalize(term);
      const pos = t ? q.indexOf(t) : -1;
      // 더 긴 별칭이 맞으면 우선 (예: "영산비전센터" vs "영비")
      if (pos >= 0 && t.length > bestLen) {
        best = pos;
        bestLen = t.length;
      }
    }
    if (best >= 0) hits.push({ building: b, pos: best });
  }
  return hits.sort((a, b) => a.pos - b.pos);
}

export interface RoomMatch {
  room?: RoomIndexEntry;
  /** 여러 건물에 같은 이름이 있어 하나로 정할 수 없을 때 */
  ambiguous: RoomIndexEntry[];
}

/**
 * 문장에서 강의실·시설을 찾는다. buildingId를 주면 그 건물 안에서만 찾는다.
 * 같은 건물에 같은 이름이 여러 개면(화장실 등) 가장 낮은 층을 고른다.
 */
export function findRoom(query: string, rooms: RoomIndexEntry[], buildingId?: string): RoomMatch {
  const q = normalize(query);
  const num = q.match(ROOM_NO)?.[0];
  const pool = buildingId ? rooms.filter((r) => r.building_id === buildingId) : rooms;

  let best = 0;
  let found: RoomIndexEntry[] = [];
  for (const r of pool) {
    const n = normalize(r.name);
    let score = 0;
    if (num && n.replace(/호$/, '') === num) score = 100;
    else if (n.length >= 2 && q.includes(n)) score = n.length + (r.category === '공간' ? 0.5 : 0);
    else {
      for (const tag of r.tags) {
        const t = normalize(tag);
        if (t.length >= 2 && q.includes(t)) score = Math.max(score, t.length - 0.25);
      }
      if (!score && r.category === '시설물') {
        for (const [word, canonical] of FACILITY_WORDS) {
          if (q.includes(word) && n.includes(canonical)) score = 1;
        }
      }
    }
    if (score > best) {
      best = score;
      found = [r];
    } else if (score > 0 && score === best) {
      found.push(r);
    }
  }
  if (!found.length) return { ambiguous: [] };

  const buildingsFound = new Set(found.map((r) => r.building_id));
  if (buildingsFound.size > 1) return { ambiguous: found };
  const room = [...found].sort((a, b) => a.floor_index - b.floor_index)[0];
  return { room, ambiguous: [] };
}

function roomPhrase(b: BuildingIndexEntry, room?: RoomIndexEntry) {
  return room ? `${b.name} ${room.floor_label} ${room.name}` : b.name;
}

function actionFor(
  b: BuildingIndexEntry,
  room: RoomIndexEntry | undefined,
  wantsRoute: boolean,
): GuideAction {
  if (wantsRoute) {
    return {
      action: 'navigate',
      from_id: null,
      to_id: b.id,
      room_id: room?.id ?? null,
      message: `${josa(roomPhrase(b, room), '으로', '로')} 가는 길을 안내할게요.`,
    };
  }
  return {
    action: 'focus_building',
    building_id: b.id,
    room_id: room?.id ?? null,
    message: room
      ? `${josa(room.name, '은', '는')} ${b.name} ${room.floor_label}에 있어요.`
      : `${josa(b.name, '을', '를')} 보여드릴게요.`,
  };
}

export function fallbackMatch(query: string, index: GuideIndex): GuideAction {
  const q = normalize(query);
  const hits = findBuildings(query, index.buildings);
  const wantsRoute = ROUTE_WORDS.some((w) => q.includes(w));

  if (hits.length >= 2) {
    const from = hits[0]!.building;
    const to = hits[hits.length - 1]!.building;
    const room = findRoom(query, index.rooms, to.id).room;
    return {
      action: 'navigate',
      from_id: from.id,
      to_id: to.id,
      room_id: room?.id ?? null,
      message: `${from.name}에서 ${roomPhrase(to, room)}까지 가는 길을 안내할게요.`,
    };
  }

  if (hits.length === 1) {
    const b = hits[0]!.building;
    return actionFor(b, findRoom(query, index.rooms, b.id).room, wantsRoute);
  }

  // 건물 이름 없이 강의실만 말한 경우 ("보건실 어디야?")
  const { room, ambiguous } = findRoom(query, index.rooms);
  if (room) {
    const b = index.buildings.find((x) => x.id === room.building_id);
    if (b) return actionFor(b, room, wantsRoute);
  }
  if (ambiguous.length) {
    const names = [...new Set(ambiguous.map((r) => r.building_id))]
      .map((id) => index.buildings.find((b) => b.id === id)?.name ?? id)
      .slice(0, 3);
    return {
      action: 'unknown',
      message: `'${ambiguous[0]!.name}'${particle(ambiguous[0]!.name, '은', '는')} ${names.join('·')} 등 여러 건물에 있어요. 건물 이름도 함께 알려주세요.`,
    };
  }

  if (TOUR_WORDS.some((w) => q.includes(w))) {
    return { action: 'start_tour', message: '캠퍼스 투어를 시작할게요.' };
  }

  return {
    action: 'unknown',
    message: '어느 건물이나 강의실을 찾으시는지 잘 모르겠어요. 예: "이공관 301호 어디야?"',
  };
}
