---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'domain'
research_topic: 'Zelfverbeterende referentie-vliegwielen voor keurmerk-/logoherkenning zonder menselijke review'
research_goals: 'Input voor PRD "Referentie-vliegwiel zonder review": bewezen technieken voor (1) auto-labeling via cross-validatie met gedeclareerde metadata (GS1-declaraties als tweede bevestiging), (2) brandstof vergroten via data harvesting, weakly-supervised learning, self-training/pseudo-labeling met guardrails, (3) bootstrapping van klassen zonder voorbeelden (seed met vectorlogo, oogst echte crops), (4) kwaliteitsbewaking zonder review (gold-set gating, caps, dedup, outlier-detectie). Domeinen: CV data engines, retail product recognition, open-set logo detection, certification mark compliance.'
user_name: 'Friso'
date: '2026-07-02'
web_research_enabled: true
source_verification: true
---

# Research Report: domain

**Date:** 2026-07-02
**Author:** Friso
**Research Type:** domain

---

## Research Overview

Dit onderzoek beantwoordt de vraag welke bewezen technieken, industrie-patronen en valkuilen bestaan voor een **zelfverbeterend referentie-vliegwiel zonder menselijke review** in keurmerk-/logoherkenning op verpakkingsartwork. Aanleiding: het logoRecognition-project heeft de dubbele-bevestigingsregel (visuele match + GS1-declaratie) al live, maar de automatisch goedgekeurde crops worden nog niet doorgepromoveerd naar de referentiebibliotheek — het vliegwiel is half gesloten.

Het onderzoek bestrijkt vijf gebieden: industrie- en marktdynamiek (data-labeling, logo-detectie-AI, data-engines), concurrentielandschap en herbruikbaar ecosysteem, regulering (ECGT/GS1/AI Act), technische trends (distant supervision, self-training-guardrails, synth-to-real, dedup/outlier-detectie) en strategische aanbevelingen. Alle claims zijn geverifieerd tegen actuele publieke bronnen met confidence-markering bij onzekerheid.

**Kernconclusie:** het beoogde vliegwiel is geen experiment maar een bewezen patroon (Tesla's Data Engine, Trax/Vispera's zelfonderhoudende referentiedatabases, het weak-supervision-paradigma), met één goed gedocumenteerde faalwijze — confirmation bias — waarvoor drie concrete remedies bestaan die alle drie in het ontwerp moeten landen: strenge start-drempels, per-klasse caps + dedup, en gold-set-regressie-gating. Zie de Research Synthesis onderaan voor de volledige executive summary.

---

<!-- Content will be appended sequentially through research workflow steps -->

## Domain Research Scope Confirmation

**Research Topic:** Zelfverbeterende referentie-vliegwielen voor keurmerk-/logoherkenning zonder menselijke review
**Research Goals:** Input voor PRD "Referentie-vliegwiel zonder review": bewezen technieken voor (1) auto-labeling via cross-validatie met gedeclareerde metadata (GS1-declaraties als tweede bevestiging), (2) brandstof vergroten via data harvesting, weakly-supervised learning, self-training/pseudo-labeling met guardrails, (3) bootstrapping van klassen zonder voorbeelden (seed met vectorlogo, oogst echte crops), (4) kwaliteitsbewaking zonder review (gold-set gating, caps, dedup, outlier-detectie).

**Domain Research Scope:**

- Technologie & industrie-patronen — CV data engines, retail product recognition, open-set logo detection, certification mark compliance
- Auto-labeling zonder review — distant supervision, cross-validatie met gedeclareerde metadata
- Brandstof vergroten — harvesting, weakly-supervised learning, self-training/pseudo-labeling met guardrails
- Bootstrapping lege klassen — seed met schoon vectorlogo → oogst echte crops; region proposal + open-set matching
- Kwaliteitsbewaking zonder review — gold-set regression gating, per-klasse caps, dedup, outlier-detectie
- Regulering (GS1-standaarden, EU-keurmerkregels) waar relevant; marktomvang/supply chain bewust licht

**Research Methodology:**

- All claims verified against current public sources
- Multi-source validation for critical domain claims
- Confidence level framework for uncertain information
- Comprehensive domain coverage with industry-specific insights

**Scope Confirmed:** 2026-07-02

## Industry Analysis

### Market Size and Valuation

De markt waarin dit onderzoek zich beweegt bestaat uit drie overlappende segmenten: data-labeling/annotatie, logo-detectie-AI en het bredere image-recognition-veld.

