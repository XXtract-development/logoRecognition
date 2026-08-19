# Nulmeting keurmerkherkenning — 27 juli 2026

Eerste gemeten nullijn van de herkenning (stap 7 van de keurmerk-matrix). Uitgevoerd
met de ECHTE poortfunctie `measureBatch(..., 'nulmeting')` uit
`apps/api/src/services/flywheel/gate.ts`, zodat de meetdefinitie identiek is aan die
van de vliegwiel-poort. Geen schaduwset, geen schrijfacties.

## Uitgangssituatie

| | |
|---|---|
| Echte uitsneden (referenties) | 466, **allemaal met embedding** (geen gat) |
| Keurmerken met 3+ uitsneden (rangschik-stand) | 36 |
| Keurmerken met gidslogo | 53 |
| Gold-set totaal | 813 records (721 ECHT / 92 VALS) |
| Gold-set met crop (de meetbare set) | 580 (489 ECHT / 91 VALS) |
| Reviewwachtrij | leeg |

## Resultaat per drempel

`ECHT` = keurmerk staat er echt op → correct als een referentie van dezelfde klasse
de drempel haalt. `VALS` = lookalike → correct als GEEN referentie van die klasse de
drempel haalt.

| Drempel | Totaal | ECHT terecht herkend | VALS terecht genegeerd |
|---|---|---|---|
| 0,75 | 83,8% | 415/489 = **84,9%** | 71/91 = 78,0% |
| **0,80 (LIVE)** | **77,9%** | 377/489 = **77,1%** | 75/91 = **82,4%** |
| 0,85 | 69,7% | 327/489 = 66,9% | 77/91 = 84,6% |
| 0,90 (poortdrempel) | 57,8% | 257/489 = 52,6% | 78/91 = 85,7% |

De live herkenning draait op `CLASSIFY_THRESHOLD_EMBEDDING=0.80` (ACC). De
vliegwiel-poort gebruikt `FLYWHEEL_REGRESSION_THRESHOLD=0.90` — een **ander en
strenger** getal. Dat verschil is geen fout, maar wel belangrijk om te weten: de
poort beoordeelt promoties strenger dan de productie-herkenning matcht.

## Waarom dit een zware test is

- **91 VALS-samples zijn de hardste denkbare tegenvoorbeelden**: het zijn de door de
  PO afgewezen lookalikes (glas-materiaalcodes, Tidyman, verkeerd gekaderde crops).
  Geen willekeurige ruis.
- **Leave-one-out is afgedwongen**: de self-match-guard sluit referenties met
  dezelfde inhouds-hash (en hetzelfde `cropPath`) uit, zodat een gold-set-crop die
  óók referentie is nooit tegen zichzelf matcht. Zonder die guard zou de score
  kunstmatig richting 100% lopen.

## Per klasse op de live drempel (0,80)

38 klassen gemeten: **23 op ≥ 80%**, 15 eronder.

| % | goed/totaal | Klasse |
|---|---|---|
| 25 | 2/8 | LACTOSE_FREE |
| 33 | 1/3 | AGRICULTURE_BIOLOGIQUE |
| 36 | 4/11 | DO_NOT_DRINK_AND_DRIVE_WARNING |
| 50 | 3/6 | TRIMAN |
| 50 | 1/2 | BDIH_LOGO |
| 50 | 3/6 | AISE_1 |
| 52 | 13/25 | FOREST_STEWARDSHIP_COUNCIL_MIX |
| 55 | 6/11 | MINIMUM_DRINKING_AGE_18_WARNING |
| 58 | 36/62 | RECYCLABLE_GENERAL_CLAIM |
| 62 | 29/47 | PREGNANCY_WARNING |
| 63 | 10/16 | VEGAN_SOCIETY_VEGAN_LOGO |
| 67 | 4/6 | FREE_FROM_GLUTEN |
| 67 | 4/6 | CROSSED_GRAIN_SYMBOL |
| 67 | 4/6 | AISE_5 |
| 74 | 23/31 | EU_ORGANIC_FARMING |

## Bevinding: méér referenties is niet de knop

De zwakke klassen hebben géén tekort aan materiaal:

| Klasse | Referenties | Score @0,80 |
|---|---|---|
| RECYCLABLE_GENERAL_CLAIM | 64 | 58% |
| PREGNANCY_WARNING | 30 | 62% |
| VEGAN_SOCIETY_VEGAN_LOGO | 16 | 63% |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 13 | 52% |
| LACTOSE_FREE | 10 | 25% |

RECYCLABLE_GENERAL_CLAIM heeft 64 referenties en haalt 58%. Het knelpunt is dus
**niet het aantal**, maar dat de varianten van hetzelfde keurmerk in de
embedding-ruimte te ver uit elkaar liggen. Nog een oogstronde op dezelfde
declaraties voegt daar weinig aan toe — de laatste ronde leverde 51 nieuwe op 1521
paren, en die paren zijn nu uitgeput.

Dit sluit aan op eerder onderzoek (`project_flywheel_recall_research`,
`project_123_realref_pivot`): het knelpunt zit in hoe varianten gegroepeerd worden,
niet in volume.

## Methodische waarschuwing

Een eerdere versie van deze analyse las de per-klasse-cijfers op drempel 0,90 en
concludeerde dat CERTIFIED_B_CORPORATION (0/5) en AQUACULTURE_STEWARDSHIP_COUNCIL
(1/8) "niet generaliseren". Op de live drempel 0,80 zitten beide **boven de 80%**.
Dat was dus puur een drempel-effect. Per-klasse-cijfers zijn alleen betekenisvol
naast de drempel waarop ze gemeten zijn.

## Openstaand

- Geen "voor"-meting beschikbaar: dit is de eerste nullijn, dus er valt (nog) geen
  verbetering te claimen — alleen een absoluut niveau vast te leggen.
- Keuze voor Friso: de live drempel op 0,80 laten (77% herkend / 82% lookalikes
  geweerd) of naar 0,75 (85% herkend / 78% geweerd). Voor de kruischeck telt een
  vals-positief zwaarder dan een misser, wat vóór 0,80 of hoger pleit.
