---
titel: Trainingsset, detector, herkenning, beoordelaar en vergelijking
hoort-bij: SPEC.md (CAP-4 t/m CAP-8, CAP-12, CAP-16, CAP-17, CAP-18)
datum: 2026-10-31
bijgewerkt: 2026-11-02 (besluit Friso: maat N; ronde 3: verzoekgrootte voorlabels; ronde 4: grens voorlabels $50 (per 02-11-2026 22:20: $55); ronde 5: 13 klassen, NutriGreen in fase 2; ronde 6 (02-11-2026): Open Food Facts-uitsneden als generatorbron, nieuwe raming fase 2; ronde 9 (02-11-2026): 17 klassen, nachttraining met hervatten, correctie duur met OFF)
---

# Trainingsset, detector, herkenning, beoordelaar en vergelijking

Begrippen: **tegel** = vaste, overlappende uitsnede van het etiket op werkschaal ([toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15)); **vakje** = kader om een keurmerk in een beeld; **AI-vakjes** = vakjes die een taalmodel om elk gevonden keurmerk tekent.

## 1. Klassen

Zeventien detectorklassen: `EU_ORGANIC_FARMING`, `GREEN_DOT`, `RECYCLABLE_GENERAL_CLAIM`, `NUTRISCORE_A`, `NUTRISCORE_B`, `NUTRISCORE_C`, `PREGNANCY_WARNING`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`, `WEIDEMELK`, `VEGAN_SOCIETY_VEGAN_LOGO`, en sinds ronde 5 (besluit Friso 01-11-2026) achteraan `NUTRISCORE_D`, `NUTRISCORE_E`, `EUROPEAN_V_LABEL_VEGAN`, zodat de COCO-categorie-id's 1–10 gelijk blijven, en sinds ronde 9 (besluit Friso 02-11-2026) daarachter `FOREST_STEWARDSHIP_COUNCIL_LABEL` (14), `TRIMAN` (15), `SOCIETY_PLASTICS_INDUSTRY` (16) en `ON_THE_WAY_TO_PLANETPROOF` (17), zodat id 1–13 gelijk blijven. `EUROPEAN_V_LABEL_VEGETARIAN` is geen klasse maar een variant van `EUROPEAN_V_LABEL_VEGAN` (meetregels §2): referenties, AI-codes en K4-aa-detecties met die code tellen als V-label. Zo ook zijn `FOREST_STEWARDSHIP_COUNCIL_MIX`, `_RECYCLED` en `_100_PERCENT` varianten van `FOREST_STEWARDSHIP_COUNCIL_LABEL` (meetregels §2). De kunststofcode is één klasse, ongeacht het cijfer. Gelijkende keurmerken ([meetregels.md §2](meetregels.md#2-de-keurmerken-en-hun-gelijkende-keurmerken)) zijn géén klasse; ze komen ongelabeld in de training.

## 2. Logobronnen en referentieplaatjes (buiten de repository, `PROEF_MAP/logos/`)

Bronnen voor de generator, per klasse, in deze volgorde:
1. Officieel of publiek bestand (keurmerkhouder of Wikimedia Commons; alleen intern gebruik).
2. Het GS1 Label Guide-beeld uit de referentiemomentopname.
3. Schone uitsneden uit etiketten van **trainingsleveranciers** (referenties `review-confirmed`/`realref-live-poc` of uitsneden uit §4), alleen als de GTIN bij een trainingsleverancier hoort.

Daarnaast, alleen in split `train`: uitsneden uit de logodatabase van Open Food Facts als vast aandeel van de geplakte logo's, een aparte invoer van de generator onder de lekregel van §11 (niet de trainingsleveranciersregel hierboven); nooit een referentieplaatje.

**Verplicht referentieplaatje voor de beoordelaar** (bron 1 of 2; nooit een uitsnede uit een etiket):

| code | referentieplaatje |
|---|---|
| `EU_ORGANIC_FARMING` | Wikimedia `Organic-Logo.svg` (al in de referentieset) |
| `GREEN_DOT` | Wikimedia `The_Green_Dot.svg` (al in de referentieset) |
| `RECYCLABLE_GENERAL_CLAIM` | GS1-gidsbeeld (momentopname) |
| `NUTRISCORE_A` t/m `NUTRISCORE_E` | referentie `synthetic-nutriscore-bootstrap` per letter (momentopname; D en E aanwezig, gemeten 01-11-2026) of het officiële Nutri-Score-bestand |
| `PREGNANCY_WARNING` | publiek pictogram (nog op te halen; staat niet in de momentopname) |
| `MARINE_STEWARDSHIP_COUNCIL_LABEL` | GS1-gidsbeeld (momentopname) |
| `WEIDEMELK` | GS1-gidsbeeld (momentopname) |
| `VEGAN_SOCIETY_VEGAN_LOGO` | GS1-gidsbeeld (momentopname) |
| `EUROPEAN_V_LABEL_VEGAN` | Wikimedia `V-Label_Vegan_2023.png` (momentopname, bron 1), anders het GS1-gidsbeeld |
| `FOREST_STEWARDSHIP_COUNCIL_LABEL` | Wikimedia `FSC-R-logobackground_green.png` (momentopname, code Mix), anders het GS1-gidsbeeld van Mix: FSC heeft geen eigen publiek bestand onder de klassecode, dus geldt hier een variant |
| `TRIMAN` | GS1-gidsbeeld (momentopname) |
| `SOCIETY_PLASTICS_INDUSTRY` | publiek bestand van de harscode-driehoek (Wikimedia, via `logos/handmatig.json`; nog op te halen, staat niet in de momentopname) |
| `ON_THE_WAY_TO_PLANETPROOF` | GS1-gidsbeeld (momentopname) |

Een variant is het referentieplaatje alleen als de klasse zelf geen publiek of GS1-bestand heeft (FSC); V-label houdt zijn vegan-bestand.

Ontbreekt een verplicht referentieplaatje bij het bevriezen, dan is dat stoppunt 7 in [SPEC.md](SPEC.md#constraints).

**Varianten** per logo, door de generator afgeleid als het bronbestand ze niet zelf heeft: kleur, zwart-wit (grijswaarden + drempel), lijn (omtrek) en negatief (wit op donker). Voor Nutri-Score per letter de horizontale balk. Per bron vastgelegd in `logos/bronnen.json`: herkomst-URL of referentie-id, sha256, licentie of "alleen intern".

## 3. Nagemaakte beelden (generator, CAP-4)

- **Achtergronden:** echte etiketten van trainingsleveranciers waarop volgens de AI-screening (dezelfde aanroep als §4, met alle 17 klassen; nog niet gedraaid op 02-11-2026) **geen van de 13** keurmerken staat. Een achtergrond met een gemeld keurmerk valt af; zo leert de detector een echt keurmerk niet als achtergrond.
- **Plaatsing:** per tegel 1–3 logo's van willekeurige klasse en variant (in split `train` met kans 0,5 in plaats daarvan een OFF-uitsnede van dezelfde klasse, §11); grootte 40–200 px op werkschaal (echte keurmerken zijn ±80–150 px); kleine draaiing (±5°), lichte vervaging, JPEG-kwaliteit 60–95. Geplakte objecten overlappen elkaar niet. Een logo dat deels buiten de tegel valt, wordt alleen gelabeld als ≥ 60% zichtbaar is; anders wordt het niet geplakt.
- **Elk geplakt exemplaar van een klasse wordt gelabeld** ("half labelen werkt niet").
- **Harde negatieven:** per tegel met kans 0,3 een gelijkend keurmerk ongelabeld meegeplakt, uit referentiebeelden van trainingsleveranciers of GS1-gidsbeelden.
- **Lege tegels:** 0–10% van de tegels zonder enig object (standaard 5%).
- **Uitvoer:** COCO-formaat (`train/` en `valid/` met `_annotations.coco.json`), zoals `rfdetr` dat leest. Vaste seed geeft identieke uitvoer; manifest met sha256 van bronnen en uitvoer.
- Eigen beeldbewerking (Pillow/numpy); geen Albumentations.

## 4. Echte trainingsvoorbeelden (CAP-5)

- **Bron:** gedeclareerde GTIN's van trainingsleveranciers, tot **80 per keurmerk** (zwangerschap: alcoholproducten; V-label: vegan of vegetarisch; FSC: ook de varianten), plus de docs van trainingsleveranciers uit de fase-B-meetset. Alle docs krijgen nieuwe voorlabels met de 17 klassen; de oude fase-B-vakjes (zonder D/E en V-label) worden niet hergebruikt. Beelden zoals in [toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15).
- **Voorlabels:** een taalmodel tekent AI-vakjes, op dezelfde manier als variant K1 uit fase B (heel etiket + tegels, antwoordschema met de 17 klassen (V-label vegan of vegetarisch als `EUROPEAN_V_LABEL_VEGAN`, elke FSC-variant als `FOREST_STEWARDSHIP_COUNCIL_LABEL`), gelijkende keurmerken en "ander"); standaard `google/gemini-3.8-flash`, via de gedeelde client, met verzoeken volgens [randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte); kosten en grens volgens [randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14) ($55 hard, besluit Friso 02-11-2026 22:20; start op zijn beurt in de vaste volgorde).
- **Onzekere vakjes:** een vakje dat het model als onzeker markeert of dat buiten het beeld valt, wordt niet gebruikt, en elke tegel die zo'n vakje raakt gaat niet in de training (anders leert de detector het echte keurmerk als achtergrond).
- Geen verplichte menselijke correctie van trainingsvakjes; de labelruis blijkt uit de validatieset.
- **Validatieset:** per klasse 30% van de echte trainingsetiketten (vaste seed), gesplitst op dHash-cluster zodat bijna-gelijke etiketten aan één kant blijven, met dHash-controle tussen training en validatie. Hij dient voor modelkeuze en drempels; de toetsset wordt daar nooit voor gebruikt.
- **Per keurmerk gerapporteerd:** het aantal echte trainings- en validatie-etiketten en -vakjes dat overblijft na alle uitsluitingen.

## 5. Detector en training (CAP-6)

- **RF-DETR** (`rfdetr`, Apache-2.0), **maat N** (besluit Friso 01-11-2026: eerst alleen N op de Mac). S, M of L, of een GPU, alleen als N op de validatieset de stopregel niet haalt, en dan pas na een nieuw besluit van Friso (stoppunt 1). D-FINE (Apache-2.0) is de gedocumenteerde terugval als RF-DETR niet installeert of niet traint; hij wordt niet gebouwd.
- **Tegels:** tegel 1024 px op werkschaal, overlap 256 px (minstens het grootste logo), modelinvoer = resolutie van de maat.
- **Twee fasen:** eerst op nagemaakte beelden, daarna bijtrainen op echte trainingsvoorbeelden (met een mengdeel erbij: NutriGreen tot zijn grens, de rest nagemaakte beelden, §10). Aantal epochs en de keuze tussen tegel 768/1024/1536 vallen op de validatieset (maat N vast).
- **Hardware:** lokaal op deze Mac (M3 Pro, 18 GB) op de grafische chip (MPS). **Eerst een korte snelheidsmeting** (± 50 iteraties per maat) met de verwachte duur van de volle training in het rapport. Gemeten 01-11-2026 (tegel 1024): N 1,03 s per iteratie van 4 tegels: fase 1 (5.000 tegels × 20 epochs) ±7,2 uur + ±15 min validatie, binnen de grens; S erboven. Fase 2 (raming 02-11-2026 met 33 tegels per etiket in plaats van ±12; 33 is gemeten op de toetsetiketten en voor training aangenomen, INFERENCE): ±216–320 echte trainingsetiketten (216 = 461 kandidaten uit de rooktest × 67% gebouwd zoals in rondes 1 en 4 × 70% training; 320 = de raming van het draaiplan) × 33 + 1.000 meng-tegels = ±8.100–11.600 tegels per epoch, bij 20 epochs ±11,6–16,5 uur plus ±1,5–2,3 uur validatie (±93–137 validatie-etiketten × 33 tegels). Besluit Friso 02-11-2026: fase 2 met **20 epochs**, verdeeld over nachten (§12); de vier klassen van ronde 9 voegen echte trainingsetiketten en dus tegels toe, het echte aantal staat na `echt.py dataset` in `train/_annotations.coco.json` en de status van §12 geeft de einddatum. **OFF verhoogt de duur nooit:** het aantal tegels per epoch is gelijk of kleiner, want `echt.py dataset` houdt op vóór de nagemaakte meng-tegel die de OFF-grens (§11) zou passeren; daardoor kan het aantal meng-tegels alleen dalen. De snelheid wordt opnieuw gemeten voor de gekozen tegelinstelling vóór de volle training. Werkt MPS niet, duurt één epoch langer dan het nachtvenster (9,5 uur), of ligt de verwachte einddatum van een fase meer dan 4 nachten na haar start (2× de bovenkant van de raming): stoppunt 1. De 8-uursgrens per fase vervalt (besluit Friso 02-11-2026).
- **Tekortschieten van N op de validatieset (stoppunt 1):** in de validatietabel van route D+A (draaiplan stap 10) haalt minstens één keurmerk met genoeg validatievoorbeelden (≥ 10 mét en ≥ 30 zonder) als puntschatting niet ≥ 80% gevonden of < 10% vals. Puntschattingen, omdat de validatiewaarheid uit AI-vakjes bestaat en klein is; "te weinig voorbeelden" op de validatieset telt niet als tekortschieten. Een maat anders dan N wordt alleen gebruikt met een vastgelegde verwijzing naar een besluit van Friso.
- Elk getraind model: checkpoint, configuratie, seed, trainingslog, sha256, en URL + sha256 + licentie van de voorgetrainde gewichten. Elk epoch laat een volledig checkpoint achter (`checkpoint_<epoch>.ckpt`, met optimizer en scheduler); `train.py train --hervat <ckpt>` gaat verder bij het volgende epoch (§12); `train-resultaat.json` vermeldt in zijn configuratie het checkpoint waarvan de laatste start hervatte; de volledige reeks starts en stops staat in `nacht-status.json` (§12).

## 6. Herkenning op het hele etiket (CAP-7)

- **Op de processor (CPU)**, met `torch.set_num_threads(8)` als benadering van de ACC-server (8 vCPU, geen GPU).
- Tegels over het hele etiket (zelfde instellingen als in de training); lege tegels (standaardafwijking van de pixelwaarden < 3) overgeslagen; vakjes terug naar etiketcoördinaten.
- **Overlappende vakjes samenvoegen (NMS, vanaf overlap IoU 0,5):** per klasse, en voor Nutri-Score over A t/m E samen (één balk geeft één letter: de hoogste score blijft).
- **Band per code:** score ≥ `hoog` → melding; `laag` ≤ score < `hoog` → beoordelaar; score < `laag` → geen melding.
  - `laag` = 5e percentiel van de beste kandidaatscore per validatie-etiket mét die code (etiketten zonder kandidaat tellen niet mee), met vloer 0,05.
  - `hoog` = de kleinste waarde ≥ `laag` uit het rooster van alle kandidaatscores op de validatieset waarbij geen enkel validatie-etiket zónder die code een kandidaat met score ≥ `hoog` heeft. Bestaat die niet, dan `hoog` = 1,01 (alle kandidaten boven `laag` gaan naar de beoordelaar).
  - Per code alleen als de validatieset ≥ 10 etiketten mét en ≥ 30 zonder heeft; anders gelden de drempels die met dezelfde regels over alle codes samen zijn berekend. V-label heeft naar verwachting ±3 validatie-etiketten (30% van 11 trainings-GTIN's): gezamenlijke drempels, en bij stoppunt 1 telt het niet mee; zijn kwaliteit blijkt pas op de toets (INFERENCE).
  - Beide bevroren vóór de toetsrun.
- **Certificaatnummers (route A)** kunnen een kandidaat in de band bevestigen (§8).
- Per etiket vastgelegd: meldingen, alle kandidaten met score, tegels, CPU-seconden en wandkloktijd.

## 7. Beoordelaar (taalmodel, CAP-8)

- **Invoer:** twee losse beelden: de uitsnede (vakje + 50% marge, minstens 256 px) en het verplichte referentieplaatje van de kandidaatcode (§2).
- **Vraag:** staat in beeld 1 hetzelfde keurmerk als in beeld 2 (voor Nutri-Score A–E: dezelfde gemarkeerde letter; voor V-label: vegan en vegetarisch gelden als hetzelfde)? **Antwoord** via JSON-schema: `ja` / `nee` / `twijfel`. Alleen `ja` wordt een melding. Een antwoord dat niet aan het schema voldoet of een weigering is een fout, nooit `nee`.
- **Volgorde:** per code de kandidaten in de band van hoog naar laag, tot er één `ja` krijgt. Hoogstens 10 beoordelingen per etiket in totaal; wat daarna overblijft geldt als geen melding.
- Voor FSC gelden Mix, Recycled en 100% als hetzelfde keurmerk; voor de kunststofcode telt het cijfer niet.
- Standaardmodel `google/gemini-3.8-flash` (zdr werkt aantoonbaar in K4-aa), temperatuur 0, via de gedeelde client. Kosten en tokens per aanroep uit `usage`.

## 8. Certificaatnummers (route A)

Een **certificaatnummer** is het verplichte nummer dat bij sommige keurmerken op het etiket staat.
- Alleen bij etiketten met een PDF-origineel: tekst via `pdftotext` (poppler, alleen lezen, met `nice -n 19` als het op `banana` draait). Mislukt `pdftotext`, dan staat route A voor dat etiket op "n.v.t.".
- Patronen (afgeleid uit [meting-etiketbestanden](../research/technical-keurmerkherkenning-zonder-training-2026-10-31/meting-etiketbestanden-2026-10-31.md)): MSC `MSC[-–\s]*C[-–\s]*\d{5}`; EU-biologisch `\b[A-Z]{2}[-–\s]*(?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO)[-–\s]*\d{2,3}\b`; FSC `FSC[®\s]*[-–]?\s*C\s?\d{6}` (sinds ronde 9 een keurmerk: bevestigt een FSC-kandidaat zoals de andere).
- **Alleen bevestigen, nooit afkeuren:** een gevonden certificaatnummer maakt een kandidaat van het bijbehorende keurmerk in de band een melding, zonder beoordelaar. Zonder kandidaat geen melding. Een ontbrekend certificaatnummer verandert niets.
- Gerapporteerd: per keurmerk hoe vaak een certificaatnummer een melding opleverde, en hoe vaak het werd gevonden zonder kandidaat.

## 9. Vergelijking met de huidige route (K4-aa, CAP-12)

- De K4-aa-code van `origin/acc` 8c9373d (`apps/ml-service/app/services/k4aa.py`, functie `scan`) lokaal, met de referenties uit de momentopname van 30-10-2026 in plaats van de ACC-database. Niets op ACC.
- **Referenties voor het besluit:** alleen referenties van trainingsleveranciers, plus GS1-gidsbeelden, publieke bestanden en `synthetic-nutriscore-bootstrap`. Niet naar een leverancier te herleiden uitsneden vallen af. Een run met alle 540 referenties is alleen informatief. De sha256 van de gebruikte set staat in `bevroren.json`.
- **Tijdsbudget** per etiket bevroren (standaard 300 s); `budget_exhausted` en andere `K4aaError`-klassen zijn routefouten. `no_zdr_provider` stopt de run.
- Per keurmerk wordt het aantal gebruikte referenties gerapporteerd; bij 0 (mogelijk voor een van de vier van ronde 9) is de K4-aa-uitkomst voor dat keurmerk "n.v.t. (geen referenties)" in plaats van 0% gevonden.
- Elke K4-aa-detectie telt als melding, ook met "requires_review" ([meetregels.md §7](meetregels.md#7-uitvoer-per-route-en-keurmerk)). Alleen de 13 keurmerken tellen (de 17 klassen; `EUROPEAN_V_LABEL_VEGETARIAN` telt als V-label, een FSC-variant als FSC). De referenties voor het besluit volgen dezelfde filtering, ook voor de nieuwe klassen.
- Zelfde toetsbeelden (zelfde sha256), zelfde telling. Kosten en tijd per etiket gemeten.

## 10. NutriGreen (CAP-16)

Besluit Friso 01-11-2026: NutriGreen komt in de training; de toets blijft alleen eigen materiaal.

- **Bron:** Zenodo-record 10020545 (2023-10-19), de nieuwste versie van conceptrecord 8374046; story 12.25 gebruikte versie 8374047 met dezelfde `data.csv`. Bestanden `dataset.zip` (5.110.846.454 bytes, md5 `6836b94d5c065aee397fad8415396e5a`), `data.csv` (md5 `900915a73f51e1aeca26fa40c649ab78`) en `README.md`, gedownload naar `PROEF_MAP/nutrigreen/download/`, nooit in een git-werkboom.
- **Inhoud:** 10.472 foto's van Open Food Facts-producten (README); volgens `data.csv` (gemeten 01-11-2026) 7.271 met 8.509 YOLO-vakjes (middelpunt en maat, genormaliseerd), dus 3.201 zonder vakje (verschil; het omzetgereedschap telt ze uit de zip). Beelden per klasse: Nutri-Score A 1.250, B 1.107, C 867, D 1.001, E 967, BIO 2.328, V-Label 870.
- **Klassen:** id 0–4 → `NUTRISCORE_A` t/m `NUTRISCORE_E`, 5 (BIO) → `EU_ORGANIC_FARMING`, 6 (V-Label, vegan en vegetarisch) → `EUROPEAN_V_LABEL_VEGAN`. Een foto zonder vakje is een achtergrond.
- **Omzetten:** eerst de md5 van de zip controleren (anders weigeren). Elke foto wordt één tegel, langste zijde hoogstens de tegelmaat van de training (standaard 1024), vakjes mee geschaald naar COCO-pixels, met dezelfde 17 categorieën als `generator.py` en `echt.py`. Foto's zonder annotatieregel zijn achtergrond; annotatie en foto worden gekoppeld op bestandsnaam zonder extensie (spaties en haakjes komen voor). Vallen af en worden geteld: een annotatie zonder foto, een foto met EXIF-oriëntatie ≠ 1 (de richting van de vakjes is dan onzeker), en een foto van een toetsleverancier: bestandsnaam is een barcode gelijk aan een toets-GTIN, of met dezelfde eerste 7 cijfers als de GLN van een toetsleverancier (gemeten 01-11-2026: 1.737 van de 7.271 foto's met vakje hebben een barcodenaam, 0 gelijk aan een gedeclareerde GTIN, 1 met het voorvoegsel van een toetsleverancier; de rest is niet herleidbaar, INFERENCE: geen eigen artwork). De zip wordt niet in zijn geheel uitgepakt (vrije schijfruimte); het gereedschap leest per beeld uit de zip. Rapport per klasse: beelden en vakjes.
- **Schaal:** het logo wordt niet kunstmatig verkleind: `rfdetr` schaalt elk beeld naar zijn eigen resolutie, dus alleen de verhouding vakje/beeld telt; die is bij NutriGreen groter (p50 0,17, p90 0,27) dan bij ons (±0,08–0,15). Aanname (INFERENCE); de eigen validatieset laat het effect zien.
- **Plaats:** extra bron in fase 2, naast de eigen echte tegels en de nagemaakte menging. Geen derde fase (nog een MPS-fase van uren) en niet in fase 1 (het zijn echte foto's, dus bijtrainen).
- **Aandeel:** NutriGreen komt uit het mengbudget van fase 2 (de meng-tegels: eerst NutriGreen tot de grens, de rest nagemaakt), zodat het aantal tegels per epoch en de duur van fase 2 niet stijgen. Grens: hoogstens **20%** van de trainingstegels van fase 2, én hoogstens zoveel NutriGreen-vakjes als eigen echte vakjes in fase 2 (de eigen productie-etiketten blijven minstens de helft van de echte positieven; eigen tegels zijn grotendeels leeg). Trekking om de beurt per klasse (7 klassen), binnen een klasse op sha256(seed + bestandsnaam); een foto met meer klassen telt voor elk. Foto's zonder vakje hoogstens 10% van de gekozen NutriGreen-tegels (de 0–10%-regel van §3). Nooit in `valid/` of `test/`; validatie, modelkeuze en drempels alleen op de eigen validatieset. Rapport per klasse: gebruikte NutriGreen-beelden en -vakjes.
- **Attributie** in `train-resultaat.json` van elk model dat met NutriGreen is getraind (fase 2 en alles wat daarop verder traint); tekst en licentie in [randvoorwaarden.md §4](randvoorwaarden.md#4-licenties-cap-13).
- Geen AI-aanroepen en geen kosten; zou er toch een nodig zijn, dan eerst stoppen en melden.
- Risico (INFERENCE): een foto kan een keurmerk van een andere klasse ongelabeld tonen; sinds ronde 9 vooral FSC, Triman en kunststofcode, die op verpakkingen veel voorkomen (half labelen); de eigen validatieset laat het zien.

## 11. Open Food Facts-logo's (CAP-17)

Besluit Friso 02-11-2026: uitsneden uit de logodatabase van Open Food Facts (OFF) zijn een extra logobron van de generator, voor echte varianten (gedrukt, vervormd, andere kleuren). Toets, validatie, modelkeuze en drempels blijven alleen eigen materiaal. Bron: [datasets-keurmerken-2026-11-01.md](../research/technical-keurmerkherkenning-zonder-training-2026-10-31/datasets-keurmerken-2026-11-01.md) §1, §3, §8.

- **Alleen uitsneden.** Hele foto's niet: de vakjes komen van de logodetector van OFF, gemiste logo's staan ongelabeld op dezelfde foto en zouden als achtergrond geleerd worden (INFERENCE); screenen vraagt een eigen getrainde detector of AI-aanroepen. Elke uitsnede is één vakje zonder marge via `GET https://robotoff.openfoodfacts.org/api/v1/images/crop` (JPEG, vakje `[y_min, x_min, y_max, x_max]` genormaliseerd uit het record); er komt nooit een hele foto op schijf.
- **Klassen** (aantallen benoemde logo's met vakje, `logos/search?…&annotated=true&count=1`, gemeten 02-11-2026, gelijk aan de meting van 01-11). De tabel gebruikt alleen codes uit `train.KLASSEN`.

| klasse | OFF-zoekopdracht | logo's |
|---|---|---|
| `EU_ORGANIC_FARMING` | label `en:eu-organic` | 104.566 |
| `GREEN_DOT` | label `en:green-dot` | 119.623 |
| `NUTRISCORE_A` t/m `NUTRISCORE_E` | label `en:nutriscore-grade-a` t/m `-e` | 25.526 / 12.837 / 9.351 / 7.691 / 4.140 |
| `EUROPEAN_V_LABEL_VEGAN` | label `en:european-vegetarian-union-vegan`, `-vegetarian` en `en:european-vegetarian-union` samen | 14.410 + 1.628 + 3.430 |
| `MARINE_STEWARDSHIP_COUNCIL_LABEL` | label `en:sustainable-seafood-msc` | 12.046 |
| `VEGAN_SOCIETY_VEGAN_LOGO` | label `en:the-vegan-society` | 11.077 |
| `PREGNANCY_WARNING` | label `en:not-advised-for-pregnant-women` (steekproef aanvaard) | 4.925 |
| `WEIDEMELK` | label `fr:lait-de-paturage` (synoniem `nl: Weidemelk`; steekproef aanvaard) | 608 |
| `FOREST_STEWARDSHIP_COUNCIL_LABEL` (ronde 9) | label `en:fsc-mix` en `en:fsc` samen (`en:fsc-recycled` en `en:fsc-100` bestaan niet, gemeten 02-11-2026) | 5.899 + 3.355 |
| `TRIMAN` (ronde 9) | label `fr:triman` | 70.119 |
| `SOCIETY_PLASTICS_INDUSTRY` (ronde 9) | verpakkingswaarden `01-pet`, `1-pet`, `02-hdpe`, `2-hdpe`, `02-pe-hd`, `03-pvc`, `04-ldpe`, `4-ldpe`, `04-pe-ld`, `05-pp`, `5-pp`, `06-ps`, `07-other`, `7-other`, `07-o`, `7-o` (de 16 met treffers; `3-pvc` en `6-ps` 0) | 6.645 samen |
| `ON_THE_WAY_TO_PLANETPROOF` (ronde 9) | label `en:planet-proof` | 27 |
| `RECYCLABLE_GENERAL_CLAIM` | geen: packaging `en:recyclable-material` (1.939) is in de steekproef afgewezen | 0 |

- **Steekproef** (zwangerschap, Weidemelk, Recyclebaar; 02-11-2026): per zoekopdracht een pool van hoogstens 2.000 willekeurige records, daarvan de eerste 40 op sha256("20261102" + logo-id), uitgesneden en als contactblad bekeken door de agent (Claude), niet door een mens, zonder API-kosten; contactbladen in `PROEF_MAP/off/steekproef/<naam>/vel.png`, zodat Friso kan nakijken. Aanvaard als hoogstens 2 van de 40 niet het keurmerk tonen; een afgesneden maar herkenbaar keurmerk telt als goed.
  - Zwangerschap: 40/40 het pictogram, 0 alleen-tekst; extra 24 van de 106 langgerekte vakjes (verhouding > 1,5): 24/24 pictogram. Aanvaard zonder vormfilter: een filter op verhouding zou echte, scheef gefotografeerde pictogrammen weggooien.
  - Weidemelk: 40/40 het koeienlogo, ook de meertalige uitvoering (WEIDEMELK / LAIT DE PÂTURAGE / WEIDEMILCH) van hetzelfde keurmerk; 2 afgesneden. Aanvaard.
  - Recyclebaar: 38 bekeken (2 uitsneden mislukt), 27 Möbius-lus (vaak met tekst of een ander teken in het vakje), 11 andere tekens (cirkelpijl, groene-punt-achtige pijl, flesclaim, poppetje met afvalbak, tekstbanner). Afgewezen.
  - **Ronde 9:** de vier nieuwe klassen hebben geen steekproef vooraf; hun controle is het contactblad na het ophalen (PlanetProof: alle uitsneden). Kunststofcode: goed = de driehoek van pijlen met een cijfer; alleen tekst ("PP 5") of een ander teken is fout. FSC: elk FSC-logo (Mix, Recycled, 100%) is goed. Roboflow (harscodes, CC BY 4.0) wordt niet gebruikt: de platformvoorwaarden zijn niet geverifieerd en OFF levert al meer dan de grens.
  - **Na het ophalen** bekijkt de agent per klasse een contactblad van 40 behouden uitsneden met dezelfde regel (Nutri-Score: de gemarkeerde letter moet kloppen); faalt een klasse, dan stoppen en melden aan Friso.
- **Trekking:** per zoekopdracht een pool van hoogstens 2.000 records via `random=true` (de API kent geen offset), bewaard onder `PROEF_MAP/off/pools/` met sha256, zodat de keuze herhaalbaar is; per klasse (V-label: de drie pools samen; FSC de twee, kunststofcode de 16) in volgorde van sha256("20261102" + logo-id) ophalen tot **1.000 behouden per klasse** (Weidemelk: alles). Meer heeft geen zin: fase 1 plakt ±9.500 logo's (5.000 tegels × ±1,9), gemiddeld ±730 per klasse (de generator kiest gelijk over de paren klasse-bron, dus per klasse verschilt het), waarvan de helft uit OFF.
- **Afvallers, geteld per reden.** Over de hele pool, per record: afbeelding verwijderd (`image.deleted`); vakje ongeldig (geen afbeelding, geen breedte of hoogte, vakje buiten [0, 1] of zonder oppervlak); langste zijde van het vakje < 64 px in de bronfoto; geen GTIN (alleen 8, 12, 13 of 14 cijfers, dan GTIN-14 met voorloopnullen); toets-GTIN; toetsleverancier. Alleen over opgehaalde uitsneden: niet op te halen; dubbel (zelfde sha256 in de klasse); bijna gelijk aan een toetsbeeld.
- **Lekpreventie:** weg als de GTIN-14 in de toetsset staat (`PROEF_MAP/toets/toets-docs.json`, alleen lezen; reden toets-GTIN), anders als hij een GTIN van een toetsleverancier is of als zijn cijfers 2–8 gelijk zijn aan de eerste 7 van de GLN van een toetsleverancier (reden toetsleverancier; dezelfde regel en dezelfde toetsleveranciers als NutriGreen in §10). Het ophalen mag vóór de bevestiging; vóór de training draait het opnieuw (bewaarde pools en uitsneden, de filters op de dan definitieve toetsset; nieuwe afvallers worden vervangen door de volgende in de volgorde). NutriGreen-foto's waarvan de barcodenaam een toets-GTIN is, laat `echt.py dataset --nutrigreen` vóór het mengen vallen en telt ze (`_nutrigreen.toets_gtin`).
- **Bijna-duplicaatcontrole:** dHash-afstand ≤ 6 tot een beeld in `PROEF_MAP/toets/beelden` (hele etiketten en hinttegels, alleen lezen) valt af, zoals in [toetsset.md §2](toetsset.md#2-scheidingseenheid-de-leverancier-gln). Een uitsnede van ±144 px lijkt daar zelden op; de bescherming komt van de barcoderegel (INFERENCE).
- **Beleefd ophalen:** User-Agent met contact `ict@xxtract.com`; één verzoek tegelijk, minstens 0,6 s tussen het begin van twee verzoeken (hoogstens 100 per minuut: de leeslimiet van de product-API van OFF; voor Robotoff staat geen limiet gedocumenteerd, INFERENCE: zelfde maat); bij 429, 5xx, tijd op of verbindingsfout opnieuw na 2, 4, 8, 16 en 32 s (een `Retry-After` gaat voor, hoogstens 300 s), daarna overgeslagen; een andere 4xx wordt overgeslagen. Noodstop: na 20 mislukte uitsneden op rij stopt het ophalen (exitcode ≠ 0). Hervatbaar: bewaarde pools, bestaande uitsneden en blijvende afvallers (`PROEF_MAP/off/status.json`: niet op te halen na een 4xx, dubbel, bijna gelijk) worden niet opnieuw gehaald; alleen tijdelijke fouten worden opnieuw geprobeerd.
- **Schijf:** verwacht ±11.600 uitsneden (ronde 9: ±3.000 erbij), ±0,1–0,4 GB (INFERENCE: mediaan vakje 144 px). Het gereedschap stopt bij 3 GB in `PROEF_MAP/off` of bij minder dan 5 GB vrij (stoppunt 9; 5 GB houdt ruimte voor de nagemaakte en echte trainingstegels en de checkpoints, ±4 GB, INFERENCE; GB = 10⁹ bytes). De NutriGreen-zip blijft staan.
- **Index en rapport:** `PROEF_MAP/off/bronnen.json` = lijst `{klasse, pad, logo_id, gtin14, source_image, sha256, annotator}` van de behouden uitsneden; `PROEF_MAP/off/rapport.json`: per klasse het OFF-aantal, de pool, de afvallers per reden, het behouden aantal, uitsneden per annotator en de bytes; totale bytes en vrije schijf.
- **Gebruik in de generator** (`generator.py tegels --off <bronnen.json>`): per geplakt logo eerst klasse en eigen bron zoals in §3 (de klassenverhouding verandert niet), daarna met kans **0,5** een OFF-uitsnede van dezelfde klasse in plaats van de eigen bron, als die klasse OFF-uitsneden heeft. Een OFF-uitsnede is al een echte variant: geen afgeleide varianten, wel de gewone vorming (40–200 px, ±5°, vervaging, JPEG 60–95). Alleen in split `train`; bij `valid` of `test` weigert de generator. Zonder `--off` trekt hij niets extra, dus de uitvoer is byte-gelijk aan vóór ronde 6. Het manifest telt de OFF-logo's per klasse en markeert ze per object (`variant: off`).
- **Aandeel in de training:** fase 1: ±50% van de geplakte logo's van een klasse met OFF-uitsneden. Fase 2: alleen in de nagemaakte tegels van het mengbudget (1.000 tegels, NutriGreen eerst tot zijn grens, §10), en hoogstens zoveel OFF-vakjes als eigen echte vakjes: `echt.py dataset` neemt de nagemaakte tegels in vaste volgorde en houdt op vóór de tegel die die grens zou passeren (geteld uit het manifest van de generator); `rapport.json._off` geeft de OFF-vakjes per klasse en de grens. Het aantal tegels per epoch en de trainingsduur blijven gelijk of worden kleiner (OFF kan alleen meng-tegels schrappen, §5).
- **Herkomst:** `herkomst.json` is altijd een lijst van `{bron, attributie, licentie[, rapport]}`. De generator schrijft `<uit>/herkomst.json` (bij `--uit $PM/train/nagemaakt`) bij elke run met OFF, overschrijft hem en verwijdert hem nooit. `echt.py dataset --meng <map>/train` neemt `<map>/herkomst.json` mee als er nagemaakte tegels gemengd zijn, naast NutriGreen; hij verwijdert zijn eigen `herkomst.json` alleen als geen van beide meekomt. `train.py` neemt de lijst over in `train-resultaat.json` (`data_herkomst`; een los object telt als lijst van één), ontdubbeld op `bron`, de laatste wint. Tekst en licentie in [randvoorwaarden.md §4](randvoorwaarden.md#4-licenties-cap-13).
- Geen AI-aanroepen en geen kosten; zou er toch een nodig zijn, dan eerst stoppen en melden.
- Risico's (INFERENCE): OFF-uitsneden zijn foto's, de toets bestaat uit drukbestanden; een vakje kan naast het keurmerk tekst of een ander keurmerk bevatten; een fotolapje zonder marge kan de detector leren dat de rand van een lapje een logo is. De eigen validatieset laat het effect zien; een marge om de uitsnede is een latere keuze als de validatie daarom vraagt.

## 12. Nachttraining (CAP-18)

Besluit Friso 02-11-2026: training draait alleen tussen **22:00 en 07:30** lokale tijd van deze Mac; daarbuiten pauzeert ze en de volgende nacht gaat ze verder, tot klaar. Fase 2 krijgt 20 epochs. Het geldt voor elke trainingsfase (fase 1, ±7,5 uur, past in één venster van 9,5 uur). De training start pas na Friso's bevestiging van de toetsset; het startcommando staat in het draaiplan.

- **Checkpoint per epoch:** `train.py` zet `checkpoint_interval` van `rfdetr` op 1, zodat elk epoch een volledig checkpoint `checkpoint_<epoch>.ckpt` (gewichten, optimizer, scheduler, epochteller) in de uitvoermap achterlaat. `--hervat <ckpt>` geeft dat bestand als `resume` door; de training gaat verder bij het volgende epoch met hetzelfde aantal epochs.
- **Planner** (`nacht.py`): `plan` legt de trainingsopdracht en het venster vast in `<uit>/nacht.json` en schrijft een launchd-agent (`~/Library/LaunchAgents/com.xxtract.proef-nachttraining.plist`, dagelijks 22:00, `draai`); laden doet de hoofdsessie. `draai`: buiten het venster start niets; is `train-resultaat.json` er, dan niets en status klaar; anders start het de opdracht onder `caffeinate -i` met `--hervat` het nieuwste leesbare checkpoint (een onleesbaar nieuwste valt terug op het vorige; geen checkpoint = vanaf het begin), stuurt om 07:30 SIGTERM (PyTorch Lightning stopt op een batchgrens, het lopende epoch gaat verloren) en na 300 s SIGKILL. Hoogstens één `draai` tegelijk (slot in de uitvoermap). Het houdt de nieuwste twee checkpoints en verwijdert oudere.
- **Status** (`nacht.py status`, en `<uit>/nacht-status.json` na elke stap): fase, epochs klaar/totaal, gemiddelde epochduur (uit de tijdstippen van de checkpoints), laatste start en stop, en de verwachte einddatum: resterende epochs × gemiddelde duur, alleen over vensteruren geteld.
- **Per fase een eigen uitvoermap** (`--uit`) met eigen `nacht.json`; hervatten kijkt alleen daar. Fase 2 krijgt het model van fase 1 als startgewichten (`--start`), nooit als hervatpunt.
- **Opruimen** raakt alleen `checkpoint_<n>.ckpt` (de nieuwste twee leesbare blijven); `checkpoint_best_*.pth` (het beste model op de validatieset, die `rfdetr` per epoch meet en logt) en het eindcheckpoint blijven altijd staan.
- **Verlies:** hoogstens het lopende epoch (een stop midden in een epoch valt terug op het laatste volledige checkpoint). VERIFIED in de broncode van `pytorch_lightning` 2.6.6 (meegeleverd met `rfdetr` 1.11.2, vastgezet in `pyproject.toml`): SIGTERM zet een vlag en de trainingslus stopt op de volgende batchgrens (`SIGTERMException`); de rooktest stuurt SIGTERM via `nacht.py` midden in epoch 2 en hervat tot klaar, en meet de checkpointnaam.
- **Stoppunt 1 bewaakt zichzelf:** na elk venster en elk nieuw checkpoint controleert `draai`: een volledig venster zonder nieuw checkpoint, een epoch langer dan 9,5 uur, of een verwachte einddatum meer dan 4 nachten na de eerste start → `stoppunt_1` met reden in de status; daarna start `draai` niet meer (ook niet via launchd) tot de status met `nacht.py vrijgeven` is vrijgegeven na een besluit van Friso.
- **Aannames (INFERENCE):** de Mac staat 's nachts aan netstroom en gaat niet slapen (instelling in het draaiplan); launchd start een om 22:00 gemiste taak bij ontwaken, en `draai` start alleen binnen het venster. Een hervatte run is niet bit-gelijk aan een doorlopende (toestand van de willekeur bij hervatten); de seed geldt per start.
