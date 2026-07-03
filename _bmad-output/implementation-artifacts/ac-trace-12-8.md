# AC→test traceability — Story 12.8 (kruischeck-endpoint voor n8n)

10 AC's. AC10 = post-deploy (operationele vervolgtaak, geen geautomatiseerde test — buiten deze run).

| AC | Wat | Code | Dekkende test(s) |
|----|-----|------|------------------|
| AC1 | `POST /artwork/:gtin/verify-declared`, x-api-key-auth, 202 {runId}, run-patroon; geen artwork → `no-artwork` (geen throw) | `api/v1/verify-declared.ts`, `services/pipeline/verify-flow.ts` (`runVerifyDeclared`, `enqueueVerifyDeclared`) | routes: `AC1: POST returns 202 { runId } …`, `rejects an invalid GTIN with 400`, `a JWT … can also start a run`; flow: `AC1: terminates with status no-artwork (no throw) …` |
| AC2 | Declaratie via 8-3D `resolveDeclarations`; `DeclarationReason` 1-op-1 in respons; fail-safe ≠ "geverifieerd, niets gevonden" | `verify-flow.ts` (reason doorgegeven in `declaration.reason`, lege codes → done met lege verdicts) | flow: `AC2: an API fail-safe (empty declaration) → done with reason, empty verdicts`; route poll toont `declaration.reason` in `AC6: GET polls running then done …` |
| AC3 | Alias-/normalisatietabel (aparte module + unit-tests); MSC↔_LABEL + RAINFOREST-varianten; onbekende code → `UNSUPPORTED` (nooit stil overslaan) | `services/t3777-aliases.ts` | `t3777-aliases.test.ts` (12 tests: MSC, Rainforest oud/nieuw, identity/unknown pass-through, trim/uppercase, canonical-dedup, frozen table); flow: `AC4/AC5: … maps CONFIRMED/UNSUPPORTED` (RECYCLABLE → UNSUPPORTED) |
| AC4 | Gerichte detectie via localize→classify UITSLUITEND voor gedeclareerde (gealiaste, actieve) codes; optie 4b codes-filter | `verify-flow.ts` (`detectableCodes`, `mlClient.localizeArtwork({ codes })`); `ml-client.ts` (`codes`); `ml-service app/api/artwork.py` (`filter_templates_by_codes`, `LocalizeRequest.codes`) | flow: `AC4/AC5: localizes only the declared active codes …` (assert `localize … codes:['GREEN_DOT']`); pytest: `test_localize_codes_filter.py` (5 tests, codes-filter puur) |
| AC5 | Verdict per code CONFIRMED/UNCERTAIN/NOT_FOUND/UNSUPPORTED via crosscheck-drempels (hergebruik `getThresholdForMethod`); per verdict confidence/bbox/sourceFile/methode/alias | `verify-flow.ts` (`mapVerdicts`) | flow: `AC4/AC5: … CONFIRMED/UNSUPPORTED`, `AC5: a hit below the method threshold → UNCERTAIN …; missing → NOT_FOUND` |
| AC6 | `GET …/runs/:runId` → status running\|done\|no-artwork\|failed + declaration + verdicts + processingTimeMs; 404 onbekend; aanroeprecept gedocumenteerd | `api/v1/verify-declared.ts` (GET-route + n8n-recept in docblock) | routes: `AC6: GET polls running then done with verdicts`, `surfaces a no-artwork run-state verbatim`, `returns 404 for an unknown runId` |
| AC7 | Schaduwlog naar `recognition_logs`/`recognition_results`; GEEN nieuw model/migratie; run-state in Redis/BullMQ | `verify-flow.ts` (`shadowLogRun`, `writeRunState`/`readRunState` in Redis) | flow: `AC7: writes a recognition_logs row + a result per CONFIRMED verdict`; route 404 (`AC6 … unknown runId`) toont run-state via Redis |
| AC8 | Geen neveneffecten (geen review-items/trainingsdata); job via bestaande BullMQ-pipeline-queue | `verify-flow.ts` (geen `crosscheckDetections`-call; `VERIFY_JOB_NAME` op `artwork-detection`-queue; route in `workers.ts`) | flow: `AC8: never creates review items or training data, and writes no mismatch events with the flag off` |
| AC9 | Tests: unit (alias, verdict-drempel-randgevallen, reason-doorgifte), integratie (route-flow gemockt mlClient+provider: 202→poll→verdicts, no-artwork, api-key-auth 401), pytest (4b) | zie hierboven | `t3777-aliases.test.ts`, `verify-flow.test.ts` (8), `verify-declared.routes.test.ts` (7, incl. `AC9: returns 401 without any auth`), `test_localize_codes_filter.py` (5, skopt zonder ml-deps) |
| AC10 | ACC-bewijs post-deploy | n.v.t. (operationeel) | **Post-deploy vervolgtaak** — geen geautomatiseerde test; deploy-volgorde ghcr → Coolify |

## Vliegwiel-aansluiting (13.2 + 16.1)

- CONFIRMED-verdict → `nominateFromKruischeck` (13.2) + `registerKruischeckMismatchEvents` (16.1),
  achter `FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED` (default uit → geen neveneffecten, AC8/AD-8).
  CANONIEKE declared-codes doorgegeven (review C1-fix). Getest:
  `registers CANONICAL declared codes to the kruischeck mismatch path when the flag is on`
  en `AC8 … writes no mismatch events with the flag off`.

## Samenvatting

- Geautomatiseerde AC's gedekt: 9/9 (AC1–AC9). AC10 = post-deploy (operationeel, geen test).
- apps/api vitest: 714 passed / 2 skipped / 31 todo (was 687 baseline; +27 nieuwe assertions over 3 nieuwe testbestanden).
- ml-service pytest (4b): 5 tests, skopt schoon waar numpy/cv2 ontbreken (dev-box), draait op CI/ACC.
