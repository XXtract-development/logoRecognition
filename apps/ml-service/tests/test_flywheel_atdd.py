"""ATDD red-phase scaffold — ml-service-contracten voor het vliegwiel (Epics 13/14/17).

Alle tests zijn geskipt (red phase): ze beschrijven het verwachte gedrag van de
nieuwe ml-service-endpoints maar draaien nog niet. Geen imports van
nog-niet-bestaande modules (app.services.phash e.d. zijn het te bouwen contract).

Story 13.1 zet hiermee tevens de pytest-conventie voor apps/ml-service/tests/.
Beoogde modules: app/services/phash.py, app/api/flywheel.py (prefix /ml).
Checklist: _bmad-output/test-artifacts/atdd-checklist-epics-13-18.md
"""

import pytest


# ---------------------------------------------------------------------------
# Story 13.1 — Canonieke inhouds-hash-service (/ml/phash)
#
# GEIMPLEMENTEERD (green phase): de echte, dekkende tests staan in
# apps/ml-service/tests/unit/test_phash_service.py,
# .../test_flywheel_phash_endpoint.py en .../test_no_node_content_hash.py.
# De onderstaande 13.1-skips blijven staan als ATDD-scaffold-referentie; zij zijn
# vervangen door bovengenoemde unit-tests en draaien bewust niet.
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="story 13.1 groen — vervangen door tests/unit/ (zie comment)")
def test_13_1_ac1_phash_endpoint_retourneert_canonieke_hash_en_phash():
    """AC1: /ml/phash retourneert voor een crop uit MinIO de canonieke inhouds-hash
    (SHA-256 over de pixel-buffer na gepinde normalisatie) EN de perceptual hash
    (pHash) in een response (AD-14)."""


@pytest.mark.skip(reason="story 13.1 groen — vervangen door tests/unit/ (zie comment)")
def test_13_1_ac2_phash_is_deterministisch():
    """AC2: dezelfde crop levert bij herhaalde aanroep byte-identiek dezelfde
    hashes op (AD-14)."""


@pytest.mark.skip(reason="story 13.1 groen — vervangen door tests/unit/ (zie comment)")
def test_13_1_ac3_imagehash_gepind_en_code_onder_app():
    """AC3: ImageHash==4.3.2 gepind in de requirements; alle nieuwe code onder
    apps/ml-service/app/ (services/phash.py, api/flywheel.py met prefix /ml)
    (ARCH-3, ARCH-7)."""


@pytest.mark.skip(reason="story 13.1 groen — vervangen door tests/unit/ (zie comment)")
def test_13_1_ac4_geen_node_implementatie_van_de_inhouds_hash():
    """AC4: er bestaat geen inhouds-hash-implementatie in Node (apps/api); de
    MLClient-methode naar /ml/phash is de enige route (AD-14). Testvorm: guard
    die de api-codebase scant op hash-berekeningen voor crops."""


# ---------------------------------------------------------------------------
# Story 13.5 — Regressie-eval-contract (/ml/regression-eval)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="ATDD red-phase — story 13.5")
def test_13_5_ac1_regression_eval_meet_union_zonder_mutatie():
    """AC1a: /ml/regression-eval meet precisie@drempel over de volledige actieve
    gold-set (payload) tegen actieve ReferenceEmbedding UNION schaduwset
    (uitsluitend in_batch-kandidaten van deze batch), zonder enige mutatie van
    de actieve referentieset (FR-3, AD-4, AD-5)."""


@pytest.mark.skip(reason="ATDD red-phase — story 13.5")
def test_13_5_ac1_self_match_guard_leave_one_out():
    """AC1b: de eval sluit per query-crop referenties en schaduw-kandidaten met
    dezelfde inhouds-hash uit (self-match-guard, leave-one-out): een gold-set-crop
    die (later) referentie wordt matcht nooit tegen zichzelf (AD-5)."""


@pytest.mark.skip(reason="ATDD red-phase — story 13.5")
def test_13_5_ac2_nulmeting_zonder_schaduwset():
    """AC2 (contract-deel): dezelfde eval draait ook zonder schaduwset
    (nulmeting over uitsluitend de actieve set) en levert een baseline-meting
    met per-sample-uitkomsten voor de sample-gebaseerde tolerantie (AD-5)."""


# ---------------------------------------------------------------------------
# Story 14.3 — Outlier-audit-contract (/ml/outlier-audit)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="ATDD red-phase — story 14.3")
def test_14_3_ac2_outlier_audit_markeert_percentiel_en_absolute_grens():
    """AC2a: /ml/outlier-audit berekent per klasse centroid-afstanden over alle
    actieve referenties en markeert het bovenste 5%-percentiel of referenties
    boven de absolute grens als outlier-melding met vergelijkingsdata
    (FR-8, AD-9)."""


@pytest.mark.skip(reason="ATDD red-phase — story 14.3")
def test_14_3_ac2_audit_dekt_ook_handmatig_gecureerde_referenties():
    """AC2b: de audit dekt ook handmatig gecureerde referenties (FR-8)."""


@pytest.mark.skip(reason="ATDD red-phase — story 14.3")
def test_14_3_ac2_audit_deactiveert_zelf_niets():
    """AC2c: de audit is read-only — hij deactiveert zelf geen enkele referentie
    (FR-8); deactivatie loopt uitsluitend via de menselijke beslissing (15.2)."""


# ---------------------------------------------------------------------------
# Story 17.1 — Zaad-zoek-contract (bootstrap, pytest-deel uit het story-testplan)
# ---------------------------------------------------------------------------


@pytest.mark.skip(reason="ATDD red-phase — story 17.1")
def test_17_1_zaad_zoek_matches_boven_en_onder_drempel():
    """Testplan 17.1 (pytest): het zaad-zoek-endpoint retourneert matches met
    score; kandidaten >= drempel (default 0,93) onderscheiden van vondsten
    eronder (FR-12, AD-9)."""


@pytest.mark.skip(reason="ATDD red-phase — story 17.1")
def test_17_1_zaad_zoek_faalt_zacht_per_gtin():
    """Testplan 17.1 (pytest): lege pagina of onleesbaar beeld faalt zacht per
    GTIN — de run gaat door met de volgende GTIN (FR-12, NFR-3)."""


@pytest.mark.skip(reason="ATDD red-phase — story 17.1")
def test_17_1_zaadbeeld_verschijnt_nooit_in_output_crops():
    """Testplan 17.1 (pytest): het gids-zaadbeeld zelf verschijnt nooit in de
    output-crops van het endpoint (NFR-6)."""
