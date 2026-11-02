---
title: 'Proef getrainde detector ronde 5: Nutri-Score A–E, V-label als 9e keurmerk, NutriGreen in de training'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: '08d2cf75d6765deed18212204f4832c1963ccf53'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso besliste op 01-11-2026: Nutri-Score D en E worden eigen klassen (groep A–E, de letter moet kloppen), het V-label wordt eigen klasse en 9e gemeten keurmerk (vegetarisch als variant), het V-label is geen gelijkend van Vegan Society meer, en NutriGreen komt in de training. Het gereedschap kent 10 klassen en 8 keurmerken, telt D/E als "zonder", heeft geen V-label-keuze op de invulpagina en kan NutriGreen niet omzetten of mengen.

**Approach:** Eén klassenlijst van 13 met een variantentabel, 9 keurmerken in schema, telling, voorinvulling (V-label afgeleid uit `gelijkend`, geen nieuwe kosten), pagina en draaiplan; de scheiding kiest op de 10 oude rijen en telt de 3 nieuwe; een nieuw `nutrigreen.py` zet de Zenodo-zip om naar COCO en `echt.py dataset` mengt NutriGreen in fase 2 binnen het mengbudget met twee grenzen. Contract: "Interfacecontract ronde 5" in de ATDD-checklist.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist, sectie "Ronde 5" (interfacecontract), plus de companions in `context:`. De rest van de checklist blijft bindend.
- De rode tests van ronde 5 groen maken; tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Alleen standaardbibliotheek, Pillow en numpy (al aanwezig); geen nieuwe afhankelijkheid.
- Wat iemand typt raakt nooit kwijt (toetsset §6): geen `focus()`/`select()` elders, geen ouder van een invoerveld vervangen, concept in `sessionStorage` gaat voor.

