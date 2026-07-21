# AC→test-trace — Story 13.7 (uuid=text-fix promotielus-guardrails)

Branch: `epic/vliegwiel-13-7-uuid-fix`

| AC | Omschrijving | Dekkende test / bewijs | Status |
|----|--------------|------------------------|--------|
| AC1 | Beide bekende query's casten naar uuid (`hasCosineDuplicate` survivor-arm + `loadCandidateEmbeddings`) | `apps/api/src/__tests__/integration/flywheel-guardrails-uuid.itest.ts` — test "POST-fix: hasCosineDuplicate survivor-arm draait zonder 42883 en matcht" + "POST-fix: loadCandidateEmbeddings draait zonder 42883 en levert de rijen". Draaien tegen échte Postgres via `scripts/run-pg-integration-tests.sh`. | GEDEKT (3/3 pass) |
| AC2 | Geen resterende uncast uuid-vergelijking in `apps/api/src/services/flywheel/` | Sweep gedocumenteerd in `review-13-7.md` §Sweep: alle `Prisma.join`/`IN (${...})`/`= ANY(...)`-treffers geïnventariseerd; alleen de 2 bekende plekken vergeleken een uuid-kolom ongecast. `CLONE_GAP_SOURCES` (regel 456) vergelijkt een text-kolom (`rl.source`) → geen cast nodig. Overige raw SQL casten al `::uuid`. | GEDEKT (statisch bewijs) |
| AC3 | Postgres-niveau regressietest die de bug reproduceert (pre-fix faalt met 42883, post-fix slaagt) | `flywheel-guardrails-uuid.itest.ts` — test "PRE-fix: de uncast IN (${Prisma.join(ids)})-vorm gooit 42883 op Postgres" (`rejects.toThrow(/operator does not exist: uuid = text|42883/)`) + de twee POST-fix-tests. Draait NIET tegen de gemockte Prisma (aparte `vitest.integration.config.ts` zonder `setup.ts`). | GEDEKT (pre-fix faalt, post-fix slaagt, bewezen) |
| AC4 | Gedrag ongewijzigd op de bestaande suite | Volledige `apps/api`-vitestsuite: 907 passed, 2 skipped, 37 todo (80 test files). `.itest.ts` valt buiten de default-include → snelle suite blijft Postgres-onafhankelijk. | GEDEKT (suite groen) |
| AC5 | Deploy-volgorde + ACC-drain van batch `12e27fbc-…` | **GATED-WAIVER: ACC-deploy + promotielus-drain pending user go (story taak 5).** Dit is een ACC-schrijfactie (per-geval-toestemming van Friso). GEEN unit-test; buiten code-scope. Deploy-keten en enqueue-stappen staan beschreven in story taak 5 + Dev Notes. | GATED-WAIVER (pending user go) |

**Samenvatting:** AC1-AC4 door geautomatiseerde tests gedekt en groen. AC5 is expliciet een ACC-/ops-criterium, gemarkeerd als gated-waiver — geen ACC-actie uitgevoerd binnen deze run.
