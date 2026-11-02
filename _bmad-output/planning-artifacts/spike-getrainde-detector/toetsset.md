---
titel: Toetsset, scheiding training/toets en beelden
hoort-bij: SPEC.md (CAP-1, CAP-2, CAP-3, CAP-15)
datum: 2026-10-31
bijgewerkt: 2026-11-02 (ronde 3: verzoekgrootte voorinvulling, klaar-teken invulpagina; ronde 4: aanvulling vóór bevestiging, besluiten Friso; ronde 5: Nutri-Score A–E, V-label als 9e keurmerk; ronde 6: OFF-lekfilter vóór de training; ronde 7: invulpagina op één scherm)
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

Elke leverancier (GLN) zit óf aan de trainingskant óf aan de toetskant, voor alle 9 keurmerken tegelijk. Dat is strenger dan "productlijn binnen een leverancier": een ontwerp dat een leverancier op meerdere producten gebruikt, kan zo niet aan beide kanten terechtkomen.

**Regel om de trainingsleveranciers te kiezen (deterministisch, CAP-1):**
1. **Rijen** (10): EU-biologisch, Groene Punt, Recyclebaar, Nutri-Score A, Nutri-Score B, Nutri-Score C, zwangerschap, MSC, Weidemelk, Vegan Society. Voor zwangerschap gelden alcoholproducten als benadering (er bestaat geen GS1-declaratie voor). **Extra rijen** (3, ronde 5): Nutri-Score D, Nutri-Score E en V-label (declaratie vegan of vegetarisch); ze worden met de gekozen leveranciers geteld en gerapporteerd, maar tellen niet mee in stap 2 en 4 van deze regel.
2. **Kandidaten** = per rij de 2 leveranciers met de meeste unieke GTIN's.
3. Per rij: `train` = unieke GTIN's bij trainingsleveranciers; `toets` = unieke GTIN's bij de overige leveranciers, zonder GTIN's die in een referentie of in `training_data` zitten (de GTIN staat in het pad van de referentie) en zonder docs uit de fase-B-meetset.
4. Kies de verzameling trainingsleveranciers waarvoor de rij van waarden `min(toets/2, train)` (per rij het kleinste van: het aantal trainings-GTIN's, of de helft van de toets-GTIN's), van klein naar groot gesorteerd, lexicografisch het grootst is: eerst het zwakste keurmerk zo goed mogelijk, dan het op één na zwakste, enzovoort. Uitputtend zoeken over alle deelverzamelingen van de kandidaten. Gelijkspel: de kleinste verzameling, daarna de laagste gesorteerde rij GLN's.
5. Uitkomst naar `PROEF_MAP/scheiding.json`: leveranciers, regel, invoerhashes, aantallen per rij (ook de extra rijen, gemarkeerd als buiten de keuze met reden), en het aantal uitgesloten GTIN's (nul uitgesloten GTIN's is een fout).

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
| *extra:* Nutri-Score D | 183 / 1 | 200 / 11 |
| *extra:* Nutri-Score E | 171 / 1 | 183 / 8 |
| *extra:* V-label (vegan of vegetarisch) | 11 / 1 | 28 / 8 |

Er zijn vijf trainingsleveranciers. De laagste waarde van de 10 keuzerijen is 16,5: de helft van de 33 toets-GTIN's van MSC.

> [!warning] Extra rijen veranderen de keuze, de leveranciers blijven (ronde 5, gemeten 01-11-2026)
> Met de drie extra rijen in de keuze zou de regel 6 trainingsleveranciers kiezen (1 eruit, 2 erbij; zwakste waarde 13,5). De toetsset is op de 5 van 31-10 gebouwd en voorgevuld en wordt niet opnieuw gebouwd (opdracht bij het besluit van Friso 01-11-2026); de regel kiest daarom op de 10 oorspronkelijke rijen. Met die 5 is V-label de zwakste rij (min(28/2, 11) = 11): 11 trainings-GTIN's bij 1 leverancier, 28 toets-GTIN's bij 8, waarvan 4 vegetarisch. NutriGreen vult de trainingskant aan (trainingsset-en-herkenning §10).

