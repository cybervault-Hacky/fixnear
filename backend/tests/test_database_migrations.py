"""Offline migration checks that do not require a Neon connection."""

from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from app.core.config import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC_CONFIG = BACKEND_ROOT / "alembic.ini"
EXPECTED_TABLES = {
    "alembic_version",
    "app_users",
    "booking_attachments",
    "booking_events",
    "booking_location_access_events",
    "booking_quote_line_items",
    "booking_quotes",
    "booking_visits",
    "bookings",
    "customer_addresses",
    "customer_profiles",
    "mutation_idempotency",
    "roles",
    "service_categories",
    "service_catalog_audit_events",
    "services",
    "technician_availability_preferences",
    "technician_coverage_areas",
    "technician_profiles",
    "technician_skills",
    "technician_verification_reviews",
    "user_audit_events",
    "user_roles",
}


def _alembic_config() -> Config:
    return Config(str(ALEMBIC_CONFIG))


def test_full_migration_chain_upgrades_and_downgrades_sqlite(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Exercise migration ordering, seeded roles, and rollback on a local DB."""

    database_path = tmp_path / "migration-test.sqlite3"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("ALEMBIC_DATABASE_URL", database_url)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()

    try:
        config = _alembic_config()
        command.upgrade(config, "head")
        command.check(config)

        engine = create_engine(database_url)
        with engine.connect() as connection:
            assert set(inspect(connection).get_table_names()) == EXPECTED_TABLES
            role_codes = set(connection.scalars(text("SELECT code FROM roles")).all())
            assert role_codes == {"customer", "technician", "admin"}
            assert (
                connection.scalar(text("SELECT COUNT(*) FROM service_categories")) == 2
            )
            assert connection.scalar(text("SELECT COUNT(*) FROM services")) == 6
            service_slugs = set(
                connection.scalars(text("SELECT slug FROM services")).all()
            )
            assert service_slugs == {
                "ac-repair",
                "refrigerator-repair",
                "washing-machine-repair",
                "ro-repair",
                "electrical",
                "plumbing",
            }
            assert {"latitude", "longitude", "location_accuracy_meters"} <= {
                column["name"]
                for column in inspect(connection).get_columns("customer_addresses")
            }
            assert {"latitude", "longitude", "location_accuracy_meters"} <= {
                column["name"] for column in inspect(connection).get_columns("bookings")
            }
            assert {"center_latitude", "center_longitude"} <= {
                column["name"]
                for column in inspect(connection).get_columns(
                    "technician_coverage_areas"
                )
            }
            assert connection.scalar(text("SELECT COUNT(*) FROM booking_visits")) == 0
            assert (
                connection.scalar(
                    text("SELECT COUNT(*) FROM booking_location_access_events")
                )
                == 0
            )
            technician_columns = {
                column["name"]
                for column in inspect(connection).get_columns("technician_profiles")
            }
            assert "verification_status" in technician_columns
            audit_columns = {
                column["name"]
                for column in inspect(connection).get_columns(
                    "service_catalog_audit_events"
                )
            }
            assert audit_columns == {
                "id",
                "actor_user_id",
                "entity_type",
                "entity_id",
                "action",
                "changed_fields",
                "created_at",
            }
        engine.dispose()

        command.downgrade(_alembic_config(), "base")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            assert set(inspect(connection).get_table_names()) == {"alembic_version"}
            assert connection.scalar(text("SELECT COUNT(*) FROM alembic_version")) == 0
        engine.dispose()
    finally:
        get_settings.cache_clear()


def test_phase7_migration_downgrade_preserves_phase6_accounts_and_profiles(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Upgrade and roll back only the new phase without damaging Phase 6 rows."""

    database_path = tmp_path / "phase-rollback.sqlite3"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("ALEMBIC_DATABASE_URL", database_url)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    user_id = uuid4()
    auth_subject = uuid4()

    try:
        command.upgrade(_alembic_config(), "0001_user_management")
        engine = create_engine(database_url)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO app_users (id, auth_issuer, auth_subject, status) "
                    "VALUES (:id, :issuer, :subject, :status)"
                ),
                {
                    "id": str(user_id),
                    "issuer": "https://supabase.invalid/auth/v1",
                    "subject": str(auth_subject),
                    "status": "active",
                },
            )
            connection.execute(
                text(
                    "INSERT INTO technician_profiles (user_id, display_name) "
                    "VALUES (:id, :name)"
                ),
                {"id": str(user_id), "name": "Phase 6 profile"},
            )
        engine.dispose()

        command.upgrade(_alembic_config(), "head")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            assert (
                "service_catalog_audit_events" in inspect(connection).get_table_names()
            )
            assert (
                connection.scalar(
                    text(
                        "SELECT display_name FROM technician_profiles WHERE user_id = :id"
                    ),
                    {"id": str(user_id)},
                )
                == "Phase 6 profile"
            )
            assert (
                connection.scalar(
                    text(
                        "SELECT verification_status FROM technician_profiles WHERE user_id = :id"
                    ),
                    {"id": str(user_id)},
                )
                == "not_submitted"
            )
        engine.dispose()

        command.downgrade(_alembic_config(), "0002_service_technician")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            table_names = set(inspect(connection).get_table_names())
            assert "service_catalog_audit_events" not in table_names
            assert "services" in table_names
            assert "technician_skills" in table_names
            assert (
                connection.scalar(
                    text(
                        "SELECT display_name FROM technician_profiles WHERE user_id = :id"
                    ),
                    {"id": str(user_id)},
                )
                == "Phase 6 profile"
            )
        engine.dispose()

        command.downgrade(_alembic_config(), "0001_user_management")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            table_names = set(inspect(connection).get_table_names())
            assert "app_users" in table_names
            assert "technician_profiles" in table_names
            assert "services" not in table_names
            assert (
                connection.scalar(
                    text(
                        "SELECT display_name FROM technician_profiles WHERE user_id = :id"
                    ),
                    {"id": str(user_id)},
                )
                == "Phase 6 profile"
            )
            columns = {
                column["name"]
                for column in inspect(connection).get_columns("technician_profiles")
            }
            assert "verification_status" not in columns
        engine.dispose()
    finally:
        get_settings.cache_clear()


