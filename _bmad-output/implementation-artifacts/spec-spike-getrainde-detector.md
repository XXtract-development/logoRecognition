---
title: 'Proef getrainde detector: gereedschap, tests en draaiplan'
type: 'feature'
created: '2026-11-01'
status: 'in-review'
baseline_commit: '6463277c5c63209026b370095f9d99efcd9486cc'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Er is geen gereedschap om te meten of een getrainde detector (RF-DETR) de 8 keurmerken betrouwbaarder herkent dan de huidige route K4-aa, op een door Friso bevestigde toetsset met de vaste stopregel. De 366 acceptatietests (ATDD, rood) beschrijven dat gereedschap.

**Approach:** Bouw de 17 modules, de invulpagina en `DRAAIPLAN.md` plat in de specmap volgens het bindende interfacecontract van de ATDD-checklist, tot de hele suite groen is; draai daarnaast rooktests op kleine lokale data (training op MPS, snelheidsmeting). Het echte experiment draait niet in deze build.

## Boundaries & Constraints

**Always:**
- De SPEC en companions (in `context:`) zijn het contract; de ATDD-checklist (secties Interfacecontract en Aanvullingen) legt namen en signaturen vast.
- Tests niet aanpassen om ze te laten slagen; alleen bij een aantoonbare testfout, met reden in Implementation Notes.
- Alle schrijvers via `beelden.veilig_doel`; klantdata alleen onder `PROEF_MAP` (`~/logo-meetset-20261018/proef-detector/`).
- Elke taalmodelaanroep via `openrouter.Client` (zdr, statustabel, bewaker); sleutel alleen uit de omgeving.
- Alleen standaardbibliotheek + Pillow + numpy in de lichte modules; `rfdetr`/`torch` alleen in `train.py` en de laadfunctie van `herken.py` (lui geïmporteerd).
- Hergebruik `wilson`, `trekkingen`, `bootstrap` uit `fase-b/tel.py` (importeren, niet kopiëren).

