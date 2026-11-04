---
title: 'Proef getrainde detector ronde 10: glutenvrij als veertiende keurmerk, met drie poorten'
type: 'feature'
created: '2026-11-03'
status: 'ready-for-dev'
baseline_commit: '0852840'
route: 'spec'
review_loop_iteration: 2
context:
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/SPEC.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/toetsset.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/trainingsset-en-herkenning.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/randvoorwaarden.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/spike-getrainde-detector/meetregels.md'
  - '{project-root}/.claude/worktrees/proef-ronde9/_bmad-output/planning-artifacts/research/technical-keurmerkherkenning-zonder-training-2026-10-31/datasets-keurmerken-2026-11-01.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Friso besloot op 03-11-2026 dat glutenvrij (het doorgekruiste-aar-logo; claimcode `DIET_FREE_FROM_GLUTEN`, in de declaratiedata `FREE_FROM_GLUTEN`) een eigen keurmerk wordt in de proef, direct toegevoegd. Friso is gewaarschuwd voor twee risico's en heeft toch gekozen: (1) het logo is van Crossed Grain en mag alleen onder licentie op voedings- en drankproducten gebruikt worden; (2) op de toetsset zijn er 17 declaraties, en er zijn 16 bevestigde etiketten mét nodig. De proef kent nu 13 keurmerken en 17 klassen; glutenvrij maakt er 14 en 18.

**Besluiten van Friso (03-11-2026), letterlijk:**
- Gate A (licentie) is door Friso opgeheven als eigen besluit: "Doe de training van glutenvrij sowieso. Ik bevestig dat dat kan." De licentierisico's blijven bekend (zie Gates) en vormen geen blokkade.
- Gate B (geld): voorinvulling glutenvrij met Haiku, cap $1 voor deze stap.
- Gate C (toetsset): de training start pas als Friso de glutenvrij-rij op de pagina heeft bevestigd met minimaal 16 "mét". Tot die tijd alleen voorbereiden.

**Approach:** Eén nieuw keurmerk en één nieuwe klasse, op de bestaande toetsset en met dezelfde meetregels als de andere keurmerken. Drie poorten: Gate A (licentie) is opgeheven en staat als bekend risico in de resultaten; Gate B (geld) begrenst de eerste betaalde voorinvulling tot $1; Gate C (toetsset) is een gecontroleerde poort in de code vóór de training. Glas en het verpakkingspictogram blijven buiten de proef.


## Boundaries & Constraints

**Always:**
- Meetregels zoals bij de andere keurmerken: aanwezigheid per etiket, Wilson-grenzen, stoppunt 2 bij minder dan 16 bevestigde etiketten mét, en "te weinig voorbeelden" bij minder dan 35 zonder (meetregels §4 en §7).
- Scheiding training/toets per leverancier (GLN), voor alle keurmerken tegelijk (toetsset §2): een productlijn van één leverancier komt niet in beide sets. De vijf trainingsleveranciers van 31-10 blijven; de glutenvrij-rij voegt er geen toe en verwijdert er geen.
- Elke betaalde aanroep voor glutenvrij alleen binnen de cap van Gate B ($1 voor deze stap, in een eigen post, inclusief de zdr-proef). De cap is een totaal over de post; per aanroep wordt er gecontroleerd met een reserve van $0,05 (RESERVE_R10), dus de aanroepen stoppen bij $0,95 en één aanroep kan de $1 niet passeren zolang hij minder dan de reserve kost. Er is geen startprojectie over alle etiketten.
- De voorinvulling glutenvrij werkt de 352 etiketten in deze volgorde af: eerst de 17 met glutenvrij-declaratie, daarna de rest. Zo dekt de cap van $1 de 17 eerst.
- OFF-beelden vallen buiten de GLN-scheiding (ze hebben geen GLN); hun scheiding van de toets loopt via de lekregel (toets-GTIN en toetsleverancier).
- Elke training met glutenvrij-beelden alleen na Gate C (de poort in de code).
- De route `voorinvulling-r10` leest noch schrijft een Sonnet-bestand; overgeslagen etiketten komen uit de eigen r10-bestanden (`voorinvulling-r10-claude-haiku-5-5.json`).

