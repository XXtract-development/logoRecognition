---
titel: Trainingsset, detector, herkenning, beoordelaar en vergelijking
hoort-bij: SPEC.md (CAP-4 t/m CAP-8, CAP-12)
datum: 2026-10-31
bijgewerkt: 2026-11-01 (besluit Friso: maat N; ronde 3: verzoekgrootte voorlabels)
---

# Trainingsset, detector, herkenning, beoordelaar en vergelijking

Begrippen: **tegel** = vaste, overlappende uitsnede van het etiket op werkschaal ([toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15)); **vakje** = kader om een keurmerk in een beeld; **AI-vakjes** = vakjes die een taalmodel om elk gevonden keurmerk tekent.

## 1. Klassen

Tien detectorklassen: `EU_ORGANIC_FARMING`, `GREEN_DOT`, `RECYCLABLE_GENERAL_CLAIM`, `NUTRISCORE_A`, `NUTRISCORE_B`, `NUTRISCORE_C`, `PREGNANCY_WARNING`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`, `WEIDEMELK`, `VEGAN_SOCIETY_VEGAN_LOGO`. Gelijkende keurmerken ([meetregels.md §2](meetregels.md#2-de-8-keurmerken-en-hun-gelijkende-keurmerken)) zijn géén klasse; ze komen ongelabeld in de training.

## 2. Logobronnen en referentieplaatjes (buiten de repository, `PROEF_MAP/logos/`)

Bronnen voor de generator, per klasse, in deze volgorde:
1. Officieel of publiek bestand (keurmerkhouder of Wikimedia Commons; alleen intern gebruik).
2. Het GS1 Label Guide-beeld uit de referentiemomentopname.
3. Schone uitsneden uit etiketten van **trainingsleveranciers** (referenties `review-confirmed`/`realref-live-poc` of uitsneden uit §4), alleen als de GTIN bij een trainingsleverancier hoort.

**Verplicht referentieplaatje voor de beoordelaar** (bron 1 of 2; nooit een uitsnede uit een etiket):

| code | referentieplaatje |
|---|---|
| `EU_ORGANIC_FARMING` | Wikimedia `Organic-Logo.svg` (al in de referentieset) |
| `GREEN_DOT` | Wikimedia `The_Green_Dot.svg` (al in de referentieset) |
| `RECYCLABLE_GENERAL_CLAIM` | GS1-gidsbeeld (momentopname) |
| `NUTRISCORE_A/B/C` | referentie `synthetic-nutriscore-bootstrap` per letter (momentopname) of het officiële Nutri-Score-bestand |
| `PREGNANCY_WARNING` | publiek pictogram (nog op te halen; staat niet in de momentopname) |
| `MARINE_STEWARDSHIP_COUNCIL_LABEL` | GS1-gidsbeeld (momentopname) |
| `WEIDEMELK` | GS1-gidsbeeld (momentopname) |
| `VEGAN_SOCIETY_VEGAN_LOGO` | GS1-gidsbeeld (momentopname) |

Ontbreekt een verplicht referentieplaatje bij het bevriezen, dan is dat stoppunt 7 in [SPEC.md](SPEC.md#constraints).

**Varianten** per logo, door de generator afgeleid als het bronbestand ze niet zelf heeft: kleur, zwart-wit (grijswaarden + drempel), lijn (omtrek) en negatief (wit op donker). Voor Nutri-Score per letter de horizontale balk. Per bron vastgelegd in `logos/bronnen.json`: herkomst-URL of referentie-id, sha256, licentie of "alleen intern".

## 3. Nagemaakte beelden (generator, CAP-4)

- **Achtergronden:** echte etiketten van trainingsleveranciers waarop volgens de AI-screening (dezelfde aanroep als §4) **geen van de 8** keurmerken staat. Een achtergrond met een gemeld keurmerk valt af; zo leert de detector een echt keurmerk niet als achtergrond.
- **Plaatsing:** per tegel 1–3 logo's van willekeurige klasse en variant; grootte 40–200 px op werkschaal (echte keurmerken zijn ±80–150 px); kleine draaiing (±5°), lichte vervaging, JPEG-kwaliteit 60–95. Geplakte objecten overlappen elkaar niet. Een logo dat deels buiten de tegel valt, wordt alleen gelabeld als ≥ 60% zichtbaar is; anders wordt het niet geplakt.
- **Elk geplakt exemplaar van een klasse wordt gelabeld** ("half labelen werkt niet").
- **Harde negatieven:** per tegel met kans 0,3 een gelijkend keurmerk ongelabeld meegeplakt, uit referentiebeelden van trainingsleveranciers of GS1-gidsbeelden.
- **Lege tegels:** 0–10% van de tegels zonder enig object (standaard 5%).
- **Uitvoer:** COCO-formaat (`train/` en `valid/` met `_annotations.coco.json`), zoals `rfdetr` dat leest. Vaste seed geeft identieke uitvoer; manifest met sha256 van bronnen en uitvoer.
- Eigen beeldbewerking (Pillow/numpy); geen Albumentations.

## 4. Echte trainingsvoorbeelden (CAP-5)

- **Bron:** gedeclareerde GTIN's van trainingsleveranciers, tot **80 per keurmerk** (zwangerschap: alcoholproducten), plus de docs van trainingsleveranciers uit de fase-B-meetset (die hebben al AI-vakjes). Beelden zoals in [toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15).
- **Voorlabels:** een taalmodel tekent AI-vakjes, op dezelfde manier als variant K1 uit fase B (heel etiket + tegels, antwoordschema met de 10 klassen, gelijkende keurmerken en "ander"); standaard `google/gemini-3.8-flash`, via de gedeelde client, met verzoeken volgens [randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte); kosten en grens volgens [randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14) (start pas na Friso's besluit over de grens).
- **Onzekere vakjes:** een vakje dat het model als onzeker markeert of dat buiten het beeld valt, wordt niet gebruikt, en elke tegel die zo'n vakje raakt gaat niet in de training (anders leert de detector het echte keurmerk als achtergrond).
- Geen verplichte menselijke correctie van trainingsvakjes; de labelruis blijkt uit de validatieset.
- **Validatieset:** per klasse 30% van de echte trainingsetiketten (vaste seed), gesplitst op dHash-cluster zodat bijna-gelijke etiketten aan één kant blijven, met dHash-controle tussen training en validatie. Hij dient voor modelkeuze en drempels; de toetsset wordt daar nooit voor gebruikt.
- **Per keurmerk gerapporteerd:** het aantal echte trainings- en validatie-etiketten en -vakjes dat overblijft na alle uitsluitingen.

## 5. Detector en training (CAP-6)

- **RF-DETR** (`rfdetr`, Apache-2.0), **maat N** (besluit Friso 01-11-2026: eerst alleen N op de Mac). S, M of L, of een GPU, alleen als N op de validatieset de stopregel niet haalt, en dan pas na een nieuw besluit van Friso (stoppunt 1). D-FINE (Apache-2.0) is de gedocumenteerde terugval als RF-DETR niet installeert of niet traint; hij wordt niet gebouwd.
- **Tegels:** tegel 1024 px op werkschaal, overlap 256 px (minstens het grootste logo), modelinvoer = resolutie van de maat.
- **Twee fasen:** eerst op nagemaakte beelden, daarna bijtrainen op echte trainingsvoorbeelden (met een deel nagemaakte beelden erbij). Aantal epochs en de keuze tussen tegel 768/1024/1536 vallen op de validatieset (maat N vast).
- **Hardware:** lokaal op deze Mac (M3 Pro, 18 GB) op de grafische chip (MPS). **Eerst een korte snelheidsmeting** (± 50 iteraties per maat) met de verwachte duur van de volle training in het rapport. Gemeten 01-11-2026 (tegel 1024): N ±7,2 uur per fase, binnen de grens; S erboven. De snelheid wordt opnieuw gemeten voor de gekozen tegelinstelling vóór de volle training. Duurt een fase met N volgens de meting meer dan 8 uur, overschrijdt een lopende fase de 8 uur (dan stoppen), of werkt MPS niet: stoppunt 1.
- **Tekortschieten van N op de validatieset (stoppunt 1):** in de validatietabel van route D+A (draaiplan stap 10) haalt minstens één keurmerk met genoeg validatievoorbeelden (≥ 10 mét en ≥ 30 zonder) als puntschatting niet ≥ 80% gevonden of < 10% vals. Puntschattingen, omdat de validatiewaarheid uit AI-vakjes bestaat en klein is; "te weinig voorbeelden" op de validatieset telt niet als tekortschieten. Een maat anders dan N wordt alleen gebruikt met een vastgelegde verwijzing naar een besluit van Friso.
- Elk getraind model: checkpoint, configuratie, seed, trainingslog, sha256, en URL + sha256 + licentie van de voorgetrainde gewichten.

## 6. Herkenning op het hele etiket (CAP-7)

- **Op de processor (CPU)**, met `torch.set_num_threads(8)` als benadering van de ACC-server (8 vCPU, geen GPU).
- Tegels over het hele etiket (zelfde instellingen als in de training); lege tegels (standaardafwijking van de pixelwaarden < 3) overgeslagen; vakjes terug naar etiketcoördinaten.
- **Overlappende vakjes samenvoegen (NMS, vanaf overlap IoU 0,5):** per klasse, en voor Nutri-Score over A, B en C samen (één balk geeft één letter: de hoogste score blijft).
- **Band per code:** score ≥ `hoog` → melding; `laag` ≤ score < `hoog` → beoordelaar; score < `laag` → geen melding.
  - `laag` = 5e percentiel van de beste kandidaatscore per validatie-etiket mét die code (etiketten zonder kandidaat tellen niet mee), met vloer 0,05.
  - `hoog` = de kleinste waarde ≥ `laag` uit het rooster van alle kandidaatscores op de validatieset waarbij geen enkel validatie-etiket zónder die code een kandidaat met score ≥ `hoog` heeft. Bestaat die niet, dan `hoog` = 1,01 (alle kandidaten boven `laag` gaan naar de beoordelaar).
  - Per code alleen als de validatieset ≥ 10 etiketten mét en ≥ 30 zonder heeft; anders gelden de drempels die met dezelfde regels over alle codes samen zijn berekend.
  - Beide bevroren vóór de toetsrun.
- **Certificaatnummers (route A)** kunnen een kandidaat in de band bevestigen (§8).
- Per etiket vastgelegd: meldingen, alle kandidaten met score, tegels, CPU-seconden en wandkloktijd.

## 7. Beoordelaar (taalmodel, CAP-8)

- **Invoer:** twee losse beelden: de uitsnede (vakje + 50% marge, minstens 256 px) en het verplichte referentieplaatje van de kandidaatcode (§2).
- **Vraag:** staat in beeld 1 hetzelfde keurmerk als in beeld 2 (voor Nutri-Score: dezelfde gemarkeerde letter)? **Antwoord** via JSON-schema: `ja` / `nee` / `twijfel`. Alleen `ja` wordt een melding. Een antwoord dat niet aan het schema voldoet of een weigering is een fout, nooit `nee`.
- **Volgorde:** per code de kandidaten in de band van hoog naar laag, tot er één `ja` krijgt. Hoogstens 10 beoordelingen per etiket in totaal; wat daarna overblijft geldt als geen melding.
- Standaardmodel `google/gemini-3.8-flash` (zdr werkt aantoonbaar in K4-aa), temperatuur 0, via de gedeelde client. Kosten en tokens per aanroep uit `usage`.

## 8. Certificaatnummers (route A)

Een **certificaatnummer** is het verplichte nummer dat bij sommige keurmerken op het etiket staat.
- Alleen bij etiketten met een PDF-origineel: tekst via `pdftotext` (poppler, alleen lezen, met `nice -n 19` als het op `banana` draait). Mislukt `pdftotext`, dan staat route A voor dat etiket op "n.v.t.".
- Patronen (afgeleid uit [meting-etiketbestanden](../research/technical-keurmerkherkenning-zonder-training-2026-10-31/meting-etiketbestanden-2026-10-31.md)): MSC `MSC[-–\s]*C[-–\s]*\d{5}`; EU-biologisch `\b[A-Z]{2}[-–\s]*(?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO)[-–\s]*\d{2,3}\b`; FSC `FSC[®\s]*[-–]?\s*C\s?\d{6}` (FSC hoort niet bij de 8 en heeft geen effect).
- **Alleen bevestigen, nooit afkeuren:** een gevonden certificaatnummer maakt een kandidaat van het bijbehorende keurmerk in de band een melding, zonder beoordelaar. Zonder kandidaat geen melding. Een ontbrekend certificaatnummer verandert niets.
- Gerapporteerd: per keurmerk hoe vaak een certificaatnummer een melding opleverde, en hoe vaak het werd gevonden zonder kandidaat.

## 9. Vergelijking met de huidige route (K4-aa, CAP-12)

- De K4-aa-code van `origin/acc` 8c9373d (`apps/ml-service/app/services/k4aa.py`, functie `scan`) lokaal, met de referenties uit de momentopname van 30-10-2026 in plaats van de ACC-database. Niets op ACC.
- **Referenties voor het besluit:** alleen referenties van trainingsleveranciers, plus GS1-gidsbeelden, publieke bestanden en `synthetic-nutriscore-bootstrap`. Niet naar een leverancier te herleiden uitsneden vallen af. Een run met alle 540 referenties is alleen informatief. De sha256 van de gebruikte set staat in `bevroren.json`.
- **Tijdsbudget** per etiket bevroren (standaard 300 s); `budget_exhausted` en andere `K4aaError`-klassen zijn routefouten. `no_zdr_provider` stopt de run.
- Elke K4-aa-detectie telt als melding, ook met "requires_review" ([meetregels.md §7](meetregels.md#7-uitvoer-per-route-en-keurmerk)). Alleen de 8 keurmerken tellen.
- Zelfde toetsbeelden (zelfde sha256), zelfde telling. Kosten en tijd per etiket gemeten.
