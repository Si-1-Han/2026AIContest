"""Campus API

uv run uvicorn campus.api.main:app --reload       # http://localhost:8000/docs
"""

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlmodel import Session, select

from campus.api.db import BuildingOverride, Event, make_engine, session_scope
from campus.api.settings import Settings, get_settings
from campus.api.store import CampusStore
from campus.models import (
    Building,
    BuildingInterior,
    BuildingPatch,
    CampusData,
    EventIn,
    Health,
    PathGraph,
    RouteRequest,
    RouteResponse,
    StatsOut,
    TopDestination,
)
from campus.routing import RouteError, RoutingEngine


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    app = FastAPI(title="Hansei 3D Campus API", version="0.1.0")
    app.state.settings = settings
    app.state.store = CampusStore(settings.data_dir)
    store_ = app.state.store
    app.state.router = RoutingEngine(store_.campus, store_.graph, store_.interior)
    app.state.engine = make_engine(settings.database_url)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["*"],
    )

    def get_session(request: Request) -> Iterator[Session]:
        yield from session_scope(request.app.state.engine)

    def get_store(request: Request) -> CampusStore:
        return request.app.state.store

    SessionDep = Annotated[Session, Depends(get_session)]
    StoreDep = Annotated[CampusStore, Depends(get_store)]

    def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
        if not settings.admin_token:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "편집 API가 비활성화되어 있습니다.")
        if x_admin_token != settings.admin_token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "관리자 토큰이 올바르지 않습니다.")

    @app.get("/health", response_model=Health)
    def health(store: StoreDep) -> Health:
        return Health(
            status="ok", buildings=len(store.campus.buildings), nodes=len(store.graph.nodes)
        )

    @app.get("/api/v1/campus", response_model=CampusData)
    def campus(store: StoreDep, session: SessionDep) -> CampusData:
        return store.merged_campus(session)

    @app.get("/api/v1/graph", response_model=PathGraph)
    def graph(store: StoreDep) -> PathGraph:
        return store.graph

    @app.get("/api/v1/buildings/{building_id}", response_model=Building)
    def building(building_id: str, store: StoreDep, session: SessionDep) -> Building:
        b = store.building(session, building_id)
        if b is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "건물을 찾을 수 없습니다.")
        return b

    @app.get("/api/v1/buildings/{building_id}/interior", response_model=BuildingInterior)
    def building_interior(building_id: str, store: StoreDep) -> BuildingInterior:
        interior = store.interior(building_id)
        if interior is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "층·강의실 데이터가 없습니다.")
        return interior

    @app.post("/api/v1/route", response_model=RouteResponse)
    def route(req: RouteRequest, request: Request) -> RouteResponse:
        """출발·도착(건물 또는 강의실) 사이의 경로와 단계별 안내.

        출입구 조합을 자동으로 고르고, 강의실 ↔ 출입구 층 이동까지 시간에 넣는다.
        profile: recommended(최단 시간) · accessible(엘리베이터 우선) · walkway(차도 회피)
        """
        try:
            return request.app.state.router.route(req)
        except RouteError as err:
            raise HTTPException(err.status, err.message) from err

    @app.put(
        "/api/v1/buildings/{building_id}",
        response_model=Building,
        dependencies=[Depends(require_admin)],
    )
    def update_building(
        building_id: str, patch: BuildingPatch, store: StoreDep, session: SessionDep
    ) -> Building:
        if building_id not in store.building_ids:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "건물을 찾을 수 없습니다.")
        existing = session.get(BuildingOverride, building_id)
        merged = json.loads(existing.patch_json) if existing else {}
        merged.update(patch.model_dump(exclude_unset=True))
        row = existing or BuildingOverride(building_id=building_id, patch_json="{}")
        row.patch_json = json.dumps(merged, ensure_ascii=False)
        row.updated_at = datetime.now(UTC)
        session.add(row)
        session.commit()
        return store.building(session, building_id)  # type: ignore[return-value]

    @app.post("/api/v1/events", status_code=status.HTTP_202_ACCEPTED)
    def record_event(event: EventIn, session: SessionDep) -> dict[str, bool]:
        session.add(Event(**event.model_dump()))
        session.commit()
        return {"accepted": True}

    @app.get("/api/v1/stats", response_model=StatsOut)
    def stats(session: SessionDep) -> StatsOut:
        by_type = dict(session.exec(select(Event.type, func.count()).group_by(Event.type)).all())
        top = session.exec(
            select(Event.target_id, func.count().label("n"))
            .where(Event.type.in_(["route", "guide", "building_view"]))  # type: ignore[attr-defined]
            .where(Event.target_id.is_not(None))  # type: ignore[union-attr]
            .group_by(Event.target_id)
            .order_by(func.count().desc())
            .limit(5)
        ).all()
        guide_total = session.exec(
            select(func.count()).where(Event.type == "guide", Event.success.is_not(None))  # type: ignore[union-attr]
        ).one()
        guide_ok = session.exec(
            select(func.count()).where(Event.type == "guide", Event.success.is_(True))  # type: ignore[union-attr]
        ).one()
        return StatsOut(
            total_events=sum(by_type.values()),
            by_type=by_type,
            top_destinations=[TopDestination(building_id=t, count=n) for t, n in top],
            guide_success_rate=round(guide_ok / guide_total, 3) if guide_total else None,
        )

    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn campus.api.main:app` 실행 시에만 앱을 만든다 (테스트는 create_app 사용).
    if name == "app":
        return create_app()
    raise AttributeError(name)
