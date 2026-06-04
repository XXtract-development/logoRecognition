"""
Test configuration for the artwork processing tests.

Mocks heavy ML-service dependencies that require Docker/GPU/external services
(database connections, model loading, MinIO) so tests can run in a bare Python
environment without the full container stack.
"""

import sys
from unittest.mock import MagicMock, AsyncMock


def _mock_module(name: str, **attrs) -> MagicMock:
    mock = MagicMock()
    for k, v in attrs.items():
        setattr(mock, k, v)
    sys.modules[name] = mock
    return mock


# ---- asyncpg ----------------------------------------------------------------
if "asyncpg" not in sys.modules:
    _mock_module("asyncpg")

# ---- pydantic_settings -------------------------------------------------------
# Already installed, but guard in case env differs

# ---- torch / torchvision / onnxruntime --------------------------------------
# These are large and may not be present in the CI environment
if "torch" not in sys.modules:
    torch_mock = _mock_module("torch")
    torch_mock.cuda.is_available.return_value = False
    _mock_module("torch.nn")
    _mock_module("torch.utils")
    _mock_module("torch.utils.data")
    _mock_module("torchvision")
    _mock_module("torchvision.transforms")
    _mock_module("onnxruntime")

# ---- ML service modules that do filesystem/db operations at import time -----
# We mock the service singletons that __init__.py imports, so the heavy
# modules are never executed in test context.

_mock_module("app.services.database", db_service=MagicMock(), DatabaseService=MagicMock())
_mock_module("app.services.storage", storage_service=MagicMock(), StorageService=MagicMock())
_mock_module(
    "app.services.trainer",
    trainer_service=MagicMock(),
    TrainerService=MagicMock(),
    TrainingConfig=MagicMock(),
    TrainingProgress=MagicMock(),
)
_mock_module(
    "app.services.similarity",
    similarity_service=MagicMock(),
    SimilarityService=MagicMock(),
)
