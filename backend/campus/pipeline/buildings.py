"""OSM 건물 → 캠퍼스 건물 / 주변(context) 건물 분류와 정리."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from shapely import make_valid
from shapely.geometry import MultiPolygon, Point, Polygon

from campus.config import (
    BUILDING_META_PATH,
    CONTEXT_RADIUS_M,
    DEFAULT_FLOOR_HEIGHT_M,
    DEFAULT_LEVELS,
)
from campus.models import Building, ContextBuilding
from campus.pipeline.osm import way_coords
from campus.pipeline.project import Projector

# 주변 건물 층수가 없을 때 용도별 추정 높이(m)
CONTEXT_DEFAULT_HEIGHT = {
    "apartments": 36.0,
    "residential": 10.0,
    "house": 7.0,
    "commercial": 12.0,
    "industrial": 9.0,
}


@dataclass
class BuildingReport:
    campus: int = 0
    context: int = 0
    skipped: int = 0
    estimated_levels: list[str] = field(default_factory=list)
    unnamed: list[str] = field(default_factory=list)


def load_meta(path: Path = BUILDING_META_PATH) -> dict[str, dict[str, Any]]:
    """OSM ID → 우리 팀이 관리하는 메타데이터(id, name, aliases, description …)"""
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def to_polygon(local: list[tuple[float, float]], min_area: float = 4.0) -> Polygon | None:
    if len(local) < 4:
        return None
    geom = make_valid(Polygon(local))
    if isinstance(geom, MultiPolygon):
        geom = max(geom.geoms, key=lambda g: g.area)
    if not isinstance(geom, Polygon) or geom.area < min_area:
        return None
    return geom.simplify(min(0.2, min_area / 20), preserve_topology=True)


def exterior(poly: Polygon) -> list[tuple[float, float]]:
    coords = list(poly.exterior.coords)[:-1]
    return [(round(x, 2), round(z, 2)) for x, z in coords]


def parse_levels(tags: dict[str, str]) -> int | None:
    m = re.match(r"\d+", tags.get("building:levels", ""))
    return int(m.group()) if m else None


def campus_boundary(elements: list[dict[str, Any]], proj: Projector, way_id: int) -> Polygon:
    for el in elements:
        if el.get("type") == "way" and el.get("id") == way_id:
            poly = to_polygon(proj.many(way_coords(el)))
            if poly is not None:
                return poly
    raise ValueError(f"캠퍼스 경계 way({way_id})를 원본 데이터에서 찾지 못했습니다.")


def classify(
    elements: list[dict[str, Any]],
    proj: Projector,
    boundary: Polygon,
    meta: dict[str, dict[str, Any]],
    context_radius: float = CONTEXT_RADIUS_M,
) -> tuple[list[Building], list[ContextBuilding], BuildingReport]:
    report = BuildingReport()
    campus: list[Building] = []
    context: list[ContextBuilding] = []
    inside = boundary.buffer(5.0)
    origin = Point(0, 0)

    for el in elements:
        tags = el.get("tags", {})
        if el.get("type") != "way" or "building" not in tags:
            continue
        poly = to_polygon(proj.many(way_coords(el)))
        if poly is None:
            report.skipped += 1
            continue

        rep = poly.representative_point()
        levels = parse_levels(tags)

        # building=roof(캐노피·지붕 구조물)는 클릭 대상이 아니므로 배경으로 둔다.
        if inside.contains(rep) and tags.get("building") != "roof":
            m = meta.get(str(el["id"]), {})
            if m.get("disabled"):
                continue
            bid = m.get("id") or f"osm_{el['id']}"
            name = m.get("name") or tags.get("name") or "이름 미확인 건물"
            if not (m.get("name") or tags.get("name")):
                report.unnamed.append(bid)
            lv = m.get("levels") or levels
            if lv is None:
                report.estimated_levels.append(bid)
            c = poly.centroid
            campus.append(
                Building(
                    id=bid,
                    name=name,
                    aliases=m.get("aliases", [name] if name != "이름 미확인 건물" else []),
                    osm_id=el["id"],
                    levels=lv or DEFAULT_LEVELS,
                    levels_estimated=lv is None,
                    basements=m.get("basements", 0),
                    floor_height=m.get("floor_height", DEFAULT_FLOOR_HEIGHT_M),
                    footprint=exterior(poly),
                    center=(round(c.x, 2), round(c.y, 2)),
                    description=m.get("description", ""),
                    facilities=m.get("facilities", []),
                )
            )
            report.campus += 1
        elif rep.distance(origin) <= context_radius:
            height = (
                levels * 3.0
                if levels
                else CONTEXT_DEFAULT_HEIGHT.get(tags.get("building", ""), 9.0)
            )
            if tags.get("building") == "roof":
                height = 4.0
            context.append(ContextBuilding(footprint=exterior(poly), height=height))
            report.context += 1

    campus.sort(key=lambda b: (b.id.startswith("osm_"), b.name))
    return campus, context, report
