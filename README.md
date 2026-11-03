# 🏛️ 한세 3D 캠퍼스 (가칭)

> **말하면 길을 그려주는, 한세대학교 3D 캠퍼스 내비게이터**
> 2026-2 한세대학교 AI Contest 출품작 · 컴퓨터공학과 팀

한세대학교 캠퍼스를 게임처럼 화려한 3D로 재현한 웹 서비스입니다.
"학생회관에서 이공관 어떻게 가?"라고 물으면 AI가 출발지와 목적지를 알아듣고, 빛나는 경로를 따라 카메라가 캠퍼스를 날아갑니다.

> 🚧 **현재 상태:** 기획 완료 · 개발 착수 전 (2026-11-03)
> 자세한 내용은 [📄 프로젝트 계획서](docs/PROJECT_PLAN.md)를 참고하세요.

---

## ✨ 주요 기능 (계획)

| | 기능 | 설명 |
|---|---|---|
| 🎬 | **시네마틱 인트로** | 하늘에서 캠퍼스로 내려오며 건물이 땅에서 솟아오르는 오프닝과 BGM |
| 🏢 | **3D 캠퍼스** | 건물 11개 동을 스타일라이즈드 3D로 재현. 낮/노을/밤 전환과 블룸 효과 |
| 🧭 | **길찾기** | 보행로 그래프를 A*로 탐색하고, 발광 경로와 따라가는 카메라로 안내 |
| 🤖 | **AI 길안내 챗봇** | 자연어로 묻고 답하는 길안내. 네트워크 장애 시 규칙 기반 폴백 |
| 🧱 | **층 분해 뷰** | 건물을 선택하면 층이 벌어지며 강의실을 표시 |
| 🎥 | **자동 캠퍼스 투어** | 나레이션과 자막이 있는 카메라 투어 |
| 📊 | **AI 활용 대시보드** | 이 프로젝트를 만드는 데 쓴 AI 사용량을 시각화 |
| ✏️ | **편집 모드** | 건물 정보와 마커를 수정하고 JSON으로 내보내기 (목 데이터) |

## 🛠️ 기술 스택

- **Frontend:** Vite · React · TypeScript · Tailwind CSS
- **3D:** three.js · React Three Fiber · drei · postprocessing · GSAP
- **State / Audio:** zustand · howler.js
- **AI:** Vercel Serverless Function + LLM API (function calling)
- **Deploy:** Vercel · GitHub Actions

## 🗺️ 시스템 구성

```
[React UI 오버레이] ─┐
                     ├─ zustand ─ [R3F 3D 씬: 건물·경로·이펙트·카메라]
[AI 채팅] ── /api/guide (서버리스) ── LLM API
                     │
            public/data/*.json (캠퍼스·보행로·강의실 목 데이터)
```

## 📁 프로젝트 구조 (예정)

```
├── api/            # 서버리스 함수 (AI 길안내)
├── public/data/    # 캠퍼스·보행로·강의실 JSON
├── public/audio/   # BGM, 효과음, 나레이션
├── scripts/        # 데이터 변환, AI 사용량 집계
├── src/
│   ├── scene/      # 3D 씬 구성 요소
│   ├── camera/     # 카메라 비행·투어 연출
│   ├── features/   # intro, navigation, guide, tour, editor
│   ├── ui/         # 오버레이 UI
│   └── store/      # 전역 상태
└── docs/           # 계획서, AI 활용 기록
```

## 🚀 시작하기

> 개발 환경 세팅 후 업데이트 예정입니다.

```bash
git clone https://github.com/Si-1-Han/2026AIContest.git
cd 2026AIContest
npm install
npm run dev
```

## 📅 일정

| 기간 | 마일스톤 |
|---|---|
| 11/3 | 기획·리포 세팅 |
| 11/4–5 | 기본 3D 씬 |
| 11/6–8 | 건물 인터랙션 · 길찾기 |
| 11/9–11 | AI 챗봇 · 사운드 · 아트 |
| **11/12** | **기능 동결 · 배포** |
| 11/13–16 | 완성도 · 투어 · 발표 준비 |
| 11/17 | 제출·발표 (마감일 확정 시 갱신) |

## 👥 팀

| 이름 | 역할 (가안) |
|---|---|
| 한시원 | 총괄 · 데이터 · 길찾기 · AI 챗봇 |
| 유재웅 | 3D 씬 · 이펙트 · 카메라 연출 |
| 조상현 | UI/UX · 사운드 · 발표 · AI 활용 기록 |

## 🤝 협업 규칙

- 기능 단위 브랜치(`feat/…`, `fix/…`) → PR → 1명 리뷰 후 `main` 병합
- 커밋 메시지: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`
- AI로 작업한 세션은 `docs/ai-log/`에 기록 ([작성 규칙](docs/ai-log/README.md))

## 📜 데이터 출처 및 감사

- 건물 외곽선: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [ODbL](https://opendatacommons.org/licenses/odbl/)
- 층·강의실 데이터: [HMH – 한세대학교 3D 캠퍼스맵](https://github.com/wjdgh0628/open_source_5) 팀의 작업을 참고합니다. *(원작자 허락을 받은 뒤 사용하며, 사용 범위는 이 항목에 명시할 예정)*
