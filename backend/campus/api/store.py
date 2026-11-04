"""파이프라인 산출물(JSON)을 읽고, DB의 편집 내용을 덧씌워 돌려준다."""

from pathlib import Path

from sqlmodel import Session, select

from campus.api.db import BuildingOverride
from campus.models import Building, BuildingInterior, BuildingPatch, CampusData, PathGraph


class CampusStore:
    def __init__(self, data_dir: Path) -> None:
        self.campus = CampusData.model_validate_json(
            (data_dir / "campus.json").read_text(encoding="utf-8")
        )
        self.graph = PathGraph.model_validate_json(
            (data_dir / "paths.json").read_text(encoding="utf-8")
        )
        self.building_ids = {b.id for b in self.campus.buildings}
        self._floors_dir = data_dir / "floors"
        self._interiors: dict[str, BuildingInterior] = {}

    def interior(self, building_id: str) -> BuildingInterior | None:
        """층·강의실 데이터 (처음 요청할 때 읽고 캐시)"""
        if building_id not in self.building_ids:
            return None
        if building_id not in self._interiors:
            path = self._floors_dir / f"{building_id}.json"
            if not path.exists():
                return None
            self._interiors[building_id] = BuildingInterior.model_validate_json(
                path.read_text(encoding="utf-8")
            )
        return self._interiors[building_id]

    def merged_campus(self, session: Session) -> CampusData:
        overrides = {o.building_id: o for o in session.exec(select(BuildingOverride))}
        if not overrides:
            return self.campus
        buildings = [
            _apply(b, overrides[b.id]) if b.id in overrides else b for b in self.campus.buildings
        ]
        return self.campus.model_copy(update={"buildings": buildings})

    def building(self, session: Session, building_id: str) -> Building | None:
        for b in self.merged_campus(session).buildings:
            if b.id == building_id:
                return b
        return None


def _apply(building: Building, override: BuildingOverride) -> Building:
    patch = BuildingPatch.model_validate_json(override.patch_json)
    return building.model_copy(update=patch.model_dump(exclude_none=True))
