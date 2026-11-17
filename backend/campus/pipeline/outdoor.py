"""OSM 야외시설 외곽선을 캠퍼스 로컬 좌표로 변환한다."""

import math
from typing import Any

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import nearest_points

from campus.config import MAX_ENTRANCE_LINK_M
from campus.models import Building, OutdoorArea, PathEdge, PathGraph, PathNode
from campus.pipeline.buildings import exterior, to_polygon
from campus.pipeline.osm import way_coords
from campus.pipeline.project import Projector

# 이름이 같은 주차 구역을 검색 결과에서 구분한다. 방위는 캠퍼스 좌표 기준이다.
PARKING_NAMES = {
    834838406: ("중앙 주차장", ["중앙주차장", "교내 중앙 주차장"]),
    970298858: ("남측 주차장", ["남쪽 주차장", "신학관 옆 주차장"]),
    970298862: ("북측 주차장", ["북쪽 주차장", "본관 옆 주차장"]),
}


def build_outdoor_areas(
    elements: list[dict[str, Any]], proj: Projector, boundary: Polygon
) -> list[OutdoorArea]:
    areas = []
    for element in elements:
        if element.get("type") != "way":
            continue
        tags = element.get("tags", {})
        if tags.get("amenity") == "parking" and "building" not in tags:
            kind, name = "parking", "주차장"
        elif tags.get("leisure") == "pitch" and tags.get("sport") == "tennis":
            kind, name = "tennis", "테니스장"
        elif tags.get("leisure") == "pitch" and tags.get("name") == "운동장":
            kind, name = "field", "운동장"
        else:
            continue
        polygon = to_polygon(proj.many(way_coords(element)))
        # 교외 주차장과 경계를 걸치는 시설은 교내 시설로 표시하지 않는다.
        if polygon is None or not boundary.buffer(1).covers(polygon):
            continue
        center = polygon.centroid
        aliases = [name]
        if kind == "parking":
            name, aliases = PARKING_NAMES.get(element["id"], (name, [name]))
        areas.append(
            OutdoorArea(
                id=f"{kind}_{element['id']}",
                name=name if kind == "parking" else tags.get("name", name),
                kind=kind,
                osm_id=element["id"],
                footprint=exterior(polygon),
                center=(round(center.x, 2), round(center.y, 2)),
                aliases=aliases,
                description=f"교내 {name}입니다. 길찾기는 가까운 보행로 접근 지점까지 안내합니다.",
            )
        )
    return sorted(areas, key=lambda area: area.id)


def link_outdoor_areas(
    graph: PathGraph, areas: list[OutdoorArea], buildings: list[Building]
) -> None:
    """야외시설 경계에 접근점을 붙인다. 건물 내부를 가로지르는 연결은 제외한다.

    실제 출입구 자료가 없으므로 가까운 보행로에서 시설 외곽까지의 접근을 추정한다.
    기존 노드 ID·건물 출입구를 유지하고 야외시설 전용 노드만 추가한다.
    """
    candidates = [n for n in graph.nodes if n.type == "junction"]
    obstacles = [Polygon(b.footprint).buffer(-0.1) for b in buildings]
    for area in areas:
        boundary = Polygon(area.footprint).exterior
        for node in sorted(candidates, key=lambda n: boundary.distance(Point(n.x, n.z))):
            point, _ = nearest_points(boundary, Point(node.x, node.z))
            x, z = round(point.x, 2), round(point.y, 2)
            length = math.hypot(x - node.x, z - node.z)
            if length > MAX_ENTRANCE_LINK_M:
                break
            segment = LineString([(x, z), (node.x, node.z)])
            if any(obstacle.intersects(segment) for obstacle in obstacles):
                continue
            nid = f"e_{area.id}_0"
            graph.nodes.append(PathNode(id=nid, x=x, z=z, type="entrance", building_id=area.id))
            graph.edges.append(PathEdge(a=nid, b=node.id, kind="walk", length=round(length, 2)))
            area.entrances = [nid]
            break
        if not area.entrances:
            raise ValueError(f"야외시설 '{area.name}'를 보행로에 연결하지 못했습니다.")
