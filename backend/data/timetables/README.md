# 강의실 시간표

강의실마다 JSON 파일 하나를 둡니다. `student_union_101.json`을 기준으로 작성하세요.

- `name`: 테이블 제목. 실제 강의실 전체 이름(예: 학생회관 101호).
- `building_id`, `room_id`: 생성된 `web/public/data/floors/<건물>.json`의 건물·호실 ID와 일치해야 합니다. 원본 호실 배열 순서를 바꿨다면 ID도 확인하세요.
- `columns`: 첫 열은 `요일`, 이후 열은 `HH:MM-HH:MM` 시간대.
- `rows`: 월~금 행. 시간 칸은 강좌 코드 또는 `null`(등록된 수업 없음).
- `courses`: 강좌 코드별 이름, 교수, 요일, 시작·종료 시간, 비고 등.

`../timetable_sources/room-index.json`에 연결된 호실만 프론트엔드에 등록됩니다.
사용자가 해당 강의실을 선택할 때 JSON 하나를 불러옵니다. 해당 강의실을 선택하면
출발·도착 버튼 아래에 시간표가 표시됩니다. 화면에서는 요일을 위쪽 열에,
시간을 왼쪽에 1시간 눈금으로 표시하고 같은 강좌 코드가 연속된 칸은 하나의 수업으로 합칩니다.
JSON의 30분 단위 데이터는 유지하며, 화면에서 30분은 반 칸, 90분은 한 칸 반을 차지합니다.
수업 블록의 위치와 높이는 시간에 비례하며 전체 영역을 클릭하면 상세 모달이 열립니다.
JSON 저장 시 개발 화면에 반영되며 배포 빌드에도 포함됩니다.

## 전체 시간표 가져오기 (2026학년도 2학기)

프로젝트 루트에서 실행합니다.

```powershell
.\backend\.venv\Scripts\python.exe -m campus.pipeline.import_timetables backend/data/timetable_sources/2026-2.tsv
```

- 원본은 사용자가 제공한 탭 구분 텍스트이며 페이지 제목과 줄바꿈이 포함되어 있습니다.
- 미개설 및 위치가 없는 강좌는 시간표에 생성하지 않습니다.
- 지도 호실과 연결되지 않는 장소는 `room_id: null`, `mapping_status: "unlinked"`로 저장만 합니다.
- 기존 호실 이름 또는 설명에 적힌 정확한 번호로 연결합니다. 가까운 번호나 위치로 추정하지 않습니다.
- 변환 결과와 제외 내역·중복 배정은 `../timetable_sources/import-report.json`에 기록합니다.
- 새 JSON 파일을 수동으로 추가할 때는 `room-index.json`에도 파일명·건물·호실 정보를 등록하세요.
- 재가져오기는 원본에 포함된 장소의 JSON을 덮어씁니다. 원본에 없는 기존 파일을 삭제하지는 않지만,
  화면에는 이번 가져오기에서 생성된 인덱스만 사용됩니다.

### schema_version 2

- `semester`: 학기.
- `sessions`: 이 장소의 요일별 실제 수업 블록. 여러 요일·장소 수업과 불연속 교시를 분리합니다.
- `courses.*.meetings`: 과목의 전체 요일·장소별 일정. 모달에서 전체 일정을 보여줍니다.
- `rows`의 시간 칸은 강좌 코드, `null`, 또는 동시간대 중복 강좌의 코드 배열입니다.
- 같은 호실에서 과목명·교수·요일·시작/종료 시간이 같은 수업은 화면에서 한 블록으로 합칩니다.
  JSON 원본과 과목코드는 유지하며, 클릭하면 모달에 분반별 정보 표를 모두 표시합니다.
  과목명이나 교수, 시간이 다른 중복 수업은 나란히 표시합니다.
- 원본에 인원이 비어 있으면 `capacity: null`로 보존하며 모달에는 `미등록`으로 표시합니다.
- 기본 표는 월~금, 09:00~18:00입니다. 늦은 수업이나 주말 수업이 있으면 자동 확장됩니다.

검증 명령:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_timetables.py -q
node --experimental-strip-types web/scripts/test-timetable-layout.mjs
node web/scripts/test-timetable-render.mjs
```
