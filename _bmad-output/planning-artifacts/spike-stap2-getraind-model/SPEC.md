---
id: SPEC-spike-stap2-getraind-model
companions: []
sources:
  - ../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md
---

> **Canonical contract.** Dit is een meetspike: er wordt niets gebouwd voor productie. De uitkomst is een rapport (`RAPPORT.md` in deze map) plus de scripts in `scripts/` die de meting reproduceren.

# Spike: levert een getraind stap-2-model een betere classificatie dan de referentiemethode?

## Why

Productowner-vraag: "Kunnen we met alle gedane trainingen niet alvast automatisch een model maken dat de herkenning beter maakt?" Het onderzoek van 12-10-2026 (F1, E17–E20, E22, E26, E28) stelde vast dat de live classificatie op ACC geen getraind model gebruikt: stap 2 is "dichtstbijzijnde referentie" (pgvector-cosinus, exact, top-1, over alle actieve referenties) op een onbewerkt ImageNet-EfficientNet-B0 (classifier = Identity, eerste 512 van 1280 dimensies, Resize 256 / CenterCrop 224 / ImageNet-normalisatie). De gevalideerde `training_data` (880 rijen, 867 unieke uitsneden, 40 soorten, 447 producten) speelt daar geen rol in — behalve dat 481 van die uitsneden letterlijk óók als referentie zijn opgenomen (bron `review-confirmed`). Voordat iemand een trainingspijplijn bouwt, moet eerst gemeten zijn of trainen op die uitsneden stap 2 meetbaar verbetert, gemeten op producten die niet in de training zaten.

## Capabilities

