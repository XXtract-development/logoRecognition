# Epic 12 — Universe-recognizability probe: "kunnen de meeste keurmerken herkend worden?"

Datum 2026-06-09 · ML-container (echte `efficientnet_b0`-embedding, IMAGENET1K_V1) ·
harnas `apps/ml-service/scripts/spike_universe_separability.py` · data: alle GS1-guide-logo's
(extractie `extract_gs1_label_guide.py` → **884 codes / 1006 logo's**). Artefact:
`spikes/12-2-region-proposer/universe-recognizability.json`.

## Kernonderscheid: *trainbaar* ≠ *herkenbaar*

- **Trainbaar (data bestaat): JA, vrijwel volledig.** 884 van de 894 T3777-codes hebben een
  officieel guide-logo (1006 beelden, 96 codes met varianten, 804 < 200px). Met 8.7-synthese is per
  code positieve trainingsdata te genereren. → de bibliotheek is te seeden / te trainen voor bijna de
  hele universe (long tail = zware few-shot: vaak één referentie/code).
- **Herkenbaar (met de huidige embedding): NEE.** Twee meetassen, beide gemeten op de echte embedding:

### A. Inter-code-collisie (schone ref vs schone ref) — harde ondergrens op onherkenbaarheid
Voor elke code: dichtstbijzijnde logo van een **andere** code.

| cosine-drempel | codes met een andere-code-buur | fractie universe |
|---:|---:|---:|
| ≥ 0,80 | 301 | 34 % |
| **≥ 0,75 (operationele poort)** | **448** | **50,7 %** |
| ≥ 0,70 | 608 | 68,8 % |
| ≥ 0,65 | 725 | 82 % |

Mediane dichtstbijzijnde-andere-code-cosine = **0,747** — d.w.z. het *typische* keurmerk ligt
qua officieel logo op ~0,75 (de poort) van een ánder keurmerk **op déze embedding**.

**Onderscheid (nu gemeten — zie `12-3-stap0-backbone-resultaten.md`):** de 50,7 % collisie splitst in:
- **~14 % same-family-plafond** (variant-families: FSC MIX/100%/RECYCLED, kosher/halal-varianten,
  BETER_LEVEN-sterren, V-Label vegan/vegetarian). Een **echt plafond** — blijft moeilijk, óók met een
  perfecte embedding. Robuust ~14–19 % over alle geteste backbones.
- **~36 % cross-family** = embedding-zwakte. **Maar NIET gratis fixbaar:** stap-0 toont dat een sterkere
  *off-the-shelf*-backbone (DINOv2/CLIP) de rang **niet** verbetert (effb0 blijft beste op top-1). De
  cross-family-collisie is dus een **trainings-doel** (metric-learning op keurmerk-marks), géén
  backbone-swap-fix — en het slagen daarvan is **onbewezen**.

Eerdere formulering "grotendeels herstelbaar door een sterkere embedding" is hiermee bijgesteld: alleen
via échte fine-tuning, niet via off-the-shelf; ~14 % is een hard plafond. Drempel-tuning alléén lost
niets op.

### B. Vervormde-crop → referentie (query-zijde, de as die op herkenning slaat)
Elk schoon logo vervormd tot een artwork-achtige crop (downscale/blur/JPEG/rotatie), embed, gematcht
tegen de 884-code-bibliotheek.

> ⚠️ **Proxy — indicatief, ongekalibreerd. Lees deze getallen NIET als harde meting.** De vervorming is
> synthetisch (downscale/blur/JPEG/rotatie), één sample per code, en mist occlusie/mono-inkt/perspectief.
> De gold-4-anker zwaait sterk: synthetische GREEN_DOT 0,825 vs reëel ~0,69 (mijn vervorming was hier
> *milder* dan de realiteit → de accept kan **optimistisch** zijn, niet alleen "bovengrens"). Gebruik
> deze as voor **richting**, niet voor cijfers; de harde getallen zijn collisie-A en de echte 17 % op
> 4 klassen.

| Metriek (proxy, indicatief) | Waarde | Lezing |
|---|---:|---|
| self-cosine p50 (crop ↔ eigen ref) | ~0,65 | ónder de 0,75-poort; in de orde van de echte ~0,69 |
| top-1-accuratesse (juiste code dichtstbij) | ~58 % | rangschikking dráágt signaal |
| accept @ 0,75 | ~24 % | richtinggevend; door proxy-ruis zowel over- als onderschat mogelijk |

Richting: crops liggen onder de poort, ranking is redelijk. **Maar een sterkere off-the-shelf-embedding
wint hier niet** (stap-0: effb0 60,5 % top-1 ≥ DINOv2/CLIP) → "een betere embedding kan veel winnen"
geldt alleen via échte fine-tuning, onbewezen. Het *getal* 24 % is zacht (synthetisch, single-sample);
de robuuste herkennings-meting blijft de **17 % op 4 echte klassen**.

## Antwoord op de vraag

**De meeste keurmerken zijn met deze epic wél te trainen, maar worden met de huidige (zwakke,
ongetrainde) embedding níét betrouwbaar herkend.** Het knelpunt zit op **beide embedding-assen** —
inter-klasse-marge (collisie) én intra-klasse-spreiding (crop→referentie). Van de 50,7 % collisie is
**~14 % een echt variant-family-plafond** en **~36 % embedding-zwakte** — maar die zwakte is **niet
gratis te fixen**: stap-0 toont dat sterkere off-the-shelf-backbones (DINOv2/CLIP) níét beter ranken dan
de baseline. Herstel kan dus alleen via **echte fine-tuning** (12.3), en dat is **onbewezen**. Robuuste
cijfers: **collisie 50,7 %** (schone data), **same-family-plafond ~14 %**, en **17 % accept op de 4
gold-klassen met echte crops**; de universe-brede 24 %/58 % uit proxy B
zijn richtinggevend (synthetisch), geen hard getal.

**Reden voor optimisme / pragmatisch pad:**
1. De rangschikking dráágt signaal (top-1 57,6 % op 884 klassen) — metric-learning is precies bedoeld
   om marge te vergroten en spreiding te verkleinen; de 12.3-stap-0 (sterkere off-the-shelf-backbone
   als DINOv2/CLIP) kan dit al deels oplossen vóór er getraind wordt. Deze probe ís die meting,
   gedraaid op de zwakke baseline.
2. **Richt niet op alle 884.** De declaratie-frequentie is sterk geconcentreerd: een handvol codes
   (GREEN_DOT 11.169, RECYCLABLE 8.643, TRIMAN 3.886, …) domineert het volume; de lange staart (850+
   codes) wordt zelden gedeclareerd. Brede dekking betekent in de praktijk **de top-N-meest-
   gedeclareerde keurmerken** (tientallen) betrouwbaar krijgen — een veel kleiner, haalbaarder doel.
   12.1 dekt er al 10; de embedding-slag (12.3) bepaalt of die tientallen herkenbaar worden.

## Caveats
- Vervormingsproxy (B) is synthetisch; per-code single-sample → ruis. Richting robuust, exacte %
  zacht. De collisie-meting (A) is schone data, geen proxy — die 50,7 % staat hard.
- Gemeten op de huidige `efficientnet_b0`; zegt niets over wat een sterkere backbone/fine-tuning haalt
  (dat is 12.3-stap-0/fine-tuning). Dit is de **baseline waartegen 12.3 zich moet bewijzen**.
