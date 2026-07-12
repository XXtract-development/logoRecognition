# Story 19.15: Zaadkeuze-semantiek — `resolveSeedPath` prefereert expliciet het gids-zaad

Status: review

<!-- Follow-up uit Story 19.9 Task 8 (2026-07-12, live-verificatie conditie C op ACC). Geen gedragswijziging aan conditie C zelf; scope = de zaadkeuze in het gids-fallback-pad van de bootstrap-zoektocht. -->

## Story

Als **datamanager / ontwikkelaar van het keurmerk-vliegwiel**
wil ik **dat `resolveSeedPath` het GIDS-/wikimedia-zaad expliciet prefereert (source-filter) i.p.v. simpelweg de nieuwste `reference_logo` van de klasse te pakken**
zodat **het gids-drempel-pad (de fallback in `search_with_seed`) semantisch tegen het GIDS-logo blijft vergelijken — zoals de functie-docstring en NFR-6 al beogen — terwijl de door mensen bevestigde ECHTE crops uitsluitend via `realRefPaths`/conditie C (Story 19.9) meedoen** (FR-22, NFR-6).

### Afbakening (kritiek)
- **Herkomst van deze story:** bij de live-verificatie van Story 19.9 (Task 8, `19-9-eval-reproductie.md`) bleek dat de gedeployde `resolveSeedPath` (`apps/api/src/services/flywheel/bootstrap-run.ts:117`) de **nieuwste** `referenceLogo` van de klasse kiest **ongeacht `source`** (`orderBy: { createdAt: 'desc' }`, geen source-filter). Voor klassen die inmiddels door mensen bevestigde ECHTE crops hebben (o.a. GREEN_DOT) is het "zaad" daardoor een echte crop geworden i.p.v. het gids-logo.
- **Waarom dit ertoe doet:** de functie-docstring (`:111` "Resolveer het **gids-zaad**") en NFR-6 ("het **gids-zaad** is UITSLUITEND zoekinstrument", `:33`) gaan er expliciet van uit dat het zaad het GIDS-logo is. Het gids-drempel-pad in `search_with_seed` (`sim = cosine(emb, seed_emb); match als sim >= threshold`, `apps/ml-service/app/services/bootstrap_search.py`) vergelijkt bij zo'n klasse nu tegen een echte crop i.p.v. het gids-logo — een stille semantiek-drift.
- **Dit raakt conditie C (Story 19.9) NIET.** De 19.9-schakel hangt uitsluitend aan `realRefPaths` + `min_refs` (`FLYWHEEL_RANKING_MIN_REFS`); die blijft ongewijzigd. De echte crops horen via `realRefPaths` (nearest-reference) mee te doen, **niet** als zaad. Deze story herstelt die scheiding aan de zaad-kant.
- **`REAL_CROP_SOURCES` bestaat al** (`bootstrap-run.ts:186` = `['review-confirmed', 'realref-live-poc', 'flywheel-promotion']`) — de set niet-gids/echte bronnen. De gids-bronnen zijn de resterende (gids/wikimedia-import). De fix is een source-preferentie op `resolveSeedPath`.
- **Diagnose vrij, wijziging via BMAD.** Eerst vaststellen wat de daadwerkelijke `source`-waarden van de gids-referenties zijn in de DB (bv. `wikimedia`, `guide`, `gids`, import-herkomst) voordat het filter hard gecodeerd wordt — niet gokken.
- **Vangnet / graceful degradation:** heeft een klasse **geen** gids-zaad (alleen echte crops), dan moet het gedrag bewust gekozen worden: óf terugvallen op de nieuwste echte crop als zaad (huidige gedrag, expliciet gemaakt) óf geen zaad (klasse leunt volledig op conditie C). Kies en documenteer; breek geen bestaande lege-klasse-flow.
- **Geen wijziging aan:** conditie C / nearest-reference-ranking (19.9), de gate-drempels (19.6), de declaratie-guard (19.5), de 19.8-review-routering, de region-proposer of het embedding-model.
- **Elke ACC-schrijf/deploy/eval-run met expliciete toestemming per geval; container zelfstandig herstartbaar.**

## Acceptatiecriteria

