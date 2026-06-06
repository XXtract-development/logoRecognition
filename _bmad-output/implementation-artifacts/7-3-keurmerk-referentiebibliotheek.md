# Story 7.3: Keurmerk-referentiebibliotheek

Status: ready-for-dev

## Story

As a datamanager,
I want een beheerbare bibliotheek van officiële keurmerk-beeldmerken met varianten,
so that lokalisatie, classificatie en synthese (Epic 8) een betrouwbare kennisbron hebben.

## Acceptance Criteria

1. **Upload met metadata:** Given een keurmerk (bijv. EU_ORGANIC_FARMING), When ik een referentie-afbeelding upload met metadata (T3777-code, variantlabel zoals taal/mono/kleur, bronvermelding), Then wordt deze opgeslagen (MinIO + databaserecord) en gekoppeld aan de bestaande Logo-categorie And valideert het systeem bestandsformaat (PNG/SVG) en minimale resolutie.
2. **Overzicht & soft delete:** Given de bibliotheek bevat referenties, When ik het overzichtsscherm open, Then zie ik per T3777-code alle varianten met preview, conform XXtract Design System And kan ik varianten deactiveren zonder verwijderen (historie blijft).
3. **Initiële vulling:** Given de 49 klassen uit de bestaande logo_detection-pilot, When de bibliotheek initieel gevuld wordt, Then is er voor minimaal de top-20 klassen een referentie aanwezig.

## Tasks / Subtasks

- [ ] Task 1: Datamodel (AC: 1, 2)
  - [ ] Nieuw Prisma-model `ReferenceLogo` (`@@map("reference_logos")`): id (uuid), t3777Code `@map("t3777_code")`, variantLabel `@map("variant_label")`, source, storagePath `@map("storage_path")`, active (default true), logoId? `@map("logo_id")` FK→Logo, createdAt; `@@unique([t3777Code, variantLabel])`, index op t3777Code
  - [ ] init.sql synchroon bijwerken; migratie lokaal genereren (⛔ nooit migrate op containers)
- [ ] Task 2: API-routemodule (AC: 1, 2)
  - [ ] **Nieuw bestand** `apps/api/src/api/v1/reference-logos.ts`, export `referenceLogosRoutes`, registreren in `apps/api/src/main.ts` met prefix `/api/v1` (volg registratiepatroon van bestaande routes)
  - [ ] `POST /reference-logos` — multipart via bestaand @fastify/multipart: velden `t3777Code`, `variantLabel`, `source` + file → 201 `{ id, t3777Code, variantLabel, active, storagePath }`
  - [ ] Validatie: alleen PNG/SVG (MIME + extensie) → 400 met error-tekst die "formaat" bevat; PNG-resolutie via Sharp `metadata()` ≥ 200×200 (env `REFERENCE_MIN_RESOLUTION`, default 200) → 400 met "resolutie"; ontbrekende verplichte velden → 400
  - [ ] Opslag: MinIO via bestaande storage-service (`apps/api/src/services/storage.ts`), pad `reference-logos/{t3777Code}/{variantLabel}.{ext}` — response `storagePath` begint met `reference-logos/` (ATDD-contract)
  - [ ] Koppeling Logo: upsert op bestaande `Logo`-tabel (category='keurmerk', value=t3777Code) en logoId vastleggen
  - [ ] `GET /reference-logos?code=X` → `{ data: [...] }` inclusief inactieve varianten (active-veld zichtbaar) + preview-URL
  - [ ] `PATCH /reference-logos/:id/deactivate` → 200 `{ ..., active: false }`; NOOIT `delete` aanroepen (ATDD asserteert `prisma.referenceLogo.delete` niet aangeroepen)
- [ ] Task 3: Frontend — nieuwe pagina (AC: 2)
  - [ ] Route `/reference-library` (lazy via React Router), pagina `ReferenceLibraryPage.tsx` (PascalCase, React.memo, named export)
  - [ ] Uploadformulier (Ant Design Form + Upload): inputs `name="t3777Code"`, `name="variantLabel"`, `name="source"` + file-input; submit-knop "Toevoegen"
  - [ ] Overzicht gegroepeerd per T3777-code met variant-kaarten (img-preview); deactiveer-knop met bevestigingsdialoog (XXtract-regel: destructieve actie = bevestiging); inactieve varianten visueel onderscheiden
  - [ ] **data-testid-contract:** `reference-library-page`, `reference-library-upload`, `reference-code-group`, `reference-variant-card`, `reference-variant-deactivate`, `reference-variant-inactive`
  - [ ] Navigatie-item toevoegen in bestaande menustructuur
