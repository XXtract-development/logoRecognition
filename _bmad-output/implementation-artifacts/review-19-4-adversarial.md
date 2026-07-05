# Adversarial self-review — Story 19.4 (Gebalanceerde sampler + nominatie-aansluiting)

reviewed_commit: (pre-commit, worktree epic-19-index-sampler)
VERDICT: PASS

## Scope
- `apps/api/src/services/flywheel/balanced-sampler.ts` (nieuw)
- `apps/api/src/services/flywheel/config.ts` (`getSamplePerClass`, `FLYWHEEL_SAMPLE_PER_CLASS`, default 50)
- `apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts` (nieuw)

## AC-trace
| AC | Eis | Test(s) |
|----|-----|---------|
| 1 | per keurmerk tot N gebalanceerd, via het BESTAANDE nominatie-/poortpad (herkomst passend), nooit direct in reference_logos; gate/dedup/class-cap gerespecteerd | `spreidt eerst één label per GTIN...`, `vlag AAN → biedt elk geselecteerd label aan de bestaande poort aan (herkomst bootstrap)`, `poort-uitkomsten worden geteld` |
| 2 | cap bij N + overschot geregistreerd mét reden (geen stille verliezen) | `capt bij N en telt het overschot`, `N=0...`, `rapporteert het totale overschot over klassen` |
| 3 | achter de bestaande nominatie-vlag (default uit) | `vlag UIT (default) → geen enkele nominatie/write`, `vlag AAN → ...`, `expliciete dry-run met vlag AAN → geen writes` |

## Severity-checklist
- **Critical**: geen. Geen directe writes in `reference_logos`/`reference_candidates` — de enige mutatie-route is `nominateCandidate` (de bestaande poort). Vlag UIT = 0 writes (getest). Geen live-executie: de module exporteert enkel functies, GEEN self-runnende `require.main`-runner → per story-instructie ("voer de sampler NIET live uit") bewust weggelaten.
- **High**: geen. De sampler-class-cap (N) is een SELECTIE-plafond; de promotie-class-cap (10, `getClassCap`) blijft DOWNSTREAM door de poort/promotielus gehandhaafd — geen nieuwe promotieroute. `origin: 'bootstrap'` = bestaande herkomst-enum (geen nieuwe waarde). Overschot geteld met reden `class-cap-bereikt` (in de doc + `skippedOverCap`), geen stille verliezen (NFR-5).
- **Medium**: geen. `confidence: 1` bij aanbieding: bootstrap-herkomst gaat door de per-methode-drempel (niet review-exempt), maar de eigenlijke bevestiging is de declaratie (`declared:[code]`, label draagt de code gegarandeerd per 19.3-index) — zelfde semantiek als `bootstrap-run.ts`, waar de declaratie de gate vormt. Deterministisch plan (sleutels alfabetisch, round-robin invoervolgorde) → idempotente selectie.
- **Low**: geen open punten. Geen dode code/debug-statements; alle exports getest of triviaal (`splitKey`).

## Architectuur-conformiteit
- `FLYWHEEL_`-env-prefix (`FLYWHEEL_SAMPLE_PER_CLASS`). Vlag-scoping via `isNominationEnabled()` (AD-8). MLClient-only n.v.t. (sampler roept geen ml direct aan; de poort doet dat). Geen migratie (geen schemawijziging). Geen prod-/ACC-writes (mock in test; module niet live gedraaid).

## Tests
- 11/11 groen (`flywheel-balanced-sampler.test.ts`). tsc --noEmit exit 0.

Geen bevindingen open. VERDICT: PASS
