---
titel: Randvoorwaarden proef getrainde detector — privacy, foutafhandeling, kosten, licenties, verzoekgrootte
hoort-bij: SPEC.md (Constraints, CAP-2, CAP-5, CAP-11, CAP-13, CAP-14, CAP-16, CAP-17)
datum: 2026-10-31
bijgewerkt: 2026-11-02 (grenzen 02-11-2026 22:20: voorinvulling $73, voorlabels $55; ronde 3: verzoekgrootte, grens voorinvulling $65; ronde 4: grens voorlabels $50, aanvulling onder de voorinvulling; ronde 5: NutriGreen, V-label-aanvulling; ronde 6: Open Food Facts; ronde 9: voorinvulling van de vier nieuwe keurmerken)
---

# Randvoorwaarden

Dit bestand is de enige plek voor privacy, foutafhandeling van taalmodelaanroepen, kosten, licenties en verzoekgrootte. De stoppunten staan alleen in [SPEC.md](SPEC.md#constraints).

## 1. Privacy (zdr)

**zdr** (zero data retention) betekent: de aanbieder bewaart de beelden en antwoorden niet en gebruikt ze niet voor training.

- **Eén OpenRouter-client** voor alle aanroepers: voorinvulling van de toets, voorlabels en achtergrondscreening van de training, beoordelaar. De K4-aa-runner gebruikt de eigen client van `k4aa.py`, die hetzelfde doet.
- Elke aanroep: `POST https://openrouter.ai/api/v1/chat/completions` met `provider: {"zdr": true, "data_collection": "deny"}`. Geen batch-API, geen bestands-API.
- **Vóór de eerste aanroep met klantartwork** per model een zdr-proefaanroep met een niet-klantbeeld (een officieel logo); de uitkomst wordt vastgelegd. Mislukt die, dan wordt er geen klantartwork verstuurd.
- **Een zdr-weigering stopt de hele run:** HTTP 404 (geen endpoint dat aan zdr voldoet) of `no_zdr_provider`, op welke route ook. Zo'n run telt niet als eerste toetsrun en wordt als technische fout vastgelegd.
- Sleutel `OPENROUTER_API_KEY`, alleen in de omgeving, gelezen uit `~/claude-team-config/secrets/.env`; nooit in een bestand, log of de repository. De K4-aa-runner zet hem in het eigen proces om naar `GHS_REVIEW_API_KEY`.
- Logs bevatten geen sleutel, beeld, prompt of antwoordtekst van klantartwork; wel tellingen, tijden, kosten en foutklassen.

## 2. Foutafhandeling van taalmodelaanroepen

| antwoord | gevolg |
|---|---|
| 200 met geldig antwoord volgens schema | verwerken |
| 200 met ongeldig of geweigerd antwoord, of `finish_reason` niet `stop` | fout voor dit etiket |
| 429, 5xx, verbindingsfout, tijd op | opnieuw, hoogstens 2 keer, wachttijd 2 s × poging; daarna fout voor dit etiket |
| 404 | **hele run stoppen** (geen zdr-endpoint) |
| 401, 402, 403 | **hele run stoppen** (sleutel, tegoed of rechten) |
| andere 4xx | fout voor dit etiket |

Een fout voor een etiket telt als "geen melding" ([meetregels.md §5](meetregels.md#5-welke-etiketten-tellen)).

## 3. Kosten (CAP-14)

Raming (tarieven OpenRouter 30-10-2026; voorinvulling gemeten 01-11-2026; per post stoppen bij de grens):

| post | aantal | per stuk | raming | grens |
|---|---|---|---|---|
| voorinvulling toets (`anthropic/claude-sonnet-5.5`) | ±350 etiketten | $0,12 (gemeten) | ±$42 | **$73, hard** (besluit Friso 02-11-2026 22:20; eerder $65 van 01-11-2026) |
| voorinvulling ronde 9 (vier keurmerken, zelfde post als hierboven) | 352 etiketten, ±660 aanroepen zonder lege tegels | kostenmodel (gemeten) | ±$28,9 (±$35,9 met alle tegels) | binnen het restant $36,61 van de post $73 (73 − 36,39) |
| voorlabels + achtergrondscreening training (`google/gemini-3.8-flash`) | ±1.100 etiketten (ronde 9: +±300 voor de vier klassen) | ±$0,012–0,019 per aanroep, ±2,6–3 aanroepen | ±$34–54 | **$55, hard** (besluit Friso 02-11-2026 22:20; eerder $50) |
| beoordelaar (validatie + toets) | ±1.500 kandidaten | ±$0,002 | ±$3 | $4,50 (1,5×) |
| K4-aa op de toets (gefilterd + informatief volledig) | 2 × ±350 etiketten | ±$0,012 | ±$8 | $12 (1,5×) |
| **totaal** | | | **±$116–136** (INFERENCE; vóór ronde 9 ±$78–88) | |

- **Grens per post:** 1,5× de raming, tenzij Friso een vaste grens besliste (voorinvulling $73, voorlabels $55). Het gereedschap past die vaste grens standaard toe; een andere grens alleen met een besluitverwijzing (`--grens` met `--besluit`, voor de voorinvulling en de voorlabels); zo kan een harde grens niet stil verhoogd worden.
- **Voorinvulling toets: $73 hard** (besluit Friso 02-11-2026 22:20; eerder $65) in plaats van 1,5 × $21 = $31,50 (besluit Friso 01-11-2026 ±14:05). Reden, gemeten op de 211 etiketten met voorinvulling: gemiddeld $0,12 per etiket (mediaan $0,08, p90 $0,30, max $0,59), omdat een etiket gemiddeld 33 tegels van 1024 px heeft (mediaan 20, p90 88, max 180) en dus 2,6 aanroepen; ≤ 4 tegels kost $0,016, > 16 tegels $0,18. Stand bij het besluit: 232 etiketten gebouwd, 211 met voorinvulling, 21 mislukt (zie §5), $25,52 uitgegeven (grootboek); ±350 gepland, dus de aanvulling kan nog ±118 etiketten toevoegen. Na de herhaalrun van de 21: $26,91.
- **Aanvulling vóór de bevestiging** (zwangerschap, MSC, Vegan Society, Weidemelk; in ronde 5 V-label (±18 kandidaten) en Nutri-Score E (hoogstens 20), samen ±25 gebouwd bij 67% zoals in de eerdere rondes, ±$3 bij $0,12 per gebouwd etiket, binnen de raming van ±350 etiketten (totaal ongewijzigd), stand vóór ronde 5 $33,57; [toetsset.md §4](toetsset.md#4-kandidaten-voor-de-toets-cap-2)) valt onder de post voorinvulling toets en haar grens van $65 (besluit Friso 01-11-2026); klare etiketten worden niet opnieuw betaald. Ze gebruikt de geplande ruimte van ±118 etiketten grotendeels; wat er daarna in dollars over is voor de aanvulling na de bevestiging, staat in het grootboek.
- **Voorinvulling ronde 9** (FSC, Triman, kunststofcode, PlanetProof op de 352 bestaande toetsetiketten; [toetsset.md §5](toetsset.md#5-ai-voorinvulling-cap-2)) valt onder dezelfde post en grens van $73 (verhoogd door Friso, 02-11-2026 22:20). Raming vóór uitgave (02-11-2026): kostenmodel gefit op de 352 gemeten voorinvullingen (`usage.cost`): $0,00220 per megapixel verstuurde tegel + $0,0164 per aanroep, R² 0,994 (model $35,86 tegen werkelijk $36,39). Met alle tegels ±$35,9; zonder lege tegels (2.091 van 9.980, standaardafwijking < 3) ±$28,9 bij 660 aanroepen. Resterend: $65 − $36,39 = $28,61. Besluit Friso 02-11-2026 22:20: grens verhoogd naar $73 (de raming $28,9 zonder lege tegels, $35,9 met alle tegels, past nu binnen het restant van $36,61). Stoppunt 5 blijft voor een overschrijding van $73. De startprojectie van het gereedschap gebruikt het kostenmodel, niet de vaste $0,06 per aanroep.
- **Voorlabels + achtergrondscreening: $55 hard** (besluit Friso 02-11-2026 22:20; eerder $50 van 01-11-2026). Ronde 9: de vier klassen voegen trainings-docs toe (trainingskant FSC 145, Triman 77, kunststofcode 128, PlanetProof 54 GTIN's; tot 80 per keurmerk), samen ±1.100 etiketten: ±$34 bij $0,012 per aanroep, ±$54 bij $0,019 (INFERENCE). Het hoge eind ligt boven $50: dan stopt de post op zijn beurt (stoppunt 5) en beslist Friso. Zelfde tegels als de voorinvulling, dus ±2,6–3 aanroepen per etiket: ±800 × 2,6 × $0,012 = ±$25, tot ±$35 (INFERENCE). De $0,012 per aanroep is niet gemeten; naar de verhouding van de tarieven met de gemeten voorinvulling kan het ±$0,019 per aanroep en ±$40 totaal worden (INFERENCE), dan stopt de bewaking per aanroep vóór $50. De post start als hij in de vaste volgorde aan de beurt is, zonder nieuwe vraag; komt de verwachte of werkelijke uitgave boven $50, dan stopt hij (stoppunt 5).
- **Vóór de start van een post** wordt de verwachte uitgave berekend (uitzondering: de voorinvulling van ronde 9 rekent met het kostenmodel hieronder, per open etiket $0,00220 × megapixel verstuurde tegels + $0,0164 × aanroepen): al uitgegeven (grootboek) plus, per open etiket, het aantal aanroepen (1 per 16 tegels, minstens 1) × de verwachte kosten per aanroep (voorinvulling $0,06, voorlabels $0,012). Een herhaald etiket betaalt al zijn aanroepen opnieuw. Ligt de verwachte uitgave boven de grens, dan start de post niet (stoppunt 5). De projectie is een schatting (vaste kosten per aanroep, extra aanroepen door de bytegrens van §5 niet meegeteld): stoppen halverwege wordt onwaarschijnlijk, niet onmogelijk. Stopt de bewaking tijdens de post, dan probeert een herstart alleen de open etiketten.
- **Tijdens een post** wordt een aanroep die de grens zou passeren niet verstuurd; de post stopt en meldt de stand.
- Kosten komen uit `usage.cost` van elk antwoord; ontbreekt dat, dan uit tokens × tarief.

## 4. Licenties (CAP-13)

- **Python-pakketten:** de controle leest van elk geïnstalleerd pakket de licentie uit de metadata (`License-Expression`, `License`, classifiers); is die leeg, dan de eerste regels van het meegeleverde licentiebestand.
  - Toegestaan: Apache-2.0, MIT, BSD (alle varianten), MPL-2.0, en — als exacte SPDX-id — `BSL-1.0` (Boost) en `CNRI-Python`, voor elk pakket (besluit Friso 01-11-2026; aanleiding: `torch`, `regex`). Niet toegestaan blijven onder meer `BUSL-1.1`, `BSL-1.1` en `CNRI-Jython`; elke andere licentie buiten de lijst blijft stoppunt 4.
  - Even ruim en toegestaan, en vermeld in het rapport: ISC, PSF, HPND, Unlicense, CC0, zlib.
  - Samengestelde uitdrukking: bij `AND` moeten alle delen toegestaan zijn, bij `OR` minstens één.
  - Elke andere of onbekende licentie → stoppunt 4.
- **Verboden pakketten**, ongeacht hun metadata: `ultralytics`, YOLOE, `PyMuPDF`/`fitz`, `albumentationsx`, `albumentations` ≥ 2.0.9, DEIMv2, `rfdetr_plus` (de platformmaten van RF-DETR), DINOv3. De extra's `plus` en `augment` van `rfdetr` worden niet geïnstalleerd (licentierisico via Albumentations en de platformlicentie).
- **Externe programma's**, alleen als los proces aangeroepen: `pdftoppm` en `pdftotext` (poppler; de briefing noemt de poppler-programma's als toegestaan alternatief voor PyMuPDF), `rsync`, `ssh`. Andere externe programma's niet.
- **Data van derden (NutriGreen, besluit Friso 01-11-2026):** de pakketregel hierboven geldt voor software. Voor NutriGreen geldt het eerdere besluit van story 12.25: CC BY-SA 4.0 met attributie is toegestaan voor intern gebruik. Attributie (zelfde tekst in `train-resultaat.json`): "Trained in part on the NutriGreen Image Dataset: A Collection of Annotated Nutrition, Organic, and Vegan Food Products, by Jan Drole, Igor Pravst, Tome Eftimov and Barbara Koroušić Seljak; Zenodo, doi:10.5281/zenodo.10020545; licence CC BY-SA 4.0." Bron: de Zenodo-record (gelezen 01-11-2026); de makers in story 12.25 klopten niet met de record. Share-alike is hier alleen aanvaardbaar omdat het om intern gebruik in een experiment gaat; publiceren of verspreiden van het model of van afgeleide data vraagt een nieuwe beoordeling (INFERENCE).
- **Data van derden (Open Food Facts, besluit Friso 02-11-2026):** zelfde regel als NutriGreen. Foto's: CC BY-SA ("Products images are available under the Creative Commons Attribution ShareAlike licence"; de voorwaardenpagina linkt de 3.0-akte); vakjes en benoeming komen uit de database: ODbL, inhoud DbCL. Commercieel gebruik is toegestaan met naamsvermelding en delen onder dezelfde voorwaarden; machine learning wordt niet genoemd; de licentie dekt alleen de foto, niet het merkrecht van de keurmerkhouder (bron: world.openfoodfacts.org/terms-of-use, gelezen 01-11-2026, research datasets-keurmerken §3). Attributie (zelfde tekst in `train-resultaat.json`): "Trained in part on logo crops from Open Food Facts product photos (© Open Food Facts contributors, https://world.openfoodfacts.org), licence CC BY-SA 3.0; logo boxes and annotations from the Open Food Facts database (Robotoff), licence ODbL." Share-alike is alleen aanvaardbaar bij intern gebruik in een experiment; publiceren of verspreiden van het model, de uitsneden of afgeleide data vraagt een nieuwe beoordeling (INFERENCE).
- **Gewichten:** URL, sha256 en licentie van elk gedownload model (RF-DETR N/S/M/L: Apache-2.0; SigLIP 2 voor K4-aa: Apache-2.0) in `bevroren.json`.
- Gemeten op 31-10-2026 in een wegwerpomgeving: `rfdetr[train]` 1.11.2 trekt 87 pakketten mee; `faster-coco-eval` en `torch-hungarian` hebben geen licentiemetadata en vallen terug op hun Apache-2.0-licentiebestand.
- Gemeten op 01-11-2026 in de detectoromgeving: `torch` 2.15.0 (`… AND BSL-1.0 AND …`) en `regex` 2026.9.29 (`Apache-2.0 AND CNRI-Python`) vielen buiten de oorspronkelijke lijst (stoppunt 4); Friso liet BSL-1.0 en CNRI-Python op 01-11-2026 toe. Na de bouw wordt de controle opnieuw gedraaid; aantal pakketten, nul overtredingen en de lijst "even ruim" komen in het buildverslag.

## 5. Verzoekgrootte

Geldt voor de voorinvulling en de voorlabels (heel etiket plus tegels per verzoek).

- Overzicht en tegels gaan als **JPEG (kwaliteit 90)**. Hinttegels en beelden voor de invulpagina blijven PNG, net als de zdr-proef. De client bepaalt het beeldtype uit de eerste bytes (PNG of JPEG) en geeft het mee; elk ander type is een fout vóór verzenden.
- Per verzoek hoogstens **16 tegels** naast het overzicht en hoogstens **20.000.000 bytes** aan beelden, overzicht meegeteld, gemeten vóór base64 (±26,7 MB op de lijn). Past de volgende tegel niet meer, dan gaat hij in een extra aanroep; de uitkomsten worden samengevoegd (aanwezig als een aanroep het zag, hinttegels op etiketindex, vakjes in etiketcoördinaten).
- Past het overzicht plus één tegel niet binnen de grens, dan wordt niets verstuurd en is het een fout voor dit etiket (`te_groot`); die telt niet mee voor "vijf weigeringen op rij".
- De voorinvulling legt per etiket het beeldtype vast (`jpeg`); ontbreekt het, dan ging het etiket als PNG (vóór 01-11-2026).
- Aanleiding (01-11-2026): 21 van 232 etiketten kregen geen voorinvulling; hun verzoek was 30–40 MB, elk geslaagd verzoek ≤ 29,8 MB. Gemeten op die 21: ruwe PNG-beeldbytes per aanroep 22,6–30,1 MB, als JPEG 2,7–5,1 MB.
