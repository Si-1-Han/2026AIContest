"""Import the university's tab-separated, paginated course export.

python -m campus.pipeline.import_timetables <source.txt>
"""

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

from campus.config import BACKEND_DIR, WEB_DATA_DIR

PREFIXES = {
    "본": "main",
    "대": "graduate",
    "디": "design",
    "이": "science",
    "학": "student_union",
    "음": "music",
    "신": "theology",
    "영": "vision_center",
    "G": "gemi",
}
DAYS = "월화수목금토일"
MEETING = re.compile(r"([월화수목금토일])\s*([\d.,\s]+)\(([^()]*)\)")


def clock(value: int) -> str:
    return f"{value // 60:02}:{value % 60:02}"


def minute(value: str) -> int:
    hour, part = map(int, value.split(":"))
    return hour * 60 + part


def parse_meetings(value: str) -> list[dict]:
    """Retain distinct rooms/days and split non-contiguous periods into blocks."""
    if MEETING.sub("", value).strip(" ,\r\n\t"):
        raise ValueError(f"Unrecognized schedule: {value}")
    meetings = []
    for day, raw_periods, location in MEETING.findall(value):
        location = location.strip()
        if not location:
            continue
        periods = sorted({float(p.strip()) for p in raw_periods.split(",") if p.strip()})
        if not periods or any(p < 1 or p > 15.5 or p * 2 != int(p * 2) for p in periods):
            raise ValueError(f"Invalid periods: {value}")
        groups: list[list[float]] = []
        for period in periods:
            if not groups or period != groups[-1][-1] + 0.5:
                groups.append([])
            groups[-1].append(period)
        for group in groups:
            meetings.append(
                {
                    "day": day,
                    "start": clock(int(540 + (group[0] - 1) * 60)),
                    "end": clock(int(540 + (group[-1] - 1) * 60 + 30)),
                    "location": location,
                    "periods": f"{day}{', '.join(f'{p:g}' for p in group)}({location})",
                }
            )
    return meetings


def parse_source(path: Path) -> tuple[dict, list[dict]]:
    courses = {}
    excluded = []
    section = ""
    with path.open(encoding="utf-8-sig", newline="") as source:
        for row in csv.reader(source, delimiter="\t"):
            if len(row) != 17 or not re.fullmatch(r"\d{5}-\d{3}", row[3].strip()):
                if len(row) == 17 and row[6].strip():
                    section = row[6].strip()
                continue
            row = [value.strip() for value in row]
            code = row[3]
            if code in courses:
                raise ValueError(f"Duplicate course code: {code}")
            reason = "미개설" if "미개설" in row[15] or "미개설" in row[13] else None
            if not row[13] and not reason:
                reason = "위치·시간 없음"
            if reason:
                excluded.append({"code": code, "name": row[4], "reason": reason})
                continue
            meetings = parse_meetings(row[13])
            if not meetings:
                excluded.append({"code": code, "name": row[4], "reason": "위치 없음"})
                continue
            courses[code] = {
                "name": row[4],
                "instructor": row[9] or "미배정",
                "target": row[1],
                "category": row[2],
                "department": section,
                "credits": float(row[7]) if row[7] else None,
                "weekly_hours": float(row[8]) if row[8] else None,
                "capacity": int(row[10]) if row[10] else None,
                "note": row[15],
                "periods": row[13],
                "meetings": meetings,
                "day": meetings[0]["day"],
                "start": meetings[0]["start"],
                "end": meetings[0]["end"],
            }
    return courses, excluded


def resolve_location(location: str, buildings: dict, interiors: dict) -> dict:
    building_id = PREFIXES.get(location[:1])
    number = location[1:] if building_id else location
    candidates = []
    for floor in interiors.get(building_id, {}).get("floors", []):
        for room in floor["rooms"]:
            if room["category"] != "공간":
                continue
            labels = [room["name"], room["description"], *room["tags"]]
            if any(re.fullmatch(re.escape(number) + r"\s*호?", v.strip(), re.I) for v in labels):
                candidates.append(room)
    name = f"{buildings[building_id]} {number}호" if building_id else location
    return {
        "name": name,
        "building_id": building_id,
        "room_id": candidates[0]["id"] if len(candidates) == 1 else None,
        "room_name": f"{number}호" if building_id else location,
        "source_location": location,
        "mapping_status": "linked" if len(candidates) == 1 else "unlinked",
    }


