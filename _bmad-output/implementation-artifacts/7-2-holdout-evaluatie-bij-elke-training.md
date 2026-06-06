# Story 7.2: Holdout-evaluatie bij elke training

Status: ready-for-dev

## Story

As a datamanager,
I want dat elk getraind model automatisch wordt geëvalueerd op de vaste holdout-set,
so that ik challenger en champion op exact dezelfde data kan vergelijken.

## Acceptance Criteria

1. **Holdout-metrics geregistreerd:** Given een trainingsrun is afgerond, When het model wordt geregistreerd als modelversie, Then zijn accuracy, precision, recall en F1 op de holdout-set berekend en opgeslagen bij de modelversie (onderscheiden van de train/val-metrics) And is vastgelegd welke holdout-versie (aantal items, hash van de id-set) gebruikt is.
2. **Vergelijking op zelfde set:** Given twee modelversies geëvalueerd op dezelfde holdout-set, When ik het bestaande model-comparison endpoint aanroep, Then toont de vergelijking de holdout-metrics naast de bestaande metrics.

## Tasks / Subtasks

- [ ] Task 1: Metrics-opslag in datamodel (AC: 1)
  - [ ] `metrics Json @default("{}")` kolom toevoegen aan `ModelVersion` in `apps/api/prisma/schema.prisma:64-80` (+ init.sql synchroon)
  - [ ] `create_model_version()` in `apps/ml-service/app/services/database.py:148-171` uitbreiden met `metrics`-parameter (JSONB), INSERT aanpassen — let op: huidige implementatie slaat config op als `str(config or {})`; gebruik voor metrics correcte JSON-serialisatie (`json.dumps`)
- [ ] Task 2: Holdout-evaluatie in de trainer (AC: 1)
  - [ ] Na de trainingsloop en vóór registratie (trainer.py: best-model-state rond regels 330-348, registratie 352-372): evalueer best model op `get_holdout_images()` (uit Story 7.1) met DEZELFDE preprocessing als validatie (Resize 224×224 + normalisatie, GEEN augmentatie)
  - [ ] Bereken accuracy/precision/recall/f1 + `holdout_size` + `holdout_hash`
  - [ ] `compute_holdout_hash(ids)`: `"sha256:" + sha256(",".join(sorted(ids)))` — volgorde-onafhankelijk (pytest-contract: zelfde set ⇒ zelfde hash, andere set ⇒ andere hash)
  - [ ] Registreer onder `metrics.holdout = { accuracy, precision, recall, f1, holdout_size, holdout_hash }`
- [ ] Task 3: API-exposure (AC: 1, 2)
  - [ ] `GET /api/v1/models/:modelId` (training.ts regels 255-276): response uitbreiden met `holdoutMetrics` (camelCase: accuracy, precision, recall, f1, holdoutSize, holdoutHash) gemapt uit `metrics.holdout`
  - [ ] `GET /api/v1/feedback/model-comparison` (`apps/api/src/api/v1/feedback.ts:641-702`): per comparison `holdoutMetrics` toevoegen
- [ ] Task 4: Frontend (AC: 1, 2)
  - [ ] Holdout-metrics-paneel op model-detail (models-pagina, `apps/web/src/pages/` + `modelStore`): metrics + "{n} items"-weergave
  - [ ] Vergelijkingstabel: kolom holdout-accuracy + holdout-set-identificatie per rij
  - [ ] **data-testid-contract:** `model-row`, `holdout-metrics-panel`, `model-comparison-table`, `holdout-set-id`
- [ ] Task 5: Tests groen maken (alle ACs)
  - [ ] `.skip` weg: 2 Story 7.2-tests in `holdout.routes.test.ts` (models + model-comparison)
  - [ ] `@pytest.mark.skip` weg: 2 Story 7.2-tests in `tests/test_holdout_trainer.py` (registratie + hash-stabiliteit)
  - [ ] `test.skip` weg: 2 e2e-tests in `holdout-management.spec.ts` (Journey 2)
  - [ ] `mock-data.ts`: modelVersion-mock uitbreiden met `metrics.holdout`

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist Story 7.1** (holdout-vlag + `get_holdout_images()`). Niet parallel starten vóór 7.1 die functies heeft opgeleverd.
- **ATDD-contract is leidend:** `holdoutMetrics.holdoutHash` moet matchen op `/^sha256:/`; response-shape exact volgens `holdout.routes.test.ts`. Pytest verwacht functie `compute_holdout_hash` importeerbaar uit `app.services.trainer` en registratie via `create_model_version(metrics=...)` kwarg.
- **Onderscheid metrics:** bestaande kolommen (accuracy etc.) blijven de train/val-metrics — NIET overschrijven met holdout-waarden. De ATDD-test asserteert expliciet `holdoutMetrics.accuracy !== body.accuracy`.
- **Geen augmentatie op holdout** — gebruik de validatie-transform (trainer.py heeft gescheiden train/val transforms rond regels 178-188; hergebruik de val-transform).
- **Edge case:** holdout-evaluatie mag een trainingsrun nooit laten falen ná een geslaagde training — bij evaluatiefout: model registreren mét lege holdout-metrics + warning-log + jobstatus-notitie (de gate in Epic 9 behandelt ontbrekende holdout-metrics later als "niet aangeboden").

### Bestaande code die je aanraakt (gelezen — huidige staat)

| Bestand | Huidige staat | Wijziging |
|---------|--------------|-----------|
| `apps/api/prisma/schema.prisma:64-80` | ModelVersion: alleen scalar metric-kolommen + `config Json`; geen metrics-kolom | + `metrics Json @default("{}")` |
| `apps/ml-service/app/services/database.py:148-171` | INSERT met 7 kolommen, config via `str()` (let op: bestaande str()-bug niet kopiëren naar metrics) | + metrics-param, JSONB |
| `apps/ml-service/app/services/trainer.py:330-372` | best-state laden → ONNX-export → MinIO save → create_model_version met train/val metrics | + holdout-evaluatiestap ertussen |
| `apps/api/src/api/v1/training.ts:255-276` | `GET /models/:modelId` geeft modelversie terug | + holdoutMetrics-mapping |
| `apps/api/src/api/v1/feedback.ts:641-702` | model-comparison: trainedAccuracy vs realWorldAccuracy per versie | + holdoutMetrics per rij |

**Wat behouden moet blijven:** bestaande response-velden van beide endpoints (alleen uitbreiden), ONNX-export-flow, WebSocket-voortgangsupdates.

### Architectuur-compliance (verplicht)

- Responses camelCase, ML-service intern snake_case (passthrough-uitzondering geldt NIET hier: de API mapt expliciet naar camelCase)
- Versie-format modelversies blijft `v{YYYYMMDD_HHMMSS}` (trainer.py regel 331)
- Tests: Vitest in `__tests__/`, pytest in `tests/`

### Project Structure Notes

- Geen nieuwe bestanden in de API nodig (uitbreiding bestaande routes); ML-service: `compute_holdout_hash` in trainer.py zelf (pytest importeert vandaar)
- Conflict-check: `metrics`-kolomnaam vrij in model_versions (geverifieerd in schema)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2]
- [Source: _bmad-output/test-artifacts/atdd-checklist-epic-7.md#API-contract]
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns / ML Model Deployment]
- [Source: _bmad-output/planning-artifacts/research/...#Architectural Patterns — data-architectuur holdout]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
