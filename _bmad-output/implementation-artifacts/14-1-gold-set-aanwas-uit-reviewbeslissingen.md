# Story 14.1: Gold-set-aanwas uit reviewbeslissingen

Status: ready-for-dev

<!-- Aangemaakt door create-story workflow, 2026-07-02. Bron: epics-vliegwiel.md Epic 14 / Story 14.1. -->

## Story

Als **datamanager**
wil ik **dat elke reviewbeslissing die ik neem automatisch de goudstandaard voedt**
zodat **de noodrem van het vliegwiel meegroeit zonder extra werk** (FR-10).

### Afbakening (kritiek)

- **Alleen menselijke beslissingen.** Uitsluitend expliciete reviewstation-beslissingen (accept, annotate, reject-met-reden) voeden gold-set en hard-negatives. Poort-afwijzingen (cap-bereikt/duplicaat/outlier, Epic 13) horen in géén van beide registers (AD-12) — dat is een harde grens, geen optimalisatie.
- Deze story is — naast de gescopeerde theming in Epic 15 — de tweede bewuste uitzondering op het PRD §5-non-goal "geen wijziging van het reviewstation-proces": een minimale UI-uitbreiding (redenkeuze bij reject), alleen zichtbaar bij vliegwiel-vlag aan.
- Géén eigen migratie: deze story schrijft naar `gold_set_records` (migratie belegd in Story 13.3) en `hard_negatives` (migratie belegd in Story 13.2). Zolang die migraties niet gedraaid zijn, is deze story geblokkeerd.

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 14.1)*

1. **Given** een expliciete accept-beslissing, of een reject-beslissing met reden "geen keurmerk", in het reviewstation
   **When** de beslissing wordt opgeslagen
   **Then** ontstaat exact één `gold_set_records`-record (accept→ECHT, reject-wegens-geen-keurmerk→VALS) met crop-verwijzing, T3777-code, bron en beslisser (FR-10)
   **And** blijft de bestaande reviewstation-flow verder ongewijzigd — de redenkeuze bij reject is de enige, minimale UI-uitbreiding en is alleen zichtbaar bij vliegwiel-vlag aan (PRD §5-nuance).

2. **Given** een reject-beslissing in het reviewstation met de vliegwiel-vlag aan
   **When** de datamanager afwijst
   **Then** onderscheidt de reject-flow twee redenen: **"geen keurmerk"** → gold-set-record VALS én de inhouds-hash van de crop naar `hard_negatives` (opgehaald via de canonieke `/ml/phash`-route, AD-14), zodat de 13.2-hernominatie-blokkade hem permanent vangt (FR-9, FR-10); **"onjuiste locatie/verkeerde code"** → géén gold-set-record en géén hard-negative — de beeldinhoud is niet fout, alleen de toewijzing (FR-9, FR-10, AD-12).

3. **Given** een zojuist genomen reviewbeslissing die ongedaan wordt gemaakt (undo)
   **When** de undo wordt verwerkt
   **Then** wordt het zojuist aangemaakte gold-set-record vervangen via `replacedById` (beide bewaard, FR-10, AD-4) en wordt de bijbehorende `hard_negatives`-rij verwijderd (FR-9).

4. **Given** een bestaand gold-set-record
   **When** een correctie nodig is
   **Then** gebeurt die via een nieuw record dat het oude vervangt (`replacedById`), met beide bewaard (FR-10, AD-4).

5. **Given** quarantaine-beoordelingen (Epic 15)
   **When** die later beschikbaar komen
   **Then** gebruikt deze story een herbruikbare service-functie zodat die paden dezelfde aanwas-route kunnen aanroepen (geen duplicaatlogica). De gold-set groeit uitsluitend uit menselijke beslissingen; zachte poort-afwijzingen horen in geen van beide registers (AD-12).

6. **Story-taak:** korte afstemming met de reviewstation-gebruikers over de nieuwe bijbestemmingen van hun klik (gold-set-aanwas, hard-negative bij "geen keurmerk", redenkeuze bij reject, undo-gedrag).

