---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-04c-aggregate', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-07-02'
inputDocuments:
  - _bmad-output/implementation-artifacts/13-1 t/m 17-2 (19 story-files, vliegwiel)
  - _bmad-output/test-artifacts/atdd-checklist-epic-8-9.md (conventie-referentie)
story_id: epics-13-18
tdd_phase: red
executionMode: sequential
---

# ATDD Checklist — Epics 13–18 (Vliegwiel: promotielus, gold-set-hygiëne, dashboard, mismatch-intelligentie, bootstrap, GLN-dekking)

**TDD-fase:** 🔴 RED — alle tests beschrijven verwacht gedrag en draaien nog niet: vitest-scaffolds als `it.todo` (in `.atdd.test.ts(x)`-bestanden), pytest-scaffolds met `@pytest.mark.skip`. Geen enkele scaffold importeert nog-niet-bestaande modules — de bestaande CI/testruns blijven groen.

## Teststrategie

| Scenario | Story | Niveau | Prioriteit |
|----------|-------|--------|-----------|
| Canonieke inhouds-hash `/ml/phash` (determinisme, gepinde dep, geen Node-route) | 13.1 | pytest (contract) | P0 |
| Nominatie bij dubbele bevestiging: vlaggen, fail-closed, idempotentie, gemiste-nominatie-events | 13.2 | Unit (API-service) | P0 |
| Gold-set-opslag: migratie, idempotente seed met dry-run, replacedById-resolutie | 13.3 | Unit (API-service) | P0 |
| Promotielus: batching/claim, cap, tweetraps-dedup incl. kloon-gat, outlier, gateResults, crash-recovery, watchdog | 13.4 | Unit (API-service) | P0 |
| Kwaliteitspoort: schaduw-eval, nulmetingen, versie-guard, atomaire promotie, quarantaine, fail-closed | 13.5 | Unit (API-service) + pytest (contract) | P0 |
| Rollback, baseline-invalidatie, persistente pauze, K=2-stilstand, hard-negative-export | 13.6 | Unit (API-service) | P0 |
| Gold-set-aanwas uit reviewbeslissingen (accept/reject-redenen, undo, correctie, herbruikbare route) | 14.1 | Unit (API-service) | P0 |
| Samenstellingsbewaking (omvang/verdeling/scheefgroei, on-read) | 14.2 | Unit (API-service) | P1 |
| Wekelijkse outlier-audit: job + persistentie (API) en rekenkundig contract `/ml/outlier-audit` (pytest) | 14.3 | Unit (API-service) + pytest (contract) | P1 |
| Vliegwiel-sectie: theming-scoping, route/navigatie, lege staat, i18n | 15.1 | Component (web) | P1 |
| Overzichtsscherm: overview-panelen, statussemantiek, rollback-UI, outlier-beslisflow, KPI's, refresh | 15.2 | Component (web) | P0 |
| Quarantaine-afhandeling: bewijspaneel, beslissingen, 409, batch afsluiten, auto-advance | 15.3 | Component (web) | P0 |
| Drempelbeheer + pauzebediening: endpoints/logging (API) en modals/banners (web) | 15.4 | API-routes + Component | P0 |
| Mismatch-registratie: typeset, drempel-randgevallen, vlag-scoping, aggregatie/trend | 16.1 | Unit (API-service) | P0 |
| Structureel-drempel → bootstrap-werkvoorraad, herleidbaarheid naar GTINs | 16.2 | Unit (API-service) | P0 |
| Datakwaliteitsrapport per GLN + harde NFR-6-bronrestrictie-guard | 16.3 | Unit (API-service) | P0 |
| Controle-cohort: stabiele definitie, maandelijkse rerun-job, trend, pauze/isolatie | 16.4 | Unit (API-service) | P1 |
| Bootstrap-run: declaratie-guard, zaad-nooit-referentie, budget, vlag/pauze (API) + zaad-zoek-contract (pytest) | 17.1 | Unit (API-service) + pytest (contract) | P0 |
| Bootstrap-wachtrij: seed, sortering/beheer-endpoint, nieuw-geactiveerde-klasse, paneel-UI | 17.2 | Unit (API-service) + Component (web) | P1 |

**Bewust uitgesloten:** Story 18.1 en 18.2 — zie "Gemotiveerde skips" onderaan.

## Gegenereerde scaffold-bestanden (RED)

