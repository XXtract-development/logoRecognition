# Story 12.15: Declaratie-gedreven Nutri-Score-oogst (gedeclareerde letter = grondwaarheid-label)

Status: in-progress

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
- [ ] 1. **GTIN→gedeclareerde-letter-map (AC1, AC3, hergebruik 12.7)** — via `resolveDeclaredMarks` de gedeclareerde Nutri-Score-letter per GTIN resolven, **gefilterd op exact A/B/C/D/E** (verwerp categorie-codes/GENERAL_FOODS — de 12.7-leak-guard). Scope op C/D (optioneel A/B/E). Kies de architectuur en motiveer: (a) API-side orkestratie-script (heeft `resolveDeclaredMarks` + registratie + `mlClient`) dat per GTIN de crop bij ml-service opvraagt, óf (b) de GTIN→letter-map vooraf (API) berekenen en aan de bestaande Python-oogst (12.12) meegeven als label-bron. Leun naar de aanpak met de minste duplicatie en de bestaande registratie-flow.
- [ ] 2. **Detectie/crop hergebruiken, label vervangen (AC1, AC3)** — hergebruik de 12.12-vorm-detectie (`find_similar_references_by_codes` tegen de NUTRISCORE_A–E-pool + gate + crop). Vervang de kleur-gok (`_provisional_code`) door de gedeclareerde letter. Pas een confidence-drempel toe (vorm-match) zodat alleen een betrouwbaar gedetecteerd vakje het gedeclareerde label krijgt (AC3). Geen fabricatie bij niet-gevonden.
- [ ] 3. **Aflevering naar review (voorgelabeld) (AC1, AC2)** — de gevalideerde crops als OPEN `artwork_review_items` met `t3777_code = NUTRISCORE_<gedeclareerde-letter>` + een reason-marker (bv. `12.15 nutriscore-declaratie-oogst`), zodat Friso met één klik bevestigt (validatie crop-locatie). Cap per letter (flood-guard, patroon 19.10/12.12). Bevestiging → `review-confirmed`-ref + embedding (bestaande accept→ref-flow) → conditie C bij ≥3.
- [ ] 4. **DRY_RUN + idempotentie + begrenzing (AC4)** — DRY_RUN muteert niets en rapporteert per letter; echte run idempotent + begrensd.
- [ ] 5. **Tests (AC5)** — zie AC5.
- [ ] 6. **Verificatie (AC1-5)** — gates (ml-pytest en/of api-vitest naargelang de architectuur; `tsc --noEmit` 0 als API geraakt) zelf groen draaien. GEEN ACC-run/deploy (permission-gated). Documenteer in Dev-notes de DRY_RUN-verwachting.

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
### Debug Log References
### Completion Notes List
### File List

## Change Log
- 2026-07-13: aangemaakt. Declaratie-gedreven Nutri-Score-oogst: gebruik de gedeclareerde `nutritionalScore`-letter (via bestaande 12.7 `resolveDeclaredMarks`) als grondwaarheid-label voor het (via 12.12-vormdetectie) gecropte Nutri-Score-vakje → `NUTRISCORE_<letter>`-refs → conditie C. Vervangt de noisy kleur-gok van 12.12; vult C(0)/D(1) met gegarandeerd-juiste labels. Dekking bevestigd (C22/D16 ondergrens). Incl. guard tegen de 12.7-regex-leak (categorie-codes).
