# Story 8.6: Trainingsdata-registratie met herkomst

Status: done (backend + UI-subtaken)

## Story

As a datamanager,
I want dat auto-geaccepteerde en goedgekeurde crops als trainingsdata geregistreerd worden met volledige herkomst,
so that de dataset auditeerbaar groeit en foute bronnen later traceerbaar en corrigeerbaar zijn.

## Acceptance Criteria

1. **Registratie met provenance (FR49):** Given een auto-geaccepteerde detectie of goedgekeurd reviewitem, When registratie plaatsvindt, Then ontstaat een trainingsdata-record met label, crop-verwijzing (MinIO), bronbestand, bounding box, methode (template/classifier/human/synthetic) en confidence And telt het mee in de bestaande statistieken per Logo-categorie.
2. **Bulk-correctie:** Given een fout gelabeld bronbestand, When ik de herkomst opvraag, Then kan ik alle trainingsdata-records van dat bronbestand vinden en in bulk deactiveren.

## Tasks / Subtasks

- [x] Task 1: Datamodel-uitbreiding (AC: 1, 2)
  - [x] `TrainingData` uitbreiden: `provenance Json @default("{}")` + `active Boolean @default(true)` + `cropPath String?` — schema.prisma + `infrastructure/docker/postgres/init.sql` (regels 295-302; provenance/active/crop_path + GIN-index). [reeds aanwezig vóór remediatie]
  - [x] **Epic 7-learning #8 (malformed-blocks):** provenance-shape op ÉÉN plek — `apps/api/src/services/provenance.ts` (nieuw): `Provenance`-type + `mapProvenance` (malformed → null + warning, mirror van holdout-metrics.ts) + `buildProvenance` (write-side) + `PROVENANCE_METHODS`. Geconsumeerd door artwork-pipeline.ts (registratie) en training.ts:249 (synthetic-guard).
  - [x] ⚠️ `active=false`-records uitsluiten in trainer-query — `apps/ml-service/app/services/database.py:541-571` (`AND td.active = true` in alle varianten incl. holdout get_holdout_images:587 en LEFT JOIN active-clause). [reeds aanwezig sinds ddc70ca; geen wijziging nodig]
- [x] Task 2: Registratie-endpoint (AC: 1)
  - [x] **ATDD-contract:** `POST /artwork/:gtin/register-training-data` → 201 (`apps/api/src/api/v1/artwork-pipeline.ts:806-869`; geherstructureerd naar gedeelde `registerCropsTx`-helper regels 134-208).
  - [x] LogoImage-koppeling met `metadata.artworkSource=true` (registerCropsTx). **Spookkaarten-filtering backend:** (a)+(b) `apps/api/src/api/v1/images.ts:256-281` — `GET /training/images` `where.AND` sluit `metadata.artworkSource`-records uit in zowel `findMany` als de gedeelde `count`. Die `count` IS de enige live "Total Images"-bron (frontend `TrainingPage.tsx:187` ← `stats.total` ← `/training/images`-pagination). (c) filename=sourceFile is gevuld, updatedAt is `@updatedAt` (auto) → nooit NaN/Invalid Date. **Stats-endpoint-onderzoek (b):** repo-breed gecontroleerd — `POST /training/summary` (`modelService.ts:209` → `dataSummary.totalImages`) heeft GEEN backend-handler in apps/api noch apps/ml-service (dode frontend-call; de twee `COUNT(*)` in database.py zijn holdout-count en per-class-count, geen logo_images-totaal). Daarom is (b) gedekt door dezelfde `/training/images`-count-exclusie; een apart stats-endpoint bestaat niet en valt buiten scope. **UI-weergave (Image Library/review-UI in apps/web) = deferred, apart ingepland.**
  - [x] **Doorzet-taak:** `processAcceptedReviewItems` (artwork-pipeline.ts:212-280) + `registerCropsTx`. Aanroepbaar via accept-endpoint `PATCH /artwork/review-items/:id/accept` (regels ~800-845) + catch-up `POST /artwork/review-items/process-accepted` (regels ~888-915). Reject-endpoint `PATCH /artwork/review-items/:id/reject`. Crosscheck persisteert nu `cropPath`/`sourceFile` op ArtworkReviewItem (DetectionItem uitgebreid + createMany), zodat accepted items echte crops dragen; items zonder crop worden geskipt (no-fabricate), niet verzonnen.
  - [x] Statistieken: `update_logo_training_stats`-flow blijft kloppen via Logo-upsert (category=KEURMERK_CATEGORY). **Named constant** `KEURMERK_CATEGORY` geëxporteerd uit `apps/api/src/services/provenance.ts` en gebruikt in artwork-pipeline.ts (registerCropsTx) én reference-logos.ts:134-136 (magic string verwijderd).
- [x] Task 3: Bulk-deactivatie (AC: 2)
  - [x] **ATDD-contract:** `PATCH /training/data/deactivate-by-source` → 200 `{ deactivated: n }` via `updateMany` Json-path filter (artwork-pipeline.ts). NOOIT delete (test asserteert). [reeds aanwezig]
  - [x] **GIN-index** op provenance — `init.sql:302` `CREATE INDEX ... USING GIN (provenance jsonb_path_ops)`. [reeds aanwezig]
  - [x] **RBAC:** registratie + bulk-deactivatie + accept/reject/process-accepted vereisen ADMIN (`REQUIRE_ADMIN = requireRole('ADMIN')`).
