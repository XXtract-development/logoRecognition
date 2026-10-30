---
titel: "Beslisrapport spike architectuurkeuze logoherkenning — fase B (voorlopig)"
datum: 2026-10-30
status: voorlopig — AI-labels, vóór adjudicatie door Friso
spec: SPEC.md (CAP-5), meetopzet.md v5 (§0 gaat vóór)
meetset: 173 etiketten, voorlopige-selectie.json (input_sha256 ba4001a3…), 186 positieve paren
bevriezing: edbe79b (opzet, 12:30:33) en 1aec88a (telscript, 12:45:29), beide vóór de eerste aanroep resp. telling
tabellen: fase-b/tabellen.md (gegenereerd door fase-b/fb_rapport.py uit tel.py-uitvoer)
---

# Beslisrapport fase B — welke opzet voor logoherkenning?

> [!warning] Voorlopig
> De waarheid is een AI-oordeel: voorstellen van twee Claude-beoordelaars, bevestigd door Codex. Ontbrekende logo's zijn geen betrouwbaar negatief. Daarom is elk "vals"-cijfer hieronder een **bovengrens**: het aandeel meldingen zonder waarheidsvak. Een deel daarvan is waarschijnlijk terecht (§5). De rangorde geldt tot Friso de adjudicatielijst heeft beoordeeld. Pas daarna telt de eis "<10% vals" mee (meetopzet §0 en §5).

**Varianten in het kort:**
- **B0**: de huidige ACC-route.
- **K1a / K1b**: een taalmodel zoekt én benoemt de logo's op het hele etiket plus tegels. K1a gebruikt Gemini 3.8 Flash, K1b Claude Sonnet 5.5.
- **VTF**: de stap "vakjes zoeken" van de huidige code, met 6 aanroepen (heel etiket + tegels).
- **K2a / K2b**: VTF, daarna benoemen met beeldnetwerk SigLIP 2 resp. DINOv3.
- **K3b**: VTF, daarna een getrainde classifier.
- **K3c**: OWLv2 zoekt zonder taalmodel, SigLIP 2 benoemt.
- **K4-xy**: de vakjes van K1x, met een controle door K2y. Voorbeeld: K4-aa = K1a met een SigLIP 2-controle.

Volledige definities: §2.

## 1. Uitkomst

**K1a vindt het meest. Het is ook de goedkoopste taalmodelroute, even duur als K4-aa en K4-ab.**
- Over de 12 keurmerken met genoeg voorbeelden vindt K1a 145 van 161 paren op de juiste plek: 90%. Wilson 84–94%; dat interval houdt geen rekening met clustering per merk, dus het is te smal (§7).
- B0, de huidige route, vindt er 20 van 161: 12%.
- Kosten per etiket: K1a $0,012, K1b $0,058, VTF-routes $0,042. K3c kost alleen rekentijd.

**K4-aa, dus K1a met een SigLIP 2-controle, halveert het aandeel meldingen zonder waarheidsvak.**
- Het daalt van 22% (72 van 323, slechtste run) naar 10–11% (29 van 262).
- Dat kost 1 vondst: 144 van 161.
- INFERENCE: niet uit te sluiten is dat de controle ook echte, niet-gelabelde logo's wegfiltert. Dat blijkt pas na de adjudicatie.

**Een formele winnaar is er niet.** De intervallen van K1a (84–94%), K4-aa (84–93%), K1b (79–90%), K3c (78–89%) en de overige K4 (77–90%) overlappen.
- Stabiel in alle vier deelverzamelingen (alle paren, zonder lekparen, alleen aanvulling, alleen kern) zijn alleen de top (K1a en K4-aa) en de scheiding met K2a, K2b en K3b.
- Die scheiding is ook statistisch gedragen: de laagste ondergrens bovenin is 77%, de hoogste bovengrens van K2a is 70%.
- De volgorde daartussen wisselt per deelverzameling.

