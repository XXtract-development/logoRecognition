---
spec: "_bmad-output/specs/spec-logo-scan-robustness/SPEC.md"
branch: fix/logo-scan-robustness
baseline: 31ff6273c2b3a8ef5186b99a05f94feaa96d915b
date: 2026-10-12
gate: PASS
---

# Traceability: logo-scanpijplijn robuuster en meetbaar

Gate: **PASS**. Alle 27 toetsbare acceptatiecriteria (AC-1.1 t/m AC-5.2) hebben minstens één test die draait en slaagt; AC-5.3 is aanvaard gedrag zonder contract (bewust geen test). P0: 15/15, P1: 12/12.

> [!note] Testruns (VERIFIED, 12-10-2026, worktree `.claude/worktrees/logo-scan-robustness`)
> - API `npx vitest run`: 112 bestanden, **1607 passed**, 2 skipped, 67 todo, 0 failed (baseline vóór de ATDD-tests: 1587 passed).
> - API `npx tsc --noEmit`: alleen de 2 bestaande Ajv-typefouten in `gs1-block.ts` (r. 52, 56), ook aanwezig op `31ff627`.
> - ml gericht (9 bestanden): **145 passed**. ml volledig: 48 failed + 3 collectiefouten, identiek met de oorspronkelijke ml-code (`python-multipart` ontbreekt in de lokale venv, alleen-lezen `/app`); geen in de geraakte bestanden.
> - `ruff`, `black --check`, `isort --check-only` schoon op de gewijzigde Python-bestanden.

| AC | Prio | Dekking | Tests (bestand: test) |
|---|---|---|---|
| AC-1.1 lege uitsnede → `blank_crop`, geen embedding | P0 | FULL | ml atdd: `test_ac_1_1_blank_crop_is_not_embedded_and_gets_explicit_outcome` (wit, zwart), `test_ac_1_1_blank_check_runs_in_default_runtime_too`, `test_ac_1_1_blank_crop_is_never_persisted` |
| AC-1.2 uitsnede met teken volgt de keten | P0 | FULL | ml atdd: `test_ac_1_2_crop_with_a_mark_follows_the_existing_chain`; alle bestaande strict-tests (fixture met teken) |
| AC-1.3 één gedeelde regel | P1 | FULL | ml atdd: `test_ac_1_3_*` (4); `unit/test_reference_content.py` |
| AC-1.4 fail-open | P1 | FULL | ml atdd: `test_ac_1_4_blank_check_failure_is_fail_open` |
| AC-1.5 `blank_crops` in logevent | P1 | FULL | ml atdd: AC-1.1 en AC-1.2 tellen 1 resp. 0 |
| AC-1.6 blank niet `partial`, detectie bewaard | P0 | FULL | api stap1: "AC-1.6 — een blank_crop-resultaat maakt de scan niet partial"; api gs1-block-robustness: "UNKNOWN met evidence blank_crop" |
| AC-2.1 logregel + 503 met klasse | P0 | FULL | ml atdd: `test_ac_2_1_2_2_visual_failure_is_logged_and_classified` (10 klassen) |
| AC-2.2 mappingtabel | P0 | FULL | idem + `test_ac_2_2_capacity_and_empty_library_classes` |
| AC-2.3 passthrough + log | P1 | FULL | ml atdd: `test_ac_2_3_strict_http_exception_passes_through_but_is_logged` |
| AC-2.4 geen sleutel/beeld in log of antwoord | P0 | FULL | ml atdd: `test_ac_2_4_no_secret_or_image_bytes_in_log_or_response` (Bearer, kale `sk-or-`, base64, > 200 tekens) |
| AC-3.1 `proposals` | P1 | FULL | ml atdd: `test_ac_3_1_*` (3); strict-runtime r. 545 |
| AC-3.2 `stap1` bij succes | P0 | FULL | api stap1: "de rij draagt stap1…", "ml-respons zonder proposals", "lege lokalisatie" |
| AC-3.3 `stap1` bij mislukking | P0 | FULL | api stap1: ml-503 met klasse, `ml_status_<n>`/afgekapt, classify faalt, `unusable_regions`/`malformed_results`, `unexpected_OSError`, wachtrij/lokalisatie/classificatie-timeout, timeout bij lezen |
| AC-3.4 nooit in het antwoord | P0 | FULL | api stap1: Redis-pad, tabelpad, oude rij, mislukte scan |
| AC-4.1 poolversie in de staat | P0 | FULL | api stap1: "done-scan zonder detectieversies" (rij en antwoord) |
| AC-4.2 terugval per detectie | P0 | FULL | api gs1-block-robustness: "embedding-detectie zonder eigen versie", "omzettabel krijgt per detectie de poolversie" |
| AC-4.3 top-level unie / unknown | P1 | FULL | api gs1-block-robustness: unie met GHS, unknown zonder pool; api stap1: database uit |
| AC-4.4 mislukte scan + oude staat | P1 | FULL | api stap1: "mislukte scan draagt de poolversie ook"; gs1-block-robustness: mislukte scan; bestaande flow-tests (staat zonder veld) |
| AC-4.5 versiecontrole kan slagen | P0 | FULL | api gs1-block-robustness: "validFor model + pool gelijk aan de scan" |
| AC-5.1 geen `confidence_threshold` | P0 | FULL | api stap1: "classifyArtwork wordt zonder confidence_threshold aangeroepen" |
| AC-5.2 `twijfelachtig` selectief | P1 | FULL | api gs1-block-robustness: embedding 0,85; GHS `requires_review` |
| AC-5.3 Nutri-Score-gevolg | — | N.v.t. | aanvaard gedrag; geen contract om te pinnen |

## Gaten en restpunten

- **Geen open gaten** voor de criteria.
- **R1 (meting, niet lokaal uit te voeren):** het succes-signaal (herhaling van de steekproef van 12-10 op ACC) vraagt een ACC-run na uitrol; niet uitgevoerd.
- **R2 (uitgesteld, vooraf bestaand):** de `failed`-handler van de worker schrijft geen rij in `logo_scans`; zie `deferred-work.md`.
- **R3 (omgeving):** de lokale ml-venv mist `python-multipart`; 48 bestaande tests falen daardoor lokaal, los van deze wijziging.
