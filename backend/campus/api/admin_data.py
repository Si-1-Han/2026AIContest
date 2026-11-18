"""Authenticated source JSON editing with revision checks and rollback."""

import hashlib
import json
import re
import tempfile
from pathlib import Path
from threading import RLock
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from campus.api.store import CampusStore
from campus.pipeline.import_timetables import build_table
from campus.routing import RoutingEngine

LOCK = RLock()


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def encoded(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, suffix=".tmp") as stream:
        stream.write(data)
        temporary = Path(stream.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def revision(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


class BuildingEdit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    revision: str
    osm_id: str = Field(pattern=r"^\d+$")
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    name: str = Field(min_length=1, max_length=100)
    aliases: list[str] = Field(default_factory=list, max_length=30)
    description: str = Field(default="", max_length=3000)
    levels: int = Field(ge=1, le=100)
    interior_id: str = Field(default="", max_length=100)


class Delete(BaseModel):
    revision: str


class Meeting(BaseModel):
    day: Literal["월", "화", "수", "목", "금", "토", "일"]
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):(?:00|30)$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):(?:00|30)$")

    @model_validator(mode="after")
    def ordered(self):
        if self.start >= self.end:
            raise ValueError("종료 시각은 시작 시각보다 늦어야 합니다.")
        return self


class CourseEdit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    revision: str
    file: str = Field(pattern=r"^[\w-]+\.json$", max_length=150)
    code: str = Field(pattern=r"^[A-Za-z0-9_-]{1,60}$")
    name: str = Field(min_length=1, max_length=200)
    instructor: str = Field(default="", max_length=100)
    department: str = Field(default="", max_length=100)
    semester: str = Field(min_length=1, max_length=100)
    credits: float | None = Field(default=None, ge=0, le=30)
    capacity: int | None = Field(default=None, ge=0, le=10000)
    note: str = Field(default="", max_length=3000)
    meetings: list[Meeting] = Field(min_length=1, max_length=20)


def tables(source: Path) -> dict[str, dict]:
    return {path.name: read(path) for path in (source / "timetables").glob("*.json")}


def table_index(items: dict[str, dict]) -> list[dict]:
    return [
        {
            "file": file,
            **{
                key: table.get(key)
                for key in (
                    "name",
                    "building_id",
                    "room_id",
                    "room_name",
                    "source_location",
                    "mapping_status",
                )
            },
            "courses": len(table["courses"]),
        }
        for file, table in sorted(items.items())
        if table.get("room_id")
    ]


def public_timetable_router(source: Path) -> APIRouter:
    router = APIRouter(prefix="/api/v1/timetables")

    @router.get("")
    def index():
        with LOCK:
            return table_index(tables(source))

    @router.get("/{filename}")
    def table(filename: str):
        if not re.fullmatch(r"[\w-]+\.json", filename):
            raise HTTPException(404, "시간표를 찾을 수 없습니다.")
        with LOCK:
            path = source / "timetables" / filename
            if not path.is_file():
                raise HTTPException(404, "시간표를 찾을 수 없습니다.")
            return read(path)

    return router


