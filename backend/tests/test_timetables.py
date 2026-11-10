import csv
import json
from pathlib import Path

import pytest

from campus.config import BACKEND_DIR, WEB_DATA_DIR
from campus.pipeline.import_timetables import (
    build_table,
    parse_meetings,
    parse_source,
    resolve_location,
)


def test_multiple_locations_and_non_contiguous_periods():
    meetings = parse_meetings("월1 ,1.5(본507), 수2 ,2.5 ,4 ,4.5(디301-B)")
    assert [(m["day"], m["start"], m["end"], m["location"]) for m in meetings] == [
        ("월", "09:00", "10:00", "본507"),
        ("수", "10:00", "11:00", "디301-B"),
        ("수", "12:00", "13:00", "디301-B"),
    ]


def test_half_hour_start_and_empty_location():
    assert parse_meetings("화2.5(학101)")[0]["start"] == "10:30"
    assert parse_meetings("화2.5(학101)")[0]["end"] == "11:00"
    assert parse_meetings("월1 ,1.5()") == []
    with pytest.raises(ValueError):
        parse_meetings("월1 ,1.5(본507), 알 수 없는 형식")


def test_excludes_closed_and_missing_location_and_keeps_notes(tmp_path: Path):
    rows = []
    for code, schedule, note in [
        ("10000-001", "월1 ,1.5(학101)", "미개설"),
        ("10000-002", "", ""),
        ("10000-003", "월1 ,1.5()", ""),
        ("10000-004", "월1 ,1.5(학101)", "블렌디드러닝\n2026학번 대상"),
    ]:
        row = [""] * 17
        row[3], row[4], row[7], row[8] = code, "시험 강좌", "2", "2"
        row[13], row[15] = schedule, note
        rows.append(row)
    path = tmp_path / "source.tsv"
    with path.open("w", encoding="utf-8", newline="") as output:
        csv.writer(output, delimiter="\t").writerows(rows)
    courses, excluded = parse_source(path)
    assert set(courses) == {"10000-004"}
    assert len(excluded) == 3
    assert courses["10000-004"]["capacity"] is None
    assert courses["10000-004"]["note"] == "블렌디드러닝\n2026학번 대상"


def test_overlaps_preserved_and_evening_hours_extended():
    courses = {
        "a": {"meetings": parse_meetings("금10 ,10.5 ,11 ,11.5(학101)")},
        "b": {"meetings": parse_meetings("금11 ,11.5 ,12 ,12.5(학101)")},
    }
    table, conflicts = build_table("학101", courses, {"room_id": "student_union:1:1"})
    assert table["columns"][-1] == "20:30-21:00"
    assert table["rows"][4]["19:00-19:30"] == ["a", "b"]
    assert len(table["sessions"]) == 2
    assert len(conflicts) == 2


def test_mapping_does_not_guess_nearby_room():
    room = {
        "id": "design:2:2",
        "name": "301-B호",
        "description": "강의실",
        "tags": [],
        "category": "공간",
    }
    interiors = {"design": {"floors": [{"rooms": [room]}]}}
    buildings = {"design": "디자인관"}
    assert resolve_location("디301-B", buildings, interiors)["room_id"] == "design:2:2"
    assert resolve_location("디301", buildings, interiors)["room_id"] is None
    assert resolve_location("테니스장", buildings, interiors)["room_id"] is None


def test_imported_dataset_is_complete_and_excluded_courses_absent():
    source = BACKEND_DIR / "data/timetable_sources/2026-2.tsv"
    courses, excluded = parse_source(source)
    assert len(courses) == 600
    assert len(excluded) == 465
    tables = [
        json.loads(p.read_text(encoding="utf-8"))
        for p in (BACKEND_DIR / "data/timetables").glob("*.json")
    ]
    imported = {code for table in tables for code in table["courses"]}
    assert imported == set(courses)
    assert imported.isdisjoint({item["code"] for item in excluded})
    expected = sorted(
        (code, m["day"], m["start"], m["end"], m["location"])
        for code, course in courses.items()
        for m in course["meetings"]
    )
    actual = sorted(
        (s["code"], s["day"], s["start"], s["end"], s["location"])
        for table in tables
        for s in table["sessions"]
    )
    assert actual == expected
    assert len(tables) == 93
    assert sum(t["room_id"] is not None for t in tables) == 83
    for table in tables:
        if table["room_id"]:
            interior = json.loads(
                (WEB_DATA_DIR / "floors" / f"{table['building_id']}.json").read_text(
                    encoding="utf-8"
                )
            )
            assert table["room_id"] in {r["id"] for f in interior["floors"] for r in f["rooms"]}
