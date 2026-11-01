---
title: 'Proef getrainde detector ronde 4: aanvulling vóór bevestiging, grens voorlabels $50'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_commit: '039b14fb60e36b328bc8e0b50faf95e6d173a0e9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/test-artifacts/atdd-checklist-spike-getrainde-detector.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '{project-root}/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Na de voorinvulling staat zwangerschap op 14 waarschijnlijke etiketten (stoppunt 2) en hebben MSC, Vegan Society en Weidemelk weinig marge. Friso besliste op 01-11-2026: vóór zijn bevestiging aanvullen (zwangerschap ±40–60 etiketten, print-laag eerst; MSC/Vegan/Weidemelk alles wat over is, ook boven 40) en de voorlabels een vaste grens van $50 geven. Het gereedschap kan dat niet: `kandidaten` telt bestaande kandidaten mee voor het maximum, kent geen voorkeur, geen maximum per keurmerk en maar één bestaande lijst, overschrijft een eerdere aanvullingslijst; `pdftekst` overschrijft `certificaten.json`; de voorlabels rekenen met 1,5 × de raming ($15).

**Approach:** `kandidaten` krijgt bestaande GTIN's, maxima per keurmerk en een print-laagvoorkeur; de opdrachtregel krijgt `--alle`, herhaalbare `--alleen`/`--bestaand`, `--naam` (nooit overschrijven), `--print-laag-eerst` en een JSON-melding per keurmerk; `pdftekst` vult aan; de voorlabels gebruiken standaard $50; het draaiplan beschrijft de aanvulling. Contract: "Interfacecontract ronde 4" in de ATDD-checklist.

## Boundaries & Constraints

**Always:**
- Contract: ATDD-checklist, sectie "Ronde 4", plus toetsset §3–§4 en randvoorwaarden §3. De rest van de checklist blijft bindend.
- Zonder de nieuwe argumenten precies het bestaande gedrag van `kandidaten` en de opdrachtregel (bestaande tests groen).
- Tests alleen wijzigen bij een aantoonbare testfout, met reden in Implementation Notes.
- Alleen standaardbibliotheek en Pillow; geen nieuwe afhankelijkheid.

**Never:**
- Niets buiten de specmap, de ATDD-checklist, deze specfile, `deferred-work.md` en de tracebestanden; niet committen of pushen.
- Tijdens de bouw geen klantartwork naar een dienst, geen netwerk naar productie, geen schrijfactie op ACC of productie, geen klantdata in de repository; `~/logo-meetset-20261018/` niet aanraken (de uitvoering volgt na de keten).
- Geen grens die stil verhoogd kan worden: een andere grens dan $65/$50 alleen met niet-leeg `--besluit`; beoordelaar- en K4-aa-posten ongewijzigd.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| aanvulling | `--alleen PW --max-per 60 --alle WM --bestaand K --naam N --print-laag-eerst` | per keurmerk de volgende nieuwe GTIN's, print-laag eerst; geen gelijkende; stdout JSON per keurmerk | — |
| lijst bestaat | `<naam>.json` bestaat al | niets geschreven | exit ≠ 0 |
| onbekende code | `--alleen`/`--alle` met code buiten K7 ∪ {NUTRISCORE} | niets geschreven | exit 2 |
| zonder bestaand | `--alleen`/`--alle` zonder `--bestaand` | niets geschreven | exit 2 |
| certificaten | `certificaten.json` bestaat | andere docs blijven, docs uit de lijst nieuwe uitkomst | mislukte lezing → `null` |
| voorlabels | geen `--grens` | grens $50; grootboek + projectie > 50 start niet | `BudgetOverschreden` vóór zdr-proef |

</frozen-after-approval>

## Code Map

Map: `_bmad-output/planning-artifacts/spike-getrainde-detector/` (hierna `./`).
- `./toets.py` -- `kandidaten` (r.90) en `neem` (r.93): `gekozen` vooraf vullen met `bestaand` (de bestaande lus slaat `gekozen` over zonder te tellen = volledige vaste volgorde min bestaand); maximum per sleutel uit `maxima` (`None` → onbegrensd); `voorkeur`: per bron eerst `_om_de_beurt` over de paren in `voorkeur`, dan over de rest (`itertools.chain`). `main kandidaten` (r.289–310, opties r.246–251): `--alleen`/`--bestaand` `action="append"`, nieuw `--alle` (append), `--naam`, `--print-laag-eerst` (pool lezen uit `<PM>/invoer/`), codecontrole met `ap.error`, weigeren als de aanvullingslijst bestaat, JSON-melding met `toegevoegd`/`over`. `_toets_rijen` niet wijzigen.
- `./beelden.py` -- `main` tak `pdftekst` (r.284–293, `tekst = {}` r.285): bestaande `--uit` inlezen en bijwerken.
- `./echt.py` -- `main voorlabels` (r.271–301, `grens_uit(ap, a, None)` r.272): `grens_uit(ap, a, GRENS_VOORLABELS)` met nieuwe constante `GRENS_VOORLABELS = 50.0`; helptekst `--grens`.
- `./toets.py` `grens_uit` (r.231) hergebruiken; niet wijzigen.
- `./DRAAIPLAN.md` -- kostennotitie (r.21), stap 4 (r.68), stap 6 (r.85), stap 9 (r.117–140).
- `./tests/test_ronde4_20261101.py` -- 19 tests (17 rood); niet wijzigen tenzij aantoonbare testfout.

