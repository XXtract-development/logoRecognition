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


# Node-hash-BEREKENings-API's die een inhouds-hash zouden PRODUCEREN (AD-14
# verbiedt dit — de hash komt uitsluitend uit ml-service /ml/phash). Kaal
# REFEREREN aan het veld ``contentHash``/``content_hash`` (opslag/lezen door
# 13.2/13.5/13.6) is toegestaan; alleen lokaal BEREKENEN is verboden.
_HASH_COMPUTE_API = re.compile(
    r"createHash\s*\(|crypto\.subtle|\bsha256\s*\(|hashlib|imagehash|"
    r"\.digest\s*\(|new\s+Hash\b",
    re.IGNORECASE,
)
_CONTENT_HASH_REF = re.compile(r"content[_-]?hash", re.IGNORECASE)


def test_13_1_ac4_geen_node_crop_content_hash_implementatie():
    """Geen Node-code BEREKENT zelf een crop-inhouds-hash.

    AD-14: de inhouds-hash heeft één implementatie (ml-service ``/ml/phash``); de
    enige Node-route is de MLClient-DELEGATIE naar dat endpoint. Deze guard flag't
    een bestand alleen als het (a) een inhouds-hash noemt ÉN (b) een lokale
    hash-BEREKENings-API gebruikt — kale veldreferenties (``contentHash``
    opslaan/lezen, zoals 13.2/13.5/13.6 legitiem doen) zijn geen overtreding.
    """
    if not _API_SRC.is_dir():  # defensief — skip als de api-tree elders staat
        pytest.skip(f"apps/api/src niet gevonden op {_API_SRC}")

    offenders: list[str] = []
    for ts_file in _API_SRC.rglob("*.ts"):
        text = ts_file.read_text(encoding="utf-8", errors="ignore")
        if not _CONTENT_HASH_REF.search(text):
            continue
        # ml-client.ts mag content_hash noemen: het is de delegatie naar /ml/phash.
        if ts_file.name == "ml-client.ts" and "/ml/phash" in text:
            continue
        # Alleen een LOKALE hash-berekening is een overtreding; een enkele
        # veldreferentie (zonder hash-API) niet.
        if _HASH_COMPUTE_API.search(text):
            offenders.append(str(ts_file.relative_to(_REPO_ROOT)))

    assert not offenders, (
        "Node BEREKENT een verboden crop-inhouds-hash (AD-14). De enige route is "
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