**Never:**
- Geen betaalde aanroep die de cap van $1 voor glutenvrij zou passeren. `--grens` boven $1 wordt door de route altijd geweigerd: een hogere cap vraagt een nieuw besluit van Friso én een codewijziging, geen opdrachtregelvlag.
- Geen training in deze ronde. Geen wijziging aan de live pagina op :8767 en geen herstart van de live server. Niet aan de hoofdmap, niet aan de Sonnet-bestanden (`voorinvulling.json`, `items.json`, `zdr-proef.json`, `voorinvulling-r9.json`, `items-r9.json`) of aan de bestanden van de stap-3- en r9-post.
- Geen OFF-beeld dat de lekregel niet haalt (toets-GTIN of toetsleverancier), ook niet zonder Gate A.
- COELIAC telt niet mee zonder een apart besluit van Friso.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| glutenvrij op de toetsset | 17 toetsetiketten met de declaratie | klasse en keurmerk staan op de pagina, niet bevestigd | — |
| bevestigd met glutenvrij | Friso kiest mét of zonder per etiket | opgeslagen in `uitslag.json` volgens het schema | onbekende code wordt geweigerd |
| minder dan 16 bevestigde mét | rapport na bevestiging | stoppunt 2 voor glutenvrij, geen besluit | meldt het aantal, besluit bij Friso |
| minder dan 16 na voorinvulling | voorinvulling klaar, vóór bevestiging | stoppunt 2 gemeld, geen aanvulling zonder besluit | terug naar Friso |
| COELIAC op de toetsset | 2 etiketten met COELIAC | niet gemeten, niet in de klassenlijst | — |
| voorinvulling glutenvrij boven de cap | verwachte uitgave of werkelijke kosten boven $1 | run stopt vóór de eerstvolgende betaalde aanroep (exit ≠ 0) | melden, nieuw besluit nodig |
| training zonder Gate C | minder dan 16 bevestigde mét of geen bevestiging | training weigert te starten | melding met het aantal |
| OFF-glutenbeeld met toets-GTIN | record heeft een toets-GTIN | afgevallen (reden `toets_gtin`) | niet opnemen |
| verpakkingsclaim glas of pictogram | bron levert VERPAKKING GLAS of VERPAKKING-pictogram | niet als keurmerk gemeten | uitgesloten in de meetlijst |

</frozen-after-approval>

## Code Map

- `train.py` -- `KLASSEN` (17 nu, 18 na ronde 10), `CATEGORIEEN`; nieuwe poort `poort_glutenvrij` vóór de training
- `uitslag.py` -- `NIEUW_R9` (4 codes) en `KEURMERKEN` (13 nu); nieuwe `NIEUW_R10 = ("DIET_FREE_FROM_GLUTEN",)`; 14 keurmerken na de bouw
- `toets.py` -- `voorinvulling-r9` als model voor de nieuwe route; `bestandsnaam(basis, model)` (per model); `CODES`; `GRENS_VOORINVULLING`
- `off.py` -- `ZOEK` (klasse-naar-zoekterm; glutenvrij erbij), `record_reden` (lekregel), `ophalen`
- `scheiding.py` -- glutenvrij-rij; uitsluiting van glas en verpakkingspictogram in de meetlijst
- `invul/server.py`, `invul/index.html` -- 14 keurmerkrijen (de pagina wordt in deze ronde niet gewisseld)
- Niet wijzigen: `openrouter.py` (zdr-gedrag), `kosten.py` (behalve het tarief, dat al staat), `beelden.py`

## Tasks & Acceptance

