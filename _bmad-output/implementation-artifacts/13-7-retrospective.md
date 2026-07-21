# Epic-13 retrospective-aanvulling — Story 13.7 (uuid=text-fix)

Datum: 2026-07-21 · Branch: `epic/vliegwiel-13-7-uuid-fix`

## Wat ging goed

- **Root cause was vooraf scherp gelokaliseerd** (read-only ACC-diagnose + broncode): de fix bleef daardoor een chirurgische 2-regel-typefix zonder scope-creep. Query-betekenis byte-identiek.
- **Bestaand precedent hergebruikt**: `= ANY(${...}::uuid[])` sluit aan op het al aanwezige `= ANY(${CLONE_GAP_SOURCES})`. Geen nieuw idioom, geen `IN (${Prisma.join})`-antipatroon meer in de vliegwiel-keten.
- **Het echte testgat is gedicht, niet omzeild**: een aparte pg-integratielaag draait tegen een echte pgvector-Postgres en bewijst zowel dat de pre-fix-vorm 42883 gooit als dat de fix slaagt. De gemockte suite kón deze klasse principieel niet vangen.

## Wat brak / wreef

- **De gemockte apps/api-suite verbergt een hele foutklasse**: alles mockt `@prisma/client` volledig, dus geen enkele raw-SQL-typefout wordt door Postgres geparsed. Dit is precies waarom de bug maandenlang stil kon blijven (de watchdog meldde het wél, maar de notificatie werd gededupliceerd).
- **Migraties GRANT'en aan rol `logorecognition`** die niet standaard bestaat in een kale Postgres → de test-runner moest die throwaway-rol eerst aanmaken vóór `migrate deploy`. Waardevol om te weten voor toekomstige pg-integratietests.
- **Worktree had geen node_modules** → `pnpm install` was nodig voordat er getest kon worden; kost eenmalig tijd per verse epic-worktree.

## Afspraken / patronen die hieruit volgen

1. **uuid-array-cast-patroon vastleggen**: vergelijk een id-array tegen een uuid-kolom altijd met `= ANY(${ids}::uuid[])` (of per-element `${id}::uuid` binnen `Prisma.join`). Vermijd `IN (${Prisma.join(ids)})` voor uuid-lijsten — dat bindt text-parameters en gooit 42883.
2. **Raw SQL vereist een pg-integratietest, niet de gemockte suite**: elke nieuwe `$queryRaw`/`$executeRaw` in het vliegwiel die tegen typegevoelige kolommen (uuid/vector) draait, hoort een test in de `*.itest.ts`-laag te krijgen die tegen een echte Postgres draait (`npm run test:integration`).
3. **pg-integratieharnas is nu beschikbaar** (`vitest.integration.config.ts` + `scripts/run-pg-integration-tests.sh`) — hergebruik het voor toekomstige raw-SQL-regressies i.p.v. opnieuw bouwen. Let op: rol `logorecognition` vooraf aanmaken.
4. **AC5 (ACC-drain van batch `12e27fbc-…`) blijft open** tot expliciete go van Friso: deploy via ghcr-build-workflow → Coolify api-deploy → éénmalig `flywheel-promotion` enqueuen → read-only verificatie. Epic-13 blijft daarom `in-progress` tot die ops-stap is afgerond.
