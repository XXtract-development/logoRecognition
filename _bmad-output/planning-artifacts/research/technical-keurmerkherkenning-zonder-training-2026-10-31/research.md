---
title: 'Technisch onderzoek: herkenning van keurmerken op etiketbestanden'
type: 'technical'
shape: 'select'
topic: 'Herkenning van logo''s en keurmerken op etiketbestanden en drukproeven: taalmodellen, vrij beschikbare technieken en getrainde detectoren'
decision: 'Welke aanpak (vrij beschikbare code en technieken; commerciële taalmodellen toegestaan; geen betaalde logoherkenningsdiensten) testen we als eerste om de top-15 keurmerken betrouwbaar te herkennen (≥80% gevonden, <10% vals per keurmerk)?'
source: 'eigen onderzoek (bmad-deep-recon, preset deep, drie rondes) plus een aanvullende ronde over getrainde detectoren'
status: complete
preset: 'deep'
validation: 'normal'
created: '2026-10-31'
updated: '2026-10-31'
sources: 90
claims_verified: 9
claims_unverified: 8
---

# Technisch onderzoek: herkenning van keurmerken op etiketbestanden

**Besluit dat dit onderzoek dient:** welke aanpak we als eerste testen om de top-15 keurmerken op etiketbestanden betrouwbaar te herkennen, met per keurmerk minstens 80% gevonden en minder dan 10% valse meldingen. Of dat er geen geloofwaardige route is.

## Samenvatting

**Antwoord.** Train een eigen detector op onze keurmerken. Gebruik daarbij wat het etiketbestand zelf verraadt, en zet een taalmodel alleen in voor twijfelgevallen. Op algemene tests is een getrainde detector veel sterker dan een taalmodel dat zelf zoekt. Een volledig getrainde detector haalt 55–60 punten op een schaal van 0 tot 100. Met maar 10 voorbeelden per soort is dat nog 20–34, terwijl Gemini 2.5 Pro op 9–12 blijft steken [66]. Onze huidige route laat juist het taalmodel zoeken en aanwijzen.

**Aanbeveling.** Een proef van twee à drie weken op een door een mens bevestigde toetsset. Het labelwerk bepaalt de duur.
- **Route D, getrainde detector.** Een detector met vrije licentie (RF-DETR of D-FINE, Apache-2.0) [72][73]. De trainingsdata komt uit twee bronnen: officiële logobestanden die we op echte etiketachtergronden plakken, en echte productie-etiketten die een taalmodel vooraf labelt en een mens corrigeert.
- **Route A, eerst het etiketbestand.** Verplichte codes uitlezen (FSC, MSC, EU-biologisch) [41][43][44], en de Nutri-Score-letter met een vaste regel lezen [36].
- **Taalmodel alleen als beoordelaar** van twijfelgevallen, met het referentieplaatje erbij.
- Klantartwork gaat alleen naar diensten die niets bewaren (§6).

> [!warning]
> **Grootste voorbehoud.** Er is geen enkele openbare meting per keurmerk, voor geen enkele route. Hoeveel echte voorbeelden een detector per keurmerk nodig heeft, is onbekend. In benchmarks gebruikt men 40–70 per soort [89]; leveranciers adviseren 1.500 [84]. Alleen met nagemaakte voorbeelden trainen haalde bij logo's 48,6 punten, tegen 74,7 met ook 40 echte voorbeelden per logo [81]. Onze eigen eerdere poging met een getrainde detector strandde op te weinig voorbeelden (22 etiketbestanden; projectgeheugen, niet opnieuw gecontroleerd).

**Waarom.**
1. **Getraind wint van alleen een goede vraag.** Dat blijkt op 100 praktijkdatasets [66]. Ook in de praktijk heeft iedereen die het werkend kreeg getraind: Open Food Facts [57][59], NutriGreen [61] en het verpakkingsbedrijf SGS&CO [54].
2. **Een taalmodel is een slechte zoeker maar een redelijke beoordelaar.** Laat je GPT-5 per voorgesteld vakje "waar of niet waar" zeggen, dan haalt het 79 op 100. Laat je het zelf vakjes aanwijzen, dan 12 [8]. Hoe vaak het ten onrechte "ja" zegt, is niet gemeten. In een verwante situatie (plaatsherkenning) lag dat tussen 12% en 65% [35]. Daarom krijgt het taalmodel alleen de twijfelgevallen.
3. **Het etiketbestand helpt waar het kan.** Bij een aantal keurmerken staat een verplichte code op het etiket [41][43][44]. De Nutri-Score is een vectortekening met vaste kleuren per letter [36]. Hoeveel van onze etiketbestanden die informatie echt bevatten, moeten we eerst meten.
4. **Zonder training blijft de bewijslast even groot.** Om "minder dan 10% vals" aan te tonen zijn per keurmerk minstens 30 door een mens bevestigde etiketten zonder dat keurmerk nodig [63].

