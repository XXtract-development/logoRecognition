"""
Prometheus metrics registry cleanup fixture for tests.
This must be imported in conftest.py to prevent metric duplication errors.
"""
import pytest
from prometheus_client import REGISTRY


@pytest.fixture(autouse=True, scope="function")
def clear_prometheus_registry():
    """Clear Prometheus registry before and after each test."""
    # Get all collectors before test
    collectors_before = list(REGISTRY._collector_to_names.keys())

    yield

    # Clear collectors added during test
    collectors_after = list(REGISTRY._collector_to_names.keys())
    for collector in collectors_after:
        if collector not in collectors_before:
            try:
                REGISTRY.unregister(collector)
            except Exception:
                pass  # Collector might already be unregistered
