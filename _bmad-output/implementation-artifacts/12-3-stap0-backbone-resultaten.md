# Story 12.3 — STAP-0 resultaten: off-the-shelf backbones lossen het NIET op

Datum 2026-06-09 · ML-container · harnas `apps/ml-service/scripts/spike_stap0_backbones.py` · alle 884
GS1-guide-codes (1006 logo's) · artefact `spikes/12-2-region-proposer/stap0-backbones.json`.

## Wat stap-0 toetste

De goedkoopste de-risking vóór training: vervangt een **sterkere kant-en-klare embedding** (nul training)
de zwakke ImageNet-`efficientnet_b0`? Vergeleken: effb0 (baseline, volle 1280-dim), convnext_tiny, DINOv2
(ViT-S/14), CLIP (ViT-B/32). Plus: kwantificering van het variant-family-plafond.

## Meet-subtiliteit (cruciaal voor de lezing)

`accept@0,75` en `collisie@0,75` zijn **niet vergelijkbaar tussen backbones** — elke backbone heeft een
andere cosine-schaal (CLIP/convnext liggen globaal hoger, dus méér kruist 0,75, zowel terecht als
onterecht). De **schaal-invariante** maat is **top-1-rang** (is de juiste referentie de dichtstbijzijnde,
drempelvrij). Daarop vergelijken we.

## Resultaten

| backbone | dim | **top-1 (eerlijk)** | same-family-plafond | accept@0,75 (confounded) | self-cos p50 |
|---|---:|---:|---:|---:|---:|
| **effb0 (baseline)** | 1280 | **0,605** | 0,139 | 0,295 | 0,678 |
| convnext_tiny | 768 | 0,557 | 0,163 | 0,398 | 0,763 |
| dinov2 (ViT-S/14) | 384 | 0,560 | 0,181 | 0,388 | 0,743 |
| clip (ViT-B/32) | 512 | 0,495 | 0,192 | 0,490 | 0,830 |

## Conclusies

1. **Geen enkele sterkere off-the-shelf-backbone verslaat de baseline op rang.** effb0 = 60,5 % top-1;
   DINOv2/CLIP zijn **slechter**. De hogere accept@0,75 van CLIP/convnext is een **cosine-schaal-artefact**
   (bevestigd door hun hógere collisie bij dezelfde poort), geen echte scheiding. → **De goedkope
   ontsnapping bestaat niet.** Keurmerk-marks zijn grafisch/lijnwerk, niet de natuurlijke-beeld-semantiek
   waar DINOv2/CLIP in uitblinken.
2. **Fine-tuning is dus bevestigd nodig** (niet vervangbaar door een backbone-swap). Het 12.3-pad gaat
   door naar **metric-learning op keurmerk-marks** — nu mét bewijs dat de gratis route faalt.
3. **Variant-family-plafond = robuust ~14–19 %** over álle backbones (effb0 13,9 %). Een reëel maar
   begrensd plafond → bevestigt de top-N-aanpak (mik op het scheidbare ~80 %, variant-families apart).
4. **Klein gratis winstje:** volle 1280-dim effb0 tilt accept van de gedeployde 512-trunc (24 %) naar
   ~30 % — de truncatie weghalen is een kleine, gratis verbetering (geen training), maar niet
   transformerend.

## Correctie op een eerdere claim (eerlijkheidshalve)

Het universe-probe-doc stelde dat de 50 %-collisie "grotendeels herstelbaar" is door een sterkere/
gefine-tunede embedding. Stap-0 toont dat de **off-the-shelf**-variant daarvan **faalt** (rang verbetert
niet). "Herstelbaar" geldt dus alleen nog via **echte fine-tuning** — en dát is **onbewezen** (12.3 moet
het aantonen). Het cross-family-deel (~36 %) is een *trainings*-doel, geen gratis fix; het same-family-
deel (~14 %) is een echt plafond.

## Gevolg voor het plan / go-no-go

- **12.3-stap-0-gate uitkomst:** off-the-shelf ontoereikend → **door naar metric-learning-fine-tuning**
  (duurder, onbewezen). De endpoint (12.5) hangt nu expliciet op het slagen van die fine-tuning.
- Neem het kleine gratis winstje mee: **truncatie 1280→512 verwijderen** (geleerde projectie i.p.v. slice).
- De `spike_stap0_backbones.py`-harnas wordt de meetbank voor de fine-tuning-iteraties (top-1 als
  hoofdmetriek, niet accept@vaste-drempel).

## Caveats

- top-1 op een 400-code-sample met single-augmentatie → ruis op de absolute waarde; de **rangorde tussen
  backbones** (effb0 ≥ rest) is het signaal. Andere CLIP/DINOv2-pooling/lagen niet uitgeput — "off-the-
  shelf zoals hier geconfigureerd" faalt; een diepere tuning-poging is niet bewezen kansloos, maar geen
  gratis winst meer.
- Family-heuristiek (naamgebaseerd) is ruw; ~14–19 % is een orde, geen precies getal.