**Aanbeveling.**
- Bouw K1a als route. Dat is volgens de vooraf vastgelegde rangorde (meetopzet §0) nummer één.
- Bouw de SigLIP 2-controle (K4-aa) mee als schakelbare stap.
- Kies tussen beide na de adjudicatie van lijst A (§8). Valideer daarna op door Friso bevestigde etiketten.
- INFERENCE: de keuze voor K4-aa hangt aan vals%, en vals% beslist vóór de adjudicatie nog niets.

**Randvoorwaarde.** K1a stuurt klantartwork naar Google: 1.030 aanroepen via AI Studio en 544 via Vertex. De bewaar- en trainingsvoorwaarden van Google en de privacy-instellingen van het OpenRouter-account zijn niet gecontroleerd (§7). Dat moet gebeuren vóór een bouwbesluit.

**Grenzen.**
- **Groene Punt** en **Recyclebaar** haalt geen enkele variant: beste run 67% (12/18) resp. 55% (6/11). INFERENCE: dit is waarschijnlijk een definitiekwestie (§4).
- **Nutri-Score A, Nutri-Score B en Vegan algemeen** hebben te weinig voorbeelden: 8, 8 en 9.

**K3c (OWLv2 + SigLIP 2, alleen rekentijd) vindt ook veel, maar meldt vooral ruis.**
- VERIFIED: 136 van 161 gevonden, en herhaalbaar: 0 van 186 paren wisselen tussen de runs.
- VERIFIED: 2.824 van de 3.172 meldingen (89%) hebben geen waarheidsvak. Voorbeelden: "Vegan algemeen" 1.314×, Groene Punt 490×, EU-bio 488×, Recyclebaar 311×.
- INFERENCE over de oorzaak: OWLv2 levert per venster 50 kandidaten, en SigLIP 2 zonder kalibratie geeft daarvan te veel een top-15-code boven 0,80.
- Zonder gekeurde negatieven is K3c als route niet bruikbaar.

## 2. Wat er gemeten is

| variant | stap 1 (vinden) | stap 2 (benoemen) | runs |
|---|---|---|---:|
| B0 | huidige ACC-route b6a0857 (1 aanroep Sonnet 5.5, ≤2400 px) | EfficientNet-B0, API-drempels | 1 (nulmeting 30-10, hergebruikt) |
| K1a | Gemini 3.8 Flash, heel etiket + ≤5 tegels (≤1500 px), antwoordschema met 15 codes + "ander" | zelfde aanroep | 2 |
| K1b | Claude Sonnet 5.5, zelfde opzet | zelfde aanroep | 2 |
| K2a / K2b | VTF: stap 1 van b6a0857 met 6 aanroepen (Sonnet 5.5) | SigLIP 2 B/16 resp. DINOv3 ViT-S/16, cosinus top-1 ≥ 0,80 | 2 |
| K3b | VTF | logistische regressie op SigLIP 2 (C=100, geen onbekend-klasse), p ≥ 0,80 | 2 |
| K3c | OWLv2 beeld-gestuurd op de K1-vensters (CPU) | SigLIP 2 zoals K2a | 2 |
| K4-xy | vakjes van K1x | code blijft alleen als K2y hem in zijn top 3 heeft | 2 (afgeleid) |

Niet gemeten: K3a (non-goal). K2 en K3 draaien "niet gekalibreerd" op 0,80, omdat vraag 6 (door Friso gekeurde negatieven) niet is uitgevoerd.

## 3. Hoofdtabel per keurmerk

Alle paren. Elke cel is `gevonden/aanwezig · niet-gelabeld/meldingen`, beide uit dezelfde run: de run met het laagste gevonden%. "Meldingen" = niet-gelabeld + geraakte waarheidsvakken. Per keurmerk staat ook het aantal paren (n) en het aantal merken (GLN).

Volledige tabellen met Wilson- en GLN-bootstrapintervallen, het hoogste vals% per run, het oordeel per variant, alle deelverzamelingen, stabiliteit en verwarbare paren: [fase-b/tabellen.md](fase-b/tabellen.md).

