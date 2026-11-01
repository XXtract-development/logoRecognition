---
titel: Randvoorwaarden proef getrainde detector — privacy, foutafhandeling, kosten, licenties
hoort-bij: SPEC.md (Constraints, CAP-11, CAP-13, CAP-14)
datum: 2026-10-31
---

# Randvoorwaarden

Dit bestand is de enige plek voor privacy, foutafhandeling van taalmodelaanroepen, kosten en licenties. De stoppunten staan alleen in [SPEC.md](SPEC.md#constraints).

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

Raming (tarieven OpenRouter 30-10-2026; per post stoppen bij 1,5×):

| post | aantal | per stuk | raming |
|---|---|---|---|
| voorinvulling toets (`anthropic/claude-sonnet-5.5`) | ±350 etiketten | ±$0,06 | ±$21 |
| voorlabels + achtergrondscreening training (`google/gemini-3.8-flash`) | ±800 etiketten | ±$0,012 | ±$10 |
| beoordelaar (validatie + toets) | ±1.500 kandidaten | ±$0,002 | ±$3 |
| K4-aa op de toets (gefilterd + informatief volledig) | 2 × ±350 etiketten | ±$0,012 | ±$8 |
| **totaal** | | | **±$42** |

- **Vóór de start van een post** wordt de verwachte uitgave berekend (aantal × gemeten of geraamde kosten per stuk). Ligt die boven 1,5× de raming, dan start de post niet (stoppunt 5). Zo kan een toetsrun niet halverwege op de grens stuiten.
- **Tijdens een post** wordt een aanroep die de grens van 1,5× zou passeren niet verstuurd; de post stopt en meldt de stand.
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
