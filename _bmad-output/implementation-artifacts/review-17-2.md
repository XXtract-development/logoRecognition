# Adversarial self-review — Story 17.2 (Bootstrap-wachtrij: prioritering en beheer)

verdict: PASS
reviewed_scope: services/flywheel/bootstrap-frequency.ts, bootstrap-queue.ts; scripts/seed-bootstrap-queue.ts; api/v1/flywheel.ts (bootstrap-queue endpoints); web components/flywheel/BootstrapQueuePanel.tsx + service + FlywheelPage-koppeling

## Bevindingen per severity (alle gefixt vóór commit)

### Critical — geen

### High — geen

### Medium
- **M1 — status-guard bij race-upsert (seed).** Bij `action: 'insert'` gebruikt `main()` een `upsert`; als een parallelle 16.2-aggregatie de rij intussen inserteerde, mag de seed de status/excluded NIET overschrijven. **Fix:** de `update`-tak van de upsert zet uitsluitend `declarationFrequency` — nooit status/excluded. Getest via `planSeed` status-guard + de non-destructieve update-vorm. (opgelost in-code)
- **M2 — "nieuw geactiveerde klasse" mag alleen ná poort-passage tellen.** Een kandidaat met herkomst `bootstrap` die (nog) niet gepromoveerd is, mag niet als geactiveerd tellen. **Fix:** de query eist `referenceLogo: { active: true, source: 'flywheel-promotion' }` — dus een gezette, actieve, via-promotie referentie. Getest (wel/niet-gevallen). (opgelost in-code)

### Low
- **L1 — dode lege-staat-component.** Het oude `BootstrapQueuePanel` in `SignalPanels.tsx` (Epic-17-lege-staat) werd na de vervanging ongebruikt. **Fix:** verwijderd + toelichtende comment; `EmptyPanel`-import blijft (GlnCoveragePanel gebruikt 'm). (opgelost)
- **L2 — stale test-assert.** `FlywheelPage.test.tsx` asserteerde de oude "Epic 17"-lege-staat-hint. **Fix:** assert omgezet naar `queryByText(/Epic 17/)` == afwezig + `useQuery`-mock toegevoegd zodat het echte paneel rendert. (opgelost)
- **L3 — endpoint gecombineerde PATCH.** `{ priorityOverride, excluded }` in één PATCH voert beide mutaties sequentieel uit en logt beide; de response reflecteert de laatste. Bewust: beide mutaties zijn los-gelogd en idempotent; geen datacorruptie. (geen fix nodig, gedocumenteerd)

## Checklist
- Alle AC geïmplementeerd (zie ac-trace-17-2.md): AC1-AC5 gedekt met geautomatiseerde tests.
- Architectuur-patterns: AD-2 (state alleen apps/api; web muteert via endpoint), AD-13 (elke mutatie gelogd in `threshold_changes` flat-audit-patroon zoals 15.4), AD-15 (endpoint muteert alleen wachtrij / enqueue-t; geen poortlogica in request-pad), UX-DR5 (statuskleuren: amber=wachtend, groen=gevuld, neutraal=leeg/uitgesloten — géén fout-rood), UX-DR8 (lege staat, refresh-on-mount geen polling), UX-DR10 (NL i18next-keys).
- Graceful degradation: paneel toont laad-skeleton, foutkaart met opnieuw-proberen, lege staat; endpoint 400/404/403/500 correct.
- Geen migratie (tabel 16.2-eigendom; kolommen aanwezig).
- Geen schemawijziging, geen nieuwe env-vars.
- NFR-6: het paneel toont uitsluitend codes + frequenties + status — geen gids-logo-thumbnails in API-response of UI.
- Geen secrets, geen debug-statements, geen dode code.
- Geen `git add .`; node_modules/.env buiten de commit.
