"""Environment-backed application settings."""

import ipaddress
from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
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
    mock_webhook_test_secret: SecretStr | None = Field(default=None, repr=False)
    log_level: str = 'INFO'
    rate_limit_enabled: bool = True
    rate_limit_redis_url: SecretStr | None = None
    rate_limit_trusted_proxies: list[str] = Field(default_factory=list)
    rate_limit_network_limit: int = Field(default=300, ge=1)
    rate_limit_network_window_seconds: int = Field(default=60, ge=1)

    @field_validator('rate_limit_trusted_proxies')
    @classmethod
    def validate_proxies(cls, entries: list[str]) -> list[str]:
        for entry in entries:
            try:
                network = ipaddress.ip_network(entry, strict=False)
                if network.prefixlen == 0:
                    raise ValueError('trusting all addresses is unsafe')
            except ValueError as exc:
                raise ValueError('Invalid or overly broad trusted proxy network') from exc
        return entries

    rate_limit_auth_limit: int = Field(default=20, ge=1)
    rate_limit_auth_window_seconds: int = Field(default=60, ge=1)
    rate_limit_global_limit: int = Field(default=300, ge=1)
    rate_limit_global_window_seconds: int = Field(default=60, ge=1)
    rate_limit_admin_overview_limit: int = Field(default=30, ge=1)
    rate_limit_admin_overview_window_seconds: int = Field(default=60, ge=1)
    rate_limit_admin_audit_limit: int = Field(default=60, ge=1)
    rate_limit_admin_audit_window_seconds: int = Field(default=60, ge=1)
    rate_limit_admin_search_limit: int = Field(default=60, ge=1)
    rate_limit_admin_search_window_seconds: int = Field(default=60, ge=1)
    rate_limit_review_submit_limit: int = Field(default=20, ge=1)
    rate_limit_review_submit_window_seconds: int = Field(default=60, ge=1)
    rate_limit_ticket_create_limit: int = Field(default=20, ge=1)
    rate_limit_ticket_create_window_seconds: int = Field(default=3600, ge=1)
    rate_limit_ticket_reply_limit: int = Field(default=60, ge=1)
    rate_limit_ticket_reply_window_seconds: int = Field(default=60, ge=1)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one validated settings instance per process."""

    return Settings()