**Never:**
- Niets buiten de specmap, de ATDD-checklist, deze specfile, `deferred-work.md` en de tracebestanden; niet committen of pushen.
- Tijdens de bouw geen klantartwork naar een dienst, geen netwerk naar productie, niets schrijven op ACC of productie, `~/logo-meetset-20261018/` niet aanraken; de uitvoering volgt na de keten.
- De gekozen trainingsleveranciers niet laten veranderen door de nieuwe rijen; NutriGreen nooit in `valid/` of `test/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| NS D op D | waarheid `["D"]`, melding `NUTRISCORE_D` | gevonden | — |
| NS verkeerde letter | waarheid `["D"]`, melding `NUTRISCORE_E` | gemist, verkeerde letter | — |
| NS zonder | waarheid `[]`, elke NS-melding | vals | — |
| V-label afgeleid | voorinvulling zonder V-label-sleutel, `gelijkend` met `…_VEGETARIAN` | V-label aanwezig in rapport en `items.json`; `voorinvulling.json` ongewijzigd | voorinvulling met `fout` blijft leeg |
| vegetarisch in schema | opslag met `EUROPEAN_V_LABEL_VEGETARIAN` | — | 400 / `ValueError` |
| extra rijen | rijen die de keuze zouden veranderen | zelfde trainingsleveranciers; extra rijen `buiten_keuze` | — |
| NutriGreen omzetten | zip met andere md5 | — | weigeren, niets geschreven |
| NutriGreen mengen | budget 1000, eigen tegels/vakjes | ≤ 20% tegels, ≤ eigen vakjes, ≤ 10% leeg, om de beurt per klasse; rest nagemaakt | andere categorieën → weigeren |
| oude checkpoint | `train-resultaat.json` zonder of met andere `klassen` | — | `detecteer` weigert vóór `torch` |

</frozen-after-approval>

## Code Map

- `train.py` -- `KLASSEN` (+3 achteraan), nieuw `VARIANTEN`; `train()` schrijft `klassen` en `data_herkomst` (vorige fase via `start` + `<dataset>/herkomst.json`).
- `uitslag.py` -- `KEURMERKEN7/8` → `KEURMERKEN_LOS`/`KEURMERKEN`; `per_keurmerk` NS-groep A–E en per letter; gedeeld door pagina-server, `tel_proef`, `echt`.
- `tel_proef.py` -- `NS` naar A–E; overal `us.KEURMERKEN_LOS`/`KEURMERKEN`; `_letters`/`_ns_goed`/vals blijven de logica, met 5 letters.
- `scheiding.py` -- `RIJEN` blijft, `RIJEN_EXTRA`; `bouw_rijen` met `VARIANTEN`; `kies` kiest op `RIJEN`, telt extra rijen; `schrijf` met `rijen_buiten_keuze`.
- `toets.py` -- `K7` → `LOS` (= `uitslag.KEURMERKEN_LOS`), `NS` 5 letters, `GELIJKEND`, `OMSCHRIJVING`/`PROMPT`/schema, nieuw `met_v_label`, `rapport`/`letters`, opdrachtregel (`rapport`, `--alleen` met lettercode, `items.json` via `met_v_label`). `kandidaten()` NS-lus gebruikt `NS`.
- `generator.py` -- `_logos`: codes via `train.VARIANTEN` (let op: `generator.VARIANTEN` bestaat al voor beeldvarianten; importeer onder andere naam); referentieplaatje alleen van de eigen code.
- `echt.py` -- `GELIJKEND`, `voorlabels` (variant omzetten), `validatie-uitslag` (letters A–E, `KEURMERKEN_LOS`), nieuw `kies_nutrigreen`, `dataset --nutrigreen` binnen `--meng-aantal`, `rapport.json._nutrigreen`, `herkomst.json`.
- `herken.py` -- `NS` 5 letters (NMS-groep); `detecteer` controleert `train-resultaat.json` naast het checkpoint vóór `import torch`.
- `k4aa_lokaal.py` -- `ACHT` → alle 13 klassen; `meldingen_uit`/`requires_review` via `VARIANTEN`.
- `beoordelaar.py` -- `vraag_voor` voor V-label (vegan en vegetarisch hetzelfde).
- `nutrigreen.py` (nieuw) -- `MD5`, `KLASSE`, `ATTRIBUTIE`, `LICENTIE`, `lees_csv`, `omzetten`, opdrachtregel `omzetten`; leest per lid uit de zip (`zipfile`), nooit volledig uitpakken; schrijft via `beelden.veilig_doel`.
- `invul/index.html` -- `K7`/`NAAM`/`K8` met V-label; concept zonder V-label samengevoegd met de voorinvulling; zelfde invoerregels.
- `DRAAIPLAN.md` -- stap 1/4/5/6/10 volgens het contract; vijftien stappen blijven.
- Niet wijzigen: `openrouter.py`, `kosten.py`, `bevries.py`, `beelden.py`, `licenties.py`, `invul/server.py` (leest alles via `uitslag`).

## Tasks & Acceptance

**Execution:**
- [x] `train.py`, `uitslag.py` -- klassen- en keurmerklijsten, varianten, schema, telling, `train-resultaat.json` -- gedeelde basis voor alle andere taken.
- [x] `tel_proef.py`, `scheiding.py` -- NS A–E en V-label in de telling; extra rijen buiten de keuze -- meetregels §3, toetsset §2.
- [x] `toets.py` -- gelijkende, prompt, `met_v_label`, rapport, aanvulling per letter, `items.json` -- toetsset §4–§5.
- [x] `generator.py`, `echt.py`, `herken.py`, `k4aa_lokaal.py`, `beoordelaar.py` -- 13 klassen en variant; `kies_nutrigreen` en `dataset --nutrigreen` -- trainingsset §1–§10.
- [x] `nutrigreen.py` -- nieuw omzetgereedschap -- trainingsset §10, CAP-16.
- [x] `invul/index.html` -- V-label-keuze en stand 9 -- toetsset §6.
- [x] `DRAAIPLAN.md` -- stappen volgens het contract -- CAP-10.

**Acceptance Criteria:**
- Given de suite, when `uv run --group dev pytest -q -p no:cacheprovider` draait in de specmap, then 0 failed (rood vóór de bouw: 105 failed, 543 passed).
- Given `licenties.py` in de detectoromgeving, when hij draait, then nul overtredingen (geen nieuwe afhankelijkheid).

## Implementation Notes

- Basis voor doorgaan bij een vuile werkboom (step-01): de wijzigingen zijn de spec-update en de ATDD-tests van deze keten, op de passende tak; staande toestemming van de eigenaar om tot review te bouwen (headless: goedkeuren en doorgaan).
- Multi-goal (step-01): één doel; NutriGreen hangt via de 13 klassen aan de klassenuitbreiding, apart opleveren zou dezelfde lijst twee keer raken.
- Route-poort (step-02): intent gaps 0 (vier besluiten en A10 vastgelegd in spec en contract); irreversibles 0 (geen data, geen migratie, geen externe aanroep; uitvoering na de keten); footprint ±12 bestanden plus nieuw `nutrigreen.py` en nieuwe functies (`met_v_label`, `kies_nutrigreen`) die andere code aanroept → `dispatch`.
- Omvang (step-02): ±2.000 tokens, boven 1.600; headless gehouden (staande toestemming), omdat het contract zelf in de ATDD-checklist staat en de spec alleen verwijst.
- Checkpoint 1 (step-02): goedgekeurd en door, op de staande toestemming van de eigenaar om tot review te bouwen; status via `ready-for-dev` naar `in-progress` (step-03), baseline `08d2cf75d6765deed18212204f4832c1963ccf53`.
- Bouw (step-03): geen test gewijzigd. Suite 648 passed, 0 failed (2× na elkaar); `licenties.py` in de detectoromgeving: exitcode 0, 93 pakketten, `overtredingen: []`, even ruim: aiohappyeyeballs, defusedxml, greenlet, matplotlib, numpy, shellingham, torch, typing_extensions.
- Keuzes waar het contract open was (bouw): `scheiding.kies` telt `uitgesloten_gtins` alleen over de 10 keuzerijen (zelfde uitkomst als zonder extra rijen); `k4aa_lokaal.ACHT` blijft bestaan als `set(KLASSEN)` (13; bestaande test `test_klassenlijst_staat_op_een_plek`), variant omgezet vóór de controle; `nutrigreen.omzetten` noemt de beelden `nutrigreen-<id>.jpg` (`ng_naam` = stam), telt `dubbele_naam` per beeld en schrijft COCO met ASCII-escapes; `echt.py dataset` weigert een mengbron waarvan een bestandsnaam al in `train/` staat, en verwijdert een oude `herkomst.json` als er niet met NutriGreen gemengd wordt; `kies_nutrigreen` rekent het lege deel als floor(max_leeg/(1 − max_leeg) × positief) (= positief // 9 bij 0,1) en rondt `aandeel × …` eerst af op 9 decimalen (float); `toets.py kandidaten` weigert Nutri-Score (groep of letter) tegelijk bij `--alleen` en `--alle` (de groep heeft één maximum); het voorlabelschema bevat geen `EUROPEAN_V_LABEL_VEGETARIAN` (de prompt vraagt `EUROPEAN_V_LABEL_VEGAN` voor beide), `voorlabels` zet de variant toch om.
- Reviewronde 1 (02-11, orchestrator), doorgevoerd: `kies_nutrigreen(…, nagemaakt=None)` met n_max ook ≤ floor(aandeel × (eigen + nagemaakt) / (1 − aandeel)), `dataset` geeft het aantal beschikbare nagemaakte tegels door (0 zonder `--meng`); `rapport.json` krijgt `_nagemaakt`, `herkomst.json` alleen bij > 0 NutriGreen-tegels; `voorinvulling()` zet `"ronde": 5` in elke uitkomst en `met_v_label` leidt alleen af bij een geslaagde voorinvulling zonder dat kenmerk en met niet-lege `keurmerken`; `toets.py kandidaten` weigert bij elke run een bestaande `<naam>.json`/`<naam>-paren.tsv`; `train.controleer_klassen` (categorieën van `<dataset>/train` = de 13, startcheckpoint met dezelfde `klassen`) vóór `_train` en in de opdrachtregel (exitcode 2); `CATEGORIEEN` één keer in `train.py`; NutriGreen-JPEG kwaliteit 90; DRAAIPLAN: `scheiding.py kies` vooraan het ronde-5-blok, dHash-controle NutriGreen tegen de toets en schijfruimte in stap 10.
- Tests gewijzigd na de review (testfout of nieuwe verplichte invoer): `test_r5_items_dragen_het_afgeleide_v_label…` en `test_review_20261101::test_voorinvulling_stopt_na_5_weigeringen…` legden het te brede afleiden vast (lege en nieuwe voorinvullingen krijgen geen V-label); `test_cap03_invulpagina_browser::test_p0_concept_per_toetsaanslag` terug naar `bevestigd`, nu met V-label (de omzetting naar `onleesbaar` was alleen nodig voor de rode server); `test_r4_cli_gewone_run…` verwijdert eerst de bestaande `kandidaten.json` (een gewone run overschrijft niet meer); fixtures met de 13 categorieën of `klassen` (nieuwe verplichte invoer van `train`): `test_cap06_training.mini_coco` (rooktest: codes ⊆ de 13 klassen in plaats van alleen GREEN_DOT, want de set heeft nu 13 categorieën), `test_besluiten…opdrachtregel_train_vraagt_besluit…`, `test_r5_train_resultaat…`. Nieuw: lege/nieuwe voorinvulling, ronde-kenmerk, gewone run overschrijft niet, `--alle NUTRISCORE_E`, Nutri-Score bij `--alleen` én `--alle`, NutriGreen ≤ 20% zonder of met te weinig nagemaakt (unit en `dataset`), herkomst opgeruimd zonder NutriGreen, `train` weigert andere categorieën of startklassen.

## Spec Change Log

(Geen loopback: geen intent_gap of bad_spec in de review.)

## Review Triage Log

Lagen: Blind Hunter (BH, 13), Edge Case Hunter (EC, 15), Verification Gap (VG, 3 + 1 overig). Geen laag overgeslagen. Uitkomst: 32 bevindingen; 21 patch (16 regels), 1 defer, 10 verworpen (plus deelverwerping in BH6 en BH12); geen intent_gap of bad_spec (geen loopback).

| id | verdict | bewijs | route |
|---|---|---|---|
| BH5 + EC1 + VG-overig | medium | `kies_nutrigreen` rekent `n_max` met een gevuld budget; zonder `--meng` of met te weinig nagemaakte tegels wordt NutriGreen > 20% (500 eigen, budget 1000, geen `--meng` → 300 van 800) | patch G1 |
| BH1 + EC4 | medium | `met_v_label` onderscheidt een voorinvulling van vóór ronde 5 niet van een nieuwe waarin het model het V-label oversloeg; nieuwe `gelijkend` kent geen V-label meer → altijd "afwezig" zonder AI-oordeel, tegen toetsset §5 ("eerdere voorinvullingen") | patch G2 |
| BH2 + EC5 | low | lege geslaagde voorinvulling wordt "gevuld" → pagina toont geen "vul zelf in"; 0 van 322 bestaande, nieuwe kunnen het; directe correctie | patch G2 |
| BH3 | medium | gewone `toets.py kandidaten` overschrijft `kandidaten.json`; sinds ronde 5 geeft de regel een andere lijst (A–E, V-label), terwijl toetsset §4 zegt "die lijst blijft"; `toets/kandidaten.json` bestaat | patch G3 |
| BH4 | low | `$PM/scheiding.json` (01-11 10:49) mist `rijen_buiten_keuze`; DRAAIPLAN zegt niet dat `scheiding.py kies` opnieuw moet vóór bevriezen | patch G4 |
| BH6 | low | `rapport.json` noemt het aantal nagemaakte meng-tegels niet; een minimum voor nagemaakt is geen defect (trainingsset §10: eerst NutriGreen, rest nagemaakt) — dat deel verworpen | patch G5 |
| BH7 + EC7 | medium | `train()` weigert geen COCO-set met andere categorieën en geen `--start` met andere `klassen`; rfdetr bouwt de kop stil opnieuw op (`rfdetr/models/weights.py:448-462`), terwijl CAP-6 weigeren vraagt | patch G6 |
| BH8 | defer / false | correctiepercentage per keurmerk (meetregels §6, sinds ronde 1) is nergens gebouwd: vooraf bestaand; de V-label-markering is wél te reconstrueren (een record zonder V-label-sleutel in `voorinvulling.json` is afgeleid) | defer |
| BH9 | low | NutriGreen gaat niet door de dHash-controle tegen de toetsbeelden (toetsset §2); `scheiding.py dhash` kan het al, alleen het draaiplan noemt het niet | patch G4 |
| BH10 | low | `nutrigreen.omzetten` slaat op met JPEG 95 (groter dan nodig), schijf 99% vol (13 GiB vrij); geen raming in het draaiplan | patch G7 |
| BH11 | low | `test_p0_concept_per_toetsaanslag` post nu `onleesbaar` i.p.v. `bevestigd`; na de bouw kan `bevestigd` met V-label terug | patch G8 |
| BH12 | low | `CATEGORIEEN` twee keer opgebouwd (`echt`, `nutrigreen`); één plek in `train.py` is minder code; het hernoemen van `ACHT` verworpen (alleen een naam, bestaande test hangt eraan) | patch G9 |
| BH13 | low | kostenregels ronde 5 rekenen op twee manieren (±$2 V-label vs ±$1,5 E), SPEC-totaal niet bijgewerkt; fix is spectekst, niet deze build → via `bmad-spec` (memlog) na de bouw | patch (spec) |
| EC2 | low | negatieve `--meng-aantal`: niemand geeft dat op (draaiplan 1000); fix is een extra guard | verworpen |
| EC3 | low | `--nutrigreen` naar een COCO-set zonder `ng_naam`: alleen bij een verkeerde map; guard | verworpen |
| EC6 | false | geen `voorlabels*.json` en geen `$PM/train/` (gemeten 02-11): er bestaan geen voorlabels met 10 klassen | verworpen |
| EC8 | low | ander `.pth` in dezelfde map: onwaarschijnlijk, guard (sha-controle) | verworpen |
| EC9 | false | `data.csv` (md5 vast) heeft 0 vakjes met breedte of hoogte 0 (gemeten) | verworpen |
| EC10 | false | `data.csv` heeft geen BOM en vaste kolommen (gemeten); md5 vast | verworpen |
| EC11 | low | kapot beeld in de zip: niet aangetoond (steekproef 400 opende); guard; de uitvoering laat het zien | verworpen |
| EC12 | false | 0 barcodenamen met achtervoegsel in de zip (4.089 zuivere barcodenamen, gemeten) | verworpen |
| EC13 | false | er is nog geen `uitslag.json` (gemeten), dus geen bevestigd record zonder V-label | verworpen |
| EC14 | low | `--nutrigreen` met 0 gekozen tegels schrijft toch de attributie; directe correctie | patch G5 |
| EC15 | low | `handmatig.json` met de vegetarische variant: het bestand is alleen voor het zwangerschapspictogram (draaiplan stap 11) | verworpen |
| VG1 | gap | `--alle NUTRISCORE_<letter>` nooit gedraaid; de koppeling aan het groepsmaximum is onbeschermd | patch G10 |
| VG2 | gap | weigering bij Nutri-Score in `--alleen` én `--alle` zonder test | patch G10 |
| VG3 | gap | verwijderen van een oude `herkomst.json` zonder NutriGreen nooit getoetst | patch G10 |

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed (664 na de reviewpatches)
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev --group detector python licenties.py` -- expected: exitcode 0, `"overtredingen": []`
- `git status --porcelain` -- expected: alleen paden onder de specmap, de ATDD-checklist, deze specfile, `deferred-work.md` en de tracebestanden

**Uitkomst (02-11-2026):** na de reviewpatches 664 passed, 0 failed; `licenties.py` exitcode 0, 93 pakketten, 0 overtredingen; `git status` alleen toegestane paden. Step-05 "commit": niet uitgevoerd — de keten van de eigenaar verbiedt committen en pushen in deze ronde.
