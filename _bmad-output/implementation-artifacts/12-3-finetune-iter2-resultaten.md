# Story 12.3 iteratie-2 — resultaat: realistische synthese verslaat de baseline NIET

> **CORRECTIE (2026-06-12, ná deze meting) — de "bevroren-feature-plafond"-conclusie hieronder is
> WEERLEGD.** Een leave-one-out k-NN-probe (`12-3-loo-probe-resultaten.md`) toont dat echte crops
> in ruwe bevroren effb0 wél sterk per klasse clusteren (LOO 87 % micro / 80 % macro; RECYCLABLE
> 100 %). De backbone is dus NIET het plafond — het knelpunt is de **guide-referentie-domeinkloof**
> (echte crops lijken niet op het schone guide-logo). Het iter2-resultaat is een echt *flat*
> (−2,6pt micro ≈ 2 crops, binnen de ruis), maar de oorzaak is verkeerd geduid: de kop trok crops
> naar guide-logo-ruimte — het verkeerde doel. Lees de oorspronkelijke conclusie hieronder met die
> correctie. De koers is nu **echte-crop-referenties**, niet ontdooien/fine-tunen.

Datum 2026-06-12 · ACC ML-container · harnas `apps/ml-service/scripts/spike_finetune_iter2.py` ·
verdict-set 78 echte crops / 24 klassen · artefact `/tmp/iter2-train.json`. **Schoon, eerlijk
flat-to-negatief.** De centrale iter2-hypothese (realistische 8.7-compositing fixt wat naïeve
degradatie brak) is **gefalsifieerd op een bevroren backbone**.

## Opzet (één variabele gewisseld t.o.v. iter1)

Identiek aan iter1 — bevroren effb0 + projectie-kop (1280→1024→512) + supervised-contrastive, zelfde
LR/epochs/K — **behalve de positieven**: `compose_synthetic` (guide-logo op échte artwork-achtergronden,
gecropt naar bbox + 25 % marge zodat het bij de tight echte crops past) i.p.v. naïeve signaal-degradatie.
36 referentie-codes, 60 achtergronden, 216 positieven (252 train-views), 40 epochs.

## Resultaat

| metriek | vóór (effb0) | ná (kop) | Δ |
|---|---:|---:|---:|
| **echte verdict top-1 micro** | **37,2 %** | **34,6 %** | **−2,6pt** |
| **echte verdict top-1 macro** | **48,6 %** | **44,4 %** | **−4,2pt** |

**De kop tráinde wel** — supcon-loss 3,84 → 1,81 (geconvergeerd bij ep10–20). Hij clustert de
synthetische positieven netjes per klasse. **Maar die scheiding transfereert niet** naar de echte
crops; ze verschuift een paar klassen heen en weer (MARINE 0→1,0; V_LABEL_VEGAN 1,0→0,5; NUTRISCORE_B
0,5→0) met een licht negatief netto.

## Lezing — het bevroren-feature-plafond is nu de bewezen bindende beperking

- **iter1 (naïeve degradatie): −15pt. iter2 (realistische compositing): −3pt.** Realisme hielp de
  *richting* sterk (−15 → −3), wat de data-realisme-these bevestigt — maar het komt **niet boven nul**.
- De kop kan de synthetische positieven perfect clusteren (loss daalt) tóch zonder echte-crop-winst →
  **de bevroren effb0-features bevatten de discriminatieve scheiding simpelweg niet** voor de falende
  klassen. Een projectie-kop kan geen scheiding *maken* die in de features ontbreekt; hij kan ze alleen
  herordenen. Stap-0's vermoeden ("bevroren features hebben mogelijk een laag plafond") is nu gemeten.
- **RECYCLABLE blijft 0 %** (26 crops) vóór én ná — de grootste queue-vervuiler is met geen enkele
  bevroren-backbone-synthese-strategie te raken.

## Wat hiermee empirisch is afgesloten

Beide goedkope-tot-matige embedding-routes op een **bevroren backbone** falen nu aantoonbaar:
1. ✗ Naïeve synthese + kop (iter1): −15pt
2. ✗ Realistische compositing + kop (iter2): −3pt

→ Een projectie-kop op bevroren effb0 is **geen** pad naar de AC1-bar (≥ 50 % micro). De resterende
hefbomen zijn allemaal duurder/risicovoller.

## Resterende opties (alle groter; expliciet een gebruikersbeslissing)

| Optie | Wat | Voor | Tegen |
|---|---|---|---|
| **A. Compositing verrijken, kop herhalen** | perspectief-warp, JPEG-blokken, gedeeltelijke occlusie, contrast-matching op de echte achtergrond | goedkoopst; iter2-plan noemt dit de "eerste verdachte" | **bevroren plafond blijft** — verbeterde positieven herordenen dezelfde features; verwacht klein effect |
| **B. Backbone (deels) ontdooien** | laatste effb0-blokken meetrainen (optie C uit 12.3) | doorbreekt het feature-plafond; hoogste capaciteit | **78 echte crops is veel te weinig** om een backbone veilig te fine-tunen → overfit; synthese-only training → backbone leert synthetische artefacten; GPU nodig |
| **C. Echte data oogsten (12.6)** | de opgeschoonde queue (2.154 items ≥ 0,5) door mensen laten bevestigen → tientallen echte crops/klasse | **de fundamentele fix**: lost zowel training- als verdict-schaarste op; maakt B pas veilig | traag; mens-in-de-lus; levert pas over weken genoeg per klasse |

**Eerlijke aanbeveling:** B (ontdooien) op de huidige 78-echte-crops-met-synthese-only-training is
**hoog-risico op overfit** en waarschijnlijk weggegooid werk vóór C levert. De volgorde met de hoogste
verwachte waarde is **C → B**: eerst de queue-harvest (12.6) opvoeren tot tientallen echte crops per
klasse, dán de backbone ontdooien met die echte data als anker. A is goedkoop maar het bevroren plafond
maakt een materiële sprong onwaarschijnlijk. De interim queue-filter (12-06) houdt het systeem
ondertussen bruikbaar.

## Reproductie
```bash
ML=$(ssh vanilla "docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow'")
ssh vanilla "docker exec $ML mkdir -p /app/scripts && docker cp /tmp/spike_finetune_iter2.py $ML:/app/scripts/ && docker cp /tmp/verdict-78.json $ML:/tmp/"
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/spike_finetune_iter2.py --verdict /tmp/verdict-78.json --backgrounds 60 --kpos 6 --epochs 40 --out /tmp/iter2-train.json"
```