**Execution:**
- [ ] ATDD: falende tests per poort en per bouwonderdeel met `bmad-testarch-atdd` vóór de bouw
- [ ] `uitslag.py`, `toets.py` -- `NIEUW_R10`, de route `voorinvulling-r10` met Haiku, eigen bestanden en de eigen post met cap $1
- [ ] `train.py` -- glutenvrij als 18e klasse; `poort_glutenvrij` (Gate C) vóór de training
- [ ] `off.py` -- glutenvrij-zoekterm voor Crossed Grain; lekregel ongewijzigd toegepast. AC: Given een OFF-record met de glutenvrij-zoekterm, when het wordt opgehaald, then is de klasse `DIET_FREE_FROM_GLUTEN`.
- [ ] `scheiding.py` -- glutenvrij-rij; glas en verpakkingspictogram uitgesloten in de meetlijst
- [ ] `meetregels.md`, `toetsset.md`, `DRAAIPLAN.md`, `randvoorwaarden.md` -- glutenvrij, kosten, poorten, bekend licentierisico; de sleutelkolom-tekst in `toetsset.md` (waarschuwing hieronder) gelijk trekken

**Acceptance Criteria:**

- Gate A (licentie, opgeheven door Friso 03-11-2026):
  - Given de glutenvrij-trainingsset met de bronnen OFF (lekregel gehaald), Roboflow "Gluten Free" en de set van 469, when de training start, then staat in de trainingsresultaten het bekende licentierisico met de vier punten en hun bron (veld `bekende_risico`).
  - Given een OFF-glutenbeeld dat de lekregel haalt, when het wordt opgenomen, then wordt het opgenomen en de bron ervan geregistreerd (geen weigering op licentie).
- Gate B (geld, cap $1):
  - Given de route `voorinvulling-r10` zonder `--besluit`, when de cap wordt bepaald, then is de grens $1 en wordt de post "voorinvulling glutenvrij (gate B)" gebruikt (eigen grootboek; de post "voorinvulling toets" blijft $63,38).
  - Given de werkelijke kosten van de volgende aanroep zouden de cap van $1 passeren, when de run doorgaat, then stopt hij vóór die aanroep (stoppunt 5, exit 2) en er gaat geen aanroep uit. Precies $1,00 mag nog; boven $1,00 stopt de run.
  - Given de run is gestart, when de voorinvulling van de 17 glutenvrij-etiketten klaar is, then staan die vóór de rest in de volgorde (test op de volgorde, niet op de kosten).
  - Given een betaalde aanroep slaagt maar het grootboek kan niet worden geschreven, when de run stopt, then meldt hij het bedrag; een herstart telt dat bedrag niet opnieuw.
  - Given de route `voorinvulling-r10` met Haiku, when het antwoord wordt opgeslagen, then staat het in `voorinvulling-r10-claude-haiku-5-5.json` en wordt geen Sonnet-bestand geopend (lezen noch schrijven).
  - Given `--grens` boven $1 voor de route `voorinvulling-r10`, when de opdracht wordt geparset, then weigert hij, tenzij er een nieuw besluit van Friso wordt meegegeven.
- Gate C (toetsset):
  - Given de training met glutenvrij als klasse, when er minder dan 16 bevestigde etiketten mét zijn, then weigert `poort_glutenvrij` te starten en noemt het aantal.
  - Given 16 of meer bevestigde mét voor `DIET_FREE_FROM_GLUTEN`, when de poort draait, then slaagt hij voor dat deel.
  - Given minder dan 35 bevestigde etiketten zonder glutenvrij (meetregels §4 en §7), when de training start, then weigert `poort_glutenvrij` en noemt het aantal.
  - Given `toets/uitslag.json` ontbreekt of is onleesbaar, when de poort draait, then weigert hij (fail-closed).
  - Given minder dan 16 mét na de voorinvulling en vóór de bevestiging, when de voorinvulling klaar is, then meldt het stoppunt 2 en start het geen aanvulling zonder besluit.
  - Given de glutenvrij-rij op de pagina, when Friso er niet op bevestigt, then telt het keurmerk niet mee in de uitslag.