1. **Given** een keurmerkklasse met zowel een GIDS-referentie als ≥1 door mensen bevestigde ECHTE crop
   **When** `resolveSeedPath(t3777Code)` het zaad bepaalt
   **Then** retourneert het het pad van de **GIDS-/wikimedia-referentie** (source ∉ `REAL_CROP_SOURCES`), niet de nieuwste echte crop — ook wanneer de echte crop nieuwer is (`createdAt` hoger).

2. **Given** een keurmerkklasse zónder gids-referentie (alleen echte crops of niets)
   **When** `resolveSeedPath` het zaad bepaalt
   **Then** geldt het bewust gekozen, gedocumenteerde fallback-gedrag (expliciet: newest echte crop als zaad, óf `null` = geen zaad) — zonder de bestaande lege-/schaarse-klasse-flow (19.8) te breken.

3. **Given** de wijziging
   **When** een bootstrap-zoektocht draait voor een klasse met gids + echte crops
   **Then** vergelijkt het gids-drempel-pad (`search_with_seed` fallback) tegen het GIDS-zaad, terwijl de echte crops onveranderd via `realRefPaths`/conditie C (19.9) meedoen — de nearest-reference-uitkomst van 19.9 blijft identiek (geen regressie op de 19.9-eval).

4. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een api-vitest: (a) klasse met gids + nieuwere echte crop → zaad = gids (faalt op het oude newest-ongeacht-source-gedrag); (b) klasse zonder gids → het gekozen fallback-gedrag; (c) NFR-6 blijft (zaad = gids, nooit een echte-crop-output). `tsc --noEmit` 0, volledige api-vitest én ml-pytest groen.

5. **Given** de bestaande 19.9-eval/gold-set
   **When** (met toestemming) de 19.9-eval-reproductie opnieuw draait
   **Then** blijft de conditie-C-uitkomst ongewijzigd (top-1 richting ~100% voor de ≥k-klassen) en is de gids-fallback aantoonbaar weer een gids-vergelijking — geen precisie-/recall-regressie.

## Tasks / Subtasks

- [x] 1. **Diagnose gids-source-waarden (AC: 1)** — het complement van `REAL_CROP_SOURCES` (`bootstrap-run.ts:186` = `['review-confirmed','realref-live-poc','flywheel-promotion']`) is per storydefinitie de gids-populatie (elke niet-ECHTE-crop-bron); geen aparte ACC/DB-query nodig (expliciet vrijgesteld in de story-opdracht). Aanvullend bevestigd: `reference_logos.source` is NULLABLE (`schema.prisma:247`) en de curatie-upload `POST /reference-logos` zet `source: null` als het veld leeg blijft — dus "gids" omvat ook `null`, niet alleen expliciete gids-source-strings (zie Task 2, code-review-fix).
- [x] 2. **`resolveSeedPath` source-preferentie (AC: 1, 2)** — `resolveSeedPath` (`bootstrap-run.ts`) prefereert nu eerst een referentie met `OR: [{ source: null }, { source: { notIn: REAL_CROP_SOURCES } }]`, nieuwste eerst; alleen als die niets oplevert geldt de fallback (AC2). Docstring bijgewerkt. Code-review-fix (HIGH): oorspronkelijke implementatie gebruikte kaal `source: { notIn: REAL_CROP_SOURCES }`, wat NULL-source-gidsrijen stilzwijgend uitsloot (SQL drie-waardige logica) — gecorrigeerd met de expliciete `OR source:null`-clausule.
- [x] 3. **Fallback-beslissing lege gids (AC: 2)** — bewust gekozen: geen gids-referentie → newest-any (huidig gedrag, nu expliciet als 2e query i.p.v. default). Geen enkele referentie → `null` (ongewijzigd `hadSeed:false`-pad). Bestaande 19.8-lege-klasse-tests blijven ongewijzigd groen (geverifieerd).
- [x] 4. **Tests (AC: 4)** — `flywheel-bootstrap-run.test.ts`, nieuw blok "Story 19.15": (a) gids > nieuwere echte crop (rood bevestigd tegen oude implementatie); (b)+(c) fallback-gedrag (met gids-ontbreken resp. helemaal geen referentie); NFR-6-borgingstest; code-review-fix-regressietest (NULL-source). 5 nieuwe tests, 34/34 groen in het bestand.
- [x] 5. **Regressie-borging conditie C (AC: 3)** — dedicated test bevestigt dat `realRefPaths`/`minRefs`/`rankingThreshold` exact hetzelfde blijven terwijl het zaad nu het gids-logo is; `searchAndQueueClassForReview`'s `realRefPaths`-opbouw (regels ongewijzigd in de diff) blijft onaangeraakt. Zie `19-15-ac-trace.md`.
- [x] 6. **Gates** — `tsc --noEmit`: 0. Volledige api-vitest: 883/883 groen (2 skip, 37 todo; was 877 vóór deze story). ml-pytest: NIET gedraaid — git-hard bevestigd geen wijziging aan `apps/ml-service` (`git diff --stat` + `git status` leeg voor dat pad), dus geen ml-regressie mogelijk.
- [ ] 7. **Eval/live-verificatie (AC: 5)** — BUITEN SCOPE van deze autonome deliverable: vereist expliciete per-geval toestemming van Friso (ACC-eval/deploy). NIET uitgevoerd. AC5 blijft open/pending-permission; story staat op `review`, niet `done`.

