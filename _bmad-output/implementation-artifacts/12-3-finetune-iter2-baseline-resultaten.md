# Story 12.3 iteratie-2 — STAP 1 resultaat: effb0-baseline op de bredere verdict-set

Datum 2026-06-12 · ACC ML-container · harnas `apps/ml-service/scripts/spike_iter2_baseline.py` ·
verdict-set = 78 schone echte crops / 24 klassen (`active=true`, dedup op `crop_path`) · artefact
`/tmp/iter2-baseline.json` (op de container). **Read-only**, geen DB/storage-mutatie.

Dit is **de bar die iter2 moet verslaan**. Metriek = top-1 rang (drempelvrij, schaal-invariant;
stap-0 wees accept@0,75 af als backbone-confounded).

## Kerncijfers — de gedeployde effb0 (512-dim)

| metriek | waarde |
|---|---:|
| **micro top-1** (per crop, RECYCLABLE-gedomineerd 26/78) | **35,9 %** |
| **macro top-1** (per klasse, hoofdcijfer) | **46,5 %** |
| micro top-5 | 35,9 % |
| macro top-5 | 46,5 % |
| mediaan cosine van de júíste match | 0,766 |
| p25 cosine van de juiste match | 0,684 |
| zoekruimte | 146 referentie-vectoren / 36 codes / 38 reference_logos |

Vergelijk iter1 (4 klassen): effb0 echte top-1 = 37,3 %. Op 24 klassen: micro 35,9 % — zelfde orde,
nu met brede klasse-dekking. De macro 46,5 % ligt hoger doordat enkele makkelijke single-crop-klassen
(TRIMAN, NUTRISCORE_C, V_LABEL_VEGAN…) op 100 % staan met n=1.

## Drie bevindingen die iter2 scherpstellen

### 1. Het faalpatroon is BIMODAAL — top-5 voegt exact NUL toe
micro/macro top-5 == top-1 tot op de komma. Er is **geen enkele crop waar de juiste code rang 2–5 is**:
de embedding zet 'm op #1 óf de juiste referentie valt buiten de top-5. Dit is geen "net-tweede"-
probleem maar "verkeerde buur, ver weg" — precies waar inter-klasse-marge (metric-learning) voor is.
Bevestigt de 12.2-diagnose op een bredere set.

### 2. RECYCLABLE_GENERAL_CLAIM = 0 % op 26 crops — de hoogste hefboom
De klasse die **53 % van de review-queue** overspoelde (3.536 items) én **de meeste bevestigde echte
crops** heeft (26/78) wordt **nooit** correct herkend. Alle 26 crops matchen FAIRTRADE_COCOA (24) of
ALLERGYCERTIFIED (2) als top-1, op **mediaan cosine 0,196** — d.w.z. de embedding heeft er geen idee
van (in productie → UNKNOWN, want < 0,75). **De RECYCLABLE-referentie bestaat wél** in de actieve
bibliotheek (4 rijen, gs1-guide, mét embedding) → dit is **pure embedding-zwakte, geen ontbrekende
referentie**. Iter2 moet RECYCLABLE bovenaan zetten: het is de grootste queue-vervuiler én het
slechtst herkende. Kanttekening: "general recyclable claim" omvat visueel diverse recycling-symbolen;
een deel van de moeilijkheid kan intrinsieke klasse-diversiteit zijn (één guide-referentie dekt de
visuele spreiding mogelijk niet) — meet bij iter2 of synthese-variatie dit dicht.

### 3. Referentie-oververtegenwoordiging vertekent de nearest-neighbor (goedkope hygiëne-fix)
`reference_embeddings` = **146 vectoren over 38 logo's** (~3,8/logo). FAIRTRADE_COCOA heeft **3
reference_logos** (≈12 embedding-vectoren) vs **1** voor de meeste codes → 3× meer kans om de nearest
neighbor te zijn. Dat versterkt aantoonbaar de RECYCLABLE→FAIRTRADE-misclassificatie. Een dedup/
rebalance van de referentiebibliotheek is een **goedkope, deels van fine-tuning onafhankelijke**
verbetering (raakt precisie/bias, niet de onderliggende embedding-scheiding). Los van 12.3 te doen.
*Let op:* dedup verandert de zoekruimte → her-meet de baseline ná dedup vóór je het als iter2-winst leest.

## Per-klasse (uittreksel)

| klasse | n | top-1 |
|---|---:|---:|
| RECYCLABLE_GENERAL_CLAIM | 26 | **0,00** |
| BETER_LEVEN_1_STER | 5 | 1,00 |
| RAINFOREST_ALLIANCE_PEOPLE_NATURE | 4 | 0,75 |
| WEIDEMELK | 4 | 0,75 |
| NUTRISCORE_B | 4 | **0,00** |
| NUTRISCORE_E | 3 | **0,00** |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 3 | 1,00 |
| CONFORMITE_EUROPEENNE | 3 | 1,00 |
| FREE_FROM_GLUTEN | 3 | 0,00 |
| PREGNANCY_WARNING | 3 | 0,00 |
| (single-crop klassen) | 9×1 | 3/9 correct |

Nutri-Score-varianten (B, E) op 0 % = de variant-family-verwarring (stap-0: ~14–19 % family-plafond);
A–E lijken grafisch sterk op elkaar.

## Caveats

- **Zoekruimte = 36 codes / 146 vectoren, niet de 894-universe.** Naarmate de bibliotheek groeit
  (12.1-seeding) komen er meer confusers → deze baseline-top-1 is **optimistisch** t.o.v. het brede-
  dekkingsdoel. Her-meet bij elke materiële bibliotheek-uitbreiding.
- **Statistisch licht**: 9 klassen met n=1, RECYCLABLE 1/3 van de set. Macro-cijfer is ruisgevoelig;
  een +10pt-sprong is betekenisvol, kleine deltas niet. 12.6-harvesting van de opgeschoonde queue
  verzwaart latere verdicts.

## Volgende stap (iter2 stap 2)

Realistische positieven genereren met 8.7-compositing (`build_synthetic_batch`/`synthesize_for_class`)
voor de verdict-klassen — RECYCLABLE met **expliciete visuele variatie** (meerdere recycling-symbool-
designs) — daarna de identieke iter1-kop trainen en top-1 op deze verdict-set her-meten vs 35,9 %/46,5 %.

## Reproductie
```bash
ML=$(ssh vanilla "docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow'")
# verdict JSON uit de DB:
#   SELECT DISTINCT label, crop_path FROM training_data WHERE active=true AND crop_path IS NOT NULL
ssh vanilla "docker cp /tmp/spike_iter2_baseline.py $ML:/app/scripts/ && docker cp /tmp/verdict-78.json $ML:/tmp/"
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/spike_iter2_baseline.py --verdict /tmp/verdict-78.json --out /tmp/iter2-baseline.json"
```
