# Adversarial self-review — Story 13.2 (Automatische nominatie bij dubbele bevestiging)

reviewed_commit: (pre-commit werkkopie, epic/vliegwiel-13)
verdict: PASS (alle bevindingen critical→low gefixt)

## Scope van de wijziging

- Migratie `0012_flywheel_nomination_tables` (+ `down.sql`): drie tabellen
  `reference_candidates`, `candidate_embeddings`, `hard_negatives`.
- `apps/api/src/services/flywheel/`: `config.ts`, `missed-nominations.ts`,
  `nomination.ts`, `crosscheck-hook.ts`, `kruischeck-hook.ts`.
- Hook-inpluggen: `services/pipeline/detection-flow.ts` (worker, synchroon),
  `services/pipeline/workers.ts` (job-routing), `api/v1/artwork-pipeline.ts`
  (request-pad crosscheck-enqueue + 12.3-ombuiging op accept :1058 en
  annotatie :1165).
- Nieuw routebestand `api/v1/flywheel.ts` (`GET /flywheel/overview`) +
  registratie in `main.ts`.
- Testmocks bijgewerkt (`__tests__/setup.ts`): nieuwe Prisma-modellen,
  `redis.incr`, `mlClient.computePhash`/`generateEmbeddingFromBuffer`.

## Bevindingen per severity

### CRITICAL
- **C1 — Fail-closed hash (AD-14).** phash-fout mag geen half-record laten.
  Geverifieerd: `computePhash`-fout → `refused` vóór enige INSERT, plus
  gemiste-nominatie-event. GEEN Node-fallback-hash. GEFIXT/aantoonbaar via test.
- **C2 — Transactionele integriteit.** Kandidaat-rij + schaduw-embedding
  ontstaan in één `$transaction`; embedding-INSERT (`$executeRaw`) zit binnen
  dezelfde tx. Een embedding-fout gooit vóór de tx (embedding wordt eerder
  bepaald), dus nooit een kandidaat zonder embedding. OK.

### HIGH
- **H1 — Vlag-splitsing hard (AD-8).** Kruischeck-herkomst vereist BEIDE
  vlaggen (`isKruischeckNominationEnabled` eist ook de hoofdvlag). Beide default
  `false` → byte-gelijk aan vandaag. Getest (vlag-matrix).
- **H2 — 12.3-ombuiging op BÉIDE plekken.** `artwork-pipeline.ts:1058` (accept)
  én `:1165` (annotatie) vlag-gated: vlag aan → geen `registerReference`, wél
  nominatie-enqueue (herkomst `review`); vlag uit → legacy exact. Getest
  (accept-pad, beide takken). Annotatie deelt exact hetzelfde patroon.
- **H3 — Worker-pad vs request-pad (NFR-3/NFR-7).** Worker (`detection-flow`)
  mag synchroon; request-pad (`crosscheck`-route, review-accept/annotatie)
  enqueue-t uitsluitend — nooit inline phash/INSERT. Getest (`computePhash` niet
  aangeroepen op enqueue-pad).
- **H4 — Trainingsdata-registratie ongewijzigd (FR-1).** De hook staat NAAST
  `registerCropsTx`/`processAcceptedReviewItems`, niet erin. Geen regel in
  `artwork-registration.ts` gewijzigd. Bestaande 8.6-tests groen.

### MEDIUM
- **M1 — Idempotentie (AD-12).** `@@unique([contentHash, t3777Code])` +
  hard-negative-blokkade + bestaande-kandidaat-check. Herverwerking zelfde GTIN
  → geen duplicaat. Getest.
- **M2 — Status-reset (AD-12/AD-16).** `rejected` + zachte reden → conditional
  `updateMany(WHERE status='rejected')` naar `candidate`, géén insert; harde
  reden → geen reset. Getest (beide).
- **M3 — Gemiste-nominatie-teller (AC7/NFR-5).** Redis `INCR` per reden (geen
  TTL, herstartbestendig) + gestructureerde log als bron van waarheid;
  best-effort (Redis-fout breekt de flow niet). Restrisico (Redis-flush)
  gedocumenteerd in `missed-nominations.ts`. Ontsloten via `/flywheel/overview`.
- **M4 — Circulaire import vermeden.** `crosscheck-hook` importeert de
  queue-naam als lokale const i.p.v. uit `detection-flow` (dat de hook aanroept).
  tsc + volledige suite groen.