> [!warning] Krap: V-label, MSC en Vegan Society
> V-label heeft 28, MSC 33 en Vegan Society 35 GTIN's aan de toetskant (3 tot 8 leveranciers). Om 16 bevestigde etiketten mét te halen, moet het keurmerk op ten minste 57%, 48% resp. 46% van die producten echt zichtbaar zijn (INFERENCE). Beperkt tot docs met print-laag zou MSC aan de toetskant maximaal 15 docs hebben; daarom mogen docs zonder print-laag uit het origineel gebouwd worden (§3). Valt een keurmerk tekort, dan is dat stoppunt 2 in [SPEC.md](SPEC.md#constraints); de scheiding wordt niet zelf versoepeld.

**Bijna-duplicaatcontrole.** Van elk toetsbeeld en elk trainingsbeeld (achtergronden, echte trainingsetiketten en validatiebeelden) wordt een 64-bit verschilhash (dHash) van het hele beeld berekend. Een trainingsbeeld dat vrijwel gelijk is aan een toetsbeeld (Hamming-afstand ≤ 6) gaat uit de training; het toetsbeeld blijft. Dezelfde controle draait tussen training en validatie. Aantallen staan in het rapport.

**Referenties.** GTIN's uit alle referenties en uit `training_data` komen nooit in de toets. Elk trainingsmateriaal met een GTIN (achtergrond, uitsnede van een logo of gelijkend keurmerk, echt trainingsetiket) moet bij een trainingsleverancier horen; materiaal waarvan de GTIN niet naar een leverancier te herleiden is, wordt niet gebruikt. Referenties waarvan het beeld vrijwel egaal is (standaardafwijking van de pixelwaarden < 3) vallen altijd af.

## 3. Beelden ophalen en bouwen (CAP-15)

Eigen gereedschap in de proefmap (niet de ongetrackte scripts in de hoofdmap), met tests; de netwerkstappen worden getest met een nagebootste opdrachtuitvoerder.
- **Ophaallijst:** alleen `SELECT` op `replica-db` (zelfde query als `eindtest-logo-pijplijn/ophaal-lijst-maken.py`: actieve media, doelmarkt, `converted` op `nas`).
- **Ophalen:** `rsync --files-from` vanaf `banana:/media/Xmedia`, met `nice -n 19` aan de serverkant, alleen lezen. Nooit een volledige `find`; alleen paden uit de ophaallijst of de bekende docmap `/media/Xmedia/<GLN>/PACKAGING_ARTWORK/<x>/<GTIN>/<doelmarkt>/`.
- **Docs met print-laag:** lagen samenvoegen volgens de regels van `~/logo-meetset-20261018/bouw.py` (lagen boven 4096 px of 20 MB verkleinen, onder elkaar op wit, boven 250 MP weigeren, PNG boven 10 MB verkleinen). Zelfde bytes als de pijplijn.
- **Docs zonder print-laag:** het origineel ophalen; PNG/JPG/TIFF als beeld, PDF via `pdftoppm` (poppler) op 150 dpi, pagina's onder elkaar zoals hierboven. Gemarkeerd `bron: origineel`.
- Elk beeld naar RGB (alfa plat op wit, CMYK omgezet) en met sha256 in het manifest. Dat gebouwde beeld is de **werkschaal**: herkenning en training schalen niet verder.
- **Aanvulling:** ophalen en bouwen van extra kandidaten overschrijft geen eerdere uitkomst. Manifest en certificaattekst (route A) worden aangevuld: vermeldingen van andere docs blijven staan, een opnieuw gebouwd of gelezen doc krijgt de nieuwe uitkomst. De tussenbestanden van elke aanvulling (ophaallijst, originelen, paden) staan in een eigen map, zodat die van eerdere rondes blijven.

## 4. Kandidaten voor de toets (CAP-2)

