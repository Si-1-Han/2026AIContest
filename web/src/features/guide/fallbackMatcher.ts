// 규칙 기반 길안내. LLM 키가 없거나 API가 실패할 때 쓰인다.
// 브라우저와 Vercel 함수(api/guide.ts) 양쪽에서 import하므로 DOM·Vite 의존성을 두지 않는다.
import type {
  BuildingIndexEntry,
  FocusBuildingAction,
  NavigateAction,
  StartTourAction,
  UnknownAction,
} from '../../types/generated/campus';

export type GuideAction = NavigateAction | FocusBuildingAction | StartTourAction | UnknownAction;

const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();

const ROUTE_WORDS = ['가는길', '어떻게가', '길', '가려면', '가고싶', '안내', '경로', '데려'];
const TOUR_WORDS = ['투어', '둘러', '구경', '소개'];

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
      // 더 긴 별칭이 맞으면 우선 (예: "한세교회" vs "교회")
      if (pos >= 0 && t.length > bestLen) {
        best = pos;
        bestLen = t.length;
      }
    }
    if (best >= 0) hits.push({ building: b, pos: best });
  }
  return hits.sort((a, b) => a.pos - b.pos);
}

export function fallbackMatch(query: string, buildings: BuildingIndexEntry[]): GuideAction {
  const q = normalize(query);
  const hits = findBuildings(query, buildings);
  const wantsRoute = ROUTE_WORDS.some((w) => q.includes(w));

  if (hits.length >= 2) {
    const [first, second] = [hits[0]!, hits[hits.length - 1]!];
    // "A에서 B" → A 출발. 그 외에는 앞의 것을 출발지로 본다.
    return {
      action: 'navigate',
      from_id: first.building.id,
      to_id: second.building.id,
      message: `${first.building.name}에서 ${second.building.name}까지 가는 길을 안내할게요.`,
    };
  }

  if (hits.length === 1) {
    const b = hits[0]!.building;
    if (wantsRoute) {
      return {
        action: 'navigate',
        from_id: null,
        to_id: b.id,
        message: `${b.name}(으)로 가는 길을 안내할게요.`,
      };
    }
    return { action: 'focus_building', building_id: b.id, message: `${b.name}을(를) 보여드릴게요.` };
  }

  if (TOUR_WORDS.some((w) => q.includes(w))) {
    return { action: 'start_tour', message: '캠퍼스 투어를 시작할게요.' };
  }

  return {
    action: 'unknown',
    message: '어느 건물을 찾으시는지 잘 모르겠어요. 예: "학생회관에서 이공관 가는 길 알려줘"',
  };
}
