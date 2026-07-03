"""Green-phase tests voor Story 13.5 — gold-set-regressie-eval-service.

Dekt de pure eval-logica (geen DB, geen embedding-model): precisie@drempel op
bekende ECHT/VALS-uitkomsten, UNION-gedrag (een schaduw-kandidaat verandert een
match), self-match-guard (query-crop met dezelfde contentHash/cropPath als een
referentie → uitgesloten, geen 100%-zelfmatch), nulmeting-modus (zonder
schaduwset) en klasse-scoping. Geen enkele write.

CI-conventie: ``pytest tests/unit/``. AC→test-mapping in
``_bmad-output/implementation-artifacts/review-13-5.md``.
"""

import importlib.util
from pathlib import Path

import numpy as np

# Laad ``regression_eval.py`` rechtstreeks via bestandspad zodat de test niet het
# zware ``app.services.__init__`` (asyncpg/torch) hoeft te importeren — een pure-
# functie-unit-test mag de service-laag-imports overslaan (zelfde patroon als
# test_outlier_service.py).
_PATH = Path(__file__).resolve().parents[2] / "app" / "services" / "regression_eval.py"
_spec = importlib.util.spec_from_file_location("regression_eval_under_test", _PATH)
re_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(re_service)


def _vec(*xs):
    return np.array(xs, dtype=np.float32)


# ---------------------------------------------------------------------------
# best_similarity — klasse-scoping + self-match-guard
# ---------------------------------------------------------------------------


def test_best_similarity_only_same_class():
    """Alleen entries van dezelfde t3777Code tellen mee."""
    query = {"embedding": _vec(1.0, 0.0), "t3777Code": "A"}
    entries = [
        {"embedding": _vec(1.0, 0.0), "t3777Code": "B"},  # andere klasse → genegeerd
        {"embedding": _vec(0.0, 1.0), "t3777Code": "A"},  # zelfde klasse, orthogonaal
    ]
    # Enige klasse-A-entry is orthogonaal → similariteit 0.
    assert abs(re_service.best_similarity(query, entries) - 0.0) < 1e-5


def test_best_similarity_self_match_excluded_by_content_hash():
    """Een entry met dezelfde inhouds-hash wordt uitgesloten (leave-one-out)."""
    query = {"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "H1"}
    entries = [
        {"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "H1"},  # zelfmatch
    ]
    # De enige entry is de query zelf → uitgesloten → geen match (-1.0).
    assert re_service.best_similarity(query, entries) == -1.0


def test_best_similarity_self_match_excluded_by_crop_path():
    """Referentie zonder inhouds-hash: guard valt terug op identiek cropPath."""
    query = {"embedding": _vec(1.0, 0.0), "t3777Code": "A", "cropPath": "crops/x.jpg"}
    entries = [
        {"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": None, "cropPath": "crops/x.jpg"},
    ]
    assert re_service.best_similarity(query, entries) == -1.0


def test_best_similarity_different_hash_matches():
    """Verschillende inhoud met dezelfde richting → volledige match (1.0)."""
    query = {"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "H1"}
    entries = [
        {"embedding": _vec(2.0, 0.0), "t3777Code": "A", "contentHash": "H2"},
    ]
    assert abs(re_service.best_similarity(query, entries) - 1.0) < 1e-5


# ---------------------------------------------------------------------------
# evaluate_sample — ECHT/VALS-correctheid
# ---------------------------------------------------------------------------


def test_sample_echt_recognized_is_correct():
    query = {"id": "q1", "embedding": _vec(1.0, 0.0), "t3777Code": "A", "label": "ECHT", "contentHash": "Q"}
    entries = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "R"}]
    out = re_service.evaluate_sample(query, entries, threshold=0.9)
    assert out["recognized"] is True
    assert out["correct"] is True


def test_sample_vals_recognized_is_incorrect():
    """VALS die tóch matcht (vals-positief) is FOUT."""
    query = {"id": "q2", "embedding": _vec(1.0, 0.0), "t3777Code": "A", "label": "VALS", "contentHash": "Q"}
    entries = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "R"}]
    out = re_service.evaluate_sample(query, entries, threshold=0.9)
    assert out["recognized"] is True
    assert out["correct"] is False


