# Adversarial self-review — Story 15.2 (Overzichtsscherm)

reviewed_commit: (epic-branch HEAD na commit)
verdict: PASS

Adversariële self-review langs severity critical→low. Alle bevindingen gefixt vóór commit.

## Critical
Geen.

## High
Geen openstaand. Aandachtspunten expliciet afgedekt:
- **Baseline-invalidatie bij outlier-deactivatie (AD-5, kritiekste punt van de story).** `outlier-decision.ts` roept `markBaselineStale('outlier-deactivatie', by)` aan ná de soft-delete-transactie. Getest: `flywheel-outlier-decision.test.ts` asserteert de exacte aanroep. Zonder dit meet de eerstvolgende poortrun tegen een valse baseline — nu geborgd.
- **Geen poortlogica in het request-pad (AD-15).** Rollback- en outlier-decision-endpoints muteren status/soft-delete + loggen; ze draaien geen guardrails of regressietest. Geverifieerd in de service-code (geen gate-import).

## Medium (gefixt)
- **M1 — `baselineMeasurement: { not: undefined }` in `kpi.ts` (getGoldSetPrecision).** `{ not: undefined }` is voor een nullable Json-veld géén filter (Prisma negeert het) → had een passed-batch zonder meting kunnen teruggeven. **Fix:** `{ not: Prisma.DbNull }`, conform het bestaande patroon in `gate.ts:266`. (api tsc 0 errors, kpi-test groen.)

## Low (gefixt / verantwoord)
- **L1 — ongebruikte `panel`-prop in de private `EmptyStatePanel`.** Verwijderd uit de private helper; de publieke `BootstrapQueuePanel`/`MismatchTrendsPanel`/`GlnCoveragePanel` behouden `panel` bewust in hun props-vorm zodat de bron-epic ze straks 1-op-1 kan vervangen zonder de pagina te wijzigen (gedocumenteerd in een comment).
- **L2 — verwijderde ongebruikte imports** na de route-refactor (`FastifyRequest`, losse sub-service-imports in `flywheel.ts` — nu via `composeOverview`). api tsc 0 errors.
- **L3 — 15.1-tests met stale markup** (`flywheel-empty` testid verdween omdat het lege casco vervangen is door het dashboard). Bijgewerkt naar de nieuwe markup mét behoud van intentie (theming/loading/error/refresh); geen functionele test verzwakt. Ook `flywheelService.test.ts` bijgewerkt naar het nieuwe pass-through-contract + tests voor de nieuwe mutaties.

## Checklist
- Alle AC geïmplementeerd? Ja — zie `ac-trace-15-2.md` (8/8, elk met dekkende test).
- Architectuur-patterns gevolgd (modulaire /overview, coördinatie-noot)? Ja — één sub-service per paneel onder `services/flywheel/overview/`, route componeert alleen; sectie-lokale foutafhandeling.
- Graceful degradation? Ja — elke sub-service best-effort (leeg/null bij leesfout); `composeOverview` vangt per paneel af naar `{ error }`; client toont sectie-lokale foutkaart, rest bruikbaar.
- Security/secrets? Geen secrets; mutatie-endpoints zijn ADMIN-only (`requireRole('ADMIN')`), rollback + outlier-decision. Verplicht redenveld bij rollback ook server-side (13.6). Ongeldige/dubbele outlier-beslissing → 400/409.
- Dode code / debug-statements? Geen. Logging via `createLogger` (bestaand patroon), geen console.
- Kleursemantiek (UX-DR5)? Amber voor quarantaine/cap/outliers; `teruggedraaid` neutraal; rood alleen het regressie-meetpunt in de trend. Deactiveer/afkeur-knoppen niet rood in ruststand. Getest.
- Accessibility (UX-DR9)? Status via dot+tekst (StatusBadge), amber-tekst `#92600A`; grafiek met `role="img"`+aria-label, tekstueel alternatief (caption) én data-als-tabel; stale-melding `aria-live="polite"`.
- Geen polling? `useFlywheelOverview` heeft refetchOnMount + staleTime, géén `refetchInterval`; verversing handmatig; StaleDataAlert doet geen auto-reload.
- Migratie? Geen — schema.prisma en migrations/ ongewijzigd (bevestigd via `git status`). Alle tabellen uit Epics 13/14.

## Testresultaat (na laatste fix)
- apps/api vitest: 531 passed / 2 skipped / 20 todo.
- apps/web vitest: 88 passed / 20 todo / 2 skipped.
