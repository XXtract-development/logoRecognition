# ATDD-checklist verhaal 1.3 (Herhaalbaar en herleidbaar)

Stack: backend (vitest, Prisma en Redis gemockt, geen databaseverbinding). Rode fase op 2026-10-06: `logo-scans-dedupe.test.ts` en `logo-scan-cleanup.test.ts` falen omdat `logo-scan-store`, `logo-scan-cleanup`, de tabellen `logo_scans`/`logo_current_image` en de routevelden `rescan`/`requestedAt` ontbreken. Hulpmiddel: `helpers/fake-logo-db.ts` (geheugen-vervanger voor `prisma.logoScan` en `prisma.logoCurrentImage`).

| AC | Tests |
|---|---|
| AC1 zelfde product+beeld+versies na `done`: zelfde scanId, `deduplicated:true`, geen job, < 2 s | AC1 (8): hergebruik, geen vlag bij eerste aanvraag, pending niet hergebruikt, nieuwe hash, ander product/afnemer/modelversie/referentiepool, onbekende modelversie, ouder dan 24 u, zonder productId |
| AC2 `failed` nooit hergebruikt; rescan verhoogt `attempt` en voert echt uit | AC2 (4): failed, rescan=true, sleutel en vreemde waarde, uniek op sleutel + jobId=scanId |
| AC3 `current_image_hash` alleen vooruit; oudere hash `superseded` | AC3 (5): eerste scan zet pointer, nieuwere hash + worker voert oude niet uit, eigen `requestedAt` ouder, onbruikbare/toekomstige `requestedAt`, zelfde hash opnieuw |
| AC4 tabel bewaart uitkomst; GET Redis dan tabel | AC4 (4): done-rij met herleidbare velden, failed-rij, GET-terugval + 404 andere afnemer, hangende rij → timeout |
| AC4 12 maanden + geplande opruiming | cleanup (3): alleen > 12 maanden weg, lege/ontbrekende tabel, scheduler + worker op eigen queue |
| Tolerantie: tabel ontbreekt (P2021) | tolerance (2): terugval op verhaal 1.2 met één waarschuwing; andere databasefout ook geen 500 |
| Bestaande routes ongewijzigd | de bestaande `logo-scans-*.test.ts` blijven ongewijzigd groen |
