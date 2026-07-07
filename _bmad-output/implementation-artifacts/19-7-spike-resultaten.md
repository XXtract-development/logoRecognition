# Story 19.7 — Spike-resultaten: twee-traps-bootstrap-recall

Datum: 2026-07-06 · read-only op ACC (ml-container), geen writes · Verdict: **GO**

## Kernmeting (AC1 — fase 2 ranking): bewezen 44% → 100%

Leave-one-GTIN-out top-1 over de gold_set echte crops (75 crops, 4 klassen), rangschik-pool = 43 gids-logo-klassen + de echte crops. Conditie A = alleen gids-logo; conditie C = gids + echte crops (min dezelfde-GTIN-crops). Productie-embedding (`efficientnet_b0` ImageNet, 512-dim), GEEN training.

| Klasse | n | A: gids-only | C: gids+crops-ranking |
|--------|---|--------------|-----------------------|
| GREEN_DOT | 42 | 15 (36%) | **42 (100%)** |
| FOREST_STEWARDSHIP_COUNCIL_MIX | 17 | 10 (59%) | **17 (100%)** |
| EUROPEAN_V_LABEL_VEGAN | 13 | 8 (62%) | **13 (100%)** |
| EU_ORGANIC_FARMING | 3 | 0 (0%) | **3 (100%)** |
| **MICRO** | **75** | **33 (44%)** | **75 (100%)** |

**Bevestigt de 12.3-POC op live-data:** zodra een klasse echte crops heeft, tilt nearest-reference-RANKING de recall dramatisch (GREEN_DOT 36%→100%, EU_ORGANIC 0%→100%). Het gids-logo alleen is te ver van echte crops; echte crops van hetzelfde logo clusteren strak. Dit is precies het mechanisme dat de "volle kraan" levert.

## Fase-1 realiteit + precisie (AC2/AC3) — bevindingen uit de data

- **Lege-klasse-startprobleem is echt en bevestigd.** Van de doel-startklassen hebben **RECYCLABLE_GENERAL_CLAIM en TRIMAN 0 echte crops in de gold_set** (hun gold_set-records zijn VALS/afgekeurd — RECYCLABLE is de flood-klasse). Slechts 4 klassen hebben echte crops. Dus fase 2 kan pas draaien ná fase 1 (eerste crops zaaien) — de kip-ei die de twee-traps-aanpak adresseert.
- **Fase-1 recall (gids-only) = ~20-28%** (meting 2026-07-06, case-file) — genoeg om per klasse enkele eerste crops te zaaien, mits die door de human-review/quarantaine bevestigd worden vóór ze referentie worden.
- **Precisie beschermd (eerdere proof.py-meting):** de 19.5-guard doorzoekt alleen declarerende producten → kruis-vals-positieven (de gemeten 10,6% cross-product) kunnen in productie niet ontstaan. Gold-set + dedup + cap blijven het vangnet.

## Eerlijke beperkingen
- De 100% is gemeten op 4 "nette" klassen (GREEN_DOT/FSC/V-Label/organic) die AL echte crops hebben. **RECYCLABLE/TRIMAN — flood-gevoelig, generieke symbolen, géén echte crops — zijn NIET getest** en blijven de moeilijke staart (universe-probe: variant-family-collisies ~14% hard plafond).
- Fase-2 meet de discriminatie-as (crop → juiste klasse). De localisatie-as (crop vínden in lege-klasse-artwork) blijft fase-1-afhankelijk (~20-28%).

## Verdict: GO — bouw de twee-traps-bootstrap

De kern is bewezen: ranking met echte crops = de volle kraan (100% op de geteste klassen). De aanpak vergt geen nieuwe training.

### Implementatie-story-voorstel (vervolg, aparte story)
1. **Schakelmoment per klasse:** heeft de klasse < k (bijv. 3) actieve echte referenties → **fase 1** (huidige gids-bootstrap, lage bar, human-review bevestigt); heeft ze ≥ k → **fase 2** (nearest-reference-ranking tegen de echte crops i.p.v. absolute cosine tegen het gids-zaad).
2. **Ranking-pad:** in `bootstrap_search.py`/de nominatie: bij ≥k refs een gevonden crop accepteren als de nearest reference dezelfde klasse is (met marge), i.p.v. de absolute-drempel-poort. Conditie C (echte crops + gids als fallback).
3. **Harvest-koppeling:** `queue_harvest` als doorlopende echte-crop-bron die klassen over de k-drempel tilt.
4. **Vangnet ongewijzigd:** guard (19.5), gold-set-regressie, dedup, cap.
5. **Scope:** top-N volume-keurmerken; RECYCLABLE/TRIMAN apart valideren zodra ze eerste echte crops hebben (mogelijk intrinsiek moeilijker).
6. **19.6 (drempel/gate) blijft nodig** als fase-1-enabler (zet het straaltje aan zodat er überhaupt eerste crops komen).

## Reproductie
Read-only probes: `scratchpad/rank.py` (+ `rank_input.json` uit gold_set-export), `docker exec -w /app -e PYTHONPATH=/app <ml> python /tmp/rank.py`. Geen writes.
