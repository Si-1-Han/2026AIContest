import networkx as nx
from shapely.geometry import LineString, Point, Polygon

from campus.api.store import CampusStore
from campus.config import WEB_DATA_DIR
from campus.models import RouteRequest
from campus.routing import RoutingEngine


def test_gates_connect_both_sides_of_campus_boundary() -> None:
    store = CampusStore(WEB_DATA_DIR)
    gates = [a for a in store.campus.outdoor_areas if a.kind == "gate"]
    assert {a.name for a in gates} == {"정문", "당정역 방향 입구", "당정초 방향 입구"}
    nodes = {n.id: n for n in store.graph.nodes}
    assert len(nodes) == len(store.graph.nodes)
    boundary = Polygon(store.campus.boundary)
    graph = nx.Graph()
    for edge in store.graph.edges:
        assert edge.a in nodes and edge.b in nodes
        graph.add_edge(edge.a, edge.b, length=edge.length)

    for gate in gates:
        node = nodes[gate.entrances[0]]
        assert node.type == "gate"
        assert boundary.exterior.distance(Point(node.x, node.z)) < 0.1
        neighbors = list(graph.neighbors(node.id))
        assert len(neighbors) == 2
        assert any(boundary.contains(Point(nodes[n].x, nodes[n].z)) for n in neighbors)
        assert any(not boundary.covers(Point(nodes[n].x, nodes[n].z)) for n in neighbors)
        # 통로는 실제 진출입 최단 경로로 쓰이며 건물 내부를 가로지르지 않는다.
        assert node.id in nx.shortest_path(graph, *neighbors, weight="length")
        for neighbor in neighbors:
            other = nodes[neighbor]
            segment = LineString([(node.x, node.z), (other.x, other.z)])
            assert all(
                not Polygon(b.footprint).buffer(-0.1).intersects(segment)
                for b in store.campus.buildings
            )


def test_gate_to_gate_route_uses_gate_names_without_indoor_floor() -> None:
    store = CampusStore(WEB_DATA_DIR)
    engine = RoutingEngine(store.campus, store.graph, store.interior)
    result = engine.route(
        RouteRequest(
            origin={"building_id": "gate_main"},
            destination={"building_id": "gate_dangjeong_station"},
        )
    ).routes[0]
    assert "정문" in result.steps[0].instruction
    assert "당정역 방향 입구" in result.steps[-1].instruction
    assert "1층" not in result.steps[-1].instruction
    assert not result.origin_door.estimated and not result.destination_door.estimated