Uit toetsleveranciers, ontdubbeld op GTIN en daarna op beeld (zelfde sha256 of dHash ≤ 6):
1. Per keurmerk de gedeclareerde GTIN's, verspreid over leveranciers (om de beurt per leverancier, binnen een leverancier op `sha256("20261031" + GTIN)`), tot **40 kandidaten per keurmerk**, of alle beschikbare. Voor Nutri-Score: 40 voor de groep, gelijk verdeeld over A–E (de eerste ronde van 31-10 verdeelde over A, B en C; die lijst blijft).
2. Zwangerschap: alcoholproducten, tot 40.
3. Gelijkende keurmerken ([meetregels.md §2](meetregels.md#2-de-9-keurmerken-en-hun-gelijkende-keurmerken)), gekozen op declaratie, tot **10 per keurmerk**.
4. Nooit: docs uit de fase-B-meetset (de huidige route is daarop gekozen), GTIN's uit referenties of `training_data`.

Verwachte omvang: ±345 etiketten (322 voorgevuld vóór ronde 5, plus ±12 V-label en ±13 E, als 67% bouwt zoals in de eerdere rondes; INFERENCE). Bij ±20 seconden per etiket kost bevestigen Friso ±2 uur (INFERENCE).

**Aanvullen.** Zelfde regels als hierboven, met:
- alleen GTIN's die nog geen kandidaat waren (niet in `kandidaten.json` en niet in een eerdere aanvullingslijst); ze komen in de vaste volgorde en alleen de nieuwe tellen voor het maximum;
- één of meer keurmerken per aanvulling, per keurmerk een eigen maximum of alles wat aan de toetskant overblijft (ook boven 40); een GTIN die bij twee keurmerken hoort, wordt één keer gekozen;
- geen gelijkende kandidaten;
- een keurmerk kan ook één Nutri-Score-letter zijn (bijvoorbeeld `NUTRISCORE_E`); V-label kiest op een vegan- of vegetarisch-declaratie;
- desgewenst eerst de GTIN's met print-laag (`invoer/pool-met-converted-laag-20261008.txt`), daarna de rest, elk deel in de vaste volgorde;
- elke aanvulling schrijft een eigen lijst en overschrijft nooit een bestaande; per gekozen keurmerk meldt ze het aantal toegevoegde kandidaten en het aantal ongekozen toets-GTIN's dat overblijft;
- ontdubbelen tegen de bestaande toets-docs (GTIN, sha256, dHash ≤ 6); de voorinvulling draait daarna over alle toets-docs, zodat de invulpagina alle etiketten toont, en betaalt alleen de nieuwe.

**Volgorde (vast, ook in het draaiplan):** scheiding → kandidaten → voorinvulling → stoppunt 2 → bevestiging door Friso → aanvullen waar een keurmerk na bevestiging onder het doel blijft (zelfde regels, volgende kandidaten in de vaste volgorde) → dHash-controle op de definitieve toetsset → scheiding bevriezen → snelheidsmeting → training. De OFF-uitsneden (trainingsset §11) mogen eerder worden opgehaald; vóór de training draait het ophalen opnieuw, zodat het lekfilter op de definitieve toetsset staat.

**Aanvulling vóór de bevestiging (besluiten Friso 01-11-2026).** Eenmalig en in afwijking van de volgorde hierboven: na de voorinvulling stond zwangerschap op 14 waarschijnlijke etiketten (stoppunt 2), MSC op 18, Vegan Society op 17 en Weidemelk op 23. Friso besliste om vóór zijn bevestiging aan te vullen:
1. **Zwangerschap:** meer alcoholproducten van toetsleveranciers: eerst alle ongekozen met print-laag, daarna de rest in de vaste volgorde, samen hoogstens 60 kandidaten. Doel ±40–60 extra gebouwde etiketten na ontdubbelen, zodat het keurmerk na de voorinvulling ruim ≥ 16 waarschijnlijk haalt; het aantal wordt gemeld, niet afgedwongen (zonder print-laag bouwt vrijwel geen alcoholproduct). De scheiding op leverancier blijft streng.
2. **MSC, Vegan Society, Weidemelk:** elk toetsproduct dat nog geen kandidaat was, ook boven 40, voor marge boven 16 na bevestiging; per keurmerk wordt gemeld hoeveel erbij kwamen en hoeveel er overbleven. Bij het besluit had Weidemelk nog 58 ongekozen toets-GTIN's (57 met print-laag); bij MSC en Vegan Society was elke toets-GTIN al kandidaat (onder welk keurmerk ook).
3. **V-label** (besluit Friso 01-11-2026 (2), ronde 5): elk toetsproduct met een V-label-declaratie (vegan of vegetarisch) dat nog geen kandidaat was, eerst die met print-laag; bij het besluit 18 GTIN's (12 met print-laag, 7 leveranciers), 10 al kandidaat.
4. **Nutri-Score E** (ronde 5, opdracht van de coördinator om NS-D/E-kandidaten mee te nemen): de letter E stond op 10 waarschijnlijke etiketten, D op 33; daarom hoogstens 20 nieuwe kandidaten voor letter E, print-laag eerst (±13 gebouwd, ±$1,5; samen met het V-label ±$3, randvoorwaarden §3). Het besluit valt op de groep; per letter is informatief, maar zo heeft ook E een telling.

Alle extra voorinvullingen vallen onder de post voorinvulling toets en haar grens van $65 ([randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14)). Staat een keurmerk na deze aanvulling onder 16 waarschijnlijke etiketten, dan is dat opnieuw stoppunt 2; meer aanvullen dan dit besluit toestaat, vraagt een nieuw besluit van Friso. De aanvulling na de bevestiging blijft daarnaast bestaan.

## 5. AI-voorinvulling (CAP-2)

- Per etiket: heel etiket plus **tegels** (vaste, overlappende uitsneden van het etiket op werkschaal). Uitkomst per keurmerk (9): aanwezig ja/nee, voor Nutri-Score de verzameling letters (A–E), de tegels waarin het model het keurmerk zag (hinttegels), en gezien gelijkende keurmerken.
- **V-label uit eerdere voorinvullingen** (ronde 5): vóór 01-11-2026 stond het V-label alleen bij de gelijkende keurmerken. Heeft een voorinvulling geen V-label-oordeel, dan geldt `EUROPEAN_V_LABEL_VEGAN` of `EUROPEAN_V_LABEL_VEGETARIAN` in `gelijkend` als aanwezig en anders als afwezig, zonder hinttegels en zonder nieuwe aanroep. Gemeten 01-11-2026: 21 van de 322 voorgevulde etiketten (vegan 10 + vegetarisch 12, 1 met beide). Een mislukte voorinvulling blijft leeg. Nieuwe voorinvullingen vragen het V-label als keurmerk, met tegels.
- Model: **een ander model dan het taalmodel van K4-aa** (`google/gemini-3.8-flash`); standaard `anthropic/claude-sonnet-5.5`. De client weigert het K4-aa-model. Reden: fouten van de voorinvulling mogen niet meebewegen met de route die vergeleken wordt.
- Via de gedeelde OpenRouter-client ([randvoorwaarden.md §1](randvoorwaarden.md#1-privacy-zdr)). Geen zdr-endpoint voor dit model → stoppunt 3.
- Verzoeken volgens [randvoorwaarden.md §5](randvoorwaarden.md#5-verzoekgrootte); kosten en grens volgens [randvoorwaarden.md §3](randvoorwaarden.md#3-kosten-cap-14).
- Herstart: etiketten met een fout worden opnieuw geprobeerd, klare etiketten niet opnieuw betaald.
- Uitvoer per etiket: model, tijdstip, `usage.cost`, beeldtype, ruwe JSON. Een mislukte voorinvulling laat de velden leeg; de pagina toont dat.

## 6. Invulpagina voor Friso (CAP-3)

Lokale server op `127.0.0.1` (patroon `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/nakijken/server.py` + `index.html`), alleen de standaardbibliotheek van Python.

- **Per etiket:** overzichtsbeeld (klik = inzoomen, Cmd/Ctrl-klik = volledige resolutie; ronde 7), hinttegels, en per keurmerk een keuze voorgevuld met het AI-oordeel: **aanwezig / afwezig / onzeker**. Nutri-Score: de verzameling zichtbare letters (A–E) of "letter onleesbaar". V-label: één keuze voor vegan of vegetarisch (meetregels §2); een ouder concept zonder V-label houdt zijn keuzes en toont voor V-label de voorinvulling. Daarnaast per etiket: **onleesbaar** (hele etiket onbruikbaar) en een opmerkingveld.
- **Snel:** sneltoetsen voor vorige/volgende en "bevestigd zoals voorgevuld"; voortgang, en per keurmerk de stand ten opzichte van het doel (≥ 16 mét, ≥ 50 zonder).
- **Eén scherm (ronde 7, verzoek Friso 02-11-2026):** indeling, sneltoetsen, AI-merkje, tegelkaders, inzoomen en de knop "Bevestigen en volgende" volgen [invul-ux/EXPERIENCE.md](invul-ux/EXPERIENCE.md) en [invul-ux/DESIGN.md](invul-ux/DESIGN.md). Die winnen bij strijd over bediening en indeling; §6 wint over antwoordmodel, opslag en de regels hieronder.
- **Wat iemand typt raak je nooit kwijt:**
  - sneltoetsen doen niets zolang de cursor in een tekstveld staat;
  - geen `focus()` of `select()` op een ander veld dan waar de invuller staat;
  - bij het wisselen van etiket (nooit vanuit een tekstveld) mag de pagina `blur()` doen op een eigen knop of keuze met focus, zodat Spatie of Enter niet ongezien op het volgende etiket werkt (ronde 7); nooit op een tekstveld;
  - geen stuk pagina vervangen zolang er getypt wordt (tellers bijwerken met `textContent` op het tellerelement zelf; geen `innerHTML`, `outerHTML`, `replaceChildren` of `insertAdjacentHTML` op een ouder van een invoerveld);
  - elke toetsaanslag als concept in `sessionStorage`; bij het laden gaat het concept vóór op de opgeslagen stand; een concept verdwijnt pas als de server de opslag heeft bevestigd;
  - herbouwen alleen na een klik op opslaan;
  - tijdens het laden is het formulier `#keuzes` `inert` (niet aan te klikken of te typen). Het attribuut verdwijnt pas na het eerste tonen (met concept) en nadat sneltoetsen en invoerafhandeling gekoppeld zijn: dat is het klaar-teken. Zo overschrijft het eerste tonen geen invoer van tijdens het laden, en wachten browsertests na elke paginalading (ook herladen) hierop, niet op het antwoord van `/stand`. Lege `items.json` of mislukt laden (netwerk- of JSON-fout): het formulier blijft `inert` en de voortgangsregel meldt het.
- **Opslaan:** elke keuze direct naar `PROEF_MAP/toets/uitslag.json`. De server verwerkt opslagen één voor één (lock rond lezen-wijzigen-schrijven), schrijft atomisch (tijdelijk bestand + vervangen), weigert onbekende etiketten en ongeldige waarden (ook de code `EUROPEAN_V_LABEL_VEGETARIAN`), en weigert "bevestigd" zolang niet alle 9 keurmerken een keuze hebben.
- **Schema `uitslag.json`:** `{"<doc_id>": {"status": "bevestigd"|"onleesbaar", "keurmerken": {"<code van keurmerk 1–3, 5–9; keurmerk 9 = EUROPEAN_V_LABEL_VEGAN>": "aanwezig"|"afwezig"|"onzeker"}, "nutriscore": ["A".."E"] | "onleesbaar", "veranderd": [<codes waar Friso de voorinvulling wijzigde>], "opmerking": "<tekst>", "tijd": "<ISO-8601>"}}`. De pagina, de voortgangsteller en de telcode gebruiken één gedeelde functie om dit te lezen.

## 7. Bevriezen van de scheiding

`scheiding.json` mag wijzigen tot de stap "scheiding bevriezen" in §4 (bijvoorbeeld als stoppunt 2 tot een besluit van Friso leidt). Elke wijziging vóór dat moment is een nieuwe versie met reden. Daarna staat de sha256 in `bevroren.json` en wijzigt het bestand niet meer.