def test_phase8_migration_downgrade_preserves_phase7_catalog_and_user_rows(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Remove only booking tables and preserve all Phase 1–7 data and audit tables."""

    database_path = tmp_path / "phase8-rollback.sqlite3"
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("ALEMBIC_DATABASE_URL", database_url)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()
    user_id = uuid4()
    auth_subject = uuid4()
    audit_id = uuid4()

    try:
        command.upgrade(_alembic_config(), "0003_service_catalog_audit")
        engine = create_engine(database_url)
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO app_users (id, auth_issuer, auth_subject, status) "
                    "VALUES (:id, :issuer, :subject, :status)"
                ),
                {
                    "id": str(user_id),
                    "issuer": "https://supabase.invalid/auth/v1",
                    "subject": str(auth_subject),
                    "status": "active",
                },
            )
            connection.execute(
                text(
                    "INSERT INTO customer_profiles (user_id, display_name) VALUES (:id, :name)"
                ),
                {"id": str(user_id), "name": "Phase 7 customer"},
            )
            service_id = connection.scalar(
                text("SELECT id FROM services WHERE slug = 'ac-repair'")
            )
            connection.execute(
                text(
                    "INSERT INTO service_catalog_audit_events "
                    "(id, actor_user_id, entity_type, entity_id, action, changed_fields) "
                    "VALUES (:id, :actor, :entity_type, :entity_id, :action, :fields)"
                ),
                {
                    "id": str(audit_id),
                    "actor": str(user_id),
                    "entity_type": "service",
                    "entity_id": str(service_id),
                    "action": "updated",
                    "fields": "[]",
                },
            )
        engine.dispose()

        command.upgrade(_alembic_config(), "head")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            table_names = set(inspect(connection).get_table_names())
            assert {"bookings", "booking_quotes", "booking_events"} <= table_names
            assert connection.scalar(text("SELECT COUNT(*) FROM bookings")) == 0
        engine.dispose()

        command.downgrade(_alembic_config(), "0003_service_catalog_audit")
        engine = create_engine(database_url)
        with engine.connect() as connection:
            table_names = set(inspect(connection).get_table_names())
            assert "bookings" not in table_names
            assert "customer_addresses" not in table_names
            assert "booking_quotes" not in table_names
            assert "mutation_idempotency" not in table_names
            assert "services" in table_names
            assert "technician_profiles" in table_names
            assert "service_catalog_audit_events" in table_names
            assert (
                connection.scalar(
                    text(
                        "SELECT display_name FROM customer_profiles WHERE user_id = :id"
                    ),
                    {"id": str(user_id)},
                )
                == "Phase 7 customer"
            )
            assert (
                connection.scalar(
                    text(
                        "SELECT COUNT(*) FROM service_catalog_audit_events WHERE id = :id"
                    ),
                    {"id": str(audit_id)},
                )
                == 1
            )
        engine.dispose()
    finally:
        get_settings.cache_clear()


def test_postgresql_migration_sql_compiles_without_a_database_connection(
    monkeypatch,
    capsys,
) -> None:
    """Generate PostgreSQL DDL offline; this does not claim a live DB test."""

    monkeypatch.setenv(
        "ALEMBIC_DATABASE_URL",
        "postgresql+psycopg://user:password@localhost/fixnear_test",
    )
    monkeypatch.delenv("DATABASE_URL", raising=False)
    get_settings.cache_clear()

    try:
        command.upgrade(_alembic_config(), "head", sql=True)
        sql = capsys.readouterr().out
        assert "CREATE TABLE app_users" in sql
        assert "CREATE TABLE user_roles" in sql
        assert "CREATE TABLE user_audit_events" in sql
        assert "CREATE TABLE service_categories" in sql
        assert "CREATE TABLE services" in sql
        assert "CREATE TABLE technician_skills" in sql
        assert "CREATE TABLE technician_availability_preferences" in sql
        assert "CREATE TABLE customer_addresses" in sql
        assert "CREATE TABLE bookings" in sql
        assert "CREATE TABLE booking_quotes" in sql
        assert "CREATE TABLE booking_events" in sql
        assert "CREATE TABLE mutation_idempotency" in sql
        assert "CREATE TABLE booking_visits" in sql
        assert "CREATE TABLE booking_location_access_events" in sql
        assert "center_latitude" in sql
        assert "location_accuracy_meters" in sql
        assert "'ac-repair'" in sql
        assert "'not_submitted'" in sql
        assert "'admin'" in sql
    finally:
        get_settings.cache_clear()
