---
title: Meetplan stap-1-lokalisatie
spec: SPEC-stap1-localization-recall
---

# Meetplan

## Materiaal (lokaal, nooit in de repo)

- Etiketten: de 195 beelden die de pijplijn kreeg (`definitief/api-invoer/`, sessie ddabd0a8).
- Nulmeting: ACC-uitkomsten f40a2a0 (`hermeting/out/*.json`, sessie 21776626); `detections` = alle stap-1-vakjes (geverifieerd: `stap1.vakjes = len(detections)` bij 186/186).
- Gemiste gevallen: `hermeting/verlies/gevallen.json` + `vooroordeel.json` (90; 56 `niet_aangewezen`, 20 `verkeerd_benoemd`).
- Declaraties: `_bmad-output/planning-artifacts/eindtest-logo-pijplijn/declaraties-prod-basiseenheden-20261008.tsv`.

## Coördinaten

Alle vakjes (annotaties, ACC-vakjes, varianten) in pixels van het beeld zoals de API het naar de ml-service stuurt: het `api-invoer`-bestand na EXIF-draaiing. Controle vooraf: op 3 etiketten vallen de opgeslagen ACC-vakjes op de verwachte inhoud.

## Dekking

- Doelpopulatie: de 56 gevallen `niet_aangewezen`. Controlepopulatie: de 20 `verkeerd_benoemd` (bij de huidige stap 1 ≥ 18/20 gedekt, anders klopt maat of annotatie niet). Regressiepopulatie: de 19 gevonden top-15-gevallen (logopositie = het vakje van het gevonden item).
- Logopositie: AI-annoteerders zoeken het gedeclareerde logo op het etiket met een rasterzoom en controleren hun eindvak op de uitsnede. Vinden zij het logo niet, dan valt het geval uit de noemer (apart gerapporteerd).
- Een vakje B **omvat** logo L als `opp(B ∩ L) / opp(L) ≥ 0,7` én `opp(L) / opp(B) ≥ 1/9`. Gevoeligheid gerapporteerd bij 1/4, 1/9 en 1/25.
- Een geval is gedekt als minstens één voorkomen van het logo door minstens één vakje omvat wordt. Teller en noemer altijd tonen; Nutri-Score apart.
- Het visuele model geeft per run een ander antwoord: de huidige stap 1 (V0) en elke kandidaat draaien elk twee keer in dezelfde sessie; vergeleken wordt het gemiddelde.

## Varianten

Elke variant krijgt hetzelfde beeld en dezelfde voorbewerking als de pijplijn. Per variant: dekking (doel/controle/regressie), vakjes per etiket (mediaan/p90/max na begrenzing op 64), modelaanroepen en tokens per scan, tijd per scan (mediaan/p90/max), mislukte aanroepen.

- Offline (lokaal, geen netwerk): de klassieke region proposer, los en als aanvulling op de V0-vakjes.
- Op ACC (ml-service-container; sleutel blijft in de container): varianten die het visuele model anders of vaker aanroepen (tegels/aanzichten splitsen, scherpere prompt), hoogstens 6 aanroepen per scan.

## Proef (eindresultaat)

- Selectie: alle etiketten met een `niet_aangewezen`-geval (hoogstens 30, gesorteerd op doc-id) plus de eerste 10 etiketten (op doc-id) zonder gemist top-15-geval, voor valse meldingen. Ids in het meetverslag.
- In de ml-service-container op ACC: stap 1 per variant zoals de localize-route (inclusief templateverfijning en GHS), daarna de echte classify-route van dezelfde container (`persist_crops=false`, geen schrijfacties). V0 als controle in dezelfde sessie.
- Telling zoals de API (`gs1-block.ts`): per soort de beste detectie; gevonden als de zekerheid ≥ de drempel van de methode (`getThresholdForMethod`: embedding 0,80, Nutri-Score- en GHS-routes hun eigen drempel) en de soort gedeclareerd is; valse melding als de soort niet gedeclareerd is; soorten op `uit` in de omzettabel tellen niet. `twijfelachtig` telt mee, zoals in `vergelijk-voor-na.py`. De telling wordt eerst gecontroleerd door de opgeslagen ACC-detecties ermee na te rekenen (moet 19/140 en 34 geven).
- Mislukte scans tellen apart; vergeleken wordt alleen op etiketten die in beide runs geldig zijn.
- Opruimen: script, beelden en uitvoer van host én container verwijderen en met `ls` controleren.