## Tasks / Subtasks

- [ ] 1. Herbruikbare aanwas-service `apps/api/src/services/flywheel/gold-set.ts` (AC: 1, 4, 5)
  - [ ] `recordReviewDecision({ label: 'ECHT'|'VALS', t3777Code, cropPath, source, decidedBy })` → exact één `gold_set_records`-insert; idempotent per beslissing.
  - [ ] `replaceGoldSetRecord(oldId, nieuw)` voor correcties (AC4): nieuw record + `replacedById` op het oude (enige toegestane mutatie, AD-4).
  - [ ] `withdrawGoldSetRecord(id)` voor undo (AC3) — zie Dev Notes "Undo-semantiek".
- [ ] 2. Accept-pad instrumenteren (AC: 1) — hook in `PATCH /artwork/review-items/:id/accept` (artwork-pipeline.ts:1017) én in `POST /artwork/review-items/:id/annotate` (:1098; ook een expliciete menselijke accept-beslissing, FR-10) → ECHT-record met `decidedBy` uit de auth-context.
- [ ] 3. Reject-pad met redenkeuze (AC: 1, 2)
  - [ ] Backend: `PATCH /artwork/review-items/:id/reject` (artwork-pipeline.ts:1187) accepteert optionele body `{ reason: 'geen-keurmerk' | 'onjuiste-locatie-verkeerde-code' }`. Zonder reden (vlag uit / oude client): legacy-gedrag, geen registers.
  - [ ] Reden "geen-keurmerk": VALS-record + synchrone `/ml/phash`-aanroep (MLClient, Story 13.1) → `hard_negatives`-insert (contentHash, t3777Code, cropPath, reason, evidence). Exacte reason-waarde: `reviewstation-geen-keurmerk` — uit de gedeelde reden-enum in `apps/api/src/services/flywheel/` (gedefinieerd in Story 13.6). Fail-closed: phash onbereikbaar → hele beslissing weigeren met duidelijke NL-fout (zie Dev Notes).
  - [ ] Reden "onjuiste-locatie-verkeerde-code": alleen status `rejected`, géén registers.
- [ ] 4. Undo-pad (AC: 3) — `PATCH /artwork/review-items/:id/reopen` (artwork-pipeline.ts:1216) uitbreiden: gold-set-record van deze beslissing vervangen via `replacedById` + `hard_negatives`-rij (lookup op `cropPath`) verwijderen. Idempotent (reopen is dat al).
- [ ] 5. Reviewstation-UI: redenkeuze bij reject (AC: 1, 2) — minimale uitbreiding in `apps/web/src` (ArtworkReviewItemCard/MobileReviewDeck + `artworkReviewService.ts:202` rejectReviewItem), alleen zichtbaar bij vliegwiel-vlag aan (vlag-exposure via bestaand config/health-pad, zie Dev Notes). NL-teksten via i18next-keys.
- [ ] 6. Tests (vitest, apps/api + web): service-functies (exact één record; correctie; withdraw), reject-redenen-splitsing, phash-fail-closed, undo verwijdert hard-negative + vervangt record, vlag-uit = byte-gelijk legacy-gedrag. Web: redenkeuze alleen bij vlag aan.
- [ ] 7. Afstemtaak reviewstation-gebruikers (AC: 6) — kort gesprek/demo; uitkomst noteren in Dev Agent Record.
- [ ] 8. versions.md (NL, eindgebruikerstaal) in DEZELFDE commit; Engelse commit; ghcr-build afwachten vóór Coolify-deploy; deploy-volgorde api → web (ml-service alleen als 13.1 nog mee moet).

## Dev Notes — Developer Context

### Bindende architectuurbeslissingen

