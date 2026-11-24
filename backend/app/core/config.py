"""Environment-backed application settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Typed settings loaded from environment variables and the root .env file."""

    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / '.env',
        env_file_encoding='utf-8',
        extra='ignore',
    )

    app_name: str = 'fixnear-api'
    app_version: str = '1.0.0'
    app_env: str = 'development'
    frontend_url: str = 'http://localhost:3000'
    backend_url: str = 'http://localhost:8000'
    database_url: SecretStr | None = None
    alembic_database_url: SecretStr | None = None
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_jwt_issuer: str | None = None
    supabase_jwt_audience: str = 'authenticated'
    supabase_jwt_leeway_seconds: int = Field(default=30, ge=0, le=120)
    supabase_jwks_cache_ttl_seconds: int = Field(default=300, ge=30, le=3600)
    cors_origins: list[str] = Field(default_factory=list)
    log_level: str = 'INFO'


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one validated settings instance per process."""

    return Settings()
