---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-11-24'
spec: _bmad-output/implementation-artifacts/spec-nutriscore-acc-review-fixes.md
inputDocuments:
  - _bmad-output/implementation-artifacts/spec-nutriscore-acc-review-fixes.md
  - _bmad-output/implementation-artifacts/reviews/nutriscore-acc-review-20261124.md
  - _bmad/tea/config.yaml
  - _bmad/tea/testarch/knowledge/test-quality.md
  - _bmad/tea/testarch/knowledge/test-levels-framework.md
---

# ATDD-checklist: reviewbevindingen Nutri-Score ACC-test

## Voorbereiding (stap 1-2)

- Stack: fullstack (API in TypeScript/vitest, meetscript in Python/pytest). Alleen unit- en route-niveau nodig: geen UI, dus geen opname of Playwright.
- Generatiemodus: AI-generatie op basis van de bron. Uitvoering sequentieel: twee kleine testbestanden, en zo blijft het bij twee agentlagen.
- Toegepaste kennis (test-quality): deterministisch (geen echte slaap: `poll_s=0`, `retry_s=0`), geïsoleerd (`tmp_path` en een unieke configuratie per geval, omdat het inlezen wordt onthouden), expliciete asserts in de test zelf.

## Strategie (stap 3)

| Scenario (spec-matrix / review-ID) | Niveau | Prio | Test |
|---|---|---|---|
| Naambotsing EXTRA ↔ hoofdlijst (A1/E1/V3) | unit + route | P0 | `logo-scans-keys-extra.test.ts` "reusing a main-list name", "route: a clashing EXTRA key gets 401" |
| Dubbele sleutel over de lijsten (A2/E2) | unit | P0 | "the same key in both lists" |
| Lege EXTRA of komma aan het eind is stil (E3) | unit | P1 | "whitespace-only EXTRA" |
| Label `LOGO_PIPELINE_KEYS_EXTRA` (A4/E4) | unit | P1 | "warned under the EXTRA label" |
| Eén waarschuwing per configuratie (A4) | unit | P1 | "warns once" |
| `LOGO_KEY` kaal (A16/E12) | unit | P1 | `test_logo_key_is_used_raw_even_with_colons` (+ keychain-regressie) |
| Null-veilig, filter op methode (E5, A9) | unit | P1 | `test_extract_letters_is_null_safe_and_filters_methods` |
| Waarheid gefilterd en genormaliseerd (E10/E11) | unit | P1 | `test_load_truth_keeps_confirmed_and_normalises` |
| Ruwe resultaten uit run (A7/A9) | unit | P2 | `test_run_returns_raw_results` |
| Corrupt bestand / atomair schrijven (A8/E6/E7) | unit | P0 | `test_corrupt_answer_file_is_resent_not_fatal`, `test_answer_write_is_atomic` |
| Ontbrekend beeld (E8) | unit | P1 | `test_missing_image_is_no_answer_and_recorded` |
| 503 opnieuw proberen, fout vastleggen (A12) | unit | P1 | `test_post_503_is_retried_then_answered`, `test_persistent_503_...`, `test_poll_503_...` |
| JPEG 4:4:4, past of wordt niet verstuurd (A6/A13/E13) | unit | P1 | `test_shrink_keeps_full_chroma_and_fits`, `test_shrink_gives_up_...` |
| Geen redirects (A14) | unit (lokale HTTP-server) | P0 | `test_no_redirects_so_the_key_never_reaches_another_host` |
| Rapport: methoden, versies, herschaald, voorbehoud (A6/A7/A9/V4) | unit | P1 | `test_report_has_methods_versions_reencoded_split_and_caveat` |
| `main()` toont de sleutel nergens (V2) | unit | P0 | `test_main_never_shows_the_key` |

## Rode fase (stap 4): gemeten 24-11-2026

- `cd apps/api && npx vitest run src/__tests__/routes/logo-scans-keys-extra.test.ts` gaf **6 rood**, 6 groen (12). Alle zes rood om de verwachte reden: de bewaking ontbreekt nog.
- `python3 -m pytest scripts/test_nutriscore_measure.py -q` gaf **14 rood**, 11 groen (25). Elke fout ging om ontbrekend gedrag: `TypeError` of `AttributeError` op de nieuwe interface, of een assert op het oude gedrag.
- Groen vóór de bouw, als regressiewacht: de 9 bestaande scripttests, de keychain-ontleding en `test_main_never_shows_the_key` (V2 vult een dekkingsgat; er ontbreekt geen gedrag).

## Validatie (stap 5)

- Voorwaarden in orde, en de testbestanden staan naast de bestaande tests.
- Elk matrixscenario uit de spec heeft een test.
- Geen browsers, geen tijdelijke bestanden buiten `tmp_path`.
- Risico: de chroma-test hangt af van Pillow `JpegImagePlugin.get_sampling`, aanwezig sinds Pillow 9.
- Volgende stap: `bmad-build` stap 3 (bouwen).
