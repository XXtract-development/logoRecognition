---
title: 'Openbare trainingssets voor onze keurmerken'
type: 'technical'
shape: 'explore'
topic: 'Openbare trainingssets en officiële logobestanden voor de keurmerkdetector (RF-DETR), voor de top 50 van onze etiketten'
decision: 'Welke openbare sets en logobestanden voegen we toe als trainingsmateriaal, en onder welke licentie?'
source: 'eigen onderzoek (bmad-deep-recon, modus run, preset standard, zonder interactie); zeven zoekers plus eigen metingen'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-11-01'
updated: '2026-11-01'
parent: 'research.md (zelfde map), §7'
sources: 95
claims_verified: 4
claims_unverified: 7
claims_disputed: 1
---

# Openbare trainingssets voor onze keurmerken

**Vraag van Friso (01-11-2026):** zijn er op internet nog meer trainingssets van de logo's en keurmerken die wij gebruiken? Eerst voor de acht van de proef, daarna uitgebreid naar de top 50 van onze etiketten. Alleen voor training; de toets blijft ons eigen materiaal.

## Samenvatting

**Ja, er is veel meer, maar bijna alles komt uit één bron: de logo-database van Open Food Facts.** Die bevat voor 30 van onze top-50-codes minstens honderd logo's, meestal duizenden, elk met een vakje op een productfoto en benoemd door mensen [37][38]. (Eigen telling uit de tabellen in §1 en §2, zonder de twijfelgevallen.) Dat zijn productfoto's, geen drukbestanden. De licentie (CC BY-SA voor de foto's) staat commercieel gebruik toe [42].

De drie bevindingen die het advies bepalen:

1. **Open Food Facts dekt de grote keurmerken ruim.** EU-bio 104.566, Groene Punt 119.623, Triman 70.119, MSC 12.046, Vegan Society 11.077, V-label vegan 14.410, Nutri-Score A/B/C 25.526 / 12.837 / 9.351 [38]. Je haalt ze op via hun zoekfunctie (API), per keurmerk.
2. **De rest van internet voegt weinig toe.** Op Roboflow staan vooral kleine sets, meestal onder 300 beelden; alleen de halal-sets zijn groter, tot 4.369 beelden [D2][E3]. In de klassenlijsten van de twee grootste logo-sets uit papers staat geen enkel keurmerk [7][8]; de andere sets zijn alleen voor onderzoek, op aanvraag, of hebben geen licentie [9]–[13]. Halal is de uitzondering: daar staan drie bruikbare sets met vakjes [59][60][61].
3. **Officiële logobestanden zijn alleen vrij voor een handvol tekens:** EU-bio, CE, UKCA en de Europese herkomstlogo's BOB en BGA (beschermde oorsprongsbenaming en beschermde geografische aanduiding) [20][68][69][76]. De V-label-bestanden zijn vrij, maar alleen voor pers en partners [91]. De meeste andere eigenaars geven bestanden alleen aan licentiehouders. Geen enkele voorwaarde die we lazen noemt het trainen van software of automatische herkenning; Rainforest Alliance noemt alleen intern trainingsmateriaal [77]. Veel voorwaarden zijn alleen als zoekfragment gelezen.

**Advies** (uitgewerkt in §8):

1. Haal uitsneden uit de logo-database van Open Food Facts, voor elke code met veel voorbeelden.
2. Voeg naast NutriGreen de Nutri-Score-set van Open Food Facts op Hugging Face toe.
3. Maak nagemaakte beelden uit de vrije officiële bestanden: EU-bio, CE, UKCA, BOB en BGA.
4. Gebruik de halal-sets van Roboflow pas als de vraag over de Roboflow-voorwaarden is beantwoord.

> [!warning]
> **Grootste kanttekening.**
> - In Open Food Facts heeft niet elk logo op een foto een vakje. Wie op hele foto's traint, leert de gemiste keurmerken als achtergrond (INFERENCE). Train dus op uitsneden, of screen de foto's eerst.
> - Nederlandse en kleine keurmerken zijn nergens goed gedekt, onder andere Weidemelk (608 bij Open Food Facts, mogelijk gemengd met Franse logo's), Beter Leven (118 en 30), PlanetProof (27), statiegeld en Halal Correct. De volledige lijst staat in §10. Voor deze codes blijven onze eigen productie-etiketten de enige echte bron.

> [!note]
> **Licenties in gewone taal.**
> - **CC BY**: vrij te gebruiken, ook commercieel, met naamsvermelding.
> - **CC BY-SA**: idem; wie afgeleid werk deelt, moet dat onder dezelfde licentie doen.
> - **NC** (bijvoorbeeld CC BY-NC-SA): alleen niet-commercieel, dus voor ons niet bruikbaar.
> - **ODbL en DbCL**: vergelijkbare regels als CC BY-SA, maar voor databases.
> - **MIT, Apache 2.0 en Public Domain**: vrij te gebruiken.
> - **Drie lagen.** Een set is pas bruikbaar als alle drie het toestaan: de licentie van de set, de voorwaarden van het platform waar je hem haalt (zoals Roboflow), en het merkrecht op het keurmerk zelf.

## Hoe gezocht

| | |
|---|---|
| Keurmerken | eerst de acht van de proef (EU-bio, Groene Punt, recyclesymbool, Nutri-Score A/B/C, zwangerschapspictogram, MSC, Weidemelk, Vegan Society); op 01-11 uitgebreid naar de top 50 van onze etiketten. Het V-label en Nutri-Score D en E zijn inmiddels eigen klassen |
| Zoekgebieden | Open Food Facts, Roboflow Universe, Hugging Face, Kaggle, Zenodo, GitHub, logo-sets uit papers, Open Images, en de officiële logobestanden van de keurmerkhouders |
| Aanpak | zeven zoekagenten per gebied en per codefamilie, plus eigen controles en metingen. Geen downloads van datasets; alleen pagina's, datasetkaarten, voorwaarden en tellingen via openbare zoekfuncties |
| Ruwe verslagen | [digests/datasets-2026-11-01/](digests/datasets-2026-11-01/), één bestand per zoeker (D1–D4, E1–E3) en per eigen meting of controle (M1, K1 en de bestanden "natrek"). In de tekst verwijst [D1] enz. naar die verslagen |

**Top 50 van onze etiketten:** de 50 codes die de meeste producten in onze productieset declareren, uit het [declaratiebestand van 08-10-2026](../../eindtest-logo-pijplijn/declaraties-prod-basiseenheden-20261008.tsv) (6.586 producten met artwork, 113 leveranciers). De catalogusbrede telling van juni staat in [keurmerk-declaratie-frequentie.md §3](../../../../tests/validation/keurmerk-declaratie-frequentie.md). Hoe geteld en gemeten is, staat in §10.

## 1. De acht van de proef, plus het V-label en Nutri-Score D/E

"#" = plek in de top 50. "Etiketten" = aantal producten (basiseenheden) in onze productieset dat het keurmerk declareert. Een aantal bij Open Food Facts is het aantal benoemde logo's met een vakje, niet het aantal verschillende foto's. Een "klasse" is een categorie die onze detector apart herkent.

| # | Keurmerk (etiketten) | Beste sets: aantal en vakjes | Licentie van de data | Officieel logobestand en voorwaarden | Bruikbaar |
|---|---|---|---|---|---|
| 16. | EU-bio (228) | Open Food Facts 104.566 met vakje [38]; NutriGreen 2.328 [92]; Roboflow "Organic EU" 100 met vakje [53] | CC BY-SA en ODbL [42]; CC BY-SA 4.0 [92]; CC BY 4.0, plus Roboflow-voorwaarden [45] | vrij te downloaden, EPS en AI, geen login; alleen op gecertificeerde producten, "cannot be stylised" [20] | **ja** |
| 6. | Groene Punt (598) | Open Food Facts 119.623 [38]; Roboflow "Green Dot" 273, onzeker of het dit symbool is [50] | idem; CC BY 4.0 | geen download gevonden; de richtlijn voor de DigiDot (Groene Punt met QR-code) zegt "requires a corresponding contractual basis" [24]; voorwaarden voor het klassieke teken niet gevonden | **ja** |
| 1. | Recyclesymbool, Möbius-lus (1.197) | geen eigen klasse bij Open Food Facts; verpakkingswaarde "recyclable material" 1.939, welk symbool is niet gecontroleerd [38]; Roboflow "recycle" 100 [51]; Kaggle 21 recyclesymbolen zonder vakjes, klassennamen onbekend [4] | CC BY-SA [42]; CC BY 4.0; ODbL en DbCL [4] | geen eigenaar; "not trademarked and is in the public domain" volgens Wikipedia [25], *lage zekerheid* | **twijfel**; nagemaakte beelden zijn de beste route |
| 15. / 18. / 9. | Nutri-Score A / B / C (330 / 205 / 408) | Open Food Facts 25.526 / 12.837 / 9.351 [38]; NutriGreen 1.250 / 1.107 / 867 [92]; Hugging Face-set van Open Food Facts 144 / 139 / 116 vakjes, met de hand gezet [39]; Roboflow 571 beelden, herkomst twijfelachtig [47] | CC BY-SA [42]; CC BY-SA 4.0 [92]; CC BY-SA 3.0 [39]; CC BY 4.0 [47] | gratis na registratie; makers van software moeten "prior to any use" per e-mail toestemming vragen [22] | **ja** |
| 10. / 11. | Nutri-Score D / E (404 / 378) | Open Food Facts 7.691 / 4.140 [38]; NutriGreen 1.001 / 967 [92]; Hugging Face 103 / 80 [39] | idem | idem | **ja** |
| – | Zwangerschapspictogram (0 in productieset; 401 in catalogus) | Open Food Facts 4.925 onder "afgeraden voor zwangere vrouwen" [38]; kan ook tekstwaarschuwingen bevatten (INFERENCE) [37] | CC BY-SA [42] | geen officieel bestand gevonden; Franse grondslag is het besluit van 2 oktober 2006 [31][32], in Nederland een afspraak van de drankensector uit 2014 [33] | **twijfel**; eerst een steekproef bekijken |
| 31. | MSC (71) | Open Food Facts 12.046 [38] | CC BY-SA [42] | alleen voor licentiehouders: "Any other use … requires a licence agreement from MSCI" (zoekfragment van msc.org) [26][27] | **ja** (data) |
| 19. | Weidemelk (198) | Open Food Facts 608, onder het Franse "lait de pâturage", mogelijk met Franse weidemelklogo's erbij [38][43] | CC BY-SA [42] | ZIP-bestanden in negen talen na eenmalig akkoord met de voorwaarden van het certificatieschema; licentie nodig voor gebruik op verpakking [30] | **twijfel** (klein, mogelijk gemengd) |
| 29. | Vegan Society (81) | Open Food Facts 11.077 [38]; Roboflow vegan-sets van 140 en 200 beelden, onbekend welk vegan-logo [54][55] | CC BY-SA [42]; CC BY 4.0 | alleen voor geregistreerde merkhouders (zoekfragment) [28] | **ja** (data) |
| 34. | V-label vegan (66) | Open Food Facts 14.410, plus 3.430 algemeen V-label [38]; NutriGreen V-label 870, niet uitgesplitst [92] | CC BY-SA [42]; CC BY-SA 4.0 [92] | persbestanden PNG, PDF, EPS zonder login, bedoeld voor "partners, supporters, and press"; gebruik op producten vraagt een licentie [91] | **ja** |

## 2. De rest van de top 50

Gesorteerd op aantal etiketten. Tellingen van Open Food Facts komen uit [38], tenzij anders vermeld. Codes die al in §1 staan, zijn weggelaten.

> [!note]
> **Dieetcodes (`DIET_`) zijn claims, geen vast logo.** Welk logo erbij hoort, is per code een INFERENCE. De aantallen van Open Food Facts voor zo'n claim tellen elk logo dat die claim uitdrukte, ook merk-eigen logo's.

**Goed gedekt** (honderden tot duizenden voorbeelden met vakjes, licentie bekend):

| # | Code (etiketten) | Sets: aantal en vakjes | Licentie data | Officieel logo en voorwaarden | Bruikbaar |
|---|---|---|---|---|---|
| 2. | Triman (`TRIMAN`, 1.167) | Open Food Facts 70.119, plus 170 als verpakkingssymbool | CC BY-SA [42] | geen officiële download gevonden, alleen bestanden van derden [35] | **ja** |
| 3. | Vegan, claim (`DIET_VEGAN`, 671) | logo's: V-label vegan en Vegan Society (INFERENCE); Open Food Facts "vegan" 11.928, diverse logo's; Roboflow vegan-sets [54][55][56] | CC BY-SA; CC BY 4.0; MIT [56] | zie V-label en Vegan Society | **ja**, via die twee klassen |
| 4. | Glutenvrij, claim (`DIET_FREE_FROM_GLUTEN`, 650) | logo: Crossed Grain [85][94], plus merkteksten (INFERENCE); Open Food Facts "no gluten" 21.132, Crossed Grain 1.447, "certified gluten-free" 2.080; Roboflow "Gluten Free" 200, licentie niet geverifieerd [63] | CC BY-SA | Crossed Grain "can only be used under licence on food and drink products" [85] | **ja** |
| 5. | Harscodes 1–7 (`SOCIETY_PLASTICS_INDUSTRY`, 614) | Open Food Facts minstens 6.746 harscodes als verpakkingssymbool, over 19 geprobeerde schrijfwijzen waarvan 17 met treffers [38]; Roboflow 845 met vakjes, CC BY 4.0 [58]; nog twee Roboflow-sets (1.600 en 795), licentie niet geverifieerd [67] | CC BY-SA; CC BY 4.0 | ASTM D7611 is een betaalde norm ($64); geen voorwaarden voor de tekens gezien [70] | **ja** |
| 7. | Vegetarisch, claim (`DIET_VEGETARIAN`, 513) | logo: V-label vegetarisch (INFERENCE); Open Food Facts "vegetarian" 2.494, V-label vegetarisch 1.628 | CC BY-SA | V-label-persbestanden [91] | **ja** |
| 8. | FSC Mix (`FOREST_STEWARDSHIP_COUNCIL_MIX`, 486) | Open Food Facts FSC Mix 5.899, FSC 3.355 | CC BY-SA | alleen na registratie, ook voor media en onderzoek (zoekfragment) [29] | **ja** (data) |
| 12. | Lactosevrij, claim (`DIET_LACTOSE_FREE`, 363) | geen standaardlogo gevonden, alleen merkteksten (INFERENCE) [E3]; Open Food Facts "no lactose" 6.559 | CC BY-SA | geen | **twijfel**: veel varianten |
| 13. | Halal, claim (`DIET_HALAL`, 338) | Open Food Facts 1.768; Roboflow met vakjes: "HalalLogoDetection" 1.292 beelden, 50 klassen per land waaronder NL1–NL3 [59]; "halal logo" 3.137 [60]; "halal-capstone" 4.369 [61]; twee Zuidoost-Aziatische sets van 778 en 760 [62] | Public Domain [59][61]; CC BY 4.0 [60][62]; plus Roboflow-voorwaarden [45] | Halal Quality Control (HQC): niet "cropped, stretched, … recoloured" zonder schriftelijk akkoord [86] | **ja** |
| 20. | Biologisch, claim (`DIET_ORGANIC`, 190) | logo: EU-bio en andere biologische logo's (INFERENCE); Open Food Facts algemeen "organic" 1.813, plus EU-bio | CC BY-SA | zie EU-bio | **ja**, via EU-bio |
| 21. | B Corp (`CERTIFIED_B_CORPORATION`, 136) | Open Food Facts 1.750 | CC BY-SA | merkboek van B Lab; geen openbare download bevestigd (zoekfragment) [79] | **ja** (data) |
| 23. | Fairtrade cacao (`FAIRTRADE_COCOA`, 104) | Open Food Facts "Fairtrade cocoa" 312, Fairtrade algemeen 11.114 [37] | CC BY-SA | ontwerpen met het merk alleen na goedkeuring (zoekfragment) [78] | **ja** |
| 25. | Rainforest Alliance, nieuw zegel (`RAINFOREST_ALLIANCE_PEOPLE_NATURE`, 97) | Open Food Facts 10.152; oud en nieuw zegel vallen onder één ID [43] | CC BY-SA | "Materials for internal training or engagement purposes must also be submitted for Rainforest Alliance approval" [77] | **ja** (data); oud en nieuw scheiden |
| 28. | Koosjer, claim (`DIET_KOSHER`, 82) | Open Food Facts OU 11.381, OK Kosher 623, algemeen 176; Roboflow "kosher track" tot 51 beelden, licentie niet geverifieerd [64] | CC BY-SA | OU: geregistreerd certificeringsmerk, onbevoegd gebruik is inbreuk [88]; OK Kosher alleen voor eigen klanten [89] | **ja** |
| 32. | Beschermde oorsprongsbenaming, BOB (`PROTECTED_DESIGNATION_OF_ORIGIN`, 70) | Open Food Facts 13.383 | CC BY-SA | **vrij**, ZIP-bestanden bij de Europese Commissie, geen login, 24 talen [76] | **ja** |
| 38. | ASC, kweekvis (`AQUACULTURE_STEWARDSHIP_COUNCIL`, 49) | Open Food Facts 2.836 | CC BY-SA | alleen licentiehouders (zoekfragment) [83] | **ja** (data) |
| 42. | Beschermde geografische aanduiding, BGA (`PROTECTED_GEOGRAPHICAL_INDICATION`, 37) | Open Food Facts 7.961 | CC BY-SA | **vrij**, zoals BOB [76] | **ja** |
| 47. | OU koosjer (`OU_KOSHER`, 30) | Open Food Facts 11.381 | CC BY-SA | geregistreerd certificeringsmerk, onbevoegd gebruik is inbreuk [88] | **ja** (data) |

**Deels gedekt** (weinig voorbeelden, onzeker welk logo, of alleen een vrij officieel bestand):

| # | Code (etiketten) | Wat er is | Licentie / voorwaarden | Bruikbaar |
|---|---|---|---|---|
| 14 / 40 | Beter Leven 1 en 2 sterren (337 / 47) | Open Food Facts 118 en 30 | geen download of voorwaarden gevonden; gebruik via certificering bij Kiwa [84][34] | **twijfel** (te weinig) |
| 17 / 33 / 39 | Gevarenpictogrammen GHS: uitroepteken, corrosie, vlam (213 / 68 / 49) | lage prioriteit: er is al een eigen getrainde specialist. Roboflow-sets met 9 en 27 GHS-klassen, licentie niet geverifieerd [66] | de officiële pictogrambestanden van de VN (UNECE) zijn niet gecontroleerd | n.v.t. |
| 22. | CE-markering (`CONFORMITE_EUROPEENNE`, 107) | Open Food Facts 0 (het ID bestaat wel [43]); Roboflow-sets met een CE-klasse, aantallen en licentie niet geverifieerd [65] | **officieel bestand vrij**: GIF, PNG, JPG, AI, EPS, geen login; enige regel: "It is forbidden to affix CE marking to other products" [68] | **ja**, via nagemaakte beelden |
| 24. | On the way to PlanetProof (`ON_THE_WAY_TO_PLANETPROOF`, 103) | Open Food Facts 27 | voorwaarden niet gevonden | **twijfel** |
| 26. | Halal Correct (`HALAL_CORRECT`, 90) | geen eigen ID bij Open Food Facts gevonden; mogelijk één van NL1–NL3 in "HalalLogoDetection", niet gecontroleerd [59] | geen voorwaarden gevonden op de site [87] | **twijfel** |
| 27. | Plantaardig, claim (`DIET_PLANT_BASED`, 88) | Open Food Facts 604; niet gezocht naar een standaardlogo | CC BY-SA | **twijfel** |
| 35. | UKCA-markering (`UK_CONFORMITY_ASSESSED`, 64) | Open Food Facts 0; geen set gevonden | **officieel bestand vrij** op gov.uk; de site valt onder "Open Government Licence v3.0, except where otherwise stated" [69]. Of dat ook voor het merkteken geldt, staat er niet | **ja**, via nagemaakte beelden (kanttekening) |
| 36. | Eiwitrijk, claim (`DIET_HIGH_PROTEIN`, 54) | Open Food Facts 3.154, onbekend welk logo; waarschijnlijk vrije tekst (INFERENCE) | CC BY-SA | **twijfel** |
| 48. | Aluminium-recyclingteken (`ALUMINIUM_GESAMTVERBAND_DER_ALUMINIUMINDUSTRIE`, 21) | Open Food Facts 579 als verpakkingssymbool "aluminium", welk symbool is niet gecontroleerd | geen bestand of voorwaarden gevonden; de vereniging heet nu Aluminium Deutschland [73] | **twijfel** |

**Niets bruikbaars gevonden:**

| # | Code (etiketten) | Gezocht | Officieel logo en voorwaarden |
|---|---|---|---|
| 30. | Gescheiden inzameling (`SEPARATE_COLLECTION`, 74) | Roboflow, Hugging Face, Open Food Facts; betekenis waarschijnlijk de doorgekruiste afvalcontainer [71], niet bevestigd via GS1 | geen officieel bestand gevonden |
| 37. | AISE-handvest schoonmaakmiddelen (`AISE_2020_COMPANY`, 50) | Open Food Facts-taxonomie, Hugging Face; Roboflow niet doorzocht | logobestanden alleen voor leden, na ondertekening (zoekfragment, lage zekerheid) [74] |
| 41 / 43 | Statiegeld blik en PET-fles (`RETURNABLE_CAN_NL`, `RETURNABLE_PET_BOTTLE_NL`, 45 / 37) | Hugging Face en Open Food Facts (de verpakkingslijst kent "statiegeldfles" en "statiegeldblik", niet geteld); Roboflow niet doorzocht | "Only producers/importers registered with Statiegeld Nederland are entitled to use the logo" [72] |
| 44. | Design for the Environment (`DESIGN_FOR_THE_ENVIRONMENT`, 35) | Open Food Facts-taxonomie; Roboflow niet doorzocht | alleen voor partners van de Amerikaanse milieudienst EPA; het logo bestaat nog voor desinfectiemiddelen (samenvatting van een zoekresultaat) [75] |
| 45. | Manchester Beth Din, koosjer (`MANCHESTER_BEIS_DIN`, 34) | waarschijnlijk het MK-logo van Manchester Beth Din (INFERENCE) [90]; Open Food Facts 0 (het ID bestaat wel) | geen voorwaarden gevonden [90] |
| 46. | NATRUE, natuurcosmetica (`NATRUE_LABEL`, 31) | Hugging Face en de Open Food Facts-taxonomie; Roboflow maar deels | alleen voor goedgekeurde formules (zoekfragment) [80] |
| 49. | PETA dierproefvrij (`CRUELTY_FREE_PETA`, 21) | idem | licentie na ondertekende verklaring, eenmalig $350 (zoekfragment) [81] |
| 50. | GGN, GLOBALG.A.P. (`GGN`, 20) | idem; Open Food Facts 0 voor drie geprobeerde ID's | label via het secretariaat van GLOBALG.A.P. (zoekfragment) [82] |

Net buiten de top 50: FSC 100% (18) heeft geen eigen ID bij Open Food Facts; Halal Quality Control (17) staat in de taxonomie met 0 logo's; OK Kosher dairy (15) valt onder OK Kosher (623, niet gesplitst); Crossed Grain (14) heeft 1.447 logo's.

## 3. Open Food Facts: de grootste bron

**Kern:** de logo-database van Open Food Facts bevat voor de meeste van onze keurmerken duizenden door mensen benoemde logo's, elk met een vakje op een productfoto. Je haalt ze op via een openbare zoekfunctie (API); als kant-en-klare download bestaan ze niet.

- **Hoe het werkt.** Een detector van Open Food Facts zet vakjes om elk logo op de geüploade productfoto's. Vrijwilligers benoemen daarna welk logo het is [36][37].
  - Elk record bevat het vakje, de benoemde waarde (bijvoorbeeld `en:eu-organic`), de foto en de gebruikersnaam [37].
  - Per vraag komen maximaal 2.000 records terug [36]. Het veld `count` geeft het totaal aantal treffers, anders dan de documentatie zegt [37].
  - De foto's zelf zijn te downloaden van hun server of via het open-dataprogramma van AWS [44].
- **Omvang.** In totaal 1.660.621 benoemde logo's, waarvan 926.067 keurmerken en claims, 690.049 merken en 25.779 verpakkingssymbolen [37][38].
- **Controle.** VERIFIED: twee onafhankelijke metingen op dezelfde dag gaven identieke aantallen voor EU-bio, Groene Punt, Nutri-Score C en Vegan Society [37][38].
- **Kant-en-klare sets op Hugging Face** dekken onze keurmerken nauwelijks:
  - De Nutri-Score-set heeft 584 productfoto's met de hand gezette vakjes (A 144, B 139, C 116, D 103, E 80). Licentie letterlijk: "the images in this dataset are licensed under the Creative Commons Attribution Share Alike license (CC-BY-SA 3.0)" [39].
  - De algemene logoset heeft 841 foto's met 2.173 vakjes, maar slechts één categorie ("object") en geen licentie op de kaart [40].
  - De logo-release van 2022 (374 categorieën, 64.489 beelden) bestaat waarschijnlijk uit uitsneden zonder vakjes (INFERENCE). Klassenlijst en licentie staan niet in de release [41].
- **Licentie** (VERIFIED, letterlijk van de voorwaardenpagina) [42]:
  - "The Open Food Facts database is available under the Open Database License."
  - "Products images are available under the Creative Commons Attribution ShareAlike licence."
  - Commercieel gebruik mag "under certain conditions, especially the attribution and the sharing under the same condition of derivative works".
  - "the Creative Commons Attribution ShareAlike licence for images only covers the photo itself"; merkrechten van derden kunnen gelden, en dat moet wie hergebruikt zelf controleren.
  - Machine learning wordt nergens genoemd.

> [!warning]
> **Drie valkuilen bij deze bron.**
> 1. **Niet elk logo heeft een vakje** (INFERENCE). De vakjes komen van de detector van Open Food Facts; mensen benoemen alleen. Logo's die de detector miste, staan ongelabeld op dezelfde foto.
> 2. **Het zijn productfoto's, geen drukbestanden.** Bruikbaar als extra variatie, niet als vervanging van ons eigen artwork.
> 3. **Sommige klassen zijn vervuild.** Weidemelk deelt een ID met Franse weidemelklogo's [43]. De zwangerschapsclaim kan ook tekst bevatten. Ruim de helft van een steekproef van 1.000 EU-bio-logo's is benoemd door een account `gcloud-annotators`, en onduidelijk is wie dat is [37]. Rainforest Alliance mengt het oude en het nieuwe zegel [43].

> [!note]
> **Licentie voor intern trainen (INFERENCE, geen juridisch advies).** Commercieel gebruik is uitdrukkelijk toegestaan, met naamsvermelding. De plicht om afgeleid werk onder dezelfde licentie te delen hangt aan delen of openbaar gebruik [42][44]. Intern trainen zonder de foto's, uitsneden of de afgeleide set door te geven lijkt die plicht niet te raken. Of een getraind model als afgeleid werk telt, is juridisch onbeslist.

## 4. Roboflow Universe

**Kern:** ongeveer twintig kleine projecten met onze keurmerken of gelijkende symbolen, de meeste onder 300 beelden. De licenties zijn op de projectpagina's zelf gelezen. Aantallen per klasse toont geen enkele pagina. [D2][E1][E3]

- **Nutri-Score.**
  - De set van Open Food Facts zelf (410 beelden) staat onder "BY-NC-SA 4.0": niet-commercieel, dus niet bruikbaar [46].
  - De grootste vrije set (571 beelden, CC BY 4.0) [47]: het oude adres van de Open Food Facts-set verwijst ernaar door. INFERENCE: mogelijk afgeleid van die niet-commerciële set, dus de licentie is niet te vertrouwen tot de herkomst is nagegaan.
  - Verder: 198 beelden met alleen A en B [48], en 792 beelden zonder onderscheid in letters [49].
- **Overige keurmerken:** "Organic EU" 100 beelden [53], "Green Dot" 273 beelden (onzeker of het de Groene Punt is) [50], "recycle" 100 [51], een mengset van 44 beelden met onder andere Groene Punt en vegan [52], vegan-sets van 140 en 200 beelden [54][55], en een set van 469 beelden met halal, kosher, glutenvrij en vegan (licentie "MIT") [56]. Allemaal CC BY 4.0, tenzij anders vermeld.
- **Halal:** drie sets met vakjes en geverifieerde licentie [59][60][61], plus twee kleine Zuidoost-Aziatische sets [62]; zie §2.
- **Gelijkende symbolen, bruikbaar als tegenvoorbeelden** (symbolen die erop lijken, zodat de detector leert wat géén keurmerk is): Koreaanse sorteertekens, 1.049 beelden [57]; harscodes 1–7, 845 beelden [58].
- **Opgeblazen aantallen.** Bij vier sets zitten gespiegelde en gedraaide kopieën in de download, ongeveer drie per origineel. De aantallen hier zijn de originelen [46][47][50][56].
- **Niet gevonden op Roboflow** (per zoekterm de eerste 14 van 50 resultaten bekeken): zwangerschapspictogram, MSC, V-label, Triman, Fairtrade, Möbius-lus, Groene Punt (op de onzekere set na) [D2].

> [!warning]
> **Roboflow legt een extra beperking op bovenop de licentie van elke set.** De voorwaarden zeggen letterlijk: "To the extent you have chosen the Public Plan, you will only use the Services for your own internal, non-commercial use" [45]. Op het gratis abonnement is ook "the right to make any commercial or external use" uitgesloten [45]. Een CC BY-set downloaden met een gratis account voor commerciële training kan dus in strijd zijn met de voorwaarden (INFERENCE). Dit moet een jurist bekijken, of we gebruiken een betaald abonnement. VERIFIED: twee keer letterlijk gelezen, in een browser en via een aparte ophaalfunctie.

## 5. Andere datasetbanken en logo-sets uit papers

**Kern:** buiten Open Food Facts en Roboflow is er geen openbare set gevonden met onze keurmerken mét vakjes én een licentie die commercieel trainen toestaat. [D3][K1]

- **Hugging Face** (buiten Open Food Facts): zoektermen als `ecolabel`, `recycle symbol`, `green dot`, `organic label` gaven nul treffers [1].
  - Twee sets zijn afgeschermd, dus inhoud en licentie zijn niet te lezen: een Nutri-Score-set (100.000 tot 1 miljoen items) [17] en een set met voedseletiketten (licentielabel "other") [18].
- **Recyclingcodes**, alleen labels per beeld en geen vakjes:
  - Kaggle "Seven Plastics": 685 eigen foto's, licentie letterlijk `CC-BY-NC-SA-4.0`. Niet-commercieel [3].
  - Een Hugging Face-kopie met het label `license: mit` bevat dezelfde bestandsnamen en bestandsgroottes [2]. Het MIT-label maakt het origineel niet vrij.
  - Kaggle "Recycle Symbols Classification": 21 klassen, foto's uit Poolse winkels, ODbL en DbCL [4]. Commercieel gebruik lijkt toegestaan (INFERENCE). De klassennamen zijn zonder Kaggle-login niet te lezen.
  - Universiteit van Bologna, "The Recycling Symbols dataset": recyclingdriehoeken met deels vakjes [5]. Op de pagina staat geen licentie.
- **Logo-benchmarks uit papers.** In de klassenlijsten van LogoDet-3K en FoodLogoDet-1500 staat geen van onze keurmerken of gelijkende symbolen; van de andere sets zijn de lijsten niet bekeken.
  - LogoDet-3K heeft 3.000 klassen en 158.652 beelden, maar geen licentie [6][7].
  - FoodLogoDet-1500 heeft 1.500 klassen en geen licentie [8]. Alleen merknamen als "Weidendorf" (een zuivelmerk, niet het Weidemelk-logo) kwamen boven.
  - Waar wel een licentie staat, is die "alleen academisch onderzoek" of niet-commercieel: QMUL-OpenLogo [9], LLD [11], WebLogo-2M [12], OSLD [13].
  - FlickrLogos (32 merken) is alleen op aanvraag [10]. Logo-2K+ heeft geen licentie [19].
- **Open Images V7** heeft alleen labels op beeldniveau ("Logo", "Recycling", "Label"); onder de 601 klassen met vakjes zit niets hiervan [14]. Licentie: annotaties CC BY 4.0, beelden "listed as having a CC BY 2.0 license", zonder garantie per beeld [15].
- **Zenodo, Kaggle en GitHub:** niets buiten NutriGreen. Op Kaggle gaven 14 zoektermen (halal-logo, koosjer, glutenvrij-logo, Fairtrade, FSC-logo, GHS, Triman, CE-markering e.a.) geen beeldset met keurmerken [16][93]. Eén Kaggle-set heet "Green dot" (Apache 2.0, 1 MB), maar heeft geen beschrijving; de inhoud is onbekend [95].

> [!warning]
> Licentielabels op kopieën bewijzen niets. Neem alleen sets waarvan de licentie op de bronpagina van de oorspronkelijke maker staat [2][3].

## 6. Officiële logobestanden en hun voorwaarden

**Kern:** vrij te downloaden voor iedereen zijn alleen EU-bio, CE, UKCA, BOB en BGA [20][68][69][76]. De V-label-persbestanden zijn vrij, maar bedoeld voor partners en pers [91]. Geen enkele voorwaarde die we lazen noemt het trainen van software of automatische herkenning; Rainforest Alliance noemt alleen intern trainingsmateriaal [77]. Training is dus nergens geregeld: niet verboden, maar ook niet uitdrukkelijk toegestaan.

| Groep | Tekens | Wat de voorwaarden zeggen |
|---|---|---|
| **Vrij te downloaden** | EU-bio [20], CE [68], UKCA [69], BOB en BGA [76] | regels gaan alleen over gebruik op producten of in standaardvorm |
| **Vrij, met beperkte doelgroep** | V-label vegan en vegetarisch [91] | persbestanden voor "partners, supporters, and press"; gebruik op producten vraagt een licentie |
| **Na registratie of akkoord** | Nutri-Score [21][22][23], Weidemelk [30] | Nutri-Score: makers van software moeten vooraf per e-mail toestemming vragen [22]; Weidemelk: akkoord met de voorwaarden van het certificatieschema [30] |
| **Alleen voor licentiehouders** | MSC [26][27], ASC [83], FSC [29], Vegan Society [28], Groene Punt [24], statiegeld [72], Crossed Grain [85], OU [88], OK Kosher [89], NATRUE [80], PETA [81], GGN [82], AISE [74], Design for the Environment van de Amerikaanse milieudienst EPA [75], Fairtrade [78], Rainforest Alliance [77] | Rainforest Alliance: ook "materials for internal training" ter goedkeuring [77]; Halal Quality Control: niet bijsnijden of hertinten zonder akkoord [86]. Groene Punt: alleen de DigiDot-richtlijn gelezen [24]. De teksten van [26]–[29], [74], [75] en [78]–[83] komen uit zoekfragmenten, niet uit volledig gelezen pagina's |
| **Geen eigenaar** | recyclesymbool (Möbius-lus) [25] | publiek domein volgens Wikipedia, *lage zekerheid* |
| **Geen officieel bestand gevonden** | Triman [35], zwangerschapspictogram [31][33], Beter Leven [84], Halal Correct [87], Manchester Beth Din [90], aluminium [73], PlanetProof, doorgekruiste container [71] | onbekend |

Harscodes: de norm ASTM D7611 is betaald ($64) en voor de tekens zelf zijn geen voorwaarden gezien [70].

> [!note]
> **Betekenis (INFERENCE, geen juridisch advies).** Merkvoorwaarden regelen het gebruik van een merk in de handel: op producten, in reclame, of om publiek te informeren. Een logo in trainingsbeelden die nooit getoond of verkocht worden, valt buiten alles wat deze documenten beschrijven. Over het auteursrecht op het logobestand zelf zegt geen enkel document iets.

## 7. Wat opvalt als je de bronnen naast elkaar legt

- **De twee bronnen vullen elkaars gaten precies aan.** Open Food Facts is sterk waar de eigenaar zijn bestanden afschermt: MSC, FSC, Vegan Society, Groene Punt, Triman en Rainforest Alliance. De vrije officiële bestanden zijn er juist waar Open Food Facts niets heeft: CE en UKCA (0 logo's) [38][68][69].
- **Op beide routes zwak gedekt:** vooral Nederlandse en nichetekens; de volledige lijst staat in §10. Voor deze codes zijn onze eigen productie-etiketten de enige echte bron (INFERENCE).
- **Alle openbare data zijn productfoto's.** Geen enkele gevonden set bestaat uit drukbestanden. Openbare data geven variatie, ons eigen artwork blijft de kern.
- **Een licentie heeft drie lagen** (zie het kader onder de samenvatting). Een vrije licentie van de set alleen is niet genoeg.

## 8. Aanbevelingen (top 5)

Deze aanbevelingen zijn invoer voor de beschrijving van de trainingsdata van de detector.

1. **Haal per klasse uitsneden op uit de logo-database van Open Food Facts.** Begin met de codes die minstens 1.000 voorbeelden hebben (§1 en §2; 27 codes, eigen telling zonder twijfelgevallen).
   - Train op uitsneden rond het vakje, of laat hele foto's eerst door onze eigen detector screenen op gemiste keurmerken.
   - Controleer vooraf met het oog een steekproef bij Weidemelk, het zwangerschapspictogram, Rainforest Alliance en de dieetclaims.
   - *Basis: vier aantallen VERIFIED met een tweede meting, de overige één keer gemeten [37][38]; licentie VERIFIED [42]; de lezing van de licentie voor intern trainen is INFERENCE.*
2. **Voeg naast NutriGreen de Nutri-Score-set van Open Food Facts op Hugging Face toe** (584 foto's, met de hand gezette vakjes, CC BY-SA 3.0) [39][92]. Die vakjes zijn door mensen gezet, en dus betrouwbaarder dan die uit de logo-database. *Basis: kaart letterlijk gelezen, één bron.*
3. **Maak nagemaakte beelden uit de vrije officiële bestanden:** EU-bio, CE, UKCA, BOB en BGA [20][68][69][76]. Voor het recyclesymbool kan het ook, maar het "publiek domein" rust op één zwakke bron [25].
   - Voor Nutri-Score vragen we eerst toestemming als "software editor" [22]. Dat is een uitgaand bericht, dus eerst Friso's akkoord.
4. **Halal: de drie Roboflow-sets met Public Domain of CC BY 4.0** [59][60][61]. Pas gebruiken nadat de vraag over de Roboflow-voorwaarden is uitgezocht (open vraag 2) [45]. Hetzelfde geldt voor de kleine CC BY-sets "Organic EU" [53] en de harscodes [58].
5. **Gebruik gelijkende symbolen die we niet zelf herkennen als tegenvoorbeelden.** Open Food Facts heeft het Franse biologisch-logo AB Agriculture Biologique (88.359 [37]); Roboflow heeft Koreaanse sorteertekens [57]. Triman, Nutri-Score D/E en de harscodes zijn inmiddels eigen klassen en dus geen tegenvoorbeeld meer.

**Niet gebruiken:** de Nutri-Score-set van Open Food Facts op Roboflow (niet-commercieel) [46], Kaggle "Seven Plastics" en de MIT-kopieën ervan [2][3], alle logo-benchmarks uit papers [6]–[13], en de Roboflow-Nutri-Score-set van 571 beelden tot de herkomst is nagegaan [47].

## 9. Open vragen

**Licentievragen** (voor een jurist, of een bewuste keuze van Friso):

1. Telt een getraind model als afgeleid werk van CC BY-SA-foto's (Open Food Facts, NutriGreen)? Dat bepaalt of de plicht tot gelijk delen geldt [42][92].
2. Mogen we CC BY-sets van Roboflow commercieel gebruiken met een gratis account, gezien "internal, non-commercial use"? Of nemen we een betaald abonnement [45]?
3. Nutri-Score: bij welke Nederlandse instantie dienen we het verzoek in als "software editor" [22]? De voorwaarden hebben een aparte bijlage voor Nederland, die nog niet gelezen is.
4. Telt intern trainen als "gebruik" van een merk voor MSC, FSC, Vegan Society, Rainforest Alliance, statiegeld en HQC? Geen document noemt het [26][28][29][72][77][86].
5. Valt het UKCA-teken onder de Open Government Licence [69]? En wat is de licentie van de recyclingset van Bologna [5]?

**Overig:**

6. Komt de Roboflow-Nutri-Score-set van 571 beelden uit de niet-commerciële set [47]? Te beantwoorden door de beelden te vergelijken.
7. Welke symbolen vallen onder "recyclable material" (1.939) en "aluminium" (579) bij Open Food Facts? Een steekproef van foto's bekijken beantwoordt dit.
8. Welke Nederlandse halal-logo's zijn NL1–NL3 in "HalalLogoDetection" [59]? Ook hier een steekproef.
9. De betekenis van `SEPARATE_COLLECTION`, `AISE_2020_COMPANY` en `MANCHESTER_BEIS_DIN` is niet bevestigd via de GS1-codelijst. De GS1-woordenlijst die wel te lezen was, bevat ze niet [94].
10. Niet doorzocht (zoektijd op): Roboflow voor statiegeld, UKCA, aluminium, AISE, Design for the Environment, Weidemelk, Beter Leven, ASC, Rainforest Alliance, AB en de 18+-leeftijdswaarschuwing; plantaardig en eiwitrijk als logo.

## 10. Zoektermen en negatieve bevindingen

| Bron | Zoektermen (samengevat) | Resultaat |
|---|---|---|
| Open Food Facts | zoekfunctie per taxonomie-ID voor alle top-50-codes; Hugging Face-organisatie; GitHub-releases | grootste bron; 0 voor CE, UKCA, Halal Quality Control, Manchester Beth Din, GGN; geen eigen label voor de Möbius-lus en de 18+-leeftijdswaarschuwing [37][38] |
| Roboflow Universe | nutriscore, green dot, gruener punkt, recycling symbol, mobius loop, organic logo, eu organic, eco label, certification logo, pregnancy alcohol, msc label, fsc logo, v-label, triman, fairtrade, halal logo, kosher, gluten free, vegetarian logo, lactose free, resin code, ce mark, ghs | kleine sets (§4); niet gevonden: zwangerschap, MSC, V-label, Triman, Fairtrade, Möbius-lus [D2][E1][E3] |
| Hugging Face | ecolabel, eco-label, recycle symbol, green dot, organic label, certification, msc, vegan, fairtrade, fsc, halal, kosher, gluten, packaging, logo detection, pictogram | alleen harscodes (kopie) en twee afgeschermde sets [1][17][18] |
| Kaggle | eco label, organic label, certification logo, food logos, nutriscore, halal logo, kosher, gluten free logo, fairtrade, fsc logo, green dot, ce mark, ghs pictogram, vegan logo, msc label, triman, recycling symbol | alleen recyclingsets zonder vakjes [3][4][93] |
| Zenodo | eco-label detection, recycling symbol, resin identification code, Nutri-Score images, food packaging logos, certification logo, green dot packaging (tien termen) | alleen NutriGreen [16] |
| GitHub | eco-label, recycling symbol, nutri-score, certification logo, halal logo, kosher, gluten free | alleen code en apps, geen data [D3][E3] |
| Papers | LogoDet-3K, FoodLogoDet-1500, QMUL-OpenLogo, FlickrLogos, Logo-2K+, LLD, WebLogo-2M, OSLD, PL2K; klassenlijsten doorzocht | geen keurmerken; licenties onderzoek-alleen [6]–[13] |
| Officiële sites | per keurmerk de downloadpagina en de gebruiksvoorwaarden | §6 |

### Metingen herhalen

**Telling top 50.** Geteld uit de productiedeclaraties van 6.586 basiseenheden met artwork (113 leveranciers), bestand [declaraties-prod-basiseenheden-20261008.tsv](../../eindtest-logo-pijplijn/declaraties-prod-basiseenheden-20261008.tsv), kolommen `t3777`, `dieet` (hier `DIET_`), `nutriscore` en `ghs` (hier `GHS_`). Per basiseenheid één keer geteld. De catalogusbrede telling van juni (143.962 artikelen, alleen `t3777`, top 30) staat in [keurmerk-declaratie-frequentie.md §3](../../../../tests/validation/keurmerk-declaratie-frequentie.md).

> [!note]
> VERIFIED (eigen hertelling, 01-11-2026): de top 50 uit het declaratiebestand klopt exact met de lijst van de opdrachtgever. Opvallend: `PREGNANCY_WARNING` komt in dit productiebestand niet voor (`grep -c PREGNANCY` = 0), wel op plek 17 (401 artikelen) in de catalogusbrede telling van juni.
>
> Meting (herhaalbaar, in de map `eindtest-logo-pijplijn`): `python3 -I -c "import csv,collections; c=collections.Counter(); [c.update({*('DIET_'+v for v in (r['dieet'] or '').split(';') if v), *('NUTRISCORE_'+v for v in (r['nutriscore'] or '').split(';') if v), *('GHS_'+v for v in (r['ghs'] or '').split(';') if v), *(v for v in (r['t3777'] or '').split(';') if v)}) for r in csv.DictReader(open('declaraties-prod-basiseenheden-20261008.tsv'), delimiter='\t')]; print(c.most_common(54))"`

**Open Food Facts-aantallen (herhaalbaar):** `curl -s "https://robotoff.openfoodfacts.org/api/v1/images/logos/search?type=label&taxonomy_value=<ID>&count=1"` en lees het veld `count`. Voor verpakkingssymbolen: `type=packaging&value=<waarde>`. De ID's komen uit de keurmerkenlijst (taxonomie) van Open Food Facts [43]. Een aantal is het aantal benoemde logo's met een vakje, niet het aantal verschillende foto's.

> [!note]
> **Negatieve bevindingen zijn "niet gevonden", nooit "bestaat niet".**
> - **Volledige lijst zwak gedekte codes.** Geen openbare set met vakjes gevonden voor het zwangerschapspictogram (buiten Open Food Facts), Weidemelk (buiten de mogelijk gemengde 608), Beter Leven (118 en 30), PlanetProof (27), statiegeld, NATRUE, PETA, GGN, AISE, Design for the Environment, Manchester Beth Din, Halal Correct en de doorgekruiste container.
> - Geen officieel bestand gevonden voor Triman, het zwangerschapspictogram, Beter Leven, Halal Correct en aluminium.
> - Geen enkel voorwaardendocument dat we lazen noemt het trainen van software of automatische herkenning; Rainforest Alliance noemt alleen intern trainingsmateriaal [77].

## 11. Bronnen

Alle bronnen opgehaald op 01-11-2026, tenzij anders vermeld. [D1]–[E3], [M1] en [K1] verwijzen naar de ruwe verslagen in [digests/datasets-2026-11-01/](digests/datasets-2026-11-01/).

| # | Ondersteunt | Uitgever | Datum | Opgehaald | Zekerheid |
|---|---|---|---|---|---|
| [1] | Hugging Face: geen eco-label-sets | [Hugging Face API](https://huggingface.co/api/datasets?search=ecolabel) | live | 2026-11-01 | hoog |
| [2] | MIT-label op kopie van harscode-set | [aytvill (Hugging Face)](https://huggingface.co/datasets/aytvill/plastic-recycling-codes) | 2023-08 | 2026-11-01 | hoog (betwist: licentie) |
| [3] | Seven Plastics, CC-BY-NC-SA-4.0 | [piaoya (Kaggle)](https://www.kaggle.com/datasets/piaoya/plastic-recycling-codes) | 2020-02 | 2026-11-01 | hoog |
| [4] | Recycle Symbols, 21 klassen, ODbL/DbCL | [beksultankarimov (Kaggle)](https://www.kaggle.com/datasets/beksultankarimov/recycle-symbols-classification-dataset) | 2021-04 | 2026-11-01 | hoog |
| [5] | Recycling Symbols, deels vakjes, geen licentie | [MI@BioLab, Universiteit van Bologna](https://miatbiolab.csr.unibo.it/the-recycling-symbols-dataset/) | 2022-11 | 2026-11-01 | hoog |
| [6] | LogoDet-3K, geen licentie | [Wang et al. (GitHub)](https://github.com/Wangjing1551/LogoDet-3K-Dataset) | 2020-08 | 2026-11-01 | hoog |
| [7] | LogoDet-3K klassenlijst zonder keurmerken | [axonstan (Hugging Face-kopie)](https://huggingface.co/datasets/axonstan/LogoDet-3K) | 2025-02 | 2026-11-01 | hoog |
| [8] | FoodLogoDet-1500 zonder keurmerken | [Hou et al. (GitHub)](https://github.com/hq03/FoodLogoDet-1500-Dataset) | 2021-09 | 2026-11-01 | hoog |
| [9] | QMUL-OpenLogo, alleen onderzoek | [QMUL](https://hangsu0730.github.io/qmul-openlogo/) | 2018 | 2026-11-01 | hoog |
| [10] | FlickrLogos, op aanvraag | [Universiteit Augsburg](https://www.uni-augsburg.de/en/fakultaet/fai/informatik/prof/mmc/research/datensatze/flickrlogos/) | n.b. | 2026-11-01 | hoog |
| [11] | LLD, alleen onderzoek | [ETH Zürich](https://data.vision.ee.ethz.ch/sagea/lld/) | n.b. | 2026-11-01 | hoog |
| [12] | WebLogo-2M, alleen onderzoek | [QMUL](https://weblogo2m.github.io/) | 2017 | 2026-11-01 | hoog |
| [13] | OSLD, CC BY-NC 4.0 | [Bastan et al. (GitHub)](https://github.com/mubastan/osld) | 2022-03 | 2026-11-01 | hoog |
| [14] | Open Images: geen klasse met vakjes voor logo's | [Google](https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv) | 2022 | 2026-11-01 | hoog |
| [15] | Open Images-licentie | [Google](https://storage.googleapis.com/openimages/web/factsfigures_v7.html) | 2022 | 2026-11-01 | hoog |
| [16] | Zenodo: niets buiten NutriGreen | [Zenodo API](https://zenodo.org/api/records?q=eco-label%20detection&type=dataset) | live | 2026-11-01 | hoog |
| [17] | Afgeschermde Nutri-Score-set | [vishsec (Hugging Face)](https://huggingface.co/datasets/vishsec/nutri-score-dataset) | 2026-07 | 2026-11-01 | hoog |
| [18] | Afgeschermde set voedseletiketten | [useKled (Hugging Face)](https://huggingface.co/datasets/useKled/food-labels) | 2026-10 | 2026-11-01 | hoog |
| [19] | Logo-2K+, geen licentie | [Wang et al. (GitHub)](https://github.com/msn199959/Logo-2k-plus-Dataset) | 2020-08 | 2026-11-01 | middel |
| [20] | EU-bio: vrije download en regels | [Europese Commissie, DG AGRI](https://agriculture.ec.europa.eu/farming/organic-farming/organic-logo_en) | 2025-07 | 2026-11-01 | hoog |
| [21] | Nutri-Score: gratis na registratie | [Santé publique France](https://www.santepubliquefrance.fr/nutrition-et-activite-physique/nutri-score) | 2026-03 | 2026-11-01 | hoog |
| [22] | Nutri-Score: software-makers vooraf toestemming | [Santé publique France, gebruiksvoorwaarden](https://www.santepubliquefrance.fr/sites/default/files/rdd/document/march2025CoU_EN.pdf) | 2025-03 | 2026-11-01 | hoog |
| [23] | Nutri-Score: grafische richtlijn en varianten | [Santé publique France](https://www.santepubliquefrance.fr/sites/default/files/rdd/document/SPF-CharteNutriscore-ENG-march_2024.pdf) | 2024-03 | 2026-11-01 | hoog |
| [24] | Groene Punt: beschermd merk, contract nodig | [Der Grüne Punkt – DSD GmbH](https://www.gruener-punkt.de/fileadmin/Dateien/Downloads/PDFs/AGB/DigiDot/Brand_Guidelines_GreenDot_DigiDot_060826.pdf) | 2026-06 | 2026-11-01 | hoog |
| [25] | Recyclesymbool publiek domein | [Wikipedia](https://en.wikipedia.org/wiki/Recycling_symbol) | n.b. | 2026-11-01 | laag |
| [26] | MSC: licentie nodig | [Marine Stewardship Council](https://www.msc.org/for-business/use-the-blue-msc-label/approve) | 2026-08 | 2026-11-01 | middel |
| [27] | MSC-beeldbank alleen voor licentiehouders | [Marine Stewardship Council](https://www.msc.org/en-us/for-business/marketing-resources) | n.b. | 2026-11-01 | middel |
| [28] | Vegan Society: alleen merkhouders | [The Vegan Society](https://www.vegansociety.com/vegan-trademark/trademark-faqs) | n.b. | 2026-11-01 | middel |
| [29] | FSC: registratie nodig | [Forest Stewardship Council](https://fsc.org/en/use-our-logo) | n.b. | 2026-11-01 | middel |
| [30] | Weidemelk: licentie en downloads na akkoord | [Stichting Weidegang](https://www.weidemelk.nl/nl/voorwaarden.html) | n.b. | 2026-11-01 | hoog |
| [31] | Frans besluit 2 oktober 2006 | [CNGOF, kopie Journal officiel](https://cngof.fr/wp/../app/pdf/Juridique//Obstetrique/JO-03-10-06%20Alcool%20et%20grossesse.pdf) | 2006-10 | 2026-11-01 | middel |
| [32] | Zwangerschapspictogram in voorlichting 2025 | [Santé publique France](https://www.santepubliquefrance.fr/alcool/depliantflyer/zero-alcool-pendant-la-grossesse) | 2025 | 2026-11-01 | middel |
| [33] | Nederlandse sectorafspraak 2014 | [DutchNews](https://www.dutchnews.nl/news/2014/04/drinks_companies_agree_to_warn) | 2014-04 | 2026-11-01 | laag |
| [34] | Beter Leven: certificering via Kiwa | [Kiwa](https://www.kiwa.com/nl/nl/diensten/certificering/beter-leven-keurmerk/) | n.b. | 2026-11-01 | laag |
| [35] | Triman: alleen bestanden van derden | [VAT Compliance (derde partij)](https://vatcompliance.co/fr/blog/guide-2026-etiquetage-triman-et-conformite-epr-en-france/) | 2026 | 2026-11-01 | laag |
| [36] | Robotoff-zoekfunctie: parameters, max. 2.000 | [Open Food Facts, Robotoff API-spec](https://raw.githubusercontent.com/openfoodfacts/robotoff/main/docs/references/api.yml) | live | 2026-11-01 | hoog |
| [37] | Robotoff-tellingen en records (meting D1) | [Open Food Facts, Robotoff](https://robotoff.openfoodfacts.org/api/v1/images/logos/search?type=label&taxonomy_value=en:eu-organic&count=2) | live | 2026-11-01 | hoog |
| [38] | Robotoff-tellingen, tweede meting en top 50 (meting M1) | [Open Food Facts, Robotoff](https://robotoff.openfoodfacts.org/api/v1/images/logos/search?type=label&taxonomy_value=en:green-dot&count=1) | live | 2026-11-01 | hoog |
| [39] | Nutri-Score-set Hugging Face, CC-BY-SA 3.0 | [Open Food Facts (Hugging Face)](https://huggingface.co/datasets/openfoodfacts/nutriscore-object-detection) | 2024-07 | 2026-11-01 | hoog |
| [40] | Algemene logoset, één klasse, geen licentie | [Open Food Facts (Hugging Face)](https://huggingface.co/datasets/openfoodfacts/universal-logo-detector) | 2025-11 | 2026-11-01 | hoog |
| [41] | Logo-release 2022 | [Open Food Facts (GitHub)](https://github.com/openfoodfacts/openfoodfacts-ai/releases/tag/dataset-logo-2022-01-21) | 2022-01 | 2026-11-01 | hoog |
| [42] | Licentie Open Food Facts | [Open Food Facts, gebruiksvoorwaarden](https://world.openfoodfacts.org/terms-of-use) | n.b. | 2026-11-01 | hoog |
| [43] | Keurmerkenlijst (taxonomie) | [Open Food Facts (GitHub)](https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/labels.txt) | live | 2026-11-01 | hoog |
| [44] | ODbL-samenvatting, downloads via AWS | [Open Food Facts, data](https://world.openfoodfacts.org/data) | n.b. | 2026-11-01 | hoog |
| [45] | Roboflow-voorwaarden | [Roboflow, Inc.](https://roboflow.com/terms) | 2024-05 | 2026-11-01 | hoog |
| [46] | Nutri-Score Roboflow, BY-NC-SA 4.0 | [Open Food Facts (Roboflow)](https://universe.roboflow.com/open-food-facts/nutriscore-detection-zsaze) | ca. 2024 | 2026-11-01 | hoog |
| [47] | Nutri-Score Roboflow, 571 beelden, CC BY 4.0 | [dev-om30i (Roboflow)](https://universe.roboflow.com/dev-om30i/nutriscore-detection) | ca. 2025 | 2026-11-01 | hoog (herkomst twijfel) |
| [48] | Nutri-Score A/B, 198 beelden | [gaia-i7wim (Roboflow)](https://universe.roboflow.com/gaia-i7wim/ai-docextract) | ca. 2024 | 2026-11-01 | hoog |
| [49] | Nutri-Score één klasse, 792 beelden | [nutriscore-8ft7m (Roboflow)](https://universe.roboflow.com/nutriscore-8ft7m/mynutriscore_yolov8-zebgm) | ca. 2025 | 2026-11-01 | hoog |
| [50] | "Green Dot", 273 beelden | [oakd-d5mnv (Roboflow)](https://universe.roboflow.com/oakd-d5mnv/green-dot-1ou0a) | ca. 2023 | 2026-11-01 | hoog (inhoud onzeker) |
| [51] | "recycle", 100 beelden | [recyclesimbol (Roboflow)](https://universe.roboflow.com/recyclesimbol/recycle-xvfgq) | ca. 2023 | 2026-11-01 | hoog |
| [52] | Mengset 44 beelden | [ocr-johyf (Roboflow)](https://universe.roboflow.com/ocr-johyf/symbol-y8o1i) | ca. 2026 | 2026-11-01 | hoog |
| [53] | "Organic EU", 100 beelden | [Kavindus Workspace (Roboflow)](https://universe.roboflow.com/kavindus-workspace-dz4ma/organic-eu) | ca. 2026 | 2026-11-01 | hoog |
| [54] | "Vegan", 140 beelden | [Kavindus Workspace (Roboflow)](https://universe.roboflow.com/kavindus-workspace-dz4ma/vegan-7hv7p) | ca. 2026 | 2026-11-01 | hoog |
| [55] | "vegan_labels", 200 beelden | [Mishmish2007 (Roboflow)](https://universe.roboflow.com/mishmish2007/vegan_labels) | ca. 2024 | 2026-11-01 | hoog |
| [56] | "cert_check", 469 beelden, MIT | [data-ofkor (Roboflow)](https://universe.roboflow.com/data-ofkor/cert_check) | ca. 2024 | 2026-11-01 | hoog |
| [57] | Koreaanse sorteertekens, 1.049 beelden | [CLRS (Roboflow)](https://universe.roboflow.com/clrs/20230228_recycle_symbol) | ca. 2022 | 2026-11-01 | hoog |
| [58] | Harscodes, 845 beelden, CC BY 4.0 | [NIR (Roboflow)](https://universe.roboflow.com/nir/recycling-codes-detection-v2) | ca. 2022 | 2026-11-01 | hoog |
| [59] | HalalLogoDetection, 1.292 beelden, Public Domain | [playground-yhjyf (Roboflow)](https://universe.roboflow.com/playground-yhjyf/halallogodetection) | 2024-11 | 2026-11-01 | hoog |
| [60] | "halal logo", 3.137 beelden, CC BY 4.0 | [utem-b2zyf (Roboflow)](https://universe.roboflow.com/utem-b2zyf/halal-logo) | 2023-06 | 2026-11-01 | hoog |
| [61] | "halal-capstone", 4.369 beelden, Public Domain | [capstone-hjceo (Roboflow)](https://universe.roboflow.com/capstone-hjceo/halal-capstone-yks8k) | 2025-10 | 2026-11-01 | hoog |
| [62] | Zuidoost-Aziatische halal-sets, CC BY 4.0 | [dania-ss8pv (Roboflow)](https://universe.roboflow.com/dania-ss8pv/sea-halal-logo-qke16) | 2025-11 | 2026-11-01 | hoog |
| [63] | "Gluten Free", 200 beelden, licentie onbekend | [Kavindus Workspace (Roboflow)](https://universe.roboflow.com/kavindus-workspace-dz4ma/gluten-free) | n.b. | 2026-11-01 | middel |
| [64] | "kosher track", tot 51 beelden | [bar eizenberg (Roboflow)](https://universe.roboflow.com/bar-eizenberg-bzh1o/kosher-track-mi3eb) | n.b. | 2026-11-01 | middel |
| [65] | Roboflow-sets met CE-klasse | [training-4j1k4 (Roboflow)](https://universe.roboflow.com/training-4j1k4/logodetect_2) | 2024–2025 | 2026-11-01 | laag |
| [66] | Roboflow GHS-sets | [pictogram (Roboflow)](https://universe.roboflow.com/pictogram/picto) | 2025 | 2026-11-01 | laag |
| [67] | Roboflow harscode-sets 1.600 en 795 | [recyclingcodes (Roboflow)](https://universe.roboflow.com/recyclingcodes) | ca. 2024 | 2026-11-01 | laag |
| [68] | CE: vrije download | [Europese Commissie, DG GROW](https://single-market-economy.ec.europa.eu/single-market/goods/ce-marking_en) | 2021-10 | 2026-11-01 | hoog |
| [69] | UKCA: vrije download, OGL | [UK Government](https://www.gov.uk/guidance/using-the-ukca-marking) | 2026-08 | 2026-11-01 | hoog |
| [70] | ASTM D7611 betaald | [ASTM](https://store.astm.org/d7611_d7611m-26.html) | 2026-07 | 2026-11-01 | middel |
| [71] | Doorgekruiste container (WEEE bijlage IX) | [lawplayer (secundair)](https://lawplayer.com/eu/article/32012L0019/anx_IX) | n.b. | 2026-11-01 | middel |
| [72] | Statiegeldlogo alleen voor geregistreerden | [Statiegeld Nederland](https://statiegeldnederland.nl/gm-files/voorschriften-gebruik-statiegeldlogo-3-eng.pdf) | 2023-04 | 2026-11-01 | hoog |
| [73] | GDA heet nu Aluminium Deutschland | [packaging-journal.de](https://packaging-journal.de/en/gda-becomes-aluminium-germany/) | n.b. | 2026-11-01 | middel |
| [74] | AISE: logo's alleen voor leden | [A.I.S.E.](https://aise.events.idloom.com/document/7497/aise-charter2020-brochure.pdf) | n.b. | 2026-11-01 | laag |
| [75] | EPA Safer Choice en DfE | [US EPA](https://www.epa.gov/system/files/documents/2024-08/epas-safer-choice-and-design-for-the-environment-dfe-standard-with-changes-in-green.pdf) | 2024-08 | 2026-11-01 | middel |
| [76] | BOB en BGA: vrije download | [Europese Commissie](https://agriculture.ec.europa.eu/document/download/8c1593fe-d851-4a0e-a611-1ead4876d1e3_en?filename=protected-designation-origin-logos_en.zip) | 2018-04 | 2026-11-01 | hoog |
| [77] | Rainforest Alliance: ook interne training ter goedkeuring | [Rainforest Alliance](https://knowledge.rainforest-alliance.org/docs/labeling-and-claims-policy) | 2026-10 | 2026-11-01 | hoog |
| [78] | Fairtrade: goedkeuring vóór drukken | [Fairtrade International](https://www.fairtrade.net/en/for-business/mark-use-guidelines-.html) | 2026 | 2026-11-01 | middel |
| [79] | B Corp-merkboek | [B Lab](https://brand.bcorp.com/) | 2026 | 2026-11-01 | middel |
| [80] | NATRUE: alleen goedgekeurde formules | [NATRUE](https://natrue.org/uploads/2023/08/English_NATRUE-Label-Usage-Guidelines_v.2_2021-1.pdf) | 2021 | 2026-11-01 | middel |
| [81] | PETA: licentie $350 | [PETA](https://peta.org/living/personal-care-fashion/beauty-without-bunnies/) | n.b. | 2026-11-01 | middel |
| [82] | GLOBALG.A.P.: label via secretariaat | [GLOBALG.A.P.](https://documents.globalgap.org/documents/230523_GG_Trademarks_policy_v1_0-1_en.pdf) | 2023-05 | 2026-11-01 | middel |
| [83] | ASC: alleen licentiehouders | [ASC International](https://asc-aqua.org/wp-content/uploads/2025/01/106-Logo-User-Guide-Update-January-2025.pdf) | 2025-01 | 2026-11-01 | middel |
| [84] | Beter Leven: geen logopagina | [Stichting Beter Leven keurmerk](https://beterleven.dierenbescherming.nl/) | n.b. | 2026-11-01 | hoog |
| [85] | Crossed Grain alleen onder licentie | [AOECS](https://www.aoecs.org/working-with-food/gluten-free-certification/) | n.b. | 2026-11-01 | hoog |
| [86] | HQC: niet bijsnijden of hertinten | [Halal Quality Control, richtlijn 0407](https://halalqualitycontrol.com/wp-content/uploads/2026/08/HQC-Brand-Identity-and-Verification-Guideline.pdf) | 2026 | 2026-11-01 | hoog |
| [87] | Halal Correct: geen voorwaarden gevonden | [Halal Correct Certification](https://www.halalcorrect.com/) | n.b. | 2026-11-01 | hoog |
| [88] | OU: geregistreerd certificeringsmerk | [Orthodox Union](https://oukosher.org/blog/consumer-kosher/the-illegal-ou/) | 2004-05 | 2026-11-01 | hoog |
| [89] | OK Kosher: alleen voor klanten | [OK Kosher Certification](https://www.ok.org/article/is-the-letter-k-really-a-trademark-can-they-do-that-part-1/) | 2022-11 | 2026-11-01 | hoog |
| [90] | Manchester Beth Din, MK-logo | [Manchester Beth Din](https://www.mbd.org.uk/) | n.b. | 2026-11-01 | hoog |
| [91] | V-label: persbestanden en stijlgids | [V-Label GmbH](https://www.v-label.com/press-materials/) | n.b. | 2026-11-01 | hoog |
| [92] | NutriGreen: aantallen en CC BY-SA 4.0 | [Zenodo, record 10020545](https://zenodo.org/records/10020545) | 2024-02 | 2026-10-31 en 2026-11-01 | hoog |
| [93] | Kaggle: geen keurmerk-beeldsets | [Kaggle API](https://www.kaggle.com/api/v1/datasets/list?search=halal%20logo) | live | 2026-11-01 | hoog |
| [94] | GS1-woordenlijst: Crossed Grain; codes ontbreken | [GS1 Web Vocabulary](https://ref.gs1.org/voc/data/gs1Voc.jsonld) | actueel | 2026-11-01 | hoog |
| [95] | Kaggle "Green dot", inhoud onbekend | [gaurav1xcvb (Kaggle)](https://www.kaggle.com/datasets/gaurav1xcvb/green-dot) | 2026-04 | 2026-11-01 | laag |

## 12. Houdbaarheid van de beweringen

Berekend met `recon_kit.py staleness` (vensters: tellingen 3 maanden, licenties en voorwaarden 6 maanden). Alle licenties en voorwaarden zijn op 01-11-2026 live gelezen; die datum is het peilmoment, niet de datum van het document.

| Bewering | Soort | Opnieuw controleren |
|---|---|---|
| Tellingen per keurmerk bij Open Food Facts [38] | tellingen | 2027-02-01 |
| Licentie Open Food Facts [42], NutriGreen [92], Nutri-Score-set Hugging Face [39] | licentie | 2027-05-01 |
| Roboflow-voorwaarden voor het gratis abonnement [45] | licentie | 2027-05-01 |
| Licenties van Roboflow-sets: halal [59], Nutri-Score 571 [47], MIT-kopie (betwist) [2] | licentie | 2027-05-01 |
| Voorwaarden Nutri-Score [22], CE [68], EU-bio [20], Rainforest Alliance [77] | voorwaarden | 2027-05-01 |

Vroegste hercontrole: **1 februari 2027** (de tellingen groeien elke dag). Bij een nieuwe meting: dezelfde zoekopdrachten als in §10, "Metingen herhalen".

**Stand van de bewijsvoering** (geteld met `recon_kit.py tally` uit het logboek): 4 beweringen VERIFIED met een tweede meting of lezing, 7 met één bron, 1 betwist.
