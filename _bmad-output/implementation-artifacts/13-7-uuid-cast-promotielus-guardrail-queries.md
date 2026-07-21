# Story 13.7: uuid=text-fix in de promotielus-guardrailquery's (Postgres 42883)

Status: done

<!-- Aangemaakt via create-story workflow, 2026-07-21. Bugfix-story op afgeronde Epic 13 (vliegwiel). Bron: read-only diagnose 2026-07-21 op ACC (geheugen project_flywheel_two_findings_20260721) + broncode-lokalisatie. Epic-13 heropend van 'done' → 'in-progress' voor deze fix. Vereist: 13.4 (promotielus/guardrails) en 13.5 (regressiepoort) — beide done. -->

## Story

Als **datamanager**
wil ik **dat de nachtelijke promotielus zijn guardrail-fasen op Postgres foutloos doorloopt**
zodat **beoordeelde referentiekandidaten daadwerkelijk gepromoveerd of gequarantaineerd worden en het vliegwiel niet stilvalt op een verborgen SQL-typefout**.

### Afbakening (kritiek)

- Deze story is **migratie-vrij** en **gedrag-behoudend**: het is een pure typefix in twee bestaande raw SQL-query's plus de test die hem had moeten vangen. Er verandert géén businesslogica, geen schema, geen fase-volgorde, geen drempel.
- **Root cause is al gelokaliseerd** (zie Dev Notes). De story hoeft niet opnieuw te diagnosticeren; hij fixt de twee bekende query's en dicht het testgat dat ze verborg.
- Het **legen van de vastgelopen batch `12e27fbc-…`** op ACC is een **operationele vervolgstap ná deploy** (enqueue `flywheel-promotion`). Dat is een ACC-schrijfactie en valt buiten de code-scope: hij staat als verificatietaak in taak 5, maar wordt pas uitgevoerd na expliciete go van Friso (per-geval-toestemming, ACC-write).
- De fix moet ook een eventuele **derde, nog niet-gevonden** uncast uuid-vergelijking in de guardrail-/regressie-keten afdekken: taak 1 begint met een gerichte sweep, niet met een aanname dat het bij twee blijft.

## Acceptatiecriteria

1. **Beide bekende query's casten naar uuid.** Given de guardrail-fasen `dedup` (trap-2-cosine) en `outlier`, when de promotielus deze query's op Postgres uitvoert met een niet-lege id-lijst, then vergelijkt elke `reference_candidate_id`-`IN`/`ANY`-clausule een `uuid`-kolom met `uuid`-waarden (geen impliciete `uuid = text`), zodat Postgres-fout `42883 operator does not exist: uuid = text` niet meer optreedt — concreet: `guardrails.ts::hasCosineDuplicate` (survivor-arm) en `guardrails.ts::loadCandidateEmbeddings`.
2. **Geen resterende uncast uuid-vergelijking in de vliegwiel-keten.** Given een sweep over alle raw SQL in `apps/api/src/services/flywheel/`, when een id-array of scalar-id tegen een `uuid`-kolom wordt vergeleken, then draagt elke zo'n vergelijking een expliciete cast (`::uuid` / `::uuid[]`) of gelijkwaardige typing; afwijkingen zijn óf gefixt óf met reden gedocumenteerd (bv. kolom is geen uuid).
3. **Postgres-niveau regressietest die de bug reproduceert.** Given een test die de gefixte query's tegen een echte Postgres (met de vliegwiel-schema's) uitvoert, when de test op de pre-fix-code zou draaien, then faalt hij met `42883`; op de gefixte code slaagt hij. Deze test draait NIET tegen de bestaande volledig-gemockte Prisma (waar `$queryRaw` een stub is en de SQL nooit door Postgres geparsed wordt) — juist dát mock-gat liet de bug door.
4. **Gedrag ongewijzigd op de bestaande suite.** Given de bestaande apps/api-testsuite, when de fix is toegepast, then blijft de suite groen (geen regressie in guardrail-/poort-gedrag); de betekenis van de query's (welke rijen ze teruggeven) is identiek — alleen de typering verandert.
5. **Deploy-volgorde en bewijs.** Given de fix, when hij naar ACC gaat, then via de vaste keten (Engelse commit; `versions.md` in dezelfde commit; ghcr-build-workflow vóór Coolify-deploy; deploy api), en then wordt ná deploy — met expliciete go van Friso — de promotielus éénmaal getriggerd (`flywheel-promotion` op queue `flywheel`) om batch `12e27fbc-…` te legen, met het resultaat (gepromoveerd/gequarantaineerd per kandidaat + lege/gevorderde batch) vastgelegd in het Dev Agent Record.

