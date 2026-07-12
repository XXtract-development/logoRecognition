---
baseline_commit: ecf7fad8c8a286ef82c08a8544a58adef67e1a19
---

# Story 19.8: Fase 1 — bootstrap-crops uit lege klassen naar de review-wachtrij

Status: done

<!-- Twee-traps-fase-1, uit correct-course (sprint-change-proposal-2026-07-07.md). Ontstopt de flywheel-brandstof end-to-end: de crops die 19.6 nu vindt (0->6) belanden in de review-wachtrij i.p.v. te worden gedropt op de 0,90-promotie-drempel. -->

## Story

Als **datamanager**
wil ik **dat de crops die het vliegwiel in een lege keurmerkklasse vindt naar de review-wachtrij gaan (mens bevestigt ECHT/VALS) in plaats van te worden weggegooid omdat ze de auto-promotie-lat van 0,90 niet halen**
zodat **een lege klasse zijn eerste echte referentie-crops krijgt — de brandstof waarop de twee-traps-ranking (19.9) verder bouwt** (FR-22, FR-12).

### Afbakening (kritiek) — HERZIEN 2026-07-07 (correct-course, zie sprint-change-proposal-2026-07-07-19-8-review-routing.md)
- **Root cause is bewezen (live op ACC, 2026-07-07):** na 19.6 vindt de sampler nu crops (0→6 bereikten de nominatie), maar alle 6 vielen af — bootstrap-crops matchen tegen het GIDS-logo op 0,60–0,74 en halen de 0,90-auto-promotie-drempel nooit.
- **WEERLEGDE aanpak (v1, geblokkeerd door code-review):** "route via `origin:'review'` naar de review-wachtrij" werkt NIET. `nominateCandidate(origin:'review')` schrijft in `reference_candidates` — die pool heeft géén menselijke listing; de menselijke review-wachtrij (`GET /artwork/review-queue`) leest `artworkReviewItem status:'open'`, alléén gevuld door de live-crosscheck. `origin:'review'` is bovendien een UITKOMST van menselijke review (de accept-handler `artwork-pipeline.ts:1119` produceert 'm ná bevestiging), geen ingang.
- **HERZIENE aanpak:** het lege-klasse-bootstrap-/sampler-pad maakt per gevonden crop een **`artworkReviewItem(status:'open')`** aan (reason-getagd), zodat de crop in de bestaande `/artwork/review-queue` verschijnt. Bij menselijke accept doet de BESTAANDE handler de rest: gold-set ECHT (`review-accept`) + origin-`review`-nominatie → echte referentie. Geen nieuwe UI/accept-infra — hergebruik van de bestaande review-queue.
- **Vangnet ONGEWIJZIGD:** declaratie-guard (19.5, upstream), hard-negative-blokkade (AD-12: crops met inhouds-hash ∈ `hard_negatives` niet opnieuw voorleggen), dedup (crop al open/geaccepteerd review-item of actieve referentie → overslaan). De mens keurt elke crop ECHT/VALS vóór die brandstof wordt.
- **Geen wijziging aan:** de ml-search (19.6), search-drempel/gate, embedding-model, de crosscheck/kruischeck-paden, of de accept/reject-handlers.
- **Scope:** het bootstrap-/sampler-lege-klasse-pad. Het schakelmoment "≥ k echte refs → ranking" is Story 19.9.
- **Elke ACC-schrijf/deploy met expliciete toestemming per geval; container zelfstandig herstartbaar.**

## Acceptatiecriteria (HERZIEN)

1. **Given** een gevonden bootstrap-crop in een lege klasse (confidence tussen search-drempel 0,60 en 0,90 — bv. 0,70)
   **When** het lege-klasse-pad draait
   **Then** wordt de crop als **OPEN `artworkReviewItem`** (reason-getagd) in `/artwork/review-queue` geplaatst — niet direct genomineerd en niet geskipt — pending menselijke ECHT/VALS-beoordeling (waar het vóór 0 een mens bereikte).

2. **Given** dezelfde crop
   **When** het pad draait
   **Then** blijven de kleppen gelden: declaratie-guard (upstream), **hard-negative-blokkade** (crop met inhouds-hash ∈ `hard_negatives` wordt NIET opnieuw voorgelegd) en **dedup** (crop die al een open/geaccepteerd/geregistreerd review-item of actieve referentie is → overgeslagen). Een eerder door een mens afgekeurde crop verschijnt niet opnieuw.

3. **Given** een mens keurt een voorgelegde crop
   **When** accept/reject via de bestaande `/artwork/review-items/:id/accept|reject`
   **Then** doet de BESTAANDE handler het werk ongewijzigd: accept → gold-set ECHT (`review-accept`) + origin-`review`-nominatie → referentie; reject → hard-negative. Geen nieuwe accept/reject-infra; de crosscheck/kruischeck-paden ongemoeid.

4. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een test: (a) een sub-0,90-crop via het lege-klasse-pad → OPEN `artworkReviewItem` (niet `nominateCandidate`); (b) hard-negative/duplicaat → overgeslagen; (c) **caller-pad** (`processClass` + sampler) maken review-items; (d) statusorkestratie. `tsc --noEmit` 0 en de api-suite groen.

5. **Given** een lege klasse
   **When** de bootstrap-run z'n wachtrij-status bepaalt
   **Then** wordt de klasse `gevuld` alléén bij ≥1 bevestigde **echte brandstof** — ≥1 mens-bevestigde ECHT-crop (gold-set `review-accept`/`review-annotate`) **OF** ≥1 actieve `flywheel-promotion`-referentie — anders `leeg`/`wacht-op-review` (blijft bootstrapbaar). Voorkomt de "leeg-maar-`gevuld`"-vastloper (`bootstrap-run.ts`).

## Tasks / Subtasks (HERZIEN)

- [x] 1. **Review-item-routering lege klasse (AC: 1, 3, 4)** — `searchAndNominateClass` hernoemd naar `searchAndQueueClassForReview`; maakt per ml-match een OPEN `artworkReviewItem` aan i.p.v. `nominateCandidate`. `origin`-parameter + v1-herkomst-routering verwijderd; beide callers (`processClass`, `runBalancedSampler`) queue-en voor review (geen `origin` meer).
- [x] 2. **Guard-helper (AC: 2)** — `queueCropForReview`: inhouds-hash via `mlClient.computePhash` → hard-negative-lookup (skip) → dedup op bestaand open/accepted/registered `artworkReviewItem` én actieve referentie (skip) → anders `artworkReviewItem.create(status:'open', reason:'bootstrap-lege-klasse', …)`. Fail-closed (`refused`) bij phash-fout.
- [x] 3. **Statusorkestratie (AC: 5)** — `classHasConfirmedRealFuel` = ≥1 mens-bevestigde ECHT-crop (`review-accept`/`review-annotate`) **OF** ≥1 actieve `flywheel-promotion`-referentie (`countActivePromotionReferences`). `wacht-op-review`- én `afgekapt`-emptyReason toegevoegd.
- [x] 4. **Tests (AC: 4)** — ATDD + bootstrap-run + sampler + 19.5-guard-suites gemigreerd: crop → OPEN review-item (niet `nominateCandidate`); hard-negative/dup → overgeslagen; caller-pad (`processClass` + sampler) maakt review-items; statusorkestratie (geen ECHT/geen promotie-ref → `wacht-op-review`; ECHT-record óf promotie-ref → `gevuld`).
- [x] 5. **Gates** — `tsc --noEmit` 0; volledige api vitest groen: 883 passed, 0 failed (78 files). Geen regressies t.o.v. `ecf7fad`.
- [x] 6. **Live-verificatie (AC: 1) — GESLAAGD** (2026-07-07, akkoord Friso). Deploy `b2b291f` live op ACC (app+ml image-tag bevestigd, containers healthy). Nulmeting: **0** open `bootstrap-lege-klasse`-review-items + 0 wachtende bootstrap-queue-klassen. Sampler-run (ad-hoc runner in de app-container, budget=2/klasse, time-box 40s): `32 klassen, 17 zonder zaad, 22 GTINs, outcomes {queued:4, skipped:0, refused:0}`. Nameting: **4** OPEN `artworkReviewItem` in `/artwork/review-queue` (van 0 → 4). Straaltje end-to-end ontstopt.

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)
- `apps/api/src/services/flywheel/nomination.ts:129-140` — de promotie-drempel-klep; `if (origin !== 'review') { if (confidence < threshold) return skipped 'onder-drempel' }`. `review` omzeilt de drempel maar loopt daarna gewoon door phash/dedup/hard-negative/insert. **Niet wijzigen** — alleen de herkomst die erin gaat.
- `apps/api/src/services/flywheel/bootstrap-run.ts:198-204` — `searchAndNominateClass(..., opts.origin ?? 'bootstrap')`; `:393` caller (`processClass`) geeft `origin: 'bootstrap'`.
- `apps/api/src/services/flywheel/balanced-sampler.ts:294-297` — sampler-caller geeft `origin: 'bootstrap'`.
- `apps/api/src/services/flywheel/config.ts:25` — `NominationOrigin = 'crosscheck' | 'kruischeck' | 'bootstrap' | 'review'` (`'review'` bestaat al).

