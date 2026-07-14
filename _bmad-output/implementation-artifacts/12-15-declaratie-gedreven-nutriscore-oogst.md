# Story 12.15: Declaratie-gedreven Nutri-Score-oogst (gedeclareerde letter = grondwaarheid-label)

Status: review

<!-- Volgt uit Friso's idee (2026-07-13) + read-only bevestiging: de Nutri-Score-LETTER staat per product gedeclareerd (GS1 `nutritionalScore`, A–E) en wordt AL uitgelezen door Story 12.7 `resolveDeclaredMarks`. Dekking in de artwork-set: A30/B33/C22/D16/E41 (ondergrens). Vervangt de noisy 12.12-vorm-oogst (kleur-gok, 15% hitrate, 0 nieuwe C/D) door een declaratie-gedreven oogst met gegarandeerd-juist label. -->

## Story

Als **datamanager van het keurmerk-vliegwiel**
wil ik **de Nutri-Score-referenties voor de lege/dunne letters (C=0, D=1) vullen door per product met een gedeclareerde Nutri-Score-letter het Nutri-Score-vakje op het etiket te detecteren, te croppen en te registreren onder de GEDECLAREERDE letter**
zodat **C en D over de herkenningsdrempel (conditie C, ≥3 echte crops) komen met een gegarandeerd-juist label — zonder de noisy kleur-gok en zonder handmatig veel te annoteren** (de gedeclareerde letter is de grondwaarheid).

### Afbakening (kritiek)
- **Hergebruik, niet dupliceren:**
  - **De letter-uitlezing bestaat al:** Story 12.7 `resolveDeclaredMarks(gtin)` (`apps/api/src/services/t3777-declarations.ts`) haalt de tradeItem-XML uit de catalogus (gecached, fail-safe) en parseert `nutritionalScore` (fieldType `NutritionalScore`, waarde kale letter A–E). Live op ACC (`CATALOG_API_KEY`). Gebruik dit als de grondwaarheid-label-bron — bouw GEEN nieuw catalogus-uitleespad.
  - **De Nutri-Score-vakje-detectie bestaat al:** de vorm-match tegen de NUTRISCORE_A–E-refpool + gate uit Story 12.12 (`apps/ml-service/app/services/queue_harvest_nutriscore.py` — `find_similar_references_by_codes`, gate-voorfilter, crop-extractie). Hergebruik de detectie/crop; vervang alleen het LABEL: niet de kleur-gok (`_provisional_code`), maar de gedeclareerde letter.
  - **De registratie + conditie C bestaan al:** accept→`review-confirmed`-referentie + embedding (19.8/19.12), conditie C (19.9) draait bij ≥3.
- **Scope:** de GTINs met een gedeclareerde **C of D** (22 resp. 16 gevonden in de index; ondergrens) — primair doel is C en D over k=3. A/B/E optioneel meenemen om te versterken, maar C/D eerst.
- **Grondwaarheid vs locatie:** de declaratie garandeert de LETTER, niet dat de detector het juiste vakje cropte. Daarom: label = gedeclareerde letter; lever de crops **voorgelabeld aan de review-wachtrij** zodat Friso met één klik bevestigt (validatie van de crop-locatie op de eerste ronde), i.p.v. de noisy per-letter-gok. Een confidence-gate (vorm-match-drempel) voorkomt dat een verkeerd gecropt vlak als de gedeclareerde letter binnenkomt. (Optioneel, als de eerste ronde hoge precisie toont: directe registratie zonder review voor hoog-confidence crops — als apart vervolgbesluit, niet in deze story afdwingen.)
- **Geen ACC-schrijf/deploy zonder expliciete toestemming Friso** (de oogst-run die review-items/refs aanmaakt is permission-gated). Code + tests + review draaien autonoom tot `review`.
- **12.7-parser-nuance (meenemen):** de deployed `parseDeclaredMarks`-regex prefix-matcht óók `nutritionalScoreProductCategoryCode` → categorie-codes (GENERAL_FOODS/CHEESES) lekken onder fieldType NutritionalScore. Voor deze oogst: filter de gedeclareerde `NutritionalScore`-marks hard op **exact A/B/C/D/E** (verwerp categorie-codes). Signaleer de bredere 12.7-fix (relabel-picker/crosscheck-hint) als losse follow-up — niet in deze story de 12.7-crosscheck wijzigen.

