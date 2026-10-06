---
title: 'Verhaal 1.3 Herhaalbaar en herleidbaar'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0f20c3f9320e33592ec7fe7bcce5e37894035d3b'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dezelfde aanvraag voor hetzelfde product en beeld draait elke keer opnieuw (dubbel betalen), een uitkomst is na 24 uur uit Redis verdwenen en er is geen vaste plek die zegt welk beeld van een product het huidige is.

**Approach:** Een tabel `logo_scans` (Postgres, Prisma) bewaart elke scan met versies en ruwe detecties 12 maanden. De POST hergebruikt een `done`-scan met gelijke sleutel (`deduplicated: true`), nieuwe poging bij `failed` of `rescan=true` (`attempt` loopt op), een kleine tabel `logo_current_image` houdt per product het huidige beeld bij dat alleen vooruit gaat. De GET leest Redis, dan de tabel.

## Boundaries & Constraints

**Always:**
- Sleutel van een scan: `(product_id, image_hash, model_version, reference_version, attempt)`, uniek. `jobId` blijft de `scanId` (uuid, dus uniek per poging).
- Dedupe geldt alleen met `productId`, binnen 24 uur na het aanvraagtijdstip, voor een `done`-rij van dezelfde afnemer, met gelijke `model_version` en `reference_version`. Een `pending`/`running`/`failed`/`superseded`-rij wordt nooit hergebruikt. Antwoord op een dedupe: 202 `{scanId, deduplicated: true}`; een gewone aanvraag houdt `{scanId}` zonder vlag.
- `model_version` = `LOGO_MODEL_VERSION`; is die niet gezet, dan is gelijkheid niet te bewijzen en volgt geen dedupe. `reference_version` = handtekening van de actieve referentiepool op het moment van de aanvraag (`<aantal>:<laatste createdAt>` uit `reference_logos`); verandert de pool, dan is het een andere versie. (De per-detectie `referenceVersion` in `logoResults` blijft ongemoeid.)
- `attempt` = hoogste bestaande poging voor dezelfde sleutel + 1 (eerste is 1). `rescan=true` (alleen de waarde `true`) slaat dedupe over. Elke aanvraag heeft al een geldige servicesleutel nodig.
- "Vooruit" = aanvraagtijdstip. De aanvrager mag `requestedAt` (ISO-8601) meegeven; ontbreekt het, is het onleesbaar of meer dan 60 s in de toekomst, dan geldt de servertijd. De scan met het latere aanvraagtijdstip wint; bij gelijke tijd blijft de bestaande staan. Wint een nieuwe hash, dan krijgen `pending`/`running`-scans van de oude hash status `superseded`; een scan die al `done` is blijft `done` (de afnemer past `current_image_hash` zelf toe, AD-8). Een aanvraag met een oudere hash dan de huidige krijgt direct `superseded`: geen job, geen herkenning, geen `logoResults`.
- De worker controleert vóór het starten en vóór het opslaan of zijn scan niet `superseded` is geworden. `superseded` is eindstatus in Redis en in de tabel.
- Zonder `productId`: geen dedupe, geen supersede, geen `logo_current_image`-rij; de scan wordt wel in `logo_scans` bewaard (`product_id` NULL).
- GET leest eerst Redis, valt terug op de tabel (zelfde afnemer-controle: een andere afnemer ziet 404). Een tabelrij die `pending`/`running` blijft voorbij `LOGO_SCAN_MAX_MS` leest als `failed`/`timeout`.
- Ruwe detecties 12 maanden: een geplande taak (BullMQ Job Scheduler op een eigen queue `logo-scan-cleanup`, dagelijks 03:40 Europe/Amsterdam, `upsertJobScheduler` zoals de flywheel) verwijdert `logo_scans`-rijen met `created_at` ouder dan 12 maanden.
- Tolerant: ontbreekt de tabel (Prisma `P2021`) of faalt de database, dan valt alles terug op het gedrag van verhaal 1.2 (Redis, geen dedupe) met één waarschuwing voor een ontbrekende tabel en nooit een 500.
- Migratie `0022_add_logo_scans` met `down.sql` in de stijl van 0019–0021, Prisma-schema met `@@map` in snake_case.

**Never:**
- Geen `prisma migrate`/`db push`/`db execute`, geen databaseverbinding, geen netwerk naar ACC of productie, geen push, PR, Zoho of uitrol.
- Geen wijziging van `/detect`, `/recognize`, ghs-review of de bestaande responsvorm voor aanvragen zonder dedupe.