- **AD-4** — gold-set in PostgreSQL; actieve set = `replacedById IS NULL`; vervanging zet `replacedById` op het óude record (enige toegestane mutatie); resolutie in `apps/api` (`services/flywheel/gold-set.ts`).
- **AD-12** — hard-negatives uitsluitend uit menselijke afkeuring (quarantaine-afkeuring 15.3, reviewstation-reject "geen keurmerk" — deze story); zachte poort-afwijzingen nooit.
- **AD-13** — evidence/beslisser vastleggen (bron, `decidedBy`, tijdstempel).
- **AD-14** — inhouds-hash uitsluitend via ml-service `/ml/phash`, synchroon, fail-closed; NOOIT een hash in Node berekenen.
- **AD-2** — API bezit alle vliegwiel-state; ml-service schrijft geen vliegwiel-tabellen.

### Wat er AL bestaat (geverifieerd, hergebruiken)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Accept-endpoint | `apps/api/src/api/v1/artwork-pipeline.ts:1017–1087` | status→`accepted`, `processAcceptedReviewItems`, daarna 12.3 `mlClient.registerReference` (best-effort). Hier de ECHT-hook. |
| Annotate-endpoint | `apps/api/src/api/v1/artwork-pipeline.ts:1098–1181` | Menselijk getekende bbox → crop → zelfde accept-pad. Óók ECHT-hook. |
| Reject-endpoint | `apps/api/src/api/v1/artwork-pipeline.ts:1187–1207` | Zet nu alleen status `rejected`, géén reden-veld — de redenkeuze komt in de request-body, niet in een nieuwe kolom. |
| Undo/reopen | `apps/api/src/api/v1/artwork-pipeline.ts:1216–1259` | Deactiveert al trainingData (op `cropPath`) + referenceLogo (`source='review-confirmed'`). Zelfde patroon volgen voor gold-set-withdraw + hard-negative-delete. |
| ArtworkReviewItem-model | `apps/api/prisma/schema.prisma:506–524` | `reason` is de bestaande routing-reden uit de crosscheck — NIET overschrijven met de reject-reden. |
| Web reject/undo | `apps/web/src/services/artworkReviewService.ts` (`reopenReviewItem:82`, `acceptReviewItem:190`, `rejectReviewItem:202`); `apps/web/src/components/review/MobileReviewDeck.tsx:274–342` (undo/relabel-flow: reopen-old → accept-new); `ArtworkReviewItemCard.tsx`, `ImageStage.tsx` | Minimale UI-uitbreiding hier; relabel-flow (reopen→accept) werkt dan vanzelf correct: reopen trekt het oude record in, de nieuwe accept maakt een nieuw record. |
| Gold-set-bestanden (referentie) | `tests/validation/gold-set-oogstrun.json` (meta: 91 records, 75 ECHT / 16 VALS; velden id, label, t3777Code, confidence, gtin, method, cropPath, sourceFile, bbox, reason) | Wordt door 13.3 geïmporteerd; deze story schrijft alleen nieuwe records via de tabel. |

### Afhankelijkheden (blokkerend)

- **Story 13.1**: `/ml/phash` + MLClient-methode (AD-14). **Story 13.2**: `hard_negatives`-tabel. **Story 13.3**: `gold_set_records`-tabel + actieve-set-resolver. Zonder deze drie is deze story niet implementeerbaar — check `prisma/schema.prisma` en de migratiestatus vóór start.

### Ontwerpbeslissingen (vastgelegd, dev volgt)

