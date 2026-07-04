# Sprint Change Proposal — Gerichte brandstofselectie via declaraties (Epic 19)

Datum: 2026-07-04 · Opsteller: Correct Course (dev) · Beslisser: Friso (PO) · Modus: incrementeel · **Status: GOEDGEKEURD (Epic-kader "A", 2026-07-04)**

## 1. Issue Summary

Het referentie-vliegwiel (Epics 13-18 + Story 12.8) is gebouwd, gereviewd, gedeployed op ACC en de gold-set-noodrem is geseed (303 records). Bij het **operationaliseren** (activeren + voeden) bleek:

- **ACC heeft geen live-instroom** → de nominatie-vlaggen aanzetten voedt niets.
- De echte artwork-corpus staat op **prod** (`/media/Xmedia`, 151 GLNs/partijen, **~12.526 GTINs**, ~39k bestanden). De *bestanden* zijn in juni al naar ACC gesynct (besluit-39k-toegang, Optie A), maar de **ACC-media-index + catalog-baseline ontbreken** → discovery geeft leeg (Gap 1+2). De publieke prod-media-endpoint gaf bovendien **HTTP 503**.
- De **declaratie-lezer dekt maar 3 van de 5 GDSN-keurmerkvelden** (`enumerationValue` en `localPackagingMarkedLabelAccreditationCodeReference` ontbreken) → het vliegwiel is blind voor keurmerken in die velden.
- **Blind het hele archief verwerken is inefficiënt** (~28s/beeld). Beter: via de GS1-declaraties etiketten selecteren die gegarandeerd een keurmerk bevatten, gebalanceerd per keurmerk tot de class-cap.

Bewijs: lege discovery-test op verse GTIN; `MARK_FIELDS` = 3 velden; `Result_4.xlsx` = ~951-code-universum uit 5 GS1-codelijsten; besluit-39k-toegang-2026-06-07; prod-media 503 (2×).

## 2. Impact Analysis

- **Epic-impact:** geen bestaande (done) epic wijzigt. Epic 18 ontsloot de brandstoftank maar liet de eigenlijke voeding bewust open. → **Nieuwe Epic 19** toegevoegd; 13-18 ongemoeid.
- **PRD:** nieuwe **FR-22** (gerichte, gebalanceerde brandstofselectie via declaraties + 5/5-velddekking). MVP (het vliegwiel) blijft geleverd; dit is brandstof-optimalisatie erbovenop. Addendum §1 aangevuld.
- **Architectuur:** puur additief — parser-uitbreiding (`t3777-declarations.ts`), een index/sampler-service, en media-toegang (Route B = resterende DB-replicatie index+tradeItems→Cherry, want de bestanden staan er al). Volgt ARCH-4 (idempotente handmatige scripts, droge-run) en Constraint 1 (migraties/DB-schrijf met toestemming). Geen nieuwe patronen.
- **UX:** nauwelijks — backend/ops; eventueel later een dashboard-paneel "dekking per keurmerk" (niet vereist).
- **Technisch/infra:** twee ACC-DB-schrijven (media-index + tradeItems) bij Route B — beide vereisen expliciete toestemming per geval.

## 3. Recommended Approach

**Optie 1 — Directe Aanpassing** (nieuwe Epic 19 + stories binnen het bestaande plan), met een **spike als eerste story**. Optie 2 (rollback) en 3 (MVP-herziening) zijn niet van toepassing: er is niets terug te draaien en de MVP staat. Inspanning gemiddeld; risico laag-gemiddeld (de media-toegang-onbekende wordt door de spike afgevangen vóór er gebouwd wordt).

## 4. Detailed Change Proposals

**Epics** (`epics-vliegwiel.md`): FR-22 aan inventaris + coverage-map; Epic 19 aan Epic List + volledige sectie met 4 stories; volgorde 13→…→18→19.

**Epic 19 — Gerichte brandstofselectie via declaraties**
- **19.1 (SPIKE)** — ACC-verwerkingstoegang + keurmerk-dekkingsmeting: routebesluit (A env→prod vs B DB-replicatie), proof-of-access op enkele GTINs, dekkingsrapport per keurmerk tegen het 951-universum. ACC-DB-schrijf/herstart met toestemming.
- **19.2** — Declaratie-parser naar 5/5 velden (`enumerationValue` + `localPackagingMarkedLabelAccreditationCodeReference`); byte-gelijk gedrag bestaande 3 velden; unit-test per veld.
- **19.3** — Keurmerk→etiket-index uit declaraties (idempotent seed-script, droge-run, catalog-XML-lezer); index {code → [GTIN → etiket]} + tellingen tegen 951-universum.
- **19.4** — Gebalanceerde sampler (N/keurmerk, `FLYWHEEL_`-env) + aansluiting op het bestaande nominatie-/bootstrap-pad door de kwaliteitspoort; class-cap/dedup gerespecteerd; geen poort-omzeiling.

**PRD** (`prds/prd-…-2026-07-02/addendum.md`): FR-22-rij in §1.
**Sprint-status** (`implementation-artifacts/sprint-status.yaml`): epic-19 + 4 stories (backlog) + scope-regel.

## 5. Implementation Handoff

**Scope-classificatie: Moderate** (backlog-uitbreiding, geen fundamentele herplanning). 

Vervolg via de sprint-planning-/story-cyclus (elk in verse context): `bmad-sprint-planning` → per story `bmad-create-story` → `bmad-dev-story` → `bmad-code-review`. De spike (19.1) eerst; 19.2 kan parallel; 19.3/19.4 na de spike.

**Randvoorwaarden:** elke ACC-DB-schrijf en containerherstart vereist expliciete toestemming per geval (database-veiligheid KRITIEK); alle artefacten in het Nederlands.