| Bestand | Niveau | Tests | Dekt | Status |
|---------|--------|-------|------|--------|
| `apps/api/src/__tests__/services/flywheel-nomination.atdd.test.ts` | Unit (Vitest) | 8 todo | 13.2 | ✅ laadt, 8 todo |
| `apps/api/src/__tests__/services/flywheel-goldset-store.atdd.test.ts` | Unit (Vitest) | 3 todo | 13.3 | ✅ laadt, 3 todo |
| `apps/api/src/__tests__/services/flywheel-promotion-loop.atdd.test.ts` | Unit (Vitest) | 9 todo | 13.4 | ✅ laadt, 9 todo |
| `apps/api/src/__tests__/services/flywheel-quality-gate.atdd.test.ts` | Unit (Vitest) | 7 todo | 13.5 | ✅ laadt, 7 todo |
| `apps/api/src/__tests__/services/flywheel-rollback-pause.atdd.test.ts` | Unit (Vitest) | 6 todo | 13.6 | ✅ laadt, 6 todo |
| `apps/api/src/__tests__/services/flywheel-goldset-hygiene.atdd.test.ts` | Unit (Vitest) | 13 todo | 14.1, 14.2, 14.3-API | ✅ laadt, 13 todo |
| `apps/api/src/__tests__/services/flywheel-mismatch.atdd.test.ts` | Unit (Vitest) | 7 todo | 16.1, 16.2 | ✅ laadt, 7 todo |
| `apps/api/src/__tests__/services/flywheel-data-quality-report.atdd.test.ts` | Unit (Vitest) | 2 todo | 16.3 | ✅ laadt, 2 todo |
| `apps/api/src/__tests__/services/flywheel-control-cohort.atdd.test.ts` | Unit (Vitest) | 4 todo | 16.4 | ✅ laadt, 4 todo |
| `apps/api/src/__tests__/services/flywheel-bootstrap.atdd.test.ts` | Unit (Vitest) | 10 todo | 17.1-API, 17.2 | ✅ laadt, 10 todo |
| `apps/api/src/__tests__/api/flywheel.routes.atdd.test.ts` | API-routes (Vitest) | 4 todo | 15.4-API | ✅ laadt, 4 todo |
| `apps/web/src/pages/FlywheelPage.atdd.test.tsx` | Component (Vitest) | 16 todo | 15.1, 15.2, 15.4-UI, 17.2-web | ✅ laadt, 16 todo |
| `apps/web/src/pages/FlywheelBatchDetailPage.atdd.test.tsx` | Component (Vitest) | 4 todo | 15.3 | ✅ laadt, 4 todo |
| `apps/ml-service/tests/test_flywheel_atdd.py` | pytest (contract) | 13 skip | 13.1, 13.5, 14.3, 17.1 | ✅ py_compile OK, 13 collected/skipped |

