---
titel: Toetsset, scheiding training/toets en beelden
hoort-bij: SPEC.md (CAP-1, CAP-2, CAP-3, CAP-15)
datum: 2026-10-31
bijgewerkt: 2026-10-31 (na bmad-review)
gemeten-op: declaraties-prod-basiseenheden-20261008.tsv, alcohol-kandidaten.tsv, referentiemomentopname 2026-10-30, voorlopige-selectie.json
---

# Toetsset en scheiding

## 1. Werkmap en invoer

**Werkmap (klantdata, buiten elke git-werkboom):** `~/logo-meetset-20261018/proef-detector/` (`PROEF_MAP`, configureerbaar). Daarin onder meer `invoer/`, `scheiding.json`, `toets/`, `train/`, `logos/`, `modellen/`, `uitvoer/`, `bevroren.json`. Elk gereedschap weigert te schrijven binnen een git-werkboom (`git rev-parse --show-toplevel` slaagt op het doelpad), en de uitvoermap van `rfdetr` wordt expliciet onder `PROEF_MAP` gezet. In de repository staan alleen code, tests, de spec en het draaiplan.

**Invoer.** De eerste stap van het draaiplan kopieert deze bestanden eenmalig naar `PROEF_MAP/invoer/` (lokaal, met sha256); het gereedschap leest daarna alleen daar. `<hoofdrepo>` = `/Users/frisovanweelden/Documents/projects/logoRecognition` (de hoofdmap, niet de werkmap van deze proef).

| invoer | bron |
|---|---|
| declaraties per basiseenheid (`doc_id` = GLN-GTIN-doelmarkt; kolommen `t3777`, `dieet`, `nutriscore`) | `<hoofdrepo>/_bmad-output/planning-artifacts/eindtest-logo-pijplijn/declaraties-prod-basiseenheden-20261008.tsv` |
| docs met print-laag | `…/eindtest-logo-pijplijn/pool-met-converted-laag-20261008.txt` |
| mediatypes per doc | `…/eindtest-logo-pijplijn/basiseenheden-met-media-20261008.tsv` |
| kandidaten zwangerschapswaarschuwing (GLN, GTIN, brick, omschrijving) | `~/logo-meetset-20261018/alcohol-kandidaten.tsv` |
| fase-B-meetset met AI-vakjes | `~/logo-meetset-20261018/ontwikkelmeting-20261028/voorlopige-selectie.json` |
| referentiemomentopname (540 referenties, `training_data`) | `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/momentopname/` |

Begrippen:
- **doc**: een productregistratie, dus één GTIN (het productnummer achter de streepjescode) van één leverancier voor één doelmarkt. Eén GTIN kan meerdere docs hebben (meerdere doelmarkten); tellingen gaan op unieke GTIN.
- **print-laag**: de drukversie die de pijplijn al naar een beeld heeft omgezet (`_converted-N.png`).
- Regels die met `#` beginnen of geen drie delen in `doc_id` hebben, worden overgeslagen.

## 2. Scheidingseenheid: de leverancier (GLN)

Elke leverancier (GLN) zit óf aan de trainingskant óf aan de toetskant, voor alle 8 keurmerken tegelijk. Dat is strenger dan "productlijn binnen een leverancier": een ontwerp dat een leverancier op meerdere producten gebruikt, kan zo niet aan beide kanten terechtkomen.

**Regel om de trainingsleveranciers te kiezen (deterministisch, CAP-1):**
1. **Rijen** (10): EU-biologisch, Groene Punt, Recyclebaar, Nutri-Score A, Nutri-Score B, Nutri-Score C, zwangerschap, MSC, Weidemelk, Vegan Society. Voor zwangerschap gelden alcoholproducten als benadering (er bestaat geen GS1-declaratie voor).
2. **Kandidaten** = per rij de 2 leveranciers met de meeste unieke GTIN's.
3. Per rij: `train` = unieke GTIN's bij trainingsleveranciers; `toets` = unieke GTIN's bij de overige leveranciers, zonder GTIN's die in een referentie of in `training_data` zitten (de GTIN staat in het pad van de referentie) en zonder docs uit de fase-B-meetset.
4. Kies de verzameling trainingsleveranciers waarvoor de rij van waarden `min(toets/2, train)` (per rij het kleinste van: het aantal trainings-GTIN's, of de helft van de toets-GTIN's), van klein naar groot gesorteerd, lexicografisch het grootst is: eerst het zwakste keurmerk zo goed mogelijk, dan het op één na zwakste, enzovoort. Uitputtend zoeken over alle deelverzamelingen van de kandidaten. Gelijkspel: de kleinste verzameling, daarna de laagste gesorteerde rij GLN's.
5. Uitkomst naar `PROEF_MAP/scheiding.json`: leveranciers, regel, invoerhashes, aantallen per rij, en het aantal uitgesloten GTIN's (nul uitgesloten GTIN's is een fout).

