---
title: 'Proef getrainde detector ronde 10: glutenvrij als veertiende keurmerk, met drie poorten'
type: 'feature'
created: '2026-11-03'
status: 'draft'
baseline_commit: '0852840'
route: 'spec'
review_loop_iteration: 1
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

**Approach:** Eén nieuw keurmerk en één nieuwe klasse, op de bestaande toetsset en met dezelfde meetregels als de andere keurmerken. Drie poorten, elk met een stopregel: Gate A (licentie) vóór elke training met glutenvrij-beelden, Gate B (geld) vóór de eerste betaalde voorinvulling en de voorlabels, Gate C (toetsset) bij de bevestiging op de pagina. Glas en het verpakkingspictogram blijven buiten de proef.

## Boundaries & Constraints

**Always:**
- Meetregels zoals bij de andere keurmerken: aanwezigheid per etiket, Wilson-grenzen, stoppunt 2 bij minder dan 16 bevestigde etiketten mét, en "te weinig voorbeelden" bij minder dan 35 zonder (meetregels §4 en §7).
- Scheiding training/toets per leverancier (GLN), voor alle keurmerken tegelijk (toetsset §2): een productlijn van één leverancier komt niet in beide sets. De vijf trainingsleveranciers van 31-10 blijven; de glutenvrij-rij voegt er geen toe en verwijdert er geen.
- Elke betaalde aanroep (voorinvulling én voorlabels) alleen na het besluit van Gate B; elke training met glutenvrij-beelden alleen na Gate A.

