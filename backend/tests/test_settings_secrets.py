"""Secrets are represented by Pydantic SecretStr in runtime settings."""

from pydantic import SecretStr

from app.core.config import Settings


def test_database_urls_are_secret_wrapped() -> None:
    settings = Settings(
        _env_file=None,
        database_url='postgresql+psycopg://user:secret@db.invalid/app',
        alembic_database_url='postgresql+psycopg://user:migration@db.invalid/app',
    )

    assert isinstance(settings.database_url, SecretStr)
    assert 'secret' not in repr(settings)
    assert settings.database_url.get_secret_value().endswith('/app')
