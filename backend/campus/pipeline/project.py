"""위경도(EPSG:4326) → 캠퍼스 로컬 미터 좌표(three.js 축) 변환."""

from collections.abc import Iterable

from pyproj import Transformer

from campus.config import ORIGIN_LON_LAT, TARGET_CRS

Point2 = tuple[float, float]


class Projector:
    """EPSG:5186(중부원점 TM)으로 투영한 뒤 원점을 빼고 three.js 축으로 바꾼다.

    x = 동쪽(+) 미터, z = -(북쪽) 미터
    """

    def __init__(self, origin: Point2 = ORIGIN_LON_LAT, crs: str = TARGET_CRS) -> None:
        self.origin = origin
        self.crs = crs
        self._tf = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
        self._e0, self._n0 = self._tf.transform(*origin)

    def to_local(self, lon: float, lat: float) -> Point2:
        e, n = self._tf.transform(lon, lat)
        return (round(e - self._e0, 2), round(-(n - self._n0), 2))

    def many(self, coords: Iterable[Point2]) -> list[Point2]:
        return [self.to_local(lon, lat) for lon, lat in coords]