**Afgevallen:**
- detectoren die je alleen met een naam of voorbeeldplaatje aanstuurt (op logo's scoren de gemeten detectoren 6–10 [19]);
- het taalmodel zelf laten inzoomen (geen bewijs op ons soort beeld [14][15]);
- Ultralytics-YOLO zonder betaalde licentie, vanwege AGPL [71];
- betaalde logoherkenningsdiensten.

*Gebaseerd op 90 bronnen uit vier zoekrondes. Van de 17 bijgehouden kernclaims zijn er 9 onafhankelijk gecontroleerd. Niet gecontroleerd: de controlestap per vakje [8], de kosten per etiket, de stand van Open Food Facts [58], de scores uit [66], [81] en [86] (elk één bron), en de bevinding dat geen studie meet hoe vaak een taalmodel ten onrechte "ja" zegt. Lees "punten" steeds op de schaal die de bron gebruikt; hoger is beter (zie §1).*

## Eisenkader (afgesproken met Friso, 31-10-2026)

**Harde eisen**
- Geen betaalde, kant-en-klare diensten voor logo- of merkherkenning.
- Commerciële taalmodellen via API (OpenAI, Anthropic, Google) zijn toegestaan, mits klantartwork niet bewaard of voor training gebruikt wordt.
- Code en technieken zijn vrij verkrijgbaar en commercieel bruikbaar, bijvoorbeeld via GitHub of gepubliceerde methoden.
- Een keurmerk mag alleen "automatisch" als het minstens 80% gevonden haalt en minder dan 10% valse meldingen geeft.

**Gewogen wensen**
- Snel te realiseren: een proef binnen enkele weken.
- Redelijke kosten en snelheid per etiket, op de bestaande server of via API.
- Kleine keurmerken (±80–150 px) vinden op enorme drukproeven (tot ±3.000 × 21.000 px).
- Verwarbare groepen uit elkaar houden: Nutri-Score A/B/C, V-label/Vegan Society/Vegan, Groene Punt/Recyclebaar.

> [!note]
> **Aanvulling, 31-10-2026.** De oorspronkelijke eis was "zonder intensieve training". Op verzoek van Friso zijn daarna ook getrainde detectoren onderzocht (§7). De gewichten in §9 zijn een voorstel van de onderzoeker en niet met Friso afgestemd.

**Twee rollen, steeds met dezelfde naam:**
- een **voorsteller** wijst kandidaat-vakjes aan;
- een **beoordelaar** zegt per vakje ja, nee of twijfel.

Een *beeldvergelijking* (in vaktaal: embedding) meet hoeveel een uitsnede op een referentieplaatje lijkt.

## 1. Taalmodellen: kunnen ze kleine keurmerken vinden en aanwijzen?

*Over de scores in dit rapport: elke bron gebruikt een eigen maat, zoals mAP of F1. Hoger is altijd beter. Een getal als 84,7 is op een schaal van 100, een getal als 0,92 op een schaal van 1.*

- **Alleen Google beschrijft officieel dat zijn model vakjes teruggeeft.** Gemini geeft de positie als coördinaten van 0 tot 1000 [1]. Een beperking voor kleine objecten wordt niet genoemd; dat bewijst niet dat die er niet is.
- **Anthropic en OpenAI noemen hun coördinaten uitdrukkelijk "benaderend".** Anthropic waarschuwt voor fouten bij beelden kleiner dan 200 px [3][4].
- **Een hele drukproef past bij geen enkele aanbieder in één keer op volle scherpte.**
  - Claude accepteert maximaal 8.000 px en verkleint de lange zijde tot 2.576 px [3].
  - OpenAI weigert een beeld dat groter is dan 30.000 beeldblokjes van 32 × 32 px; zo'n drukproef telt er ongeveer 61.758 [4].
  - Gemini rekent per beeld met een maximum van ongeveer 1.120 tokens (rekeneenheden) [2].
  - Tegelen is dus verplicht. Dat volgt uit rekenwerk op de officiële grenzen.
- **Algemene detectiescores**, gemeten door Roboflow op een onbekende verzameling, zonder uitsplitsing naar objectgrootte [5] (*medium*):

  | Model | Normale inzet | Hoge inzet |
  |---|---|---|
  | GPT-6.1 Terra | 84,7 | 84,7 |
  | Gemini 4 Argon | 82,5 | 85,1 |
  | Claude Opus 5.5 | 74,5 | 76,0 |

- **Op 100 praktijkdatasets** haalt Gemini 2.5 Pro zonder voorbeelden 11,6 [66]. Ter vergelijking: Grounding DINO 15,7, en een volledig getrainde YOLOv8n 55,4 [66].
  - In een onafhankelijke test op de standaardset COCO haalt Gemini 3 Pro Preview 0,407, ongeveer het niveau van een oudere getrainde YOLO-versie [67]. *Medium.*
- **Hoe kleiner het doel, hoe slechter.**
  - De nauwkeurigheid zakt tot 46% naarmate het doel kleiner wordt; uitknippen herstelt het grootste deel [6]. *Medium; gemeten op open modellen.*
  - Op COCO halen GPT en Gemini ongeveer 68–71% tegen 91% voor een getrainde YOLO, met het grootste verschil bij kleine objecten [12]. *Laag-medium.*
- **Voorbeeldplaatjes meesturen helpt nauwelijks als het model zelf de vakjes tekent.** GPT-4o blijft op 0,05 en Claude 3.7 op 0,03, met 1, 3 of 6 voorbeelden. Classificeert het model vakjes die iets anders heeft aangewezen, dan haalt GPT-4o 0,30 bij 6 voorbeelden [7]. *Gemeten op microscopie.*
- **Beoordelen gaat veel beter dan zelf zoeken.** Op de standaardtest RefCOCO, waarin het model het juiste object bij een omschrijving moet aanwijzen, scoort GPT-5:
  - 79,3 als het per voorgesteld vakje "waar of niet waar" zegt;
  - 70,1 als het uit alle vakjes het beste moet kiezen;
  - 11,7 als het zelf vakjes geeft [8].

  *Eén bron, en elke afbeelding bevat precies één doel. Het zegt dus niets over etiketten zonder het keurmerk.*
- **Zonder controlestap zegt een voorsteller met referentieplaatje vrijwel altijd "aanwezig"** [65].
  - Op een set waarin de helft het doel bevat en de helft niet, scoren zulke voorstellers F1 0,667. Dat is precies de score van "altijd ja". Grounding DINO komt zelfs maar op 0,42.
  - Met alleen een goede controlevraag aan een groot open model (Qwen3-VL-235B of -32B) stijgt dat naar 0,84–0,94.
  - Na lichte bijtraining (LoRA, ongeveer 700 voorbeelden) wordt het 0,92–0,99.
  - *Alleen open modellen getest, niet GPT, Claude of Gemini.*

> [!note]
> **Betekenis (INFERENCE).** Een taalmodel dat zelf over het hele etiket zoekt, zit in de rol waarin deze modellen het zwakst zijn. Als beoordelaar van een vakje dat iets anders heeft voorgesteld, zijn ze duidelijk sterker.

*De cijfers van Roboflow en de beeldgrenzen zijn in ronde 2 gecontroleerd.*

## 2. Inzoomen en zoeken in grote beelden zonder training

- **De bekende zoommethoden werken niet met de betaalde modellen.** ZoomEye, ViCrop en RAP zijn alleen getest op open modellen. Ze hebben interne waarden van het model nodig die de API's van GPT, Claude en Gemini niet geven [13][6][17].
- **Zoom-Refine werkt wel één-op-één via een API** [14].
  - Werkwijze: eerst geeft het model een antwoord en een vakje, daarna wordt dat vakje scherp uitgeknipt en volgt een tweede vraag.
  - Winst: +4 tot +5 punten, bij ongeveer 3,5 keer de rekentijd.
  - Zwakte: een verkeerd vakje in de eerste stap bederft de tweede.
- **Gemini 3 Flash "Agentic Vision"** (januari 2026) knipt en zoomt zelf [15].
  - Google claimt 5–10% winst, zonder absolute cijfers.
  - De vakjes worden op het beeld getekend, niet als coördinaten teruggegeven.
- **Op een moeilijke test met kleine doelen** (gemiddeld 3% van het beeld) scoren o3 54,8 en Gemini 2.5 Pro 54,1 [16]. Onze keurmerken beslaan ongeveer 0,016% van het beeld, zo'n 190 keer kleiner (berekening).
- **Er is geen enkele test op verpakkingen of drukwerk gevonden.**
- **Taalmodellen zijn zwak in het herkennen van eenvoudige symbolen** [18]. *Medium; gemeten op handschrift en formules.*

> [!note]
> **Betekenis (INFERENCE).** Vast tegelen lost het resolutieprobleem goedkoper en voorspelbaarder op dan laten inzoomen. Inzoomen voegt een foutbron toe: een verkeerd gekozen vakje.

## 3. Detectoren die je met een naam of voorbeeldplaatje aanstuurt

- **Op de enige logo-test scoren deze detectoren slecht** [19][20]. *Gecontroleerd met een tweede bron.*
  - Grounding DINO 10,3 en OmDet 6,1.
  - Open taalmodellen doen het beter: Qwen2.5-VL-7B 35,8 en VLM-R1 (3B) 34,6.
  - Bij de kleurtaak, die volgens de auteurs vooral uit kleine objecten bestaat, draait het om: OmDet 22,9 tegen VLM-R1 4,5. De auteurs adviseren een combinatie: een detector voor ruime vangst, een taalmodel voor de kennis [19].
- **OWLv2** valt onder Apache-2.0 en kan zoeken met een referentieplaatje [21][22].
  - De invoer is 960 × 960 px, dus tegelen is nodig.
  - De snelheid op een gewone processor is alleen anekdotisch bekend; dat moeten we zelf meten.
- **YOLOE** (2025) werkt met een voorbeeld uit een ander beeld, met 27–73 beelden per seconde op een T4-GPU [23].
  - De licentie is AGPL-3.0 [23]. Bied je het als dienst aan, dan moet je eigen code openbaar. Ultralytics verkoopt daarnaast een commerciële licentie [70].
- **SAM 3** werkt met voorbeeldvakjes, vraagt een GPU en heeft een eigen licentie [24].
- **T-Rex2** is alleen bereikbaar via een gehoste API, en valt dus af [25].
- **Elders presteren deze detectoren ook zwak.**
  - Op luchtfoto's haalt de beste (OWLv2) 27,6% [26].
  - Vast tegelen kan de resultaten op kleine objecten soms verslechteren [27]. *Laag; anekdote.*
- **OWLv2 en YOLOE zijn op logo's niet gemeten.**

> [!note]
> **Betekenis (INFERENCE).** Deze detectoren herkennen niet zelf; ze kunnen hooguit voorstellen, met veel valse vakjes.

## 4. Vergelijken met referentieplaatjes en "voorstellen → beoordelen"

- **Beeldvergelijking zonder training** (ILIAS, algemene objecten, bij 5 miljoen afleidende beelden) [28]: DINOv3-L 31,1, SigLIP2-L 25,3, DINOv2-L 18,5, CLIP-L 12,1.
  - Met een klein aangeleerd laagje stijgt SigLIP2 naar 37,3.
  - Een tweede stap die details vergelijkt levert nog 7 punten op (gemeten bij 100 miljoen afleidende beelden).
- **De enige logo-meting komt van Open Food Facts**, op foto's [29]. *Medium.*
  - CLIP ViT-L/14 vindt 0,94 van de al uitgeknipte logo's, tegen 0,78 voor EfficientNet-b0.
  - Over valse meldingen staan er geen cijfers bij.
- **Detailvergelijking.** LightGlue met ALIKED of DISK (Apache/BSD) haalt ongeveer 20 beelden per seconde op een desktopprocessor [30].
- **Het dichtstbijzijnde voorbeeld** is een pijplijn voor symbolen in technische tekeningen [31]. *Laag-medium.*
  - De stappen: sjabloon op meerdere schalen, dan beeldvergelijking, dan vormfilters, en tot slot een klein taalmodel voor twijfelgevallen.
  - Er staan geen cijfers bij.
- **Taalmodellen die bijna-identieke beeldparen vergelijken** [32]. *Eén bron.*
  - Totaal: mens 95,5%, GPT-5-thinking 77,8%, Gemini 2.5 Pro 68,2%, Claude Sonnet 4 62,6%.
  - Twee losse beelden sturen werkt beter dan ze samen te voegen.
  - Letterverschillen zitten niet in de test.
- **Red Sift** gebruikt in de praktijk een detector plus een taalmodel dat met het referentielogo vergelijkt. GPT-4o deed het best; de grootte van de testset en het aantal valse meldingen staan er niet bij [33].
- **Ten onrechte "ja" zeggen.**
  - Bij plaatsherkenning zeiden GPT-4.1 en Gemini op de ene dataset in ongeveer 28% van de gevallen ten onrechte "ja", en over alle datasets in 12% tot 65% [35].
  - Een andere benchmark vond juist dat deze modelfamilies vaker ten onrechte "nee" zeggen [69].
  - Op logo's meet geen enkele bron dit (ronde 3).
- **Licenties.** DINOv3 heeft een eigen Meta-licentie; DINOv2 valt onder Apache-2.0 [34].

> [!warning]
> **Betekenis (INFERENCE).** "Voorstellen → beoordelen" komt in meerdere bronnen terug. De onzekerste schakel is het beoordelen bij kleine verschillen. Daarom adviseert dit rapport het taalmodel alleen voor twijfelgevallen.

## 5. Werken vanuit het etiketbestand zelf: vectortekeningen, tekst en codes

- **De Nutri-Score is officieel een vectortekening**, opgebouwd uit lijnen en vlakken in plaats van pixels. Het charter (maart 2024) schrijft voor die tekening uit de officiële bestanden te kopiëren en te plakken [36].
  - Er zijn zes vaste kleuren [36]. Welke kleur bij welke letter hoort, is afgeleid uit de tabelindeling (*medium*).
  - Er bestaan ook een zwart-wit- en een lijnversie, dus de letter is niet alleen op kleur te lezen [36].
  - Tot maart 2027 kunnen oude en nieuwe logo's naast elkaar voorkomen [37]. *Medium.*
- **Alleen ingesloten afbeeldingen ophalen mist vectortekeningen** [38]. Het object moet worden omgezet naar een plaatje en dan vergeleken.
- **Een keurmerk kan op drie manieren in een etiketbestand staan:** als losse lijnen, als ingesloten PDF-object, of als afbeelding (INFERENCE; uit een forum) [39].
- **Illustrator-bestanden** (`.ai`) zijn buiten Illustrator alleen leesbaar als ze "PDF-compatibel" zijn opgeslagen [40].
- **Verplichte codes op het etiket.**
  - FSC: een licentiecode is verplicht bij elk gebruik van het FSC-merk; één keer per product is genoeg [41]. Welke versie van de standaard nu geldt, is onduidelijk [42].
  - MSC: elk product met het MSC-label draagt een code `MSC-C-xxxxx`. Die mag overal staan, maar moet leesbaar zijn [43].
  - EU-biologisch: de code van het controleorgaan is verplicht, bijvoorbeeld `NL-BIO-01`. De plaats van landbouw moet bij het logo staan [44][45].
  - Een code bewijst dat het keurmerk geclaimd wordt, niet wáár het logo staat.
- **Groene Punt is geen recyclesymbool.** Hij betekent dat de producent deelneemt aan een inzamelsysteem; de Möbius-lus betekent recyclebaar [64].
- **Licenties.** PyMuPDF valt onder AGPL of een commerciële licentie [38]; pikepdf valt onder MPL-2.0 [46].
- **Een bestaand voorbeeld** haalt logo's uit PDF's en vergelijkt ze met CLIP [47]. Er staan geen cijfers specifiek voor logo's bij.
- **Tekstherkenning op verpakkingsfoto's** is zwak bij kleine of gebogen tekst [48][49].
  - INFERENCE: staan de codes als echte tekst in het etiketbestand, dan is tekstherkenning niet nodig.
- **Niet gevonden:**
  - hoe vaak keurmerken in verpakkingsartwork als vectortekening staan;
  - de regels voor Rainforest Alliance, V-label, Vegan Society, Beter Leven, Weidemelk en het zwangerschapspictogram.

> [!note]
> **Betekenis (INFERENCE).** Werken vanuit het etiketbestand kan voor een deel van de keurmerken het pixelprobleem omzeilen. Of dat werkt, hangt af van één vraag die geen bron beantwoordt: hoeveel van onze etiketbestanden zijn een PDF- of Illustrator-bestand met echte tekst en vectortekeningen?

## 6. Praktijk, kosten en privacy

- **Kosten per etiket** bij 20 uitsneden van ongeveer 1000 px, alleen de beeldinvoer [50][51][52] (*medium; berekend*):

  | Model | Per etiket |
  |---|---|
  | Claude Opus 5.5 | ±$0,10 |
  | Claude Sonnet 5.5 | ±$0,05 |
  | Claude Haiku 5.5 | ±$0,003 |
  | gpt-5.5 | ±$0,12 |
  | Gemini 4 Argon | ±$0,045 (verdubbelt vanaf 1 december 2026) |
  | Gemini 3 Flash | ±$0,011 |

  De uitvoer kan bij de topmodellen evenveel kosten als de invoer. Batchverwerking halveert alles [53].
- **Privacy en bewaring.**
  - Geen van de drie aanbieders traint standaard op betaalde API-data [9][10][11].
  - OpenAI en Anthropic bieden nul-bewaring alleen na een afspraak met hun sales. Batch- en bestandsaanroepen vallen daarbuiten; batchgegevens blijven 29 dagen staan [9][10][53].
  - Bij Google blijft alleen betaald gebruik buiten de training [11].
  - Via Vertex AI kan Google nul-bewaring geven, als je zelf instellingen aanpast (geen tijdelijke opslag, geen logging, en geen koppeling met Google Search of Maps). Logging voor misbruikcontrole is geen instelling die je zelf uitzet [68].
- **Praktijk in de verpakkingswereld.**
  - SGS&CO trainde een detector op 432 artworkbeelden, met 0,578 over acht brede categorieën. Benoemen zonder training door GPT-4o was zwak, maar gemeten als tekstoverlap, wat zwak bewijs is [54].
  - Open Food Facts gebruikt een getrainde detector (merk of keurmerk) en beeldvergelijking. In 2023 deelden mensen de keurmerken nog in [57][58]. Hun Nutri-Score-detector valt onder AGPL en heeft geen gepubliceerde cijfers [59].
  - NutriGreen is een gratis set van 10.472 foto's met Nutri-Score A–E, V-label en EU-biologisch (CC BY-SA 4.0) [60]. Getrainde detectoren halen er 94%; de verwarring tussen A, B en C wordt niet gerapporteerd [61].
- **Elders.**
  - Of een groot merklogo op een advertentie staat, halen taalmodellen zonder training voor 96–99,6%. De positie van het logo is veel zwakker [55].
  - Stemmen over meerdere runs is alleen op open modellen onderzocht [56].
  - Esko, een betaald pakket, beweert dat algemene AI faalt op verpakkingen, zonder cijfers [62].
- **Bewijslast.**
  - Zonder één fout in n gevallen ligt de bovengrens van het foutpercentage rond 3/n [63].
  - Voor "minder dan 10% vals" heb je per keurmerk dus minstens 30 negatieve voorbeelden zonder één fout nodig: etiketten waarvan een mens heeft bevestigd dat het keurmerk er níet op staat. Met een enkele fout worden het er 50 tot 100 (INFERENCE).
  - Met minder dan 16 positieve voorbeelden per keurmerk is "80% gevonden" niet te bewijzen; met 16 alleen als ze allemaal gevonden worden (berekening).

> [!note]
> **Betekenis (INFERENCE).** Een taalmodel per uitsnede is betaalbaar. Het echte werk zit in de toetsset die de betrouwbaarheid moet bewijzen, niet in de rekenkosten.

## 7. Getrainde detectoren (aanvullend onderzoek)

**Licenties.** Gecontroleerd in de licentiebestanden van de officiële projecten:

| Detector | Licentie | Commercieel vrij? |
|---|---|---|
| RF-DETR Nano, Small, Medium, Large | Apache-2.0, inclusief modellen [72] | ja |
| D-FINE | Apache-2.0 [73] | ja |
| RT-DETR | Apache-2.0 [74] | ja |
| SAHI (tegelen) | MIT [76] | ja |
| Ultralytics YOLOv8, YOLO11, YOLO26 | AGPL-3.0, inclusief modellen [71] | nee; alleen met een betaalde Enterprise-licentie [70] |
| DEIMv2 | sinds 24-08-2026 alleen niet-commercieel [75] | nee |
| Kleinste en grootste RF-DETR-maten | platformlicentie van Roboflow [72] | nee |

**Getraind tegenover taalmodel** (100 praktijkdatasets, op een schaal van 0–100) [66]. *Eén bron; Roboflow is ook maker van RF-DETR.*

| Aanpak | Score |
|---|---|
| Volledig getrainde detector (YOLOv8n/YOLO11) | 55–57 |
| RF-DETR-S / D-FINE-S, volledig getraind | 60,2 / 60,3 [72] |
| 10 voorbeelden per soort: Grounding DINO bijgetraind | 33,6 |
| 10 voorbeelden per soort: YOLOv8 | 20–24 |
| Gemini 2.5 Pro, alleen vraag of met voorbeelden | 8,8–11,6 |
| Qwen2.5-VL-72B | 5,6–7,6 |

- De onderzoekers concluderen dat bijtrainen het wint van alleen een goede vraag stellen, zeker voor zeldzame soorten [66].
- **Logo's vinden lukt goed na training.** YOLOv8s getraind op 1.500 voedsellogo's haalde 90% precisie en 88% vangst [86]. Alle logo's waren daar één soort ("logo"), dus het zegt niets over welk keurmerk het is. Dat komt neer op ongeveer 66 beelden per logo (berekening).
- **Kleine objecten met tegels.** Tegelen tijdens het herkennen levert 5–7 punten op. Ook trainen op tegels levert 13–15 punten op [76]. *Gemeten op luchtfoto's.*
  - Er zit een prijs aan: in een voorbeeld steeg de vangst van 0,20 naar 0,45, maar daalde de precisie van 0,89 naar 0,80 en duurde het 30 keer langer [77]. *Niet bijgetraind model.*
- **Snelheid zonder GPU.** YOLO26n doet ongeveer 39 ms en YOLO26s ongeveer 87 ms per beeld van 640 px, op een niet nader genoemde processor [78]. RF-DETR Small doet ongeveer 360 ms op een gedeelde virtuele processor [79]. *Medium; zelf meten.*
- **Trainingskosten.** Ongeveer 1.500 beelden trainen kost 10 tot 25 minuten op één gehuurde GPU (schatting van de maker) [80].

**Trainingsdata maken uit de officiële logobestanden**
- **Logo's uit een merkendatabase**, nagemaakt op willekeurige achtergronden, zonder één echt beeld: 48,6 punten. Met 40 echte beelden per logo: 60,3. Met beide: 74,7 [81]. *Gemeten op foto's.*
  - De verschillen per logo waren groot: 90,1 (Starbucks) tegen 19,2 (Pepsi). Kleine logo's waren zwak.
- **Officiële verkeersbordsjablonen op gewone foto's:** 95,66 punten, ongeveer 3,4 onder training met echte beelden [82].
  - Dat geldt wel voor alle borden als één soort.
  - De helft van de valse meldingen kwam van objecten die erop lijken, zoals spiegels en andere borden. Die kwamen in de achtergronden niet voor.
- **Eerst met nagemaakte beelden trainen, daarna bijtrainen met 2,5–10% echte**, werkte beter dan alles door elkaar [83]. *3D-objecten, niet vlak drukwerk.*
- **Knippen en plakken op willekeurige achtergronden is genoeg realisme.** De detector leert de plakranden te negeren. Nagemaakt plus 10% echt deed het in één test beter dan alleen echte beelden [90]. *Medium; verouderd.*
- **De maker van YOLO adviseert** om elk exemplaar in elk beeld te labelen ("half labelen werkt niet"), om 0–10% beelden zonder object mee te nemen tegen valse meldingen, en om een hogere resolutie te gebruiken voor kleine objecten [84].
  - Hun vuistregel van 1.500 beelden per soort is een richtlijn, geen meting.
- **Licentie van de hulpbibliotheek.** Albumentations valt tot versie 2.0.8 onder MIT. De opvolger valt onder AGPL of een commerciële licentie [85].
- **Grootste risico (INFERENCE):** echte etiketten die als achtergrond dienen, bevatten zelf al keurmerken die niet gelabeld zijn. De detector leert dan dat een echt keurmerk achtergrond is. Die achtergronden moeten eerst worden gescreend.

**Labelwerk verminderen**
- **Automatisch labelen** met een detector die je met een naam aanstuurt, kost bijna niets. Het levert wel 3,5 tot 16 punten minder op dan labels van mensen, en zeldzame soorten vallen bijna weg [87].
- **Slim kiezen welke voorbeelden een mens labelt** (actief leren) haalt hetzelfde resultaat met tot 82% minder labelwerk [88]. *Medium.*
- **Een getrainde detector die voorstelt, met een taalmodel dat beoordeelt.** Bij poliepen steeg de vangst daarmee 13–24 punten, terwijl de precisie tussen −3,6 en +1,7 bewoog [89]. Dat was gericht op meer vangst, niet op minder valse meldingen.
- **Benchmarks gebruiken meestal 40–70 trainingsbeelden per logo-soort.** Dat is een keuze bij het ontwerp, geen getest minimum [89].

> [!note]
> **Betekenis (INFERENCE).** Getrainde detectoren met een vrije licentie bestaan en zijn snel te trainen. Het knelpunt is niet de techniek maar de gelabelde voorbeelden per keurmerk. Nagemaakte beelden uit de officiële logobestanden, plus een kleine set echte voorbeelden die een mens corrigeert, is de route die in de bronnen het meest belooft. Per keurmerk is dat nergens gemeten.

## 8. Wat alleen de combinatie laat zien

1. **Wie het werkend kreeg, heeft getraind** [54][57][61][66]. Een taalmodel is als beoordelaar bruikbaar, niet als zoeker [8][65].
2. **Het etiketbestand en vaste regels verslaan kijken bij verwarbare keurmerken.** Dat geldt voor de verplichte codes [41][43][44] en de Nutri-Score-letter [36]. Taalmodellen zijn zwak in kleine beeldverschillen [32].
3. **Zonder training blijft de bewijslast even groot.** Elke route heeft een door een mens bevestigde toetsset nodig [63]. Training voegt daar een trainingsset aan toe; nagemaakte beelden en actief leren maken die kleiner [81][88].
4. **Licenties vallen opvallend vaak op AGPL** [23][38][59][71][85]. Er zijn voor elk onderdeel vrije alternatieven: RF-DETR en D-FINE [72][73], SAHI [76], OWLv2 [22], LightGlue [30], DINOv2 [34] en pikepdf [46].

## 9. Afweging tussen de routes

**Route A (eerst het etiketbestand) is geen alternatief maar een aanvulling.** Hij werkt alleen waar het etiketbestand vectortekeningen of tekst bevat, en hoort in elke combinatie. Hieronder worden de routes vergeleken die met het beeld werken:

- **B: voorsteller zonder training, plus een taalmodel als beoordelaar.** De voorsteller is een sjabloon, een beeldvergelijking of OWLv2.
- **C: het taalmodel zoekt zelf op tegels.** Dit is de vorm van de huidige route.
- **D: getrainde detector**, met een taalmodel als beoordelaar van twijfelgevallen.

| Criterium (gewicht) | B — zonder training | C — model zoekt zelf | D — getrainde detector |
|---|---|---|---|
| Weinig valse meldingen (35%) | 3 — beoordelen helpt [8][65], maar ten onrechte "ja" in 12–65% bij een verwante taak [35] | 2 — zelf aanwijzen is de zwakste rol [8][12] | 4 — getraind wint overal ruim [66]; meldingen door objecten die erop lijken, zijn met negatieve voorbeelden te beperken [82][84] |
| Kleine keurmerken vinden (25%) | 4 — voorsteller ruim af te stellen [31] (INFERENCE) | 3 — kleiner doel, slechter resultaat [6][66] | 4 — tegels plus trainen op tegels [76] |
| Snel tot een proef (20%) | 3,5 — meer onderdelen | 5 — bestaat al | 3 — labelwerk en nagemaakte beelden nodig; trainen zelf duurt minuten [80] |
| Kosten en snelheid (10%) | 3 — één taalmodelvraag per kandidaat [50][51][52] | 3,5 | 4,5 — draait op de eigen processor [78]; een taalmodel alleen bij twijfel |
| Verwarbare keurmerken (10%) | 3 — taalmodel zwak op kleine verschillen [32] | 2 | 3,5 — leert de verschillen uit voorbeelden [61] |
| **Gewogen totaal** | **3,4** | **3,0** | **3,8** |

> [!warning]
> De scores zijn een afweging, geen meting. De gewichten zijn een voorstel van de onderzoeker. Elke cel heeft zijn onderbouwing erbij, zodat je ze kunt herwegen.

- **Keuze:** D, met A erbij, en een taalmodel alleen voor twijfelgevallen.
- **Tweede keus:** B met A. Die wint als er niet genoeg gelabelde voorbeelden per keurmerk te maken zijn.
- **Sterkste argumenten tegen de keuze:**
  - Er is geen enkele meting per keurmerk.
  - Onze eigen eerdere getrainde detector haalde maar 0,27 vangst met 22 etiketbestanden (projectgeheugen; niet opnieuw gecontroleerd).
  - Alleen nagemaakte beelden bleef bij logo's ruim onder de combinatie met echte [81].
  - De maker van YOLO adviseert 1.500 beelden per soort [84], ver boven wat we nu hebben.
- **Omkeerbaarheid:** de proef heeft een harde stopregel per keurmerk. Alle onderdelen vallen onder een vrije licentie en zijn los te vervangen.

**Is dit significant beter dan onze huidige route?**
- *Op algemene tests: ja, met ruime marge.* Een getrainde detector haalt 55–60 punten tegenover 9–12 voor een taalmodel dat zelf zoekt [66].
- *Op onze keurmerken: onbekend.* Geen bron meet het, en onze huidige route vindt al veel (onze eerdere eigen vergelijking: 144 van 158).
- De proef in §10 beantwoordt dit op dezelfde toetsset.

## 10. Aanbevelingen en proefplan

> [!important]
> **Vooraf vastleggen:** wat betekent "minder dan 10% vals"? Het kan gaan om meldingen op etiketten zonder het keurmerk, of om het aandeel foute meldingen onder alle meldingen. Elke definitie vraagt een andere telling (INFERENCE). Leg dit vast vóór de proef begint.

1. **Kies route D met A als nieuwe opzet.** Een getrainde detector met vrije licentie zoekt. Codes en vaste regels uit het etiketbestand helpen mee. Een taalmodel beoordeelt alleen de twijfelgevallen.
   - *Zekerheid:* medium. Getraind tegenover taalmodel rust op één grote benchmark [66] en op praktijkvoorbeelden [54][57][61]. Per keurmerk is niets gemeten.
   - *Bestemming:* architectuurbesluit en een nieuwe spec via BMAD.
2. **Bouw eerst de toetsset, los van de trainingsset.** Per keurmerk minstens 16 door een mens bevestigde etiketten mét het keurmerk, en 30–50 zonder, inclusief de verwarbare keurmerken [63].
   - Producten en bronfamilies moeten gescheiden blijven tussen training en toets.
   - *Zekerheid:* hoog; dit is statistiek.
   - *Bestemming:* de meetset van de proef.
3. **Maak de trainingsset half automatisch.**
   - Officiële logobestanden, in alle varianten (kleur, zwart-wit, lijn), op gescreende echte etiketachtergronden [81][82].
   - Daarnaast echte productie-etiketten, voorgelabeld door de huidige route of een taalmodel en gecorrigeerd door een mens. Kies slim welke het eerst gelabeld worden [87][88].
   - Neem etiketten zonder keurmerk en keurmerken die erop lijken mee als negatieve voorbeelden [84].
   - *Zekerheid:* medium; gemeten op foto's, niet op drukwerk.
   - *Bestemming:* spec van de proef.
4. **Lees de Nutri-Score-letter met een vaste regel** volgens het charter [36]. Gebruik de verplichte codes als tweede signaal voor FSC, MSC en EU-biologisch [41][43][44].
   - *Zekerheid:* medium; hangt af van de meting aan de etiketbestanden.
   - *Bestemming:* spec, route A.
5. **Gebruik alleen onderdelen met een vrije licentie:** RF-DETR of D-FINE [72][73], SAHI [76], DINOv2 [34] en pikepdf [46].
   - Ultralytics-YOLO, YOLOE, PyMuPDF, DINOv3 en de nieuwe Albumentations alleen na een bewuste licentiekeuze [23][34][38][71][85].
   - *Zekerheid:* hoog; licentiebestanden zijn op 31-10-2026 gelezen.
   - *Bestemming:* architectuur.
6. **Stuur klantartwork alleen naar diensten die niets bewaren:** Vertex AI met de juiste instellingen [68], of een nul-bewaringsafspraak met OpenAI of Anthropic [9][10]. Gebruik daarvoor geen batchverwerking [9][10].
   - *Zekerheid:* hoog.
   - *Bestemming:* architectuur en privacy.

**Proef van twee à drie weken** (het labelwerk bepaalt de duur)

| Dagen | Stap | Uitkomst |
|---|---|---|
| 1–2 | Etiketbestanden meten: welk formaat, is er een tekstlaag, staan de codes erin als tekst, hoe staan de keurmerken erin? | Besluit of route A doorgaat, per keurmerk |
| 1–5 | Toetsset aanvullen met productievoorbeelden; een mens bevestigt | Een set die de eisen echt kan bewijzen |
| 2–7 | Trainingsset maken: nagemaakte beelden uit de officiële logobestanden, plus voorgelabelde en gecorrigeerde echte etiketten | Trainingsset per keurmerk |
| 6–9 | RF-DETR of D-FINE trainen op tegels (gehuurde GPU), eerst op de nagemaakte beelden, daarna bijtrainen op echte | Model |
| 8–11 | Herkenning op de eigen server met tegels; twijfelgevallen naar een taalmodel als beoordelaar, met het referentieplaatje erbij | Uitkomst per keurmerk, kosten en tijd |
| 10–12 | Meten op dezelfde toetsset, naast de huidige route en naast onze eerdere eigen vergelijking van oktober | Per keurmerk: automatisch, door een mens bevestigen, of afvallen |

**Stopregel.** Een keurmerk gaat alleen naar "automatisch" als het ook in het ongunstigste geval in minstens 80% van de gevallen gevonden wordt (de statistische ondergrens), én het aandeel valse meldingen ook in het ongunstigste geval (de bovengrens) onder 10% blijft. Haalt een keurmerk dat niet, dan wordt het een voorstel dat een mens bevestigt.

## 11. Open vragen

1. **Hoeveel echte gelabelde voorbeelden per keurmerk** zijn nodig naast de nagemaakte beelden? Dat is nergens gemeten [81][83][84], en blijkt uit de proef.
2. **Welk deel van onze etiketbestanden bevat vectortekeningen, ingesloten logo's of een tekstlaag met codes?** Zie de proef, dagen 1–2.
   - *Deels beantwoord op 31-10-2026 door een eigen meting op de 173 etiketten van de meetset (geen bron uit dit onderzoek): [meting-etiketbestanden-2026-10-31.md](meting-etiketbestanden-2026-10-31.md).* De helft heeft een PDF als origineel. Verplichte codes geven nul valse treffers, maar dekken maar 17–33% van de etiketten met FSC, MSC of EU-biologisch. Route A blijft daarmee een aanvulling.
3. **Hoe vaak zegt een taalmodel als beoordelaar ten onrechte "ja" op twijfelgevallen?** Alleen op onze eigen negatieve voorbeelden te meten.
4. **Hoe snel draaien RF-DETR en D-FINE op onze eigen server**, bij 640 en 1280 px? De bronnen geven alleen schattingen [78][79].
5. **De overige keurmerken:** welke code- of tekstregels gelden voor Rainforest Alliance, V-label, Vegan Society, Beter Leven, Weidemelk en het zwangerschapspictogram? Niet onderzocht.

## 12. Houdbaarheid van de beweringen

| Bewering | Soort (termijn) | Houdbaar tot | Nu al verouderd? |
|---|---|---|---|
| Beeldgrenzen Claude, OpenAI, Gemini [2][3][4] | versie (1 mnd) | 2026-11-01 | nee |
| Prijzen en batchkorting [50][51][52] | prijs (3 mnd) | 2027-01-01 | nee |
| Roboflow-detectiescores [5] | AI-benchmark (3 mnd) | 2027-01-01 | nee |
| Nul-bewaring OpenAI, Anthropic, Vertex [9][10][68] | leveranciersdocument (3 mnd) | 2027-01-01 | nee |
| Licenties van detectoren en hulpmiddelen [22][23][34][38][71]–[75][85] | licentie (6 mnd) | 2027-04-01 | nee |
| Benchmarks over werkwijzen [8][19][28][32][65][66] | AI-benchmark (3 mnd) | 2025-07 tot 2026-10 | **ja** |
| Synthetische trainingsdata [81][82] | werkwijze (24 mnd) | 2021 | **ja** |
| Open Food Facts deelt nog met de hand in [58] | praktijk (24 mnd) | 2025-02-01 | **ja** |
| Nutri-Score charter [36] en FSC-standaard [42] | standaard (12 mnd) | 2025-03-01 / 2022-01-01 | **ja** |

> [!warning]
> **Vroegste controlemoment: 1 november 2026**, voor de beeldgrenzen per model. De verouderd gemarkeerde benchmarks dienen als bewijs voor een *werkwijze*, niet als actuele modelscore.

## Bronnen

| # | Ondersteunt | Uitgever | Publicatie | Geraadpleegd | Zekerheid |
|---|---|---|---|---|---|
| [1] | Gemini objectdetectie, `box_2d` 0–1000 | [Google AI for Developers](https://ai.google.dev/gemini-api/docs/image-understanding) | 2026-09-23 | 2026-10-31 | hoog |
| [2] | Gemini tokens per beeld (max ±1.120 bij "high") | [Google AI for Developers](https://ai.google.dev/gemini-api/docs/media-resolution) | 2026-10-13 | 2026-10-31 | hoog (betwist: "max", niet "ongeacht grootte") |
| [3] | Claude beeldgrenzen, waarschuwing <200 px, coördinaten benaderend | [Anthropic](https://platform.claude.com/docs/en/build-with-claude/vision) | 2026-10 | 2026-10-31 | hoog |
| [4] | OpenAI beeldgrenzen (30.000 patches), lokalisatie benaderend | [OpenAI](https://developers.openai.com/api/docs/guides/images-vision) | 2026-10 | 2026-10-31 | hoog |
| [5] | Roboflow Vision Evals detectiescores | [Roboflow (taakpagina objectdetectie)](https://playground.roboflow.com/evals/object-detection) | 2026-10-26 | 2026-10-31 | medium |
| [6] | Kleiner doel → slechter; ViCrop | [Zhang et al., ICLR 2025](https://arxiv.org/abs/2502.17422) | 2025-02 | 2026-10-31 | medium |
| [7] | Voorbeeldplaatjes in de vraag (microscopie) | [Ganguly et al., arXiv 2511.05565](https://arxiv.org/html/2511.05565) | 2025-11-04 | 2026-10-31 | hoog |
| [8] | GPT-5 waar/niet-waar per vakje 79,3 vs zelf aanwijzen 11,7 | [Liu & Hu, arXiv 2509.09958](https://arxiv.org/html/2509.09958) | 2025-11-13 | 2026-10-31 | hoog (enkele bron) |
| [9] | OpenAI databewaring en nul-bewaring | [OpenAI](https://developers.openai.com/api/docs/guides/your-data) | 2026-10 | 2026-10-31 | hoog |
| [10] | Anthropic databewaring en nul-bewaring | [Anthropic](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) | 2026-10 | 2026-10-31 | hoog |
| [11] | Gemini API-voorwaarden betaald vs gratis | [Google](https://ai.google.dev/gemini-api/terms) | 2026-04-28 | 2026-10-31 | hoog |
| [12] | LLM-detectie vs getrainde YOLO (COCO) | [arXiv 2510.11302](https://arxiv.org/html/2510.11302v2) | 2025-10 | 2026-10-31 | laag-medium |
| [13] | ZoomEye: open modellen, ja/nee-kansen nodig | [Shen et al., arXiv 2411.16044](https://arxiv.org/html/2411.16044v4) | 2025-09-01 | 2026-10-31 | hoog (methode), medium (cijfers) |
| [14] | Zoom-Refine: twee aanroepen, +4–5 punten | [arXiv 2506.01663](https://arxiv.org/html/2506.01663v2) | 2025-08-11 | 2026-10-31 | hoog (methode), medium (cijfers) |
| [15] | Gemini 3 Flash Agentic Vision, 5–10% claim | [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/agentic-vision-gemini-3-flash/) | 2026-01-27 | 2026-10-31 | medium (leveranciersclaim) |
| [16] | TreeBench: o3 54,8, Gemini 2.5 Pro 54,1 | [arXiv 2507.07999](https://arxiv.org/html/2507.07999v2) | 2026-03-05 | 2026-10-31 | hoog (geverifieerd) |
| [17] | RAP: alleen open modellen | [ICML 2025, arXiv 2503.01222](https://arxiv.org/html/2503.01222v1) | 2025-03 | 2026-10-31 | medium |
| [18] | Zwak op elementaire symboolherkenning | [arXiv 2603.18472](https://arxiv.org/abs/2603.18472) | 2026-03-19 | 2026-10-31 | medium |
| [19] | OVDEval logo-scores en advies voor hybride | [VLM-R1, arXiv 2504.07615](https://arxiv.org/abs/2504.07615) | 2025-04-14 | 2026-10-31 | hoog (geverifieerd) |
| [20] | OVDEval-benchmark (tweede bron logo-scores) | [Yao et al., AAAI 2024](https://arxiv.org/abs/2308.13177) | 2023-12-18 | 2026-10-31 | hoog |
| [21] | OWLv2 zoeken met referentieplaatje, 960 px | [Hugging Face docs](https://huggingface.co/docs/transformers/model_doc/owlv2) | actueel | 2026-10-31 | hoog |
| [22] | OWLv2-licentie Apache-2.0 | [Hugging Face model card](https://huggingface.co/google/owlv2-base-patch16-ensemble) | actueel | 2026-10-31 | hoog |
| [23] | YOLOE: voorbeeldplaatje, snelheid, AGPL-3.0 | [THU-MIG GitHub](https://github.com/THU-MIG/yoloe) | actueel | 2026-10-31 | hoog |
| [24] | SAM 3: GPU, eigen licentie | [Meta GitHub](https://github.com/facebookresearch/sam3) | 2026-03-27 | 2026-10-31 | hoog |
| [25] | T-Rex2 alleen via API | [IDEA Research GitHub](https://github.com/idea-research/t-rex) | onbekend | 2026-10-31 | medium |
| [26] | Zero-shot detectie op luchtfoto's: OWLv2 27,6% F1 | [arXiv 2601.22164](https://arxiv.org/pdf/2601.22164) | 2026-01 | 2026-10-31 | medium |
| [27] | SAHI verslechterde kleine objecten (anekdote) | [Ultralytics forum](https://community.ultralytics.com/t/why-is-it-that-when-i-use-sahi-with-yolov11-for-tiny-object-detection-the-results-are-actually-worse-than-just-using-yolov11-alone/1488) | onbekend | 2026-10-31 | laag |
| [28] | ILIAS: DINOv3/SigLIP2/DINOv2/CLIP, herrangschikken | [CTU Visual Recognition Group](https://vrg.fel.cvut.cz/ilias/) | 2025 | 2026-10-31 | hoog (geverifieerd) |
| [29] | Open Food Facts logo-embeddingtest | [Open Food Facts Robotoff](https://openfoodfacts.github.io/robotoff/research/logo-detection/embedding-benchmark) | ongedateerd (dataset 2022) | 2026-10-31 | medium |
| [30] | LightGlue: Apache-2.0, ALIKED/DISK, snelheid | [ETH Zürich CVG GitHub](https://github.com/cvg/LightGlue) | actueel | 2026-10-31 | hoog |
| [31] | Symboolpijplijn technische tekeningen | [Hugging Face Space](https://zestdapoet-pattern-detection-in-technical-drawings.hf.space/) | 2026 | 2026-10-31 | laag-medium |
| [32] | VLM-SubtleBench: bijna-identieke paren | [Kim, Lee, Park, arXiv 2603.07888](https://arxiv.org/html/2603.07888) | 2026-03-09 | 2026-10-31 | hoog (enkele bron) |
| [33] | Red Sift: detector + taalmodel vergelijkt met referentie | [Red Sift blog](https://redsift.com/blog/enhanced-logo-detection-with-ai-a-hybrid-approach) | 2025-02-27 (bijgewerkt 2025-04-25) | 2026-10-31 | laag-medium |
| [34] | DINOv3-licentie | [Meta](https://ai.meta.com/resources/models-and-libraries/dinov3-license) | 2025-08-14 | 2026-10-31 | medium |
| [35] | Vals accepteren door GPT-4.1/Gemini bij plaatsherkenning | [Waheed et al., arXiv 2607.12818](https://arxiv.org/html/2607.12818) | 2026-07-15 | 2026-10-31 | medium |
| [36] | Nutri-Score grafisch charter: vector, kleuren, varianten | [Santé publique France / BLV](https://www.blv.admin.ch/dam/fr/sd-web/5cQiw1IRZVDb/logo-cd-nutri-score-en.pdf) | 2024-03 | 2026-10-31 | hoog |
| [37] | Nutri-Score overgang tot maart 2027 | [Ministère de l'Économie (FR)](https://www.economie.gouv.fr/node/36736) | 2025-07-09 | 2026-10-31 | medium |
| [38] | PyMuPDF: AGPL/commercieel, `get_images` alleen raster | [Artifex GitHub](https://github.com/pymupdf/PyMuPDF) | actueel | 2026-10-31 | hoog |
| [39] | Ontwerpers plakken vector, CC-library als PDF-object | [Adobe Community](https://community.adobe.com/t5/illustrator-discussions/why-does-illustrator-outline-text-when-i-use-saved-artwork-from-my-library/m-p/14842042/highlight/true) | 2024 | 2026-10-31 | laag |
| [40] | `.ai` alleen leesbaar als PDF-compatibel | [Datalogics](https://www.datalogics.com/adobe-illustrator-and-pdf-compatibility) | ongedateerd | 2026-10-31 | medium |
| [41] | FSC-licentiecode verplicht, één keer per product | [FSC](https://fsc.org/sites/default/files/2019-08/FSC%20trademark%20requirements%20revision%20crosswalk_EN.pdf) | 2017 (vergelijking concept V2-0) | 2026-10-31 | medium |
| [42] | FSC-STD-50-001 versiestatus | [FSC open.fsc.org](https://open.fsc.org/items/a4aa4bdb-a681-46ad-8651-0f155d261557) | 2021 (V2-1) | 2026-10-31 | hoog (metadata) |
| [43] | MSC-code MSC-C-xxxxx verplicht en leesbaar | [Marine Stewardship Council](https://msc.org/get-certified/use-the-msc-ecolabel/rules) | ongedateerd | 2026-10-31 | medium |
| [44] | EU 2018/848 art. 32: code controleorgaan, plaats van landbouw | [UK National Archives (EU-tekst)](https://www.legislation.gov.uk/eur/2018/848/chapter/IV/data.html) | 2018-05-30 | 2026-10-31 | hoog |
| [45] | Codeformaat AB-CDE-999 naast EU-logo | [GS1 in Europe](https://gs1.eu/wp-content/uploads/2023/09/GS1-in-EU-Organic-Products-Guideline-v1.1.pdf) | 2023-09 | 2026-10-31 | medium |
| [46] | pikepdf MPL-2.0 | [PyPI pikepdf](https://pypi.org/project/pikepdf/6.2.4) | 2022–2023 | 2026-10-31 | medium |
| [47] | Logo's in PDF via CLIP (Oracle) | [Liu et al., arXiv 2604.23276](https://arxiv.org/html/2604.23276) | 2026-04-25 | 2026-10-31 | hoog |
| [48] | OCR op verpakkingsfoto's | [arXiv 2510.03570](https://arxiv.org/abs/2510.03570v1) | 2025-10 | 2026-10-31 | medium |
| [49] | OCR op koffieverpakking | [MDPI Sensors](https://www.mdpi.com/1424-8220/25/20/6484) | 2025 | 2026-10-31 | medium |
| [50] | Anthropic prijzen en batchkorting | [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) | 2026-10 | 2026-10-31 | hoog |
| [51] | OpenAI prijzen en batchkorting | [OpenAI](https://developers.openai.com/api/docs/pricing) | 2026-10 | 2026-10-31 | hoog |
| [52] | Gemini prijzen (Argon verdubbelt 1-12-2026) | [Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing) | 2026-10-30 | 2026-10-31 | hoog |
| [53] | Anthropic batch: <1 uur meestal, max 24 uur | [Anthropic](https://platform.claude.com/docs/en/build-with-claude/batch-processing) | 2026-10 | 2026-10-31 | hoog |
| [54] | SGS&CO: logo's in verpakkingsartwork | [SGS&CO, CS & IT 2025](https://aircconline.com/csit/papers/vol15/csit151808.pdf) | 2025 | 2026-10-31 | hoog (wat er staat) |
| [55] | Sprinklr M-PACE: logo aanwezig, positie zwak, rechter-model | [Sprinklr, arXiv 2509.15241](https://arxiv.org/html/2509.15241v1) | 2025-09-17 | 2026-10-31 | medium |
| [56] | TACO: zelfconsistentie vs zelfvertrouwen | [EACL 2026](https://aclanthology.org/2026.eacl-long.252) | 2026 | 2026-10-31 | laag-medium |
| [57] | Open Food Facts logo-pijplijn | [Open Food Facts Robotoff](https://openfoodfacts.github.io/robotoff/references/logos-ANN) | ongedateerd | 2026-10-31 | hoog |
| [58] | Open Food Facts: geen automatische indeling (2023) | [Open Food Facts blog](https://blog.openfoodfacts.org/en/news/how-open-food-facts-uses-logos-to-get-information-on-food-products) | 2023-02-14 | 2026-10-31 | hoog (stand 2023) |
| [59] | Nutri-Score-detector AGPL, geen cijfers | [Open Food Facts op Hugging Face](https://huggingface.co/openfoodfacts/nutriscore-yolo) | 2024-07 | 2026-10-31 | hoog |
| [60] | NutriGreen dataset, CC BY-SA 4.0 | [Zenodo](https://zenodo.org/records/10020545) | 2023-10-19 | 2026-10-31 | hoog |
| [61] | NutriGreen resultaten | [Frontiers in Nutrition](https://pmc.ncbi.nlm.nih.gov/articles/PMC11002244/) | 2024 | 2026-10-31 | medium |
| [62] | Esko-claim zonder cijfers | [Esko](https://www.esko.com/ai-blog/why-general-ai-fails-packaging-and-how-esko-solves-it) | 2026-02-26 | 2026-10-31 | laag (waarheid claim) |
| [63] | Regel van drie | [RTI (Jovanovic & Levy 1997)](https://rti.org/publication/look-rule-three) | 1997 | 2026-10-31 | medium |
| [64] | Groene Punt ≠ recyclebaar | [SUEZ UK](https://suez.co.uk/en/news/blog-190912-the-mythical-green-dot-of-recycling) | 2019 | 2026-10-31 | medium |
| [65] | Zonder controlestap altijd "aanwezig"; met controle F1 0,84–0,94 (alleen vraag) en 0,92–0,99 (LoRA) | [Nakamura & Hong, arXiv 2607.00357](https://arxiv.org/html/2607.00357v1) | 2026-07-01 | 2026-10-31 | hoog (open modellen) |
| [66] | RF100-VL: Gemini 2.5 Pro 11,6 mAP, Grounding DINO 15,7, YOLOv8n 55,4 | [Roboflow + CMU, arXiv 2505.20612](https://arxiv.org/html/2505.20612v3) | 2025-10-08 | 2026-10-31 | hoog |
| [67] | COCO-test Gemini 3 Pro Preview 0,407 mAP | [Simon Edwardsson (blog)](https://simedw.com/2025/07/10/gemini-bounding-boxes/) | 2025-07-10 (bijgewerkt 2025-11-19) | 2026-10-31 | medium |
| [68] | Vertex AI nul-bewaring via instellingen | [Google Cloud](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention) | 2026-10-30 | 2026-10-31 | hoog |
| [69] | Modellen neigen tot afwijzen (MMPB) | [arXiv 2509.22820, NeurIPS 2025](https://arxiv.org/html/2509.22820) | 2025-09 | 2026-10-31 | medium |
| [70] | Ultralytics commerciële licentie naast AGPL | [Ultralytics](https://www.ultralytics.com/license) | actueel | 2026-10-31 | medium |
| [71] | Ultralytics YOLO (v8/11/26) AGPL-3.0 inclusief modellen | [Ultralytics GitHub](https://github.com/ultralytics/ultralytics/blob/main/LICENSE) | 2026-10-31 | 2026-10-31 | hoog |
| [72] | RF-DETR Apache-2.0 (N/S/M/L), RF100-VL-scores | [Roboflow GitHub](https://github.com/roboflow/rf-detr) | 2026-10 | 2026-10-31 | hoog (licentie), medium (scores van de maker) |
| [73] | D-FINE Apache-2.0 | [Peterande GitHub](https://github.com/Peterande/D-FINE/blob/master/LICENSE) | 2026-10-05 | 2026-10-31 | hoog |
| [74] | RT-DETR Apache-2.0 | [lyuwenyu GitHub](https://github.com/lyuwenyu/RT-DETR/blob/main/LICENSE) | 2026-10-09 | 2026-10-31 | hoog |
| [75] | DEIMv2 alleen niet-commercieel sinds 24-08-2026 | [Intellindust GitHub](https://github.com/Intellindust-AI-Lab/DEIMv2/blob/main/LICENSE.md) | 2026-08-24 | 2026-10-31 | hoog |
| [76] | SAHI: tegelen +5–7 AP, met trainen op tegels +13–15 AP | [Akyon et al., arXiv 2202.06934](https://arxiv.org/abs/2202.06934) | 2022-10 | 2026-10-31 | hoog (bron), verouderd |
| [77] | Tegelen: meer vangst, minder precisie, 30× trager | [Voxel51](https://docs.voxel51.com/tutorials/small_object_detection.html) | ongedateerd | 2026-10-31 | medium |
| [78] | YOLO26 snelheid op processor | [Ultralytics docs](https://docs.ultralytics.com/models/yolo26/) | 2026 | 2026-10-31 | medium |
| [79] | RF-DETR Small op gedeelde processor ±360 ms | [Roboflow](https://rfdetr.roboflow.com/latest/cookbooks/export-cpu/) | 2026-10-03 | 2026-10-31 | medium |
| [80] | Trainen ±1.500 beelden in 10–25 min (schatting) | [Roboflow](https://rfdetr.roboflow.com/latest/cookbooks/fine-tune_detection/) | 2026-10-02 | 2026-10-31 | medium |
| [81] | Logo's uit merkendatabase nagemaakt: 48,6 / 60,3 / 74,7 | [RDSL, ICRA 2019](https://rdllab.github.io/assets/pdf/papers/icra19_rdsl.pdf) | 2019 | 2026-10-31 | hoog (bron), verouderd |
| [82] | Verkeersbordsjablonen op foto's: 95,66; valse meldingen door gelijkende objecten | [Tabelini Torres et al.](https://ar5iv.labs.arxiv.org/html/1907.09679) | 2019 | 2026-10-31 | hoog (bron), verouderd |
| [83] | Eerst nagemaakt, dan bijtrainen op 2,5–10% echt | [Agarwal et al., arXiv 2511.23450](https://arxiv.org/html/2511.23450) | 2025-11-28 | 2026-10-31 | medium |
| [84] | Trainingsadvies: alles labelen, 0–10% achtergrond, 1.500 per soort | [Ultralytics docs](https://docs.ultralytics.com/yolov5/tutorials/tips_for_best_training_results/) | actueel | 2026-10-31 | hoog (advies) |
| [85] | Albumentations MIT tot 2.0.8, opvolger AGPL/commercieel | [Albumentations](https://albumentations.ai/docs/license/) | 2025 | 2026-10-31 | hoog |
| [86] | YOLOv8s op 1.500 voedsellogo's: precisie 0,904, vangst 0,879 | [Hosseini et al., arXiv 2403.02336](https://arxiv.org/html/2403.02336) | 2024-03-04 | 2026-10-31 | hoog |
| [87] | Automatisch labelen: −3,5 tot −16 punten, zeldzame soorten vallen weg | [arXiv 2506.02359](https://arxiv.org/html/2506.02359v1) | 2025-06-03 | 2026-10-31 | hoog |
| [88] | Actief leren: tot 82% minder labelwerk | [Elezi et al., CVPR 2022](https://arxiv.org/abs/2106.11921) | 2021-06 | 2026-10-31 | medium |
| [89] | Detector + beoordelend taalmodel (poliepen); logo-benchmarks 40–70 per soort | [AdaptiveDetector, arXiv 2512.12492](https://arxiv.org/html/2512.12492v1); [OpenLogo, arXiv 1807.01964](https://arxiv.org/pdf/1807.01964) | 2025-12 / 2018 | 2026-10-31 | medium / laag |
| [90] | Knippen en plakken op willekeurige achtergronden werkt | [Dwibedi et al., ICCV 2017](https://arxiv.org/abs/1708.01642) | 2017 | 2026-10-31 | medium (verouderd) |
