/** 보행 속도 (m/s) — 소요 시간 표시용 */
export const WALKING_SPEED = 1.2;

/**
 * Campus API(Python) 주소.
 * - VITE_API_URL이 있으면 그 주소 (배포: Render 등)
 * - 없고 개발 모드(`npm run dev`)면 '' = 같은 주소. Vite가 /api/v1을 Python 서버로 넘겨 준다.
 * - `npm run dev:web`(mode static)이나 API 없는 배포면 사용하지 않음
 */
const envApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
export const API_URL = (envApi ?? '').replace(/\/$/, '');
export const API_ENABLED =
  import.meta.env.MODE !== 'static' && (Boolean(envApi) || import.meta.env.DEV);

/** Python API 연결 상태를 다시 확인하는 간격 */
export const API_HEALTH_INTERVAL_MS = 5000;

/** API 응답을 기다리는 최대 시간. 넘기면 정적 JSON으로 전환한다. */
export const API_TIMEOUT_MS = 2000;

export const COLORS = {
  background: '#0b1222',
  ground: '#111a2e',
  campus: '#17223d',
  building: '#dde6f6',
  buildingHover: '#ffffff',
  buildingSelected: '#8fe1ff',
  edge: '#4fd1ff',
  context: '#202b45',
  path: '#2f4a78',
  route: '#7cf7d4',
  origin: '#ffd166',
} as const;
