# Deferred Work

## Deferred from: code review of story-19-5 (2026-07-06)

- **Normaliseer `t3777Code` in de flywheel-declaratie-guard.** In `apps/api/src/services/flywheel/bootstrap-run.ts:253` vergelijkt de guard `m.code === t3777Code` strikt. `m.code` is via `parseDeclaredMarks` altijd `trim().toUpperCase()`, maar de `t3777Code`-kant (uit `bootstrap_queue`-seed) is niet expliciet genormaliseerd. Bestaand gedrag (geen 19.5-regressie; identiek aan de oude `codes.includes`); de sampler-caller is veilig omdat `buildIndex` de code uppercaset. Rest-risico: een lowercase/ongetrimde `bootstrap_queue.t3777Code` → guard matcht niet → GTIN onterecht overgeslagen. Fix-optie: `t3777Code.trim().toUpperCase()` in de guard, of uppercase borgen bij de queue-seed. Bron: Edge Case Hunter, code review 19.5.

## Deferred from: code review of 19-14-ivfflat-index-onder-fetch (2026-07-11)

- Schema-drift: de ivfflat-index `idx_reference_embeddings_embedding` staat niet in de Prisma-migraties (alleen ad-hoc op ACC + `infrastructure/docker/postgres/init.sql` op het dev-schema `logos.`). Een schone Prisma-provisioning heeft geen ivfflat-index → seqscan (correct, maar de `lists`-tuning is niet reproduceerbaar). Opvolg: index via migratie definiëren met `lists≈√N` óf bewust op seqscan leunen bij deze schaal.
- `find_similar_logos` (`apps/ml-service/app/services/database.py:351`, tabel `logo_embeddings`) deelt exact hetzelfde `ORDER BY <=> LIMIT`-patroon zonder de probes-fix. `logo_embeddings` heeft nu géén ivfflat-index (detector niet geraakt), maar zodra die ooit wordt toegevoegd keert dezelfde onder-fetch terug — ongepatcht en ongetest.
- Performance: `probes = lists` schakelt het sublineaire ivfflat-voordeel uit (brute-force door de index). Prima bij ~215 referenties; bij duizenden scant elke classify/harvest-call de hele index. Overweeg telemetrie/bovengrens bij groei.
- Geen lege/verkeerd-gedimensioneerde-embedding-guard op de queryvector in `find_similar_references` (pre-existing; ook in `find_similar_logos`).

## Deferred from: code review of 19-12-menselijke-accept-directe-referentie (2026-07-11)

- **promoteOne mist een storage_path-idempotentie-guard** (`apps/api/src/services/flywheel/promotion.ts:173-182`): maakt een `flywheel-promotion`-ref met alleen een class-cap-check, geen storage_path/near-dup-guard. Voor 19.12 opgelost door de nominatie bij accept te laten vervallen, maar als defensieve invariant voor de promotie-transactie waardevol (voorkomt duplicaten uit élke toekomstige nominatiebron). Eigen story + test.
- **"Altijd een referentie" faalt stil bij een ml-hapering** (`artwork-pipeline.ts` accept/annotate registerReference best-effort try/catch): bij ml-service down blijft het item `registered` zonder ref en zonder retry/backfill; herstel kan alleen via reopen (dat deactiveert juist). Overweeg een retry-/backfill-pad voor mislukte registraties.
- **Gecorrigeerde her-annotatie wordt stil genegeerd**: deterministische cropkey `annot_{id}.png` + idempotente `register_crop_as_reference` (storage_path-guard) → een tweede annotatie met gecorrigeerd kader overschrijft het object maar krijgt `added:false` en behoudt de oude embedding als actieve referentie. Overweeg een reset/vervang-pad bij her-annotatie.
- **`t3777Code`-override niet gevalideerd** vóór registratie (`artwork-pipeline.ts:1061/1177`): een typefout/onbekende code wordt direct een actieve referentieklasse. Pre-existing (override werd altijd toegepast), maar de altijd-aan registratie omzeilt nu de vroegere nominatie-crosscheck. Overweeg codelijst-validatie.
- **Accept-pad mist een idempotentie-guard equivalent aan het reject-pad** (M1): een crop-met-maar-zonder-sourceFile blijft `accepted` (niet `registered`) → retry/dubbelklik dubbel-telt de gold-set-aanwas (14.2-bewaking). ml-registratie zelf is idempotent.
- **AC-dekking source='review-confirmed' + embedding**: geverifieerd op codeniveau in de ml-service (`similarity.py` register_crop_as_reference default source + embedding-insert), maar niet in een test (Node-routetests mocken de ml-grens; ml-service heeft geen register-test). Wordt post-deploy read-only bevestigd (Task 4).