- **CAP-1** Eerlijke splitsing op artwork-familie, twee varianten
  - **intent:** Uitsneden van hetzelfde of bijna hetzelfde artwork zitten nooit aan beide kanten. Omdat productvarianten (smaak, maat) een andere GTIN maar hetzelfde artwork hebben, is de eenheid niet de GTIN maar de **familie**: GTIN's verbonden door minstens één paar uitsneden (train of referentie) met cosinus ≥ 0,98. Twee splitsingen worden gemeten: **E** (briefing-regel: test = alle uitsneden van de 95/447 GTIN's die geen bron van een actieve referentie zijn, baseline met de volledige referentieset; lekkende test-uitsneden — cosinus ≥ 0,98 met een train- of referentie-uitsnede — worden geteld en apart getoond) en **F** (willekeurig 20% van de families als test, seed 20261012, referenties uit test-families uit de baseline-set gehaald). F is de eerlijke hoofdmeting; E is de meting die de briefing vroeg en toont tegelijk de selectiebias (de 95 GTIN's zijn "niet-gepromoveerde" producten, geen steekproef).
  - **success:** Het rapport toont per splitsing en per soort: train-uitsneden, test-uitsneden, GTIN's en families in elk; de doorsnede test-families ∩ baseline-referentie-GTIN's is leeg (assert in het script); soorten die alleen in train of alleen in test voorkomen staan apart met telling; byte-gelijke bestanden (sha256) binnen train en tussen train en referenties zijn geteld, inclusief groepen met tegenstrijdig label.

- **CAP-2** Baseline = ACC-methode nagebouwd en geverifieerd
  - **intent:** Elke test-uitsnede krijgt via dezelfde keten (effb0 DEFAULT, Identity, `convert("RGB")`, Resize 256 / CenterCrop 224, ImageNet-norm, eerste 512 dims, L2-genormaliseerd, cosinus) de top-1-soort en -score tegen de baseline-referentieset (541 actief op 12-10, zonder de gedeactiveerde `f1a85af9-…`; bij F minus referenties uit test-families). Daarnaast een rij **baseline-beperkt**: alleen referenties van soorten die in train voorkomen, zodat de vergelijking met Model A (dat alleen train-soorten kent) symmetrisch is.
  - **success:** De lokale embedding is tegen pgvector getoetst: voor ≥ 20 actieve referenties cosinus ≥ 0,999 tussen de lokale en de ACC-embedding (SELECT op `reference_embeddings`). Per soort en totaal: top-1 juist als teller/noemer; bij drempel 0,75 (live `CLASSIFY_THRESHOLD_EMBEDDING`) en 0,80 (kruischeck): gevonden (juist én ≥ drempel), onterecht (verkeerde soort én ≥ drempel), onder drempel.

- **CAP-3** Model A — lineaire kop op bevroren embeddings
  - **intent:** Logistische regressie (`class_weight='balanced'`) over de soorten in de trainingsset, op dezelfde bevroren 512-dims-embeddings, voorspelt per test-uitsnede soort en zekerheid.
  - **success:** Dezelfde meting als CAP-2 op dezelfde test-uitsneden. Drempelregel, vooraf vastgelegd: 5-voudige familie-gegroepeerde cross-validatie op train geeft out-of-fold-zekerheden; de baseline krijgt op dezelfde train-uitsneden een leave-family-out-score (referenties van de eigen familie uitgesloten); de drempel van A is **de laagste waarde waarbij het CV-onterecht-percentage ≤ het onterecht-percentage van de baseline bij 0,80 op dezelfde uitsneden**. Geen "andere/onbekend"-klasse (geen negatieven in `training_data`); test-uitsneden van soorten zonder train tellen voor A als fout en staan apart.

- **CAP-4** Model C — trainingsuitsneden als extra referenties
  - **intent:** De train-uitsneden worden (bevroren embeddings) aan de baseline-referentieset toegevoegd en de baseline-meting wordt herhaald. Dit is wat "trainen" tot nu toe feitelijk deed.
  - **success:** Dezelfde tabellen als CAP-2; het rapport meldt hoeveel toegevoegde uitsneden al (byte-gelijk of cosinus ≥ 0,999) referentie waren.

- **CAP-5** Model B — lichte fine-tune (optioneel)
  - **intent:** Fine-tune van de laatste blokken van EfficientNet-B0 op 224 px met de train-uitsneden van splitsing F, gebalanceerde sampling, lichte augmentatie (rotatie, schaal, kleur), CPU-only, maximaal ±1 uur.
  - **success:** Dezelfde meting als CAP-2; drempel via één vaste familie-gegroepeerde validatiesplit (10% van de train-families, seed 20261012) met dezelfde regel als CAP-3 (geen hertrainen per fold). Of een expliciete regel waarom B is overgeslagen.

- **CAP-6** Eerlijke vergelijking, onzekerheid en rapport
  - **intent:** `RAPPORT.md` (Nederlands, frontmatter, callouts, gewone markdown-links) met opzet, splitsingen, per methode één tabel per soort (teller/noemer), een totaaltabel, een paragraaf over wat dit níet bewijst en een advies in drie regels. Scripts in `scripts/`, inclusief `00_haal.sh` dat de query en de MinIO-leesstap vastlegt (zonder sleutels).
  - **success:** Totaal = álle test-uitsneden (soorten met < 3 test-uitsneden gemarkeerd in de per-soort-tabel; het totaal zonder die soorten staat er als tweede regel bij). Per methode: top-1 met 95%-Wilson-interval én een cluster-bootstrap-interval op families (2000 trekkingen); verschil met de baseline via exacte McNemar op uitsneden én via cluster-bootstrap van het verschil; het kleinst aantoonbare verschil bij het waargenomen aantal discordante paren staat erbij. Naast de vaste drempels een vergelijking **bij gelijk aantal onterechte meldingen** (hoeveel gevonden bij evenveel onterecht als de baseline bij 0,80) en macro-gemiddelde recall per soort. Een tweede persoon reproduceert de getallen binnen 0,5 procentpunt (torch 2.14.1 / torchvision 0.29.1 / scikit-learn 1.9.1, seed 20261012). Geen sleutels, geen klantbeelden; elke bewering `VERIFIED:` of `INFERENCE:`.

## Constraints

- Alleen stap 2 wordt gemeten (soort van een gegeven vakje). Stap 1 (vakjes vinden op een volledig etiket) valt buiten de proef en het rapport zegt dat expliciet.
- Geen schrijfacties op ACC (alleen SELECT en bestanden lezen uit MinIO via de ml-service-container), geen containers herstarten, geen productiecode of referenties wijzigen, niets committen, geen Zoho-item.
- CPU-only (lokale venv); training blijft klein: lineaire kop of lichte fine-tune op 224 px.
- Beeldvoorbewerking spiegelt ACC exact: `Image.convert("RGB")` zonder alpha-compositie (`model_manager.py:169-177`, `similarity.py:224/274`); 15 van de 867 uitsneden zijn RGBA. `Image.MAX_IMAGE_PIXELS = None`.
- Dubbele paden in `training_data` (13 rijen, gelijk label) worden ontdubbeld tot 867 unieke uitsneden; byte-gelijke bestanden onder verschillende paden blijven staan maar worden geteld.
- Percentages altijd met teller en noemer; 0% en 100% zijn verdacht tot een tweede meting ze bevestigt.
- Klantbeelden blijven in de scratchpad; in de repo komen alleen spec, rapport en scripts.

## Non-goals

- Stap 1 (lokalisatie), volledige etiketten, de pijplijndrempel 0,99, `referenceVersion`/`automatisch`-logica, categoriefilter in classify (acties 4, 6, 7 van het onderzoek).
- Een "onbekend/andere"-klasse of lookalike-afwijzing: er zijn in `training_data` geen negatieven; dit wordt als open vraag gerapporteerd, niet gebouwd.
- Productie-integratie: een model registreren in `model_versions`, ONNX-export, trainingspijplijn, uitrol. Dat is een vervolgbesluit op basis van dit rapport.
- Een representatieve meting van de valse-meldingskans op echte etiketten: de testset bevat alleen échte logo's, geen lege of vreemde vakjes.
- Opschonen van de labelconflicten die de spike vindt: alleen rapporteren.
- Vergelijkbaarheid met oudere metingen ("12.3 real-ref pivot" top-1 37%→81%, "12.4 detector-spike"): alleen als context.

## Success signal

"Meetbaar beter" betekent, op splitsing F: het totale top-1-percentage van een model ligt boven de baseline op dezelfde test-uitsneden, de exacte McNemar-toets geeft p < 0,05 én het cluster-bootstrap-interval van het verschil ligt boven nul; en bij gelijk aantal onterechte meldingen vindt het model niet minder dan de baseline. Blijft het verschil binnen de intervallen of is p ≥ 0,05, dan luidt de conclusie "geen aantoonbaar verschil met deze data", niet "beter". Splitsing E wordt ernaast gerapporteerd; wijkt de conclusie daar af, dan zegt het rapport waarom (lek of selectiebias).

## Assumptions

- De GTIN in `artwork-crops/<gtin>/…` identificeert het product; alle 880 rijen hebben die vorm (gecontroleerd).
- Cosinus ≥ 0,98 op de bevroren embedding is een bruikbare maat voor "zelfde artwork"; de drempel is gekozen op de waarneming dat byte-gelijke bestanden ≥ 0,9999 scoren.
- Een testset van ongeveer 170–190 uitsneden ziet alleen verschillen van grofweg 10 procentpunten of meer; het rapport berekent het werkelijke kleinst aantoonbare verschil uit de discordante paren.

## Open Questions

- Mag een getraind model straks wél een "onbekend"-uitkomst geven (vraagt negatieven: lege vakjes, vreemde logo's) — en waar komen die vandaan? (productowner)
- Welke drempel-afweging telt zwaarder voor de business: meer gevonden logo's of minder onterechte meldingen? Het rapport toont beide, de keuze is een productbesluit.
