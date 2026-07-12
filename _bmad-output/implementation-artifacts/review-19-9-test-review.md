# Test Review — Story 19.9 (fase 2, nearest-reference-ranking / conditie C)

reviewed_commit: (na TR-fixes, zie Change Log in het story-bestand)
scope: apps/ml-service/tests/unit/test_bootstrap_search_service.py (8 nieuwe tests),
apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts (5 nieuwe tests),
+ 3 licht aangepaste testbestanden (default `referenceLogo.findMany`-mock, geen nieuwe cases).

> Uitgevoerd met graceful degradation: dit project heeft geen `_bmad/tea/testarch/tea-index.csv`
> (geen volledige BMAD-tea-installatie) — de review is direct op testkwaliteit-principes
> uitgevoerd (assert-diepte, valse-positieven-check, over-mocking, edge-case-dekking) i.p.v.
> via de kennisbank-fragmenten van de skill.

## Bevindingen

| # | Severity | Omschrijving | Actie |
|---|---|---|---|
| 1 | MEDIUM | Dekkingslacune: geen enkele test bewees dat het gids-drempel-pad als AANVULLING/FALLBACK blijft werken zodra conditie C actief is (AC1's expliciete OR-semantiek: `sim >= threshold OR ref_sim >= ranking_threshold`). Een implementatie die dit per ongeluk als AND codeert, of het gids-pad volledig vervangt zodra ≥k refs aanwezig zijn, zou door de bestaande tests niet zijn gevangen. | Test toegevoegd: `test_c_gids_pad_blijft_fallback_ook_met_conditie_c_actief` — een regio dicht bij het zaad (ver van de refs) matcht nog steeds via de klassieke gids-cosine, óók met `ranking_active=True`. |
| 2 | LOW | Dode fixture-data: `FAR_TAG`-regio-embedding was gedefinieerd in `_REGION_EMB_C` maar nergens gebruikt — geen test bewees dat een regio die BEIDE signalen mist niet matcht. | Test toegevoegd: `test_c_regio_matcht_niet_als_beide_signalen_onder_de_drempel_blijven`. |

## Wat al goed was (geen actie)

- **Geen valse positieven:** elke conditie-C-test gebruikt een eigen, van de bestaande `patched`-fixture losstaande fixture (`patched_c`) met een key-bewuste fake-decode — de asserts zijn specifiek genoeg (`ranking_active`, `real_refs_used`, `ranking_cosine`-waarden) om te falen op zowel het oude gedrag (geen `real_ref_paths`-parameter bestond) als op een verkeerd geïmplementeerde conditie C (bv. AND i.p.v. OR — nu gedekt, zie bevinding 1).
- **Geen overgemockte tests:** de fixture mockt alleen de zware I/O-collaborators (cv2, model_manager, storage) — de daadwerkelijke `search_with_seed`-controlestroom (gate-check, conditie-C-berekening, NFR-6-guard, per-ref-soft-fail) draait ECHT, niet gestubd.
- **api-vitest-contract-tests** (`flywheel-bootstrap-run.test.ts`) asserten op de daadwerkelijke Prisma-query-argumenten (`where.source.in`, `take`, `orderBy`) en de daadwerkelijke `mlClient.bootstrapSearch`-call-payload — geen "test bewijst niets"-patroon.
- **Regressie-veiligheid van de 3 licht aangepaste bestanden:** de toegevoegde `referenceLogo.findMany.mockResolvedValue([])` is de MINIMALE wijziging om de bestaande suites draaiende te houden (anders `undefined.map()`-crash door de nieuwe query in `bootstrap-run.ts`) — geen bestaande assertie is verzwakt of verwijderd.

## Resultaat na fixes

`apps/ml-service/tests/unit/test_bootstrap_search_service.py`: **20/20 groen** (12 pre-existing + 8 voor Story 19.9, incl. de 2 TR-aanvullingen).
`apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts`: **28/28 groen** (ongewijzigd t.o.v. code-review-fixes).

Verdict: **PASS** (na de 2 toegevoegde tests — geen resterende bevindingen).
