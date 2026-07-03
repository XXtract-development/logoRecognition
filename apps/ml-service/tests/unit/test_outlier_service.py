"""Green-phase tests voor Story 13.4 — per-batch outlier-audit-service.

Dekt de pure outlier-logica (geen DB): centroid-berekening op bekende vectoren,
afstands-/grensoordeel (binnen/boven grens), leeg-klasse-randgeval (0/1 referentie
→ gedefinieerd antwoord, geen crash) en het 14.3-percentiel-pad.

CI-conventie: ``pytest tests/unit/``. AC→test-mapping in
``_bmad-output/implementation-artifacts/review-13-4.md``.
"""

import importlib.util
from pathlib import Path

import numpy as np

# De pure outlier-functies hangen alleen van numpy af. We laden ``outlier.py``
# rechtstreeks via zijn bestandspad zodat de test niet het zware
# ``app.services.__init__`` (asyncpg/torch) hoeft te importeren — een puur-
# functie-unit-test mag de service-laag-imports overslaan.
_OUTLIER_PATH = Path(__file__).resolve().parents[2] / "app" / "services" / "outlier.py"
_spec = importlib.util.spec_from_file_location("flywheel_outlier_under_test", _OUTLIER_PATH)
outlier_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(outlier_service)


# ---------------------------------------------------------------------------
# compute_centroid
# ---------------------------------------------------------------------------


def test_centroid_of_known_vectors():
    """Twee tegengestelde eenheidsvectoren op de assen → genormaliseerd gemiddelde."""
    vecs = [np.array([1.0, 0.0], dtype=np.float32), np.array([0.0, 1.0], dtype=np.float32)]
    centroid = outlier_service.compute_centroid(vecs)
    assert centroid is not None
    # Gemiddelde (0.5, 0.5) genormaliseerd → (~0.707, ~0.707).
    assert np.allclose(centroid, np.array([0.70710677, 0.70710677]), atol=1e-4)
    # Het centroid is een eenheidsvector.
    assert abs(float(np.linalg.norm(centroid)) - 1.0) < 1e-5


def test_centroid_ignores_zero_vectors():
    vecs = [np.array([0.0, 0.0], dtype=np.float32), np.array([3.0, 0.0], dtype=np.float32)]
    centroid = outlier_service.compute_centroid(vecs)
    assert centroid is not None
    assert np.allclose(centroid, np.array([1.0, 0.0]), atol=1e-5)


def test_centroid_empty_is_none():
    assert outlier_service.compute_centroid([]) is None
    assert outlier_service.compute_centroid([np.array([0.0, 0.0], dtype=np.float32)]) is None


# ---------------------------------------------------------------------------
# cosine_distance
# ---------------------------------------------------------------------------


def test_cosine_distance_identical_is_zero():
    centroid = np.array([1.0, 0.0], dtype=np.float32)
    assert outlier_service.cosine_distance(np.array([2.0, 0.0]), centroid) == 0.0


def test_cosine_distance_orthogonal_is_one():
    centroid = np.array([1.0, 0.0], dtype=np.float32)
    assert abs(outlier_service.cosine_distance(np.array([0.0, 5.0]), centroid) - 1.0) < 1e-6


def test_cosine_distance_zero_vector_is_max():
    centroid = np.array([1.0, 0.0], dtype=np.float32)
    assert outlier_service.cosine_distance(np.array([0.0, 0.0]), centroid) == 1.0


# ---------------------------------------------------------------------------
# audit_candidates — grens-oordeel (13.4-pad, absolute grens)
# ---------------------------------------------------------------------------


def _refs():
    # Klasse-centroid richt zich op (1, 0).
    return [np.array([1.0, 0.0], dtype=np.float32), np.array([0.98, 0.02], dtype=np.float32)]


def test_audit_flags_outlier_above_threshold():
    candidates = [
        {"id": "near", "embedding": [1.0, 0.0]},      # afstand ~0 → binnen
        {"id": "far", "embedding": [0.0, 1.0]},       # afstand ~1 → outlier
    ]
    result = outlier_service.audit_candidates(candidates, _refs())
    assert result["centroid_size"] == 2
    by_id = {r["id"]: r for r in result["results"]}
    assert by_id["near"]["is_outlier"] is False
    assert by_id["far"]["is_outlier"] is True
    assert by_id["far"]["distance"] > by_id["near"]["distance"]


def test_audit_all_within_threshold_no_outliers():
    candidates = [
        {"id": "a", "embedding": [1.0, 0.0]},
        {"id": "b", "embedding": [0.99, 0.01]},
    ]
    result = outlier_service.audit_candidates(candidates, _refs())
    assert all(r["is_outlier"] is False for r in result["results"])


# ---------------------------------------------------------------------------
# Leeg-klasse-randgeval (0 of 1 referentie) → gedefinieerd antwoord
# ---------------------------------------------------------------------------


def test_empty_class_yields_no_outliers_no_crash():
    candidates = [{"id": "a", "embedding": [0.0, 1.0]}]
    result = outlier_service.audit_candidates(candidates, [])
    assert result["centroid_size"] == 0
    assert result["results"][0]["is_outlier"] is False
    assert result["results"][0]["distance"] == 0.0


def test_single_reference_class_defines_centroid():
    candidates = [{"id": "a", "embedding": [1.0, 0.0]}, {"id": "b", "embedding": [0.0, 1.0]}]
    result = outlier_service.audit_candidates(
        candidates, [np.array([1.0, 0.0], dtype=np.float32)]
    )
    # Eén referentie definieert een centroid (1, 0); 'b' is er ver vandaan.
    assert result["centroid_size"] == 1
    by_id = {r["id"]: r for r in result["results"]}
    assert by_id["a"]["is_outlier"] is False
    assert by_id["b"]["is_outlier"] is True


# ---------------------------------------------------------------------------
# 14.3-pad — percentiel-grens (hergebruik)
# ---------------------------------------------------------------------------


def test_percentile_threshold_path():
    # Vier kandidaten met oplopende afstand; percentiel 0.75 → alleen de verste
    # (strikt boven het 75e-percentiel) is outlier.
    refs = [np.array([1.0, 0.0], dtype=np.float32)]
    candidates = [
        {"id": "c0", "embedding": [1.0, 0.0]},     # dist 0
        {"id": "c1", "embedding": [0.9, 0.1]},     # klein
        {"id": "c2", "embedding": [0.7, 0.7]},     # middel
        {"id": "c3", "embedding": [0.0, 1.0]},     # groot (dist ~1)
    ]
    result = outlier_service.audit_candidates(candidates, refs, percentile=0.75)
    outliers = {r["id"] for r in result["results"] if r["is_outlier"]}
    # De verste kandidaat ligt strikt boven het 75e-percentiel.
    assert "c3" in outliers
    assert "c0" not in outliers
