# AC → test-mapping — Story 18.2

Elk acceptatiecriterium (en de kern-subgedragingen uit de story) → de dekkende
geautomatiseerde test(s). Alle mediaserver/prisma/import-loop gemockt; nooit prod/ACC.

## AC1 — terugval-route vult resterende GLN's + werkt de uitvalreden bij; batch-gewijs + CPU-getemperd via `FLYWHEEL_`-envvars

| Deelgedrag | Test(s) |
|---|---|
| Terugval-SELECTIE: alleen het 18.1-restant (gln IS NULL + gezette reden) | `gln-reimport-restant.test.ts` › "runReimport — selectie: alleen het 18.1-restant" (verwerkt exact wat `listRestantGtins` levert; import-run met dat restant). Prod-query `{ gln: null, glnBackfillReason: { not: null } }` in `createProdDeps.listRestantGtins`. |
| Reden-BIJWERKING pad A: gevuld → reden gewist | `gln-reimport-restant.test.ts` › "reden-bijwerking beide paden" (`clearReason('okGtin')`, `resolved=1`) |
| Reden-BIJWERKING pad B: niet-gevuld → nieuwe reden | idem: `setReason('geenGlnGtin','mediaserver-geen-gln')` + `setReason('geenMediaGtin','mediaserver-geen-media')`; unit `reasonForUnresolved` (media→geen-gln; geen media→geen-media) |
| Geen stille uitval (elk restant-record houdt een actuele reden) | `reasonForUnresolved` dekt beide takken; L2-degradatie (discovery-fout → geen-media) |
| Batch-INDELING | `chunkIntoBatches` unit (size 2 → [2,2,1]; size≥len → 1 batch; leeg → []; size<1 → 1 batch) + "batch-dosering" (3 import-runs met juiste batch-inhoud) |
| Batch-TEMPERING (pauze TUSSEN batches, niet erna) | "batch-dosering + pauze-respect (fake timers)" (`sleep` 2× bij 3 batches, met 30000) + "pauzeert niet als pauseMs 0 is" |
| Envvar-DEFAULTS + overrides (conservatief) | `flywheel-config.test.ts` › "GLN-restant-re-import-dosering" (batch 25 / pauze 30000 default; override; pauze 0 toegestaan; ongeldig → default) |
| CPU-getemperd = wachten op run-afronding vóór volgende batch | orkestratie `await deps.runImportBatch(batch)` sequentieel per batch; prod-dep `await runImportLoop(...)` (awaitable tot `completed`) — gedekt door de sequentiële batch-volgorde-assertie (`toHaveBeenNthCalledWith`) |

## AC2 — na de terugval-run toont het dashboard de bijgewerkte dekking + het definitieve restant met redenen

| Deelgedrag | Test(s) |
|---|---|
| Dekkingsgraad-HERMETING (vóór/ná) | `gln-reimport-restant.test.ts` › "reden-bijwerking beide paden" (`coverageAfter` = tweede `coverageTotals`, de HERMETING, niet de projectie) + "idempotente herstart" (`coverageAfter` 1,0) |
| Geen aparte meetlogica — leunt op het 18.1-paneel | Prod-dep `coverageTotals` gebruikt dezelfde tellingen als het bestaande `glnCoverage`-paneel (`getGlnCoveragePanel`, on-read). Het paneel zelf is ongewijzigd en blijft gedekt door `flywheel-gln-coverage.test.ts` (18.1). |

## Aanvullend gedekt (guardrails)

| Gedrag | Test |
|---|---|
| Dry-run = NUL I/O (geen import-run, geen write, geen pauze) | "runReimport — dry-run doet NIETS" |
| Idempotente herstart (leeg restant → niets) | "runReimport — idempotente herstart" |

## Samenvatting

- AC's: 2/2 gedekt met genoemde, in de diff aanwezige tests die het AC-gedrag asserten.
- Geen AC zonder dekkende test → geen waiver nodig.
