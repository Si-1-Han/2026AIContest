"""Pydantic 모델 → JSON Schema 내보내기.

    uv run python -m campus.schema

결과는 `shared/schema/campus.schema.json`에 저장되고,
`web`의 `npm run gen:types`가 이를 TypeScript 타입으로 바꾼다.
"""

import json
from pathlib import Path
from typing import Any

from pydantic.json_schema import models_json_schema

from campus import models
from campus.config import SCHEMA_PATH

# (모델, 모드). 서버가 내보내는 데이터는 serialization, 받는 데이터는 validation.
EXPORTED = [
    (models.CampusData, "serialization"),
    (models.PathGraph, "serialization"),
    (models.BuildingIndex, "serialization"),
    (models.BuildingInterior, "serialization"),
    (models.RoomIndex, "serialization"),
    (models.GuideRequest, "validation"),
    (models.RouteRequest, "validation"),
    (models.RouteResponse, "serialization"),
    (models.GuideResponse, "serialization"),
    (models.BuildingPatch, "validation"),
    (models.EventIn, "validation"),
    (models.StatsOut, "serialization"),
    (models.Health, "serialization"),
]


def _for_codegen(node: Any, keep_title: bool = False) -> Any:
    """TypeScript 생성기가 읽기 좋은 형태로 정리한다.

    - 속성마다 붙는 title을 지워, `Id1`, `Name2` 같은 별칭 타입이 생기지 않게 한다.
    - tuple(prefixItems)을 draft-07 배열형 items로 바꿔 `[number, number]`로 생성되게 한다.
    """
    if isinstance(node, list):
        return [_for_codegen(n) for n in node]
    if not isinstance(node, dict):
        return node
    out = {
        k: (v if k in ("properties", "$defs") else _for_codegen(v))
        for k, v in node.items()
        if keep_title or k != "title"
    }
    if "properties" in out:
        out["properties"] = {k: _for_codegen(v) for k, v in out["properties"].items()}
    if "$defs" in out:
        out["$defs"] = {k: _for_codegen(v, keep_title=True) for k, v in out["$defs"].items()}
    if "prefixItems" in out:
        out["items"] = out.pop("prefixItems")
        out["additionalItems"] = False
    return out


def build_schema() -> dict:
    _, schema = models_json_schema(EXPORTED, title="CampusContracts")
    schema = _for_codegen(schema, keep_title=True)
    schema["description"] = "자동 생성 파일 — backend/campus/models.py를 수정하세요."
    schema["additionalProperties"] = False
    return schema


def write_schema(path: Path = SCHEMA_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(build_schema(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return path


if __name__ == "__main__":
    print(f"wrote {write_schema()}")