- [x] Task 4: Tests groen
  - [x] Provenance-tests groen + nieuwe vitest-tests: `images.routes.test.ts` (3, filtering), doorzet-block in `artwork-pipeline.routes.test.ts` (4: accept-met-crop registreert, accept-zonder-crop fabriceert NIET, reject, catch-up) + crosscheck-persistence-test (1, borgt dat cropPath/sourceFile op ArtworkReviewItem worden vastgelegd — mutatie-geverifieerd). 183 passed / 2 skipped (was 175/2).

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Vereist 8.5** (accept-stroom levert de items); endpoint zelf is onafhankelijk testbaar
- **Holdout-interactie:** geregistreerde artwork-crops komen ALTIJD met holdout=false binnen; alleen het bestaande PATCH-holdout-endpoint (7.1) mag dat veranderen. Synthetic-method-records mogen NOOIT holdout worden — voeg die guard toe in het holdout-PATCH-endpoint (weiger met 422 als provenance.method='synthetic'; dekt NFR3-verlenging uit 8.7)
- **active vs holdout zijn orthogonaal:** active=false = bron afgekeurd (kwaliteit), holdout=true = beschermde evaluatieset. Niet vermengen
- **Trainer-impact is ML-service-kant:** de `AND td.active = true`-toevoeging raakt database.py — zelfde dubbele-schema-bron-les (init.sql), en de bestaande Epic 7-pytest-suite moet groen blijven (geen regressie op holdout-tests)

### Bestaande code als referentie

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/services/holdout-metrics.ts` (Epic 7) | shape-op-één-plek-patroon voor provenance.ts |
| `apps/api/src/api/v1/reference-logos.ts:114-118` | Logo-upsert (category='keurmerk') |
| `apps/ml-service/app/services/database.py:363-412` | get_training_images/get_holdout_images (active-filter toevoegen) |
| `apps/api/src/api/v1/training.ts` (7.1) | holdout-PATCH (synthetic-guard toevoegen) |

### References

- [Source: epics.md#Story 8.6] · [Source: atdd-checklist-epic-8-9.md — provenance-contract] · [Source: Epic 7 review-fixes #7/#8 — gedeelde mapper + malformed→null]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (remediatie-agent, backend-scope)

### Completion Notes List

- **Remediatie-context:** een eerdere agent rapporteerde deze story "done" op basis van een groene maar gemockte gate. Bij hercontrole bleken de registratie/deactivatie-endpoints en het ML-active-filter aanwezig, maar de backend-scope van de spookkaarten-filtering, de doorzet/accept-flow, de gedeelde provenance-shape en de named constant ontbraken.
- **Kritieke datafix (doorzet was facade-gevoelig):** ArtworkReviewItems werden door crosscheck aangemaakt ZONDER cropPath/sourceFile (DetectionItem droeg ze niet). Een doorzet daarop zou null/garbage-crops registreren en tóch een gemockte test laten slagen. Opgelost: DetectionItem uitgebreid met optionele cropPath/sourceFile, crosscheck persisteert ze nu op ArtworkReviewItem, en `processAcceptedReviewItems` skipt (no-fabricate) items zonder crop i.p.v. ze te verzinnen.
- **Scope:** alleen backend. De UI-weergave (Image Library-filtering in apps/web, review/accept-UI) is bewust DEFERRED en apart ingepland; alleen de backend-query/endpoint-kant is geïmplementeerd.
- **Reeds aanwezig, niet opnieuw gebouwd:** provenance/active/cropPath-datamodel + GIN-index (init.sql), register-training-data + bulk-deactivate + RBAC, ML active=true-filters (database.py, ddc70ca), synthetic-holdout-guard 422 (training.ts).
- **Tests:** vitest 182 passed / 2 skipped (was 175/2). 7 nieuwe tests toegevoegd. Geen Python-wijzigingen (ML-suite bestaat niet op deze branch; database.py ongewijzigd).

### File List

- apps/api/src/services/provenance.ts (nieuw)
- apps/api/src/api/v1/artwork-pipeline.ts (registerCropsTx, processAcceptedReviewItems, accept/reject/process-accepted endpoints, DetectionItem + crosscheck persistence, named constant)
- apps/api/src/api/v1/images.ts (artworkSource-exclusie in findMany + count)
- apps/api/src/api/v1/training.ts (synthetic-guard via mapProvenance)
- apps/api/src/api/v1/reference-logos.ts (KEURMERK_CATEGORY i.p.v. magic string)
- apps/api/src/__tests__/api/images.routes.test.ts (nieuw)
- apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts (doorzet-testblok)

### UI-slag (deferred subtaken afgerond — claude-opus-4-8)

- **Image Library-weergave:** de backend filtert artworkSource-ghostkaarten al server-side uit (Task 2). Aan de UI-kant gehard tegen NaN/Invalid Date in `ImageLibrary.tsx`: `formatSize` vangt missing/NaN-bytes op (→ "—"), `formatDate` accepteert zowel `uploadedAt` als `createdAt` (de API levert `createdAt`) en valt terug op "—" bij ontbrekende/ongeldige datum. `TrainingImage`-type kreeg `createdAt?`. Geen client-side artworkSource-filter gedupliceerd (server doet dit al).
- **Tests:** `ImageLibrary.test.tsx` (2 nieuw) borgt dat kaarten nooit "Invalid Date"/"NaN" tonen, ook zonder uploadedAt/size.
- **Provenance-weergave op review-kant:** zie story 8.5 UI-slag — accept zet via `PATCH /artwork/review-items/:id/accept` door naar de provenance-registratie (deze story's backend).
- **Bestanden:** apps/web/src/components/training/ImageLibrary.tsx, apps/web/src/components/training/ImageLibrary.test.tsx (nieuw), apps/web/src/types/training.types.ts.
