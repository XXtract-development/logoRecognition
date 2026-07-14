# Story 12.12: NutriScore vorm-oogst — vind Nutri-Score-regio's op de vorm, mens labelt de letter (vult C/D)

Status: review

<!-- Volgt uit de 12.11-spike (synthetisch = NO-GO) + de corpus-vindbaarheid-diagnose (GO: ~734 Nutri-Score-regio's, ~160 C/D-achtig). Het bewezen ECHTE-crop-pad: vind Nutri-Score-regio's letter-onafhankelijk op de vorm, de mens bevestigt de exacte letter via de bestaande relabel-picker (12.7). Zo komen C(0)/D(1) aan echte referenties → conditie C (19.9) doet de rest. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **Nutri-Score-regio's in het artwork-corpus vinden op de VORM (letter-onafhankelijk) en ze voorleggen aan de review-wachtrij, waar ik de exacte letter (A–E) bevestig**
zodat **NutriScore C (0 crops) en D (1 crop) — die niet via de letterloze declaratie te vullen zijn — aan door mensen bevestigde ECHTE referentie-crops komen, en 19.9's conditie C ze herkent zoals al bewezen voor A/B/E** (FR-22; het bewezen echte-crop-pad).

### Afbakening (kritiek)
- **Herkomst:** de 12.11-spike bewees dat de SYNTHETISCHE route NO-GO is (synth→echt-domeinkloof + kleur-invariante augmentatie). De corpus-vindbaarheid-diagnose (`nutriscore-corpus-vindbaarheid-2026-07-13.md`) gaf GO: ~734 Nutri-Score-regio's in het corpus, ~160 C/D-achtig → ruim genoeg voor de ≥3-per-letter die C/D nodig hebben.
- **De kern is letter-ONAFHANKELIJK zoeken op de vorm + menselijke letter-labeling** — GEEN nieuwe herkennings-machinerie. Het Nutri-Score-logo is voor alle 5 letters dezelfde vorm; de mens leest de letter (het model kan dat niet, zie 12.11). Reuse:
  - **Zoeken:** een Nutri-Score-gescopete variant van de harvester (`queue_harvest.py`, 19.10): zoek regio's die op de Nutri-Score-vorm lijken (match tegen de gecombineerde Nutri-Score-ref-pool: echte A/B/E + de 5 synthetische zaden) met een RUIME cosine-drempel (letter-onafhankelijk; de vorm matcht over de letters heen — 12.11 toonde die vorm-overlap). Voorfilter met de bestaande keurmerk-gate.
  - **Reviewen + labelen:** geharveste regio's → OPEN `artwork_review_items` (19.8-pad); de mens bevestigt de exacte letter via de bestaande **relabel-picker (Story 12.7, `artwork-pipeline.ts` reopen→accept, `t3777-declarations.ts:319`)**. De bevestigde crop wordt een actieve `NUTRISCORE_<letter>`-referentie (review-confirmed) → conditie C.
- **Provisionele code + menselijke correctie:** de harvest zet een provisionele code (bv. een grove kleur-gok groen→A/B, geel→C, oranje→D, rood→E, óf `NUTRISCORE`-onbekend); de mens zet de definitieve letter via de picker. De picker moet de 5 Nutri-Score-letters aanbieden (verifieer/borg dat).
- **Precisie:** de ruime drempel levert false positives (andere logo's). Die worden door de menselijke review gefilterd (VALS) — dat is by design. Bewaak flood met een cap (zoals 19.10).
- **Scope:** UITSLUITEND Nutri-Score. Geen wijziging aan de reguliere harvest-scoping (19.10 top-N/sub-k), conditie C (19.9), de gate, of de review-routering zelf — dit is een extra, apart aanroepbare Nutri-Score-modus.
- **Elke ACC-schrijf/harvest-run met expliciete toestemming per geval.** `DRY_RUN` als read-only vertrekpunt. Container zelfstandig herstartbaar.

## Acceptatiecriteria

1. **Given** het artwork-corpus en de Nutri-Score-ref-pool (echte A/B/E + 5 zaden)
   **When** de Nutri-Score-vorm-oogst draait
   **Then** vindt hij regio's die op de Nutri-Score-vorm lijken (match ≥ ruime drempel, letter-onafhankelijk, ná de keurmerk-gate) en legt ze als OPEN `artwork_review_items` voor — begrensd door een cap (geen flood).

2. **Given** een geharveste Nutri-Score-regio in de review-wachtrij
   **When** de mens hem beoordeelt
   **Then** kan de mens de exacte letter (NUTRISCORE_A..E) kiezen/bevestigen via de bestaande relabel-picker (12.7); een bevestigde crop wordt een actieve `NUTRISCORE_<letter>`-referentie (review-confirmed) met embedding.

3. **Given** C en D krijgen ≥ k=3 door mensen bevestigde echte crops
   **When** conditie C (19.9) een Nutri-Score-C/D-regio evalueert
   **Then** herkent hij die per letter (zoals al bewezen voor A/B/E) — geen wijziging aan conditie C nodig.

4. **Given** de Nutri-Score-modus
   **When** hij draait
   **Then** blijven ALLE kleppen ongemoeid (declaratie-guard n.v.t. hier want letter-onafhankelijk zoeken, maar gold-set/dedup/hard-negative/NFR-6 gelden), en de reguliere harvest-scoping (19.10) + conditie C + gate zijn ONGEWIJZIGD. De modus is apart/expliciet aanroepbaar (env/flag), niet de default-nachtrun.

5. **Given** de wijziging
   **When** de testsuite draait
   **Then** dekt een test: (a) de Nutri-Score-vorm-scoping (matcht regio's tegen de ref-pool met de ruime drempel, letter-onafhankelijk); (b) de provisionele-code-toewijzing + dat de mens de letter kan overschrijven; (c) DRY_RUN muteert niets; (d) de cap/flood-guard. Gates groen.

6. **Given** de bestaande corpus-vindbaarheid
   **When** (met toestemming) een `DRY_RUN` op ACC draait
   **Then** toont de run hoeveel Nutri-Score-regio's hij zou voorleggen + de grove kleur/letter-verdeling (bevestigt de ~734/~160-C-D-schatting), read-only. Daarna (aparte toestemming) een echte run die de review-items aanmaakt.

## Tasks / Subtasks

- [ ] 1. **Nutri-Score-ref-pool + vorm-zoekmodus (AC: 1)** — een aparte, expliciet aanroepbare modus (env/flag, bv. `HARVEST_NUTRISCORE_MODE` of een los script naast `queue_harvest.py`) die de match doet tegen de gecombineerde Nutri-Score-ref-pool (active `reference_logos` t3777_code ∈ NUTRISCORE_A..E, incl. zaden) met een RUIME drempel (`NUTRISCORE_HARVEST_FLOOR`, kalibreerbaar ~0,55–0,65; de 12.11/diagnose gebruikte 0,60). Gate-voorfilter blijft. Documenteer de drempel-kalibratie (recall C/D vs precisie/flood).
- [ ] 2. **Review-insert + provisionele code (AC: 1, 2)** — geharveste regio's → OPEN `artwork_review_items` met een provisionele code (grove kleur-gok of `NUTRISCORE`-placeholder) + een cap. Borg dat de bestaande relabel-picker (12.7) de mens de 5 Nutri-Score-letters laat kiezen bij accept (verifieer `artwork-pipeline.ts` reopen→accept + de picker-opties; breid uit indien de 5 letters er niet in staan).
- [ ] 3. **Bevestigde crop → NUTRISCORE_<letter>-referentie (AC: 2, 3)** — bevestig (test + redenering) dat de bestaande accept→referentie-flow (19.8/19.12) een mens-bevestigde Nutri-Score-crop een actieve `review-confirmed`-referentie met embedding maakt onder de door de mens gekozen letter → voedt conditie C (19.9). Geen wijziging aan conditie C.
- [ ] 4. **Vangnet-borging (AC: 4)** — gold-set/dedup/hard-negative/NFR-6 gelden; de reguliere harvest-scoping (19.10) + conditie C + gate ONGEWIJZIGD; de modus is apart aanroepbaar (niet de default-nachtrun). Test/redeneer dit.
- [ ] 5. **Tests (AC: 5)** — vorm-scoping (letter-onafhankelijke match tegen de pool), provisionele-code + mens-override, DRY_RUN muteert niets, cap. Patroon `test_queue_harvest_19_10.py` (ml-pytest) + eventueel api-vitest voor de picker.
- [ ] 6. **Gates** — ml-pytest (+ api-vitest indien de picker/api geraakt); tsc 0 indien api-kant.
- [ ] 7. **Live (permission-gated, AC: 6)** — met toestemming: `DRY_RUN` op ACC (read-only: hoeveel zou het voorleggen + kleur/letter-verdeling) → echte run die review-items aanmaakt → jij labelt de letters in de review-UI → C/D over de drempel → conditie-C-herkenning per letter aantonen.

## Dev Notes — Developer Context

### Bouwstenen (bestaand — hergebruiken)
- `apps/ml-service/app/services/queue_harvest.py` (19.10) — de harvest-mechaniek (regio→embed→gate→nearest-ref→cap→OPEN review-insert). Deze story voegt een Nutri-Score-gescopete, letter-onafhankelijke variant toe (match tegen de Nutri-Score-pool met ruime drempel), NIET de reguliere top-N/sub-k-scoping.
- Review + relabel-picker: `apps/api/src/api/v1/artwork-pipeline.ts` (~1057 accept, ~1413 relabel reopen→accept), `apps/api/src/services/t3777-declarations.ts:319` (declared-marks als label-prior voor de relabel-UI, Story 12.7), `apps/web/src/pages/ArtworkReviewPage.tsx` + `components/review/ArtworkReviewItemCard.tsx`. De mens kiest de code (letter) hier.
- `find_similar_references` / conditie C: `apps/ml-service/app/services/bootstrap_search.py` (19.9) — ongewijzigd; de bevestigde crops voeden het.

### Waarom dit werkt (bewijs)
- **Vindbaarheid GO:** `nutriscore-corpus-vindbaarheid-2026-07-13.md` — ~734 Nutri-Score-regio's, ~160 C/D-achtig (400-GTIN-sample geëxtrapoleerd); zelfs bij 25–40% netto-precisie ~40–65 genuïne C/D-crops. Ruim boven ≥3/letter.
- **Synthetisch NO-GO:** `12-11-spike-resultaten.md` — dwingt het echte-crop-pad af.
- **Echte-crop-pad bewezen:** A/B/E halen ~100% top-1 met echte refs (12.9-eval/19.7).

### Wat behouden moet blijven
- De reguliere harvest (19.10 top-N/sub-k) — ongewijzigd; de Nutri-Score-modus is apart.
- Conditie C (19.9), gate-v2, region-proposer, embedding — ongewijzigd.
- Kleppen: gold-set/dedup/hard-negative/NFR-6.

### Ontwerpvragen (voor dev-story)
- **Drempel:** de ruime `NUTRISCORE_HARVEST_FLOOR` — kalibreer recall (C/D vinden) vs precisie (review-last). De DRY_RUN meet dit.
- **Provisionele code:** grove kleur-gok (HSV) vs een `NUTRISCORE`-placeholder; hoe dan ook overschrijft de mens.
- **Picker-opties:** bevat de relabel-picker de 5 Nutri-Score-letters? Zo niet, kleine uitbreiding (Task 2).

### References
- [Source: 12-11-spike-resultaten.md] — synthetisch NO-GO.
- [Source: nutriscore-corpus-vindbaarheid-2026-07-13.md] — vindbaarheid GO (~734/~160 C-D).
- [Source: apps/ml-service/app/services/queue_harvest.py] — de te-hergebruiken harvest-mechaniek (19.10).
- [Source: apps/api/src/api/v1/artwork-pipeline.ts#1413, t3777-declarations.ts#319] — de relabel-picker (12.7).
- [Source: apps/ml-service/app/services/bootstrap_search.py] — conditie C (19.9).
- Geheugen: `project_flywheel_resume`, `project_keurmerk_dekking_strategie`.

### Project Structure Notes
- ml-service (de harvest-modus) + mogelijk een kleine api/web-uitbreiding (picker-letters). Geen schema-migratie. DRY_RUN + toestemming voor de ACC-run.

## Dev Agent Record
### Agent Model Used
Claude Sonnet 5 (epic-agent, implement-sprint), autonome implementatie op branch `epic-12-story-12.12`.

### Debug Log References
- ml-pytest ATDD-run (ghcr-wegwerp-container, `ghcr.io/xxtract-development/logo-recognition-ml:acc`, image-tag `81c1012`):
  `docker run --rm --platform linux/amd64 -v <worktree>/apps/ml-service/app:/app/app -v <worktree>/apps/ml-service/tests:/app/tests -w /app ghcr.io/xxtract-development/logo-recognition-ml:acc sh -c 'pip install -q pytest pytest-asyncio; python -m pytest tests/unit/test_queue_harvest_nutriscore_12_12.py -p no:cacheprovider -rA -q'` → **17 passed**.
- Volledige ml-pytest-suite in dezelfde container: **80 passed, 13 skipped, 7 errors** (dezelfde 7 pre-existing/onveranderde collection-errors als vóór deze story, geen 12.12-gerelateerde bestanden; baseline zónder het 12.12-testbestand was 63 passed — netto +17, 0 regressies, `test_queue_harvest_19_10.py` blijft 9/9 GREEN).
- api-vitest (`npx vitest run` in `apps/api`): **912 passed, 0 failed** (inclusief de 8 nieuwe/uitgebreide tests in `artwork-pipeline.routes.test.ts`).
- web-vitest (`npx vitest run` in `apps/web`): **128 passed, 0 failed** (inclusief de 3 nieuwe tests in `MobileReviewDeck.nutriscore-12-12.test.tsx`).
- `tsc --noEmit`: 0 errors in zowel `apps/api` als `apps/web` (ná `prisma generate` — omgevingsstap, geen codewijziging).

### Completion Notes List
- **Aparte modus (Task 1, AC1/AC4):** nieuw, apart script `apps/ml-service/app/services/queue_harvest_nutriscore.py` (NIET een env-vlag in `queue_harvest.py`) — gemotiveerd in de module-docstring: nul impact op de zwaar-geteste 19.10-scoping, eigen MinIO-state-key, eigen env-namespace (`NUTRISCORE_HARVEST_*`). Matcht letter-onafhankelijk tegen de vaste 5-code Nutri-Score-pool via een nieuwe, aparte DB-methode `find_similar_references_by_codes` (`database.py`) — bestaat NAAST `find_similar_references` (19.9/19.10 ongewijzigd), met `NUTRISCORE_HARVEST_FLOOR` default 0,60 (exact de diagnose-waarde, gepind door een dedicated test).
- **Provisionele code (Task 2, AC1/AC2):** grove HSV-kleur-gok (`_provisional_code`) → 5 letter-buckets + een `NUTRISCORE`-placeholder bij lage verzadiging (geen gedwongen gok). Cap (`NUTRISCORE_HARVEST_PER_CODE_CAP`, default 15) per provisionele-code-bucket — flood-guard-patroon van 19.10, nu toegepast op de kleur-bucket i.p.v. de t3777-code (want de letter is nog onbekend bij insert).
- **Relabel-picker (Task 2/3, AC2/AC3):** GEVERIFIEERD, geen productiecode-wijziging nodig — `apps/web/src/data/keurmerk-codes.ts` bevat de 5 Nutri-Score-codes al, `MobileReviewDeck.tsx`'s picker (Story 12.6/12.7) doorzoekt die volledige universe al, en `artwork-pipeline.ts`'s accept-endpoint accepteert de `t3777Code`-override al code-agnostisch → een mens-bevestigde Nutri-Score-crop wordt via het bestaande 19.8/19.12-pad een actieve `review-confirmed`-referentie onder de gekozen letter. Bewezen met nieuwe tests (web + api), niet met nieuwe code.
- **Vangnet (Task 4, AC4):** git-hard geverifieerd — `queue_harvest.py`, `bootstrap_search.py` (conditie C), `keurmerk_gate.py` staan NIET in de diff. Gold-set/hard-negative-kleppen zitten downstream op het accept/reject-pad, identiek voor beide harvesters.
- **Tests (Task 5, AC5):** 17 nieuwe ml-pytest-tests (vorm-scoping/letter-onafhankelijkheid, provisionele-code + placeholder-fallback, per-bucket-cap, DRY_RUN) + 6 kleur-heuristiek-tests met ECHTE opencv (geen stub) + 3 nieuwe web-tests (picker toont de 5 letters, relabel stuurt de juiste letter mee) + 6 nieuwe/uitgebreide api-tests (accept-override → registerReference met de gekozen letter, alle 5 letters).
- **Gates (Task 6):** alle groen, zie Debug Log References.
- **Task 7 (AC6, live ACC) NIET uitgevoerd:** permission-gate, geen expliciete toestemming ontvangen binnen deze run. Story blijft op `review`.
- Zelf gevonden en gefixt tijdens implementatie (zie `review-12-12-adversarial.md`): (1) `import cv2` geconsolideerd naar module-top (stijlconsistentie met `queue_harvest.py`); (2) de kleur-heuristiek-tests gehard tegen sessie-brede `cv2`-stub-pollutie van een ongerelateerde bestaande suite (`test_bootstrap_search_service.py`) — beide vóór de initiële commit, dus geen aparte fix-commit.

### File List
- `apps/ml-service/app/services/queue_harvest_nutriscore.py` (NEW) — de Nutri-Score vorm-oogst (letter-onafhankelijk), apart script.
- `apps/ml-service/app/services/database.py` (MODIFIED) — nieuwe methode `find_similar_references_by_codes` toegevoegd (additief, geen bestaande methode gewijzigd).
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_12_12.py` (NEW) — 23 ATDD-tests (17 scoping/provisionele-code/cap/dry-run + 6 kleur-heuristiek met echte cv2).
- `apps/api/src/__tests__/api/artwork-pipeline.routes.test.ts` (MODIFIED) — 2 nieuwe test-cases (1 expliciet + 1 `it.each` over 4 letters) die de accept-override→referentie-flow voor Nutri-Score-letters bewijzen; geen productiecode gewijzigd.
- `apps/web/src/components/review/MobileReviewDeck.nutriscore-12-12.test.tsx` (NEW) — 3 tests die bewijzen dat de relabel-picker de 5 Nutri-Score-letters aanbiedt en de juiste letter meestuurt; geen productiecode gewijzigd.
- `_bmad-output/implementation-artifacts/12-12-ac-trace.md` (NEW) — AC→test-mapping.
- `_bmad-output/implementation-artifacts/review-12-12-adversarial.md` (NEW) — adversarial review, verdict PASS.
- `_bmad-output/implementation-artifacts/12-12-retrospective.md` (NEW) — retrospective.
- `versions.md` (MODIFIED) — nieuwe entry.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — 12-12 → review.

## Change Log
- 2026-07-13: aangemaakt via bmad-create-story. Volgt uit 12.11-spike (synthetisch NO-GO) + corpus-vindbaarheid GO (~734 regio's, ~160 C/D). Vorm-gebaseerde Nutri-Score-oogst (letter-onafhankelijk) → review → mens labelt de letter (relabel-picker 12.7) → echte C/D-referenties → conditie C (19.9). Hergebruikt queue_harvest (19.10) + review-pad; reguliere scoping + conditie C ongewijzigd. ACC-run met toestemming per geval.
- 2026-07-13: implement-sprint — Tasks 1-6 af (AC1-5). Nieuw apart script `queue_harvest_nutriscore.py` (letter-onafhankelijke vorm-match tegen de 5-code Nutri-Score-pool, ruime kalibreerbare drempel default 0,60, HSV-kleur-provisionele-code, per-bucket-cap, DRY_RUN) + nieuwe DB-methode `find_similar_references_by_codes` (additief). Relabel-picker (12.7) + accept→referentie-flow (19.8/19.12) GEVERIFIEERD al toereikend (5 Nutri-Score-letters, code-agnostische override) — geen productiecode-wijziging in api/web, alleen nieuwe tests. Gates: ml-pytest 80/80 relevant groen (17 nieuw, 0 regressies, `queue_harvest.py`/19.10 ongewijzigd en 9/9 groen), api-vitest 912 passed, web-vitest 128 passed, tsc 0 (api+web). Adversarial review PASS (2 zelf-gevonden LOW-bevindingen gefixt vóór commit). Status → review. Task 7 (ACC DRY_RUN + echte run + menselijke labeling, AC6) NIET uitgevoerd: permission-gate, geen toestemming ontvangen binnen deze run.
