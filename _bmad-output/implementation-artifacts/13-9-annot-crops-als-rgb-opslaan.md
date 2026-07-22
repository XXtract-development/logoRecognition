# Story 13.9: Geannoteerde crops als RGB opslaan (upstream-tegenhanger van 13.8)

Status: done

<!-- Nazorg-opvolgpunt #2 uit de RGBA-investigation (2026-07-21). Epic-13, na 13.8. -->

## Story

Als **datamanager**
wil ik **dat met-de-hand-geannoteerde keurmerk-crops meteen als 3-kanaals RGB worden opgeslagen**
zodat **deze crops — de bewezen bron van de RGBA-blokkade in de vliegwiel-regressiepoort — niet langer met een alfakanaal in de opslag belanden**.

### Afbakening
- **Upstream-cleanup, niet-blokkerend:** 13.8 vangt bestaande RGBA-crops al af bij embed-tijd (`generate_embedding` cast naar RGB). Deze story voorkomt dat er NIEUWE RGBA-crops ontstaan via het annotatie-pad.
- Alleen het opslaan van de annotatie-crop (`apps/api/src/api/v1/artwork-pipeline.ts`, `annot_*.png`). Geen migratie, geen herverwerking van bestaande crops.
- **Expliciet NIET in scope:** andere opslagpaden die een ruwe (mogelijk RGBA) upload wegschrijven, zoals `apps/api/src/api/v1/reference-logos.ts` (referentie-logo-upload). Die blijven functioneel afgedekt door 13.8's embed-tijd-cast; een bredere RGB-normalisatie is een aparte afweging.

## Acceptatiecriteria
1. **RGB-opslag.** Given een bron-artwork dat RGBA is (alfakanaal), when een reviewer een crop opslaat, then heeft het opgeslagen `annot_*.png` exact 3 kanalen (RGB), zonder alfakanaal.
2. **RGB-behoud + embedding-consistentie.** Given een reeds-RGB-bron, when de crop wordt opgeslagen, then blijven de RGB-waarden ongewijzigd (removeAlpha is een no-op op RGB), en zijn de RGB-waarden van een RGBA-bron identiek aan wat de ml-side `PIL.convert("RGB")` oplevert (alfakanaal droppen zónder compositing) — zodat een opgeslagen crop embedding-identiek is aan de live-geconverteerde variant.

## Tasks / Subtasks
- [x] 1. `artwork-pipeline.ts`: `.removeAlpha()` invoegen in de sharp-pijplijn vóór `.png()` (AC 1/2).
- [x] 2. **Route-niveau** test in `flywheel-review-redirect.routes.test.ts`: `/annotate` met een RGBA-bronbuffer → assert op de buffer die daadwerkelijk aan `uploadReferenceLogo` wordt meegegeven (`channels === 3`, `hasAlpha === false`) én op de RGB-pixelwaarden (`[200,30,30]`, geen compositing → AC2). Raakt de productiecode: `.removeAlpha()` weghalen maakt de test rood.
- [x] 3. versions.md bijgewerkt; Engelse commit met co-author.
- [ ] 4. Deploy (apps/api) — gated op expliciete go van Friso.

## Dev Notes
- Root: `sharp(buffer).extract(...).png()` behoudt het alfakanaal van RGBA-bron-artwork → RGBA-crop. `.removeAlpha()` laat de alfaband vallen en behoudt RGB — matcht PIL `convert("RGB")` (geen compositing), dus embedding-identiek aan 13.8's live-conversie.
- Bewust `removeAlpha()` (drop alfa) i.p.v. `flatten({background})` (compositing) — omdat 13.8/PIL óók niet compositen; consistentie boven "mooiere" achtergrond.
- [Source: investigation-rgba-goldset-embedding-2026-07-21.md; apps/api/src/api/v1/artwork-pipeline.ts]

## Dev Agent Record
### Agent Model Used
claude-opus-4-8 (orchestrator-directe implementatie; onafhankelijke review).

### Debug Log References
- **Route-test groen:** `flywheel-review-redirect.routes.test.ts` 4/4 passed (3 bestaande + de nieuwe 13.9-test).
- **RED-check (bewijst dekking):** met `.removeAlpha()` uit `artwork-pipeline.ts` verwijderd faalt de nieuwe test op `expect(meta.channels).toBe(3)` (`expected 4 to be 3`); ná herstel weer groen en `git diff` schoon. De test beschermt dus aantoonbaar de productiecode — anders dan de eerste (verwijderde) spiegel-test.
- **Volledige apps/api-suite:** **961 passed / 0 failed / 2 skipped / 37 todo** (83 bestanden). Telling t.o.v. de vorige ronde: −2 (spiegel-test verwijderd) +1 (route-test toegevoegd).
- **Gedrag onafhankelijk gemeten:** RGBA-bron `rgba(200,30,30,α=0.5)` door de productie-pijplijn → 3 kanalen, `hasAlpha=false`, pixel exact `200,30,30` (geen compositing) → embedding-identiek aan de ml-side PIL `convert("RGB")`. RGB-bron blijft ongewijzigd.
### Completion Notes List
- `.removeAlpha()` toegevoegd (AC1/2).
- **Review-remediatie (bevinding 1/3):** de eerste testopzet spiegelde de sharp-pijplijn in de test zelf en bood daardoor géén regressiebescherming (`.removeAlpha()` weghalen liet 'm groen). Vervangen door een route-niveau test die de échte handler draait en assert op de buffer die naar `uploadReferenceLogo` gaat, inclusief pixelwaarden voor AC2.
### File List
- Gewijzigd: `apps/api/src/api/v1/artwork-pipeline.ts`
- Gewijzigd: `apps/api/src/__tests__/api/flywheel-review-redirect.routes.test.ts` (route-niveau AC1/AC2-test)

## Change Log
- 2026-07-22: Story + fix (nazorg #2 uit RGBA-investigation).
