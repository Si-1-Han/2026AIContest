"""OpenStreetMap(Overpass API)에서 원본 데이터를 내려받는다."""

import json
from pathlib import Path
from typing import Any

import httpx

from campus.config import BBOX, CAMPUS_BOUNDARY_WAY_ID, RAW_OSM_PATH

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "hansei-3d-campus-pipeline/0.1 (+https://github.com/Si-1-Han/2026AIContest)"


def build_query(bbox: tuple[float, float, float, float] = BBOX) -> str:
    s, w, n, e = bbox
    b = f"({s},{w},{n},{e})"
    return (
        "[out:json][timeout:90];("
        f'way["building"]{b};'
        f'way["highway"]{b};'
        f"way({CAMPUS_BOUNDARY_WAY_ID});"
        ");out tags geom;"
    )


def fetch(path: Path = RAW_OSM_PATH, timeout: float = 120.0) -> dict[str, Any]:
    resp = httpx.post(
        OVERPASS_URL,
        data={"data": build_query()},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout,
    )
    resp.raise_for_status()
    data = resp.json()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    return data


def load(path: Path = RAW_OSM_PATH) -> tuple[list[dict[str, Any]], str]:
    """(요소 목록, OSM 기준 시각)"""
    if not path.exists():
        raise FileNotFoundError(
            f"{path}가 없습니다. 먼저 `uv run python -m campus.pipeline fetch`를 실행하세요."
        )
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["elements"], data.get("osm3s", {}).get("timestamp_osm_base", "unknown")


def way_coords(element: dict[str, Any]) -> list[tuple[float, float]]:
    """way의 (lon, lat) 좌표 목록"""
    return [(p["lon"], p["lat"]) for p in element.get("geometry", [])]
