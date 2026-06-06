---
inputDocuments:
  - _bmad-output/implementation-artifacts/8-3R-remediatie-multi-scale-lokalisatie-en-score-herijking.md
  - _bmad-output/implementation-artifacts/review-8-3R-voorwerk.md
  - _bmad-output/test-artifacts/atdd-checklist-epic-8-9.md (conventie-referentie)
story_id: 8-3R
tdd_phase: red
---

# ATDD Checklist — Story 8.3R (multi-scale lokalisatie + score-herijking)

**TDD-fase:** 🔴 RED — alle tests beschrijven verwacht gedrag en zijn geskipt tot 8.3R geïmplementeerd is.

## Teststrategie

| Scenario | AC | Niveau | Prioriteit |
|----------|----|--------|-----------|
| Schaal-ladder dekt gemeten ratio 0,11×–0,22×, AR behouden, ≤ tile | AC1 / besl. 2 | Unit (ML) | P0 |
| Instance op 0,15× van template-grootte gevonden via de flow | AC1 / AC5-i | Unit (ML, echte handler) | P0 |
| Template > tile gedownscaled i.p.v. geskipt (de productie-failure) | AC1 / AC5-ii | Unit (ML, echte handler) | P0 |
| FP-discriminatie: anders patroon ⇒ géén match boven 0.8 (1446-les) | AC2 / AC5-iii | Unit (ML) | P0 |
| Fallback-trigger ontkoppeld (LOCALIZE_DEGENERATE_STD=1.0 < 12) | AC2 / besl. 3 | Unit (contract) | P0 |
| Laag-contrast-maar-reëel template niet stilletjes geweigerd | AC2 / besl. 3+6 | Unit (ML) | P0 |
| Rond RGBA-logo (GREEN_DOT-scenario) gevonden — alpha-neutralisatie | AC2 / besl. 4 | Unit (ML) | P0 |
| Beste-schaal-collapse: precies 1 detectie per geplante instantie | AC1 / besl. 5 | Unit (ML) | P0 |
| storage_path via MinIO (mock), zelfde semantiek als classify | AC3 / AC5-v | Handler (storage-mock) | P0 |
| 4xx bij storage-fetch-failure | AC3 / AC5-v | Handler | P0 |
| image_path uit het contract; tunables erin | AC3 | Contract (Pydantic) | P0 |

**Beschermd (bestaand, blijft ONGEWIJZIGD groen):** de 4 lokalisatie-tests in
`tests/test_artwork_processing.py` (tiling, zwart-template-locatie ±5px via de
degenerate-fallback-tak, wit-op-wit-guard, NMS). Reviewbevinding 1: de
fixture-takken zijn empirisch geverifieerd — zwart template (stddev 0) →
SQDIFF-fallback → score 1.0 op (100,150); wit template → bright-guard-skip.

**Bewust uitgesloten:** time-budget/truncated-gedrag (besl. 7) — timing-tests
zijn flaky in CI; budget wordt geverifieerd in de AC4-hermeting (throughput-log).
AC4 zelf (empirische validatie op ACC) is per definitie geen unit-test: het
done-criterium is het meetrapport + reproduceerbaar script.

## Gegenereerd testbestand (RED)

| Bestand | Niveau | Tests | Status |
|---------|--------|-------|--------|
| `tests/test_localization_multiscale.py` | Unit/Handler (pytest) | 11 | ✅ geverifieerd: 11 skipped, 0 failed (2026-06-06, /tmp/ml-venv) |

**Totaal: 11 acceptatietests** (alle P0). Pyright-meldingen over onbekende
symbolen (`prepare_scaled_templates`, `LOCALIZE_DEGENERATE_STD`, gewijzigde
`LocalizeRequest`) zijn verwacht — red phase: dat ís het te bouwen contract.

## Module-contract voor de developer (uit de tests)

- `app/services/localization.py`: `prepare_scaled_templates(templates, *, scale_min_px, scale_max_px, scale_step, tile_size) -> list[{t3777_code, image, scale, ...}]` (AR behouden, alpha-geneutraliseerd, max-dim ≤ tile) · `LOCALIZE_DEGENERATE_STD = 1.0` (module-constante, env-overridebaar) · `match_templates`-signatuur byte-identiek
- `app/api/artwork.py`: `LocalizeRequest` zónder `image_path`, mét `storage_path` + `tile_size`/`overlap`/`min_score` (+ schaal-params); flow = ladder 1× per request → per-tile matching → beste-schaal-collapse per (code, tegel) → offset-terugrekening → NMS
- DoD: 11 nieuwe tests ontskipt en groen + 4 bestaande ongewijzigd groen + AC4-meetrapport
