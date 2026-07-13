# Story 12.10 — Adversarial Review

reviewed_commit: d04a1804343b24bc59601e39363f790ab7413ca0
verdict: PASS
diff_scope: apps/api/src (13 files: 6 new, 7 modified) + 3 _bmad-output docs + versions.md — ml-service niet geraakt

## Bevindingen (severity, bestand:regel, gefixt)

| Severity | Bestand:regel | Bevinding | Status |
|---|---|---|---|
| LOW | `scripts/backfill-reference-logo-field-type.ts` (main) | 3x `eslint-disable no-console` overbodig (no-console niet actief in api-lint-config) — ruis | GEFIXT (verwijderd, `eslint` 0 warnings) |
| INFO | `services/field-type-mapping.ts` | Code-lijsten (DietType/GHS/ConsumerUsage/NutriScore) zijn een handmatige spiegeling van `apps/web/src/data/spoor-codes.ts` i.p.v. een gedeeld package (`packages/shared` bestaat, wordt door geen enkele app gebruikt) | Geaccepteerd, gemotiveerd in bestandsheader + Completion Notes — cross-package wiring is een aparte, grotere wijziging buiten de scope van deze story. Risico: drift als spoor-codes.ts wijzigt zonder deze file bij te werken — comment wijst daar expliciet op |
| INFO | `overview/coverage.ts` | `readByFieldType`-join veronderstelt dat alle actieve refs van dezelfde t3777-code hetzelfde `field_type` dragen; vóór de (gated) backfill kan dat nog inconsistent zijn | Geaccepteerd — inherent aan een teller die vóór de backfill draait; wordt correct zodra de backfill is toegepast, geen codewijziging nodig |

Geen CRITICAL/HIGH/MEDIUM bevindingen.

## Dimensie-checklist
- **Cross-story-consistentie:** `REAL_CROP_SOURCES` (Story 19.9, `bootstrap-run.ts`) hergebruikt i.p.v. gedupliceerd — enige wijziging aan een bestaand ongerelateerd bestand is de `export`-toevoeging (geen gedragswijziging).
- **Regressies:** volledige api-vitest 907 passed/2 skipped/0 failed (was 882 passed/1 flaky-fail vóór de wijziging, geverifieerd via `git stash`/`git stash pop` dat de flaky timeout pre-existing en ongerelateerd is).
- **Integratiegrenzen:** registratie-pad (curatie-upload + promotie) en het overview-paneel raken geen ML-service-contract, geen storage-padstructuur (`reference-logos/{code}/{variant}.{ext}` ongewijzigd).
- **Deployment-volgorde:** de registratie-fix (Task 3) en de backfill (Task 2) zijn onafhankelijk van elkaar veilig te deployen/toepassen in willekeurige volgorde — geen van beide breekt zonder de ander; aanbevolen volgorde voor de (gated) permissie-stap: deploy eerst, dan backfill, zodat geen nieuwe creates tussentijds nog de oude default-only registratie raken.
- **Security/secrets:** geen nieuwe secrets/endpoints/auth-oppervlak (coverage is een bestaand overview-paneel, zelfde `optionalAuth`-hook als de rest van `/flywheel/overview`).
- **Concurrency/idempotency:** backfill per-rij `SELECT ... FOR UPDATE` + conditionele UPDATE (concurrency-guard); idempotentie unit-getest (plan → simuleer apply → herplan = 0 updates).
- **Performance:** coverage-paneel is 2x `groupBy` + 1 MinIO-read, vergelijkbare kost als de bestaande `class-caps`/`kpi`-panelen; backfill is O(aantal actieve refs) individuele transacties (~241 op ACC vandaag) — geen probleem op deze schaal.
- **Ongebruikte code:** geen.
- **Ontbrekende tests:** geen — zie `12-10-ac-trace.md` voor de volledige AC→test-mapping.
- **Afwijkingen van architectuur/AC's:** geen schema-migratie, geen model/gate/harvest/conditie-C/resolveSeedPath-wijziging (buiten scope, zoals vereist).

## Acceptance-audit (per AC)
Zie `_bmad-output/implementation-artifacts/12-10-ac-trace.md` voor de volledige AC→test-tabel. AC6 (live ACC-toepassing + na-verificatie) is NIET uitgevoerd — permission-gated, expliciet zo gerapporteerd, geen stille aanname van "done".

## Fix-log
- `scripts/backfill-reference-logo-field-type.ts`: 3x overbodige `eslint-disable no-console` verwijderd (commit d04a1804343b24bc59601e39363f790ab7413ca0, meegenomen vóór de initiële commit van dit bestand — geen aparte fix-commit nodig).