**Uitrol (vast):** de migratie moet VÓÓR de uitrol van deze code op ACC gecontroleerd zijn toegepast, want een push naar `acc` rolt automatisch uit. Zonder tabel draait de code via de tolerantie op verhaal-1.2-gedrag. Om dedupe aan te zetten moet `LOGO_MODEL_VERSION` op ACC gezet zijn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|---|---|---|
| Herhaling | done-rij, zelfde product/hash/versies, < 24 u | 202 `{scanId (oud), deduplicated:true}`, geen job |
| Na failed | enige rij `failed` | nieuwe scan, attempt + 1 |
| Rescan | `rescan=true` | nieuwe scan, attempt + 1, voert uit |
| Nieuwe hash | andere `image_hash` | nieuwe scan; pointer schuift; oude in-flight `superseded` |
| Oudere hash | `requestedAt` < huidige | 202, status `superseded`, geen job |
| Geen productId | veld ontbreekt | als verhaal 1.2 + rij zonder product |
| Tabel ontbreekt | P2021 | verhaal-1.2-gedrag, één waarschuwing |
| Opruimen | rij > 12 maanden | verwijderd; jongere blijft |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma`, `prisma/migrations/0022_add_logo_scans/` — modellen `LogoScan`, `LogoCurrentImage`.
- `apps/api/src/services/pipeline/logo-scan-store.ts` — alle databasetoegang, tolerant.
- `apps/api/src/services/pipeline/logo-scan-flow.ts` — submit (dedupe, attempt, supersede), worker, GET-terugval.
- `apps/api/src/services/pipeline/logo-scan-cleanup.ts` — `purgeExpiredLogoScans`, `registerLogoScanCleanup`; aangeroepen in `main.ts`.
- `apps/api/src/api/v1/logo-scans.ts` — velden `rescan`, `requestedAt`; antwoord met `deduplicated`.
- Tests: `routes/logo-scans-dedupe.test.ts`, `services/logo-scan-cleanup.test.ts`, `helpers/fake-logo-db.ts`.
- Documentatie: API-specificatie van logo-scans (zoek bestaande doc), `data-models-api.md` indien van toepassing.

## Aanpak en beslissingen

Beslissingen die nog geen product-eigenaar zagen: (1) `reference_version` voor dedupe is een poolhandtekening uit Postgres, omdat de versie uit de detecties pas na de scan bestaat; plafond: een wissel van één referentie met gelijk aantal en gelijke laatste datum wordt gemist. (2) 202 bij dedupe (stabiel voor clients). (3) Een al `done` oudere hash blijft `done`. (4) `requestedAt` als optioneel veld is de enige manier om "oudere hash" bij gelijktijdige runs vast te stellen (Q7).

## Tasks & Acceptance

- [ ] Prisma-schema + migratie `0022_add_logo_scans` (+ `down.sql`), alleen schrijven; `prisma generate` zonder verbinding mag, geen ander prisma-commando.
- [ ] `logo-scan-store.ts` (tolerante databasetoegang, P2021 één waarschuwing), aanpassing `logo-scan-flow.ts` (submit, worker, GET), `logo-scan-cleanup.ts` + registratie in `main.ts`, routevelden `rescan`/`requestedAt` in `logo-scans.ts`; status `superseded` ook in de Redis-compare-and-set.
- [ ] Documentatie: API-specificatie van logo-scans bijwerken (velden, `deduplicated`, `superseded`, uitrolvolgorde migratie, `LOGO_MODEL_VERSION`).
- AC: alle tests in `logo-scans-dedupe.test.ts` en `logo-scan-cleanup.test.ts` groen; de bestaande `logo-scans-*.test.ts` ongewijzigd groen; volledige `src/__tests__` groen.

## Verification

Werkmap (alleen hier werken): `/Users/frisovanweelden/Documents/projects/logoRecognition/.claude/worktrees/logo-1-3`. Tests: `cd apps/api && pnpm exec vitest run <bestanden>`; volledig: `pnpm exec vitest run src/__tests__`. Geen databaseverbinding, geen migrate-commando's, geen push, geen commit, geen `git add`. De bestaande testbestanden mogen niet worden aangepast; de rode ATDD-tests (`routes/logo-scans-dedupe.test.ts`, `services/logo-scan-cleanup.test.ts`, `helpers/fake-logo-db.ts`) bepalen de aanroepvorm van `prisma.logoScan`/`prisma.logoCurrentImage` (create, findFirst, findUnique, updateMany, deleteMany; `referenceLogo.aggregate({where:{active:true},_count:true,_max:{createdAt:true}})`). Tabelkolommen (camelCase in Prisma, snake_case in SQL): scanId (uuid, unique), productId?, pipelineId?, imageHash, modelVersion, referenceVersion, policyVersion?, attempt, status, reason?, consumer, logoResults Json?, processingTimeMs?, requestedAt, createdAt; unique over (productId, imageHash, modelVersion, referenceVersion, attempt); aparte tabel `LogoCurrentImage` (productId unique, imageHash, requestedAt). Een bestaande test mockt `core/db` zonder deze delegates: de code moet dan tolerant terugvallen.
