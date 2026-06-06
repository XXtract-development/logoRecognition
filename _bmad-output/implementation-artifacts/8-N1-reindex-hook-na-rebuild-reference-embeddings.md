# Story 8-N1: REINDEX-hook na rebuild_reference_embeddings (mini-fix)

Status: done — AC1+AC2 geïmplementeerd en getest; AC3 = post-deploy verificatiestap (zie Dev Agent Record)

## Story

As a datamanager,
I want dat de pgvector-index op `reference_embeddings` automatisch herbouwd wordt nadat de referentie-embeddings opnieuw zijn opgebouwd,
so that embedding-classificatie (8.4) niet stilletjes 0 resultaten geeft na een rebuild.

## Waarom (ivfflat-les uit fase B, 2026-06-05)

`rebuild_reference_embeddings` (`apps/ml-service/app/services/similarity.py:239`) **leegt eerst de tabel** (`clear_reference_embeddings`, regel 260) en vult hem daarna opnieuw. Een ivfflat-index die op een lege (of bijna lege) tabel is gebouwd, heeft gedegenereerde clusters: index-scans geven dan **0 resultaten terug, zonder fout**. Tijdens de ACC-data-heropbouw is dit handmatig met een eenmalige `REINDEX` hersteld — maar elke volgende rebuild (startup-hook in `app/main.py:62`, library-refresh) reproduceert het probleem.

## Acceptance Criteria

1. **REINDEX na succesvolle rebuild:** Given een afgeronde `rebuild_reference_embeddings`-run met `processed > 0`, When de run klaar is, Then wordt de ivfflat-index op `reference_embeddings` geREINDEXt (via een `db_service`-methode, `REINDEX INDEX`/`REINDEX TABLE`) And wordt dit gelogd And telt een REINDEX-fout als gewone error in de samenvatting (geen crash van de rebuild).
2. **Geen REINDEX op leeg resultaat:** Given een rebuild met `processed == 0`, When de run klaar is, Then wordt er NIET geREINDEXt (een index op een lege tabel herbouwen lost niets op en de log moet niet suggereren dat de index gezond is) And wordt een waarschuwing gelogd dat de index mogelijk gedegenereerd is tot de volgende gevulde rebuild.
3. **Bewijs:** Given de fix op ACC, When een rebuild draait (bv. container-herstart), Then toont een index-scan-query (`SET enable_seqscan=off` + similarity-query) > 0 resultaten — AC-bewijs met query-uitvoer in het story-record.

## Tasks / Subtasks

- [ ] Task 1: `db_service`-methode `reindex_reference_embeddings()` (AC 1)
  - [ ] `REINDEX INDEX <ivfflat-indexnaam>` — indexnaam dynamisch opzoeken via `pg_indexes` (niet hardcoden; migratienummering kan de naam wijzigen)
- [ ] Task 2: Hook in `rebuild_reference_embeddings` (AC 1, 2): alleen bij `processed > 0`; fout → `errors += 1` + log, geen raise
- [ ] Task 3: Unit-test (gemockte db_service): REINDEX aangeroepen bij processed>0, niet bij processed==0, fout verhoogt errors zonder raise
- [ ] Task 4: AC3-bewijs op ACC na deploy (query-uitvoer vastleggen)

## Dev Notes

- **Géén migratie** — REINDEX is een runtime-onderhoudsactie, geen schemawijziging. Valt buiten de migratie-toestemmingsregel, maar wordt wel gemeld in het deploy-verslag.
- `REINDEX INDEX CONCURRENTLY` is niet nodig (tabel is klein, rebuild draait al exclusief bij startup); gewone REINDEX volstaat en vermijdt de CONCURRENTLY-beperkingen binnen transacties.
- Alternatief overwogen en afgewezen: index droppen/herbouwen bij elke rebuild (zwaarder, zelfde effect) of overstappen op HNSW (aparte afweging, niet in een mini-fix).
- Bron: fase-b-bevindingen-2026-06-05.md (bevinding 3) · acc-db-repair-2026-06-05.md (eenmalige handmatige REINDEX)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 — orchestrator-inline, 2026-06-06.

### Completion Notes List

- AC1: `reindex_reference_embeddings()` in `apps/ml-service/app/services/database.py` (na `clear_reference_embeddings`) — indexnaam dynamisch via pg_indexes (`indexdef ILIKE '%ivfflat%'`), defensief gequoot; hook in `apps/ml-service/app/services/similarity.py` ná de rebuild-lus: alleen bij `processed > 0`; REINDEX-fout → `errors += 1` + log, geen raise. Tests: `test_rebuild_reindexes_after_storing_embeddings`, `test_rebuild_counts_reindex_failure_as_error_without_raising`
- AC2: bij `processed == 0` géén REINDEX + waarschuwing (index mogelijk gedegenereerd tot volgende gevulde rebuild). Test: `test_rebuild_skips_reindex_when_nothing_processed`
- AC3 (bewijs op ACC): **post-deploy verificatiestap** — kan pas na deploy van deze branch (rebuild draait bij container-start; handmatige rebuild op ACC = DB-mutatie, niet toegestaan binnen deze run). Verificatie: na deploy `docker exec <ml> python3 -` met `SET enable_seqscan=off; SELECT count(*) FROM reference_embeddings ORDER BY embedding <-> (SELECT embedding FROM reference_embeddings LIMIT 1) LIMIT 5;`-achtige similarity-query → > 0 rijen, plus log-regel "REINDEX complete for reference_embeddings index"
- Tests ondergebracht in `tests/test_crop_classification.py` (bestaand real-module-harnas; een tweede aparte loader bleek te conflicteren met het conftest-mock-mechanisme); bestaande rebuild-test bijgewerkt met de reindex-mock (gedrags-update door deze story, gedocumenteerd)
- Volledige suite: 15 failed (pre-existing baseline) · 54 passed (+3) · geen regressies

### File List

- apps/ml-service/app/services/database.py (reindex_reference_embeddings)
- apps/ml-service/app/services/similarity.py (hook in rebuild_reference_embeddings)
- tests/test_crop_classification.py (3 nieuwe tests + reindex-mock in bestaande rebuild-test)
