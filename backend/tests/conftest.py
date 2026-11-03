import pytest

from campus.pipeline.project import Projector


@pytest.fixture
def proj() -> Projector:
    return Projector()


def way(way_id: int, coords: list[tuple[float, float]], **tags: str) -> dict:
    """테스트용 OSM way (coords는 (lon, lat))"""
    return {
        "type": "way",
        "id": way_id,
        "tags": tags,
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in coords],
    }


def square(cx: float, cy: float, d: float) -> list[tuple[float, float]]:
    """(lon, lat) 중심의 정사각형 폐곡선"""
    return [
        (cx - d, cy - d),
        (cx + d, cy - d),
        (cx + d, cy + d),
        (cx - d, cy + d),
        (cx - d, cy - d),
    ]
