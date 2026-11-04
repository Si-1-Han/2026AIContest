import math

from campus.config import ORIGIN_LON_LAT
from campus.pipeline.buildings import campus_boundary, classify
from campus.pipeline.graph import build_graph
from campus.pipeline.project import Projector

from .conftest import square, way

LON0, LAT0 = ORIGIN_LON_LAT


def test_origin_maps_to_zero(proj: Projector) -> None:
    assert proj.to_local(LON0, LAT0) == (0.0, 0.0)


def test_axes_follow_threejs_convention(proj: Projector) -> None:
    # 북쪽으로 약 111m → z ≈ -111, 동쪽으로 이동 → x > 0
    x, z = proj.to_local(LON0, LAT0 + 0.001)
    assert abs(x) < 1 and math.isclose(z, -110.9, abs_tol=1.0)
    x, z = proj.to_local(LON0 + 0.001, LAT0)
    assert math.isclose(x, 88.6, abs_tol=1.0) and abs(z) < 1


def _fixture_elements() -> list[dict]:
    return [
        way(1, square(LON0, LAT0, 0.002), amenity="university", name="테스트대학"),
        # 캠퍼스 안 건물 2개 (하나는 층수 없음)
        way(
            10,
            square(LON0 - 0.0005, LAT0, 0.0001),
            building="university",
            name="본관",
            **{"building:levels": "5"},
        ),
        way(11, square(LON0 + 0.0005, LAT0, 0.0001), building="university"),
        # 캠퍼스 밖 주변 건물
        way(20, square(LON0 + 0.003, LAT0, 0.0001), building="apartments"),
        # 두 건물 앞을 지나는 보행로
        way(
            30,
            [(LON0 - 0.0008, LAT0 - 0.0002), (LON0, LAT0 - 0.0002), (LON0 + 0.0008, LAT0 - 0.0002)],
            highway="footway",
        ),
        # 연결되지 않은 짧은 도로 (제외되어야 함)
        way(31, [(LON0, LAT0 + 0.0015), (LON0 + 0.0001, LAT0 + 0.0015)], highway="service"),
    ]


def test_classify_and_graph(proj: Projector) -> None:
    elements = _fixture_elements()
    boundary = campus_boundary(elements, proj, way_id=1)
    meta = {"10": {"id": "main", "name": "본관", "aliases": ["본관", "대학본부"]}}

    buildings, context, report = classify(elements, proj, boundary, meta)
    assert [b.id for b in buildings] == ["main", "osm_11"]
    assert buildings[0].levels == 5 and not buildings[0].levels_estimated
    assert buildings[1].levels_estimated
    assert len(context) == 1 and report.unnamed == ["osm_11"]

    graph, g_report = build_graph(elements, proj, boundary, buildings)
    assert g_report.components_before == 2 and g_report.dropped_nodes == 2
    assert g_report.unlinked_buildings == []
    entrances = {n.building_id for n in graph.nodes if n.type == "entrance"}
    assert entrances == {"main", "osm_11"}
    assert buildings[0].entrances == ["e_main_0"]
    ids = {n.id for n in graph.nodes}
    assert all(e.a in ids and e.b in ids for e in graph.edges)


def test_real_doors_create_multiple_entrances(proj: Projector) -> None:
    elements = _fixture_elements()
    boundary = campus_boundary(elements, proj, way_id=1)
    meta = {"10": {"id": "main", "name": "본관"}}
    buildings, _, _ = classify(elements, proj, boundary, meta)
    main = next(b for b in buildings if b.id == "main")
    xs = [p[0] for p in main.footprint]
    zs = [p[1] for p in main.footprint]
    # 건물 남쪽 벽(1F)과 북쪽 벽(2F)에 문 하나씩, 그리고 첫 문 바로 옆에 중복 문
    south = ((min(xs) + max(xs)) / 2, max(zs) - 0.5)
    north = ((min(xs) + max(xs)) / 2, min(zs) + 0.5)
    dup = (south[0] + 1.0, south[1])
    graph, report = build_graph(
        elements, proj, boundary, buildings, doors={"main": [(south, 0), (dup, 0), (north, 1)]}
    )
    assert report.real_doors == 2
    assert main.entrances == ["e_main_0", "e_main_1"]
    floors = {n.id: n.floor_index for n in graph.nodes if n.building_id == "main"}
    assert floors == {"e_main_0": 0, "e_main_1": 1}
    # 문이 없는 건물은 추정 입구 하나
    other = next(b for b in buildings if b.id == "osm_11")
    assert other.entrances == ["e_osm_11_0"]
