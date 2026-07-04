# Adversarial self-review — Story 18.2 (Restant-route via mediaserver-re-import)

reviewed_commit: TO_BE_PINNED_AFTER_COMMIT
verdict: PASS

Scope van de review: de 18.2-diff (driver-script + dosering-config + twee exports +
env-docs + tests). Beoordeeld langs severity critical → low. Alle bevindingen gefixt
of gemotiveerd geaccepteerd (geen open items).

## Bestanden in scope

- `apps/api/scripts/gln-reimport-restant.ts` (A) — driver-script (pure kern + injecteerbare deps + CLI).
- `apps/api/src/services/flywheel/config.ts` (M) — `getGlnReimportBatchSize` / `getGlnReimportPauseMs`.
- `apps/api/src/api/v1/artwork-pipeline.ts` (M) — `runImportLoop` + `markStaleRuns` geëxporteerd (hergebruik, geen fork).
- `.env.example` (M) — twee doseringsvariabelen gedocumenteerd.
- `apps/api/src/__tests__/scripts/gln-reimport-restant.test.ts` (A) — 12 tests.
- `apps/api/src/__tests__/services/flywheel-config.test.ts` (M) — 3 tests toegevoegd.

## Bevindingen

### Critical — geen

### High — geen

### Medium

- **M1 — Mechanisme-hergebruik i.p.v. fork (opgelost/bevestigd).** De story eist expliciet
  "geen kopie van `runImportLoop`, geen eigen mediaserver-loop". `runImportBatch` importeert
  en roept de geëxporteerde `runImportLoop`/`markStaleRuns` uit `artwork-pipeline.ts` aan —
  identiek pad als het `POST /artwork-import/runs`-endpoint (run-record aanmaken → loop →
  wachten op afronding). Geen loop herbouwd. `force` komt nergens voor: `runImportLoop`
  draait altijd de delta-strategie (dedup-skip → goedkope gln-backfill-tak), precies zoals
  de guardrail "`force:true` NIET gebruiken" vereist. **Bevestigd correct.**

### Low

- **L1 — `glnCount` in `DiscoverySignal` is informatief, niet discriminerend.**
  `reasonForUnresolved` kiest op `mediaCount` (0 → geen-media; anders → geen-gln), exact de
  story-definitie ("discovery leverde niets" vs. "media maar geen afleidbare GLN"). `glnCount`
  wordt in de prod-dep berekend en in de tests meegegeven als signaal-vorm, maar niet in de
  beslissing gebruikt. Bewust behouden als zelf-documenterend contract-veld; geen dode logica
  in het beslispad. **Geaccepteerd (geen gedragsimpact).**
- **L2 — Discovery-fout → `mediaserver-geen-media`.** Als de mediaserver-discovery in de
  reden-bepaling faalt, valt de reden terug op `{mediaCount:0}` → `mediaserver-geen-media`.
  Dat is de veiligste keuze: het record houdt ALTIJD een actuele reden (FR-21 "geen stille
  uitval"), nooit een leeg reden-veld. **Geaccepteerd (voldoet aan FR-21).**

## Checklist (protocol §3 C)

- Alle AC geïmplementeerd? Ja (zie ac-trace-18-2.md).
- Architectuur-patterns gevolgd (AD-7 terugval (b), NFR-3 tempering, `FLYWHEEL_`-prefix,
  pure-kern-+-injecteerbare-deps zoals 18.1), anti-patterns vermeden (geen fork, geen
  `force:true`, geen nieuw mechanisme)? Ja.
- Graceful degradation correct? Ja — discovery-fout degradeert naar een actuele reden;
  dry-run doet nul I/O; lege tabel → `percentage: null` (via het 18.1-paneel).
- Geen security-vulnerabilities/secrets? Ja — geen creds, geen hardcoded URI's; de mediaserver
  gebruikt de bestaande client-config.
- Geen dode code of debug-statements? Geen debug-statements. `glnCount` is contract, geen dode
  logica (L1).
- Migratie? NEE — hergebruikt de `glnBackfillReason`-kolom uit 18.1; nieuwe redenen zijn
  stringwaarden in de bestaande kolom.

## Testresultaat

- 18.2-eigen: 12 (script) + 3 (config) = 15 nieuwe tests, groen.
- Volledige apps/api-suite: 825 passed / 2 skipped / 37 todo — geen regressie (baseline 810,
  +15). De bestaande artwork-pipeline-tests (importloop, gln-upsert) blijven byte-gelijk groen;
  het importpad zelf is niet gewijzigd (alleen twee functies geëxporteerd).
- Typecheck (`tsc --noEmit`): schoon.
- web: niet geraakt (script + api-interne wijziging).
