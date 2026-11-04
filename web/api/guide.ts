// AI 길안내 — Vercel Serverless Function (POST /api/guide)
//
// 요청: GuideRequest { query }
// 응답: GuideResponse { result: GuideAction, source: 'llm' | 'fallback' }
//
// ANTHROPIC_API_KEY가 없거나 LLM 호출이 실패하면 규칙 기반 폴백으로 응답한다.
// TODO(M3): 일일 호출 한도(레이트 리밋), 프롬프트 다듬기, 건물 설명을 컨텍스트에 추가
import buildingIndex from '../public/data/buildings-index.json' with { type: 'json' };
import roomIndex from '../public/data/rooms-index.json' with { type: 'json' };
import {
  fallbackMatch,
  findRoom,
  type GuideAction,
  type GuideIndex,
} from '../src/features/guide/fallbackMatcher';
import type { BuildingIndex, GuideResponse, RoomIndex } from '../src/types/generated/campus';

const index: GuideIndex = {
  buildings: (buildingIndex as BuildingIndex).buildings,
  rooms: (roomIndex as RoomIndex).rooms,
};
const buildings = index.buildings;
const ids = buildings.map((b) => b.id);
const MODEL = process.env.GUIDE_MODEL || 'claude-haiku-5-5';
const MAX_QUERY = 200;

const SYSTEM = `너는 한세대학교 캠퍼스 길안내원이다. 사용자의 말에서 의도를 파악해 반드시 도구 하나를 호출한다.
- 길을 묻거나 어딘가로 가고 싶어하면 navigate. 출발지를 말하지 않았으면 from_id는 생략한다.
- 특정 건물을 보여 달라거나 정보를 물으면 focus_building.
- 캠퍼스를 둘러보고 싶어하면 start_tour.
- 아래 목록에 없는 장소이거나 캠퍼스와 무관하면 unknown.
- 건물 안의 강의실·시설(예: 301호, 보건실, 화장실)을 언급하면 room_query에 그 이름을 그대로 넣는다.
  사용자 메시지 끝의 [검색 참고]가 있으면 그 건물 ID를 사용한다.
message는 한국어 존댓말 1~2문장으로 친근하게 쓴다.

건물 목록 (id: 이름 / 별칭):
${buildings.map((b) => `- ${b.id}: ${b.name} / ${b.aliases.join(', ')}`).join('\n')}`;

const TOOLS = [
  {
    name: 'navigate',
    description: '출발 건물에서 도착 건물까지 경로를 안내한다.',
    input_schema: {
      type: 'object',
      properties: {
        from_id: { type: 'string', enum: ids },
        to_id: { type: 'string', enum: ids },
        room_query: { type: 'string', description: '도착 건물 안의 강의실·시설 이름' },
        message: { type: 'string' },
      },
      required: ['to_id', 'message'],
    },
  },
  {
    name: 'focus_building',
    description: '건물 하나를 화면에 보여준다.',
    input_schema: {
      type: 'object',
      properties: {
        building_id: { type: 'string', enum: ids },
        room_query: { type: 'string', description: '건물 안의 강의실·시설 이름' },
        message: { type: 'string' },
      },
      required: ['building_id', 'message'],
    },
  },
  {
    name: 'start_tour',
    description: '캠퍼스 자동 투어를 시작한다.',
    input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
  },
  {
    name: 'unknown',
    description: '요청을 처리할 수 없을 때 안내 문구만 돌려준다.',
    input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function toAction(
  name: string,
  input: Record<string, unknown>,
  query: string,
): GuideAction | null {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const known = (v: unknown) => (typeof v === 'string' && ids.includes(v) ? v : undefined);
  const message = str(input.message) ?? '';
  // 강의실은 LLM이 준 이름 → 사용자 문장 순서로 건물 안에서 찾아 정확한 ID로 바꾼다.
  const roomIn = (bid: string) =>
    findRoom(str(input.room_query) ?? '', index.rooms, bid).room?.id ??
    findRoom(query, index.rooms, bid).room?.id ??
    null;
  switch (name) {
    case 'navigate': {
      const to = known(input.to_id);
      return to
        ? {
            action: 'navigate',
            from_id: known(input.from_id) ?? null,
            to_id: to,
            room_id: roomIn(to),
            message,
          }
        : null;
    }
    case 'focus_building': {
      const id = known(input.building_id);
      return id ? { action: 'focus_building', building_id: id, room_id: roomIn(id), message } : null;
    }
    case 'start_tour':
      return { action: 'start_tour', message };
    case 'unknown':
      return { action: 'unknown', message };
    default:
      return null;
  }
}

function searchHint(query: string): string {
  const { room, ambiguous } = findRoom(query, index.rooms);
  const name = (id: string) => buildings.find((b) => b.id === id)?.name ?? id;
  if (room) return `\n\n[검색 참고] '${room.name}' → ${name(room.building_id)}(${room.building_id}) ${room.floor_label}`;
  if (ambiguous.length) {
    const list = [...new Set(ambiguous.map((r) => `${name(r.building_id)}(${r.building_id})`))];
    return `\n\n[검색 참고] '${ambiguous[0]!.name}'이 여러 건물에 있음: ${list.join(', ')}`;
  }
  return '';
}

async function askLlm(query: string, apiKey: string): Promise<GuideAction | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: query + searchHint(query) }],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = (await res.json()) as {
    content?: { type: string; name?: string; input?: Record<string, unknown> }[];
  };
  const call = data.content?.find((c) => c.type === 'tool_use');
  return call?.name ? toAction(call.name, call.input ?? {}, query) : null;
}

export async function POST(request: Request): Promise<Response> {
  let query = '';
  try {
    const body = (await request.json()) as { query?: unknown };
    query = typeof body.query === 'string' ? body.query.trim() : '';
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  if (!query || query.length > MAX_QUERY) {
    return json({ error: `query는 1~${MAX_QUERY}자여야 합니다.` }, 400);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const action = await askLlm(query, apiKey);
      // LLM이 모르겠다고 하면 규칙 기반이 찾는지 한 번 더 본다.
      if (action && action.action !== 'unknown') {
        return json({ result: action, source: 'llm' } satisfies GuideResponse);
      }
      const fb = fallbackMatch(query, index);
      if (fb.action !== 'unknown' || !action) {
        return json({ result: fb, source: 'fallback' } satisfies GuideResponse);
      }
      return json({ result: action, source: 'llm' } satisfies GuideResponse);
    } catch (err) {
      console.error('[guide] LLM 실패 → 폴백', err);
    }
  }
  return json({ result: fallbackMatch(query, index), source: 'fallback' } satisfies GuideResponse);
}
