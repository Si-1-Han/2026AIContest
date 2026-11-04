"""경로 엔진 테스트 — 저장소에 커밋된 실제 캠퍼스 데이터(web/public/data)를 사용한다."""

import pytest
from fastapi.testclient import TestClient

from campus.api.main import create_app
from campus.api.settings import Settings
from campus.api.store import CampusStore
from campus.config import WEB_DATA_DIR
from campus.models import RouteRequest
from campus.routing import RouteError, RoutingEngine
from campus.routing.directions import Polyline, classify, find_turns, floor_text, turn_delta


@pytest.fixture(scope="module")
def engine() -> RoutingEngine:
    store = CampusStore(WEB_DATA_DIR)
    return RoutingEngine(store.campus, store.graph, store.interior)


def req(o: str, d: str, profile: str = "recommended", o_room=None, d_room=None) -> RouteRequest:
    return RouteRequest(
        origin={"building_id": o, "room_id": o_room},
        destination={"building_id": d, "room_id": d_room},
        profile=profile,
    )


# ── 방향 계산 ────────────────────────────────────────────────────────────────


def test_turn_direction_follows_map_convention() -> None:
    # x = 동쪽, z = 남쪽. 북쪽으로 가다가 동쪽으로 꺾으면 오른쪽
    north, east, west = 0.0, 90.0, 270.0
    assert classify(turn_delta(north, east)) == "right"
    assert classify(turn_delta(north, west)) == "left"
    assert classify(turn_delta(north, 10.0)) == "straight"
    assert classify(turn_delta(north, 45.0)) == "slight_right"


def test_find_turns_on_l_shape() -> None:
    # 북쪽 50m 후 동쪽 50m → 오른쪽 한 번
    line = Polyline([(0, 0), (0, -25), (0, -50), (25, -50), (50, -50)])
    turns = find_turns(line)
    assert len(turns) == 1 and classify(turns[0][1]) == "right"


def test_floor_text() -> None:
    assert floor_text("B1") == "지하 1층" and floor_text("3F") == "3층"


# ── 경로 ─────────────────────────────────────────────────────────────────────


def test_route_with_destination_room(engine: RoutingEngine) -> None:
    res = engine.route(req("music", "science", d_room="science:2:4"))
    best = res.routes[0]
    assert res.engine == "python-networkx" and best.label == "추천"
    assert [s.maneuver for s in best.steps][0] == "depart"
    assert best.steps[-2].maneuver == "arrive" and best.steps[-1].maneuver == "indoor"
    assert "3층" in best.steps[-1].instruction and "301호" in best.steps[-1].instruction
    assert best.indoor_s > 0 and best.distance_m > 50
    # 시간은 걸음 속도로 거리보다 길어야 한다
    assert best.duration_s > best.distance_m / 1.3
    assert best.points[0][0] != best.points[-1][0]


def test_entrance_chosen_by_destination_floor(engine: RoutingEngine) -> None:
    """대강당(본관 2F)으로 갈 때는 2층 출입구로 들어간다 (경사지)"""
    res = engine.route(req("student_union", "main", d_room="main:2:0"))
    assert res.routes[0].destination_door.floor_label == "2F"


def test_accessible_warns_when_no_elevator(engine: RoutingEngine) -> None:
    res = engine.route(req("science", "vision", "accessible", d_room="vision:4:3"))
    assert any("엘리베이터" in w for w in res.routes[0].warnings)


def test_walkway_profile_uses_less_road(engine: RoutingEngine) -> None:
    fast = engine.route(req("rodem", "graduate")).routes[0]
    walk = engine.route(req("rodem", "graduate", "walkway")).routes[0]
    assert walk.road_m <= fast.road_m


def test_alternatives_are_distinct(engine: RoutingEngine) -> None:
    res = engine.route(req("student_union", "main"))
    ids = [tuple(map(tuple, r.points)) for r in res.routes]
    assert len(set(ids)) == len(ids)
    assert res.routes[0].duration_s <= min(r.duration_s for r in res.routes)


def test_same_building_is_indoor_only(engine: RoutingEngine) -> None:
    res = engine.route(req("science", "science", o_room="science:0:2", d_room="science:2:4"))
    opt = res.routes[0]
    assert opt.points == [] and opt.steps[0].maneuver == "indoor" and opt.duration_s > 0


def test_unknown_places(engine: RoutingEngine) -> None:
    with pytest.raises(RouteError) as e:
        engine.route(req("nope", "science"))
    assert e.value.status == 404
    with pytest.raises(RouteError):
        engine.route(req("music", "science", d_room="science:99:0"))


def test_route_api(tmp_path) -> None:
    app = create_app(Settings(database_url=f"sqlite:///{tmp_path / 'r.db'}"))
    client = TestClient(app)
    body = {
        "origin": {"building_id": "music"},
        "destination": {"building_id": "science", "room_id": "science:2:4"},
        "profile": "accessible",
    }
    r = client.post("/api/v1/route", json=body)
    assert r.status_code == 200 and r.json()["routes"][0]["steps"]
    assert client.post("/api/v1/route", json={**body, "profile": "fly"}).status_code == 422
    bad = {**body, "origin": {"building_id": "nope"}}
    assert client.post("/api/v1/route", json=bad).status_code == 404
