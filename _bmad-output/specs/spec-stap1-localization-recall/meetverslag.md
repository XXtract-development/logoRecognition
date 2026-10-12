---
title: Meetverslag stap-1-lokalisatie
spec: SPEC-stap1-localization-recall
datum: 2026-10-12
omgeving: ACC ml-service f40a2a0 (container ml-service-qsookwow8koko0kwg00g0cwk-122152972183), model anthropic/claude-sonnet-5.5 via OpenRouter
status: gestopt bij productkeuze (kosten en valse meldingen)
---

# Meetverslag stap 1

> [!warning] Geen variant haalt alle eisen
> Tegelen (heel etiket + tegels) wijst ruim 2,5× zoveel gemiste logo's aan en vindt 2,3× zoveel top-15-keurmerken, maar geeft ook 10 extra niet-gedeclareerde meldingen per 40 etiketten en kost ±5× zoveel modeltokens. Dat botst met de eis "valse meldingen stijgen niet" en is een kostenkeuze: de bouw is gestopt vóór de tests en de code, tot de productowner kiest.

## Werkwijze

- Proefscript in de ml-service-container op ACC; sleutel alleen in het geheugen van het proces. Stap 1 zoals de localize-route (voorbewerking `proposal_image`, parser `parse_proposals`, GHS-detectie, templateverfijning), daarna de echte classify-route van dezelfde container (`persist_crops=false`).
- Fase A (dekking): 83 etiketten (alle 61 met een `niet_aangewezen`/`verkeerd_benoemd`-geval, de 19 met een gevonden top-15-geval, 10 controle-etiketten zonder gemist geval; deels overlappend), elke variant 2 runs, zonder templateverfijning (tijd).
- Fase B (eindresultaat): 40 etiketten (de eerste 30 op doc-id met een `niet_aangewezen`-geval + de eerste 10 zonder gemist top-15-geval), V0 en VTF elk 2 runs, mét verfijning en classify; elke run ook geclassificeerd mét region-proposer-vakjes (+RP).
- Telling: Python-port van `gs1-block.ts` (per soort beste detectie, drempel per methode); nagerekend op de 186 opgeslagen ACC-scans: 0 afwijkingen, 19/140 top-15 zoals in het onderzoek.
- Logoposities: 4 AI-annoteerders, 76 gevallen, alle 76 met minstens één vak, elk vak gecontroleerd op een ingezoomde uitsnede.
- Totaal modelaanroepen: fase A 2.464, fase B 446. ACC-proefbestanden daarna verwijderd van host en container (gecontroleerd met `ls`).

## Varianten

