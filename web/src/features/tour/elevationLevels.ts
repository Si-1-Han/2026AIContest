/** 사용자 지도에 따른 상대 고도. 실측값이 아닌 투어 표현용 높이(m). */
export const SLOPE_GAIN = 1.3;
export const MUSIC_FORECOURT_LEVEL = 4 * SLOPE_GAIN;
// 음악관 앞과 중앙 주차장·영비관 1층은 하나의 수평 대지다.
export const PARKING_LEVEL = MUSIC_FORECOURT_LEVEL;
// 영비관 1층에서 2층 외부 통로까지 실제 모델의 한 층 높이와 맞춘다.
export const STAIR_RISE = 3.6;
export const MIDDLE_LEVEL = PARKING_LEVEL + STAIR_RISE;
export const UPPER_CAMPUS_LEVEL = MIDDLE_LEVEL + STAIR_RISE;
export const BUILDING_ELEVATIONS: Record<string, number> = {
  main: 2.4 * SLOPE_GAIN, graduate: 4 * SLOPE_GAIN, design: 4 * SLOPE_GAIN, gemi: 4 * SLOPE_GAIN, music: MUSIC_FORECOURT_LEVEL,
  vision_center: PARKING_LEVEL, rodem: MIDDLE_LEVEL,
  science: UPPER_CAMPUS_LEVEL, student_union: UPPER_CAMPUS_LEVEL,
  theology: UPPER_CAMPUS_LEVEL, vision: UPPER_CAMPUS_LEVEL,
};
export const buildingElevation = (id: string) => BUILDING_ELEVATIONS[id] ?? 0;
