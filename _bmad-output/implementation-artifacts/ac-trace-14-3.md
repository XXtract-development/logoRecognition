# AC→test-mapping — Story 14.3 (Wekelijkse outlier-audit)

Elk AC → dekkende geautomatiseerde test(s). Alle tests groen.

| AC | Kern | Test(s) | Bestand |
|----|------|---------|---------|
| **AC1** | Prisma-migratie `outlier_findings` conform Structural Seed + down-script, expliciete goedkeuring | Migratie 0016 bestaat mét `down.sql`; lokaal toegepast op `localhost:5432` na expliciete toestemming (task-prompt). Structurele velden geverifieerd via `prisma migrate status` (up to date) + additieve `migrate diff`. Persistentie-tests bewijzen dat het model bruikbaar is. | `apps/api/prisma/migrations/0016_add_outlier_findings/{migration,down}.sql`; `flywheel-outlier-audit.test.ts` (persisteert-open-finding) |
| **AC2** | Per klasse via `/ml/outlier-audit` centroid-afstanden; bovenste 5%-percentiel OF absolute grens → outlier-melding mét vergelijkingsdata; dekt gecureerde referenties; deactiveert niets | **Percentiel-pad:** `selectOutliers — markeert bovenste percentiel`. **Absolute-pad:** `selectOutliers — boven absolute grens`. **Reason both:** `selectOutliers — both`. **Vergelijkingsdata (ml):** `test_library_audit_returns_distance_and_percentile_per_reference`, `..._percentile_is_fraction_le_including_self`. **Gecureerde referenties:** `audit dekt óók handmatig gecureerde referenties` (query zonder source-filter). **Deactiveert niets:** `DEACTIVEERT NIETS: geen write op reference_logos`. | `flywheel-outlier-audit.test.ts`; `test_outlier_service.py` |
| **AC3** | Persistent in `outlier_findings` (status open), opvraagbaar via overview-API, herstart-bestendig, incl. run-tijdstempel | **Persistentie + tijdstempel:** `persisteert een open finding per treffer met run-tijdstempel`; `gebruikt ÉÉN auditRunAt voor alle findings`. **Idempotentie/herstart:** `dedupt: geen duplicaat als open finding bestaat`. **Overview-API:** `getOutliersPanel — open findings + laatste auditRunAt`; `lege set → null`. | `flywheel-outlier-audit.test.ts` |
| **AC4** | Beoordelingsacties (Behouden/Deactiveren) via 15.2-endpoint — deze story levert alleen signalering + persistentie | Bewezen door afwezigheid: `DEACTIVEERT NIETS` (geen beoordelings-mutatie hier) + model-veld `status`/`decidedBy`/`decidedAt` bestaat als contract voor 15.2 zonder dat 14.3 ze schrijft. Geen `outliers/:id/decision`-endpoint in deze diff (bewust). | `flywheel-outlier-audit.test.ts`; `schema.prisma` (velden) |
| **AC5** | Bij pauzestand draait de audit gewoon door (read-only, AD-11) | `pauze-scope — draait door zonder pauze-check`; `routeert flywheel-outlier-audit naar de audit-flow` (worker-route raakt de audit, geen pauze-guard). | `flywheel-outlier-audit.test.ts`; `flywheel-worker-scheduler.test.ts` |

## Aanvullende dekking (robuustheid)
- Scheduler-registratie (wekelijks, tz, upsertJobScheduler, geen repeat): `flywheel-worker-scheduler.test.ts` (3 schedulers, cron `0 5 * * 0`).
- ml-fout op één klasse → run gaat door: `slaat een klasse met een ml-fout over`.
- Lege klasse geen crash: `lege klasse (centroid_size 0) levert niets`; `test_library_audit_empty_class_no_crash`.
- Kleine-klasse-percentiel-poort: `kleine klasse (<minClassSize) levert GEEN percentiel-outlier`; `test_library_audit_single_reference_defines_trivial_rank`.
- Nul-vector vervuilt centroid niet: `test_library_audit_skips_zero_vectors_in_centroid`.

## Testtotalen
- Vitest (apps/api, volledige suite): **507 passed / 2 skipped / 16 todo** (was 492). 14 nieuwe 14.3-tests + 2 bijgewerkte scheduler-tests.
- Pytest (ml-service, pure outlier-uitbreiding): **16 passed** (7 nieuw voor library-modus).
