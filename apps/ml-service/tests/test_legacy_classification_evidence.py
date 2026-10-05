"""Keep actual classification evidence across matching and response serialization."""
import asyncio
import importlib
import sys
import types
from unittest.mock import AsyncMock

import pytest


@pytest.mark.parametrize('similarity', [0.8, 0.999])
def test_actual_matcher_and_detection_response_preserve_class_similarity(monkeypatch, similarity):
    # Isolate model loading and I/O only; exercise production matching and response classes.
    settings = types.SimpleNamespace(CONFIDENCE_THRESHOLD=0.99, NMS_THRESHOLD=0.5, MAX_DETECTIONS=10)
    monkeypatch.setitem(sys.modules, 'app.core.config', types.SimpleNamespace(settings=settings))
    logger = types.SimpleNamespace(warning=lambda *a, **kw: None)
    monkeypatch.setitem(sys.modules, 'app.core.logging', types.SimpleNamespace(logger=logger))
    database = types.SimpleNamespace(find_similar_logos=AsyncMock(return_value=[{
        'category': 'PackagingMarkedLabelAccreditationCode', 'value': 'GREEN_DOT',
        'logo_id': '00000000-0000-0000-0000-000000000001', 'similarity': similarity,
    }]))
    monkeypatch.setitem(sys.modules, 'app.services.database', types.SimpleNamespace(db_service=database))
    monkeypatch.setitem(sys.modules, 'app.ml.model_manager', types.SimpleNamespace(model_manager=None))
    for name in ('app.ml.detector', 'app.api.detection'):
        # Record both pre-existing and absent module state for full restoration.
        monkeypatch.setitem(sys.modules, name, None)
        del sys.modules[name]
    detector_module = importlib.import_module('app.ml.detector')
    response_module = importlib.import_module('app.api.detection')
    matched = asyncio.run(detector_module.LogoDetector(None)._match_logos([{
        'confidence': 0.995, 'bbox': {'x': 1, 'y': 2, 'width': 3, 'height': 4},
        'embedding': [0.1, 0.2],
    }]))
    wire = response_module.DetectionResponse(request_id='test', detections=matched,
        processing_time_ms=1, image_hash='hash', model_version='actual-response-test').model_dump()
    detection = wire['detections'][0]
    assert detection['confidence'] == 0.995
    assert detection['match_confidence'] == similarity
    assert detection['value'] == 'GREEN_DOT'
    database.find_similar_logos.assert_awaited_once()
    assert (detection['match_confidence'] >= 0.99) is (similarity >= 0.99)
