# Adversarial self-review — Story 13.3 (Gold-set naar beheerde opslag)

reviewed_commit: (pre-commit, working tree)
verdict: PASS (na fixes hieronder)

Checklist: alle AC geïmplementeerd · conventies gevolgd, anti-patterns vermeden ·
graceful degradation · geen secrets · geen dode code/debug-statements.

## Bevindingen per severity

### CRITICAL
- Geen.

### HIGH
- **H1 — Idempotentie moet ook DB-writes overleven, niet alleen plan-logica.**
  Risico: als de dedup enkel binnen de run werkt maar niet tegen bestaande
  rijen, plant een tweede run duplicaten. → GEVERIFIEERD end-to-end tegen de
  lokale DB: run 1 = 303 inserts, run 2 = 0 inserts, 303 overgeslagen. Dedup
  leest bestaande rijen via `loadExistingKeys()` + `dedupKeyForExisting()` die
  de plan-sleutels exact spiegelt (round-trip-test dekt dit). OPGELOST/bevestigd.

- **H2 — Immutability-guard mag geen loophole laten (Task 2.3).**
  De service mag geen update-op-inhoud of delete bieden. → De module exporteert
  enkel `getActiveGoldSet`, `replaceGoldSetRecord`, `GoldSetReplacementError`.
  Guard-test controleert de export-oppervlakte (geen `update*/delete*GoldSet`)
  én dat `replaceGoldSetRecord` nooit `.delete`/`.update` (single, op inhoud)
  aanroept — alleen `create` + `updateMany`-tombstone. OPGELOST/bevestigd.

### MEDIUM
- **M1 — Dubbele vervanging mag nooit stil overschrijven.**
  `replaceGoldSetRecord` gebruikt een conditionele `updateMany(where: {id,
  replacedById: null})`; 0 rijen → `GoldSetReplacementError` BINNEN de
  transactie, zodat de zojuist aangemaakte insert terugrolt. Getest (unit +
  lokale E2E: double-replace rejected). OPGELOST.

- **M2 — 14.1-afstempunt: geen constraint die `replaced_by_id = id` blokkeert.**
  De migratie bevat bewust GEEN CHECK-constraint hierop; enkel de zelf-FK met NO
  ACTION. Gedocumenteerd in migratie-docblock en schema-comment. OPGELOST.

- **M3 — Seed mag nooit auto-draaien.**
  `main()` staat achter `require.main === module`; geen import-side-effect (de
  script-test importeert pure helpers zonder main() te draaien — bevestigd). Geen
  koppeling aan deploy/migratie/startup. README + CLAUDE.md documenteren handmatig
  + droge-run. OPGELOST.

### LOW
- **L1 — cropPath-variance moet gedocumenteerd zijn (spine fixeert enkel
  sleutelkolommen).** cropPath nullable + evidence-kolom zijn story-niveau
  invullingen; gemotiveerd in de migratie-docblock én het schema-comment
  (GTIN-records hebben geen crop). OPGELOST.

- **L2 — Repo-JSON niet muteren.** De twee JSON-bestanden zijn NIET aangeraakt;
  legacy-markering via nieuwe `tests/validation/README.md` + `CLAUDE.md`
  (verwijzing naar `gold_set_records` als bron van waarheid). GEVERIFIEERD:
  `git status` toont de JSON-bestanden niet als gewijzigd. OPGELOST.

- **L3 — Path-resolutie van de bronbestanden fragiel bij verplaatsing.**
  `resolveSourcePaths()` gaat uit van `apps/api/src/scripts/` → 4 niveaus op naar
  repo-root. Een dedicated test (`resolveSourcePaths` → beide bestanden bestaan)
  vangt regressie hierop. Aanvaardbaar; OPGELOST via test.

- **L4 — Evidence bewaart volledige bron-context (AD-13).** oogstrun: bron-id,
  gtin, confidence, method, sourceFile, bbox, reason; declared: gtin + codes.
  Niets van de bron gaat verloren. OPGELOST.

## AC→test-mapping

Zie `ac-trace-13-3.md`. Elk AC heeft ≥1 dekkende geautomatiseerde test die in de
diff staat en het AC-gedrag assert.

## Conclusie
Alle bevindingen (critical t/m low) opgelost of bevestigd. Volledige apps/api
vitest-suite groen (335 passed / 2 skipped). Migratie lokaal toegepast
(localhost:5432), dry-run + echte seed + idempotentie + vervanging E2E
geverifieerd. verdict: PASS.
