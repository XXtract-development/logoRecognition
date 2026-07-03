# AC→test-traceability — Story 16.3

Elk acceptatiecriterium met de dekkende geautomatiseerde test(s). Alle tests draaien
onder `apps/api` (vitest), DATABASE_URL lokaal.

## AC1 — Rapport per informatieleverancier (groepering, per-geval-velden, export, endpoint)

| Deel-eis | Test |
|---|---|
| Gegroepeerd per GLN; GLN=null → groep "onbekend" | `flywheel-data-quality-report.atdd.test.ts` → "groepeert per GLN; GLN=null → groep onbekend; per geval GTIN/code/confidence/bronbestand" |
| Per geval GTIN, code, confidence, bronbestand | idem (assert op `{gtin, code, confidence, sourceFile, runId}`) |
| Alleen found-not-declared; cohort uitgesloten | idem → "vraagt alleen found-not-declared, cohort uitgesloten (query-argument)" |
| Periode-afbakening half-open [from, to) | idem → "periode is half-open [from, to): from→gte, to→lt" |
| Optionele GLN-filter | idem → "optionele GLN-filter wordt doorgezet naar de query en het rapportmodel" |
| Geen onbedoelde filters zonder params | idem → "zonder periode/gln bevat de where geen createdAt/gln" |
| Leeg-rapport-pad (geen events) → geldige lege respons | idem → "lege periode (geen events) → geldige lege respons" + route-test "lege periode → 200 met geldige lege respons" |
| Geen tweede confidence-drempel | idem → "leest ALLE found-not-declared-events (geen tweede confidence-drempel hier)" |
| Endpoint `GET /flywheel/reports/data-quality` (JSON) | `flywheel-data-quality-report.routes.test.ts` → "JSON-respons → 200 met rapportmodel" |
| CSV-export (download-headers) vanuit dashboard | idem → "CSV-export → 200 text/csv met download-header" |
| Periode-/GLN-query parsing in de route | idem → "periode- en GLN-query worden geparsed en doorgegeven aan de service" + "ongeldige datum → null" |
| CSV-serialisatie: velden GTIN/code/confidence/bronbestand | `...report.atdd.test.ts` → "toDataQualityCsv" describe (kopregel + rij, null-cellen) |
| CSV delimiter-/quoting-randgevallen | idem → "quoteert velden met komma of quote" |
| CSV lege export geldig | idem → "leeg rapport → enkel de kopregel" |
| ADMIN-only (ingelogde dashboard-functie) | route-test → "niet-ADMIN → 403" |

## AC2 — Bronrestrictie (NFR-6, hard)

| Deel-eis | Test |
|---|---|
| Guard herkent `reference-logos/`-gidspad (kaal/`./`/`/`) | `flywheel-reference-path-guard.test.ts` → "isReferenceLogoPath" describe |
| Guard weigert gidspad → null én logt aantoonbaar een waarschuwing | idem → "weigert een gidspad → null én logt een waarschuwing" |
| Eigen crop-pad passeert ongewijzigd, geen waarschuwing | idem → "laat een eigen crop-pad ongewijzigd door, zonder waarschuwing" |
| Gidspad lekt aantoonbaar NIET in de rapport-payload | `...report.atdd.test.ts` → "NFR-6 bronrestrictie" describe (alle sourceFile beginnen met `artwork-crops/`, bevatten nooit `reference-logos/`) |

## AC3 — Tests

Gedekt door de drie testbestanden hierboven (unit: guard + groepering/periode/CSV;
integratie: endpoint JSON+CSV-headers + lege respons + autorisatie). E2E NIET aan de
stable-subset-gate toegevoegd (conform AC3).

## Migratie
NEE — bewust migratie-vrij (leesprojectie over bestaande `mismatch_events`).

## Samenvatting
- AC's: 3 / 3 gedekt door geautomatiseerde tests.
- Nieuwe tests: 27 (guard 10, service 11, route 6), allen groen.