- Scope:
  - Given een bron met VERPAKKING GLAS of het VERPAKKING-pictogram, when de klasse-tabel wordt opgebouwd, then staat die code niet in de meetlijst. Testgeval met een verzonnen bronregel; geen eis aan de echte data (de exacte namen staan nog niet vast).
  - Given een etiket met een glas-code én glutenvrij, when het wordt gemeten, then telt het glutenvrij-deel en wordt de glas-code genegeerd (te bevestigen, open vraag 3).
  - Given een OFF-record met een toets-GTIN of een toetsleverancier, when het wordt beoordeeld, then valt het af (`toets_gtin` of `toetsleverancier`).
- Aantallen:
  - Given de klassenlijst na de bouw, when de tests draaien, then zijn er 18 klassen en 14 keurmerken (Nutri-Score telt als één keurmerk met letters A–E).

## Gates

### Gate A: licentie (opgeheven door Friso, 03-11-2026)

Friso heeft Gate A opgeheven als eigen besluit, met de woorden: "Doe de training van glutenvrij sowieso. Ik bevestig dat dat kan." De licentierisico's blijven bekend en vormen geen blokkade; ze staan in de trainingsresultaten.

**Bekend risico (niet blokkerend):** Crossed Grain staat in de bron [85] (`datasets-keurmerken-2026-11-01.md`, sectie Crossed Grain) als: "can only be used under licence on food and drink products". In de Open Food Facts-database staan 1.447 Crossed Grain-logo's en 21.132 "no gluten"-labels (research 2026-11-01, `research.md`, regels 139 en 96; dit zijn tellingen van de database, niet van een gedownloade set). Glutenvrij-bronnen met een eigen licentie: de Roboflow-set "Gluten Free" (200; licentie niet geverifieerd, zie bron [63] in de research) en de set van 469 beelden met glutenvrij (licentie "MIT"). Voor Rainforest Alliance geldt een aparte regel voor interne training [77]; voor Crossed Grain is die niet nagekeken. Dit risico is open en niet door de build opgelost:
1. De gebruiksvoorwaarden van Crossed Grain: of intern trainen als gebruik geldt.
2. De licentie van de Roboflow-set en de set van 469 beelden: of die de logo-rechten dekken.
3. Of de OFF-foto's van glutenvrije verpakkingen de Crossed Grain-merknaam tonen, en of de fotolicentie (CC BY-SA) het merk dekt.
4. Het besluit van Friso met bron en datum (het besluit van 03-11-2026 staat hierboven).

### Gate B: geld (cap $1 voor deze stap)

**Besluit Friso (03-11-2026):** voorinvulling glutenvrij met Haiku (`anthropic/claude-haiku-5.5`), cap $1 voor deze stap. Voorlabels voor glutenvrij blijven buiten deze stap.

**Raming (INFERENCE):** Haiku kostte in de vergelijking van 03-11 $0,17 voor 19 etiketten (`.memlog.md` van de proef, regel van 03-11), dus ±$0,009 per etiket. Voor 352 etiketten: ±$3,1. Met de cap van $1 stopt de run daarmee naar verwachting na ±110 etiketten; de 17 met glutenvrij-declaratie zitten dan vooraan, dus die zijn ruim binnen de cap (±$0,15). De rest blijft open tot een nieuw besluit.

**Saldo (VERIFIED, alleen-lezen creditendpoint, 03-11-2026):** total_credits 2922,0035 min total_usage 2915,1473 = $6,8562. De opdracht noemde ±$7,73; het verschil is niet uitgezocht en verandert het besluit niet.

**Post en grootboek:** een eigen post "voorinvulling glutenvrij (gate B)" in `uitgaven.json`, begin $0. De post "voorinvulling toets" blijft op $63,38 (grens $73) en wordt niet gebruikt.

**Stopregel:** de cap wordt per aanroep afgedwongen; de run stopt vóór de eerstvolgende betaalde aanroep die de cap van $1 zou passeren. De cap meet `usage.cost` uit het antwoord, met tokens × tarief als terugval. Bij de eerste betaalde aanroep meldt de build de werkelijke kosten per etiket.

