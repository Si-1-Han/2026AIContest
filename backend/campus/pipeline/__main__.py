"""데이터 파이프라인 CLI.

uv run python -m campus.pipeline fetch    # OSM 원본 내려받기 → data/raw/osm.json
uv run python -m campus.pipeline build    # 원본 → web/public/data/*.json
uv run python -m campus.pipeline schema   # Pydantic → shared/schema/campus.schema.json
uv run python -m campus.pipeline all      # 위 세 단계를 순서대로
"""

import argparse
from pathlib import Path

from pydantic import BaseModel

from campus import schema
from campus.config import (
    ATTRIBUTION,
    CAMPUS_BOUNDARY_WAY_ID,
    RAW_OSM_PATH,
    WEB_DATA_DIR,
)
from campus.models import BuildingIndex, BuildingIndexEntry, CampusData
from campus.pipeline import osm
from campus.pipeline.buildings import campus_boundary, classify, exterior, load_meta
from campus.pipeline.graph import build_graph
from campus.pipeline.project import Projector


def write_json(path: Path, model: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        model.model_dump_json(exclude_none=False) + "\n",
        encoding="utf-8",
    )


def build(raw_path: Path = RAW_OSM_PATH, out_dir: Path = WEB_DATA_DIR) -> None:
    elements, source_timestamp = osm.load(raw_path)
    proj = Projector()
    boundary = campus_boundary(elements, proj, CAMPUS_BOUNDARY_WAY_ID)
    buildings, context, b_report = classify(elements, proj, boundary, load_meta())
    graph, g_report = build_graph(elements, proj, boundary, buildings)

    campus = CampusData(
        source_timestamp=source_timestamp,
        origin=proj.origin,
        crs=proj.crs,
        attribution=ATTRIBUTION,
        boundary=exterior(boundary),
        buildings=buildings,
        context=context,
    )
    index = BuildingIndex(
        buildings=[BuildingIndexEntry(id=b.id, name=b.name, aliases=b.aliases) for b in buildings]
    )
    write_json(out_dir / "campus.json", campus)
    write_json(out_dir / "paths.json", graph)
    write_json(out_dir / "buildings-index.json", index)

    print("── 파이프라인 리포트 ──")
    print(
        f"캠퍼스 건물 {b_report.campus}개 · 주변 건물 {b_report.context}개 "
        f"· 제외 {b_report.skipped}개"
    )
    print(f"보행로 노드 {g_report.nodes}개 · 간선 {g_report.edges}개")
    print(
        f"원본 연결 요소 {g_report.components_before}개 "
        f"(가장 큰 요소 외 노드 {g_report.dropped_nodes}개 제외)"
    )
    print(f"입구 연결 {g_report.linked_buildings}/{b_report.campus}개 건물")
    if g_report.unlinked_buildings:
        print(f"  ⚠ 보행로에 연결 못 한 건물: {', '.join(g_report.unlinked_buildings)}")
    if b_report.unnamed:
        print(f"  ⚠ 이름 없는 건물(building_meta.json에 추가 필요): {', '.join(b_report.unnamed)}")
    if b_report.estimated_levels:
        print(f"  ⚠ 층수 추정값 사용: {', '.join(b_report.estimated_levels)}")
    print(f"→ {out_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="campus.pipeline",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "command", choices=["fetch", "build", "schema", "all"], nargs="?", default="build"
    )
    args = parser.parse_args()

    if args.command in ("fetch", "all"):
        data = osm.fetch()
        print(f"OSM 요소 {len(data['elements'])}개 → {RAW_OSM_PATH}")
    if args.command in ("build", "all"):
        build()
    if args.command in ("schema", "all"):
        print(f"schema → {schema.write_schema()}")


if __name__ == "__main__":
    main()
