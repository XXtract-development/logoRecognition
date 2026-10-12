---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-10-12'
workflowType: 'testarch-atdd'
inputDocuments:
  - _bmad-output/specs/spec-stap1-localization-recall/SPEC.md
  - _bmad-output/specs/spec-stap1-localization-recall/ontwerp.md
---

# ATDD-checklist — spec-stap1-localization-recall

**Datum:** 2026-10-12 · **Stack:** backend (pytest ml-service, vitest api) · **Uitvoering:** sequentieel (headless, geen browser; E2E niet van toepassing)

## Acceptatiecriteria → tests

| CAP | criterium (kort) | niveau | test | rood vóór bouw |
|---|---|---|---|---|
| CAP-6 | omgedraaid/samenvallend/leeg-na-knippen vakje overgeslagen en geteld | unit | `test_cap6_reversed_degenerate_or_empty_box_is_skipped_and_counted` (4) | ja |
| CAP-6 | andere ongeldige antwoorden blijven fout | unit | `test_cap6_other_invalid_answers_still_fail` (3) | ja (signatuur) |
| CAP-6 | enkele aanroep faalt niet op één omgedraaid vakje | unit/transport | `test_cap6_reversed_box_in_single_call_does_not_fail_the_scan` | ja |
| CAP-1 | plafond 1..6, één hele-etiket-aanroep, 1–2 → geen tegels | transport | `test_cap1_call_count_respects_ceiling_and_whole_label_first` (6) | ja |
| CAP-1 / besluit PO | standaard 1 (tegels uit), opt-in 6, ongeldige env → 1 | transport | `test_po_default_is_one_call_tiling_opt_in_and_invalid_env_falls_back` | ja (na besluit PO aangepast) |
| CAP-1 | klein etiket → alleen hele-etiket-aanroep | transport | `test_cap1_small_label_gets_only_the_whole_label_call` | ja |
| CAP-1 | tegelvakjes teruggerekend, dubbelen (IoU ≥ 0,7) samengevoegd | transport | `test_cap1_tile_boxes_map_back_and_duplicates_merge` | ja |
| CAP-1 | één falende tegel → lokalisatie faalt zichtbaar | transport | `test_cap1_one_failing_tile_fails_the_whole_localization` | ja |
| CAP-3 | deadline geldt voor de hele visuele fase | transport | `test_cap1_whole_visual_phase_respects_the_deadline` | nee (regressiewacht) |
| CAP-3 | tokens = som usage; ontbrekend → null | transport | `test_cap3_stats_sum_usage_and_missing_usage_is_null` | ja |
| CAP-3 | localize meldt calls/tokens/skipped/dropped/unrefined | API (ASGI) | `test_cap3_localize_reports_calls_tokens_and_skipped` | ja |
| CAP-1 | unie > 64 → afgekapt, geen 503, GHS eerst | API (ASGI) | `test_cap1_union_above_64_is_capped_not_a_503` | ja |
| CAP-1 | verfijning stopt bij de reserve | API (ASGI) | `test_cap1_refinement_stops_when_the_reserve_is_reached` | ja |
| CAP-5 | strikt vangnet < 0,99 claimt geen letter | unit | `test_cap5_strict_vangnet_below_bar_does_not_claim_a_letter` (3) | ja |
| CAP-5 | strikt vangnet ≥ 0,99 claimt wel | unit | `test_cap5_strict_vangnet_at_or_above_bar_still_claims` | nee (regressiewacht) |
| CAP-5 | niet-strikt ongewijzigd | unit | `test_cap5_non_strict_vangnet_is_unchanged` | nee (regressiewacht) |
| CAP-3 | stap1 draagt aanroepen/tokensIn/tokensUit/overgeslagen/weggevallen | API (vitest) | `CAP-3 — geslaagde lokalisatie …` | ja |
| CAP-3 | oude ml-image / onbekende tokens → null | API (vitest) | `CAP-3 — ml-image zonder de nieuwe velden …` | ja |
| CAP-3 | mislukte lokalisatie → nieuwe velden afwezig | API (vitest) | `CAP-3 — mislukte lokalisatie …` | nee (regressiewacht) |

CAP-2 en CAP-4 (eindresultaat, GHS/Nutri-Score op de steekproef) en de tijdsgrenzen van CAP-3 zijn meetcriteria: getoetst met de ACC-proef (`meetplan.md` §Proef), niet met een unittest.

## Bestanden

- `apps/ml-service/tests/test_stap1_localization_recall_atdd.py` — 28 tests: 25 rood, 3 regressiewacht groen.
- `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts` — 3 tests toegevoegd: 2 rood, 1 regressiewacht groen.

## Rood-bewijs (2026-10-12, vóór de bouw)

- `pytest tests/test_stap1_localization_recall_atdd.py` → 25 failed, 3 passed.
- `vitest run src/__tests__/routes/logo-scans-stap1.atdd.test.ts` → 2 failed, 20 passed.

## Bewust veranderende bestaande tests (bouw past ze aan, zie `ontwerp.md`)

`test_artwork_proposals.py` (tuple-return; `[1, 2, 0, 4]` wordt overgeslagen), `test_logo_scan_robustness_atdd.py` en `test_artwork_strict_runtime.py` (mocks geven `(vakjes, stats)`; capaciteit 503 → 200 met `dropped`; exacte `proposals`-dict krijgt nieuwe velden), `logo-scans-stap1.atdd.test.ts` (stap1 met null-velden).

## Aannames

- De lokale suite heeft 52 bestaande fouten op `acc` (o.a. ontbrekende pakketten); vergelijken gebeurt tegen die nulmeting, CI op de PR is de maatstaf.
