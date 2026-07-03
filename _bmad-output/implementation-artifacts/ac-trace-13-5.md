# AC → test-mapping — Story 13.5

Elk acceptatiecriterium heeft ≥1 dekkende geautomatiseerde test. Tests draaien in
`apps/api` (vitest) en `apps/ml-service` (pytest, pure-unit via importlib).

| AC | Kern | Dekkende test(s) |
|----|------|------------------|
| **AC1** | Schaduw-evaluatie zonder mutatie (actief UNION schaduwset) + self-match-guard | `apps/ml-service/tests/unit/test_regression_eval_service.py`: `test_shadow_union_flips_a_match` (UNION-gedrag), `test_self_match_guard_prevents_100pct`, `test_best_similarity_self_match_excluded_by_content_hash`, `..._by_crop_path`, `test_best_similarity_only_same_class` (klasse-scoping). API-zijde: `apps/api/.../flywheel-gate.test.ts` › `schaduw-meting draait met includeShadow=true`. Geen mutatie: de eval-service kent geen write; endpoint doet geen gold-set-read (AD-4). |
| **AC2** | Eenmalige nulmeting als initiële baseline | `flywheel-gate.test.ts` › `resolveBaseline` › `geen passed-batch → nulmeting (includeShadow=false)`; pytest `test_nulmeting_mode_ignores_shadow`. |
| **AC3** | Verse nulmeting bij verouderde baseline | `flywheel-gate.test.ts` › `resolveBaseline` › `verouderde baseline → verse nulmeting`; `flywheel-baseline.test.ts` (marker default false + override). |
| **AC4** | Versie-guard → terug naar candidate + her-embed | `flywheel-gate.test.ts` › `enforceVersionGuard` › `zet kandidaten met afwijkende modelversie terug naar candidate` (conditional update in_batch→candidate) + `geen actief model → guard overgeslagen`. |
| **AC5** | Atomaire promotie binnen tolerantie + baseline vastgelegd + historisch | `flywheel-promotion.test.ts`: `promoveert: ReferenceLogo + embedding-kopie + status→promoted`, `geen kopieerbare embedding → rollback`, `cap vol → geen INSERT`, `conditional-update-race → skipped`, `variantLabel-conventie`, `failed-continues`. `flywheel-gate.test.ts` › `binnen tolerantie → promotie + batch passed + baselineMeasurement`. Tolerantie-grens: `decideTolerance` › `1 verslechterd → promote`, `2 netto → quarantine`, `verbeterde compenseren`, `≥200 → 1pp-regel`. |
| **AC6** | Quarantaine boven tolerantie + delta + meest getroffen klassen + notificatie | `flywheel-gate.test.ts` › `boven tolerantie → quarantined + delta + notificatie, niets gepromoveerd`; `mostAffectedClasses` › sortering aflopend op precisie-daling. |
| **AC7** | Fail-closed bij niet-uitvoerbare meting | `flywheel-gate.test.ts` › `ml-service-fout → quarantined systeem-fout` + `lege gold-set → fail-closed quarantaine`; pytest `test_empty_gold_set`. |

## Config-dekking (drempels/tolerantie-grenzen als env)
`flywheel-config.test.ts` › `Story 13.5 — regressie-gate-config`: defaults
(drempel 0,90 · min-worsened 2 · sample-switch 200 · tolerantie 1pp) + env-overrides.

## Hook in de 13.4-poortflow
`flywheel-promotion-batch.test.ts` › `roept de regressie-poort aan ná de
guardrails` + `slaat de regressie-poort over als de fase al afgerond is
(crash-recovery)` — de `not-run`-placeholder is vervangen door `runRegressionGate`.

## Totaal
- apps/api vitest: 406 passed, 2 skipped (pre-existing). +29 t.o.v. de 377-baseline.
- ml-service pytest (pure-unit): 23 passed (regression_eval 12 + outlier 11).