- **Vlag-scoping:** de redenkeuze-UI en het reject-register-pad staan achter `FLYWHEEL_NOMINATION_ENABLED` (hoofdvlag, AD-8-conventie). De accept→ECHT-aanwas is functioneel zodra `gold_set_records` bestaat en mag óók bij vlag-aan-only geïmplementeerd worden — kies één lijn (voorkeur: alles achter de hoofdvlag, dan is vlag-uit aantoonbaar byte-gelijk legacy) en documenteer de keuze in het Dev Agent Record.
- **Fail-closed bij phash-fout (AC2):** als `/ml/phash` onbereikbaar is bij reject-"geen keurmerk", faalt de héle beslissing (503 met NL-melding "Beslissing niet opgeslagen — probeer opnieuw"), in één transactie: nooit een VALS-record zónder hard-negative of andersom. Rationale: FR-9 belooft *permanente* blokkade; een stil gemiste hard-negative ondermijnt dat (AD-14-lijn, geen fallback-hash).
- **Undo-semantiek (AC3):** "vervangen via replacedById" bij een intrekking zonder opvolger-beslissing wordt geïmplementeerd als **self-tombstone**: `UPDATE gold_set_records SET replaced_by_id = id WHERE id = ... AND replaced_by_id IS NULL` (conditional update). Het record blijft bewaard, valt uit de actieve set (`replacedById IS NULL`-definitie AD-4 blijft ongewijzigd) en er ontstaat geen verweesd "actief" vervangingsrecord. Bij een échte her-beslissing (relabel-flow: reopen → accept-new) ontstaat daarna een nieuw record — dan zijn "beide bewaard". **Afstempunt met 13.3:** de 13.3-migratie mag geen constraint bevatten die self-reference blokkeert.
- **Hard-negative-verwijdering bij undo:** lookup op `cropPath` (uniek per reviewitem; hard_negatives heeft cropPath per Structural Seed) — geen her-berekening van de hash nodig bij undo.
- **Vlag-exposure frontend:** hergebruik het bestaande pad waarmee de web-app server-config leest (health/config-endpoint); GEEN aparte env-var in de web-build (runtime-schakelbaar houden).

### Guardrails (voorkom bekende fouten)

- **Geen eigen migratie** in deze story; en NOOIT `prisma migrate` draaien zonder expliciete toestemming per geval (teamregel; migraties horen bij 13.2/13.3).
- **Legacy-gedrag heilig:** met de vlag uit is elk endpoint byte-gelijk aan vandaag (regressietest verplicht). Het 12.3-registerReference-pad in accept NIET aanraken — dat wordt pas in Story 13.2 omgebogen.
- **Poort-afwijzingen nooit als bron** — de service-functies accepteren alleen menselijke bronnen (`review-accept`, `review-annotate`, `review-reject`, later `quarantaine`); valideer de bron-parameter hard.
- **E2E buiten de stable-subset-gate** houden (quarantaine-les); unit/integratie is de dekking.
- Commits/PRs in het Engels; `versions.md` (NL) in DEZELFDE commit. Deploy: ghcr-workflow "Build and Push Docker Images" afwachten vóór Coolify (ACC draait pre-built images).

### Testrichtlijnen

- Vitest (apps/api): service-functies geïsoleerd (mocked prisma); route-integratie accept/annotate/reject/reopen met gemockte MLClient (phash) — exact-één-record-assertie, fail-closed-pad (phash down → 503, géén partial writes), undo-idempotentie, vlag-uit-regressie.
- Vitest (apps/web): redenkeuze-rendering alleen bij vlag aan; rejectReviewItem stuurt reden mee.
- Geen pytest nodig (ml-service ongewijzigd; /ml/phash is 13.1).

### Project context reference

- `_bmad-output/planning-artifacts/epics-vliegwiel.md` — Story 14.1 (AC-bron), Epic 14-inleiding (PRD §5-uitzondering).
- `_bmad-output/planning-artifacts/architecture/architecture-logoRecognition-2026-07-02/ARCHITECTURE-SPINE.md` — AD-4, AD-12, AD-13, AD-14; Structural Seed (`gold_set_records`, `hard_negatives`).
- `_bmad-output/planning-artifacts/prds/prd-logoRecognition-2026-07-02/prd.md` — §4.3 FR-10/FR-11, §4.2 FR-9, §5 non-goal-nuance.

## Dev Agent Record

_(in te vullen door dev-story)_

### Agent Model Used

### Debug Log References

### Completion Notes

### File List

## Change Log

- 2026-07-02: Story aangemaakt (create-story workflow) op basis van epics-vliegwiel.md Epic 14, spine-AD's en codebase-verificatie (artwork-pipeline.ts accept/reject/reopen-pad, web-reviewservice).
