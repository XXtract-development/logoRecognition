---
titel: Randvoorwaarden proef getrainde detector — privacy, foutafhandeling, kosten, licenties, verzoekgrootte
hoort-bij: SPEC.md (Constraints, CAP-2, CAP-5, CAP-11, CAP-13, CAP-14)
datum: 2026-10-31
bijgewerkt: 2026-11-01 (ronde 3: verzoekgrootte, grens voorinvulling $65)
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
| voorinvulling toets (`anthropic/claude-sonnet-5.5`) | ±350 etiketten | $0,12 (gemeten) | ±$42 | **$65, hard** (besluit Friso 01-11-2026 ±14:05) |
| voorlabels + achtergrondscreening training (`google/gemini-3.8-flash`) | ±800 etiketten | ±$0,012 | ±$10 | $15 (1,5×; zie hieronder) |
| beoordelaar (validatie + toets) | ±1.500 kandidaten | ±$0,002 | ±$3 | $4,50 (1,5×) |
| K4-aa op de toets (gefilterd + informatief volledig) | 2 × ±350 etiketten | ±$0,012 | ±$8 | $12 (1,5×) |
| **totaal** | | | **±$63** (verwacht ±$78–83 met de voorlabels op 2,6–3×, INFERENCE) | |

- **Grens per post:** 1,5× de raming, tenzij Friso een vaste grens besliste. Een andere grens geeft het gereedschap alleen met een besluitverwijzing (`--grens` met `--besluit`, voor de voorinvulling en de voorlabels); zo kan een harde grens niet stil verhoogd worden.
- **Voorinvulling toets: $65 hard** in plaats van 1,5 × $21 = $31,50 (besluit Friso 01-11-2026 ±14:05). Reden, gemeten op de 211 etiketten met voorinvulling: gemiddeld $0,12 per etiket (mediaan $0,08, p90 $0,30, max $0,59), omdat een etiket gemiddeld 33 tegels van 1024 px heeft (mediaan 20, p90 88, max 180) en dus 2,6 aanroepen; ≤ 4 tegels kost $0,016, > 16 tegels $0,18. Stand bij het besluit: 232 etiketten gebouwd, 211 met voorinvulling, 21 mislukt (zie §5), $25,52 uitgegeven (grootboek); ±350 gepland, dus de aanvulling kan nog ±118 etiketten toevoegen.
- **Voorlabels + achtergrondscreening:** zelfde tegels, dus naar verwachting ±$25–30 tegen grens $15: 2,6–3× de raming (INFERENCE: ±800 etiketten × 2,6 aanroepen × $0,012 = ±$25, in plaats van de ene aanroep per etiket waarop de raming rustte). Friso beslist over deze grens voordat de post start (stoppunt 5); de startcontrole hieronder weigert hem tot dan.
- **Vóór de start van een post** wordt de verwachte uitgave berekend: al uitgegeven (grootboek) plus, per open etiket, het aantal aanroepen (1 per 16 tegels, minstens 1) × de verwachte kosten per aanroep (voorinvulling $0,06, voorlabels $0,012). Een herhaald etiket betaalt al zijn aanroepen opnieuw. Ligt de verwachte uitgave boven de grens, dan start de post niet (stoppunt 5). De projectie is een schatting (vaste kosten per aanroep, extra aanroepen door de bytegrens van §5 niet meegeteld): stoppen halverwege wordt onwaarschijnlijk, niet onmogelijk. Stopt de bewaking tijdens de post, dan probeert een herstart alleen de open etiketten.
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