def build_table(location: str, courses: dict, mapping: dict) -> tuple[dict, list[dict]]:
    sessions = [
        {"code": code, **meeting}
        for code, course in courses.items()
        for meeting in course["meetings"]
        if meeting["location"] == location
    ]
    sessions.sort(key=lambda s: (DAYS.index(s["day"]), s["start"], s["end"], s["code"]))
    start = min(540, min(minute(s["start"]) for s in sessions)) // 60 * 60
    end = (max(1080, max(minute(s["end"]) for s in sessions)) + 59) // 60 * 60
    slots = [f"{clock(t)}-{clock(t + 30)}" for t in range(start, end, 30)]
    days = list(DAYS[:5]) + [d for d in DAYS[5:] if any(s["day"] == d for s in sessions)]
    rows, conflicts = [], []
    for day in days:
        row: dict = {"요일": day}
        for slot in slots:
            codes = sorted(
                {
                    s["code"]
                    for s in sessions
                    if s["day"] == day and s["start"] <= slot[:5] < s["end"]
                }
            )
            row[slot] = codes if len(codes) > 1 else codes[0] if codes else None
            if len(codes) > 1:
                conflicts.append({"location": location, "day": day, "slot": slot, "codes": codes})
        rows.append(row)
    used = {s["code"] for s in sessions}
    return {
        "schema_version": 2,
        "semester": "2026학년도 2학기",
        **mapping,
        "time_basis": {"first_period_start": "09:00", "slot_minutes": 30},
        "columns": ["요일", *slots],
        "rows": rows,
        "courses": {code: courses[code] for code in sorted(used)},
        "sessions": sessions,
        "cell_format": (
            "강좌 코드 또는 null. 시간 중복은 코드 배열로 보존하며 "
            "sessions에 모든 수업을 기록합니다."
        ),
    }, conflicts


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(source: Path, output: Path, report_path: Path) -> dict:
    courses, excluded = parse_source(source)
    campus = json.loads((WEB_DATA_DIR / "campus.json").read_text(encoding="utf-8"))
    buildings = {b["id"]: b["name"] for b in campus["buildings"]}
    interiors = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))
        for p in (WEB_DATA_DIR / "floors").glob("*.json")
    }
    locations = sorted({m["location"] for c in courses.values() for m in c["meetings"]})
    tables, conflicts, unlinked, linked_codes = [], [], [], set()
    for location in locations:
        mapping = resolve_location(location, buildings, interiors)
        table, overlaps = build_table(location, courses, mapping)
        # Unmapped spaces are saved in the same format, but never attached to a guessed room.
        suffix = location[1:] if mapping["building_id"] else location
        filename = f"{mapping['building_id'] or 'unlinked'}_{suffix}.json"
        write_json(output / filename, table)
        tables.append({"file": filename, **mapping, "courses": len(table["courses"])})
        conflicts.extend(overlaps)
        if not mapping["room_id"]:
            unlinked.append(tables[-1])
        else:
            linked_codes.update(table["courses"])
    reasons: dict[str, int] = defaultdict(int)
    for item in excluded:
        reasons[item["reason"]] += 1
    report = {
        "semester": "2026학년도 2학기",
        "source": source.name,
        "source_courses": len(courses) + len(excluded),
        "imported_courses": len(courses),
        "linked_courses": len(linked_codes),
        "excluded_counts": dict(reasons),
        "timetables": len(tables),
        "linked_timetables": len(tables) - len(unlinked),
        "unlinked": unlinked,
        "conflicts": conflicts,
        "excluded": excluded,
        "tables": tables,
    }
    write_json(report_path, report)
    write_json(
        report_path.with_name("room-index.json"), [t for t in tables if t["room_id"] is not None]
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=BACKEND_DIR / "data/timetables")
    parser.add_argument(
        "--report", type=Path, default=BACKEND_DIR / "data/timetable_sources/import-report.json"
    )
    args = parser.parse_args()
    report = run(args.source, args.output, args.report)
    print(
        json.dumps(
            {
                k: v
                for k, v in report.items()
                if k not in {"tables", "excluded", "conflicts", "unlinked"}
            },
            ensure_ascii=True,
        )
    )
    print(
        f"Unlinked locations: {len(report['unlinked'])}; "
        f"conflicting half-hour cells: {len(report['conflicts'])}"
    )


if __name__ == "__main__":
    main()
