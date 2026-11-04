"""경로 탐색: 출입구 자동 선택 + 실내 층 이동 + 안내 모드 + 대안 경로.

그래프 구성
  보행로 그래프(paths.json) 위에 가상 출발점 S와 도착점 T를 둔다.
  S → 출발 건물의 각 출입구, 도착 건물의 각 출입구 → T 간선의 비용은
  "강의실 ↔ 출입구" 실내 이동 시간(층 이동 포함)이다.
  그래서 S → T 최단 경로를 찾으면 출입구 조합까지 함께 최적화된다.
"""

import math
from collections.abc import Callable
from dataclasses import dataclass

import networkx as nx
from shapely.geometry import Polygon

from campus.models import (
    Building,
    BuildingInterior,
    CampusData,
    PathGraph,
    PathNode,
    Room,
    RouteProfile,
    RouteRequest,
    RouteResponse,
)

# 보행 속도 (m/s)
SPEED = {"walk": 1.25, "road": 1.2, "stairs": 0.7}
INDOOR_SPEED = 1.0
INDOOR_DETOUR = 1.3  # 복도를 돌아가는 거리 보정
STAIRS_PER_FLOOR_S = 16.0
ELEVATOR_WAIT_S = 40.0
ELEVATOR_PER_FLOOR_S = 3.0

WALKWAY_ROAD_PENALTY = 1.6  # 보행로 우선: 차도 구간을 실제보다 멀게 본다
NO_ELEVATOR_PENALTY = 3.0  # 엘리베이터 우선인데 계단밖에 없을 때

MAX_ALTERNATIVES = 2
ALT_MAX_COST_RATIO = 1.5
ALT_MAX_OVERLAP = 0.6
ALT_SEARCH_LIMIT = 40

SOURCE, TARGET = "__S", "__T"


class RouteError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass
class Place:
    building: Building
    room: Room | None
    floor_index: int | None


@dataclass
class Indoor:
    """강의실 ↔ 출입구 실내 이동"""

    seconds: float
    method: str  # same_floor | stairs | elevator | none
    floors: int
    room_floor: str | None
    door_floor: str
    warning: str | None = None


def edge_seconds(kind: str, length: float) -> float:
    return length / SPEED.get(kind, SPEED["walk"])


def edge_cost(kind: str, length: float, profile: RouteProfile) -> float | None:
    """탐색용 비용. None이면 그 간선은 쓰지 않는다."""
    if kind == "stairs" and profile == "accessible":
        return None
    t = edge_seconds(kind, length)
    if profile == "walkway" and kind == "road":
        t *= WALKWAY_ROAD_PENALTY
    return t


