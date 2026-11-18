"""사용자가 제공한 지도에 표시한 학교 출입구를 보행로 그래프에 연결한다."""

import json
import math
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import LineString, Point, Polygon

from campus.config import BACKEND_DIR
from campus.models import Building, OutdoorArea, PathEdge, PathGraph, PathNode, Point2
from campus.pipeline.project import Projector


class GateSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    position: Point2
    connections: list[Point2] = Field(min_length=1)
    aliases: list[str]
    description: str


def build_gates(
    graph: PathGraph,
    proj: Projector,
    buildings: list[Building],
    path: Path = BACKEND_DIR / "data" / "gates.json",
) -> list[OutdoorArea]:
    """도로 위 입구는 기존 간선을 나누고, 빠진 통로는 지정한 교내·외 도로에 잇는다."""
    raw = json.loads(path.read_text(encoding="utf-8"))  # Windows 기본 인코딩(cp949) 대신 UTF-8
    sources = [GateSource.model_validate(item) for item in raw]
    gates = []
    obstacles = [Polygon(b.footprint).buffer(-0.1) for b in buildings]
    for source in sources:
        if any(n.building_id == source.id for n in graph.nodes):
            raise ValueError(f"출입구 ID가 중복되었습니다: {source.id}")
        x, z = proj.to_local(*source.position)
        nid = f"e_{source.id}_0"
        node = PathNode(id=nid, x=x, z=z, type="gate", building_id=source.id)
        graph.nodes.append(node)
        for index, hint in enumerate(source.connections):
            _connect(graph, node, proj.to_local(*hint), index, obstacles)
        # 지도 위의 원형 위치 표식이며 출입구의 실측 외곽선이 아니다.
        footprint = [
            (
                round(x + 4 * math.cos(i * math.tau / 24), 2),
                round(z + 4 * math.sin(i * math.tau / 24), 2),
            )
            for i in range(24)
        ]
        gates.append(
            OutdoorArea(
                id=source.id,
                name=source.name,
                kind="gate",
                center=(x, z),
                footprint=footprint,
                entrances=[nid],
                aliases=source.aliases,
                description=source.description,
            )
        )
    return gates


def _connect(
    graph: PathGraph, gate: PathNode, hint: Point2, index: int, obstacles: list[Polygon]
) -> None:
    nodes = {n.id: n for n in graph.nodes}

    def line(edge: PathEdge) -> LineString:
        a, b = nodes[edge.a], nodes[edge.b]
        return LineString([(a.x, a.z), (b.x, b.z)])

    # 자신의 연결 간선을 다시 나누지 않는다. 기존 건물 접근로도 연결 후보로 쓴다.
    edges = [e for e in graph.edges if gate.id not in (e.a, e.b)]
    if not edges:
        raise ValueError(f"{gate.id}: 연결할 보행로가 없습니다.")
    edge = min(edges, key=lambda e: line(e).distance(Point(hint)))
    segment = line(edge)
    point = segment.interpolate(segment.project(Point(hint)))
    x, z = round(point.x, 2), round(point.y, 2)
    if point.distance(Point(hint)) > 2:
        raise ValueError(f"{gate.id}: 연결 기준점이 보행로에서 벗어났습니다.")
    connector = LineString([(gate.x, gate.z), (x, z)])
    if any(p.intersects(connector) for p in obstacles):
        raise ValueError(f"{gate.id}: 연결 통로가 건물을 가로지릅니다.")

    # 위치가 기존 도로 위에 있으면 해당 도로를 교문 노드에서 직접 나눈다.
    on_gate = math.hypot(gate.x - x, gate.z - z) < 0.1
    target = gate if on_gate else PathNode(id=f"g_{gate.building_id}_{index}", x=x, z=z)
    a, b = nodes[edge.a], nodes[edge.b]
    if math.hypot(a.x - x, a.z - z) < 0.05:
        target = a
    elif math.hypot(b.x - x, b.z - z) < 0.05:
        target = b
    else:
        if target is not gate:
            graph.nodes.append(target)
        graph.edges.remove(edge)
        for endpoint in (a, b):
            length = math.hypot(endpoint.x - target.x, endpoint.z - target.z)
            graph.edges.append(
                PathEdge(a=endpoint.id, b=target.id, kind=edge.kind, length=round(length, 2))
            )
    if target.id != gate.id:
        length = math.hypot(target.x - gate.x, target.z - gate.z)
        graph.edges.append(PathEdge(a=gate.id, b=target.id, kind="walk", length=round(length, 2)))
