# Adversarial self-review — Story 16.3 (Datakwaliteitsrapport gevonden-niet-gedeclareerd)

reviewed_commit: 8b76967a29ca600c8f54f804a56c5ee755a85c4a
verdict: PASS
scope:
- apps/api/src/services/flywheel/reference-path-guard.ts (NIEUW — NFR-6-guard)
- apps/api/src/services/flywheel/data-quality-report.ts (NIEUW — rapport-service)
- apps/api/src/api/v1/flywheel.ts (route reports/data-quality toegevoegd)
- apps/api/src/__tests__/services/flywheel-reference-path-guard.test.ts (NIEUW)
- apps/api/src/__tests__/services/flywheel-data-quality-report.atdd.test.ts (scaffold → echte tests)
- apps/api/src/__tests__/api/flywheel-data-quality-report.routes.test.ts (NIEUW)

## Bevindingen per severity

### Critical
- Geen.

### High
- **[opgelost] NFR-6 — enig padproducerend punt door de guard?**
  data-quality-report.ts:deriveSourceFile is de ENIGE plek die een pad in de payload zet, en routeert dat pad altijd via `sanitizeSourcePath`. Geen ander veld (gtin/code/confidence/runId) draagt een pad. Guard-test dekt kaal/`./`/`/`-prefix + gelogde waarschuwing. Bevestigd: een `reference-logos/`-pad kan niet lekken.

### Medium
- **[opgelost] Cohort-uitsluiting consistent met 16.2/16.4.**
  `NOT: { origin: { startsWith: 'cohort-' } }` (Prisma) is semantisch gelijk aan het bestaande `origin NOT LIKE 'cohort-%'` (mismatch-workload.ts:149, overview/mismatch-trends.ts:159). Query-argument getest.
- **[opgelost] Geen tweede confidence-drempel.**
  De service filtert nooit op confidence; test "leest ALLE found-not-declared-events" bewijst dat een (kunstmatig) laag-confidence-event NIET opnieuw gefilterd wordt — de drempel blijft de 16.1-registratie. Geen drift/dubbele implementatie.
- **[geaccepteerde variance] CSV niet strikt streaming.**
  Dev Notes vragen "CSV per rij schrijven, geen volledige set in geheugen". `toDataQualityCsv` bouwt een `lines[]` en joint (identiek aan het bestaande `hard-negative-export.toCsv`-patroon) en de Fastify-`.send(string)` buffert hoe dan ook de body. Echte streaming vereist een stream-response en is een cross-cutting refactor van álle flywheel-exports — bewust buiten scope gehouden, consistent met precedent. De DB-query is wél geheugenvriendelijk (alleen found-not-declared, periode/gln/cohort ge-pushdown; enkel de relevante rijen komen binnen). Genoteerd als bekende beperking, niet blokkerend voor de AC's.

### Low
- **[opgelost] Bronbestand-afleiding zonder schemawijziging.**
  `mismatch_events` heeft geen crop-/bronbestand-kolom (schema.prisma:807). Conform guardrail "geen schemawijziging" (ARCH-2) wordt "bronbestand" deterministisch afgeleid uit de eigen-crop-conventie `artwork-crops/{gtin}/` — een eigen-crop-verwijzing (nooit een gidsbeeld), met `runId` voor herleidbaarheid (AD-13). Gedocumenteerd in de service-header en het Dev Agent Record.
- **[opgelost] Lege/ongeldige inputs.**
  Ongeldige datum → null (route-test); lege GLN-string → geen filter (`.trim() || null`); lege periode → geldige lege respons (service- + route-test).
- **[opgelost] Groep-sortering deterministisch.**
  Groepen gesorteerd op GLN via `localeCompare`; `UNKNOWN_GLN_LABEL` sorteert mee als gewone string. DB-orderBy beïnvloedt de groepsvolgorde niet (eigen hergroepering).

## Checklist (protocol §C)
- Alle AC geïmplementeerd: ja (zie ac-trace-16-3.md).
- Architectuur-patterns gevolgd (AD-2 apps/api-only, AD-13 herleidbaarheid, endpointset spine:241, REQUIRE_ADMIN, CSV/route-patroon hard-negatives/export): ja.
- Graceful degradation: ongeldige query-params degraderen naar "geen filter" i.p.v. 500; lege data → geldige lege respons.
- Security/secrets: geen; ADMIN-only route (requireRole('ADMIN')).
- Dode code / debug-statements: geen.
- Migratie: NEE (bewust migratie-vrij — bevestigd, story-afbakening).
