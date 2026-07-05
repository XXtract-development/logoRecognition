# Story 19.3: Keurmerk→etiket-index uit declaraties

Status: done

<!-- Aangemaakt via prepare-sprint (bmad-sprint-planning + create-story-vorm), 2026-07-04. Bron: epics-vliegwiel.md Epic 19 / Story 19.3. -->

## Story

Als **datamanager**
wil ik **een keurmerk→etiket-index uit de declaraties**
zodat **ik per keurmerk weet welke etiketten het gegarandeerd bevatten** (FR-22).

### Afbakening (kritiek)
- **Afhankelijk van 19.1 (toegangsroute + dekkingscijfers) en 19.2 (5/5-velddekking).** Start pas als de spike de route heeft bepaald en de parser volledig is; anders bouw je op onvolledige velden of een onbewezen bron.
- **Idempotent, handmatig seed-script met `--dry-run`** (ARCH-4) — geen job, geen scheduler, geen auto-run bij deploy.
- Leest declaraties via de **catalog-XML** (betrouwbare lezer); niet via de diep-geneste, ongeïndexeerde Mongo-`tradeItems`-vorm.

## Acceptatiecriteria

*(1-op-1 uit epics-vliegwiel.md, Story 19.3)*

1. **Given** het artwork-GTIN-universum en de declaratiebron
   **When** het idempotente indexscript draait (met `--dry-run` die alleen het plan toont)
   **Then** ontstaat een index `{keurmerkcode → [GTIN → etiketbestand(en)]}` + tellingen per code, gelezen via de betrouwbare catalog-XML-lezer, getoetst aan het 951-code-universum.

2. **Given** ARCH-4 (operationele envelope)
   **When** het script wordt opgeleverd
   **Then** is het een handmatig, idempotent seed-script met droge-run; de output staat in beheerde opslag; herdraaien wijzigt niets ongewenst (idempotentie, NFR-4).

## Tasks / Subtasks

- [ ] 1. **GTIN-universum bepalen (AC: 1)** — de set artwork-GTINs (uit de gekozen route van 19.1: media-index of `artwork_imports`).
- [ ] 2. **Declaraties lezen (AC: 1)** — per GTIN via `parseDeclaredMarks` (5/5 velden, na 19.2) de keurmerkcodes ophalen; catalog-XML als bron.
- [ ] 3. **Index + tellingen bouwen (AC: 1)** — `{code → [GTIN → etiketbestand(en)]}` + per-code-tellingen, getoetst aan het 951-universum (`Result_4.xlsx`). Markeer lege/onder-vertegenwoordigde klassen.
- [ ] 4. **Idempotent seed-script + droge-run (AC: 2)** — `--dry-run` toont alleen het plan; output naar beheerde opslag (MinIO/DB, conform bestaande seed-scripts zoals `seed-gold-set.ts`); herdraaien verandert niets ongewenst.
- [ ] 5. **Verificatie** — telling-consistentie met het spike-dekkingsrapport (19.1).

## Dev Notes — Developer Context
- Volgt het patroon van bestaande idempotente seed-scripts (`apps/api/src/scripts/seed-gold-set.ts`, `seed-bootstrap-queue.ts`): pure planning-helpers + `require.main`-guard + `--dry-run`.
- Betrouwbare lezer = catalog-XML (`t3777-declarations.ts`); Mongo `tradeItems` slaat waarden diep-genest + `dontIndex:1` op → niet bulk-queryen.
- Universum-bron: `~/Documents/Result_4.xlsx` (951 codes, 5 GS1-codelijsten).

### Project context reference
- Spike-rapport uit 19.1; geheugen `project_prod_corpus_route`.

## Dev Agent Record

### Agent Model Used
_(in te vullen bij uitvoering)_

## Change Log
- 2026-07-04: aangemaakt via prepare-sprint (Epic 19, correct-course). Taakdetail scherpt aan na de spike (19.1).