def data_router(source: Path, output: Path) -> APIRouter:
    router = APIRouter()
    meta_path = source / "building_meta.json"

    def check(expected: str, paths: list[Path]):
        if expected != revision(paths):
            raise HTTPException(
                409, "다른 곳에서 데이터가 변경되었습니다. 새로고침 후 다시 수정해 주세요."
            )

    def rooms():
        return read(output / "rooms-index.json")["rooms"]

    def choices():
        current = tables(source)
        existing = {t.get("room_id"): file for file, t in current.items() if t.get("room_id")}
        names = {b["id"]: b["name"] for b in read(output / "campus.json")["buildings"]}
        result = []
        for room in rooms():
            if room["category"] != "공간":
                continue
            file = existing.get(room["id"], room["id"].replace(":", "_") + ".json")
            result.append(
                {
                    "file": file,
                    "building_id": room["building_id"],
                    "room_id": room["id"],
                    "room_name": room["name"],
                    "name": (
                        f"{names.get(room['building_id'], room['building_id'])} "
                        f"{room['floor_label']} {room['name']}"
                    ),
                }
            )
        known = {r["file"] for r in result}
        result.extend(
            {
                "file": file,
                "name": table["name"],
                "building_id": table.get("building_id"),
                "room_id": table.get("room_id"),
                "room_name": table.get("room_name", ""),
            }
            for file, table in current.items()
            if file not in known
        )
        return result

    def persist(changes: dict[Path, bytes | None]):
        originals = {p: p.read_bytes() if p.exists() else None for p in changes}
        # Keep source backups outside the public directory.
        backup = source / "private" / "backups" / uuid4().hex
        for i, (path, data) in enumerate(originals.items()):
            if data is not None:
                write(backup / f"{i}-{path.name}", data)
        try:
            for path, data in changes.items():
                if data is None:
                    path.unlink(missing_ok=True)
                else:
                    write(path, data)
        except OSError as exc:
            for path, data in originals.items():
                if data is None:
                    path.unlink(missing_ok=True)
                else:
                    write(path, data)
            raise HTTPException(
                500, "저장하지 못했습니다. 파일 권한과 디스크 상태를 확인해 주세요."
            ) from exc

    @router.get("/buildings")
    def buildings():
        with LOCK:
            meta = read(meta_path)
            campus = read(output / "campus.json")["buildings"]
            by_osm = {str(b["osm_id"]): b for b in campus}
            items = []
            for osm_id, item in meta.items():
                if osm_id.startswith("_") or item.get("disabled"):
                    continue
                live = by_osm.get(osm_id, {})
                items.append(
                    {
                        **item,
                        "osm_id": osm_id,
                        "levels": live.get("levels", item.get("levels", 3)),
                        "has_interior": live.get("has_interior", False),
                        "room_count": sum(f["room_count"] for f in live.get("floors", [])),
                    }
                )
            from campus.config import CAMPUS_BOUNDARY_WAY_ID
            from campus.pipeline.buildings import campus_boundary, to_polygon
            from campus.pipeline.osm import load, way_coords
            from campus.pipeline.project import Projector

            elements, _ = load(source / "raw" / "osm.json")
            proj = Projector()
            boundary = campus_boundary(elements, proj, CAMPUS_BOUNDARY_WAY_ID).buffer(5)
            available = []
            used = {item["osm_id"] for item in items}
            for el in elements:
                tags = el.get("tags", {})
                if (
                    el.get("type") != "way"
                    or "building" not in tags
                    or tags["building"] == "roof"
                    or str(el["id"]) in used
                ):
                    continue
                poly = to_polygon(proj.many(way_coords(el)))
                if poly is not None and boundary.contains(poly.representative_point()):
                    available.append(
                        {"osm_id": str(el["id"]), "name": tags.get("name", "이름 없는 건물")}
                    )
            return {"revision": revision([meta_path]), "items": items, "available": available}

    def save_building(
        body: BuildingEdit | Delete,
        request: Request,
        key: str | None,
        creating=False,
        deleting=False,
    ):
        from campus.pipeline.__main__ import build

        with LOCK:
            check(body.revision, [meta_path])
            meta = read(meta_path)
            osm_id = body.osm_id if isinstance(body, BuildingEdit) else key
            existing = meta.get(osm_id)
            if creating and existing and not existing.get("disabled"):
                raise HTTPException(409, "이미 등록된 건물입니다.")
            if not creating and (not existing or existing.get("disabled")):
                raise HTTPException(404, "건물을 찾을 수 없습니다.")
            if deleting:
                if any(t.get("building_id") == existing["id"] for t in tables(source).values()):
                    raise HTTPException(409, "이 건물의 수업을 먼저 삭제해 주세요.")
                meta[osm_id] = {**existing, "disabled": True}
            else:
                assert isinstance(body, BuildingEdit)
                if key is not None and (key != body.osm_id or existing["id"] != body.id):
                    raise HTTPException(422, "기존 건물의 ID와 위치는 변경할 수 없습니다.")
                if any(
                    k != osm_id and not v.get("disabled") and v.get("id") == body.id
                    for k, v in meta.items()
                    if not k.startswith("_")
                ):
                    raise HTTPException(409, "이미 사용 중인 건물 ID입니다.")
                values = body.model_dump(exclude={"revision", "osm_id"})
                values["aliases"] = list(
                    dict.fromkeys(a.strip() for a in body.aliases if a.strip())
                )
                if creating and existing and not body.interior_id:
                    values["interior_id"] = existing.get("interior_id", "")
                meta[osm_id] = {**(existing or {}), **values, "disabled": False}
            # Validate/generate in isolation before publishing the full output set.
            try:
                with tempfile.TemporaryDirectory() as temp:
                    build(
                        raw_path=source / "raw" / "osm.json",
                        out_dir=Path(temp),
                        meta_override={k: v for k, v in meta.items() if not k.startswith("_")},
                        interior_dir=source / "interior",
                        verbose=False,
                    )
                    fresh = CampusStore(Path(temp))
                    RoutingEngine(fresh.campus, fresh.graph, fresh.interior)
                    if not deleting and body.id not in fresh.building_ids:
                        raise HTTPException(
                            422,
                            "선택한 위치에는 독립 건물을 추가할 수 없습니다. "
                            "부속동 병합 여부를 확인해 주세요.",
                        )
                    changes = {meta_path: encoded(meta)}
                    changes.update(
                        {
                            p: None
                            for p in (output / "floors").glob("*.json")
                            if not (Path(temp) / "floors" / p.name).exists()
                        }
                    )
                    changes.update(
                        {
                            output / p.relative_to(temp): p.read_bytes()
                            for p in Path(temp).rglob("*.json")
                        }
                    )
                    # Marker last: development readers refresh after the complete build.
                    marker = output / "rooms-index.json"
                    marker_bytes = changes.pop(marker)
                    changes[marker] = marker_bytes
                    persist(changes)
                store = CampusStore(output)
                request.app.state.store = store
                request.app.state.router = RoutingEngine(store.campus, store.graph, store.interior)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(
                    422, "건물 데이터를 반영하지 못했습니다. 위치와 층별 연결 정보를 확인해 주세요."
                ) from exc
            return {"ok": True}

    @router.post("/buildings")
    def add_building(body: BuildingEdit, request: Request):
        return save_building(body, request, None, creating=True)

    @router.put("/buildings/{osm_id}")
    def edit_building(osm_id: str, body: BuildingEdit, request: Request):
        return save_building(body, request, osm_id)

    @router.delete("/buildings/{osm_id}")
    def delete_building(osm_id: str, body: Delete, request: Request):
        return save_building(body, request, osm_id, deleting=True)

    def course_paths():
        return list((source / "timetables").glob("*.json"))

    @router.get("/courses")
    def courses():
        with LOCK:
            items = []
            for file, table in tables(source).items():
                location = table.get("source_location", table.get("room_id", ""))
                for code, course in table["courses"].items():
                    meetings = [
                        {k: session[k] for k in ("day", "start", "end")}
                        for session in table.get("sessions", [])
                        if session["code"] == code
                    ]
                    if not meetings:
                        meetings = [
                            {k: m[k] for k in ("day", "start", "end")}
                            for m in course.get("meetings", [])
                            if m["location"] == location
                        ]
                    items.append(
                        {
                            **course,
                            "code": code,
                            "file": file,
                            "room": table.get("room_name", table["name"]),
                            "building_id": table.get("building_id"),
                            "semester": table.get("semester", ""),
                            "meetings": meetings,
                        }
                    )
            return {"revision": revision(course_paths()), "items": items, "rooms": choices()}

    def change_course(
        body: CourseEdit | Delete, file: str, code: str, creating=False, deleting=False
    ):
        with LOCK:
            check(body.revision, course_paths())
            all_tables = tables(source)
            original_table = all_tables.get(file)
            existing = original_table["courses"].get(code) if original_table else None
            if not creating and not existing:
                raise HTTPException(404, "수업을 찾을 수 없습니다.")
            if isinstance(body, CourseEdit) and body.code != code:
                raise HTTPException(422, "기존 수업 코드는 변경할 수 없습니다.")
            target_file = body.file if isinstance(body, CourseEdit) else file
            moving = target_file != file
            option = next((r for r in choices() if r["file"] == target_file), None)
            if option is None:
                raise HTTPException(422, "강의실을 찾을 수 없습니다.")
            table = all_tables.get(target_file) or {
                **option,
                "source_location": option["room_id"],
                "courses": {},
            }
            if (creating or moving) and code in table["courses"]:
                raise HTTPException(409, "이 강의실에 같은 코드의 수업이 있습니다.")
            course_map = table["courses"]
            location = table["source_location"]
            if deleting:
                course_map.pop(code)
            else:
                assert isinstance(body, CourseEdit)
                # A classroom table has one semester; do not silently relabel other courses.
                if (
                    len(course_map) > (1 if existing and not moving else 0)
                    and table.get("semester") != body.semester
                ):
                    raise HTTPException(422, "같은 강의실의 수업은 동일한 학기로 입력해 주세요.")
                meetings = [
                    {**m.model_dump(), "location": location, "periods": ""} for m in body.meetings
                ]
                course_map[code] = {
                    **(existing or {}),
                    **body.model_dump(exclude={"revision", "file", "code", "semester", "meetings"}),
                    "meetings": meetings,
                    **body.meetings[0].model_dump(),
                    "periods": "",
                    "weekly_hours": sum(
                        (
                            int(m.end[:2]) * 60
                            + int(m.end[3:])
                            - int(m.start[:2]) * 60
                            - int(m.start[3:])
                        )
                        / 60
                        for m in body.meetings
                    ),
                }
                table["semester"] = body.semester
            affected = {target_file: table}
            if moving:
                original_table["courses"].pop(code)
                affected[file] = original_table
            changes = {}
            # Rebuild both classrooms and publish them together with the room index.
            for filename, affected_table in affected.items():
                mapping = {
                    key: affected_table.get(key)
                    for key in (
                        "name",
                        "building_id",
                        "room_id",
                        "room_name",
                        "source_location",
                        "mapping_status",
                    )
                }
                mapping["mapping_status"] = (
                    "linked" if affected_table.get("room_id") else "unlinked"
                )
                if affected_table["courses"]:
                    updated, _ = build_table(
                        affected_table["source_location"], affected_table["courses"], mapping
                    )
                    updated["semester"] = affected_table.get("semester", "")
                    all_tables[filename] = updated
                    changes[source / "timetables" / filename] = encoded(updated)
                else:
                    all_tables.pop(filename, None)
                    changes[source / "timetables" / filename] = None
            changes[source / "timetable_sources" / "room-index.json"] = encoded(
                table_index(all_tables)
            )
            persist(changes)
            return {"ok": True}

    @router.post("/courses")
    def add_course(body: CourseEdit):
        return change_course(body, body.file, body.code, creating=True)

    @router.put("/courses/{file}/{code}")
    def edit_course(file: str, code: str, body: CourseEdit):
        return change_course(body, file, code)

    @router.delete("/courses/{file}/{code}")
    def delete_course(file: str, code: str, body: Delete):
        return change_course(body, file, code, deleting=True)

    from campus.api.admin_rooms import room_router

    router.include_router(room_router(source, output, persist))
    return router
