# Adversarial self-review — Story 13.5 (Kwaliteitspoort: regressietest, promotie, quarantaine)

reviewed_commit: (epic/vliegwiel-13 HEAD na 13.5-commit)
verdict: PASS
scope: apps/ml-service (regression_eval.py, flywheel.py, database.py) + apps/api (services/flywheel/{gate,promotion,baseline,config,types}.ts, ml-client.ts, promotion-batch.ts) + tests.

## Bevindingen per severity (alle gefixt)

### Critical
- **C1 — Whole-batch quarantaine ná reeds-gecommitte promotie (AD-3-schending).**
  Oorspronkelijk zat `promoteAndClose` binnen de fail-closed-`try`: een infra-fout
  op de batch-afsluit-UPDATE (of een gegooide kandidaat-transactie) zou de batch
  naar `quarantined` flippen terwijl er al atomair gepromoveerde, actieve
  referenties bestonden. FIX: (a) `promoteBatchCandidates` gooit niet meer op een
  gefaalde kandidaat-transactie — die rolde al atomair terug (AD-3), de kandidaat
  blijft `in_batch` en komt in `result.failed`; de rest van de batch draait door.
  (b) `promoteAndClose` staat nu BUITEN de fail-closed-try; de finale
  batch-afsluit-UPDATE is apart try-gewrapt en laat de batch bij falen `pending`
  (crash-recovery pakt 'm fase-idempotent weer op) — nooit alsnog quarantaine.
  Getest: `flywheel-promotion.test.ts` (failed-continues) + `flywheel-gate.test.ts`.

### High
- **H1 — Schaduwset-lek (adversarial F2).** De schaduwset moet strikt `in_batch`
  van DÉZE batch zijn. `loadShadowCandidates` filtert `rc.promotion_batch_id =
  :batchId AND rc.status = 'in_batch'` — gepromoveerde/afgewezen kandidaten kunnen
  niet meetellen. Nulmeting-modus stuurt bovendien `include_shadow=false` en de
  ml-service negeert dan de schaduwset volledig (getest, pytest
  `test_nulmeting_mode_ignores_shadow`).
- **H2 — Self-match-guard sluit niet uit → kunstmatige 100%.** `_is_self_match`
  sluit uit op inhouds-hash (beide zijden bekend + gelijk) én valt terug op
  identiek `cropPath` voor referentie-rijen zonder bekende hash. Getest (pytest
  `test_self_match_guard_prevents_100pct`, `..._by_crop_path`).
- **H3 — Embedding herberekend i.p.v. gekopieerd (AD-3).** De promotie kopieert de
  vector met raw SQL rechtstreeks van `candidate_embeddings` naar
  `reference_embeddings` (`INSERT ... SELECT ce.embedding`); geen model-aanroep.
  Geen kopieerbare embedding → gooit → transactie rolt terug (getest).

### Medium
- **M1 — Versie-guard-bron ondocumented.** De actieve modelversie = `ModelVersion`
  met `isActive=true`, veld `version`; vergeleken met `evidence.
  embeddingModelVersion` per kandidaat. Gedocumenteerd in de story-Dev-Notes en in
  `gate.ts:getActiveModelVersion`. Geen actief model → guard overgeslagen (geen
  versie om tegen te meten). Getest.
- **M2 — Fail-closed dekt de baseline-nulmeting niet.** `resolveBaseline` roept
  ook `measureBatch` (nulmeting) aan; een fout daar valt eveneens in de
  fail-closed-catch → quarantaine `systeem-fout` (lege gold-set/ml-down). Getest.
- **M3 — Dubbele embedding-kost op de allereerste batch.** Nulmeting + schaduw-
  meting embedden elk de gold-set. Aanvaard: eenmalig per eerste batch (AC 2 vereist
  de nulmeting); gedocumenteerd als bewuste afweging.

### Low
- **L1 — `rolled_back`-batch als baseline-bron (AD-5).** `resolveBaseline`
  selecteert uitsluitend `status='passed'` met `baselineMeasurement != NULL`,
  `orderBy closedAt desc` — `rolled_back`/`quarantined` tellen nooit. Getest.
- **L2 — variantLabel-template-tokens in code (AD-3-noot).** `buildVariantLabel`
  bouwt de string letterlijk uit `auto-` + korte batch-id + `-` + volgnummer; geen
  template-tokens. Getest.
- **L3 — Notificatie-idempotentie.** Quarantaine-notificatie dedupt op
  `triggerId = flywheel-batch-quarantined:{batchId}` (unique constraint op
  `RetrainingNotification.triggerId`); een tweede poging (bv. na re-run) is
  no-op. Non-fataal bij schrijffout.
- **L4 — ml-code onder `app/` (constraint 2).** `regression_eval.py` staat onder
  `app/services/`; endpoint onder `app/api/flywheel.py`. Geen gold-set-reads uit de
  DB (payload-only, AD-4); geen writes.

## Anti-loophole checks
- Geen dode code / debug-statements (alle `logger.*` zijn productie-logging).
- Geen secrets, geen nieuwe migratie (alle velden bestonden — 13.4-migratie).
- Graceful degradation: `reloadTemplates` best-effort; her-embed-enqueue
  best-effort; notificatie non-fataal.
- Volledige apps/api vitest-suite groen (406 passed, 2 pre-existing skipped);
  ml-service pure-pytest groen (regression_eval 12 + outlier 11 = 23 passed).