## Acceptatiecriteria

1. **Gedeclareerde letter als label**
   **Given** een GTIN met een gedeclareerde Nutri-Score-letter (via `resolveDeclaredMarks`, gefilterd op exact A–E) en artwork in onze set
   **When** de oogst het Nutri-Score-vakje op dat etiket detecteert (vorm-match tegen de NUTRISCORE_A–E-pool + gate, ≥ confidence-drempel)
   **Then** wordt de crop voorgesteld/gelabeld als `NUTRISCORE_<gedeclareerde-letter>` — NIET via een kleur-gok — en belandt hij (voorgelabeld) in de review-wachtrij (of, indien zo besloten, directe registratie voor hoog-confidence).

2. **C/D-prioriteit + drempel-doel**
   **Given** de 22 C- en 16 D-declarerende GTINs
   **When** de oogst draait
   **Then** levert hij genoeg gevalideerde C- en D-crops om beide letters op ≥3 echte `review-confirmed`-referenties te brengen, waarna conditie C (19.9) voor C en D aangaat (zoals al bewezen A/B/E).

3. **Geen verkeerde-locatie-registratie**
   **Given** een product dat letter X declareert maar waar de detector geen betrouwbaar Nutri-Score-vakje vindt (onder de confidence-drempel)
   **When** de oogst draait
   **Then** wordt er GEEN crop onder X geforceerd (geen fabricatie); zo'n product wordt overgeslagen/gelogd. De declaratie labelt alleen een daadwerkelijk gedetecteerd vakje.

