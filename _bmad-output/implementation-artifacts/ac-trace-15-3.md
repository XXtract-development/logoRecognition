# AC → test-traceability — Story 15.3

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). 4 AC's, allemaal gedekt.

## AC1 — batch-detailpagina toont volledig bewijs + toetsenbordnavigatie

| Deel | Test |
|---|---|
| Faalreden, batchvoortgang, kandidatenlijst met statusbadges (master) | `apps/web/src/pages/FlywheelBatchDetailPage.test.tsx` › "toont faalreden, batchvoortgang, kandidatenlijst met badges en het bewijspaneel" |
| Bewijspaneel: scores, declaratieblok, poort-uitkomsten | idem (assert `evidence-scores` 0,94, `evidence-declaration` GTIN, `gate-regression`/`gate-cap`) |
| Kop-service: faalreden + delta + poort-uitkomsten + kandidaat-evidence; 404 | `apps/api/src/__tests__/services/flywheel-batch-detail.test.ts` › "bouwt de kop met faalreden + poort-uitkomsten..." / "gooit BatchDetailNotFoundError..." |
| Route 200/404/ADMIN-only | `apps/api/src/__tests__/api/flywheel-batch-detail.routes.test.ts` › "GET .../batches/:id" (3) |
| Sneltoets pijltjes (kandidaat-navigatie) | web-test › "pijltjestoets → verschuift de selectie naar de volgende kandidaat" |
| Typing-guard (sneltoets inactief in invoerveld) | web-test › "typing-guard: een toets in een invoerveld triggert GEEN beslissing" |
| aria-selected op de kandidatenlijst (UX-DR9) | web-test › "aria-selected staat op de geselecteerde kandidaat" |

## AC2 — afkeuren → rejected + hard-negative via conditional update

| Deel | Test |
|---|---|
| in_batch→rejected conditional + hard-negative met bestaande contentHash (geen /ml/phash) | `flywheel-candidate-decision.test.ts` › "zet in_batch→rejected via conditional update, schrijft hard-negative met de BESTAANDE contentHash" |
| Herbruikt 14.1-aanwasservice (gold-set VALS, bron quarantaine) | idem › "roept de HERBRUIKBARE 14.1-aanwasservice aan" |
| Conditional-race 0 rows → conflict | idem › "conditional-update-race (0 rows) → CandidateConflictError" |
| Route afkeuren 200 + payload | `flywheel-batch-detail.routes.test.ts` › "afkeuren happy path → 200" |
| UI: R keurt af via candidates/:id/decision | web-test › "R keurt af via candidates/:id/decision (afkeuren)" |

## AC3 — vrijgeven → candidate zonder poortlogica; 409 op batch in verwerking

| Deel | Test |
|---|---|
| in_batch→candidate + losgekoppeld | `flywheel-candidate-decision.test.ts` › "zet in_batch→candidate en koppelt de batch los" |
| GEEN poortlogica (geen ml-/hard-negative-/gold-set-schrijf) | idem › "draait GEEN poortlogica: geen ml-client-, hard-negative- of gold-set-schrijf" |
| 409 op kandidaat in een batch in verwerking (pending) | idem › "kandidaat in een batch IN VERWERKING (pending) → CandidateBatchProcessingError (409)" |
| Route 409 batch-in-verwerking + verloren race | `flywheel-batch-detail.routes.test.ts` › "kandidaat in een batch IN VERWERKING → 409" / "verloren conditional-update-race → 409" |
| UI: A geeft vrij via candidates/:id/decision | web-test › "A geeft vrij via candidates/:id/decision (vrijgeven)" |
| Faalpad-toast, kandidaat behoudt te beoordelen | web-test › "faalpad: een falende beslissing toont een toast..." |

## AC4 — batch afsluiten (samenvattingsmodal) + auto-advance

| Deel | Test |
|---|---|
| "Batch afsluiten" disabled tot alles beoordeeld | web-test › "\"Batch afsluiten\" is disabled zolang niet alles beoordeeld is" |
| Actief + samenvattingsmodal (N afgekeurd / M vrijgegeven) | web-test › "\"Batch afsluiten\" wordt actief... en toont de samenvattingsmodal" |
| Bevestigen → closeBatch + terugnavigatie | web-test › "bevestigen in de samenvattingsmodal roept closeBatch aan en navigeert terug" |
| Server: closedAt zodra alles beoordeeld, status blijft quarantined; 409 onbeoordeeld/niet-afsluitbaar; 404 | `flywheel-batch-detail.test.ts` › closeBatch (4) |
| Route close 200/404/409 | `flywheel-batch-detail.routes.test.ts` › "POST .../batches/:id/close" (4) |
| Auto-advance naar volgende onbeoordeelde | web-test › "na een beslissing springt de selectie naar de volgende ONBEOORDEELDE kandidaat" |

## Aanvullend (taak 4.3 undo, taak 5 koppeling)

| Deel | Test |
|---|---|
| Undo afkeuring (hard-negative weg + gold-set self-tombstone + in_batch) | `flywheel-candidate-decision.test.ts` › "afkeuring terugnemen: ..." |
| Undo vrijgave (candidate→in_batch, herkoppeld) + conflict bij worker-claim | idem › "vrijgave terugnemen: ..." / "vrijgave-undo terwijl de worker de kandidaat al claimde → conflict" |
| FlywheelPage koppelt onOpenBatch door (Drawer vervalt) | `apps/web/src/pages/FlywheelPage.test.tsx` › "klik op \"Openen\" navigeert naar /flywheel/batches/:id" |
