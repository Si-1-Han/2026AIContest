from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from campus.api.main import create_app
from campus.api.settings import Settings
from campus.models import (
    Building,
    BuildingInterior,
    CampusData,
    InteriorFloor,
    PathEdge,
    PathGraph,
    PathNode,
    Room,
)

TOKEN = "test-token"


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    campus = CampusData(
        source_timestamp="2026-11-03T00:00:00Z",
        origin=(126.95336, 37.34524),
        crs="EPSG:5186",
        attribution="test",
        boundary=[(0, 0), (10, 0), (10, 10)],
        buildings=[
            Building(
                id="main",
                name="본관",
                levels=5,
                floor_height=3.6,
                footprint=[(0, 0), (5, 0), (5, 5), (0, 5)],
                center=(2.5, 2.5),
            ),
            Building(
                id="science",
                name="이공관",
                levels=4,
                floor_height=3.6,
                footprint=[(6, 0), (9, 0), (9, 3), (6, 3)],
                center=(7.5, 1.5),
            ),
        ],
        context=[],
    )
    graph = PathGraph(
        nodes=[PathNode(id="a", x=0, z=0), PathNode(id="b", x=1, z=0)],
        edges=[PathEdge(a="a", b="b", kind="walk", length=1)],
    )
    (tmp_path / "campus.json").write_text(campus.model_dump_json(), encoding="utf-8")
    (tmp_path / "paths.json").write_text(graph.model_dump_json(), encoding="utf-8")
    interior = BuildingInterior(
        building_id="main",
        attribution="test",
        floors=[
            InteriorFloor(
                index=0,
                level=1,
                label="1F",
                outline=[(0, 0), (5, 0), (5, 5), (0, 5)],
                rooms=[
                    Room(
                        id="main:0:0",
                        name="101호",
                        type="강의실",
                        category="공간",
                        color="#289D8F",
                        polygon=[(0, 0), (1, 0), (1, 1)],
                    )
                ],
            )
        ],
    )
    (tmp_path / "floors").mkdir()
    (tmp_path / "floors" / "main.json").write_text(interior.model_dump_json(), encoding="utf-8")
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        admin_token=TOKEN,
    )
    return TestClient(create_app(settings))


def test_health_and_read(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "buildings": 2, "nodes": 2}
    assert len(client.get("/api/v1/campus").json()["buildings"]) == 2
    assert client.get("/api/v1/buildings/main").json()["name"] == "본관"
    assert client.get("/api/v1/buildings/nope").status_code == 404
    assert len(client.get("/api/v1/graph").json()["edges"]) == 1


def test_interior(client: TestClient) -> None:
    body = client.get("/api/v1/buildings/main/interior").json()
    assert body["floors"][0]["rooms"][0]["name"] == "101호"
    assert client.get("/api/v1/buildings/science/interior").status_code == 404
    assert client.get("/api/v1/buildings/nope/interior").status_code == 404


def test_update_requires_token_and_merges(client: TestClient) -> None:
    url = "/api/v1/buildings/main"
    assert client.put(url, json={"description": "x"}).status_code == 401

    headers = {"X-Admin-Token": TOKEN}
    r = client.put(url, json={"description": "대학 본부"}, headers=headers)
    assert r.status_code == 200 and r.json()["description"] == "대학 본부"
    r = client.put(url, json={"facilities": ["총장실"]}, headers=headers)
    body = r.json()
    assert body["description"] == "대학 본부" and body["facilities"] == ["총장실"]
    assert client.get("/api/v1/campus").json()["buildings"][0]["facilities"] == ["총장실"]
    # 지오메트리 등 정의되지 않은 필드는 거부
    assert client.put(url, json={"levels": 99}, headers=headers).status_code == 422


def test_events_and_stats(client: TestClient) -> None:
    events = [
        {"type": "guide", "target_id": "science", "query": "이공관 가는 길", "success": True},
        {"type": "guide", "query": "아무말", "success": False},
        {"type": "route", "target_id": "science"},
        {"type": "route", "target_id": "main"},
        {"type": "search", "query": "본관"},
    ]
    for e in events:
        assert client.post("/api/v1/events", json=e).status_code == 202

    stats = client.get("/api/v1/stats").json()
    assert stats["total_events"] == 5
    assert stats["by_type"] == {"guide": 2, "route": 2, "search": 1}
    assert stats["top_destinations"][0] == {"building_id": "science", "count": 2}
    assert stats["guide_success_rate"] == 0.5
