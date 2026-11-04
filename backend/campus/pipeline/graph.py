"""OSM 도로·보행로 → 보행로 그래프 생성, 건물 입구 연결, 연결성 검증."""

import math
from dataclasses import dataclass, field
from typing import Any

import networkx as nx
from shapely.geometry import Point, Polygon
from shapely.ops import nearest_points

from campus.config import GRAPH_BOUNDARY_BUFFER_M, MAX_ENTRANCE_LINK_M
from campus.models import Building, PathEdge, PathGraph, PathNode
from campus.pipeline.osm import way_coords
from campus.pipeline.project import Projector

HIGHWAY_KIND = {
    "footway": "walk",
    "path": "walk",
    "pedestrian": "walk",
    "living_street": "walk",
    "steps": "stairs",
    "service": "road",
    "residential": "road",
    "unclassified": "road",
    "tertiary": "road",
    "tertiary_link": "road",
}


@dataclass
class GraphReport:
    nodes: int = 0
    edges: int = 0
    components_before: int = 0
    dropped_nodes: int = 0
    linked_buildings: int = 0
    unlinked_buildings: list[str] = field(default_factory=list)
    real_doors: int = 0


def _dist(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def build_raw_graph(elements: list[dict[str, Any]], proj: Projector, region: Polygon) -> nx.Graph:
    """OSM way를 그래프로. 같은 좌표를 공유하는 점은 같은 노드가 된다."""
    g = nx.Graph()
    for el in elements:
        kind = HIGHWAY_KIND.get(el.get("tags", {}).get("highway", ""))
        if el.get("type") != "way" or kind is None:
            continue
        pts = proj.many(way_coords(el))
        for a, b in zip(pts, pts[1:], strict=False):
            if a == b:
                continue
            if not (region.contains(Point(a)) or region.contains(Point(b))):
                continue
            g.add_node(a)
            g.add_node(b)
            g.add_edge(a, b, kind=kind, length=round(_dist(a, b), 2))
    return g


Door = tuple[tuple[float, float], int | None]
"""(문 위치 [x, z], 층 index — 모르면 None)"""

DOOR_MERGE_M = 5.0


def _nearest_node(nodes: list[tuple[float, float]], p: tuple[float, float]) -> tuple[float, float]:
    return min(nodes, key=lambda n: _dist(n, p))


def link_entrances(
    g: nx.Graph,
    buildings: list[Building],
    doors: dict[str, list[Door]] | None = None,
    max_link: float = MAX_ENTRANCE_LINK_M,
) -> tuple[dict[str, list[tuple[tuple[float, float], int | None]]], list[str], int]:
    """건물 출입구 노드를 만들어 보행로에 잇는다.

    - doors(층·강의실 데이터의 실제 출입구)가 있으면 그 위치마다 입구를 만든다.
    - 없으면 외곽선에서 보행로와 가장 가까운 지점 하나를 입구로 추정한다.
    반환: (건물 → [(입구 좌표, 층)]), 연결 못 한 건물, 실제 출입구로 만든 입구 수
    """
    doors = doors or {}
    result: dict[str, list[tuple[tuple[float, float], int | None]]] = {}
    unlinked: list[str] = []
    real = 0
    graph_nodes = list(g.nodes)
    if not graph_nodes:
        return result, [b.id for b in buildings], 0

    for b in buildings:
        poly = Polygon(b.footprint)
        placed: list[tuple[tuple[float, float], int | None]] = []
        for (dx, dz), floor in doors.get(b.id, []):
            # 문은 건물 안쪽 벽 근처에 그려져 있으므로 외벽 위의 가장 가까운 점으로 옮긴다
            p, _ = nearest_points(poly.exterior, Point(dx, dz))
            door = (round(p.x, 2), round(p.y, 2))
            if any(_dist(door, q) < DOOR_MERGE_M for q, _ in placed):
                continue
            best = _nearest_node(graph_nodes, door)
            if _dist(door, best) > max_link:
                continue
            placed.append((door, floor))
            g.add_node(door, entrance_of=b.id)
            if door != best:
                g.add_edge(door, best, kind="walk", length=round(_dist(door, best), 2))
        real += len(placed)

        if not placed:  # 실제 출입구 정보가 없으면 추정
            best = min(graph_nodes, key=lambda n: poly.exterior.distance(Point(n)))
            if poly.exterior.distance(Point(best)) > max_link:
                unlinked.append(b.id)
                continue
            p, _ = nearest_points(poly.exterior, Point(best))
            door = (round(p.x, 2), round(p.y, 2))
            g.add_node(door, entrance_of=b.id)
            if door != best:
                g.add_edge(door, best, kind="walk", length=round(_dist(door, best), 2))
            placed.append((door, None))
        result[b.id] = placed
    return result, unlinked, real


def build_graph(
    elements: list[dict[str, Any]],
    proj: Projector,
    boundary: Polygon,
    buildings: list[Building],
    doors: dict[str, list[Door]] | None = None,
    buffer_m: float = GRAPH_BOUNDARY_BUFFER_M,
) -> tuple[PathGraph, GraphReport]:
    report = GraphReport()
    g = build_raw_graph(elements, proj, boundary.buffer(buffer_m))
    report.components_before = nx.number_connected_components(g) if g else 0

    # 가장 큰 연결 요소만 남기고, 그 위에 건물 입구를 연결한다.
    if g.number_of_nodes():
        main = max(nx.connected_components(g), key=len)
        report.dropped_nodes = g.number_of_nodes() - len(main)
        g = g.subgraph(main).copy()

    entrances, unlinked, real = link_entrances(g, buildings, doors)
    report.linked_buildings = len(entrances)
    report.unlinked_buildings = unlinked
    report.real_doors = real

    door_info: dict[tuple[float, float], tuple[str, int, int | None]] = {}
    for bid, placed in entrances.items():
        for k, (pt, floor) in enumerate(placed):
            door_info[pt] = (bid, k, floor)

    ids: dict[tuple[float, float], str] = {}
    nodes: list[PathNode] = []
    for i, n in enumerate(sorted(g.nodes)):
        info = door_info.get(n)
        if info:
            bid, k, floor = info
            nid = f"e_{bid}_{k}"
            nodes.append(
                PathNode(
                    id=nid, x=n[0], z=n[1], type="entrance", building_id=bid, floor_index=floor
                )
            )
        else:
            nid = f"n{i}"
            nodes.append(PathNode(id=nid, x=n[0], z=n[1]))
        ids[n] = nid

    edges = [
        PathEdge(a=ids[a], b=ids[b], kind=d["kind"], length=d["length"])
        for a, b, d in g.edges(data=True)
    ]
    for b in buildings:
        b.entrances = [ids[pt] for pt, _ in entrances.get(b.id, [])]

    report.nodes, report.edges = len(nodes), len(edges)
    return PathGraph(nodes=nodes, edges=edges), report