**Voorbehoud (open, niet opgelost):** `randvoorwaarden.md` §3 noemt $0,12 per etiket voor Sonnet als gemeten; het memlog van 03-11 (`.memlog.md` van de proef) noemt $0,076 per etiket (run van $22,93 voor 301 etiketten). Beide bronnen blijven genoemd tot er een besluit is.

### Gate C: toetsset (training pas na bevestiging)

Op de toetsset staan 17 etiketten met glutenvrij. Telling op `doc_id` (gemeten 03-11-2026): 17 van de 352 toetsdocumenten hebben glutenvrij in `dieet`; 340 toetsdocumenten staan in de declaratiedata en 12 niet. Voor 16 bevestigde etiketten mét moet het logo op 16 van 17 echt zichtbaar zijn, dus op 94% of meer. Dat is zeer waarschijnlijk stoppunt 2 (INFERENCE, naar analogie van PlanetProof en V-label in `toetsset.md`).

**Stopregel (in de code):** `poort_glutenvrij` in `train.py` weigert de training zolang er minder dan 16 bevestigde etiketten mét voor `DIET_FREE_FROM_GLUTEN` in `toets/uitslag.json` zijn, of minder dan 35 bevestigde etiketten zonder glutenvrij, of als het bestand ontbreekt of onleesbaar is. Tot die tijd is alleen voorbereiden toegestaan. Friso bevestigt de glutenvrij-rij op de pagina. Met de cap van $1 worden naar verwachting maar weinig etiketten voorgevuld; de 16 mét hangen dus af van de bevestiging van Friso, niet van de voorinvulling alleen.

## Gemeten feiten (03-11-2026)

| Feit | Waarde | Herkomst |
|---|---|---|
| Glutenvrij-declaraties op de toetsset | 17 unieke documenten | `doc_id` in de declaratiedata tegen `toets/toets-docs.json`, kolom `dieet` |
| Controle van de methode | FSC 56, Triman 51, kunststofcode 23, PlanetProof 29 | zelfde join, kolom `t3777`; komt overeen met `toetsset.md` |
| COELIAC op de toetsset | 2 documenten | zelfde methode, niet meetellen |
| Glutenvrij in de hele declaratiedata | 650 regels | kolom `dieet` |
| Toetsdocumenten in de declaratiedata | 340 van 352 | `doc_id` |
| Crossed Grain in Open Food Facts | 1.447 logo's | research 2026-11-01, regel 139 |
| "no gluten" in Open Food Facts | 21.132 | research 2026-11-01, regel 96 |
| Verpakkingscodes glas en pictogram | niet gevonden | niet in de declaratiedata en niet in de proefdocumenten (twee routes); de enige pictogramcode is `NO_PICTOGRAM`, geen verpakkingscode |
| Restant voorinvulling toets | $9,62 (uitgegeven $63,38) | `uitgaven.json`, 03-11-2026 09:16 |
| Saldo OpenRouter | $6,8562 (2922,0035 − 2915,1473) | creditendpoint, alleen-lezen, 03-11-2026 |

> [!warning]
> De tekst in `toetsset.md` (regel 108) zegt "kolom `t3777` tegen `toets/toets-docs.json`". Dat geldt voor de keurmerken; de join loopt via `doc_id`, en glutenvrij staat in `dieet`. Gelijk te trekken bij de bouw.

## Open Questions

Deze vragen liggen bij Friso. De hoofdsessie legt ze voor via het keuzemenu, met de aanbeveling vooraan. De vragen over Gate A, Gate B en de hoeveelheid bedrag zijn door Friso beantwoord (zie Intent).

