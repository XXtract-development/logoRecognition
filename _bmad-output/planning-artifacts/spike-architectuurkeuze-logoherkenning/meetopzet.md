---
title: Meetopzet spike architectuurkeuze
hoort_bij: SPEC.md
datum: 2026-10-18
versie: 5 (30-10-2026: fase B op de voorlopige ontwikkelset van 173 AI-gelabelde etiketten; zie §0)
---

# Meetopzet

## 0. Afwijking fase B (30-10-2026, keuze Friso)

> [!warning] Voorlopige meting
> Fase B draait niet op de 243 door Friso bevestigde etiketten (CAP-1 is niet gebeurd) maar op de **173 etiketten** van `~/logo-meetset-20261018/ontwikkelmeting-20261028/voorlopige-selectie.json`, met vakken die door AI (Codex) zijn bevestigd. Elke uitkomst is een verkennende ontwikkelmeting, voorlopig tot de adjudicatie (§6), en geen uitvoering van de eindopzet. De regels in §0 gaan vóór de rest; waar een latere paragraaf voor fase B anders werkt, staat dat er inline bij als "(fase B: …)".

- **Herkomst van de waarheid:** voorstellen van de twee Claude-beoordelaars A/B (18-10), per vak bevestigd of gecorrigeerd door een AI-beoordeling (Codex/GPT, 28-10); geen "logo gemist"-items. K1b, VTF (dus K2/K3/K4) en B0 gebruiken ook Claude: hun treffers liggen eerder in de waarheid, juiste vondsten van K1a en K3c buiten die set tellen voorlopig als onterecht, en logo's die Claude mist ontbreken in de noemer. Het rapport toont per variant het aandeel niet-gelabelde meldingen.
- **Waarheid:** `positieve_vakken` per etiket (code + vak in beeldpixels). Ontbrekende codes zijn géén betrouwbaar negatief: een melding zonder waarheidsvak heet *niet-gelabelde melding* en telt voorlopig als onterecht. Vals% en vals-alarm per etiket zijn daardoor bovengrenzen.
- **Geen grove vakken, geen aandacht-etiketten** in deze set (de Codex-selectie heeft geen "logo gemist"-items en geen aandacht-vlag). De grof-regel (§1) blijft in het telscript en zijn toets; de tabel zonder aandacht-etiketten vervalt.
- **Tabellen:** alle paren (basis), zonder lekparen, alleen aanvulling (81 etiketten), alleen kern (92, eerder voor ontwikkeling gebruikt). Bootstrap-cluster = bron-GLN (49; geen bewezen merk of familie).
- **Kleine aantallen:** positieve paren per keurmerk 8–18. NUTRISCORE_A (8), NUTRISCORE_B (8) en VEGAN (9) krijgen "te weinig voorbeelden" (§5.3); de rangorde gaat over de 12 overige keurmerken, en die verzameling ligt vast op de bevroren waarheid (een adjudicatie verandert hem niet). Wilson-95% bij n = 10–18 is 25–45 procentpunt breed (8/10 → 49–94%). Elke tabel toont per keurmerk ook het aantal bron-GLN's; bij minder dan 5 GLN's is "haalt het" hoogstens "haalt het, onzeker".
- **Bytes:** alle nieuwe varianten lezen lokaal het originele PNG en leggen per etiket de bron-sha256 vast; de 10 MiB-uploadgrens van de API speelt lokaal geen rol. **B0 = de nulmeting van 30-10** (1 run, hergebruikt, niet opnieuw gedraaid): 56 etiketten gingen als herpakte bytes (7 PNG verliesvrij, 49 JPEG q92 met gelijke afmetingen). B0 valt daarom buiten de belofte "dezelfde bytes" (CAP-2), wordt opnieuw geteld met het telscript uit `nulmeting/ruw/*.json` (niet met de IoU-telling van RESULTAAT.md), krijgt een extra tabel zonder de 56 herpakte etiketten, en staat als **referentielijn buiten de rangorde** (één run; stabiliteit niet gemeten). B0-tijden lopen via de ACC-API inclusief upload en wachtrij en vallen buiten §5.1. De B0-referentieset (`540:2026-08-26T06:14:43.350Z`) is gelijk aan de momentopname in aantal (540) en jongste aanmaakmoment (VERIFIED, query op ACC 30-10; niet per id vergeleken).
- **Kalibratie:** vraag 6 (negatieven door Friso gekeurd) is niet gebeurd. K2/K3 draaien "niet gekalibreerd" op 0,80; K3b heeft geen onbekend-klasse. Controle buiten de meetset op 852 trainingsuitsneden (zelfde GTIN en cosinus ≥ 0,98 uit de zoekruimte): SigLIP 2 top-1 juist 674/852; boven 0,80 liggen 811, waarvan 142 onjuist (17,5%); DINOv3 top-1 juist 676/852, boven 0,80 834, waarvan 161 onjuist (19,3%). De drempel is niet ontaard, maar al op schone uitsneden ligt het aandeel onjuiste benoemingen boven 10%: dat is een verwachte ondergrens voor vals% van K2/K3, geen geruststelling.
- **Referentie-momentopname** (ACC 30-10-2026, alleen gelezen): 540 actieve `reference_logos`, 852 actieve gevalideerde `training_data`-rijen, 899 bestanden uit MinIO `training-images` (0 ontbrekend), lokaal in `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/momentopname/`. GTIN-overlap opnieuw getoetst tegen deze momentopname (opslagpaden van referenties en trainingsuitsneden plus `provenance.sourceFile`): 0 van de 173 meetset-GTIN's.
- **Proefproducten K1:** 10 trainingsproducten buiten de meetset (lijst `fase-b/proef/proeflijst.tsv`, deterministisch gekozen op dekking van top-15-trainingslabels, ≤1 per GLN), opgehaald en gebouwd zoals de meetset. De 70 nog niet beoordeelde etiketten van de 243 worden niet gebruikt.
- **Bevriezen (één lijst, gaat voor de kopnotitie):** `fase-b/bevroren.json` bevat de sha256 van SPEC.md, dit bestand, `voorlopige-selectie.json`, `artwork_proposals.py` (tegelcode en VTF), alle `fase-b/fb_*.py`-scripts (K1-instructie en -schema, VTF, K2, K3b, K3c, telscript) met de toets van het telscript, het referentieblad, de 15 K3c-voorbeeldbeelden, de proeflijst, het momentopname-manifest (pad + sha256 per bestand), de drempels en OWLv2-instellingen, en de K3b-gewichten. Het bestand (zonder beelden) wordt **gecommit vóór de eerste aanroep op de meetset**. Het telscript wordt in een tweede bevriezing (`fase-b/bevroren-telscript.json`, eigen commit) vastgelegd vóór de eerste telling op meetsetuitvoer; tot die commit wordt van de ruwe uitvoer alleen status, fouten, tijd en kosten bekeken (reden: de bouwketen van het telscript liep uit, en de bescherming tegen afstemmen zit in 'geen telling vóór bevriezing'); het rapport noemt die commit en vergelijkt hem met het tijdstip van de eerste aanroep in de ruwe uitvoer. Openbaar gemaakt: de B0-uitkomsten per keurmerk waren bekend toen deze versie werd geschreven.
- **Rangorde vóór adjudicatie (fase B):** vals% is een bovengrens. Daarom: (a) per keurmerk "vindt het" als gevonden% ≥ 80% in beide runs (Wilson-ondergrens < 80% of < 5 GLN's: "vindt het, onzeker"); vals% en vals-alarm staan ernaast als bovengrens; "haalt het niet" op grond van vals% volgt pas na adjudicatie; (b) rangorde op het aantal keurmerken dat het vindt, dan gemiddelde gevonden% over de 12 keurmerken (slechtste run), dan kosten. Een verschil kleiner dan de overlappende Wilson-intervallen is geen winnaar. Wisselt de beste variant tussen "alle paren" en "alleen aanvulling", dan is er geen winnaar. Na de adjudicatie geldt §5 zoals beschreven.
- **K3c-proef (10 trainingsproducten, buiten de meetset):** beeld-gestuurde OWLv2-scores zijn verzadigd (mediaan 0,96; elk venster haalt het maximum van 50 kandidaten). Geen drempel scheidt daar juiste van overige kandidaten (≥ 0,9: 59 juist tegen 1.638 overig, juist = SigLIP-top-1 ≥ 0,80 op een trainingslabel van dat product). De definitie blijft zoals vastgelegd (≥ 0,2, NMS 0,3, max 50 per venster); in de praktijk is het maximum de kandidaatregel en filtert SigLIP 2 (≥ 0,80). Stap 1 kost ±7 s per etiket, stap 2 ±30–40 s (250–300 uitsneden).
- **Gelijktijdigheid:** per etiket alle aanroepen tegelijk, 2 etiketten tegelijk (hoogstens 12 aanroepen); dit vervangt "4" in §4. CPU-varianten leggen per run het piekgeheugen van het proces vast (maat voor de 8 GB-regel van §5.1).
- **Adjudicatielijst (fase B levert hem als lokaal bestand):** (1) alle niet-gelabelde meldingen van alle varianten; ontdubbeld per etiket en code met het "raakt"-criterium van §3.2 tussen meldingen onderling (groepen via ketens), één vraag per groep, het antwoord geldt voor alle leden; (2) alle gemiste paren van de beste variant per keurmerk (hoogste gevonden% vóór adjudicatie). Blind, willekeurige volgorde, zonder variantnaam.

> [!note] Leidend document
> Dit document ligt vóór fase B vast. Bij verschil met [ONDERZOEK.md](ONDERZOEK.md) is dit document leidend. Niets hierin wordt na het zien van uitkomsten bijgesteld; vóór de eerste aanroep **op de meetset** worden in `fase-b/bevroren.json` vastgelegd (sha256 of volledige inhoud): dit bestand, de waarheidsexport, de K1-instructie en het referentieblad, de proeflijst van 10 trainingsproducten, het telscript met zijn toets, het overzicht van de referentie-momentopname, de kalibratieset, de drempels per soort voor K2/K3 en de K3b-gewichten. Aanroepen voor kalibratie en instructieproef (buiten de meetset) gaan daaraan vooraf.

## 1. Invoer

- **Meetset:** (fase B: 173 etiketten uit `voorlopige-selectie.json`, zie §0) 243 etiketten in [meetset.tsv](meetset.tsv) (kaart, doc_id, beeld-sha256). Elke variant krijgt exact het gecombineerde PNG met die sha256. Beelden in `~/logo-meetset-20261018/beelden*/gecombineerd/`, nooit in de repo ([meetset.md](meetset.md) §4).
- **Waarheid:** export van de collectie `waarheid` van de [invulpagina](https://claude.ai/artifact/KJvPSJk5WKq8Vcsj8bUS73) (CAP-1). Fase B start pas als alle 243 etiketten `klaar: true` zijn (fase B: vervangen door de AI-waarheid van §0, keuze Friso 30-10).
  - `klopt` → waarheidsvak voor de voorgestelde code; `verkeerd keurmerk` + gekozen code → waarheidsvak voor die code; `geen logo` → vervalt.
  - `logo gemist` met aangetikte plek (`x`, `y`) → vierkant waarheidsvak rond dat punt met zijde = mediaan van de andere waarheidsvakken op dat etiket, of 4% van de etiketbreedte als die er niet zijn; nooit groter dan 8% van de breedte.
  - `logo gemist` met alleen een rastervaknummer (geen punt) → status **grof**: het rastervak zelf is het waarheidsvak. Raster per etiket uit de export (`cellen.kolommen`, `cellen.rijen`; vak n = rij ⌊(n−1)/kolommen⌋, kolom (n−1) mod kolommen, in etiketpixels breedte/kolommen × hoogte/rijen). Een melding raakt een grof vak alleen als haar middelpunt erin ligt; hoogstens één melding per grof vak is terecht, verdere tellen als onterecht. Het rapport noemt per keurmerk hoeveel positieve paren grof zijn.
  - Etiketten met `aandacht: true` (27, uit batches waarin de AI-beoordelaars niet alle beelden opnieuw konden nalopen): extra tabel zonder deze etiketten.
- **Referenties en trainingsdata:** vóór fase B één momentopname van ACC: actieve `reference_logos` (id, code, opslagpad, sha256 van het bestand) en `training_data` (id, label, crop_path, sha256), plus de bestanden zelf, lokaal. Alle varianten meten alleen tegen die momentopname (het vliegwiel op ACC kan intussen referenties toevoegen). De lege referentie `f1a85af9` en `31d9ced3` zijn sinds 12-10 inactief en zitten er dus niet in (VERIFIED: onderzoek 12-10, sectie Uitvoering; spike stap 2 §2).
- **Lekcontrole (na het bevriezen, vóór de meting):** knip alle waarheidsvakken uit; bereken cosinus (EfficientNet-B0 zoals ACC, én SigLIP 2) tegen alle 899 bestanden (referenties en trainingsuitsneden) van de momentopname. Een paar met cosinus ≥ 0,98 heet *lekpaar* (zelfde ontwerp als iets waarop geleerd is; regel uit [spike stap 2](../spike-stap2-getraind-model/RAPPORT.md) §3). Elke tabel verschijnt twee keer: alle paren, en zonder lekparen.
- **Eerder gebruikt bij ontwikkeling:** (fase B: 92 kern, 81 aanvulling) 143 van de 243 etiketten komen uit de steekproef van 11-10 waarop de huidige route (B0) en de tegelvariant (VTF) zijn gemeten en gerepareerd. Elke tabel verschijnt daarom ook voor alleen de 100 aanvullingsetiketten (kolom `herkomst` begint met `aanvulling`).

## 2. Varianten (alle vooraf vastgelegd, geen keuze achteraf)

| code | stap 1 (vinden) | stap 2 (benoemen) | runs |
|---|---|---|---|
| **B0** nulpunt | route op `origin/acc` b6a0857: één aanroep Sonnet 5.5, beeld ≤2400 px (`VISUAL_PROPOSAL_MAX_CALLS` niet gezet) | EfficientNet-B0 top-1 cosinus; melding = API-detectie met methode embedding of nutriscore-head ≥ 0,80, nutriscore-a2 ≥ 0,50 (in de ruwe uitvoer komen alleen embedding, nutriscore-a2 en ghs-specialist voor) | 1 (fase B: nulmeting 30-10 hergebruikt) |
| **K1a** | `google/gemini-3.8-flash`; heel etiket + tegels volgens `tile_windows(width, height, calls=6)` uit `apps/ml-service/app/services/artwork_proposals.py` (b6a0857), elk beeld verkleind tot hoogstens 1.500 px lange zijde (JPEG q85); `detail` high, reasoning effort minimal, temperatuur 0 | zelfde aanroep geeft per vak een code uit de lijst van 15 of `ander` | 2 |
| **K1b** | `anthropic/claude-sonnet-5.5` zonder redeneren; zelfde tegels (≤1.500 px), instructie en referentieblad als K1a | idem | 2 |
| **VTF** (stap 1 voor K2/K3) | `visual_proposals()` uit `artwork_proposals.py` op b6a0857 met `VISUAL_PROPOSAL_MAX_CALLS=6`, `anthropic/claude-sonnet-5.5`, codes = actieve referentiesoorten van de momentopname; zonder sjabloonverfijning en GHS-detectie (die zitten alleen in B0) | — | 2 |
| **K2a** | VTF | `google/siglip2-base-patch16-384`; vak uit de originele pixels, transparant op wit; cosinus top-1 tegen de 540 actieve referenties van de momentopname; melding als top-1 een top-15-code is en cosinus ≥ 0,80 | 2 (VTF-uitvoer gedeeld) |
| **K2b** | VTF | DINOv3 ViT-S/16 (timm `vit_small_patch16_dinov3.lvd1689m`, eigen licentie), idem | 2 |
| **K3b** | VTF | logistische regressie (sklearn, C=100, class_weight balanced, max_iter 3000; C gekozen met 5-voudige kruisvalidatie gegroepeerd per GTIN op de trainingsuitsneden, buiten de meetset: C=1 → hoogste p 0,197, drempel onbereikbaar; C=10 → 95 van 719 boven 0,80; C=100 → top-1 613/719, 449 boven 0,80 waarvan 435 juist) op **SigLIP 2 B/16**-embeddings van referenties + trainingsuitsneden (ontdubbeld op sha256 + label), alle soorten van de momentopname, **zonder** klasse `onbekend` (geen gekeurde negatieven); melding als de hoogste klasse een top-15-code is met p ≥ 0,80 | 2 |
| **K3c** | OWLv2 base (`google/owlv2-base-patch16-ensemble`, Apache-2.0), beeld-gestuurd zoeken met 15 voorbeeldbeelden (13 gidslogo's; VEGAN en PREGNANCY_WARNING hebben geen gidslogo en krijgen één referentie-uitsnede uit de momentopname, alleen lokaal), op dezelfde vensters als K1 (≤1.500 px), lokaal CPU; kandidaat bij sigmoid-score ≥ 0,2, NMS IoU 0,3 per venster, hoogstens 50 kandidaten per venster | SigLIP 2 B/16 benoemt elk kandidaatvak zoals K2a (zelfde referenties en drempel) | 2 (run 2 volledig herhaald voor herhaalbaarheid) |
| **K4-xy** | vakjes van K1x | code van K1x geldt alleen als die code bij de drie hoogst scorende *verschillende soorten* van K2y voor dat vak zit, zonder drempel (poort); x ∈ {a,b}, y ∈ {a,b} → K4-aa, K4-ab, K4-ba, K4-bb | 2 (afgeleid, geen extra aanroepen) |

- **K4 en de lange staart:** in een productieroute komen andere keurmerken dan de top 15 uit de retrieval. Die staart wordt hier niet gemeten (geen waarheid); K4 meet alleen of de K2-poort de valse top-15-meldingen van K1 terugdringt zonder vondsten te verliezen.
- **Meervoudig vergelijken:** 11 varianten met een benoemstap (B0, K1a, K1b, K2a, K2b, K3b, K3c, 4× K4) op dezelfde set; het rapport zegt dat een verschil tussen de beste twee kleiner dan hun Wilson-intervallen geen winnaar is.
- **K1-instructie en referentieblad:** de fase-B-subagent schrijft ze; uitgeprobeerd op 10 trainingsproducten buiten de meetset (lijst vastleggen); daarna bevroren (hash). Referentieblad = de 13 gidslogo's uit de momentopname (`gs1-packaging-label-guide`; Nutri-Score A/B/C uit `synthetic-nutriscore-bootstrap`) met hun code; VEGAN en PREGNANCY_WARNING hebben geen gidslogo en staan alleen als tekstomschrijving in de instructie. Geen klantmateriaal. Per etiket gaan alle aanroepen tegelijk, 2 etiketten tegelijk (hoogstens 12 aanroepen). Redeneren uit (Gemini `thinking` laagste stand, Sonnet zonder extended thinking); vastgelegd per aanroep. Op dezelfde 10 proefproducten worden de werkelijke tokens en kosten per etiket gemeten; wijken die >25% af van §7, dan wordt het budget opnieuw voorgelegd vóór de meetset draait.
- **Drempels K2/K3** (fase B: niet gekalibreerd, zie §0): gekozen op een kalibratieset buiten de meetset: de trainingsuitsneden (positief, familie-gegroepeerde kruisvalidatie zoals spike stap 2) plus negatieven uit VTF-runs op 40–60 trainingsproducten (vakjes zonder top-15-logo, door Friso gekeurd). Per soort de laagste drempel waarbij de kalibratieset <10% onterechte meldingen geeft; bij het scoren van een kalibratie-uitsnede worden referenties van hetzelfde product en dezelfde artwork-familie uit de zoekruimte gehaald (anders cosinus ≈ 1). Beperking voor het rapport: positieven zijn strak uitgesneden, negatieven losse VTF-vakken. Zonder goedgekeurde negatieven: K2/K3 draaien met de drempel 0,80 en het rapport markeert ze als "niet gekalibreerd".

## 3. Telregels

1. **Melding** (per variant): een (code, vak) uit de uitvoer, na deze stappen:
   - vak omgerekend van tegel naar etiketpixels; begrensd tot het etiket; vak zonder oppervlak vervalt;
   - code buiten de 15 of `ander`: genegeerd;
   - code zonder vak: telt als onterechte melding (niet te controleren);
   - B0/K2/K3: alleen boven de drempel van §2; K1: elke teruggegeven code (K1 geeft geen zekerheid); K4: alleen na de poort;
   - meldingen van dezelfde code die elkaar ≥ 0,5 overlappen (IoU) worden eerst samengevoegd (ook dubbels uit overlappende tegels); ketens A~B~C vormen één groep; het overblijvende vak is dat van het lid met de hoogste zekerheid (K1: het eerst teruggegeven lid), geen omhullende.
2. **Raakt** een melding van X een waarheidsvak van X: (het middelpunt van de melding ligt binnen het per zijde 25% vergrote waarheidsvak, of IoU ≥ 0,3) én het oppervlak van de melding is hoogstens 4× dat vergrote waarheidsvak. Raakt één melding twee waarheidsvakken, dan telt ze voor het vak met de grootste IoU.
3. **Positief paar** (etiket, X): de waarheid heeft minstens één vak van X. Nutri-Score: de letter is de soort (een C op een B-balk is een onterechte C én, als niets anders de B raakt, een gemiste B).
4. **Gevonden:** positief paar waarvan minstens één waarheidsvak geraakt wordt. **Gemist:** positief paar zonder geraakt waarheidsvak, ook bij een mislukte verwerking.
5. **Onterecht:** elke melding van X die geen enkel waarheidsvak van X raakt (zelfde criterium als 2).
6. **Per keurmerk:**
   - gevonden% = gevonden / positieve paren;
   - vals% = onterecht / (onterecht + aantal geraakte waarheidsvakken van X);
   - vals-alarm per etiket = negatieve paren met ≥1 onterechte melding van X / negatieve paren (mislukte etiketten uit deze noemer);
   - elk met teller/noemer, Wilson-95%-interval, en een bootstrap-interval op merk (GLN) als cluster (2.000 trekkingen).
7. **Mislukte verwerking:** maximaal 2 herhalingen bij time-out of 429; daarna "mislukt". Boven 2% mislukte etiketten is een run ongeldig en wordt opnieuw gedraaid.
8. **Verwarbare paren:** apart geteld binnen de top 15 (Nutri-Score A/B/C onderling; V-label ↔ Vegan Society ↔ VEGAN; RECYCLABLE ↔ Groene Punt). Beperking: Beter Leven 2/3 ster, Nutri-Score D/E, Triman, SPI en ASC zitten niet in de waarheid; een melding die op zo'n logo valt, telt alleen als onterecht voor de gemelde top-15-soort.
9. **Stabiliteit:** per variant het aantal paren waarvan "gevonden ja/nee" tussen run 1 en 2 verschilt.
10. **Telscript:** één script, eerst getoetst op een verzonnen mini-set met bekende uitkomst: omrekening tegel → etiket, dubbele melding en keten, Nutri-Scoreletter, mislukte verwerking, grof vak, code zonder vak, te groot vak, één melding over twee waarheidsvakken, lekpaarfilter, herberekening na adjudicatie. Fase B voegt toetsgevallen toe voor het waarheidsformaat van `voorlopige-selectie.json` (`positieve_vakken`) en voor de ruwe uitvoer van B0 (filter op methode en drempel, ghs-specialist en codes buiten de 15 genegeerd), K1 (vak per venster), VTF+K2/K3 en K3c. De toets staat naast het script. Per aanroep wordt de sha256 van de verstuurde etiketbytes vastgelegd en vergeleken met meetset.tsv (bij tegels: de sha256 van het bronbeeld).

## 4. Kosten en tijd

- Taalmodel: tokens en `usage.cost` per aanroep uit het OpenRouter-antwoord; per etiket opgeteld; vastgelegd aantal gelijktijdige aanroepen (4; fase B: zie §0 Gelijktijdigheid). VTF rekent kosten als tokens × tarief (de productiecode vraagt geen `usage.cost`).
- CPU: wandkloktijd per etiket van stap 2 op de Mac (model geladen, 1 proces); hardware: MacBook M3 Pro, 12 kernen, 18 GB. De 165 s-regel (§5.1) wordt op deze hardware getoetst, niet in de container.
- Taalmodeltijd: wandklok vanaf de eerste aanroep van het etiket tot het laatste antwoord (alle aanroepen van een etiket parallel).
- Tijd per etiket: mediaan, p90, max van stap 1 + stap 2.

## 5. Beslisregel (vooraf vastgelegd)

0. **Basistabel:** (fase B: vóór adjudicatie geldt §0 Rangorde) de rangorde rust op de tabel "alle paren" ná adjudicatie. De tabellen zonder lekparen, alleen aanvulling en zonder aandacht-etiketten zijn gevoeligheidstoetsen; het rapport meldt het als de volgorde daar verandert.
1. **Uitsluiten:** een variant die bij >1% van de etiketten boven 165 s per etiket komt (gemeten vanaf de eerste aanroep tot het einde van stap 2 voor dat etiket, zonder wachttijd in de eigen wachtrij), of die niet binnen 8 GB geheugen draait, valt af (wel gerapporteerd).
2. Per keurmerk **"haalt het"**: in beide runs gevonden% ≥ 80% én vals% < 10% (puntschatting). Ligt de Wilson-ondergrens van gevonden% onder 80% of de bovengrens van vals% boven 10%: "haalt het, onzeker".
3. Een keurmerk met < 10 positieve paren (na bevestiging) krijgt "te weinig voorbeelden": wel gerapporteerd, niet in de rangorde.
4. **Rangorde:** (a) aantal keurmerken dat het haalt, "haalt het, onzeker" meegeteld (slechtste van de twee runs; intervallen ook uit de slechtste run); (b) score = gemiddelde over de keurmerken met ≥10 positieven van gevonden%, waarbij een keurmerk met vals% ≥ 10% als 0 telt (slechtste run); (c) kosten per etiket.
5. Haalt geen variant het voor een keurmerk: beste variant en het gat in procentpunten.
6. Deze spike rangschikt opzetten. Een keurmerk gaat pas op "automatisch" na een aparte validatie op nieuwe etiketten (zie SPEC, open vraag 1).

## 6. Na de meting: adjudicatie (vooraf vastgelegd)

De waarheid komt van twee Claude-beoordelaars plus Friso (fase B: Claude-voorstellen, bevestigd door Codex; zie §0). K1b, VTF en B0 gebruiken ook Claude; wat Claude structureel mist, zou anders als "onterecht" tellen voor Gemini. Daarom:

- Alle onterechte (fase B: niet-gelabelde) meldingen van álle varianten samen worden ontdubbeld (zelfde etiket, zelfde code, IoU ≥ 0,5) en blind (zonder variantnaam, willekeurige volgorde) aan Friso voorgelegd: "staat hier dit keurmerk?". Fase B levert de lijst als lokaal bestand; de invulpagina bouwt de hoofdsessie; tot de uitslag verwerkt is blijft de rangorde voorlopig.
- Zegt hij ja, dan wordt het vak van de melding (begrensd op 8% van de etiketbreedte) een waarheidsvak voor alle varianten tegelijk en worden alle tabellen opnieuw berekend. Het rapport telt per keurmerk hoeveel waarheden zo zijn toegevoegd, en per variant hoeveel van zijn meldingen daardoor van onterecht naar gevonden gingen.
- Alle gemiste paren van de beste variant per keurmerk (hoogste gevonden% in de tabel vóór adjudicatie) gaan ook naar Friso: staat het logo er echt? Zegt hij nee, dan vervalt dat waarheidsvak voor alle varianten en wordt alles herberekend ([WAARHEID.md](../eindtest-logo-pijplijn/WAARHEID.md) stap 4).

## 7. Budget en uitvoering

| post | aanroepen (2 runs × 243) | schatting (243) | fase B (2 runs × 173) | stopgrens 1,5× |
|---|---:|---:|---:|---:|
| K1a Gemini 3.8 Flash | ±2.900 | $13–16 | $9–11 | $16,50 |
| K1b Claude Sonnet 5.5 | ±2.900 | $26–36 | $19–26 | $39 |
| VTF Sonnet 5.5 voor K2/K3/K4 | ±2.400 | ±$21 | ±$15 | $22,50 |
| VTF op 40–60 trainingsproducten (negatieven K2/K3) | ±300 | ±$3 | vervalt (vraag 6) | — |
| K1-proef op 10 trainingsproducten (K1a + K1b) | — | — | ±$1 | $1,50 |
| K3c (OWLv2, lokaal) | 0 | $0 (AANNAME ±10–60 s CPU per etiket) | $0 | — |
| B0 nulpunt | 486 | ±$5 | $0 (hergebruikt) | — |
| **totaal** | | **±$68–81** | **±$44–53** | |

- Tarieven en tokens: [ONDERZOEK.md §4–5](ONDERZOEK.md) (AANNAME: redeneren uit, 400 uitvoertokens per aanroep).
- **Stopgrens:** een post die 1,5× zijn schatting overschrijdt, stopt; melden en niet zelf verhogen. Wijken de proeftokens >25% af, dan wordt dat gemeld; de meetset stopt alleen als een post daardoor boven 1,5× zou uitkomen.
- Aanroepen via OpenRouter met een klein script; sleutel alleen in het geheugen. Beeldnetwerken lokaal. Ruwe antwoorden per etiket en run in `~/logo-meetset-20261018/ontwikkelmeting-20261028/fase-b/` (niet in de scratchpad, die macOS leegt); scripts en samenvattingen zonder beelden of sleutels in `fase-b/` in deze map.
