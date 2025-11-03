"""Base database models configuration."""

from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
from typing import AsyncGenerator

# Create the declarative base
Base = declarative_base()

# Database URL (will be configured from settings)
DATABASE_URL = "postgresql+asyncpg://user:password@localhost/dbname"


# Async engine and session factory
engine = None
async_session_maker = None


def init_db(database_url: str):
    """Initialize database engine and session maker."""
    global engine, async_session_maker

    engine = create_async_engine(
        database_url,
        echo=False,
        future=True,
        pool_size=20,
        max_overflow=40,
    )

    async_session_maker = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    if async_session_maker is None:
        raise RuntimeError("Database not initialized. Call init_db first.")

    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


def get_db_sync():
    """Get sync database session for Celery tasks."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session, sessionmaker

    # Convert async URL to sync
    sync_url = DATABASE_URL.replace("+asyncpg", "")

    engine = create_engine(sync_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    return SessionLocal()