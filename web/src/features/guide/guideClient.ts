import type { BuildingIndexEntry, GuideResponse } from '../../types/generated/campus';
import { fallbackMatch } from './fallbackMatcher';

const ACTIONS = new Set(['navigate', 'focus_building', 'start_tour', 'unknown']);

function isGuideResponse(v: unknown): v is GuideResponse {
  const r = v as GuideResponse | undefined;
  return !!r && typeof r === 'object' && !!r.result && ACTIONS.has(r.result.action);
}

/**
 * /api/guide(Vercel 함수)에 묻는다. 로컬 `npm run dev`처럼 함수가 없거나
 * 네트워크가 실패하면 브라우저에서 바로 규칙 기반 폴백으로 답한다.
 */
export async function askGuide(
  query: string,
  buildings: BuildingIndexEntry[],
): Promise<GuideResponse> {
  try {
    const res = await fetch('/api/guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data: unknown = await res.json();
      if (isGuideResponse(data)) return data;
    }
  } catch {
    // 아래 폴백으로
  }
  return { result: fallbackMatch(query, buildings), source: 'fallback' };
}
