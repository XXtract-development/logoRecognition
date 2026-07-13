# Story 12.10 — AC → Test Trace

Autonome deliverable (permission-gated stappen NIET uitgevoerd — zie onder). Status
op de branch: `review` (niet `done`).

| AC | Dekking | Test(s) |
|----|---------|---------|
| AC1 (backfill zet field_type/gs1_field correct; NutriScore→NutritionalScore etc.) | Gedekt (code-logica + plan); **live ACC-toepassing NIET uitgevoerd (permission-gate)** | `apps/api/src/__tests__/scripts/backfill-reference-logo-field-type.test.ts` — "een echte NutriScore-crop...", "een DietType-crop (VEGAN)...", "een rij die al correct staat blijft skip-unchanged" |
| AC2 (ambigue codes: primaire regel of "handmatige beslissing nodig", geen stille gok) | Gedekt | `apps/api/src/__tests__/services/field-type-mapping.test.ts` — "NUTRISCORE_A... specifiek wint... WEL gezet", "FODMAP idem", "een code in twee specifieke codelijsten wordt gerapporteerd maar NIET gezet"; `apps/api/src/__tests__/scripts/backfill-reference-logo-field-type.test.ts` — `ambiguousItems`-test |
| AC3 (registratie-pad zet juiste field_type/gs1_field bij create) | Gedekt | `apps/api/src/__tests__/api/reference-logos.routes.test.ts` — "should set field_type/gs1_field from the code mapping on create (AC3)"; `apps/api/src/__tests__/services/flywheel-promotion.test.ts` — "zet field_type/gs1_field uit de code-mapping op de promotie-INSERT (AC3)" |
| AC4 (per-categorie-dekkingsteller, read-only) | Gedekt | `apps/api/src/__tests__/services/flywheel-coverage-overview.test.ts` (pure aggregatie + `getCoveragePanel` met gemockte Prisma/MinIO); `apps/api/src/__tests__/services/flywheel-overview-compose.test.ts` (wiring in `composeOverview`) |
| AC5 (a: ambigu-afleiding → rapport; b: dry-run/idempotentie; c: registratie-pad; d: teller-aggregatie) | Gedekt (a/b/c/d elk met eigen test, zie boven) | zie AC1-4 rijen + idempotentie-test in backfill-test |
| AC6 (ACC-toepassing + na-verificatie consistent met teller-output) | **NIET uitgevoerd — permission-gated** (live ACC-diagnose, `--apply`, deploy zijn per-geval-toestemming van Friso, niet verleend in deze run) | n.v.t. — blijft `pending-permission` in `blocked_stories` |

## Gates
- `tsc --noEmit` (apps/api): 0 errors.
- `npx vitest run` (apps/api, volledige suite): 907 passed, 2 skipped, 37 todo, 0 failed.
- `eslint` op alle nieuwe/gewijzigde bestanden: 0 errors, 0 warnings.
- ml-service: NIET geraakt (geen enkel bestand onder `apps/ml-service/` in de diff) → ml-pytest niet vereist.

## Permission-gated stappen (NIET uitgevoerd, zoals opgedragen)
1. Live ACC read-only diagnose (welke t3777-codes staan op ACC + welke zijn AMBIGU in de echte data).
2. De backfill `--apply` tegen ACC.
3. De deploy van de runtime-wijzigingen (registratie-fix + coverage-paneel).

Deze drie staan als `pending-permission` in `sprint-status.yaml` (`blocked_stories`).
