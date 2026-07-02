"""AC4-guard (Story 13.1) — geen inhouds-hash-implementatie in Node.

De canonieke inhouds-hash heeft exact één implementatie: ml-service
``/ml/phash``. De MLClient-methode ``computePhash`` is de enige route waarlangs
Node een crop-inhouds-hash verkrijgt; de API berekent nooit zelf een
inhouds-hash en er is geen Node-fallback (AD-14).

Deze guard scant ``apps/api/src`` op een verboden lokale crop-inhouds-hash. De
bestaande ``sha256Hash`` op ``ArtworkImport`` hasht bron-bestandsbytes — een
ándere sleutel (AD-12) — en is expliciet toegestaan.
"""

import re
from pathlib import Path

import pytest

# apps/ml-service/tests/unit/ → repo-root = parents[4]
_REPO_ROOT = Path(__file__).resolve().parents[4]
_API_SRC = _REPO_ROOT / "apps" / "api" / "src"


def test_13_1_ac4_geen_node_crop_content_hash_implementatie():
    """Geen Node-code hasht een crop-pixelbuffer tot een inhouds-hash.

    We zoeken op ``content_hash``/``contentHash`` als lokale berekening. De enige
    toegestane verschijning is de MLClient-DELEGATIE naar ``/ml/phash`` (die roept
    de service aan, berekent niets zelf).
    """
    if not _API_SRC.is_dir():  # defensief — skip als de api-tree elders staat
        pytest.skip(f"apps/api/src niet gevonden op {_API_SRC}")

    offenders: list[str] = []
    for ts_file in _API_SRC.rglob("*.ts"):
        text = ts_file.read_text(encoding="utf-8", errors="ignore")
        if not re.search(r"content[_-]?hash", text, re.IGNORECASE):
            continue
        # ml-client.ts mag content_hash noemen: het is de delegatie naar /ml/phash.
        if ts_file.name == "ml-client.ts" and "/ml/phash" in text:
            continue
        offenders.append(str(ts_file.relative_to(_REPO_ROOT)))

    assert not offenders, (
        "Node bevat een verboden crop-inhouds-hash (AD-14). De enige route is "
        f"MLClient.computePhash → /ml/phash. Overtreders: {offenders}"
    )


def test_13_1_ac4_mlclient_computephash_delegeert_naar_ml_phash():
    """De enige Node-route bestaat en delegeert naar het ml-service-endpoint."""
    ml_client = _API_SRC / "services" / "ml-client.ts"
    if not ml_client.is_file():
        pytest.skip(f"ml-client.ts niet gevonden op {ml_client}")
    text = ml_client.read_text(encoding="utf-8")
    assert "computePhash" in text
    assert "/ml/phash" in text
