"""경로 → 사람이 읽는 단계별 안내 (턴 바이 턴, 랜드마크, 방위, 실내 층 이동)."""

import math
from typing import TYPE_CHECKING

from shapely.geometry import Point

from campus.models import Maneuver, RouteDoor, RouteOption, RouteProfile, RouteStep
from campus.routing.engine import (
    ELEVATOR_PER_FLOOR_S,
    ELEVATOR_WAIT_S,
    STAIRS_PER_FLOOR_S,
    Indoor,
    Place,
    edge_seconds,
)

if TYPE_CHECKING:
    from campus.routing.engine import RoutingEngine

LOOK_M = 8.0  # 방향을 잴 때 앞뒤로 보는 거리
TURN_MIN_DEG = 35.0
TURN_MERGE_M = 12.0  # 이 거리 안의 꺾임은 하나로 본다
LANDMARK_M = 18.0
ROAD_NOTE_SHARE = 0.5

COMPASS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]

TURN_TEXT: dict[Maneuver, str] = {
    "straight": "직진하세요",
    "slight_left": "왼쪽 방향으로 계속 가세요",
    "left": "왼쪽으로 도세요",
    "sharp_left": "왼쪽으로 크게 꺾으세요",
    "slight_right": "오른쪽 방향으로 계속 가세요",
    "right": "오른쪽으로 도세요",
    "sharp_right": "오른쪽으로 크게 꺾으세요",
}


def bearing(dx: float, dz: float) -> float:
    """북쪽 0°, 시계 방향. 좌표계는 x = 동쪽, z = 남쪽."""
    return math.degrees(math.atan2(dx, -dz)) % 360


def compass(deg: float) -> str:
    return COMPASS[round(deg / 45) % 8]


def turn_delta(b1: float, b2: float) -> float:
    """b1에서 b2로 바뀌는 각도. 양수 = 오른쪽, 음수 = 왼쪽"""
    return (b2 - b1 + 540) % 360 - 180


def classify(delta: float) -> Maneuver:
    a = abs(delta)
    if a < TURN_MIN_DEG:
        return "straight"
    side = "right" if delta > 0 else "left"
    if a < 60:
        return f"slight_{side}"  # type: ignore[return-value]
    if a < 135:
        return side  # type: ignore[return-value]
    return f"sharp_{side}"  # type: ignore[return-value]


class Polyline:
    def __init__(self, pts: list[tuple[float, float]]) -> None:
        self.pts = pts
        self.cum = [0.0]
        for a, b in zip(pts, pts[1:], strict=False):
            self.cum.append(self.cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))

    @property
    def length(self) -> float:
        return self.cum[-1]

    def at(self, d: float) -> tuple[float, float]:
        d = min(max(d, 0.0), self.length)
        for i in range(1, len(self.pts)):
            if self.cum[i] >= d:
                seg = self.cum[i] - self.cum[i - 1] or 1.0
                t = (d - self.cum[i - 1]) / seg
                a, b = self.pts[i - 1], self.pts[i]
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        return self.pts[-1]

    def heading(self, d0: float, d1: float) -> float:
        a, b = self.at(d0), self.at(d1)
        return bearing(b[0] - a[0], b[1] - a[1])


def find_turns(line: Polyline) -> list[tuple[int, float]]:
    """(꼭짓점 index, 꺾인 각도) — 가까운 꺾임은 가장 큰 것 하나만"""
    raw: list[tuple[int, float]] = []
    for i in range(1, len(line.pts) - 1):
        d = line.cum[i]
        if d < 3 or line.length - d < 3:
            continue
        delta = turn_delta(line.heading(d - LOOK_M, d), line.heading(d, d + LOOK_M))
        if abs(delta) >= TURN_MIN_DEG:
            raw.append((i, delta))
    picked: list[tuple[int, float]] = []
    for i, delta in raw:
        if picked and line.cum[i] - line.cum[picked[-1][0]] < TURN_MERGE_M:
            if abs(delta) > abs(picked[-1][1]):
                picked[-1] = (i, delta)
            continue
        picked.append((i, delta))
    return picked


def landmark(engine: "RoutingEngine", p: tuple[float, float], exclude: set[str]) -> str | None:
    best, best_d = None, LANDMARK_M
    for bid, poly in engine.footprints.items():
        if bid in exclude:
            continue
        d = poly.exterior.distance(Point(p))
        if d < best_d:
            best, best_d = engine.buildings[bid].name, d
    return best


# 읽는 소리 기준 받침 (ㄹ 받침은 8): 숫자·로마자
_SOUND_JONG = {"0": 21, "1": 8, "3": 16, "6": 1, "7": 8, "8": 8, "L": 8, "M": 16, "N": 4, "R": 8}


