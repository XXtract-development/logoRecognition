# Story 9.6: CI-smoke-test van de volledige pipeline

Status: ready-for-dev

## Story

As a ontwikkelaar,
I want een snelle end-to-end smoke-test van de trainingspipeline in CI,
so that schema-wijzigingen en pipeline-breuken bij elke commit zichtbaar worden vóór ze een echte trainingsronde raken.

## Acceptance Criteria

1. **Volledige flow op mini-dataset (NFR4):** Given een mini-dataset in de repository (tientallen PNG's, 2-3 klassen, inclusief mini-holdout-set), When de CI-smoke-test draait in een geïsoleerde test-omgeving (in-memory/test-infrastructuur), Then doorloopt de test de volledige flow: incorporate → batch (incl. synthetische aanvulling indien tekort) → train (2-3 epochs) → holdout-evaluatie → gate-vergelijking.

2. **Snelheid (NFR4):** Given de mini-dataset en minimale epochs, When de smoke-test draait, Then voltooit deze binnen enkele minuten (doel: < 5 minuten) zodat elke CI-run praktisch blijft.

3. **Contractbreuken zichtbaar (NFR4):** Given een schema-wijziging, API-respons-wijziging of metrics-formaat-wijziging, When de smoke-test draait, Then faalt de test bij contractbreuken (verkeerd metrics-formaat, ontbrekende velden, API-fout) zodat regressies direct zichtbaar zijn.

4. **Configureerbare gate-drempel getest (FR56):** Given een afwijkende gate-drempel geconfigureerd in de smoke-test-omgeving (bijv. `GATE_MIN_IMPROVEMENT=0.02`), When de smoke-test de gate-stap uitvoert op de mini-holdout, Then reflecteert het gate-verdict de geconfigureerde drempel — dit bewijst dat de drempel-parameter daadwerkelijk in gebruik is (geen hardcoded 0.0).

## Tasks / Subtasks

- [ ] Task 1: Mini-dataset aanleggen (AC: 1, 2)
  - [ ] Locatie: `tests/fixtures/mini-dataset/` (repository-root)
  - [ ] Omvang: **30-60 PNG-afbeeldingen**, verdeeld over 2-3 klassen (bijv. `klas-A/`, `klas-B/`, `klas-C/`), elk 128×128 pixels (klein — snel te laden)
  - [ ] Mini-holdout: 5-10 PNG's per klasse in `tests/fixtures/mini-dataset/holdout/`
  - [ ] **Geen LFS nodig** bij kleine PNG's (< 100KB per afbeelding, totaal < 5MB) — expliciet bevestigen via `git lfs track`-check; als de totale dataset < 5MB is, GEEN LFS
  - [ ] Labels als JSON in `tests/fixtures/mini-dataset/labels.json`: `[{ "filename": "klas-A/img001.png", "label": "klas-A", "bbox": {...} }]`
  - [ ] Voeg `.gitignore`-uitzondering toe zodat PNG-fixtures niet genegeerd worden (als root `.gitignore` een `*.png`-regel heeft)

- [ ] Task 2: Smoke-test script `tests/smoke/pipeline-smoke-test.ts` (AC: 1, 2, 3, 4)
  - [ ] Test-omgeving: in-process of aparte test-compose (`docker-compose.test.yml` of vitest-omgeving met SQLite + in-memory Redis)
  - [ ] Flow-stappen in de test:
    1. Incorporate: laad mini-dataset fixtures als feedback-records in de test-DB
    2. Batch: roep `buildTrainingFlow`-batch-stap aan; verifieer dat de batch de fixtures bevat + eventueel synthetische aanvulling
    3. Train: roep ML-service aan met `epochs=2` en mini-dataset (mockable voor pure unit-modus, echte call voor integration-modus)
    4. Holdout-evaluatie: roep `POST /ml/evaluate/holdout` aan met mini-holdout; verifieer metrics-formaat `{ accuracy, holdoutHash, ... }`
    5. Gate: roep `evaluateGate` aan met `GATE_MIN_IMPROVEMENT=0.02` (afwijkende drempel); verifieer dat het verdict de drempel reflecteert
  - [ ] Contractcheck: elke stap asserteert op de response-shape (vereiste velden aanwezig); generieke `response !== null` checks zijn onvoldoende
  - [ ] Timeout: test-timeout 300s (5 minuten maximum)

- [ ] Task 3: CI-integratie (AC: 2, 3)
  - [ ] Voeg een `smoke-test`-job toe aan `.github/workflows/ci-cd.yml`: draait alleen op `push` naar `main`/`acc`, niet op elke PR (snelheid vs. coverage trade-off — gedocumenteerd)
  - [ ] Of: voeg de smoke-test toe als optioneel CI-step met `continue-on-error: false` zodat failures de build blokkeren
  - [ ] Job gebruikt `docker-compose.test.yml` of dezelfde `docker-compose.full.yml` met `TEST_MODE=1`

- [ ] Task 4: Documentatie (AC: 1, 4)
  - [ ] Voeg een commentaar toe bovenaan `pipeline-smoke-test.ts`: beschrijft de mini-dataset-locatie, opzet, en hoe de test lokaal te draaien is
  - [ ] Documenteer de gate-drempel-test als bewuste keuze (bevinding #15 uit de adversarial review: configureerbare drempel vereist een test met afwijkende waarde)

## Dev Notes

### ⚠️ Epic 8-learnings (verplicht toepassen)

1. **Dubbele schema-bron:** als de smoke-test een eigen test-DB opzet, moet die schema synchroon zijn met Prisma-migraties én init.sql.
2. **Deploy-realiteit:** `prisma generate` vereist gegenereerde client; smoke-test-omgeving moet dit via `pnpm --filter api exec prisma generate` doen.
3. **Monorepo-worktrees:** smoke-test draait vanuit de root; gebruik absolute paden naar fixtures.
4. **ML-service blijft REST:** de smoke-test roept de ML-service via HTTP aan — niet via directe Python-imports.

### Story 9.6 is zelf de test-deliverable

Deze story heeft bewust **geen ATDD-checklist** (gedocumenteerd in atdd-checklist-epic-8-9.md: "Bewust uitgesloten: Story 9.6 — die story ís zelf een test-deliverable; ATDD ervoor zou circulair zijn"). De ATDD-gate uit andere stories (9.1-9.5) dekt de individuele pipeline-componenten; deze story voegt de end-to-end smoke-test toe als CI-vangnet.

### Mini-dataset opslag — expliciete afspraken

- Doelgrootte: 30-60 afbeeldingen, elk 64-128px, PNG, zwart-wit of eenvoudig kleur — totaal < 5MB
- Geen LFS: bij < 5MB totaal is `git lfs` overhead en onnodige complexiteit. Verifieer met `du -sh tests/fixtures/mini-dataset/` na aanmaak.
- Als de dataset toch groeit boven 10MB (bijv. door realistische PNG's): LFS of externe opslag overwegen en documenteren

### Configureerbare gate-drempel aantonen

De smoke-test moet de drempel instellen op een waarde die verschilt van de default (bijv. `GATE_MIN_IMPROVEMENT=0.02` of hoger). Dan:
- Als de trained challenger minder dan 2% beter is dan een seed-champion: test verwacht `passed=false`
- Als de challenger meer dan 2% beter is: test verwacht `passed=true`
Dit bewijst dat de drempel-parameter doorgegeven wordt en niet wordt genegeerd (bevinding #15).

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `tests/fixtures/` | bestaande fixture-locatie-conventie |
| `.github/workflows/ci-cd.yml` | bestaand CI-patroon — uitbreidingspunt |
| `apps/api/src/services/pipeline/quality-gate.ts` (9.4) | gate-functie om te testen |
| `apps/api/src/services/pipeline/training-flow.ts` (9.3) | flow-stappen om te doorlopen |

### References

- [Source: epics.md#Story 9.6] · [Source: atdd-checklist-epic-8-9.md — Story 9.6 bewust uitgesloten] · [Source: review-epic-9-voorwerk.md bevinding #15] · [Source: PRD NFR-A4]

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