## Tasks & Acceptance

**Execution:**
- [x] `./toets.py` -- `kandidaten(bestaand=, maxima=, voorkeur=)` en de opdrachtregel volgens het contract -- CAP-2, toetsset §4.
- [x] `./beelden.py` -- `pdftekst` vult `certificaten.json` aan -- CAP-15, toetsset §3.
- [x] `./echt.py` -- `GRENS_VOORLABELS = 50.0` als standaardgrens -- CAP-14, randvoorwaarden §3.
- [x] `./DRAAIPLAN.md` -- kostennotitie met $50; stap 4: aanvulling vóór de bevestiging (besluit Friso 01-11-2026) als volgende handeling bij stoppunt 2 in deze ronde; stap 6: uitgeschreven aanvulcommando's (eigen lijst `--naam`, tussenmap `$T/<naam>`, `bouwen*` naar `$T/gecombineerd`, `pdftekst` naar `$T/certificaten.json`, voorinvulling over alle toets-docs), de eenmalige aanvulling met `--print-laag-eerst` en `--alle`, en `--max-per` = nieuwe kandidaten; stap 9: voorlabels zonder `--grens`/besluitvariabelen, standaard $50 -- CAP-10.

**Acceptance Criteria:**
- Given de dev-omgeving, when de volledige suite draait, then 0 failed (560 tests, ook de 17 rode van ATDD ronde 4).
- Given de afgeronde bouw, when `git status --porcelain`, then alleen paden uit Boundaries.

## Implementation Notes

**Versiebeheer (step-01, 01-11-2026):** tak `spike/proef-getrainde-detector` (HEAD `039b14fb60e36b328bc8e0b50faf95e6d173a0e9`) past bij de intent; de werkboom is niet schoon, maar bevat alleen de eigen paden van deze keten (spec-update via `bmad-spec`/`bmad-review`, ATDD-tests en -checklist van ronde 4; `git status --porcelain` nagelopen). Doorgegaan zonder te stoppen op de staande afspraak van de eigenaar (bouwen tot review op een schone tak zonder vooraf te vragen) en de opdracht van de orchestrator; geen mens aanwezig.

**Meerdoelencontrole (step-01):** twee los op te leveren doelen: aanvulgereedschap (kandidaten, pdftekst, draaiplan stap 4/6) en de grens van de voorlabels ($50, draaiplan stap 9). Gekozen: beide houden ("Keep all goals"). Basis: de opdracht van de orchestrator (één keten voor drie besluiten van Friso) en dezelfde staande afspraak; ATDD ronde 4 bindt ze als één rode suite. Vastgelegd als besluit, niet als antwoord van Friso.

**Route-poort (step-02, 01-11-2026):** intent gaps = geen (de drie besluiten van Friso met bron in randvoorwaarden §3 en toetsset §4; de aanvulregels, opties, melding en het niet-overschrijven liggen vast in het ATDD-contract; wat open bleef merkt de gebruiker niet: namen van hulpfuncties, volgorde van sleutels in de melding, foutteksten); irreversibles = geen (alleen lokale bestanden; geen migratie, geen netwerk of schrijfactie op ACC of productie, geen betaalde aanroep tijdens de bouw — de aanvulling zelf draait pas na de keten); footprint = middelgroot (vier bestanden in één map; nieuw publiek: drie argumenten van `kandidaten`, vier opdrachtregelopties waarvan twee herhaalbaar, de JSON-melding, `GRENS_VOORLABELS`; 19 tests). Niet klein, dus route **dispatch**.

**Omvangpoort (step-02):** ±1.800 tokens (6.470 tekens), boven 1.600. Risico: details uit het midden worden gemist; beperkt doordat het bindende contract en de 19 tests in de ATDD-checklist staan. Gekozen: volledige spec houden (zelfde basis als hierboven). Open Questions: geen.