**Never:**
- Geen schrijfactie op ACC, productie, `banana` of `replica-db`; geen aanroep met klantartwork naar OpenRouter tijdens de build.
- Geen pakket buiten de licentieregels van randvoorwaarden §4 (`rfdetr` zonder extra's `plus`/`augment`).
- Niets wijzigen buiten de specmap, de ATDD-checklist en deze specfile; bestaande suites in `apps/` niet raken.
- Geen volle training of eindmeting; geen GPU huren (stoppunt 1 als MPS te traag blijkt).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| zdr-weigering | OpenRouter antwoordt 404 | hele run stopt | `RunStop("geen_zdr")`; telt niet als eerste run |
| budgetgrens | aanroep zou 1,5× raming passeren | aanroep niet verstuurd | `RunStop("budget")` |
| toetsrun opnieuw | tweede run zonder `--herhaling` | geweigerd, eerste uitslag blijft | `AlGedraaid` |
| bevroren onderdeel gewijzigd | sha256 wijkt af | toetsrun start niet | `Gewijzigd` |
| schrijven in repo | doelpad in git-werkboom | niets geschreven | `BinnenRepo` |
| certificaatnummer zonder kandidaat | MSC-nummer, geen detectie | geen melding | — |

</frozen-after-approval>

## Code Map

- `_bmad-output/planning-artifacts/spike-getrainde-detector/tests/` -- 366 rode tests (17 bestanden) + `conftest.py`; de waarheid voor de bouw.
- `_bmad-output/planning-artifacts/spike-getrainde-detector/pyproject.toml` -- uv-project; groep `dev` (pytest, playwright), groep `detector` (`rfdetr[train]==1.11.2`).
- `_bmad-output/planning-artifacts/spike-architectuurkeuze-logoherkenning/fase-b/tel.py` -- `wilson(k, n)`, `trekkingen(glns, seed, n)`, `bootstrap(t, n, draws)`: hergebruiken via `sys.path`.
- `apps/ml-service/app/services/k4aa.py` -- `scan(data, remaining)` (async; resultaat `{"detections": [{"t3777_code", "confidence", "requires_review", "bbox"}], "stats": {"cost_usd", …}}`), `K4aaError(klasse)`, `MODEL`, `_reference_matrix` (lokaal te vervangen door de gefilterde momentopname), sleutel via `settings.GHS_REVIEW_API_KEY`. Niet wijzigen; `k4aa_lokaal` krijgt de module als parameter.
- `~/logo-meetset-20261018/bouw.py` -- regels voor lagen samenvoegen (overnemen in `beelden.samenvoegen`, niet importeren).
- `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/nakijken/server.py` + `index.html` -- patroon invulserver en pagina (huisstijl navy `#2F5A7A`, teal `#54949E`, rood `#D64545`, Inter 14px).
- `<hoofdrepo>/_bmad-output/planning-artifacts/eindtest-logo-pijplijn/ophaal-lijst-maken.py` -- de ophaalquery (overnemen in `beelden.ophaalquery`).
- `rfdetr` 1.11.2 -- `RFDETRNano/Small/Medium/Large(pretrain_weights=…)`; `.train(dataset_dir=, epochs=, batch_size=, output_dir=, device="mps", seed=, tensorboard=False)`; `.predict(beeld, threshold=)` → `supervision.Detections` (`xyxy`, `confidence`, `class_id`). Resoluties: N 384, S 512, M 576, L 704 (standaard).

## Tasks & Acceptance

**Execution:**
- [x] `kosten.py`, `openrouter.py` -- gedeelde client en uitgavenbewaking -- randvoorwaarden §1–3.
- [x] `scheiding.py` -- scheiding, dHash, `schrijf` -- CAP-1.
- [x] `beelden.py` -- `veilig_doel`, ophaalquery, rsync/ssh, samenvoegen, opslaan, render_pdf -- CAP-15.
- [x] `toets.py`, `uitslag.py` -- kandidaten, voorinvulling, gedeelde telfunctie -- CAP-2, CAP-3/9.
- [x] `invul/__init__.py`, `invul/server.py`, `invul/index.html` -- invulpagina -- CAP-3.
- [x] `generator.py`, `echt.py` -- trainingsdata -- CAP-4, CAP-5.
- [x] `train.py`, `herken.py`, `beoordelaar.py` -- detector, herkenning, beoordelaar -- CAP-6/7/8.
- [x] `tel_proef.py`, `bevries.py`, `k4aa_lokaal.py`, `licenties.py` -- telling, bevriezing, K4-aa-runner, licenties -- CAP-9/11/12/13.
- [x] `DRAAIPLAN.md` -- draaiplan in de vaste volgorde -- CAP-10.
- [ ] rooktest: `uv sync --group detector`; `train.snelheid` voor N en S op een kleine gegenereerde COCO-set; uitkomst (s/iteratie, verwachte duur, apparaat) in Implementation Notes en DRAAIPLAN -- CAP-6, stoppunt 1.

**Acceptance Criteria:**
- Given de dev-omgeving, when `uv run --group dev pytest -q` draait, then alle niet-`zwaar`-tests slagen en de `lokaal`-tests slagen op de echte invoer.
- Given de detector-omgeving, when `uv run --group dev --group detector pytest -q -m zwaar` draait, then de rooktests slagen op MPS.
- Given de echte omgeving, when `licenties.controleer(licenties.pakketten_uit_omgeving())` draait met de detectorgroep, then nul overtredingen.

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q` -- expected: 0 failed, 0 errors (alleen `zwaar` overgeslagen)
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev --group detector pytest -q -m "zwaar or lokaal"` -- expected: 0 failed
- `git status --porcelain` -- expected: alleen paden in de specmap, de ATDD-checklist en deze specfile

## Implementation Notes

**Route-poort (step-02, 01-11-2026):** intent gaps = geen (SPEC, companions en het ATDD-contract leggen elk gedrag vast; de punten voor Friso — correctie ≥ 50 zonder, blind nakijken — veranderen de bouw niet); irreversibles = geen (alleen lokale bestanden en een lokale rooktest; geen migratie, geen schrijfactie op ACC/productie, geen klantartwork naar een dienst); footprint = groot (±17 nieuwe modules, een pagina en een draaiplan, ±3.000 regels, waarop 366 tests leunen). Route: **dispatch**.

**Meerdoelencontrole (step-01) en omvang (step-02):** de bouw bevat meerdere los te reviewen onderdelen en de specfile is groter dan 1.600 tokens. Gekozen: alle doelen houden en de volledige spec houden, omdat de opdracht van de orchestrator de scope vastlegt (alle onderdelen in één build) en het ATDD-contract met 366 tests ze als één suite bindt; splitsen zou rode tests en een onvolledig draaiplan achterlaten. Geen mens aanwezig; vastgelegd als besluit, niet als antwoord van Friso.

**Checkpoint 1 (01-11-2026):** goedgekeurd en doorgegaan op de staande afspraak in de opdracht (bouwen tot review op een schone tak zonder vooraf te vragen); Open Questions leeg. Status `ready-for-dev`, daarna `in-progress` bij de start van step-03.

**Testwijziging (01-11-2026, aantoonbare testfout):** `tests/test_cap09_telling.py`, hulpfunctie `wilson`: `z=1.96` → `z=1.959963984540054`. Deze spec schrijft voor `wilson` uit `fase-b/tel.py` te importeren; die rekent met `Z = 1.959963984540054`. Met `z=1.96` wijken de grenzen relatief ±3·10⁻⁵ af (gemeten op (1,1), (1,2), (0,35)), boven de standaardtolerantie van `pytest.approx` (10⁻⁶), dus de test viel om op een implementatie die de spec juist volgt. Wat de test beweert is niet veranderd.

**Opdrachtregel `beelden.py ophaallijst`:** de replica-query liep buiten `uitvoerder` en zonder `nice -n 19` (rechtstreeks `subprocess`, overgenomen uit `ophaal-lijst-maken.py`). Nu `uitvoerder(ssh_opdracht(["mysql", "--batch", "--skip-column-names", "-e", <query gequote>], host="replica-db"))`; nagerekend dat de shell aan de overkant de query ongewijzigd ontvangt.

**Stoppunt 4 — licenties (open, keuze Friso):** `licenties.controleer(licenties.pakketten_uit_omgeving())` in de detectoromgeving geeft 2 overtredingen: `torch` 2.15.0 (`Apache-2.0 AND … AND BSL-1.0 AND …`; Boost-licentie van meegeleverde code) en `regex` 2026.9.29 (`Apache-2.0 AND CNRI-Python`; via `transformers` ← `rfdetr`). Beide zijn ruime licenties, maar staan niet in randvoorwaarden §4; de meting van 31-10 ("alle 87 toegestaan") strookt niet met de `License-Expression` van deze vergrendelde versies. Niet zelf bij "even ruim" gezet, want dat verandert de toegestane lijst. Gevolg: derde acceptatiecriterium en de `lokaal`-test van CAP-13 blijven rood tot Friso beslist; het draaiplan zet training (stap 9–10) daarop stil. De rooktest hieronder draaide lokaal met deze pakketten (niets verspreid).

**Rooktest snelheid (stoppunt 1 voor S):** `train.snelheid` op een kleine nagemaakte COCO-set (40 tegels van 1024 px, 50 iteraties × batch 4), apparaat `mps`, M3 Pro 18 GB. N (384): 1,03 s/iteratie (eerdere meting 1,06) → ±7,2 uur per fase van 5.000 tegels × 20 epochs, binnen 8 uur. S (512): liep twee keer vast op iteratie 20/50 (12 GB geheugen, wisselgeheugen vol); tot dan 0,62 it/s ≈ 1,6 s/iteratie → ±11 uur per fase: **stoppunt 1**. M en L niet gemeten. `DRAAIPLAN.md` (sectie "Snelheid") zet `MAAT=N`; S/M/L alleen na Friso's keuze (GPU huren?). Uitvoer in `~/logo-meetset-20261018/proef-detector/rooktest/`.

**Opruiming:** de tijdelijke map `/tmp/proef-rook.p1Wd` van de opdrachtregel-rooktests (met kopieën van de echte invoerbestanden) is verwijderd.

**Reviewbevindingen doorgevoerd (01-11-2026, step-04, 35 punten).** Alle punten van de review zijn doorgevoerd; geen verworpen. Kern: invulserver houdt de status bij een tussenstand en weigert vreemde Host/Origin (403); pagina slaat één voor één op en bevestigt alleen met alle keuzes; voorinvulling vult alleen beoordeelde codes voor, verdeelt tegels over aanroepen (≤ 16) en stopt na 5 weigeringen; uitgavengrens per post over herstarts (`PROEF_MAP/uitgaven.json`), ook in `beslis` (vooraf) en de K4-aa-runner (zdr-proef en grens vóór elk etiket); run-bestanden met status, na elk etiket weggeschreven, afgebroken runs herkend door `tel_proef`; `bevries` legt beeldinhoud, instellingen, beslissende code en embeddings vast, en `detecteer`/`beslis`/de K4-aa-runner nemen met `--bevroren` hun instellingen daaruit; correcties en Nutri-Score-telling volgens de bijgewerkte meetregels §3; validatie: onzekere codes tellen niet als afwezig, te grote dHash-clusters overgeslagen en gemeld, achtergronden alleen van de trainingskant, `test`-map voor rfdetr; AI-vakjes op vorm gecontroleerd en ontdubbeld; beelden: RGB-origineel, pixelgrens vóór decoderen, ssh-fout 255 stopt, PDF-tekst van elk doc; geheugen: etiketten één voor één geopend. Nieuwe tests: `tests/test_review_20261101.py` (52). `DRAAIPLAN.md` stappen 2, 3, 5, 6, 9–15 en "Snelheid" bijgewerkt (wat de schatting wel en niet meetelt, fase 2, tegelaantallen).

**Testaanpassingen door de review (contractwijziging, geen versoepeling):** (1) `test_cap02_kandidaten.py`: `keurmerken` verwacht nu alleen de teruggegeven codes `{GREEN_DOT: True, WEIDEMELK: False}` in plaats van alle 7 met `False` — de review stelde vast dat "niet beoordeeld = afwezig" een etiket met `b` als afwezig liet bevestigen. (2) `test_cap09_telling.py`, hulpfunctie `schrijf_routes`: routebestanden in het nieuwe run-formaat `{"status": "voltooid", "etiketten": …}`, omdat `tel_proef` een run zonder status "voltooid" nu weigert. (3) `test_cap11_bevriezing.py`: `VERPLICHT` heeft 11 namen en de fixture levert een geldige index voor `referentieplaatjes` en volledige `instellingen`; de controle "hash van het bestand staat in bevroren.json" geldt niet voor `referentieplaatjes` (die hash gaat over de beelden, eigen test). De beweringen zelf zijn niet afgezwakt; het ATDD-contract is bijgewerkt in de checklist ("Wijzigingen in het contract na de code review").

**Step-03-controle (orchestrator, 01-11-2026):** diff sinds baseline gelezen (3.729 regels); alle 10 taken af; matrixaudit: elke rij heeft een test die draaide en slaagde (43 tests, filter zdr/budget/herhaling/gewijzigd/git/certificaat). Acceptatiecriterium 2 gehaald (rooktests op MPS). Criteria 1 en 3 hangen aan stoppunt 4 (licenties `torch`, `regex`): 365 van 366 groen; de rode test is de licentiecontrole op de echte omgeving. Niet zelf op te lossen; gaat naar Friso.

## Review Triage Log

Ronde 1 (01-11-2026): lagen Blind Hunter (BH, 20), Edge Case Hunter (EC, 37) en Verification Gap (VG, 9 + 3 overige) draaiden parallel als verse subagents op `/tmp/bmad-build-review-diff-proef.patch` (187 kB; specfile alleen als claims voor EC). Geen intent_gap- of bad_spec-route: elk gedrag hieronder staat al in SPEC/companions; de afwijkingen hebben een kleine, gerichte fix zonder nieuwe publieke oppervlakte buiten de proefmap → patch.

| # | bevinding (groep) | verdict | route |
|---|---|---|---|
| 1 | Tussenstand zonder status wist "bevestigd" (BH1, EC28) | high | patch |
| 2 | Ontbrekende AI-codes als "afwezig" voorgevuld (BH2) | medium | patch |
| 3 | Aanvulling (stap 6): `ontdubbel` leest alleen `kandidaten.json`; `--alleen` zonder `--bestaand` overschrijft (BH3, EC30, EC31) | medium | patch |
| 4 | Achtergronden uit validatie-etiketten lekken in de training (BH4) | high | patch |
| 5 | Bevriezing dekt niet alle onderdelen van meetregels §6 (referentieplaatjes-inhoud, run-instellingen, code-modules, K4-aa-embeddings) (BH5, EC8, EC9) | high | patch |
| 6 | Afgebroken run niet herkend: `RunStop` niet vastgelegd, stub → TypeError, `geen_zdr`-marker nooit geschreven, partiële run telt als geldig (BH6, EC10, EC11, VG-overig) | high | patch |
| 7 | Herhaalregel na zdr-stop tegenstrijdig; stap 14 leest vast run1 (BH7) | medium | patch |
| 8 | K4-aa-runner zonder uitgavengrens en zdr-proef (BH8, EC19, VG7) | medium | patch |
| 9 | Uitgavengrens per proces in plaats van per post; `beslis` zonder startcontrole; herstart zet teller op 0 (BH9, EC18, EC20, VG7) | medium | patch |
| 10 | Nutri-Score-correctie in voorgeschreven vorm laat etiket verdwijnen; onbekend etiket → KeyError (BH10, EC12, EC13, VG8) | medium | patch |
| 11 | Nakijklijst bevat alleen verschillen → nakijken kan routes alleen bevoordelen (BH11) | medium | reject: de fix wijzigt meetregels §6 (contract); voorgelegd aan Friso |
| 12 | Snelheidsschatting niet "aan de hoge kant", fase 2 niet geschat, 40 vs 200 tegels (BH12) | low | patch (draaiplantekst) |
| 13 | `_detecteer`/`_beslis` zonder foutafhandeling per etiket en zonder hervatten; doc ontbreekt in kandidaten → KeyError (BH13, EC17) | medium | patch |
| 14 | Geen maximum aan beelden per aanroep; geen stop na reeks weigeringen (BH14) | medium | patch |
| 15 | Route A krijgt alleen tekst van docs zonder print-laag (BH15) | medium | patch |
| 16 | ssh-fout (255) ziet eruit als "geen origineel"; rsync-stderr weg (BH16, EC4, EC7) | medium | patch |
| 17 | `echt.py dataset` maakt geen `test`-map; draaiplan noemt verkeerde map (BH17) | medium | patch |
| 18 | Klassenlijst acht keer gekopieerd; `--meng` controleert categorieën niet (BH18) | low | patch |
| 19 | Gewichtsherkomst verdwijnt in fase 2; `sha256: None` stil (BH19) | low | patch |
| 20 | AI-vakjes niet op vorm gecontroleerd (BH20) | medium | patch |
| 21 | RGB-origineel: lui beeld gesloten → AssertionError bij opslaan (EC1, geverifieerd) | high | patch |
| 22 | Groot niet-PDF-origineel zonder pixelgrens; pdftoppm zonder pagina's → ValueError (EC2, EC3) | medium | patch |
| 23 | Mislukte print-laag krijgt geen origineel-terugval (EC5) | medium | patch |
| 24 | Transparante print-laag wordt zwart (EC6) | false: bewust gelijk aan `bouw.py` ("zelfde bytes als de pijplijn", toetsset §3; ATDD-aanvulling) | reject |
| 25 | Meerdere Nutri-Score-letters incl. de juiste: gevonden zonder verkeerde letter (EC14, geverifieerd) | medium | patch + meetregels §3 aangevuld via bmad-spec |
| 26 | `overlap >= tegel` → oneindige lus (EC15) | low | patch |
| 27 | Ontbrekend referentieplaatje → KeyError midden in betaalde run (EC16) | medium | patch |
| 28 | Tijdelijke fout blijft bij herstart voor altijd "fout" (EC21) | medium | patch |
| 29 | Dubbele waarheidsvakjes uit overzicht + tegels (EC22) | medium | patch |
| 30 | dHash-keten maakt reuzencluster → validatie krijgt hele klasse (EC23) | medium | patch |
| 31 | Alleen-onzekere codes in validatiewaarheid tellen als vals (EC24) | medium | patch |
| 32 | Alle trainingsbeelden / achtergronden tegelijk in geheugen (EC25, EC26) | medium | patch |
| 33 | `b` op onvolledig etiket gaat toch door (EC27) | medium | patch |
| 34 | Lokale server neemt POST van vreemde pagina/DNS-rebinding aan (EC29) | medium | patch |
| 35 | Model zonder tarief en zonder `usage.cost` → KeyError na betaalde aanroep (EC32) | medium | patch |
| 36 | `IncompleteRead` geen `OSError` (EC33) | medium | patch |
| 37 | Geneste antwoordtypen niet gecontroleerd → TypeError i.p.v. EtiketFout (EC34) | medium | patch |
| 38 | Licentie-uitdrukking met restant "(MIT) GPL-3.0" → toegestaan (EC35, geverifieerd) | high | patch |
| 39 | Nutri-Score-token "AB" als substring (EC36) | low | patch |
| 40 | Licentiecontrole echte omgeving rood: `torch` (BSL-1.0-deel), `regex` (CNRI-Python) (EC37/38, VG-overig) | high | stoppunt 4: keuze Friso, geen code-fix |
| 41 | Testgaten: `_op_schaal`, 60%-regel echt en generator, `maat` in voorlabels, bevriezing map/standaardpad, `_matrix` gefilterd, budget runner/beslis, `--correcties`, `aandeel_requires_review` (VG1–VG9) | medium | patch (tests erbij) |

**Na de patchronde (01-11-2026, orchestrator):** Verification opnieuw gedraaid: `uv run --group dev pytest -q` → 417 passed, 1 failed; `-m "zwaar or lokaal"` met de detectorgroep → 3 passed, 1 failed. De enige rode test is `test_cap13_lokaal_echte_omgeving_zonder_overtredingen` (stoppunt 4: `torch` met een BSL-1.0-deel, `regex` met CNRI-Python). Dat is niet in code op te lossen zonder de toegestane licentielijst te wijzigen, dus volgens step-04: HALT en escaleren naar Friso. Step-05 (afronden) is daarom niet gedraaid; status blijft `in-review`. Drie ATDD-tests zijn bij de patchronde aangepast omdat de reviewfixes het contract wijzigden (reden per test hierboven, contractwijziging in de ATDD-checklist). Diff herschreven: `/tmp/bmad-build-review-diff-proef.patch`.