def test_sample_vals_not_recognized_is_correct():
    query = {"id": "q3", "embedding": _vec(1.0, 0.0), "t3777Code": "A", "label": "VALS", "contentHash": "Q"}
    entries = [{"embedding": _vec(0.0, 1.0), "t3777Code": "A", "contentHash": "R"}]  # orthogonaal
    out = re_service.evaluate_sample(query, entries, threshold=0.9)
    assert out["recognized"] is False
    assert out["correct"] is True


# ---------------------------------------------------------------------------
# evaluate_precision — aggregatie + UNION + nulmeting
# ---------------------------------------------------------------------------


def test_precision_known_outcomes():
    """Twee ECHT (één matcht, één niet) → precisie 0,5."""
    queries = [
        {"id": "q1", "embedding": _vec(1.0, 0.0), "t3777Code": "A", "label": "ECHT", "contentHash": "Q1"},
        {"id": "q2", "embedding": _vec(0.0, 1.0), "t3777Code": "A", "label": "ECHT", "contentHash": "Q2"},
    ]
    references = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "R"}]
    result = re_service.evaluate_precision(queries, references, None, threshold=0.9)
    assert result["total"] == 2
    assert result["correct"] == 1
    assert abs(result["precision"] - 0.5) < 1e-6
    assert result["perClass"]["A"]["total"] == 2


def test_shadow_union_flips_a_match():
    """Een schaduw-kandidaat maakt een tot dan onherkende ECHT-query herkend."""
    queries = [
        {"id": "q1", "embedding": _vec(0.0, 1.0), "t3777Code": "A", "label": "ECHT", "contentHash": "Q1"},
    ]
    references = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "R"}]  # orthogonaal → geen match
    # Zonder schaduw: onherkend → fout.
    base = re_service.evaluate_precision(queries, references, None, threshold=0.9)
    assert base["correct"] == 0
    # Mét schaduw (zelfde richting als query): herkend → correct.
    shadow = [{"embedding": _vec(0.0, 2.0), "t3777Code": "A", "contentHash": "S"}]
    with_shadow = re_service.evaluate_precision(queries, references, shadow, threshold=0.9)
    assert with_shadow["correct"] == 1


def test_nulmeting_mode_ignores_shadow():
    """Nulmeting-modus (shadow_entries=None) meet uitsluitend tegen de actieve set."""
    queries = [
        {"id": "q1", "embedding": _vec(0.0, 1.0), "t3777Code": "A", "label": "ECHT", "contentHash": "Q1"},
    ]
    references = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "R"}]
    # None = nulmeting: schaduw wordt genegeerd, dus q1 blijft onherkend → 0 correct.
    result = re_service.evaluate_precision(queries, references, None, threshold=0.9)
    assert result["correct"] == 0


def test_self_match_guard_prevents_100pct():
    """Query-crop identiek aan een referentie (zelfde contentHash) → geen zelfmatch."""
    queries = [
        {"id": "q1", "embedding": _vec(1.0, 0.0), "t3777Code": "A", "label": "ECHT", "contentHash": "SAME"},
    ]
    # De 'referentie' is exact dezelfde crop (zelfde hash) → moet uitgesloten worden.
    references = [{"embedding": _vec(1.0, 0.0), "t3777Code": "A", "contentHash": "SAME"}]
    result = re_service.evaluate_precision(queries, references, None, threshold=0.9)
    # Geen andere referentie → onherkend → ECHT niet herkend → 0 correct (geen
    # kunstmatige 100%-zelfmatch).
    assert result["correct"] == 0


def test_empty_gold_set():
    result = re_service.evaluate_precision([], [], None, threshold=0.9)
    assert result["total"] == 0
    assert result["precision"] == 0.0