**Checkpoint 1 (01-11-2026):** goedgekeurd en doorgegaan ("Approve and continue") op de staande afspraak van de eigenaar; geen mens aanwezig. Spec vóór goedkeuring opnieuw van schijf gelezen (ongewijzigd sinds het schrijven). Status `ready-for-dev`.

**Bouw (step-03, 01-11-2026):** vier bestanden in de specmap gewijzigd (`toets.py`, `beelden.py`, `echt.py`, `DRAAIPLAN.md`); geen test gewijzigd. Keuzes waar het contract open liet:
- Een bestaande lijst wordt geweigerd bij elke run met `--bestaand` (de runs die standaard `kandidaten-aanvulling` heten), niet alleen bij `--alleen`/`--alle`; zonder `--bestaand` blijft het bestaande overschrijven van `kandidaten.json` (stap 2 opnieuw draaien). Weigering via `SystemExit` met melding (exitcode 1), vóór enige schrijfactie.
- Codecontrole via argparse `choices` (exitcode 2, "invalid choice"); `--alle` gaat voor `--alleen` als dezelfde code bij beide staat.
- De JSON-melding geldt ook voor de gewone run (alle 8 sleutels), zoals het contract zegt; de oude regel "N kandidaten → pad" vervalt.
- Pool-regels: elk woord met precies twee streepjes telt als `doc_id` (gemeten op de hoofdrepo-kopie: 3.608 regels, alle drie delen); andere regels vallen weg.
- `pdftekst` schrijft niet atomisch, net als `manifest.json` van `bouwen`; de pdftotext-aanroepen lopen vóór het ene schrijfmoment.

**Verificatie (step-03):** `uv run --group dev pytest -q -p no:cacheprovider` → 560 passed, 0 failed (81 s; de 17 rode van ronde 4 groen); `uvx ruff check --select F,E9 toets.py beelden.py echt.py` → schoon.

**Reviewpatches (01-11-2026, op verzoek van de codereview; geen testfout):**
- `toets.py kandidaten`: weigert (exit ≠ 0, niets geschreven) bij `--bestaand` of `--naam` als `<naam>.json` óf `<naam>-paren.tsv` bestaat; de gewone run zonder beide overschrijft `kandidaten.json` zoals voorheen. Exit 2 via `ap.error` voor `--naam` met een map of `.`/`..`/leeg, voor `--bestaand` zonder `--alleen`/`--alle` (zou gelijkende kandidaten nemen) en voor dezelfde code bij `--alleen` en `--alle`. Daarmee vervallen de twee keuzes hierboven over "alleen bij `--bestaand`" en "`--alle` gaat voor".
- `beelden.py pdftekst`: schrijft atomisch (tijdelijk bestand + `os.replace`, zoals `kosten.Bewaker.boek`). Daarmee vervalt de keuze hierboven over niet-atomisch schrijven.
- `echt.py voorlabels`: `--raming` vervalt (deed niets meer); `RAMING_VOORLABELS = 30.0` informatief naar `Bewaker`.
- `DRAAIPLAN.md`: stap 6 heeft een volledig eigen blok voor de eenmalige aanvulling (`T`, `N=kandidaten-aanvulling-1`, alle ophaal-/bouwregels, `ontdubbel`, voorinvulling, `rapport`) naast het blok voor latere aanvullingen; kosten: verwacht ±$14 bij $0,12, tot ±$35 bij p90 $0,30; stap 9: ±$25–35, projectie ±$25.
- Tests (`tests/test_ronde4_20261101.py`): de stap-6-test eist nu `--uit $T/$N` (accepteerde een vaste gedeelde map); nieuw `test_r4_cli_weigert_zonder_iets_te_schrijven` (7 gevallen), `test_r4_cli_gewone_run_naar_toets_en_kant_train_naar_train`, `test_r4_bouwen_en_bouwen_origineel_vullen_het_manifest_aan`. Mutaties gecontroleerd: `manifest = {}` in `bouwen`, de oude overschrijfcontrole en `doel` boven de trainingstak maken elk een nieuwe test rood.
- Verificatie (alleen de tests van de gewijzigde bestanden, volledige suite bij de orchestrator): 238 passed in 8 bestanden (browser uitgezonderd), `tests/test_ronde4_20261101.py` 28 passed; ruff schoon.

**Na de reviewpatches (01-11-2026, orchestrator van de build):** Verification opnieuw gedraaid op de gepatchte boom (oude bytecode eerst gewist): volledige suite 569 passed, 0 failed (82,6 s; 560 + 9 reviewtests); `uvx ruff check --select F,E9 toets.py beelden.py echt.py` schoon; `git status --porcelain` alleen paden uit Boundaries (plus `deferred-work.md`, één nieuwe regel voor B5b). Diff herschreven: `/tmp/bmad-build-ronde4-diff.CHRjP9` (98 kB).