1. Als na de eerste $1 minder dan 16 glutenvrij-etiketten mét bevestigd zijn: wachten op een nieuw besluit over meer geld (aanbevolen), of het keurmerk voor deze ronde laten vallen? (Gevolg van wachten: de training blijft geblokkeerd tot het besluit; gevolg van laten vallen: glutenvrij telt niet mee in deze ronde.)
2. COELIAC: meetellen als apart keurmerk, of buiten de proef laten? (Aanbevolen: buiten de proef laten.)
3. Zoekstap (geen beslispunt): de exacte namen van de bronregels voor glas en verpakkingspictogram opzoeken in de bron, zodat ze in de meetlijst kunnen worden uitgesloten. Friso hoeft dat niet te beantwoorden.

## Spec Change Log

- 03-11-2026: eerste versie, op basis van het besluit van Friso (glutenvrij als eigen keurmerk, met de drie gates).
- 03-11-2026 (review-loop 1): tegenlezen met `bmad-review` in een verse subagent, 18 bevindingen (zie Review Triage Log); feitelijke correcties doorgevoerd, keuzes van Friso als open vraag.
- 03-11-2026 (besluiten gates): Gate A opgeheven door Friso (woorden in de Intent); licentierisico als bekend risico. Gate B: voorinvulling glutenvrij met Haiku, cap $1, eigen post. Gate C: poort in de code (16 bevestigde mét). Build-scope en acceptatiecriteria bijgewerkt; de vragen over Gate A, B en het bedrag zijn beantwoord.
- 03-11-2026 (review-loop 2, `bmad-review` in een verse subagent, zeven blokkerende punten): cap per aanroep in plaats van startprojectie (voorinvulling-r10 rekent geen $0,06 per aanroep); volgorde met de 17 glutenvrij-etiketten eerst; Sonnet-bestanden niet gelezen; 35-zonder-eis en fail-closed in de poort; `--grens` boven $1 geweigerd; Gate A-AC op de bronnen; saldo exact ($6,8562, eerder afgerond op een ander getal). Klein en cosmetisch doorgevoerd (bronverwijzingen naar de research en het memlog, zoekstap als geen beslispunt, toelichting op stoppunt en exit).

## Review Triage Log

Review-loop 1, `bmad-review` (adversarial, edge-case, structuur, taal; verification-gap alleen voor code, overgeslagen). Verdict per bevinding:

| ID | soort | bevinding (kort) | verdict | bewijs / wat er gebeurt |
|---|---|---|---|---|
| R1 | feit | herkomst van ±$27 in de "Let op" | doorgevoerd, bijgesteld | de reviewer schreef die toe aan ronde 9; niet vastgesteld. Spec noemt alleen het verschil en het restant ($9,62 uit `uitgaven.json`) |
| R2 | feit | raming $8–10 volgt niet uit 352 × $0,02–0,03 | doorgevoerd | $7,04–10,56, nu "±$7–11" (oude Sonnet-raming, vervangen door de Haiku-raming in Gate B) |
| R3 | feit | "de OFF-set telt" is een database-telling | doorgevoerd | tekst bijgesteld naar Open Food Facts-database |
| R4 | feit | "alle 340 van de 352" leest als 340 glutenvrij | doorgevoerd | 17 van 352; 340 in de declaratiedata; 12 niet |
| R5 | feit | scheiding "op productlijn" | doorgevoerd | scheiding per leverancier (GLN), toetsset §2 |
| R6 | feit | 35-zonder-grens ontbreekt | doorgevoerd | meetregels §4 toegevoegd |
| R7 | feit | glas/pictogram-codes niet in de data | doorgevoerd | AC getest met verzonnen regel; exacte namen open (vraag 3) |
| R8 | ontwerp | Gate A stopregel noemt stap 1–3, niet 4 | doorgevoerd, daarna vervallen | Gate A is opgeheven; de vier punten staan als bekend risico |
| R9 | ontwerp | Gate B AC mengt restant en grens | doorgevoerd | AC gesplitst naar verwachte uitgave boven de cap, en de eigen post |
| R10 | ontwerp | voorlabels vallen buiten Gate B | doorgevoerd | voorlabels blijven buiten deze stap (Gate B) |
| R11 | ontwerp | stoppunt 2 ook vóór bevestiging | doorgevoerd | extra AC en stopregel in Gate C |
| R12 | ontwerp | aanvullen na bevestiging is standaard | doorgevoerd | open vraag 1 onderscheidt de twee; het getal "186" niet overgenomen (niet door mij nagekeken) |
| R13 | ontwerp | glutenvrij-rij mag geen trainingsleverancier wijzigen | doorgevoerd | constraint in Always |
| R14 | ontwerp | wat als Gate A openstaat tijdens training | vervallen | Gate A is opgeheven door Friso |
| R15 | testbaarheid | AC's onduidelijk of ontbrekend | doorgevoerd | 14/18-AC; :8767 in Never; Gate-AC's testbaar gemaakt |
| R16 | structuur | ATDD-stap ontbreekt in Tasks | doorgevoerd | taak toegevoegd |
| R17 | taal/feit | "kan niet volledig betaald worden" rust op AANNAME | doorgevoerd, daarna bijgesteld | saldo nu geverifieerd ($6,86, creditendpoint) |
| R18 | taal | vaktermen in de tekst voor Friso | deels doorgevoerd | de keuzevragen in gewone woorden; de technische secties blijven voor de bouwers |