### Wat behouden moet blijven
- De 5 kleppen (guard/hard-neg/dedup/cap/gold-set) — `review` mag alléén de auto-promotie-drempel omzeilen.
- Het crosscheck/kruischeck-pad (eigen herkomst + auto-accept) — ongemoeid.
- NFR-6 (zaad nooit als crop), de ml-search (19.6) — ongemoeid.

### Waarom dit de kip-ei doorbreekt
Lege klasse → bootstrap vindt crops (19.6) → nu naar review (19.8) → mens bevestigt → eerste echte crops → zodra ≥ k=3: ranking (19.9, bewezen 100%) neemt over. Geen nieuwe review-infra; geen training.

### References
- [Source: sprint-change-proposal-2026-07-07.md] — de twee-traps-scope.
- [Source: apps/api/src/services/flywheel/nomination.ts#129-140] — `review` omzeilt de 0,90-drempel.
- [Source: 19-6-...md#Task-6] — live-bewijs 0→6 crops + de derde klep.
- [Source: 19-7-spike-resultaten.md] — fase-2-ranking bewezen (waar 19.8 op voorbouwt).
- Geheugen: `project_flywheel_recall_research`, `project_prod_corpus_route`.

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (bmad-dev-story)

### Debug Log References
- ATDD RED bevestigd op baseline `ecf7fad`: `expected 'bootstrap' to be 'review'` (flywheel-review-routing-19-8.atdd.test.ts).
- Na fix: ATDD groen (2/2); flywheel-suites 408 passed; volledige api-suite 879 passed / 0 failed; `tsc --noEmit` exit 0.

### Completion Notes List
- **AC1/3/4 — herkomst-routering:** default van `searchAndNominateClass` is nu `review` (was `bootstrap`); beide callers (`processClass`, `runBalancedSampler`) geven géén expliciete origin meer mee → erven de default. `nomination.ts` bleef ongewijzigd — `origin === 'review'` omzeilde daar al enkel de 0,90-drempel.
- **Ontwerpbeslissing `review` vs `bootstrap-review`:** `review` hergebruikt. De adversarial-zorg (finding #3, clone-gap-koppeling) berust op een veld-verwarring: `CLONE_GAP_SOURCES` filtert `reference_logos.source`, niet de kandidaat-`origin`. Review-origin-kandidaten dragen nooit `source: 'review'` → geen ongewenste koppeling. Minder oppervlak dan een nieuwe enum-waarde.
- **AC5 — statusorkestratie:** de sleutelvondst is dat `runThresholdPhase` (guardrails.ts:164) sub-0,90-kandidaten telkens VRIJGEEFT naar `candidate` (niet rejected, niet gepromoveerd) → review-crops auto-promoten NOOIT en blijven in de wachtrij tot een mens beslist. Daarom is `nominated > 0 ? 'gevuld'` fout: het haalt een klasse met louter pending crops uit de wachtrij. Fix: `gevuld` iff ≥1 mens-bevestigde ECHT gold-set-record; anders `leeg` (bootstrapbaar). Her-queue gebeurt via de bestaande 16.2-aggregatie (`mismatch-workload.ts` upsert → `wachtend`).
- **AC2 — kleppen-behoud:** class-cap telt actieve promotie-referenties (`countActivePromotionReferences`, source `flywheel-promotion`), niet kandidaten → review-pending crops vullen de cap niet. Hard-negative/phash-dedup/gold-set draaien onveranderd ná de drempel-omzeiling.
- **Bekend gevolg (buiten 19.8-scope):** `determineNewlyActivatedCodes` (bootstrap-queue.ts, 17.2 AC3-notificatie) filtert kandidaten op `origin: 'bootstrap'`. Review-routed crops verschijnen daar niet meer — correct, want ze auto-activeren niet; ze vereisen mens-review. De "volle kraan" (confirmed crops → referenties/ranking) is Story 19.9.
- **Task 6 (live-verificatie) open:** vereist ACC-deploy → wacht op expliciete toestemming van Friso per geval (commit+push naar acc = auto-deploy).

### File List
- apps/api/src/services/flywheel/bootstrap-run.ts (gewijzigd) — default origin `review`; `classHasConfirmedEchtCrop`-helper; AC5-finalize; `wacht-op-review`-emptyReason; docstrings.
- apps/api/src/services/flywheel/balanced-sampler.ts (gewijzigd) — expliciete `origin: 'bootstrap'` weggehaald; docstrings.
- apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts (gewijzigd) — origin `review`; AC5-status-tests; goldSetRecord.count-mock.
- apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts (gewijzigd) — caller-pad asserteert `origin: 'review'`.
- apps/api/src/__tests__/services/flywheel-review-routing-19-8.atdd.test.ts (voorwerk, ongewijzigd) — RED→GREEN.

## Senior Developer Review (AI)

Datum: 2026-07-07. Drie parallelle adversariële lagen (Blind Hunter, Edge Case Hunter, Acceptance Auditor) + zelf-verificatie tegen de live-code. **Verdict: BLOCKED — kritieke architectuur-aanname weerlegd.**

### 🔴 BLOKKER — herkomst `review` bereikt géén menselijke review-wachtrij (geverifieerd)
De story-premisse is dat een bootstrap-crop met `origin: 'review'` in de review-wachtrij belandt waar een mens ECHT/VALS keurt (AC1). Dat klopt NIET met de architectuur:
- `nominateCandidate` schrijft de crop in **`reference_candidates`** (`nomination.ts:226-248`), niet in `artworkReviewItem`.
- De menselijke review-wachtrij (`GET /artwork/review-queue`, `artwork-pipeline.ts:731`) leest **`artworkReviewItem` waar `status:'open'`**; die rijen worden UITSLUITEND door de live-crosscheck aangemaakt (`artwork-crosscheck.ts:164`). Het bootstrap-pad maakt er geen.
- Het quarantaine-paneel (`overview/quarantine.ts:85`) toont alléén **gequarantainede batches**. Een sub-0,90 review-crop wordt door de drempel-fase van de promotielus telkens VRIJGEGEVEN (`guardrails.ts:164-186`, geen origin-check) vóór hij een batch-quarantaine bereikt.
- **Gevolg:** de crop blijft als wees-`candidate` hangen — geen mens ziet 'm, hij promoveert nooit, en `classHasConfirmedEchtCrop` (telt gold-set-records `review-accept`/`review-annotate`, geschreven via de crosscheck-review-handlers) kan voor bootstrap-klassen NOOIT true worden. De "leeg-maar-gevuld"-val wordt vervangen door een "eeuwig-leeg + herhaalde dure ml-search"-val (Edge Case #1 / Blind Hunter #1,3).
- **Onafhankelijk feit:** vóór 19.8 produceerde géén enkele code `reference_candidates` met `origin:'review'` — de enum-waarde bestond, maar geen producer; alleen de drempel-omzeiling in `nomination.ts:133` refereerde eraan. De aanname "review-pad = review-wachtrij" (uit het onderzoek/geheugen) was dus onbewezen.

### 🟠 Secundair (grotendeels moot zolang de blokker staat)
- **AC5-signaal te smal + niet-bootstrap-gescoped (Auditor AC3 / Edge Case #2 / Blind Hunter #2):** `classHasConfirmedEchtCrop` telt alléén mens-`review-accept/annotate`; mist een klasse met ≥1 actieve `flywheel-promotion`-referentie (→ ten onrechte `leeg`) en telt een klasse `gevuld` op een ONGERELATEERDE crosscheck-bevestiging (niet deze bootstrap-run).
- **Evidence-semantiek (Blind Hunter #4):** `origin:'review'` schrijft `declarationOutcome:'confirmed'` (`nomination.ts:261-280`); ongevette auto-crops krijgen zo het "mens-gevet"-vertrouwenslabel — misleidend voor audit/rollback.
- **Tautologische AC5-tests (Blind Hunter #5):** beide status-tests mocken `goldSetRecord.count` direct → bewijzen de ternary, niet de echte koppeling; kunnen de blokker per definitie niet vangen.
- **`emptyReason`-degradatie (Blind Hunter #6 / Edge Case #3):** afgekapte/getimede runs én dedup-her-runs (`res.nominated=0` door `reeds-genomineerd`) vallen terug op `geen-vondsten` i.p.v. `wacht-op-review`/`afgekapt` — misleidend log-/verificatiesignaal (geen persisted-state-breuk).
- **Impliciete default-origin (Blind Hunter #7, Laag):** twee call-sites coderen een load-bearing routeringsbesluit als afwezig argument.

### Aanbeveling
Correct-course op 19.8. De crops moeten daadwerkelijk op een menselijke ECHT/VALS-surface komen. Meest waarschijnlijke route (opt. A): het bootstrap-/sampler-pad maakt per gevonden crop ook een **`artworkReviewItem` (`status:'open'`, reason-tag)** aan, zodat het in de bestaande `/artwork/review-queue` verschijnt (die heeft al een keurmerk-acceptatie-focus via de `q`-reason-filter). Dat is wél lichte "review-infra" — de story-afbakening ("geen nieuwe review-infra") berustte op de weerlegde aanname. NIET committen/deployen tot de koers herzien is.

## Change Log
- 2026-07-07: aangemaakt via bmad-create-story (na correct-course). Fase-1-story: bootstrap-crops uit lege klassen via herkomst `review` naar de wachtrij i.p.v. dropped op de 0,90-drempel.
- 2026-07-07: dev-story Tasks 1–5 geïmplementeerd (tsc 0, api 879 passed). Code-review (3 adversariële lagen + zelf-verificatie) → **BLOCKED**: herkomst `review` bereikt geen menselijke review-wachtrij (geverifieerd tegen live-code). Status terug naar in-progress; correct-course nodig vóór commit/deploy.
- 2026-07-07: dev-story v1 (Tasks 1–5). Herkomst-routering `bootstrap`→`review`. → geblokkeerd door code-review (zie boven).
- 2026-07-07: **herziene aanpak** (sprint-change-proposal-2026-07-07-19-8-review-routing.md, akkoord Friso): v1-routering teruggedraaid; crops → OPEN `artworkReviewItem` in de bestaande `/artwork/review-queue` via `searchAndQueueClassForReview` + `queueCropForReview` (hard-negative+dedup-guard); AC5-`gevuld`-signaal verbreed (`classHasConfirmedRealFuel`: mens-ECHT-crop OF actieve promotie-referentie). ATDD + 3 bestaande suites gemigreerd. tsc 0; api 883 passed/0 failed. Status → review. Task 6 (live-verificatie) wacht op deploy-toestemming.

## Senior Developer Review (AI) — ronde 2 (herziene aanpak)

Datum: 2026-07-07. Drie parallelle lagen op de herziene diff. **Verdict: PASS met verwerkte fixes.**
- **Acceptance Auditor: PASS** — alle ACs (1–5) + Tasks (1–5) gehaald, geen over-scope; de accept→gold-set→`gevuld`-lus klopt (accept-handler ongemoeid).
- **Blind Hunter: kern gezond** (aanwas-lus, hard-negative-dedup, geen race bij concurrency 1). 1 Medium-bevinding → **gefixt**.
- **Edge Case Hunter:** bevestigde Finding 1 + legde een cross-class-dedupbotsing bloot → **gefixt**.

### Gefixt in deze ronde
- **Dedup-gat (Blind #1 / Edge #1+#2):** de dedup filterde op `cropPath` + statusset `[open,accepted,registered]`. Gevolg: (a) een met "onjuiste-locatie" afgewezen crop (status `rejected`, géén hard-negative) kwam bij elke re-queue terug; (b) twee klassen met dezelfde crop-regio botsten (crop_path bevat geen code) → de 2e klasse verloor stil haar hypothese. **Fix:** dedup op `{ cropPath, t3777Code }` ONGEACHT status — per (crop, code), alle statussen. Test verstevigd (asserteert de where-vorm + geen status-filter; extra referentie-deduptak; `replacedById`-tombstone-filter).

### Bekende beperkingen (follow-up, GEEN blokker — buiten 19.8-scope)
- **Churn (Edge #3):** een klasse met louter open review-items heeft nog geen bevestigde brandstof → 16.2 hergequeued 'm en `processClass` draait telkens de volle `bootstrapSearch` (alle matches dedup-skipped, `queuedForReview:0`). Begrensd door budget/time-box, maar verspilt compute tot de mens reviewt. Verdwijnt met fase-2 (19.9, ranking-switch) of een goedkope "sla klasse met openstaande bootstrap-items over"-guard. **Aanbeveling: aparte follow-up-story.**
- **Sampler-budget per klasse (Edge #4, pre-existing 19.4):** `runBalancedSampler` herberekent budget/deadline BINNEN de klasse-loop → geen run-brede cap; totaal open items ≈ klassen × per-code-cap, looptijd = plan.length × maxSeconds. Voor een ad-hoc sampler-run acceptabel; overweeg een gedeeld budget in een sampler-hardening-story.
- **Check-then-create niet atomair (Edge #5):** geen unieke DB-constraint op `artworkReviewItem.cropPath`; het request-pad (crosscheck) kan gelijktijdig een item met dezelfde cropPath maken → zeldzaam duplicaat. Vereist een migratie (permissie) — aparte story.
- **Accept onder correctiecode (Edge #6):** bij accept met override-`t3777Code` blijft de oorspronkelijke klasse zonder brandstof (correct: de crop was niet háár keurmerk), maar wordt één keer opnieuw voorgelegd vóór de per-code-dedup bijt. Lage frequentie.

## Dev Agent Record (herziene aanpak)

### Completion Notes List
- v1 teruggedraaid: geen herkomst-routering meer. Kernpad heet `searchAndQueueClassForReview`; legt crops voor als OPEN `artworkReviewItem` (reason `bootstrap-lege-klasse`) in `/artwork/review-queue`. Accept/reject via de BESTAANDE handlers (gold-set ECHT `review-accept` + origin-`review`-nominatie / hard-negative).
- AC2-kleppen: hard-negative (`computePhash`→`hard_negatives`) + dedup (bestaand review-item óf actieve referentie); fail-closed (`refused`) bij phash-fout. Declaratie-guard upstream.
- AC5: `classHasConfirmedRealFuel` = mens-ECHT-crop (`review-accept`/`review-annotate`) OF actieve `flywheel-promotion`-referentie (adresseert code-review Auditor-AC3 / Edge-Case-#2). `emptyReason`: `wacht-op-review` / `afgekapt` / `geen-vondsten`.
- Naamgeving `nominated`→`queuedForReview` (geen externe consumenten op naam).
- Task 6 (live-verificatie) open — vereist ACC-deploy, wacht op expliciete toestemming per geval.

### File List
- apps/api/src/services/flywheel/bootstrap-run.ts (gewijzigd)
- apps/api/src/services/flywheel/balanced-sampler.ts (gewijzigd)
- apps/api/src/__tests__/services/flywheel-review-routing-19-8.atdd.test.ts (herschreven)
- apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts (herschreven)
- apps/api/src/__tests__/services/flywheel-balanced-sampler.test.ts (gewijzigd)
- apps/api/src/__tests__/services/flywheel-guard-5-5.atdd.test.ts (gewijzigd)