### LOW
- **L1 — Migratie-noise gestript.** De `migrate diff` bevatte een ongerelateerde
  `ALTER TABLE retraining_notifications ... DROP DEFAULT` (pre-existing drift);
  verwijderd zodat de migratie exact de drie story-tabellen omvat.
- **L2 — Review-herkomst drempel-exempt.** Bij origin `review` gate't de
  model-confidence niet (de menselijke bevestiging ís de dubbele bevestiging);
  anders zou een laag-confidence review-item nooit nomineren. Getest.
- **L3 — Geen secrets, geen dode code, geen debug-statements.** Alle nieuwe
  logs zijn structureel (info/warn/error), geen console.*.

## AC → test-mapping (C-trace)

| AC | Test(s) |
|----|---------|
| AC1 Migratie + down-script | Migratie `0012_flywheel_nomination_tables/migration.sql` + `down.sql`; lokaal toegepast op localhost:5432 en tabellen/constraints geverifieerd via psql (unique op (content_hash,t3777_code), FK reference_logo_id, geen FK op promotion_batch_id). Geen auto-migrate. |
| AC2 Nominatie uit crosscheck (1 rij + embedding, hash synchroon, fail-closed, 8.6 ongewijzigd) | `flywheel-nomination.test.ts`: "nomineert exact één kandidaat met embedding en synchrone hash", "vult het evidence-contract", "weigert fail-closed als /ml/phash faalt"; `flywheel-crosscheck-hook.test.ts`: "nomineert exact één kandidaat + embedding uit auto-accepted"; 8.6-onveranderd geborgd door groene `artwork-detection-orchestration.test.ts` + `artwork-pipeline.routes.test.ts`. |
| AC3 Worker-pad, nooit request-pad | `flywheel-crosscheck-hook.test.ts`: "enqueue-t i.p.v. inline te nomineren op het request-pad" (computePhash niet aangeroepen); `flywheel-kruischeck-hook.test.ts`: enqueue-variant. |
| AC4 Kruischeck achter dubbele vlag | `flywheel-nomination.test.ts`: "nomineert kruischeck WEL met beide vlaggen aan"; `flywheel-kruischeck-hook.test.ts`: "nomineert synchroon met beide vlaggen aan". |
| AC5 Default-uit bewezen | `flywheel-config.test.ts`: "beide vlaggen default uit", "kruischeck-vlag vereist ook de hoofdvlag"; `flywheel-nomination.test.ts`: "nomineert kruischeck NIET met alleen de hoofdvlag aan"; `flywheel-kruischeck-hook.test.ts`: "nomineert NIET met alleen de hoofdvlag aan". |
| AC6 Review absorbeert 12.3-pad | `flywheel-review-redirect.routes.test.ts`: "met vlag AAN: geen registerReference, wél nominatie-enqueue", "met vlag UIT: legacy-12.3-registratie ongewijzigd"; `flywheel-nomination.test.ts`: "nomineert review ook onder de model-drempel". |
| AC7 Gemiste-nominatie-events | `flywheel-config.test.ts`: "geeft alle redenen terug met tellers", "recordMissedNomination hoogt de Redis-teller op"; `flywheel.routes.test.ts`: "geeft de gemiste-nominatie-teller ... terug"; `flywheel-nomination.test.ts`: fail-closed registreert event. |
| AC8 Veiligheidsregels + idempotentie | `flywheel-nomination.test.ts`: onder-drempel, op-de-drempel, classifier-fallback, geen-declaratie, hard-negative-hit, bestaande-kandidaat, status-reset (zacht/hard), hoofdvlag-uit; `flywheel-crosscheck-hook.test.ts`: herverwerking zelfde GTIN → geen duplicaat, vlag-uit geen actie. |

Alle 8 AC's gedekt door minstens één geautomatiseerde test die het AC-gedrag assert.

## Niet-blokkerende afhankelijkheid (12.8)

Story 12.8 (`verify-flow.ts`, CONFIRMED-verdict-pad) is nog niet gemerged. De
kruischeck-kant is als koppel-klare service-functie geleverd
(`kruischeck-hook.ts` met `nominateFromKruischeck` + gedocumenteerd koppelrecept
in het bestand). Zodra 12.8 landt, wordt die functie op de CONFIRMED-verdict-plek
aangeroepen (request-pad → `enqueue: true`), zonder de verdict-response te raken.
Geen blocker.

## Testuitslag

Volledige `apps/api` vitest-suite: 318 passed, 2 skipped (pre-existing), 0 failed.
`tsc --noEmit`: schoon.