**Step-05:** status `done`. Geen commit: de opdracht van de orchestrator ("do NOT commit or push") gaat voor de commitstap van de workflow. Uitgesteld: B5b (`manifest.json` niet atomisch, bestond al) in `deferred-work.md`. Volgende schakel: `bmad-testarch-trace`.

**Na de keten: eenmalige aanvulling vóór de bevestiging (01-11-2026, orchestrator; DRAAIPLAN stap 6):** reservekopie van de statusbestanden in de proefmap vooraf. `kandidaten --naam kandidaten-aanvulling-1 --print-laag-eerst`: 118 kandidaten (zwangerschap 60, waarvan 44 met print-laag; Weidemelk 58, waarvan 57; MSC en Vegan Society 0, want er was niets meer over); daarna over: zwangerschap 773, Weidemelk 0, MSC 0, Vegan Society 0. Ophaallijst (één SELECT op replica-db): 427 lagen voor 101 docs; rsync van banana met `nice -n 19` (exit 0); bouwen: 101 gebouwd, 0 fout (manifest 260 → 361 regels, eerdere ongewijzigd); originelen: 0 (17 docs zonder print-laag, docmap leeg). Ontdubbelen: 90 van 101 blijven (zwangerschap 41, Weidemelk 49); `toets-docs.json` 232 → 322. Voorinvulling (zdr-proef geslaagd, grens $65 standaard): alleen de 90 nieuwe, 0 fouten, $6,66; grootboek post "voorinvulling toets" $26,91 → $33,57; `items.json` 322. `toets.py rapport`: exit 0, geen stoppunt 2 (EU-bio 30, Groene Punt 41, Recyclebaar 60, zwangerschap 41, MSC 18, Weidemelk 72, Vegan Society 17, Nutri-Score 86). Invulserver herstart op poort 8767. PDF-originelen voor route A: de eerste `origineel-paden --alleen-pdf` over alle 118 kandidaten liep twee keer tegen de tijdgrens van de achtergrondtaak (±25 s tot ±1,7 min per `ls` op banana; uitvoer pas aan het eind) en is gestopt zonder uitvoer; daarna alleen voor de 90 behouden docs, gesplitst in `kandidaten-aanvulling-1/pdf-1` (zwangerschap, 41 → 8 PDF's) en `pdf-2` (Weidemelk, 49 → 0 PDF's: 43 zonder PDF-origineel, 6 docmap leeg); `certificaten.json` aangevuld (122 → 130, eerdere ongewijzigd).

## Spec Change Log

## Review Triage Log

Ronde 1 (01-11-2026): Blind Hunter (B, 16), Edge Case Hunter (E, 9), Verification Gap (V, 2 gaten + 1 overig). Diff: `/tmp/bmad-build-ronde4-diff.CHRjP9` (86 kB, zonder memlog en deze spec).