## Tasks / Subtasks

- [ ] 1. Lokaliseren & sweep (AC: 1, 2)
  - [ ] 1.1 Bevestig de twee bekende plekken: `apps/api/src/services/flywheel/guardrails.ts:432` (`hasCosineDuplicate`, survivor-arm: `WHERE ce.reference_candidate_id IN (${Prisma.join(otherSurvivors)})`) en `:538` (`loadCandidateEmbeddings`: `WHERE reference_candidate_id IN (${Prisma.join(candidateIds)})`).
  - [ ] 1.2 Sweep `apps/api/src/services/flywheel/*.ts` op álle `Prisma.join(...)`, `IN (${...})` en scalar-interpolaties tegen `uuid`-kolommen; leg vast welke al gecast zijn (bv. `gate.ts:369` `${batchId}::uuid`, `guardrails.ts:444` `${candidateId}::uuid`, `reembed.ts`/`promotion.ts`/`nomination.ts` `::uuid`) en welke niet.
  - [ ] 1.3 Reproduceer het faalpad éénmalig tegen Postgres (lokaal of ACC read-pad) om het exacte fase-punt te bevestigen (dedup trap-2 survivor-arm en/of outlier `loadCandidateEmbeddings`); dit is diagnose, geen write.
- [ ] 2. Fix (AC: 1, 2, 4)
  - [ ] 2.1 Cast de survivor-arm in `hasCosineDuplicate`: vergelijk `reference_candidate_id` (uuid) met een uuid-getypeerde lijst. Kies de idiomatische vorm binnen dit codebestand — `= ANY(${otherSurvivors}::uuid[])` (past bij `= ANY(${CLONE_GAP_SOURCES})` op `guardrails.ts:456`) óf `IN (${Prisma.join(otherSurvivors.map((id) => Prisma.sql`${id}::uuid`))})` — en pas hem consistent toe. Documenteer de keuze.
  - [ ] 2.2 Cast idem in `loadCandidateEmbeddings` (`:538`).
  - [ ] 2.3 Fix eventuele extra plekken uit de sweep (taak 1.2) met dezelfde vorm.
  - [ ] 2.4 Verifieer dat de teruggegeven rijen semantisch identiek zijn (self-match-uitsluiting, `embedding IS NOT NULL`, klasse-filter blijven exact gelijk) — dit is een typefix, geen queryherziening.
- [ ] 3. Test die het gat dicht (AC: 3, 4)
  - [ ] 3.1 Voeg een Postgres-niveau regressietest toe die `hasCosineDuplicate` (met ≥2 survivor-ids in dezelfde klasse, zodat de survivor-arm daadwerkelijk meedraait) en `loadCandidateEmbeddings` (met ≥1 id) tegen een échte Postgres uitvoert. Bevestig dat de test op de pre-fix-query faalt met `42883` en op de gefixte query slaagt.
  - [ ] 3.2 Kies de harness die past bij dit project (er is nu géén pg-integratieharnas; alle apps/api-tests mocken Prisma volledig — `src/__tests__/setup.ts:294` `$queryRaw: vi.fn().mockResolvedValue([])`). Opties: (a) een aparte pg-integratietestlaag (bv. lokale Postgres via docker-compose `infrastructure/docker/postgres` / testcontainer), of (b) een minimale gerichte harness alleen voor deze twee query's. Documenteer de keuze en waarom de bestaande gemockte suite dit type fout per definitie niet kan vangen.
  - [ ] 3.3 Bevestig dat de bestaande apps/api-suite groen blijft (AC 4).
