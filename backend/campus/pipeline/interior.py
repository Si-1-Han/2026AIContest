"""층·강의실 데이터(data/interior) → 건물별 층 정보와 강의실 파일.

원본 형식 (HMH 한세대학교 3D 캠퍼스맵 기반, 팀 보완 — data/interior/README.md 참고)
  buildings.geojson  건물별 floors = { flLevel, bmLevel, flList, flVars }
                     flVars[k] = 층 외곽선 후보, flList[i] = i번째 층이 쓰는 flVars 번호
                     @id가 *_alt인 피처는 층 데이터 없는 보조 덩어리(부속동 등)
  rooms.json         { 건물 @id: [ 층0 [공간…], 층1 [공간…], … ] }, 층0이 가장 아래(지하 포함)
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from shapely.geometry import Polygon
from shapely.ops import unary_union

from campus.config import INTERIOR_ATTRIBUTION, INTERIOR_DIR, MERGE_COVERAGE
from campus.models import (
    Building,
    BuildingInterior,
    FloorInfo,
    InteriorFloor,
    Room,
    RoomIndexEntry,
    Volume,
)
from campus.pipeline.buildings import exterior, to_polygon
from campus.pipeline.project import Projector


@dataclass
class SourceBuilding:
    """원본 한 동 (로컬 좌표로 변환 완료)"""

    sid: str
    name: str
    basements: int
    floor_outlines: list[Polygon]  # 아래층부터
    rooms: list[list[dict[str, Any]]]  # 층별 원본 항목
    volumes: list[tuple[Polygon, float, float]]  # (외곽, base 층, 층수)

    def union(self) -> Polygon:
        geom = unary_union(self.floor_outlines + [v[0] for v in self.volumes])
        return geom if isinstance(geom, Polygon) else max(geom.geoms, key=lambda g: g.area)


@dataclass
class InteriorReport:
    attached: list[str] = field(default_factory=list)
    merged: dict[str, list[str]] = field(default_factory=dict)  # 주 건물 → 흡수된 OSM 건물
    unmatched_sources: list[str] = field(default_factory=list)
    rooms: int = 0
    facilities: int = 0
    warnings: list[str] = field(default_factory=list)


def floor_label(index: int, basements: int) -> tuple[int, str]:
    if index < basements:
        n = basements - index
        return -n, f"B{n}"
    n = index - basements + 1
    return n, f"{n}F"


def _ring(proj: Projector, ring: list[list[float]]) -> list[tuple[float, float]]:
    return proj.many([(c[0], c[1]) for c in ring])


def load_sources(proj: Projector, src_dir: Path = INTERIOR_DIR) -> dict[str, SourceBuilding]:
    geo = json.loads((src_dir / "buildings.geojson").read_text(encoding="utf-8"))
    rooms = json.loads((src_dir / "rooms.json").read_text(encoding="utf-8"))
    feats = {f["properties"]["@id"]: f for f in geo["features"]}

    out: dict[str, SourceBuilding] = {}
    for sid, f in feats.items():
        p = f["properties"]
        if sid.endswith("_alt") or "floors" not in p:
            continue
        fl = p["floors"]
        variants = [to_polygon(_ring(proj, v[0])) for v in fl["flVars"]]
        n = fl["flLevel"] + fl["bmLevel"]
        outlines = []
        for i in range(n):
            k = fl["flList"][i] if i < len(fl["flList"]) else fl["flList"][-1]
            poly = variants[k]
            if poly is None:
                raise ValueError(f"{sid} {i}층 외곽선이 올바르지 않습니다.")
            outlines.append(poly)
        volumes = []
        for a in feats.values():
            ap = a["properties"]
            if ap.get("origin") == sid:
                poly = to_polygon(_ring(proj, a["geometry"]["coordinates"][0]))
                if poly is not None:
                    volumes.append((poly, float(ap.get("base", 0)), float(ap["building:levels"])))
        out[sid] = SourceBuilding(
            sid=sid,
            name=p.get("name", sid),
            basements=fl["bmLevel"],
            floor_outlines=outlines,
            rooms=rooms.get(sid, []),
            volumes=volumes,
        )
    return out


def _room(proj: Projector, bid: str, floor_index: int, i: int, raw: dict[str, Any]) -> Room | None:
    rings = [_ring(proj, r) for r in raw["polygon"]]
    poly = to_polygon(rings[0], min_area=0.05) if rings else None
    if poly is None:
        return None
    holes = [exterior(h) for r in rings[1:] if (h := to_polygon(r, min_area=0.05)) is not None]
    desc = (raw.get("desc") or "").strip()
    return Room(
        id=f"{bid}:{floor_index}:{i}",
        name=raw["name"].strip(),
        type=raw.get("type", ""),
        category="시설물" if raw.get("category") == "시설물" else "공간",
        group=raw.get("facility_group"),
        space_group=raw.get("space_group"),
        description="" if desc == raw["name"].strip() else desc,
        tags=[t.strip() for t in raw.get("tags", []) if t.strip()],
        color=raw.get("color", "#cccccc"),
        polygon=exterior(poly),
        holes=holes,
    )


def attach(
    buildings: list[Building],
    meta: dict[str, dict[str, Any]],
    proj: Projector,
    src_dir: Path = INTERIOR_DIR,
) -> tuple[list[Building], dict[str, BuildingInterior], InteriorReport]:
    """층 정보를 건물에 붙이고, 원본 외곽에 덮이는 OSM 건물은 주 건물로 합친다."""
    report = InteriorReport()
    if not (src_dir / "rooms.json").exists():
        report.warnings.append(f"{src_dir}에 층·강의실 데이터가 없어 건너뜁니다.")
        return buildings, {}, report

    sources = load_sources(proj, src_dir)
    by_osm = {str(b.osm_id): b for b in buildings}
    interiors: dict[str, BuildingInterior] = {}
    absorbed: set[str] = set()
    used: set[str] = set()

    for osm_id, m in meta.items():
        sid = m.get("interior_id")
        b = by_osm.get(osm_id)
        if not sid or b is None:
            continue
        src = sources.get(sid)
        if src is None:
            report.warnings.append(f"{b.id}: interior_id '{sid}'가 원본에 없습니다.")
            continue
        used.add(sid)

        # 원본 외곽이 대부분 덮는 다른 OSM 건물은 흡수 (본관 + 대강당 동 등)
        whole = src.union()
        for other in buildings:
            if other.id == b.id or other.id in absorbed:
                continue
            op = Polygon(other.footprint)
            if op.intersection(whole).area / op.area >= MERGE_COVERAGE:
                absorbed.add(other.id)
                report.merged.setdefault(b.id, []).append(other.id)

        interior_floors: list[InteriorFloor] = []
        infos: list[FloorInfo] = []
        for i, outline in enumerate(src.floor_outlines):
            level, label = floor_label(i, src.basements)
            raw_rooms = src.rooms[i] if i < len(src.rooms) else []
            rooms = [r for j, raw in enumerate(raw_rooms) if (r := _room(proj, b.id, i, j, raw))]
            dropped = len(raw_rooms) - len(rooms)
            if dropped:
                report.warnings.append(f"{b.id} {label}: 도형 오류로 {dropped}개 제외")
            n_space = sum(r.category == "공간" for r in rooms)
            report.rooms += n_space
            report.facilities += len(rooms) - n_space
            ring = exterior(outline)
            interior_floors.append(
                InteriorFloor(index=i, level=level, label=label, outline=ring, rooms=rooms)
            )
            infos.append(
                FloorInfo(index=i, level=level, label=label, outline=ring, room_count=n_space)
            )
        if len(src.rooms) != len(src.floor_outlines):
            report.warnings.append(
                f"{b.id}: 층 수({len(src.floor_outlines)})와 "
                f"강의실 층 수({len(src.rooms)})가 다릅니다."
            )

        footprint_poly = whole.simplify(0.2, preserve_topology=True)
        c = footprint_poly.centroid
        b.footprint = exterior(footprint_poly)
        b.center = (round(c.x, 2), round(c.y, 2))
        b.levels = len(src.floor_outlines) - src.basements
        b.basements = src.basements
        b.levels_estimated = False
        b.has_interior = True
        b.floors = infos
        # 층 외곽선이 이미 거의 덮는 보조 덩어리는 중복이므로 버린다 (예: main_alt)
        floors_union = unary_union(src.floor_outlines)
        b.volumes = [
            Volume(
                footprint=exterior(poly),
                base=round(base * b.floor_height, 2),
                height=round(levels * b.floor_height, 2),
            )
            for poly, base, levels in src.volumes
            if poly.intersection(floors_union).area / poly.area < 0.9
        ]
        interiors[b.id] = BuildingInterior(
            building_id=b.id, attribution=INTERIOR_ATTRIBUTION, floors=interior_floors
        )
        report.attached.append(b.id)

    report.unmatched_sources = sorted(set(sources) - used)
    return [b for b in buildings if b.id not in absorbed], interiors, report


def room_index(interiors: dict[str, BuildingInterior]) -> list[RoomIndexEntry]:
    return [
        RoomIndexEntry(
            id=r.id,
            building_id=bid,
            floor_index=f.index,
            floor_label=f.label,
            name=r.name,
            category=r.category,
            tags=r.tags,
        )
        for bid, interior in interiors.items()
        for f in interior.floors
        for r in f.rooms
    ]
