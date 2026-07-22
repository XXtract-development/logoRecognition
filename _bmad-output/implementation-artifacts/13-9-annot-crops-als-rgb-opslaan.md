# Story 13.9: Geannoteerde crops als RGB opslaan (upstream-tegenhanger van 13.8)

Status: review

<!-- Nazorg-opvolgpunt #2 uit de RGBA-investigation (2026-07-21). Epic-13, na 13.8. -->

## Story

Als **datamanager**
wil ik **dat met-de-hand-geannoteerde keurmerk-crops meteen als 3-kanaals RGB worden opgeslagen**
zodat **de opslag consistent RGB is en downstream-verwerking (herkenning, vliegwiel-eval) nooit meer op een alfakanaal struikelt**.

### Afbakening
- **Upstream-cleanup, niet-blokkerend:** 13.8 vangt bestaande RGBA-crops al af bij embed-tijd (`generate_embedding` cast naar RGB). Deze story voorkomt dat er NIEUWE RGBA-crops ontstaan.
- Alleen het opslaan van de annotatie-crop (`apps/api/src/api/v1/artwork-pipeline.ts`). Geen migratie, geen herverwerking van bestaande crops.

## Acceptatiecriteria
1. **RGB-opslag.** Given een bron-artwork dat RGBA is (alfakanaal), when een reviewer een crop opslaat, then heeft het opgeslagen `annot_*.png` exact 3 kanalen (RGB), zonder alfakanaal.
2. **RGB-behoud + embedding-consistentie.** Given een reeds-RGB-bron, when de crop wordt opgeslagen, then blijven de RGB-waarden ongewijzigd (removeAlpha is een no-op op RGB), en zijn de RGB-waarden van een RGBA-bron identiek aan wat de ml-side `PIL.convert("RGB")` oplevert (alfakanaal droppen zónder compositing) — zodat een opgeslagen crop embedding-identiek is aan de live-geconverteerde variant.

## Tasks / Subtasks
- [x] 1. `artwork-pipeline.ts`: `.removeAlpha()` invoegen in de sharp-pijplijn vóór `.png()` (AC 1/2).
- [x] 2. Test: sharp-pijplijn op een synthetische RGBA-buffer → output `metadata().channels === 3`; RGB-bron blijft 3 kanalen.
- [ ] 3. versions.md; Engelse commit. Deploy (apps/api) gated op go Friso.

## Dev Notes
- Root: `sharp(buffer).extract(...).png()` behoudt het alfakanaal van RGBA-bron-artwork → RGBA-crop. `.removeAlpha()` laat de alfaband vallen en behoudt RGB — matcht PIL `convert("RGB")` (geen compositing), dus embedding-identiek aan 13.8's live-conversie.
- Bewust `removeAlpha()` (drop alfa) i.p.v. `flatten({background})` (compositing) — omdat 13.8/PIL óók niet compositen; consistentie boven "mooiere" achtergrond.
- [Source: investigation-rgba-goldset-embedding-2026-07-21.md; apps/api/src/api/v1/artwork-pipeline.ts]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8 (orchestrator-directe implementatie; onafhankelijke review).
### Completion Notes List
- `.removeAlpha()` toegevoegd (AC1/2). Test bevestigt 3-kanaals output op RGBA-bron + no-op op RGB.
### File List
- Gewijzigd: `apps/api/src/api/v1/artwork-pipeline.ts`
- Nieuw: `apps/api/src/__tests__/services/artwork-crop-rgb-13-9.test.ts`

## Change Log
- 2026-07-22: Story + fix (nazorg #2 uit RGBA-investigation).