- [ ] 4. Bookkeeping (AC: 5)
  - [ ] 4.1 `versions.md` (Nederlands, eindgebruikersperspectief, nieuwste bovenaan) in dezélfde commit als de codefix.
  - [ ] 4.2 Engelse commit + signature/co-author conform team-standaard; één commit, één push.
- [ ] 5. Deploy & ACC-verificatie (AC: 5) — **ACC-write, pas ná expliciete go van Friso**
  - [ ] 5.1 Wacht op de ghcr-build-workflow ('Build and Push Docker Images') vóór de Coolify-deploy (anders draait ACC oude code).
  - [ ] 5.2 Trigger de promotielus éénmaal: enqueue `flywheel-promotion` (leeg payload) op queue `flywheel` (BullMQ, `REDIS_URL`), in de app-container.
  - [ ] 5.3 Verifieer read-only dat batch `12e27fbc-…` niet meer op `pending` staat en dat de 9 `in_batch`-kandidaten (TRIMAN, RAINFOREST_ALLIANCE_PEOPLE_NATURE, RECYCLABLE_GENERAL_CLAIM, SEPARATE_COLLECTION, PREGNANCY_WARNING) gepromoveerd of gequarantaineerd zijn; leg de uitkomst + `gateResults`-JSON vast in het Dev Agent Record.

## Dev Notes — Developer Context

### Root cause (bevestigd, 2026-07-21)

De nachtelijke `flywheel-promotion`-job (`runPromotionLoop → processBatch`, crash-recovery-idempotent) voltooit sinds 2026-07-08 niet meer. Bij hervatting van de vastgelopen batch worden de al-complete fasen `threshold` en `cap` overgeslagen (fase-idempotentie via `gateResults`), waarna de lus in de **guardrail-/regressiefase** knalt op een **deterministische Postgres-fout `42883: operator does not exist: uuid = text`**. Bewezen door op 2026-07-21 handmatig een `flywheel-promotion`-job te enqueuen (jobId 566, 19:18) → exact die fout, zonder schade (lees-pad, batch onveranderd). Omdat de fout deterministisch is, blokkeert hij élke run: de batch (`12e27fbc-…`, `status='pending'`, `baseline_measurement=NULL`, `closed_at=NULL`) blijft hangen met 9 `reference_candidates` `status='in_batch'` origin `review`. De codes hebben al ándere actieve refs, dus herkenning viel niet zichtbaar uit — de storing was stil (de uurlijkse `flywheel-watchdog-scheduler` meldde terecht `flywheel-promotion-stalled`, maar die notificatie werd gededupliceerd).

### De twee falende query's (exacte plek)

| Plek | Functie / fase | Huidige (foute) clausule | Waarom fout |
|---|---|---|---|
| `apps/api/src/services/flywheel/guardrails.ts:432` | `hasCosineDuplicate` — dedup, trap-2 survivor-arm (aangeroepen vanuit `runDedupPhase`, `:380`) | `WHERE ce.reference_candidate_id IN (${Prisma.join(otherSurvivors)})` | `otherSurvivors: string[]` → Prisma bindt elk element als **text**-parameter; `reference_candidate_id` is `uuid` → `uuid = text` → 42883. Draait zodra een klasse ≥2 overlevende batch-genoten heeft. |
| `apps/api/src/services/flywheel/guardrails.ts:538` | `loadCandidateEmbeddings` — outlier (aangeroepen vanuit `runOutlierPhase`, `:491`) | `WHERE reference_candidate_id IN (${Prisma.join(candidateIds)})` | Idem: `candidateIds: string[]` als text tegen `uuid`-kolom. Draait zodra de outlier-fase kandidaten met embedding heeft. |

De fase-volgorde is `threshold → cap → dedup → outlier` (`promotion-batch.ts:44-49`). Bij de hervatte batch zijn `threshold`+`cap` al klaar, dus het eerste raw-uuid-contact is de **dedup**-survivor-arm en/of de **outlier**-load — precies waar de crash valt.