| # | bevinding | verdict | bewijs | route |
|---|---|---|---|---|
| B1/E8 | de weigering om te overschrijven hangt aan `--bestaand`: `--naam X` zonder `--bestaand` overschrijft een aanvullingslijst; een losse `<naam>-paren.tsv` wordt niet gecontroleerd | medium | `toets.py` r.309 `if a.bestaand and doel.exists()`; de edge-hunter bevestigde het met een proef | patch |
| B2/E2 | `--naam` met `/` of `..` schrijft buiten de toetsmap, langs `veilig_doel` | medium | `doel = toets_map / f"{a.naam}.json"`; alleen `toets_map` gaat door `veilig_doel`; proef bevestigd | patch |
| B3/E1/V-o | `--bestaand` zonder `--alleen`/`--alle` heet een aanvulling maar neemt alle keurmerken plus gelijkende (toetsset §4: geen gelijkende) | medium | `keuze` leeg → alle rijen en `gelijkend` blijven; proef: 290 kandidaten | patch (weigeren, exit 2) |
| E3/B3b | dezelfde code bij `--alleen` en `--alle`: `--alle` wint stil, het maximum vervalt | low | `maxima=dict.fromkeys(alle)`; proef 50 in plaats van 2; directe weigering is één regel | patch |
| B3c | `--max-per` wordt bij alleen `--alle` genegeerd | false | `--alle` betekent volgens het contract "alles wat overblijft"; het maximum hoort daar niet bij | verworpen |
| B4 | een mislukte `pdftotext` maakt eerder gelezen tekst `null` | low | alleen bij opnieuw lezen van hetzelfde doc; de aanvulling leest alleen nieuwe docs (`$T/$N/pdf-originelen.tsv`); het gedrag is een vastgelegd besluit (memlog review #11) en de oplossing voegt een tak toe | verworpen |
| B5/E5 | `certificaten.json` (nu over rondes heen) wordt niet atomisch geschreven | low | `uit.write_text(...)`; een onderbreking laat kapotte JSON achter; tijdelijk bestand + `os.replace` is een directe correctie zoals `kosten.py` | patch |
| B5b | `manifest.json` wordt ook niet atomisch geschreven | low | bestond al vóór deze wijziging (stap 2 schreef hem al twee keer cumulatief) | defer |
| B6/V1 | CAP-15 belooft dat het manifest wordt aangevuld; geen test (mutatie `manifest = {}` bleef groen) | medium (gat) | gezocht in `tests/*.py`: alleen `test_bouwen_origineel_met_rgb_png` op een leeg manifest | patch (test) |
| V2 | gewone `kandidaten`-run (zonder `--bestaand`) en `--kant train` hebben geen test op het doelbestand (mutatie bleef groen) | medium (gat) | geen test roept `main kandidaten` zonder `--bestaand` of met `--kant train` aan | patch (test) |
| B7 | de draaiplantest van stap 6 laat een vaste gedeelde map onder `$T` toe | low | `re.fullmatch(r"\$T/\S+", …)` accepteert `$T/aanvulling`; aanscherpen tot `$T/$N` is een directe correctie | patch (test) |
| B8 | "hoogstens ±$14" is een gemiddelde | low | 118 × $0,12; p90 $0,30 geeft ±$35; tekstcorrectie | patch |
| B9 | doel zwangerschap ±40–60 niet haalbaar | false | ±45 print-laagkandidaten ligt binnen ±40–60; de zin is het doel uit het besluit van Friso, met bron | verworpen |
| B10 | voor MSC/Vegan Society ontbreekt de conclusie dat aanvullen niets oplevert | false | toetsset §4 punt 2 zegt dat elke toets-GTIN al kandidaat is; de dunne marge gaat in het verslag naar Friso | verworpen |
| B11 | ramingen voorlabels onderling tegenstrijdig (DRAAIPLAN ±$25–30, randvoorwaarden ±$25–35) | low | DRAAIPLAN r.163; de raming ±$25–35 komt uit het besluit van Friso; tekstcorrectie | patch |
| B12 | `echt.py --raming` doet niets meer | low | `Bewaker` gebruikt de raming alleen bij `grens=None`, wat niet meer voorkomt; verwijderen is een directe correctie (zoals ronde 3 bij de voorinvulling) | patch |
| B13/E4 | `--print-laag-eerst` valt stil terug als de pool niets raakt | low | vereist een kapotte pool; de echte pool heeft 3.608/3.608 regels GLN-GTIN-doelmarkt; de oplossing voegt een wacht of meldveld toe | verworpen |
| B14/E7 | de eenmalige aanvulling staat niet als volledig plakbaar blok (`$T` en `N` uit een ander blok) | medium | DRAAIPLAN stap 6: het blok van `-1` heeft alleen de eerste regel; tekstcorrectie | patch |
| B15 | `--bestaand` per lijst leunt op het geheugen van de lezer | low | het draaiplanblok noemt beide lijsten; een automatische glob is nieuw gedrag | verworpen |
| B16 | besluiten niet te onderscheiden ("besluit Friso 01-11-2026" zonder tijd) | false | de documenttests eisen ook de inhoud ($50, `--print-laag-eerst`, `--alle`), dus tekst van een ander besluit volstaat niet; de bron staat in de memlog | verworpen |
| E6 | een kapot `certificaten.json` geeft pas na alle `pdftotext`-runs een fout | low | alleen na een halve schrijfactie, die de atomische schrijfwijze (B5) uitsluit; verloren is alleen lokale rekentijd | verworpen |
| E9 | Nutri-Score met voorkeur: print-laag eerst per letter, niet over de hele groep | false | de groepsregel "gelijk verdeeld over A, B en C" (toetsset §4.1) gaat voor; de voorkeur geldt binnen elke letter; vastgelegd in de ATDD-checklist | verworpen |

## Verification

**Commands:**
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uv run --group dev pytest -q -p no:cacheprovider` -- expected: 0 failed, 560 tests
- `cd _bmad-output/planning-artifacts/spike-getrainde-detector && uvx ruff check --select F,E9 toets.py beelden.py echt.py` -- expected: schoon
