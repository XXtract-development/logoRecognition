# Adversarial self-review — Story 19.3 (Keurmerk→etiket-index)

reviewed_commit: (pre-commit, worktree epic-19-index-sampler)
VERDICT: PASS

## Scope
- `apps/api/src/scripts/build-keurmerk-index.ts` (nieuw)
- `apps/api/src/__tests__/scripts/build-keurmerk-index.test.ts` (nieuw)

## AC-trace
| AC | Eis | Test(s) |
|----|-----|---------|
| 1 | index `{code → [GTIN → etiket]}` + tellingen via betrouwbare catalog-XML-lezer, getoetst aan 951-universum | `buildIndex bouwt {fieldType/code → ...} met tellingen`, `meerdere codes per GTIN`, `houdt gelijke codes uit verschillende velden gescheiden`, `toetst aan het universum: codesPresent + universeCodeCount` |
| 2 | idempotent seed-script met droge-run; beheerde opslag; herdraaien wijzigt niets ongewenst | `dezelfde invoer geeft byte-identieke serialisatie`, `invoervolgorde beïnvloedt de output NIET`; dry-run-garantie architectureel (dry-run raakt `writeIndex` nooit — spiegelt seed-gold-set) |

De declaratie-lezer is `resolveDeclaredMarks` (5/5 velden, Story 19.2) = de betrouwbare catalog-XML-lezer (geen Mongo-tradeItems). Bron-GTINs uit `artwork_imports` (gln gevuld). Universum-bron `Result_4.xlsx` als referentie gedocumenteerd (niet geparsed; codesPresent laat dekking af).

## Severity-checklist
- **Critical**: geen. Geen writes bij dry-run; geen prod-writes; script is handmatig (require.main-guard, geen auto-run bij deploy/startup — envelope §3).
- **High**: geen. `resolveDeclaredMarks` + `discoverArtwork` zijn beide fail-safe (nooit throw); discoverArtwork extra `.catch(()=>[])` als vangnet. Een GTIN zonder declaratie/labels valt in de pure bouw stil weg (geen half-record).
- **Medium**: geen. Idempotentie via vaste opslagsleutel (`flywheel-index/keurmerk-etiket-index.json`) + deterministische, gesorteerde serialisatie. `KEURMERK_INDEX_LIMIT` conservatieve default 500 begrenst de service-belasting.
- **Low**: geen open punten. Samengestelde sleutel `fieldType/code` voorkomt code-collisie tussen GS1-codelijsten; `key.indexOf('/')` (eerste slash) is veilig want GS1 fieldType-namen bevatten geen slash.

## Architectuur-conformiteit
- MLClient-only n.v.t. (geen ml-calls). Storage via bestaande `getStorageAdapter`/`BUCKETS.TRAINING` (test-modus = in-memory, geen externe afhankelijkheid). Geen schemawijziging → geen migratie. Geen nieuwe promotieroute.
- Pure helpers geëxporteerd, I/O in `main()` — spiegelt `seed-gold-set.ts`/`seed-control-cohort.ts`.

## Tests
- 13/13 groen (`build-keurmerk-index.test.ts`). tsc --noEmit exit 0.

Geen bevindingen open. VERDICT: PASS
