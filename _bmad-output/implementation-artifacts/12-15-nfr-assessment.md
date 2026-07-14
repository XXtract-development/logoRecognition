# NFR-assessment — Story 12.15 (declaratie-gedreven Nutri-Score-oogst)

reviewed_commit: f64b8df

## Security

- **Geen nieuwe secrets/credentials.** `build-nutriscore-declared-map.ts` hergebruikt `resolveDeclaredMarks` (bestaande `CATALOG_API_KEY`-envelope, nooit gelogd/gedefault — ongewijzigd). Geen nieuwe API-keys of tokens geïntroduceerd.
- **SQL-injectie:** `review_item_exists` (database.py) gebruikt uitsluitend geparametriseerde `asyncpg`-queries (`$1/$2/$3`), geen string-concatenatie — consistent met de rest van `database.py`.
- **Geen PII-lekrisico:** GTIN/letter/source_file zijn productmetadata, geen persoonsgegevens. Logregels (`logger.warn`) loggen GTIN + reden, geen catalog-response-payloads.
- **ACC-schrijf/registratie/deploy:** géén — beide nieuwe scripts zijn puur additief, hebben een `require.main`/`__main__`-CLI-guard, en zijn in deze story-scope NOOIT aangeroepen tegen ACC (permission-gated, expliciet niet uitgevoerd). **Status: PASS.**

## Performance

- **Tijdsbudget:** de Python-oogst hergebruikt het bewezen `MAX_SECONDS`-wall-clock-budget-patroon (12.12/19.10) — een run stopt netjes binnen het scheduled-task-tijdslot i.p.v. te overrunnen.
- **Batchbegrenzing:** `NUTRISCORE_DECLARED_HARVEST_BATCH` (default 400) begrenst het aantal GTINs per run; ruim boven de verwachte C/D-scope (22+16=38), dus een enkele batch dekt de story-scope in de praktijk.
- **TS-map-bouw:** `getGtinLimit()` (default 2000) begrenst het GTIN-universum per bouw-run; elke GTIN kost één (gecachete, fail-safe) catalog-fetch — consistent met het bestaande `build-keurmerk-index.ts`-precedent (limiet 500, hier ruimer omdat de GTIN-set groter is: ~1.862 volgens de dekkings-index).
- **Geen N+1-databasequery-explosie:** `review_item_exists` is één query per kandidaat (na de cap-check, dus alleen voor kandidaten die al onder de cap vallen) — geen onbegrensde fan-out. **Status: PASS.**

## Reliability / Fail-safe gedrag

- **Geen fabricatie (AC3):** een GTIN zonder regio boven de confidence-drempel wordt volledig overgeslagen — kernvereiste van deze story, expliciet getest (`test_ac3_*`).
- **Fail-safe declaratie-map-laadpad:** `_load_declared_map` (Python) vangt elke lees-/parse-fout af en levert een lege map (0 kandidaten, geen crash) — getest (`test_ac1_declaratie_map_ontbreekt_of_corrupt_geeft_0_kandidaten_geen_crash`).
- **Fail-safe per-GTIN-lookup (code-review-fix):** `collectDeclaredMap` (TS) ving oorspronkelijk GEEN fout per GTIN — één falende catalog-lookup brak de hele ~2000-GTIN-run af zonder output. Gefixt (commit f64b8df): elke GTIN individueel gevangen, fout classificeert als `fout`-uitkomst, de run gaat door. Getest.
- **Idempotentie (AC4, code-review-fix):** `review_item_exists` was oorspronkelijk gescoped op `(gtin, t3777_code, source_file)` — een herbouwde declaratie-map die voor dezelfde GTIN een ANDERE letter oplevert zou dan een TWEEDE, tegenstrijdig review-item hebben ingevoegd. Gefixt: gescoped op `(gtin, reason, source_file)` (deze oogst se eigen marker), zodat een herdraaien met een gewijzigde letter correct wordt herkend als "deze pagina is al verwerkt", zonder andere harvesters' review-items op dezelfde pagina te blokkeren. Getest (2 nieuwe regressietests).
- **Bekende, gedocumenteerde restrisico's (niet gefixt, bewust):**
  - **TOCTOU-race** op de SELECT-vóór-INSERT-idempotentiecheck: geen DB-unique-constraint erachter. Consistent met ELK ander harvest-script in deze codebase (`queue_harvest.py`, `queue_harvest_nutriscore.py`) — geen van beide heeft een unique-constraint op `artwork_review_items`. Een generieke tabel-brede unique-constraint zou bovendien ONVEILIG zijn (een pagina kan legitiem meerdere review-items voor verschillende keurmerken van verschillende harvesters dragen); een correct gescoped partial-index is een schema-beslissing buiten deze story's scope. Laag praktisch risico: handmatig gestart, single-operator CLI-script.
  - **Offset/batch-hervatting kan een GTIN overslaan** als de scope tussen runs wijzigt (zelfde ontwerp-eigenschap als 19.10/12.12's offset-cursor). Bij de kleine, expliciete C/D-scope (38 GTINs, batch-default 400) is de praktische impact verwaarloosbaar (één batch dekt de hele scope).
  - **Geen per-item try/except in de insert-lus** — matcht exact het precedent van beide hergebruikte sibling-scripts (12.12/19.10); geen nieuwe regressie.
  **Status: PASS** (met bovenstaande bewust-geaccepteerde, precedent-consistente restrisico's, expliciet gedocumenteerd — geen stille gaten).

## Maintainability

- **Architectuur (optie B) minimaliseert duplicatie:** hergebruikt `resolveDeclaredMarks` (TS) en `find_similar_references_by_codes`/region-proposer/gate (Python) ONGEWIJZIGD; alleen een smalle koppel-laag (map-bouw + label-vervanging) is nieuw.
- **Volgt bestaande conventies:** pure-core/injecteerbare-deps/`require.main`-CLI-guard-patroon (precedent `build-keurmerk-index.ts`/`backfill-gln-from-tradeitems.ts`); env-var-config/DRY_RUN/per-code-cap-patroon (precedent `queue_harvest.py`/`queue_harvest_nutriscore.py`).
- **Documentatie:** uitgebreide docblocks leggen de architectuurkeuze, de idempotentie-scoping-redenering en de code-review-fixes uit — herleidbaar zonder de conversatiegeschiedenis.
- **Testdekking:** 39 nieuwe tests (19 TS + 20 Python), inclusief expliciete regressietests voor beide code-review-fixes. **Status: PASS.**

## Samenvatting

| Categorie | Verdict |
|---|---|
| Security | PASS |
| Performance | PASS |
| Reliability | PASS (met gedocumenteerde, precedent-consistente restrisico's) |
| Maintainability | PASS |

**Overall: PASS.** Geen blokkerende NFR-bevindingen. De twee code-review-fixes (idempotentie-scoping, fail-safe map-bouw) waren de enige materiële reliability-gaten en zijn beide gefixt + getest vóór deze assessment.
