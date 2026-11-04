import { API_TIMEOUT_MS, API_URL } from '../config';
import type {
  BuildingIndex,
  BuildingInterior,
  CampusData,
  EventIn,
  PathGraph,
  RoomIndex,
} from '../types/generated/campus';

export type DataSourceKind = 'api' | 'static';

export interface LoadedData {
  campus: CampusData;
  graph: PathGraph;
  index: BuildingIndex;
  rooms: RoomIndex;
  source: DataSourceKind;
}

async function fetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  const res = await fetch(url, timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : undefined);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

const staticUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

/**
 * Campus API를 먼저 시도하고, 설정이 없거나 2초 안에 응답하지 않으면 정적 JSON을 쓴다.
 * 데모가 백엔드 상태에 좌우되지 않게 하기 위한 핵심 규칙이다.
 */
export async function loadData(): Promise<LoadedData> {
  const [index, rooms] = await Promise.all([
    fetchJson<BuildingIndex>(staticUrl('buildings-index.json')),
    fetchJson<RoomIndex>(staticUrl('rooms-index.json')),
  ]);

  if (API_URL) {
    try {
      const [campus, graph] = await Promise.all([
        fetchJson<CampusData>(`${API_URL}/api/v1/campus`, API_TIMEOUT_MS),
        fetchJson<PathGraph>(`${API_URL}/api/v1/graph`, API_TIMEOUT_MS),
      ]);
      return { campus, graph, index, rooms, source: 'api' };
    } catch (err) {
      console.warn('[dataSource] Campus API 응답 없음 → 정적 JSON 사용', err);
    }
  }

  const [campus, graph] = await Promise.all([
    fetchJson<CampusData>(staticUrl('campus.json')),
    fetchJson<PathGraph>(staticUrl('paths.json')),
  ]);
  return { campus, graph, index, rooms, source: 'static' };
}

/** 건물 하나의 층·강의실 (건물을 클릭할 때 불러온다) */
export async function loadInterior(buildingId: string): Promise<BuildingInterior> {
  if (API_URL) {
    try {
      return await fetchJson<BuildingInterior>(
        `${API_URL}/api/v1/buildings/${buildingId}/interior`,
        API_TIMEOUT_MS,
      );
    } catch {
      // 정적 파일로
    }
  }
  return fetchJson<BuildingInterior>(staticUrl(`floors/${buildingId}.json`));
}

/** 이용 이벤트 기록. 응답을 기다리지 않고, 실패해도 무시한다. */
export function sendEvent(event: EventIn): void {
  if (!API_URL) return;
  fetch(`${API_URL}/api/v1/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
    keepalive: true,
  }).catch(() => undefined);
}
