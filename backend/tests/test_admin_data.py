import hashlib
import json
import shutil

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from campus.api import admin_data
from campus.api.admin import admin_router
from campus.api.admin_data import public_timetable_router
from campus.config import BACKEND_DIR, WEB_DATA_DIR


@pytest.fixture
def data_client(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    shutil.copy(BACKEND_DIR / "data/building_meta.json", source)
    for name in ("raw", "interior"):
        shutil.copytree(BACKEND_DIR / "data" / name, source / name)
    (source / "timetables").mkdir()
    shutil.copy(BACKEND_DIR / "data/timetables/gemi_201.json", source / "timetables")
    output = tmp_path / "output"
    shutil.copytree(WEB_DATA_DIR, output)
    salt = b"test-salt"
    accounts = tmp_path / "accounts.json"
    accounts.write_text(
        json.dumps(
            {
                "accounts": [
                    {
                        "username": "tester",
                        "salt": salt.hex(),
                        "password_hash": hashlib.scrypt(
                            b"test", salt=salt, n=16384, r=8, p=1
                        ).hex(),
                    }
                ]
            }
        )
    )
    app = FastAPI()
    app.include_router(admin_router(accounts, source, output))
    app.include_router(public_timetable_router(source))
    client = TestClient(app)
    assert client.get("/api/v1/admin/buildings").status_code == 401
    assert (
        client.post(
            "/api/v1/admin/login", json={"username": "tester", "password": "test"}
        ).status_code
        == 200
    )
    return client, source, output


def course_body(data, file="gemi_201.json"):
    return {
        "revision": data["revision"],
        "file": file,
        "code": "TEST-001",
        "name": "Test class",
        "instructor": "Professor",
        "semester": "2026학년도 2학기",
        "credits": 2,
        "capacity": 20,
        "meetings": [{"day": "월", "start": "09:00", "end": "10:00"}],
    }


def test_course_crud_and_revision(data_client):
    client, source, _ = data_client
    data = client.get("/api/v1/admin/courses").json()
    body = course_body(data)
    assert client.post("/api/v1/admin/courses", json=body).status_code == 200
    assert client.post("/api/v1/admin/courses", json=body).status_code == 409
    table = client.get("/api/v1/timetables/gemi_201.json").json()
    assert table["rows"][0]["09:00-09:30"] == "TEST-001"
    assert any(s["code"] == "TEST-001" for s in table["sessions"])
    body["revision"] = client.get("/api/v1/admin/courses").json()["revision"]
    body["name"] = "Updated"
    body["meetings"] = [{"day": "화", "start": "10:00", "end": "11:00"}]
    assert client.put("/api/v1/admin/courses/gemi_201.json/TEST-001", json=body).status_code == 200
    table = client.get("/api/v1/timetables/gemi_201.json").json()
    assert table["courses"]["TEST-001"]["name"] == "Updated"
    assert table["rows"][0]["09:00-09:30"] is None
    assert table["rows"][1]["10:00-10:30"] == "TEST-001"
    rev = client.get("/api/v1/admin/courses").json()["revision"]
    assert (
        client.request(
            "DELETE", "/api/v1/admin/courses/gemi_201.json/TEST-001", json={"revision": rev}
        ).status_code
        == 200
    )
    assert "TEST-001" not in client.get("/api/v1/timetables/gemi_201.json").json()["courses"]
    assert list((source / "private/backups").rglob("*.json"))


def test_course_room_transfer_and_immutable_code(data_client):
    client, source, _ = data_client
    endpoint = "/api/v1/admin/courses"
    data = client.get(endpoint).json()
    body = course_body(data)
    assert client.post(endpoint, json=body).status_code == 200
    data = client.get(endpoint).json()
    destination = next(r for r in data["rooms"] if not (source / "timetables" / r["file"]).exists())
    body.update(revision=data["revision"], file=destination["file"])
    original = (source / "timetables/gemi_201.json").read_bytes()
    assert (
        client.put(
            f"{endpoint}/gemi_201.json/TEST-001", json={**body, "code": "CHANGED"}
        ).status_code
        == 422
    )
    assert (source / "timetables/gemi_201.json").read_bytes() == original
    response = client.put(f"{endpoint}/gemi_201.json/TEST-001", json=body)
    assert response.status_code == 200, response.text
    old = client.get("/api/v1/timetables/gemi_201.json").json()
    assert "TEST-001" not in old["courses"]
    assert old["rows"][0]["09:00-09:30"] is None
    assert all(s["code"] != "TEST-001" for s in old["sessions"])
    moved = client.get(f"/api/v1/timetables/{destination['file']}").json()
    assert moved["courses"]["TEST-001"]["name"] == body["name"]
    assert moved["room_id"] == destination["room_id"]
    assert moved["rows"][0]["09:00-09:30"] == "TEST-001"
    assert all(s["location"] == moved["source_location"] for s in moved["sessions"])
    # Move back: the now-empty source file and its index entry must disappear.
    body.update(revision=client.get(endpoint).json()["revision"], file="gemi_201.json")
    assert client.put(f"{endpoint}/{destination['file']}/TEST-001", json=body).status_code == 200
    assert client.get(f"/api/v1/timetables/{destination['file']}").status_code == 404
    assert all(t["file"] != destination["file"] for t in client.get("/api/v1/timetables").json())


def test_course_transfer_duplicate_and_write_failure_preserve_both_rooms(data_client, monkeypatch):
    client, source, _ = data_client
    data = client.get("/api/v1/admin/courses").json()
    body = course_body(data)
    assert client.post("/api/v1/admin/courses", json=body).status_code == 200
    data = client.get("/api/v1/admin/courses").json()
    destination = next(r for r in data["rooms"] if not (source / "timetables" / r["file"]).exists())
    body.update(revision=data["revision"], file=destination["file"])
    assert client.post("/api/v1/admin/courses", json=body).status_code == 200
    body["revision"] = client.get("/api/v1/admin/courses").json()["revision"]
    original = (source / "timetables/gemi_201.json").read_bytes()
    target = (source / "timetables" / destination["file"]).read_bytes()
    assert client.put("/api/v1/admin/courses/gemi_201.json/TEST-001", json=body).status_code == 409
    assert (source / "timetables/gemi_201.json").read_bytes() == original
    assert (source / "timetables" / destination["file"]).read_bytes() == target
    # An index write failure after both room files changed must roll back the transfer.
    empty = next(r for r in data["rooms"] if not (source / "timetables" / r["file"]).exists())
    body["file"] = empty["file"]
    index_path = source / "timetable_sources/room-index.json"
    original_write = admin_data.write
    failed = False

    def fail_once(path, content):
        nonlocal failed
        if path == index_path and not failed:
            failed = True
            raise OSError("Simulated failure")
        original_write(path, content)

    monkeypatch.setattr(admin_data, "write", fail_once)
    assert client.put("/api/v1/admin/courses/gemi_201.json/TEST-001", json=body).status_code == 500
    assert (source / "timetables/gemi_201.json").read_bytes() == original
    assert not (source / "timetables" / empty["file"]).exists()


def test_new_room_timetable_validation_and_deletion(data_client):
    client, source, _ = data_client
    data = client.get("/api/v1/admin/courses").json()
    room = next(
        room for room in data["rooms"] if not (source / "timetables" / room["file"]).exists()
    )
    body = course_body(data, room["file"])
    invalid = {**body, "meetings": [{"day": "월", "start": "12:00", "end": "10:00"}]}
    assert client.post("/api/v1/admin/courses", json=invalid).status_code == 422
    assert (
        client.post("/api/v1/admin/courses", json={**body, "file": "../escape.json"}).status_code
        == 422
    )
    assert client.post("/api/v1/admin/courses", json=body).status_code == 200
    assert any(t["file"] == room["file"] for t in client.get("/api/v1/timetables").json())
    rev = client.get("/api/v1/admin/courses").json()["revision"]
    assert (
        client.request(
            "DELETE", f"/api/v1/admin/courses/{room['file']}/TEST-001", json={"revision": rev}
        ).status_code
        == 200
    )
    assert client.get(f"/api/v1/timetables/{room['file']}").status_code == 404
    assert all(t["file"] != room["file"] for t in client.get("/api/v1/timetables").json())


def test_failed_write_rolls_back_and_anonymous_edit_is_denied(data_client, monkeypatch):
    client, source, _ = data_client
    data = client.get("/api/v1/admin/courses").json()
    body = course_body(data)
    anonymous = TestClient(client.app)
    assert anonymous.post("/api/v1/admin/courses", json=body).status_code == 401
    original = (source / "timetables/gemi_201.json").read_bytes()
    original_write = admin_data.write
    index_path = source / "timetable_sources/room-index.json"
    failed = False

    def fail_index_once(path, content):
        nonlocal failed
        if path == index_path and not failed:
            failed = True
            raise OSError("Simulated disk failure")
        original_write(path, content)

    monkeypatch.setattr(admin_data, "write", fail_index_once)
    assert client.post("/api/v1/admin/courses", json=body).status_code == 500
    assert (source / "timetables/gemi_201.json").read_bytes() == original
    assert client.get("/api/v1/admin/courses").json()["revision"] == data["revision"]


def test_building_update_add_delete_and_rollback(data_client):
    client, source, output = data_client
    data = client.get("/api/v1/admin/buildings").json()
    building = next(b for b in data["items"] if b["id"] == "gemi")
    body = {**building, "revision": data["revision"], "name": "Renamed GEMI"}
    response = client.put(f"/api/v1/admin/buildings/{building['osm_id']}", json=body)
    assert response.status_code == 200, response.text
    campus = json.loads((output / "campus.json").read_text(encoding="utf-8"))
    assert next(b for b in campus["buildings"] if b["id"] == "gemi")["name"] == "Renamed GEMI"
    assert client.put(f"/api/v1/admin/buildings/{building['osm_id']}", json=body).status_code == 409
    data = client.get("/api/v1/admin/buildings").json()
    assert (
        client.request(
            "DELETE",
            f"/api/v1/admin/buildings/{building['osm_id']}",
            json={"revision": data["revision"]},
        ).status_code
        == 409
    )
    # Remove a building without courses, and re-add the same existing map geometry.
    building = next(b for b in data["items"] if b["id"] == "design")
    assert (
        client.request(
            "DELETE",
            f"/api/v1/admin/buildings/{building['osm_id']}",
            json={"revision": data["revision"]},
        ).status_code
        == 200
    )
    campus = json.loads((output / "campus.json").read_text(encoding="utf-8"))
    assert "design" not in {b["id"] for b in campus["buildings"]}
    data = client.get("/api/v1/admin/buildings").json()
    body = {**building, "revision": data["revision"]}
    assert client.post("/api/v1/admin/buildings", json=body).status_code == 200
    data = client.get("/api/v1/admin/buildings").json()
    original = (source / "building_meta.json").read_bytes()
    invalid = {**body, "osm_id": "999999999", "id": "missing", "revision": data["revision"]}
    assert client.post("/api/v1/admin/buildings", json=invalid).status_code == 422
    assert (source / "building_meta.json").read_bytes() == original


def test_room_rename_and_delete_preserve_other_ids_and_course_links(data_client):
    client, source, output = data_client
    endpoint = "/api/v1/admin/rooms/gemi"
    data = client.get(endpoint).json()
    before = {r["id"]: r["name"] for f in data["floors"] for r in f["rooms"]}
    assigned = next(r for f in data["floors"] for r in f["rooms"] if r["course_count"])
    assert (
        client.request(
            "DELETE", f"{endpoint}/{assigned['id']}", json={"revision": data["revision"]}
        ).status_code
        == 409
    )
    floor = next(f for f in data["floors"] if any(r["id"] == assigned["id"] for r in f["rooms"]))
    body = {
        "revision": data["revision"],
        "floor_index": floor["index"],
        "name": "Updated classroom",
        "type": "실습실",
        "description": "Room description",
        "tags": ["test-alias"],
        "color": "#112233",
    }
    assert (
        client.put(f"{endpoint}/{assigned['id']}", json={**body, "type": "UNKNOWN"}).status_code
        == 422
    )
    assert client.put(f"{endpoint}/{assigned['id']}", json=body).status_code == 200
    updated_table = client.get("/api/v1/timetables/gemi_201.json").json()
    assert updated_table["room_name"] == body["name"]
    assert updated_table["room_id"] == assigned["id"]
    assert client.put(f"{endpoint}/{assigned['id']}", json=body).status_code == 409
    data = client.get(endpoint).json()
    unassigned = next(r for f in data["floors"] for r in f["rooms"] if not r["course_count"])
    assert (
        client.request(
            "DELETE", f"{endpoint}/{unassigned['id']}", json={"revision": data["revision"]}
        ).status_code
        == 200
    )
    after = {r["id"]: r["name"] for f in client.get(endpoint).json()["floors"] for r in f["rooms"]}
    expected = {**before, assigned["id"]: body["name"]}
    expected.pop(unassigned["id"])
    assert after == expected
    assert client.get("/api/v1/timetables/gemi_201.json").json()["room_id"] == assigned["id"]
    generated = json.loads((output / "rooms-index.json").read_text(encoding="utf-8"))["rooms"]
    assert any(r["id"] == assigned["id"] and r["name"] == body["name"] for r in generated)
    live_room = next(
        r
        for f in client.get(endpoint).json()["floors"]
        for r in f["rooms"]
        if r["id"] == assigned["id"]
    )
    assert live_room["type"] == body["type"]
    assert live_room["color"] == "#289D8F"
    raw = json.loads((source / "interior/rooms.json").read_text(encoding="utf-8"))
    assert all("id" in r for f in raw["gemi"] for r in f)


def test_room_add_geometry_validation_and_stable_id(data_client):
    client, source, output = data_client
    endpoint = "/api/v1/admin/rooms/gemi"
    anonymous = TestClient(client.app)
    assert anonymous.get(endpoint).status_code == 401
    data = client.get(endpoint).json()
    floor = data["floors"][0]
    body = {
        "revision": data["revision"],
        "floor_index": floor["index"],
        "name": "New classroom",
        "type": "강의실,세미나실,멀티실",
        "placement": floor["suggested_placement"],
    }
    original = (source / "interior/rooms.json").read_bytes()
    invalid = {**body, "placement": {"x": 9999, "z": 9999, "width": 2, "depth": 2}}
    assert client.post(endpoint, json=invalid).status_code == 422
    assert (source / "interior/rooms.json").read_bytes() == original
    response = client.post(endpoint, json=body)
    assert response.status_code == 200, response.text
    data = client.get(endpoint).json()
    room = next(r for f in data["floors"] for r in f["rooms"] if r["name"] == body["name"])
    assert room["id"].startswith(f"gemi:{floor['index']}:r")
    assert len(room["polygon"]) == 4
    body["revision"] = data["revision"]
    assert client.post(endpoint, json=body).status_code == 409
    assert (
        client.request(
            "DELETE", f"{endpoint}/{room['id']}", json={"revision": data["revision"]}
        ).status_code
        == 200
    )
    assert all(
        r["name"] != body["name"] for f in client.get(endpoint).json()["floors"] for r in f["rooms"]
    )
