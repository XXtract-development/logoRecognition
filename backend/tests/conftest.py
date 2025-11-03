"""
Shared test configuration and fixtures for all tests.
Provides database isolation and cleanup for PostgreSQL tests.
"""
import pytest
import os
import sys

# Add parent directory to path BEFORE importing app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from app.models.base import Base
from prometheus_client import REGISTRY


@pytest.fixture(scope="function")
def db_session():
    """
    Provide a transactional scope around a series of operations.
    This ensures each test runs in isolation with automatic rollback.
    Uses savepoints to allow commits within tests while rolling back the whole test.
    """
    database_url = os.getenv(
        "TEST_DATABASE_URL",
        "postgresql://postgres:test_password_123_IN_PRODUCTION@localhost:5432/logo_recognition_test"
    )

    engine = create_engine(database_url)

    # Create all tables
    Base.metadata.create_all(engine)

    # Clean existing data BEFORE starting transaction
    # This must be done in a separate connection to work
    from sqlalchemy import text
    with engine.connect() as cleanup_conn:
        cleanup_trans = cleanup_conn.begin()
        for table in reversed(Base.metadata.sorted_tables):
            try:
                cleanup_conn.execute(text(f"TRUNCATE TABLE {table.name} CASCADE"))
            except Exception:
                pass
        cleanup_trans.commit()

    # Now create a connection for the test
    connection = engine.connect()

    # Start outer transaction
    transaction = connection.begin()

    # Create session bound to the connection
    SessionLocal = sessionmaker(bind=connection)
    session = SessionLocal()

    # Use nested transactions (savepoints) so commits work within tests
    # but the whole test is rolled back
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def end_savepoint(session, transaction):
        """Restart savepoint after commit/rollback within test."""
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    yield session

    # Cleanup - rollback everything
    session.close()
    if transaction.is_active:
        transaction.rollback()
    connection.close()


@pytest.fixture(autouse=True, scope="function")
def clear_prometheus_registry():
    """Clear Prometheus registry before each test to prevent duplication errors."""
    # Store initial collectors
    collectors_before = list(REGISTRY._collector_to_names.keys())

    yield

    # Remove collectors added during test
    collectors_after = list(REGISTRY._collector_to_names.keys())
    for collector in collectors_after:
        if collector not in collectors_before:
            try:
                REGISTRY.unregister(collector)
            except Exception:
                pass