| code | wat | aanroepen per scan |
|---|---|---|
| V0 | huidige stap 1: één vraag, beeld tot 2400 px | 1 |
| VP | V0 met scherpere prompt (uitputtend, kleine logo's, herhaalde aanzichten) | 1 |
| VT4 | alleen tegels, ≤ 4, 15% overlap | ≤ 4 |
| VT | alleen tegels, ≤ 6 | ≤ 6 |
| VTF | heel etiket + ≤ 5 tegels | ≤ 6 |
| +RP | klassieke region proposer erbij (geen modelkosten) | +0 |

## Fase A — dekking (gemiddelde van 2 runs, maat 1/9)

| variant | niet_aangewezen /56 | verkeerd_benoemd /20 | gevonden /19 | Nutri-Score /30 | aanroepen med | tokens in med | tokens uit med |
|---|---|---|---|---|---|---|---|
| V0 | 14,5 | 8,0 | 15,0 | 12,0 | 1 | 3.999 | 174 |
| VP | 11,5 | 9,0 | 15,0 | 12,0 | 1 | 4.131 | 184 |
| VT4 | 31,5 | 14,0 | 14,0 | 21,0 | 4 | 15.912 | 180 |
| VT | 42,5 | 16,0 | 14,5 | 23,0 | 5 | 18.748 | 196 |
| **VTF** | **38,0** | **16,0** | **18,5** | **25,0** | 5 | 19.832 | 365 |
| V0+RP | 26,5 | 14,5 | 15,5 | 18,0 | 1 | 3.999 | 174 |
| VTF+RP | 42,5 | 17,5 | 18,5 | 27,0 | 5 | 19.832 | 365 |

- Gevoeligheid (1/4 en 1/25 i.p.v. 1/9) verschuift elke variant hoogstens 2,5 gevallen; de volgorde blijft gelijk.
- Controle van de maat: de opgeslagen ACC-vakjes dekken 14/20 `verkeerd_benoemd` (eis ≥ 18). Bij 4 omvat het eerdere vakje maar 39–66% van het logo, bij 2 lag het op een andere plek dan de annotatie; het eerdere AI-oordeel was dus ruim. De maat is ongewijzigd gebruikt; alle varianten worden tegen V0 in dezelfde sessie vergeleken.
- V0 is wisselvallig: de opgeslagen ACC-run dekte 0/56 `niet_aangewezen`, de herhalingen 13 en 16.
- VT zonder het hele etiket verliest gevonden gevallen (14,5 tegen 15); VTF houdt ze (18,5).

## Fase B — eindresultaat (40 etiketten, beide runs geldig op alle 40)

| variant | run | top-15 gevonden /50 | alle gedeclareerd /78 | niet-gedeclareerd ≥ drempel | Nutri-Score /16 | GHS /2 |
|---|---|---|---|---|---|---|
| V0 | 1 / 2 | 4 / 5 | 6 / 8 | 4 / 4 | 3 / 4 | 0 / 0 |
| VTF | 1 / 2 | 11 / 10 | 16 / 15 | **14 / 14** | 9 / 8 | 2 / 2 |
| V0+RP | 1 / 2 | 16 / 16 | 21 / 21 | **44 / 44** | 9 / 9 | 2 / 2 |
| VTF+RP | 1 / 2 | 18 / 17 | 23 / 22 | **48 / 47** | 11 / 10 | 2 / 2 |

- Niet-gedeclareerde meldingen bij VTF (2 runs samen, 28): Nutri-Score A 10, FSC MIX 3, uitroepteken 2, Triman 2, EU-bio 2, Nutri-Score D 2, Weidemelk 2, recycling 2, AISE 1, Nutri-Score E 1, Groene Punt 1. Bij V0 (8): Nutri-Score A 4, uitroepteken 1, Nutri-Score E 1, AISE 1, FSC MIX 1. INFERENCE: een deel hiervan zijn echte maar niet-gedeclareerde logo's (declaratie is geen bewijs); de Nutri-Score-A-meldingen wijzen op een leesfout in stap 2 die vaker optreedt nu stap 1 meer balken aanwijst. Dat vraagt menselijke beoordeling.
- Mislukte scans: 0 in de classify-fase. Modelantwoorden met een omgekeerd vakje ("Invalid proposal order"), die in de pijplijn de hele scan laten mislukken: V0 2/80 runs, VTF 3/80 runs; in fase A V0 6/166, VTF 14/166 scans. Bij meer aanroepen per scan stijgt die kans; een bouw moet zo'n los vakje overslaan in plaats van het antwoord te weigeren.
- Unie > 64 vakjes: 0 scans zonder RP; met RP 16–26 van 40 (zou in de pijplijn falen of moeten afkappen).

## Tijd (fase B, stap 1 + classify, onder belasting van 2 parallelle proefprocessen plus live verkeer)

| variant | mediaan | p90 | max | waarvan verfijning (mediaan) |
|---|---|---|---|---|
| V0 | 14 s | 37–45 s | 72 s | 9 s |
| VTF | 35–37 s | 86–95 s | 127 s | 28–31 s |

De modelaanroepen lopen parallel (mediaan 4 s, max 16 s); de extra tijd komt van de templateverfijning per voorstel (±5 s per voorstel op deze container). VTF blijft onder 165 s, maar het maximum (127 s) zit dichter bij de grens.

## Kosten per scan

| variant | aanroepen | tokens in (gem.) | tokens uit (gem.) |
|---|---|---|---|
| V0 | 1 | 3.791 | 179 |
| VTF | 5 (max 6) | 19.511 | 396 |

VTF kost ±5,1× zoveel invoertokens en ±2,2× zoveel uitvoertokens per scan. Prijs per token is hier niet gemeten (AANNAME: zelfde tarief per token als nu).

## Uitkomst tegen de spec

| eis | VTF | oordeel |
|---|---|---|
| CAP-1 dekking +10 boven V0 | +23,5 (14,5 → 38) | gehaald |
| CAP-1 regressie ≥ V0 | 18,5 ≥ 15 | gehaald |
| CAP-2 gevonden stijgt | top-15 4,5 → 10,5 | gehaald |
| CAP-2 niet-gedeclareerd 0 extra | 4 → 14 per run | **niet gehaald** |
| CAP-3 tijd ≤ 165 s, 0 overschrijdingen | max 127 s, 0 | gehaald |
| CAP-4 GHS/Nutri-Score dalen niet | NS 3,5 → 8,5; GHS 0 → 2 | gehaald |
| Kosten ≤ 6 aanroepen | 5 (max 6) | binnen plafond, ±5× tokens |

Region proposer erbij valt af (niet-gedeclareerde meldingen ×11). Scherpere prompt valt af (geen winst).

## Open voor de productowner

1. Accepteert u ±5× modelkosten per scan voor 2,3× zoveel gevonden top-15-keurmerken?
2. Accepteert u daarbij meer niet-gedeclareerde meldingen (4 → 14 per 40 etiketten), of moet eerst stap 2 (Nutri-Score-lezing, poort) die meldingen terugdringen voordat tegelen live gaat?
