---
story: "1.3 Herhaalbaar en herleidbaar"
branch: feat/logo-scan-dedupe
date: 2026-10-06
gate: CONCERNS
---

# Traceability: Verhaal 1.3

Gate: **CONCERNS**. Alle vier criteria zijn gedekt door tests met een in-memory vervanger van Prisma en een gemockte Redis en queue. Er is nergens tegen een echte database getest en de migratie is niet toegepast (bewust: geen databaseverbinding); daardoor staan G1 en G2 open.

Testrun (VERIFIED, `pnpm exec vitest run src/__tests__` in apps/api): 110 bestanden groen (9 overgeslagen, bestaand), 1578 tests groen (voor de wijziging 1542). Nieuw: 30 tests in `logo-scans-dedupe.test.ts`, 5 in `logo-scan-cleanup.test.ts`, 1 in `logo-scans-wiring.test.ts`. Type-check: `tsc --noEmit` schoon na `prisma generate` (zonder verbinding, alleen in de lokale `node_modules`).

| # | Criterium | Dekking | Tests |
|---|---|---|---|
| AC1 | `done`-scan met zelfde product, hash, modelversie en referentieversie: zelfde `scanId`, `deduplicated: true`, binnen 2 s | VOLLEDIG (gemockt) | dedupe "same product + image + versions after a done scan" (ook < 2 s en geen nieuwe job); "no deduplicated flag on a first request"; "pending not reused"; "new image hash"; "another product, consumer, model version, reference pool"; "unknown model version"; "older than 24 hours"; "without productId"; "another signal word or category" |
| AC2 | `failed` nooit hergebruikt; opnieuw scannen verhoogt `attempt` en voert echt uit | VOLLEDIG (gemockt) | "a failed scan is not reused ... new attempt that really runs"; "rescan=true after a done scan"; "rescan needs a valid key; other value is no rescan"; "rows unique on (product, hash, model, reference, attempt); jobId = scanId" |
| AC3 | Per product één `current_image_hash` dat alleen vooruit gaat; oudere hash `superseded` | VOLLEDIG (gemockt) | "first scan sets current image"; "newer hash moves pointer; in-flight scan superseded and does not run"; "own requestedAt older: superseded at once"; "unusable or far-future requestedAt"; "re-sending current hash"; "same requestedAt, other hash: superseded"; "same millisecond keeps arrival order"; "GET reports superseded while Redis says pending"; "superseded while it runs"; "failed enqueue does not move the pointer" |
| AC4a | Tabel `logo_scans` bewaart uitkomst en ruwe detecties; GET Redis dan tabel | VOLLEDIG (gemockt) | "finished scan stored with traceable fields"; "failed scan stored"; "GET falls back to the table, other consumer 404"; "pending row past max time reads failed/timeout"; "done result not overwritten by read-time timeout" |
| AC4b | 12 maanden bewaard; geplande taak ruimt op | VOLLEDIG (gemockt) | cleanup: "only rows older than 12 months"; "stale current-image pointers"; "failing database fails the job"; "empty or missing table"; "scheduler 40 3 * * * Europe/Amsterdam on own queue + worker purges"; wiring: "main.ts starts the cleanup scheduler" |
| AC4c | De migratie valt onder de normale back-up | NIET TESTBAAR | Tabel staat in dezelfde Postgres-database als de bestaande tabellen (migratie 0022 + `down.sql`); back-up is infrastructuur |
| Tol. | Tabel ontbreekt (P2021) of database stuk: terugval op verhaal 1.2, één waarschuwing, geen 500 | VOLLEDIG (gemockt) | tolerance (2); de bestaande `logo-scans-*.test.ts` mocken `core/db` zonder deze tabellen en blijven ongewijzigd groen |
| Reg. | Bestaande routes ongewijzigd | GEDEKT | logo-scans-flow, -gs1, -auth, -wiring ongewijzigd groen; `/detect`, `/recognize`, ghs-review in de volledige run groen |

## Gaten

- **G1 (open):** de Prisma-aanroepen (`not`, `in`, `lt`, de P2002-herhaling, de unieke sleutel) en de migratie-SQL zijn alleen tegen een zelfgeschreven vervanger getoetst. Een kolom- of filterverschil blijft tot de eerste ACC-run onzichtbaar. Sluiten: migratie op een wegwerp-Postgres toepassen en één integratietest draaien (niet gedaan: geen databaseverbinding toegestaan).
- **G2 (open):** de migratie is niet uitgevoerd. Zonder tabel draait de code via de tolerantie op verhaal-1.2-gedrag, dus dedupe is dan stil uit.
- **G3 (plafond):** `referenceVersion` voor dedupe is een poolhandtekening (aantal + laatste datum) bij de aanvraag; de wissel van één referentie met gelijk aantal en gelijke laatste datum wordt gemist. De worker kan later met een nieuwere pool draaien dan de opgeslagen versie.
- **G4 (open):** zonder `LOGO_MODEL_VERSION` op ACC is er geen dedupe (bewust: gelijkheid niet te bewijzen). Instellen vóór acceptatie.
- **G5:** geen test op twee echt gelijktijdige aanvragen over meerdere API-instanties; de admissie is per instantie serieel, de tijdstempel per instantie strikt stijgend.

## Besluit

CONCERNS: bouwen en samenvoegen mogen door. G2 sluit met de gecontroleerde migratie vóór uitrol, G1 bij de eerste run tegen een echte Postgres, G4 met het zetten van `LOGO_MODEL_VERSION`.