| keurmerk | n | GLN | b0 | k1a | k1b | k2a | k2b | k3b | k3c | k4-aa | k4-ab | k4-ba | k4-bb |
|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|
| Beter Leven 1* | 14 | 3 | 1/14 · 1/2 | 14/14 · 4/22 | 14/14 · 1/19 | 11/14 · 1/13 | 10/14 · 10/21 | 11/14 · 0/13 | 13/14 · 0/16 | 14/14 · 1/19 | 14/14 · 1/19 | 14/14 · 1/19 | 14/14 · 0/18 |
| V-label vegan | 11 | 7 | 0/11 · 0/0 | 9/11 · 3/12 | 8/11 · 5/13 | 7/11 · 2/9 | 6/11 · 0/6 | 5/11 · 0/5 | 9/11 · 6/15 | 9/11 · 0/9 | 8/11 · 0/8 | 8/11 · 1/9 | 7/11 · 1/8 |
| EU-bio | 12 | 9 | 3/12 · 0/3 | 12/12 · 4/19 | 12/12 · 6/21 | 11/12 · 19/32 | 8/12 · 1/9 | 7/12 · 0/7 | 12/12 · 488/503 | 12/12 · 3/18 | 12/12 · 3/18 | 12/12 · 3/18 | 12/12 · 2/17 |
| FSC Mix | 15 | 5 | 3/15 · 13/16 | 15/15 · 3/21 | 12/15 · 8/21 | 12/15 · 2/15 | 9/15 · 12/22 | 11/15 · 1/12 | 15/15 · 14/30 | 15/15 · 1/19 | 15/15 · 0/18 | 12/15 · 4/17 | 12/15 · 6/19 |
| Groene Punt | 18 | 10 | 2/18 · 2/4 | 11/18 · 9/20 | 12/18 · 16/28 | 8/18 · 18/26 | 8/18 · 0/8 | 3/18 · 0/3 | 10/18 · 490/500 | 11/18 · 4/15 | 11/18 · 0/11 | 12/18 · 8/20 | 12/18 · 5/17 |
| MSC | 13 | 5 | 1/13 · 0/2 | 13/13 · 0/20 | 13/13 · 7/27 | 10/13 · 0/17 | 7/13 · 0/12 | 8/13 · 0/15 | 13/13 · 4/24 | 13/13 · 0/20 | 13/13 · 0/20 | 13/13 · 1/21 | 13/13 · 0/20 |
| Nutri-Score A | 8 | 5 | 3/8 · 2/5 | 8/8 · 5/18 | 8/8 · 2/14 | 4/8 · 5/13 | 2/8 · 6/9 | 0/8 · 0/0 | 5/8 · 19/29 | 7/8 · 3/15 | 5/8 · 0/9 | 8/8 · 0/12 | 5/8 · 2/10 |
| Nutri-Score B | 8 | 5 | 3/8 · 0/5 | 7/8 · 13/23 | 8/8 · 3/14 | 1/8 · 0/1 | 1/8 · 0/1 | 0/8 · 0/0 | 1/8 · 1/2 | 3/8 · 2/5 | 2/8 · 3/6 | 4/8 · 1/6 | 2/8 · 0/3 |
| Nutri-Score C | 15 | 3 | 4/15 · 1/5 | 14/15 · 4/20 | 14/15 · 5/21 | 3/15 · 0/3 | 6/15 · 8/14 | 0/15 · 0/0 | 13/15 · 37/52 | 13/15 · 2/17 | 12/15 · 1/14 | 12/15 · 1/15 | 14/15 · 1/16 |
| Zwangerschap | 10 | 4 | 1/10 · 1/2 | 10/10 · 5/15 | 9/10 · 3/12 | 7/10 · 1/8 | 7/10 · 14/21 | 5/10 · 0/5 | 10/10 · 109/119 | 10/10 · 2/12 | 10/10 · 3/13 | 9/10 · 0/9 | 9/10 · 0/9 |
| Rainforest All. | 14 | 6 | 2/14 · 1/4 | 13/14 · 3/17 | 13/14 · 13/27 | 5/14 · 1/7 | 7/14 · 8/16 | 6/14 · 1/8 | 13/14 · 12/26 | 13/14 · 3/17 | 13/14 · 3/17 | 13/14 · 5/19 | 13/14 · 5/19 |
| Recyclebaar | 11 | 9 | 0/11 · 2/2 | 4/11 · 0/4 | 4/11 · 3/8 | 5/11 · 33/38 | 4/11 · 46/50 | 4/11 · 3/7 | 6/11 · 311/317 | 4/11 · 0/4 | 4/11 · 0/4 | 4/11 · 2/7 | 4/11 · 2/7 |
| Vegan algemeen | 9 | 7 | 0/9 · 1/1 | 7/9 · 8/16 | 6/9 · 7/14 | 3/9 · 54/58 | 1/9 · 7/8 | 1/9 · 3/4 | 5/9 · 1314/1319 | 6/9 · 5/12 | 4/9 · 2/7 | 6/9 · 4/11 | 4/9 · 0/5 |
| Vegan Society | 11 | 4 | 0/11 · 0/0 | 11/11 · 2/14 | 9/11 · 14/23 | 3/11 · 5/8 | 4/11 · 0/4 | 2/11 · 0/2 | 5/11 · 7/12 | 11/11 · 0/12 | 7/11 · 1/9 | 8/11 · 7/15 | 7/11 · 8/15 |
| Weidemelk | 17 | 6 | 3/17 · 0/4 | 17/17 · 4/28 | 17/17 · 8/32 | 15/17 · 3/24 | 14/17 · 0/19 | 14/17 · 2/21 | 17/17 · 12/36 | 17/17 · 2/26 | 17/17 · 1/25 | 17/17 · 3/26 | 17/17 · 2/26 |

