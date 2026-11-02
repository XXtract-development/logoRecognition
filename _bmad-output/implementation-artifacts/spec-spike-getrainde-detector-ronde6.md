---
title: 'Proef getrainde detector ronde 6: Open Food Facts-uitsneden als logobron van de generator'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '953ca9545fb0e4b0e9d2b2578ab41b4d1335f00c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso besliste op 02-11-2026 dat uitgesneden, door mensen benoemde logo's uit de logodatabase van Open Food Facts (OFF) een extra logobron van de generator worden (echte varianten: gedrukt, vervormd, andere kleuren), zonder lek naar de toets en zonder dat eigen materiaal of NutriGreen wegvallen. Er is geen gereedschap om ze beleefd en hervatbaar op te halen, en generator, mengen en herkomst kennen OFF niet.

**Approach:** Nieuw `off.py` haalt per klasse hoogstens 1.000 uitsneden (crop-endpoint, nooit hele foto's) in een vaste volgorde, met lekregel, filters per reden, schijfgrens, index en rapport; de generator plakt met kans 0,5 een OFF-uitsnede in plaats van de eigen bron, alleen in `train`; `echt.py dataset` begrenst OFF-vakjes in fase 2, schrijft de herkomst als lijst en laat NutriGreen-foto's met een toets-GTIN vallen; `train.py` ontdubbelt de herkomst op bron. Contract: "Interfacecontract ronde 6" in de ATDD-checklist.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist, sectie "Ronde 6", plus `trainingsset-en-herkenning.md` §11 en `randvoorwaarden.md` §4. De rest van de checklist blijft bindend.
- De 97 rode tests van ronde 6 en de aangepaste test van ronde 5 groen maken; tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Alleen standaardbibliotheek, Pillow en numpy; geen nieuwe afhankelijkheid. Schrijven alleen via `beelden.veilig_doel`.
- Zonder `--off` blijft de generatoruitvoer byte-gelijk aan vóór ronde 6.

**Never:**
- Tijdens de bouw geen netwerkverkeer naar OFF; het echte ophalen volgt na de keten.
- OFF nooit in `valid/` of `test/`; geen hele OFF-foto's op schijf; geen AI-aanroepen.
- Niets schrijven onder `~/logo-meetset-20261018/` tijdens de bouw; de invulpagina (poort 8767) en haar opslag niet aanraken.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| lekregel | barcode met GTIN-14 in de toetsset of van een toetsleverancier | afgevallen, geteld per reden | — |
| hervatten | bewaarde pools, uitsneden, `status.json` | alleen tijdelijke fouten opnieuw; geen nieuwe zoekopdracht | — |
| nieuwe toets-GTIN | bestaande uitsnede krijgt een recordreden | bestand weg, volgende in de volgorde gehaald | — |
| 20 mislukt op rij | tijdelijke fouten | — | `Noodstop`, exitcode 3 |
| schijf | > 3 GB onder `off/` of < 5 GB vrij | — | `Schijfvol`, exitcode 3 |
| generator buiten train | `--off` met `--split valid/test` | niets geschreven | `ValueError`, exitcode 2 |
| fase 2 OFF-grens | nagemaakte tegels met OFF-vakjes | stoppen vóór de tegel die de eigen vakjes passeert | — |

</frozen-after-approval>

## Code Map

- `off.py` (nieuw) -- alles uit het contract: constanten, `ZOEK`, `gtin14`, `zoek_url`, `uitsnede_url`, `record_reden`, `volgorde`, `Haler` (+ `Tijdelijk`, `Blijvend`, `Noodstop`, `Schijfvol`), `ophalen`, opdrachtregel `ophalen`. Hergebruik: `beelden.veilig_doel`/`BinnenRepo`, `scheiding.dhash`/`hamming`/`_hashes`, `nutrigreen._toetsleveranciers(pm)` (geeft `(glns, gtins)`), `train.KLASSEN`. `ATTRIBUTIE` letterlijk uit randvoorwaarden §4 (tweede attributieregel).
- `generator.py` -- `genereer(..., off=None)`: validatie vóór `veilig_doel`/`mkdir`; trekking na `(klasse, bron)` en `variant`; alleen als `off.get(k)` niet leeg: `rng.random() < AANDEEL_OFF` → `rng.choice(off[k])` (pad pas bij gebruik geopend), `.convert("RGBA")`, `_vorm`. Manifest `off`; `herkomst.json` alleen bij > 0 OFF. `main`: `--off <index>`, `--split` ≠ train met `--off` → exitcode 2 vóór schrijven. Bestaande fout sinds e157e5f: in `main` heeft een commentaar het argument `gelijkend` (`_lees(gelijkend.json)`) ingeslikt, `genereer` krijgt de argumenten verschoven; herstellen.
- `echt.py` -- `main` dataset: toets-GTIN's uit `<PM>/toets/toets-docs.json` (tweede deel van het doc-id, `zfill(14)`); NutriGreen-filter vóór `kies_nutrigreen` (ids blijven); OFF-tellingen per tegel uit `<meng>/../manifest-train.json` (op `bestand`); nagemaakte tegels in volgorde tot het budget en tot de OFF-grens (eigen vakjes vóór mengen); `_off`; `herkomst.json` als lijst (NutriGreen-object + inhoud van `<meng>/../herkomst.json` als er nagemaakte tegels gemengd zijn).
- `train.py` -- `_data_herkomst`: lijst uitbreiden (los object = lijst van één), ontdubbelen op `bron` (eerste voorkomen, laatste inhoud).
- `DRAAIPLAN.md` -- stap 10: `off.py ophalen` vóór de tegels, `--off` alleen bij `--n 5000` (eigen regels per split), stoppunt 9; "Snelheid": 33 tegels per etiket, fase 2 met 20 epochs boven 8 uur, hoogstens 7 epochs, stoppunt 1 (trainingsset §5).
- Niet wijzigen: `nutrigreen.py`, `scheiding.py`, `beelden.py`, `invul/`, de tests (behalve bij een testfout).

## Tasks & Acceptance

**Execution:**
- [x] `off.py` -- nieuw ophaalgereedschap volgens het contract -- CAP-17, trainingsset §11.
- [x] `generator.py` -- `off`-bron, manifest, herkomst, `--off`; `gelijkend`-argument in `main` herstellen -- CAP-4/17.
- [x] `echt.py` -- OFF-grens, `_off`, herkomstlijst, NutriGreen toets-GTIN -- CAP-16/17.
- [x] `train.py` -- herkomst ontdubbeld -- CAP-16/17.
- [x] `DRAAIPLAN.md` -- stap 10 en "Snelheid" -- CAP-10.

**Acceptance Criteria:**
- Given de suite, when `uv run --group dev pytest -q -p no:cacheprovider` draait in de specmap, then 0 failed (rood vóór de bouw: 98 failed, 663 passed).
- Given `licenties.py` in de detectoromgeving, when hij draait, then nul overtredingen (geen nieuwe afhankelijkheid).

## Implementation Notes

- Basis voor doorgaan bij een vuile werkboom (step-01): de wijzigingen zijn de spec-update, het onderzoeksbestand en de ATDD-tests van deze keten, op de passende tak; staande toestemming om tot review te bouwen (headless).
- Multi-goal (step-01): één doel (OFF als logobron); ophalen, generator, mengen en herkomst zijn één keten, apart opleveren levert niets bruikbaars.
- Route-poort (step-02): intent gaps 0 (besluit Friso 02-11 en de reviewbesluiten A5/A7 staan in spec en contract; de open vraag fase 2 > 8 uur is een keuze vóór de training, niet voor deze bouw, en komt alleen in het draaiplan); irreversibles 0 (geen migratie, geen data verwijderd, tijdens de bouw geen externe aanroep; het ophalen volgt na de keten); footprint 4 bestanden plus het draaiplan, nieuw `off.py` dat generator, opdrachtregel en draaiplan aanroepen → `dispatch`.
- Omvang (step-02): ±1.800 tokens, boven 1.600; headless gehouden (staande toestemming), omdat het contract zelf in de ATDD-checklist staat en de spec alleen verwijst. Open Questions: geen.
- Checkpoint 1 (step-02): goedgekeurd en door, op de staande toestemming van de eigenaar om tot review te bouwen; baseline `953ca9545fb0e4b0e9d2b2578ab41b4d1335f00c`.
- Bouw (step-03): geen test gewijzigd. Keuzes binnen het contract: (1) de noodstop telt alleen `Tijdelijk` op rij; elk ander antwoord van de aanbieder (gelukt of `Blijvend`) zet de teller terug (I/O-matrix: "tijdelijke fouten"). (2) Een bestaande uitsnede gaat bij hervatten opnieuw door `dubbel` en `bijna_gelijk` (de toetsbeelden kunnen gegroeid zijn); valt hij af, dan wordt hij verwijderd en komt de reden in `status.json`. (3) De bytes onder `uit` worden één keer geteld en daarna lopend bijgehouden (geen schijfwandeling per uitsnede). (4) `status.json` wordt in een `finally` weggeschreven (blijvende uitkomsten blijven ook na een noodstop), alleen als er iets in staat of hij al bestond. (5) `bronnen.json.pad` is absoluut. (6) `echt.py` leest het manifest als `manifest-<naam van de mengmap>.json` naast de mengmap (= `manifest-train.json` voor `…/train`) en hergebruikt `nutrigreen._toets` en `off.toets_gtins` voor het NutriGreen-filter. (7) Een `Retry-After` als datum valt terug op de vaste wachttijd.
- Verificatie (step-03): `uv run --group dev pytest -q -p no:cacheprovider` → 761 passed, 0 failed; `licenties.py` → exitcode 0, 93 pakketten, `overtredingen: []`.
- Bestaande fout hersteld (step-03): in `generator.py main` had een commentaar (sinds e157e5f) het argument `gelijkend` ingeslikt, zodat `genereer` verschoven argumenten kreeg; `generator.py tegels` was daardoor nooit bruikbaar (geen eerdere test op de opdrachtregel). Nu getest met een niet-lege `gelijkend.json` (VG3).
- Matrix-audit (step-03): elke rij gedekt door een groene test (`record_reden`, `ophalen_grens…`, `hervat_*`, `noodstop`, `bytegrens`, `minder_dan_5_gb`, `alleen_in_train`, `cli_tegels…buiten_train`, `dataset_meng_off_vakjes…`).
- Reviewpatches (step-04, G1–G11, door dezelfde bouwsubagent): `ophalen` houdt index en rapport van klassen buiten de run en verwijdert `bronnen.json` aan het begin (een afgebroken run laat geen index achter); zoekantwoord moet een JSON-object met `logos` zijn en een uitsnede moet als beeld te openen zijn, anders `Tijdelijk` (niets weggeschreven, telt mee voor de noodstop); `Retry-After` begrensd op [0, 300] en eindig; `ConnectionError` en `http.client.HTTPException` tellen als tijdelijk; OFF-objecten in het manifest dragen `uitsnede` (pad) als de invoer een pad is; `echt.py dataset` bepaalt eerst de reeks nagemaakte tegels binnen de OFF-grens en geeft dat aantal als `nagemaakt` aan `kies_nutrigreen` (NutriGreen ≤ 20% ook als de OFF-grens bijt); docstring herkomst; DRAAIPLAN (duur, 14 pools, ongetest-regel); ATDD-checklist tijd rode run 09:46. Nieuwe tests (6): bijna gelijk bij hervatten, gelijkende via de opdrachtregel, NutriGreen ≤ 20% bij een bijtende OFF-grens (gecontroleerd: faalt met de oude regel `nagemaakt=len(extra["images"])`), kapot zoekantwoord of geen beeld, deel van de klassen houdt index en rapport van de andere (en geen index na een noodstop), `Retry-After` negatief/`nan` en afgebroken `read()`. Geen bestaande test gewijzigd.
- Gevolg van G3 (aanvaard): stopt een run met `--klasse` vroegtijdig, dan kent de volgende `--klasse`-run de indexregels van de andere klassen niet meer (`rapport.json` wel); een volle run zonder `--klasse` bouwt alles opnieuw op. Het draaiplan draait altijd de volle run.
- Spectekst trainingsset §5 zegt nog "OFF verandert de duur niet"; de OFF-grens kan het aantal nagemaakte meng-tegels alleen verlagen (dus niet langer). Spectekst niet in deze build (alleen via `bmad-spec`); het draaiplan zegt het precies.
- Verificatie na de reviewpatches (02-11-2026): `uv run --group dev pytest -q -p no:cacheprovider` → 767 passed, 0 failed; `licenties.py` (detectoromgeving) → exitcode 0, 93 pakketten, `overtredingen: []`; `git status` alleen toegestane paden.

## Spec Change Log

(Geen loopback: geen intent_gap of bad_spec in de review.)

## Review Triage Log

Lagen: Blind Hunter (BH, 14), Edge Case Hunter (EC, 11), Verification Gap (VG, 3 + 1 overig). Geen laag overgeslagen. Uitkomst: 29 bevindingen; patch 16 (groepen G1–G12), defer 1, verworpen 12; geen intent_gap of bad_spec (geen loopback).

| id | verdict | bewijs | route |
|---|---|---|---|
| BH1 + EC6 | medium | `ophalen` bouwt `bronnen.json`/`rapport.json` alleen uit de klassen van deze run; `--klasse WEIDEMELK` na een volle run wist de index van de andere 10 klassen, `tegels --off` traint dan stil zonder hun OFF | patch G1 |
| BH2 + EC3 + EC4 | medium | pool wordt vóór `json.loads` weggeschreven: een 200 met HTML vergiftigt elke hervatting (`JSONDecodeError`, geen exit 3); een crop-antwoord dat geen beeld is wordt met `toets_hashes` een onafgevangen `UnidentifiedImageError`, zonder wordt het als `.jpg` geïndexeerd | patch G2 |
| BH3 + EC5 | medium | bij `Noodstop`/`Schijfvol`/mislukte pool blijft de oude `bronnen.json` staan terwijl deze run al uitsneden verwijderde (toets-GTIN, bijna gelijk); de generator leest dan een index met verdwenen bestanden | patch G3 |
| BH4 | low | OFF-objecten in het manifest dragen geen herkomst van de uitsnede; na het opnieuw draaien van de lekfilter is niet na te gaan welke uitsnede geplakt is; met een pad als invoer is het één veld | patch G4 |
| VG1 | high | `kies_nutrigreen(nagemaakt=len(extra))` rekent met nagemaakte tegels die de OFF-grens daarna weigert: gedemonstreerd 5 van 12 tegels NutriGreen (41,7%) bij `[50]+[0]*29`, regel trainingsset §10: ≤ 20% | patch G5 |
| VG2 | gap | `bijna_gelijk` op een al bewaarde uitsnede (hervatten na een gegroeide toetsset) heeft geen test; uitschakelen liet alle 97 tests groen | patch G6 |
| VG3 | gap | het herstelde `gelijkend`-argument in `generator.py main` draait alleen met een lege lijst; `[]` doorgeven liet 86 tests groen | patch G7 |
| EC1 | low | `Retry-After` negatief of `nan` → `time.sleep` geeft `ValueError`, run crasht met traceback; directe correctie (begrenzen op [0, 300] en eindig) | patch G8 |
| EC2 | medium | `ConnectionResetError`/`http.client.IncompleteRead` tijdens `read()` zijn geen `URLError`: geen nieuwe poging, run crasht; bij ±11.600 verzoeken aannemelijk | patch G8 |
| BH7 + EC10 | low | docstring `echt.py` zegt "alleen wat echt gemengd is", de code neemt de mengherkomst mee zodra er nagemaakte tegels gemengd zijn (zo staat het in het contract: te veel attributie is veilig); tekst rechtzetten | patch G9 |
| BH6 | low | DRAAIPLAN "OFF verandert de duur niet: het aantal tegels blijft gelijk": de OFF-grens kan het aantal gemengde nagemaakte tegels verkleinen (alleen korter, `_nagemaakt`); directe tekstcorrectie | patch G10 |
| BH9 (deel) | low | regel "ongetest" van stap 10 noemt `off.py ophalen` tegen Robotoff en `tegels --off` met echte uitsneden niet | patch G10 |
| BH11 (deel) | low | DRAAIPLAN noemt 13 pools, `ZOEK` heeft 14 zoekopdrachten | patch G10 |
| BH12 (deel) | low | rode run in de ATDD-checklist met tijd "09:4x" (gemeten: 09:46:57) | patch G11 |
| BH5 | low | ontbrekend manifest zet de OFF-grens uit; de generator schrijft het manifest altijd, alleen handmatig verwijderen bereikt dit; contract zegt "ontbreekt het manifest, dan 0" (test) | verworpen |
| BH8 | false | gemeten: `train/` van de generator op baseline 953ca95 en op de nieuwe code (12 tegels, seed 5, zonder `off`) beide sha256 `d5f84b86…a6009`; het manifestveld `off: {}` is contract | verworpen |
| BH9 (deel) | low | welke 40 uitsneden op het contactblad: spec §11 zegt "40 behouden uitsneden"; uitvoering kiest de eerste 40 in de sha256-volgorde (zelfde als de steekproef); fix is spectekst | verworpen |
| BH10 | low | onderzoeksbestand verwijst naar `digests/datasets-2026-11-01/` dat alleen ongecommit in de hoofdmap staat (172 KB); de hoofdmap is van ander werk | defer |
| BH11 (deel) | false | validatietijd 2,2 in de memlog is een eerdere logregel; §5 en DRAAIPLAN zeggen beide 2,3; curl-recept zit in het onderzoeksbestand (invoer), de meting met `annotated=true` staat in de memlog | verworpen |
| BH12 (rest) | false | buildverslag, groene run en trace volgen in deze keten (step-05, trace) | verworpen |
| BH13 | false | gemeten in ronde 5 (EC12): 0 barcodenamen met achtervoegsel in de zip (4.089 zuivere barcodenamen) | verworpen |
| BH14 | low | acceptatieregel Weidemelk staat in spec §11 en memlog; Friso kan `vel.png` nakijken (spec); fix is spectekst | verworpen |
| EC7 | low | `dubbel` blijft in `status.json` als het origineel later afvalt (één uitsnede minder); `status.json` met `dubbel` is contract | verworpen |
| EC8 | low | pools (14 × ±1 MB) worden zonder schijfcontrole geschreven; verwaarloosbaar tegen 3 GB en 5 GB vrij; extra guard | verworpen |
| EC9 | false | contract en test: de generator verwijdert `herkomst.json` nooit (te veel attributie is veilig) | verworpen |
| EC11 | low | `--off` met een verdwenen pad faalt halverwege; met G3 bestaat er na een afgebroken run geen index; extra guard | verworpen |
| VG-overig | high | zelfde als VG1 (gedemonstreerd defect) | patch G5 |

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev --group detector python licenties.py` -- expected: exitcode 0, `"overtredingen": []`
- `git status --porcelain` -- expected: alleen paden onder de specmap, het onderzoeksbestand, de ATDD-checklist, deze specfile, `deferred-work.md` en de tracebestanden
