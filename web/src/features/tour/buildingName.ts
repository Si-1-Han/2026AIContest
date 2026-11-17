import type { Building } from '../../types/generated/campus';

export function tourBuildingName(building: Pick<Building, 'id' | 'name'>): string {
  return building.id === 'gemi' ? 'GEMI관' : building.name;
}
