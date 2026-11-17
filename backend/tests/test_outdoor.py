from shapely.geometry import LineString, Polygon

from campus.api.store import CampusStore
from campus.config import ORIGIN_LON_LAT, WEB_DATA_DIR
from campus.pipeline.buildings import campus_boundary
from campus.pipeline.outdoor import build_outdoor_areas
from campus.pipeline.project import Projector

from .conftest import square, way


def test_outdoor_areas_exclude_off_campus_and_parking_buildings(proj: Projector) -> None:
    lon, lat = ORIGIN_LON_LAT
    outline = square(lon, lat, 0.0001)
    elements = [
        way(1, square(lon, lat, 0.002), amenity="university"),
        way(10, outline, leisure="pitch", name="운동장"),
        way(11, outline, leisure="pitch", sport="tennis"),
        way(12, outline, amenity="parking"),
        way(13, outline, amenity="parking", building="yes"),
        way(14, square(lon + 0.01, lat, 0.0001), amenity="parking"),
        way(15, outline, leisure="pitch", sport="basketball"),
    ]
    boundary = campus_boundary(elements, proj, way_id=1)
    areas = build_outdoor_areas(elements, proj, boundary)
    assert {a.osm_id for a in areas} == {10, 11, 12}
    assert {a.kind for a in areas} == {"field", "tennis", "parking"}
    assert all(len(a.footprint) == 4 for a in areas)
    assert all(abs(a.center[0]) < 1 and abs(a.center[1]) < 1 for a in areas)


def test_registered_outdoor_access_does_not_cross_buildings() -> None:
    store = CampusStore(WEB_DATA_DIR)
    nodes = {n.id: n for n in store.graph.nodes}
    assert len(nodes) == len(store.graph.nodes)
    for area in store.campus.outdoor_areas:
        assert len(area.entrances) == 1
        door = nodes[area.entrances[0]]
        if area.kind == "gate":
            continue  # 교문은 기존 도로를 나누거나 양쪽 도로에 연결하므로 별도 검사한다.
        edge = next(e for e in store.graph.edges if e.a == door.id)
        other = nodes[edge.b]
        segment = LineString([(door.x, door.z), (other.x, other.z)])
        assert all(
            not Polygon(b.footprint).buffer(-0.1).intersects(segment)
            for b in store.campus.buildings
        )