## Dev Notes — Developer Context

### Huidige staat (bestanden UPDATE)
- `apps/api/src/services/flywheel/bootstrap-run.ts` — `resolveSeedPath` (`:117`): `prisma.referenceLogo.findFirst({ where: { t3777Code, storagePath: { not: '' } }, orderBy: { createdAt: 'desc' } })` — **geen source-filter**. Docstring (`:111`) zegt "gids-zaad"; het gedrag wijkt af zodra er een nieuwere niet-gids-referentie is. `REAL_CROP_SOURCES` (`:186` = `['review-confirmed','realref-live-poc','flywheel-promotion']`) en `HUMAN_ECHT_SOURCES` (`:295`-context) bestaan al als de "echte crop"-set — hergebruik die voor het NOT-filter. NFR-6-comment (`:33`) bevestigt de bedoelde semantiek (zaad = gids, uitsluitend zoekinstrument).
- `apps/ml-service/app/services/bootstrap_search.py` — `search_with_seed`: het gids-drempel-pad (`sim = cosine(emb, seed_emb); match als sim >= threshold`) is de fallback die nu tegen het "zaad" vergelijkt. Deze story wijzigt UITSLUITEND wélk beeld het zaad is (API-kant); `search_with_seed` zelf blijft ongewijzigd. Conditie C (`realRefPaths`/`ranking_threshold`, Story 19.9) ongemoeid.

### Waarom dit werkt (bewijs, geen speculatie)
- Story 19.9 Task 8 (`19-9-eval-reproductie.md`, 2026-07-12): live-verificatie toonde `ranking_active=true` + 12/12 conditie-C-winst met het GIDS-zaad bewust meegegeven; daarbij viel op dat `resolveSeedPath` productioneel juist een echte crop als zaad zou kiezen. De schakel (conditie C) hangt aantoonbaar aan `real_ref_paths` + `min_refs`, niet aan het zaad — dus het zaad terugzetten op het gids-logo herstelt de bedoelde semantiek zonder de 19.9-winst te raken.

### Wat behouden moet blijven
- Conditie C / nearest-reference-ranking (19.9) — identiek gedrag; echte crops via `realRefPaths`.
- NFR-6 (zaad nooit als output-crop) en de gate-voorfilter (19.6).
- De lege-/schaarse-klasse-flow (19.8-review-routering).

