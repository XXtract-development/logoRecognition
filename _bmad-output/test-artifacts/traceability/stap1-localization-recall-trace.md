---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-10-12'
spec: _bmad-output/specs/spec-stap1-localization-recall/SPEC.md
commit: 8750868 (+ standaard-uit-wijziging)
---

# Traceerbaarheid — spec-stap1-localization-recall

Testbestanden: `apps/ml-service/tests/test_stap1_localization_recall_atdd.py` (ML), `apps/api/src/__tests__/routes/logo-scans-stap1.atdd.test.ts` (API), plus de aangepaste bestaande tests `test_artwork_proposals.py`, `test_logo_scan_robustness_atdd.py`, `test_artwork_strict_runtime.py`.

## Criteria met een test (P0 = gedrag dat de spec hard vastlegt, P1 = ondersteunend)

| # | criterium | prio | test(s) | status |
|---|---|---|---|---|
| 1 | CAP-1: heel etiket + tegels, plafond 1..6, 1–2 = alleen heel etiket | P0 | `test_cap1_call_count_respects_ceiling_and_whole_label_first` (6×) | FULL |
| 2 | Besluit PO: standaard 1 aanroep (tegels uit), opt-in 6, ongeldige env → 1 | P0 | `test_po_default_is_one_call_tiling_opt_in_and_invalid_env_falls_back` | FULL |
| 3 | CAP-1: klein etiket → één aanroep | P1 | `test_cap1_small_label_gets_only_the_whole_label_call` | FULL |
| 4 | CAP-1: tegelgeometrie (overlap 15%, rijvolgorde, knippen) | P0 | `test_cap1_tile_windows_tall_label_two_rows_with_overlap`, `test_cap1_tile_windows_wide_label_row_order_and_clipped` | FULL |
| 5 | CAP-1: terugrekenen + ontdubbelen (IoU ≥ 0,7, alleen tussen aanroepen) | P0 | `test_cap1_tile_boxes_map_back_and_duplicates_merge`, `test_cap1_merge_proposals_only_across_calls` | FULL |
| 6 | Constraint foutcontract: één falende aanroep → zichtbare fout | P0 | `test_cap1_one_failing_tile_fails_the_whole_localization`; bestaande foutklassetests in `test_logo_scan_robustness_atdd.py` | FULL |
| 7 | Constraint tijd: visuele fase stopt op resterend − reserve | P0 | `test_cap1_visual_phase_stops_at_remaining_minus_reserve`, `test_cap1_whole_visual_phase_respects_the_deadline` | FULL |
| 8 | Constraint tijd: verfijning stopt bij de reserve | P0 | `test_cap1_refinement_stops_when_the_reserve_is_reached` | FULL |
| 9 | Constraint unie ≤ 64 zonder 503, GHS eerst | P0 | `test_cap1_union_above_64_is_capped_not_a_503`; aangepaste capaciteitstests | FULL |
| 10 | CAP-3: tellingen calls/tokens/skipped/dropped/unrefined uit ml-service | P0 | `test_cap3_localize_reports_calls_tokens_and_skipped`, `test_cap3_stats_sum_usage_and_missing_usage_is_null` | FULL |
| 11 | CAP-3: stap1 bewaart aanroepen/tokens/overgeslagen/weggevallen/onverfijnd; null als onbekend; afwezig bij falen | P0 | API: "geslaagde lokalisatie …", "onbekende tokens: null", "ml-image zonder de nieuwe velden: null", "mislukte lokalisatie …" | FULL |
| 12 | CAP-5: strikt vangnet < 0,99 claimt geen letter; ≥ 0,99 wel; niet-strikt ongewijzigd; expliciete drempel onder A2-vloer | P0 | `test_cap5_*` (6) | FULL |
| 13 | CAP-6: omgedraaid/samenvallend/leeg vakje overgeslagen en geteld; rest blijft; andere fouten blijven fout | P0 | `test_cap6_*` (8) | FULL |

Dekking: P0 12/12 (100%), P1 1/1 (100%), totaal 13/13.

## Meetcriteria (geen unittest; getoetst met de ACC-proef, `meetverslag.md`)

| criterium | toets |
|---|---|
| CAP-1 dekking +10 op niet_aangewezen | fase A (VTF 38 vs 14,5) |
| CAP-2 gevonden ↑, niet-gedeclareerd ≤ 4 per run, mislukte scans ≤ controle | fase C (nieuwe code) |
| CAP-3 tijd ml ≤ 165 s, 0 overschrijdingen, foutpercentage per aanroep | fase C |
| CAP-4 GHS/Nutri-Score dalen niet | fase C |

## Testuitkomst

- ML volledige suite: 52 failed / 731 passed / 14 skipped; de 52 zijn exact de fouten van de nulmeting op `acc` (lokale omgeving). Gerichte suites (stap-1 ATDD + aangepaste bestanden): groen.
- API: `logo-scans-stap1.atdd.test.ts` 23/23; volledige vitest 1555 passed, 2 failed + 5 niet-ladende bestanden door ontbrekende native bcrypt-binding / Prisma-client in de worktree (vooraf aanwezig, niet in gewijzigde code).

## Gatebesluit

**PASS** voor testdekking — P0 100%, P1 100%, totaal 100%.

**Productiepoort CAP-2 met tegels: NIET GEHAALD** (meetverslag §Fase C): N6 11 en 6 per run tegen eis ≤ 4.

**Besluit productowner 12-10-2026:** tegels standaard uit (standaard 1 aanroep, vastgelegd door `test_po_default_is_one_call_tiling_opt_in_and_invalid_env_falls_back`). De uitrolconfiguratie is N1 uit fase C: niet-gedeclareerd 2 per run (≤ 4, controle 3–6), 0 mislukte scans. Gate voor de PR: **PASS**.
