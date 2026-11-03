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


def link_entrances(
    g: nx.Graph, buildings: list[Building], max_link: float = MAX_ENTRANCE_LINK_M
) -> tuple[dict[str, tuple[float, float]], list[str]]:
    """각 건물 외곽선에서 가장 가까운 보행로 노드를 찾아 입구 노드를 만들고 연결한다."""
    entrances: dict[str, tuple[float, float]] = {}
    unlinked: list[str] = []
    graph_nodes = list(g.nodes)
    if not graph_nodes:
        return entrances, [b.id for b in buildings]

    for b in buildings:
        poly = Polygon(b.footprint)
        best = min(graph_nodes, key=lambda n: poly.exterior.distance(Point(n)))
        if poly.exterior.distance(Point(best)) > max_link:
            unlinked.append(b.id)
            continue
        p, _ = nearest_points(poly.exterior, Point(best))
        door = (round(p.x, 2), round(p.y, 2))
        g.add_node(door, entrance_of=b.id)
        if door != best:
            g.add_edge(door, best, kind="walk", length=round(_dist(door, best), 2))
        entrances[b.id] = door
    return entrances, unlinked


def build_graph(
    elements: list[dict[str, Any]],
    proj: Projector,
    boundary: Polygon,
    buildings: list[Building],
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

    entrances, unlinked = link_entrances(g, buildings)
    report.linked_buildings = len(entrances)
    report.unlinked_buildings = unlinked

    ids: dict[tuple[float, float], str] = {}
    nodes: list[PathNode] = []
    door_to_building = {door: bid for bid, door in entrances.items()}
    for i, n in enumerate(sorted(g.nodes)):
        bid = door_to_building.get(n)
        nid = f"e_{bid}" if bid else f"n{i}"
        ids[n] = nid
        nodes.append(
            PathNode(
                id=nid, x=n[0], z=n[1], type="entrance" if bid else "junction", building_id=bid
            )
        )

    edges = [
        PathEdge(a=ids[a], b=ids[b], kind=d["kind"], length=d["length"])
        for a, b, d in g.edges(data=True)
    ]
    for b in buildings:
        if b.id in entrances:
            b.entrances = [ids[entrances[b.id]]]

    report.nodes, report.edges = len(nodes), len(edges)
    return PathGraph(nodes=nodes, edges=edges), report
