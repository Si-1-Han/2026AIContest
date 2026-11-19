import { PARKING_LEVEL, SLOPE_GAIN, UPPER_CAMPUS_LEVEL } from './elevationLevels';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, value: number) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };

/** 건물 대지·도로 단면을 얹기 전의 캠퍼스 원지형(정문 0m → 윗캠퍼스). 투어 표현용 상대 고도. */
export function baseTerrain(x: number, z: number) {
  const north = 2.4 * SLOPE_GAIN * smooth(-217.57, -160.65, z);
  const cross = 1.6 * SLOPE_GAIN * smooth(-86.38, 24.17, x) * smooth(-176, -130, z);
  let y = north + blend(cross, 1.6 * SLOPE_GAIN, smooth(-136, -110, z));
  // 음악관·중앙 주차장·영비관 1층은 하나의 수평 대지(PARKING_LEVEL)이고, 윗캠퍼스는 그보다 두 층 위다.
  // 예전에는 음악관 뒤(z>35)부터 원지형을 1.5단 더 올려, 수평 대지·윗캠퍼스 도로와 건물이 2m 깊이 도랑에 잠기고
  // 음악관 뒤·서측 차도 옆에 잔디 둔덕이 솟았다. 원지형을 대지 높이에 맞춘다.
  const upper = Math.max(smooth(60, 170, z) * smooth(20, 60, x), smooth(165, 181, z));
  y += (UPPER_CAMPUS_LEVEL - PARKING_LEVEL) * upper;
  return y;
}
