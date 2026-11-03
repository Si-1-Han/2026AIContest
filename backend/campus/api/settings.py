from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from campus.config import BACKEND_DIR, WEB_DATA_DIR


class Settings(BaseSettings):
    """환경변수(CAMPUS_ 접두사) 또는 backend/.env로 설정한다."""

    model_config = SettingsConfigDict(env_prefix="CAMPUS_", env_file=BACKEND_DIR / ".env")

    data_dir: Path = WEB_DATA_DIR
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'app.db'}"
    admin_token: str = ""  # 비어 있으면 편집 API 비활성화
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