class RoutingEngine:
    def __init__(
        self,
        campus: CampusData,
        graph: PathGraph,
        interior: Callable[[str], BuildingInterior | None],
    ) -> None:
        self.campus = campus
        self.buildings = {b.id: b for b in campus.buildings}
        self.footprints = {b.id: Polygon(b.footprint) for b in campus.buildings}
        self.nodes: dict[str, PathNode] = {n.id: n for n in graph.nodes}
        self.interior = interior
        self.g = nx.Graph()
        for n in graph.nodes:
            self.g.add_node(n.id)
        for e in graph.edges:
            self.g.add_edge(e.a, e.b, kind=e.kind, length=e.length)

    # ── 장소·실내 ────────────────────────────────────────────────────────────

    def place(self, building_id: str, room_id: str | None) -> Place:
        b = self.buildings.get(building_id)
        if b is None:
            raise RouteError(404, f"건물 '{building_id}'를 찾을 수 없습니다.")
        if not room_id:
            return Place(b, None, None)
        parts = room_id.split(":")
        interior = self.interior(b.id)
        if len(parts) != 3 or parts[0] != b.id or interior is None:
            raise RouteError(404, f"강의실 '{room_id}'를 찾을 수 없습니다.")
        fi = int(parts[1]) if parts[1].isdigit() else -1
        floor = interior.floors[fi] if 0 <= fi < len(interior.floors) else None
        room = next((r for r in floor.rooms if r.id == room_id), None) if floor else None
        if room is None:
            raise RouteError(404, f"강의실 '{room_id}'를 찾을 수 없습니다.")
        return Place(b, room, fi)

    def floor_label(self, b: Building, index: int | None) -> str:
        if index is not None and 0 <= index < len(b.floors):
            return b.floors[index].label
        return "1F"

    def door_floor(self, b: Building, door: PathNode) -> int:
        # 추정 입구는 지상 1층으로 본다 (지하층 수 = 1F의 index)
        return door.floor_index if door.floor_index is not None else b.basements

    def has_elevator(self, b: Building, floors: tuple[int, int]) -> bool:
        interior = self.interior(b.id)
        if interior is None:
            return False
        lo, hi = sorted(floors)
        return all(
            any(r.group == "elevators" for r in interior.floors[i].rooms)
            for i in (lo, hi)
            if 0 <= i < len(interior.floors)
        )

    def indoor(self, place: Place, door: PathNode, profile: RouteProfile) -> Indoor:
        b = place.building
        df = self.door_floor(b, door)
        door_label = self.floor_label(b, df)
        if place.room is None or place.floor_index is None:
            return Indoor(0.0, "none", 0, None, door_label)

        c = Polygon(place.room.polygon).centroid
        horizontal = math.hypot(c.x - door.x, c.y - door.z) * INDOOR_DETOUR / INDOOR_SPEED
        floors = abs(place.floor_index - df)
        room_label = self.floor_label(b, place.floor_index)
        if floors == 0:
            return Indoor(horizontal, "same_floor", 0, room_label, door_label)

        stairs = floors * STAIRS_PER_FLOOR_S
        elevator_ok = self.has_elevator(b, (place.floor_index, df))
        elevator = ELEVATOR_WAIT_S + floors * ELEVATOR_PER_FLOOR_S if elevator_ok else math.inf

        if profile == "accessible":
            if elevator_ok:
                return Indoor(horizontal + elevator, "elevator", floors, room_label, door_label)
            return Indoor(
                horizontal + stairs * NO_ELEVATOR_PENALTY,
                "stairs",
                floors,
                room_label,
                door_label,
                warning=f"{b.name}에는 엘리베이터 정보가 없어 계단 이동이 필요할 수 있어요.",
            )
        if elevator < stairs:
            return Indoor(horizontal + elevator, "elevator", floors, room_label, door_label)
        return Indoor(horizontal + stairs, "stairs", floors, room_label, door_label)

    def doors(self, b: Building) -> list[PathNode]:
        return [self.nodes[i] for i in b.entrances if i in self.nodes]

    # ── 탐색 ────────────────────────────────────────────────────────────────

    def route(self, req: RouteRequest) -> RouteResponse:
        from campus.routing.directions import build_option, indoor_only_option

        origin = self.place(req.origin.building_id, req.origin.room_id)
        dest = self.place(req.destination.building_id, req.destination.room_id)
        profile = req.profile

        if origin.building.id == dest.building.id:
            return RouteResponse(
                profile=profile,
                engine="python-networkx",
                routes=[indoor_only_option(self, origin, dest, profile)],
            )

        o_doors, d_doors = self.doors(origin.building), self.doors(dest.building)
        if not o_doors or not d_doors:
            raise RouteError(422, "출입구가 보행로에 연결되지 않은 건물이에요.")

        h = nx.Graph()
        for a, b, d in self.g.edges(data=True):
            cost = edge_cost(d["kind"], d["length"], profile)
            if cost is not None:
                h.add_edge(a, b, w=cost)
        o_indoor = {n.id: self.indoor(origin, n, profile) for n in o_doors}
        d_indoor = {n.id: self.indoor(dest, n, profile) for n in d_doors}
        for nid, io in o_indoor.items():
            h.add_edge(SOURCE, nid, w=io.seconds)
        for nid, io in d_indoor.items():
            h.add_edge(nid, TARGET, w=io.seconds)

        try:
            candidates = nx.shortest_simple_paths(h, SOURCE, TARGET, weight="w")
            best = next(candidates)
        except (nx.NetworkXNoPath, nx.NodeNotFound, StopIteration) as err:
            raise RouteError(422, "두 건물을 잇는 경로를 찾지 못했어요.") from err

        chosen = [best]
        if req.alternatives:
            best_cost = nx.path_weight(h, best, weight="w")
            for i, path in enumerate(candidates):
                if len(chosen) > MAX_ALTERNATIVES or i >= ALT_SEARCH_LIMIT:
                    break
                if nx.path_weight(h, path, weight="w") > best_cost * ALT_MAX_COST_RATIO:
                    break
                if all(self._overlap(path, c) < ALT_MAX_OVERLAP for c in chosen):
                    chosen.append(path)

        routes = [
            build_option(
                self,
                path[1:-1],
                origin,
                dest,
                o_indoor[path[1]],
                d_indoor[path[-2]],
                profile,
                index=i,
            )
            for i, path in enumerate(chosen)
        ]
        return RouteResponse(profile=profile, engine="python-networkx", routes=routes)

    def _edges(self, path: list[str]) -> dict[frozenset[str], float]:
        inner = [n for n in path if n not in (SOURCE, TARGET)]
        return {
            frozenset((a, b)): self.g.edges[a, b]["length"]
            for a, b in zip(inner, inner[1:], strict=False)
        }

    def _overlap(self, a: list[str], b: list[str]) -> float:
        """a의 실외 거리 중 b와 겹치는 비율"""
        ea, eb = self._edges(a), self._edges(b)
        total = sum(ea.values()) or 1.0
        return sum(length for e, length in ea.items() if e in eb) / total