Verdict-samenvatting (review-loop 1): 18 bevindingen, 16 doorgevoerd (R15 en R18 deels), 0 verworpen. De besluitwijziging van 03-11 (Gate A opgeheven, cap $1, Gate C in de code) heeft R8, R14 en R17 deels overbodig gemaakt; dat is in de Change Log vastgelegd.

## Verification

**Commands:**
- Telling van de toetsset: `python3 -I` met `json.load` van `toets/toets-docs.json` en `csv.DictReader` op de declaratiedata, tellen op `doc_id` en kolom `dieet`; het script hoort niet in de repo. Uitkomst in "Gemeten feiten".
- Saldo (alleen-lezen): `GET https://openrouter.ai/api/v1/credits` met de sleutel uit de omgeving; geen betaalde aanroep.
- Na de bouw: de bestaande testsuite van de proef plus de nieuwe tests per poort (ATDD vóór de bouw).

## Bouwroute (poort, 03-11-2026)

- **Open vragen (bouwgate):** geen die de bouw blokkeren; de vier open vragen hierboven gaan naar Friso via de hoofdsessie en blokkeren alleen de training (Gate C), niet de code.
- **Onomkeerbaar:** nee voor de bouw (code en tests). De betaalde voorinvulling valt buiten de bouw en draait pas na de bouw, met de cap van $1.
- **Omvang:** groot (meer dan vijf bestanden, en nieuwe functies die andere code aanroepen: `poort_glutenvrij`, `volgorde_r10`, `voorinvulling-r10`, `klasse_tabel`).
- **Route: dispatch.** De implementatie gaat naar een verse subagent met de spec als enige bron (implementation_handoff). Reviewlagen: Blind Hunter, Edge Case Hunter, Verification Gap, op de diff.
- **Tests:** `tests/test_ronde10_glutenvrij_20261103.py` in de proefmap; rood vastgelegd op 03-11-2026: 11 rood, 1 groen (back-compat van bestaande bevestigingen). Commando: `cd <proefmap> && uv run pytest tests/test_ronde10_glutenvrij_20261103.py -v`.
- **Ontwerpkeuze uit de bouwgate (te bevestigen door de hoofdsessie):** `KEURMERKEN_LOS` blijft 12; glutenvrij komt via `NIEUW_R10` erbij als toegestane sleutel, zonder de verplichte set te veranderen. Zo blijven bestaande bevestigingen geldig. De volledige `KEURMERKEN` telt 14.

## Besluiten Friso (04-11-2026)

