"""Room source CRUD. Keep room identifiers stable when an array entry is removed."""

import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pyproj import Transformer
from shapely.geometry import Polygon, box

from campus.api.admin_data import LOCK, Delete, encoded, read, revision, table_index, tables
from campus.api.store import CampusStore
from campus.pipeline.__main__ import build
from campus.pipeline.project import Projector
from campus.routing import RoutingEngine


class Placement(BaseModel):
    x: float = Field(ge=-10000, le=10000, allow_inf_nan=False)
    z: float = Field(ge=-10000, le=10000, allow_inf_nan=False)
    width: float = Field(gt=0.1, le=200, allow_inf_nan=False)
    depth: float = Field(gt=0.1, le=200, allow_inf_nan=False)


class RoomEdit(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    revision: str
    floor_index: int = Field(ge=0, le=100)
    name: str = Field(min_length=1, max_length=100)
    type: str = Field(default="강의실,세미나실,멀티실", max_length=200)
    description: str = Field(default="", max_length=3000)
    tags: list[str] = Field(default_factory=list, max_length=30)
    color: str = Field(default="#79b7d9", pattern=r"^#[0-9a-fA-F]{6}$")
    placement: Placement | None = None


def room_router(source: Path, output: Path, persist) -> APIRouter:
    router = APIRouter()
    rooms_path = source / "interior" / "rooms.json"
    meta_path = source / "building_meta.json"
    geo_path = source / "interior" / "buildings.geojson"
    types_path = source / "interior" / "room-types.json"

    def room_revision():
        return revision([rooms_path, meta_path, geo_path, types_path])

    def building_info(building_id):
        metadata = read(meta_path)
        meta = next(
            (
                m
                for k, m in metadata.items()
                if not k.startswith("_") and m.get("id") == building_id and not m.get("disabled")
            ),
            None,
        )
        if not meta:
            raise HTTPException(404, "건물을 찾을 수 없습니다.")
        floor_path = output / "floors" / f"{building_id}.json"
        if not floor_path.exists() or not meta.get("interior_id"):
            raise HTTPException(422, "이 건물에는 등록된 층별 도면이 없습니다.")
        return metadata, meta, read(floor_path)

    @router.get("/rooms/{building_id}")
    def rooms(building_id: str):
        with LOCK:
            _, meta, interior = building_info(building_id)
            result = []
            assigned = {t.get("room_id"): len(t["courses"]) for t in tables(source).values()}
            for floor in interior["floors"]:
                poly = Polygon(floor["outline"])
                point = poly.representative_point()
                half = max(0.1, min(1.5, point.distance(poly.boundary) / 2))
                result.append(
                    {
                        **floor,
                        "rooms": [
                            {**r, "course_count": assigned.get(r["id"], 0)}
                            for r in floor["rooms"]
                            if r["category"] == "공간"
                        ],
                        "suggested_placement": {
                            "x": round(point.x, 2),
                            "z": round(point.y, 2),
                            "width": round(half * 2, 2),
                            "depth": round(half * 2, 2),
                        },
                    }
                )
            return {
                "revision": room_revision(),
                "building_id": building_id,
                "building_name": meta["name"],
                "floors": result,
            }

    def save_room(building_id, body: RoomEdit | Delete, request, room_id=None, deleting=False):
        with LOCK:
            if body.revision != room_revision():
                raise HTTPException(
                    409, "강의실 정보가 변경되었습니다. 새로고침 후 다시 수정해 주세요."
                )
            metadata, meta, interior = building_info(building_id)
            raw = read(rooms_path)
            floor_rooms = raw.setdefault(meta["interior_id"], [])
            # Preserve all existing IDs, including facilities, before changing array positions.
            for fi, entries in enumerate(floor_rooms):
                for ri, entry in enumerate(entries):
                    entry.setdefault("id", f"{building_id}:{fi}:{ri}")
            previous = None
            if room_id:
                for fi, entries in enumerate(floor_rooms):
                    for ri, entry in enumerate(entries):
                        if entry["id"] == room_id and entry.get("category", "공간") == "공간":
                            previous = (fi, ri, entry)
                if previous is None:
                    raise HTTPException(404, "호실을 찾을 수 없습니다.")
            all_tables = tables(source)
            related = (
                {file: t for file, t in all_tables.items() if t.get("room_id") == room_id}
                if room_id
                else {}
            )
            if deleting and any(t["courses"] for t in related.values()):
                raise HTTPException(409, "이 호실에 배정된 수업을 먼저 삭제해 주세요.")
            changes = {}
            if deleting:
                fi, ri, _ = previous
                floor_rooms[fi].pop(ri)
                for file in related:
                    all_tables.pop(file)
                    changes[source / "timetables" / file] = None
            else:
                assert isinstance(body, RoomEdit)
                floor = next(
                    (f for f in interior["floors"] if f["index"] == body.floor_index), None
                )
                if floor is None:
                    raise HTTPException(422, "등록된 층을 선택해 주세요.")
                if previous and previous[0] != body.floor_index:
                    raise HTTPException(422, "기존 호실의 층은 변경할 수 없습니다.")
                if any(
                    e.get("name", "").strip() == body.name and e.get("id") != room_id
                    for e in (
                        floor_rooms[body.floor_index] if body.floor_index < len(floor_rooms) else []
                    )
                ):
                    raise HTTPException(409, "이 층에 같은 이름의 공간이 있습니다.")
                entry = dict(previous[2]) if previous else {}
                palette = {item["value"]: item["color"] for item in read(types_path)}
                if body.type in palette:
                    color = palette[body.type]
                elif previous and body.type == previous[2].get("type", ""):
                    color = previous[2].get("color", "#CCCCCC")
                else:
                    raise HTTPException(422, "목록에 있는 공간 타입을 선택해 주세요.")
                if not previous and body.placement is None:
                    raise HTTPException(422, "새 호실의 위치와 크기를 입력해 주세요.")
                if body.placement:
                    p = body.placement
                    rectangle = box(
                        p.x - p.width / 2, p.z - p.depth / 2, p.x + p.width / 2, p.z + p.depth / 2
                    )
                    if not Polygon(floor["outline"]).buffer(0.02).covers(rectangle):
                        raise HTTPException(
                            422, "호실이 층 외곽선을 벗어났습니다. 위치와 크기를 조정해 주세요."
                        )
                    proj = Projector()
                    e0, n0 = proj._tf.transform(*proj.origin)
                    inverse = Transformer.from_crs(proj.crs, "EPSG:4326", always_xy=True)
                    entry["polygon"] = [
                        [
                            list(inverse.transform(e0 + x, n0 - z))
                            for x, z in rectangle.exterior.coords
                        ]
                    ]
                new_id = room_id or f"{building_id}:{body.floor_index}:r{uuid4().hex[:16]}"
                entry.update(
                    {
                        "id": new_id,
                        "name": body.name,
                        "type": body.type,
                        "desc": body.description,
                        "tags": list(dict.fromkeys(t.strip() for t in body.tags if t.strip())),
                        "color": color,
                        "category": "공간",
                    }
                )
                if previous:
                    floor_rooms[previous[0]][previous[1]] = entry
                else:
                    while len(floor_rooms) <= body.floor_index:
                        floor_rooms.append([])
                    floor_rooms[body.floor_index].append(entry)
                for file, table in related.items():
                    table.update({"room_name": body.name, "name": f"{meta['name']} {body.name}"})
                    changes[source / "timetables" / file] = encoded(table)
            changes[rooms_path] = encoded(raw)
            if related:
                changes[source / "timetable_sources" / "room-index.json"] = encoded(
                    table_index(all_tables)
                )
            with tempfile.TemporaryDirectory() as temp:
                build(
                    raw_path=source / "raw/osm.json",
                    out_dir=Path(temp),
                    meta_override={k: v for k, v in metadata.items() if not k.startswith("_")},
                    interior_dir=source / "interior",
                    rooms_override=raw,
                    verbose=False,
                )
                fresh = CampusStore(Path(temp))
                RoutingEngine(fresh.campus, fresh.graph, fresh.interior)
                if not deleting:
                    generated = fresh.interior(building_id)
                    if not generated or not any(
                        r.id == new_id for f in generated.floors for r in f.rooms
                    ):
                        raise HTTPException(
                            422, "호실 도형을 생성하지 못했습니다. 크기와 위치를 확인해 주세요."
                        )
                for p in Path(temp).rglob("*.json"):
                    changes[output / p.relative_to(temp)] = p.read_bytes()
                marker = output / "rooms-index.json"
                marker_data = changes.pop(marker)
                changes[marker] = marker_data
                persist(changes)
            store = CampusStore(output)
            request.app.state.store = store
            request.app.state.router = RoutingEngine(store.campus, store.graph, store.interior)
            return {"ok": True}

    @router.post("/rooms/{building_id}")
    def add(building_id: str, body: RoomEdit, request: Request):
        return save_room(building_id, body, request)

    @router.put("/rooms/{building_id}/{room_id}")
    def update(building_id: str, room_id: str, body: RoomEdit, request: Request):
        return save_room(building_id, body, request, room_id)

    @router.delete("/rooms/{building_id}/{room_id}")
    def delete(building_id: str, room_id: str, body: Delete, request: Request):
        return save_room(building_id, body, request, room_id, deleting=True)

    return router