def _josa(word: str, a: str, b: str) -> str:
    """받침에 맞춰 조사를 붙인다. a = 받침 있을 때, b = 없을 때 (예: '으로'/'로')"""
    if not word:
        return word
    last = word[-1]
    code = ord(last) - 0xAC00
    if 0 <= code <= 11171:
        jong = code % 28
    elif last.upper() in _SOUND_JONG or last.isdigit() or last.isascii():
        jong = _SOUND_JONG.get(last.upper(), 0)
    else:
        return f"{word}{a}({b})"
    has = jong not in (0, 8) if a == "으로" else jong != 0
    return word + (a if has else b)


def floor_text(label: str | None) -> str:
    """'B1' → '지하 1층', '3F' → '3층'"""
    if not label:
        return "1층"
    if label.startswith("B"):
        return f"지하 {label[1:]}층"
    return f"{label.rstrip('F')}층"


def room_text(room) -> str:  # noqa: ANN001
    """대강당 구역처럼 이름만으로 알기 어려운 공간에 설명을 붙인다"""
    if room.space_group == "main-auditorium" and len(room.name) <= 2:
        return f"대강당 {room.name}구역"
    return room.name


def indoor_text(io: Indoor, room_name: str, leaving: bool) -> str:
    door_floor = floor_text(io.door_floor)
    how = "엘리베이터로" if io.method == "elevator" else "계단으로"
    if leaving:
        if io.method == "same_floor":
            return f"{room_name}에서 같은 층({door_floor}) 출입구로 이동하세요."
        return f"{room_name}에서 {how} {_josa(door_floor, '으로', '로')} 이동해 출입구로 나가세요."
    if io.method == "same_floor":
        return f"복도를 따라 {_josa(room_name, '으로', '로')} 가세요. 같은 층({door_floor})이에요."
    move = "올라가" if _floor_num(io.room_floor) > _floor_num(io.door_floor) else "내려가"
    target = _josa(floor_text(io.room_floor), "으로", "로")
    return f"{how} {target} {move} {_josa(room_name, '으로', '로')} 가세요."


def _floor_num(label: str | None) -> int:
    if not label:
        return 1
    return -int(label[1:]) if label.startswith("B") else int(label.rstrip("F") or 1)


def _door(engine: "RoutingEngine", place: Place, node_id: str) -> RouteDoor:
    node = engine.nodes[node_id]
    b = place.building
    return RouteDoor(
        node_id=node_id,
        building_id=b.id,
        floor_label=engine.floor_label(b, engine.door_floor(b, node)),
        estimated=node.floor_index is None,
    )


def _door_phrase(door: RouteDoor, building_name: str) -> str:
    if door.estimated:
        return f"{building_name} 출입구(추정)"
    return f"{building_name} {floor_text(door.floor_label)} 출입구"


