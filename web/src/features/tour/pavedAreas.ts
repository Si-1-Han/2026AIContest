/** 정문 외벽을 지난 본관 앞 순환 도로. 내부의 고립된 보도 조각은 아스팔트로 바꾼다. */
export const MAIN_ROAD_FORECOURT: [number, number][] = [[-115,-183],[45,-183],[45,-128],[-115,-128]];
/** 영비관 앞 주차장과 계단 하부 접근부에는 별도 보도를 만들지 않는다. */
export const VISION_GROUND_APRON: [number, number][] = [[-50,110],[18,110],[18,140],[-50,140]];
/** 음악관 뒤부터 영비관 앞까지는 보도 섬 없이 차도와 주차장으로 이어진다. */
export const MUSIC_TO_VISION_ASPHALT: [number, number][] = [[-65,35], [31,35], [31,147], [-40,153], [-65,153]];
