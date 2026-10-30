---
title: 'Technisch onderzoek: architectuurkeuze logoherkenning op verpakkingsartwork'
type: technical
shape: select (kiezen tussen kandidaten)
topic: 'K1 taalmodel vindt en benoemt · K2 beter beeldnetwerk · K3 eigen getraind model · K4 hybride'
decision: 'Welke varianten (max. 2 per kandidaat) gaan de vergelijkende meting op dezelfde meetset in'
source: 'bmad-deep-recon, modus run (3 parallelle web-assistenten, 1 ronde) + interne meetrapporten; daarna bmad-review (verse subagent, 16 + 1 bevindingen doorgevoerd; korte herreview 8 bevindingen doorgevoerd)'
status: complete
preset: standard
validation: normal
created: '2026-10-18'
updated: '2026-10-18'
claims_verified: 11
claims_unverified: 19
claims_disputed: 1
werkmap: 'onderzoek/ (memlog en digests)'
---

# Architectuurkeuze logoherkenning: welke varianten meten we?

> [!note] Bij verschil is [meetopzet.md](meetopzet.md) leidend.

**Vraag.** Productowner-eis: per keurmerk uit de top 15 minstens 80% gevonden op volledige etiketten, met minder dan 10% valse meldingen. Nu op ACC: 34 van 256 gedeclareerde keurmerken gevonden (13%); voor de top 15 alleen: 21 van 140 (VERIFIED [1], meting 13-10 op 9392809; de uitsplitsing hieronder komt uit de meting van 12-10 middag op f40a2a0, met 19 van 140 gevonden). Welke architecturen verdienen een plek in de vergelijkende meting, en met welke concrete varianten?

