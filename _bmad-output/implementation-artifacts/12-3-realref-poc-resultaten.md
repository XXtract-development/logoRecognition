# Story 12.3 — POC bevestigd: echte-crop-referenties verdubbelen top-1 (geen training)

Datum 2026-06-12 · ACC ML-container · harnas `apps/ml-service/scripts/spike_iter2_realref_poc.py` ·
verdict-set 78 crops, eval op de 12 klassen met ≥2 GTINs (62 crops) · artefact `/tmp/iter2-realref.json`.
**Meet-only, geen productie-mutatie.** Productie-embedding (model_manager, 512-dim). Strikte
**leave-one-GTIN-out**: de hele GTIN van een query staat nooit in de referenties (geen near-dup-inflatie).

## Resultaat

| conditie | micro | macro |
|---|---:|---:|
| **A. guide-logo only** (huidige productie) | **0,371** | **0,597** |
| **B. echte-crop-refs** (GTIN-holdout) | **0,790** | **0,664** |
| **C. echte-crops + guide** (productie-achtig) | **0,806** | **0,692** |

**Micro top-1 verdubbelt: 37 % → 81 %.** RECYCLABLE_GENERAL_CLAIM gaat **0 % → 100 %** — zelfs met
z'n eigen GTIN weggehouden (referenties = de andere 2 GTINs). De grootste queue-vervuiler (53 %) is
hiermee herkenbaar. Conditie **C (echte crops mét het guide-logo als fallback) is de beste** en de
juiste productie-vorm.

## Eerlijke lezing — micro is RECYCLABLE-gedomineerd; macro is het conservatieve cijfer

- **Micro 37→81** wordt opgetrokken door RECYCLABLE (26/62 eval-crops). De **macro 60→69 (+9,5pt)** is
  de eerlijkere per-klasse-winst — solide, maar minder spectaculair dan de micro-verdubbeling.
- **Echte-crop-refs zijn niet voor elke klasse beter.** Met dúnne cross-GTIN-data regresseren enkele
  klassen in conditie B: GREEN_DOT 0,67→0,00, V_LABEL_VEGAN 1,0→0,5, BETER_LEVEN 1,0→0,8. Conditie C
  (beide) herstelt de meeste (GREEN_DOT terug op 0,67 via het guide-logo) → **daarom altijd guide +
  echte crops samen**, nooit echte crops alleen. V_LABEL_VEGAN (0,5) en BETER_LEVEN (0,8) blijven in C
  iets onder hun guide-score — die klassen hebben weinig, ruisige cross-GTIN-crops.
- **FREE_FROM_GLUTEN blijft 0 %** in alle condities — een intrinsiek moeilijke/diverse klasse; echte
  refs lossen 'm (nog) niet op.
- **Statistisch licht**: 12 klassen, 62 crops, sommige met 2 GTINs. De richting (echte refs ≫ guide,
  vooral voor de queue-zware klassen) is robuust; exacte per-klasse-getallen zijn indicatief.

## Conclusie & productie-implementatie

De fix is **bewezen en goedkoop**: registreer bevestigde echte crops als **referentie-embeddings**
(conditie C: náást het guide-logo, niet in plaats van), herbouw de referentie-index. Geen training,
geen backbone-wijziging. Infrastructuur bestaat: `reference_embeddings` + `rebuild_reference_embeddings`
(12.1) + de 8.6-registratie-/herkomst-keten.

**Voorgestelde uitrol (incrementeel, omkeerbaar):**
1. Voeg de bevestigde echte crops (active=true training_data) toe als referentie-embeddings per klasse,
   met herkomst-tag, **náást** de bestaande guide-logo-referenties. Begin met de queue-zware klassen.
2. Herbouw de referentie-index; her-meet top-1 op de GTIN-holdout-split (deze harnas) als regressie-poort.
3. **Dedup de bestaande guide-referenties** (146 vec/38 logo's; FAIRTRADE 3×) — los nut, vermindert bias.
4. **12.6-harvest** uit de opgeschoonde queue voert echte crops/GTINs per klasse op → betere refs +
   eerlijker eval (leave-one-GTIN-out wordt sterker naarmate er meer GTINs/klasse zijn).
5. **Open-set-drempel her-ijken**: echte refs liggen dichter bij echte queries (hogere cosine) → de
   0,75-drempel kan strenger/anders; meet precisie-behoud (geen valse accepts) ná de ombouw.

Fine-tuning/backbone-ontdooien blijft **van tafel** — de embedding was nooit het probleem.

## Reproductie
```bash
ML=$(ssh vanilla "docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow'")
ssh vanilla "docker exec $ML mkdir -p /app/scripts && docker cp /tmp/spike_iter2_realref_poc.py $ML:/app/scripts/ && docker cp /tmp/verdict-78.json $ML:/tmp/"
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/spike_iter2_realref_poc.py --verdict /tmp/verdict-78.json --out /tmp/iter2-realref.json"
```