**Uitkomst op de invoer van 31-10-2026** (unieke GTIN's; gedeclareerd ≠ zichtbaar; leveranciers staan alleen in `scheiding.json`):

| rij | train (GTIN's / leveranciers) | toets (GTIN's / leveranciers) |
|---|---|---|
| EU-biologisch | 49 / 3 | 127 / 14 |
| Groene Punt | 112 / 5 | 272 / 46 |
| Recyclebaar | 229 / 5 | 648 / 54 |
| Nutri-Score A | 121 / 1 | 171 / 15 |
| Nutri-Score B | 79 / 1 | 106 / 13 |
| Nutri-Score C | 184 / 1 | 199 / 12 |
| Zwangerschap (alcoholproducten als benadering) | 525 / 5 | 878 / 52 |
| MSC | 19 / 1 | 33 / 7 |
| Weidemelk | 71 / 1 | 98 / 3 |
| Vegan Society | 24 / 1 | 35 / 3 |

Er zijn vijf trainingsleveranciers. De laagste waarde in de rij is 16,5: de helft van de 33 toets-GTIN's van MSC.

> [!warning] Krap: MSC en Vegan Society
> MSC heeft 33 en Vegan Society 35 GTIN's aan de toetskant (3 tot 7 leveranciers). Om 16 bevestigde etiketten mét te halen, moet het keurmerk op ten minste 48% resp. 46% van die producten echt zichtbaar zijn. Beperkt tot docs met print-laag zou MSC aan de toetskant maximaal 15 docs hebben; daarom mogen docs zonder print-laag uit het origineel gebouwd worden (§3). Valt een keurmerk tekort, dan is dat stoppunt 2 in [SPEC.md](SPEC.md#constraints); de scheiding wordt niet zelf versoepeld.

**Bijna-duplicaatcontrole.** Van elk toetsbeeld en elk trainingsbeeld (achtergronden, echte trainingsetiketten en validatiebeelden) wordt een 64-bit verschilhash (dHash) van het hele beeld berekend. Een trainingsbeeld dat vrijwel gelijk is aan een toetsbeeld (Hamming-afstand ≤ 6) gaat uit de training; het toetsbeeld blijft. Dezelfde controle draait tussen training en validatie. Aantallen staan in het rapport.

**Referenties.** GTIN's uit alle referenties en uit `training_data` komen nooit in de toets. Elk trainingsmateriaal met een GTIN (achtergrond, uitsnede van een logo of gelijkend keurmerk, echt trainingsetiket) moet bij een trainingsleverancier horen; materiaal waarvan de GTIN niet naar een leverancier te herleiden is, wordt niet gebruikt. Referenties waarvan het beeld vrijwel egaal is (standaardafwijking van de pixelwaarden < 3) vallen altijd af.

## 3. Beelden ophalen en bouwen (CAP-15)

Eigen gereedschap in de proefmap (niet de ongetrackte scripts in de hoofdmap), met tests; de netwerkstappen worden getest met een nagebootste opdrachtuitvoerder.
- **Ophaallijst:** alleen `SELECT` op `replica-db` (zelfde query als `eindtest-logo-pijplijn/ophaal-lijst-maken.py`: actieve media, doelmarkt, `converted` op `nas`).
- **Ophalen:** `rsync --files-from` vanaf `banana:/media/Xmedia`, met `nice -n 19` aan de serverkant, alleen lezen. Nooit een volledige `find`; alleen paden uit de ophaallijst of de bekende docmap `/media/Xmedia/<GLN>/PACKAGING_ARTWORK/<x>/<GTIN>/<doelmarkt>/`.
- **Docs met print-laag:** lagen samenvoegen volgens de regels van `~/logo-meetset-20261018/bouw.py` (lagen boven 4096 px of 20 MB verkleinen, onder elkaar op wit, boven 250 MP weigeren, PNG boven 10 MB verkleinen). Zelfde bytes als de pijplijn.
- **Docs zonder print-laag:** het origineel ophalen; PNG/JPG/TIFF als beeld, PDF via `pdftoppm` (poppler) op 150 dpi, pagina's onder elkaar zoals hierboven. Gemarkeerd `bron: origineel`.
- Elk beeld naar RGB (alfa plat op wit, CMYK omgezet) en met sha256 in het manifest. Dat gebouwde beeld is de **werkschaal**: herkenning en training schalen niet verder.

## 4. Kandidaten voor de toets (CAP-2)

Uit toetsleveranciers, ontdubbeld op GTIN en daarna op beeld (zelfde sha256 of dHash ≤ 6):
1. Per keurmerk de gedeclareerde GTIN's, verspreid over leveranciers (om de beurt per leverancier, binnen een leverancier op `sha256("20261031" + GTIN)`), tot **40 kandidaten per keurmerk**, of alle beschikbare. Voor Nutri-Score: 40 voor de groep, gelijk verdeeld over A, B en C.
2. Zwangerschap: alcoholproducten, tot 40.
3. Gelijkende keurmerken ([meetregels.md §2](meetregels.md#2-de-8-keurmerken-en-hun-gelijkende-keurmerken)), gekozen op declaratie, tot **10 per keurmerk**.
4. Nooit: docs uit de fase-B-meetset (de huidige route is daarop gekozen), GTIN's uit referenties of `training_data`.

Verwachte omvang: ±350 etiketten. Bij ±20 seconden per etiket kost bevestigen Friso ±2 uur (INFERENCE).

**Volgorde (vast, ook in het draaiplan):** scheiding → kandidaten → voorinvulling → stoppunt 2 → bevestiging door Friso → aanvullen waar een keurmerk na bevestiging onder het doel blijft (zelfde regels, volgende kandidaten in de vaste volgorde) → dHash-controle op de definitieve toetsset → scheiding bevriezen → snelheidsmeting → training.

## 5. AI-voorinvulling (CAP-2)

- Per etiket: heel etiket plus **tegels** (vaste, overlappende uitsneden van het etiket op werkschaal). Uitkomst per keurmerk: aanwezig ja/nee, voor Nutri-Score de verzameling letters (A–E), de tegels waarin het model het keurmerk zag (hinttegels), en gezien gelijkende keurmerken.
- Model: **een ander model dan het taalmodel van K4-aa** (`google/gemini-3.8-flash`); standaard `anthropic/claude-sonnet-5.5`. De client weigert het K4-aa-model. Reden: fouten van de voorinvulling mogen niet meebewegen met de route die vergeleken wordt.
- Via de gedeelde OpenRouter-client ([randvoorwaarden.md §1](randvoorwaarden.md#1-privacy-zdr)). Geen zdr-endpoint voor dit model → stoppunt 3.
- Uitvoer per etiket: model, tijdstip, `usage.cost`, ruwe JSON. Een mislukte voorinvulling laat de velden leeg; de pagina toont dat.

## 6. Invulpagina voor Friso (CAP-3)

Lokale server op `127.0.0.1` (patroon `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/nakijken/server.py` + `index.html`), alleen de standaardbibliotheek van Python.

- **Per etiket:** overzichtsbeeld (klik = volledige resolutie), hinttegels, en per keurmerk een keuze voorgevuld met het AI-oordeel: **aanwezig / afwezig / onzeker**. Nutri-Score: de verzameling zichtbare letters (A–E) of "letter onleesbaar". Daarnaast per etiket: **onleesbaar** (hele etiket onbruikbaar) en een opmerkingveld.
- **Snel:** sneltoetsen voor vorige/volgende en "bevestigd zoals voorgevuld"; voortgang, en per keurmerk de stand ten opzichte van het doel (≥ 16 mét, ≥ 50 zonder).
- **Wat iemand typt raak je nooit kwijt:**
  - sneltoetsen doen niets zolang de cursor in een tekstveld staat;
  - geen `focus()` of `select()` op een ander veld dan waar de invuller staat;
  - geen stuk pagina vervangen zolang er getypt wordt (tellers bijwerken met `textContent` op het tellerelement zelf; geen `innerHTML`, `outerHTML`, `replaceChildren` of `insertAdjacentHTML` op een ouder van een invoerveld);
  - elke toetsaanslag als concept in `sessionStorage`; bij het laden gaat het concept vóór op de opgeslagen stand; een concept verdwijnt pas als de server de opslag heeft bevestigd;
  - herbouwen alleen na een klik op opslaan.
- **Opslaan:** elke keuze direct naar `PROEF_MAP/toets/uitslag.json`. De server verwerkt opslagen één voor één (lock rond lezen-wijzigen-schrijven), schrijft atomisch (tijdelijk bestand + vervangen), weigert onbekende etiketten en ongeldige waarden, en weigert "bevestigd" zolang niet alle 8 keurmerken een keuze hebben.
- **Schema `uitslag.json`:** `{"<doc_id>": {"status": "bevestigd"|"onleesbaar", "keurmerken": {"<code van keurmerk 1–3, 5–8>": "aanwezig"|"afwezig"|"onzeker"}, "nutriscore": ["A".."E"] | "onleesbaar", "veranderd": [<codes waar Friso de voorinvulling wijzigde>], "opmerking": "<tekst>", "tijd": "<ISO-8601>"}}`. De pagina, de voortgangsteller en de telcode gebruiken één gedeelde functie om dit te lezen.

## 7. Bevriezen van de scheiding

`scheiding.json` mag wijzigen tot de stap "scheiding bevriezen" in §4 (bijvoorbeeld als stoppunt 2 tot een besluit van Friso leidt). Elke wijziging vóór dat moment is een nieuwe versie met reden. Daarna staat de sha256 in `bevroren.json` en wijzigt het bestand niet meer.
