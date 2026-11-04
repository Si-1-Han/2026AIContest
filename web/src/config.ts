/** 보행 속도 (m/s) — 소요 시간 표시용 */
export const WALKING_SPEED = 1.2;

/** Campus API 주소. 비어 있으면 정적 JSON만 쓴다. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

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