## 4. Oordeel per keurmerk

Gemeten op de run met het laagste gevonden%, alle paren, vóór adjudicatie.
- "Vindt het" = ≥80% gevonden in beide runs.
- "Onzeker" = Wilson-ondergrens onder 80% of minder dan 5 GLN's.
- Vals% is een puntschatting van de bovengrens, met het Wilson-95%-interval erbij.

| keurmerk | beste opzet | oordeel en onderbouwing |
|---|---|---|
| Beter Leven 1 ster | K1a, K1b, alle K4 | Vindt het, onzeker: 14/14, maar 3 GLN's. K4-aa niet-gelabeld 1/19 (5%; Wilson tot 25%). |
| V-label vegan | K1a / K4-aa | Vindt het, onzeker: 9/11 (82%; Wilson 52–95%). K4-aa niet-gelabeld 0/9 (0%; tot 30%). |
| EU-biologisch | K1a, K1b, K4 | Vindt het, onzeker: 12/12. K4-aa niet-gelabeld 3/18 (17%). |
| FSC Mix | K1a / K4-aa | Vindt het, onzeker: 15/15. K4-aa niet-gelabeld 1/19 (5%; tot 25%). |
| Groene Punt | K1b (beste run 12/18) | Geen variant vindt het. Gat 13 procentpunt. INFERENCE: de grens met algemene recyclingsymbolen; past bij de waarschuwing in LEESMIJ over de definitie. |
| MSC | K1a, K1b, K4 | Vindt het, onzeker: 13/13, 5 GLN's, Wilson-ondergrens 77%. K4-aa niet-gelabeld 0/20 (0%; tot 16%). |
| Nutri-Score A | K1a (8/8) | Te weinig voorbeelden (8). |
| Nutri-Score B | K1b (8/8) | Te weinig voorbeelden (8). |
| Nutri-Score C | K1a / K4-bb | Vindt het, onzeker: 13–14/15, maar 3 GLN's. K4-aa niet-gelabeld 2/17 (12%). K1a meldt 7× een B waar een C staat. |
| Zwangerschapswaarschuwing | K1a / K4-aa | Vindt het, onzeker: 10/10, 4 GLN's. K4-aa niet-gelabeld 2/12 (17%). |
| Rainforest Alliance | K1a / K4 | Vindt het, onzeker: 13/14. K4-aa niet-gelabeld 3/17 (18%). |
| Recyclebaar | K3c (beste run 6/11) | Geen variant vindt het. Gat 25 procentpunt; K1a en K4-aa 4/11. INFERENCE: een definitiekwestie. De K1-instructie sloot materiaalcodes en sorteersymbolen uit; de AI-waarheid deed dat misschien niet. |
| Vegan algemeen | K1a (7/9) | Te weinig voorbeelden (9). Wordt verward met het V-label. |
| Vegan Society | K1a / K4-aa | Vindt het, onzeker: 11/11, 4 GLN's. K4-aa niet-gelabeld 0/12 (0%; tot 24%). |
| Weidemelk | K1a, K1b, alle K4 | **Vindt het**: 17/17 in beide runs, Wilson 82–100%, 6 GLN's. K4-aa niet-gelabeld 2/26 (8%; tot 24%). |