### References
- [Source: apps/api/src/services/flywheel/bootstrap-run.ts#111-125,186] — `resolveSeedPath` + `REAL_CROP_SOURCES`.
- [Source: apps/ml-service/app/services/bootstrap_search.py] — het gids-drempel-fallback-pad (ongewijzigd).
- [Source: _bmad-output/implementation-artifacts/19-9-eval-reproductie.md] — Task 8 live-verificatie (herkomst van deze follow-up).
- [Source: _bmad-output/implementation-artifacts/19-9-fase2-nearest-reference-ranking.md] — Completion Notes / Change Log 2026-07-12 (de genoteerde follow-up) + conditie-C-scope.
- Geheugen: `project_flywheel_resume` (VOLGENDE ACTIES punt 4), `project_123_realref_pivot`.

### Project Structure Notes
- Wijziging blijft binnen de bestaande flywheel-service (`apps/api/src/services/flywheel/`); geen nieuwe modules, geen schema-migratie (alleen een query-filter op bestaande `reference_logos.source`).

## Dev Agent Record

### Agent Model Used
Claude Sonnet 5 (implement-sprint epic-subagent, epic-19, story 19.15).

### Debug Log References
- Rood/groen-bewijs voor AC1/AC4: `git stash` van de implementatie tegen de nieuwe tests (4 faalden op het oude gedrag), daarna hersteld — zie `review-19-15-adversarial.md`.
- Rood/groen-bewijs voor het code-review-fix (NULL-source, HIGH): tijdelijke terugzet van de `OR`-clausule naar kaal `notIn` liet de nieuwe regressietest falen; hersteld.

### Completion Notes List
- Kernfix: `resolveSeedPath` prefereert nu het gids-zaad (source ∉ `REAL_CROP_SOURCES`, inclusief `source:null`), nieuwste eerst; fallback = newest-any (bewust, AC2).
- Onafhankelijke adversarial review (Blind Hunter + Edge Case Hunter, parallel, geen gedeelde context) vond hetzelfde HIGH-defect (NULL-source-uitsluiting door SQL drie-waardige logica bij `notIn`) — gefixt vóór commit. Acceptance Auditor tegen het storybestand: AC1-4 + Afbakening-constraints compliant.
- AC3 (geen regressie conditie C/19.9) expliciet getest + beargumenteerd: `searchAndQueueClassForReview`'s `realRefPaths`-opbouw is een onafhankelijke query, ongewijzigd in de diff.
- AC5/Task 7 (ACC-eval-reproductie) bewust NIET uitgevoerd — vereist per-geval-toestemming die deze uitvoering niet had. Story blijft op `review`.
- Volledige api-vitest-suite: 883/883 groen (was 877 vóór deze story; +6 door de nieuwe/uitgebreide tests). `tsc --noEmit`: 0. ml-pytest: git-hard beargumenteerd overgeslagen (geen wijziging in `apps/ml-service`).

### File List
- `apps/api/src/services/flywheel/bootstrap-run.ts` (UPDATE — `resolveSeedPath`)
- `apps/api/src/__tests__/services/flywheel-bootstrap-run.test.ts` (UPDATE — nieuw testblok Story 19.15)
- `_bmad-output/implementation-artifacts/19-15-ac-trace.md` (NEW — AC→test-traceability)
- `_bmad-output/implementation-artifacts/review-19-15-adversarial.md` (NEW — adversarial review, verdict PASS)
- `_bmad-output/implementation-artifacts/19-15-zaadkeuze-semantiek-resolveseedpath.md` (UPDATE — dit bestand)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (UPDATE — status → review)
- `versions.md` (UPDATE — nieuwe entry)

## Change Log
- 2026-07-12: aangemaakt via bmad-create-story als follow-up uit Story 19.9 Task 8 (live-verificatie conditie C op ACC). Scope: `resolveSeedPath` prefereert expliciet het gids-zaad (source-filter) zodat de gids-fallback semantisch het gids-logo blijft; echte crops doen uitsluitend via `realRefPaths`/conditie C mee. Geen wijziging aan conditie C, gate, guard of review-routering.
- 2026-07-12: implement-sprint (Tasks 1-6, AC1-4) — `resolveSeedPath` source-preferentie geïmplementeerd + NULL-safe (code-review-fix HIGH: `OR: [{source:null},{source:{notIn:REAL_CROP_SOURCES}}]`, anders sluit SQL's `NOT IN` NULL-source-gidsrijen stilzwijgend uit). 5 nieuwe/uitgebreide tests (34/34 groen in het bestand); volledige api-vitest 883/883 groen; tsc 0; ml-pytest git-hard overgeslagen (geen ml-service-wijziging). Adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel) → verdict PASS na de HIGH-fix. AC-trace 4/4. Status → `review`; AC5/Task 7 (ACC-eval, permission-gated) NIET uitgevoerd — blijft open.
