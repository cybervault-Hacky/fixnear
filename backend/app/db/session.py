"""Lazy SQLAlchemy engine and request-scoped session helpers."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create the process engine only when database access is first requested."""

    database_url = get_settings().database_url
    if database_url is None:
        raise RuntimeError('DATABASE_URL is required for database access.')

    return create_engine(
        database_url.get_secret_value(),
        pool_pre_ping=True,
    )


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    """Return a reusable factory; individual sessions remain request-scoped."""

    return sessionmaker(
        bind=get_engine(),
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )


def get_db_session() -> Iterator[Session]:
    """Yield a session and always close it without implicitly committing."""

    session = get_session_factory()()
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_database_caches() -> None:
    """Dispose cached engine resources; intended for controlled shutdown and tests."""

    if get_engine.cache_info().currsize:
        get_engine().dispose()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