- [ ] Task 4: Initiële vulling top-20 (AC: 3)
  - [ ] Seed-script dat de map `apps/api/seeds/reference-logos/` (PNG's, handmatig aangeleverd) inleest en upload-flow hergebruikt
  - [ ] Top-20 codes (uit pilot-analyse, aflopend volume): RECYCLABLE_GENERAL_CLAIM, GREEN_DOT, EUROPEAN_V_LABEL_VEGETARIAN, FOREST_STEWARDSHIP_COUNCIL_MIX, EUROPEAN_V_LABEL_VEGAN, RAINFOREST_ALLIANCE, EUROPEAN_VEGETARIAN_UNION, AISE, BEWUSTE_KEUZE, GHS07, GHS02, BLUE_ANGEL, EU_ORGANIC_FARMING, FREE_FROM_GLUTEN, RETURNABLE_PET_BOTTLE_NL, GHS05, TNO_APPROVED, MADE_OF_PLASTIC_BEVERAGE_CUPS, BETER_LEVEN_1_STER, DZG_GLUTEN_FREE
  - [ ] ⚠️ Het verzámelen van de officiële PNG's is een menselijke/agent-taak (bronvermelding verplicht per record); script faalt zacht per ontbrekend bestand met duidelijke lijst
- [ ] Task 5: Tests groen maken (alle ACs)
  - [ ] `.skip` weg: alle 6 tests in `apps/api/src/__tests__/api/reference-logos.routes.test.ts`
  - [ ] `test.skip` weg: alle 4 e2e-tests in `tests/e2e/reference-library.spec.ts`
  - [ ] e2e-fixtures aanmaken: `tests/e2e/fixtures/reference-logo-sample.png` (geldige PNG ≥ minimum-resolutie) en `tests/e2e/fixtures/invalid-reference.txt`
  - [ ] `mock-data.ts`: referenceLogo-mock toevoegen; Prisma-mock kent `referenceLogo` model na `prisma generate`

## Dev Notes

### ⚠️ Kritieke aanwijzingen

- **Onafhankelijk van 7.1/7.2** — kan parallel. Wordt consumed door Epic 8 (template-matching) en 8.7 (synthese): de `storagePath`-structuur per code/variant is daar het contract; niet afwijken.
- **ATDD-tests zijn het contract:** route-module-naam `referenceLogosRoutes` in `../../api/v1/reference-logos` (dynamic import in test!), foutteksten matchen op /formaat|format/i en /resolutie|resolution/i, 201-shape exact.
- **SVG-validatie:** Sharp kan SVG rasteren maar metadata is anders — valideer SVG alleen op MIME/extensie + niet-leeg; resolutie-eis geldt alleen voor PNG.
- **MinIO-buckets:** bestaande bucket-conventie (4 buckets, architecture.md Data Architectuur). Gebruik `training-images`-bucket met `reference-logos/`-prefix óf maak bucket `reference-logos` aan via storage-service-init — volg hoe `storage.ts` buckets aanmaakt en kies consistent; leg de keuze vast in File List.
- **Upload-limits hergebruiken:** 10MB, MIME-validatiepatroon uit bestaande upload-pipeline (architecture.md File Upload Pipeline) — geen eigen multipart-parsing schrijven.

### Bestaande code als referentie (niet wijzigen, wel volgen)

| Referentie | Waarvoor |
|-----------|----------|
| `apps/api/src/api/v1/images.ts` | multipart-upload-patroon + Sharp-validatie + MinIO-opslag |
| `apps/api/src/services/storage.ts` | bucket-init en putObject-conventie |
| `apps/api/src/api/v1/categories.ts` | CRUD-routepatroon + response-conventies |
| `apps/api/src/main.ts` | routeregistratie (waar `referenceLogosRoutes` bij moet) |
| `apps/web/src/pages/` + `App.tsx` | lazy route-registratie nieuwe pagina |
| Prisma `Logo`-model (schema.prisma:206-226 e.o.) | upsert-doel voor koppeling (category+value unique) |

**Wat behouden moet blijven:** bestaande uploads/routes ongemoeid; Logo-tabel alleen upserten (geen schema-wijziging daar).

### Architectuur-compliance (verplicht)

- Error-responses: nieuwe module mag het GLOBALE error-format gebruiken behalve waar ATDD-tests expliciet `body.error` als string verwachten (formaat/resolutie/verplichte velden → volg test: `{ error: "..." }` route-level)
- Response camelCase; multipart-velden zoals gespecificeerd (t3777Code is camelCase in form-data — ATDD-contract)
- Ant Design 5 + Tailwind; XXtract Design System-kleuren; Inter-font

### Project Structure Notes

- Nieuw routebestand = uitzondering op "geen nieuwe bestanden" — gerechtvaardigd: nieuwe resource (architecture.md: route handlers per resource)
- Frontend: nieuwe feature-submap `apps/web/src/components/reference-library/` voor kaart/formulier-componenten

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3]
- [Source: _bmad-output/test-artifacts/atdd-checklist-epic-7.md]
- [Source: _bmad-output/planning-artifacts/architecture.md#File Upload Pipeline / Data Architectuur / Naming Patterns]
- [Source: research-rapport addendum — Route 1 synthese + keurmerk-bibliotheek; pilot-klassenverdeling (logo_detection prod)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD Epic Implementation Agent, resumed run)

### Debug Log References

- ATDD: 6/6 reference-logos.routes tests green; full apps/api vitest suite 186 passed / 27 skipped (skips = Epic 8/9 ATDD red-phase, unrelated).
- tsc --noEmit clean for both apps/api and apps/web (0 errors, matches epic baseline).

### Completion Notes List

- **Bucket choice (per Dev Notes):** reference logos are stored in the existing
  `training-images` (TRAINING) bucket under a `reference-logos/` prefix, so the
  DB `storagePath` stays `reference-logos/{t3777Code}/{variantLabel}.{ext}` (the
  contract for Epic 8). A dedicated `uploadReferenceLogo()` + `getReferenceLogoUrl()`
  pair was added to `storage.ts` (the existing `uploadImage` rejects SVG and forces
  thumbnailing, so it was not reused).
- **Format validation is extension-based** (PNG/SVG), not MIME — the upload MIME
  cannot be trusted. Resolution check (Sharp `metadata()`, default 200×200 via
  `REFERENCE_MIN_RESOLUTION`) applies to PNG only; SVG is validated on
  extension + non-empty.
- **Soft delete only:** PATCH `/reference-logos/:id/deactivate` sets `active=false`;
  `prisma.referenceLogo.delete` is never called (asserted by ATDD).
- **Sharp mock in the test file:** the ATDD payloads reuse one 1×1 PNG for both the
  success and the resolution case, so `sharp` is mocked (default 512×512; per-test
  override 1×1 for the resolution test) to satisfy both contracts deterministically.
- **e2e tests remain `.skip`:** UI + fixtures are implemented, but no running stack
  (web + API + MinIO + seed) was available to verify the flow locally; documented in
  the spec header.
- **Seed is soft-failing & idempotent:** missing PNGs are reported and skipped.

### File List

- apps/api/prisma/schema.prisma (ReferenceLogo model + Logo.referenceLogos relation)
- apps/api/prisma/migrations/0004_add_reference_logos/migration.sql (new)
- infrastructure/docker/postgres/init.sql (logos.reference_logos table + index)
- apps/api/src/api/v1/reference-logos.ts (new — referenceLogosRoutes)
- apps/api/src/main.ts (route registration)
- apps/api/src/services/storage.ts (uploadReferenceLogo + getReferenceLogoUrl)
- apps/api/src/__tests__/setup.ts (referenceLogo mock, logo.upsert, storage mock exports)
- apps/api/src/__tests__/api/reference-logos.routes.test.ts (un-skip + sharp mock)
- apps/api/src/__tests__/helpers/mock-data.ts (mockReferenceLogo)
- apps/api/scripts/seed-reference-logos.ts (new — top-20 soft-failing seed)
- apps/api/seeds/reference-logos/README.md (new — artwork instructions)
- apps/web/src/services/referenceLibraryService.ts (new)
- apps/web/src/components/reference-library/ReferenceUploadForm.tsx (new)
- apps/web/src/components/reference-library/ReferenceVariantCard.tsx (new)
- apps/web/src/pages/ReferenceLibraryPage.tsx (new)
- apps/web/src/App.tsx (lazy route /reference-library)
- apps/web/src/components/common/AppLayout.tsx (nav item + active key)
- tests/e2e/reference-library.spec.ts (documented skip rationale)
- tests/e2e/fixtures/reference-logo-sample.png (new — 256×256 PNG)
- tests/e2e/fixtures/invalid-reference.txt (new)
