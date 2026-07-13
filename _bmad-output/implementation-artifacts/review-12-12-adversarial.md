# Story 12.12 — Adversarial Review (Nutri-Score vorm-oogst)

reviewed_commit: PENDING_COMMIT_HASH
verdict: PASS
diff_scope: apps/ml-service (2 new files: `queue_harvest_nutriscore.py`, `test_queue_harvest_nutriscore_12_12.py`; 1 modified: `database.py` — new method only) + apps/api (1 test file extended, geen productiecode) + apps/web (1 new test file, geen productiecode) + 3 `_bmad-output`-docs (story/diagnose/spike) + sprint-status.yaml + versions.md

## Bevindingen (severity, bestand:regel, gefixt)

| Severity | Bestand:regel | Bevinding | Status |
|---|---|---|---|
| LOW | `queue_harvest_nutriscore.py` (initiële versie) | `import cv2` lazy/herhaald op 3 plekken (functie-lokaal) i.p.v. module-top zoals `queue_harvest.py` — stilistische inconsistentie, geen functioneel risico | GEFIXT vóór commit: `import cv2` naar module-top verplaatst, 3 lokale imports verwijderd; volledige ml-pytest-suite opnieuw groen ná de fix (80 passed, zelfde 7 pre-existing collection-errors) |
| LOW | `test_queue_harvest_nutriscore_12_12.py` (initiële versie) | `color_module`-fixture kon een echte-cv2-afhankelijke test laten falen wanneer een ANDERE, niet-gerelateerde suite (`test_bootstrap_search_service.py`) eerder in dezelfde pytest-sessie een fake `cv2` direct in `sys.modules` zet ZONDER `monkeypatch` (dus nooit teruggedraaid) — sessie-volgorde-afhankelijke test-pollutie, empirisch gereproduceerd (5 failures bij volledige-suite-run, 0 bij losse run) | GEFIXT: `color_module`-fixture verwijdert een eventueel gecachete `cv2` en forceert een verse, echte import via `monkeypatch` (die zelf wél netjes terugdraait); geverifieerd met `test_bootstrap_search_service.py` + mijn suite samen (37 passed) én de volledige suite (80 passed, kleur-heuristiek-tests GREEN) |
| INFO | `queue_harvest_nutriscore.py` vs `queue_harvest.py` | Beide scripts scannen onafhankelijk hetzelfde `artwork/`-corpus met eigen offset-state; een regio kan in theorie door BEIDE harvesters als kandidaat worden ingezet (bv. een groen logo dat zowel als reguliere top-N-code als Nutri-Score-vorm matcht) — een cosmetische dubbele review-rij, geen data-integriteitsrisico | Geaccepteerd zonder fix: `queue_harvest.py` zelf heeft ook geen cross-harvester-dedup (alleen intra-run per-code-cap); gold-set/hard-negative-kleppen zitten downstream op het accept/reject-pad (`artwork-pipeline.ts`), niet op harvest-insert — dat pad is voor BEIDE harvesters identiek en ongewijzigd. Buiten scope van 12.12 (zou een aparte cross-harvester-dedup-story zijn) |
| INFO | `t3777_code = 'NUTRISCORE'` (placeholder) | Bare `NUTRISCORE` is geen GS1-code — gecheckt op collisie met bestaande `reference_logos`/`keurmerk-codes.ts`/`spoor-codes.ts`-entries: geen match. `buildProvenance`/`PROVENANCE_METHODS` (api, `provenance.ts`) checkt dit veld NIET — `processAcceptedReviewItems` hardcodet `method: 'human'` bij accept ongeacht de oorspronkelijke `artwork_review_items.method`-waarde, dus `'embedding-shape'` (mijn nieuwe method-waarde) raakt geen enum-validatie | Geen fix nodig — geverifieerd via codepad-inspectie (`artwork-registration.ts:151-158`) |

Geen CRITICAL/HIGH/MEDIUM bevindingen.

## Dimensie-checklist

- **Cross-story-consistentie:** hergebruikt de bestaande review-insert-vorm (`artwork_review_items`, status `'open'`, kolommen identiek aan 19.10) en het bestaande accept→referentie-pad (19.8/19.12) ONGEWIJZIGD. `find_similar_references_by_codes` is een NIEUWE, aparte methode naast `find_similar_references` — geen wijziging aan de bestaande methode of haar callers (19.9 conditie C, 19.10 harvest, gate-v2 blijven op de ongewijzigde methode).
- **Regressies:**
  - ml-pytest: baseline (zónder 12.12-bestand) 63 passed/13 skipped/7 pre-existing collection-errors → mét 12.12: 80 passed/13 skipped/dezelfde 7 errors. `test_queue_harvest_19_10.py` (Story 19.10) ongewijzigd en blijft 9/9 groen (apart + in volledige suite geverifieerd).
  - api-vitest: volledige suite 912 passed/0 failed (was al groen; alleen tests toegevoegd, geen productiecode).
  - web-vitest: volledige suite 128 passed/0 failed (was al groen; alleen een nieuw testbestand toegevoegd).
  - tsc --noEmit: 0 errors (api + web), geverifieerd ná `prisma generate` (omgevingsstap, geen codewijziging).
