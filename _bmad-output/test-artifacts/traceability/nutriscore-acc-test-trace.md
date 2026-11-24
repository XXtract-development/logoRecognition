---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-11-24'
spec: _bmad-output/specs/spec-nutriscore-acc-test/SPEC.md
review_fix_spec: _bmad-output/implementation-artifacts/spec-nutriscore-acc-review-fixes.md
review: _bmad-output/implementation-artifacts/reviews/nutriscore-acc-review-20261124.md
meting: _bmad-output/implementation-artifacts/investigations/nutriscore-acc-meting-20261124.md
gate: PASS
---

# Trace SPEC-nutriscore-acc-test

## Uitkomst

- **Gate: PASS** voor de bouw en het bewijs. P0-dekking is 100% (5/5), P1 92% (12/13) en het totaal 94% (17/18).
- **Meetuitkomst: de eis wordt NIET gehaald.** Geen enkele Nutri-Score-letter haalt ≥ 80% gevonden én ≤ 10% vals. De valse meldingen komen uit de `embedding`-route. De kleur-lezer is precies maar vindt 16–33%. Details staan in het [meetverslag](../../implementation-artifacts/investigations/nutriscore-acc-meting-20261124.md).

> [!warning] Procesafwijking in de eerste ronde (PR #32/#33)
> In de eerste ronde zijn ATDD, bouw en trace met de hand gedaan, niet via de skills. De spec-review deed de werker zelf, zonder aparte agent. De gate PASS van toen was daarom niet onafhankelijk getoetst (review A10). Deze gate komt uit de tweede ronde:
> - een echte `bmad-review` met vier lenzen;
> - `bmad-testarch-atdd`, eerst rood: API 6 rood en Python 14 rood;
> - `bmad-build`, met een eigen reviewronde over drie lagen;
> - deze trace, via `bmad-testarch-trace`.

## Matrix

| ID | Eis | Prio | Test (niveau) | Dekking |
|---|---|---|---|---|
| CAP-1 | Sleutel naast de lijst, (a)–(f) | P0 | `logo-scans-keys-extra.test.ts` (a)–(f) (unit); `logo-scans-auth.test.ts` (route, 401-paden) | FULL |
| CAP-2a | Sleutel nergens in uitvoer | P0 | `test_main_never_shows_the_key`: `main()` met een nep die de sleutel terugkaatst in de 202-body en in de running-/foutbody; stdout, stderr en `--out` doorzocht (unit) | FULL |
| R1 | EXTRA-naam botst met de hoofdlijst | P0 | "reusing a main-list name"; "route: a clashing EXTRA key gets 401" (unit + route) | FULL |
| R2 | Dubbele sleutel (over de lijsten, binnen EXTRA, binnen de hoofdlijst) | P0 | "the same key in both lists"; "a key repeated inside EXTRA"; "a key repeated inside the main list" | FULL |
| R11 | Geen redirects | P0 | `test_no_redirects_so_the_key_never_reaches_another_host` (lokale HTTP-server) | FULL |
| CAP-2b–e | Hervatten, geen-antwoord, `rescan=true`, alleen `<id>.png` | P1 | `test_runner_sends_only_truth_ids_with_rescan_and_resumes`, `test_failed_timeout_and_http_error_are_no_answer_not_no_nutriscore`, `test_done_scan_with_failed_logoresults_is_no_answer`, `test_done_without_usable_result_is_not_saved_and_is_resent` | FULL |
| CAP-3 | Uitslag per letter, methoden, voorbehoud | P1 | `test_score_fixed_set`, `test_no_reports_is_not_applicable_never_zero`, `test_requirement_met`, `test_report_concrete_rows_and_split_counts`, `test_report_has_methods_versions_reencoded_split_and_caveat`, `test_report_warns_on_mixed_reference_version_and_states_the_caveats`, `test_main_counts_reencoded_label_under_herschaald` | FULL |
| CAP-4 | Uitrol en bewijs op ACC | P1 | Handmatige meting, zie hieronder | PARTIAL (n8n-acc afgeleid; bekende beperking in de SPEC) |
| R3 | Lege EXTRA / komma aan het eind is stil | P1 | "whitespace-only EXTRA and a trailing comma are silent" | FULL |
| R4 | Label `LOGO_PIPELINE_KEYS_EXTRA` | P1 | "a broken EXTRA entry is warned under the EXTRA label" | FULL |
| R5 | Eén waarschuwing per configuratie | P1 | "the same configuration warns once" | FULL |
| R6 | `LOGO_KEY` kaal | P1 | `test_logo_key_is_used_raw_even_with_colons`, `test_keychain_value_is_parsed_as_name_colon_key` | FULL |
| R7 | Corrupt bestand / atomair schrijven / interne fout | P1 | `test_corrupt_answer_file_is_resent_not_fatal`, `test_answer_write_is_atomic`, `test_unexpected_error_for_one_label_does_not_stop_the_pool` | FULL |
| R8 | Beeld ontbreekt | P1 | `test_missing_image_is_no_answer_and_recorded` | FULL |
| R9 | JPEG 4:4:4, past of wordt niet verstuurd | P1 | `test_shrink_keeps_full_chroma_and_fits`, `test_shrink_gives_up_when_even_low_quality_is_too_big`, `test_unshrinkable_image_is_no_answer_and_recorded`, `test_shrink_big_image_to_jpeg_under_limit` | FULL |
| R10 | 0/429/502/503/504 herhalen, `Retry-After`, 401/403 stopt | P1 | `test_post_retry_is_answered_after_transient_status`, `test_retry_after_header_is_honoured`, `test_persistent_failure_is_no_answer_with_status_recorded_never_the_key`, `test_poll_503_is_retried_within_deadline`, `test_refused_key_stops_the_whole_run` | FULL |
| R12 | `detections`/`t3777_code` null | P1 | `test_extract_letters_is_null_safe_and_filters_methods` | FULL |
| R13 | Waarheid: alleen bevestigd, genormaliseerd | P1 | `test_load_truth_keeps_confirmed_and_normalises`, `test_load_truth_requires_status_and_accepts_one_string_value`, `test_load_truth_reports_drops_only_when_asked` | FULL |

R1–R13 zijn de matrixrijen uit de review-fix-spec. Dekkingssignalen:
- Elk endpoint dat de eisen noemen, heeft een test.
- Authenticatie heeft afwijzingspaden: 401 bij een onbekende, botsende of lege sleutel.
- Foutpaden zijn gedekt: time-out, 3xx, 4xx/5xx, corrupt bestand en ontbrekend beeld.

## CAP-4: bewijs op ACC

| Criterium | Meting | Uitkomst |
|---|---|---|
| `/health` 200 na uitrol | Coolify-deployment van f841824 finished; `/health` 200 (24-11) | PASS |
| `LOGO_PIPELINE_KEYS` ongewijzigd | Coolify `updated_at` 2026-10-11, vóór en na gelijk | PASS |
| Nieuwe sleutel: 202 → `done` | scanId `102991bb-f04d-43e1-a0b3-b3ce51f8c504` (etiket `8719333010489-08718989999476-528`): status `done`, `modelVersion` `acc-20261006`. Alle 336 opgeslagen antwoorden zijn `done` | PASS |
| Zonder sleutel 401 | `GET /api/v1/pipeline/logo-scans/102991bb-…` zonder header gaf 401 (opnieuw gemeten 24-11) | PASS |
| `method` gemeld | `nutriscore-a2` 74, `nutriscore-head` 3, `embedding` 200 | PASS |
| `n8n-acc` werkt nog | Niet getoetst, afgeleid uit de ongewijzigde lijst | PARTIAL |

## Gate

- Regels: P0 100% (vereist 100%), P1 92% (doel 90%), totaal 94% (minimum 80%). Uitkomst **PASS**.
- Open gat: CAP-4 `n8n-acc`, alleen af te dekken met een echte aanroep van de n8n-koppeling. Dat valt buiten deze spec, want de flow blijft inactief.
- Lokale testruns (24-11), in de worktree van `fix/nutriscore-acc-review`:
  - `npx vitest run src/__tests__/routes/logo-scans-`: 147/147 (9 bestanden);
  - `npx tsc --noEmit`: 0 fouten;
  - `python3 -m pytest scripts/test_nutriscore_measure.py -q`: 37/37.
- Het meetscript-pytest draait nu ook in CI (python-job in `ci-cd.yml`).