1. Trace: twee controles toegevoegd (G-B9, G-B10); tweede trace PASS voor de betaalde route (deel 1). Rapport: `test-artifacts/traceability/traceability-glutenvrij-ronde10-20261104.md`.
2. Pagina: nieuwe rij voor glutenvrij op de HUIDIGE pagina; bevestigingen blijven staan. Eén herstart van de server is goed; meld wanneer en hoe, en controleer daarna dat `/stand` het aantal bevestigde etiketten gelijk houdt. De rij wordt voorbereid; pas wisselen na de betaalde stap en op opdracht van Friso.
3. Scheiding: glutenvrij-voorbeelden alleen uit openbare beelden; de toetsset blijft zoals die is. De poort zit in de dataset-bouwer (`echt.py`), niet in `train()`; de rooktests zijn uitgezonderd.

Daarmee vervalt de AC "training weigert" als eis aan `train()`; de AC wordt "dataset-bouw met glutenvrij-beelden weigert zonder bevestiging". Die AC moet nog een test krijgen die via `echt.py` loopt.

## Open punten na de bouw (ronde 10, 03-11-2026)

Gevonden bij de review van de bouw. Ze blokkeren de betaalde voorinvulling niet, maar wel de training of de bevestiging. Elk punt heeft een eigenaar.

1. **Gate C in de trainer:** `poort_glutenvrij` wordt nu aangeroepen bij het bouwen van de dataset (`echt.py`), niet in `train()`. De trainingsstart kan dus langs de poort. Eigenaar: de hoofdsessie; oplossing vóór de eerste training: de poort ook in `train()` zetten en de rooktests (die hun eigen mini-set bouwen) uitzonderen met een expliciete vlag.
2. **Glutenvrij-rij op de invulpagina:** de pagina (`invul/index.html`, `invul/server.py`) toont geen glutenvrij-rij; zonder die rij kan Friso geen glutenvrij-mét bevestigen, en dan haalt Gate C nooit 16. De live pagina op :8767 mag niet wisselen. Eigenaar: Friso (welke pagina krijgt de rij) en de hoofdsessie.
3. **Scheiding (bevroren):** `scheiding.py` heeft geen glutenvrij-rij; de twee tests die de rijen vastleggen zijn daarop aangepast. Of glutenvrij-positieven zonder rij gescheiden blijven, is niet nagegaan. Eigenaar: de hoofdsessie, met toetsset §7 als maatstaf.
4. **Bekend licentierisico in de trainingsresultaten:** het veld `bekende_risico` bestaat nog niet in de code; het hoort bij de eerste training met glutenvrij-beelden.
5. **Glas en pictogram:** `scheiding.klasse_tabel` heeft nog geen aanroeper; de exacte bronnamen staan niet vast (open vraag 3).
6. **Grootboek-storing na een betaalde aanroep:** als het grootboek niet geschreven kan worden nadat een aanroep betaald is, gaat het antwoord verloren en betaalt een herstart opnieuw (één etiket, circa $0,01). Dit zit in `openrouter.py`, dat in deze ronde niet gewijzigd mag worden. Gemeld; eigenaar: de hoofdsessie, bij een latere ronde.
7. **Rapport leest de r10-uitvoer niet:** `toets.py rapport` leest alleen de stap-3- en r9-bestanden. Glutenvrij staat daardoor op 0 mét en geeft stoppunt 2; dat is juist zolang er geen bevestigingen zijn, maar de waarschijnlijk-aanwezig-telling van de voorinvulling ontbreekt in het rapport. Eigenaar: de hoofdsessie.

## Review-samenvatting ronde 10 (review van de bouw, 03-11-2026)

Drie reviewlagen op de diff (Blind Hunter, Edge Case Hunter, Verification Gap). De bevindingen zijn getriageerd:
- Doorgevoerd en getest: cap met reserve (F1), zdr-proef op het grootboek (F2), model vastgezet op Haiku (F3), Gate C telt zoals de uitslag (F4), route-tests voor post, cap, volgorde, zdr-boeking, modelpin en OFF-herkenning (F5).
- Uitgesteld met melding: punten 1 t/m 7 hierboven.
- Verworpen: geen.
- De spec-tekst over de cap en `--grens` is aangepast aan de code (zie Never en Gate B).