4. **Idempotent + begrensd + read-only-veilig in dry-run**
   **Given** een DRY_RUN
   **When** de oogst draait
   **Then** muteert hij niets (geen crop-upload, geen review-insert, geen registratie) en rapporteert wat hij zou doen (per letter #kandidaten). Een echte run is idempotent (geen dubbele refs per storage_path/GTIN) en begrensd (cap per letter).

5. **Tests**
   **Given** de wijziging
   **When** de tests draaien
   **Then** dekken ze: (a) declaratie A–E → label `NUTRISCORE_<letter>` (en categorie-codes zoals GENERAL_FOODS worden verworpen — de 12.7-leak-guard); (b) gedetecteerd vakje onder de drempel → overgeslagen (AC3); (c) DRY_RUN muteert niets; (d) cap per letter. Patroon `test_queue_harvest_nutriscore_12_12.py` + api-tests indien API-orkestratie.

## Tasks / Subtasks
- [x] 1. **GTIN→gedeclareerde-letter-map (AC1, AC3, hergebruik 12.7)** — via `resolveDeclaredMarks` de gedeclareerde Nutri-Score-letter per GTIN resolven, **gefilterd op exact A/B/C/D/E** (verwerp categorie-codes/GENERAL_FOODS — de 12.7-leak-guard). Scope op C/D (optioneel A/B/E). Kies de architectuur en motiveer: (a) API-side orkestratie-script (heeft `resolveDeclaredMarks` + registratie + `mlClient`) dat per GTIN de crop bij ml-service opvraagt, óf (b) de GTIN→letter-map vooraf (API) berekenen en aan de bestaande Python-oogst (12.12) meegeven als label-bron. Leun naar de aanpak met de minste duplicatie en de bestaande registratie-flow.
- [x] 2. **Detectie/crop hergebruiken, label vervangen (AC1, AC3)** — hergebruik de 12.12-vorm-detectie (`find_similar_references_by_codes` tegen de NUTRISCORE_A–E-pool + gate + crop). Vervang de kleur-gok (`_provisional_code`) door de gedeclareerde letter. Pas een confidence-drempel toe (vorm-match) zodat alleen een betrouwbaar gedetecteerd vakje het gedeclareerde label krijgt (AC3). Geen fabricatie bij niet-gevonden.
- [x] 3. **Aflevering naar review (voorgelabeld) (AC1, AC2)** — de gevalideerde crops als OPEN `artwork_review_items` met `t3777_code = NUTRISCORE_<gedeclareerde-letter>` + een reason-marker (bv. `12.15 nutriscore-declaratie-oogst`), zodat Friso met één klik bevestigt (validatie crop-locatie). Cap per letter (flood-guard, patroon 19.10/12.12). Bevestiging → `review-confirmed`-ref + embedding (bestaande accept→ref-flow) → conditie C bij ≥3.
- [x] 4. **DRY_RUN + idempotentie + begrenzing (AC4)** — DRY_RUN muteert niets en rapporteert per letter; echte run idempotent + begrensd.
- [x] 5. **Tests (AC5)** — zie AC5.
- [x] 6. **Verificatie (AC1-5)** — gates (ml-pytest en/of api-vitest naargelang de architectuur; `tsc --noEmit` 0 als API geraakt) zelf groen draaien. GEEN ACC-run/deploy (permission-gated). Documenteer in Dev-notes de DRY_RUN-verwachting.

## Dev Notes — Developer Context
### Bouwstenen (bestaand — hergebruiken)
- `apps/api/src/services/t3777-declarations.ts` — `resolveDeclaredMarks(gtin)` (12.7): gecachte, fail-safe catalogus-declaratie incl. `nutritionalScore` (A–E). MARK_FIELDS regel ~350. **LET OP** de regex-leak (`nutritionalScoreProductCategoryCode`) → filter hard op A–E.
- `apps/ml-service/app/services/queue_harvest_nutriscore.py` (12.12) — vorm-detectie tegen de NUTRISCORE_A–E-pool (`find_similar_references_by_codes`), gate-voorfilter, crop-extractie, review-insert, DRY_RUN, per-letter-cap. Hergebruik alles behalve `_provisional_code` (kleur-gok → vervang door gedeclareerde letter).
- `apps/ml-service/app/services/database.py` — `find_similar_references_by_codes` (12.12).
- Registratie + conditie C: accept→`review-confirmed`-ref (19.8/19.12), `bootstrap_search.py` conditie C (19.9, k=3).
- De GTIN-set + artwork: flywheel-index (`flywheel-index/keurmerk-etiket-index.json`, ~1862 GTINs) + `artwork_imports.storagePath`.

### Wat behouden moet blijven / niet doen
- Reguliere harvest (`queue_harvest.py`, 19.10), conditie C (19.9), de gate, de 12.12-vorm-oogst en de 12.7-crosscheck ONGEWIJZIGD (deze story is een aparte, expliciet aan te roepen oogst-modus). Geen model-training. Geen ACC-schrijf/registratie/deploy zonder toestemming. Geen fabricatie (AC3).
- De 12.7-crosscheck-parser NIET in deze story wijzigen (alleen lokaal hard op A–E filteren voor déze oogst); de bredere 12.7-leak-fix is een losse follow-up.

### Waarom dit de juiste route is
De gedeclareerde letter is grondwaarheid (het product zegt zelf: dit is een C). Dat vervangt de noisy kleur-gok van 12.12 (15% hitrate, ronde-1: 0 nieuwe C/D) door gegarandeerd-juiste labels en minimaliseert Friso's handwerk (hooguit een klik ter validatie van de crop-locatie). Het is het vliegwiel zoals bedoeld, met de declaratie als prior — verwant aan Story 12.7/12.8 (declared-values), maar toegepast op het `nutritionalScore`-veld om de lege C/D-klassen te vullen.

### References
- `nutriscore-declaratie-prod-check-2026-07-13.md` (veldpad `nutritionalScore` + etiket-URL) en `nutriscore-declaratie-dekking-index-2026-07-13.md` (A30/B33/C22/D16/E41, ondergrens).
- Geheugen: `project_flywheel_resume` (blok "HERGEBRUIK-VONDST + DEKKING"), `project_declared_values_prior` (12.7), `project_kruischeck_n8n_decision` (12.8), `project_recyclable_dead_refs` (conditie C / ref-gap).
- Story 12.7 (`t3777-declarations.ts`), 12.12 (`queue_harvest_nutriscore.py`), 19.9 (conditie C), 19.8/19.12 (accept→ref).

### Project Structure Notes
- Bouwen in een schone worktree; commit code + tests + story→`review` + sprint-status samen (één werk-commit). Aparte oogst-modus (flag/script), niet de default-nachtrun.

## Dev Agent Record
### Agent Model Used
Claude Sonnet 5 (epic-agent, implement-sprint epic-12 scope=12.15)

### Debug Log References
- Worktree `epic-12-15` was branched from `epic-12-story-12.13` (4bde628) but did NOT contain the 12.12 bouwsteen (`epic-12-story-12.12` @ f45056e was still an unmerged sibling branch; `sprint-status.yaml` in this worktree stale-showed `12-12-nutriscore-vorm-oogst: ready-for-dev`). Merged `epic-12-story-12.12` into `epic-12-story-12.15` (additief, geen conflicten in productiecode; conflicten alleen in `sprint-status.yaml`/`versions.md`, handmatig opgelost) — nodig om `queue_harvest_nutriscore.py`/`find_similar_references_by_codes` te kunnen hergebruiken zoals de story voorschrijft. `sprint-status.yaml` `12-12`-regel gecorrigeerd naar `review` (was stale `ready-for-dev`); `12-13`-regel-comment-corruptie (per ongeluk op de 12-15-regel geplakt door een eerdere sync) hersteld.

### Completion Notes List
- **Architectuurkeuze (Task 1, optie B gekozen):** `resolveDeclaredMarks` (Prisma-gln-lookup + Redis-cache + catalog-XML-fetch) bestaat alleen TS-side (`apps/api`); de vorm-detectie (region-proposer/embedding/pgvector-nearest-match) bestaat alleen ml-service-side (Python). Een vooraf-berekende GTIN→letter-map (TS-script, geschreven naar een vaste MinIO-sleutel, precedent `build-keurmerk-index.ts`/`VOLUME_INDEX_KEY`) + een Python-oogst die de map leest hergebruikt beide bouwstenen ONGEWIJZIGD, zonder een nieuw cross-taal HTTP-oppervlak (optie A zou dat wel vergen). Minste duplicatie, zoals de story vraagt.
- **AC1** — `apps/api/src/scripts/build-nutriscore-declared-map.ts`: `classifyDeclaredLetter` filtert hard op fieldType `NutritionalScore` + een kale, enkele letter A-E (de 12.7-regex-leak-guard: categorie-codes als GENERAL_FOODS zijn nooit lengte-1 en worden dus vanzelf verworpen, nooit gegokt bij >1 distincte letter). `apps/ml-service/app/services/queue_harvest_nutriscore_declared.py` hergebruikt de 12.12-vorm-detectie (`find_similar_references_by_codes` tegen de ONGEWIJZIGDE NUTRISCORE_A-E-pool) maar registreert het `t3777_code` uit de gedeclareerde-letter-map, NIET uit de vorm-match (`matched_code` bewijst alleen de pool-scoping, zoals in 12.12).
- **AC2** — default-scope `NUTRISCORE_DECLARED_HARVEST_LETTERS=C,D`; C/D-GTINs worden binnen elke batch altijd eerst verwerkt (sort-key `(priority, gtin)`), ook als de scope expliciet verbreed wordt naar A/B/E.
- **AC3** — per GTIN wordt over alle voorgestelde regio's alleen de BESTE (hoogste similarity) kandidaat gehouden; haalt geen enkele regio de confidence-drempel (`NUTRISCORE_DECLARED_HARVEST_FLOOR`, default 0.60, zelfde gekalibreerde waarde als 12.12), dan wordt de GTIN volledig overgeslagen (`skipped_below_floor`) — nooit een crop geforceerd onder de gedeclareerde letter.
- **AC4** — nieuwe `database.py`-methode `review_item_exists(gtin, reason, source_file)` (additief) voorkomt dubbele review-items bij herdraaien (idempotentie — deze oogst is, anders dan 19.10/12.12, bedoeld om herhaald tegen dezelfde kleine GTIN-scope te draaien); read-only, draait dus ook mee in DRY_RUN (kandidatentelling blijft accuraat). **Code-review-fix (commit f64b8df):** oorspronkelijk gescoped op `(gtin, t3777_code, source_file)` — gecorrigeerd naar `(gtin, reason, source_file)` (`reason=MARKER`, dit harvest's eigen marker) omdat de gedeclareerde letter tussen runs kan wijzigen (herbouwde map); een check op `t3777_code` zou dan een tweede, tegenstrijdig review-item toestaan i.p.v. "deze oogst verwerkte deze pagina al" te herkennen, en scoping op `reason` (i.p.v. helemaal geen scope) voorkomt dat een ANDERE harvester's review-item op dezelfde pagina hier als duplicaat wordt gezien. Per-letter-cap (`NUTRISCORE_DECLARED_HARVEST_PER_CODE_CAP`, default 15, apart geteld via `skipped_cap`) en DRY_RUN (`NUTRISCORE_DECLARED_HARVEST_DRY_RUN`) volgen het 12.12/19.10-patroon.
- **AC5** — 17 nieuwe ml-pytest-tests (`test_queue_harvest_nutriscore_declared_12_15.py`) + 16 nieuwe api-vitest-tests (`build-nutriscore-declared-map.test.ts`), zie C-trace.
- **Niet uitgevoerd (permission-gated):** de ACC-run (map-bouw + declaratie-oogst, DRY_RUN én echte run) en deploy. AC2's live-bewijs (C/D over k=3 via conditie C) is dus `pending-permission`. Code + tests + reguliere/12.12/19.9/12.7-crosscheck-gedrag zijn git-hard ongewijzigd geverifieerd (alleen additief: 1 nieuwe DB-methode, 4 nieuwe bestanden).

### File List
- `apps/api/src/scripts/build-nutriscore-declared-map.ts` (nieuw)
- `apps/api/src/__tests__/scripts/build-nutriscore-declared-map.test.ts` (nieuw, 19 tests)
- `apps/ml-service/app/services/queue_harvest_nutriscore_declared.py` (nieuw)
- `apps/ml-service/tests/unit/test_queue_harvest_nutriscore_declared_12_15.py` (nieuw, 20 tests)
- `apps/ml-service/app/services/database.py` (gewijzigd — additief: `review_item_exists(gtin, reason, source_file)`)
- Rapporten: `12-15-ac-trace.md`, `12-15-nfr-assessment.md`, `review-12-15-adversarial.md`

## Change Log
- 2026-07-13: aangemaakt. Declaratie-gedreven Nutri-Score-oogst: gebruik de gedeclareerde `nutritionalScore`-letter (via bestaande 12.7 `resolveDeclaredMarks`) als grondwaarheid-label voor het (via 12.12-vormdetectie) gecropte Nutri-Score-vakje → `NUTRISCORE_<letter>`-refs → conditie C. Vervangt de noisy kleur-gok van 12.12; vult C(0)/D(1) met gegarandeerd-juiste labels. Dekking bevestigd (C22/D16 ondergrens). Incl. guard tegen de 12.7-regex-leak (categorie-codes).
- 2026-07-14: geïmplementeerd (optie B: TS-map-bouw + Python-oogst leest de map). Code+tests gebouwd (d84909f), 2 code-review-bevindingen (idempotentie gescoped op de mutabele letter i.p.v. `reason`; geen fail-safe per-GTIN-foutafhandeling in de map-bouw) gefixt + geregressietest (f64b8df). Drie-lagen adversarial review PASS (Blind Hunter/Edge Case Hunter/Acceptance Auditor op d84909f + herbevestiging op f64b8df, `review-12-15-adversarial.md`). AC-trace + NFR-assessment: PASS. Gates: volledige api-vitest 936 passed/0 failed, volledige ml-pytest (wegwerp-ghcr-container) 98 passed/0 failed/7 pre-existing ongewijzigde collection-errors, tsc 0 op de gewijzigde bestanden. AC2's live k=3-bewijs blijft `pending-permission` (ACC-run niet uitgevoerd, permission-gated). 12.12-bouwsteen (was nog niet gemerged in de 12.13-lijn) additief gemerged. Status → `review`.
