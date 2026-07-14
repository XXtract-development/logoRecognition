# Story 12.20: Duidelijke weergave van de letterloze Nutri-Score-placeholder

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Gevraagd door Friso tijdens de Nutri-Score review-ronde (2026-07-14): de kale code 'NUTRISCORE' ziet er uit als een kapotte code. -->

## Story

Als **reviewer aan het reviewstation**,
wil ik dat een letter-onafhankelijk Nutri-Score-item niet de rauwe, niet-bestaande code `NUTRISCORE` toont maar een duidelijk "kies de letter"-label met uitleg,
zodat ik meteen snap dat ik de juiste letter (A–E) moet toewijzen in plaats van te denken dat de code kapot is.

## Context / Probleem

De vorm-gebaseerde oogst (Story 12.12, `queue_harvest_nutriscore.py` → `PROVISIONAL_UNKNOWN = "NUTRISCORE"`) tagt een gevonden Nutri-Score-logo met de **kale code `NUTRISCORE`** wanneer hij de vorm herkent maar de letter niet bepaalt — de reviewer wijst de letter toe via de relabel-picker. Maar de review-UI toonde die placeholder als de rauwe code `NUTRISCORE`, wat leest als een kapotte/niet-bestaande keurmerkcode (bevestigd door Friso). Het is geen echt t3777-keurmerk en wordt nooit als referentie opgeslagen (0 refs geverifieerd op ACC).

## Acceptance Criteria

1. **Duidelijk label.** Een item met code `NUTRISCORE` (letterloos, nog niet gerelabeld) toont in de review-deck het label **"Nutri-Score — kies de letter"** i.p.v. de rauwe code `NUTRISCORE`.
2. **Uitleg-hint.** Bij zo'n item verschijnt een korte hint die uitlegt: vorm herkend, letter nog niet bepaald → kies A–E via "Ander keurmerk koppelen", of wijs af als die letter al gedekt is.
3. **Geen valse Benelux-tag.** De Benelux-tag (die op codes matcht) verschijnt niet op het placeholder-label.
4. **Echte codes ongewijzigd.** Een echte `NUTRISCORE_A..E` (of ander keurmerk) toont gewoon de code zonder hint; na relabelen van de placeholder naar een echte letter vervalt het label/hint.
5. **Alleen weergave.** `shownCode` (gebruikt voor referentie-URL, relabel-picker, declared-badge, logica) verandert NIET; puur de getoonde tekst.

## Tasks / Subtasks

- [x] Task 1 — Herken-helper (AC1/AC5)
  - [x] `apps/web/src/data/nutriscore.ts`: `LETTERLESS_NUTRISCORE = 'NUTRISCORE'` + `isLetterlessNutriscore(code)`.
- [x] Task 2 — Deck-weergave (AC1-4)
  - [x] `MobileReviewDeck`: `letterless`/`codeLabel` afgeleid van `shownCode` (alleen als niet gerelabeld); label i.p.v. rauwe code; Benelux-tag onderdrukt bij placeholder; oranje hint-blok (`deck-letterless-hint`).
- [x] Task 3 — Tests (AC1-5)
  - [x] Helper-unittest (`nutriscore.test.ts`).
  - [x] Deck-tests: placeholder → label + hint, geen rauwe code; echte code → code, geen hint.
- [ ] Task 4 — ACC-verificatie na deploy (permission-gated).

## Dev Notes

### Huidige toestand (gelezen)
- `apps/ml-service/app/services/queue_harvest_nutriscore.py:86` `PROVISIONAL_UNKNOWN = "NUTRISCORE"` — bron van de placeholder.
- `apps/web/src/components/review/MobileReviewDeck.tsx:838` toonde `{shownCode}` rauw. `ArtworkReviewItemCard.tsx` toont óók de code maar is **nergens geïmporteerd** (dood) → niet aangeraakt.
- ACC-diagnose (2026-07-14): kale `NUTRISCORE` bestaat als review-placeholder (11 items: 10 rejected + 1 open), 0 referenties. GTIN 00000023265134 had de placeholder naast een al-geregistreerde `NUTRISCORE_A` (duplicaat) — vandaar de "wijs af als al gedekt"-uitleg.

### Bewust NIET in scope
- De backend blijft de placeholder `NUTRISCORE` gebruiken als bucket (12.12-ontwerp: mens kiest de letter). Dit is puur een UI-leesbaarheidsslag; de relabel→`NUTRISCORE_<letter>`-flow (12.14) is ongewijzigd.

### Testing standards
- Frontend Vitest/RTL. Gates: tsc 0, volledige web-vitest 160 passed/0 failed (27 files).

### References
- [Source: apps/web/src/components/review/MobileReviewDeck.tsx#codeLabel, #deck-letterless-hint]
- [Source: apps/web/src/data/nutriscore.ts]
- [Source: apps/ml-service/app/services/queue_harvest_nutriscore.py#PROVISIONAL_UNKNOWN]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m]

### Completion Notes List

- Frontend-only, weergave-slag; geen backend/DB-wijziging. tsc 0; web-vitest 162 passed/0 failed (27 files).

### Adversarial review (2026-07-14) — PASS na remediatie

Geen HIGH; 1 MEDIUM + 3 LOW, allemaal verwerkt:
- **MEDIUM — picker pinde de rauwe placeholder.** `pickPred=cur.t3777Code='NUTRISCORE'` zat in het codes-universum → de relabel-picker bood/pinde de kale `NUTRISCORE` bovenaan aan (precies waar de hint naartoe stuurt), en selecteren zou 'm als `assignedCode` zetten → rauwe code terug mét "(gecorrigeerd)". **Fix:** letterloze placeholder uit `codes` gefilterd (`isLetterlessNutriscore`) → nooit meer aangeboden/gepind. Test toegevoegd.
- **LOW — overzicht-drawer lekte de rauwe code** (img-alt + 2 tekstlabels). **Fix:** gedeelde `labelForCode`-helper hergebruikt in de drawer.
- **LOW — declared-badge gaf misleidend "niet gedeclareerd" op de placeholder** (`declared.codes` bevat `NUTRISCORE_<letter>`, nooit de kale code). **Fix:** badge onderdrukt bij `letterless`.
- **LOW — testgat na-relabel-transitie (AC4).** **Fix:** test toegevoegd (relabel → label wordt echte code, hint verdwijnt); plus test dat de picker de placeholder niet aanbiedt.
- Bevestigd: `shownCode` blijft overal de bron voor logica (refSrc/declared/picker-highlight/sortering); dode `ArtworkReviewItemCard` terecht niet aangeraakt; toasts interpoleren de code niet.

### File List

- apps/web/src/data/nutriscore.ts (NEW)
- apps/web/src/data/nutriscore.test.ts (NEW)
- apps/web/src/components/review/MobileReviewDeck.tsx (UPDATE — label + hint)
- apps/web/src/components/review/MobileReviewDeck.test.tsx (UPDATE — 12.20 tests)