def build_option(
    engine: "RoutingEngine",
    path: list[str],
    origin: Place,
    dest: Place,
    o_io: Indoor,
    d_io: Indoor,
    profile: RouteProfile,
    index: int,
) -> RouteOption:
    nodes = [engine.nodes[i] for i in path]
    pts = [(n.x, n.z) for n in nodes]
    line = Polyline(pts)
    kinds = [engine.g.edges[a, b]["kind"] for a, b in zip(path, path[1:], strict=False)]
    lengths = [engine.g.edges[a, b]["length"] for a, b in zip(path, path[1:], strict=False)]
    outdoor_s = sum(edge_seconds(k, length) for k, length in zip(kinds, lengths, strict=True))
    road_m = sum(length for k, length in zip(kinds, lengths, strict=True) if k == "road")
    exclude = {origin.building.id, dest.building.id}

    o_door, d_door = _door(engine, origin, path[0]), _door(engine, dest, path[-1])
    steps: list[RouteStep] = []

    def p3(p: tuple[float, float]) -> tuple[float, float, float]:
        return (round(p[0], 2), 0.0, round(p[1], 2))

    if origin.room is not None:
        steps.append(
            RouteStep(
                maneuver="indoor",
                instruction=indoor_text(o_io, room_text(origin.room), leaving=True),
                distance_m=0,
                duration_s=round(o_io.seconds),
                point=p3(pts[0]),
                floor_label=o_io.room_floor,
            )
        )

    # 구간 나누기: 출발 → 꺾임들 → 도착
    turns = find_turns(line)
    cuts = [0] + [i for i, _ in turns] + [len(pts) - 1]

    def segment(i0: int, i1: int) -> tuple[float, float, float]:
        """(거리, 시간, 차도 비율)"""
        dist = sum(lengths[i0:i1])
        secs = sum(
            edge_seconds(k, length) for k, length in zip(kinds[i0:i1], lengths[i0:i1], strict=True)
        )
        road = sum(
            length for k, length in zip(kinds[i0:i1], lengths[i0:i1], strict=True) if k == "road"
        )
        return dist, secs, (road / dist if dist else 0)

    noted = False

    def with_road_note(text: str, share: float) -> str:
        nonlocal noted
        if share >= ROAD_NOTE_SHARE and not noted:
            noted = True
            return f"{text} 차도를 따라가는 구간이니 차량에 주의하세요."
        return text

    first_dist, first_secs, first_road = segment(cuts[0], cuts[1])
    heading = line.heading(0, min(LOOK_M, line.length))
    steps.append(
        RouteStep(
            maneuver="depart",
            instruction=with_road_note(
                f"{_door_phrase(o_door, origin.building.name)}에서 나와 "
                f"{compass(heading)}쪽으로 {round(first_dist)}m 걸어가세요.",
                first_road,
            ),
            distance_m=round(first_dist, 1),
            duration_s=round(first_secs),
            point=p3(pts[0]),
            floor_label=o_door.floor_label,
        )
    )

    for k, (vi, delta) in enumerate(turns):
        dist, secs, road = segment(vi, cuts[k + 2])
        man = classify(delta)
        mark = landmark(engine, pts[vi], exclude)
        lead = f"{mark} 앞에서 " if mark else ""
        stairs = "stairs" in kinds[vi : cuts[k + 2]]
        text = f"{lead}{TURN_TEXT[man]}. {round(dist)}m 이동"
        if stairs:
            text += " (계단 포함)"
        steps.append(
            RouteStep(
                maneuver="stairs" if stairs and man == "straight" else man,
                instruction=with_road_note(text + ".", road),
                distance_m=round(dist, 1),
                duration_s=round(secs),
                point=p3(pts[vi]),
            )
        )

    steps.append(
        RouteStep(
            maneuver="arrive",
            instruction=f"{_door_phrase(d_door, dest.building.name)}에 도착했어요.",
            distance_m=0,
            duration_s=0,
            point=p3(pts[-1]),
            floor_label=d_door.floor_label,
        )
    )
    if dest.room is not None:
        steps.append(
            RouteStep(
                maneuver="indoor",
                instruction=indoor_text(d_io, room_text(dest.room), leaving=False),
                distance_m=0,
                duration_s=round(d_io.seconds),
                point=p3(pts[-1]),
                floor_label=d_io.room_floor,
            )
        )

    warnings = [w for w in (o_io.warning, d_io.warning) if w]
    if o_door.estimated or d_door.estimated:
        warnings.append("출입구 데이터가 없는 건물은 입구 위치를 추정했어요.")
    if profile == "walkway" and road_m > line.length * 0.5:
        warnings.append("보행로 데이터가 부족한 구간은 차도를 따라 안내해요.")
    elif road_m > line.length * 0.3:
        warnings.append(f"경로의 {round(road_m / line.length * 100)}%가 차도 구간이에요.")

    indoor_s = o_io.seconds + d_io.seconds
    return RouteOption(
        id=f"route-{index}",
        label="추천" if index == 0 else f"대안 {index}",
        distance_m=round(line.length, 1),
        duration_s=round(outdoor_s + indoor_s),
        indoor_s=round(indoor_s),
        road_m=round(road_m, 1),
        origin_door=o_door,
        destination_door=d_door,
        points=[p3(p) for p in pts],
        steps=steps,
        warnings=warnings,
    )


def indoor_only_option(
    engine: "RoutingEngine", origin: Place, dest: Place, profile: RouteProfile
) -> RouteOption:
    """같은 건물 안: 층 이동만 안내"""
    b = dest.building
    c = dest.room.polygon[0] if dest.room else b.center
    point = (round(c[0], 2), 0.0, round(c[1], 2))
    steps: list[RouteStep] = []
    seconds = 0.0
    warnings: list[str] = []
    if dest.room is None:
        text = f"이미 {b.name}에 있어요."
    elif origin.floor_index is None or origin.floor_index == dest.floor_index:
        floor = floor_text(engine.floor_label(b, dest.floor_index))
        text = f"{floor}에서 {_josa(room_text(dest.room), '으로', '로')} 가세요."
    else:
        floors = abs(dest.floor_index - origin.floor_index)  # type: ignore[operator]
        lift = engine.has_elevator(b, (origin.floor_index, dest.floor_index))  # type: ignore[arg-type]
        use_elevator = lift and (profile == "accessible" or floors >= 3)
        seconds = (
            ELEVATOR_WAIT_S + floors * ELEVATOR_PER_FLOOR_S
            if use_elevator
            else floors * STAIRS_PER_FLOOR_S
        )
        if profile == "accessible" and not lift:
            warnings.append(f"{b.name}에는 엘리베이터 정보가 없어요.")
        how = "엘리베이터로" if use_elevator else "계단으로"
        floor = floor_text(engine.floor_label(b, dest.floor_index))
        name = room_text(dest.room)
        text = f"{how} {_josa(floor, '으로', '로')} 이동해 {_josa(name, '으로', '로')} 가세요."
    steps.append(
        RouteStep(
            maneuver="indoor",
            instruction=text,
            distance_m=0,
            duration_s=round(seconds),
            point=point,
            floor_label=engine.floor_label(b, dest.floor_index),
        )
    )
    return RouteOption(
        id="route-0",
        label="건물 안",
        distance_m=0,
        duration_s=round(seconds),
        indoor_s=round(seconds),
        road_m=0,
        origin_door=None,
        destination_door=None,
        points=[],
        steps=steps,
        warnings=warnings,
    )