- **Integratiegrenzen:** geen wijziging aan het ML-service-HTTP-contract, geen wijziging aan de storage-padstructuur behalve een NIEUW, apart prefix (`artwork-crops/{gtin}/12_12_*.png`) en een NIEUWE, aparte MinIO-state-key (`keurmerk-harvest/nutriscore-state.json`) — geen collisie met `keurmerk-harvest/state.json` (19.10).
- **Deployment-volgorde:** het nieuwe script is een handmatig aanroepbaar `python -m app.services.queue_harvest_nutriscore` (geen scheduled-task-registratie in deze story — Task 7/ACC-run is permission-gated en niet uitgevoerd). Deploybaar zonder volgorde-afhankelijkheid t.o.v. andere epics; de nieuwe `database.py`-methode is additief (geen schema-migratie, geen bestaande query gewijzigd).
- **Security/secrets:** geen nieuwe endpoints/auth-oppervlak. De nieuwe SQL (`find_similar_references_by_codes`) is volledig parameterized (`$1`/`$2`/`$3::text[]`), geen string-interpolatie — zelfde patroon als de bestaande `find_similar_references`.
- **Concurrency/idempotency:** identiek aan queue_harvest.py's bewezen patroon (disjuncte GTIN-batches per state-offset, geen gedeelde mutable state tussen runs); DRY_RUN-pad expliciet getest (muteert niets, óók de nieuwe state-key niet).
- **Performance:** zelfde kostenprofiel per regio als queue_harvest.py (1 gate-check + 1 pgvector-nearest-neighbour-query per kandidaat-regio) — de scoped query (`t3777_code = ANY(...)`, 5-code-pool) is naar verwachting GOEDKOPER dan de ongescoopte `find_similar_references` (kleinere effectieve kandidatenset ondanks dezelfde ivfflat-index/probes-instelling).
- **Ongebruikte code:** geen — `matched_code` wordt bewust alleen gebruikt om de similarity/confidence te bepalen (het matchresultaat zelf bepaalt niet de opgeslagen code; dat is de HSV-kleur-gok, per ontwerp — zie story Dev Notes "provisionele code").
- **Ontbrekende tests:** geen, zie AC→test-trace hieronder.
- **Afwijkingen van architectuur/AC's:** geen wijziging aan `queue_harvest.py` (19.10-scoping), `bootstrap_search.py` (conditie C, 19.9), `keurmerk_gate.py` (gate-v2) — git-diff bevestigt dit (zie diff_scope hierboven, geen van deze bestanden in de diff).

## Acceptance-audit (per AC)

| AC | Dekking | Status |
|----|---------|--------|
| AC1 (vorm-scoping, cap) | `test_ac1_matcht_tegen_de_vaste_5_letter_pool_niet_tegen_alles`, `test_ac1_default_floor_is_060`, `test_ac1_kalibreerbare_floor_via_env`, `test_ac1_letter_onafhankelijk_elke_letter_telt_mee`, `test_ac4_per_bucket_cap_gehandhaafd`, `test_ac4_cap_is_per_bucket_niet_globaal` | GREEN |
| AC2 (mens kiest letter, review-confirmed ref) | `test_ac2_provisionele_code_landt_als_open_review_item`, `test_ac2_onduidelijke_kleur_valt_terug_op_placeholder` (ml) + `MobileReviewDeck.nutriscore-12-12.test.tsx` (web, picker toont 5 letters + stuurt de gekozen letter mee) + `artwork-pipeline.routes.test.ts` (api, accept-override → registerReference met de gekozen letter) | GREEN |
| AC3 (C/D over k=3 → conditie C herkent, geen wijziging aan conditie C) | Bewezen door redenering + git-diff: `bootstrap_search.py` NIET aangeraakt; de accept→referentie-flow (19.8/19.12, `artwork-pipeline.ts`) is generiek per code, al gedekt door bestaande + nieuwe api-tests | GREEN (redenering + bestaande/nieuwe tests; live-bewijs is AC6, permission-gated) |
| AC4 (kleppen ongewijzigd, aparte modus) | `test_ac4d_gate_voorfilter_blijft_ervoor` + git-hard: `queue_harvest.py`/`bootstrap_search.py`/`keurmerk_gate.py` niet in de diff; apart script (geen env-vlag in de nachtrun) | GREEN |
| AC5 (tests: scoping, provisionele code, DRY_RUN, cap) | Alle 17 nieuwe ml-pytest-tests (zie Debug Log) + gates (ml-pytest 80/80 relevant groen, api-vitest 912 groen, web-vitest 128 groen, tsc 0) | GREEN |
| AC6 (live DRY_RUN + run op ACC) | NIET uitgevoerd — permission-gated, geen toestemming ontvangen binnen deze run | **PENDING PERMISSION** |

## Fix-log

- `apps/ml-service/app/services/queue_harvest_nutriscore.py`: `import cv2` van 3x functie-lokaal naar 1x module-top verplaatst (consistentie met `queue_harvest.py`) — meegenomen in de initiële commit (geen aparte fix-commit, nog niet eerder gecommit).
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_12_12.py`: `color_module`-fixture gehard tegen sessie-brede cv2-stub-pollutie van `test_bootstrap_search_service.py` — meegenomen in de initiële commit.

Beide fixes zijn toegepast VÓÓR de initiële commit van deze story (er was nog geen eerdere commit om te herstellen) — de reviewed_commit hieronder is dus de commit die de gefixte versie bevat.