**Totaal: 14 bestanden · 106 acceptatietests** (93 vitest-todo's + 13 pytest-skips).

Verificatie (2026-07-02): `apps/api npx vitest run <11 atdd-bestanden>` → 73 todo, 0 failed · `apps/web npx vitest run <2 atdd-bestanden>` → 20 todo, 0 failed · `apps/ml-service python3 -m py_compile` OK + `pytest tests/test_flywheel_atdd.py` → 13 skipped, exit 0. De ml-service-CI (`ci-cd.yml`, stap "Run tests": `pytest tests/`) verzamelt de nieuwe map en slaagt (alles geskipt).

## AC-dekking per story

Testnamen verkort — de volledige, sprekende namen staan in de scaffold-bestanden. Status overal: **red-phase (todo)** resp. **red-phase (skip)**.

### Epic 13 — Promotielus met kwaliteitspoort

**13.1 — Canonieke inhouds-hash-service** → `apps/ml-service/tests/test_flywheel_atdd.py` (pytest, skip)

| AC | Testnaam |
|----|----------|
| 1 | `test_13_1_ac1_phash_endpoint_retourneert_canonieke_hash_en_phash` |
| 2 | `test_13_1_ac2_phash_is_deterministisch` |
| 3 | `test_13_1_ac3_imagehash_gepind_en_code_onder_app` |
| 4 | `test_13_1_ac4_geen_node_implementatie_van_de_inhouds_hash` |

**13.2 — Automatische nominatie bij dubbele bevestiging** → `flywheel-nomination.atdd.test.ts` (unit)

| AC | Testnaam (it.todo) |
|----|--------------------|
| 1 | AC1: migratie reference_candidates/candidate_embeddings/hard_negatives met down-script (ARCH-2) |
| 2 | AC2: dubbele bevestiging ≥ drempel ⇒ exact één kandidaat-rij; 8.6-registratie ongewijzigd; fail-closed |
| 3 | AC3: nominatie volledig in het BullMQ-worker-pad, nooit request-pad |
| 4 | AC4: kruischeck-herkomst achter dubbele vlag, verdict-response ongewijzigd |
| 5 | AC5: default-uit bewezen (verse deploy nomineert niets) |
| 6 | AC6: review-herkomst absorbeert 12.3-pad; herkomst-enum crosscheck/kruischeck/bootstrap/review |
| 7 | AC7: gemiste-nominatie-events met reden, teller via overview-API |
| 8 | AC8: veiligheidsregels + idempotentie (hard-negative-blokkade, status-reset, geen duplicaten) |

**13.3 — Gold-set naar beheerde opslag** → `flywheel-goldset-store.atdd.test.ts` (unit)

| AC | Testnaam (it.todo) |
|----|--------------------|
| 1 | AC1: migratie gold_set_records (immutable, replacedById self-FK) met down-script |
| 2 | AC2: idempotente seed-import met --dry-run (91+74 bronrecords, tweede run voegt niets toe) |
| 3 | AC3: vervanging via replacedById; actieve set = replacedById IS NULL, geresolved in apps/api |

**13.4 — Nachtelijke promotielus, batching en guardrails** → `flywheel-promotion-loop.atdd.test.ts` (unit)

| AC | Testnaam (it.todo) |
|----|--------------------|
| 1 | AC1: migratie promotion_batches + FK op promotionBatchId met down-script |
| 2 | AC2: repeatable job via upsertJobScheduler bundelt en claimt via conditional update naar in_batch |
| 3 | AC3: per-klasse cap (default 10), gecureerde referenties buiten schot, herbruikbare cap-check |
| 4 | AC4: tweetraps-dedup (pHash + cosine ≥ 0,97) incl. kloon-gat tegen inactieve referenties |
| 5 | AC5: zachte afwijzing = rejected met reden, GEEN hard-negative; hernominatie via status-reset |
| 6 | AC6: per-batch outlier-guardrail via /ml/outlier-audit, zachte afwijzing |
| 7 | AC7: gateResults per poort-fase, regressie-fase "nog niet uitgevoerd" |
| 8 | AC8: crash-recovery — pending-batches eerst, idempotent per fase, nooit vast in in_batch |
| 9 | AC9: watchdog — tijdstempel laatste succesvolle run + notificatie na >26 uur |

**13.5 — Kwaliteitspoort** → `flywheel-quality-gate.atdd.test.ts` (unit) + pytest-contract

| AC | Testnaam | Type |
|----|----------|------|
| 1 | AC1: poort roept /ml/regression-eval met union + gold-set-payload, zonder mutatie, met self-match-guard | unit |
| 1 | `test_13_5_ac1_regression_eval_meet_union_zonder_mutatie` + `test_13_5_ac1_self_match_guard_leave_one_out` | pytest |
| 2 | AC2: eenmalige nulmeting vóór de allereerste batch (SM-1-anker) · pytest: `test_13_5_ac2_nulmeting_zonder_schaduwset` | unit + pytest |
| 3 | AC3: verse nulmeting bij verouderde baseline | unit |
| 4 | AC4: versie-guard — ongelijke modelversie terug naar candidate + her-embed-taak | unit |
| 5 | AC5: atomaire promotie binnen tolerantie (sample-gebaseerd <200, daarna 1pp), embedding-kopie, historie | unit |
| 6 | AC6: quarantaine boven tolerantie met delta + notificatie | unit |
| 7 | AC7: fail-closed quarantaine met reden systeem-fout | unit |

**13.6 — Rollback, persistente pauze en automatische stilstand** → `flywheel-rollback-pause.atdd.test.ts` (unit)

| AC | Testnaam (it.todo) |
|----|--------------------|
| 1 | AC1: migratie system_settings met down-script |
| 2 | AC2: batch-rollback — soft-delete, status rolled_back, baseline-terugval, herleidbaar evidence |
| 3 | AC3: baseline-invalidatie bij elke buiten-promotie-mutatie |
| 4 | AC4: automatische stilstand K=2, persistent, notificatie met aanleiding |
| 5 | AC5: pauze-scope — vliegwiel stopt, live-detectie/registratie/audit/reads lopen door |
| 6 | AC6: hard-negative-export uitsluitend menselijke categorie |

### Epic 14 — Gold-set-hygiëne en bibliotheekbewaking

**14.1 — Gold-set-aanwas uit reviewbeslissingen** → `flywheel-goldset-hygiene.atdd.test.ts` (unit) — AC1 t/m AC5, één todo per AC (accept/reject-redenen, hard-negative-route, undo via replacedById, correctie, herbruikbare service-functie). **AC6 niet gescaffold** (menselijke afstemtaak — zie skips).

**14.2 — Samenstellingsbewaking** → zelfde bestand (unit) — AC1 t/m AC4 (samenstellingsdata, scheefgroei-signaal, dekking-loze-promotie-markering, on-read-berekening).

**14.3 — Wekelijkse outlier-audit** → gesplitst:

| AC | Testnaam | Bestand | Type |
|----|----------|---------|------|
| 1 | AC1: migratie outlier_findings met down-script | flywheel-goldset-hygiene.atdd.test.ts | unit |
| 2 | `test_14_3_ac2_outlier_audit_markeert_percentiel_en_absolute_grens` + `..._dekt_ook_handmatig_gecureerde_referenties` + `..._deactiveert_zelf_niets` | test_flywheel_atdd.py | pytest |
| 3 | AC3: persistentie in outlier_findings (status open), herstart-bestendig, run-tijdstempel | flywheel-goldset-hygiene.atdd.test.ts | unit |
| 4 | AC4: beslisacties via outliers/:id/decision (15.2-flow); deze story alleen signalering | flywheel-goldset-hygiene.atdd.test.ts | unit |
| 5 | AC5: audit draait door bij pauze (read-only) | flywheel-goldset-hygiene.atdd.test.ts | unit |

### Epic 15 — Vliegwiel-dashboard

**15.1** → `FlywheelPage.atdd.test.tsx` (component) — AC1 (theming-scoping antd 5 rond /flywheel), AC2 (nav-item + badge, route, lege staat, i18n).

**15.2** → `FlywheelPage.atdd.test.tsx` (component) — AC1 t/m AC8, één todo per AC (overview-panelen, statussemantiek, batch-doorklik, samenstellingspaneel, rollback-UI met redenveld, outlier-beslisflow, KPI's incl. gemiste nominaties + laatste run, refresh zonder polling).

**15.3** → `FlywheelBatchDetailPage.atdd.test.tsx` (component) — AC1 t/m AC4 (bewijspaneel + toetsenbord, afkeuren ⇒ rejected + hard-negative, vrijgeven ⇒ nieuwe batch + 409, batch afsluiten + auto-advance).

**15.4** → gesplitst API/UI:

| AC | Testnaam | Bestand | Type |
|----|----------|---------|------|
| 1 | AC1: migratie threshold_changes met down-script | api/flywheel.routes.atdd.test.ts | API-routes |
| 2 | AC2: thresholds-endpoint — verplichte reden, logging, historie, per-methode | api/flywheel.routes.atdd.test.ts | API-routes |
| 2 | AC2-UI: per-methode-weergave + verplicht redenveld + historie | FlywheelPage.atdd.test.tsx | component |
| 3 | AC3: pause-endpoint persistent (system_settings) | api/flywheel.routes.atdd.test.ts | API-routes |
| 3 | AC3-UI: bevestigingsmodal + amber pauzebanner | FlywheelPage.atdd.test.tsx | component |
| 4 | AC4: hervat-logging met gebruiker/tijdstempel + quarantaine-waarschuwing | api/flywheel.routes.atdd.test.ts | API-routes |
| 4 | AC4-UI: hervat-modal toont waarschuwing zonder te blokkeren | FlywheelPage.atdd.test.tsx | component |
| 5 | AC5: rode stilstand-banner met aanleiding + link naar batches | FlywheelPage.atdd.test.tsx | component |

### Epic 16 — Mismatch-intelligentie

**16.1** → `flywheel-mismatch.atdd.test.ts` (unit) — AC1 (migratie mismatch_events), AC2 (volledige typeset + drempel-randgevallen), AC3 (vlag-scoping, 4 combinaties, kruischeck-uit schrijft niets), AC5 (aggregatie ratio/trend per code/GLN). **AC4 niet gescaffold** (afstemmoment/documentatietaak — zie skips).

**16.2** → zelfde bestand (unit) — AC1 (migratie bootstrap_queue), AC2 (N/M-drempellogica-randgevallen + idempotentie), AC3 (herleidbaarheid naar GTINs).

**16.3** → `flywheel-data-quality-report.atdd.test.ts` (unit) — AC1 (rapport per GLN + CSV-export + leeg pad), AC2 (NFR-6-guard: reference-logos/-paden aantoonbaar geweerd).

**16.4** → `flywheel-control-cohort.atdd.test.ts` (unit) — AC1 (stabiele cohort-definitie in system_settings + dry-run-seed), AC2 (maandelijkse rerun-job + ratio-randgevallen), AC3 (trend per run, stabiele GTIN-lijst), AC4 (pauze-scope + isolatie).

### Epic 17 — Bootstrap

**17.1** → gesplitst API/pytest:

| AC | Testnaam | Bestand | Type |
|----|----------|---------|------|
| 1 | AC1: declaratie-verificatie-guard + drempel-randgevallen + nominatie via 13.2-service | flywheel-bootstrap.atdd.test.ts | unit |
| 2 | AC2: zaad wordt nooit referentie (NFR-6) | flywheel-bootstrap.atdd.test.ts | unit |
| 3 | AC3: lege run ⇒ status leeg + lastRunAt, statusovergangen | flywheel-bootstrap.atdd.test.ts | unit |
| 4 | AC4: run-budget + restant in wachtrij | flywheel-bootstrap.atdd.test.ts | unit |
| 5 | AC5: pauze-scope | flywheel-bootstrap.atdd.test.ts | unit |
| 6 | AC6: hoofdvlag-scope | flywheel-bootstrap.atdd.test.ts | unit |
| testplan | `test_17_1_zaad_zoek_matches_boven_en_onder_drempel` · `..._faalt_zacht_per_gtin` · `test_17_1_zaadbeeld_verschijnt_nooit_in_output_crops` | test_flywheel_atdd.py | pytest |

**17.2** → `flywheel-bootstrap.atdd.test.ts` (unit): AC1 (seed op declaratiefrequentie, idempotent, status-guard), AC2 (GET/POST/PATCH bootstrap-queue, sortering, mutatie-logging), AC3 (nieuw-geactiveerde-klasse-bepaling), AC4 (doorklik naar 15.3-bewijs) · plus `FlywheelPage.atdd.test.tsx` (component): paneel-rendering/sortering/lege staat en doorklik + i18n.

## Gemotiveerde skips

- **Story 18.1 (GLN-backfill via batch-export) — géén ATDD.** De story begint met een blokkerende go/no-go (governance-akkoord voor een eenmalige read-only prod-MongoDB-export, ARCH-8); zonder akkoord stopt de story. Het deliverable is een eenmalig, handmatig gestart, idempotent exportscript — geen blijvend systeemgedrag om een acceptatietest tegen te scaffolden. De `--dry-run`-verificatie zit als expliciete taak ín de story zelf; de paneel-lege-staat is gescaffold (15.2); de coverage-berekening zelf wordt gedekt door de story-eigen vitest-eisen in de green phase.
- **Story 18.2 (restant-route via mediaserver-re-import) — géén ATDD.** Geen nieuw mechanisme: een gedoseerd, handmatig driver-script bovenop het bewezen en al geteste 8-3O-re-importpad (dedup + GLN-backfill in `artwork-pipeline.ts`, gedekt door bestaande tests). Alleen de aansturing (batch-grootte/pauze-envvars, restant-selectie, redenen bijwerken) is nieuw en eenmalig; borging gebeurt via de dry-run en de hermeting op het dashboard.
- **14.1 AC6** — story-taak "afstemming met de reviewstation-gebruikers": menselijke procesafspraak, niet zinvol als geautomatiseerde test; borging via het Dev Agent Record van de story.
- **16.1 AC4** — afstemmoment n8n/12.8 + documentatie in de 12.8-API-docs: proces-/documentatietaak; het onderliggende technisch gedrag (vlag-scoping, verdict ongewijzigd) is wél gescaffold in 16.1-AC3.
- **"Tests."-secties in de 16.x/17.x-story-files** zijn testplan-aanwijzingen, geen ACs; hun randgevallen zijn verwerkt in de todo-namen van de bijbehorende AC-tests (en voor 17.1 als drie aparte pytest-contracttests). E2E: conform die secties is er níets aan de stable-subset-gate toegevoegd.

## Vervolg (green phase)

- Developer ontskipt per story de bijbehorende todo's/skips en implementeert tegen het beschreven contract; migratie-ACs (13.2/13.3/13.4/13.6/14.3/15.4/16.1/16.2/18.1 — gln_backfill_reason) altijd eerst ter goedkeuring aan de gebruiker voorleggen (ARCH-2, teamregel).
- Beoogde modulestructuur uit de scaffolds: `apps/api/src/services/flywheel/` (nomination, gold-set, promotion-queue, guardrails, quality-gate, rollback, mismatch-events, control-cohort, bootstrap-run/-queue), `apps/api/src/api/v1/flywheel.ts`, `apps/ml-service/app/services/phash.py` + `app/api/flywheel.py` (prefix `/ml`), `apps/web/src/pages/FlywheelPage.tsx` + `FlywheelBatchDetailPage.tsx`.
- Epic 18 just-in-time: 18.1 pas na governance-akkoord; 18.2 pas na 18.1.
