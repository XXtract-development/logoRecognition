---
titel: Trainingsset, detector, herkenning, beoordelaar en vergelijking
hoort-bij: SPEC.md (CAP-4 t/m CAP-8, CAP-12)
datum: 2026-10-31
bijgewerkt: 2026-11-01 (besluit Friso: maat N; ronde 3: verzoekgrootte voorlabels; ronde 4: grens voorlabels $50; ronde 5: 13 klassen, NutriGreen in fase 2)
---

# Trainingsset, detector, herkenning, beoordelaar en vergelijking

Begrippen: **tegel** = vaste, overlappende uitsnede van het etiket op werkschaal ([toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15)); **vakje** = kader om een keurmerk in een beeld; **AI-vakjes** = vakjes die een taalmodel om elk gevonden keurmerk tekent.

## 1. Klassen

Dertien detectorklassen: `EU_ORGANIC_FARMING`, `GREEN_DOT`, `RECYCLABLE_GENERAL_CLAIM`, `NUTRISCORE_A`, `NUTRISCORE_B`, `NUTRISCORE_C`, `PREGNANCY_WARNING`, `MARINE_STEWARDSHIP_COUNCIL_LABEL`, `WEIDEMELK`, `VEGAN_SOCIETY_VEGAN_LOGO`, en sinds ronde 5 (besluit Friso 01-11-2026) achteraan `NUTRISCORE_D`, `NUTRISCORE_E`, `EUROPEAN_V_LABEL_VEGAN`, zodat de COCO-categorie-id's 1–10 gelijk blijven. `EUROPEAN_V_LABEL_VEGETARIAN` is geen klasse maar een variant van `EUROPEAN_V_LABEL_VEGAN` (meetregels §2): referenties, AI-codes en K4-aa-detecties met die code tellen als V-label. Gelijkende keurmerken ([meetregels.md §2](meetregels.md#2-de-9-keurmerken-en-hun-gelijkende-keurmerken)) zijn géén klasse; ze komen ongelabeld in de training.

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
| `NUTRISCORE_A` t/m `NUTRISCORE_E` | referentie `synthetic-nutriscore-bootstrap` per letter (momentopname; D en E aanwezig, gemeten 01-11-2026) of het officiële Nutri-Score-bestand |
| `PREGNANCY_WARNING` | publiek pictogram (nog op te halen; staat niet in de momentopname) |
| `MARINE_STEWARDSHIP_COUNCIL_LABEL` | GS1-gidsbeeld (momentopname) |
| `WEIDEMELK` | GS1-gidsbeeld (momentopname) |
| `VEGAN_SOCIETY_VEGAN_LOGO` | GS1-gidsbeeld (momentopname) |
| `EUROPEAN_V_LABEL_VEGAN` | Wikimedia `V-Label_Vegan_2023.png` (momentopname, bron 1), anders het GS1-gidsbeeld |

