---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: step-05-gate-decision
lastSaved: '2026-10-02'
---
# Traceability — review reference categories
Uitvoering: officiële bmad-testarch-trace createworkflow, sequentieel op verzoek van root. Vereisten uit SPEC/story, kennis uit tea-index (priorities/risk/probability/test-quality/selective-testing); tests gezocht/gecatalogiseerd als API/client, unit en transactionele mocks. Matrix is naar Phase1tempfile geschreven en voor de deterministische Phase2beslissing opnieuw gelezen. Auth en UI wijzigen niet.

## Beslissing
Scoped offline contractgate: **PASS**. Alle8afgebakende criteria hebben uitgevoerde tests (P0 6/6, P1 2/2). Dit percentage betreft deze criteria, niet algemene codecoverage of de hele applicatie.
Algemene releasegereedheid: **CONCERNS** door brede bestaande suitebeperkingen en niet uitgevoerde live PostgreSQL-/container-/deploymentvalidatie. **ACC APPLY: NO-GO zonder afzonderlijk akkoord op exact v2manifest**; geen externe acties uitgevoerd. Lokaal reviewbaar resultaat: GO.

## Matrix
| ID | Prioriteit | Vereiste | Tests / evidence | Status |
|---|---|---|---|---|
| CAP-1 | P0 | Juiste categorie en GS1veld voor nieuwe referenties | apps/api/src/__tests__/services/reference-registration-contract.test.ts; apps/ml-service/tests/unit/test_reference_registration_contract.py: client sends resolved fields; new_reference_persists_canonical_pair; endpoint_accepts_explicit_resolved_fields | FULL offline |
| CAP-2 | P0 | Ongeldige codes/metadata weigeren vóór werk | reference-registration-contract.test.ts; test_reference_registration_contract.py: rejects invalid code; invalid_endpoint_returns_422_without_work; invalid_direct_code_does_no_work; direct_metadata_rejected_before_work | FULL offline |
| CAP-3 | P0 | Metadata-only herregistratie; gemengde codes geen writes | test_reference_registration_contract.py: same_path_repairs_only_metadata_without_embedding; conflicting_same_path_never_writes | FULL offline |
| REG-1 | P0 | Bestaande guards en samepathrace/atomiciteit | test_reference_registration_contract.py: new_near_duplicate_guard_remains; duplicate_variant_guard_remains; load_failure_keeps_soft_failure; inflight_same_path_returns_no_work; same_path_concurrency_and_embedding_failure_rollback | FULL offline |
| DATA-1 | P0 | Exact targetgebonden manifest en bronvoorwaarden | apps/api/src/__tests__/scripts/backfill-reference-manifest.test.ts: validates exact version2 scope; wrong target; row race; validates invalid before DB; approved metadata only; idempotent retry | FULL offline |
| DATA-2 | P0 | Preview zonder DB, per-IDresultaten en geen scopegroei | backfill-reference-manifest.test.ts: valid file preview zeroPrisma; actual CLI wrapper zeroPrisma; CLI incomplete outcomes; generation and ambiguity evidence; unscoped apply rejection | FULL offline |
| WRITER-1 | P1 | Seed/live schrijfpaden gebruiken hetzelfde contract | seed-reference-category.test.ts; test_reference_registration_contract.py: seed writes canonical metadata; missing-artwork existing rows/concurrent relabel; live_writer_persists_pair; live_writer_invalid_code_before_work | FULL offline |
| PACKAGE-1 | P1 | Werkelijk gedeelde bron in TS/MLruntime en devmount | field-type-mapping.test.ts; reference-registration-contract.test.ts; test_reference_registration_contract.py: all JSON entries; shared_mapping_python_parity_and_runtime_file; runtime_layout_resolves_bundled_mapping; development_mount_uses_canonical_mapping; emitted TS JS+JSON probe | FULL offline |