**Het patroon staat al correct in dezelfde bestanden**, wat de fix eenduidig maakt: `guardrails.ts:444` gebruikt `${candidateId}::uuid`, `gate.ts:369` gebruikt `${batchId}::uuid`, `reembed.ts`/`promotion.ts`/`nomination.ts` casten overal `::uuid`/`::vector`. Alleen de twee `IN (${Prisma.join(...)})`-lijsten missen de cast. Voor arrays bestaat er nog géén `::uuid[]`-precedent in dit codebestand — kies bewust tussen `= ANY(${ids}::uuid[])` (sluit aan op `= ANY(${CLONE_GAP_SOURCES})`, `guardrails.ts:456`) en per-element `${id}::uuid` binnen `Prisma.join`.

### Waarom geen enkele test dit ving (het echte gat)

De apps/api-vitestsuite **mockt `@prisma/client` volledig**: `src/__tests__/setup.ts:24` `vi.mock('@prisma/client', …)` met `$queryRaw: vi.fn().mockResolvedValue([])` (`:294`). Daardoor wordt de **ruwe SQL-string nooit door een echte Postgres geparsed** — de typefout is per definitie onzichtbaar in de unit-tests. Er is momenteel geen pg-integratieharnas in apps/api. (De schema-provider is wél `postgresql`, `schema.prisma:12`.) Dat is waarom AC 3 een test op **Postgres-niveau** eist: alleen een echte engine dwingt `uuid = text` af. Zonder die test blijft de klasse "raw SQL die alleen op Postgres faalt" een blinde vlek voor élke toekomstige raw query in het vliegwiel.

### Wat er AL bestaat (hergebruiken, niet herbouwen)

| Bouwsteen | Waar | Relevantie |
|---|---|---|
| Correcte cast-precedenten | `guardrails.ts:444`, `gate.ts:369`, `reembed.ts:107/111`, `promotion.ts:203/206`, `nomination.ts:244` | Kopieer het bestaande `::uuid`/`::vector`-patroon; geen nieuw idioom nodig. |
| Array-param-precedent | `guardrails.ts:456` `rl.source = ANY(${CLONE_GAP_SOURCES})` | Bewijst dat Prisma een JS-array als Postgres-array-parameter bindt → `= ANY(${ids}::uuid[])` is haalbaar. |
| Fase-orkestratie | `promotion-batch.ts:40-49` (`PHASE_ORDER`), `runPromotionLoop`/`processBatch` | Bevestigt fase-volgorde en het idempotente hervat-pad waarop de crash valt; niet wijzigen. |
| Prisma-mock-setup | `src/__tests__/setup.ts:24-321` | Verklaart de blinde vlek; de nieuwe pg-test moet hierbuiten draaien. |
| Postgres-infra voor tests | `infrastructure/docker/postgres/` | Kandidaat-bron voor een echte test-Postgres (taak 3.2). |
| ACC-toegang / enqueue-details | geheugen [[project_flywheel_two_findings_20260721]], [[project_harvest_converted0_wrong_layer]] | app-container, `REDIS_URL`, BullMQ `Queue('flywheel').add('flywheel-promotion', {})`. |

### Wat er NIEUW is (de eigenlijke story)

1. `::uuid`/`::uuid[]`-cast in `guardrails.ts::hasCosineDuplicate` (survivor-arm) en `guardrails.ts::loadCandidateEmbeddings` (+ eventuele sweep-treffers).
2. Een Postgres-niveau regressietest die beide query's tegen een echte engine draait en de `42883`-klasse afvangt (nieuwe testlaag/harness, want de bestaande suite mockt Prisma weg).

### Guardrails (voorkom bekende fouten)