**Never:**
- Geen OFF- of ander glutenvrij-beeld in de trainingsset zolang Gate A niet is afgerond (ook niet via het ophalen van de OFF-set, de Roboflow-set of de 469-beelden-set).
- Geen betaalde aanroep voor glutenvrij zonder bijstorting (Gate B).
- Geen wijziging aan de live pagina op :8767 (ronde-9-versie met Friso's bevestigingen), niet aan de hoofdmap, niet aan `uitgaven.json` of de bestanden onder `~/logo-meetset-20261018/`.
- COELIAC telt niet mee zonder een apart besluit van Friso.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| glutenvrij op de toetsset | 17 toetsetiketten met de declaratie | klasse en keurmerk staan op de pagina, niet bevestigd | — |
| bevestigd met glutenvrij | Friso kiest mét of zonder per etiket | opgeslagen in `uitslag.json` volgens het schema | onbekende code wordt geweigerd |
| minder dan 16 bevestigde mét | rapport na bevestiging | stoppunt 2 voor glutenvrij, geen besluit | meldt het aantal, besluit bij Friso |
| minder dan 16 na voorinvulling | voorinvulling klaar, vóór bevestiging | stoppunt 2 gemeld, geen aanvulling zonder besluit | terug naar Friso |
| COELIAC op de toetsset | 2 etiketten met COELIAC | niet gemeten, niet in de klassenlijst | — |
| voorinvulling vóór bijstorting | Gate B niet afgerond | geen betaalde aanroep | stoppen, terugvragen |
| OFF-glutenbeelden in de trainingsset | Gate A niet afgerond | niet opnemen | blokkade training |
| verpakkingsclaim glas of pictogram | bron levert VERPAKKING GLAS of VERPAKKING-pictogram | niet als keurmerk gemeten | uitgesloten in de meetlijst |

</frozen-after-approval>

## Code Map

- `train.py` -- `KLASSEN` (17 nu, 18 na ronde 10), `VARIANTEN`, `CATEGORIEEN`
- `toets.py` -- `voorinvulling`, `rapport` (13 → 14 keurmerken), opdrachtregel
- `uitslag.py` -- `valideer`, `per_keurmerk`, `stand`
- `invul/server.py`, `invul/index.html` -- 14 keurmerkrijen, `bevestigde_codes`, glutenvrij-rij
- `scheiding.py` -- glutenvrij-rij; uitsluiting van glas en verpakkingspictogram
- `off.py` -- klasse-naar-OFF-tabel (glutenvrij alleen na Gate A)
- Niet wijzigen: `openrouter.py`, `kosten.py`, `beelden.py`

## Tasks & Acceptance

**Execution:**
- [ ] Gate A: licentie Crossed Grain en de andere glutenvrij-bronnen nagaan (zie Gate A) en het besluit vastleggen in het besluit-log van de proef -- vóór elke training met glutenvrij-beelden
- [ ] Gate B: bijstorting vragen aan Friso (zie Gate B) -- vóór de eerste betaalde voorinvulling of voorlabels voor glutenvrij
- [ ] Gate C: glutenvrij-rij op de pagina laten bevestigen door Friso (zie Gate C)
- [ ] ATDD: falende tests per gate schrijven met `bmad-testarch-atdd` vóór de bouw
- [ ] `train.py`, `toets.py`, `uitslag.py`, `invul/` -- glutenvrij als 14e keurmerk en 18e klasse (de trainingsset pas na Gate A)
- [ ] `scheiding.py` -- glutenvrij-rij; glas en verpakkingspictogram uitgesloten in de meetlijst
- [ ] `meetregels.md`, `toetsset.md`, `DRAAIPLAN.md`, `randvoorwaarden.md` -- glutenvrij, kosten, poorten; de tekst over de sleutelkolom in `toetsset.md` (zie waarschuwing hieronder) gelijk trekken

**Acceptance Criteria:**

- Gate A (licentie):
  - Given een trainingsset met glutenvrij-beelden, when de training start, then is er een besluit-log met de licentiecheck van Crossed Grain (voorwaarden voor voedings- en drankproducten, en of intern trainen als gebruik geldt) en de bron van elk glutenvrij-beeld.
  - Given Gate A is niet afgerond, when de OFF-set of een andere glutenvrij-bron wordt meegenomen, then weigert het gereedschap die toevoeging (test met een verzonnen set).
  - Given Gate A is niet afgerond, when de training met 17 klassen wordt gestart, then gaat glutenvrij niet mee (keuze K4, zie Open Questions).
- Gate B (geld):
  - Given Gate B is niet afgerond, when `toets.py` de voorinvulling of de voorlabels voor glutenvrij start, then gebeurt er geen betaalde aanroep en stopt het met een terugvraag.
  - Given de bijstorting is bevestigd, when de verwachte uitgave boven $73 uitkomt of boven het restant van de post, then start de post niet (stoppunt 5, exit ≠ 0).
- Gate C (toetsset):
  - Given de glutenvrij-rij op de pagina, when Friso er niet op bevestigt, then telt het keurmerk niet mee in de uitslag.
  - Given minder dan 16 bevestigde etiketten mét, when het rapport draait, then meldt het stoppunt 2 voor glutenvrij.
  - Given minder dan 16 etiketten mét na de voorinvulling en vóór de bevestiging, when de voorinvulling klaar is, then meldt het stoppunt 2 en start het geen aanvulling zonder besluit.
- Scope:
  - Given een bron met VERPAKKING GLAS of het VERPAKKING-pictogram, when de klasse-tabel wordt opgebouwd, then staat die code niet in de meetlijst. Test met een verzonnen bronregel; de exacte namen staan nog niet vast (open vraag 5).
- Aantallen:
  - Given de klassenlijst na de bouw, when de tests draaien, then zijn er 18 klassen en 14 keurmerken (Nutri-Score telt als één keurmerk met letters A–E).

## Gates

### Gate A: licentie (vóór elke training met glutenvrij-beelden)

**Risico:** Crossed Grain staat in de bron [85] als: "can only be used under licence on food and drink products". In de Open Food Facts-database staan 1.447 Crossed Grain-logo's en 21.132 "no gluten"-labels (research, regels 139 en 96; dit zijn tellingen van de database, niet van een gedownloade set). Glutenvrij-bronnen met een eigen licentie: de Roboflow-set "Gluten Free" (200; licentie niet geverifieerd [63]) en de set van 469 beelden met glutenvrij (licentie "MIT"). Voor het keurmerk Rainforest Alliance geldt een aparte regel voor interne training [77]; voor Crossed Grain is die niet nagekeken.

**Na te kijken voordat er getraind wordt:**
1. De gebruiksvoorwaarden van Crossed Grain: of intern trainen van een model als gebruik geldt, en of dat voor de proef (niet-publiek, niet verkocht) mag.
2. De licentie van de Roboflow-set "Gluten Free" en van de set van 469 beelden: of die de logo-rechten dekken, niet alleen de foto's.
3. Of de OFF-foto's van glutenvrije verpakkingen de Crossed Grain-merknaam tonen, en zo ja, of de fotolicentie (CC BY-SA) het merk niet dekt.
4. Het besluit van Friso, vastgelegd met de bron en de datum.

**Stopregel:** zolang 1 t/m 4 niet zijn afgerond, geen glutenvrij-beeld in de trainingsset. De toetsset (17 etiketten) is geen training en mag wel gebruikt worden.

### Gate B: geld (vóór de eerste betaalde aanroep)

**Raming:** ±$7–11 voor de voorinvulling van één extra keurmerk op 352 etiketten, zonder lege tegels (352 × $0,02–0,03). De voorlabels voor glutenvrij zijn een tweede betaalde post; die raming is in deze spec niet gemaakt en moet vóór Gate B alsnog komen.

**Stand (gemeten 03-11-2026, `uitgaven.json`, gewijzigd 09:16):** $63,38 van de post voorinvulling; restant $9,62 onder de grens van $73 (hard). Het saldo van OpenRouter is volgens de opdracht ±$7,73 (AANNAME: niet nagekeken in deze spec). Bij dat saldo is de raming niet te dekken zonder bijstorting.

**Let op:** `randvoorwaarden.md` §3 rekent met $36,39 gebruikt en restant $36,61. Dat is achterhaald; het verschil met `uitgaven.json` (±$27) is niet naar herkomst vastgesteld. Vóór Gate B gaat `randvoorwaarden.md` §3 mee met de nieuwste bron.

**Stopregel:** geen betaalde aanroep voor glutenvrij (voorinvulling of voorlabels) voordat Friso een bijstorting heeft bevestigd. Bij de eerste betaalde aanroep stoppen, de werkelijke kosten melden en terugvragen.

### Gate C: toetsset (vóór en bij de bevestiging)

Op de toetsset staan 17 etiketten met glutenvrij. Telling op `doc_id` (gemeten 03-11-2026): 17 van de 352 toetsdocumenten hebben glutenvrij in `dieet`; 340 toetsdocumenten staan in de declaratiedata en 12 niet. Voor 16 bevestigde etiketten mét moet het logo op 16 van 17 echt zichtbaar zijn, dus op 94% of meer. Dat is zeer waarschijnlijk stoppunt 2 (INFERENCE, naar analogie van PlanetProof en V-label in `toetsset.md`).

**Stopregel:** na de voorinvulling en vóór de bevestiging meldt het rapport het aantal waarschijnlijke etiketten mét; bij minder dan 16 stopt het bij stoppunt 2 en gaat het terug naar Friso. Friso bevestigt de glutenvrij-rij op de pagina; bij minder dan 16 bevestigde mét is dat opnieuw stoppunt 2. De scheiding wordt niet zelf versoepeld, en een aanvulling vraagt een nieuw besluit.

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
| Restant voorinvulling | $9,62 | `uitgaven.json`, 03-11-2026 09:16 |

> [!warning]
> De tekst in `toetsset.md` (regel 108) zegt "kolom `t3777` tegen `toets/toets-docs.json`". Dat geldt voor de keurmerken; de join loopt via `doc_id`, en glutenvrij staat in `dieet`. Gelijk te trekken bij de bouw.

## Open Questions

Deze vragen liggen bij Friso. De hoofdsessie legt ze voor via het keuzemenu, met de aanbeveling vooraan.

1. Gate A: wie zoekt de licentie na (Friso zelf, of een jurist via de juridische skill)? En als die niet vóór de training klaar is: wachten we met de hele training, of trainen we de 17 bestaande klassen zonder glutenvrij? (Aanbevolen: wachten met de hele training, zodat er één model komt.)
2. Gate B: welk bedrag storten we bij voor de voorinvulling en de voorlabels samen? (De raming voor de voorinvulling is $7–11; de voorlabels zijn nog niet geraamd.)
3. Gate C: bij minder dan 16 bevestigde mét na de voorinvulling, wat doen we dan? (Aanbevolen: eerst aanvullen uit de bestaande kandidaten, na een nieuw besluit; de andere optie is het keurmerk zonder besluit laten.)
4. COELIAC: meetellen als apart keurmerk, of buiten de proef laten? (Aanbevolen: buiten de proef laten.)
5. Verpakkingscodes glas en pictogram: heb je de exacte namen uit de bron, zodat ze in de meetlijst kunnen worden uitgesloten? (Aanbevolen: uitsluiten op de bronnamen; de namen aanleveren.)

## Spec Change Log

- 03-11-2026: eerste versie, op basis van het besluit van Friso (glutenvrij als eigen keurmerk, met de drie gates).
- 03-11-2026 (review-loop 1): tegenlezen met `bmad-review` in een verse subagent, 18 bevindingen (zie Review Triage Log); feitelijke correcties doorgevoerd, keuzes van Friso als open vraag.

## Review Triage Log

Review-loop 1, `bmad-review` (adversarial, edge-case, structuur, taal; verification-gap alleen voor code, overgeslagen). Verdict per bevinding:

| ID | soort | bevinding (kort) | verdict | bewijs / wat er gebeurt |
|---|---|---|---|---|
| R1 | feit | herkomst van ±$27 in de "Let op" | doorgevoerd, bijgesteld | de reviewer schreef die toe aan ronde 9; niet vastgesteld. Spec noemt alleen het verschil en het restant ($9,62 uit `uitgaven.json`) |
| R2 | feit | raming $8–10 volgt niet uit 352 × $0,02–0,03 | doorgevoerd | $7,04–10,56, nu "±$7–11" |
| R3 | feit | "de OFF-set telt" is een database-telling | doorgevoerd | tekst bijgesteld naar Open Food Facts-database |
| R4 | feit | "alle 340 van de 352" leest als 340 glutenvrij | doorgevoerd | 17 van 352; 340 in de declaratiedata; 12 niet |
| R5 | feit | scheiding "op productlijn" | doorgevoerd | scheiding per leverancier (GLN), toetsset §2 |
| R6 | feit | 35-zonder-grens ontbreekt | doorgevoerd | meetregels §4 toegevoegd |
| R7 | feit | glas/pictogram-codes niet in de data | doorgevoerd | AC getest met verzonnen regel; exacte namen open (vraag 5) |
| R8 | ontwerp | Gate A stopregel noemt stap 1–3, niet 4 | doorgevoerd | nu 1 t/m 4 |
| R9 | ontwerp | Gate B AC mengt restant en grens | doorgevoerd | AC gesplitst naar verwachte uitgave boven $73 of boven restant |
| R10 | ontwerp | voorlabels vallen buiten Gate B | doorgevoerd | Gate B noemt voorlabels expliciet |
| R11 | ontwerp | stoppunt 2 ook vóór bevestiging | doorgevoerd | extra AC en stopregel in Gate C |
| R12 | ontwerp | aanvullen na bevestiging is standaard | doorgevoerd | open vraag 3 onderscheidt de twee; het getal "186" niet overgenomen (niet door mij nagekeken) |
| R13 | ontwerp | glutenvrij-rij mag geen trainingsleverancier wijzigen | doorgevoerd | constraint in Always |
| R14 | ontwerp | wat als Gate A openstaat tijdens training | doorgevoerd | open vraag 1 (keuze K4) |
| R15 | testbaarheid | AC's onduidelijk of ontbrekend (onzeker, COELIAC, 14/18, :8767) | deels doorgevoerd | 14/18-AC toegevoegd; :8767 staat in Never; onzeker/afwezig-onderscheid bij de bouw in de ATDD-stap |
| R16 | structuur | ATDD-stap ontbreekt in Tasks | doorgevoerd | taak toegevoegd |
| R17 | taal/feit | "kan niet volledig betaald worden" rust op AANNAME | doorgevoerd | voorwaardelijk geformuleerd, AANNAME gemarkeerd |
| R18 | taal | vaktermen in de tekst voor Friso | deels doorgevoerd | in de keuzevragen gewone woorden; de vakterm-lijst in de technische secties blijft (die zijn voor de bouwers) |

Verdict-samenvatting: 18 bevindingen, 16 doorgevoerd (R15 en R18 deels), 0 verworpen, 0 uitgesteld naar de bouw behalve de ATDD-uitwerking.

## Verification

**Commands:**
- Telling van de toetsset: `python3 -I` met `json.load` van `toets/toets-docs.json` en `csv.DictReader` op de declaratiedata, tellen op `doc_id` en kolom `dieet`; het script hoort niet in de repo. Uitkomst in "Gemeten feiten".
- Na de bouw: de bestaande testsuite van de proef plus de nieuwe tests per gate (ATDD vóór de bouw).
