"""SQLite 저장소: 편집 내용(BuildingOverride)과 이용 이벤트(Event)."""

from collections.abc import Iterator
from datetime import UTC, datetime

from sqlalchemy import Engine
from sqlmodel import Field, Session, SQLModel, create_engine


def _now() -> datetime:
    return datetime.now(UTC)


class BuildingOverride(SQLModel, table=True):
    building_id: str = Field(primary_key=True)
    patch_json: str  # BuildingPatch.model_dump_json(exclude_unset=True)
    updated_at: datetime = Field(default_factory=_now)


class Event(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    type: str = Field(index=True)
    target_id: str | None = Field(default=None, index=True)
    query: str | None = None
    success: bool | None = None
    created_at: datetime = Field(default_factory=_now)


def make_engine(url: str) -> Engine:
    if url.startswith("sqlite:///"):
        from pathlib import Path

        Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


def session_scope(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session