**Samengevat voor K4-aa:**
- Hij vindt 10 van de 12 keurmerken. Alle 10 zijn onzeker, behalve Weidemelk.
- Bij 6 ligt de puntschatting van vals al onder 10%: Beter Leven, V-label, FSC Mix, MSC, Vegan Society en Weidemelk. Hun Wilson-bovengrenzen liggen wel tussen 16% en 30%, dus ook daar is het onzeker.
- Bij 4 hangt het af van de adjudicatie: EU-bio, Nutri-Score C, Zwangerschap en Rainforest.

## 5. Wat de niet-gelabelde meldingen zijn

INFERENCE, uit een visuele steekproef van 12 willekeurige K1a-meldingen zonder waarheidsvak (run 1; lokaal bekeken, niet bewaard):
- verschoven vakken rond een echt logo: 4;
- een verkeerde Nutri-Scoreletter: 2, telkens een C die als B gemeld werd;
- een vermoedelijk echt, niet-gelabeld logo: 1, een generiek vegan-merk;
- een melding zonder zichtbaar logo: 2;
- moeilijk te beoordelen: 3.

Ter vergelijking: alle 12 willekeurige "gevonden" K1a-meldingen tonen het juiste logo.

**Waarom K2 en K3b achterblijven:**
- VERIFIED: VTF zet bij 151 van 186 paren een vak op de juiste plek (run 1, eenvoudige telregel: middelpunt in het waarheidsvak of IoU ≥ 0,3). Het vinden kost VTF al ±17 paren meer dan K1a, dat er 168 van 186 vindt.
- VERIFIED: K2a vindt er 113 van 186, K2b 102 en K3b 79.
- INFERENCE: het grootste verlies (151 → 113) zit dus in het benoemen: Nutri-Scoreletters, de vegan-varianten en ongekalibreerde drempels.

**Verwarbare paren (VERIFIED, telling "melding van X op waarheidsvak van Y" in tabellen.md):**
- K1a meldt 7× een B waar een C staat. Daardoor is zijn vals% voor Nutri-Score B hoog (13/23).
- K1a meldt 4–5× een generiek "VEGAN" op een V-label.
- K2a meldt 9–10× "VEGAN" op een Vegan Society-logo. INFERENCE: de oorzaak zit in de referentieset, niet in het vinden.

## 6. Kosten en tijd (CAP-4, gemeten)

