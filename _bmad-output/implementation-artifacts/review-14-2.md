# Adversarial self-review — Story 14.2 (gold-set-samenstellingsbewaking)

reviewed_commit: (working tree op epic/vliegwiel-14, vóór done-commit)
verdict: PASS (alle bevindingen critical→low gefixt of afgewogen)

## Scope
- NEW: `apps/api/src/services/flywheel/gold-set-composition.ts`
- EDIT: `apps/api/src/services/flywheel/config.ts` (3 drempel-getters)
- EDIT: `apps/api/src/services/flywheel/types.ts` (`GoldSetCoverageMarking`, `GateResults`-uitbreiding)
- EDIT: `apps/api/src/api/v1/flywheel.ts` (paneel `goldSetComposition`)
- EDIT: `apps/api/src/services/flywheel/promotion-batch.ts` (niet-blokkerende dekkings-markering)
- TESTS: `flywheel-gold-set-composition.test.ts` (nieuw), uitbreiding `flywheel-promotion-batch.test.ts` + `flywheel.routes.test.ts`

## Bevindingen

### Critical
- **C1 — Zou de dekkings-markering de poort kunnen blokkeren?** (AC3, guardrail "markeren ≠ blokkeren").
  Onderzocht: `markGoldSetCoverage` schrijft uitsluitend `gateResults.goldSetCoverage` (een informatief item), muteert nooit de batch-status en beïnvloedt geen fase-uitkomst. De guardrail-loop en `runRegressionGate` draaien onafhankelijk door. Test `markeert NIET-blokkerend: de guardrails en de poort draaien gewoon door` bewijst dit. GEEN blokkade. → OK.
- **C2 — Twee resoluties van "actief"?** (AD-4, guardrail "één resolutie van actief").
  De sub-service resolvet nooit zelf; zowel `getGoldSetComposition` als `findClassesWithoutGoldSetCoverage` gaan via `getActiveGoldSet()` (13.3). Geen eigen `replacedById`-query. → OK.

### High
- **H1 — On-read, geen job/scheduler?** (AC4, AD-6). Geen `upsertJobScheduler`/cron/queue toegevoegd; de berekening hangt aan `GET /overview`. `grep upsertJobScheduler|repeat|cron` over de nieuwe/gewijzigde bestanden: geen hits. → OK.
- **H2 — Migratie-vrij?** Geen schema-wijziging; `git diff` raakt `schema.prisma` en `migrations/` niet. `GoldSetCoverageMarking` leeft in de bestaande `gateResults` JSONB (AD-13). → OK.
- **H3 — Deling door nul bij lege set?** `echtRatio`/`share` guarden op `size > 0`; lege set geeft expliciet `set-leeg`-signaal i.p.v. NaN/crash. Test dekt dit. → OK.

### Medium
- **M1 — Idempotentie van de markering bij crash-recovery.** De markering draait alleen als `gateResults.goldSetCoverage` ontbreekt; een hervatte batch herberekent niet. Test `is idempotent ... (crash-recovery)`. → OK.
- **M2 — Best-effort: markering mag de poort niet breken.** `markGoldSetCoverage` staat in een try/catch; een fout logt en laat de poort doorgaan. Test `een falende dekkings-markering breekt de poort niet`. → OK.
- **M3 — Grens-inclusiviteit (klasse exact 20%, ECHT exact 60%/90%).** Bewust `>`/`<` i.p.v. `>=`/`<=`; expliciet gedocumenteerd in docblocks én getest (drie grens-tests). → OK.

### Low
- **L1 — Volledige vs cropOnly set.** Bewust de VOLLEDIGE actieve set gemeten (het meetinstrument als geheel), niet `cropOnly`; gedocumenteerd in de docblock en geasserteerd (`getActiveGoldSet` zonder argument). → OK.
- **L2 — Contract-stabiliteit voor 15.2.** Paneel-sleutels gedocumenteerd als stabiel contract in service- en route-docblock. → OK.
- **L3 — Deterministische output.** Top/bottom-lijsten en signalen hebben een expliciete tie-break (count dan alfabetisch); snapshot-vriendelijk. → OK.
- **L4 — Geen dode code/debug-statements.** Geen `console.*`; alleen `createLogger`-gebruik conform patroon. → OK.

## Conclusie
Alle bevindingen (critical t/m low) afgevangen of afgewogen; geen open punten. verdict: PASS.
