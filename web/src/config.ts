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

/**
 * 한세대 마크(흰 바탕 + 파란 문자)에서 가져온 색감.
 * 배경은 아이보리, 캠퍼스 건물은 하늘색, 선·강조는 한세 블루(#184c80) 계열.
 */
export const COLORS = {
  background: '#fbf7ec', // 아이보리 하늘·안개
  ground: '#fdf9ef', // 캠퍼스 바깥 지면
  campus: '#f5ecd8', // 캠퍼스 부지 (지면보다 한 톤 짙게)
  building: '#86cbff', // 하늘색 건물
  buildingHover: '#d2eeff',
  buildingSelected: '#5aaef0',
  edge: '#2f74b5', // 한세 블루: 건물 모서리·캠퍼스 경계
  context: '#efe7d4', // 캠퍼스 밖 주변 건물 (배경에 묻히게)
  path: '#d4c39c', // 보행로
  route: '#0fa37f', // 길찾기 경로 (밝은 배경에서도 보이게 진하게)
  origin: '#f08c00', // 출발지
} as const;