_Total Market Size (data labeling & annotation tools): USD 3,20 mld (2025) → verwacht USD 34,38 mld (2035), CAGR 26,8%_ ([Precedence Research](https://www.precedenceresearch.com/data-labeling-and-annotation-tools-market)); een conservatievere schatting: USD 2,61 mld (2026) → USD 7,02 mld (2031), CAGR 21,9% ([Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/data-labeling-market)). ⚠️ *Confidence: gemiddeld — marktonderzoeksbureaus lopen fors uiteen in definitie en omvang; de groeirichting (20–27% CAGR) is wel consistent over alle bronnen.*

_Brand Logo Detection AI: USD 3,1 mld (2025) → verwacht USD 25,6 mld (2035), CAGR 23,5%_ ([Market.us](https://market.us/report/brand-logo-detection-ai-market/)). Solutions-segment domineert met 84,7%; Noord-Amerika grootste regio (36,2%). ⚠️ *Confidence: laag-gemiddeld — één bron, jonge marktdefinitie.*

_Economic Impact: de kernboodschap voor dit project is niet de absolute omvang maar de verhouding: handmatige labeling is nog altijd het grootste kostenblok (42,3% van de markt in 2025), terwijl self-supervised en programmatische technieken met 22,2% CAGR het snelst groeien_ ([Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/data-labeling-market)). De industrie beweegt dus precies de richting op van het beoogde vliegwiel: minder mensenogen, meer automatische bevestiging.

### Market Dynamics and Growth

_Growth Drivers:_
- Explosieve vraag naar geannoteerde data vanuit autonome systemen en enterprise-AI ([Market Research Future](https://www.marketresearchfuture.com/reports/data-annotation-and-labelling-market-31733))
- Foundation-modellen (Grounding DINO, SAM, autodistill-ecosysteem) maken zero-shot auto-labeling praktisch bruikbaar: uren in plaats van dagen annotatiewerk ([Roboflow](https://blog.roboflow.com/enhance-image-annotation-with-grounding-dino-and-sam/), [autodistill](https://github.com/autodistill/autodistill))
- Het "data flywheel"-paradigma wordt industriestandaard: productiedata → modelverbetering → betere output → waardevollere trainingsdata, als gesloten lus ([NVIDIA Glossary](https://www.nvidia.com/en-us/glossary/data-flywheel/), [Emergent Mind](https://www.emergentmind.com/topics/data-flywheel-paradigm))

_Growth Barriers:_
- Auto-labels halen (nog) niet de kwaliteit van menselijke labels: op PASCAL VOC presteren modellen getraind op autolabels vergelijkbaar met slechts een 30%-subset van menselijk gelabelde data ([arXiv 2412.10032](https://arxiv.org/pdf/2412.10032)) — auto-labeling zonder onafhankelijke verificatie is dus géén gratis lunch
- Foundation-modellen missen domeinspecifieke context (bijv. het verschil tussen een keurmerk en een decoratief pictogram) die menselijke annotators wél vangen ([Label Your Data](https://labelyourdata.com/articles/data-annotation/autodistill))

_Market Maturity: het data-flywheel-concept is conceptueel volwassen (Tesla's data engine als archetype, NVIDIA NeMo-tooling beschikbaar) maar operationeel jong — de meeste implementaties zijn LLM-gericht; computer-vision-vliegwielen met metadata-kruisvalidatie (zoals GS1-declaraties) zijn een niche waar weinig kant-en-klare oplossingen voor bestaan._ ([Arize/NVIDIA](https://arize.com/blog/building-the-data-flywheel-for-smarter-ai-systems-with-arize-ax-and-nvidia-nemo/))

### Market Structure and Segmentation

_Primary Segments:_
1. **Handmatige labeling-diensten** (krimpend aandeel, nog dominant) — Scale AI, Appen, e.d.
2. **AI-assisted/auto-labeling-platforms** (snelst groeiend) — Roboflow, Labelbox, V7, SuperAnnotate; kenmerkend: pre-labeling + human-in-the-loop review
3. **Volledig programmatische pipelines** (opkomend) — autodistill-achtige stacks, distant supervision, weak supervision (Snorkel-lijn)
4. **Verticale toepassingen** — logo-/merkdetectie (VISUA, InData Labs, Azure Brand Detection), retail product recognition, trademark-compliance ([VISUA](https://visua.com/technology/logo-detection-api), [Microsoft Azure](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/concept-brand-detection))

_Relevante structuurobservatie voor dit project: geen van de commerciële logo-detectieplatforms adverteert kruisvalidatie met gedeclareerde productdata (GDSN/GS1) als verificatiebron. De combinatie "visuele match + onafhankelijke declaratie = auto-approve" die dit project hanteert is in de markt niet als product te koop — het is een datavoordeel dat alleen partijen met toegang tot GDSN-productdata kunnen bouwen._ ⚠️ *Confidence: gemiddeld — afwezigheid van bewijs op basis van publieke productdocumentatie.*

### Industry Trends and Evolution

_Emerging Trends:_
- **Van model-centrisch naar data-centrisch:** de industrie erkent dat datacuratie — niet modelarchitectuur — de bottleneck is; programmatische, schaalbare data-workflows met continue verbetering op basis van modelfeedback zijn de norm aan het worden ([Cleanlab DCAI-gids](https://cleanlab.ai/blog/learn/guide-to-dcai/))
- **Foundation-modellen als labelaar:** grote zero-shot-modellen labelen data waarop kleine, snelle productie-modellen worden getraind (distillatie-patroon) ([autodistill](https://github.com/autodistill/autodistill), [Grounded-SAM](https://github.com/idea-research/grounded-segment-anything))
- **Flywheel-tooling wordt product:** NVIDIA NeMo + observability-platforms (Arize) leveren bouwstenen voor zelfverbeterende loops inclusief evaluatie-gating ([Arize](https://arize.com/blog/building-the-data-flywheel-for-smarter-ai-systems-with-arize-ax-and-nvidia-nemo/))

_Technology Integration: GS1 standaardiseert keurmerk-declaraties via T3777 (packagingMarkedLabelAccreditationCode, BMS ID 2312) met een gepubliceerde codelijst en per-land richtlijnen; er bestaat zelfs een officiële GS1-gids die declaraties expliciet aan logo's op de verpakking koppelt_ ([GS1 Web Vocabulary](https://ref.gs1.org/voc/PackagingMarkedLabelAccreditationCode), [GS1 Italy gids](https://gs1it.org/content/public/64/95/6495266f-e541-443f-9e6c-be473cc04544/eng_gs1_guida_marchi_e_loghi_di_certificazione_v11_2023.pdf), [GS1 Sweden T3777](https://gs1.se/en/guides/documentation/code-lists/t3777-packaging-marked-label-accreditation-code/)). De declaratie-als-waarheid-aanname staat dus op een gestandaardiseerd, breed gedragen fundament.

_Future Outlook: verwachting is dat human review verschuift van "elke sample bekijken" naar "steekproeven en poortwachters beheren" — precies het patroon dat dit PRD beoogt._

### Competitive Dynamics

_Market Concentration: gefragmenteerd; grote spelers in generieke labeling (Scale, Labelbox), niche-spelers in logo-detectie (VISUA, InData Labs), hyperscalers met commodity-API's (Azure Brand Detection — beperkt tot bekende merken, geen custom keurmerken)._

_Barriers to Entry: voor generieke logo-detectie laag (open-source: YOLO-varianten, CLIP-embeddings, vector search — zie [Analytics Vidhya open-source logo detector](https://www.analyticsvidhya.com/blog/2025/12/build-your-own-open-source-logo-detector/)); voor gevalideerde keurmerk-verificatie hoog, want die vereist (a) toegang tot productdeclaraties, (b) toegang tot etiket-artwork per GTIN, en (c) een gecureerde referentiebibliotheek — alle drie aanwezig in dit project._

_Innovation Pressure: hoog aan de model-kant (elke 6–12 maanden betere foundation-modellen), laag aan de data-kant — wie het data-vliegwiel het eerst sluit, bouwt een voorsprong die modelvernieuwing niet inhaalt (het "data moat"-argument uit de flywheel-literatuur, [Giskard](https://www.giskard.ai/glossary/data-flywheel))._

## Competitive Landscape

*Noot: "concurrenten" is hier breed opgevat — het gaat om (a) partijen die vergelijkbare problemen oplossen en (b) ecosysteem-tooling die dit project kan hergebruiken in plaats van zelf te bouwen.*

### Key Players and Market Leaders

_Market Leaders (logo-/merkdetectie): **VISUA** is de meest gespecialiseerde speler — detecteert logo's tot 0,01% van het beeldoppervlak, claimt 98,7% gemiddelde precisie en 90–99% recall (afhankelijk van use-case), en biedt expliciet "mark recognition" naast merklogo's_ ([VISUA](https://visua.com/technology/logo-detection-api)). _Hyperscalers (Google, Amazon, Microsoft) bieden commodity brand detection, maar beperkt tot vooraf bekende merken zonder custom-keurmerk-ondersteuning_ ([VISUA vergelijkingsgidsen](https://visua.com/computer-vision-api-comparison-guides)).

_Major Competitors (retail product recognition — het dichtstbijzijnde analogon): **Trax** (96% nauwkeurigheid, miljarden getrainde beelden, 55 patenten) en **Vispera** (claimt >99% SKU-herkenning "met slimme en persistente kwaliteitscontrole")_ ([Trax](https://traxretail.com/solutions/trax-image-recognition/), [Vispera](https://vispera.co/technology/)). _Relevantie: deze partijen onderhouden reusachtige referentiedatabases van verpakkingen die continu bijgewerkt worden — hun kernasset is niet het model maar de zelf-onderhoudende referentieset. Precies het vliegwiel-patroon dat dit PRD beoogt, bewezen op productieschaal in retail._ ⚠️ *Confidence: gemiddeld — accuracy-claims zijn vendor-opgaves, niet onafhankelijk geverifieerd.*

_Emerging Players (data-curatie & kwaliteitsbewaking): **Voxel51/FiftyOne** (open source; embedding-visualisatie, duplicaat-detectie, outlier-plugin met instelbaar contaminatie-percentage), **Encord** (embedding-plots, kwaliteitsmetrieken, outlier-identificatie), **Cleanlab** (label-fout-detectie), **Lightly** (data-selectie)_ ([Encord outlier-tools](https://encord.com/blog/top-tools-for-outlier-detection-in-computer-vision/), [FiftyOne outliers](https://voxel51.com/blog/finding-outliers-in-your-vision-datasets), [FiftyOne curation](https://github.com/voxel51/fiftyone-skills/blob/main/skills/fiftyone-dataset-curation/SKILL.md)).

_Global vs Regional: logo-detectie-vendors zijn globaal; niemand bedient specifiek de GDSN/keurmerk-compliance-niche in de Benelux._

### Market Share and Competitive Positioning

_Value Proposition Mapping:_
| Speler-type | Waardepropositie | Gat t.o.v. dit project |
|---|---|---|
| VISUA e.d. | Detectie-als-dienst, generieke logo-bibliotheek | Geen GS1-kruisvalidatie, geen eigen artwork-toegang, kosten per call |
| Trax/Vispera | Zelf-onderhoudende SKU-referentiedatabase + veldcamera's | Retail-schappen, niet artwork/keurmerken |
| Snorkel-lijn | Programmatische labeling via heuristieken (labeling functions) | Tekst/document-zwaartepunt; CV-automation beperkt |
| FiftyOne/Encord/Cleanlab | Datasethygiëne: dedup, outliers, label-fouten | Tooling, geen domeinoplossing — **herbruikbaar als bouwsteen** |

_Customer Segments Served: brand protection (VISUA), CPG-retail-executie (Trax/Vispera), enterprise-ML-teams (Snorkel, curatie-tools). Keurmerk-compliance voor GDSN-datapools wordt door niemand bediend._

### Competitive Strategies and Differentiation

_Differentiation Strategies: Vispera positioneert expliciet op "domain-specific adaptation" versus off-the-shelf frameworks — domeinspecialisatie verslaat generieke modellen in nauwkeurigheid en herhaalbaarheid_ ([Vispera](https://vispera.co/technology/)). _Dit valideert de projectkeuze voor een eigen referentiebibliotheek boven een generieke API._

_Innovation Approaches: Snorkel verschuift van human-in-the-loop naar **model-in-the-loop** ("10x–100x minder handmatig werk"), onder druk van foundation-modellen die zero-shot labelen_ ([Label Your Data](https://labelyourdata.com/articles/snorkel-ai-competitors), [Snorkel docs](https://docs.snorkel.ai/docs/25.4/user-guide/intro/active-learning-weak-supervision/)). _De industrie-brede beweging: de mens beheert poortwachters en steekproeven, niet individuele samples._

### Business Models and Value Propositions

_Primary Business Models: SaaS-per-API-call (VISUA, hyperscalers), enterprise-abonnement + veldservice (Trax/Vispera), platform-licenties (Snorkel, Encord), open source + betaald platform (Voxel51, Cleanlab)._

_Value Chain Integration: Trax/Vispera zijn verticaal geïntegreerd (camera → herkenning → retail-KPI) en bezitten daardoor hun data-vliegwiel volledig — hetzelfde integratievoordeel dat dit project heeft via mediaserver + catalogus + reviewstation._

### Competitive Dynamics and Entry Barriers

_Barriers to Entry: voor de keurmerk-verificatie-niche drie stapelende barrières: (1) GDSN-declaratie-toegang, (2) artwork-per-GTIN-toegang, (3) gecureerde referentiebibliotheek met echte-crop-referenties. Open-source maakt barrière (3) bouwbaar (CLIP/DINOv2-embeddings + vector search, zie [Analytics Vidhya](https://www.analyticsvidhya.com/blog/2025/12/build-your-own-open-source-logo-detector/)), maar (1) en (2) blijven exclusief._

_Switching Costs: laag voor generieke API's; hoog voor zelf-onderhoudende referentiesystemen — elke maand vliegwiel-draaien vergroot de dataset-voorsprong._

### Ecosystem and Partnership Analysis

_Technology Partnerships (herbruikbare bouwstenen voor dit PRD in plaats van zelfbouw):_
- **FiftyOne (open source)** — embedding-gebaseerde outlier-detectie en duplicaat-detectie op de referentieset; direct inzetbaar als kwartaal-audit-tool voor referentiehygiëne ([Voxel51](https://voxel51.com/blog/finding-outliers-in-your-vision-datasets))
- **Cleanlab-aanpak** — label-fout-detectie via model-confidence-analyse; het onderliggende principe (confident learning) is ook zonder de tool implementeerbaar op de eigen embeddings ([Cleanlab DCAI](https://cleanlab.ai/blog/learn/guide-to-dcai/))
- **Snorkel-patroon (concept, niet de tool)** — GS1-declaraties zijn in weak-supervision-termen een "labeling function" met hoge precisie; het combineren van meerdere zwakke signalen (declaratie + visuele match + gate-score) tot één betrouwbaar label is exact het gedocumenteerde weak-supervision-paradigma ([arXiv Hyper Label Model](https://arxiv.org/pdf/2207.13545))

_Ecosystem Control: dit project bezit alle drie de kritieke ecosysteem-posities (declaraties, artwork, referenties) — een positie die geen enkele externe vendor kan repliceren._

## Regulatory Requirements

### Applicable Regulations

**ECGT-richtlijn (Empowering Consumers for the Green Transition) — de belangrijkste regulatoire wind in de rug.** Vanaf **27 september 2026** mogen duurzaamheidslabels in de EU alleen nog gebruikt worden als ze (a) door een publieke autoriteit zijn ingesteld of (b) gebaseerd zijn op een certificeringsschema met onafhankelijke derde-partij-verificatie; zelfgemaakte of zelfgecertificeerde eco-labels zijn dan verboden, met boetes tot 4% van de jaaromzet ([Carbon Trust](https://www.carbontrust.com/news-and-insights/insights/ecgt-directive-explained-what-organisations-who-sell-in-europe-should-know-and-do), [Cooley](https://products.cooley.com/2026/03/16/empowering-consumers-for-the-green-transition-directive-check-your-sustainability-claims-and-warranty-information-for-compliance-with-new-eu-regime/), [ISCC](https://iscc-system.org/from-green-to-verified-how-the-empowering-consumers-directive-will-shape-consumer-facing-green-claims-in-the-eu/)). _Implicatie: de vraag "welke keurmerken staan er daadwerkelijk op deze verpakking, en klopt dat met wat gedeclareerd is?" wordt vanaf sept. 2026 een handhaafbare compliance-vraag — automatische keurmerk-verificatie stijgt daarmee in businesswaarde._

**Green Claims Directive: ingetrokken.** De Europese Commissie kondigde in juni 2025 de intrekking van het GCD-voorstel aan (lastendruk MKB); dit raakt de ECGT níet — die is al wet ([Sunhat](https://www.getsunhat.com/blog/green-claims-esg-data-empco-communication), [EC Green Claims](https://environment.ec.europa.eu/topics/circular-economy-topics/green-claims_en)). ⚠️ *Confidence: hoog voor de ECGT-datum, gemiddeld voor het definitieve GCD-lot (politiek beweeglijk).*

### Industry Standards and Best Practices

**GS1 T3777 / GDSN als declaratie-standaard.** De `packagingMarkedLabelAccreditationCode` (BMS ID 2312) is een gestandaardiseerd, gepubliceerd GDSN-attribuut met een beheerde codelijst; GS1 publiceert richtlijnen die declaraties expliciet koppelen aan logo's op de verpakking ([GS1 Navigator](https://navigator.gs1.org/gdsn/attribute-details?parent=PackagingMarking&name=packagingMarkedLabelAccreditationCode), [GS1 Italy-gids](https://gs1it.org/content/public/64/95/6495266f-e541-443f-9e6c-be473cc04544/eng_gs1_guida_marchi_e_loghi_di_certificazione_v11_2023.pdf)). GDSN-datapools draaien >10.000 validatiechecks, maar: **declaraties blijven zelfrapportage door leveranciers** — handmatige invoer kent foutpercentages van 5–10% ([Data Quality Navigator](https://dataqualitynavigator.com/en/resources/insights/gdsn-compliance-in-the-retail-industry/), [Commport](https://www.commport.com/gdsn-101/)). ⚠️ *Confidence: gemiddeld — de foutpercentages zijn generieke datainvoer-cijfers, niet T3777-specifiek.*

_Kritieke ontwerp-implicatie voor het vliegwiel: de declaratie is een **sterk maar feilbaar** signaal. Het dubbele-bevestigingsprincipe werkt juist dáárom: een visuele match bevestigt de declaratie én andersom — bij twijfel aan één van beide géén auto-registratie. Het vliegwiel mag de declaratie nooit als absolute waarheid behandelen, alleen als onafhankelijke tweede stem._

### Compliance Frameworks

**EU AI Act — risicoclassificatie.** Dit systeem (kwaliteitscontrole op productdata; geen besluiten over personen, geen biometrie, geen toegang tot diensten/werk/krediet) valt buiten de high-risk-categorieën van Art. 6 en is naar verwachting **minimaal/laag risico** ([AI Act Art. 6](https://artificialintelligenceact.eu/article/6/), [High-level summary](https://artificialintelligenceact.eu/high-level-summary/)). Let op de gedocumenteerde valkuil: de classificatie hangt aan het *beoogde doel*, niet aan de workflow-positie — een human-approval-stap maakt een high-risk-systeem niet laag-risico, maar omgekeerd maakt het wegnemen van review een laag-risico-systeem ook niet hoog-risico ([Opsio](https://opsiocloud.com/blogs/what-is-eu-ai-act-risk-classification/)). _"Zonder menselijke review" is hier dus regulatoir onproblematisch, mits de output productdata-kwaliteit betreft en geen consumentenbesluiten._ Er komt wel een geharmoniseerde standaard voor CV-nauwkeurigheidsevaluatie aan (JT021025) — de gold-set-meetpraktijk van dit project sluit daar naadloos op aan. ⚠️ *Confidence: gemiddeld-hoog; formele juridische toets aanbevolen zodra verdicts extern (n8n → klantprocessen) gaan sturen.*

### Data Protection and Privacy

Verpakkings-artwork bevat vrijwel geen persoonsgegevens; het AVG-risico is minimaal. Randgeval: contactgegevens van eenmanszaken op etiketten kwalificeren als persoonsgegevens — irrelevant voor keurmerk-crops (er worden alleen logo-regio's uitgesneden en bewaard). Geen bijzondere maatregelen nodig buiten bestaande opslag-governance.

### Licensing and Certification

Referentiebeelden van keurmerken (GS1 Label Guide, officiële schema-eigenaren) worden uitsluitend intern gebruikt als visuele vergelijkingsbron — geen publicatie of hergebruik als merkuiting. Dit is regulier intern gebruik; wel geldt: schema-eigenaren (EU Organic, MSC, Fairtrade) vernieuwen hun beeldmerken periodiek, dus de referentiebibliotheek heeft **versie-/vervaldatum-beheer** nodig (het EU-biologisch-logo en Beter Leven kennen gedocumenteerde stijlrevisies).

### Implementation Considerations

1. **Auditeerbaarheid als ontwerpprincipe:** elke auto-registratie moet herleidbaar zijn (welke declaratie + welke visuele match + welke drempels) — dit project heeft al provenance-registratie (Story 8.6); het vliegwiel moet die lijn doortrekken naar referentie-promoties.
2. **ECGT-momentum benutten:** de sept. 2026-deadline maakt keurmerk-verificatie een verkoopbaar compliance-product; het 12.8-endpoint levert daarvoor het bewijsmateriaal (verdict + bbox + bron).
3. **Declaratie-fouten als eigen datastroom:** waar de visuele werkelijkheid en de declaratie structureel botsen (keurmerk zichtbaar maar niet gedeclareerd, of andersom) is dat geen ruis maar een **datakwaliteitssignaal richting de leverancier** — een derde product uit hetzelfde vliegwiel.

### Risk Assessment

| Risico | Kans | Impact | Mitigatie |
|---|---|---|---|
| Declaratie fout → verkeerde referentie auto-geregistreerd | Middel (5–10% invoerfouten generiek) | Middel | Dubbele bevestiging + gate-drempel + gold-set-regressie + per-klasse caps |
| Keurmerk-beeldmerk gereviseerd → referenties verouderd | Middel (periodieke stijlrevisies) | Middel | Versiebeheer + variant-labels in referentiebibliotheek (bestaat al) |
| AI Act-herclassificatie bij extern gebruik verdicts | Laag | Middel | Juridische toets bij productisering; logging/human-oversight-capability aanhouden |
| ECGT maakt bepaalde labels illegaal → codelijst-churn | Middel | Laag | T3777-alias/deprecatie-mechanisme (12.8 AC3 basis aanwezig) |

## Technical Trends and Innovation

### Emerging Technologies

**1. Het data-engine-patroon (Tesla-archetype) — het bewezen sjabloon voor dit vliegwiel.** Tesla's Data Engine draait sinds 2016 op precies de bouwstenen die dit project nodig heeft: (a) **shadow mode** — het systeem draait passief mee en vergelijkt zijn voorspelling met een onafhankelijke waarheidsbron (daar: de menselijke bestuurder; hier: de GS1-declaratie); (b) **trigger-classifiers** — 200+ gerichte detectoren die alleen *afwijkingen* tussen voorspelling en waarheid als leermoment oogsten; (c) **auto-labeling met escalatie** — automatisch gelabelde clips gaan pas na een poortwachter de trainingsset in; (d) **hard-example mining** — false positives/negatives worden gericht verzameld ([CodeCompass](https://codecompass00.substack.com/p/tesla-data-engine-trigger-classifiers), [IEEE Spectrum](https://spectrum.ieee.org/tesla-autopilot-data-deluge), [Kargar](https://kargarisaac.medium.com/active-learning-data-selection-data-auto-labeling-and-simulation-in-autonomous-driving-part-4-dc985e2c83f9)). _Vertaling: het 12.8-endpoint is de shadow-mode-sensor; declaratie↔detectie-mismatches zijn de triggers; auto-registratie met gold-set-gate is de escalatieroute._

**2. Open-set logo-herkenning via retrieval is de gevestigde aanpak.** De literatuur bevestigt de projectarchitectuur: het logo-domein is te groot voor closed-set-classificatie (894 codes, continu nieuwe varianten) en vereist een open-set retrieval-aanpak — herkennen van willekeurige logo's buiten de trainingsset met één of enkele referentiebeelden ([Tüzkö et al., Open Set Logo Detection and Retrieval](https://www.researchgate.net/publication/320726900_Open_Set_Logo_Detection_and_Retrieval), [Scalable Zero-Shot Logo Recognition](https://www.researchgate.net/publication/376512492_Scalable_Zero-Shot_Logo_Recognition)). Benchmark-referentie: LogoDet-3K (3.000 klassen, 200k geannoteerde logo's) ([LogoDet-3K](https://www.semanticscholar.org/paper/LogoDet-3K:-A-Large-scale-Image-Dataset-for-Logo-Wang-Min/7cdf6109d8ec8c258dea4ca330f60865bd5b2e70)).

**3. Embedding-backbone-upgrade als stille versneller.** DINOv2 (self-supervised, fijnmazige pixelinformatie) verslaat CLIP en oudere CNN-backbones aantoonbaar op puur visuele gelijkenis-taken — precies het profiel van keurmerk-matching ([Encord DINOv2](https://encord.com/blog/dinov2-self-supervised-learning-explained/), [Babbar-vergelijking](https://medium.com/@tapanbabbar/build-an-image-similarity-search-with-transformers-vit-clip-efficientnet-dino-v2-and-blip-2-5040d1848c00)). _Het project draait nu op EfficientNet-B0-embeddings; een DINOv2-migratie is een kandidaat-verbetering die élke vliegwiel-cyclus productiever maakt — maar géén voorwaarde (het 12.3-real-ref-experiment bewees dat referentiekwaliteit de bottleneck was, niet de embedding)._ ⚠️ *Confidence: gemiddeld — geen logo-specifieke benchmark gevonden; verdient een kleine eigen spike op de gold-set.*

### Digital Transformation

**Van human-in-the-loop naar human-over-the-loop.** De dominante transformatie in data-labeling: de mens verschuift van per-sample-reviewer naar beheerder van poortwachters, steekproeven en drempels (Snorkel's "model-in-the-loop", 10–100× minder handwerk; Tesla's escalatie-model) ([Label Your Data](https://labelyourdata.com/articles/snorkel-ai-competitors)). _Dit is exact de beweging die dit PRD formaliseert: de datamanager beheert het vliegwiel, niet de individuele crops._

### Innovation Patterns

**Patroon 1 — Metadata-kruisvalidatie als auto-label-bron (distant supervision).** Het gebruik van een externe kennisbron als ruizig-maar-onafhankelijk labelsignaal is een gevestigd paradigma (distant supervision; "webly supervised" leren waarbij metadata automatisch schone labels identificeert tussen ruizige webdata) ([Webly Supervised + metadata](https://arxiv.org/pdf/2010.05864), [Snorkel-paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC5951191/)). De literatuur is eenduidig over de valkuil: zwakke labels zijn per definitie ruizig en diepe modellen overfitten die ruis ([Denoising Multi-Source Weak Supervision](https://arxiv.org/pdf/2010.04582)). De remedie is signaal-combinatie: meerdere onafhankelijke zwakke bronnen die elkaar corrigeren ([WRENCH-benchmark](https://arxiv.org/pdf/2109.11377), [ULF: labeling-function-correctie via cross-validatie](https://arxiv.org/pdf/2204.06863)). _Dit project combineert er al drie: declaratie + visuele match + gate-score. Dat is methodologisch de juiste architectuur._

**Patroon 2 — Confirmation bias is dé gedocumenteerde faalwijze van self-training.** Wanneer een systeem zijn eigen output als trainingsdata gebruikt, accumuleren vroege fouten zich tot ernstige degradatie ("confirmation bias": foute pseudo-labels → biased model → méér foute labels) ([Debiased Self-Training](https://arxiv.org/abs/2202.07136), [Springer entity-alignment-framework](https://link.springer.com/article/10.1007/s10618-025-01128-0)). Het RECYCLABLE-incident van dit project is hiervan een levensecht voorbeeld. De literatuur geeft drie bewezen remedies:
1. **Dynamische/adaptieve drempels** in plaats van statische — de drempel groeit mee met de betrouwbaarheid van het systeem ([CW-BASS](https://arxiv.org/pdf/2502.15152))
2. **Kwaliteit vóór kwantiteit in de vroege fase** — de schadelijkste fouten ontstaan als het vliegwiel jong is; begin dus streng en verruim pas na bewezen gold-set-stabiliteit ([Debiased Self-Training](https://arxiv.org/pdf/2202.07136))
3. **Onafhankelijke tweede stem** (co-training: twee verschillende "zichten" filteren elkaars ruis) — hier structureel aanwezig in de vorm van de declaratie, die *niet* door het visuele systeem beïnvloed wordt ([JointMatch](https://arxiv.org/pdf/2310.14583))

_Cruciale nuance: de declaratie ontsnapt aan de self-training-valkuil omdat ze extern is — maar de **referentie-promotie zelf** creëert wél een lus (nieuwe referentie → beïnvloedt volgende matches). Daarom zijn caps, dedup en gold-set-regressie geen nice-to-haves maar de kern van het ontwerp._

**Patroon 3 — Synth-to-real: schone logo's als zaad, niet als referentie.** De synthetic-to-real-literatuur bevestigt het 12.3-inzicht: modellen getraind/gematcht op schone templates degraderen op echte beelden (domain gap), en de combinatie synthetisch + echt verslaat elke enkele bron ([YOLOv11 domain randomization](https://arxiv.org/html/2509.15045v1), [Synthesising Context voor logo-detectie](https://arxiv.org/pdf/1612.09322)). Voor logo's specifiek is "data expansion by synthesising context" (schoon logo op realistische achtergronden plakken met vervormingen) een gedocumenteerde brug voor klassen zonder echte voorbeelden. _De juiste rol van het schone vectorlogo: (1) zoekzaad om echte crops te vinden in gedeclareerde producten, (2) grondstof voor synthetische overbrugging — nooit als permanente referentie._

### Future Outlook

- **Foundation-modellen als region proposers:** zero-shot-detectors (Grounding DINO-lijn) kunnen op termijn de klassieke template-matching-lokalisatie vervangen ("find all logos/seals on this label"), waarna de eigen referentiebibliotheek de identificatie doet — de 28s/beeld-bottleneck (lineair in referentie-aantal) verdwijnt dan ([Grounded-SAM](https://github.com/idea-research/grounded-segment-anything), [autodistill](https://github.com/autodistill/autodistill)). ⚠️ *Confidence: gemiddeld — Story 12.4-detector-spike toonde dat een eigen getrainde detector nog niet werkt met 22 artworks; een zero-shot foundation-detector heeft dat trainingsdata-probleem niet en is dus een andere weddenschap.*
- **Kwaliteitsstandaardisering:** de komende geharmoniseerde CV-evaluatiestandaard onder de AI Act (JT021025) maakt gold-set-meetpraktijken tot industrienorm.

### Implementation Opportunities

1. **Referentie-promotie met dubbele bevestiging** — de kern-gap: auto-geaccepteerde crops (declaratie + visuele match) doorpromoveren naar de referentiebibliotheek, met de Tesla-escalatieroute: promotie pas ná gold-set-regressietest per batch.
2. **Dedup-laag op de referentieset** — tweetraps zoals de literatuur adviseert: perceptual hash (pHash) voor bijna-exacte kopieën + embedding-afstand voor getransformeerde duplicaten; pHash alleen is onvoldoende bij crops/kleurverschuivingen ([MDPI-vergelijking](https://www.mdpi.com/2079-9292/15/7/1493), [StrongMocha-overzicht](https://strongmocha.com/ai-infrastructure/dataset-deduplication-techniques/)).
3. **Outlier-detectie per klasse** — embedding-gebaseerde outlier-detectie (FiftyOne-plugin of eigen implementatie op pgvector) als periodieke referentie-audit; had het RECYCLABLE-incident vooraf gevangen (één referentie ver van het klasse-centrum) ([Voxel51](https://voxel51.com/blog/finding-outliers-in-your-vision-datasets), [Encord](https://encord.com/blog/top-tools-for-outlier-detection-in-computer-vision/)).
4. **Trigger-gebaseerde brandstofwinning** — mismatches (gedeclareerd-maar-niet-gevonden, gevonden-maar-niet-gedeclareerd) als gerichte werkvoorraad: de eerste voedt seed-bootstrap voor lege klassen, de tweede is een datakwaliteitssignaal richting leverancier.
5. **Declaratie-prior als kandidaat-krimper** (12.7-inzicht, bevestigd door de distant-supervision-literatuur): matchen tegen ~8 gedeclareerde kandidaten in plaats van ~920 klassen verhoogt precisie én snelheid tegelijk.

### Challenges and Risks

| Uitdaging | Literatuur-les | Project-vertaling |
|---|---|---|
| Confirmation bias in de promotielus | Vroege fouten accumuleren tot degradatie ([2202.07136](https://arxiv.org/abs/2202.07136)) | Streng starten (hoge drempel), pas verruimen na N stabiele gold-set-runs |
| Klasse-onbalans (RECYCLABLE: 8.643 declaraties) | Frequente klassen domineren pseudo-label-verdeling | Per-klasse caps op promotie (harvest-cap 25 bestaat al — doortrekken naar referenties) |
| Gold-set te klein (91 samples) | Regressie-gating vereist statistisch dragend meetinstrument | Gold-set laten meegroeien met het vliegwiel (elke reviewbeslissing is gratis gold-set-kandidaat) |
| Referentie-veroudering | Schema-eigenaren reviseren beeldmerken | Versie-/vervalbeheer + periodieke hermeting per referentie |
| Domain gap bij seed-bootstrap | Schoon logo ≠ gedrukte werkelijkheid | Seed alleen als zoekzaad; promotie vereist échte crop + declaratie |

## Recommendations

### Technology Adoption Strategy

1. **Bouw het vliegwiel op bestaande componenten** — crosscheck (8.5), registratie met provenance (8.6), gate-v2 (12.4), harvest-cadans (12.6) en declaratie-prior (12.7) vormen samen al 80% van een data-engine; de ontbrekende 20% is de promotielus naar de referentiebibliotheek met guardrails.
2. **Adopteer het Tesla-escalatiemodel**: auto-label → batch-quarantaine → gold-set-regressietest → promotie. Nooit direct van detectie naar actieve referentie.
3. **Hergebruik open-source datasethygiëne** (FiftyOne/pHash/embedding-dedup) in plaats van eigen bouw; het zijn commodity-bouwstenen.

### Innovation Roadmap

- **Nu:** promotielus + guardrails (caps, dedup, gold-set-gating) — het eigenlijke PRD-onderwerp
- **Daarna:** seed-bootstrap voor lege klassen (schoon logo als zoekzaad in gedeclareerde producten) + mismatch-triggers als gerichte werkvoorraad
- **Later:** embedding-upgrade-spike (DINOv2 vs. effb0 op de gold-set) en zero-shot region proposer (vervangt template-matching-bottleneck)

### Risk Mitigation

1. **Gold-set als noodrem:** elke promotiebatch draait eerst de goudstandaard; precisiedaling → batch in quarantaine, vliegwiel pauzeert automatisch.
2. **Nooit review-afgewezen materiaal herpromoveren:** afgewezen crops zijn permanente hard-negatives (het gate-v2-trainingspatroon voortzetten).
3. **Rentmeesterschap zichtbaar maken:** een vliegwiel-dashboard (promoties per klasse, gold-set-trend, cap-status) zodat de datamanager de lus bestuurt in plaats van hem te moeten vertrouwen.

---

# Research Synthesis: Het Referentie-Vliegwiel Zonder Review

## Executive Summary

Het idee om automatisch bevestigde keurmerk-detecties zonder menselijke review te promoveren tot referenties is **geen gok maar een bewezen industriepatroon**. Tesla's Data Engine draait er sinds 2016 op (shadow mode + trigger-mining + auto-labeling met escalatie), retail-herkenningsspelers Trax en Vispera bouwden er hun kernasset mee (zelfonderhoudende referentiedatabases, >96–99% nauwkeurigheid), en de academische literatuur heeft het onderliggende mechanisme — meerdere onafhankelijke zwakke signalen combineren tot één betrouwbaar label — uitputtend gevalideerd onder de naam *weak supervision / distant supervision*. Het unieke van dit project is de kwaliteit van het tweede signaal: een GS1-declaratie is een gestandaardiseerde, extern beheerde waarheidsclaim die het visuele systeem niet kan beïnvloeden — structureel sterker dan wat de meeste data-vliegwielen tot hun beschikking hebben.

Er is één goed gedocumenteerde manier waarop zulke systemen kapotgaan: **confirmation bias** — vroege fouten die zichzelf versterken tot ernstige degradatie. Het RECYCLABLE-incident van dit project was daar een levensecht voorbeeld van. De literatuur en de industrie zijn eensgezind over de remedies, en die vormen samen het hart van het aanbevolen ontwerp: (1) streng starten en pas verruimen na bewezen stabiliteit, (2) per-klasse caps en tweetraps-dedup (perceptual hash + embedding-afstand), (3) elke promotiebatch langs een gold-set-regressietest die het vliegwiel automatisch pauzeert bij precisiedaling, en (4) embedding-gebaseerde outlier-detectie als periodieke referentie-audit. De regulatoire timing is bovendien gunstig: de ECGT-richtlijn maakt vanaf 27 september 2026 geverifieerde duurzaamheidslabels tot handhaafbare compliance-eis, wat automatische keurmerk-verificatie direct businesswaarde geeft.

**Key Findings:**

1. **Bewezen patroon, unieke signaalbron** — data-vliegwielen zijn industriestandaard; GS1-declaratie-kruisvalidatie als tweede stem is nergens commercieel verkrijgbaar en alleen bouwbaar door partijen met GDSN-, artwork- én referentie-toegang: alle drie aanwezig in dit project.
2. **Confirmation bias is dé faalwijze, met bekende remedies** — dynamische drempels, vroege strengheid, onafhankelijke tweede stem, caps, dedup en gold-set-gating; de declaratie ontsnapt aan de zelfversterkingslus omdat ze extern is, maar de referentie-promotie zelf niet — guardrails zijn kernontwerp, geen optie.
3. **Schone logo's zijn zaad, geen referentie** — de synth-to-real-literatuur bevestigt het eigen 12.3-experiment (top-1 37%→81% met echte crops); het vectorlogo dient als zoekzaad om echte crops te oogsten in producten die de code declareren.
4. **Mismatches zijn brandstof** — het Tesla-triggerpatroon vertaalt zich direct: "gedeclareerd-maar-niet-gevonden" voedt de seed-bootstrap van lege klassen; "gevonden-maar-niet-gedeclareerd" is een verkoopbaar datakwaliteitssignaal richting leveranciers.
5. **Regulatoire wind mee** — ECGT (sept. 2026) maakt keurmerk-verificatie handhaafbaar compliance-terrein; de AI Act classificeert dit systeem als laag risico ("zonder review" is regulatoir onproblematisch zolang output productdata betreft).
6. **Kwaliteitsbewaking is commodity** — FiftyOne/pHash/embedding-dedup zijn kant-en-klare bouwstenen; niets van de guardrail-laag hoeft from scratch.

**Strategic Recommendations:**

1. **Sluit de lus met het escalatiemodel:** auto-accept → batch-quarantaine → gold-set-regressietest → promotie naar referentiebibliotheek. Nooit rechtstreeks.
2. **Begin streng, verruim op bewijs:** hoge promotiedrempels bij start; versoepeling pas na N opeenvolgende stabiele gold-set-runs.
3. **Laat de gold-set meegroeien:** 91 samples is te dun als noodrem op schaal; elke reviewbeslissing (accept én reject) is een gratis gold-set-kandidaat.
4. **Bouw de mismatch-triggers als eersteklas product:** seed-bootstrap voor lege klassen en leverancier-datakwaliteitssignalen komen uit dezelfde lus.
5. **Plan de backbone-spike apart:** DINOv2-vs-effb0 op de gold-set is een goedkope, potentieel grote versneller — maar geen voorwaarde voor het vliegwiel.

## Cross-Domain Synthesis

_Markt × technologie:_ de industrie beweegt van per-sample-review naar poortwachter-beheer; dit PRD formaliseert die beweging voor keurmerken. _Regulering × strategie:_ ECGT-deadline (sept. 2026) + het 12.8-endpoint = een compliance-product met bewijsmateriaal (verdict + bbox + provenance) precies wanneer de markt het nodig heeft. _Concurrentie × data:_ elke maand vliegwiel-draaien vergroot een dataset-voorsprong die geen vendor kan repliceren — het "data moat"-effect.

## Research Methodology and Source Verification

- **Methode:** parallelle websearches per onderzoeksgebied (industrie, concurrentie, regulering, techniek), multi-source-validatie voor kritieke claims, confidence-markering (⚠️) bij enkelvoudige of vendor-bronnen; aangevuld met twee interne codebase-analyses (aiService-verbeterplan; logoRecognition brandstof/vliegwiel-inventaris).
- **Primaire bronnen:** arXiv (self-training/weak supervision: 2202.07136, 2109.11377, 2204.06863, 2010.05864, 2310.14583, 2502.15152; logo-detectie: LogoDet-3K, Open Set Logo Detection and Retrieval, 1612.09322), GS1 (ref.gs1.org, Navigator, GS1 Italy-gids), EU (artificialintelligenceact.eu, EC Green Claims), industrie (NVIDIA, Voxel51, Encord, Cleanlab, VISUA, Trax, Vispera, Snorkel).
- **Beperkingen:** marktcijfers lopen sterk uiteen tussen onderzoeksbureaus (richting consistent, absolute omvang niet); vendor-accuracy-claims niet onafhankelijk geverifieerd; geen logo-specifieke DINOv2-benchmark gevonden (eigen spike aanbevolen); GDSN-foutpercentages zijn generiek, niet T3777-specifiek.

## Research Conclusion

**Volgende stappen:** dit rapport dient als input voor de PRD "Referentie-vliegwiel zonder review". De aanbevolen scope-kern: (1) promotielus met escalatiemodel en guardrails, (2) seed-bootstrap voor klassen zonder referenties, (3) mismatch-triggers als brandstof- en datakwaliteitsstroom, (4) meegroeiende gold-set als noodrem, (5) vliegwiel-dashboard voor de datamanager. Buiten scope maar geagendeerd: DINOv2-spike en zero-shot region proposer.

---

**Research Completion Date:** 2026-07-02
**Source Verification:** alle feitelijke claims voorzien van bronvermelding; confidence-niveaus gemarkeerd
**Confidence Level:** hoog voor patronen en faalwijzen (multi-source); gemiddeld voor marktcijfers en vendor-claims