Ontbreekt een verplicht referentieplaatje bij het bevriezen, dan is dat stoppunt 7 in [SPEC.md](SPEC.md#constraints).

**Varianten** per logo, door de generator afgeleid als het bronbestand ze niet zelf heeft: kleur, zwart-wit (grijswaarden + drempel), lijn (omtrek) en negatief (wit op donker). Voor Nutri-Score per letter de horizontale balk. Per bron vastgelegd in `logos/bronnen.json`: herkomst-URL of referentie-id, sha256, licentie of "alleen intern".

## 3. Nagemaakte beelden (generator, CAP-4)

- **Achtergronden:** echte etiketten van trainingsleveranciers waarop volgens de AI-screening (dezelfde aanroep als §4) **geen van de 9** keurmerken staat. Een achtergrond met een gemeld keurmerk valt af; zo leert de detector een echt keurmerk niet als achtergrond.
- **Plaatsing:** per tegel 1–3 logo's van willekeurige klasse en variant; grootte 40–200 px op werkschaal (echte keurmerken zijn ±80–150 px); kleine draaiing (±5°), lichte vervaging, JPEG-kwaliteit 60–95. Geplakte objecten overlappen elkaar niet. Een logo dat deels buiten de tegel valt, wordt alleen gelabeld als ≥ 60% zichtbaar is; anders wordt het niet geplakt.
- **Elk geplakt exemplaar van een klasse wordt gelabeld** ("half labelen werkt niet").
- **Harde negatieven:** per tegel met kans 0,3 een gelijkend keurmerk ongelabeld meegeplakt, uit referentiebeelden van trainingsleveranciers of GS1-gidsbeelden.
- **Lege tegels:** 0–10% van de tegels zonder enig object (standaard 5%).
- **Uitvoer:** COCO-formaat (`train/` en `valid/` met `_annotations.coco.json`), zoals `rfdetr` dat leest. Vaste seed geeft identieke uitvoer; manifest met sha256 van bronnen en uitvoer.
- Eigen beeldbewerking (Pillow/numpy); geen Albumentations.

## 4. Echte trainingsvoorbeelden (CAP-5)

- **Bron:** gedeclareerde GTIN's van trainingsleveranciers, tot **80 per keurmerk** (zwangerschap: alcoholproducten; V-label: vegan of vegetarisch), plus de docs van trainingsleveranciers uit de fase-B-meetset. Alle docs krijgen nieuwe voorlabels met de 13 klassen; de oude fase-B-vakjes (zonder D/E en V-label) worden niet hergebruikt. Beelden zoals in [toetsset.md §3](toetsset.md#3-beelden-ophalen-en-bouwen-cap-15).
- **Voorlabels:** een taalmodel tekent AI-vakjes, op dezelfde manier als variant K1 uit fase B (heel etiket + tegels, antwoordschema met de 13 klassen (V-label vegan of vegetarisch als `EUROPEAN_V_LABEL_VEGAN`), gelijkende keurmerken en "ander"); standaard `google/gemini-3.8-flash`, via de gedeelde client, met verzoeken volgens [randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte); kosten en grens volgens [randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14) ($50 hard, besluit Friso 01-11-2026; start op zijn beurt in de vaste volgorde).
- **Onzekere vakjes:** een vakje dat het model als onzeker markeert of dat buiten het beeld valt, wordt niet gebruikt, en elke tegel die zo'n vakje raakt gaat niet in de training (anders leert de detector het echte keurmerk als achtergrond).
- Geen verplichte menselijke correctie van trainingsvakjes; de labelruis blijkt uit de validatieset.
- **Validatieset:** per klasse 30% van de echte trainingsetiketten (vaste seed), gesplitst op dHash-cluster zodat bijna-gelijke etiketten aan één kant blijven, met dHash-controle tussen training en validatie. Hij dient voor modelkeuze en drempels; de toetsset wordt daar nooit voor gebruikt.
- **Per keurmerk gerapporteerd:** het aantal echte trainings- en validatie-etiketten en -vakjes dat overblijft na alle uitsluitingen.

## 5. Detector en training (CAP-6)

- **RF-DETR** (`rfdetr`, Apache-2.0), **maat N** (besluit Friso 01-11-2026: eerst alleen N op de Mac). S, M of L, of een GPU, alleen als N op de validatieset de stopregel niet haalt, en dan pas na een nieuw besluit van Friso (stoppunt 1). D-FINE (Apache-2.0) is de gedocumenteerde terugval als RF-DETR niet installeert of niet traint; hij wordt niet gebouwd.
- **Tegels:** tegel 1024 px op werkschaal, overlap 256 px (minstens het grootste logo), modelinvoer = resolutie van de maat.
- **Twee fasen:** eerst op nagemaakte beelden, daarna bijtrainen op echte trainingsvoorbeelden (met een mengdeel erbij: NutriGreen tot zijn grens, de rest nagemaakte beelden, §10). Aantal epochs en de keuze tussen tegel 768/1024/1536 vallen op de validatieset (maat N vast).
- **Hardware:** lokaal op deze Mac (M3 Pro, 18 GB) op de grafische chip (MPS). **Eerst een korte snelheidsmeting** (± 50 iteraties per maat) met de verwachte duur van de volle training in het rapport. Gemeten 01-11-2026 (tegel 1024): N ±7,2 uur per fase, binnen de grens; S erboven. De snelheid wordt opnieuw gemeten voor de gekozen tegelinstelling vóór de volle training. Duurt een fase met N volgens de meting meer dan 8 uur, overschrijdt een lopende fase de 8 uur (dan stoppen), of werkt MPS niet: stoppunt 1.
- **Tekortschieten van N op de validatieset (stoppunt 1):** in de validatietabel van route D+A (draaiplan stap 10) haalt minstens één keurmerk met genoeg validatievoorbeelden (≥ 10 mét en ≥ 30 zonder) als puntschatting niet ≥ 80% gevonden of < 10% vals. Puntschattingen, omdat de validatiewaarheid uit AI-vakjes bestaat en klein is; "te weinig voorbeelden" op de validatieset telt niet als tekortschieten. Een maat anders dan N wordt alleen gebruikt met een vastgelegde verwijzing naar een besluit van Friso.
- Elk getraind model: checkpoint, configuratie, seed, trainingslog, sha256, en URL + sha256 + licentie van de voorgetrainde gewichten.

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
- Standaardmodel `google/gemini-3.8-flash` (zdr werkt aantoonbaar in K4-aa), temperatuur 0, via de gedeelde client. Kosten en tokens per aanroep uit `usage`.

## 8. Certificaatnummers (route A)

Een **certificaatnummer** is het verplichte nummer dat bij sommige keurmerken op het etiket staat.
- Alleen bij etiketten met een PDF-origineel: tekst via `pdftotext` (poppler, alleen lezen, met `nice -n 19` als het op `banana` draait). Mislukt `pdftotext`, dan staat route A voor dat etiket op "n.v.t.".
- Patronen (afgeleid uit [meting-etiketbestanden](../research/technical-keurmerkherkenning-zonder-training-2026-10-31/meting-etiketbestanden-2026-10-31.md)): MSC `MSC[-–\s]*C[-–\s]*\d{5}`; EU-biologisch `\b[A-Z]{2}[-–\s]*(?:BIO|ÖKO|OKO|ORG|ECO|EKO|ØKO|OEKO)[-–\s]*\d{2,3}\b`; FSC `FSC[®\s]*[-–]?\s*C\s?\d{6}` (FSC hoort niet bij de 9 en heeft geen effect).
- **Alleen bevestigen, nooit afkeuren:** een gevonden certificaatnummer maakt een kandidaat van het bijbehorende keurmerk in de band een melding, zonder beoordelaar. Zonder kandidaat geen melding. Een ontbrekend certificaatnummer verandert niets.
- Gerapporteerd: per keurmerk hoe vaak een certificaatnummer een melding opleverde, en hoe vaak het werd gevonden zonder kandidaat.

## 9. Vergelijking met de huidige route (K4-aa, CAP-12)

- De K4-aa-code van `origin/acc` 8c9373d (`apps/ml-service/app/services/k4aa.py`, functie `scan`) lokaal, met de referenties uit de momentopname van 30-10-2026 in plaats van de ACC-database. Niets op ACC.
- **Referenties voor het besluit:** alleen referenties van trainingsleveranciers, plus GS1-gidsbeelden, publieke bestanden en `synthetic-nutriscore-bootstrap`. Niet naar een leverancier te herleiden uitsneden vallen af. Een run met alle 540 referenties is alleen informatief. De sha256 van de gebruikte set staat in `bevroren.json`.
- **Tijdsbudget** per etiket bevroren (standaard 300 s); `budget_exhausted` en andere `K4aaError`-klassen zijn routefouten. `no_zdr_provider` stopt de run.
- Elke K4-aa-detectie telt als melding, ook met "requires_review" ([meetregels.md §7](meetregels.md#7-uitvoer-per-route-en-keurmerk)). Alleen de 9 keurmerken tellen (de 13 klassen; `EUROPEAN_V_LABEL_VEGETARIAN` telt als V-label). De referenties voor het besluit volgen dezelfde filtering, ook voor de nieuwe klassen.
- Zelfde toetsbeelden (zelfde sha256), zelfde telling. Kosten en tijd per etiket gemeten.

## 10. NutriGreen (CAP-16)

Besluit Friso 01-11-2026: NutriGreen komt in de training; de toets blijft alleen eigen materiaal.

- **Bron:** Zenodo-record 10020545 (2023-10-19), de nieuwste versie van conceptrecord 8374046; story 12.25 gebruikte versie 8374047 met dezelfde `data.csv`. Bestanden `dataset.zip` (5.110.846.454 bytes, md5 `6836b94d5c065aee397fad8415396e5a`), `data.csv` (md5 `900915a73f51e1aeca26fa40c649ab78`) en `README.md`, gedownload naar `PROEF_MAP/nutrigreen/download/`, nooit in een git-werkboom.
- **Inhoud:** 10.472 foto's van Open Food Facts-producten (README); volgens `data.csv` (gemeten 01-11-2026) 7.271 met 8.509 YOLO-vakjes (middelpunt en maat, genormaliseerd), dus 3.201 zonder vakje (verschil; het omzetgereedschap telt ze uit de zip). Beelden per klasse: Nutri-Score A 1.250, B 1.107, C 867, D 1.001, E 967, BIO 2.328, V-Label 870.
- **Klassen:** id 0–4 → `NUTRISCORE_A` t/m `NUTRISCORE_E`, 5 (BIO) → `EU_ORGANIC_FARMING`, 6 (V-Label, vegan en vegetarisch) → `EUROPEAN_V_LABEL_VEGAN`. Een foto zonder vakje is een achtergrond.
- **Omzetten:** eerst de md5 van de zip controleren (anders weigeren). Elke foto wordt één tegel, langste zijde hoogstens de tegelmaat van de training (standaard 1024), vakjes mee geschaald naar COCO-pixels, met dezelfde 13 categorieën als `generator.py` en `echt.py`. Foto's zonder annotatieregel zijn achtergrond; annotatie en foto worden gekoppeld op bestandsnaam zonder extensie (spaties en haakjes komen voor). Vallen af en worden geteld: een annotatie zonder foto, een foto met EXIF-oriëntatie ≠ 1 (de richting van de vakjes is dan onzeker), en een foto van een toetsleverancier: bestandsnaam is een barcode gelijk aan een toets-GTIN, of met dezelfde eerste 7 cijfers als de GLN van een toetsleverancier (gemeten 01-11-2026: 1.737 van de 7.271 foto's met vakje hebben een barcodenaam, 0 gelijk aan een gedeclareerde GTIN, 1 met het voorvoegsel van een toetsleverancier; de rest is niet herleidbaar, INFERENCE: geen eigen artwork). De zip wordt niet in zijn geheel uitgepakt (vrije schijfruimte); het gereedschap leest per beeld uit de zip. Rapport per klasse: beelden en vakjes.
- **Schaal:** het logo wordt niet kunstmatig verkleind: `rfdetr` schaalt elk beeld naar zijn eigen resolutie, dus alleen de verhouding vakje/beeld telt; die is bij NutriGreen groter (p50 0,17, p90 0,27) dan bij ons (±0,08–0,15). Aanname (INFERENCE); de eigen validatieset laat het effect zien.
- **Plaats:** extra bron in fase 2, naast de eigen echte tegels en de nagemaakte menging. Geen derde fase (nog een MPS-fase van uren) en niet in fase 1 (het zijn echte foto's, dus bijtrainen).
- **Aandeel:** NutriGreen komt uit het mengbudget van fase 2 (de meng-tegels: eerst NutriGreen tot de grens, de rest nagemaakt), zodat het aantal tegels per epoch en de duur van fase 2 niet stijgen. Grens: hoogstens **20%** van de trainingstegels van fase 2, én hoogstens zoveel NutriGreen-vakjes als eigen echte vakjes in fase 2 (de eigen productie-etiketten blijven minstens de helft van de echte positieven; eigen tegels zijn grotendeels leeg). Trekking om de beurt per klasse (7 klassen), binnen een klasse op sha256(seed + bestandsnaam); een foto met meer klassen telt voor elk. Foto's zonder vakje hoogstens 10% van de gekozen NutriGreen-tegels (de 0–10%-regel van §3). Nooit in `valid/` of `test/`; validatie, modelkeuze en drempels alleen op de eigen validatieset. Rapport per klasse: gebruikte NutriGreen-beelden en -vakjes.
- **Attributie** in `train-resultaat.json` van elk model dat met NutriGreen is getraind (fase 2 en alles wat daarop verder traint); tekst en licentie in [randvoorwaarden.md §4](randvoorwaarden.md#4-licenties-cap-13).
- Geen AI-aanroepen en geen kosten; zou er toch een nodig zijn, dan eerst stoppen en melden.
- Risico (INFERENCE): een foto kan een keurmerk van een andere klasse ongelabeld tonen (half labelen); de eigen validatieset laat het zien.
