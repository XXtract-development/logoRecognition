# Adversarial Review — Story 13.7 (uuid=text-fix promotielus-guardrails)

reviewed_commit: df5ba5b333eab2d51a199d1b58345a9cee9ce04b
verdict: PASS

> Scope: `git diff acc..df5ba5b`. De finalisatie-commit (epic-HEAD) voegt bovenop
> `df5ba5b` uitsluitend dit reviewrapport, de retrospective en de status-flip naar
> `done` toe — géén code-/testwijziging. Alle beoordeelde code en tests zitten in
> `df5ba5b` en zijn ongewijzigd op epic-HEAD aanwezig.

## Diff-scope (één repo: logoRecognition)

| Bestand | Aard |
|---------|------|
| `apps/api/src/services/flywheel/guardrails.ts` | fix (2 regels: `IN (${Prisma.join})` → `= ANY(${...}::uuid[])`) |
| `apps/api/src/__tests__/integration/flywheel-guardrails-uuid.itest.ts` | nieuw — pg-regressietest |
| `apps/api/vitest.integration.config.ts` | nieuw — pg-integratieconfig (geen Prisma-mock) |
| `apps/api/scripts/run-pg-integration-tests.sh` | nieuw — container-lifecycle + migrate + run |
| `apps/api/package.json` | nieuw script `test:integration` |
| `versions.md`, `ac-trace-13-7.md`, story `.md`, `sprint-status.yaml` | bookkeeping |

## Sweep (AC2)

`grep Prisma.join / IN (${ / = ANY / ::uuid` over `apps/api/src/services/flywheel/`:
- Enige twee uncast uuid-vergelijkingen waren `guardrails.ts:432` en `:538` — beide gefixt.
- `guardrails.ts:456` `= ANY(${CLONE_GAP_SOURCES})` vergelijkt de **text**-kolom `rl.source` met een text[] → correct zonder cast.
- Overige raw SQL (`gate.ts:369`, `guardrails.ts:444`, `reembed.ts:107/111`, `promotion.ts:203/206`, `nomination.ts:244`) cast al `::uuid`/`::vector`.
- Overige `$queryRaw` (`mismatch-workload.ts`, `overview/cohort-trend.ts`, `overview/mismatch-trends.ts`) bevatten geen id-lijst-vergelijking tegen een uuid-kolom.
- Na de fix: `grep Prisma.join src/services/flywheel/` = NONE; `Prisma`-import blijft in gebruik (`Prisma.sql`/`Prisma.empty`). Geen dode import.

## Bevindingen

| # | Bestand:regel | Bevinding | Severity | Resolutie |
|---|---------------|-----------|----------|-----------|
| 1 | guardrails.ts:432/:538 | Query-betekenis: `x IN (a,b,c)` ≡ `x = ANY(ARRAY[a,b,c])`; membership-semantiek identiek. Beide call-sites guarden al op lege lijst (`otherSurvivors.length > 0` / `candidateIds.length === 0 → return`); `= ANY(empty::uuid[])` matcht bovendien veilig niets. Geen gedragswijziging. | INFO | Geen actie — bevestigd correct |
| 2 | run-pg-integration-tests.sh | Secrets: alleen throwaway-creds (`postgres/postgres`) op een door Docker toegewezen poort; geen ACC/prod-DSN, geen `.env` gecommit. `DATABASE_URL` runtime-geconstrueerd. | INFO | Geen actie — geen secret-lek |
| 3 | run-pg-integration-tests.sh | Concurrency/cleanup: containernaam met `$$` (uniek per run), `--rm` + `trap cleanup EXIT`; rol-creatie idempotent (`IF NOT EXISTS`); test-seed idempotent (`DELETE ... WHERE t3777_code = ...` in beforeAll). | INFO | Geen actie |
| 4 | itest PRE-fix-subtest | De pre-fix-vorm wordt inline gereconstrueerd (niet automatisch gekoppeld aan de productie-query). Bewust: documenteert de 42883-regressieklasse en bewijst dat de test de bug kán vangen. | LOW | Geaccepteerd — waarde > kosten; geen fix |
| 5 | root `package.json` `test:integration` verwijst naar niet-bestaande `test:api:integration` | Pre-existing (niet door 13.7 geïntroduceerd); buiten scope. De apps/api-scoped `test:integration` is wél correct toegevoegd. | INFO (pre-existing) | Buiten scope — niet gewijzigd |

Geen bevindingen ≥ medium. Geen critical/high/medium.

## Acceptance-audit per AC

- **AC1** — Beide query's casten uuid: PASS (pg-test POST-fix groen; diff toont `= ANY(${...}::uuid[])`).
- **AC2** — Geen resterende uncast uuid-vergelijking: PASS (sweep hierboven; enige 2 plekken gefixt, rest verantwoord).
- **AC3** — Postgres-niveau regressietest (pre-fix faalt 42883, post-fix slaagt): PASS (3/3 tests, pre-fix `rejects.toThrow`).
- **AC4** — Bestaande suite groen, gedrag ongewijzigd: PASS (907 passed / 2 skipped / 37 todo; `tsc --noEmit` groen; `.itest.ts` buiten default-include).
- **AC5** — Deploy + ACC-drain: GATED-WAIVER (ACC-write pending expliciete go van Friso; geen ACC-actie uitgevoerd). Geen geautomatiseerde test — ops-criterium.

## Fix-log

Geen fixes vereist: verdict PASS op `df5ba5b` bij eerste review (bevindingen ≤ LOW, alle geaccepteerd/verantwoord). Geen re-review-iteratie nodig.
