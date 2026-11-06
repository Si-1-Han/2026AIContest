# 층·강의실 원본 데이터 (팀 관리)

3D 캠퍼스의 층별 외곽선과 강의실·시설 정보의 **원본**입니다. 여기서 수정하고 파이프라인을 다시 실행하면 화면에 반영됩니다.

```bash
cd backend
uv run python -m campus.pipeline build    # → web/public/data/floors/*.json, rooms-index.json
```

`build`가 출력하는 리포트에서 연결된 건물 수, 합쳐진 건물, 경고를 확인하세요.

## 출처

- 원본 배치·층·강의실: [HMH – 한세대학교 3D 캠퍼스맵](https://github.com/wjdgh0628/open_source_5) (원작자 허락을 받아 사용)
- 시설물 분류(`category`, `facility_group`), 대강당 데이터(`auditoriums.json`, `space_group`), 일부 보정: 팀원 작업. `2026_Hansei_AIcontest` 리포에서 2026-11-04에 이전했습니다.
- 건물 공식 이름과 층별 안내 요약: [한세대학교 사이버투어](https://hansei.ac.kr/view.do?no=10270). 이름과 요약은 `../building_meta.json`에서 관리합니다.

## 파일

| 파일 | 내용 |
|---|---|
| `buildings.geojson` | 건물별 층 구성과 층 외곽선 (위경도) |
| `rooms.json` | 건물·층별 강의실·시설 다각형 (위경도) |
| `auditoriums.json` | 본관 대강당 구역·좌석 배치 (아직 화면에 쓰지 않음, P2) |

### buildings.geojson

피처 하나가 한 건물이고, `properties.@id`가 건물의 원본 ID입니다. 우리 건물 ID와의 연결은 `../building_meta.json`의 `interior_id`로 합니다.

| 속성 | 설명 |
|---|---|
| `floors.flLevel` | 지상 층수 |
| `floors.bmLevel` | 지하 층수 |
| `floors.flVars` | 층 외곽선 후보 목록 |
| `floors.flList` | 아래층부터 각 층이 쓰는 `flVars` 번호 (길이 = 지하 + 지상) |

`@id`가 `*_alt`인 피처는 층 데이터가 없는 보조 덩어리입니다(`origin`이 주 건물). 층 외곽선이 이미 덮고 있으면 파이프라인이 무시합니다.

### rooms.json

```jsonc
{
  "stem": [            // 건물 @id
    [ {…}, {…} ],      // 0번 층 = 가장 아래 (지하가 있으면 지하부터)
    [ {…} ]            // 1번 층 …
  ]
}
```

| 필드 | 설명 |
|---|---|
| `name` | 표시 이름 (예: `301호`, `보건실`) |
| `type` | 분류 (예: `강의실,세미나실,멀티실`) |
| `category` | `공간`(강의실 등) 또는 `시설물`(계단·엘리베이터·화장실·출입구) |
| `facility_group` | 같이 선택할 시설물 묶음 (`stairs`, `elevators`, `entrances`, `name:화장실` …) |
| `desc` | 설명. 이름과 같으면 화면에서는 비워 둡니다. |
| `tags` | 검색용 별칭 (예: `영비스터디룸`). 길안내 검색에 쓰입니다. |
| `color` | 표시 색 |
| `polygon` | `[[ [lon, lat], … ]]` (두 번째 고리부터는 구멍) |
| `space_group`, `auditorium_part` | 대강당 구역 표시 |

**주의:** 강의실 ID는 `<건물 ID>:<층 번호>:<배열 순서>`입니다. 항목을 지우거나 순서를 바꾸면 그 층 뒤쪽 강의실의 ID가 바뀝니다. 새 항목은 층 배열의 **끝에 추가**하세요.

### 본관 대강당 층 배치

본관은 지하 1층이 있어 배열 인덱스 2가 2층, 4가 4층입니다. 대강당은 본관 2~4층 높이의 공간으로, A~H 구역은 2층, I~L 발코니 구역은 4층에 배치합니다. 두 좌석 층은 대강당 내부 계단으로 연결되며, 3층에는 별도 좌석 구역이 없습니다. 4층 외곽선에도 대강당 부분이 포함되어야 합니다.
