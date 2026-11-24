"""Declarative base shared by application models and Alembic."""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for SQLAlchemy 2.x mapped models."""

    metadata = MetaData()
