# Deferred Work

## Deferred from: code review of story-19-5 (2026-07-06)

- **Normaliseer `t3777Code` in de flywheel-declaratie-guard.** In `apps/api/src/services/flywheel/bootstrap-run.ts:253` vergelijkt de guard `m.code === t3777Code` strikt. `m.code` is via `parseDeclaredMarks` altijd `trim().toUpperCase()`, maar de `t3777Code`-kant (uit `bootstrap_queue`-seed) is niet expliciet genormaliseerd. Bestaand gedrag (geen 19.5-regressie; identiek aan de oude `codes.includes`); de sampler-caller is veilig omdat `buildIndex` de code uppercaset. Rest-risico: een lowercase/ongetrimde `bootstrap_queue.t3777Code` → guard matcht niet → GTIN onterecht overgeslagen. Fix-optie: `t3777Code.trim().toUpperCase()` in de guard, of uppercase borgen bij de queue-seed. Bron: Edge Case Hunter, code review 19.5.
