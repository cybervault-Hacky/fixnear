"""Alembic environment using the server-only configured database URL."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401 - register all mapped tables with Base.metadata
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
database_secret = settings.alembic_database_url or settings.database_url
if database_secret is None:
    raise RuntimeError('ALEMBIC_DATABASE_URL or DATABASE_URL must be configured.')
database_url = database_secret.get_secret_value()
config.set_main_option('sqlalchemy.url', database_url.replace('%', '%%'))
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate migration SQL without opening a database connection."""

    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={'paramstyle': 'named'},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a one-shot engine with no shared connection pool."""

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}) or {},
        prefix='sqlalchemy.',
        poolclass=pool.NullPool,
        pool_pre_ping=True,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