## Uitgevoerd bewijs
- Duurzame API63tests/5files geslaagd; exacte319-v2preview tijdelijk als extra test:64/6files, nul Prisma-aanroepen. Tijdelijke rootgebonden test verwijderd; generieke zero-DB CLIpreviewtest is duurzaam.
- Python49contracttests geslaagd; samepathconcurrentie/rollback via transactionele offline mocks, geen live PGtestclaim.
- Volledige APItypecheck na laatste TSedit geslaagd; gecompileerde resolver laadt uitgegeven JSON. Python geïsoleerde runtimelayout, canonieke datapariteit, Docker COPY en read-only Composemount gecontroleerd. Geen imagebuild/deploy uitgevoerd.
- Pinned Ruff0.1.14/Black24.1.1/isort5.13.2 voor3gewijzigde appbestanden geslaagd; diffcheck geslaagd.
- RED vóór eerste implementatie: API18failed/10passed; Python39failed/3passed. Reviewrepair RED API16failed/12passed, Python3failed/46passed; wrapper RED1failed/28passed vóór cleanupfix. Evidence in ATDDchecklist en reference-contractlogs.

## Beperkingen en baseline
Brede APIrun was niet volledig groen: eerste1171pass/1timeout; tweede1174pass/3bestaande 5stimeouts plus bewust nieuw seedRED vóór reparatie. Geïsoleerde orchestration17/17pass; geen algemene full-suiteGREENclaim.
Brede Python294pass/20fail/2skip; alle20failing testnamen opnieuw op oorspronkelijke HEAD05c62a70c6707c6c7abce8a7c8dcddd3b02629e8 onder dezelfde schone invocation gereproduceerd (49pass). Exact:4missing imagehash,2missing torch,2bestaande Nutri-Avisionassertions,12cwd-relatieve bronpaden. Baselinecomparisonlog en investigationcompanion bewaren bewijs. Geen ongerelateerde codefixes.
Bestaande ML CI pytestfallback maskeert failures en is expliciet uitgesteld; CI-groen is geen acceptatiebewijs. Historische embeddingloze referenties niet hersteld; nieuwe transacties voorkomen toekomstige partials.

## Exacte lokale verificatiecommando’s
Vanuit apps/api:
```bash
../../node_modules/.bin/vitest run src/__tests__/services/reference-registration-contract.test.ts src/__tests__/services/field-type-mapping.test.ts src/__tests__/scripts/backfill-reference-manifest.test.ts src/__tests__/scripts/backfill-reference-logo-field-type.test.ts src/__tests__/scripts/seed-reference-category.test.ts --maxWorkers=1 --minWorkers=1
../../node_modules/.bin/tsc --noEmit
```
Vanuit /tmp:
```bash
env -i PATH=/usr/bin:/bin PYTHONPATH=/Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service /tmp/logo-reference-contract-venv/bin/python -m pytest /Users/frisovanweelden/Documents/projects/logoRecognition/apps/ml-service/tests/unit/test_reference_registration_contract.py -q
```
Runtime-/formattingcommando’s staan volledig in atdd-checklist-review-reference-categories.md.

## Veilige herstelinterface (niet uitgevoerd)
Manifest version2 bevat environment, exact database/serverAddress/serverPort en dezelfde goedgekeurde319items. Alleen field_type/gs1_field schrijfbaar; UUIDs uniek; actuele code/active/beide bronwaarden onder rijlock gecontroleerd. Targetafwijking stopt vóór updates. Reeds correcte rijen zijn no-write; races krijgen per-IDreden en incomplete CLIstatus1.
Lokaal parserpreview vanaf repositoryroot:
```bash
./node_modules/.bin/ts-node --project apps/api/tsconfig.json apps/api/src/scripts/backfill-reference-logo-field-type.ts --manifest _bmad-output/implementation-artifacts/investigations/acc-logo-categorie-indeling-20261002-uitvoermanifest-v2.json
```
Na afzonderlijke externe toestemming, met expliciet gecontroleerde DATABASE_URL en hetzelfde onveranderde manifest, wordt uitsluitend --apply toegevoegd. Geen recompute/scopegroei. Root controleert vóór uitvoering livebronvoorwaarden en manifesthash79c6db273a11876d40d6c485b1d5861e4e835a6f7528726b16eeb04c1748dc15. Geen ACCwrite, push, PR, merge of restart uitgevoerd.

## Cleanup
Ownbaselinearchive, temporarymodels/compiledprobes, Phase1temporarymatrix and stagedreviewdiff removed after durable evidence capture. Temporaryrootmanifesttest removed. Offlinevenv retained at /tmp/logo-reference-contract-venv for reproducible parentverification. All childwriters/reviewers completed; no own test/build process remains. Rootinvestigations/manifests and unrelated .gitignore preserved.
