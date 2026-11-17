import type { Building, OutdoorArea } from '../../types/generated/campus';

export type NavigationPlace = Building | OutdoorArea;

export const PLACE_LABEL = {
  building: '건물',
  field: '운동장',
  tennis: '테니스장',
  parking: '주차장',
  gate: '학교 입구',
} as const;