> [!note] Uitkomst in vijf regels
> 1. **Geen enkele bron meet ons probleem** (logo's van 50–300 px op etiketten van 3.000–40.000 px, met fijn onderscheid zoals Nutri-Score-letters of vegan-varianten). De meting moet beslissen; dit onderzoek kiest alleen wát we meten.
> 2. **Het grootste verlies zit waarschijnlijk in het vinden.** VERIFIED [1] (meting 12-10, f40a2a0): van 121 gemiste top-15-declaraties hadden er 31 een item van de juiste soort onder de itemdrempel; bij 90 kreeg de soort geen item.
>    INFERENCE [1] (AI-oordeel, nog niet door een mens bevestigd): van die 90 waren 56 niet aangewezen en 20 verkeerd benoemd.
>    INFERENCE: beter benoemen plus kalibreren (K2) kan de 31 en de 20 helpen, niet de 56.
> 3. **Gekozen om te meten** (definitie in [meetopzet.md §2](meetopzet.md)): K1a Gemini 3.8 Flash met tegels · K1b Claude Sonnet 5.5 met tegels (SPEC open vraag 9) · K2a/K2b tegel-vindstap + SigLIP 2 B/16 resp. DINOv3 ViT-S/16 · K3b classifier op SigLIP 2 mét "onbekend"-klasse · K3c open-vocabulary detector (OWLv2, gezocht met de 15 gidslogo's) + SigLIP 2 (SPEC open vraag 8, standaard ja) · K4: K1-vakjes met een K2-controle, vier vaste combinaties. **K3a (eigen getrainde detector) nu niet**: geen etiket-annotaties, twee eerdere interne pogingen faalden op data [4].
> 4. **Kosten per etiket** liggen tussen ±$0,00 (K3c, alleen CPU) en ±$0,05–0,07 (K1b Claude); alle taalmodelvarianten blijven onder een dubbeltje (AANNAMES in §5; de werkelijke tokens worden op 10 proefproducten gemeten en bij >25% afwijking wordt het budget opnieuw voorgelegd, meetopzet §2).
> 5. **K4 meet alleen of een K2-controle de valse meldingen van K1 terugdringt.** Het kan K1's vondsten niet vergroten. Het productiepatroon "vaste route voor de top 15, retrieval voor de lange staart" lijkt deels op Open Food Facts, maar de staart valt buiten deze meting.

## 1. Eisen (requirements-frame)

| soort | eis |
|---|---|
| hard (uit de opdracht) | ≥80% gevonden per top-15-keurmerk, <10% valse meldingen, op volledige etiketten |
| hard (uit de opdracht) | draait op CPU-containers (8 GB, 4 workers) of via OpenRouter (zelfde sleutel); scan ≤165 s |
| voorkeuren | vindkans, beheersbare valse meldingen, onderhoud bij nieuw keurmerk, kosten, CPU/latentie, afhankelijkheid/licentie |

AANNAME: de gewichten in §3 zijn van de auteur van dit verslag, niet uit de opdracht.

## 2. Wat we al weten uit eigen metingen

- VERIFIED [1]: stap 2 is een onbewerkt ImageNet-EfficientNet-B0 met top-1-cosinus; er draait geen getraind model.
- VERIFIED [1] (meting 12-10 middag, f40a2a0): van 140 gedeclareerde top-15-keurmerken: 19 gevonden, 31 met een item van de soort onder de itemdrempel van de API, 77 met stap-1-vakjes maar geen item van de soort, 13 op een etiket zonder enig vakje.
- INFERENCE [1] (AI-oordeel, nog niet door een mens bevestigd): van die 90 (77 + 13) zijn 56 niet aangewezen, 20 verkeerd benoemd (o.a. Beter Leven 1 ster → RECYCLABLE 4×, → 2 ster 2×), 11 niet op het etiket, 3 niet te beoordelen.
- VERIFIED [3]: heel etiket + ≤5 tegels (VTF) wijst 38 van 56 gemiste logo's aan tegen 14,5 voor één aanroep; ±19.500 invoer- en ±390 uitvoertokens per scan; mediaan 33–38 s, max 145 s. Extra niet-gedeclareerde meldingen per 40 etiketten: fase B 14 per run (tegen 4 voor één aanroep), fase C met de gebouwde reparaties 11 en 6 (tegen 3 en 6).
- VERIFIED [2]: een getrainde laag op de bestaande embeddings herkent niet meer (Model A 104/140 = 74% vs baseline 107/140 = 76%), maar meldt zekerheid veel beter: bij 13 valse meldingen 91 gevonden tegen 71. 610 van de 867 trainingsuitsneden zijn byte-gelijk aan een referentie; er zijn geen negatieven.
- VERIFIED [4]: eerdere detector-spike (12.4) faalde op data (22 artworks, getegelde recall 0,27); synthetische data (12.11) gaf een NO-GO.
- VERIFIED [5]: in een kleine interne proef overlapten na een coördinatencorrectie maar 2 van 7 Gemini-vakjes rond GHS-pictogrammen met eerdere vakjes; oorzaak (instructie of model) is open.

## 3. Vergelijkingstabel

Alleen een ordening, geen keuze: scores 1–5 en gewichten zijn INFERENCE/AANNAME van de auteur. "<10% vals" is een harde eis en wordt pas door de meting beslist; daarom geen totalen.

| criterium (gewicht) | K1 taalmodel vindt + benoemt | K2 beter beeldnetwerk | K3 eigen model (classifier / open-vocabulary detector) | K4 K1 + K2-controle |
|---|---|---|---|---|
| vindkans top 15 (35) | 4 — pakt vinden én benoemen aan; vakjes onbewezen | 3 — helpt de 31 onder de drempel en de 20 verkeerd benoemd; vinden blijft VTF | 2–3 — classifier lost vinden niet op; OWLv2 zoekt gericht maar is onbewezen op kleine logo's | 3 — hoogstens gelijk aan K1 |
| valse meldingen (20) | 2 — geen zekerheid per vakje [16] | 3 — met kalibratie goed te sturen [2] | 4 — "onbekend"-klasse en kalibratie mogelijk | 4 — K2-controle filtert K1 |
| onderhoud nieuw keurmerk (15) | 4 — regel + referentieplaatje in de prompt | 5 — referenties toevoegen, geen training | 2 (classifier: hertrainen) – 4 (OWLv2: referentieplaatje) | 4 |
| kosten (10) | 3 — $0,02–0,07 per etiket | 3 — VTF ±$0,04 + CPU | 5 — alleen CPU (classifier achter VTF: als K2) | 3 — als K1 + CPU |
| CPU/latentie (10) | 5 — rekenwerk extern | 4 — tientallen ms per uitsnede (lage zekerheid) | 2–3 — tegelen op CPU, seconden per etiket | 4 |
| afhankelijkheid/licentie (10) | 2 — leverancier, preview-modellen, prijswijziging | 3 — DINOv3-licentie toetsen | 4 — OWLv2 en SigLIP 2 Apache-2.0; Ultralytics AGPL vermijden | 2 — beide afhankelijkheden |

## 4. Per kandidaat

### K1 — het taalmodel vindt én benoemt

- **Tarieven** (USD per miljoen tokens invoer/uitvoer, VERIFIED via de OpenRouter-API [6] op 18-10-2026, Anthropic [7] en Google [9] gelijk waar vermeld): Claude Sonnet 5.5 2/10 (cache-treffers 0,05× invoer [7]); Gemini 3.1 Pro preview 2/12; Gemini 3.8 Flash OpenRouter 0,825/4,125, Google 0,75/3,75 tot 31-12-2026 en **1,50/7,50 vanaf 1-1-2027** (betwist: welk tarief OpenRouter dan rekent); GPT-6 sol 2/10, GPT-6 Astra 10/50, GPT-6 luna 0,10/0,50; Qwen3.8-Max 2/6; Qwen3-VL-235B 0,21/1,90. Bij Gemini tellen denktokens als uitvoer [9].
- **Beeldtokens**: Claude ±1 token per 750 pixels, tot ±4.800 per beeld bij de maximale zijde van 2.576 px [8]; Gemini 3 vast 1.120 (high) [10]; GPT-klasse ±1.805 voor ~1,5 MP [12]; Qwen3-VL ±1.457 [13]. Gevolg: dezelfde tegel kost bij Claude 2–4× zoveel beeldtokens als bij Gemini; daarom krijgen alle K1-varianten dezelfde tegels van hoogstens 1.500 px lange zijde (meetopzet §2).
- **Vakjes**: Gemini levert `box_2d` genormaliseerd 0–1000 [11]; Anthropic noemt plaatsbepaling door Claude "approximate" [8]; OpenAI zegt dat precieze plaatsbepaling moeilijk is [12]. Qwen2.5-VL was sterk op verwijzende vakjes (RefCOCO 92,7) maar zwak op echte detectie (ODinW-13 43,1 mAP) [14]; op RF100-VL haalt Gemini 2.5 Pro zero-shot 13,3 mAP tegen ±55 voor een getrainde detector [15].
- **Rangorde** (INFERENCE: blog zonder getallen [16], aug. 2026): GPT-6 Astra > Gemini 3.8 Flash > Qwen3.8-Max > Claude; het Claude-model in die vergelijking is Fable 5.1, niet Sonnet 5.5. Voorbeelden in de prompt hielpen sterke modellen maar soms niet Claude.
- **Logo's en details**: VLM's kiezen het juiste merk uit drie in ±67–72% [17]; de nauwkeurigheid daalt naarmate het detail kleiner is, en uitsnijden helpt zonder training [18], wat tegels ondersteunt.
- **Sterk**: lost beide verliesposten in één stap op; nieuw keurmerk = regel en plaatje in de prompt. **Zwak**: geen bruikbare zekerheid per vakje [16], vakjes benaderend [5][8], wisselvallig tussen runs [3], leverancier kan prijzen wijzigen [9].
- **CPU**: geen; latentie bepaald door parallelle aanroepen (nu mediaan 4 s, max 16 s per aanroep [3]).

### K2 — beter beeldnetwerk in stap 2

- **Bewijs op logo's** (VERIFIED [19]): Open Food Facts mat op verpakkingslogo's macro-recall@4 0,584 voor EfficientNet-B0 tegen 0,847 voor CLIP ViT-B/16 en 0,872 voor CLIP ViT-L/14 (cosinus); oud (±2022) maar het enige logo-bewijs.
- **Moderne modellen** (INFERENCE: andere maten dan we meten, en geen logo's): DINOv3 B/16 haalt 58,5 mAP op Oxford-Hard (gebouwen, instance-herkenning) tegen ±20–26 voor SigLIP 2 / PE-Core van vergelijkbare grootte; DINOv3 S/16 49,5, zonder S-vergelijking [20]. Op productzoeken liggen SigLIP2-SO400M, DINOv3 en PE-Core-L gelijk (R@1 45,7 / 45,2 / 44,3; bron belanghebbend) [21]. Modellen met taalsupervisie lezen tekst beter (±7,5 punt), gemeten binnen chatmodellen, niet voor uitsnede-zoeken [34]; mogelijk relevant voor Nutri-Score-letters en "VEGAN".
- **Waarom niet PE-Core**: Apache-2.0 [24] en op productzoeken gelijk aan SigLIP 2 [21], maar zonder eigen voordeel; SigLIP 2 dekt de taalgesuperviseerde kant, DINOv3 de puur visuele. PE-Core is een reserve als SigLIP 2 tegenvalt.
- **Licenties**: SigLIP 2 Apache-2.0 [23]; PE-Core Apache-2.0 [24]; DINOv3 eigen licentie, download achter registratie [22], juridisch toetsen vóór inzet.
- **CPU** (AANNAME, geen standaardmeting gevonden): ViT-B/16 int8 ±37 ms, fp32 ±93 ms per uitsnede; DINOv3 S/16 ±35 ms en B/16 ±121 ms op één thread.
- **Sterk**: onderhoud blijft "referentie toevoegen"; zelfde architectuur als nu; combineerbaar met de kalibratiewinst uit [2]. **Zwak**: lost het niet-aanwijzen niet op; geen bewijs dat globale embeddings Nutri-Score-letters of sterren scheiden (eerder intern: same-letter-cosinus ±0,3 [4]).

### K3 — eigen model op productievoorbeelden

- **Gesloten detector (K3a)**: Ultralytics adviseert ≥1.500 beelden en ≥10.000 exemplaren per klasse [29]; met 10 voorbeelden haalt YOLOv8 op RF100-VL ±20 mAP tegen ±55 bij volledige training [15]. Wij hebben 20–86 uitsneden per soort en géén vakjes op hele etiketten [2]. Tegelen (SAHI) levert +5 tot +7 AP bij kleine objecten [31]; een etiket van 4.000×20.000 px vraagt 80–312 tegels, met YOLO11n ±56 ms per tegel (hardware onbekend) [32] → INFERENCE ±5–28 s CPU.
- **Open-vocabulary detector (K3c)**: OWLv2 (Apache-2.0 [35]) kan met een voorbeeldbeeld zoeken ("vind dingen die op dit logo lijken"), zonder training; dat raakt de grootste verliespost (niet aangewezen) zonder taalmodel. INFERENCE: onbewezen op logo's van 50–300 px, en op CPU traag (seconden per tegel, AANNAME). De generieke logodetector van Open Food Facts (YOLOv8s [25]) is het alternatief, maar valt onder AGPL [28]. Digest D3 noemde deze route ("K3-2"); hij was in de eerste versie van dit verslag weggevallen.
- **Licenties**: Ultralytics-modellen (ook zelf getrainde) vallen volgens Ultralytics onder AGPL-3.0 of vragen een enterprise-licentie, ook voor interne tools [28]; RF-DETR Nano/Small/Medium/Large is Apache-2.0 met 57,7–62,2 AP op RF100-VL (VERIFIED [30]). YOLOE AGPL, YOLO-World GPL [36].
- **Crop-classifier (K3b)**: intern bewezen dat een lineaire kop de zekerheid sterk verbetert [2]; met negatieven (lege vakjes, tekst, onbekende logo's) kan een "onbekend"-klasse de valse meldingen drukken. Negatieven bestaan nog niet.
- **Sterk**: geen kosten per scan, goed te kalibreren, volledig in eigen hand. **Zwak**: data en annotatie ontbreken; een gesloten model vraagt hertraining per nieuw keurmerk.

### K4 — hybride

- **Is dit het gangbare patroon?** Deels. Open Food Facts gebruikt een generieke logodetector (YOLOv8s, mAP50 0,837, recall 0,719 [25]) → embedding → zoekindex → mensen labelen [26]; gestandaardiseerde families kregen eigen getrainde modellen (tf-nutriscore; repo gearchiveerd 2025-10 [27]). Een taalmodel voor de top 15 zit niet in dat patroon. NutriGreen trainde YOLOv5 op 10.472 beelden voor Nutri-Score, V-label en bio [33]. Onzeker welke embedding OFF nu draait: de benchmarkpagina noemt EfficientNet "currently used" [19], de blog van 2023 CLIP [26].
- **Onderhoud bij een nieuw keurmerk**: in de retrieval-staart = referenties toevoegen (intern "gereed" bij ≥3 echte uitsneden [1]), geen training; in een gesloten classifier = hertrainen (lineaire kop: seconden; fine-tune: ±32 min CPU [2]); in een taalmodelroute = één regel en één plaatje in de prompt. Wie: de beoordelaars die nu al referenties bevestigen.
- **Wat de meting van K4 kan zeggen**: K4 gebruikt de vakjes van K1 en laat een code alleen staan als K2 die soort ook bij zijn drie beste soorten zet. Dat kan valse meldingen van K1 schrappen, maar nooit vondsten toevoegen. De lange staart (overige keurmerken via retrieval) heeft geen waarheid in deze meetset en valt erbuiten.

## 5. Gekozen varianten voor de meting

Volledige definitie, drempels en telregels: [meetopzet.md §2–3](meetopzet.md). Hier alleen motivatie, kosten en risico.

| variant | kort | motivatie | kosten per etiket (AANNAME: denken op laagste stand, 400 uitvoertokens per aanroep) | grootste risico |
|---|---|---|---|---|
| **K1a** | Gemini 3.8 Flash, heel etiket + ≤5 tegels (≤1.500 px), `media_resolution` high, lijst van 15 + referentieblad | betaalbaar, gedocumenteerd vakjesformaat [11], hoog in de (getalloze) rangorde [16] | ±$0,026 via OpenRouter; vanaf 2027 ±$0,05 (AANNAME: OpenRouter volgt Google) | vakjes verschoven [5]; prijsverdubbeling [9] |
| **K1b** | Claude Sonnet 5.5, zelfde opzet | continuïteit: huidige leverancier en prompt-infrastructuur, direct vergelijkbaar met B0/VTF [3]. Afweging: Claude staat laag in [16]; Qwen3.8-Max ($2/$6) of GPT-6 sol ($2/$10) zijn alternatieven (SPEC open vraag 9) | ±$0,074, ±$0,053 met caching van referentieblad en instructie | Anthropic noemt vakjes zelf benaderend [8] |
| **K2a** | VTF + SigLIP 2 B/16, cosinus top-1, drempel per soort | Apache-2.0, taalgesuperviseerd [34], CLIP-familie won op logo's [19] | ±$0,043 (VTF-tokens [3] × tarief [7]) + ±1–5 s CPU (AANNAME) | Nutri-Score-letters en sterren niet gescheiden |
| **K2b** | VTF + DINOv3 ViT-S/16, idem | sterk op instance-herkenning [20], klein genoeg voor CPU | als K2a | licentie [22]; zwak op tekst [34] |
| **K3b** | VTF + lineaire classifier op SigLIP 2, 40 soorten + "onbekend" | goedkoopste eigen model, intern bewezen kalibratiewinst [2] | als K2a | te weinig onafhankelijke families; overfit [2] |
| **K3c** | OWLv2 (gezocht met de 15 gidslogo's, getegeld) + SigLIP 2 benoemt (SPEC open vraag 8, standaard ja) | raakt de grootste verliespost zonder taalmodel; Apache-2.0 | ±$0 (AANNAME: ±10–60 s CPU per etiket) | traag op CPU; mist kleine logo's |
| **K4-xy** | K1x-vakjes, code alleen als K2y die soort in zijn top 3 heeft; 4 vaste combinaties | test of een goedkope K2-controle K1's valse meldingen terugdringt | som K1 + K2 stap 2, geen extra aanroepen | kan vondsten alleen verliezen |

**Niet in deze meting: K3a** (gesloten 15-klassen-detector, bijv. RF-DETR Small). INFERENCE: zonder enkele honderden geannoteerde etiketten haalt een detector het advies [29] bij lange na niet, en twee interne pogingen faalden op data [4]. Opnieuw overwegen zodra de door Friso bevestigde vakjes van de meetset of K1-runs als trainingsmateriaal bestaan.

**Rekenbasis kosten:** 6 aanroepen per etiket, per aanroep één tegel van ≤1.500 px, beeldtokens per tegel Gemini 1.120 en Claude ±1.900 (AANNAME), één referentieblad (Gemini 1.120 tokens, Claude ±1.250), 1.000 tokens tekst, 400 uitvoertokens. De werkelijke tokens worden op 10 proefproducten gemeten; bij >25% afwijking gaat het budget opnieuw voor (meetopzet §2).

## 6. Risico's

| risico | treft | maatregel in de meting |
|---|---|---|
| taalmodelvakjes kloppen niet of verschuiven bij tegels | K1, K4 | telregel tegen de door Friso bevestigde waarheidsvakken (meetopzet §3); ruwe antwoorden bewaren |
| geen zekerheid per vakje → valse meldingen niet te sturen | K1 | K2-controle als poort (K4); twee runs als stabiliteitsmaat |
| fijn onderscheid (Nutri-Score-letters, V-label/Vegan Society/VEGAN; Beter Leven-sterren) | alle | aparte telling per verwarbaar top-15-paar; Beter Leven 2/3 ster zit niet in de waarheid, dus een melding van 1 ster op een 2-sterlogo telt alleen als onterecht |
| meetset te klein voor 80%/10% per keurmerk | alle | teller én noemer, Wilson- en merk-bootstrapinterval; niets afstellen op de meetset |
| leveranciersprijs en previewstatus | K1 | Gemini 3.1 Pro is nog preview [6]; Flash verdubbelt per 2027 [9] |
| licentie (DINOv3, Ultralytics) | K2b, K3 | juridische toets vóór inzet; SigLIP 2, OWLv2 en RF-DETR zijn Apache-2.0 |
| klantartwork naar externe API | K1, K4 | Anthropic via OpenRouter gebeurt nu al in stap 1; Google ontvangt op ACC al artwork voor de GHS-beoordeling; voor K1a toch expliciet laten goedkeuren (SPEC open vraag 3) |

## 7. Open vragen die de meting moet beslechten

1. Raken taalmodelvakjes op tegels de echte logo's (telregel in meetopzet §3.2)? Geen bron meet dit voor 50–300 px.
2. Benoemt een taalmodel uit een vaste lijst Nutri-Score-letters en de drie vegan-varianten juist, en verwart het Beter Leven 1 ster niet met andere top-15-soorten? (2/3 ster zit niet in de waarheid.) Geen benchmark gevonden.
3. Hoeveel van de 31 onder de drempel en de 20 verkeerd benoemd lost K2 op, en scheidt SigLIP 2 of DINOv3 de letters beter dan nu (±0,3)?
4. Is de uitkomst van een taalmodel stabiel tussen twee runs?
5. Vindt OWLv2 (K3c) kleine logo's op tegels zonder taalmodel?
6. Drukt een K2-controle (K4) de valse meldingen van K1 onder 10% zonder dat gevonden% onder 80% zakt?

## 8. Bronnen

Interne bronnen [1]–[5] tellen als eigen meting; externe bronnen geraadpleegd 2026-10-18.

| nr | ondersteunt | uitgever | publicatie | geraadpleegd | zekerheid |
|---|---|---|---|---|---|
| [1] | verliesposten, 13%, stap-2-opbouw | [intern onderzoek acc-top15](../../implementation-artifacts/investigations/acc-top15-logoherkenning-slecht-20261012.md) | 2026-10-12/13 | 2026-10-18 | hoog |
| [2] | getrainde laag 74% vs 76%, kalibratie 91 vs 71 | [spike stap 2 RAPPORT](../spike-stap2-getraind-model/RAPPORT.md) | 2026-10-12 | 2026-10-18 | hoog |
| [3] | VTF dekking, tokens, tijd, fase C | meetverslag stap 1 (`git show origin/acc:_bmad-output/specs/spec-stap1-localization-recall/meetverslag.md`) | 2026-10-12 | 2026-10-18 | hoog |
| [4] | eerdere spikes 12.4/12.11, Robotoff-patroon | [eerder technisch onderzoek](../research-technical-logo-herkenning-2026-07-14.md) | 2026-07-14 | 2026-10-18 | middel |
| [5] | Gemini-vakjes 2 van 7 overlap | [GHS provider-smoke](../../implementation-artifacts/investigations/ghs-backend-provider-smoke-20261004.md) | 2026-10-04 | 2026-10-18 | laag |
| [6] | OpenRouter-tarieven | [OpenRouter modellen-API](https://openrouter.ai/api/v1/models) | 2026-10 | 2026-10-18 | hoog |
| [7] | Claude-tarieven, caching | [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) | 2026-10 | 2026-10-18 | hoog |
| [8] | Claude-beeldtokens, plaatsbepaling "approximate" | [Anthropic vision](https://platform.claude.com/docs/en/build-with-claude/vision) | ongedateerd | 2026-10-18 | hoog |
| [9] | Gemini-tarieven en prijsstap 2027 | [Google Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) | 2026-10-16 | 2026-10-18 | hoog |
| [10] | Gemini 3 beeldtokens | [Google media resolution](https://ai.google.dev/gemini-api/docs/media-resolution) | 2026-10-13 | 2026-10-18 | hoog |
| [11] | Gemini `box_2d` | [Google image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) | 2026-09-23 | 2026-10-18 | hoog |
| [12] | GPT-beeldtokens, plaatsbepaling | [OpenAI images & vision](https://developers.openai.com/api/docs/guides/images-vision) | ongedateerd | 2026-10-18 | hoog |
| [13] | Qwen3-VL-tokens | [Qwen3-VL GitHub](https://github.com/QwenLM/Qwen3-VL) | 2025 | 2026-10-18 | middel |
| [14] | Qwen2.5-VL RefCOCO/ODinW | [Qwen2.5-VL rapport](https://arxiv.org/html/2502.13923) | 2025-02 | 2026-10-18 | middel (oud) |
| [15] | RF100-VL few-shot vs volledig | [RF100-VL](https://arxiv.org/abs/2505.20612) | 2025-10 | 2026-10-18 | middel (oud) |
| [16] | rangorde VLM-detectie 2026 | [Roboflow blog](https://roboflow.com/blog/vision-language-model-benchmarks) | 2026-08-04 | 2026-10-18 | middel |
| [17] | logo-keuze VLM's 67–72% | [Logo-VGR](https://arxiv.org/html/2509.25811v1) | 2025-09 | 2026-10-18 | middel |
| [18] | klein detail → uitsnijden helpt | [ViCrop, ICLR 2025](https://arxiv.org/pdf/2502.17422) | 2025-02 | 2026-10-18 | middel |
| [19] | logo-benchmark EfficientNet vs CLIP | [Robotoff embedding-benchmark](https://openfoodfacts.github.io/robotoff/research/logo-detection/embedding-benchmark/) | ±2022 | 2026-10-18 | middel (oud) |
| [20] | DINOv3 vs SigLIP 2 instance-retrieval | [DINOv3-paper](https://arxiv.org/html/2508.10104) | 2025-08 | 2026-10-18 | middel |
| [21] | productretrieval gelijkspel | [nyris benchmark](https://benchmark.nyris.io/models) | 2026 | 2026-10-18 | laag (belanghebbend) |
| [22] | DINOv3-licentie, S/16 21,6M | [DINOv3 ViT-S/16 kaart](https://huggingface.co/facebook/dinov3-vits16-pretrain-lvd1689m) | 2025-08 | 2026-10-18 | middel |
| [23] | SigLIP 2 Apache-2.0 | [SigLIP 2 B/16-384 kaart](https://huggingface.co/google/siglip2-base-patch16-384) | 2025-02 | 2026-10-18 | hoog |
| [24] | PE-Core Apache-2.0 | [PE-Core B/16 kaart](https://huggingface.co/facebook/PE-Core-B16-224) | 2025-04 | 2026-10-18 | hoog |
| [25] | OFF-detector YOLOv8s, AGPL, recall 0,719 | [OFF universal-logo-detector](https://huggingface.co/openfoodfacts/universal-logo-detector) | 2025-11 | 2026-10-18 | hoog |
| [26] | OFF-pijplijn detector → CLIP → ANN → mens | [OFF-blog logo's](https://blog.openfoodfacts.org/en/news/how-open-food-facts-uses-logos-to-get-information-on-food-products) | 2023-02 | 2026-10-18 | middel (oud) |
| [27] | aparte Nutri-Score-modellen, archivering | [robotoff-models](https://github.com/openfoodfacts/robotoff-models) | 2025-10 | 2026-10-18 | hoog |
| [28] | Ultralytics-licentiestandpunt | [Ultralytics license](https://www.ultralytics.com/license) | 2026 | 2026-10-18 | middel |
| [29] | ≥1.500 beelden per klasse | [Ultralytics trainingstips](https://docs.ultralytics.com/yolov5/tutorials/tips_for_best_training_results/) | ongedateerd | 2026-10-18 | middel |
| [30] | RF-DETR Apache-2.0, AP 57,7–62,2 | [RF-DETR GitHub](https://github.com/roboflow/rf-detr) | 2026-10 | 2026-10-18 | hoog |
| [31] | tegelen +5–7 AP | [SAHI](https://arxiv.org/abs/2202.06934v1) | 2022 | 2026-10-18 | middel (oud) |
| [32] | YOLO11 CPU-tijden | [Ultralytics YOLO11](https://docs.ultralytics.com/models/yolo11/) | ongedateerd | 2026-10-18 | laag |
| [33] | NutriGreen 10.472 beelden | [NutriGreen, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11002244/) | 2024-03 | 2026-10-18 | middel |
| [34] | taalsupervisie leest tekst beter | [CLIP vs DINO, EMNLP 2025](https://arxiv.org/html/2510.11835v1) | 2025-10 | 2026-10-18 | middel |
| [35] | OWLv2 Apache-2.0 | [OWLv2 kaart](https://huggingface.co/google/owlv2-base-patch16-ensemble) | ongedateerd | 2026-10-18 | middel |
| [36] | YOLOE AGPL, YOLO-World GPL | [YOLOE](https://github.com/THU-MIG/yoloe) · [YOLO-World](https://github.com/AILab-CVC/YOLO-World) | 2025 | 2026-10-18 | hoog |

## 9. Houdbaarheid

> [!warning] Tarieven verouderen snel
> Houdbaarheidsvensters: tarieven 3 mnd, landschap 3 mnd, versies 1 mnd, prestaties/patronen 24 mnd. Al verouderd: de Robotoff-logobenchmark [19] (±2022) en de OFF-detectorversie [25] (2025-11) — gebruikt als patroonbewijs, niet als actuele stand. Eerstvolgende hercontroles: Roboflow-rangorde [16] 2026-11-04, RF-DETR-versie [30] 2026-11-16, tarieven [6][7][9] 2027-01-16 — maar Gemini Flash al vóór 2027-01-01 (prijsstap [9]). Een keuzeverslag ouder dan twee kwartalen eerst verversen. Werkmateriaal: `onderzoek/.memlog.md` en `onderzoek/digests/`.