| variant/run | etiketten | mislukt | kosten totaal | kosten/etiket | tijd mediaan | p90 | max | >165 s | piekgeheugen MB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| b0/1 | 173 | 1 | $0,00 | – | 16,0 | 43,0 | 136,0 | 0 | – |
| k1a/1 | 173 | 0 | $2,12 | $0,0123 | 5,6 | 14,4 | 34,7 | 0 | – |
| k1a/2 | 173 | 0 | $1,99 | $0,0115 | 5,3 | 8,1 | 19,0 | 0 | – |
| k1b/1 | 173 | 0 | $10,04 | $0,0580 | 5,7 | 8,2 | 15,3 | 0 | – |
| k1b/2 | 173 | 0 | $10,03 | $0,0580 | 5,5 | 8,3 | 13,0 | 0 | – |
| k2a/1 | 173 | 0 | $7,31 | $0,0422 | 6,5 | 10,8 | 21,9 | 0 | 1451 |
| k2a/2 | 173 | 0 | $7,30 | $0,0422 | 6,4 | 11,2 | 17,7 | 0 | 1507 |
| k2b/1 | 173 | 0 | $7,31 | $0,0422 | 5,0 | 7,5 | 12,2 | 0 | 703 |
| k2b/2 | 173 | 0 | $7,30 | $0,0422 | 4,9 | 7,3 | 11,3 | 0 | 711 |
| k3b/1 | 173 | 0 | $7,31 | $0,0422 | 6,5 | 10,9 | 21,5 | 0 | 1467 |
| k3b/2 | 173 | 0 | $7,30 | $0,0422 | 6,4 | 10,9 | 17,9 | 0 | 1459 |
| k3c/1 | 173 | 0 | $0,00 | $0,0000 | 54,1 | 77,4 | 95,1 | 0 | 2821 |
| k3c/2 | 173 | 0 | $0,00 | $0,0000 | 49,9 | 80,5 | 98,1 | 0 | 3289 |
| k4-aa/1 | 173 | 0 | $2,12 | $0,0123 | 8,0 | 16,0 | 36,5 | 0 | 1546 |
| k4-aa/2 | 173 | 0 | $1,99 | $0,0115 | 7,4 | 11,6 | 21,2 | 0 | 1382 |
| k4-ab/1 | 173 | 0 | $2,12 | $0,0123 | 6,1 | 14,8 | 35,1 | 0 | 652 |
| k4-ab/2 | 173 | 0 | $1,99 | $0,0115 | 5,7 | 8,9 | 19,5 | 0 | 700 |
| k4-ba/1 | 173 | 0 | $10,04 | $0,0580 | 7,3 | 11,4 | 22,5 | 0 | 1374 |
| k4-ba/2 | 173 | 0 | $10,03 | $0,0580 | 7,0 | 11,3 | 20,3 | 0 | 1401 |
| k4-bb/1 | 173 | 0 | $10,04 | $0,0580 | 6,0 | 8,6 | 16,5 | 0 | 658 |
| k4-bb/2 | 173 | 0 | $10,03 | $0,0580 | 5,8 | 8,8 | 14,1 | 0 | 652 |
| vtf/1 | 173 | 0 | $7,31 | $0,0422 | 4,7 | 6,8 | 11,5 | 0 | – |
| vtf/2 | 173 | 0 | $7,30 | $0,0422 | 4,5 | 6,8 | 11,0 | 0 | – |

- Geen variant komt boven 165 s per etiket.
- K1 en VTF zijn wandklok, met alle aanroepen van een etiket tegelijk.
- De CPU-stappen draaiden op een MacBook M3 Pro, niet in de container. Vanaf 12:51 liepen ze deels tegelijk met elkaar, dus de tijden zijn eerder te hoog dan te laag. Schoon gemeten K3c op de eerste 25 etiketten: mediaan 35 s.
- B0-tijden lopen via de ACC-API, inclusief upload, wachtrij en een poll-interval van 5 s. Ze tellen niet mee in de 165 s-regel. De B0-kosten zijn niet per scan gemeten.
- Uitgegeven bij OpenRouter, gemeten: K1a $4,38, K1b $21,23, VTF $15,08, inclusief de proef op 10 trainingsproducten. Totaal $40,69, alle posten onder hun stopgrens van 1,5× ($16,50, $39 en $22,50).

## 7. Beperkingen

- **De waarheid is AI, en Claude-gekleurd.** K1b, VTF (dus K2, K3b en K4-xb) en B0 gebruiken Claude, net als de beoordelaars die de vakken voorstelden. Toch vindt Gemini (K1a) méér. INFERENCE: het voordeel van Gemini is dus niet aan die kleuring te danken.
- **Kleine aantallen.** 8–18 paren per keurmerk, uit 3–10 GLN's.
  - Op keurmerkniveau staat er per tabel een GLN-bootstrap in tabellen.md.
  - De samengevoegde intervallen in §1 (over 161 paren) zijn Wilson-intervallen zonder clustering, dus te smal.