- **Alleen typering wijzigen, niet de query-betekenis.** De `WHERE`-condities (self-match-uitsluiting, `embedding IS NOT NULL`, klasse-/`active`-filter, CTE `cand`) blijven byte-voor-byte gelijk op de filterlogica na; enkel de id-vergelijking krijgt een cast. Elke andere wijziging is scope-creep.
- **Geen migratie, geen schema-wijziging.** Kolomtypes kloppen al (`reference_candidate_id` is `uuid`); het probleem zit puur in de query-typering.
- **De ACC-drain is een aparte, per-geval-getoetste write.** Nooit `flywheel-promotion` enqueuen zonder expliciete go; de codefix + test + review + deploy gaan eraan vooraf. Deblokkeren kán niet puur operationeel — vereist eerst deze codefix (anders knalt de lus opnieuw).
- **Vermijd het `IN (${Prisma.join})`-antipatroon voor uuid-lijsten** ook in toekomstige query's; noteer de gekozen cast-vorm zodat hij herbruikbaar is.
- Commits Engels; `versions.md` in dezelfde commit; ghcr-build-workflow vóór Coolify-deploy; deploy api.

### Testrichtlijnen

- **Postgres-regressietest (nieuw, AC 3):** tegen een echte Postgres met de vliegwiel-tabellen (`candidate_embeddings`, `reference_candidates`, `reference_embeddings`, `reference_logos`). Zaai minimaal: één klasse met een kandidaat + ≥2 overlevende batch-genoten met embeddings (dwingt de survivor-arm van `hasCosineDuplicate` af) en een kandidatenlijst voor `loadCandidateEmbeddings`. Assertie: pre-fix-query faalt met `42883`; gefixte query slaagt en levert de verwachte rijen. Bevestig dat dit type test op de bestaande gemockte suite onmogelijk is (mock-`$queryRaw` parse't geen SQL).
- **Bestaande unit-suite (AC 4):** blijft groen; voeg desgewenst een gemockte assertie toe dat de query-string nu de cast bevat (goedkope guard, maar géén vervanging voor de echte pg-test).
- **Geen writes in de testketen** behalve de test-eigen zaai-/opruim-transacties op de test-Postgres.
- E2E: buiten de stable-subset-gate. ACC-bewijs = taak 5 (na go).

### Project Structure Notes

- Wijzigingen beperkt tot `apps/api/src/services/flywheel/guardrails.ts` + een nieuwe pg-testlaag onder `apps/api` (locatie afhankelijk van de gekozen harness in taak 3.2; documenteer de plek).
- Variance: introductie van een Postgres-integratietestlaag is nieuw t.o.v. de tot nu toe volledig-gemockte apps/api-suite. Houd hem geïsoleerd (aparte config/opt-in) zodat de snelle gemockte suite niet afhankelijk wordt van een draaiende Postgres; documenteer in het Dev Agent Record.

### References

- [Source: geheugen project_flywheel_two_findings_20260721 — root cause, jobId 566-repro, batch 12e27fbc, enqueue-details]
- [Source: apps/api/src/services/flywheel/guardrails.ts#hasCosineDuplicate (:417-464), #loadCandidateEmbeddings (:527-554)]
- [Source: apps/api/src/services/flywheel/promotion-batch.ts#PHASE_ORDER (:40-49), #runPromotionLoop (:62-)]
- [Source: apps/api/src/services/flywheel/gate.ts:369 (::uuid-precedent), guardrails.ts:444/456 (::uuid + = ANY precedent)]
- [Source: apps/api/src/__tests__/setup.ts:24-321 (Prisma volledig gemockt → mock-gat)]
- [Source: apps/api/prisma/schema.prisma:12 (provider postgresql)]
- [Source: _bmad-output/implementation-artifacts/13-4-nachtelijke-promotielus-batching-en-guardrails.md, 13-5-kwaliteitspoort-regressietest-promotie-en-quarantaine.md (fase-overdracht via gateResults, AD-6/AD-16)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — implement-sprint epic-agent (epic-13, story 13.7).

### Debug Log References

- Sweep `apps/api/src/services/flywheel/`: `grep Prisma.join / IN (${ / = ANY / ::uuid`. Enige twee uncast uuid-vergelijkingen: `guardrails.ts:432` (`hasCosineDuplicate`, survivor-arm) en `:538` (`loadCandidateEmbeddings`). Alle overige raw SQL cast al `::uuid` (`gate.ts:369`, `guardrails.ts:444`, `reembed.ts:107/111`, `promotion.ts:203/206`, `nomination.ts:244`). `guardrails.ts:456` `= ANY(${CLONE_GAP_SOURCES})` vergelijkt een text-kolom (`rl.source`) → geen cast nodig.
- Postgres-integratierun (`scripts/run-pg-integration-tests.sh`, pgvector/pgvector:pg16, `prisma migrate deploy` 20/20): 3 tests groen. PRE-fix-vorm gooit `42883 operator does not exist: uuid = text`; POST-fix-functies draaien foutloos en leveren de verwachte rijen (cosine-match survivor-arm = true, 2/2 embeddings geladen).
- Migraties 0007/0008 GRANT'en aan rol `logorecognition` → script maakt die throwaway-rol aan vóór `migrate deploy`.
- Volledige gemockte apps/api-suite: 907 passed, 2 skipped, 37 todo (80 test files). `.itest.ts` valt buiten de default-include → snelle suite blijft Postgres-onafhankelijk. `tsc --noEmit` groen.

### Completion Notes List

- **Gekozen cast-vorm:** `= ANY(${ids}::uuid[])`, consistent met het bestaande array-precedent `= ANY(${CLONE_GAP_SOURCES})` (regel 456). `Prisma.join(...)` is in beide query's vervangen; `Prisma` blijft in gebruik (`Prisma.sql`/`Prisma.empty`). Query-betekenis (self-match-uitsluiting, `embedding IS NOT NULL`, klasse-/active-filter, CTE `cand`, UNION-armen) is byte-identiek — alleen de typering wijzigt. Empty-array-gedrag blijft correct (beide call-sites guarden al op lengte 0; `= ANY(empty)` matcht bovendien veilig niets).
- **Testgat gedicht:** aparte Postgres-integratietestlaag (`vitest.integration.config.ts` zónder `src/__tests__/setup.ts`-mock, include `src/__tests__/integration/**/*.itest.ts`), npm-script `test:integration`, container-lifecycle in `scripts/run-pg-integration-tests.sh`. De bestaande suite mockt `@prisma/client` volledig (`setup.ts:24` `$queryRaw: vi.fn()...`) waardoor raw SQL nooit door Postgres wordt geparsed — daarom kon geen unit-test deze klasse fout vangen.
- **AC5 (deploy + ACC-drain van batch `12e27fbc-…`) NIET uitgevoerd:** gated op expliciete go van Friso (ACC-write, per-geval-toestemming). Zie taak 5. Geen ACC-actie in deze run.

### File List

- `apps/api/src/services/flywheel/guardrails.ts` (fix: 2 raw query's → `= ANY(${...}::uuid[])`)
- `apps/api/src/__tests__/integration/flywheel-guardrails-uuid.itest.ts` (nieuw — pg-regressietest)
- `apps/api/vitest.integration.config.ts` (nieuw — pg-integratieconfig zonder Prisma-mock)
- `apps/api/scripts/run-pg-integration-tests.sh` (nieuw — container-lifecycle + migrate + run)
- `apps/api/package.json` (nieuw script `test:integration`)
- `versions.md` (eindgebruikers-entry)
- `_bmad-output/implementation-artifacts/ac-trace-13-7.md` (nieuw — AC→test-trace)
- `_bmad-output/implementation-artifacts/review-13-7.md` (nieuw — adversarial review)
- `_bmad-output/implementation-artifacts/13-7-retrospective.md` (nieuw — retrospective)

## Change Log

- 2026-07-21: Story aangemaakt (create-story workflow) als bugfix op afgeronde Epic 13. Root cause al gelokaliseerd (uuid=text in `guardrails.ts:432` + `:538`); testgat geïdentificeerd (Prisma volledig gemockt in apps/api). Epic-13 heropend 'done' → 'in-progress' voor deze story.
