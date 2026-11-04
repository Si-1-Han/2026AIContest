import json
from pathlib import Path

from campus.config import ORIGIN_LON_LAT
from campus.pipeline.buildings import campus_boundary, classify
from campus.pipeline.interior import attach, floor_label, room_index
from campus.pipeline.project import Projector

from .conftest import square, way

LON0, LAT0 = ORIGIN_LON_LAT


def _write_interior(tmp: Path) -> None:
    big = square(LON0, LAT0, 0.0003)  # 본관 저층부: OSM 건물 두 개를 모두 덮음
    small = square(LON0 - 0.00015, LAT0, 0.0001)  # 위층: 왼쪽 건물만
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "@id": "hmh_main",
                    "name": "본관",
                    "floors": {
                        "flLevel": 2,
                        "bmLevel": 1,
                        "flList": [0, 0, 1],
                        "flVars": [[[list(c) for c in big]], [[list(c) for c in small]]],
                    },
                },
                "geometry": {"type": "Polygon", "coordinates": [[list(c) for c in big]]},
            },
            {
                "type": "Feature",
                "properties": {"@id": "hmh_main_alt", "origin": "hmh_main", "building:levels": 3},
                "geometry": {"type": "Polygon", "coordinates": [[list(c) for c in small]]},
            },
        ],
    }
    room = {
        "name": "101호",
        "type": "강의실,세미나실,멀티실",
        "desc": "101호",
        "tags": [],
        "color": "#289D8F",
        "category": "공간",
        "polygon": [[list(c) for c in square(LON0 - 0.0002, LAT0, 0.00002)]],
    }
    stairs = dict(room, name="계단", category="시설물", facility_group="stairs", desc="")
    rooms = {"hmh_main": [[stairs], [room, stairs], [dict(room, name="201호", desc="실습실")]]}
    (tmp / "buildings.geojson").write_text(json.dumps(geo), encoding="utf-8")
    (tmp / "rooms.json").write_text(json.dumps(rooms, ensure_ascii=False), encoding="utf-8")


def test_floor_label() -> None:
    assert floor_label(0, 2) == (-2, "B2")
    assert floor_label(1, 2) == (-1, "B1")
    assert floor_label(2, 2) == (1, "1F")
    assert floor_label(0, 0) == (1, "1F")


def test_attach_merges_and_builds_floors(tmp_path: Path, proj: Projector) -> None:
    _write_interior(tmp_path)
    elements = [
        way(1, square(LON0, LAT0, 0.002), amenity="university"),
        way(10, square(LON0 - 0.00015, LAT0, 0.0001), building="university", name="본관"),
        way(11, square(LON0 + 0.00015, LAT0, 0.0001), building="yes", name="교회"),
    ]
    meta = {"10": {"id": "main", "name": "본관", "interior_id": "hmh_main"}}
    boundary = campus_boundary(elements, proj, way_id=1)
    buildings, _, _ = classify(elements, proj, boundary, meta)
    assert len(buildings) == 2

    buildings, interiors, report = attach(buildings, meta, proj, tmp_path)

    assert [b.id for b in buildings] == ["main"]
    assert report.merged == {"main": ["osm_11"]}
    main = buildings[0]
    assert main.has_interior and main.levels == 2 and main.basements == 1
    assert [f.label for f in main.floors] == ["B1", "1F", "2F"]
    assert [f.room_count for f in main.floors] == [0, 1, 1]
    # 위층 외곽선은 저층부보다 작다
    assert len(main.floors[2].outline) == 4
    # 층 외곽선이 덮는 보조 덩어리는 버린다
    assert main.volumes == []

    floors = interiors["main"].floors
    assert floors[1].rooms[0].id == "main:1:0"
    assert floors[1].rooms[0].description == ""  # 이름과 같은 설명은 비움
    assert floors[2].rooms[0].description == "실습실"
    assert floors[1].rooms[1].category == "시설물" and floors[1].rooms[1].group == "stairs"

    index = room_index(interiors)
    assert {(r.name, r.floor_label) for r in index if r.category == "공간"} == {
        ("101호", "1F"),
        ("201호", "2F"),
    }


def test_attach_without_data_is_noop(tmp_path: Path, proj: Projector) -> None:
    buildings, interiors, report = attach([], {}, proj, tmp_path)
    assert buildings == [] and interiors == {} and report.warnings