- **Lekparen.** 12 van de 186 paren lijken (cosinus ≥ 0,98) op een referentie- of trainingsuitsnede. Zonder die paren: K1a 140/156, K4-aa 139/156.
- **Kern en aanvulling.** Op de 92 kernetiketten zijn B0 en VTF eerder gerepareerd. Bovenaan staat op allebei hetzelfde: K1a 61/68 en 84/93, K4-aa 60/68 en 84/93.
- **B0 kreeg bij 56 etiketten herpakte bytes.** Zonder die etiketten vindt B0 15 van 95 paren (12 keurmerken), dezelfde orde als 20 van 161.
- **De kandidaatregel van K3c.** De OWLv2-scores zijn verzadigd (proef: mediaan 0,96). In de praktijk bepaalt het maximum van 50 per venster de kandidaten, niet de drempel 0,2 (meetopzet §0).
- **De bevriezing ging in twee stappen.** Het telscript werd 15 minuten na de eerste aanroep bevroren, maar vóór de eerste telling. Tot dat moment is van de ruwe uitvoer alleen status en kosten bekeken.
- **Gegevensstroom.** Klantartwork ging via OpenRouter naar:
  - Google AI Studio: 1.030 aanroepen;
  - Google Vertex: 544;
  - Azure (Claude): 1.574 voor K1b, plus de VTF-aanroepen (aanbieder niet vastgelegd).

  OpenRouter bewaart prompts standaard niet ([data-collection](https://openrouter.ai/docs/guides/privacy/data-collection)). Wat de aanbieders zelf bewaren of gebruiken voor training staat niet op OpenRouters overzichtspagina. De bewaar- en trainingsvoorwaarden per aanbieder en de privacy-instellingen van het ACC-account zijn niet gecontroleerd.

## 8. Adjudicatie (volgende stap)

Alle niet-gelabelde meldingen van alle varianten, ontdubbeld met het raakt-criterium, staan **blind** in een lokaal bestand. Er zitten ook 18 gemiste paren bij: de vereniging over beide runs van de beste variant per keurmerk. Het bestand bevat geen variantnamen; de sleutel staat in een apart bestand. Beide staan buiten de repository: `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/telling/adjudicatielijst.json` en `adjudicatie-sleutel.json`.

| lijst | vragen | inhoud |
|---|---:|---|
| volledig (zoals meetopzet §6) | 2.797 | 2.779 meldingen + 18 gemiste paren |
| A: zonder K3c-alleen | 528 | 510 meldingen + 18 gemiste paren (`adjudicatielijst-A-zonder-alleen-k3c.json`) |
| B: alleen K3c | 2.269 | `adjudicatielijst-B-alleen-k3c.json` |

Lijst A volstaat om de rangorde van K1a, K1b, K2, K3b en K4 na de adjudicatie te bepalen. Lijst B dient alleen om K3c te beoordelen. De invulpagina bouwt de hoofdsessie. Daarna: `tel.py … --adjudicatie <uitslag.json>`; de uitkomst komt in `resultaat-na-adjudicatie.json`.

## 9. Bewijs en herberekening

- **Ruwe uitvoer** per etiket en run, lokaal: `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/ruw/<variant>/run<n>/`.
- **Telling:** `fase-b/tel.py`, bevroren in `fase-b/bevroren-telscript.json` (sha256 bde85ddd…, gelijk aan de gebruikte versie), 31 toetsen.
- **Herberekenen:** `tel.py --waarheid …/voorlopige-selectie.json --ruw …/fase-b/ruw --b0 …/nulmeting/ruw --lekparen …/fase-b/lekparen.json --kosten …/fase-b/kosten.json --uit …/fase-b/telling`.
- **Tweede methode voor de 100%-uitkomsten van K1a:** een eigen, eenvoudiger telregel (middelpunt in het waarheidsvak of IoU ≥ 0,3) geeft 167/186 (run 1) en 165/186 (run 2). tel.py geeft 168/186; dat is 1–3 paren verschil. Per keurmerk gelijk bij onder meer Beter Leven 14/14, MSC 13/13 en Weidemelk 17/17.
- **Herhaalbaarheid K3c:** run 1 en run 2 gelijk op 131 van 131 vergeleken etiketten, en 0 wisselende paren in de telling.
